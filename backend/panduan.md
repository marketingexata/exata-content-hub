# Menghubungkan Exata Content Hub ke Google Sheets

Dashboard dapat dicoba menggunakan data contoh. Untuk login tim dan penyimpanan bersama, hubungkan backend berikut. Data contoh di browser tidak otomatis masuk ke Spreadsheet.

## 1. Siapkan Spreadsheet

1. Buat Google Spreadsheet kosong, misalnya **Exata Content Database**.
2. Buka **Ekstensi → Apps Script** dari Spreadsheet tersebut. Gunakan project yang terikat ke Spreadsheet ini.
3. Hapus isi `Code.gs` bawaan, kemudian salin seluruh isi file **Code.gs** yang tersedia bersama panduan ini.
4. Simpan. Pastikan project memakai runtime **V8** (default Apps Script).
5. Pilih fungsi **setupSpreadsheet**, lalu klik **Run / Jalankan**. Berikan izin Google yang diminta untuk Spreadsheet milik Anda.
6. Empat tab akan dibuat otomatis: **Users**, **Content**, **Insights**, dan **History**. Fungsi ini tidak menghapus baris yang sudah ada. Pada database versi lama, kolom baru ditambahkan di sebelah kanan secara otomatis. Jangan mengganti nama tab atau urutan header.

`setupSpreadsheet()` menyimpan ID Spreadsheet dan pepper autentikasi di **Project Settings → Script Properties**. Jangan menghapus atau membagikan `PASSWORD_PEPPER`: penghapusannya membuat seluruh hash kata sandi lama tidak dapat diverifikasi dan akun perlu direset.

## Memperbarui database versi lama

Jika dashboard sebelumnya sudah terhubung, jangan membuat Spreadsheet pengganti dan jangan menghapus tab lama.

1. Salin versi baru `Code.gs` ke project Apps Script yang sama.
2. Jalankan **setupSpreadsheet()** sekali lagi. Header lama yang sesuai dipertahankan; kolom referensi, metrik tambahan, dan timestamp ditambahkan di kanan. Tab **History** dibuat jika belum ada. Seluruh baris lama, akun, hash, salt, dan pepper tetap dipertahankan.
3. Jika ada header yang pernah diganti atau dipindah manual, migrasi berhenti untuk sheet tersebut dengan pesan yang jelas; data tidak ditimpa. Pulihkan nama dan urutan header sebelum mengulang.
4. Pilih **Deploy → Manage deployments → Edit → New version → Deploy**. Gunakan URL `/exec` yang sama pada dashboard.
5. Lakukan sinkronisasi. Riwayat baru mulai dicatat sejak backend versi ini dipasang; perubahan lama tidak direkonstruksi seolah-olah pernah terekam.

## 2. Buat akun tim

1. Biarkan Spreadsheet terbuka dan jalankan fungsi **createUser** dari editor Apps Script. Alternatifnya, muat ulang Spreadsheet lalu pilih menu **Exata Content Hub → Tambah / reset akun**.
2. Isi nama, email, kata sandi baru minimal **12 karakter**, dan peran, kemudian klik **Simpan akun**.
3. Kata sandi dimasukkan ke kolom tersamarkan. Spreadsheet menyimpan salt dan hash PBKDF2-HMAC-SHA256 (100.000 iterasi, ditambah pepper server), bukan kata sandi asli. Proses ini dapat memerlukan beberapa detik.
4. Ulangi untuk anggota tim lainnya.

Peran **admin** dan **editor** dapat membuat, mengubah, serta menghapus konten dan menginput insight. **Viewer** hanya dapat membaca dan mengekspor. Pengelolaan akun dilakukan oleh editor Spreadsheet melalui dialog tersebut, bukan melalui dashboard.

Untuk mereset kata sandi atau mengganti peran/nama, jalankan dialog lagi dengan email yang sama. Reset mencabut seluruh sesi akun itu. Untuk menonaktifkan akun, ubah kolom `active` menjadi `FALSE` di tab Users. Jangan mengubah `id`, `salt`, `passwordHash`, atau `iterations` secara manual.

## 3. Deploy Apps Script sebagai Web App

1. Klik **Deploy → New deployment / Deployment baru**.
2. Pilih jenis **Web app**.
3. **Execute as / Jalankan sebagai:** pilih **Me / Saya** (pemilik Spreadsheet).
4. **Who has access / Siapa yang dapat mengakses:** pilih **Anyone / Siapa saja**. Dashboard memverifikasi akun melalui backend; login Google pada endpoint akan mengganggu permintaan dari dashboard.
5. Klik **Deploy**, selesaikan otorisasi, lalu salin **Web app URL** dengan bentuk `https://script.google.com/macros/s/…/exec`.
6. Gunakan URL `/exec` tersebut, bukan URL editor atau `/dev`.

