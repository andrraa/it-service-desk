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
