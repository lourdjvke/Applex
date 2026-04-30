import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wand2, Type, Video, ImageIcon, Sparkles, Check, ChevronRight, Rocket, RefreshCcw, FileVideo, FileCode } from 'lucide-react';
import { generateMiniApp, analyzeVideoOrImage, analyzeNativeVideo, generateAppIcon, analyzeCodeForMetadata } from '../lib/gemini';
import { dbPush, dbSet, dbUpdate } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { fileToBase64, generateId } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

type Step = 'describe' | 'generate' | 'publish';

export default function CreateApp() {
  const [step, setStep] = useState<Step>('describe');
  const [method, setMethod] = useState<'text' | 'media' | 'manual'>('text');
  const [prompt, setPrompt] = useState('');
  const [context, setContext] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  
  // Generated data
  const [appName, setAppName] = useState('');
  const [appTagline, setAppTagline] = useState('');
  const [appDescription, setAppDescription] = useState('');
  const [appCode, setAppCode] = useState('');
  const [appIcon, setAppIcon] = useState('');
  const [appCategory, setAppCategory] = useState('Utility');

  const { user } = useAuth();
  const navigate = useNavigate();

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAnalyzing(true);
    try {
      let analysis;
      if (file.type.startsWith('video/')) {
        analysis = await analyzeNativeVideo(file);
      } else {
        const base64 = await fileToBase64(file);
        analysis = await analyzeVideoOrImage(base64, file.type);
      }

      if (analysis) {
        setAppName(analysis.suggestedName);
        setAppDescription(analysis.description);
        setPrompt(analysis.description);
        setContext(analysis.detailedAnalysis || analysis.description);
      }
      setMethod('text'); // Switch to text to show results
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleGenerate = async () => {
    if ((method !== 'manual' && !prompt) || !user) return;
    if (method === 'manual' && (!appCode || !appName)) {
        alert('Please provide code and a name');
        return;
    }
    setGenerating(true);
    setStep('generate');

    const draftId = generateId();
    const draftData = {
      id: draftId,
      meta: {
        name: appName || "AI Draft App",
        tagline: appTagline || "Generating...",
        description: prompt || appDescription || "Manual build",
        category: appCategory,
        tags: ['draft'],
        creatorUid: user.uid,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: '0.1.0',
        iconBase64: appIcon || 'https://cdn-icons-png.flaticon.com/512/2103/2103633.png',
        screenshotsBase64: [],
        isPublished: false,
        isOfflineReady: false,
        status: 'generating',
      },
      stats: { installs: 0, views: 0, avgRating: 0, reviewCount: 0, installedBy: {} },
      code: { html: method === 'manual' ? appCode : '', sizeBytes: method === 'manual' ? new Blob([appCode]).size : 0 },
    };

    // Save draft immediately
    await dbSet(`apps/${draftId}`, draftData);

    // Fire and forget background generation IF NEEDED
    if (method !== 'manual') {
      (async () => {
        let retries = 2;
        while (retries > 0) {
          try {
            const code = await generateMiniApp(prompt, context);
            const generatedSvgPath = await generateAppIcon(appName || 'My App', prompt);
            const finalIcon = `data:image/svg+xml;base64,${btoa(generatedSvgPath)}`;
            
            const finalName = appName || "AI Generated App";
            const finalTagline = "Ready to use";
            const finalDesc = "This app was generated based on your description using Gemini.";

            await dbUpdate(`apps/${draftId}`, {
              'meta/name': finalName,
              'meta/tagline': finalTagline,
              'meta/description': finalDesc,
              'meta/iconBase64': finalIcon,
              'meta/status': 'ready',
              'code/html': code,
              'code/sizeBytes': new Blob([code]).size,
              'meta/updatedAt': Date.now()
            });
            break; // Success
          } catch (err: any) {
            retries--;
            if (retries === 0) {
              console.error('Background generation failed', err);
              await dbUpdate(`apps/${draftId}`, {
                'meta/tagline': err?.message?.includes('xhr') ? 'Network timeout. Try editing code.' : 'Generation failed.',
                'meta/status': 'error'
              });
            } else {
              console.log('Generation failed, retrying...', err);
              await new Promise(r => setTimeout(r, 2000));
            }
          }
        }
      })();
    } else {
       // if manual, it's ready immediately
       await dbUpdate(`apps/${draftId}`, { 'meta/status': 'ready' });
       // if manual and no icon, can generate an icon optionally or just leave default
       if (!appIcon) {
          (async () => {
             try {
                const generatedSvgPath = await generateAppIcon(appName, prompt || appDescription || 'A mini app');
                const finalIcon = `data:image/svg+xml;base64,${btoa(generatedSvgPath)}`;
                await dbUpdate(`apps/${draftId}`, { 'meta/iconBase64': finalIcon });
             } catch (err) { }
          })();
       }
    }

    navigate('/studio');
  };

  const handlePublish = async () => {
    // Logic to set isPublished: true
    if (!user) return;
    // In this draft flow, we'd normally know the draftId, 
    // but for simplicity here I'll just save it as is.
    // Ideally we track the created draftId in state.
    navigate(`/studio`);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 pb-20 grow">
      {/* Header */}
      <div className="text-center py-12">
        <h1 className="font-display font-extrabold text-3xl mb-2">Create New App</h1>
        <p className="text-text-muted">Turn your idea into a functional mini-app in seconds.</p>
      </div>

      {/* Steps */}
      <div className="flex items-center justify-center gap-4 mb-12 relative cursor-default">
         <div className="absolute top-1/2 left-0 w-full h-px bg-border -z-10 -translate-y-1/2"></div>
         {[
           { id: 'describe', label: 'Describe', icon: Type },
           { id: 'generate', label: 'Generate', icon: Wand2 },
           { id: 'publish', label: 'Publish', icon: Rocket }
         ].map((s, idx) => (
            <div 
              key={s.id} 
              className={cn(
                "flex flex-col items-center gap-2 px-6 bg-bg transition-all",
                step === s.id ? "text-primary" : "text-text-muted"
              )}
            >
               <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                  step === s.id ? "border-primary bg-primary/10" : "border-border bg-surface"
               )}>
                  <s.icon size={18} />
               </div>
               <span className="text-[10px] font-bold uppercase tracking-widest">{s.label}</span>
            </div>
         ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 'describe' && (
          <motion.div 
            key="describe"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8 grow"
          >
            <div className="bg-surface rounded-2xl border border-border p-1 flex gap-1 shadow-sm">
               <button 
                 onClick={() => setMethod('text')}
                 className={cn("flex-1 py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold transition-all", method === 'text' ? "bg-primary text-white shadow-md shadow-primary/20" : "text-text-secondary hover:bg-surface-alt")}
               >
                 <Type size={18} /> Text Prompt
               </button>
               <button 
                 onClick={() => setMethod('media')}
                 className={cn("flex-1 py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold transition-all", method === 'media' ? "bg-primary text-white shadow-md shadow-primary/20" : "text-text-secondary hover:bg-surface-alt")}
               >
                 <Video size={18} /> Video / Image
               </button>
               <button 
                 onClick={() => setMethod('manual')}
                 className={cn("flex-1 py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold transition-all", method === 'manual' ? "bg-primary text-white shadow-md shadow-primary/20" : "text-text-secondary hover:bg-surface-alt")}
               >
                 <FileCode size={18} /> Manual Code
               </button>
            </div>

            {method === 'manual' ? (
              <div className="space-y-6">
                 <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-text-muted tracking-widest">Icon (Optional)</label>
                    <div className="flex items-center gap-4">
                       <img src={appIcon || 'https://cdn-icons-png.flaticon.com/512/2103/2103633.png'} className="w-16 h-16 rounded-xl border border-border" />
                       <label className="bg-surface-alt px-4 py-2 rounded-lg text-sm font-bold cursor-pointer hover:bg-border transition-all">
                          Upload Icon
                          <input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                             const file = e.target.files?.[0];
                             if (file) {
                                const base64 = await fileToBase64(file);
                                setAppIcon(base64);
                             }
                          }} />
                       </label>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label className="text-xs font-bold uppercase text-text-muted tracking-widest">App Name</label>
                       <input 
                         type="text" 
                         value={appName}
                         onChange={(e) => setAppName(e.target.value)}
                         className="w-full h-12 px-4 bg-surface border border-border rounded-xl outline-none focus:border-primary transition-all text-sm"
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-xs font-bold uppercase text-text-muted tracking-widest">Category</label>
                       <select 
                         value={appCategory}
                         onChange={(e) => setAppCategory(e.target.value)}
                         className="w-full h-12 px-4 bg-surface border border-border rounded-xl outline-none focus:border-primary transition-all text-sm"
                       >
                         <option>Utility</option>
                         <option>Game</option>
                         <option>Productivity</option>
                         <option>Education</option>
                       </select>
                    </div>
                 </div>

                 <div className="space-y-2">
                    <div className="flex justify-between items-end">
                       <label className="text-xs font-bold uppercase text-text-muted tracking-widest">App Code</label>
                       <button 
                         onClick={async () => {
                           if (!appCode) return;
                           setAnalyzing(true);
                           const meta = await analyzeCodeForMetadata(appCode);
                           if (meta) {
                              if (meta.name) setAppName(meta.name);
                              if (meta.description) { setAppDescription(meta.description); setPrompt(meta.description); }
                              if (meta.category) setAppCategory(meta.category);
                              if (meta.tagline) setAppTagline(meta.tagline);
                           }
                           setAnalyzing(false);
                         }}
                         disabled={analyzing || !appCode}
                         className="flex items-center gap-1 text-xs text-primary font-bold hover:text-primary-dim disabled:opacity-50"
                       >
                          <Sparkles size={14} /> Auto-fill info using AI
                       </button>
                    </div>
                    <textarea 
                       value={appCode}
                       onChange={(e) => setAppCode(e.target.value)}
                       placeholder="<!DOCTYPE html>..."
                       className="w-full h-64 bg-slate-900 text-green-400 font-mono text-xs p-4 rounded-xl outline-none focus:ring-2 ring-primary resize-y"
                    />
                 </div>
              </div>
            ) : method === 'text' ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted tracking-widest">Describe your idea</label>
                  <textarea 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="w-full h-40 bg-surface border border-border rounded-xl p-6 outline-none focus:border-primary transition-all text-lg font-sans placeholder:text-text-muted/50"
                    placeholder="e.g. A simple expense tracker where I can add items with price and category, and see a total summary..."
                  />
                  <div className="flex flex-wrap gap-2 pt-2">
                     {['Quiz Game', 'Flashcards', 'Habit Tracker', 'Currency Converter'].map(chip => (
                       <button key={chip} onClick={() => setPrompt(`A ${chip.toLowerCase()} app...`)} className="px-3 py-1 bg-surface-alt border border-border rounded-full text-xs font-medium hover:border-text-secondary transition-colors grow">
                         {chip}
                       </button>
                     ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-text-muted tracking-widest">App Name</label>
                    <input 
                      type="text" 
                      value={appName}
                      onChange={(e) => setAppName(e.target.value)}
                      className="w-full h-12 px-4 bg-surface border border-border rounded-xl outline-none focus:border-primary transition-all text-sm grow"
                      placeholder="Give it a name (optional)"
                    />
                  </div>
                   <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-text-muted tracking-widest">Category</label>
                    <select 
                      value={appCategory}
                      onChange={(e) => setAppCategory(e.target.value)}
                      className="w-full h-12 px-4 bg-surface border border-border rounded-xl outline-none focus:border-primary transition-all text-sm grow"
                    >
                      <option>Utility</option>
                      <option>Game</option>
                      <option>Productivity</option>
                      <option>Education</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-surface-alt border-2 border-dashed border-border rounded-2xl p-12 text-center grow">
                {analyzing ? (
                  <div className="space-y-4">
                    <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
                    <p className="font-display font-bold">Analyzing media...</p>
                    <p className="text-xs text-text-muted">Gemini is extracting UI patterns and features.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="w-16 h-16 bg-white border border-border rounded-2xl flex items-center justify-center mx-auto text-text-muted mb-4">
                       <Video size={32} />
                    </div>
                    <h3 className="font-display font-bold text-lg">Upload Example Clip</h3>
                    <p className="text-sm text-text-muted max-w-xs mx-auto">Show AI what you want to build by uploading another app's recording or mockup.</p>
                    <label className="block pt-4">
                       <span className="bg-primary text-white px-6 py-3 rounded-xl font-display font-bold text-sm cursor-pointer hover:bg-primary-dim transition-all inline-block">Choose File</span>
                       <input type="file" className="hidden" accept="video/*,image/*" onChange={handleMediaUpload} />
                    </label>
                  </div>
                )}
              </div>
            )}

            <button 
              onClick={handleGenerate}
              disabled={(!prompt && method !== 'manual') || (method === 'manual' && (!appCode || !appName)) || analyzing}
              className="w-full h-16 bg-primary text-white rounded-2xl font-display font-bold text-lg flex items-center justify-center gap-3 shadow-xl shadow-primary/20 hover:translate-y-[-2px] active:scale-95 transition-all disabled:opacity-50"
            >
              {method === 'manual' ? 'Save App' : 'Generate App'} <ChevronRight size={20} />
            </button>
          </motion.div>
        )}

        {step === 'generate' && (
          <motion.div 
            key="generate"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-10 grow"
          >
            {generating ? (
              <div className="text-center py-20 space-y-12 shrink-0">
                <div className="relative w-32 h-32 mx-auto">
                   <motion.div 
                     animate={{ rotate: 360 }}
                     transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                     className="absolute inset-0 border-4 border-primary/10 border-t-primary rounded-full"
                   />
                   <div className="absolute inset-4 bg-primary/5 rounded-full flex items-center justify-center text-primary">
                      <Sparkles size={40} className="animate-pulse" />
                   </div>
                </div>
                <div className="space-y-2">
                   <h3 className="font-display font-bold text-2xl">Building your mini-app...</h3>
                   <p className="text-text-muted">Gemini is writing the code and designing the assets.</p>
                </div>
                <div className="max-w-xs mx-auto space-y-3">
                   {['Understanding layout...', 'Generating logic...', 'Styling components...', 'Finalizing build...'].map((t, i) => (
                      <div key={i} className="flex items-center gap-3 text-xs font-mono text-text-muted">
                         <div className="w-1.5 h-1.5 rounded-full bg-primary/30"></div>
                         <span>{t}</span>
                      </div>
                   ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 grow">
                 <div className="space-y-6">
                    <div className="bg-surface rounded-2xl border border-border p-8 grow">
                       <h3 className="font-display font-bold text-xl mb-6 flex items-center gap-2">
                          <Sparkles size={20} className="text-primary" /> Visual Identity
                       </h3>
                       <div className="flex items-center gap-6 mb-8 grow">
                          <img src={appIcon} className="w-20 h-20 rounded-2xl shadow-lg border border-border shrink-0" alt="Generated Icon" />
                          <div className="space-y-2 flex-grow min-w-0">
                             <input 
                               value={appName}
                               onChange={(e) => setAppName(e.target.value)}
                               className="w-full font-display font-bold text-xl outline-none focus:border-b border-primary truncate bg-transparent"
                             />
                             <input 
                               value={appTagline}
                               onChange={(e) => setAppTagline(e.target.value)}
                               className="w-full text-xs text-text-muted outline-none focus:border-b border-primary truncate bg-transparent"
                             />
                          </div>
                       </div>
                       
                       <div className="space-y-2">
                          <label className="text-[10px] uppercase font-bold text-text-muted">Description</label>
                          <textarea 
                             value={appDescription}
                             onChange={(e) => setAppDescription(e.target.value)}
                             className="w-full h-32 bg-surface-alt rounded-lg p-3 text-sm focus:outline-none focus:ring-1 ring-primary"
                          />
                       </div>
                    </div>
                    
                    <button 
                      onClick={() => setStep('publish')}
                      className="w-full h-14 bg-primary text-white rounded-xl font-display font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-all"
                    >
                       Continue to Publish <Check size={20} />
                    </button>
                    <button 
                      onClick={handleGenerate}
                      className="w-full h-14 bg-surface border border-border text-text-secondary rounded-xl font-display font-bold flex items-center justify-center gap-2 hover:bg-surface-alt transition-all"
                    >
                       <RefreshCcw size={18} /> Re-generate
                    </button>
                 </div>

                 <div className="space-y-4">
                    <div className="flex items-center justify-between">
                       <h3 className="font-display font-bold">App Preview</h3>
                       <span className="text-[10px] font-mono text-text-muted italic">Running in simulator</span>
                    </div>
                    <div className="aspect-[9/16] bg-black rounded-[40px] p-4 border-[8px] border-text-primary shadow-2xl relative grow overflow-hidden">
                       <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-text-primary rounded-b-2xl z-10"></div>
                       <iframe 
                         title="Preview"
                         srcDoc={appCode}
                         className="w-full h-full bg-white rounded-2xl border-none"
                       />
                    </div>
                 </div>
              </div>
            )}
          </motion.div>
        )}

        {step === 'publish' && (
           <motion.div 
             key="publish"
             initial={{ opacity: 0, scale: 0.95 }}
             animate={{ opacity: 1, scale: 1 }}
             className="max-w-lg mx-auto space-y-10 grow"
           >
              <div className="bg-surface rounded-3xl border border-border overflow-hidden shadow-2xl grow">
                 <div className="bg-primary/5 p-12 text-center grow">
                    <img src={appIcon} className="w-24 h-24 rounded-3xl mx-auto shadow-2xl border border-white mb-6 grow" alt="Icon" />
                    <h2 className="font-display font-extrabold text-2xl mb-2">{appName}</h2>
                    <p className="text-sm text-text-muted font-medium">{appTagline}</p>
                 </div>
                 <div className="p-8 space-y-6">
                    <div className="flex items-center justify-between pb-6 border-b border-border">
                       <div>
                          <p className="text-sm font-bold">Public Listing</p>
                          <p className="text-xs text-text-muted">Visible to all AIPLEX users</p>
                       </div>
                       <div className="w-12 h-6 bg-primary rounded-full relative">
                          <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                       </div>
                    </div>
                    <div className="flex items-center justify-between pb-6 border-b border-border">
                       <div>
                          <p className="text-sm font-bold">Offline Setup</p>
                          <p className="text-xs text-text-muted">Automatic caching enabled</p>
                       </div>
                       <Check className="text-installed" size={20} />
                    </div>
                    
                    <button 
                      onClick={handlePublish}
                      className="w-full h-16 bg-primary text-white rounded-2xl font-display font-bold text-lg shadow-xl shadow-primary/20 hover:translate-y-[-2px] active:scale-95 transition-all"
                    >
                       Publish App Now
                    </button>
                    <button 
                      onClick={() => setStep('generate')}
                      className="w-full text-text-muted text-sm font-medium hover:text-text-secondary"
                    >
                       Wait, I want to edit more
                    </button>
                 </div>
              </div>
           </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
