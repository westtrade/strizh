/**
 * Состояние мессенджера: единственная точка, где UI встречается с сетью.
 *
 * Класс на рунах, а не стор: состояние нужно ровно одному дереву компонентов,
 * и так видны все мутации в одном файле. Сеть (XMPP) живёт в `@strizh/xmpp-core`,
 * здесь только реактивная проекция его событий.
 */
import { XmppClient, bareJid } from '@strizh/xmpp-core';
import type {
	Account,
	ChatMessage,
	ChatState,
	ConnectionStatus,
	Contact,
	Presence,
	SubscriptionRequest
} from '@strizh/xmpp-core';

import { defaultResource, detectPlatform, type Platform } from '../platform.ts';
import { loadDrafts, saveDraft } from '../storage.ts';

const MAX_MESSAGES_PER_PEER = 500;

export class ChatSession {
	readonly platform: Platform = detectPlatform();

	status = $state<ConnectionStatus>('offline');
	self = $state<string | null>(null);
	/**
	 * Был ли вход выполнен в этой сессии. Отличается от `online`: при обрыве
	 * связи пользователь остаётся в приложении и видит баннер, а не экран входа.
	 */
	authenticated = $state(false);
	error = $state<string | null>(null);
	contacts = $state<Contact[]>([]);
	conversations = $state<Record<string, ChatMessage[]>>({});
	unread = $state<Record<string, number>>({});
	drafts = $state<Record<string, string>>({});
	composing = $state<Record<string, boolean>>({});
	activePeer = $state<string | null>(null);
	presence = $state<Presence>('online');
	/** Черновик «личного» статуса, которым делимся с контактами. */
	statusText = $state('');
	/** Входящие заявки на подписку: решение принимает человек, не клиент. */
	requests = $state<SubscriptionRequest[]>([]);
	/** Ошибка действия с ростором (добавление, ответ на заявку). */
	rosterError = $state<string | null>(null);

	readonly #client = new XmppClient();
	#disposers: Array<() => void> = [];

	get online(): boolean {
		return this.status === 'online';
	}

	get activeContact(): Contact | null {
		const peer = this.activePeer;
		if (!peer) return null;
		return this.contacts.find((c) => c.jid === peer) ?? null;
	}

	get activeMessages(): ChatMessage[] {
		const peer = this.activePeer;
		if (!peer) return [];
		return this.conversations[peer] ?? [];
	}

	get totalUnread(): number {
		return Object.values(this.unread).reduce((sum, n) => sum + n, 0);
	}

