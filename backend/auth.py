import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from html import escape
from urllib.parse import urlparse

import bcrypt
import httpx
import jwt
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr

from db import db, now_iso, uid

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])
JWT_ALGORITHM = "HS256"


def jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str, ver: int = 0) -> str:
    payload = {"sub": user_id, "email": email, "ver": ver, "type": "access",
               "exp": datetime.now(timezone.utc) + timedelta(minutes=15)}
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str, ver: int = 0) -> str:
    payload = {"sub": user_id, "ver": ver, "type": "refresh",
               "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, user: dict):
    ver = user.get("token_version", 0)
    response.set_cookie("access_token", create_access_token(user["id"], user["email"], ver),
                        httponly=True, secure=True, samesite="none", max_age=900, path="/")
    response.set_cookie("refresh_token", create_refresh_token(user["id"], ver),
                        httponly=True, secure=True, samesite="none", max_age=604800, path="/")


def public_user(user: dict) -> dict:
    return {k: v for k, v in user.items() if k not in ("_id", "password_hash")}


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        h = request.headers.get("Authorization", "")
        if h.startswith("Bearer "):
            token = h[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if payload.get("ver", 0) != user.get("token_version", 0):
        raise HTTPException(status_code=401, detail="Session expired")
    return user


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class StaffIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "staff"


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    password: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


@router.post("/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.lower().strip()
    identifier = f"{request.client.host}:{email}"
    window = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    attempts = await db.login_attempts.count_documents({"identifier": identifier, "created_at": {"$gt": window}})
    if attempts >= 5:
        raise HTTPException(status_code=429, detail="Too many failed attempts. Please try again in 15 minutes.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        await db.login_attempts.insert_one({"identifier": identifier, "email": email, "created_at": now_iso()})
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await db.login_attempts.delete_many({"identifier": identifier})
    set_auth_cookies(response, user)
    return public_user(user)


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return user


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user or payload.get("ver", 0) != user.get("token_version", 0):
        raise HTTPException(status_code=401, detail="Session expired")
    response.set_cookie("access_token", create_access_token(user["id"], user["email"], user.get("token_version", 0)),
                        httponly=True, secure=True, samesite="none", max_age=900, path="/")
    return {"ok": True}


@router.post("/staff")
async def create_staff(body: StaffIn, response: Response, user=Depends(get_current_user)):
    if user.get("role") not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only owners and admins can add staff")
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="A user with this email already exists")
    if body.role not in ("owner", "admin", "staff"):
        raise HTTPException(status_code=400, detail="Invalid role")
    doc = {"id": uid(), "email": email, "name": body.name, "role": body.role,
           "password_hash": hash_password(body.password), "token_version": 0, "created_at": now_iso()}
    await db.users.insert_one(doc)
    return public_user(doc)


@router.get("/staff")
async def list_staff(user=Depends(get_current_user)):
    return await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(100)


@router.post("/change-password")
async def change_password(body: ChangePasswordIn, request: Request, response: Response, user=Depends(get_current_user)):
    full = await db.users.find_one({"id": user["id"]})
    if not verify_password(body.current_password, full["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    await db.users.update_one({"id": user["id"]},
                              {"$set": {"password_hash": hash_password(body.new_password)}, "$inc": {"token_version": 1}})
    fresh = await db.users.find_one({"id": user["id"]})
    set_auth_cookies(response, fresh)
    return {"ok": True}


EMAIL_BASE_URL = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip().rstrip("/") or "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME") or "PASTRY QUIN"


async def send_password_reset_email(to_email: str, token: str) -> bool:
    base = os.environ.get("FRONTEND_URL", "").rstrip("/")
    link = f"{base}/reset-password?token={token}"
    if not EMAIL_KEY or not base.startswith("https://"):
        if urlparse(base).hostname in ("localhost", "127.0.0.1", "::1"):
            logger.warning("Email not configured; password reset link: %s", link)
        else:
            logger.error("Password reset email not configured (EMERGENT_EMAIL_KEY / FRONTEND_URL)")
        return False
    brand = escape(EMAIL_FROM_NAME)
    html = (
        f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif">'
        f'<p>We received a request to reset your {brand} password.</p>'
        f'<p><a href="{escape(link)}">Reset your password</a></p>'
        f'<p>This link expires in 1 hour and can be used once. If you did not request it, '
        f'ignore this email — your password is unchanged.</p>'
        f'<p style="font-size:12px;color:#888">Sent by {brand}. We never ask for your password by email.</p>'
        f'</td></tr></table>'
    )
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json={"to": [to_email], "subject": f"Reset your {EMAIL_FROM_NAME} password",
                      "html": html, "from_name": EMAIL_FROM_NAME},
            )
        resp.raise_for_status()
        return True
    except Exception as e:
        logger.error(f"Password reset email failed: {e}")
        return False


GENERIC_RESET_RESPONSE = {"message": "If that email is registered, a reset link has been sent."}


@router.post("/forgot-password")
async def forgot_password(body: ForgotIn, background_tasks: BackgroundTasks):
    email = body.email.lower().strip()
    window = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    recent = await db.password_reset_requests.count_documents({"email": email, "created_at": {"$gt": window}})
    await db.password_reset_requests.insert_one({"email": email, "created_at": now_iso()})
    if recent >= 5:
        return GENERIC_RESET_RESPONSE
    user = await db.users.find_one({"email": email})
    if not user:
        return GENERIC_RESET_RESPONSE
    token = secrets.token_urlsafe(32)
    await db.password_reset_tokens.insert_one({
        "token_hash": hashlib.sha256(token.encode()).hexdigest(),
        "user_id": user["id"], "email": email,
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        "used": False,
    })
    background_tasks.add_task(send_password_reset_email, user["email"], token)
    return GENERIC_RESET_RESPONSE


@router.post("/reset-password")
async def reset_password(body: ResetIn):
    h = hashlib.sha256(body.token.encode()).hexdigest()
    now = now_iso()
    doc = await db.password_reset_tokens.find_one_and_update(
        {"token_hash": h, "used": False, "expires_at": {"$gt": now}}, {"$set": {"used": True}})
    if not doc:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired.")
    await db.users.update_one({"id": doc["user_id"]},
                              {"$set": {"password_hash": hash_password(body.password)}, "$inc": {"token_version": 1}})
    await db.password_reset_tokens.delete_many({"user_id": doc["user_id"], "used": False})
    await db.login_attempts.delete_many({"email": doc["email"]})
    return {"ok": True}
