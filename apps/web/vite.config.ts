import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// Версия берётся из корневого package.json — того же файла, который правит
// ./scripts/version. Так в UI и в бинарнике всегда одна версия.
const rootPkg = JSON.parse(
	readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
) as { version?: string };

// Статическая сборка: тот же бандл уходит в браузер, в WebView Tauri и в Capacitor.
// fallback обязателен — маршрутизация клиентская, сервера в нативной оболочке нет.
export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ fallback: 'index.html', precompress: false })
		})
	],
	define: {
		__APP_VERSION__: JSON.stringify(rootPkg.version ?? '0.0.0')
	},
	server: { port: 5173, strictPort: true }
});
