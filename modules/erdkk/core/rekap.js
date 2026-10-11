// ================= REKAP LUAS LAHAN e-RDKK PER KAMPUNG → POKTAN → KOMODITAS ================= \\
// Luas per tahun = luas LAHAN, dihitung sekali per baris per komoditas (MT tidak dijumlah; bila luas antar MT
// berbeda diambil yang terbesar). Pupuk per tahun = jumlah MT1–MT3 untuk komoditas itu.
// Data dihitung apa adanya (salinan dobel ikut terhitung). Tanpa DOM, bisa dites di Node.

(function (root) {
  'use strict';

  const PUPUK_REKAP = [['urea', 'Urea'], ['npk', 'NPK'], ['npk_formula', 'NPK Formula'], ['organic', 'Organik']];
  const bulat = (n) => Math.round(n * 1000) / 1000; // hindari 0.1+0.2 = 0.30000000000000004

  /** Satu baris pengajuan → [{ komoditas, luas, pupuk }] (satu entri per komoditas yang ditanam). */
  function perKomoditas(b) {
    const peta = new Map();
    for (const m of b.mt) {
      if (!m.komoditas) continue;
      const k = m.komoditas.toUpperCase();
      if (!peta.has(k)) peta.set(k, { komoditas: k, luas: 0, pupuk: Object.fromEntries(PUPUK_REKAP.map(([p]) => [p, 0])) });
      const x = peta.get(k);
      x.luas = Math.max(x.luas, m.luas || 0);
      for (const [p] of PUPUK_REKAP) x.pupuk[p] += m.pupuk[p] || 0;
    }
    return [...peta.values()];
  }

  /**
   * Saring baris: { desa, poktan, status } — status: '' (aktif: kecuali ditolak/batal/Not Valid), 'semua', atau id status.
   */
  function saringBaris(baris, f = {}) {
    return baris.filter((b) => {
      if (f.status === 'semua') { /* semua */ } else if (f.status) { if (String(b.statusId) !== String(f.status)) return false; } else if (b.dikecualikan) return false;
      if (f.desa && b.desa !== f.desa) return false;
      if (f.poktan && b.poktanId !== f.poktan) return false;
      return true;
    });
  }

  const kosong = () => ({ petani: 0, luas: 0, pupuk: Object.fromEntries(PUPUK_REKAP.map(([p]) => [p, 0])) });
  function tambah(t, x) {
    t.petani += 1;
    t.luas = bulat(t.luas + x.luas);
    for (const [p] of PUPUK_REKAP) t.pupuk[p] = bulat(t.pupuk[p] + x.pupuk[p]);
  }

  /**
   * Rekap bertingkat. namaDesa: Map kode → nama.
   * Return { desa: [{ kode, nama, total, poktan: [{ id, nama, total, komoditas: [{ komoditas, ...total }] }] }],
   *          total, perKomoditas: [{ komoditas, ...total }], jumlahBaris }
   */
  function rekap(baris, namaDesa = new Map()) {
    const desa = new Map();
    const total = kosong();
    const perKom = new Map();
    for (const b of baris) {
      for (const x of perKomoditas(b)) {
        if (!desa.has(b.desa)) desa.set(b.desa, { kode: b.desa, nama: namaDesa.get(b.desa) || `Desa ${b.desa}`, total: kosong(), poktan: new Map() });
        const d = desa.get(b.desa);
        if (!d.poktan.has(b.poktanId)) d.poktan.set(b.poktanId, { id: b.poktanId, nama: b.poktan || `Poktan ${b.poktanId}`, total: kosong(), komoditas: new Map() });
        const p = d.poktan.get(b.poktanId);
        if (!p.komoditas.has(x.komoditas)) p.komoditas.set(x.komoditas, { komoditas: x.komoditas, ...kosong() });
        if (!perKom.has(x.komoditas)) perKom.set(x.komoditas, { komoditas: x.komoditas, ...kosong() });
        for (const t of [p.komoditas.get(x.komoditas), p.total, d.total, total, perKom.get(x.komoditas)]) tambah(t, x);
      }
    }
    const urut = (a, b) => a.nama.localeCompare(b.nama);
    return {
      desa: [...desa.values()].sort(urut).map((d) => ({
        ...d,
        poktan: [...d.poktan.values()].sort(urut).map((p) => ({
          ...p, komoditas: [...p.komoditas.values()].sort((a, b) => a.komoditas.localeCompare(b.komoditas)),
        })),
      })),
      total,
      perKomoditas: [...perKom.values()].sort((a, b) => b.luas - a.luas || a.komoditas.localeCompare(b.komoditas)),
      jumlahBaris: baris.length,
    };
  }

  /** Pilihan filter dari data: desa, poktan (opsional dalam desa tertentu), status. */
  function pilihan(baris, namaDesa = new Map(), desaTerpilih = '') {
    const desa = new Map(), poktan = new Map(), status = new Map();
    for (const b of baris) {
      if (b.desa) desa.set(b.desa, namaDesa.get(b.desa) || `Desa ${b.desa}`);
      if (b.poktanId && (!desaTerpilih || b.desa === desaTerpilih)) poktan.set(b.poktanId, b.poktan || `Poktan ${b.poktanId}`);
      status.set(String(b.statusId), b.status);
    }
    const daftar = (m) => [...m].map(([id, nama]) => ({ id, nama })).sort((a, b) => a.nama.localeCompare(b.nama));
    return { desa: daftar(desa), poktan: daftar(poktan), status: [...status].map(([id, nama]) => ({ id, nama })).sort((a, b) => a.id - b.id) };
  }

  const api = { PUPUK_REKAP, perKomoditas, saringBaris, rekap, pilihan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ErdkkRekap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
