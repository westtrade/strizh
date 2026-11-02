<script lang="ts">
	import { bareJid, defaultService, isJid } from '@strizh/xmpp-core';
	import type { StoredAccount } from '#lib/storage.ts';
	import { loadAccounts, removeAccount, saveAccount } from '#lib/storage.ts';
	import { platformLabel } from '#lib/platform.ts';
	import { getSession } from '#lib/state/context.ts';

	let session = getSession();

	// Начальные значения читаем один раз: дальше это независимые поля формы,
	// а не проекция списка учётных записей.
	const initial = loadAccounts();

	let accounts = $state<StoredAccount[]>(initial);
	let selected = $state<string | null>(initial[0]?.jid ?? null);
	let jid = $state(initial[0]?.jid ?? '');
	let password = $state(initial[0]?.password ?? '');
	let service = $state(initial[0]?.service ?? '');
	let showAdvanced = $state(false);

	let busy = $derived(session.status === 'connecting');
	let canSubmit = $derived(isJid(jid) && password.length > 0 && !busy);
	let errorText = $derived(
		session.error ?? (jid && !isJid(jid) ? 'Адрес должен выглядеть как user@example.org' : null)
	);
	/** Подсказка показывает реальный эндпоинт, который уйдёт в соединение. */
	let effectiveService = $derived(
		service.trim() || (isJid(jid) ? defaultService(jid) : 'wss://example.org:5280/xmpp-websocket')
	);

	function pickAccount(account: StoredAccount): void {
		selected = account.jid;
		jid = account.jid;
		password = account.password;
		service = account.service ?? '';
		showAdvanced = false;
	}

	function forget(jidToRemove: string, event: MouseEvent): void {
		event.stopPropagation();
		accounts = removeAccount(jidToRemove);
		if (selected === jidToRemove) {
			selected = null;
			jid = '';
			password = '';
			service = '';
		}
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!canSubmit) return;

		const account: StoredAccount = {
			label: jid.split('@')[0] ?? jid,
			jid: bareJid(jid),
			password,
			service: service.trim() || undefined
		};
		accounts = saveAccount(account);
		selected = account.jid;
		await session.connect(account);
	}

	function startNew(): void {
		selected = null;
		jid = '';
		password = '';
		service = '';
		showAdvanced = true;
	}
</script>

