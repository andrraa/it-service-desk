<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { TicketPriority, Ticket } from '../server/tickets';

  interface Props {
    onCreated?: (ticket: Ticket) => void;
    onCancel?: () => void;
  }

  let { onCreated, onCancel }: Props = $props();

  interface FileItem {
    id: string;
    file: File;
    previewUrl?: string;
    error?: string;
  }

  let title = $state('');
  let description = $state('');
  let priority = $state<TicketPriority>('Medium');
  let selectedFiles = $state<FileItem[]>([]);
  let fileError = $state('');

  let errors = $state<Record<string, string>>({});
  let generalError = $state('');
  let isSubmitting = $state(false);
  let createdTicket = $state<Ticket | null>(null);
  let isDragging = $state(false);
  let fileInputEl = $state<HTMLInputElement | null>(null);

  const requestId = crypto.randomUUID();
  const uploadId = crypto.randomUUID();

  const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
  const MAX_TOTAL_FILES = 5;

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function validateAndAddFiles(filesList: FileList | File[]) {
    fileError = '';
    const incoming = Array.from(filesList);

    if (selectedFiles.length + incoming.length > MAX_TOTAL_FILES) {
      fileError = `Maksimal ${MAX_TOTAL_FILES} berkas yang dapat dilampirkan (tersisa ${MAX_TOTAL_FILES - selectedFiles.length}).`;
      return;
    }

    const newItems: FileItem[] = [];
    const rejectedReasons: string[] = [];

    for (const file of incoming) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        rejectedReasons.push(`'${file.name}': format tidak didukung`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        rejectedReasons.push(`'${file.name}': melebihi batas 10 MB`);
        continue;
      }

      let previewUrl: string | undefined;
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file);
      }

      newItems.push({
        id: crypto.randomUUID(),
        file,
        previewUrl,
      });
    }

    if (rejectedReasons.length > 0) {
      fileError = `Beberapa berkas ditolak: ${rejectedReasons.join('; ')}. Berkas valid lainnya tetap ditambahkan.`;
    }

    selectedFiles = [...selectedFiles, ...newItems];
  }

  function handleNativeFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      validateAndAddFiles(target.files);
      target.value = '';
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDragging = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      validateAndAddFiles(e.dataTransfer.files);
    }
  }

  function removeFile(id: string) {
    const item = selectedFiles.find((f) => f.id === id);
    if (item?.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
    selectedFiles = selectedFiles.filter((f) => f.id !== id);
  }

  function triggerFileInput() {
    fileInputEl?.click();
  }

  function handleDropzoneKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      triggerFileInput();
    }
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    errors = {};
    generalError = '';

    if (!title.trim()) {
      errors.title = 'Judul kendala wajib diisi.';
    } else if (title.trim().length < 5) {
      errors.title = 'Judul kendala minimal 5 karakter.';
    }

    if (!description.trim()) {
      errors.description = 'Deskripsi kendala wajib diisi.';
    } else if (description.trim().length < 10) {
      errors.description = 'Deskripsi kendala minimal 10 karakter.';
    }

    if (Object.keys(errors).length > 0) return;

    isSubmitting = true;
    try {
      if (!createdTicket) {
        const res = await fetch('/api/tickets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'fetch',
          },
          body: JSON.stringify({ title: title.trim(), description: description.trim(), priority, requestId }),
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

        createdTicket = data.ticket;
      }

      if (!createdTicket) return;

      // Upload attachments if any
      if (selectedFiles.length > 0) {
        const formData = new FormData();
        formData.append('uploadId', uploadId);
        for (const item of selectedFiles) {
          formData.append('files', item.file);
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
          generalError = `Tiket ${createdTicket.ticketNumber} berhasil dibuat, tetapi lampiran belum tersimpan: ${uploadData.error?.message || 'Terjadi kesalahan saat mengunggah'}. Pilihan berkas Anda tetap tersimpan; silakan coba upload lagi.`;
          return;
        }
      }

      onCreated?.(createdTicket);
    } catch {
      generalError = createdTicket
        ? `Tiket ${createdTicket.ticketNumber} sudah dibuat. Koneksi terganggu saat mengunggah berkas; pilihan berkas Anda tetap tersedia. Silakan tekan 'Coba Upload Lagi'.`
        : 'Kiriman belum terkonfirmasi akibat gangguan jaringan. Data formulir Anda aman, silakan coba kirim lagi.';
    } finally {
      isSubmitting = false;
    }
  }

  onDestroy(() => {
    for (const item of selectedFiles) {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
    }
  });
</script>

