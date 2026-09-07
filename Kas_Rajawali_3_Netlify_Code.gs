/**
 * KAS RAJAWALI 3 — CLEAN REBUILD
 * Google Apps Script backend
 *
 * Features:
 * - Public read-only dashboard
 * - One admin account
 * - Session token stored in CacheService
 * - Simple server-side admin password in Script Properties
 * - Login rate limiting
 * - LockService for all writes
 * - Member/payment management
 * - Cash transactions
 * - Period management
 * - QRIS/logo/banner storage
 * - Audit log (admin only)
 */

const SP = PropertiesService.getScriptProperties();
const SC = CacheService.getScriptCache();

const CFG = {
  SESSION_TTL: 7200,
  LOGIN_WINDOW: 900,
  MAX_LOGIN_ATTEMPTS: 5,
  MAX_AUDIT: 150,
  MAX_NAME: 100,
  MAX_ROLE: 40,
  MAX_NOTE: 250,
  MAX_PERIOD: 100,
  MAX_PERIODS: 60,
  MAX_MEDIA_BYTES: 4 * 1024 * 1024
};


/**
 * HTTP API bridge for Netlify frontend.
 * Netlify calls this endpoint server-to-server, so the GAS UI wrapper is not
 * exposed to normal members.
 */
const API_ENDPOINTS = Object.freeze({
  getAppData: true,
  verifyAdminLogin: true,
  logoutAdmin: true,
  getAuditLogs: true,
  apiTogglePayment: true,
  apiAddMember: true,
  apiDeleteMember: true,
  apiSaveKasTransaction: true,
  apiDeleteKasTransaction: true,
  apiCreatePeriod: true,
  apiDeletePeriod: true,
  apiSaveSettings: true,
  apiUploadMedia: true
});

function doPost(e) {
  try {
    ensureSystem_();
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const endpoint = String(body.endpoint || '');
    const args = Array.isArray(body.args) ? body.args : [];
    if (!API_ENDPOINTS[endpoint]) throw new Error('Endpoint tidak diizinkan.');
    const fnMap = {
      getAppData: getAppData,
      verifyAdminLogin: verifyAdminLogin,
      logoutAdmin: logoutAdmin,
      getAuditLogs: getAuditLogs,
      apiTogglePayment: apiTogglePayment,
      apiAddMember: apiAddMember,
      apiDeleteMember: apiDeleteMember,
      apiSaveKasTransaction: apiSaveKasTransaction,
      apiDeleteKasTransaction: apiDeleteKasTransaction,
      apiCreatePeriod: apiCreatePeriod,
      apiDeletePeriod: apiDeletePeriod,
      apiSaveSettings: apiSaveSettings,
      apiUploadMedia: apiUploadMedia
    };
    const fn = fnMap[endpoint];
    if (typeof fn !== 'function') throw new Error('Endpoint tidak tersedia.');
    const result = fn.apply(null, args);
    return jsonApi_({ ok: true, result: result });
  } catch (err) {
    return jsonApi_({ ok: false, error: String(err && err.message || err || 'Terjadi kesalahan server.') });
  }
}

function jsonApi_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  ensureSystem_();
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Kas Rajawali 3')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
}

function ensureSystem_() {
  if (!SP.getProperty('APP_DATA')) {
    SP.setProperty('APP_DATA', JSON.stringify({
      settings: {
        iuranNominal: 20000,
        adminWa: '085156908621',
        periodeCutoffList: ['5 September – 5 Oktober'],
        qrisUrl: '',
        logoUrl: '',
        bannerMedia: { type: 'image', url: '' }
      },
      members: [
        { id: 'm_' + Utilities.getUuid(), name: 'Bayu Setyawan', role: 'Danru', payments: {} },
        { id: 'm_' + Utilities.getUuid(), name: 'Tubagus Haerul Adha', role: 'Wakil', payments: {} },
        { id: 'm_' + Utilities.getUuid(), name: 'Ilham Ramadhan', role: 'Bendahara', payments: {} }
      ],
      kasHistory: [],
      periodMeta: [{ iuranNominal: 20000, createdAt: new Date().toISOString() }],
      visitorCount: 0,
      visitorResetAt: new Date().toISOString()
    }));
  }
  if (!SP.getProperty('AUDIT_LOGS')) SP.setProperty('AUDIT_LOGS', '[]');
  migratePassword_();
}

