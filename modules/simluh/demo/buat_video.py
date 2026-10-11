"""
Buat video tutorial demo Asisten Excel SIMLUH (tanpa suara: teks + gambar).

Merekam ekstensi asli di halaman SIMLUH TIRUAN berisi DATA FIKTIF (tidak menyentuh server SIMLUH),
diselingi slide penjelasan. Hasil: dist/demo-asisten-simluh.mp4

Pemakaian (dari root repo):  python modules/simluh/demo/buat_video.py
Dependensi (khusus pengembang): playwright (python), openpyxl, ffmpeg (PATH, env FFMPEG, atau node_modules DASBOT)
"""
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from email.parser import BytesParser
from email.policy import default
from urllib.parse import parse_qs

import openpyxl
from playwright.sync_api import sync_playwright

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

# demo/ → modules/simluh/ → modules/ → root ekstensi (folder berisi manifest.json)
EXT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
DIST = os.path.join(EXT, "dist")
# ffmpeg: env FFMPEG → ffmpeg di PATH → ffmpeg-static milik DASBOT (folder sebelah)
FFMPEG = os.environ.get("FFMPEG") or shutil.which("ffmpeg") or os.path.join(
    os.path.dirname(EXT), "DASBOT", "node_modules", "ffmpeg-static", "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg")
BASE = "https://simluh.pertanian.go.id"
SLIDE = "https://panduan.demo"
TOKEN = "demo-token"
W, H = 1280, 720
URL_POKTAN = f"{BASE}/listpoktananggota?ip=demo"

# ─── Data fiktif ──────────────────────────────────────────────────────────────

KOMODITAS = [("2", "Tanaman Pangan-Padi Sawah"), ("10", "Perkebunan-Kopi"), ("11", "Perkebunan-Lada"),
             ("12", "Perkebunan-Kakao"), ("13", "Perkebunan-Karet")]
KOM = dict(KOMODITAS)
KATEGORI = {"1": "Pemilik", "2": "Pemilik dan Penggarap", "3": "Penggarap", "4": "Buruh"}


def anggota(i, nama, jk="1", **kw):
    a = dict(id_anggota=str(1000 + i), id_poktan="900001", nama_anggota=nama, nama_ktp=nama, jenis_kelamin=jk,
             kode_komoditas="2", volume="1", kode_komoditas2="", volume2="", kode_komoditas3="", volume3="",
             lainnya="", alamat_ktp=f"RT 00{i} DUSUN MAKMUR", status_anggota="1", tempat_lahir="SUKAMAJU",
             tgl_lahir=f"{i + 10}", bln_lahir=f"0{i}", thn_lahir=str(1975 + i), no_ktp=f"18000000000000{i}{i}",
             no_hp=f"81200000{i}{i}{i}", luas_lahan_ternak_diusahakan="1.00", luas_lahan_ternak_dimiliki="1.00",
             kategori_petani_penggarap="1", titik_koordinat_lahan=f"-4.71{i}, 104.42{i}")
    a.update(kw)
    return a


def db_awal():
    return {a["id_anggota"]: a for a in [
        anggota(1, "SUPARMAN"),
        anggota(2, "SITI AMINAH", jk="2", kode_komoditas="10", kode_komoditas2="11", volume2="0.50",
                kategori_petani_penggarap="2"),
        anggota(3, "BUDI SANTOSO"),
        anggota(4, "RINA WATI", jk="2", kode_komoditas="13", volume="2", luas_lahan_ternak_diusahakan="2.00",
                luas_lahan_ternak_dimiliki="2.00"),
        anggota(5, "JOKO PRASETYO", kategori_petani_penggarap="3"),
        anggota(6, "DEWI LESTARI", jk="2"),
    ]}


DB = db_awal()

JUDUL_EXCEL = ["No", "Nama", "NIK", "Tempat/Tgl Lahir", "Alamat", "Jenis Kelamin", "No HP", "Status Keanggotaan",
               "Komoditas 1", "Volume Komoditas 1", "Komoditas 2", "Volume Komoditas 2", "Komoditas 3",
               "Volume Komoditas 3", "Komoditas Lainnya", "Luas Lahan Diusahakan", "Luas Lahan Dimiliki",
               "Kategori Petani", "Titik Koordinat"]