<div class="create-ticket-view">
  <div class="form-header">
    <h1>Buat Tiket</h1>
    <p class="form-instructions">Sampaikan laporan kendala IT secara rinci agar tim penanganan dapat segera menindaklanjuti.</p>
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
        disabled={isSubmitting || Boolean(createdTicket)}
        class:input-error={Boolean(errors.title)}
        aria-invalid={Boolean(errors.title)}
        aria-describedby={errors.title ? 'ticket-title-error' : undefined}
      />
      {#if errors.title}
        <span id="ticket-title-error" class="field-error">{errors.title}</span>
      {/if}
    </div>

    <div class="form-group">
      <label for="ticket-priority">Tingkat Prioritas</label>
      <select
        id="ticket-priority"
        bind:value={priority}
        disabled={isSubmitting || Boolean(createdTicket)}
      >
        <option value="Low">Low: Gangguan ringan / tidak mendesak</option>
        <option value="Medium">Medium: Kendala mengganggu, ada alternatif</option>
        <option value="High">High: Pekerjaan utama terhambat</option>
        <option value="Critical">Critical: Layanan penting berhenti total</option>
      </select>
      <span class="field-hint">Pilih prioritas sesuai dampak kendala terhadap pekerjaan Anda.</span>
    </div>

    <div class="form-group">
      <label for="ticket-description">Deskripsi Kendala</label>
      <textarea
        id="ticket-description"
        rows="5"
        bind:value={description}
        placeholder="Jelaskan kronologi kendala, langkah yang sudah dicoba, dan pesan error yang muncul…"
        required
        disabled={isSubmitting || Boolean(createdTicket)}
        class:input-error={Boolean(errors.description)}
        aria-invalid={Boolean(errors.description)}
        aria-describedby={errors.description ? 'ticket-desc-error' : undefined}
      ></textarea>
      {#if errors.description}
        <span id="ticket-desc-error" class="field-error">{errors.description}</span>
      {/if}
    </div>

    <!-- Custom File Upload Section -->
    <div class="form-group">
      <span class="label-text">Lampiran Berkas (Opsional)</span>

      <!-- Hidden Native File Input -->
      <input
        bind:this={fileInputEl}
        id="ticket-files"
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,.pdf"
        onchange={handleNativeFileChange}
        disabled={isSubmitting || selectedFiles.length >= MAX_TOTAL_FILES}
        class="sr-only"
      />

      <!-- Custom Dropzone -->
      <div
        class="custom-dropzone"
        class:drag-over={isDragging}
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        ondrop={handleDrop}
        onclick={triggerFileInput}
        onkeydown={handleDropzoneKeydown}
        tabindex="0"
        role="button"
        aria-label="Pilih atau seret berkas lampiran"
      >
        <div class="dropzone-content">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <div class="dropzone-text">
            <span class="btn-select-file">Pilih Berkas</span>
            <span class="dropzone-hint">atau seret dan lepas berkas ke area ini</span>
          </div>
          <span class="dropzone-specs">
            Format: JPG, PNG, WebP, PDF · Maksimal 10 MB per berkas · Maksimal 5 berkas
          </span>
        </div>
      </div>

      {#if fileError}
        <span class="field-error">{fileError}</span>
      {/if}

      <!-- Selected Files List -->
      {#if selectedFiles.length > 0}
        <div class="selected-files-list">
          {#each selectedFiles as item}
            <div class="file-item-row">
              <div class="file-preview-slot">
                {#if item.previewUrl}
                  <img src={item.previewUrl} alt={item.file.name} class="file-thumb" />
                {:else}
                  <div class="file-doc-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                {/if}
              </div>
              <div class="file-details">
                <span class="file-name" title={item.file.name}>{item.file.name}</span>
                <span class="file-meta">{formatFileSize(item.file.size)}</span>
              </div>
              <button
                type="button"
                class="btn-remove-file"
                onclick={(e) => { e.stopPropagation(); removeFile(item.id); }}
                disabled={isSubmitting}
                aria-label={`Hapus lampiran ${item.file.name}`}
              >
                Hapus
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Actions -->
    <div class="form-actions">
      <button type="submit" class="btn btn-primary" disabled={isSubmitting}>
        {isSubmitting ? 'Menyimpan…' : createdTicket ? 'Coba Upload Lagi' : 'Kirim Tiket'}
      </button>
      <button type="button" class="btn btn-secondary" onclick={onCancel} disabled={isSubmitting}>
        Batal
      </button>
    </div>
  </form>
</div>

<style>
  .create-ticket-view {
    width: 100%;
    max-width: none;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .form-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-instructions {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .ticket-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
    width: 100%;
  }

  .label-text {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text);
  }

  /* Custom Dropzone */
  .custom-dropzone {
    border: 1px dashed var(--color-control-border);
    border-radius: var(--radius-md);
    background-color: var(--color-surface);
    padding: 24px 16px;
    cursor: pointer;
    text-align: center;
    transition: background-color 0.12s ease, border-color 0.12s ease;
  }

  .custom-dropzone:hover {
    background-color: var(--color-surface-hover);
    border-color: var(--color-text);
  }

  .custom-dropzone.drag-over {
    background-color: var(--color-surface-hover);
    border-color: var(--color-focus);
    border-style: solid;
  }

  .dropzone-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--color-text-muted);
  }

  .dropzone-text {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .btn-select-file {
    color: var(--color-text);
    font-weight: 600;
    font-size: 0.875rem;
    text-decoration: underline;
  }

  .dropzone-hint {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .dropzone-specs {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  /* Selected Files List */
  .selected-files-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
  }

  .file-item-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  .file-preview-slot {
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--color-bg);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .file-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .file-doc-icon {
    color: var(--color-text-muted);
  }

  .file-details {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .file-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-meta {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .btn-remove-file {
    background: none;
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-sm);
    color: var(--color-danger);
    font-size: 0.8125rem;
    font-weight: 600;
    padding: 6px 12px;
    cursor: pointer;
    min-height: 44px;
    min-width: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.12s ease;
  }

  .btn-remove-file:hover:not(:disabled) {
    background-color: var(--color-danger-bg);
  }

  .form-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 8px;
    flex-wrap: wrap;
  }
</style>
