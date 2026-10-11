"""
Video tutorial MODE UBAH dengan narasi suara (Microsoft Edge TTS, suara neural bahasa Indonesia).

Memakai halaman SIMLUH tiruan + data fiktif dari buat_video.py. Setiap adegan menunggu narasinya selesai,
lalu suara digabung ke rekaman sesuai waktu mulainya. Hasil: dist/demo-ubah-bersuara.mp4

Pemakaian (dari root repo):
  python modules/simluh/demo/buat_video_suara.py            # suara perempuan (Gadis)
  python modules/simluh/demo/buat_video_suara.py --ardi     # suara laki-laki (Ardi)
Dependensi tambahan: pip install edge-tts (butuh internet untuk membuat suara)
"""
import asyncio
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

import edge_tts
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import buat_video as bv  # noqa: E402

SUARA = "id-ID-ArdiNeural" if "--ardi" in sys.argv else "id-ID-GadisNeural"
TEMPO = "-4%"  # sedikit lebih pelan dari bawaan, enak diikuti

# Naskah narasi: kunci → teks yang diucapkan (koma = jeda napas)
NARASI = {
    "buka": "Halo, Bapak dan Ibu penyuluh. Di video ini, kita akan belajar memakai Asisten Excel SIMLUH, "
            "untuk mengubah data banyak anggota poktan sekaligus, langsung dari file Excel.",
    "aman": "Sebelumnya, tidak perlu khawatir. Alat ini tidak pernah menghapus anggota, "
            "dan tidak ada data yang terkirim, sebelum Anda sendiri menekan tombol kirim.",
    "pasang": "Pemasangannya cukup sekali saja. Ekstrak file zip-nya, buka halaman ekstensi di Chrome, "
              "nyalakan mode developer, lalu klik load unpacked, dan pilih foldernya.",
    "excel": "Langkah pertama, siapkan filenya. Di SIMLUH, klik tombol Cetak Excel, lalu ubah data yang perlu diperbarui. "
             "Misalnya luas lahan, nomor HP, atau komoditas. Setelah itu, simpan filenya.",
    "halaman": "Sekarang, buka daftar anggota poktan di SIMLUH, seperti biasa.",
    "tombol": "Di pojok kanan bawah, ada tombol hijau bertuliskan, Update dari Excel. Klik tombol itu.",
    "mode": "Pilih, Ubah data anggota. Lalu klik kotak ini, dan pilih file Excel yang tadi sudah disimpan.",
    "periksa": "Klik Periksa file. Tenang saja, di tahap ini belum ada yang dikirim ke SIMLUH.",
    "hasil_biru": "Nah, hasil pemeriksaannya sudah muncul. Yang berwarna biru, adalah data yang akan diubah, "
                  "lengkap dengan nilai lama, dan nilai barunya.",
    "hasil_merah": "Yang berwarna merah, ditolak karena ada kesalahan. Di sini, nama komoditasnya salah ketik. "
                   "Cukup perbaiki di Excel, lalu periksa ulang.",
    "hasil_abu": "Sedangkan anggota yang datanya tidak berubah, tidak akan disentuh sama sekali.",
    "kirim": "Kalau semuanya sudah benar, klik Kirim, lalu tekan OK.",
    "mengirim": "Asisten akan mengirim perubahannya satu per satu, dan memastikan semuanya benar-benar tersimpan.",
    "selesai": "Selesai! Semua perubahan berhasil disimpan. Klik Unduh laporan, kalau ingin menyimpan hasilnya dalam bentuk Excel.",
    "muat": "Terakhir, muat ulang halaman.",
    "bukti": "Dan data terbarunya langsung terlihat. Nomor HP dan luas lahan Pak Suparman, sudah berubah.",
    "tips": "Beberapa tips. Pastikan file yang dipakai, milik poktan yang sedang dibuka. Ubah format kolom NIK menjadi teks, "
            "supaya angkanya tidak rusak. Dan jangan tutup halaman, sampai muncul tulisan selesai.",
    "tutup": "Selamat mencoba. Semoga pekerjaan Bapak dan Ibu, jadi lebih ringan.",
}

bv.SLIDES["judul_ubah"] = bv.slide(
    """<div class='label'>Panduan · Ubah data anggota</div>
    <h1>Asisten Excel SIMLUH</h1>
    <p class='sub'>Ubah data banyak anggota poktan sekaligus, langsung dari file <b>Cetak Excel</b>.</p>
    <div class='catatan'>Ekstensi Chrome / Edge · alat bantu tidak resmi · video ini memakai data fiktif</div>""")


