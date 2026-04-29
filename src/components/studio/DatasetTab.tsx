import { useState, useEffect } from 'react';
import { Database, FolderPlus, Plus, RefreshCw, Trash2, Pencil, ChevronRight, ChevronDown, Check, X, Copy, TextQuote, Hash, ToggleLeft, Braces } from 'lucide-react';
import { DatasetEngine } from '../../lib/dataset-engine';
import { cn } from '../../lib/utils';

type UiNode = {
  key: string;
  path: string;
  isFolder: boolean;
  value?: any;
  valueType?: string;
  children?: UiNode[];
};

function buildUiTree(json: any, currentPath: string = ''): UiNode[] {
  if (!json || typeof json !== 'object') return [];
  return Object.keys(json).sort().map(key => {
    const val = json[key];
    const path = currentPath ? `${currentPath}/${key}` : key;
    if (val !== null && typeof val === 'object') {
      return {
        key,
        path,
        isFolder: true,
        children: buildUiTree(val, path)
      };
    }
    return {
      key,
      path,
      isFolder: false,
      value: val,
      valueType: typeof val
    };
  });
}

export default function DatasetTab({ creatorUid, appId }: { creatorUid: string; appId: string }) {
  const [data, setData] = useState<UiNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingNodePath, setEditingNodePath] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [engine] = useState(() => new DatasetEngine(creatorUid, appId));

  useEffect(() => {
    const unsub = engine.onTree((treeJson) => {
      setData(buildUiTree(treeJson));
      setLoading(false);
    });
    return () => unsub();
  }, [appId]);

  const toggleFolder = (path: string) => {
    setExpanded(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const handleWrite = async (path: string, val: any) => {
    let parsedVal = val;
    // Auto-parse numbers and booleans
    if (val === 'true') parsedVal = true;
    else if (val === 'false') parsedVal = false;
    else if (!isNaN(Number(val)) && val.trim() !== '') parsedVal = Number(val);

    await engine.set(path, parsedVal);
    setEditingNodePath(null);
  };

  const renderNode = (node: UiNode, level: number = 0) => {
    const isExpanded = expanded[node.path];
    const isEditing = editingNodePath === node.path;

    return (
      <div key={node.path} className="flex flex-col grow">
        <div 
          className={cn(
            "group flex items-center h-14 border-b border-border/50 hover:bg-surface-alt transition-colors px-4",
            level > 0 && "ml-5 border-l border-border/30"
          )}
          style={{ paddingLeft: `${Math.max(16, level * 20)}px` }}
        >
          {/* Toggle / Icon */}
          <div className="flex items-center gap-2 min-w-[200px]">
            {node.isFolder ? (
              <button onClick={() => toggleFolder(node.path)} className="p-1 hover:bg-black/5 rounded">
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <div className="w-6" />
            )}
            
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              node.isFolder ? "bg-accent-2/10 text-accent-2" : "bg-primary/10 text-primary"
            )}>
              {node.isFolder ? <FolderPlus size={16} /> : 
               node.valueType === 'number' ? <Hash size={16} /> :
               node.valueType === 'boolean' ? <ToggleLeft size={16} /> :
               node.valueType === 'object' ? <Braces size={16} /> :
               <TextQuote size={16} />}
            </div>

            <span className="text-sm font-semibold truncate">{node.key}</span>
          </div>

          {/* Type Badge */}
          <div className="hidden md:block w-32 px-4">
             <span className="text-[10px] uppercase font-bold text-text-muted bg-surface py-0.5 px-2 rounded border border-border">
                {node.isFolder ? 'folder' : node.valueType}
             </span>
          </div>

          {/* Value / Preview */}
          <div className="flex-1 px-4 truncate">
            {node.isFolder ? (
              <span className="text-xs text-text-muted">{(node.children || []).length} items</span>
            ) : isEditing ? (
              <div className="flex items-center gap-2">
                <input 
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleWrite(node.path, editValue)}
                  className="bg-bg border border-primary rounded px-2 py-1 text-sm font-mono w-full outline-none grow"
                />
                <button onClick={() => handleWrite(node.path, editValue)} className="p-1 text-installed"><Check size={16} /></button>
                <button onClick={() => setEditingNodePath(null)} className="p-1 text-primary"><X size={16} /></button>
              </div>
            ) : (
              <span className="text-xs font-mono text-text-secondary truncate block">
                {String(node.value)}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
             <button 
                onClick={() => {
                  navigator.clipboard.writeText(node.path);
                }} 
                className="p-2 hover:bg-white rounded-lg transition-colors text-text-muted"
                title="Copy path"
             >
                <Copy size={14} />
             </button>
             {node.isFolder && (
               <button 
                 onClick={() => {
                   const sub = prompt(`New path relative to ${node.path}:`);
                   if(sub) handleWrite(`${node.path}/${sub}`, 'new value');
                 }} 
                 className="p-2 hover:bg-white rounded-lg transition-colors text-text-muted"
                 title="Add Sub-item"
               >
                  <Plus size={14} />
               </button>
             )}
             {!node.isFolder && (
               <button 
                 onClick={() => {
                   setEditingNodePath(node.path);
                   setEditValue(String(node.value));
                 }} 
                 className="p-2 hover:bg-white rounded-lg transition-colors text-text-muted"
               >
                  <Pencil size={14} />
               </button>
             )}
             <button 
                onClick={async () => {
                  if (confirm(node.isFolder ? `Delete ${node.path} and all its children?` : `Delete ${node.path}?`)) {
                    await engine.remove(node.path);
                  }
                }}
                className="p-2 hover:bg-primary/10 rounded-lg transition-colors text-text-muted hover:text-primary"
             >
                <Trash2 size={14} />
             </button>
          </div>
        </div>

        {node.isFolder && isExpanded && (
          <div className="grow">
            {(node.children || []).map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 grow">
      <div className="flex items-center justify-between mb-8 px-4 md:px-0">
        <div className="flex items-center gap-4">
           {loading ? (
             <div className="p-2">
                <RefreshCw size={18} className="animate-spin text-text-muted" />
             </div>
           ) : <Database size={18} className="text-text-muted" />}
           <h3 className="font-display font-bold text-lg">App Dataset</h3>
        </div>
        <div className="flex items-center gap-2">
           <button 
             onClick={() => {
               const path = prompt("Field path (e.g. config/theme, users/uid123/name):");
               const val = prompt("Initial value:");
               if (path && val !== null) handleWrite(path, val);
             }}
             className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary-dim shadow-lg transition-all"
           >
              <Plus size={16} /> Add Node
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
                AIPLEX.dataset.set('users/count', 0)
             </pre>
          </div>
        )}
      </div>
    </div>
  );
}
