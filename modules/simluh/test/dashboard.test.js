// Jalankan (dari root): npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../core/dashboard.js');

const JUDUL = ['No', 'Nama', 'Nama', 'NIK', 'Tempat/Tgl Lahir', 'Alamat', 'Jenis Kelamin', 'No Hp', 'StatusKenggotaan',
  'KomoditasYangDiusahakan(1)', 'Volume(Ha,Ekor,unit)', 'KomoditasYangDiusahakan(2)', 'Volume(Ha,Ekor,unit)',
  'KomoditasYangDiusahakan(3)', 'Volume(Ha,Ekor,unit)', 'KomoditasLainnya', 'Total LuasLahan YangDiuasahakan(Ha)',
  'Total LuasLahan YangDimiliki (Ha)', 'Kategori Petani', 'Titik Koordinat'];
const b = (k1, v1, k2 = '', v2 = '', k3 = '', v3 = '') => ['1', 'A', 'A', '1808000000000001', 'x', 'x', 'L', '08', 'Anggota',
  k1, v1, k2, v2, k3, v3, '', '', '', '', ''];

test('angka & namaKomoditas', () => {
  assert.equal(D.angka('0,5'), 0.5);
  assert.equal(D.angka('1.25'), 1.25);
  assert.equal(D.angka(''), 0);
  assert.equal(D.namaKomoditas(' kopi  '), 'Kopi');
  assert.equal(D.namaKomoditas('KAMBING/DOMBA'), 'Kambing/Domba');
});

test('uraiAnggota: tiga pasang komoditas-volume, tanpa nama/NIK', () => {
  const a = D.uraiAnggota(JUDUL, [b('Kopi', '2', 'Jagung', '0,5'), ['Tidak ada data']]);
  assert.equal(a.length, 1);
  assert.deepEqual(a[0], { komoditas: [{ nama: 'Kopi', volume: 2 }, { nama: 'Jagung', volume: 0.5 }] });
  assert.ok(!JSON.stringify(a).includes('1808000000000001'));
});

test('rekap: luas per komoditas, ternak dipisah, filter desa, petani dihitung sekali', () => {
  const data = [
    { desa: 'KOTAWAY', poktan: 'A', anggota: D.uraiAnggota(JUDUL, [b('Kopi', '2', 'Jagung', '1'), b('Kopi', '1', 'Kopi', '0,5'), b('Kambing/Domba', '5')]) },
    { desa: 'SUKAJADI', poktan: 'B', anggota: D.uraiAnggota(JUDUL, [b('Padi', '1'), b('Jagung', '0,5')]) },
  ];
  const r = D.rekap(data);
  assert.equal(r.poktan, 2);
  assert.equal(r.anggota, 5);
  assert.equal(r.anggotaTanaman, 4);
  assert.deepEqual(r.tanaman.map((x) => [x.komoditas, x.petani, x.luas]), [['Kopi', 2, 3.5], ['Jagung', 2, 1.5], ['Padi', 1, 1]]);
  assert.deepEqual(r.ternak, [{ komoditas: 'Kambing/Domba', petani: 1, ekor: 5 }]);
  assert.equal(r.totalLuas, 6);
  assert.deepEqual(r.daftarDesa, ['KOTAWAY', 'SUKAJADI']);
  const s = D.rekap(data, { desa: 'SUKAJADI' });
  assert.equal(s.totalLuas, 1.5);
  assert.deepEqual(s.perDesa.map((d) => d.desa), ['SUKAJADI']);
});
