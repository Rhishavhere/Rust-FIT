mod commands;

use commands::*;

fn load_dotenv_path(path: &std::path::Path) {
    if !path.is_file() {
        return;
    }
    match dotenvy::from_path_override(path) {
        Ok(_) => eprintln!("[fit-app] loaded env from {}", path.display()),
        Err(e) => eprintln!("[fit-app] WARNING: dotenv {}: {e}", path.display()),
    }
}

fn main() {
    // `fit-app/.env` relative to this crate…
    let manifest_parent = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join(".env");
    load_dotenv_path(&manifest_parent);

    // …and from process cwd (npm often runs from fit-app/).
    if let Ok(cwd) = std::env::current_dir() {
        load_dotenv_path(&cwd.join(".env"));
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            fit_read_utf8,
            fit_inspect,
            fit_verify,
            fit_materialize_owner,
            fit_open_share,
            fit_apply_delta_json_patch,
            fit_create_share,
            fit_delta_summaries,
            fit_ai_chat,
        ])
        .run(tauri::generate_context!())
        .expect("FIT Tauri bootstrap");
}
