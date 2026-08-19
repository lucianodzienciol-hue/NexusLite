import React, { useState, useEffect } from 'react';

interface ProcessStatus {
  pid: number;
  ppid: number;
  uptime: string;
  uptimeSeconds: number;
  memory: { rss: string; heapTotal: string; heapUsed: string };
  nodeVersion: string;
  platform: string;
  dbSize: string;
  dbSizeBytes: number;
  counts: Record<string, number>;
  children: { pid: number; name: string }[];
  gitRemote: string;
  lastSync: string | null;
}

export default function ProcessMonitor({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<ProcessStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) throw Error(await res.text());
      setData(await res.json());
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
         onClick={onClose}>
      <div className="bg-[#111318] border border-[#2d3444] rounded-xl max-w-lg w-full overflow-hidden shadow-2xl p-6"
           onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center border-b border-[#2d3444] pb-3 mb-4">
          <span className="font-semibold text-white font-display">Monitor del Sistema</span>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xs">Cerrar</button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-amber-400 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          </div>
        )}

        {error && (
          <div className="text-center py-6">
            <p className="text-red-400 text-xs">Error: {error}</p>
            <button onClick={fetchStatus}
              className="mt-3 text-[10px] text-slate-400 hover:text-white font-mono px-3 py-1 rounded border border-[#2d3444] hover:bg-[#1a1d24] transition-all">
              Reintentar
            </button>
          </div>
        )}

        {data && !error && (
          <div className="space-y-3 text-xs">

            <div className="bg-[#0d0f14] rounded-lg p-3 border border-[#1b1e26]">
              <p className="text-slate-500 font-semibold mb-2 uppercase tracking-wider text-[10px]">Servidor</p>
              <div className="grid grid-cols-2 gap-2">
                <InfoRow label="PID" value={String(data.pid)} />
                <InfoRow label="PPID" value={String(data.ppid)} />
                <InfoRow label="Uptime" value={data.uptime} />
                <InfoRow label="Node" value={data.nodeVersion} />
                <InfoRow label="Plataforma" value={data.platform} />
                <InfoRow label="BD" value={data.dbSize} />
              </div>
            </div>

            <div className="bg-[#0d0f14] rounded-lg p-3 border border-[#1b1e26]">
              <p className="text-slate-500 font-semibold mb-2 uppercase tracking-wider text-[10px]">Memoria RAM</p>
              <div className="grid grid-cols-3 gap-2">
                <MemCard label="RSS" value={data.memory.rss} />
                <MemCard label="Heap Total" value={data.memory.heapTotal} />
                <MemCard label="Heap Usado" value={data.memory.heapUsed} />
              </div>
            </div>

            <div className="bg-[#0d0f14] rounded-lg p-3 border border-[#1b1e26]">
              <p className="text-slate-500 font-semibold mb-2 uppercase tracking-wider text-[10px]">Registros en Base de Datos</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {Object.entries(data.counts).map(([table, count]) => (
                  <div key={table} className="text-center p-1.5 rounded bg-[#161a21]">
                    <p className="text-white font-bold text-sm">{count}</p>
                    <p className="text-slate-500 text-[9px] uppercase truncate">{table.replace(/_/g, ' ')}</p>
                  </div>
                ))}
              </div>
            </div>

            {data.children.length > 0 && (
              <div className="bg-[#0d0f14] rounded-lg p-3 border border-[#1b1e26]">
                <p className="text-slate-500 font-semibold mb-2 uppercase tracking-wider text-[10px]">Procesos Hijos (Node)</p>
                {data.children.map(c => (
                  <div key={c.pid} className="flex justify-between text-[11px] py-1 border-b border-[#1b1e26] last:border-0">
                    <span className="text-slate-300">{c.name || 'desconocido'}</span>
                    <span className="text-slate-500 font-mono">{c.pid}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-[#0d0f14] rounded-lg p-3 border border-[#1b1e26]">
              <p className="text-slate-500 font-semibold mb-2 uppercase tracking-wider text-[10px]">GitHub Sync</p>
              <div className="space-y-1">
                <InfoRow label="Remote" value={data.gitRemote} />
                <InfoRow label="Última sync" value={data.lastSync || 'Nunca'} />
              </div>
            </div>

          </div>
        )}

        <div className="mt-4 text-center">
          <button onClick={onClose}
            className="text-[10px] text-slate-400 hover:text-white font-mono px-3 py-1 rounded border border-[#2d3444] hover:bg-[#1a1d24] transition-all">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[11px] py-1 px-2 rounded bg-[#161a21]">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-200 font-mono">{value}</span>
    </div>
  );
}

function MemCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center p-2 rounded bg-[#161a21]">
      <p className="text-white font-bold text-sm">{value}</p>
      <p className="text-slate-500 text-[9px] uppercase">{label}</p>
    </div>
  );
}
