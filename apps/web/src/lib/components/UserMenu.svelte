<script lang="ts">
	import { bareJid } from '@strizh/xmpp-core';
	import Avatar from './Avatar.svelte';
	import { getSession } from '#lib/state/context.ts';
	import { splitJid } from '#lib/format.ts';

	interface Props {
		onlogout: () => void;
	}

	let { onlogout }: Props = $props();
	let session = getSession();

	let open = $state(false);
	let copied = $state(false);
	let root: HTMLDivElement | null = $state(null);
	let copyTimer: ReturnType<typeof setTimeout> | null = null;

	/** Полный адрес для показа и копирования: без ресурса устройства. */
	let accountJid = $derived(session.self ? bareJid(session.self) : '');
	let localPart = $derived(splitJid(accountJid).local);

	function toggle(): void {
		open = !open;
		if (!open) copied = false;
	}

	function close(): void {
		open = false;
		copied = false;
	}

	/**
	 * Копирование. `navigator.clipboard` доступен только в защищённом контексте
	 * (https или localhost) — в WebView на `file://` он есть не всегда, поэтому
	 * есть запасной путь через скрытую textarea.
	 */
	async function copy(): Promise<void> {
		const text = accountJid;
		if (!text) return;
		let ok = false;
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(text);
				ok = true;
			}
		} catch {
			ok = false;
		}
		if (!ok) ok = legacyCopy(text);

		if (!ok) return;
		copied = true;
		if (copyTimer) clearTimeout(copyTimer);
		copyTimer = setTimeout(() => (copied = false), 1600);
	}

	function legacyCopy(text: string): boolean {
		try {
			const area = document.createElement('textarea');
			area.value = text;
			area.setAttribute('readonly', '');
			area.style.position = 'fixed';
			area.style.top = '-1000px';
			document.body.appendChild(area);
			area.select();
			const ok = document.execCommand('copy');
			area.remove();
			return ok;
		} catch {
			return false;
		}
	}

	function onWindowClick(event: MouseEvent): void {
		if (!open) return;
		const target = event.target;
		if (root && target instanceof Node && root.contains(target)) return;
		close();
	}

	function onkeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape' && open) close();
	}

	function logout(): void {
		close();
		onlogout();
	}

	$effect(() => () => {
		if (copyTimer) clearTimeout(copyTimer);
	});
</script>

<svelte:window onclick={onWindowClick} {onkeydown} />

<div class="user-menu" bind:this={root}>
	<button
		class="trigger"
		type="button"
		aria-haspopup="menu"
		aria-expanded={open}
		aria-label="Меню учётной записи"
		onclick={toggle}
	>
		<Avatar name={localPart} jid={accountJid} size={38} presence={session.online ? session.presence : 'offline'} />
	</button>

	{#if open}
		<div class="dropdown" role="menu">
			<div class="id-row">
				<span class="id" title={accountJid}>{accountJid}</span>
				<button
					class="copy"
					type="button"
					class:copied
					aria-label={copied ? 'Скопировано' : 'Скопировать адрес'}
					title={copied ? 'Скопировано' : 'Скопировать адрес'}
					onclick={copy}
				>
					{#if copied}
						<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8">
							<path d="M3 8.5l3.2 3.2L13 5" stroke-linecap="round" stroke-linejoin="round" />
						</svg>
					{:else}
						<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4">
							<rect x="5.5" y="5.5" width="8" height="8" rx="1.2" />
							<path d="M10.5 5.5v-1a1.2 1.2 0 0 0-1.2-1.2H3.7a1.2 1.2 0 0 0-1.2 1.2v5.6a1.2 1.2 0 0 0 1.2 1.2h1" stroke-linecap="round" />
						</svg>
					{/if}
				</button>
			</div>

			<div class="divider"></div>

			<button class="logout" type="button" role="menuitem" onclick={logout}>
				<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4">
					<path d="M6 2.5H3.2A1.2 1.2 0 0 0 2 3.7v8.6a1.2 1.2 0 0 0 1.2 1.2H6" stroke-linecap="round" />
					<path d="M10 11l3-3-3-3M13 8H6" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
				Выйти
			</button>
		</div>
	{/if}
</div>

<style>
	.user-menu {
		position: relative;
		flex: 0 0 auto;
	}

	.trigger {
		display: block;
		border-radius: var(--radius);
		line-height: 0;
	}

	/* Кольцо вокруг аватарки — единственный признак, что это кнопка меню. */
	.trigger:hover :global(.avatar),
	.trigger[aria-expanded='true'] :global(.avatar) {
		box-shadow: 0 0 0 1px var(--amber-dim);
	}

	.dropdown {
		position: absolute;
		top: calc(100% + 8px);
		left: 0;
		z-index: 40;
		width: max-content;
		min-width: 232px;
		max-width: min(320px, 78vw);
		padding: 6px;
		background: var(--ink-700);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: 0 14px 38px rgb(0 0 0 / 55%);
	}

	.id-row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 6px 6px 9px;
	}

	.id {
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.02em;
		color: var(--text-dim);
		/* Длинный JID не должен растягивать меню: переносим по точкам. */
		overflow-wrap: anywhere;
		line-height: 1.45;
		flex: 1 1 auto;
		user-select: all;
	}

	.copy {
		flex: 0 0 auto;
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: var(--text-faint);
	}

	.copy:hover {
		color: var(--amber);
		border-color: var(--amber-dim);
	}

	.copy.copied {
		color: var(--online);
		border-color: var(--online);
	}

	.divider {
		height: 1px;
		margin: 4px 2px;
		background: var(--line);
	}

	.logout {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 9px;
		min-height: 34px;
		border-radius: var(--radius);
		color: var(--dnd);
		font-size: 13px;
		text-align: left;
	}

	.logout:hover {
		background: rgb(226 100 92 / 12%);
	}
</style>
