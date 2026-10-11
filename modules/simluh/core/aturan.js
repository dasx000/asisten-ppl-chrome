// ================= ATURAN FILE "CETAK EXCEL" & VALIDASI ANGGOTA POKTAN ================= \\
// Terjemahan logika scripts/run_simluh.py (bot DASBOT) ke JavaScript, tanpa akses jaringan.
// Dipakai content script ekstensi (global SimluhAturan) dan test Node (require).

(function (root) {
  'use strict';

  /** Isi file/baris tidak valid → baris ditolak, pesan untuk pengguna. */
  class GalatIsi extends Error {}

  // Kolom file "Cetak Excel" SIMLUH: [indeks, kunci, label, potongan judul kolom untuk validasi]
  const KOLOM_EXCEL = [
    [1, 'nama', 'Nama', 'nama'],
    [2, 'nik', 'NIK', 'nik'],
    [3, 'ttl', 'Tempat/Tgl Lahir', 'lahir'],
    [4, 'alamat', 'Alamat', 'alamat'],
    [5, 'jk', 'Jenis Kelamin', 'kelamin'],
    [6, 'no_hp', 'No HP', 'hp'],
    [7, 'status', 'Status Keanggotaan', 'status'],
    [8, 'kom1', 'Komoditas 1', 'komoditas'],
    [9, 'vol1', 'Volume Komoditas 1', 'volume'],
    [10, 'kom2', 'Komoditas 2', 'komoditas'],
    [11, 'vol2', 'Volume Komoditas 2', 'volume'],
    [12, 'kom3', 'Komoditas 3', 'komoditas'],
    [13, 'vol3', 'Volume Komoditas 3', 'volume'],
    [14, 'lainnya', 'Komoditas Lainnya', 'lainnya'],
    [15, 'luas_usaha', 'Luas Lahan Diusahakan', 'diu'],
    [16, 'luas_milik', 'Luas Lahan Dimiliki', 'dimiliki'],
    [17, 'kategori', 'Kategori Petani', 'kategori'],
    [18, 'koordinat', 'Titik Koordinat', 'koordinat'],
  ];
  const LABEL_EXCEL = Object.fromEntries(KOLOM_EXCEL.map(([, k, label]) => [k, label]));

  // Kolom Excel yang boleh diubah → [field sistem, jenis pembanding]
  const KOLOM_UBAH = [
    ['alamat', 'alamat_ktp', 'teks'],
    ['no_hp', 'no_hp', 'hp'],
    ['status', 'status_anggota', 'status'],
    ['kom1', 'kode_komoditas', 'komoditas'],
    ['vol1', 'volume', 'angka'],
    ['kom2', 'kode_komoditas2', 'komoditas'],
    ['vol2', 'volume2', 'angka'],
    ['kom3', 'kode_komoditas3', 'komoditas'],
    ['vol3', 'volume3', 'angka'],
    ['lainnya', 'lainnya', 'teks'],
    ['luas_usaha', 'luas_lahan_ternak_diusahakan', 'angka'],
    ['luas_milik', 'luas_lahan_ternak_dimiliki', 'angka'],
    ['kategori', 'kategori_petani_penggarap', 'kategori'],
    ['koordinat', 'titik_koordinat_lahan', 'koordinat'],
  ];
  const STATUS_TEKS = { 1: 'Anggota', 2: 'Calon Anggota' };
  const KATEGORI_TEKS = { 1: 'Pemilik', 2: 'Pemilik dan Penggarap', 3: 'Penggarap', 4: 'Buruh' };
  const JK_TEKS = { 1: 'Laki-laki', 2: 'Perempuan' };

  // Field yang dikirim saat update (urutan sama seperti FormData di halaman SIMLUH)
  const UPDATE_FIELDS = [
    'id_anggota', 'kode_kec', 'kode_desa', 'kode_kab', 'kode_prop', 'id_poktan',
    'nama_anggota', 'nama_ktp', 'jenis_kelamin', 'tempat_lahir',
    'tgl_lahir', 'bln_lahir', 'thn_lahir', 'no_hp', 'no_ktp', 'alamat_ktp',
    'status_anggota', 'kode_komoditas', 'kode_komoditas2', 'kode_komoditas3',
    'volume', 'volume2', 'volume3', 'lainnya',
    'luas_lahan_ternak_diusahakan', 'luas_lahan_ternak_dimiliki',
    'titik_koordinat_lahan', 'kategori_petani_penggarap',
  ];
  // Wajib terisi saat update (sesuai validasi JS di halaman SIMLUH)
  const WAJIB_UPDATE = {
    nama_anggota: 'Nama', no_ktp: 'NIK', status_anggota: 'Status Keanggotaan', kode_komoditas: 'Komoditas 1',
    luas_lahan_ternak_dimiliki: 'Luas Lahan Dimiliki', luas_lahan_ternak_diusahakan: 'Luas Lahan Diusahakan',
    titik_koordinat_lahan: 'Titik Koordinat', kategori_petani_penggarap: 'Kategori Petani',
  };
  // Wajib terisi untuk anggota baru (validasi form tambah di halaman SIMLUH)
  const WAJIB_TAMBAH = {
    no_hp: 'No HP', alamat_ktp: 'Alamat', status_anggota: 'Status Keanggotaan',
    kode_komoditas: 'Komoditas 1', volume: 'Volume Komoditas 1',
    luas_lahan_ternak_diusahakan: 'Luas Lahan Diusahakan', luas_lahan_ternak_dimiliki: 'Luas Lahan Dimiliki',
    titik_koordinat_lahan: 'Titik Koordinat', kategori_petani_penggarap: 'Kategori Petani',
  };
  // Endpoint edit mengembalikan 1/2, tapi form update mengirim teks
  const JENIS_KELAMIN = { 1: 'laki', 2: 'perempuan' };

  // Batas panjang isi tiap kolom (cegah isian berlebihan / iseng); baris yang melanggar ditolak utuh
  const MAKS_KARAKTER = {
    nama: 100, nik: 20, ttl: 80, alamat: 200, jk: 20, no_hp: 20, status: 30,
    kom1: 60, vol1: 10, kom2: 60, vol2: 10, kom3: 60, vol3: 10, lainnya: 100,
    luas_usaha: 10, luas_milik: 10, kategori: 40, koordinat: 100,
  };
  const MAKS_BARIS = 1000; // satu poktan wajarnya puluhan anggota
  const MAKS_UKURAN_FILE = 5 * 1024 * 1024; // Cetak Excel satu poktan hanya puluhan KB

  // ─── Utilitas teks & angka ─────────────────────────────────────────────────

  /** Rapikan spasi: trim + spasi beruntun jadi satu. */
  const rapat = (s) => (s == null ? '' : String(s)).split(/\s+/).filter(Boolean).join(' ');

  /** Data lama kosong kadang tersimpan sebagai null / 'null' / '-'. */
  function kosong(nilai) {
    const t = nilai == null ? '' : String(nilai).trim();
    return ['null', '-'].includes(t.toLowerCase()) ? '' : t;
  }

  /** Teks → angka (koma desimal boleh). null kalau bukan angka. */
  function angka(s) {
    const t = (s == null ? '' : String(s)).trim().replace(/,/g, '.');
    return /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(t) ? Number(t) : null;
  }

  /** Nilai tersimpan sama dengan yang dikirim (angka dibandingkan sebagai angka: 1.5 == 1.50). */
  function setara(a, b) {
    if (rapat(a) === rapat(b)) return true;
    const na = angka(a || ''), nb = angka(b || '');
    return na !== null && na === nb;
  }

  /** Bagian label komoditas setelah '-' pertama ('Perkebunan-Kopi' → 'Kopi'). */
  function labelPendek(label) {
    const i = label.indexOf('-');
    return i < 0 ? label : label.slice(i + 1);
  }

  /** Digit no HP tanpa awalan 62/0, untuk membandingkan (data lama ada yang tersimpan tanpa 0). */
  function intiHp(hp) {
    let d = String(hp || '').replace(/\D/g, '');
    if (d.startsWith('62')) d = d.slice(2);
    return d.replace(/^0+/, '');
  }

  // ─── Membaca file Excel ────────────────────────────────────────────────────

  /** Nilai sel → teks. Angka bulat ditulis tanpa .0 (NIK/no HP yang tersimpan sebagai angka). */
  function sel(v) {
    if (v == null) return '';
    if (typeof v === 'number') return String(v);
    return String(v).trim();
  }

  /**
   * ArrayBuffer file → baris-baris sel teks (sheet pertama, nomor baris absolut).
   * XLSX: library SheetJS (global di browser, require di Node).
   */
  function bacaSheet(buf, XLSX) {
    const b = new Uint8Array(buf.slice(0, 8));
    const xlsx = b[0] === 0x50 && b[1] === 0x4b; // 'PK' (mis. disimpan ulang dari Excel)
    const xls = b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0; // .xls lama (bawaan SIMLUH)
    if (!xlsx && !xls) throw new GalatIsi('File bukan Excel (.xls/.xlsx). Pakai file hasil tombol "Cetak Excel" di SIMLUH.');
    let wb;
    try {
      wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: false, cellHTML: false, cellStyles: false });
    } catch (e) {
      throw new GalatIsi(`File Excel tidak bisa dibuka (${e.message}). Coba unduh ulang dari tombol "Cetak Excel".`);
    }
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws || !ws['!ref']) return [];
    const range = XLSX.utils.decode_range(ws['!ref']);
    const kolom = Math.max(range.e.c, 18);
    const rows = [];
    for (let r = 0; r <= range.e.r; r++) {
      const row = [];
      for (let c = 0; c <= kolom; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        row.push(sel(cell ? cell.v : null));
      }
      rows.push(row);
    }
    return rows;
  }

  const pad = (row, n) => (row.length >= n ? row.slice() : row.concat(Array(n - row.length).fill('')));

  /** Baris sheet → { idPoktan, baris }. Tiap baris: { _baris, nama, nik, ..., _terlaluPanjang } */
  function bacaExcel(sheet) {
    let idPoktan = '';
    let header = -1;
    for (let i = 0; i < sheet.length; i++) {
      const row = pad(sheet[i], 19);
      if (row[1].toLowerCase() === 'id kelompok tani') idPoktan = row[2];
      if (row[0].toLowerCase() === 'no' && row[1].toLowerCase() === 'nama') {
        header = i;
        break;
      }
    }
    if (!idPoktan || header < 0)
      throw new GalatIsi('Format file tidak dikenali. Gunakan file hasil tombol "Cetak Excel" dari daftar anggota poktan SIMLUH.');
    const judul = pad(sheet[header], 19).map((c) => c.toLowerCase().replace(/ /g, ''));
    const salah = KOLOM_EXCEL.filter(([idx, , , potong]) => !judul[idx].includes(potong)).map(([, , label]) => label);
    if (salah.length) throw new GalatIsi(`Susunan kolom berubah (cek kolom: ${salah.join(', ')}). Jangan sisipkan/hapus kolom.`);

    const baris = [];
    for (let i = header + 1; i < sheet.length; i++) {
      const row = pad(sheet[i], 19);
      const data = {};
      for (const [idx, k] of KOLOM_EXCEL) data[k] = row[idx];
      if (!data.nik && !data.nama) continue;
      data._baris = i + 1;
      data._terlaluPanjang = Object.entries(MAKS_KARAKTER)
        .filter(([k, maks]) => rapat(data[k]).length > maks)
        .map(([k, maks]) => `${LABEL_EXCEL[k]} maks ${maks} karakter`);
      baris.push(data);
      if (baris.length > MAKS_BARIS)
        throw new GalatIsi(`File berisi lebih dari ${MAKS_BARIS} baris anggota. Kirim per poktan dari "Cetak Excel".`);
    }
    return { idPoktan, baris };
  }

  // ─── Konversi teks Excel → kode SIMLUH ─────────────────────────────────────

  /** Teks Excel ('Kopi' / 'Perkebunan-Kopi') → kode. komoditas: Map kode → label. */
  function kodeKomoditas(teks, komoditas, kodeLama) {
    const t = rapat(teks).toLowerCase();
    if (!t) return '';
    if (kodeLama && labelPendek(komoditas.get(kodeLama) || '').toLowerCase() === t)
      return kodeLama; // sama dengan nilai sekarang (penting untuk 'Lainnya' yang ada di beberapa kelompok)
    const semua = [...komoditas.entries()];
    const penuh = semua.filter(([, v]) => v.toLowerCase() === t);
    if (penuh.length) return penuh[0][0];
    const pendek = semua.filter(([, v]) => labelPendek(v).toLowerCase() === t);
    if (pendek.length === 1) return pendek[0][0];
    if (pendek.length > 1)
      throw new GalatIsi(`komoditas '${teks}' ambigu, tulis lengkap salah satu: ${pendek.map(([, v]) => v).join(', ')}`);
    throw new GalatIsi(`komoditas '${teks}' tidak dikenal`);
  }

  function kodeStatus(teks) {
    const t = rapat(teks).toLowerCase();
    if (!t) throw new GalatIsi('Status Keanggotaan wajib diisi (Anggota / Calon Anggota)');
    if (t.includes('calon')) return '2';
    if (t.includes('anggota')) return '1';
    throw new GalatIsi(`status '${teks}' tidak dikenal (isi: Anggota / Calon Anggota)`);
  }

  function kodeKategori(teks) {
    const t = rapat(teks).toLowerCase();
    const pilihan = '(isi: Pemilik / Pemilik dan Penggarap / Penggarap / Buruh)';
    if (!t) throw new GalatIsi(`Kategori Petani wajib diisi ${pilihan}`);
    if (t.includes('buruh')) return '4';
    if (t.includes('pemilik') && t.includes('penggarap')) return '2';
    if (t.includes('pemilik')) return '1';
    if (t.includes('penggarap')) return '3';
    throw new GalatIsi(`kategori '${teks}' tidak dikenal ${pilihan}`);
  }

  /** Nilai sistem → teks yang mudah dibaca (untuk tampilan perubahan). */
  function teksSistem(jenis, nilai, komoditas) {
    nilai = nilai == null ? '' : String(nilai);
    if (jenis === 'komoditas') {
      nilai = kosong(nilai);
      return nilai ? labelPendek(komoditas.get(nilai) || nilai) : '';
    }
    if (jenis === 'angka') return kosong(nilai);
    if (jenis === 'status') return STATUS_TEKS[nilai] || nilai;
    if (jenis === 'kategori') return KATEGORI_TEKS[nilai] || nilai;
    return rapat(nilai);
  }

  // ─── Membandingkan baris Excel dengan data SIMLUH ──────────────────────────

  const SLOT_KOMODITAS = [['kode_komoditas', 'volume'], ['kode_komoditas2', 'volume2'], ['kode_komoditas3', 'volume3']];

  /** Aturan pasangan komoditas–volume pada hasil akhir (nilai baru kalau diubah, nilai lama kalau tidak).
   *  Komoditas dihapus → volumenya ikut dikosongkan. GalatIsi kalau kombinasinya tidak valid. */
  function cekKomoditas(perubahan, tampil, lama, komoditas) {
    const ambil = (f) => (f in perubahan ? perubahan[f] : kosong(lama[f]));
    const akhir = [];
    SLOT_KOMODITAS.forEach(([fk, fv], n) => {
      const i = n + 1;
      let k = ambil(fk);
      if (k === '0') k = '';
      let v = ambil(fv);
      const disentuh = fk in perubahan || fv in perubahan;
      if (!k && v && fk in perubahan) {
        // Komoditas dihapus tapi volumenya tertinggal di Excel → kosongkan juga
        perubahan[fv] = v = '';
        const sisa = tampil.filter((t) => t.kolom !== `Volume Komoditas ${i}`);
        tampil.length = 0;
        tampil.push(...sisa, { kolom: `Volume Komoditas ${i}`, lama: kosong(lama[fv]), baru: '' });
      } else if (!k && v && disentuh) {
        throw new GalatIsi(`Volume Komoditas ${i} diisi tapi Komoditas ${i} kosong`);
      } else if (k && !v && disentuh) {
        throw new GalatIsi(`Volume Komoditas ${i} (${teksSistem('komoditas', k, komoditas)}) wajib diisi`);
      }
      akhir.push(k);
    });
    if (!SLOT_KOMODITAS.some((slot) => slot.some((f) => f in perubahan))) return;
    if (!akhir[0])
      throw new GalatIsi('Komoditas 1 wajib diisi (minimal 1 komoditas). Kalau sudah tidak diusahakan, ' +
        'pindahkan Komoditas 2 beserta volumenya ke kolom Komoditas 1');
    const terisi = akhir.filter(Boolean);
    if (new Set(terisi).size !== terisi.length) throw new GalatIsi('komoditas yang sama diisi lebih dari sekali');
  }

  /**
   * Bandingkan satu baris Excel dengan data SIMLUH (lama = {} untuk anggota baru).
   * Return { perubahan: {field: nilai baru}, tampil: [{kolom, lama, baru}], peringatan: [teks] }.
   * GalatIsi kalau ada isi yang tidak valid.
   */
  function bandingkan(baris, lama, komoditas) {
    const perubahan = {}, tampil = [], peringatan = [];
    for (const [kolom, field, jenis] of KOLOM_UBAH) {
      const baruTeks = baris[kolom];
      let lamaNilai = lama[field] == null ? '' : String(lama[field]);
      let baru, sama;
      if (jenis === 'komoditas') {
        if (['null', '-', '0'].includes(lamaNilai.trim().toLowerCase())) lamaNilai = ''; // data lama kosong
        baru = kodeKomoditas(baruTeks, komoditas, lamaNilai);
        sama = baru === lamaNilai;
      } else if (jenis === 'status') {
        baru = kodeStatus(baruTeks);
        sama = baru === lamaNilai;
      } else if (jenis === 'kategori') {
        baru = kodeKategori(baruTeks);
        sama = baru === lamaNilai;
      } else if (jenis === 'angka') {
        baru = kosong(rapat(baruTeks));
        lamaNilai = kosong(lamaNilai);
        const a = angka(baru), b = angka(lamaNilai);
        sama = a !== null && b !== null ? a === b : baru === rapat(lamaNilai);
        if (!sama && baru && a === null) throw new GalatIsi(`${LABEL_EXCEL[kolom]} '${baruTeks}' bukan angka`);
        if (!sama && a !== null && a < 0) throw new GalatIsi(`${LABEL_EXCEL[kolom]} tidak boleh negatif (${baruTeks})`);
        if (!sama) baru = baru.replace(/,/g, '.');
      } else if (jenis === 'hp') {
        baru = String(baruTeks || '').replace(/\D/g, '');
        if (baru.startsWith('8')) baru = '0' + baru; // Excel membuang 0 di depan kalau sel berformat angka
        sama = intiHp(baru) === intiHp(lamaNilai);
        if (!sama && rapat(baruTeks) && !(baru.length >= 10 && baru.length <= 15))
          throw new GalatIsi(`No HP '${rapat(baruTeks)}' tidak valid (10–15 angka, contoh: 081234567890)`);
      } else if (jenis === 'koordinat') {
        baru = rapat(baruTeks);
        sama = baru.replace(/\s/g, '') === lamaNilai.replace(/\s/g, ''); // abaikan spasi; format bebas
      } else {
        baru = rapat(baruTeks);
        sama = baru === rapat(lamaNilai);
      }
      if (!sama) {
        perubahan[field] = baru;
        tampil.push({
          kolom: LABEL_EXCEL[kolom],
          lama: teksSistem(jenis, lamaNilai, komoditas),
          baru: teksSistem(jenis, baru, komoditas),
        });
      }
    }

    cekKomoditas(perubahan, tampil, lama, komoditas);

    // Kolom terkunci: cukup diberi peringatan kalau diubah
    if (rapat(baris.nama).toLowerCase() !== rapat(lama.nama_ktp).toLowerCase())
      peringatan.push('Nama tidak bisa diubah lewat Excel, diabaikan');
    const ttlLama = `${lama.tempat_lahir || ''}, ${lama.tgl_lahir ?? ''}-${lama.bln_lahir ?? ''}-${lama.thn_lahir ?? ''}`;
    if (rapat(baris.ttl).replace(/ /g, '').toLowerCase() !== ttlLama.replace(/ /g, '').toLowerCase())
      peringatan.push('Tempat/Tgl Lahir tidak bisa diubah lewat SIMLUH, diabaikan');
    if (rapat(baris.jk).toLowerCase() !== (JK_TEKS[String(lama.jenis_kelamin)] || '').toLowerCase())
      peringatan.push('Jenis Kelamin tidak bisa diubah lewat SIMLUH, diabaikan');
    return { perubahan, tampil, peringatan };
  }

  /** Data lama + perubahan → payload form update. GalatIsi kalau field wajib kosong. */
  function buildPayload(lama, perubahan) {
    const payload = {};
    for (const field of UPDATE_FIELDS) {
      const nilai = field in perubahan ? perubahan[field] : lama[field];
      payload[field] = nilai == null ? '' : String(nilai);
    }
    payload.jenis_kelamin = JENIS_KELAMIN[payload.jenis_kelamin] || payload.jenis_kelamin;
    const kurang = Object.keys(WAJIB_UPDATE).filter((f) => !payload[f].trim()).map((f) => WAJIB_UPDATE[f]);
    if (kurang.length) throw new GalatIsi(`wajib diisi: ${kurang.join(', ')}`);
    return payload;
  }

  // ─── Anggota baru ──────────────────────────────────────────────────────────

  /** 'KASUI PASAR, 15-8-1974' → { tempat, tgl: '15', bln: '08', thn: '1974' }. GalatIsi kalau format/umur salah. */
  function parseTtl(teks, hariIni = new Date()) {
    const t = rapat(teks);
    const contoh = `Tempat/Tgl Lahir '${teks}' harus format: TEMPAT, tgl-bln-tahun (contoh: KASUI, 15-8-1974)`;
    const koma = t.lastIndexOf(',');
    if (koma < 0) throw new GalatIsi(contoh);
    const tempat = t.slice(0, koma).trim();
    const tgl = t.slice(koma + 1).trim();
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(tgl);
    if (!tempat || !m) throw new GalatIsi(contoh);
    const [d, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const lahir = new Date(y, b - 1, d);
    if (y < 1 || lahir.getFullYear() !== y || lahir.getMonth() !== b - 1 || lahir.getDate() !== d)
      throw new GalatIsi(`Tanggal lahir '${tgl}' tidak valid`);
    const sebelumUltah = hariIni.getMonth() < b - 1 || (hariIni.getMonth() === b - 1 && hariIni.getDate() < d);
    const umur = hariIni.getFullYear() - y - (sebelumUltah ? 1 : 0);
    if (umur < 15 || umur > 100) throw new GalatIsi(`Umur ${umur} tahun, SIMLUH hanya menerima umur 15–100 tahun`);
    return { tempat, tgl: String(d).padStart(2, '0'), bln: String(b).padStart(2, '0'), thn: String(y) };
  }

  function parseJk(teks) {
    const t = rapat(teks).toLowerCase();
    if (t.startsWith('perem') || t === 'p' || t === 'wanita') return 'perempuan';
    if (t.startsWith('laki') || t === 'l' || t === 'pria') return 'laki';
    throw new GalatIsi(`Jenis Kelamin '${teks}' tidak dikenal (isi: Laki-laki / Perempuan)`);
  }

  /** Cek NIK baris Excel. Return alasan tolak, atau '' kalau tampak wajar. */
  function cekNik(nik, { wajib16 = false } = {}) {
    if (/E\+/i.test(nik) || (nik && !/^\d+$/.test(nik)))
      return `NIK rusak (${nik.slice(0, 20)}), ubah format kolom NIK jadi Teks lalu ketik ulang`;
    if (wajib16 && nik.length !== 16) return `NIK '${nik.slice(0, 20)}' harus 16 angka`;
    return '';
  }

  const api = {
    GalatIsi, KOLOM_EXCEL, LABEL_EXCEL, KOLOM_UBAH, UPDATE_FIELDS, WAJIB_UPDATE, WAJIB_TAMBAH,
    MAKS_KARAKTER, MAKS_BARIS, MAKS_UKURAN_FILE, STATUS_TEKS, KATEGORI_TEKS, JK_TEKS,
    rapat, kosong, angka, setara, sel, bacaSheet, bacaExcel, kodeKomoditas, kodeStatus, kodeKategori,
    teksSistem, cekKomoditas, bandingkan, buildPayload, parseTtl, parseJk, cekNik,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SimluhAturan = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
