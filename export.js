(function () {
  'use strict';

  const encoder = new TextEncoder();
  const colors = { teal: '#146c58', ink: '#20352f', muted: '#6f7d77', line: '#dce5df', pale: '#edf4ef' };
  const stamp = () => new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
  const filename = title => String(title || 'laporan-konten').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'laporan-konten';
  const xml = value => String(value ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const textValue = value => String(value ?? '');
  const ascii = value => textValue(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\x7e\n]/g, '?');
  const pdfString = value => ascii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = name; anchor.hidden = true;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function input(options) {
    if (!options || !Array.isArray(options.columns) || !options.columns.length || !Array.isArray(options.rows)) throw new Error('Kolom dan data ekspor tidak valid.');
    return { title: textValue(options.title || 'Laporan konten'), columns: options.columns.map(textValue), rows: options.rows.map(row => options.columns.map((_, i) => row[i] ?? '')) };
  }

  const crcTable = Array.from({ length: 256 }, (_, n) => {
    for (let k = 0; k < 8; k++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function zip(entries) {
    const locals = [], centrals = [];
    let offset = 0, centralSize = 0;
    const date = new Date(), dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
    const dosDate = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    for (const [path, value] of entries) {
      const name = encoder.encode(path), bytes = typeof value === 'string' ? encoder.encode(value) : value;
      const checksum = crc32(bytes);
      const local = new Uint8Array(30 + name.length), l = new DataView(local.buffer);
      l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x800, true);
      l.setUint16(10, dosTime, true); l.setUint16(12, dosDate, true); l.setUint32(14, checksum, true);
      l.setUint32(18, bytes.length, true); l.setUint32(22, bytes.length, true); l.setUint16(26, name.length, true); local.set(name, 30);
      const central = new Uint8Array(46 + name.length), c = new DataView(central.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true);
      c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, checksum, true);
      c.setUint32(20, bytes.length, true); c.setUint32(24, bytes.length, true); c.setUint16(28, name.length, true);
      c.setUint32(42, offset, true); central.set(name, 46);
      locals.push(local, bytes); centrals.push(central);
      offset += local.length + bytes.length; centralSize += central.length;
    }
    const end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true);
    e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
    return new Blob([...locals, ...centrals, end], { type: 'application/zip' });
  }
  function colName(index) {
    let name = '';
    for (index++; index > 0; index = Math.floor((index - 1) / 26)) name = String.fromCharCode(65 + (index - 1) % 26) + name;
    return name;
  }
  function excel(options) {
    const { title, columns, rows } = input(options);
    const all = [[title], ['EXATA / CONTENT HUB'], ['Diekspor pada', stamp()], [], columns, ...rows];
    const cell = (value, r, c) => {
      const ref = colName(c) + r, style = r === 1 ? 1 : r === 5 ? 2 : 0;
      if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
      return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    };
    const sheetRows = all.map((row, i) => `<row r="${i + 1}"${i === 4 ? ' ht="26" customHeight="1"' : ''}>${row.map((v, c) => cell(v, i + 1, c)).join('')}</row>`).join('');
    const widths = columns.map((name, c) => Math.min(65, Math.max(16, name.length + 4, ...rows.map(row => Math.min(65, textValue(row[c]).length + 2)))));
    const entries = [
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Laporan" sheetId="1" r:id="rId1"/></sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="20"/><color rgb="FF146C58"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF146C58"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
      ['xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A5:${colName(columns.length - 1)}${Math.max(5, rows.length + 5)}"/></worksheet>`]
    ];
    download(new Blob([zip(entries)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename(title) + '.xlsx');
    return { rows: rows.length };
  }

  // The same paginated layout is used for PDF and PNG. Long cells continue on the
  // next page, so every row and all of its text remain available in the export.
  function layout(data, useAscii) {
    const width = 842, height = 595, margin = 28, fontSize = Math.max(6, Math.min(9, 68 / data.columns.length));
    const usable = width - 2 * margin;
    const weights = data.columns.map((name, i) => Math.min(35, Math.max(12, name.length, ...data.rows.map(row => Math.min(35, textValue(row[i]).length)))));
    const total = weights.reduce((a, b) => a + b, 0), widths = weights.map(w => usable * w / total);
    const lineHeight = fontSize + 4;
    const wrap = (value, col) => {
      const source = useAscii ? ascii(value) : textValue(value);
      const max = Math.max(2, Math.floor((widths[col] - 12) / (fontSize * 0.56)));
      return source.split('\n').flatMap(part => {
        const lines = []; let current = '';
        for (const word of part.split(/\s+/)) {
          if (current && current.length + word.length + 1 > max) { lines.push(current); current = ''; }
          let rest = word;
          while (rest.length > max) { if (current) { lines.push(current); current = ''; } lines.push(rest.slice(0, max)); rest = rest.slice(max); }
          current = current ? current + ' ' + rest : rest;
        }
        lines.push(current); return lines;
      });
    };
    const headers = data.columns.map(wrap), headerLines = Math.max(...headers.map(a => a.length));
    const headerHeight = headerLines * lineHeight + 14, start = 112 + headerHeight, bottom = height - 38;
    const pages = [[]]; let y = start;
    data.rows.forEach((row, rowIndex) => {
      const lines = row.map(wrap), count = Math.max(1, ...lines.map(a => a.length)); let lineOffset = 0;
      while (lineOffset < count) {
        let available = Math.floor((bottom - y - 12) / lineHeight);
        if (available < 1) { pages.push([]); y = start; available = Math.floor((bottom - y - 12) / lineHeight); }
        const take = Math.min(count - lineOffset, available), rowHeight = take * lineHeight + 12;
        pages[pages.length - 1].push({ rowIndex, y, height: rowHeight, lines: lines.map(cell => cell.slice(lineOffset, lineOffset + take)), continued: lineOffset > 0 });
        y += rowHeight; lineOffset += take;
      }
    });
    return { width, height, margin, fontSize, widths, lineHeight, headers, headerHeight, start, pages };
  }
  function pdf(options) {
    const data = input(options), l = layout(data, true), generated = stamp();
    const objects = [null, '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
    const pageIds = [];
    const rgb = hex => [1, 3, 5].map(i => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');
    l.pages.forEach((rows, pageIndex) => {
      let stream = '';
      const rect = (x, y, w, h, color) => { stream += `${rgb(color)} rg ${x.toFixed(2)} ${(l.height - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f\n`; };
      const txt = (s, x, y, size, color, bold = false) => { stream += `BT /F${bold ? 2 : 1} ${size} Tf ${rgb(color)} rg 1 0 0 1 ${x.toFixed(2)} ${(l.height - y).toFixed(2)} Tm (${pdfString(s)}) Tj ET\n`; };
      rect(0, 0, l.width, 7, colors.teal);
      txt('EXATA / CONTENT HUB', l.margin, 34, 10, colors.teal, true);
      const heading = ascii(data.title); txt(heading.length > 95 ? heading.slice(0, 92) + '...' : heading, l.margin, 63, 22, colors.ink, true);
      txt(`Diekspor pada ${generated}  |  ${data.rows.length} data`, l.margin, 85, 9, colors.muted);
      rect(l.margin, 112, l.width - 2 * l.margin, l.headerHeight, colors.teal);
      let x = l.margin;
      l.headers.forEach((lines, c) => { lines.forEach((line, j) => txt(line, x + 6, 123 + j * l.lineHeight, l.fontSize, '#ffffff', true)); x += l.widths[c]; });
      for (const row of rows) {
        if (row.rowIndex % 2 === 0) rect(l.margin, row.y, l.width - 2 * l.margin, row.height, colors.pale);
        x = l.margin;
        row.lines.forEach((lines, c) => { lines.forEach((line, j) => txt(line, x + 6, row.y + 11 + j * l.lineHeight, l.fontSize, colors.ink)); x += l.widths[c]; });
        rect(l.margin, row.y + row.height - 0.4, l.width - 2 * l.margin, 0.4, colors.line);
      }
      if (!data.rows.length) txt('Belum ada data untuk periode ini.', l.margin + 6, l.start + 25, 11, colors.muted);
      txt(`Halaman ${pageIndex + 1} / ${l.pages.length}`, l.margin, l.height - 16, 8, colors.muted);
      const pageId = objects.length; objects.push('');
      const contentId = objects.length; objects.push(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`);
      objects[pageId] = `<< /Type /Page /Parent 1 0 R /MediaBox [0 0 ${l.width} ${l.height}] /Resources << /Font << /F1 2 0 R /F2 3 0 R >> >> /Contents ${contentId} 0 R >>`;
      pageIds.push(pageId);
    });
    objects[1] = `<< /Type /Pages /Kids [${pageIds.map(id => id + ' 0 R').join(' ')}] /Count ${pageIds.length} >>`;
    const catalog = objects.length; objects.push('<< /Type /Catalog /Pages 1 0 R >>');
    let result = '%PDF-1.4\n', offsets = [0];
    for (let i = 1; i < objects.length; i++) { offsets[i] = encoder.encode(result).length; result += `${i} 0 obj\n${objects[i]}\nendobj\n`; }
    const xref = encoder.encode(result).length;
    result += `xref\n0 ${objects.length}\n0000000000 65535 f \n` + offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('');
    result += `trailer\n<< /Size ${objects.length} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    download(new Blob([result], { type: 'application/pdf' }), filename(data.title) + '.pdf');
    return { pages: l.pages.length, rows: data.rows.length };
  }
  async function image(options) {
    const data = input(options), l = layout(data, false), generated = stamp(), files = [];
    for (let index = 0; index < l.pages.length; index++) {
      const canvas = document.createElement('canvas'); canvas.width = l.width * 2; canvas.height = l.height * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Browser ini tidak mendukung ekspor gambar.');
      ctx.scale(2, 2); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, l.width, l.height);
      const rect = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
      const txt = (s, x, y, size, color, bold = false) => { ctx.fillStyle = color; ctx.font = `${bold ? 700 : 400} ${size}px Arial, sans-serif`; ctx.fillText(s, x, y); };
      rect(0, 0, l.width, 7, colors.teal); txt('EXATA / CONTENT HUB', l.margin, 34, 10, colors.teal, true);
      const heading = data.title; txt(heading.length > 95 ? heading.slice(0, 92) + '…' : heading, l.margin, 63, 22, colors.ink, true);
      txt(`Diekspor pada ${generated}  |  ${data.rows.length} data`, l.margin, 85, 9, colors.muted);
      rect(l.margin, 112, l.width - 2 * l.margin, l.headerHeight, colors.teal);
      let x = l.margin;
      l.headers.forEach((lines, c) => { lines.forEach((line, j) => txt(line, x + 6, 123 + j * l.lineHeight, l.fontSize, '#ffffff', true)); x += l.widths[c]; });
      for (const row of l.pages[index]) {
        if (row.rowIndex % 2 === 0) rect(l.margin, row.y, l.width - 2 * l.margin, row.height, colors.pale);
        x = l.margin;
        row.lines.forEach((lines, c) => { lines.forEach((line, j) => txt(line, x + 6, row.y + 11 + j * l.lineHeight, l.fontSize, colors.ink)); x += l.widths[c]; });
        rect(l.margin, row.y + row.height - 0.4, l.width - 2 * l.margin, 0.4, colors.line);
      }
      if (!data.rows.length) txt('Belum ada data untuk periode ini.', l.margin + 6, l.start + 25, 11, colors.muted);
      txt(`Halaman ${index + 1} / ${l.pages.length}`, l.margin, l.height - 16, 8, colors.muted);
      const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Gagal membuat PNG.')), 'image/png'));
      files.push([`${filename(data.title)}-${String(index + 1).padStart(2, '0')}.png`, new Uint8Array(await blob.arrayBuffer())]);
    }
    if (files.length === 1) download(new Blob([files[0][1]], { type: 'image/png' }), filename(data.title) + '.png');
    else download(zip(files), filename(data.title) + '-gambar.zip');
    return { pages: l.pages.length, rows: data.rows.length, bundled: files.length > 1 };
  }
  window.ContentExport = Object.freeze({ excel, pdf, image });
})();