def durasi(ffmpeg, path):
    """Durasi file audio (detik) dari keluaran ffmpeg."""
    err = subprocess.run([ffmpeg, "-i", path], capture_output=True, text=True).stderr
    j, m, d = re.search(r"Duration: (\d+):(\d+):([\d.]+)", err).groups()
    return int(j) * 3600 + int(m) * 60 + float(d)


async def buat_suara(folder):
    klip = {}
    for kunci, teks in NARASI.items():
        path = os.path.join(folder, f"{kunci}.mp3")
        for coba in range(4):  # koneksi ke server suara kadang putus → coba lagi
            try:
                await edge_tts.Communicate(teks, SUARA, rate=TEMPO).save(path)
                break
            except Exception as e:
                if coba == 3:
                    raise RuntimeError(f"Gagal membuat suara '{kunci}': {e}. Cek koneksi internet.")
                print(f"  suara '{kunci}' gagal ({type(e).__name__}), coba lagi…")
                await asyncio.sleep(3 * (coba + 1))
        klip[kunci] = path
    return klip


class DemoSuara(bv.Demo):
    """Demo + narasi: bicara() mencatat waktu mulai klip, selesai() menunggu klip habis."""

    def __init__(self, page, klip, t0):
        super().__init__(page)
        self.klip, self.t0, self.jadwal, self.akhir = klip, t0, [], 0.0

    def bicara(self, kunci, langkah=None, keterangan=None):
        path, dur = self.klip[kunci]
        self.jadwal.append((time.monotonic() - self.t0, path))
        self.akhir = time.monotonic() + dur
        if keterangan:
            self.keterangan(langkah, keterangan)

    def selesai(self, jeda=0.5):
        sisa = self.akhir - time.monotonic() + jeda
        if sisa > 0:
            self.tunggu(sisa)

    def slide_bicara(self, nama, kunci, jeda=0.8):
        self.slide(nama, 0.6)
        self.bicara(kunci)
        self.selesai(jeda)


