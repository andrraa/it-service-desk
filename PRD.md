# PRD — IT Service Desk

**Versi:** 1.0

**Status:** Draft untuk review

**Platform:** Web application

**Cakupan:** MVP

> Ketentuan bertanda **Usulan** merupakan rekomendasi awal, bukan keputusan final.

## 1. Ringkasan Produk

IT Service Desk adalah aplikasi untuk mencatat, menangani, dan menyimpan histori masalah IT dalam satu tempat.

Karyawan dapat membuat tiket, menentukan prioritas, melampirkan dokumen atau gambar, serta berkomunikasi dengan tim IT melalui ruang percakapan per tiket. Tim IT menangani antrean berdasarkan urgensi dan urutan kedatangan, kemudian mencatat solusi sebelum menutup tiket.

Super Admin mengelola akun karyawan IT dan membantu pemulihan akses pengguna.

## 2. Tujuan Produk

- Memusatkan pelaporan masalah IT.
- Memberikan visibilitas status penanganan kepada pengguna.
- Membantu IT menentukan urutan penanganan.
- Menyimpan percakapan, lampiran, dan solusi sebagai histori.
- Menyediakan pengelolaan akun tanpa ketergantungan pada email.

### Indikator keberhasilan

- Setiap tiket memiliki nomor unik, pemilik, prioritas, dan status.
- Pengguna dapat mengikuti penanganan tanpa berpindah aplikasi.
- Semua tiket Closed memiliki solusi tertulis.
- Dashboard menampilkan antrean secara konsisten sesuai aturan urgensi dan FIFO.
- Pemulihan password tidak membuka akses ke password lama pengguna.

## 3. Pengguna dan Hak Akses

| Kemampuan | User | IT Staff | Super Admin |
|---|---|---|---|
| Membuat tiket | Ya | Ya | Ya |
| Melihat tiket | Milik sendiri | Semua tiket | Semua tiket |
| Mengirim pesan dan lampiran | Tiket sendiri | Semua tiket aktif | Semua tiket aktif |
| Mengambil penanganan tiket | Tidak | Ya | Ya |
| Mengubah prioritas | Saat pembuatan | Ya | Ya |
| Menutup tiket dengan solusi | Tidak | Ya | Ya |
| Melihat dashboard operasional | Tidak | Ya | Ya |
| Mengelola akun IT Staff | Tidak | Tidak | Ya |
| Mereset password pengguna | Tidak | Tidak | Ya |
| Mengganti password sendiri | Ya | Ya | Ya |

**Usulan aturan akses:**

- Registrasi mandiri selalu menghasilkan role **User**.
- Super Admin memiliki seluruh kemampuan operasional IT Staff.
- IT Staff boleh membantu percakapan tiket lain, tetapi perubahan status dan penutupan dilakukan penanggung jawab atau Super Admin.
- Super Admin pertama dibuat melalui proses setup yang aman, bukan registrasi publik.
- Penonaktifan akun tidak menghapus histori tiket dan percakapan.

## 4. Ruang Lingkup

### Termasuk MVP

1. Registrasi dan login menggunakan username serta password.
2. Akun langsung aktif tanpa verifikasi email.
3. Pembuatan tiket dengan prioritas manual.
4. Penomoran tiket otomatis.
5. Status Open, In Progress, dan Closed.
6. Ruang percakapan pada setiap tiket.
7. Lampiran pada tiket dan pesan.
8. Dashboard IT dengan antrean urgensi dan FIFO.
9. Penanggung jawab tiket.
10. Solusi wajib sebelum penutupan tiket.
11. Histori tiket.
12. Pengelolaan akun IT Staff oleh Super Admin.
13. Reset password melalui Super Admin.
14. Pencatatan aktivitas penting.
15. Light Mode dan Dark Mode dengan toggle penggantian tema.

### Di luar MVP — Usulan

