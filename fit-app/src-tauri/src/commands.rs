//! Tauri IPC — FIT crypto operations (delegates to `fit-core`).

use ed25519_dalek::SigningKey;
use fit_core::delta::AttesterType;
use fit_core::delta::FitDelta;
use fit_core::{
    apply_json_patch_delta, create_share_envelope, materialize_fit, open_share_envelope,
    parse_fit, verify_signature,
};
use serde::{Deserialize, Serialize};

#[tauri::command]
pub fn fit_read_utf8(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(map_err)
}

fn map_err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn hex_to_32(hex_s: &str) -> Result<[u8; 32], String> {
    let raw =
        hex::decode(hex_s.trim_start_matches("0x")).map_err(|e| format!("hex decode: {e}"))?;
    raw.try_into()
        .map_err(|_| "expected 32 bytes (64 hex chars)".to_string())
}

#[derive(Serialize)]
pub struct DeltaSummary {
    pub delta_id: u32,
    pub summary: String,
    pub timestamp: i64,
    pub layer_affected: u8,
}

#[tauri::command]
pub fn fit_delta_summaries(file_path: String) -> Result<Vec<DeltaSummary>, String> {
    let raw = std::fs::read(&file_path).map_err(map_err)?;
    let parsed = parse_fit(&raw).map_err(map_err)?;
    Ok(summarize_deltas(parsed.deltas))
}

fn summarize_deltas(deltas: Vec<FitDelta>) -> Vec<DeltaSummary> {
    deltas
        .into_iter()
        .map(|d| DeltaSummary {
            delta_id: d.delta_id,
            summary: d.summary,
            timestamp: d.timestamp,
            layer_affected: d.layer_affected,
        })
        .collect()
}

#[derive(Serialize)]
pub struct InspectResult {
    pub fit_id_short: String,
    /// Full UUID bytes as hex — WebSocket relay `fit_id` matches this string.
    pub fit_id_hex: String,
    pub display_name: String,
    pub fit_score: u16,
    pub layer_count: usize,
    pub delta_count: usize,
    pub owner_pubkey_hex: String,
}

#[tauri::command]
pub fn fit_inspect(file_path: String) -> Result<InspectResult, String> {
    let raw = std::fs::read(&file_path).map_err(map_err)?;
    let p = parse_fit(&raw).map_err(map_err)?;
    let h = &p.header;
    Ok(InspectResult {
        fit_id_short: hex::encode(&h.fit_id[..6]),
        fit_id_hex: hex::encode(h.fit_id),
        display_name: h.display_name.clone(),
        fit_score: h.fit_score,
        layer_count: p.layers.len(),
        delta_count: p.deltas.len(),
        owner_pubkey_hex: hex::encode(h.owner_pubkey),
    })
}

#[tauri::command]
pub fn fit_verify(file_path: String) -> Result<(), String> {
    let raw = std::fs::read(&file_path).map_err(map_err)?;
    let p = parse_fit(&raw).map_err(map_err)?;
    verify_signature(&p).map_err(map_err)
}

#[derive(Serialize)]
pub struct MaterializedFit {
    pub layers: serde_json::Map<String, serde_json::Value>,
}

#[tauri::command]
pub fn fit_materialize_owner(
    file_path: String,
    master_secret_hex: String,
) -> Result<MaterializedFit, String> {
    let raw = std::fs::read(&file_path).map_err(map_err)?;
    let p = parse_fit(&raw).map_err(map_err)?;
    let ms = hex_to_32(&master_secret_hex)?;
    let rows = materialize_fit(&p, &ms).map_err(map_err)?;
    let mut map = serde_json::Map::new();
    for (id, val) in rows {
        map.insert(format!("layer{}", id), val);
    }
    Ok(MaterializedFit { layers: map })
}

#[derive(Serialize)]
pub struct MaterializedShare {
    pub layers: serde_json::Map<String, serde_json::Value>,
    pub source_fit_id_short: String,
    /// Full hex of source FIT UUID — relay `SUBSCRIBE` MUST use this (same key as owner's `fit_id_hex`).
    pub source_fit_id_hex: String,
    pub permitted_layers: Vec<u8>,
    pub expires_at: i64,
    pub live_tracking: bool,
}

