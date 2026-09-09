import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import api, { fmtErr } from "../lib/api";
import { EmptyState, PageHeader } from "../components/ui-bits";

export function ClientDialog({ initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial || {
    full_name: "", phone: "", whatsapp: "", email: "", address: "",
    preferred_contact: "Phone", notes: "", favorite_flavor: "", preferred_style: "",
    preferred_colors: "", special_preferences: "", important_notes: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim()) return toast.error("Client name is required");
    setSaving(true);
    try {
      const res = initial?.id
        ? await api.put(`/clients/${initial.id}`, form)
        : await api.post("/clients", form);
      toast.success(initial?.id ? "Client updated" : "Client added");
      onSaved(res.data);
      onClose();
    } catch (err) {
      toast.error(fmtErr(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="client-dialog">
      <div className="absolute inset-0 bg-[#2B1B17]/40" onClick={onClose} />
      <form onSubmit={submit} className="relative pq-card p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-serif text-xl text-[#2B1B17]">{initial?.id ? "Edit Client" : "New Client"}</h3>
          <button type="button" onClick={onClose} className="text-[#78665E]" data-testid="client-dialog-close"><X size={18} /></button>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="pq-label">Full name *</label><input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} className="pq-input" data-testid="client-name-input" /></div>
          <div><label className="pq-label">Phone</label><input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="pq-input" data-testid="client-phone-input" /></div>
          <div><label className="pq-label">WhatsApp</label><input value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} className="pq-input" data-testid="client-whatsapp-input" /></div>
          <div><label className="pq-label">Email</label><input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="pq-input" data-testid="client-email-input" /></div>
          <div><label className="pq-label">Address / location</label><input value={form.address} onChange={(e) => set("address", e.target.value)} className="pq-input" data-testid="client-address-input" /></div>
          <div><label className="pq-label">Preferred contact</label>
            <select value={form.preferred_contact} onChange={(e) => set("preferred_contact", e.target.value)} className="pq-input" data-testid="client-preferred-contact">
              {["Phone", "WhatsApp", "Email"].map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <p className="pq-eyebrow mt-6 mb-3">Client Preferences</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="pq-label">Favorite flavor</label><input value={form.favorite_flavor} onChange={(e) => set("favorite_flavor", e.target.value)} className="pq-input" data-testid="client-favorite-flavor" /></div>
          <div><label className="pq-label">Preferred cake style</label><input value={form.preferred_style} onChange={(e) => set("preferred_style", e.target.value)} className="pq-input" data-testid="client-preferred-style" /></div>
          <div><label className="pq-label">Preferred colors</label><input value={form.preferred_colors} onChange={(e) => set("preferred_colors", e.target.value)} className="pq-input" data-testid="client-preferred-colors" /></div>
          <div><label className="pq-label">Special preferences</label><input value={form.special_preferences} onChange={(e) => set("special_preferences", e.target.value)} className="pq-input" data-testid="client-special-preferences" /></div>
          <div className="sm:col-span-2"><label className="pq-label">Important notes</label><textarea value={form.important_notes} onChange={(e) => set("important_notes", e.target.value)} className="pq-input" rows={2} data-testid="client-important-notes" /></div>
          <div className="sm:col-span-2"><label className="pq-label">Internal notes</label><textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className="pq-input" rows={2} data-testid="client-notes" /></div>
        </div>
        <button type="submit" disabled={saving} className="pq-btn-primary w-full mt-6" data-testid="client-save-btn">
          {saving ? "Saving…" : initial?.id ? "Save changes" : "Add Client"}
        </button>
      </form>
    </div>
  );
}

export default function Clients() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [showNew, setShowNew] = useState(params.get("new") === "1");
  const navigate = useNavigate();
  const q = params.get("q") || "";
  const filter = params.get("filter") || "all";
  const archived = params.get("archived") === "1";

  const load = useCallback(() => {
    api.get(`/clients?q=${encodeURIComponent(q)}&filter=${filter}&archived=${archived}&limit=200`)
      .then((r) => setData(r.data)).catch(() => {});
  }, [q, filter, archived]);
  useEffect(load, [load]);

  const setParam = (k, v) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    setParams(p);
  };

  return (
    <div data-testid="clients-page">
      <PageHeader eyebrow="Clientele" title="Clients" testid="clients-header">
        <button onClick={() => setShowNew(true)} className="pq-btn-primary" data-testid="new-client-btn"><Plus size={15} /> New Client</button>
      </PageHeader>

      <div className="flex flex-wrap gap-2.5 mb-5">
        <input value={q} onChange={(e) => setParam("q", e.target.value)} placeholder="Search name, phone, email…" className="pq-input !w-64 !py-2" data-testid="clients-search-input" />
        <div className="flex rounded-lg border border-[#EDE5DE] overflow-hidden">
          {[["all", "All"], ["new", "New"], ["returning", "Returning"]].map(([v, l]) => (
            <button key={v} onClick={() => setParam("filter", v === "all" ? "" : v)} data-testid={`clients-filter-${v}`}
              className={`px-3.5 py-2 text-xs font-semibold transition-colors ${filter === v ? "bg-[#2B1B17] text-[#FAF8F5]" : "bg-white text-[#5A483E] hover:bg-[#F5EFEA]"}`}>{l}</button>
          ))}
        </div>
        <button onClick={() => setParam("archived", archived ? "" : "1")} data-testid="clients-archived-toggle"
          className={`pq-btn !py-2 text-xs ${archived ? "bg-[#2B1B17] text-[#FAF8F5]" : "border border-[#EDE5DE] text-[#5A483E]"}`}>
          {archived ? "Viewing archived" : "View archived"}
        </button>
      </div>

      {!data ? (
        <div className="pq-card h-64 animate-pulse" />
      ) : data.items.length === 0 ? (
        <EmptyState testid="clients-empty" title="No clients added yet"
          hint="Add your first client to begin commissioning cake orders."
          action={<button onClick={() => setShowNew(true)} className="pq-btn-primary" data-testid="clients-empty-new-btn"><Plus size={15} /> Create First Client</button>} />
      ) : (
        <div className="pq-card overflow-x-auto" data-testid="clients-table">
          <table className="w-full">
            <thead className="border-b border-[#EDE5DE] bg-[#FDFBF7]">
              <tr><th className="pq-th">Name</th><th className="pq-th">Phone</th><th className="pq-th">WhatsApp</th><th className="pq-th">Email</th><th className="pq-th">Orders</th><th className="pq-th">Added</th></tr>
            </thead>
            <tbody className="divide-y divide-[#F2EAE1]">
              {data.items.map((c) => (
                <tr key={c.id} onClick={() => navigate(`/clients/${c.id}`)} className="hover:bg-[#FDFBF7] cursor-pointer transition-colors" data-testid={`client-row-${c.id}`}>
                  <td className="pq-td font-medium text-[#2B1B17]">{c.full_name}</td>
                  <td className="pq-td">{c.phone || "—"}</td>
                  <td className="pq-td">{c.whatsapp || "—"}</td>
                  <td className="pq-td">{c.email || "—"}</td>
                  <td className="pq-td">{c.order_count}</td>
                  <td className="pq-td">{c.created_at?.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showNew && <ClientDialog onClose={() => { setShowNew(false); setParam("new", ""); }} onSaved={(c) => { load(); navigate(`/clients/${c.id}`); }} />}
    </div>
  );
}
