import asyncio
import csv
import io
import re
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth import require_permission
from db import audit, compute_payment_status, db, next_seq, notify, now_iso, selections, uid
from permissions import (FINANCIAL_AUDIT_ACTIONS, FINANCIAL_NOTIFICATION_TYPES, FINANCIAL_REMINDER_TYPES, can,
                         redact_order, redact_orders)
from reminders import cancel_pending_reminders, schedule_reminders
from routes_payments import create_payment
from storage import put_object

router = APIRouter(tags=["orders"])

ORDER_STATUSES = ["Inquiry", "Confirmed", "Deposit Pending", "Deposit Paid", "In Preparation",
                  "Baking", "Decorating", "Ready", "Picked Up", "Delivered", "Completed", "Cancelled"]
DONE_STATUSES = ("Cancelled", "Completed", "Picked Up", "Delivered")
PENDING_STATUSES = ["Inquiry", "Confirmed", "Deposit Pending"]
IN_PROGRESS_STATUSES = ["Deposit Paid", "In Preparation", "Baking", "Decorating", "Ready"]
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


class OrderIn(BaseModel):
    client_id: str | None = None
    new_client: dict | None = None
    category: str = "normal"
    cake_type: str = ""
    # Legacy singular fields (kept for old callers / backward compatibility);
    # the plural list is the source of truth going forward. On save, the
    # singular field is re-derived as a comma-joined summary of the list.
    flavor: str = ""
    flavors: list[str] = []
    filling: str = ""
    fillings: list[str] = []
    frosting: str = ""
    frostings: list[str] = []
    size: str = ""
    tiers: int = 1
    colors: str = ""
    theme: str = ""
    message: str = ""
    decorations: str = ""
    quantity: int = 1
    special_requests: str = ""
    date_needed: str = ""
    time_needed: str = ""
    fulfillment: str = "pickup"
    delivery_location: str = ""
    total_price: float | None = None  # administrators only (managePrices); omitted = unchanged / 0 on create
    status: str = "Inquiry"
    design_category: str = ""
    internal_notes: str = ""
    client_instructions: str = ""
    design_notes: str = ""
    initial_payment: dict | None = None


def _normalize_selections(body: OrderIn) -> dict:
    """Derive the stored flavor/filling/frosting fields from an OrderIn body.

    Accepts either the new plural lists or (from older callers) just the
    singular string, and always returns both: the list, plus a comma-joined
    singular summary so existing search/filter/CSV/export code keeps working
    unchanged.
    """
    def norm(values: list[str], single: str) -> list[str]:
        vals = [v.strip() for v in (values or []) if v and v.strip()]
        return vals or ([single.strip()] if single and single.strip() else [])

    flavors = norm(body.flavors, body.flavor)
    fillings = norm(body.fillings, body.filling)
    frostings = norm(body.frostings, body.frosting)
    return {
        "flavors": flavors, "flavor": ", ".join(flavors),
        "fillings": fillings, "filling": ", ".join(fillings),
        "frostings": frostings, "frosting": ", ".join(frostings),
    }


def _augment(o: dict) -> dict:
    """Ensure an order response always carries list forms of its
    multi-select fields, even for orders saved before multi-select existed.
    """
    o["flavors"] = selections(o, "flavor", "flavors")
    o["fillings"] = selections(o, "filling", "fillings")
    o["frostings"] = selections(o, "frosting", "frostings")
    return o


async def _resolve_client(body: OrderIn, actor: str) -> dict:
    if body.client_id:
        client = await db.clients.find_one({"id": body.client_id}, {"_id": 0})
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        return client
    if body.new_client and body.new_client.get("full_name"):
        doc = {"id": uid(), "archived": False, "created_at": now_iso(),
               "phone": "", "whatsapp": "", "email": "", "address": "",
               "preferred_contact": "Phone", "notes": "", "favorite_flavor": "",
               "preferred_style": "", "preferred_colors": "", "special_preferences": "",
               "important_notes": ""}
        doc.update({k: v for k, v in body.new_client.items() if k in doc and k != "id"})
        await db.clients.insert_one(doc)
        await audit("Client created", f"Client '{doc['full_name']}' added via order.", actor)
        doc.pop("_id", None)
        return doc
    raise HTTPException(status_code=400, detail="Please select or create a client")


