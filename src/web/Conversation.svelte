<script lang="ts">
  import { onMount } from 'svelte';
  import Attachments from './Attachments.svelte';
  import type { TicketMessage } from '../server/messages';
  import type { User } from '../server/auth';

  interface Props {
    ticketId: string;
    ticketStatus: string;
    currentUser: User;
    onClosed?: () => void;
  }

  let { ticketId, ticketStatus, currentUser, onClosed }: Props = $props();

  let messages = $state<TicketMessage[]>([]);
  let newMessage = $state('');
  let selectedFiles = $state<File[]>([]);
  let isSending = $state(false);
  let errorMessage = $state('');
  let sendError = $state('');
  let deliveryUncertain = $state(false);

  let requestId = crypto.randomUUID();
  let hasOlder = $state(false);
  let isFetching = $state(false);
  let remotelyClosed = $state(false);
  const isClosed = $derived(ticketStatus === 'Closed' || remotelyClosed);

  function handleChatFiles(e: Event) {
    const target = e.target as HTMLInputElement;
    if (!target.files) return;
    const filesArray = Array.from(target.files);

    if (filesArray.length + selectedFiles.length > 5) {
      sendError = 'Maksimal 5 berkas per pesan.';
      return;
    }

    for (const f of filesArray) {
      if (f.size > 10 * 1024 * 1024) {
        sendError = `Berkas '${f.name}' melebihi 10 MB.`;
        return;
      }
    }

    selectedFiles = [...selectedFiles, ...filesArray];
    sendError = '';
    target.value = '';
  }

  function removeChatFile(index: number) {
    selectedFiles = selectedFiles.filter((_, i) => i !== index);
  }

  async function fetchMessages(older = false) {
    if (isFetching) return;
    isFetching = true;
    errorMessage = '';
    try {
      const url = new URL(`/api/tickets/${ticketId}/messages`, window.location.origin);
      const cursor = older ? messages[0]?.id : messages.at(-1)?.id;
      if (cursor) url.searchParams.set(older ? 'before' : 'after', String(cursor));
      const res = await fetch(url);
      if (!res.ok) throw new Error('Gagal memuat percakapan tiket.');
      const data = await res.json();
      const incoming: TicketMessage[] = data.messages;
      const byId = new Map(messages.map(message => [String(message.id), message]));
      for (const message of incoming) byId.set(String(message.id), message);
      messages = [...byId.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
      if (older || !cursor) hasOlder = data.pagination.hasMore;
      if (data.ticketStatus === 'Closed' && !isClosed) onClosed?.();
      remotelyClosed = data.ticketStatus === 'Closed';
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Koneksi terganggu saat memuat pesan.';
    } finally { isFetching = false; }
  }

  async function handleSendMessage(e: Event) {
    e.preventDefault();
    const textToSend = newMessage.trim();
    if (!textToSend && selectedFiles.length === 0) return;

    isSending = true;
    deliveryUncertain = true;
    sendError = '';

    try {
      let res: Response;
      if (selectedFiles.length) {
        const form = new FormData();
        form.append('messageText', textToSend);
        form.append('uploadId', requestId);
        for (const file of selectedFiles) form.append('files', file);
        // Text and files commit together; attachment-only messages need no placeholder.
        res = await fetch(`/api/tickets/${ticketId}/attachments`, { method: 'POST', headers: { 'X-Requested-With': 'fetch' }, body: form });
      } else {
        res = await fetch(`/api/tickets/${ticketId}/messages`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
          body: JSON.stringify({ messageText: textToSend, requestId }),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        if (res.status < 500) deliveryUncertain = false;
        sendError = data.error?.message || 'Gagal mengirim. Draft dan berkas tetap tersedia.';
        return;
      }
      deliveryUncertain = false;
      newMessage = '';
      selectedFiles = [];
      requestId = crypto.randomUUID();
      await fetchMessages();
    } catch {
      sendError = 'Kiriman belum terkonfirmasi. Draft dan berkas tetap tersimpan; tekan Kirim untuk mencoba kembali tanpa duplikat.';
    } finally {
      isSending = false;
    }
  }

  onMount(() => {
    void fetchMessages();
    const interval = setInterval(() => {
      if (!isClosed && document.visibilityState === 'visible') void fetchMessages();
    }, 4000);
    return () => clearInterval(interval);
  });
</script>

<div class="conversation-card">
  <div class="conversation-header">
    <div class="header-info">
      <h3>Ruang Percakapan Tiket</h3>
      <span class="polling-indicator">
        <span class="pulse-dot" class:active={!isClosed}></span>
        {isClosed ? 'Tiket Closed (Read-Only)' : 'Pembaruan otomatis setiap 4 detik'}
      </span>
    </div>
  </div>

  {#if errorMessage}
    <div class="alert alert-error" role="alert">
      <span>{errorMessage}</span>
      <button type="button" class="btn-retry" onclick={() => fetchMessages()}>Coba lagi</button>
    </div>
  {/if}

  {#if hasOlder}
    <button type="button" class="btn-retry" disabled={isFetching} onclick={() => fetchMessages(true)}>Muat pesan sebelumnya</button>
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

          {#if msg.attachments && msg.attachments.length > 0}
            <Attachments attachments={msg.attachments} />
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <!-- Send Form or Read-Only Notice -->
  {#if isClosed}
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
      {#if selectedFiles.length > 0}
        <div class="chips-row">
          {#each selectedFiles as f, idx}
            <span class="file-chip">
              {f.name} ({(f.size / 1024).toFixed(0)} KB)
              <button type="button" class="btn-del-chip" aria-label={`Hapus lampiran ${f.name}`} disabled={isSending || deliveryUncertain} onclick={() => removeChatFile(idx)}>&times;</button>
            </span>
          {/each}
        </div>
      {/if}

      <div class="input-row">
        <label class="btn-attach" for="chat-files">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
          <span>Lampirkan berkas</span>
          <input
            id="chat-files"
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            onchange={handleChatFiles}
            disabled={isSending || deliveryUncertain || selectedFiles.length >= 5}
            class="sr-only"
          />
        </label>
        <label class="sr-only" for="chat-message">Pesan</label>
        <textarea
          id="chat-message"
          rows="2"
          bind:value={newMessage}
          placeholder="Tulis pesan atau tanggapan kendala…"
          disabled={isSending || deliveryUncertain}
        ></textarea>
        <button type="submit" class="btn btn-primary" disabled={isSending || (!newMessage.trim() && selectedFiles.length === 0)}>
          {isSending ? 'Mengirim…' : 'Kirim'}
        </button>
      </div>
      <span class="field-hint">Maksimal 5 berkas per pesan (JPG, PNG, WebP, PDF hingga 10 MB).</span>
    </form>
  {/if}
</div>

<style>
  .btn-attach:focus-within { outline: 2px solid var(--color-primary); outline-offset: 2px; }
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
    gap: 8px;
    border-top: 1px solid var(--color-border);
    padding-top: 14px;
  }

  .chips-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .file-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background-color: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    font-size: 0.75rem;
  }

  .btn-del-chip {
    background: none;
    border: none;
    color: var(--color-danger);
    font-size: 0.9rem;
    cursor: pointer;
    padding: 0 2px;
  }

  .input-row {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }

  .btn-attach {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background-color: var(--color-bg);
    color: var(--color-text-muted);
    cursor: pointer;
    flex-shrink: 0;
  }

  .btn-attach:hover {
    color: var(--color-primary);
    background-color: var(--color-surface);
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
