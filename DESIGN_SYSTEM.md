# Design System — IT Service Desk

**Versi:** 1.1

**Status:** Spesifikasi target UI berdasarkan audit browser; bukan laporan implementasi selesai.

**Arah:** Clean Corporate · Light & Dark · Desktop & Mobile
**Handoff:** PRD disusun menggunakan ASTRA; dokumen ini menjadi panduan implementasi untuk Gemini-3.8 sesuai konteks pengguna. Keduanya bukan fitur atau dependensi aplikasi.

## 1. Landasan dan batas perubahan

Referensi:
- [PRD](PRD.md): role, alur tiket, urgensi/FIFO, histori, keamanan, dan aksesibilitas.
- [Rencana implementasi](tasks/plan.md) dan [checklist](tasks/todo.md): stack dan tahapan pekerjaan.
- [README](README.md): fondasi runtime dan environment.
- UI existing: `src/web/App.svelte`, `app.css`, `ThemeToggle.svelte`, serta halaman login, registrasi, daftar, dashboard, detail, percakapan, dan lampiran.

README dan pembuka dokumen rencana masih menyebut fondasi, sedangkan source dan checklist sudah memuat fitur tiket. Gunakan source untuk memahami UI existing; checklist bukan pengganti verifikasi runtime. Administrasi dan pemulihan password masih ditandai belum selesai pada checklist.

**Prioritas keputusan:** permintaan terbaru pengguna mengatur visual; PRD mengatur perilaku bisnis. Rentang radius terbaru **4–12 px** menggantikan ketentuan visual lama 8–12 px untuk implementasi berikutnya. Ketentuan bisnis berlabel **Usulan** di PRD tetap usulan; dokumen desain ini tidak otomatis menyetujuinya.

Lingkup dokumen ini adalah tampilan dan interaksi. Pengurangan elemen berarti mengurangi gangguan visual, bukan menghapus histori, validasi, otorisasi, atau fungsi MVP. Audit versi 1.1 hanya memperbarui dokumen ini; source UI tidak diubah.

### 1.1 Temuan audit browser — akun User

Audit dilakukan setelah login sebagai akun User pada Light/Dark dan viewport desktop/mobile. Kondisi aktual belum mengikuti spesifikasi target:

| Temuan aktual | Dampak | Keputusan target |
|---|---|---|
| Login membuka `Ringkasan workspace` | Menambah satu langkah sebelum pekerjaan utama | User langsung ke **Tiket Saya**; IT/Admin langsung ke **Antrean IT** |
| Status koneksi API/PostgreSQL tampil pada halaman pengguna | Informasi teknis tidak membantu pengguna dan menambah kecemasan | Hapus dari UI produk; health endpoint hanya untuk monitoring operasional |
| Welcome banner, alur Open/In Progress/Closed, label tahap/rencana fitur | Mengulang informasi dan membuat halaman terasa seperti demo | Hapus seluruh halaman overview, bukan sekadar sembunyikan panel tertentu |
| Sidebar memuat Ringkasan dan Buat Tiket, sementara halaman daftar punya CTA yang sama | Navigasi ganda dan membingungkan | Sidebar hanya tujuan utama; Buat Tiket hanya CTA di Tiket Saya |
| NIK selalu terlihat di sidebar | Menambah paparan identitas tanpa fungsi kerja | Tampilkan hanya di profil/admin ketika memang dibutuhkan |
| Breadcrumb `Workspace / ...`, “INTERNAL WORKSPACE”, dan footer versi | Copy internal/development memenuhi layar | Hapus; gunakan judul halaman dan brand singkat |
| Empty state masih menampilkan search/filter dan dua CTA Buat Tiket | Kontrol tidak berguna saat belum ada data | Pada daftar kosong, tampilkan satu CTA; search/filter muncul setelah ada tiket |
| Form memakai eyebrow “FORMULIR PENGADUAN”, badge “Status awal: Open”, dan card besar | Informasi otomatis diperlakukan seperti keputusan pengguna | Hapus ketiganya; cukup judul, petunjuk singkat, field, dan aksi |
| Desktop membatasi konten terlalu sempit dan menyisakan ruang kosong besar | Antrean/tabel sulit dipindai dan layar tidak dimanfaatkan | Daftar/antrean memakai lebar tersedia hingga 1280 px; form tetap maksimal 720 px |
| Mobile menumpuk seluruh sidebar di atas konten | Aksi utama berada jauh di bawah dan halaman tampak rusak | Sidebar menjadi drawer; topbar mobile hanya menu, judul singkat, dan tema |
| Banyak panel bersarang dan border | Hierarki visual berat meski data sedikit | Gunakan spacing/separator; maksimal satu surface utama per area kerja |

Temuan ini bersifat normatif: implementasi berikutnya wajib menghapus elemen di atas, bukan mempertahankannya karena sudah ada di source.

## 2. Prinsip desain

