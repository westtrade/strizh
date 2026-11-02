/**
 * Тонкая обёртка над `@xmpp/client`: соединение, ростер, сообщения, присутствие.
 *
 * Зачем обёртка: библиотека отдаёт stanza-поток и emitter на колбэках, а
 * приложению нужны типизированные события, состояние соединения и гарантия
 * одного активного соединения. Всё остальное (XMPP-детали) остаётся здесь,
 * чтобы Svelte-компоненты не знали про XML.
 */
import { client as createClient, xml, jid } from '@xmpp/client';
import type { Client as XmppConnection } from '@xmpp/client';
import type { Element } from '@xmpp/xml';

import { bareJid, discoverWebsocketService, parseJid, serviceCandidates } from './jid.ts';
import type {
	Account,
	ChatMessage,
	ChatState,
	ClientEventName,
	ClientEvents,
	ClientListener,
	ConnectionStatus,
	Contact,
	Presence
} from './types.ts';

const NS_RECEIPTS = 'urn:xmpp:receipts';
const NS_CHATSTATES = 'http://jabber.org/protocol/chatstates';
const NS_DELAY = 'urn:xmpp:delay';

/** Сколько ждём установления соединения с одним кандидатом. */
const CONNECT_TIMEOUT_MS = 8000;

const SHOW_TO_PRESENCE: Record<string, Presence> = {
	away: 'away',
	xa: 'away',
	dnd: 'dnd'
};

const PRESENCE_TO_SHOW: Record<Presence, string | null> = {
	online: null,
	away: 'away',
	dnd: 'dnd',
	offline: null
};

let sequence = 0;
function nextId(): string {
	sequence += 1;
	return `strizh-${Date.now().toString(36)}-${sequence}`;
}

/**
 * Человекочитаемая причина отказа. `@xmpp/client` в браузере отдаёт
 * `TypeError` с пустым `message`, а признак отказа лежит в `error.event`.
 * Без этого перевода UI показал бы пустую строку вместо ошибки.
 */
interface ConnectFailure {
	/** Текст для пользователя. */
	reason: string;
	/**
	 * Ошибка не про адрес, а про учётные данные: другой эндпоинт того же
	 * сервера её не исправит, перебирать кандидатов бессмысленно.
	 */
	fatal: boolean;
}

const SASL_ERRORS: Record<string, string> = {
	'not-authorized': 'Неверный логин или пароль',
	'invalid-authzid': 'Сервер не признал этот JID',
	'account-disabled': 'Учётная запись отключена на сервере',
	credentialsexpired: 'Срок действия пароля истёк',
	'malformed-request': 'Сервер отклонил формат запроса SASL',
	'mechanism-too-weak': 'Сервер запрещает вход без TLS',
	'temporary-auth-failure': 'Временная ошибка авторизации на сервере'
};

function describeConnectError(error: unknown, service: string): ConnectFailure {
	const err = error as
		| { name?: string; message?: string; code?: string; event?: { code?: number } }
		| null;
	const raw = typeof err?.message === 'string' ? err.message.trim() : '';
	const eventCode = typeof err?.event?.code === 'number' ? err.event.code : undefined;

	// SASL-приставка: причина в учётке, а не в адресе.
	if (raw) {
		const human = SASL_ERRORS[raw.toLowerCase()];
		if (human) return { reason: human, fatal: true };
		if (err?.name === 'SASLError' || err?.name === 'StreamError') {
			return { reason: `Сервер отклонил вход: ${raw}`, fatal: true };
		}
		return { reason: raw, fatal: false };
	}

	if (err?.code === 'ETIMEDOUT') {
		return { reason: `Сервер ${service} не ответил за ${CONNECT_TIMEOUT_MS / 1000} секунд`, fatal: false };
	}
	if (err?.code === 'ECONNERROR' || eventCode !== undefined) {
		return {
			reason: `Не удалось подключиться к ${service} — сервер недоступен или закрыт файрволом`,
			fatal: false
		};
	}
	return { reason: `Не удалось подключиться к ${service}`, fatal: false };
}

