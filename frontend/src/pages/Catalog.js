import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import api, { fmtErr } from "../lib/api";
import { PageHeader } from "../components/ui-bits";

const TABS = [
  { id: "flavors", label: "Flavors", showServings: false },
  { id: "cake-types", label: "Cake Types", showServings: false },
  { id: "cake-sizes", label: "Cake Sizes", showServings: true },
  { id: "design-categories", label: "Design Categories", showServings: false },
  { id: "fillings", label: "Fillings", showServings: false },
  { id: "frostings", label: "Frostings", showServings: false },
];

export default function Catalog({ tab }) {
  const [active, setActive] = useState(tab || "flavors");
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", description: "", notes: "", servings: "", active: true });

  useEffect(() => setActive(tab || "flavors"), [tab]);

  const load = useCallback(() => {
    api.get(`/catalog/${active}`).then((r) => setItems(r.data)).catch(() => {});
  }, [active]);
  useEffect(load, [load]);

  const openNew = () => {
    setForm({ name: "", description: "", notes: "", servings: "", active: true });
    setEditing("new");
  };
  const openEdit = (item) => {
    setForm({ name: item.name, description: item.description || "", notes: item.notes || "", servings: item.servings || "", active: item.active });
    setEditing(item);
  };
  const save = async (e) => {
    e.preventDefault();
    try {
      if (editing === "new") await api.post(`/catalog/${active}`, form);
      else await api.put(`/catalog/${active}/${editing.id}`, form);
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(fmtErr(err));
    }
  };
  const remove = async (item) => {
    try {
      await api.delete(`/catalog/${active}/${item.id}`);
      toast.success("Removed");
      load();
    } catch (err) {
      toast.error(fmtErr(err));
    }
  };
  const toggleActive = async (item) => {
    await api.put(`/catalog/${active}/${item.id}`, { ...item, active: !item.active }).catch((e) => toast.error(fmtErr(e)));
    load();
  };

  const tabDef = TABS.find((t) => t.id === active);

  return (
    <div data-testid="catalog-page">
      <PageHeader eyebrow="Cake Catalog" title="Flavors, Types & Sizes" testid="catalog-header">
        <button onClick={openNew} className="pq-btn-primary" data-testid="catalog-add-btn"><Plus size={15} /> Add {tabDef.label.slice(0, -1) || "Item"}</button>
      </PageHeader>

      <div className="flex gap-2 mb-6 border-b border-[#EDE5DE]" data-testid="catalog-tabs">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setActive(t.id)} data-testid={`catalog-tab-${t.id}`}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${active === t.id ? "border-[#2B1B17] text-[#2B1B17]" : "border-transparent text-[#78665E] hover:text-[#2B1B17]"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {!items ? (
        <div className="pq-card h-64 animate-pulse" />
      ) : items.length === 0 ? (
        <div className="pq-card p-10 text-center text-sm text-[#B9ABA2]" data-testid="catalog-empty">No {tabDef.label.toLowerCase()} yet.</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="catalog-grid">
          {items.map((item) => (
            <div key={item.id} className={`pq-card p-5 ${!item.active ? "opacity-55" : ""}`} data-testid={`catalog-item-${item.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-serif text-lg text-[#2B1B17]">{item.name}</p>
                  {item.servings && <p className="text-xs text-[#78665E]">{item.servings}</p>}
                  {item.description && <p className="text-xs text-[#78665E] mt-1">{item.description}</p>}
                  {item.notes && <p className="text-[11px] text-[#B9ABA2] mt-1 italic">{item.notes}</p>}
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${item.active ? "text-[#2E5A2A]" : "text-[#9E2A2B]"}`}>
                  {item.active ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => openEdit(item)} className="pq-btn-outline !py-1.5 !px-3 text-xs" data-testid={`catalog-edit-${item.id}`}><Pencil size={12} /> Edit</button>
                <button onClick={() => toggleActive(item)} className="pq-btn-outline !py-1.5 !px-3 text-xs" data-testid={`catalog-toggle-${item.id}`}>{item.active ? "Deactivate" : "Activate"}</button>
                <button onClick={() => remove(item)} className="pq-btn-outline !py-1.5 !px-3 text-xs !text-[#9E2A2B]" data-testid={`catalog-delete-${item.id}`}><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="catalog-dialog">
          <div className="absolute inset-0 bg-[#2B1B17]/40" onClick={() => setEditing(null)} />
          <form onSubmit={save} className="relative pq-card p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-xl text-[#2B1B17]">{editing === "new" ? "Add" : "Edit"} {tabDef.label.slice(0, -1)}</h3>
              <button type="button" onClick={() => setEditing(null)} className="text-[#78665E]"><X size={18} /></button>
            </div>
            <div><label className="pq-label">Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="pq-input" data-testid="catalog-name-input" /></div>
            {tabDef.showServings && (
              <div><label className="pq-label">Servings</label><input value={form.servings} onChange={(e) => setForm({ ...form, servings: e.target.value })} className="pq-input" placeholder="e.g. 15–20 servings" data-testid="catalog-servings-input" /></div>
            )}
            <div><label className="pq-label">Description</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="pq-input" data-testid="catalog-description-input" /></div>
            <div><label className="pq-label">Internal notes</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="pq-input" data-testid="catalog-notes-input" /></div>
            <button type="submit" className="pq-btn-primary w-full" data-testid="catalog-save-btn">Save</button>
          </form>
        </div>
      )}
    </div>
  );
}
