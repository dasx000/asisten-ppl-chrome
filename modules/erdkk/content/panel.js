// ================= PANEL ASISTEN e-RDKK: CEK DUPLIKASI & REKAP LUAS ================= \\
// Aturan sama dengan Monitoring Duplikasi bawaan (baris identik semua kolom = ter-upload 2x), tapi memeriksa
// SEMUA status pengajuan, bukan hanya "Belum dikirim ke Korluh".
// Aksi (endpoint sama dengan tombol bawaan menu Pengajuan), selalu dengan konfirmasi & cek ulang data terbaru:
// - Hapus salinan berstatus "Belum dikirim ke Korluh", minimal satu baris per kelompok disisakan
// - Batal pengiriman salinan berstatus "Menunggu persetujuan Korluh" (ditarik kembali, lalu bisa dihapus)
// Data berisi NIK, jadi TIDAK disimpan di browser: selalu diambil ulang saat panel dibuka.

(function () {
  'use strict';
  if (window.__asistenErdkk) return;
  window.__asistenErdkk = true;

  // Hanya setelah login (menu samping e-RDKK punya tautan Pengajuan)
  if (!document.querySelector('a[href$="/pengajuan"]')) return;

  const API = window.ErdkkApi, D = window.ErdkkDuplikasi, L = window.ErdkkLaporan, R = window.ErdkkRekap, M = window.ErdkkCekMt, U = window.ErdkkUpload;

  const st = {
    buka: false,
    tahap: 'awal', // awal | memuat | siap
    baris: [], // hasil normalisasi
    waktu: null,
    progres: null,
    galat: '',
    f: { cari: '', wilayah: '', jenis: 'semua' },
    terbuka: null, // kunci kelompok yang rinciannya dibuka (hanya satu)
    menghapus: null, // { teks, i, n } saat proses hapus berjalan
    henti: false, // diminta berhenti di tengah hapus massal
    info: null, // { jenis: 'ok'|'galat', teks } hasil aksi terakhir
    tab: 'up', // up | mt | rekap | dup
    penuh: false, // panel dibesarkan selebar layar
    namaDesa: new Map(), // kode desa → nama
    fr: { desa: '', poktan: '', status: '', komoditas: '' }, // filter rekap ('' status = aktif)
    fm: { desa: '', poktan: '', status: '', komoditas: '' }, // filter Cek PT
    terbukaMt: null, // poktan yang rinciannya dibuka di Cek PT
    ptManual: {}, // { KOMODITAS: pt } angka PT yang diubah manual (chrome.storage.sync), selebihnya dari analisis
    poktanMaster: [], // master Kelompok Tani (/api/poktan)
    fu: { desa: '', upload: '', jenis: 'poktan', cari: '' }, // filter Status Upload
  };
  const sibuk = () => st.tahap === 'memuat' || !!st.menghapus;
  const KUNCI_PT = 'erdkk.ptManual';
  chrome.storage.sync.get(KUNCI_PT).then((v) => { st.ptManual = (v && v[KUNCI_PT]) || {}; if (st.buka) render(); }).catch(() => {});

  function h(tag, props, ...anak) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of anak.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  // ─── Kerangka ──────────────────────────────────────────────────────────────
  const host = h('div', { id: 'asisten-erdkk-duplikasi' });
  const akar = host.attachShadow({ mode: 'open' });
  akar.append(h('link', { rel: 'stylesheet', href: chrome.runtime.getURL('modules/erdkk/content/panel.css') }));
  const fab = h('button', { class: 'fab', type: 'button', onclick: () => setBuka(true), title: 'Asisten PPL — e-RDKK' },
    'Asisten e-RDKK');
  const latar = h('div', { class: 'latar', onclick: () => setBuka(false) });
  const laci = h('aside', { class: 'laci', role: 'dialog', 'aria-label': 'Asisten e-RDKK' });
  akar.append(fab, latar, laci);
  document.body.append(host);

  window.Asisten.pantau('erdkk', (nyala) => {
    if (!nyala && st.buka) setBuka(false);
    host.style.display = nyala ? '' : 'none';
  });

  function setBuka(b) {
    st.buka = b;
    host.classList.toggle('buka', b);
    laci.classList.toggle('buka', b);
    latar.classList.toggle('buka', b);
    fab.hidden = b;
    if (!b) return;
    if (!st.baris.length && !sibuk()) muat();
    else render();
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.buka) setBuka(false); });
  window.addEventListener('beforeunload', (e) => {
    if (st.menghapus) { e.preventDefault(); e.returnValue = ''; }
  });

  async function muat(simpanInfo = false) {
    Object.assign(st, { tahap: 'memuat', galat: '', progres: null });
    if (!simpanInfo) st.info = null;
    render();
    try {
      const mentah = await API.semuaPengajuan({ onProgres: (n, total) => { st.progres = { n, total }; render(); } });
      st.baris = mentah.map(D.normalisasi);
      st.kurang = mentah.kurang || 0;
      st.waktu = new Date().toISOString();
      try { st.poktanMaster = await API.semuaPoktan(); } catch (e) { if (e instanceof API.SesiHabis) throw e; st.poktanMaster = []; }
      const desaBelum = [...new Set(st.baris.map((b) => b.desa))].filter((k) => k && !st.namaDesa.has(k));
      if (desaBelum.length) {
        const kec = [...new Set(st.baris.filter((b) => desaBelum.includes(b.desa)).map((b) => b.kecamatan))];
        for (const [k, v] of await API.namaDesa(kec, { desa: desaBelum })) st.namaDesa.set(k, v);
      }
      if (!st.baris.length) st.galat = 'Tidak ada data pengajuan yang terbaca dari akun ini.';
    } catch (e) {
      console.error('[Asisten e-RDKK]', e);
      st.galat = e instanceof API.SesiHabis || e instanceof API.ServerSibuk
        ? e.message : `Terjadi kesalahan: ${e.message}. Coba muat ulang halaman lalu ulangi.`;
    }
    st.tahap = st.baris.length || st.poktanMaster.length ? 'siap' : 'awal';
    st.progres = null;
    render();
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  function hasil() {
    return D.cari(st.baris);
  }

  function render() {
    if (!st.buka) return;
    const fokus = akar.activeElement && akar.activeElement.name;
    const tahun = st.baris[0] && st.baris[0].tahun;
    laci.classList.toggle('lebar', st.tab !== 'dup');
    laci.classList.toggle('penuh', st.penuh);
    laci.replaceChildren(
      h('header', { class: 'kepala' },
        h('div', {},
          h('div', { class: 'judul' }, 'Asisten e-RDKK'),
          h('div', { class: 'sub' }, ({
            rekap: 'Rekap luas lahan & luas tanam per kampung, poktan, komoditas',
            mt: 'Cek PT: padi & jagung 2 PT, kopi maks 1 PT',
            up: 'Status upload RDKK per kelompok tani',
            dup: 'Cek duplikasi: baris identik di semua status',
          })[st.tab] + (tahun ? ` · Tahun ${tahun}` : ''))),
        h('div', { class: 'tombol-kepala' },
          h('button', { class: 'tutup', type: 'button', title: st.penuh ? 'Kecilkan panel' : 'Perbesar panel selebar layar',
            'aria-label': st.penuh ? 'Kecilkan panel' : 'Perbesar panel', onclick: () => { st.penuh = !st.penuh; render(); } },
          st.penuh ? 'Perkecil' : 'Perbesar'),
          h('button', { class: 'tutup', type: 'button', 'aria-label': 'Tutup', onclick: () => setBuka(false) }, '✕'))),
      h('nav', { class: 'tab-utama', role: 'tablist' },
        [['up', 'Status Upload'], ['mt', 'Cek PT'], ['rekap', 'Rekap Luas'], ['dup', 'Cek Duplikasi']].map(([k, l]) => h('button', {
          type: 'button', role: 'tab', 'aria-selected': String(st.tab === k), class: st.tab === k ? 'aktif' : '',
          disabled: !!st.menghapus, onclick: () => { st.tab = k; render(); },
        }, l))),
      h('div', { class: 'isi' },
        st.galat && h('div', { class: 'galat', role: 'alert' }, st.galat),
        st.info && h('div', { class: `info ${st.info.jenis}`, role: 'status' }, st.info.teks),
        st.menghapus && h('div', { class: 'progres' }, h('div', { class: 'progres-judul' }, st.menghapus.teks),
          st.menghapus.n > 1 && h('div', { class: 'bar' }, h('div', { class: 'bar-isi', style: `width:${Math.round((st.menghapus.i / st.menghapus.n) * 100)}%` }))),
        sibuk() && viewProgres(),
        (st.baris.length || st.poktanMaster.length) && ({ rekap: viewRekap, mt: viewMt, up: viewUpload }[st.tab] || viewHasil)()),
      viewAksi());
    if (fokus) {
      const el = akar.querySelector(`[name="${fokus}"]`);
      if (el) { el.focus(); if (el.setSelectionRange && el.value) el.setSelectionRange(el.value.length, el.value.length); }
    }
  }

  function viewProgres() {
    const p = st.progres;
    const persen = p && p.total ? Math.round((p.n / p.total) * 100) : 5;
    return h('section', { class: 'progres', 'aria-live': 'polite' },
      h('div', { class: 'progres-judul' }, 'Membaca data pengajuan…'),
      h('div', { class: 'bar' }, h('div', { class: 'bar-isi', style: `width:${persen}%` })),
      h('div', { class: 'progres-ket' }, p ? `${p.n} dari ${p.total} baris` : 'Menyiapkan…'),
      h('div', { class: 'progres-ket kecil' }, 'Hanya membaca data, tidak ada yang diubah atau dihapus.'));
  }

  function viewHasil() {
    const r = hasil();
    const tampil = D.saring(r.kelompok, st.f);
    const n = D.hitung(r.kelompok);
    const wilayah = D.daftarWilayah(st.baris);
    const ubahF = (k, v) => { st.f[k] = v; st.terbuka = null; render(); };
    const waktu = st.waktu ? new Date(st.waktu) : null;

    return [
      h('section', { class: 'ringkas-atas' },
        h('div', { class: 'angka-besar ' + (n.kelompok ? 'merah' : 'hijau') },
          h('b', {}, n.kelompok), h('span', {}, 'data dobel')),
        h('div', { class: 'angka-besar ' + (n.luput ? 'kuning' : 'abu') },
          h('b', {}, n.luput), h('span', {}, 'tidak terdeteksi e-RDKK')),
        h('div', { class: 'angka-besar abu' },
          h('b', {}, n.lintas), h('span', {}, 'lintas status'))),
      h('p', { class: 'diperbarui' },
        `${r.dicek} pengajuan dicek, ${r.dikecualikan} dikecualikan (ditolak/batal/Not Valid). ` +
        (waktu ? `Dibaca pukul ${waktu.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}.` : '') +
        (st.kurang ? ` Perhatian: ${st.kurang} pengajuan belum terbaca dari server, klik Periksa ulang.` : '')),
      h('section', { class: 'filter' },
        h('div', { class: 'filter-baris' },
          h('select', { name: 'wilayah', onchange: (e) => ubahF('wilayah', e.target.value) },
            h('option', { value: '' }, 'Semua kelompok tani'),
            wilayah.map((w) => h('option', { value: w.id, selected: st.f.wilayah === w.id }, w.nama))),
          h('input', { type: 'search', name: 'cari', placeholder: 'Cari nama / NIK…', value: st.f.cari,
            oninput: (e) => ubahF('cari', e.target.value) })),
        h('div', { class: 'tab' },
          [['semua', `Semua (${n.kelompok})`], ['luput', `Tidak terdeteksi e-RDKK (${n.luput})`], ['lintas', `Lintas status (${n.lintas})`]]
            .map(([k, l]) => h('button', { type: 'button', class: st.f.jenis === k ? 'aktif' : '', onclick: () => ubahF('jenis', k) }, l)))),
      !r.kelompok.length
        ? h('div', { class: 'aman' }, 'Tidak ada data dobel (baris identik) di semua status.')
        : tampil.length ? h('ul', { class: 'daftar' }, tampil.map(kartu)) : h('p', { class: 'kosong' }, 'Tidak ada yang cocok dengan filter.'),
    ];
  }

  function kartu(k) {
    const buka = st.terbuka === k.kunci;
    const tag = [
      k.terdeteksiBawaan ? h('span', { class: 'chip abu' }, 'Terdeteksi e-RDKK') : h('span', { class: 'chip kuning' }, 'Tidak terdeteksi e-RDKK'),
      k.lintasStatus && h('span', { class: 'chip biru' }, 'Lintas status'),
    ];
    const statusRingkas = Object.entries(k.baris.reduce((m, b) => { m[b.status] = (m[b.status] || 0) + 1; return m; }, {}))
      .map(([s, c]) => `${c}× ${s}`).join(' · ');
    return h('li', { class: `kartu ${k.terdeteksiBawaan ? '' : 'luput'}` },
      h('button', { type: 'button', class: 'kartu-kepala', 'aria-expanded': String(buka),
        onclick: () => { st.terbuka = buka ? null : k.kunci; render(); } },
      h('div', { class: 'kiri' },
        h('div', { class: 'nama' }, k.nama, h('span', { class: 'jumlah' }, `${k.baris.length}×`)),
        h('div', { class: 'meta' }, `NIK ${k.nik} · ${k.subsektor} · ${k.poktan || 'Desa ' + k.desa}`),
        h('div', { class: 'meta' }, statusRingkas),
        h('div', { class: 'tag' }, tag)),
      h('span', { class: 'panah' + (buka ? ' buka' : ''), 'aria-hidden': 'true' })),
      buka && h('div', { class: 'rinci' },
        h('table', {},
          h('thead', {}, h('tr', {}, ['Status', 'Dibuat', 'PT1', 'PT2', 'PT3', 'ID', 'Aksi'].map((t) => h('th', {}, t)))),
          h('tbody', {}, k.baris.map((b) => h('tr', { class: b.statusId === D.STATUS_DRAF ? 'draf' : '' },
            h('td', {}, b.status),
            h('td', {}, L.waktu(b.dibuat)),
            ...b.mt.map((m) => h('td', {}, D.ringkasMt(m))),
            h('td', { class: 'id' }, String(b.id)),
            h('td', {}, D.bolehHapus(k, b)
              ? h('button', { type: 'button', class: 'hapus', disabled: sibuk(), onclick: () => hapusBaris(k, [b]) }, 'Hapus')
              : D.bolehBatal(k, b)
                ? h('button', { type: 'button', class: 'batal', disabled: sibuk(), onclick: () => batalBaris(k, b),
                  title: 'Tarik kembali dari Korluh (sama dengan tombol Batal di menu Pengajuan)' }, 'Batal')
                : h('span', { class: 'tetap', title: b.statusId === D.STATUS_DRAF ? 'Disisakan satu' : 'Sudah diproses di atas Korluh, tidak bisa dibatalkan penyuluh' }, '—')))))),
        D.salinanHapus(k).length > 0 && h('div', { class: 'aksi-kartu' },
          h('button', { type: 'button', class: 'hapus besar', disabled: sibuk(), onclick: () => hapusBaris(k, D.salinanHapus(k)) },
            `Hapus ${D.salinanHapus(k).length} salinan, sisakan 1`)),
        h('p', { class: 'saran' }, k.bisaDihapus
          ? (k.bisaDihapus === k.baris.length
            ? 'Semua baris masih "Belum dikirim ke Korluh". Tombol di atas menghapus salinannya dan menyisakan yang paling awal dibuat.'
            : `${k.bisaDihapus} baris biru ("Belum dikirim ke Korluh") adalah salinan data yang sudah dikirim, aman dihapus.`)
          : k.bisaDibatal
            ? 'Belum ada salinan yang bisa dihapus. Klik Batal di salah satu baris "Menunggu persetujuan Korluh" untuk menariknya kembali, lalu hapus.'
            : 'Semua baris sudah diproses di atas Korluh. Koordinasikan dengan Korluh/Kasie agar salinannya ditolak/dikembalikan.')));
  }

  function viewAksi() {
    if (st.tab === 'mt') return viewAksiMt();
    if (st.tab === 'up') {
      return h('footer', { class: 'aksi' },
        h('button', { class: 'utama', type: 'button', disabled: sibuk(), onclick: () => muat() }, sibuk() ? 'Membaca…' : 'Baca ulang data'),
        st.poktanMaster.length ? h('button', { class: 'kedua', type: 'button', onclick: unduhUpload }, 'Unduh Excel') : null,
        h('p', { class: 'aksi-ket' }, 'Hanya membaca data e-RDKK dengan akun Anda. Alat bantu tidak resmi, bukan aplikasi Kementerian Pertanian.'));
    }
    if (st.tab === 'rekap') {
      return h('footer', { class: 'aksi' },
        h('button', { class: 'utama', type: 'button', disabled: sibuk(), onclick: () => muat() }, sibuk() ? 'Membaca…' : 'Baca ulang data'),
        st.baris.length ? h('button', { class: 'kedua', type: 'button', onclick: unduhRekap }, 'Unduh Excel') : null,
        h('p', { class: 'aksi-ket' }, 'Hanya membaca data e-RDKK dengan akun Anda. Data tidak disimpan di browser. ' +
          'Alat bantu tidak resmi, bukan aplikasi Kementerian Pertanian.'));
    }
    const ada = st.baris.length && hasil().kelompok.length;
    const semua = ada ? D.semuaSalinanHapus(D.saring(hasil().kelompok, st.f)) : [];
    const nPetani = new Set(semua.map((x) => x.k)).size;
    return h('footer', { class: 'aksi' },
      st.menghapus && st.menghapus.n > 1 && h('button', { class: 'kedua penuh', type: 'button', disabled: st.henti,
        onclick: () => { st.henti = true; render(); } }, st.henti ? 'Menghentikan…' : 'Hentikan'),
      !sibuk() && semua.length > 0 && h('button', { class: 'hapus-semua', type: 'button', onclick: () => hapusSemua(semua) },
        `Hapus semua salinan (${semua.length} baris, ${nPetani} petani)`),
      h('button', { class: 'utama', type: 'button', disabled: sibuk(), onclick: () => muat() }, sibuk() ? 'Memeriksa…' : st.baris.length ? 'Periksa ulang' : 'Periksa duplikasi'),
      ada ? h('button', { class: 'kedua', type: 'button', onclick: unduh }, 'Unduh Excel') : null,
      h('p', { class: 'aksi-ket' }, 'Data dibaca dengan akun Anda. Hapus/Batal hanya terjadi saat Anda mengklik dan menyetujui konfirmasi. ' +
        'Data tidak disimpan di browser. ' +
        'Alat bantu tidak resmi, bukan aplikasi Kementerian Pertanian.'));
  }

  // ─── Aksi hapus ────────────────────────────────────────────────────────────
  /** Hapus salinan milik satu kelompok (tombol per baris & per kartu). */
  async function hapusBaris(k, daftar) {
    if (sibuk() || !daftar.length) return;
    const tersisa = k.baris.length - daftar.length;
    const rinci = daftar.map((b) => `• ID ${b.id} — ${b.status}, dibuat ${L.waktu(b.dibuat)}`).join('\n');
    const tanya = `Hapus ${daftar.length} salinan pengajuan ini dari e-RDKK?\n\n${k.nama} — NIK ${k.nik}\n${rinci}\n\n` +
      `Tersisa ${tersisa} baris setelah dihapus. Penghapusan tidak bisa dibatalkan.`;
    if (!window.confirm(tanya)) return;
    await jalankanHapus(daftar.map((b) => ({ k, b })), k.nama);
  }

  /** Hapus semua salinan dari kelompok yang sedang tampil (sesuai filter). */
  async function hapusSemua(item) {
    if (sibuk() || !item.length) return;
    const petani = [...new Set(item.map((x) => x.k))];
    const nama = petani.slice(0, 15).map((k) => `• ${k.nama} (${item.filter((x) => x.k === k).length} salinan)`).join('\n') +
      (petani.length > 15 ? `\n… dan ${petani.length - 15} petani lain` : '');
    const filter = st.f.wilayah || st.f.cari || st.f.jenis !== 'semua' ? '\n(Sesuai filter yang sedang aktif.)' : '';
    const tanya = `Hapus ${item.length} salinan milik ${petani.length} petani dari e-RDKK?${filter}\n\n${nama}\n\n` +
      'Hanya baris "Belum dikirim ke Korluh" yang dihapus, satu baris per petani selalu disisakan. ' +
      'Penghapusan tidak bisa dibatalkan.';
    if (!window.confirm(tanya)) return;
    await jalankanHapus(item, `${petani.length} petani`);
  }

  /** Proses hapus berurutan dengan cek ulang data terbaru, bisa dihentikan, lalu laporan & baca ulang. */
  async function jalankanHapus(item, label) {
    st.menghapus = { teks: 'Memeriksa data terbaru sebelum menghapus…' };
    st.henti = false;
    st.info = null;
    render();
    const ok = [], gagal = [];
    let dilewati = 0;
    try {
      let terbaru = (await API.semuaPengajuan()).map(D.normalisasi);
      for (const [i, { k, b }] of item.entries()) {
        if (st.henti) { dilewati = item.length - i; break; }
        st.menghapus = { teks: `Menghapus ${i + 1} dari ${item.length}: ${k.nama} (ID ${b.id})…`, i, n: item.length };
        render();
        const alasan = D.cekSebelumHapus(terbaru, b);
        if (alasan) { gagal.push(`${k.nama} ID ${b.id}: ${alasan}`); continue; }
        try {
          await API.hapus(b.id);
          ok.push(b.id);
          terbaru = terbaru.filter((x) => x.id !== b.id);
        } catch (e) {
          if (e instanceof API.SesiHabis) throw e;
          gagal.push(`${k.nama} ID ${b.id}: ${e.message}`);
        }
      }
    } catch (e) {
      console.error('[Asisten e-RDKK]', e);
      gagal.push(e.message);
    }
    st.menghapus = null;
    st.henti = false;
    const henti = dilewati ? ` Dihentikan, ${dilewati} salinan belum diproses.` : '';
    st.info = gagal.length
      ? { jenis: 'galat', teks: `${ok.length} salinan (${label}) terhapus.${henti} Tidak dihapus: ${gagal.join('; ')}` }
      : { jenis: dilewati ? 'galat' : 'ok', teks: `${ok.length} salinan (${label}) berhasil dihapus.${henti} Data sudah diperiksa ulang.` };
    await muat(true); // baca ulang supaya daftar sesuai kondisi terbaru
  }

  async function batalBaris(k, b) {
    if (sibuk()) return;
    const tanya = `Batalkan pengiriman pengajuan ini ke Korluh?\n\n${k.nama} — NIK ${k.nik}\n` +
      `• ID ${b.id} — ${b.status}, dibuat ${L.waktu(b.dibuat)}\n\n` +
      'Sama dengan tombol Batal di menu Pengajuan. Baris ditarik kembali dari Korluh; setelah itu salinannya bisa dihapus.';
    if (!window.confirm(tanya)) return;
    st.menghapus = { teks: 'Memeriksa data terbaru sebelum membatalkan…' };
    st.info = null;
    render();
    try {
      const terbaru = (await API.semuaPengajuan()).map(D.normalisasi);
      const alasan = D.cekSebelumBatal(terbaru, b);
      if (alasan) throw new Error(`ID ${b.id} tidak dibatalkan: ${alasan}`);
      st.menghapus = { teks: `Membatalkan ID ${b.id}…` };
      render();
      await API.batal(b.id);
      const sesudah = (await API.semuaPengajuan()).map(D.normalisasi).find((x) => x.id === b.id);
      st.info = { jenis: 'ok', teks: sesudah
        ? `Pengiriman ID ${b.id} (${k.nama}) dibatalkan. Status sekarang: "${sesudah.status}".` +
          (sesudah.statusId === D.STATUS_DRAF ? ' Salinan ini sekarang bisa dihapus.' : '')
        : `Pengiriman ID ${b.id} (${k.nama}) dibatalkan. Baris tidak lagi muncul di daftar pengajuan.` };
    } catch (e) {
      console.error('[Asisten e-RDKK]', e);
      st.info = { jenis: 'galat', teks: e.message };
    }
    st.menghapus = null;
    await muat(true);
  }

  // ─── Rekap luas ────────────────────────────────────────────────────────────
  const fmtLuas = (n) => Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtKg = (n) => Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 });

  function teksFilterRekap() {
    const p = R.pilihan(st.baris, st.namaDesa, st.fr.desa);
    const nama = (arr, id) => (arr.find((x) => String(x.id) === String(id)) || {}).nama || id;
    return [
      st.fr.desa ? `Desa ${nama(p.desa, st.fr.desa)}` : 'Semua desa',
      st.fr.poktan ? `Poktan ${nama(p.poktan, st.fr.poktan)}` : 'semua poktan',
      st.fr.komoditas ? `komoditas ${st.fr.komoditas}` : 'semua komoditas',
      st.fr.status === 'semua' ? 'semua status' : st.fr.status ? `status "${nama(p.status, st.fr.status)}"` : 'semua status kecuali ditolak/batal/Not Valid',
    ].join(' · ');
  }

  function viewRekap() {
    const p = R.pilihan(st.baris, st.namaDesa, st.fr.desa);
    if (st.fr.poktan && !p.poktan.some((x) => x.id === st.fr.poktan)) st.fr.poktan = '';
    const r = R.rekap(R.saringBaris(st.baris, st.fr), st.namaDesa, st.fr.komoditas);
    const ubah = (k, v) => { st.fr[k] = v; if (k === 'desa') st.fr.poktan = ''; render(); };
    const sel = (name, nilai, opsi, semua) => h('label', { class: 'pilih' }, h('span', {}, semua.label),
      h('select', { name, onchange: (e) => ubah(name, e.target.value) },
        semua.opsi.map(([v, l]) => h('option', { value: v, selected: nilai === v }, l)),
        opsi.map((o) => h('option', { value: String(o.id), selected: nilai === String(o.id) }, o.nama))));
    const sel3 = h('section', { class: 'filter-rekap' },
      sel('desa', st.fr.desa, p.desa, { label: 'Kelurahan/Desa', opsi: [['', 'Semua desa']] }),
      sel('poktan', st.fr.poktan, p.poktan, { label: 'Kelompok Tani', opsi: [['', 'Semua poktan']] }),
      sel('komoditas', st.fr.komoditas, p.komoditas, { label: 'Komoditas', opsi: [['', 'Semua komoditas']] }),
      sel('status', st.fr.status, p.status, { label: 'Status', opsi: [['', 'Semua (kecuali ditolak/batal/Not Valid)'], ['semua', 'Semua status']] }));

    const sel1 = (t) => [h('td', { class: 'n' }, fmtKg(t.petani)), h('td', { class: 'n tebal' }, fmtLuas(t.luas)),
      h('td', { class: 'n tanam' }, fmtLuas(t.luasTanam))];
    const body = [];
    for (const d of r.desa) {
      body.push(h('tr', { class: 'desa' }, h('td', { colspan: 2 }, d.nama), ...sel1(d.total)));
      for (const pk of d.poktan) {
        pk.komoditas.forEach((k, i) => body.push(h('tr', {},
          h('td', { class: 'poktan' }, i === 0 ? pk.nama : ''), h('td', {}, k.komoditas), ...sel1(k))));
        if (pk.komoditas.length > 1) body.push(h('tr', { class: 'sub' }, h('td', { class: 'poktan' }, `Subtotal ${pk.nama}`), h('td', {}, ''), ...sel1(pk.total)));
      }
    }
    return [
      sel3,
      h('section', { class: 'ringkas-atas' },
        h('div', { class: 'angka-besar hijau' }, h('b', {}, fmtLuas(r.total.luas)), h('span', {}, 'ha luas lahan')),
        h('div', { class: 'angka-besar abu' }, h('b', {}, fmtLuas(r.total.luasTanam)), h('span', {}, 'ha luas tanam (PT1+PT2+PT3)')),
        h('div', { class: 'angka-besar abu' }, h('b', {}, fmtKg(r.total.petani)), h('span', {}, 'petani (baris)')),
        h('div', { class: 'angka-besar abu' }, h('b', {}, r.perKomoditas.map((k) => k.komoditas).join(', ') || '-'), h('span', {}, 'komoditas'))),
      r.perKomoditas.length > 1 && h('p', { class: 'diperbarui' }, r.perKomoditas.map((k) => `${k.komoditas} ${fmtLuas(k.luas)} ha`).join(' · ')),
      h('div', { class: 'catatan-luas' }, h('b', {}, 'Luas Lahan'), ' = luas bidang lahan petani, dihitung sekali walau ditanam beberapa kali setahun. ',
        h('b', {}, 'Luas Tanam'), ' = luas PT1 + PT2 + PT3 (sama dengan kolom "Rencana Tanam" di lembar Cetak Data). ',
        'Contoh: lahan jagung 0,5 ha ditanam di PT1 dan PT2 → luas lahan 0,5 ha, luas tanam 1 ha. Luas Tanam ÷ Luas Lahan = berapa kali ditanam setahun.'),
      !r.desa.length ? h('p', { class: 'kosong' }, 'Tidak ada data untuk filter ini.')
        : h('div', { class: 'tabel-rekap' }, h('table', {},
          h('thead', {}, h('tr', {}, ['Kampung / Poktan', 'Komoditas', 'Petani', 'Luas Lahan (ha)', 'Luas Tanam (ha)']
            .map((t, i) => h('th', { class: i > 1 ? 'n' : '' }, t)))),
          h('tbody', {}, body),
          h('tfoot', {}, h('tr', {}, h('td', { colspan: 2 }, 'TOTAL'), ...sel1(r.total))))),
      h('p', { class: 'diperbarui' }, 'Data dihitung apa adanya, termasuk salinan dobel. Bersihkan dulu lewat tab Cek Duplikasi supaya angkanya tepat.'),
    ];
  }

  // ─── Cek PT per komoditas (jumlah PT dari mayoritas isian) ─────────────────
  const aturanMt = () => M.aturanDari(M.analisis(st.baris), st.ptManual);
  const itemMt = () => M.cari(st.baris, aturanMt(), st.fm);

  /** Simpan angka PT manual; sama dengan hasil analisis = kembali otomatis. */
  function setPt(a, pt) {
    const m = { ...st.ptManual };
    if (pt == null || Number(pt) === a.pt) delete m[a.komoditas]; else m[a.komoditas] = Number(pt);
    st.ptManual = m;
    st.terbukaMt = null;
    chrome.storage.sync.set({ [KUNCI_PT]: m }).catch(() => {});
    render();
  }

  function teksFilterMt() {
    const p = R.pilihan(st.baris, st.namaDesa, st.fm.desa);
    const nama = (arr, id) => (arr.find((x) => String(x.id) === String(id)) || {}).nama || id;
    return [
      st.fm.desa ? `Desa ${nama(p.desa, st.fm.desa)}` : 'Semua desa',
      st.fm.poktan ? `Poktan ${nama(p.poktan, st.fm.poktan)}` : 'semua poktan',
      st.fm.komoditas || 'semua komoditas',
      st.fm.status === 'semua' ? 'semua status' : st.fm.status ? `status "${nama(p.status, st.fm.status)}"` : 'status aktif',
    ].join(' · ');
  }

  function tombolAksi(item, ukuran) {
    const bt = item.filter((x) => x.aksi === 'batal'), hp = item.filter((x) => x.aksi === 'hapus');
    return [
      bt.length > 0 && h('button', { type: 'button', class: `batal ${ukuran}`, disabled: sibuk(), onclick: () => aksiMt(bt, 'batal') },
        ukuran ? `Batal (${bt.length})` : 'Batal'),
      hp.length > 0 && h('button', { type: 'button', class: `hapus ${ukuran}`, disabled: sibuk(), onclick: () => aksiMt(hp, 'hapus') },
        ukuran ? `Hapus (${hp.length})` : 'Hapus'),
    ];
  }

  function viewMt() {
    const p = R.pilihan(st.baris, st.namaDesa, st.fm.desa);
    if (st.fm.poktan && !p.poktan.some((x) => x.id === st.fm.poktan)) st.fm.poktan = '';
    const hasil = M.analisis(st.baris);
    const aturan = M.aturanDari(hasil, st.ptManual);
    if (st.fm.komoditas && !aturan[st.fm.komoditas]) st.fm.komoditas = '';
    const item = itemMt();
    const n = M.hitung(item);
    const salahPer = M.hitung(M.cari(st.baris, aturan, { ...st.fm, komoditas: '' })).per;
    const grup = M.kelompokkan(item, st.namaDesa);
    const ubah = (k, v) => { st.fm[k] = v; if (k === 'desa') st.fm.poktan = ''; st.terbukaMt = null; render(); };
    const sel = (name, nilai, opsi, label, awal) => h('label', { class: 'pilih' }, h('span', {}, label),
      h('select', { name: 'mt-' + name, onchange: (e) => ubah(name, e.target.value) },
        awal.map(([v, l]) => h('option', { value: v, selected: nilai === v }, l)),
        opsi.map((o) => h('option', { value: String(o.id), selected: nilai === String(o.id) }, o.nama))));
    return [
      h('section', { class: 'filter-rekap tiga' },
        sel('desa', st.fm.desa, p.desa, 'Kelurahan/Desa', [['', 'Semua desa']]),
        sel('poktan', st.fm.poktan, p.poktan, 'Kelompok Tani', [['', 'Semua poktan']]),
        sel('status', st.fm.status, p.status, 'Status', [['', 'Semua (kecuali ditolak/batal/Not Valid)'], ['semua', 'Semua status']])),
      h('section', { class: 'ringkas-atas' },
        h('div', { class: 'angka-besar ' + (n.total ? 'merah' : 'hijau') }, h('b', {}, n.total), h('span', {}, 'pengajuan PT salah')),
        h('div', { class: 'angka-besar abu' }, h('b', {}, hasil.length), h('span', {}, 'komoditas dicek')),
        h('div', { class: 'angka-besar abu' }, h('b', {}, `${n.batal} / ${n.hapus}`), h('span', {}, 'bisa Batal / Hapus'))),
      viewKomoditasMt(hasil, aturan, salahPer),
      h('div', { class: 'catatan-luas' }, h('b', {}, 'Jumlah PT tiap komoditas diambil dari isian terbanyak di data pengajuan aktif; '),
        'ubah angka PT di tombol komoditas bila daerah Anda berbeda. Yang tidak sesuai ditampilkan di sini. ', h('b', {}, 'Batal'), ' = tarik dari Korluh (status kembali "Belum dikirim") supaya bisa diperbaiki; ',
        h('b', {}, 'Hapus'), ' = hapus permanen pengajuan yang belum dikirim ke Korluh.'),
      !item.length ? h('div', { class: 'aman' }, hasil.length ? 'Semua pengajuan sudah sesuai jumlah PT komoditasnya.' : 'Belum ada pengajuan aktif.')
        : grup.map((d) => h('section', { class: 'grup-mt' },
          h('div', { class: 'grup-judul-mt' }, d.nama),
          h('ul', { class: 'daftar' }, d.poktan.map((pk) => {
            const kunci = d.desa + '|' + pk.id;
            const buka = st.terbukaMt === kunci;
            const nn = M.hitung(pk.item);
            return h('li', { class: 'kartu luput' },
              h('div', { class: 'kartu-mt' },
                h('button', { type: 'button', class: 'kartu-kepala', 'aria-expanded': String(buka), onclick: () => { st.terbukaMt = buka ? null : kunci; render(); } },
                  h('div', { class: 'kiri' },
                    h('div', { class: 'nama' }, pk.nama, h('span', { class: 'jumlah' }, `${pk.item.length}`)),
                    h('div', { class: 'meta' }, Object.entries(nn.per).map(([k, c]) => `${c} ${k.toLowerCase()}`).join(' · ') +
                      ` · ${nn.batal} menunggu Korluh · ${nn.hapus} belum dikirim` + (nn.tanpaAksi ? ` · ${nn.tanpaAksi} di atas Korluh` : ''))),
                  h('span', { class: 'panah' + (buka ? ' buka' : ''), 'aria-hidden': 'true' })),
                h('div', { class: 'aksi-poktan' }, tombolAksi(pk.item, 'kecil'))),
              buka && h('div', { class: 'rinci' }, h('table', {},
                h('thead', {}, h('tr', {}, ['Nama', 'NIK', 'Masalah', 'Luas', 'Status', 'Aksi'].map((t) => h('th', {}, t)))),
                h('tbody', {}, pk.item.map((x) => h('tr', { class: x.b.statusId === D.STATUS_DRAF ? 'draf' : '' },
                  h('td', {}, x.b.nama), h('td', {}, x.b.nik), h('td', { class: 'masalah' }, x.masalah.map(M.teksMasalah).join('; ')),
                  h('td', {}, fmtLuas(Math.max(...x.masalah.map((m) => m.luas)))), h('td', {}, x.b.status),
                  h('td', {}, x.aksi ? tombolAksi([x], '') : h('span', { class: 'tetap' }, '—'))))))));
          })))),
    ];
  }

  // Tombol per komoditas (hanya yang ada di data): klik = saring, angka PT bisa diubah manual
  function viewKomoditasMt(hasil, aturan, salahPer) {
    if (!hasil.length) return null;
    const pilih = (k) => { st.fm.komoditas = st.fm.komoditas === k ? '' : k; st.terbukaMt = null; render(); };
    return h('section', { class: 'kom-pt', 'aria-label': 'Komoditas dan jumlah PT' },
      h('button', { type: 'button', class: 'kom-semua' + (!st.fm.komoditas ? ' aktif' : ''), onclick: () => pilih('') }, 'Semua'),
      hasil.map((a) => {
        const at = aturan[a.komoditas];
        const salah = salahPer[a.komoditas] || 0;
        const tanda = [at.manual ? 'manual' : a.ragu && '⚠ perlu dicek', a.sedikit && 'data sedikit'].filter(Boolean).join(' · ');
        return h('div', { class: 'kom' + (st.fm.komoditas === a.komoditas ? ' aktif' : '') + (salah ? ' ada-salah' : '') + (a.ragu && !at.manual ? ' ragu' : '') },
          h('button', { type: 'button', class: 'kom-nama', onclick: () => pilih(a.komoditas), 'aria-pressed': String(st.fm.komoditas === a.komoditas),
            title: `${a.total} pengajuan: ${[1, 2, 3].map((i) => `${a.sebaran[i] || 0} isi ${i} PT`).join(', ')}` },
            h('b', {}, a.komoditas), h('span', { class: 'kom-salah' }, salah ? `${salah} salah` : 'sesuai')),
          h('label', { class: 'kom-pt-isi' }, 'PT',
            h('select', { 'aria-label': `Jumlah PT ${a.komoditas}`, disabled: sibuk(), onchange: (e) => setPt(a, e.target.value) },
              [1, 2, 3].map((i) => h('option', { value: String(i), selected: at.pt === i }, String(i))))),
          h('span', { class: 'kom-info' }, `${a.persen}% isi ${a.pt} PT dari ${a.total}`),
          tanda && h('span', { class: 'kom-tanda' }, tanda),
          at.manual && h('button', { type: 'button', class: 'tautan kom-reset', onclick: () => setPt(a, null), title: `Kembali ke hasil analisis (${a.pt} PT)` }, '↺ otomatis'));
      }));
  }

  function viewAksiMt() {
    const item = st.baris.length ? itemMt() : [];
    const bt = item.filter((x) => x.aksi === 'batal'), hp = item.filter((x) => x.aksi === 'hapus');
    return h('footer', { class: 'aksi' },
      st.menghapus && st.menghapus.n > 1 && h('button', { class: 'kedua penuh', type: 'button', disabled: st.henti,
        onclick: () => { st.henti = true; render(); } }, st.henti ? 'Menghentikan…' : 'Hentikan'),
      !sibuk() && bt.length > 0 && h('button', { class: 'batal-semua', type: 'button', onclick: () => aksiMt(bt, 'batal') },
        `Batal semua yang tampil (${bt.length})`),
      !sibuk() && hp.length > 0 && h('button', { class: 'hapus-semua setengah', type: 'button', onclick: () => aksiMt(hp, 'hapus') },
        `Hapus semua yang tampil (${hp.length})`),
      h('button', { class: 'utama', type: 'button', disabled: sibuk(), onclick: () => muat() }, sibuk() ? 'Memproses…' : 'Baca ulang data'),
      item.length ? h('button', { class: 'kedua', type: 'button', onclick: unduhMt }, 'Unduh Excel') : null,
      h('p', { class: 'aksi-ket' }, 'Batal/Hapus hanya terjadi setelah Anda menyetujui konfirmasi. Data dicek ulang sebelum setiap aksi. ' +
        'Alat bantu tidak resmi, bukan aplikasi Kementerian Pertanian.'));
  }

  async function aksiMt(item, jenis) {
    if (sibuk() || !item.length) return;
    const poktan = new Map();
    for (const x of item) poktan.set(x.b.poktan, (poktan.get(x.b.poktan) || 0) + 1);
    const daftar = [...poktan].map(([p, c]) => `• ${p}: ${c} pengajuan`).join('\n');
    const nama = item.slice(0, 12).map((x) => `  - ${x.b.nama} (${x.masalah.map(M.teksMasalah).join('; ')})`).join('\n') +
      (item.length > 12 ? `\n  … dan ${item.length - 12} lainnya` : '');
    const tanya = jenis === 'batal'
      ? `Batalkan ${item.length} pengajuan dari Korluh?\n\n${daftar}\n${nama}\n\nStatusnya kembali "Belum dikirim ke Korluh" sehingga bisa diperbaiki, lalu dikirim ulang.`
      : `HAPUS PERMANEN ${item.length} pengajuan dari e-RDKK?\n\n${daftar}\n${nama}\n\nData petani ini akan hilang dari e-RDKK dan harus diunggah ulang. Tidak bisa dibatalkan.`;
    if (!window.confirm(tanya)) return;
    if (jenis === 'hapus' && item.length > 1) {
      const ketik = window.prompt(`Untuk menghapus ${item.length} pengajuan sekaligus, ketik HAPUS lalu tekan OK.`);
      if (String(ketik || '').trim().toUpperCase() !== 'HAPUS') { st.info = { jenis: 'galat', teks: 'Penghapusan dibatalkan (konfirmasi tidak sesuai).' }; render(); return; }
    }
    const kata = jenis === 'batal' ? 'Membatalkan' : 'Menghapus';
    st.menghapus = { teks: 'Memeriksa data terbaru…' };
    st.henti = false;
    st.info = null;
    render();
    const ok = [], gagal = [];
    let dilewati = 0;
    const aturan = aturanMt(); // aturan saat tombol diklik, dipakai untuk cek ulang
    try {
      const terbaru = (await API.semuaPengajuan()).map(D.normalisasi);
      for (const [i, x] of item.entries()) {
        if (st.henti) { dilewati = item.length - i; break; }
        st.menghapus = { teks: `${kata} ${i + 1} dari ${item.length}: ${x.b.nama} (ID ${x.b.id})…`, i, n: item.length };
        render();
        const alasan = M.cekSebelumAksi(terbaru, x.b, jenis, aturan);
        if (alasan) { gagal.push(`${x.b.nama}: ${alasan}`); continue; }
        try {
          await (jenis === 'batal' ? API.batal(x.b.id) : API.hapus(x.b.id));
          ok.push(x.b.id);
        } catch (e) {
          if (e instanceof API.SesiHabis) throw e;
          gagal.push(`${x.b.nama}: ${e.message}`);
        }
      }
    } catch (e) {
      console.error('[Asisten e-RDKK]', e);
      gagal.push(e.message);
    }
    st.menghapus = null;
    st.henti = false;
    const kerja = jenis === 'batal' ? 'dibatalkan (kembali "Belum dikirim")' : 'dihapus';
    const henti = dilewati ? ` Dihentikan, ${dilewati} belum diproses.` : '';
    st.info = gagal.length || dilewati
      ? { jenis: 'galat', teks: `${ok.length} pengajuan ${kerja}.${henti}${gagal.length ? ` Dilewati: ${gagal.slice(0, 10).join('; ')}${gagal.length > 10 ? ` … (+${gagal.length - 10})` : ''}` : ''}` }
      : { jenis: 'ok', teks: `${ok.length} pengajuan ${kerja}. Data sudah dibaca ulang.` };
    await muat(true);
  }

  function unduhMt() {
    const grup = M.kelompokkan(itemMt(), st.namaDesa);
    const info = { waktu: st.waktu, tahun: st.baris[0] && st.baris[0].tahun, filterTeks: teksFilterMt(), aturanTeks: M.teksAturan(aturanMt()) };
    unduhFile(window.AsistenExcel.buat(L.susunCekMt(info, grup, M.teksMasalah)), 'Cek PT e-RDKK');
  }

  // ─── Status upload per poktan ──────────────────────────────────────────────
  const daftarUpload = () => U.statusUpload(st.poktanMaster, st.baris, st.namaDesa);

  function viewUpload() {
    if (!st.poktanMaster.length) return h('div', { class: 'galat' }, 'Daftar kelompok tani (Master Data → Kelompok Tani) tidak terbaca. Klik "Baca ulang data".');
    const semua = daftarUpload();
    const jenisSaja = U.saring(semua, { jenis: st.fu.jenis });
    const desaOpsi = [...new Set(jenisSaja.map((p) => p.desa))].sort();
    if (st.fu.desa && !desaOpsi.includes(st.fu.desa)) st.fu.desa = '';
    const list = U.saring(semua, st.fu);
    const ringkas = U.perDesa(U.saring(semua, { ...st.fu, upload: '' })); // ringkasan desa tidak terpengaruh filter sudah/belum
    const t = ringkas.total;
    const ubah = (k, v) => { st.fu[k] = v; render(); };
    const sel = (name, nilai, opsi, label) => h('label', { class: 'pilih' }, h('span', {}, label),
      h('select', { name: 'up-' + name, onchange: (e) => ubah(name, e.target.value) },
        opsi.map(([v, l]) => h('option', { value: v, selected: nilai === v }, l))));
    const nKwt = semua.filter((p) => p.kwt).length;
    const body = [];
    let desa = null;
    for (const p of list) {
      if (p.desa !== desa) {
        desa = p.desa;
        const d = ringkas.desa.find((x) => x.desa === desa) || { sudah: 0, total: 0 };
        body.push(h('tr', { class: 'desa' }, h('td', { colspan: 3 }, desa), h('td', { class: 'n' }, `${d.sudah}/${d.total} sudah`)));
      }
      body.push(h('tr', {},
        h('td', { class: 'poktan' }, p.nama, p.kwt && h('span', { class: 'chip abu kecil' }, 'KWT'),
          p.dobelMaster && h('span', { class: 'chip kuning kecil', title: 'Nama poktan ini tercatat lebih dari sekali di master' }, 'dobel di master'),
          p.diluarMaster && h('span', { class: 'chip kuning kecil', title: 'Ada pengajuan, tapi nama poktan tidak ditemukan di master' }, 'tidak ada di master')),
        h('td', {}, p.sudah ? h('span', { class: 'chip hijau' }, 'Sudah') : h('span', { class: 'chip merah' }, 'Belum')),
        h('td', { class: 'komoditas-up' }, p.sudah ? U.teksKomoditas(p) : '—'),
        h('td', { class: 'n' }, p.pengajuan ? `${p.pengajuan} pengajuan` : '')));
    }
    const persen = t.total ? Math.round((t.sudah / t.total) * 100) : 0;
    return [
      h('section', { class: 'filter-rekap' },
        sel('desa', st.fu.desa, [['', 'Semua desa'], ...desaOpsi.map((d) => [d, d])], 'Kelurahan/Desa'),
        sel('upload', st.fu.upload, [['', 'Sudah & belum'], ['sudah', 'Sudah upload'], ['belum', 'Belum upload']], 'Status Upload'),
        sel('jenis', st.fu.jenis, [['poktan', 'Poktan (tanpa KWT)'], ['kwt', `KWT saja (${nKwt})`], ['semua', 'Poktan + KWT']], 'Jenis'),
        h('label', { class: 'pilih' }, h('span', {}, 'Cari poktan'),
          h('input', { type: 'search', name: 'up-cari', value: st.fu.cari, placeholder: 'Nama poktan…', oninput: (e) => ubah('cari', e.target.value) }))),
      h('section', { class: 'ringkas-atas' },
        h('div', { class: 'angka-besar hijau' }, h('b', {}, `${t.sudah} / ${t.total}`), h('span', {}, `sudah upload (${persen}%)`)),
        h('div', { class: 'angka-besar ' + (t.belum ? 'merah' : 'hijau') }, h('b', {}, t.belum), h('span', {}, 'belum upload')),
        h('div', { class: 'angka-besar abu' }, h('b', {}, ringkas.desa.filter((d) => d.belum === 0).length + ' / ' + ringkas.desa.length), h('span', {}, 'desa sudah lengkap'))),
      h('div', { class: 'bar' }, h('div', { class: 'bar-isi', style: `width:${persen}%` })),
      h('div', { class: 'catatan-luas' }, h('b', {}, 'Sudah upload = punya minimal 1 pengajuan aktif '),
        '(status apa pun kecuali ditolak/batal/Not Valid). Daftar kelompok dari menu Master Data → Kelompok Tani, dicocokkan lewat nama desa + nama poktan.'),
      !list.length ? h('p', { class: 'kosong' }, 'Tidak ada kelompok yang cocok dengan filter.')
        : h('div', { class: 'tabel-rekap' }, h('table', {},
          h('thead', {}, h('tr', {}, ['Desa / Kelompok Tani', 'Status', 'Komoditas yang diupload', ''].map((x, i) => h('th', { class: i === 3 ? 'n' : '' }, x)))),
          h('tbody', {}, body))),
    ];
  }

  function teksFilterUpload() {
    return [st.fu.desa ? `Desa ${st.fu.desa}` : 'Semua desa',
      { '': 'sudah & belum upload', sudah: 'sudah upload', belum: 'belum upload' }[st.fu.upload],
      { poktan: 'poktan (tanpa KWT)', kwt: 'KWT saja', semua: 'poktan + KWT' }[st.fu.jenis],
      st.fu.cari && `cari "${st.fu.cari}"`].filter(Boolean).join(' · ');
  }

  function unduhUpload() {
    const semua = daftarUpload();
    const list = U.saring(semua, st.fu);
    const ringkas = U.perDesa(U.saring(semua, { ...st.fu, upload: '' }));
    const info = { waktu: st.waktu, tahun: st.baris[0] && st.baris[0].tahun, filterTeks: teksFilterUpload() };
    unduhFile(window.AsistenExcel.buat(L.susunUpload(info, list, ringkas, U.teksKomoditas)), 'Status Upload RDKK');
  }

  function unduhRekap() {
    const r = R.rekap(R.saringBaris(st.baris, st.fr), st.namaDesa, st.fr.komoditas);
    const info = { waktu: st.waktu, tahun: st.baris[0] && st.baris[0].tahun, filterTeks: teksFilterRekap() };
    unduhFile(window.AsistenExcel.buat(L.susunRekap(info, r)), 'Rekap Luas e-RDKK');
  }

  function unduhFile(data, awalan) {
    const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const t = new Date(st.waktu || Date.now());
    const dua = (x) => String(x).padStart(2, '0');
    const a = h('a', { href: url, download: `${awalan} - ${t.getFullYear()}-${dua(t.getMonth() + 1)}-${dua(t.getDate())} ${dua(t.getHours())}.${dua(t.getMinutes())}.xlsx` });
    akar.append(a);
    a.click(); // klik di dalam Shadow DOM, tidak tertangkap skrip halaman
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function unduh() {
    const r = hasil();
    const kel = D.saring(r.kelompok, { wilayah: st.f.wilayah });
    const info = { waktu: st.waktu, dicek: r.dicek, dikecualikan: r.dikecualikan, tahun: st.baris[0] && st.baris[0].tahun };
    const data = window.AsistenExcel.buat(L.susun(info, kel));
    const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const t = new Date(st.waktu || Date.now());
    const dua = (x) => String(x).padStart(2, '0');
    const a = h('a', { href: url, download: `Duplikasi e-RDKK - ${t.getFullYear()}-${dua(t.getMonth() + 1)}-${dua(t.getDate())} ${dua(t.getHours())}.${dua(t.getMinutes())}.xlsx` });
    akar.append(a);
    a.click(); // klik di dalam Shadow DOM, tidak tertangkap skrip halaman
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
})();
