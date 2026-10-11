// ================= CEK DUPLIKASI e-RDKK LINTAS STATUS ================= \\
// Aturan sama dengan Monitoring Duplikasi bawaan: dobel = baris yang IDENTIK di semua kolom data
// (data yang sama ter-upload 2x). Bedanya, bawaan hanya memeriksa "Belum dikirim ke Korluh",
// di sini SEMUA status aktif dibandingkan. Status ditolak/batal/Not Valid dikecualikan. Tanpa DOM, bisa dites di Node.

(function (root) {
  'use strict';

  const STATUS_DRAF = 1; // "Belum dikirim ke Korluh" — satu-satunya yang diperiksa fitur bawaan
  const STATUS_KORLUH = 2; // "Menunggu persetujuan Korluh" — masih bisa dibatalkan (tombol Batal bawaan)
  const MT = [1, 2, 3];
  const PUPUK = [['urea', 'Urea'], ['npk', 'NPK'], ['npk_formula', 'NPK Formula'], ['organic', 'Organik'], ['za', 'ZA'], ['sp36', 'SP-36'], ['poc', 'POC']];

  const angka = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const teks = (v) => String(v == null ? '' : v).trim();
  // Kolom yang TIDAK ikut dibandingkan: identitas baris, status, dan cap waktu/tanda sistem
  const ABAIKAN = new Set(['id', 'status', 'rejection_message', 'created_at', 'updated_at', 'is_new', 'is_sync', 'is_batch']);

  /** Sidik isi baris: semua kolom data selain ABAIKAN, urut nama kolom. Sama persis = duplikat. */
  function sidik(x) {
    return JSON.stringify(Object.keys(x).filter((k) => !ABAIKAN.has(k)).sort().map((k) => [k, x[k]]));
  }

  /** Status tidak ikut dihitung: ditolak, batal, dihapus, Not Valid (mis. NIK meninggal). */
  function dikecualikan(status) {
    const id = angka(status && status.id);
    const nama = teks(status && status.name);
    return id >= 90 || /tolak|batal|hapus|not\s*valid|tidak\s*valid/i.test(nama);
  }

  /** Baris API → bentuk ringkas yang dipakai panel & laporan. */
  function normalisasi(x) {
    return {
      id: x.id,
      nama: teks(x.farmer_name),
      nik: teks(x.farmer_nik),
      subsektor: teks(x.subsector),
      poktanId: teks(x.farmer_group_id),
      poktan: teks(x.farmer_group_name),
      desa: teks(x.sub_district_code),
      kecamatan: teks(x.district_code),
      statusId: angka(x.status && x.status.id),
      status: teks(x.status && x.status.name) || `Status ${angka(x.status && x.status.id)}`,
      penyuluh: teks(x.instructor_name),
      tahun: x.year,
      dibuat: x.created_at || '',
      diubah: x.updated_at || '',
      mt: MT.map((i) => ({
        komoditas: teks(x[`mt${i}_commodity`]),
        luas: angka(x[`mt${i}_planting_area`]),
        pupuk: Object.fromEntries(PUPUK.map(([k]) => [k, angka(x[`mt${i}_${k}`])])),
      })),
      dikecualikan: dikecualikan(x.status),
      sidik: sidik(x),
    };
  }

  /**
   * baris: hasil normalisasi
   * Return { kelompok: [...], dicek, dikecualikan } — kelompok berisi ≥2 baris yang identik semua kolomnya.
   * (Identik berarti juga poktan & desa sama, jadi otomatis "per poktan/desa".)
   */
  function cari(baris) {
    const aktif = baris.filter((b) => !b.dikecualikan && b.nik);
    const peta = new Map();
    for (const b of aktif) {
      const k = b.sidik;
      if (!peta.has(k)) peta.set(k, []);
      peta.get(k).push(b);
    }
    const kelompok = [];
    for (const [kunci, isi] of peta) {
      if (isi.length < 2) continue;
      isi.sort((a, b) => a.statusId - b.statusId || String(a.dibuat).localeCompare(String(b.dibuat)));
      const status = [...new Set(isi.map((b) => b.statusId))];
      const draf = isi.filter((b) => b.statusId === STATUS_DRAF).length;
      kelompok.push({
        kunci,
        nama: isi[0].nama,
        nik: isi[0].nik,
        subsektor: isi[0].subsektor,
        poktanId: isi[0].poktanId,
        poktan: isi[0].poktan,
        desa: isi[0].desa,
        baris: isi,
        lintasStatus: status.length > 1,
        terdeteksiBawaan: draf >= 2, // fitur bawaan hanya menangkap ≥2 baris "Belum dikirim ke Korluh"
        bisaDihapus: draf, // baris draf masih bisa dihapus sendiri oleh penyuluh
        bisaDibatal: isi.filter((b) => b.statusId === STATUS_KORLUH).length,
      });
    }
    kelompok.sort((a, b) => a.terdeteksiBawaan - b.terdeteksiBawaan || b.lintasStatus - a.lintasStatus ||
      a.poktan.localeCompare(b.poktan) || a.nama.localeCompare(b.nama));
    return { kelompok, dicek: aktif.length, dikecualikan: baris.length - aktif.length };
  }

  /** Saring kelompok: { cari, wilayah (id poktan), jenis: 'semua'|'luput'|'lintas' } */
  function saring(kelompok, f = {}) {
    const kata = teks(f.cari).toLowerCase().split(/\s+/).filter(Boolean);
    return kelompok.filter((k) => {
      if (f.wilayah && k.poktanId !== f.wilayah) return false;
      if (f.jenis === 'luput' && k.terdeteksiBawaan) return false;
      if (f.jenis === 'lintas' && !k.lintasStatus) return false;
      if (kata.length) {
        const t = [k.nama, k.nik, k.poktan, k.desa, k.subsektor].join(' ').toLowerCase();
        if (!kata.every((w) => t.includes(w))) return false;
      }
      return true;
    });
  }

  function hitung(kelompok) {
    return {
      kelompok: kelompok.length,
      baris: kelompok.reduce((s, k) => s + k.baris.length, 0),
      luput: kelompok.filter((k) => !k.terdeteksiBawaan).length,
      lintas: kelompok.filter((k) => k.lintasStatus).length,
    };
  }

  /** Daftar kelompok tani dari data: [{ id, nama }] */
  function daftarWilayah(baris) {
    const peta = new Map();
    for (const b of baris) {
      if (b.poktanId && !peta.has(b.poktanId)) peta.set(b.poktanId, b.poktan || `Poktan ${b.poktanId}`);
    }
    return [...peta].map(([id, nama]) => ({ id, nama })).sort((a, b) => a.nama.localeCompare(b.nama));
  }

  // ─── Aturan hapus ──────────────────────────────────────────────────────────
  // Hanya baris "Belum dikirim ke Korluh" yang boleh dihapus, dan selalu sisakan minimal satu baris per kelompok.

  /** Boleh hapus baris b dari kelompok k sekarang? */
  function bolehHapus(k, b) {
    return b.statusId === STATUS_DRAF && k.baris.length > 1 && k.baris.some((x) => x.id === b.id);
  }

  /**
   * Salinan yang dihapus oleh tombol "Hapus salinan" kelompok: semua draf bila ada baris yang sudah dikirim
   * (yang terkirim disisakan); bila semuanya draf, sisakan yang paling awal dibuat.
   */
  function salinanHapus(k) {
    const draf = k.baris.filter((b) => b.statusId === STATUS_DRAF);
    if (draf.length < k.baris.length) return draf;
    const urut = [...draf].sort((a, b) => String(a.dibuat).localeCompare(String(b.dibuat)) || a.id - b.id);
    return urut.slice(1);
  }

  /** Semua salinan yang dihapus tombol "Hapus semua salinan" untuk daftar kelompok: [{ k, b }]. */
  function semuaSalinanHapus(kelompok) {
    return kelompok.flatMap((k) => salinanHapus(k).map((b) => ({ k, b })));
  }

  /**
   * Boleh batalkan baris b (tarik kembali dari Korluh)? Hanya status 2, kelompoknya masih dobel, dan belum ada
   * salinan "Belum dikirim" (kalau ada, cukup hapus salinan itu, tidak perlu membatalkan yang sudah dikirim).
   */
  function bolehBatal(k, b) {
    return b.statusId === STATUS_KORLUH && k.baris.length > 1 && k.baris.some((x) => x.id === b.id) &&
      !k.baris.some((x) => x.statusId === STATUS_DRAF);
  }

  /**
   * Cek ulang sebelum aksi, dengan data terbaru dari server: baris masih ada, statusnya masih sesuai aksi
   * (hapus → 1, batal → 2), masih identik, dan masih punya kembaran aktif. Return '' bila aman, atau alasan.
   */
  function cekSebelumHapus(barisTerbaru, b, statusWajib = STATUS_DRAF) {
    const sekarang = barisTerbaru.find((x) => x.id === b.id);
    if (!sekarang) return 'baris sudah tidak ada (mungkin sudah dihapus)';
    if (sekarang.statusId !== statusWajib) return `status sudah berubah menjadi "${sekarang.status}"`;
    if (sekarang.sidik !== b.sidik) return 'isi baris sudah berubah, bukan salinan lagi';
    const kembar = barisTerbaru.filter((x) => !x.dikecualikan && x.sidik === b.sidik && x.id !== b.id);
    if (!kembar.length) return 'tidak ada salinan lain yang tersisa, baris ini tidak diubah';
    return '';
  }
  const cekSebelumBatal = (barisTerbaru, b) => cekSebelumHapus(barisTerbaru, b, STATUS_KORLUH);

  /** "PT1 JAGUNG 0,5 ha" ringkas */
  function ringkasMt(m) {
    return m.komoditas ? `${m.komoditas} ${String(m.luas).replace('.', ',')} ha` : '-';
  }

  const api = { STATUS_DRAF, STATUS_KORLUH, PUPUK, ABAIKAN, sidik, dikecualikan, normalisasi, cari, bolehHapus, salinanHapus, semuaSalinanHapus, cekSebelumHapus, bolehBatal, cekSebelumBatal, saring, hitung, daftarWilayah, ringkasMt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ErdkkDuplikasi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
