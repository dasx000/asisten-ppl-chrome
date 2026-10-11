// ================= PANEL "CEK DUPLIKASI" DI e-RDKK ================= \\
// Aturan sama dengan Monitoring Duplikasi bawaan (baris identik semua kolom = ter-upload 2x), tapi memeriksa
// SEMUA status pengajuan, bukan hanya "Belum dikirim ke Korluh".
// Aksi: hapus salinan berstatus "Belum dikirim ke Korluh" (endpoint sama dengan tombol Hapus bawaan), selalu dengan
// konfirmasi, cek ulang data terbaru, dan minimal satu baris per kelompok disisakan.
// Data berisi NIK, jadi TIDAK disimpan di browser: selalu diambil ulang saat panel dibuka.

(function () {
  'use strict';
  if (window.__asistenErdkk) return;
  window.__asistenErdkk = true;

  // Hanya setelah login (menu samping e-RDKK punya tautan Pengajuan)
  if (!document.querySelector('a[href$="/pengajuan"]')) return;

  const API = window.ErdkkApi, D = window.ErdkkDuplikasi, L = window.ErdkkLaporan;

  const st = {
    buka: false,
    tahap: 'awal', // awal | memuat | siap
    baris: [], // hasil normalisasi
    waktu: null,
    progres: null,
    galat: '',
    f: { cari: '', wilayah: '', jenis: 'semua' },
    terbuka: null, // kunci kelompok yang rinciannya dibuka (hanya satu)
    menghapus: null, // { teks } saat proses hapus berjalan
    info: null, // { jenis: 'ok'|'galat', teks } hasil aksi terakhir
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
  const fab = h('button', { class: 'fab', type: 'button', onclick: () => setBuka(true), title: 'Asisten PPL — Cek Duplikasi' },
    h('span', { class: 'fab-ikon', 'aria-hidden': 'true' }, '⧉'), 'Cek Duplikasi');
  const latar = h('div', { class: 'latar', onclick: () => setBuka(false) });
  const laci = h('aside', { class: 'laci', role: 'dialog', 'aria-label': 'Cek Duplikasi e-RDKK' });
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
    laci.replaceChildren(
      h('header', { class: 'kepala' },
        h('div', {},
          h('div', { class: 'judul' }, 'Cek Duplikasi e-RDKK'),
          h('div', { class: 'sub' }, `Baris identik di semua status${tahun ? ` · Tahun ${tahun}` : ''}`)),
        h('button', { class: 'tutup', type: 'button', 'aria-label': 'Tutup', onclick: () => setBuka(false) }, '✕')),
      h('div', { class: 'isi' },
        st.galat && h('div', { class: 'galat', role: 'alert' }, st.galat),
        st.info && h('div', { class: `info ${st.info.jenis}`, role: 'status' }, st.info.teks),
        st.menghapus && h('div', { class: 'progres' }, h('div', { class: 'progres-judul' }, st.menghapus.teks)),
        sibuk() && viewProgres(),
        st.baris.length && viewHasil()),
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
              : h('span', { class: 'tetap', title: b.statusId === D.STATUS_DRAF ? 'Disisakan satu' : 'Sudah dikirim, tidak bisa dihapus penyuluh' }, '—')))))),
        D.salinanHapus(k).length > 0 && h('div', { class: 'aksi-kartu' },
          h('button', { type: 'button', class: 'hapus besar', disabled: sibuk(), onclick: () => hapusBaris(k, D.salinanHapus(k)) },
            `🗑 Hapus ${D.salinanHapus(k).length} salinan, sisakan 1`)),
        h('p', { class: 'saran' }, k.bisaDihapus
          ? (k.bisaDihapus === k.baris.length
            ? 'Semua baris masih "Belum dikirim ke Korluh". Tombol di atas menghapus salinannya dan menyisakan yang paling awal dibuat.'
            : `${k.bisaDihapus} baris biru ("Belum dikirim ke Korluh") adalah salinan data yang sudah dikirim, aman dihapus.`)
          : 'Semua baris sudah dikirim/diproses. Koordinasikan dengan Korluh agar salinannya ditolak/dikembalikan.')));
  }

  function viewAksi() {
    const ada = st.baris.length && hasil().kelompok.length;
    return h('footer', { class: 'aksi' },
      h('button', { class: 'utama', type: 'button', disabled: sibuk(), onclick: () => muat() }, sibuk() ? 'Memeriksa…' : st.baris.length ? '↻ Periksa ulang' : 'Periksa duplikasi'),
      ada ? h('button', { class: 'kedua', type: 'button', onclick: unduh }, 'Unduh Excel') : null,
      h('p', { class: 'aksi-ket' }, 'Data dibaca dengan akun Anda. Penghapusan hanya terjadi saat Anda klik Hapus dan menyetujui konfirmasi. ' +
        'Data tidak disimpan di browser. ' +
        'Alat bantu tidak resmi, bukan aplikasi Kementerian Pertanian.'));
  }

  // ─── Aksi hapus ────────────────────────────────────────────────────────────
  async function hapusBaris(k, daftar) {
    if (sibuk() || !daftar.length) return;
    const tersisa = k.baris.length - daftar.length;
    const rinci = daftar.map((b) => `• ID ${b.id} — ${b.status}, dibuat ${L.waktu(b.dibuat)}`).join('\n');
    const tanya = `Hapus ${daftar.length} salinan pengajuan ini dari e-RDKK?\n\n${k.nama} — NIK ${k.nik}\n${rinci}\n\n` +
      `Tersisa ${tersisa} baris setelah dihapus. Penghapusan tidak bisa dibatalkan.`;
    if (!window.confirm(tanya)) return;

    st.menghapus = { teks: 'Memeriksa data terbaru sebelum menghapus…' };
    st.info = null;
    render();
    const ok = [], gagal = [];
    try {
      let terbaru = (await API.semuaPengajuan()).map(D.normalisasi);
      for (const [i, b] of daftar.entries()) {
        st.menghapus = { teks: `Menghapus ${i + 1} dari ${daftar.length} (ID ${b.id})…` };
        render();
        const alasan = D.cekSebelumHapus(terbaru, b);
        if (alasan) { gagal.push(`ID ${b.id}: ${alasan}`); continue; }
        try {
          await API.hapus(b.id);
          ok.push(b.id);
          terbaru = terbaru.filter((x) => x.id !== b.id);
        } catch (e) {
          if (e instanceof API.SesiHabis) throw e;
          gagal.push(`ID ${b.id}: ${e.message}`);
        }
      }
    } catch (e) {
      console.error('[Asisten e-RDKK]', e);
      gagal.push(e.message);
    }
    st.menghapus = null;
    st.info = gagal.length
      ? { jenis: 'galat', teks: `${ok.length ? `${ok.length} salinan ${k.nama} terhapus. ` : ''}Tidak dihapus: ${gagal.join('; ')}` }
      : { jenis: 'ok', teks: `✅ ${ok.length} salinan ${k.nama} berhasil dihapus. Data sudah diperiksa ulang.` };
    await muat(true); // baca ulang supaya daftar sesuai kondisi terbaru
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
