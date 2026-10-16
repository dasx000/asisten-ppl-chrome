// Jalankan (dari root): npm test
const test = require('node:test');
const assert = require('node:assert/strict');
global.ErdkkApi = require('../core/api.js');
const C = require('../core/cetakpdf.js');
const X = require('../../../common/excel.js');

test('namaBerkas & bersih: NN POKTAN - KOMODITAS - KIOS, bagian bila lebih dari satu', () => {
  assert.equal(C.namaBerkas({ no: 3, poktan: 'MUKTI JAYA', komoditas: 'PADI', kios: 'YOGI TANI' }), '03 MUKTI JAYA - PADI - YOGI TANI.pdf');
  assert.equal(C.namaBerkas({ no: 7, lebar: 3, poktan: 'TANI/MAJU', komoditas: 'KOPI', kios: 'UD. "SRI"', bagian: 2, totalBagian: 3 }), '007 TANI MAJU - KOPI - UD. SRI (bagian 2).pdf');
  assert.equal(C.bersih('  '), 'TANPA NAMA');
});

test('susunTugas: poktan × 3 komoditas × kios, folder Kecamatan/NN Desa, nama kembar diberi id', () => {
  const desa = [{ kode: '1808022014', nama: 'SUKAJADI', kecamatan: 'KASUI', no: 11 }];
  const poktan = new Map([['1808022014', [{ id: 1, nama: 'HARAPAN MAJU' }, { id: 2, nama: 'SUBUR' }, { id: 3, nama: 'SUBUR' }]]]);
  const kios = new Map([['1808022014', [{ id: 10, nama: 'A' }, { id: 11, nama: 'B' }]]]);
  const t = C.susunTugas(desa, poktan, kios);
  assert.equal(t.length, 3 * 3 * 2);
  assert.equal(t[0].folder, 'KASUI/11 SUKAJADI');
  assert.ok(t.some((x) => x.label === 'SUBUR (2)'));
  assert.deepEqual(t.find((x) => x.komoditas.nama === 'KOPI').param.subsectors, 'PERKEBUNAN');
  assert.deepEqual(t[0].param, { desa: '1808022014', poktan: '1', subsectors: 'TANAMAN PANGAN', commodities: 'PADI', kios: '10' });
});

test('pilihKomoditas: subsektor otomatis, urutan baku, tanpa peternakan; bawaan padi/jagung/kopi', () => {
  assert.deepEqual(C.KOMODITAS.map((k) => k.nama), ['PADI', 'JAGUNG', 'KOPI']);
  const k = C.pilihKomoditas(['cabai', 'KOPI', 'UBI KAYU']);
  assert.deepEqual(k.map((x) => [x.nama, x.subsektor]), [['UBI KAYU', 'TANAMAN PANGAN'], ['KOPI', 'PERKEBUNAN'], ['CABAI', 'HORTIKULTURA']]);
  assert.ok(!C.SEMUA_KOMODITAS.some((x) => x.subsektor === 'PETERNAKAN'));
  assert.equal(C.judulKomoditas(k), 'Ubi Kayu, Kopi, Cabai');
  const desa = [{ kode: '1', nama: 'A', kecamatan: 'K' }];
  const t = C.susunTugas(desa, new Map([['1', [{ id: 1, nama: 'P' }]]]), new Map([['1', [{ id: 9, nama: 'K' }]]]), C.pilihKomoditas(['BAWANG MERAH']));
  assert.deepEqual(t.map((x) => x.param.subsectors + '|' + x.param.commodities), ['HORTIKULTURA|BAWANG MERAH']);
});

test('daftarKomoditas: dari dropdown, subsektor dikenal dipetakan, komoditas baru di belakang dengan calon subsektor', () => {
  const dd = ['', '', 'PADI', 'JAGUNG', 'KEDELAI', 'TEBU RAKYAT', 'KOPI', 'KAKAO', 'CABAI', 'BAWANG MERAH', 'BAWANG PUTIH', 'UBI KAYU'];
  assert.deepEqual(C.daftarKomoditas(dd).map((k) => k.nama), C.SEMUA_KOMODITAS.map((k) => k.nama));
  assert.equal(C.daftarKomoditas([]), C.SEMUA_KOMODITAS);
  const d = C.daftarKomoditas(['PADI', ' kentang ', 'KOPI'], ['', 'TANAMAN PANGAN', 'HORTIKULTURA']);
  assert.deepEqual(d.map((k) => [k.nama, k.subsektor]), [['PADI', 'TANAMAN PANGAN'], ['KOPI', 'PERKEBUNAN'], ['KENTANG', '']]);
  assert.deepEqual(d[2].calon, ['TANAMAN PANGAN', 'HORTIKULTURA']);
  assert.deepEqual(C.pilihKomoditas(['kentang', 'PADI'], d).map((k) => k.nama), ['PADI', 'KENTANG']);
});

