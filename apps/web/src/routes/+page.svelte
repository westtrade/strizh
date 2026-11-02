<script lang="ts">
	import ChatView from '#lib/components/ChatView.svelte';
	import ContactList from '#lib/components/ContactList.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import SettingsSheet from '#lib/components/SettingsSheet.svelte';
	import { getSession } from '#lib/state/context.ts';

	let session = getSession();
	let settingsOpen = $state(false);

	async function logout(): Promise<void> {
		settingsOpen = false;
		session.close();
		await session.disconnect();
	}
</script>

<div class="messenger" class:thread-open={session.activePeer !== null}>
	<ContactList onopenSettings={() => (settingsOpen = true)} />

	<main class="main">
		{#if session.activePeer}
			<ChatView online={session.online} onclose={() => session.close()} />
		{:else}
			<EmptyState online={session.online} />
		{/if}
	</main>

	{#if session.status !== 'online'}
		<div class="reconnect" role="status">
			<span class="pulse"></span>
			{session.status === 'connecting' ? 'Подключаемся к серверу…' : 'Соединение потеряно — сервер недоступен'}
		</div>
	{/if}
</div>

{#if settingsOpen}
	<SettingsSheet onclose={() => (settingsOpen = false)} onlogout={logout} />
{/if}

<style>
	.messenger {
		position: relative;
		height: 100dvh;
		display: grid;
		grid-template-columns: 292px minmax(0, 1fr);
	}

	.main {
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	/* Мобильная раскладка: один экран за раз — список контактов или переписка. */
	@media (max-width: 760px) {
		.messenger {
			grid-template-columns: 1fr;
		}

		.messenger.thread-open :global(.sidebar) {
			display: none;
		}

		.messenger:not(.thread-open) .main {
			display: none;
		}
	}

	.reconnect {
		position: absolute;
		left: 50%;
		bottom: calc(14px + env(safe-area-inset-bottom));
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 13px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: var(--ink-700);
		color: var(--text-dim);
		font-size: 12px;
		box-shadow: 0 6px 20px rgb(0 0 0 / 35%);
		z-index: 15;
		pointer-events: none;
	}

	.pulse {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--away);
		animation: pulse 1.4s infinite ease-in-out;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 0.3;
		}
		50% {
			opacity: 1;
		}
	}
</style>
