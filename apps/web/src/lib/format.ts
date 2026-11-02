/**
 * Форматирование времени и JID для интерфейса.
 */

export function formatTime(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/** Время для заголовка списка: сегодня — часы, вчера — «вчера», дальше — дата. */
export function formatDayLabel(timestamp: number): string {
	const date = new Date(timestamp);
	const today = new Date();
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);

	if (isSameDay(date, today)) return 'сегодня';
	if (isSameDay(date, yesterday)) return 'вчера';
	return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
}

export function isSameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
	);
}

/** `user@example.org` → `user`, с доменом отдельно. */
export function splitJid(jid: string): { local: string; domain: string } {
	const at = jid.indexOf('@');
	if (at === -1) return { local: jid, domain: '' };
	return { local: jid.slice(0, at), domain: jid.slice(at + 1) };
}

export function initials(name: string): string {
	const clean = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim();
	if (!clean) return '?';
	const parts = clean.split(/\s+/u);
	if (parts.length === 1) return (parts[0] ?? '?').slice(0, 2).toUpperCase();
	return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** Стабильный цвет аватара из JID: без палитры на 50 оттенков. */
export function avatarTone(jid: string): number {
	let hash = 0;
	for (let i = 0; i < jid.length; i += 1) {
		hash = (hash * 31 + jid.charCodeAt(i)) % 360;
	}
	return hash;
}
