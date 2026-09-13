import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Archive, ArchiveRestore, Check, ImagePlus, Maximize2, Pencil, Printer, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import api, { fileUrl, fmtErr, money } from "../lib/api";
import { CategoryBadge, EmptyState, PayBadge, StatusBadge, UrgencyPill } from "../components/ui-bits";

const TIMELINE = ["Inquiry", "Confirmed", "Deposit Paid", "In Preparation", "Baking", "Decorating", "Ready", "Picked Up", "Completed"];

function RecordPaymentDialog({ order, onClose, onSaved }) {
  const [form, setForm] = useState({ amount: "", date: new Date().toISOString().slice(0, 10), method: "Cash", reference: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!(Number(form.amount) > 0)) return toast.error("Enter a valid amount");
    setSaving(true);
    try {
      const { data } = await api.post(`/orders/${order.id}/payments`, { ...form, amount: Number(form.amount) });
      toast.success(`Payment recorded — receipt ${data.receipt.receipt_number}`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(fmtErr(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="record-payment-dialog">
      <div className="absolute inset-0 bg-[#2B1B17]/40" onClick={onClose} />
      <form onSubmit={submit} className="relative pq-card p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-xl text-[#2B1B17]">Record Payment</h3>
          <button type="button" onClick={onClose} className="text-[#78665E]" data-testid="payment-dialog-close"><X size={18} /></button>
        </div>
        <p className="text-xs text-[#78665E]">Balance outstanding: <strong className="text-[#9E2A2B]">{money(order.balance)}</strong></p>
        <div>
          <label className="pq-label">Amount (UGX) *</label>
          <input type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="pq-input" data-testid="payment-amount-input" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="pq-label">Date</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="pq-input" data-testid="payment-date-input" />
          </div>
          <div>
            <label className="pq-label">Method</label>
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="pq-input" data-testid="payment-method-select">
              {["Cash", "Mobile Money", "Bank", "Card", "Other"].map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="pq-label">Reference</label>
          <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="pq-input" data-testid="payment-reference-input" />
        </div>
        <div>
          <label className="pq-label">Notes</label>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="pq-input" placeholder="e.g. Deposit / Final payment" data-testid="payment-notes-input" />
        </div>
        <button type="submit" disabled={saving} className="pq-btn-primary w-full" data-testid="payment-submit-btn">
          {saving ? "Recording…" : "Record Payment & Generate Receipt"}
        </button>
      </form>
    </div>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);
  const [showPay, setShowPay] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const finalInput = useRef(null);
  const refInput = useRef(null);

  const load = () => api.get(`/orders/${id}`).then((r) => setData(r.data)).catch(() => toast.error("Order not found"));
  useEffect(() => {
    load();
    api.get("/orders/meta").then((r) => setMeta(r.data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!data) return <div className="pq-card h-96 animate-pulse" data-testid="order-detail-loading" />;
  const { order, client, payments, images, reminders, feedback, audits } = data;
  const finalImg = images.find((i) => i.kind === "final");
  const refImgs = images.filter((i) => i.kind === "reference");

  const upload = async (file, kind) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api.post(`/orders/${id}/images?kind=${kind}`, fd);
      toast.success(kind === "final" ? "Final confirmed design saved" : "Reference image added");
      load();
    } catch (err) {
      toast.error(fmtErr(err));
    }
  };

  const removeImage = async (imageId) => {
    await api.delete(`/orders/${id}/images/${imageId}`).catch((e) => toast.error(fmtErr(e)));
    load();
  };

  const setStatus = async (status) => {
    try {
      await api.post(`/orders/${id}/status`, { status });
      toast.success(`Status → ${status}`);
      load();
    } catch (err) {
      toast.error(fmtErr(err));
    }
  };

  const toggleArchive = async () => {
    await api.post(`/orders/${id}/${order.archived ? "restore" : "archive"}`).catch((e) => toast.error(fmtErr(e)));
    toast.success(order.archived ? "Order restored" : "Order archived");
    load();
  };

  const deleteOrder = async () => {
    if (!window.confirm(`Permanently delete ${order.order_number}? This removes its payments, receipts, images and reminders. This cannot be undone.`)) return;
    try {
      await api.delete(`/orders/${id}`);
      toast.success("Order deleted");
      navigate("/orders");
    } catch (err) {
      toast.error(fmtErr(err));
    }
  };

  const details = [
    ["Cake type", order.cake_type], ["Size", order.size], ["Tiers", order.tiers],
    ["Colors", order.colors], ["Theme", order.theme], ["Message", order.message],
    ["Decorations", order.decorations], ["Quantity", order.quantity], ["Design category", order.design_category],
  ].filter(([, v]) => v !== "" && v !== null && v !== undefined);
  const chipGroups = [
    ["Flavors", order.flavors], ["Fillings", order.fillings], ["Frostings", order.frostings],
  ].filter(([, arr]) => arr && arr.length > 0);

  return (
    <div data-testid="order-detail-page">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-serif text-3xl sm:text-4xl text-[#2B1B17]" data-testid="order-number">{order.order_number}</h1>
            <CategoryBadge category={order.category} testid="order-category-badge" />
            <UrgencyPill dateNeeded={order.date_needed} testid="order-urgency" />
            {order.archived === true && <span className="text-xs font-bold text-[#9E2A2B]">ARCHIVED</span>}
          </div>
          <p className="text-sm text-[#78665E] mt-1.5">
            <Link to={`/clients/${client?.id}`} className="text-[#B76E60] hover:underline" data-testid="order-client-link">{client?.full_name}</Link>
            {" · "}Needed {order.date_needed} {order.time_needed && `at ${order.time_needed}`}
            {" · "}{order.fulfillment === "delivery" ? `Delivery${order.delivery_location ? ` — ${order.delivery_location}` : ""}` : "Pickup"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap no-print">
          <select value={order.status} onChange={(e) => setStatus(e.target.value)} className="pq-input !w-44 !py-2" data-testid="order-status-select">
            {meta?.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={() => setShowPay(true)} className="pq-btn-rose !py-2" data-testid="record-payment-btn">Record Payment</button>
          <button onClick={() => navigate(`/orders/${id}/edit`)} className="pq-btn-outline !py-2" data-testid="edit-order-btn"><Pencil size={14} /> Edit</button>
          <button onClick={() => window.print()} className="pq-btn-outline !py-2" data-testid="print-order-btn"><Printer size={14} /></button>
          <button onClick={toggleArchive} className="pq-btn-outline !py-2" data-testid="archive-order-btn">
            {order.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
          </button>
          <button onClick={deleteOrder} className="pq-btn-outline !py-2 !text-[#9E2A2B] !border-[#F5CDCD] hover:!bg-[#FDF0F0]" title="Delete order permanently" data-testid="delete-order-btn">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          <section className="pq-card p-6" data-testid="final-design-section">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="pq-eyebrow">Final Confirmed Cake Design</p>
                <p className="text-xs text-[#78665E] mt-1">The exact design approved by the client.</p>
              </div>
              <button onClick={() => finalInput.current?.click()} className="pq-btn-outline !py-2 text-xs" data-testid="upload-final-design-btn">
                <ImagePlus size={14} /> {finalImg ? "Replace" : "Upload"}
              </button>
              <input ref={finalInput} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files[0], "final")} data-testid="final-design-input" />
            </div>
            {finalImg ? (
              <div className="relative rounded-xl overflow-hidden border border-[#EDE5DE] group">
                <img src={fileUrl(finalImg.storage_path)} alt="Final confirmed cake design" className="w-full max-h-[420px] object-cover" data-testid="final-design-image" />
                <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setLightbox(finalImg.storage_path)} className="p-2 rounded-lg bg-white/90 text-[#2B1B17]" data-testid="final-design-fullscreen"><Maximize2 size={15} /></button>
                  <button onClick={() => removeImage(finalImg.id)} className="p-2 rounded-lg bg-white/90 text-[#9E2A2B]" data-testid="final-design-delete"><Trash2 size={15} /></button>
                </div>
              </div>
            ) : (
              <button onClick={() => finalInput.current?.click()} className="w-full border-2 border-dashed border-[#EAC9C1] rounded-xl py-14 text-center hover:bg-[#FDFBF7] transition-colors" data-testid="final-design-empty">
                <ImagePlus size={22} className="mx-auto text-[#D8A49B] mb-2" />
                <p className="text-sm text-[#78665E]">Upload the client-approved final design</p>
              </button>
            )}
          </section>

          <section className="pq-card p-6" data-testid="reference-images-section">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="pq-eyebrow">Reference / Inspiration Images</p>
                <p className="text-xs text-[#78665E] mt-1">Ideas only — never the confirmed design.</p>
              </div>
              <button onClick={() => refInput.current?.click()} className="pq-btn-outline !py-2 text-xs" data-testid="upload-reference-btn"><ImagePlus size={14} /> Add</button>
              <input ref={refInput} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files[0], "reference")} data-testid="reference-input" />
            </div>
            {refImgs.length === 0 ? (
              <p className="text-sm text-[#B9ABA2]">No reference images yet.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {refImgs.map((img) => (
                  <div key={img.id} className="relative rounded-lg overflow-hidden border border-[#EDE5DE] group aspect-square">
                    <img src={fileUrl(img.storage_path)} alt="Reference inspiration" className="w-full h-full object-cover cursor-pointer" onClick={() => setLightbox(img.storage_path)} />
                    <button onClick={() => removeImage(img.id)} className="absolute top-1.5 right-1.5 p-1.5 rounded-md bg-white/90 text-[#9E2A2B] opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="pq-card p-6" data-testid="cake-details-section">
            <p className="pq-eyebrow mb-4">Cake Details</p>
            {chipGroups.length > 0 && (
              <div className="mb-5 space-y-3" data-testid="cake-selections">
                {chipGroups.map(([label, arr]) => (
                  <div key={label}>
                    <p className="text-[11px] uppercase tracking-wider text-[#B9ABA2] mb-1.5">{label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {arr.map((v) => (
                        <span key={v} className="inline-flex items-center rounded-full border border-[#EDE5DE] bg-[#F5EFEA] px-2.5 py-0.5 text-xs text-[#4A3B32]">{v}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
              {details.map(([k, v]) => (
                <div key={k}>
                  <p className="text-[11px] uppercase tracking-wider text-[#B9ABA2]">{k}</p>
                  <p className="text-sm text-[#2B1B17] mt-0.5">{v}</p>
                </div>
              ))}
            </div>
            {(order.special_requests || order.client_instructions || order.design_notes || order.internal_notes) && (
              <div className="mt-5 pt-5 border-t border-[#F2EAE1] space-y-3">
                {[["Special requests", order.special_requests], ["Client instructions", order.client_instructions],
                  ["Design notes", order.design_notes], ["Internal notes", order.internal_notes]]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k}>
                      <p className="text-[11px] uppercase tracking-wider text-[#B9ABA2]">{k}</p>
                      <p className="text-sm text-[#4A3B32] mt-0.5 whitespace-pre-wrap">{v}</p>
                    </div>
                  ))}
              </div>
            )}
          </section>

          <section className="pq-card p-6" data-testid="timeline-section">
            <p className="pq-eyebrow mb-4">Order Timeline</p>
            <div className="flex flex-wrap items-center gap-y-3">
              {TIMELINE.map((step, i) => {
                const idx = TIMELINE.indexOf(order.status === "Cancelled" ? "Inquiry" : order.status);
                const done = i <= idx;
                return (
                  <div key={step} className="flex items-center">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${done ? "bg-[#2B1B17] text-[#FAF8F5]" : "bg-[#F2EAE1] text-[#B9ABA2]"}`}>
                        {done ? <Check size={11} /> : i + 1}
                      </span>
                      <span className={`text-[11px] font-medium ${done ? "text-[#2B1B17]" : "text-[#B9ABA2]"}`}>{step}</span>
                    </div>
                    {i < TIMELINE.length - 1 && <span className="w-4 h-px bg-[#EDE5DE] mx-2" />}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <section className="pq-card p-6" data-testid="payment-summary-section">
            <p className="pq-eyebrow mb-4">Payment Summary</p>
            <div className="space-y-2.5 mb-5">
              <div className="flex justify-between text-sm"><span className="text-[#78665E]">Total price</span><span className="font-medium text-[#2B1B17]" data-testid="order-total">{money(order.total_price)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-[#78665E]">Total paid</span><span className="font-medium text-[#2E5A2A]" data-testid="order-paid">{money(order.total_paid)}</span></div>
              <div className="flex justify-between text-sm pt-2.5 border-t border-[#F2EAE1]"><span className="text-[#78665E]">Balance</span><span className="font-serif text-xl text-[#9E2A2B]" data-testid="order-balance">{money(order.balance)}</span></div>
              <div className="pt-1"><PayBadge s={order.payment_status} testid="order-payment-status" /></div>
            </div>
            <p className="pq-eyebrow mb-3">Payment History</p>
            {payments.length === 0 ? (
              <p className="text-sm text-[#B9ABA2]" data-testid="no-payments">No payments recorded.</p>
            ) : (
              <div className="space-y-3" data-testid="payment-history">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 text-sm" data-testid={`payment-${p.id}`}>
                    <div>
                      <p className="text-[#2B1B17] font-medium">{p.date}</p>
                      <p className="text-xs text-[#78665E]">{p.method}{p.notes ? ` · ${p.notes}` : ""}{p.reference ? ` · Ref ${p.reference}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[#2B1B17]">{money(p.amount)}</span>
                      <Link to={`/receipts/${p.receipt_id}`} className="text-xs text-[#B76E60] hover:underline" data-testid={`receipt-link-${p.id}`}>Receipt</Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="pq-card p-6" data-testid="reminders-section">
            <p className="pq-eyebrow mb-4">Email Reminders</p>
            {reminders.length === 0 ? (
              <p className="text-sm text-[#B9ABA2]">No reminders scheduled.</p>
            ) : (
              <div className="space-y-2.5">
                {reminders.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-sm" data-testid={`reminder-${r.id}`}>
                    <div>
                      <p className="text-[#2B1B17] capitalize">{r.type.replace(/_/g, " ")}</p>
                      <p className="text-xs text-[#78665E]">Scheduled {r.scheduled_date}{r.sent_date ? ` · Sent ${r.sent_date.slice(0, 10)}` : ""}{r.error ? ` · ${r.error}` : ""}</p>
                    </div>
                    <Badge label={r.status} styles={{ scheduled: "bg-[#FAF1E8] text-[#9E5A20] border-[#F0D5BD]", sent: "bg-[#EEF4EB] text-[#2E5A2A] border-[#CADBC2]", failed: "bg-[#FDF0F0] text-[#9E2A2B] border-[#F5CDCD]", cancelled: "bg-[#F5EFEA] text-[#78665E] border-[#EDE5DE]" }} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="pq-card p-6" data-testid="order-feedback-section">
            <p className="pq-eyebrow mb-4">Client Feedback</p>
            {feedback.length === 0 ? (
              <p className="text-sm text-[#B9ABA2]">No feedback recorded. <Link to={`/feedback?new=1&order=${id}&client=${order.client_id}`} className="text-[#B76E60] hover:underline">Add feedback</Link></p>
            ) : (
              feedback.map((f) => (
                <div key={f.id} className="text-sm" data-testid={`order-feedback-${f.id}`}>
                  <div className="flex gap-0.5 mb-1">{Array.from({ length: 5 }).map((_, i) => <Star key={i} size={13} className={i < f.rating ? "fill-[#C98E56] text-[#C98E56]" : "text-[#EDE5DE]"} />)}</div>
                  <p className="text-[#4A3B32]">{f.feedback}</p>
                </div>
              ))
            )}
          </section>

          <section className="pq-card p-6" data-testid="audit-section">
            <p className="pq-eyebrow mb-4">Activity</p>
            {audits.length === 0 ? <p className="text-sm text-[#B9ABA2]">No activity yet.</p> : (
              <div className="space-y-2.5 max-h-64 overflow-y-auto">
                {audits.map((a) => (
                  <div key={a.id} className="text-xs">
                    <p className="text-[#4A3B32]">{a.detail}</p>
                    <p className="text-[#B9ABA2]">{a.created_at?.slice(0, 16).replace("T", " ")} · {a.actor}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {showPay && <RecordPaymentDialog order={order} onClose={() => setShowPay(false)} onSaved={load} />}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-[#2B1B17]/90 flex items-center justify-center p-6" onClick={() => setLightbox(null)} data-testid="image-lightbox">
          <img src={fileUrl(lightbox)} alt="Cake design full view" className="max-w-full max-h-full object-contain rounded-lg" />
          <button className="absolute top-5 right-5 text-white" data-testid="lightbox-close"><X size={24} /></button>
        </div>
      )}
    </div>
  );
}

function Badge({ label, styles }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${styles[label] || ""}`}>{label}</span>
  );
}
