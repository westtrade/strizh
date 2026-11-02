# @strizh/mobile

Capacitor 8 оболочка над тем же бандлом `apps/web/build`, что и в браузере.
Отдельной мобильной сборки фронтенда нет — иначе два интерфейса разъедутся.

- Каталог: `apps/mobile/`
- Запуск на устройстве: `make dev ARGS="mobile"` (нужен запущенный `make -C apps/web dev`)
- Сборка APK: `make build ARGS="mobile"`
- Копирование бандла без сборки: `make sync ARGS="mobile"`

## Платформа Android

`android/` — обычный gradle-проект, созданный `capacitor add android` и
закоммиченный. Правки в нём переживают `capacitor sync`: тот трогает только
`assets/public` и плагины.

| Что | Где |
| --- | --- |
| appId `app.strizh.mobile`, имя «Стриж» | `capacitor.config.ts` → `android/app/src/main/assets/capacitor.config.json` |
| Иконки и сплэши | `android/app/src/main/res/mipmap-*`, `drawable*` |
| Палитра | `android/app/src/main/res/values/colors.xml` |
| SDK 36, minSdk 24 | `android/variables.gradle` |

Иконки сгенерированы из `apps/web/static/favicon.svg`:
тёмный фон `#0F131A`, янтарный знак.

## Сеть

`server.androidScheme: "https"` — приложение живёт на `https://localhost` в
WebView, и обычный `ws://` из него запрещён. Для реального сервера нужен
`wss://`. Локальный мок `ws://127.0.0.1:5280` в APK не заработает без
`usesCleartextTraffic` — и это осознанно: боевой клиент не должен ходить по
открытому XMPP.

## Сборка без Android Studio

`scripts/build` сам находит SDK и JDK, если они лежат в нестандартном месте:
переменные `ANDROID_HOME` и `JAVA_HOME` подставляются из `~/android-build/`.
В CI их надо задать явно.

## Что дальше

- iOS: `capacitor add ios` (нужен macOS с Xcode);
- Preferences с biometric вместо localStorage для пароля;
- push через `@capacitor/push-notifications` требует серверной части.
