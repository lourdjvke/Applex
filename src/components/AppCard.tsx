import { Download, Star, PlayCircle } from 'lucide-react';
import { MiniApp } from '../types';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import type { Key } from 'react';

interface AppCardProps {
  app: MiniApp;
  variant?: 'grid' | 'row' | 'compact';
  key?: Key;
  directLaunch?: boolean;
}

export default function AppCard({ app, variant = 'grid', directLaunch = false }: AppCardProps) {
  const linkPath = directLaunch ? `/run/${app.id}` : `/app/${app.id}`;

  if (variant === 'row') {
    return (
      <Link to={linkPath} className="block group grow">
        <div className="flex items-center gap-4 py-4 px-4 bg-surface hover:bg-surface-alt transition-colors border-b border-border last:border-0 grow">
          <img 
            src={app.meta?.iconBase64} 
            alt={app.meta?.name} 
            className="w-12 h-12 rounded-xl object-cover shrink-0"
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-sans font-semibold text-sm truncate group-hover:text-primary transition-colors">{app.meta?.name}</h3>
            <p className="text-xs text-text-muted truncate">{app.meta?.tagline}</p>
          </div>
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-1 text-[10px] text-text-muted font-mono bg-border/30 px-2 py-0.5 rounded">
                <Star size={10} className="text-accent-2 fill-accent-2" />
                <span>{app.stats.avgRating.toFixed(1)}</span>
             </div>
             <button className="h-8 px-4 rounded-md bg-primary/10 text-primary font-display font-semibold text-xs hover:bg-primary hover:text-white transition-all">
                GET
             </button>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="bg-surface border border-border rounded-xl p-4 shadow-card hover:border-primary/30 transition-all flex flex-col h-full grow"
    >
      <Link to={linkPath} className="group flex-1 grow">
        <div className="flex items-start gap-3 mb-3">
          <img 
            src={app.meta?.iconBase64} 
            alt={app.meta?.name} 
            className="w-14 h-14 rounded-xl object-cover shadow-sm shrink-0"
          />
          <div className="min-w-0">
            <h3 className="font-sans font-bold text-sm leading-tight truncate group-hover:text-primary transition-colors">{app.meta?.name}</h3>
            <span className="text-[10px] text-text-muted font-medium uppercase tracking-wider">{app.meta?.category}</span>
          </div>
        </div>
        
        <p className="text-xs text-text-secondary line-clamp-2 mb-4 h-8 leading-relaxed">
          {app.meta?.tagline}
        </p>

        <div className="flex items-center justify-between mt-auto">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <Star size={12} className="text-accent-2 fill-accent-2" />
              <span className="text-[10px] font-mono font-bold">{app.stats.avgRating.toFixed(1)}</span>
              <span className="text-[10px] text-text-muted">({app.stats.reviewCount})</span>
            </div>
            <div className="flex items-center gap-1 text-text-muted">
              <Download size={10} />
              <span className="text-[10px] font-mono">{app.stats.installs.toLocaleString()}</span>
            </div>
          </div>
          <button className="h-8 px-5 rounded-md bg-primary text-white font-display font-bold text-xs shadow-md shadow-primary/20 active:scale-95 transition-all">
            GET
          </button>
        </div>
      </Link>
    </motion.div>
  );
}

