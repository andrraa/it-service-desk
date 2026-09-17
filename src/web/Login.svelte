<script lang="ts">
  import type { User } from '../server/auth';
  import { navigate } from './router';

  interface Props {
    onSuccess?: (user: User) => void;
  }

  let { onSuccess }: Props = $props();

  let username = $state('');
  let password = $state('');

  let errors = $state<Record<string, string>>({});
  let generalError = $state('');
  let isSubmitting = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    errors = {};
    generalError = '';

    if (!username.trim()) {
      errors.username = 'Username wajib diisi.';
    }
    if (!password) {
      errors.password = 'Password wajib diisi.';
    }
    if (Object.keys(errors).length > 0) return;

    isSubmitting = true;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data: any = await res.json();

      if (!res.ok) {
        if (data.error?.details) {
          errors = data.error.details;
        } else {
          generalError = data.error?.message || 'Login gagal. Periksa kembali akun Anda.';
        }
        return;
      }

      onSuccess?.(data.user);
    } catch {
      generalError = 'Terjadi gangguan jaringan saat menghubungi server.';
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="auth-card">
  <div class="auth-header">
    <h1>Masuk</h1>
    <p class="auth-subtitle">Gunakan username dan password terdaftar Anda untuk mengakses layanan.</p>
  </div>

  {#if generalError}
    <div class="alert alert-error" role="alert">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M12 8v4m0 4h.01" />
      </svg>
      <span>{generalError}</span>
    </div>
  {/if}

  <form onsubmit={handleSubmit} novalidate class="auth-form">
    <div class="form-group">
      <label for="login-username">Username</label>
      <input
        id="login-username"
        type="text"
        bind:value={username}
        placeholder="Masukkan username"
        required
        disabled={isSubmitting}
        class:input-error={Boolean(errors.username)}
        aria-invalid={Boolean(errors.username)}
        aria-describedby={errors.username ? 'login-username-error' : undefined}
      />
      {#if errors.username}
        <span id="login-username-error" class="field-error">{errors.username}</span>
      {/if}
    </div>

    <div class="form-group">
      <label for="login-password">Password</label>
      <input
        id="login-password"
        type="password"
        bind:value={password}
        placeholder="Masukkan password"
        required
        disabled={isSubmitting}
        class:input-error={Boolean(errors.password)}
        aria-invalid={Boolean(errors.password)}
        aria-describedby={errors.password ? 'login-password-error' : undefined}
      />
      {#if errors.password}
        <span id="login-password-error" class="field-error">{errors.password}</span>
      {/if}
    </div>

    <button type="submit" class="btn btn-primary" style="width: 100%;" disabled={isSubmitting}>
      {isSubmitting ? 'Memeriksa kredensial…' : 'Masuk'}
    </button>
  </form>

  <div class="auth-footer">
    <span>Belum memiliki akun?</span>
    <a href="/register" class="btn-link" onclick={(e) => { e.preventDefault(); navigate('/register'); }}>
      Daftar Pengguna Baru
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
    max-width: 420px;
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
