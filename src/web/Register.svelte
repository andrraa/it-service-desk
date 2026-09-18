<script lang="ts">
  import { navigate } from './router';

  interface Props {
    onSuccess?: () => void;
  }

  let { onSuccess }: Props = $props();

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
      setTimeout(() => {
        onSuccess?.();
        navigate('/login');
      }, 1200);
    } catch {
      generalError = 'Terjadi gangguan jaringan saat menghubungi server.';
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="auth-card">
  <div class="auth-header">
    <h1>Daftar Akun</h1>
    <p class="auth-subtitle">Daftarkan Nomor Induk Karyawan dan buat kredensial akun baru.</p>
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
      <label for="nik">Nomor Induk Karyawan</label>
      <input
        id="nik"
        type="text"
        bind:value={nik}
        placeholder="Contoh: 004819"
        required
        disabled={isSubmitting}
        class:input-error={Boolean(errors.nik)}
        aria-invalid={Boolean(errors.nik)}
        aria-describedby={errors.nik ? 'nik-error' : 'nik-hint'}
      />
      {#if errors.nik}
        <span id="nik-error" class="field-error">{errors.nik}</span>
      {:else}
        <span id="nik-hint" class="field-hint">Angka nol di awal akan tetap tersimpan sesuai format resmi.</span>
      {/if}
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
        aria-invalid={Boolean(errors.username)}
        aria-describedby={errors.username ? 'username-error' : undefined}
      />
      {#if errors.username}
        <span id="username-error" class="field-error">{errors.username}</span>
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
        aria-invalid={Boolean(errors.password)}
        aria-describedby={errors.password ? 'password-error' : 'password-hint'}
      />
      {#if errors.password}
        <span id="password-error" class="field-error">{errors.password}</span>
      {:else}
        <span id="password-hint" class="field-hint">Minimal 12 karakter untuk keamanan akun.</span>
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
        aria-invalid={Boolean(errors.confirmPassword)}
        aria-describedby={errors.confirmPassword ? 'confirm-error' : undefined}
      />
      {#if errors.confirmPassword}
        <span id="confirm-error" class="field-error">{errors.confirmPassword}</span>
      {/if}
    </div>

    <button type="submit" class="btn btn-primary" style="width: 100%;" disabled={isSubmitting}>
      {isSubmitting ? 'Mendaftarkan…' : 'Daftar Sekarang'}
    </button>
  </form>

  <div class="auth-footer">
    <span>Sudah memiliki akun?</span>
    <a href="/login" class="btn-link" onclick={(e) => { e.preventDefault(); navigate('/login'); }}>
      Masuk ke Akun
    </a>
  </div>
</div>

<style>
  .auth-card {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 32px;
    width: 100%;
    max-width: 440px;
    margin: 0 auto;
  }

  .auth-header {
    margin-bottom: 24px;
  }

  .auth-subtitle {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    margin-top: 6px;
  }

  .auth-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .auth-footer {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }
</style>