def baris_excel(n, a):
    """Data anggota → baris Cetak Excel (isi sama dengan SIMLUH)."""
    kom = lambda k: KOM.get(a[k], "").split("-", 1)[-1]
    return [n, a["nama_ktp"], a["no_ktp"], f"{a['tempat_lahir']}, {a['tgl_lahir']}-{a['bln_lahir']}-{a['thn_lahir']}",
            a["alamat_ktp"], "Perempuan" if a["jenis_kelamin"] == "2" else "Laki-laki", "0" + a["no_hp"], "Anggota",
            kom("kode_komoditas"), a["volume"], kom("kode_komoditas2"), a["volume2"], kom("kode_komoditas3"),
            a["volume3"], "", a["luas_lahan_ternak_diusahakan"].rstrip("0").rstrip("."),
            a["luas_lahan_ternak_dimiliki"].rstrip("0").rstrip("."), KATEGORI[a["kategori_petani_penggarap"]],
            a["titik_koordinat_lahan"]]


def baris_ubah():
    rows = [baris_excel(n, a) for n, a in enumerate(db_awal().values(), 1)]
    rows[0][15] = "2,5"  # SUPARMAN: luas diusahakan 1 → 2,5
    rows[0][6] = "081277770001"  # SUPARMAN: ganti No HP
    rows[1][12], rows[1][13] = "Kakao", "0,25"  # SITI AMINAH: tambah komoditas 3
    rows[2][8] = "Kopii"  # BUDI SANTOSO: salah ketik → ditolak
    return rows


def baris_tambah():
    rows = [baris_excel(n, a) for n, a in enumerate(db_awal().values(), 1)]
    rows += [
        [7, "AGUS SETIAWAN", "1800000000000777", "WAY KANAN, 12-5-1985", "RT 007 DUSUN MAKMUR", "Laki-laki",
         "081277770007", "Anggota", "Kopi", "1,5", "", "", "", "", "", "1,5", "1,5", "Pemilik", "-4.717, 104.427"],
        [8, "NUR HASANAH", "1800000000000888", "SUKAMAJU, 3-9-1990", "RT 008 DUSUN MAKMUR", "Perempuan",
         "081277770008", "Anggota", "Padi Sawah", "0,75", "", "", "", "", "", "0,75", "0,5", "Pemilik dan Penggarap",
         "-4.718, 104.428"],
        [9, "HENDRA GUNAWAN", "1800000000000999", "SUKAMAJU, 21-1-1988", "RT 009 DUSUN MAKMUR", "Laki-laki",
         "", "Anggota", "Karet", "1", "", "", "", "", "", "1", "1", "Pemilik", "-4.719, 104.429"],
    ]
    return rows


def tulis_excel(path, rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["", "DAFTAR ANGGOTA KELOMPOK TANI"])
    ws.append(["", "ID Kelompok Tani", "900001"])
    ws.append(["", "Nama Kelompok Tani", "TANI MAKMUR"])
    ws.append([])
    ws.append(JUDUL_EXCEL)
    for r in rows:
        ws.append([str(v) if i == 2 else v for i, v in enumerate(r)])  # NIK sebagai teks
    wb.save(path)


# ─── Halaman SIMLUH tiruan ───────────────────────────────────────────────────

def halaman_poktan():
    rows = "".join(f"""
      <tr><td>{n}</td><td><a class="aksi" data-id_anggota="{a['id_anggota']}" id="btnEditAnggota" href="#">Ubah</a></td>
      <td>{html.escape(a['nama_anggota'])}</td><td>{a['no_ktp']}</td>
      <td>{a['tempat_lahir']}, {a['tgl_lahir']}-{a['bln_lahir']}-{a['thn_lahir']}</td><td>{a['alamat_ktp']}</td>
      <td>{'P' if a['jenis_kelamin'] in ('2', 'perempuan') else 'L'}</td><td>{a['no_hp']}</td>
      <td>{KOM.get(a['kode_komoditas'], '').split('-', 1)[-1]}</td><td>{a['luas_lahan_ternak_diusahakan']}</td></tr>"""
                   for n, a in enumerate(DB.values(), 1))
    opsi = "".join(f'<option value="{k}">{v}</option>' for k, v in KOMODITAS)
    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="csrf-token" content="{TOKEN}"><title>SIMLUH (demo)</title>
