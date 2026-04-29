import { db } from './firebase';
import { ref, get, set, push, update, remove, onValue, onChildAdded, off } from 'firebase/database';

export class DatasetEngine {
  ownerUid: string;
  appId: string;
  basePath: string;
  private _listeners: Map<string, { ref: any, handler: any, eventType?: string }> = new Map();
  private _offlineQueue: any[] = [];
  private _isOffline = !navigator.onLine;

  constructor(ownerUid: string, appId: string) {
    this.ownerUid = ownerUid;
    this.appId = appId;
    this.basePath = `/proddata/${ownerUid}/${appId}`;
    this._initOfflineSupport();
  }

  private _initOfflineSupport() {
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this._isOffline = false;
      this._processQueue();
    });
    window.addEventListener('offline', () => {
      this._isOffline = true;
    });

    // Load queue from storage
    const stored = localStorage.getItem(`aiplex_queue_${this.appId}`);
    if (stored) {
      this._offlineQueue = JSON.parse(stored);
      if (!this._isOffline) this._processQueue();
    }
  }

  private async _processQueue() {
    if (this._offlineQueue.length === 0) return;
    const item = this._offlineQueue[0];
    try {
      if (item.type === 'set') {
        await set(this._ref(item.path), item.value);
      } else if (item.type === 'update') {
        await update(this._ref(item.path), item.value);
      } else if (item.type === 'push') {
        const pRef = item.pushKey ? ref(db, `${this._ref(item.path).toString()}/${item.pushKey}`) : push(this._ref(item.path));
        await set(pRef, item.value);
      } else if (item.type === 'remove') {
        await remove(this._ref(item.path));
      }
      
      this._offlineQueue.shift();
      this._saveQueue();
      this._processQueue(); // Next one
    } catch (err) {
      console.error('Sync failed, will retry', err);
    }
  }

  private _saveQueue() {
    localStorage.setItem(`aiplex_queue_${this.appId}`, JSON.stringify(this._offlineQueue));
  }

  private _cacheData(key: string, data: any) {
    localStorage.setItem(`aiplex_cache_${this.appId}_${key}`, JSON.stringify(data));
  }

  private _getCached(key: string) {
    const data = localStorage.getItem(`aiplex_cache_${this.appId}_${key}`);
    return data ? JSON.parse(data) : null;
  }

  // --- DATASET ---

  _ref(path: string | string[] = '') {
    const strPath = Array.isArray(path) ? path.join('/') : path;
    if (!strPath || strPath === '/' || strPath === '') return ref(db, `${this.basePath}/dataset`);
    const clean = strPath.replace(/\./g, '/').replace(/^\/|\/$/g, '');
    return ref(db, `${this.basePath}/dataset/${clean}`);
  }

  async set(path: string, value: any) {
    if (this._isOffline) {
      this._offlineQueue.push({ type: 'set', path, value, ts: Date.now() });
      this._saveQueue();
      return;
    }
    await set(this._ref(path), value);
    await this._touchMeta();
  }

  async update(path: string, value: any) {
    if (typeof value !== 'object' || value === null) {
      throw new Error('update() requires an object');
    }
    if (this._isOffline) {
      this._offlineQueue.push({ type: 'update', path, value, ts: Date.now() });
      this._saveQueue();
      return;
    }
    await update(this._ref(path), value);
    await this._touchMeta();
  }

  async push(path: string, value: any) {
    const pushKey = push(this._ref(path)).key;
    if (this._isOffline) {
      this._offlineQueue.push({ type: 'push', path, value, pushKey, ts: Date.now() });
      this._saveQueue();
      return pushKey;
    }
    await set(ref(db, `${this._ref(path).toString()}/${pushKey}`), value);
    await this._touchMeta();
    return pushKey;
  }

  async get(path: string) {
    try {
      const snap = await get(this._ref(path));
      const val = snap.val();
      this._cacheData(`dataset_path_${path}`, val);
      return val;
    } catch (err) {
      return this._getCached(`dataset_path_${path}`);
    }
  }

  async exists(path: string) {
    try {
      const snap = await get(this._ref(path));
      return snap.exists();
    } catch (err) {
      const cached = this._getCached(`dataset_path_${path}`);
      return cached !== null && cached !== undefined;
    }
  }

  async remove(path: string) {
    if (this._isOffline) {
      this._offlineQueue.push({ type: 'remove', path, ts: Date.now() });
      this._saveQueue();
      return;
    }
    await remove(this._ref(path));
    await this._touchMeta();
  }

  on(path: string, callback: (val: any) => void) {
    const r = this._ref(path);
    const key = `dataset_on_${r.toString()}`;
    
    const cached = this._getCached(`dataset_path_${path}`);
    if (cached) callback(cached);

    const handler = (snap: any) => {
      const val = snap.val();
      this._cacheData(`dataset_path_${path}`, val);
      callback(val);
    };
    onValue(r, handler);
    this._listeners.set(key, { ref: r, handler, eventType: 'value' });
    
    return () => {
      off(r, 'value', handler);
      this._listeners.delete(key);
    };
  }

  onChildAdded(path: string, callback: (val: any, key: string | null) => void) {
    const r = this._ref(path);
    const listenerKey = `dataset_onChildAdded_${r.toString()}`;
    
    const handler = (snap: any) => {
      callback(snap.val(), snap.key);
    };
    onChildAdded(r, handler);
    this._listeners.set(listenerKey, { ref: r, handler, eventType: 'child_added' });
    
    return () => {
      off(r, 'child_added', handler);
      this._listeners.delete(listenerKey);
    };
  }

  newId(path: string = '') {
    return push(this._ref(path)).key;
  }

  async getFullTree() {
    try {
      const snap = await get(this._ref(''));
      const val = snap.val() || {};
      this._cacheData('dataset_full_tree', val);
      return val;
    } catch (err) {
      return this._getCached('dataset_full_tree') || {};
    }
  }

  onTree(callback: (val: any) => void) {
    const r = this._ref('');
    const key = `dataset_onTree_${r.toString()}`;
    const handler = (snap: any) => callback(snap.val() || {});
    onValue(r, handler);
    this._listeners.set(key, { ref: r, handler, eventType: 'value' });
    return () => {
      off(r, 'value', handler);
      this._listeners.delete(key);
    };
  }

  // --- STORAGE ---

  async storageWrite(fileId: string, base64DataUri: string, mimeType: string) {
    const sizeBytes = Math.round((base64DataUri.length * 3) / 4);
    await set(ref(db, `${this.basePath}/storage/${fileId.replace(/\./g, '_')}`), {
      content: base64DataUri,
      mimeType,
      sizeBytes,
      createdAt: Date.now()
    });
    // Cache the write locally
    this._cacheData(`storage_${fileId}`, { content: base64DataUri, mimeType, sizeBytes, createdAt: Date.now() });
    await this._updateStorageBytes();
    return fileId;
  }

  async storageRead(fileId: string) {
    try {
      const snap = await get(ref(db, `${this.basePath}/storage/${fileId.replace(/\./g, '_')}`));
      if (!snap.exists()) return null;
      const data = snap.val();
      this._cacheData(`storage_${fileId}`, data);
      return data.content;
    } catch (err) {
      const cached = this._getCached(`storage_${fileId}`);
      return cached ? cached.content : null;
    }
  }

  async storageDelete(fileId: string) {
    await remove(ref(db, `${this.basePath}/storage/${fileId.replace(/\./g, '_')}`));
    localStorage.removeItem(`aiplex_cache_${this.appId}_storage_${fileId}`);
    await this._updateStorageBytes();
  }

  async storageList() {
    try {
      const snap = await get(ref(db, `${this.basePath}/storage`));
      const files = snap.val() || {};
      this._cacheData('storage_list', files);
      return this._formatStorageList(files);
    } catch (err) {
      const cached = this._getCached('storage_list');
      return cached ? this._formatStorageList(cached) : [];
    }
  }

  private _formatStorageList(files: any) {
    return Object.entries(files).map(([id, data]: [string, any]) => ({
      id,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      createdAt: data.createdAt
    }));
  }

  // --- AUTH ---

  private _sanitizeEmail(email: string) {
    return email.toLowerCase().replace(/\./g, ',');
  }

  async authSignup(email: string, password: string, displayName: string = '', metadata: any = {}) {
    const emailLower = email.toLowerCase();
    const emailKey = this._sanitizeEmail(emailLower);
    
    const lookupRef = ref(db, `${this.basePath}/auth/lookup/emails/${emailKey}`);
    const existing = await get(lookupRef);
    
    if (existing.exists()) throw new Error('EMAIL_EXISTS');

    const authUserId = push(ref(db)).key as string;
    const passwordHash = await this._hashPassword(password);
    
    const userData = {
      email: emailLower,
      passwordHash,
      displayName,
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
      metadata
    };

    const updates: any = {};
    updates[`${this.basePath}/auth/users/${authUserId}`] = userData;
    updates[`${this.basePath}/auth/lookup/emails/${emailKey}`] = authUserId;
    
    await update(ref(db), updates);
    
    const token = await this._createSession(authUserId);
    const session = { authUserId, token, email: emailLower, displayName };
    this._cacheData('auth_session', session);
    return session;
  }

  async authLogin(email: string, password: string) {
    const emailLower = email.toLowerCase();
    const emailKey = this._sanitizeEmail(emailLower);
    
    const lookupRef = ref(db, `${this.basePath}/auth/lookup/emails/${emailKey}`);
    const uidSnap = await get(lookupRef);
    
    if (!uidSnap.exists()) throw new Error('INVALID_CREDENTIALS');
    const authUserId = uidSnap.val();

    const userSnap = await get(ref(db, `${this.basePath}/auth/users/${authUserId}`));
    if (!userSnap.exists()) throw new Error('INVALID_CREDENTIALS');
    
    const user = userSnap.val();
    const passwordHash = await this._hashPassword(password);
    
    if (user.passwordHash !== passwordHash) {
      throw new Error('INVALID_CREDENTIALS');
    }
    
    await set(ref(db, `${this.basePath}/auth/users/${authUserId}/lastLoginAt`), Date.now());
    const token = await this._createSession(authUserId);
    const session = { authUserId, token, email: user.email, displayName: user.displayName };
    this._cacheData('auth_session', session);
    return session;
  }

  async authVerifyToken(token: string) {
    try {
      const snap = await get(ref(db, `${this.basePath}/auth/sessions/${token}`));
      if (!snap.exists()) return null;
      const session = snap.val();
      if (Date.now() > session.expiresAt) {
        await remove(ref(db, `${this.basePath}/auth/sessions/${token}`));
        localStorage.removeItem(`aiplex_cache_${this.appId}_auth_session`);
        return null;
      }
      const userSnap = await get(ref(db, `${this.basePath}/auth/users/${session.authUserId}`));
      if (!userSnap.exists()) return null;
      const userData = userSnap.val();
      const profile = { authUserId: session.authUserId, ...userData, passwordHash: undefined };
      this._cacheData('auth_profile', profile);
      return profile;
    } catch (err) {
      // Offline: verify if cached token matches
      const cachedSession = this._getCached('auth_session');
      if (cachedSession && cachedSession.token === token) {
        return this._getCached('auth_profile');
      }
      return null;
    }
  }

  async authLogout(token: string) {
    await remove(ref(db, `${this.basePath}/auth/sessions/${token}`));
    localStorage.removeItem(`aiplex_cache_${this.appId}_auth_session`);
    localStorage.removeItem(`aiplex_cache_${this.appId}_auth_profile`);
  }

  async authUpdateUser(authUserId: string, updates: any) {
    const allowed = ['displayName', 'metadata'];
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([k]) => allowed.includes(k))
    );
    await update(ref(db, `${this.basePath}/auth/users/${authUserId}`), filtered);
    // Refresh cache
    const current = this._getCached('auth_profile');
    if (current) this._cacheData('auth_profile', { ...current, ...filtered });
  }

  async authDeleteUser(authUserId: string) {
    const userSnap = await get(ref(db, `${this.basePath}/auth/users/${authUserId}`));
    if (userSnap.exists()) {
      const user = userSnap.val();
      const emailKey = this._sanitizeEmail(user.email);
      await remove(ref(db, `${this.basePath}/auth/lookup/emails/${emailKey}`));
    }

    await remove(ref(db, `${this.basePath}/auth/users/${authUserId}`));
    const sessionsSnap = await get(ref(db, `${this.basePath}/auth/sessions`));
    const allSessions = sessionsSnap.val() || {};
    const toDelete = Object.entries(allSessions)
      .filter(([_, s]: [string, any]) => s.authUserId === authUserId)
      .map(([token]) => remove(ref(db, `${this.basePath}/auth/sessions/${token}`)));
    await Promise.all(toDelete);
  }

  async authListUsers() {
    const snap = await get(ref(db, `${this.basePath}/auth/users`));
    const users = snap.val() || {};
    return Object.entries(users).map(([id, u]: [string, any]) => ({
      authUserId: id,
      email: u.email,
      displayName: u.displayName,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      metadata: u.metadata
    }));
  }

  // --- HELPERS ---

  private async _hashPassword(password: string) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private async _createSession(authUserId: string) {
    const token = crypto.randomUUID();
    await set(ref(db, `${this.basePath}/auth/sessions/${token}`), {
      authUserId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 86400000 // 24 hours
    });
    return token;
  }

  private async _touchMeta() {
    await update(ref(db, `${this.basePath}/meta`), { lastWriteAt: Date.now() });
  }

  private async _updateStorageBytes() {
    const snap = await get(ref(db, `${this.basePath}/storage`));
    const files = snap.val() || {};
    const total = Object.values(files).reduce((s: number, f: any) => s + (f.sizeBytes || 0), 0);
    await set(ref(db, `${this.basePath}/meta/storageBytesUsed`), total);
    await set(ref(db, `${this.basePath}/meta/appId`), this.appId);
    await set(ref(db, `${this.basePath}/meta/ownerUid`), this.ownerUid);
  }
}
