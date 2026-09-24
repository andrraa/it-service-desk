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

## 2. Notifikasi Telegram untuk Tiket Baru

Aplikasi mengirim pesan ke chat/grup Telegram untuk dua peristiwa: **tiket baru** dan **pesan baru dari pelapor** di percakapan tiket. Balasan dari tim IT dan penutupan tiket tidak dikirim, agar grup hanya berisi hal yang perlu ditindaklanjuti. Fitur ini **opsional**: tanpa konfigurasi, aplikasi berjalan seperti biasa.

### A. Menyiapkan Bot & Chat ID
1. Chat `@BotFather` di Telegram → `/newbot` → simpan token (`<bot_id>:<secret>`).
2. Tambahkan bot ke grup tujuan (atau kirim `/start` ke bot untuk chat pribadi). Pada grup forum, pastikan bot adalah admin grup agar dapat menulis ke topic.
3. Ambil chat id dari `@userinfobot` (grup biasanya berawalan `-100...`).
4. Untuk grup forum dengan topic, ambil **thread id** topik tujuan: klik kanan topic → **Copy Link**. Format tautannya `https://t.me/c/<chat_id_internal>/<thread_id>`, mis. `t.me/c/1234567890123/45` → chat id `-1001234567890123`, thread id `45`.

### B. Konfigurasi Environment
| Variabel | Wajib | Keterangan |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | dengan `TELEGRAM_CHAT_ID` | Token bot dari BotFather. |
| `TELEGRAM_CHAT_ID` | dengan `TELEGRAM_BOT_TOKEN` | Satu atau beberapa chat id (pisahkan koma), mis. `-1001234567890,@channelname`. |
| `TELEGRAM_THREAD_ID` | opsional | Id topic pada grup forum (mis. `45`). Kosongkan untuk chat biasa. |
| `APP_URL` | opsional | Basis URL publik, dipakai untuk tautan buka tiket di pesan. |

Setel di `.env` lalu jalankan ulang container:
```bash
# .env
TELEGRAM_BOT_TOKEN=123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw
TELEGRAM_CHAT_ID=-1001234567890123
TELEGRAM_THREAD_ID=45
APP_URL=https://itsd.internal.example.com

docker compose -f docker-compose.prod.yml up -d
```

Jika `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_CHAT_ID` tidak lengkap atau formatnya salah, server menolak start dengan pesan konfigurasi yang jelas (fail-fast), bukan mengirim notifikasi ke alamat yang salah. `TELEGRAM_THREAD_ID` bersifat opsional; isi hanya bila grup memakai topic.

Semua chat id pada `TELEGRAM_CHAT_ID` menerima pesan di topic yang sama bila `TELEGRAM_THREAD_ID` diisi. Untuk mengirim topic berbeda per chat atau per kategori tiket, jalankan instance/konfigurasi terpisah.

### C. Format Pesan & Perilaku
```
🔴 TIKET BARU — CRITICAL
TKT-000123 · Printer <lantai 2> tidak bisa print
👤 Budi Santoso (@budi)
🕒 24 Sep 2026, 16.42 WIB
📝 Monitor menampilkan error "offline" & lampu merah.
🔗 https://itsd.internal.example.com/tickets/TKT-000123
```

Balasan staf IT hanya tampil di percakapan aplikasi, tidak di Telegram. Contoh pesan pelapor:

```
💬 BALASAN BARU — DARI PELAPOR

🔖 TKT-000123
📌 Printer ruang meeting tidak bisa print
👤 Budi Santoso (@budi) · User
🕒 24 Sep 2026, 16.55 WIB
💬 Sudah dicoba restart, masih belum bisa.

🔗 Buka tiket TKT-000123
```

- Ikon prioritas: 🔴 Critical, 🟠 High, 🟡 Medium, 🟢 Low.
- Judul dipotong 120 karakter, deskripsi 300 karakter; semua teks di-escape HTML agar judul bertanda `<` `&` tidak membatalkan pengiriman.
- Pengiriman bersifat *fire-and-forget*: respons API (buat tiket, kirim pesan, tutup tiket) tidak menunggu Telegram. Gagal jaringan/HTTP 5xx/429 dicoba maksimal 3 kali (250 ms → 1 s) lalu dicatat di log; HTTP 4xx tidak diulang.
- Pengiriman per chat diserialkan agar urutan pesan tetap terjaga, dan saat server shutdown antrean yang masih berjalan diselesaikan sebelum proses keluar.

