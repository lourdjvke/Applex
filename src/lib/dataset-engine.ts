import { db } from './firebase';
import { ref, get, set, push, update, remove, onValue, orderByChild, equalTo, query, off } from 'firebase/database';
import { DatasetNode } from '../types';

export class DatasetEngine {
  ownerUid: string;
  appId: string;
  basePath: string;
  private _listeners: Map<string, { ref: any, handler: any }> = new Map();
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
      if (item.type === 'write') {
        const parts = this._parsePath(item.path);
        const nodeRef = await this._resolveOrCreatePath(parts);
        const valueType = this._inferType(item.value);
        await update(nodeRef, {
          __type: 'field',
          __name: parts[parts.length - 1],
          __parent: await this._getOrCreateParentForWrite(parts),
          __updatedAt: Date.now(),
          value: typeof item.value === 'object' ? JSON.stringify(item.value) : item.value,
          valueType
        });
      } else if (item.type === 'delete') {
        const parts = this._parsePath(item.path);
        const nodeId = await this._findNodeByPath(parts);
        if (nodeId) await this._deleteNodeAndChildren(nodeId);
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

  async write(path: string | string[], value: any) {
    // Optimistic UI / Offline Queue
    if (this._isOffline) {
      this._offlineQueue.push({ type: 'write', path, value, ts: Date.now() });
      this._saveQueue();
      // Update local cache of the whole dataset if possible
      const current = this._getCached('dataset') || {};
      // This is a partial update mock for the cache
      // Realistically we'd need a more complex local patcher, but for now simple queue is best
      return;
    }

    const parts = this._parsePath(path);
    const nodeRef = await this._resolveOrCreatePath(parts);
    const valueType = this._inferType(value);
    
    await update(nodeRef, {
      __type: 'field',
      __name: parts[parts.length - 1],
      __parent: await this._getOrCreateParentForWrite(parts),
      __updatedAt: Date.now(),
      value: typeof value === 'object' ? JSON.stringify(value) : value,
      valueType
    });
    await this._touchMeta();
  }

  async read(path: string | string[]) {
    try {
      const dataRef = ref(db, `${this.basePath}/dataset`);
      const snap = await get(dataRef);
      const all = snap.val() || {};
      this._cacheData('dataset', all);
      return this._resolvePath(all, path);
    } catch (err) {
      const cached = this._getCached('dataset');
      if (cached) return this._resolvePath(cached, path);
      throw err;
    }
  }

  async delete(path: string | string[]) {
    if (this._isOffline) {
      this._offlineQueue.push({ type: 'delete', path, ts: Date.now() });
      this._saveQueue();
      return true;
    }

    const parts = this._parsePath(path);
    const nodeId = await this._findNodeByPath(parts);
    if (!nodeId) return false;
    await this._deleteNodeAndChildren(nodeId);
    return true;
  }

  async createFolder(path: string | string[]) {
    const parts = this._parsePath(path);
    const nodeId = this._newId();
    const parentId = await this._getOrCreateParentForWrite(parts);
    await set(ref(db, `${this.basePath}/dataset/${nodeId}`), {
      __type: 'folder',
      __name: parts[parts.length - 1],
      __parent: parentId,
      __createdAt: Date.now(),
      __updatedAt: Date.now()
    });
    return nodeId;
  }

  onWrite(path: string | string[], callback: (val: any) => void) {
    const key = `dataset_${path.toString()}`;
    const dataRef = ref(db, `${this.basePath}/dataset`);
    
    // Initial cached value
    const cached = this._getCached('dataset');
    if (cached) callback(this._resolvePath(cached, path));

    const handler = onValue(dataRef, snap => {
      const all = snap.val() || {};
      this._cacheData('dataset', all);
      const resolved = this._resolvePath(all, path);
      callback(resolved);
    });
    this._listeners.set(key, { ref: dataRef, handler });
    return () => {
      off(dataRef, 'value', handler);
      this._listeners.delete(key);
    };
  }

  async getAll() {
    try {
      const snap = await get(ref(db, `${this.basePath}/dataset`));
      const val = snap.val() || {};
      this._cacheData('dataset', val);
      return this._buildTree(val);
    } catch (err) {
      const cached = this._getCached('dataset');
      if (cached) return this._buildTree(cached);
      throw err;
    }
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

    const authUserId = this._newId()!;
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

  private _newId() {
    return push(ref(db, `${this.basePath}/dataset`)).key;
  }

  private _parsePath(path: string | string[]) {
    if (Array.isArray(path)) return path;
    return path.split('.').filter(Boolean);
  }

  private _inferType(value: any) {
    if (value === null) return 'null';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'object') return 'json';
    return 'string';
  }

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

  private _buildTree(flatNodes: Record<string, any>) {
    const roots: any[] = [];
    const map: Record<string, any> = {};
    Object.entries(flatNodes).forEach(([id, node]) => {
      map[id] = { id, ...node, children: [] };
    });
    Object.values(map).forEach(node => {
      if (!node.__parent || !map[node.__parent]) roots.push(node);
      else map[node.__parent].children.push(node);
    });
    return roots;
  }

  private async _resolveOrCreatePath(parts: string[]) {
    const snap = await get(ref(db, `${this.basePath}/dataset`));
    const all = snap.val() || {};
    
    let parentId: string | null = null;
    let currentId: string | null = null;

    // Resolve folders
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i];
      const existing = Object.entries(all).find(
        ([_, n]: [string, any]) => n.__name === name && n.__parent === parentId
      );

      if (existing) {
        parentId = existing[0];
        // Ensure it's a folder
        if (existing[1].__type !== 'folder') {
          await update(ref(db, `${this.basePath}/dataset/${parentId}`), { __type: 'folder' });
        }
      } else {
        // Create it
        const newId = this._newId()!;
        await set(ref(db, `${this.basePath}/dataset/${newId}`), {
          __type: 'folder', __name: name, __parent: parentId,
          __createdAt: Date.now(), __updatedAt: Date.now()
        });
        parentId = newId;
        all[newId] = { __type: 'folder', __name: name, __parent: parentId }; // Update local map for next loop
      }
    }

