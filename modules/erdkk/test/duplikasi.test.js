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

test('semuaPengajuan: utama satu permintaan length=-1', async () => {
  const total = 1203, panggil = [];
  const fetchTiruan = async (url) => {
    panggil.push(/length=(-?\d+)/.exec(url)[1]);
    const data = Array.from({ length: total }, (_, i) => ({ id: i }));
    return { status: 200, text: async () => JSON.stringify({ recordsTotal: total, data }) };
  };
  const rows = await A.semuaPengajuan({ fetch: fetchTiruan });
  assert.equal(rows.length, total);
  assert.equal(rows.kurang, 0);
  assert.deepEqual(panggil, ['-1']);
});

test('semuaPengajuan: cadangan per halaman bila length=-1 ditolak, id ganda dibuang', async () => {
  const total = 1203, panggil = [];
  const fetchTiruan = async (url) => {
    const start = Number(/start=(\d+)/.exec(url)[1]), len = Number(/length=(-?\d+)/.exec(url)[1]);
    panggil.push(len);
    if (len < 0) return { status: 200, text: async () => JSON.stringify({ recordsTotal: total, data: [] }) };
    // urutan tidak stabil: halaman ke-2 mengulang baris terakhir halaman 1
    const s = start ? start - 1 : 0;
    const data = Array.from({ length: Math.max(0, Math.min(len, total - s)) }, (_, i) => ({ id: s + i }));
    return { status: 200, text: async () => JSON.stringify({ recordsTotal: total, data }) };
  };
  const rows = await A.semuaPengajuan({ fetch: fetchTiruan });
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  assert.deepEqual(panggil.slice(0, 2), [-1, 500]);
});

test('cari: baris ber-id sama tidak dianggap duplikat', () => {
  const satu = baris('NURYAHYA', '1808000000000099', 2);
  const { kelompok } = D.cari([satu, { ...satu }].map(D.normalisasi));
  assert.equal(kelompok.length, 0);
});

test('aturan hapus: hanya draf, sisakan minimal satu, yang terkirim disisakan', () => {
  const { kelompok } = D.cari(DATA);
  const k = Object.fromEntries(kelompok.map((x) => [x.nama, x]));
  // SALAM: 2 draf + 1 terkirim → kedua draf boleh dihapus, yang terkirim tidak
  assert.deepEqual(k.SALAM.baris.map((b) => D.bolehHapus(k.SALAM, b)), [true, true, false]);
  assert.deepEqual(D.salinanHapus(k.SALAM).map((b) => b.statusId), [1, 1]);
  // ISMAIL: semua terkirim → tidak ada yang bisa dihapus
  assert.deepEqual(D.salinanHapus(k.ISMAIL), []);
  assert.equal(k.ISMAIL.baris.some((b) => D.bolehHapus(k.ISMAIL, b)), false);
  // semua draf → sisakan yang paling awal dibuat
  const draf = D.cari([baris('A', '9', 1, { created_at: '2026-10-02T00:00:00Z' }), baris('A', '9', 1, { created_at: '2026-10-01T00:00:00Z' }),
    baris('A', '9', 1, { created_at: '2026-10-03T00:00:00Z' })].map(D.normalisasi)).kelompok[0];
  const hapus = D.salinanHapus(draf);
  assert.equal(hapus.length, 2);
  assert.ok(!hapus.some((b) => b.dibuat === '2026-10-01T00:00:00Z'));
});

test('cekSebelumHapus: tolak bila hilang, status berubah, isi berubah, atau tidak ada kembaran', () => {
  const { kelompok } = D.cari(DATA);
  const salam = kelompok.find((x) => x.nama === 'SALAM');
  const b = salam.baris[0];
  assert.equal(D.cekSebelumHapus(DATA, b), '');
  assert.match(D.cekSebelumHapus(DATA.filter((x) => x.id !== b.id), b), /tidak ada/);
  assert.match(D.cekSebelumHapus(DATA.map((x) => (x.id === b.id ? { ...x, statusId: 2, status: 'Menunggu' } : x)), b), /status sudah berubah/);
  assert.match(D.cekSebelumHapus(DATA.map((x) => (x.id === b.id ? { ...x, sidik: 'lain' } : x)), b), /isi baris sudah berubah/);
  const sendiri = DATA.filter((x) => x.sidik !== b.sidik || x.id === b.id);
  assert.match(D.cekSebelumHapus(sendiri, b), /tidak ada salinan lain/);
});

