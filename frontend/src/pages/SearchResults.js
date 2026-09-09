import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api, { money } from "../lib/api";
import { CategoryBadge, PageHeader, PayBadge, StatusBadge } from "../components/ui-bits";

export default function SearchResults() {
  const [params] = useSearchParams();
  const q = params.get("q") || "";
  const [data, setData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (q) api.get(`/search?q=${encodeURIComponent(q)}`).then((r) => setData(r.data)).catch(() => {});
  }, [q]);

  return (
    <div data-testid="search-results-page">
      <PageHeader eyebrow="Global Search" title={`Results for “${q}”`} testid="search-header" />
      {!data ? (
        <div className="pq-card h-64 animate-pulse" />
      ) : (
        <div className="space-y-8">
          <section>
            <p className="pq-eyebrow mb-3">Clients ({data.clients.length})</p>
            {data.clients.length === 0 ? <p className="text-sm text-[#B9ABA2]">No matching clients.</p> : (
              <div className="pq-card divide-y divide-[#F2EAE1]" data-testid="search-clients">
                {data.clients.map((c) => (
                  <button key={c.id} onClick={() => navigate(`/clients/${c.id}`)} className="w-full text-left px-5 py-3.5 hover:bg-[#FDFBF7]" data-testid={`search-client-${c.id}`}>
                    <p className="text-sm font-medium text-[#2B1B17]">{c.full_name}</p>
                    <p className="text-xs text-[#78665E]">{c.phone || c.email || "—"}</p>
                  </button>
                ))}
              </div>
            )}
          </section>
          <section>
            <p className="pq-eyebrow mb-3">Orders ({data.orders.length})</p>
            {data.orders.length === 0 ? <p className="text-sm text-[#B9ABA2]">No matching orders.</p> : (
              <div className="pq-card divide-y divide-[#F2EAE1]" data-testid="search-orders">
                {data.orders.map((o) => (
                  <button key={o.id} onClick={() => navigate(`/orders/${o.id}`)} className="w-full text-left px-5 py-3.5 hover:bg-[#FDFBF7] flex items-center justify-between gap-3" data-testid={`search-order-${o.order_number}`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-[#2B1B17]">{o.order_number}</p>
                        <CategoryBadge category={o.category} />
                      </div>
                      <p className="text-xs text-[#78665E]">{o.client_name} · {o.cake_type} · {o.flavor} · {o.date_needed} · {money(o.total_price)}</p>
                    </div>
                    <div className="flex gap-1.5"><StatusBadge s={o.status} /><PayBadge s={o.payment_status} /></div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
