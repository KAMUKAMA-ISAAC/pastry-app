import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { money } from "../lib/api";
import { EmptyState, PageHeader } from "../components/ui-bits";

export default function Receipts() {
  const [items, setItems] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/receipts").then((r) => setItems(r.data)).catch(() => {});
  }, []);

  return (
    <div data-testid="receipts-page">
      <PageHeader eyebrow="Stationery" title="Receipts" testid="receipts-header" />
      {!items ? (
        <div className="pq-card h-64 animate-pulse" />
      ) : items.length === 0 ? (
        <EmptyState testid="receipts-empty" title="No receipts yet"
          hint="A branded receipt is generated automatically every time you record a payment." />
      ) : (
        <div className="pq-card overflow-x-auto" data-testid="receipts-table">
          <table className="w-full">
            <thead className="border-b border-[#EDE5DE] bg-[#FDFBF7]">
              <tr><th className="pq-th">Receipt</th><th className="pq-th">Date</th><th className="pq-th">Client</th><th className="pq-th">Order</th><th className="pq-th">Amount</th><th className="pq-th"></th></tr>
            </thead>
            <tbody className="divide-y divide-[#F2EAE1]">
              {items.map((r) => (
                <tr key={r.id} onClick={() => navigate(`/receipts/${r.id}`)} className="hover:bg-[#FDFBF7] cursor-pointer transition-colors" data-testid={`receipt-row-${r.receipt_number}`}>
                  <td className="pq-td font-semibold text-[#2B1B17]">{r.receipt_number}</td>
                  <td className="pq-td">{r.created_at?.slice(0, 10)}</td>
                  <td className="pq-td">{r.client_name}</td>
                  <td className="pq-td">{r.order_number}</td>
                  <td className="pq-td font-medium">{money(r.amount)}</td>
                  <td className="pq-td text-[#B76E60] text-xs font-semibold">View →</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
