// Jalankan (dari root): npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../core/duplikasi.js');
const U = require('../core/upload.js');

const NAMA = new Map([['1808022008', 'KOTAWAY'], ['1808022014', 'SUKAJADI']]);
const MASTER = [
  { id_poktan: 1, nama_poktan: 'KOJA', nama_desa_erdkk: 'KOTAWAY' },
  { id_poktan: 2, nama_poktan: 'MAKMUR I', nama_desa_erdkk: 'KOTAWAY' },
  { id_poktan: 3, nama_poktan: 'KWT CITRA TANI', nama_desa_erdkk: 'KOTAWAY' },
  { id_poktan: 4, nama_poktan: 'KWT CITRA TANI', nama_desa_erdkk: 'KOTAWAY' },
  { id_poktan: 5, nama_poktan: 'HARAPAN MAJU', nama_desa_erdkk: 'SUKAJADI' },
  { id_poktan: 6, nama_poktan: 'KARYA MAKMUR', nama_desa_erdkk: 'SUKAJADI' },
];
let id = 1;
const b = (desa, poktan, st, kom) => {
  const x = { id: id++, farmer_name: 'P' + id, farmer_nik: '1' + id, subsector: 'X', farmer_group_id: 900 + id, farmer_group_name: poktan,
    sub_district_code: desa, district_code: '180802', status: { id: st, name: { 1: 'Belum dikirim ke Korluh', 2: 'Menunggu persetujuan Korluh', 95: 'Not Valid' }[st] } };
  kom.forEach((k, i) => { x[`mt${i + 1}_commodity`] = k; x[`mt${i + 1}_planting_area`] = '1'; });
  return x;
};
const DATA = [
  b('1808022008', 'KOJA', 2, ['JAGUNG', 'JAGUNG']), b('1808022008', 'KOJA', 2, ['JAGUNG', 'JAGUNG']), b('1808022008', 'KOJA', 1, ['KOPI']),
  b('1808022008', 'Koja ', 2, ['PADI', 'PADI']), // ejaan beda → tetap cocok (huruf/angka saja)
  b('1808022014', 'HARAPAN MAJU', 95, ['KOPI']), // Not Valid saja → belum upload
  b('1808022014', 'POKTAN BARU', 2, ['KOPI']), // tidak ada di master
].map(D.normalisasi);

test('statusUpload: sudah/belum, komoditas & jumlah petani, Not Valid tidak dihitung', () => {
  const r = U.statusUpload(MASTER, DATA, NAMA);
  const p = Object.fromEntries(r.filter((x) => !x.dobelMaster).map((x) => [x.nama, x]));
  assert.equal(p.KOJA.sudah, true);
  assert.equal(p.KOJA.pengajuan, 4);
  assert.equal(U.teksKomoditas(p.KOJA), 'JAGUNG 2 petani · KOPI 1 petani · PADI 1 petani');
  assert.deepEqual(p.KOJA.status, { 'Menunggu persetujuan Korluh': 3, 'Belum dikirim ke Korluh': 1 });
  assert.equal(p['MAKMUR I'].sudah, false);
  assert.equal(p['HARAPAN MAJU'].sudah, false);
  assert.equal(p['POKTAN BARU'].diluarMaster, true);
  assert.equal(r.filter((x) => x.nama === 'KWT CITRA TANI').every((x) => x.kwt && x.dobelMaster), true);
});

test('saring & perDesa: KWT dipisah, filter desa & sudah/belum', () => {
  const r = U.statusUpload(MASTER, DATA, NAMA);
  assert.deepEqual(U.saring(r).map((x) => x.nama), ['KOJA', 'MAKMUR I', 'HARAPAN MAJU', 'KARYA MAKMUR', 'POKTAN BARU']);
  assert.equal(U.saring(r, { jenis: 'kwt' }).length, 2);
  assert.equal(U.saring(r, { jenis: 'semua' }).length, 7);
  assert.deepEqual(U.saring(r, { upload: 'belum', desa: 'SUKAJADI' }).map((x) => x.nama), ['HARAPAN MAJU', 'KARYA MAKMUR']);
  const s = U.perDesa(U.saring(r));
  assert.deepEqual(s.desa, [{ desa: 'KOTAWAY', total: 2, sudah: 1, belum: 1 }, { desa: 'SUKAJADI', total: 3, sudah: 1, belum: 2 }]);
  assert.deepEqual(s.total, { total: 5, sudah: 2, belum: 3 });
  assert.equal(U.apaKwt('K.W.T. Mawar'), true);
  assert.equal(U.apaKwt('KWARTA JAYA'), false);
});

test('Excel status upload: grup desa, sudah/belum, ringkasan per desa', () => {
  const L = require('../core/laporan.js');
  const X = require('../../../common/excel.js');
  const r = U.statusUpload(MASTER, DATA, NAMA);
  const list = U.saring(r);
  const teks = new TextDecoder().decode(X.buat(L.susunUpload({ filterTeks: 'Semua' }, list, U.perDesa(list), U.teksKomoditas)));
  assert.match(teks, /KOTAWAY — 1 dari 2 sudah upload/);
  assert.match(teks, /JAGUNG 2 petani · KOPI 1 petani · PADI 1 petani/);
  assert.match(teks, /RINGKASAN PER DESA/);
  assert.match(teks, /Tidak ditemukan di master poktan/);
});
