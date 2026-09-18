# Audit implementasi terhadap checklist

**Tanggal:** 17 September 2026

**Baseline:** commit `8599c70`

**Lingkup:** `tasks/todo.md` task 1–13, PRD, source backend/frontend, migration, dan pengujian existing.
**Metode:** pembacaan source, penelusuran request UI → API → SQL/file, unit test, build, Svelte diagnostics, dan reproduksi terisolasi tanpa database aplikasi. Tidak menggunakan subagent dan tidak mengubah source implementasi/checklist.

## Kesimpulan

**Checkpoint workflow dan klaim task 1–10 sudah selesai belum dapat diterima.** Implementasi dasar memang ada, tetapi lampiran, read-only Closed, audit transaksi, pengujian aman, dan beberapa kebutuhan dashboard/percakapan belum memenuhi acceptance yang dicentang.

Ini audit hasil implementasi, bukan penilaian model yang menulisnya. Design system baru belum diimplementasikan dan tidak dipakai untuk menyalahkan implementasi lama; temuan aksesibilitas/tema di bawah mengacu ke PRD yang sudah ada.

Prioritas:
- **P1:** keamanan, risiko kehilangan/kerusakan data, atau alur utama rusak. Selesaikan sebelum menerima checkpoint workflow.
- **P2:** kebutuhan fungsional, aksesibilitas, atau kualitas verifikasi yang belum terpenuhi.

Jenis bukti:
- **Reproduksi:** dijalankan pada audit ini; mock SQL disebutkan jika digunakan.
- **Source:** jalur masalah terlihat dalam kode; bukan klaim sudah direproduksi terhadap PostgreSQL nyata.
- **Belum diverifikasi:** memerlukan lingkungan test atau browser; tidak dinyatakan lulus.

## Hasil perintah

Dependency awal belum terpasang: `check`/`build` pertama gagal karena binary tidak ditemukan. Setelah `bun install --frozen-lockfile`, hasilnya:

| Pemeriksaan | Hasil |
|---|---|
| `bun install --frozen-lockfile` | Lulus, 51 package terpasang; lockfile tidak berubah |
| `bun test tests/*.test.ts` | **27 pass, 0 fail**, 7 file, 90 assertions |
| `bun run check` | Lulus, tetapi hanya `tsc` dan tidak memeriksa `.svelte` |
| `bun run build` | Lulus frontend dan backend |
| `bunx --no-install svelte-check --tsconfig ./tsconfig.json` | **3 errors**, 0 warnings |
| Reproduksi terisolasi | GET lampiran 405; limiter dapat diganti lewat header; cookie invalid melempar; HTTP 65 KiB mendapat 413 |
| Integration PostgreSQL | **Tidak dijalankan:** database target tidak terisolasi dan cleanup berbahaya |
| Browser desktop/mobile, keyboard, dua tema | **Tidak dijalankan dalam audit ini** |
| LSP tool | Tidak menghasilkan diagnostics yang dapat dipakai; server default yang tidak tersedia dilewati. CLI Svelte digunakan langsung |

Runtime aktual adalah **Bun 1.4.0**, sedangkan `package.json` mensyaratkan ≥1.4.2 dan README mengklaim 1.4.2. Hasil di atas berasal dari 1.4.0; ulangi pada runtime target sebelum penerimaan akhir. Tidak melakukan upgrade runtime global dalam audit ini.

## Temuan

### A01 — P1: Integration test dapat menghapus audit log aplikasi nyata

**Lokasi:** `tests/dashboard.integration.ts:8–22,57`; pola database yang sama juga ada pada seluruh `tests/*.integration.ts`.

Test memakai `readConfig(process.env)` → `DATABASE_URL`, bukan database test khusus. Cleanup dashboard menjalankan:

```sql
DELETE FROM audit_logs
WHERE reason LIKE 'TEST_AUDIT_%' OR reason LIKE 'Tiket diambil oleh%';
```

Alasan claim produksi di `src/server/app.ts:444–452` adalah `Tiket diambil oleh staf IT untuk penanganan.` sehingga cocok dengan cleanup ini. Menjalankan suite dashboard pada database development yang berisi pekerjaan nyata akan menghapus audit claim nyata juga. Prefix cleanup lain menggunakan `LIKE` dengan underscore wildcard dan bukan isolasi yang kuat.

**Bukti:** source. Suite integration sengaja tidak dijalankan. Jangan menafsirkan unit test yang lulus sebagai izin menjalankan integration terhadap `.env` existing.

