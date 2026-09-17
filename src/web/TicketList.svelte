<script lang="ts">
  import { onMount } from 'svelte';
  import type { Ticket } from '../server/tickets';

  interface Props {
    onSelectTicket?: (ticket: Ticket) => void;
    onCreateNewTicket?: () => void;
    canViewAll?: boolean;
  }

  let { onSelectTicket, onCreateNewTicket, canViewAll = false }: Props = $props();

  let tickets = $state<Ticket[]>([]);
  let searchQuery = $state('');
  let statusFilter = $state('');
  let allTickets = $state(false);
  let generation = 0;
  let page = $state(1);
  let totalPages = $state(1);
  let totalTickets = $state(0);
  let isLoading = $state(true);
  let errorMessage = $state('');

  async function fetchTickets(targetPage = page, query = searchQuery) {
    const currentGeneration = ++generation;
    isLoading = true;
    errorMessage = '';
    try {
      const url = new URL('/api/tickets', window.location.origin);
      url.searchParams.set('page', String(targetPage));
      url.searchParams.set('limit', '10');
      if (statusFilter) url.searchParams.set('status', statusFilter);
      if (!allTickets) url.searchParams.set('mine', 'true');
      if (query.trim()) {
        url.searchParams.set('q', query.trim());
      }

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Gagal mengambil daftar tiket.');
      const data: any = await res.json();
      if (currentGeneration !== generation) return;
      tickets = data.tickets || [];
      if (data.pagination) {
        page = data.pagination.page;
        totalPages = data.pagination.totalPages;
        totalTickets = data.pagination.total;
      }
    } catch {
      if (currentGeneration === generation) errorMessage = 'Tidak dapat memuat tiket. Periksa koneksi ke server.';
    } finally {
      if (currentGeneration === generation) isLoading = false;
    }
  }

  function handleSearch(e: Event) {
    e.preventDefault();
    page = 1;
    void fetchTickets(1, searchQuery);
  }

  function handlePageChange(newPage: number) {
    if (newPage < 1 || newPage > totalPages) return;
    page = newPage;
    void fetchTickets(newPage, searchQuery);
  }

  onMount(() => {
    void fetchTickets();
  });
</script>