test('jalankan: komoditas baru mencoba calon subsektor berurutan, berhenti di yang berisi', async () => {
  const panggil = [];
  const json = (o) => ({ ok: true, status: 200, text: async () => JSON.stringify(o) });
  const fetch = async (url) => {
    panggil.push(url);
    const q = new URLSearchParams(url.split('?')[1] || '');
    if (url.startsWith('/api/farmer')) return json([{ farmer_group_id: 1, farmer_group_name: 'P' }]);
    if (url.startsWith('/api/kios')) return json([{ id: 9, name: 'K' }]);
    if (url.startsWith('/api/cetak-count')) {
      const n = q.get('subsectors') === 'HORTIKULTURA' ? 5 : 0;
      return json({ total_rows: n, rows_per_part: 100, total_parts: n ? 1 : 0 });
    }
    return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('%PDF-1.7').buffer };
  };
  const komoditas = C.daftarKomoditas(['KENTANG'], ['TANAMAN PANGAN', 'HORTIKULTURA', 'PERKEBUNAN']);
  const r = await C.jalankan({ desa: [{ kode: '1', nama: 'A', kecamatan: 'K' }], komoditas, fetch });
  const cek = panggil.filter((u) => u.startsWith('/api/cetak-count')).map((u) => new URLSearchParams(u.split('?')[1]).get('subsectors'));
  assert.deepEqual(cek, ['TANAMAN PANGAN', 'HORTIKULTURA']);
  assert.ok(panggil.some((u) => u.startsWith('/api/cetak-pdf') && u.includes('subsectors=HORTIKULTURA')));
  assert.equal(r.berkas.length, 1);
});

function serverTiruan() {
  const pdf = new TextEncoder().encode('%PDF-1.7 tiruan');
  const panggil = [];
  const json = (o) => ({ ok: true, status: 200, text: async () => JSON.stringify(o) });
  const fetch = async (url) => {
    panggil.push(url);
    const q = new URLSearchParams(url.split('?')[1] || '');
    if (url.startsWith('/api/farmer')) return json([{ farmer_group_id: 7, farmer_group_name: 'MUKTI JAYA' }, { farmer_group_id: 5, farmer_group_name: 'BAROKAH JAYA' }]);
    if (url.startsWith('/api/kios')) return json([{ id: 20693, name: 'YOGI TANI' }]);
    if (url.startsWith('/api/cetak-count')) {
      const n = q.get('poktan') === '5' ? { PADI: 0, JAGUNG: 0, KOPI: 4 }[q.get('commodities')] : { PADI: 9, JAGUNG: 150, KOPI: 0 }[q.get('commodities')];
      return json({ total_rows: n, rows_per_part: 100, total_parts: Math.ceil(n / 100) });
    }
    if (url.startsWith('/api/cetak-pdf')) return { ok: true, status: 200, arrayBuffer: async () => pdf.buffer.slice(0) };
    return { ok: false, status: 404, text: async () => '' };
  };
  return { fetch, panggil };
}

