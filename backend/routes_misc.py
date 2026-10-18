import asyncio
import hmac
import os
import uuid
from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel

from auth import get_current_user
from db import audit, db, now_iso, selections, uid
from reminders import process_due_reminders
from storage import put_object

router = APIRouter(tags=["misc"])


# ---------- Feedback ----------
class FeedbackIn(BaseModel):
    client_id: str
    order_id: str = ""
    date: str = ""
    rating: int = 5
    feedback: str = ""
    went_well: str = ""
    improve: str = ""
    follow_up: str = ""


@router.get("/feedback")
async def list_feedback(user=Depends(get_current_user)):
    items = await db.feedback.find({"archived": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).to_list(500)
    client_ids = list({f["client_id"] for f in items})
    clients = await db.clients.find({"id": {"$in": client_ids}}, {"_id": 0, "id": 1, "full_name": 1}).to_list(1000)
    order_ids = list({f["order_id"] for f in items if f.get("order_id")})
    orders = await db.orders.find({"id": {"$in": order_ids}}, {"_id": 0, "id": 1, "order_number": 1}).to_list(1000)
    cmap = {c["id"]: c for c in clients}
    omap = {o["id"]: o for o in orders}
    for f in items:
        f["client_name"] = cmap.get(f["client_id"], {}).get("full_name", "")
        f["order_number"] = omap.get(f.get("order_id", ""), {}).get("order_number", "")
    return items


@router.post("/feedback")
async def create_feedback(body: FeedbackIn, user=Depends(get_current_user)):
    if not await db.clients.find_one({"id": body.client_id}):
        raise HTTPException(status_code=404, detail="Client not found")
    doc = body.model_dump()
    doc.update({"id": uid(), "archived": False, "date": doc["date"] or date.today().isoformat(),
                "created_at": now_iso()})
    await db.feedback.insert_one(doc)
    await audit("Feedback recorded", "Client feedback recorded.", user.get("email", ""), body.order_id or None)
    doc.pop("_id", None)
    return doc


@router.put("/feedback/{fid}")
async def update_feedback(fid: str, body: FeedbackIn, user=Depends(get_current_user)):
    res = await db.feedback.update_one({"id": fid}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return await db.feedback.find_one({"id": fid}, {"_id": 0})


@router.post("/feedback/{fid}/archive")
async def archive_feedback(fid: str, user=Depends(get_current_user)):
    await db.feedback.update_one({"id": fid}, {"$set": {"archived": True}})
    return {"ok": True}


# ---------- Notifications ----------
@router.get("/notifications")
async def list_notifications(user=Depends(get_current_user)):
    items = await db.notifications.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    unread = await db.notifications.count_documents({"read": False})
    return {"items": items, "unread": unread}


@router.post("/notifications/{nid}/read")
async def mark_read(nid: str, user=Depends(get_current_user)):
    await db.notifications.update_one({"id": nid}, {"$set": {"read": True}})
    return {"ok": True}


@router.post("/notifications/read-all")
async def mark_all_read(user=Depends(get_current_user)):
    await db.notifications.update_many({}, {"$set": {"read": True}})
    return {"ok": True}


# ---------- Reminders ----------
@router.get("/reminders")
async def list_reminders(order_id: str = "", user=Depends(get_current_user)):
    query = {"order_id": order_id} if order_id else {}
    return await db.email_reminders.find(query, {"_id": 0}).sort("scheduled_date", -1).to_list(500)


# ---------- Audit ----------
@router.get("/audit")
async def list_audit(user=Depends(get_current_user)):
    return await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


# ---------- Settings ----------
@router.get("/settings")
async def get_settings(user=Depends(get_current_user)):
    s = await db.settings.find_one({"id": "business"}, {"_id": 0})
    return s or {"id": "business", "business_name": "PASTRY QUIN", "currency": "UGX"}


@router.put("/settings")
async def update_settings(body: dict, user=Depends(get_current_user)):
    body.pop("id", None)
    body.pop("_id", None)
    await db.settings.update_one({"id": "business"}, {"$set": body}, upsert=True)
    await audit("Settings updated", "Business settings updated.", user.get("email", ""))
    return await db.settings.find_one({"id": "business"}, {"_id": 0})


@router.post("/settings/logo")
async def upload_logo(file: UploadFile = File(...), user=Depends(get_current_user)):
    ct = file.content_type or ""
    if not ct.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Logo must be under 5MB")
    ext = (file.filename.rsplit(".", 1)[-1] if "." in (file.filename or "") else "png").lower()
    path = f"pastry-quin/branding/logo-{uuid.uuid4()}.{ext}"
    result = await asyncio.to_thread(put_object, path, data, ct)
    await db.settings.update_one({"id": "business"},
                                 {"$set": {"logo_path": result["path"], "logo_content_type": ct}}, upsert=True)
    return {"logo_path": result["path"]}


# ---------- Reports ----------
@router.get("/reports/summary")
async def reports_summary(user=Depends(get_current_user)):
    orders = await db.orders.find({"archived": {"$ne": True}}, {"_id": 0}).to_list(10000)
    payments = await db.payments.find({}, {"_id": 0}).to_list(10000)
    clients = await db.clients.find({"archived": {"$ne": True}}, {"_id": 0}).to_list(10000)
    feedback = await db.feedback.find({"archived": {"$ne": True}}, {"_id": 0}).to_list(1000)

    monthly_revenue = {}
    daily_revenue = {}
    for p in payments:
        m = (p.get("date") or p.get("created_at", ""))[:7]
        d = (p.get("date") or p.get("created_at", ""))[:10]
        monthly_revenue[m] = monthly_revenue.get(m, 0) + float(p["amount"])
        daily_revenue[d] = daily_revenue.get(d, 0) + float(p["amount"])

    monthly_orders = {}
    status_counts = {}
    flavor_counts = {}
    type_counts = {}
    design_counts = {}
    revenue_by_type = {}
    for o in orders:
        monthly_orders[o.get("order_date", "")[:7]] = monthly_orders.get(o.get("order_date", "")[:7], 0) + 1
        status_counts[o.get("status", "")] = status_counts.get(o.get("status", ""), 0) + 1
        for fl in selections(o, "flavor", "flavors"):
            flavor_counts[fl] = flavor_counts.get(fl, 0) + 1
        if o.get("cake_type"):
            type_counts[o["cake_type"]] = type_counts.get(o["cake_type"], 0) + 1
            revenue_by_type[o["cake_type"]] = revenue_by_type.get(o["cake_type"], 0) + float(o.get("total_paid", 0))
        if o.get("design_category"):
            design_counts[o["design_category"]] = design_counts.get(o["design_category"], 0) + 1

    order_counts = {}
    for o in orders:
        order_counts[o["client_id"]] = order_counts.get(o["client_id"], 0) + 1
    cmap = {c["id"]: c.get("full_name", "") for c in clients}
    top_clients = sorted(
        ({"name": cmap.get(cid, ""), "orders": n} for cid, n in order_counts.items()),
        key=lambda x: -x["orders"])[:5]
    month = date.today().isoformat()[:7]
    new_clients = sum(1 for c in clients if (c.get("created_at") or "")[:7] == month)
    returning = sum(1 for n in order_counts.values() if n > 1)

    ratings = [f.get("rating", 0) for f in feedback if f.get("rating")]
    avg_rating = round(sum(ratings) / len(ratings), 1) if ratings else 0
    outstanding = sum(max(0.0, float(o.get("total_price", 0)) - float(o.get("total_paid", 0)))
                      for o in orders if o.get("status") != "Cancelled")

    def top(d, n=8):
        return [{"name": k, "value": v} for k, v in sorted(d.items(), key=lambda x: -x[1])[:n]]

    return {
        "total_sales": sum(float(o.get("total_price", 0)) for o in orders if o.get("status") != "Cancelled"),
        "payments_received": sum(float(p["amount"]) for p in payments),
        "outstanding": outstanding,
        "monthly_revenue": [{"name": k, "value": monthly_revenue[k]} for k in sorted(monthly_revenue)],
        "daily_revenue": [{"name": k, "value": daily_revenue[k]} for k in sorted(daily_revenue)][-30:],
        "revenue_by_type": top(revenue_by_type),
        "monthly_orders": [{"name": k, "value": monthly_orders[k]} for k in sorted(monthly_orders)],
        "status_counts": top(status_counts, 12),
        "flavor_counts": top(flavor_counts),
        "type_counts": top(type_counts),
        "design_counts": top(design_counts),
        "total_orders": len(orders),
        "completed_orders": status_counts.get("Completed", 0),
        "cancelled_orders": status_counts.get("Cancelled", 0),
        "upcoming_orders": sum(1 for o in orders if o.get("date_needed", "") >= date.today().isoformat()
                               and o.get("status") not in ("Cancelled", "Completed", "Picked Up", "Delivered")),
        "clients": {"total": len(clients), "new_this_month": new_clients,
                    "returning": returning, "top": top_clients},
        "feedback": {"count": len(feedback), "avg_rating": avg_rating,
                     "recent": sorted(feedback, key=lambda f: f.get("created_at", ""), reverse=True)[:5]},
    }


# ---------- Cron ----------
@router.post("/cron/send-reminders")
async def cron_send_reminders(request: Request, background_tasks: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get("Authorization", "")
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    if not secret or not auth.startswith("Bearer ") or not hmac.compare_digest(auth[7:], secret):
        raise HTTPException(status_code=401, detail="Unauthorized")
    background_tasks.add_task(process_due_reminders)
    return {"ok": True}
