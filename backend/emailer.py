import ipaddress
import logging
import os
import re
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME") or "PASTRY QUIN"
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str, reply_to: str | None = None) -> str | None:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if reply_to or EMAIL_REPLY_TO:
        payload["contact_email"] = reply_to or EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        logger.error(f"Email send failed: {e.response.status_code} {e.response.text}")
        raise HTTPException(status_code=502, detail="Failed to send email")
    except Exception as e:
        logger.error(f"Email send error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to send email")


def branded(title: str, inner: str, tagline: str | None = None) -> str:
    brand = escape(EMAIL_FROM_NAME)
    tag = escape(tagline or "Taste Royalty")
    return (
        '<table role="presentation" width="100%" style="background:#FAF8F5;padding:24px 0"><tr><td align="center">'
        '<table role="presentation" width="560" style="background:#FFFFFF;border:1px solid #EDE5DE;border-radius:12px;padding:32px">'
        '<tr><td>'
        f'<p style="font-family:Georgia,serif;font-size:22px;letter-spacing:4px;color:#2B1B17;margin:0 0 4px">{brand}</p>'
        f'<p style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:3px;color:#8C6D62;text-transform:uppercase;margin:0 0 24px">{tag}</p>'
        f'<h1 style="font-family:Georgia,serif;font-size:20px;color:#2B1B17;margin:0 0 16px">{escape(title)}</h1>'
        f'<div style="font-family:Arial,sans-serif;font-size:14px;color:#4A3B32;line-height:1.6">{inner}</div>'
        f'<p style="font-family:Arial,sans-serif;font-size:11px;color:#A89B93;margin:28px 0 0;border-top:1px solid #EDE5DE;padding-top:16px">Sent by {brand}. We never ask for passwords or card details by email.</p>'
        '</td></tr></table></td></tr></table>'
    )


def _money(n, currency="UGX"):
    return f"{currency} {float(n or 0):,.0f}"


REMINDER_SUBJECTS = {
    "deposit_due": "Deposit reminder for your {brand} order {num}",
    "week_before": "Your {brand} cake is one week away — {num}",
    "three_days": "Your {brand} cake is in 3 days — {num}",
    "day_of": "Your {brand} cake is ready today — {num}",
}

REMINDER_LINES = {
    "deposit_due": "This is a friendly reminder that the deposit for your cake order is still outstanding. Kindly complete the deposit so we can begin preparation.",
    "week_before": "Your cake is needed in approximately one week. We are preparing everything to make it perfect.",
    "three_days": "Your cake is needed in 3 days. Our atelier is putting the final plan in place.",
    "day_of": "Your cake day has arrived! We look forward to handing over your creation.",
}


async def send_reminder_email(client: dict, order: dict, rtype: str, settings: dict):
    brand = EMAIL_FROM_NAME
    currency = settings.get("currency", "UGX")
    balance = float(order.get("total_price", 0)) - float(order.get("total_paid", 0))
    subject = REMINDER_SUBJECTS[rtype].format(brand=brand, num=order["order_number"])
    inner = (
        f"<p>Dear {escape(client.get('full_name', 'Valued Client'))},</p>"
        f"<p>{escape(REMINDER_LINES[rtype])}</p>"
        f'<table style="font-family:Arial,sans-serif;font-size:13px;color:#4A3B32;margin:16px 0" cellpadding="4">'
        f'<tr><td style="color:#8C6D62">Order</td><td><strong>{escape(order["order_number"])}</strong></td></tr>'
        f'<tr><td style="color:#8C6D62">Cake</td><td>{escape(order.get("cake_type", ""))} · {escape(order.get("flavor", ""))} · {escape(order.get("size", ""))}</td></tr>'
        + (f'<tr><td style="color:#8C6D62">Filling</td><td>{escape(order["filling"])}</td></tr>' if order.get("filling") else "")
        + (f'<tr><td style="color:#8C6D62">Frosting</td><td>{escape(order["frosting"])}</td></tr>' if order.get("frosting") else "")
        + f'<tr><td style="color:#8C6D62">Date needed</td><td>{escape(order.get("date_needed", ""))} {escape(order.get("time_needed", ""))}</td></tr>'
        f'<tr><td style="color:#8C6D62">Total</td><td>{escape(_money(order.get("total_price"), currency))}</td></tr>'
        f'<tr><td style="color:#8C6D62">Balance</td><td><strong>{escape(_money(balance, currency))}</strong></td></tr>'
        "</table>"
        f"<p>Warm regards,<br/>{escape(brand)}</p>"
    )
    return await send_email(to=client["email"], subject=subject, html=branded(subject, inner, settings.get("tagline")))