test('jalankan: lewati kombinasi kosong, pecah per bagian, daftar isi & ZIP', async () => {
  const s = serverTiruan();
  const r = await C.jalankan({ desa: [{ kode: '1808022008', nama: 'KOTAWAY', kecamatan: 'KASUI', no: 9 }], fetch: s.fetch });
  assert.deepEqual(r.berkas.map((b) => b[0]), [
    'KASUI/09 KOTAWAY/01 BAROKAH JAYA - KOPI - YOGI TANI.pdf',
    'KASUI/09 KOTAWAY/02 MUKTI JAYA - PADI - YOGI TANI.pdf',
    'KASUI/09 KOTAWAY/03 MUKTI JAYA - JAGUNG - YOGI TANI (bagian 1).pdf',
    'KASUI/09 KOTAWAY/04 MUKTI JAYA - JAGUNG - YOGI TANI (bagian 2).pdf',
  ]);
  assert.equal(s.panggil.filter((u) => u.startsWith('/api/cetak-pdf')).length, 4);
  assert.ok(s.panggil.some((u) => /cetak-pdf.*part=2/.test(u)));
  const csv = C.daftarIsi(r.log);
  assert.match(csv, /KECAMATAN;DESA;POKTAN;KOMODITAS;KIOS;BAGIAN;BARIS;BERKAS;STATUS/);
  assert.match(csv, /KASUI;KOTAWAY;MUKTI JAYA;PADI;YOGI TANI;1;9;.*;OK/);
  const z = X.zip([...r.berkas, ['DAFTAR ISI.csv', csv]]);
  assert.equal(z[0], 0x50); assert.equal(z[1], 0x4b);
  assert.ok(new TextDecoder().decode(z).includes('KASUI/09 KOTAWAY/02 MUKTI JAYA - PADI - YOGI TANI.pdf'));
});

test('jalankan: berhenti bila diminta', async () => {
  const s = serverTiruan();
  let n = 0;
  const r = await C.jalankan({ desa: [{ kode: '1', nama: 'A', kecamatan: 'K' }], fetch: s.fetch, paralel: 1, henti: () => ++n > 3 });
  assert.equal(r.dihentikan, true);
});

test('rekapPoktan: dicocokkan nama desa + poktan dengan master, KWT dihitung, di luar master ditandai', () => {
  const master = [
    { nama_desa_erdkk: 'KOTAWAY', nama_poktan: 'Mukti Jaya' }, { nama_desa_erdkk: 'KOTAWAY', nama_poktan: 'REJO TANI' },
    { nama_desa_erdkk: 'KOTAWAY', nama_poktan: 'KWT MAWAR' }, { nama_desa_erdkk: 'KOTAWAY', nama_poktan: 'KWT Mawar' },
    { nama_desa_erdkk: 'SUKAJADI', nama_poktan: 'LAIN DESA' },
  ];
  const log = [
    { desa: 'KOTAWAY', poktan: 'MUKTI JAYA', komoditas: 'PADI', status: 'OK' },
    { desa: 'KOTAWAY', poktan: 'MUKTI JAYA', komoditas: 'JAGUNG', status: 'OK' },
    { desa: 'KOTAWAY', poktan: 'KWT MAWAR', komoditas: 'KOPI', status: 'OK' },
    { desa: 'KOTAWAY', poktan: 'BARU', komoditas: 'KOPI', status: 'OK' },
    { desa: 'KOTAWAY', poktan: 'REJO TANI', komoditas: 'KOPI', status: 'GAGAL: x' },
  ];
  const r = C.rekapPoktan(master, ['KOTAWAY'], log);
  assert.equal(r.terdaftar, 3);
  assert.equal(r.ada, 2);
  assert.equal(r.belum, 1);
  assert.deepEqual(r.kwt, { terdaftar: 1, ada: 1 });
  assert.equal(r.diluarMaster, 1);
  assert.equal(r.mentah, 4);
  assert.deepEqual(r.kembar, ['KWT MAWAR (KOTAWAY)']);
  const csv = C.csvPoktan(r);
  assert.match(csv, /KOTAWAY;MUKTI JAYA;POKTAN;ADA;PADI, JAGUNG;2;/);
  assert.match(csv, /KOTAWAY;REJO TANI;POKTAN;BELUM ADA;;0;/);
});

test('fetchBatas: permintaan menggantung dibatalkan (tidak macet selamanya)', async () => {
  const gantung = (url, init) => new Promise((_, tolak) => init.signal.addEventListener('abort', () => {
    const e = new Error('aborted'); e.name = 'AbortError'; tolak(e);
  }));
  const t0 = Date.now();
  await assert.rejects(ErdkkApi.fetchBatas(gantung, '/x', {}, 0.05), (e) => e.name === 'AbortError');
  assert.ok(Date.now() - t0 < 1000);
});
