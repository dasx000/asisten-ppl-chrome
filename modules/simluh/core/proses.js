// ================= ALUR PERIKSA & KIRIM (UBAH / TAMBAH ANGGOTA) ================= \\
// Padanan proses_excel & proses_tambah di scripts/run_simluh.py, dipecah dua tahap:
// periksa (pratinjau, tanpa mengubah apa pun) lalu kirim (per anggota, bisa dihentikan).
// `api` disuntikkan (SimluhApi di browser, tiruan di test).

(function (root) {
  'use strict';

  const A = typeof module !== 'undefined' && module.exports ? require('./aturan.js') : root.SimluhAturan;
  const { GalatIsi } = A;

  // Status hasil per baris
  const S = {
    UBAH: 'UBAH', SIAP: 'SIAP', SAMA: 'SAMA', OK: 'OK', GAGAL: 'GAGAL', TOLAK: 'TOLAK',
    TIDAK_DITEMUKAN: 'TIDAK_DITEMUKAN', SUDAH_ADA: 'SUDAH_ADA', BATAL: 'BATAL',
  };

  function hasilBaru(b) {
    return { baris: b._baris, nik: A.rapat(b.nik).slice(0, 20), nama: A.rapat(b.nama).slice(0, 60),
      status: '', tampil: [], peringatan: [], alasan: '', _row: b };
  }

  const hitung = (daftar) => daftar.reduce((n, h) => ((n[h.status] = (n[h.status] || 0) + 1), n), {});

  /** Error yang membuat seluruh proses harus berhenti (sesi login habis). */
  const fatal = (api, e) => api.SesiHabis && e instanceof api.SesiHabis;

  /** File harus milik poktan yang sedang dibuka (menggantikan cek "poktan binaan BPP" di bot). */
  function cekPoktan(idPoktan, halaman) {
    if (String(idPoktan).trim() !== String(halaman.idPoktan).trim())
      throw new GalatIsi(`File ini milik poktan ID ${idPoktan}, sedangkan halaman yang dibuka poktan ` +
        `${halaman.namaPoktan || ''} (ID ${halaman.idPoktan}). Buka halaman anggota poktan yang sesuai.`);
  }

  // ─── Ubah anggota lama ─────────────────────────────────────────────────────

  /**
   * Pratinjau perubahan. Membaca data tiap anggota dari SIMLUH, tidak mengirim apa pun.
   * Return { hasil: [...], tidakDiFile }
   */
  async function periksaUbah({ idPoktan, baris }, halaman, api, { onProgres, dihentikan } = {}) {
    cekPoktan(idPoktan, halaman);
    const perNik = new Map();
    for (const a of halaman.anggota) perNik.set(a.nik, [...(perNik.get(a.nik) || []), a]);
    const nikExcel = baris.map((b) => b.nik);
    const hasil = [];

    for (const [i, b] of baris.entries()) {
      if (dihentikan && dihentikan()) break;
      if (onProgres) onProgres(i, baris.length, b);
      const h = hasilBaru(b);
      const cocok = perNik.get(b.nik) || [];
      const nikRusak = A.cekNik(b.nik);
      if (nikRusak) {
        Object.assign(h, { status: S.TOLAK, alasan: nikRusak });
      } else if (nikExcel.filter((n) => n === b.nik).length > 1) {
        Object.assign(h, { status: S.TOLAK, alasan: 'NIK muncul lebih dari sekali di file' });
      } else if (!cocok.length && b.nik.endsWith('0000')) {
        Object.assign(h, { status: S.TOLAK, alasan: 'NIK tidak ditemukan, kemungkinan rusak oleh Excel (angka belakang jadi 0). ' +
          'Ubah format kolom NIK jadi Teks lalu ketik ulang' });
      } else if (!cocok.length) {
        Object.assign(h, { status: S.TIDAK_DITEMUKAN, alasan: 'NIK tidak ada di poktan ini. Untuk anggota baru, pakai mode Tambah' });
      } else if (cocok.length > 1) {
        Object.assign(h, { status: S.TOLAK, alasan: 'NIK ganda di SIMLUH, ubah manual' });
      } else {
        h.idAnggota = cocok[0].id_anggota;
        try {
          if (b._terlaluPanjang.length) throw new GalatIsi('isian terlalu panjang: ' + b._terlaluPanjang.join(', '));
          const lama = await api.getAnggota(h.idAnggota);
          const r = A.bandingkan(b, lama, halaman.komoditas);
          Object.assign(h, { tampil: r.tampil, peringatan: r.peringatan });
          if (!Object.keys(r.perubahan).length) {
            h.status = S.SAMA;
          } else {
            A.buildPayload(lama, r.perubahan); // cek field wajib sejak pratinjau
            h.status = S.UBAH;
          }
        } catch (e) {
          if (fatal(api, e)) throw e;
          Object.assign(h, { status: e instanceof GalatIsi ? S.TOLAK : S.GAGAL, alasan: e.message });
        }
      }
      hasil.push(h);
    }
    const tidakDiFile = halaman.anggota.filter((a) => !nikExcel.includes(a.nik)).length;
    return { hasil, tidakDiFile };
  }

  /** Kirim update lalu baca ulang. Return daftar field yang belum tersimpan ([] = berhasil). */
  async function updateDanCek(api, payload, perubahan) {
    const belum = (d) => Object.keys(perubahan).filter((f) => !A.setara(d[f], perubahan[f]));
    try {
      await api.updateAnggota(payload);
    } catch (e) {
      if (!(e instanceof api.ServerSibuk)) throw e;
      // Server membalas error, tapi siapa tahu sebenarnya sudah tersimpan
      const d = await api.getAnggota(payload.id_anggota).catch(() => null);
      if (d && !belum(d).length) return [];
      throw e;
    }
    return belum(await api.getAnggota(payload.id_anggota));
  }

  /**
   * Kirim baris berstatus UBAH. Data dibaca ulang tepat sebelum dikirim (bisa saja sudah diubah orang lain
   * sejak pratinjau). Mengubah objek hasil di tempat.
   */
  async function kirimUbah(hasil, halaman, api, { onProgres, dihentikan } = {}) {
    const antre = hasil.filter((h) => h.status === S.UBAH);
    for (const [i, h] of antre.entries()) {
      if (dihentikan && dihentikan()) {
        antre.slice(i).forEach((x) => Object.assign(x, { status: S.BATAL, alasan: 'belum dikirim (dihentikan)' }));
        break;
      }
      if (onProgres) onProgres(i, antre.length, h);
      try {
        const lama = await api.getAnggota(h.idAnggota);
        const r = A.bandingkan(h._row, lama, halaman.komoditas);
        Object.assign(h, { tampil: r.tampil, peringatan: r.peringatan });
        if (!Object.keys(r.perubahan).length) {
          Object.assign(h, { status: S.SAMA, alasan: 'data di SIMLUH sudah sama' });
          continue;
        }
        const gagal = await updateDanCek(api, A.buildPayload(lama, r.perubahan), r.perubahan);
        Object.assign(h, gagal.length
          ? { status: S.GAGAL, alasan: `belum tersimpan: ${gagal.join(', ')}` }
          : { status: S.OK, alasan: '' });
      } catch (e) {
        if (fatal(api, e)) {
          antre.slice(i).forEach((x) => Object.assign(x, { status: S.BATAL, alasan: 'belum dikirim (sesi login habis)' }));
          throw e;
        }
        Object.assign(h, { status: e instanceof GalatIsi ? S.TOLAK : S.GAGAL, alasan: e.message });
      }
    }
    return hasil;
  }

  // ─── Tambah anggota baru ───────────────────────────────────────────────────

  /** Ringkasan anggota baru untuk tampilan: TTL · komoditas (volume) · luas. */
  function ringkasBaru(tampil) {
    const n = Object.fromEntries(tampil.map((p) => [p.kolom, p.baru]));
    const kom = [1, 2, 3].filter((i) => n[`Komoditas ${i}`])
      .map((i) => `${n[`Komoditas ${i}`]} (${n[`Volume Komoditas ${i}`] || '-'})`).join(', ');
    return [n['Tempat/Tgl Lahir'], kom, n['Luas Lahan Diusahakan'] && `luas ${n['Luas Lahan Diusahakan']} ha`]
      .filter(Boolean).join(' · ');
  }

  /**
   * Pratinjau anggota baru (NIK belum ada di poktan). Hanya memeriksa isi file, tanpa jaringan.
   * Return { hasil: [...tanpa SUDAH_ADA], sudahAda }
   */
  function periksaTambah({ idPoktan, baris }, halaman, hariIni = new Date()) {
    cekPoktan(idPoktan, halaman);
    const nikSistem = new Set(halaman.anggota.map((a) => a.nik));
    const nikExcel = baris.map((b) => b.nik);
    const hasil = [];
    let sudahAda = 0;
    for (const b of baris) {
      const h = hasilBaru(b);
      const nik = b.nik;
      if (nikSistem.has(nik)) {
        sudahAda++; // anggota lama: diurus mode Ubah
        continue;
      }
      const nikRusak = A.cekNik(nik, { wajib16: true });
      if (nikRusak) {
        Object.assign(h, { status: S.TOLAK, alasan: `${nikRusak} (ubah format kolom NIK jadi Teks lalu ketik ulang)` });
      } else if (nik.endsWith('0000')) {
        Object.assign(h, { status: S.TOLAK, alasan: 'NIK tidak valid (4 angka terakhir 0000), kemungkinan rusak oleh Excel' });
      } else if (nikExcel.filter((n) => n === nik).length > 1) {
        Object.assign(h, { status: S.TOLAK, alasan: 'NIK muncul lebih dari sekali di file' });
      } else if (!A.rapat(b.nama)) {
        Object.assign(h, { status: S.TOLAK, alasan: 'Nama (sesuai KTP) wajib diisi' });
      } else {
        try {
          if (b._terlaluPanjang.length) throw new GalatIsi('isian terlalu panjang: ' + b._terlaluPanjang.join(', '));
          const ttl = A.parseTtl(b.ttl, hariIni);
          const jk = A.parseJk(b.jk);
          const r = A.bandingkan(b, {}, halaman.komoditas);
          const kurang = Object.entries(A.WAJIB_TAMBAH)
            .filter(([f]) => !String(r.perubahan[f] || '').trim()).map(([, label]) => label);
          if (kurang.length) throw new GalatIsi(`wajib diisi: ${kurang.join(', ')}`);
          h.tampil = [{ kolom: 'Tempat/Tgl Lahir', lama: '', baru: `${ttl.tempat}, ${ttl.tgl}-${ttl.bln}-${ttl.thn}` }, ...r.tampil];
          h.ringkas = ringkasBaru(h.tampil);
          h._baru = { nik, nama: A.rapat(b.nama), jk, ...ttl, nilai: r.perubahan };
          h.status = S.SIAP;
        } catch (e) {
          Object.assign(h, { status: S.TOLAK, alasan: e.message });
        }
      }
      hasil.push(h);
    }
    return { hasil, sudahAda };
  }

  const FIELD_TAMBAH = ['no_hp', 'alamat_ktp', 'status_anggota', 'kode_komoditas', 'kode_komoditas2', 'kode_komoditas3',
    'volume', 'volume2', 'volume3', 'lainnya', 'luas_lahan_ternak_dimiliki', 'luas_lahan_ternak_diusahakan',
    'titik_koordinat_lahan', 'kategori_petani_penggarap'];

  /** Cek Dukcapil lalu simpan baris berstatus SIAP. Mengubah objek hasil di tempat. */
  async function kirimTambah(hasil, halaman, api, { onProgres, dihentikan } = {}) {
    const antre = hasil.filter((h) => h.status === S.SIAP);
    if (!antre.length) return hasil;
    let nikSistem = new Set((await api.ambilHalaman(halaman.url)).anggota.map((a) => a.nik));
    let dukcapil = null; // dicek sekali sebelum NIK pertama dikirim

    for (const [i, h] of antre.entries()) {
      if (dihentikan && dihentikan()) {
        antre.slice(i).forEach((x) => Object.assign(x, { status: S.BATAL, alasan: 'belum dikirim (dihentikan)' }));
        break;
      }
      if (onProgres) onProgres(i, antre.length, h);
      const d = h._baru;
      try {
        if (nikSistem.has(d.nik)) {
          Object.assign(h, { status: S.SUDAH_ADA, alasan: 'NIK sudah terdaftar di poktan ini (pakai mode Ubah)' });
          continue;
        }
        if (!dukcapil) dukcapil = await api.statusDukcapil();
        if (!dukcapil.terhubung) throw new Error(`API Dukcapil sedang tidak terhubung (${dukcapil.pesan}), coba lagi nanti`);
        const cek = await api.cekDukcapil(d);
        if (!cek.valid) throw new GalatIsi(`Dukcapil: ${cek.pesan}`);
        const data = { ...halaman.wilayah, id_poktan: halaman.wilayah.id_poktan || halaman.idPoktan,
          nama_anggota: d.nama, nama_ktp: d.nama, no_ktp: d.nik, tempat_lahir: d.tempat,
          tgl_lahir: d.tgl, bln_lahir: d.bln, thn_lahir: d.thn, jenis_kelamin: d.jk, msgdukcapil: cek.pesan };
        for (const f of FIELD_TAMBAH) data[f] = String(d.nilai[f] || '');
        let simpan;
        try {
          simpan = await api.simpanAnggota(data);
        } catch (e) {
          if (!(e instanceof api.ServerSibuk)) throw e;
          simpan = { ok: true, ragu: e.message }; // server error: dicek di daftar anggota di bawah
        }
        if (!simpan.ok) throw new Error(`ditolak SIMLUH: ${simpan.pesan || 'tanpa keterangan'}`);
        // Pastikan benar-benar muncul di daftar anggota poktan
        nikSistem = new Set((await api.ambilHalaman(halaman.url)).anggota.map((a) => a.nik));
        Object.assign(h, nikSistem.has(d.nik)
          ? { status: S.OK, alasan: '' }
          : { status: S.GAGAL, alasan: simpan.ragu
            ? `${simpan.ragu}. Coba kirim ulang nanti`
            : 'SIMLUH membalas sukses, tapi anggota belum muncul di daftar poktan' });
      } catch (e) {
        if (fatal(api, e)) {
          antre.slice(i).forEach((x) => Object.assign(x, { status: S.BATAL, alasan: 'belum dikirim (sesi login habis)' }));
          throw e;
        }
        Object.assign(h, { status: e instanceof GalatIsi ? S.TOLAK : S.GAGAL, alasan: e.message });
      }
    }
    return hasil;
  }

  const api = { S, hitung, cekPoktan, periksaUbah, kirimUbah, updateDanCek, periksaTambah, kirimTambah, ringkasBaru };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SimluhProses = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
