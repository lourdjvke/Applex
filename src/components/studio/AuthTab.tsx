import { useState, useEffect } from 'react';
import { Users, Trash2, RefreshCw, Plus, UserPlus, Mail, Calendar, LogIn } from 'lucide-react';
import { DatasetEngine } from '../../lib/dataset-engine';
import { AppAuthUser } from '../../types';
import { cn } from '../../lib/utils';

export default function AuthTab({ creatorUid, appId }: { creatorUid: string; appId: string }) {
  const [users, setUsers] = useState<AppAuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [engine] = useState(() => new DatasetEngine(creatorUid, appId));

  const fetchData = async () => {
    setLoading(true);
    const list = await engine.authListUsers();
    setUsers(list as any);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [appId]);

  const handleAddUser = async () => {
    const email = prompt("Email:");
    const pass = prompt("Password:");
    const name = prompt("Display Name:");
    if (email && pass) {
      await engine.authSignup(email, pass, name || '');
      fetchData();
    }
  };

  const handleDelete = async (uid: string, email: string) => {
    if (confirm(`Delete user ${email}?`)) {
      await engine.authDeleteUser(uid);
      fetchData();
    }
  };

  const timeAgo = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString();
  };

  return (
    <div className="space-y-6 grow">
      <div className="flex items-center justify-between mb-8 px-4 md:px-0">
        <div className="flex items-center gap-4">
           <button onClick={() => fetchData()} className="p-2 hover:bg-surface rounded-lg transition-colors">
              <RefreshCw size={18} className={cn(loading && "animate-spin")} />
           </button>
           <h3 className="font-display font-bold text-lg">App Authenticated Users</h3>
        </div>
        <button 
          onClick={handleAddUser}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary-dim shadow-lg transition-all"
        >
           <UserPlus size={16} /> Add Test User
        </button>
      </div>

      <div className="bg-surface rounded-2xl border border-border overflow-hidden grow">
        <div className="grid grid-cols-4 h-10 border-b border-border bg-surface-alt px-4 items-center text-[10px] uppercase font-bold text-text-muted tracking-widest">
           <div>User</div>
           <div>Created</div>
           <div>Last Login</div>
           <div className="text-right">Actions</div>
        </div>

        {users.length > 0 ? (
          <div className="divide-y divide-border/50 grow">
             {users.map(u => (
               <div key={u.authUserId} className="grid grid-cols-4 px-4 py-4 items-center hover:bg-surface-alt transition-colors grow">
                  <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                        {u.displayName?.[0]?.toUpperCase() || u.email?.[0]?.toUpperCase() || '?'}
                     </div>
                     <div className="flex flex-col truncate">
                        <span className="text-sm font-semibold truncate">{u.displayName || 'No Name'}</span>
                        <span className="text-[10px] text-text-muted font-mono truncate">{u.email}</span>
                     </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                     <Calendar size={12} /> {timeAgo(u.createdAt)}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                     <LogIn size={12} /> {u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'Never'}
                  </div>
                  <div className="flex justify-end">
                     <button 
                       onClick={() => handleDelete(u.authUserId, u.email)}
                       className="p-2 hover:bg-primary/10 rounded-lg text-text-muted hover:text-primary transition-colors"
                     >
                        <Trash2 size={16} />
                     </button>
                  </div>
               </div>
             ))}
          </div>
        ) : (
          <div className="py-20 text-center space-y-4">
             <Users size={48} className="mx-auto text-text-muted opacity-20" />
             <div>
                <p className="font-bold text-lg">No users yet</p>
                <p className="text-sm text-text-muted">Your app's auth users will appear here.</p>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
