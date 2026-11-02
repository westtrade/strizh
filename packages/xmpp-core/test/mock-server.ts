/**
 * Мок XMPP-сервера для тестов и разработки: минимальный, но честный обмен.
 *
 * Умеет ровно то, что нужно клиенту: открытие потока, SASL PLAIN, биндинг
 * ресурса, ростер, присутствие, личные сообщения между подключёнными JID и
 * подтверждения доставки (XEP-0184). Не умеет TLS, MUC, архивы — и не должен.
 *
 * Запуск: `bun test/mock-server.ts` (порт печатает в stdout) либо импортом
 * `startMockServer()` из теста.
 */

import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

import { WebSocketServer, type WebSocket } from 'ws';

const NS_FRAMING = 'urn:ietf:params:xml:ns:xmpp-framing';
const NS_SASL = 'urn:ietf:params:xml:ns:xmpp-sasl';
const NS_BIND = 'urn:ietf:params:xml:ns:xmpp-bind';
const NS_SESSION = 'urn:ietf:params:xml:ns:xmpp-session';
const NS_ROSTER = 'jabber:iq:roster';
const NS_RECEIPTS = 'urn:xmpp:receipts';

interface Session {
	/** JID после биндинга ресурса. */
	jid: string;
	/** JID до биндинга. */
	user: string;
	authenticated: boolean;
}

type Send = (text: string) => void;

const ROSTER: Record<string, Array<{ jid: string; name?: string; subscription: string }>> = {
	'anna@localhost': [
		{ jid: 'boris@localhost', name: 'Борис', subscription: 'both' },
		{ jid: 'vera@localhost', name: 'Вера', subscription: 'both' }
	],
	'boris@localhost': [{ jid: 'anna@localhost', name: 'Анна', subscription: 'both' }],
	'vera@localhost': [{ jid: 'anna@localhost', name: 'Анна', subscription: 'both' }]
};

function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

/** Достаёт значение атрибута из сырого XML-фрагмента (без полноценного парсера). */
function attr(xmlText: string, name: string): string | null {
	const match = new RegExp(`${name}="([^"]*)"`, 'u').exec(xmlText);
	return match?.[1] ?? null;
}

interface RawConnection {
	session: Session;
	send: Send;
	close?: () => void;
	rosterRequested: boolean;
}

export interface MockServer {
	url: string;
	port: number;
	stop: () => void;
	/** Подключённые JID — для ассертов в тестах. */
	online: () => string[];
	/** Сообщения, которые сервер разослал: `[from] [to] [body]`. */
	routed: () => Array<{ from: string; to: string; body: string }>;
}

