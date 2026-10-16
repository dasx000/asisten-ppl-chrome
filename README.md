# Asisten PPL

Ekstensi Chrome/Edge untuk mempercepat pekerjaan penyuluh pertanian (PPL) di **SIMLUH**, **e-RDKK**, dan **e-Banper**.
Cukup pasang, login seperti biasa, lalu tombol/kartu bantuan muncul sendiri di halaman aplikasinya.

## Fitur singkat

| Aplikasi | Fitur | Fungsi |
|---|---|---|
| SIMLUH | Update dari Excel | Ubah/tambah banyak anggota poktan sekaligus dari file Cetak Excel |
| SIMLUH | Download Poktan | Unduh Cetak Excel anggota semua poktan per desa (1 ZIP) |
| SIMLUH | Rekap Luas Lahan | Dashboard luas & jumlah petani per komoditas dan per desa |
| e-RDKK | Cek Duplikasi | Cari data ter-upload 2x di semua status, lalu hapus/batal salinannya |
| e-RDKK | Cek PT | Pengajuan yang jumlah PT-nya beda dari kebiasaan daerah Anda, batal/hapus massal |
| e-RDKK | Status Upload | Poktan yang sudah/belum upload RDKK per desa |
| e-RDKK | Rekap Luas | Luas lahan & luas tanam per desa → poktan → komoditas |
| e-RDKK | Unduh Semua PDF | Cetak RDKK semua poktan sekaligus, rapi per desa (1 ZIP) |
| e-Banper | Kuota Program | Rancangan Pusat, Telah Diajukan & Sisa kuota semua kegiatan |

Semua berjalan di browser dengan akun Anda sendiri: tanpa server, tanpa menyimpan password, dan tidak ada data yang
dikirim/dihapus sebelum Anda klik konfirmasi. Setiap modul bisa dinyalakan/dimatikan lewat ikon ekstensi di toolbar.

> Alat bantu tidak resmi, bukan aplikasi Kementerian Pertanian.

## Cara pasang

1. **Download:** di halaman ini, klik tombol hijau **Code** → **Download ZIP**.
2. **Ekstrak:** buka folder Downloads, klik kanan file `asisten-ppl-chrome-main.zip` → **Extract All** / **Ekstrak Semua**.
   Pindahkan folder hasil ekstrak ke tempat tetap, misalnya `Documents\AsistenPPL`.
   Jangan hapus atau pindahkan folder ini setelah dipasang, karena ekstensi dibaca dari folder ini.
3. Buka Chrome, ketik `chrome://extensions` di kolom alamat lalu tekan Enter (Edge: `edge://extensions`).
4. Nyalakan saklar **Developer mode** / **Mode pengembang** di pojok kanan atas.
5. Klik **Load unpacked** / **Muat yang belum dikemas**, lalu pilih folder tadi.
   Pilih folder yang **di dalamnya langsung ada file `manifest.json`**. Kalau setelah ekstrak ada folder di dalam
   folder dengan nama sama, pilih folder yang di dalam.
6. Selesai. Ikon Asisten PPL muncul di toolbar (kalau tidak terlihat, klik ikon puzzle 🧩 lalu sematkan/pin).

**Memperbarui ke versi baru:** download ZIP lagi (langkah 1–2), salin isinya ke folder lama dan timpa semua file,
lalu buka `chrome://extensions` dan klik tombol ↻ (Reload) pada Asisten PPL.

**Menyalakan/mematikan modul:** klik ikon Asisten PPL di toolbar, lalu geser saklar modulnya.

---

## Modul SIMLUH

### Update dari Excel

Memperbarui dan menambah anggota poktan di SIMLUH dari file **Cetak Excel**.

**Aman dipakai**

- **Tidak pernah menghapus anggota.** Modul ini tidak punya perintah hapus. Baris yang dihapus dari Excel hanya dilewati, anggotanya tetap ada di SIMLUH.
- **Tidak ada yang dikirim sebelum Anda klik Kirim.** Semua perubahan ditampilkan dulu untuk diperiksa.
- Hanya kolom yang berbeda yang diubah. Nama, NIK, Tempat/Tgl Lahir, dan Jenis Kelamin tidak pernah diubah.
- Sel yang **sengaja dikosongkan** di Excel ikut dikosongkan di SIMLUH, dan ditandai "(dikosongkan)" saat diperiksa.
- Data hanya dikirim ke SIMLUH memakai akun Anda sendiri, tidak ke pihak lain. Ekstensi tidak menyimpan password.

**Cara pakai**

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

### Download Poktan: Cetak Excel anggota per desa (ZIP)

