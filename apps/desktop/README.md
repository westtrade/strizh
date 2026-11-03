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

## Сборка

```console
$ make build ARGS="desktop"     # бинарник, без установщиков
$ make bundle ARGS="desktop"    # + установщики для текущей ОС
```

Результат `build`:

```text
apps/desktop/src-tauri/target/release/strizh        ~3.4 МБ, stripped
```

Результат `bundle` — в `target/release/bundle/`: `.deb` и `.rpm` на Linux
(проверены, по 1.5 МБ), `.dmg` на macOS, `.msi`/`.exe` на Windows.

AppImage на этой машине не собирается: Tauri качает `AppRun` с GitHub и
получает оборванный ответ (`unexpected end of file`). Это сеть, а не проект:
`.deb` и `.rpm` из того же прогона собрались нормально. Повторить позже или
собрать только deb: `make bundle ARGS="desktop --bundles deb"`.

### Что происходит внутри

1. `scripts/build` проверяет, что `cargo` реально запускается;
2. `scripts/_pkgconfig.sh` готовит линковку (см. ниже);
3. `tauri build` вызывает `beforeBuildCommand` — сборку `apps/web` в
   `apps/web/build`, — затем компилирует Rust и упаковывает бандл внутрь
   бинарника.

Фронтенд вшивается в исполняемый файл: отдельный сервер не нужен, окно
открывает `tauri://localhost`.

### Когда dev-пакетов нет

Сборке нужны не заголовки, а линкер: `.pc`-описания и симлинки `libfoo.so`.
Если стоит только рантайм (`libwebkit2gtk-4.1-0`, `libgtk-3-0`), а dev-пакетов
нет — `_pkgconfig.sh` собирает шимы в `~/.cache/strizh/pkgconfig` и линкует
против установленных библиотек. Сборка проходит, но это компромисс: версии в
шимах угаданы, и для релиза нужны настоящие dev-пакеты.

```console
$ sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev \
                   libdbus-1-dev librsvg2-dev build-essential
```

Проверено в этой среде: сборка через шимы проходит, бинарник запускается и
открывает окно 1100×720 с интерфейсом.

### Требования

- `cargo`, `rustc` (в asdf — с назначенной версией; в корне лежит
  `.tool-versions` со строкой `rust 1.99.1`);
- системные библиотеки: `libwebkit2gtk-4.1`, `libgtk-3`, `libsoup-3.0`,
  `libdbus-1`, `librsvg2`.

`scripts/dev` и `scripts/build` проверяют тулчейн и библиотеки **до** запуска
cargo: иначе сборка 240 крейтов заканчивается паникой `libdbus-sys` через
несколько минут.

`make -C apps/desktop check` проверяет то, что не требует компилятора:
конфиг, иконки, наличие собранного фронтенда.

## Что дальше

- Stronghold для пароля вместо localStorage;
- трей-иконка и автозапуск;
- проверка обновлений (`tauri-plugin-updater`).
