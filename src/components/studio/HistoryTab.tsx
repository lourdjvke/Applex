import React, { useState, useEffect } from 'react';
import { dbGet } from '../../lib/firebase';
import { AppVersion } from '../../types';
import { RefreshCcw, Eye } from 'lucide-react';

export default function HistoryTab({ appId, onVersionSelect }: { appId: string, onVersionSelect: (version: AppVersion) => void }) {
  const [versions, setVersions] = useState<AppVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchVersions() {
      const data = await dbGet<Record<string, AppVersion>>(`apps/${appId}/versions`);
      if (data) {
        const sorted = Object.values(data).sort((a, b) => b.createdAt - a.createdAt);
        setVersions(sorted);
      }
      setLoading(false);
    }
    fetchVersions();
  }, [appId]);

  if (loading) return <div className="p-4 text-sm text-text-muted">Loading history...</div>;

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">Version History</h3>
      {versions.length === 0 ? (
        <p className="text-sm">No history yet.</p>
      ) : (
        <div className="space-y-2">
          {versions.map(v => (
            <div key={v.id} className="flex items-center justify-between p-4 bg-surface border border-border rounded-xl">
              <div>
                <p className="font-mono text-sm font-semibold">v{v.version}</p>
                <p className="text-xs text-text-muted">{v.summary}</p>
                <p className="text-[10px] text-text-muted">{new Date(v.createdAt).toLocaleDateString()}</p>
              </div>
              <button 
                onClick={() => onVersionSelect(v)}
                className="flex items-center gap-2 px-3 py-1.5 bg-surface-alt border border-border rounded-lg text-xs font-bold hover:bg-primary/5 hover:border-primary/20 transition-all"
              >
                <Eye size={14} /> Revert
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
