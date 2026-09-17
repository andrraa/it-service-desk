<script lang="ts">
  interface AttachmentItem {
    id: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
  }

  interface Props {
    attachments: AttachmentItem[];
    canDelete?: boolean;
    onDelete?: (id: string) => void;
  }

  let { attachments = [], canDelete = false, onDelete }: Props = $props();

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function isImage(mime: string): boolean {
    return mime.startsWith('image/');
  }
</script>

{#if attachments.length > 0}
  <div class="attachments-container">
    <span class="attachment-title">Lampiran ({attachments.length}):</span>
    <div class="attachments-grid">
      {#each attachments as file}
        <div class="attachment-item">
          {#if isImage(file.mimeType)}
            <a
              href={`/api/attachments/${file.id}?view=inline`}
              target="_blank"
              rel="noopener noreferrer"
              class="thumbnail-link"
              title="Klik untuk membuka pratinjau gambar"
            >
              <img
                src={`/api/attachments/${file.id}?view=inline`}
                alt={file.originalName}
                loading="lazy"
                class="thumbnail-img"
              />
            </a>
          {:else}
            <div class="file-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
          {/if}

          <div class="file-info">
            <span class="file-name" title={file.originalName}>{file.originalName}</span>
            <span class="file-meta">{formatSize(file.fileSize)}</span>
          </div>

          <div class="file-actions">
            <a
              href={`/api/attachments/${file.id}`}
              download={file.originalName}
              class="btn-dl"
              title="Unduh berkas"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </a>
            {#if canDelete}
              <button
                type="button"
                class="btn-del"
                title="Hapus berkas"
                onclick={() => onDelete?.(file.id)}
              >
                &times;
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .attachments-container {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .attachment-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .attachments-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .attachment-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: 0.8rem;
    max-width: 280px;
  }

  .thumbnail-link {
    display: block;
    width: 36px;
    height: 36px;
    border-radius: 4px;
    overflow: hidden;
    flex-shrink: 0;
    border: 1px solid var(--color-border);
  }

  .thumbnail-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .file-icon {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-primary);
    background-color: var(--color-bg);
    border-radius: 4px;
    flex-shrink: 0;
  }

  .file-info {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex: 1;
  }

  .file-name {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--color-text);
  }

  .file-meta {
    font-size: 0.7rem;
    color: var(--color-text-muted);
  }

  .file-actions {
    display: flex;
    gap: 4px;
  }

  .btn-dl {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
    padding: 4px;
    border-radius: 4px;
    transition: color 0.15s, background-color 0.15s;
  }

  .btn-dl:hover {
    color: var(--color-primary);
    background-color: var(--color-bg);
  }

  .btn-del {
    background: none;
    border: none;
    color: var(--color-danger);
    font-size: 1rem;
    cursor: pointer;
    line-height: 1;
    padding: 0 4px;
  }
</style>