**Perbaikan minimum:** koneksi test eksplisit ke database terpisah; fail closed bila target sama dengan aplikasi; fixture diisolasi dan cleanup berdasarkan ID milik run. Tambahkan script integration tersendiri dan dokumentasikan cara aman. Task terkait: 1, 7, 13a.

### A02 — P1: Daftar lampiran tidak pernah bisa diakses

**Lokasi:** `src/server/app.ts:724–735,889–890`; pemanggil `src/web/TicketDetail.svelte:31–47`.

Matcher upload `/api/tickets/:id/attachments` berjalan lebih dahulu untuk semua metode. GET ditolak 405 sebelum mencapai route list yang memakai path sama. Akibatnya lampiran laporan awal tidak muncul di detail. UI mengabaikan kegagalan `resAtt` sehingga masalah terlihat seperti tidak ada lampiran.

**Bukti reproduksi:** pemanggilan `handleRequest` dengan sesi valid dari mock SQL menghasilkan **405** pada GET lampiran. Tidak memerlukan database untuk membuktikan dispatch route salah.

**Perbaikan minimum:** satu dispatcher GET/POST untuk path ini atau batasi matcher upload ke POST; tampilkan error list attachment. Tambahkan regression test GET. Task terkait: 9a, 9b, 10.

### A03 — P1: Batas HTTP 64 KB mematahkan janji upload 10 MB/file

**Lokasi:** `src/server/index.ts:12`; `src/server/attachments.ts:4–5`; form tiket/percakapan.

Server memakai `maxRequestBodySize: 64 * 1024`, sedangkan UI/API menerima hingga lima file masing-masing 10 MB. Body multipart di atas 64 KB ditolak server sebelum validasi upload.

**Bukti reproduksi:** server Bun terisolasi dengan konfigurasi limit yang sama mengembalikan **413** untuk body 65 KiB. Ini pengujian HTTP nyata atas limit, bukan upload end-to-end pada server aplikasi. Test upload existing memanggil handler langsung dan memakai file beberapa byte, sehingga tidak menangkap batas transport ini.

**Perbaikan minimum:** batas body terukur untuk batch file + overhead multipart, sambil menjaga batas endpoint JSON dan validasi per-file. Test HTTP melalui `Bun.serve`, bukan handler saja. Task terkait: 9a, 9b.

### A04 — P1: Tiket Closed masih dapat dimutasi melalui race condition

**Lokasi:** `src/server/app.ts:493–511` (prioritas), `636–710` (pesan), `738–816` (lampiran), `588–620` (close).

Pesan, prioritas, dan upload membaca status dahulu, lalu melakukan write terpisah tanpa mengunci row tiket atau mengecek status lagi secara atomik. Contoh urutan:

1. Request pesan/upload/prioritas membaca tiket masih aktif.
2. Request close menyimpan solusi dan commit status Closed.
3. Request pertama tetap menyimpan pesan/lampiran/prioritas.

Transaksi di close hanya menjamin solusi + status + audit close; tidak otomatis melindungi writer lain. Test resolution existing hanya mengirim request setelah close selesai, bukan menguji perlombaan close dengan writer.

**Bukti:** analisis transaksi/source, belum uji concurrency PostgreSQL.

**Perbaikan minimum:** semua mutasi mengunci row tiket yang sama dalam transaksi, validasi status di dalamnya, kemudian write. Upload perlu validasi ulang saat commit metadata dan cleanup file bila tiket sudah ditutup. Tambahkan test interleaving deterministik. Task terkait: 8, 9a, 10.

### A05 — P1: `messageId` upload tidak divalidasi kepemilikan dan keterkaitannya

**Lokasi:** `src/server/app.ts:774,810–814,660–680`; `migrations/006_attachments.sql:5–6`.

Upload hanya memeriksa hak atas tiket di URL, kemudian menerima `messageId` dari form tanpa memastikan pesan tersebut milik tiket yang sama dan dapat dimodifikasi oleh pengunggah. Foreign key hanya mengecek pesan ada. Pengambilan percakapan melakukan join attachment berdasarkan `message_id` saja.

User dapat mengunggah ke tiketnya sendiri sambil menunjuk ID pesan tiket orang lain. Metadata file tersebut akan ikut muncul di percakapan tiket lain. Ini memungkinkan penyisipan metadata/lampiran lintas tiket, termasuk pesan pada tiket Closed. Pada tiket yang sama, user juga dapat menempelkan file ke pesan orang lain sehingga atribusi percakapan menyesatkan.

