import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wand2, Type, Video, ImageIcon, Sparkles, Check, ChevronRight, Rocket, RefreshCcw, FileVideo, FileCode, X } from 'lucide-react';
import { MiniApp, AppNotification, ProjectSpec, GenerationTask, AppVersion } from '../types';
import { analyzeMultiImages, generateMiniApp, generateAppIcon, analyzeCodeForMetadata } from '../lib/gemini';
import { dbPush, dbSet, dbUpdate, dbGet } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { fileToBase64, generateId } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

type Step = 'describe' | 'spec' | 'generate' | 'publish';

export default function CreateApp() {
  const [step, setStep] = useState<Step>('describe');
  const [method, setMethod] = useState<'text' | 'media' | 'manual'>('text');
  const [prompt, setPrompt] = useState('');
  const [context, setContext] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [isMultiPage, setIsMultiPage] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<{data: string, mimeType: string}[]>([]);
  const [projectSpec, setProjectSpec] = useState<ProjectSpec | null>(null);
  const [currentGenerationPageIndex, setCurrentGenerationPageIndex] = useState(0);
  const [currentTask, setCurrentTask] = useState<GenerationTask | null>(null);
  
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
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setAnalyzing(true);
    try {
      const images = await Promise.all(files.map(async (f: File) => ({
        data: await fileToBase64(f),
        mimeType: f.type
      })));
      
      const newImages = [...uploadedImages, ...images].slice(0, 5);
      setUploadedImages(newImages);
      
      if (isMultiPage) {
        // Multi-page flow: Analyze all images to get a project spec
        // We use the 'context' field for additional instructions if provided
        const spec = await analyzeMultiImages(newImages, context || prompt);
        if (spec) {
          setProjectSpec(spec);
          setAppName(spec.appName);
          setAppDescription(spec.appDescription);
          setStep('spec');
        }
      } else {
        // Single-page flow
        setPrompt(context || prompt || "Generate an app based on these images.");
        setMethod('text');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleGenerate = async () => {
    if ((method !== 'manual' && !prompt && !projectSpec) || !user) return;
    
    const appId = generateId();
    const taskId = generateId();
    
    setGenerating(true);
    setStep('generate');

    const draftData: MiniApp = {
      id: appId,
      meta: {
        name: appName || (projectSpec?.appName) || "AI Draft App",
        tagline: "Generating...",
        description: appDescription || (projectSpec?.appDescription) || prompt || "Manual build",
        category: appCategory,
        tags: isMultiPage ? ['multi-page'] : ['single-page'],
        creatorUid: user.uid,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: '0.1.0',
        iconBase64: appIcon || 'https://cdn-icons-png.flaticon.com/512/2101/2101655.png',
        screenshotsBase64: uploadedImages.map(img => img.data),
        isPublished: false,
        isOfflineReady: false,
        status: 'generating',
      },
      stats: { installs: 0, views: 0, avgRating: 0, reviewCount: 0, installedBy: {} },
      code: { html: method === 'manual' ? appCode : '', sizeBytes: method === 'manual' ? new Blob([appCode]).size : 0 },
    };

    await dbSet(`apps/${appId}`, draftData);

    if (method !== 'manual') {
      (async () => {
        try {
          let finalCode = '';
          if (isMultiPage && projectSpec) {
            // Multi-page progressive generation
            let combinedCode = '';
            for (let i = 0; i < projectSpec.pages.length; i++) {
              setCurrentGenerationPageIndex(i);
              const page = projectSpec.pages[i];
              const pagePrompt = `APP VISION:\n${projectSpec.appDescription}\n\nPAGE SPECIFIC PROMPT:\n${page.prompt}\n\nTECHNICAL SPEC:\nColors: ${JSON.stringify(projectSpec.techSpecs.colors)}\nFonts: ${projectSpec.techSpecs.fonts}`;
              
              // Find the specific reference image for this page if it exists
              const pageImages = page.referenceImageIndex !== null && uploadedImages[page.referenceImageIndex] 
                ? [uploadedImages[page.referenceImageIndex]] 
                : uploadedImages;

              const pageCode = await generateMiniApp(pagePrompt, JSON.stringify(projectSpec), pageImages);
              // Integration logic: Wrap in a semantic tag for AppShell
              combinedCode += `<div id="screen-${page.id}" data-aiplex-screen="${page.id}">\n${pageCode}\n</div>\n`;
            }
            finalCode = combinedCode;
          } else {
            // Single page
            finalCode = await generateMiniApp(prompt, context, uploadedImages);
          }

          const generatedSvgPath = await generateAppIcon(draftData.meta.name, draftData.meta.description);
          const finalIcon = `data:image/svg+xml;base64,${btoa(generatedSvgPath)}`;

          await dbUpdate(`apps/${appId}`, {
            'meta/status': 'ready',
            'meta/iconBase64': finalIcon,
            'code/html': finalCode,
            'code/sizeBytes': new Blob([finalCode]).size,
            'meta/updatedAt': Date.now()
          });
        } catch (err) {
          console.error(err);
          await dbUpdate(`apps/${appId}`, { 'meta/status': 'error' });
        }
      })();
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
    <div className="max-w-4xl mx-auto px-4 pb-20 pt-10 min-h-full">
      {/* Header */}
      <div className="text-center py-16">
        <h1 className="font-display font-extrabold text-4xl mb-4 tracking-tight">Create Your App</h1>
        <p className="text-text-muted text-lg max-w-xl mx-auto">Gemini will architect and code your functional mini-app from scratch.</p>
      </div>

      {/* Steps */}
      <div className="flex items-center justify-center gap-6 mb-20 relative cursor-default">
         <div className="absolute top-1/2 left-0 w-full h-px bg-border/50 -z-10 -translate-y-1/2"></div>
         {[
           { id: 'describe', label: 'Describe', icon: Type },
           { id: 'spec', label: 'Spec', icon: Sparkles },
           { id: 'generate', label: 'Generate', icon: Wand2 },
           { id: 'publish', label: 'Publish', icon: Rocket }
         ].map((s, idx) => (
            <div 
              key={s.id} 
              className={cn(
                "flex flex-col items-center gap-3 px-8 bg-bg transition-all",
                step === s.id ? "text-primary opacity-100" : "text-text-muted opacity-60"
              )}
            >
               <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center border-2 transition-all shadow-sm",
                  step === s.id ? "border-primary bg-primary/10 scale-110 shadow-primary/10" : "border-border bg-surface"
               )}>
                  <s.icon size={20} />
               </div>
               <span className="text-[10px] font-bold uppercase tracking-[0.2em]">{s.label}</span>
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
             <div className="flex items-center justify-between gap-4 mb-4">
               <h2 className="font-display font-bold text-lg">App Type</h2>
               <div className="flex bg-surface rounded-full p-1 border border-border">
                  <button 
                    onClick={() => setIsMultiPage(false)}
                    className={cn("px-4 py-1.5 rounded-full text-xs font-bold transition-all", !isMultiPage ? "bg-primary text-white" : "text-text-muted")}
                  >
                    Single Page
                  </button>
                  <button 
                    onClick={() => setIsMultiPage(true)}
                    className={cn("px-4 py-1.5 rounded-full text-xs font-bold transition-all", isMultiPage ? "bg-primary text-white" : "text-text-muted")}
                  >
                    Multi Page
                  </button>
               </div>
             </div>

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
                 <ImageIcon size={18} /> Images
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
              <div className="space-y-6 grow">
                <div className="space-y-4">
                  <label className="text-xs font-bold uppercase text-text-muted tracking-widest">Additional Instructions (Optional)</label>
                  <textarea 
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="e.g. Do not make it mockup but use aiplex dataset, auth and storage and add custom authentication screen..."
                    className="w-full h-32 bg-surface border border-border rounded-xl p-4 text-sm outline-none focus:border-primary transition-all resize-none"
                  />
                </div>

                <div className="bg-surface-alt border-2 border-dashed border-border rounded-2xl p-8 text-center">
                  {analyzing ? (
                    <div className="space-y-4">
                      <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
                      <p className="font-display font-bold">Analyzing {isMultiPage ? 'Screens' : 'Media'}...</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="w-16 h-16 bg-white border border-border rounded-2xl flex items-center justify-center mx-auto text-text-muted mb-4">
                         <ImageIcon size={32} />
                      </div>
                      <h3 className="font-display font-bold text-lg">Upload {isMultiPage ? '1-5 Screens' : 'Example Image'}</h3>
                      <p className="text-sm text-text-muted max-w-xs mx-auto">
                        {isMultiPage ? 'Upload screenshots of each page you want to build.' : 'Upload a mockup image and AI will recreate it.'}
                      </p>
                      <label className="block pt-4">
                         <span className="bg-primary text-white px-6 py-3 rounded-xl font-display font-bold text-sm cursor-pointer hover:bg-primary-dim transition-all inline-block">Choose Images</span>
                         <input type="file" className="hidden" accept="image/*" multiple={isMultiPage} onChange={handleMediaUpload} />
                      </label>
                    </div>
                  )}
                </div>

                {uploadedImages.length > 0 && (
                  <div className="flex gap-4 overflow-x-auto pb-4 pt-2">
                    {uploadedImages.map((img, idx) => (
                      <div key={idx} className="relative w-24 h-40 rounded-lg overflow-hidden border border-border shrink-0 group shadow-md hover:shadow-lg transition-all">
                        <img src={img.data} className="w-full h-full object-cover" />
                        <button 
                          onClick={() => setUploadedImages(prev => prev.filter((_, i) => i !== idx))}
                          className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 shadow-md transition-opacity"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
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

        {step === 'spec' && projectSpec && (
          <motion.div 
            key="spec"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8 grow"
          >
            <div className="bg-surface border border-border rounded-3xl p-8 space-y-6 shadow-xl">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                  <Rocket size={24} />
                </div>
                <div>
                  <h2 className="font-display font-bold text-xl">Confirm Project Architecture</h2>
                  <p className="text-xs text-text-muted">Review the multi-page plan before starting generation.</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Global App Vision</label>
                <textarea 
                  value={projectSpec.appDescription}
                  onChange={(e) => setProjectSpec({ ...projectSpec, appDescription: e.target.value })}
                  className="w-full h-32 bg-surface-alt rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 ring-primary resize-none"
                />
              </div>

              <div className="space-y-4">
                <label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Planned Pages ({projectSpec.pages.length})</label>
                <div className="space-y-3">
                  {projectSpec.pages.map((page, idx) => (
                    <div key={page.id} className="bg-surface-alt border border-border rounded-2xl p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center">{idx + 1}</span>
                          <span className="font-bold text-sm">{page.name}</span>
                        </div>
                        {page.referenceImageIndex !== null && (
                          <div className="w-8 h-12 rounded border border-border overflow-hidden">
                            <img src={uploadedImages[page.referenceImageIndex].data} className="w-full h-full object-cover" />
                          </div>
                        )}
                      </div>
                      <textarea 
                        value={page.prompt}
                        onChange={(e) => {
                          const newPages = [...projectSpec.pages];
                          newPages[idx].prompt = e.target.value;
                          setProjectSpec({ ...projectSpec, pages: newPages });
                        }}
                        className="w-full h-24 bg-surface rounded-xl p-3 text-xs focus:outline-none focus:ring-1 ring-primary resize-none"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <button 
                onClick={handleGenerate}
                className="w-full h-16 bg-primary text-white rounded-2xl font-display font-bold text-lg flex items-center justify-center gap-3 shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
              >
                Proceed to Generation <ChevronRight size={20} />
              </button>
            </div>
          </motion.div>
        )}

        {step === 'generate' && (
          <motion.div 
            key="generate"
             initial={{ opacity: 0, scale: 0.95 }}
             animate={{ opacity: 1, scale: 1 }}
             className="flex flex-col items-center justify-center p-12 text-center grow"
          >
             <div className="relative w-32 h-32 mb-8">
                <div className="absolute inset-0 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                <div className="absolute inset-4 bg-primary/5 rounded-full flex items-center justify-center text-primary">
                   <Sparkles size={32} className="animate-pulse" />
                </div>
             </div>
             <h2 className="font-display font-bold text-2xl mb-2">Generating your app...</h2>
             <p className="text-text-muted max-w-sm mx-auto text-sm">
                {isMultiPage ? 'Gemini is constructing each screen from the architecture plan.' : 'Gemini is coding your interface and logic.'}
             </p>
             
             {isMultiPage && projectSpec && (
               <div className="mt-8 w-full max-w-md space-y-3">
                 {projectSpec.pages.map((p, idx) => (
                   <div key={p.id} className="flex items-center gap-3 bg-surface p-3 rounded-xl border border-border">
                      <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all", 
                         idx < currentGenerationPageIndex ? "bg-green-500 text-white" : 
                         idx === currentGenerationPageIndex ? "bg-primary text-white animate-pulse" : 
                         "bg-surface-alt text-text-muted")}>
                        {idx < currentGenerationPageIndex ? <Check size={12} /> : idx + 1}
                      </div>
                      <span className="text-sm font-semibold">{p.name}</span>
                      {idx === currentGenerationPageIndex && <span className="ml-auto text-[10px] text-primary font-bold uppercase tracking-widest animate-pulse">Building</span>}
                   </div>
                 ))}
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
