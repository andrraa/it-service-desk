<script lang="ts">
  import { navigate } from './router';

  interface Props {
    onSuccess?: () => void;
  }

  let { onSuccess }: Props = $props();

  let nik = $state('');
  let fullName = $state('');
  let username = $state('');
  let password = $state('');
  let confirmPassword = $state('');

  let errors = $state<Record<string, string>>({});
  let generalError = $state('');
  let successMessage = $state('');
  let isSubmitting = $state(false);

  // Format UC Words on input blur
  function handleFullNameBlur() {
    if (fullName.trim()) {
      fullName = fullName
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    errors = {};
    generalError = '';
    successMessage = '';

    handleFullNameBlur();

    if (password !== confirmPassword) {
      errors = { confirmPassword: 'Konfirmasi password tidak cocok.' };
      return;
    }

    isSubmitting = true;
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nik, fullName, username, password }),
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
      fullName = '';
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

<div class="auth-card register-card">
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
    <!-- Baris 1: NIK & Nama Lengkap -->
    <div class="form-row-2">
      <div class="form-group">
        <label for="nik">Nomor Induk Karyawan (NIK)</label>
        <input
          id="nik"
          type="text"
          bind:value={nik}
          placeholder="Contoh: 12.345.678"
          required
          disabled={isSubmitting}
          class:input-error={Boolean(errors.nik)}
          aria-invalid={Boolean(errors.nik)}
          aria-describedby={errors.nik ? 'nik-error' : 'nik-hint'}
        />
        {#if errors.nik}
          <span id="nik-error" class="field-error">{errors.nik}</span>
        {:else}
          <span id="nik-hint" class="field-hint">Mendukung angka, titik, dan tanda hubung.</span>
        {/if}
      </div>

      <div class="form-group">
        <label for="fullName">Nama Lengkap</label>
        <input
          id="fullName"
          type="text"
          bind:value={fullName}
          onblur={handleFullNameBlur}
          placeholder="Contoh: John Doe"
          required
          disabled={isSubmitting}
          class:input-error={Boolean(errors.fullName)}
          aria-invalid={Boolean(errors.fullName)}
          aria-describedby={errors.fullName ? 'fullname-error' : undefined}
        />
        {#if errors.fullName}
          <span id="fullname-error" class="field-error">{errors.fullName}</span>
        {/if}
      </div>
    </div>

    <!-- Baris 2: Username -->
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

    <!-- Baris 3: Password & Konfirmasi Password -->
    <div class="form-row-2">
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
          <span id="password-hint" class="field-hint">Minimal 12 karakter.</span>
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
    </div>

    <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 8px;" disabled={isSubmitting}>
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
  .register-card {
    max-width: 620px;
  }

  .auth-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .form-row-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  @media (max-width: 640px) {
    .form-row-2 {
      grid-template-columns: 1fr;
      gap: 16px;
    }
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