Walaupun endpoint dapat dijangkau publik, data tim hanya dikembalikan sesudah autentikasi. `GET` pada endpoint hanya menampilkan status layanan tanpa isi Spreadsheet. Jangan memublikasikan Spreadsheet, dan berikan akses edit hanya kepada administrator yang dipercaya karena editor dapat melihat hash, mengubah data, serta menjalankan kode. Anggota tim yang hanya memakai dashboard tidak perlu diberi akses langsung ke file Spreadsheet.

Jika organisasi Google Workspace tidak mengizinkan deployment **Anyone**, admin Workspace perlu mengizinkannya atau backend perlu diubah agar memakai autentikasi Google organisasi. Dashboard statis ini tidak bisa menembus kebijakan tersebut.

## 4. Hubungkan dashboard

1. Buka **Pengaturan / Integrasi** pada dashboard.
2. Tempel Web app URL `/exec`, lalu simpan konfigurasi.
3. Masuk menggunakan email dan kata sandi yang dibuat pada langkah 2.
4. Tambahkan satu konten percobaan, lalu periksa tab **Content**. Tambahkan insight untuk konten itu dan periksa tab **Insights**.
5. Coba keluar dan masuk kembali untuk memastikan database yang sama dimuat.

Endpoint bukan kunci rahasia; akun dan sesi tetap diperlukan untuk setiap operasi data. Dashboard mengirim JSON dengan `Content-Type: text/plain;charset=utf-8` agar dapat menggunakan redirect dan CORS Apps Script tanpa preflight. Jangan mengganti menjadi mode `no-cors` karena respons tidak akan dapat dibaca.

## Model data

| Tab | Kolom |
| --- | --- |
| Users | `id`, `email`, `name`, `salt`, `passwordHash`, `iterations`, `role`, `active` |
| Content | `id`, `title`, `division`, `platform`, `format`, `status`, `date`, `time`, `owner`, `caption`, `url`, `referenceUrl`, `createdAt`, `updatedAt` |
| Insights | `id`, `contentId`, `date`, `views`, `reach`, `likes`, `comments`, `shares`, `saves`, `followers`, `profileVisits`, `accountsEngaged`, `watchTimeSeconds`, `avgWatchTimeSeconds`, `completionRate`, `skipRate`, `replies`, `linkClicks`, `tapsForward`, `tapsBack`, `nextStory`, `exits`, `source`, `notes`, `createdAt`, `updatedAt` |
| History | `id`, `entityType`, `entityId`, `action`, `at`, `actorName`, `actorEmail`, `before`, `after` |

- Divisi: **Exata AI, Exata MT, Exata SN, JP Smart, JLCT, J-Expert**.
- Platform: **Instagram** atau **TikTok**.
- Status: **Draft, Review, Terjadwal, Terbit**.
- Tanggal menggunakan `YYYY-MM-DD`; waktu menggunakan `HH:mm`. Kalender menyimpan waktu sesuai input tim, tanpa konversi zona otomatis. Sepakati zona kerja tim (misalnya WIB) dan setel zona Spreadsheet melalui **File → Settings**.
- Insight terhubung ke satu konten. Satu kombinasi `contentId + date` hanya memiliki satu catatan; input ulang memperbarui catatan itu.
- Angka insight merupakan total kumulatif konten **pada tanggal pengukuran**, bukan pertambahan harian. Untuk rekap performa beberapa tanggal, gunakan pengukuran terbaru setiap konten agar tidak menghitung total kumulatif berulang.
- Menghapus konten juga menghapus seluruh insight aktif terkait. Snapshot terakhir sebelum penghapusan tetap tercatat di tab History untuk setiap insight dan kontennya. Pemulihan otomatis belum tersedia; gunakan catatan History atau riwayat versi Spreadsheet untuk pemulihan manual.
- Teks yang dimasukkan melalui API diperlakukan sebagai nilai literal untuk mencegah formula berjalan di Spreadsheet.

## Metrik insight dan nilai yang tidak tersedia

Metrik disimpan sebagai snapshot kumulatif per konten pada tanggal data. Nama dan ketersediaan metrik dapat berbeda menurut platform, format, versi aplikasi, dan jenis akun. Isi hanya angka yang benar-benar terlihat pada insight konten yang bersangkutan. Nilai yang tidak tersedia dibiarkan kosong (`null` dari API), **bukan diisi nol**. Nol berarti platform memang menampilkan angka 0.

