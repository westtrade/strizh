# @strizh/desktop

Tauri 2 оболочка: системный WebView открывает статический бандл
`apps/web/build`. Никакой нативной логики, кроме настройки окна, нет.

- Каталог: `apps/desktop/`
- Запуск: `make dev ARGS="desktop"` из корня или `make -C apps/desktop dev`
- Сборка: `make build ARGS="desktop"` → `src-tauri/target/release/strizh`
- Установщики: `make bundle ARGS="desktop"` (`.deb`, `.AppImage` на Linux)

## Как связаны фронтенд и оболочка

`src-tauri/tauri.conf.json`:

| Ключ | Значение | Зачем |
| --- | --- | --- |
| `build.beforeDevCommand` | `cd ../web && ./scripts/dev` | `tauri dev` сам поднимает Vite |
| `build.beforeBuildCommand` | `cd ../web && ./scripts/build` | бандл всегда свежий перед сборкой |
| `build.devUrl` | `http://localhost:5173` | порт зафиксирован `strictPort` в Vite |
| `build.frontendDist` | `../../web/build` | отсчитывается от `src-tauri/` |

CSP разрешает `wss:` и `ws:` в `connect-src`: без этого WebView заблокирует
XMPP-соединение. `ws:` нужен только для локального мок-сервера.

## Иконки

Сгенерированы из `apps/web/static/favicon.svg` в PNG, ICO и ICNS. Пересобрать
после смены знака: `npx @tauri-apps/cli icon ../web/static/favicon.svg`.

## Требования

`cargo`, `rustc` и системные пакеты: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`,
`libsoup-3.0-dev`, `libdbus-1-dev`, `librsvg2-dev`.

`scripts/dev` проверяет их через `pkg-config` **до** запуска cargo: иначе
сборка 240 крейтов заканчивается паникой `libdbus-sys` через несколько минут.
Проверка занимает доли секунды и называет недостающие библиотеки.

Rust через asdf: версия должна быть назначена. В корне репозитория лежит
`.tool-versions` со строкой `rust 1.99.1`; без неё шим `cargo` есть, но
падает с кодом 126 и Tauri не может выполнить `cargo metadata`.

`make -C apps/desktop check` проверяет то, что не требует компилятора:
конфиг, иконки, наличие собранного фронтенда.

## Что дальше

- Stronghold для пароля вместо localStorage;
- трей-иконка и автозапуск;
- проверка обновлений (`tauri-plugin-updater`).