### D. Verifikasi & Pemecahan Masalah
```bash
# Cek konfigurasi terbaca (tidak menulis pesan)
docker exec it-service-desk-prod sh -c 'echo ${TELEGRAM_CHAT_ID}'
# Uji kirim manual ke chat/topic (tanpa menunggu tiket baru)
bun run scripts/telegram-smoke.ts <botToken> <chatId> [threadId] [new|reply]
# Log kegagalan pengiriman
docker logs it-service-desk-prod | grep -i telegram
```
- `Telegram notify failed ... HTTP 401` → token salah.
- `HTTP 400 ... chat not found` → bot belum ditambahkan ke grup/chat id salah.
- `HTTP 400 ... message thread not found` → `TELEGRAM_THREAD_ID` salah, atau topic/grup berubah. Ambil ulang thread id dari menu "Copy Link" topic.
- `HTTP 403 ... not enough rights` → jadikan bot admin grup agar dapat menulis ke topic.
- Notifikasi ganda saat pengguna klik dua kali → tidak terjadi; tiket dan pesan memakai kunci `requestId`, dan hanya insert baru dari pelapor yang memicu notifikasi.
- Notifikasi balasan tidak muncul padahal pesan terkirim → hanya pesan dari **pembuat tiket** yang dinotifikasi; balasan staf IT memang tidak dikirim.
- `HTTP 429` → rate limit; dikirim ulang otomatis, turunkan frekuensi grup bila sering terjadi.

---

## 3. Kirim Tiket via Email (opsional)

Staf IT / Super Admin dapat mengirim tiket ke email penerima melalui tombol **Kirim Email** (tersedia di detail tiket untuk semua status, dan di kolom aksi antrean IT). Penerima, subjek, dan isi pesan diisi manual; subjek dan isi terisi otomatis dari tiket + solusinya dan bisa diedit sebelum dikirim. Pesan berupa teks biasa tanpa lampiran.

### A. Konfigurasi
```bash
# /opt/it-service-desk/app/.env
SMTP_HOST=relay.perusahaan.local
SMTP_PORT=587
SMTP_SECURE=            # kosongkan; 465 otomatis TLS
SMTP_USER=helpdesk
SMTP_PASSWORD=********
SMTP_FROM="IT Service Desk <helpdesk@perusahaan.com>"
```
```bash
docker compose -f docker-compose.prod.yml up -d   # tanpa --build; hanya environment
```
- `SMTP_HOST` kosong → fitur mati, tombol "Kirim Email" tidak dirender (flagnya ikut di `/api/auth/me`).
- Konfigurasi setengah jalan (mis. `SMTP_USER` tanpa `SMTP_PASSWORD`, `SMTP_FROM` kosong, port tidak valid) → server **gagal start** dengan pesan jelas, bukan diam-diam tidak bisa mengirim.

### B. Perilaku pengiriman
- Pengiriman **synchronous**: respons API menunggu relay (timeout 10 s koneksi / 15 s socket), agar staf langsung tahu berhasil atau gagal.
- Tanpa retry dan tanpa antrean; kegagalan dikembalikan sebagai `502 EMAIL_SEND_FAILED` dengan pesan yang bisa ditindaklanjuti (autentikasi ditolak, relay tak terjangkau, penerima ditolak).
- Rate limit 10 email/menit per pengguna → `429` + `Retry-After`.
- Guard: hanya peran `IT Staff`/`Super Admin` (403); status tiket tidak dibatasi. `to`/`subject` menolak karakter baris baru (anti header injection), subjek ≤ 200 dan isi ≤ 5000 karakter.
- Audit log mencatat `SEND_EMAIL` berisi `to`, `subject`, dan nomor tiket; **isi email tidak disimpan** (menghindari PII di audit).

### C. Pemecahan masalah
```bash
docker exec it-service-desk-prod sh -c 'echo ${SMTP_HOST}'
docker logs it-service-desk-prod | grep -i "send ticket email"
```
- Tombol tidak muncul padahal `.env` sudah diisi → container belum di-recreate (`docker compose up -d`).
- `Email belum dikonfigurasi pada server ini` (503) → `SMTP_HOST` kosong di container.
- "Autentikasi SMTP ditolak" → cek `SMTP_USER`/`SMTP_PASSWORD`; banyak relay memakai *app password*, bukan password akun.
- "Tidak dapat terhubung ke server email" → host/port salah atau firewall ke relay.
- "Alamat penerima ditolak relay" → alamat salah, atau relay melarang domain tujuan.

---

## 4. Prosedur Backup & Restore Data Container

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
docker run --rm -v it-service-desk-uploads-data:/volume -v $(pwd):/backup alpine tar -czf /backup/backup_uploads_$(date +%Y%m%d_%H%M%S).tar.gz -C /volume .
```

---

## 5. Keamanan Log & Hardening Produksi

- Container berjalan di jaringan internal bridge tertutup.
- Port database `5432` pada production compose tidak terekspos ke internet publik (hanya dapat diakses oleh container `app`).
- Endpoint API menyertakan header keamanan: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, dan `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`.
- Di belakang reverse proxy HTTPS (Nginx/Caddy), pastikan melewatkan header `X-Forwarded-Proto: https` dan `X-Forwarded-For`.
- `TELEGRAM_BOT_TOKEN` bersifat rahasia; simpan hanya di `.env`/secret manager dan jangan commit ke repositori.
