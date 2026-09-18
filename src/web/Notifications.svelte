<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from './router';

  interface Notification {
    id: string;
    ticketNumber: string;
    ticketTitle: string;
    senderName: string;
    readAt: string | null;
    createdAt: string;
  }

  let notifications = $state<Notification[]>([]);
  let unreadCount = $state(0);
  let open = $state(false);

  async function loadNotifications() {
    const response = await fetch('/api/notifications');
    if (!response.ok) return;
    const data = await response.json();
    notifications = data.notifications || [];
    unreadCount = data.unreadCount || 0;
  }

  async function openNotification(notification: Notification) {
    if (!notification.readAt) {
      const response = await fetch(`/api/notifications/${notification.id}/read`, {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'fetch' },
      });
      if (response.ok) unreadCount = Math.max(0, unreadCount - 1);
    }
    open = false;
    navigate(`/tickets/${notification.ticketNumber}`);
  }

  onMount(() => {
    void loadNotifications();
    const events = new EventSource('/api/notifications/stream');
    events.addEventListener('notification', () => void loadNotifications());
    return () => events.close();
  });
</script>

<div class="notification-control">
  <button type="button" class="notification-button" aria-label={`Notifikasi, ${unreadCount} belum dibaca`} aria-expanded={open} onclick={() => { open = !open; if (open) void loadNotifications(); }}>
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" />
    </svg>
    {#if unreadCount > 0}<span class="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>{/if}
  </button>

  {#if open}
    <div class="notification-menu">
      <strong>Notifikasi</strong>
      {#if notifications.length === 0}
        <p class="notification-empty">Belum ada notifikasi.</p>
      {:else}
        {#each notifications as notification}
          <button type="button" class="notification-item" class:unread={!notification.readAt} onclick={() => openNotification(notification)}>
            <span><strong>{notification.senderName}</strong> membalas {notification.ticketNumber}</span>
            <small>{notification.ticketTitle}</small>
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>
