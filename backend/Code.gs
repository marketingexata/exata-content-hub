/**
 * Exata Content Hub — Google Sheets / Apps Script backend.
 * Pasang sebagai script yang terikat ke Google Spreadsheet, lalu jalankan
 * setupSpreadsheet() dan createUser() dari editor. Lihat panduan.md.
 * Semua data tim tetap di Spreadsheet; sesi sementara di CacheService.
 */
var EXATA = Object.freeze({
  divisions: ['Exata AI', 'Exata MT', 'Exata SN', 'JP Smart', 'JLCT', 'J-Expert'],
  platforms: ['Instagram', 'TikTok'],
  statuses: ['Draft', 'Review', 'Terjadwal', 'Terbit'],
  sessionSeconds: 14400,
  passwordIterations: 100000,
  maxLoginAttempts: 8,
  loginWindowSeconds: 900,
  headers: {
    Users: ['id', 'email', 'name', 'salt', 'passwordHash', 'iterations', 'role', 'active'],
    Content: ['id', 'title', 'division', 'platform', 'format', 'status', 'date', 'time', 'owner', 'caption', 'url', 'referenceUrl', 'createdAt', 'updatedAt'],
    Insights: ['id', 'contentId', 'date', 'views', 'reach', 'likes', 'comments', 'shares', 'saves', 'followers', 'profileVisits', 'accountsEngaged', 'watchTimeSeconds', 'avgWatchTimeSeconds', 'completionRate', 'skipRate', 'replies', 'linkClicks', 'tapsForward', 'tapsBack', 'nextStory', 'exits', 'source', 'notes', 'createdAt', 'updatedAt'],
    History: ['id', 'entityType', 'entityId', 'action', 'at', 'actorName', 'actorEmail', 'before', 'after']
  }
});

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Exata Content Hub')
    .addItem('Siapkan database', 'setupSpreadsheet')
    .addItem('Tambah / reset akun', 'createUser')
    .addToUi();
}

/** Run once in a bound script. Never deletes existing rows. */
function setupSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Buka Apps Script melalui menu Ekstensi di Spreadsheet tujuan.');
  var props = PropertiesService.getScriptProperties();
  var oldId = props.getProperty('SPREADSHEET_ID');
  if (oldId && oldId !== ss.getId()) throw new Error('Script telah terhubung ke Spreadsheet lain. Gunakan project Apps Script baru.');
  props.setProperty('SPREADSHEET_ID', ss.getId());
  if (!props.getProperty('PASSWORD_PEPPER')) {
    props.setProperty('PASSWORD_PEPPER', Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid());
  }
  Object.keys(EXATA.headers).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var headers = EXATA.headers[name];
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8edf7');
      sh.setFrozenRows(1);
      sh.autoResizeColumns(1, headers.length);
    } else {
      migrateHeaders_(sh, headers);
    }
  });
  ss.toast('Database dan riwayat siap. Data lama tetap tersimpan.', 'Exata Content Hub', 8);
}

/** Password is entered in a masked dialog, never in source code or a cell. */
function createUser() {
  database_();
  var html = '<!doctype html><html lang="id"><head><base target="_top"><style>' +
    'body{font:14px Arial;padding:20px;color:#17213b}label{display:block;margin:12px 0 5px}' +
    'input,select,button{box-sizing:border-box;width:100%;padding:10px;border:1px solid #ccd3df;border-radius:7px}' +
    'button{margin-top:20px;background:#355af5;color:white;cursor:pointer}small{color:#65718a}#result{margin-top:12px}' +
    '</style></head><body><h3>Tambah / reset akun</h3><small>Email yang sudah ada akan diperbarui. Semua sesi akun tersebut dicabut.</small>' +
    '<form id="form"><label>Nama</label><input name="name" required maxlength="100">' +
    '<label>Email</label><input name="email" type="email" required maxlength="200">' +
    '<label>Kata sandi baru</label><input name="password" type="password" required minlength="12" maxlength="256" autocomplete="new-password">' +
    '<small>Minimal 12 karakter. Kata sandi tidak disimpan sebagai teks.</small>' +
    '<label>Peran</label><select name="role"><option value="editor">Editor — input dan ubah data</option><option value="admin">Admin — input dan ubah data</option><option value="viewer">Viewer — hanya baca dan ekspor</option></select>' +
    '<button id="submit" type="submit">Simpan akun</button></form><div id="result" role="status"></div>' +
    '<script>document.getElementById("form").onsubmit=function(e){e.preventDefault();var f=e.target,b=document.getElementById("submit"),r=document.getElementById("result");b.disabled=true;r.textContent="Menyimpan hash kata sandi…";google.script.run.withSuccessHandler(function(){f.password.value="";r.textContent="Akun berhasil disimpan. Dialog dapat ditutup.";b.disabled=false;}).withFailureHandler(function(err){r.textContent=err.message||"Gagal menyimpan akun";b.disabled=false;}).createUserFromDialog({email:f.email.value,name:f.name.value,password:f.password.value,role:f.role.value});};</script></body></html>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(440).setHeight(620), 'Kelola akun tim');
}

