// Jalankan (dari root): npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../core/duplikasi.js');
const L = require('../core/laporan.js');
const X = require('../../../common/excel.js');
const A = require('../core/api.js');

const ST = { 1: 'Belum dikirim ke Korluh', 2: 'Menunggu persetujuan Korluh', 7: 'Telah Disahkan Kadis', 95: 'Not Valid (Data NIK Status Meninggal)', 9: 'Ditolak Korluh' };
let id = 1;
const baris = (nama, nik, status, extra = {}) => ({
  id: id++, year: 2027, farmer_name: nama, farmer_nik: nik, subsector: 'TANAMAN PANGAN', farmer_group_id: 10,
  farmer_group_name: 'GANGSA INDAH', sub_district_code: '1808022008', status: { id: status, name: ST[status] },
  created_at: `2026-10-0${status % 9 + 1}T02:00:00Z`, updated_at: '2026-10-11T02:00:00Z',
  mt1_commodity: 'JAGUNG', mt1_planting_area: '0.500', mt1_urea: 125, mt1_npk: 150, mt2_commodity: '', mt3_commodity: '', ...extra,
});

const DATA = [
  // SALAM: identik 3x (2 draf + 1 di Korluh), cap waktu beda → tetap dobel; terdeteksi bawaan, lintas status
  baris('SALAM', '1808000000000001', 1), baris('SALAM', '1808000000000001', 1, { created_at: '2026-10-11T09:00:00Z' }),
  baris('SALAM', '1808000000000001', 2),
  // SUHARSA: draf identik dengan yang di Korluh → TIDAK terdeteksi bawaan; baris ketiga isinya beda → bukan dobel
  baris('SUHARSA', '1808000000000002', 1), baris('SUHARSA', '1808000000000002', 2),
  baris('SUHARSA', '1808000000000002', 2, { mt1_commodity: 'PADI', mt1_planting_area: '1.000' }),
  // ISMAIL: 2x identik di Korluh → tidak terdeteksi, bukan lintas status
  baris('ISMAIL', '1808000000000003', 2), baris('ISMAIL', '1808000000000003', 2),
  // BUDI: pangan + perkebunan → isi beda, BUKAN dobel
  baris('BUDI', '1808000000000004', 2), baris('BUDI', '1808000000000004', 2, { subsector: 'PERKEBUNAN' }),
  // WATI: beda poktan → BUKAN dobel
  baris('WATI', '1808000000000005', 2), baris('WATI', '1808000000000005', 2, { farmer_group_id: 11, farmer_group_name: 'SUKA MAJU' }),
  // JONO: identik tapi satu Not Valid + satu ditolak → tidak dobel
  baris('JONO', '1808000000000006', 2), baris('JONO', '1808000000000006', 95), baris('JONO', '1808000000000006', 9),
].map(D.normalisasi);

test('dikecualikan: ditolak, batal, Not Valid, id ≥ 90', () => {
  assert.equal(D.dikecualikan({ id: 95, name: ST[95] }), true);
  assert.equal(D.dikecualikan({ id: 9, name: 'Ditolak Korluh' }), true);
  assert.equal(D.dikecualikan({ id: 6, name: 'Dibatalkan' }), true);
  assert.equal(D.dikecualikan({ id: 7, name: ST[7] }), false);
  assert.equal(D.dikecualikan({ id: 2, name: ST[2] }), false);
});

test('sidik: abaikan id, status, cap waktu; kolom lain menentukan', () => {
  const a = baris('X', '1', 1), b = baris('X', '1', 2, { created_at: 'lain', updated_at: 'lain', is_sync: 1 });
  assert.equal(D.sidik(a), D.sidik(b));
  assert.notEqual(D.sidik(a), D.sidik({ ...a, mt1_urea: 126 }));
});

