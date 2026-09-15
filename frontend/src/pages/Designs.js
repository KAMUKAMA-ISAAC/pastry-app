import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Filter, X } from "lucide-react";
import api, { fileUrl } from "../lib/api";
import { CategoryBadge, EmptyState, PageHeader } from "../components/ui-bits";

export default function Designs() {
  const [items, setItems] = useState(null);
  const [designCats, setDesignCats] = useState([]);
  const [flavors, setFlavors] = useState([]);
  const [types, setTypes] = useState([]);
  const [filters, setFilters] = useState({ category: "", cake_type: "", flavor: "" });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/catalog/design-categories").then((r) => setDesignCats(r.data)).catch(() => {});
    api.get("/catalog/flavors").then((r) => setFlavors(r.data)).catch(() => {});
    api.get("/catalog/cake-types").then((r) => setTypes(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    api.get(`/designs?${qs}`).then((r) => setItems(r.data)).catch(() => {});
  }, [filters]);

  const activeCount = Object.values(filters).filter(Boolean).length;

  const clearFilters = () => setFilters({ category: "", cake_type: "", flavor: "" });

  return (
    <div data-testid="designs-page">
      <PageHeader eyebrow="Atelier Archive" title="Cake Design Gallery" testid="designs-header" />

      {/* ============================================================
          Mobile: compact "Filters" toggle button
          Desktop (sm+): inline row of dropdowns as before
      ============================================================ */}
      <div className="mb-6">
        {/* Mobile filter toggle */}
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          className="sm:hidden w-full flex items-center justify-between pq-btn-outline !py-2.5 !px-4"
          data-testid="designs-filters-toggle"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <Filter size={15} />
            Filters
            {activeCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-[#2B1B17] text-[#FAF8F5] text-[10px] font-bold">
                {activeCount}
              </span>
            )}
          </span>
          <span className="text-xs text-[#78665E]">
            {filtersOpen ? "Hide" : "Show"}
          </span>
        </button>

        {/* Desktop inline filters */}
        <div className="hidden sm:flex flex-wrap gap-2.5">
          <select
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            className="pq-input !w-52 !py-2"
            data-testid="designs-filter-category"
          >
            <option value="">All design categories</option>
            {designCats.map((d) => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>
          <select
            value={filters.cake_type}
            onChange={(e) => setFilters({ ...filters, cake_type: e.target.value })}
            className="pq-input !w-48 !py-2"
            data-testid="designs-filter-type"
          >
            <option value="">All cake types</option>
            {types.map((t) => (
              <option key={t.id} value={t.name}>{t.name}</option>
            ))}
          </select>
          <select
            value={filters.flavor}
            onChange={(e) => setFilters({ ...filters, flavor: e.target.value })}
            className="pq-input !w-48 !py-2"
            data-testid="designs-filter-flavor"
          >
            <option value="">All flavors</option>
            {flavors.map((f) => (
              <option key={f.id} value={f.name}>{f.name}</option>
            ))}
          </select>
        </div>

        {/* Mobile expanded filter panel */}
        {filtersOpen && (
          <div className="sm:hidden mt-3 pq-card p-4 space-y-3" data-testid="designs-filters-panel">
            <div>
              <label className="block text-[10px] font-semibold tracking-[0.18em] uppercase text-[#5D4A43] mb-1.5">
                Design Category
              </label>
              <select
                value={filters.category}
                onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                className="pq-input !py-2 w-full"
                data-testid="designs-filter-category-mobile"
              >
                <option value="">All design categories</option>
                {designCats.map((d) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold tracking-[0.18em] uppercase text-[#5D4A43] mb-1.5">
                Cake Type
              </label>
              <select
                value={filters.cake_type}
                onChange={(e) => setFilters({ ...filters, cake_type: e.target.value })}
                className="pq-input !py-2 w-full"
                data-testid="designs-filter-type-mobile"
              >
                <option value="">All cake types</option>
                {types.map((t) => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold tracking-[0.18em] uppercase text-[#5D4A43] mb-1.5">
                Flavor
              </label>
              <select
                value={filters.flavor}
                onChange={(e) => setFilters({ ...filters, flavor: e.target.value })}
                className="pq-input !py-2 w-full"
                data-testid="designs-filter-flavor-mobile"
              >
                <option value="">All flavors</option>
                {flavors.map((f) => (
                  <option key={f.id} value={f.name}>{f.name}</option>
                ))}
              </select>
            </div>

            {activeCount > 0 && (
              <button
                onClick={clearFilters}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-[#B76E60] hover:text-[#9E4A3B] py-2 transition-colors"
                data-testid="designs-clear-filters"
              >
                <X size={13} />
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* ============================================================
          Gallery grid — unchanged
      ============================================================ */}
      {!items ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[4/5] pq-card animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          testid="designs-empty"
          title="No confirmed designs yet"
          hint="When you upload a final confirmed cake design to an order, it joins this private gallery."
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="designs-grid">
          {items.map((d) => (
            <button
              key={d.order_id}
              onClick={() => navigate(`/orders/${d.order_id}`)}
              data-testid={`design-${d.order_number}`}
              className="group text-left pq-card overflow-hidden hover:border-[#D8A49B]/60 transition-colors"
            >
              <div className="aspect-[4/5] overflow-hidden bg-[#F5EFEA]">
                <img
                  src={fileUrl(d.image.storage_path)}
                  alt={`${d.cake_type} cake — ${d.design_category || "custom"} design`}
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                />
              </div>
              <div className="p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-[#2B1B17] truncate">
                    {d.design_category || d.cake_type}
                  </p>
                  <CategoryBadge category={d.category} />
                </div>
                <p className="text-xs text-[#78665E] mt-1 truncate">
                  {d.flavor} · {d.client_name}
                </p>
                <p className="text-[10px] text-[#B9ABA2] mt-0.5">
                  {d.order_number} · {d.date_needed}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
