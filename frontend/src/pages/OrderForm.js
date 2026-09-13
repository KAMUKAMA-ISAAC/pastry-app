import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import api, { fmtErr } from "../lib/api";
import { Field, MultiSelectChips, PageHeader } from "../components/ui-bits";

const EMPTY = {
  client_id: "", category: "normal", cake_type: "", flavors: [], fillings: [], frostings: [],
  size: "", tiers: 1, colors: "", theme: "", message: "", decorations: "", quantity: 1,
  special_requests: "", date_needed: "", time_needed: "", fulfillment: "pickup",
  delivery_location: "", total_price: "", status: "Inquiry", design_category: "",
  internal_notes: "", client_instructions: "", design_notes: "",
};

export default function OrderForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ ...EMPTY, client_id: searchParams.get("client") || "" });
  const [clients, setClients] = useState([]);
  const [flavorOpts, setFlavorOpts] = useState([]);
  const [fillingOpts, setFillingOpts] = useState([]);
  const [frostingOpts, setFrostingOpts] = useState([]);
  const [types, setTypes] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [designCats, setDesignCats] = useState([]);
  const [meta, setMeta] = useState(null);
  const [clientMode, setClientMode] = useState("existing");
  const [newClient, setNewClient] = useState({ full_name: "", phone: "", whatsapp: "", email: "", address: "" });
  const [initialPayment, setInitialPayment] = useState({ amount: "", method: "Cash", reference: "", notes: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/clients?limit=1000").then((r) => setClients(r.data.items)).catch(() => {});
    api.get("/catalog/flavors").then((r) => setFlavorOpts(r.data.filter((x) => x.active))).catch(() => {});
    api.get("/catalog/fillings").then((r) => setFillingOpts(r.data.filter((x) => x.active))).catch(() => {});
    api.get("/catalog/frostings").then((r) => setFrostingOpts(r.data.filter((x) => x.active))).catch(() => {});
    api.get("/catalog/cake-types").then((r) => setTypes(r.data.filter((x) => x.active))).catch(() => {});
    api.get("/catalog/cake-sizes").then((r) => setSizes(r.data.filter((x) => x.active))).catch(() => {});
    api.get("/catalog/design-categories").then((r) => setDesignCats(r.data.filter((x) => x.active))).catch(() => {});
    api.get("/orders/meta").then((r) => setMeta(r.data)).catch(() => {});
    if (isEdit) {
      api.get(`/orders/${id}`).then((r) => {
        const o = r.data.order;
        setForm({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, o[k] ?? EMPTY[k]])) });
      }).catch(() => toast.error("Could not load order"));
    }
  }, [id, isEdit]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = useMemo(
    () => (clientMode === "existing" ? form.client_id : newClient.full_name.trim()) && form.date_needed && form.total_price !== "",
    [clientMode, form.client_id, form.date_needed, form.total_price, newClient.full_name]
  );

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return toast.error("Please complete client, date needed and total price.");
    setSaving(true);
    const payload = {
      ...form,
      total_price: Number(form.total_price) || 0,
      tiers: Number(form.tiers) || 1,
      quantity: Number(form.quantity) || 1,
      client_id: clientMode === "existing" ? form.client_id : null,
      new_client: clientMode === "new" ? newClient : null,
      initial_payment: !isEdit && Number(initialPayment.amount) > 0
        ? { ...initialPayment, amount: Number(initialPayment.amount) } : null,
    };
    try {
      const res = isEdit ? await api.put(`/orders/${id}`, payload) : await api.post("/orders", payload);
      toast.success(isEdit ? "Order updated" : `Order ${res.data.order_number} created`);
      navigate(`/orders/${isEdit ? id : res.data.id}`);
    } catch (err) {
      toast.error(fmtErr(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="order-form-page" className="max-w-4xl">
      <PageHeader eyebrow={isEdit ? "Edit Order" : "Commission"} title={isEdit ? "Edit Cake Order" : "New Cake Order"} testid="order-form-header" />
      <form onSubmit={submit} className="space-y-8" data-testid="order-form">
        <section className="pq-card p-6">
          <p className="pq-eyebrow mb-4">Step 1 — Client</p>
          <div className="flex gap-2 mb-4">
            <button type="button" onClick={() => setClientMode("existing")} data-testid="client-mode-existing"
              className={`pq-btn !py-2 text-xs ${clientMode === "existing" ? "bg-[#2B1B17] text-[#FAF8F5]" : "border border-[#EDE5DE] text-[#5A483E]"}`}>Existing client</button>
            <button type="button" onClick={() => setClientMode("new")} data-testid="client-mode-new"
              className={`pq-btn !py-2 text-xs ${clientMode === "new" ? "bg-[#2B1B17] text-[#FAF8F5]" : "border border-[#EDE5DE] text-[#5A483E]"}`}>New client</button>
          </div>
          {clientMode === "existing" ? (
            <Field label="Select client">
              <select value={form.client_id} onChange={(e) => set("client_id", e.target.value)} className="pq-input" data-testid="order-client-select">
                <option value="">Choose a client…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name} {c.phone ? `· ${c.phone}` : ""}</option>)}
              </select>
            </Field>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Full name *"><input value={newClient.full_name} onChange={(e) => setNewClient({ ...newClient, full_name: e.target.value })} className="pq-input" data-testid="new-client-name" /></Field>
              <Field label="Phone"><input value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} className="pq-input" data-testid="new-client-phone" /></Field>
              <Field label="WhatsApp"><input value={newClient.whatsapp} onChange={(e) => setNewClient({ ...newClient, whatsapp: e.target.value })} className="pq-input" data-testid="new-client-whatsapp" /></Field>
              <Field label="Email"><input type="email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} className="pq-input" data-testid="new-client-email" /></Field>
              <Field label="Address / location"><input value={newClient.address} onChange={(e) => setNewClient({ ...newClient, address: e.target.value })} className="pq-input sm:col-span-2" data-testid="new-client-address" /></Field>
            </div>
          )}
        </section>

        <section className="pq-card p-6">
          <p className="pq-eyebrow mb-4">Step 2 — Cake Details</p>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            {[
              { id: "wedding_intro", label: "Wedding & Introduction", desc: "Multi-tier couture centerpieces" },
              { id: "normal", label: "Normal (Small Cakes)", desc: "Birthdays, celebrations & bento cakes" },
            ].map((c) => (
              <button type="button" key={c.id} onClick={() => set("category", c.id)} data-testid={`order-category-${c.id}`}
                className={`text-left rounded-xl border p-4 transition-colors ${form.category === c.id ? "border-[#B76E60] bg-[#F7EBE8]" : "border-[#EDE5DE] hover:border-[#D8A49B]"}`}>
                <p className="font-serif text-lg text-[#2B1B17]">{c.label}</p>
                <p className="text-xs text-[#78665E] mt-0.5">{c.desc}</p>
              </button>
            ))}
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Cake type">
              <select value={form.cake_type} onChange={(e) => set("cake_type", e.target.value)} className="pq-input" data-testid="order-cake-type">
                <option value="">Select…</option>
                {types.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Size">
              <select value={form.size} onChange={(e) => set("size", e.target.value)} className="pq-input" data-testid="order-size">
                <option value="">Select…</option>
                {sizes.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Tiers"><input type="number" min="1" value={form.tiers} onChange={(e) => set("tiers", e.target.value)} className="pq-input" data-testid="order-tiers" /></Field>
            <Field label="Colors"><input value={form.colors} onChange={(e) => set("colors", e.target.value)} className="pq-input" placeholder="e.g. blush, ivory" data-testid="order-colors" /></Field>
            <Field label="Theme"><input value={form.theme} onChange={(e) => set("theme", e.target.value)} className="pq-input" data-testid="order-theme" /></Field>
            <Field label="Quantity"><input type="number" min="1" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} className="pq-input" data-testid="order-quantity" /></Field>
            <Field label="Cake message"><input value={form.message} onChange={(e) => set("message", e.target.value)} className="pq-input sm:col-span-2" placeholder='e.g. "Happy 30th, Sarah"' data-testid="order-message" /></Field>
            <Field label="Design category">
              <select value={form.design_category} onChange={(e) => set("design_category", e.target.value)} className="pq-input" data-testid="order-design-category">
                <option value="">Select…</option>
                {designCats.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Decorations"><input value={form.decorations} onChange={(e) => set("decorations", e.target.value)} className="pq-input sm:col-span-2" data-testid="order-decorations" /></Field>
            <Field label="Special requests"><textarea value={form.special_requests} onChange={(e) => set("special_requests", e.target.value)} className="pq-input sm:col-span-3" rows={2} data-testid="order-special-requests" /></Field>
          </div>
          <div className="grid sm:grid-cols-1 gap-4 mt-4 pt-4 border-t border-[#F2EAE1]">
            <MultiSelectChips label="Flavors (one or more)" options={flavorOpts} selected={form.flavors}
              onChange={(v) => set("flavors", v)} testid="order-flavors" />
            <MultiSelectChips label="Fillings (one or more)" options={fillingOpts} selected={form.fillings}
              onChange={(v) => set("fillings", v)} testid="order-fillings" />
            <MultiSelectChips label="Frostings (one or more)" options={frostingOpts} selected={form.frostings}
              onChange={(v) => set("frostings", v)} testid="order-frostings" />
          </div>
        </section>

        <section className="pq-card p-6">
          <p className="pq-eyebrow mb-4">Step 3 — Schedule & Fulfilment</p>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Date needed *"><input type="date" value={form.date_needed} onChange={(e) => set("date_needed", e.target.value)} className="pq-input" data-testid="order-date-needed" /></Field>
            <Field label="Time needed"><input type="time" value={form.time_needed} onChange={(e) => set("time_needed", e.target.value)} className="pq-input" data-testid="order-time-needed" /></Field>
            <Field label="Pickup or delivery">
              <select value={form.fulfillment} onChange={(e) => set("fulfillment", e.target.value)} className="pq-input" data-testid="order-fulfillment">
                <option value="pickup">Pickup</option>
                <option value="delivery">Delivery</option>
              </select>
            </Field>
            {form.fulfillment === "delivery" && (
              <Field label="Delivery location"><input value={form.delivery_location} onChange={(e) => set("delivery_location", e.target.value)} className="pq-input sm:col-span-2" data-testid="order-delivery-location" /></Field>
            )}
            <Field label="Order status">
              <select value={form.status} onChange={(e) => set("status", e.target.value)} className="pq-input" data-testid="order-status">
                {meta?.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
        </section>

        <section className="pq-card p-6">
          <p className="pq-eyebrow mb-4">Step 4 — Pricing {isEdit ? "" : "& First Payment"}</p>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Total agreed price (UGX) *">
              <input type="number" min="0" value={form.total_price} onChange={(e) => set("total_price", e.target.value)} className="pq-input" placeholder="350000" data-testid="order-total-price" />
            </Field>
            {!isEdit && (
              <>
                <Field label="Payment received now (optional)">
                  <input type="number" min="0" value={initialPayment.amount} onChange={(e) => setInitialPayment({ ...initialPayment, amount: e.target.value })} className="pq-input" placeholder="100000" data-testid="order-initial-payment" />
                </Field>
                <Field label="Payment method">
                  <select value={initialPayment.method} onChange={(e) => setInitialPayment({ ...initialPayment, method: e.target.value })} className="pq-input" data-testid="order-initial-method">
                    {["Cash", "Mobile Money", "Bank", "Card", "Other"].map((m) => <option key={m}>{m}</option>)}
                  </select>
                </Field>
                <Field label="Payment reference"><input value={initialPayment.reference} onChange={(e) => setInitialPayment({ ...initialPayment, reference: e.target.value })} className="pq-input" data-testid="order-initial-reference" /></Field>
              </>
            )}
          </div>
        </section>

        <section className="pq-card p-6">
          <p className="pq-eyebrow mb-4">Step 5 — Notes</p>
          <div className="grid gap-4">
            <Field label="Client instructions"><textarea value={form.client_instructions} onChange={(e) => set("client_instructions", e.target.value)} className="pq-input" rows={2} data-testid="order-client-instructions" /></Field>
            <Field label="Design notes"><textarea value={form.design_notes} onChange={(e) => set("design_notes", e.target.value)} className="pq-input" rows={2} data-testid="order-design-notes" /></Field>
            <Field label="Internal notes"><textarea value={form.internal_notes} onChange={(e) => set("internal_notes", e.target.value)} className="pq-input" rows={2} data-testid="order-internal-notes" /></Field>
          </div>
          <p className="text-xs text-[#78665E] mt-4">Reference and final confirmed design images are uploaded on the order page after saving.</p>
        </section>

        <div className="flex items-center gap-3 pb-8">
          <button type="submit" disabled={saving || !valid} className="pq-btn-primary" data-testid="order-submit-btn">
            {saving ? "Saving…" : isEdit ? "Save changes" : "Confirm & Create Order"}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="pq-btn-outline" data-testid="order-cancel-btn">Cancel</button>
        </div>
      </form>
    </div>
  );
}