/** Invoked only through the bound spreadsheet's editor dialog, not HTTP API. */
function createUserFromDialog(input) {
  // Reject anonymous / execute-as-owner web-app calls to this editor-only function.
  var actor = Session.getActiveUser().getEmail();
  var effective = Session.getEffectiveUser().getEmail();
  if (!actor || actor.toLowerCase() !== effective.toLowerCase()) throw new Error('Jalankan pengelolaan akun dari Spreadsheet atau editor Apps Script.');
  var email = email_(input.email);
  var name = text_(input.name, 'Nama', 100, true);
  var password = String(input.password || '');
  if (password.length < 12 || password.length > 256) throw new Error('Kata sandi harus 12–256 karakter.');
  var role = oneOf_(input.role || 'editor', ['admin', 'editor', 'viewer'], 'Peran');
  var salt = Utilities.getUuid() + Utilities.getUuid();
  var hash = derivePasswordHash_(password, salt, EXATA.passwordIterations);
  return withLock_(function () {
    var users = records_('Users');
    var previous = users.filter(function (u) { return String(u.email).toLowerCase() === email; })[0];
    var user = {
      id: previous ? previous.id : Utilities.getUuid(), email: email, name: name,
      salt: salt, passwordHash: hash, iterations: EXATA.passwordIterations, role: role, active: true
    };
    writeRecord_('Users', user, previous ? previous._row : null);
    // Session fingerprints include the password hash, so a reset revokes existing tokens.
    return { ok: true, user: publicUser_(user) };
  });
}

function doGet() {
  return json_({ ok: true, service: 'Exata Content Hub API', version: 2, message: 'Gunakan POST untuk login dan akses data.' });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents || e.postData.contents.length > 100000) fail_('Permintaan tidak valid.');
    var body;
    try { body = JSON.parse(e.postData.contents); } catch (_) { fail_('Format JSON tidak valid.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail_('Permintaan tidak valid.');
    if (body.action === 'login') return json_(login_(body));
    var user = authenticate_(body.token);
    if (body.action === 'logout') {
      CacheService.getScriptCache().remove(sessionKey_(body.token));
      return json_({ ok: true });
    }
    if (body.action === 'bootstrap') return json_({
      ok: true, user: publicUser_(user),
      contents: records_('Content').map(cleanRecord_),
      insights: records_('Insights').map(cleanRecord_),
      history: records_('History').map(cleanHistory_)
    });
    if (user.role !== 'admin' && user.role !== 'editor') fail_('Akun ini hanya dapat membaca dan mengekspor data.');
    if (body.action === 'saveContent') return json_(saveContent_(body.content, user));
    if (body.action === 'deleteContent') return json_(deleteContent_(body.id, user));
    if (body.action === 'saveInsight') return json_(saveInsight_(body.insight, user));
    fail_('Aksi tidak dikenal.');
  } catch (error) {
    // Never include request bodies, tokens, passwords, or raw infrastructure errors in responses.
    if (!error.safe) console.error('Exata API internal failure: ' + error.name);
    return json_({ ok: false, error: error.safe ? error.message : 'Layanan belum siap atau sedang bermasalah. Periksa konfigurasi Apps Script.' });
  }
}

