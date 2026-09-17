<script lang="ts">
  import { onMount } from 'svelte';
  import type { Ticket } from '../server/tickets';
  import type { User } from '../server/auth';

  interface Props {
    ticketId: string;
    currentUser: User;
    onBack?: () => void;
  }

  let { ticketId, currentUser, onBack }: Props = $props();

  let ticket = $state<Ticket | null>(null);
  let isLoading = $state(true);
  let errorMessage = $state('');

  async function fetchTicketDetail() {
    isLoading = true;
    errorMessage = '';
    try {
      const res = await fetch(`/api/tickets/${ticketId}`);
      if (!res.ok) {
        if (res.status === 403) throw new Error('Anda tidak berhak melihat tiket ini.');
        if (res.status === 404) throw new Error('Tiket tidak ditemukan.');
        throw new Error('Gagal memuat detail tiket.');
      }
      const data: any = await res.json();
      ticket = data.ticket;
    } catch (err: any) {
      errorMessage = err.message || 'Terjadi kesalahan sistem.';
    } finally {
      isLoading = false;
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
  </div>

  {#if errorMessage}
    <div class="alert alert-error" role="alert">
      <span>{errorMessage}</span>
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

    <div class="ticket-content-card">
      <h3>Deskripsi Masalah</h3>
      <p class="description-text">{ticket.description}</p>
    </div>

    <div class="ticket-chat-placeholder">
      <div class="placeholder-content">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <h4>Ruang Percakapan & Penanganan Tiket</h4>
        <p>Pertukaran pesan, upload bukti berkas, dan pengambilan penanganan IT akan aktif pada tahap berikutnya (Task #7 & #8).</p>
      </div>
    </div>
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
  }

  .ticket-header-card, .ticket-content-card, .ticket-chat-placeholder {
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

  .priority-low { background-color: rgba(100, 116, 139, 0.15); color: #64748b; }
  .priority-medium { background-color: rgba(59, 130, 246, 0.15); color: var(--color-primary); }
  .priority-high { background-color: rgba(234, 179, 8, 0.15); color: #ca8a04; }
  .priority-critical { background-color: rgba(220, 38, 38, 0.15); color: var(--color-danger); }

  .status-open { background-color: rgba(59, 130, 246, 0.15); color: var(--color-primary); }
  .status-in-progress { background-color: rgba(234, 179, 8, 0.15); color: #ca8a04; }
  .status-closed { background-color: rgba(22, 163, 74, 0.15); color: var(--color-success); }

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

  .ticket-chat-placeholder {
    text-align: center;
    background-color: var(--color-bg);
    padding: 36px 20px;
  }

  .placeholder-content svg {
    color: var(--color-text-muted);
    margin-bottom: 8px;
  }

  .placeholder-content h4 {
    font-size: 1rem;
    margin-bottom: 4px;
  }

  .placeholder-content p {
    font-size: 0.85rem;
    color: var(--color-text-muted);
    max-width: 480px;
    margin: 0 auto;
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

  .loading-state {
    text-align: center;
    padding: 40px;
    color: var(--color-text-muted);
  }
</style>
