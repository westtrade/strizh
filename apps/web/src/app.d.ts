// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface Window {
		/** Есть в сборке Tauri: объект инжектится в WebView до загрузки страницы. */
		__TAURI_INTERNALS__?: unknown;
		/** Есть в сборке Capacitor: мост плагинов. */
		Capacitor?: {
			getPlatform?: () => string;
			isNativePlatform?: () => boolean;
		};
	}
}

export {};
