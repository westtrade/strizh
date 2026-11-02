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

import { bareJid, defaultService } from './jid.ts';
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
const NS_PING = 'urn:xmpp:ping';

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

export class XmppClient {
	readonly #listeners = new Map<ClientEventName, Set<ClientListener<ClientEventName>>>();
	#connection: XmppConnection | null = null;
	#status: ConnectionStatus = 'offline';
	#self: string | null = null;
	#contacts = new Map<string, Contact>();

	get status(): ConnectionStatus {
		return this.#status;
	}

	/** Полный JID текущей сессии или null, пока соединения нет. */
	get self(): string | null {
		return this.#self;
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

	/** Подключается и ждёт `online`. Повторный вызов переиспользует соединение. */
	async connect(account: Account): Promise<void> {
		if (this.#connection) {
			await this.disconnect();
		}

		this.#setStatus('connecting');
		const [local] = account.jid.split('@');
		const connection = createClient({
			service: account.service?.trim() || defaultService(account.jid),
			domain: account.jid.split('@')[1]?.split('/')[0] ?? '',
			username: local ?? '',
			password: account.password,
			resource: account.resource ?? 'strizh'
		});

		this.#connection = connection;
		connection.on('error', (error: Error) => {
			this.#emit('error', error);
			this.#setStatus('error', error.message);
		});
		connection.on('offline', () => {
			if (this.#status !== 'error') this.#setStatus('offline');
		});
		connection.on('online', (address: { toString(): string }) => {
			this.#self = address.toString();
			this.#setStatus('online');
			// Ростер догружается асинхронно: ошибка загрузки не должна ронять соединение.
			void this.#afterOnline().catch((error: unknown) => {
				this.#emit('error', error instanceof Error ? error : new Error(String(error)));
			});
		});
		connection.on('stanza', (stanza: Element) => this.#onStanza(stanza));

		try {
			await connection.start();
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			this.#setStatus('error', reason);
			this.#emit('error', error instanceof Error ? error : new Error(reason));
			throw error;
		}
	}

	async disconnect(): Promise<void> {
		const connection = this.#connection;
		this.#connection = null;
		this.#self = null;
		this.#contacts.clear();
		if (!connection) {
			this.#setStatus('offline');
			return;
		}
		connection.removeAllListeners();
		try {
			await connection.send(xml('presence', { type: 'unavailable' }));
			await connection.stop();
		} catch {
			// соединение могло уже умереть — для нас это всё равно offline
		}
		this.#setStatus('offline');
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
		this.#contacts.clear();
		for (const item of query?.children ?? []) {
			if (typeof item === 'string' || item.name !== 'item') continue;
			const contact = this.#contactFromItem(item);
			if (contact) this.#contacts.set(contact.jid, contact);
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

		const presence: Presence = type === 'unavailable' ? 'offline' : (SHOW_TO_PRESENCE[String(stanza.getChildText('show') ?? '')] ?? 'online');
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
				this.#contacts.set(contact.jid, { ...contact, presence: this.#contacts.get(contact.jid)?.presence ?? 'offline' });
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
