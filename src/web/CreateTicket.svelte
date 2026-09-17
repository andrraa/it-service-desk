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
  let selectedFiles = $state<File[]>([]);

  let errors = $state<Record<string, string>>({});
  let generalError = $state('');
  let isSubmitting = $state(false);

  function handleFileSelection(e: Event) {
    const target = e.target as HTMLInputElement;
    if (!target.files) return;
    const filesArray = Array.from(target.files);

    if (filesArray.length + selectedFiles.length > 5) {
      errors = { files: 'Maksimal 5 berkas yang dapat dilampirkan.' };
      return;
    }

    for (const f of filesArray) {
      if (f.size > 10 * 1024 * 1024) {
        errors = { files: `Berkas '${f.name}' melebihi 10 MB.` };
        return;
      }
    }

    selectedFiles = [...selectedFiles, ...filesArray];
    errors = {};
    target.value = '';
  }

  function removeFile(index: number) {
    selectedFiles = selectedFiles.filter((_, i) => i !== index);
  }

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
      // 1. Create ticket
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'fetch',
        },
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

      const createdTicket: Ticket = data.ticket;

      // 2. Upload attachments if any
      if (selectedFiles.length > 0) {
        const formData = new FormData();
        for (const file of selectedFiles) {
          formData.append('files', file);
        }

        const uploadRes = await fetch(`/api/tickets/${createdTicket.id}/attachments`, {
          method: 'POST',
          headers: {
            'X-Requested-With': 'fetch',
          },
          body: formData,
        });

        if (!uploadRes.ok) {
          const uploadData: any = await uploadRes.json();
          alert(`Tiket dibuat (${createdTicket.ticketNumber}), tetapi lampiran gagal disimpan: ${uploadData.error?.message || 'Terjadi kesalahan'}`);
        }
      }

      onCreated?.(createdTicket);
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

    <!-- Attachments Picker -->
    <div class="form-group">
      <label for="ticket-files">Lampiran Dokumen / Bukti Gambar (Opsional)</label>
      <input
        id="ticket-files"
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,.pdf"
        onchange={handleFileSelection}
        disabled={isSubmitting || selectedFiles.length >= 5}
      />
      <span class="field-hint">Format: JPG, PNG, WebP, PDF (Maksimal 10 MB per berkas, maks 5 berkas).</span>

      {#if errors.files}
        <span class="field-error">{errors.files}</span>
      {/if}

      {#if selectedFiles.length > 0}
        <div class="file-preview-list">
          {#each selectedFiles as file, idx}
            <div class="file-chip">
              <span class="file-chip-name">{file.name}</span>
              <span class="file-chip-size">({(file.size / 1024).toFixed(0)} KB)</span>
              <button type="button" class="btn-remove-chip" onclick={() => removeFile(idx)}>&times;</button>
            </div>
          {/each}
        </div>
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

  .file-preview-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 6px;
  }

  .file-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: 0.8rem;
  }

  .file-chip-name {
    font-weight: 500;
  }

  .file-chip-size {
    color: var(--color-text-muted);
  }

  .btn-remove-chip {
    background: none;
    border: none;
    color: var(--color-danger);
    font-size: 1rem;
    cursor: pointer;
    line-height: 1;
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
