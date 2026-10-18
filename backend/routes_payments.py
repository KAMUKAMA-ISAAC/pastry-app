import io
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth import get_current_user, require_admin
from db import audit, compute_payment_status, db, next_seq, notify, now_iso, selections, uid
from emailer import send_receipt_email

logger = logging.getLogger(__name__)
router = APIRouter(tags=["payments"])

PAYMENT_METHODS = ["Cash", "Mobile Money", "Bank", "Card", "Other"]


class PaymentIn(BaseModel):
    amount: float
    date: str = ""
    method: str = "Cash"
    reference: str = ""
    notes: str = ""


def short_receipt_number(value: str) -> str:
    """Display receipts as a simple three-digit number, e.g. 001."""
    parts = str(value or "").split("-")
    if len(parts) == 4 and parts[0] == "PQ" and parts[1] == "R" and parts[2].isdigit() and parts[3].isdigit():
        return f"{int(parts[3]):03d}"
    if len(parts) == 3 and parts[0] == "PQ" and parts[1].isdigit() and parts[2].isdigit():
        return f"{int(parts[2]):03d}"
    return str(value or "")


async def create_payment(order: dict, amount: float, method: str, reference: str,
                         notes: str, date: str, actor: str) -> tuple[dict, dict]:
    year = datetime.now(timezone.utc).year
    rseq = await next_seq("receipt", year)
    receipt_number = f"{rseq:03d}"
    pid, rid = uid(), uid()
    pay = {
        "id": pid, "order_id": order["id"], "amount": float(amount),
        "date": date or now_iso()[:10], "method": method or "Cash",
        "reference": reference or "", "notes": notes or "",
        "recorded_by": actor, "receipt_id": rid, "created_at": now_iso(),
    }
    await db.payments.insert_one(pay)
    receipt = {
        "id": rid, "receipt_number": receipt_number, "payment_id": pid,
        "order_id": order["id"], "client_id": order["client_id"],
        "amount": float(amount), "created_at": now_iso(),
    }
    await db.receipts.insert_one(receipt)
    new_paid = round(float(order.get("total_paid", 0)) + float(amount), 2)
    ps = compute_payment_status(float(order.get("total_price", 0)), new_paid)
    await db.orders.update_one({"id": order["id"]}, {"$set": {"total_paid": new_paid, "payment_status": ps}})
    pay.pop("_id", None)
    receipt.pop("_id", None)
    return pay, receipt


@router.get("/payments")
async def list_payments(order_id: str = "", page: int = 1, limit: int = 100, user=Depends(require_admin)):
    query = {}
    if order_id:
        query["order_id"] = order_id
    payments = await db.payments.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)
    order_ids = list({p["order_id"] for p in payments})
    orders = await db.orders.find({"id": {"$in": order_ids}}, {"_id": 0, "id": 1, "order_number": 1, "client_id": 1}).to_list(2000)
    client_ids = list({o["client_id"] for o in orders})
    clients = await db.clients.find({"id": {"$in": client_ids}}, {"_id": 0, "id": 1, "full_name": 1}).to_list(2000)
    omap = {o["id"]: o for o in orders}
    cmap = {c["id"]: c for c in clients}
    for p in payments:
        o = omap.get(p["order_id"], {})
        p["order_number"] = o.get("order_number", "")
        p["client_name"] = cmap.get(o.get("client_id", ""), {}).get("full_name", "")
    total = len(payments)
    start = (page - 1) * limit
    return {"items": payments[start:start + limit], "total": total}