test('cari: baris identik di semua status, tanda terdeteksi bawaan & lintas status', () => {
  const r = D.cari(DATA);
  const nama = r.kelompok.map((k) => k.nama).sort();
  assert.deepEqual(nama, ['ISMAIL', 'SALAM', 'SUHARSA']);
  assert.equal(r.dikecualikan, 2);
  const k = Object.fromEntries(r.kelompok.map((x) => [x.nama, x]));
  assert.deepEqual([k.SALAM.baris.length, k.SALAM.terdeteksiBawaan, k.SALAM.lintasStatus, k.SALAM.bisaDihapus], [3, true, true, 2]);
  assert.deepEqual([k.SUHARSA.baris.length, k.SUHARSA.terdeteksiBawaan, k.SUHARSA.lintasStatus], [2, false, true]);
  assert.deepEqual([k.ISMAIL.terdeteksiBawaan, k.ISMAIL.lintasStatus, k.ISMAIL.bisaDihapus], [false, false, 0]);
  assert.equal(r.kelompok[r.kelompok.length - 1].nama, 'SALAM'); // yang luput didahulukan
  assert.deepEqual(D.hitung(r.kelompok), { kelompok: 3, baris: 7, luput: 2, lintas: 2 });
});

test('cari dibatasi status draf = hasil Monitoring Duplikasi bawaan', () => {
  const r = D.cari(DATA.filter((b) => b.statusId === D.STATUS_DRAF));
  assert.deepEqual(r.kelompok.map((k) => k.nama), ['SALAM']);
});

test('saring & daftarWilayah', () => {
  const { kelompok } = D.cari(DATA);
  assert.deepEqual(D.saring(kelompok, { jenis: 'luput' }).map((k) => k.nama).sort(), ['ISMAIL', 'SUHARSA']);
  assert.deepEqual(D.saring(kelompok, { jenis: 'lintas' }).map((k) => k.nama).sort(), ['SALAM', 'SUHARSA']);
  assert.deepEqual(D.saring(kelompok, { cari: '0003' }).map((k) => k.nama), ['ISMAIL']);
  assert.equal(D.saring(kelompok, { wilayah: '11' }).length, 0);
  assert.deepEqual(D.daftarWilayah(DATA).map((w) => w.nama), ['GANGSA INDAH', 'SUKA MAJU']);
  assert.equal(D.ringkasMt(DATA[0].mt[0]), 'JAGUNG 0,5 ha');
});

test('laporan Excel: NIK sebagai teks, kelompok luput diberi tanda', () => {
  const r = D.cari(DATA);
  const sheets = L.susun({ waktu: '2026-10-11T03:00:00Z', dicek: r.dicek, dikecualikan: r.dikecualikan, tahun: 2027 }, r.kelompok);
  const teks = new TextDecoder().decode(X.buat(sheets));
  assert.match(teks, /<t xml:space="preserve">1808000000000002<\/t>/); // NIK inlineStr, bukan angka
  assert.match(teks, /TIDAK terdeteksi e-RDKK/);
  assert.match(teks, /RINGKASAN DUPLIKASI PER KELOMPOK TANI/);
  assert.ok(X.buat(L.susun({ dicek: 0, dikecualikan: 0 }, [])).length > 1000);
});

test('semuaPengajuan: baca per halaman sampai recordsTotal', async () => {
  const total = 1203;
  const panggil = [];
  const fetchTiruan = async (url) => {
    const start = Number(/start=(\d+)/.exec(url)[1]), len = Number(/length=(\d+)/.exec(url)[1]);
    panggil.push(start);
    const data = Array.from({ length: Math.max(0, Math.min(len, total - start)) }, (_, i) => ({ id: start + i }));
    return { status: 200, text: async () => JSON.stringify({ recordsTotal: total, data }) };
  };
  const rows = await A.semuaPengajuan({ fetch: fetchTiruan });
  assert.equal(rows.length, total);
  assert.deepEqual(panggil, [0, 500, 1000]);
});