- Prioritas otomatis berbasis keyword atau AI.
- Email, WhatsApp, dan push notification.
- SLA otomatis dan eskalasi.
- Pembukaan kembali tiket Closed.
- Knowledge base terpisah.
- Integrasi inventaris aset.
- SSO dan aplikasi mobile native.

Prioritas otomatis ditunda agar MVP tidak bergantung pada aturan deteksi yang belum disepakati.

## 5. Alur Utama

### 5.1 Registrasi dan login

1. Pengguna membuka website.
2. Pengguna yang belum memiliki akun memilih **Daftar**.
3. Pengguna mengisi nama lengkap, username, password, dan konfirmasi password.
4. Sistem memvalidasi input dan keunikan username.
5. Akun langsung aktif dengan role User.
6. Pengguna diarahkan ke halaman login.
7. Setelah login, pengguna masuk ke halaman sesuai role.

Akun yang dinonaktifkan tidak dapat login.

### 5.2 Pembuatan dan penanganan tiket

1. User membuka halaman **Buat Tiket**.
2. User mengisi judul, deskripsi, prioritas, dan lampiran opsional.
3. Sistem menyimpan tiket dan memberikan nomor otomatis.
4. Status awal adalah **Open**.
5. Tiket muncul di daftar User dan antrean IT.
6. IT membuka tiket, membaca laporan, dan memilih **Ambil & Mulai Tangani**.
7. Sistem menetapkan penanggung jawab dan mengubah status menjadi **In Progress**.
8. User dan IT bertukar pesan serta lampiran dalam ruang percakapan.
9. Jika masalah belum selesai, tiket tetap In Progress.
10. Jika selesai, IT mengisi solusi dan memilih **Tutup Tiket**.
11. Sistem mengubah status menjadi **Closed** dan menyimpan seluruh histori.

**Usulan:** Membuka atau membaca tiket tidak otomatis mengubah status. Tindakan mulai menangani harus eksplisit.

### 5.3 Reset password

1. User lupa password.
2. Halaman login menyediakan petunjuk menghubungi IT di luar aplikasi.
3. IT memverifikasi identitas pemilik akun melalui prosedur organisasi.
4. Super Admin memilih akun pada panel admin dan menjalankan reset password.
5. Sistem menghasilkan password sementara.
6. Super Admin menyampaikan password sementara melalui kanal yang disepakati.
7. Seluruh sesi lama akun tersebut dicabut.
8. User login menggunakan password sementara.
9. User wajib mengganti password sebelum mengakses fitur lain.
10. Setelah berhasil, password sementara tidak berlaku lagi.

**Usulan keamanan:**

- Password sementara acak, hanya ditampilkan sekali, dan berlaku maksimal 24 jam.
- Password sementara yang kedaluwarsa harus diterbitkan ulang.
- Status wajib ganti password diperiksa oleh backend, bukan hanya pengalihan halaman frontend.
- Audit mencatat pelaksana dan waktu reset, tanpa menyimpan password.

## 6. Kebutuhan Fungsional

### FR-01 — Autentikasi

- Username harus unik tanpa membedakan huruf besar dan kecil.
- Username dan password wajib diisi.
- **Usulan:** Password minimal 12 karakter; spasi, paste, dan password manager diperbolehkan.
- Password disimpan dalam bentuk hash, bukan teks asli.
- Login dan registrasi memiliki pembatasan percobaan.
- User dapat logout dan mengganti password sendiri.
- Penggantian password biasa memerlukan password saat ini.

### FR-02 — Pembuatan tiket

| Field | Wajib | Ketentuan |
|---|---|---|
| Judul | Ya | Ringkasan masalah |
| Deskripsi | Ya | Detail kendala dan dampaknya |
| Prioritas | Ya | Low, Medium, High, Critical |
| Lampiran | Tidak | Gambar atau dokumen pendukung |

Data otomatis:

- Nomor tiket unik.
- Pembuat tiket.
- Waktu pembuatan.
- Status Open.
- Penanggung jawab kosong.

