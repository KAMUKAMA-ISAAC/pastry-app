from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from db import audit, db, now_iso, uid

router = APIRouter(prefix="/clients", tags=["clients"])


class ClientIn(BaseModel):
    full_name: str
    phone: str = ""
    whatsapp: str = ""
    email: str = ""
    address: str = ""
    preferred_contact: str = "Phone"
    notes: str = ""
    favorite_flavor: str = ""
    preferred_style: str = ""
    preferred_colors: str = ""
    special_preferences: str = ""
    important_notes: str = ""


@router.get("")
async def list_clients(q: str = "", filter: str = "all", archived: bool = False,
                       page: int = 1, limit: int = 50, user=Depends(get_current_user)):
    query = {"archived": archived}
    if q:
        query["$or"] = [
            {"full_name": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
            {"whatsapp": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
        ]
    clients = await db.clients.find(query, {"_id": 0}).sort("full_name", 1).to_list(2000)
    counts = {}
    async for o in db.orders.aggregate([
        {"$match": {"archived": {"$ne": True}}},
        {"$group": {"_id": "$client_id", "n": {"$sum": 1}}},
    ]):
        counts[o["_id"]] = o["n"]
    for c in clients:
        c["order_count"] = counts.get(c["id"], 0)
    if filter == "new":
        clients = [c for c in clients if c["order_count"] <= 1]
    elif filter == "returning":
        clients = [c for c in clients if c["order_count"] > 1]
    total = len(clients)
    start = (page - 1) * limit
    return {"items": clients[start:start + limit], "total": total}


@router.post("")
async def create_client(body: ClientIn, user=Depends(get_current_user)):
    if not body.full_name.strip():
        raise HTTPException(status_code=400, detail="Client name is required")
    doc = body.model_dump()
    doc.update({"id": uid(), "archived": False, "created_at": now_iso()})
    await db.clients.insert_one(doc)
    await audit("Client created", f"Client '{doc['full_name']}' added.", user.get("email", ""))
    doc.pop("_id", None)
    return doc


@router.get("/{client_id}")
async def get_client(client_id: str, user=Depends(get_current_user)):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    orders = await db.orders.find({"client_id": client_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    feedback = await db.feedback.find({"client_id": client_id, "archived": {"$ne": True}}, {"_id": 0}).to_list(100)
    return {"client": client, "orders": orders, "feedback": feedback}


@router.put("/{client_id}")
async def update_client(client_id: str, body: ClientIn, user=Depends(get_current_user)):
    res = await db.clients.update_one({"id": client_id}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    await audit("Client updated", f"Client '{body.full_name}' updated.", user.get("email", ""))
    return await db.clients.find_one({"id": client_id}, {"_id": 0})


@router.post("/{client_id}/archive")
async def archive_client(client_id: str, user=Depends(get_current_user)):
    await db.clients.update_one({"id": client_id}, {"$set": {"archived": True}})
    await audit("Client archived", f"Client {client_id} archived.", user.get("email", ""))
    return {"ok": True}


@router.post("/{client_id}/restore")
async def restore_client(client_id: str, user=Depends(get_current_user)):
    await db.clients.update_one({"id": client_id}, {"$set": {"archived": False}})
    await audit("Client restored", f"Client {client_id} restored.", user.get("email", ""))
    return {"ok": True}


@router.delete("/{client_id}")
async def delete_client(client_id: str, user=Depends(get_current_user)):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    order_count = await db.orders.count_documents({"client_id": client_id})
    if order_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"This client has {order_count} order(s). Delete those orders first, or archive the client instead.")
    await db.clients.delete_one({"id": client_id})
    await db.feedback.delete_many({"client_id": client_id})
    await audit("Client deleted", f"Client '{client['full_name']}' permanently deleted.", user.get("email", ""))
    return {"ok": True}