@router.get("/orders/meta")
async def orders_meta(user=Depends(require_permission("manageOrders"))):
    return {"statuses": ORDER_STATUSES,
            "payment_methods": ["Cash", "Mobile Money", "Bank", "Card", "Other"] if can(user, "viewPayments") else [],
            "categories": [{"id": "wedding_intro", "label": "Wedding & Introduction"},
                           {"id": "normal", "label": "Normal (Small Cakes)"}]}


@router.get("/orders")
async def list_orders(q: str = "", status: str = "", category: str = "", client_id: str = "",
                      payment_status: str = "", flavor: str = "", cake_type: str = "",
                      fulfillment: str = "", date_from: str = "", date_to: str = "",
                      archived: bool = False, page: int = 1, limit: int = 25,
                      user=Depends(require_permission("manageOrders"))):
    if payment_status and not can(user, "viewFinancials"):
        raise HTTPException(status_code=403, detail="You do not have permission to filter by payment status")
    query = {"archived": archived}
    if status:
        query["status"] = status
    if category:
        query["category"] = category
    if client_id:
        query["client_id"] = client_id
    if payment_status:
        query["payment_status"] = payment_status
    if flavor:
        # Match orders where this is one of possibly several flavors
        # (stored as a comma-joined summary), not just an exact single match.
        query["flavor"] = {"$regex": re.escape(flavor), "$options": "i"}
    if cake_type:
        query["cake_type"] = cake_type
    if fulfillment:
        query["fulfillment"] = fulfillment
    if date_from or date_to:
        query["date_needed"] = {}
        if date_from:
            query["date_needed"]["$gte"] = date_from
        if date_to:
            query["date_needed"]["$lte"] = date_to
    if q:
        query["$or"] = [{"order_number": {"$regex": q, "$options": "i"}},
                        {"flavor": {"$regex": q, "$options": "i"}},
                        {"cake_type": {"$regex": q, "$options": "i"}},
                        {"theme": {"$regex": q, "$options": "i"}}]
    total = await db.orders.count_documents(query)
    orders = await db.orders.find(query, {"_id": 0}).sort("date_needed", 1).skip((page - 1) * limit).limit(limit).to_list(limit)
    client_ids = list({o["client_id"] for o in orders})
    clients = await db.clients.find({"id": {"$in": client_ids}}, {"_id": 0, "id": 1, "full_name": 1, "phone": 1}).to_list(1000)
    cmap = {c["id"]: c for c in clients}
    order_ids = [o["id"] for o in orders]
    finals = await db.order_images.find({"order_id": {"$in": order_ids}, "kind": "final", "is_deleted": False},
                                        {"_id": 0, "order_id": 1, "storage_path": 1}).to_list(1000)
    fmap = {f["order_id"]: f["storage_path"] for f in finals}
    for o in orders:
        o["client_name"] = cmap.get(o["client_id"], {}).get("full_name", "")
        o["client_phone"] = cmap.get(o["client_id"], {}).get("phone", "")
        o["final_image"] = fmap.get(o["id"])
        o["balance"] = round(float(o.get("total_price", 0)) - float(o.get("total_paid", 0)), 2)
        _augment(o)
        redact_order(user, o)
    return {"items": orders, "total": total}


