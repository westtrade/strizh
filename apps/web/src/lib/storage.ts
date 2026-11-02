/**
 * Хранение учётных записей и черновиков в localStorage.
 *
 * Пароль не шифруется: локальное хранилище WebView — это уже песочница
 * приложения, а полноценное шифрование потребует платформенного keychain
 * (Tauri Stronghold / Capacitor Preferences с biometric). Это следующий шаг,
 * и он явно помечен в README как долг.
 */
import type { Account } from '@strizh/xmpp-core';

const ACCOUNTS_KEY = 'strizh.accounts.v1';
const LAST_JID_KEY = 'strizh.lastJid.v1';
const DRAFTS_KEY = 'strizh.drafts.v1';

export interface StoredAccount extends Account {
	/** Человеческое имя для списка аккаунтов. */
	label: string;
}

function readJson<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return fallback;
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

function writeJson(key: string, value: unknown): void {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// приватный режим или переполнение — молча теряем запись, сессия важнее
	}
}

export function loadAccounts(): StoredAccount[] {
	const stored = readJson<StoredAccount[]>(ACCOUNTS_KEY, []);
	return Array.isArray(stored) ? stored.filter((a) => typeof a?.jid === 'string') : [];
}

export function saveAccount(account: StoredAccount): StoredAccount[] {
	const accounts = loadAccounts().filter((a) => a.jid !== account.jid);
	const next = [account, ...accounts].slice(0, 10);
	writeJson(ACCOUNTS_KEY, next);
	writeJson(LAST_JID_KEY, account.jid);
	return next;
}

export function removeAccount(jid: string): StoredAccount[] {
	const next = loadAccounts().filter((a) => a.jid !== jid);
	writeJson(ACCOUNTS_KEY, next);
	return next;
}

export function lastJid(): string {
	return readJson<string>(LAST_JID_KEY, '');
}

export function loadDrafts(): Record<string, string> {
	const stored = readJson<Record<string, string>>(DRAFTS_KEY, {});
	return stored && typeof stored === 'object' ? stored : {};
}

export function saveDraft(peer: string, text: string): void {
	const drafts = loadDrafts();
	if (text) drafts[peer] = text;
	else delete drafts[peer];
	writeJson(DRAFTS_KEY, drafts);
}
