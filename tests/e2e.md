# Rencana Pengujian End-to-End & Hasil Audit Regression — IT Service Desk

## 1. Lingkup Pengujian
Dokumen ini merangkum verifikasi penerimaan menyeluruh (*Definition of Done*) dari seluruh alur kerja sistem IT Service Desk sesuai spesifikasi PRD v1.0.

---

## 2. Matriks Pengujian Lintas Fitur & Keamanan

| Kode Skenario | Deskripsi Skenario | Perilaku yang Diharapkan | Status Verifikasi |
|---|---|---|---|
| **E2E-01** | Registrasi Karyawan dengan NIK | Akun aktif role `User`, NIK string leading zero (`004819`) dipertahankan, hash password Argon2id tidak bocor. | **LULUS** (`tests/auth.integration.ts`) |
| **E2E-02** | Keunikan Username Case-Insensitive | `john.doe` dan `JOHN.DOE` dideteksi sebagai akun yang sama, pendaftaran duplikat ditolak dengan `409 Conflict`. | **LULUS** (`tests/auth.integration.ts`) |
| **E2E-03** | Otentikasi & Cookie Sesi | Cookie `session_id` disetel dengan flag `HttpOnly`, `SameSite=Lax`, dan `Secure` (saat production). | **LULUS** (`tests/session.integration.ts`) |
| **E2E-04** | Proteksi CSRF & Rate Limiting | Permintaan mutasi tanpa custom header/origin valid ditolak `403`. Percobaan login berulang dibatasi dengan `429 Too Many Requests`. | **LULUS** (`tests/session.integration.ts`) |
| **E2E-05** | Bootstrap Super Admin | Setup admin pertama via env/script aman, idempotent, dan tidak mencetak secret ke log terminal. | **LULUS** (`tests/bootstrap.integration.ts`) |
| **E2E-06** | Pembuatan Tiket & Nomor Unik | Tiket diberi nomor urut unik otomatis (`TKT-000001`), status awal `Open`, dan validasi input di backend. | **LULUS** (`tests/tickets.integration.ts`) |
| **E2E-07** | Isolasi Kepemilikan Tiket | User A tidak dapat membaca atau membalas tiket milik User B (`403 Forbidden`). IT Staff & Admin dapat melihat semua tiket. | **LULUS** (`tests/security.integration.ts`) |
| **E2E-08** | Antrean FIFO & Urgensi Dashboard IT | Antrean diurutkan berdasarkan: `Critical` → `High` → `Medium` → `Low`, lalu `created_at ASC`, lalu ID stabil. | **LULUS** (`tests/dashboard.integration.ts`) |
| **E2E-09** | Pengambilan Tiket Atomik (Race Safe) | Dua staf IT mengeklaim tiket Open bersamaan: tepat satu staf berhasil (`200`), staf kedua ditolak (`409`), aksi tercatat di audit log. | **LULUS** (`tests/dashboard.integration.ts`) |
| **E2E-10** | Penyesuaian Prioritas Beralasan | IT Staff dapat mengoreksi prioritas dengan alasan tertulis wajib (minimal 5 karakter), nilai lama & baru tercatat di audit log. | **LULUS** (`tests/dashboard.integration.ts`) |
| **E2E-11** | Percakapan Tiket & Polling | Pertukaran pesan kronologis, pesan kosong ditolak (`422`), auto-polling aktif setiap 4 detik (target PRD: < 5 detik). | **LULUS** (`tests/messages.integration.ts`) |
| **E2E-12** | Validasi & Penyimpanan Lampiran Privat | Format JPG, PNG, WebP, PDF dengan verifikasi magic bytes; ukuran max 10 MB dan max 5 file; download privat terotorisasi. | **LULUS** (`tests/attachments.integration.ts`) |
| **E2E-13** | Penutupan Tiket dengan Solusi Wajib | Solusi minimal 10 karakter wajib diisi; status berubah ke `Closed` secara atomik; seluruh mutasi lanjutan terkunci read-only. | **LULUS** (`tests/resolution.integration.ts`) |
| **E2E-14** | Administrasi IT & Perlindungan Last Admin | Super Admin dapat menambah staf IT, menonaktifkan akun, dan dicegah menonaktifkan Super Admin aktif terakhir. | **LULUS** (`tests/admin.integration.ts`) |
| **E2E-15** | Reset Password 24 Jam & Restricted Session | Reset menghasilkan password sementara 24 jam sekali tampil; sesi lama dicabut; user dibatasi hanya dapat mengganti password. | **LULUS** (`tests/password.integration.ts`) |
| **E2E-16** | Tema Visual Light & Dark Mode | Toggle tema responsif di seluruh shell aplikasi; preferensi tersimpan di local storage browser; radius 8–12 px konsisten. | **LULUS** (`tests/theme.test.ts`) |

---

## 3. Kesimpulan Verifikasi
Seluruh 16 skenario acceptance criteria telah diuji secara menyeluruh terhadap database PostgreSQL nyata dan server HTTP Bun. Tidak ditemukan celah bypass akses, kegagalan transaksi atomik, atau kebocoran kredensial.
