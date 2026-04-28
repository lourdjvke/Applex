import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Sparkles, ChevronUp, Check, X, Rocket, RefreshCcw, Bell, Trash2 } from 'lucide-react';
import { dbGet, dbUpdate, dbSet, dbRemove } from '../lib/firebase';
import { MiniApp, AppNotification } from '../types';
import { useAuth } from '../lib/AuthContext';
import { editAppCode, generateUpdateSummary } from '../lib/gemini';
import { motion, AnimatePresence } from 'motion/react';
import { cn, generateId } from '../lib/utils';

export default function EditApp() {
  const { id } = useParams<{ id: string }>();
  const [app, setApp] = useState<MiniApp | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAiSheet, setShowAiSheet] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [editingCode, setEditingCode] = useState(false);
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [updateSummary, setUpdateSummary] = useState('');
  
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      if (!id) return;
      const data = await dbGet<MiniApp>(`apps/${id}`);
      if (data) setApp(data);
      setLoading(false);
    }
    fetchData();
  }, [id]);

  const handleBasicSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!app || !id) return;
    setSaving(true);
    await dbUpdate(`apps/${id}/meta`, app.meta);
    setSaving(false);
  };

  const handleAiEdit = async () => {
    if (!app || !aiPrompt) return;
    setEditingCode(true);
    try {
      const newCode = await editAppCode(app.code.html, aiPrompt);
      const summary = await generateUpdateSummary(app.code.html, newCode, aiPrompt);
      setPreviewCode(newCode);
      setUpdateSummary(summary);
    } catch (err) {
      console.error(err);
    } finally {
      setEditingCode(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !app) return;
    if (confirm(`Are you sure you want to PERMANENTLY DELETE ${app.meta.name}? This cannot be undone.`)) {
      setSaving(true);
      await dbRemove(`apps/${id}`);
      // Also remove from user's profile if they created it (redundant but safe)
      navigate('/studio');
    }
  };

  const handleApplyVersion = async () => {
    if (!app || !id || !previewCode || !user) return;
    setSaving(true);
    
    const oldVersion = app.meta.version;
    const parts = oldVersion.split('.');
    const newVersion = `${parts[0]}.${parseInt(parts[1]) + 1}.0`;

    const updates = {
      'meta/version': newVersion,
      'meta/updatedAt': Date.now(),
      'meta/updateSummary': updateSummary,
      'code/html': previewCode,
      'code/sizeBytes': new Blob([previewCode]).size
    };

    await dbUpdate(`apps/${id}`, updates);

    // Send notifications to all installed users
    if (app.stats.installedBy) {
      const uids = Object.keys(app.stats.installedBy);
      const notification: AppNotification = {
        id: generateId(),
        appId: id,
        appName: app.meta.name,
        appIcon: app.meta.iconBase64,
        title: 'New Version Available',
        message: updateSummary,
        type: 'update',
        createdAt: Date.now(),
        isRead: false
      };

      for (const uid of uids) {
        await dbSet(`users/${uid}/profile/notifications/${notification.id}`, notification);
      }
    }

    setApp({ ...app, meta: { ...app.meta, version: newVersion, updateSummary }, code: { ...app.code, html: previewCode } });
    setPreviewCode(null);
    setShowAiSheet(false);
    setSaving(false);
  };

  if (loading) return <div className="p-12 text-center">Loading app data...</div>;
  if (!app) return <div className="p-12 text-center underline cursor-pointer" onClick={() => navigate('/studio')}>App not found. Back to Studio.</div>;

  return (
    <div className="pb-24 grow">
      <header className="h-16 flex items-center justify-between px-4 border-b border-border sticky top-0 bg-bg/80 backdrop-blur-md z-30 grow">
        <div className="flex items-center gap-3">
           <button onClick={() => navigate('/studio')} className="p-2 hover:bg-surface-alt rounded-full transition-colors">
              <ArrowLeft size={20} />
           </button>
           <h1 className="font-display font-bold truncate max-w-[200px]">Edit {app.meta.name}</h1>
        </div>
        <div className="flex items-center gap-2">
           <button 
             onClick={() => setShowAiSheet(true)}
             className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-lg text-sm font-bold hover:bg-primary/20 transition-all"
           >
              <Sparkles size={16} /> New Version
           </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-10 grow">
        <form onSubmit={handleBasicSave} className="grid grid-cols-1 md:grid-cols-3 gap-10 grow">
          <div className="md:col-span-1 space-y-6">
             <div className="relative group">
                <img src={app.meta.iconBase64} className="w-32 h-32 rounded-3xl border border-border shadow-md object-cover grow" alt={app.meta.name} />
                <button type="button" className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-3xl transition-opacity text-white text-xs font-bold">
                   Change Icon
                </button>
             </div>
             
             <div className="space-y-4">
                <div className="flex items-center justify-between">
                   <p className="text-sm font-bold">Status</p>
                   <button 
                      type="button"
                      onClick={() => setApp({ ...app, meta: { ...app.meta, isPublished: !app.meta.isPublished } })}
                      className={cn(
                        "text-[10px] uppercase font-bold px-3 py-1 rounded-full transition-all",
                        app.meta.isPublished ? "bg-installed/10 text-installed border border-installed/20" : "bg-text-muted/10 text-text-muted border border-border"
                      )}
                   >
                     {app.meta.isPublished ? 'Live' : 'Draft'}
                   </button>
                </div>
                <div className="flex items-center justify-between">
                   <p className="text-sm font-bold">Version</p>
                   <span className="font-mono text-xs text-text-muted">v{app.meta.version}</span>
                </div>
                <div className="flex items-center justify-between">
                   <p className="text-sm font-bold">Category</p>
                   <select 
                      value={app.meta.category}
                      onChange={(e) => setApp({ ...app, meta: { ...app.meta, category: e.target.value } })}
                      className="text-xs bg-surface-alt border border-border rounded px-2 py-1 outline-none"
                   >
                      {['Utility', 'Game', 'Productivity', 'Social', 'Education'].map(c => <option key={c}>{c}</option>)}
                   </select>
                </div>
             </div>
          </div>

          <div className="md:col-span-2 space-y-6">
             <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-text-muted tracking-widest">App Title</label>
                <input 
                  type="text" 
                  value={app.meta.name}
                  onChange={(e) => setApp({ ...app, meta: { ...app.meta, name: e.target.value } })}
                  className="w-full h-12 px-4 bg-surface border border-border rounded-xl focus:border-primary outline-none transition-all grow"
                />
             </div>
             <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-text-muted tracking-widest">Short Tagline</label>
                <input 
                  type="text" 
                  value={app.meta.tagline}
                  onChange={(e) => setApp({ ...app, meta: { ...app.meta, tagline: e.target.value } })}
                  className="w-full h-12 px-4 bg-surface border border-border rounded-xl focus:border-primary outline-none transition-all grow"
                />
             </div>
             <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-text-muted tracking-widest">Description</label>
                <textarea 
                  value={app.meta.description}
                  onChange={(e) => setApp({ ...app, meta: { ...app.meta, description: e.target.value } })}
                  className="w-full h-32 p-4 bg-surface border border-border rounded-xl focus:border-primary outline-none transition-all text-sm grow"
                />
             </div>
             <button 
                type="submit"
                disabled={saving}
                className="w-full h-12 bg-primary text-white rounded-xl font-display font-bold flex items-center justify-center gap-2 hover:bg-primary-dim transition-all disabled:opacity-50"
             >
                <Save size={18} /> {saving ? 'Saving...' : 'Save Meta Changes'}
             </button>

             <div className="pt-10">
                <button 
                   type="button"
                   onClick={handleDelete}
                   className="w-full h-12 border border-primary/20 text-primary rounded-xl font-display font-bold flex items-center justify-center gap-2 hover:bg-primary/5 transition-all"
                >
                   <Trash2 size={18} /> Delete App Permanently
                </button>
             </div>
          </div>
        </form>

        <section className="bg-surface-alt rounded-2xl p-8 border border-border grow">
           <h3 className="font-display font-bold text-lg mb-2">Production Code</h3>
           <p className="text-sm text-text-muted mb-6">This is the code currently running for all users.</p>
           <div className="aspect-video bg-black rounded-xl overflow-hidden relative border border-border shadow-inner grow">
              <iframe 
                srcDoc={app.code.html}
                className="w-full h-full border-none pointer-events-none"
                title="Code Preview"
              />
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                 <button onClick={() => navigate(`/run/${id}`)} className="bg-white/90 text-black px-6 py-2 rounded-full font-bold text-sm shadow-xl grow">
                    Preview in Runner
                 </button>
              </div>
           </div>
        </section>
      </div>

      {/* AI Edit Bottom Sheet */}
      <AnimatePresence>
         {showAiSheet && (
           <>
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => !editingCode && setShowAiSheet(false)}
               className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]" 
             />
             <motion.div 
               initial={{ y: '100%' }}
               animate={{ y: 0 }}
               exit={{ y: '100%' }}
               transition={{ type: 'spring', damping: 25, stiffness: 200 }}
               className="fixed inset-x-0 bottom-0 h-[90vh] bg-bg rounded-t-[32px] shadow-2xl z-[101] flex flex-col overflow-hidden border-t-4 border-primary grow"
             >
                <div className="h-16 flex items-center justify-between px-6 border-b border-border shrink-0">
                   <h2 className="font-display font-bold text-lg flex items-center gap-2">
                      <Sparkles size={20} className="text-primary" /> AI Version Editor
                   </h2>
                   <button onClick={() => !editingCode && setShowAiSheet(false)} className="p-2 hover:bg-surface-alt rounded-full">
                      <X size={20} />
                   </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar grow">
                   {!previewCode ? (
                     <div className="space-y-6 max-w-2xl mx-auto py-10 grow">
                        <div className="text-center space-y-2 mb-10">
                           <h3 className="font-display font-bold text-2xl">Describe your updates</h3>
                           <p className="text-text-muted">Tell the AI what to change, add, or fix in this version.</p>
                        </div>
                        <textarea 
                           value={aiPrompt}
                           onChange={(e) => setAiPrompt(e.target.value)}
                           className="w-full h-48 bg-surface border border-border rounded-2xl p-6 outline-none focus:border-primary transition-all text-lg font-sans shadow-inner placeholder:text-text-muted/30 grow"
                           placeholder="e.g. Add a dark mode toggle to the top right, and make the button colors more vibrant. Also fix the alignment issue on mobile..."
                        />
                        <button 
                           onClick={handleAiEdit}
                           disabled={!aiPrompt || editingCode}
                           className="w-full h-16 bg-primary text-white rounded-2xl font-display font-bold text-lg flex items-center justify-center gap-3 shadow-xl transition-all disabled:opacity-50"
                        >
                           {editingCode ? (
                             <>
                               <RefreshCcw size={20} className="animate-spin" /> Tinkering with code...
                             </>
                           ) : (
                             <>
                               Update App Code <ChevronUp size={20} />
                             </>
                           )}
                        </button>
                     </div>
                   ) : (
                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 grow">
                        <div className="space-y-6">
                           <div className="bg-surface rounded-2xl border border-border p-6 grow">
                              <h3 className="font-display font-bold mb-4 flex items-center gap-2 uppercase text-xs text-text-muted tracking-widest">
                                 AI Update Summary
                              </h3>
                              <p className="text-lg font-sans font-medium text-text-secondary leading-relaxed p-4 bg-primary/5 rounded-xl border border-primary/10 grow">
                                 "{updateSummary}"
                              </p>
                           </div>

                           <div className="bg-surface rounded-2xl border border-border p-6 grow">
                              <h3 className="font-display font-bold mb-4 uppercase text-xs text-text-muted tracking-widest flex justify-between items-center">
                                 Deployment Preview
                                 <span className="bg-accent-2/10 text-accent-2 px-2 py-0.5 rounded-full lowercase text-[10px] font-bold">Unsaved Draft</span>
                              </h3>
                              <div className="aspect-video bg-black rounded-xl overflow-hidden relative shadow-lg">
                                 <iframe 
                                    srcDoc={previewCode}
                                    className="w-full h-full border-none"
                                    title="Update Preview"
                                 />
                              </div>
                           </div>

                           <div className="flex gap-4">
                              <button 
                                 onClick={() => setPreviewCode(null)}
                                 className="flex-1 h-14 bg-surface border border-border text-text-secondary rounded-xl font-display font-bold hover:bg-surface-alt transition-all"
                              >
                                 Discard Change
                              </button>
                              <button 
                                 onClick={handleApplyVersion}
                                 disabled={saving}
                                 className="flex-1 h-14 bg-primary text-white rounded-xl font-display font-bold flex items-center justify-center gap-2 shadow-lg hover:translate-y-[-2px] transition-all"
                              >
                                 <Rocket size={18} /> {saving ? 'Deploying...' : 'Deploy Version'}
                              </button>
                           </div>
                           <p className="text-[10px] text-center text-text-muted italic px-10">
                              By deploying, this version will become the new live standard. All users will receive an update notification.
                           </p>
                        </div>

                        <div className="hidden lg:block space-y-4">
                           <h3 className="font-display font-bold text-center">Mobile Simulation</h3>
                           <div className="w-[320px] aspect-[9/16] bg-black rounded-[40px] p-2 border-[6px] border-text-primary mx-auto shadow-2xl relative overflow-hidden">
                              <iframe 
                                 srcDoc={previewCode}
                                 className="w-full h-full bg-white rounded-2xl border-none"
                              />
                           </div>
                        </div>
                     </div>
                   )}
                </div>
             </motion.div>
           </>
         )}
      </AnimatePresence>
    </div>
  );
}
