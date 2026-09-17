<script lang="ts">
  import ThemeToggle from './ThemeToggle.svelte';
  import HealthPanel from './HealthPanel.svelte';
  import Register from './Register.svelte';

  let currentView = $state<'overview' | 'register' | 'login'>('overview');
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

      <p class="nav-label" style="margin-top: 16px;">AKUN</p>
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
    </nav>
    <div class="sidebar-note">
      <span class="version-label">MVP · DALAM PENGEMBANGAN</span>
      <p>Workspace internal untuk pelaporan dan penanganan kendala IT.</p>
    </div>
  </aside>

  <div class="workspace-body">
    <header class="topbar">
      <div class="breadcrumb">
        <span>Workspace</span>
        <span aria-hidden="true">/</span>
        <strong>{currentView === 'overview' ? 'Ringkasan' : currentView === 'register' ? 'Daftar Akun' : 'Masuk'}</strong>
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

        <aside class="development-note" aria-label="Batasan versi saat ini">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v1" />
          </svg>
          <div><strong>Registrasi sudah aktif.</strong><p>Pendaftaran akun pengguna baru kini dapat dilakukan melalui menu Daftar Akun. Fitur login, tiket, dan admin menyusul di tahap berikutnya.</p></div>
        </aside>
      {:else if currentView === 'register'}
        <Register
          onSuccess={() => console.log('Registration successful')}
          onSwitchToLogin={() => alert('Fitur Login akan hadir pada tahap berikutnya (Task #4).')}
        />
      {/if}

      <footer class="page-footer"><span>IT Service Desk</span><span>Corporate workspace · v0.1</span></footer>
    </main>
  </div>
</div>
