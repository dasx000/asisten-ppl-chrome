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

test('masalahMt: padi/jagung bukan tepat 2 PT', () => {
  assert.deepEqual(M.masalahMt(DATA[0]).map(M.teksMasalah), ['PADI hanya PT1']);
  assert.deepEqual(M.masalahMt(DATA[2]), []);
  assert.deepEqual(M.masalahMt(DATA[3]).map(M.teksMasalah), ['JAGUNG 3 PT (PT1, PT2, PT3)']);
  assert.deepEqual(M.masalahMt(DATA[5]), []); // kopi 1 PT benar
  assert.deepEqual(M.masalahMt(DATA[8]).map(M.teksMasalah), ['KOPI 2 PT (PT1, PT2), tahunan maks 1 PT']);
  assert.deepEqual(M.masalahMt(DATA[7]).map(M.teksMasalah), ['PADI hanya PT1', 'JAGUNG hanya PT2']);
});

test('cari + aksi per status, Not Valid dikecualikan, filter komoditas & poktan', () => {
  const r = M.cari(DATA);
  assert.deepEqual(r.map((x) => `${x.b.statusId}:${x.aksi}`).sort(), ['1:hapus', '1:hapus', '2:batal', '2:batal', '2:batal', '3:']);
  assert.deepEqual(M.hitung(r), { total: 6, batal: 3, hapus: 2, tanpaAksi: 1, padi: 3, jagung: 3, kopi: 1 });
  assert.deepEqual(M.cari(DATA, { komoditas: 'KOPI' }).map((x) => M.teksMasalah(x.masalah[0])), ['KOPI 2 PT (PT1, PT2), tahunan maks 1 PT']);
  assert.equal(M.cari(DATA, { komoditas: 'JAGUNG' }).length, 3);
  assert.equal(M.cari(DATA, { poktan: '2' }).length, 2);
  assert.equal(M.cari(DATA, { status: 'semua' }).length, 7);
  const g = M.kelompokkan(r, new Map([['1808022008', 'KOTAWAY']]));
  assert.deepEqual(g.map((d) => [d.nama, d.poktan.map((p) => [p.nama, p.item.length])]), [['KOTAWAY', [['POKTAN 1', 4], ['POKTAN 2', 2]]]]);
});

test('cekSebelumAksi: status harus cocok, isi tidak berubah, PT masih salah', () => {
  const [batal, hapus] = [DATA[0], DATA[1]];
  assert.equal(M.cekSebelumAksi(DATA, batal, 'batal'), '');
  assert.equal(M.cekSebelumAksi(DATA, hapus, 'hapus'), '');
  assert.match(M.cekSebelumAksi(DATA, batal, 'hapus'), /status sudah/);
  assert.match(M.cekSebelumAksi(DATA.filter((x) => x.id !== batal.id), batal, 'batal'), /tidak ada/);
  const diperbaiki = D.normalisasi(b(2, ['PADI', 'PADI', '']));
  diperbaiki.id = batal.id;
  assert.match(M.cekSebelumAksi([diperbaiki], batal, 'batal'), /berubah/);
});

test('Excel Cek PT: kelompok poktan, masalah, aksi', () => {
  const L = require('../core/laporan.js');
  const X = require('../../../common/excel.js');
  const g = M.kelompokkan(M.cari(DATA), new Map([['1808022008', 'KOTAWAY']]));
  const teks = new TextDecoder().decode(X.buat(L.susunCekMt({ filterTeks: 'Semua desa' }, g, M.teksMasalah)));
  assert.match(teks, /KOTAWAY — POKTAN 1 — 4 pengajuan/);
  assert.match(teks, /PADI hanya PT1/);
  assert.match(teks, />Batal</);
  assert.match(teks, />Hapus</);
});