1. **Kerja dahulu:** pengguna langsung melihat tiket atau antrean, bukan landing page promosi.
2. **Netral dan profesional:** putih, charcoal, abu-abu; warna semantik hanya untuk informasi yang perlu dibedakan.
3. **Sedikit container:** satu permukaan untuk satu kelompok kerja; jangan membungkus setiap teks dengan card.
4. **Satu aksi utama per konteks:** aksi sekunder tidak bersaing dengan tombol utama.
5. **Ringkas tanpa kehilangan informasi:** metadata tambahan boleh dilipat, tetapi urgensi, status, usia tiket, dan kegagalan harus terlihat.
6. **Setara di dua tema dan ukuran layar:** mobile bukan versi dengan fitur penting dihapus.

Hindari gradient, glassmorphism, bayangan tebal, pill, ilustrasi dekoratif, animasi looping, dan aksen warna pada setiap card.

## 3. Foundation / design tokens

Gunakan CSS custom properties dalam `src/web/app.css`. Pertahankan nama token existing bila maknanya sama; jangan menambahkan library tema atau UI kit.

### 3.1 Warna dasar

Nilai berikut adalah target baru, bukan deskripsi palet existing.

| Token | Light | Dark | Penggunaan |
|---|---|---|---|
| `--color-bg` | `#F8FAFC` | `#0F172A` | Latar aplikasi |
| `--color-surface` | `#FFFFFF` | `#1E293B` | Form, tabel, dialog |
| `--color-surface-hover` | `#F1F5F9` | `#334155` | Hover dan pilihan aktif |
| `--color-border` | `#CBD5E1` | `#475569` | Separator dekoratif |
| `--color-control-border` | `#64748B` | `#94A3B8` | Batas input/kontrol yang perlu dikenali |
| `--color-text` | `#0F172A` | `#F8FAFC` | Teks utama |
| `--color-text-muted` | `#475569` | `#CBD5E1` | Teks pendukung, bukan disabled |
| `--color-primary` | `#0F172A` | `#F8FAFC` | Tombol utama netral |
| `--color-primary-hover` | `#334155` | `#E2E8F0` | Hover tombol utama |
| `--color-primary-text` | `#FFFFFF` | `#0F172A` | Teks di atas primary |
| `--color-link` | `#1D4ED8` | `#93C5FD` | Tautan; bukan dekorasi |
| `--color-focus` | `#1D4ED8` | `#93C5FD` | Ring fokus keyboard |

Primary adalah pasangan foreground/background tombol, bukan warna teks universal. Jangan memakai `--color-primary-text` di atas surface biasa. Tautan menggunakan underline agar tidak bergantung pada warna.

### 3.2 Warna semantik

Gunakan pasangan teks/latar solid berikut, bukan warna alpha yang berubah kontras mengikuti parent.

| Semantik | Teks Light | Latar Light | Teks Dark | Latar Dark |
|---|---|---|---|---|
| Neutral | `#475569` | `#F1F5F9` | `#CBD5E1` | `#334155` |
| Info | `#1E40AF` | `#DBEAFE` | `#BFDBFE` | `#1E3A8A` |
| Warning | `#92400E` | `#FEF3C7` | `#FDE68A` | `#78350F` |
| Danger | `#991B1B` | `#FEE2E2` | `#FECACA` | `#7F1D1D` |
| Success | `#166534` | `#DCFCE7` | `#BBF7D0` | `#14532D` |

Bentuk token: `--color-info` / `--color-info-bg`, dan pola yang sama untuk neutral, warning, danger, success. Token foreground cocok untuk teks semantik pada surface; jangan menjadikannya background tombol dengan teks putih secara otomatis.

| Informasi | Semantik |
|---|---|
| Open | Neutral |
| In Progress | Info |
| Closed | Success |
| Low | Neutral |
| Medium | Info |
| High | Warning |
| Critical | Danger |

Semua badge wajib memuat label lengkap. Status dan prioritas tetap dua informasi berbeda, bukan satu badge gabungan. Jangan mewarnai seluruh baris tiket. Error form menggunakan Danger; penutupan tiket bukan aksi hapus dan tidak perlu tombol merah.

### 3.3 Tipografi

Gunakan font sistem existing; tidak perlu web font eksternal.

| Peran | Ukuran / line-height | Weight |
|---|---|---|
| Judul halaman / H1 | 24 / 32 px | 600 |
| Judul section / H2 | 18 / 28 px | 600 |
| Judul kecil / H3 | 16 / 24 px | 600 |
| Body, field input, pesan | 16 / 24 px | 400 |
| Label, tabel desktop, tombol | 14 / 20 px | 400–600 |
| Metadata, badge, waktu | 12 / 16 px | 400–600 |

- Satu H1 per halaman; jangan memulai halaman dengan H2 hanya untuk mendapatkan ukuran kecil.
- Jangan gunakan teks penting di bawah 12 px atau paragraf panjang uppercase.
- Nomor tiket memakai `font-variant-numeric: tabular-nums`; bukan font dekoratif.
- Username, judul, nama file, dan URL panjang harus wrap tanpa merusak layout.

### 3.4 Spacing dan dimensi

Skala spacing: **4, 8, 12, 16, 24, 32, 48, 64 px**.

