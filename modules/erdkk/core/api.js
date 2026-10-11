// ================= AKSES e-RDKK DARI HALAMAN (SESI LOGIN PENGGUNA) ================= \\
// Baca (GET) dari API yang sama dengan tabel menu Pengajuan; data otomatis sebatas wilayah akun yang login.
// Aksi tulis hanya Hapus dan Batal, memakai endpoint & token yang sama dengan tombol bawaan menu Pengajuan.

(function (root) {
  'use strict';

  const PER_HALAMAN = 500;
  const JEDA_ULANG = [3, 8];

  class ServerSibuk extends Error {}
  class SesiHabis extends Error {
    constructor() {
      super('Sesi login e-RDKK habis. Login ulang di tab ini, lalu klik "Periksa ulang".');
    }
  }
  const tidur = (d) => new Promise((r) => setTimeout(r, d * 1000));

  async function ambilJson(path, fetchFn = root.fetch && root.fetch.bind(root)) {
    for (let i = 0; ; i++) {
      let r;
      try {
        r = await fetchFn(path, {
          credentials: 'include', cache: 'no-store',
          headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        });
        if (r.status >= 500) throw new ServerSibuk(`server e-RDKK sedang bermasalah (HTTP ${r.status})`);
      } catch (e) {
        if (!(e instanceof ServerSibuk || e instanceof TypeError)) throw e;
        const pesan = e instanceof ServerSibuk ? e.message : 'koneksi ke e-RDKK terputus';
        if (i >= JEDA_ULANG.length) throw new ServerSibuk(`${pesan}, sudah dicoba ${i + 1}x. Coba lagi nanti.`);
        await tidur(JEDA_ULANG[i]);
        continue;
      }
      if (r.status === 401 || r.status === 419) throw new SesiHabis();
      const teks = await r.text();
      try {
        return JSON.parse(teks);
      } catch (e) {
        if (/<form|login|password/i.test(teks)) throw new SesiHabis();
        throw new Error(`Respons server tidak dikenali (HTTP ${r.status})`);
      }
    }
  }

  /** Semua baris pengajuan (semua status) yang bisa diakses akun, dibaca per 500 baris. */
  async function semuaPengajuan(opsi = {}) {
    const fetchFn = opsi.fetch;
    const lapor = opsi.onProgres || (() => {});
    const hasil = [];
    for (let start = 0; ; start += PER_HALAMAN) {
      const j = await ambilJson(`/api/pengajuan?draw=1&start=${start}&length=${PER_HALAMAN}`, fetchFn);
      const data = Array.isArray(j) ? j : j.data || [];
      hasil.push(...data);
      const total = Number(j.recordsTotal || j.recordsFiltered || hasil.length);
      lapor(hasil.length, total);
      if (!data.length || data.length < PER_HALAMAN || hasil.length >= total) break;
    }
    return hasil;
  }

  /** Nama desa/kelurahan per kecamatan: Map kode desa → nama. Kecamatan yang gagal dibaca dilewati (tampil sebagai kode). */
  async function namaDesa(kodeKecamatan, opsi = {}) {
    const peta = new Map();
    for (const kode of [...new Set(kodeKecamatan)].filter(Boolean)) {
      try {
        const j = await ambilJson(`/api/areas-sub-district?district_code=${encodeURIComponent(kode)}`, opsi.fetch);
        for (const d of j.data || []) if (d.sub_district_code) peta.set(String(d.sub_district_code), String(d.sub_district || '').trim());
      } catch (e) {
        if (e instanceof SesiHabis) throw e;
      }
    }
    return peta;
  }

  /** Token CSRF halaman e-RDKK (meta csrf-token), sama seperti yang dipakai tombol Hapus bawaan. */
  function tokenHalaman(doc = root.document) {
    const m = doc && doc.querySelector('meta[name="csrf-token"]');
    return (m && m.getAttribute('content')) || '';
  }

  /** POST aksi ke e-RDKK (form-urlencoded + X-CSRF-TOKEN), tidak diulang otomatis supaya tidak ada aksi ganda. */
  async function kirimAksi(path, data, label, opsi = {}) {
    const fetchFn = opsi.fetch || (root.fetch && root.fetch.bind(root));
    const token = opsi.token != null ? opsi.token : tokenHalaman();
    if (!token) throw new Error('Token keamanan halaman tidak ditemukan. Muat ulang halaman e-RDKK lalu coba lagi.');
    let r;
    try {
      r = await fetchFn(path, {
        method: 'POST', credentials: 'include', cache: 'no-store', body: new URLSearchParams(data),
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-TOKEN': token,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      });
    } catch (e) {
      throw new ServerSibuk(`koneksi ke e-RDKK terputus saat ${label}. Periksa ulang untuk memastikan hasilnya.`);
    }
    if (r.status === 401 || r.status === 419) throw new SesiHabis();
    const teks = await r.text();
    if (r.status >= 400) {
      let pesan = '';
      try { const j = JSON.parse(teks); pesan = j.message || j.error || ''; } catch (e) { /* bukan JSON */ }
      throw new Error(`e-RDKK menolak ${label} (HTTP ${r.status})${pesan ? `: ${pesan}` : ''}`);
    }
    try {
      const j = JSON.parse(teks);
      if (j && (j.success === false || j.status === false || j.status === 'error')) throw new Error(j.message || `e-RDKK menolak ${label}`);
      return j;
    } catch (e) {
      if (e instanceof SyntaxError) {
        if (/<form|login|password/i.test(teks)) throw new SesiHabis();
        return {};
      }
      throw e;
    }
  }

  /** Hapus satu pengajuan, sama dengan tombol Hapus di menu Pengajuan. */
  const hapus = (id, opsi) => kirimAksi('/api/delete-pengajuan',
    { id: String(id), sub_district_code: '', kelompokTani: '', statusPengajuan: '' }, 'penghapusan', opsi);

  /** Batalkan pengiriman ke Korluh, sama dengan tombol Batal di menu Pengajuan (hanya status 2). */
  const batal = (id, opsi) => kirimAksi('/api/batal-pengajuan',
    { id: String(id), sub_district_code: '', kelompokTani: '' }, 'pembatalan', opsi);

  const api = { ServerSibuk, SesiHabis, ambilJson, semuaPengajuan, namaDesa, tokenHalaman, hapus, batal, PER_HALAMAN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ErdkkApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
