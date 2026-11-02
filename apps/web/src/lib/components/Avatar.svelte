<script lang="ts">
	import { initials } from '#lib/format.ts';

	interface Props {
		name: string;
		jid: string;
		size?: number;
		/** Показывать точку присутствия в углу. */
		presence?: 'online' | 'away' | 'dnd' | 'offline' | null;
	}

	let { name, jid, size = 36, presence = null }: Props = $props();

	let label = $derived(initials(name || jid));
	let hue = $derived.by(() => {
		let hash = 0;
		for (let i = 0; i < jid.length; i += 1) hash = (hash * 31 + jid.charCodeAt(i)) % 360;
		return hash;
	});
</script>

<span
	class="avatar"
	style:--size="{size}px"
	style:--hue={hue}
	aria-hidden="true"
>
	{label}
	{#if presence}
		<span class="dot {presence}" title={presence}></span>
	{/if}
</span>

<style>
	.avatar {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
		width: var(--size);
		height: var(--size);
		border-radius: var(--radius);
		background: hsl(var(--hue) 28% 22%);
		color: hsl(var(--hue) 55% 82%);
		font-family: var(--mono);
		font-size: calc(var(--size) * 0.36);
		font-weight: 600;
		letter-spacing: 0.02em;
		user-select: none;
	}

	.dot {
		position: absolute;
		right: -2px;
		bottom: -2px;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		border: 2px solid var(--ink-800);
		background: var(--offline);
	}

	.dot.online {
		background: var(--online);
	}

	.dot.away {
		background: var(--away);
	}

	.dot.dnd {
		background: var(--dnd);
	}

	.dot.offline {
		background: var(--offline);
	}
</style>
