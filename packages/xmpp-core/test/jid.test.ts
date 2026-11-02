import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bareJid, defaultService, isJid, jidDomain, parseJid } from '../src/jid.ts';

test('parseJid разбирает полный JID', () => {
	assert.deepEqual(parseJid('User@Example.ORG/phone'), {
		local: 'user',
		domain: 'example.org',
		resource: 'phone'
	});
});

test('parseJid разбирает домен без локальной части', () => {
	assert.deepEqual(parseJid('conference.example.org'), {
		local: '',
		domain: 'conference.example.org',
		resource: ''
	});
});

test('parseJid отвергает пустую строку', () => {
	assert.throws(() => parseJid('   '), /некорректный JID/u);
});

test('bareJid отбрасывает ресурс', () => {
	assert.equal(bareJid('user@example.org/phone'), 'user@example.org');
	assert.equal(bareJid('example.org/phone'), 'example.org');
});

test('jidDomain возвращает домен', () => {
	assert.equal(jidDomain('user@example.org/res'), 'example.org');
});

test('defaultService строит адрес WebSocket', () => {
	assert.equal(defaultService('user@example.org'), 'wss://example.org:5280/xmpp-websocket');
});

test('isJid не бросает на мусоре', () => {
	assert.equal(isJid('user@example.org'), true);
	assert.equal(isJid('@'), false);
	assert.equal(isJid(''), false);
});
