<script lang="ts">
	import { bareJid, isJid } from '@strizh/xmpp-core';
	import { getSession } from '#lib/state/context.ts';

	interface Props {
		onclose: () => void;
	}

	let { onclose }: Props = $props();
	let session = getSession();

	let jid = $state('');
	let name = $state('');
	let busy = $state(false);
	let localError = $state<string | null>(null);

	let valid = $derived(isJid(jid));
	let isSelf = $derived(valid && session.self !== null && bareJid(jid) === bareJid(session.self));
	let alreadyKnown = $derived(
		valid && session.contacts.some((contact) => contact.jid === bareJid(jid))
	);
	let errorText = $derived(localError ?? session.rosterError);

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!valid || isSelf || busy) return;

		busy = true;
		localError = null;
		const ok = await session.addContact(bareJid(jid), name.trim());
		busy = false;
		if (ok) {
			onclose();
			session.open(bareJid(jid));
		}
	}

	function onkeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') onclose();
	}
</script>

<svelte:window {onkeydown} />

<div class="overlay" role="presentation" onclick={onclose}></div>
<div class="dialog" role="dialog" aria-modal="true" aria-label="Добавить контакт">
	<header>
		<h2>Добавить контакт</h2>
		<button class="close" type="button" aria-label="Закрыть" onclick={onclose}>×</button>
	</header>

	<form onsubmit={submit}>
		<label class="field">
			<span class="mono">Jabber ID</span>
			<input
				type="text"
				name="contact-jid"
				autocomplete="off"
				autocapitalize="none"
				autocorrect="off"
				spellcheck="false"
				placeholder="friend@example.org"
				bind:value={jid}
				required
			/>
		</label>

		<label class="field">
			<span class="mono">Имя (необязательно)</span>
			<input type="text" placeholder="Как показывать в списке" bind:value={name} maxlength="60" />
		</label>

		{#if jid && !valid}
			<p class="hint error">Адрес должен выглядеть как <code>user@example.org</code></p>
		{:else if isSelf}
			<p class="hint error">Это ваш собственный адрес</p>
		{:else if alreadyKnown}
			<p class="hint">
				<code>{bareJid(jid)}</code> уже есть в списке. Повторный запрос подписки отправится
				всё равно — это способ напомнить о себе.
			</p>
		{/if}

		{#if errorText}
			<p class="hint error" role="alert">{errorText}</p>
		{/if}

		<p class="hint">
			Собеседнику уйдёт запрос подписки на присутствие: пока он его не примет, вы не увидите,
			в сети ли он.
		</p>

		<div class="actions">
			<button type="button" class="secondary" onclick={onclose}>Отмена</button>
			<button type="submit" class="primary" disabled={!valid || isSelf || busy}>
				{busy ? 'Добавляем…' : 'Добавить'}
			</button>
		</div>
	</form>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgb(4 6 9 / 62%);
		z-index: 30;
	}

	.dialog {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(420px, 92vw);
		z-index: 31;
		background: var(--ink-800);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 20px;
		box-shadow: 0 18px 60px rgb(0 0 0 / 55%);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 16px;
	}

	h2 {
		font-size: 16px;
		font-weight: 600;
	}

	.close {
		width: 28px;
		height: 28px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: var(--text-dim);
		font-size: 16px;
		line-height: 1;
	}

	.close:hover {
		color: var(--text);
		border-color: var(--ink-500);
	}

	form {
		display: grid;
		gap: 14px;
	}

	.field {
		display: grid;
		gap: 6px;
	}

	input {
		width: 100%;
		padding: 10px 12px;
		background: var(--ink-900);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		font-size: 14px;
		outline: none;
	}

	input:focus {
		border-color: var(--amber-dim);
	}

	.hint {
		font-size: 12px;
		color: var(--text-faint);
		line-height: 1.5;
	}

	.hint.error {
		color: var(--dnd);
	}

	code {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--text-dim);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 2px;
	}

	.primary {
		padding: 9px 16px;
		background: var(--amber);
		color: var(--amber-ink);
		border-radius: var(--radius);
		font-weight: 600;
		font-size: 14px;
	}

	.primary:hover:not(:disabled) {
		background: #ffc95c;
	}

	.primary:disabled {
		background: var(--ink-600);
		color: var(--text-faint);
		cursor: not-allowed;
	}

	.secondary {
		padding: 9px 14px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: var(--text-dim);
		font-size: 14px;
	}

	.secondary:hover {
		border-color: var(--ink-500);
		color: var(--text);
	}
</style>