**Bukti:** source dan relasi SQL. Ini **bukan** bukti file korban dapat diunduh; download tetap mengecek `attachment.ticket_id`.

**Perbaikan minimum:** cek pesan berada di tiket URL, pengirim/aturan upload sesuai, dan status aktif dalam transaksi yang sama; tambahkan constraint relasi yang sesuai bila dipakai. Test cross-ticket, cross-sender, dan Closed. Task terkait: 9a, 9b, 10.

### A06 — P1: Upload batch dapat meninggalkan metadata yang menunjuk file terhapus

**Lokasi:** `src/server/app.ts:802–828`.

Semua file disimpan lalu metadata diinsert satu per satu tanpa transaksi. Jika insert kedua gagal, insert pertama sudah commit, tetapi catch menghapus seluruh file pada `savedFiles`. Database kemudian menunjuk file yang tidak ada. Pesan mentah `err.message` juga dikembalikan sebagai 422, termasuk kesalahan database/storage yang bukan validasi pengguna.

**Bukti:** source, belum fault injection database/filesystem.

**Perbaikan minimum:** transaksi batch metadata, cleanup terkoordinasi, error internal generik dengan status yang tepat. Test kegagalan insert kedua, write file, dan cleanup. Task terkait: 9a.

### A07 — P1: Login limiter mudah dilewati; registrasi tanpa limiter

**Lokasi:** `src/server/app.ts:98–148,154–163`; `src/server/index.ts:13`; `src/server/rate-limit.ts`.

Login mengambil key langsung dari header `X-Forwarded-For`. Tidak ada trusted-proxy policy atau identitas socket dari server. Klien yang dapat mencapai API dapat mengganti header untuk memperoleh kuota baru. Tanpa header, semua pengguna berbagi key `127.0.0.1`. Registrasi sama sekali tidak memanggil limiter walau menjalankan hashing password yang mahal.

**Bukti reproduksi:** limiter satu percobaan dengan header `a`, `a`, `b` menghasilkan **422, 429, 422**; mengganti header menghindari limit. Registrasi: source.

**Perbaikan minimum:** identitas koneksi tepercaya; hanya terima forwarding header dari proxy yang dikonfigurasi dan menimpanya. Terapkan pembatasan login dan registrasi, plus batas input. Test header spoofing dan batas registrasi. Task terkait: 3–4 / FR-01.

### A08 — P2: Claim dan koreksi prioritas tidak atomik dengan audit

**Lokasi:** `src/server/app.ts:410–454,493–525`.

UPDATE dan INSERT audit adalah query independen. Jika audit gagal, tiket sudah berubah tetapi API mengembalikan 500 dan histori wajib hilang. Dua koreksi prioritas bersamaan juga dapat mencatat `old_value` yang sudah kedaluwarsa karena pembacaan awal tidak dikunci.

**Bukti:** source. Conditional UPDATE claim sudah benar untuk mencegah dua pemenang pengambil, tetapi tidak menjamin audit atomik.

**Perbaikan minimum:** transaksi mutasi + audit; kunci/read state di transaksi untuk perubahan prioritas. Test audit insert gagal dan prioritas concurrent. Task terkait: 7, 10.

### A09 — P2: Recovery upload UI menghilangkan pilihan file atau membuat kiriman duplikat

**Lokasi:** `src/web/Conversation.svelte:74–123`; `src/web/CreateTicket.svelte:68–113`.

- Chat membuat pesan dahulu, lalu upload. Jika upload mengembalikan non-2xx, UI menampilkan error tetapi tetap mengosongkan teks dan pilihan file. Tidak ada retry upload ke pesan yang sudah tercipta.
- Jika jaringan putus setelah pesan berhasil disimpan, retry membuat pesan baru, bukan melanjutkan lampiran.
- Tiket dibuat dahulu. Jika upload throw setelah create berhasil, form masih dapat disubmit sebagai tiket baru. Jika upload gagal non-2xx, UI alert lalu pindah halaman, tanpa recovery file.
- Pesan lampiran saja diakali dengan teks `(Lampiran dikirim)`; backend masih menolak pesan kosong karena `hasAttachments` tidak digunakan pada pemanggil validasi.

**Bukti:** source, belum simulasi browser/network.

**Perbaikan minimum:** pertahankan ID hasil create dan state pending file; retry upload pada objek yang sama. Bedakan create gagal vs upload gagal dan jangan menghapus pilihan yang belum tersimpan. Task terkait: 8, 9b.