export async function startMockServer(port = 0): Promise<MockServer> {
	const connections = new Map<RawConnection, unknown>();
	const routed: Array<{ from: string; to: string; body: string }> = [];

	function fanout(predicate: (c: RawConnection) => boolean, xmlText: string): void {
		for (const [connection] of connections) {
			if (predicate(connection)) connection.send(xmlText);
		}
	}

	function bareJid(jid: string): string {
		return jid.split('/')[0] ?? jid;
	}

	function rosterPush(connection: RawConnection, owner: string): void {
		const items = (ROSTER[owner] ?? [])
			.map((item) => `<item jid="${item.jid}" name="${escapeXml(item.name ?? '')}" subscription="${item.subscription}"/>`)
			.join('');
		connection.send(
			`<iq type="set" id="push-${Date.now()}"><query xmlns="${NS_ROSTER}">${items}</query></iq>`
		);
	}

	function handle(connection: RawConnection, raw: string): void {
		const { session } = connection;

		if (raw.startsWith('<open')) {
			connection.send(
				`<open xmlns="${NS_FRAMING}" from="localhost" id="stream-1" version="1.0"/>`
			);
			if (!session.authenticated) {
				connection.send(
					'<stream:features xmlns:stream="http://etherx.jabber.org/streams">' +
						`<mechanisms xmlns="${NS_SASL}"><mechanism>PLAIN</mechanism></mechanisms>` +
						'</stream:features>'
				);
			} else {
				connection.send(
					'<stream:features xmlns:stream="http://etherx.jabber.org/streams">' +
						`<bind xmlns="${NS_BIND}"/><session xmlns="${NS_SESSION}"/>` +
						'</stream:features>'
				);
			}
			return;
		}

		// RFC 7395 §3.6: на <close/> сервер обязан ответить <close/> и закрыть сокет.
		if (raw.startsWith('<close')) {
			connection.send(`<close xmlns="${NS_FRAMING}"/>`);
			queueMicrotask(() => connection.close?.());
			return;
		}

		if (raw.includes(`<auth xmlns="${NS_SASL}"`)) {
			const payload = /<auth[^>]*>([^<]*)<\/auth>/u.exec(raw)?.[1] ?? '';
			const decoded = Buffer.from(payload, 'base64').toString('utf8');
			// SASL PLAIN: [authzid] NUL authcid NUL passwd
			const [authzid, username] = decoded.split('\u0000');
			const user = (username || authzid || '').trim();
			if (!user) {
				connection.send(`<failure xmlns="${NS_SASL}"><not-authorized/></failure>`);
				return;
			}
			session.user = `${user}@localhost`;
			session.authenticated = true;
			connection.send(`<success xmlns="${NS_SASL}"/>`);
			return;
		}

		if (raw.includes(`<bind xmlns="${NS_BIND}"`)) {
			const resource = /<resource>([^<]*)<\/resource>/u.exec(raw)?.[1] ?? 'mock';
			session.jid = `${session.user}/${resource}`;
			const id = attr(raw, 'id') ?? 'bind-1';
			connection.send(
				`<iq type="result" id="${id}"><bind xmlns="${NS_BIND}"><jid>${escapeXml(session.jid)}</jid></bind></iq>`
			);
			return;
		}

		if (raw.includes(`<session xmlns="${NS_SESSION}"`)) {
			connection.send(`<iq type="result" id="${attr(raw, 'id') ?? 'sess'}"/>`);
			return;
		}

		if (raw.startsWith('<iq') && raw.includes(NS_ROSTER) && raw.includes('type="get"')) {
			const owner = bareJid(session.user);
			const items = (ROSTER[owner] ?? [])
				.map(
					(item) =>
						`<item jid="${item.jid}" name="${escapeXml(item.name ?? '')}" subscription="${item.subscription}"/>`
				)
				.join('');
			connection.rosterRequested = true;
			connection.send(
				`<iq type="result" id="${attr(raw, 'id') ?? 'roster'}"><query xmlns="${NS_ROSTER}">${items}</query></iq>`
			);
			return;
		}

		if (raw.startsWith('<presence')) {
			const type = attr(raw, 'type');
			const self = bareJid(session.user);
			// Взаимные подписки: контакты из ростера видят друг друга.
			const peers = (ROSTER[self] ?? []).map((item) => item.jid);
			for (const peer of peers) {
				fanout(
					(c) => c !== connection && c.session.authenticated && bareJid(c.session.user) === peer,
					type === 'unavailable'
						? `<presence from="${escapeXml(session.jid)}" type="unavailable"/>`
						: `<presence from="${escapeXml(session.jid)}"><show>chat</show></presence>`
				);
			}
			if (type !== 'unavailable' && connection.rosterRequested) {
				for (const peer of peers) {
					const peerConnection = [...connections.keys()].find(
						(c) => c.session.authenticated && bareJid(c.session.user) === peer
					);
					if (peerConnection) {
						connection.send(
							`<presence from="${escapeXml(peerConnection.session.jid)}"><show>chat</show></presence>`
						);
					}
				}
			}
			return;
		}

		if (raw.startsWith('<message')) {
			const to = attr(raw, 'to') ?? '';
			const id = attr(raw, 'id') ?? '';
			const body = /<body[^>]*>([\s\S]*?)<\/body>/u.exec(raw)?.[1] ?? '';
			const isReceipt = raw.includes(`<received xmlns="${NS_RECEIPTS}"`);
			const wantsReceipt = raw.includes(`<request xmlns="${NS_RECEIPTS}"`);
			// `to` может быть полным JID: подтверждение по XEP-0184 адресуют
			// отправителю вместе с ресурсом.
			const target = [...connections.keys()].find(
				(c) => c.session.authenticated && bareJid(c.session.user) === bareJid(to)
			);

			if (isReceipt) {
				const original = attr(raw, 'id') ?? '';
				const originalId = /<received[^>]*id="([^"]*)"/u.exec(raw)?.[1] ?? original;
				if (target) {
					target.send(
						`<message from="${escapeXml(bareJid(session.user))}" to="${escapeXml(target.session.jid)}"><received xmlns="${NS_RECEIPTS}" id="${escapeXml(originalId)}"/></message>`
					);
				}
				return;
			}

			if (!body) {
				// XEP-0085: состояния набора идут отдельным сообщением без body.
				const state = /<(composing|paused|active|inactive|gone)[\s/>]/u.exec(raw)?.[1];
				if (target && state) {
					target.send(
						`<message from="${escapeXml(session.jid)}" to="${escapeXml(target.session.jid)}" type="chat"><${state} xmlns="http://jabber.org/protocol/chatstates"/></message>`
					);
				}
				return;
			}
			routed.push({ from: bareJid(session.user), to, body });
			if (target) {
				// id не переписываем: XEP-0184 ссылается на id исходного сообщения.
				target.send(
					`<message from="${escapeXml(session.jid)}" to="${escapeXml(target.session.jid)}" type="chat" id="${escapeXml(
						id
					)}"><body>${escapeXml(body)}</body>${wantsReceipt ? `<request xmlns="${NS_RECEIPTS}"/>` : ''}</message>`
				);
			} else {
				connection.send(
					`<message from="${escapeXml(to)}" type="error" id="${escapeXml(id)}"><error type="cancel"><service-unavailable xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error></message>`
				);
			}
			return;
		}

		if (raw.includes('urn:xmpp:ping')) {
			connection.send(`<iq type="result" id="${attr(raw, 'id') ?? 'ping'}"/>`);
		}
	}

	const server = createServer((request, response) => {
		const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
		if (url.pathname !== '/xmpp-websocket') {
			response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
			response.end('mock xmpp: используйте /xmpp-websocket');
			return;
		}
		response.writeHead(200, { 'content-type': 'text/plain' });
		response.end('websocket only');
	});

	const wss = new WebSocketServer({ server, path: '/xmpp-websocket' });

	wss.on('connection', (ws) => {
		const connection: RawConnection = {
			session: { jid: '', user: '', authenticated: false },
			send: (text) => ws.send(text),
			close: () => ws.close(),
			rosterRequested: false
		};
		connections.set(connection, ws);
		ws.on('message', (data) => handle(connection, data.toString()));
		ws.on('close', () => connections.delete(connection));
	});

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(port, '127.0.0.1', resolve);
	});
	const address = server.address();
	const boundPort = typeof address === 'object' && address ? address.port : port;

	return {
		url: `ws://127.0.0.1:${boundPort}/xmpp-websocket`,
		port: boundPort,
		stop: () => {
			for (const ws of connections.values()) (ws as WebSocket).close();
			connections.clear();
			wss.close();
			server.close();
		},
		online: () => [...connections.keys()].filter((c) => c.session.authenticated).map((c) => c.session.jid),
		routed: () => routed
	};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const server = await startMockServer(Number(process.env.MOCK_XMPP_PORT ?? 5280));
	console.log(`мок XMPP-сервер: ${server.url}`);
	console.log('учётки: anna / boris / vera @localhost, любой пароль');
	process.on('SIGINT', () => {
		server.stop();
		process.exit(0);
	});
}
