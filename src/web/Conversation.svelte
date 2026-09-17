<script lang="ts">
  import { onMount } from 'svelte';
  import type { TicketMessage } from '../server/messages';
  import type { User } from '../server/auth';

  interface Props {
    ticketId: string;
    ticketStatus: string;
    currentUser: User;
  }

  let { ticketId, ticketStatus, currentUser }: Props = $props();

  let messages = $state<TicketMessage[]>([]);
  let newMessage = $state('');
  let draftBackup = $state('');
  let isSending = $state(false);
  let errorMessage = $state('');
  let sendError = $state('');

  let pollingInterval: any = null;

  async function fetchMessages(silent = false) {
    if (!silent) errorMessage = '';
    try {
      const res = await fetch(`/api/tickets/${ticketId}/messages`);
      if (!res.ok) {
        if (!silent) errorMessage = 'Gagal memuat percakapan tiket.';
        return;
      }
      const data: any = await res.json();
      messages = data.messages || [];
    } catch {
      if (!silent) errorMessage = 'Koneksi terganggu saat memuat pesan.';
    }
  }

  async function handleSendMessage(e: Event) {
    e.preventDefault();
    const textToSend = newMessage.trim();
    if (!textToSend) return;

    isSending = true;
    sendError = '';
    draftBackup = newMessage; // Retain draft in case of failure

    try {
      const res = await fetch(`/api/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'fetch',
        },
        body: JSON.stringify({ messageText: textToSend }),
      });

      const data: any = await res.json();

      if (!res.ok) {
        sendError = data.error?.message || 'Gagal mengirim pesan.';
        // Keep draft preserved in textarea
        return;
      }

      // Success: clear input & draft
      newMessage = '';
      draftBackup = '';
      await fetchMessages(true);
    } catch {
      sendError = 'Koneksi terputus saat mengirim pesan. Draft Anda tetap tersimpan.';
    } finally {
      isSending = false;
    }
  }

  onMount(() => {
    void fetchMessages();
    // Auto-polling target PRD: <= 5 seconds on active tickets
    if (ticketStatus !== 'Closed') {
      pollingInterval = setInterval(() => {
        void fetchMessages(true);
      }, 4000);
    }

    return () => {
      if (pollingInterval) clearInterval(pollingInterval);
    };
  });
</script>

<div class="conversation-card">
  <div class="conversation-header">
    <div class="header-info">
      <h3>Ruang Percakapan Tiket</h3>
      <span class="polling-indicator">
        <span class="pulse-dot" class:active={ticketStatus !== 'Closed'}></span>
        {ticketStatus === 'Closed' ? 'Tiket Closed (Read-Only)' : 'Pembaruan otomatis aktif (4d)'}
      </span>
    </div>
  </div>

  {#if errorMessage}
    <div class="alert alert-error" role="alert">
      <span>{errorMessage}</span>
      <button type="button" class="btn-retry" onclick={() => fetchMessages()}>Coba lagi</button>
    </div>
  {/if}

  <!-- Messages Flow -->
  <div class="messages-list">
    {#if messages.length === 0}
      <div class="empty-conversation">
        <p>Belum ada pesan dalam tiket ini. Mulai percakapan untuk berdiskusi dengan tim penanganan.</p>
      </div>
    {:else}
      {#each messages as msg}
        <div class="message-bubble" class:my-message={String(msg.senderId) === String(currentUser.id)}>
          <div class="message-meta">
            <span class="sender-name">
              <strong>{msg.senderUsername}</strong>
              <span class="role-tag role-{msg.senderRole.toLowerCase().replace(' ', '-')}">{msg.senderRole}</span>
            </span>
            <span class="message-time">{new Date(msg.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div class="message-body">
            {msg.messageText}
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Send Form or Read-Only Notice -->
  {#if ticketStatus === 'Closed'}
    <div class="closed-notice">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <span>Tiket telah ditutup dan diarsipkan. Seluruh percakapan terkunci sebagai histori.</span>
    </div>
  {:else}
    {#if sendError}
      <div class="alert alert-error" role="alert">
        <span>{sendError}</span>
      </div>
    {/if}

    <form onsubmit={handleSendMessage} class="message-form">
      <div class="input-row">
        <textarea
          rows="2"
          bind:value={newMessage}
          placeholder="Tulis pesan atau tanggapan kendala…"
          disabled={isSending}
          required
        ></textarea>
        <button type="submit" class="btn btn-primary" disabled={isSending || !newMessage.trim()}>
          {isSending ? 'Mengirim…' : 'Kirim'}
        </button>
      </div>
      <span class="field-hint">Pesan baru akan langsung muncul di sisi tim IT tanpa perlu refresh.</span>
    </form>
  {/if}
</div>

<style>
  .conversation-card {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .conversation-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--color-border);
    padding-bottom: 12px;
  }

  .conversation-header h3 {
    font-size: 1.05rem;
  }

  .polling-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .pulse-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: var(--color-text-muted);
  }

  .pulse-dot.active {
    background-color: var(--color-success);
    box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.2);
  }

  .messages-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 480px;
    overflow-y: auto;
    padding-right: 4px;
  }

  .empty-conversation {
    text-align: center;
    padding: 32px 16px;
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .message-bubble {
    background-color: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 12px 14px;
    max-width: 80%;
    align-self: flex-start;
  }

  .message-bubble.my-message {
    align-self: flex-end;
    background-color: rgba(37, 99, 235, 0.08);
    border-color: rgba(37, 99, 235, 0.2);
  }

  .message-meta {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 6px;
    font-size: 0.75rem;
  }

  .sender-name {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .role-tag {
    font-size: 0.65rem;
    font-weight: 600;
    padding: 1px 4px;
    border-radius: 3px;
    border: 1px solid var(--color-border);
  }

  .role-it-staff, .role-super-admin {
    background-color: var(--color-primary);
    color: var(--color-primary-text);
    border: none;
  }

  .role-user {
    background-color: var(--color-surface);
    color: var(--color-text-muted);
  }

  .message-time {
    color: var(--color-text-muted);
  }

  .message-body {
    font-size: 0.875rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .closed-notice {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px;
    background-color: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    font-size: 0.85rem;
  }

  .message-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid var(--color-border);
    padding-top: 14px;
  }

  .input-row {
    display: flex;
    gap: 10px;
    align-items: flex-end;
  }

  textarea {
    flex: 1;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background-color: var(--color-bg);
    color: var(--color-text);
    font-size: 0.875rem;
    resize: vertical;
  }

  textarea:focus {
    border-color: var(--color-primary);
    outline: none;
  }

  .btn {
    padding: 10px 16px;
    border-radius: var(--radius-sm);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    border: none;
    height: 42px;
  }

  .btn-primary {
    background-color: var(--color-primary);
    color: var(--color-primary-text);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .field-hint {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .alert {
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
  }

  .alert-error {
    background-color: rgba(220, 38, 38, 0.1);
    color: var(--color-danger);
    border: 1px solid rgba(220, 38, 38, 0.2);
  }

  .btn-retry {
    background: none;
    border: none;
    color: var(--color-primary);
    font-weight: 600;
    margin-left: 8px;
    cursor: pointer;
  }
</style>
