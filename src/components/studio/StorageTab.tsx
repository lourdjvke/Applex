import React, { useState, useEffect } from 'react';
import { Upload, Trash2, File, Image as ImageIcon, Copy, RefreshCw, HardDrive } from 'lucide-react';
import { DatasetEngine } from '../../lib/dataset-engine';
import { cn } from '../../lib/utils';

export default function StorageTab({ creatorUid, appId }: { creatorUid: string; appId: string }) {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageBytes, setStorageBytes] = useState(0);
  const [engine] = useState(() => new DatasetEngine(creatorUid, appId));

  const fetchData = async () => {
    setLoading(true);
    const list = await engine.storageList();
    setFiles(list);
    
    // Total bytes calculation
    const total = list.reduce((acc, f) => acc + (f.sizeBytes || 0), 0);
    setStorageBytes(total);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [appId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      await engine.storageWrite(file.name, base64, file.type);
      fetchData();
    };
    reader.readAsDataURL(file);
  };

  const handleDelete = async (id: string) => {
    if (confirm(`Delete ${id}?`)) {
      await engine.storageDelete(id);
      fetchData();
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const storageLimit = 10 * 1024 * 1024; // 10MB soft limit
  const percent = Math.min(100, (storageBytes / storageLimit) * 100);

  return (
    <div className="space-y-6 grow">
      <div className="flex items-center justify-between mb-8 px-4 md:px-0">
        <div className="flex items-center gap-4">
           <button onClick={() => fetchData()} className="p-2 hover:bg-surface rounded-lg transition-colors">
              <RefreshCw size={18} className={cn(loading && "animate-spin")} />
           </button>
           <div>
              <h3 className="font-display font-bold text-lg">App Storage</h3>
              <div className="flex items-center gap-2 mt-1">
                 <div className="w-32 h-1 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
                 </div>
                 <span className="text-[10px] font-mono text-text-muted">{formatSize(storageBytes)} / 10MB</span>
              </div>
           </div>
        </div>
        <label className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary-dim shadow-lg transition-all cursor-pointer">
           <Upload size={16} /> Upload File
           <input type="file" className="hidden" onChange={handleUpload} />
        </label>
      </div>

      {files.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 px-4 md:px-0 grow">
           {files.map((file) => (
             <div key={file.id} className="group bg-surface rounded-2xl border border-border overflow-hidden hover:border-primary/30 transition-all flex flex-col grow">
                <div className="aspect-square bg-surface-alt flex items-center justify-center relative overflow-hidden">
                   {file.mimeType.startsWith('image/') ? (
                      <img 
                        src="" // We'd need to async load data uri per file if we want real preview, 
                               // but that's heavy. I'll just use a placeholder icon for now or lazy load.
                        alt={file.id}
                        className="w-full h-full object-cover"
                        // Placeholder trick
                        onError={(e) => {
                          (e.target as any).src = 'https://via.placeholder.com/150?text=Preview';
                        }}
                      />
                   ) : (
                      <File size={32} className="text-text-muted opacity-20" />
                   )}
                   <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button 
                        onClick={async () => {
                           const uri = await engine.storageRead(file.id);
                           if (uri) navigator.clipboard.writeText(uri);
                        }}
                        className="p-2 bg-white rounded-lg text-black hover:scale-110 transition-transform"
                      >
                         <Copy size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(file.id)}
                        className="p-2 bg-primary text-white rounded-lg hover:scale-110 transition-transform"
                      >
                         <Trash2 size={16} />
                      </button>
                   </div>
                </div>
                <div className="p-3">
                   <p className="text-xs font-bold truncate mb-1">{file.id}</p>
                   <p className="text-[10px] text-text-muted font-mono">{formatSize(file.sizeBytes)}</p>
                </div>
             </div>
           ))}
        </div>
      ) : (
        <div className="py-20 text-center space-y-4 grow">
           <HardDrive size={48} className="mx-auto text-text-muted opacity-20" />
           <div>
              <p className="font-bold text-lg">No files stored</p>
              <p className="text-sm text-text-muted">Upload assets or let your app store user-provided files.</p>
           </div>
        </div>
      )}
    </div>
  );
}
