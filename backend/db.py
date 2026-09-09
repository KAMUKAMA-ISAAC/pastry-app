import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]


def uid() -> str:
    return str(uuid.uuid4())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def next_seq(kind: str, year: int) -> int:
    doc = await db.counters.find_one_and_update(
        {"_id": f"{kind}:{year}"}, {"$inc": {"seq": 1}}, upsert=True, return_document=True
    )
    return doc["seq"]


async def audit(action: str, detail: str, actor: str = "system", order_id: str = None):
    await db.audit_logs.insert_one({
        "id": uid(), "action": action, "detail": detail, "actor": actor,
        "order_id": order_id, "created_at": now_iso(),
    })


async def notify(title: str, message: str, ntype: str = "info", order_id: str = None):
    await db.notifications.insert_one({
        "id": uid(), "title": title, "message": message, "type": ntype,
        "order_id": order_id, "read": False, "created_at": now_iso(),
    })


def compute_payment_status(total: float, paid: float) -> str:
    if paid <= 0:
        return "Unpaid"
    if paid < total:
        return "Partially Paid"
    if paid == total:
        return "Fully Paid"
    return "Overpaid"
