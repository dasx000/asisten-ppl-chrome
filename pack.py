"""Kemas ekstensi jadi ZIP siap dibagikan: python pack.py → dist/"""
import json
import os
import zipfile

AKAR = os.path.dirname(os.path.abspath(__file__))
ISI = ["manifest.json", "README.md", "common", "popup", "modules", "icons", "lib"]
LEWATI = {"test", "demo", "__pycache__"}  # khusus pengembang, tidak ikut dibagikan

versi = json.load(open(os.path.join(AKAR, "manifest.json"), encoding="utf-8"))["version"]
os.makedirs(os.path.join(AKAR, "dist"), exist_ok=True)
tujuan = os.path.join(AKAR, "dist", f"asisten-ppl-v{versi}.zip")


def berkas_di(sumber):
    if os.path.isfile(sumber):
        return [sumber]
    hasil = []
    for d, sub, fs in os.walk(sumber):
        sub[:] = sorted(s for s in sub if s not in LEWATI)
        hasil += [os.path.join(d, f) for f in sorted(fs)]
    return hasil


with zipfile.ZipFile(tujuan, "w", zipfile.ZIP_DEFLATED) as z:
    for item in ISI:
        for f in berkas_di(os.path.join(AKAR, item)):
            # Folder induk "AsistenPPL/" agar hasil ekstrak langsung jadi satu folder; pemisah '/' (standar ZIP)
            z.write(f, "AsistenPPL/" + os.path.relpath(f, AKAR).replace(os.sep, "/"))
print(tujuan, f"{os.path.getsize(tujuan) // 1024} KB")
