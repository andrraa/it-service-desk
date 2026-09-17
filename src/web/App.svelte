<script lang="ts">
  import { onMount } from 'svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import Register from './Register.svelte';
  import Login from './Login.svelte';
  import TicketList from './TicketList.svelte';
  import CreateTicket from './CreateTicket.svelte';
  import TicketDetail from './TicketDetail.svelte';
  import Dashboard from './Dashboard.svelte';
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
    const route = parseRoute(window.location.pathname);
    if (!currentUser) {
      if (route.view !== 'login' && route.view !== 'register') {
        navigate('/login', { replace: true });
        currentRoute = { view: 'login' };
      } else {
        currentRoute = route;
      }
    } else {
      if (route.view === 'login' || route.view === 'register' || route.view === 'unknown') {
        const dest = getDefaultPathForRole(currentUser.role);
        navigate(dest, { replace: true });
        currentRoute = parseRoute(dest);
      } else if (route.view === 'it-queue' && currentUser.role === 'User') {
        navigate('/tickets', { replace: true });
        currentRoute = { view: 'tickets' };
      } else {
        currentRoute = route;
      }
    }
  }

  async function handleLogout() {
    closeDrawer();
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-Requested-With': 'fetch' } });
    } finally {
      currentUser = null;
      navigate('/login', { replace: true });
      currentRoute = { view: 'login' };
    }
  }

  function toggleDrawer() {
    if (isDrawerOpen) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  function openDrawer() {
    isDrawerOpen = true;
    document.body.style.overflow = 'hidden';
    // Focus first focusable item in drawer
    setTimeout(() => {
      const firstFocusable = drawerEl?.querySelector<HTMLElement>('a, button');
      firstFocusable?.focus();
    }, 50);
  }

  function closeDrawer() {
    if (!isDrawerOpen) return;
    isDrawerOpen = false;
    document.body.style.overflow = '';
    menuButtonEl?.focus();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && isDrawerOpen) {
      closeDrawer();
    }
  }

  function handleGlobalClick(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    const anchor = target?.closest('a');
    if (!anchor) return;

    if (
      anchor.target ||
      anchor.hasAttribute('download') ||
      anchor.getAttribute('rel')?.includes('external') ||
      e.ctrlKey || e.metaKey || e.shiftKey || e.altKey ||
      e.defaultPrevented ||
      e.button !== 0
    ) {
      return;
    }

    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('http:') || href.startsWith('https:') || href.startsWith('#') || href.startsWith('/api/')) {
      return;
    }

    e.preventDefault();
    closeDrawer();
    navigate(href);
  }

  onMount(() => {
    currentRoute = parseRoute(window.location.pathname);

    const onPopState = () => {
      closeDrawer();
      syncRouteWithAuth();
    };

    window.addEventListener('popstate', onPopState);
    window.addEventListener('keydown', handleKeydown);
    document.addEventListener('click', handleGlobalClick);

    void checkAuth();

    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('click', handleGlobalClick);
      document.body.style.overflow = '';
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
      <div class="loading-state">
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
          const dest = getDefaultPathForRole(user.role);
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
          href={getDefaultPathForRole(currentUser.role)}
          class="brand-title"
          onclick={() => closeDrawer()}
        >
          IT Service Desk
        </a>
      </div>

      <nav class="sidebar-nav" aria-label="Menu utama">
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
      </nav>

      <div class="sidebar-user">
        <div class="user-profile-info">
          <span class="user-display-name" title={currentUser.username}>{currentUser.username}</span>
          <span class="badge-role badge-neutral">{currentUser.role}</span>
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

          <!-- Real Navigable Breadcrumb: only on subpages -->
          {#if currentRoute.view === 'tickets-new'}
            <nav aria-label="Breadcrumb">
              <ol class="nav-breadcrumb">
                <li><a href="/tickets">Tiket Saya</a></li>
                <li aria-hidden="true">/</li>
                <li aria-current="page"><strong>Buat Tiket</strong></li>
              </ol>
            </nav>
          {:else if currentRoute.view === 'ticket-detail'}
            <nav aria-label="Breadcrumb">
              <ol class="nav-breadcrumb">
                <li><a href="/tickets">Tiket Saya</a></li>
                <li aria-hidden="true">/</li>
                <li aria-current="page"><strong class="tabular-nums">{currentRoute.ticketNumber}</strong></li>
              </ol>
            </nav>
          {/if}
        </div>

        <ThemeToggle />
      </header>

      <main id="main" tabindex="-1">
        {#if currentRoute.view === 'it-queue' && (currentUser.role === 'IT Staff' || currentUser.role === 'Super Admin')}
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
