import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { money } from "../lib/api";
import { EmptyState, PageHeader } from "../components/ui-bits";
import { useAuth } from "../context/AuthContext";

export default function Payments() {
  const [data, setData] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/payments?limit=200").then((r) => setData(r.data)).catch(() => {
      setError("Payments could not be loaded. Please refresh and try again.");
    });
  }, []);

  const handleDelete = async (payment) => {
    const amount = money(payment.amount);
    const confirmed = window.confirm(
      `Delete this payment of ${amount} for order ${payment.order_number || payment.order_id}? This will also remove its receipt and recalculate the order balance. This action cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(payment.id);
    setError("");
    setNotice("");
    try {
      await api.delete(`/payments/${payment.id}`);
      // Update the table immediately; a subsequent refresh failure must not
      // incorrectly report that the already-completed deletion failed.
      setData((current) => current ? {
        ...current,
        items: current.items.filter((item) => item.id !== payment.id),
        total: Math.max(0, current.total - 1),
      } : current);
      setNotice(`Payment of ${amount} deleted. The order balance has been updated.`);
      try {
        const response = await api.get("/payments?limit=200");
        setData(response.data);
      } catch {
        // The delete succeeded, so keep the locally updated list.
      }
    } catch (err) {
      setError(err.response?.data?.detail || "The payment could not be deleted. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div data-testid="payments-page">
      <PageHeader eyebrow="Ledger" title="Payments" testid="payments-header" />
      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
        </div>
      )}
      {!data ? (
        <div className="pq-card h-64 animate-pulse" />
      ) : data.items.length === 0 ? (
        <EmptyState testid="payments-empty" title="No payments recorded"
          hint="Record a payment from any order page and it will appear here with its receipt." />
      ) : (
        <div className="pq-card overflow-x-auto" data-testid="payments-table">
          <table className="w-full">
            <thead className="border-b border-[#EDE5DE] bg-[#FDFBF7]">
              <tr><th className="pq-th">Date</th><th className="pq-th">Order</th><th className="pq-th">Client</th><th className="pq-th">Amount</th><th className="pq-th">Method</th><th className="pq-th">Reference</th><th className="pq-th">Notes</th><th className="pq-th">Recorded by</th><th className="pq-th">Receipt</th><th className="pq-th">Action</th></tr>
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
                  <td className="pq-td"><Link to={`/receipts/${p.receipt_id}`} className="text-xs text-[#B76E60] hover:underline" data-testid={`payment-receipt-${p.id}`}>View →</Link></td>
                  <td className="pq-td">
                    <button
                      type="button"
                      onClick={() => handleDelete(p)}
                      disabled={deletingId === p.id}
                      className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      data-testid={`payment-delete-${p.id}`}
                      aria-label={`Delete payment of ${amountLabel(p.amount)}`}
                    >
                      {deletingId === p.id ? "Deleting…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function amountLabel(amount) {
  return Number(amount || 0).toLocaleString();
}
