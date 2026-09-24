# IT Service Desk

Aplikasi internal untuk pelaporan dan penanganan kendala IT. Pengguna membuat tiket dan berkomunikasi dengan tim IT; IT Staff menangani antrean; Super Admin mengelola akun dan pemulihan akses.

Dokumentasi terkait:
- [Spesifikasi produk](docs/prd.md)
- [Operasional dan deployment](docs/operations.md)

## Fitur

- Registrasi dengan nama lengkap, username, dan password.
- Sesi aman berbasis cookie, CSRF protection, dan rate limiting.
- Tiket bernomor otomatis dengan pencarian, filter, dan server-side pagination.
- Antrean IT berdasarkan prioritas dan FIFO, claim tiket, serta audit perubahan.
- Percakapan real-time berbasis polling, lampiran privat, dan histori tiket.
- Penutupan tiket dengan solusi wajib dan status Closed yang read-only.
- Manajemen pengguna, staf IT, status akun, serta reset password oleh Super Admin.
- Antarmuka responsif dengan Light Mode dan Dark Mode.
- Notifikasi Telegram untuk tiket baru (opsional, lihat [panduan operasional](docs/operations.md#2-notifikasi-telegram-untuk-tiket-baru)).

## Teknologi

- Bun 1.4+
- Svelte 5, TypeScript, dan Vite
- PostgreSQL 16
- Docker dan Docker Compose
- Argon2id melalui `Bun.password`

## Development dengan Docker

```bash
docker compose -f docker-compose.dev.yml up --build -d
```

Layanan development:
- Web: http://localhost:5173
- API: http://localhost:3000
- PostgreSQL: `localhost:5433`

Perintah umum:

```bash
docker compose -f docker-compose.dev.yml logs -f app
docker compose -f docker-compose.dev.yml restart app
docker compose -f docker-compose.dev.yml down
```

## Development tanpa Docker

```bash
cp .env.example .env
bun install
bun run src/server/migrate.ts
bun run dev:all
```

`DATABASE_URL` wajib menunjuk PostgreSQL aplikasi. `TEST_DATABASE_URL` harus memakai database terpisah dengan nama berakhiran `_test`.

Notifikasi Telegram bersifat opsional: setel `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_CHAT_ID` (lihat `.env.example`). Tanpa keduanya, aplikasi berjalan tanpa notifikasi.

## Notifikasi Telegram untuk Tiket Baru

Setiap tiket baru dapat dikirim otomatis ke satu atau beberapa chat Telegram. Fitur ini opsional dan tidak memengaruhi pembuatan tiket: notifikasi dikirim secara asynchronous, dan kegagalan pengiriman hanya tercatat di log.

1. Chat `@BotFather` → `/newbot` → simpan token.
2. Tambahkan bot ke grup tujuan, lalu ambil chat id dari `@userinfobot`.
3. Setel environment berikut:

| Variabel | Wajib | Keterangan |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | dengan `TELEGRAM_CHAT_ID` | Token bot dari BotFather (`<bot_id>:<secret>`). |
| `TELEGRAM_CHAT_ID` | dengan `TELEGRAM_BOT_TOKEN` | Satu atau beberapa chat id, dipisahkan koma. |
| `APP_URL` | opsional | Basis URL publik untuk tautan buka tiket pada pesan. |

Pesan yang dikirim memuat nomor tiket, judul, pelapor, waktu (WIB), deskripsi singkat, dan tautan ke tiket. Judul dipotong 120 karakter dan deskripsi 300 karakter. Gagal jaringan/HTTP 5xx/429 dicoba maksimal 3 kali; HTTP 4xx tidak diulang.

Uji konfigurasi tanpa menunggu tiket baru:

```bash
bun run scripts/telegram-smoke.ts <botToken> <chatId>
```

Panduan lengkap, format pesan, dan pemecahan masalah ada di [docs/operations.md](docs/operations.md#2-notifikasi-telegram-untuk-tiket-baru).

## Akun Super Admin Pertama

Jalankan setelah migrasi dengan password kuat milik lingkungan Anda sendiri:

```bash
ADMIN_USERNAME="superadmin" \
ADMIN_FULL_NAME="Super Administrator" \
ADMIN_PASSWORD="ganti-dengan-password-kuat" \
bun run scripts/bootstrap-admin.ts
```

Di container production:

```bash
docker compose -f docker-compose.prod.yml exec \
  -e ADMIN_USERNAME="superadmin" \
  -e ADMIN_FULL_NAME="Super Administrator" \
  -e ADMIN_PASSWORD="ganti-dengan-password-kuat" \
  app bun run scripts/bootstrap-admin.ts
```

Bootstrap bersifat idempotent dan tidak menimpa akun yang sudah ada.

## Pengujian

```bash
bun run check
bun test
bun run test:integration
bun run build
```

Integration test hanya berjalan pada database terpisah berakhiran `_test`.

## Production

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Production tersedia pada port `80`, menjalankan migrasi otomatis, menyajikan frontend dari `dist/web`, dan menyimpan database serta lampiran pada volume persisten. Gunakan reverse proxy HTTPS dan jangan mengekspos PostgreSQL ke jaringan publik. Prosedur backup, restore, dan monitoring tersedia di [docs/operations.md](docs/operations.md).
