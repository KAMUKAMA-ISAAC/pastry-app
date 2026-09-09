from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from db import db, now_iso, uid

router = APIRouter(tags=["catalog"])

COLLECTIONS = {
    "flavors": "flavors",
    "cake-types": "cake_types",
    "cake-sizes": "cake_sizes",
    "design-categories": "design_categories",
}


class CatalogItemIn(BaseModel):
    name: str
    description: str = ""
    notes: str = ""
    servings: str = ""
    active: bool = True


def _coll(kind: str):
    if kind not in COLLECTIONS:
        raise HTTPException(status_code=404, detail="Unknown catalog")
    return db[COLLECTIONS[kind]]


@router.get("/catalog/{kind}")
async def list_items(kind: str, user=Depends(get_current_user)):
    return await _coll(kind).find({}, {"_id": 0}).sort("name", 1).to_list(500)


@router.post("/catalog/{kind}")
async def create_item(kind: str, body: CatalogItemIn, user=Depends(get_current_user)):
    coll = _coll(kind)
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if await coll.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}}):
        raise HTTPException(status_code=400, detail="An item with this name already exists")
    doc = {"id": uid(), "name": name, "description": body.description, "notes": body.notes,
           "servings": body.servings, "active": body.active, "created_at": now_iso()}
    await coll.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/catalog/{kind}/{item_id}")
async def update_item(kind: str, item_id: str, body: CatalogItemIn, user=Depends(get_current_user)):
    coll = _coll(kind)
    res = await coll.update_one({"id": item_id}, {"$set": {
        "name": body.name.strip(), "description": body.description, "notes": body.notes,
        "servings": body.servings, "active": body.active}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return await coll.find_one({"id": item_id}, {"_id": 0})


@router.delete("/catalog/{kind}/{item_id}")
async def delete_item(kind: str, item_id: str, user=Depends(get_current_user)):
    res = await _coll(kind).delete_one({"id": item_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}
