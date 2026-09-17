export function generateCsrfToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function validateCsrf(request: Request, expectedToken?: string): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    return true;
  }

  // Double submit / Custom header validation
  const clientHeader = request.headers.get('X-Requested-With');
  const tokenHeader = request.headers.get('X-CSRF-Token');

  if (tokenHeader && expectedToken && tokenHeader === expectedToken) {
    return true;
  }

  if (clientHeader === 'XMLHttpRequest' || clientHeader === 'fetch') {
    return true;
  }

  const fetchSite = request.headers.get('Sec-Fetch-Site');
  if (fetchSite && ['same-origin', 'none'].includes(fetchSite)) {
    return true;
  }

  const origin = request.headers.get('Origin');
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const requestUrl = new URL(request.url);
      if (originUrl.host === requestUrl.host) {
        return true;
      }
    } catch {
      return false;
    }
  }

  // If there is no Origin, Sec-Fetch-Site, or custom header, check if it explicitly declared custom header
  return false;
}
