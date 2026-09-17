# Release Readiness Checklist — IT Service Desk MVP

Dokumen ini memverifikasi kesiapan rilis produk MVP sebelum deployment dan serah terima pengguna.

---

## 1. Verifikasi Kode & Kualitas Teknis

- [x] **Strict TypeScript Check:** `bun run check` lulus tanpa error type atau unused parameter/variable.
- [x] **Unit Testing:** `bun test` (27 unit tests) lulus 100%.
- [x] **Live Database Integration Tests:** (41 integration tests terhadap PostgreSQL nyata) lulus 100%.
- [x] **Production Build:** `bun run build` menghasilkan bundle frontend `dist/web/` dan server `dist/server/` yang ringkas dan siap pakai.

---

## 2. Kriteria Penerimaan Keamanan & Fungsional

- [x] **Autentikasi & NIK:** NIK string mempertahankan leading zero; password di-hash menggunakan Argon2id; hash tidak bocor ke frontend.
- [x] **Sesi & CSRF:** Cookie bertipe `HttpOnly`, `SameSite=Lax`, dan `Secure` (saat `NODE_ENV=production`); mutasi API terlindungi dari serangan CSRF.
- [x] **Rate Limiting:** Percobaan login berulang dibatasi dan memberikan respons `429 Too Many Requests` dengan header `Retry-After`.
- [x] **Isolasi Akses & Kepemilikan:** User biasa tidak dapat mengakses, melihat, mengunduh lampiran, atau membalas tiket milik pengguna lain.
- [x] **Antrean Prioritas & FIFO:** Antrean dashboard IT mengutamakan `Critical` → `High` → `Medium` → `Low`, waktu kedatangan tiket tertua didahulukan dalam prioritas yang sama.
- [x] **Pengambilan Tiket Aman (Race Safe):** Dua staf mengeklaim tiket bersamaan dijamin tepat satu yang berhasil.
- [x] **Penutupan Tiket dengan Solusi Wajib:** Tiket hanya dapat ditutup oleh penanggung jawab atau admin dengan solusi tertulis minimal 10 karakter; tiket Closed terkunci read-only.
- [x] **Manajemen Akun & Proteksi Last Admin:** Staf IT baru dibuat dengan password sementara dan flag wajib ganti password; Super Admin aktif terakhir terlindungi dari penonaktifan.
- [x] **Tema & Aksesibilitas:** Light Mode dan Dark Mode berfungsi penuh di seluruh komponen dengan toggle, radius 8–12 px, dan focus keyboard terlihat.
