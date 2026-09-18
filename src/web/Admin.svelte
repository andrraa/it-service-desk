<script lang="ts">
  import { onMount } from 'svelte';
  import type { User } from '../server/auth';

  let users = $state<User[]>([]);
  let isLoading = $state(true);
  let errorMessage = $state('');
  let page = $state(1);
  let totalPages = $state(1);
  let totalUsers = $state(0);
  let searchQuery = $state('');
  let roleFilter = $state('');
  let statusFilter = $state('');

  // Create staff form
  let showCreateModal = $state(false);
  let newFullName = $state('');
  let newUsername = $state('');
  let createError = $state('');
  let createdTempPassword = $state('');
  let isCreating = $state(false);

  // Status toggle confirmation modal
  let targetUser = $state<User | null>(null);
  let toggleError = $state('');
  let isUpdating = $state(false);

  // Reset password confirmation modal
  let resetTargetUser = $state<User | null>(null);
  let resetError = $state('');
  let issuedTempPassword = $state('');
  let isResetting = $state(false);

  async function fetchUsers(targetPage = page) {
    isLoading = true;
    errorMessage = '';
    try {
      const url = new URL('/api/admin/users', window.location.origin);
      url.searchParams.set('page', String(targetPage));
      url.searchParams.set('limit', '10');
      if (searchQuery.trim()) url.searchParams.set('q', searchQuery.trim());
      if (roleFilter) url.searchParams.set('role', roleFilter);
      if (statusFilter) url.searchParams.set('status', statusFilter);
      const res = await fetch(url);
      if (!res.ok) throw new Error('Gagal memuat daftar pengguna.');
      const data: any = await res.json();
      users = data.users || [];
      page = data.pagination?.page || 1;
      totalPages = data.pagination?.totalPages || 1;
      totalUsers = data.pagination?.total || 0;
    } catch {
      errorMessage = 'Tidak dapat memuat data staf/pengguna.';
    } finally {
      isLoading = false;
    }
  }

  function handleSearch(e: Event) {
    e.preventDefault();
    void fetchUsers(1);
  }

  function resetFilters() {
    searchQuery = '';
    roleFilter = '';
    statusFilter = '';
    void fetchUsers(1);
  }

  async function handleCreateITStaff(e: Event) {
    e.preventDefault();
    if (!newFullName.trim() || !newUsername.trim()) {
      createError = 'Nama lengkap dan Username wajib diisi.';
      return;
    }

    isCreating = true;
    createError = '';
    createdTempPassword = '';

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'fetch',
        },
        body: JSON.stringify({ fullName: newFullName.trim(), username: newUsername.trim() }),
      });

      const data: any = await res.json();
      if (!res.ok) {
        createError = data.error?.message || 'Gagal menambahkan staf IT.';
        return;
      }

      createdTempPassword = data.temporaryPassword;
      newFullName = '';
      newUsername = '';
      await fetchUsers();
    } catch {
      createError = 'Terjadi kesalahan jaringan saat membuat akun.';
    } finally {
      isCreating = false;
    }
  }

  async function handleToggleStatus() {
    if (!targetUser) return;
    isUpdating = true;
    toggleError = '';

    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'fetch',
        },
        body: JSON.stringify({ isActive: !targetUser.isActive }),
      });

      const data: any = await res.json();
      if (!res.ok) {
        toggleError = data.error?.message || 'Gagal memperbarui status akun.';
        return;
      }

      targetUser = null;
      await fetchUsers();
    } catch {
      toggleError = 'Terjadi kesalahan jaringan saat memperbarui status.';
    } finally {
      isUpdating = false;
    }
  }

  async function handleResetPassword() {
    if (!resetTargetUser) return;
    isResetting = true;
    resetError = '';
    issuedTempPassword = '';

    try {
      const res = await fetch(`/api/admin/users/${resetTargetUser.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'fetch',
        },
      });

      const data: any = await res.json();
      if (!res.ok) {
        resetError = data.error?.message || 'Gagal mereset password.';
        return;
      }

      issuedTempPassword = data.temporaryPassword;
      await fetchUsers();
    } catch {
      resetError = 'Terjadi kesalahan jaringan saat menghubungi server.';
    } finally {
      isResetting = false;
    }
  }

  onMount(() => {
    void fetchUsers();
  });
</script>

<div class="admin-container">
  <div class="page-heading">
    <div>
      <h1>Manajemen Pengguna</h1>
    </div>
    <button type="button" class="btn btn-primary btn-add-staff" onclick={() => { showCreateModal = true; createdTempPassword = ''; createError = ''; }}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      Tambah Staf IT
    </button>
  </div>

  <div class="toolbar">
    <form class="search-form" onsubmit={handleSearch}>
      <input type="search" bind:value={searchQuery} aria-label="Cari pengguna" placeholder="Cari nama atau username…" />
      <button type="submit" class="btn btn-secondary">Cari</button>
    </form>
    <div class="filter-controls">
      <label class="sr-only" for="admin-role-filter">Filter role</label>
      <select id="admin-role-filter" bind:value={roleFilter} onchange={() => fetchUsers(1)}>
        <option value="">Semua Role</option>
        <option value="User">User</option>
        <option value="IT Staff">IT Staff</option>
        <option value="Super Admin">Super Admin</option>
      </select>
      <label class="sr-only" for="admin-status-filter">Filter status akun</label>
      <select id="admin-status-filter" bind:value={statusFilter} onchange={() => fetchUsers(1)}>
        <option value="">Semua Status</option>
        <option value="active">Aktif</option>
        <option value="inactive">Nonaktif</option>
      </select>
      {#if searchQuery.trim() || roleFilter || statusFilter}
        <button type="button" class="btn btn-secondary" onclick={resetFilters}>Reset</button>
      {/if}
    </div>
  </div>

  {#if errorMessage}
    <div class="alert alert-error" role="alert">{errorMessage}</div>
  {/if}

  {#if isLoading}
    <div class="loading-state">
      <p>Memuat data pengguna…</p>
    </div>
  {:else}
    <div class="table-card">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Nama</th>
            <th>Username</th>
            <th>Role</th>
            <th>Status</th>
            <th>Ganti Password</th>
            <th>Bergabung</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {#each users as u}
            <tr>
              <td><strong>{u.fullName || u.username}</strong></td>
              <td class="cell-username">{u.username}</td>
              <td>
                <span class="role-badge role-{u.role.toLowerCase().replace(' ', '-')}">
                  {u.role}
                </span>
              </td>
              <td>
                <span class="status-badge" class:active={u.isActive} class:inactive={!u.isActive}>
                  {u.isActive ? 'Aktif' : 'Nonaktif'}
                </span>
              </td>
              <td>{u.mustChangePassword ? 'Ya (Password Baru)' : 'Tidak'}</td>
              <td class="cell-time">{new Date(u.createdAt).toLocaleDateString('id-ID')}</td>
              <td class="cell-actions">
                {#if u.role !== 'Super Admin'}
                  <button
                    type="button"
                    class="btn-reset-pw"
                    title="Reset password"
                    aria-label={`Reset password ${u.fullName || u.username}`}
                    onclick={() => { resetTargetUser = u; resetError = ''; issuedTempPassword = ''; }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.14.37.36.7.64.96.3.27.68.42 1.08.44H21v4h-.1A1.7 1.7 0 0 0 19.4 15Z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="btn-toggle"
                    class:btn-disable={u.isActive}
                    class:btn-enable={!u.isActive}
                    title={u.isActive ? 'Nonaktifkan akun' : 'Aktifkan akun'}
                    aria-label={`${u.isActive ? 'Nonaktifkan' : 'Aktifkan'} akun ${u.fullName || u.username}`}
                    onclick={() => { targetUser = u; toggleError = ''; }}
                  >
                    {#if u.isActive}
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" /><line x1="8" y1="8" x2="16" y2="16" />
                      </svg>
                    {:else}
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" /><polyline points="8 12 11 15 16 9" />
                      </svg>
                    {/if}
                  </button>
                {:else}
                  <button type="button" class="btn-protected" title="Akun Super Admin dilindungi" aria-label="Akun Super Admin dilindungi" disabled>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <rect x="4" y="10" width="16" height="11" rx="2" />
                      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                    </svg>
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <nav class="pagination-bar" aria-label="Navigasi halaman pengguna">
      <span class="pagination-info">Halaman {page} dari {totalPages} ({totalUsers} pengguna)</span>
      <div class="pagination-actions">
        <button type="button" class="btn btn-secondary" disabled={isLoading || page <= 1} onclick={() => fetchUsers(page - 1)}>
          Sebelumnya
        </button>
        <button type="button" class="btn btn-secondary" disabled={isLoading || page >= totalPages} onclick={() => fetchUsers(page + 1)}>
          Berikutnya
        </button>
      </div>
    </nav>
  {/if}

  <!-- Modal Tambah IT Staff -->
  {#if showCreateModal}
    <div
      class="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-staff-title"
      tabindex="-1"
      onkeydown={(e) => { if (e.key === 'Escape') showCreateModal = false; }}
    >
      <div class="modal-card">
        <h3 id="modal-staff-title">Tambah Akun Staf IT Baru</h3>
        <p class="modal-sub">Akun baru akan mendapatkan password sementara yang wajib diganti pada saat login pertama.</p>

        {#if createError}
          <div class="alert alert-error" role="alert" style="margin-top: 10px;">{createError}</div>
        {/if}

        {#if createdTempPassword}
          <div class="alert alert-success" role="status" style="margin-top: 12px; flex-direction: column; align-items: flex-start;">
            <strong>Akun Staf IT Berhasil Dibuat!</strong>
            <p style="margin-top: 4px; font-size: 0.85rem;">Salin dan sampaikan password sementara di bawah kepada staf terkait:</p>
            <div class="temp-password-box">
              <code>{createdTempPassword}</code>
            </div>
            <span style="font-size: 0.75rem; color: var(--color-text-muted); margin-top: 4px;">Password ini hanya ditampilkan sekali demi keamanan.</span>
          </div>
          <div class="modal-actions" style="margin-top: 16px;">
            <button type="button" class="btn btn-primary" onclick={() => (showCreateModal = false)}>
              Tutup
            </button>
          </div>
        {:else}
          <form onsubmit={handleCreateITStaff} class="staff-form" style="margin-top: 14px;">
            <div class="form-group">
              <label for="staff-fullname">Nama Lengkap <span class="required-mark" aria-hidden="true">*</span></label>
              <input id="staff-fullname" type="text" bind:value={newFullName} placeholder="Contoh: Budi Santoso" required disabled={isCreating} />
            </div>

            <div class="form-group">
              <label for="staff-username">Username Staf <span class="required-mark" aria-hidden="true">*</span></label>
              <input id="staff-username" type="text" bind:value={newUsername} placeholder="Contoh: budi.it" required disabled={isCreating} />
            </div>

            <div class="modal-actions" style="margin-top: 16px;">
              <button type="submit" class="btn btn-primary" disabled={isCreating}>
                {isCreating ? 'Menyimpan…' : 'Buat Akun Staf'}
              </button>
              <button type="button" class="btn btn-secondary" onclick={() => (showCreateModal = false)}>
                Batal
              </button>
            </div>
          </form>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Modal Reset Password Admin -->
  {#if resetTargetUser}
    <div
      class="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-reset-title"
      tabindex="-1"
      onkeydown={(e) => { if (e.key === 'Escape') resetTargetUser = null; }}
    >
      <div class="modal-card">
        <h3 id="modal-reset-title">Reset Password Pengguna</h3>
        <p class="modal-sub">
          Pengguna: <strong>{resetTargetUser.fullName || resetTargetUser.username}</strong> (@{resetTargetUser.username}) — Role: {resetTargetUser.role}
        </p>

        {#if resetError}
          <div class="alert alert-error" role="alert" style="margin-top: 12px;">{resetError}</div>
        {/if}

        {#if issuedTempPassword}
          <div class="alert alert-success" role="status" style="margin-top: 12px; flex-direction: column; align-items: flex-start;">
            <strong>Password Sementara Berhasil Diterbitkan!</strong>
            <p style="margin-top: 4px; font-size: 0.85rem;">Berlaku selama 24 jam. Salin dan sampaikan kepada pengguna melalui kanal aman:</p>
            <div class="temp-password-box">
              <code>{issuedTempPassword}</code>
            </div>
            <span style="font-size: 0.75rem; color: var(--color-text-muted); margin-top: 4px;">Seluruh sesi login lama pengguna ini telah otomatis dicabut.</span>
          </div>
          <div class="modal-actions" style="margin-top: 16px;">
            <button type="button" class="btn btn-primary" onclick={() => (resetTargetUser = null)}>
              Tutup
            </button>
          </div>
        {:else}
          <p style="margin-top: 12px; font-size: 0.85rem; color: var(--color-text-muted); line-height: 1.5;">
            Tindakan ini akan <strong>mencabut seluruh sesi aktif</strong> akun tersebut dan menghasilkan password sementara baru yang berlaku maksimal 24 jam. Pengguna akan diwajibkan membuat password baru setelah masuk.
          </p>

          <div class="modal-actions" style="margin-top: 20px;">
            <button
              type="button"
              class="btn btn-primary"
              disabled={isResetting}
              onclick={handleResetPassword}
            >
              {isResetting ? 'Menerbitkan…' : 'Terbitkan Password Sementara'}
            </button>
            <button type="button" class="btn btn-secondary" onclick={() => (resetTargetUser = null)}>
              Batal
            </button>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Modal Konfirmasi Status -->
  {#if targetUser}
    <div
      class="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-confirm-title"
      tabindex="-1"
      onkeydown={(e) => { if (e.key === 'Escape') targetUser = null; }}
    >
      <div class="modal-card">
        <h3 id="modal-confirm-title">
          {targetUser.isActive ? 'Nonaktifkan Akun Pengguna?' : 'Aktifkan Kembali Akun?'}
        </h3>
        <p class="modal-sub">
          Pengguna: <strong>{targetUser.fullName || targetUser.username}</strong> (@{targetUser.username}) — Role: {targetUser.role}
        </p>

        {#if toggleError}
          <div class="alert alert-error" role="alert" style="margin-top: 12px;">{toggleError}</div>
        {/if}

        <p style="margin-top: 12px; font-size: 0.85rem; color: var(--color-text-muted);">
          {#if targetUser.isActive}
            Menonaktifkan akun akan langsung mencabut seluruh sesi login yang sedang aktif. Jika akun merupakan staf IT dengan tiket aktif, pastikan penugasan tiket telah dialihkan terlebih dahulu.
          {:else}
            Mengaktifkan akun akan mengizinkan kembali pengguna untuk masuk dan mengakses workspace.
          {/if}
        </p>

        <div class="modal-actions" style="margin-top: 20px;">
          <button
            type="button"
            class="btn"
            class:btn-danger={targetUser.isActive}
            class:btn-primary={!targetUser.isActive}
            disabled={isUpdating}
            onclick={handleToggleStatus}
          >
            {isUpdating ? 'Memproses…' : targetUser.isActive ? 'Ya, Nonaktifkan Akun' : 'Ya, Aktifkan Akun'}
          </button>
          <button type="button" class="btn btn-secondary" onclick={() => (targetUser = null)}>
            Batal
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .admin-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .page-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  .btn-add-staff {
    margin-bottom: 8px;
  }

  .toolbar,
  .filter-controls,
  .search-form {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .toolbar {
    justify-content: space-between;
  }

  .search-form {
    flex: 1;
    min-width: 280px;
    max-width: 480px;
  }

  .search-form input {
    flex: 1;
  }

  .filter-controls select {
    width: auto;
    min-width: 150px;
  }

  .pagination-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  .pagination-info {
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .pagination-actions {
    display: flex;
    gap: 8px;
  }

  .table-card {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow-x: auto;
  }

  .admin-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    font-size: 0.85rem;
  }

  th {
    background-color: var(--color-bg);
    padding: 12px 16px;
    font-weight: 600;
    color: var(--color-text-muted);
    border-bottom: 1px solid var(--color-border);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  td {
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border);
  }

  tr:last-child td {
    border-bottom: none;
  }

  .cell-username {
    font-family: monospace;
  }

  .cell-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .role-badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .role-super-admin {
    background-color: rgba(147, 51, 234, 0.15);
    color: #9333ea;
  }

  .role-it-staff {
    background-color: rgba(37, 99, 235, 0.15);
    color: var(--color-primary);
  }

  .role-user {
    background-color: rgba(100, 116, 139, 0.15);
    color: var(--color-text-muted);
  }

  .status-badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .status-badge.active {
    background-color: rgba(22, 163, 74, 0.15);
    color: var(--color-success);
  }

  .status-badge.inactive {
    background-color: rgba(220, 38, 38, 0.15);
    color: var(--color-danger);
  }

  .btn-reset-pw {
    border: 1px solid var(--color-border);
    background-color: var(--color-surface);
    color: var(--color-primary);
  }

  .btn-reset-pw:hover {
    background-color: var(--color-bg);
  }

  .btn-reset-pw,
  .btn-toggle,
  .btn-protected {
    width: 40px;
    min-width: 40px;
    min-height: 40px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .btn-protected {
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    color: var(--color-text-muted);
    opacity: 0.7;
  }

  .btn-disable {
    background-color: rgba(220, 38, 38, 0.1);
    color: var(--color-danger);
    border: 1px solid rgba(220, 38, 38, 0.2);
  }

  .btn-disable:hover {
    background-color: var(--color-danger-bg);
    color: var(--color-danger);
  }

  .btn-enable {
    background-color: rgba(22, 163, 74, 0.1);
    color: var(--color-success);
    border: 1px solid rgba(22, 163, 74, 0.2);
  }

  .btn-enable:hover {
    background-color: var(--color-success);
    color: #ffffff;
  }

  .text-protected {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-style: italic;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    border: none;
  }

  .btn-primary {
    background-color: var(--color-primary);
    color: var(--color-primary-text);
  }

  .btn-secondary {
    background-color: var(--color-bg);
    border: 1px solid var(--color-border);
    color: var(--color-text);
  }

  .btn-danger {
    background-color: var(--color-danger);
    color: #ffffff;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    padding: 20px;
  }

  .modal-card {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 24px;
    max-width: 480px;
    width: 100%;
  }

  .modal-sub {
    font-size: 0.85rem;
    color: var(--color-text-muted);
    margin-top: 4px;
  }

  .modal-actions {
    display: flex;
    gap: 10px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }

  label {
    font-size: 0.85rem;
    font-weight: 600;
  }

  input {
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background-color: var(--color-bg);
    color: var(--color-text);
    font-size: 0.875rem;
  }

  .temp-password-box {
    background-color: var(--color-bg);
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-sm);
    padding: 8px 12px;
    margin-top: 6px;
    font-size: 1.1rem;
    font-family: monospace;
    color: var(--color-primary);
    letter-spacing: 0.05em;
  }

  .alert {
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
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

  .loading-state {
    text-align: center;
    padding: 40px;
    color: var(--color-text-muted);
  }
</style>
