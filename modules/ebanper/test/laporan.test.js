// Jalankan (dari root): npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../../../common/excel.js');
const L = require('../core/laporan.js');

/** Baca ZIP tanpa kompresi hasil X.buat → Map nama → teks, sekaligus cek CRC. */
function bukaZip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const isi = new Map();
  let p = 0;
  while (dv.getUint32(p, true) === 0x04034b50) {
    const crc = dv.getUint32(p + 14, true), uk = dv.getUint32(p + 18, true), nl = dv.getUint16(p + 26, true);
    const nama = new TextDecoder().decode(u8.slice(p + 30, p + 30 + nl));
    const data = u8.slice(p + 30 + nl, p + 30 + nl + uk);
    assert.equal(X.crc32(data), crc, `CRC ${nama}`);
    isi.set(nama, new TextDecoder().decode(data));
    p += 30 + nl + uk;
  }
  return isi;
}

const b = (id, sub, status, extra = {}) => ({
  id, subsektor: sub, komoditas: 'Padi', kegiatan: `Keg <${id}> & "x"`, ro: 'RO', kewenangan: 'Kab/Kota', satuan: 'Hektar',
  rancangan: 100, diajukan: 40, sisa: 60, persen: 40, status, ...extra,
});

test('kolom huruf & crc32', () => {
  assert.deepEqual([0, 11, 25, 26, 27].map(X.kolom), ['A', 'L', 'Z', 'AA', 'AB']);
  assert.equal(X.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('rapikanWilayah', () => {
  assert.equal(L.rapikanWilayah('KABUPATEN WAY KANAN'), 'Kabupaten Way Kanan');
  assert.equal(L.rapikanWilayah('KAB. WAY KANAN'), 'Kabupaten Way Kanan');
  assert.equal(L.rapikanWilayah('Kabupaten Way Kanan'), 'Kabupaten Way Kanan');
  assert.equal(L.rapikanWilayah('KOTA BANDAR LAMPUNG'), 'Kota Bandar Lampung');
});

test('laporan: xlsx valid, kelompok subsektor, teks di-escape, gaya & filter ada', () => {
  const baris = [b(1, 'Tanaman Pangan (TP)', 'tersedia'), b(2, 'Tanaman Pangan (TP)', 'habis', { sisa: 0, diajukan: 100, persen: 100 }),
    b(3, 'Perkebunan (BUN)', 'kosong', { rancangan: 0, diajukan: 0, sisa: 0, persen: 0 }), b(4, 'Perkebunan (BUN)', 'tersedia', { rancangan: 2.5, sisa: 2.5, diajukan: 0 })];
  const sheets = L.susun({ kabupaten: 'KAB. WAY KANAN', tahun: 2026, waktu: '2026-10-11T01:40:00Z' }, baris);
  const z = bukaZip(X.buat(sheets));
  for (const f of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'])
    assert.ok(z.has(f), f);
  const s1 = z.get('xl/worksheets/sheet1.xml');
  assert.match(s1, /Keg &lt;1&gt; &amp; &quot;x&quot;/);
  assert.match(s1, /TANAMAN PANGAN \(TP\) {2}— {2}2 kegiatan/);
  assert.match(s1, /PERKEBUNAN \(BUN\)/);
  assert.match(s1, /Kabupaten Way Kanan · Tahun Anggaran 2026/);
  assert.match(s1, /<autoFilter ref="A5:L11"\/>/); // header baris 5, 2 grup + 4 kegiatan → sampai baris 11
  assert.match(s1, /state="frozen"/);
  const st = z.get('xl/styles.xml');
  assert.match(st, /FF1F7A4D/); // hijau header
  assert.match(st, /numFmtId="4"/); // format bawaan #,##0.00 untuk 2,5
  assert.match(z.get('xl/workbook.xml'), /_xlnm\.Print_Titles/);
  const s2 = z.get('xl/worksheets/sheet2.xml');
  assert.match(s2, /JUMLAH/);
});