#[tauri::command]
pub fn fit_open_share(
    file_path: String,
    x25519_secret_hex: String,
) -> Result<MaterializedShare, String> {
    let raw = std::fs::read(&file_path).map_err(map_err)?;
    let sk_bytes = hex_to_32(&x25519_secret_hex)?;
    let xsk = x25519_dalek::StaticSecret::from(sk_bytes);
    let (env, layers) = open_share_envelope(&raw, &xsk).map_err(map_err)?;
    let mut map = serde_json::Map::new();
    for (id, val) in layers {
        map.insert(format!("layer{}", id), val);
    }
    Ok(MaterializedShare {
        layers: map,
        source_fit_id_short: hex::encode(&env.source_fit_id[..6]),
        source_fit_id_hex: hex::encode(env.source_fit_id),
        permitted_layers: env.permitted_layers.clone(),
        expires_at: env.expires_at,
        live_tracking: env.live_tracking,
    })
}

fn parse_attester(s: &str) -> AttesterType {
    match s.to_ascii_lowercase().as_str() {
        "owner" => AttesterType::Owner,
        "cibilbureau" | "cibil" => AttesterType::CibilBureau,
        "gstnportal" | "gstn" => AttesterType::GstnPortal,
        "incometaxportal" | "itr" => AttesterType::IncomeTaxPortal,
        "mcaportal" => AttesterType::McaPortal,
        "bankaa" => AttesterType::BankAA,
        "zerodhakite" => AttesterType::ZerodhaKite,
        "manualca" => AttesterType::ManualCA,
        _ => AttesterType::Owner,
    }
}

#[tauri::command]
pub fn fit_apply_delta_json_patch(
    file_path: String,
    master_secret_hex: String,
    ed25519_seed_hex: String,
    layer_id: u8,
    patch_json: String,
    summary: String,
    attester: String,
) -> Result<(), String> {
    let raw = std::fs::read(&file_path).map_err(map_err)?;
    let ms = hex_to_32(&master_secret_hex)?;
    let seed = hex_to_32(&ed25519_seed_hex)?;
    let sk = SigningKey::from_bytes(&seed);
    let patch: json_patch::Patch =
        serde_json::from_str(&patch_json).map_err(|e| format!("patch json: {e}"))?;
    let att = parse_attester(&attester);
    let updated =
        apply_json_patch_delta(&raw, &ms, &sk, layer_id, &patch, &summary, att).map_err(map_err)?;
    std::fs::write(&file_path, &updated).map_err(map_err)?;
    Ok(())
}

const GROQ_CHAT_URL: &str = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM_PROMPT: &str = r#"You are FIT Copilot — a read-only analyst for the Financial Identity Token (FIT) desktop cockpit.

Rules:
• Use ONLY the CONTEXT_JSON blob and the user's messages. Nothing else counts as factual.
• In recipient/investor mode, treat missing/absent planes as intentionally undisclosed ("not disclosed in this envelope"). Never invent hidden numbers.
• Prefer concise, factual summaries: credit, liquidity, NAV, income GST line, ventures, deltas, relay feed.
• If asked something not answerable from context, say you cannot infer it.
• Do not output shell commands or instructions to mutate the FIT token; you analyze only."#;

#[derive(Debug, Deserialize)]
pub struct AiChatTurn {
    pub role: String,
    pub content: String,
}

fn normalize_env_value(raw: String) -> String {
    raw.trim()
        .trim_matches('"')
        .trim_matches('\'')
        .to_string()
}

fn groq_assistant_text(choice: &serde_json::Value) -> Option<String> {
    let msg = choice.get("message")?;
    let c = msg.get("content")?;
    if let Some(s) = c.as_str() {
        if !s.is_empty() {
            return Some(s.to_string());
        }
    }
    let arr = c.as_array()?;
    let mut out = String::new();
    for part in arr {
        if let Some(t) = part.get("text").and_then(|x| x.as_str()) {
            out.push_str(t);
        } else if let Some(s) = part.as_str() {
            out.push_str(s);
        }
    }
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

fn groq_env_pick(keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Ok(val) = std::env::var(key) {
            let s = normalize_env_value(val);
            if !s.is_empty() {
                return Some(s);
            }
        }
    }
    None
}

