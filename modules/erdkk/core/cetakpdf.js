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

  const nomor = (n, lebar = 2) => String(n).padStart(lebar, '0');

  /** "03 MUKTI JAYA - JAGUNG - YOGI TANI.pdf" (nomor urut dalam satu desa supaya urutan cetak jelas). */
  function namaBerkas({ no, lebar = 2, poktan, komoditas, kios, bagian = 1, totalBagian = 1 }) {
    return `${nomor(no, lebar)} ${bersih(poktan)} - ${bersih(komoditas)} - ${bersih(kios)}${totalBagian > 1 ? ` (bagian ${bagian})` : ''}.pdf`;
  }

  /**
   * Daftar pekerjaan (poktan × komoditas × kios) per desa.
   * desa: [{ kode, nama, kecamatan, no? }] · poktan: Map kode → [{ id, nama }] · kios: Map kode → [{ id, nama }]
   * Folder: KECAMATAN/NN DESA (NN = no desa, urut abjad semua desa). Nama poktan kembar dalam satu desa diberi id.
   */
  function susunTugas(desa, poktan, kios, komoditas = KOMODITAS) {
    const tugas = [];
    desa.forEach((d, i) => {
      const pk = poktan.get(d.kode) || [], ks = kios.get(d.kode) || [];
      const hitung = new Map();
      for (const p of pk) { const n = bersih(p.nama); hitung.set(n, (hitung.get(n) || 0) + 1); }
      for (const p of pk) {
        const label = hitung.get(bersih(p.nama)) > 1 ? `${bersih(p.nama)} (${p.id})` : bersih(p.nama);
        komoditas.forEach((k, urutKom) => {
          for (const ki of ks) {
            tugas.push({
              desa: d, poktan: p, kios: ki, komoditas: k, label, urutKom,
              folder: `${bersih(d.kecamatan)}/${nomor(d.no || i + 1)} ${bersih(d.nama)}`,
              param: { desa: d.kode, poktan: String(p.id), subsectors: k.subsektor, commodities: k.nama, kios: String(ki.id) },
            });
          }
        });
      }
    });
    return tugas;
  }

  /** Beri nomor urut per desa: poktan A–Z → komoditas (padi, jagung, kopi) → kios → bagian. */
  function beriNomor(item) {
    const perFolder = new Map();
    for (const x of item) {
      if (!perFolder.has(x.t.folder)) perFolder.set(x.t.folder, []);
      perFolder.get(x.t.folder).push(x);
    }
    for (const daftar of perFolder.values()) {
      daftar.sort((a, b) => a.t.label.localeCompare(b.t.label, 'id') || a.t.urutKom - b.t.urutKom ||
        String(a.t.kios.nama).localeCompare(String(b.t.kios.nama), 'id') || a.bagian - b.bagian);
      const lebar = Math.max(2, String(daftar.length).length);
      daftar.forEach((x, i) => {
        x.jalur = `${x.t.folder}/${namaBerkas({ no: i + 1, lebar, poktan: x.t.label, komoditas: x.t.komoditas.nama, kios: x.t.kios.nama, bagian: x.bagian, totalBagian: x.totalBagian })}`;
      });
    }
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
    const item = [], gagalCek = [];
    await kolam(tugas, paralel, async (t) => {
      const dasar = { kecamatan: t.desa.kecamatan, desa: t.desa.nama, poktan: t.poktan.nama, komoditas: t.komoditas.nama, kios: t.kios.nama };
      try {
        const c = await A.ambilJson(`/api/cetak-count?${qs(t.param)}`, fetchFn);
        const baris = Number(c && c.total_rows) || 0, bagian = Number(c && c.total_parts) || 0;
        for (let b = 1; b <= bagian && !henti(); b++) {
          const x = { t, dasar, bagian: b, totalBagian: bagian, baris, data: null, status: 'OK' };
          try {
            x.data = await ambilPdf({ ...t.param, part: b }, fetchFn);
            p.pdf++; p.byte += x.data.length;
          } catch (e) {
            if (e instanceof A.SesiHabis) throw e;
            p.gagal++;
            x.status = `GAGAL: ${e.message}`;
          }
          item.push(x);
        }
      } catch (e) {
        if (e instanceof A.SesiHabis) throw e;
        p.gagal++;
        gagalCek.push({ ...dasar, bagian: '', baris: '', berkas: '', status: `GAGAL cek jumlah: ${e.message}` });
      }
      p.dicek++; lapor(p);
    }, henti);

    beriNomor(item);
    const berkas = item.filter((x) => x.data).map((x) => [x.jalur, x.data]).sort((a, b) => a[0].localeCompare(b[0], 'id'));
    const log = [...item.map((x) => ({ ...x.dasar, bagian: x.bagian, baris: x.baris, berkas: x.jalur, status: x.status })), ...gagalCek]
      .sort((a, b) => String(a.berkas).localeCompare(String(b.berkas), 'id'));
    p.tahap = 'selesai'; lapor(p);
    return { berkas, log, dihentikan: henti() };
  }

  /** Daftar isi (CSV, pemisah titik koma supaya langsung rapi di Excel Indonesia). */
  function daftarIsi(log) {
    const kol = ['kecamatan', 'desa', 'poktan', 'komoditas', 'kios', 'bagian', 'baris', 'berkas', 'status'];
    const sel = (v) => { const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return '﻿' + [kol.map((k) => k.toUpperCase()).join(';'), ...log.map((r) => kol.map((k) => sel(r[k])).join(';'))].join('\r\n');
  }

  const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const apaKwt = (nama) => /^\s*K\.?\s*W\.?\s*T\b|WANITA\s*TANI/i.test(String(nama || ''));

  /**
   * Rekap poktan: berapa kelompok tani terdaftar (Master Data → Kelompok Tani, desa terpilih) yang punya PDF
   * RDKK padi/jagung/kopi. ID master berbeda dengan ID di pengajuan, jadi dicocokkan lewat nama desa + nama poktan.
   * master: baris /api/poktan · namaDesa: nama desa terpilih · log: hasil jalankan()
   * Return { daftar: [{ desa, nama, kwt, ada, komoditas: [], pdf, diluarMaster }], terdaftar, ada, belum, kwt: {terdaftar, ada}, diluarMaster }
   */
  function rekapPoktan(master, namaDesa, log) {
    const desaPilih = new Set(namaDesa.map(norm));
    const pdf = new Map();
    for (const r of log) {
      if (r.status !== 'OK') continue;
      const k = `${norm(r.desa)}|${norm(r.poktan)}`;
      if (!pdf.has(k)) pdf.set(k, { desa: r.desa, nama: r.poktan, komoditas: new Set(), pdf: 0 });
      const x = pdf.get(k); x.komoditas.add(r.komoditas); x.pdf++;
    }
    const daftar = [], dipakai = new Set();
    for (const m of master || []) {
      if (!desaPilih.has(norm(m.nama_desa_erdkk))) continue;
      const k = `${norm(m.nama_desa_erdkk)}|${norm(m.nama_poktan)}`;
      if (dipakai.has(k)) continue; // nama kembar di master dihitung sekali
      dipakai.add(k);
      const x = pdf.get(k);
      daftar.push({ desa: String(m.nama_desa_erdkk || '').trim().toUpperCase(), nama: String(m.nama_poktan || '').trim().replace(/\s+/g, ' ').toUpperCase(),
        kwt: apaKwt(m.nama_poktan), ada: !!x, komoditas: x ? [...x.komoditas] : [], pdf: x ? x.pdf : 0, diluarMaster: false });
    }
    for (const [k, x] of pdf) {
      if (dipakai.has(k)) continue;
      daftar.push({ desa: String(x.desa).toUpperCase(), nama: String(x.nama).toUpperCase(), kwt: apaKwt(x.nama), ada: true,
        komoditas: [...x.komoditas], pdf: x.pdf, diluarMaster: true });
    }
    daftar.sort((a, b) => a.desa.localeCompare(b.desa, 'id') || Number(b.ada) - Number(a.ada) || a.nama.localeCompare(b.nama, 'id'));
    const terdaftar = daftar.filter((x) => !x.diluarMaster);
    return {
      daftar,
      terdaftar: terdaftar.length,
      ada: terdaftar.filter((x) => x.ada).length,
      belum: terdaftar.filter((x) => !x.ada).length,
      kwt: { terdaftar: terdaftar.filter((x) => x.kwt).length, ada: terdaftar.filter((x) => x.kwt && x.ada).length },
      diluarMaster: daftar.filter((x) => x.diluarMaster).length,
    };
  }

  /** REKAP POKTAN.csv */
  function csvPoktan(rekap) {
    const sel = (v) => { const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const baris = rekap.daftar.map((x) => [x.desa, x.nama, x.kwt ? 'KWT' : 'POKTAN', x.ada ? 'ADA' : 'BELUM ADA',
      x.komoditas.join(', '), x.pdf, x.diluarMaster ? 'Tidak ditemukan di Master Data Kelompok Tani (nama berbeda?)' : ''].map(sel).join(';'));
    return '\ufeff' + ['DESA;KELOMPOK TANI;JENIS;RDKK PADI/JAGUNG/KOPI;KOMODITAS;JUMLAH PDF;CATATAN', ...baris].join('\r\n');
  }

  const api = { rekapPoktan, csvPoktan, KOMODITAS, bersih, namaBerkas, susunTugas, jalankan, daftarIsi, kolam };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ErdkkCetakPdf = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
