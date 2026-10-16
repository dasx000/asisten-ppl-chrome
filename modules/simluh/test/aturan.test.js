// Jalankan (dari root): npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('../../../lib/xlsx.full.min.js');
const A = require('../core/aturan.js');

const KOMODITAS = new Map([
  ['2', 'Tanaman Pangan-Padi Sawah'],
  ['10', 'Perkebunan-Kopi'],
  ['11', 'Perkebunan-Lada'],
  ['30', 'Peternakan-Lainnya'],
  ['31', 'Perkebunan-Lainnya'],
]);

const LAMA = {
  id_anggota: '1', id_poktan: '99', nama_anggota: 'BUDI', nama_ktp: 'BUDI', jenis_kelamin: '1',
  kode_komoditas: '2', volume: '1.5', kode_komoditas2: '10', volume2: '1', kode_komoditas3: '', volume3: '',
  lainnya: '', alamat_ktp: 'RT 1', status_anggota: '1', tempat_lahir: 'KASUI', tgl_lahir: '15', bln_lahir: '8',
  thn_lahir: '1980', no_ktp: '1808000000001234', no_hp: '81200000001',
  luas_lahan_ternak_diusahakan: '2.00', luas_lahan_ternak_dimiliki: '2.00', kategori_petani_penggarap: '2',
  titik_koordinat_lahan: "4°00'00.0\"S 104°00'00.0\"E",
};

/** Baris Excel yang isinya sama persis dengan LAMA. */
const barisSama = (ubah = {}) => ({
  nama: 'BUDI', nik: '1808000000001234', ttl: 'KASUI, 15-8-1980', alamat: 'RT 1', jk: 'Laki-laki',
  no_hp: '081200000001', status: 'Anggota', kom1: 'Padi Sawah', vol1: '1.5', kom2: 'Kopi', vol2: '1',
  kom3: '', vol3: '', lainnya: '', luas_usaha: '2', luas_milik: '2', kategori: 'Pemilik dan Penggarap',
  koordinat: "4°00'00.0\"S  104°00'00.0\"E", _baris: 9, _terlaluPanjang: [], ...ubah,
});

// ─── Membaca file ──────────────────────────────────────────────────────────

const JUDUL = ['No', 'Nama', 'NIK', 'Tempat/Tgl Lahir', 'Alamat', 'Jenis Kelamin', 'No HP', 'Status Keanggotaan',
  'Komoditas 1', 'Volume Komoditas 1', 'Komoditas 2', 'Volume Komoditas 2', 'Komoditas 3', 'Volume Komoditas 3',
  'Komoditas Lainnya', 'Luas Lahan Diusahakan (Ha)', 'Luas Lahan Dimiliki (Ha)', 'Kategori Petani', 'Titik Koordinat'];

function sheetContoh() {
  return [
    ['', 'DAFTAR ANGGOTA'],
    ['', 'ID Kelompok Tani', '342635'],
    [],
    JUDUL,
    [1, 'BUDI', 1808000000001234, 'KASUI, 15-8-1980', 'RT 1', 'Laki-laki', 81200000001, 'Anggota', 'Padi Sawah', 1.5],
    [],
    [2, 'SITI', '1808000000001235'],
  ];
}

test('bacaSheet + bacaExcel: file .xls dan .xlsx', () => {
  for (const bookType of ['biff8', 'xlsx']) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetContoh()), 'Sheet1');
    const buf = XLSX.write(wb, { type: 'array', bookType });
    const { idPoktan, baris } = A.bacaExcel(A.bacaSheet(buf, XLSX));
    assert.equal(idPoktan, '342635', bookType);
    assert.equal(baris.length, 2);
    assert.equal(baris[0].nik, '1808000000001234'); // angka bulat tanpa .0 / notasi E
    assert.equal(baris[0].no_hp, '81200000001');
    assert.equal(baris[0].vol1, '1.5');
    assert.equal(baris[0]._baris, 5);
    assert.equal(baris[1]._baris, 7); // baris kosong dilewati, nomor baris tetap sesuai Excel
  }
});