function login_(body) {
  var rawEmail = String(body.email || '').trim().toLowerCase();
  var password = String(body.password || '');
  if (!rawEmail || rawEmail.length > 200 || !password || password.length > 256) fail_('Email atau kata sandi tidak sesuai.');
  var cache = CacheService.getScriptCache();
  var attemptKey = 'login:' + sha256_(rawEmail);
  var attempts = Number(cache.get(attemptKey) || 0);
  if (attempts >= EXATA.maxLoginAttempts) fail_('Terlalu banyak percobaan. Coba kembali dalam 15 menit.');
  var users = records_('Users');
  var user = users.filter(function (u) { return String(u.email).trim().toLowerCase() === rawEmail; })[0];
  var candidate = derivePasswordHash_(password, user ? String(user.salt) : 'invalid-account-dummy-salt', user ? Number(user.iterations) : EXATA.passwordIterations);
  if (!user || !isActive_(user.active) || !constantEqual_(candidate, String(user.passwordHash))) {
    cache.put(attemptKey, String(attempts + 1), EXATA.loginWindowSeconds);
    fail_('Email atau kata sandi tidak sesuai.');
  }
  cache.remove(attemptKey);
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var expiresAt = Date.now() + EXATA.sessionSeconds * 1000;
  cache.put(sessionKey_(token), JSON.stringify({ id: user.id, fingerprint: sha256_(String(user.passwordHash)), expiresAt: expiresAt }), EXATA.sessionSeconds);
  return { ok: true, token: token, user: publicUser_(user), expiresAt: expiresAt };
}

function authenticate_(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) fail_('Sesi berakhir. Silakan masuk kembali.');
  var encoded = CacheService.getScriptCache().get(sessionKey_(token));
  if (!encoded) fail_('Sesi berakhir. Silakan masuk kembali.');
  var session = JSON.parse(encoded);
  if (Date.now() >= session.expiresAt) fail_('Sesi berakhir. Silakan masuk kembali.');
  var user = records_('Users').filter(function (u) { return String(u.id) === String(session.id); })[0];
  if (!user || !isActive_(user.active) || !constantEqual_(sha256_(String(user.passwordHash)), session.fingerprint)) fail_('Sesi berakhir. Silakan masuk kembali.');
  if (['admin', 'editor', 'viewer'].indexOf(String(user.role)) === -1) fail_('Peran akun tidak valid. Hubungi admin.');
  return user;
}

/** Mutations are serialized. The API never accepts History writes from clients. */
function saveContent_(input, user) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail_('Data konten tidak valid.');
  var record = {
    id: input.id ? id_(input.id) : Utilities.getUuid(),
    title: text_(input.title, 'Judul', 180, true),
    division: oneOf_(input.division, EXATA.divisions, 'Divisi'),
    platform: oneOf_(input.platform, EXATA.platforms, 'Platform'),
    format: text_(input.format || 'Video', 'Format', 40, true),
    status: oneOf_(input.status || 'Draft', EXATA.statuses, 'Status'),
    date: date_(input.date), time: String(input.time || '09:00'),
    owner: text_(input.owner || user.name, 'Penanggung jawab', 100, true),
    caption: text_(input.caption, 'Caption', 10000, false),
    url: url_(input.url, 'Tautan konten')
  };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(record.time)) fail_('Waktu harus menggunakan format HH:mm.');
  return withLock_(function () {
    var existing = records_('Content').filter(function (c) { return String(c.id) === record.id; })[0];
    record.referenceUrl = input.referenceUrl === undefined && existing ? String(existing.referenceUrl || '') : url_(input.referenceUrl, 'Tautan referensi');
    record.createdAt = existing ? String(existing.createdAt || '') : now_();
    record.updatedAt = now_();
    var entry = historyEntry_('content', record.id, existing ? 'UPDATE' : 'CREATE', user, existing, record);
    // Preflight History before touching data, so an unmigrated sheet cannot lose the audit.
    sheet_('History');
    writeRecord_('Content', record, existing ? existing._row : null);
    writeRecord_('History', entry);
    return { ok: true, content: record, history: [cleanHistory_(entry)] };
  });
}

