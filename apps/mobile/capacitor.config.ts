import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Мобильная оболочка: тот же статический бандл SvelteKit, что и в браузере.
 *
 * `webDir` смотрит на сборку apps/web — отдельной мобильной сборки нет,
 * иначе пришлось бы держать два расходящихся фронтенда.
 */
const config: CapacitorConfig = {
	appId: 'app.strizh.mobile',
	appName: 'Стриж',
	webDir: '../web/build',
	android: {
		// WebView-клиент XMPP работает только по wss; cleartext нужен лишь для
		// локального мок-сервера на 127.0.0.1 при разработке.
		allowMixedContent: false
	},
	server: {
		androidScheme: 'https'
	}
};

export default config;
