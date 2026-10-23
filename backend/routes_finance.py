import asyncio
from datetime import date, datetime, timedelta, timezone
from typing import Optional, Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

from auth import require_permission
from db import audit, db, now_iso, uid
from storage import put_object

router = APIRouter(tags=["financial-accountability"])
MONEY = 2


def money(value):
    return round(float(value or 0), MONEY)


def admin(user):
    # Permission is resolved from the stored user role by auth.require_permission.
    return user.get("role") in ("owner", "admin")


def active_filter(extra=None):
    return {"status": {"$ne": "reversed"}, **(extra or {})}


async def payment_record(payment_id):
    p = await db.payments.find_one({"id": payment_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Customer payment not found")
    order = await db.orders.find_one({"id": p.get("order_id")}, {"_id": 0})
    client = await db.clients.find_one({"id": (order or {}).get("client_id")}, {"_id": 0})
    receipt = await db.receipts.find_one({"id": p.get("receipt_id")}, {"_id": 0})
    p["order_number"] = (order or {}).get("order_number", "")
    p["client_id"] = (order or {}).get("client_id", "")
    p["client_name"] = (client or {}).get("full_name", "")
    p["receipt_number"] = (receipt or {}).get("receipt_number", "")
    return p


async def payment_allocations(payment_id, exclude_kind=None, exclude_id=None):
    deposits = await db.bank_deposits.find(active_filter({"payment_id": payment_id}), {"_id": 0}).to_list(5000)
    expenses = await db.business_expenses.find(active_filter({"payment_id": payment_id}), {"_id": 0}).to_list(5000)
    others = await db.fund_allocations.find(active_filter({"payment_id": payment_id}), {"_id": 0}).to_list(5000)
    if exclude_kind == "deposit":
        deposits = [x for x in deposits if x.get("id") != exclude_id]
    if exclude_kind == "expense":
        expenses = [x for x in expenses if x.get("id") != exclude_id]
    if exclude_kind == "other":
        others = [x for x in others if x.get("id") != exclude_id]
    deposited = sum(money(x.get("allocation_amount", x.get("amount", 0))) for x in deposits)
    spent = sum(money(x.get("allocation_amount", x.get("amount", 0))) for x in expenses)
    other = sum(money(x.get("allocation_amount", x.get("amount", 0))) for x in others)
    return {"deposited": money(deposited), "expenses": money(spent), "other": money(other),
            "allocated": money(deposited + spent + other), "remaining": money(0)}


async def validate_payment_allocation(payment_id, amount, kind=None, record_id=None):
    if not payment_id:
        return 0
    p = await payment_record(payment_id)
    current = await payment_allocations(payment_id, kind, record_id)
    available = money(float(p.get("amount", 0)) - current["allocated"])
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Payment allocation must be greater than zero")
    if money(amount) > available:
        raise HTTPException(status_code=400, detail=f"Allocation exceeds the available amount ({available:,.2f} UGX).")
    return money(amount)


class ExpenseIn(BaseModel):
    date: str
    amount: float = Field(gt=0)
    recipient: str = Field(min_length=1, max_length=200)
    authorized_by: str = ""
    category: str = "Other business expenses"
    description: str = Field(min_length=1, max_length=1000)
    method: str = "Cash"
    payment_id: Optional[str] = None
    allocation_amount: Optional[float] = Field(default=None, gt=0)
    reference: str = ""
    notes: str = ""
    attachment: str = ""


class DepositIn(BaseModel):
    date: str
    amount: float = Field(gt=0)
    source: Literal["Customer payment", "Business funds", "Other source"] = "Customer payment"
    client_id: Optional[str] = None
    payment_id: Optional[str] = None
    bank_account: str = Field(min_length=1, max_length=200)
    reference: str = ""
    description: str = ""
    notes: str = ""
    attachment: str = ""
    allocation_amount: Optional[float] = Field(default=None, gt=0)


class ReconciliationIn(BaseModel):
    payment_id: str
    cash_held: float = Field(ge=0)
    notes: str = ""


class OtherAllocationIn(BaseModel):
    payment_id: str
    date: str
    amount: float = Field(gt=0)
    purpose: str = Field(min_length=1, max_length=500)
    notes: str = ""


def _date_filter(start, end, field="date"):
    result = {}
    if start:
        result["$gte"] = start
    if end:
        result["$lte"] = end
    return {field: result} if result else {}


def _matches_date(item, start, end):
    d = str(item.get("date", ""))[:10]
    return (not start or d >= start) and (not end or d <= end)


@router.post("/finance/attachments")
async def upload_finance_attachment(file: UploadFile = File(...), user=Depends(require_permission("manageExpenses"))):
    content_type = file.content_type or ""
    allowed = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if content_type not in allowed:
        raise HTTPException(status_code=400, detail="Supporting attachments must be JPG, PNG, WEBP, or GIF images.")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Attachment must be under 10 MB.")
    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}[content_type]
    path = f"pastry-quin/finance/{uid()}.{ext}"
    result = await asyncio.to_thread(put_object, path, data, content_type)
    return {"path": result["path"], "filename": file.filename, "content_type": content_type}


@router.get("/finance/payments")
async def finance_payments(q: str = "", client_id: str = "", user=Depends(require_permission("manageExpenses"))):
    payments = await db.payments.find({}, {"_id": 0}).sort("date", -1).to_list(5000)
    result = []
    for raw in payments:
        p = await payment_record(raw["id"])
        if client_id and p.get("client_id") != client_id:
            continue
        if q and q.lower() not in " ".join(str(p.get(k, "")) for k in ("client_name", "order_number", "receipt_number", "reference")).lower():
            continue
        a = await payment_allocations(p["id"])
        remaining = money(float(p.get("amount", 0)) - a["allocated"])
        reconciliation = await db.fund_reconciliations.find({"payment_id": p["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1)
        cash_held = money(reconciliation[0].get("cash_held", 0)) if reconciliation else 0
        p.update({"allocated_to_bank": a["deposited"], "allocated_to_expenses": a["expenses"],
                  "allocated_to_other": a["other"], "total_allocated": a["allocated"],
                  "remaining_unallocated": remaining, "cash_held_verified": cash_held,
                  "reconciled": bool(reconciliation),
                  "unaccounted_for": max(0, money(remaining - cash_held)) if reconciliation else None,
                  "reconciliation_difference": money(remaining - cash_held) if reconciliation else None,
                  "reconciliation_notes": reconciliation[0].get("notes", "") if reconciliation else ""})
        result.append(p)
    return {"items": result}


@router.get("/finance/clients")
async def finance_clients(user=Depends(require_permission("manageExpenses"))):
    clients = await db.clients.find({}, {"_id": 0, "id": 1, "full_name": 1}).sort("full_name", 1).to_list(5000)
    return {"items": clients}


@router.get("/expenses")
async def list_expenses(q: str = "", start_date: str = "", end_date: str = "", category: str = "",
                        recipient: str = "", method: str = "", recorded_by: str = "", payment_id: str = "",
                        user=Depends(require_permission("manageExpenses"))):
    docs = await db.business_expenses.find(active_filter(), {"_id": 0}).sort("date", -1).to_list(5000)
    items = []
    for d in docs:
        if not _matches_date(d, start_date, end_date): continue
        if category and d.get("category") != category: continue
        if method and d.get("method") != method: continue
        if recorded_by and d.get("recorded_by") != recorded_by: continue
        if payment_id and d.get("payment_id") != payment_id: continue
        if recipient and recipient.lower() not in d.get("recipient", "").lower(): continue
        if q and q.lower() not in " ".join(str(d.get(k, "")) for k in ("expense_id", "recipient", "category", "description", "reference", "notes")).lower(): continue
        items.append(d)
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)
    def total_between(a, b):
        return money(sum(float(x.get("amount", 0)) for x in items if _matches_date(x, a.isoformat(), b.isoformat())))
    return {"items": items, "summary": {
        "today": total_between(today, today), "week": total_between(week_start, today),
        "month": total_between(month_start, today), "selected": money(sum(float(x.get("amount", 0)) for x in items)),
        "count": len(items)}}


@router.post("/expenses")
async def create_expense(body: ExpenseIn, user=Depends(require_permission("manageExpenses"))):
    if body.payment_id:
        allocation = money(body.allocation_amount if body.allocation_amount is not None else body.amount)
        if allocation > money(body.amount):
            raise HTTPException(status_code=400, detail="Payment allocation cannot exceed the expense amount.")
        await validate_payment_allocation(body.payment_id, allocation)
    else:
        allocation = 0
    ref = f"EXP-{datetime.now(timezone.utc).strftime('%Y%m')}-{(await db.counters.find_one_and_update({'_id': 'expense'}, {'$inc': {'seq': 1}}, upsert=True, return_document=True))['seq']:04d}"
    doc = {"id": uid(), "expense_id": ref, **body.model_dump(), "allocation_amount": allocation,
           "status": "active", "recorded_by": user.get("email", ""), "created_at": now_iso(), "updated_at": now_iso()}
    await db.business_expenses.insert_one(doc)
    await audit("Expense recorded", f"{ref}: UGX {body.amount:,.2f} — {body.description}", user.get("email", ""))
    return doc


@router.get("/expenses/{expense_id}")
async def get_expense(expense_id: str, user=Depends(require_permission("manageExpenses"))):
    doc = await db.business_expenses.find_one({"id": expense_id}, {"_id": 0})
    if not doc: raise HTTPException(status_code=404, detail="Expense not found")
    return doc


@router.put("/expenses/{expense_id}")
async def update_expense(expense_id: str, body: ExpenseIn, user=Depends(require_permission("manageExpenses"))):
    old = await db.business_expenses.find_one({"id": expense_id}, {"_id": 0})
    if not old or old.get("status") == "reversed": raise HTTPException(status_code=404, detail="Active expense not found")
    allocation = money(body.allocation_amount if body.payment_id and body.allocation_amount is not None else body.amount if body.payment_id else 0)
    if body.payment_id:
        if allocation > money(body.amount):
            raise HTTPException(status_code=400, detail="Payment allocation cannot exceed the expense amount.")
        await validate_payment_allocation(body.payment_id, allocation, "expense", expense_id)
    doc = {**body.model_dump(), "allocation_amount": allocation, "recorded_by": old.get("recorded_by"),
           "updated_by": user.get("email", ""), "updated_at": now_iso(), "status": "active"}
    await db.business_expenses.update_one({"id": expense_id}, {"$set": doc})
    await db.finance_audit.insert_one({"id": uid(), "kind": "expense", "record_id": expense_id, "action": "corrected", "actor": user.get("email", ""), "created_at": now_iso(), "snapshot": old})
    await audit("Expense corrected", f"{old.get('expense_id')} updated by {user.get('email','')}", user.get("email", ""))
    return {**old, **doc}


@router.post("/expenses/{expense_id}/reverse")
async def reverse_expense(expense_id: str, reason: str = Query(..., min_length=3), user=Depends(require_permission("manageExpenses"))):
    old = await db.business_expenses.find_one({"id": expense_id}, {"_id": 0})
    if not old: raise HTTPException(status_code=404, detail="Expense not found")
    if old.get("status") == "reversed": raise HTTPException(status_code=400, detail="Expense already reversed")
    await db.business_expenses.update_one({"id": expense_id}, {"$set": {"status": "reversed", "reversed_by": user.get("email", ""), "reversed_at": now_iso(), "reversal_reason": reason}})
    await db.finance_audit.insert_one({"id": uid(), "kind": "expense", "record_id": expense_id, "action": "reversed", "reason": reason, "actor": user.get("email", ""), "created_at": now_iso(), "snapshot": old})
    await audit("Expense reversed", f"{old.get('expense_id')} reversed: {reason}", user.get("email", ""))
    return {"ok": True}


@router.get("/bank-deposits")
async def list_deposits(q: str = "", start_date: str = "", end_date: str = "", client_id: str = "",
                        bank_account: str = "", source: str = "", payment_id: str = "",
                        user=Depends(require_permission("manageBankTransfers"))):
    docs = await db.bank_deposits.find(active_filter(), {"_id": 0}).sort("date", -1).to_list(5000)
    items = []
    for d in docs:
        if not _matches_date(d, start_date, end_date): continue
        if client_id and d.get("client_id") != client_id: continue
        if bank_account and d.get("bank_account") != bank_account: continue
        if source and d.get("source") != source: continue
        if payment_id and d.get("payment_id") != payment_id: continue
        if q and q.lower() not in " ".join(str(d.get(k, "")) for k in ("deposit_id", "client_name", "reference", "description", "notes", "bank_account")).lower(): continue
        items.append(d)
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)
    def total_between(a, b):
        return money(sum(float(x.get("amount", 0)) for x in items if _matches_date(x, a.isoformat(), b.isoformat())))
    return {"items": items, "summary": {"today": total_between(today, today), "week": total_between(week_start, today),
            "month": total_between(month_start, today), "selected": money(sum(float(x.get("amount", 0)) for x in items)),
            "count": len(items)}}


@router.post("/bank-deposits")
async def create_deposit(body: DepositIn, user=Depends(require_permission("manageBankTransfers"))):
    if body.source == "Customer payment" and not body.payment_id:
        raise HTTPException(status_code=400, detail="Select the customer payment this deposit comes from.")
    if body.payment_id:
        p = await payment_record(body.payment_id)
        allocation = money(body.allocation_amount if body.allocation_amount is not None else body.amount)
        if allocation > money(body.amount):
            raise HTTPException(status_code=400, detail="Payment allocation cannot exceed the bank deposit amount.")
        await validate_payment_allocation(body.payment_id, allocation)
        client_id = body.client_id or p.get("client_id")
        if client_id != p.get("client_id"):
            raise HTTPException(status_code=400, detail="Selected client does not match the customer payment.")
        client_name = p.get("client_name", "")
        order_id = p.get("order_id", "")
        order_number = p.get("order_number", "")
        receipt_number = p.get("receipt_number", "")
    else:
        allocation, client_id, client_name, order_id, order_number, receipt_number = 0, body.client_id, "", "", "", ""
        if client_id:
            c = await db.clients.find_one({"id": client_id}, {"_id": 0})
            if not c: raise HTTPException(status_code=404, detail="Client not found")
            client_name = c.get("full_name", "")
    ref = f"DEP-{datetime.now(timezone.utc).strftime('%Y%m')}-{(await db.counters.find_one_and_update({'_id': 'deposit'}, {'$inc': {'seq': 1}}, upsert=True, return_document=True))['seq']:04d}"
    doc = {"id": uid(), "deposit_id": ref, **body.model_dump(), "allocation_amount": allocation, "client_id": client_id,
           "client_name": client_name, "order_id": order_id, "order_number": order_number, "receipt_number": receipt_number,
           "status": "active", "recorded_by": user.get("email", ""), "created_at": now_iso(), "updated_at": now_iso()}
    await db.bank_deposits.insert_one(doc)
    await audit("Bank deposit recorded", f"{ref}: UGX {body.amount:,.2f} into {body.bank_account}", user.get("email", ""))
    return doc


@router.get("/bank-deposits/{deposit_id}")
async def get_deposit(deposit_id: str, user=Depends(require_permission("manageBankTransfers"))):
    doc = await db.bank_deposits.find_one({"id": deposit_id}, {"_id": 0})
    if not doc: raise HTTPException(status_code=404, detail="Deposit not found")
    return doc


@router.put("/bank-deposits/{deposit_id}")
async def update_deposit(deposit_id: str, body: DepositIn, user=Depends(require_permission("manageBankTransfers"))):
    old = await db.bank_deposits.find_one({"id": deposit_id}, {"_id": 0})
    if not old or old.get("status") == "reversed": raise HTTPException(status_code=404, detail="Active deposit not found")
    if body.source == "Customer payment" and not body.payment_id:
        raise HTTPException(status_code=400, detail="Select the customer payment this deposit comes from.")
    if body.payment_id:
        p = await payment_record(body.payment_id)
        allocation = money(body.allocation_amount if body.allocation_amount is not None else body.amount)
        if allocation > money(body.amount):
            raise HTTPException(status_code=400, detail="Payment allocation cannot exceed the bank deposit amount.")
        await validate_payment_allocation(body.payment_id, allocation, "deposit", deposit_id)
        client_id, client_name, order_id, order_number, receipt_number = p.get("client_id"), p.get("client_name"), p.get("order_id"), p.get("order_number"), p.get("receipt_number")
    else:
        allocation, client_id, client_name, order_id, order_number, receipt_number = 0, body.client_id, "", "", "", ""
    doc = {**body.model_dump(), "allocation_amount": allocation, "client_id": client_id, "client_name": client_name,
           "order_id": order_id, "order_number": order_number, "receipt_number": receipt_number,
           "updated_by": user.get("email", ""), "updated_at": now_iso(), "status": "active"}
    await db.bank_deposits.update_one({"id": deposit_id}, {"$set": doc})
    await db.finance_audit.insert_one({"id": uid(), "kind": "deposit", "record_id": deposit_id, "action": "corrected", "actor": user.get("email", ""), "created_at": now_iso(), "snapshot": old})
    await audit("Bank deposit corrected", f"{old.get('deposit_id')} updated", user.get("email", ""))
    return {**old, **doc}


@router.post("/bank-deposits/{deposit_id}/reverse")
async def reverse_deposit(deposit_id: str, reason: str = Query(..., min_length=3), user=Depends(require_permission("manageBankTransfers"))):
    old = await db.bank_deposits.find_one({"id": deposit_id}, {"_id": 0})
    if not old: raise HTTPException(status_code=404, detail="Deposit not found")
    if old.get("status") == "reversed": raise HTTPException(status_code=400, detail="Deposit already reversed")
    await db.bank_deposits.update_one({"id": deposit_id}, {"$set": {"status": "reversed", "reversed_by": user.get("email", ""), "reversed_at": now_iso(), "reversal_reason": reason}})
    await db.finance_audit.insert_one({"id": uid(), "kind": "deposit", "record_id": deposit_id, "action": "reversed", "reason": reason, "actor": user.get("email", ""), "created_at": now_iso(), "snapshot": old})
    await audit("Bank deposit reversed", f"{old.get('deposit_id')} reversed: {reason}", user.get("email", ""))
    return {"ok": True}


@router.post("/finance/reconciliations")
async def reconcile_payment(body: ReconciliationIn, user=Depends(require_permission("manageExpenses"))):
    p = await payment_record(body.payment_id)
    a = await payment_allocations(body.payment_id)
    remaining = money(float(p.get("amount", 0)) - a["allocated"])
    if money(body.cash_held) > remaining:
        raise HTTPException(status_code=400, detail=f"Verified cash held cannot exceed the remaining unallocated amount ({remaining:,.2f} UGX).")
    doc = {"id": uid(), "payment_id": body.payment_id, "cash_held": money(body.cash_held),
           "notes": body.notes, "remaining_at_reconciliation": remaining,
           "unaccounted_for": max(0, money(remaining - body.cash_held)),
           "actor": user.get("email", ""), "created_at": now_iso()}
    await db.fund_reconciliations.insert_one(doc)
    await audit("Customer payment reconciled", f"Payment {body.payment_id}: UGX {body.cash_held:,.2f} cash verified; UGX {doc['unaccounted_for']:,.2f} unaccounted.", user.get("email", ""))
    return doc


@router.post("/finance/other-allocations")
async def create_other_allocation(body: OtherAllocationIn, user=Depends(require_permission("manageExpenses"))):
    await validate_payment_allocation(body.payment_id, body.amount)
    p = await payment_record(body.payment_id)
    doc = {"id": uid(), "allocation_id": f"OTH-{datetime.now(timezone.utc).strftime('%Y%m')}-{uid()[:6].upper()}",
           **body.model_dump(), "client_name": p.get("client_name", ""), "order_number": p.get("order_number", ""),
           "status": "active", "recorded_by": user.get("email", ""), "created_at": now_iso()}
    await db.fund_allocations.insert_one(doc)
    await audit("Other fund use recorded", f"{doc['allocation_id']}: {body.purpose}", user.get("email", ""))
    return doc


@router.get("/finance/monthly-summary")
async def monthly_summary(month: str = Query(default=""), user=Depends(require_permission("manageExpenses"))):
    if not month:
        month = date.today().isoformat()[:7]
    try:
        start = date.fromisoformat(month + "-01")
    except ValueError:
        raise HTTPException(status_code=400, detail="Month must use YYYY-MM format")
    next_month = date(start.year + (start.month == 12), 1 if start.month == 12 else start.month + 1, 1)
    end = (next_month - timedelta(days=1)).isoformat()
    payments = await db.payments.find({}, {"_id": 0}).to_list(5000)
    expenses = await db.business_expenses.find(active_filter(), {"_id": 0}).to_list(5000)
    deposits = await db.bank_deposits.find(active_filter(), {"_id": 0}).to_list(5000)
    ptotal = sum(float(p.get("amount", 0)) for p in payments if _matches_date(p, start.isoformat(), end))
    etotal = sum(float(e.get("amount", 0)) for e in expenses if _matches_date(e, start.isoformat(), end))
    dtotal = sum(float(d.get("amount", 0)) for d in deposits if _matches_date(d, start.isoformat(), end))
    return {"month": month, "customer_payments": money(ptotal), "expenses": money(etotal),
            "bank_deposits": money(dtotal), "payments_less_expenses": money(ptotal - etotal)}