function migratePassword_() {
  // SIMPLE PASSWORD MODE:
  // The only active password source is ADMIN_PASSWORD.
  // The password is never sent to the browser.
  //
  // If an older ADMIN_PASSWORD_INITIAL exists, migrate it once.
  // Any old ADMIN_PASSWORD_HASH is removed so it can never be used again.
  const current = SP.getProperty('ADMIN_PASSWORD');

  if (!current) {
    const initial = SP.getProperty('ADMIN_PASSWORD_INITIAL');
    if (initial && String(initial).length >= 8) {
      SP.setProperty('ADMIN_PASSWORD', String(initial));
      SP.deleteProperty('ADMIN_PASSWORD_INITIAL');
    }
  }

  // Completely retire the old hash system.
  if (SP.getProperty('ADMIN_PASSWORD_HASH') !== null) {
    SP.deleteProperty('ADMIN_PASSWORD_HASH');
  }
}

function readData_() {
  ensureSystem_();
  let data;
  try {
    data = JSON.parse(SP.getProperty('APP_DATA') || '{}');
  } catch (e) {
    throw new Error('APP_DATA rusak. Periksa Script Properties.');
  }
  data.settings = data.settings || {};
  data.settings.iuranNominal = Number(data.settings.iuranNominal) || 20000;
  data.settings.adminWa = String(data.settings.adminWa || '');
  data.settings.periodeCutoffList = Array.isArray(data.settings.periodeCutoffList) && data.settings.periodeCutoffList.length
    ? data.settings.periodeCutoffList : ['Periode Baru'];
  data.settings.qrisUrl = String(data.settings.qrisUrl || '');
  data.settings.logoUrl = String(data.settings.logoUrl || '');
  data.settings.bannerMedia = data.settings.bannerMedia || { type: 'image', url: '' };
  data.members = Array.isArray(data.members) ? data.members : [];
  data.kasHistory = Array.isArray(data.kasHistory) ? data.kasHistory : [];
  data.periodMeta = Array.isArray(data.periodMeta) ? data.periodMeta : [];
  while (data.periodMeta.length < data.settings.periodeCutoffList.length) {
    data.periodMeta.push({ iuranNominal: data.settings.iuranNominal, createdAt: new Date().toISOString() });
  }
  if (data.periodMeta.length > data.settings.periodeCutoffList.length) data.periodMeta = data.periodMeta.slice(0, data.settings.periodeCutoffList.length);
  data.periodMeta = data.periodMeta.map(function(m){ return { iuranNominal: Number(m && m.iuranNominal) >= 0 ? Number(m.iuranNominal) : data.settings.iuranNominal, createdAt: String(m && m.createdAt || '') }; });
  data.visitorCount = Number(data.visitorCount) || 0;
  data.visitorResetAt = String(data.visitorResetAt || new Date().toISOString());
  return data;
}

function writeData_(data) {
  SP.setProperty('APP_DATA', JSON.stringify(data));
}

function lock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function audit_(action, details) {
  try {
    let logs = JSON.parse(SP.getProperty('AUDIT_LOGS') || '[]');
    logs.unshift({
      timestamp: new Date().toISOString(),
      action: String(action || '').slice(0, 80),
      details: String(details || '').slice(0, 600)
    });
    SP.setProperty('AUDIT_LOGS', JSON.stringify(logs.slice(0, CFG.MAX_AUDIT)));
  } catch (e) {}
}

