import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, Mail, Printer } from "lucide-react";
import { toast } from "sonner";
import api, { fmtErr, money } from "../lib/api";
import { PageHeader } from "../components/ui-bits";

export default function ReceiptView() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [emailing, setEmailing] = useState(false);

  useEffect(() => {
    api.get(`/receipts/${id}`).then((r) => setData(r.data)).catch(() => toast.error("Receipt not found"));
  }, [id]);

  if (!data) return <div className="pq-card h-96 animate-pulse" data-testid="receipt-loading" />;
  const { receipt, order, client, payment, settings } = data;
  const cur = settings?.currency || "UGX";
  const balance = (order?.total_price || 0) - (order?.total_paid || 0);

  const emailReceipt = async () => {
    setEmailing(true);
    try {
      await api.post(`/receipts/${id}/email`);
      toast.success(`Receipt emailed to ${client.email}`);
    } catch (err) {
      toast.error(fmtErr(err));
    } finally {
      setEmailing(false);
    }
  };

  const downloadPdf = async () => {
    try {
      const res = await api.get(`/receipts/${id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${receipt.receipt_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not download PDF");
    }
  };

  const Row = ({ label, value, bold }) => (
    <div className="flex justify-between py-2 border-b border-[#F2EAE1] last:border-0">
      <span className="text-xs uppercase tracking-wider text-[#8C6D62]">{label}</span>
      <span className={`text-sm ${bold ? "font-bold text-[#2B1B17]" : "text-[#4A3B32]"}`}>{value}</span>
    </div>
  );

  return (
    <div data-testid="receipt-view-page" className="max-w-2xl mx-auto">
      <div className="no-print">
        <PageHeader eyebrow="Payment Receipt" title={receipt.receipt_number} testid="receipt-header">
          <button onClick={() => window.print()} className="pq-btn-outline" data-testid="receipt-print-btn"><Printer size={14} /> Print</button>
          <button onClick={downloadPdf} className="pq-btn-outline" data-testid="receipt-pdf-btn"><Download size={14} /> PDF</button>
          <button onClick={emailReceipt} disabled={emailing} className="pq-btn-primary" data-testid="receipt-email-btn">
            <Mail size={14} /> {emailing ? "Sending…" : "Email Receipt"}
          </button>
        </PageHeader>
      </div>

      <div className="print-area pq-card p-10" data-testid="receipt-card">
        <div className="text-center pb-6 border-b border-[#EDE5DE]">
          <p className="font-serif text-3xl tracking-[0.18em] text-[#2B1B17]">{settings?.business_name || "PASTRY QUIN"}</p>
          <p className="text-[10px] font-semibold tracking-[0.3em] uppercase text-[#8C6D62] mt-1.5">{settings?.tagline || "Atelier & Haute Pâtisserie"}</p>
          <p className="text-xs text-[#78665E] mt-2">
            {[settings?.phone, settings?.email, settings?.address].filter(Boolean).join(" · ")}
          </p>
        </div>

        <p className="text-center font-serif text-xl text-[#2B1B17] my-6">Payment Receipt</p>

        <div className="grid grid-cols-2 gap-x-8 mb-6">
          <Row label="Receipt No" value={receipt.receipt_number} bold />
          <Row label="Date" value={payment?.date || receipt.created_at?.slice(0, 10)} />
          <Row label="Client" value={client?.full_name} />
          <Row label="Order No" value={order?.order_number} />
          <Row label="Cake" value={`${order?.cake_type || ""} · ${order?.flavor || ""} · ${order?.size || ""}`} />
          <Row label="Date Needed" value={`${order?.date_needed || ""} ${order?.time_needed || ""}`} />
          <Row label="Method" value={payment?.method} />
          <Row label="Reference" value={payment?.reference || "—"} />
        </div>

        <div className="bg-[#FDFBF7] rounded-xl border border-[#EDE5DE] p-5 mb-6">
          <Row label="Amount Received" value={money(payment?.amount ?? receipt.amount, cur)} bold />
          <Row label="Total Order Price" value={money(order?.total_price, cur)} />
          <Row label="Total Paid To Date" value={money(order?.total_paid, cur)} />
          <Row label="Remaining Balance" value={money(balance, cur)} bold />
        </div>

        {payment?.notes && <p className="text-xs text-[#78665E] italic mb-6">Notes: {payment.notes}</p>}

        <p className="text-[11px] text-[#A89B93] leading-relaxed mb-10">
          Thank you for choosing PASTRY QUIN. Cakes are best kept cool and served at room temperature.
          Deposits are non-refundable once preparation has begun.
        </p>

        <div className="flex justify-between text-[10px] uppercase tracking-wider text-[#8C6D62]">
          <div className="text-center"><div className="w-36 border-t border-[#C9B8AE] pt-1.5">Received by</div></div>
          <div className="text-center"><div className="w-36 border-t border-[#C9B8AE] pt-1.5">Client signature</div></div>
        </div>
      </div>
    </div>
  );
}