@router.post("/orders")
async def create_order(body: OrderIn, user=Depends(require_permission("manageOrders"))):
    if body.total_price is not None and not can(user, "managePrices"):
        raise HTTPException(status_code=403, detail="You do not have permission to set prices")
    if body.initial_payment and not can(user, "managePayments"):
        raise HTTPException(status_code=403, detail="You do not have permission to record payments")
    if not body.date_needed:
        raise HTTPException(status_code=400, detail="Date needed is required")
    if body.category not in ("wedding_intro", "normal"):
        raise HTTPException(status_code=400, detail="Invalid order category")
    actor = user.get("email", "")
    client = await _resolve_client(body, actor)
    year = datetime.now(timezone.utc).year
    seq = await next_seq("order", year)
    order_number = f"PQ-{year}-{seq:04d}"
    doc = body.model_dump(exclude={"new_client", "initial_payment"})
    doc.update(_normalize_selections(body))
    doc.update({
        "id": uid(), "order_number": order_number, "client_id": client["id"],
        "order_date": date.today().isoformat(), "total_price": body.total_price or 0.0, "total_paid": 0.0,
        "payment_status": "Unpaid", "archived": False,
        "created_at": now_iso(), "created_by": actor,
    })
    await db.orders.insert_one(doc)
    if body.initial_payment and float(body.initial_payment.get("amount") or 0) > 0:
        ip = body.initial_payment
        await create_payment(doc, float(ip["amount"]), ip.get("method", "Cash"),
                             ip.get("reference", ""), ip.get("notes", "Initial payment"),
                             ip.get("date", ""), actor)
        doc["total_paid"] = float(ip["amount"])
        doc["payment_status"] = compute_payment_status(doc["total_price"], doc["total_paid"])
    await schedule_reminders(doc, client)
    await audit("Order created", f"Order {order_number} created for {client['full_name']}.", actor, doc["id"])
    await notify("New order", f"{order_number} — {client['full_name']} · {doc.get('cake_type', '')} needed {doc['date_needed']}.", "order", doc["id"])
    doc.pop("_id", None)
    return redact_order(user, _augment(doc))


@router.get("/orders/upcoming")
async def upcoming_orders(user=Depends(require_permission("manageOrders"))):
    today = date.today().isoformat()
    orders = await db.orders.find(
        {"archived": {"$ne": True}, "date_needed": {"$gte": today},
         "status": {"$nin": list(DONE_STATUSES)}}, {"_id": 0}).sort("date_needed", 1).to_list(100)
    client_ids = list({o["client_id"] for o in orders})
    clients = await db.clients.find({"id": {"$in": client_ids}}, {"_id": 0, "id": 1, "full_name": 1}).to_list(1000)
    cmap = {c["id"]: c for c in clients}
    finals = await db.order_images.find({"order_id": {"$in": [o["id"] for o in orders]}, "kind": "final", "is_deleted": False},
                                        {"_id": 0, "order_id": 1, "storage_path": 1}).to_list(1000)
    fmap = {f["order_id"]: f["storage_path"] for f in finals}
    for o in orders:
        o["client_name"] = cmap.get(o["client_id"], {}).get("full_name", "")
        o["final_image"] = fmap.get(o["id"])
        o["balance"] = round(float(o.get("total_price", 0)) - float(o.get("total_paid", 0)), 2)
        _augment(o)
        redact_order(user, o)
    return orders


