import React, { useState, useRef, useMemo, useCallback } from 'react';
import { Plus, Edit2, Trash2, Search, Download, Layers, X, Image, Percent, Upload } from 'lucide-react';
import { Product } from '../types';

interface ArticulosProps {
  products: Product[];
  categories: { id: string; name: string }[];
  onRefresh: () => void;
}

const Articulos = React.memo(function Articulos({ products, categories, onRefresh }: ArticulosProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 150);
  }, []);

  const filtered = useMemo(() =>
    products.filter(p =>
      p.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      p.code.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      p.category.toLowerCase().includes(debouncedSearch.toLowerCase())
    ),
    [products, debouncedSearch]
  );

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [stock, setStock] = useState('');
  const [category, setCategory] = useState('');
  const [desc, setDesc] = useState('');
  const [image, setImage] = useState('');
  const [oferta, setOferta] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const [webDesc, setWebDesc] = useState('');
  const [ofertaPrice, setOfertaPrice] = useState('');
  const [fichaTecnica, setFichaTecnica] = useState('');
  const [fichaTecnicaFile, setFichaTecnicaFile] = useState('');
  const [webVisible, setWebVisible] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [customCat, setCustomCat] = useState(false);
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false);
  const [bulkPercentage, setBulkPercentage] = useState('');
  const [bulkApplying, setBulkApplying] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importData, setImportData] = useState('');
  const [importPrices, setImportPrices] = useState('');
  const [importCat, setImportCat] = useState('');
  const [importWeb, setImportWeb] = useState(false);
  const [importingBulk, setImportingBulk] = useState(false);

  const handleBulkPriceUpdate = async () => {
    const pct = parseFloat(bulkPercentage);
    if (isNaN(pct) || !bulkPercentage.trim()) {
      alert('Ingrese un porcentaje válido.');
      return;
    }
    const sign = pct >= 0 ? '+' : '';
    if (!confirm(`¿Aplicar ${sign}${pct}% a los precios de ${products.length} artículos?\nLos precios resultantes se ajustarán entre $500 y $1000.`)) return;
    setBulkApplying(true);
    try {
      const resp = await fetch('/api/products/bulk-price-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ percentage: pct }),
      });
      const data = await resp.json();
      if (data.success) {
        alert(`Precios actualizados: ${data.count} artículos modificados.`);
        onRefresh();
        setBulkPriceOpen(false);
        setBulkPercentage('');
      } else {
        alert('Error: ' + (data.error || 'desconocido'));
      }
    } catch {
      alert('Error de red al aplicar ajuste masivo.');
    } finally {
      setBulkApplying(false);
    }
  };

  const handleImportFromWeb = async () => {
    setImporting(true);
    try {
      const resp = await fetch('/api/import-from-web', { method: 'POST' });
      const data = await resp.json();
      if (data.success) {
        alert(data.message || 'Importación completada');
        onRefresh();
      } else {
        alert('Error al importar: ' + (data.error || 'desconocido'));
      }
    } catch {
      alert('Error de red al importar. Verifique que el servidor Web-main esté corriendo en localhost:3000.');
    } finally {
      setImporting(false);
    }
  };

  const resetForm = () => {
    setCode('');
    setName('');
    setPrice('');
    setCost('');
    setStock('');
    setCategory('');
    setDesc('');
    setImage('');
    setOferta(false);
    setNuevo(false);
    setWebDesc('');
    setOfertaPrice('');
    setFichaTecnica('');
    setFichaTecnicaFile('');
    setWebVisible(false);
    setCustomCat(false);
    setEditingId(null);
    setFormOpen(false);
  };

  const openEditModal = (product: Product | null) => {
    if (product) {
      setEditingId(product.id);
      setCode(product.code);
      setName(product.name);
      setPrice(product.price.toString());
      setCost(product.cost.toString());
      setStock(product.stock.toString());
      setCategory(product.category);
      setDesc(product.desc || '');
      setImage(product.image || '');
      setOferta(product.oferta || false);
      setNuevo(product.nuevo || false);
      setWebDesc(product.webDesc || '');
      setOfertaPrice((product.ofertaPrice || 0).toString());
      setFichaTecnica(product.fichaTecnica || '');
      setFichaTecnicaFile(product.fichaTecnicaFile || '');
      setWebVisible(product.source === 'web');
      setCustomCat(!categories.some(c => c.name === product.category));
      setFormOpen(true);
    } else {
      resetForm();
      setFormOpen(true);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !code || !price) {
      alert('Por favor complete todos los campos obligatorios (*).');
      return;
    }

    const resolvedCat = customCat ? category : category;
    const payload: any = {
      code,
      name,
      price: parseFloat(price) || 0,
      cost: parseFloat(cost) || 0,
      stock: parseInt(stock) || 0,
      category: resolvedCat || 'General',
      desc,
      image,
      oferta,
      nuevo,
      source: webVisible ? 'web' : 'local',
      webDesc: webDesc || desc || '',
      ofertaPrice: parseFloat(ofertaPrice) || 0,
      fichaTecnica,
      fichaTecnicaFile,
    };

    const url = editingId ? `/api/products/${editingId}` : '/api/products';
    const method = editingId ? 'PUT' : 'POST';

    try {
      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        onRefresh();
        resetForm();
      } else {
        alert('Ocurrió un error al guardar el producto.');
      }
    } catch {
      alert('Error de red al guardar.');
    }
  };

  const handleDelete = async (id: string, productName: string) => {
    if (!confirm(`¿Está seguro de que desea eliminar permanentemente "${productName}"?`)) return;
    try {
      const resp = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      if (resp.ok) onRefresh();
      else alert('Ocurrió un error al eliminar el producto.');
    } catch {
      alert('Error de red al eliminar.');
    }
  };

  const handleFile = (file: File | null) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => setImage(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const categoryImages: Record<string, string> = {
    Tinto: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=400&h=400&fit=crop',
    Blanco: 'https://images.unsplash.com/photo-1558001373-7b93ee48ffa0?w=400&h=400&fit=crop',
    Rosado: 'https://images.unsplash.com/photo-1541971897566-308cf7ad0934?w=400&h=400&fit=crop',
    Espumante: 'https://images.unsplash.com/photo-1528823872057-9c018a7a7553?w=400&h=400&fit=crop',
  };

  const imgSrc = (path: string, category?: string) => {
    if (!path) return category ? (categoryImages[category] || '') : '';
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) return path;
    const clean = path.replace(/^\//, '');
    if (clean.startsWith('web/')) return '/' + clean;
    return '/web/' + clean;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#111318] border border-[#1f242e] rounded-xl p-6">
        <div>
          <h1 className="text-xl font-bold font-display text-white">Administración de Artículos (Inventario)</h1>
          <p className="text-xs text-slate-400 mt-1">Agregue, edite, audite stock y elimine productos de su catálogo.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setBulkPriceOpen(true)} className="bg-amber-700 hover:bg-amber-600 text-white font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md">
            <Percent size={14} />
            Ajuste Masivo de Precios
          </button>
          <button onClick={handleImportFromWeb} disabled={importing} className="bg-emerald-700 hover:bg-emerald-600 text-white font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
            <Download size={14} className={importing ? 'animate-spin' : ''} />
            {importing ? 'Importando...' : 'Importar desde Web'}
          </button>
          <button onClick={() => setImportOpen(true)} className="bg-purple-700 hover:bg-purple-600 text-white font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md">
            <Upload size={14} />
            Importar Artículos
          </button>
          <button onClick={() => openEditModal(null)} className="bg-[#A63A42] hover:bg-[#872A32] text-slate-900 font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md">
            <Plus size={14} />
            Nuevo Artículo
          </button>
        </div>
      </div>

      <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div className="relative w-full sm:w-72">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500"><Search size={14} /></span>
            <input type="text" className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none" placeholder="Buscar por código, nombre o categoría..." value={search} onChange={e => handleSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
            <Layers size={14} />
            <span>Artículos Totales: {products.length}</span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-[#1b1e26] bg-[#0d0e12]">
          {filtered.length === 0 ? (
            <div className="p-12 text-slate-500 italic text-center text-xs">No se encontraron artículos que coincidan con la búsqueda.</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#181a20] border-b border-[#2d3444] text-[10px] tracking-wider text-slate-400 font-mono uppercase">
                  <th className="py-3 px-4 w-16 text-center">IMG</th>
                  <th className="py-3 px-4">DESCRIPCIÓN DEL ARTÍCULO</th>
                  <th className="py-3 px-4 w-32">CATEGORÍA</th>
                  <th className="py-3 px-4 text-right w-24">PRECIO VENT.</th>
                  <th className="py-3 px-4 text-center w-24">STOCK</th>
                  <th className="py-3 px-4 text-center w-20">WEB</th>
                  <th className="py-3 px-4 text-right w-24">ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const isLowStock = p.stock <= 5;
                  return (
                    <tr key={p.id} className="border-b border-[#1b1e26] hover:bg-[#14171e] text-xs transition-colors cursor-pointer" onDoubleClick={() => openEditModal(p)}>
                      <td className="py-3 px-4 text-center">
                        {(() => {
                          const src = imgSrc(p.image, p.category);
                          return src ? (
                            <img src={src} alt="" className="w-9 h-9 object-cover rounded mx-auto" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          ) : (
                            <span className="text-slate-600 text-[10px]">—</span>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-4 font-medium text-white flex items-center gap-1.5">
                        {p.name}
                        {p.oferta && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase bg-red-900/40 text-red-400 border border-red-700/50">OFERTA</span>}
                        {p.nuevo && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase bg-blue-900/40 text-blue-400 border border-blue-700/50">NUEVO</span>}
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${p.source === 'local' ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/50' : 'bg-blue-900/40 text-blue-400 border border-blue-700/50'}`}>
                          {p.source === 'local' ? 'Local' : 'Web'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        <span className="bg-[#1a1d24] border border-[#2d3444] rounded px-2 py-0.5 text-[10px]">{p.category}</span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-400 font-semibold">${p.price.toFixed(0)}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`font-mono font-semibold px-2 py-0.5 rounded ${isLowStock ? 'bg-red-950/40 text-red-400 border border-red-900/50' : 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/50'}`}>
                          {p.stock} u
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${p.source === 'web' ? 'bg-blue-900/40 text-blue-400 border border-blue-700/50' : 'bg-slate-800/40 text-slate-500 border border-slate-700/50'}`}>
                          {p.source === 'web' ? 'Sí' : 'No'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => openEditModal(p)} className="p-1 rounded text-slate-400 hover:text-[#A63A42] hover:bg-[#1f242e] transition-all"><Edit2 size={13} /></button>
                          <button onClick={() => handleDelete(p.id, p.name)} className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-[#251012] transition-all"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={resetForm}>
          <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">{editingId ? 'Editar Artículo' : 'Nuevo Artículo'}</h3>
              <button onClick={resetForm} className="text-slate-500 hover:text-white cursor-pointer"><X size={16} /></button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div
                className="relative border-2 border-dashed border-[#2d3444] rounded-lg p-3 text-center cursor-pointer hover:border-[#A63A42] transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-[#A63A42]'); }}
                onDragLeave={e => { e.currentTarget.classList.remove('border-[#A63A42]'); }}
                onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('border-[#A63A42]'); handleFile(e.dataTransfer.files[0]); }}
              >
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => handleFile(e.target.files?.[0] || null)} />
                {image ? (
                  <img src={image.startsWith('data:') || image.startsWith('http') ? image : imgSrc(image)} alt="" className="max-h-24 mx-auto rounded object-contain" />
                ) : (
                  <div className="text-slate-500 text-xs py-4"><Image size={20} className="mx-auto mb-1 opacity-50" />Arrastrá una imagen o hacé clic para subir</div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[10px] text-slate-500 font-mono uppercase">Código *</label><input type="text" required value={code} onChange={e => setCode(e.target.value)} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white placeholder-slate-600 focus:outline-none font-mono" placeholder="1003" /></div>
                <div><label className="text-[10px] text-slate-500 font-mono uppercase">Nombre *</label><input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white placeholder-slate-600 focus:outline-none" placeholder="Nombre del producto" /></div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-[10px] text-slate-500 font-mono uppercase">Costo ($)</label><input type="number" step="0.01" value={cost} onChange={e => setCost(e.target.value)} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none" /></div>
                <div><label className="text-[10px] text-slate-500 font-mono uppercase">Precio * ($)</label><input type="number" step="0.01" required value={price} onChange={e => setPrice(e.target.value)} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none" /></div>
                <div><label className="text-[10px] text-slate-500 font-mono uppercase">Stock</label><input type="number" value={stock} onChange={e => setStock(e.target.value)} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none" /></div>
              </div>

              <div><label className="text-[10px] text-slate-500 font-mono uppercase">Categoría</label>
                {customCat ? (
                  <div className="flex gap-2">
                    <input type="text" value={category} onChange={e => setCategory(e.target.value)} className="flex-1 bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" placeholder="Nueva categoría..." />
                    <button type="button" onClick={() => { setCustomCat(false); setCategory(''); }} className="text-[10px] text-[#A63A42] hover:text-white">Usar existente</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <select value={category} onChange={e => setCategory(e.target.value)} className="flex-1 bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none">
                      <option value="">Sin categoría</option>
                      {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    <button type="button" onClick={() => setCustomCat(true)} className="text-[10px] text-[#A63A42] hover:text-white whitespace-nowrap">Otra...</button>
                  </div>
                )}
              </div>

              <div><label className="text-[10px] text-slate-500 font-mono uppercase">Descripción</label><textarea rows={2} value={desc} onChange={e => setDesc(e.target.value)} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>

              <div className="border-t border-[#1f242e] pt-3">
                <label className="flex items-center gap-2 text-xs text-slate-400 mb-3">
                  <input type="checkbox" checked={webVisible} onChange={e => setWebVisible(e.target.checked)} className="h-4 w-4 bg-[#181a20] border-[#2d3444] rounded" />
                  Mostrar en la Web
                </label>

                {webVisible && (
                  <div className="space-y-3">
                    <div><label className="text-[10px] text-slate-500 font-mono uppercase">Descripción Web (adicional)</label><textarea rows={2} value={webDesc} onChange={e => setWebDesc(e.target.value)} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-[10px] text-slate-500 font-mono uppercase">Precio Oferta ($)</label><input type="number" step="0.01" value={ofertaPrice} onChange={e => setOfertaPrice(e.target.value)} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none" /></div>
                      <div><label className="text-[10px] text-slate-500 font-mono uppercase">URL Imagen</label><input type="text" value={image && !image.startsWith('data:') ? image : ''} onChange={e => setImage(e.target.value)} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" placeholder="O URL externa" /></div>
                    </div>
                    <div><label className="text-[10px] text-slate-500 font-mono uppercase">Ficha Técnica (URL)</label><input type="text" value={fichaTecnica} onChange={e => setFichaTecnica(e.target.value)} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
                    <div><label className="text-[10px] text-slate-500 font-mono uppercase">Archivo Ficha Técnica</label><input type="text" value={fichaTecnicaFile} onChange={e => setFichaTecnicaFile(e.target.value)} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={oferta} onChange={e => setOferta(e.target.checked)} className="h-4 w-4 bg-[#181a20] border-[#2d3444] rounded" />Oferta</label>
                      <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={nuevo} onChange={e => setNuevo(e.target.checked)} className="h-4 w-4 bg-[#181a20] border-[#2d3444] rounded" />Nuevo</label>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                {editingId && (
                  <button type="button" onClick={() => { if (!confirm(`¿Eliminar "${name}"?`)) return; handleDelete(editingId, name); }} className="bg-red-800 hover:bg-red-700 text-white rounded-lg py-1.5 px-4 text-xs font-bold transition-all cursor-pointer">Eliminar</button>
                )}
                <button type="button" onClick={resetForm} className="bg-[#181a20] border border-[#2d3444] text-slate-300 hover:text-white rounded-lg py-1.5 px-4 text-xs font-bold transition-all cursor-pointer">Cancelar</button>
                <button type="submit" className="bg-[#A63A42] text-[#0c0d10] rounded-lg py-1.5 px-4 text-xs font-bold transition-all cursor-pointer">{editingId ? 'GUARDAR' : 'CREAR'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {bulkPriceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setBulkPriceOpen(false); setBulkPercentage(''); }}>
          <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Ajuste Masivo de Precios</h3>
              <button onClick={() => { setBulkPriceOpen(false); setBulkPercentage(''); }} className="text-slate-500 hover:text-white cursor-pointer"><X size={16} /></button>
            </div>
            <div className="space-y-4 text-xs">
              <p className="text-slate-400">
                Ingrese un porcentaje para ajustar el precio de <strong className="text-white">{products.length}</strong> artículos.
                Los precios resultantes se ajustarán automáticamente entre <strong className="text-emerald-400">$500</strong> y <strong className="text-emerald-400">$1000</strong>.
              </p>
              <div>
                <label className="text-[10px] text-slate-500 font-mono uppercase block mb-1">Porcentaje (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={bulkPercentage}
                  onChange={e => setBulkPercentage(e.target.value)}
                  className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-2 px-3 text-sm text-white font-mono focus:outline-none"
                  placeholder="Ej: 10 para aumentar, -15 para reducir"
                  autoFocus
                />
              </div>
              <div className="bg-[#181a20] border border-[#2d3444] rounded-lg p-3 text-slate-400 text-[10px] leading-relaxed">
                <p><strong className="text-amber-400">Ejemplos:</strong></p>
                <p>• <span className="text-white">+10%</span> → precio actual × 1.10</p>
                <p>• <span className="text-white">-20%</span> → precio actual × 0.80</p>
                <p className="mt-1">Valores fuera de $500–$1000 se ajustan al límite más cercano.</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => { setBulkPriceOpen(false); setBulkPercentage(''); }} className="bg-[#181a20] border border-[#2d3444] text-slate-300 hover:text-white rounded-lg py-1.5 px-4 text-xs font-bold transition-all cursor-pointer">Cancelar</button>
                <button onClick={handleBulkPriceUpdate} disabled={bulkApplying} className="bg-amber-700 hover:bg-amber-600 text-white rounded-lg py-1.5 px-4 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
                  {bulkApplying && <span className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />}
                  {bulkApplying ? 'Aplicando...' : 'Aplicar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setImportOpen(false); setImportData(''); }}>
          <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-6 max-w-xl w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Importar Artículos</h3>
              <button onClick={() => { setImportOpen(false); setImportData(''); }} className="text-slate-500 hover:text-white cursor-pointer"><X size={16} /></button>
            </div>
            <div className="space-y-4 text-xs">
              <p className="text-slate-400">
                Copiá cada columna desde Excel/Sheets y pegalas en los recuadros de abajo.<br />
                Cada línea se corresponde por orden: 1er nombre con 1er precio, etc.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 font-mono uppercase block mb-1">Nombres</label>
                  <textarea
                    rows={10}
                    value={importData}
                    onChange={e => setImportData(e.target.value)}
                    className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-2 px-3 text-xs text-white font-mono focus:outline-none resize-none"
                    placeholder={'Malbec Reserva\nCabernet Sauvignon\nTorrontés\nChardonnay\nExtra Brut'}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 font-mono uppercase block mb-1">Precios</label>
                  <textarea
                    rows={10}
                    value={importPrices}
                    onChange={e => setImportPrices(e.target.value)}
                    className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-2 px-3 text-xs text-white font-mono focus:outline-none resize-none"
                    placeholder={'2500\n900\n130\n80\n90'}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 font-mono uppercase block mb-1">Categoría</label>
                  <select value={importCat} onChange={e => setImportCat(e.target.value)} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-2 px-3 text-xs text-white focus:outline-none">
                    <option value="">Sin categoría</option>
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-xs text-slate-400 pb-2">
                    <input type="checkbox" checked={importWeb} onChange={e => setImportWeb(e.target.checked)} className="h-4 w-4 bg-[#181a20] border-[#2d3444] rounded" />
                    Mostrar en la Web
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => { setImportOpen(false); setImportData(''); setImportPrices(''); }} className="bg-[#181a20] border border-[#2d3444] text-slate-300 hover:text-white rounded-lg py-1.5 px-4 text-xs font-bold transition-all cursor-pointer">Cancelar</button>
                <button
                  onClick={async () => {
                    const names = importData.split('\n').map(l => l.trim()).filter(Boolean);
                    const prices = importPrices.split('\n').map(l => l.trim()).filter(Boolean);
                    const count = Math.max(names.length, prices.length);
                    if (count === 0) { alert('Pegá al menos un nombre y un precio.'); return; }
                    setImportingBulk(true);
                    let ok = 0, err = 0;
                    for (let i = 0; i < count; i++) {
                      const name = names[i] || '';
                      let price = prices[i] || '';
                      price = price.replace(/[^0-9.,]/g, '').replace(',', '.');
                      if (!name || !price) { err++; continue; }
                      const code = 'IMP-' + Date.now().toString(36).toUpperCase() + '-' + String(Math.random()).slice(2, 6);
                      try {
                        const resp = await fetch('/api/products', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            code, name,
                            price: parseFloat(price) || 0,
                            cost: 0, stock: 0, category: importCat || 'General',
                            desc: '', image: '', oferta: false, nuevo: false,
                            source: importWeb ? 'web' : 'local',
                            webDesc: '', ofertaPrice: 0, fichaTecnica: '', fichaTecnicaFile: '',
                          }),
                        });
                        if (resp.ok) ok++; else err++;
                      } catch { err++; }
                    }
                    setImportingBulk(false);
                    setImportOpen(false);
                    setImportData('');
                    setImportPrices('');
                    if (ok > 0) { onRefresh(); }
                    alert(`Importación finalizada.\n✓ ${ok} artículos creados\n✗ ${err} errores`);
                  }}
                  disabled={importingBulk}
                  className="bg-purple-700 hover:bg-purple-600 text-white rounded-lg py-1.5 px-4 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {importingBulk && <span className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />}
                  {importingBulk ? 'Importando...' : `Importar ${importData.split('\n').filter(l => l.trim()).length || 0} artículos`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default Articulos;
