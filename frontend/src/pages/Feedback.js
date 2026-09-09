import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Archive, Plus, Star, X } from "lucide-react";
import { toast } from "sonner";
import api, { fmtErr } from "../lib/api";
import { EmptyState, PageHeader } from "../components/ui-bits";

function FeedbackDialog({ preset, onClose, onSaved }) {
  const [clients, setClients] = useState([]);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState({
    client_id: preset?.client || "", order_id: preset?.order || "",
    date: new Date().toISOString().slice(0, 10), rating: 5,
    feedback: "", went_well: "", improve: "", follow_up: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/clients?limit=1000").then((r) => setClients(r.data.items)).catch(() => {});
  }, []);
  useEffect(() => {
    if (form.client_id) {
      api.get(`/clients/${form.client_id}`).then((r) => setOrders(r.data.orders)).catch(() => {});
    }
  }, [form.client_id]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.client_id) return toast.error("Select a client");
    setSaving(true);
    try {
      await api.post("/feedback", { ...form, rating: Number(form.rating) });
      toast.success("Feedback recorded");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(fmtErr(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="feedback-dialog">
      <div className="absolute inset-0 bg-[#2B1B17]/40" onClick={onClose} />
      <form onSubmit={submit} className="relative pq-card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-xl text-[#2B1B17]">Record Feedback</h3>
          <button type="button" onClick={onClose} className="text-[#78665E]"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="pq-label">Client *</label>
            <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value, order_id: "" })} className="pq-input" data-testid="feedback-client-select">
              <option value="">Select…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="pq-label">Order</label>
            <select value={form.order_id} onChange={(e) => setForm({ ...form, order_id: e.target.value })} className="pq-input" data-testid="feedback-order-select">
              <option value="">General</option>
              {orders.map((o) => <option key={o.id} value={o.id}>{o.order_number}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="pq-label">Date</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="pq-input" data-testid="feedback-date-input" />
          </div>
          <div>
            <label className="pq-label">Rating</label>
            <div className="flex gap-1 pt-1.5" data-testid="feedback-rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" key={n} onClick={() => setForm({ ...form, rating: n })} data-testid={`rating-${n}`}>
                  <Star size={20} className={n <= form.rating ? "fill-[#C98E56] text-[#C98E56]" : "text-[#EDE5DE]"} />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div><label className="pq-label">Feedback</label><textarea value={form.feedback} onChange={(e) => setForm({ ...form, feedback: e.target.value })} className="pq-input" rows={2} data-testid="feedback-text-input" /></div>
        <div><label className="pq-label">What went well</label><textarea value={form.went_well} onChange={(e) => setForm({ ...form, went_well: e.target.value })} className="pq-input" rows={2} data-testid="feedback-went-well" /></div>
        <div><label className="pq-label">What could improve</label><textarea value={form.improve} onChange={(e) => setForm({ ...form, improve: e.target.value })} className="pq-input" rows={2} data-testid="feedback-improve" /></div>
        <div><label className="pq-label">Follow-up notes</label><input value={form.follow_up} onChange={(e) => setForm({ ...form, follow_up: e.target.value })} className="pq-input" data-testid="feedback-follow-up" /></div>
        <button type="submit" disabled={saving} className="pq-btn-primary w-full" data-testid="feedback-submit-btn">{saving ? "Saving…" : "Save Feedback"}</button>
      </form>
    </div>
  );
}

export default function FeedbackPage() {
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState(null);
  const [showNew, setShowNew] = useState(params.get("new") === "1");

  const load = useCallback(() => {
    api.get("/feedback").then((r) => setItems(r.data)).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const archive = async (fid) => {
    await api.post(`/feedback/${fid}/archive`).catch((e) => toast.error(fmtErr(e)));
    load();
  };

  const avg = items?.length ? (items.reduce((s, f) => s + (f.rating || 0), 0) / items.length).toFixed(1) : null;

  return (
    <div data-testid="feedback-page">
      <PageHeader eyebrow="Client Voices" title="Feedback" testid="feedback-header">
        {avg && <span className="pq-btn-outline !cursor-default" data-testid="feedback-average"><Star size={14} className="fill-[#C98E56] text-[#C98E56]" /> {avg} average</span>}
        <button onClick={() => setShowNew(true)} className="pq-btn-primary" data-testid="new-feedback-btn"><Plus size={15} /> Add Feedback</button>
      </PageHeader>

      {!items ? (
        <div className="pq-card h-64 animate-pulse" />
      ) : items.length === 0 ? (
        <EmptyState testid="feedback-empty" title="No feedback recorded"
          hint="Record what clients say about their cakes to keep improving the atelier."
          action={<button onClick={() => setShowNew(true)} className="pq-btn-primary" data-testid="feedback-empty-new-btn"><Plus size={15} /> Add Feedback</button>} />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4" data-testid="feedback-list">
          {items.map((f) => (
            <div key={f.id} className="pq-card p-5" data-testid={`feedback-card-${f.id}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-medium text-sm text-[#2B1B17]">{f.client_name}</p>
                  <p className="text-xs text-[#78665E]">{f.order_number || "General"} · {f.date}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">{Array.from({ length: 5 }).map((_, i) => <Star key={i} size={12} className={i < f.rating ? "fill-[#C98E56] text-[#C98E56]" : "text-[#EDE5DE]"} />)}</div>
                  <button onClick={() => archive(f.id)} className="text-[#B9ABA2] hover:text-[#9E2A2B]" data-testid={`feedback-archive-${f.id}`}><Archive size={14} /></button>
                </div>
              </div>
              {f.feedback && <p className="text-sm text-[#4A3B32] mb-2">“{f.feedback}”</p>}
              {f.went_well && <p className="text-xs text-[#2E5A2A]"><strong>Went well:</strong> {f.went_well}</p>}
              {f.improve && <p className="text-xs text-[#9E5A20] mt-1"><strong>Improve:</strong> {f.improve}</p>}
              {f.follow_up && <p className="text-xs text-[#78665E] mt-1"><strong>Follow-up:</strong> {f.follow_up}</p>}
            </div>
          ))}
        </div>
      )}
      {showNew && (
        <FeedbackDialog
          preset={{ client: params.get("client") || "", order: params.get("order") || "" }}
          onClose={() => { setShowNew(false); setParams({}); }}
          onSaved={load}
        />
      )}
    </div>
  );
}