/// Groq OpenAI-compatible chat. `fit-app/.env` is loaded in `main.rs` before handlers run.
#[tauri::command]
pub fn fit_ai_chat(history: Vec<AiChatTurn>, context: serde_json::Value) -> Result<String, String> {
    let api_key = groq_env_pick(&["GROQ_API_KEY", "VITE_GROQ_API_KEY"]).ok_or_else(|| {
        "Missing Groq API key — set `GROQ_API_KEY` or `VITE_GROQ_API_KEY` in fit-app/.env and restart.".to_string()
    })?;

    let model = groq_env_pick(&["GROQ_MODEL", "VITE_GROQ_MODEL"])
        .unwrap_or_else(|| "llama-3.3-70b-versatile".to_string());

    let mut ctx_str = serde_json::to_string(&context).map_err(map_err)?;
    const MAX_CTX: usize = 140_000;
    if ctx_str.len() > MAX_CTX {
        ctx_str.truncate(MAX_CTX);
        ctx_str.push_str("…[CONTEXT truncated for model limit]");
    }

    let system_body = format!(
        "{SYSTEM_PROMPT}\n\nCONTEXT_JSON (trusted local materialization only):\n```json\n{ctx_str}\n```"
    );

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(map_err)?;

    let mut msgs: Vec<serde_json::Value> = vec![
        serde_json::json!({ "role": "system", "content": system_body }),
    ];

    for t in history {
        let role = if t.role.to_lowercase() == "assistant" {
            "assistant"
        } else {
            "user"
        };
        msgs.push(serde_json::json!({
            "role": role,
            "content": t.content,
        }));
    }

    let body = serde_json::json!({
        "model": model,
        "messages": msgs,
        "temperature": 0.25,
        "max_tokens": 4096,
    });

    let resp = client
        .post(GROQ_CHAT_URL)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .map_err(|e| format!("Groq request failed: {e}"))?;

    let status = resp.status();
    let txt = resp.text().map_err(|e| format!("read body: {e}"))?;

    if !status.is_success() {
        return Err(format!("Groq HTTP {status}: {txt}"));
    }

    let v: serde_json::Value =
        serde_json::from_str(&txt).map_err(|e| format!("Groq JSON parse: {e} — body head: {:.200}", txt))?;

    let first = v["choices"].get(0).ok_or_else(|| {
        format!("unexpected Groq response (no choices): {}", &txt[..txt.len().min(500)])
    })?;

    let content = groq_assistant_text(first).ok_or_else(|| {
        format!("unexpected Groq response shape: {}", &txt[..txt.len().min(500)])
    })?;

    Ok(content)
}

const AGENT_JSON_SCHEMA: &str = r#"You control the FIT desktop app through structured actions (same cryptography as `fit-cli`).

Output rules:
• Reply with ONE JSON object only. No markdown fences, no text before or after.
• Keys: "message" (string, user-facing) and "actions" (array; use [] if nothing to run).

Each action is one of:
{"type":"create_share","recipient_x25519_pub_hex":"<64 hex chars, or empty string to use context.share_form.recipient_pub>","layers_csv":"<comma-separated layer ids 1-6, no spaces>","expires_days":<positive int>,"live_tracking":<bool>,"investor_display_name":"<optional human name for narration>"}
{"type":"run_verify"}
{"type":"apply_demo_delta","demo_key":"<sellReliance|openFd200k|refreshCibil|fileGstQ1|newAngel>"}

Layer hints for layers_csv:
1 identity · 2 credit/CIBIL/obligations · 3 assets/NAV/portfolio · 4 income/GST/ITR · 5 ventures/investments/trading · 6 attestations/access log.

If the user did not provide a recipient X25519 public key and context.share_form.recipient_pub is empty, set recipient_x25519_pub_hex to "" and explain in message what is needed."#;

fn agent_persona_tail(agent_id: &str) -> &'static str {
    match agent_id {
        "share_desk" => {
            r#"Persona: Share desk — you package selective .fitshare envelopes for investors.
When the user asks to prepare/share/export a package, use create_share with correct layers and expiry.
If they name an investor, put the name in investor_display_name."#
        }
        "delta_desk" => {
            r#"Persona: Delta desk — you run bounded demo JSON-patch deltas (same as the Demo deltas buttons) and verify.
Use apply_demo_delta only with the exact demo_key literals from the schema. Use run_verify when asked about integrity."#
        }
        "audit_desk" => {
            r#"Persona: Audit desk — chain integrity, deltas, and verify. Prefer run_verify for signature/Merkle checks.
Avoid apply_demo_delta unless the user explicitly asks to apply a listed demo patch."#
        }
        _ => {
            r#"Persona: General FIT operator — use actions when they clearly match the user's intent."#
        }
    }
}

