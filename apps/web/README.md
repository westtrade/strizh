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
│   │                      SettingsSheet, EmptyState, AddContactDialog,
│   │                      SubscriptionRequests, UserMenu
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

## Версия в интерфейсе

`src/lib/version.ts` отдаёт `appVersion`, а `vite.config.ts` подставляет его из
корневого `package.json` через `define: __APP_VERSION__`. Показывается в
настройках строкой «версия 0.1.0». Ручной правки в коде нет: `make release`
поднимает версию в `package.json`, и UI получает новую при следующей сборке.

## Меню учётной записи

Клик по своей аватарке в шапке открывает `UserMenu`:

- строка с полным JID без ресурса (`westtrade@jabber.ru`, а не
  `…/strizh-web`) и кнопка копирования;
- кнопка «Выйти» — отключение и возврат на экран входа.

Длинный адрес переносится по точкам, а не растягивает меню: на 390px ширины
меню остаётся в пределах экрана. Копирование идёт через
`navigator.clipboard`, а там, где он недоступен (WebView на `file://`) —
через скрытую textarea. Закрывается по клику вне меню и по Escape.

## Добавление контакта

Кнопка «+» в шапке списка открывает `AddContactDialog`: JID, необязательное
имя, проверка на собственный адрес и на дубликат. После отправки ядро делает
`roster set` и `presence type="subscribe"`, диалог закрывается, чат с новым
контактом открывается сразу.

Входящие заявки складываются в `SubscriptionRequests` над списком — по одной
строке на JID с «Принять» и «Отклонить». Автоприёма нет: пока человек не
ответил, его присутствие никому не отдаётся.

## Команды юнита

```console
$ make dev      # vite dev на 5173
$ make build    # svelte-kit sync && vite build → build/
$ make check    # svelte-kit sync && svelte-check
$ make test     # node --test test/
```

`sync` обязателен перед `build` и `check`: SvelteKit генерирует
`node_modules/$app/tsconfig.json` и типы маршрутов только на этом шаге.