<style>
 body{{margin:0;font-family:'Segoe UI',system-ui,sans-serif;background:#f0f2f5;color:#344767}}
 .side{{position:fixed;inset:0 auto 0 0;width:210px;background:#1e293b;color:#cbd5e1;padding:18px 0}}
 .side .logo{{font-weight:800;font-size:20px;color:#fff;padding:0 22px 18px;letter-spacing:.5px}}
 .side a{{display:block;padding:10px 22px;color:#cbd5e1;text-decoration:none;font-size:14px}}
 .side a.on{{background:#334155;color:#fff;border-left:4px solid #4ade80}}
 .demo{{margin:0 18px 16px;background:#f59e0b;color:#1e293b;font-weight:800;
   font-size:12px;text-align:center;padding:6px;border-radius:6px}}
 .main{{margin-left:210px;padding:0 26px 26px}}
 .top{{display:flex;justify-content:space-between;padding:16px 0;font-size:14px;color:#64748b}}
 .card{{background:#fff;border-radius:14px;padding:20px 22px;box-shadow:0 2px 10px rgba(0,0,0,.05)}}
 h3{{margin:0 0 12px;font-size:20px;color:#1e293b}}
 .btn{{display:inline-block;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;margin-right:6px}}
 .b1{{background:#1d4ed8;color:#fff}} .b2{{background:#16a34a;color:#fff}}
 table{{border-collapse:collapse;width:100%;margin-top:14px;font-size:12.5px}}
 th{{text-align:left;color:#64748b;font-size:11px;text-transform:uppercase;padding:8px 6px;border-bottom:2px solid #e2e8f0}}
 td{{padding:9px 6px;border-bottom:1px solid #eef2f7}} .aksi{{color:#d97706;font-weight:700;text-decoration:none}}
 form{{display:none}}
</style></head><body>
<div class="side"><div class="logo">SIMLUH</div><div class="demo">DEMO · DATA FIKTIF</div>
 <a>Beranda</a><a>Kelembagaan</a><a class="on">Kelompok Tani</a><a>Laporan</a></div>
<div class="main"><div class="top"><span>Kelembagaan › Kelompok Tani › Anggota</span><span>👤 Admin BPP (contoh)</span></div>
<div class="card"><h3> Daftar Anggota Kelompok Tani Tani Makmur </h3>
 <a href="{BASE}/cetakanggotapoktan?ip=demo" class="btn b1">Cetak Excel</a><a class="btn b2">+ Tambah Anggota</a>
 <table id="tbllistanggota"><thead><tr><th>No</th><th>Aksi</th><th>Nama</th><th>NIK</th><th>Tempat/Tgl Lahir</th><th>Alamat</th>
 <th>JK</th><th>No HP</th><th>Komoditas</th><th>Luas (Ha)</th></tr></thead><tbody>{rows}</tbody></table>
 <form><select id="kode_komoditas"><option value="">Pilih</option>{opsi}</select>
 <input type="hidden" id="kode_prop" value="1800"><input type="hidden" id="kode_kab" value="1807">
 <input type="hidden" id="kode_kec" value="1807010"><input type="hidden" id="kode_desa" value="180701001">
 <input type="hidden" id="id_poktan" value="900001"></form></div></div></body></html>"""


def handler(route, request):
    """SIMLUH tiruan: halaman anggota + endpoint edit/update/save/Dukcapil, dengan jeda agar progres terlihat."""
    url, m = request.url, request.method
    path = url.replace(BASE, "")

    def json_(o):
        route.fulfill(status=200, content_type="application/json", body=json.dumps(o))

    if path.startswith("/listpoktananggota"):
        return route.fulfill(status=200, content_type="text/html", body=halaman_poktan(),
                             headers={"Set-Cookie": f"csrf_cookie_name={TOKEN}; Path=/"})
    mm = re.match(r"/KelembagaanPelakuUtama/KelompokTani/ListPoktanAnggota/(edit|update)/(\d+)$", path)
    if mm and mm[1] == "edit":
        time.sleep(0.35)
        return json_(DB.get(mm[2]) or {})
    if mm and m == "POST":
        time.sleep(0.9)
        ct = request.headers["content-type"]
        msg = BytesParser(policy=default).parsebytes(b"Content-Type: " + ct.encode() + b"\r\n\r\n" + request.post_data_buffer)
        f = {p.get_param("name", header="content-disposition"): p.get_content() for p in msg.iter_parts()}
        a = DB[mm[2]]
        for k in a:
            if k in f and k != "jenis_kelamin":
                a[k] = f[k]
        return route.fulfill(status=200, body="1")
    if path.startswith("/Validasi/Nikpetani/status_api"):
        return json_({"connected": True, "message": "API terhubung"})
    if path.startswith("/Validasi/Nikpetani/cekdukcapil"):
        time.sleep(1.0)
        return json_({"hasil": {"RESPONSE_STATUS": "valid", "RESPONSE_MESSAGE": "Data sesuai"}})
    if path.startswith("/KelembagaanPelakuUtama/KelompokTani/ListPoktanAnggota/save"):
        time.sleep(0.8)
        f = {k: v[0] for k, v in parse_qs(request.post_data, keep_blank_values=True).items()}
        i = str(2000 + len(DB))
        DB[i] = {**f, "id_anggota": i}
        return json_({"value": True, "message": "Data berhasil disimpan"})
    route.fulfill(status=404, body="")


# ─── Slide ───────────────────────────────────────────────────────────────────

GAYA_SLIDE = """
*{box-sizing:border-box} body{margin:0;width:1280px;height:720px;overflow:hidden;font-family:'Segoe UI',system-ui,sans-serif;
 background:linear-gradient(135deg,#0f3d27 0%,#1f7a4d 60%,#2f9e63 100%);color:#fff;display:flex;align-items:center;justify-content:center}
.kartu{width:1080px;background:#fff;color:#1c2329;border-radius:24px;padding:48px 60px;box-shadow:0 30px 80px rgba(0,0,0,.35);
 animation:masuk .5s ease-out}
@keyframes masuk{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
.label{display:inline-block;background:#e7f4ec;color:#165c3a;font-weight:800;font-size:15px;padding:6px 14px;border-radius:999px;margin-bottom:16px}
h1{font-size:46px;margin:0 0 10px;color:#165c3a} h2{font-size:36px;margin:0 0 22px;color:#165c3a}
p.sub{font-size:22px;color:#5b6470;margin:0} ul{margin:0;padding:0;list-style:none}
li{font-size:23px;margin:14px 0;display:flex;gap:16px;align-items:flex-start;line-height:1.35}
li .i{flex:none;width:40px;height:40px;border-radius:12px;background:#e7f4ec;display:flex;align-items:center;justify-content:center;font-size:22px}
.n{flex:none;width:40px;height:40px;border-radius:50%;background:#1f7a4d;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:20px}
code{background:#f1f3f5;border-radius:6px;padding:2px 8px;font-size:21px}
.catatan{margin-top:22px;font-size:17px;color:#5b6470}
table.xl{border-collapse:collapse;font-size:16px;margin-top:6px;width:100%}
table.xl th{background:#1f7a4d;color:#fff;padding:8px 10px;text-align:left;font-weight:600}
table.xl td{border:1px solid #d6dbe0;padding:7px 10px;background:#fff}
table.xl td.ubah{background:#fff3b0;font-weight:700;outline:3px solid #f2a900;outline-offset:-3px}
table.xl td.salah{background:#fde2e0;font-weight:700;outline:3px solid #d9483b;outline-offset:-3px}
table.xl tr.baru td{background:#e6f4ff}
.xl-judul{font-size:15px;color:#5b6470;margin-bottom:6px}
.besar{font-size:30px;font-weight:800;color:#165c3a}
"""


def slide(isi):
    return f"<!doctype html><html><head><meta charset='utf-8'><style>{GAYA_SLIDE}</style></head><body><div class='kartu'>{isi}</div></body></html>"


def li(ikon, teks, nomor=False):
    return f"<li><span class='{'n' if nomor else 'i'}'>{ikon}</span><span>{teks}</span></li>"


def tabel_excel(rows, kolom, tandai=None, baru_mulai=None):
    """Potongan tampilan Excel: kolom terpilih saja. tandai: {(baris, kolom): 'ubah'|'salah'}"""
    tandai = tandai or {}
    kepala = "".join(f"<th>{html.escape(JUDUL_EXCEL[k])}</th>" for k in kolom)
    isi = ""
    for r, row in enumerate(rows):
        kelas = " class='baru'" if baru_mulai is not None and r >= baru_mulai else ""
        isi += f"<tr{kelas}>" + "".join(
            f"<td class='{tandai.get((r, k), '')}'>{html.escape(str(row[k])) or '&nbsp;'}</td>" for k in kolom) + "</tr>"
    return f"<table class='xl'><tr>{kepala}</tr>{isi}</table>"


SLIDES = {
    "judul": slide("""<div class='label'>Panduan singkat · ±3 menit</div>
      <h1>Asisten Excel SIMLUH</h1>
      <p class='sub'>Perbarui &amp; tambah anggota poktan di SIMLUH langsung dari file <b>Cetak Excel</b>,
      tanpa mengetik ulang satu per satu.</p>
      <div class='catatan'>Ekstensi Chrome / Edge · alat bantu tidak resmi · video ini memakai data fiktif</div>"""),
    "apa": slide("<h2>Apa yang bisa dilakukan?</h2><ul>" +
                 li("✏️", "<b>Ubah data anggota</b>: luas lahan, komoditas, No HP, alamat, dll. Puluhan anggota sekaligus.") +
                 li("➕", "<b>Tambah anggota baru</b>: otomatis dicek ke <b>Dukcapil</b> sebelum disimpan.") +
                 li("🔍", "<b>Diperiksa dulu</b>: semua perubahan ditampilkan sebelum dikirim, isian yang salah ditolak dengan alasannya.") +
                 li("📄", "<b>Laporan Excel</b> hasil pengiriman bisa diunduh.") + "</ul>"),
    "aman": slide("<h2>🛡️ Aman dipakai</h2><ul>" +
                  li("🚫", "<b>Tidak pernah menghapus anggota.</b> Baris yang dihapus dari Excel hanya dilewati.") +
                  li("✋", "<b>Tidak ada yang dikirim</b> sebelum Anda klik tombol Kirim.") +
                  li("🔒", "Nama, NIK, Tempat/Tgl Lahir, dan Jenis Kelamin <b>tidak pernah diubah</b>.") +
                  li("👤", "Memakai <b>akun SIMLUH Anda sendiri</b>. Data tidak dikirim ke pihak lain, password tidak disimpan.") + "</ul>"),
    "pasang": slide("<div class='label'>Sekali saja</div><h2>Cara memasang</h2><ul>" +
                    li("1", "Ekstrak file <code>asisten-simluh-v….zip</code> ke folder tetap, misalnya <b>Documents</b>.", True) +
                    li("2", "Buka <code>chrome://extensions</code> (atau <code>edge://extensions</code> di Edge).", True) +
                    li("3", "Nyalakan <b>Developer mode</b> di pojok kanan atas.", True) +
                    li("4", "Klik <b>Load unpacked</b>, pilih folder <b>AsistenSIMLUH</b>. Selesai!", True) +
                    "</ul><div class='catatan'>Tidak perlu instal program lain. Cukup Chrome atau Edge.</div>"),
    "excel_ubah": slide("<div class='label'>Langkah 1 · Siapkan file</div><h2>Klik <span style='color:#1d4ed8'>Cetak Excel</span>, ubah isinya, simpan</h2>"
                        "<div class='xl-judul'>Contoh: kolom yang diubah ditandai kuning, salah ketik ditandai merah</div>" +
                        tabel_excel(baris_ubah()[:4], [1, 6, 8, 12, 13, 15],
                                    {(0, 6): "ubah", (0, 15): "ubah", (1, 12): "ubah", (1, 13): "ubah", (2, 8): "salah"}) +
                        "<div class='catatan'>Jangan menyisipkan / menghapus kolom. Baris yang tidak diubah boleh dibiarkan atau dihapus.</div>"),
    "excel_tambah": slide("<div class='label'>Tambah anggota baru</div><h2>Tulis anggota baru di baris paling bawah</h2>"
                          "<div class='xl-judul'>Semua kolom diisi. Nama, NIK, Tempat/Tgl Lahir, Jenis Kelamin harus sesuai KTP</div>" +
                          tabel_excel(baris_tambah()[4:], [1, 2, 3, 5, 6, 8, 15], {(4, 6): "salah"}, baru_mulai=2) +
                          "<div class='catatan'>Format Tempat/Tgl Lahir: <b>TEMPAT, tgl-bln-tahun</b> (contoh: KASUI, 15-8-1974). "
                          "Kolom NIK sebaiknya berformat <b>Teks</b>.</div>"),
    "tips": slide("<h2>Tips</h2><ul>" +
                  li("📌", "File yang dipakai harus milik <b>poktan yang sedang dibuka</b>.") +
                  li("🔢", "Ubah format kolom NIK jadi <b>Teks</b> di Excel supaya angkanya tidak rusak (1,8E+15).") +
                  li("🟡", "Baca daftar periksa: tanda <b>(dikosongkan)</b> berarti kolom itu akan dikosongkan di SIMLUH.") +
                  li("⏳", "Jangan tutup halaman sampai muncul tulisan <b>Selesai</b>.") + "</ul>"),
    "akhir": slide("<div style='text-align:center'><div class='besar'>Selamat mencoba! 🌾</div>"
                   "<p class='sub' style='margin-top:14px'>Asisten Excel SIMLUH · Alat bantu tidak resmi, bukan aplikasi Kementerian Pertanian</p></div>"),
}

# ─── Kursor & keterangan di layar ────────────────────────────────────────────

INIT_JS = r"""
(() => {
  const pasang = () => {
    if (document.getElementById('demo-kursor')) return;
    const st = document.createElement('style');
    st.textContent = `
      #demo-kursor{position:fixed;left:640px;top:360px;width:30px;height:30px;z-index:2147483647;pointer-events:none;
        transition:left .7s cubic-bezier(.4,0,.2,1),top .7s cubic-bezier(.4,0,.2,1);filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
      #demo-riak{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;z-index:2147483646;pointer-events:none;
        background:rgba(242,169,0,.55);transform:scale(.2);opacity:0}
      #demo-riak.on{animation:riak .55s ease-out}
      @keyframes riak{0%{transform:scale(.2);opacity:1}100%{transform:scale(1.6);opacity:0}}
      #demo-cap{position:fixed;left:24px;bottom:24px;max-width:650px;z-index:2147483645;pointer-events:none;
        background:rgba(15,25,32,.92);color:#fff;border-radius:16px;padding:16px 20px;font:500 21px/1.4 'Segoe UI',system-ui,sans-serif;
        box-shadow:0 12px 30px rgba(0,0,0,.35);border-left:6px solid #f2a900;opacity:0;transform:translateY(10px);transition:opacity .3s,transform .3s}
      #demo-cap.on{opacity:1;transform:none}
      #demo-cap .lk{display:block;font-size:14px;font-weight:800;color:#f2c94c;letter-spacing:.5px;margin-bottom:4px;text-transform:uppercase}
      #demo-konfirm{position:fixed;left:50%;top:18px;transform:translateX(-50%);width:450px;z-index:2147483644;background:#fff;border-radius:10px;
        box-shadow:0 10px 40px rgba(0,0,0,.4);padding:20px 22px;font:15px/1.45 'Segoe UI',system-ui,sans-serif;color:#1c2329}
      #demo-konfirm .h{font-weight:700;margin-bottom:6px} #demo-konfirm .t{white-space:pre-line;color:#3c4450}
      #demo-konfirm .b{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
      #demo-konfirm button{font:600 14px 'Segoe UI';padding:7px 20px;border-radius:18px;border:1px solid #c7ccd1;background:#fff}
      #demo-konfirm button.ok{background:#1a73e8;color:#fff;border-color:#1a73e8}`;
    document.documentElement.append(st);
    const k = document.createElement('div');
    k.id = 'demo-kursor';
    k.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2l15 11.5-6.6.9 3.9 7.2-2.9 1.5-3.9-7.3L4 20z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    const r = document.createElement('div'); r.id = 'demo-riak';
    const c = document.createElement('div'); c.id = 'demo-cap';
    document.documentElement.append(r, c, k);
    const pos = window.__demoPos || [640, 360];
    k.style.transition = 'none'; k.style.left = pos[0] + 'px'; k.style.top = pos[1] + 'px';
    requestAnimationFrame(() => (k.style.transition = ''));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pasang); else pasang();
})();
"""


class Demo:
    def __init__(self, page):
        self.page = page
        self.pos = [640, 360]

    def tunggu(self, detik):
        self.page.wait_for_timeout(int(detik * 1000))

    def pasang(self):
        self.page.evaluate("(p) => { window.__demoPos = p; }", self.pos)
        self.page.evaluate(INIT_JS)

    def buka(self, url, detik=0.0):
        self.page.goto(url)
        self.pasang()
        self.tunggu(detik)

    def slide(self, nama, detik):
        self.page.goto(f"{SLIDE}/{nama}")  # tanpa kursor/keterangan
        self.tunggu(detik)

    def keterangan(self, langkah, teks, detik=0.0):
        self.page.evaluate("""([l, t]) => {
            const c = document.getElementById('demo-cap');
            c.classList.remove('on');
            setTimeout(() => { c.innerHTML = ''; if (l) { const s = document.createElement('span'); s.className = 'lk'; s.textContent = l; c.append(s); }
              c.append(document.createTextNode(t)); c.classList.add('on'); }, 150);
        }""", [langkah, teks])
        self.tunggu(detik + 0.3)

    def tutup_keterangan(self):
        self.page.evaluate("() => document.getElementById('demo-cap').classList.remove('on')")

    def gerak(self, x, y, detik=0.8):
        self.pos = [x, y]
        self.page.evaluate("([x, y]) => { const k = document.getElementById('demo-kursor'); k.style.left = x + 'px'; k.style.top = y + 'px'; window.__demoPos = [x, y]; }", [x, y])
        self.tunggu(detik)

    def riak(self):
        self.page.evaluate("""([x, y]) => { const r = document.getElementById('demo-riak');
            r.style.left = (x + 4) + 'px'; r.style.top = (y + 3) + 'px'; r.classList.remove('on'); void r.offsetWidth; r.classList.add('on'); }""", self.pos)
        self.tunggu(0.25)

    def tunjuk(self, locator, detik=0.8):
        b = locator.bounding_box()
        self.gerak(b["x"] + b["width"] / 2 - 4, b["y"] + b["height"] / 2 - 3, detik)

    def klik(self, locator, jeda=0.4):
        self.tunjuk(locator)
        self.riak()
        locator.click()
        self.tunggu(jeda)

    def konfirmasi(self, judul, teks):
        """Tiruan dialog konfirmasi browser (dialog asli tidak ikut terekam)."""
        self.page.evaluate("""([h, t]) => { const d = document.createElement('div'); d.id = 'demo-konfirm';
            d.innerHTML = '<div class="h"></div><div class="t"></div><div class="b"><button>Batal</button><button class="ok">OK</button></div>';
            d.querySelector('.h').textContent = h; d.querySelector('.t').textContent = t; document.documentElement.append(d); }""", [judul, teks])
        self.tunggu(2.2)
        self.tunjuk(self.page.locator("#demo-konfirm button.ok"))
        self.riak()
        self.page.evaluate("() => document.getElementById('demo-konfirm').remove()")

    def gulir_panel(self, piksel, detik=1.2):
        self.page.locator("aside.laci .isi").evaluate("(el, y) => el.scrollBy({ top: y, behavior: 'smooth' })", piksel)
        self.tunggu(detik)


# ─── Skenario ────────────────────────────────────────────────────────────────

def rekam(tmp):
    f_ubah = os.path.join(tmp, "Anggota Tani Makmur.xlsx")
    f_tambah = os.path.join(tmp, "Anggota Tani Makmur (anggota baru).xlsx")
    tulis_excel(f_ubah, baris_ubah())
    tulis_excel(f_tambah, baris_tambah())
    video_dir = os.path.join(tmp, "video")

    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(
            os.path.join(tmp, "profil"), channel="chromium", headless=True,
            viewport={"width": W, "height": H}, record_video_dir=video_dir, record_video_size={"width": W, "height": H},
            accept_downloads=True, args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}"])
        ctx.route(f"{BASE}/**", handler)
        ctx.route(f"{SLIDE}/**", lambda route, req: route.fulfill(
            status=200, content_type="text/html; charset=utf-8", body=SLIDES[req.url.rsplit("/", 1)[-1]]))
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.on("dialog", lambda d: d.accept())
        d = Demo(page)
        laci = page.locator("aside.laci")

        # Pembuka
        d.slide("judul", 5)
        d.slide("apa", 8)
        d.slide("aman", 8)
        d.slide("pasang", 10)
        d.slide("excel_ubah", 9)

        # ── Mode Ubah ──
        d.buka(URL_POKTAN)
        page.wait_for_selector("button.fab", timeout=15000)
        d.keterangan("Langkah 2", "Login SIMLUH seperti biasa, lalu buka daftar anggota poktan.", 3.5)
        d.keterangan("Langkah 3", "Klik tombol hijau “Update dari Excel” di pojok kanan bawah.", 1)
        d.klik(page.locator("button.fab"), 1)
        d.keterangan("Langkah 4", "Pilih “Ubah data anggota”. Kotak hijau di bawah menjelaskan bahwa alat ini aman.", 1)
        d.klik(page.locator("button[role=radio]:has-text('Ubah data anggota')"), 2.5)
        d.keterangan("Langkah 5", "Klik kotak ini, lalu pilih file Excel yang sudah diubah tadi.", 1)
        with page.expect_file_chooser() as fc:
            d.klik(page.locator(".zona"), 0)
        fc.value.set_files(f_ubah)
        d.tunggu(1.5)
        d.keterangan("Langkah 6", "Klik “Periksa file”. Belum ada yang dikirim ke SIMLUH.", 1)
        d.klik(page.locator("button.utama:has-text('Periksa file')"), 0)
        page.wait_for_selector("text=Akan diubah", timeout=20000)
        d.tunggu(0.8)
        d.keterangan("Hasil pemeriksaan", "Biru = akan diubah (lama → baru). Merah = ditolak beserta alasannya, perbaiki di Excel.", 1)
        d.tunjuk(laci.locator("details.kelompok.biru summary"), 1.5)
        d.tunjuk(laci.locator("details.kelompok.biru .rinci").first, 2.5)
        d.tunjuk(laci.locator("details.kelompok.merah .alasan").first, 3)
        d.keterangan("Hasil pemeriksaan", "Anggota yang datanya sama tidak disentuh sama sekali.", 1)
        d.tunjuk(laci.locator("details.kelompok.abu summary"), 2.5)
        d.keterangan("Langkah 7", "Kalau daftar sudah benar, klik “Kirim” lalu OK.", 1)
        tombol = page.locator("button.utama:has-text('Kirim')")
        d.tunjuk(tombol)
        d.riak()
        d.konfirmasi("simluh.pertanian.go.id menyatakan", "Kirim 2 perubahan ke SIMLUH?\n\nHanya kolom yang tampil di daftar yang diubah. Tidak ada anggota yang dihapus.")
        tombol.click()
        d.keterangan("Mengirim", "Bot mengirim satu per satu dan memastikan setiap perubahan benar-benar tersimpan.", 0)
        page.wait_for_selector("text=Selesai", timeout=30000)
        d.tunggu(1)
        d.keterangan("Selesai", "Hijau = berhasil diperbarui. Klik “Unduh laporan” untuk menyimpan hasilnya.", 1.5)
        with page.expect_download():
            d.klik(page.locator("button.utama:has-text('Unduh laporan')"), 1)
        d.keterangan("Selesai", "Muat ulang halaman untuk melihat data terbaru di SIMLUH.", 1)
        d.klik(page.locator("button.kedua:has-text('Muat ulang halaman')"), 0)
        page.wait_for_selector("button.fab", timeout=15000)
        d.pasang()
        d.keterangan("Selesai", "Data SUPARMAN sudah berubah: luas 2.5 ha, No HP baru.", 0)
        d.tunjuk(page.locator("#tbllistanggota tr:has-text('SUPARMAN') td").nth(7), 1)
        d.tunggu(1.2)
        d.tunjuk(page.locator("#tbllistanggota tr:has-text('SUPARMAN') td").nth(9), 1)
        d.tunggu(2)

        # ── Mode Tambah ──
        d.slide("excel_tambah", 10)
        d.buka(URL_POKTAN)
        page.wait_for_selector("button.fab", timeout=15000)
        d.keterangan("Tambah anggota", "Buka lagi panelnya, lalu pilih “Tambah anggota baru”.", 1)
        d.klik(page.locator("button.fab"), 0.8)
        d.klik(page.locator("button[role=radio]:has-text('Tambah anggota baru')"), 2)
        with page.expect_file_chooser() as fc:
            d.klik(page.locator(".zona"), 0)
        fc.value.set_files(f_tambah)
        d.tunggu(1)
        d.klik(page.locator("button.utama:has-text('Periksa file')"), 0)
        page.wait_for_selector("text=Siap ditambahkan", timeout=20000)
        d.tunggu(0.6)
        d.keterangan("Hasil pemeriksaan", "Anggota lama otomatis dilewati. Yang kolomnya belum lengkap ditolak dengan alasannya.", 1)
        d.tunjuk(laci.locator("details.kelompok.biru summary"), 2)
        d.tunjuk(laci.locator("details.kelompok.merah .alasan").first, 3)
        d.keterangan("Kirim", "Klik “Tambahkan”. Setiap anggota dicek dulu ke Dukcapil, lalu disimpan.", 1)
        tombol = page.locator("button.utama:has-text('Tambahkan')")
        d.tunjuk(tombol)
        d.riak()
        d.konfirmasi("simluh.pertanian.go.id menyatakan", "Tambahkan 2 anggota baru ke SIMLUH?\n\nSetiap anggota dicek dulu ke Dukcapil, lalu langsung disimpan. Anggota yang sudah ada tidak diubah.")
        tombol.click()
        page.wait_for_selector("text=Selesai", timeout=30000)
        d.tunggu(1)
        d.keterangan("Selesai", "2 anggota baru berhasil ditambahkan ke SIMLUH.", 3.5)
        d.klik(page.locator("button.kedua:has-text('Muat ulang halaman')"), 0)
        page.wait_for_selector("button.fab", timeout=15000)
        d.pasang()
        d.keterangan("Selesai", "AGUS SETIAWAN dan NUR HASANAH sudah muncul di daftar anggota.", 0)
        d.tunjuk(page.locator("#tbllistanggota tr:has-text('AGUS SETIAWAN') td").nth(2), 1)
        d.tunggu(1.2)
        d.tunjuk(page.locator("#tbllistanggota tr:has-text('NUR HASANAH') td").nth(2), 1)
        d.tunggu(2)

        # Penutup
        d.slide("tips", 9)
        d.slide("akhir", 4)
        video = page.video.path()
        ctx.close()
    return video


def main():
    if not os.path.exists(FFMPEG):
        sys.exit(f"ffmpeg tidak ditemukan: {FFMPEG} (jalankan npm install di root repo)")
    os.makedirs(DIST, exist_ok=True)
    tujuan = os.path.join(DIST, "demo-asisten-simluh.mp4")
    tmp = tempfile.mkdtemp(prefix="demo-simluh-")
    try:
        print("Merekam demo…")
        webm = rekam(tmp)
        print("Mengonversi ke MP4…")
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-ss", "0.3", "-i", webm, "-c:v", "libx264", "-preset", "slow",
                        "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", tujuan], check=True)
        print(f"Selesai: {tujuan} ({os.path.getsize(tujuan) // 1024} KB)")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