interface AttemptResult {
	connection: XmppConnection;
	service: string;
}

export class XmppClient {
	readonly #listeners = new Map<ClientEventName, Set<ClientListener<ClientEventName>>>();
	#connection: XmppConnection | null = null;
	#status: ConnectionStatus = 'offline';
	#self: string | null = null;
	#contacts = new Map<string, Contact>();
	/** Адрес, с которым реально установлено соединение. */
	#service: string | null = null;
	/** Растёт при каждом connect/disconnect: старые попытки себя отменяют. */
	#generation = 0;

	get status(): ConnectionStatus {
		return this.#status;
	}

	/** Полный JID текущей сессии или null, пока соединения нет. */
	get self(): string | null {
		return this.#self;
	}

	/** WebSocket-эндпоинт активного соединения. */
	get service(): string | null {
		return this.#service;
	}

	get contacts(): Contact[] {
		return [...this.#contacts.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
	}

	on<K extends ClientEventName>(name: K, listener: ClientListener<K>): () => void {
		let bucket = this.#listeners.get(name);
		if (!bucket) {
			bucket = new Set();
			this.#listeners.set(name, bucket);
		}
		bucket.add(listener as ClientListener<ClientEventName>);
		return () => this.off(name, listener);
	}

	off<K extends ClientEventName>(name: K, listener: ClientListener<K>): void {
		this.#listeners.get(name)?.delete(listener as ClientListener<ClientEventName>);
	}

	/**
	 * Подключается и ждёт `online`.
	 *
	 * Если адрес не задан руками, кандидаты перебираются: сначала объявленный
	 * сервером (XEP-0156), затем типовые (`serviceCandidates`). Раньше клиент
	 * молча угадывал один адрес и висел, если он закрыт.
	 */
	async connect(account: Account): Promise<void> {
		this.#generation += 1;
		const generation = this.#generation;

		if (this.#connection) {
			await this.#teardown();
		}

		const parsed = parseJid(account.jid);
		const manual = account.service?.trim();
		const candidates = manual ? [manual] : await this.#candidateList(account.jid);

		this.#setStatus('connecting');
		const failures: string[] = [];

		for (const service of candidates) {
			if (generation !== this.#generation) return;

			try {
				const result = await this.#attempt(account, parsed, service, generation);
				if (generation !== this.#generation) {
					await this.#stopConnection(result.connection);
					return;
				}
				this.#connection = result.connection;
				this.#service = result.service;
				this.#setStatus('online');
				this.#self = result.connection.jid?.toString() ?? null;
				void this.#afterOnline().catch((error: unknown) => {
					this.#emit('error', error instanceof Error ? error : new Error(String(error)));
				});
				return;
			} catch (error) {
				const failure = describeConnectError(error, service);
				failures.push(failure.reason);
				// Явный адрес не перебираем: человек указал его осознанно.
				// Ошибку учётных данных тоже не перебираем: пароль один на все адреса.
				if (manual || failure.fatal) break;
			}
		}

		if (generation !== this.#generation) return;

		const summary = failures.length
			? [...new Set(failures)].join('; ')
			: 'не удалось подключиться ни к одному адресу сервера';
		this.#setStatus('error', summary);
		this.#emit('error', new Error(summary));
		throw new Error(summary);
	}

	/** Discovery + угадывание, без дублей и без «http»-схем. */
	async #candidateList(jidValue: string): Promise<string[]> {
		const discovered = await discoverWebsocketService(jidValue);
		const seen = new Set<string>();
		const all: string[] = [];
		for (const service of [...discovered, ...serviceCandidates(jidValue)]) {
			if (seen.has(service)) continue;
			seen.add(service);
			all.push(service);
		}
		return all;
	}

