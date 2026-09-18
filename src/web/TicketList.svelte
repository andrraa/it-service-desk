<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from './router';
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
  let priorityFilter = $state('');
  let allTickets = $state(false);
  let generation = 0;
  let page = $state(1);
  let totalPages = $state(1);
  let totalTickets = $state(0);
  let initialLoaded = $state(false);
  let isLoading = $state(true);
  let errorMessage = $state('');

  const hasActiveFilter = $derived(Boolean(searchQuery.trim() || statusFilter || priorityFilter || allTickets));

  async function fetchTickets(targetPage = page, query = searchQuery) {
    const currentGeneration = ++generation;
    isLoading = true;
    errorMessage = '';
    try {
      const url = new URL('/api/tickets', window.location.origin);
      url.searchParams.set('page', String(targetPage));
      url.searchParams.set('limit', '10');
      if (statusFilter) url.searchParams.set('status', statusFilter);
      if (priorityFilter) url.searchParams.set('priority', priorityFilter);
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
      if (currentGeneration === generation) {
        isLoading = false;
        initialLoaded = true;
      }
    }
  }

  function handleSearch(e: Event) {
    e.preventDefault();
    page = 1;
    void fetchTickets(1, searchQuery);
  }

  function resetFilters() {
    searchQuery = '';
    statusFilter = '';
    priorityFilter = '';
    allTickets = false;
    page = 1;
    void fetchTickets(1, '');
  }

  function handlePageChange(newPage: number) {
    if (newPage < 1 || newPage > totalPages) return;
    page = newPage;
    void fetchTickets(newPage, searchQuery);
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

  function handleCreateClick() {
    if (onCreateNewTicket) {
      onCreateNewTicket();
    } else {
      navigate('/tickets/new');
    }
  }

  onMount(() => {
    void fetchTickets();
  });
</script>

<div class="tickets-view">
  {#if initialLoaded && totalTickets === 0 && !hasActiveFilter}
    <!-- Truly Empty State: Only Title and Single CTA, No Search or Filter -->
    <div class="empty-state-container">
      <div class="page-header">
        <h1>Tiket Saya</h1>
      </div>
      <div class="empty-state">
        <p class="empty-state-title">Belum ada tiket.</p>
        <p class="empty-state-desc">Anda belum memiliki tiket kendala yang dilaporkan.</p>
        <button type="button" class="btn btn-primary" onclick={handleCreateClick}>
          Buat Tiket
        </button>
      </div>
    </div>
  {:else}
    <!-- Header with single CTA -->
    <div class="page-header">
      <h1>{allTickets ? 'Semua Tiket' : 'Tiket Saya'}</h1>
      <button type="button" class="btn btn-primary" onclick={handleCreateClick}>
        Buat Tiket
      </button>
    </div>

    <!-- Search & Filter Toolbar -->
    <div class="toolbar">
      <form onsubmit={handleSearch} class="search-form">
        <div class="search-input-wrapper">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            aria-label="Cari tiket"
            bind:value={searchQuery}
            placeholder="Cari nomor, judul, atau deskripsi…"
          />
        </div>
        <button type="submit" class="btn btn-secondary">Cari</button>
      </form>

      <div class="filter-controls">
        <div class="filter-item">
          <label for="filter-status" class="sr-only">Filter Status</label>
          <select id="filter-status" bind:value={statusFilter} onchange={() => fetchTickets(1)}>
            <option value="">Semua Status</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Closed">Closed</option>
          </select>
        </div>

        <div class="filter-item">
          <label for="filter-priority" class="sr-only">Filter Prioritas</label>
          <select id="filter-priority" bind:value={priorityFilter} onchange={() => fetchTickets(1)}>
            <option value="">Semua Prioritas</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>

        {#if canViewAll}
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={allTickets} onchange={() => fetchTickets(1)} />
            <span>Semua tiket</span>
          </label>
        {/if}

        {#if hasActiveFilter}
          <button type="button" class="btn btn-secondary" onclick={resetFilters}>
            Reset Filter
          </button>
        {/if}
      </div>
    </div>

    {#if errorMessage}
      <div class="alert alert-error" role="alert">
        <span>{errorMessage}</span>
        <button type="button" class="btn-link" onclick={() => fetchTickets()}>Coba lagi</button>
      </div>
    {/if}

    {#if isLoading}
      <div class="loading-state" role="status" aria-live="polite">
        <p>Memuat daftar tiket…</p>
      </div>
    {:else if tickets.length === 0}
      <!-- Empty Search Results -->
      <div class="empty-state">
        <p class="empty-state-title">Tidak ada tiket sesuai pencarian.</p>
        <p class="empty-state-desc">Coba sesuaikan kata kunci atau atur ulang filter pencarian.</p>
        <button type="button" class="btn btn-secondary" onclick={resetFilters}>
          Reset Filter
        </button>
      </div>
    {:else}
      <!-- Desktop Table (≥768px) -->
      <div class="table-container desktop-only">
        <table class="tickets-table">
          <thead>
            <tr>
              <th scope="col">Tiket</th>
              <th scope="col">Prioritas</th>
              <th scope="col">Status</th>
              <th scope="col">PIC</th>
              <th scope="col">Dibuat</th>
              <th scope="col">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {#each tickets as ticket}
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
                  {ticket.assigneeUsername || 'Belum diambil'}
                </td>
                <td class="cell-muted tabular-nums">
                  {new Date(ticket.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                </td>
                <td>
                  <a href={`/tickets/${ticket.ticketNumber}`} class="btn btn-secondary btn-sm detail-link">
                    Lihat Detail
                  </a>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Mobile Cards (<768px) -->
      <div class="mobile-only ticket-cards-list">
        {#each tickets as ticket}
          <article class="ticket-card">
            <div class="card-header-row">
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
            <div class="card-meta">
              <span>PIC: <strong>{ticket.assigneeUsername || 'Belum diambil'}</strong></span>
              <span class="tabular-nums">{new Date(ticket.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
            <a href={`/tickets/${ticket.ticketNumber}`} class="btn btn-secondary detail-link">Lihat Detail</a>
          </article>
        {/each}
      </div>

      <nav class="pagination-bar" aria-label="Navigasi halaman tiket">
          <span class="pagination-info">
            Halaman {page} dari {totalPages} ({totalTickets} tiket)
          </span>
          <div class="pagination-actions">
            <button
              type="button"
              class="btn btn-secondary"
              disabled={page <= 1}
              onclick={() => handlePageChange(page - 1)}
            >
              Sebelumnya
            </button>
            <button
              type="button"
              class="btn btn-secondary"
              disabled={page >= totalPages}
              onclick={() => handlePageChange(page + 1)}
            >
              Berikutnya
            </button>
          </div>
      </nav>
    {/if}
  {/if}
</div>

<style>
  .tickets-view {
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

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  .search-form {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 280px;
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

  .table-container {
    width: 100%;
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

  .tickets-table th {
    padding: 14px 16px;
    font-weight: 600;
    color: var(--color-text-muted);
    background-color: var(--color-bg);
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
  }

  .tickets-table td {
    padding: 16px;
    border-bottom: 1px solid var(--color-border);
    vertical-align: middle;
  }

  .tickets-table tr:last-child td {
    border-bottom: none;
  }

  .tickets-table tr:hover td {
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

  .detail-link {
    display: inline-flex;
    width: max-content;
    white-space: nowrap;
    text-decoration: none;
  }

  .ticket-card .detail-link {
    width: 100%;
    margin-top: 4px;
  }

  .cell-muted {
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  /* Mobile Card View */
  .ticket-cards-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .ticket-card {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .card-header-row {
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
    margin: 2px 0;
  }

  .card-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    border-top: 1px solid var(--color-border);
    padding-top: 8px;
    margin-top: 4px;
  }

  .pagination-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    padding: 8px 0;
  }

  .pagination-info {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .pagination-actions {
    display: flex;
    gap: 8px;
  }

  .desktop-only {
    display: block;
  }

  .mobile-only {
    display: none;
  }

  @media (max-width: 767px) {
    .desktop-only {
      display: none;
    }
    .mobile-only {
      display: flex;
    }
    .toolbar {
      flex-direction: column;
      align-items: stretch;
    }
    .search-form {
      max-width: none;
    }
    .filter-controls {
      width: 100%;
    }
    .filter-item {
      flex: 1;
    }
    .filter-item select {
      width: 100%;
      min-width: 0;
    }
  }
</style>
