import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Plus, RefreshCw, Search, X, RotateCcw, Pencil, Wallet, Landmark } from "lucide-react";
import { toast } from "sonner";
import api, { fileUrl, fmtErr, money } from "../lib/api";
import { PageHeader, StatCard } from "../components/ui-bits";
import { useAuth } from "../context/AuthContext";

const EXPENSE_CATEGORIES = ["Raw materials and ingredients", "Packaging materials", "Supplier payments", "Transport and delivery", "Vehicle repairs and maintenance", "Rent", "Electricity and water", "Equipment and maintenance", "Staff payments", "Marketing and advertising", "Other business expenses"];
const METHODS = ["Cash", "Mobile Money", "Bank payment", "Other"];
const blankExpense = () => ({ date: new Date().toISOString().slice(0, 10), amount: "", recipient: "", authorized_by: "", category: EXPENSE_CATEGORIES[0], description: "", method: "Cash", payment_id: "", allocation_amount: "", reference: "", notes: "", attachment: "" });
const blankDeposit = () => ({ date: new Date().toISOString().slice(0, 10), amount: "", source: "Customer payment", client_id: "", payment_id: "", bank_account: "", reference: "", description: "", notes: "", attachment: "", allocation_amount: "" });
const inputClass = "pq-input";
const labelClass = "pq-label";

function Field({ label, children }) { return <label className="block"><span className={labelClass}>{label}</span>{children}</label>; }