Di halaman **List Kelompok Tani** (menu Kelompok Tani) muncul kartu **Download Poktan** di atas tabel. Bawaannya tertutup; klik judulnya untuk membuka pilihan desa
(daftar poktan baru dibaca saat itu).

1. Centang desa yang diinginkan (ada kotak cari; pilihan terakhir diingat per kecamatan).
2. Klik **Mulai download**. Untuk setiap poktan di desa itu, ekstensi mengambil file **Cetak Excel** bawaan SIMLUH
   (sama dengan tombol Cetak Excel di menu *Tambah Anggota*).
3. Semua file disatukan dalam satu ZIP `Anggota Poktan - Kec <Kecamatan> - <Desa / n Desa>.zip`:
   folder `DESA/01 NAMA POKTAN.xls` + `DAFTAR ISI.csv` (status tiap poktan: OK / GAGAL / DIHENTIKAN).

- Membaca semua poktan di kecamatan, bukan hanya 10 baris yang tampil di tabel.
- Hanya membaca (GET), 3 unduhan paralel. File berisi NIK tidak disimpan di browser, hanya diberikan sebagai unduhan.

### Dashboard Home: Rekap Luas Lahan per Komoditas

Di halaman **Home** SIMLUHTAN (Admin BPP) muncul kartu **Rekap Luas Lahan per Komoditas**. Klik **Muat rekap**
(±1 menit) untuk membaca anggota semua kelompok tani.

- Luas = jumlah Volume (ha) pada Komoditas yang Diusahakan 1–3 tiap anggota; petani dihitung sekali per komoditas.
- Ternak, unggas, dan perikanan (ekor) ditampilkan terpisah dan **tidak masuk luas**. Tanaman pakan ternak
  (mis. Hijauan Pakan Ternak, Rumput Gajah) tetap dihitung luas.
- Kartu total, grafik batang per komoditas, tabel per komoditas (petani, luas, rata-rata, %), rincian per desa; filter desa.
- Hanya membaca; nama/NIK tidak disimpan, hanya angka rekap di memori.

---

## Modul e-Banper

### Kuota Program

Menampilkan kuota **semua kegiatan** bantuan di kabupaten Anda dalam satu daftar: **Rancangan Pusat**,
**Telah Diajukan**, dan **Sisa yang bisa diajukan**. Tidak perlu lagi membuka form Tambah Usulan dan memilih
kegiatan satu per satu.

**Aman dipakai**

- **Hanya membaca data.** Modul ini tidak pernah membuat, mengubah, atau mengirim usulan.
- Memakai sesi login e-Banper Anda sendiri. Data yang tampil otomatis sesuai kabupaten akun Anda.

**Cara pakai**

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

## Modul e-RDKK

Login e-RDKK, buka menu mana saja, lalu klik tombol hijau **Asisten e-RDKK** di pojok kanan bawah. Panel membaca
semua pengajuan sekali, lalu menyediakan empat tab: **Status Upload**, **Cek PT**, **Rekap Luas**, dan **Cek Duplikasi**.
Kartu **Unduh Semua PDF** ada terpisah di halaman Cetak Data. Modul aktif di semua alamat `erdkk*.pertanian.go.id`,
jadi tetap jalan bila domain e-RDKK berganti tahun.

### Cek Duplikasi

Menu **Monitoring Duplikasi** bawaan e-RDKK hanya memeriksa pengajuan berstatus **Belum dikirim ke Korluh**.
Data yang sama ter-upload 2x tidak ketahuan kalau salah satunya sudah dikirim (Menunggu persetujuan Korluh/Kasie/…)
atau keduanya sudah dikirim. Modul ini memakai aturan yang sama (**baris identik di semua kolom**), tapi memeriksa **semua status**.

**Aman dipakai**

- **Tidak ada yang dihapus atau dibatalkan tanpa Anda klik dan menyetujui konfirmasi.** Selain itu modul hanya membaca data.
- Tombol Hapus hanya ada di baris **Belum dikirim ke Korluh**, dan **minimal satu baris per kelompok selalu disisakan**
  (kalau ada salinan yang sudah dikirim, itulah yang disisakan).
- Tombol **Batal** (tarik kembali dari Korluh) hanya ada di baris **Menunggu persetujuan Korluh**, dan hanya bila semua
  salinannya sudah dikirim. Setelah dibatalkan, salinan itu kembali "Belum dikirim" dan bisa dihapus.
- Sesaat sebelum menghapus, data dibaca ulang: baris harus masih ada, masih berstatus belum dikirim, dan masih identik
  dengan salinannya. Kalau tidak, penghapusan dibatalkan.