**Usulan format nomor:** `TKT-000001`.

Nomor harus tetap unik saat banyak tiket dibuat bersamaan. Nomor yang terlewati diperbolehkan; nomor duplikat tidak.

### FR-03 — Prioritas dan antrean

| Prioritas | Panduan |
|---|---|
| Critical | Layanan penting berhenti dan berdampak luas |
| High | Pekerjaan utama terhambat tanpa alternatif memadai |
| Medium | Kendala mengganggu, tetapi masih ada alternatif |
| Low | Gangguan ringan atau permintaan tidak mendesak |

Aturan antrean default:

1. Hanya tiket aktif: Open dan In Progress.
2. Urutan prioritas: **Critical → High → Medium → Low**.
3. Dalam prioritas yang sama, tiket paling lama dibuat muncul lebih dahulu.
4. Jika waktu sama, ID tiket menjadi penentu urutan yang konsisten.
5. Balasan baru tidak mengubah posisi FIFO.
6. Perubahan prioritas memperbarui posisi antrean dan dicatat dalam histori.

**Penting:** FIFO berlaku **di dalam tingkat prioritas yang sama**, bukan FIFO global.

IT dan Super Admin dapat mengoreksi prioritas dengan alasan yang tercatat. Panduan prioritas ditampilkan pada form agar pengguna tidak selalu memilih tingkat tertinggi.

### FR-04 — Status dan penanggung jawab

| Status | Makna | Transisi berikutnya |
|---|---|---|
| Open | Tiket baru, belum mulai ditangani | In Progress |
| In Progress | Tiket sedang ditangani IT | Closed |
| Closed | Solusi tercatat dan penanganan selesai | Tidak ada pada MVP |

- Setiap tiket In Progress memiliki satu penanggung jawab.
- Pengambilan tiket harus aman terhadap dua IT yang menekan tombol bersamaan; hanya satu yang berhasil.
- **Usulan:** Super Admin dapat memindahkan penanggung jawab.
- Akun IT dengan tiket aktif tidak boleh dinonaktifkan sebelum tiketnya dialihkan.
- User tidak dapat mengubah status sendiri.

### FR-05 — Ruang percakapan

- Setiap tiket memiliki satu ruang percakapan.
- Pesan menampilkan pengirim, role, waktu, teks, dan lampiran.
- Pesan diurutkan berdasarkan waktu pengiriman.
- Pesan dapat berisi teks, lampiran, atau keduanya; pesan kosong ditolak.
- **Usulan:** Pesan baru muncul tanpa reload manual, maksimal lima detik pada kondisi normal.
- Jika pengiriman gagal, UI menampilkan kegagalan dan mempertahankan draft.
- Pesan yang belum tersimpan tidak boleh ditampilkan seolah berhasil terkirim.
- **Usulan:** Pesan tidak dapat diedit atau dihapus pada MVP demi menjaga histori.
- Tiket Closed bersifat read-only, termasuk ruang percakapannya.

### FR-06 — Lampiran

Lampiran tersedia pada pembuatan tiket dan pesan percakapan.

**Usulan batas MVP:**

- Format: JPG, PNG, WebP, dan PDF.
- Maksimal 10 MB per file.
- Maksimal lima file per pengiriman.

Ketentuan:

- Validasi ukuran, ekstensi, dan jenis konten dilakukan di backend.
- Gambar dapat dipratinjau; dokumen dapat diunduh.
- File disimpan secara privat, bukan melalui URL publik permanen.
- Hak akses diperiksa pada setiap permintaan file.
- Nama penyimpanan dibuat sistem; nama asli hanya untuk tampilan.
- File tidak boleh dieksekusi oleh server.
- Kegagalan upload harus terlihat; tidak boleh diam-diam menghilangkan lampiran.

### FR-07 — Penutupan dan histori

