//! Библиотека Tauri-оболочки.
//!
//! Задача — открыть окно с локальным статическим бандлом и не мешать клиенту
//! работать. Всё, что делает XMPP, живёт в JS; команды Tauri появятся, когда
//! появится платформенное API (keychain, tray, автозапуск).

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Размер окна зависит от экрана: на маленьких ноутбуках 1280×800
            // окно на весь экран выглядит лучше, чем фиксированное.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_min_size(Some(tauri::LogicalSize::new(360.0, 480.0)));
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("не удалось запустить приложение Стриж");
}
