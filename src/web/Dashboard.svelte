<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from './router';
  import { modal } from './modal';
  import type { Ticket, TicketPriority } from '../server/tickets';
  import type { User } from '../server/auth';

  interface Props {
    currentUser: User;
    onSelectTicket?: (ticket: Ticket) => void;
  }

  let { currentUser, onSelectTicket }: Props = $props();

  interface Summary {
    openCount: number;
    inProgressCount: number;
    criticalActiveCount: number;
    closedTodayCount: number;
  }

  let summary = $state<Summary | null>(null);
  let queue = $state<Ticket[]>([]);
  let isLoading = $state(true);
  let errorMessage = $state('');
  let claimError = $state('');

  // Filters
  let statusFilter = $state<'all' | 'Open' | 'In Progress'>('all');
  let priorityFilter = $state<string>('all');
  let unassignedOnly = $state(false);
  let assignedToMe = $state(false);
  let searchQuery = $state('');
  let assignee = $state('');
  let assignees = $state<{ id: string; username: string }[]>([]);
  let page = $state(1);
  let hasMore = $state(false);
  let generation = 0;

  // Priority correction modal
  let ticketToReprioritize = $state<Ticket | null>(null);
  let newPriority = $state<TicketPriority>('High');
  let priorityReason = $state('');
  let reprioritizeError = $state('');
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

  async function fetchDashboardData(nextPage = 1) {
    const requestGeneration = ++generation;
    isLoading = true;
    errorMessage = '';
    claimError = '';
    try {
      // 1. Fetch summary
      const sumRes = await fetch('/api/dashboard/summary');
      if (!sumRes.ok) throw new Error('Gagal memuat ringkasan dashboard.');
      const sumData: any = await sumRes.json();
      if (requestGeneration !== generation) return;
      summary = sumData.summary;

      // 2. Fetch queue
      const queueUrl = new URL('/api/dashboard/queue', window.location.origin);
      if (statusFilter !== 'all') queueUrl.searchParams.set('status', statusFilter);
      if (priorityFilter !== 'all') queueUrl.searchParams.set('priority', priorityFilter);
      if (unassignedOnly) queueUrl.searchParams.set('unassigned', 'true');
      if (assignedToMe) queueUrl.searchParams.set('assignedToMe', 'true');
      if (searchQuery.trim()) queueUrl.searchParams.set('q', searchQuery.trim());
      if (assignee) queueUrl.searchParams.set('assignee', assignee);
      queueUrl.searchParams.set('page', String(nextPage));

      const qRes = await fetch(queueUrl.toString());
      if (!qRes.ok) throw new Error('Gagal memuat antrean tiket.');
      const qData: any = await qRes.json();
      if (requestGeneration !== generation) return;
      queue = qData.queue || [];
      assignees = qData.assignees || [];
      page = qData.pagination.page;
      hasMore = qData.pagination.hasMore;
    } catch (err: any) {
      if (requestGeneration === generation) errorMessage = err.message || 'Gagal memuat antrean tiket.';
    } finally {
      if (requestGeneration === generation) isLoading = false;
    }
  }

  async function handleClaim(ticket: Ticket, e: Event) {
    e.stopPropagation();
    claimError = '';
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'fetch',
        },
      });

      const data: any = await res.json();
      if (!res.ok) {
        claimError = data.error?.message || 'Tiket sudah diambil oleh petugas lain.';
        await fetchDashboardData();
        return;
      }

      await fetchDashboardData();
    } catch {
      claimError = 'Terjadi kesalahan jaringan saat mengambil tiket.';
    }
  }

  function openPriorityModal(ticket: Ticket, e: Event) {
    e.stopPropagation();
    ticketToReprioritize = ticket;
    newPriority = ticket.priority;
    priorityReason = '';
    reprioritizeError = '';
  }

  async function submitPriorityChange() {
    if (!ticketToReprioritize) return;
    if (!priorityReason.trim() || priorityReason.trim().length < 5) {
      reprioritizeError = 'Alasan perubahan prioritas wajib diisi minimal 5 karakter.';
      return;
    }

    isUpdatingPriority = true;
    reprioritizeError = '';
    try {
      const res = await fetch(`/api/tickets/${ticketToReprioritize.id}/priority`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'fetch',
        },
        body: JSON.stringify({ priority: newPriority, reason: priorityReason.trim() }),
      });

      const data: any = await res.json();
      if (!res.ok) {
        reprioritizeError = data.error?.message || 'Gagal mengubah prioritas.';
        return;
      }

      ticketToReprioritize = null;
      await fetchDashboardData();
    } catch {
      reprioritizeError = 'Terjadi kesalahan jaringan saat menghubungi server.';
    } finally {
      isUpdatingPriority = false;
    }
  }

  function handleOpenTicket(e: MouseEvent, ticket: Ticket) {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (onSelectTicket) {
      onSelectTicket(ticket);
    } else {
      navigate(`/tickets/${ticket.ticketNumber}`);
    }
  }

  function resetFilters() {
    statusFilter = 'all';
    priorityFilter = 'all';
    unassignedOnly = false;
    assignedToMe = false;
    searchQuery = '';
    assignee = '';
    void fetchDashboardData(1);
  }

  onMount(() => {
    void fetchDashboardData();
  });
