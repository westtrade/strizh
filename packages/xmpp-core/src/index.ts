/**
 * Публичный API пакета: клиент XMPP и типы. Экспортируй отсюда и только отсюда.
 */
export { XmppClient, xml, jid } from './client.ts';
export {
	bareJid,
	defaultService,
	discoverWebsocketService,
	isJid,
	jidDomain,
	parseJid,
	serviceCandidates
} from './jid.ts';
export type { ParsedJid } from './jid.ts';
export type {
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
