// Jalankan (dari root): npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../core/duplikasi.js');
const M = require('../core/cekmt.js');

let id = 1;
const b = (st, mt, extra = {}) => {
  const x = { id: id++, year: 2027, farmer_name: 'P' + id, farmer_nik: '18' + id, subsector: 'TANAMAN PANGAN', farmer_group_id: extra.poktan || 1,
    farmer_group_name: 'POKTAN ' + (extra.poktan || 1), sub_district_code: '1808022008', district_code: '180802',
    status: { id: st, name: { 1: 'Belum dikirim ke Korluh', 2: 'Menunggu persetujuan Korluh', 3: 'Menunggu persetujuan Kasie', 95: 'Not Valid' }[st] } };
  mt.forEach((kom, i) => { x[`mt${i + 1}_commodity`] = kom; x[`mt${i + 1}_planting_area`] = kom ? '0.500' : '0.000'; });
  return x;
};
const DATA = [
  b(2, ['PADI', '', '']), // padi 1 PT → batal
  b(1, ['JAGUNG', '', '']), // jagung 1 PT → hapus
  b(2, ['PADI', 'PADI', '']), // benar
  b(2, ['JAGUNG', 'JAGUNG', 'JAGUNG']), // jagung 3 PT → batal
  b(3, ['PADI', '', '']), // salah tapi di Kasie → tanpa aksi
  b(2, ['KOPI', '', '']), // kopi 1 PT → benar
  b(95, ['PADI', '', '']), // Not Valid → dikecualikan
  b(2, ['PADI', 'JAGUNG', ''], { poktan: 2 }), // padi 1 + jagung 1 → dua masalah
  b(1, ['KOPI', 'KOPI', ''], { poktan: 2 }), // kopi 2 PT → salah (tahunan), hapus
].map(D.normalisasi);

const A = { PADI: { pt: 2 }, JAGUNG: { pt: 2 }, KOPI: { pt: 1 } }; // aturan uji

test('analisis: PT mayoritas per komoditas dari pengajuan aktif, seri → lebih kecil & ragu, data sedikit', () => {
  const data = [
    ...Array.from({ length: 6 }, () => b(2, ['JAGUNG', 'JAGUNG', 'JAGUNG'])),
    b(1, ['JAGUNG', 'JAGUNG', '']),
    b(95, ['JAGUNG', '', '']), // Not Valid → tidak dihitung
    b(2, ['PADI', 'PADI', '']), b(2, ['PADI', 'PADI', '']),
    b(2, ['PADI', '', '']), b(2, ['PADI', '', '']),
    b(2, ['PADI', 'JAGUNG', '']), // campuran: padi 1 PT & jagung 1 PT, dihitung terpisah
    b(2, ['KOPI', '', '']),
  ].map(D.normalisasi);
  const r = M.analisis(data);
  assert.deepEqual(r.map((x) => [x.komoditas, x.total, x.pt, x.persen, x.ragu, x.sedikit]), [
    ['JAGUNG', 8, 3, 75, false, false],
    ['PADI', 5, 1, 60, false, false],
    ['KOPI', 1, 1, 100, false, true],
  ]);
  assert.deepEqual(r[0].sebaran, { 1: 1, 2: 1, 3: 6 });
  const seri = M.analisis([b(2, ['PADI', 'PADI', '']), b(2, ['PADI', '', ''])].map(D.normalisasi))[0];
  assert.deepEqual([seri.pt, seri.ragu], [1, true]);
  const aturan = M.aturanDari(r, { PADI: 2, KOPI: 1, CABAI: 3 });
  assert.deepEqual(aturan, { JAGUNG: { pt: 3, manual: false }, PADI: { pt: 2, manual: true }, KOPI: { pt: 1, manual: false } });
  assert.equal(M.teksAturan(aturan), 'JAGUNG 3 PT · PADI 2 PT (manual) · KOPI 1 PT');
  // daerah jagung 3 PT: jagung 2 PT justru yang salah
  assert.deepEqual(M.cari(data, aturan, { komoditas: 'JAGUNG' }).map((x) => M.teksMasalah(x.masalah[0])),
    ['JAGUNG 2 PT (PT1, PT2), harus 3 PT', 'JAGUNG hanya PT2, harus 3 PT']);
});