- Padding/margin layout utama: kelipatan 8 px.
- Gap/padding internal komponen: kelipatan 4 px.
- Main padding: 32 px desktop, 24 px tablet, 16 px mobile.
- Jarak antarsection: 24–32 px; antarfield: 16 px; label ke input: 8 px.
- Sidebar desktop: 240 px; topbar: 64 px, mobile 56 px.
- App shell setelah login: tinggi `100dvh` dan `overflow: hidden`; sidebar serta topbar tidak ikut scroll.
- Hanya area konten utama di bawah topbar yang memakai `overflow-y: auto` dan `overscroll-behavior: contain`.
- Konten daftar/dashboard: maksimal 1280 px; form tiket: 720 px; autentikasi: 400 px.
- Kontrol interaktif: tinggi minimal 44 px; icon button minimal 44 × 44 px.
- Textarea deskripsi/solusi: tinggi awal 144 px, dapat diperbesar vertikal.

### 3.5 Radius, border, elevation

| Token | Nilai | Penggunaan |
|---|---|---|
| `--radius-sm` | 4 px | Badge, tombol, input, item navigasi, preview file |
| `--radius-md` | 8 px | Panel, tabel, form, pesan |
| `--radius-lg` | 12 px | Dialog saja |

Layout datar boleh radius 0. Komponen yang dibulatkan hanya memakai 4, 8, atau 12 px; tidak ada radius 3/10 px, pill, atau avatar bulat dekoratif. Lingkaran intrinsik ikon/radio native tidak termasuk radius container.

Border standar 1 px. Pakai separator antarbaris, bukan kotak pada setiap cell. Shadow hanya untuk overlay/dialog: `0 8px 24px rgb(0 0 0 / 16%)`. Transisi warna 120–160 ms; hormati `prefers-reduced-motion`.

## 4. Perilaku tema

- Tepat dua tema: **Light** dan **Dark**. Preferensi OS hanya menentukan default, bukan tema ketiga.
- Pertahankan `data-theme` pada root dan key `service-desk-theme` yang sudah digunakan.
- Baca preferensi sebelum paint pertama untuk menghindari kilatan tema yang salah.
- Pilihan manual bertahan setelah reload. Tanpa pilihan manual, ikuti perubahan preferensi OS.
- Jika storage tidak tersedia, toggle tetap bekerja untuk sesi tersebut; kegagalan menyimpan preferensi tidak boleh memblokir aplikasi.
- Sediakan satu toggle di topbar; tetap tersedia di login dan mobile. Jika memakai `aria-pressed`, label aksesibel tetap stabil, misalnya “Dark Mode”.
- Atur `color-scheme` agar kontrol native mengikuti tema.
- Modal, upload, state error, dropdown, fokus, dan pesan harus memakai token yang sama. Gambar lampiran tidak di-invert.

## 5. Struktur navigasi dan halaman

### 5.1 Halaman awal berdasarkan role

| Kondisi | Halaman awal | Navigasi |
|---|---|---|
| Belum login | Masuk | Daftar, petunjuk lupa password, toggle tema |
| User | Tiket Saya | Tiket Saya, Histori, akun |
| IT Staff | Antrean IT | Antrean IT, Tiket Saya, Histori, akun |
| Super Admin | Antrean IT | Navigasi IT + Kelola Akun ketika fiturnya tersedia |
| Wajib ganti password | Ganti Password | Hanya ganti password, tema, dan keluar |

“Buat Tiket” menjadi CTA halaman daftar, bukan menu sidebar tambahan dengan fungsi yang sama. Tetap dapat diakses semua role melalui Tiket Saya. Histori boleh menggunakan komponen daftar yang sama dengan filter Closed, tidak perlu implementasi daftar kedua.

Sidebar hanya untuk pengguna terautentikasi. Area akun menampilkan username; role sebagai teks kecil bila relevan. NIK tidak perlu ditampilkan terus-menerus di sidebar. Menyembunyikan menu berdasarkan role tidak menggantikan otorisasi backend.

### 5.2 Anatomi halaman

Struktur shell terautentikasi:

```text
App shell (100dvh, tidak scroll)
├── Sidebar (tetap)
└── Workspace
    ├── Topbar (tetap)
    └── Main content (satu-satunya area scroll)
```

1. Topbar: konteks halaman, toggle tema, akses akun.
2. Heading: judul dan maksimal satu kalimat petunjuk bila benar-benar membantu.
3. Toolbar: pencarian/filter dan satu CTA utama bila tersedia.
4. Konten utama: daftar, form, atau detail.
5. Pagination jika ada halaman lain; tidak ada footer branding berulang.

Tidak ada halaman `Ringkasan`, `Overview`, atau `Home` setelah login pada MVP. Logo mengarah ke halaman awal role, bukan ke landing page terpisah.

Breadcrumb hanya pada hierarki nyata dan clickable, misalnya `Tiket Saya / TKT-000001`. Pada halaman tingkat pertama, breadcrumb tidak ditampilkan. Jangan tampilkan `Workspace /` sebagai dekorasi.

## 6. Komponen dan aturan interaksi

### Tombol dan navigasi

