// ================= TATA LETAK LAPORAN EXCEL KUOTA ================= \\
// Menyusun lembar "Kuota" (dikelompokkan per subsektor, warna status) dan "Ringkasan" untuk EbanperExcel.buat.
// Tanpa DOM, bisa dites di Node.

(function (root) {
  'use strict';

  const W = { hijau: '1F7A4D', hijauTua: '165C3A', hijauMuda: 'E7F4EC', merah: 'B42318', merahMuda: 'FDECEA',
    oranye: 'B45309', abu: '5B6470', abuMuda: 'F1F3F5', kuningMuda: 'FFF6DB', putih: 'FFFFFF', zebra: 'FAFBFC' };
  const LABEL = { tersedia: 'Masih ada sisa', habis: 'Kuota habis', lebih: 'Melebihi kuota', kosong: 'Tanpa kuota' };
  const GAYA_STATUS = {
    tersedia: { fill: W.hijauMuda, color: W.hijauTua },
    habis: { fill: W.merahMuda, color: W.merah },
    lebih: { fill: W.merah, color: W.putih },
    kosong: { fill: W.abuMuda, color: W.abu },
  };
  const KOLOM = [
    ['No', 5], ['Komoditas', 14], ['Kegiatan', 44], ['Kewenangan', 13], ['Satuan', 9],
    ['Rancangan Pusat', 13], ['Telah Diajukan', 13], ['Sisa', 12], ['% Terpakai', 10.5], ['Status', 15],
    ['Rincian Output', 40], ['ID Kegiatan', 10],
  ];
  const N = KOLOM.length;

  const fmtAngka = (v) => (Number.isInteger(v) ? '#,##0' : '#,##0.00');
  const dasar = { border: true, valign: 'center' };

  function waktuTeks(d) {
    const t = new Date(d || Date.now());
    return `${t.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} pukul ` +
      `${String(t.getHours()).padStart(2, '0')}.${String(t.getMinutes()).padStart(2, '0')}`;
  }

  /** Kab. / KABUPATEN / Kabupaten → "Kabupaten Way Kanan" */
  function rapikanWilayah(s) {
    const t = String(s || '').trim().replace(/\s+/g, ' ');
    if (!t) return '';
    const judul = t.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
    return judul.replace(/^Kab\.?\s+/i, 'Kabupaten ').replace(/^Kota\s+/i, 'Kota ');
  }

  /**
   * data: { kabupaten, tahun, waktu } · baris: hasil EbanperKuota (sudah tersaring & terurut)
   * Return [sheetKuota, sheetRingkasan] untuk EbanperExcel.buat
   */
  function susun(data, baris) {
    const kab = rapikanWilayah(data.kabupaten);
    const n = { tersedia: 0, habis: 0, lebih: 0, kosong: 0 };
    for (const b of baris) n[b.status]++;
    const isi = (teks, s) => ({ v: teks, s });
    const kosongBaris = (s) => Array.from({ length: N }, () => (s ? { v: '', s } : null));

    // ── Lembar Kuota ──
    const rows = [];
    const tinggi = {};
    const r1 = kosongBaris(); r1[0] = isi('REKAP KUOTA PROGRAM e-BANPER', { bold: true, size: 15, color: W.hijauTua }); rows.push(r1);
    tinggi[0] = 24;
    const r2 = kosongBaris(); r2[0] = isi(`${kab || 'Kabupaten'}${data.tahun ? ` · Tahun Anggaran ${data.tahun}` : ''}`, { bold: true, size: 12 }); rows.push(r2);
    const r3 = kosongBaris();
    r3[0] = isi(`Data per ${waktuTeks(data.waktu)} · ${baris.length} kegiatan: ${n.tersedia} masih ada sisa, ` +
      `${n.habis + n.lebih} habis${n.kosong ? `, ${n.kosong} tanpa kuota` : ''}`, { italic: true, color: W.abu });
    rows.push(r3);
    rows.push(kosongBaris());
    const hdr = KOLOM.map(([k]) => isi(k, { ...dasar, bold: true, color: W.putih, fill: W.hijau, align: 'center', wrap: true }));
    rows.push(hdr);
    const barisHeader = rows.length; // 1-based nomor baris header
    tinggi[barisHeader - 1] = 32;

    let no = 0, subAktif = null;
    for (const b of baris) {
      if (b.subsektor !== subAktif) {
        subAktif = b.subsektor;
        const jml = baris.filter((x) => x.subsektor === subAktif).length;
        const g = kosongBaris({ ...dasar, fill: W.hijauMuda });
        g[0] = isi(`${subAktif.toUpperCase()}  —  ${jml} kegiatan`, { ...dasar, fill: W.hijauMuda, bold: true, color: W.hijauTua });
        rows.push(g);
        tinggi[rows.length - 1] = 20;
      }
      no++;
      const z = no % 2 === 0 ? { fill: W.zebra } : {};
      const t = { ...dasar, ...z };
      const ang = (v, extra = {}) => isi(v, { ...t, fmt: fmtAngka(v), align: 'right', ...extra });
      const habis = b.status === 'habis' || b.status === 'lebih';
      rows.push([
        isi(no, { ...t, align: 'center' }),
        isi(b.komoditas, t),
        isi(b.kegiatan, { ...t, wrap: true, bold: true }),
        isi(b.kewenangan, { ...t, align: 'center' }),
        isi(b.satuan, { ...t, align: 'center' }),
        ang(b.rancangan, { bold: true }),
        ang(b.diajukan, { color: W.oranye }),
        ang(b.sisa, { bold: true, color: habis ? W.merah : b.status === 'kosong' ? W.abu : W.hijauTua }),
        b.rancangan ? isi(b.persen / 100, { ...t, fmt: '0%', align: 'center' }) : isi('-', { ...t, align: 'center', color: W.abu }),
        isi(LABEL[b.status], { ...dasar, ...GAYA_STATUS[b.status], bold: true, align: 'center' }),
        isi(b.ro, { ...t, wrap: true, color: W.abu }),
        isi(b.id, { ...t, align: 'center', color: W.abu }),
      ]);
    }
    const barisAkhir = rows.length;
    rows.push(kosongBaris());
    const ket = [
      'Keterangan:',
      '• Rancangan Pusat = volume yang dialokasikan pusat; Telah Diajukan = akumulasi volume usulan (status 1–5); Sisa = yang masih bisa diajukan.',
      '• Kewenangan Provinsi = kuota dipakai bersama oleh kabupaten se-provinsi.',
      '• Sumber: e-Banper (ebanper.pertanian.go.id), diambil dengan akun penyuluh. Alat bantu tidak resmi, bukan aplikasi Kementerian Pertanian.',
    ];
    for (const [i, k] of ket.entries()) {
      const r = kosongBaris(); r[0] = isi(k, i ? { color: W.abu, size: 10 } : { bold: true, size: 10 }); rows.push(r);
    }

    const kuota = {
      nama: 'Kuota', kolom: KOLOM.map(([, w]) => w), baris: rows, tinggi,
      bekukan: barisHeader, filter: `A${barisHeader}:${String.fromCharCode(64 + N)}${barisAkhir}`,
      lanskap: true, judulCetak: `${barisHeader}:${barisHeader}`,
    };

    // ── Lembar Ringkasan per subsektor ──
    const subs = [...new Set(baris.map((b) => b.subsektor))];
    const adaKosong = baris.some((b) => b.status === 'kosong'); // kolom "Tanpa Kuota" hanya bila ikut diekspor
    const H = ['Subsektor', 'Jumlah Kegiatan', 'Masih Ada Sisa', 'Habis', ...(adaKosong ? ['Tanpa Kuota'] : [])];
    const kosongH = () => H.map(() => null);
    const judul = (v, s) => { const r = kosongH(); r[0] = isi(v, s); return r; };
    const rr = [
      judul('RINGKASAN PER SUBSEKTOR', { bold: true, size: 14, color: W.hijauTua }),
      judul(`${kab}${data.tahun ? ` · Tahun Anggaran ${data.tahun}` : ''} · data per ${waktuTeks(data.waktu)}`, { italic: true, color: W.abu }),
      kosongH(),
      H.map((k) => isi(k, { ...dasar, bold: true, color: W.putih, fill: W.hijau, align: 'center', wrap: true })),
    ];
    const total = H.slice(1).map(() => 0);
    for (const s of subs) {
      const x = baris.filter((b) => b.subsektor === s);
      const v = [x.length, x.filter((b) => b.status === 'tersedia').length,
        x.filter((b) => b.status === 'habis' || b.status === 'lebih').length,
        ...(adaKosong ? [x.filter((b) => b.status === 'kosong').length] : [])];
      v.forEach((a, i) => { total[i] += a; });
      rr.push([isi(s, dasar), ...v.map((a, i) => isi(a, { ...dasar, align: 'center',
        ...(i === 1 && a ? { color: W.hijauTua, bold: true } : i === 2 && a ? { color: W.merah, bold: true } : {}) }))]);
    }
    rr.push([isi('JUMLAH', { ...dasar, bold: true, fill: W.hijauMuda }),
      ...total.map((a) => isi(a, { ...dasar, bold: true, fill: W.hijauMuda, align: 'center' }))]);
    const ringkasan = { nama: 'Ringkasan', kolom: [40, 16, 16, 12, 13].slice(0, H.length), baris: rr, tinggi: { 0: 22, 3: 30 } };

    return [kuota, ringkasan];
  }

  const api = { susun, rapikanWilayah, LABEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EbanperLaporan = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