### A10 — P2: Pagination percakapan dan kelengkapan dashboard belum diimplementasikan

**Lokasi:** `src/server/app.ts:348–384,648–684`; `src/web/Conversation.svelte:50–59,127–132`; `src/web/Dashboard.svelte:32–36,180–213,235–278`.

- GET messages mengambil **semua pesan**, tanpa limit/cursor/page; frontend mengganti seluruh array setiap polling 4 detik. Task 8 mencentang pagination padahal belum ada.
- Antrean IT juga mengambil seluruh tiket aktif tanpa pagination.
- `searchQuery` dashboard ada di script tetapi tidak memiliki input di markup.
- Filter penanggung jawab tertentu tidak ada, hanya checkbox ditangani sendiri/belum diambil.
- Waktu pembuatan ada, tetapi usia tiket tidak ditampilkan.
- Audit log hanya ditulis; tidak ada endpoint/UI histori perubahan prioritas dan penanganan yang dapat dibaca pengguna berhak.
- Closed dapat dibuka dari daftar umum, tetapi belum ada filter Closed/halaman histori tersendiri.

**Bukti:** source. Jangan menyamakan keberadaan query pencarian backend dengan fitur UI sudah tersedia.

**Perbaikan minimum:** pagination server/client, expose input/filter wajib, tampilkan usia dan histori aktivitas yang diotorisasi. Task terkait: 7, 8, 10.

### A11 — P2: Quality gate melewatkan error Svelte

**Lokasi:** `package.json:11`; `tsconfig.json:17`.

`check` hanya `tsc --noEmit` dengan include `*.ts`. Pemeriksaan Svelte nyata menemukan:

1. `src/web/Conversation.svelte:17`: `draftBackup` ditulis tetapi tidak pernah dibaca.
2. `src/web/Dashboard.svelte:11`: `currentUser` tidak dipakai.
3. `src/web/App.svelte:276`: `currentUser` berpotensi null pada callback.

**Bukti:** command `svelte-check` dijalankan dan exit nonzero. Build bundler yang lulus bukan bukti seluruh TypeScript frontend valid.

**Perbaikan minimum:** tambahkan `svelte-check` yang sudah terpasang ke script check, perbaiki ketiga diagnostic. Task terkait: 1–2 dan seluruh checkpoint frontend.

### A12 — P2: Acceptance keyboard, modal, dan kontras belum terpenuhi

**Lokasi:** `src/web/Dashboard.svelte:249`; `src/web/TicketDetail.svelte:195–202`; `src/web/Conversation.svelte:215–232`; `src/web/app.css:20–31`; warna badge pada Dashboard/TicketList/TicketDetail.

- Row dashboard hanya `onclick`; judul tiket bukan link/button dan tidak memiliki jalur keyboard untuk membuka detail. Tombol row hanya claim/prioritas.
- Dialog menggunakan div `aria-modal`, tetapi tidak memindahkan/menahan/mengembalikan fokus. Escape hanya tertangkap jika event kebetulan berada dalam subtree dialog.
- File input chat `display:none` dipicu label berikon yang tidak dapat difokuskan keyboard. Textarea pesan hanya memakai placeholder tanpa label aksesibel eksplisit.
- Dark primary `#3B82F6` dengan teks putih menghasilkan sekitar **3.68:1**, di bawah 4.5:1 untuk label tombol ukuran normal. Badge amber `#CA8A04` pada latar terang juga perlu koreksi.

**Bukti:** struktur source; kontras primary dihitung berdasarkan nilai warna, bukan screenshot. Uji browser/focus lengkap masih diperlukan. Layout mobile hanya sebagian adaptif (sidebar ditumpuk, tabel scroll), belum ada bukti semua aksi nyaman/terjangkau.

**Perbaikan minimum:** link/button semantik, dialog native atau focus management lengkap, file control keyboard-accessible, label textarea, token kontras AA. Task terkait: 2, checkpoint UI, 13a.

### A13 — P2: Error request dapat keluar dari envelope JSON yang dijanjikan

**Lokasi:** `src/server/auth.ts:113–120`; `src/server/app.ts:246,287–292,636–639,738–741`; `src/server/index.ts:13`.

`decodeURIComponent` pada cookie dapat throw; beberapa lookup session/tiket juga dilakukan di luar try/catch. Server tidak membungkus seluruh handler dengan error boundary aplikasi. Cookie invalid atau database gagal dapat melewati respons JSON generik, lalu bergantung pada fallback runtime.