async def send_receipt_email(client: dict, order: dict, payment: dict, receipt: dict, settings: dict):
    brand = EMAIL_FROM_NAME
    currency = settings.get("currency", "UGX")
    balance = float(order.get("total_price", 0)) - float(order.get("total_paid", 0))
    subject = f"{brand} payment receipt {receipt['receipt_number']}"
    inner = (
        f"<p>Dear {escape(client.get('full_name', 'Valued Client'))},</p>"
        f"<p>Thank you — we have received your payment for order <strong>{escape(order['order_number'])}</strong>.</p>"
        f'<table style="font-family:Arial,sans-serif;font-size:13px;color:#4A3B32;margin:16px 0" cellpadding="4">'
        f'<tr><td style="color:#8C6D62">Receipt</td><td><strong>{escape(receipt["receipt_number"])}</strong></td></tr>'
        f'<tr><td style="color:#8C6D62">Amount received</td><td><strong>{escape(_money(payment["amount"], currency))}</strong></td></tr>'
        f'<tr><td style="color:#8C6D62">Method</td><td>{escape(payment.get("method", ""))}</td></tr>'
        f'<tr><td style="color:#8C6D62">Total order price</td><td>{escape(_money(order.get("total_price"), currency))}</td></tr>'
        f'<tr><td style="color:#8C6D62">Total paid to date</td><td>{escape(_money(order.get("total_paid"), currency))}</td></tr>'
        f'<tr><td style="color:#8C6D62">Remaining balance</td><td><strong>{escape(_money(balance, currency))}</strong></td></tr>'
        "</table>"
        f"<p>Warm regards,<br/>{escape(brand)}</p>"
    )
    return await send_email(to=client["email"], subject=subject, html=branded("Payment Receipt", inner, settings.get("tagline")))


async def send_order_confirmation_email(client: dict, order: dict, settings: dict):
    brand = EMAIL_FROM_NAME
    currency = settings.get("currency", "UGX")
    subject = f"Your {brand} order {order['order_number']} is confirmed"
    inner = (
        f"<p>Dear {escape(client.get('full_name', 'Valued Client'))},</p>"
        f"<p>Thank you for choosing {escape(brand)}. Your cake order has been received and confirmed.</p>"
        f'<table style="font-family:Arial,sans-serif;font-size:13px;color:#4A3B32;margin:16px 0" cellpadding="4">'
        f'<tr><td style="color:#8C6D62">Order</td><td><strong>{escape(order["order_number"])}</strong></td></tr>'
        f'<tr><td style="color:#8C6D62">Cake</td><td>{escape(order.get("cake_type", ""))} · {escape(order.get("flavor", ""))} · {escape(order.get("size", ""))}</td></tr>'
        + (f'<tr><td style="color:#8C6D62">Filling</td><td>{escape(order["filling"])}</td></tr>' if order.get("filling") else "")
        + (f'<tr><td style="color:#8C6D62">Frosting</td><td>{escape(order["frosting"])}</td></tr>' if order.get("frosting") else "")
        + f'<tr><td style="color:#8C6D62">Date needed</td><td>{escape(order.get("date_needed", ""))} {escape(order.get("time_needed", ""))}</td></tr>'
        f'<tr><td style="color:#8C6D62">Total</td><td>{escape(_money(order.get("total_price"), currency))}</td></tr>'
        "</table>"
        f"<p>Warm regards,<br/>{escape(brand)}</p>"
    )
    return await send_email(to=client["email"], subject=subject, html=branded("Order Confirmation", inner, settings.get("tagline")))
