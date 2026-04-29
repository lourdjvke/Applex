import { useState, useEffect } from 'react';
import { Database, FolderPlus, Plus, RefreshCw, Trash2, Pencil, ChevronRight, ChevronDown, Check, X, Copy, TextQuote, Hash, ToggleLeft, Braces, File } from 'lucide-react';
import { DatasetEngine } from '../../lib/dataset-engine';
import { DatasetNode } from '../../types';
import { cn } from '../../lib/utils';

export default function DatasetTab({ creatorUid, appId }: { creatorUid: string; appId: string }) {
  const [data, setData] = useState<DatasetNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [engine] = useState(() => new DatasetEngine(creatorUid, appId));

  const fetchData = async () => {
    setLoading(true);
    const tree = await engine.getAll();
    setData(tree);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [appId]);

  const toggleFolder = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleWrite = async (path: string, val: any) => {
    await engine.write(path, val);
    await fetchData();
    setEditingNode(null);
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Delete ${name} and all its children?`)) {
      // For simplicity in UI, we'd need path, but we can search or use id directly if we adapt engine
      // The current engine delete uses path. I'll need a way to get path from node or adapt engine.
      // I'll add a helper to get path from node tree.
    }
  };

  const renderNode = (node: DatasetNode, level: number = 0, path: string = '') => {
    const isFolder = node.__type === 'folder';
    const isField = node.__type === 'field';
    const currentPath = path ? `${path}.${node.__name}` : node.__name;
    const isExpanded = expanded[node.id];
    const isEditing = editingNode === node.id;

    return (
      <div key={node.id} className="flex flex-col grow">
        <div 
          className={cn(
            "group flex items-center h-14 border-b border-border/50 hover:bg-surface-alt transition-colors px-4",
            level > 0 && "ml-5 border-l border-border/30"
          )}
          style={{ paddingLeft: `${Math.max(16, level * 20)}px` }}
        >
          {/* Toggle / Icon */}
          <div className="flex items-center gap-2 min-w-[200px]">
            {isFolder ? (
              <button onClick={() => toggleFolder(node.id)} className="p-1 hover:bg-black/5 rounded">
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <div className="w-6" />
            )}
            
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              isFolder ? "bg-accent-2/10 text-accent-2" : "bg-primary/10 text-primary"
            )}>
              {isFolder ? <FolderPlus size={16} /> : 
               node.valueType === 'number' ? <Hash size={16} /> :
               node.valueType === 'boolean' ? <ToggleLeft size={16} /> :
               node.valueType === 'json' ? <Braces size={16} /> :
               <TextQuote size={16} />}
            </div>

            <span className="text-sm font-semibold truncate">{node.__name}</span>
          </div>

          {/* Type Badge */}
          <div className="hidden md:block w-32 px-4">
             <span className="text-[10px] uppercase font-bold text-text-muted bg-surface py-0.5 px-2 rounded border border-border">
                {node.__type === 'folder' ? 'folder' : node.valueType}
             </span>
          </div>

          {/* Value / Preview */}
          <div className="flex-1 px-4 truncate">
            {isFolder ? (
              <span className="text-xs text-text-muted">{(node.children || []).length} items</span>
            ) : isEditing ? (
              <div className="flex items-center gap-2">
                <input 
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="bg-bg border border-primary rounded px-2 py-1 text-sm font-mono w-full outline-none grow"
                />
                <button onClick={() => handleWrite(currentPath, editValue)} className="p-1 text-installed"><Check size={16} /></button>
                <button onClick={() => setEditingNode(null)} className="p-1 text-primary"><X size={16} /></button>
              </div>
            ) : (
              <span className="text-xs font-mono text-text-secondary truncate block">
                {node.valueType === 'json' ? 'JSON object' : String(node.value)}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
             <button 
                onClick={() => {
                  navigator.clipboard.writeText(currentPath);
                }} 
                className="p-2 hover:bg-white rounded-lg transition-colors text-text-muted"
                title="Copy path"
             >
                <Copy size={14} />
             </button>
             {isFolder && (
               <button 
                 onClick={() => {
                   const sub = prompt(`New path relative to ${currentPath}:`);
                   if(sub) handleWrite(`${currentPath}.${sub}`, 'new value');
                 }} 
                 className="p-2 hover:bg-white rounded-lg transition-colors text-text-muted"
                 title="Add Sub-item"
               >
                  <Plus size={14} />
               </button>
             )}
             {isField && (
               <button 
                 onClick={() => {
                   setEditingNode(node.id);
                   setEditValue(String(node.value));
                 }} 
                 className="p-2 hover:bg-white rounded-lg transition-colors text-text-muted"
               >
                  <Pencil size={14} />
               </button>
             )}
             <button 
                onClick={async () => {
                  if (confirm(`Delete ${currentPath}?`)) {
                    await engine.delete(currentPath);
                    fetchData();
                  }
                }}
                className="p-2 hover:bg-primary/10 rounded-lg transition-colors text-text-muted hover:text-primary"
             >
                <Trash2 size={14} />
             </button>
          </div>
        </div>

        {isFolder && isExpanded && (
          <div className="grow">
            {(node.children || []).map(child => renderNode(child, level + 1, currentPath))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 grow">
      <div className="flex items-center justify-between mb-8 px-4 md:px-0">
        <div className="flex items-center gap-4">
           <button onClick={() => fetchData()} className="p-2 hover:bg-surface rounded-lg transition-colors">
              <RefreshCw size={18} className={cn(loading && "animate-spin")} />
           </button>
           <h3 className="font-display font-bold text-lg">App Dataset</h3>
        </div>
        <div className="flex items-center gap-2">
           <button 
             onClick={() => {
               const name = prompt("Folder name:");
               if (name) handleWrite(name + '._init', null); // create folder hack
             }}
             className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg text-sm font-bold hover:bg-surface-alt transition-all"
           >
              <FolderPlus size={16} /> New Folder
           </button>
           <button 
             onClick={() => {
               const path = prompt("Field path (e.g. config.theme):");
               const val = prompt("Initial value:");
               if (path) handleWrite(path, val);
             }}
             className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary-dim shadow-lg transition-all"
           >
              <Plus size={16} /> New Field
           </button>
        </div>
      </div>

      <div className="bg-surface rounded-2xl border border-border overflow-hidden grow">
        <div className="flex items-center h-10 border-b border-border bg-surface-alt px-4 text-[10px] uppercase font-bold text-text-muted tracking-widest">
           <div className="min-w-[200px]">Node Name</div>
           <div className="hidden md:block w-32 px-4">Type</div>
           <div className="flex-1 px-4">Value / Preview</div>
           <div className="w-24 text-right">Actions</div>
        </div>

        {data.length > 0 ? (
          <div className="grow overflow-auto no-scrollbar max-h-[600px]">
            {data.map(node => renderNode(node))}
          </div>
        ) : (
          <div className="py-20 text-center space-y-4">
             <Database size={48} className="mx-auto text-text-muted opacity-20" />
             <div>
                <p className="font-bold text-lg">No data yet</p>
                <p className="text-sm text-text-muted">Your app hasn't written any data to the dataset yet.</p>
             </div>
             <pre className="bg-surface-alt p-4 rounded-xl text-xs font-mono inline-block text-left border border-border">
                AIPLEX.dataset.write('users.count', 0)
             </pre>
          </div>
        )}
      </div>
    </div>
  );
}
