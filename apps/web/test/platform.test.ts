import { test } from 'node:test';
import assert from 'node:assert/strict';

import { defaultResource, detectPlatform } from '../src/lib/platform.ts';

test('вне браузера платформа web', () => {
	assert.equal(detectPlatform(), 'web');
});

test('ресурс различается по платформам', () => {
	assert.equal(defaultResource('web'), 'strizh-web');
	assert.equal(defaultResource('desktop'), 'strizh-desktop');
	assert.equal(defaultResource('mobile'), 'strizh-mobile');
});