- Primary: background primary, label singkat berbentuk aksi: “Buat Tiket”, “Simpan”, “Kirim”.
- Secondary: surface + control border; untuk “Batal”, “Kembali”, atau aksi alternatif.
- Tertiary: tombol teks untuk aksi ringan; tidak dipakai sebagai satu-satunya penanda aksi berbahaya.
- Destructive: token Danger dan label spesifik, misalnya “Nonaktifkan Akun”; wajib konfirmasi.
- Loading: pertahankan lebar dan ubah label, misalnya “Menyimpan…”; cegah submit ganda.
- Active navigation: latar surface-hover, teks tegas, `aria-current="page"`; bukan hanya perubahan warna.
- Gunakan link untuk navigasi URL dan button untuk tindakan. Judul tiket harus dapat dibuka lewat keyboard, bukan hanya row `onclick`.

### Form

- Label selalu terlihat; placeholder bukan pengganti label.
- Input dan select memakai kontrol native. **File upload wajib memakai tampilan custom**; elemen `<input type="file">` native tetap tersedia secara visually hidden sebagai mekanisme pemilih file, bukan ditampilkan dengan style bawaan browser. Tidak perlu custom dropdown atau rich-text editor.
- Error tampil di dekat field dengan `aria-invalid` dan `aria-describedby`; fokus ke field gagal pertama setelah submit.
- Draft, pilihan file yang masih tersedia, dan isi field dipertahankan saat request gagal. Jika file perlu dipilih ulang, jelaskan secara eksplisit.
- Tampilkan ketentuan password dan lampiran sesuai validasi backend. Batas PRD yang masih usulan tidak boleh dianggap konfigurasi final tanpa sinkronisasi.
- Password mendukung paste, password manager, dan autocomplete yang sesuai.
- Jangan menambahkan field email, departemen, kategori, atau aset tanpa kebutuhan yang disetujui. NIK existing tetap string, diberi label **Nomor Induk Karyawan**.

### Daftar dan tabel

- Header jelas, tinggi baris minimal 56 px, pemisah horizontal, tanpa zebra warna kuat.
- Gabungkan nomor dan judul dalam satu cell untuk mengurangi kolom.
- Tiket Saya: nomor/judul, prioritas, status, penanggung jawab, waktu dibuat.
- Antrean IT: nomor/judul, pelapor, prioritas, status, waktu dibuat **dan usia**, penanggung jawab, aksi ambil bila berhak.
- Default antrean tetap Critical → High → Medium → Low, lalu FIFO di dalam prioritas, lalu ID. Jangan mengganti dengan “terakhir diperbarui”.
- Koreksi prioritas dapat dipindahkan dari setiap row ke detail tiket; alasan tetap wajib dicatat.
- Pagination sederhana Sebelumnya/Berikutnya dan informasi halaman; tidak perlu infinite scroll.
- Jangan menampilkan angka nol seolah data berhasil dimuat ketika request ringkasan gagal.

### Badge dan ikon

- Badge ringkas, radius 4 px, padding 4 × 8 px, label 12 px; tidak clickable kecuali memang kontrol.
- Gunakan SVG existing dengan `currentColor`, ukuran 16–20 px; tidak perlu library ikon baru.
- Ikon dekoratif `aria-hidden`; tombol ikon memiliki accessible name. Tooltip bukan satu-satunya label.
- Tidak perlu avatar/inisial besar jika username dan role sudah cukup mengenali pengirim.

### Dialog

- Gunakan `<dialog>` native jika sesuai, dengan judul jelas dan lebar maksimal 480 px.
- Fokus masuk ke dialog, tidak keluar selama modal aktif, Escape membatalkan saat aman, fokus kembali ke pemicu.
- Pada mobile: lebar viewport dikurangi margin 16 px per sisi, tinggi maksimal mengikuti `dvh`, konten dapat discroll.
- Penutupan tiket: satu dialog berisi solusi wajib dan tombol “Simpan Solusi & Tutup”; tidak perlu konfirmasi kedua yang identik.
- Reset password dan penonaktifan akun: tampilkan akun sasaran, dampak pencabutan sesi, dan konfirmasi eksplisit.
- Password sementara hanya tampil sekali sesuai kebijakan produk; jangan simpan di localStorage, toast, atau log.

### File upload

- Jangan menampilkan UI bawaan browser seperti “Choose Files” atau “No file chosen”.
- Gunakan `<label>` atau `<button>` custom berlabel **“Pilih Berkas”** yang mengaktifkan `<input type="file">` visually hidden.
- Area upload memuat ikon sederhana, label aksi, dan helper text: format, batas ukuran per file, serta jumlah maksimum.
- Drag-and-drop boleh tersedia pada desktop sebagai jalur tambahan, bukan satu-satunya cara. Seluruh area dropzone dapat diklik dan dioperasikan dengan keyboard.
- State drag aktif memakai perubahan border/background ringan; jangan memakai animasi dekoratif.
- Setelah dipilih, tampilkan daftar file di luar input: nama lengkap yang dapat wrap, ukuran, status upload, error per file, dan tombol **Hapus** berlabel aksesibel.
- Gambar boleh memiliki thumbnail kecil; PDF cukup ikon dokumen. Jangan membuat preview besar sebelum pengguna memintanya.
- File invalid ditolak dengan alasan spesifik tanpa menghapus file valid lainnya.
- Saat upload gagal, pertahankan daftar file dan sediakan **Coba Lagi**. Saat upload berlangsung, cegah submit ganda tetapi jangan menyembunyikan nama file.
- Pada mobile, dropzone selebar container, target sentuh minimal 44 px, daftar file satu kolom, dan tombol hapus tidak bergantung pada hover.
- Fokus keyboard pada kontrol custom harus terlihat. Input visually hidden tidak boleh memakai `display: none` jika itu menghilangkan akses keyboard/assistive technology; gunakan pola `.sr-only`.

