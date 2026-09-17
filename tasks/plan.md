# Rencana Implementasi — IT Service Desk

Status: implementasi bertahap dimulai sesuai instruksi pengguna; checkpoint fondasi sedang dikerjakan.
Landasan: `../PRD.md`, termasuk NIK karyawan serta Light Mode dan Dark Mode.

## Kondisi awal

- Git memiliki baseline PRD, setup, dan database. API Bun dengan health check PostgreSQL kini diimplementasikan; fitur bisnis menyusul.
- Bun 1.4.2 telah diinstal global pada host melalui `npm install --global bun`; revision `1.4.2+744846f84` terverifikasi.
- Docker CLI dan daemon tersedia (server 29.8.0). PostgreSQL 16 sudah berjalan di container `postgres`, host port 5432, dan `pg_isready` berhasil. Gunakan instance ini tanpa mengganti container atau mengubah data aplikasi lain.
- Database dan role `it_service_desk` sudah dibuat pada container existing. Koneksi nyata dari Bun berhasil; kredensial berada di `.env` (0600, diabaikan Git). Belum ada schema bisnis. Toolchain TypeScript dan unit test API sudah tersedia.

## Arsitektur yang diusulkan

- Svelte + TypeScript untuk SPA; Vite sebagai build/dev tooling.
- Bun menjalankan API HTTP, hashing password, test runner, dan koneksi PostgreSQL melalui API bawaannya. Tidak memakai framework backend atau ORM pada tahap awal.
- Satu origin untuk frontend dan `/api` agar pengelolaan sesi sederhana; dev menggunakan proxy Vite.
- PostgreSQL menyimpan akun, sesi, tiket, pesan, metadata lampiran, dan audit. Migration SQL bertahap per fitur.
- Lampiran disimpan di volume privat persisten; download selalu melalui pemeriksaan otorisasi API.
- Polling chat setiap tiga detik hanya saat halaman tiket aktif; respons terurut, paginated, tanpa menghapus draft. Interval bukan jaminan SLA saat jaringan bermasalah.
- CSS variables untuk dua tema, radius 8–12 px, tanpa library UI tambahan. Preferensi disimpan di browser; default mengikuti sistem.
- Modul dipisahkan per fitur, tanpa generic repository/factory atau microservices.
- Deployment awal satu instance aplikasi dan PostgreSQL. HTTPS wajib saat produksi; port database tidak diekspos publik.

API Bun diverifikasi terhadap dokumentasi HTTP/SQL resmi. TypeScript 6.0.3 dan @types/bun 1.4.2 dikunci pada bun.lock; TypeScript 6 dipilih sesuai peer dependency svelte-check.

## Keputusan yang memerlukan persetujuan

1. NIK wajib saat registrasi/pembuatan akun IT, unik per karyawan, disimpan sebagai string. NIK bukan bukti identitas untuk reset password dan bukan pengganti username login.
2. Prioritas manual untuk MVP; urgensi dahulu, FIFO dalam prioritas yang sama.
3. Usulan PRD dipakai sebagai default: reset oleh Super Admin, password sementara berlaku 24 jam, minimum password 12 karakter, Closed read-only, lampiran JPG/PNG/WebP/PDF maksimal 10 MB/file dan lima file/pengiriman.
4. Disetujui pengguna: Bun global pada host dan PostgreSQL pada container existing. Database serta role khusus `it_service_desk` telah dibuat dan koneksinya diverifikasi. Tidak menggunakan database aplikasi lain atau menjalankan container DB baru.
5. Baseline akses produksi adalah jaringan internal/VPN. Deployment publik, retensi data, volume beban, serta kanal verifikasi identitas perlu keputusan terpisah sebelum go-live.

Setelah disetujui, sinkronkan aturan NIK dan keputusan default ke PRD sebelum membuat schema terkait.

## Struktur yang dituju

```text
src/server/          API Bun dan modul fitur
src/web/             Svelte, client API, dan CSS
src/shared/          Tipe kontrak yang benar-benar digunakan kedua sisi
migrations/          Migration PostgreSQL
scripts/             Migrasi dan bootstrap Super Admin
tests/               Pengujian domain/API/integrasi
tasks/               Rencana dan status pekerjaan
```

## Urutan implementasi

Daftar terperinci dan acceptance criteria ada di `todo.md`.

