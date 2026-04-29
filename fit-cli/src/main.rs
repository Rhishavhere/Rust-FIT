//! FIT CLI — keygen, generate, inspect, verify, open, apply-delta, share.

use std::fs;

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use clap::{Parser, Subcommand};
use ed25519_dalek::SigningKey;
use fit_core::delta::AttesterType;
use fit_core::{
    apply_json_patch_delta, create_share_envelope, genesis_from_persona, materialize_fit, parse_fit,
    verify_signature,
};
use json_patch::Patch;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use x25519_dalek::StaticSecret;

#[derive(Parser)]
#[command(name = "fit", version, about = "Financial Identity Token — FIT Engine CLI")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Generate demo Ed25519 + X25519 keys (master empty until generate).
    Keygen {
        #[arg(short, long, default_value = "demo.keys.json")]
        out: String,
    },
    /// Produce genesis `.fit` and key bundle.
    Generate {
        #[arg(long)]
        persona: String,
        #[arg(short, long, default_value = "out.fit")]
        out: String,
        #[arg(short = 'k', long, default_value = "out.keys.json")]
        keys: String,
    },
    Inspect { fit: String },
    Verify { fit: String },
    Open {
        fit: String,
        #[arg(short = 'k', long)]
        keys: String,
    },
    ApplyDelta {
        fit: String,
        #[arg(short = 'k', long)]
        keys: String,
        #[arg(long)]
        layer: u8,
        #[arg(long)]
        summary: String,
        /// Inline JSON patch (may need careful shell escaping)
        #[arg(long, required_unless_present = "patch_file")]
        patch_json: Option<String>,
        /// Path to a file containing the JSON patch array
        #[arg(long, required_unless_present = "patch_json")]
        patch_file: Option<String>,
        #[arg(long, default_value = "owner")]
        attester: String,
    },
    Share {
        fit: String,
        #[arg(short = 'k', long)]
        keys: String,
        #[arg(long)]
        layers: String,
        #[arg(long)]
        recipient: String,
        #[arg(long, default_value_t = true, num_args = 0..=1, default_missing_value = "true", value_parser = clap::builder::BoolishValueParser::new())]
        live_tracking: bool,
        /// UNIX epoch (`...`) OR RFC3339; omit with `--expires-days`
        #[arg(long)]
        expires_at: Option<String>,
        #[arg(long, default_value = "30")]
        expires_days: i64,
        #[arg(short = 'o', long, default_value = "share.fitshare")]
        out: String,
    },
}

#[derive(Serialize, Deserialize)]
struct StoredKeys {
    ed25519_signing_seed_hex: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    master_secret_hex: Option<String>,
    x25519_static_secret_hex: String,
}

fn load_keys(path: &str) -> Result<StoredKeys> {
    let raw = fs::read_to_string(path).with_context(|| format!("read {}", path))?;
    serde_json::from_str(&raw).with_context(|| format!("parse {}", path))
}

fn short_fit_id(fit_id_bytes: &[u8; 16]) -> String {
    hex::encode(&fit_id_bytes[..6])
}

fn hex_to_32(hex_s: &str) -> Result<[u8; 32]> {
    let raw = hex::decode(hex_s.trim_start_matches("0x")).map_err(|e| anyhow!(e))?;
    raw.try_into()
        .map_err(|_| anyhow!("expected 32 bytes (64 hex chars)"))
}

fn parse_expiry(cli: Option<String>, expires_days: i64) -> Result<i64> {
    if let Some(s) = cli {
        if let Ok(v) = s.parse::<i64>() {
            return Ok(v);
        }
        return chrono::DateTime::parse_from_rfc3339(&s)
            .map(|dt| dt.timestamp())
            .map_err(|e| anyhow!("expires-at parse: {e}"));
    }
    Ok(Utc::now().timestamp() + expires_days * 86400)
}

fn parse_attester(s: &str) -> AttesterType {
    match s.to_ascii_lowercase().as_str() {
        "owner" => AttesterType::Owner,
        "cibil" | "cibilbureau" => AttesterType::CibilBureau,
        "gstn" | "gstnportal" => AttesterType::GstnPortal,
        "itr" | "incometaxportal" => AttesterType::IncomeTaxPortal,
        "mca" | "mcaportal" => AttesterType::McaPortal,
        "bankaa" => AttesterType::BankAA,
        "zerodha" => AttesterType::ZerodhaKite,
        "ca" => AttesterType::ManualCA,
        _ => AttesterType::Owner,
    }
}

