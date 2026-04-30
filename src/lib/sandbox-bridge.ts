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
    
    // ── App Shell / Multi-Page ────────────────────────────────
    app: {
      navigate:          (target, params) => window.AppShell?.navigate(target, params),
      currentScreen:     () => window.AppShell?.currentScreen?.name,
      isScreenCached:    (name) => window.AppShell?.cache.has(name),
      clearScreenCache:  (name) => window.AppShell?.cache.delete(name)
    },

    // ── Context ───────────────────────────────────────────────
    context: {
      appId: '${appId}',
      ownerUid: '${ownerUid}'
    }
  };

  // ── AppShell Engine ───────────────────────────────────────
  const AppShell = {
    screens: new Map(),
    cache: new Map(),
    historyStack: [],
    currentScreen: null,

    registerScreen(name, module) {
      this.screens.set(name, { ...module, name });
    },

    async navigate(target, params = "") {
      if (target === "back") {
        if (this.historyStack.length > 1) {
          this.historyStack.pop();
          const prev = this.historyStack[this.historyStack.length - 1];
          await this._showScreen(prev, params, false);
          history.back();
        }
        return;
      }
      const screen = this.screens.get(target);
      if (!screen) {
        console.error('Screen "' + target + '" not registered');
        return;
      }
      this.historyStack.push(target);
      history.pushState({ screen: target, params }, "", "#/" + target);
      await this._showScreen(target, params, true);
    },

    async _showScreen(name, paramsString, isForward) {
      const screen = this.screens.get(name);
      const container = document.getElementById("screen-container") || document.body;
      
      if (this.currentScreen && this.currentScreen.onExit) {
        await this.currentScreen.onExit();
      }

      let cached = this.cache.get(name);
      if (!cached) {
        container.innerHTML = screen.template;
        if (screen.onInit) await screen.onInit();
        cached = { dom: container.innerHTML, state: screen };
        this.cache.set(name, cached);
      } else {
        container.innerHTML = cached.dom;
        screen._cachedState = cached.state._cachedState;
      }

      this.currentScreen = screen;
      const params = {};
      if (paramsString) {
        paramsString.split("&").forEach(pair => {
          const [k, v] = pair.split("=");
          params[decodeURIComponent(k)] = decodeURIComponent(v || "");
        });
      }

      if (screen.onEnter) await screen.onEnter(params);
      
      document.querySelectorAll(".nav-item").forEach(el => {
        el.classList.toggle("active", el.getAttribute("target") === name);
      });
      container.scrollTop = screen._scrollPos || 0;
    },

    initBackHandler() {
      window.addEventListener("popstate", e => {
        if (e.state && e.state.screen) {
          this.historyStack.pop();
          this._showScreen(e.state.screen, e.state.params, false);
        }
      });
    }
  };

  window.AppShell = AppShell;
  AppShell.initBackHandler();

  // Intercept <open> tags
  document.addEventListener('click', e => {
    const openTag = e.target.closest('open');
    if (openTag) {
      e.preventDefault();
      const target = openTag.getAttribute('target');
      const params = openTag.getAttribute('params') || '';
      AppShell.navigate(target, params);
    }
  });

  console.log('[AIPLEX] API injected and ready');
})();
  `;
}

/**
 * Wraps raw HTML with the bridge script and ensures boilerplate.
 */
export function buildSandboxedHTML(rawHtml: string, ownerUid: string, appId: string) {
  const bridge = generateBridgeScript(ownerUid, appId);
  
  const hasHead = rawHtml.toLowerCase().includes('<head>');
  const hasBody = rawHtml.toLowerCase().includes('<body');
  
  let finalHtml = rawHtml;
  if (!hasHead && !hasBody) {
    // Essential boilerplate for fragments
    finalHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0">
  <meta http-equiv="Cache-Control" content="max-age=3600">
  <link rel="preload" href="https://cdn.tailwindcss.com" as="script" crossorigin="anonymous">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
    :root { --font-sans: 'Plus Jakarta Sans', sans-serif; --font-mono: 'JetBrains Mono', monospace; }
    body { font-family: var(--font-sans); -webkit-tap-highlight-color: transparent; margin: 0; background: #fff; }
  </style>
</head>
<body>
  <div id="screen-container"></div>
  ${rawHtml}
</body>
</html>`;
  }

  const bridgeTag = `<script id="aiplex-bridge">${bridge}</script>`;
  
  if (finalHtml.includes('<head>')) {
    return finalHtml.replace('<head>', `<head>\n${bridgeTag}`);
  }
  if (finalHtml.includes('<body>')) {
    return finalHtml.replace('<body>', `<body>\n${bridgeTag}`);
  }
  return `${bridgeTag}\n${finalHtml}`;
}
