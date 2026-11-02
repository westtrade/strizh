import { test } from 'node:test';
import assert from 'node:assert/strict';

import { serviceCandidates, discoverWebsocketService, defaultService } from '../src/jid.ts';

test('кандидаты перечисляют типовые эндпоинты сервера', () => {
	const candidates = serviceCandidates('user@example.org');
	assert.ok(candidates.length >= 3);
	assert.equal(candidates[0], 'wss://example.org:5280/xmpp-websocket');
	// Регрессия: раньше клиент знал только 5280 и висел, если порт закрыт.
	assert.ok(
		candidates.includes('wss://example.org:443/ws/'),
		'эндпоинт на 443-м порту обязателен — так работает jabber.ru'
	);
});

test('кандидаты не повторяются', () => {
	const candidates = serviceCandidates('user@example.org');
	assert.equal(new Set(candidates).size, candidates.length);
});

test('defaultService остаётся первым кандидатом', () => {
	assert.equal(defaultService('user@example.org'), serviceCandidates('user@example.org')[0]);
});

test('discovery не бросает при недоступном домене', async () => {
	// .invalid зарезервирован RFC 2606: DNS-ответа не будет никогда.
	const services = await discoverWebsocketService('user@example.invalid', 500);
	assert.deepEqual(services, []);
});
