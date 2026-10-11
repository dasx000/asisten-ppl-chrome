// ================= PENULIS EXCEL (.xlsx) BERGAYA, TANPA PUSTAKA (dipakai bersama semua modul) ================= \\
// SheetJS versi komunitas tidak menulis gaya sel (warna, garis, tebal), jadi file .xlsx dirakit sendiri:
// XML SpreadsheetML + ZIP tanpa kompresi. Mendukung: gaya sel, lebar kolom, gabung sel, bekukan baris,
// filter otomatis, tinggi baris, dan pengaturan cetak (lanskap, muat 1 halaman lebar). Bisa dites di Node.

(function (root) {
  'use strict';

  // ─── ZIP (metode simpan / tanpa kompresi) ──────────────────────────────────
  const TABEL_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(b) {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = TABEL_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function zip(berkas, waktu = new Date()) {
    const enc = new TextEncoder();
    const dosWaktu = (waktu.getHours() << 11) | (waktu.getMinutes() << 5) | (waktu.getSeconds() >> 1);
    const dosTgl = ((waktu.getFullYear() - 1980) << 9) | ((waktu.getMonth() + 1) << 5) | waktu.getDate();
    const lokal = [], pusat = [];
    let offset = 0;
    for (const [nama, isi] of berkas) {
      const n = enc.encode(nama), d = typeof isi === 'string' ? enc.encode(isi) : isi, crc = crc32(d);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint16(8, 0, true); h.setUint16(10, dosWaktu, true); h.setUint16(12, dosTgl, true);
      h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true);
      h.setUint16(26, n.length, true); h.setUint16(28, 0, true);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true); c.setUint16(12, dosWaktu, true); c.setUint16(14, dosTgl, true);
      c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true);
      c.setUint16(28, n.length, true); c.setUint32(42, offset, true);
      lokal.push(new Uint8Array(h.buffer), n, d);
      pusat.push(new Uint8Array(c.buffer), n);
      offset += 30 + n.length + d.length;
    }
    const ukPusat = pusat.reduce((s, x) => s + x.length, 0);
    const akhir = new DataView(new ArrayBuffer(22));
    akhir.setUint32(0, 0x06054b50, true); akhir.setUint16(8, berkas.length, true); akhir.setUint16(10, berkas.length, true);
    akhir.setUint32(12, ukPusat, true); akhir.setUint32(16, offset, true);
    const semua = [...lokal, ...pusat, new Uint8Array(akhir.buffer)];
    const out = new Uint8Array(semua.reduce((s, x) => s + x.length, 0));
    let p = 0;
    for (const x of semua) { out.set(x, p); p += x.length; }
    return out;
  }

  // ─── XML ───────────────────────────────────────────────────────────────────
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

  function kolom(i) { // 0 → A, 26 → AA
    let s = '';
    for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  }
  const alamat = (r, c) => kolom(c) + (r + 1);

  /**
   * Gaya sel: { bold, italic, size, color, fill, align: left|center|right, valign: top|center, wrap, fmt, border }
   * color/fill: hex 'RRGGBB'. fmt: kode format angka Excel. border: true (garis tipis abu).
   */
  function pabrikGaya() {
    const fonts = ['<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>'];
    const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
    const numFmts = [];
    const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    const peta = new Map([['{}', 0]]);
    const cari = (arr, x) => { let i = arr.indexOf(x); if (i < 0) i = arr.push(x) - 1; return i; };
    const FMT_BAWAAN = { General: 0, '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10 };

    function id(g) {
      if (!g) return 0;
      const kunci = JSON.stringify(g, Object.keys(g).sort());
      if (peta.has(kunci)) return peta.get(kunci);
      const f = cari(fonts, `<font>${g.bold ? '<b/>' : ''}${g.italic ? '<i/>' : ''}<sz val="${g.size || 11}"/>` +
        `${g.color ? `<color rgb="FF${g.color}"/>` : ''}<name val="Calibri"/><family val="2"/></font>`);
      const fl = g.fill ? cari(fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${g.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
      const garis = (s) => `<${s} style="thin"><color rgb="FFC8CED6"/></${s}>`;
      const b = g.border ? cari(borders, `<border>${garis('left')}${garis('right')}${garis('top')}${garis('bottom')}<diagonal/></border>`) : 0;
      let nf = 0;
      if (g.fmt) {
        if (g.fmt in FMT_BAWAAN) nf = FMT_BAWAAN[g.fmt];
        else {
          let i = numFmts.findIndex((x) => x.kode === g.fmt);
          if (i < 0) i = numFmts.push({ id: 164 + numFmts.length, kode: g.fmt }) - 1;
          nf = numFmts[i].id;
        }
      }
      const al = g.align || g.valign || g.wrap
        ? `<alignment${g.align ? ` horizontal="${g.align}"` : ''} vertical="${g.valign || 'center'}"${g.wrap ? ' wrapText="1"' : ''}/>` : '';
      const x = `<xf numFmtId="${nf}" fontId="${f}" fillId="${fl}" borderId="${b}" xfId="0"` +
        `${nf ? ' applyNumberFormat="1"' : ''}${f ? ' applyFont="1"' : ''}${fl ? ' applyFill="1"' : ''}${b ? ' applyBorder="1"' : ''}` +
        `${al ? ` applyAlignment="1">${al}</xf>` : '/>'}`;
      const n = xfs.push(x) - 1;
      peta.set(kunci, n);
      return n;
    }
    const xml = () => XML + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      (numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.map((x) => `<numFmt numFmtId="${x.id}" formatCode="${esc(x.kode)}"/>`).join('')}</numFmts>` : '') +
      `<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills>` +
      `<borders count="${borders.length}">${borders.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    return { id, xml };
  }

  /**
   * sheet: { nama, kolom: [lebar], baris: [[sel]], tinggi: {indeksBaris: pt}, gabung: ['A1:D1'],
   *          bekukan: jumlahBarisAtas, filter: 'A4:L4', lanskap: true, judulCetak: '4:4' }
   * Cetak selalu dimuat 1 halaman lebar (kertas A4).
   * sel: null | nilai | { v, s: gaya }
   */
  function xmlSheet(sh, gaya) {
    const baris = sh.baris.map((b, r) => {
      const sel = b.map((x, c) => {
        if (x == null) return '';
        const { v, s } = typeof x === 'object' && !(x instanceof Date) ? x : { v: x };
        const st = gaya.id(s);
        const a = alamat(r, c), sa = st ? ` s="${st}"` : '';
        if (v == null || v === '') return st ? `<c r="${a}"${sa}/>` : '';
        if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${a}"${sa}><v>${v}</v></c>`;
        return `<c r="${a}"${sa} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
      }).join('');
      const t = sh.tinggi && sh.tinggi[r];
      return `<row r="${r + 1}"${t ? ` ht="${t}" customHeight="1"` : ''}>${sel}</row>`;
    }).join('');
    const beku = sh.bekukan
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sh.bekukan}" topLeftCell="A${sh.bekukan + 1}" activePane="bottomLeft" state="frozen"/>` +
        `<selection pane="bottomLeft" activeCell="A${sh.bekukan + 1}" sqref="A${sh.bekukan + 1}"/></sheetView></sheetViews>`
      : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
    return XML + `<worksheet ${NS}>` +
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
      beku + '<sheetFormatPr defaultRowHeight="15"/>' +
      (sh.kolom ? `<cols>${sh.kolom.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '') +
      `<sheetData>${baris}</sheetData>` +
      (sh.filter ? `<autoFilter ref="${sh.filter}"/>` : '') +
      (sh.gabung && sh.gabung.length ? `<mergeCells count="${sh.gabung.length}">${sh.gabung.map((g) => `<mergeCell ref="${g}"/>`).join('')}</mergeCells>` : '') +
      '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
      `<pageSetup paperSize="9" orientation="${sh.lanskap ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>` +
      '</worksheet>';
  }

  /** Rakit workbook → Uint8Array berisi file .xlsx */
  function buat(sheets) {
    const gaya = pabrikGaya();
    const isi = sheets.map((s) => xmlSheet(s, gaya));
    const namaAman = (n, i) => esc(String(n || `Sheet${i + 1}`).replace(/[\\/?*[\]:]/g, '').slice(0, 31));
    const judulCetak = sheets.map((s, i) => s.judulCetak
      ? `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${namaAman(s.nama, i)}'!$${s.judulCetak.replace(':', ':$')}</definedName>` : '')
      .concat(sheets.map((s, i) => s.filter
        ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${namaAman(s.nama, i)}'!${s.filter.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}</definedName>` : ''))
      .join('');
    return zip([
      ['[Content_Types].xml', XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        '</Types>'],
      ['_rels/.rels', XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', XML + `<workbook ${NS}><sheets>` +
        sheets.map((s, i) => `<sheet name="${namaAman(s.nama, i)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        `</sheets>${judulCetak ? `<definedNames>${judulCetak}</definedNames>` : ''}</workbook>`],
      ['xl/_rels/workbook.xml.rels', XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ['xl/styles.xml', gaya.xml()],
      ...isi.map((x, i) => [`xl/worksheets/sheet${i + 1}.xml`, x]),
    ]);
  }

  const api = { buat, kolom, alamat, crc32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AsistenExcel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