def rekam(tmp, klip):
    f_ubah = os.path.join(tmp, "Anggota Tani Makmur.xlsx")
    bv.tulis_excel(f_ubah, bv.baris_ubah())
    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(
            os.path.join(tmp, "profil"), channel="chromium", headless=True,
            viewport={"width": bv.W, "height": bv.H}, record_video_dir=os.path.join(tmp, "video"),
            record_video_size={"width": bv.W, "height": bv.H}, accept_downloads=True,
            args=[f"--disable-extensions-except={bv.EXT}", f"--load-extension={bv.EXT}"])
        t0 = time.monotonic()
        ctx.route(f"{bv.BASE}/**", bv.handler)
        ctx.route(f"{bv.SLIDE}/**", lambda route, req: route.fulfill(
            status=200, content_type="text/html; charset=utf-8", body=bv.SLIDES[req.url.rsplit("/", 1)[-1]]))
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.on("dialog", lambda dlg: dlg.accept())
        d = DemoSuara(page, klip, t0)
        laci = page.locator("aside.laci")

        d.slide_bicara("judul_ubah", "buka")
        d.slide_bicara("aman", "aman")
        d.slide_bicara("pasang", "pasang")
        d.slide_bicara("excel_ubah", "excel", 1.2)

        d.buka(bv.URL_POKTAN)
        page.wait_for_selector("button.fab", timeout=15000)
        d.bicara("halaman", "Langkah 2", "Login SIMLUH, lalu buka daftar anggota poktan.")
        d.selesai()
        d.bicara("tombol", "Langkah 3", "Klik tombol hijau “Update dari Excel”.")
        d.tunjuk(page.locator("button.fab"), 1.5)
        d.selesai(0.1)
        d.riak()
        page.locator("button.fab").click()
        d.tunggu(0.8)

        d.bicara("mode", "Langkah 4", "Pilih “Ubah data anggota”, lalu pilih file Excel.")
        d.klik(page.locator("button[role=radio]:has-text('Ubah data anggota')"), 1.6)
        with page.expect_file_chooser() as fc:
            d.klik(page.locator(".zona"), 0)
        fc.value.set_files(f_ubah)
        d.selesai()

        d.bicara("periksa", "Langkah 5", "Klik “Periksa file”. Belum ada yang dikirim.")
        d.tunjuk(page.locator("button.utama:has-text('Periksa file')"), 1)
        d.selesai(0.1)
        d.riak()
        page.locator("button.utama:has-text('Periksa file')").click()
        page.wait_for_selector("text=Akan diubah", timeout=20000)
        d.tunggu(0.6)

        d.bicara("hasil_biru", "Hasil pemeriksaan", "Biru = akan diubah, lengkap dengan nilai lama → baru.")
        d.tunjuk(laci.locator("details.kelompok.biru summary"), 1.2)
        d.tunjuk(laci.locator("details.kelompok.biru .rinci").first, 1.5)
        d.selesai()
        d.bicara("hasil_merah", "Hasil pemeriksaan", "Merah = ditolak, beserta alasannya. Perbaiki di Excel.")
        d.tunjuk(laci.locator("details.kelompok.merah .alasan").first, 1.2)
        d.selesai()
        d.bicara("hasil_abu", "Hasil pemeriksaan", "Anggota yang datanya sama tidak disentuh.")
        d.tunjuk(laci.locator("details.kelompok.abu summary"), 1.2)
        d.selesai()

        tombol = page.locator("button.utama:has-text('Kirim')")
        d.bicara("kirim", "Langkah 6", "Klik “Kirim”, lalu OK.")
        d.tunjuk(tombol)
        d.riak()
        d.konfirmasi("simluh.pertanian.go.id menyatakan",
                     "Kirim 2 perubahan ke SIMLUH?\n\nHanya kolom yang tampil di daftar yang diubah. Tidak ada anggota yang dihapus.")
        d.selesai(0.1)
        tombol.click()
        d.bicara("mengirim", "Mengirim", "Dikirim satu per satu, lalu dipastikan tersimpan.")
        page.wait_for_selector("text=Selesai", timeout=30000)
        d.selesai()

        d.bicara("selesai", "Selesai", "Berhasil! Klik “Unduh laporan” untuk menyimpan hasilnya.")
        d.tunjuk(laci.locator("details.kelompok.hijau summary"), 1.5)
        with page.expect_download():
            d.klik(page.locator("button.utama:has-text('Unduh laporan')"), 0.5)
        d.selesai()

        d.bicara("muat", "Selesai", "Muat ulang halaman.")
        d.tunjuk(page.locator("button.kedua:has-text('Muat ulang halaman')"))
        d.selesai(0.1)
        d.riak()
        page.locator("button.kedua:has-text('Muat ulang halaman')").click()
        page.wait_for_selector("button.fab", timeout=15000)
        d.pasang()
        d.bicara("bukti", "Selesai", "Data Pak Suparman sudah berubah: No HP baru, luas 2.5 ha.")
        d.tunjuk(page.locator("#tbllistanggota tr:has-text('SUPARMAN') td").nth(7), 1)
        d.tunggu(1.2)
        d.tunjuk(page.locator("#tbllistanggota tr:has-text('SUPARMAN') td").nth(9), 1)
        d.selesai(1)

        d.slide_bicara("tips", "tips")
        d.slide_bicara("akhir", "tutup", 2)
        t_akhir = time.monotonic() - t0
        video = page.video.path()
        ctx.close()
    return video, d.jadwal, t_akhir


def main():
    os.makedirs(bv.DIST, exist_ok=True)
    tujuan = os.path.join(bv.DIST, "demo-ubah-bersuara.mp4")
    tmp = tempfile.mkdtemp(prefix="demo-suara-")
    try:
        print(f"Membuat narasi ({SUARA})…")
        klip = {k: (p, durasi(bv.FFMPEG, p)) for k, p in asyncio.run(buat_suara(tmp)).items()}
        print(f"  {len(klip)} klip, total {sum(d for _, d in klip.values()):.0f} detik")
        print("Merekam demo…")
        webm, jadwal, t_akhir = rekam(tmp, klip)
        # Rekaman mulai sedikit sebelum t0 (saat browser dibuka) → geser suara sebesar selisihnya
        geser = min(max(durasi(bv.FFMPEG, webm) - t_akhir, 0.0), 2.0)
        print(f"Menggabungkan video + suara (geser {geser:.2f} dtk)…")
        args = [bv.FFMPEG, "-y", "-loglevel", "error", "-i", webm]
        filt = []
        for i, (t, path) in enumerate(jadwal, 1):
            args += ["-i", path]
            ms = int((t + geser) * 1000)
            filt.append(f"[{i}:a]adelay={ms}:all=1[a{i}]")
        filt.append("".join(f"[a{i}]" for i in range(1, len(jadwal) + 1)) +
                    f"amix=inputs={len(jadwal)}:normalize=0:duration=longest[aud]")
        args += ["-filter_complex", ";".join(filt), "-map", "0:v", "-map", "[aud]",
                 "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30",
                 "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", tujuan]
        subprocess.run(args, check=True)
        print(f"Selesai: {tujuan} ({os.path.getsize(tujuan) // 1024} KB)")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