export default function FinanceDashboard({ mode = "expenses" }) {
  const isExpenses = mode === "expenses";
  const { can } = useAuth();
  const permitted = can(isExpenses ? "manageExpenses" : "manageBankTransfers");
  const endpoint = isExpenses ? "/expenses" : "/bank-deposits";
  const [data, setData] = useState({ items: [], summary: { today: 0, week: 0, month: 0, selected: 0, count: 0 } });
  const [payments, setPayments] = useState([]);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(null);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [q, setQ] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [category, setCategory] = useState("");
  const [recipient, setRecipient] = useState("");
  const [recordedBy, setRecordedBy] = useState("");
  const [method, setMethod] = useState("");
  const [clientId, setClientId] = useState("");
  const [account, setAccount] = useState("");
  const [source, setSource] = useState("");
  const [selectedPayment, setSelectedPayment] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [monthly, setMonthly] = useState(null);

  const load = useCallback(async () => {
    if (!permitted) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
      if (isExpenses) {
        if (category) params.set("category", category);
        if (recipient) params.set("recipient", recipient);
        if (method) params.set("method", method);
        if (selectedPayment) params.set("payment_id", selectedPayment);
        if (recordedBy) params.set("recorded_by", recordedBy);
      } else {
        if (clientId) params.set("client_id", clientId);
        if (account) params.set("bank_account", account);
        if (source) params.set("source", source);
        if (selectedPayment) params.set("payment_id", selectedPayment);
      }
      const [records, paymentRows, clientRows] = await Promise.all([
        api.get(`${endpoint}?${params.toString()}`),
        api.get("/finance/payments"),
        api.get("/finance/clients"),
      ]);
      setData(records.data);
      setPayments(paymentRows.data.items || []);
      setClients(clientRows.data.items || []);
    } catch (e) { toast.error(fmtErr(e)); }
    finally { setLoading(false); }
  }, [permitted, endpoint, q, startDate, endDate, category, recipient, method, recordedBy, clientId, account, source, selectedPayment, isExpenses]);

  const loadMonthly = useCallback(async () => {
    if (!permitted) return;
    try { const r = await api.get(`/finance/monthly-summary?month=${month}`); setMonthly(r.data); }
    catch (e) { toast.error(fmtErr(e)); }
  }, [permitted, month]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadMonthly(); }, [loadMonthly]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const formPaymentId = form?.payment_id;
  const payment = useMemo(() => payments.find((p) => p.id === formPaymentId), [payments, formPaymentId]);
  const chosenPayment = payments.find((p) => p.id === selectedPayment);

  const openNew = () => { setEditing(null); setForm(isExpenses ? blankExpense() : blankDeposit()); };
  const openEdit = (item) => {
    setEditing(item);
    const sourceForm = isExpenses ? blankExpense() : blankDeposit();
    const keys = Object.keys(sourceForm);
    keys.forEach((k) => { sourceForm[k] = item[k] ?? ""; });
    setForm(sourceForm);
  };
  const uploadAttachment = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const payload = new FormData();
    payload.append("file", file);
    setUploadingAttachment(true);
    try {
      const result = await api.post("/finance/attachments", payload);
      set("attachment", result.data.path);
      toast.success("Supporting image uploaded. Save the record to attach it.");
    } catch (e) { toast.error(fmtErr(e)); }
    finally { setUploadingAttachment(false); event.target.value = ""; }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form) return;
    if (!form.date || !form.amount || Number(form.amount) <= 0) return toast.error("Enter a valid date and an amount greater than zero.");
    if (isExpenses && (!form.recipient.trim() || !form.description.trim())) return toast.error("Recipient and description are required.");
    if (!isExpenses && !form.bank_account.trim()) return toast.error("Enter the destination bank account.");
    if (!isExpenses && form.source === "Customer payment" && !form.payment_id) return toast.error("Select the customer payment this deposit came from.");
    setSaving(true);
    try {
      const body = { ...form, amount: Number(form.amount), payment_id: form.payment_id || null,
        client_id: form.client_id || null, allocation_amount: form.payment_id ? Number(form.allocation_amount || form.amount) : null };
      if (editing) await api.put(`${endpoint}/${editing.id}`, body);
      else await api.post(endpoint, body);
      toast.success(editing ? "Financial record updated." : isExpenses ? "Expense recorded." : "Bank deposit recorded.");
      setForm(null); setEditing(null); await load(); await loadMonthly();
    } catch (err) { toast.error(fmtErr(err)); }
    finally { setSaving(false); }
  };

  const reverse = async (item) => {
    const reason = window.prompt(`Enter the reason for reversing ${isExpenses ? item.expense_id : item.deposit_id}. This will be retained in the audit history.`);
    if (!reason || reason.trim().length < 3) return;
    try {
      await api.post(`${endpoint}/${item.id}/reverse?reason=${encodeURIComponent(reason.trim())}`);
      toast.success("Record reversed and audit history saved."); await load(); await loadMonthly();
    } catch (e) { toast.error(fmtErr(e)); }
  };


  const recordOtherUse = async () => {
    if (!chosenPayment) return;
    const amount = window.prompt(`Amount from this payment allocated to another use (UGX). Remaining: ${money(chosenPayment.remaining_unallocated)}`);
    if (amount === null || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return;
    const purpose = window.prompt("Describe the other recorded use (required).");
    if (!purpose || !purpose.trim()) return;
    const notes = window.prompt("Optional notes for the audit trail.") || "";
    try {
      await api.post("/finance/other-allocations", { payment_id: chosenPayment.id, date: new Date().toISOString().slice(0, 10), amount: Number(amount), purpose: purpose.trim(), notes });
      toast.success("Other use allocated and recorded."); await load();
    } catch (e) { toast.error(fmtErr(e)); }
  };

  const reconcileCash = async () => {
    if (!chosenPayment) return;
    const amount = window.prompt(`Enter the cash amount physically verified as held from this payment. Remaining unallocated: ${money(chosenPayment.remaining_unallocated)}`);
    if (amount === null || !Number.isFinite(Number(amount)) || Number(amount) < 0) return;
    const notes = window.prompt("Reconciliation notes (where checked / who verified).") || "";
    try {
      await api.post("/finance/reconciliations", { payment_id: chosenPayment.id, cash_held: Number(amount), notes });
      toast.success("Cash reconciliation saved."); await load();
    } catch (e) { toast.error(fmtErr(e)); }
  };

  const exportCsv = () => {
    const cols = isExpenses
      ? ["date", "expense_id", "recipient", "category", "description", "amount", "method", "payment_id", "recorded_by", "reference", "notes"]
      : ["date", "deposit_id", "source", "client_name", "payment_id", "amount", "bank_account", "reference", "recorded_by", "description", "notes"];
    const csv = [cols.join(","), ...data.items.map((r) => cols.map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `pastry-quin-${isExpenses ? "expenses" : "bank-deposits"}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if (!permitted) return <div className="pq-card p-6 text-sm text-[#78665E]">This financial dashboard is restricted to Administrators.</div>;

  return <div data-testid={isExpenses ? "expenses-page" : "bank-transfer-page"}>
    <PageHeader eyebrow="Administrator · Financial control" title={isExpenses ? "Expenses" : "Bank Transfer"}>
      <button onClick={load} className="pq-btn-secondary"><RefreshCw size={15}/> Refresh</button>
      <button onClick={exportCsv} className="pq-btn-secondary"><Download size={15}/> Export CSV</button>
      <button onClick={openNew} className="pq-btn-primary"><Plus size={15}/> {isExpenses ? "Record expense" : "Record deposit"}</button>
    </PageHeader>
    <p className="text-sm text-[#78665E] -mt-4 mb-6">{isExpenses ? "Record and reconcile business spending without changing customer order balances or payment receipts." : "Track actual bank deposits separately from customer payments and keep a clear allocation history."}</p>

    <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-6">
      <StatCard label={isExpenses ? "Expenses today" : "Deposited today"} value={money(data.summary?.today)} />
      <StatCard label={isExpenses ? "Expenses this week" : "Deposited this week"} value={money(data.summary?.week)} />
      <StatCard label={isExpenses ? "Expenses this month" : "Deposited this month"} value={money(data.summary?.month)} />
      <StatCard label="Selected range total" value={money(data.summary?.selected)} />
      <StatCard label={isExpenses ? "Expense records" : "Deposit records"} value={String(data.summary?.count || 0)} />
    </div>

    <section className="pq-card p-4 mb-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="relative"><Search size={15} className="absolute left-3 top-3 text-[#B9ABA2]"/><input className={inputClass+" pl-9"} placeholder="Search records…" value={q} onChange={(e)=>setQ(e.target.value)}/></label>
        <Field label="From date"><input type="date" className={inputClass} value={startDate} onChange={(e)=>setStartDate(e.target.value)}/></Field>
        <Field label="To date"><input type="date" className={inputClass} value={endDate} onChange={(e)=>setEndDate(e.target.value)}/></Field>
        <Field label="Related customer payment"><select className={inputClass} value={selectedPayment} onChange={(e)=>setSelectedPayment(e.target.value)}><option value="">All payments</option>{payments.map(p=><option key={p.id} value={p.id}>{p.client_name} · {p.order_number} · {money(p.amount)} · {p.date}</option>)}</select></Field>
        {isExpenses ? <>
          <Field label="Category"><select className={inputClass} value={category} onChange={(e)=>setCategory(e.target.value)}><option value="">All categories</option>{EXPENSE_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></Field>
          <Field label="Recipient"><input className={inputClass} value={recipient} onChange={(e)=>setRecipient(e.target.value)} placeholder="Recipient name"/></Field>
          <Field label="Payment method"><select className={inputClass} value={method} onChange={(e)=>setMethod(e.target.value)}><option value="">All methods</option>{METHODS.map(m=><option key={m}>{m}</option>)}</select></Field>
          <Field label="Recorded by"><input className={inputClass} value={recordedBy} onChange={e=>setRecordedBy(e.target.value)} placeholder="User email"/></Field>
        </> : <>
          <Field label="Client"><select className={inputClass} value={clientId} onChange={(e)=>setClientId(e.target.value)}><option value="">All clients</option>{clients.map(c=><option key={c.id} value={c.id}>{c.full_name}</option>)}</select></Field>
          <Field label="Source of funds"><select className={inputClass} value={source} onChange={(e)=>setSource(e.target.value)}><option value="">All sources</option>{["Customer payment","Business funds","Other source"].map(s=><option key={s}>{s}</option>)}</select></Field>
          <Field label="Bank account"><input className={inputClass} value={account} onChange={(e)=>setAccount(e.target.value)} placeholder="Bank/account name"/></Field>
        </>}
      </div>
    </section>

    {!isExpenses && chosenPayment && <section className="pq-card p-5 mb-6">
      <h2 className="font-serif text-xl mb-3">Payment accountability · {chosenPayment.client_name}</h2>
      <p className="text-xs text-[#78665E] mb-3">{chosenPayment.order_number} · Payment received {chosenPayment.date} · Reference {chosenPayment.reference || "—"}</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Original payment" value={money(chosenPayment.amount)}/>
        <StatCard label="Deposited to bank" value={money(chosenPayment.allocated_to_bank)}/>
        <StatCard label="Allocated to expenses" value={money(chosenPayment.allocated_to_expenses)}/>
        <StatCard label="Remaining unallocated" value={money(chosenPayment.remaining_unallocated)}/><StatCard label="Verified cash held" value={money(chosenPayment.cash_held_verified)}/><StatCard label="Unaccounted for" value={chosenPayment.reconciled ? money(chosenPayment.unaccounted_for) : "Not reconciled"} sub={!chosenPayment.reconciled ? "Record a cash count first" : chosenPayment.reconciliation_difference < 0 ? "Cash overage to review" : "Difference after cash reconciliation"}/>
      </div>
      <p className="text-xs text-[#78665E] mt-3">{chosenPayment.reconciled && chosenPayment.unaccounted_for === 0 ? "Fully accounted for: recorded allocations plus verified cash held reconcile to the original payment." : "Unallocated does not automatically mean missing. Until cash is reconciled, the amount is shown as unallocated rather than unaccounted for."} Record other uses separately when needed.</p>
    </section>}

    <section className="pq-card overflow-x-auto mb-7">
      <div className="p-4 border-b border-[#EDE5DE] flex items-center justify-between"><h2 className="font-serif text-xl">{isExpenses ? "Expense ledger" : "Bank deposit ledger"}</h2><span className="text-xs text-[#78665E]">{data.items.length} records</span></div>
      {loading ? <div className="p-10 text-sm text-[#78665E]">Loading financial records…</div> : data.items.length === 0 ? <div className="p-10 text-sm text-[#78665E] text-center">No records match these filters.</div> :
      <table className="w-full min-w-[1000px]"><thead className="bg-[#FDFBF7] border-b border-[#EDE5DE]"><tr>{(isExpenses ? ["Date","Expense ID","Recipient","Category","Description","Amount","Method","Related payment","Recorded by","Actions"] : ["Date","Deposit ID","Source / client","Customer payment","Original amount","Deposited amount","Bank account","Transaction ref.","Recorded by","Actions"]).map(h=><th key={h} className="pq-th text-left">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-[#F2EAE1]">{data.items.map(item=><tr key={item.id} className="hover:bg-[#FDFBF7]">
        <td className="pq-td">{item.date}</td><td className="pq-td font-semibold">{isExpenses?item.expense_id:item.deposit_id}</td>
        {isExpenses ? <>
          <td className="pq-td">{item.recipient}</td><td className="pq-td">{item.category}</td><td className="pq-td max-w-[240px] whitespace-normal">{item.description}</td><td className="pq-td font-semibold">{money(item.amount)}</td><td className="pq-td">{item.method}</td>
          <td className="pq-td">{item.payment_id ? (payments.find(p=>p.id===item.payment_id)?.client_name || "Linked payment") : "—"}</td>
        </> : <>
          <td className="pq-td">{item.client_name || item.source}</td><td className="pq-td">{item.payment_id ? (payments.find(p=>p.id===item.payment_id)?.reference || payments.find(p=>p.id===item.payment_id)?.receipt_number || "Linked payment") : "—"}</td>
          <td className="pq-td">{item.payment_id ? money(payments.find(p=>p.id===item.payment_id)?.amount) : "—"}</td><td className="pq-td font-semibold">{money(item.amount)}</td><td className="pq-td">{item.bank_account}</td><td className="pq-td">{item.reference || "—"}</td>
        </>}
        <td className="pq-td text-xs">{item.recorded_by}</td><td className="pq-td"><div className="flex gap-2">{item.attachment && <a title="View supporting attachment" href={fileUrl(item.attachment)} target="_blank" rel="noreferrer" className="rounded-md border border-[#EDE5DE] px-2 py-1 text-xs hover:bg-[#F5EFEA]">File</a>}<button title="Edit" onClick={()=>openEdit(item)} className="rounded-md border border-[#EDE5DE] p-2 hover:bg-[#F5EFEA]"><Pencil size={14}/></button><button title="Reverse with audit reason" onClick={()=>reverse(item)} className="rounded-md border border-red-200 p-2 text-red-700 hover:bg-red-50"><RotateCcw size={14}/></button></div></td>
      </tr>)}</tbody></table>}
    </section>

    <section className="pq-card p-5 mb-7">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4"><div><p className="pq-eyebrow">Financial accountability</p><h2 className="font-serif text-xl">Customer payment allocations</h2><p className="text-xs text-[#78665E] mt-1">Select a payment to see the deposited, spent, and unallocated totals.</p></div><Field label="Customer payment"><select className={inputClass+" min-w-[280px]"} value={selectedPayment} onChange={e=>setSelectedPayment(e.target.value)}><option value="">Choose a customer payment</option>{payments.map(p=><option key={p.id} value={p.id}>{p.client_name} · {p.order_number} · {money(p.amount)}</option>)}</select></Field></div>
      {chosenPayment ? <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Received" value={money(chosenPayment.amount)}/><StatCard label="Bank deposits" value={money(chosenPayment.allocated_to_bank)}/><StatCard label="Expenses allocated" value={money(chosenPayment.allocated_to_expenses)}/><StatCard label="Other recorded uses" value={money(chosenPayment.allocated_to_other)}/><StatCard label="Remaining unallocated" value={money(chosenPayment.remaining_unallocated)}/>
        <div className="sm:col-span-2 lg:col-span-5 text-xs text-[#78665E]">Payment balance for the order remains governed by the existing customer payment ledger. These allocations only track how the received funds were used.</div>
        <div className="sm:col-span-2 lg:col-span-5"><button onClick={()=>{setEditing(null);setForm(blankExpense());setForm(f=>({...blankExpense(),payment_id:chosenPayment.id,allocation_amount:String(chosenPayment.remaining_unallocated)}));}} className="pq-btn-secondary"><Wallet size={15}/> Allocate to expense</button> <button onClick={()=>{setEditing(null);setForm({...blankDeposit(),payment_id:chosenPayment.id,client_id:chosenPayment.client_id,allocation_amount:String(chosenPayment.remaining_unallocated),source:"Customer payment"});}} className="pq-btn-secondary"><Landmark size={15}/> Record bank deposit</button> <button onClick={recordOtherUse} className="pq-btn-secondary"><Wallet size={15}/> Record other use</button> <button onClick={reconcileCash} className="pq-btn-secondary">Reconcile cash held</button></div>
      </div> : <p className="text-sm text-[#78665E] py-3">Choose a payment above to view its accountability breakdown.</p>}
    </section>

    <section className="pq-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4"><div><p className="pq-eyebrow">Monthly report</p><h2 className="font-serif text-xl">Payments, expenses & deposits</h2></div><Field label="Select month"><input type="month" className={inputClass} value={month} onChange={e=>setMonth(e.target.value)}/></Field></div>
      {monthly && <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3"><StatCard label="Customer payments received" value={money(monthly.customer_payments)}/><StatCard label="Business expenses" value={money(monthly.expenses)}/><StatCard label="Bank deposits made" value={money(monthly.bank_deposits)}/><StatCard label="Payments less expenses" value={money(monthly.payments_less_expenses)} sub="Deposits are shown separately because moving money to the bank is not a new payment or an expense."/></div>}
    </section>

    {form && <div className="fixed inset-0 z-50 bg-[#2B1B17]/45 flex items-center justify-center p-4" data-testid="finance-record-dialog"><form onSubmit={submit} className="pq-card relative w-full max-w-3xl max-h-[92vh] overflow-y-auto p-6">
      <button type="button" onClick={()=>{setForm(null);setEditing(null)}} className="absolute right-5 top-5 text-[#78665E]" aria-label="Close"><X size={18}/></button>
      <p className="pq-eyebrow">{editing ? "Correct record" : "New record"}</p><h2 className="font-serif text-2xl mb-5">{editing ? "Edit " : "Record "}{isExpenses?"expense":"bank deposit"}</h2>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label={isExpenses?"Expense date *":"Deposit date *"}><input required type="date" className={inputClass} value={form.date} onChange={e=>set("date",e.target.value)}/></Field>
        <Field label={isExpenses?"Amount (UGX) *":"Deposit amount (UGX) *"}><input required min="1" step="0.01" type="number" className={inputClass} value={form.amount} onChange={e=>set("amount",e.target.value)}/></Field>
        {isExpenses ? <>
          <Field label="Recipient / payee *"><input required className={inputClass} value={form.recipient} onChange={e=>set("recipient",e.target.value)}/></Field>
          <Field label="Authorized / issued by"><input className={inputClass} value={form.authorized_by} onChange={e=>set("authorized_by",e.target.value)}/></Field>
          <Field label="Category"><select className={inputClass} value={form.category} onChange={e=>set("category",e.target.value)}>{EXPENSE_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></Field>
          <Field label="Payment method"><select className={inputClass} value={form.method} onChange={e=>set("method",e.target.value)}>{METHODS.map(m=><option key={m}>{m}</option>)}</select></Field>
          <div className="sm:col-span-2"><Field label="Reason / description *"><textarea required rows={2} className={inputClass} value={form.description} onChange={e=>set("description",e.target.value)}/></Field></div>
        </> : <>
          <Field label="Source of funds"><select className={inputClass} value={form.source} onChange={e=>{set("source",e.target.value);if(e.target.value!=="Customer payment")set("payment_id","")}}>{["Customer payment","Business funds","Other source"].map(s=><option key={s}>{s}</option>)}</select></Field>
          <Field label="Destination bank account *"><input required className={inputClass} value={form.bank_account} onChange={e=>set("bank_account",e.target.value)} placeholder="Bank name / account identifier"/></Field>
          <Field label="Client (optional)"><select className={inputClass} value={form.client_id} onChange={e=>set("client_id",e.target.value)}><option value="">No client / other funds</option>{clients.map(c=><option key={c.id} value={c.id}>{c.full_name}</option>)}</select></Field>
          <Field label="Related customer payment">{form.source==="Customer payment" ? <select required className={inputClass} value={form.payment_id} onChange={e=>{const p=payments.find(x=>x.id===e.target.value);set("payment_id",e.target.value);if(p)set("client_id",p.client_id)}}><option value="">Select payment</option>{payments.map(p=><option key={p.id} value={p.id}>{p.client_name} · {p.order_number} · {money(p.amount)} · {p.date}</option>)}</select>:<select className={inputClass} value={form.payment_id} onChange={e=>set("payment_id",e.target.value)}><option value="">Not linked to a payment</option>{payments.map(p=><option key={p.id} value={p.id}>{p.client_name} · {p.order_number} · {money(p.amount)}</option>)}</select>}</Field>
          <div className="sm:col-span-2"><Field label="Description"><textarea rows={2} className={inputClass} value={form.description} onChange={e=>set("description",e.target.value)}/></Field></div>
        </>}
        {form.payment_id && <><Field label="Amount allocated from selected payment (UGX)"><input type="number" min="0.01" step="0.01" className={inputClass} value={form.allocation_amount} onChange={e=>set("allocation_amount",e.target.value)} placeholder="Defaults to transaction amount"/></Field><div className="text-xs text-[#78665E] self-center">{payment ? <>Original payment: <strong>{money(payment.amount)}</strong><br/>Already allocated: <strong>{money(payment.total_allocated)}</strong><br/>Remaining: <strong>{money(payment.remaining_unallocated)}</strong></> : "Choose a payment to see available allocation."}</div></>}
        <Field label="Reference number"><input className={inputClass} value={form.reference} onChange={e=>set("reference",e.target.value)} placeholder="Invoice / bank transaction / voucher"/></Field>
        <Field label="Supporting image (optional)"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className={inputClass} onChange={uploadAttachment} disabled={uploadingAttachment}/><span className="text-xs text-[#78665E] mt-1 block">{uploadingAttachment ? "Uploading…" : form.attachment ? "Attachment uploaded — save this record to link it." : "Upload a JPG, PNG, WEBP, or GIF image up to 10 MB."}</span>{form.attachment && editing && <a className="text-xs text-[#B76E60] underline mt-1 inline-block" href={fileUrl(form.attachment)} target="_blank" rel="noreferrer">View saved attachment</a>}</Field>
        <div className="sm:col-span-2"><Field label="Notes"><textarea rows={2} className={inputClass} value={form.notes} onChange={e=>set("notes",e.target.value)}/></Field></div>
      </div>
      <div className="mt-6 flex justify-end gap-3"><button type="button" className="pq-btn-secondary" onClick={()=>{setForm(null);setEditing(null)}}>Cancel</button><button disabled={saving || uploadingAttachment} className="pq-btn-primary" type="submit">{saving?"Saving…":uploadingAttachment?"Uploading attachment…":editing?"Save correction":"Save record"}</button></div>
      <p className="text-xs text-[#78665E] mt-4">Financial records are restricted to Administrators. Recording deposits or expenses never creates a customer payment or receipt and never changes an order balance.</p>
    </form></div>}
  </div>;
}