function deleteContent_(value, user) {
  var id = id_(value);
  return withLock_(function () {
    var existing = records_('Content').filter(function (c) { return String(c.id) === id; })[0];
    if (!existing) fail_('Konten tidak ditemukan.');
    var insights = records_('Insights').filter(function (i) { return String(i.contentId) === id; });
    var entries = insights.map(function (i) { return historyEntry_('insight', String(i.id), 'DELETE', user, i, null); });
    entries.push(historyEntry_('content', id, 'DELETE', user, existing, null));
    sheet_('History');
    var insightSheet = sheet_('Insights');
    insights.sort(function (a, b) { return b._row - a._row; }).forEach(function (i) { insightSheet.deleteRow(i._row); });
    sheet_('Content').deleteRow(existing._row);
    entries.forEach(function (entry) { writeRecord_('History', entry); });
    return { ok: true, id: id, history: entries.map(cleanHistory_) };
  });
}

function insightMetricKeys_() {
  return ['views', 'reach', 'likes', 'comments', 'shares', 'saves', 'followers', 'profileVisits', 'accountsEngaged', 'watchTimeSeconds', 'avgWatchTimeSeconds', 'completionRate', 'skipRate', 'replies', 'linkClicks', 'tapsForward', 'tapsBack', 'nextStory', 'exits'];
}
function metric_(value, key) {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value !== 'number' && typeof value !== 'string') fail_('Metrik ' + key + ' tidak valid.');
  if (typeof value === 'string' && !value.trim()) return null;
  var number = Number(value), percent = key === 'completionRate' || key === 'skipRate';
  var fractional = percent || key === 'watchTimeSeconds' || key === 'avgWatchTimeSeconds';
  if (!Number.isFinite(number) || number < 0 || number > (percent ? 100 : 1000000000000) || (!fractional && Math.floor(number) !== number)) {
    fail_('Metrik ' + key + (percent ? ' harus 0–100 persen.' : fractional ? ' harus berupa angka positif atau nol (satuan detik).' : ' harus berupa bilangan bulat positif atau nol.'));
  }
  return number;
}
function saveInsight_(input, user) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail_('Data insight tidak valid.');
  var record = { id: input.id ? id_(input.id) : Utilities.getUuid(), contentId: id_(input.contentId), date: date_(input.date) };
  // Validate before taking the lock; missing values remain unknown, not invented zeros.
  insightMetricKeys_().forEach(function (key) { if (Object.prototype.hasOwnProperty.call(input, key)) record[key] = metric_(input[key], key); });
  return withLock_(function () {
    if (!records_('Content').some(function (c) { return String(c.id) === record.contentId; })) fail_('Pilih konten yang tersedia di kalender.');
    var insights = records_('Insights');
    var idMatch = insights.filter(function (i) { return String(i.id) === record.id; })[0];
    if (idMatch && (String(idMatch.contentId) !== record.contentId || String(idMatch.date) !== record.date)) fail_('Konten dan tanggal insight yang sudah disimpan tidak dapat diganti. Buat catatan baru.');
    var existing = insights.filter(function (i) { return String(i.contentId) === record.contentId && String(i.date) === record.date; })[0];
    if (existing) record.id = String(existing.id);
    insightMetricKeys_().forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(record, key)) record[key] = existing ? metric_(existing[key], key) : null;
    });
    if (!insightMetricKeys_().some(function (key) { return record[key] !== null; })) fail_('Isi setidaknya satu metrik yang tersedia di dashboard platform.');
    record.source = oneOf_(input.source || (existing && existing.source) || 'manual', ['manual', 'ocr'], 'Sumber insight');
    record.notes = input.notes === undefined && existing ? String(existing.notes || '') : text_(input.notes, 'Catatan insight', 2000, false);
    record.createdAt = existing ? String(existing.createdAt || '') : now_();
    record.updatedAt = now_();
    var entry = historyEntry_('insight', record.id, existing ? 'UPDATE' : 'CREATE', user, existing, record);
    sheet_('History');
    writeRecord_('Insights', record, existing ? existing._row : null);
    writeRecord_('History', entry);
    return { ok: true, insight: record, history: [cleanHistory_(entry)] };
  });
}
function historyEntry_(entityType, entityId, action, user, before, after) {
  // Never audit Users, credentials, request bodies, screenshot binaries, or tokens.
  var entry = { id: Utilities.getUuid(), entityType: entityType, entityId: entityId, action: action, at: now_(), actorName: String(user.name), actorEmail: String(user.email), before: before ? JSON.stringify(cleanRecord_(before)) : '', after: after ? JSON.stringify(cleanRecord_(after)) : '' };
  if (entry.before.length > 45000 || entry.after.length > 45000) fail_('Data riwayat terlalu panjang. Kurangi caption atau catatan.');
  return entry;
}
function cleanHistory_(record) {
  var output = cleanRecord_(record);
  ['before', 'after'].forEach(function (key) {
    var value = output[key];
    if (!value) output[key] = null;
    else if (typeof value === 'string') {
      try { output[key] = JSON.parse(value); } catch (_) { output[key] = null; output.snapshotUnavailable = true; }
    }
  });
  return output;
}
function now_() { return new Date().toISOString(); }
function url_(value, label) {
  var url = text_(value, label, 2048, false);
  if (url && !/^https?:\/\/[^\s]+$/i.test(url)) fail_(label + ' harus diawali http:// atau https://.');
  return url;
}

