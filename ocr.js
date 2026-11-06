/* Local screenshot OCR. Images are processed inside this browser, never uploaded. */
(function(root){
  'use strict';
  const base = new URL('./vendor/ocr/', document.currentScript?.src || document.baseURI).href;
  const MAX_BYTES=15*1024*1024, MAX_PIXELS=12000000;
  let scriptPromise=null, active=false, cancelOperation=null;
  const emit=(fn,status,progress)=>{try{fn?.({status,progress:Math.max(0,Math.min(1,progress))});}catch{}};
  function loadEngine(){
    if(root.Tesseract?.createWorker)return Promise.resolve(root.Tesseract);
    if(scriptPromise)return scriptPromise;
    scriptPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');s.src=base+'tesseract.min.js';s.async=true;
      const timer=setTimeout(()=>{s.remove();scriptPromise=null;reject(Error('Mesin OCR belum dapat dimuat. Periksa koneksi lalu coba lagi.'));},45000);
      s.onload=()=>{clearTimeout(timer);if(root.Tesseract?.createWorker)resolve(root.Tesseract);else{scriptPromise=null;reject(Error('Mesin OCR tidak tersedia. Muat ulang halaman dan coba lagi.'));}};
      s.onerror=()=>{clearTimeout(timer);s.remove();scriptPromise=null;reject(Error('Mesin OCR gagal dimuat. Periksa koneksi lalu coba lagi.'));};document.head.appendChild(s);
    });
    return scriptPromise;
  }
  function imageElement(file){
    return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),image=new Image();const timer=setTimeout(()=>{image.src='';URL.revokeObjectURL(url);reject(Error('Gambar belum dapat dibuka. Gunakan screenshot PNG, JPG, atau WebP.'));},20000);image.onload=()=>{clearTimeout(timer);URL.revokeObjectURL(url);resolve(image);};image.onerror=()=>{clearTimeout(timer);URL.revokeObjectURL(url);reject(Error('Gambar tidak dapat dibaca. Gunakan screenshot PNG, JPG, atau WebP.'));};image.src=url;});
  }
  async function prepare(file){
    const image=await imageElement(file), iw=image.naturalWidth, ih=image.naturalHeight;
    if(!iw||!ih)throw Error('Ukuran gambar tidak valid.');
    if(iw*ih>60000000)throw Error('Resolusi gambar terlalu besar. Potong bagian insight agar lebih jelas.');
    let scale=Math.min(2,Math.max(1,1500/iw),4200/Math.max(iw,ih),Math.sqrt(MAX_PIXELS/(iw*ih)));
    const width=Math.max(1,Math.round(iw*scale)),height=Math.max(1,Math.round(ih*scale));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Browser ini belum mendukung pemrosesan gambar.');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,width,height);
    const pixels=ctx.getImageData(0,0,width,height),d=pixels.data;let sum=0,count=0;
    for(let i=0;i<d.length;i+=64){sum+=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];count++;}
    const inverted=sum/count<112;
    // Moderate contrast preserves thin text better than a hard threshold on small UI fonts.
    for(let i=0;i<d.length;i+=4){let lum=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];if(inverted)lum=255-lum;const value=Math.max(0,Math.min(255,(lum-128)*1.12+128));d[i]=d[i+1]=d[i+2]=value;d[i+3]=255;}
    ctx.putImageData(pixels,0,0);
    return {canvas,inverted,width,height,originalWidth:iw,originalHeight:ih};
  }
  function linesFrom(data){
    const lines=[];
    for(const block of data.blocks||[])for(const paragraph of block.paragraphs||[])for(const line of paragraph.lines||[]){
      const text=String(line.text||line.words?.map(w=>w.text).join(' ')||'').trim();
      if(text&&line.bbox)lines.push({text,bbox:line.bbox,confidence:typeof line.confidence==='number'?line.confidence:((line.words||[]).reduce((s,w)=>s+(w.confidence||0),0)/Math.max(1,line.words?.length||0))});
    }
    return lines;
  }
  function capConfidence(result,overall){
    const uncertain=new Set(result.uncertain||[]);
    for(const [key,match]of Object.entries(result.matches||{})){
      match.confidence=Math.min(match.confidence,Math.max(15,Math.round(overall)));
      if(match.confidence<85)uncertain.add(key);
    }
    result.uncertain=[...uncertain];return result;
  }
  function screenshotWarnings(text,platform){
    const t=String(text).toLowerCase(),notes=[];
    const ig=/reel insights|instagram|akun yang dijangkau|accounts reached|accounts engaged|interaksi reel/.test(t);
    const tk=/tiktok|watched full video|total play time|menonton video penuh|post views|video analytics/.test(t);
    if(platform==='TikTok'&&ig&&!tk)notes.push('Label screenshot terlihat seperti Instagram. Pastikan konten dan platform yang dipilih sesuai sebelum memakai hasil.');
    if(platform==='Instagram'&&tk&&!ig)notes.push('Label screenshot terlihat seperti TikTok. Pastikan konten dan platform yang dipilih sesuai sebelum memakai hasil.');
    const account=/account analytics|account insights|analisis akun|insight akun|professional dashboard|dasbor profesional|your account reached|akun anda menjangkau|total followers|total pengikut/.test(t)&&!/reel insights|post insights|story insights|video analytics|post analytics|insight reel|insight postingan|analisis video|analisis postingan|watched full video|total play time/.test(t);
    if(account)notes.push('Screenshot ini mungkin ringkasan akun, bukan insight satu konten. Angka akun tidak boleh disimpan sebagai insight konten. Unggah detail satu postingan.');
    return {notes,account,mismatch:(platform==='TikTok'&&ig&&!tk)||(platform==='Instagram'&&tk&&!ig)};
  }
  function parse(text,options={}){
    if(!root.ExataOCRParser?.parse)throw Error('Parser OCR belum dimuat. Muat ulang halaman.');
    return root.ExataOCRParser.parse(text,options);
  }
  async function recognize(file,options={}){
    if(active)throw Error('Screenshot sebelumnya masih diproses. Tunggu hingga selesai.');
    if(!file||!file.size)throw Error('Pilih screenshot insight terlebih dahulu.');
    if(file.size>MAX_BYTES)throw Error('Ukuran screenshot maksimal 15 MB.');
    if(!/^image\/(png|jpeg|webp|bmp)$/i.test(file.type))throw Error('Gunakan screenshot PNG, JPG, atau WebP.');
    active=true;let worker=null,prepared=null,engineTimer=null,stopEngine=null,cancelled=false;
    const engineFailure=new Promise((_,reject)=>{stopEngine=reject;});engineFailure.catch(()=>{});
    const cancelThisOperation=()=>{cancelled=true;stopEngine(Error('Pemrosesan OCR dibatalkan.'));};cancelOperation=cancelThisOperation;
    engineTimer=setTimeout(()=>{cancelled=true;stopEngine(Error('Pemrosesan OCR melewati batas waktu. Potong gambar ke bagian metrik lalu coba kembali.'));},120000);
    try{
      const {platform,format,onProgress}=options;
      emit(onProgress,'Menyiapkan gambar…',.02);const preparation=prepare(file);preparation.then(p=>{if(cancelled&&p.canvas){p.canvas.width=0;p.canvas.height=0;}}).catch(()=>{});prepared=await Promise.race([preparation,engineFailure]);
      emit(onProgress,'Memuat mesin OCR lokal…',.08);const engine=await Promise.race([loadEngine(),engineFailure]);
      const workerPromise=engine.createWorker(['eng','ind'],1,{
        workerPath:base+'worker.min.js',corePath:base+'core/',langPath:base+'lang/',workerBlobURL:false,cacheMethod:'none',gzip:true,errorHandler:()=>stopEngine?.(Error('Mesin OCR gagal membaca screenshot. Muat ulang halaman lalu coba lagi.')),
        logger:m=>{const p=Number(m.progress)||0;if(m.status==='recognizing text')emit(onProgress,'Membaca label dan angka…',.40+p*.48);else if(/loading|initializing/.test(m.status||''))emit(onProgress,'Menyiapkan pembaca teks…',.1+p*.27);}
      });
      workerPromise.then(w=>{if(cancelled)w.terminate().catch(()=>{});}).catch(()=>{});
      worker=await Promise.race([workerPromise,engineFailure]);
      await Promise.race([worker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1',user_defined_dpi:'300'}),engineFailure]);
      emit(onProgress,'Membaca label dan angka…',.40);
      const {data}=await Promise.race([worker.recognize(prepared.canvas,{}, {text:true,blocks:true}),engineFailure]);
      const confidence=Number.isFinite(data.confidence)?Math.max(0,Math.min(100,data.confidence)):0;
      emit(onProgress,'Mencocokkan metrik platform…',.91);
      const parsed=capConfidence(parse(data.text||'',{platform,format,lines:linesFrom(data)}),confidence);
      const warnings=screenshotWarnings(data.text,platform);
      parsed.notes=[...warnings.notes,...parsed.notes];
      if(warnings.account){parsed.fields={};parsed.matches={};parsed.uncertain=[];}
      else if(warnings.mismatch){parsed.uncertain=[...new Set([...parsed.uncertain,...Object.keys(parsed.fields)])];for(const m of Object.values(parsed.matches))m.confidence=Math.min(m.confidence,65);}
      if(confidence<65)parsed.notes.unshift('Kualitas pembacaan rendah. Gunakan screenshot asli dengan teks lebih besar; periksa setiap angka.');
      if(prepared.originalWidth<500)parsed.notes.push('Gambar berukuran kecil. Screenshot asli tanpa kompresi biasanya lebih mudah dibaca.');
      emit(onProgress,'Selesai. Periksa hasil sebelum disimpan.',1);
      return {...parsed,text:data.text||'',confidence:Math.round(confidence),meta:{engine:'Tesseract.js 6 · eng+ind',localOnly:true,preprocessed:true,darkMode:prepared.inverted}};
    }catch(error){
      if(error.message&&/screenshot|gambar|browser|OCR|PNG|JPG|WebP|15 MB|diproses|Parser/.test(error.message))throw error;
      throw Error('Screenshot belum dapat dibaca. Gunakan PNG/JPG yang jelas, muat ulang halaman, lalu coba lagi.');
    }finally{
      clearTimeout(engineTimer);if(cancelOperation===cancelThisOperation)cancelOperation=null;
      if(worker)try{await worker.terminate();}catch{}
      if(prepared?.canvas){prepared.canvas.width=0;prepared.canvas.height=0;}
      active=false;
    }
  }
  root.ExataOCR={recognize,parse,cancel:()=>cancelOperation?.(),maxFileBytes:MAX_BYTES,localOnly:true};
})(typeof window!=='undefined'?window:globalThis);
