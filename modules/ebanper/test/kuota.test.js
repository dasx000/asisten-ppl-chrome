// Jalankan (dari root): npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../core/kuota.js');
const A = require('../core/api.js');

const keg = (id, kom, skomp, volume, extra = {}) => ({
  id, tahun: 2026, kode_propinsi: '18', kabupaten_kota: 'Kabupaten Way Kanan', nama_subsektor: 'Tanaman Pangan',
  nama_komoditas: kom, nama_skomponen: skomp, nama_ro: 'RO ' + skomp, nama_kewenangan: 'Kab/Kota',
  satuan: 'Hektar', volume, unitcost: 420000, ...extra,
});

/** e-Banper tiruan: pohon subsektor → bidang → komoditas → kegiatan + ringkasan volume. */
function apiTiruan(opsi = {}) {
  const log = [];
  const pohon = {
    7: { 2021: { 10: [keg(1340, 'Padi', 'Kawasan Padi', 5382), keg(720, 'Padi', 'Cetak Sawah 2026', 0)], 8: [keg(50, 'Jagung', 'Kawasan Jagung', 100)] } },
    337: { 2021: { 10: [keg(900, 'Padi', 'Pompa', 20), keg(1340, 'Padi', 'Kawasan Padi', 5382)] } }, // 1340 dobel
  };
  const ringkas = {
    1340: { available_volume: 5382, used_volume: 2331, remaining_volume: 3051, satuan: 'Hektar', details: [{ nama_kabupaten: 'KAB. WAY KANAN', total_volume: 2331 }] },
    720: { available_volume: 0, used_volume: 0, remaining_volume: 0, details: [] },
    50: { available_volume: 100, used_volume: 100, remaining_volume: 0, details: [] },
    900: { available_volume: 20, used_volume: 25, remaining_volume: -5, details: [] },
  };
  return {
    log,
    SesiHabis: A.SesiHabis,
    bidang: async (s) => { log.push(['bidang', s]); return pohon[s] ? Object.keys(pohon[s]).map((id) => ({ id, nama: 'B' })) : []; },
    komoditas: async (s, b) => Object.keys(pohon[s][b]).map((id) => ({ id })),
    kegiatan: async (b, s, k) => pohon[s][b][k],
    detail: async (id) => {
      log.push(['detail', id]);
      if (opsi.gagal === id) throw new Error('HTTP 404');
      if (opsi.sesiHabis === id) throw new A.SesiHabis();
      return { kegiatan: {}, volume_summary: ringkas[id] };
    },
  };
}

test('kumpulkan: telusuri semua subsektor, kegiatan dobel diambil sekali', async () => {
  const api = apiTiruan();
  const r = await K.kumpulkan(api);
  assert.equal(r.lengkap, true);
  assert.deepEqual(r.baris.map((b) => b.id).sort((a, b) => a - b), [50, 720, 900, 1340]);
  assert.equal(api.log.filter((x) => x[0] === 'detail' && x[1] === 1340).length, 1);
  assert.equal(api.log.filter((x) => x[0] === 'bidang').length, K.SUBSEKTOR_CADANGAN.length);
  assert.equal(r.kabupaten, 'Kabupaten Way Kanan');
  const padi = r.baris.find((b) => b.id === 1340);
  assert.deepEqual([padi.rancangan, padi.diajukan, padi.sisa, padi.persen, padi.status], [5382, 2331, 3051, 43, 'tersedia']);
  assert.equal(padi.subsektor, 'Tanaman Pangan (TP)');
  assert.deepEqual(padi.rincian, [{ kabupaten: 'KAB. WAY KANAN', volume: 2331 }]);
});

test('status: habis, melebihi, tanpa kuota', async () => {
  const r = await K.kumpulkan(apiTiruan());
  const st = Object.fromEntries(r.baris.map((b) => [b.id, b.status]));
  assert.deepEqual(st, { 50: 'habis', 720: 'kosong', 900: 'lebih', 1340: 'tersedia' });
  assert.deepEqual(K.hitung(r.baris), { semua: 4, tersedia: 1, habis: 1, kosong: 1, lebih: 1 });
});

test('satu kegiatan gagal → baris tetap ada dengan keterangan galat', async () => {
  const r = await K.kumpulkan(apiTiruan({ gagal: 50 }));
  const b = r.baris.find((x) => x.id === 50);
  assert.match(b.galat, /404/);
  assert.equal(b.rancangan, 100); // jatuh ke volume dari daftar kegiatan
});

test('sesi habis → dilempar, tidak ditelan', async () => {
  await assert.rejects(K.kumpulkan(apiTiruan({ sesiHabis: 900 })), A.SesiHabis);
});

test('dihentikan → lengkap=false', async () => {
  const r = await K.kumpulkan(apiTiruan(), { dihentikan: () => true });
  assert.equal(r.lengkap, false);
});

test('saring: kosong disembunyikan bawaan, cari, status, subsektor', async () => {
  const { baris } = await K.kumpulkan(apiTiruan());
  const id = (xs) => xs.map((b) => b.id).sort((a, b) => a - b);
  assert.deepEqual(id(K.saring(baris)), [50, 900, 1340]);
  assert.deepEqual(id(K.saring(baris, { tampilKosong: true })), [50, 720, 900, 1340]);
  assert.deepEqual(id(K.saring(baris, { cari: 'kawasan padi' })), [1340]);
  assert.deepEqual(id(K.saring(baris, { status: 'habis' })), [50, 900]);
  assert.deepEqual(id(K.saring(baris, { status: 'tersedia' })), [1340]);
  assert.deepEqual(id(K.saring(baris, { subsektor: 'Prasarana dan Sarana Pertanian (PSP)' })), [900]);
});

test('daftarSubsektor: gabung dari halaman tanpa dobel, abaikan placeholder', () => {
  const s = K.daftarSubsektor([{ id: '', nama: 'Pilih' }, { id: '7', nama: 'TP baru' }, { id: '9999', nama: 'Baru' }]);
  assert.equal(s[0].nama, 'TP baru');
  assert.ok(s.some((x) => x.id === '9999'));
  assert.equal(s.filter((x) => x.id === '7').length, 1);
});

test('ambilJson: halaman login → SesiHabis, 5xx dicoba ulang lalu galat', async () => {
  const html = async () => ({ status: 200, text: async () => '<form><input name="password"></form>' });
  await assert.rejects(A.ambilJson('/x', html), A.SesiHabis);
  await assert.rejects(A.ambilJson('/x', async () => ({ status: 419, text: async () => '' })), A.SesiHabis);
  const ok = async () => ({ status: 200, text: async () => '{"a":1}' });
  assert.deepEqual(await A.ambilJson('/x', ok), { a: 1 });
});

test('namaKegiatan: "Tanpa Sub Komponen" diganti nama komponen', () => {
  assert.equal(K.namaKegiatan({ nama_skomponen: 'Tanpa Sub Komponen', nama_komponen: 'Fasilitasi Bantuan Sarana Produksi', nama_ro: 'Kawasan Aneka Cabai' }),
    'Fasilitasi Bantuan Sarana Produksi');
  assert.equal(K.namaKegiatan({ nama_skomponen: 'Kawasan Padi', nama_komponen: 'X' }), 'Kawasan Padi');
  assert.equal(K.namaKegiatan({ id: 5 }), 'Kegiatan 5');
});