test('bacaSheet menolak file bukan Excel', () => {
  const buf = new TextEncoder().encode('<html><table></table></html>').buffer;
  assert.throws(() => A.bacaSheet(buf, XLSX), A.GalatIsi);
});

test('bacaExcel: format & susunan kolom', () => {
  assert.throws(() => A.bacaExcel([['x']]), /Format file tidak dikenali/);
  const s = sheetContoh();
  s[3] = JUDUL.slice();
  s[3].splice(4, 0, 'Sisipan');
  assert.throws(() => A.bacaExcel(s), /Susunan kolom berubah/);
});

test('bacaExcel: isian terlalu panjang & batas baris', () => {
  const s = sheetContoh();
  s[4][4] = 'x'.repeat(201);
  assert.deepEqual(A.bacaExcel(s).baris[0]._terlaluPanjang, ['Alamat maks 200 karakter']);
  const banyak = sheetContoh().slice(0, 4);
  for (let i = 0; i <= A.MAKS_BARIS; i++) banyak.push([i, 'X', String(1e15 + i)]);
  assert.throws(() => A.bacaExcel(banyak), /lebih dari 1000/);
});

// ─── Membandingkan ─────────────────────────────────────────────────────────

test('bandingkan: isi sama → tidak ada perubahan, tanpa peringatan', () => {
  const r = A.bandingkan(barisSama(), LAMA, KOMODITAS);
  assert.deepEqual(r.perubahan, {});
  assert.deepEqual(r.peringatan, []);
});

test('bandingkan: angka', () => {
  assert.deepEqual(A.bandingkan(barisSama({ luas_usaha: '2,5' }), LAMA, KOMODITAS).perubahan,
    { luas_lahan_ternak_diusahakan: '2.5' });
  assert.throws(() => A.bandingkan(barisSama({ vol1: 'satu' }), LAMA, KOMODITAS), /bukan angka/);
  assert.throws(() => A.bandingkan(barisSama({ luas_milik: '-1' }), LAMA, KOMODITAS), /tidak boleh negatif/);
});

test('bandingkan: no HP', () => {
  for (const hp of ['81200000001', '081200000001', '6281200000001', '0812-0000-0001'])
    assert.deepEqual(A.bandingkan(barisSama({ no_hp: hp }), LAMA, KOMODITAS).perubahan, {}, hp);
  assert.deepEqual(A.bandingkan(barisSama({ no_hp: '81234567890' }), LAMA, KOMODITAS).perubahan, { no_hp: '081234567890' });
  assert.throws(() => A.bandingkan(barisSama({ no_hp: '0812' }), LAMA, KOMODITAS), /No HP/);
  assert.throws(() => A.bandingkan(barisSama({ no_hp: 'tidak ada' }), LAMA, KOMODITAS), /No HP/);
});

test('bandingkan: komoditas', () => {
  assert.deepEqual(A.bandingkan(barisSama({ kom2: 'Perkebunan-Lada' }), LAMA, KOMODITAS).perubahan, { kode_komoditas2: '11' });
  assert.deepEqual(A.bandingkan(barisSama({ kom2: 'lada' }), LAMA, KOMODITAS).perubahan, { kode_komoditas2: '11' });
  assert.throws(() => A.bandingkan(barisSama({ kom2: 'Lainnya' }), LAMA, KOMODITAS), /ambigu/);
  assert.throws(() => A.bandingkan(barisSama({ kom2: 'Durian Montong' }), LAMA, KOMODITAS), /tidak dikenal/);
  // 'Lainnya' yang sama dengan nilai sekarang tidak dianggap ambigu
  const lama = { ...LAMA, kode_komoditas2: '31' };
  assert.deepEqual(A.bandingkan(barisSama({ kom2: 'Lainnya' }), lama, KOMODITAS).perubahan, {});
});

