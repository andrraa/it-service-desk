<script lang="ts">
  import type { User } from '../server/auth';

  interface Props {
    onSuccess?: (user: User) => void;
    onSwitchToRegister?: () => void;
  }

  let { onSuccess, onSwitchToRegister }: Props = $props();

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
    <p class="eyebrow">PORTAL INTERNAL</p>
    <h2>Masuk ke Workspace</h2>
    <p class="auth-subtitle">Gunakan username dan password terdaftar Anda.</p>
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
        placeholder="Username Anda"
        required
        disabled={isSubmitting}
        class:input-error={Boolean(errors.username)}
      />
      {#if errors.username}
        <span class="field-error">{errors.username}</span>
      {/if}
    </div>

    <div class="form-group">
      <label for="login-password">Password</label>
      <input
        id="login-password"
        type="password"
        bind:value={password}
        placeholder="Password Anda"
        required
        disabled={isSubmitting}
        class:input-error={Boolean(errors.password)}
      />
      {#if errors.password}
        <span class="field-error">{errors.password}</span>
      {/if}
    </div>

    <button type="submit" class="btn btn-primary" disabled={isSubmitting}>
      {isSubmitting ? 'Memeriksa kredensial…' : 'Masuk'}
    </button>
  </form>

  <div class="auth-footer">
    <span>Belum memiliki akun?</span>
    <button type="button" class="btn-link" onclick={onSwitchToRegister}>
      Daftar Pengguna Baru
    </button>
  </div>
</div>

<style>
  .auth-card {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 28px;
    max-width: 440px;
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
</style>
