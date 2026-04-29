mod commands;

use commands::*;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            fit_inspect,
            fit_verify,
            fit_materialize_owner,
            fit_open_share,
            fit_apply_delta_json_patch,
            fit_create_share,
        ])
        .run(tauri::generate_context!())
        .expect("FIT Tauri bootstrap");
}