/// Agent turn: returns JSON string `{"message":"...","actions":[...]}`. Frontend parses and executes actions via IPC.
#[tauri::command]
pub fn fit_agent_chat(
    history: Vec<AiChatTurn>,
    context: serde_json::Value,
    agent_id: String,
) -> Result<String, String> {
    let api_key = groq_env_pick(&["GROQ_API_KEY", "VITE_GROQ_API_KEY"]).ok_or_else(|| {
        "Missing Groq API key — set `GROQ_API_KEY` or `VITE_GROQ_API_KEY` in fit-app/.env and restart.".to_string()
    })?;

    let model = groq_env_pick(&["GROQ_MODEL_AGENT", "GROQ_MODEL", "VITE_GROQ_MODEL"])
        .unwrap_or_else(|| "llama-3.3-70b-versatile".to_string());

    let mut ctx_str = serde_json::to_string(&context).map_err(map_err)?;
    const MAX_CTX: usize = 120_000;
    if ctx_str.len() > MAX_CTX {
        ctx_str.truncate(MAX_CTX);
        ctx_str.push_str("…[CONTEXT truncated]");
    }

    let persona = agent_persona_tail(agent_id.trim());
    let system_body = format!(
        "{AGENT_JSON_SCHEMA}\n\n{persona}\n\nCONTEXT_JSON:\n```json\n{ctx_str}\n```"
    );

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(map_err)?;

    let mut msgs: Vec<serde_json::Value> =
        vec![serde_json::json!({ "role": "system", "content": system_body })];

    for t in history {
        let role = if t.role.to_lowercase() == "assistant" {
            "assistant"
        } else {
            "user"
        };
        msgs.push(serde_json::json!({
            "role": role,
            "content": t.content,
        }));
    }

    let body = serde_json::json!({
        "model": model,
        "messages": msgs,
        "temperature": 0.1,
        "max_tokens": 2048,
        "response_format": { "type": "json_object" },
    });

    let resp = client
        .post(GROQ_CHAT_URL)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .map_err(|e| format!("Groq request failed: {e}"))?;

    let status = resp.status();
    let txt = resp.text().map_err(|e| format!("read body: {e}"))?;

    if !status.is_success() {
        return Err(format!("Groq HTTP {status}: {txt}"));
    }

    let v: serde_json::Value =
        serde_json::from_str(&txt).map_err(|e| format!("Groq JSON parse: {e} — body head: {:.200}", txt))?;

    let first = v["choices"].get(0).ok_or_else(|| {
        format!("unexpected Groq response (no choices): {}", &txt[..txt.len().min(500)])
    })?;

    let content = groq_assistant_text(first).ok_or_else(|| {
        format!("unexpected Groq response shape: {}", &txt[..txt.len().min(500)])
    })?;

    Ok(content)
}

#[tauri::command]
pub fn fit_create_share(
    file_path: String,
    master_secret_hex: String,
    ed25519_seed_hex: String,
    recipient_x25519_pub_hex: String,
    layers_csv: String,
    expires_unix: i64,
    live_tracking: bool,
    out_path: String,
) -> Result<(), String> {
    let raw = std::fs::read(&file_path).map_err(map_err)?;
    let ms = hex_to_32(&master_secret_hex)?;
    let seed = hex_to_32(&ed25519_seed_hex)?;
    let sk = SigningKey::from_bytes(&seed);
    let mut permitted: Vec<u8> = layers_csv
        .split(',')
        .filter_map(|s| s.trim().parse::<u8>().ok())
        .filter(|&n| (1..=6).contains(&n))
        .collect();
    permitted.sort_unstable();
    permitted.dedup();
    let recipient_pk = hex_to_32(&recipient_x25519_pub_hex)?;
    let envelope = create_share_envelope(
        &raw,
        &ms,
        &sk,
        &permitted,
        &recipient_pk,
        expires_unix,
        live_tracking,
    )
    .map_err(map_err)?;
    std::fs::write(&out_path, &envelope).map_err(map_err)?;
    Ok(())
}