test('api.hapus: POST delete-pengajuan dengan token & id, galat server diteruskan', async () => {
  let req;
  const ok = async (url, o) => { req = { url, o }; return { status: 200, text: async () => '{"message":"ok"}' }; };
  await A.hapus(123, { fetch: ok, token: 'TKN' });
  assert.equal(req.url, '/api/delete-pengajuan');
  assert.equal(req.o.method, 'POST');
  assert.equal(req.o.headers['X-CSRF-TOKEN'], 'TKN');
  assert.equal(new URLSearchParams(req.o.body).get('id'), '123');
  await assert.rejects(A.hapus(1, { fetch: async () => ({ status: 403, text: async () => '{"message":"Tidak diizinkan"}' }), token: 'T' }), /Tidak diizinkan/);
  await assert.rejects(A.hapus(1, { fetch: async () => ({ status: 200, text: async () => '{"success":false,"message":"Status tidak valid"}' }), token: 'T' }), /Status tidak valid/);
  await assert.rejects(A.hapus(1, { fetch: async () => ({ status: 419, text: async () => '' }), token: 'T' }), A.SesiHabis);
  await assert.rejects(A.hapus(1, { fetch: ok, token: '' }), /Token keamanan/);
});

test('aturan batal: hanya status Menunggu Korluh dalam kelompok dobel', () => {
  const { kelompok } = D.cari(DATA);
  const k = Object.fromEntries(kelompok.map((x) => [x.nama, x]));
  assert.deepEqual(k.ISMAIL.baris.map((b) => D.bolehBatal(k.ISMAIL, b)), [true, true]);
  assert.deepEqual(k.SALAM.baris.map((b) => D.bolehBatal(k.SALAM, b)), [false, false, false]); // ada salinan draf → cukup hapus
  assert.equal(k.ISMAIL.bisaDibatal, 2);
  const b = k.ISMAIL.baris[0];
  assert.equal(D.cekSebelumBatal(DATA, b), '');
  assert.match(D.cekSebelumBatal(DATA.map((x) => (x.id === b.id ? { ...x, statusId: 1, status: 'Belum' } : x)), b), /status sudah berubah/);
  assert.match(D.cekSebelumHapus(DATA, b), /status sudah berubah/); // baris status 2 tidak boleh dihapus
});

test('api.batal: POST batal-pengajuan dengan id & token', async () => {
  let req;
  await A.batal(77, { fetch: async (url, o) => { req = { url, o }; return { status: 200, text: async () => '{}' }; }, token: 'TK' });
  assert.equal(req.url, '/api/batal-pengajuan');
  assert.equal(req.o.headers['X-CSRF-TOKEN'], 'TK');
  assert.equal(new URLSearchParams(req.o.body).get('id'), '77');
  assert.equal(new URLSearchParams(req.o.body).has('statusPengajuan'), false);
});

test('semuaSalinanHapus: gabungan salinan draf semua kelompok, kelompok tanpa draf dilewati', () => {
  const { kelompok } = D.cari(DATA);
  const x = D.semuaSalinanHapus(kelompok);
  assert.deepEqual(x.map(({ k }) => k.nama).sort(), ['SALAM', 'SALAM', 'SUHARSA']);
  assert.ok(x.every(({ b }) => b.statusId === D.STATUS_DRAF));
  // simulasi hapus berurutan dengan cek ulang: setiap kelompok tetap tersisa ≥1 baris
  let data = [...DATA];
  for (const { b } of x) {
    assert.equal(D.cekSebelumHapus(data, b), '');
    data = data.filter((r) => r.id !== b.id);
  }
  assert.deepEqual(D.cari(data).kelompok.map((k) => k.nama), ['ISMAIL']);
  assert.ok(data.some((r) => r.nama === 'SALAM') && data.some((r) => r.nama === 'SUHARSA'));
});
