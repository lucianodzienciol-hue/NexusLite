import React, { useState, useEffect } from 'react';
import { Store, Image, Settings, Plus, Trash2, MessageCircle, CheckCircle, AlertTriangle, ListOrdered } from 'lucide-react';

interface PanelWebProps {
  webData: any;
  onRefresh: () => void;
  products?: { id: string; category: string }[];
}

export default function PanelWeb({ webData, onRefresh, products }: PanelWebProps) {
  const config = webData?.config || {};
  const categories = webData?.categories || [];
  const banners = config.banners || [];
  const [activeSection, setActiveSection] = useState(() => {
    const saved = localStorage.getItem('nexus_pw_section');
    const valid = ['config', 'popup', 'banners', 'categorias', 'maestros'];
    return valid.includes(saved) ? saved : 'config';
  });
  const [draftConfig, setDraftConfig] = useState<any>(config);
  const [draftBanners, setDraftBanners] = useState<any[]>(banners);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => { setDraftConfig(config); }, [config]);
  useEffect(() => { setDraftBanners(banners); }, [banners]);

  useEffect(() => { localStorage.setItem('nexus_pw_section', activeSection); }, [activeSection]);

  const handleSave = async (updated: any) => {
    try {
      const r = await fetch('/api/web-save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
      if (!r.ok) {
        const errData = await r.json().catch(() => ({}));
        showToast('error', errData.error || 'Error al guardar (código ' + r.status + ')');
        return;
      }
      showToast('success', 'Cambios guardados correctamente');
      onRefresh();
    } catch { showToast('error', 'Error de conexión al guardar'); }
  };

  const saveDraft = () => {
    handleSave({ ...webData, config: { ...config, ...draftConfig, banners: draftBanners } });
  };

  const updateFull = (updated: any) => handleSave(updated);

  const catImg = (name: string) => (draftConfig.categoryImages || {})[name] || '';
  const setCatImage = (name: string, value: string) => setDraftConfig((p: any) => ({ ...p, categoryImages: { ...(p.categoryImages || {}), [name]: value } }));
  const clearCatImage = (name: string) => setDraftConfig((p: any) => { const ci = { ...(p.categoryImages || {}) }; delete ci[name]; return { ...p, categoryImages: ci }; });

  const imgSrc = (path: string) => {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) return path;
    const clean = path.replace(/^\//, '');
    if (clean.startsWith('web/')) return '/' + clean;
    return '/web/' + clean;
  };

  const tabs = [
    { id: 'config', label: 'Empresa', icon: <Store size={13} /> },
    { id: 'popup', label: 'Popup', icon: <MessageCircle size={13} /> },
    { id: 'banners', label: 'Banners', icon: <Image size={13} /> },
    { id: 'categorias', label: 'Categorías', icon: <Settings size={13} /> },
    { id: 'maestros', label: 'Maestros', icon: <ListOrdered size={13} /> },
  ];

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg text-xs font-bold shadow-lg border transition-all ${
          toast.type === 'success' ? 'bg-emerald-900/90 text-emerald-300 border-emerald-700' : 'bg-red-900/90 text-red-300 border-red-700'
        }`}>
          {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          {toast.text}
        </div>
      )}
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-white">Panel Web</h2>
        <span className="text-[10px] text-slate-500 font-mono">Configuración de la tienda online</span>
      </div>

      <div className="flex gap-1 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveSection(t.id)} className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${activeSection === t.id ? 'bg-[#A63A42] text-[#0c0d10]' : 'bg-[#181a20] border border-[#2d3444] text-slate-400 hover:text-white'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5">
        {activeSection === 'config' && (
            <div className="space-y-4 max-w-xl">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Datos de la Empresa</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[10px] text-slate-500 font-mono uppercase">Nombre</label><input type="text" value={draftConfig.companyName || ''} onChange={e => setDraftConfig((p: any) => ({ ...p, companyName: e.target.value }))} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
                <div><label className="text-[10px] text-slate-500 font-mono uppercase">Dirección</label><input type="text" value={draftConfig.address || ''} onChange={e => setDraftConfig((p: any) => ({ ...p, address: e.target.value }))} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
                <div><label className="text-[10px] text-slate-500 font-mono uppercase">Teléfono</label><input type="text" value={draftConfig.phone || ''} onChange={e => setDraftConfig((p: any) => ({ ...p, phone: e.target.value }))} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
                <div><label className="text-[10px] text-slate-500 font-mono uppercase">Email</label><input type="text" value={draftConfig.email || ''} onChange={e => setDraftConfig((p: any) => ({ ...p, email: e.target.value }))} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
                <div><label className="text-[10px] text-slate-500 font-mono uppercase">Horario</label><input type="text" value={draftConfig.hours || ''} onChange={e => setDraftConfig((p: any) => ({ ...p, hours: e.target.value }))} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
                <div><label className="text-[10px] text-slate-500 font-mono uppercase">WhatsApp</label><input type="text" value={draftConfig.whatsapp || ''} onChange={e => setDraftConfig((p: any) => ({ ...p, whatsapp: e.target.value }))} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
                <div><label className="text-[10px] text-slate-500 font-mono uppercase">Facebook</label><input type="text" value={draftConfig.facebook || ''} onChange={e => setDraftConfig((p: any) => ({ ...p, facebook: e.target.value }))} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
                <div><label className="text-[10px] text-slate-500 font-mono uppercase">Instagram</label><input type="text" value={draftConfig.instagram || ''} onChange={e => setDraftConfig((p: any) => ({ ...p, instagram: e.target.value }))} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
                <div><label className="text-[10px] text-slate-500 font-mono uppercase">TikTok</label><input type="text" value={draftConfig.tiktok || ''} onChange={e => setDraftConfig((p: any) => ({ ...p, tiktok: e.target.value }))} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
                <div><label className="text-[10px] text-slate-500 font-mono uppercase">YouTube</label><input type="text" value={draftConfig.youtube || ''} onChange={e => setDraftConfig((p: any) => ({ ...p, youtube: e.target.value }))} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
                <div><label className="text-[10px] text-slate-500 font-mono uppercase">Twitter / X</label><input type="text" value={draftConfig.twitter || ''} onChange={e => setDraftConfig((p: any) => ({ ...p, twitter: e.target.value }))} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
                <div><label className="text-[10px] text-slate-500 font-mono uppercase">LinkedIn</label><input type="text" value={draftConfig.linkedin || ''} onChange={e => setDraftConfig((p: any) => ({ ...p, linkedin: e.target.value }))} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                  <input type="checkbox" checked={draftConfig.cartEnabled !== false} onChange={e => setDraftConfig((p: any) => ({ ...p, cartEnabled: e.target.checked }))} className="h-4 w-4 bg-[#181a20] border-[#2d3444] rounded" />
                  Carrito de compras habilitado
                </label>
                <span className="text-[10px] text-slate-500">(Si desactivas, solo se mostrará Consultar por WhatsApp)</span>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                  <input type="checkbox" checked={draftConfig.showOffersButton !== false} onChange={e => setDraftConfig((p: any) => ({ ...p, showOffersButton: e.target.checked }))} className="h-4 w-4 bg-[#181a20] border-[#2d3444] rounded" />
                  Mostrar botón "Ofertas" en la tienda
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 font-mono uppercase">Productos en la página principal</label>
                  <select value={Number(draftConfig.maxHomeProducts) || 0} onChange={e => setDraftConfig((p: any) => ({ ...p, maxHomeProducts: Number(e.target.value) }))} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none">
                    <option value={0}>Todos</option>
                    <option value={8}>8</option>
                    <option value={12}>12</option>
                    <option value={16}>16</option>
                    <option value={24}>24</option>
                    <option value={32}>32</option>
                    <option value={48}>48</option>
                  </select>
                  <span className="text-[10px] text-slate-500">(La búsqueda y las categorías muestran todo)</span>
                </div>
              </div>
              <button onClick={saveDraft} className="bg-[#A63A42] text-[#0c0d10] rounded-lg py-1.5 px-4 text-xs font-bold hover:brightness-110 transition-all cursor-pointer">Guardar Cambios</button>
            </div>
        )}

        {activeSection === 'popup' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Popup Promocional</h3>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={draftConfig.popupActive || false} onChange={e => setDraftConfig((p: any) => ({ ...p, popupActive: e.target.checked }))} className="h-4 w-4 bg-[#181a20] border-[#2d3444] rounded" />Activo</label>
              <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={draftConfig.popupAlways || false} onChange={e => setDraftConfig((p: any) => ({ ...p, popupAlways: e.target.checked }))} className="h-4 w-4 bg-[#181a20] border-[#2d3444] rounded" />Mostrar siempre</label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[10px] text-slate-500 font-mono uppercase">Duración (seg)</label><input type="number" value={draftConfig.popupDuration || 5} onChange={e => setDraftConfig((p: any) => ({ ...p, popupDuration: parseInt(e.target.value) || 5 }))} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
              <div><label className="text-[10px] text-slate-500 font-mono uppercase">Delay (seg)</label><input type="number" value={draftConfig.popupDelay || 2} onChange={e => setDraftConfig((p: any) => ({ ...p, popupDelay: parseInt(e.target.value) || 2 }))} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
            </div>
            <div><label className="text-[10px] text-slate-500 font-mono uppercase">Texto</label><textarea rows={2} value={draftConfig.popupText || ''} onChange={e => setDraftConfig((p: any) => ({ ...p, popupText: e.target.value }))} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
            <div>
              <label className="text-[10px] text-slate-500 font-mono uppercase">Imagen</label>
              <div className="relative border-2 border-dashed border-[#2d3444] rounded-lg p-3 mt-1 text-center cursor-pointer hover:border-[#A63A42] transition-colors"
                onClick={() => { const inp = document.getElementById('popup-file-input') as HTMLInputElement; inp?.click(); }}
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-[#A63A42]'); }}
                onDragLeave={e => { e.currentTarget.classList.remove('border-[#A63A42]'); }}
                onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('border-[#A63A42]'); const f = e.dataTransfer.files[0]; if (f && f.type.startsWith('image/')) { const r = new FileReader(); r.onload = (ev) => setDraftConfig((p: any) => ({ ...p, popupImage: ev.target?.result as string })); r.readAsDataURL(f); } }}
              >
                <input id="popup-file-input" type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f && f.type.startsWith('image/')) { const r = new FileReader(); r.onload = (ev) => setDraftConfig((p: any) => ({ ...p, popupImage: ev.target?.result as string })); r.readAsDataURL(f); } }} />
                {draftConfig.popupImage ? (
                  <img src={draftConfig.popupImage.startsWith('data:') || draftConfig.popupImage.startsWith('http') ? draftConfig.popupImage : imgSrc(draftConfig.popupImage)} alt="" className="max-h-24 mx-auto rounded object-contain" />
                ) : (
                  <div className="text-slate-500 text-xs py-3"><Image size={20} className="mx-auto mb-1 opacity-50" />Arrastrá imagen o hacé clic</div>
                )}
              </div>
              <input type="text" value={draftConfig.popupImage && !draftConfig.popupImage.startsWith('data:') ? draftConfig.popupImage : ''} onChange={e => setDraftConfig((p: any) => ({ ...p, popupImage: e.target.value }))} placeholder="O URL externa" className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white mt-2 focus:outline-none" />
            </div>
            <button onClick={saveDraft} className="bg-[#A63A42] text-[#0c0d10] rounded-lg py-1.5 px-4 text-xs font-bold hover:brightness-110 transition-all cursor-pointer">Guardar Cambios</button>
          </div>
        )}

        {activeSection === 'banners' && (
          <div className="space-y-4 max-w-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Carrusel de Banners</h3>
              <button onClick={() => { setDraftBanners((p: any[]) => [...p, { image: '', title: '', link: '', description: '' }]); }} className="bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg py-1.5 px-3 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"><Plus size={13} />Agregar</button>
            </div>
            {draftBanners.length === 0 ? <p className="text-xs text-slate-500 italic">Sin banners configurados.</p> : draftBanners.map((b: any, i: number) => (
              <div key={i} className="bg-[#0d0e12] border border-[#1f242e] rounded-lg p-4 space-y-2">
                <div className="flex justify-between items-center"><span className="text-[10px] text-slate-500 font-mono uppercase">Banner #{i + 1}</span><button onClick={() => { setDraftBanners((p: any[]) => { const bs = [...p]; bs.splice(i, 1); return bs; }); }} className="text-red-400 hover:text-red-300 cursor-pointer"><Trash2 size={12} /></button></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-[10px] text-slate-500 font-mono">Título</label><input type="text" value={b.title || ''} onChange={e => setDraftBanners((p: any[]) => { const bs = [...p]; bs[i] = { ...bs[i], title: e.target.value }; return bs; })} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
                  <div><label className="text-[10px] text-slate-500 font-mono">Link</label><input type="text" value={b.link || ''} onChange={e => setDraftBanners((p: any[]) => { const bs = [...p]; bs[i] = { ...bs[i], link: e.target.value }; return bs; })} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 font-mono">Imagen</label>
                  <div className="relative border-2 border-dashed border-[#2d3444] rounded-lg p-2 mt-1 text-center cursor-pointer hover:border-[#A63A42] transition-colors"
                    onClick={() => { const inp = document.getElementById('banner-file-' + i) as HTMLInputElement; inp?.click(); }}
                    onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-[#A63A42]'); }}
                    onDragLeave={e => { e.currentTarget.classList.remove('border-[#A63A42]'); }}
                    onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('border-[#A63A42]'); const f = e.dataTransfer.files[0]; if (f && f.type.startsWith('image/')) { const r = new FileReader(); r.onload = (ev) => { setDraftBanners((p: any[]) => { const bs = [...p]; bs[i] = { ...bs[i], image: ev.target?.result as string }; return bs; }); }; r.readAsDataURL(f); } }}
                  >
                    <input id={'banner-file-' + i} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f && f.type.startsWith('image/')) { const r = new FileReader(); r.onload = (ev) => { setDraftBanners((p: any[]) => { const bs = [...p]; bs[i] = { ...bs[i], image: ev.target?.result as string }; return bs; }); }; r.readAsDataURL(f); } }} />
                    {b.image ? (
                      <img src={b.image.startsWith('data:') || b.image.startsWith('http') ? b.image : imgSrc(b.image)} alt="" className="max-h-16 mx-auto rounded object-contain" />
                    ) : (
                      <div className="text-slate-500 text-[10px] py-2"><Image size={16} className="mx-auto mb-1 opacity-50" />Arrastrá o clic</div>
                    )}
                  </div>
                  <input type="text" value={b.image && !b.image.startsWith('data:') ? b.image : ''} onChange={e => setDraftBanners((p: any[]) => { const bs = [...p]; bs[i] = { ...bs[i], image: e.target.value }; return bs; })} placeholder="O URL externa" className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white mt-1 focus:outline-none" />
                </div>
                <div><label className="text-[10px] text-slate-500 font-mono">Descripción</label><input type="text" value={b.description || ''} onChange={e => setDraftBanners((p: any[]) => { const bs = [...p]; bs[i] = { ...bs[i], description: e.target.value }; return bs; })} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
              </div>
            ))}
            <button onClick={saveDraft} className="bg-[#A63A42] text-[#0c0d10] rounded-lg py-1.5 px-4 text-xs font-bold hover:brightness-110 transition-all cursor-pointer">Guardar Cambios</button>
          </div>
        )}

        {activeSection === 'categorias' && (
          <div className="space-y-4 max-w-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Categorías</h3>
            </div>
            <p className="text-[10px] text-slate-500">Subí una foto para cada categoría. Si no tiene foto propia, la tienda usa la de un producto o una imagen genérica.</p>
            <div className="flex gap-2">
              <input type="text" id="new-cat-input" placeholder="Nueva categoría..." className="flex-1 bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white placeholder-slate-500 focus:outline-none" />
              <button onClick={() => { const inp = document.getElementById('new-cat-input') as HTMLInputElement; if (!inp.value.trim()) return; updateFull({ ...webData, config: { ...config, ...draftConfig, banners: draftBanners }, categories: [...categories, { id: Date.now().toString(), name: inp.value.trim() }] }); inp.value = ''; }} className="bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg py-1.5 px-3 text-xs font-bold transition-all cursor-pointer"><Plus size={13} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {categories.map((c: any) => {
                const count = (products || []).filter(p => p.category === c.name).length;
                const img = catImg(c.name);
                return (
                  <div key={c.id} className="bg-[#181a20] border border-[#2d3444] rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white font-semibold">{c.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono">({count})</span>
                    </div>
                    <div className="relative border-2 border-dashed border-[#2d3444] rounded-lg p-1 text-center cursor-pointer hover:border-[#A63A42] transition-colors"
                      onClick={() => { const inp = document.getElementById('cat-file-' + c.id) as HTMLInputElement; inp?.click(); }}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-[#A63A42]'); }}
                      onDragLeave={e => { e.currentTarget.classList.remove('border-[#A63A42]'); }}
                      onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('border-[#A63A42]'); const f = e.dataTransfer.files[0]; if (f && f.type.startsWith('image/')) { const r = new FileReader(); r.onload = (ev) => setCatImage(c.name, ev.target?.result as string); r.readAsDataURL(f); } }}
                    >
                      <input id={'cat-file-' + c.id} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f && f.type.startsWith('image/')) { const r = new FileReader(); r.onload = (ev) => setCatImage(c.name, ev.target?.result as string); r.readAsDataURL(f); } }} />
                      {img ? (
                        <img src={img.startsWith('data:') || img.startsWith('http') ? img : imgSrc(img)} alt="" className="h-20 w-full object-cover rounded" />
                      ) : (
                        <div className="text-slate-500 text-[10px] py-6"><Image size={18} className="mx-auto mb-1 opacity-50" />Subir foto</div>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <input type="text" value={img && !img.startsWith('data:') ? img : ''} onChange={e => setCatImage(c.name, e.target.value)} placeholder="O URL externa" className="flex-1 bg-[#0d0e12] border border-[#2d3444] rounded-lg py-1 px-2 text-[10px] text-white placeholder-slate-600 focus:outline-none" />
                      {img && <button onClick={() => clearCatImage(c.name)} className="text-red-400 hover:text-red-300 cursor-pointer" title="Quitar foto"><Trash2 size={12} /></button>}
                    </div>
                    <button onClick={async () => {
                      if (count > 0 && !window.confirm(`Hay ${count} producto(s) con la categoría "${c.name}". Se reasignarán a "General". ¿Eliminar de todas formas?`)) return;
                      if (count > 0) {
                        for (const p of (products || []).filter(p => p.category === c.name)) {
                          try { await fetch(`/api/products/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: 'General' }) }); } catch {}
                        }
                      }
                      clearCatImage(c.name);
                      updateFull({ ...webData, config: { ...config, ...draftConfig, banners: draftBanners }, categories: categories.filter((x: any) => x.id !== c.id) });
                    }} className="text-[10px] text-slate-500 hover:text-red-400 cursor-pointer flex items-center gap-1"><Trash2 size={11} />Eliminar categoría</button>
                  </div>
                );
              })}
            </div>
            <button onClick={saveDraft} className="bg-[#A63A42] text-[#0c0d10] rounded-lg py-1.5 px-4 text-xs font-bold hover:brightness-110 transition-all cursor-pointer">Guardar Cambios</button>
            {categories.length > 0 && (
              <p className="text-[10px] text-slate-500">{products?.length || 0} producto(s) en total</p>
            )}
          </div>
        )}

        {activeSection === 'maestros' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Maestros — Numeración de Pedidos</h3>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Los pedidos nuevos se numerarán de forma <strong className="text-white">correlativa y ascendente</strong> a partir del número inicial que definas: PED-000001, PED-000002, PED-000003... Solo afecta a los pedidos nuevos; los existentes no se re-numeran.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500 font-mono uppercase">Número inicial de pedidos</label>
                <input
                  type="number"
                  min={1}
                  value={draftConfig.orderStartNumber ?? 1}
                  onChange={e => setDraftConfig((p: any) => ({ ...p, orderStartNumber: Math.max(1, parseInt(e.target.value) || 1) }))}
                  className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none"
                />
                <span className="text-[10px] text-slate-500">Ej: 1 → PED-000001 · 1000 → PED-001000</span>
              </div>
            </div>
            <button onClick={saveDraft} className="bg-[#A63A42] text-[#0c0d10] rounded-lg py-1.5 px-4 text-xs font-bold hover:brightness-110 transition-all cursor-pointer">Guardar Cambios</button>
          </div>
        )}
      </div>
    </div>
  );
}
