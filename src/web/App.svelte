<script lang="ts">
  import { onMount } from 'svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import Register from './Register.svelte';
  import Login from './Login.svelte';
  import TicketList from './TicketList.svelte';
  import CreateTicket from './CreateTicket.svelte';
  import TicketDetail from './TicketDetail.svelte';
  import Dashboard from './Dashboard.svelte';
  import Admin from './Admin.svelte';
  import Password from './Password.svelte';
  import Notifications from './Notifications.svelte';
  import { parseRoute, navigate, getDefaultPathForRole, type Route } from './router';
  import type { User } from '../server/auth';

  let currentUser = $state<User | null>(null);
  let isCheckingAuth = $state(true);
  let currentRoute = $state<Route>({ view: 'login' });
  let isDrawerOpen = $state(false);
  let menuButtonEl = $state<HTMLButtonElement | null>(null);
  let drawerEl = $state<HTMLElement | null>(null);

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
      syncRouteWithAuth();
    }
  }

  function syncRouteWithAuth() {
    const currentPath = window.location.pathname;
    currentRoute = parseRoute(currentPath);

    if (currentUser) {
      if (currentUser.mustChangePassword) {
        if (currentPath !== '/password') {
          navigate('/password', { replace: true });
          currentRoute = { view: 'password' };
        }
        return;
      }

      if (currentPath === '/login' || currentPath === '/register' || currentPath === '/') {
        const dest = getDefaultPathForRole(currentUser.role);
        navigate(dest, { replace: true });
        currentRoute = parseRoute(dest);
      }
    } else {
      if (currentPath !== '/login' && currentPath !== '/register') {
        navigate('/login', { replace: true });
        currentRoute = { view: 'login' };
      }
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-Requested-With': 'fetch' } });
    } finally {
      currentUser = null;
      isDrawerOpen = false;
      navigate('/login', { replace: true });
      currentRoute = { view: 'login' };
    }
  }

  function toggleDrawer() {
    isDrawerOpen = !isDrawerOpen;
    if (isDrawerOpen) {
      setTimeout(() => drawerEl?.focus(), 50);
    } else {
      menuButtonEl?.focus();
    }
  }

  function closeDrawer() {
    if (isDrawerOpen) {
      isDrawerOpen = false;
      menuButtonEl?.focus();
    }
  }

  function getShortName(name: string) {
    return name.trim().split(/\s+/).slice(0, 2).join(' ');
  }

  onMount(() => {
    void checkAuth();

    const handlePopState = () => {
      syncRouteWithAuth();
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  });
</script>

<a class="skip-link" href="#main">Lewati ke konten utama</a>

{#if isCheckingAuth}
  <div class="unauth-shell">
    <header class="unauth-topbar">
      <span class="brand-title">IT Service Desk</span>
      <ThemeToggle />
    </header>
    <main id="main" class="unauth-main" tabindex="-1">
      <div class="loading-state" role="status" aria-live="polite">
        <p>Memeriksa sesi pengguna…</p>
      </div>
    </main>
  </div>
{:else if !currentUser}
  <!-- Unauthenticated Visitor Shell -->
  <div class="unauth-shell">
    <header class="unauth-topbar">
      <a href="/login" class="brand-title">IT Service Desk</a>
      <ThemeToggle />
    </header>
    <main id="main" class="unauth-main" tabindex="-1">
      {#if currentRoute.view === 'register'}
        <Register onSuccess={() => syncRouteWithAuth()} />
      {:else}
        <Login onSuccess={(user) => {
          currentUser = user;
          const dest = user.mustChangePassword ? '/password' : getDefaultPathForRole(user.role);
          navigate(dest, { replace: true });
          currentRoute = parseRoute(dest);
        }} />
      {/if}
    </main>
  </div>
{:else}
  <!-- Authenticated Shell (100dvh, overflow: hidden) -->
  <div class="auth-shell">
    {#if isDrawerOpen}
      <div
        class="drawer-backdrop"
        onclick={closeDrawer}
        role="presentation"
        aria-hidden="true"
      ></div>
    {/if}

    <aside
      bind:this={drawerEl}
      class="app-sidebar"
      class:drawer-open={isDrawerOpen}
      aria-label="Menu navigasi"
    >
      <div class="brand-header">
        <a
          href={currentUser.mustChangePassword ? '/password' : getDefaultPathForRole(currentUser.role)}
          class="brand-title"
          onclick={() => closeDrawer()}
        >
          IT Service Desk
        </a>
      </div>

      <nav class="sidebar-nav" aria-label="Menu utama">
        {#if currentUser.mustChangePassword}
          <a
            href="/password"
            class="nav-item active"
            onclick={() => closeDrawer()}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Ganti Password
          </a>
        {:else}
          {#if currentUser.role === 'IT Staff' || currentUser.role === 'Super Admin'}
            <a
              href="/it/queue"
              class="nav-item"
              class:active={currentRoute.view === 'it-queue'}
              aria-current={currentRoute.view === 'it-queue' ? 'page' : undefined}
              onclick={() => closeDrawer()}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              Antrean IT
            </a>
          {/if}

          {#if currentUser.role === 'Super Admin'}
            <a
              href="/admin/users"
              class="nav-item"
              class:active={currentRoute.view === 'admin-users'}
              aria-current={currentRoute.view === 'admin-users' ? 'page' : undefined}
              onclick={() => closeDrawer()}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Kelola Staf & Akun
            </a>
          {/if}

          <a
            href="/tickets"
            class="nav-item"
            class:active={currentRoute.view === 'tickets' || currentRoute.view === 'ticket-detail' || currentRoute.view === 'tickets-new'}
            aria-current={currentRoute.view === 'tickets' ? 'page' : undefined}
            onclick={() => closeDrawer()}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            Tiket Saya
          </a>
        {/if}
      </nav>

      <div class="sidebar-user">
        <div class="sidebar-theme-wrapper">
          <ThemeToggle />
        </div>

        <button type="button" class="btn-logout" onclick={handleLogout}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Keluar
        </button>
      </div>
    </aside>

    <div class="app-workspace">
      <header class="app-topbar">
        <div class="topbar-left">
          <button
            bind:this={menuButtonEl}
            type="button"
            class="btn-mobile-menu"
            aria-expanded={isDrawerOpen}
            aria-label={isDrawerOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
            onclick={toggleDrawer}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
            <span>Menu</span>
          </button>

          {#if currentRoute.view === 'tickets'}
            <span class="topbar-title">Tiket Saya</span>
          {:else if currentRoute.view === 'it-queue'}
            <span class="topbar-title">Antrean IT</span>
          {:else if currentRoute.view === 'admin-users'}
            <span class="topbar-title">Manajemen Staf IT & Pengguna</span>
          {:else if currentRoute.view === 'password'}
            <span class="topbar-title">Ganti Password</span>
          {:else if currentRoute.view === 'tickets-new'}
            <span class="topbar-title">Buat Tiket</span>
          {:else if currentRoute.view === 'ticket-detail'}
            <span class="topbar-title tabular-nums">{currentRoute.ticketNumber}</span>
          {/if}
        </div>

        <!-- Right: User Profile (Avatar & Name) in Navbar -->
        <div class="topbar-right">
          {#if !currentUser.mustChangePassword}
            <Notifications />
          {/if}
          <div class="user-profile topbar-profile">
            <svg class="user-avatar" viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
            <div class="user-profile-info">
              <span class="user-display-name user-name-full" title={currentUser.fullName || currentUser.username}>
                {currentUser.fullName || currentUser.username}
              </span>
              <span class="user-display-name user-name-short" title={currentUser.fullName || currentUser.username}>
                {getShortName(currentUser.fullName || currentUser.username)}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main id="main" tabindex="-1">
        {#if currentRoute.view === 'password'}
          <Password
            {currentUser}
            onSuccess={async () => {
              await checkAuth();
              if (currentUser && !currentUser.mustChangePassword) {
                const destination = getDefaultPathForRole(currentUser.role);
                navigate(destination, { replace: true });
                currentRoute = parseRoute(destination);
              }
            }}
          />
        {:else if currentRoute.view === 'admin-users' && currentUser.role === 'Super Admin'}
          <Admin />
        {:else if currentRoute.view === 'it-queue' && (currentUser.role === 'IT Staff' || currentUser.role === 'Super Admin')}
          <Dashboard
            {currentUser}
            onSelectTicket={(ticket) => navigate(`/tickets/${ticket.ticketNumber}`)}
          />
        {:else if currentRoute.view === 'tickets'}
          <TicketList
            canViewAll={currentUser.role !== 'User'}
            onCreateNewTicket={() => navigate('/tickets/new')}
            onSelectTicket={(ticket) => navigate(`/tickets/${ticket.ticketNumber}`)}
          />
        {:else if currentRoute.view === 'tickets-new'}
          <CreateTicket
            onCancel={() => navigate('/tickets')}
            onCreated={(newTicket) => navigate(`/tickets/${newTicket.ticketNumber}`)}
          />
        {:else if currentRoute.view === 'ticket-detail'}
          <TicketDetail
            ticketId={currentRoute.ticketNumber}
            currentUser={currentUser}
            onBack={() => navigate(currentUser?.role === 'User' ? '/tickets' : '/it/queue')}
          />
        {/if}
      </main>
    </div>
  </div>
{/if}
