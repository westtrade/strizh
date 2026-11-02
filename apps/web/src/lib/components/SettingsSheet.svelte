<script lang="ts">
	import type { Presence } from '@strizh/xmpp-core';
	import { defaultResource, platformLabel } from '#lib/platform.ts';
	import { getSession } from '#lib/state/context.ts';
	import { splitJid } from '#lib/format.ts';

	interface Props {
		onclose: () => void;
		onlogout: () => void;
	}

	let { onclose, onlogout }: Props = $props();
	let session = getSession();

	let self = $derived(splitJid(session.self ?? ''));
	let statusDraft = $state(session.statusText);
	let statusSaved = $state(false);

	const PRESENCES: Array<{ value: Presence; label: string }> = [
		{ value: 'online', label: 'в сети' },
		{ value: 'away', label: 'отошёл' },
		{ value: 'dnd', label: 'не беспокоить' }
	];

	let timer: ReturnType<typeof setTimeout> | null = null;

	function applyStatusText(value: string): void {
		statusDraft = value;
		statusSaved = false;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			void session.changeStatusText(value).then(() => {
				statusSaved = true;
			});
		}, 600);
	}
</script>

<div class="overlay" role="presentation" onclick={onclose}></div>
<section class="sheet" aria-label="Настройки">
	<header>
		<h2>Настройки</h2>
		<button class="close" type="button" aria-label="Закрыть" onclick={onclose}>×</button>
	</header>

	<dl class="info">
		<dt class="mono">учётка</dt>
		<dd>{session.self ?? `${self.local}@${self.domain}`}</dd>
		<dt class="mono">статус</dt>
		<dd>{session.online ? 'соединение активно' : 'нет соединения'}</dd>
		<dt class="mono">платформа</dt>
		<dd>{platformLabel(session.platform)}</dd>
		<dt class="mono">ресурс</dt>
		<dd><code>{defaultResource(session.platform)}</code></dd>
	</dl>

	<div class="block">
		<span class="mono">присутствие</span>
		<div class="presence-row">
			{#each PRESENCES as option (option.value)}
				<button
					type="button"
					class="chip"
					class:on={session.presence === option.value}
					onclick={() => session.changePresence(option.value)}
				>
					<span class="dot {option.value}"></span>
					{option.label}
				</button>
			{/each}
		</div>
	</div>

	<label class="block">
		<span class="mono">статусное сообщение {statusSaved ? '· сохранено' : ''}</span>
		<input
			type="text"
			placeholder="Например: на связи до 19:00"
			value={statusDraft}
			oninput={(event) => applyStatusText(event.currentTarget.value)}
			maxlength="120"
		/>
	</label>

	<div class="block about">
		<span class="mono">о клиенте</span>
		<p>
			Стриж — клиент XMPP без сервера приложения: сообщения идут от вашего устройства к вашему
			Jabber-серверу. Поддерживаются подтверждения доставки (XEP-0184) и индикатор набора
			(XEP-0085).
		</p>
	</div>

	<button class="logout" type="button" onclick={onlogout}>Выйти из учётной записи</button>
</section>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgb(4 6 9 / 62%);
		z-index: 20;
	}

	.sheet {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: min(380px, 92vw);
		z-index: 21;
		background: var(--ink-800);
		border-left: 1px solid var(--line);
		padding: 18px 20px calc(20px + env(safe-area-inset-bottom));
		overflow-y: auto;
		display: grid;
		align-content: start;
		gap: 18px;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
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

	.info {
		display: grid;
		grid-template-columns: 88px 1fr;
		gap: 6px 10px;
		margin: 0;
		padding: 12px;
		border: 1px solid var(--line-soft);
		border-radius: var(--radius);
		background: var(--ink-850);
	}

	.info dt {
		align-self: center;
	}

	.info dd {
		margin: 0;
		font-size: 13px;
		overflow-wrap: anywhere;
	}

	code {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--amber-dim);
	}

	.block {
		display: grid;
		gap: 8px;
	}

	.presence-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		font-size: 12px;
		color: var(--text-dim);
	}

	.chip.on {
		border-color: var(--amber-dim);
		color: var(--text);
		background: var(--ink-700);
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
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

	input {
		width: 100%;
		padding: 9px 11px;
		background: var(--ink-900);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		font-size: 13px;
		outline: none;
	}

	input:focus {
		border-color: var(--amber-dim);
	}

	.about p {
		font-size: 12px;
		color: var(--text-faint);
		line-height: 1.55;
	}

	.logout {
		justify-self: start;
		padding: 8px 12px;
		border: 1px solid var(--dnd);
		border-radius: var(--radius);
		color: var(--dnd);
		font-size: 13px;
	}

	.logout:hover {
		background: rgb(226 100 92 / 12%);
	}
</style>
