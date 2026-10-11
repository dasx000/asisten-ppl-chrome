// ================= KUOTA PROGRAM E-BANPER: KUMPULKAN & OLAH ================= \\
// Menelusuri subsektor → bidang → komoditas → kegiatan (seperti dropdown form usulan),
// lalu mengambil ringkasan volume tiap kegiatan: Rancangan Pusat, Telah Diajukan, Sisa.
// Tanpa DOM, bisa dites di Node.

(function (root) {
  'use strict';

  // Cadangan bila halaman tidak memuat dropdown subsektor (nilai dari form e-Banper 2026)
  const SUBSEKTOR_CADANGAN = [
    { id: '7', nama: 'Tanaman Pangan (TP)' },
    { id: '257', nama: 'Hortikultura (HOR)' },
    { id: '337', nama: 'Prasarana dan Sarana Pertanian (PSP)' },
    { id: '478', nama: 'Peternakan (NAK)' },
    { id: '635', nama: 'Perkebunan (BUN)' },
    { id: '2059', nama: 'Lahan Irigasi Pertanian (LIP)' },
    { id: '2098', nama: 'Penyuluhan (LUH)' },
  ];
  const PARALEL = 3; // request bersamaan, cukup cepat tanpa membebani server

  const angka = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  /** Gabung subsektor dari halaman (bila ada) dengan daftar cadangan, tanpa dobel. */
  function daftarSubsektor(dariHalaman = []) {
    const peta = new Map();
    for (const s of [...dariHalaman, ...SUBSEKTOR_CADANGAN]) {
      const id = String(s.id || '').trim();
      if (/^\d+$/.test(id) && !peta.has(id)) peta.set(id, { id, nama: String(s.nama || '').trim() || `Subsektor ${id}` });
    }
    return [...peta.values()];
  }

  /** Jalankan fn untuk setiap item dengan batas paralel. */
  async function petaParalel(items, fn, batas = PARALEL) {
    const hasil = new Array(items.length);
    let i = 0;
    const pekerja = Array.from({ length: Math.min(batas, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        hasil[k] = await fn(items[k], k);
      }
    });
    await Promise.all(pekerja);
    return hasil;
  }

  /** Nama paling spesifik: sub komponen, kecuali "Tanpa Sub Komponen" → komponen → rincian output. */
  function namaKegiatan(keg) {
    const sk = String(keg.nama_skomponen || '').trim();
    if (sk && !/^tanpa\s+sub\s*komponen$/i.test(sk)) return sk;
    return String(keg.nama_komponen || keg.nama_ro || '').trim() || `Kegiatan ${keg.id}`;
  }

  /** Satu baris tampilan dari data kegiatan + ringkasan volumenya. */
  function barisKuota(keg, ringkas, sub) {
    const v = ringkas || {};
    const rancangan = angka(v.available_volume != null ? v.available_volume : keg.volume);
    const diajukan = angka(v.used_volume);
    const sisa = v.remaining_volume != null ? angka(v.remaining_volume) : rancangan - diajukan;
    let status = 'tersedia';
    if (!rancangan) status = diajukan ? 'lebih' : 'kosong';
    else if (sisa < 0) status = 'lebih';
    else if (sisa === 0) status = 'habis';
    return {
      id: keg.id,
      subsektor: (sub && sub.nama) || keg.nama_subsektor || '',
      bidang: keg.bidang || '',
      komoditas: keg.nama_komoditas || '',
      kegiatan: namaKegiatan(keg),
      ro: keg.nama_ro || '',
      komponen: keg.nama_komponen || '',
      eselon: keg.eselon1 || '',
      kewenangan: /^kab(upaten)?\s*\/\s*kota$/i.test(String(keg.nama_kewenangan || '').trim()) ? 'Kab/Kota' : keg.nama_kewenangan || '',
      tagging: keg.tagging_kegiatan || '',
      satuan: v.satuan || keg.satuan || '',
      unitcost: angka(keg.unitcost),
      rancangan, diajukan, sisa,
      persen: rancangan ? Math.round((diajukan / rancangan) * 100) : 0,
      status,
      rincian: (v.details || []).map((d) => ({ kabupaten: d.nama_kabupaten || '', volume: angka(d.total_volume) })),
      kabupaten: keg.kabupaten_kota || '',
      tahun: keg.tahun || '',
      galat: '',
    };
  }

  /**
   * Kumpulkan seluruh kuota kegiatan untuk kabupaten akun yang login.
   * api: { bidang, komoditas, kegiatan, detail } · opsi: { subsektor, onProgres(i, n, teks), dihentikan() }
   * Return { baris, galat: [teks], kabupaten, tahun }
   */
  async function kumpulkan(api, opsi = {}) {
    const lapor = opsi.onProgres || (() => {});
    const henti = opsi.dihentikan || (() => false);
    const subs = daftarSubsektor(opsi.subsektor);
    const galat = [];
    const fatal = (e) => !!(api.SesiHabis && e instanceof api.SesiHabis); // sesi habis → hentikan semua

    // 1. Telusuri pohon dropdown → daftar kegiatan unik
    const kegiatan = new Map(); // id → { keg, sub }
    for (let i = 0; i < subs.length && !henti(); i++) {
      const sub = subs[i];
      lapor(i, subs.length, `Membaca daftar kegiatan ${sub.nama}`);
      try {
        for (const b of await api.bidang(sub.id)) {
          const koms = await api.komoditas(sub.id, b.id);
          const daftar = await petaParalel(koms, (k) => api.kegiatan(b.id, sub.id, k.id));
          for (const k of daftar.flat()) if (k && k.id != null && !kegiatan.has(k.id)) kegiatan.set(k.id, { keg: k, sub });
        }
      } catch (e) {
        if (fatal(e)) throw e;
        galat.push(`${sub.nama}: ${e.message}`);
      }
    }

    // 2. Ringkasan volume tiap kegiatan
    const isi = [...kegiatan.values()];
    let selesai = 0;
    const baris = await petaParalel(isi, async ({ keg, sub }) => {
      if (henti()) return null;
      let b;
      try {
        const d = await api.detail(keg.id, keg.kode_propinsi);
        b = barisKuota({ ...keg, ...(d && d.kegiatan) }, d && d.volume_summary, sub);
      } catch (e) {
        if (fatal(e)) throw e;
        b = barisKuota(keg, null, sub);
        b.galat = e.message;
      }
      lapor(++selesai, isi.length, `Mengambil kuota: ${b.kegiatan}`);
      return b;
    });

    const ada = baris.filter(Boolean);
    const contoh = isi[0] && isi[0].keg;
    return {
      baris: urutkan(ada),
      galat,
      kabupaten: contoh ? contoh.kabupaten_kota || '' : '',
      tahun: contoh ? contoh.tahun || '' : '',
      lengkap: !henti(),
    };
  }

  const URUT_SUB = new Map(SUBSEKTOR_CADANGAN.map((s, i) => [s.nama, i]));
  function urutkan(baris) {
    return [...baris].sort((a, b) =>
      (URUT_SUB.has(a.subsektor) ? URUT_SUB.get(a.subsektor) : 99) - (URUT_SUB.has(b.subsektor) ? URUT_SUB.get(b.subsektor) : 99) ||
      a.subsektor.localeCompare(b.subsektor) || a.komoditas.localeCompare(b.komoditas) ||
      (b.rancangan > 0) - (a.rancangan > 0) || a.kegiatan.localeCompare(b.kegiatan));
  }

  /** Saring baris: { cari, subsektor, status: 'semua'|'tersedia'|'habis', tampilKosong } */
  function saring(baris, f = {}) {
    const kata = String(f.cari || '').toLowerCase().split(/\s+/).filter(Boolean);
    return baris.filter((b) => {
      if (!f.tampilKosong && b.status === 'kosong') return false;
      if (f.subsektor && b.subsektor !== f.subsektor) return false;
      if (f.status === 'tersedia' && b.status !== 'tersedia') return false;
      if (f.status === 'habis' && b.status !== 'habis' && b.status !== 'lebih') return false;
      if (kata.length) {
        const teks = [b.kegiatan, b.komoditas, b.subsektor, b.ro, b.komponen, b.kewenangan, b.tagging].join(' ').toLowerCase();
        if (!kata.every((k) => teks.includes(k))) return false;
      }
      return true;
    });
  }

  function hitung(baris) {
    const n = { semua: baris.length, tersedia: 0, habis: 0, kosong: 0, lebih: 0 };
    for (const b of baris) n[b.status]++;
    return n;
  }

  const api = { SUBSEKTOR_CADANGAN, daftarSubsektor, namaKegiatan, petaParalel, barisKuota, kumpulkan, urutkan, saring, hitung };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EbanperKuota = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
