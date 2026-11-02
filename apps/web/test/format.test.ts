import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatDayLabel, formatTime, initials, splitJid } from '../src/lib/format.ts';

test('splitJid делит адрес на локальную часть и домен', () => {
	assert.deepEqual(splitJid('user@example.org'), { local: 'user', domain: 'example.org' });
	assert.deepEqual(splitJid('example.org'), { local: 'example.org', domain: '' });
});

test('initials даёт одну или две буквы', () => {
	assert.equal(initials('Иван Петров'), 'ИП');
	assert.equal(initials('мария'), 'МА');
	assert.equal(initials(''), '?');
	assert.equal(initials('@#$'), '?');
});

test('formatTime выводит часы и минуты', () => {
	assert.match(formatTime(Date.UTC(2026, 0, 2, 9, 5)), /^\d{2}:\d{2}$/u);
});

test('formatDayLabel узнаёт сегодня и вчера', () => {
	assert.equal(formatDayLabel(Date.now()), 'сегодня');
	const yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 1);
	assert.equal(formatDayLabel(yesterday.getTime()), 'вчера');
});
