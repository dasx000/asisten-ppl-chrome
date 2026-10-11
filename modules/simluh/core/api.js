// ================= AKSES SIMLUH DARI HALAMAN (SESI LOGIN PENGGUNA) ================= \\
// Padanan fungsi jaringan scripts/run_simluh.py, tapi memakai cookie login browser.
// Content script ekstensi tidak ikut disisipi token CSRF oleh csrf-guard SIMLUH,
// jadi token dipasang sendiri di body (csrf_token_name) + header X-CSRF-TOKEN.

(function (root) {
  'use strict';

  const BASE_URL = 'https://simluh.pertanian.go.id';
  const ANGGOTA_URL = `${BASE_URL}/KelembagaanPelakuUtama/KelompokTani/ListPoktanAnggota`;
  const CSRF_FIELD = 'csrf_token_name';
  const CSRF_COOKIE = 'csrf_cookie_name';
  const JEDA_ULANG = [5, 15]; // detik tunggu sebelum percobaan ke-2 dan ke-3

  /** Error sementara dari server (5xx / koneksi putus) → layak dicoba ulang. */
  class ServerSibuk extends Error {}
  /** Sesi login SIMLUH habis → pengguna harus login ulang. */
  class SesiHabis extends Error {
    constructor() {
      super('Sesi login SIMLUH habis. Login ulang di tab ini, buka lagi halaman anggota poktan, lalu ulangi.');
    }
  }

  const tidur = (detik) => new Promise((r) => setTimeout(r, detik * 1000));

  let tokenHalaman = ''; // dari <meta name="csrf-token"> halaman yang terakhir diambil

  function bacaCookie(nama) {
    const bagian = ('; ' + document.cookie).split('; ' + nama + '=');
    return bagian.length === 2 ? decodeURIComponent(bagian.pop().split(';').shift()) : '';
  }

  /** Token CSRF terbaru: cookie (ikut diperbarui server tiap respons), cadangan meta halaman. */
  function token() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return bacaCookie(CSRF_COOKIE) || tokenHalaman || (meta && meta.getAttribute('content')) || '';
  }

  /** Halaman login yang muncul karena sesi habis (redirect ke beranda / form password). */
  const halamanLogin = (teks) => /name=["']password["']/i.test(teks) && /name=["']username["']/i.test(teks);

  /**
   * fetch dengan ulang otomatis untuk error sementara. Return Response (status < 500).
   * ulang=false untuk request yang tidak aman diulang (simpan anggota baru → bisa dobel).
   */
  async function ambil(url, opsi = {}, label = 'SIMLUH', ulang = true) {
    for (let i = 0; ; i++) {
      try {
        const r = await fetch(url, { credentials: 'include', cache: 'no-store', ...opsi });
        if (r.status >= 500) throw new ServerSibuk(`server SIMLUH sedang bermasalah (HTTP ${r.status})`);
        return r;
      } catch (e) {
        const sementara = e instanceof ServerSibuk || e instanceof TypeError; // TypeError = koneksi putus
        if (!sementara) throw e;
        const pesan = e instanceof ServerSibuk ? e.message : 'koneksi ke SIMLUH terputus';
        if (!ulang) throw new ServerSibuk(pesan);
        if (i >= JEDA_ULANG.length) throw new ServerSibuk(`${pesan}, sudah dicoba ${i + 1}x. Coba lagi nanti`);
        console.warn(`[Asisten SIMLUH] ${label}: ${pesan}, coba lagi ${JEDA_ULANG[i]} detik lagi`);
        await tidur(JEDA_ULANG[i]);
      }
    }
  }

  async function bacaJson(r) {
    const teks = await r.text();
    if (halamanLogin(teks)) throw new SesiHabis();
    try {
      return JSON.parse(teks);
    } catch (e) {
      const isi = new DOMParser().parseFromString(teks, 'text/html').body.textContent || teks;
      throw new Error(`Respons server tidak dikenali: ${isi.replace(/\s+/g, ' ').trim().slice(0, 120)}`);
    }
  }

  // ─── Halaman anggota poktan ────────────────────────────────────────────────

  /**
   * Ambil & urai halaman daftar anggota poktan (default: halaman yang sedang dibuka).
   * Return { url, idPoktan, namaPoktan, wilayah, komoditas: Map, anggota: [{id_anggota, nama, nik, no_hp}] }
   */
  async function ambilHalaman(url = location.href) {
    const r = await ambil(url, {}, 'Halaman anggota');
    const teks = await r.text();
    if (halamanLogin(teks)) throw new SesiHabis();
    return uraiHalaman(new DOMParser().parseFromString(teks, 'text/html'), url);
  }

  function uraiHalaman(doc, url) {
    const nilai = (id) => ((doc.getElementById(id) || {}).value || '').trim();
    const idPoktan = nilai('id_poktan');
    const pilihan = doc.getElementById('kode_komoditas');
    if (!idPoktan || !pilihan) throw new Error('Halaman ini bukan daftar anggota poktan SIMLUH.');
    const meta = doc.querySelector('meta[name="csrf-token"]');
    if (meta && meta.getAttribute('content')) tokenHalaman = meta.getAttribute('content');

    const wilayah = {};
    for (const k of ['kode_prop', 'kode_kab', 'kode_kec', 'kode_desa', 'id_poktan']) wilayah[k] = nilai(k);
    const komoditas = new Map();
    for (const o of pilihan.querySelectorAll('option')) {
      if (o.value) komoditas.set(o.value, o.textContent.trim());
    }
    const judul = (doc.querySelector('h3') || {}).textContent || '';
    const namaPoktan = judul.replace(/\s+/g, ' ').replace(/^\s*Daftar Anggota Kelompok Tani\s*/i, '').trim();

    const tabel = doc.getElementById('tbllistanggota') || doc.querySelector('table');
    const anggota = [];
    for (const tr of tabel ? tabel.querySelectorAll('tr') : []) {
      const btn = tr.querySelector('[id="btnEditAnggota"]');
      const td = tr.querySelectorAll('td');
      if (!btn || td.length < 8) continue;
      anggota.push({
        id_anggota: btn.getAttribute('data-id_anggota'),
        nama: td[2].textContent.trim(),
        nik: td[3].textContent.trim(),
        no_hp: td[7].textContent.trim(),
      });
    }
    return { url, idPoktan, namaPoktan, wilayah, komoditas, anggota };
  }

  // ─── Data satu anggota ─────────────────────────────────────────────────────

  async function getAnggota(idAnggota) {
    const r = await ambil(`${ANGGOTA_URL}/edit/${encodeURIComponent(idAnggota)}`, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    }, `Baca anggota ${idAnggota}`);
    if (r.status >= 400) throw new Error(`Gagal membaca data anggota (HTTP ${r.status})`);
    const data = await bacaJson(r);
    if (!data || !data.id_anggota) throw new Error(`Anggota ${idAnggota} tidak ditemukan`);
    return data;
  }

  /** POST dengan token CSRF. Kalau ditolak 403 (token kedaluwarsa), segarkan token dari halaman lalu coba sekali lagi. */
  async function postCsrf(url, buatBody, label, bolehUlang = true) {
    for (let ulang = 0; ; ulang++) {
      const t = token();
      const r = await ambil(url, {
        method: 'POST',
        body: buatBody(t),
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-TOKEN': t },
      }, label, bolehUlang);
      if (r.status === 403 && ulang === 0) { // 403 = ditolak sebelum diproses, aman dikirim ulang
        await ambilHalaman().catch(() => {});
        continue;
      }
      if (r.status >= 400) throw new Error(`Permintaan ditolak server (HTTP ${r.status})`);
      return r;
    }
  }

  /** Kirim form update (multipart, seperti FormData di halaman SIMLUH). */
  async function updateAnggota(payload) {
    const r = await postCsrf(`${ANGGOTA_URL}/update/${encodeURIComponent(payload.id_anggota)}`, (t) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(payload)) fd.append(k, v);
      fd.append(CSRF_FIELD, t);
      return fd;
    }, `Update ${payload.id_anggota}`);
    const teks = await r.text();
    if (halamanLogin(teks)) throw new SesiHabis();
    return teks;
  }

  /** POST form biasa (seperti jQuery AJAX di halaman) → JSON. */
  async function postJson(url, data, label, bolehUlang = true) {
    const r = await postCsrf(url, (t) => new URLSearchParams({ ...data, [CSRF_FIELD]: t }), label, bolehUlang);
    return bacaJson(r);
  }

  /** Cek status API Dukcapil (tanpa kirim NIK, tidak memakai kuota). Return { terhubung, pesan } */
  async function statusDukcapil() {
    try {
      const r = await ambil(`${BASE_URL}/Validasi/Nikpetani/status_api`, {}, 'Status Dukcapil');
      const d = await bacaJson(r);
      return { terhubung: !!(d && d.connected), pesan: (d && d.message) || '' };
    } catch (e) {
      if (e instanceof SesiHabis) throw e;
      return { terhubung: false, pesan: e.message };
    }
  }

  /** Validasi data KTP ke Dukcapil lewat SIMLUH. Return { valid, pesan } */
  async function cekDukcapil({ nik, nama, jk, tempat, tgl, bln, thn }) {
    const d = await postJson(`${BASE_URL}/Validasi/Nikpetani/cekdukcapil`, {
      NIK: nik, NAMA_LGKP: nama, JENIS_KLMIN: jk === 'perempuan' ? 'Perempuan' : 'Laki-Laki',
      TMPT_LHR: tempat, TGL_LHR: `${tgl}-${bln}-${thn}`,
    }, 'Cek Dukcapil');
    const h = (d && d.hasil) || {};
    const pesan = String(h.RESPONSE_MESSAGE || '')
      .replace(/\\n|\n/g, '; ').replace(/\s+/g, ' ').trim().replace(/^(; )+|(; )+$/g, '');
    return { valid: h.RESPONSE_STATUS === 'valid', pesan: pesan || 'tidak ada keterangan dari Dukcapil' };
  }

  /** Simpan anggota baru (tidak diulang otomatis: bisa membuat anggota dobel). Return { ok, pesan } */
  async function simpanAnggota(data) {
    const d = await postJson(`${ANGGOTA_URL}/save`, data, 'Simpan anggota', false);
    return { ok: !!(d && d.value), pesan: String((d && d.message) || '').replace(/\s+/g, ' ').trim() };
  }

  const api = {
    ServerSibuk, SesiHabis, JEDA_ULANG, tidur,
    ambilHalaman, uraiHalaman, getAnggota, updateAnggota, statusDukcapil, cekDukcapil, simpanAnggota,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SimluhApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
