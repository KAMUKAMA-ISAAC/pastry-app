import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { money } from "../lib/api";
import { EmptyState, PageHeader } from "../components/ui-bits";

export default function Payments() {
  const [data, setData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/payments?limit=200").then((r) => setData(r.data)).catch(() => {});
  }, []);

  return (
    <div data-testid="payments-page">
      <PageHeader eyebrow="Ledger" title="Payments" testid="payments-header" />
      {!data ? (
        <div className="pq-card h-64 animate-pulse" />
      ) : data.items.length === 0 ? (
        <EmptyState testid="payments-empty" title="No payments recorded"
          hint="Record a payment from any order page and it will appear here with its receipt." />
      ) : (
        <div className="pq-card overflow-x-auto" data-testid="payments-table">
          <table className="w-full">
            <thead className="border-b border-[#EDE5DE] bg-[#FDFBF7]">
              <tr><th className="pq-th">Date</th><th className="pq-th">Order</th><th className="pq-th">Client</th><th className="pq-th">Amount</th><th className="pq-th">Method</th><th className="pq-th">Reference</th><th className="pq-th">Notes</th><th className="pq-th">Recorded by</th><th className="pq-th"></th></tr>
            </thead>
            <tbody className="divide-y divide-[#F2EAE1]">
              {data.items.map((p) => (
                <tr key={p.id} className="hover:bg-[#FDFBF7] transition-colors" data-testid={`payment-row-${p.id}`}>
                  <td className="pq-td">{p.date}</td>
                  <td className="pq-td">
                    <button onClick={() => navigate(`/orders/${p.order_id}`)} className="font-semibold text-[#B76E60] hover:underline" data-testid={`payment-order-${p.id}`}>{p.order_number}</button>
                  </td>
                  <td className="pq-td">{p.client_name}</td>
                  <td className="pq-td font-medium text-[#2B1B17]">{money(p.amount)}</td>
                  <td className="pq-td">{p.method}</td>
                  <td className="pq-td">{p.reference || "—"}</td>
                  <td className="pq-td">{p.notes || "—"}</td>
                  <td className="pq-td text-xs">{p.recorded_by}</td>
                  <td className="pq-td"><Link to={`/receipts/${p.receipt_id}`} className="text-xs text-[#B76E60] hover:underline" data-testid={`payment-receipt-${p.id}`}>Receipt →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
