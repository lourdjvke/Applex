import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Download, Star, Eye, Edit3, Trash2, LayoutGrid, List as ListIcon, BarChart3, Rocket } from 'lucide-react';
import { dbGet, dbRemove } from '../lib/firebase';
import { MiniApp } from '../types';
import { useAuth } from '../lib/AuthContext';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

export default function Studio() {
  const [apps, setApps] = useState<MiniApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'apps' | 'analytics'>('apps');
  const { profile, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      if (!user) return;
      const allApps = await dbGet<Record<string, MiniApp>>('apps');
      if (allApps) {
        const userApps = Object.values(allApps).filter(a => a && a.meta && a.meta.creatorUid === user.uid);
        setApps(userApps);
      }
      setLoading(false);
    }
    fetchData();
  }, [user]);

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this app? This cannot be undone.')) {
       await dbRemove(`apps/${id}`);
       setApps(apps.filter(a => a.id !== id));
    }
  };

  return (
    <div className="pb-24 grow">
      <header className="py-8 flex flex-col md:flex-row md:items-end justify-between gap-6 px-4 md:px-0">
        <div>
          <h1 className="font-display font-extrabold text-3xl tracking-tight">Creator Studio</h1>
          <p className="text-text-muted">Manage your mini-apps and see how they're performing.</p>
        </div>
        <button 
           onClick={() => navigate('/create')}
           className="h-14 px-8 bg-primary text-white rounded-xl font-display font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-all"
        >
          <Plus size={20} /> Create New App
        </button>
      </header>

      {/* Tabs */}
      <div className="flex gap-4 mb-8 border-b border-border px-4 md:px-0 sticky top-14 md:top-0 bg-bg z-10 transition-all">
        <button 
          onClick={() => setTab('apps')}
          className={cn("pb-4 text-sm font-bold transition-all relative", tab === 'apps' ? "text-primary border-b-2 border-primary" : "text-text-muted hover:text-text-secondary")}
        >
          My Apps
        </button>
        <button 
          onClick={() => setTab('analytics')}
          className={cn("pb-4 text-sm font-bold transition-all relative", tab === 'analytics' ? "text-primary border-b-2 border-primary" : "text-text-muted hover:text-text-secondary")}
        >
          Analytics
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-text-muted">Loading your workspace...</div>
      ) : tab === 'apps' ? (
        apps.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-4 md:px-0 grow">
             {apps.map((app) => (
               <motion.div 
                 key={app.id} 
                 layout
                 className="bg-surface rounded-2xl border border-border overflow-hidden shadow-card hover:border-primary/30 transition-all group flex flex-col h-full grow"
               >
                  <div className="p-6 flex-1 flex flex-col grow">
                    <div className="flex items-start justify-between mb-4">
                      <img src={app.meta.iconBase64} className="w-14 h-14 rounded-2xl border border-border shadow-sm object-cover" alt={app.meta.name} />
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => navigate(`/edit/${app.id}`)}
                          className="p-2 hover:bg-surface-alt rounded-lg transition-colors text-text-muted hover:text-primary"
                        >
                          <Edit3 size={18} />
                        </button>
                        <button 
                          onClick={() => handleDelete(app.id)}
                          className="p-2 hover:bg-surface-alt rounded-lg transition-colors text-text-muted hover:text-primary"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                    
                    <h3 className="font-sans font-bold text-lg mb-1 group-hover:text-primary transition-colors">{app.meta.name}</h3>
                    <p className="text-xs text-text-muted mb-6 flex-grow">{app.meta.tagline}</p>
                    
                    <div className="grid grid-cols-3 gap-2 bg-surface-alt p-3 rounded-xl">
                       <div className="text-center">
                          <p className="text-[9px] uppercase font-bold text-text-muted">Installs</p>
                          <p className="font-mono font-bold text-xs">{app.stats.installs}</p>
                       </div>
                       <div className="text-center border-x border-border">
                          <p className="text-[9px] uppercase font-bold text-text-muted">Views</p>
                          <p className="font-mono font-bold text-xs">{app.stats.views}</p>
                       </div>
                       <div className="text-center">
                          <p className="text-[9px] uppercase font-bold text-text-muted">Rating</p>
                          <p className="font-mono font-bold text-xs">{app.stats.avgRating.toFixed(1)}</p>
                       </div>
                    </div>
                  </div>
                  <div className="p-4 border-t border-border flex items-center justify-between">
                     <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded uppercase",
                          app.meta.isPublished ? "bg-installed/10 text-installed" : "bg-text-muted/10 text-text-muted"
                        )}>
                          {app.meta.isPublished ? 'Published' : 'Draft'}
                        </span>
                        {app.meta.status === 'generating' && (
                          <span className="animate-pulse bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                             Generating...
                          </span>
                        )}
                        {app.meta.status === 'error' && (
                          <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                             Error
                          </span>
                        )}
                     </div>
                     <button 
                       disabled={app.meta.status === 'generating'}
                       onClick={() => navigate(`/run/${app.id}`)}
                       className="text-primary text-xs font-bold flex items-center gap-1 hover:gap-2 transition-all disabled:opacity-30 disabled:pointer-events-none"
                     >
                        {app.meta.status === 'generating' ? 'Build Ongoing' : 'Open App'} <Rocket size={14} />
                     </button>
                  </div>
               </motion.div>
             ))}
          </div>
        ) : (
          <div className="py-20 text-center px-4">
             <div className="w-16 h-16 bg-surface-alt rounded-2xl flex items-center justify-center mx-auto mb-4 text-text-muted">
                <Rocket size={32} />
             </div>
             <h3 className="font-display font-bold text-xl mb-2">No apps yet</h3>
             <p className="text-text-muted mb-8 max-w-sm mx-auto">Build your first AI-generated mini-app and share it with the community.</p>
             <button 
                onClick={() => navigate('/create')}
                className="px-8 py-3 bg-primary text-white rounded-xl font-display font-bold shadow-lg shadow-primary/20 transition-all inline-block"
             >
               Quick Start
             </button>
          </div>
        )
      ) : (
        <div className="space-y-8 px-4 md:px-0 scroll-smooth">
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6 grow">
              {[
                { label: 'Total Installs', value: apps.reduce((acc, a) => acc + a.stats.installs, 0), icon: Download, color: 'text-primary' },
                { label: 'Total Views', value: apps.reduce((acc, a) => acc + a.stats.views, 0), icon: Eye, color: 'text-accent' },
                { label: 'Avg Rating', value: (apps.reduce((acc, a) => acc + a.stats.avgRating, 0) / (apps.length || 1)).toFixed(1), icon: Star, color: 'text-accent-2' }
              ].map((stat, i) => (
                <div key={i} className="bg-surface p-6 rounded-2xl border border-border shadow-sm grow">
                   <div className="flex items-center gap-3 mb-4">
                      <div className={cn("w-10 h-10 rounded-xl bg-surface-alt flex items-center justify-center", stat.color)}>
                         <stat.icon size={20} />
                      </div>
                      <span className="text-xs font-bold text-text-muted uppercase tracking-widest">{stat.label}</span>
                   </div>
                   <p className="text-4xl font-mono font-bold tracking-tighter">{stat.value}</p>
                </div>
              ))}
           </div>

           <div className="bg-surface p-8 rounded-2xl border border-border grow">
              <h3 className="font-display font-bold text-lg mb-6">Performance Trend</h3>
              <div className="h-64 flex items-end justify-between gap-2 overflow-hidden grow">
                 {Array(12).fill(0).map((_, i) => (
                    <div key={i} className="flex-1 space-y-2">
                       <div 
                         className="bg-primary/20 hover:bg-primary rounded-t-lg transition-all w-full"
                         style={{ height: `${Math.random() * 80 + 20}%` }}
                       ></div>
                       <p className="text-[10px] text-center text-text-muted font-mono">{i + 1}M</p>
                    </div>
                 ))}
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
