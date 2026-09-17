export type Theme = 'light' | 'dark';

export function resolveTheme(preference: unknown, prefersDark: boolean): Theme {
  return preference === 'light' || preference === 'dark' ? preference : prefersDark ? 'dark' : 'light';
}

export function readThemePreference(): string | null {
  try {
    return localStorage.getItem('service-desk-theme');
  } catch {
    // Browser policy may block storage; the system theme still works.
    return null;
  }
}
