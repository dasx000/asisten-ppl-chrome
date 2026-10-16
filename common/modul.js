// ================= DAFTAR MODUL & SAKLAR ON/OFF ================= \\
// Dipakai popup (daftar saklar) dan content script tiap modul (cek aktif/tidak).
// Menambah modul baru: tambahkan entri di DAFTAR, lalu daftarkan content script-nya di manifest.json.

(function (root) {
  'use strict';

  const DAFTAR = [
    {
      id: 'simluh',
      nama: 'SIMLUH — Update dari Excel, Download Poktan & Dashboard',
      ket: 'Ubah & tambah anggota poktan dari file Cetak Excel, download Cetak Excel anggota semua poktan per desa (ZIP), plus rekap luas lahan per komoditas di halaman Home.',
      situs: 'https://simluh.pertanian.go.id/',
    },
    {
      id: 'ebanper',
      nama: 'e-Banper — Kuota Program',
      ket: 'Lihat Rancangan Pusat, Telah Diajukan, dan Sisa kuota semua kegiatan di kabupaten Anda sekaligus.',
      situs: 'https://ebanper.pertanian.go.id/penyuluh/dashboard',
    },
    {
      id: 'erdkk',
      nama: 'e-RDKK — Status Upload, Cek PT, Rekap Luas & Duplikasi',
      ket: 'Cari data dobel di semua status, pengajuan yang jumlah PT-nya beda dari mayoritas daerah Anda (batal/hapus massal), rekap luas lahan, dan poktan yang belum upload.',
      situs: 'https://erdkk25.pertanian.go.id/pengajuan',
    },
  ];

  const kunci = (id) => `modul.${id}`;

  // Modul aktif secara bawaan sampai dimatikan lewat popup
  async function aktif(id) {
    const v = await chrome.storage.sync.get(kunci(id));
    return v[kunci(id)] !== false;
  }

  function setAktif(id, nyala) {
    return chrome.storage.sync.set({ [kunci(id)]: !!nyala });
  }

  // Panggil cb(aktif) sekarang, lalu setiap kali saklar diubah dari popup
  function pantau(id, cb) {
    aktif(id).then(cb);
    chrome.storage.onChanged.addListener((ubah, area) => {
      if (area === 'sync' && kunci(id) in ubah) cb(ubah[kunci(id)].newValue !== false);
    });
  }

  root.Asisten = { DAFTAR, aktif, setAktif, pantau };
})(typeof self !== 'undefined' ? self : this);
