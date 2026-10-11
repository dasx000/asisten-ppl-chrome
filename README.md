# Asisten PPL

Ekstensi Chrome/Edge berisi alat bantu untuk tugas penyuluh di berbagai aplikasi. Setiap tugas berupa **modul**
yang bisa dinyalakan atau dimatikan lewat ikon ekstensi di toolbar.
Berjalan sepenuhnya di browser dan memakai akun masing-masing. Tidak perlu Python, server, atau bot.

> Alat bantu tidak resmi, bukan aplikasi Kementerian Pertanian.

## Modul

| Modul | Situs | Fungsi |
|---|---|---|
| SIMLUH — Update dari Excel | simluh.pertanian.go.id | Ubah & tambah anggota poktan dari file Cetak Excel |
| e-Banper — Kuota Program | ebanper.pertanian.go.id | Lihat Rancangan Pusat, Telah Diajukan, dan Sisa semua kegiatan sekaligus |
| e-RDKK — Cek Duplikasi | erdkk25.pertanian.go.id | Cari data ter-upload 2x di **semua** status, bukan hanya yang belum dikirim ke Korluh |

## Cara pasang (mode developer)

1. Ekstrak file `asisten-ppl-vX.Y.Z.zip` ke folder tetap, misalnya `Documents\AsistenPPL`.
   Jangan hapus atau pindahkan folder ini setelah dipasang.
2. Buka `chrome://extensions` (Chrome) atau `edge://extensions` (Edge).
3. Nyalakan **Developer mode** / **Mode pengembang**.
4. Klik **Load unpacked** / **Muat yang belum dikemas**, lalu pilih folder tadi (folder yang berisi `manifest.json`).

**Memperbarui ke versi baru:** ganti isi folder dengan versi baru, lalu klik tombol ↻ (Reload) pada ekstensi di halaman `chrome://extensions`.

**Menyalakan/mematikan modul:** klik ikon Asisten PPL di toolbar, lalu geser saklar modulnya.

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

## Modul e-Banper — Kuota Program

Menampilkan kuota **semua kegiatan** bantuan di kabupaten Anda dalam satu daftar: **Rancangan Pusat**,
**Telah Diajukan**, dan **Sisa yang bisa diajukan**. Tidak perlu lagi membuka form Tambah Usulan dan memilih
kegiatan satu per satu.

### Aman dipakai

- **Hanya membaca data.** Modul ini tidak pernah membuat, mengubah, atau mengirim usulan.
- Memakai sesi login e-Banper Anda sendiri. Data yang tampil otomatis sesuai kabupaten akun Anda.

### Cara pakai

1. Login e-Banper sebagai penyuluh seperti biasa.
2. Di halaman mana pun di menu penyuluh, klik tombol hijau **Kuota Program** di pojok kanan bawah.
3. Pertama kali dibuka, data diambil otomatis (sekitar 10 detik). Pembukaan berikutnya langsung menampilkan data terakhir.
   Klik **Muat ulang data** untuk angka terbaru.
4. Saring dengan kolom cari (misalnya `padi`, `traktor`, `pompa`), pilihan subsektor, atau tab **Masih ada sisa** / **Habis**.
   Kegiatan tanpa kuota (Rancangan Pusat 0) disembunyikan, centang **Tampilkan tanpa kuota** untuk melihatnya.
5. Klik **Rincian** pada kegiatan untuk melihat rincian output, unit cost, dan volume yang diajukan per kabupaten.
6. Klik **Unduh Excel** untuk menyimpan rekap kuota: lembar **Kuota** (dikelompokkan per subsektor, status berwarna,
   header terkunci, siap filter & cetak A4 lanskap) dan lembar **Ringkasan** per subsektor.

---

## Modul e-RDKK — Cek Duplikasi

Menu **Monitoring Duplikasi** bawaan e-RDKK hanya memeriksa pengajuan berstatus **Belum dikirim ke Korluh**.
Data yang sama ter-upload 2x tidak ketahuan kalau salah satunya sudah dikirim (Menunggu persetujuan Korluh/Kasie/…)
atau keduanya sudah dikirim. Modul ini memakai aturan yang sama (**baris identik di semua kolom**), tapi memeriksa **semua status**.

### Aman dipakai

