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
  const date = payment?.date || receipt.created_at?.slice(0, 10);
  const cakeDetails = [order?.cake_type, order?.flavors?.join(", ") || order?.flavor, order?.size].filter(Boolean).join(" · ");
  const needed = [order?.date_needed, order?.time_needed].filter(Boolean).join(" at ");

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

  const Detail = ({ label, value }) => value ? (
    <div className="receipt-detail">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  ) : null;

  const AmountRow = ({ label, value, prominent = false }) => (
    <div className={`receipt-amount-row ${prominent ? "receipt-amount-prominent" : ""}`}>
      <span>{label}</span><strong>{value}</strong>
    </div>
  );

  return (
    <div data-testid="receipt-view-page" className="max-w-3xl mx-auto">
      <div className="no-print">
        <PageHeader eyebrow="Payment Receipt" title={receipt.receipt_number} testid="receipt-header">
          <button onClick={() => window.print()} className="pq-btn-outline" data-testid="receipt-print-btn"><Printer size={14} /> Print</button>
          <button onClick={downloadPdf} className="pq-btn-outline" data-testid="receipt-pdf-btn"><Download size={14} /> PDF</button>
          <button onClick={emailReceipt} disabled={emailing} className="pq-btn-primary" data-testid="receipt-email-btn">
            <Mail size={14} /> {emailing ? "Sending…" : "Email Receipt"}
          </button>
        </PageHeader>
      </div>

      <article className="print-area receipt-paper" data-testid="receipt-card">
        <header className="receipt-brand">
          <img src="/pq-icon-192.png" alt="PASTRY QUIN logo" className="receipt-logo" />
          <div>
            <p className="receipt-wordmark">{settings?.business_name || "PASTRY QUIN"}</p>
            <p className="receipt-tagline">{settings?.tagline || "Taste Royalty"}</p>
            <p className="receipt-contact">{[settings?.phone, settings?.email, settings?.address].filter(Boolean).join("  ·  ")}</p>
          </div>
          <div className="receipt-stamp">
            <span>PAYMENT</span>
            <span>RECEIPT</span>
          </div>
        </header>

        <div className="receipt-meta">
          <div><span>Receipt no.</span><strong>{receipt.receipt_number}</strong></div>
          <div><span>Date received</span><strong>{date || "—"}</strong></div>
        </div>

        <section className="receipt-section">
          <h2>Client & order</h2>
          <div className="receipt-details-grid">
            <Detail label="Received from" value={client?.full_name} />
            <Detail label="Order number" value={order?.order_number} />
            <Detail label="Cake" value={cakeDetails} />
            <Detail label="Date needed" value={needed} />
            <Detail label="Payment method" value={payment?.method} />
            <Detail label="Payment reference" value={payment?.reference || "—"} />
            <Detail label="Fillings" value={order?.fillings?.join(", ")} />
            <Detail label="Frostings" value={order?.frostings?.join(", ")} />
          </div>
        </section>

        <section className="receipt-section receipt-payment-section">
          <h2>Payment summary</h2>
          <div className="receipt-amounts">
            <AmountRow label="Amount received" value={money(payment?.amount ?? receipt.amount, cur)} prominent />
            <AmountRow label="Total order price" value={money(order?.total_price, cur)} />
            <AmountRow label="Total paid to date" value={money(order?.total_paid, cur)} />
            <AmountRow label="Balance outstanding" value={money(balance, cur)} prominent />
          </div>
        </section>

        {payment?.notes && (
          <section className="receipt-note">
            <span>Note</span>
            <p>{payment.notes}</p>
          </section>
        )}

        <footer className="receipt-footer">
          <p className="receipt-thanks">Thank you for choosing PASTRY QUIN.</p>
          <p>Please keep this receipt for your records.</p>
          <div className="receipt-signatures">
            <div><span></span><small>Received by</small></div>
            <div><span></span><small>Client signature</small></div>
          </div>
          <p className="receipt-footer-brand">PASTRY QUIN <span>·</span> TASTE ROYALTY</p>
        </footer>
      </article>

      <style>{`
        .receipt-paper{background:#fff;color:#30221d;border:1px solid #e9dfd6;box-shadow:0 12px 35px rgba(43,25,23,.07);padding:42px 48px;margin-bottom:28px;font-family:Arial,Helvetica,sans-serif}
        .receipt-brand{display:grid;grid-template-columns:68px 1fr auto;gap:18px;align-items:center;padding-bottom:25px;border-bottom:1px solid #e8ded5}
        .receipt-logo{width:64px;height:64px;object-fit:contain}
        .receipt-wordmark{font-family:Georgia,'Times New Roman',serif;font-size:24px;letter-spacing:2.5px;margin:0;color:#2b1917}
        .receipt-tagline{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#9b7465;margin:5px 0 8px}
        .receipt-contact{font-size:10px;color:#796c64;line-height:1.6;margin:0;overflow-wrap:anywhere}
        .receipt-stamp{border:1px solid #b98270;color:#9b5d4c;padding:9px 12px;font-size:10px;letter-spacing:2px;text-align:center;line-height:1.7}
        .receipt-stamp span{display:block}
        .receipt-meta{display:flex;justify-content:space-between;gap:20px;padding:19px 0;border-bottom:1px solid #eee6df}
        .receipt-meta div{display:flex;flex-direction:column;gap:5px}
        .receipt-meta span,.receipt-detail span{font-size:9px;color:#8b7b70;text-transform:uppercase;letter-spacing:1.15px}
        .receipt-meta strong{font-size:12px;color:#33231d;font-weight:700}
        .receipt-section{margin-top:25px}
        .receipt-section h2{font-family:Georgia,'Times New Roman',serif;font-size:16px;font-weight:normal;color:#4b3027;margin:0 0 13px;padding-bottom:9px;border-bottom:1px solid #eee6df}
        .receipt-details-grid{display:grid;grid-template-columns:1fr 1fr;column-gap:34px}
        .receipt-detail{display:flex;flex-direction:column;gap:6px;padding:10px 0;border-bottom:1px solid #f3eee9;min-width:0}
        .receipt-detail strong{font-size:12px;font-weight:500;line-height:1.5;color:#382a24;overflow-wrap:anywhere}
        .receipt-payment-section{margin-top:29px}
        .receipt-amounts{border:1px solid #eee4dc;padding:8px 18px;background:#fdfbf9}
        .receipt-amount-row{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:12px 0;border-bottom:1px solid #eee6df;font-size:12px;color:#6f5e54}
        .receipt-amount-row:last-child{border-bottom:0}
        .receipt-amount-row strong{color:#38271f;font-size:12px;font-weight:600;text-align:right}
        .receipt-amount-prominent{color:#39261f;font-weight:600}
        .receipt-amount-prominent strong{font-size:14px;color:#2b1917}
        .receipt-note{margin-top:20px;padding:12px 15px;border-left:2px solid #b98270;background:#fdfbf9}
        .receipt-note span{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#8b7b70}
        .receipt-note p{font-size:12px;color:#51423a;margin:6px 0 0;white-space:pre-wrap}
        .receipt-footer{text-align:center;margin-top:35px;padding-top:22px;border-top:1px solid #e8ded5}
        .receipt-thanks{font-family:Georgia,'Times New Roman',serif;font-size:16px;color:#4b3027;margin:0 0 7px}
        .receipt-footer>p:nth-child(2){font-size:10px;color:#8b7b70;margin:0}
        .receipt-signatures{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin:38px 8px 25px}
        .receipt-signatures span{display:block;border-top:1px solid #cdbdb2;margin-bottom:7px}
        .receipt-signatures small{font-size:9px;color:#796c64}
        .receipt-footer-brand{font-size:9px;letter-spacing:2px;color:#9b7465;margin:0}
        .receipt-footer-brand span{padding:0 5px;color:#c39a88}
        @media(max-width:640px){.receipt-paper{padding:24px 18px}.receipt-brand{grid-template-columns:48px 1fr;gap:12px}.receipt-logo{width:46px;height:46px}.receipt-wordmark{font-size:17px;letter-spacing:1px}.receipt-tagline{letter-spacing:2px}.receipt-stamp{grid-column:1/-1;justify-self:end}.receipt-details-grid{column-gap:16px}.receipt-signatures{gap:25px}.receipt-contact{font-size:9px}}
        @media print{body{background:#fff!important}.receipt-paper{box-shadow:none;border:0;padding:12mm 10mm;margin:0;max-width:none}.no-print,nav,aside,header:not(.receipt-brand){display:none!important}.receipt-brand{grid-template-columns:58px 1fr auto}.receipt-logo{width:54px;height:54px}.receipt-details-grid{column-gap:24px}.receipt-section{break-inside:avoid}.receipt-payment-section{break-inside:avoid}.receipt-footer{break-inside:avoid}@page{size:A4;margin:10mm}}
      `}</style>
    </div>
  );
}