- Solusi berupa teks wajib diisi sebelum tiket ditutup.
- Sistem mencatat solusi, penutup tiket, dan waktu penutupan.
- Penyimpanan solusi dan perubahan status dilakukan sebagai satu operasi: keduanya berhasil atau tidak ada perubahan.
- Tiket Closed tetap dapat dicari dan dibaca oleh pihak yang berhak.
- Histori mempertahankan laporan awal, percakapan, lampiran, prioritas, dan aktivitas penanganan.
- Tidak tersedia penghapusan permanen tiket melalui UI pada MVP.

### FR-08 — Dashboard IT

Dashboard langsung menampilkan:

**Ringkasan**

- Jumlah Open.
- Jumlah In Progress.
- Jumlah tiket aktif Critical.
- Jumlah Closed hari ini.

**Antrean tiket**

- Nomor dan judul.
- Pelapor.
- Prioritas.
- Status.
- Waktu dibuat dan usia tiket.
- Penanggung jawab.

**Pencarian dan filter**

- Nomor atau judul tiket.
- Status.
- Prioritas.
- Penanggung jawab.
- Tiket belum diambil.
- Tiket yang ditangani sendiri.

Tiket Closed tersedia melalui filter atau halaman histori, tetapi tidak memenuhi antrean aktif.

### FR-09 — Panel Super Admin

- Membuat akun IT Staff.
- Mengubah data akun IT Staff.
- Mengaktifkan dan menonaktifkan akun IT Staff.
- Mereset password User dan IT Staff.
- Melihat status akun dan aktivitas administratif.
- Akun IT baru menggunakan password sementara dan wajib menggantinya.
- Penonaktifan akun langsung mencabut sesi aktifnya.
- Sistem mencegah penonaktifan Super Admin aktif terakhir.

## 7. User Stories dan Acceptance Criteria

| ID | User story | Acceptance criteria |
|---|---|---|
| US-01 | Sebagai User, saya ingin mendaftar tanpa email. | Username unik dan password valid menghasilkan akun aktif; pengguna kemudian dapat login. |
| US-02 | Sebagai User, saya ingin melaporkan kendala. | Tiket valid mendapat nomor unik, status Open, dan muncul di daftar tiket saya. |
| US-03 | Sebagai User, saya ingin mengirim bukti gambar atau file. | Lampiran valid dapat dibuka oleh pihak berhak; ukuran atau format terlarang ditolak dengan pesan jelas. |
| US-04 | Sebagai User, saya ingin berdiskusi dengan IT. | Pesan tersimpan, tampil berurutan, dan muncul tanpa reload manual sesuai target pembaruan. |
| US-05 | Sebagai IT, saya ingin melihat tiket mendesak dan tertua. | Critical tampil sebelum High; dua tiket High diurutkan dari waktu pembuatan paling lama. |
| US-06 | Sebagai IT, saya ingin mengambil tiket. | Tiket berubah ke In Progress dan saya menjadi penanggung jawab; pengambilan bersamaan tidak menghasilkan dua pemilik. |
| US-07 | Sebagai IT, saya ingin mendokumentasikan penyelesaian. | Penutupan tanpa solusi ditolak; penutupan valid menyimpan solusi, pelaksana, dan waktu. |
| US-08 | Sebagai Super Admin, saya ingin mengelola tim IT. | Akun IT dapat dibuat dan dinonaktifkan tanpa menghapus histori; akun nonaktif tidak dapat mengakses aplikasi. |
| US-09 | Sebagai User, saya ingin memulihkan akses. | Reset mencabut sesi lama; password sementara hanya membuka proses wajib ganti password. |
| US-10 | Sebagai User, saya ingin melihat histori. | Tiket Closed milik saya tetap dapat dibaca beserta solusi dan lampirannya, tetapi tidak dapat dibalas. |

**Acceptance keamanan lintas fitur:** User A tidak dapat mengakses tiket, pesan, atau lampiran User B, termasuk dengan mengubah URL atau mengirim permintaan API langsung.

