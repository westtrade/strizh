/**
 * Разбор JID (RFC 6122) в объёме, который нужен клиенту: локальная часть,
 * домен и ресурс, плюс bare-форма для группировки переписки.
 */

export interface ParsedJid {
	local: string;
	domain: string;
	resource: string;
}

const JID_RE = /^(?:([^@/]+)@)?([^@/]+?)(?:\/(.+))?$/u;

export function parseJid(value: string): ParsedJid {
	const match = JID_RE.exec(value.trim());
	if (!match) {
		throw new Error(`некорректный JID: ${value}`);
	}
	const [, local = '', domain = '', resource = ''] = match;
	if (!domain) {
		throw new Error(`некорректный JID: ${value}`);
	}
	return { local: local.toLowerCase(), domain: domain.toLowerCase(), resource };
}

/** `user@example.org/resource` → `user@example.org`. */
export function bareJid(value: string): string {
	const { local, domain } = parseJid(value);
	return local ? `${local}@${domain}` : domain;
}

/** Адрес учётной записи для SASL: без домена, если сервер его подставит сам. */
export function jidDomain(value: string): string {
	return parseJid(value).domain;
}

/**
 * Эндпоинт WebSocket по умолчанию. Порт 5280 — дефолт из XEP-0045-примеров
 * и большинства серверов (ejabberd, Prosody); если сервер слушает 443 —
 * пользователь переопределяет адрес в настройках.
 */
export function defaultService(jid: string): string {
	return `wss://${jidDomain(jid)}:5280/xmpp-websocket`;
}

export function isJid(value: string): boolean {
	try {
		parseJid(value);
		return true;
	} catch {
		return false;
	}
}