### Percakapan dan lampiran

- Utamakan daftar pesan kronologis dengan pemisah ringan, bukan bubble warna-warni.
- Setiap pesan memuat pengirim, role, waktu, isi, dan lampiran bila ada.
- Composer: textarea, lampirkan, kirim. Tidak ada emoji picker, typing indicator, read receipt, atau toolbar format pada MVP.
- Jangan menandai terkirim sebelum server mengonfirmasi. Gagal kirim menampilkan pesan dan opsi coba lagi tanpa menghapus draft.
- Pesan baru tidak memaksa scroll jika pengguna sedang membaca pesan lama.
- Lampiran: nama, tipe/ukuran bila tersedia, preview gambar atau tautan unduh PDF; nama panjang wrap.
- Tampilkan error per file yang gagal; jangan menyembunyikan kegagalan di toast singkat.
- Closed: hilangkan composer dan aksi mutasi; tampilkan “Tiket ditutup. Percakapan hanya dapat dibaca.” beserta solusi.

## 7. Spesifikasi per halaman

| Halaman | Wajib ditampilkan | Tidak perlu |
|---|---|---|
| Masuk / Daftar | Brand sederhana, form, error, tautan pindah form, tema; petunjuk lupa password ketika tersedia | Sidebar, hero ilustrasi, status database, statistik |
| Tiket Saya | Jika ada data: pencarian, filter status/prioritas, daftar, CTA Buat Tiket, pagination. Jika kosong: judul, empty state singkat, satu CTA | Welcome banner, filter kosong, dua CTA identik, ringkasan angka pribadi yang menduplikasi daftar |
| Buat Tiket | H1 “Buat Tiket”, satu kalimat petunjuk, judul, deskripsi, prioritas dengan panduan, custom file upload, kirim/batal | File input bawaan browser, eyebrow “Formulir Pengaduan”, badge status awal, card pembungkus besar, nomor/status editable, wizard multi-step |
| Antrean IT | Empat ringkasan PRD, pencarian nomor/judul, filter status/prioritas/penanggung jawab, belum diambil/ditangani sendiri, antrean | Grafik tren, leaderboard, SLA countdown, aktivitas palsu |
| Detail Tiket | Nomor/judul, prioritas/status, deskripsi, pelapor, waktu/usia, penanggung jawab, lampiran, percakapan, aksi berizin | Pengulangan judul di banyak panel, seluruh metadata dalam card masing-masing |
| Detail Closed | Solusi, penutup dan waktu penutupan, laporan awal, percakapan/lampiran read-only | Composer disabled besar, tombol reopen/hapus |
| Histori | Pencarian dan daftar Closed, akses solusi/detail | Dashboard kedua atau statistik duplikat |
| Kelola Akun | Pencarian akun, username/NIK/role/status, aksi sesuai role, aktivitas administratif | Data pribadi yang tidak diperlukan, ekspor/bulk action tanpa kebutuhan |
| Password | Field sesuai alur biasa/wajib, ketentuan, error, simpan/keluar | Navigasi fitur lain pada alur wajib ganti password |

Empat ringkasan Antrean IT tetap dipertahankan: **Open, In Progress, aktif Critical, Closed hari ini**. Gunakan satu strip ringkasan dengan empat bagian, bukan empat card besar berwarna. Definisi timezone “hari ini” mengikuti keputusan backend/produk, bukan tebakan UI.

### 7.1 Layout halaman Detail Tiket

#### Desktop (`≥ 1024 px`)

Gunakan dua kolom yang terlihat bersamaan:

```text
┌────────────────────────────┬──────────────────────────────────────┐
│ Informasi tiket            │ Ruang chat                           │
│                            │                                      │
│ Nomor, judul               │ Daftar pesan                         │
│ Status, prioritas          │ Lampiran pesan                       │
│ Pelapor, waktu, usia       │                                      │
│ Penanggung jawab           │                                      │
│ Deskripsi dan lampiran     │                                      │
│ Solusi jika Closed         │ Composer / notice read-only          │
│ Aktivitas penanganan       │                                      │
└────────────────────────────┴──────────────────────────────────────┘
```

