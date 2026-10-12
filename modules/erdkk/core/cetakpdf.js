// ================= UNDUH SEMUA PDF CETAK DATA (ZIP) ================= \\
// Memakai API yang sama dengan menu Cetak Data e-RDKK (hanya baca / GET):
//   api/farmer?desa=…                 → kelompok tani per desa (farmer_group_id, farmer_group_name)
//   api/kios?desa=…                   → kios per desa (id, name)
//   api/cetak-count?desa&poktan&subsectors&commodities&kios → { total_rows, rows_per_part, total_parts }
//   api/cetak-pdf?…&part=n            → berkas PDF (maks. rows_per_part baris per bagian)
// Kelima filter wajib terisi (tanpa kios hasilnya 0), jadi setiap poktan × komoditas × kios dicek satu per satu.
// Susunan ZIP: KECAMATAN/DESA/POKTAN/KOMODITAS - POKTAN - KIOS[ (bagian n)].pdf

(function (root) {
  'use strict';

  const KOMODITAS = [
    { nama: 'PADI', subsektor: 'TANAMAN PANGAN' },
    { nama: 'JAGUNG', subsektor: 'TANAMAN PANGAN' },
    { nama: 'KOPI', subsektor: 'PERKEBUNAN' },
  ];
  const JEDA_ULANG = [2, 5];
  const tidur = (d) => new Promise((r) => setTimeout(r, d * 1000));

  /** Nama aman untuk folder/berkas di Windows. */
  function bersih(s) {
    const t = String(s == null ? '' : s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
    return t || 'TANPA NAMA';
  }

  function namaBerkas({ komoditas, poktan, kios, bagian = 1, totalBagian = 1 }) {
    return `${bersih(komoditas)} - ${bersih(poktan)} - ${bersih(kios)}${totalBagian > 1 ? ` (bagian ${bagian})` : ''}.pdf`;
  }

  /**
   * Daftar pekerjaan (poktan × komoditas × kios) per desa.
   * desa: [{ kode, nama, kecamatan }] · poktan: Map kode → [{ id, nama }] · kios: Map kode → [{ id, nama }]
   * Nama folder poktan yang kembar dalam satu desa diberi id supaya tidak tertimpa.
   */
  function susunTugas(desa, poktan, kios, komoditas = KOMODITAS) {
    const tugas = [];
    for (const d of desa) {
      const pk = poktan.get(d.kode) || [], ks = kios.get(d.kode) || [];
      const hitung = new Map();
      for (const p of pk) { const n = bersih(p.nama); hitung.set(n, (hitung.get(n) || 0) + 1); }
      for (const p of pk) {
        const folderPoktan = hitung.get(bersih(p.nama)) > 1 ? `${bersih(p.nama)} (${p.id})` : bersih(p.nama);
        for (const k of komoditas) {
          for (const ki of ks) {
            tugas.push({
              desa: d, poktan: p, kios: ki, komoditas: k,
              folder: `${bersih(d.kecamatan)}/${bersih(d.nama)}/${folderPoktan}`,
              param: { desa: d.kode, poktan: String(p.id), subsectors: k.subsektor, commodities: k.nama, kios: String(ki.id) },
            });
          }
        }
      }
    }
    return tugas;
  }

  const qs = (o) => new URLSearchParams(o).toString();

  async function ambilPdf(param, fetchFn) {
    for (let i = 0; ; i++) {
      let r, data;
      try {
        r = await fetchFn(`/api/cetak-pdf?${qs(param)}`, { credentials: 'include', cache: 'no-store' });
        if (r.status === 401 || r.status === 419) throw new root.ErdkkApi.SesiHabis();
        data = new Uint8Array(await r.arrayBuffer());
        const pdf = data.length > 4 && data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46; // %PDF
        if (r.ok && pdf) return data;
        if (!r.ok && r.status < 500 && r.status !== 429) throw new Error(`HTTP ${r.status}`);
        if (r.ok && !pdf && /<form|login|password/i.test(new TextDecoder().decode(data.slice(0, 4000)))) throw new root.ErdkkApi.SesiHabis();
        throw new Error(r.ok ? 'bukan berkas PDF' : `HTTP ${r.status}`);
      } catch (e) {
        if (e instanceof root.ErdkkApi.SesiHabis) throw e;
        if (i >= JEDA_ULANG.length) throw e;
        await tidur(JEDA_ULANG[i]);
      }
    }
  }

  /** Jalankan fungsi atas daftar dengan batas paralel. */
  async function kolam(daftar, paralel, fn, henti) {
    let i = 0;
    const pekerja = Array.from({ length: Math.min(paralel, daftar.length) }, async () => {
      while (i < daftar.length && !henti()) {
        const x = daftar[i++];
        await fn(x);
      }
    });
    await Promise.all(pekerja);
  }

  /**
   * Unduh semua PDF. opsi: { desa:[{kode,nama,kecamatan}], fetch, paralel, onProgres(p), henti() }
   * Return { berkas: [[jalur, Uint8Array]], log: [ {…, status} ], dihentikan }
   */
  async function jalankan(opsi) {
    const A = root.ErdkkApi;
    const fetchFn = opsi.fetch || (root.fetch && root.fetch.bind(root));
    const henti = opsi.henti || (() => false);
    const lapor = opsi.onProgres || (() => {});
    const paralel = opsi.paralel || 3;
    const p = { tahap: 'daftar', desaSelesai: 0, desaTotal: opsi.desa.length, dicek: 0, totalCek: 0, pdf: 0, gagal: 0, byte: 0 };
    lapor(p);

    // 1. poktan & kios per desa
    const poktan = new Map(), kios = new Map();
    await kolam(opsi.desa, paralel, async (d) => {
      const [f, k] = await Promise.all([
        A.ambilJson(`/api/farmer?${qs({ desa: d.kode })}`, fetchFn),
        A.ambilJson(`/api/kios?${qs({ desa: d.kode })}`, fetchFn),
      ]);
      poktan.set(d.kode, (Array.isArray(f) ? f : []).map((x) => ({ id: x.farmer_group_id, nama: x.farmer_group_name })).filter((x) => x.id != null));
      kios.set(d.kode, (Array.isArray(k) ? k : []).map((x) => ({ id: x.id, nama: x.name })).filter((x) => x.id != null));
      p.desaSelesai++; lapor(p);
    }, henti);

    // 2. cek jumlah baris tiap kombinasi, unduh PDF yang ada isinya
    const tugas = susunTugas(opsi.desa, poktan, kios, opsi.komoditas || KOMODITAS);
    Object.assign(p, { tahap: 'unduh', totalCek: tugas.length });
    lapor(p);
    const berkas = [], log = [];
    await kolam(tugas, paralel, async (t) => {
      const dasar = { kecamatan: t.desa.kecamatan, desa: t.desa.nama, poktan: t.poktan.nama, komoditas: t.komoditas.nama, kios: t.kios.nama };
      try {
        const c = await A.ambilJson(`/api/cetak-count?${qs(t.param)}`, fetchFn);
        const baris = Number(c && c.total_rows) || 0, bagian = Number(c && c.total_parts) || 0;
        for (let b = 1; b <= bagian && !henti(); b++) {
          const nama = namaBerkas({ komoditas: t.komoditas.nama, poktan: t.poktan.nama, kios: t.kios.nama, bagian: b, totalBagian: bagian });
          const jalur = `${t.folder}/${nama}`;
          try {
            const data = await ambilPdf({ ...t.param, part: b }, fetchFn);
            berkas.push([jalur, data]);
            p.pdf++; p.byte += data.length;
            log.push({ ...dasar, bagian: b, baris, berkas: jalur, status: 'OK' });
          } catch (e) {
            if (e instanceof A.SesiHabis) throw e;
            p.gagal++;
            log.push({ ...dasar, bagian: b, baris, berkas: jalur, status: `GAGAL: ${e.message}` });
          }
        }
      } catch (e) {
        if (e instanceof A.SesiHabis) throw e;
        p.gagal++;
        log.push({ ...dasar, bagian: '', baris: '', berkas: '', status: `GAGAL cek jumlah: ${e.message}` });
      }
      p.dicek++; lapor(p);
    }, henti);

    berkas.sort((a, b) => a[0].localeCompare(b[0], 'id'));
    log.sort((a, b) => String(a.berkas).localeCompare(String(b.berkas), 'id'));
    p.tahap = 'selesai'; lapor(p);
    return { berkas, log, dihentikan: henti() };
  }

  /** Daftar isi (CSV, pemisah titik koma supaya langsung rapi di Excel Indonesia). */
  function daftarIsi(log) {
    const kol = ['kecamatan', 'desa', 'poktan', 'komoditas', 'kios', 'bagian', 'baris', 'berkas', 'status'];
    const sel = (v) => { const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return '﻿' + [kol.map((k) => k.toUpperCase()).join(';'), ...log.map((r) => kol.map((k) => sel(r[k])).join(';'))].join('\r\n');
  }

  const api = { KOMODITAS, bersih, namaBerkas, susunTugas, jalankan, daftarIsi, kolam };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ErdkkCetakPdf = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
