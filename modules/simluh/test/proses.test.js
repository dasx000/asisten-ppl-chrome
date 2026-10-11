// Jalankan (dari root): npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../core/proses.js');

const { S } = P;
const KOMODITAS = new Map([['2', 'Tanaman Pangan-Padi Sawah'], ['10', 'Perkebunan-Kopi']]);

const lamaAnggota = (id, nik) => ({
  id_anggota: id, id_poktan: '99', nama_anggota: 'A' + id, nama_ktp: 'A' + id, jenis_kelamin: '1',
  kode_komoditas: '2', volume: '1', kode_komoditas2: '', volume2: '', kode_komoditas3: '', volume3: '',
  lainnya: '', alamat_ktp: 'RT 1', status_anggota: '1', tempat_lahir: 'KASUI', tgl_lahir: '01', bln_lahir: '01',
  thn_lahir: '1980', no_ktp: nik, no_hp: '081234567890', luas_lahan_ternak_diusahakan: '1',
  luas_lahan_ternak_dimiliki: '1', kategori_petani_penggarap: '1', titik_koordinat_lahan: '-4.7, 104.4',
});

const baris = (n, nik, ubah = {}) => ({
  _baris: n, _terlaluPanjang: [], nama: 'A' + n, nik, ttl: 'KASUI, 01-01-1980', alamat: 'RT 1', jk: 'Laki-laki',
  no_hp: '081234567890', status: 'Anggota', kom1: 'Padi Sawah', vol1: '1', kom2: '', vol2: '', kom3: '', vol3: '',
  lainnya: '', luas_usaha: '1', luas_milik: '1', kategori: 'Pemilik', koordinat: '-4.7, 104.4', ...ubah,
});

/** SIMLUH tiruan: menyimpan data anggota di memori. */
function apiTiruan(anggota, opsi = {}) {
  class ServerSibuk extends Error {}
  class SesiHabis extends Error {}
  const db = new Map(anggota.map((a) => [a.id_anggota, { ...a }]));
  const log = [];
  const halaman = () => ({
    url: 'x', idPoktan: '99', namaPoktan: 'TANI', wilayah: { id_poktan: '99', kode_desa: '1' }, komoditas: KOMODITAS,
    anggota: [...db.values()].map((a) => ({ id_anggota: a.id_anggota, nama: a.nama_anggota, nik: a.no_ktp, no_hp: a.no_hp })),
  });
  return {
    ServerSibuk, SesiHabis, log, db, halaman,
    ambilHalaman: async () => halaman(),
    getAnggota: async (id) => ({ ...db.get(id) }),
    updateAnggota: async (p) => {
      log.push(['update', p.id_anggota]);
      if (!opsi.abaikanUpdate) db.set(p.id_anggota, { ...db.get(p.id_anggota), ...p });
    },
    statusDukcapil: async () => ({ terhubung: opsi.dukcapil !== false, pesan: 'x' }),
    cekDukcapil: async (d) => ({ valid: d.nik !== '1808000000009999', pesan: 'NIK tidak sesuai' }),
    simpanAnggota: async (d) => {
      log.push(['simpan', d.no_ktp]);
      const id = String(db.size + 100);
      db.set(id, { ...d, id_anggota: id });
      return { ok: true, pesan: '' };
    },
  };
}

test('periksaUbah + kirimUbah', async () => {
  const api = apiTiruan([lamaAnggota('1', '1808000000000011'), lamaAnggota('2', '1808000000000022'),
    lamaAnggota('3', '1808000000000033')]);
  const file = {
    idPoktan: '99',
    baris: [
      baris(5, '1808000000000011', { nama: 'A1', luas_usaha: '2' }), // UBAH
      baris(6, '1808000000000022', { nama: 'A2' }), // SAMA
      baris(7, '1.808E+15'), // NIK rusak
      baris(8, '1808000000000044'), // tidak ditemukan
      baris(9, '1808000000000000'), // rusak oleh Excel
      baris(10, '1808000000000033', { nama: 'A3', vol1: 'x' }), // isi salah
    ],
  };
  const halaman = api.halaman();
  const { hasil, tidakDiFile } = await P.periksaUbah(file, halaman, api);
  assert.deepEqual(hasil.map((h) => h.status), [S.UBAH, S.SAMA, S.TOLAK, S.TIDAK_DITEMUKAN, S.TOLAK, S.TOLAK]);
  assert.equal(tidakDiFile, 0);
  assert.equal(api.log.length, 0); // pratinjau tidak mengirim apa pun

  await P.kirimUbah(hasil, halaman, api);
  assert.equal(hasil[0].status, S.OK);
  assert.equal(api.db.get('1').luas_lahan_ternak_diusahakan, '2');
  assert.deepEqual(api.log, [['update', '1']]);
});