| Properti | Arti / satuan |
| --- | --- |
| `views` | Jumlah tayangan / post views |
| `reach` | Accounts reached / akun dijangkau jika tersedia di platform |
| `likes`, `comments`, `shares`, `saves` | Jumlah suka, komentar, dibagikan, disimpan / favorit |
| `followers` | Pengikut baru / follows dari konten |
| `profileVisits` | Kunjungan profil dari konten |
| `accountsEngaged` | Akun yang berinteraksi, jika ditampilkan |
| `watchTimeSeconds` | Total waktu tonton / total play time, disimpan dalam **detik**; dapat desimal |
| `avgWatchTimeSeconds` | Rata-rata waktu tonton, disimpan dalam **detik**; dapat desimal |
| `completionRate` | Watched full video, persentase **0–100**, bukan rasio 0–1 |
| `skipRate` | Skip rate, persentase **0–100**, jika tersedia |
| `replies`, `linkClicks` | Balasan dan ketukan tautan Story |
| `tapsForward`, `tapsBack`, `nextStory`, `exits` | Navigasi Story sesuai label di Instagram |
| `source` | `manual` atau `ocr`; menunjukkan asal pengisian, bukan klaim verifikasi dari platform |
| `notes` | Catatan pemeriksaan, maksimal 2.000 karakter |

Semua hitungan merupakan bilangan bulat ≥0, maksimal 10¹²; durasi dapat desimal dan persentase dibatasi 0–100. Setidaknya satu metrik perlu diisi. Mengubah snapshot lama dengan properti yang tidak dikirim akan mempertahankan nilai lama properti itu; mengirim `null` mengosongkannya. Konten dan tanggal data pada snapshot yang sudah dibuat tidak dapat dipindah; buat laporan baru untuk kombinasi lain.

## Referensi konten dan history

`url` adalah tautan konten/aset dan `referenceUrl` adalah tautan referensi inspirasi yang terpisah. Keduanya hanya menerima URL HTTP/HTTPS. Dashboard menampilkan referensi dalam popup; beberapa situs membatasi penyematan sehingga perlu dibuka di tab sumber.

History mencatat **CREATE, UPDATE, DELETE** untuk konten dan insight, lengkap dengan waktu UTC ISO, pengguna yang melakukan aksi, serta data sebelum/sesudah. Data sebelum/sesudah disimpan sebagai JSON; tidak ada kata sandi, token, atau gambar screenshot dalam log. Riwayat bersifat append-only melalui API: anggota tim termasuk editor/admin dashboard tidak memiliki endpoint untuk mengubah atau menghapusnya. Editor/pemilik Spreadsheet tetap memiliki kendali langsung atas file Google, sehingga History ini bukan log anti-manipulasi terhadap administrator Spreadsheet.

History tetap ada setelah konten atau insight aktif dihapus. Untuk data lama, `createdAt` bisa kosong karena tanggal pembuatan aslinya tidak diketahui. `updatedAt` mulai terisi ketika data diubah melalui versi baru. Mengedit sel Google Sheets langsung tidak memicu history aplikasi.

Operasi dashboard diserialisasi dengan ScriptLock. Google Sheets tidak menyediakan transaksi lintas-sheet dalam implementasi ini; gangguan layanan saat operasi menulis dapat membutuhkan pemeriksaan History dan data aktif oleh admin.

## OCR screenshot

OCR dijalankan lokal di browser untuk membantu membaca screenshot insight Instagram/TikTok. Screenshot tidak dikirim ke Apps Script, dan backend tidak menyimpan gambar maupun teks mentah screenshot. Hanya nilai metrik yang sudah diperiksa pengguna, sumber `ocr`, dan catatan yang dikirim saat **Simpan insight**.

Periksa label, angka, separator ribuan/desimal, satuan durasi, dan platform sebelum menyimpan. Angka yang tidak terdeteksi tidak boleh dianggap nol. OCR membantu pengisian dan tidak menjamin hasil 100% benar pada screenshot kabur, terpotong, berbahasa berbeda, atau tata letak yang berubah.

## Kontrak API

Semua panggilan data memakai POST berisi JSON. Respons selalu JSON; cek `ok`, bukan hanya status HTTP karena keterbatasan ContentService Apps Script.

```json
{"action":"login","email":"anggota@perusahaan.id","password":"kata-sandi-pengguna"}
```

Respons sukses: `{ "ok": true, "token": "…", "user": { "id": "…", "email": "…", "name": "…", "role": "editor" }, "expiresAt": 1790000000000 }`.

| Action | Properti permintaan | Respons sukses tambahan |
| --- | --- | --- |
| `bootstrap` | `token` | `user`, `contents`, `insights`, `history` |
| `saveContent` | `token`, `content` | `content`, `history` (entri baru) |
| `deleteContent` | `token`, `id` | `id`, `history` (termasuk penghapusan insight terkait) |
| `saveInsight` | `token`, `insight` | `insight`, `history` (entri baru) |
| `logout` | `token` | — |