- Kolom kiri **Informasi Tiket** memakai sekitar 38–42% lebar; kolom kanan **Ruang Chat** memakai sisa lebar dengan minimum nyaman 480 px.
- Informasi tiket berada di kiri, ruang chat selalu di kanan. Jangan menaruh chat di bawah informasi pada desktop jika viewport masih memenuhi breakpoint.
- Header halaman di atas kedua kolom memuat tombol kembali, nomor tiket, judul singkat, serta aksi berizin seperti Tutup Tiket.
- Kolom kiri menggunakan section dan separator, bukan card terpisah untuk setiap metadata.
- Kolom kanan memiliki heading “Ruang Chat”, daftar pesan, lalu composer di bagian bawah. Tiket Closed mengganti composer dengan notice read-only.
- Kedua kolom mengikuti satu scroll container milik main content. Jangan membuat scrollbar vertikal terpisah pada informasi dan chat; composer boleh `position: sticky` di bagian bawah area main selama tidak menutupi pesan.
- Deskripsi panjang, nama file, dan pesan harus wrap. Lebar chat tidak boleh terdesak oleh label metadata yang panjang.

#### Tablet dan mobile (`< 1024 px`)

Ubah menjadi satu kolom dengan urutan:

1. Header: kembali, nomor tiket, status/prioritas, dan aksi berizin.
2. Ringkasan informasi penting: judul, pelapor, waktu/usia, penanggung jawab.
3. Deskripsi dan lampiran laporan awal.
4. Solusi jika Closed.
5. Ruang chat.
6. Aktivitas penanganan dalam `<details>` tertutup secara default.

- Jangan membuat tab “Info” dan “Chat” pada MVP; satu alur vertikal lebih sederhana dan tidak menyembunyikan konteks.
- Pada mobile, ruang chat memakai lebar penuh. Composer mengikuti bawah konten dan tidak boleh menutupi pesan atau tertutup keyboard virtual.
- Informasi utama tetap tampil sebelum chat, tetapi hindari metadata berulang agar pengguna tidak perlu scroll terlalu jauh untuk mencapai percakapan.
- Lampiran dan aksi disusun satu kolom; target sentuh minimal 44 px.
- Hanya main content yang scroll; topbar tetap diam dan sidebar tetap berupa drawer.

## 8. Responsivitas

Breakpoint mengikuti lebar viewport, bukan deteksi perangkat.

| Viewport | Layout |
|---|---|
| `< 768 px` | Satu kolom, padding 16 px, navigasi drawer, daftar tiket berupa list/card ringkas |
| `768–1023 px` | Padding 24 px, drawer tetap dipakai, form satu kolom, tabel hanya jika muat |
| `≥ 1024 px` | Sidebar 240 px, padding 32 px, tabel antrean, detail dua kolom |

- Drawer memiliki tombol buka/tutup berlabel, focus management, Escape, backdrop, scroll lock, dan mengembalikan fokus ke pemicu; gunakan pola dialog yang sama.
- Sidebar desktop dan topbar tetap diam saat konten panjang di-scroll; jangan mengandalkan seluruh `body` sebagai scroll container.
- Mobile header tetap di atas viewport. Saat drawer tertutup, hanya main content yang scroll; saat drawer terbuka, main content dikunci.
- Mobile header cukup menu, judul singkat, dan tema. Sidebar **tidak boleh mengambil ruang layout saat tertutup** dan tidak boleh ditumpuk di atas konten seperti implementasi aktual.
- Pada 320–390 px, konten utama harus terlihat pada viewport pertama tanpa harus melewati brand, seluruh menu, profil, dan tombol keluar.
- Ringkasan dashboard: 4 kolom desktop, 2 × 2 mobile.
- Pencarian tetap terlihat; filter tambahan dapat dibuka lewat “Filter (n)”. Filter aktif dan reset tetap jelas.
- Item mobile: nomor/judul → prioritas/status → pelapor untuk IT, penanggung jawab, waktu/usia → aksi. Jangan menghilangkan usia antrean atau status.
- Data dan callback desktop/mobile harus sama; hanya presentasinya berubah. Jangan membuat fetch dan state bisnis kedua.
- Di tablet, gunakan list bila tabel tidak muat. Hindari scroll horizontal seluruh halaman; bukan menyembunyikan kolom penting untuk memaksakan tabel.
- Form dan tombol dapat wrap. Keyboard virtual tidak boleh menutupi composer atau tombol submit.
- Jangan membuat scrollbar kedua pada panel/tabel biasa. Scroll internal tambahan hanya dibolehkan untuk dialog, dropdown, atau area data yang memang dibatasi tinggi.
- `body`, sidebar, topbar, dan main tidak boleh sama-sama menjadi scroll container; indikator scroll vertikal utama hanya berada pada main content.
- Jangan membuat bottom navigation tambahan jika drawer sudah memenuhi kebutuhan.

## 9. State, copy, dan aksesibilitas

