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

## Контакты

```ts
await client.addContact('friend@example.org', 'Друг');   // roster set + subscribe
await client.answerSubscription('friend@example.org', 'subscribed');
await client.removeContact('friend@example.org');        // roster remove + отзыв подписок
```

`addContact` отправляет два пакета, а не один: `iq set` в `jabber:iq:roster`
создаёт запись на сервере, `presence type="subscribe"` просит подписку. Без
второго контакт навсегда останется с серым статусом.

Входящая подписка **не принимается автоматически**. Приходит событие
`subscriptionRequest`, решение принимает человек через `answerSubscription`
(RFC 6121 §3.1.3). Раньше клиент отвечал `subscribed` сам — любой, кто узнал
JID, начинал видеть присутствие владельца учётки.

## Поддержка XEP

- RFC 6121 §2.3 — добавление и удаление контактов в ростере;
- RFC 6121 §2.5 — roster push: изменения списка приходят сами;
- RFC 6121 §3.1 — подписки на присутствие: запрос, разрешение, отзыв;
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

## Транспорт и поиск эндпоинта

Только WebSocket (RFC 7395): TCP/TLS недоступен из WebView.

Если адрес не задан руками, клиент:

1. спрашивает сервер через XEP-0156 — `https://<домен>/.well-known/host-meta.json`;
2. добавляет типовые адреса (`serviceCandidates`), не дублируя найденное;
3. пробует их по очереди с таймаутом 8 секунд на каждый.

Это важно не для красоты: jabber.ru объявляет `wss://jabber.ru:443/ws/`, а
порт 5280 у него закрыт файрволом. Угадывание одного адреса давало десять
секунд тишины вместо входа.

Перебор прекращается сразу, если сервер отверг учётные данные: пароль один на
все адреса, другой эндпоинт его не исправит.

## Ошибки

`@xmpp/client` в браузере отдаёт `TypeError` с пустым `message`. Клиент
переводит такие отказы в текст: «Неверный логин или пароль», «Сервер … не
ответил за 8 секунд», «Сервер недоступен или закрыт файрволом».

Закрытие сокета библиотека сопровождает `error` без слушателя — в Node это
uncaught `TypeError`, роняющий процесс. `#stopConnection` гасит его точечным
обработчиком.