## 8. Kebutuhan UI/UX

### Identitas visual

- Gaya corporate, bersih, dan profesional.
- Palet utama putih, hitam, dan abu-abu.
- Radius komponen **8–12 px**; hindari bentuk pill untuk komponen utama.
- Hierarki informasi jelas melalui tipografi, jarak, dan kontras.
- Warna status boleh dipakai secara terbatas, tetapi selalu disertai label teks.

### Light Mode dan Dark Mode

- Aplikasi wajib menyediakan **Light Mode dan Dark Mode**, dengan toggle untuk mengganti tema.
- Light Mode menggunakan latar dominan putih dan teks gelap; Dark Mode menggunakan latar dominan hitam/gelap dan teks terang.
- Kedua mode berlaku konsisten pada seluruh halaman dan komponen, termasuk form, tabel, modal, serta ruang percakapan.
- Kedua mode mempertahankan gaya corporate, radius 8–12 px, fokus keyboard yang terlihat, dan kontras WCAG AA.
- **Usulan:** Pilihan tema disimpan pada browser dan tetap digunakan setelah reload; sebelum pengguna memilih, tema mengikuti preferensi sistem.

### Halaman utama

1. Login.
2. Registrasi.
3. Petunjuk lupa password.
4. Ganti password wajib.
5. Daftar tiket User.
6. Buat tiket.
7. Detail tiket dan ruang percakapan.
8. Dashboard IT.
9. Histori tiket.
10. Pengelolaan akun oleh Super Admin.
11. Pengaturan password akun.

### Perilaku antarmuka

- Responsif untuk desktop dan mobile.
- Desktop mengutamakan tabel antrean; mobile tetap menyediakan informasi dan aksi utama.
- Form memiliki label, validasi, dan pesan error yang jelas.
- Semua aksi utama dapat digunakan melalui keyboard.
- Fokus keyboard terlihat dan kontras memenuhi WCAG AA.
- Tersedia keadaan loading, kosong, gagal, dan berhasil.
- Penutupan tiket, reset password, dan penonaktifan akun memerlukan konfirmasi.

## 9. Kebutuhan Nonfungsional

### Keamanan

- Seluruh komunikasi produksi menggunakan HTTPS.
- Otorisasi role dan kepemilikan dilakukan di backend.
- Sesi menggunakan cookie `HttpOnly`, `Secure`, dan kebijakan `SameSite` yang sesuai, dengan perlindungan CSRF.
- Password di-hash menggunakan algoritma yang sesuai, misalnya Argon2id.
- Query database menggunakan parameter.
- Pesan dan nama file dirender sebagai data, bukan HTML yang dapat dieksekusi.
- Password, cookie sesi, dan isi file tidak masuk log.
- Audit mencatat reset password, pengelolaan akun, perubahan prioritas, penanggung jawab, dan status.

### Keandalan

- Pesan yang telah dinyatakan terkirim tetap tersedia setelah reload.
- Tiket, percakapan, dan file memiliki backup.
- Proses pemulihan backup diuji sebelum produksi.
- Kesalahan sistem tidak boleh menyebabkan penutupan tiket tanpa solusi atau kehilangan pesan secara diam-diam.

### Performa — target usulan

- Dashboard dan daftar tiket tampil dalam maksimal dua detik pada jaringan internal normal.
- Pesan baru terlihat maksimal lima detik setelah berhasil disimpan.
- Daftar tiket dan histori pesan menggunakan pagination.
- Target jumlah pengguna bersamaan dan volume data ditetapkan sebelum uji beban; angka di atas belum merupakan SLA produksi.

## 10. Tech Stack

| Lapisan | Teknologi |
|---|---|
| Frontend | Svelte + TypeScript |
| Backend | Bun runtime + TypeScript |
| Database | PostgreSQL |
| Bahasa kode aplikasi | TypeScript |

### Batasan teknis

