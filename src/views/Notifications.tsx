import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ArrowLeft, Trash2, CheckCircle2, ChevronRight, Smartphone } from 'lucide-react';
import { dbGet, dbUpdate, dbRemove } from '../lib/firebase';
import { AppNotification } from '../types';
import { useAuth } from '../lib/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export default function Notifications() {
  const { profile, user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (profile?.notifications) {
      setNotifications(Object.values(profile.notifications).sort((a: any, b: any) => b.createdAt - a.createdAt));
    } else {
      setNotifications([]);
    }
    setLoading(false);
  }, [profile]);

  const markAsRead = async (id: string) => {
    if (!user) return;
    await dbUpdate(`users/${user.uid}/profile/notifications/${id}`, { isRead: true });
  };

  const clearAll = async () => {
    if (!user) return;
    if (confirm('Clear all notifications?')) {
      await dbRemove(`users/${user.uid}/profile/notifications`);
      setNotifications([]);
    }
  };

  const handleNotificationClick = (n: AppNotification) => {
    markAsRead(n.id);
    if (n.type === 'update') {
      navigate(`/app/${n.appId}`);
    }
  };

  if (loading) return <div className="p-12 text-center">Loading notifications...</div>;

  return (
    <div className="pb-24 grow">
      <header className="py-8 flex items-center justify-between px-4 md:px-0">
        <div className="flex items-center gap-4">
           <button onClick={() => navigate(-1)} className="p-2 hover:bg-surface-alt rounded-full transition-colors">
              <ArrowLeft size={24} />
           </button>
           <h1 className="font-display font-extrabold text-3xl tracking-tight">Notifications</h1>
        </div>
        {notifications.length > 0 && (
          <button onClick={clearAll} className="text-xs font-bold text-primary flex items-center gap-1 hover:underline">
             Clear All <Trash2 size={14} />
          </button>
        )}
      </header>

      <div className="max-w-3xl mx-auto space-y-4 px-4 md:px-0 grow">
        {notifications.length > 0 ? (
          notifications.map((n) => (
            <motion.div 
               key={n.id}
               layout
               initial={{ opacity: 0, x: -20 }}
               animate={{ opacity: 1, x: 0 }}
               onClick={() => handleNotificationClick(n)}
               className={cn(
                 "bg-surface p-6 rounded-2xl border border-border shadow-sm flex items-start gap-4 transition-all cursor-pointer hover:shadow-md",
                 !n.isRead && "border-primary/30 ring-1 ring-primary/10"
               )}
            >
               <div className="relative shrink-0">
                  <img src={n.appIcon} alt={n.appName} className="w-12 h-12 rounded-xl shadow-sm border border-border" />
                  {!n.isRead && <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full border-2 border-bg shadow-sm"></div>}
               </div>

               <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                     <span className="text-[10px] font-bold text-primary uppercase tracking-widest">{n.type} notification</span>
                     <span className="text-[10px] text-text-muted font-mono">{new Date(n.createdAt).toLocaleDateString()}</span>
                  </div>
                  <h3 className="font-sans font-bold text-base mb-1">{n.title}</h3>
                  <p className="text-sm text-text-secondary leading-relaxed mb-4">{n.message}</p>
                  
                  {n.type === 'update' && (
                    <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider group">
                       View Update Summary <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </div>
                  )}
               </div>
            </motion.div>
          ))
        ) : (
          <div className="py-32 text-center space-y-4 bg-surface-alt rounded-[40px] border border-dashed border-border">
             <div className="w-20 h-20 bg-surface rounded-full flex items-center justify-center mx-auto text-text-muted group">
                <Bell size={40} className="group-hover:animate-bounce" />
             </div>
             <div className="space-y-1 px-4">
                <h3 className="font-display font-bold text-xl">All caught up</h3>
                <p className="text-text-muted max-w-xs mx-auto">None of your installed apps have new updates right now. Check back later!</p>
             </div>
             <button onClick={() => navigate('/')} className="px-6 py-2 bg-white border border-border rounded-lg text-sm font-bold shadow-sm active:scale-95 transition-all">
                Back to Home
             </button>
          </div>
        )}
      </div>
    </div>
  );
}
