import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api, { fmtErr, money } from "../lib/api";
import { CategoryBadge, PageHeader, PayBadge, StatusBadge } from "../components/ui-bits";
import { ClientDialog } from "./Clients";

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);

  const load = () => api.get(`/clients/${id}`).then((r) => setData(r.data)).catch(() => toast.error("Client not found"));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (!data) return <div className="pq-card h-96 animate-pulse" data-testid="client-detail-loading" />;
  const { client, orders, feedback } = data;

  const toggleArchive = async () => {
    await api.post(`/clients/${id}/${client.archived ? "restore" : "archive"}`).catch((e) => toast.error(fmtErr(e)));
    toast.success(client.archived ? "Client restored" : "Client archived");
    load();
  };

  const deleteClient = async () => {
    if (!window.confirm(`Permanently delete ${client.full_name}? This cannot be undone.`)) return;
    try {
      await api.delete(`/clients/${id}`);
      toast.success("Client deleted");
      navigate("/clients");
    } catch (err) {
      toast.error(fmtErr(err));
    }
  };

  const info = [
    ["Phone", client.phone], ["WhatsApp", client.whatsapp], ["Email", client.email],
    ["Address", client.address], ["Preferred contact", client.preferred_contact],
    ["Client since", client.created_at?.slice(0, 10)],
  ];
  const prefs = [
    ["Favorite flavor", client.favorite_flavor], ["Preferred style", client.preferred_style],
    ["Preferred colors", client.preferred_colors], ["Special preferences", client.special_preferences],
    ["Important notes", client.important_notes], ["Internal notes", client.notes],
  ];

  return (
    <div data-testid="client-detail-page">
      <PageHeader eyebrow="Client Profile" title={client.full_name} testid="client-detail-header">
        <button onClick={() => setEditing(true)} className="pq-btn-outline" data-testid="edit-client-btn"><Pencil size={14} /> Edit</button>
        <button onClick={() => navigate(`/orders/new?client=${id}`)} className="pq-btn-primary" data-testid="new-order-for-client-btn"><Plus size={15} /> New Order</button>
        <button onClick={toggleArchive} className="pq-btn-outline" data-testid="archive-client-btn">
          {client.archived ? <><ArchiveRestore size={14} /> Restore</> : <><Archive size={14} /> Archive</>}
        </button>
        <button onClick={deleteClient} className="pq-btn-outline !text-[#9E2A2B] !border-[#F5CDCD] hover:!bg-[#FDF0F0]" data-testid="delete-client-btn">
          <Trash2 size={14} /> Delete
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <section className="pq-card p-6" data-testid="client-info-card">
            <p className="pq-eyebrow mb-4">Client Information</p>
            <div className="space-y-3">
              {info.map(([k, v]) => (
                <div key={k}>
                  <p className="text-[11px] uppercase tracking-wider text-[#B9ABA2]">{k}</p>
                  <p className="text-sm text-[#2B1B17] mt-0.5">{v || "—"}</p>
                </div>
              ))}
            </div>
          </section>
          <section className="pq-card p-6" data-testid="client-prefs-card">
            <p className="pq-eyebrow mb-4">Client Preferences</p>
            <div className="space-y-3">
              {prefs.map(([k, v]) => (
                <div key={k}>
                  <p className="text-[11px] uppercase tracking-wider text-[#B9ABA2]">{k}</p>
                  <p className="text-sm text-[#2B1B17] mt-0.5 whitespace-pre-wrap">{v || "—"}</p>
                </div>
              ))}
            </div>
          </section>
          {feedback.length > 0 && (
            <section className="pq-card p-6" data-testid="client-feedback-card">
              <p className="pq-eyebrow mb-4">Feedback</p>
              {feedback.map((f) => (
                <div key={f.id} className="text-sm mb-3">
                  <p className="text-[#C98E56] font-semibold">{f.rating}/5</p>
                  <p className="text-[#4A3B32]">{f.feedback}</p>
                </div>
              ))}
            </section>
          )}
        </div>

        <section className="lg:col-span-2 pq-card overflow-hidden self-start" data-testid="client-orders-card">
          <div className="px-6 pt-6 pb-4 border-b border-[#F2EAE1]">
            <p className="pq-eyebrow">Order History</p>
          </div>
          {orders.length === 0 ? (
            <p className="p-8 text-sm text-[#B9ABA2] text-center" data-testid="client-no-orders">No orders yet for this client.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-[#EDE5DE] bg-[#FDFBF7]">
                  <tr><th className="pq-th">Order</th><th className="pq-th">Cake</th><th className="pq-th">Needed</th><th className="pq-th">Total</th><th className="pq-th">Paid</th><th className="pq-th">Balance</th><th className="pq-th">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-[#F2EAE1]">
                  {orders.map((o) => (
                    <tr key={o.id} onClick={() => navigate(`/orders/${o.id}`)} className="hover:bg-[#FDFBF7] cursor-pointer" data-testid={`client-order-${o.order_number}`}>
                      <td className="pq-td">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#2B1B17]">{o.order_number}</span>
                          <CategoryBadge category={o.category} />
                        </div>
                      </td>
                      <td className="pq-td">{o.cake_type} · {o.flavor} · {o.size}</td>
                      <td className="pq-td">{o.date_needed}</td>
                      <td className="pq-td">{money(o.total_price)}</td>
                      <td className="pq-td">{money(o.total_paid)}</td>
                      <td className="pq-td">{money((o.total_price || 0) - (o.total_paid || 0))}</td>
                      <td className="pq-td"><div className="flex gap-1.5"><StatusBadge s={o.status} /><PayBadge s={o.payment_status} /></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      {editing && <ClientDialog initial={client} onClose={() => setEditing(false)} onSaved={load} />}
    </div>
  );
}