	/**
	 * Одна попытка соединения. Успех — это `online`, а не открытый сокет:
	 * сервер может принять TCP и тут же разорвать поток.
	 */
	async #attempt(
		account: Account,
		parsed: ReturnType<typeof parseJid>,
		service: string,
		generation: number
	): Promise<AttemptResult> {
		const connection = createClient({
			service,
			domain: parsed.domain,
			username: parsed.local,
			password: account.password,
			resource: account.resource ?? 'strizh',
			// Таймаут самого @xmpp/client — на открытие потока, не на всё сразу.
			timeout: 5000
		});

		// Автопереподключение библиотеки включается само и молотит вечно, даже
		// если сервера нет. Нам нужен управляемый цикл, поэтому глушим его.
		connection.reconnect?.stop?.();

		connection.on('stanza', (stanza: Element) => {
			if (generation === this.#generation) this.#onStanza(stanza);
		});

		let failure: { error: unknown } | null = null;
		const onError = (error: unknown) => {
			if (!failure) failure = { error };
		};
		connection.on('error', onError);

		try {
			await this.#withTimeout(
				connection.start(),
				CONNECT_TIMEOUT_MS,
				() => Object.assign(new Error(`Сервер ${service} не ответил за ${CONNECT_TIMEOUT_MS / 1000} секунд`), { code: 'ETIMEDOUT' })
			);
		} catch (error) {
			connection.removeListener('error', onError);
			await this.#stopConnection(connection);
			throw failure ? (failure as { error: unknown }).error : error;
		}

		connection.removeListener('error', onError);

		if (generation !== this.#generation) {
			await this.#stopConnection(connection);
			throw new Error('подключение отменено');
		}
		if (this.#statusOf(connection) !== 'online') {
			await this.#stopConnection(connection);
			throw failure ? (failure as { error: unknown }).error : new Error(`сервер ${service} закрыл соединение`);
		}
		return { connection, service };
	}

	#statusOf(connection: XmppConnection): string {
		return (connection as unknown as { status?: string }).status ?? 'offline';
	}

	#withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => Error): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => reject(onTimeout()), timeoutMs);
			promise.then(
				(value) => {
					clearTimeout(timer);
					resolve(value);
				},
				(error) => {
					clearTimeout(timer);
					reject(error);
				}
			);
		});
	}

	/**
	 * Закрывает соединение, не роняя процесс.
	 *
	 * `@xmpp/websocket` при `_detachSocket()` снимает с нативного сокета
	 * обработчик `error`, после чего Node-WebSocket бросает `TypeError` без
	 * сообщения уже не в наш код, а в `process`. В браузере это `unhandledrejection`,
	 * в Node — uncaught exception, который убивает тест или CLI. Гасим точечно:
	 * вешаем на сокет свой пустой обработчик до закрытия.
	 */
	async #stopConnection(connection: XmppConnection): Promise<void> {
		connection.reconnect?.stop?.();
		const socket = (connection as unknown as { socket?: { socket?: WebSocket | null } }).socket?.socket;
		const swallow = () => undefined;
		if (socket && typeof socket.addEventListener === 'function') {
			socket.addEventListener('error', swallow);
		}
		try {
			await connection.stop();
		} catch {
			// сокет мог уже умереть — это не мешает двигаться дальше
		} finally {
			connection.removeAllListeners();
			// Слушатель НЕ снимаем: сокет уже никому не нужен, а error приходит
			// с задержкой — раньше мы снимали его слишком рано.
		}
	}

	async #teardown(): Promise<void> {
		const connection = this.#connection;
		this.#connection = null;
		this.#service = null;
		this.#self = null;
		this.#contacts.clear();
		if (connection) await this.#stopConnection(connection);
	}

	async disconnect(): Promise<void> {
		this.#generation += 1;
		const had = this.#connection !== null;
		await this.#teardown();
		this.#setStatus('offline');
		if (!had) return;
	}

	async sendMessage(to: string, body: string): Promise<ChatMessage> {
		const connection = this.#connection;
		if (!connection) throw new Error('нет соединения с XMPP-сервером');
		const id = nextId();
		const message = xml(
			'message',
			{ type: 'chat', to: bareJid(to), id },
			xml('body', {}, body),
			xml('request', { xmlns: NS_RECEIPTS }),
			xml('active', { xmlns: NS_CHATSTATES })
		);
		await connection.send(message);
		return {
			id,
			peer: bareJid(to),
			from: this.#self ?? '',
			body,
			timestamp: Date.now(),
			outgoing: true,
			delivered: false
		};
	}

	/** XEP-0085: собеседник видит «печатает…». */
	async sendChatState(to: string, state: ChatState): Promise<void> {
		const connection = this.#connection;
		if (!connection || state === 'active' || state === 'gone') return;
		await connection.send(xml('message', { to: bareJid(to), type: 'chat' }, xml(state, { xmlns: NS_CHATSTATES })));
	}

	async setPresence(presence: Presence, status = ''): Promise<void> {
		const connection = this.#connection;
		if (!connection) return;
		const show = PRESENCE_TO_SHOW[presence];
		const children = [
			...(show ? [xml('show', {}, show)] : []),
			...(status ? [xml('status', {}, status)] : []),
			xml('priority', {}, '1')
		];
		await connection.send(xml('presence', {}, ...children));
	}

	async #afterOnline(): Promise<void> {
		await this.setPresence('online');
		await this.#requestRoster();
	}

	async #requestRoster(): Promise<void> {
		// Соединение могло закрыться, пока мы ждали online: тогда ростер не нужен.
		const connection = this.#connection;
		if (!connection) return;
		const result = await connection.iqCaller.request(
			xml('iq', { type: 'get' }, xml('query', { xmlns: 'jabber:iq:roster' }))
		);
		if (this.#connection !== connection) return;
		const query = result.getChild('query', 'jabber:iq:roster');
		// Присутствие контактов сервер часто присылает РАНЬШЕ ответа на roster.
		// Если просто очистить карту, эти статусы потеряются и список останется
		// серым до следующего presence-пакета.
		const known = new Map(this.#contacts);
		this.#contacts.clear();
		for (const item of query?.children ?? []) {
			if (typeof item === 'string' || item.name !== 'item') continue;
			const contact = this.#contactFromItem(item);
			if (!contact) continue;
			const previous = known.get(contact.jid);
			if (previous) {
				contact.presence = previous.presence;
				contact.status = previous.status;
			}
			this.#contacts.set(contact.jid, contact);
		}
		this.#emit('roster', this.contacts);
		// После ростера запрашиваем присутствие контактов: сервер отвечает presence-пакетами.
		await connection.send(xml('presence', {}, xml('priority', {}, '1')));
	}

	#contactFromItem(item: Element): Contact | null {
		const jidAttr = String(item.attrs.jid ?? '');
		if (!jidAttr) return null;
		const existing = this.#contacts.get(jidAttr);
		return {
			jid: jidAttr,
			name: String(item.attrs.name ?? '') || (existing?.name ?? jidAttr.split('@')[0] ?? jidAttr),
			presence: existing?.presence ?? 'offline',
			status: existing?.status ?? '',
			subscription: (item.attrs.subscription as Contact['subscription']) ?? 'none'
		};
	}

	#onStanza(stanza: Element): void {
		if (stanza.is('message')) {
			this.#onMessage(stanza);
			return;
		}
		if (stanza.is('presence')) {
			this.#onPresence(stanza);
			return;
		}
		if (stanza.is('iq')) {
			this.#onIq(stanza);
		}
	}

	#onMessage(stanza: Element): void {
		const type = stanza.attrs.type ?? 'chat';
		if (type === 'error') {
			const text = stanza.getChildText('body') ?? 'не удалось доставить сообщение';
			this.#emit('error', new Error(text));
			return;
		}
		if (type !== 'chat' && type !== 'normal') return;

		const from = String(stanza.attrs.from ?? '');
		if (!from) return;
		const peer = bareJid(from);
		const body = stanza.getChildText('body');

		// XEP-0184: подтверждение доставки нашего сообщения.
		const received = stanza.getChild('received', NS_RECEIPTS);
		if (received) {
			const id = String(received.attrs.id ?? '');
			if (id) this.#emit('message', this.#receipt(peer, id));
			return;
		}

		// XEP-0185-запрос подтверждения: отвечаем, чтобы собеседник видел «доставлено».
		if (!body && stanza.getChild('request', NS_RECEIPTS)) {
			void this.#sendReceipt(from, String(stanza.attrs.id ?? ''));
			return;
		}

		const chatState = this.#parseChatState(stanza);
		if (!body) {
			if (chatState) this.#emit('chatState', { jid: peer, state: chatState });
			return;
		}

		void this.#sendReceipt(from, String(stanza.attrs.id ?? ''));
		this.#emit('message', {
			id: String(stanza.attrs.id ?? nextId()),
			peer,
			from,
			body: body.trim(),
			timestamp: this.#timestamp(stanza),
			outgoing: false,
			delivered: true
		});
	}

	#receipt(peer: string, id: string): ChatMessage {
		return {
			id,
			peer,
			from: peer,
			body: '',
			timestamp: Date.now(),
			outgoing: true,
			delivered: true
		};
	}

	#parseChatState(stanza: Element): ChatState | null {
		for (const child of stanza.children) {
			if (typeof child === 'string') continue;
			if (child.attrs.xmlns !== NS_CHATSTATES) continue;
			const state = child.name as ChatState;
			if (['active', 'composing', 'paused', 'inactive', 'gone'].includes(state)) return state;
		}
		return null;
	}

	#timestamp(stanza: Element): number {
		const delay = stanza.getChild('delay', NS_DELAY);
		if (delay) {
			const parsed = Date.parse(String(delay.attrs.stamp ?? ''));
			if (!Number.isNaN(parsed)) return parsed;
		}
		return Date.now();
	}

	async #sendReceipt(to: string, id: string): Promise<void> {
		const connection = this.#connection;
		if (!connection || !id) return;
		try {
			await connection.send(xml('message', { to, id: nextId() }, xml('received', { xmlns: NS_RECEIPTS, id })));
		} catch {
			// подтверждение — не критичный пакет
		}
	}

	#onPresence(stanza: Element): void {
		const from = String(stanza.attrs.from ?? '');
		if (!from) return;
		const type = stanza.attrs.type;
		const contactJid = bareJid(from);

		// Подписки на присутствие: принимаем всё, что сервер присылает явно.
		if (type === 'subscribe') {
			void this.#connection?.send(xml('presence', { to: contactJid, type: 'subscribed' }));
			return;
		}
		if (type === 'unsubscribe' || type === 'unsubscribed' || type === 'probe') return;

		const presence: Presence =
			type === 'unavailable'
				? 'offline'
				: (SHOW_TO_PRESENCE[String(stanza.getChildText('show') ?? '')] ?? 'online');
		const status = String(stanza.getChildText('status') ?? '');

		const known = this.#contacts.get(contactJid);
		if (known) {
			known.presence = presence;
			known.status = status;
		}
		this.#emit('presence', { jid: contactJid, presence, status });
	}

	#onIq(stanza: Element): void {
		// Roster push (RFC 6121 §2.5): сервер сам присылает изменения списка.
		if (stanza.attrs.type !== 'set') return;
		const query = stanza.getChild('query', 'jabber:iq:roster');
		if (!query) return;
		for (const item of query.children) {
			if (typeof item === 'string' || item.name !== 'item') continue;
			const contact = this.#contactFromItem(item);
			if (!contact) continue;
			if (item.attrs.subscription === 'remove') {
				this.#contacts.delete(contact.jid);
			} else {
				this.#contacts.set(contact.jid, {
					...contact,
					presence: this.#contacts.get(contact.jid)?.presence ?? 'offline'
				});
			}
		}
		this.#emit('roster', this.contacts);
	}

	#setStatus(status: ConnectionStatus, reason?: string): void {
		if (this.#status === status && !reason) return;
		this.#status = status;
		this.#emit('status', { status, reason });
	}

	#emit<K extends ClientEventName>(name: K, payload: ClientEvents[K]): void {
		const bucket = this.#listeners.get(name);
		if (!bucket) return;
		for (const listener of bucket) {
			try {
				(listener as ClientListener<K>)(payload);
			} catch (error) {
				console.error(`слушатель события ${name} упал`, error);
			}
		}
	}
}

export { jid, xml };
