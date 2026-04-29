import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { dbGet, dbUpdate } from '../lib/firebase';
import { MiniApp } from '../types';
import { useAuth } from '../lib/AuthContext';
import { ArrowLeft, MoreVertical, RefreshCw, Smartphone, Trash2, Share2, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DatasetEngine } from '../lib/dataset-engine';
import { buildSandboxedHTML } from '../lib/sandbox-bridge';

export default function Runner() {
  const { id } = useParams<{ id: string }>();
  const [app, setApp] = useState<MiniApp | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const engineRef = useRef<DatasetEngine | null>(null);
  const liveListeners = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    async function fetchData() {
      if (!id) return;
      try {
        let appData: MiniApp | null = null;
        
        // Network-first for DB
        if (navigator.onLine) {
           appData = await dbGet<MiniApp>(`apps/${id}`);
           if (appData) {
             setApp(appData);
             // Update cache opportunistically
             const cache = await caches.open('aiplex-apps-v1');
             await cache.put(`/api/local-app/${id}`, new Response(JSON.stringify(appData)));
           }
        }
        
        if (!appData) {
          // Fallback to cache
          try {
             const res = await fetch(`/api/local-app/${id}`);
             if (res.ok) {
               appData = await res.json();
               if (appData) setApp(appData);
             }
          } catch (e) {
             console.warn("No cache available", e);
          }
        }
      } catch (err) {
        console.error("Fetch failed", err);
      }
      setLoading(false);
    }
    fetchData();
  }, [id]);

  useEffect(() => {
    if (app) {
      engineRef.current = new DatasetEngine(app.meta.creatorUid, app.id);
    }
  }, [app]);

  useEffect(() => {
    const handleMessage = async (e: MessageEvent) => {
      if (!e.data?.__aiplex || e.source !== iframeRef.current?.contentWindow) return;
      const { id: callId, method, args } = e.data;
      const engine = engineRef.current;
      if (!engine) return;

      try {
        let result;
        if (method === 'dataset.set') result = await engine.set(args[0], args[1]);
        else if (method === 'dataset.update') result = await engine.update(args[0], args[1]);
        else if (method === 'dataset.push') result = await engine.push(args[0], args[1]);
        else if (method === 'dataset.get') result = await engine.get(args[0]);
        else if (method === 'dataset.exists') result = await engine.exists(args[0]);
        else if (method === 'dataset.remove') result = await engine.remove(args[0]);
        else if (method === 'dataset.newId') result = engine.newId(args[0]);
        else if (method === 'dataset.on') {
          const [path, listenerId] = args;
          const unsub = engine.on(path, (value) => {
            iframeRef.current?.contentWindow?.postMessage({ __aiplexLive: true, listenerId, value }, '*');
          });
          liveListeners.current.set(listenerId, unsub);
          result = true;
        }
        else if (method === 'dataset.onChildAdded') {
          const [path, listenerId] = args;
          const unsub = engine.onChildAdded(path, (value, key) => {
            iframeRef.current?.contentWindow?.postMessage({ __aiplexLive: true, listenerId, value, key }, '*');
          });
          liveListeners.current.set(listenerId, unsub);
          result = true;
        }
        else if (method === 'dataset.off') {
          const unsub = liveListeners.current.get(args[0]);
          if (unsub) { unsub(); liveListeners.current.delete(args[0]); }
          result = true;
        }
        else if (method === 'storage.write') result = await engine.storageWrite(args[0], args[1], args[2]);
        else if (method === 'storage.read') result = await engine.storageRead(args[0]);
        else if (method === 'storage.delete') result = await engine.storageDelete(args[0]);
        else if (method === 'storage.list') result = await engine.storageList();
        else if (method === 'auth.signup') result = await engine.authSignup(args[0], args[1], args[2], args[3]);
        else if (method === 'auth.login') result = await engine.authLogin(args[0], args[1]);
        else if (method === 'auth.logout') result = await engine.authLogout(args[0]);
        else if (method === 'auth.verify') result = await engine.authVerifyToken(args[0]);
        else if (method === 'auth.updateUser') result = await engine.authUpdateUser(args[0], args[1]);
        else if (method === 'auth.deleteUser') result = await engine.authDeleteUser(args[0]);
        else if (method === 'auth.listUsers') result = await engine.authListUsers();
        else throw new Error(`Unknown method: ${method}`);

        iframeRef.current?.contentWindow?.postMessage({ __aiplexReply: true, id: callId, result }, '*');
      } catch (err: any) {
        console.error("API call error", err);
        iframeRef.current?.contentWindow?.postMessage({ __aiplexReply: true, id: callId, error: err.message }, '*');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      liveListeners.current.forEach(unsub => unsub());
      liveListeners.current.clear();
    };
  }, [id]);

  const handleUninstall = async () => {
    if (!id || !user) return;
    if (confirm(`Are you sure you want to uninstall ${app?.meta?.name}?`)) {
      await dbUpdate(`users/${user.uid}/profile/installedApps`, { [id]: null });
      navigate('/');
    }
  };

  if (loading) return <div className="h-screen bg-black flex items-center justify-center p-12 grow"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div></div>;

  if (app?.meta?.status === 'generating') {
    return (
      <div className="fixed inset-0 z-[200] bg-bg flex flex-col items-center justify-center p-12 text-center grow">
         <div className="relative w-24 h-24 mb-8">
            <div className="absolute inset-0 border-4 border-primary/10 border-t-primary rounded-full animate-spin" />
            <div className="absolute inset-4 bg-primary/5 rounded-full flex items-center justify-center text-primary">
               <RefreshCw size={24} className="animate-pulse" />
            </div>
         </div>
         <h2 className="font-display font-bold text-2xl mb-2">Build still ongoing</h2>
         <p className="text-text-muted max-w-xs mx-auto text-sm mb-8">Gemini is currently writing the final bits of code for {app.meta.name}. Hang tight!</p>
         <button onClick={() => navigate(-1)} className="px-6 py-2 bg-surface border border-border rounded-lg text-sm font-bold hover:bg-surface-alt transition-all">
            Go Back
         </button>
      </div>
    );
  }

  if (app?.meta?.status === 'error') {
     return (
        <div className="fixed inset-0 z-[200] bg-bg flex flex-col items-center justify-center p-12 text-center grow">
           <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-6">
              <ArrowLeft size={32} />
           </div>
           <h2 className="font-display font-bold text-2xl mb-2">Build Failed</h2>
           <p className="text-text-muted max-w-xs mx-auto text-sm mb-8">Something went wrong during the generation of {app?.meta?.name}. You can try re-generating or editing it manually.</p>
           <button onClick={() => navigate(`/edit/${id}`)} className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:translate-y-[-1px] transition-all">
              Go to Editor
           </button>
        </div>
     );
  }

  const sandboxedHtml = app ? buildSandboxedHTML(app.code.html, app.meta.creatorUid, app.id) : '';

  return (
    <div className="fixed inset-0 z-[200] bg-bg flex flex-col grow">
      {/* Runner Bar */}
      <div className="h-14 bg-surface border-b border-border flex items-center justify-between px-4 shrink-0 z-50">
        <div className="flex items-center gap-3">
           <button onClick={() => navigate(-1)} className="p-2 hover:bg-surface-alt rounded-full transition-colors">
              <ArrowLeft size={20} />
           </button>
           <div className="flex flex-col">
              <span className="text-xs font-bold font-sans leading-none">{app?.meta?.name}</span>
              <span className="text-[10px] text-text-muted font-mono leading-none mt-0.5">v{app?.meta?.version}</span>
           </div>
        </div>
        
        <div className="flex items-center gap-2 relative">
           <button onClick={() => window.location.reload()} className="p-2 hover:bg-surface-alt rounded-full transition-colors">
              <RefreshCw size={18} className="text-text-secondary" />
           </button>
           <button onClick={() => setShowMenu(!showMenu)} className="p-2 hover:bg-surface-alt rounded-full transition-colors">
              <MoreVertical size={18} className="text-text-secondary" />
           </button>

           <AnimatePresence>
            {showMenu && (
              <>
                <div className="fixed inset-0" onClick={() => setShowMenu(false)} />
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="absolute top-12 right-0 w-52 bg-surface rounded-xl shadow-2xl border border-border p-2 z-[60]"
                >
                  <button onClick={() => navigate(`/app/${id}`)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-alt rounded-lg text-sm font-medium">
                    <Smartphone size={16} /> Product Page
                  </button>
                  <button className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-alt rounded-lg text-sm font-medium">
                    <Share2 size={16} /> Share App
                  </button>
                  <button onClick={() => navigate(`/app/${id}`)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-alt rounded-lg text-sm font-medium">
                    <Star size={16} /> Rate & Review
                  </button>
                  <div className="h-px bg-border my-1" />
                  <button onClick={handleUninstall} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-primary/10 text-primary rounded-lg text-sm font-medium">
                    <Trash2 size={16} /> Uninstall App
                  </button>
                </motion.div>
              </>
            )}
           </AnimatePresence>
        </div>
      </div>

      {/* Main Runner Context */}
      <div className="flex-1 bg-black relative flex items-center justify-center grow overflow-hidden">
        <div className="w-full h-full md:max-w-md md:h-[90%] md:rounded-[40px] md:border-[12px] border-text-primary bg-white shadow-2xl relative overflow-hidden">
           <iframe 
             ref={iframeRef}
             title={app?.meta?.name}
             className="w-full h-full border-none"
             sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
             srcDoc={sandboxedHtml}
           />
        </div>
      </div>
    </div>
  );
}