- Menghapus memakai cara yang sama dengan tombol Hapus di menu Pengajuan (akun & token Anda sendiri).
- Data berisi NIK, jadi **tidak disimpan** di browser. Data selalu dibaca ulang saat panel dibuka.
- Status ditolak/batal/Not Valid (mis. NIK meninggal) tidak ikut dihitung.

**Cara pakai**

1. Klik tombol **Asisten e-RDKK**, lalu pilih tab **Cek Duplikasi**.
2. Tab ini menampilkan data dobel dari semua pengajuan. Yang ditandai kuning **Tidak terdeteksi e-RDKK**
   adalah yang luput dari Monitoring Duplikasi bawaan.
3. Saring per kelompok tani, cari nama/NIK, atau pilih tab **Tidak terdeteksi e-RDKK** / **Lintas status**.
4. Klik kartu untuk melihat baris-barisnya. Hapus salinan dengan tombol **Hapus** per baris atau
   **Hapus N salinan, sisakan 1** per kelompok, atau **Hapus semua salinan** di bawah panel untuk semua petani
   yang sedang tampil (mengikuti filter; ada konfirmasi berisi daftar nama dan tombol Hentikan selama proses). Kalau semua salinan sudah di Korluh, klik **Batal** di salah satunya
   dulu, lalu hapus. Kalau sudah diproses di atas Korluh (Kasie/Kabid/Kadis), koordinasikan dengan yang bersangkutan.
5. Klik **Unduh Excel** untuk laporan (lembar Duplikasi + Ringkasan per kelompok tani).

### Cek PT (jumlah PT per komoditas)

Jumlah PT yang benar berbeda tiap daerah (mis. jagung 2 PT di satu kabupaten, 3 PT di kabupaten lain), jadi tidak
ditulis tetap. Tab **Cek PT** menganalisis pengajuan aktif: untuk tiap komoditas, jumlah PT yang **paling banyak diisi**
dijadikan aturan. Pengajuan yang jumlah PT-nya berbeda ditampilkan, dikelompokkan per kampung dan kelompok tani,
dengan filter desa, poktan, dan status.

- Komoditas tampil sebagai **tombol** (hanya yang ada di data). Klik untuk menyaring; tiap tombol memuat angka **PT**
  yang berlaku, jumlah yang salah, dan dasar analisisnya (mis. *94% isi 3 PT dari 820*).
- Angka PT bisa **diubah manual** bila daerah Anda berbeda; disimpan di akun Chrome (hanya angka aturan) dan ditandai
  *manual*, dengan tombol **↺ otomatis** untuk kembali ke hasil analisis.
- Tanda **⚠ perlu dicek** bila mayoritas lemah (di bawah 60% atau seri; seri memakai angka yang lebih kecil),
  **data sedikit** bila pengajuan komoditas itu kurang dari 5.

- **Batal** (status *Menunggu persetujuan Korluh*): ditarik kembali menjadi *Belum dikirim* supaya bisa diperbaiki.
- **Hapus** (status *Belum dikirim ke Korluh*): dihapus permanen, untuk diunggah ulang dengan data yang benar.
- Tombol tersedia per baris, **per kelompok tani**, dan **semua yang tampil** (ikut filter). Status di atas Korluh tidak punya aksi.
- Selalu ada konfirmasi berisi daftar nama; hapus lebih dari satu pengajuan harus mengetik **HAPUS**.
  Setiap baris dicek ulang ke data terbaru (masih ada, status sesuai, isi belum diperbaiki) sebelum diproses.
- **Unduh Excel** berisi daftar pengajuan yang PT-nya salah.

### Status Upload per kelompok tani

Tab **Status Upload** membandingkan daftar kelompok tani di **Master Data → Kelompok Tani** (`/api/poktan`) dengan
data pengajuan: kelompok yang punya **minimal 1 pengajuan aktif** (bukan ditolak/batal/Not Valid) = **sudah upload**.

- Filter **desa**, **sudah/belum upload**, **jenis** (Poktan tanpa KWT / KWT saja / keduanya), dan cari nama poktan.
- Kelompok yang sudah upload diberi keterangan **komoditas & jumlah petani**, mis. *JAGUNG 23 petani · PADI 13 petani*.
- Ringkasan sudah/belum per desa; **Unduh Excel** (lembar Status Upload + Ringkasan per Desa).
- ID poktan di master berbeda dengan di pengajuan, jadi dicocokkan lewat **nama desa + nama poktan**. Nama yang
  tercatat dobel di master atau pengajuan yang nama poktannya tidak ada di master diberi tanda.

### Rekap Luas

Tab **Rekap Luas** di panel yang sama menampilkan luas lahan yang diajukan **per kampung → kelompok tani → komoditas**,
beserta jumlah petani.

