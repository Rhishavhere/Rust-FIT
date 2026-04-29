//! Sample persona payloads (plaintext layer JSON).

use serde::Deserialize;

use crate::error::{FitCoreError, FitResult};

#[derive(Deserialize)]
struct PersonaDoc {
    display_name: String,
    layers: Vec<serde_json::Value>,
}

fn doc(id: &str) -> &'static str {
    match id.to_ascii_lowercase().as_str() {
        "priya" => include_str!("priya.json"),
        "rajiv" => include_str!("rajiv.json"),
        "arjun" => include_str!("arjun.json"),
        "fatima" => include_str!("fatima.json"),
        _ => "",
    }
}

pub fn persona_layers(persona_id: &str) -> FitResult<(String, [serde_json::Value; 6])> {
    let raw = doc(persona_id);
    if raw.is_empty() {
        return Err(FitCoreError::Other(format!("unknown persona: {persona_id}")));
    }
    let p: PersonaDoc =
        serde_json::from_str(raw).map_err(|e| FitCoreError::Other(e.to_string()))?;
    if p.layers.len() != 6 {
        return Err(FitCoreError::Other(format!(
            "persona {} must have 6 layers",
            persona_id
        )));
    }
    let layers = [
        p.layers[0].clone(),
        p.layers[1].clone(),
        p.layers[2].clone(),
        p.layers[3].clone(),
        p.layers[4].clone(),
        p.layers[5].clone(),
    ];
    Ok((p.display_name, layers))
}
