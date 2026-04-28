import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Users, PlusSquare, Layout as StudioIcon, User as UserIcon, Bell, Search, LogOut } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const unreadCount = Object.values(profile?.notifications || {}).filter((n: any) => !n.isRead).length;

  const navItems = [
    { label: 'Home', icon: Home, path: '/' },
    { label: 'Community', icon: Users, path: '/community' },
    { label: 'Studio', icon: StudioIcon, path: '/studio' },
    { label: 'Profile', icon: UserIcon, path: '/profile' },
  ];

  return (
    <div className="flex h-screen bg-bg overflow-hidden flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 border-r border-border bg-surface flex-col p-6 h-full shrink-0">
        <div className="mb-8">
          <h1 className="font-display font-extrabold text-2xl text-primary leading-tight">AIPLEX</h1>
          <p className="text-xs text-text-muted font-sans font-medium uppercase tracking-widest mt-1">AI Mini-Apps</p>
        </div>

        <nav className="flex-1 space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg font-sans font-medium transition-all relative",
                location.pathname === item.path 
                  ? "bg-primary/5 text-primary border-l-4 border-primary" 
                  : "text-text-secondary hover:bg-surface-alt"
              )}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-border">
          {profile && (
            <div className="flex items-center gap-3">
              <img 
                src={profile.avatarBase64 || `https://ui-avatars.com/api/?name=${profile.displayName}`} 
                alt="Profile" 
                className="w-10 h-10 rounded-full border border-border"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate leading-none mb-1">{profile.displayName}</p>
                <p className="text-[10px] text-text-muted uppercase font-mono">{profile.role}</p>
              </div>
              <button 
                onClick={() => signOut()}
                className="text-text-muted hover:text-primary transition-colors"
              >
                <LogOut size={18} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 relative h-full">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 sticky top-0 z-20 bg-bg/80 backdrop-blur-md border-b border-border transition-all">
          <h1 className="font-display font-extrabold text-xl text-primary">AIPLEX</h1>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/search')} className="text-text-secondary p-1">
              <Search size={22} />
            </button>
            <button onClick={() => navigate('/notifications')} className="text-text-secondary relative p-1">
              <Bell size={22} />
              {unreadCount > 0 && <span className="absolute top-0 right-0 w-2 h-2 bg-primary rounded-full border-2 border-bg"></span>}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden md:p-8 relative">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-7xl mx-auto h-full"
          >
            {children}
          </motion.div>
        </div>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden grid grid-cols-5 items-center bg-surface border-t border-border h-16 shrink-0 relative z-30">
          {navItems.map((item, idx) => {
            // Insert FAB in the middle
            if (idx === 2) {
              return (
                <React.Fragment key="fab-wrap">
                  <div key="fab" className="relative flex justify-center -top-4 pointer-events-none">
                    <button 
                      onClick={() => navigate('/create')}
                      className="w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/40 pointer-events-auto active:scale-95 transition-transform"
                    >
                      <PlusSquare size={28} />
                    </button>
                  </div>
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 h-full pt-1 transition-colors",
                      location.pathname === item.path ? "text-primary" : "text-text-muted"
                    )}
                  >
                    <item.icon size={20} />
                    <span className="text-[10px] font-sans font-medium">{item.label}</span>
                  </Link>
                </React.Fragment>
              );
            }
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 h-full pt-1 transition-colors",
                  location.pathname === item.path ? "text-primary" : "text-text-muted"
                )}
              >
                <item.icon size={20} />
                <span className="text-[10px] font-sans font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