@router.get("/orders/{order_id}")
async def get_order(order_id: str, user=Depends(require_permission("manageOrders"))):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    client = await db.clients.find_one({"id": order["client_id"]}, {"_id": 0})
    payments = (await db.payments.find({"order_id": order_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
                if can(user, "viewPayments") else [])
    images = await db.order_images.find({"order_id": order_id, "is_deleted": False}, {"_id": 0}).sort("created_at", 1).to_list(100)
    reminders = await db.email_reminders.find({"order_id": order_id}, {"_id": 0}).sort("scheduled_date", 1).to_list(100)
    feedback = await db.feedback.find({"order_id": order_id, "archived": {"$ne": True}}, {"_id": 0}).to_list(50)
    audits = await db.audit_logs.find({"order_id": order_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    if not can(user, "viewFinancials"):
        reminders = [r for r in reminders if r.get("type") not in FINANCIAL_REMINDER_TYPES]
    if not can(user, "viewPayments"):
        audits = [a for a in audits if a.get("action") not in FINANCIAL_AUDIT_ACTIONS]
    order["balance"] = round(float(order.get("total_price", 0)) - float(order.get("total_paid", 0)), 2)
    _augment(order)
    redact_order(user, order)
    return {"order": order, "client": client, "payments": payments, "images": images,
            "reminders": reminders, "feedback": feedback, "audits": audits}


@router.put("/orders/{order_id}")
async def update_order(order_id: str, body: OrderIn, user=Depends(require_permission("manageOrders"))):
    if body.total_price is not None and not can(user, "managePrices"):
        raise HTTPException(status_code=403, detail="You do not have permission to change prices")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    actor = user.get("email", "")
    updates = body.model_dump(exclude={"new_client", "initial_payment", "client_id"})
    updates.update(_normalize_selections(body))
    if updates.get("total_price") is None:
        updates.pop("total_price", None)
    if body.client_id and body.client_id != order["client_id"]:
        client = await db.clients.find_one({"id": body.client_id}, {"_id": 0})
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        updates["client_id"] = body.client_id
    if "total_price" in updates and updates["total_price"] != order.get("total_price"):
        updates["payment_status"] = compute_payment_status(float(updates["total_price"]), float(order.get("total_paid", 0)))
        await audit("Order price changed",
                    f"{order['order_number']} price changed to {updates['total_price']:,.0f}.", actor, order_id)
    await db.orders.update_one({"id": order_id}, {"$set": updates})
    if updates.get("date_needed") and updates["date_needed"] != order.get("date_needed"):
        await cancel_pending_reminders(order_id)
        fresh = await db.orders.find_one({"id": order_id}, {"_id": 0})
        client = await db.clients.find_one({"id": fresh["client_id"]}, {"_id": 0})
        await schedule_reminders(fresh, client)
    await audit("Order updated", f"Order {order['order_number']} updated.", actor, order_id)
    fresh_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return redact_order(user, _augment(fresh_order))


@router.post("/orders/{order_id}/status")
async def set_status(order_id: str, body: dict, user=Depends(require_permission("manageOrders"))):
    status = body.get("status", "")
    if status not in ORDER_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    await db.orders.update_one({"id": order_id}, {"$set": {"status": status}})
    await audit("Status changed", f"{order['order_number']} status changed from {order['status']} to {status}.",
                user.get("email", ""), order_id)
    if status in DONE_STATUSES:
        await cancel_pending_reminders(order_id)
    return {"ok": True}


@router.post("/orders/{order_id}/archive")
async def archive_order(order_id: str, user=Depends(require_permission("manageOrders"))):
    await db.orders.update_one({"id": order_id}, {"$set": {"archived": True}})
    await cancel_pending_reminders(order_id)
    await audit("Order archived", f"Order {order_id} archived.", user.get("email", ""), order_id)
    return {"ok": True}


@router.post("/orders/{order_id}/restore")
async def restore_order(order_id: str, user=Depends(require_permission("manageOrders"))):
    await db.orders.update_one({"id": order_id}, {"$set": {"archived": False}})
    await audit("Order restored", f"Order {order_id} restored.", user.get("email", ""), order_id)
    return {"ok": True}


@router.delete("/orders/{order_id}")
async def delete_order(order_id: str, user=Depends(require_permission("deleteOrders"))):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    # Do not orphan financial accountability records when an order is removed.
    linked_payments = await db.payments.find({"order_id": order_id}, {"_id": 0, "id": 1}).to_list(2000)
    if linked_payments and not can(user, "managePayments"):
        raise HTTPException(status_code=403, detail="Orders with recorded payments can only be deleted by an Administrator.")
    for linked_payment in linked_payments:
        pid = linked_payment["id"]
        allocations = [
            await db.bank_deposits.find_one({"payment_id": pid, "status": {"$ne": "reversed"}}),
            await db.business_expenses.find_one({"payment_id": pid, "status": {"$ne": "reversed"}}),
            await db.fund_allocations.find_one({"payment_id": pid, "status": {"$ne": "reversed"}}),
        ]
        if any(allocations):
            raise HTTPException(status_code=409, detail="This order has payments with financial allocations. Reverse or correct the linked deposits, expenses, and other uses before deleting the order.")
    await db.orders.delete_one({"id": order_id})
    await db.payments.delete_many({"order_id": order_id})
    await db.receipts.delete_many({"order_id": order_id})
    await db.order_images.update_many({"order_id": order_id}, {"$set": {"is_deleted": True}})
    await db.email_reminders.delete_many({"order_id": order_id})
    await db.feedback.update_many({"order_id": order_id}, {"$set": {"order_id": ""}})
    await audit("Order deleted", f"Order {order['order_number']} permanently deleted.", user.get("email", ""))
    return {"ok": True}


@router.post("/orders/{order_id}/images")
async def upload_image(order_id: str, kind: str = "reference", file: UploadFile = File(...),
                       user=Depends(require_permission("manageOrders"))):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if kind not in ("final", "reference"):
        raise HTTPException(status_code=400, detail="Invalid image kind")
    ct = file.content_type or ""
    if ct not in IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, WEBP or GIF images are allowed")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be under 10MB")
    ext = (file.filename.rsplit(".", 1)[-1] if "." in (file.filename or "") else "jpg").lower()
    path = f"pastry-quin/orders/{order_id}/{uuid.uuid4()}.{ext}"
    result = await asyncio.to_thread(put_object, path, data, ct)
    if kind == "final":
        await db.order_images.update_many({"order_id": order_id, "kind": "final"},
                                          {"$set": {"is_deleted": True}})
    doc = {"id": uid(), "order_id": order_id, "storage_path": result["path"], "kind": kind,
           "filename": file.filename, "content_type": ct, "is_deleted": False, "created_at": now_iso()}
    await db.order_images.insert_one(doc)
    await audit("Final design updated" if kind == "final" else "Reference image added",
                f"{'Final confirmed design' if kind == 'final' else 'Reference image'} uploaded for {order['order_number']}.",
                user.get("email", ""), order_id)
    doc.pop("_id", None)
    return doc


@router.delete("/orders/{order_id}/images/{image_id}")
async def delete_image(order_id: str, image_id: str, user=Depends(require_permission("manageOrders"))):
    await db.order_images.update_one({"id": image_id, "order_id": order_id}, {"$set": {"is_deleted": True}})
    await audit("Image removed", f"Image removed from order {order_id}.", user.get("email", ""), order_id)
    return {"ok": True}


@router.get("/designs")
async def design_gallery(category: str = "", cake_type: str = "", flavor: str = "",
                         user=Depends(require_permission("manageDesigns"))):
    query = {"archived": {"$ne": True}}
    if category:
        query["design_category"] = category
    if cake_type:
        query["cake_type"] = cake_type
    if flavor:
        query["flavor"] = {"$regex": re.escape(flavor), "$options": "i"}
    orders = await db.orders.find(query, {"_id": 0}).sort("date_needed", -1).to_list(500)
    order_ids = [o["id"] for o in orders]
    finals = await db.order_images.find({"order_id": {"$in": order_ids}, "kind": "final", "is_deleted": False},
                                        {"_id": 0}).to_list(1000)
    fmap = {f["order_id"]: f for f in finals}
    client_ids = list({o["client_id"] for o in orders})
    clients = await db.clients.find({"id": {"$in": client_ids}}, {"_id": 0, "id": 1, "full_name": 1}).to_list(1000)
    cmap = {c["id"]: c for c in clients}
    items = []
    for o in orders:
        if o["id"] in fmap:
            items.append({"order_id": o["id"], "order_number": o["order_number"],
                          "client_name": cmap.get(o["client_id"], {}).get("full_name", ""),
                          "cake_type": o.get("cake_type", ""), "flavor": o.get("flavor", ""),
                          "design_category": o.get("design_category", ""), "category": o.get("category", ""),
                          "date_needed": o.get("date_needed", ""), "image": fmap[o["id"]]})
    return items


@router.get("/dashboard")
async def dashboard(user=Depends(require_permission("manageOrders"))):
    today = date.today().isoformat()
    month = today[:7]
    show_money = can(user, "viewFinancials")
    live = {"archived": {"$ne": True}}
    total_clients = await db.clients.count_documents({"archived": {"$ne": True}})
    total_orders = await db.orders.count_documents(live)
    completed = await db.orders.count_documents({**live, "status": "Completed"})
    orders_this_month = await db.orders.count_documents({**live, "order_date": {"$regex": f"^{month}"}})
    upcoming_count = await db.orders.count_documents(
        {**live, "date_needed": {"$gte": today}, "status": {"$nin": list(DONE_STATUSES)}})
    pending_orders = await db.orders.count_documents({**live, "status": {"$in": PENDING_STATUSES}})
    in_progress_orders = await db.orders.count_documents({**live, "status": {"$in": IN_PROGRESS_STATUSES}})
    new_clients = await db.clients.count_documents(
        {"archived": {"$ne": True}, "created_at": {"$gte": month}})
    stats = {"total_clients": total_clients, "total_orders": total_orders,
             "upcoming_cakes": upcoming_count, "orders_this_month": orders_this_month,
             "completed_orders": completed, "pending_orders": pending_orders,
             "in_progress_orders": in_progress_orders, "new_clients_this_month": new_clients}
    if show_money:
        payments = await db.payments.find({}, {"_id": 0, "amount": 1}).to_list(10000)
        open_orders = await db.orders.find(
            {**live, "status": {"$nin": ["Cancelled"]}},
            {"_id": 0, "total_price": 1, "total_paid": 1}).to_list(10000)
        stats.update({
            "pending_payments": sum(1 for o in open_orders if float(o.get("total_price", 0)) > float(o.get("total_paid", 0))),
            "total_revenue": sum(float(p["amount"]) for p in payments),
            "outstanding_balance": sum(max(0.0, float(o.get("total_price", 0)) - float(o.get("total_paid", 0)))
                                       for o in open_orders)})
    upcoming = await db.orders.find(
        {**live, "date_needed": {"$gte": today}, "status": {"$nin": list(DONE_STATUSES)}},
        {"_id": 0}).sort("date_needed", 1).to_list(8)
    client_ids = list({o["client_id"] for o in upcoming})
    clients = await db.clients.find({"id": {"$in": client_ids}}, {"_id": 0, "id": 1, "full_name": 1}).to_list(100)
    cmap = {c["id"]: c for c in clients}
    finals = await db.order_images.find({"order_id": {"$in": [o["id"] for o in upcoming]}, "kind": "final", "is_deleted": False},
                                        {"_id": 0, "order_id": 1, "storage_path": 1}).to_list(100)
    fmap = {f["order_id"]: f["storage_path"] for f in finals}
    for o in upcoming:
        o["client_name"] = cmap.get(o["client_id"], {}).get("full_name", "")
        o["final_image"] = fmap.get(o["id"])
        o["balance"] = round(float(o.get("total_price", 0)) - float(o.get("total_paid", 0)), 2)
        redact_order(user, o)
    unread_q = {"read": False}
    if not show_money:
        unread_q["type"] = {"$nin": list(FINANCIAL_NOTIFICATION_TYPES)}
    unread = await db.notifications.count_documents(unread_q)
    return {"stats": stats, "upcoming": upcoming, "unread_notifications": unread}


@router.get("/search")
async def global_search(q: str = "", user=Depends(require_permission())):
    if not q:
        return {"clients": [], "orders": []}
    rx = {"$regex": q, "$options": "i"}
    clients = await db.clients.find(
        {"$or": [{"full_name": rx}, {"phone": rx}, {"whatsapp": rx}, {"email": rx}],
         "archived": {"$ne": True}}, {"_id": 0}).limit(8).to_list(8)
    orders = await db.orders.find(
        {"$or": [{"order_number": rx}, {"flavor": rx}, {"cake_type": rx}, {"theme": rx}],
         "archived": {"$ne": True}}, {"_id": 0}).limit(8).to_list(8)
    client_ids = list({o["client_id"] for o in orders})
    cls = await db.clients.find({"id": {"$in": client_ids}}, {"_id": 0, "id": 1, "full_name": 1}).to_list(100)
    cmap = {c["id"]: c for c in cls}
    for o in orders:
        o["client_name"] = cmap.get(o["client_id"], {}).get("full_name", "")
    return {"clients": clients, "orders": redact_orders(user, orders)}


@router.get("/export/{entity}")
async def export_csv(entity: str, user=Depends(require_permission())):
    buf = io.StringIO()
    w = csv.writer(buf)
    if entity == "clients":
        if not can(user, "manageClients"):
            raise HTTPException(status_code=403, detail="You do not have permission to export this data")
        w.writerow(["Name", "Phone", "WhatsApp", "Email", "Address", "Preferred Contact", "Date Added"])
        async for c in db.clients.find({"archived": {"$ne": True}}, {"_id": 0}):
            w.writerow([c.get("full_name"), c.get("phone"), c.get("whatsapp"), c.get("email"),
                        c.get("address"), c.get("preferred_contact"), c.get("created_at", "")[:10]])
    elif entity == "orders":
        # The orders CSV carries totals, paid and balance columns, so it is a financial export.
        if not can(user, "exportFinancialData"):
            raise HTTPException(status_code=403, detail="You do not have permission to export financial data")
        money_cols = can(user, "viewFinancials")
        w.writerow(["Order No", "Client", "Category", "Type", "Flavor", "Filling", "Frosting", "Size", "Date Needed"]
                   + (["Total", "Paid", "Balance", "Payment Status"] if money_cols else []) + ["Status"])
        orders = await db.orders.find({"archived": {"$ne": True}}, {"_id": 0}).to_list(10000)
        client_ids = list({o["client_id"] for o in orders})
        clients = await db.clients.find({"id": {"$in": client_ids}}, {"_id": 0, "id": 1, "full_name": 1}).to_list(10000)
        cmap = {c["id"]: c for c in clients}
        for o in orders:
            w.writerow([o.get("order_number"), cmap.get(o["client_id"], {}).get("full_name", ""),
                        o.get("category"), o.get("cake_type"), o.get("flavor"), o.get("filling"),
                        o.get("frosting"), o.get("size"), o.get("date_needed")]
                       + ([o.get("total_price"), o.get("total_paid"),
                           round(float(o.get("total_price", 0)) - float(o.get("total_paid", 0)), 2),
                           o.get("payment_status")] if money_cols else [])
                       + [o.get("status")])
    elif entity == "payments":
        if not can(user, "exportFinancialData"):
            raise HTTPException(status_code=403, detail="You do not have permission to export financial data")
        w.writerow(["Date", "Order", "Amount", "Method", "Reference", "Recorded By", "Notes"])
        orders = await db.orders.find({}, {"_id": 0, "id": 1, "order_number": 1}).to_list(10000)
        omap = {o["id"]: o for o in orders}
        async for p in db.payments.find({}, {"_id": 0}):
            w.writerow([p.get("date"), omap.get(p["order_id"], {}).get("order_number", ""),
                        p.get("amount"), p.get("method"), p.get("reference"),
                        p.get("recorded_by"), p.get("notes")])
    else:
        raise HTTPException(status_code=404, detail="Unknown export")
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename=pastry-quin-{entity}.csv"})
