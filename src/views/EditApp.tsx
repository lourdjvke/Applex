import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Sparkles, ChevronUp, Check, X, Rocket, RefreshCcw, Bell, Trash2, Code, Copy, Eraser, Play } from 'lucide-react';
import { dbGet, dbUpdate, dbSet, dbRemove } from '../lib/firebase';
import { AppVersion, MiniApp, AppNotification, ProjectSpec } from '../types';
import { useAuth } from '../lib/AuthContext';
import { editAppCode, generateUpdateSummary } from '../lib/gemini';
import { motion, AnimatePresence } from 'motion/react';
import { cn, generateId, extractScreenComponents } from '../lib/utils';
import DatasetTab from '../components/studio/DatasetTab';
import StorageTab from '../components/studio/StorageTab';
import AuthTab from '../components/studio/AuthTab';
import HistoryTab from '../components/studio/HistoryTab';

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
  const [activeTab, setActiveTab] = useState<'details' | 'dataset' | 'storage' | 'auth' | 'history'>('details');
  const [showManualEditor, setShowManualEditor] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualEditorTab, setManualEditorTab] = useState<'code' | 'preview'>('code');
  const [showDescriptionPrompt, setShowDescriptionPrompt] = useState(false);
  const [versionDescription, setVersionDescription] = useState('');
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [pageCodes, setPageCodes] = useState<Record<string, string>>({});
  
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      if (!id) return;
      const data = await dbGet<MiniApp>(`apps/${id}`);
      if (data) {
        setApp(data);
        if (data.code.pages) {
          setPageCodes(data.code.pages);
          const firstPageId = data.projectSpec?.pages[0]?.id || Object.keys(data.code.pages)[0];
          setSelectedPageId(firstPageId);
        }
      }
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
      const sourceCode = selectedPageId ? pageCodes[selectedPageId] : app.code.html;
      const newCode = await editAppCode(sourceCode, aiPrompt);
      const summary = await generateUpdateSummary(sourceCode, newCode, aiPrompt);
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
      navigate('/studio');
    }
  };

  const handleRevert = async (version: AppVersion) => {
     if (!app || !id) return;
     if(!confirm(`Revert to v${version.version}?`)) return;
     setSaving(true);
     const updates = {
       'meta/version': version.version,
       'meta/updatedAt': Date.now(),
       'meta/updateSummary': `Reverted to v${version.version}: ${version.summary}`,
       'code/html': version.htmlCode,
       'code/sizeBytes': new Blob([version.htmlCode]).size
     };
     await dbUpdate(`apps/${id}`, updates);
     setApp({ ...app, meta: { ...app.meta, version: version.version }, code: { ...app.code, html: version.htmlCode } });
     setSaving(false);
     alert('Reverted successfully!');
   };

  const handleApplyVersion = async (codeToApply?: string, summaryToApply?: string) => {
    const finalCode = codeToApply || previewCode;
    const finalSummary = summaryToApply || updateSummary;

    if (!app || !id || !finalCode || !user) return;
    setSaving(true);
    
    let updatedHtml = '';
    let updatedPageCodes = { ...pageCodes };

    if (selectedPageId) {
      // Rebuild consolidated HTML
      updatedPageCodes[selectedPageId] = finalCode;
      
      let registrationScript = '';
      if (app.projectSpec) {
        for (const page of app.projectSpec.pages) {
          const pageSrc = updatedPageCodes[page.id];
          const { template, scripts } = extractScreenComponents(pageSrc);
          registrationScript += `
          AIPLEX.app.registerScreen('${page.id}', {
            template: \`${template.replace(/`/g, '\\`').replace(/\${/g, '\\${')}\`,
            async onInit() {
              try {
                ${scripts}
              } catch(e) { console.error('Error in ${page.id} onInit:', e); }
            }
          });`;
        }
        
        const firstPageId = app.projectSpec.pages[0].id;
        updatedHtml = `
        <div id="screen-container" class="min-h-screen"></div>
        <script>
          window.addEventListener('load', () => {
            const init = async () => {
              ${registrationScript}
              AIPLEX.app.navigate('${firstPageId}');
            };
            init();
          });
        </script>`;
      }
    } else {
      updatedHtml = finalCode;
    }

    const oldVersion = app.meta.version;
    const parts = oldVersion.split('.');
    const newVersion = `${parts[0]}.${parseInt(parts[1]) + 1}.0`;
    
    const versionEntry: AppVersion = {
      id: generateId(),
      version: newVersion,
      htmlCode: updatedHtml,
      summary: finalSummary,
      createdAt: Date.now()
    };
    await dbSet(`apps/${id}/versions/${versionEntry.id}`, versionEntry);

    const updates = {
      'meta/version': newVersion,
      'meta/updatedAt': Date.now(),
      'meta/updateSummary': finalSummary,
      'code/html': updatedHtml,
      'code/pages': updatedPageCodes,
      'code/sizeBytes': new Blob([updatedHtml]).size
    };

    await dbUpdate(`apps/${id}`, updates);

    // Update notifications if any users installed it
    if (app.stats.installedBy) {
      const uids = Object.keys(app.stats.installedBy);
      const notification: AppNotification = {
        id: generateId(),
        appId: id,
        appName: app.meta.name,
        appIcon: app.meta.iconBase64,
        title: 'New Version Available',
        message: finalSummary,
        type: 'update',
        createdAt: Date.now(),
        isRead: false
      };

      for (const uid of uids) {
        await dbSet(`users/${uid}/profile/notifications/${notification.id}`, notification);
      }
    }

    setApp({ 
      ...app, 
      meta: { ...app.meta, version: newVersion, updateSummary: finalSummary }, 
      code: { ...app.code, html: updatedHtml, pages: updatedPageCodes } 
    });
    setPageCodes(updatedPageCodes);
    setPreviewCode(null);
    setShowAiSheet(false);
    setShowManualEditor(false);
    setShowDescriptionPrompt(false);
    setVersionDescription('');
    setSaving(false);
  };

  if (loading) return <div className="p-12 text-center">Loading app data...</div>;
  if (!app) return <div className="p-12 text-center underline cursor-pointer" onClick={() => navigate('/studio')}>App not found. Back to Studio.</div>;

  const isGenerating = app.meta.status === 'generating';

  return (
    <div className={cn("pb-24 grow", isGenerating && "opacity-50 pointer-events-none")}>
      {isGenerating && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 text-center pointer-events-auto bg-bg/20 backdrop-blur-sm">
           <div className="bg-surface p-8 rounded-2xl border border-border shadow-2xl max-w-sm">
              <RefreshCcw size={32} className="mx-auto text-primary animate-spin mb-4" />
              <h3 className="font-display font-bold text-lg mb-2">Build in Progress</h3>
              <p className="text-sm text-text-muted mb-6">You cannot edit this app until the initial AI generation is complete. It usually takes less than a minute.</p>
              <button 
                onClick={() => navigate('/studio')}
                className="w-full h-12 bg-primary text-white rounded-xl font-bold"
              >
                 Return to Studio
              </button>
           </div>
        </div>
      )}
      <header className="h-16 flex items-center justify-between px-4 border-b border-border sticky top-0 bg-bg/80 backdrop-blur-md z-30 grow">
        <div className="flex items-center gap-3">
           <button onClick={() => navigate('/studio')} className="p-2 hover:bg-surface-alt rounded-full transition-colors">
              <ArrowLeft size={20} />
           </button>
           <h1 className="font-display font-bold truncate max-w-[200px]">Edit {app.meta.name}</h1>
        </div>
        <div className="flex items-center gap-2">
           {/* Header is cleaner now */}
        </div>
      </header>

      <div className="flex gap-6 px-6 border-b border-border mb-8 sticky top-16 bg-bg/95 backdrop-blur z-20 overflow-x-auto no-scrollbar">
         {[
           { id: 'details', label: 'App Details' },
           { id: 'dataset', label: 'Dataset' },
           { id: 'storage', label: 'Storage' },
           { id: 'auth', label: 'Auth Users' },
           { id: 'history', label: 'History' }
         ].map(t => (
           <button 
             key={t.id}
             onClick={() => setActiveTab(t.id as any)}
             className={cn(
               "h-14 px-4 text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap border-b-2",
               activeTab === t.id ? "text-primary border-primary" : "text-text-muted border-transparent hover:text-text-secondary"
             )}
           >
              {t.label}
           </button>
         ))}
      </div>

      <div className="max-w-5xl mx-auto p-6 grow">
        {activeTab === 'details' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 grow">
            <div className="lg:col-span-8 space-y-10 grow">
              {app.projectSpec && (
                <div className="bg-surface rounded-2xl border border-border overflow-hidden shadow-sm">
                  <div className="bg-surface-alt px-6 py-3 border-b border-border flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">App Architecture: Screens</h3>
                    <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">Multi-Page App</span>
                  </div>
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {app.projectSpec.pages.map(page => (
                      <button 
                        key={page.id}
                        onClick={() => setSelectedPageId(page.id)}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-xl border transition-all text-left group grow",
                          selectedPageId === page.id 
                            ? "bg-primary/5 border-primary shadow-sm" 
                            : "bg-bg border-border hover:border-text-muted"
                        )}
                      >
                         <div className={cn(
                           "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-all",
                           selectedPageId === page.id ? "bg-primary text-white" : "bg-surface-alt text-text-muted"
                         )}>
                            <Play size={18} fill={selectedPageId === page.id ? "currentColor" : "none"} />
                         </div>
                         <div className="min-w-0">
                            <p className="text-sm font-bold truncate">{page.name}</p>
                            <p className="text-[10px] text-text-muted truncate">{page.description}</p>
                         </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 bg-surface p-4 rounded-2xl border border-border grow">
                 <div className="flex-1">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted mb-1">
                      Editing: <span className="text-primary">{selectedPageId ? `Page "${app.projectSpec?.pages.find(p => p.id === selectedPageId)?.name}"` : 'Global App'}</span>
                    </h3>
                    <p className="text-[10px] text-text-muted">Create a new version for {selectedPageId ? 'this screen' : 'the entire app'}.</p>
                 </div>
                 <button 
                   onClick={() => setShowAiSheet(true)}
                   className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-xl text-xs font-bold hover:bg-primary/20 transition-all shrink-0"
                 >
                    <Sparkles size={14} /> AI Edit {selectedPageId ? 'Screen' : 'App'}
                 </button>
                 <button 
                   onClick={() => {
                     const code = selectedPageId ? pageCodes[selectedPageId] : app.code.html;
                     setManualCode(code || '');
                     setShowManualEditor(true);
                   }}
                   className="flex items-center gap-2 px-4 py-2 bg-surface-alt border border-border text-text-secondary rounded-xl text-xs font-bold hover:bg-surface transition-all shrink-0"
                 >
                    <Code size={14} /> Manual Edit
                 </button>
              </div>

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
                    <p className="text-[10px] font-bold uppercase text-text-muted">Status</p>
                    <button 
                      type="button"
                      onClick={() => setApp({ ...app, meta: { ...app.meta, isPublished: !app.meta.isPublished } })}
                      className={cn(
                        "text-[9px] uppercase font-bold px-2 py-0.5 rounded-full transition-all",
                        app.meta.isPublished ? "bg-installed/10 text-installed border border-installed/20" : "bg-text-muted/10 text-text-muted border border-border"
                      )}
                    >
                      {app.meta.isPublished ? 'Live' : 'Draft'}
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase text-text-muted">Version</p>
                    <span className="font-mono text-[10px] text-text-muted">v{app.meta.version}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase text-text-muted">Category</p>
                    <select 
                      value={app.meta.category}
                      onChange={(e) => setApp({ ...app, meta: { ...app.meta, category: e.target.value } })}
                      className="text-[10px] bg-surface-alt border border-border rounded px-1 py-0.5 outline-none"
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
                  className="w-full h-11 bg-primary text-white rounded-xl font-display font-bold text-xs flex items-center justify-center gap-2 hover:bg-primary-dim transition-all disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Meta Changes'}
                </button>

                <div className="pt-6">
                  <button 
                    type="button"
                    onClick={handleDelete}
                    className="w-full h-11 border border-primary/20 text-primary rounded-xl font-display font-bold text-xs flex items-center justify-center gap-2 hover:bg-primary/5 transition-all"
                  >
                    Delete App Permanently
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
        </div>
      )}

        {activeTab === 'dataset' && user && (
          <DatasetTab creatorUid={user.uid} appId={id || ''} />
        )}

        {activeTab === 'storage' && user && (
          <StorageTab creatorUid={user.uid} appId={id || ''} />
        )}

        {activeTab === 'auth' && user && (
          <AuthTab creatorUid={user.uid} appId={id || ''} />
        )}
        
        {activeTab === 'history' && (
          <HistoryTab appId={id || ''} onVersionSelect={handleRevert} />
        )}
      </div>

      <AnimatePresence>
        {showManualEditor && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed inset-0 z-[150] bg-bg flex flex-col"
          >
            <div className="h-14 flex items-center justify-between px-4 border-b border-border bg-surface shrink-0">
               <div className="flex items-center gap-3">
                  <button onClick={() => setShowManualEditor(false)} className="p-2 hover:bg-bg rounded-lg">
                     <X size={18} />
                  </button>
               </div>
               
               <div className="flex items-center gap-1">
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(manualCode);
                    }}
                    className="p-2 hover:bg-bg rounded-lg text-text-secondary"
                    title="Copy Code"
                  >
                     <Copy size={18} />
                  </button>
                  <button 
                    onClick={() => {
                      if(confirm('Clear all code?')) setManualCode('');
                    }}
                    className="p-2 hover:bg-bg rounded-lg text-text-secondary"
                    title="Clear Code"
                  >
                     <Eraser size={18} />
                  </button>
                  <div className="w-[1px] h-6 bg-border mx-1" />
                  <button 
                    onClick={() => setManualEditorTab('preview')}
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      manualEditorTab === 'preview' ? "bg-primary/10 text-primary" : "hover:bg-bg text-text-secondary"
                    )}
                    title="Preview"
                  >
                     <Play size={18} />
                  </button>
                  <button 
                    onClick={() => setManualEditorTab('code')}
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      manualEditorTab === 'code' ? "bg-primary/10 text-primary" : "hover:bg-bg text-text-secondary"
                    )}
                    title="Code"
                  >
                     <Code size={18} />
                  </button>
                  <div className="w-[1px] h-6 bg-border mx-1" />
                  <button 
                    onClick={() => setShowDescriptionPrompt(true)}
                    className="flex items-center justify-center w-10 h-10 bg-primary text-white rounded-lg shadow-lg shadow-primary/20 ml-2"
                    title="Save Version"
                  >
                     <Save size={18} />
                  </button>
               </div>
            </div>

            <div className="flex-1 min-h-0 bg-black relative flex flex-col">
               {manualEditorTab === 'code' ? (
                 <>
                   <textarea 
                     id="manual-code-textarea"
                     value={manualCode}
                     onChange={(e) => setManualCode(e.target.value)}
                     className="flex-1 w-full p-4 bg-transparent text-gray-300 font-mono text-sm resize-none outline-none focus:ring-0 leading-relaxed"
                     spellCheck={false}
                     placeholder="Write your app code here (HTML/JS)..."
                   />
                   <div className="h-12 bg-surface shrink-0 border-t border-border flex items-center px-2 gap-1 overflow-x-auto no-scrollbar">
                      {['<', '>', '/', '=', '"', '{', '}', '[', ']', '(', ')', ';'].map(char => (
                        <button 
                          key={char}
                          onClick={() => {
                            const textarea = document.getElementById('manual-code-textarea') as HTMLTextAreaElement;
                            if (!textarea) return;
                            const start = textarea.selectionStart;
                            const end = textarea.selectionEnd;
                            const text = textarea.value;
                            const before = text.substring(0, start);
                            const after = text.substring(end, text.length);
                            setManualCode(before + char + after);
                            // Set focus back and move cursor
                            setTimeout(() => {
                              textarea.focus();
                              textarea.setSelectionRange(start + 1, start + 1);
                            }, 0);
                          }}
                          className="min-w-[36px] h-9 bg-bg border border-border rounded text-sm font-mono text-primary flex items-center justify-center active:bg-primary/20"
                        >
                          {char}
                        </button>
                      ))}
                   </div>
                 </>
               ) : (
                 <iframe 
                   srcDoc={manualCode}
                   className="w-full h-full border-none bg-white"
                   title="Manual Preview"
                 />
               )}
            </div>

            <AnimatePresence>
              {showDescriptionPrompt && (
                <>
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/60 z-[160]"
                    onClick={() => setShowDescriptionPrompt(false)}
                  />
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-surface p-6 rounded-2xl shadow-2xl z-[161] border border-border"
                  >
                    <h3 className="font-display font-bold text-lg mb-2">Deploy New Version</h3>
                    <p className="text-xs text-text-muted mb-4">Briefly describe what changed in this update.</p>
                    <textarea 
                      autoFocus
                      value={versionDescription}
                      onChange={(e) => setVersionDescription(e.target.value)}
                      placeholder="e.g. Added user profiles, fixed layout bugs..."
                      className="w-full h-24 p-3 bg-bg border border-border rounded-xl text-sm outline-none focus:border-primary transition-all mb-4 resize-none"
                    />
                    <div className="flex gap-2">
                       <button 
                        onClick={() => setShowDescriptionPrompt(false)}
                        className="flex-1 h-11 border border-border rounded-xl text-sm font-bold"
                       >
                          Cancel
                       </button>
                       <button 
                         disabled={!versionDescription || saving}
                         onClick={() => handleApplyVersion(manualCode, versionDescription)}
                         className="flex-1 h-11 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-primary/20 disabled:opacity-50"
                       >
                          {saving ? 'Saving...' : 'Deploy Now'}
                       </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </motion.div>
        )}

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
                      placeholder="e.g. Add a dark mode toggle to the top right, and make the button colors more vibrant..."
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
                          onClick={() => handleApplyVersion()}
                          disabled={saving}
                          className="flex-1 h-11 bg-primary text-white rounded-xl font-display font-bold text-sm flex items-center justify-center gap-2 shadow-lg hover:translate-y-[-2px] transition-all"
                        >
                          {saving ? 'Deploying...' : 'Deploy Version'}
                        </button>
                      </div>
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
