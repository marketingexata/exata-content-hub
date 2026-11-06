/* Exata screenshot metric parser. Label-based: absent / ambiguous metrics stay unset. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ExataOCRParser = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const definitions = [
    ['avgWatchTimeSeconds', 'duration', ['average watch time', 'avg watch time', 'average play time', 'rata rata waktu menonton', 'waktu menonton rata rata', 'rata rata waktu tonton', 'waktu tonton rata rata', 'rata rata waktu putar', 'waktu putar rata rata']],
    ['watchTimeSeconds', 'duration', ['total play time', 'total watch time', 'total waktu putar', 'waktu putar total', 'total waktu menonton', 'total waktu tonton', 'waktu tonton total', 'watch time', 'waktu tonton', 'waktu menonton']],
    ['completionRate', 'percent', ['watched full video', 'watched entire video', 'menonton video lengkap', 'menonton video penuh', 'menonton video secara penuh', 'menonton video utuh', 'menonton hingga selesai', 'menonton video sampai akhir', 'video ditonton sampai selesai', 'persentase menonton video penuh']],
    ['skipRate', 'percent', ['skip rate', 'tingkat lewati', 'rasio lewati', 'rasio melewati', 'tingkat melewati']],
    ['accountsEngaged', 'count', ['accounts engaged', 'engaged accounts', 'akun yang berinteraksi', 'akun berinteraksi']],
    ['reach', 'count', ['accounts reached', 'akun yang dijangkau', 'akun dijangkau', 'unique viewers', 'penonton unik', 'pemirsa unik', 'reach', 'jangkauan']],
    ['profileVisits', 'count', ['profile visits', 'profile views', 'kunjungan profil', 'tayangan profil']],
    ['followers', 'count', ['new followers', 'pengikut baru', 'follows', 'followers', 'pengikut']],
    ['linkClicks', 'count', ['link clicks', 'link taps', 'taps on link', 'external link taps', 'ketukan tautan', 'klik tautan']],
    ['tapsForward', 'count', ['taps forward', 'forward taps', 'ketukan maju', 'teruskan', 'forward']],
    ['tapsBack', 'count', ['taps back', 'back taps', 'ketukan kembali', 'kembali', 'back']],
    ['nextStory', 'count', ['next story', 'next stories', 'cerita berikutnya', 'story berikutnya']],
    ['exits', 'count', ['exited', 'exits', 'keluar']],
    ['replies', 'count', ['story replies', 'replies', 'balasan']],
    ['views', 'count', ['post views', 'video views', 'content views', 'total views', 'tayangan postingan', 'tayangan video', 'jumlah tayangan', 'views', 'tayangan', 'pemutaran']],
    ['likes', 'count', ['total likes', 'jumlah suka', 'likes', 'suka', 'disukai']],
    ['comments', 'count', ['total comments', 'jumlah komentar', 'comments', 'komentar']],
    ['shares', 'count', ['total shares', 'jumlah dibagikan', 'shares', 'dibagikan', 'bagikan']],
    ['saves', 'count', ['total saves', 'ditambahkan ke favorit', 'favorites', 'favourites', 'saved', 'saves', 'disimpan', 'favorit']]
  ].map(([key, type, labels]) => ({ key, type, labels }));
  const metricByKey = Object.fromEntries(definitions.map(x => [x.key, x]));
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, '').replace(/[-_–—]/g, ' ').replace(/[^\w\s%.,:]/g, ' ').replace(/\s+/g, ' ').trim();
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  function parseNumber(raw) {
    let value = String(raw == null ? '' : raw).trim().toLowerCase().replace(/\u00a0|\u202f/g, ' ');
    if (!value || /[-−]/.test(value)) return null;
    const suffix = value.match(/\s*(ribu|juta|miliar|rb|jt|k|m|b)\s*$/i);
    const multiplier = suffix ? ({ribu:1e3,rb:1e3,k:1e3,juta:1e6,jt:1e6,m:1e6,miliar:1e9,b:1e9})[suffix[1]] : 1;
    if (suffix) value = value.slice(0, suffix.index);
    value = value.trim().replace(/\s/g, '');
    if (!/^\d+(?:[.,]\d+)*$/.test(value)) return null;
    const comma = value.lastIndexOf(','), dot = value.lastIndexOf('.');
    if (comma >= 0 && dot >= 0) {
      const decimal = comma > dot ? ',' : '.';
      value = value.replace(decimal === ',' ? /\./g : /,/g, '').replace(decimal, '.');
    } else if (comma >= 0 || dot >= 0) {
      const sep = comma >= 0 ? ',' : '.', chunks = value.split(sep);
      if (chunks.length > 2) {
        if (!chunks.slice(1).every(s => s.length === 3)) return null;
        value = chunks.join('');
      } else if (!suffix && chunks[1].length === 3) {
        value = chunks.join('');
      } else value = chunks.join('.');
    }
    const number = Number(value) * multiplier;
    return Number.isFinite(number) && number <= 1e12 ? Math.round(number * 1e6) / 1e6 : null;
  }
  function parseDuration(raw) {
    const value = String(raw == null ? '' : raw).toLowerCase().trim().replace(/,/g, '.');
    if (!value || /[-−]/.test(value)) return null;
    const clock = value.match(/^\s*(\d{1,5}):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?\s*$/);
    if (clock) {
      if (clock[3] !== undefined) {
        if (+clock[2] >= 60 || +clock[3] >= 60) return null;
        return +clock[1] * 3600 + +clock[2] * 60 + +clock[3];
      }
      return +clock[2] < 60 ? +clock[1] * 60 + +clock[2] : null;
    }
    let seconds = 0, count = 0, consumed = '';
    const units = /([\d]+(?:\.\d+)?)\s*(hours?|hrs?|h|jam|minutes?|mins?|mnt|menit|m|seconds?|secs?|s|dtk|detik)(?:\b|(?=\d))/g;
    let match;
    while ((match = units.exec(value))) {
      const unit = match[2];
      const factor = /^(h|hr|hrs|hour|hours|jam)$/.test(unit) ? 3600 : /^(m|min|mins|minute|minutes|mnt|menit)$/.test(unit) ? 60 : 1;
      seconds += Number(match[1]) * factor; count++; consumed += match[0];
    }
    if (count && value.replace(units, '').replace(/[\s:]/g, '') === '') return Math.round(seconds * 1000) / 1000;
    if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value);
    return null;
  }
  function findLabels(text) {
    const line = normalize(text), candidates = [];
    for (const d of definitions) for (const label of d.labels) {
      const pattern = new RegExp('(^|[^a-z])' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+') + '(?=$|[^a-z])', 'g');
      let m;
      while ((m = pattern.exec(line))) { const start=m.index+m[1].length; if(/(?:^| )(?:non|not|your typical|typical|usual)\s+$/.test(line.slice(0,start)))continue; candidates.push({ key:d.key, type:d.type, label, start, end:m.index + m[0].length }); }
    }
    candidates.sort((a,b) => (b.end-b.start)-(a.end-a.start));
    const chosen = [];
    for (const c of candidates) if (!chosen.some(d => c.start < d.end && c.end > d.start)) chosen.push(c);
    return chosen.sort((a,b) => a.start-b.start);
  }
  function valuesIn(text, type) {
    const value = normalize(text), matches = [];
    if (!value || /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\b/.test(value)) return matches;
    if (type === 'percent') {
      const re = /(\d+(?:[.,]\d+)?)\s*%/g; let m;
      while ((m=re.exec(value))) { const n=Number(m[1].replace(',','.')); if(n>=0&&n<=100)matches.push({value:n,raw:m[0],start:m.index,end:re.lastIndex}); }
      return matches;
    }
    if (type === 'duration') {
      const re = /\d{1,5}:\d{1,2}(?::\d{1,2}(?:[.,]\d+)?)?|(?:\d+(?:[.,]\d+)?\s*(?:hours?|hrs?|h|jam|minutes?|mins?|mnt|menit|m|seconds?|secs?|s|dtk|detik)(?:\b|(?=\d))\s*:?\s*)+/g;let m;
      while ((m=re.exec(value))) {const n=parseDuration(m[0]);if(n!==null)matches.push({value:n,raw:m[0].trim(),start:m.index,end:re.lastIndex});}
      // Explicitly labelled seconds may be printed without unit; only use an isolated number.
      if(!matches.length && /^\d+(?:[.,]\d+)?$/.test(value)){const n=Number(value.replace(',','.'));if(Number.isFinite(n))matches.push({value:n,raw:value,start:0,end:value.length});}
      return matches;
    }
    const durationSpans = []; const durationPattern=/(?:\d+(?:[.,]\d+)?\s*(?:hours?|hrs?|h|jam|minutes?|mins?|mnt|menit|seconds?|secs?|s|dtk|detik)(?:\b|(?=\d))\s*:?\s*)+/g; let durationMatch; while((durationMatch=durationPattern.exec(value)))durationSpans.push([durationMatch.index,durationPattern.lastIndex]);
    const re = /\d{1,3}(?:[\s.,]\d{3})+(?:[.,]\d+)?(?:\s*(?:ribu|juta|miliar|rb|jt|k|m|b))?\b|\d+(?:[.,]\d+)*(?:\s*(?:ribu|juta|miliar|rb|jt|k|m|b))?\b/g; let m;
    while((m=re.exec(value))){
      if(durationSpans.some(([start,end])=>m.index<end&&re.lastIndex>start))continue;
      if (/\s*%/.test(value.slice(re.lastIndex,re.lastIndex+3)) || /[:\d]/.test(value[m.index-1]||'') || /^:/.test(value.slice(re.lastIndex)))continue;
      const n=parseNumber(m[0]);
      if(n!==null&&Number.isInteger(n))matches.push({value:n,raw:m[0],start:m.index,end:re.lastIndex});
    }
    return matches;
  }
  function contextAllows(key, context) {
    const platform=String(context.platform||'').toLowerCase();
    if(platform==='tiktok' && ['accountsEngaged','skipRate','replies','linkClicks','tapsForward','tapsBack','nextStory','exits'].includes(key))return false;
    if(platform==='instagram' && key==='completionRate')return false;
    return true;
  }
  function parse(text, context) {
    context = context || {};
    const input = String(text || '');
    // Tesseract sparse mode separates every text block with blank lines. Empty
    // blocks must not prevent an adjacent metric label/value association.
    const rawRows=input.split(/\r?\n/).filter(raw=>normalize(raw));
    const joinedRows=[];
    for(let i=0;i<rawRows.length;i++){
      let joined=null;
      for(let count=Math.min(3,rawRows.length-i);count>=2;count--){
        const value=normalize(rawRows.slice(i,i+count).join(' '));
        if(definitions.some(d=>d.labels.includes(value))){joined={raw:rawRows.slice(i,i+count).join(' '),count};break;}
      }
      joinedRows.push(joined?joined.raw:rawRows[i]);if(joined)i+=joined.count-1;
    }
    const rows=joinedRows.map((raw,index)=>({raw,line:normalize(raw),index}));
    const firstLabelIndex=rows.findIndex(r=>findLabels(r.line).length);
    const firstValueIndex=rows.findIndex(r=>!findLabels(r.line).length&&['count','duration','percent'].some(type=>valuesIn(r.line,type).some(v=>!r.line.slice(0,v.start).trim()&&!r.line.slice(v.end).trim())));
    const preferAbove=firstValueIndex>=0&&firstValueIndex<firstLabelIndex;
    const found = {}, conflicts = new Set(), notes = [];
    function add(label, value, source, score, method) {
      if(!contextAllows(label.key,context)||!value||!Number.isFinite(value.value)||value.value<0)return;
      const estimated=label.type==='count'&&/\d\s*(?:ribu|juta|miliar|rb|jt|k|m|b)\s*$/i.test(value.raw);
      const confidence=Math.round(clamp(estimated?Math.min(score,80):score,0,99));
      const c={value:value.value,confidence,label:label.label,raw:String(source||value.raw).trim(),method,estimated};
      const prev=found[label.key];
      const rank=m=>/^(?:label-value|value-label)$/.test(m)?3:m.startsWith('spatial-')?2:1;
      if(prev&&rank(c.method)>rank(prev.method))conflicts.delete(label.key);
      if(prev&&rank(c.method)===rank(prev.method)&&prev.value!==c.value&&Math.abs(prev.confidence-c.confidence)<14)conflicts.add(label.key);
      if(!prev||rank(c.method)>rank(prev.method)||(rank(c.method)===rank(prev.method)&&c.confidence>prev.confidence))found[label.key]=c;
    }
    for(const row of rows){
      const labels=findLabels(row.line);
      for(let li=0;li<labels.length;li++){
        const label=labels[li], after=row.line.slice(label.end,labels[li+1]?.start), before=row.line.slice(labels[li-1]?.end||0,label.start);
        const right=valuesIn(after,label.type),left=valuesIn(before,label.type);
        if(right.length===1)add(label,right[0],row.raw,95,'label-value');
        else if(!right.length&&left.length===1)add(label,left[0],row.raw,91,'value-label');
      }
      if(!labels.length)continue;
      // Screenshots often have one row of numbers above a row of metric labels.
      for(const delta of [-1,1]){
        const neighbor=rows[row.index+delta];if(!neighbor||findLabels(neighbor.line).length||!neighbor.line)continue;
        if(labels.length===1){
          const values=valuesIn(neighbor.line,labels[0].type);
          if(values.length===1)add(labels[0],values[0],neighbor.raw+' / '+row.raw,preferAbove?(delta===-1?82:78):(delta===-1?78:83),delta===-1?'above-label':'below-label');
        }else{
          // Assign columns only when all types and token counts make the pairing unambiguous.
          const combined=[];
          for(const type of new Set(labels.map(l=>l.type)))for(const v of valuesIn(neighbor.line,type))combined.push({...v,type});
          combined.sort((a,b)=>a.start-b.start||b.end-a.end);
          const tokens=[];for(const v of combined)if(!tokens.some(t=>v.start<t.end&&v.end>t.start))tokens.push(v);
          if(tokens.length===labels.length&&tokens.every((t,i)=>t.type===labels[i].type))labels.forEach((l,i)=>add(l,tokens[i],neighbor.raw+' / '+row.raw,84,'column-order'));
        }
      }
    }
    const rawSpatial = Array.isArray(context.lines) ? context.lines.filter(l=>l&&l.bbox&&typeof l.text==='string'&&normalize(l.text)) : [];
    const used=new Set(),spatial=[];
    for(const line of rawSpatial){
      if(used.has(line))continue;
      let merged=line,parts=[line];
      for(let count=0;count<2;count++){
        const value=normalize(merged.text);
        if(!definitions.some(d=>d.labels.some(l=>l.startsWith(value+' '))))break;
        const h=Math.max(8,merged.bbox.y1-merged.bbox.y0),x=merged.bbox.x0;
        const next=rawSpatial.filter(l=>l!==line&&!used.has(l)&&!parts.includes(l)&&l.bbox.y0>=merged.bbox.y1-3&&l.bbox.y0-merged.bbox.y1<h*2.1&&Math.abs(l.bbox.x0-x)<Math.max(45,(merged.bbox.x1-x)*.4)).sort((a,b)=>a.bbox.y0-b.bbox.y0)[0];
        if(!next)break;
        const combined=value+' '+normalize(next.text);
        if(!definitions.some(d=>d.labels.some(l=>l===combined||l.startsWith(combined+' '))))break;
        parts.push(next);merged={text:parts.map(p=>p.text.trim()).join(' '),bbox:{x0:Math.min(...parts.map(p=>p.bbox.x0)),x1:Math.max(...parts.map(p=>p.bbox.x1)),y0:Math.min(...parts.map(p=>p.bbox.y0)),y1:Math.max(...parts.map(p=>p.bbox.y1))},confidence:Math.min(...parts.map(p=>p.confidence??94))};
      }
      if(parts.length>1&&definitions.some(d=>d.labels.includes(normalize(merged.text)))){parts.forEach(p=>used.add(p));spatial.push(merged);}else spatial.push(line);
    }
    if(spatial.length){
      const averageHeight=spatial.reduce((s,l)=>s+Math.max(1,l.bbox.y1-l.bbox.y0),0)/spatial.length;
      for(const line of spatial){
        const labels=findLabels(line.text);if(labels.length!==1)continue;
        const label=labels[0],b=line.bbox,cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2,h=Math.max(averageHeight,b.y1-b.y0,8),width=Math.max(b.x1-b.x0,60);
        for(const candidate of spatial){
          if(candidate===line||findLabels(candidate.text).length)continue;
          const cb=candidate.bbox,ccx=(cb.x0+cb.x1)/2,ccy=(cb.y0+cb.y1)/2,dx=Math.min(Math.abs(ccx-cx),Math.abs(cb.x0-b.x0),Math.abs(cb.x1-b.x1)),dy=ccy-cy;
          const values=valuesIn(candidate.text,label.type);if(values.length!==1)continue;
          const vertical=dx<Math.max(width*.65,70)&&Math.abs(dy)<h*3.4&&Math.abs(dy)>h*.35;
          // Right-aligned Instagram tables often place values across the whole
          // screen. Use the baseline and reject intervening columns instead of
          // imposing a fixed pixel gap.
          const right=cb.x0>=b.x1-8&&Math.abs(dy)<h*.65&&!spatial.some(other=>other!==line&&other!==candidate&&other.bbox.x0>=b.x1-4&&other.bbox.x1<=cb.x0+4&&Math.abs((other.bbox.y0+other.bbox.y1)/2-cy)<h*.7);
          if(!vertical&&!right)continue;
          // Restrict to nearby values and the same column; if another metric label intervenes, reject.
          const blocked=spatial.some(other=>other!==line&&other!==candidate&&findLabels(other.text).length&&Math.abs(((other.bbox.x0+other.bbox.x1)/2)-cx)<Math.max(width*.45,35)&&((other.bbox.y0+other.bbox.y1)/2-cy)*dy>0&&Math.abs((other.bbox.y0+other.bbox.y1)/2-cy)<Math.abs(dy));
          if(blocked)continue;
          const ocrConfidence=clamp(Math.min(line.confidence??94,candidate.confidence??94),0,100);
          const geometric=right?96:94-Math.min(12,dx/width*10+Math.abs(dy)/h*2);
          add(label,values[0],candidate.text+' / '+line.text,Math.min(geometric,ocrConfidence),right?'spatial-right':'spatial-column');
        }
      }
    }
    const fields={},matches={},uncertain=[];
    for(const [key,match]of Object.entries(found)){
      if(conflicts.has(key)){match.confidence=Math.min(match.confidence,69);notes.push(`Terdapat lebih dari satu angka untuk ${match.label}; cocokkan dengan screenshot.`);}
      fields[key]=match.value;matches[key]=match;
      if(match.confidence<85)uncertain.push(key);
      if(match.estimated)notes.push(`Angka ${match.raw} memakai singkatan; ${match.label} merupakan perkiraan. Masukkan angka lengkap untuk hasil pasti.`);
    }
    if(!Object.keys(fields).length)notes.push('Belum ada pasangan label dan angka yang dapat dikenali. Gunakan screenshot detail insight dengan label metrik terbaca.');
    notes.push('Hanya angka dengan label metrik yang dikenali diisi. Periksa kembali hasil OCR sebelum menyimpan.');
    return {fields,matches,uncertain,notes};
  }
  return {parse,parseNumber,parseDuration};
});
