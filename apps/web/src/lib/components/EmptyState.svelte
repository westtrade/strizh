<script lang="ts">

	interface Props {
		online: boolean;
	}

	let { online }: Props = $props();
</script>

<div class="empty">
	<div class="glyph" aria-hidden="true">
		<svg viewBox="0 0 64 40" width="72" height="45" fill="none" stroke="currentColor" stroke-width="1.2">
			<rect x="1" y="1" width="62" height="38" rx="3" />
			<path d="M1 9h62M22 9v30" />
			<circle cx="8" cy="5" r="1.2" fill="currentColor" stroke="none" />
			<circle cx="12" cy="5" r="1.2" fill="currentColor" stroke="none" />
		</svg>
	</div>
	{#if !online}
		<p class="title">Нет соединения</p>
		<p class="hint">Клиент переподключается к серверу. Как только связь вернётся, переписка продолжится.</p>
	{:else}
		<p class="title">Выберите собеседника</p>
		<p class="hint">
			Слева — контакты из вашего ростера. Живые переписки помечены числом непрочитанных; остальные
			появятся, как только сервер отдаст список.
		</p>
	{/if}
</div>

<style>
	.empty {
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 10px;
		height: 100%;
		padding: 32px;
		text-align: center;
	}

	.glyph {
		color: var(--ink-500);
		margin-bottom: 6px;
	}

	.title {
		font-size: 16px;
		font-weight: 600;
	}

	.hint {
		max-width: 40ch;
		font-size: 13px;
		color: var(--text-faint);
		line-height: 1.55;
	}
</style>