fn main() -> Result<()> {
    match Cli::parse().cmd {
        Cmd::Keygen { out } => {
            let mut seed = [0u8; 32];
            rand::thread_rng().fill_bytes(&mut seed);
            let signing = SigningKey::from_bytes(&seed);
            let mut xs = [0u8; 32];
            rand::thread_rng().fill_bytes(&mut xs);
            let xsk = StaticSecret::from(xs);
            let bag = StoredKeys {
                ed25519_signing_seed_hex: hex::encode(signing.to_bytes()),
                master_secret_hex: None,
                x25519_static_secret_hex: hex::encode(xsk.to_bytes()),
            };
            fs::write(&out, serde_json::to_string_pretty(&bag)?)?;
            println!("Wrote keys to {out}");
            println!(
                "Ed25519 pubkey : {}",
                hex::encode(signing.verifying_key().to_bytes())
            );
            println!(
                "X25519 pubkey : {}",
                hex::encode(x25519_dalek::PublicKey::from(&xsk).as_bytes())
            );
        }
        Cmd::Generate {
            persona,
            out,
            keys,
        } => {
            let g = genesis_from_persona(&persona)?;
            fs::write(&out, &g.bytes)?;
            let mut xs = [0u8; 32];
            rand::thread_rng().fill_bytes(&mut xs);
            let xsk = StaticSecret::from(xs);
            let bag = StoredKeys {
                ed25519_signing_seed_hex: hex::encode(g.signing_key.to_bytes()),
                master_secret_hex: Some(hex::encode(g.master_secret)),
                x25519_static_secret_hex: hex::encode(xsk.to_bytes()),
            };
            fs::write(&keys, serde_json::to_string_pretty(&bag)?)?;
            println!("Wrote FIT {out} ({} bytes)", g.bytes.len());
            println!("Wrote secrets {keys} — KEEP PRIVATE");
        }
        Cmd::Inspect { fit } => {
            let raw = fs::read(&fit)?;
            let p = parse_fit(&raw)?;
            let h = &p.header;
            println!("FIT ID (short): {}", short_fit_id(&h.fit_id));
            println!("Display name : {}", h.display_name);
            println!("FIT score    : {}", h.fit_score);
            println!("Layers       : {}", p.layers.len());
            println!("Delta count  : {}", p.deltas.len());
            println!("Owner pubkey : {}", hex::encode(h.owner_pubkey));
        }
        Cmd::Verify { fit } => {
            let raw = fs::read(&fit)?;
            let p = parse_fit(&raw)?;
            verify_signature(&p)?;
            println!("OK — Merkle signature valid");
        }
        Cmd::Open { fit, keys } => {
            let raw = fs::read(&fit)?;
            let p = parse_fit(&raw)?;
            let ks = load_keys(&keys)?;
            let master_hex = ks
                .master_secret_hex
                .ok_or_else(|| anyhow!("keys missing master_secret"))?;
            let master_arr = hex_to_32(&master_hex)?;
            let materialized = materialize_fit(&p, &master_arr)?;
            let map = materialized
                .into_iter()
                .map(|(id, val)| (format!("layer{id}"), val))
                .collect::<serde_json::Map<String, serde_json::Value>>();
            println!(
                "{}",
                serde_json::to_string_pretty(&serde_json::Value::Object(map))?
            );
        }
        Cmd::ApplyDelta {
            fit,
            keys,
            layer,
            summary,
            patch_json,
            patch_file,
            attester,
        } => {
            let ks = load_keys(&keys)?;
            let master_hex = ks
                .master_secret_hex
                .ok_or_else(|| anyhow!("keys missing master_secret"))?;
            let master = hex_to_32(&master_hex)?;
            let seed = hex_to_32(&ks.ed25519_signing_seed_hex)?;
            let sk = SigningKey::from_bytes(&seed);
            let patch_str = match (patch_json, patch_file) {
                (Some(j), _) => j,
                (_, Some(f)) => fs::read_to_string(&f).with_context(|| format!("read {f}"))?,
                _ => anyhow::bail!("provide --patch-json or --patch-file"),
            };
            let patch: Patch = serde_json::from_str(&patch_str).context("patch JSON")?;
            let raw = fs::read(&fit)?;
            let out = apply_json_patch_delta(
                &raw,
                &master,
                &sk,
                layer,
                &patch,
                &summary,
                parse_attester(&attester),
            )
            .map_err(|e| anyhow!("{e}"))?;
            fs::write(&fit, &out)?;
            println!("Updated {fit}");
        }
        Cmd::Share {
            fit,
            keys,
            layers,
            recipient,
            live_tracking,
            expires_at,
            expires_days,
            out,
        } => {
            let ks = load_keys(&keys)?;
            let master = hex_to_32(&ks.master_secret_hex.ok_or_else(|| anyhow!("missing master_secret"))?)?;
            let seed = hex_to_32(&ks.ed25519_signing_seed_hex)?;
            let sk = SigningKey::from_bytes(&seed);
            let mut permitted: Vec<u8> = layers
                .split(',')
                .filter_map(|x| x.trim().parse::<u8>().ok())
                .filter(|&n| (1..=6).contains(&n))
                .collect();
            anyhow::ensure!(!permitted.is_empty(), "--layers parsed empty");
            permitted.sort_unstable();
            permitted.dedup();
            let rp = hex_to_32(&recipient)?;
            let expiry = parse_expiry(expires_at, expires_days)?;
            let raw = fs::read(&fit)?;
            let env = create_share_envelope(&raw, &master, &sk, &permitted, &rp, expiry, live_tracking)
                .map_err(|e| anyhow!("{e}"))?;
            fs::write(&out, env)?;
            println!("Wrote {out}");
        }
    }
    Ok(())
}
