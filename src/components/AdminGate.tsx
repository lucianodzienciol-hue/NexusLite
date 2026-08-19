import React, { useState, useEffect } from 'react';
import { isRemote } from '../lib/supabase';

function hasRemoteGateway(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__NEXUS_REMOTE_API__;
}

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isRemote() || hasRemoteGateway()) { setAuthed(true); setLoading(false); return; }
    setAuthed(false);
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c0d10] flex items-center justify-center">
        <div className="text-slate-500 text-sm">Verificando acceso...</div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-[#0c0d10] flex items-center justify-center p-6">
        <div className="bg-[#111318] border border-[#2d3444] rounded-xl p-8 w-full max-w-sm text-center space-y-3">
          <div className="text-3xl mb-2">🔒</div>
          <h1 className="text-white font-bold text-lg">Acceso restringido</h1>
          <p className="text-slate-400 text-xs leading-relaxed">
            El panel de administración solo puede usarse en la red local.
            Abrí <strong className="text-white">iniciar-lite.vbs</strong> en la computadora del negocio
            y entrá desde <strong className="text-white">localhost</strong>.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}