test('kirimUbah: perubahan tidak tersimpan → GAGAL', async () => {
  const api = apiTiruan([lamaAnggota('1', '1808000000000011')], { abaikanUpdate: true });
  const halaman = api.halaman();
  const { hasil } = await P.periksaUbah({ idPoktan: '99', baris: [baris(5, '1808000000000011', { nama: 'A1', vol1: '3' })] }, halaman, api);
  await P.kirimUbah(hasil, halaman, api);
  assert.equal(hasil[0].status, S.GAGAL);
  assert.match(hasil[0].alasan, /belum tersimpan: volume/);
});

test('kirimUbah: dihentikan → sisa BATAL', async () => {
  const api = apiTiruan([lamaAnggota('1', '1808000000000011'), lamaAnggota('2', '1808000000000022')]);
  const halaman = api.halaman();
  const file = { idPoktan: '99', baris: [baris(5, '1808000000000011', { vol1: '3' }), baris(6, '1808000000000022', { vol1: '3' })] };
  const { hasil } = await P.periksaUbah(file, halaman, api);
  let n = 0;
  await P.kirimUbah(hasil, halaman, api, { dihentikan: () => n++ >= 1 });
  assert.deepEqual(hasil.map((h) => h.status), [S.OK, S.BATAL]);
});

test('file poktan lain ditolak', async () => {
  const api = apiTiruan([]);
  await assert.rejects(P.periksaUbah({ idPoktan: '12', baris: [] }, api.halaman(), api), /milik poktan ID 12/);
  assert.throws(() => P.periksaTambah({ idPoktan: '12', baris: [] }, api.halaman()), /milik poktan ID 12/);
});

test('periksaTambah + kirimTambah', async () => {
  const api = apiTiruan([lamaAnggota('1', '1808000000000011')]);
  const halaman = api.halaman();
  const hariIni = new Date(2026, 9, 10);
  const file = {
    idPoktan: '99',
    baris: [
      baris(5, '1808000000000011'), // sudah ada
      baris(6, '1808000000005555'), // SIAP
      baris(7, '1808000000009999'), // SIAP, tapi ditolak Dukcapil
      baris(8, '123'), // NIK pendek
      baris(9, '1808000000006666', { ttl: 'KASUI 1980' }), // TTL salah
      baris(10, '1808000000007777', { no_hp: '' }), // wajib kosong
    ],
  };
  const { hasil, sudahAda } = P.periksaTambah(file, halaman, hariIni);
  assert.equal(sudahAda, 1);
  assert.deepEqual(hasil.map((h) => h.status), [S.SIAP, S.SIAP, S.TOLAK, S.TOLAK, S.TOLAK]);
  assert.match(hasil[4].alasan, /wajib diisi: No HP/);
  assert.match(hasil[0].ringkas, /KASUI, 01-01-1980 · Padi Sawah \(1\) · luas 1 ha/);

  await P.kirimTambah(hasil, halaman, api);
  assert.deepEqual(hasil.slice(0, 2).map((h) => h.status), [S.OK, S.TOLAK]);
  assert.match(hasil[1].alasan, /Dukcapil: NIK tidak sesuai/);
  assert.deepEqual(api.log, [['simpan', '1808000000005555']]);
  const baru = [...api.db.values()].find((a) => a.no_ktp === '1808000000005555');
  assert.equal(baru.jenis_kelamin, 'laki');
  assert.equal(baru.kode_komoditas, '2');
  assert.equal(baru.id_poktan, '99');
});

test('kirimTambah: Dukcapil putus → GAGAL tanpa menyimpan', async () => {
  const api = apiTiruan([], { dukcapil: false });
  const halaman = api.halaman();
  const { hasil } = P.periksaTambah({ idPoktan: '99', baris: [baris(6, '1808000000005555')] }, halaman, new Date(2026, 9, 10));
  await P.kirimTambah(hasil, halaman, api);
  assert.equal(hasil[0].status, S.GAGAL);
  assert.match(hasil[0].alasan, /Dukcapil sedang tidak terhubung/);
  assert.equal(api.log.length, 0);
});

test('sesi habis menghentikan proses', async () => {
  const api = apiTiruan([lamaAnggota('1', '1808000000000011')]);
  const halaman = api.halaman();
  api.getAnggota = async () => { throw new api.SesiHabis('habis'); };
  await assert.rejects(P.periksaUbah({ idPoktan: '99', baris: [baris(5, '1808000000000011')] }, halaman, api), /habis/);
});