| State | Perilaku |
|---|---|
| Loading pertama | Placeholder sederhana atau teks “Memuat tiket…”; tidak memalsukan data |
| Refresh | Pertahankan data lama, tandai sedang diperbarui; jangan blank seluruh halaman |
| Kosong | “Belum ada tiket.” + Buat Tiket bila berhak |
| Hasil pencarian kosong | “Tidak ada tiket sesuai pencarian.” + Reset Filter; bukan ajakan membuat tiket duplikat |
| Gagal | Pesan dekat area terdampak, coba lagi, input tetap tersedia |
| Berhasil | Perbarui data aktual; inline status singkat bila perlu, tanpa modal sukses |
| Konflik pengambilan | “Tiket sudah diambil oleh petugas lain.” lalu muat ulang pemilik/status |
| Sesi berakhir | Jelaskan dan arahkan login; jangan mengklaim kiriman terakhir tersimpan |
| Tidak berhak | Pesan generik tanpa membocorkan isi tiket atau data pengguna lain |

Gunakan Bahasa Indonesia yang langsung dan konsisten. Nilai status/prioritas tetap mengikuti PRD: Open, In Progress, Closed; Low, Medium, High, Critical. Tanggal lengkap dapat dibaca tanpa hover, misalnya `17 Sep 2026, 14.30`; usia relatif melengkapi, bukan menggantikan waktu asli.

Persyaratan aksesibilitas:
- WCAG AA: teks normal minimal 4.5:1; teks besar dan batas kontrol/fokus bermakna minimal 3:1 terhadap warna bersebelahan.
- Audit pasangan warna final termasuk hover, badge, error, placeholder, dan overlay; separator dekoratif tidak dipakai untuk mengidentifikasi kontrol.
- Fokus 2 px solid `--color-focus`, offset 2 px; jangan menghapus outline tanpa pengganti.
- Target sentuh minimal 44 × 44 px; semua aksi tersedia via keyboard.
- Skip link, landmark, label form, heading berurutan, dan header tabel semantik tetap ada.
- Error penting diumumkan dengan `role="alert"`; feedback biasa `role="status"`. Polling tidak boleh membacakan ulang seluruh percakapan.
- Mendukung zoom 200%, reflow 320 CSS px, dan reduced motion.

## 10. Elemen existing yang harus dibuang atau disederhanakan

Daftar berikut adalah hasil audit browser dan instruksi wajib perubahan UI berikutnya, **bukan klaim sudah dihapus dari source**.

| Lokasi existing | Keputusan target | Alasan / pengganti |
|---|---|---|
| `App.svelte`: halaman `overview` / Ringkasan workspace | Hapus dari navigasi produk | Masuk langsung ke Tiket Saya atau Antrean IT sesuai role |
| `HealthPanel.svelte` di halaman utama | Lepas dari UI pengguna | Diagnostik untuk operasional; endpoint `/api/health` tetap ada |
| Label “Tahap fondasi”, “Rencana fitur”, “MVP · DALAM PENGEMBANGAN” | Hapus | Status development bukan informasi kerja pengguna |
| Section “ALUR LAYANAN” dengan tiga langkah | Hapus dari beranda | Status dijelaskan kontekstual, bukan tutorial permanen |
| Welcome banner dan CTA pembuka dashboard | Hapus | Pengguna sudah berada di halaman kerja yang benar |
| “INTERNAL WORKSPACE”, grup nav berlebih, brand-dot kuning | Sederhanakan | Cukup satu brand IT Service Desk dan menu yang relevan |
| Footer “Corporate workspace · v0.1” | Hapus | Mengulang brand tanpa membantu pekerjaan |
| NIK di sidebar | Pindahkan ke konteks akun/admin bila diperlukan | Kurangi paparan identitas dan kepadatan navigasi |
| Menu Buat Tiket + CTA Buat Tiket | Pertahankan CTA pada daftar saja | Hindari dua jalur identik yang bersaing |
| Tombol Detail pada setiap row | Ganti judul tiket menjadi link/aksi berlabel | Hilangkan kolom aksi yang hanya mengulang navigasi |
| Koreksi prioritas pada setiap row | Pindahkan ke detail atau aksi sekunder kontekstual | Antrean fokus pada triase; fungsi dan alasan audit tetap ada |
| Hard-coded badge colors di daftar/dashboard/detail | Ganti token semantik bersama | Kontras konsisten Light dan Dark |
| Radius 3 px / elemen bulat dekoratif percakapan | Normalisasi 4 px atau hapus dekorasi | Sesuai bahasa visual terbaru |
| Panel di dalam panel dan border setiap metadata | Ganti spacing, heading, separator | Hierarki tanpa terlalu banyak kotak |
| Search/filter saat daftar benar-benar kosong | Sembunyikan sampai data tersedia | Kontrol tanpa data tidak memiliki hasil untuk dipersempit |
| Dua CTA pada empty state dan page header | Pertahankan satu CTA di empty state | Satu aksi utama per konteks |
| Eyebrow “FORMULIR PENGADUAN” dan badge “Status awal: Open” | Hapus | Judul sudah menjelaskan konteks; status adalah hasil sistem |
| Card besar pembungkus seluruh form | Gunakan area form datar maksimal 720 px | Form tidak membutuhkan panel di dalam main surface |
| File input bawaan browser | Ganti visual dengan kontrol “Pilih Berkas” custom + daftar file | Konsisten lintas browser dan lebih mudah memahami state upload |

