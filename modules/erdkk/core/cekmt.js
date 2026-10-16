// ================= CEK JUMLAH PT PER KOMODITAS ================= \\
// Aturan tiap daerah berbeda (mis. jagung 2 PT di satu kabupaten, 3 PT di kabupaten lain), jadi jumlah PT
// yang benar untuk tiap komoditas ditentukan dari MAYORITAS isian pengajuan aktif (analisis), dan bisa
// diubah manual oleh pengguna. Pengajuan yang jumlah PT-nya berbeda ditandai salah input,
// lalu bisa ditarik (Batal, status Menunggu Korluh) atau dihapus (status Belum dikirim) untuk diperbaiki.
// Tanpa DOM, bisa dites di Node.

(function (root) {
  'use strict';

  const STATUS_DRAF = 1, STATUS_KORLUH = 2;
  const RAGU_PERSEN = 60; // mayoritas di bawah ini (atau seri) ditandai "perlu dicek"
  const DATA_SEDIKIT = 5; // komoditas dengan pengajuan lebih sedikit dari ini ditandai "data sedikit"

  /** PT yang diisi komoditas k di satu baris, mis. [1, 2] */
  const ptKomoditas = (b, k) => b.mt.map((m, i) => (String(m.komoditas || '').toUpperCase() === k ? i + 1 : 0)).filter(Boolean);
  const komoditasBaris = (b) => [...new Set(b.mt.map((m) => String(m.komoditas || '').trim().toUpperCase()).filter(Boolean))];

  /**
   * Analisis isian: untuk tiap komoditas yang ada di pengajuan aktif, berapa pengajuan mengisi 1/2/3 PT.
   * Satuan = per pengajuan per komoditas (pengajuan campuran padi PT1 + jagung PT2 dihitung terpisah).
   * Return [{ komoditas, total, sebaran: {1,2,3}, pt (mayoritas; seri → yang lebih kecil), persen, ragu, sedikit }]
   * terurut dari pengajuan terbanyak.
   */
  function analisis(baris) {
    const peta = new Map();
    for (const b of baris) {
      if (b.dikecualikan) continue;
      for (const k of komoditasBaris(b)) {
        const n = ptKomoditas(b, k).length;
        if (!peta.has(k)) peta.set(k, { komoditas: k, total: 0, sebaran: { 1: 0, 2: 0, 3: 0 } });
        const x = peta.get(k);
        x.total++; x.sebaran[n] = (x.sebaran[n] || 0) + 1;
      }
    }
    return [...peta.values()].map((x) => {
      const urut = Object.entries(x.sebaran).map(([pt, n]) => [Number(pt), n]).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
      const [pt, n] = urut[0];
      const persen = x.total ? Math.round((n / x.total) * 100) : 0;
      const seri = urut[1] && urut[1][1] === n;
      return { ...x, pt, persen, ragu: seri || persen < RAGU_PERSEN, sedikit: x.total < DATA_SEDIKIT };
    }).sort((a, b) => b.total - a.total || a.komoditas.localeCompare(b.komoditas));
  }

  /**
   * Aturan yang berlaku: hasil analisis, ditimpa angka manual pengguna. manual: { KOMODITAS: pt }
   * Return { KOMODITAS: { pt, manual: bool } } (manual untuk komoditas yang tidak ada di data diabaikan).
   */
  function aturanDari(hasilAnalisis, manual = {}) {
    const aturan = {};
    for (const a of hasilAnalisis) {
      const m = Number(manual[a.komoditas]);
      aturan[a.komoditas] = m >= 1 && m <= 3 ? { pt: m, manual: m !== a.pt } : { pt: a.pt, manual: false };
    }
    return aturan;
  }

  /** "PADI 2 PT · JAGUNG 3 PT" */
  const teksAturan = (aturan) => Object.entries(aturan).map(([k, a]) => `${k} ${a.pt} PT${a.manual ? ' (manual)' : ''}`).join(' · ');

  /** Masalah PT di satu baris: [{ komoditas, mt: [1], jumlah: 1, harus, luas }] — kosong bila semua benar. */
  function masalahMt(b, aturan, komoditas = Object.keys(aturan)) {
    const hasil = [];
    for (const k of komoditas) {
      const mt = ptKomoditas(b, k);
      if (mt.length && aturan[k] && mt.length !== aturan[k].pt) {
        hasil.push({ komoditas: k, mt, jumlah: mt.length, harus: aturan[k].pt, luas: Math.max(...mt.map((i) => b.mt[i - 1].luas || 0)) });
      }
    }
    return hasil;
  }

  /** Teks ringkas: "PADI hanya PT1, harus 2 PT", "JAGUNG 2 PT (PT1, PT2), harus 3 PT" */
  function teksMasalah(m) {
    const isi = m.jumlah === 1 ? `${m.komoditas} hanya PT${m.mt[0]}` : `${m.komoditas} ${m.jumlah} PT (${m.mt.map((i) => 'PT' + i).join(', ')})`;
    return `${isi}, harus ${m.harus} PT`;
  }

  /** Aksi yang mungkin untuk baris: 'batal' (status 2), 'hapus' (status 1), atau '' */
  const aksiUntuk = (b) => (b.statusId === STATUS_KORLUH ? 'batal' : b.statusId === STATUS_DRAF ? 'hapus' : '');

  /**
   * Cari baris bermasalah menurut aturan. f: { desa, poktan, komoditas ('' = semua), status ('' = aktif, 'semua', id) }
   * Return [{ b, masalah, aksi }] terurut desa → poktan → nama.
   */
  function cari(baris, aturan, f = {}) {
    const kom = f.komoditas ? [f.komoditas] : Object.keys(aturan);
    const out = [];
    for (const b of baris) {
      if (f.status === 'semua') { /* semua */ } else if (f.status) { if (String(b.statusId) !== String(f.status)) continue; } else if (b.dikecualikan) continue;
      if (f.desa && b.desa !== f.desa) continue;
      if (f.poktan && b.poktanId !== f.poktan) continue;
      const masalah = masalahMt(b, aturan, kom);
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
    const n = { total: item.length, batal: 0, hapus: 0, tanpaAksi: 0, per: {} }; // per: { KOMODITAS: jumlah pengajuan salah }
    for (const x of item) {
      if (x.aksi === 'batal') n.batal++; else if (x.aksi === 'hapus') n.hapus++; else n.tanpaAksi++;
      for (const k of new Set(x.masalah.map((m) => m.komoditas))) n.per[k] = (n.per[k] || 0) + 1;
    }
    return n;
  }

  /**
   * Cek ulang ke data terbaru sebelum aksi: baris masih ada, statusnya masih sesuai aksi, dan isinya belum berubah
   * (masih salah PT). Return '' bila aman, atau alasan.
   */
  function cekSebelumAksi(barisTerbaru, b, aksi, aturan) {
    const s = barisTerbaru.find((x) => x.id === b.id);
    if (!s) return 'baris sudah tidak ada';
    const wajib = aksi === 'batal' ? STATUS_KORLUH : STATUS_DRAF;
    if (s.statusId !== wajib) return `status sudah "${s.status}"`;
    if (s.sidik !== b.sidik) return 'isi baris sudah berubah (mungkin sudah diperbaiki)';
    if (!masalahMt(s, aturan).length) return 'PT sudah benar';
    return '';
  }

  const api = { RAGU_PERSEN, DATA_SEDIKIT, analisis, aturanDari, teksAturan, masalahMt, teksMasalah, aksiUntuk, cari, kelompokkan, hitung, cekSebelumAksi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ErdkkCekMt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
