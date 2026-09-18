# Panduan Operasional & Deployment Docker — IT Service Desk

Dokumen ini menjelaskan tata cara deployment container (`docker-dev` dan `docker-production`), backup & restore volume data, pemantauan log, dan prosedur darurat pemulihan Super Admin.

---

## 1. Deployment Menggunakan Docker

Proyek ini telah dikonfigurasi dengan dua lingkungan container terisolasi:

### A. Environment Development (`docker-dev`)
Fitur:
- Hot reload kode sumber lokal melalui volume bind mount.
- Port API `3000` dan port frontend Vite dev server `5173`.
- PostgreSQL dev database otomatis di container terpisah (`port host 5433` untuk mencegah tabrakan port host `5432`).

**Cara Menjalankan:**
```bash
# Build dan jalankan container development di background
docker compose -f docker-compose.dev.yml up --build -d

# Memeriksa log aplikasi
docker compose -f docker-compose.dev.yml logs -f app

# Menjalankan migrasi secara manual di dalam container (jika diperlukan)
docker compose -f docker-compose.dev.yml exec app bun run src/server/migrate.ts

# Menghentikan container development
docker compose -f docker-compose.dev.yml down
```

---

### B. Environment Production (`docker-production`)
Fitur:
- Multi-stage build (`Dockerfile` / `Dockerfile.prod`):
  - Stage 1 (`builder`): Mengompilasi frontend Svelte ke `dist/web` dan backend Bun ke `dist/server`.
  - Stage 2 (`runner`): Menggunakan image ringan `oven/bun:1.4.2-slim` dengan file dist dan dependensi runtime yang dibutuhkan saja.
- Otomatis menjalankan migrasi database (`src/server/migrate.ts`) sebelum HTTP server dimulai.
- Static file serving bawaan Bun untuk seluruh aset web frontend di port `3000`.
- Volume persisten untuk database PostgreSQL (`pg_data`) dan berkas lampiran privat (`uploads_data`).

**Cara Menjalankan:**
```bash
# 1. Jalankan container production
docker compose -f docker-compose.prod.yml up --build -d

# 2. Bootstrap akun Super Admin pertama di dalam container production:
docker compose -f docker-compose.prod.yml exec \
  -e ADMIN_USERNAME="superadmin" \
  -e ADMIN_FULL_NAME="Super Administrator" \
  -e ADMIN_PASSWORD="ganti-dengan-password-kuat" \
  app bun run scripts/bootstrap-admin.ts

# 3. Memeriksa status service
docker compose -f docker-compose.prod.yml ps

# 4. Menghentikan container production
docker compose -f docker-compose.prod.yml down
```

---

## 2. Prosedur Backup & Restore Data Container

### A. Backup Database PostgreSQL dari Container
```bash
docker exec -t it-service-desk-prod-db pg_dump -U it_service_desk -d it_service_desk -Fc > backup_db_$(date +%Y%m%d_%H%M%S).dump
```

### B. Restore Database ke Container
```bash
docker exec -i it-service-desk-prod-db pg_restore -U it_service_desk -d it_service_desk --clean --if-exists < backup_db_YYYYMMDD.dump
```

### C. Backup Volume Lampiran Privat
```bash
docker run --rm -v it-service-desk_uploads_data:/volume -v $(pwd):/backup alpine tar -czf /backup/backup_uploads_$(date +%Y%m%d_%H%M%S).tar.gz -C /volume .
```

---

## 3. Keamanan Log & Hardening Produksi

- Container berjalan di jaringan internal bridge tertutup.
- Port database `5432` pada production compose tidak terekspos ke internet publik (hanya dapat diakses oleh container `app`).
- Endpoint API menyertakan header keamanan: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, dan `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`.
- Di belakang reverse proxy HTTPS (Nginx/Caddy), pastikan melewatkan header `X-Forwarded-Proto: https` dan `X-Forwarded-For`.