function getAppData() {
  const data = readData_();
  // Visitor counter is a rolling 24-hour counter. It resets automatically
  // once 24 hours have elapsed since the last reset.
  try {
    const now = Date.now();
    const resetAt = new Date(data.visitorResetAt).getTime();
    if (!Number.isFinite(resetAt) || now - resetAt >= 24 * 60 * 60 * 1000) {
      data.visitorCount = 0;
      data.visitorResetAt = new Date().toISOString();
    }
    data.visitorCount++;
    writeData_(data);
  } catch (e) {}
  return {
    members: data.members,
    kasHistory: data.kasHistory,
    settings: data.settings,
    periodMeta: data.periodMeta,
    visitorCount: data.visitorCount
  };
}

function verifyAdminLogin(password, clientId) {
  ensureSystem_();
  const p = String(password || '');
  if (!p || p.length > 200) {
    return { success: false, message: 'Password tidak valid.' };
  }

  const cid = String(clientId || 'unknown')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 100) || 'unknown';

  const key = 'login_' + cid;
  const attempts = Number(SC.get(key) || 0);

  if (attempts >= CFG.MAX_LOGIN_ATTEMPTS) {
    return {
      success: false,
      message: 'Terlalu banyak percobaan gagal. Coba lagi setelah 15 menit.'
    };
  }

  const storedPassword = SP.getProperty('ADMIN_PASSWORD');

  if (!storedPassword) {
    return {
      success: false,
      message: 'ADMIN_PASSWORD belum dikonfigurasi di Script Properties.'
    };
  }

  // Direct server-side comparison.
  // ADMIN_PASSWORD is never returned to the browser.
  if (p === String(storedPassword)) {
    SC.remove(key);

    const token = 'session_' + Utilities.getUuid();
    SC.put('session_' + token, '1', CFG.SESSION_TTL);

    audit_('LOGIN_SUCCESS', 'Admin berhasil login');

    return {
      success: true,
      token: token,
      message: 'Login Admin Berhasil'
    };
  }

  const next = attempts + 1;
  SC.put(key, String(next), CFG.LOGIN_WINDOW);

  audit_(
    'LOGIN_FAILED',
    'Percobaan password salah (' + next + '/' + CFG.MAX_LOGIN_ATTEMPTS + ')'
  );

  return {
    success: false,
    message: 'Password salah! Sisa percobaan: ' +
      Math.max(0, CFG.MAX_LOGIN_ATTEMPTS - next)
  };
}

function validToken_(token) {
  const t = String(token || '');
  return /^session_[0-9a-f-]{20,100}$/i.test(t) && SC.get('session_' + t) === '1';
}

function requireAdmin_(token) {
  if (!validToken_(token)) throw new Error('UNAUTHORIZED: Sesi admin tidak valid atau telah kedaluwarsa.');
}

function logoutAdmin(token) {
  if (validToken_(token)) {
    SC.remove('session_' + token);
    audit_('LOGOUT', 'Admin logout');
  }
  return { success: true };
}

function getAuditLogs(token) {
  requireAdmin_(token);
  return { auditLogs: JSON.parse(SP.getProperty('AUDIT_LOGS') || '[]') };
}

function periodIndex_(value, count) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n >= count) throw new Error('Periode tidak valid.');
  return n;
}

function text_(value, label, max) {
  const s = String(value == null ? '' : value).trim();
  if (!s) throw new Error(label + ' wajib diisi.');
  if (s.length > max) throw new Error(label + ' terlalu panjang.');
  return s;
}

function amount_(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1000000000000) throw new Error('Nominal tidak valid.');
  return Math.round(n);
}

function date_(value) {
  const s = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Tanggal tidak valid.');
  const d = new Date(s + 'T00:00:00');
  if (isNaN(d.getTime())) throw new Error('Tanggal tidak valid.');
  return s;
}

function media_(value, label) {
  const s = String(value || '');
  if (!s) return '';
  if (/^https:\/\//i.test(s)) return s;
  const m = s.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!m) throw new Error(label + ' harus berupa PNG, JPG/JPEG, WEBP, atau URL HTTPS.');
  const bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > CFG.MAX_MEDIA_BYTES) throw new Error(label + ' terlalu besar. Maksimal 4 MB.');
  return uploadMedia_(bytes, m[1].toLowerCase(), label);
}

