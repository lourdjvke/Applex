import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowLeft, X, TrendingUp, History, Star } from 'lucide-react';
import { dbGet } from '../lib/firebase';
import { MiniApp } from '../types';
import AppCard from '../components/AppCard';
import { motion, AnimatePresence } from 'motion/react';

export default function SearchOverlay() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MiniApp[]>([]);
  const [recentSearches, setRecentSearches] = useState(['quiz', 'budget', 'calendar', 'game']);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = setTimeout(async () => {
      if (query.trim()) {
        setLoading(true);
        const allApps = await dbGet<Record<string, MiniApp>>('apps');
        if (allApps) {
          const list = Object.values(allApps).filter(a => 
            a && a.meta && a.meta.isPublished && (
              a.meta.name.toLowerCase().includes(query.toLowerCase()) || 
              a.meta.description.toLowerCase().includes(query.toLowerCase()) ||
              a.meta.category.toLowerCase().includes(query.toLowerCase())
            )
          );
          setResults(list);
        }
        setLoading(false);
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [query]);

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col grow">
      {/* Header */}
      <div className="h-16 bg-surface border-b border-border flex items-center gap-4 px-4 shrink-0 transition-all">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-surface-alt rounded-full transition-colors">
          <ArrowLeft size={24} />
        </button>
        <div className="flex-1 relative">
           <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
           <input 
             autoFocus
             value={query}
             onChange={(e) => setQuery(e.target.value)}
             placeholder="Search 1,000+ mini-apps..."
             className="w-full h-10 pl-10 pr-10 bg-surface-alt border border-transparent focus:border-primary rounded-lg outline-none text-sm transition-all grow"
           />
           {query && (
             <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted">
               <X size={16} />
             </button>
           )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 grow">
        <AnimatePresence mode="wait">
          {!query ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-10"
            >
              <section>
                 <h2 className="flex items-center gap-2 text-xs font-bold uppercase text-text-muted tracking-widest mb-4">
                    <History size={14} /> Recent Searches
                 </h2>
                 <div className="flex flex-wrap gap-2 grow">
                    {recentSearches.map(s => (
                      <button 
                        key={s} 
                        onClick={() => setQuery(s)}
                        className="px-4 py-2 bg-surface border border-border rounded-lg text-sm hover:border-primary transition-colors grow"
                      >
                         {s}
                      </button>
                    ))}
                 </div>
              </section>

              <section>
                 <h2 className="flex items-center gap-2 text-xs font-bold uppercase text-text-muted tracking-widest mb-4">
                    <TrendingUp size={14} /> Popular Categories
                 </h2>
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4 grow">
                    {['Games', 'Finance', 'Education', 'Social'].map(cat => (
                       <button 
                         key={cat} 
                         onClick={() => setQuery(cat)}
                         className="p-4 bg-surface-alt rounded-xl border border-border text-center group hover:border-primary transition-all grow"
                       >
                          <p className="font-sans font-bold group-hover:text-primary transition-colors">{cat}</p>
                       </button>
                    ))}
                 </div>
              </section>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
               {loading ? (
                 <div className="py-20 text-center text-text-muted">Searching the marketplace...</div>
               ) : results.length > 0 ? (
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 grow">
                    {results.map(app => (
                       <AppCard key={app.id} app={app} />
                    ))}
                 </div>
               ) : (
                 <div className="py-20 text-center space-y-4">
                    <div className="w-16 h-16 bg-surface-alt rounded-2xl flex items-center justify-center mx-auto text-text-muted">
                       <Search size={32} />
                    </div>
                    <h3 className="font-display font-bold text-xl">No results for "{query}"</h3>
                    <p className="text-text-muted max-w-xs mx-auto">Try different keywords or browse our trending categories.</p>
                 </div>
               )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