</script>

<div class="dashboard-view">
  <div class="page-header">
    <div>
      <h1>Antrean IT</h1>
      <p class="page-desc">Antrean kerja prioritas terdepan & FIFO stabil untuk seluruh kendala aktif.</p>
    </div>
    <button type="button" class="btn btn-secondary" onclick={() => fetchDashboardData()}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
      <span>Segarkan</span>
    </button>
  </div>

  <!-- Single Summary Strip (4 columns desktop, 2x2 mobile) -->
  <div class="summary-strip" aria-label="Ringkasan Antrean">
    <div class="summary-item">
      <span class="summary-label">Tiket Open</span>
      <strong class="summary-val tabular-nums">{summary ? summary.openCount : '…'}</strong>
      <span class="summary-sub">Menunggu diambil</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">In Progress</span>
      <strong class="summary-val tabular-nums">{summary ? summary.inProgressCount : '…'}</strong>
      <span class="summary-sub">Sedang ditangani</span>
    </div>
    <div class="summary-item summary-critical">
      <span class="summary-label">Aktif Critical</span>
      <strong class="summary-val tabular-nums">{summary ? summary.criticalActiveCount : '…'}</strong>
      <span class="summary-sub">Urgensi tertinggi</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">Closed Hari Ini</span>
      <strong class="summary-val tabular-nums">{summary ? summary.closedTodayCount : '…'}</strong>
      <span class="summary-sub">Telah diselesaikan</span>
    </div>
  </div>

  <!-- Filters Toolbar -->
  <div class="toolbar-panel">
    <form class="search-form" onsubmit={(e) => { e.preventDefault(); void fetchDashboardData(1); }}>
      <div class="search-input-wrapper">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          id="queue-search"
          type="search"
          aria-label="Cari nomor atau judul tiket"
          placeholder="Cari nomor atau judul…"
          bind:value={searchQuery}
        />
      </div>
      <button type="submit" class="btn btn-secondary">Cari</button>
    </form>

    <div class="filter-controls">
      <div class="filter-item">
        <label for="queue-assignee" class="sr-only">PIC</label>
        <select id="queue-assignee" bind:value={assignee} onchange={() => fetchDashboardData(1)}>
          <option value="">Semua Petugas</option>
          {#each assignees as person}
            <option value={String(person.id)}>{person.username}</option>
          {/each}
        </select>
      </div>

      <div class="filter-item">
        <label for="queue-status" class="sr-only">Filter Status</label>
        <select id="queue-status" bind:value={statusFilter} onchange={() => fetchDashboardData(1)}>
          <option value="all">Semua Aktif</option>
          <option value="Open">Hanya Open</option>
          <option value="In Progress">Hanya In Progress</option>
        </select>
      </div>

      <div class="filter-item">
        <label for="queue-priority" class="sr-only">Filter Prioritas</label>
        <select id="queue-priority" bind:value={priorityFilter} onchange={() => fetchDashboardData(1)}>
          <option value="all">Semua Prioritas</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </div>

      <label class="checkbox-label">
        <input type="checkbox" bind:checked={unassignedOnly} onchange={() => fetchDashboardData(1)} />
        <span>Belum Diambil</span>
      </label>

      <label class="checkbox-label">
        <input type="checkbox" bind:checked={assignedToMe} onchange={() => fetchDashboardData(1)} />
        <span>Ditangani Saya</span>
      </label>

      <button type="button" class="btn btn-secondary" onclick={resetFilters}>
        Reset
      </button>
    </div>
  </div>

  {#if claimError}
    <div class="alert alert-error" role="alert">
      <span>{claimError}</span>
    </div>
  {/if}

  {#if errorMessage}
    <div class="alert alert-error" role="alert">
      <span>{errorMessage}</span>
      <button type="button" class="btn-link" onclick={() => fetchDashboardData()}>Coba lagi</button>
    </div>
  {/if}

  {#if isLoading}
    <div class="loading-state">
      <p>Memuat antrean tiket…</p>
    </div>
  {:else if queue.length === 0}
    <div class="empty-state">
      <p class="empty-state-title">Antrean Kosong</p>
      <p class="empty-state-desc">Tidak ada tiket aktif yang memerlukan penanganan sesuai filter yang dipilih.</p>
      <button type="button" class="btn btn-secondary" onclick={resetFilters}>
        Reset Filter
      </button>
    </div>
  {:else}
    <!-- Desktop Table (≥1024px) -->
    <div class="table-container desktop-only">
      <table class="queue-table">
        <thead>
          <tr>
            <th scope="col">Nomor & Judul</th>
            <th scope="col">Pelapor</th>
            <th scope="col">Prioritas</th>
            <th scope="col">Status</th>
            <th scope="col">PIC</th>
            <th scope="col">Waktu & Usia</th>
            <th scope="col">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {#each queue as ticket}
            <tr>
              <td class="cell-primary">
                <span class="ticket-number tabular-nums">{ticket.ticketNumber}</span>
                <a
                  href={`/tickets/${ticket.ticketNumber}`}
                  class="ticket-title"
                  onclick={(e) => handleOpenTicket(e, ticket)}
                >
                  {ticket.title}
                </a>
              </td>
              <td>
                <span class="user-text"><strong>{ticket.creatorUsername}</strong></span>
              </td>
              <td>
                <span class="badge-priority priority-{ticket.priority.toLowerCase()}">
                  {ticket.priority}
                </span>
              </td>
              <td>
                <span class="badge-status status-{ticket.status.toLowerCase().replace(' ', '-')}">
                  {ticket.status}
                </span>
              </td>
              <td class="cell-muted">
                {#if ticket.assigneeId === currentUser.id}
                  <strong>{ticket.assigneeUsername} (Saya)</strong>
                {:else}
                  {ticket.assigneeUsername || 'Belum diambil'}
                {/if}
              </td>
              <td>
                <div class="time-age-cell">
                  <span class="tabular-nums">{new Date(ticket.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  <span class="age-badge tabular-nums">{formatAge(ticket.createdAt)}</span>
                </div>
              </td>
              <td class="cell-actions-col">
                <div class="actions-wrapper">
                  <a
                    href={`/tickets/${ticket.ticketNumber}`}
                    class="btn btn-secondary btn-sm"
                    onclick={(e) => handleOpenTicket(e, ticket)}
                  >
                    Detail
                  </a>
                  {#if ticket.status === 'Open' && !ticket.assigneeId}
                    <button
                      type="button"
                      class="btn btn-primary btn-sm"
                      onclick={(e) => handleClaim(ticket, e)}
                    >
                      Ambil Tiket
                    </button>
                  {/if}
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    onclick={(e) => openPriorityModal(ticket, e)}
                  >
                    Prioritas
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Mobile Cards (<1024px) -->
    <div class="mobile-only queue-cards-list">
      {#each queue as ticket}
        <article class="queue-card">
          <div class="card-top-row">
            <span class="ticket-number tabular-nums">{ticket.ticketNumber}</span>
            <div class="badge-group">
              <span class="badge-priority priority-{ticket.priority.toLowerCase()}">{ticket.priority}</span>
              <span class="badge-status status-{ticket.status.toLowerCase().replace(' ', '-')}">{ticket.status}</span>
            </div>
          </div>

          <h2 class="card-title">
            <a
              href={`/tickets/${ticket.ticketNumber}`}
              class="ticket-title"
              onclick={(e) => handleOpenTicket(e, ticket)}
            >
              {ticket.title}
            </a>
          </h2>

          <div class="card-details-grid">
            <div class="detail-pair">
              <span class="label">Pelapor:</span>
              <span><strong>{ticket.creatorUsername}</strong></span>
            </div>
            <div class="detail-pair">
              <span class="label">PJ:</span>
              <span>{ticket.assigneeUsername || 'Belum diambil'}</span>
            </div>
            <div class="detail-pair">
              <span class="label">Usia:</span>
              <span class="tabular-nums"><strong>{formatAge(ticket.createdAt)}</strong> ({new Date(ticket.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})</span>
            </div>
          </div>

          <div class="card-actions-row">
            <a
              href={`/tickets/${ticket.ticketNumber}`}
              class="btn btn-secondary"
              onclick={(e) => handleOpenTicket(e, ticket)}
            >
              Lihat Detail
            </a>
            {#if ticket.status === 'Open' && !ticket.assigneeId}
              <button
                type="button"
                class="btn btn-primary"
                onclick={(e) => handleClaim(ticket, e)}
              >
                Ambil Tiket
              </button>
            {/if}
            <button
              type="button"
              class="btn btn-secondary"
              onclick={(e) => openPriorityModal(ticket, e)}
            >
              Ubah Prioritas
            </button>
          </div>
        </article>
      {/each}
    </div>

    {#if page > 1 || hasMore}
      <nav class="pagination-bar" aria-label="Halaman antrean">
        <button
          type="button"
          class="btn btn-secondary"
          disabled={isLoading || page === 1}
          onclick={() => fetchDashboardData(page - 1)}
        >
          Sebelumnya
        </button>
        <span class="pagination-info">Halaman {page}</span>
        <button
          type="button"
          class="btn btn-secondary"
          disabled={isLoading || !hasMore}
          onclick={() => fetchDashboardData(page + 1)}
        >
          Berikutnya
        </button>
      </nav>
    {/if}
  {/if}

  <!-- Priority Correction Modal -->
  {#if ticketToReprioritize}
    <dialog
      class="modal-card"
      use:modal
      aria-labelledby="modal-prio-title"
      oncancel={(e) => { if (isUpdatingPriority) e.preventDefault(); else ticketToReprioritize = null; }}
    >
      <h2 id="modal-prio-title">Koreksi Tingkat Prioritas</h2>
      <p class="field-hint" style="margin-top: 4px;">
        Tiket: <strong class="tabular-nums">{ticketToReprioritize.ticketNumber}</strong>: {ticketToReprioritize.title}
      </p>

      {#if reprioritizeError}
        <div class="alert alert-error" role="alert" style="margin-top: 12px;">
          <span>{reprioritizeError}</span>
        </div>
      {/if}

      <form onsubmit={(e) => { e.preventDefault(); void submitPriorityChange(); }} style="margin-top: 16px; display: flex; flex-direction: column; gap: 16px;">
        <div class="form-group">
          <label for="queue-prio-select">Prioritas Baru <span class="required-mark" aria-hidden="true">*</span></label>
          <select id="queue-prio-select" bind:value={newPriority} disabled={isUpdatingPriority}>
            <option value="Critical">Critical: Layanan penting berhenti</option>
            <option value="High">High: Pekerjaan utama terhambat</option>
            <option value="Medium">Medium: Kendala mengganggu, ada alternatif</option>
            <option value="Low">Low: Gangguan ringan / tidak mendesak</option>
          </select>
        </div>

        <div class="form-group">
          <label for="queue-prio-reason">Alasan Perubahan <span class="required-mark" aria-hidden="true">*</span></label>
          <textarea
            id="queue-prio-reason"
            rows="3"
            bind:value={priorityReason}
            placeholder="Jelaskan alasan penyesuaian prioritas secara rinci…"
            required
            disabled={isUpdatingPriority}
          ></textarea>
        </div>

        <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px;">
          <button
            type="button"
            class="btn btn-secondary"
            disabled={isUpdatingPriority}
            onclick={() => (ticketToReprioritize = null)}
          >
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
  .dashboard-view {
    width: 100%;
    max-width: none;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  .page-desc {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    margin-top: 4px;
  }

  /* Summary Strip: 4 columns desktop, 2x2 mobile */
  .summary-strip {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .summary-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px 20px;
    border-right: 1px solid var(--color-border);
  }

  .summary-item:last-child {
    border-right: none;
  }

  .summary-critical {
    box-shadow: inset 0 3px 0 var(--color-danger);
  }

  .summary-critical .summary-val {
    color: var(--color-danger);
  }

  .summary-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .summary-val {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-text);
    line-height: 1.2;
  }

  .summary-sub {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  /* Toolbar */
  .toolbar-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .search-form {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 480px;
  }

  .search-input-wrapper {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
  }

  .search-input-wrapper svg {
    position: absolute;
    left: 12px;
    color: var(--color-text-muted);
    pointer-events: none;
  }

  .search-input-wrapper input[type='search'] {
    padding-left: 40px;
  }

  .filter-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .filter-item select {
    min-width: 140px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.875rem;
    cursor: pointer;
    user-select: none;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 64px 24px;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    gap: 12px;
  }

  .empty-state-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .empty-state-desc {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    margin-bottom: 8px;
  }

  /* Table */
  .table-container {
    width: 100%;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow-x: auto;
  }

  .queue-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    font-size: 0.875rem;
  }

  .queue-table th {
    padding: 10px 12px;
    font-weight: 600;
    color: var(--color-text-muted);
    background-color: var(--color-bg);
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
  }

  .queue-table td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--color-border);
    vertical-align: middle;
  }

  .queue-table tr:last-child td {
    border-bottom: none;
  }

  .queue-table tr:hover td {
    background-color: var(--color-surface-hover);
  }

  .cell-primary {
    display: table-cell;
  }

  .cell-primary .ticket-title {
    display: block;
    margin-top: 4px;
  }

  .ticket-number {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted);
    letter-spacing: 0.05em;
  }

  .ticket-title {
    color: var(--color-text);
    font-weight: 600;
    text-decoration: none;
    word-break: break-word;
  }

  .ticket-title:hover {
    color: var(--color-link);
    text-decoration: underline;
  }

  .user-text {
    display: block;
    color: var(--color-text);
  }

  .user-sub {
    display: block;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .cell-muted {
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .time-age-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.8125rem;
  }

  .age-badge {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-weight: 600;
  }

  .cell-actions-col {
    vertical-align: middle;
    white-space: nowrap;
  }

  .actions-wrapper {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    vertical-align: middle;
  }

  .btn-sm {
    padding: 6px 12px;
    font-size: 0.8125rem;
    min-height: 36px;
  }

  /* Mobile Cards */
  .queue-cards-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .queue-card {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .card-top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .badge-group {
    display: flex;
    gap: 6px;
  }

  .card-title {
    font-size: 0.95rem;
    line-height: 1.4;
  }

  .card-details-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.8125rem;
    border-top: 1px solid var(--color-border);
    padding-top: 8px;
  }

  .detail-pair {
    display: flex;
    gap: 6px;
    color: var(--color-text);
  }

  .detail-pair .label {
    color: var(--color-text-muted);
    width: 60px;
    flex-shrink: 0;
  }

  .card-actions-row {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }

  .pagination-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 8px 0;
  }

  .pagination-info {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .desktop-only {
    display: block;
  }

  .mobile-only {
    display: none;
  }

  @media (max-width: 1023px) {
    .desktop-only {
      display: none;
    }
    .mobile-only {
      display: flex;
    }
    .summary-strip {
      grid-template-columns: repeat(2, 1fr);
    }
    .summary-item:nth-child(2) {
      border-right: none;
    }
    .summary-item:nth-child(1),
    .summary-item:nth-child(2) {
      border-bottom: 1px solid var(--color-border);
    }
  }

  @media (max-width: 767px) {
    .page-header {
      align-items: flex-start;
    }
    .search-form {
      max-width: none;
      width: 100%;
    }
    .filter-controls {
      width: 100%;
      display: grid;
      grid-template-columns: 1fr;
      align-items: stretch;
    }
    .filter-item,
    .filter-item select,
    .filter-controls > .btn {
      width: 100%;
      min-width: 0;
    }
    .checkbox-label {
      min-height: 44px;
    }
  }
</style>