test('masalahMt: jumlah PT harus sama dengan aturan', () => {
  assert.deepEqual(M.masalahMt(DATA[0], A).map(M.teksMasalah), ['PADI hanya PT1, harus 2 PT']);
  assert.deepEqual(M.masalahMt(DATA[2], A), []);
  assert.deepEqual(M.masalahMt(DATA[3], A).map(M.teksMasalah), ['JAGUNG 3 PT (PT1, PT2, PT3), harus 2 PT']);
  assert.deepEqual(M.masalahMt(DATA[5], A), []); // kopi 1 PT benar
  assert.deepEqual(M.masalahMt(DATA[8], A).map(M.teksMasalah), ['KOPI 2 PT (PT1, PT2), harus 1 PT']);
  assert.deepEqual(M.masalahMt(DATA[7], A).map(M.teksMasalah), ['PADI hanya PT1, harus 2 PT', 'JAGUNG hanya PT2, harus 2 PT']);
  assert.deepEqual(M.masalahMt(DATA[3], { ...A, JAGUNG: { pt: 3 } }), []);
});

test('cari + aksi per status, Not Valid dikecualikan, filter komoditas & poktan', () => {
  const r = M.cari(DATA, A);
  assert.deepEqual(r.map((x) => `${x.b.statusId}:${x.aksi}`).sort(), ['1:hapus', '1:hapus', '2:batal', '2:batal', '2:batal', '3:']);
  assert.deepEqual(M.hitung(r), { total: 6, batal: 3, hapus: 2, tanpaAksi: 1, per: { PADI: 3, JAGUNG: 3, KOPI: 1 } });
  assert.deepEqual(M.cari(DATA, A, { komoditas: 'KOPI' }).map((x) => M.teksMasalah(x.masalah[0])), ['KOPI 2 PT (PT1, PT2), harus 1 PT']);
  assert.equal(M.cari(DATA, A, { komoditas: 'JAGUNG' }).length, 3);
  assert.equal(M.cari(DATA, A, { poktan: '2' }).length, 2);
  assert.equal(M.cari(DATA, A, { status: 'semua' }).length, 7);
  const g = M.kelompokkan(r, new Map([['1808022008', 'KOTAWAY']]));
  assert.deepEqual(g.map((d) => [d.nama, d.poktan.map((p) => [p.nama, p.item.length])]), [['KOTAWAY', [['POKTAN 1', 4], ['POKTAN 2', 2]]]]);
});

test('cekSebelumAksi: status harus cocok, isi tidak berubah, PT masih salah', () => {
  const [batal, hapus] = [DATA[0], DATA[1]];
  assert.equal(M.cekSebelumAksi(DATA, batal, 'batal', A), '');
  assert.equal(M.cekSebelumAksi(DATA, hapus, 'hapus', A), '');
  assert.match(M.cekSebelumAksi(DATA, batal, 'hapus', A), /status sudah/);
  assert.match(M.cekSebelumAksi(DATA.filter((x) => x.id !== batal.id), batal, 'batal', A), /tidak ada/);
  assert.match(M.cekSebelumAksi(DATA, batal, 'batal', { PADI: { pt: 1 } }), /sudah benar/);
  const diperbaiki = D.normalisasi(b(2, ['PADI', 'PADI', '']));
  diperbaiki.id = batal.id;
  assert.match(M.cekSebelumAksi([diperbaiki], batal, 'batal', A), /berubah/);
});

test('Excel Cek PT: aturan, kelompok poktan, masalah, aksi', () => {
  const L = require('../core/laporan.js');
  const X = require('../../../common/excel.js');
  const g = M.kelompokkan(M.cari(DATA, A), new Map([['1808022008', 'KOTAWAY']]));
  const teks = new TextDecoder().decode(X.buat(L.susunCekMt({ filterTeks: 'Semua desa', aturanTeks: 'PADI 2 PT · JAGUNG 3 PT' }, g, M.teksMasalah)));
  assert.match(teks, /aturan PT: PADI 2 PT · JAGUNG 3 PT/);
  assert.match(teks, /KOTAWAY — POKTAN 1 — 4 pengajuan/);
  assert.match(teks, /PADI hanya PT1, harus 2 PT/);
  assert.match(teks, />Batal</);
  assert.match(teks, />Hapus</);
});
