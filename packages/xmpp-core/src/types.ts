/**
 * Типы предметной области клиента. Ничего платформенного: ни DOM, ни Svelte —
 * пакет потребляют SvelteKit-приложение и тесты.
 */

/** Показ присутствия по XMPP (`<presence><show>`). */
export type Presence = 'online' | 'away' | 'dnd' | 'offline';

/** Состояние соединения с сервером. */
export type ConnectionStatus = 'offline' | 'connecting' | 'online' | 'error';

export interface Account {
	/** Полный JID вида `user@example.org/resource`. */
	jid: string;
	password: string;
	/** WebSocket-эндпоинт сервера. Если не задан — выводится из домена JID. */
	service?: string;
	/** Ресурс устройства: `strizh-web`, `strizh-tauri`, `strizh-mobile`. */
	resource?: string;
}

export interface Contact {
	jid: string;
	name: string;
	presence: Presence;
	status: string;
	subscription: 'none' | 'to' | 'from' | 'both' | 'remove';
}

export interface ChatMessage {
	id: string;
	/** JID собеседника (bare), по которому группируется переписка. */
	peer: string;
	from: string;
	body: string;
	timestamp: number;
	outgoing: boolean;
	/** Доставлено ли сообщение (XEP-0184) или подтверждено сервером. */
	delivered: boolean;
}

export type ChatState = 'active' | 'composing' | 'paused' | 'inactive' | 'gone';

/** Запрос подписки на присутствие: `<presence type="subscribe">`. */
export interface SubscriptionRequest {
	jid: string;
	/** Имя из ростера, если контакт уже добавлен, иначе локальная часть JID. */
	name: string;
	/** Есть ли уже двусторонняя подписка (повторный запрос от друга). */
	alreadySubscribed: boolean;
}

/** Ответ на запрос подписки. `unsubscribed` — отказ. */
export type SubscriptionAnswer = 'subscribed' | 'unsubscribed';

/** События клиента: единственный канал наружу, без Svelte-зависимостей. */
export interface ClientEvents {
	status: { status: ConnectionStatus; reason?: string };
	message: ChatMessage;
	presence: { jid: string; presence: Presence; status: string };
	roster: Contact[];
	chatState: { jid: string; state: ChatState };
	/** Входящий запрос подписки: решение принимает человек, не клиент. */
	subscriptionRequest: SubscriptionRequest;
	/** Собеседник отменил подписку на нас (`presence type="unsubscribed"`). */
	subscriptionRevoked: { jid: string };
	error: Error;
}

export type ClientEventName = keyof ClientEvents;
export type ClientListener<K extends ClientEventName> = (payload: ClientEvents[K]) => void;
