/**
 * Платформа запуска: браузер, Tauri (десктоп) или Capacitor (мобильные).
 * От неё зависит ресурс XMPP (одна учётка — несколько устройств) и поведение UI.
 */

export type Platform = 'web' | 'desktop' | 'mobile';

export function detectPlatform(): Platform {
	if (typeof window === 'undefined') return 'web';
	if (window.__TAURI_INTERNALS__) return 'desktop';
	if (window.Capacitor?.isNativePlatform?.()) return 'mobile';
	return 'web';
}

/** Ресурс XMPP: должен различаться на устройствах, иначе сервер выбьет прошлую сессию. */
export function defaultResource(platform: Platform = detectPlatform()): string {
	switch (platform) {
		case 'desktop':
			return 'strizh-desktop';
		case 'mobile':
			return 'strizh-mobile';
		default:
			return 'strizh-web';
	}
}

export function platformLabel(platform: Platform = detectPlatform()): string {
	switch (platform) {
		case 'desktop':
			return 'десктоп · Tauri';
		case 'mobile':
			return 'мобильный · Capacitor';
		default:
			return 'браузер';
	}
}
