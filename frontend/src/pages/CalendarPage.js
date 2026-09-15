import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays, addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth,
  isToday, startOfMonth, startOfWeek,
} from "date-fns";
import api from "../lib/api";
import { PageHeader, StatusBadge } from "../components/ui-bits";

const DOT = {
  Confirmed: "bg-[#7A9B6E]", "Deposit Paid": "bg-[#7A9B6E]", "In Preparation": "bg-[#C98E56]",
  Baking: "bg-[#C98E56]", Decorating: "bg-[#A67BA6]", Ready: "bg-[#A67BA6]",
  Completed: "bg-[#B9ABA2]", Cancelled: "bg-[#D8A49B]", Inquiry: "bg-[#B9ABA2]",
  "Deposit Pending": "bg-[#9E2A2B]", "Picked Up": "bg-[#B9ABA2]", Delivered: "bg-[#B9ABA2]",
};

export default function CalendarPage() {
  const [cursor, setCursor] = useState(new Date());
  const [view, setView] = useState("month");
  const [category, setCategory] = useState("");
  const [orders, setOrders] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const from = format(startOfWeek(startOfMonth(addMonths(cursor, -1))), "yyyy-MM-dd");
    const to = format(endOfWeek(endOfMonth(addMonths(cursor, 1))), "yyyy-MM-dd");
    api.get(`/orders?date_from=${from}&date_to=${to}&limit=500${category ? `&category=${category}` : ""}`)
      .then((r) => setOrders(r.data.items)).catch(() => {});
  }, [cursor, category]);

  const byDate = useMemo(() => {
    const m = {};
    orders.forEach((o) => {
      (m[o.date_needed] = m[o.date_needed] || []).push(o);
    });
    return m;
  }, [orders]);

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor));
    const end = endOfWeek(endOfMonth(cursor));
    const days = [];
    for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
    return days;
  }, [cursor]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const move = (dir) => {
    if (view === "month") setCursor(addMonths(cursor, dir));
    else if (view === "week") setCursor(addDays(cursor, dir * 7));
    else setCursor(addDays(cursor, dir));
  };

  /* ----------------------------------------------------------------
     Event dot — small compact indicator shown on mobile inside month grid
  ---------------------------------------------------------------- */
  const EventDot = ({ o }) => (
    <button
      onClick={() => navigate(`/orders/${o.id}`)}
      aria-label={`${o.client_name} · ${o.cake_type}`}
      data-testid={`cal-event-${o.order_number}`}
      className={`w-2 h-2 rounded-full ${DOT[o.status] || "bg-[#B9ABA2]"}`}
    />
  );

  /* ----------------------------------------------------------------
     Full event pill — used on tablet+ inside month grid, and always
     in week / day views
  ---------------------------------------------------------------- */
  const EventPill = ({ o }) => (
    <button
      onClick={() => navigate(`/orders/${o.id}`)}
      data-testid={`cal-event-${o.order_number}`}
      className="w-full text-left flex items-center gap-1.5 rounded-md bg-white border border-[#EDE5DE] px-1.5 py-1 hover:border-[#D8A49B] transition-colors"
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT[o.status] || "bg-[#B9ABA2]"}`} />
      <span className="text-[10px] font-medium text-[#4A3B32] truncate">{o.client_name} · {o.cake_type}</span>
    </button>
  );

  return (
    <div data-testid="calendar-page">
      <PageHeader eyebrow="Production Schedule" title="Order Calendar" testid="calendar-header">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="pq-input !w-full sm:!w-52 !py-2"
          data-testid="calendar-category-filter"
        >
          <option value="">All orders</option>
          <option value="wedding_intro">Wedding & Introduction</option>
          <option value="normal">Normal (Small Cakes)</option>
        </select>
        <div className="flex rounded-lg border border-[#EDE5DE] overflow-hidden w-full sm:w-auto">
          {["month", "week", "day"].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              data-testid={`calendar-view-${v}`}
              className={`flex-1 sm:flex-none px-3.5 py-2 text-xs font-semibold capitalize transition-colors ${
                view === v ? "bg-[#2B1B17] text-[#FAF8F5]" : "bg-white text-[#5A483E] hover:bg-[#F5EFEA]"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </PageHeader>

      {/* Month / week / day navigation */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-5">
        <button onClick={() => move(-1)} className="pq-btn-outline !p-2 shrink-0" data-testid="calendar-prev">
          <ChevronLeft size={16} />
        </button>
        <h2
          className="font-serif text-lg sm:text-2xl text-[#2B1B17] flex-1 min-w-0 truncate"
          data-testid="calendar-title"
        >
          {view === "month"
            ? format(cursor, "MMMM yyyy")
            : view === "week"
            ? `Week of ${format(startOfWeek(cursor), "d MMM yyyy")}`
            : format(cursor, "EEEE, d MMMM yyyy")}
        </h2>
        <button onClick={() => move(1)} className="pq-btn-outline !p-2 shrink-0" data-testid="calendar-next">
          <ChevronRight size={16} />
        </button>
        <button
          onClick={() => setCursor(new Date())}
          className="pq-btn-outline !py-2 !px-3 text-xs shrink-0"
          data-testid="calendar-today"
        >
          Today
        </button>
      </div>

      {/* ================= MONTH VIEW ================= */}
      {view === "month" && (
        <div className="pq-card overflow-hidden" data-testid="calendar-month-grid">
          {/* Header row */}
          <div className="grid grid-cols-7 border-b border-[#EDE5DE] bg-[#FDFBF7]">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div
                key={i}
                className="py-2 text-center text-[10px] sm:text-xs font-semibold tracking-wider uppercase text-[#8C7A70]"
              >
                <span className="sm:hidden">{d}</span>
                <span className="hidden sm:inline">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i]}
                </span>
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7">
            {monthDays.map((d) => {
              const key = format(d, "yyyy-MM-dd");
              const dayOrders = byDate[key] || [];
              const inMonth = isSameMonth(d, cursor);
              const today = isToday(d);
              return (
                <div
                  key={key}
                  className={`relative min-h-[64px] sm:min-h-[104px] border-b border-r border-[#F2EAE1] p-1 sm:p-1.5 ${
                    !inMonth ? "bg-[#FAF8F5]" : ""
                  } ${today ? "bg-[#FDF6F0]" : ""}`}
                  data-testid={`cal-day-${key}`}
                >
                  <p
                    className={`text-[10px] sm:text-[11px] font-semibold mb-1 px-0.5 sm:px-1 ${
                      today
                        ? "text-[#9E2A2B]"
                        : inMonth
                        ? "text-[#4A3B32]"
                        : "text-[#C9B8AE]"
                    }`}
                  >
                    {format(d, "d")}
                  </p>

                  {/* Mobile: show dot indicators only */}
                  <div className="sm:hidden flex flex-wrap gap-0.5 px-0.5">
                    {dayOrders.slice(0, 4).map((o) => (
                      <EventDot key={o.id} o={o} />
                    ))}
                    {dayOrders.length > 4 && (
                      <span className="text-[8px] text-[#B76E60] leading-none">
                        +{dayOrders.length - 4}
                      </span>
                    )}
                  </div>

                  {/* Tablet+: show full pills */}
                  <div className="hidden sm:block space-y-1">
                    {dayOrders.slice(0, 3).map((o) => (
                      <EventPill key={o.id} o={o} />
                    ))}
                    {dayOrders.length > 3 && (
                      <p className="text-[10px] text-[#B76E60] px-1">
                        +{dayOrders.length - 3} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= WEEK VIEW ================= */}
      {view === "week" && (
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-3" data-testid="calendar-week-view">
          {weekDays.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const dayOrders = byDate[key] || [];
            return (
              <div
                key={key}
                className={`pq-card p-3 min-h-[120px] sm:min-h-[160px] ${
                  isToday(d) ? "ring-1 ring-[#C98E56]" : ""
                }`}
              >
                <p
                  className={`text-xs font-bold mb-2 ${
                    isToday(d) ? "text-[#9E2A2B]" : "text-[#4A3B32]"
                  }`}
                >
                  {format(d, "EEE d")}
                </p>
                <div className="space-y-1.5">
                  {dayOrders.length === 0 ? (
                    <p className="text-[10px] text-[#C9B8AE]">—</p>
                  ) : (
                    dayOrders.map((o) => <EventPill key={o.id} o={o} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ================= DAY VIEW ================= */}
      {view === "day" && (
        <div className="pq-card divide-y divide-[#F2EAE1]" data-testid="calendar-day-view">
          {(byDate[format(cursor, "yyyy-MM-dd")] || []).length === 0 ? (
            <p className="p-8 text-sm text-[#B9ABA2] text-center">
              No cakes needed on this day.
            </p>
          ) : (
            (byDate[format(cursor, "yyyy-MM-dd")] || []).map((o) => (
              <button
                key={o.id}
                onClick={() => navigate(`/orders/${o.id}`)}
                className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 sm:px-5 py-4 hover:bg-[#FDFBF7] text-left"
                data-testid={`cal-day-order-${o.order_number}`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm text-[#2B1B17]">
                    {o.order_number} — {o.client_name}
                  </p>
                  <p className="text-xs text-[#78665E] mt-0.5">
                    {o.cake_type} · {o.flavor} · {o.size} · {o.time_needed || "any time"} · {o.fulfillment}
                  </p>
                </div>
                <StatusBadge s={o.status} />
              </button>
            ))
          )}
        </div>
      )}

      {/* ================= LEGEND ================= */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-5" data-testid="calendar-legend">
        {[
          ["Upcoming / Confirmed", "bg-[#7A9B6E]"],
          ["In preparation / Baking", "bg-[#C98E56]"],
          ["Ready / Decorating", "bg-[#A67BA6]"],
          ["Payment pending", "bg-[#9E2A2B]"],
          ["Completed / Cancelled", "bg-[#B9ABA2]"],
        ].map(([l, c]) => (
          <span key={l} className="flex items-center gap-1.5 text-[11px] text-[#78665E]">
            <span className={`w-2 h-2 rounded-full ${c}`} />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
