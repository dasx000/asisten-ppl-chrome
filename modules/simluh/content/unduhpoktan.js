// ================= KARTU "DOWNLOAD POKTAN" DI HALAMAN LIST KELOMPOK TANI SIMLUH ================= \\
// Centang desa → unduh file "Cetak Excel" anggota (sama dengan tombol Cetak Excel di menu Tambah Anggota)
// untuk semua poktan di desa itu, lalu satukan dalam satu ZIP:  DESA/01 NAMA POKTAN.xls  (+ DAFTAR ISI.csv)
// Hanya membaca (GET). File berisi NIK: tidak disimpan di browser, hanya diberikan sebagai unduhan.
// Yang diingat (chrome.storage.local) hanya nama desa yang terakhir dicentang, per kecamatan.

(function () {
  'use strict';
  if (window.__asistenSimluhUnduhPoktan) return;
  window.__asistenSimluhUnduhPoktan = true;
  if (!/^\/listpoktan\/?$/i.test(location.pathname)) return;
  const tabelAsli = document.getElementById('tblPoktan');
  if (!tabelAsli) return;

  const U = window.SimluhUnduhPoktan, X = window.AsistenExcel;
  const PARALEL = 3;

  function h(tag, props, ...anak) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'checked') el.checked = !!v;
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of anak.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  class SesiHabis extends Error {
    constructor() { super('Sesi login SIMLUH habis. Login ulang, buka lagi List Kelompok Tani, lalu klik Mulai download.'); }
  }
  const halamanLogin = (teks) => /name=["']password["']/i.test(teks) && /name=["']username["']/i.test(teks);
  const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

  /** GET dengan sesi login; ulang 2x untuk error sementara (5xx / koneksi putus). */
  async function ambil(url) {
    const jeda = [3000, 8000];
    for (let i = 0; ; i++) {
      try {
        const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
        if (r.status >= 500) throw new TypeError(`server SIMLUH bermasalah (HTTP ${r.status})`);
        if (r.status >= 400) throw new Error(`ditolak server (HTTP ${r.status})`);
        return r;
      } catch (e) {
        if (!(e instanceof TypeError) || i >= jeda.length) throw e instanceof TypeError ? new Error(e.message || 'koneksi terputus') : e;
        await tidur(jeda[i]);
      }
    }
  }

  async function unduh(url) {
    const r = await ambil(url);
    const u8 = new Uint8Array(await r.arrayBuffer());
    if (!U.jenisExcel(u8)) {
      const teks = new TextDecoder().decode(u8.slice(0, 200000));
      if (halamanLogin(teks)) throw new SesiHabis();
    }
    return u8;
  }

  const st = { buka: false, dimuat: false, poktan: [], desa: [], kec: '', pilih: new Set(), cari: '', memuat: true, jalan: false, henti: false,
    p: null, hasil: null, galat: '', zip: null, namaZip: '' };
  const kunciSimpan = () => `simluh.unduhPoktan.desa.${new URLSearchParams(location.search).get('kode_kec') || st.kec || 'x'}`;

  // ─── Kerangka ──────────────────────────────────────────────────────────────
  const host = h('div', { id: 'asisten-simluh-unduhpoktan' });
  const akar = host.attachShadow({ mode: 'open' });
  akar.append(h('link', { rel: 'stylesheet', href: chrome.runtime.getURL('modules/simluh/content/unduhpoktan.css') }));
  const kartu = h('section', { class: 'kartu' });
  akar.append(kartu);
  const kartuTabel = tabelAsli.closest('.card');
  const baris = kartuTabel && kartuTabel.closest('.row');
  if (baris) baris.before(host);
  else if (kartuTabel) kartuTabel.before(host);
  else tabelAsli.before(host);

  window.Asisten.pantau('simluh', (nyala) => { host.style.display = nyala ? '' : 'none'; });
  window.addEventListener('beforeunload', (e) => { if (st.jalan) { e.preventDefault(); e.returnValue = ''; } });

  // ─── Baca daftar poktan (semua baris, bukan hanya halaman tabel yang tampil) ─
  async function muat() {
    try {
      const r = await ambil(location.href);
      const teks = await r.text();
      if (halamanLogin(teks)) throw new SesiHabis();
      const doc = new DOMParser().parseFromString(teks, 'text/html');
      st.poktan = U.uraiDaftar(doc);
      st.kec = U.namaKecamatan(doc) || U.namaKecamatan(document);
    } catch (e) {
      st.galat = e instanceof SesiHabis ? e.message : `Daftar poktan tidak terbaca: ${e.message}`;
    }
    if (!st.poktan.length && !st.galat) st.galat = 'Daftar poktan tidak terbaca. Muat ulang halaman ini.';
    st.desa = U.daftarDesa(st.poktan);
    try {
      const v = await chrome.storage.local.get(kunciSimpan());
      const ada = new Set(st.desa.map((d) => d.desa));
      for (const d of v[kunciSimpan()] || []) if (ada.has(d)) st.pilih.add(d);
    } catch (e) { /* abaikan */ }
    st.memuat = false;
    render();
  }
  function ingatPilihan() {
    try { chrome.storage.local.set({ [kunciSimpan()]: [...st.pilih] }); } catch (e) { /* abaikan */ }
  }
  function ubahPilih(fn) { fn(); ingatPilihan(); render(); }

  // ─── Tampilan ──────────────────────────────────────────────────────────────
  const mb = (b) => (b / 1048576).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' MB';
  const durasi = (ms) => { const d = Math.floor(ms / 1000); return d < 60 ? `${d} dtk` : `${Math.floor(d / 60)} mnt ${d % 60} dtk`; };

  function ringkasPilihan() {
    let pk = 0, ag = 0;
    for (const d of st.desa) if (st.pilih.has(d.desa)) { pk += d.poktan; ag += d.anggota; }
    return { pk, ag };
  }

  function render() {
    const p = st.p;
    const { pk, ag } = ringkasPilihan();
    const cari = st.cari.trim().toUpperCase();
    const tampil = st.desa.filter((d) => !cari || d.desa.includes(cari));
    const fokus = akar.activeElement && akar.activeElement.classList.contains('cari');
    kartu.classList.toggle('tutup', !st.buka);
    const kepala = h('button', { type: 'button', class: 'kepala', 'aria-expanded': st.buka ? 'true' : 'false', onclick: toggle },
      h('div', {},
        h('h3', {}, 'Download Poktan'),
        h('p', { class: 'sub' }, `Asisten PPL · Cetak Excel anggota per desa${st.kec ? ` · Kecamatan ${st.kec}` : ''}` +
          (!st.buka && st.jalan ? ' · sedang berjalan…' : ''))),
      h('span', { class: 'panah', 'aria-hidden': 'true' }, st.buka ? '▴' : '▾'));
    if (!st.buka) { kartu.replaceChildren(kepala); return; }
    kartu.replaceChildren(...[
      kepala,
      h('p', { class: 'ket' },
        'Centang desa, lalu klik ', h('b', {}, 'Mulai download'), '. File ', h('b', {}, 'Cetak Excel'),
        ' anggota setiap poktan di desa itu (sama dengan tombol di menu Tambah Anggota) diunduh dan disatukan dalam satu ZIP berisi folder ',
        h('b', {}, 'DESA / 01 NAMA POKTAN.xls'), '. Hanya membaca data, tidak mengubah apa pun.'),
      h('div', { class: 'baris-aksi kecil' },
        h('span', { class: 'label' }, `Desa (${st.pilih.size}/${st.desa.length})`),
        h('input', { type: 'search', class: 'cari', placeholder: 'Cari desa…', value: st.cari, disabled: st.jalan || st.memuat,
          oninput: (e) => { st.cari = e.target.value; render(); } }),
        h('button', { type: 'button', class: 'tautan', disabled: st.jalan, onclick: () => ubahPilih(() => tampil.forEach((d) => st.pilih.add(d.desa))) },
          cari ? 'Pilih hasil cari' : 'Pilih semua'),
        h('button', { type: 'button', class: 'tautan', disabled: st.jalan, onclick: () => ubahPilih(() => st.pilih.clear()) }, 'Kosongkan')),
      st.memuat ? h('p', { class: 'sub' }, 'Memuat daftar poktan…') :
      h('div', { class: 'desa' }, tampil.map((d) => h('label', { class: st.pilih.has(d.desa) ? 'dipilih' : '' },
        h('input', { type: 'checkbox', checked: st.pilih.has(d.desa), disabled: st.jalan,
          onchange: (e) => ubahPilih(() => (e.target.checked ? st.pilih.add(d.desa) : st.pilih.delete(d.desa))) }),
        h('span', { class: 'nama' }, d.desa),
        h('span', { class: 'jml' }, `${d.poktan} poktan`)))),
      !st.memuat && st.pilih.size > 0 && h('p', { class: 'sub ringkas' }, `Terpilih: ${pk} poktan · ${ag.toLocaleString('id-ID')} anggota`),
      p && h('div', { class: 'progres' + (st.jalan ? ' jalan' : '') },
        h('div', { class: 'bar' }, h('i', { style: `width:${p.total ? Math.round((p.selesai / p.total) * 100) : 0}%` })),
        h('div', { class: 'status' },
          st.jalan && h('span', { class: 'putar', 'aria-hidden': 'true' }),
          h('p', {}, teksProgres(p)),
          st.jalan && h('span', { class: 'waktu' }, `Berjalan ${durasi(Date.now() - st.mulaiPada)}`))),
      st.galat && h('p', { class: 'galat' }, st.galat),
      st.hasil && !st.jalan && h('p', { class: st.hasil.gagal || st.hasil.dihentikan ? 'peringatan' : 'ok' }, teksHasil()),
      h('div', { class: 'baris-aksi' },
        st.jalan
          ? h('button', { type: 'button', class: 'btn bahaya', disabled: st.henti, onclick: () => { st.henti = true; render(); } }, st.henti ? 'Menghentikan…' : 'Hentikan')
          : h('button', { type: 'button', class: 'btn utama', disabled: !st.pilih.size || st.memuat, onclick: mulai }, 'Mulai download'),
        st.zip && !st.jalan && h('button', { type: 'button', class: 'btn', onclick: simpan }, 'Download ZIP lagi')),
    ].filter((x) => x instanceof Node));
    if (fokus) { const c = akar.querySelector('.cari'); if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); } }
  }

  function teksProgres(p) {
    if (p.tahap === 'zip') return 'Menyusun ZIP…';
    const s = `${p.selesai}/${p.total} poktan · ${p.berkas} file (${mb(p.byte)})` + (p.gagal ? ` · ${p.gagal} gagal` : '');
    return p.tahap === 'selesai' ? `Selesai. ${s}` : `Mengunduh Cetak Excel… ${s}`;
  }
  function teksHasil() {
    const r = st.hasil;
    return `${r.dihentikan ? 'Dihentikan. ' : ''}${r.berkas} file disimpan dalam ${st.namaZip}` +
      (r.gagal ? ` · ${r.gagal} gagal (lihat kolom STATUS di DAFTAR ISI.csv), coba ulangi untuk desa terkait.` : '.');
  }

  // detak 1 detik: jam berjalan tetap bergerak walau progres diam
  let detak = null;
  function mulaiDetak() {
    clearInterval(detak);
    detak = setInterval(() => {
      if (!st.jalan) { clearInterval(detak); return; }
      const el = kartu.querySelector('.waktu');
      if (el) el.textContent = `Berjalan ${durasi(Date.now() - st.mulaiPada)}`;
    }, 1000);
  }

  // ─── Proses ────────────────────────────────────────────────────────────────
  async function mulai() {
    Object.assign(st, { jalan: true, henti: false, galat: '', hasil: null, zip: null, mulaiPada: Date.now(), p: { tahap: 'unduh', selesai: 0, total: 0, berkas: 0, byte: 0, gagal: 0 } });
    mulaiDetak();
    render();
    try {
      const desa = st.desa.map((d) => d.desa).filter((d) => st.pilih.has(d));
      const r = await U.jalankan({
        poktan: st.poktan, desa, unduh, paralel: PARALEL,
        onProgres: (p) => { st.p = { ...p }; render(); },
        henti: () => st.henti,
        galatFatal: (e) => e instanceof SesiHabis,
      });
      st.p = { ...st.p, tahap: 'zip' }; render();
      await tidur(30);
      st.zip = X.zip([...r.berkas, ['DAFTAR ISI.csv', U.daftarIsi(r.log)]]);
      st.namaZip = U.namaZip(st.kec, desa);
      st.hasil = { berkas: r.berkas.length, gagal: r.log.filter((x) => x.status.startsWith('GAGAL')).length, dihentikan: r.dihentikan };
      st.p = { ...st.p, tahap: 'selesai' };
      if (r.berkas.length || r.log.length) simpan();
    } catch (e) {
      console.error('[Asisten SIMLUH] Download Poktan', e);
      st.galat = e instanceof SesiHabis ? e.message : `Terjadi kesalahan: ${e.message}`;
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

  // Bawaan tertutup; daftar poktan baru dibaca saat kartu pertama kali dibuka
  function toggle() {
    st.buka = !st.buka;
    if (st.buka && !st.dimuat) { st.dimuat = true; muat(); }
    render();
  }

  render();
})();