**Jangan dibuang:** empat ringkasan wajib IT, panduan prioritas, usia tiket, solusi, histori, identitas pengirim, error, konfirmasi penting, toggle tema, skip link, dan informasi aksesibilitas. Jangan tampilkan menu fitur yang belum diimplementasikan sebagai tombol kosong atau “coming soon”.

## 11. Handoff implementasi untuk Gemini-3.8

Urutan kerja:
1. Baca PRD, dokumen ini, dan source aktual; jangan menganggap screenshot atau checklist membuktikan alur bekerja.
2. Ubah token global dan normalisasi typography/spacing/radius. Pertahankan Svelte + TypeScript, CSS variables, Bun, dan PostgreSQL.
3. Rapikan shell `App.svelte`: hapus overview/dekorasi, halaman awal sesuai role, autentikasi tanpa sidebar, navigasi mobile.
4. Terapkan komponen visual konsisten pada file existing: `Login`, `Register`, `TicketList`, `CreateTicket`, `Dashboard`, `TicketDetail`, `Conversation`, `Attachments`, `ThemeToggle`.
5. Reuse class CSS untuk button, badge, field, panel, state; ekstrak komponen Svelte hanya bila ada perilaku berulang yang memang perlu dibagi. Jangan membuat framework design system baru.
6. Jangan mengubah kontrak API, aturan antrean, upload privat, draft recovery, atau hak akses demi menyederhanakan tampilan.
7. Perlakukan admin/password sebagai spesifikasi fitur mendatang sampai backend dan alurnya tersedia; jangan membuat tampilan seolah sudah berfungsi.
8. Hapus CSS/import yang benar-benar tidak terpakai setelah pengurangan elemen; jangan hapus health endpoint atau data histori.
9. Sinkronkan referensi radius lama pada PRD/rencana/checklist ketika implementasi visual dilakukan. Jangan menandai fitur bisnis selesai hanya karena styling selesai.

### Acceptance checklist

- [ ] Login langsung terlihat bagi pengunjung; setelah login/reload, halaman awal mengikuti role tanpa kilatan overview.
- [ ] Tidak ada route/menu `Ringkasan`; status API/database tidak dirender dalam UI pengguna pada state sukses maupun gagal.
- [ ] Elemen pada tabel pengurangan UI telah dibuang/disederhanakan tanpa menghilangkan fungsi wajib.
- [ ] Daftar kosong tidak menampilkan search/filter dan hanya memiliki satu CTA Buat Tiket.
- [ ] Form Buat Tiket tidak memiliki eyebrow, badge status awal, atau card pembungkus besar.
- [ ] UI bawaan `<input type="file">` tidak terlihat; kontrol custom dapat dipakai dengan mouse, sentuhan, dan keyboard.
- [ ] Custom upload menampilkan format/batas, daftar file, ukuran, hapus, progress/error, serta retry tanpa kehilangan pilihan valid.
- [ ] Light/Dark konsisten, tanpa flash tema salah, preferensi bertahan setelah reload, storage gagal tidak memblokir toggle.
- [ ] Radius komponen hanya 0/4/8/12 px sesuai fungsi; tidak ada pill/dekorasi berlebihan.
- [ ] Tampilan diuji pada lebar 360, 390, 768, 1024, dan 1440 px serta reflow 320 CSS px; tidak ada horizontal overflow halaman.
- [ ] Pada mobile, konten halaman terlihat pada viewport pertama; sidebar hanya muncul setelah tombol menu diaktifkan.
- [ ] Saat main content di-scroll pada desktop dan mobile, sidebar serta topbar tetap pada posisi semula.
- [ ] Hanya main content memiliki scrollbar vertikal utama; tidak ada double scrollbar pada body/sidebar/panel.
- [ ] Daftar mobile tetap menampilkan status, prioritas, penanggung jawab, serta pelapor/waktu/usia untuk antrean IT.
- [ ] Detail tiket desktop menampilkan Informasi Tiket di kiri dan Ruang Chat di kanan pada viewport ≥1024 px.
- [ ] Detail tiket tablet/mobile berubah menjadi satu kolom: informasi utama → deskripsi/lampiran → solusi → chat → aktivitas.
- [ ] Semua role hanya melihat navigasi dan aksi yang berhak diakses; backend tetap menolak akses ilegal.
- [ ] Loading, kosong, filter kosong, error, sukses, konflik claim, upload gagal, dan pesan gagal diuji.
- [ ] Tiket Closed read-only dan solusi terbaca; aksi penutupan tetap mensyaratkan solusi serta konfirmasi.
- [ ] Keyboard, drawer/dialog focus, zoom, target sentuh, dan kontras kedua tema diperiksa di browser nyata.
- [ ] `bun run check`, `bun test`, dan `bun run build` lulus setelah perubahan source; catat hasil aktual, bukan asumsi.

**Batas akhir:** implementasikan antarmuka layanan tiket yang tenang dan jelas. Jangan menambahkan grafik, AI assistant, SLA, notifikasi, analytics, atau dependensi desain baru untuk membuat halaman terlihat lebih ramai.
