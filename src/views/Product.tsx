import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { dbGet, dbUpdate, dbPush } from '../lib/firebase';
import { MiniApp, Review } from '../types';
import { Star, Download, Eye, Database, Chrome, ArrowLeft, Share2, MoreVertical, CheckCircle2, Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../lib/AuthContext';
import { cn } from '../lib/utils';

export default function Product() {
  const { id } = useParams<{ id: string }>();
  const [app, setApp] = useState<MiniApp | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [installing, setInstalling] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [loading, setLoading] = useState(true);
  const { profile, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      if (!id) return;
      const appData = await dbGet<MiniApp>(`apps/${id}`);
      if (appData) {
        setApp(appData);
        // Track view
        await dbUpdate(`apps/${id}/stats`, { views: (appData.stats?.views || 0) + 1 });
        
        // Check if installed
        if (profile?.installedApps?.[id]) {
          setIsInstalled(true);
        }
      }
      setLoading(false);
    }
    fetchData();
  }, [id, profile]);

  const cacheAppData = async () => {
    if (!app || !id) return;
    try {
      const cache = await caches.open('aiplex-apps-v1');
      const blob = new Blob([JSON.stringify(app)], { type: 'application/json' });
      await cache.put(`/api/local-app/${id}`, new Response(blob));
    } catch (err) {
      console.error("Failed to cache app:", err);
    }
  };

  const handleInstall = async () => {
    if (!id || !user || !app) return;
    setInstalling(true);
    await cacheAppData();
    setTimeout(async () => {
      await dbUpdate(`users/${user.uid}/profile/installedApps`, { [id]: { version: app.meta.version } });
      await dbUpdate(`apps/${id}/stats`, { 
        installs: (app.stats?.installs || 0) + 1,
        [`installedBy/${user.uid}`]: true
      });
      setIsInstalled(true);
      setInstalling(false);
    }, 2000);
  };

  const handleUpdate = async () => {
    if (!id || !user || !app) return;
    setInstalling(true);
    await cacheAppData();
    setTimeout(async () => {
      await dbUpdate(`users/${user.uid}/profile/installedApps/${id}`, { version: app.meta.version });
      setIsInstalled(true);
      setInstalling(false);
    }, 1500);
  };

  const installedVersion = profile?.installedApps?.[id as string]?.version;
  const updateAvailable = isInstalled && app && installedVersion !== app.meta.version;

  const handleReview = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!id || !user || !profile) return;
    const formData = new FormData(e.currentTarget);
    const rating = parseInt(formData.get('rating') as string);
    const body = formData.get('body') as string;

    const reviewData: Omit<Review, 'id'> = {
      appId: id,
      uid: user.uid,
      displayName: profile.displayName,
      avatarBase64: profile.avatarBase64,
      rating,
      body,
      createdAt: Date.now(),
      helpful: 0
    };

    await dbPush(`reviews/${id}`, reviewData);
    setReviews([reviewData as Review, ...reviews]);
    e.currentTarget.reset();
    
    // Update average rating
    const totalRating = reviews.reduce((acc, r) => acc + r.rating, 0) + rating;
    const newAvg = totalRating / (reviews.length + 1);
    await dbUpdate(`apps/${id}/stats`, { 
      avgRating: newAvg, 
      reviewCount: reviews.length + 1 
    });
  };

  useEffect(() => {
    async function fetchReviews() {
      if (!id) return;
      const reviewData = await dbGet<Record<string, Review>>(`reviews/${id}`);
      if (reviewData) {
        setReviews(Object.values(reviewData).sort((a, b) => b.createdAt - a.createdAt));
      }
    }
    fetchReviews();
  }, [id]);

  if (loading) return <div className="flex h-full items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  if (!app) return <div className="p-8 text-center"><h2 className="font-display text-2xl font-bold">App not found</h2><button onClick={() => navigate('/')} className="mt-4 text-primary">Go back</button></div>;

  return (
    <div className="pb-24 grow">
      {/* Search Header (Mobile Only) */}
      <div className="flex items-center justify-between mb-6 px-4 md:px-0">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-surface-alt rounded-full transition-colors">
          <ArrowLeft size={24} />
        </button>
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-surface-alt rounded-full transition-colors"><Share2 size={20} /></button>
          <button className="p-2 hover:bg-surface-alt rounded-full transition-colors"><MoreVertical size={20} /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 px-4 md:px-0">
        <div className="lg:col-span-2 space-y-8">
          {/* Main Info */}
          <section className="flex flex-col md:flex-row items-center md:items-start gap-6 text-center md:text-left">
            <img src={app.meta?.iconBase64} alt={app.meta?.name} className="w-32 h-32 rounded-[28px] shadow-xl border border-border" />
            <div className="flex-1">
              <h1 className="font-display font-extrabold text-3xl mb-1">{app.meta?.name}</h1>
              <p className="text-text-secondary font-medium mb-3">{app.meta?.tagline}</p>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                <span className="bg-surface-alt border border-border px-3 py-1 rounded-full text-xs font-semibold text-text-muted">{app.meta?.category}</span>
                <div className="flex items-center gap-1 text-sm font-bold text-accent-2">
                  <Star size={16} fill="currentColor" />
                  <span>{app.stats.avgRating.toFixed(1)}</span>
                </div>
                <span className="text-xs text-text-muted">({app.stats.reviewCount} reviews)</span>
              </div>
            </div>
          </section>

          {/* Primary Action */}
          <section className="bg-surface p-6 rounded-2xl border border-border shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-8">
              <div className="text-center">
                 <p className="text-[10px] uppercase tracking-widest text-text-muted font-bold mb-1">Installs</p>
                 <div className="flex items-center justify-center gap-1">
                    <Download size={16} className="text-text-secondary" />
                    <span className="font-mono font-bold text-lg">{app.stats.installs}</span>
                 </div>
              </div>
              <div className="w-px h-8 bg-border"></div>
              <div className="text-center">
                 <p className="text-[10px] uppercase tracking-widest text-text-muted font-bold mb-1">Size</p>
                 <div className="flex items-center justify-center gap-1">
                    <Database size={16} className="text-text-secondary" />
                    <span className="font-mono font-bold text-lg">{Math.round(app.code.sizeBytes / 1024)} KB</span>
                 </div>
              </div>
            </div>

            <div className="w-full md:w-auto grow">
              {updateAvailable ? (
                <div className="flex flex-col gap-3">
                  <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl flex items-start gap-3">
                    <Bell size={20} className="text-primary mt-1 shrink-0" />
                    <div>
                      <p className="text-sm font-bold">New Version {app.meta.version}</p>
                      <p className="text-xs text-text-muted italic">"{app.meta.updateSummary}"</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleUpdate}
                    disabled={installing}
                    className="w-full md:w-56 h-14 bg-primary text-white rounded-xl font-display font-bold text-lg flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-all"
                  >
                    {installing ? 'Updating...' : 'Update Now'}
                  </button>
                  <button 
                    onClick={() => navigate(`/run/${app.id}`)}
                    className="text-text-muted text-xs font-bold text-center hover:text-primary transition-colors"
                  >
                    Launch current version (v{installedVersion})
                  </button>
                </div>
              ) : isInstalled ? (
                <button 
                  onClick={() => navigate(`/run/${app.id}`)}
                  className="w-full md:w-56 h-14 bg-installed text-white rounded-xl font-display font-bold text-lg flex items-center justify-center gap-2 shadow-lg shadow-installed/20 active:scale-95 transition-all"
                >
                  <Chrome size={20} />
                  Open App
                </button>
              ) : (
                <button 
                  onClick={handleInstall}
                  disabled={installing}
                  className={cn(
                    "w-full md:w-56 h-14 bg-primary text-white rounded-xl font-display font-bold text-lg flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-70",
                    installing && "cursor-wait"
                  )}
                >
                  {installing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Installing...
                    </>
                  ) : (
                    <>
                      <Download size={20} />
                      Install Now
                    </>
                  )}
                </button>
              )}
            </div>
          </section>

          {/* Screenshots */}
          <section>
            <h2 className="font-display font-bold text-lg mb-4">Screenshots</h2>
            <div className="flex gap-4 overflow-x-auto pb-4 snap-x no-scrollbar grow">
              {app.meta?.screenshotsBase64?.map((ss, i) => (
                <img key={i} src={ss} className="h-96 rounded-xl border border-border snap-start" alt={`Screenshot ${i}`} />
              )) || (
                 <div className="w-full h-48 bg-surface-alt rounded-lg flex items-center justify-center text-text-muted italic">No screenshots available</div>
              )}
            </div>
          </section>

          {/* Description */}
          <section className="bg-surface p-8 rounded-2xl border border-border">
            <h2 className="font-display font-bold text-lg mb-4">About this app</h2>
            <p className="text-text-secondary leading-relaxed whitespace-pre-line">{app.meta?.description}</p>
          </section>

          {/* Reviews */}
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-xl tracking-tight">Reviews</h2>
              <div className="flex items-center gap-1 text-primary font-bold text-sm">
                <Star size={16} fill="currentColor" />
                <span>{app.stats.avgRating.toFixed(1)}</span>
              </div>
            </div>

            {/* Write Review */}
            <form onSubmit={handleReview} className="bg-surface-alt p-6 rounded-2xl border border-border space-y-4">
              <h3 className="font-sans font-bold text-sm">Write a Review</h3>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(v => (
                  <label key={v} className="cursor-pointer">
                    <input type="radio" name="rating" value={v} className="hidden peer" defaultChecked={v === 5} />
                    <Star size={24} className="text-text-muted peer-checked:text-accent-2 peer-checked:fill-accent-2" />
                  </label>
                ))}
              </div>
              <textarea 
                name="body"
                required
                className="w-full h-32 bg-surface p-4 rounded-xl border border-border focus:border-primary outline-none text-sm"
                placeholder="Share your thoughts on this app..."
              />
              <button className="bg-primary text-white px-6 py-2 rounded-lg font-display font-bold text-sm shadow-md shadow-primary/20">
                Submit Review
              </button>
            </form>

            <div className="space-y-4">
              {reviews.map((r, i) => (
                <div key={i} className="bg-surface p-6 rounded-2xl border border-border shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <img src={r.avatarBase64} alt={r.displayName} className="w-8 h-8 rounded-full border border-border" />
                    <span className="font-sans font-bold text-sm">{r.displayName}</span>
                    <div className="flex ml-auto">
                      {Array(5).fill(0).map((_, idx) => (
                        <Star key={idx} size={12} className={cn("text-text-muted", idx < r.rating && "text-accent-2 fill-accent-2")} />
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-text-secondary leading-relaxed">{r.body}</p>
                </div>
              ))}
              {reviews.length === 0 && (
                <p className="text-center text-text-muted py-10 italic">No reviews yet. Be the first!</p>
              )}
            </div>
          </section>
        </div>

        {/* Sidebar info */}
        <div className="space-y-8">
           <section className="bg-surface-alt p-6 rounded-2xl border border-border">
              <h2 className="font-display font-bold text-lg mb-4">Information</h2>
              <dl className="space-y-4">
                <div>
                  <dt className="text-[10px] uppercase font-bold text-text-muted mb-1">Developer</dt>
                  <dd className="text-sm font-semibold">{app.meta.creatorUid === profile?.uid ? 'You' : 'Creator Studio'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase font-bold text-text-muted mb-1">Updated</dt>
                  <dd className="text-sm font-semibold">{new Date(app.meta.updatedAt).toLocaleDateString()}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase font-bold text-text-muted mb-1">Category</dt>
                  <dd className="text-sm font-semibold">{app.meta.category}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase font-bold text-text-muted mb-1">Tags</dt>
                  <dd className="flex flex-wrap gap-2 mt-1">
                    {app.meta.tags?.map(tag => (
                      <span key={tag} className="text-[10px] bg-white px-2 py-0.5 border border-border rounded font-mono text-text-secondary">#{tag}</span>
                    ))}
                  </dd>
                </div>
              </dl>
           </section>

           <section className="bg-surface p-6 rounded-2xl border border-border shadow-sm">
             <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold text-lg">Requirements</h2>
                <CheckCircle2 className="text-installed" size={20} />
             </div>
             <ul className="space-y-2 text-sm text-text-secondary">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-border"></div>
                  Works offline
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-border"></div>
                  No data access needed
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-border"></div>
                  Isolated sandbox
                </li>
             </ul>
           </section>
        </div>
      </div>
      
      <AnimatePresence>
        {installing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          >
            <motion.div 
               initial={{ scale: 0.9, y: 20 }}
               animate={{ scale: 1, y: 0 }}
               className="bg-surface w-full max-w-sm rounded-[24px] p-8 text-center shadow-2xl grow"
            >
               <div className="w-20 h-20 bg-primary/10 text-primary rounded-3xl flex items-center justify-center mx-auto mb-6">
                  <Download size={40} className="animate-bounce" />
               </div>
               <h3 className="font-display font-bold text-2xl mb-2">Installing {app.meta.name}</h3>
               <p className="text-text-secondary text-sm mb-8">Caching files for offline use and setting up your isolated environment.</p>
               
               <div className="w-full h-2 bg-border rounded-full overflow-hidden mb-2">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 2 }}
                    className="h-full bg-primary"
                  />
               </div>
               <p className="text-[10px] font-mono text-text-muted uppercase tracking-widest">Optimizing resources...</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