function uploadMedia_(bytes, mime, label) {
  const folderName = 'Kas Rajawali 3 Media';
  const folders = DriveApp.getFoldersByName(folderName);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  const ext = mime === 'image/png' ? 'png' : (mime === 'image/webp' ? 'webp' : 'jpg');
  const file = folder.createFile(Utilities.newBlob(bytes, mime, label + '_' + Utilities.getUuid() + '.' + ext));
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  // Thumbnail endpoint is more reliable for <img> rendering than the old uc?export=view URL.
  return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(file.getId()) + '&sz=w1600';
}

function apiUploadMedia(token, dataUrl, kind) {
  requireAdmin_(token);
  return lock_(function() {
    const data = readData_();
    const k = String(kind || '').toLowerCase();
    const map = { logo: 'logoUrl', banner: 'bannerMedia', qris: 'qrisUrl' };
    if (!map[k]) throw new Error('Jenis gambar tidak valid.');
    const labelMap = { logo: 'Logo', banner: 'Banner', qris: 'QRIS' };
    const uploaded = media_(dataUrl, labelMap[k]);
    if (k === 'banner') data.settings.bannerMedia = { type: 'image', url: uploaded };
    else data.settings[map[k]] = uploaded;
    writeData_(data);
    audit_('UPLOAD_MEDIA', 'Upload ' + labelMap[k] + ' berhasil');
    return { settings: data.settings };
  });
}


