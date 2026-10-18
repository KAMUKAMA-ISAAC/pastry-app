"""Image storage on Cloudinary.

Uploads are `authenticated` (not publicly readable). Delivery URLs carry a
signature that can't be forged, and /api/files only hands them out after the
login check. Config comes from the CLOUDINARY_URL env var.
"""
import logging
import os

import cloudinary
import cloudinary.uploader
import cloudinary.utils

logger = logging.getLogger(__name__)

cloudinary.config(secure=True)


def _split(path: str) -> tuple[str, str | None]:
    base, dot, ext = path.rpartition(".")
    return (base, ext) if dot and "/" not in ext else (path, None)


def init_storage():
    if not os.environ.get("CLOUDINARY_URL"):
        raise RuntimeError("CLOUDINARY_URL is not set")
    if not cloudinary.config().cloud_name:
        raise RuntimeError("CLOUDINARY_URL is invalid")


def put_object(path: str, data: bytes, content_type: str) -> dict:
    public_id, _ = _split(path)
    cloudinary.uploader.upload(
        data, public_id=public_id, type="authenticated", resource_type="image",
        overwrite=True, invalidate=True,
    )
    return {"path": path, "size": len(data)}


def signed_url(path: str) -> str:
    public_id, ext = _split(path)
    url, _ = cloudinary.utils.cloudinary_url(
        public_id, type="authenticated", resource_type="image", sign_url=True, secure=True, format=ext,
    )
    return url
