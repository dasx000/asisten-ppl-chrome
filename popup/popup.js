// ================= POPUP: DAFTAR MODUL + SAKLAR ON/OFF ================= \\
(async function () {
  'use strict';
  const { DAFTAR, aktif, setAktif } = window.Asisten;

  document.getElementById('versi').textContent = 'v' + chrome.runtime.getManifest().version;

  const ul = document.getElementById('daftar');
  for (const m of DAFTAR) {
    const li = document.createElement('li');

    const teks = document.createElement('div');
    teks.className = 'teks';
    const nama = document.createElement('strong');
    nama.textContent = m.nama;
    const ket = document.createElement('span');
    ket.textContent = m.ket;
    const buka = document.createElement('a');
    buka.href = m.situs;
    buka.target = '_blank';
    buka.textContent = 'Buka situs ↗';
    teks.append(nama, ket, buka);

    const saklar = document.createElement('label');
    saklar.className = 'saklar';
    saklar.title = 'Nyalakan / matikan modul';
    const cek = document.createElement('input');
    cek.type = 'checkbox';
    cek.checked = await aktif(m.id);
    cek.addEventListener('change', () => setAktif(m.id, cek.checked));
    saklar.append(cek, document.createElement('i'));

    li.append(teks, saklar);
    ul.append(li);
  }
})();
