// ================= DASHBOARD HOME SIMLUHTAN: REKAP LUAS LAHAN PER KOMODITAS ================= \\
// Muncul di halaman Home (Admin BPP) yang aslinya kosong. Data dibaca (GET) dari menu Kelompok Tani → daftar
// anggota tiap poktan saat tombol "Muat rekap" diklik. Hanya angka rekap yang disimpan di memori; nama/NIK tidak.

(function () {
  'use strict';
  if (window.__asistenSimluhDashboard) return;
  window.__asistenSimluhDashboard = true;
  if (!/^\/(home)?\/?$/.test(location.pathname)) return;
  const menuPoktan = document.querySelector('a[href*="/kelompoktanikec"]');
  if (!menuPoktan) return;

  const S = window.SimluhDashboard;
  const PARALEL = 3;

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

  const st = { tahap: 'awal', data: [], desa: '', p: null, galat: '', waktu: null, selisih: 0, henti: false };

  // ─── Kerangka ──────────────────────────────────────────────────────────────
  const host = h('div', { id: 'asisten-simluh-dashboard' });
  const akar = host.attachShadow({ mode: 'open' });
  akar.append(h('link', { rel: 'stylesheet', href: chrome.runtime.getURL('modules/simluh/content/dashboard.css') }));
  const kartu = h('section', { class: 'kartu' });
  akar.append(kartu);
  const sambutan = [...document.querySelectorAll('.panel.panel-primary, .panel')].find((p) => /Selamat Datang/i.test(p.textContent));
  if (sambutan) sambutan.after(host);
  else (document.querySelector('main .container-fluid') || document.querySelector('main') || document.body).prepend(host);

  window.Asisten.pantau('simluh', (nyala) => { host.style.display = nyala ? '' : 'none'; });

  // ─── Baca data ─────────────────────────────────────────────────────────────
  class SesiHabis extends Error {}
  async function ambilDoc(url) {
    for (let i = 0; ; i++) {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 45000);
      try {
        const r = await fetch(url, { credentials: 'include', cache: 'no-store', signal: ac.signal });
        const teks = await r.text();
        if (r.status >= 500 || r.status === 429) throw new Error(`HTTP ${r.status}`);
        const doc = new DOMParser().parseFromString(teks, 'text/html');
        // Halaman login: diarahkan ke /login, atau tanpa menu samping & ada kolom kata sandi.
        // (Setiap halaman SIMLUHTAN punya kolom "updatepassword" di menu akun, jadi itu bukan tanda sesi habis.)
        const keLogin = /login|signin|auth/i.test(new URL(r.url || url, location.origin).pathname);
        const formLogin = !doc.querySelector('a[href*="kelompoktanikec"]') && doc.querySelector('input[type="password"]:not([name="updatepassword"])');
        if (keLogin || formLogin) throw new SesiHabis('Sesi login SIMLUHTAN habis. Login ulang lalu klik Muat rekap.');
        return doc;
      } catch (e) {
        if (e instanceof SesiHabis || i >= 2) throw e;
        await new Promise((ok) => setTimeout(ok, (i + 1) * 3000));
      } finally {
        clearTimeout(t);
      }
    }
  }
  const sel = (tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent);
  const judul = (doc) => [...doc.querySelectorAll('thead th, table tr:first-child th')].map((th) => th.textContent);

  async function daftarPoktan() {
    const kec = await ambilDoc(menuPoktan.href);
    const tautan = [...kec.querySelectorAll('tbody a[href*="listpoktan"]')].map((a) => new URL(a.getAttribute('href'), location.origin).href);
    const hasil = [];
    for (const u of tautan) {
      const doc = await ambilDoc(u);
      const j = judul(doc).map((x) => x.replace(/\s+/g, '').toLowerCase());
      const iNama = j.indexOf('namapoktan'), iDesa = j.indexOf('namadesa'), iJml = j.indexOf('jumlahanggota');
      for (const tr of doc.querySelectorAll('tbody tr')) {
        const a = [...tr.querySelectorAll('a')].find((x) => /anggota/i.test(x.textContent) && /listpoktananggota/.test(x.getAttribute('href') || ''));
        if (!a) continue;
        const c = sel(tr);
        hasil.push({ poktan: (c[iNama] || '').replace(/\s+/g, ' ').trim(), desa: (c[iDesa] || '').replace(/\s+/g, ' ').trim().toUpperCase(),
          jumlah: parseInt(c[iJml], 10) || 0, url: new URL(a.getAttribute('href'), location.origin).href });
      }
    }
    return hasil;
  }

  async function muat() {
    Object.assign(st, { tahap: 'memuat', galat: '', henti: false, p: { n: 0, total: 0 }, mulai: Date.now() });
    render();
    try {
      const pk = await daftarPoktan();
      st.p.total = pk.length; render();
      const data = [];
      let i = 0, selisih = 0;
      await Promise.all(Array.from({ length: PARALEL }, async () => {
        while (i < pk.length && !st.henti) {
          const p = pk[i++];
          const doc = await ambilDoc(p.url);
          const anggota = S.uraiAnggota(judul(doc), [...doc.querySelectorAll('tbody tr')].map(sel));
          if (p.jumlah && anggota.length !== p.jumlah) selisih++;
          data.push({ desa: p.desa, poktan: p.poktan, anggota });
          st.p.n++; render();
        }
      }));
      Object.assign(st, { data, selisih, waktu: new Date(), tahap: 'siap', dihentikan: st.henti });
      if (st.desa && !data.some((p) => p.desa === st.desa)) st.desa = '';
    } catch (e) {
      console.error('[Asisten SIMLUH]', e);
      st.galat = e instanceof SesiHabis ? e.message : `Gagal membaca data: ${e.message}`;
      st.tahap = st.data.length ? 'siap' : 'awal';
    }
    render();
  }

  // ─── Tampilan ──────────────────────────────────────────────────────────────
  const fmt = (n, d = 2) => Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt0 = (n) => Number(n || 0).toLocaleString('id-ID');

  function render() {
    const isi = [h('div', { class: 'kepala' },
      h('div', {},
        h('h3', {}, 'Rekap Luas Lahan per Komoditas'),
        h('p', { class: 'sub' }, 'Asisten PPL · dari data anggota kelompok tani SIMLUHTAN' +
          (st.waktu ? ` · dibaca ${st.waktu.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : ''))),
      st.tahap !== 'memuat'
        ? h('button', { type: 'button', class: 'btn utama', onclick: muat }, st.data.length ? 'Muat ulang' : 'Muat rekap')
        : h('button', { type: 'button', class: 'btn', disabled: st.henti, onclick: () => { st.henti = true; render(); } }, st.henti ? 'Menghentikan…' : 'Hentikan'))];

    if (st.tahap === 'memuat') {
      const pct = st.p.total ? Math.round((st.p.n / st.p.total) * 100) : 3;
      const dtk = Math.floor((Date.now() - st.mulai) / 1000);
      isi.push(h('div', { class: 'progres' },
        h('div', { class: 'bar' }, h('i', { style: `width:${pct}%` })),
        h('div', { class: 'status' }, h('span', { class: 'putar', 'aria-hidden': 'true' }),
          h('span', {}, st.p.total ? `Membaca anggota poktan ${st.p.n}/${st.p.total}…` : 'Membaca daftar kelompok tani…'),
          h('span', { class: 'redup' }, `${dtk} dtk`))));
    }
    if (st.galat) isi.push(h('p', { class: 'galat' }, st.galat));
    if (st.tahap === 'awal' && !st.galat) {
      isi.push(h('p', { class: 'ket' }, 'Klik ', h('b', {}, 'Muat rekap'), ' untuk membaca data anggota semua kelompok tani ' +
        '(±1 menit). Luas dihitung dari kolom Komoditas yang Diusahakan 1–3 beserta volumenya; ternak dihitung terpisah dalam ekor.'));
    }
    if (st.data.length && st.tahap !== 'memuat') isi.push(...viewRekap());
    kartu.replaceChildren(...isi);
  }

  function viewRekap() {
    const r = S.rekap(st.data, { desa: st.desa });
    const maks = Math.max(...r.tanaman.map((x) => x.luas), 0.0001);
    const komKolom = S.rekap(st.data, { desa: st.desa }).tanaman.slice(0, 5).map((x) => x.komoditas);
    const lainnya = (d) => Object.entries(d.perKomoditas).filter(([k]) => !komKolom.includes(k)).reduce((s, [, v]) => s + v, 0);
    return [
      h('div', { class: 'filter' },
        h('label', {}, 'Desa',
          h('select', { onchange: (e) => { st.desa = e.target.value; render(); } },
            h('option', { value: '' }, `Semua desa (${r.daftarDesa.length})`),
            r.daftarDesa.map((d) => { const o = h('option', { value: d }, d); if (d === st.desa) o.selected = true; return o; })))),
      h('div', { class: 'angka' },
        h('div', {}, h('b', {}, fmt(r.totalLuas)), h('span', {}, 'ha luas lahan tanaman')),
        h('div', {}, h('b', {}, fmt0(r.tanaman.length)), h('span', {}, 'komoditas tanaman')),
        h('div', {}, h('b', {}, fmt0(r.anggotaTanaman)), h('span', {}, `petani bertanaman dari ${fmt0(r.anggota)} anggota`)),
        h('div', {}, h('b', {}, fmt0(r.poktan)), h('span', {}, 'kelompok tani'))),
      h('div', { class: 'dua' },
        h('div', { class: 'blok' },
          h('h4', {}, 'Luas lahan per komoditas (ha)'),
          !r.tanaman.length ? h('p', { class: 'redup' }, 'Tidak ada data tanaman.') :
          h('div', { class: 'batang', role: 'img', 'aria-label': 'Grafik luas lahan per komoditas' },
            r.tanaman.map((x) => h('div', { class: 'baris-batang', title: `${x.komoditas}: ${fmt(x.luas)} ha · ${fmt0(x.petani)} petani` },
              h('span', { class: 'nama' }, x.komoditas),
              h('span', { class: 'jalur' }, h('i', { style: `width:${Math.max(0.5, (x.luas / maks) * 100)}%` })),
              h('span', { class: 'nilai' }, fmt(x.luas)))))),
        h('div', { class: 'blok' },
          h('h4', {}, 'Rincian per komoditas'),
          h('table', {},
            h('thead', {}, h('tr', {}, ['Komoditas', 'Petani', 'Luas (ha)', 'Rata-rata (ha/petani)', '% luas'].map((t) => h('th', {}, t)))),
            h('tbody', {}, r.tanaman.map((x) => h('tr', {},
              h('td', {}, x.komoditas), h('td', { class: 'kanan' }, fmt0(x.petani)), h('td', { class: 'kanan' }, fmt(x.luas)),
              h('td', { class: 'kanan' }, fmt(x.rata)), h('td', { class: 'kanan' }, r.totalLuas ? fmt((x.luas / r.totalLuas) * 100, 1) + '%' : '-')))),
            h('tfoot', {}, h('tr', {}, h('td', {}, 'Total'), h('td', { class: 'kanan' }, fmt0(r.anggotaTanaman)),
              h('td', { class: 'kanan' }, fmt(r.totalLuas)), h('td', {}), h('td', { class: 'kanan' }, '100%')))),
          r.ternak.length ? [
            h('h4', { class: 'jarak' }, 'Ternak (ekor)'),
            h('table', {},
              h('thead', {}, h('tr', {}, ['Ternak', 'Peternak', 'Jumlah (ekor)'].map((t) => h('th', {}, t)))),
              h('tbody', {}, r.ternak.map((x) => h('tr', {}, h('td', {}, x.komoditas), h('td', { class: 'kanan' }, fmt0(x.petani)),
                h('td', { class: 'kanan' }, fmt0(x.ekor))))))] : null)),
      h('div', { class: 'blok' },
        h('h4', {}, 'Rincian per desa (luas lahan, ha)'),
        h('div', { class: 'gulir' }, h('table', {},
          h('thead', {}, h('tr', {}, ['Desa', 'Poktan', 'Anggota', ...komKolom, 'Lainnya', 'Total'].map((t) => h('th', {}, t)))),
          h('tbody', {}, r.perDesa.map((d) => h('tr', {},
            h('td', {}, d.desa), h('td', { class: 'kanan' }, fmt0(d.poktan)), h('td', { class: 'kanan' }, fmt0(d.anggota)),
            komKolom.map((k) => h('td', { class: 'kanan' }, d.perKomoditas[k] ? fmt(d.perKomoditas[k]) : '–')),
            h('td', { class: 'kanan' }, lainnya(d) ? fmt(lainnya(d)) : '–'), h('td', { class: 'kanan tebal' }, fmt(d.luas)))))))),
      h('p', { class: 'catatan' },
        'Luas = jumlah Volume (ha) pada Komoditas yang Diusahakan 1–3 milik tiap anggota. Petani dihitung sekali per komoditas. ' +
        'Ternak dihitung dalam ekor dan tidak masuk luas.' +
        (st.selisih ? ` ${st.selisih} poktan jumlah anggotanya berbeda dengan angka di daftar Kelompok Tani.` : '') +
        (st.dihentikan ? ' Pembacaan dihentikan sebelum selesai, jadi angka belum lengkap.' : '') +
        ' Alat bantu tidak resmi.'),
    ];
  }

  setInterval(() => { if (st.tahap === 'memuat') render(); }, 1000);
  render();
})();
