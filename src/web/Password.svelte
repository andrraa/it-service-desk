<script lang="ts">
  import type { User } from '../server/auth';

  interface Props {
    currentUser: User;
    onSuccess?: () => void;
  }

  let { currentUser, onSuccess }: Props = $props();

  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let errors = $state<Record<string, string>>({});
  let generalError = $state('');
  let successMessage = $state('');
  let isSubmitting = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    errors = {};
    generalError = '';
    successMessage = '';

    if (newPassword !== confirmPassword) {
      errors = { confirmPassword: 'Konfirmasi password tidak cocok.' };
      return;
    }

    if (newPassword.length < 12) {
      errors = { newPassword: 'Password baru minimal 12 karakter.' };
      return;
    }

    isSubmitting = true;
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'fetch',
        },
        body: JSON.stringify({
          currentPassword: currentUser.mustChangePassword ? undefined : currentPassword,
          newPassword,
        }),
      });

      const data: any = await res.json();
      if (!res.ok) {
        if (data.error?.details) {
          errors = data.error.details;
        } else {
          generalError = data.error?.message || 'Gagal mengubah password.';
        }
        return;
      }

      successMessage = 'Password Anda berhasil diperbarui!';
      currentPassword = '';
      newPassword = '';
      confirmPassword = '';
      onSuccess?.();
    } catch {
      generalError = 'Terjadi gangguan jaringan saat menghubungi server.';
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="password-card">
  <div class="password-header">
    <p class="eyebrow">KEAMANAN AKUN</p>
    <h2>{currentUser.mustChangePassword ? 'Wajib Mengganti Password' : 'Ganti Password Akun'}</h2>
    <p class="password-sub">
      {#if currentUser.mustChangePassword}
        Akun Anda menggunakan password sementara. Demi keamanan, Anda diwajibkan membuat password baru permanen sebelum dapat mengakses fitur lain.
      {:else}
        Perbarui password akun Anda secara berkala untuk menjaga kerahasiaan akses workspace.
      {/if}
    </p>
  </div>

  {#if generalError}
    <div class="alert alert-error" role="alert">{generalError}</div>
  {/if}

  {#if successMessage}
    <div class="alert alert-success" role="status">{successMessage}</div>
  {/if}

  <form onsubmit={handleSubmit} class="password-form">
    {#if !currentUser.mustChangePassword}
      <div class="form-group">
        <label for="cur-pass">Password Saat Ini <span class="required-mark" aria-hidden="true">*</span></label>
        <input
          id="cur-pass"
          type="password"
          bind:value={currentPassword}
          required
          disabled={isSubmitting}
        />
        {#if errors.currentPassword}
          <span class="field-error">{errors.currentPassword}</span>
        {/if}
      </div>
    {/if}

    <div class="form-group">
      <label for="new-pass">Password Baru <span class="required-mark" aria-hidden="true">*</span></label>
      <input
        id="new-pass"
        type="password"
        bind:value={newPassword}
        placeholder="Minimal 12 karakter"
        required
        disabled={isSubmitting}
      />
      {#if errors.newPassword}
        <span class="field-error">{errors.newPassword}</span>
      {/if}
      <span class="field-hint">Gunakan minimal 12 karakter campuran huruf, angka, atau simbol.</span>
    </div>

    <div class="form-group">
      <label for="conf-pass">Konfirmasi Password Baru <span class="required-mark" aria-hidden="true">*</span></label>
      <input
        id="conf-pass"
        type="password"
        bind:value={confirmPassword}
        placeholder="Ulangi password baru"
        required
        disabled={isSubmitting}
      />
      {#if errors.confirmPassword}
        <span class="field-error">{errors.confirmPassword}</span>
      {/if}
    </div>

    <button type="submit" class="btn btn-primary" disabled={isSubmitting}>
      {isSubmitting ? 'Memperbarui Password…' : 'Simpan Password Baru'}
    </button>
  </form>
</div>

<style>
  .password-card {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 28px;
    max-width: 480px;
    margin: 0 auto;
  }

  .password-header {
    margin-bottom: 20px;
  }

  .password-sub {
    font-size: 0.85rem;
    color: var(--color-text-muted);
    margin-top: 4px;
    line-height: 1.5;
  }

  .password-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  label {
    font-size: 0.85rem;
    font-weight: 600;
  }

  input {
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background-color: var(--color-bg);
    color: var(--color-text);
    font-size: 0.875rem;
  }

  input:focus {
    border-color: var(--color-primary);
    outline: none;
  }

  .field-error {
    font-size: 0.75rem;
    color: var(--color-danger);
  }

  .field-hint {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .btn {
    padding: 10px 16px;
    border-radius: var(--radius-sm);
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    border: none;
    margin-top: 8px;
  }

  .btn-primary {
    background-color: var(--color-primary);
    color: var(--color-primary-text);
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .alert {
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
    margin-bottom: 16px;
  }

  .alert-error {
    background-color: rgba(220, 38, 38, 0.1);
    color: var(--color-danger);
    border: 1px solid rgba(220, 38, 38, 0.2);
  }

  .alert-success {
    background-color: rgba(22, 163, 74, 0.1);
    color: var(--color-success);
    border: 1px solid rgba(22, 163, 74, 0.2);
  }
</style>
