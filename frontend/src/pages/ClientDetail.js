import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api, { fmtErr, money } from "../lib/api";
import { CategoryBadge, PageHeader, PayBadge, StatusBadge } from "../components/ui-bits";
import { ClientDialog } from "./Clients";

/* ============================================================
   InfoRow — only renders if the value exists. Hides empty rows.
   ============================================================ */
function InfoRow({ label, value }) {
  if (!value || value === "—" || value === "-") return null;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-[#B9ABA2]">{label}</p>
      <p className="text-sm text-[#2B1B17] mt-1 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    return api
      .get(`/clients/${id}`)
      .then((r) => setData(r.data))
      .catch(() => toast.error("Client not found"));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) {
    return <div className="pq-card h-96 animate-pulse" data-testid="client-detail-loading" />;
  }

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
    ["Phone", client.phone],
    ["WhatsApp", client.whatsapp],
    ["Email", client.email],
    ["Address", client.address],
    ["Preferred contact", client.preferred_contact],
    ["Client since", client.created_at?.slice(0, 10)],
  ];
  const prefs = [
    ["Favorite flavor", client.favorite_flavor],
    ["Preferred style", client.preferred_style],
    ["Preferred colors", client.preferred_colors],
    ["Special preferences", client.special_preferences],
    ["Important notes", client.important_notes],
    ["Internal notes", client.notes],
  ];

  return (
    <div data-testid="client-detail-page">
      <PageHeader eyebrow="Client Profile" title={client.full_name} testid="client-detail-header" />

      {/* ============================================================
          Action buttons — 2×2 grid on mobile, inline row on desktop
      ============================================================ */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 mb-6">
        <button
          onClick={() => setEditing(true)}
          className="pq-btn-outline justify-center whitespace-nowrap"
          data-testid="edit-client-btn"
        >
          <Pencil size={14} /> Edit
        </button>

        <button
          onClick={() => navigate(`/orders/new?client=${id}`)}
          className="pq-btn-primary justify-center whitespace-nowrap"
          data-testid="new-order-for-client-btn"
        >
          <Plus size={15} /> New Order
        </button>

        <button
          onClick={toggleArchive}
          className="pq-btn-outline justify-center whitespace-nowrap"
          data-testid="archive-client-btn"
        >
          {client.archived ? (
            <>
              <ArchiveRestore size={14} /> Restore
            </>
          ) : (
            <>
              <Archive size={14} /> Archive
            </>
          )}
        </button>

        <button
          onClick={deleteClient}
          className="pq-btn-outline justify-center whitespace-nowrap !text-[#9E2A2B] !border-[#F5CDCD] hover:!bg-[#FDF0F0]"
          data-testid="delete-client-btn"
        >
          <Trash2 size={14} /> Delete
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <section className="pq-card p-5 sm:p-6" data-testid="client-info-card">
            <p className="pq-eyebrow mb-4">Client Information</p>
            <div className="space-y-4">
              {info.map(([k, v]) => (
                <InfoRow key={k} label={k} value={v} />
              ))}
            </div>
          </section>

          <section className="pq-card p-5 sm:p-6" data-testid="client-prefs-card">
            <p className="pq-eyebrow mb-4">Client Preferences</p>
            <div className="space-y-4">
              {prefs.map(([k, v]) => (
                <InfoRow key={k} label={k} value={v} />
              ))}
            </div>
          </section>

          {feedback.length > 0 && (
            <section className="pq-card p-5 sm:p-6" data-testid="client-feedback-card">
              <p className="pq-eyebrow mb-4">Feedback</p>
              {feedback.map((f) => (
                <div key={f.id} className="text-sm mb-3 last:mb-0">
                  <p className="text-[#C98E56] font-semibold">{f.rating}/5</p>
                  <p className="text-[#4A3B32]">{f.feedback}</p>
                </div>
              ))}
            </section>
          )}
        </div>

        <section className="lg:col-span-2 pq-card overflow-hidden self-start" data-testid="client-orders-card">
          <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-4 border-b border-[#F2EAE1]">
            <p className="pq-eyebrow">Order History</p>
          </div>

          {orders.length === 0 ? (
            <p className="p-8 text-sm text-[#B9ABA2] text-center" data-testid="client-no-orders">
              No orders yet for this client.
            </p>
          ) : (
            <>
              {/* ============ Mobile: order cards ============ */}
              <div className="sm:hidden divide-y divide-[#F2EAE1]">
                {orders.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => navigate(`/orders/${o.id}`)}
                    className="w-full text-left p-4 hover:bg-[#FDFBF7] transition-colors"
                    data-testid={`client-order-${o.order_number}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-[#2B1B17]">
                            {o.order_number}
                          </span>
                          <CategoryBadge category={o.category} />
                        </div>
                        <p className="text-xs text-[#78665E] mt-1 truncate">
                          {o.cake_type} · {o.flavor} · {o.size}
                        </p>
                      </div>
                      <StatusBadge s={o.status} />
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#F2EAE1] text-xs">
                      <span className="text-[#78665E]">Needed {o.date_needed}</span>
                      <PayBadge s={o.payment_status} />
                    </div>

                    <div className="flex items-center justify-between mt-2 text-xs">
                      <span className="text-[#78665E]">
                        Total <span className="font-medium text-[#2B1B17]">{money(o.total_price)}</span>
                      </span>
                      <span className="text-[#78665E]">
                        Balance{" "}
                        <span className="font-medium text-[#9E2A2B]">
                          {money((o.total_price || 0) - (o.total_paid || 0))}
                        </span>
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {/* ============ Desktop: existing table ============ */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-[#EDE5DE] bg-[#FDFBF7]">
                    <tr>
                      <th className="pq-th">Order</th>
                      <th className="pq-th">Cake</th>
                      <th className="pq-th">Needed</th>
                      <th className="pq-th">Total</th>
                      <th className="pq-th">Paid</th>
                      <th className="pq-th">Balance</th>
                      <th className="pq-th">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F2EAE1]">
                    {orders.map((o) => (
                      <tr
                        key={o.id}
                        onClick={() => navigate(`/orders/${o.id}`)}
                        className="hover:bg-[#FDFBF7] cursor-pointer"
                        data-testid={`client-order-${o.order_number}`}
                      >
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
                        <td className="pq-td">
                          <div className="flex gap-1.5">
                            <StatusBadge s={o.status} />
                            <PayBadge s={o.payment_status} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>

      {editing && <ClientDialog initial={client} onClose={() => setEditing(false)} onSaved={load} />}
    </div>
  );
}