	/** Подписка на события клиента: вызывается один раз при монтировании. */
	mount(): void {
		this.drafts = loadDrafts();
		this.#disposers = [
			this.#client.on('status', ({ status, reason }) => {
				this.status = status;
				if (status === 'online') {
					this.error = null;
					this.authenticated = true;
				}
				if (status === 'error' && reason) this.error = reason;
			}),
			this.#client.on('roster', (contacts) => this.#applyRoster(contacts)),
			this.#client.on('presence', ({ jid, presence, status }) => this.#applyPresence(jid, presence, status)),
			this.#client.on('message', (message) => this.#applyMessage(message)),
			this.#client.on('chatState', ({ jid, state }) => this.#applyChatState(jid, state)),
			this.#client.on('subscriptionRequest', (request) => this.#applySubscriptionRequest(request)),
			this.#client.on('subscriptionRevoked', ({ jid }) => {
				const known = this.contacts.find((c) => c.jid === jid);
				if (known) {
					known.presence = 'offline';
					known.status = '';
				}
			}),
			this.#client.on('error', (error) => {
				this.error = error.message;
			})
		];
		this.self = this.#client.self;
		this.status = this.#client.status;
	}

	unmount(): void {
		for (const dispose of this.#disposers) dispose();
		this.#disposers = [];
	}

	async connect(account: Account): Promise<void> {
		this.error = null;
		const normalized: Account = {
			...account,
			jid: bareJid(account.jid),
			// Пустая строка, а не угаданный адрес: пустое поле значит «найди сам»
			// (XEP-0156 + перебор кандидатов). Подставленный здесь defaultService
			// заставлял ядро считать адрес заданным вручную и не искать другие.
			service: account.service?.trim() || undefined,
			resource: account.resource?.trim() || defaultResource(this.platform)
		};
		try {
			await this.#client.connect(normalized);
			this.self = this.#client.self;
			await this.#client.setPresence(this.presence, this.statusText);
		} catch (error) {
			this.error = error instanceof Error ? error.message : String(error);
		}
	}

	async disconnect(): Promise<void> {
		await this.#client.disconnect();
		this.authenticated = false;
		this.self = null;
		this.contacts = [];
		this.activePeer = null;
		this.unread = {};
		this.composing = {};
		this.requests = [];
		this.rosterError = null;
	}

	async send(text: string): Promise<void> {
		const peer = this.activePeer;
		const body = text.trim();
		if (!peer || !body) return;

		const conversation = this.conversations[peer] ?? [];
		const optimistic: ChatMessage = {
			id: `local-${Date.now().toString(36)}`,
			peer,
			from: this.self ?? '',
			body,
			timestamp: Date.now(),
			outgoing: true,
			delivered: false
		};
		this.conversations[peer] = [...conversation, optimistic];
		this.#setDraft(peer, '');

		try {
			const sent = await this.#client.sendMessage(peer, body);
			// Подменяем оптимистичное сообщение настоящим id — по нему придёт подтверждение.
			this.conversations[peer] = (this.conversations[peer] ?? []).map((m) =>
				m.id === optimistic.id ? { ...m, id: sent.id } : m
			);
		} catch (error) {
			this.error = error instanceof Error ? error.message : String(error);
			this.conversations[peer] = (this.conversations[peer] ?? []).map((m) =>
				m.id === optimistic.id ? { ...m, body: `${m.body}`, delivered: false } : m
			);
		}
	}

	notifyTyping(text: string): void {
		const peer = this.activePeer;
		if (!peer || !this.online) return;
		const state: ChatState = text ? 'composing' : 'paused';
		void this.#client.sendChatState(peer, state).catch(() => undefined);
	}

	open(peer: string): void {
		this.activePeer = peer;
		this.unread[peer] = 0;
		this.#ensureConversation(peer);
	}

	close(): void {
		this.activePeer = null;
	}

	async changePresence(presence: Presence): Promise<void> {
		this.presence = presence;
		await this.#client.setPresence(presence, this.statusText).catch(() => undefined);
	}

	async changeStatusText(text: string): Promise<void> {
		this.statusText = text;
		await this.#client.setPresence(this.presence, text).catch(() => undefined);
	}

	setDraft(peer: string, text: string): void {
		this.#setDraft(peer, text);
	}

	async addContact(jid: string, name = ''): Promise<boolean> {
		this.rosterError = null;
		try {
			await this.#client.addContact(jid, name);
			this.contacts = this.#client.contacts;
			return true;
		} catch (error) {
			this.rosterError = error instanceof Error ? error.message : String(error);
			return false;
		}
	}

	async removeContact(jid: string): Promise<void> {
		this.rosterError = null;
		try {
			await this.#client.removeContact(jid);
			this.contacts = this.#client.contacts;
			if (this.activePeer === jid) this.activePeer = null;
		} catch (error) {
			this.rosterError = error instanceof Error ? error.message : String(error);
		}
	}

	async answerRequest(jid: string, accept: boolean): Promise<void> {
		this.rosterError = null;
		try {
			await this.#client.answerSubscription(jid, accept ? 'subscribed' : 'unsubscribed');
			this.requests = this.requests.filter((request) => request.jid !== jid);
			this.contacts = this.#client.contacts;
		} catch (error) {
			this.rosterError = error instanceof Error ? error.message : String(error);
		}
	}

	dismissRequest(jid: string): void {
		this.requests = this.requests.filter((request) => request.jid !== jid);
	}

	#applySubscriptionRequest(request: SubscriptionRequest): void {
		// Один и тот же JID может попросить подписку повторно — не плодим строки.
		this.requests = [...this.requests.filter((r) => r.jid !== request.jid), request];
	}

	#setDraft(peer: string, text: string): void {
		if (text) this.drafts[peer] = text;
		else delete this.drafts[peer];
		saveDraft(peer, text);
	}

	#ensureConversation(peer: string): ChatMessage[] {
		const existing = this.conversations[peer];
		if (existing) return existing;
		const created: ChatMessage[] = [];
		this.conversations[peer] = created;
		return created;
	}

	#applyRoster(contacts: Contact[]): void {
		// Сохраняем уже известное присутствие: roster push и presence — разные пакеты.
		this.contacts = contacts.map((contact) => ({
			...contact,
			presence: this.contacts.find((c) => c.jid === contact.jid)?.presence ?? contact.presence
		}));
	}

	#applyPresence(jid: string, presence: Presence, status: string): void {
		const peer = bareJid(jid);
		// Своё присутствие сервер тоже присылает. Без этой проверки владелец
		// учётки появлялся в собственном списке контактов.
		if (this.self && peer === bareJid(this.self)) return;
		const known = this.contacts.find((c) => c.jid === peer);
		if (known) {
			known.presence = presence;
			known.status = status;
			return;
		}
		if (presence === 'offline') return;
		this.contacts = [
			...this.contacts,
			{ jid: peer, name: peer.split('@')[0] ?? peer, presence, status, subscription: 'none' }
		];
	}

	#applyMessage(message: ChatMessage): void {
		const conversation = this.#ensureConversation(message.peer);

		// XEP-0184: подтверждение приходит отдельным событием с тем же id.
		if (message.outgoing && message.delivered && !message.body) {
			this.conversations[message.peer] = conversation.map((m) =>
				m.id === message.id ? { ...m, delivered: true } : m
			);
			return;
		}
		if (message.outgoing && conversation.some((m) => m.id === message.id)) return;
		if (!message.body) return;

		const next = [...conversation, message].slice(-MAX_MESSAGES_PER_PEER);
		this.conversations[message.peer] = next;

		if (!message.outgoing && this.activePeer !== message.peer) {
			this.unread[message.peer] = (this.unread[message.peer] ?? 0) + 1;
		}
		if (!message.outgoing) this.composing[message.peer] = false;
	}

	#applyChatState(jid: string, state: ChatState): void {
		this.composing[bareJid(jid)] = state === 'composing';
	}
}
