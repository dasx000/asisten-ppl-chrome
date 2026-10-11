# Asisten Penyuluh

Ekstensi Chrome/Edge berisi alat bantu untuk tugas penyuluh di berbagai aplikasi. Setiap tugas berupa **modul**
yang bisa dinyalakan atau dimatikan lewat ikon ekstensi di toolbar.
Berjalan sepenuhnya di browser dan memakai akun masing-masing. Tidak perlu Python, server, atau bot.

> Alat bantu tidak resmi, bukan aplikasi Kementerian Pertanian.

## Modul

| Modul | Situs | Fungsi |
|---|---|---|
| SIMLUH — Update dari Excel | simluh.pertanian.go.id | Ubah & tambah anggota poktan dari file Cetak Excel |

## Cara pasang (mode developer)

1. Ekstrak file `asisten-penyuluh-vX.Y.Z.zip` ke folder tetap, misalnya `Documents\AsistenPenyuluh`.
   Jangan hapus atau pindahkan folder ini setelah dipasang.
2. Buka `chrome://extensions` (Chrome) atau `edge://extensions` (Edge).
3. Nyalakan **Developer mode** / **Mode pengembang**.
4. Klik **Load unpacked** / **Muat yang belum dikemas**, lalu pilih folder tadi (folder yang berisi `manifest.json`).

**Memperbarui ke versi baru:** ganti isi folder dengan versi baru, lalu klik tombol ↻ (Reload) pada ekstensi di halaman `chrome://extensions`.

**Menyalakan/mematikan modul:** klik ikon Asisten Penyuluh di toolbar, lalu geser saklar modulnya.

---

## Modul SIMLUH — Update dari Excel

Memperbarui dan menambah anggota poktan di SIMLUH dari file **Cetak Excel**.

### Aman dipakai

- **Tidak pernah menghapus anggota.** Modul ini tidak punya perintah hapus. Baris yang dihapus dari Excel hanya dilewati, anggotanya tetap ada di SIMLUH.
- **Tidak ada yang dikirim sebelum Anda klik Kirim.** Semua perubahan ditampilkan dulu untuk diperiksa.
- Hanya kolom yang berbeda yang diubah. Nama, NIK, Tempat/Tgl Lahir, dan Jenis Kelamin tidak pernah diubah.
- Sel yang **sengaja dikosongkan** di Excel ikut dikosongkan di SIMLUH, dan ditandai "(dikosongkan)" saat diperiksa.
- Data hanya dikirim ke SIMLUH memakai akun Anda sendiri, tidak ke pihak lain. Ekstensi tidak menyimpan password.

### Cara pakai

1. Login SIMLUH seperti biasa, lalu buka **daftar anggota** salah satu poktan.
2. Klik tombol hijau **Update dari Excel** di pojok kanan bawah.
3. Pilih yang ingin dilakukan:
   - **Ubah data anggota**: ubah isi file Cetak Excel (luas lahan, komoditas, no HP, dll).
     Nama, NIK, Tempat/Tgl Lahir, dan Jenis Kelamin tidak bisa diubah.
   - **Tambah anggota baru**: tulis anggota baru di baris kosong paling bawah, semua kolom diisi.
     Nama, NIK, Tempat/Tgl Lahir (contoh `KASUI, 15-8-1974`), dan Jenis Kelamin harus sesuai KTP karena dicek ke Dukcapil.
4. Pilih file, lalu klik **Periksa file**. Muncul daftar perubahan. Pada tahap ini belum ada yang dikirim.
5. Kalau sudah benar, klik **Kirim**. Tunggu sampai selesai dan jangan tutup halaman selama proses.
6. Klik **Unduh laporan (Excel)** untuk menyimpan hasilnya.

File yang dipakai harus milik poktan yang sedang dibuka. Kolom NIK sebaiknya berformat **Teks** di Excel,
supaya angkanya tidak rusak menjadi `1,8E+15` atau berakhiran `0000`.

---

## Untuk pengembang

### Struktur

```
manifest.json            daftar izin & content script semua modul
common/modul.js          daftar modul (DAFTAR) + saklar on/off (chrome.storage.sync)
popup/                   menu saat ikon ekstensi diklik
lib/xlsx.full.min.js     SheetJS 0.20.3 (Apache-2.0, lihat lib/LICENSE-sheetjs.txt), dipakai bersama
icons/
modules/
  simluh/
    core/aturan.js       membaca file & aturan validasi (terjemahan scripts/run_simluh.py DASBOT), tanpa jaringan
    core/api.js          request ke SIMLUH dengan sesi login browser, token CSRF dipasang sendiri
    core/proses.js       alur periksa → kirim untuk mode ubah/tambah
    content/panel.js     panel di halaman (Shadow DOM)
    content/panel.css
    test/                test Node (tidak ikut ZIP)
    demo/                pembuat video demo (tidak ikut ZIP)
```

### Menambah modul baru

1. Buat folder `modules/<id>/` berisi kode modulnya.
2. Tambahkan entri `{ id, nama, ket, situs }` di `DAFTAR` pada `common/modul.js`. Entri ini otomatis muncul di popup.
3. Daftarkan content script di `manifest.json`. Taruh `common/modul.js` paling depan, lalu kode modulnya.
4. Di content script, bungkus tampilan dengan `Asisten.pantau('<id>', (nyala) => ...)` supaya saklar popup berfungsi.
5. Naikkan `version` di `manifest.json` dan `package.json`.

### Perintah

- Test semua modul: `npm test`
- Membuat ZIP: `npm run pack` (atau `python pack.py`) → `dist/asisten-penyuluh-vX.Y.Z.zip`
- Video demo SIMLUH: `python modules/simluh/demo/buat_video.py` → `dist/demo-asisten-simluh.mp4`
  (halaman SIMLUH tiruan + data fiktif; butuh playwright, openpyxl, dan ffmpeg dari PATH/env `FFMPEG`/node_modules DASBOT).
  Versi mode Ubah dengan narasi suara: `python modules/simluh/demo/buat_video_suara.py [--ardi]` → `dist/demo-ubah-bersuara.mp4`
  (butuh `pip install edge-tts` + internet).
