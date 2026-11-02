//! Точка входа Tauri-приложения.
//!
//! Оболочка намеренно пустая: весь клиент — статический бандл SvelteKit в
//! `build/`, WebView его просто загружает. Нативный слой здесь не нужен, пока
//! не понадобится keychain для пароля или tray-иконка.

// В release-сборке Windows не открывать консоль.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    strizh_lib::run()
}
