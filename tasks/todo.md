# Checklist Development — IT Service Desk

Status: fondasi API Bun dan koneksi database selesai; fitur bisnis belum diimplementasikan. Referensi: `plan.md` dan `../PRD.md`.
Setiap task lulus check/test/build yang relevan sebelum dicentang. Lokasi file adalah perkiraan, bukan scaffolding wajib.

## 1. Toolchain dan database lokal
- [x] Install Bun global pada host (1.4.2); verifikasi PostgreSQL existing menerima koneksi.
- [x] Buat database/role khusus `it_service_desk`, simpan secret lokal privat, dan verifikasi koneksi nyata dari Bun.
- [x] Siapkan package scripts, TypeScript strict, dan API health.
- Bukti: lima unit test lulus; check/build/audit lulus; hasil build diuji HTTP 200 dengan PostgreSQL nyata dan 503 untuk database tidak tersedia, graceful shutdown berhasil.
- Acceptance: API health memeriksa DB; konfigurasi env tervalidasi; credentials tidak ditanam di kode.
- Verifikasi: koneksi DB nyata, health sukses/gagal, `bun run check`.
- Dependensi: instalasi Bun dan database/role khusus proyek sudah selesai serta terverifikasi.
- File: `package.json`, `tsconfig.json`, `.env.example`, `src/server/index.ts` (lockfile dihasilkan tooling).

## 2. Shell Svelte dan tema
- [x] Siapkan frontend responsive dengan toggle Light/Dark Mode.
- Acceptance: toggle bekerja di seluruh shell; preferensi bertahan setelah reload; radius 8–12 px dan focus keyboard terlihat.
- Verifikasi: `bun run check`, `bun run build`, browser nyata desktop/mobile dan kedua tema.
- Dependensi: 1.
- File: `vite.config.ts`, `index.html`, `src/web/main.ts`, `src/web/App.svelte`, `src/web/app.css`.

### Checkpoint fondasi
- [x] Toolchain, PostgreSQL, frontend, dan tema terverifikasi; review hasil sebelum autentikasi.

## 3. Registrasi dengan NIK
- [x] Buat akun aktif role User tanpa email.
- Acceptance: NIK string mempertahankan leading zero; username case-insensitive unik; request tidak boleh menentukan role; password hash tidak pernah dikembalikan.
- Verifikasi: test input invalid, duplikat dan concurrent registration, NIK leading zero, form browser.
- Dependensi: 1–2; persetujuan aturan wajib/unik NIK.
- File: `migrations/001_users.sql`, `src/server/auth.ts`, `src/web/Register.svelte`, `tests/auth.integration.ts`, `PRD.md`.

## 4. Login dan sesi
- [x] Implementasikan login/logout, session cookie, rate limit, perlindungan CSRF, dan guard role.
- Acceptance: sesi tersimpan aman dan memiliki expiry; nonaktif/expired ditolak; protected API tidak bergantung guard UI.
- Verifikasi: login benar/salah, cookie flags, CSRF, logout, session expiry, rate limit, akses lintas role.
- Dependensi: 3.
- File: `migrations/002_sessions.sql`, `src/server/auth.ts`, `src/web/Login.svelte`, `src/web/App.svelte`, `tests/auth.integration.ts`.

## 5. Bootstrap Super Admin
- [x] Buat jalur setup admin tanpa password default publik.
- Acceptance: bootstrap eksplisit, tidak mencetak secret ke log, tidak menimpa akun existing; dokumentasikan env dan startup.
- Verifikasi: bootstrap fresh DB, pengulangan aman, login admin.
- Dependensi: 4.
- File: `scripts/bootstrap-admin.ts`, `scripts/migrate.ts`, `README.md`, `.gitignore`, `tests/bootstrap.integration.ts`.

### Checkpoint akun
- [x] Registrasi → login → logout dan kontrol akses terbukti pada API dan browser; review sebelum tiket.

## 6. Tiket milik pengguna
- [x] Buat tiket, detail, daftar paginated, dan pencarian milik sendiri.
- Acceptance: nomor unik otomatis dan status Open; data validasi backend; User tidak melihat tiket pihak lain.
- Verifikasi: test creation bersamaan, validasi, search/pagination, akses silang; browser create/list/detail.
- Dependensi: 4–5.
- File: `migrations/003_tickets.sql`, `src/server/tickets.ts`, `src/web/Tickets.svelte`, `src/web/TicketDetail.svelte`, `tests/tickets.integration.ts`.

## 7. Dashboard dan pengambilan tiket
- [x] Tampilkan ringkasan, filter, prioritas/FIFO, serta aksi ambil tiket dan koreksi prioritas beralasan.
- Acceptance: urgensi dahulu/FIFO stabil; tepat satu pengambil berhasil; perubahan prioritas dan penanggung jawab diaudit.
- Verifikasi: urutan tie-breaker, race claim, role invalid, filter dan counts.
- Dependensi: 6.
- File: `migrations/004_audit.sql`, `src/server/tickets.ts`, `src/web/Dashboard.svelte`, `src/web/TicketDetail.svelte`, `tests/tickets.integration.ts`.

### Checkpoint tiket
- [x] Pelaporan dan penanganan nyata berjalan; nomor unik, ownership, dan race condition lulus pengujian.

## 8. Percakapan
- [ ] Tambah pesan dan polling pada tiket aktif.
- Acceptance: pesan chronological/paginated; empty ditolak; error mempertahankan draft dan tidak mengklaim sukses; tiket Closed menolak pesan di backend.
- Verifikasi: test akses silang, pagination, pesan kosong, kegagalan jaringan, polling di browser.
- Dependensi: 6–7.
- File: `migrations/005_messages.sql`, `src/server/messages.ts`, `src/web/Conversation.svelte`, `src/web/TicketDetail.svelte`, `tests/messages.integration.ts`.

