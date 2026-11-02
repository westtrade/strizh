// Приложение живёт целиком в браузере: XMPP поверх WebSocket, сервера нет.
// prerender даёт index.html-оболочку, ssr=false запрещает серверный рендер.
export const prerender = true;
export const ssr = false;
export const trailingSlash = 'never';
