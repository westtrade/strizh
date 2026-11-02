import { test } from 'node:test';
import assert from 'node:assert/strict';

import { XmppClient } from '../src/index.ts';
import { startMockServer } from './mock-server.ts';

const PASSWORD = 'secret';

function waitFor<T>(register: (resolve: (value: T) => void) => () => void, timeoutMs = 4000): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => {
			cleanup();
			reject(new Error('таймаут ожидания события'));
		}, timeoutMs);
		const cleanup = register((value) => {
			clearTimeout(timer);
			cleanup();
			resolve(value);
		});
	});
}

test('подключение, ростер и присутствие через мок-сервер', async (t) => {
	const server = await startMockServer();
	const client = new XmppClient();
	// Один хук: сначала клиент, потом сервер. Иначе сокет умирает под ногами клиента.
	t.after(async () => {
		await client.disconnect();
		server.stop();
	});

	const rosterPromise = waitFor<{ length: number }>((resolve) => client.on('roster', resolve));
	await client.connect({
		jid: 'anna@localhost',
		password: PASSWORD,
		service: server.url,
		resource: 'test-web'
	});

	assert.equal(client.status, 'online');
	assert.equal(client.self, 'anna@localhost/test-web');

	const roster = await rosterPromise;
	assert.equal(roster.length, 2, 'в ростере Анны два контакта');
	assert.deepEqual(
		client.contacts.map((c) => c.jid).sort(),
		['boris@localhost', 'vera@localhost']
	);
});

test('сообщение доходит до собеседника и получает подтверждение', async (t) => {
	const server = await startMockServer();
	const anna = new XmppClient();
	const boris = new XmppClient();
	t.after(async () => {
		await anna.disconnect();
		await boris.disconnect();
		server.stop();
	});

	await anna.connect({ jid: 'anna@localhost', password: PASSWORD, service: server.url, resource: 'a' });
	await boris.connect({ jid: 'boris@localhost', password: PASSWORD, service: server.url, resource: 'b' });

	const incoming = waitFor<{ body: string; outgoing: boolean; from: string }>((resolve) =>
		boris.on('message', resolve)
	);
	await anna.sendMessage('boris@localhost', 'привет, Борис');

	const received = await incoming;
	assert.equal(received.body, 'привет, Борис');
	assert.equal(received.outgoing, false);
	assert.match(received.from, /^anna@localhost\//u, 'сообщение пришло от Анны');
	assert.equal(server.routed().length, 1);
});

test('ошибка доставки превращается в событие error', async (t) => {
	const server = await startMockServer();
	const anna = new XmppClient();
	t.after(async () => {
		await anna.disconnect();
		server.stop();
	});
	await anna.connect({ jid: 'anna@localhost', password: PASSWORD, service: server.url, resource: 'a' });

	const failure = waitFor<Error>((resolve) => anna.on('error', resolve));
	await anna.sendMessage('nobody@localhost', 'есть кто?');

	const error = await failure;
	assert.match(error.message, /не удалось доставить/u);
});

test('disconnect переводит клиента в offline и чистит ростер', async (t) => {
	const server = await startMockServer();
	const client = new XmppClient();
	t.after(async () => {
		await client.disconnect();
		server.stop();
	});

	await client.connect({ jid: 'anna@localhost', password: PASSWORD, service: server.url, resource: 'a' });
	await client.disconnect();

	assert.equal(client.status, 'offline');
	assert.equal(client.self, null);
	assert.deepEqual(client.contacts, []);
});
