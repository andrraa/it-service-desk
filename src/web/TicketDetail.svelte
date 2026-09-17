<script lang="ts">
  import { onMount } from 'svelte';
  import { modal } from './modal';
  import Conversation from './Conversation.svelte';
  import Attachments from './Attachments.svelte';
  import type { Ticket, TicketPriority } from '../server/tickets';
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

  // Close modal
  let showCloseModal = $state(false);
  let solutionText = $state('');
  let closeError = $state('');
  let isClosing = $state(false);

  // Priority modal (for IT staff / admin)
  let showPriorityModal = $state(false);
  let newPriority = $state<TicketPriority>('High');
  let priorityReason = $state('');
  let priorityError = $state('');
  let isUpdatingPriority = $state(false);

  function formatAge(createdAt: string): string {
    const diffMs = Date.now() - new Date(createdAt).getTime();
    const minutes = Math.max(0, Math.floor(diffMs / 60000));
    if (minutes < 60) return `${minutes} menit`;
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    if (hours < 24) return `${hours} jam ${remainingMins} mnt`;
    const days = Math.floor(hours / 24);
    return `${days} hari ${hours % 24} jam`;
  }

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
    } catch (error) {
      historyError = error instanceof Error ? error.message : 'Gagal memuat histori.';
    } finally {
      loadingHistory = false;
    }
  }

  async function fetchTicketDetail() {
    isLoading = true;
    errorMessage = '';
    try {
      const [resTicket, resAtt] = await Promise.all([
        fetch(`/api/tickets/${ticketId}`),
        fetch(`/api/tickets/${ticketId}/attachments`),
      ]);

      if (!resTicket.ok) {
        if (resTicket.status === 403) throw new Error('Anda tidak memiliki hak akses ke tiket ini.');
        if (resTicket.status === 404) throw new Error('Tiket tidak ditemukan.');
        throw new Error('Gagal memuat detail tiket.');
      }

      const dataTicket: any = await resTicket.json();
      ticket = dataTicket.ticket;

      if (resAtt.ok) {
        const dataAtt: any = await resAtt.json();
        ticketAttachments = (dataAtt.attachments || []).filter((a: any) => !a.messageId);
      } else {
        errorMessage = 'Gagal memuat berkas lampiran. Silakan muat ulang halaman.';
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
      closeError = 'Solusi wajib diisi minimal 10 karakter agar terdokumentasi dengan baik.';
      return;
    }

    isClosing = true;
    closeError = '';
    try {
      const res = await fetch(`/api/tickets/${ticket?.id || ticketId}/close`, {
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
      closeError = 'Terjadi gangguan jaringan saat menghubungi server.';
    } finally {
      isClosing = false;
    }
  }

  async function submitPriorityChange() {
    if (!ticket) return;
    if (!priorityReason.trim() || priorityReason.trim().length < 5) {
      priorityError = 'Alasan perubahan prioritas wajib diisi minimal 5 karakter.';
      return;
    }

    isUpdatingPriority = true;
    priorityError = '';
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/priority`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'fetch',
        },
        body: JSON.stringify({ priority: newPriority, reason: priorityReason.trim() }),
      });

      const data: any = await res.json();
      if (!res.ok) {
        priorityError = data.error?.message || 'Gagal mengubah prioritas.';
        return;
      }

      showPriorityModal = false;
      await fetchTicketDetail();
    } catch {
      priorityError = 'Terjadi kesalahan jaringan.';
    } finally {
      isUpdatingPriority = false;
    }
  }

  onMount(() => {
    void fetchTicketDetail();
  });
</script>

<div class="ticket-detail-view">
  <!-- Top Navigation & Actions -->
  <div class="detail-header-bar">
    <button type="button" class="btn btn-secondary" onclick={onBack}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
      </svg>
      <span>Kembali ke Daftar</span>
    </button>

    <div class="header-actions">
      {#if ticket && ticket.status !== 'Closed' && (currentUser.role === 'IT Staff' || currentUser.role === 'Super Admin')}
        <button
          type="button"
          class="btn btn-secondary"
          onclick={() => {
            newPriority = ticket?.priority || 'High';
            priorityReason = '';
            priorityError = '';
            showPriorityModal = true;
          }}
        >
          Koreksi Prioritas
        </button>
      {/if}

      {#if ticket && ticket.status !== 'Closed' && (String(ticket.assigneeId) === String(currentUser.id) || currentUser.role === 'Super Admin')}
        <button type="button" class="btn btn-primary" onclick={() => { solutionText = ''; closeError = ''; showCloseModal = true; }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>Selesaikan & Tutup Tiket</span>
        </button>
      {/if}
    </div>
  </div>

  {#if errorMessage}
    <div class="alert alert-error" role="alert">
      <span>{errorMessage}</span>
      <button type="button" class="btn-link" onclick={fetchTicketDetail}>Coba lagi</button>
    </div>
  {/if}

  {#if isLoading}
    <div class="loading-state">
      <p>Memuat detail tiket…</p>
    </div>
  {:else if ticket}
    <!-- Two Column Grid Desktop / Single Column Ordered Mobile -->
    <div class="detail-grid">
      <!-- 1 & 2. Main Information Section -->
      <section class="panel-section area-info" aria-labelledby="ticket-main-title">
        <div class="meta-badges-row">
          <span class="ticket-code tabular-nums">{ticket.ticketNumber}</span>
          <div class="badges-row">
            <span class="badge-priority priority-{ticket.priority.toLowerCase()}">
              {ticket.priority}
            </span>
            <span class="badge-status status-{ticket.status.toLowerCase().replace(' ', '-')}">
              {ticket.status}
            </span>
          </div>
        </div>

        <h1 id="ticket-main-title" class="detail-title">{ticket.title}</h1>

        <div class="meta-fields-grid">
          <div class="meta-field">
            <span class="field-label">Pelapor</span>
            <span class="field-val"><strong>{ticket.creatorUsername}</strong></span>
          </div>
          <div class="meta-field">
            <span class="field-label">Penanggung Jawab</span>
            <span class="field-val"><strong>{ticket.assigneeUsername || 'Belum diambil'}</strong></span>
          </div>
          <div class="meta-field">
            <span class="field-label">Waktu Dibuat</span>
            <span class="field-val tabular-nums">
              {new Date(ticket.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </div>
          <div class="meta-field">
            <span class="field-label">Usia Tiket</span>
            <span class="field-val tabular-nums">{formatAge(ticket.createdAt)}</span>
          </div>
        </div>
      </section>

      <!-- 3. Description & Initial Attachments -->
      <section class="panel-section area-desc" aria-labelledby="desc-heading">
        <h2 id="desc-heading" class="section-title">Deskripsi Kendala</h2>
        <p class="description-body">{ticket.description}</p>

        {#if ticketAttachments.length > 0}
          <div class="initial-attachments">
            <Attachments attachments={ticketAttachments} />
          </div>
        {/if}
      </section>

      <!-- 4. Solution (If Closed) -->
      {#if ticket.status === 'Closed' && ticket.resolution}
        <section class="panel-section area-sol solution-box" aria-labelledby="sol-heading">
          <h2 id="sol-heading" class="section-title">Solusi Penanganan</h2>
          <p class="solution-text">{ticket.resolution.solution}</p>
          <div class="solution-meta">
            <span>Ditutup oleh <strong>{ticket.resolution.resolverUsername}</strong></span>
            <span class="tabular-nums">{new Date(ticket.resolution.closedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span>
          </div>
        </section>
      {/if}

      <!-- 5. Chat Conversation -->
      <div class="area-chat">
        <Conversation
          ticketId={ticket.id}
          ticketStatus={ticket.status}
          currentUser={currentUser}
          onClosed={() => { void fetchTicketDetail(); }}
        />
      </div>

      <!-- 6. History / Audit Activities (Details dropdown) -->
      <section class="panel-section area-act" aria-labelledby="act-heading">
        <details class="history-details">
          <summary id="act-heading" class="history-summary">
            <span>Aktivitas Penanganan</span>
            <span class="history-count tabular-nums">({history.length})</span>
          </summary>
          <div class="history-content">
            {#if historyError}
              <div class="alert alert-error" role="alert">
                <span>{historyError}</span>
                <button type="button" class="btn-link" disabled={loadingHistory} onclick={() => fetchHistory(history.length === 0)}>
                  Coba lagi
                </button>
              </div>
            {/if}
            <ol class="history-timeline">
              {#each history as item}
                <li class="timeline-item">
                  <div class="timeline-header">
                    <strong>{item.actorUsername}</strong>
                    <span class="timeline-time tabular-nums">
                      {new Date(item.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                  <p class="timeline-action">
                    {({
                      CLAIM_TICKET: 'Mengambil tiket untuk penanganan',
                      CHANGE_PRIORITY: 'Mengubah tingkat prioritas',
                      CLOSE_TICKET: 'Menutup tiket dengan solusi',
                    } as Record<string, string>)[item.action] || item.action}
                  </p>
                  {#if item.oldValue || item.newValue}
                    <p class="timeline-change">
                      {JSON.stringify(item.oldValue)} &rarr; {JSON.stringify(item.newValue)}
                    </p>
                  {/if}
                  {#if item.reason}
                    <p class="timeline-reason">{item.reason}</p>
                  {/if}
                </li>
              {/each}
            </ol>
            {#if hasMoreHistory}
              <button
                type="button"
                class="btn btn-secondary btn-more-history"
                disabled={loadingHistory}
                onclick={() => fetchHistory()}
              >
                {loadingHistory ? 'Memuat…' : 'Muat aktivitas sebelumnya'}
              </button>
            {/if}
          </div>
        </details>
      </section>
    </div>
  {/if}

  <!-- Close Ticket Modal -->
  {#if showCloseModal && ticket}
    <dialog
      class="modal-card"
      use:modal
      aria-labelledby="modal-close-title"
      oncancel={(e) => { if (isClosing) e.preventDefault(); else showCloseModal = false; }}
    >
      <h2 id="modal-close-title">Dokumentasi Solusi & Penutupan Tiket</h2>
      <p class="field-hint" style="margin-top: 4px;">
        Tiket: <strong class="tabular-nums">{ticket.ticketNumber}</strong> — {ticket.title}
      </p>

      {#if closeError}
        <div class="alert alert-error" role="alert" style="margin-top: 12px;">
          <span>{closeError}</span>
        </div>
      {/if}

      <form onsubmit={(e) => { e.preventDefault(); void handleCloseTicket(); }} style="margin-top: 16px; display: flex; flex-direction: column; gap: 16px;">
        <div class="form-group">
          <label for="close-solution-text">Solusi Penanganan (Wajib)</label>
          <textarea
            id="close-solution-text"
            rows="4"
            bind:value={solutionText}
            placeholder="Jelaskan langkah perbaikan atau solusi teknis yang telah dilakukan secara jelas…"
            required
            disabled={isClosing}
          ></textarea>
          <span class="field-hint">Minimal 10 karakter. Solusi ini akan tersimpan permanen sebagai histori layanan.</span>
        </div>

        <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px;">
          <button type="button" class="btn btn-secondary" disabled={isClosing} onclick={() => (showCloseModal = false)}>
            Batal
          </button>
          <button type="submit" class="btn btn-primary" disabled={isClosing}>
            {isClosing ? 'Menyimpan…' : 'Simpan Solusi & Tutup'}
          </button>
        </div>
      </form>
    </dialog>
  {/if}

  <!-- Priority Correction Modal -->
  {#if showPriorityModal && ticket}
    <dialog
      class="modal-card"
      use:modal
      aria-labelledby="modal-prio-title"
      oncancel={(e) => { if (isUpdatingPriority) e.preventDefault(); else showPriorityModal = false; }}
    >
      <h2 id="modal-prio-title">Koreksi Tingkat Prioritas</h2>
      <p class="field-hint" style="margin-top: 4px;">
        Tiket: <strong class="tabular-nums">{ticket.ticketNumber}</strong>
      </p>

      {#if priorityError}
        <div class="alert alert-error" role="alert" style="margin-top: 12px;">
          <span>{priorityError}</span>
        </div>
      {/if}

      <form onsubmit={(e) => { e.preventDefault(); void submitPriorityChange(); }} style="margin-top: 16px; display: flex; flex-direction: column; gap: 16px;">
        <div class="form-group">
          <label for="prio-select">Prioritas Baru</label>
          <select id="prio-select" bind:value={newPriority} disabled={isUpdatingPriority}>
            <option value="Critical">Critical — Layanan penting berhenti</option>
            <option value="High">High — Pekerjaan utama terhambat</option>
            <option value="Medium">Medium — Kendala mengganggu, ada alternatif</option>
            <option value="Low">Low — Gangguan ringan / tidak mendesak</option>
          </select>
        </div>

        <div class="form-group">
          <label for="prio-reason-text">Alasan Perubahan (Wajib Audit)</label>
          <textarea
            id="prio-reason-text"
            rows="3"
            bind:value={priorityReason}
            placeholder="Jelaskan alasan penyesuaian prioritas secara rinci…"
            required
            disabled={isUpdatingPriority}
          ></textarea>
        </div>

        <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px;">
          <button type="button" class="btn btn-secondary" disabled={isUpdatingPriority} onclick={() => (showPriorityModal = false)}>
            Batal
          </button>
          <button type="submit" class="btn btn-primary" disabled={isUpdatingPriority}>
            {isUpdatingPriority ? 'Menyimpan…' : 'Simpan Perubahan'}
          </button>
        </div>
      </form>
    </dialog>
  {/if}
</div>

<style>
  .ticket-detail-view {
    width: 100%;
    max-width: none;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .detail-header-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  /* Desktop ≥1024px: 2 columns */
  .detail-grid {
    display: grid;
    grid-template-columns: 40% 1fr;
    gap: 24px;
    align-items: start;
    width: 100%;
  }

  .area-info {
    grid-column: 1;
    grid-row: 1;
  }

  .area-desc {
    grid-column: 1;
    grid-row: 2;
  }

  .area-sol {
    grid-column: 1;
    grid-row: 3;
  }

  .area-act {
    grid-column: 1;
    grid-row: 4;
  }

  .area-chat {
    grid-column: 2;
    grid-row: 1 / span 5;
    position: sticky;
    top: 0;
  }

  /* Shared Panel Section */
  .panel-section {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .meta-badges-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .ticket-code {
    font-size: 0.8125rem;
    font-weight: 700;
    color: var(--color-text-muted);
    letter-spacing: 0.05em;
  }

  .badges-row {
    display: flex;
    gap: 8px;
  }

  .detail-title {
    font-size: 1.25rem;
    line-height: 1.4;
    word-break: break-word;
  }

  .meta-fields-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--color-border);
  }

  .meta-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .field-label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .field-val {
    font-size: 0.875rem;
    color: var(--color-text);
  }

  .section-title {
    font-size: 1rem;
    font-weight: 600;
  }

  .description-body {
    font-size: 0.95rem;
    line-height: 1.6;
    color: var(--color-text);
    word-break: break-word;
    white-space: pre-wrap;
  }

  .initial-attachments {
    border-top: 1px solid var(--color-border);
    padding-top: 16px;
  }

  .solution-box {
    border-left: 4px solid var(--color-success);
    background-color: var(--color-surface);
  }

  .solution-text {
    font-size: 0.95rem;
    line-height: 1.5;
    color: var(--color-text);
    word-break: break-word;
    white-space: pre-wrap;
  }

  .solution-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    border-top: 1px solid var(--color-border);
    padding-top: 10px;
    margin-top: 4px;
    flex-wrap: wrap;
    gap: 8px;
  }

  /* History Details */
  .history-details summary {
    cursor: pointer;
    font-weight: 600;
    font-size: 0.95rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    user-select: none;
    list-style: none;
  }

  .history-details summary::-webkit-details-marker {
    display: none;
  }

  .history-details summary::after {
    content: '▾';
    font-size: 1rem;
    color: var(--color-text-muted);
    transition: transform 0.15s ease;
  }

  .history-details[open] summary::after {
    transform: rotate(180deg);
  }

  .history-count {
    color: var(--color-text-muted);
    font-weight: normal;
    font-size: 0.8125rem;
    margin-left: 6px;
  }

  .history-content {
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .history-timeline {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .timeline-item {
    padding: 10px 12px;
    background-color: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .timeline-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .timeline-time {
    color: var(--color-text-muted);
    font-size: 0.75rem;
  }

  .timeline-action {
    font-weight: 500;
    color: var(--color-text);
  }

  .timeline-change {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-family: monospace;
  }

  .timeline-reason {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-style: italic;
  }

  .btn-more-history {
    align-self: center;
  }

  /* Mobile <1024px: Single column with explicit order */
  @media (max-width: 1023px) {
    .detail-grid {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .area-info {
      order: 1;
    }

    .area-desc {
      order: 2;
    }

    .area-sol {
      order: 3;
    }

    .area-chat {
      order: 4;
      position: static;
    }

    .area-act {
      order: 5;
    }

    .meta-fields-grid {
      grid-template-columns: 1fr;
      gap: 12px;
    }
  }
</style>
