// ================= AKSES e-RDKK DARI HALAMAN (SESI LOGIN PENGGUNA) ================= \\
// Hanya BACA (GET) dari API yang sama dengan tabel menu Pengajuan. Data otomatis sebatas wilayah akun yang login.

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

  const api = { ServerSibuk, SesiHabis, ambilJson, semuaPengajuan, PER_HALAMAN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ErdkkApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
