<script lang="ts">
  import type { TicketPriority, Ticket } from '../server/tickets';

  interface Props {
    onCreated?: (ticket: Ticket) => void;
    onCancel?: () => void;
  }

  let { onCreated, onCancel }: Props = $props();

  let title = $state('');
  let description = $state('');
  let priority = $state<TicketPriority>('Medium');

  let errors = $state<Record<string, string>>({});
  let generalError = $state('');
  let isSubmitting = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    errors = {};
    generalError = '';

    if (!title.trim()) {
      errors.title = 'Judul tiket wajib diisi.';
    } else if (title.trim().length < 5) {
      errors.title = 'Judul tiket minimal 5 karakter.';
    }

    if (!description.trim()) {
      errors.description = 'Deskripsi kendala wajib diisi.';
    } else if (description.trim().length < 10) {
      errors.description = 'Deskripsi kendala minimal 10 karakter.';
    }

    if (Object.keys(errors).length > 0) return;

    isSubmitting = true;
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, priority }),
      });

      const data: any = await res.json();

      if (!res.ok) {
        if (data.error?.details) {
          errors = data.error.details;
        } else {
          generalError = data.error?.message || 'Gagal membuat tiket.';
        }
        return;
      }

      onCreated?.(data.ticket);
    } catch {
      generalError = 'Terjadi kesalahan jaringan saat menghubungi server.';
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="ticket-form-card">
  <div class="card-header">
    <div>
      <p class="eyebrow">FORMULIR PENGADUAN</p>
      <h2>Buat Tiket Kendala Baru</h2>
    </div>
    <span class="stage-label">Status awal: Open</span>
  </div>

  {#if generalError}
    <div class="alert alert-error" role="alert">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M12 8v4m0 4h.01" />
      </svg>
      <span>{generalError}</span>
    </div>
  {/if}

  <form onsubmit={handleSubmit} novalidate class="ticket-form">
    <div class="form-group">
      <label for="ticket-title">Judul Kendala</label>
      <input
        id="ticket-title"
        type="text"
        bind:value={title}
        placeholder="Ringkasan singkat kendala yang Anda alami"
        required
        disabled={isSubmitting}
        class:input-error={Boolean(errors.title)}
      />
      {#if errors.title}
        <span class="field-error">{errors.title}</span>
      {/if}
    </div>

    <div class="form-group">
      <label for="ticket-priority">Tingkat Prioritas</label>
      <select id="ticket-priority" bind:value={priority} disabled={isSubmitting}>
        <option value="Low">Low — Gangguan ringan / tidak mendesak</option>
        <option value="Medium">Medium — Kendala mengganggu, ada alternatif</option>
        <option value="High">High — Pekerjaan utama terhambat</option>
        <option value="Critical">Critical — Layanan penting berhenti total</option>
      </select>
      <span class="field-hint">Pilih prioritas sesuai dampak kendala terhadap pekerjaan Anda.</span>
    </div>

    <div class="form-group">
      <label for="ticket-description">Deskripsi Lengkap Kendala</label>
      <textarea
        id="ticket-description"
        rows="5"
        bind:value={description}
        placeholder="Jelaskan kronologi, langkah yang sudah dicoba, dan pesan error jika ada…"
        required
        disabled={isSubmitting}
        class:input-error={Boolean(errors.description)}
      ></textarea>
      {#if errors.description}
        <span class="field-error">{errors.description}</span>
      {/if}
    </div>

    <div class="form-actions">
      <button type="submit" class="btn btn-primary" disabled={isSubmitting}>
        {isSubmitting ? 'Menyimpan Tiket…' : 'Kirim Laporan Tiket'}
      </button>
      <button type="button" class="btn btn-secondary" onclick={onCancel} disabled={isSubmitting}>
        Batal
      </button>
    </div>
  </form>
</div>

<style>
  .ticket-form-card {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 24px;
    margin-bottom: 24px;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
  }

  .ticket-form {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  label {
    font-size: 0.875rem;
    font-weight: 600;
  }

  input, select, textarea {
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background-color: var(--color-bg);
    color: var(--color-text);
    font-size: 0.9rem;
  }

  input:focus, select:focus, textarea:focus {
    border-color: var(--color-primary);
  }

  input.input-error, textarea.input-error {
    border-color: var(--color-danger);
  }

  .field-error {
    font-size: 0.775rem;
    color: var(--color-danger);
  }

  .field-hint {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .form-actions {
    display: flex;
    gap: 12px;
    margin-top: 8px;
  }

  .btn {
    padding: 10px 18px;
    border-radius: var(--radius-sm);
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    border: none;
    transition: background-color 0.15s;
  }

  .btn-primary {
    background-color: var(--color-primary);
    color: var(--color-primary-text);
  }

  .btn-primary:hover:not(:disabled) {
    background-color: var(--color-primary-hover);
  }

  .btn-secondary {
    background-color: var(--color-bg);
    color: var(--color-text);
    border: 1px solid var(--color-border);
  }

  .btn-secondary:hover:not(:disabled) {
    background-color: var(--color-surface-hover);
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .alert {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
    margin-bottom: 16px;
  }

  .alert-error {
    background-color: rgba(220, 38, 38, 0.1);
    color: var(--color-danger);
    border: 1px solid rgba(220, 38, 38, 0.2);
  }
</style>
