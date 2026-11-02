import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

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
	server: { port: 5173, strictPort: true }
});