- **Luas Lahan** = luas bidang lahan, dihitung sekali per petani per komoditas, PT1–PT3 tidak dijumlah
  (bila luas antar PT berbeda, diambil yang terbesar).
- **Luas Tanam** = PT1 + PT2 + PT3, sama dengan kolom "Rencana Tanam" di lembar Cetak Data e-RDKK. Luas Tanam ÷ Luas Lahan
  menunjukkan berapa kali lahan ditanam setahun (mis. padi yang hanya diisi PT1 akan sama dengan Luas Lahan).
- Data dihitung apa adanya, termasuk salinan dobel bila ada.
- Filter **Kelurahan/Desa**, **Kelompok Tani**, **Komoditas**, dan **Status** (bawaan: semua kecuali ditolak/batal/Not Valid).
  Pengajuan campuran (mis. padi PT1 + jagung PT2) hanya dihitung bagian komoditas yang dipilih.
- Tombol **⛶** di kepala panel membesarkan panel selebar layar; klik lagi untuk kembali.
- Subtotal per poktan dan per kampung, total, dan ringkasan per komoditas.
- Nama desa dari master wilayah e-RDKK (`/api/wilayah`, sumber menu Master Data → Wilayah). **Unduh Excel** mengikuti filter yang aktif.

### Unduh Semua PDF (halaman Cetak Data)

Di menu **Cetak Data** muncul kartu **Unduh Semua PDF (ZIP)** di bawah tabel bawaan.

- Centang komoditas (bawaan: **padi, jagung, kopi**). Pilihan komoditas dibaca dari dropdown Komoditas bawaan
  halaman Cetak Data, jadi komoditas yang ditambahkan e-RDKK ikut muncul. Subsektor diisi otomatis; untuk komoditas
  baru yang belum dikenal, subsektor dicoba satu per satu sampai ada datanya.
- Centang desa (bawaan: semua desa), klik **Mulai unduh**.
- Untuk setiap kelompok tani × kios × komoditas terpilih, ekstensi memakai PDF bawaan e-RDKK
  (sama dengan tombol Cetak Data). Kombinasi tanpa data dilewati.
- Isi ZIP (urut siap cetak): `KECAMATAN/09 KOTAWAY/03 MUKTI JAYA - JAGUNG - YOGI TANI.pdf`; desa bernomor urut abjad,
  file bernomor urut per desa (poktan A–Z → komoditas → kios); lebih dari 100 baris dipecah
  `… (bagian 1).pdf`, `… (bagian 2).pdf` mengikuti e-RDKK. Ada `DAFTAR ISI.csv` berisi status tiap berkas.
- Tahun mengikuti tahun yang aktif di menu e-RDKK (mis. 2026). Hanya membaca; PDF tidak disimpan di browser.
- Setelah selesai tampil rekap: berapa kelompok tani terdaftar (Master Data → Kelompok Tani) yang sudah punya
  RDKK komoditas terpilih; daftar lengkap ada/belum di `REKAP POKTAN.csv` dalam ZIP.
- Perkiraan: ±15 detik per desa.

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
    core/unduhpoktan.js  Download Poktan: urai List Kelompok Tani, unduh Cetak Excel per poktan, susun ZIP
    core/dashboard.js    rekap luas lahan per komoditas dari tabel anggota (ternak dipisah)
    content/panel.js     panel Update dari Excel di daftar anggota (Shadow DOM)
    content/panel.css
    content/unduhpoktan.js / .css  kartu Download Poktan di List Kelompok Tani (Shadow DOM)
    content/dashboard.js / .css    kartu Rekap Luas Lahan di halaman Home (Shadow DOM)
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
    core/api.js          GET /api/pengajuan (semua status) per 500 baris; POST delete-pengajuan / batal-pengajuan
    core/duplikasi.js    sidik baris (semua kolom kecuali id/status/cap waktu) → kelompok identik lintas status
    core/cekmt.js        analisis PT mayoritas per komoditas → pengajuan yang PT-nya berbeda, aturan Batal (status 2) / Hapus (status 1)
    core/upload.js       status upload per poktan (master /api/poktan vs pengajuan aktif)
    core/rekap.js        rekap luas lahan & pupuk per desa → poktan → komoditas, filter desa/poktan/status
    core/cetakpdf.js     Unduh Semua PDF: poktan × kios × komoditas → cetak-count/cetak-pdf, susun ZIP
    core/laporan.js      tata letak Excel duplikasi, cek PT, status upload & rekap luas
    content/panel.js     panel Asisten e-RDKK bertab (Shadow DOM), data tidak disimpan
    content/panel.css
    content/cetak.js / .css  kartu Unduh Semua PDF di halaman Cetak Data
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
