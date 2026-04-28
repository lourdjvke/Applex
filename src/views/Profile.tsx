import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { dbGet, dbUpdate } from '../lib/firebase';
import { UserProfile, MiniApp } from '../types';
import { useAuth } from '../lib/AuthContext';
import { Edit3, Settings, Shield, Package, LayoutGrid, Star, LogOut, CheckCircle2 } from 'lucide-react';
import AppCard from '../components/AppCard';
import { cn } from '../lib/utils';

export default function Profile() {
  const { uid } = useParams<{ uid: string }>();
  const { user, profile: myProfile, signOut } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [apps, setApps] = useState<MiniApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'installed' | 'created'>('installed');
  const navigate = useNavigate();

  const isOwnProfile = !uid || uid === user?.uid;

  useEffect(() => {
    async function fetchData() {
      const targetUid = uid || user?.uid;
      if (!targetUid) return;

      const p = await dbGet<UserProfile>(`users/${targetUid}/profile`);
      setProfile(p);

      const allApps = await dbGet<Record<string, MiniApp>>('apps');
      if (allApps) {
        const appsList = Object.values(allApps);
        if (isOwnProfile) {
          // If own profile, show installed and created
          const installedIds = Object.keys(p?.installedApps || {});
          const installed = appsList.filter(a => a && installedIds.includes(a.id));
          const created = appsList.filter(a => a && a.meta && a.meta.creatorUid === targetUid);
          setApps(activeTab === 'installed' ? installed : created);
        } else {
          // If someone else, just show their created apps
          const created = appsList.filter(a => a && a.meta && a.meta.creatorUid === targetUid);
          setApps(created);
          setActiveTab('created');
        }
      }
      setLoading(false);
    }
    fetchData();
  }, [uid, user, activeTab, isOwnProfile]);

  if (loading) return <div className="p-20 text-center">Loading profile...</div>;
  if (!profile) return <div className="p-20 text-center">User not found</div>;

  return (
    <div className="pb-24 grow">
      {/* Profile Header */}
      <div className="relative mb-20 grow">
        <div className="h-40 bg-surface-alt border-b border-border rounded-b-[40px] grow"></div>
        <div className="absolute -bottom-16 left-8 flex items-end gap-6 grow">
          <div className="relative">
             <img 
               src={profile.avatarBase64 || `https://ui-avatars.com/api/?name=${profile.displayName}`} 
               alt="Avatar" 
               className="w-32 h-32 rounded-full border-4 border-bg bg-surface shadow-xl object-cover shrink-0" 
             />
             {profile.role === 'creator' && (
                <div className="absolute bottom-1 right-1 w-8 h-8 bg-primary rounded-full border-4 border-bg flex items-center justify-center text-white">
                   <CheckCircle2 size={16} />
                </div>
             )}
          </div>
          <div className="pb-4 grow">
             <h1 className="font-display font-extrabold text-3xl mb-1">{profile.displayName}</h1>
             <p className="text-text-muted font-mono text-xs uppercase tracking-widest">{profile.role}</p>
          </div>
        </div>
        {isOwnProfile && (
           <div className="absolute bottom-4 right-8 flex gap-3">
              <button className="p-3 bg-surface border border-border rounded-xl text-text-secondary hover:text-primary transition-all shadow-sm">
                 <Settings size={20} />
              </button>
              <button 
                onClick={() => signOut()}
                className="flex items-center gap-2 px-6 py-3 bg-primary/5 text-primary border border-primary/20 rounded-xl font-display font-bold text-sm hover:bg-primary/10 transition-all"
              >
                 <LogOut size={18} /> Sign Out
              </button>
           </div>
        )}
      </div>

      <div className="px-4 md:px-0 grid grid-cols-1 lg:grid-cols-3 gap-8 grow">
        <div className="lg:col-span-1 space-y-6 shrink-0">
           <section className="bg-surface p-6 rounded-2xl border border-border grow">
              <h3 className="font-display font-bold text-lg mb-4">Bio</h3>
              <p className="text-text-secondary text-sm leading-relaxed">
                 {profile.bio || "This user prefers to keep their bio a mystery."}
              </p>
           </section>

           <section className="bg-surface-alt p-6 rounded-2xl border border-border flex justify-around text-center grow">
              <div>
                 <p className="text-[10px] uppercase font-bold text-text-muted mb-1">Apps</p>
                 <p className="font-mono font-bold text-xl">12</p>
              </div>
              <div className="w-px h-8 bg-border"></div>
              <div>
                 <p className="text-[10px] uppercase font-bold text-text-muted mb-1">Installs</p>
                 <p className="font-mono font-bold text-xl">4.8k</p>
              </div>
              <div className="w-px h-8 bg-border"></div>
              <div>
                 <p className="text-[10px] uppercase font-bold text-text-muted mb-1">Reviews</p>
                 <p className="font-mono font-bold text-xl">86</p>
              </div>
           </section>
        </div>

        <div className="lg:col-span-2 grow">
           <div className="flex gap-6 border-b border-border mb-6">
              {isOwnProfile && (
                <button 
                  onClick={() => setActiveTab('installed')}
                  className={cn(
                    "pb-3 text-sm font-bold transition-all relative",
                    activeTab === 'installed' ? "text-primary border-b-2 border-primary" : "text-text-muted"
                  )}
                >
                  Installed Apps
                </button>
              )}
              <button 
                onClick={() => setActiveTab('created')}
                className={cn(
                  "pb-3 text-sm font-bold transition-all relative",
                  activeTab === 'created' ? "text-primary border-b-2 border-primary" : "text-text-muted"
                )}
              >
                Published Apps
              </button>
           </div>

           <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 grow">
              {apps.length > 0 ? (
                apps.map(app => (
                   <AppCard 
                     key={app.id} 
                     app={app} 
                     directLaunch={activeTab === 'installed'} 
                   />
                ))
              ) : (
                <div className="col-span-full py-20 text-center bg-surface-alt rounded-2xl border border-dashed border-border text-text-muted">
                    {activeTab === 'installed' ? "You haven't installed any apps yet." : "No published apps yet."}
                </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
}
