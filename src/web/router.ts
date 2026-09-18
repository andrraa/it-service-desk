export type Route =
  | { view: 'login' }
  | { view: 'register' }
  | { view: 'tickets' }
  | { view: 'tickets-new' }
  | { view: 'ticket-detail'; ticketNumber: string }
  | { view: 'it-queue' }
  | { view: 'admin-users' }
  | { view: 'password' }
  | { view: 'unknown'; path: string };

export function parseRoute(pathname: string): Route {
  // Normalize trailing slash (unless root)
  const normalized = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;

  if (normalized === '/login') return { view: 'login' };
  if (normalized === '/register') return { view: 'register' };
  if (normalized === '/tickets') return { view: 'tickets' };
  if (normalized === '/tickets/new') return { view: 'tickets-new' };
  if (normalized === '/it/queue') return { view: 'it-queue' };
  if (normalized === '/admin/users') return { view: 'admin-users' };
  if (normalized === '/password') return { view: 'password' };

  const ticketDetailMatch = normalized.match(/^\/tickets\/([^/]+)$/);
  if (ticketDetailMatch && ticketDetailMatch[1]) {
    return { view: 'ticket-detail', ticketNumber: decodeURIComponent(ticketDetailMatch[1]) };
  }

  return { view: 'unknown', path: normalized };
}

export function navigate(url: string, options: { replace?: boolean } = {}): void {
  if (typeof window === 'undefined') return;
  if (options.replace) {
    window.history.replaceState(null, '', url);
  } else {
    window.history.pushState(null, '', url);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function getDefaultPathForRole(role?: string): string {
  if (role === 'IT Staff' || role === 'Super Admin') {
    return '/it/queue';
  }
  return '/tickets';
}
