<script lang="ts">
  import { onMount } from 'svelte';

  let status = $state<'loading' | 'ready' | 'error'>('loading');
  let controller: AbortController | undefined;

  async function checkConnection() {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    status = 'loading';
    try {
      const response = await fetch('/api/health', {
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(5000)]),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Service unavailable');
      const body: unknown = await response.json();
      if (typeof body !== 'object' || body === null ||
          !('status' in body) || body.status !== 'ok' ||
          !('database' in body) || body.database !== 'connected') throw new Error('Invalid response');
      if (!request.signal.aborted) status = 'ready';
    } catch {
      if (!request.signal.aborted) status = 'error';
    }
  }

  onMount(() => {
    void checkConnection();
    return () => controller?.abort();
  });
</script>

<section class="panel connection-panel" aria-labelledby="connection-title">
  <div class="section-heading">
    <div>
      <p class="eyebrow">STATUS SISTEM</p>
      <h2 id="connection-title">Koneksi workspace</h2>
    </div>
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <path d="M3 12h4l3-7 4 14 3-7h4" />
    </svg>
  </div>
  <div class="connection-state" role="status" aria-live="polite">
    <span class="status-mark" class:ready={status === 'ready'} class:failed={status === 'error'} aria-hidden="true"></span>
    <div>
      <strong>{status === 'loading' ? 'Memeriksa koneksi…' : status === 'ready' ? 'Layanan terhubung' : 'Koneksi belum tersedia'}</strong>
      <p>{status === 'loading' ? 'Menghubungi API dan database.' : status === 'ready'
        ? 'API Bun berhasil terhubung ke PostgreSQL.'
        : 'API atau database belum dapat dihubungi. Silakan coba lagi.'}</p>
    </div>
  </div>
  <div class="panel-footer">
    <span>Pemeriksaan langsung, bukan data contoh.</span>
    <button type="button" onclick={checkConnection} disabled={status === 'loading'}>
      {status === 'loading' ? 'Memeriksa…' : 'Periksa ulang'}
    </button>
  </div>
</section>