1. Toolchain dan koneksi database lokal.
2. Shell aplikasi dengan Light/Dark Mode.
3. Registrasi menggunakan NIK.
4. Login, logout, dan sesi.
5. Bootstrap Super Admin.
6. Pembuatan tiket dan daftar milik sendiri.
7. Dashboard urgensi/FIFO dan pengambilan tiket atomik.
8. Percakapan dan pagination.
9. Lampiran privat.
10. Penutupan, solusi, histori.
11. API reset password dan penggantian wajib (task 12a, prasyarat akun IT baru).
12. Pengelolaan IT dan pemindahan penanggung jawab (task 11), lalu UI pemulihan akses (task 12b).
13. Hardening, pengujian lintas role, dan kesiapan operasional.

Setiap fitur diselesaikan sebagai jalur database → API → UI → pengujian, bukan semua backend dahulu lalu seluruh frontend.

## Checkpoint

- Setelah 1–2: toolchain, database, build, dan kedua tema berjalan.
- Setelah 3–5: akun nyata, login, otorisasi, dan bootstrap teruji; review sebelum tiket.
- Setelah 6–7: create/list/claim dan prioritas FIFO teruji, termasuk race condition.
- Setelah 8–10: percakapan, lampiran, solusi, dan histori teruji end-to-end.
- Setelah 11–13: administrasi, reset, backup/restore, dan keseluruhan DoD PRD diperiksa.

Tidak menyatakan MVP selesai hanya karena UI dapat dibuka atau build lulus.

## Verifikasi

Perintah berikut adalah target scripts yang akan dibuat, belum tersedia saat rencana ini ditulis:

- `bun install --frozen-lockfile`: instalasi reproducible setelah lockfile tersedia.
- `docker exec postgres pg_isready`: periksa database existing; tidak menjalankan container database baru.
- `bun run db:migrate`: migration database yang dikonfigurasi.
- `bun run dev`: frontend dan API development.
- `bun run check`: TypeScript dan svelte-check.
- `bun test`: pemeriksaan unit/domain tanpa layanan eksternal.
- `bun run test:integration`: API terhadap PostgreSQL database test terpisah; menolak target database development/produksi.
- `bun run build`: build frontend dan pemeriksaan backend.

Pengujian browser nyata mencakup kedua tema, viewport desktop/mobile, keyboard, error form, role, dan keseluruhan alur. Test framework tambahan hanya dipilih bila diperlukan untuk otomasi browser.

## Pedoman kode dan batasan

- TypeScript strict; validasi semua input di backend, query berparameter, error terstruktur tanpa stack trace ke pengguna.
- Contoh kontrak: `type Role = 'user' | 'it' | 'super_admin';`.
- Gunakan constraint dan transaksi database untuk integritas; bukan mengandalkan tombol disabled.
- Selalu: tulis regression check untuk logika, jalankan check/test/build relevan, simpan bukti hasil, perbarui checklist setelah verifikasi.
- Minta persetujuan: perubahan scope/stack, layanan eksternal, kebijakan akses publik, retensi, dan operasi produksi.
- Jangan: commit secret, menimpa data pengguna, menonaktifkan test gagal, menyediakan credentials default publik, atau menyebut fitur terverifikasi tanpa runtime evidence.

## Risiko

| Risiko | Mitigasi |
|---|---|
| Akun palsu akibat registrasi aktif langsung | Jaringan internal/VPN, rate limit, tidak menganggap NIK terverifikasi |
| IDOR pada tiket/lampiran | Cek role dan kepemilikan di setiap endpoint, integration test akses silang |
| Pengambilan/penutupan/pesan bersamaan | Transaksi dan conditional update/row lock, concurrency tests |
| File gagal setelah data tersimpan | Staging privat, cleanup kegagalan, tidak mengumumkan sukses sebelum persistence selesai |
| Reset meninggalkan sesi lama | Revoke seluruh sesi, cek wajib ganti/expiry di backend |
| Penonaktifan bersamaan dengan penugasan | Transaksi dengan penguncian akun dan assignment konsisten |
| Database dan file backup tidak sinkron | Prosedur backup terkoordinasi dan drill restore terpisah |
| Tiket rendah lama menunggu | Tampilkan usia tiket; auto-escalation di luar MVP |

## Workflow commit

Permintaan pengguna: setiap increment pekerjaan yang telah lolos verifikasi harus memiliki commit tersendiri dengan pesan Conventional Commits. Periksa staged diff dan secret sebelum commit. Jangan menunggu seluruh MVP selesai, melakukan squash, atau push tanpa permintaan.

## Gate implementasi

Pengguna menginstruksikan melanjutkan development. Setup dan fondasi API selesai; implementasi shell Svelte berikutnya. Keputusan produk yang belum disepakati tetap ditandai sebagai usulan dan tidak menghalangi fondasi.
