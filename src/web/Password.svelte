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

  // Notification address: separate form and endpoint so it can be saved without a password.
  // svelte-ignore state_referenced_locally
  let email = $state(currentUser.email ?? '');
  let emailErrors = $state<Record<string, string>>({});
  let emailError = $state('');
  let emailSuccess = $state('');
  let isSavingEmail = $state(false);

  async function handleSaveEmail(e: Event) {
    e.preventDefault();
    emailErrors = {};
    emailError = '';
    emailSuccess = '';
    isSavingEmail = true;
    try {
      const res = await fetch('/api/auth/email', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        body: JSON.stringify({ email }),
      });
      const data: any = await res.json();
      if (!res.ok) {
        if (data.error?.details) emailErrors = data.error.details;
        else emailError = data.error?.message || 'Gagal menyimpan email.';
        return;
      }
      email = data.user.email;
      emailSuccess = 'Email berhasil disimpan. Notifikasi tiket akan dikirim ke alamat ini.';
    } catch {
      emailError = 'Terjadi gangguan jaringan saat menghubungi server.';
    } finally {
      isSavingEmail = false;
    }
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    errors = {};
    generalError = '';
    successMessage = '';

    if (newPassword !== confirmPassword) {
      errors = { confirmPassword: 'Konfirmasi password tidak cocok.' };
      return;
    }

    if (newPassword.length < 8) {
      errors = { newPassword: 'Password baru minimal 8 karakter.' };
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

<div class="password-view">
<div class="password-card">
  <div class="password-header">
    <h1>Pengaturan Akun</h1>
    <p class="password-sub">{currentUser.mustChangePassword ? 'Buat password baru untuk melanjutkan.' : 'Kelola email notifikasi dan password akun Anda.'}</p>
  </div>

  {#if emailSuccess}
    <div class="alert alert-success" role="status">{emailSuccess}</div>
  {/if}
  {#if emailError}
    <div class="alert alert-error" role="alert">{emailError}</div>
  {/if}

  <form onsubmit={handleSaveEmail} class="password-form" style="margin-bottom: 28px;">
    <div class="form-group">
      <label for="account-email">Email Notifikasi <span class="required-mark" aria-hidden="true">*</span></label>
      <input
        id="account-email"
        type="email"
        bind:value={email}
        placeholder="Contoh: nama@perusahaan.com"
        required
        autocomplete="email"
        disabled={isSavingEmail}
        aria-invalid={Boolean(emailErrors.email)}
      />
      {#if emailErrors.email}
        <span class="field-error">{emailErrors.email}</span>
      {:else}
        <span class="field-hint">Dipakai untuk notifikasi tiket dan balasan. Bisa diubah kapan saja.</span>
      {/if}
    </div>

    <button type="submit" class="btn btn-primary" disabled={isSavingEmail}>
      {isSavingEmail ? 'Menyimpan…' : 'Simpan Email'}
    </button>
  </form>

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
        placeholder="Minimal 8 karakter"
        required
        disabled={isSubmitting}
      />
      {#if errors.newPassword}
        <span class="field-error">{errors.newPassword}</span>
      {/if}
      <span class="field-hint">Gunakan minimal 8 karakter campuran huruf, angka, atau simbol.</span>
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
</div>

<style>
  .password-view {
    min-height: 100%;
    display: grid;
    place-items: center;
  }

  .password-card {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 28px;
    width: min(100%, 440px);
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