## 9a. Penyimpanan lampiran privat
- [ ] Implementasikan validasi dan penyimpanan file privat serta endpoint download terotorisasi.
- Acceptance: ekstensi/MIME/signature dan ukuran/jumlah diperiksa; nama acak; tidak ada public serving; kegagalan membersihkan file staging.
- Verifikasi: file valid/invalid/oversize, spoofed MIME, path traversal, download lintas user, error persistence.
- Dependensi: 8.
- File: `migrations/006_attachments.sql`, `src/server/attachments.ts`, `tests/attachments.integration.ts`.

## 9b. Lampiran tiket dan percakapan
- [ ] Hubungkan upload ke form tiket/pesan, preview dan download.
- Acceptance: pesan lampiran saja valid; maksimal lima file 10 MB sesuai PRD; kegagalan terlihat, tidak ada lampiran hilang diam-diam.
- Verifikasi: browser create ticket/upload/chat attachment, invalid upload, akses Closed, failure recovery.
- Dependensi: 9a.
- File: `src/server/tickets.ts`, `src/server/messages.ts`, `src/web/Attachments.svelte`, `src/web/Tickets.svelte`, `src/web/Conversation.svelte`.

## 10. Solusi dan histori
- [ ] Tutup tiket dengan solusi wajib dan tampilkan histori read-only.
- Acceptance: hanya pemilik penanganan/admin dapat menutup; solusi/status atomik; seluruh mutasi tiket Closed ditolak termasuk race dengan pesan/upload.
- Verifikasi: solusi kosong, close tanpa hak, transaksi gagal, close bersamaan dengan kiriman, browser histori.
- Dependensi: 9b.
- File: `migrations/007_resolution.sql`, `src/server/tickets.ts`, `src/web/TicketDetail.svelte`, `src/web/Tickets.svelte`, `tests/tickets.integration.ts`.

### Checkpoint workflow
- [ ] User melapor → IT mengambil → berdiskusi/lampiran → solusi → Closed → histori, terbukti lintas role.

## 11. Administrasi IT
- [ ] Buat/update/aktifkan/nonaktifkan IT; pindahkan assignment; tampilkan aktivitas admin.
- Acceptance: admin-only; akun baru wajib ganti password; nonaktif mencabut sesi dan menolak tiket aktif; last active admin terlindungi.
- Verifikasi: permintaan role ilegal, disable/reassign races, sesi dicabut, histori tetap ada, last-admin guard.
- Dependensi: 10; dukungan password sementara di 12a dapat dikerjakan dahulu bila diperlukan.
- File: `src/server/admin.ts`, `src/web/Admin.svelte`, `src/server/auth.ts`, `src/server/tickets.ts`, `tests/admin.integration.ts`.

## 12a. Reset dan ganti password API
- [ ] Implementasikan password sementara sekali tampil, expiry 24 jam, revoke sessions dan guard wajib ganti password.
- Acceptance: hanya admin reset; hash-only storage; expired ditolak; restricted session tidak dapat memanggil fitur selain ganti password/logout.
- Verifikasi: expiry, reset ulang, sesi lama, direct API bypass, concurrent resets dan password change.
- Dependensi: 5 dan audit dari 7.
- File: `migrations/008_password_reset.sql`, `src/server/auth.ts`, `src/server/admin.ts`, `tests/password.integration.ts`.

## 12b. UI pemulihan akses
- [ ] Tambah petunjuk lupa password, aksi reset admin, ganti password biasa/wajib.
- Acceptance: password sementara tidak masuk penyimpanan browser/log; aksi reset dikonfirmasi; navigasi wajib ganti konsisten dengan backend.
- Verifikasi: flow reset → login sementara → ganti → login normal; expired dan gagal validasi; keyboard dan kedua tema.
- Dependensi: 11 dan 12a.
- File: `src/web/Login.svelte`, `src/web/Password.svelte`, `src/web/Admin.svelte`, `src/web/App.svelte`, `tests/password.integration.ts`.

## 13a. Hardening dan regression
- [ ] Audit seluruh acceptance criteria PRD dan tutup celah keamanan/UX.
- Acceptance: tidak ada role/ownership bypass; DB test terpisah; responsive/keyboard/dua tema dan error states konsisten.
- Verifikasi: `bun run check`, `bun test`, `bun run test:integration`, `bun run build`, browser end-to-end; catat hasil aktual.
- Dependensi: 1–12.
- File: `tests/e2e.md`, `tests/security.integration.ts`, perbaikan difokuskan maksimal lima file per iterasi.

## 13b. Kesiapan operasional
- [ ] Dokumentasikan deployment, backup/restore DB+file, logging aman, dan recovery admin.
- Acceptance: restore diuji di lingkungan terpisah; HTTPS/session flags production benar; target beban dan timezone dashboard disepakati sebelum benchmark.
- Verifikasi: drill backup/restore, pemeriksaan secret/log, smoke test production build, ukur performa pada dataset yang disepakati.
- Dependensi: 13a.
- File: `README.md`, `docs/operations.md`, `.env.example`, `tests/release-checklist.md`.

### Checkpoint akhir
- [ ] Seluruh acceptance criteria PRD memiliki bukti verifikasi.
- [ ] Keputusan scope dan batas deployment disetujui.
- [ ] Tidak ada blocker tersisa; baru kemudian nyatakan MVP siap diterima.
