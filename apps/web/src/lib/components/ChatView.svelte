<script lang="ts">
	import Avatar from './Avatar.svelte';
	import { formatDayLabel, formatTime, isSameDay, splitJid } from '#lib/format.ts';
	import { getSession } from '#lib/state/context.ts';

	interface Props {
		online: boolean;
		onclose: () => void;
	}

	let { online, onclose }: Props = $props();
	let session = getSession();

	let contact = $derived(session.activeContact);
	let messages = $derived(session.activeMessages);
	let peer = $derived(session.activePeer ?? '');
	let draft = $derived(session.drafts[peer] ?? '');
	let typing = $derived(online && (session.composing[peer] ?? false));

	/** Группировка по дням: разделители дат в ленте вместо отметки у каждого сообщения. */
	let grouped = $derived.by(() => {
		const groups: Array<{ day: number; label: string; items: typeof messages }> = [];
		for (const message of messages) {
			const last = groups[groups.length - 1];
			const date = new Date(message.timestamp);
			if (last && isSameDay(new Date(last.day), date)) {
				last.items.push(message);
			} else {
				groups.push({ day: message.timestamp, label: formatDayLabel(message.timestamp), items: [message] });
			}
		}
		return groups;
	});

	let peerParts = $derived(splitJid(peer));
	let displayName = $derived(contact?.name || peerParts.local);

	let scrollNode: HTMLDivElement | null = $state(null);

	// Прокрутка вниз при новом сообщении: обновляем после того, как DOM догнал состояние.
	$effect(() => {
		messages.length;
		if (!scrollNode) return;
		scrollNode.scrollTop = scrollNode.scrollHeight;
	});

	function update(event: Event & { currentTarget: HTMLTextAreaElement }): void {
		const text = event.currentTarget.value;
		session.setDraft(peer, text);
		session.notifyTyping(text);
	}

	function submit(event: SubmitEvent): void {
		event.preventDefault();
		const text = draft;
		if (!text.trim()) return;
		void session.send(text);
	}

	/** Enter отправляет, Shift+Enter — перенос строки. На мобильных Enter тоже перенос. */
	function onkeydown(event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }): void {
		if (event.key !== 'Enter' || event.shiftKey) return;
		if (window.matchMedia('(pointer: coarse)').matches) return;
		event.preventDefault();
		if (draft.trim()) void session.send(draft);
	}
</script>

