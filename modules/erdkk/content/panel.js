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

  const API = window.ErdkkApi, D = window.ErdkkDuplikasi, L = window.ErdkkLaporan, R = window.ErdkkRekap, M = window.ErdkkCekMt;

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
    tab: 'dup', // dup | rekap
    penuh: false, // panel dibesarkan selebar layar
    namaDesa: new Map(), // kode desa → nama
    fr: { desa: '', poktan: '', status: '', komoditas: '' }, // filter rekap ('' status = aktif)
    fm: { desa: '', poktan: '', status: '', komoditas: '' }, // filter Cek MT
    terbukaMt: null, // poktan yang rinciannya dibuka di Cek MT
  };
  const sibuk = () => st.tahap === 'memuat' || !!st.menghapus;

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
    h('span', { class: 'fab-ikon', 'aria-hidden': 'true' }, '⧉'), 'Asisten e-RDKK');
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
      st.waktu = new Date().toISOString();
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
    st.tahap = st.baris.length ? 'siap' : 'awal';
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
            rekap: 'Rekap luas lahan per kampung, poktan, komoditas',
            mt: 'Cek MT: padi & jagung 2 MT, kopi maks 1 PT',
            dup: 'Cek duplikasi: baris identik di semua status',
          })[st.tab] + (tahun ? ` · Tahun ${tahun}` : ''))),
        h('div', { class: 'tombol-kepala' },
          h('button', { class: 'tutup', type: 'button', title: st.penuh ? 'Kecilkan panel' : 'Perbesar panel selebar layar',
            'aria-label': st.penuh ? 'Kecilkan panel' : 'Perbesar panel', onclick: () => { st.penuh = !st.penuh; render(); } },
          st.penuh ? '⤡' : '⛶'),
          h('button', { class: 'tutup', type: 'button', 'aria-label': 'Tutup', onclick: () => setBuka(false) }, '✕'))),
      h('nav', { class: 'tab-utama', role: 'tablist' },
        [['dup', '⧉ Cek Duplikasi'], ['mt', '⚠ Cek MT'], ['rekap', '▦ Rekap Luas']].map(([k, l]) => h('button', {
          type: 'button', role: 'tab', 'aria-selected': String(st.tab === k), class: st.tab === k ? 'aktif' : '',
          disabled: !!st.menghapus, onclick: () => { st.tab = k; render(); },
        }, l))),
      h('div', { class: 'isi' },
        st.galat && h('div', { class: 'galat', role: 'alert' }, st.galat),
        st.info && h('div', { class: `info ${st.info.jenis}`, role: 'status' }, st.info.teks),
        st.menghapus && h('div', { class: 'progres' }, h('div', { class: 'progres-judul' }, st.menghapus.teks),
          st.menghapus.n > 1 && h('div', { class: 'bar' }, h('div', { class: 'bar-isi', style: `width:${Math.round((st.menghapus.i / st.menghapus.n) * 100)}%` }))),
        sibuk() && viewProgres(),
        st.baris.length && (st.tab === 'rekap' ? viewRekap() : st.tab === 'mt' ? viewMt() : viewHasil())),
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
        (waktu ? `Dibaca pukul ${waktu.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}.` : '')),
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
        ? h('div', { class: 'aman' }, '✅ Tidak ada data dobel (baris identik) di semua status.')
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
      h('span', { class: 'panah', 'aria-hidden': 'true' }, buka ? '▾' : '▸')),
      buka && h('div', { class: 'rinci' },
        h('table', {},
          h('thead', {}, h('tr', {}, ['Status', 'Dibuat', 'MT1', 'MT2', 'MT3', 'ID', 'Aksi'].map((t) => h('th', {}, t)))),
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
            `🗑 Hapus ${D.salinanHapus(k).length} salinan, sisakan 1`)),
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
    if (st.tab === 'rekap') {
      return h('footer', { class: 'aksi' },
        h('button', { class: 'utama', type: 'button', disabled: sibuk(), onclick: () => muat() }, sibuk() ? 'Membaca…' : '↻ Baca ulang data'),
        st.baris.length ? h('button', { class: 'kedua', type: 'button', onclick: unduhRekap }, 'Unduh Excel') : null,
        h('p', { class: 'aksi-ket' }, 'Hanya membaca data e-RDKK dengan akun Anda. Data tidak disimpan di browser. ' +
          'Alat bantu tidak resmi, bukan aplikasi Kementerian Pertanian.'));
    }
    const ada = st.baris.length && hasil().kelompok.length;
    const semua = ada ? D.semuaSalinanHapus(D.saring(hasil().kelompok, st.f)) : [];
    const nPetani = new Set(semua.map((x) => x.k)).size;
    return h('footer', { class: 'aksi' },
      st.menghapus && st.menghapus.n > 1 && h('button', { class: 'kedua penuh', type: 'button', disabled: st.henti,
        onclick: () => { st.henti = true; render(); } }, st.henti ? 'Menghentikan…' : '⏸ Hentikan penghapusan'),
      !sibuk() && semua.length > 0 && h('button', { class: 'hapus-semua', type: 'button', onclick: () => hapusSemua(semua) },
        `🗑 Hapus semua salinan (${semua.length} baris, ${nPetani} petani)`),
      h('button', { class: 'utama', type: 'button', disabled: sibuk(), onclick: () => muat() }, sibuk() ? 'Memeriksa…' : st.baris.length ? '↻ Periksa ulang' : 'Periksa duplikasi'),
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
      : { jenis: dilewati ? 'galat' : 'ok', teks: `${dilewati ? '⏸' : '✅'} ${ok.length} salinan (${label}) berhasil dihapus.${henti} Data sudah diperiksa ulang.` };
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
        ? `✅ Pengiriman ID ${b.id} (${k.nama}) dibatalkan. Status sekarang: "${sesudah.status}".` +
          (sesudah.statusId === D.STATUS_DRAF ? ' Salinan ini sekarang bisa dihapus.' : '')
        : `✅ Pengiriman ID ${b.id} (${k.nama}) dibatalkan. Baris tidak lagi muncul di daftar pengajuan.` };
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
        h('div', { class: 'angka-besar hijau' }, h('b', {}, fmtLuas(r.total.luas)), h('span', {}, 'ha luas lahan per tahun')),
        h('div', { class: 'angka-besar abu' }, h('b', {}, fmtLuas(r.total.luasTanam)), h('span', {}, 'ha luas total PT (MT1+MT2+MT3)')),
        h('div', { class: 'angka-besar abu' }, h('b', {}, fmtKg(r.total.petani)), h('span', {}, 'petani (baris)')),
        h('div', { class: 'angka-besar abu' }, h('b', {}, r.perKomoditas.map((k) => k.komoditas).join(', ') || '-'), h('span', {}, 'komoditas'))),
      r.perKomoditas.length > 1 && h('p', { class: 'diperbarui' }, r.perKomoditas.map((k) => `${k.komoditas} ${fmtLuas(k.luas)} ha`).join(' · ')),
      h('div', { class: 'catatan-luas' }, h('b', {}, 'ℹ Luas = luas lahan PER TAHUN, bukan per periode tanam (MT). '),
        'Lahan jagung 0,5 ha yang ditanam di MT1 dan MT2 dihitung 0,5 ha, bukan 1 ha. ',
        h('b', {}, 'Luas Total PT'), ' = jumlah luas semua periode tanam MT1+MT2+MT3 (contoh tadi = 1 ha), jadi Luas Total PT ÷ Luas/Tahun = berapa kali ditanam setahun. ',
        ''),
      !r.desa.length ? h('p', { class: 'kosong' }, 'Tidak ada data untuk filter ini.')
        : h('div', { class: 'tabel-rekap' }, h('table', {},
          h('thead', {}, h('tr', {}, ['Kampung / Poktan', 'Komoditas', 'Petani', 'Luas/Tahun (ha)', 'Luas Total PT (ha)']
            .map((t, i) => h('th', { class: i > 1 ? 'n' : '' }, t)))),
          h('tbody', {}, body),
          h('tfoot', {}, h('tr', {}, h('td', { colspan: 2 }, 'TOTAL'), ...sel1(r.total))))),
      h('p', { class: 'diperbarui' }, 'Data dihitung apa adanya, termasuk salinan dobel. Bersihkan dulu lewat tab Cek Duplikasi supaya angkanya tepat.'),
    ];
  }

  // ─── Cek MT padi & jagung ──────────────────────────────────────────────────
  const itemMt = () => M.cari(st.baris, st.fm);

  function teksFilterMt() {
    const p = R.pilihan(st.baris, st.namaDesa, st.fm.desa);
    const nama = (arr, id) => (arr.find((x) => String(x.id) === String(id)) || {}).nama || id;
    return [
      st.fm.desa ? `Desa ${nama(p.desa, st.fm.desa)}` : 'Semua desa',
      st.fm.poktan ? `Poktan ${nama(p.poktan, st.fm.poktan)}` : 'semua poktan',
      st.fm.komoditas || 'padi, jagung & kopi',
      st.fm.status === 'semua' ? 'semua status' : st.fm.status ? `status "${nama(p.status, st.fm.status)}"` : 'status aktif',
    ].join(' · ');
  }

  function tombolAksi(item, ukuran) {
    const bt = item.filter((x) => x.aksi === 'batal'), hp = item.filter((x) => x.aksi === 'hapus');
    return [
      bt.length > 0 && h('button', { type: 'button', class: `batal ${ukuran}`, disabled: sibuk(), onclick: () => aksiMt(bt, 'batal') },
        ukuran ? `↩ Batal ${bt.length}` : 'Batal'),
      hp.length > 0 && h('button', { type: 'button', class: `hapus ${ukuran}`, disabled: sibuk(), onclick: () => aksiMt(hp, 'hapus') },
        ukuran ? `🗑 Hapus ${hp.length}` : 'Hapus'),
    ];
  }

  function viewMt() {
    const p = R.pilihan(st.baris, st.namaDesa, st.fm.desa);
    if (st.fm.poktan && !p.poktan.some((x) => x.id === st.fm.poktan)) st.fm.poktan = '';
    const item = itemMt();
    const n = M.hitung(item);
    const grup = M.kelompokkan(item, st.namaDesa);
    const ubah = (k, v) => { st.fm[k] = v; if (k === 'desa') st.fm.poktan = ''; st.terbukaMt = null; render(); };
    const sel = (name, nilai, opsi, label, awal) => h('label', { class: 'pilih' }, h('span', {}, label),
      h('select', { name: 'mt-' + name, onchange: (e) => ubah(name, e.target.value) },
        awal.map(([v, l]) => h('option', { value: v, selected: nilai === v }, l)),
        opsi.map((o) => h('option', { value: String(o.id), selected: nilai === String(o.id) }, o.nama))));
    return [
      h('section', { class: 'filter-rekap' },
        sel('desa', st.fm.desa, p.desa, 'Kelurahan/Desa', [['', 'Semua desa']]),
        sel('poktan', st.fm.poktan, p.poktan, 'Kelompok Tani', [['', 'Semua poktan']]),
        sel('komoditas', st.fm.komoditas, [], 'Komoditas', [['', 'Padi, Jagung & Kopi'], ['PADI', 'PADI'], ['JAGUNG', 'JAGUNG'], ['KOPI', 'KOPI']]),
        sel('status', st.fm.status, p.status, 'Status', [['', 'Semua (kecuali ditolak/batal/Not Valid)'], ['semua', 'Semua status']])),
      h('section', { class: 'ringkas-atas' },
        h('div', { class: 'angka-besar ' + (n.total ? 'merah' : 'hijau') }, h('b', {}, n.total), h('span', {}, 'pengajuan MT/PT salah')),
        h('div', { class: 'angka-besar abu' }, h('b', {}, `${n.padi} / ${n.jagung} / ${n.kopi}`), h('span', {}, 'padi / jagung / kopi')),
        h('div', { class: 'angka-besar abu' }, h('b', {}, `${n.batal} / ${n.hapus}`), h('span', {}, 'bisa Batal / Hapus'))),
      h('div', { class: 'catatan-luas' }, h('b', {}, 'ℹ Padi & jagung harus 2 MT setahun; kopi (tanaman tahunan) cukup 1 PT. '),
        'Yang tidak sesuai ditampilkan di sini. ', h('b', {}, 'Batal'), ' = tarik dari Korluh (status kembali "Belum dikirim") supaya bisa diperbaiki; ',
        h('b', {}, 'Hapus'), ' = hapus permanen pengajuan yang belum dikirim ke Korluh.'),
      !item.length ? h('div', { class: 'aman' }, '✅ Semua pengajuan padi & jagung sudah 2 MT, dan kopi 1 PT.')
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
                    h('div', { class: 'meta' }, [nn.padi && `${nn.padi} padi`, nn.jagung && `${nn.jagung} jagung`, nn.kopi && `${nn.kopi} kopi`].filter(Boolean).join(' · ') +
                      ` · ${nn.batal} menunggu Korluh · ${nn.hapus} belum dikirim` + (nn.tanpaAksi ? ` · ${nn.tanpaAksi} di atas Korluh` : ''))),
                  h('span', { class: 'panah', 'aria-hidden': 'true' }, buka ? '▾' : '▸')),
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

  function viewAksiMt() {
    const item = st.baris.length ? itemMt() : [];
    const bt = item.filter((x) => x.aksi === 'batal'), hp = item.filter((x) => x.aksi === 'hapus');
    return h('footer', { class: 'aksi' },
      st.menghapus && st.menghapus.n > 1 && h('button', { class: 'kedua penuh', type: 'button', disabled: st.henti,
        onclick: () => { st.henti = true; render(); } }, st.henti ? 'Menghentikan…' : '⏸ Hentikan'),
      !sibuk() && bt.length > 0 && h('button', { class: 'batal-semua', type: 'button', onclick: () => aksiMt(bt, 'batal') },
        `↩ Batal semua yang tampil (${bt.length})`),
      !sibuk() && hp.length > 0 && h('button', { class: 'hapus-semua setengah', type: 'button', onclick: () => aksiMt(hp, 'hapus') },
        `🗑 Hapus semua yang tampil (${hp.length})`),
      h('button', { class: 'utama', type: 'button', disabled: sibuk(), onclick: () => muat() }, sibuk() ? 'Memproses…' : '↻ Baca ulang data'),
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
    try {
      const terbaru = (await API.semuaPengajuan()).map(D.normalisasi);
      for (const [i, x] of item.entries()) {
        if (st.henti) { dilewati = item.length - i; break; }
        st.menghapus = { teks: `${kata} ${i + 1} dari ${item.length}: ${x.b.nama} (ID ${x.b.id})…`, i, n: item.length };
        render();
        const alasan = M.cekSebelumAksi(terbaru, x.b, jenis);
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
      : { jenis: 'ok', teks: `✅ ${ok.length} pengajuan ${kerja}. Data sudah dibaca ulang.` };
    await muat(true);
  }

  function unduhMt() {
    const grup = M.kelompokkan(itemMt(), st.namaDesa);
    const info = { waktu: st.waktu, tahun: st.baris[0] && st.baris[0].tahun, filterTeks: teksFilterMt() };
    unduhFile(window.AsistenExcel.buat(L.susunCekMt(info, grup, M.teksMasalah)), 'Cek MT e-RDKK');
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
