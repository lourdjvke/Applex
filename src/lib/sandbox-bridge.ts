/**
 * Generates the bridge script to be injected into mini-apps.
 */
export function generateBridgeScript(ownerUid: string, appId: string) {
  return `
(function() {
  const _channel = new MessageChannel();
  const _pending = new Map();
  let _callId = 0;

  function _call(method, args) {
    return new Promise((resolve, reject) => {
      const id = ++_callId;
      _pending.set(id, { resolve, reject });
      window.parent.postMessage({ __aiplex: true, id, method, args }, '*');
    });
  }

  window.addEventListener('message', e => {
    if (!e.data?.__aiplexReply) return;
    const p = _pending.get(e.data.id);
    if (!p) return;
    _pending.delete(e.data.id);
    if (e.data.error) p.reject(new Error(e.data.error));
    else p.resolve(e.data.result);
  });

  window.AIPLEX = {
    // ── Dataset ──────────────────────────────────────────────
    dataset: {
      set:          (path, value)   => _call('dataset.set', [path, value]),
      update:       (path, value)   => _call('dataset.update', [path, value]),
      push:         (path, value)   => _call('dataset.push', [path, value]),
      get:          (path)          => _call('dataset.get', [path]),
      exists:       (path)          => _call('dataset.exists', [path]),
      remove:       (path)          => _call('dataset.remove', [path]),
      newId:        (path = '')     => _call('dataset.newId', [path]),
      on:           (path, cb)      => {
        const listenerId = 'listener_' + (++_callId);
        _call('dataset.on', [path, listenerId]);
        const handler = e => {
          if (e.data?.__aiplexLive && e.data.listenerId === listenerId) cb(e.data.value);
        };
        window.addEventListener('message', handler);
        return () => {
          window.removeEventListener('message', handler);
          return _call('dataset.off', [listenerId]);
        };
      },
      onChildAdded: (path, cb)      => {
        const listenerId = 'listener_' + (++_callId);
        _call('dataset.onChildAdded', [path, listenerId]);
        const handler = e => {
          if (e.data?.__aiplexLive && e.data.listenerId === listenerId) cb(e.data.value, e.data.key);
        };
        window.addEventListener('message', handler);
        return () => {
          window.removeEventListener('message', handler);
          return _call('dataset.off', [listenerId]);
        };
      },
      transaction:  (path, updateFn) => {
        return _call('dataset.transaction', [path, updateFn.toString()]);
      }
    },

    // ── Storage ───────────────────────────────────────────────
    storage: {
      write:  (fileId, base64, mime) => _call('storage.write', [fileId, base64, mime]),
      read:   (fileId)               => _call('storage.read', [fileId]),
      delete: (fileId)               => _call('storage.delete', [fileId]),
      list:   ()                     => _call('storage.list', [])
    },

    // ── Auth ─────────────────────────────────────────────────
    auth: {
      signup:     (email, pw, name, meta) => _call('auth.signup', [email, pw, name, meta]),
      login:      (email, pw)             => _call('auth.login', [email, pw]),
      logout:     (token)                 => _call('auth.logout', [token]),
      verify:     (token)                 => _call('auth.verify', [token]),
      updateUser: (uid, updates)          => _call('auth.updateUser', [uid, updates]),
      deleteUser: (uid)                   => _call('auth.deleteUser', [uid]),
      listUsers:  ()                      => _call('auth.listUsers', [])
    },

    // ── Context ───────────────────────────────────────────────
    context: {
      appId: '${appId}',
      ownerUid: '${ownerUid}'
    }
  };

  console.log('[AIPLEX] API injected and ready');
})();
  `;
}

/**
 * Wraps raw HTML with the bridge script.
 */
export function buildSandboxedHTML(rawHtml: string, ownerUid: string, appId: string) {
  const bridge = generateBridgeScript(ownerUid, appId);
  const scriptTag = `<script id="aiplex-bridge">${bridge}</script>`;
  
  if (rawHtml.includes('<head>')) {
    return rawHtml.replace('<head>', `<head>\n${scriptTag}`);
  }
  if (rawHtml.includes('<body>')) {
    return rawHtml.replace('<body>', `<body>\n${scriptTag}`);
  }
  return `${scriptTag}\n${rawHtml}`;
}
