<script lang="ts">
  import { onMount, tick } from 'svelte';
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
  let messageListEl = $state<HTMLDivElement>();
  let composerEl = $state<HTMLTextAreaElement>();

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
      const byId = new Map(messages.map((message) => [String(message.id), message]));
      for (const message of incoming) byId.set(String(message.id), message);
      messages = [...byId.values()].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || (BigInt(a.id) < BigInt(b.id) ? -1 : 1),
      );
      if (older || !cursor) hasOlder = data.pagination.hasMore;
      if (data.ticketStatus === 'Closed' && !isClosed) onClosed?.();
      remotelyClosed = data.ticketStatus === 'Closed';
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Koneksi terganggu saat memuat pesan.';
    } finally {
      isFetching = false;
    }
  }

  async function handleSendMessage(e: Event) {
    e.preventDefault();
    let sentSuccessfully = false;
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
        res = await fetch(`/api/tickets/${ticketId}/attachments`, {
          method: 'POST',
          headers: { 'X-Requested-With': 'fetch' },
          body: form,
        });
      } else {
        res = await fetch(`/api/tickets/${ticketId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
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
      sentSuccessfully = true;
    } catch {
      sendError = 'Kiriman belum terkonfirmasi. Draft dan berkas tetap tersimpan; tekan Kirim untuk mencoba kembali tanpa duplikat.';
    } finally {
      isSending = false;
      if (sentSuccessfully) {
        await tick();
        composerEl?.focus();
        messageListEl?.scrollTo({ top: messageListEl.scrollHeight, behavior: 'smooth' });
      }
    }
  }

  function handleComposerKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    (event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
  }

  onMount(() => {
    void fetchMessages();
    const interval = setInterval(() => {
      if (!isClosed && document.visibilityState === 'visible') void fetchMessages();
    }, 4000);
    return () => clearInterval(interval);
  });
</script>

<section class="conversation-panel" aria-labelledby="chat-heading">
  <div class="conversation-header">
    <h2 id="chat-heading">Ruang Chat</h2>
    <span class="chat-status-indicator">
      <span class="status-dot" class:active={!isClosed}></span>
      {isClosed ? 'Tiket Closed' : 'Pembaruan otomatis'}
    </span>
  </div>

  {#if errorMessage}
    <div class="alert alert-error" role="alert">
      <span>{errorMessage}</span>
      <button type="button" class="btn-link" onclick={() => fetchMessages()}>Coba lagi</button>
    </div>
  {/if}

  {#if hasOlder}
    <button type="button" class="btn btn-secondary btn-load-older" disabled={isFetching} onclick={() => fetchMessages(true)}>
      Muat pesan sebelumnya
    </button>
  {/if}

  <!-- Messages List -->
  <div class="messages-list" bind:this={messageListEl}>
    {#if messages.length === 0}
      <p class="empty-chat-text">Belum ada pesan dalam tiket ini. Mulai percakapan untuk berdiskusi dengan tim penanganan.</p>
    {:else}
      {#each messages as msg}
        <div class="message-item" class:my-message={String(msg.senderId) === String(currentUser.id)}>
          <div class="message-meta-row">
            <span class="sender-name">
              <strong>{String(msg.senderId) === String(currentUser.id) ? 'Anda' : msg.senderUsername}</strong>
              <span class="badge-role badge-neutral">{msg.senderRole}</span>
            </span>
            <span class="message-time tabular-nums">
              {new Date(msg.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          {#if msg.messageText}
            <div class="message-text">
              {msg.messageText}
            </div>
          {/if}

          {#if msg.attachments && msg.attachments.length > 0}
            <div class="message-attachments">
              <Attachments attachments={msg.attachments} />
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <!-- Chat Composer or Read-Only Notice -->
  {#if isClosed}
    <div class="closed-notice" role="status">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <span>Tiket ditutup. Percakapan hanya dapat dibaca.</span>
    </div>
  {:else}
    {#if sendError}
      <div class="alert alert-error" role="alert">
        <span>{sendError}</span>
      </div>
    {/if}

    <form onsubmit={handleSendMessage} class="chat-composer">
      {#if selectedFiles.length > 0}
        <div class="chips-list">
          {#each selectedFiles as f, idx}
            <div class="file-chip">
              <span class="chip-name">{f.name} ({(f.size / 1024).toFixed(0)} KB)</span>
              <button
                type="button"
                class="btn-remove-chip"
                aria-label={`Hapus lampiran ${f.name}`}
                disabled={isSending || deliveryUncertain}
                onclick={() => removeChatFile(idx)}
              >
                &times;
              </button>
            </div>
          {/each}
        </div>
      {/if}

      <div class="composer-inputs">
        <label class="sr-only" for="chat-message-input">Tulis pesan</label>
        <textarea
          bind:this={composerEl}
          id="chat-message-input"
          rows="3"
          bind:value={newMessage}
          placeholder="Tulis pesan untuk tim IT…"
          disabled={isSending || deliveryUncertain}
          onkeydown={handleComposerKeydown}
        ></textarea>

        <div class="composer-actions">
          <label class="btn btn-secondary btn-attach" for="chat-file-picker">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            <span>Lampirkan Berkas</span>
            <input
              id="chat-file-picker"
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              onchange={handleChatFiles}
              disabled={isSending || deliveryUncertain || selectedFiles.length >= 5}
              class="sr-only"
            />
          </label>

          <button
            type="submit"
            class="btn btn-primary"
            disabled={isSending || (!newMessage.trim() && selectedFiles.length === 0)}
          >
            {isSending ? 'Mengirim…' : 'Kirim Pesan'}
          </button>
        </div>
      </div>
      <span class="field-hint">Maksimal 5 berkas per pesan (JPG, PNG, WebP, PDF hingga 10 MB).</span>
    </form>
  {/if}
</section>

<style>
  .conversation-panel {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    width: 100%;
  }

  .conversation-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--color-border);
    padding-bottom: 12px;
  }

  .chat-status-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: var(--color-text-muted);
  }

  .status-dot.active {
    background-color: var(--color-success);
  }

  .btn-load-older {
    align-self: center;
  }

  .messages-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-height: 480px;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-right: 8px;
  }

  .empty-chat-text {
    text-align: center;
    padding: 32px 16px;
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .message-item {
    display: flex;
    flex-direction: column;
    align-self: flex-start;
    gap: 6px;
    width: min(85%, 560px);
    padding: 12px 16px;
    background-color: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md) var(--radius-md) var(--radius-md) 0;
  }

  .message-item.my-message {
    align-self: flex-end;
    background-color: var(--color-info-bg);
    border-color: var(--color-info);
    border-radius: var(--radius-md) var(--radius-md) 0 var(--radius-md);
  }

  .message-meta-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .sender-name {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.875rem;
    color: var(--color-text);
  }

  .message-time {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .message-text {
    font-size: 0.95rem;
    line-height: 1.5;
    color: var(--color-text);
    word-break: break-word;
    white-space: pre-wrap;
  }

  .message-attachments {
    margin-top: 4px;
  }

  .closed-notice {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    background-color: var(--color-neutral-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-neutral);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .chat-composer {
    display: flex;
    flex-direction: column;
    gap: 12px;
    border-top: 1px solid var(--color-border);
    padding-top: 16px;
  }

  .chips-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .file-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px;
    background-color: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
  }

  .chip-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }

  .btn-remove-chip {
    background: none;
    border: none;
    font-size: 1.1rem;
    line-height: 1;
    color: var(--color-danger);
    cursor: pointer;
    padding: 0 2px;
  }

  .composer-inputs {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .composer-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .btn-attach {
    cursor: pointer;
  }

  .btn-attach:focus-within {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }
</style>
