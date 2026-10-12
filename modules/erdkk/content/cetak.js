// ================= KARTU "UNDUH SEMUA PDF" DI HALAMAN CETAK DATA e-RDKK ================= \\
// Hanya muncul di menu Cetak Data. Mengunduh PDF bawaan e-RDKK (sama dengan tombol Cetak Data) untuk
// padi, jagung, dan kopi semua poktan & kios di desa terpilih, lalu menyatukannya dalam satu ZIP:
//   KECAMATAN/DESA/POKTAN/KOMODITAS - POKTAN - KIOS.pdf  (+ DAFTAR ISI.csv)
// Hanya membaca (GET). PDF berisi NIK: tidak disimpan di browser, hanya diberikan sebagai unduhan.

(function () {
  'use strict';
  if (window.__asistenErdkkCetak) return;
  window.__asistenErdkkCetak = true;
  if (!/\/cetak\/?$/.test(location.pathname)) return;
  const pilihDesa = document.getElementById('desa');
  if (!pilihDesa) return;

  const API = window.ErdkkApi, C = window.ErdkkCetakPdf, X = window.AsistenExcel;

  function h(tag, props, ...anak) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of anak.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  // Tahun aktif dari label menu samping (mis. "2026")
  function tahunAktif() {
    for (const el of document.querySelectorAll('aside *, #kt_app_sidebar *, .app-sidebar *')) {
      if (!el.childElementCount && /^20\d\d$/.test(el.textContent.trim())) return el.textContent.trim();
    }
    return '';
  }

  // Desa & kecamatan dari Master Data → Wilayah (dropdown "Pilih Desa" bawaan baru terisi belakangan);
  // cadangan: isi dropdown bawaan ("1808022008 - KOTAWAY") saat itu.
  let daftarDesa = [];
  function desaDariDropdown() {
    return [...pilihDesa.options]
      .map((o) => ({ kode: o.value, nama: o.text.replace(/^\s*\d+\s*-\s*/, '').trim(), kecamatan: '' }))
      .filter((d) => /^\d{10}$/.test(d.kode));
  }
  async function muatDesa() {
    let daftar = [];
    try {
      const w = await API.ambilJson('/api/wilayah?draw=1&start=0&length=-1');
      daftar = ((w && w.data) || []).filter((x) => /^\d{10}$/.test(String(x.sub_district_code || '')))
        .map((x) => ({ kode: String(x.sub_district_code), nama: String(x.sub_district || '').trim(), kecamatan: String(x.district || '').trim() }));
    } catch (e) {
      if (e instanceof API.SesiHabis) st.galat = 'Sesi login e-RDKK habis. Login ulang lalu muat ulang halaman ini.';
    }
    if (!daftar.length) daftar = desaDariDropdown();
    const unik = new Map(daftar.map((d) => [d.kode, d]));
    daftarDesa = [...unik.values()].sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
    st.pilih = new Set(daftarDesa.map((d) => d.kode));
    st.memuatDesa = false;
    render();
  }

  const st = { pilih: new Set(), memuatDesa: true, jalan: false, henti: false, p: null, hasil: null, galat: '', zip: null, namaZip: '' };

  const host = h('div', { id: 'asisten-erdkk-cetak' });
  const akar = host.attachShadow({ mode: 'open' });
  akar.append(h('link', { rel: 'stylesheet', href: chrome.runtime.getURL('modules/erdkk/content/cetak.css') }));
  const kartu = h('section', { class: 'kartu' });
  akar.append(kartu);
  const tempat = document.getElementById('downloadBtnContainer');
  const kartuAsli = tempat && tempat.closest('.card');
  if (kartuAsli && kartuAsli.parentElement) kartuAsli.after(host);
  else (document.querySelector('#kt_app_content_container, .app-content, main') || document.body).append(host);

  window.Asisten.pantau('erdkk', (nyala) => { host.style.display = nyala ? '' : 'none'; });
  window.addEventListener('beforeunload', (e) => { if (st.jalan) { e.preventDefault(); e.returnValue = ''; } });

  const mb = (b) => (b / 1048576).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' MB';

  function render() {
    const tahun = tahunAktif();
    const p = st.p;
    kartu.replaceChildren(...[
      h('div', { class: 'kepala' },
        h('div', {},
          h('h3', {}, 'Unduh Semua PDF (ZIP)'),
          h('p', { class: 'sub' }, `Asisten PPL · Padi, Jagung, Kopi${tahun ? ` · e-RDKK ${tahun}` : ''}`))),
      h('p', { class: 'ket' },
        'Mengunduh PDF Cetak Data untuk semua kelompok tani dan kios di desa yang dicentang, lalu disatukan dalam satu ZIP berisi folder ',
        h('b', {}, 'Kecamatan / Desa / Poktan'), ' dengan nama berkas ', h('b', {}, 'KOMODITAS - POKTAN - KIOS.pdf'),
        '. Kombinasi tanpa data dilewati. Hanya membaca data, tidak mengubah apa pun.'),
      h('div', { class: 'baris-aksi kecil' },
        h('span', { class: 'label' }, `Desa (${st.pilih.size}/${daftarDesa.length})`),
        h('button', { type: 'button', class: 'tautan', disabled: st.jalan, onclick: () => { daftarDesa.forEach((d) => st.pilih.add(d.kode)); render(); } }, 'Pilih semua'),
        h('button', { type: 'button', class: 'tautan', disabled: st.jalan, onclick: () => { st.pilih.clear(); render(); } }, 'Kosongkan')),
      st.memuatDesa ? h('p', { class: 'sub' }, 'Memuat daftar desa…') :
      !daftarDesa.length ? h('p', { class: 'galat' }, 'Daftar desa tidak terbaca. Muat ulang halaman Cetak Data.') :
      h('div', { class: 'desa' }, daftarDesa.map((d) => h('label', { class: st.pilih.has(d.kode) ? 'dipilih' : '' },
        h('input', { type: 'checkbox', checked: st.pilih.has(d.kode), disabled: st.jalan,
          onchange: (e) => { e.target.checked ? st.pilih.add(d.kode) : st.pilih.delete(d.kode); render(); } }),
        d.nama))),
      p && h('div', { class: 'progres' },
        h('div', { class: 'bar' }, h('i', { style: `width:${persen(p)}%` })),
        h('p', {}, teksProgres(p))),
      st.galat && h('p', { class: 'galat' }, st.galat),
      st.hasil && !st.jalan && h('p', { class: st.hasil.gagal ? 'peringatan' : 'ok' }, teksHasil()),
      st.rekap && !st.jalan && viewRekap(st.rekap),
      h('div', { class: 'baris-aksi' },
        st.jalan
          ? h('button', { type: 'button', class: 'btn bahaya', disabled: st.henti, onclick: () => { st.henti = true; render(); } }, st.henti ? 'Menghentikan…' : 'Hentikan')
          : h('button', { type: 'button', class: 'btn utama', disabled: !st.pilih.size || st.memuatDesa, onclick: mulai }, 'Mulai unduh'),
        st.zip && !st.jalan && h('button', { type: 'button', class: 'btn', onclick: () => simpan() }, 'Unduh ZIP lagi')),
    ].filter((x) => x instanceof Node));
  }

  function viewRekap(r) {
    const pct = r.terdaftar ? Math.round((r.ada / r.terdaftar) * 100) : 0;
    return h('div', { class: 'rekap' },
      h('div', { class: 'angka' },
        h('div', {}, h('b', {}, `${r.ada} / ${r.terdaftar}`), h('span', {}, `kelompok tani sudah punya RDKK (${pct}%)`)),
        h('div', {}, h('b', { class: r.belum ? 'merah' : '' }, r.belum), h('span', {}, 'belum ada RDKK padi/jagung/kopi')),
        r.kwt.terdaftar ? h('div', {}, h('b', {}, `${r.kwt.ada} / ${r.kwt.terdaftar}`), h('span', {}, 'di antaranya KWT')) : null),
      h('p', { class: 'sub' }, 'Total = kelompok tani di Master Data → Kelompok Tani untuk desa yang dicentang. ' +
        'Daftar lengkap (ada/belum) ada di REKAP POKTAN.csv dalam ZIP.' +
        (r.diluarMaster ? ` ${r.diluarMaster} poktan punya RDKK tapi namanya tidak ditemukan di master (ditandai di CSV).` : '')));
  }

  function persen(p) {
    if (p.tahap === 'daftar') return p.desaTotal ? Math.round((p.desaSelesai / p.desaTotal) * 10) : 0;
    if (p.tahap === 'unduh') return 10 + (p.totalCek ? Math.round((p.dicek / p.totalCek) * 88) : 0);
    return 100;
  }
  function teksProgres(p) {
    if (p.tahap === 'daftar') return `Membaca kelompok tani & kios… ${p.desaSelesai}/${p.desaTotal} desa`;
    if (p.tahap === 'zip') return 'Menyusun ZIP…';
    const s = `Dicek ${p.dicek}/${p.totalCek} kombinasi poktan × komoditas × kios · ${p.pdf} PDF (${mb(p.byte)})` + (p.gagal ? ` · ${p.gagal} gagal` : '');
    return p.tahap === 'selesai' ? `Selesai. ${s}` : s;
  }
  function teksHasil() {
    const r = st.hasil;
    return `${r.dihentikan ? 'Dihentikan. ' : ''}${r.pdf} PDF disimpan dalam ${st.namaZip}` +
      (r.gagal ? ` · ${r.gagal} gagal (lihat kolom STATUS di DAFTAR ISI.csv), coba ulangi untuk desa terkait.` : '.');
  }

  async function mulai() {
    const tahun = tahunAktif();
    Object.assign(st, { jalan: true, henti: false, galat: '', hasil: null, zip: null, rekap: null, p: { tahap: 'daftar', desaSelesai: 0, desaTotal: st.pilih.size } });
    render();
    try {
      const desa = daftarDesa.filter((d) => st.pilih.has(d.kode))
        .map((d) => ({ ...d, kecamatan: d.kecamatan || `KECAMATAN ${d.kode.slice(0, 6)}` }));
      const r = await C.jalankan({ desa, onProgres: (p) => { st.p = { ...p }; render(); }, henti: () => st.henti });
      st.p = { ...st.p, tahap: 'zip' }; render();
      await new Promise((ok) => setTimeout(ok, 30));
      let master = [];
      try {
        const m = await API.ambilJson('/api/poktan?draw=1&start=0&length=-1');
        master = Array.isArray(m) ? m : (m && m.data) || [];
      } catch (e) { if (e instanceof API.SesiHabis) throw e; }
      st.rekap = master.length ? C.rekapPoktan(master, desa.map((d) => d.nama), r.log) : null;
      const isi = [...r.berkas, ['DAFTAR ISI.csv', C.daftarIsi(r.log)]];
      if (st.rekap) isi.push(['REKAP POKTAN.csv', C.csvPoktan(st.rekap)]);
      const kecs = [...new Set(desa.map((d) => d.kecamatan))];
      st.zip = X.zip(isi);
      st.namaZip = `RDKK ${tahun || ''} - ${kecs.length === 1 ? C.bersih(kecs[0]) : 'Beberapa Kecamatan'} - PDF Padi Jagung Kopi.zip`.replace(/\s+/g, ' ');
      st.hasil = { pdf: r.berkas.length, gagal: r.log.filter((x) => x.status !== 'OK').length, dihentikan: r.dihentikan };
      st.p = { ...st.p, tahap: 'selesai' };
      if (r.berkas.length || r.log.length) simpan();
    } catch (e) {
      console.error('[Asisten e-RDKK]', e);
      st.galat = e instanceof API.SesiHabis ? 'Sesi login e-RDKK habis. Login ulang lalu klik Mulai unduh lagi.' : `Terjadi kesalahan: ${e.message}`;
    }
    st.jalan = false;
    render();
  }

  function simpan() {
    if (!st.zip) return;
    const url = URL.createObjectURL(new Blob([st.zip], { type: 'application/zip' }));
    const a = h('a', { href: url, download: st.namaZip });
    akar.append(a);
    a.click(); // klik di dalam Shadow DOM, tidak tertangkap skrip halaman
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  render();
  muatDesa();
})();