<div class="tickets-container">
  <div class="tickets-header">
    <div>
      <p class="eyebrow">DAFTAR KENDALA</p>
      <h2>{allTickets ? 'Semua Tiket' : 'Tiket Saya'}</h2>
      <p class="section-desc">Pantau progres laporan tiket kendala yang telah Anda buat.</p>
    </div>
    <button type="button" class="btn btn-primary" onclick={onCreateNewTicket}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      Buat Tiket Baru
    </button>
  </div>

  <form onsubmit={handleSearch} class="search-bar-form">
    <div class="search-input-wrap">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="search"
        aria-label="Cari tiket"
        bind:value={searchQuery}
        placeholder="Cari nomor tiket, judul, atau deskripsi…"
      />
    </div>
    <button type="submit" class="btn btn-secondary">Cari</button>
    {#if searchQuery}
      <button type="button" class="btn btn-secondary" onclick={() => { searchQuery = ''; void fetchTickets(1, ''); }}>
        Reset
      </button>
    {/if}
  </form>

  <div class="list-filters">
    <label for="list-status">Status</label>
    <select id="list-status" bind:value={statusFilter} onchange={() => fetchTickets(1)}>
      <option value="">Semua status</option>
      <option>Open</option><option>In Progress</option><option value="Closed">Closed — Histori</option>
    </select>
    {#if canViewAll}<label><input type="checkbox" bind:checked={allTickets} onchange={() => fetchTickets(1)} /> Semua tiket yang dapat saya akses</label>{/if}
  </div>

  {#if errorMessage}
    <div class="alert alert-error" role="alert">
      <span>{errorMessage}</span>
      <button type="button" class="btn-retry" onclick={() => fetchTickets()}>Coba lagi</button>
    </div>
  {/if}

  {#if isLoading}
    <div class="loading-state">
      <p>Memuat daftar tiket…</p>
    </div>
  {:else if !errorMessage && tickets.length === 0}
    <div class="empty-state">
      <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
      </svg>
      <h3>Belum Ada Tiket</h3>
      <p>{searchQuery ? 'Tidak ada tiket yang cocok dengan kata kunci pencarian.' : 'Anda belum membuat tiket kendala.'}</p>
      {#if !searchQuery}
        <button type="button" class="btn btn-primary" onclick={onCreateNewTicket} style="margin-top: 12px;">
          Buat Tiket Pertama
        </button>
      {/if}
    </div>
  {:else}
    <div class="table-card">
      <table class="tickets-table">
        <thead>
          <tr>
            <th>Nomor</th>
            <th>Judul Kendala</th>
            <th>Prioritas</th>
            <th>Status</th>
            <th>Penanggung Jawab</th>
            <th>Waktu Dibuat</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {#each tickets as ticket}
            <tr onclick={() => onSelectTicket?.(ticket)}>
              <td class="cell-number"><strong>{ticket.ticketNumber}</strong></td>
              <td class="cell-title">
                <span class="ticket-title-text">{ticket.title}</span>
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
              <td>{ticket.assigneeUsername || 'Belum diambil'}</td>
              <td class="cell-time">{new Date(ticket.createdAt).toLocaleString('id-ID')}</td>
              <td>
                <button type="button" class="btn-detail" onclick={(e) => { e.stopPropagation(); onSelectTicket?.(ticket); }}>
                  Lihat
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>

      {#if totalPages > 1}
        <div class="pagination-footer">
          <span>Menampilkan {tickets.length} dari total {totalTickets} tiket</span>
          <div class="pagination-buttons">
            <button
              type="button"
              class="btn-page"
              disabled={page <= 1}
              onclick={() => handlePageChange(page - 1)}
            >
              Sebelumnya
            </button>
            <span class="page-indicator">{page} / {totalPages}</span>
            <button
              type="button"
              class="btn-page"
              disabled={page >= totalPages}
              onclick={() => handlePageChange(page + 1)}
            >
              Selanjutnya
            </button>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .list-filters { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  .list-filters select { padding: 8px; background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
  .tickets-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .tickets-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .section-desc {
    font-size: 0.85rem;
    color: var(--color-text-muted);
    margin-top: 2px;
  }

  .search-bar-form {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .search-input-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 0 12px;
    flex: 1;
    max-width: 420px;
  }

  .search-input-wrap input {
    border: none;
    background: transparent;
    padding: 8px 0;
    width: 100%;
    color: var(--color-text);
    font-size: 0.875rem;
    outline: none;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    border: none;
    transition: background-color 0.15s;
    white-space: nowrap;
  }

  .btn-primary {
    background-color: var(--color-primary);
    color: var(--color-primary-text);
  }

  .btn-primary:hover {
    background-color: var(--color-primary-hover);
  }

  .btn-secondary {
    background-color: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border);
  }

  .btn-secondary:hover {
    background-color: var(--color-surface-hover);
  }

  .table-card {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow-x: auto;
  }

  .tickets-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    font-size: 0.875rem;
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
    padding: 14px 16px;
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
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ticket-title-text {
    font-weight: 500;
  }

  .cell-time {
    color: var(--color-text-muted);
    font-size: 0.8rem;
  }

  .badge-priority {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
  }


  .badge-status {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
  }


  .btn-detail {
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    background-color: var(--color-bg);
    border: 1px solid var(--color-border);
    color: var(--color-text);
    font-size: 0.8rem;
    cursor: pointer;
  }

  .pagination-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-top: 1px solid var(--color-border);
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .pagination-buttons {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-page {
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background-color: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
    font-size: 0.8rem;
  }

  .btn-page:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .empty-state, .loading-state {
    text-align: center;
    padding: 48px 24px;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
  }

  .empty-state svg {
    margin-bottom: 12px;
    color: var(--color-text-muted);
  }

  .empty-state h3 {
    color: var(--color-text);
    font-size: 1.1rem;
    margin-bottom: 6px;
  }
</style>
