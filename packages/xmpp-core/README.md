# @strizh/xmpp-core

Ядро Jabber-клиента: XMPP поверх WebSocket, без DOM и без Svelte.

- Каталог: `packages/xmpp-core/`
- Точка входа: `src/index.ts`
- Своих целей не имеет: импортируется приложениями как `@strizh/xmpp-core`.
- Тесты: `make test ARGS="xmpp-core"`

## Что внутри

| Файл | Содержимое |
| --- | --- |
| `src/client.ts` | класс `XmppClient`: соединение, ростер, сообщения, присутствие, подтверждения |
| `src/jid.ts` | разбор JID (RFC 6122), bare-форма, WebSocket-эндпоинт по умолчанию |
| `src/types.ts` | типы домена и события клиента |
| `test/mock-server.ts` | мок XMPP-сервера: SASL PLAIN, биндинг, ростер, пересылка сообщений |

## Модель

`XmppClient` — единственное место, знающее XML. Наружу отдаёт типизированные
события (`status`, `message`, `presence`, `roster`, `chatState`, `error`)
через `on()`, поэтому пакет не тянет фреймворк и одинаково работает в
браузере, WebView Tauri и Capacitor.

```ts
const client = new XmppClient();
client.on('message', (m) => console.log(m.body));
await client.connect({ jid: 'user@example.org', password: '…' });
await client.sendMessage('friend@example.org', 'привет');
```

## Поддержка XEP

- RFC 6121 §2.5 — roster push: изменения списка приходят сами;
- XEP-0085 — индикатор набора;
- XEP-0184 — подтверждения доставки;
- XEP-0203 — время сообщения из `<delay>`;
- XEP-0199 ping — отвечает сервер, клиенту делать нечего.

Не реализовано: MUC (XEP-0045), архивы (XEP-0313), OMEMO (XEP-0384),
Jingle, потоковая передача файлов.

## Мок-сервер

```console
$ bun packages/xmpp-core/test/mock-server.ts
мок XMPP-сервер: ws://127.0.0.1:5280/xmpp-websocket
учётки: anna / boris / vera @localhost, любой пароль
```

Он же используется тестами (`test/protocol.test.ts`): подключение, ростер,
пересылка сообщения, ошибка доставки, отключение.

## Транспорт

Только WebSocket (RFC 7395): TCP/TLS недоступен из WebView. `defaultService`
строит `wss://<домен>:5280/xmpp-websocket`; другой эндпоинт передаётся в
`connect({ service })`.
