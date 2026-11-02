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
 * Кандидаты в WebSocket-эндпоинт, в порядке убывания вероятности.
 *
 * Первым идёт `:5280/xmpp-websocket` — так настроены ejabberd и Prosody по
 * умолчанию. Дальше `/ws/` на 443-м порту: так обычно делают серверы за
 * reverse-proxy (у jabber.ru это единственный рабочий адрес). Порядок важен:
 * все кандидаты проверяются параллельно, но побеждает первый ответивший из
 * списка, а не первый по времени.
 *
 * Угадывание здесь неизбежно: у WebSocket нет DNS-записи, а XEP-0156
 * (`.well-known/host-meta`) поддерживают не все серверы. Кто поддерживает —
 * подхватывается автоматически в `discoverWebsocketService`.
 */
export function serviceCandidates(jid: string): string[] {
	const domain = jidDomain(jid);
	return [
		`wss://${domain}:5280/xmpp-websocket`,
		`wss://${domain}:443/ws/`,
		`wss://${domain}/ws/`,
		`wss://${domain}/xmpp-websocket`,
		`ws://${domain}:5280/xmpp-websocket`
	];
}

/** Эндпоинт «как договоримся»: первый кандидат, без сети. */
export function defaultService(jid: string): string {
	return serviceCandidates(jid)[0] ?? `wss://${jidDomain(jid)}:5280/xmpp-websocket`;
}

interface HostMetaLink {
	rel?: string;
	href?: string;
}

/**
 * XEP-0156: сервер сам объявляет WebSocket-эндпоинт в
 * `https://<домен>/.well-known/host-meta.json`.
 *
 * Функция не бросает исключений: если discovery недоступен (нет сети, нет
 * файла, CORS, битый JSON), возвращается пустой список и вызывающая сторона
 * переходит к угадыванию. Молчание здесь правильнее ошибки — это лишь
 * оптимизация.
 */
export async function discoverWebsocketService(jid: string, timeoutMs = 3000): Promise<string[]> {
	const domain = jidDomain(jid);
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(`https://${domain}/.well-known/host-meta.json`, {
			signal: controller.signal,
			redirect: 'follow'
		});
		if (!response.ok) return [];
		const body = (await response.json()) as { links?: HostMetaLink[] };
		const links = Array.isArray(body?.links) ? body.links : [];
		return links
			.filter((link) => typeof link?.href === 'string')
			.filter((link) => link.rel?.startsWith('urn:xmpp:alt-connections:websocket'))
			.map((link) => String(link.href))
			.map((href) => href.replace(/^https:/u, 'wss:').replace(/^http:/u, 'ws:'));
	} catch {
		return [];
	} finally {
		clearTimeout(timer);
	}
}

export function isJid(value: string): boolean {
	try {
		parseJid(value);
		return true;
	} catch {
		return false;
	}
}
