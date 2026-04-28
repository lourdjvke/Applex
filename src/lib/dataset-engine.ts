import { db } from './firebase';
import { ref, get, set, push, update, remove, onValue, orderByChild, equalTo, query, off } from 'firebase/database';
import { DatasetNode } from '../types';

export class DatasetEngine {
  ownerUid: string;
  appId: string;
  basePath: string;
  private _listeners: Map<string, { ref: any, handler: any }> = new Map();

  constructor(ownerUid: string, appId: string) {
    this.ownerUid = ownerUid;
    this.appId = appId;
    this.basePath = `/proddata/${ownerUid}/${appId}`;
  }

  // --- DATASET ---

  async write(path: string | string[], value: any) {
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
    const dataRef = ref(db, `${this.basePath}/dataset`);
    const snap = await get(dataRef);
    const all = snap.val() || {};
    return this._resolvePath(all, path);
  }

  async delete(path: string | string[]) {
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
    const handler = onValue(dataRef, snap => {
      const all = snap.val() || {};
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
    const snap = await get(ref(db, `${this.basePath}/dataset`));
    return this._buildTree(snap.val() || {});
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
    await this._updateStorageBytes();
    return fileId;
  }

  async storageRead(fileId: string) {
    const snap = await get(ref(db, `${this.basePath}/storage/${fileId.replace(/\./g, '_')}`));
    if (!snap.exists()) return null;
    return snap.val().content;
  }

  async storageDelete(fileId: string) {
    await remove(ref(db, `${this.basePath}/storage/${fileId.replace(/\./g, '_')}`));
    await this._updateStorageBytes();
  }

  async storageList() {
    const snap = await get(ref(db, `${this.basePath}/storage`));
    const files = snap.val() || {};
    return Object.entries(files).map(([id, data]: [string, any]) => ({
      id,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      createdAt: data.createdAt
    }));
  }

  // --- AUTH ---

  async authSignup(email: string, password: string, displayName: string = '', metadata: any = {}) {
    const emailLower = email.toLowerCase();
    const usersRef = ref(db, `${this.basePath}/auth/users`);
    const emailQuery = query(usersRef, orderByChild('email'), equalTo(emailLower));
    const existing = await get(emailQuery);
    
    if (existing.exists()) throw new Error('EMAIL_EXISTS');

    const authUserId = this._newId()!;
    const passwordHash = await this._hashPassword(password);
    
    await set(ref(db, `${this.basePath}/auth/users/${authUserId}`), {
      email: emailLower,
      passwordHash,
      displayName,
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
      metadata
    });
    
    const token = await this._createSession(authUserId);
    return { authUserId, token, email: emailLower, displayName };
  }

  async authLogin(email: string, password: string) {
    const snap = await get(ref(db, `${this.basePath}/auth/users`));
    const users = snap.val() || {};
    const passwordHash = await this._hashPassword(password);
    const emailLower = email.toLowerCase();
    
    const match = Object.entries(users).find(([_, u]: [string, any]) => 
      u.email === emailLower && u.passwordHash === passwordHash
    );
    
    if (!match) throw new Error('INVALID_CREDENTIALS');
    const [authUserId, user] = match as [string, any];
    
    await set(ref(db, `${this.basePath}/auth/users/${authUserId}/lastLoginAt`), Date.now());
    const token = await this._createSession(authUserId);
    return { authUserId, token, email: user.email, displayName: user.displayName };
  }

  async authVerifyToken(token: string) {
    const snap = await get(ref(db, `${this.basePath}/auth/sessions/${token}`));
    if (!snap.exists()) return null;
    const session = snap.val();
    if (Date.now() > session.expiresAt) {
      await remove(ref(db, `${this.basePath}/auth/sessions/${token}`));
      return null;
    }
    const userSnap = await get(ref(db, `${this.basePath}/auth/users/${session.authUserId}`));
    if (!userSnap.exists()) return null;
    const userData = userSnap.val();
    return { authUserId: session.authUserId, ...userData, passwordHash: undefined };
  }

  async authLogout(token: string) {
    await remove(ref(db, `${this.basePath}/auth/sessions/${token}`));
  }

  async authUpdateUser(authUserId: string, updates: any) {
    const allowed = ['displayName', 'metadata'];
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([k]) => allowed.includes(k))
    );
    await update(ref(db, `${this.basePath}/auth/users/${authUserId}`), filtered);
  }

  async authDeleteUser(authUserId: string) {
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
    let parentId: string | null = null;
    for (let i = 0; i < parts.length - 1; i++) {
      parentId = await this._getOrCreateFolder(parts[i], parentId);
    }
    const snap = await get(ref(db, `${this.basePath}/dataset`));
    const all = snap.val() || {};
    const existing = Object.entries(all).find(
      ([_, n]: [string, any]) => n.__name === parts[parts.length - 1] && n.__parent === parentId && n.__type === 'field'
    );
    if (existing) return ref(db, `${this.basePath}/dataset/${existing[0]}`);
    const newId = this._newId();
    return ref(db, `${this.basePath}/dataset/${newId}`);
  }

  private async _getOrCreateFolder(name: string, parentId: string | null) {
    const snap = await get(ref(db, `${this.basePath}/dataset`));
    const all = snap.val() || {};
    const existing = Object.entries(all).find(
      ([_, n]: [string, any]) => n.__name === name && n.__parent === parentId && n.__type === 'folder'
    );
    if (existing) return existing[0];
    const newId = this._newId()!;
    await set(ref(db, `${this.basePath}/dataset/${newId}`), {
      __type: 'folder', __name: name, __parent: parentId,
      __createdAt: Date.now(), __updatedAt: Date.now()
    });
    return newId;
  }

  private async _getOrCreateParentForWrite(parts: string[]) {
    if (parts.length <= 1) return null;
    let currentParentId: string | null = null;
    for (let i = 0; i < parts.length - 1; i++) {
       currentParentId = await this._getOrCreateFolder(parts[i], currentParentId);
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
