import asyncio
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import jwt
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware

from auth import router as auth_router, hash_password, verify_password
from db import db, now_iso, uid
from routes_catalog import router as catalog_router
from routes_clients import router as clients_router
from routes_misc import router as misc_router
from routes_orders import router as orders_router
from routes_payments import router as payments_router
from storage import get_object, init_storage

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="PASTRY QUIN Studio API")

from fastapi import APIRouter
api_router = APIRouter(prefix="/api")
api_router.include_router(auth_router)
api_router.include_router(clients_router)
api_router.include_router(orders_router)
api_router.include_router(payments_router)
api_router.include_router(catalog_router)
api_router.include_router(misc_router)


@api_router.get("/")
async def root():
    return {"message": "PASTRY QUIN Studio API"}


@api_router.get("/files/{path:path}")
async def serve_file(path: str, request: Request, auth: str = Query(None)):
    token = request.cookies.get("access_token") or auth
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    is_image = await db.order_images.find_one({"storage_path": path, "is_deleted": False})
    settings = await db.settings.find_one({"id": "business", "logo_path": path})
    if not is_image and not settings:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        data, content_type = await asyncio.to_thread(get_object, path)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    return Response(content=data, media_type=content_type)


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)


DEFAULT_FLAVORS = ["Vanilla", "Chocolate", "Red Velvet", "Carrot", "Lemon", "Strawberry",
                   "Coconut", "Black Forest", "Fruit Cake"]
DEFAULT_TYPES = ["Birthday", "Wedding", "Introduction", "Anniversary", "Graduation",
                 "Baby Shower", "Corporate", "Celebration", "Custom"]
DEFAULT_SIZES = [("6 inch", "8–12 servings"), ("8 inch", "15–20 servings"),
                 ("10 inch", "25–35 servings"), ("12 inch", "40–50 servings"), ("Custom", "")]
DEFAULT_DESIGN_CATEGORIES = ["Minimal", "Floral", "Wedding", "Birthday", "Luxury",
                             "Children's", "Corporate", "Vintage", "Custom"]
DEFAULT_FILLINGS = ["Buttercream", "Cream Cheese", "Chocolate Ganache", "Fruit Preserve",
                    "Whipped Cream", "Custard", "Caramel", "Nutella"]
DEFAULT_FROSTINGS = ["Buttercream", "Fondant", "Chocolate Ganache", "Cream Cheese",
                     "Whipped Cream", "Royal Icing"]
OFFICIAL_TAGLINE = "Taste Royalty"


async def seed_defaults():
    admin_email = os.environ.get("ADMIN_EMAIL", "quinpastry@gmail.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "PastryQuin@2026")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "id": uid(), "email": admin_email, "name": "Quin", "role": "owner",
            "password_hash": hash_password(admin_password), "token_version": 0,
            "created_at": now_iso()})
        logger.info("Seeded owner account")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email},
                                  {"$set": {"password_hash": hash_password(admin_password)}})

    business = await db.settings.find_one({"id": "business"})
    if not business:
        await db.settings.insert_one({
            "id": "business", "business_name": "PASTRY QUIN",
            "tagline": OFFICIAL_TAGLINE,
            "phone": "", "whatsapp": "", "email": "", "address": "",
            "currency": "UGX", "logo_path": None, "created_at": now_iso()})
    elif business.get("tagline") != OFFICIAL_TAGLINE:
        # Rebrand: the official tagline is now "Taste Royalty" everywhere.
        await db.settings.update_one({"id": "business"}, {"$set": {"tagline": OFFICIAL_TAGLINE}})

    if await db.flavors.count_documents({}) == 0:
        await db.flavors.insert_many([{"id": uid(), "name": n, "description": "", "notes": "",
                                       "servings": "", "active": True, "created_at": now_iso()}
                                      for n in DEFAULT_FLAVORS])
    if await db.cake_types.count_documents({}) == 0:
        await db.cake_types.insert_many([{"id": uid(), "name": n, "description": "", "notes": "",
                                          "servings": "", "active": True, "created_at": now_iso()}
                                         for n in DEFAULT_TYPES])
    if await db.cake_sizes.count_documents({}) == 0:
        await db.cake_sizes.insert_many([{"id": uid(), "name": n, "description": "", "notes": "",
                                          "servings": s, "active": True, "created_at": now_iso()}
                                         for n, s in DEFAULT_SIZES])
    if await db.design_categories.count_documents({}) == 0:
        await db.design_categories.insert_many([{"id": uid(), "name": n, "description": "", "notes": "",
                                                 "servings": "", "active": True, "created_at": now_iso()}
                                                for n in DEFAULT_DESIGN_CATEGORIES])
    if await db.fillings.count_documents({}) == 0:
        await db.fillings.insert_many([{"id": uid(), "name": n, "description": "", "notes": "",
                                        "servings": "", "active": True, "created_at": now_iso()}
                                       for n in DEFAULT_FILLINGS])
    if await db.frostings.count_documents({}) == 0:
        await db.frostings.insert_many([{"id": uid(), "name": n, "description": "", "notes": "",
                                         "servings": "", "active": True, "created_at": now_iso()}
                                        for n in DEFAULT_FROSTINGS])


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.password_reset_tokens.create_index("token_hash", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.login_attempts.create_index("email")
    await db.password_reset_requests.create_index("email")
    await db.orders.create_index("order_number", unique=True)
    await db.orders.create_index("client_id")
    await db.orders.create_index("date_needed")
    await db.orders.create_index("status")
    await db.payments.create_index("order_id")
    await db.email_reminders.create_index([("status", 1), ("scheduled_date", 1)])
    await db.notifications.create_index("read")
    await seed_defaults()
    try:
        await asyncio.to_thread(init_storage)
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    await db.close()


# --- Serve the built React frontend (monolith deploy: one container, one process) ---
FRONTEND_BUILD_DIR = os.environ.get("FRONTEND_BUILD_DIR", str(Path(__file__).parent / "static"))
_frontend_dir = Path(FRONTEND_BUILD_DIR)
if _frontend_dir.is_dir():
    app.mount("/static", StaticFiles(directory=str(_frontend_dir / "static")), name="static")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        candidate = _frontend_dir / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_frontend_dir / "index.html")