Konten baru boleh tidak memiliki `id` (backend membuat UUID), atau memakai ID baru dari klien. ID yang sama memperbarui konten tersebut. Insight baru boleh tidak memiliki `id`; gunakan ID dari respons untuk penyimpanan berikutnya. Nama properti dan enum peka huruf besar/kecil.

Objek History dari API berbentuk:

```json
{"id":"…","entityType":"content","entityId":"…","action":"UPDATE","at":"2026-11-05T12:00:00.000Z","actorName":"Nama anggota","actorEmail":"anggota@perusahaan.id","before":{"id":"…","title":"Judul lama"},"after":{"id":"…","title":"Judul baru"}}
```

`entityType` adalah `content` atau `insight`; `before` bernilai `null` untuk CREATE dan `after` bernilai `null` untuk DELETE. Nilai `before`/`after` di API sudah berupa objek, bukan string JSON. Respons mutasi mengembalikan array `history` berisi catatan baru agar tampilan langsung diperbarui; seluruh catatan dapat dimuat lewat bootstrap.

Kesalahan: `{ "ok": false, "error": "Pesan dalam bahasa Indonesia" }`. Jangan menampilkan token atau kata sandi dalam log. Token sesi harus diperlakukan seperti kata sandi.

## Batasan operasional dan pemeliharaan

- Masa sesi maksimal **4 jam**, dan dapat berakhir lebih cepat karena CacheService bersifat sementara. Masuk kembali jika sesi berakhir. Akun nonaktif dan perubahan hash diperiksa kembali pada setiap permintaan.
- Setelah delapan percobaan gagal per email dalam jendela sekitar 15 menit, login dibatasi sementara. CacheService dan limiter ini cocok untuk tim kecil, bukan pengganti layanan identitas dengan proteksi penyalahgunaan tingkat besar.
- Apps Script memiliki kuota serta batas waktu eksekusi. Hash kata sandi sengaja memerlukan komputasi; login dapat lebih lambat dibanding perpindahan halaman. Untuk tim besar atau kebutuhan autentikasi berisiko tinggi, gunakan penyedia identitas khusus dan backend yang mendukungnya.
- Hanya editor Spreadsheet yang dipercaya boleh mengubah tab Users atau script. Peran pada aplikasi tidak melindungi data dari editor file Google itu sendiri.
- Mode demo menyimpan data contoh secara lokal dan terpisah dari Google Sheets. Menghapus penyimpanan browser menghapus perubahan demo.
- Integrasi ini menyimpan rencana dan insight hasil input manual atau bantuan OCR yang diperiksa pengguna. Mengatur status **Terjadwal** tidak menerbitkan konten otomatis ke Instagram atau TikTok; insight juga tidak ditarik otomatis dari platform.
- Ekspor mengikuti filter dan data yang sedang ditampilkan dashboard. PDF dan Excel (.xlsx) diunduh langsung. Gambar diekspor sebagai PNG; laporan panjang dikemas menjadi beberapa PNG dalam satu ZIP. KPI dan ekspor insight menggunakan snapshot terbaru per konten, dengan bulan publikasi sebagai periode filter.
- Setelah mengubah kode backend, pilih **Deploy → Manage deployments → Edit → New version → Deploy**. Pertahankan URL deployment yang sama agar pengaturan dashboard tidak perlu diganti.

## Pemecahan masalah

| Gejala | Periksa |
| --- | --- |
| Halaman login Google atau respons bukan JSON | Deployment harus Web app, execute as pemilik, akses Anyone; gunakan `/exec`. |
| `Failed to fetch` / respons tidak terbaca | URL deployment, izin organisasi, koneksi internet, dan konfigurasi akses. Jangan memakai `no-cors`. |
| Database belum siap | Jalankan `setupSpreadsheet()` melalui script yang terikat ke Spreadsheet tujuan. |
| Header sheet tidak sesuai / History belum tersedia | Jalankan setupSpreadsheet() versi baru. Pulihkan nama dan urutan header lama bila pernah diubah; jangan menimpa atau menghapus data. |
| Email atau kata sandi tidak sesuai | Buat/reset akun melalui `createUser()` dan pastikan `active` bernilai `TRUE`. |
| Sesi berakhir | Masuk kembali; cache dapat berakhir sebelum empat jam. |
| Perubahan kode belum terlihat | Buat versi baru untuk deployment Apps Script yang sama. |

Backend ini disediakan sebagai berkas siap pasang. Koneksi live baru aktif setelah pemilik menyiapkan Spreadsheet dan memasukkan URL deployment miliknya; tidak ada Spreadsheet milik pengguna yang dibuat atau diakses otomatis.
