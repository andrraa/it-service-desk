<script lang="ts">
  interface Props {
    onSuccess?: () => void;
    onSwitchToLogin?: () => void;
  }

  let { onSuccess, onSwitchToLogin }: Props = $props();

  let nik = $state('');
  let username = $state('');
  let password = $state('');
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

    if (password !== confirmPassword) {
      errors = { confirmPassword: 'Konfirmasi password tidak cocok.' };
      return;
    }

    isSubmitting = true;
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nik, username, password }),
      });

      const data: any = await res.json();

      if (!res.ok) {
        if (data.error?.details) {
          errors = data.error.details;
        } else {
          generalError = data.error?.message || 'Registrasi gagal. Silakan coba lagi.';
        }
        return;
      }

      successMessage = 'Registrasi berhasil! Anda sekarang dapat masuk menggunakan akun baru.';
      nik = '';
      username = '';
      password = '';
      confirmPassword = '';
      onSuccess?.();
    } catch {
      generalError = 'Terjadi gangguan jaringan saat menghubungi server.';
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="auth-card">
  <div class="auth-header">
    <p class="eyebrow">REGISTRASI AKUN</p>
    <h2>Daftar Pengguna Baru</h2>
    <p class="auth-subtitle">Daftarkan NIK dan buat kredensial untuk mengakses layanan IT Service Desk.</p>
  </div>

  {#if generalError}
    <div class="alert alert-error" role="alert">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M12 8v4m0 4h.01" />
      </svg>
      <span>{generalError}</span>
    </div>
  {/if}

  {#if successMessage}
    <div class="alert alert-success" role="status">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M20 6L9 17l-5-5" />
      </svg>
      <span>{successMessage}</span>
    </div>
  {/if}

  <form onsubmit={handleSubmit} novalidate class="auth-form">
    <div class="form-group">
      <label for="nik">NIK (Nomor Induk Karyawan)</label>
      <input
        id="nik"
        type="text"
        bind:value={nik}
        placeholder="Contoh: 004819"
        required
        disabled={isSubmitting}
        class:input-error={Boolean(errors.nik)}
      />
      {#if errors.nik}
        <span class="field-error">{errors.nik}</span>
      {/if}
      <span class="field-hint">Angka nol di awal akan tetap tersimpan sesuai format resmi.</span>
    </div>

    <div class="form-group">
      <label for="username">Username</label>
      <input
        id="username"
        type="text"
        bind:value={username}
        placeholder="Contoh: john.doe"
        required
        disabled={isSubmitting}
        class:input-error={Boolean(errors.username)}
      />
      {#if errors.username}
        <span class="field-error">{errors.username}</span>
      {/if}
    </div>

    <div class="form-group">
      <label for="password">Password</label>
      <input
        id="password"
        type="password"
        bind:value={password}
        placeholder="Minimal 12 karakter"
        required
        disabled={isSubmitting}
        class:input-error={Boolean(errors.password)}
      />
      {#if errors.password}
        <span class="field-error">{errors.password}</span>
      {/if}
    </div>

    <div class="form-group">
      <label for="confirmPassword">Konfirmasi Password</label>
      <input
        id="confirmPassword"
        type="password"
        bind:value={confirmPassword}
        placeholder="Ulangi password di atas"
        required
        disabled={isSubmitting}
        class:input-error={Boolean(errors.confirmPassword)}
      />
      {#if errors.confirmPassword}
        <span class="field-error">{errors.confirmPassword}</span>
      {/if}
    </div>

    <button type="submit" class="btn btn-primary" disabled={isSubmitting}>
      {isSubmitting ? 'Memproses pendaftaran…' : 'Daftar Sekarang'}
    </button>
  </form>

  <div class="auth-footer">
    <span>Sudah memiliki akun?</span>
    <button type="button" class="btn-link" onclick={onSwitchToLogin}>
      Masuk ke Workspace
    </button>
  </div>
</div>

<style>
  .auth-card {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 28px;
    max-width: 460px;
    margin: 0 auto 32px;
  }

  .auth-header {
    margin-bottom: 20px;
  }

  .auth-subtitle {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    margin-top: 4px;
  }

  .auth-form {
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
    font-size: 0.875rem;
    font-weight: 600;
  }

  input {
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background-color: var(--color-bg);
    color: var(--color-text);
    font-size: 0.9rem;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  input:focus {
    border-color: var(--color-primary);
  }

  input.input-error {
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

  .btn {
    padding: 10px 16px;
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
    margin-top: 8px;
  }

  .btn-primary:hover:not(:disabled) {
    background-color: var(--color-primary-hover);
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .auth-footer {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  .btn-link {
    background: none;
    border: none;
    color: var(--color-primary);
    font-weight: 600;
    cursor: pointer;
    padding: 0;
  }

  .btn-link:hover {
    text-decoration: underline;
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

  .alert-success {
    background-color: rgba(22, 163, 74, 0.1);
    color: var(--color-success);
    border: 1px solid rgba(22, 163, 74, 0.2);
  }
</style>
