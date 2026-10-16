// Jalankan (dari root): npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../core/unduhpoktan.js');
const X = require('../../../common/excel.js');

const XLS = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3]);
const pk = (nama, desa, id, jumlah = 10) => ({ nama, desa, id, jumlah, ketua: 'K', ip: `ip-${id}` });
const DATA = [pk('Maju Terus', 'KEDATON', '3'), pk('curup indah', 'KEDATON', '2'), pk('Bancong; Bersatu', 'DATAR BANCONG', '5', 30),
  pk('Lain/Desa', 'KOTA WAY', '9')];

test('jenisExcel, bersih & namaZip', () => {
  assert.equal(U.jenisExcel(XLS), 'xls');
  assert.equal(U.jenisExcel(new Uint8Array([0x50, 0x4b, 3, 4])), 'xlsx');
  assert.equal(U.jenisExcel(new TextEncoder().encode('<html>')), null);
  assert.equal(U.bersih(' A/B: C. '), 'A B C');
  assert.equal(U.namaZip('Kasui', ['KEDATON']), 'Anggota Poktan - Kec Kasui - KEDATON.zip');
  assert.equal(U.namaZip('', ['A', 'B']), 'Anggota Poktan - 2 Desa.zip');
});

test('daftarDesa & susunTugas: hanya desa terpilih, urut desa lalu nama, nomor per desa', () => {
  assert.deepEqual(U.daftarDesa(DATA).map((d) => [d.desa, d.poktan, d.anggota]),
    [['DATAR BANCONG', 1, 30], ['KEDATON', 2, 20], ['KOTA WAY', 1, 10]]);
  const t = U.susunTugas(DATA, ['kedaton', 'DATAR BANCONG']);
  assert.deepEqual(t.map((x) => x.dasar), ['DATAR BANCONG/01 Bancong; Bersatu', 'KEDATON/01 curup indah', 'KEDATON/02 Maju Terus']);
});

test('jalankan: berkas & log, gagal dicatat, URL cetak memakai ip', async () => {
  const diminta = [];
  const r = await U.jalankan({
    poktan: DATA, desa: ['KEDATON', 'DATAR BANCONG'], paralel: 2,
    unduh: async (url) => { diminta.push(url); if (url.endsWith('ip-2')) throw new Error('HTTP 404'); return XLS; },
  });
  assert.ok(diminta.every((u) => u.startsWith('https://simluh.pertanian.go.id/cetakanggotapoktan?ip=ip-')));
  assert.deepEqual(r.berkas.map((b) => b[0]), ['DATAR BANCONG/01 Bancong; Bersatu.xls', 'KEDATON/02 Maju Terus.xls']);
  assert.equal(r.log.length, 3);
  assert.equal(r.log[1].status, 'GAGAL: HTTP 404');
  assert.equal(r.dihentikan, false);
  const csv = U.daftarIsi(r.log);
  assert.ok(csv.startsWith('﻿DESA;NO;POKTAN'));
  assert.ok(csv.includes('"Bancong; Bersatu"'));
  assert.ok(X.zip([...r.berkas, ['DAFTAR ISI.csv', csv]]).length > 0);
});

test('jalankan: bukan Excel = gagal; galat fatal menghentikan semua; henti', async () => {
  const r = await U.jalankan({ poktan: DATA, desa: ['KOTA WAY'], unduh: async () => new Uint8Array([60, 104]) });
  assert.match(r.log[0].status, /bukan file Excel/);
  class Fatal extends Error {}
  await assert.rejects(U.jalankan({ poktan: DATA, desa: ['KEDATON'], unduh: async () => { throw new Fatal('sesi'); }, galatFatal: (e) => e instanceof Fatal }), Fatal);
  let n = 0;
  const h = await U.jalankan({ poktan: DATA, desa: ['KEDATON', 'DATAR BANCONG'], paralel: 1, unduh: async () => { n++; return XLS; }, henti: () => n >= 1 });
  assert.equal(h.berkas.length, 1);
  assert.equal(h.dihentikan, true);
  assert.equal(h.log.filter((x) => x.status === 'DIHENTIKAN').length, 2);
});
