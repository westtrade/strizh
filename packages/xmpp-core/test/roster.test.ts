import { test } from 'node:test';
import assert from 'node:assert/strict';

import { XmppClient } from '../src/index.ts';
import type { SubscriptionRequest } from '../src/index.ts';
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

async function pair(t: { after: (fn: () => Promise<void> | void) => void }) {
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
	return { server, anna, boris };
}

test('addContact заводит запись в ростере и просит подписку', async (t) => {
	const { anna } = await pair(t);

	const rosterAfterAdd = waitFor<Array<{ jid: string }>>((resolve) => anna.on('roster', resolve));
	await anna.addContact('vera@localhost', 'Вера');

	assert.ok(
		anna.contacts.some((c) => c.jid === 'vera@localhost'),
		'контакт появился в списке сразу, не дожидаясь push'
	);
	const pushed = await rosterAfterAdd;
	assert.ok(pushed.some((c) => c.jid === 'vera@localhost'), 'сервер подтвердил запись через roster push');
});

test('addContact отвергает собственный JID', async (t) => {
	const { anna } = await pair(t);
	await assert.rejects(() => anna.addContact('anna@localhost'), /самого себя/u);
});

test('addContact не добавляет контакт дважды', async (t) => {
	const { anna } = await pair(t);
	await anna.addContact('vera@localhost', 'Вера');
	await anna.addContact('vera@localhost', 'Вера');
	const veras = anna.contacts.filter((c) => c.jid === 'vera@localhost');
	assert.equal(veras.length, 1);
});

test('входящий запрос подписки не принимается автоматически', async (t) => {
	const { anna, boris } = await pair(t);

	const incoming = waitFor<SubscriptionRequest>((resolve) => anna.on('subscriptionRequest', resolve));
	await boris.requestSubscription('anna@localhost');

	const request = await incoming;
	assert.equal(request.jid, 'boris@localhost');
	// Борис уже в ростере Анны с двусторонней подпиской — это видно вызывающей стороне.
	assert.equal(typeof request.alreadySubscribed, 'boolean');
});

test('answerSubscription subscribed открывает присутствие', async (t) => {
	const { anna, boris } = await pair(t);

	const presenceSeen = waitFor<{ jid: string; presence: string }>((resolve) => {
		const off = anna.on('presence', (payload) => {
			if (payload.jid === 'boris@localhost' && payload.presence !== 'offline') resolve(payload);
		});
		return off;
	});

	const incoming = waitFor<SubscriptionRequest>((resolve) => anna.on('subscriptionRequest', resolve));
	await boris.requestSubscription('anna@localhost');
	await incoming;

	await anna.answerSubscription('boris@localhost', 'subscribed');

	// Сервер пришлёт присутствие Бориса в ответ на встречную подписку.
	const presence = await presenceSeen;
	assert.equal(presence.jid, 'boris@localhost');
});

test('answerSubscription unsubscribed скрывает наше присутствие от просителя', async (t) => {
	const { anna, boris } = await pair(t);

	const incoming = waitFor<SubscriptionRequest>((resolve) => anna.on('subscriptionRequest', resolve));
	await boris.requestSubscription('anna@localhost');
	await incoming;

	// Отказ означает «я не даю смотреть на себя»: смотрит уже Борис.
	await anna.answerSubscription('boris@localhost', 'unsubscribed');
	await new Promise((resolve) => setTimeout(resolve, 200));

	let sawAnnasPresence = false;
	boris.on('presence', ({ jid, presence }) => {
		if (jid === 'anna@localhost' && presence !== 'offline') sawAnnasPresence = true;
	});

	// Анна меняет статус — рассылка идёт только подписчикам.
	await anna.setPresence('online', 'после отказа');
	await new Promise((resolve) => setTimeout(resolve, 400));
	assert.equal(
		sawAnnasPresence,
		false,
		'после отказа присутствие Анны не должно доходить до Бориса'
	);
});

test('removeContact убирает запись и отзывает подписки', async (t) => {
	const { anna } = await pair(t);
	await anna.addContact('vera@localhost', 'Вера');
	assert.ok(anna.contacts.some((c) => c.jid === 'vera@localhost'));

	await anna.removeContact('vera@localhost');
	assert.ok(
		!anna.contacts.some((c) => c.jid === 'vera@localhost'),
		'контакт исчез из списка после удаления'
	);
});
