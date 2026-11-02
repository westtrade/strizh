<script lang="ts">
	import '../lib/app.css';
	import type { LayoutProps } from './$types';

	import LoginScreen from '#lib/components/LoginScreen.svelte';
	import { ChatSession } from '#lib/state/chat.svelte.ts';
	import { setSession } from '#lib/state/context.ts';

	let { children }: LayoutProps = $props();

	// Сессия живёт столько же, сколько корневой layout: перезагрузка страницы
	// создаёт новую, навигация внутри приложения — нет.
	const session = new ChatSession();
	setSession(session);

	$effect(() => {
		session.mount();
		return () => session.unmount();
	});
</script>

<svelte:head>
	<title>Стриж — Jabber-клиент</title>
</svelte:head>

{#if session.authenticated}
	{@render children()}
{:else}
	<LoginScreen />
{/if}
