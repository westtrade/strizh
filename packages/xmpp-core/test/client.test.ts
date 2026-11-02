import { test } from 'node:test';
import assert from 'node:assert/strict';

import { XmppClient } from '../src/index.ts';

test('новый клиент offline и без JID', () => {
	const client = new XmppClient();
	assert.equal(client.status, 'offline');
	assert.equal(client.self, null);
	assert.deepEqual(client.contacts, []);
});

test('подписка и отписка от события', () => {
	const client = new XmppClient();
	let calls = 0;
	const off = client.on('error', () => {
		calls += 1;
	});
	assert.equal(typeof off, 'function');
	off();
	assert.equal(calls, 0);
});

test('sendMessage без соединения бросает понятную ошибку', async () => {
	const client = new XmppClient();
	await assert.rejects(() => client.sendMessage('peer@example.org', 'привет'), /нет соединения/u);
});

test('disconnect без соединения переводит в offline', async () => {
	const client = new XmppClient();
	await client.disconnect();
	assert.equal(client.status, 'offline');
});
