// ================= DASHBOARD REKAP LUAS LAHAN PER KOMODITAS (HOME SIMLUHTAN) ================= \\
// Sumber: halaman Anggota Poktan SIMLUHTAN (kolom Komoditas yang Diusahakan 1–3 + Volume).
// Tanaman dijumlah dalam hektar; ternak (satuan ekor) dipisah. Tanpa DOM, bisa dites di Node.

(function (root) {
  'use strict';

  const TERNAK = /sapi|kerbau|kambing|domba|babi|kuda|ayam|itik|bebek|entok|mentok|angsa|puyuh|kelinci|unggas|ternak|lebah|ikan|lele|nila|gurame|patin|udang/i;
  const apaTernak = (k) => TERNAK.test(String(k || ''));
  const rapi = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  /** "2", "0,5", "1.25" → angka; kosong/teks → 0 */
  function angka(s) {
    const t = rapi(s).replace(/[^\d.,-]/g, '');
    if (!t) return 0;
    const n = parseFloat(t.includes(',') && !t.includes('.') ? t.replace(',', '.') : t.replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  /** Nama komoditas seragam: "kopi " / "KOPI" → "Kopi" */
  const namaKomoditas = (k) => rapi(k).toLowerCase().replace(/(^|[\s/(-])\S/g, (c) => c.toUpperCase());

  /**
   * Cari posisi kolom dari judul tabel anggota. Return { pasangan: [[iKomoditas, iVolume] ×3], nama }
   * Judul contoh: "KomoditasYangDiusahakan(1)", "Volume(Ha,Ekor,unit)", …
   */
  function kolomAnggota(judul) {
    const j = judul.map((x) => rapi(x).toLowerCase().replace(/\s+/g, ''));
    const pasangan = [];
    j.forEach((t, i) => {
      if (/^komoditasyangdiusahakan\(?\d/.test(t)) pasangan.push([i, j[i + 1] && j[i + 1].startsWith('volume') ? i + 1 : -1]);
    });
    return { pasangan };
  }

  /**
   * Ubah baris tabel anggota (larik sel teks) jadi [{ komoditas: [{nama, volume}] }]. Tidak menyimpan nama/NIK.
   */
  function uraiAnggota(judul, baris) {
    const { pasangan } = kolomAnggota(judul);
    const hasil = [];
    for (const sel of baris) {
      if (!sel || sel.length < judul.length - 2) continue; // baris "tidak ada data"
      const kom = [];
      for (const [ik, iv] of pasangan) {
        const nama = rapi(sel[ik]);
        if (!nama || nama === '-') continue;
        kom.push({ nama: namaKomoditas(nama), volume: iv >= 0 ? angka(sel[iv]) : 0 });
      }
      hasil.push({ komoditas: kom });
    }
    return hasil;
  }

  /**
   * Rekap. data: [{ desa, poktan, anggota: [{komoditas:[{nama, volume}]}] }] · opsi.desa: '' = semua
   * Return { poktan, anggota, anggotaTanaman, tanaman: [{komoditas, petani, luas, rata}], ternak: [{komoditas, petani, ekor}],
   *          totalLuas, perDesa: [{desa, poktan, anggota, luas, perKomoditas: {nama: luas}}], daftarDesa }
   */
  function rekap(data, opsi = {}) {
    const daftarDesa = [...new Set(data.map((p) => p.desa))].sort((a, b) => a.localeCompare(b, 'id'));
    const dipilih = data.filter((p) => !opsi.desa || p.desa === opsi.desa);
    const tan = new Map(), ter = new Map(), desa = new Map();
    let anggota = 0, anggotaTanaman = 0;
    for (const p of dipilih) {
      if (!desa.has(p.desa)) desa.set(p.desa, { desa: p.desa, poktan: 0, anggota: 0, luas: 0, perKomoditas: {} });
      const d = desa.get(p.desa);
      d.poktan++;
      for (const a of p.anggota) {
        anggota++; d.anggota++;
        const perOrang = new Map();
        for (const k of a.komoditas) perOrang.set(k.nama, (perOrang.get(k.nama) || 0) + k.volume);
        let punyaTanaman = false;
        for (const [nama, vol] of perOrang) {
          if (apaTernak(nama)) {
            const x = ter.get(nama) || { komoditas: nama, petani: 0, ekor: 0 };
            x.petani++; x.ekor += vol; ter.set(nama, x);
          } else {
            punyaTanaman = true;
            const x = tan.get(nama) || { komoditas: nama, petani: 0, luas: 0 };
            x.petani++; x.luas += vol; tan.set(nama, x);
            d.luas += vol;
            d.perKomoditas[nama] = (d.perKomoditas[nama] || 0) + vol;
          }
        }
        if (punyaTanaman) anggotaTanaman++;
      }
    }
    const bulat = (n) => Math.round(n * 100) / 100;
    const tanaman = [...tan.values()].map((x) => ({ ...x, luas: bulat(x.luas), rata: x.petani ? bulat(x.luas / x.petani) : 0 }))
      .sort((a, b) => b.luas - a.luas || a.komoditas.localeCompare(b.komoditas, 'id'));
    const ternak = [...ter.values()].map((x) => ({ ...x, ekor: bulat(x.ekor) })).sort((a, b) => b.ekor - a.ekor);
    const perDesa = [...desa.values()].map((d) => ({ ...d, luas: bulat(d.luas) })).sort((a, b) => a.desa.localeCompare(b.desa, 'id'));
    return {
      poktan: dipilih.length, anggota, anggotaTanaman, tanaman, ternak, perDesa, daftarDesa,
      totalLuas: bulat(tanaman.reduce((s, x) => s + x.luas, 0)),
    };
  }

  const api = { apaTernak, angka, namaKomoditas, kolomAnggota, uraiAnggota, rekap };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SimluhDashboard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
