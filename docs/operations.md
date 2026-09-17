# Panduan Operasional — IT Service Desk

Dokumen ini menjelaskan tata cara deployment produksi, backup & restore database serta file lampiran privat, pemantauan log aman, dan prosedur darurat pemulihan Super Admin.

---

## 1. Persyaratan Lingkungan (Production Requirements)

- **Runtime:** Bun >= 1.4.2
- **Database:** PostgreSQL >= 16
- **Reverse Proxy:** Nginx / Caddy dengan HTTPS (TLS termination wajib di production agar cookie `Secure` aktif)
- **Direktori Privat Lampiran:** Lokasi penyimpanan persisten (misal: `/var/data/it-service-desk/uploads`) dengan izin akses terbatas (`chmod 700`).

---

## 2. Konfigurasi Lingkungan (`.env`)

```env
# Database URL lengkap
DATABASE_URL=postgresql://it_service_desk:PASSWORD_RAHASIA@127.0.0.1:5432/it_service_desk

# Port HTTP server internal (bind ke 127.0.0.1)
PORT=3000

# Mode production mengaktifkan flag Secure pada session cookie
NODE_ENV=production

# Direktori persisten penyimpanan lampiran privat
UPLOADS_DIR=/var/data/it-service-desk/uploads
```

---

## 3. Langkah Deployment & Migrasi Database

1. **Jalankan Migrasi Database:**
   ```bash
   bun run src/server/migrate.ts
   ```
2. **Build Bundling Frontend & Server:**
   ```bash
   bun run build
   ```
3. **Jalankan Service:**
   ```bash
   bun start
   ```

---

## 4. Prosedur Backup & Restore

### A. Backup Database (PostgreSQL)
Jalankan perintah `pg_dump` terjadwal (misal via cron harian):
```bash
pg_dump -U it_service_desk -d it_service_desk -Fc -f "/var/backups/db/it_service_desk_$(date +%Y%m%d_%H%M%S).dump"
```

### B. Restore Database
```bash
pg_restore -U it_service_desk -d it_service_desk --clean --if-exists "/var/backups/db/it_service_desk_YYYYMMDD.dump"
```

### C. Backup File Lampiran
Karena lampiran disimpan di direktori privat persisten `UPLOADS_DIR`, backup direktori secara sinkron:
```bash
tar -czf "/var/backups/files/uploads_$(date +%Y%m%d_%H%M%S).tar.gz" -C /var/data/it-service-desk uploads
```

---

## 5. Keamanan Log & Kredensial

- Seluruh endpoint API tidak pernah mencetak password, password hash, token sesi, atau isi berkas ke log terminal / stdout.
- Error database yang memuat string koneksi internal di-sanitize menjadi error code generic (`INTERNAL_ERROR` / `SERVICE_UNAVAILABLE`).

---

## 6. Prosedur Darurat: Pemulihan Akun Super Admin

Jika semua Super Admin kehilangan akses atau kredensial terkunci:
1. Akses server host melalui SSH.
2. Siapkan kredensial admin baru di environment terminal:
   ```bash
   export ADMIN_NIK="EMERGENCY_ADM_01"
   export ADMIN_USERNAME="emergency_admin"
   export ADMIN_PASSWORD="PasswordSangatKuatDanPanjang2026!"
   ```
3. Eksekusi script bootstrap:
   ```bash
   bun run scripts/bootstrap-admin.ts
   ```
4. Masuk ke aplikasi menggunakan akun darurat tersebut dan atur ulang akun admin lainnya melalui menu **Kelola Staf & Akun**.
