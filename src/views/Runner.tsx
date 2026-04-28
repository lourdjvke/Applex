import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { dbGet, dbUpdate, dbRemove } from '../lib/firebase';
import { MiniApp } from '../types';
import { useAuth } from '../lib/AuthContext';
import { ArrowLeft, MoreVertical, RefreshCw, Smartphone, Trash2, Share2, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Runner() {
  const { id } = useParams<{ id: string }>();
  const [app, setApp] = useState<MiniApp | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    async function fetchData() {
      if (!id) return;
      try {
        const appData = await dbGet<MiniApp>(`apps/${id}`);
        if (appData) {
          setApp(appData);
          // Cache for offline
          localStorage.setItem(`offline_app_${id}`, JSON.stringify(appData));
        } else {
          // Try local cache
          const cached = localStorage.getItem(`offline_app_${id}`);
          if (cached) setApp(JSON.parse(cached));
        }
      } catch (err) {
        console.error("Fetch failed, trying cache", err);
        const cached = localStorage.getItem(`offline_app_${id}`);
        if (cached) setApp(JSON.parse(cached));
      }
      setLoading(false);
    }
    fetchData();
  }, [id]);

  const handleUninstall = async () => {
    if (!id || !user) return;
    if (confirm(`Are you sure you want to uninstall ${app?.meta?.name}?`)) {
      await dbUpdate(`users/${user.uid}/profile/installedApps`, { [id]: null });
      navigate('/');
    }
  };

  useEffect(() => {
    (window as any).AIPLEX_INTERNAL = {
      getStorage: (fileId: string) => null,
      setStorage: (fileId: string, content: string, type: string) => {},
      getData: (key: string) => localStorage.getItem(`app_${id}_data_${key}`),
      setData: (key: string, value: any) => localStorage.setItem(`app_${id}_data_${key}`, JSON.stringify(value))
    };

    const injectApi = () => {
      if (iframeRef.current?.contentWindow && user) {
        try {
          (iframeRef.current.contentWindow as any).AIPLEX = {
            storage: {
              get: (fileId: string) => (window as any).AIPLEX_INTERNAL.getStorage(fileId),
              set: (fileId: string, content: string, type: string) => (window as any).AIPLEX_INTERNAL.setStorage(fileId, content, type)
            },
            data: {
              get: (key: string) => (window as any).AIPLEX_INTERNAL.getData(key),
              set: (key: string, value: any) => (window as any).AIPLEX_INTERNAL.setData(key, value)
            },
            user: {
              uid: user.uid,
              displayName: profile?.displayName || user.displayName || 'User'
            }
          };
        } catch (e) {
          console.warn("API injection delayed...");
        }
      }
    };

    const timer = setInterval(injectApi, 500);
    return () => clearInterval(timer);
  }, [id, user, profile]);

  if (loading) return <div className="h-screen bg-black flex items-center justify-center p-12 grow"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div></div>;

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
             srcDoc={app?.code?.html || ''}
           />
        </div>
      </div>
    </div>
  );
}