test('bandingkan: pasangan komoditas–volume', () => {
  // komoditas dihapus → volume ikut dikosongkan
  const r = A.bandingkan(barisSama({ kom2: '' }), LAMA, KOMODITAS);
  assert.deepEqual(r.perubahan, { kode_komoditas2: '', volume2: '' });
  assert.ok(r.tampil.some((t) => t.kolom === 'Volume Komoditas 2' && t.baru === ''));
  assert.throws(() => A.bandingkan(barisSama({ kom3: 'Lada' }), LAMA, KOMODITAS), /Volume Komoditas 3 \(Lada\) wajib/);
  assert.throws(() => A.bandingkan(barisSama({ vol3: '2' }), LAMA, KOMODITAS), /Komoditas 3 kosong/);
  assert.throws(() => A.bandingkan(barisSama({ kom1: '', vol1: '' }), LAMA, KOMODITAS), /Komoditas 1 wajib/);
  assert.throws(() => A.bandingkan(barisSama({ kom2: 'Padi Sawah' }), LAMA, KOMODITAS), /lebih dari sekali/);
});

test('bandingkan: status, kategori, koordinat', () => {
  assert.deepEqual(A.bandingkan(barisSama({ status: 'Calon Anggota' }), LAMA, KOMODITAS).perubahan, { status_anggota: '2' });
  assert.deepEqual(A.bandingkan(barisSama({ kategori: 'buruh tani' }), LAMA, KOMODITAS).perubahan, { kategori_petani_penggarap: '4' });
  assert.throws(() => A.bandingkan(barisSama({ status: 'Ketua' }), LAMA, KOMODITAS), /status/);
  assert.throws(() => A.bandingkan(barisSama({ kategori: '' }), LAMA, KOMODITAS), /Kategori Petani wajib/);
  assert.deepEqual(A.bandingkan(barisSama({ koordinat: '-4.75, 104.45' }), LAMA, KOMODITAS).perubahan,
    { titik_koordinat_lahan: '-4.75, 104.45' });
});

test('bandingkan: kolom terkunci hanya diberi peringatan', () => {
  const r = A.bandingkan(barisSama({ nama: 'BUDI S', ttl: 'KASUI, 1-1-1990', jk: 'Perempuan' }), LAMA, KOMODITAS);
  assert.deepEqual(r.perubahan, {});
  assert.equal(r.peringatan.length, 3);
});

test('buildPayload: field wajib & jenis kelamin', () => {
  const p = A.buildPayload(LAMA, { no_hp: '0811' });
  assert.equal(p.no_hp, '0811');
  assert.equal(p.jenis_kelamin, 'laki');
  assert.deepEqual(Object.keys(p), A.UPDATE_FIELDS);
  assert.throws(() => A.buildPayload(LAMA, { titik_koordinat_lahan: '' }), /wajib diisi: Titik Koordinat/);
});

test('setara: angka dibandingkan sebagai angka', () => {
  assert.ok(A.setara('1.50', '1.5'));
  assert.ok(A.setara(' a  b', 'a b'));
  assert.ok(!A.setara('1', '2'));
});

// ─── Anggota baru ──────────────────────────────────────────────────────────

test('parseTtl', () => {
  const hariIni = new Date(2026, 9, 10);
  assert.deepEqual(A.parseTtl('KASUI PASAR, 15-8-1974', hariIni), { tempat: 'KASUI PASAR', tgl: '15', bln: '08', thn: '1974' });
  assert.deepEqual(A.parseTtl('Way Kanan, Lampung, 1/2/2000', hariIni).tempat, 'Way Kanan, Lampung');
  assert.throws(() => A.parseTtl('KASUI 15-8-1974', hariIni), /harus format/);
  assert.throws(() => A.parseTtl('KASUI, 31-2-1974', hariIni), /tidak valid/);
  assert.throws(() => A.parseTtl('KASUI, 11-10-2011', hariIni), /Umur 14/);
  assert.equal(A.parseTtl('KASUI, 10-10-2011', hariIni).thn, '2011'); // tepat 15 tahun hari ini
});

test('parseJk', () => {
  assert.equal(A.parseJk('Perempuan'), 'perempuan');
  assert.equal(A.parseJk('L'), 'laki');
  assert.throws(() => A.parseJk('x'), /Jenis Kelamin/);
});

test('cekNik', () => {
  assert.equal(A.cekNik('1808000000001234'), '');
  assert.match(A.cekNik('1.80802E+15'), /rusak/);
  assert.match(A.cekNik('123', { wajib16: true }), /16 angka/);
});