**Bukti reproduksi:** `Cookie: session_id=%` pada `/api/auth/me` membuat handler reject dengan `URIError`. Dampak isi respons HTTP produksi belum diuji; tidak menyatakan stack/secret sudah bocor.

**Perbaikan minimum:** parsing cookie tahan input invalid, global error boundary generik dengan logging aman. Task terkait: 1, 4, 13a.

### A14 — P2: Validasi ekstensi upload tidak sesuai acceptance

**Lokasi:** `src/server/app.ts:779–797`; `src/server/attachments.ts:90–97`.

Upload memeriksa magic bytes tetapi tidak memvalidasi ekstensi nama atau kesesuaiannya dengan jenis konten. Nama berakhiran `.exe` dengan header PNG diterima; pembuat filename justru mempertahankan ekstensi tersebut. Ini melanggar klaim validasi ekstensi/MIME/signature task 9a. Signature juga hanya identifikasi prefix, bukan bukti keseluruhan file valid.

**Bukti:** source. Tidak menyatakan file dieksekusi server; storage tetap privat dan download memakai tipe konten terdeteksi.

**Perbaikan minimum:** whitelist ekstensi dan mapping tipe terdeteksi, nama storage berdasarkan tipe tervalidasi, error yang jelas. Test mismatch extension/content dan file malformed. Task terkait: 9a.

## Matriks checklist aktual

“Parsial” berarti implementasi ada tetapi acceptance belum terpenuhi; “belum diverifikasi” bukan sinonim gagal.

| Task | Checklist existing | Penilaian audit |
|---|---|---|
| 1 Toolchain/database | Dicentang | Parsial: unit/API/build ada, runtime berbeda, Svelte gate belum masuk; DB tidak diperiksa ulang |
| 2 Shell/tema | Dicentang | Parsial: tema dan shell ada; keyboard/kontras perlu perbaikan; browser belum diverifikasi |
| 3 Registrasi | Dicentang | Fondasi ada: validasi NIK string, hash, unique index, role server-side; rate limit registrasi belum ada; integration tidak dijalankan |
| 4 Login/sesi | Dicentang | Parsial: cookie/session/CSRF ada; limiter tidak tepercaya dan malformed cookie belum ditangani |
| 5 Bootstrap admin | Dicentang | Script dan unit test ada; README belum mendokumentasikan alurnya; real DB belum diverifikasi |
| 6 Tiket pengguna | Dicentang | Create/list/detail dan pagination daftar ada; unit test akses ada; real DB/concurrency belum diverifikasi ulang |
| 7 Dashboard/claim | Dicentang | Parsial: urutan urgensi/FIFO dan conditional claim ada; audit tidak atomik, UI/filter/usia belum lengkap |
| 8 Percakapan | Dicentang | Parsial: polling dan pesan ada; pagination tidak ada, race Closed dan recovery belum aman |
| 9a Storage privat | Dicentang | Tidak memenuhi acceptance: A02–A06, A14; batas HTTP salah |
| 9b Upload UI | Dicentang | Tidak memenuhi acceptance: lampiran laporan awal tidak tampil, recovery gagal belum benar |
| 10 Solusi/histori | Dicentang | Parsial: close+solusi+audit dalam transaksi ada; read-only concurrent tidak terjamin; histori aktivitas belum tersedia |
| 11 Administrasi IT | Belum dicentang | Memang belum tersedia: tidak ditemukan modul/route/UI admin sesuai scope |
| 12a Reset/password API | Belum dicentang | Memang belum tersedia; field mustChangePassword ada tetapi belum enforced oleh protected routes |
| 12b UI recovery | Belum dicentang | Memang belum tersedia |
| 13a Hardening | Belum dicentang | Belum selesai; temuan audit ini menjadi input |
| 13b Operasional | Belum dicentang | Belum selesai; backup/restore/deployment tidak diuji |

Task 11–13 yang masih unchecked bukan klaim selesai palsu. Sebaliknya, checkpoint akun/tiket/workflow yang checked harus diperlakukan **belum diterima ulang** sampai gap relevan ditutup. Dokumen checklist asli tidak diubah dalam audit ini agar status implementor dan penilaian audit tetap dapat dibandingkan.

## Yang sudah baik

