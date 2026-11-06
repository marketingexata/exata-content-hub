(function (global) {
  'use strict';
  let active = null;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function publicHost(host) {
    const name = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (!name || name === 'localhost' || /\.(localhost|local|internal|lan|home|test|invalid)$/.test(name)) return false;
    if (name.includes(':')) {
      // IPv4-mapped and non-public IPv6 destinations are unsuitable for a reference.
      if (/^(::|::1|::ffff:)/.test(name) || /^(f[cd]|fe[89ab])/.test(name)) return false;
      return /^[23][a-f\d:]+$/i.test(name);
    }
    if (/^\d+(\.\d+){3}$/.test(name)) {
      const [a,b] = name.split('.').map(Number);
      return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) ||
        (a === 198 && (b === 18 || b === 19)));
    }
    return name.includes('.') && /^[a-z\d.-]+$/i.test(name) && !name.includes('..');
  }

  function normalized(value) {
    if (typeof value !== 'string' || value.length > 4096) return null;
    try {
      const url = new URL(value.trim());
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !publicHost(url.hostname)) return null;
      return url;
    } catch (_) { return null; }
  }

  function describe(value) {
    const url = normalized(value);
    if (!url) return { valid:false, error:'Gunakan tautan HTTP atau HTTPS dari situs publik, tanpa nama pengguna atau kata sandi.' };
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const result = {valid:true,type:'website',title:'Pratinjau situs',host,originalUrl:url.href,embedUrl:url.href};
    let match;
    if ((host === 'tiktok.com' || host === 'm.tiktok.com') && (match = url.pathname.match(/^\/@[^/]+\/video\/(\d{8,30})(?:\/|$)/))) {
      return {...result,type:'tiktok',title:'Referensi TikTok',embedUrl:'https://www.tiktok.com/embed/v2/' + match[1]};
    }
    if ((host === 'instagram.com' || host === 'm.instagram.com') && (match = url.pathname.match(/^\/(p|reel|reels)\/([A-Za-z\d_-]{3,100})(?:\/|$)/))) {
      return {...result,type:'instagram',title:'Referensi Instagram',embedUrl:'https://www.instagram.com/' + (match[1] === 'p' ? 'p' : 'reel') + '/' + match[2] + '/embed/'};
    }
    let videoId = null;
    if (host === 'youtu.be') videoId = url.pathname.split('/')[1];
    if (['youtube.com','m.youtube.com','youtube-nocookie.com'].includes(host)) {
      videoId = url.searchParams.get('v') || (url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/) || [])[1];
    }
    if (videoId && /^[A-Za-z\d_-]{11}$/.test(videoId)) return {...result,type:'youtube',title:'Referensi YouTube',embedUrl:'https://www.youtube-nocookie.com/embed/' + videoId};
    if (/\.(png|jpe?g|gif|webp|avif)$/i.test(url.pathname)) return {...result,type:'image',title:'Referensi gambar'};
    if (/\.(mp4|webm|ogv)$/i.test(url.pathname)) return {...result,type:'video',title:'Referensi video'};
    return result;
  }

  function cleanup() {
    if (!active) return;
    clearTimeout(active.timer);
    active.observer?.disconnect();
    active.controller?.abort();
    if (active.media) {
      try { active.media.pause?.(); active.media.removeAttribute('src'); active.media.load?.(); } catch (_) {}
    }
    active = null;
  }

  function open(value, options = {}) {
    const ref = describe(value);
    if (!ref.valid) { options.toast?.(ref.error); return false; }
    if (typeof options.openModal !== 'function') throw new Error('Pratinjau memerlukan openModal.');
    cleanup();
    const instance = {controller:new AbortController(),timer:null,observer:null};
    active = instance;
    const embed = !['website','image','video'].includes(ref.type);
    const secureMismatch = global.location?.protocol === 'https:' && ref.embedUrl.startsWith('http:');
    const info = secureMismatch
      ? 'Tautan HTTP tidak dapat dimuat di dashboard HTTPS. Buka tautan asli di tab baru.'
      : 'Sebagian situs, akun privat, atau konten yang memerlukan login tidak mengizinkan pratinjau. Tautan asli selalu dapat dibuka di tab baru.';
    const attrUrl = escape(ref.embedUrl);
    let content = '';
    if (secureMismatch) content = '<div class="reference-unavailable"><span aria-hidden="true">↗</span><strong>Pratinjau tidak tersedia</strong><p>Buka tautan asli untuk melihat referensi ini.</p></div>';
    else if (ref.type === 'image') content = `<img class="reference-media" src="${attrUrl}" alt="Gambar referensi konten" referrerpolicy="no-referrer" loading="eager">`;
    else if (ref.type === 'video') content = `<video class="reference-media" src="${attrUrl}" controls playsinline preload="metadata" referrerpolicy="no-referrer"></video>`;
    else content = `<iframe class="reference-frame reference-${ref.type}" title="${escape(ref.title)} dari ${escape(ref.host)}" src="${attrUrl}" referrerpolicy="no-referrer" sandbox="${embed?'allow-scripts allow-same-origin allow-popups':'allow-scripts'}" allow="fullscreen; encrypted-media; picture-in-picture" allowfullscreen loading="eager"></iframe>`;
    options.openModal(ref.title, `<div class="reference-popup"><div class="reference-toolbar"><div><span class="reference-site">${escape(ref.host)}</span><p class="reference-original" title="${escape(ref.originalUrl)}">${escape(ref.originalUrl)}</p></div><a class="btn reference-external" href="${escape(ref.originalUrl)}" target="_blank" rel="noopener noreferrer">Buka di tab baru <span aria-hidden="true">↗</span></a></div><div class="reference-notice">${escape(info)}</div><div class="reference-status" role="status">${secureMismatch?'Tautan asli tetap tersedia di atas.':'Mencoba menampilkan isi referensi…'}</div><div class="reference-viewer ${embed?'is-embed':''}">${content}</div>${typeof options.onBack==='function'?'<div class="reference-footer"><button type="button" class="btn" data-reference-back>← Kembali ke konten</button></div>':''}</div>`, true);
    const popup = document.querySelector('.reference-popup');
    const status = popup?.querySelector('.reference-status');
    const valid = () => active === instance && popup?.isConnected && !document.getElementById('modal')?.hidden;
    const update = message => { if (valid() && status) status.textContent = message; };
    const media = popup?.querySelector('iframe,img,video');
    instance.media = media;
    if (media) {
      const loaded = () => {
        clearTimeout(instance.timer);
        update(ref.type === 'image' || ref.type === 'video' ? 'Referensi siap dilihat.' : 'Jika isi tidak tampil atau meminta login, gunakan “Buka di tab baru”.');
      };
      media.addEventListener(ref.type === 'video'?'loadedmetadata':'load', loaded, {signal:instance.controller.signal});
      media.addEventListener('error', () => {
        clearTimeout(instance.timer);
        update('Situs tidak dapat ditampilkan di sini. Gunakan “Buka di tab baru” untuk melihat referensi.');
      }, {signal:instance.controller.signal});
      instance.timer = setTimeout(() => update('Pratinjau memerlukan waktu lebih lama atau dibatasi oleh situs. Anda tetap dapat membuka tautan asli di tab baru.'), 12000);
    }
    popup?.querySelector('[data-reference-back]')?.addEventListener('click', () => { cleanup(); options.onBack(); }, {signal:instance.controller.signal});
    if (typeof MutationObserver !== 'undefined') {
      instance.observer = new MutationObserver(() => { if (!valid()) cleanup(); });
      instance.observer.observe(document.getElementById('modal') || document.body, {attributes:true,childList:true,subtree:true});
    }
    return true;
  }

  global.ExataReference = Object.freeze({open,describe,isValid:value=>!!normalized(value),close:cleanup});
})(typeof window !== 'undefined' ? window : globalThis);
