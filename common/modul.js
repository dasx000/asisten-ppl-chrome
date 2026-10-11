// ================= DAFTAR MODUL & SAKLAR ON/OFF ================= \\
// Dipakai popup (daftar saklar) dan content script tiap modul (cek aktif/tidak).
// Menambah modul baru: tambahkan entri di DAFTAR, lalu daftarkan content script-nya di manifest.json.

(function (root) {
  'use strict';

  const DAFTAR = [
    {
      id: 'simluh',
      nama: 'SIMLUH — Update dari Excel',
      ket: 'Ubah & tambah anggota poktan dari file Cetak Excel, di halaman daftar anggota poktan.',
      situs: 'https://simluh.pertanian.go.id/',
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