- Query utama menggunakan parameter, bukan interpolasi SQL mentah dari input pengguna.
- Registrasi menentukan role User di server dan memakai Argon2id.
- Unique index username case-insensitive dan sequence nomor tiket menyediakan fondasi integritas concurrency.
- Session memeriksa expiry dan akun aktif; cookie HttpOnly/SameSite, Secure saat production.
- Claim memakai conditional UPDATE, bukan read-then-write tanpa kondisi.
- Close menyimpan solusi, status, dan audit dalam satu transaksi.
- Download file memeriksa hak berdasarkan tiket, tidak memberikan URL publik permanen.
- Tidak ada alasan untuk rewrite seluruh project; perbaiki jalur bersama dan regression test yang hilang.

## Urutan perbaikan yang disarankan

1. **Amankan integration test dahulu (A01)**, sediakan database test terpisah. Jangan membersihkan data aplikasi untuk memudahkan suite.
2. **Perbaiki attachment end-to-end (A02, A03, A05, A06, A09, A14)**: route, transport, ownership relasi, transaksi batch, recovery UI.
3. **Tutup race dan integritas audit (A04, A08)** dengan locking/transaction bersama; uji close vs pesan/upload/prioritas.
4. **Perbaiki authentication boundary (A07, A13)**: trusted client identity, registrasi limiter, cookie/error handling.
5. **Tutup gap fitur dan quality gate (A10–A12)**, lalu verifikasi browser desktop/mobile kedua tema.
6. Setelah bukti tersedia, koreksi checklist dan README; baru lanjut administrasi/reset password. Jangan mengklaim MVP selesai berdasarkan build saja.

## Batas audit dan bukti reproduksi

Script reproduksi sementara tersimpan saat audit di `/tmp/it-service-desk-audit.ts`; jalankan `bun /tmp/it-service-desk-audit.ts` selama file tersebut masih ada. Script tidak terkoneksi database, hanya memakai mock SQL dan server HTTP loopback port acak. Ia mengonfirmasi perilaku salah saat ini, **bukan regression suite yang diharapkan tetap lulus setelah bug diperbaiki**.

Untuk reproduksi permanen setelah perbaikan, buat test dengan ekspektasi benar: GET lampiran 200/403 sesuai akses; client header tidak mengganti identitas tepercaya; cookie invalid tidak melempar; ukuran upload valid diterima via HTTP. Race, relasi SQL, rollback batch, dan keamanan fixture memerlukan PostgreSQL test terpisah.

Tidak dilakukan perubahan database, migrasi, bootstrap akun, full integration suite, upgrade runtime, commit, atau push pada saat audit awal.

## Status remediasi — 18 September 2026

Audit ditindaklanjuti pada source setelah laporan awal. Status berikut menggantikan kesimpulan “belum diperbaiki” di atas, tetapi tidak mengubah bukti kondisi awal.

| Temuan | Status dan bukti |
|---|---|
| A01 | Selesai: integration runner mewajibkan database `_test`, menolak database aplikasi, memakai schema unik per file, dan membersihkan schema sendiri. |
| A02–A06, A14 | Selesai: dispatch GET lampiran, batas HTTP upload, lock tiket, relasi pesan/tiket/pengirim, transaksi upload, validasi ekstensi/MIME/signature, cleanup, dan retry idempotent diperbaiki. |
| A07, A13 | Selesai: limiter memakai alamat socket tepercaya, registrasi ikut dibatasi, input hash dibatasi, cookie invalid dan exception global menghasilkan JSON generik. |
| A08 | Selesai: claim/prioritas dan audit berada dalam transaksi; fault-injection membuktikan rollback. |
| A09 | Selesai: UI mempertahankan draft/file dan memakai request/upload ID yang sama saat retry; fixture browser membuktikan create tidak diulang. |
| A10 | Selesai untuk scope task 7–10: pagination pesan/antrean, pencarian, filter penanggung jawab/status, usia tiket, histori aktivitas, dan daftar Closed tersedia. |
| A11 | Selesai: `bun run check` menjalankan TypeScript dan `svelte-check`; 0 error/0 warning. |
| A12 | Selesai untuk jalur yang diaudit: link tiket keyboard, dialog native/focus restore, input file dan textarea berlabel, token semantik AA, tanpa overflow pada 320/360/390/768/1024/1440 px. |

Bukti akhir: **33 unit test lulus**, **38 integration test lulus** pada PostgreSQL database terpisah, check/Svelte diagnostics lulus, build lulus. Browser fixture memverifikasi dua alur retry upload, fokus dialog, histori, usia/filter, dan reflow. Task admin/reset password/operasional yang sejak awal belum dicentang tetap di luar remediasi ini.
