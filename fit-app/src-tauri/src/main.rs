mod commands;

use commands::*;

fn main() {
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
        ])
        .run(tauri::generate_context!())
        .expect("FIT Tauri bootstrap");
}
