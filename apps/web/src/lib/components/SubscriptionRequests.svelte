<script lang="ts">
	import Avatar from './Avatar.svelte';
	import { getSession } from '#lib/state/context.ts';

	let session = getSession();

	async function answer(jid: string, accept: boolean): Promise<void> {
		await session.answerRequest(jid, accept);
	}
</script>

{#if session.requests.length > 0}
	<section class="requests" aria-label="Заявки на подписку">
		<header>
			<span class="mono">заявки · {session.requests.length}</span>
			<span class="mono">решает человек</span>
		</header>

		<ul>
			{#each session.requests as request (request.jid)}
				<li>
					<Avatar name={request.name} jid={request.jid} size={30} />
					<div class="who">
						<strong>{request.name}</strong>
						<span class="mono">{request.jid}</span>
					</div>
					<div class="actions">
						<button
							type="button"
							class="accept"
							onclick={() => answer(request.jid, true)}
							title="Разрешить видеть ваш статус и запросить встречную подписку"
						>
							Принять
						</button>
						<button
							type="button"
							class="decline"
							onclick={() => answer(request.jid, false)}
							title="Отказать: собеседник не увидит, когда вы в сети"
						>
							Отклонить
						</button>
					</div>
				</li>
			{/each}
		</ul>

		{#if session.rosterError}
			<p class="error" role="alert">{session.rosterError}</p>
		{/if}
	</section>
{/if}

<style>
	.requests {
		border-bottom: 1px solid var(--line);
		background: var(--ink-700);
		padding: 8px 8px 10px;
	}

	header {
		display: flex;
		justify-content: space-between;
		padding: 2px 6px 8px;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 6px;
	}

	li {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 7px 8px;
		background: var(--ink-800);
		border: 1px solid var(--line);
		border-radius: var(--radius);
	}

	.who {
		display: grid;
		gap: 1px;
		min-width: 0;
		flex: 1 1 auto;
	}

	.who strong {
		font-size: 13px;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.who .mono {
		font-size: 10px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.actions {
		display: flex;
		gap: 4px;
		flex: 0 0 auto;
	}

	button {
		font-size: 11px;
		padding: 5px 8px;
		border-radius: var(--radius);
		min-height: 28px;
	}

	.accept {
		background: var(--amber);
		color: var(--amber-ink);
		font-weight: 600;
	}

	.accept:hover {
		background: #ffc95c;
	}

	.decline {
		border: 1px solid var(--line);
		color: var(--text-dim);
	}

	.decline:hover {
		color: var(--dnd);
		border-color: var(--dnd);
	}

	.error {
		margin: 8px 6px 0;
		font-size: 12px;
		color: var(--dnd);
	}
</style>
