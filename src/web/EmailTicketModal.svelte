<script lang="ts">
  import { modal } from './modal';

  interface Props {
    ticketNumber: string;
    initialSubject: string;
    initialBody: string;
    onClose: () => void;
  }

  let { ticketNumber, initialSubject, initialBody, onClose }: Props = $props();

  let to = $state('');
  // Prefilled once from the ticket, then fully editable: the agent owns the final text.
  // svelte-ignore state_referenced_locally
  let subject = $state(initialSubject);
  // svelte-ignore state_referenced_locally
  let body = $state(initialBody);
  let errorMessage = $state('');
  let successMessage = $state('');
  let isSending = $state(false);

  async function handleSend() {
    errorMessage = '';
    successMessage = '';
    isSending = true;
    try {
      const res = await fetch(`/api/tickets/${ticketNumber}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, body }),
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok) {
        const details = data?.error?.details;
        const firstDetail = details ? Object.values(details)[0] : null;
        throw new Error(String(firstDetail || data?.error?.message || 'Gagal mengirim email.'));
      }
      // Keep the dialog open on success so the agent sees the confirmation.
      successMessage = data?.message || `Email berhasil dikirim ke ${to}.`;
      to = '';
    } catch (err: any) {
      errorMessage = err.message || 'Gagal mengirim email.';
    } finally {
      isSending = false;
    }
  }
</script>

<dialog
  class="modal-card"
  use:modal
  aria-labelledby="email-modal-title"
  oncancel={(e) => { if (isSending) e.preventDefault(); else onClose(); }}
>
  <h2 id="email-modal-title">Kirim Tiket via Email</h2>
  <p class="field-hint" style="margin-top: 4px;">
    Isi tujuan dan pesan untuk tiket <strong class="tabular-nums">{ticketNumber}</strong>, lalu kirim.
  </p>

  {#if errorMessage}
    <div class="alert alert-error" role="alert" style="margin-top: 12px;">
      <span>{errorMessage}</span>
    </div>
  {/if}

  {#if successMessage}
    <div class="alert alert-success" role="status" style="margin-top: 12px;">
      <span>{successMessage}</span>
    </div>
  {/if}

  <form onsubmit={(e) => { e.preventDefault(); void handleSend(); }} style="margin-top: 16px; display: flex; flex-direction: column; gap: 16px;">
    <div class="form-group">
      <label for="email-to">Kepada <span class="required-mark" aria-hidden="true">*</span></label>
      <input id="email-to" type="email" bind:value={to} placeholder="nama@perusahaan.com" required disabled={isSending} />
    </div>

    <div class="form-group">
      <label for="email-subject">Subjek <span class="required-mark" aria-hidden="true">*</span></label>
      <input id="email-subject" type="text" bind:value={subject} maxlength="200" required disabled={isSending} />
    </div>

    <div class="form-group">
      <label for="email-body">Isi Pesan <span class="required-mark" aria-hidden="true">*</span></label>
      <textarea id="email-body" rows="10" bind:value={body} maxlength="5000" required disabled={isSending}></textarea>
      <span class="field-hint">Isi pesan di bawah ini sudah terisi otomatis dari tiket dan bisa diubah.</span>
    </div>

    <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px;">
      <button type="button" class="btn btn-secondary" disabled={isSending} onclick={onClose}>Tutup</button>
      <button type="submit" class="btn btn-primary" disabled={isSending}>
        {isSending ? 'Mengirim…' : 'Kirim Email'}
      </button>
    </div>
  </form>
</dialog>