// ================= PANEL "KUOTA PROGRAM" DI E-BANPER ================= \\
// Tombol melayang + laci samping (Shadow DOM). Menampilkan Rancangan Pusat, Telah Diajukan, dan Sisa
// untuk semua kegiatan di kabupaten akun yang login, tanpa membuka form usulan satu per satu.
// Hanya membaca data (GET), tidak pernah mengirim atau mengubah usulan.

(function () {
  'use strict';
  if (window.__asistenEbanper) return;
  window.__asistenEbanper = true;

  const API = window.EbanperApi, K = window.EbanperKuota;
  const KUNCI_SIMPAN = 'ebanper.kuota';

  const st = {
    buka: false,
    tahap: 'awal', // awal | memuat | siap
    data: null, // { baris, galat, kabupaten, tahun, waktu, lengkap }
    progres: null,
    berhenti: false,
    galat: '',
    f: { cari: '', subsektor: '', status: 'semua', tampilKosong: false },
    terbuka: new Set(), // id kegiatan yang rinciannya dibuka
  };
  const sibuk = () => st.tahap === 'memuat';
  const fmt = (n) => Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });

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
  const host = h('div', { id: 'asisten-ebanper-kuota' });
  const akar = host.attachShadow({ mode: 'open' });
  akar.append(h('link', { rel: 'stylesheet', href: chrome.runtime.getURL('modules/ebanper/content/panel.css') }));
  const fab = h('button', { class: 'fab', type: 'button', onclick: () => setBuka(true), title: 'Asisten PPL — Kuota Program' },
    h('span', { class: 'fab-ikon', 'aria-hidden': 'true' }, '📊'), 'Kuota Program');
  const latar = h('div', { class: 'latar', onclick: () => setBuka(false) });
  const laci = h('aside', { class: 'laci', role: 'dialog', 'aria-label': 'Kuota Program e-Banper' });
  akar.append(fab, latar, laci);
  document.body.append(host);

  window.Asisten.pantau('ebanper', (nyala) => {
    if (!nyala && st.buka) setBuka(false);
    host.style.display = nyala ? '' : 'none';
  });

  async function setBuka(b) {
    st.buka = b;
    host.classList.toggle('buka', b);
    laci.classList.toggle('buka', b);
    latar.classList.toggle('buka', b);
    fab.hidden = b;
    if (!b) return;
    if (!st.data && !sibuk()) {
      st.data = await bacaSimpanan();
      if (st.data) st.tahap = 'siap';
      else return muat();
    }
    render();
  }

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.buka) setBuka(false); });

  // ─── Simpanan (supaya buka berikutnya langsung tampil) ─────────────────────
  async function bacaSimpanan() {
    try {
      const v = (await chrome.storage.local.get(KUNCI_SIMPAN))[KUNCI_SIMPAN];
      return v && Array.isArray(v.baris) ? v : null;
    } catch (e) {
      return null;
    }
  }
  function simpan(data) {
    try { chrome.storage.local.set({ [KUNCI_SIMPAN]: data }); } catch (e) { /* abaikan */ }
  }

  // ─── Ambil data ────────────────────────────────────────────────────────────
  /** Subsektor dari dropdown form usulan bila sedang terbuka (agar subsektor baru ikut terbaca). */
  function subsektorHalaman() {
    const s = document.querySelector('select[name="subsektor"]');
    return s ? [...s.options].filter((o) => o.value).map((o) => ({ id: o.value, nama: o.textContent })) : [];
  }

  async function muat() {
    Object.assign(st, { tahap: 'memuat', galat: '', progres: null, berhenti: false });
    render();
    try {
      const r = await K.kumpulkan(API, {
        subsektor: subsektorHalaman(),
        dihentikan: () => st.berhenti,
        onProgres: (i, n, teks) => { st.progres = { i, n, teks }; render(); },
      });
      if (!r.lengkap) {
        st.galat = 'Pengambilan data dihentikan. Data di bawah belum lengkap.';
      } else if (!r.baris.length) {
        st.galat = 'Tidak ada kegiatan yang terbaca. Pastikan Anda login sebagai penyuluh di e-Banper.';
      }
      st.data = { ...r, waktu: new Date().toISOString() };
      if (r.lengkap && r.baris.length) simpan(st.data);
    } catch (e) {
      console.error('[Asisten e-Banper]', e);
      st.galat = e instanceof API.SesiHabis || e instanceof API.ServerSibuk
        ? e.message : `Terjadi kesalahan: ${e.message}. Coba muat ulang halaman lalu ulangi.`;
    }
    st.tahap = st.data ? 'siap' : 'awal';
    st.progres = null;
    render();
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  function render() {
    if (!st.buka) return;
    const fokus = akar.activeElement && akar.activeElement.name; // pertahankan fokus kolom cari saat mengetik
    const d = st.data;
    laci.replaceChildren(
      h('header', { class: 'kepala' },
        h('div', {},
          h('div', { class: 'judul' }, 'Kuota Program e-Banper'),
          h('div', { class: 'sub' }, d && d.kabupaten ? `${d.kabupaten}${d.tahun ? ` · Tahun ${d.tahun}` : ''}` : 'Rancangan Pusat · Telah Diajukan · Sisa')),
        h('button', { class: 'tutup', type: 'button', 'aria-label': 'Tutup', onclick: () => setBuka(false) }, '✕')),
      h('div', { class: 'isi' },
        st.galat && h('div', { class: 'galat', role: 'alert' }, st.galat),
        sibuk() && viewProgres(),
        d && viewData(d)),
      viewAksi());
    if (fokus) {
      const el = akar.querySelector(`[name="${fokus}"]`);
      if (el) { el.focus(); if (el.setSelectionRange && el.value) el.setSelectionRange(el.value.length, el.value.length); }
    }
  }

  function viewProgres() {
    const p = st.progres || { i: 0, n: 0, teks: '' };
    const persen = p.n ? Math.round((p.i / p.n) * 100) : 0;
    return h('section', { class: 'progres', 'aria-live': 'polite' },
      h('div', { class: 'progres-judul' }, 'Mengambil data kuota…'),
      h('div', { class: 'bar' }, h('div', { class: 'bar-isi', style: `width:${persen}%` })),
      h('div', { class: 'progres-ket' }, p.teks || 'Menyiapkan…'),
      h('div', { class: 'progres-ket kecil' }, 'Hanya membaca data, tidak ada usulan yang dikirim atau diubah.'));
  }

  function viewData(d) {
    const semua = d.baris;
    const n = K.hitung(semua);
    const tampil = K.saring(semua, st.f);
    const subs = [...new Set(semua.map((b) => b.subsektor))];
    const ubahF = (k, v) => { st.f[k] = v; render(); };

    const filter = h('section', { class: 'filter' },
      h('input', { type: 'search', name: 'cari', placeholder: 'Cari kegiatan / komoditas… (mis. padi, pompa)', value: st.f.cari,
        oninput: (e) => ubahF('cari', e.target.value) }),
      h('div', { class: 'filter-baris' },
        h('select', { name: 'subsektor', onchange: (e) => ubahF('subsektor', e.target.value) },
          h('option', { value: '' }, 'Semua subsektor'),
          subs.map((s) => h('option', { value: s, selected: st.f.subsektor === s }, s))),
        h('label', { class: 'cek' },
          h('input', { type: 'checkbox', checked: st.f.tampilKosong, onchange: (e) => ubahF('tampilKosong', e.target.checked) }),
          `Tampilkan tanpa kuota (${n.kosong})`)),
      h('div', { class: 'tab', role: 'tablist' },
        [['semua', `Semua (${n.semua - (st.f.tampilKosong ? 0 : n.kosong)})`], ['tersedia', `Masih ada sisa (${n.tersedia})`],
          ['habis', `Habis (${n.habis + n.lebih})`]].map(([k, l]) => h('button', {
          type: 'button', role: 'tab', 'aria-selected': String(st.f.status === k), class: st.f.status === k ? 'aktif' : '',
          onclick: () => ubahF('status', k),
        }, l))));

    // Kelompok per subsektor
    const grup = new Map();
    for (const b of tampil) {
      if (!grup.has(b.subsektor)) grup.set(b.subsektor, []);
      grup.get(b.subsektor).push(b);
    }
    const daftar = [...grup].map(([sub, isi]) => h('section', { class: 'grup' },
      h('div', { class: 'grup-judul' }, h('span', {}, sub), h('span', { class: 'jumlah' }, isi.length)),
      h('ul', { class: 'daftar' }, isi.map(kartu))));

    const waktu = d.waktu ? new Date(d.waktu) : null;
    return [
      h('p', { class: 'diperbarui' }, waktu
        ? `Data per ${waktu.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} pukul ${waktu.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}. Klik "Muat ulang data" untuk angka terbaru.`
        : ''),
      filter,
      d.galat && d.galat.length ? h('div', { class: 'peringatan-blok' }, '⚠ Sebagian gagal dibaca: ', d.galat.join('; ')) : null,
      tampil.length ? daftar : h('p', { class: 'kosong' }, 'Tidak ada kegiatan yang cocok dengan filter.'),
    ];
  }

  const NADA = { tersedia: 'hijau', habis: 'merah', lebih: 'merah', kosong: 'abu' };
  const LABEL = { tersedia: 'Masih ada sisa', habis: 'Kuota habis', lebih: 'Melebihi kuota', kosong: 'Tanpa kuota' };

  function kartu(b) {
    const buka = st.terbuka.has(b.id);
    const lebar = Math.min(100, Math.max(0, b.persen));
    return h('li', { class: `kartu ${NADA[b.status]}` },
      h('div', { class: 'kartu-kepala' },
        h('div', {},
          h('div', { class: 'nama' }, b.kegiatan),
          h('div', { class: 'meta' }, [b.komoditas, b.kewenangan && `Kewenangan ${b.kewenangan}`, b.tagging].filter(Boolean).join(' · '))),
        h('span', { class: `chip ${NADA[b.status]}` }, LABEL[b.status])),
      h('div', { class: 'angka' },
        h('div', {}, h('span', { class: 'angka-label' }, 'Rancangan Pusat'), h('b', {}, `${fmt(b.rancangan)} ${b.satuan}`)),
        h('div', { class: 'diajukan' }, h('span', { class: 'angka-label' }, 'Telah Diajukan'), h('b', {}, `${fmt(b.diajukan)} ${b.satuan}`)),
        h('div', { class: 'sisa' }, h('span', { class: 'angka-label' }, 'Sisa'), h('b', {}, `${fmt(b.sisa)} ${b.satuan}`))),
      b.rancangan > 0 && h('div', { class: 'bar kecil', title: `${b.persen}% terpakai` },
        h('div', { class: 'bar-isi', style: `width:${lebar}%` })),
      h('button', { type: 'button', class: 'rinci-tombol', 'aria-expanded': String(buka),
        onclick: () => { buka ? st.terbuka.delete(b.id) : st.terbuka.add(b.id); render(); } },
      buka ? '▾ Sembunyikan rincian' : `▸ Rincian${b.rancangan ? ` · ${b.persen}% terpakai` : ''}`),
      buka && h('dl', { class: 'rinci' },
        b.ro && [h('dt', {}, 'Rincian Output'), h('dd', {}, b.ro)],
        b.komponen && [h('dt', {}, 'Komponen'), h('dd', {}, b.komponen)],
        b.eselon && [h('dt', {}, 'Eselon I'), h('dd', {}, b.eselon)],
        b.unitcost > 0 && [h('dt', {}, 'Unit cost'), h('dd', {}, `Rp ${fmt(b.unitcost)} / ${b.satuan}`)],
        b.rincian.length > 0 && [h('dt', {}, 'Diajukan per kabupaten'),
          h('dd', {}, b.rincian.map((r) => `${r.kabupaten}: ${fmt(r.volume)} ${b.satuan}`).join('; '))],
        [h('dt', {}, 'ID kegiatan'), h('dd', {}, String(b.id))]),
      b.galat && h('div', { class: 'alasan' }, `Gagal membaca kuota: ${b.galat}`));
  }

  function viewAksi() {
    const tombol = [];
    if (sibuk()) {
      tombol.push(h('button', { class: 'kedua', type: 'button', disabled: st.berhenti, onclick: () => { st.berhenti = true; render(); } },
        st.berhenti ? 'Menghentikan…' : 'Hentikan'));
    } else {
      tombol.push(h('button', { class: 'utama', type: 'button', onclick: muat }, st.data ? '↻ Muat ulang data' : 'Ambil data kuota'));
      if (st.data && st.data.baris.length) tombol.push(h('button', { class: 'kedua', type: 'button', onclick: unduh }, 'Unduh Excel'));
    }
    return h('footer', { class: 'aksi' }, tombol,
      h('p', { class: 'aksi-ket' }, 'Hanya membaca data e-Banper dengan akun Anda. Alat bantu tidak resmi, bukan aplikasi Kementerian Pertanian.'));
  }

  function unduh() {
    const XLSX = window.XLSX;
    const d = st.data;
    const t = new Date(d.waktu || Date.now());
    const dua = (x) => String(x).padStart(2, '0');
    const tgl = `${t.getFullYear()}-${dua(t.getMonth() + 1)}-${dua(t.getDate())} ${dua(t.getHours())}.${dua(t.getMinutes())}`;
    const baris = K.saring(d.baris, { ...st.f, cari: '', status: 'semua', subsektor: '' });
    const aoa = [
      [`Kuota Program e-Banper — ${d.kabupaten || ''}${d.tahun ? ` — Tahun ${d.tahun}` : ''}`],
      [`Data per: ${tgl}`],
      [],
      ['No', 'Subsektor', 'Komoditas', 'Kegiatan', 'Rincian Output', 'Kewenangan', 'Satuan',
        'Rancangan Pusat', 'Telah Diajukan', 'Sisa', '% Terpakai', 'Status', 'ID Kegiatan'],
      ...baris.map((b, i) => [i + 1, b.subsektor, b.komoditas, b.kegiatan, b.ro, b.kewenangan, b.satuan,
        b.rancangan, b.diajukan, b.sisa, b.rancangan ? b.persen / 100 : '', LABEL[b.status], b.id]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 16 }, { wch: 40 }, { wch: 30 }, { wch: 15 }, { wch: 9 },
      { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 11 }, { wch: 15 }, { wch: 11 }];
    for (let r = 4; r < aoa.length; r++) {
      const c = ws[XLSX.utils.encode_cell({ r, c: 10 })];
      if (c && c.t === 'n') c.z = '0%';
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Kuota');
    XLSX.writeFile(wb, `Kuota e-Banper - ${(d.kabupaten || 'Kabupaten').replace(/[\\/:*?"<>|]/g, '')} - ${tgl}.xlsx`);
  }
})();
