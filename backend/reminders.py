import logging
from datetime import date, datetime, timedelta, timezone

from db import db, notify, now_iso, uid
from emailer import send_reminder_email

logger = logging.getLogger(__name__)

DONE_STATUSES = ("Cancelled", "Completed", "Picked Up", "Delivered")


async def schedule_reminders(order: dict, client: dict):
    today = date.today()
    try:
        dn = date.fromisoformat(order["date_needed"])
    except (ValueError, TypeError):
        return
    balance = float(order.get("total_price", 0)) - float(order.get("total_paid", 0))
    email = client.get("email") or ""
    name = client.get("full_name", "")
    items = []
    if balance > 0:
        items.append(("deposit_due", today + timedelta(days=2)))
    for rtype, d in (("week_before", dn - timedelta(days=7)),
                     ("three_days", dn - timedelta(days=3)),
                     ("day_of", dn)):
        if d >= today:
            items.append((rtype, d))
    for rtype, d in items:
        await db.email_reminders.insert_one({
            "id": uid(), "order_id": order["id"], "type": rtype,
            "scheduled_date": d.isoformat(), "sent_date": None,
            "recipient": name, "email": email, "status": "scheduled",
            "error": "", "created_at": now_iso(),
        })


async def cancel_pending_reminders(order_id: str):
    await db.email_reminders.update_many(
        {"order_id": order_id, "status": "scheduled"}, {"$set": {"status": "cancelled"}})


async def process_due_reminders() -> dict:
    today = date.today().isoformat()
    due = await db.email_reminders.find(
        {"status": "scheduled", "scheduled_date": {"$lte": today}}, {"_id": 0}).to_list(500)
    settings = await db.settings.find_one({"id": "business"}, {"_id": 0}) or {}
    sent = failed = 0
    for r in due:
        order = await db.orders.find_one({"id": r["order_id"]}, {"_id": 0})
        if not order or order.get("archived") or order.get("status") in DONE_STATUSES:
            await db.email_reminders.update_one({"id": r["id"]}, {"$set": {"status": "cancelled"}})
            continue
        balance = float(order.get("total_price", 0)) - float(order.get("total_paid", 0))
        if r["type"] == "deposit_due" and balance <= 0:
            await db.email_reminders.update_one({"id": r["id"]}, {"$set": {"status": "cancelled"}})
            continue
        client = await db.clients.find_one({"id": order["client_id"]}, {"_id": 0})
        if not client or not client.get("email"):
            await db.email_reminders.update_one(
                {"id": r["id"]}, {"$set": {"status": "failed", "error": "Client has no email address"}})
            failed += 1
            continue
        try:
            await send_reminder_email(client, order, r["type"], settings)
            await db.email_reminders.update_one(
                {"id": r["id"]}, {"$set": {"status": "sent", "sent_date": now_iso()}})
            sent += 1
        except Exception as e:
            logger.error(f"Reminder send failed: {e}")
            await db.email_reminders.update_one(
                {"id": r["id"]}, {"$set": {"status": "failed", "error": str(e)[:300]}})
            await notify("Reminder email failed",
                         f"Could not send {r['type']} reminder for {order['order_number']}.",
                         "alert", order["id"])
            failed += 1

    # Internal notifications: cakes due in 7 / 3 / 0 days with no notice yet today
    for days in (7, 3, 0):
        target = (date.today() + timedelta(days=days)).isoformat()
        orders = await db.orders.find(
            {"date_needed": target, "archived": {"$ne": True},
             "status": {"$nin": list(DONE_STATUSES)}}, {"_id": 0}).to_list(200)
        for o in orders:
            label = "today" if days == 0 else f"in {days} days"
            exists = await db.notifications.find_one({
                "order_id": o["id"], "type": "due",
                "created_at": {"$gte": datetime.now(timezone.utc).date().isoformat()}})
            if not exists:
                await notify(f"Cake needed {label}",
                             f"{o['order_number']} — {o.get('cake_type', '')} cake is needed {label}.",
                             "due", o["id"])
    # Deposit overdue notifications
    overdue = await db.orders.find(
        {"archived": {"$ne": True}, "status": {"$nin": list(DONE_STATUSES)},
         "$expr": {"$gt": ["$total_price", "$total_paid"]}},
        {"_id": 0}).to_list(200)
    for o in overdue:
        exists = await db.notifications.find_one({
            "order_id": o["id"], "type": "deposit",
            "created_at": {"$gte": datetime.now(timezone.utc).date().isoformat()}})
        if not exists:
            await notify("Deposit overdue",
                         f"Outstanding balance on {o['order_number']}.",
                         "deposit", o["id"])
    return {"sent": sent, "failed": failed}
