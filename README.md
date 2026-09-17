# IT Service Desk — Corporate Internal Workspace

Aplikasi internal berbasis web untuk pelaporan kendala, manajemen tiket, antrean operasional IT Staff (FIFO per urgensi prioritas), ruang percakapan & lampiran privat, serta pemulihan akses pengguna.

Spesifikasi Produk: [PRD.md](PRD.md)  
Panduan Operasional & Backup: [docs/operations.md](docs/operations.md)  
Checklist Kesiapan Rilis: [tests/release-checklist.md](tests/release-checklist.md)  
Laporan Verifikasi E2E: [tests/e2e.md](tests/e2e.md)

---

## 1. Fitur Utama MVP

1. **Autentikasi & Registrasi Karyawan:**
   - Pendaftaran menggunakan NIK (string mempertahankan leading zero) dan username case-insensitive.
   - Sesi berbasis Cookie `HttpOnly`, `SameSite=Lax`, dan `Secure`.
   - Proteksi CSRF & Rate Limiting pada auth.
2. **Manajemen Tiket Milik Pengguna:**
   - Pembuatan tiket dengan nomor urut unik otomatis (`TKT-000001`).
   - Pencarian tiket dan pagination.
   - Hak akses isolasi kepemilikan (User hanya dapat melihat tiket sendiri).
3. **Dashboard Operasional IT:**
   - Antrean FIFO per tingkat urgensi (`Critical` → `High` → `Medium` → `Low`) dengan tie-breaker ID stabil.
   - Pengambilan tiket atomik (*race condition safe*).
   - Penyesuaian prioritas beralasan wajib dengan audit log lengkap.
4. **Ruang Percakapan & Lampiran Berkas Privat:**
   - Percakapan kronologis per tiket dengan auto-polling (4 detik).
   - Validasi berkas lampiran (JPG, PNG, WebP, PDF) dengan verifikasi magic bytes (max 10 MB).
   - Download privat terotorisasi (pencegahan path traversal).
5. **Penyelesaian Solusi & Histori Terkunci:**
   - Penutupan tiket dengan solusi wajib terdokumentasi (status `Closed`).
   - Tiket Closed terkunci read-only dari segala bentuk mutasi.
6. **Administrasi Staf IT & Pemulihan Akun:**
   - Pembuatan staf IT baru dengan password sementara acak 24 jam dan wajib ganti password.
   - Pembatasan sesi (*restricted session*) di backend bagi akun yang wajib ganti password.
   - Proteksi penonaktifan Super Admin aktif terakhir.
7. **Antarmuka & Tema Visual:**
   - Gaya corporate, radius 8–12 px, fokus keyboard aksesibel.
   - Toggle Light Mode dan Dark Mode dengan penyimpanan preferensi browser.

---

## 2. Tech Stack

- **Runtime & Backend:** Bun 1.4.2 (HTTP Server bawaan Bun + Bun SQL)
- **Frontend:** Svelte 5 + TypeScript + Vite
- **Database:** PostgreSQL 16
- **Hashing:** Argon2id (bawaan `Bun.password`)

---

## 3. Menjalankan Aplikasi Secara Lokal

### A. Persiapan Lingkungan
Salin file konfigurasi dan isi kredensial PostgreSQL:
```bash
cp .env.example .env
```

### B. Migrasi Database & Bootstrap Super Admin
```bash
bun run src/server/migrate.ts

# Bootstrap Super Admin pertama (opsional)
export ADMIN_NIK="000001"
export ADMIN_USERNAME="superadmin"
export ADMIN_PASSWORD="SuperPasswordAman123!"
bun run scripts/bootstrap-admin.ts
```

### C. Menjalankan Server & Frontend
```bash
# Terminal 1 (Backend API)
bun run dev:api

# Terminal 2 (Frontend Vite Dev Server)
bun run dev:web
# Buka http://localhost:5173 di browser
```

---

## 4. Pengujian & Verifikasi Kualitas

```bash
# Jalankan Typecheck TypeScript Strict
bun run check

# Jalankan Unit Tests
bun test

# Jalankan Seluruh Integration Tests (Database Nyata)
bun test ./tests/*.integration.ts

# Build Bundling Produksi
bun run build

# Menjalankan Hasil Build Produksi
bun start
```
