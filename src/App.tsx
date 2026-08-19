import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  HelpCircle, 
  Settings, 
  User, 
  CheckCircle, 
  RotateCcw, 
  ExternalLink,
  AlertTriangle,
  LogOut,
  Download,
  Bell,
} from 'lucide-react';
import { Product, CompanyConfig, CashRegister } from './types';
import AdminGate from './components/AdminGate';
import { isLocal } from './lib/supabase';
import Articulos from './components/Articulos';
import PanelWeb from './components/PanelWeb';
import Backups from './components/Backups';
import Notas from './components/Notas';
import PedidosWeb from './components/PedidosWeb';
import ProcessMonitor from './components/ProcessMonitor';

type TabType = 'Artículos' | 'Panel Web' | 'Backups' | 'Notas' | 'Pedidos';

interface Order { id: string; status: string; clientName?: string; total: number; }

const DEMO_PRODUCTS = [
  { code: 'GEN001', name: 'Artículo de Ejemplo 1', price: 1000, cost: 600, stock: 20, category: 'General', desc: 'Artículo de ejemplo. Reemplazá estos productos por el catálogo real de tu empresa desde el panel.', image: 'https://picsum.photos/seed/ejemplo1/400/400' },
  { code: 'GEN002', name: 'Artículo de Ejemplo 2', price: 1500, cost: 900, stock: 15, category: 'General', desc: 'Artículo de ejemplo. Reemplazá estos productos por el catálogo real de tu empresa desde el panel.', image: 'https://picsum.photos/seed/ejemplo2/400/400' },
  { code: 'ALI001', name: 'Artículo de Ejemplo 3', price: 2000, cost: 1200, stock: 25, category: 'Alimentos', desc: 'Artículo de ejemplo. Reemplazá estos productos por el catálogo real de tu empresa desde el panel.', image: 'https://picsum.photos/seed/ejemplo3/400/400' },
  { code: 'ALI002', name: 'Artículo de Ejemplo 4', price: 2500, cost: 1500, stock: 18, category: 'Alimentos', desc: 'Artículo de ejemplo. Reemplazá estos productos por el catálogo real de tu empresa desde el panel.', image: 'https://picsum.photos/seed/ejemplo4/400/400' },
  { code: 'BEB001', name: 'Artículo de Ejemplo 5', price: 3000, cost: 1800, stock: 22, category: 'Bebidas', desc: 'Artículo de ejemplo. Reemplazá estos productos por el catálogo real de tu empresa desde el panel.', image: 'https://picsum.photos/seed/ejemplo5/400/400' },
  { code: 'BEB002', name: 'Artículo de Ejemplo 6', price: 3500, cost: 2100, stock: 16, category: 'Bebidas', desc: 'Artículo de ejemplo. Reemplazá estos productos por el catálogo real de tu empresa desde el panel.', image: 'https://picsum.photos/seed/ejemplo6/400/400' },
  { code: 'HOG001', name: 'Artículo de Ejemplo 7', price: 4000, cost: 2400, stock: 20, category: 'Hogar', desc: 'Artículo de ejemplo. Reemplazá estos productos por el catálogo real de tu empresa desde el panel.', image: 'https://picsum.photos/seed/ejemplo7/400/400' },
  { code: 'HOG002', name: 'Artículo de Ejemplo 8', price: 4500, cost: 2700, stock: 14, category: 'Hogar', desc: 'Artículo de ejemplo. Reemplazá estos productos por el catálogo real de tu empresa desde el panel.', image: 'https://picsum.photos/seed/ejemplo8/400/400' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const saved = localStorage.getItem('nexus_lite_activeTab');
    const valid: TabType[] = ['Artículos', 'Panel Web', 'Backups', 'Notas', 'Pedidos'];
    return valid.includes(saved as TabType) ? (saved as TabType) : 'Artículos';
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [companyConfig, setCompanyConfig] = useState<CompanyConfig | null>(null);
  const [cashRegister, setCashRegister] = useState<CashRegister>({ cash: 0, bank: 0 });

  const [webData, setWebData] = useState<any>(null);

  useEffect(() => { localStorage.setItem('nexus_lite_activeTab', activeTab); }, [activeTab]);

  useEffect(() => {
    const el = document.getElementById('nexus-preloader');
    if (el) { setTimeout(() => { el.style.transition = 'opacity .5s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 500); }, 6500); }
  }, []);

  const [showRestorePanel, setShowRestorePanel] = useState(false);
  const [encryptedBackups, setEncryptedBackups] = useState<any[]>([]);
  const [selectedBackup, setSelectedBackup] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [githubRepo, setGithubRepo] = useState('');
  const [webUrl, setWebUrl] = useState('');
  const [deployLoading, setDeployLoading] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [serviceRoleKey, setServiceRoleKey] = useState('');

  const [showHelp, setShowHelp] = useState(false);
  const [showCaja, setShowCaja] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProcessMonitor, setShowProcessMonitor] = useState(false);

  const knownOrderIds = useRef<Set<string>>(new Set());
  const [newOrderAlert, setNewOrderAlert] = useState<{ id: string; clientName: string; total: number } | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);

  const playNotificationSound = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.value = 0.15;
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {}
  }, []);

  const navTabs: TabType[] = ['Artículos', 'Panel Web', 'Backups', 'Notas', 'Pedidos'];
  const TAB_KEYS: TabType[] = ['Artículos', 'Panel Web', 'Backups', 'Notas', 'Pedidos'];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showHelp) { setShowHelp(false); e.preventDefault(); return; }
        if (showCaja) { setShowCaja(false); e.preventDefault(); return; }
        if (showSettings) { setShowSettings(false); e.preventDefault(); return; }
        if (showProcessMonitor) { setShowProcessMonitor(false); e.preventDefault(); return; }
      }
      if (e.altKey && !e.ctrlKey && ['1','2','3','4','5'].includes(e.key)) {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        setActiveTab(TAB_KEYS[idx]);
      }
      if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault();
          setShowHelp(prev => !prev);
        }
      }
      if (e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setShowProcessMonitor(prev => !prev);
      }
      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setShowSettings(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showHelp, showCaja, showSettings]);

  const seedDemoProducts = async () => {
    try {
      for (const prod of DEMO_PRODUCTS) {
        await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(prod),
        });
      }
      const res = await fetch('/api/products');
      if (res.ok) setProducts(await res.json());
    } catch (err) {
      console.error('Error seeding demo products:', err);
    }
  };

  const seedDemoWebData = async () => {
    try {
      const demo = {
        categories: [
          { id: '1', name: 'General' },
          { id: '2', name: 'Alimentos' },
          { id: '3', name: 'Bebidas' },
          { id: '4', name: 'Hogar' },
        ],
        services: [],
        config: {
          companyName: 'Mi Empresa',
          address: 'Calle Ejemplo 1234',
          phone: '011-5555-0000',
          email: 'contacto@miempresa.com',
          hours: 'Lun a Sáb 10:00 - 21:00 | Dom 11:00 - 18:00',
          whatsapp: '1122334455',
          facebook: 'miempresa',
          instagram: 'miempresa',
          siteTitle: 'Mi Empresa — Tienda Online',
          metaDescription: 'Descripción de tu empresa. Modificá estos datos desde el panel de administración.',
          cartEnabled: true,
          popupActive: true,
          popupDuration: 5,
          popupDelay: 3,
          popupText: '¡Bienvenido a Mi Empresa! Descubrí nuestros productos.',
          banners: [
            { image: 'https://picsum.photos/seed/banner1/1200/400', title: 'Novedades', link: '#', description: 'Conocé nuestros nuevos productos' },
            { image: 'https://picsum.photos/seed/banner2/1200/400', title: 'Ofertas Especiales', link: '#', description: 'Precios especiales por tiempo limitado' },
            { image: 'https://picsum.photos/seed/banner3/1200/400', title: 'Envío sin Cargo', link: '#', description: 'En compras mayores a $30.000' },
          ],
        },
      };
      const res = await fetch('/api/web-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(demo),
      });
      if (res.ok) {
        const refetch = await fetch('/api/web-data');
        if (refetch.ok) setWebData(await refetch.json());
      }
    } catch (err) {
      console.error('Error seeding demo web data:', err);
    }
  };

  const fetchAllData = useCallback(async () => {
    try {
      const [pRes, wdRes, ccRes, crRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/web-data'),
        fetch('/api/company-config'),
        fetch('/api/cash-register'),
      ]);

      if (pRes.ok) {
        const prods = await pRes.json();
        if (prods.length === 0) {
          await seedDemoProducts();
        } else {
          setProducts(prods);
        }
      }
      if (wdRes.ok) {
        const wd = await wdRes.json();
        if (!wd || !wd.categories || wd.categories.length === 0) {
          await seedDemoWebData();
        } else {
          setWebData(wd);
        }
      }
      if (ccRes.ok) {
        const ccData = await ccRes.json();
        if (ccData) {
          setCompanyConfig(ccData);
          if (ccData.githubToken) setGithubToken(ccData.githubToken);
          if (ccData.githubRepo) setGithubRepo(ccData.githubRepo);
          if (ccData.webUrl) setWebUrl(ccData.webUrl);
          if (ccData.supabaseUrl) setSupabaseUrl(ccData.supabaseUrl);
          if (ccData.supabaseKey) setSupabaseKey(ccData.supabaseKey);
          if (ccData.serviceRoleKey) setServiceRoleKey(ccData.serviceRoleKey);
        } else {
          setCompanyConfig(null);
        }
      }
      if (crRes.ok) setCashRegister(await crRes.json());
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, []);

  useEffect(() => {
    const unlockAudio = () => {
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
      } catch {}
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
    };
    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('touchstart', unlockAudio, { once: true });
  }, []);

  useEffect(() => {
    if (!isLocal()) return;
    let sse: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const seedKnownIds = async () => {
      try {
        const r = await fetch('/api/orders');
        if (!r.ok) return;
        const orders: Order[] = await r.json();
        for (const o of orders) {
          if (o.status === 'pendiente') knownOrderIds.current.add(o.id);
        }
      } catch {}
    };

    const onNewOrder = (o: Order) => {
      if (knownOrderIds.current.has(o.id)) return;
      knownOrderIds.current.add(o.id);
      setNewOrderAlert({ id: o.id, clientName: o.clientName || 'Sin nombre', total: o.total });
      playNotificationSound();
    };

    seedKnownIds().then(() => {
      try {
        sse = new EventSource('/api/orders/subscribe');
        sse.addEventListener('new-order', (e: MessageEvent) => {
          try { onNewOrder(JSON.parse(e.data)); } catch {}
        });
        sse.onerror = () => {};
      } catch {}
    });

    pollTimer = setInterval(async () => {
      try {
        const r = await fetch('/api/orders');
        if (!r.ok) return;
        const orders: Order[] = await r.json();
        for (const o of orders) {
          if (o.status === 'pendiente' && !knownOrderIds.current.has(o.id)) {
            onNewOrder(o);
            break;
          }
        }
      } catch {}
    }, 15000);

    return () => {
      if (sse) sse.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [playNotificationSound]);

  const handleDownloadApp = () => {
    window.location.href = '/api/download-app';
  };

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleBackup = () => {
    showToast('Generando backup...', 'info');
    const a = document.createElement('a');
    a.href = '/api/backup';
    a.download = 'backup.json';
    a.click();
    setTimeout(() => showToast('Backup generado correctamente', 'success'), 1000);
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Error al restaurar');
      alert('Backup restaurado correctamente. Los datos se recargarán.');
      fetchAllData();
    } catch (err) {
      alert('Error al restaurar el backup. Verifica que el archivo sea válido.');
    }
    e.target.value = '';
  };

  return (
    <AdminGate>
    <div className="min-h-screen bg-[#0c0d10] flex flex-col justify-between font-sans selection:bg-[#A63A42]/20 selection:text-white">
      
      <header className="bg-[#0f1115] border-b border-[#1f242e] sticky top-0 z-30 px-6 py-2">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          
          <div className="flex items-center gap-3 shrink-0 cursor-pointer select-none" onClick={() => setActiveTab('Artículos')}>
            <img src="/logo.png" alt="Nexus Lite" className="h-12 w-12 rounded-lg object-cover shadow-md shadow-red-900/20" />
            <div className="flex flex-col">
              <span className="text-base font-black text-white tracking-widest leading-none">NEXUS LITE</span>
              <span className="text-[10px] tracking-widest text-slate-400 font-mono font-bold uppercase mt-0.5">PANEL DE GESTIÓN</span>
            </div>
          </div>

          <nav className="hidden md:flex flex-1 flex-wrap items-center justify-center gap-x-1 gap-y-0.5">
            {navTabs.map((tab, idx) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); }}
                  className={`relative py-1 px-2.5 rounded-lg text-[11px] font-semibold tracking-wide transition-all cursor-pointer whitespace-nowrap ${
                    isActive 
                      ? 'text-white bg-[#1b1f28] font-bold' 
                      : 'text-slate-400 hover:text-white hover:bg-[#151821]/50'
                  }`}
                >
                  <span className="text-[9px] text-slate-500 mr-1 font-mono">Alt+{idx + 1}</span>
                  {tab}
                    {isActive && (
                    <div className="absolute bottom-0 left-3 right-3 h-[2px] bg-[#A63A42]" />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-1.5">
              <button 
                onClick={() => setShowHelp(true)}
                title="Ayuda / Atajos"
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a1d24] transition-all cursor-pointer"
              >
                <HelpCircle size={15} />
              </button>

              <a 
                href="/web/"
                target="_blank"
                rel="noopener noreferrer"
                title="Tienda online"
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a1d24] transition-all cursor-pointer inline-flex items-center"
              >
                <ExternalLink size={15} />
              </a>
            </div>

            <div className="flex items-center gap-2 pl-2 border-l border-[#1f242e]">
              <div className="h-7 w-7 rounded-full bg-[#181a20] border border-[#2d3444] flex items-center justify-center text-[#A63A42]">
                <User size={13} />
              </div>
              <div className="hidden xl:flex flex-col text-left">
                <span className="text-[11px] font-semibold text-white leading-tight">Admin</span>
                <span className="text-[9px] text-[#A63A42] font-mono leading-none">Vinoteca</span>
              </div>
            </div>

          </div>

        </div>
      </header>

      <div className="md:hidden bg-[#0f1115] border-b border-[#1f242e] px-4 py-2 flex gap-1 overflow-x-auto">
        {(['Artículos', 'Panel Web', 'Backups', 'Notas', 'Pedidos'] as const).map((tab, idx) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); }}
              className={`py-1 px-3 text-[11px] rounded font-medium shrink-0 transition-all ${
                isActive ? 'bg-[#A63A42] text-slate-950 font-bold' : 'text-slate-400'
              }`}
            >
              {tab}
            </button>
          );
        })}
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        
        {activeTab === 'Artículos' && (
          <Articulos products={products} categories={webData?.categories || []} onRefresh={fetchAllData} />
        )}

        {activeTab === 'Panel Web' && (
          <PanelWeb webData={webData} onRefresh={fetchAllData} products={products} />
        )}

        {activeTab === 'Backups' && (
          <Backups onRefresh={fetchAllData} />
        )}

        {activeTab === 'Notas' && (
          <Notas onRefresh={fetchAllData} />
        )}

        {activeTab === 'Pedidos' && (
          <PedidosWeb onRefresh={fetchAllData} />
        )}

      </main>

      <footer className="bg-[#090a0d] border-t border-[#12151c] px-6 py-3.5 mt-auto text-xs font-mono text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-4 text-slate-500">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="h-2 w-2 rounded-full bg-[#A63A42]" />
              Nexus Lite
            </span>
            <span className="hidden sm:inline text-slate-600">|</span>
            <button 
              onClick={() => setShowHelp(true)} 
              className="text-slate-400 hover:text-white"
            >
              Soporte
            </button>
            <span className="hidden sm:inline text-slate-600">|</span>
            <button 
              onClick={() => setShowProcessMonitor(true)} 
              className="text-slate-400 hover:text-white"
            >
              Monitor
            </button>
            <span className="hidden sm:inline text-slate-600">|</span>
            <button 
              onClick={() => window.open('https://wa.me/', '_blank')} 
              className="text-slate-400 hover:text-white"
            >
              Contacto
            </button>
          </div>

          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Sincronizado con Nube
            </span>
            <span className="text-slate-500">Nexus Lite — 2026</span>
          </div>

        </div>
      </footer>

        {showHelp && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#111318] border border-[#2d3444] rounded-xl max-w-md w-full overflow-hidden shadow-2xl p-6">
              <div className="flex justify-between items-center border-b border-[#2d3444] pb-3 mb-4">
                <span className="font-semibold text-white font-display">Ayuda y Atajos del Sistema</span>
                <button onClick={() => setShowHelp(false)} className="text-slate-400 hover:text-white text-xs">Cerrar</button>
              </div>

              <div className="space-y-4 text-xs">
                <p className="text-slate-400 leading-relaxed">
                  Nexus Lite — Panel de gestión para tu empresa. Administrá productos, pedidos y tienda online.
                </p>

                <div className="space-y-2">
                  <div className="flex justify-between items-center py-2 border-b border-[#1b1e26] font-mono">
                    <span className="text-white font-semibold">Alt+1..5</span>
                    <span className="text-slate-400 text-right">Navegar entre secciones</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[#1b1e26] font-mono">
                    <span className="text-white font-semibold">ESC</span>
                    <span className="text-slate-400 text-right">Cerrar modal / cancelar</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[#1b1e26] font-mono">
                    <span className="text-white font-semibold">?</span>
                    <span className="text-slate-400 text-right">Abrir / cerrar esta ayuda</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#2d3444] space-y-1 text-slate-500 text-[10px]">
                  <span>Nexus Lite — Panel de Gestión</span><br/>
                  <span>Conectado a servidor local puerto 4051</span><br/>
                  <span>React + Vite + Tailwind CSS</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {showSettings && (
          <div className="fixed inset-0 z-40" onClick={() => setShowSettings(false)}>
            <div className="absolute inset-0 bg-black/40" />
            <div className="fixed inset-y-0 right-0 w-80 bg-[#111318] border-l border-[#2d3444] shadow-2xl p-6 flex flex-col justify-between overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div>
              <div className="flex justify-between items-center border-b border-[#2d3444] pb-4 mb-6">
                <span className="font-semibold text-white font-display text-sm flex items-center gap-2">
                  <Settings size={16} className="text-[#A63A42]" />
                  Configuración
                </span>
                <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white text-xs">Cerrar</button>
              </div>

              <div className="space-y-4 text-xs text-slate-400">
                <div className="space-y-1">
                  <label className="text-white font-medium block">Servidor</label>
                  <input
                    type="text"
                    disabled
                    className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg p-2 text-slate-500 font-mono"
                    value="http://localhost:3010"
                  />
                  <p className="text-[10px] text-slate-500">Conectado al servidor principal Nexus POS.</p>
                </div>

                <div className="pt-4 border-t border-[#2d3444]/60 space-y-2">
                  <span className="text-white font-medium block">Copias de Seguridad</span>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleBackup}
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-3 rounded-lg text-xs transition-colors cursor-pointer"
                    >
                      <Download size={13} />
                      Guardar Backup
                    </button>
                    <button
                      onClick={() => document.getElementById('restore-input')?.click()}
                      className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2 px-3 rounded-lg text-xs transition-colors cursor-pointer"
                    >
                      <RotateCcw size={13} />
                      Restablecer Backup
                    </button>
                    <input
                      id="restore-input"
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={handleRestore}
                    />
                    <button
                      onClick={async () => {
                        try {
                          const r = await fetch('/api/backups/encrypted');
                          if (r.ok) { setEncryptedBackups(await r.json()); setShowRestorePanel(true); }
                        } catch {}
                      }}
                      className="w-full flex items-center justify-center gap-2 bg-purple-700 hover:bg-purple-600 text-white font-semibold py-2 px-3 rounded-lg text-xs transition-colors cursor-pointer"
                    >
                      <RotateCcw size={13} />
                      Restaurar desde GitHub
                    </button>
                    <button
                      onClick={async () => {
                        const pwd = prompt('Ingrese la contraseña para restaurar el último backup:');
                        if (!pwd) return;
                        try {
                          const r = await fetch('/api/backups/restore-last', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ password: pwd })
                          });
                          if (r.ok) {
                            alert('Último backup restaurado correctamente. Los datos se recargarán.');
                            fetchAllData();
                          } else {
                            const err = await r.json();
                            alert(err.error || 'Error al restaurar');
                          }
                        } catch {
                          alert('Error de conexión');
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 bg-red-700 hover:bg-red-600 text-white font-semibold py-2 px-3 rounded-lg text-xs transition-colors cursor-pointer"
                    >
                      <RotateCcw size={13} />
                      Restaurar último cambio
                    </button>
                    {showRestorePanel && (
                      <div className="border border-[#2d3444] rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-500 font-mono uppercase font-bold">Backups Encriptados</span>
                          <button onClick={() => { setShowRestorePanel(false); setSelectedBackup(''); setRestorePassword(''); }} className="text-slate-500 hover:text-white text-xs cursor-pointer">&times;</button>
                        </div>
                        {encryptedBackups.length === 0 ? (
                          <p className="text-[11px] text-slate-500 italic">No hay backups encriptados disponibles. Sincronice con GitHub primero.</p>
                        ) : (
                          <div className="max-h-40 overflow-y-auto space-y-1">
                            {encryptedBackups.map((b: any) => (
                              <button
                                key={b.file}
                                onClick={() => setSelectedBackup(b.file)}
                                className={`w-full text-left px-2.5 py-1.5 rounded text-[11px] transition-colors cursor-pointer ${
                                  selectedBackup === b.file ? 'bg-purple-800/40 text-purple-200 border border-purple-700' : 'text-slate-400 hover:bg-[#1a1d24]'
                                }`}
                              >
                                <span className="font-semibold">{b.date}</span>
                                <span className="text-[9px] ml-2 text-slate-600">({(b.size / 1024).toFixed(0)} KB)</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {selectedBackup && (
                          <>
                            <input
                              type="password"
                              className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none"
                              placeholder="Contraseña de backup"
                              value={restorePassword}
                              onChange={e => setRestorePassword(e.target.value)}
                            />
                            <button
                              onClick={async () => {
                                if (!restorePassword) { alert('Ingrese la contraseña'); return; }
                                if (!confirm('¿Está seguro de restaurar este backup? Se perderán los datos actuales.')) return;
                                setRestoreLoading(true);
                                try {
                                  const r = await fetch('/api/backups/restore-encrypted', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ file: selectedBackup, password: restorePassword })
                                  });
                                  if (r.ok) {
                                    alert('Backup restaurado correctamente. Los datos se recargarán.');
                                    setShowRestorePanel(false);
                                    setSelectedBackup('');
                                    setRestorePassword('');
                                    fetchAllData();
                                  } else {
                                    const err = await r.json();
                                    alert(err.error || 'Error al restaurar');
                                  }
                                } catch {
                                  alert('Error de conexión');
                                }
                                setRestoreLoading(false);
                              }}
                              disabled={restoreLoading}
                              className="w-full bg-purple-700 hover:bg-purple-600 text-white font-bold py-1.5 px-3 rounded-lg text-xs transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {restoreLoading ? 'Restaurando...' : 'Restaurar Backup'}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Guarda o restaura un respaldo completo de la base de datos (productos, configuración web, notas, etc.).
                  </p>
                </div>

                <div className="pt-4 border-t border-[#2d3444]/60 space-y-2">
                  <span className="text-white font-medium block">Instalar en Servidor Local</span>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    La app se ejecuta directamente desde la carpeta <strong className="text-white">Nexus Lite</strong>. Corré <strong className="text-amber-400">iniciar-lite.vbs</strong> para arrancar.
                  </p>
                </div>

                <div className="pt-4 border-t border-[#2d3444]/60 space-y-3">
                  <span className="text-white font-medium block">GitHub Pages</span>
                  <div>
                    <label className="text-[10px] text-slate-500 font-mono uppercase block mb-1">Token</label>
                    <input
                      type="password"
                      value={githubToken}
                      onChange={e => setGithubToken(e.target.value)}
                      className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none"
                      placeholder="ghp_..."
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-mono uppercase block mb-1">Repositorio (user/repo)</label>
                    <input
                      type="text"
                      value={githubRepo}
                      onChange={e => setGithubRepo(e.target.value)}
                      className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none"
                      placeholder="tu-usuario/tu-repo"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-mono uppercase block mb-1">URL de la Web</label>
                    <input
                      type="text"
                      value={webUrl}
                      onChange={e => setWebUrl(e.target.value)}
                      className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none"
                      placeholder="https://..."
                    />
                  </div>
                  <button
                    onClick={async () => {
                      if (!githubToken || !githubRepo) { alert('Completá Token y Repositorio.'); return; }
                      setDeployLoading(true);
                      try {
                        const r = await fetch('/api/deploy-ghpages', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ token: githubToken, repo: githubRepo })
                        });
                        const data = await r.json();
                        if (data.success) {
                          const url = data.url;
                          setWebUrl(url);
                          await fetch('/api/company-config', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ githubToken, githubRepo, webUrl: url })
                          });
                          alert(`Web publicada correctamente.\nURL: ${url}`);
                        } else {
                          alert('Error: ' + (data.error || 'desconocido'));
                        }
                      } catch {
                        alert('Error de conexión con el servidor.');
                      }
                      setDeployLoading(false);
                    }}
                    disabled={deployLoading}
                    className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-500 text-white font-semibold py-2 px-3 rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {deployLoading && <span className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />}
                    {deployLoading ? 'Desplegando...' : 'Desplegar en GitHub Pages'}
                  </button>
                  {webUrl && (
                    <p className="text-[10px] text-emerald-400 leading-normal">
                      Web publicada en: <a href={webUrl} target="_blank" className="underline">{webUrl}</a>
                    </p>
                  )}
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Construye la app web y la publica en GitHub Pages. Necesitás un token clásico con permiso <strong className="text-white">repo</strong>.
                  </p>
                </div>

                <div className="pt-4 border-t border-[#2d3444]/60 space-y-3">
                  <span className="text-white font-medium block">Supabase (Nube)</span>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Configuración para recibir pedidos desde la web online aunque el servidor local esté apagado.
                  </p>
                  <div>
                    <label className="text-[10px] text-slate-500 font-mono uppercase block mb-1">Supabase URL</label>
                    <input
                      type="text"
                      value={supabaseUrl}
                      onChange={e => setSupabaseUrl(e.target.value)}
                      className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none"
                      placeholder="https://xxxxx.supabase.co"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-mono uppercase block mb-1">Anon Key</label>
                    <input
                      type="password"
                      value={supabaseKey}
                      onChange={e => setSupabaseKey(e.target.value)}
                      className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none"
                      placeholder="eyJhbGciOi..."
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-mono uppercase block mb-1">Service Role Key (solo servidor local)</label>
                    <input
                      type="password"
                      value={serviceRoleKey}
                      onChange={e => setServiceRoleKey(e.target.value)}
                      className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none"
                      placeholder="eyJhbGciOi... (nunca la publiques en la web)"
                    />
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        const r = await fetch('/api/company-config', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ githubToken, githubRepo, webUrl, supabaseUrl, supabaseKey, serviceRoleKey })
                        });
                        if (r.ok) showToast('Configuración guardada', 'success');
                        else showToast('Error al guardar', 'error');
                      } catch { showToast('Error de conexión', 'error'); }
                    }}
                    className="bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg py-1 px-3 text-[10px] font-semibold transition-colors cursor-pointer"
                  >Guardar Configuración</button>
                </div>
              </div>
            </div>

            <div className="border-t border-[#2d3444] pt-4 text-[11px] text-slate-500 font-mono">
              <span>Sincronización Integrada: Habilitada</span><br/>
              <span>Nexus Lite</span>
            </div>
          </div>
          </div>
        )}

        {showProcessMonitor && <ProcessMonitor onClose={() => setShowProcessMonitor(false)} />}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[60]">
          <div className={`flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-2xl border text-xs font-semibold ${
            toast.type === 'success' ? 'bg-emerald-900/80 border-emerald-700/50 text-emerald-300' :
            toast.type === 'error' ? 'bg-red-900/80 border-red-700/50 text-red-300' :
            'bg-[#1c222d] border-[#2d3444] text-slate-200'
          }`}>
            {toast.type === 'success' && <CheckCircle size={14} className="text-emerald-400 shrink-0" />}
            {toast.type === 'error' && <AlertTriangle size={14} className="text-red-400 shrink-0" />}
            {toast.type === 'info' && <svg className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
            {toast.msg}
          </div>
        </div>
      )}

      {newOrderAlert && (
        <div className="fixed top-4 right-4 z-[70] max-w-sm motion-safe:animate-bounce">
          <div className="bg-[#111318] border border-amber-500/40 rounded-xl shadow-2xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                  <Bell size={16} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-white font-bold text-sm">¡Nuevo pedido!</p>
                  <p className="text-amber-400 text-[10px] font-mono font-semibold">{newOrderAlert.id}</p>
                </div>
              </div>
              <button
                onClick={() => setNewOrderAlert(null)}
                className="text-slate-500 hover:text-white text-sm leading-none cursor-pointer"
              >&times;</button>
            </div>
            <div className="text-xs text-slate-400 space-y-1">
              <p><span className="text-slate-500">Cliente:</span> {newOrderAlert.clientName}</p>
              <p><span className="text-slate-500">Total:</span> <span className="text-white font-semibold">${Number(newOrderAlert.total).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</span></p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setActiveTab('Pedidos'); setNewOrderAlert(null); }}
                className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold py-1.5 px-3 rounded-lg text-[11px] transition-colors cursor-pointer"
              >Ver pedido</button>
              <button
                onClick={() => setNewOrderAlert(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-400 py-1.5 px-3 rounded-lg text-[11px] transition-colors cursor-pointer"
              >Cerrar</button>
            </div>
          </div>
        </div>
      )}

    </div>
    </AdminGate>
  );
}