<section class="thread">
	<header class="thread-head">
		<button class="back" type="button" aria-label="К списку" onclick={onclose}>
			<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6">
				<path d="M12 4l-6 6 6 6" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</button>
		<Avatar name={displayName} jid={peer} size={34} presence={contact?.presence ?? 'offline'} />
		<div class="who">
			<strong>{displayName}</strong>
			<span class="mono">
				{#if typing}
					печатает…
				{:else if contact?.status}
					{contact.status}
				{:else}
					{peer}
				{/if}
			</span>
		</div>
	</header>

	<div class="messages" bind:this={scrollNode}>
		{#if messages.length === 0}
			<div class="start">
				<p class="mono">переписка пуста</p>
				<p>Первое сообщение покажет серверу, что вы хотите связаться с <code>{peer}</code>.</p>
			</div>
		{/if}

		{#each grouped as group (group.day)}
			<div class="day"><span class="mono">{group.label}</span></div>
			{#each group.items as message (message.id)}
				<article class="bubble" class:out={message.outgoing}>
					<p class="body">{message.body}</p>
					<footer class="stamp-row">
						<span class="mono">{formatTime(message.timestamp)}</span>
						{#if message.outgoing}
							<span class="tick" class:delivered={message.delivered} title={message.delivered ? 'доставлено' : 'отправлено'}>
								{#if message.delivered}
									✓✓
								{:else}
									✓
								{/if}
							</span>
						{/if}
					</footer>
				</article>
			{/each}
		{/each}

		{#if typing}
			<div class="typing" aria-live="polite">
				<span></span><span></span><span></span>
			</div>
		{/if}
	</div>

	<form class="composer" onsubmit={submit}>
		<textarea
			rows="1"
			placeholder={online ? 'Сообщение…' : 'Нет соединения с сервером'}
			value={draft}
			disabled={!online}
			oninput={update}
			{onkeydown}
		></textarea>
		<button type="submit" disabled={!online || !draft.trim()} aria-label="Отправить">
			<svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6">
				<path d="M3 10l14-6-5 14-2.5-6z" stroke-linejoin="round" />
			</svg>
		</button>
	</form>
</section>

<style>
	.thread {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
		background: var(--ink-850);
	}

	.thread-head {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 11px 16px;
		border-bottom: 1px solid var(--line);
		background: var(--ink-800);
	}

	.back {
		display: none;
		width: 30px;
		height: 30px;
		place-items: center;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: var(--text-dim);
	}

	.who {
		display: grid;
		gap: 1px;
		min-width: 0;
	}

	.who strong {
		font-size: 14px;
		font-weight: 600;
	}

	.who .mono {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 60vw;
	}

	.messages {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		padding: 18px 18px 8px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.start {
		margin: auto;
		max-width: 42ch;
		text-align: center;
		color: var(--text-faint);
		font-size: 13px;
		display: grid;
		gap: 8px;
	}

	.day {
		display: flex;
		justify-content: center;
		margin: 14px 0 6px;
	}

	.day span {
		padding: 2px 8px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--ink-800);
	}

	.bubble {
		max-width: min(74%, 560px);
		padding: 7px 11px 4px;
		border-radius: var(--radius);
		background: var(--ink-700);
		border: 1px solid var(--line);
		align-self: flex-start;
	}

	.bubble.out {
		align-self: flex-end;
		background: #24303f;
		border-color: #2e3d50;
	}

	.body {
		font-size: 14px;
		line-height: 1.45;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.stamp-row {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 5px;
		margin-top: 2px;
	}

	/* Время в пузыре: 10px — минимум, который ещё читается, и контраст выше 3.6. */
	.stamp-row .mono {
		font-size: 10px;
		color: var(--text-dim);
		opacity: 0.85;
	}

	.tick {
		font-size: 10px;
		color: var(--text-faint);
		line-height: 1;
	}

	.tick.delivered {
		color: var(--online);
	}

	.typing {
		align-self: flex-start;
		display: flex;
		gap: 3px;
		padding: 7px 11px;
	}

	.typing span {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--text-faint);
		animation: blink 1.2s infinite ease-in-out;
	}

	.typing span:nth-child(2) {
		animation-delay: 0.15s;
	}

	.typing span:nth-child(3) {
		animation-delay: 0.3s;
	}

	@keyframes blink {
		0%,
		100% {
			opacity: 0.25;
		}
		50% {
			opacity: 1;
		}
	}

	.composer {
		display: flex;
		align-items: flex-end;
		gap: 8px;
		padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
		border-top: 1px solid var(--line);
		background: var(--ink-800);
	}

	textarea {
		flex: 1 1 auto;
		resize: none;
		min-height: 38px;
		max-height: 160px;
		padding: 9px 11px;
		background: var(--ink-900);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		font-size: 14px;
		line-height: 1.4;
		outline: none;
		field-sizing: content;
	}

	textarea:focus {
		border-color: var(--amber-dim);
	}

	.composer button {
		flex: 0 0 38px;
		height: 38px;
		display: grid;
		place-items: center;
		background: var(--amber);
		color: var(--amber-ink);
		border-radius: var(--radius);
	}

	.composer button:disabled {
		background: var(--ink-600);
		color: var(--text-faint);
		cursor: not-allowed;
	}

	@media (max-width: 760px) {
		.back {
			display: grid;
		}

		.bubble {
			max-width: 84%;
		}
	}
</style>
