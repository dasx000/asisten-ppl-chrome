// ================= CEK JUMLAH PT PER KOMODITAS ================= \\
// Aturan: padi & jagung harus tepat 2 PT setahun; kopi (tanaman tahunan) paling banyak 1 PT.
// Pengajuan yang melanggar ditandai salah input,
// lalu bisa ditarik (Batal, status Menunggu Korluh) atau dihapus (status Belum dikirim) untuk diperbaiki.
// Tanpa DOM, bisa dites di Node.

(function (root) {
  'use strict';

  // komoditas → { boleh(n): jumlah PT yang benar?, aturan: teks }
  const ATURAN = {
    PADI: { boleh: (n) => n === 2, aturan: 'harus 2 PT' },
    JAGUNG: { boleh: (n) => n === 2, aturan: 'harus 2 PT' },
    KOPI: { boleh: (n) => n <= 1, aturan: 'tanaman tahunan, maks 1 PT' },
  };
  const KOMODITAS_DICEK = Object.keys(ATURAN);
  const STATUS_DRAF = 1, STATUS_KORLUH = 2;

  /** Masalah PT di satu baris: [{ komoditas, mt: [1], jumlah: 1, luas }] — kosong bila semua benar. */
  function masalahMt(b, komoditas = KOMODITAS_DICEK) {
    const hasil = [];
    for (const k of komoditas) {
      const mt = b.mt.map((m, i) => (m.komoditas.toUpperCase() === k ? i + 1 : 0)).filter(Boolean);
      if (mt.length && !ATURAN[k].boleh(mt.length)) {
        hasil.push({ komoditas: k, mt, jumlah: mt.length, luas: Math.max(...mt.map((i) => b.mt[i - 1].luas || 0)) });
      }
    }
    return hasil;
  }

  /** Teks ringkas: "PADI hanya PT1", "JAGUNG 3 PT (PT1, PT2, PT3)", "KOPI 2 PT (PT1, PT2) — tahunan, maks 1 PT" */
  function teksMasalah(m) {
    if (m.komoditas === 'KOPI') return `KOPI ${m.jumlah} PT (${m.mt.map((i) => 'PT' + i).join(', ')}), tahunan maks 1 PT`;
    return m.jumlah === 1 ? `${m.komoditas} hanya PT${m.mt[0]}` : `${m.komoditas} ${m.jumlah} PT (${m.mt.map((i) => 'PT' + i).join(', ')})`;
  }

  /** Aksi yang mungkin untuk baris: 'batal' (status 2), 'hapus' (status 1), atau '' */
  const aksiUntuk = (b) => (b.statusId === STATUS_KORLUH ? 'batal' : b.statusId === STATUS_DRAF ? 'hapus' : '');

  /**
   * Cari baris bermasalah. f: { desa, poktan, komoditas ('' = semua yang dicek), status ('' = aktif, 'semua', id) }
   * Return [{ b, masalah, aksi }] terurut desa → poktan → nama.
   */
  function cari(baris, f = {}) {
    const kom = f.komoditas ? [f.komoditas] : KOMODITAS_DICEK;
    const out = [];
    for (const b of baris) {
      if (f.status === 'semua') { /* semua */ } else if (f.status) { if (String(b.statusId) !== String(f.status)) continue; } else if (b.dikecualikan) continue;
      if (f.desa && b.desa !== f.desa) continue;
      if (f.poktan && b.poktanId !== f.poktan) continue;
      const masalah = masalahMt(b, kom);
      if (masalah.length) out.push({ b, masalah, aksi: aksiUntuk(b) });
    }
    return out.sort((x, y) => x.b.desa.localeCompare(y.b.desa) || x.b.poktan.localeCompare(y.b.poktan) || x.b.nama.localeCompare(y.b.nama));
  }

  /** Kelompokkan per desa → poktan: [{ desa, nama, poktan: [{ id, nama, item: [...] }] }] */
  function kelompokkan(item, namaDesa = new Map()) {
    const desa = new Map();
    for (const x of item) {
      const b = x.b;
      if (!desa.has(b.desa)) desa.set(b.desa, { desa: b.desa, nama: namaDesa.get(b.desa) || `Desa ${b.desa}`, poktan: new Map() });
      const d = desa.get(b.desa);
      if (!d.poktan.has(b.poktanId)) d.poktan.set(b.poktanId, { id: b.poktanId, nama: b.poktan || `Poktan ${b.poktanId}`, item: [] });
      d.poktan.get(b.poktanId).item.push(x);
    }
    return [...desa.values()].sort((a, b) => a.nama.localeCompare(b.nama))
      .map((d) => ({ ...d, poktan: [...d.poktan.values()].sort((a, b) => a.nama.localeCompare(b.nama)) }));
  }

  function hitung(item) {
    const n = { total: item.length, batal: 0, hapus: 0, tanpaAksi: 0, padi: 0, jagung: 0, kopi: 0 };
    for (const x of item) {
      if (x.aksi === 'batal') n.batal++; else if (x.aksi === 'hapus') n.hapus++; else n.tanpaAksi++;
      if (x.masalah.some((m) => m.komoditas === 'PADI')) n.padi++;
      if (x.masalah.some((m) => m.komoditas === 'JAGUNG')) n.jagung++;
      if (x.masalah.some((m) => m.komoditas === 'KOPI')) n.kopi++;
    }
    return n;
  }

  /**
   * Cek ulang ke data terbaru sebelum aksi: baris masih ada, statusnya masih sesuai aksi, dan isinya belum berubah
   * (masih salah PT). Return '' bila aman, atau alasan.
   */
  function cekSebelumAksi(barisTerbaru, b, aksi) {
    const s = barisTerbaru.find((x) => x.id === b.id);
    if (!s) return 'baris sudah tidak ada';
    const wajib = aksi === 'batal' ? STATUS_KORLUH : STATUS_DRAF;
    if (s.statusId !== wajib) return `status sudah "${s.status}"`;
    if (s.sidik !== b.sidik) return 'isi baris sudah berubah (mungkin sudah diperbaiki)';
    if (!masalahMt(s).length) return 'PT sudah benar';
    return '';
  }

  const api = { ATURAN, KOMODITAS_DICEK, masalahMt, teksMasalah, aksiUntuk, cari, kelompokkan, hitung, cekSebelumAksi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ErdkkCekMt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
