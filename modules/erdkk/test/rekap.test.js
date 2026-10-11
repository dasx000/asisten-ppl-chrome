// Jalankan (dari root): npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../core/duplikasi.js');
const R = require('../core/rekap.js');
const L = require('../core/laporan.js');
const X = require('../../../common/excel.js');

let id = 1;
const b = (desa, poktan, status, mt, extra = {}) => {
  const x = { id: id++, year: 2027, farmer_name: 'P' + id, farmer_nik: '18' + id, subsector: 'TANAMAN PANGAN', farmer_group_id: poktan,
    farmer_group_name: 'POKTAN ' + poktan, sub_district_code: desa, district_code: desa.slice(0, 6),
    status: { id: status, name: { 1: 'Belum dikirim ke Korluh', 2: 'Menunggu persetujuan Korluh', 95: 'Not Valid' }[status] }, ...extra };
  mt.forEach(([kom, luas, urea, npk], i) => {
    x[`mt${i + 1}_commodity`] = kom; x[`mt${i + 1}_planting_area`] = String(luas);
    x[`mt${i + 1}_urea`] = urea; x[`mt${i + 1}_npk`] = npk; x[`mt${i + 1}_npk_formula`] = 0; x[`mt${i + 1}_organic`] = 0;
  });
  return x;
};
const NAMA = new Map([['1808022008', 'TANJUNG BULAN'], ['1808022001', 'DATAR BANCONG']]);
const DATA = [
  b('1808022008', 1, 2, [['JAGUNG', 0.5, 125, 150], ['JAGUNG', 0.5, 125, 150]]), // jagung 0,5 ha (bukan 1,0), urea 250
  b('1808022008', 1, 1, [['JAGUNG', 0.5, 125, 150], ['JAGUNG', 0.5, 125, 150]]), // salinan dobel → tetap dihitung
  b('1808022008', 1, 2, [['PADI', 1, 200, 200], ['PADI', 0.75, 150, 150]]), // luas beda antar MT → ambil terbesar 1,0
  b('1808022008', 2, 2, [['KOPI', 2, 100, 100]]),
  b('1808022001', 3, 2, [['PADI', 0.25, 50, 50], ['JAGUNG', 0.25, 60, 60]]), // beda komoditas → masuk ke masing-masing
  b('1808022001', 3, 95, [['PADI', 9, 0, 0]]), // Not Valid → dikecualikan bawaan
].map(D.normalisasi);

test('perKomoditas: luas sekali per komoditas (maks antar MT), pupuk dijumlah MT', () => {
  assert.deepEqual(R.perKomoditas(DATA[0]).map((x) => [x.komoditas, x.luas, x.pupuk.urea, x.pupuk.npk]), [['JAGUNG', 0.5, 250, 300]]);
  assert.deepEqual(R.perKomoditas(DATA[2]).map((x) => [x.komoditas, x.luas, x.pupuk.urea]), [['PADI', 1, 350]]);
  assert.deepEqual(R.perKomoditas(DATA[4]).map((x) => [x.komoditas, x.luas]), [['PADI', 0.25], ['JAGUNG', 0.25]]);
});

test('rekap bertingkat desa → poktan → komoditas, Not Valid dikecualikan bawaan, dobel ikut dihitung', () => {
  const r = R.rekap(R.saringBaris(DATA, {}), NAMA);
  assert.deepEqual(r.desa.map((d) => d.nama), ['DATAR BANCONG', 'TANJUNG BULAN']);
  const tb = r.desa[1];
  assert.equal(tb.total.luas, 4); // 0,5 + 0,5 + 1 + 2
  assert.equal(tb.total.petani, 4);
  const p1 = tb.poktan.find((p) => p.id === '1');
  assert.deepEqual(p1.komoditas.map((k) => [k.komoditas, k.petani, k.luas]), [['JAGUNG', 2, 1], ['PADI', 1, 1]]);
  assert.equal(r.total.luas, 4.5);
  assert.equal(r.total.petani, 6); // baris DATAR BANCONG punya 2 komoditas → 2 entri
  assert.deepEqual(r.perKomoditas.map((k) => [k.komoditas, k.luas]), [['KOPI', 2], ['JAGUNG', 1.25], ['PADI', 1.25]]);
});

test('filter desa, poktan, status', () => {
  const luas = (f) => R.rekap(R.saringBaris(DATA, f), NAMA).total.luas;
  assert.equal(luas({ desa: '1808022001' }), 0.5);
  assert.equal(luas({ poktan: '2' }), 2);
  assert.equal(luas({ status: '1' }), 0.5);
  assert.equal(luas({ status: 'semua' }), 13.5); // termasuk Not Valid 9 ha
  const p = R.pilihan(DATA, NAMA, '1808022001');
  assert.deepEqual(p.poktan.map((x) => x.id), ['3']);
  assert.deepEqual(p.status.map((x) => x.id), ['1', '2', '95']);
});

test('Excel rekap: subtotal, total, dan lembar per komoditas', () => {
  const r = R.rekap(R.saringBaris(DATA, {}), NAMA);
  const teks = new TextDecoder().decode(X.buat(L.susunRekap({ waktu: '2026-10-11T04:00:00Z', tahun: 2027, filterTeks: 'Semua desa' }, r)));
  assert.match(teks, /SUBTOTAL TANJUNG BULAN/);
  assert.match(teks, />TOTAL</);
  assert.match(teks, /RINGKASAN PER KOMODITAS/);
  assert.match(teks, /<v>4\.5<\/v>/);
});

test('filter komoditas: baris campuran (padi MT1 + jagung MT2) hanya dihitung komoditas terpilih', () => {
  const luas = (kom) => R.rekap(R.saringBaris(DATA, { komoditas: kom }), NAMA, kom);
  const padi = luas('PADI');
  assert.equal(padi.total.luas, 1.25); // 1 (Tanjung Bulan) + 0,25 (Datar Bancong, baris campuran)
  assert.deepEqual(padi.perKomoditas.map((k) => k.komoditas), ['PADI']);
  assert.equal(luas('JAGUNG').total.luas, 1.25); // 0,5 + 0,5 + 0,25
  assert.equal(luas('KOPI').total.petani, 1);
  assert.deepEqual(R.pilihan(DATA, NAMA).komoditas.map((k) => k.id), ['JAGUNG', 'KOPI', 'PADI']);
});