- **Tidak ada yang dihapus tanpa Anda klik Hapus dan menyetujui konfirmasi.** Selain itu modul hanya membaca data.
- Tombol Hapus hanya ada di baris **Belum dikirim ke Korluh**, dan **minimal satu baris per kelompok selalu disisakan**
  (kalau ada salinan yang sudah dikirim, itulah yang disisakan).
- Sesaat sebelum menghapus, data dibaca ulang: baris harus masih ada, masih berstatus belum dikirim, dan masih identik
  dengan salinannya. Kalau tidak, penghapusan dibatalkan.
- Menghapus memakai cara yang sama dengan tombol Hapus di menu Pengajuan (akun & token Anda sendiri).
- Data berisi NIK, jadi **tidak disimpan** di browser. Data selalu dibaca ulang saat panel dibuka.
- Status ditolak/batal/Not Valid (mis. NIK meninggal) tidak ikut dihitung.

### Cara pakai

1. Login e-RDKK, buka menu mana saja. Klik tombol hijau **Cek Duplikasi** di pojok kanan bawah.
2. Panel langsung membaca semua pengajuan dan menampilkan data dobel. Yang ditandai kuning **Tidak terdeteksi e-RDKK**
   adalah yang luput dari Monitoring Duplikasi bawaan.
3. Saring per kelompok tani, cari nama/NIK, atau pilih tab **Tidak terdeteksi e-RDKK** / **Lintas status**.
4. Klik kartu untuk melihat baris-barisnya. Hapus salinan dengan tombol **Hapus** per baris atau
   **Hapus N salinan, sisakan 1** per kelompok. Kalau semuanya sudah dikirim, tidak ada tombol hapus:
   koordinasikan dengan Korluh.
5. Klik **Unduh Excel** untuk laporan (lembar Duplikasi + Ringkasan per kelompok tani).

---

## Untuk pengembang

### Struktur

```
manifest.json            daftar izin & content script semua modul
common/modul.js          daftar modul (DAFTAR) + saklar on/off (chrome.storage.sync)
common/excel.js          penulis .xlsx bergaya (warna, garis, filter, bekukan header) tanpa pustaka, dipakai modul e-Banper & e-RDKK
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
  ebanper/
    core/api.js          GET ke /api/cpcl/* e-Banper dengan sesi login browser (hanya baca)
    core/kuota.js        telusuri subsektor → bidang → komoditas → kegiatan, ambil volume_summary tiap kegiatan
    core/laporan.js      tata letak Excel: lembar Kuota (per subsektor, warna status) + Ringkasan
    content/panel.js     panel Kuota Program (Shadow DOM), simpanan terakhir di chrome.storage.local
    content/panel.css
    test/                test Node (tidak ikut ZIP)
  erdkk/
    core/api.js          GET /api/pengajuan (semua status) per 500 baris; POST /api/delete-pengajuan untuk hapus salinan
    core/duplikasi.js    sidik baris (semua kolom kecuali id/status/cap waktu) → kelompok identik lintas status
    core/laporan.js      tata letak Excel duplikasi + ringkasan per kelompok tani
    content/panel.js     panel Cek Duplikasi (Shadow DOM), data tidak disimpan
    content/panel.css
    test/                test Node (tidak ikut ZIP)
```

### Menambah modul baru

1. Buat folder `modules/<id>/` berisi kode modulnya.
2. Tambahkan entri `{ id, nama, ket, situs }` di `DAFTAR` pada `common/modul.js`. Entri ini otomatis muncul di popup.
3. Daftarkan content script di `manifest.json`. Taruh `common/modul.js` paling depan, lalu kode modulnya.
4. Di content script, bungkus tampilan dengan `Asisten.pantau('<id>', (nyala) => ...)` supaya saklar popup berfungsi.
5. Naikkan `version` di `manifest.json` dan `package.json`.

### Perintah

- Test semua modul: `npm test`
- Membuat ZIP: `npm run pack` (atau `python pack.py`) → `dist/asisten-ppl-vX.Y.Z.zip`
- Video demo SIMLUH: `python modules/simluh/demo/buat_video.py` → `dist/demo-asisten-simluh.mp4`
  (halaman SIMLUH tiruan + data fiktif; butuh playwright, openpyxl, dan ffmpeg dari PATH/env `FFMPEG`/node_modules DASBOT).
  Versi mode Ubah dengan narasi suara: `python modules/simluh/demo/buat_video_suara.py [--ardi]` → `dist/demo-ubah-bersuara.mp4`
  (butuh `pip install edge-tts` + internet).
