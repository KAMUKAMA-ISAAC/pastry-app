import io
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth import get_current_user
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


async def create_payment(order: dict, amount: float, method: str, reference: str,
                         notes: str, date: str, actor: str) -> tuple[dict, dict]:
    year = datetime.now(timezone.utc).year
    rseq = await next_seq("receipt", year)
    receipt_number = f"PQ-R-{year}-{rseq:04d}"
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
async def list_payments(order_id: str = "", page: int = 1, limit: int = 100, user=Depends(get_current_user)):
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
async def add_payment(order_id: str, body: PaymentIn, user=Depends(get_current_user)):
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
async def delete_payment(payment_id: str, user=Depends(get_current_user)):
    pay = await db.payments.find_one({"id": payment_id}, {"_id": 0})
    if not pay:
        raise HTTPException(status_code=404, detail="Payment not found")
    await db.payments.delete_one({"id": payment_id})
    await db.receipts.delete_one({"id": pay.get("receipt_id")})
    order = await db.orders.find_one({"id": pay["order_id"]}, {"_id": 0})
    if order:
        new_paid = round(float(order.get("total_paid", 0)) - float(pay["amount"]), 2)
        ps = compute_payment_status(float(order.get("total_price", 0)), new_paid)
        await db.orders.update_one({"id": order["id"]}, {"$set": {"total_paid": new_paid, "payment_status": ps}})
    await audit("Payment deleted", f"Payment of {pay['amount']:,.0f} removed from order {pay['order_id']}.",
                user.get("email", ""), pay["order_id"])
    return {"ok": True}


async def _receipt_bundle(receipt_id: str):
    receipt = await db.receipts.find_one({"id": receipt_id}, {"_id": 0})
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
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
async def list_receipts(user=Depends(get_current_user)):
    receipts = await db.receipts.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
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
async def get_receipt(receipt_id: str, user=Depends(get_current_user)):
    receipt, order, client, payment, settings = await _receipt_bundle(receipt_id)
    return {"receipt": receipt, "order": order, "client": client, "payment": payment, "settings": settings}


@router.get("/receipts/{receipt_id}/pdf")
async def receipt_pdf(receipt_id: str, user=Depends(get_current_user)):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    receipt, order, client, payment, settings = await _receipt_bundle(receipt_id)
    currency = settings.get("currency", "UGX")
    balance = float(order.get("total_price", 0)) - float(order.get("total_paid", 0))

    def m(n):
        return f"{currency} {float(n or 0):,.0f}"

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    x = 370
    c.setFillColorRGB(0.17, 0.11, 0.09)
    c.setFont("Times-Bold", 24)
    c.drawCentredString(w / 2, h - 60, settings.get("business_name", "PASTRY QUIN"))
    c.setFont("Helvetica", 9)
    c.setFillColorRGB(0.55, 0.43, 0.38)
    c.drawCentredString(w / 2, h - 76, (settings.get("tagline") or "Taste Royalty").upper())
    contact = " · ".join([v for v in [settings.get("phone"), settings.get("email"), settings.get("address")] if v])
    if contact:
        c.drawCentredString(w / 2, h - 90, contact[:110])
    c.setStrokeColorRGB(0.93, 0.90, 0.87)
    c.line(50, h - 100, w - 50, h - 100)
    c.setFont("Times-Bold", 15)
    c.setFillColorRGB(0.17, 0.11, 0.09)
    c.drawCentredString(w / 2, h - 122, "PAYMENT RECEIPT")

    def row(label, value, y, bold=False):
        c.setFont("Helvetica", 9)
        c.setFillColorRGB(0.55, 0.43, 0.38)
        c.drawString(50, y, label)
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 10)
        c.setFillColorRGB(0.17, 0.11, 0.09)
        c.drawRightString(w - 50, y, str(value))

    y = h - 150
    for label, value, bold in [
        ("Receipt No", receipt["receipt_number"], True),
        ("Date", (payment or {}).get("date", receipt["created_at"][:10]), False),
        ("Client", (client or {}).get("full_name", ""), False),
        ("Order No", (order or {}).get("order_number", ""), False),
        ("Cake", f"{(order or {}).get('cake_type', '')} · {(order or {}).get('flavor', '')} · {(order or {}).get('size', '')}", False),
        ("Date Needed", f"{(order or {}).get('date_needed', '')} {(order or {}).get('time_needed', '')}", False),
        ("Payment Method", (payment or {}).get("method", ""), False),
        ("Payment Reference", (payment or {}).get("reference", "") or "—", False),
    ] + [
        (label, ", ".join((order or {}).get(field, [])), False)
        for label, field in [("Fillings", "fillings"), ("Frostings", "frostings")]
        if (order or {}).get(field)
    ]:
        row(label, value, y, bold)
        y -= 18
    c.setStrokeColorRGB(0.93, 0.90, 0.87)
    c.line(50, y, w - 50, y)
    y -= 22
    for label, value, bold in [
        ("Amount Received", m(payment["amount"] if payment else receipt["amount"]), True),
        ("Total Order Price", m((order or {}).get("total_price", 0)), False),
        ("Total Paid To Date", m((order or {}).get("total_paid", 0)), False),
        ("Remaining Balance", m(balance), True),
    ]:
        row(label, value, y, bold)
        y -= 18
    if (payment or {}).get("notes"):
        c.setFont("Helvetica-Oblique", 9)
        c.setFillColorRGB(0.47, 0.40, 0.37)
        c.drawString(50, y - 6, f"Notes: {payment['notes'][:100]}")
        y -= 20
    c.setFont("Helvetica", 8)
    c.setFillColorRGB(0.65, 0.58, 0.54)
    c.drawCentredString(w / 2, 70, "Thank you for choosing PASTRY QUIN.")
    c.drawCentredString(w / 2, 58, "Cakes are best kept cool. Deposits are non-refundable once preparation begins.")
    c.setStrokeColorRGB(0.93, 0.90, 0.87)
    c.line(50, 110, 200, 110)
    c.line(w - 200, 110, w - 50, 110)
    c.setFont("Helvetica", 8)
    c.drawCentredString(125, 100, "Received by")
    c.drawCentredString(w - 125, 100, "Client signature")
    c.save()
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f"attachment; filename={receipt['receipt_number']}.pdf"})


@router.post("/receipts/{receipt_id}/email")
async def email_receipt(receipt_id: str, user=Depends(get_current_user)):
    receipt, order, client, payment, settings = await _receipt_bundle(receipt_id)
    if not client or not client.get("email"):
        raise HTTPException(status_code=400, detail="This client has no email address on file.")
    await send_receipt_email(client, order, payment, receipt, settings)
    await audit("Receipt emailed", f"Receipt {receipt['receipt_number']} emailed to {client['email']}.",
                user.get("email", ""), order["id"])
    return {"ok": True}
