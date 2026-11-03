/**
 * Версия приложения.
 *
 * Подставляется сборщиком из корневого package.json (`define: __APP_VERSION__`
 * в vite.config.ts). Единственный источник правды — `./scripts/version`;
 * он же обновляет Cargo, Tauri и gradle, так что версия в настройках совпадает
 * с версией бинарника.
 */
declare const __APP_VERSION__: string;

export const appVersion: string =
	typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';