    // Resolve final field
    const finalName = parts[parts.length - 1];
    const existingField = Object.entries(all).find(
      ([_, n]: [string, any]) => n.__name === finalName && n.__parent === parentId
    );

    if (existingField) return ref(db, `${this.basePath}/dataset/${existingField[0]}`);
    const newId = this._newId();
    return ref(db, `${this.basePath}/dataset/${newId}`);
  }

  private async _getOrCreateParentForWrite(parts: string[]) {
    if (parts.length <= 1) return null;
    const snap = await get(ref(db, `${this.basePath}/dataset`));
    const all = snap.val() || {};
    
    let currentParentId: string | null = null;
    for (let i = 0; i < parts.length - 1; i++) {
       const name = parts[i];
       const found = Object.entries(all).find(([_, n]: [string, any]) => n.__name === name && n.__parent === currentParentId);
       if (found) {
         currentParentId = found[0];
       } else {
         const newId = this._newId()!;
         await set(ref(db, `${this.basePath}/dataset/${newId}`), {
           __type: 'folder', __name: name, __parent: currentParentId,
           __createdAt: Date.now(), __updatedAt: Date.now()
         });
         currentParentId = newId;
         all[newId] = { __type: 'folder', __name: name, __parent: currentParentId };
       }
    }
    return currentParentId;
  }

  private async _findNodeByPath(parts: string[]) {
    const snap = await get(ref(db, `${this.basePath}/dataset`));
    const all = snap.val() || {};
    let parentId: string | null = null;
    let found: [string, any] | null = null;
    for (const part of parts) {
      found = Object.entries(all).find(([_, n]: [string, any]) => n.__name === part && n.__parent === parentId) as [string, any] || null;
      if (!found) return null;
      parentId = found[0];
    }
    return found ? found[0] : null;
  }

  private async _deleteNodeAndChildren(nodeId: string) {
    const snap = await get(ref(db, `${this.basePath}/dataset`));
    const all = snap.val() || {};
    const children = Object.entries(all).filter(([_, n]: [string, any]) => n.__parent === nodeId).map(([id]) => id);
    await Promise.all(children.map(cid => this._deleteNodeAndChildren(cid)));
    await remove(ref(db, `${this.basePath}/dataset/${nodeId}`));
  }

  private _resolvePath(flatNodes: Record<string, any>, dotPath: string | string[]) {
    const parts = this._parsePath(dotPath);
    const tree = this._buildTree(flatNodes);
    let current: any = tree;
    for (const part of parts) {
      const node = (Array.isArray(current) ? current : (current.children || []))
        .find((n: any) => n.__name === part);
      if (!node) return undefined;
      current = node;
    }
    if (!current) return undefined;
    if (current.__type === 'field') {
      return current.valueType === 'json' ? JSON.parse(current.value) : current.value;
    }
    if (current.__type === 'folder') return current.children;
    return current;
  }
}
