/* Local, per-account editor drafts. This file never sends data to a server. */
(function () {
  'use strict';

  const NAMESPACE = 'exata-draft-v1';
  const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const unsafeName = name => /^(?:__proto__|prototype|constructor)$/i.test(name);
  const secretName = name => /^(?:password|passwd|pwd|token|access[_-]?token|refresh[_-]?token|id[_-]?token|authorization|api[_-]?key|client[_-]?secret)$/i.test(name);
  const safeName = name => name && !unsafeName(name) && !secretName(name);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function storageError(error) {
    if (/quota|ns_error_dom_quota_reached/i.test(String(error?.name || ''))) {
      return 'Penyimpanan browser penuh. Simpan isian ke Google Sheets atau kosongkan ruang browser.';
    }
    if (/security|notallowed/i.test(String(error?.name || ''))) {
      return 'Browser memblokir penyimpanan lokal. Izinkan penyimpanan situs agar draft dapat disimpan.';
    }
    return 'Penyimpanan lokal belum dapat digunakan. Isian belum tersimpan otomatis di perangkat ini.';
  }

  function createStore(scope) {
    // Callers supply endpoint + user identity, never an authentication token.
    const scopeId = String(scope ?? 'demo');
    let lastError = '';
    const key = (kind, id = 'new') => NAMESPACE + ':' + JSON.stringify([scopeId, String(kind), String(id)]);
    const validEnvelope = value => isObject(value) && value.version === 1 &&
      typeof value.savedAt === 'string' && Number.isFinite(Date.parse(value.savedAt)) &&
      new Date(value.savedAt).toISOString() === value.savedAt && isObject(value.payload);
    return Object.freeze({
      get lastError() { return lastError; },
      read(kind, id = 'new') {
        lastError = '';
        try {
          const raw = window.localStorage.getItem(key(kind, id));
          if (raw === null) return null;
          let result;
          try { result = JSON.parse(raw); } catch (_) { /* Keep unreadable data for recovery. */ }
          if (!validEnvelope(result)) {
            lastError = 'Draft di perangkat ini tidak dapat dibaca. Data tersimpan belum dihapus.';
            return null;
          }
          return result;
        } catch (error) {
          lastError = storageError(error);
          return null;
        }
      },
      save(kind, id = 'new', payload) {
        lastError = '';
        if (!isObject(payload)) {
          lastError = 'Format draft tidak valid. Draft sebelumnya tetap disimpan.';
          return {ok:false, error:lastError};
        }
        try {
          const savedAt = new Date().toISOString();
          // Exclude credentials even if a future caller accidentally includes them.
          const raw = JSON.stringify({version:1, savedAt, payload}, (name, value) =>
            name && (!safeName(name)) ? undefined : value);
          if (!validEnvelope(JSON.parse(raw))) {
            lastError = 'Format draft tidak valid. Draft sebelumnya tetap disimpan.';
            return {ok:false, error:lastError};
          }
          window.localStorage.setItem(key(kind, id), raw);
          return {ok:true, savedAt};
        } catch (error) {
          lastError = storageError(error);
          return {ok:false, error:lastError};
        }
      },
      remove(kind, id = 'new') {
        lastError = '';
        try {
          window.localStorage.removeItem(key(kind, id));
          return {ok:true};
        } catch (error) {
          lastError = storageError(error);
          return {ok:false, error:lastError};
        }
      }
    });
  }

  function notice(options = {}) {
    const {savedAt, restored = false, error = '', hasDraft = false, confirmDiscard = false} = options;
    let time = '';
    if (savedAt && Number.isFinite(Date.parse(savedAt))) {
      time = new Date(savedAt).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
    }
    const confirming = Boolean(hasDraft && confirmDiscard);
    const title = error ? 'Draft lokal bermasalah' : restored ? 'Draft dipulihkan' :
      hasDraft ? 'Draft tersimpan di perangkat ini' : 'Draft otomatis aktif';
    return `<div class="draft-notice${error?' is-error':''}${confirming?' is-confirming':''}" role="${error?'alert':'status'}" aria-live="polite"><span class="draft-notice-icon" aria-hidden="true">${error?'!':'↺'}</span><div class="draft-notice-copy"><strong>${esc(title)}${time && !error?` <small>· ${esc(time)}</small>`:''}</strong><p>${error?esc(error):'Isian dipertahankan saat popup ditutup atau halaman dimuat ulang.'}</p><small>Draft hanya untuk browser dan perangkat ini, belum tersimpan ke Google Sheets.</small>${confirming?'<div class="draft-discard-confirm"><span>Hapus draft ini? Isian yang belum disimpan akan dibuang.</span><div><button type="button" class="draft-confirm-delete" data-draft-action="confirm-discard">Ya, hapus draft</button><button type="button" data-draft-action="cancel-discard">Batal</button></div></div>':''}</div>${hasDraft && !confirming?'<button type="button" class="draft-discard" data-draft-action="ask-discard">Hapus draft</button>':''}</div>`;
  }

  function bindForm(form, options = {}) {
    const {store, kind = 'content', id = 'new', onDiscard, onRestore} = options;
    if (!form || !store) throw new TypeError('bindForm memerlukan form dan draft store.');
    const document = form.ownerDocument;
    const view = document.defaultView || window;
    const fixedId = id === 'new' ? null : String(id);
    let disposed = false, stopped = false, hasDraft = false, restored = false;
    let savedAt = '', error = '', confirmDiscard = false, lastSavedSnapshot = '';
    let host = form.querySelector('[data-draft-status]');
    if (!host) {
      host = document.createElement('div');
      host.setAttribute('data-draft-status', '');
      form.prepend(host);
    }

    function groups() {
      const result = new Map();
      Array.from(form.elements).forEach(control => {
        const name = control.getAttribute('name');
        if (!safeName(name) || !/^(INPUT|TEXTAREA|SELECT)$/.test(control.tagName) ||
          /^(?:password|file|submit|reset|button|image)$/i.test(control.type)) return;
        if (!result.has(name)) result.set(name, []);
        result.get(name).push(control);
      });
      return result;
    }

    function snapshot() {
      const fields = Object.create(null);
      groups().forEach((controls, name) => {
        const first = controls[0];
        if (first.type === 'radio') fields[name] = controls.find(control => control.checked)?.value ?? '';
        else if (first.type === 'checkbox') fields[name] = controls.length === 1 ? first.checked :
          controls.filter(control => control.checked).map(control => control.value);
        else if (first.multiple) fields[name] = Array.from(first.selectedOptions).map(option => option.value);
        else fields[name] = controls.length === 1 ? first.value : controls.map(control => control.value);
      });
      if (fixedId !== null && hasOwn(fields, 'recordId')) fields.recordId = fixedId;
      return {fields};
    }

    function renderNotice() {
      host.innerHTML = notice({savedAt, restored, error, hasDraft, confirmDiscard});
    }

    function restore(fields) {
      const safeFields = Object.create(null);
      Object.entries(fields).forEach(([name, value]) => {
        if (safeName(name) && (typeof value === 'string' || typeof value === 'boolean' ||
          typeof value === 'number' || (Array.isArray(value) && value.every(item => typeof item === 'string')))) {
          safeFields[name] = value;
        }
      });
      if (fixedId !== null) safeFields.recordId = fixedId;
      // Dependent selects (platform → format) can be rebuilt before values are applied.
      if (typeof onRestore === 'function') onRestore(safeFields);
      groups().forEach((controls, name) => {
        if (!hasOwn(safeFields, name)) return;
        const value = safeFields[name], first = controls[0];
        if (first.type === 'radio') controls.forEach(control => { control.checked = control.value === String(value); });
        else if (first.type === 'checkbox') controls.forEach(control => {
          control.checked = Array.isArray(value) ? value.includes(control.value) : value === true;
        });
        else if (first.multiple) Array.from(first.options).forEach(option => {
          option.selected = Array.isArray(value) && value.includes(option.value);
        });
        else controls.forEach((control, index) => { control.value = String(Array.isArray(value) ? value[index] ?? '' : value); });
      });
    }

    const baseline = JSON.stringify(snapshot());
    const draft = store.read(kind, id);
    error = store.lastError || '';
    if (draft) {
      const fields = isObject(draft.payload?.fields) ? draft.payload.fields : draft.payload;
      try {
        restore(fields);
        hasDraft = true;
        restored = true;
        savedAt = draft.savedAt;
        lastSavedSnapshot = JSON.stringify(snapshot());
      } catch (_) {
        error = 'Draft belum dapat dipulihkan. Data tersimpan belum dihapus.';
      }
    }
    renderNotice();

    function flush() {
      if (disposed || stopped) return {ok:true, skipped:true};
      const payload = snapshot(), serialized = JSON.stringify(payload);
      if (serialized === baseline) {
        if (!hasDraft) return {ok:!error, skipped:true, ...(error?{error}:{})};
        const result = store.remove(kind, id);
        if (result.ok) {
          hasDraft = false; restored = false; savedAt = ''; error = ''; lastSavedSnapshot = '';
          confirmDiscard = false;
        } else error = result.error;
        renderNotice();
        return result;
      }
      if (hasDraft && serialized === lastSavedSnapshot && !error) return {ok:true, savedAt};
      const result = store.save(kind, id, payload);
      if (result.ok) {
        hasDraft = true; restored = false; savedAt = result.savedAt; error = '';
        lastSavedSnapshot = serialized;
      } else error = result.error;
      renderNotice();
      return result;
    }

    function markSaved() {
      // The server has accepted this editor. Cleanup must never recreate its draft.
      stopped = true;
      const result = store.remove(kind, id);
      if (result.ok) {
        hasDraft = false; restored = false; savedAt = ''; error = ''; confirmDiscard = false;
      } else error = result.error;
      renderNotice();
      return result;
    }

    function fieldChanged() {
      flush();
      // Capture synchronous dependent-field updates in ancestor change handlers too.
      Promise.resolve().then(() => { if (!disposed && !stopped) flush(); });
    }

    function draftAction(event) {
      const button = event.target.closest?.('[data-draft-action]');
      if (!button || !host.contains(button)) return;
      event.preventDefault();
      event.stopPropagation();
      const action = button.dataset.draftAction;
      if (action === 'ask-discard') { confirmDiscard = true; renderNotice(); }
      else if (action === 'cancel-discard') { confirmDiscard = false; renderNotice(); }
      else if (action === 'confirm-discard' && confirmDiscard) {
        const result = store.remove(kind, id);
        if (!result.ok) { error = result.error; renderNotice(); return; }
        stopped = true; hasDraft = false; restored = false; savedAt = ''; error = ''; confirmDiscard = false;
        renderNotice();
        if (typeof onDiscard === 'function') onDiscard();
      }
    }

    form.addEventListener('input', fieldChanged);
    form.addEventListener('change', fieldChanged);
    form.addEventListener('submit', flush, true);
    host.addEventListener('click', draftAction);
    view.addEventListener('pagehide', flush);
    view.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', flush);

    function dispose() {
      if (disposed) return;
      flush();
      disposed = true;
      form.removeEventListener('input', fieldChanged);
      form.removeEventListener('change', fieldChanged);
      form.removeEventListener('submit', flush, true);
      host.removeEventListener('click', draftAction);
      view.removeEventListener('pagehide', flush);
      view.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', flush);
    }

    return Object.freeze({flush, markSaved, dispose, get restored() { return restored; }});
  }

  window.ExataDrafts = Object.freeze({createStore, notice, bindForm});
})();
