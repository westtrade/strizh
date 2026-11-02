# @strizh/web

SvelteKit 3 с `adapter-static`: статический бандл, который грузят браузер,
WebView Tauri и Capacitor. Серверного рендера нет (`ssr = false`), весь клиент
живёт в браузере.

- Каталог: `apps/web/`
- Запуск: `make dev ARGS="web"` из корня или `make -C apps/web dev`
- Сборка: `apps/web/build`

## Структура

```text
src/
├── app.html               оболочка документа
├── app.d.ts               типы window.__TAURI_INTERNALS__, window.Capacitor
├── lib/
│   ├── app.css            палитра и глобальные стили
│   ├── platform.ts        web / desktop / mobile и XMPP-ресурс под платформу
│   ├── storage.ts         учётные записи и черновики в localStorage
│   ├── format.ts          время, JID, инициалы
│   ├── components/        Avatar, LoginScreen, ContactList, ChatView,
│   │                      SettingsSheet, EmptyState
│   └── state/
│       ├── chat.svelte.ts сессия: реактивная проекция событий XMPP
│       └── context.ts     типизированный контекст вместо синглтона
└── routes/
    ├── +layout.ts         prerender = true, ssr = false
    ├── +layout.svelte     создаёт сессию, показывает вход или приложение
    └── +page.svelte       список контактов + переписка
```

## Почему состояние в классе

`ChatSession` — класс с полями `$state`. События XMPP приходят из `@strizh/xmpp-core`
колбэками, и единственное место, где они превращаются в реактивные данные, —
этот класс. Компоненты не знают ни про XML, ни про сокет.

Контекст (`setSession`/`getSession`) вместо импорта синглтона: сессия
пересоздаётся вместе с корневым layout, а не живёт вечно в модуле.

## Команды юнита

```console
$ make dev      # vite dev на 5173
$ make build    # svelte-kit sync && vite build → build/
$ make check    # svelte-kit sync && svelte-check
$ make test     # node --test test/
```

`sync` обязателен перед `build` и `check`: SvelteKit генерирует
`node_modules/$app/tsconfig.json` и типы маршрутов только на этом шаге.
