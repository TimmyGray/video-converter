#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose, Engine as _};
use rfd::FileDialog;
use std::fs;

#[tauri::command]
fn save_file_with_dialog(file_name: String, data_base64: String) -> Result<bool, String> {
  let file_path = FileDialog::new().set_file_name(&file_name).save_file();

  let Some(path) = file_path else {
    return Ok(false);
  };

  let bytes = general_purpose::STANDARD
    .decode(data_base64)
    .map_err(|error| format!("Failed to decode file bytes: {error}"))?;

  fs::write(path, bytes).map_err(|error| format!("Failed to write selected file: {error}"))?;

  Ok(true)
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![save_file_with_dialog])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
