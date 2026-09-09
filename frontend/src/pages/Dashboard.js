import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarDays, MessageSquare, Plus, UserPlus, Banknote } from "lucide-react";
import api, { fileUrl, money } from "../lib/api";
import { CategoryBadge, EmptyState, PageHeader, PayBadge, StatCard, StatusBadge, UrgencyPill } from "../components/ui-bits";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/dashboard").then((r) => setData(r.data)).catch(() => {});
  }, []);

  if (!data)
    return (
      <div className="space-y-6" data-testid="dashboard-loading">
        <div className="h-10 w-64 bg-[#F2EAE1] rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 bg-white border border-[#EDE5DE] rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );

  const s = data.stats;
  const stats = [
    { label: "Total Clients", value: s.total_clients, testid: "stat-total-clients" },
    { label: "Total Orders", value: s.total_orders, testid: "stat-total-orders" },
    { label: "Upcoming Cakes", value: s.upcoming_cakes, testid: "stat-upcoming-cakes" },
    { label: "Pending Payments", value: s.pending_payments, testid: "stat-pending-payments" },
    { label: "Total Revenue", value: money(s.total_revenue), testid: "stat-total-revenue" },
    { label: "Outstanding Balance", value: money(s.outstanding_balance), testid: "stat-outstanding-balance" },
    { label: "Orders This Month", value: s.orders_this_month, testid: "stat-orders-this-month" },
    { label: "Completed Orders", value: s.completed_orders, testid: "stat-completed-orders" },
  ];

  const actions = [
    { label: "New Client", icon: UserPlus, to: "/clients?new=1", testid: "quick-new-client" },
    { label: "New Order", icon: Plus, to: "/orders/new", testid: "quick-new-order" },
    { label: "Record Payment", icon: Banknote, to: "/orders", testid: "quick-record-payment" },
    { label: "Add Feedback", icon: MessageSquare, to: "/feedback?new=1", testid: "quick-add-feedback" },
    { label: "View Calendar", icon: CalendarDays, to: "/calendar", testid: "quick-view-calendar" },
  ];

  return (
    <div data-testid="dashboard-page">
      <PageHeader eyebrow="Studio Overview" title="Good day, PASTRY QUIN" testid="dashboard-header" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8" data-testid="dashboard-stats">
        {stats.map((st) => (
          <StatCard key={st.label} {...st} />
        ))}
      </div>

      <div className="flex flex-wrap gap-2.5 mb-9" data-testid="dashboard-quick-actions">
        {actions.map(({ label, icon: Icon, to, testid }) => (
          <Link key={label} to={to} data-testid={testid}
            className="pq-btn-outline !rounded-full !px-4 !py-2 text-[13px]">
            <Icon size={14} strokeWidth={1.75} /> {label}
          </Link>
        ))}
      </div>

      <div className="flex items-end justify-between mb-4">
        <h2 className="font-serif text-2xl text-[#2B1B17]">Upcoming Cakes</h2>
        <Link to="/orders" className="text-sm text-[#B76E60] hover:text-[#9E4A3B]" data-testid="view-all-orders-link">View all orders</Link>
      </div>

      {data.upcoming.length === 0 ? (
        <EmptyState
          testid="dashboard-empty-upcoming"
          title="No upcoming cakes yet"
          hint="When you create orders, the next cakes to bake will appear here in date order."
          action={<Link to="/orders/new" className="pq-btn-primary" data-testid="empty-new-order-btn"><Plus size={15} /> Commission New Cake Order</Link>}
        />
      ) : (
        <div className="pq-card divide-y divide-[#F2EAE1]" data-testid="dashboard-upcoming-list">
          {data.upcoming.map((o) => (
            <button
              key={o.id}
              onClick={() => navigate(`/orders/${o.id}`)}
              data-testid={`upcoming-order-${o.order_number}`}
              className="w-full flex items-center gap-4 px-5 py-4 hover:bg-[#FDFBF7] transition-colors text-left"
            >
              <div className="w-14 h-14 rounded-lg bg-[#F5EFEA] overflow-hidden shrink-0 border border-[#EDE5DE]">
                {o.final_image ? (
                  <img src={fileUrl(o.final_image)} alt={`${o.cake_type} cake design`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-serif text-[#C9B8AE] text-lg">PQ</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-[#2B1B17] text-sm">{o.client_name}</p>
                  <CategoryBadge category={o.category} />
                </div>
                <p className="text-xs text-[#78665E] mt-0.5 truncate">
                  {o.cake_type} · {o.flavor} · {o.size} · {o.fulfillment === "delivery" ? "Delivery" : "Pickup"}
                </p>
              </div>
              <div className="hidden sm:block text-right mr-2">
                <p className="text-sm font-medium text-[#2B1B17]">{o.date_needed}</p>
                <p className="text-xs text-[#78665E]">{o.time_needed || "—"}</p>
              </div>
              <div className="hidden md:flex flex-col items-end gap-1.5">
                <StatusBadge s={o.status} />
                <PayBadge s={o.payment_status} />
              </div>
              <UrgencyPill dateNeeded={o.date_needed} testid={`urgency-${o.order_number}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
