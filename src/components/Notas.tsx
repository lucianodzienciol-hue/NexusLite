import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Search, StickyNote, Folder, Tag, Calendar, Save } from 'lucide-react';
import { Note } from '../types';

interface NotasProps {
  onRefresh: () => void;
}

const CATEGORIES = ['General', 'Idea', 'Tarea', 'Recordatorio', 'Cliente', 'Proveedor', 'Inventario', 'Otro'];

export default function Notas({ onRefresh }: NotasProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState('General');

  const loadData = async () => {
    try {
      const r = await fetch('/api/notes');
      if (r.ok) setNotes(await r.json());
    } catch {}
  };

  useEffect(() => { loadData(); }, []);

  const categories = [...new Set(notes.map(n => n.category || 'General').concat(CATEGORIES))].sort();

  const filtered = notes.filter(n => {
    const matchSearch = !search ||
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content.toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCat || n.category === filterCat;
    return matchSearch && matchCat;
  });

  const resetForm = () => {
    setFormTitle('');
    setFormContent('');
    setFormCategory('General');
    setEditingId(null);
    setFormOpen(false);
  };

  const handleEditClick = (note: Note) => {
    setEditingId(note.id);
    setFormTitle(note.title);
    setFormContent(note.content);
    setFormCategory(note.category || 'General');
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) { alert('El título es obligatorio.'); return; }
    const payload = { title: formTitle.trim(), content: formContent.trim(), category: formCategory };
    const url = editingId ? `/api/notes/${editingId}` : '/api/notes';
    const method = editingId ? 'PUT' : 'POST';
    try {
      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        await loadData();
        onRefresh();
        resetForm();
      } else {
        alert('Error al guardar la nota.');
      }
    } catch {
      alert('Error de red al guardar.');
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`¿Eliminar "${title}" definitivamente?`)) return;
    try {
      const resp = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
      if (resp.ok) { await loadData(); onRefresh(); }
      else alert('Error al eliminar.');
    } catch { alert('Error de red.'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#111318] border border-[#1f242e] rounded-xl p-6">
        <div>
          <h1 className="text-xl font-bold font-display text-white">Notas y Apuntes</h1>
          <p className="text-xs text-slate-400 mt-1">Creá notas rápidas, ideas, tareas o recordatorios.</p>
        </div>
        <button
          onClick={() => { resetForm(); setFormOpen(true); }}
          className="bg-[#A63A42] hover:bg-[#872A32] text-slate-900 font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
        >
          <Plus size={14} />
          Nueva Nota
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative w-full sm:w-64">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
            <Search size={14} />
          </span>
          <input
            type="text"
            className="w-full bg-[#111318] border border-[#1f242e] rounded-lg py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none"
            placeholder="Buscar en notas..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Folder size={13} className="text-slate-500" />
          <button
            onClick={() => setFilterCat('')}
            className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${!filterCat ? 'bg-[#A63A42] text-slate-950' : 'bg-[#1f242e] text-slate-400 hover:text-white'}`}
          >
            Todas
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCat(cat)}
              className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${filterCat === cat ? 'bg-[#A63A42] text-slate-950' : 'bg-[#1f242e] text-slate-400 hover:text-white'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map(note => (
          <div
            key={note.id}
            className="bg-[#111318] border border-[#1f242e] rounded-xl p-4 hover:border-[#2d3444] transition-all group flex flex-col"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#1f242e] text-slate-400 uppercase flex items-center gap-1">
                <Tag size={10} />
                {note.category || 'General'}
              </span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleEditClick(note)}
                  className="p-1 rounded text-slate-500 hover:text-[#A63A42] hover:bg-[#1f242e] transition-all cursor-pointer"
                >
                  <Edit2 size={12} />
                </button>
                <button
                  onClick={() => handleDelete(note.id, note.title)}
                  className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-[#251012] transition-all cursor-pointer"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
            <h3 className="text-sm font-semibold text-white mb-1.5 leading-tight">{note.title}</h3>
            <p className="text-[11px] text-slate-400 leading-relaxed flex-1 whitespace-pre-wrap line-clamp-4">
              {note.content || '—'}
            </p>
            <div className="flex items-center gap-1 mt-3 text-[10px] text-slate-500 font-mono">
              <Calendar size={10} />
              {note.date?.slice(0, 10)}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-500 text-xs">
            <StickyNote size={32} className="mx-auto mb-3 opacity-30" />
            {search || filterCat ? 'No se encontraron notas.' : 'No hay notas todavía. Creá la primera.'}
          </div>
        )}
      </div>

      {formOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setFormOpen(false)}>
          <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-6 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <StickyNote size={16} className="text-[#A63A42]" />
                {editingId ? 'Editar Nota' : 'Nueva Nota'}
              </h3>
              <button onClick={resetForm} className="text-slate-500 hover:text-white text-xs cursor-pointer">
                Cancelar
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-400 block">Título *</label>
                <input
                  type="text"
                  required
                  placeholder="Título de la nota..."
                  className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg p-2 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 block">Contenido</label>
                <textarea
                  rows={6}
                  placeholder="Escribí lo que quieras guardar..."
                  className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg p-2 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  value={formContent}
                  onChange={e => setFormContent(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 block flex items-center gap-1">
                  <Folder size={12} /> Categoría
                </label>
                <div className="flex gap-2 flex-wrap">
                  {CATEGORIES.map(cat => (
                    <button
                      type="button"
                      key={cat}
                      onClick={() => setFormCategory(cat)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                        formCategory === cat
                          ? 'bg-[#A63A42] text-slate-950'
                          : 'bg-[#1f242e] text-slate-400 hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white font-bold transition-all shadow cursor-pointer text-center flex items-center justify-center gap-1.5"
              >
                <Save size={13} />
                {editingId ? 'GUARDAR CAMBIOS' : 'CREAR NOTA'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
