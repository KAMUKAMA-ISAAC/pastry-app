import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ShoppingBag, CalendarDays, Users, Images, Sparkles, Cake,
  Banknote, Receipt, MessageSquare, ChartPie, Bell, Settings, Plus, Search,
  LogOut, Menu, X,
} from "lucide-react";
import api, { fileUrl } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/orders", label: "Orders", icon: ShoppingBag },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/designs", label: "Cake Designs", icon: Images },
  { to: "/flavors", label: "Flavors", icon: Sparkles },
  { to: "/cake-types", label: "Cake Types", icon: Cake },
  { to: "/payments", label: "Payments", icon: Banknote },
  { to: "/receipts", label: "Receipts", icon: Receipt },
  { to: "/feedback", label: "Feedback", icon: MessageSquare },
  { to: "/reports", label: "Reports", icon: ChartPie },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/settings", label: "Settings", icon: Settings },
];

function SidebarContent({ settings, onNavigate }) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-7 pb-6 border-b border-[#EDE5DE]">
        {settings?.logo_path ? (
          <img src={fileUrl(settings.logo_path)} alt="PASTRY QUIN logo" className="h-10 object-contain mb-1" data-testid="sidebar-logo" />
        ) : (
          <p className="font-serif text-[22px] tracking-[0.18em] text-[#2B1B17]" data-testid="sidebar-wordmark">PASTRY QUIN</p>
        )}
        <p className="text-[9px] font-semibold tracking-[0.3em] uppercase text-[#8C6D62] mt-1">{settings?.tagline || "Taste Royalty"}</p>
      </div>
      <nav className="flex-1 overflow-y-auto px-3.5 py-4 space-y-0.5" data-testid="sidebar-nav">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
            className={({ isActive }) =>
              `px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 flex items-center gap-3 ${
                isActive
                  ? "bg-[#2B1B17] text-[#FAF8F5] shadow-sm"
                  : "text-[#5A483E] hover:text-[#2B1B17] hover:bg-[#F2EAE1]"
              }`
            }
          >
            <Icon size={16} strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-6 py-4 border-t border-[#EDE5DE]">
        <p className="text-[10px] text-[#B9ABA2] tracking-wide">Internal studio system</p>
      </div>
    </div>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [unread, setUnread] = useState(0);
  const [q, setQ] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    api.get("/settings").then((r) => setSettings(r.data)).catch(() => {});
    api.get("/notifications").then((r) => setUnread(r.data.unread)).catch(() => {});
  }, []);

  const submitSearch = (e) => {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-64 bg-[#FAF8F5] border-r border-[#EDE5DE] z-30">
        <SidebarContent settings={settings} />
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-[#2B1B17]/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-[#FAF8F5] border-r border-[#EDE5DE]">
            <button onClick={() => setMobileOpen(false)} className="absolute top-5 right-4 text-[#78665E]" data-testid="mobile-menu-close">
              <X size={20} />
            </button>
            <SidebarContent settings={settings} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-40 bg-[#FAF8F5]/90 backdrop-blur-md border-b border-[#EDE5DE] px-4 sm:px-8 py-3.5 flex items-center gap-3">
          <button className="lg:hidden text-[#4A3B32]" onClick={() => setMobileOpen(true)} data-testid="mobile-menu-open">
            <Menu size={20} />
          </button>
          <form onSubmit={submitSearch} className="flex-1 max-w-md relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#B9ABA2]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search clients, orders, flavors…"
              data-testid="global-search-input"
              className="pq-input pl-9 py-2"
            />
          </form>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => navigate("/orders/new")} className="pq-btn-primary !py-2" data-testid="header-new-order-btn">
              <Plus size={15} /> <span className="hidden sm:inline">New Order</span>
            </button>
            <button
              onClick={() => navigate("/notifications")}
              className="relative p-2 rounded-lg text-[#5A483E] hover:bg-[#F2EAE1] transition-colors"
              data-testid="header-notifications-btn"
            >
              <Bell size={18} strokeWidth={1.75} />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] rounded-full bg-[#9E2A2B] text-white text-[10px] font-bold flex items-center justify-center px-1" data-testid="header-unread-badge">
                  {unread}
                </span>
              )}
            </button>
            <div className="flex items-center gap-2.5 pl-2 border-l border-[#EDE5DE]">
              <div className="w-8 h-8 rounded-full bg-[#B76E60] text-white flex items-center justify-center text-xs font-bold" data-testid="header-user-avatar">
                {(user?.name || "Q")[0].toUpperCase()}
              </div>
              <button onClick={logout} className="p-2 rounded-lg text-[#5A483E] hover:bg-[#F2EAE1] transition-colors" title="Sign out" data-testid="header-logout-btn">
                <LogOut size={16} strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </header>
        <main className="px-4 sm:px-8 py-8 max-w-[1400px]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
