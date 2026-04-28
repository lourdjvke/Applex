import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, TrendingUp, Star, Filter, CheckCircle2 } from 'lucide-react';
import { dbGet, dbSet } from '../lib/firebase';
import { MiniApp } from '../types';
import AppCard from '../components/AppCard';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';

export default function Home() {
  const { user, profile } = useAuth();
  const [featured, setFeatured] = useState<MiniApp[]>([]);
  const [trending, setTrending] = useState<MiniApp[]>([]);
  const [installedApps, setInstalledApps] = useState<MiniApp[]>([]);
  const [categories, setCategories] = useState(['All', 'Utility', 'Game', 'Productivity', 'Social', 'Education']);
  const [activeCategory, setActiveCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      let apps = await dbGet<Record<string, MiniApp>>('apps');
      
      // ... (seed data logic remains)

      if (apps) {
        const appsList = Object.values(apps).filter(app => app && app.meta);
        const liveApps = appsList.filter(app => app.meta?.isPublished);
        
        setFeatured(liveApps.slice(0, 3));
        setTrending(liveApps.slice(0, 4));

        if (profile?.installedApps) {
          const installed = appsList.filter(a => profile.installedApps?.[a.id]);
          setInstalledApps(installed);
        }
      }
      setLoading(false);
    }
    fetchData();
  }, [user, profile]);

  return (
    <div className="pb-24 md:pb-0 grow">
      {/* Search Header (Mobile Only) */}
      <div className="md:hidden pt-2 px-4 pb-4">
        <div 
          onClick={() => navigate('/search')}
          className="flex items-center gap-3 px-4 py-3 bg-surface-alt border border-border rounded-lg text-text-muted cursor-text"
        >
          <Search size={18} />
          <span className="text-sm">Search mini-apps...</span>
        </div>
      </div>

      {/* Installed Apps Carousel */}
      {installedApps.length > 0 && (
        <section className="mb-10 px-4 md:px-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-xl tracking-tight">Your Apps</h2>
            <button onClick={() => navigate('/profile')} className="text-primary text-xs font-bold uppercase tracking-widest">See All</button>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 grow">
            {installedApps.map((app) => (
              <motion.div 
                key={app.id} 
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate(`/run/${app.id}`)}
                className="flex flex-col items-center gap-2 min-w-[80px] cursor-pointer"
              >
                <div className="relative">
                  <img src={app.meta?.iconBase64} className="w-16 h-16 rounded-2xl border border-border shadow-md" alt={app.meta?.name} />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-installed text-white rounded-full flex items-center justify-center border-2 border-bg">
                    <CheckCircle2 size={10} />
                  </div>
                </div>
                <span className="text-[10px] font-bold text-center truncate w-full">{app.meta?.name}</span>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Hero Featured Carousel */}
      <section className="mb-10 px-4 md:px-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold text-xl">Featured</h2>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4 snap-x no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 grow">
          {loading ? (
             Array(3).fill(0).map((_, i) => (
                <div key={i} className="min-w-[280px] h-40 bg-surface-alt animate-pulse rounded-xl border border-border"></div>
             ))
          ) : featured.map((app) => (
             <motion.div 
               key={app.id} 
               whileTap={{ scale: 0.98 }}
               onClick={() => navigate(`/app/${app.id}`)}
               className="min-w-[300px] h-44 rounded-xl overflow-hidden relative shadow-lg cursor-pointer snap-start grow"
             >
                <img 
                  src={app.meta?.screenshotsBase64?.[0] || app.meta?.iconBase64} 
                  className="w-full h-full object-cover"
                  alt={app.meta?.name}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-5">
                  <span className="text-[10px] font-mono font-bold bg-primary text-white px-2 py-0.5 rounded w-fit mb-2 uppercase">{app.meta?.category}</span>
                  <h3 className="text-white font-display font-bold text-lg leading-tight">{app.meta?.name}</h3>
                  <p className="text-white/70 text-xs line-clamp-1">{app.meta?.tagline}</p>
                </div>
             </motion.div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section className="mb-10 px-4 md:px-0 overflow-hidden">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar grow">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
               "px-5 py-2 rounded-lg text-sm font-sans font-medium whitespace-nowrap transition-all border",
               activeCategory === cat 
                ? "bg-primary text-white border-primary shadow-md shadow-primary/20" 
                : "bg-surface text-text-secondary border-border hover:border-text-muted"
              )}
            >
              {cat}
            </button>
          ))}
          <button className="p-2 border border-border rounded-lg bg-surface text-text-muted">
            <Filter size={18} />
          </button>
        </div>
      </section>

      {/* Trending Grid */}
      <section className="mb-12 px-4 md:px-0">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center text-accent">
               <TrendingUp size={18} />
            </div>
            <h2 className="font-display font-bold text-xl tracking-tight">Trending Now</h2>
          </div>
          <button className="text-primary text-xs font-bold font-sans uppercase tracking-widest hover:translate-x-1 transition-transform flex items-center gap-1">
            See all <ChevronRight size={14} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 grow">
          {loading ? (
             Array(4).fill(0).map((_, i) => (
                <div key={i} className="h-48 bg-surface-alt animate-pulse rounded-xl"></div>
             ))
          ) : trending.map((app) => (
             <AppCard key={app.id} app={app} />
          ))}
        </div>
      </section>

      {/* New Arrivals list */}
      <section className="mb-12 px-4 md:px-0">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display font-bold text-xl tracking-tight">New Arrivals</h2>
        </div>
        <div className="bg-surface rounded-2xl border border-border overflow-hidden shadow-card grow">
           {loading ? (
              Array(3).fill(0).map((_, i) => (
                <div key={i} className="h-20 border-b border-border bg-surface-alt/50 animate-pulse"></div>
              ))
           ) : trending.map((app) => (
              <AppCard key={app.id} app={app} variant="row" />
           ))}
        </div>
      </section>
    </div>
  );
}