function validateSettings_(p, data) {
  if (p.iuranNominal !== undefined) {
    const n = Number(p.iuranNominal);
    if (!Number.isFinite(n) || n < 0 || n > 100000000) throw new Error('Nominal iuran tidak valid.');
    data.settings.iuranNominal = Math.round(n);
    data.periodMeta = Array.isArray(data.periodMeta) ? data.periodMeta : [];
    if (data.periodMeta.length) data.periodMeta[0].iuranNominal = Math.round(n);
  }
  if (p.adminWa !== undefined) {
    let wa = String(p.adminWa || '').replace(/[^0-9]/g, '');
    if (wa.indexOf('62') === 0) wa = '0' + wa.slice(2);
    if (wa.indexOf('8') === 0) wa = '0' + wa;
    data.settings.adminWa = wa.slice(0, 20);
  }
  if (p.periodeCutoffList !== undefined) {
    if (!Array.isArray(p.periodeCutoffList) || !p.periodeCutoffList.length || p.periodeCutoffList.length > CFG.MAX_PERIODS) throw new Error('Daftar periode tidak valid.');
    data.settings.periodeCutoffList = p.periodeCutoffList.map(x => text_(x, 'Nama periode', CFG.MAX_PERIOD));
  }
  if (p.qrisUrl !== undefined) {
    const q = String(p.qrisUrl || '');
    if (q && !/^https:\/\//i.test(q)) throw new Error('QRIS belum selesai diupload.');
    data.settings.qrisUrl = q;
  }
  if (p.logoUrl !== undefined) {
    const l = String(p.logoUrl || '');
    if (l && !/^https:\/\//i.test(l)) throw new Error('Logo belum selesai diupload.');
    data.settings.logoUrl = l;
  }
  if (p.bannerMedia !== undefined) {
    const bm = p.bannerMedia || {};
    const u = String(bm.url || '');
    if (u && !/^https:\/\//i.test(u)) throw new Error('Banner belum selesai diupload.');
    data.settings.bannerMedia = { type: 'image', url: u };
  }
}

function apiTogglePayment(token, memberId, periodIndex) {
  requireAdmin_(token);
  return lock_(function() {
    const data = readData_();
    const idx = periodIndex_(periodIndex, data.settings.periodeCutoffList.length);
    const id = text_(memberId, 'ID anggota', 120);
    const m = data.members.find(x => String(x.id) === id);
    if (!m) throw new Error('Anggota tidak ditemukan.');
    m.payments = m.payments || {};
    m.payments[idx] = !Boolean(m.payments[idx]);
    writeData_(data);
    audit_('TOGGLE_PAYMENT', m.name + ' → ' + (m.payments[idx] ? 'LUNAS' : 'BELUM') + ' | Periode ' + idx);
    return { members: data.members };
  });
}

function apiAddMember(token, name, role) {
  requireAdmin_(token);
  return lock_(function() {
    const data = readData_();
    const n = text_(name, 'Nama anggota', CFG.MAX_NAME);
    const r = text_(role, 'Jabatan', CFG.MAX_ROLE);
    if (data.members.some(m => String(m.name).toLowerCase() === n.toLowerCase())) throw new Error('Nama anggota sudah terdaftar.');
    data.members.push({ id: 'm_' + Utilities.getUuid(), name: n, role: r, payments: {} });
    writeData_(data);
    audit_('ADD_MEMBER', 'Tambah anggota: ' + n + ' (' + r + ')');
    return { members: data.members };
  });
}

function apiDeleteMember(token, memberId) {
  requireAdmin_(token);
  return lock_(function() {
    const data = readData_();
    const id = text_(memberId, 'ID anggota', 120);
    const m = data.members.find(x => String(x.id) === id);
    if (!m) throw new Error('Anggota tidak ditemukan.');
    data.members = data.members.filter(x => String(x.id) !== id);
    writeData_(data);
    audit_('DELETE_MEMBER', 'Hapus anggota: ' + m.name);
    return { members: data.members };
  });
}

function apiSaveKasTransaction(token, payload) {
  requireAdmin_(token);
  if (!payload || typeof payload !== 'object') throw new Error('Data transaksi tidak valid.');
  return lock_(function() {
    const data = readData_();
    const idx = periodIndex_(payload.periodeIndex, data.settings.periodeCutoffList.length);
    const tx = {
      date: date_(payload.date),
      type: payload.type === 'pemasukan' || payload.type === 'pengeluaran' ? payload.type : '',
      amount: amount_(payload.amount),
      note: text_(payload.note, 'Keterangan', CFG.MAX_NOTE),
      periodeIndex: idx
    };
    if (!tx.type) throw new Error('Jenis transaksi tidak valid.');

    const id = String(payload.id || '').trim();
    if (id) {
      const pos = data.kasHistory.findIndex(x => String(x.id) === id);
      if (pos < 0) throw new Error('Transaksi tidak ditemukan.');
      data.kasHistory[pos] = Object.assign({ id: id }, tx);
      audit_('EDIT_KAS', 'Edit ' + tx.type + ': ' + tx.note + ' (Rp ' + tx.amount + ')');
    } else {
      data.kasHistory.push(Object.assign({ id: 'k_' + Utilities.getUuid() }, tx));
      audit_('ADD_KAS', 'Catat ' + tx.type + ': ' + tx.note + ' (Rp ' + tx.amount + ')');
    }
    writeData_(data);
    return { kasHistory: data.kasHistory };
  });
}

function apiDeleteKasTransaction(token, id) {
  requireAdmin_(token);
  return lock_(function() {
    const data = readData_();
    const tid = text_(id, 'ID transaksi', 120);
    const tx = data.kasHistory.find(x => String(x.id) === tid);
    if (!tx) throw new Error('Transaksi tidak ditemukan.');
    data.kasHistory = data.kasHistory.filter(x => String(x.id) !== tid);
    writeData_(data);
    audit_('DELETE_KAS', 'Hapus transaksi: ' + tx.note);
    return { kasHistory: data.kasHistory };
  });
}

function apiCreatePeriod(token, periodName) {
  requireAdmin_(token);
  return lock_(function() {
    const data = readData_();
    const name = text_(periodName, 'Nama periode', CFG.MAX_PERIOD);
    if (data.settings.periodeCutoffList.some(function(p){ return String(p).toLowerCase() === name.toLowerCase(); })) {
      throw new Error('Nama periode sudah ada.');
    }
    if (data.settings.periodeCutoffList.length >= CFG.MAX_PERIODS) throw new Error('Maksimal 60 periode.');

    // Periode terbaru menjadi index 0. Semua data periode lama digeser 1 index.
    data.settings.periodeCutoffList.unshift(name);
    data.periodMeta.unshift({ iuranNominal: Number(data.settings.iuranNominal) || 20000, createdAt: new Date().toISOString() });

    data.members.forEach(function(m) {
      const old = m.payments || {};
      const shifted = {};
      Object.keys(old).forEach(function(k) {
        const n = Number(k);
        if (Number.isInteger(n) && n >= 0) shifted[n + 1] = Boolean(old[k]);
      });
      // index 0 sengaja kosong: periode baru = semua BELUM.
      m.payments = shifted;
    });

    data.kasHistory.forEach(function(t) { t.periodeIndex = Number(t.periodeIndex) + 1; });
    writeData_(data);
    audit_('CREATE_PERIOD', 'Buka periode baru: ' + name + ' | saldo awal otomatis dari periode sebelumnya');
    return {
      settings: data.settings,
      periodMeta: data.periodMeta,
      members: data.members,
      kasHistory: data.kasHistory
    };
  });
}

function apiDeletePeriod(token, periodIndex) {
  requireAdmin_(token);
  return lock_(function() {
    const data = readData_();
    const count = data.settings.periodeCutoffList.length;
    if (count <= 1) throw new Error('Minimal harus ada 1 periode.');
    const idx = periodIndex_(periodIndex, count);
    const removedName = data.settings.periodeCutoffList[idx];

    data.settings.periodeCutoffList.splice(idx, 1);
    if (Array.isArray(data.periodMeta)) data.periodMeta.splice(idx, 1);

    data.members.forEach(function(m) {
      const old = m.payments || {};
      const shifted = {};
      Object.keys(old).forEach(function(k) {
        const n = Number(k);
        if (!Number.isInteger(n) || n === idx) return;
        shifted[n > idx ? n - 1 : n] = Boolean(old[k]);
      });
      m.payments = shifted;
    });

    // Transactions belonging to the deleted period are deleted as well.
    data.kasHistory = data.kasHistory.filter(function(t) { return Number(t.periodeIndex) !== idx; });
    data.kasHistory.forEach(function(t) {
      const n = Number(t.periodeIndex);
      if (Number.isInteger(n) && n > idx) t.periodeIndex = n - 1;
    });

    writeData_(data);
    audit_('DELETE_PERIOD', 'Hapus periode: ' + removedName + ' | data transaksi periode ikut dihapus');
    return {
      settings: data.settings,
      periodMeta: data.periodMeta,
      members: data.members,
      kasHistory: data.kasHistory
    };
  });
}

function apiSaveSettings(token, payload) {
  requireAdmin_(token);
  if (!payload || typeof payload !== 'object') throw new Error('Data pengaturan tidak valid.');
  return lock_(function() {
    const data = readData_();
    validateSettings_(payload, data);
    if (payload.newPassword !== undefined && String(payload.newPassword).trim()) {
      const np = String(payload.newPassword).trim();
      if (np.length < 12 || np.length > 200) throw new Error('Password baru minimal 12 karakter.');
      SP.setProperty('ADMIN_PASSWORD', np);
      audit_('CHANGE_PASSWORD', 'Password admin diperbarui');
    }
    writeData_(data);
    audit_('SAVE_SETTINGS', 'Pengaturan aplikasi diperbarui');
    return { settings: data.settings };
  });
}


/**
 * SET ADMIN PASSWORD - RUN ONCE WHEN YOU NEED TO SET/RESET THE PASSWORD
 * Ganti nilai di bawah, lalu Save > Run fungsi ini.
 * Minimal 12 karakter. Password tidak pernah dikirim ke browser.
 */
