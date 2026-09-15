import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, SlidersHorizontal, X } from "lucide-react";
import api, { fileUrl, money } from "../lib/api";
import { CategoryBadge, EmptyState, PageHeader, PayBadge, StatusBadge, UrgencyPill } from "../components/ui-bits";

const TABS = [
  { id: "", label: "All Studio Orders", testid: "tab-all-orders" },
  { id: "wedding_intro", label: "Wedding & Introduction", testid: "tab-wedding-intro" },
  { id: "normal", label: "Normal (Small Cakes)", testid: "tab-normal-cakes" },
];

const PAYMENT_STATUSES = ["Unpaid", "Partially Paid", "Fully Paid", "Overpaid"];

export default function Orders() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);
  const [flavors, setFlavors] = useState([]);
  const [types, setTypes] = useState([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const navigate = useNavigate();

  const get = (k) => params.get(k) || "";
  const setParam = (k, v) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    if (k !== "page") p.delete("page");
    setParams(p);
  };

  const load = useCallback(() => {
    const qs = params.toString();
    api.get(`/orders?${qs}`).then((r) => setData(r.data)).catch(() => {});
  }, [params]);

  useEffect(load, [load]);
  useEffect(() => {
    api.get("/orders/meta").then((r) => setMeta(r.data)).catch(() => {});
    api.get("/catalog/flavors").then((r) => setFlavors(r.data.filter((f) => f.active))).catch(() => {});
    api.get("/catalog/cake-types").then((r) => setTypes(r.data.filter((t) => t.active))).catch(() => {});
  }, []);

  const tab = get("category");
  const page = Number(get("page") || 1);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / 25)) : 1;

  /* Count active filters (excluding category tab and page) */
  const FILTER_KEYS = ["q", "status", "payment_status", "flavor", "cake_type", "fulfillment", "date_from", "date_to"];
  const activeFilterCount = FILTER_KEYS.filter((k) => get(k)).length;

  const clearFilters = () => {
    const p = new URLSearchParams(params);
    FILTER_KEYS.forEach((k) => p.delete(k));
    p.delete("page");
    setParams(p);
  };

  return (
    <div data-testid="orders-page">
      <PageHeader eyebrow="Order Ledger" title="Cake Orders" testid="orders-header" />

      {/* ============================================================
          New Order button — always visible below header
      ============================================================ */}
      <div className="mb-5">
        <Link
          to="/orders/new"
          className="pq-btn-primary w-full sm:w-auto justify-center"
          data-testid="new-order-btn"
        >
          <Plus size={15} /> New Order
        </Link>
      </div>

      {/* ============================================================
          Category tabs — horizontally scrollable on mobile
      ============================================================ */}
      <div
        className="flex gap-2 mb-5 border-b border-[#EDE5DE] overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0"
        data-testid="orders-category-tabs"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setParam("category", t.id)}
            data-testid={t.testid}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === t.id
                ? "border-[#2B1B17] text-[#2B1B17]"
                : "border-transparent text-[#78665E] hover:text-[#2B1B17]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ============================================================
          Filters — search always visible, rest collapses on mobile
      ============================================================ */}
      <div className="mb-5" data-testid="orders-filters">
        {/* Search input — always visible */}
        <input
          value={get("q")}
          onChange={(e) => setParam("q", e.target.value)}
          placeholder="Search order no, flavor, theme…"
          className="pq-input !py-2 w-full sm:!w-72 mb-3"
          data-testid="orders-search-input"
        />

        {/* Mobile: toggle for advanced filters */}
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          className="sm:hidden w-full flex items-center justify-between pq-btn-outline !py-2.5 !px-4 mb-3"
          data-testid="orders-filters-toggle"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <SlidersHorizontal size={15} />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-[#2B1B17] text-[#FAF8F5] text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </span>
          <span className="text-xs text-[#78665E]">
            {filtersOpen ? "Hide" : "Show"}
          </span>
        </button>

        {/* Desktop inline filters */}
        <div className="hidden sm:flex flex-wrap gap-2.5">
          <select value={get("status")} onChange={(e) => setParam("status", e.target.value)} className="pq-input !w-44 !py-2" data-testid="filter-status">
            <option value="">All statuses</option>
            {meta?.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={get("payment_status")} onChange={(e) => setParam("payment_status", e.target.value)} className="pq-input !w-40 !py-2" data-testid="filter-payment-status">
            <option value="">All payments</option>
            {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={get("flavor")} onChange={(e) => setParam("flavor", e.target.value)} className="pq-input !w-40 !py-2" data-testid="filter-flavor">
            <option value="">All flavors</option>
            {flavors.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
          </select>
          <select value={get("cake_type")} onChange={(e) => setParam("cake_type", e.target.value)} className="pq-input !w-40 !py-2" data-testid="filter-cake-type">
            <option value="">All types</option>
            {types.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
          <select value={get("fulfillment")} onChange={(e) => setParam("fulfillment", e.target.value)} className="pq-input !w-40 !py-2" data-testid="filter-fulfillment">
            <option value="">Pickup & Delivery</option>
            <option value="pickup">Pickup</option>
            <option value="delivery">Delivery</option>
          </select>
          <input type="date" value={get("date_from")} onChange={(e) => setParam("date_from", e.target.value)} className="pq-input !w-40 !py-2" data-testid="filter-date-from" />
          <input type="date" value={get("date_to")} onChange={(e) => setParam("date_to", e.target.value)} className="pq-input !w-40 !py-2" data-testid="filter-date-to" />
        </div>

        {/* Mobile expanded filter panel */}
        {filtersOpen && (
          <div className="sm:hidden pq-card p-4 space-y-3.5" data-testid="orders-filters-panel">
            <div>
              <label className="block text-[10px] font-semibold tracking-[0.18em] uppercase text-[#5D4A43] mb-1.5">
                Order Status
              </label>
              <select
                value={get("status")}
                onChange={(e) => setParam("status", e.target.value)}
                className="pq-input !py-2 w-full"
                data-testid="filter-status-mobile"
              >
                <option value="">All statuses</option>
                {meta?.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold tracking-[0.18em] uppercase text-[#5D4A43] mb-1.5">
                Payment Status
              </label>
              <select
                value={get("payment_status")}
                onChange={(e) => setParam("payment_status", e.target.value)}
                className="pq-input !py-2 w-full"
                data-testid="filter-payment-status-mobile"
              >
                <option value="">All payments</option>
                {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold tracking-[0.18em] uppercase text-[#5D4A43] mb-1.5">
                Flavor
              </label>
              <select
                value={get("flavor")}
                onChange={(e) => setParam("flavor", e.target.value)}
                className="pq-input !py-2 w-full"
                data-testid="filter-flavor-mobile"
              >
                <option value="">All flavors</option>
                {flavors.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold tracking-[0.18em] uppercase text-[#5D4A43] mb-1.5">
                Cake Type
              </label>
              <select
                value={get("cake_type")}
                onChange={(e) => setParam("cake_type", e.target.value)}
                className="pq-input !py-2 w-full"
                data-testid="filter-cake-type-mobile"
              >
                <option value="">All types</option>
                {types.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold tracking-[0.18em] uppercase text-[#5D4A43] mb-1.5">
                Fulfillment
              </label>
              <select
                value={get("fulfillment")}
                onChange={(e) => setParam("fulfillment", e.target.value)}
                className="pq-input !py-2 w-full"
                data-testid="filter-fulfillment-mobile"
              >
                <option value="">Pickup & Delivery</option>
                <option value="pickup">Pickup</option>
                <option value="delivery">Delivery</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold tracking-[0.18em] uppercase text-[#5D4A43] mb-1.5">
                  Needed From
                </label>
                <input
                  type="date"
                  value={get("date_from")}
                  onChange={(e) => setParam("date_from", e.target.value)}
                  className="pq-input !py-2 w-full"
                  data-testid="filter-date-from-mobile"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold tracking-[0.18em] uppercase text-[#5D4A43] mb-1.5">
                  Needed To
                </label>
                <input
                  type="date"
                  value={get("date_to")}
                  onChange={(e) => setParam("date_to", e.target.value)}
                  className="pq-input !py-2 w-full"
                  data-testid="filter-date-to-mobile"
                />
              </div>
            </div>

            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-[#B76E60] hover:text-[#9E4A3B] py-2 transition-colors border-t border-[#F2EAE1] pt-3"
                data-testid="orders-clear-filters"
              >
                <X size={13} />
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* ============================================================
          Results
      ============================================================ */}
      {!data ? (
        <div className="pq-card h-64 animate-pulse" />
      ) : data.items.length === 0 ? (
        <EmptyState
          testid="orders-empty"
          title="No orders found"
          hint="Commission your first cake order and it will appear in the ledger."
          action={
            <Link to="/orders/new" className="pq-btn-primary" data-testid="orders-empty-new-btn">
              <Plus size={15} /> New Order
            </Link>
          }
        />
      ) : (
        <>
          {/* Mobile: card list instead of table */}
          <div className="sm:hidden space-y-3" data-testid="orders-list-mobile">
            {data.items.map((o) => (
              <button
                key={o.id}
                onClick={() => navigate(`/orders/${o.id}`)}
                className="w-full text-left pq-card p-4 hover:border-[#D8A49B]/60 transition-colors"
                data-testid={`order-card-${o.order_number}`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-md bg-[#F5EFEA] overflow-hidden border border-[#EDE5DE] shrink-0">
                    {o.final_image && (
                      <img src={fileUrl(o.final_image)} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm text-[#2B1B17]">{o.order_number}</p>
                      <StatusBadge s={o.status} />
                    </div>
                    <p className="text-sm text-[#4A3B32] truncate mt-0.5">{o.client_name}</p>
                    <p className="text-xs text-[#78665E] truncate mt-0.5">
                      {o.cake_type} · {o.flavor} · {o.size}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#F2EAE1]">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#78665E]">{o.date_needed}</span>
                    <UrgencyPill dateNeeded={o.date_needed} />
                  </div>
                  <PayBadge s={o.payment_status} />
                </div>

                <div className="flex items-center justify-between mt-2 text-xs">
                  <span className="text-[#78665E]">
                    Total <span className="font-medium text-[#2B1B17]">{money(o.total_price)}</span>
                  </span>
                  <span className="text-[#78665E]">
                    Balance <span className="font-medium text-[#9E2A2B]">{money(o.balance)}</span>
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Desktop/tablet: existing table */}
          <div className="hidden sm:block pq-card overflow-x-auto" data-testid="orders-table">
            <table className="w-full">
              <thead className="border-b border-[#EDE5DE] bg-[#FDFBF7]">
                <tr>
                  <th className="pq-th">Order</th>
                  <th className="pq-th">Client</th>
                  <th className="pq-th">Category</th>
                  <th className="pq-th">Cake</th>
                  <th className="pq-th">Needed</th>
                  <th className="pq-th">Total</th>
                  <th className="pq-th">Balance</th>
                  <th className="pq-th">Payment</th>
                  <th className="pq-th">Status</th>
                  <th className="pq-th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2EAE1]">
                {data.items.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => navigate(`/orders/${o.id}`)}
                    className="hover:bg-[#FDFBF7] cursor-pointer transition-colors"
                    data-testid={`order-row-${o.order_number}`}
                  >
                    <td className="pq-td">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-md bg-[#F5EFEA] overflow-hidden border border-[#EDE5DE] shrink-0">
                          {o.final_image && (
                            <img src={fileUrl(o.final_image)} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                        <span className="font-semibold text-[#2B1B17]">{o.order_number}</span>
                      </div>
                    </td>
                    <td className="pq-td">{o.client_name}</td>
                    <td className="pq-td"><CategoryBadge category={o.category} /></td>
                    <td className="pq-td">{o.cake_type} · {o.flavor} · {o.size}</td>
                    <td className="pq-td">
                      <div className="flex items-center gap-2">
                        <span>{o.date_needed}</span>
                        <UrgencyPill dateNeeded={o.date_needed} />
                      </div>
                    </td>
                    <td className="pq-td font-medium text-[#2B1B17]">{money(o.total_price)}</td>
                    <td className="pq-td" data-testid={`balance-${o.order_number}`}>{money(o.balance)}</td>
                    <td className="pq-td"><PayBadge s={o.payment_status} /></td>
                    <td className="pq-td"><StatusBadge s={o.status} /></td>
                    <td className="pq-td text-[#B76E60] text-xs font-semibold">Open →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4 gap-3" data-testid="orders-pagination">
            <p className="text-xs text-[#78665E]">
              {data.total} orders · page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setParam("page", String(page - 1))}
                className="pq-btn-outline !py-1.5 !px-3 text-xs"
                data-testid="orders-prev-page"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setParam("page", String(page + 1))}
                className="pq-btn-outline !py-1.5 !px-3 text-xs"
                data-testid="orders-next-page"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