@router.post("/orders/{order_id}/payments")
async def add_payment(order_id: str, body: PaymentIn, user=Depends(require_admin)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    pay, receipt = await create_payment(order, body.amount, body.method, body.reference,
                                        body.notes, body.date, user.get("email", ""))
    await audit("Payment recorded",
                f"Payment of {body.amount:,.0f} recorded on {order['order_number']} ({body.method}).",
                user.get("email", ""), order_id)
    await notify("Payment received",
                 f"{body.amount:,.0f} received for {order['order_number']}.",
                 "payment", order_id)
    return {"payment": pay, "receipt": receipt}


@router.delete("/payments/{payment_id}")
async def delete_payment(payment_id: str, user=Depends(require_admin)):
    pay = await db.payments.find_one({"id": payment_id}, {"_id": 0})
    if not pay:
        raise HTTPException(status_code=404, detail="Payment not found")
    await db.payments.delete_one({"id": payment_id})
    if pay.get("receipt_id"):
        await db.receipts.delete_one({"id": pay["receipt_id"]})
    order = await db.orders.find_one({"id": pay["order_id"]}, {"_id": 0})
    if order:
        # Recalculate from the remaining ledger records rather than subtracting
        # from a possibly stale order total. This keeps the balance/status in sync.
        remaining_payments = await db.payments.find({"order_id": order["id"]}, {"_id": 0, "amount": 1}).to_list(2000)
        new_paid = round(sum(float(item.get("amount", 0) or 0) for item in remaining_payments), 2)
        ps = compute_payment_status(float(order.get("total_price", 0)), new_paid)
        await db.orders.update_one({"id": order["id"]}, {"$set": {"total_paid": new_paid, "payment_status": ps}})
    await audit("Payment deleted", f"Payment of {pay['amount']:,.0f} removed from order {pay['order_id']}.",
                user.get("email", ""), pay["order_id"])
    return {"ok": True}


async def _receipt_bundle(receipt_id: str):
    receipt = await db.receipts.find_one({"id": receipt_id}, {"_id": 0})
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    receipt["receipt_number"] = short_receipt_number(receipt.get("receipt_number"))
    order = await db.orders.find_one({"id": receipt["order_id"]}, {"_id": 0})
    if order:
        order["flavors"] = selections(order, "flavor", "flavors")
        order["fillings"] = selections(order, "filling", "fillings")
        order["frostings"] = selections(order, "frosting", "frostings")
    client = await db.clients.find_one({"id": receipt["client_id"]}, {"_id": 0})
    payment = await db.payments.find_one({"id": receipt["payment_id"]}, {"_id": 0})
    settings = await db.settings.find_one({"id": "business"}, {"_id": 0}) or {}
    return receipt, order, client, payment, settings


@router.get("/receipts")
async def list_receipts(user=Depends(require_admin)):
    receipts = await db.receipts.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for receipt in receipts:
        receipt["receipt_number"] = short_receipt_number(receipt.get("receipt_number"))
    order_ids = list({r["order_id"] for r in receipts})
    orders = await db.orders.find({"id": {"$in": order_ids}}, {"_id": 0, "id": 1, "order_number": 1}).to_list(1000)
    client_ids = list({r["client_id"] for r in receipts})
    clients = await db.clients.find({"id": {"$in": client_ids}}, {"_id": 0, "id": 1, "full_name": 1}).to_list(1000)
    omap = {o["id"]: o for o in orders}
    cmap = {c["id"]: c for c in clients}
    for r in receipts:
        r["order_number"] = omap.get(r["order_id"], {}).get("order_number", "")
        r["client_name"] = cmap.get(r["client_id"], {}).get("full_name", "")
    return receipts


@router.get("/receipts/{receipt_id}")
async def get_receipt(receipt_id: str, user=Depends(require_admin)):
    receipt, order, client, payment, settings = await _receipt_bundle(receipt_id)
    return {"receipt": receipt, "order": order, "client": client, "payment": payment, "settings": settings}


@router.get("/receipts/{receipt_id}/pdf")
async def receipt_pdf(receipt_id: str, user=Depends(require_admin)):
    import httpx
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas

    receipt, order, client, payment, settings = await _receipt_bundle(receipt_id)
    order = order or {}
    client = client or {}
    payment = payment or {}
    currency = settings.get("currency", "UGX")
    balance = float(order.get("total_price", 0) or 0) - float(order.get("total_paid", 0) or 0)

    def m(value):
        return f"{currency} {float(value or 0):,.0f}"

    def safe(value, fallback="—"):
        text = str(value or "").strip()
        return text if text else fallback

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    left, right = 48, w - 48
    ink = colors.HexColor("#2B1917")
    brown = colors.HexColor("#68483B")
    muted = colors.HexColor("#82736A")
    line = colors.HexColor("#E8DED5")
    pale = colors.HexColor("#FDFBF9")
    accent = colors.HexColor("#A66F5D")

    # A small brand mark is loaded from the public site. If the image cannot
    # be reached, the receipt still renders cleanly with the wordmark.
    logo = None
    try:
        async with httpx.AsyncClient(timeout=4.0, follow_redirects=True) as client_http:
            response = await client_http.get("https://pastryquin.online/pq-icon-192.png")
            response.raise_for_status()
            logo = ImageReader(io.BytesIO(response.content))
    except Exception:
        logger.info("Receipt logo unavailable; rendering wordmark only")

    top = h - 48
    if logo:
        c.drawImage(logo, left, top - 56, width=52, height=52, preserveAspectRatio=True, mask="auto")
    brand_x = left + (66 if logo else 0)
    c.setFillColor(ink)
    c.setFont("Times-Bold", 22)
    c.drawString(brand_x, top - 22, settings.get("business_name", "PASTRY QUIN"))
    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(brand_x + 1, top - 38, (settings.get("tagline") or "Taste Royalty").upper())
    contact = "  ·  ".join(safe(v, "") for v in [settings.get("phone"), settings.get("email"), settings.get("address")] if safe(v, ""))
    if contact:
        c.setFillColor(muted)
        c.setFont("Helvetica", 7.5)
        c.drawString(brand_x, top - 52, contact[:115])

    stamp_x = right - 88
    c.setStrokeColor(accent)
    c.setLineWidth(0.8)
    c.rect(stamp_x, top - 52, 88, 42, stroke=1, fill=0)
    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(stamp_x + 44, top - 27, "PAYMENT")
    c.drawCentredString(stamp_x + 44, top - 39, "RECEIPT")

    y = top - 75
    c.setStrokeColor(line)
    c.setLineWidth(0.8)
    c.line(left, y, right, y)
    y -= 24

    # Receipt identifier and date form a compact reference row.
    c.setFillColor(muted)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(left, y, "RECEIPT NO.")
    c.drawString(right - 145, y, "DATE RECEIVED")
    y -= 14
    c.setFillColor(ink)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left, y, safe(receipt.get("receipt_number")))
    c.setFont("Helvetica", 10)
    c.drawString(right - 145, y, safe(payment.get("date") or receipt.get("created_at", "")[:10]))
    y -= 24

    def section(title, current_y):
        c.setFillColor(brown)
        c.setFont("Times-Bold", 12)
        c.drawString(left, current_y, title)
        c.setStrokeColor(line)
        c.line(left, current_y - 6, right, current_y - 6)
        return current_y - 22

    def detail(label, value, x, current_y, max_width=235):
        c.setFillColor(muted)
        c.setFont("Helvetica", 7.5)
        c.drawString(x, current_y, label.upper())
        c.setFillColor(ink)
        c.setFont("Helvetica", 9)
        text = safe(value)
        while c.stringWidth(text, "Helvetica", 9) > max_width and len(text) > 4:
            text = text[:-4] + "…"
        c.drawString(x, current_y - 13, text)

    y = section("CLIENT & ORDER", y)
    col2 = left + 260
    detail("Received from", client.get("full_name"), left, y)
    detail("Order number", order.get("order_number"), col2, y)
    y -= 39
    flavors = order.get("flavors") or order.get("flavor")
    if isinstance(flavors, list):
        flavors = ", ".join(flavors)
    cake = " · ".join(str(v) for v in [order.get("cake_type"), flavors, order.get("size")] if v)
    needed = " ".join(str(v) for v in [order.get("date_needed"), order.get("time_needed")] if v)
    detail("Cake", cake, left, y)
    detail("Date needed", needed, col2, y)
    y -= 39
    detail("Payment method", payment.get("method"), left, y)
    detail("Payment reference", payment.get("reference") or "—", col2, y)
    y -= 39
    extras = []
    for label, key in [("Fillings", "fillings"), ("Frostings", "frostings")]:
        vals = order.get(key) or []
        if isinstance(vals, list) and vals:
            extras.append((label, ", ".join(vals)))
    for label, value in extras:
        detail(label, value, left, y, max_width=480)
        y -= 31

    y -= 4
    y = section("PAYMENT SUMMARY", y)
    # Neat aligned totals, with the amount received and balance clearly visible.
    rows = [
        ("Amount received", m(payment.get("amount", receipt.get("amount"))), True),
        ("Total order price", m(order.get("total_price")), False),
        ("Total paid to date", m(order.get("total_paid")), False),
        ("Balance outstanding", m(balance), True),
    ]
    box_top = y + 9
    box_bottom = y - (len(rows) * 21) - 3
    c.setFillColor(pale)
    c.setStrokeColor(line)
    c.roundRect(left, box_bottom, right - left, box_top - box_bottom, 5, stroke=1, fill=1)
    row_y = y - 8
    for label, value, bold in rows:
        c.setFillColor(ink if bold else muted)
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 9)
        c.drawString(left + 13, row_y, label)
        c.setFillColor(ink)
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 9)
        c.drawRightString(right - 13, row_y, value)
        row_y -= 21
    y = box_bottom - 22

    if payment.get("notes"):
        c.setFillColor(muted)
        c.setFont("Helvetica-Bold", 7.5)
        c.drawString(left, y, "NOTE")
        c.setFillColor(ink)
        c.setFont("Helvetica", 9)
        c.drawString(left + 35, y, str(payment["notes"])[:100])
        y -= 20

    # Signature lines and a restrained footer keep this suitable for printing.
    footer_y = 92
    c.setStrokeColor(line)
    c.line(left, footer_y + 30, right, footer_y + 30)
    c.setStrokeColor(colors.HexColor("#CDBDB2"))
    c.line(left + 10, footer_y, left + 155, footer_y)
    c.line(right - 155, footer_y, right - 10, footer_y)
    c.setFillColor(muted)
    c.setFont("Helvetica", 8)
    c.drawCentredString(left + 82, footer_y - 12, "Received by")
    c.drawCentredString(right - 82, footer_y - 12, "Client signature")
    c.setFillColor(brown)
    c.setFont("Times-Roman", 11)
    c.drawCentredString(w / 2, 48, "Thank you for choosing PASTRY QUIN.")
    c.setFillColor(muted)
    c.setFont("Helvetica", 7)
    c.drawCentredString(w / 2, 34, "Please keep this receipt for your records.")
    c.save()
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={receipt['receipt_number']}.pdf"},
    )


@router.post("/receipts/{receipt_id}/email")
async def email_receipt(receipt_id: str, user=Depends(require_admin)):
    receipt, order, client, payment, settings = await _receipt_bundle(receipt_id)
    if not client or not client.get("email"):
        raise HTTPException(status_code=400, detail="This client has no email address on file.")
    await send_receipt_email(client, order, payment, receipt, settings)
    await audit("Receipt emailed", f"Receipt {receipt['receipt_number']} emailed to {client['email']}.",
                user.get("email", ""), order["id"])
    return {"ok": True}
