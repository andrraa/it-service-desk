<script lang="ts">
  import { onMount } from 'svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import HealthPanel from './HealthPanel.svelte';
  import Register from './Register.svelte';
  import Login from './Login.svelte';
  import TicketList from './TicketList.svelte';
  import CreateTicket from './CreateTicket.svelte';
  import TicketDetail from './TicketDetail.svelte';
  import Dashboard from './Dashboard.svelte';
  import type { User } from '../server/auth';
  import type { Ticket } from '../server/tickets';

  let currentUser = $state<User | null>(null);
  let isCheckingAuth = $state(true);
  let currentView = $state<'overview' | 'register' | 'login' | 'tickets' | 'create-ticket' | 'ticket-detail' | 'dashboard'>('overview');
  let selectedTicket = $state<Ticket | null>(null);

  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data: any = await res.json();
        currentUser = data.user;
      } else {
        currentUser = null;
      }
    } catch {
      currentUser = null;
    } finally {
      isCheckingAuth = false;
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-Requested-With': 'fetch' } });
    } finally {
      currentUser = null;
      currentView = 'overview';
    }
  }

  onMount(() => {
    void checkAuth();
  });
</script>

<a class="skip-link" href="#main">Lewati ke konten utama</a>
<div class="workspace">
  <aside class="sidebar" aria-label="Workspace">
    <a class="brand" href="/" aria-label="IT Service Desk — beranda" onclick={(e) => { e.preventDefault(); currentView = 'overview'; }}>
      <span class="brand-mark" aria-hidden="true">IT<span class="brand-dot">.</span></span>
      <span><strong>Service Desk</strong><small>INTERNAL WORKSPACE</small></span>
    </a>

    <nav aria-label="Navigasi utama">
      <p class="nav-label">WORKSPACE</p>
      <button
        type="button"
        class="nav-link"
        class:active={currentView === 'overview'}
        aria-current={currentView === 'overview' ? 'page' : undefined}
        onclick={() => (currentView = 'overview')}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        Ringkasan
      </button>

      {#if currentUser}
        {#if currentUser.role === 'IT Staff' || currentUser.role === 'Super Admin'}
          <p class="nav-label" style="margin-top: 16px;">OPERASIONAL</p>
          <button
            type="button"
            class="nav-link"
            class:active={currentView === 'dashboard'}
            aria-current={currentView === 'dashboard' ? 'page' : undefined}
            onclick={() => (currentView = 'dashboard')}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            Dashboard Antrean IT
          </button>
        {/if}

        <p class="nav-label" style="margin-top: 16px;">LAYANAN TIKET</p>
        <button
          type="button"
          class="nav-link"
          class:active={currentView === 'tickets' || currentView === 'ticket-detail'}
          aria-current={currentView === 'tickets' ? 'page' : undefined}
          onclick={() => { currentView = 'tickets'; selectedTicket = null; }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
          </svg>
          Tiket Saya
        </button>

        <button
          type="button"
          class="nav-link"
          class:active={currentView === 'create-ticket'}
          aria-current={currentView === 'create-ticket' ? 'page' : undefined}
          onclick={() => (currentView = 'create-ticket')}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Buat Tiket Baru
        </button>
      {:else if !isCheckingAuth}
        <p class="nav-label" style="margin-top: 16px;">AKUN</p>
        <button
          type="button"
          class="nav-link"
          class:active={currentView === 'login'}
          aria-current={currentView === 'login' ? 'page' : undefined}
          onclick={() => (currentView = 'login')}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />
          </svg>
          Masuk
        </button>

        <button
          type="button"
          class="nav-link"
          class:active={currentView === 'register'}
          aria-current={currentView === 'register' ? 'page' : undefined}
          onclick={() => (currentView = 'register')}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
          </svg>
          Daftar Akun
        </button>
      {/if}
    </nav>

    {#if currentUser}
      <div class="user-profile-widget">
        <div class="user-info">
          <span class="user-name"><strong>{currentUser.username}</strong> ({currentUser.nik})</span>
          <span class="user-role badge-role">{currentUser.role}</span>
        </div>
        <button type="button" class="btn-logout" onclick={handleLogout} title="Keluar dari akun">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Keluar
        </button>
      </div>
    {:else}
      <div class="sidebar-note">
        <span class="version-label">MVP · DALAM PENGEMBANGAN</span>
        <p>Workspace internal untuk pelaporan dan penanganan kendala IT.</p>
      </div>
    {/if}
  </aside>

  <div class="workspace-body">
    <header class="topbar">
      <div class="breadcrumb">
        <span>Workspace</span>
        <span aria-hidden="true">/</span>
        <strong>
          {currentView === 'overview'
            ? 'Ringkasan'
            : currentView === 'dashboard'
            ? 'Dashboard IT'
            : currentView === 'register'
            ? 'Daftar Akun'
            : currentView === 'login'
            ? 'Masuk'
            : currentView === 'tickets'
            ? 'Tiket Saya'
            : currentView === 'create-ticket'
            ? 'Buat Tiket'
            : selectedTicket?.ticketNumber || 'Detail Tiket'}
        </strong>
      </div>
      <ThemeToggle />
    </header>

    <main id="main" tabindex="-1">
      {#if currentView === 'overview'}
        <div class="page-heading">
          <div>
            <p class="eyebrow">IT SERVICE DESK</p>
            <h1>Ringkasan workspace</h1>
            <p class="page-description">Fondasi layanan IT, dari laporan pertama hingga solusi terdokumentasi.</p>
          </div>
          <span class="stage-label">Tahap fondasi</span>
        </div>

        {#if currentUser}
          <div class="welcome-banner">
            <div>
              <h3>Selamat datang, {currentUser.username}!</h3>
              <p>Role Anda: <strong>{currentUser.role}</strong>. Akses fitur tiket melalui navigasi sebelah kiri.</p>
            </div>
            {#if currentUser.role === 'IT Staff' || currentUser.role === 'Super Admin'}
              <button type="button" class="btn btn-primary" onclick={() => (currentView = 'dashboard')}>
                Buka Dashboard IT
              </button>
            {:else}
              <button type="button" class="btn btn-primary" onclick={() => (currentView = 'create-ticket')}>
                Laporkan Kendala
              </button>
            {/if}
          </div>
        {/if}

        <HealthPanel />

        <section class="panel" aria-labelledby="workflow-title">
          <div class="section-heading">
            <div><p class="eyebrow">ALUR LAYANAN</p><h2 id="workflow-title">Setiap kendala, progres yang jelas.</h2></div>
            <span class="secondary-label">Rencana fitur</span>
          </div>
          <ol class="workflow">
            <li><span class="step-number">01</span><h3>Open</h3><p>Laporkan kendala, pilih prioritas, dan sertakan bukti pendukung.</p></li>
            <li><span class="step-number">02</span><h3>In Progress</h3><p>Tim IT menangani tiket dan berdiskusi dengan Anda dalam satu ruang.</p></li>
            <li><span class="step-number">03</span><h3>Closed</h3><p>Solusi dicatat. Percakapan dan lampiran tersimpan sebagai histori.</p></li>
          </ol>
        </section>
      {:else if currentView === 'dashboard' && currentUser}
        <Dashboard
          {currentUser}
          onSelectTicket={(t) => {
            selectedTicket = t;
            currentView = 'ticket-detail';
          }}
        />
      {:else if currentView === 'login'}
        <Login
          onSuccess={(user) => {
            currentUser = user;
            currentView = user.role === 'User' ? 'tickets' : 'dashboard';
          }}
          onSwitchToRegister={() => (currentView = 'register')}
        />
      {:else if currentView === 'register'}
        <Register
          onSuccess={() => (currentView = 'login')}
          onSwitchToLogin={() => (currentView = 'login')}
        />
      {:else if currentView === 'tickets'}
        <TicketList
          canViewAll={Boolean(currentUser && currentUser.role !== 'User')}
          onCreateNewTicket={() => (currentView = 'create-ticket')}
          onSelectTicket={(t) => {
            selectedTicket = t;
            currentView = 'ticket-detail';
          }}
        />
      {:else if currentView === 'create-ticket'}
        <CreateTicket
          onCancel={() => (currentView = 'tickets')}
          onCreated={(newTicket) => {
            selectedTicket = newTicket;
            currentView = 'ticket-detail';
          }}
        />
      {:else if currentView === 'ticket-detail' && selectedTicket && currentUser}
        <TicketDetail
          ticketId={selectedTicket.id}
          {currentUser}
          onBack={() => {
            selectedTicket = null;
            currentView = currentUser?.role === 'User' ? 'tickets' : 'dashboard';
          }}
        />
      {/if}

      <footer class="page-footer"><span>IT Service Desk</span><span>Corporate workspace · v0.1</span></footer>
    </main>
  </div>
</div>

<style>
  .user-profile-widget {
    margin-top: auto;
    padding: 12px;
    background-color: var(--color-bg);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .user-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .user-name {
    font-size: 0.85rem;
    color: var(--color-text);
  }

  .badge-role {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--color-primary);
    background-color: var(--color-surface);
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid var(--color-border);
    align-self: flex-start;
  }

  .btn-logout {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    color: var(--color-danger);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .btn-logout:hover {
    background-color: var(--color-surface-hover);
  }

  .welcome-banner {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-left: 4px solid var(--color-primary);
    border-radius: var(--radius-sm);
    padding: 16px 20px;
    margin-bottom: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }

  .welcome-banner h3 {
    font-size: 1rem;
    margin-bottom: 2px;
  }

  .welcome-banner p {
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  .btn {
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    border: none;
    transition: background-color 0.15s;
    white-space: nowrap;
  }

  .btn-primary {
    background-color: var(--color-primary);
    color: var(--color-primary-text);
  }

  .btn-primary:hover {
    background-color: var(--color-primary-hover);
  }
</style>
