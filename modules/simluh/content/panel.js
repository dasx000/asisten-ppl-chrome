// ================= PANEL "UPDATE DARI EXCEL" DI HALAMAN ANGGOTA POKTAN ================= \\
// Tombol melayang + laci samping (Shadow DOM, gaya SIMLUH tidak bocor ke panel dan sebaliknya).
// Alur: pilih mode → pilih file Cetak Excel → periksa (pratinjau) → kirim → laporan.

(function () {
  'use strict';
  if (window.__asistenSimluh) return;
  window.__asistenSimluh = true;

  // Hanya di halaman daftar anggota poktan
  if (!document.getElementById('id_poktan') || !document.getElementById('kode_komoditas')) return;

  const A = window.SimluhAturan, API = window.SimluhApi, P = window.SimluhProses, S = P.S;

  // ─── Label & warna status ──────────────────────────────────────────────────
  const LABEL = {
    UBAH: 'Akan diubah', SIAP: 'Siap ditambahkan', SAMA: 'Tidak berubah', GAGAL: 'Gagal', TOLAK: 'Ditolak',
    TIDAK_DITEMUKAN: 'NIK tidak ada di poktan', SUDAH_ADA: 'Sudah terdaftar', BATAL: 'Belum dikirim',
  };
  const labelOk = (mode) => (mode === 'tambah' ? 'Berhasil ditambahkan' : 'Berhasil diperbarui');
  const NADA = { UBAH: 'biru', SIAP: 'biru', OK: 'hijau', SAMA: 'abu', SUDAH_ADA: 'abu', GAGAL: 'merah', TOLAK: 'merah',
    TIDAK_DITEMUKAN: 'kuning', BATAL: 'kuning' };
  // Urutan & judul kelompok per tahap
  const KELOMPOK = {
    pratinjau: {
      ubah: [[S.UBAH, 'Akan diubah'], [S.TOLAK, 'Ditolak — perbaiki di Excel lalu periksa ulang'],
        [S.TIDAK_DITEMUKAN, 'NIK tidak ada di poktan ini'], [S.GAGAL, 'Gagal dicek'], [S.SAMA, 'Tidak berubah']],
      tambah: [[S.SIAP, 'Siap ditambahkan'], [S.TOLAK, 'Ditolak — perbaiki di Excel lalu periksa ulang']],
    },
    selesai: {
      ubah: [[S.OK, 'Berhasil diperbarui'], [S.GAGAL, 'Gagal diperbarui'], [S.BATAL, 'Belum dikirim'],
        [S.TOLAK, 'Ditolak'], [S.TIDAK_DITEMUKAN, 'NIK tidak ada di poktan ini'], [S.SAMA, 'Tidak berubah']],
      tambah: [[S.OK, 'Berhasil ditambahkan'], [S.GAGAL, 'Gagal ditambahkan'], [S.BATAL, 'Belum dikirim'],
        [S.TOLAK, 'Ditolak'], [S.SUDAH_ADA, 'Sudah terdaftar']],
    },
  };
  const DILIPAT = new Set([S.SAMA, S.SUDAH_ADA]); // kelompok yang awalnya dilipat

  const MODE = {
    ubah: {
      judul: 'Ubah data anggota',
      bantuan: 'Ubah data anggota yang sudah ada (luas lahan, komoditas, no HP, dll). Baris yang tidak diubah boleh dihapus. ' +
        'Nama, NIK, Tempat/Tgl Lahir, dan Jenis Kelamin tidak bisa diubah.',
    },
    tambah: {
      judul: 'Tambah anggota baru',
      bantuan: 'Tulis anggota baru di baris kosong paling bawah, semua kolom diisi. Nama, NIK, Tempat/Tgl Lahir ' +
        '(contoh: KASUI, 15-8-1974), dan Jenis Kelamin harus sesuai KTP karena dicek ke Dukcapil.',
    },
  };

  // ─── State ─────────────────────────────────────────────────────────────────
  const st = {
    buka: false,
    mode: 'ubah',
    file: null, // File
    tahap: 'awal', // awal | memeriksa | pratinjau | mengirim | selesai
    halaman: null,
    hasil: [],
    info: {},
    progres: null, // { i, n, teks }
    berhenti: false,
    galat: '',
    waktu: null,
  };
  const sibuk = () => st.tahap === 'memeriksa' || st.tahap === 'mengirim';

  // ─── Pembuat elemen (semua teks lewat textContent → isi Excel tidak bisa menyisipkan HTML) ─────
  function h(tag, props, ...anak) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of anak.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  // ─── Kerangka (Shadow DOM) ─────────────────────────────────────────────────
  const host = h('div', { id: 'asisten-simluh-excel' });
  const akar = host.attachShadow({ mode: 'open' });
  akar.append(h('link', { rel: 'stylesheet', href: chrome.runtime.getURL('modules/simluh/content/panel.css') }));
  const fab = h('button', { class: 'fab', type: 'button', onclick: () => setBuka(true), title: 'Asisten Excel SIMLUH' },
    h('span', { class: 'fab-ikon', 'aria-hidden': 'true' }, '⇪'), 'Update dari Excel');
  const latar = h('div', { class: 'latar', onclick: () => !sibuk() && setBuka(false) });
  const laci = h('aside', { class: 'laci', role: 'dialog', 'aria-label': 'Asisten Excel SIMLUH' });
  akar.append(fab, latar, laci);
  document.body.append(host);

  // Saklar modul dari popup; jangan sembunyikan panel di tengah proses kirim
  window.Asisten.pantau('simluh', (nyala) => {
    if (!nyala && sibuk()) return;
    if (!nyala && st.buka) setBuka(false);
    host.style.display = nyala ? '' : 'none'; // bukan host.hidden: kalah oleh `:host { all: initial }`
  });

  function setBuka(b) {
    st.buka = b;
    host.classList.toggle('buka', b);
    laci.classList.toggle('buka', b);
    latar.classList.toggle('buka', b);
    fab.hidden = b;
    if (b) render();
  }

  window.addEventListener('beforeunload', (e) => {
    if (sibuk()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ─── Render ────────────────────────────────────────────────────────────────
  function render() {
    const id = (document.getElementById('id_poktan') || {}).value || '';
    const nama = st.halaman ? st.halaman.namaPoktan : (document.querySelector('h3') || {}).textContent || '';
    const namaPoktan = nama.replace(/\s+/g, ' ').replace(/^\s*Daftar Anggota Kelompok Tani\s*/i, '').trim();

    laci.replaceChildren(
      h('header', { class: 'kepala' },
        h('div', {},
          h('div', { class: 'judul' }, 'Asisten Excel SIMLUH'),
          h('div', { class: 'sub' }, `${namaPoktan || 'Poktan'} · ID ${id}`)),
        h('button', { class: 'tutup', type: 'button', 'aria-label': 'Tutup', disabled: sibuk(), onclick: () => setBuka(false) }, '✕')),
      h('div', { class: 'isi' },
        st.galat && h('div', { class: 'galat', role: 'alert' }, st.galat),
        st.tahap === 'awal' || st.tahap === 'memeriksa' ? viewAwal() : null,
        st.tahap === 'memeriksa' ? viewProgres('Memeriksa file') : null,
        st.tahap === 'pratinjau' ? viewDaftar('pratinjau') : null,
        st.tahap === 'mengirim' ? viewProgres(st.mode === 'tambah' ? 'Menambahkan anggota' : 'Mengirim perubahan') : null,
        st.tahap === 'selesai' ? viewDaftar('selesai') : null),
      viewAksi());
  }

  function viewAwal() {
    const kunci = sibuk();
    const cetak = document.querySelector('a[href*="cetakanggotapoktan"]');
    const pilihFile = h('input', { type: 'file', accept: '.xls,.xlsx', hidden: true, onchange: (e) => setFile(e.target.files[0]) });
    const zona = h('div', {
      class: 'zona' + (st.file ? ' ada' : '') + (kunci ? ' kunci' : ''), tabindex: kunci ? null : '0', role: 'button',
      onclick: () => !kunci && pilihFile.click(),
      onkeydown: (e) => !kunci && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pilihFile.click()),
      ondragover: (e) => { e.preventDefault(); if (!kunci) zona.classList.add('seret'); },
      ondragleave: () => zona.classList.remove('seret'),
      ondrop: (e) => { e.preventDefault(); zona.classList.remove('seret'); if (!kunci) setFile(e.dataTransfer.files[0]); },
    },
    st.file
      ? [h('div', { class: 'zona-ikon' }, '📄'), h('div', { class: 'zona-nama' }, st.file.name),
        h('div', { class: 'zona-ket' }, `${(st.file.size / 1024).toFixed(0)} KB · klik untuk ganti file`)]
      : [h('div', { class: 'zona-ikon' }, '📂'), h('div', { class: 'zona-nama' }, 'Pilih atau seret file Cetak Excel ke sini'),
        h('div', { class: 'zona-ket' }, 'Format .xls / .xlsx dari tombol "Cetak Excel" SIMLUH')]);

    return h('section', { class: 'langkah' },
      h('div', { class: 'label-langkah' }, '1. Pilih yang ingin dilakukan'),
      h('div', { class: 'mode', role: 'radiogroup' },
        Object.entries(MODE).map(([k, m]) => h('button', {
          type: 'button', role: 'radio', 'aria-checked': String(st.mode === k), class: st.mode === k ? 'aktif' : '',
          disabled: kunci, onclick: () => { st.mode = k; st.galat = ''; render(); },
        }, k === 'ubah' ? '✏️ ' : '➕ ', m.judul))),
      h('p', { class: 'bantuan' }, MODE[st.mode].bantuan),
      h('div', { class: 'label-langkah' }, '2. Pilih file Cetak Excel'),
      zona, pilihFile,
      cetak && h('p', { class: 'bantuan kecil' }, 'Belum punya file? ',
        h('a', { href: cetak.href }, 'Unduh Cetak Excel poktan ini'), ', ubah isinya di Excel, simpan, lalu pilih di sini.'),
      viewAman());
  }

  /** Penjelasan keamanan agar pengguna tidak ragu memakai. */
  function viewAman() {
    return h('section', { class: 'aman' },
      h('div', { class: 'aman-judul' }, '🛡️ Aman dipakai'),
      h('ul', {},
        h('li', {}, h('b', {}, 'Tidak pernah menghapus anggota. '), 'Baris yang Anda hapus dari Excel hanya dilewati, anggotanya tetap ada di SIMLUH.'),
        h('li', {}, h('b', {}, 'Tidak ada yang dikirim sebelum Anda klik Kirim. '), 'Semua perubahan ditampilkan dulu untuk diperiksa.'),
        h('li', {}, 'Hanya kolom yang berbeda yang diubah. Nama, NIK, Tempat/Tgl Lahir, dan Jenis Kelamin tidak pernah diubah.'),
        h('li', {}, 'Sel yang ', h('b', {}, 'sengaja dikosongkan'), ' di Excel ikut dikosongkan di SIMLUH, dan ditandai "(dikosongkan)" saat diperiksa.'),
        h('li', {}, 'Data hanya dikirim ke SIMLUH memakai akun Anda sendiri, tidak ke pihak lain.')),
      h('div', { class: 'aman-ket' }, 'Alat bantu tidak resmi, bukan aplikasi Kementerian Pertanian.'));
  }

  function viewProgres(judul) {
    const p = st.progres || { i: 0, n: 0, teks: '' };
    const persen = p.n ? Math.round((p.i / p.n) * 100) : 0;
    return h('section', { class: 'progres', 'aria-live': 'polite' },
      h('div', { class: 'progres-judul' }, `${judul}… ${p.n ? `${Math.min(p.i + 1, p.n)} dari ${p.n}` : ''}`),
      h('div', { class: 'bar' }, h('div', { class: 'bar-isi', style: `width:${persen}%` })),
      h('div', { class: 'progres-ket' }, p.teks || 'Menyiapkan…'),
      h('div', { class: 'progres-ket kecil' }, 'Jangan tutup atau pindah halaman sampai selesai.'));
  }

  function chip(status, n) {
    return h('span', { class: `chip ${NADA[status] || 'abu'}` }, `${status === S.OK ? labelOk(st.mode) : LABEL[status]}: ${n}`);
  }

  function kartu(x, tahap) {
    // Tambah: cukup ringkasan untuk yang siap/berhasil; Ubah: rincian lama → baru
    const rinci = st.mode === 'tambah'
      ? x.ringkas && (x.status === S.SIAP || x.status === S.OK) && h('div', { class: 'ringkas' }, x.ringkas)
      : x.tampil.length && x.status !== S.SAMA
        ? h('ul', { class: 'rinci' }, x.tampil.map((p) => h('li', {},
          h('span', { class: 'kolom' }, p.kolom), ': ',
          h('span', { class: 'lama' }, p.lama || '(kosong)'), ' → ',
          p.baru ? h('b', {}, p.baru) : h('b', { class: 'dikosongkan' }, '(dikosongkan)'))))
        : null;
    return h('li', { class: 'kartu' },
      h('div', { class: 'kartu-kepala' },
        h('span', { class: 'nama' }, x.nama || '-'),
        h('span', { class: 'baris' }, `baris ${x.baris}`)),
      tahap === 'pratinjau' || x.status !== S.SAMA ? rinci : null,
      x.alasan && h('div', { class: 'alasan' }, x.alasan),
      x.peringatan.length > 0 && x.status !== S.TOLAK && h('div', { class: 'peringatan' }, '⚠ ' + x.peringatan.join('; ')));
  }

  function viewDaftar(tahap) {
    const n = P.hitung(st.hasil);
    const ringkas = h('div', { class: 'ringkasan' },
      Object.keys(n).filter((s) => n[s]).map((s) => chip(s, n[s])),
      st.info.sudahAda ? chip(S.SUDAH_ADA, st.info.sudahAda) : null);
    const catatan = [];
    if (st.mode === 'ubah' && st.info.tidakDiFile) catatan.push(`${st.info.tidakDiFile} anggota di SIMLUH tidak ada di file (tidak diubah).`);
    if (st.mode === 'tambah' && st.info.sudahAda) catatan.push(`${st.info.sudahAda} anggota di file sudah terdaftar, dilewati (untuk mengubahnya pakai mode Ubah).`);
    if (!st.hasil.length) catatan.push(st.mode === 'tambah'
      ? 'Tidak ada anggota baru di file (semua NIK sudah terdaftar di poktan ini).'
      : 'Tidak ada baris anggota di file.');
    else if (tahap === 'pratinjau' && st.mode === 'ubah' && !n.UBAH && !n.TOLAK && !n.TIDAK_DITEMUKAN)
      catatan.push('Tidak ada perubahan, isi file sama dengan data SIMLUH.');

    const kelompok = KELOMPOK[tahap][st.mode].map(([status, judul]) => {
      const isi = st.hasil.filter((x) => x.status === status);
      if (!isi.length) return null;
      return h('details', { class: `kelompok ${NADA[status]}`, open: !DILIPAT.has(status) },
        h('summary', {}, h('span', {}, judul), h('span', { class: 'jumlah' }, isi.length)),
        h('ul', { class: 'daftar' }, isi.map((x) => kartu(x, tahap))));
    });
    return h('section', { class: 'hasil' },
      tahap === 'selesai' && h('div', { class: 'selesai' }, st.berhenti ? '⏸ Proses dihentikan' : '✅ Selesai',
        st.waktu ? ` · ${st.waktu}` : ''),
      ringkas,
      catatan.map((c) => h('p', { class: 'catatan' }, c)),
      kelompok);
  }

  function viewAksi() {
    const tombol = [];
    if (st.tahap === 'awal') {
      tombol.push(h('button', { class: 'utama', type: 'button', disabled: !st.file, onclick: periksa }, 'Periksa file'));
    } else if (st.tahap === 'pratinjau') {
      const n = st.hasil.filter((x) => x.status === (st.mode === 'tambah' ? S.SIAP : S.UBAH)).length;
      tombol.push(
        h('button', { class: 'utama', type: 'button', disabled: !n, onclick: kirim },
          st.mode === 'tambah' ? `Tambahkan ${n} anggota ke SIMLUH` : `Kirim ${n} perubahan ke SIMLUH`),
        h('button', { class: 'kedua', type: 'button', onclick: ulang }, 'Ganti file'));
    } else if (sibuk()) {
      tombol.push(h('button', { class: 'kedua', type: 'button', disabled: st.berhenti, onclick: () => { st.berhenti = true; render(); } },
        st.berhenti ? 'Menghentikan…' : 'Hentikan'));
    } else if (st.tahap === 'selesai') {
      tombol.push(
        h('button', { class: 'utama', type: 'button', onclick: unduhLaporan }, 'Unduh laporan (Excel)'),
        h('button', { class: 'kedua', type: 'button', onclick: () => location.reload() }, 'Muat ulang halaman'),
        h('button', { class: 'kedua', type: 'button', onclick: ulang }, 'Proses file lain'));
    }
    return h('footer', { class: 'aksi' }, tombol,
      st.tahap === 'pratinjau' && h('p', { class: 'aksi-ket' }, 'Belum ada yang dikirim. Periksa daftar di atas dulu.'));
  }

  // ─── Aksi ──────────────────────────────────────────────────────────────────
  function setFile(f) {
    if (!f) return;
    st.galat = '';
    if (!/\.xlsx?$/i.test(f.name)) st.galat = 'File harus berformat Excel (.xls / .xlsx) hasil "Cetak Excel" SIMLUH.';
    else if (f.size > A.MAKS_UKURAN_FILE)
      st.galat = `File terlalu besar (${(f.size / 1024 / 1024).toFixed(1)} MB, maks 5 MB). Pakai file Cetak Excel per poktan.`;
    st.file = st.galat ? null : f;
    render();
  }

  function ulang() {
    Object.assign(st, { tahap: 'awal', file: null, hasil: [], info: {}, progres: null, berhenti: false, galat: '', waktu: null });
    render();
  }

  const progres = (teks) => (i, n, x) => {
    st.progres = { i, n, teks: `${teks} ${x.nama || ''} (baris ${x._baris || x.baris})` };
    render();
  };

  /** Pesan galat untuk pengguna awam (detail teknis ke console). */
  function pesanGalat(e) {
    console.error('[Asisten SIMLUH]', e);
    if (e instanceof A.GalatIsi || e instanceof API.SesiHabis || e instanceof API.ServerSibuk) return e.message;
    return `Terjadi kesalahan: ${e.message}. Coba muat ulang halaman lalu ulangi.`;
  }

  async function periksa() {
    if (!st.file) return;
    Object.assign(st, { tahap: 'memeriksa', galat: '', progres: null, berhenti: false });
    render();
    try {
      const file = A.bacaExcel(A.bacaSheet(await st.file.arrayBuffer(), window.XLSX));
      st.halaman = await API.ambilHalaman();
      if (st.mode === 'tambah') {
        const r = P.periksaTambah(file, st.halaman);
        Object.assign(st, { hasil: r.hasil, info: { sudahAda: r.sudahAda } });
      } else {
        const r = await P.periksaUbah(file, st.halaman, API, {
          onProgres: progres('Membaca data'), dihentikan: () => st.berhenti,
        });
        Object.assign(st, { hasil: r.hasil, info: { tidakDiFile: r.tidakDiFile } });
      }
      st.tahap = st.berhenti ? 'awal' : 'pratinjau';
      if (st.berhenti) st.galat = 'Pemeriksaan dihentikan.';
    } catch (e) {
      Object.assign(st, { tahap: 'awal', galat: pesanGalat(e) });
    }
    st.progres = null;
    render();
  }

  async function kirim() {
    const tambah = st.mode === 'tambah';
    const n = st.hasil.filter((x) => x.status === (tambah ? S.SIAP : S.UBAH)).length;
    const tanya = tambah
      ? `Tambahkan ${n} anggota baru ke SIMLUH?\n\nSetiap anggota dicek dulu ke Dukcapil, lalu langsung disimpan. ` +
        'Anggota yang sudah ada tidak diubah.'
      : `Kirim ${n} perubahan ke SIMLUH?\n\nHanya kolom yang tampil di daftar yang diubah. Tidak ada anggota yang dihapus.`;
    if (!window.confirm(tanya)) return;
    Object.assign(st, { tahap: 'mengirim', galat: '', progres: null, berhenti: false });
    render();
    const mulai = Date.now();
    try {
      const opsi = { onProgres: progres(tambah ? 'Menambahkan' : 'Mengirim'), dihentikan: () => st.berhenti };
      if (tambah) await P.kirimTambah(st.hasil, st.halaman, API, opsi);
      else await P.kirimUbah(st.hasil, st.halaman, API, opsi);
    } catch (e) {
      st.galat = pesanGalat(e);
    }
    const detik = Math.round((Date.now() - mulai) / 1000);
    Object.assign(st, { tahap: 'selesai', progres: null, waktu: detik >= 60 ? `${Math.floor(detik / 60)} menit ${detik % 60} detik` : `${detik} detik` });
    render();
  }

  function unduhLaporan() {
    const XLSX = window.XLSX;
    const nama = (st.halaman && st.halaman.namaPoktan) || 'Poktan';
    const sekarang = new Date();
    const dua = (x) => String(x).padStart(2, '0');
    const tgl = `${sekarang.getFullYear()}-${dua(sekarang.getMonth() + 1)}-${dua(sekarang.getDate())} ${dua(sekarang.getHours())}.${dua(sekarang.getMinutes())}`;
    const label = (s) => (s === S.OK ? labelOk(st.mode) : LABEL[s] || s);
    const aoa = [
      [`Laporan ${MODE[st.mode].judul} — ${nama} (ID ${st.halaman ? st.halaman.idPoktan : ''})`],
      [`Waktu: ${tgl}`, '', `File: ${st.file ? st.file.name : ''}`],
      [],
      ['No', 'Baris Excel', 'Nama', 'NIK', 'Hasil', 'Rincian', 'Keterangan'],
      ...st.hasil.map((x, i) => [
        i + 1, x.baris, x.nama, x.nik, label(x.status),
        x.tampil.map((p) => `${p.kolom}: ${p.lama || '(kosong)'} → ${p.baru || '(kosong)'}`).join('; '),
        [x.alasan, ...x.peringatan].filter(Boolean).join('; '),
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 5 }, { wch: 11 }, { wch: 28 }, { wch: 19 }, { wch: 20 }, { wch: 60 }, { wch: 50 }];
    for (let r = 4; r < aoa.length; r++) { // NIK sebagai teks, jangan jadi notasi E
      const c = ws[XLSX.utils.encode_cell({ r, c: 3 })];
      if (c) c.t = 's';
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan');
    XLSX.writeFile(wb, `Laporan SIMLUH - ${nama.replace(/[\\/:*?"<>|]/g, '')} - ${tgl}.xlsx`);
  }
})();
