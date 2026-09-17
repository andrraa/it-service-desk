<script lang="ts">
  import { onMount } from 'svelte';
  import { modal } from './modal';
  import type { Ticket, TicketPriority } from '../server/tickets';
  import type { User } from '../server/auth';

  interface Props {
    currentUser: User;
    onSelectTicket?: (ticket: Ticket) => void;
  }

  let { onSelectTicket }: Props = $props();

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

  async function fetchDashboardData(nextPage = 1) {
    const requestGeneration = ++generation;
    isLoading = true;
    errorMessage = '';
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
      if (requestGeneration === generation) errorMessage = err.message || 'Gagal memuat data dashboard.';
    } finally {
      if (requestGeneration === generation) isLoading = false;
    }
  }

  async function handleClaim(ticket: Ticket, e: Event) {
    e.stopPropagation();
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
        alert(data.error?.message || 'Gagal mengambil tiket.');
        return;
      }

      await fetchDashboardData();
    } catch {
      alert('Terjadi kesalahan jaringan saat mengambil tiket.');
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
      reprioritizeError = 'Alasan perubahan prioritas wajib diisi (minimal 5 karakter).';
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
        body: JSON.stringify({ priority: newPriority, reason: priorityReason }),
      });

      const data: any = await res.json();
      if (!res.ok) {
        reprioritizeError = data.error?.message || 'Gagal memperbarui prioritas.';
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

  onMount(() => {
    void fetchDashboardData();
  });
</script>

<div class="dashboard-container">
  <div class="page-heading">
    <div>
      <p class="eyebrow">OPERASIONAL IT</p>
      <h1>Dashboard Penanganan Tiket</h1>
      <p class="page-description">Antrean kerja prioritas terdepan & FIFO stabil untuk seluruh tiket aktif.</p>
    </div>
    <button type="button" class="btn btn-secondary" onclick={() => fetchDashboardData()}>
      Segarkan Antrean
    </button>
  </div>

  <!-- Metric Cards -->
  <div class="metrics-grid">
    <div class="metric-card">
      <span class="metric-label">Tiket Baru (Open)</span>
      <strong class="metric-value">{summary?.openCount ?? '—'}</strong>
      <span class="metric-sub">Menunggu diambil</span>
    </div>
    <div class="metric-card">
      <span class="metric-label">In Progress</span>
      <strong class="metric-value">{summary?.inProgressCount ?? '—'}</strong>
      <span class="metric-sub">Sedang ditangani IT</span>
    </div>
    <div class="metric-card metric-critical">
      <span class="metric-label">Aktif Critical</span>
      <strong class="metric-value">{summary?.criticalActiveCount ?? '—'}</strong>
      <span class="metric-sub">Urgensi tertinggi</span>
    </div>
    <div class="metric-card">
      <span class="metric-label">Selesai Hari Ini</span>
      <strong class="metric-value">{summary?.closedTodayCount ?? '—'}</strong>
      <span class="metric-sub">Tiket Closed</span>
    </div>
  </div>

  <!-- Filters Bar -->
  <div class="filter-panel">
    <form class="filter-row" onsubmit={(event) => { event.preventDefault(); void fetchDashboardData(); }}>
      <div class="filter-group">
        <label for="queue-search">Cari nomor atau judul tiket</label>
        <input id="queue-search" type="search" bind:value={searchQuery} />
      </div>
      <button type="submit" class="btn btn-secondary">Cari</button>
    </form>
    <div class="filter-row">
      <div class="filter-group">
        <label for="queue-assignee">Penanggung jawab</label>
        <select id="queue-assignee" bind:value={assignee} onchange={() => fetchDashboardData()}>
          <option value="">Semua petugas</option>
          {#each assignees as person}<option value={String(person.id)}>{person.username}</option>{/each}
        </select>
      </div>
      <div class="filter-group">
        <label for="f-status">Status</label>
        <select id="f-status" bind:value={statusFilter} onchange={() => fetchDashboardData()}>
          <option value="all">Semua Aktif (Open & In Progress)</option>
          <option value="Open">Hanya Open</option>
          <option value="In Progress">Hanya In Progress</option>
        </select>
      </div>

      <div class="filter-group">
        <label for="f-priority">Prioritas</label>
        <select id="f-priority" bind:value={priorityFilter} onchange={() => fetchDashboardData()}>
          <option value="all">Semua Prioritas</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </div>

      <div class="checkbox-group">
        <label>
          <input type="checkbox" bind:checked={unassignedOnly} onchange={() => fetchDashboardData()} />
          <span>Belum Diambil</span>
        </label>
        <label>
          <input type="checkbox" bind:checked={assignedToMe} onchange={() => fetchDashboardData()} />
          <span>Ditangani Saya</span>
        </label>
      </div>
    </div>
  </div>

  {#if errorMessage}
    <div class="alert alert-error" role="alert">
      <span>{errorMessage}</span>
    </div>
  {/if}

  <!-- Queue Table -->
  {#if isLoading}
    <div class="loading-state">
      <p>Memuat antrean operasional…</p>
    </div>
  {:else if !errorMessage && queue.length === 0}
    <div class="empty-state">
      <h3>Antrean Kosong</h3>
      <p>Tidak ada tiket aktif yang memerlukan penanganan sesuai filter yang dipilih.</p>
    </div>
  {:else if queue.length > 0}
    <div class="table-card">
      <table class="queue-table">
        <thead>
          <tr>
            <th>Nomor</th>
            <th>Pelapor</th>
            <th>Judul</th>
            <th>Prioritas</th>
            <th>Status</th>
            <th>Penanggung Jawab</th>
            <th>Waktu Dibuat</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {#each queue as ticket}
            <tr>
              <td class="cell-number"><strong>{ticket.ticketNumber}</strong></td>
              <td>{ticket.creatorUsername} ({ticket.creatorNik})</td>
              <td class="cell-title">
                <button class="ticket-link" type="button" onclick={() => onSelectTicket?.(ticket)}>{ticket.title}</button>
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
              <td>{ticket.assigneeUsername || '— Belum ada —'}</td>
              <td class="cell-time">{new Date(ticket.createdAt).toLocaleString('id-ID')}<br /><small>Usia: {Math.max(0, Math.floor((Date.now() - new Date(ticket.createdAt).getTime()) / 60000))} menit</small></td>
              <td class="cell-actions">
                {#if ticket.status === 'Open' && !ticket.assigneeId}
                  <button type="button" class="btn-action btn-claim" onclick={(e) => handleClaim(ticket, e)}>
                    Ambil Tiket
                  </button>
                {/if}
                <button type="button" class="btn-action btn-reprioritize" onclick={(e) => openPriorityModal(ticket, e)}>
                  Prioritas
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if page > 1 || hasMore}
    <nav class="filter-row" aria-label="Halaman antrean">
      <button class="btn btn-secondary" disabled={isLoading || page === 1} onclick={() => fetchDashboardData(page - 1)}>Sebelumnya</button>
      <span>Halaman {page}</span>
      <button class="btn btn-secondary" disabled={isLoading || !hasMore} onclick={() => fetchDashboardData(page + 1)}>Berikutnya</button>
    </nav>
  {/if}

  <!-- Priority Correction Modal -->
  {#if ticketToReprioritize}
    <dialog class="modal-card" use:modal aria-labelledby="modal-prio-title"
      oncancel={(event) => { if (isUpdatingPriority) event.preventDefault(); else ticketToReprioritize = null; }}>
        <h3 id="modal-prio-title">Koreksi Tingkat Prioritas</h3>
        <p class="modal-sub">
          Tiket: <strong>{ticketToReprioritize.ticketNumber}</strong> — {ticketToReprioritize.title}
        </p>

        {#if reprioritizeError}
          <div class="alert alert-error" role="alert">{reprioritizeError}</div>
        {/if}

        <div class="form-group" style="margin-top: 14px;">
          <label for="prio-select">Prioritas Baru</label>
          <select id="prio-select" bind:value={newPriority}>
            <option value="Critical">Critical — Layanan penting berhenti</option>
            <option value="High">High — Pekerjaan utama terhambat</option>
            <option value="Medium">Medium — Kendala mengganggu, ada alternatif</option>
            <option value="Low">Low — Gangguan ringan / tidak mendesak</option>
          </select>
        </div>

        <div class="form-group" style="margin-top: 14px;">
          <label for="prio-reason">Alasan Perubahan Prioritas (Wajib Audit)</label>
          <textarea
            id="prio-reason"
            rows="3"
            bind:value={priorityReason}
            placeholder="Jelaskan alasan penyesuaian urgensi tiket ini secara rinci…"
          ></textarea>
          <span class="field-hint">Alasan ini akan tercatat permanen di audit log.</span>
        </div>

        <div class="modal-actions" style="margin-top: 20px;">
          <button type="button" class="btn btn-primary" disabled={isUpdatingPriority} onclick={submitPriorityChange}>
            {isUpdatingPriority ? 'Menyimpan…' : 'Simpan Perubahan'}
          </button>
          <button type="button" class="btn btn-secondary" disabled={isUpdatingPriority} onclick={() => (ticketToReprioritize = null)}>
            Batal
          </button>
        </div>
    </dialog>
  {/if}
</div>

<style>
  .dashboard-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
  }

  .metric-card {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .metric-critical {
    border-left: 4px solid var(--color-danger);
  }

  .metric-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .metric-value {
    font-size: 1.8rem;
    line-height: 1.2;
    color: var(--color-text);
  }

  .metric-sub {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .filter-panel {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 16px 20px;
  }

  .filter-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 16px;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .filter-group label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted);
  }

  select, textarea, input[type='search'] {
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background-color: var(--color-bg);
    color: var(--color-text);
    font-size: 0.85rem;
  }

  .checkbox-group {
    display: flex;
    gap: 16px;
    align-items: center;
    height: 36px;
  }

  .checkbox-group label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .table-card {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow-x: auto;
  }

  .queue-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    font-size: 0.85rem;
  }

  th {
    background-color: var(--color-bg);
    padding: 12px 16px;
    font-weight: 600;
    color: var(--color-text-muted);
    border-bottom: 1px solid var(--color-border);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  td {
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border);
  }

  tr:last-child td {
    border-bottom: none;
  }

  tr:hover td {
    background-color: var(--color-surface-hover);
    cursor: pointer;
  }

  .cell-number {
    font-family: monospace;
    color: var(--color-primary);
  }

  .cell-title {
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cell-actions {
    display: flex;
    gap: 6px;
  }

  .btn-action {
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid var(--color-border);
  }

  .btn-claim {
    background-color: var(--color-primary);
    color: var(--color-primary-text);
    border-color: var(--color-primary);
  }

  .btn-reprioritize {
    background-color: var(--color-bg);
    color: var(--color-text);
  }

  .badge-priority, .badge-status {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
  }



  dialog::backdrop { background: rgb(0 0 0 / 50%); }
  dialog { margin: auto; color: var(--color-text); max-height: calc(100dvh - 32px); overflow: auto; }
  .ticket-link { color: var(--color-primary); background: none; border: 0; text-decoration: underline; text-align: left; cursor: pointer; white-space: normal; }
  form.filter-row { margin-bottom: 16px; }

  .modal-card {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 24px;
    max-width: 480px;
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

  .btn {
    padding: 8px 14px;
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    border: none;
  }

  .btn-primary {
    background-color: var(--color-primary);
    color: var(--color-primary-text);
  }

  .btn-secondary {
    background-color: var(--color-bg);
    border: 1px solid var(--color-border);
    color: var(--color-text);
  }

  .empty-state, .loading-state {
    text-align: center;
    padding: 40px;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
  }

  .alert {
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
  }

  .alert-error {
    background-color: rgba(220, 38, 38, 0.1);
    color: var(--color-danger);
    border: 1px solid rgba(220, 38, 38, 0.2);
  }
</style>
