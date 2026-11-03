<script lang="ts">
	import { bareJid } from '@strizh/xmpp-core';
	import type { Contact } from '@strizh/xmpp-core';
	import Avatar from './Avatar.svelte';
	import SubscriptionRequests from './SubscriptionRequests.svelte';
	import UserMenu from './UserMenu.svelte';
	import { formatDayLabel, formatTime, splitJid } from '#lib/format.ts';
	import { getSession } from '#lib/state/context.ts';

	interface Props {
		onopenSettings: () => void;
		onaddContact: () => void;
		onlogout: () => void;
	}

	let { onopenSettings, onaddContact, onlogout }: Props = $props();
	let session = getSession();

	let self = $derived(session.self ? bareJid(session.self) : '');
	let selfParts = $derived(splitJid(self));

	/** Собеседник без ростера: писал первым, в списке контактов его ещё нет. */
	let extraPeers = $derived(
		Object.keys(session.conversations)
			.filter((peer) => !session.contacts.some((c) => c.jid === peer))
			.map<Contact>((peer) => ({
				jid: peer,
				name: peer.split('@')[0] ?? peer,
				presence: 'offline',
				status: '',
				subscription: 'none'
			}))
	);

	/** Себя в списке собеседников нет: писать самому себе — отдельный сценарий. */
	let visible = $derived(
		[...session.contacts, ...extraPeers].filter(
			(contact) => !session.self || contact.jid !== bareJid(session.self)
		)
	);

	let sorted = $derived(
		[...visible].sort((a, b) => {
			const unreadA = session.unread[a.jid] ?? 0;
			const unreadB = session.unread[b.jid] ?? 0;
			if (unreadA !== unreadB) return unreadB - unreadA;
			const onlineA = a.presence !== 'offline';
			const onlineB = b.presence !== 'offline';
			if (onlineA !== onlineB) return onlineA ? -1 : 1;
			return a.name.localeCompare(b.name, 'ru');
		})
	);

	let onlineCount = $derived(session.contacts.filter((c) => c.presence !== 'offline').length);

	function lastMessage(jid: string): { text: string; at: number } | null {
		const conversation = session.conversations[jid];
		const last = conversation?.[conversation.length - 1];
		if (!last) return null;
		return { text: last.body, at: last.timestamp };
	}

	const PRESENCE_LABEL: Record<Contact['presence'], string> = {
		online: 'в сети',
		away: 'отошёл',
		dnd: 'не беспокоить',
		offline: 'не в сети'
	};
</script>

<aside class="sidebar">
	<header class="me">
		<UserMenu {onlogout} />
		<div class="me-text">
			<strong>{selfParts.local || 'нет сессии'}</strong>
			<span class="mono">{session.online ? 'в сети' : 'выключен'}</span>
		</div>
		<button class="icon" type="button" aria-label="Добавить контакт" onclick={onaddContact}>
			<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7">
				<path d="M10 4v12M4 10h12" stroke-linecap="round" />
			</svg>
		</button>
		<button class="icon" type="button" aria-label="Настройки" onclick={onopenSettings}>
			<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5">
				<circle cx="10" cy="10" r="2.6" />
				<path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" stroke-linecap="round" />
			</svg>
		</button>
	</header>

	<SubscriptionRequests />

	<div class="list-head">
		<span class="mono">контакты</span>
		<span class="mono">{onlineCount} / {session.contacts.length}</span>
	</div>

	<ul class="contacts">
		{#each sorted as contact (contact.jid)}
			{@const last = lastMessage(contact.jid)}
			{@const unread = session.unread[contact.jid] ?? 0}
			{@const typing = session.composing[contact.jid] ?? false}
			<li>
				<button
					type="button"
					class="contact"
					class:active={session.activePeer === contact.jid}
					onclick={() => session.open(contact.jid)}
				>
					<Avatar name={contact.name} jid={contact.jid} size={34} presence={contact.presence} />
					<span class="meta">
						<span class="row">
							<span class="name">{contact.name}</span>
							{#if last}
								<span class="stamp mono">{formatDayLabel(last.at)} {formatTime(last.at)}</span>
							{/if}
						</span>
						<span class="row">
							<span class="preview" class:typing>
								{#if typing}
									печатает…
								{:else if last}
									{last.text}
								{:else if contact.status}
									{contact.status}
								{:else}
									{PRESENCE_LABEL[contact.presence]}
								{/if}
							</span>
							{#if unread > 0}
								<span class="badge">{unread}</span>
							{/if}
						</span>
					</span>
				</button>
			</li>
		{:else}
			<li class="empty">
				<p>Список пуст.</p>
				<button type="button" class="empty-add" onclick={onaddContact}>
					Добавить первый контакт
				</button>
			</li>
		{/each}
	</ul>
</aside>

<style>
	.sidebar {
		display: flex;
		flex-direction: column;
		min-height: 0;
		background: var(--ink-800);
		border-right: 1px solid var(--line);
	}

	.me {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px 14px 12px;
		border-bottom: 1px solid var(--line);
	}

	.me-text {
		display: grid;
		gap: 1px;
		min-width: 0;
		flex: 1 1 auto;
	}

	.me-text strong {
		font-size: 14px;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.icon {
		flex: 0 0 30px;
		height: 30px;
		display: grid;
		place-items: center;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: var(--text-faint);
	}

	.icon:hover {
		color: var(--amber);
		border-color: var(--amber-dim);
	}

	.list-head {
		display: flex;
		justify-content: space-between;
		padding: 10px 14px;
		border-bottom: 1px solid var(--line-soft);
	}

	.contacts {
		list-style: none;
		margin: 0;
		padding: 4px;
		overflow-y: auto;
		flex: 1 1 auto;
		min-height: 0;
	}

	.contact {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border-radius: var(--radius);
		text-align: left;
	}

	.contact:hover {
		background: var(--ink-700);
	}

	.contact.active {
		background: var(--ink-600);
		box-shadow: inset 2px 0 0 var(--amber);
	}

	.meta {
		display: grid;
		gap: 2px;
		min-width: 0;
		flex: 1 1 auto;
	}

	.row {
		display: flex;
		align-items: baseline;
		gap: 8px;
		min-width: 0;
	}

	.name {
		font-size: 14px;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1 1 auto;
	}

	.stamp {
		flex: 0 0 auto;
		font-size: 10px;
	}

	.preview {
		font-size: 12px;
		color: var(--text-faint);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1 1 auto;
	}

	.preview.typing {
		color: var(--amber-dim);
		font-style: italic;
	}

	.badge {
		flex: 0 0 auto;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 9px;
		background: var(--amber);
		color: var(--amber-ink);
		font-family: var(--mono);
		font-size: 10px;
		font-weight: 700;
		display: grid;
		place-items: center;
	}

	.empty {
		padding: 18px 12px;
		color: var(--text-faint);
		font-size: 13px;
		display: grid;
		gap: 8px;
		justify-items: start;
	}

	.empty-add {
		padding: 6px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: var(--text-dim);
		font-size: 12px;
		min-height: 30px;
	}

	.empty-add:hover {
		border-color: var(--amber-dim);
		color: var(--amber);
	}
</style>
