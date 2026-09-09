import { useEffect, useState } from "react";
import { Download, Printer, Star } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import api, { money } from "../lib/api";
import { PageHeader, StatCard } from "../components/ui-bits";

const COLORS = ["#B76E60", "#C98E56", "#7A9B6E", "#A67BA6", "#D8A49B", "#8C6D62", "#E0B589", "#5A483E"];

export default function Reports() {
  const [r, setR] = useState(null);

  useEffect(() => {
    api.get("/reports/summary").then((res) => setR(res.data)).catch(() => {});
  }, []);

  if (!r) return <div className="pq-card h-96 animate-pulse" data-testid="reports-loading" />;

  const ChartCard = ({ title, children, testid }) => (
    <div className="pq-card p-6" data-testid={testid}>
      <p className="pq-eyebrow mb-4">{title}</p>
      <div className="h-64">{children}</div>
    </div>
  );

  return (
    <div data-testid="reports-page">
      <PageHeader eyebrow="Business Intelligence" title="Reports" testid="reports-header">
        <a href={`${process.env.REACT_APP_BACKEND_URL}/api/export/clients`} className="pq-btn-outline" data-testid="export-clients-btn"><Download size={14} /> Clients CSV</a>
        <a href={`${process.env.REACT_APP_BACKEND_URL}/api/export/orders`} className="pq-btn-outline" data-testid="export-orders-btn"><Download size={14} /> Orders CSV</a>
        <a href={`${process.env.REACT_APP_BACKEND_URL}/api/export/payments`} className="pq-btn-outline" data-testid="export-payments-btn"><Download size={14} /> Payments CSV</a>
        <button onClick={() => window.print()} className="pq-btn-outline" data-testid="reports-print-btn"><Printer size={14} /></button>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Sales" value={money(r.total_sales)} testid="report-total-sales" />
        <StatCard label="Payments Received" value={money(r.payments_received)} testid="report-payments-received" />
        <StatCard label="Outstanding Balances" value={money(r.outstanding)} testid="report-outstanding" />
        <StatCard label="Avg Feedback Rating" value={r.feedback.avg_rating ? `${r.feedback.avg_rating} / 5` : "—"} testid="report-avg-rating" />
        <StatCard label="Total Orders" value={r.total_orders} testid="report-total-orders" />
        <StatCard label="Completed" value={r.completed_orders} testid="report-completed" />
        <StatCard label="Cancelled" value={r.cancelled_orders} testid="report-cancelled" />
        <StatCard label="Upcoming" value={r.upcoming_orders} testid="report-upcoming" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartCard title="Monthly Revenue" testid="chart-monthly-revenue">
          <ResponsiveContainer>
            <BarChart data={r.monthly_revenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F2EAE1" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#78665E" }} />
              <YAxis tick={{ fontSize: 11, fill: "#78665E" }} />
              <Tooltip formatter={(v) => money(v)} />
              <Bar dataKey="value" fill="#B76E60" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Orders Per Month" testid="chart-monthly-orders">
          <ResponsiveContainer>
            <LineChart data={r.monthly_orders}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F2EAE1" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#78665E" }} />
              <YAxis tick={{ fontSize: 11, fill: "#78665E" }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#C98E56" strokeWidth={2.5} dot={{ fill: "#C98E56" }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Most Requested Flavors" testid="chart-flavors">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={r.flavor_counts} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                {r.flavor_counts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Revenue by Cake Type" testid="chart-revenue-by-type">
          <ResponsiveContainer>
            <BarChart data={r.revenue_by_type} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#F2EAE1" />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#78665E" }} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: "#78665E" }} />
              <Tooltip formatter={(v) => money(v)} />
              <Bar dataKey="value" fill="#7A9B6E" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Order Status" testid="chart-status">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={r.status_counts} dataKey="value" nameKey="name" outerRadius={90} paddingAngle={3}>
                {r.status_counts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Most Requested Design Categories" testid="chart-designs">
          <ResponsiveContainer>
            <BarChart data={r.design_counts} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#F2EAE1" />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#78665E" }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: "#78665E" }} />
              <Tooltip />
              <Bar dataKey="value" fill="#A67BA6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="pq-card p-6" data-testid="report-clients">
          <p className="pq-eyebrow mb-4">Client Reports</p>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div><p className="font-serif text-2xl text-[#2B1B17]">{r.clients.total}</p><p className="text-xs text-[#78665E]">Total clients</p></div>
            <div><p className="font-serif text-2xl text-[#2B1B17]">{r.clients.new_this_month}</p><p className="text-xs text-[#78665E]">New this month</p></div>
            <div><p className="font-serif text-2xl text-[#2B1B17]">{r.clients.returning}</p><p className="text-xs text-[#78665E]">Returning</p></div>
          </div>
          <p className="pq-eyebrow mb-2">Most frequent clients</p>
          {r.clients.top.length === 0 ? <p className="text-sm text-[#B9ABA2]">No orders yet.</p> : (
            r.clients.top.map((c) => (
              <div key={c.name} className="flex justify-between text-sm py-1.5 border-b border-[#F2EAE1] last:border-0">
                <span className="text-[#4A3B32]">{c.name}</span>
                <span className="text-[#78665E]">{c.orders} orders</span>
              </div>
            ))
          )}
        </div>
        <div className="pq-card p-6" data-testid="report-feedback">
          <p className="pq-eyebrow mb-4">Feedback Reports</p>
          <div className="flex items-center gap-3 mb-4">
            <Star size={22} className="fill-[#C98E56] text-[#C98E56]" />
            <p className="font-serif text-3xl text-[#2B1B17]">{r.feedback.avg_rating || "—"}</p>
            <p className="text-xs text-[#78665E]">{r.feedback.count} reviews</p>
          </div>
          {r.feedback.recent.length === 0 ? <p className="text-sm text-[#B9ABA2]">No feedback yet.</p> : (
            r.feedback.recent.map((f) => (
              <div key={f.id} className="text-sm py-2 border-b border-[#F2EAE1] last:border-0">
                <p className="text-[#4A3B32]">“{f.feedback}”</p>
                {f.improve && <p className="text-xs text-[#9E5A20] mt-0.5">Improve: {f.improve}</p>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
