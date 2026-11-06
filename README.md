# Exata Content Hub — Upload Manual GitHub Pages

Seluruh file dashboard, model OCR, dan template Apps Script sudah termasuk. Paket ini menggunakan GitHub Pages dari branch, tanpa workflow Actions khusus.

## 1. Upload semua file

1. Ekstrak ZIP ini di komputer.
2. Buka folder **exata-content-hub** hasil ekstraksi. Di dalamnya harus ada `index.html`, `app.js`, folder `backend`, dan folder `vendor`.
3. Buka https://github.com/marketingexata/exata-content-hub.
4. Pilih **Add file → Upload files**. Jika repositori masih kosong, klik **uploading an existing file**.
5. Seret seluruh file dan folder DI DALAM folder hasil ekstraksi ke area upload GitHub. Sertakan folder `backend`, `vendor`, serta `.nojekyll` jika ditampilkan oleh komputer.
6. Pilih **Commit changes** ke branch **main**.

Pastikan `index.html` berada langsung di root repositori, bukan di `dist/index.html` atau `exata-content-hub/index.html`. Jangan hanya mengunggah ZIP; GitHub tidak mengekstrak ZIP otomatis. Pertahankan nama dan susunan folder aset.

## 2. Aktifkan website

1. Buka **Settings → Pages** pada repositori.
2. Di bagian **Build and deployment**, ubah **Source** menjadi **Deploy from a branch**.
3. Pilih branch **main** dan folder **/(root)**, lalu klik **Save**.
4. Tunggu proses publikasi. Status dapat dilihat melalui **Actions → pages build and deployment**.
5. Setelah berhasil, alamat website ditampilkan di Settings → Pages. Dengan akun dan repo di atas: https://marketingexata.github.io/exata-content-hub/.

Jika source sebelumnya **GitHub Actions**, ubah ke **Deploy from a branch** untuk paket manual ini. Paket ini tidak berisi folder `.github` atau workflow khusus.

## 3. Hubungkan spreadsheet

1. Buka alamat dashboard yang sudah aktif.
2. Pilih **Atur integrasi**.
3. Jika belum menyiapkan backend, unduh `backend/Code.gs` dan ikuti `backend/panduan.md`.
4. Tempel URL deployment Apps Script yang berakhir `/exec`, lalu login menggunakan akun spreadsheet.

Pengaturan browser dan data demo dari domain sebelumnya tidak otomatis berpindah. Data tim tetap berada di spreadsheet yang sama. GitHub Pages menyajikan frontend publik; data Google Sheets hanya bisa dibaca melalui sesi login backend.

## Memperbarui file

Unggah file yang diperbarui ke branch main dengan susunan yang sama. GitHub Pages akan menerbitkan ulang secara otomatis.

## Isi paket

- `index.html`: halaman utama
- `app.js`, `style.css`, `modern.css`: dashboard dan tampilan
- `insights-ui.js`, `insights-ui.css`: form insight sesuai platform dan format
- `ocr.js`, `ocr-parser.js`, `vendor/ocr/`: OCR lokal beserta worker, WebAssembly, model bahasa, dan lisensi
- `reference.js`, `reference.css`: popup referensi
- `export.js`: PDF, Excel, dan gambar
- `backend/Code.gs`, `backend/panduan.md`: template backend Google Sheets dan panduan
- `.nojekyll`: penanda publikasi file statis

Tidak perlu mengunggah folder .git, .openai, node_modules, atau memasang dependensi npm. Jangan menambahkan password asli, token, atau isi spreadsheet tim ke repositori.
