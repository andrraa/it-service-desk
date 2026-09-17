<script lang="ts">
  import { onMount } from 'svelte';
  import { modal } from './modal';
  import Conversation from './Conversation.svelte';
  import Attachments from './Attachments.svelte';
  import type { Ticket } from '../server/tickets';
  import type { User } from '../server/auth';

  interface Props {
    ticketId: string;
    currentUser: User;
    onBack?: () => void;
  }

  let { ticketId, currentUser, onBack }: Props = $props();

  let ticket = $state<Ticket | null>(null);
  let ticketAttachments = $state<any[]>([]);
  let isLoading = $state(true);
  let errorMessage = $state('');
  let history = $state<{ id: string; action: string; actorUsername: string; createdAt: string; reason: string; oldValue: unknown; newValue: unknown }[]>([]);
  let historyError = $state('');
  let hasMoreHistory = $state(false);
  let loadingHistory = $state(false);

  async function fetchHistory(reset = false) {
    if (loadingHistory) return;
    loadingHistory = true;
    historyError = '';
    try {
      const url = new URL(`/api/tickets/${ticketId}/history`, window.location.origin);
      if (!reset && history.length) url.searchParams.set('before', String(history.at(-1)!.id));
      const response = await fetch(url);
      if (!response.ok) throw new Error('Gagal memuat histori penanganan.');
      const data = await response.json();
      history = reset ? data.history : [...history, ...data.history];
      hasMoreHistory = data.hasMore;
    } catch (error) { historyError = error instanceof Error ? error.message : 'Gagal memuat histori.'; }
    finally { loadingHistory = false; }
  }

  // Close modal
  let showCloseModal = $state(false);
  let solutionText = $state('');
  let closeError = $state('');
  let isClosing = $state(false);

  async function fetchTicketDetail() {
    isLoading = true;
    errorMessage = '';
    try {
      const [resTicket, resAtt] = await Promise.all([
        fetch(`/api/tickets/${ticketId}`),
        fetch(`/api/tickets/${ticketId}/attachments`),
      ]);

      if (!resTicket.ok) {
        if (resTicket.status === 403) throw new Error('Anda tidak berhak melihat tiket ini.');
        if (resTicket.status === 404) throw new Error('Tiket tidak ditemukan.');
        throw new Error('Gagal memuat detail tiket.');
      }

      const dataTicket: any = await resTicket.json();
      ticket = dataTicket.ticket;

      if (resAtt.ok) {
        const dataAtt: any = await resAtt.json();
        ticketAttachments = (dataAtt.attachments || []).filter((a: any) => !a.messageId);
      } else {
        errorMessage = 'Gagal memuat lampiran. Coba muat ulang; ini bukan berarti tiket tidak memiliki lampiran.';
      }
      await fetchHistory(true);
    } catch (err: any) {
      errorMessage = err.message || 'Terjadi kesalahan sistem.';
    } finally {
      isLoading = false;
    }
  }

  async function handleCloseTicket() {
    if (!solutionText.trim() || solutionText.trim().length < 10) {
      closeError = 'Solusi wajib diisi minimal 10 karakter agar penanganan terdokumentasi dengan baik.';
      return;
    }

    isClosing = true;
    closeError = '';
    try {
      const res = await fetch(`/api/tickets/${ticketId}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'fetch',
        },
        body: JSON.stringify({ solution: solutionText.trim() }),
      });

      const data: any = await res.json();
      if (!res.ok) {
        closeError = data.error?.message || 'Gagal menutup tiket.';
        return;
      }

      showCloseModal = false;
      solutionText = '';
      await fetchTicketDetail();
    } catch {
      closeError = 'Terjadi kesalahan jaringan saat menghubungi server.';
    } finally {
      isClosing = false;
    }
  }

  onMount(() => {
    void fetchTicketDetail();
  });
</script>

<div class="detail-container">
  <div class="detail-top-nav">
    <button type="button" class="btn btn-secondary" onclick={onBack}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
      </svg>
      Kembali ke Daftar
    </button>

    {#if ticket && ticket.status !== 'Closed' && (String(ticket.assigneeId) === String(currentUser.id) || currentUser.role === 'Super Admin')}
      <button type="button" class="btn btn-close-action" onclick={() => (showCloseModal = true)}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Selesaikan & Tutup Tiket
      </button>
    {/if}
  </div>

  {#if errorMessage}
    <div class="alert alert-error" role="alert">
      <span>{errorMessage}</span>
      <button type="button" onclick={fetchTicketDetail}>Coba lagi</button>
    </div>
  {/if}

  {#if isLoading}
    <div class="loading-state">
      <p>Memuat rincian tiket…</p>
    </div>
  {:else if ticket}
    <div class="ticket-header-card">
      <div class="ticket-meta-row">
        <span class="ticket-code">{ticket.ticketNumber}</span>
        <div class="badges">
          <span class="badge-priority priority-{ticket.priority.toLowerCase()}">
            Prioritas: {ticket.priority}
          </span>
          <span class="badge-status status-{ticket.status.toLowerCase().replace(' ', '-')}">
            Status: {ticket.status}
          </span>
        </div>
      </div>

      <h1 class="ticket-detail-title">{ticket.title}</h1>

      <div class="ticket-info-grid">
        <div>
          <span class="info-label">Pelapor</span>
          <strong>{ticket.creatorUsername || currentUser.username}</strong>
        </div>
        <div>
          <span class="info-label">Penanggung Jawab (IT)</span>
          <strong>{ticket.assigneeUsername || 'Belum diambil'}</strong>
        </div>
        <div>
          <span class="info-label">Waktu Dibuat</span>
          <span>{new Date(ticket.createdAt).toLocaleString('id-ID')}</span>
        </div>
      </div>
    </div>

    <!-- Closed Resolution Banner (Histori Resmi) -->
    {#if ticket.status === 'Closed' && ticket.resolution}
      <div class="resolution-banner">
        <div class="resolution-header">
          <div class="resolution-tag">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <strong>Solusi & Penyelesaian Masalah</strong>
          </div>
          <span class="resolution-meta">
            Ditutup oleh <strong>{ticket.resolution.resolverUsername}</strong> pada {new Date(ticket.resolution.closedAt).toLocaleString('id-ID')}
          </span>
        </div>
        <p class="resolution-text">{ticket.resolution.solution}</p>
      </div>
    {/if}

    <div class="ticket-content-card">
      <h3>Deskripsi Masalah</h3>
      <p class="description-text">{ticket.description}</p>

      {#if ticketAttachments.length > 0}
        <div style="margin-top: 16px;">
          <Attachments attachments={ticketAttachments} />
        </div>
      {/if}
    </div>

    <details class="ticket-content-card">
      <summary>Aktivitas Penanganan</summary>
      {#if historyError}<p role="alert">{historyError}</p><button disabled={loadingHistory} onclick={() => fetchHistory(history.length === 0)}>Coba lagi</button>{/if}
      <ol class="history-list">
        {#each history as activity}
          <li>
            <strong>{activity.actorUsername}</strong> · {new Date(activity.createdAt).toLocaleString('id-ID')}
            <p>{({ CLAIM_TICKET: 'Mengambil tiket', CHANGE_PRIORITY: 'Mengubah prioritas', CLOSE_TICKET: 'Menutup tiket' } as Record<string, string>)[activity.action] || activity.action}</p>
            <p>{JSON.stringify(activity.oldValue)} → {JSON.stringify(activity.newValue)}</p>
            <p>{activity.reason}</p>
          </li>
        {/each}
      </ol>
      {#if hasMoreHistory}<button disabled={loadingHistory} onclick={() => fetchHistory()}>Muat aktivitas sebelumnya</button>{/if}
    </details>

    <!-- Live Conversation & Polling -->
    <Conversation
      ticketId={ticket.id}
      ticketStatus={ticket.status}
      onClosed={() => { void fetchTicketDetail(); }}
      {currentUser}
    />
  {/if}

  <!-- Close Ticket Modal -->
  {#if showCloseModal && ticket}
    <dialog class="modal-card" use:modal aria-labelledby="modal-close-title"
      oncancel={(event) => { if (isClosing) event.preventDefault(); else showCloseModal = false; }}>
        <h3 id="modal-close-title">Dokumentasi Solusi & Penutupan Tiket</h3>
        <p class="modal-sub">
          Tiket: <strong>{ticket.ticketNumber}</strong> — {ticket.title}
        </p>

        {#if closeError}
          <div class="alert alert-error" role="alert" style="margin-top: 10px;">{closeError}</div>
        {/if}

        <div class="form-group" style="margin-top: 14px;">
          <label for="close-solution">Tindakan Penyelesaian / Solusi (Wajib)</label>
          <textarea
            id="close-solution"
            rows="4"
            bind:value={solutionText}
            placeholder="Tuliskan secara jelas langkah perbaikan atau solusi yang telah dilakukan untuk menyelesaikan kendala ini…"
            disabled={isClosing}
          ></textarea>
          <span class="field-hint">Solusi ini akan terkunci permanen sebagai histori pengetahuan (read-only).</span>
        </div>

        <div class="modal-actions" style="margin-top: 20px;">
          <button type="button" class="btn btn-close-confirm" disabled={isClosing} onclick={handleCloseTicket}>
            {isClosing ? 'Memproses Penutupan…' : 'Tutup Tiket Sekarang'}
          </button>
          <button type="button" class="btn btn-secondary" disabled={isClosing} onclick={() => (showCloseModal = false)}>
            Batal
          </button>
        </div>
    </dialog>
  {/if}
</div>

<style>
  .detail-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .detail-top-nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .ticket-header-card, .ticket-content-card {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 24px;
  }

  .ticket-meta-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .ticket-code {
    font-family: monospace;
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--color-primary);
  }

  .badges {
    display: flex;
    gap: 8px;
  }

  .badge-priority, .badge-status {
    padding: 3px 10px;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 600;
  }



  .ticket-detail-title {
    font-size: 1.4rem;
    margin-bottom: 20px;
    line-height: 1.3;
  }

  .ticket-info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--color-border);
  }

  .info-label {
    display: block;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-bottom: 2px;
  }

  .resolution-banner {
    background-color: rgba(22, 163, 74, 0.08);
    border: 1px solid rgba(22, 163, 74, 0.25);
    border-left: 4px solid var(--color-success);
    border-radius: var(--radius-sm);
    padding: 16px 20px;
  }

  .resolution-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
  }

  .resolution-tag {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-success);
    font-size: 0.95rem;
  }

  .resolution-meta {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .resolution-text {
    font-size: 0.9rem;
    line-height: 1.6;
    color: var(--color-text);
    white-space: pre-wrap;
  }

  .ticket-content-card h3 {
    font-size: 1rem;
    margin-bottom: 12px;
  }

  .description-text {
    font-size: 0.95rem;
    line-height: 1.6;
    white-space: pre-wrap;
    color: var(--color-text);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: var(--radius-sm);
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    border: none;
  }

  .btn-secondary {
    background-color: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border);
  }

  .btn-secondary:hover {
    background-color: var(--color-surface-hover);
  }

  .btn-close-action, .btn-close-confirm {
    background-color: var(--color-primary);
    color: var(--color-primary-text);
  }

  dialog::backdrop { background: rgb(0 0 0 / 50%); }
  dialog { margin: auto; color: var(--color-text); max-height: calc(100dvh - 32px); overflow: auto; }
  .history-list { padding-left: 24px; }
  .history-list li { margin-top: 16px; overflow-wrap: anywhere; }

  .modal-card {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 24px;
    max-width: 500px;
    width: calc(100% - 32px);
  }

  .modal-sub {
    font-size: 0.85rem;
    color: var(--color-text-muted);
    margin-top: 4px;
  }

  .modal-actions {
    display: flex;
    gap: 10px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  label {
    font-size: 0.85rem;
    font-weight: 600;
  }

  textarea {
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background-color: var(--color-bg);
    color: var(--color-text);
    font-size: 0.875rem;
    resize: vertical;
  }

  .field-hint {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .loading-state {
    text-align: center;
    padding: 40px;
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
</style>
