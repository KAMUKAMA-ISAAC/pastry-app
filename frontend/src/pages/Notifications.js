import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCheck } from "lucide-react";
import api from "../lib/api";
import { EmptyState, PageHeader } from "../components/ui-bits";

const TYPE_STYLES = {
  alert: "border-l-[#9E2A2B]",
  deposit: "border-l-[#9E2A2B]",
  due: "border-l-[#C98E56]",
  payment: "border-l-[#7A9B6E]",
  order: "border-l-[#B76E60]",
  info: "border-l-[#B9ABA2]",
};

export default function Notifications() {
  const [data, setData] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    api.get("/notifications").then((r) => setData(r.data)).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const open = async (n) => {
    await api.post(`/notifications/${n.id}/read`).catch(() => {});
    if (n.order_id) navigate(`/orders/${n.order_id}`);
    else load();
  };

  return (
    <div data-testid="notifications-page">
      <PageHeader eyebrow="Studio Alerts" title="Notifications" testid="notifications-header">
        <button onClick={async () => { await api.post("/notifications/read-all"); load(); }} className="pq-btn-outline" data-testid="mark-all-read-btn">
          <CheckCheck size={14} /> Mark all read
        </button>
      </PageHeader>
      {!data ? (
        <div className="pq-card h-64 animate-pulse" />
      ) : data.items.length === 0 ? (
        <EmptyState testid="notifications-empty" title="All quiet in the atelier"
          hint="Deposit reminders, upcoming cake alerts and payment notices will appear here." />
      ) : (
        <div className="space-y-2.5" data-testid="notifications-list">
          {data.items.map((n) => (
            <button key={n.id} onClick={() => open(n)} data-testid={`notification-${n.id}`}
              className={`w-full text-left pq-card border-l-4 ${TYPE_STYLES[n.type] || TYPE_STYLES.info} px-5 py-4 hover:border-[#D8A49B]/50 transition-colors ${n.read ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[#2B1B17]">{n.title}</p>
                <p className="text-[11px] text-[#B9ABA2] shrink-0">{n.created_at?.slice(0, 16).replace("T", " ")}</p>
              </div>
              <p className="text-sm text-[#78665E] mt-0.5">{n.message}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
