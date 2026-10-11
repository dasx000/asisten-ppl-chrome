// ================= LAPORAN EXCEL DUPLIKASI e-RDKK ================= \\
// Lembar "Duplikasi" (per kelompok NIK, warna status) + "Ringkasan" per poktan/desa, untuk AsistenExcel.buat.

(function (root) {
  'use strict';

  const W = { hijau: '1F7A4D', hijauTua: '165C3A', hijauMuda: 'E7F4EC', merah: 'B42318', merahMuda: 'FDECEA',
    oranye: 'B45309', kuningMuda: 'FFF6DB', abu: '5B6470', abuMuda: 'F1F3F5', putih: 'FFFFFF', biruMuda: 'E8F0FB', biru: '1D5FAE' };
  const KOLOM = [
    ['No', 5], ['Nama Petani', 22], ['NIK', 19], ['Subsektor', 17], ['Kelompok Tani', 20], ['Kode Desa', 12],
    ['Status', 26], ['Dibuat', 16], ['Diperbarui', 16], ['MT1', 18], ['MT2', 18], ['MT3', 18],
    ['Urea (kg)', 10], ['NPK (kg)', 10], ['Organik (kg)', 11], ['ID Pengajuan', 12],
  ];
  const N = KOLOM.length;
  const dasar = { border: true, valign: 'center' };
  const isi = (v, s) => ({ v, s });

  const dua = (x) => String(x).padStart(2, '0');
  function waktu(iso) {
    if (!iso) return '';
    const t = new Date(iso);
    if (Number.isNaN(t.getTime())) return String(iso);
    return `${dua(t.getDate())}-${dua(t.getMonth() + 1)}-${t.getFullYear()} ${dua(t.getHours())}.${dua(t.getMinutes())}`;
  }
  const jumlahPupuk = (b, k) => b.mt.reduce((s, m) => s + (m.pupuk[k] || 0), 0);
  const mtTeks = (m) => (m.komoditas ? `${m.komoditas} ${m.luas} ha` : '-');

  /**
   * info: { waktu, dicek, dikecualikan, tahun } · kelompok: hasil ErdkkDuplikasi.cari/saring
   */
  function susun(info, kelompok) {
    const luput = kelompok.filter((k) => !k.terdeteksiBawaan).length;
    const kosong = () => Array.from({ length: N }, () => null);
    const judul = (v, s) => { const r = kosong(); r[0] = isi(v, s); return r; };
    const rows = [
      judul('CEK DUPLIKASI e-RDKK LINTAS STATUS', { bold: true, size: 15, color: W.hijauTua }),
      judul(`Tahun ${info.tahun || ''} · dobel = baris identik di semua kolom (ter-upload 2x), diperiksa di SEMUA status · ${waktu(info.waktu)}`, { bold: true }),
      judul(`${info.dicek} pengajuan dicek (${info.dikecualikan} dikecualikan: ditolak/batal/Not Valid) · ${kelompok.length} data dobel, ` +
        `${luput} di antaranya TIDAK terdeteksi Monitoring Duplikasi bawaan e-RDKK`, { italic: true, color: W.abu }),
      kosong(),
      KOLOM.map(([k]) => isi(k, { ...dasar, bold: true, color: W.putih, fill: W.hijau, align: 'center', wrap: true })),
    ];
    const tinggi = { 0: 24, 4: 30 };
    const barisHeader = rows.length;

    kelompok.forEach((k, gi) => {
      const tanda = [k.terdeteksiBawaan ? 'Terdeteksi e-RDKK' : 'TIDAK terdeteksi e-RDKK', k.lintasStatus && 'Lintas status']
        .filter(Boolean).join(' · ');
      const warnaGrup = k.terdeteksiBawaan ? W.abuMuda : W.kuningMuda;
      const g = Array.from({ length: N }, () => isi('', { ...dasar, fill: warnaGrup }));
      g[0] = isi(`${gi + 1}. ${k.nama} — NIK ${k.nik} — ${k.subsektor} — ${k.poktan || 'Desa ' + k.desa} — ${k.baris.length} baris — ${tanda}`,
        { ...dasar, fill: warnaGrup, bold: true, color: k.terdeteksiBawaan ? W.abu : W.merah });
      rows.push(g);
      tinggi[rows.length - 1] = 20;
      k.baris.forEach((b, i) => {
        const draf = b.statusId === 1;
        const t = dasar;
        rows.push([
          isi(i + 1, { ...t, align: 'center', color: W.abu }),
          isi(b.nama, { ...t, bold: true }),
          isi(b.nik, { ...t, align: 'center' }), // teks agar tidak jadi notasi E
          isi(b.subsektor, t),
          isi(b.poktan, t),
          isi(b.desa, { ...t, align: 'center' }),
          isi(b.status, { ...t, bold: true, fill: draf ? W.biruMuda : W.hijauMuda, color: draf ? W.biru : W.hijauTua }),
          isi(waktu(b.dibuat), { ...t, align: 'center' }),
          isi(waktu(b.diubah), { ...t, align: 'center' }),
          ...b.mt.map((m) => isi(mtTeks(m), t)),
          isi(jumlahPupuk(b, 'urea'), { ...t, fmt: '#,##0', align: 'right' }),
          isi(jumlahPupuk(b, 'npk') + jumlahPupuk(b, 'npk_formula'), { ...t, fmt: '#,##0', align: 'right' }),
          isi(jumlahPupuk(b, 'organic'), { ...t, fmt: '#,##0', align: 'right' }),
          isi(String(b.id), { ...t, align: 'center', color: W.abu }),
        ]);
      });
    });
    const barisAkhir = rows.length;
    rows.push(kosong());
    [
      ['Keterangan:', { bold: true, size: 10 }],
      ['• Kuning = TIDAK terdeteksi Monitoring Duplikasi bawaan e-RDKK (fitur bawaan hanya memeriksa data "Belum dikirim ke Korluh").', { size: 10, color: W.abu }],
      ['• Status biru = Belum dikirim ke Korluh (masih bisa dihapus penyuluh). Status hijau = sudah dikirim/diproses, koordinasikan dengan Korluh.', { size: 10, color: W.abu }],
      ['• Pupuk = jumlah MT1–MT3. Alat bantu tidak resmi, bukan aplikasi Kementerian Pertanian.', { size: 10, color: W.abu }],
    ].forEach(([v, s]) => rows.push(judul(v, s)));

    const sheet1 = {
      nama: 'Duplikasi', kolom: KOLOM.map(([, w]) => w), baris: rows, tinggi, bekukan: barisHeader,
      filter: kelompok.length ? `A${barisHeader}:P${barisAkhir}` : null, lanskap: true, judulCetak: `${barisHeader}:${barisHeader}`,
    };

    // Ringkasan per wilayah
    const peta = new Map();
    for (const k of kelompok) {
      const nama = k.poktan || k.poktanId;
      if (!peta.has(nama)) peta.set(nama, { nik: 0, baris: 0, luput: 0, lintas: 0 });
      const r = peta.get(nama);
      r.nik++; r.baris += k.baris.length; if (!k.terdeteksiBawaan) r.luput++; if (k.lintasStatus) r.lintas++;
    }
    const H = ['Kelompok Tani', 'Data Dobel', 'Baris Terlibat', 'Tidak Terdeteksi e-RDKK', 'Lintas Status'];
    const rr = [
      [isi('RINGKASAN DUPLIKASI PER KELOMPOK TANI', { bold: true, size: 14, color: W.hijauTua }), null, null, null, null],
      [isi(`Diperiksa ${waktu(info.waktu)}`, { italic: true, color: W.abu }), null, null, null, null],
      [null, null, null, null, null],
      H.map((k) => isi(k, { ...dasar, bold: true, color: W.putih, fill: W.hijau, align: 'center', wrap: true })),
    ];
    const tot = [0, 0, 0, 0];
    for (const [nama, r] of [...peta].sort((a, b) => b[1].nik - a[1].nik)) {
      const v = [r.nik, r.baris, r.luput, r.lintas];
      v.forEach((a, i) => { tot[i] += a; });
      rr.push([isi(nama, dasar), ...v.map((a, i) => isi(a, { ...dasar, align: 'center', ...(i === 2 && a ? { bold: true, color: W.merah } : {}) }))]);
    }
    rr.push([isi('JUMLAH', { ...dasar, bold: true, fill: W.hijauMuda }), ...tot.map((a) => isi(a, { ...dasar, bold: true, fill: W.hijauMuda, align: 'center' }))]);
    const sheet2 = { nama: 'Ringkasan', kolom: [32, 12, 14, 16, 13], baris: rr, tinggi: { 0: 22, 3: 30 } };
    return [sheet1, sheet2];
  }

  // ─── Rekap luas per kampung → poktan → komoditas ───────────────────────────
  const KOLOM_REKAP = [['No', 5], ['Kampung/Desa', 20], ['Kelompok Tani', 24], ['Komoditas', 14], ['Jumlah Petani', 10],
    ['Luas Lahan (ha)', 12], ['Urea (kg)', 11], ['NPK (kg)', 11], ['NPK Formula (kg)', 12], ['Organik (kg)', 11]];
  const PUPUK = ['urea', 'npk', 'npk_formula', 'organic'];

  /** info: { waktu, tahun, filterTeks } · r: hasil ErdkkRekap.rekap */
  function susunRekap(info, r) {
    const N = KOLOM_REKAP.length;
    const kosong = () => Array.from({ length: N }, () => null);
    const judul = (v, s) => { const x = kosong(); x[0] = isi(v, s); return x; };
    const angka = (t, gaya) => [
      isi(t.petani, { ...dasar, align: 'center', ...gaya }),
      isi(t.luas, { ...dasar, fmt: '#,##0.00', align: 'right', bold: true, ...gaya }),
      ...PUPUK.map((p) => isi(t.pupuk[p], { ...dasar, fmt: '#,##0', align: 'right', ...gaya })),
    ];
    const rows = [
      judul('REKAP LUAS LAHAN e-RDKK PER KAMPUNG, KELOMPOK TANI, DAN KOMODITAS', { bold: true, size: 15, color: W.hijauTua }),
      judul(`Tahun ${info.tahun || ''} · luas lahan per tahun (dihitung sekali, bukan per MT) · pupuk = jumlah MT1–MT3`, { bold: true }),
      judul(`${info.filterTeks || 'Semua data'} · ${r.jumlahBaris} pengajuan · diambil ${waktu(info.waktu)}`, { italic: true, color: W.abu }),
      kosong(),
      KOLOM_REKAP.map(([k]) => isi(k, { ...dasar, bold: true, color: W.putih, fill: W.hijau, align: 'center', wrap: true })),
    ];
    const tinggi = { 0: 24, 4: 32 };
    const barisHeader = rows.length;
    let no = 0;
    for (const d of r.desa) {
      for (const p of d.poktan) {
        p.komoditas.forEach((k, i) => {
          no++;
          rows.push([
            isi(no, { ...dasar, align: 'center', color: W.abu }),
            isi(i === 0 ? d.nama : '', dasar),
            isi(i === 0 ? p.nama : '', { ...dasar, bold: i === 0 }),
            isi(k.komoditas, dasar),
            ...angka(k, {}),
          ]);
        });
        rows.push([isi('', { ...dasar, fill: W.abuMuda }), isi('', { ...dasar, fill: W.abuMuda }),
          isi(`Subtotal ${p.nama}`, { ...dasar, fill: W.abuMuda, italic: true }), isi('', { ...dasar, fill: W.abuMuda }),
          ...angka(p.total, { fill: W.abuMuda, italic: true })]);
      }
      rows.push([isi('', { ...dasar, fill: W.hijauMuda }), isi(`SUBTOTAL ${d.nama.toUpperCase()}`, { ...dasar, fill: W.hijauMuda, bold: true, color: W.hijauTua }),
        isi('', { ...dasar, fill: W.hijauMuda }), isi('', { ...dasar, fill: W.hijauMuda }),
        ...angka(d.total, { fill: W.hijauMuda, bold: true, color: W.hijauTua })]);
    }
    rows.push([isi('', { ...dasar, fill: W.hijau }), isi('TOTAL', { ...dasar, fill: W.hijau, bold: true, color: W.putih }),
      isi('', { ...dasar, fill: W.hijau }), isi('', { ...dasar, fill: W.hijau }), ...angka(r.total, { fill: W.hijau, bold: true, color: W.putih })]);
    rows.push(kosong());
    rows.push(judul('Keterangan: luas lahan dihitung sekali per petani per komoditas (MT tidak dijumlah). Data dihitung apa adanya, ' +
      'termasuk salinan dobel bila ada. Alat bantu tidak resmi, bukan aplikasi Kementerian Pertanian.', { size: 10, color: W.abu }));
    const s1 = { nama: 'Rekap Luas', kolom: KOLOM_REKAP.map(([, w]) => w), baris: rows, tinggi, bekukan: barisHeader,
      lanskap: true, judulCetak: `${barisHeader}:${barisHeader}` };

    // Ringkasan per komoditas
    const H = ['Komoditas', 'Jumlah Petani', 'Luas Lahan (ha)', 'Urea (kg)', 'NPK (kg)', 'NPK Formula (kg)', 'Organik (kg)'];
    const rr = [
      [isi('RINGKASAN PER KOMODITAS', { bold: true, size: 14, color: W.hijauTua }), null, null, null, null, null, null],
      [isi(info.filterTeks || 'Semua data', { italic: true, color: W.abu }), null, null, null, null, null, null],
      [null, null, null, null, null, null, null],
      H.map((k) => isi(k, { ...dasar, bold: true, color: W.putih, fill: W.hijau, align: 'center', wrap: true })),
      ...r.perKomoditas.map((k) => [isi(k.komoditas, { ...dasar, bold: true }), ...angka(k, {})]),
      [isi('TOTAL', { ...dasar, bold: true, fill: W.hijauMuda }), ...angka(r.total, { fill: W.hijauMuda, bold: true })],
    ];
    const s2 = { nama: 'Per Komoditas', kolom: [18, 12, 14, 12, 12, 14, 12], baris: rr, tinggi: { 0: 22, 3: 32 } };
    return [s1, s2];
  }

  const api = { susun, susunRekap, waktu };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ErdkkLaporan = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
