# IT Service Desk

Aplikasi masih dalam tahap setup, belum ada fitur aplikasi yang diimplementasikan.
Kebutuhan produk: [PRD.md](PRD.md). Rencana: [tasks/plan.md](tasks/plan.md).

## Environment development

- Bun 1.4.2 terinstal global di host.
- PostgreSQL 16 menggunakan container existing `postgres`, port host `5432`.
- Database: `it_service_desk`.
- Role login sekaligus pemilik database development: `it_service_desk`.
- Role tidak memiliki SUPERUSER, CREATEDB, CREATEROLE, REPLICATION, atau BYPASSRLS.
- Akses database proyek untuk `PUBLIC` telah dicabut. Database aplikasi lain tidak diubah.

Kredensial lokal tersimpan di `.env` dengan permission `0600` dan diabaikan Git.
Jangan commit atau membagikan isi file tersebut. `.env.example` hanya berisi placeholder,
bukan password yang dapat dipakai. Pada host lain, isi `.env` dengan kredensial dari
administrator; file contoh tidak membuat database atau akun secara otomatis.

Verifikasi environment:

```sh
bun --version
docker exec postgres pg_isready
bun -e 'import { SQL } from "bun"; const db = new SQL(process.env.DATABASE_URL!); try { console.log(await db`SELECT current_database() AS database, current_user AS role`); } finally { await db.close(); }'
```

Bun otomatis membaca `.env`. Perintah di atas menguji koneksi nyata tanpa menampilkan
password. Belum ada migration atau schema aplikasi. Jangan arahkan migration ke database
aplikasi lain. Database integration test terpisah belum disiapkan.

## Workflow

Setiap increment yang telah diverifikasi dibuat sebagai commit tersendiri. Secret,
`node_modules`, dan build output tidak masuk Git. Belum ada remote/push dikonfigurasi.

## Catatan produksi

Konfigurasi ini untuk development, bukan hardening produksi. Port container PostgreSQL
existing terekspos pada seluruh interface host; konfigurasi container tidak diubah karena
dipakai bersama. Batasi akses jaringan sebelum produksi. Role runtime produksi sebaiknya
terpisah dari pemilik schema/migration; gunakan HTTPS dan kebijakan backup yang teruji.
