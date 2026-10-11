// ================= AKSES E-BANPER DARI HALAMAN (SESI LOGIN PENGGUNA) ================= \\
// Hanya request BACA (GET) ke API yang juga dipakai form "Tambah Usulan Kegiatan" e-Banper.
// Data otomatis terbatas pada kabupaten akun yang sedang login (diatur server).

(function (root) {
  'use strict';

  const JEDA_ULANG = [3, 8]; // detik tunggu sebelum percobaan ke-2 dan ke-3

  /** Error sementara dari server (5xx / koneksi putus) → layak dicoba ulang. */
  class ServerSibuk extends Error {}
  /** Sesi login e-Banper habis → pengguna harus login ulang. */
  class SesiHabis extends Error {
    constructor() {
      super('Sesi login e-Banper habis. Login ulang di tab ini, lalu klik "Muat ulang data".');
    }
  }

  const tidur = (detik) => new Promise((r) => setTimeout(r, detik * 1000));

  /** GET JSON dengan ulang otomatis untuk error sementara. */
  async function ambilJson(path, fetchFn = root.fetch && root.fetch.bind(root)) {
    for (let i = 0; ; i++) {
      let r;
      try {
        r = await fetchFn(path, {
          credentials: 'include', cache: 'no-store',
          headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        });
        if (r.status >= 500) throw new ServerSibuk(`server e-Banper sedang bermasalah (HTTP ${r.status})`);
      } catch (e) {
        const sementara = e instanceof ServerSibuk || e instanceof TypeError; // TypeError = koneksi putus
        if (!sementara) throw e;
        const pesan = e instanceof ServerSibuk ? e.message : 'koneksi ke e-Banper terputus';
        if (i >= JEDA_ULANG.length) throw new ServerSibuk(`${pesan}, sudah dicoba ${i + 1}x. Coba lagi nanti.`);
        await tidur(JEDA_ULANG[i]);
        continue;
      }
      if (r.status === 401 || r.status === 419) throw new SesiHabis();
      const teks = await r.text();
      try {
        return JSON.parse(teks);
      } catch (e) {
        if (/<form|login|password/i.test(teks)) throw new SesiHabis(); // diarahkan ke halaman login
        throw new Error(`Respons server tidak dikenali (HTTP ${r.status})`);
      }
    }
  }

  const buat = (fetchFn) => {
    const J = (p) => ambilJson(p, fetchFn);
    return {
      SesiHabis,
      bidang: async (sub) => (await J(`/api/cpcl/bidang-by-subsektor/${sub}`)).bidang || [],
      komoditas: async (sub, bidang) => (await J(`/api/cpcl/komoditas-by-subsektor-bidang/${sub}/${bidang}`)).komoditas || [],
      kegiatan: async (bidang, sub, kom) => (await J(`/api/cpcl/kegiatan-by-komoditas/${bidang}/${sub}/${kom}`)).kegiatan || [],
      /** { kegiatan, volume_summary: { available_volume, used_volume, remaining_volume, details } } */
      detail: async (id, kodeProp) =>
        J(`/api/cpcl/kegiatan-by-id/${id}${kodeProp ? `?kode_prop=${encodeURIComponent(kodeProp)}` : ''}`),
    };
  };

  const api = { ServerSibuk, SesiHabis, ambilJson, buat, ...(typeof fetch !== 'undefined' ? buat() : {}) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EbanperApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