function database_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) fail_('Database belum disiapkan. Admin perlu menjalankan setupSpreadsheet().');
  return SpreadsheetApp.openById(id);
}
function sheet_(name) {
  var sh = database_().getSheetByName(name);
  if (!sh) fail_('Sheet ' + name + ' belum tersedia. Jalankan setupSpreadsheet().');
  assertHeaders_(sh, EXATA.headers[name]);
  return sh;
}
function migrateHeaders_(sh, headers) {
  var values = sh.getDataRange().getValues();
  var current = values.length ? values[0].slice() : [];
  while (current.length && (current[current.length - 1] === '' || current[current.length - 1] === undefined)) current.pop();
  var length = Math.min(current.length, headers.length);
  for (var i = 0; i < length; i++) {
    if (current[i] !== headers[i]) fail_('Header sheet ' + sh.getName() + ' tidak sesuai. Migrasi dihentikan tanpa menimpa data; pulihkan urutan header lama.');
  }
  if (current.length < headers.length) {
    var missing = headers.slice(current.length);
    sh.getRange(1, current.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold').setBackground('#edf5ee');
  }
  assertHeaders_(sh, headers);
}
function assertHeaders_(sh, headers) {
  var existing = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  if (existing.join('|') !== headers.join('|')) fail_('Header sheet ' + sh.getName() + ' tidak sesuai. Jangan ubah urutan kolom.');
}
function records_(name) {
  var sh = sheet_(name), values = sh.getDataRange().getValues(), headers = EXATA.headers[name];
  return values.slice(1).map(function (row, index) {
    var record = { _row: index + 2 };
    headers.forEach(function (key, column) {
      var value = row[column];
      if (value instanceof Date) value = ['at', 'createdAt', 'updatedAt'].indexOf(key) !== -1 ? value.toISOString() : Utilities.formatDate(value, database_().getSpreadsheetTimeZone(), key === 'time' ? 'HH:mm' : 'yyyy-MM-dd');
      if (name === 'Insights' && insightMetricKeys_().indexOf(key) !== -1 && (value === '' || value === undefined)) value = null;
      if (value === undefined) value = '';
      record[key] = value;
    });
    return record;
  }).filter(function (record) { return String(record.id).trim() !== ''; });
}
function writeRecord_(name, record, row) {
  var sh = sheet_(name);
  var values = EXATA.headers[name].map(function (key) {
    var value = record[key] === undefined || record[key] === null ? '' : record[key];
    // Prevent formula execution when data is entered through this API.
    // Also keep date/time/id/hash columns as literal strings.
    if (typeof value === 'string' && (/^[=+\-@]/.test(value) || key === 'date' || key === 'time' || key === 'id' || key === 'contentId' || key === 'salt' || key === 'passwordHash' || key === 'at' || key === 'createdAt' || key === 'updatedAt')) return "'" + value;
    return value;
  });
  sh.getRange(row || Math.max(2, sh.getLastRow() + 1), 1, 1, values.length).setValues([values]);
  SpreadsheetApp.flush();
}
function cleanRecord_(record) {
  var output = {};
  Object.keys(record).forEach(function (key) { if (key !== '_row') output[key] = record[key]; });
  return output;
}
function publicUser_(user) { return { id: String(user.id), email: String(user.email), name: String(user.name), role: String(user.role) }; }
function isActive_(value) { return value === true || String(value).toLowerCase() === 'true'; }
function withLock_(work) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) fail_('Database sedang digunakan. Silakan coba kembali.');
  try { return work(); } finally { lock.releaseLock(); }
}
function id_(value) { return text_(value, 'ID', 100, true); }
function text_(value, label, max, required) {
  var output = value === null || value === undefined ? '' : String(value).trim();
  if ((required && !output) || output.length > max) fail_(label + (required && !output ? ' wajib diisi.' : ' terlalu panjang (maksimal ' + max + ' karakter).'));
  return output;
}
function oneOf_(value, options, label) {
  var output = String(value || '');
  if (options.indexOf(output) === -1) fail_(label + ' tidak valid.');
  return output;
}
function email_(value) {
  var email = text_(value, 'Email', 200, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail_('Alamat email tidak valid.');
  return email;
}
function date_(value) {
  var date = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail_('Tanggal harus menggunakan format YYYY-MM-DD.');
  var parts = date.split('-').map(Number), parsed = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (parts[0] < 2000 || parts[0] > 2100 || parsed.getUTCFullYear() !== parts[0] || parsed.getUTCMonth() !== parts[1] - 1 || parsed.getUTCDate() !== parts[2]) fail_('Tanggal tidak valid (tahun 2000–2100).');
  return date;
}
function sessionKey_(token) { return 'session:' + sha256_(String(token)); }
function sha256_(value) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8)); }
function hex_(bytes) { return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join(''); }
function constantEqual_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  var mismatch = a.length ^ b.length, length = Math.max(a.length, b.length);
  for (var i = 0; i < length; i++) mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return mismatch === 0;
}
function derivePasswordHash_(password, salt, iterations) {
  var pepper = PropertiesService.getScriptProperties().getProperty('PASSWORD_PEPPER');
  if (!pepper) fail_('Konfigurasi autentikasi belum tersedia. Jalankan setupSpreadsheet().');
  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 1000000) fail_('Konfigurasi hash akun tidak valid. Reset akun melalui createUser().');
  // A server-only pepper adds protection if the spreadsheet is exposed separately.
  var key = Utilities.computeHmacSha256Signature(password, pepper, Utilities.Charset.UTF_8);
  return hex_(pbkdf2_(key, Utilities.newBlob(String(salt)).getBytes(), iterations));
}
function pbkdf2_(key, salt, iterations) {
  // One SHA-256 block yields a 256-bit PBKDF2-HMAC-SHA256 result.
  var u = Utilities.computeHmacSha256Signature(salt.concat([0, 0, 0, 1]), key);
  var result = u.slice();
  for (var n = 1; n < iterations; n++) {
    u = Utilities.computeHmacSha256Signature(u, key);
    for (var j = 0; j < result.length; j++) result[j] = result[j] ^ u[j];
  }
  // GAS byte arrays are signed. Normalize XOR output before passing it on.
  return result.map(function (b) { return b > 127 ? b - 256 : b; });
}
function fail_(message) { var error = new Error(message); error.safe = true; throw error; }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