<div class="screen">
	<section class="brand" aria-hidden="true">
		<div class="brand-mark">
			<svg viewBox="0 0 48 48" width="44" height="44" fill="none">
				<path d="M6 30c6-2 9-9 10-16 3 5 4 9 3 12 5-2 7-6 7-11 4 5 5 10 3 15 5-1 9-4 13-8-3 11-12 18-23 18-5 0-10-2-13-5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
				<path d="M11 36c4 2 9 2 14 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
			</svg>
		</div>
		<h1>Стриж</h1>
		<p class="tagline">
			Jabber-клиент, который летает между браузером, десктопом и телефоном.
			Соединение — прямое, через XMPP-сервер; посредников нет.
		</p>
		<ul class="facts">
			<li><span class="mono">транспорт</span> XMPP over WebSocket</li>
			<li><span class="mono">десктоп</span> Tauri · WebView системы</li>
			<li><span class="mono">мобильные</span> Capacitor · Android и iOS</li>
			<li><span class="mono">сейчас</span> {platformLabel(session.platform)}</li>
		</ul>
	</section>

	<section class="panel">
		<header class="panel-head">
			<h2>Вход</h2>
			{#if accounts.length > 0}
				<button class="link" type="button" onclick={startNew}>другая учётка</button>
			{/if}
		</header>

		{#if accounts.length > 0}
			<ul class="accounts">
				{#each accounts as account (account.jid)}
					<li>
						<button
							type="button"
							class="account"
							class:selected={selected === account.jid}
							onclick={() => pickAccount(account)}
						>
							<span class="account-jid">{account.jid}</span>
							<span class="mono">{account.service ? 'свой сервер' : 'сервер по домену'}</span>
						</button>
						<button
							type="button"
							class="forget"
							aria-label="Удалить учётную запись {account.jid}"
							onclick={(event) => forget(account.jid, event)}>×</button
						>
					</li>
				{/each}
			</ul>
		{/if}

		<form onsubmit={submit}>
			<label class="field">
				<span class="mono">Jabber ID</span>
				<input
					type="text"
					name="username"
					autocomplete="username"
					inputmode="email"
					autocapitalize="none"
					autocorrect="off"
					spellcheck="false"
					placeholder="user@example.org"
					bind:value={jid}
					required
				/>
			</label>

			<label class="field">
				<span class="mono">Пароль</span>
				<input type="password" placeholder="••••••••" autocomplete="current-password" bind:value={password} required />
			</label>

			<button class="advanced-toggle" type="button" onclick={() => (showAdvanced = !showAdvanced)}>
				{showAdvanced ? '−' : '+'} свой сервер
			</button>

			{#if showAdvanced}
				<div class="advanced">
					<label class="field">
						<span class="mono">WebSocket-эндпоинт</span>
						<input
							type="url"
							autocapitalize="none"
							autocorrect="off"
							spellcheck="false"
							placeholder={effectiveService}
							bind:value={service}
						/>
					</label>
					<p class="hint">
						Пусто — берётся <code>{effectiveService}</code>. Сервер должен поддерживать
						WebSocket (ejabberd: порт 5280, Prosody: <code>/xmpp-websocket</code>).
					</p>
				</div>
			{/if}

			{#if errorText}
				<p class="error" role="alert">{errorText}</p>
			{/if}

			<button class="submit" type="submit" disabled={!canSubmit}>
				{#if busy}
					Подключаемся…
				{:else}
					Подключиться
				{/if}
			</button>
		</form>

		<p class="footnote">
			Пароль хранится в локальном хранилище устройства — без облака и без синхронизации.
		</p>
	</section>
</div>

<style>
	.screen {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(360px, 440px);
		gap: 56px;
		align-items: center;
		min-height: 100dvh;
		max-width: 1120px;
		margin: 0 auto;
		padding: 48px 32px;
	}

	@media (max-width: 860px) {
		.screen {
			grid-template-columns: 1fr;
			gap: 32px;
			padding: 32px 20px calc(32px + env(safe-area-inset-bottom));
		}

		.brand {
			order: 0;
		}
	}

	.brand-mark {
		color: var(--amber);
		margin-bottom: 16px;
	}

	h1 {
		font-size: 40px;
		font-weight: 600;
		letter-spacing: -0.02em;
		line-height: 1.05;
	}

	.tagline {
		margin-top: 14px;
		color: var(--text-dim);
		max-width: 46ch;
		font-size: 15px;
	}

	.facts {
		list-style: none;
		margin: 28px 0 0;
		padding: 0;
		border-top: 1px solid var(--line);
		max-width: 46ch;
	}

	.facts li {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		padding: 9px 0;
		border-bottom: 1px solid var(--line-soft);
		font-size: 13px;
		color: var(--text-dim);
	}

	.panel {
		background: var(--ink-800);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 24px;
	}

	.panel-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 18px;
	}

	h2 {
		font-size: 16px;
		font-weight: 600;
		letter-spacing: 0.01em;
	}

	.link {
		color: var(--text-faint);
		font-size: 12px;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.link:hover {
		color: var(--amber);
	}

	.accounts {
		list-style: none;
		margin: 0 0 18px;
		padding: 0;
		display: grid;
		gap: 6px;
	}

	.accounts li {
		display: flex;
		align-items: stretch;
		gap: 4px;
	}

	.account {
		flex: 1 1 auto;
		display: grid;
		gap: 2px;
		text-align: left;
		padding: 9px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--ink-700);
		min-width: 0;
	}

	.account:hover {
		border-color: var(--ink-500);
	}

	.account.selected {
		border-color: var(--amber-dim);
		background: var(--ink-600);
	}

	.account-jid {
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.forget {
		flex: 0 0 34px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: var(--text-faint);
		font-size: 17px;
		line-height: 1;
	}

	.forget:hover {
		color: var(--dnd);
		border-color: var(--dnd);
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

	.advanced-toggle {
		justify-self: start;
		color: var(--text-faint);
		font-size: 12px;
		/* Тач-цель не меньше 32px по высоте: на телефоне 21px-кнопка не нажимается. */
		min-height: 32px;
		padding: 6px 0;
	}

	.advanced-toggle:hover {
		color: var(--text-dim);
	}

	.advanced {
		display: grid;
		gap: 8px;
		padding: 12px;
		border: 1px dashed var(--line);
		border-radius: var(--radius);
	}

	.hint {
		font-size: 12px;
		color: var(--text-faint);
		line-height: 1.5;
	}

	code {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--text-dim);
		word-break: break-all;
	}

	.error {
		font-size: 13px;
		color: var(--dnd);
		border-left: 2px solid var(--dnd);
		padding-left: 10px;
	}

	.submit {
		padding: 11px 16px;
		background: var(--amber);
		color: var(--amber-ink);
		border-radius: var(--radius);
		font-weight: 600;
		font-size: 14px;
		transition: background 120ms ease;
	}

	.submit:hover:not(:disabled) {
		background: #ffc95c;
	}

	.submit:disabled {
		background: var(--ink-600);
		color: var(--text-faint);
		cursor: not-allowed;
	}

	.footnote {
		margin-top: 16px;
		font-size: 11px;
		color: var(--text-faint);
		line-height: 1.5;
	}
</style>
