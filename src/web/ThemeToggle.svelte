<script lang="ts">
  import { onMount } from 'svelte';
  import { readThemePreference, resolveTheme, type Theme } from './theme';

  let theme = $state<Theme>(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  let storageWarning = $state('');
  let manuallySelected = false;

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    manuallySelected = true;
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('service-desk-theme', theme);
      storageWarning = '';
    } catch {
      storageWarning = 'Tema berubah, tetapi browser tidak mengizinkan penyimpanan preferensi.';
    }
  }

  onMount(() => {
    const system = matchMedia('(prefers-color-scheme: dark)');
    function followSystem() {
      if (manuallySelected) return;
      theme = resolveTheme(readThemePreference(), system.matches);
      document.documentElement.dataset.theme = theme;
    }
    system.addEventListener('change', followSystem);
    return () => system.removeEventListener('change', followSystem);
  });
</script>

<div class="theme-control">
  <button type="button" class="theme-toggle" aria-label={theme === 'dark' ? 'Aktifkan Light Mode' : 'Aktifkan Dark Mode'} aria-pressed={theme === 'dark'}
    title={theme === 'dark' ? 'Aktifkan Light Mode' : 'Aktifkan Dark Mode'} onclick={toggleTheme}>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      {#if theme === 'dark'}
        <path d="M20 15.4A8.5 8.5 0 0 1 8.6 4 8.5 8.5 0 1 0 20 15.4Z" />
      {:else}
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
      {/if}
    </svg>
    <span>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
  </button>
  <span class="sr-only" role="status">{storageWarning}</span>
</div>
