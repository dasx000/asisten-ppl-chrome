// ================= STATUS UPLOAD RDKK PER POKTAN ================= \\
// Membandingkan master Kelompok Tani e-RDKK (/api/poktan) dengan data pengajuan: poktan yang punya ≥1 pengajuan
// aktif (bukan ditolak/batal/Not Valid) = "sudah upload". ID poktan di master berbeda dengan di pengajuan, jadi
// pencocokan memakai nama desa + nama poktan (huruf/angka saja). Tanpa DOM, bisa dites di Node.

(function (root) {
  'use strict';

  const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const kunci = (desa, poktan) => `${norm(desa)}|${norm(poktan)}`;
  /** Kelompok Wanita Tani */
  const apaKwt = (nama) => /^\s*K\.?\s*W\.?\s*T\b|WANITA\s*TANI/i.test(String(nama || ''));

  /**
   * master: baris /api/poktan ({ id_poktan, nama_poktan, nama_desa_erdkk, ... }) · baris: pengajuan ternormalisasi
   * namaDesa: Map kode desa → nama. Return [{ id, nama, desa, kwt, sudah, pengajuan, komoditas: [{komoditas, petani}],
   *   status: {nama: jumlah}, dobelMaster, diluarMaster }]
   */
  function statusUpload(master, baris, namaDesa = new Map()) {
    // kumpulkan pengajuan aktif per (desa, poktan)
    const peng = new Map();
    for (const b of baris) {
      if (b.dikecualikan) continue;
      const desa = namaDesa.get(b.desa) || b.desa;
      const k = kunci(desa, b.poktan);
      if (!peng.has(k)) peng.set(k, { desa, poktan: b.poktan, baris: [] });
      peng.get(k).baris.push(b);
    }
    const jumlahMaster = new Map();
    for (const p of master) {
      const k = kunci(p.nama_desa_erdkk, p.nama_poktan);
      jumlahMaster.set(k, (jumlahMaster.get(k) || 0) + 1);
    }
    const ringkas = (rows) => {
      const kom = new Map(), status = {};
      for (const b of rows) {
        for (const k of new Set(b.mt.map((m) => m.komoditas.toUpperCase()).filter(Boolean))) kom.set(k, (kom.get(k) || 0) + 1);
        status[b.status] = (status[b.status] || 0) + 1;
      }
      return { komoditas: [...kom].map(([komoditas, petani]) => ({ komoditas, petani })).sort((a, b) => b.petani - a.petani || a.komoditas.localeCompare(b.komoditas)), status };
    };
    const hasil = [];
    const dipakai = new Set();
    for (const p of master) {
      const k = kunci(p.nama_desa_erdkk, p.nama_poktan);
      const x = peng.get(k);
      dipakai.add(k);
      const r = x ? ringkas(x.baris) : { komoditas: [], status: {} };
      hasil.push({
        id: String(p.id_poktan || ''), nama: String(p.nama_poktan || '').trim().replace(/\s+/g, ' ').toUpperCase(), desa: String(p.nama_desa_erdkk || '').trim().toUpperCase(),
        kwt: apaKwt(p.nama_poktan), sudah: !!x, pengajuan: x ? x.baris.length : 0, ...r,
        dobelMaster: jumlahMaster.get(k) > 1, diluarMaster: false,
      });
    }
    // poktan yang punya pengajuan tapi tidak ditemukan di master (nama berbeda) → tetap ditampilkan sebagai sudah
    for (const [k, x] of peng) {
      if (dipakai.has(k)) continue;
      hasil.push({ id: '', nama: String(x.poktan).trim().toUpperCase(), desa: String(x.desa).toUpperCase(), kwt: apaKwt(x.poktan), sudah: true, pengajuan: x.baris.length,
        ...ringkas(x.baris), dobelMaster: false, diluarMaster: true });
    }
    return hasil.sort((a, b) => a.desa.localeCompare(b.desa) || a.nama.localeCompare(b.nama));
  }

  /** f: { desa, upload: ''|'sudah'|'belum', jenis: 'poktan'|'kwt'|'semua', cari } */
  function saring(list, f = {}) {
    const kata = String(f.cari || '').toLowerCase().trim();
    return list.filter((p) => {
      if (f.desa && p.desa !== f.desa) return false;
      if (f.upload === 'sudah' && !p.sudah) return false;
      if (f.upload === 'belum' && p.sudah) return false;
      if ((f.jenis || 'poktan') === 'poktan' && p.kwt) return false;
      if (f.jenis === 'kwt' && !p.kwt) return false;
      if (kata && !p.nama.toLowerCase().includes(kata)) return false;
      return true;
    });
  }

  /** Ringkasan per desa: [{ desa, total, sudah, belum }] + total */
  function perDesa(list) {
    const m = new Map();
    for (const p of list) {
      if (!m.has(p.desa)) m.set(p.desa, { desa: p.desa, total: 0, sudah: 0, belum: 0 });
      const d = m.get(p.desa);
      d.total++; if (p.sudah) d.sudah++; else d.belum++;
    }
    const desa = [...m.values()].sort((a, b) => a.desa.localeCompare(b.desa));
    const total = desa.reduce((t, d) => ({ total: t.total + d.total, sudah: t.sudah + d.sudah, belum: t.belum + d.belum }), { total: 0, sudah: 0, belum: 0 });
    return { desa, total };
  }

  const teksKomoditas = (p) => p.komoditas.map((k) => `${k.komoditas} ${k.petani} petani`).join(' · ');

  const api = { norm, kunci, apaKwt, statusUpload, saring, perDesa, teksKomoditas };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ErdkkUpload = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