- Backend menggunakan Bun; tidak memerlukan runtime backend lain.
- **Usulan:** Gunakan HTTP server bawaan Bun untuk API MVP.
- Svelte menangani UI dan berkomunikasi dengan API Bun.
- PostgreSQL menyimpan data terstruktur serta metadata lampiran.
- File lampiran disimpan di penyimpanan privat dan persisten, bukan direktori sementara.
- **Usulan:** Gunakan volume privat untuk deployment satu server; object storage dipilih jika deployment membutuhkan beberapa instance.
- Tidak mewajibkan AI, Redis, microservices, atau framework backend tambahan untuk MVP.

SQL migration tetap dapat digunakan; ketentuan TypeScript berlaku untuk kode aplikasi.

## 11. Data Utama

| Entitas | Data penting |
|---|---|
| User | ID, nama lengkap, username, password hash, role, status aktif, wajib ganti password |
| Session | Pengguna, masa berlaku, status pencabutan |
| Ticket | Nomor unik, pelapor, judul, deskripsi, prioritas, status, penanggung jawab, waktu |
| Message | Tiket, pengirim, isi, waktu kirim |
| Attachment | Tiket/pesan terkait, pengunggah, nama asli, lokasi privat, tipe, ukuran |
| Resolution | Tiket, solusi, penutup, waktu penutupan |
| Audit Log | Pelaksana, aksi, objek terkait, waktu, perubahan yang relevan |

Ini merupakan model konseptual, bukan kewajiban membuat satu tabel untuk setiap entitas.

## 12. Risiko dan Keputusan yang Perlu Dikonfirmasi

| Topik | Usulan awal / risiko |
|---|---|
| Prioritas manual atau otomatis | Manual pada MVP; otomatis membutuhkan aturan dan penanganan salah klasifikasi. |
| FIFO vs urgensi | Urgensi lebih dahulu, lalu FIFO per prioritas. Tiket prioritas rendah berisiko lama menunggu; usia tiket harus terlihat. |
| Registrasi langsung aktif | Sebaiknya aplikasi internal/VPN. Jika publik, siapa pun dapat membuat akun User meski tidak dapat melihat tiket orang lain. |
| Reset password | Hanya Super Admin yang mengeksekusi; IT Staff dapat membantu verifikasi di luar aplikasi. |
| Lampiran | Usulan JPG, PNG, WebP, PDF; 10 MB/file; lima file/pengiriman. |
| Tiket Closed | Read-only; masalah lanjutan dibuat sebagai tiket baru pada MVP. |
| Retensi histori | Tidak ada penghapusan otomatis sampai kebijakan retensi disepakati. |
| Pemulihan Super Admin | Memerlukan prosedur operasional terpisah jika seluruh Super Admin kehilangan akses. |

## 13. Definition of Done MVP

MVP siap diterima ketika:

- Seluruh alur registrasi, login, pembuatan tiket, penanganan, percakapan, dan penutupan berhasil diuji end-to-end.
- Urutan urgensi dan FIFO terbukti sesuai aturan.
- Upload, download, dan penolakan lampiran tidak valid berjalan.
- Pengujian akses silang antar-user ditolak oleh backend.
- Pengambilan tiket bersamaan tidak menghasilkan konflik penanggung jawab.
- Reset password, pencabutan sesi, masa berlaku password sementara, dan wajib ganti password teruji.
- Tiket Closed mempertahankan histori dan tidak dapat dimodifikasi melalui fitur biasa.
- Light Mode dan Dark Mode tersedia, dapat diganti melalui toggle, dan tampil konsisten di seluruh halaman serta komponen.
- Kedua mode mengikuti gaya corporate, radius 8–12 px, responsivitas, dan aksesibilitas dasar, termasuk kontras WCAG AA.
- Backup serta pemulihan database dan lampiran telah diuji.
- Keputusan usulan yang memengaruhi scope telah disetujui sebelum implementasi.
