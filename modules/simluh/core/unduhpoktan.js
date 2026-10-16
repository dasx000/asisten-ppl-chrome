// ================= DOWNLOAD POKTAN: CETAK EXCEL ANGGOTA SEMUA POKTAN DI DESA TERPILIH (ZIP) ================= \\
// Dipakai content/unduhpoktan.js di halaman List Kelompok Tani. Tanpa DOM global & tanpa jaringan langsung
// (fungsi unduh disuntikkan) supaya bisa dites di Node.
// Susunan ZIP: DESA/01 NAMA POKTAN.xls  (+ DAFTAR ISI.csv)
// Berkas = file "Cetak Excel" bawaan SIMLUH (cetakanggotapoktan?ip=…), ip sama dengan link "Tambah Anggota".

(function (root) {
  'use strict';

  const CETAK_URL = 'https://simluh.pertanian.go.id/cetakanggotapoktan';

  function bersih(s) {
    const t = String(s == null ? '' : s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
    return t || 'TANPA NAMA';
  }
  const nomor = (n, lebar = 2) => String(n).padStart(lebar, '0');
  const rapi = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const desaKey = (s) => rapi(s).toUpperCase();

  /** "Daftar Kelompok Tani di Kecamatan Kasui" → "Kasui" */
  function namaKecamatan(doc) {
    for (const el of doc.querySelectorAll('h1, h2, h3, h4, h5')) {
      const m = rapi(el.textContent).match(/Daftar Kelompok Tani di Kecamatan\s+(.+)$/i);
      if (m) return m[1].trim();
    }
    return '';
  }

  /**
   * Urai tabel #tblPoktan dari HTML halaman listpoktan (server mengirim semua baris; DataTables hanya memecah halaman).
   * Return [{ nama, id, jumlah, desa, ketua, ip }]
   */
  function uraiDaftar(doc) {
    const tabel = doc.getElementById('tblPoktan') || doc.querySelector('table');
    const hasil = [];
    for (const tr of tabel ? tabel.querySelectorAll('tbody tr') : []) {
      const td = tr.querySelectorAll('td');
      if (td.length < 6) continue;
      const link = td[1].querySelector('a[href*="listpoktananggota"]');
      const ip = link ? new URL(link.getAttribute('href'), 'https://simluh.pertanian.go.id/').searchParams.get('ip') : '';
      if (!ip) continue;
      const toggle = td[1].querySelector('.dropdown-toggle, a');
      hasil.push({
        nama: rapi(toggle ? toggle.textContent : td[1].textContent),
        id: rapi(td[2].textContent),
        jumlah: parseInt(rapi(td[3].textContent), 10) || 0,
        desa: desaKey(td[4].textContent),
        ketua: rapi(td[5].textContent),
        ip,
      });
    }
    return hasil;
  }

  /** Ringkasan per desa: [{ desa, poktan, anggota }] urut abjad */
  function daftarDesa(poktan) {
    const m = new Map();
    for (const p of poktan) {
      const d = m.get(p.desa) || { desa: p.desa, poktan: 0, anggota: 0 };
      d.poktan++; d.anggota += p.jumlah;
      m.set(p.desa, d);
    }
    return [...m.values()].sort((a, b) => a.desa.localeCompare(b.desa, 'id'));
  }

  const urlCetak = (ip) => `${CETAK_URL}?ip=${encodeURIComponent(ip)}`;

  /** Jenis berkas dari tanda tangan byte: Excel 97 (.xls, OLE) atau .xlsx (ZIP). null = bukan Excel. */
  function jenisExcel(u8) {
    if (!u8 || u8.length < 4) return null;
    if (u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0) return 'xls';
    if (u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 0x03 && u8[3] === 0x04) return 'xlsx';
    return null;
  }

  /** Antrian tugas dengan n pekerja paralel; berhenti ambil tugas baru saat henti() true. */
  async function kolam(tugas, n, kerja, henti = () => false) {
    let i = 0;
    const pekerja = Array.from({ length: Math.max(1, Math.min(n, tugas.length)) }, async () => {
      while (i < tugas.length && !henti()) {
        const t = tugas[i++];
        await kerja(t);
      }
    });
    await Promise.all(pekerja);
  }

  /** Poktan dari desa terpilih, urut desa lalu nama, beri nomor urut per desa & nama berkas (tanpa ekstensi). */
  function susunTugas(poktan, desaDipilih) {
    const pilih = new Set([...desaDipilih].map(desaKey));
    const per = new Map();
    for (const p of poktan) {
      if (!pilih.has(p.desa)) continue;
      if (!per.has(p.desa)) per.set(p.desa, []);
      per.get(p.desa).push(p);
    }
    const tugas = [];
    for (const desa of [...per.keys()].sort((a, b) => a.localeCompare(b, 'id'))) {
      const daftar = per.get(desa).sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }) || a.id.localeCompare(b.id));
      const lebar = Math.max(2, String(daftar.length).length);
      daftar.forEach((p, i) => tugas.push({ ...p, no: i + 1, dasar: `${bersih(desa)}/${nomor(i + 1, lebar)} ${bersih(p.nama)}` }));
    }
    return tugas;
  }

  /**
   * Unduh semua Cetak Excel. unduh(url) → Promise<Uint8Array> (boleh melempar error).
   * Return { berkas: [[path, Uint8Array]], log: [{ desa, no, poktan, id_poktan, anggota, berkas, status }], dihentikan }
   */
  async function jalankan({ poktan, desa, unduh, onProgres = () => {}, henti = () => false, paralel = 3, galatFatal = () => false }) {
    const tugas = susunTugas(poktan, desa);
    const hasil = new Map();
    const p = { tahap: 'unduh', selesai: 0, total: tugas.length, berkas: 0, byte: 0, gagal: 0 };
    onProgres(p);
    let fatal = null;
    await kolam(tugas, paralel, async (t) => {
      let entri;
      try {
        const u8 = await unduh(urlCetak(t.ip));
        const jenis = jenisExcel(u8);
        if (!jenis) throw new Error('respons server bukan file Excel');
        entri = { t, path: `${t.dasar}.${jenis}`, u8, status: 'OK' };
        p.berkas++; p.byte += u8.length;
      } catch (e) {
        if (galatFatal(e)) { fatal = fatal || e; return; }
        entri = { t, path: '', status: `GAGAL: ${e.message}` };
        p.gagal++;
      }
      hasil.set(t, entri);
      p.selesai++;
      onProgres({ ...p });
    }, () => henti() || !!fatal);
    if (fatal) throw fatal;

    const berkas = [], log = [];
    for (const t of tugas) {
      const e = hasil.get(t);
      if (e && e.u8) berkas.push([e.path, e.u8]);
      log.push({ desa: t.desa, no: t.no, poktan: t.nama, id_poktan: t.id, anggota: t.jumlah, ketua: t.ketua,
        berkas: e ? e.path : '', status: e ? e.status : 'DIHENTIKAN' });
    }
    return { berkas, log, dihentikan: hasil.size < tugas.length };
  }

  function daftarIsi(log) {
    const kol = ['desa', 'no', 'poktan', 'id_poktan', 'anggota', 'ketua', 'berkas', 'status'];
    const sel = (v) => { const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return '﻿' + [kol.map((k) => k.toUpperCase()).join(';'), ...log.map((r) => kol.map((k) => sel(r[k])).join(';'))].join('\r\n');
  }

  /** Nama ZIP: "Anggota Poktan - Kec Kasui - KEDATON.zip" / "... - 3 Desa.zip" */
  function namaZip(kecamatan, desa) {
    const d = [...desa];
    const bagDesa = d.length === 1 ? bersih(d[0]) : `${d.length} Desa`;
    return `Anggota Poktan - ${kecamatan ? `Kec ${bersih(kecamatan)} - ` : ''}${bagDesa}.zip`;
  }

  const api = { bersih, namaKecamatan, uraiDaftar, daftarDesa, urlCetak, jenisExcel, kolam, susunTugas, jalankan, daftarIsi, namaZip };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SimluhUnduhPoktan = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
