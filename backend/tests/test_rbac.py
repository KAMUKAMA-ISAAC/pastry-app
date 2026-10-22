"""Role-based access control tests: Administrator keeps everything, Manager gets no financial data.

Runs against a live API (same convention as test_pastry_quin.py):
    REACT_APP_BACKEND_URL=http://localhost:8000 pytest tests/test_rbac.py -n 0
Auth tokens are read from the login cookies and sent as Bearer headers, because the cookies are
`Secure` and would not be sent back over plain http://localhost.
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://quin-orders.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "quinpastry@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "PastryQuin@2026")
PASSWORD = "Manager#Pass123"

FINANCIAL_ORDER_KEYS = {"total_price", "total_paid", "balance", "payment_status"}


class Client:
    def __init__(self, token=None):
        self.headers = {"Authorization": f"Bearer {token}"} if token else {}

    def request(self, method, path, **kw):
        return requests.request(method, f"{API}{path}", headers=self.headers, timeout=30, **kw)

    def get(self, path, **kw): return self.request("GET", path, **kw)
    def post(self, path, **kw): return self.request("POST", path, **kw)
    def put(self, path, **kw): return self.request("PUT", path, **kw)
    def delete(self, path, **kw): return self.request("DELETE", path, **kw)


def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return Client(r.cookies["access_token"])


@pytest.fixture(scope="module")
def admin():
    return login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def manager(admin):
    email = f"mgr-{uuid.uuid4().hex[:8]}@example.org"
    r = admin.post("/auth/staff", json={"name": "Test Manager", "email": email, "password": PASSWORD, "role": "manager"})
    assert r.status_code == 200, r.text
    return {"client": login(email, PASSWORD), "user": r.json(), "email": email}


@pytest.fixture(scope="module")
def data(admin):
    """A client plus an order priced 100,000 with a 40,000 payment, created by the administrator."""
    c = admin.post("/clients", json={"full_name": f"RBAC Client {uuid.uuid4().hex[:6]}", "phone": "0700000000"}).json()
    r = admin.post("/orders", json={"client_id": c["id"], "category": "normal", "cake_type": "Birthday",
                                    "flavors": ["Vanilla"], "date_needed": "2099-01-01", "total_price": 100000,
                                    "initial_payment": {"amount": 40000, "method": "Cash"}})
    assert r.status_code == 200, r.text
    order = r.json()
    pay = admin.get(f"/payments?order_id={order['id']}").json()["items"][0]
    return {"client": c, "order": order, "payment": pay, "receipt_id": pay["receipt_id"]}


# ---------- session / permissions ----------
def test_unauthenticated_requests_rejected():
    anon = Client()
    for path in ("/payments", "/receipts", "/orders", "/dashboard", "/reports/summary", "/export/payments"):
        assert anon.get(path).status_code == 401, path


def test_permissions_reported_by_server(admin, manager):
    a = admin.get("/auth/me").json()
    m = manager["client"].get("/auth/me").json()
    assert a["access_role"] == "administrator" and "managePayments" in a["permissions"] and "assignRoles" in a["permissions"]
    assert m["access_role"] == "manager" and m["role"] == "manager"
    assert not {"managePayments", "viewPayments", "viewReceipts", "managePrices", "viewFinancials",
                "viewFinancialReports", "exportFinancialData", "assignRoles"} & set(m["permissions"])
    assert "token_version" not in m and "password_hash" not in m


# ---------- administrator keeps full access ----------
def test_admin_financial_access(admin, data):
    assert admin.get("/payments").status_code == 200
    assert admin.get("/receipts").status_code == 200
    assert admin.get(f"/receipts/{data['receipt_id']}").status_code == 200
    assert admin.get(f"/receipts/{data['receipt_id']}/pdf").status_code == 200
    assert admin.get("/export/payments").status_code == 200
    o = admin.get(f"/orders/{data['order']['id']}").json()
    assert o["order"]["total_price"] == 100000 and o["order"]["total_paid"] == 40000
    assert o["order"]["balance"] == 60000 and len(o["payments"]) == 1
    rep = admin.get("/reports/summary").json()
    assert {"total_sales", "payments_received", "outstanding", "monthly_revenue", "revenue_by_type"} <= set(rep)
    stats = admin.get("/dashboard").json()["stats"]
    assert {"total_revenue", "outstanding_balance", "pending_payments"} <= set(stats)
    assert admin.get("/orders?payment_status=Partially Paid").status_code == 200


def test_admin_can_record_and_delete_payment(admin, data):
    r = admin.post(f"/orders/{data['order']['id']}/payments", json={"amount": 1000, "method": "Cash"})
    assert r.status_code == 200
    assert admin.delete(f"/payments/{r.json()['payment']['id']}").status_code == 200


# ---------- manager: every financial endpoint is rejected with 403 ----------
@pytest.mark.parametrize("method,path,body", [
    ("GET", "/payments", None),
    ("GET", "/payments?order_id=x", None),
    ("POST", "/orders/{oid}/payments", {"amount": 5000, "method": "Cash"}),
    ("DELETE", "/payments/{pid}", None),
    ("GET", "/receipts", None),
    ("GET", "/receipts/{rid}", None),
    ("GET", "/receipts/{rid}/pdf", None),
    ("POST", "/receipts/{rid}/email", None),
    ("GET", "/export/payments", None),
])
def test_manager_blocked_from_financial_endpoints(manager, data, method, path, body):
    path = path.format(oid=data["order"]["id"], pid=data["payment"]["id"], rid=data["receipt_id"])
    r = manager["client"].request(method, path, json=body) if body else manager["client"].request(method, path)
    assert r.status_code == 403, f"{method} {path} -> {r.status_code} {r.text[:120]}"


def test_blocked_payment_attempts_changed_nothing(admin, data):
    pays = admin.get(f"/payments?order_id={data['order']['id']}").json()["items"]
    assert [p["amount"] for p in pays] == [40000]


def test_manager_cannot_set_or_change_prices(manager, admin, data):
    m = manager["client"]
    oid = data["order"]["id"]
    assert m.put(f"/orders/{oid}", json={"client_id": data["client"]["id"], "date_needed": "2099-01-01",
                                         "total_price": 1}).status_code == 403
    assert m.post("/orders", json={"client_id": data["client"]["id"], "date_needed": "2099-01-01",
                                   "total_price": 5000}).status_code == 403
    assert m.post("/orders", json={"client_id": data["client"]["id"], "date_needed": "2099-01-01",
                                   "initial_payment": {"amount": 100, "method": "Cash"}}).status_code == 403
    assert admin.get(f"/orders/{oid}").json()["order"]["total_price"] == 100000


# ---------- manager: financial data is absent from responses ----------
def test_manager_order_responses_have_no_money(manager, data):
    m = manager["client"]
    oid = data["order"]["id"]
    listing = m.get("/orders").json()["items"]
    assert listing and not any(FINANCIAL_ORDER_KEYS & set(o) for o in listing)
    detail = m.get(f"/orders/{oid}").json()
    assert not FINANCIAL_ORDER_KEYS & set(detail["order"])
    assert detail["payments"] == []
    assert not any(a["action"] in ("Payment recorded", "Payment deleted", "Order price changed") for a in detail["audits"])
    assert not any(r["type"] == "deposit_due" for r in detail["reminders"])
    assert not any(FINANCIAL_ORDER_KEYS & set(o) for o in m.get("/orders/upcoming").json())
    assert m.get("/orders?payment_status=Unpaid").status_code == 403


def test_manager_client_search_dashboard_reports_have_no_money(manager, data):
    m = manager["client"]
    cl = m.get(f"/clients/{data['client']['id']}").json()
    assert cl["orders"] and not any(FINANCIAL_ORDER_KEYS & set(o) for o in cl["orders"])
    found = m.get(f"/search?q={data['order']['order_number']}").json()["orders"]
    assert found and not any(FINANCIAL_ORDER_KEYS & set(o) for o in found)
    dash = m.get("/dashboard").json()
    assert not {"total_revenue", "outstanding_balance", "pending_payments"} & set(dash["stats"])
    assert {"total_orders", "pending_orders", "in_progress_orders", "completed_orders", "upcoming_cakes"} <= set(dash["stats"])
    assert not any(FINANCIAL_ORDER_KEYS & set(o) for o in dash["upcoming"])
    rep = m.get("/reports/summary")
    assert rep.status_code == 200
    assert not {"total_sales", "payments_received", "outstanding", "monthly_revenue", "daily_revenue",
                "revenue_by_type"} & set(rep.json())
    assert "status_counts" in rep.json() and "total_orders" in rep.json()


def test_manager_exports_and_notifications_and_audit(manager, admin, data):
    m = manager["client"]
    csv_header = m.get("/export/orders").text.splitlines()[0]
    assert "Total" not in csv_header and "Paid" not in csv_header and "Balance" not in csv_header
    assert "Total" in admin.get("/export/orders").text.splitlines()[0]
    assert m.get("/export/clients").status_code == 200
    notes = m.get("/notifications").json()["items"]
    assert not any(n["type"] in ("payment", "deposit") for n in notes)
    assert any(n["type"] == "payment" for n in admin.get("/notifications").json()["items"])
    assert not any(a["action"] in ("Payment recorded", "Payment deleted", "Order price changed")
                   for a in m.get("/audit").json())
    assert "payment_methods" in m.get("/orders/meta").json() and m.get("/orders/meta").json()["payment_methods"] == []


# ---------- manager: operational work still functions ----------
def test_manager_operational_workflow(manager, admin, data):
    m = manager["client"]
    c = m.post("/clients", json={"full_name": "Mgr Client", "phone": "0711"})
    assert c.status_code == 200
    created = m.post("/orders", json={"client_id": c.json()["id"], "category": "normal", "cake_type": "Birthday",
                                      "flavors": ["Chocolate"], "date_needed": "2099-02-02"})
    assert created.status_code == 200, created.text
    oid = created.json()["id"]
    assert not FINANCIAL_ORDER_KEYS & set(created.json())
    assert admin.get(f"/orders/{oid}").json()["order"]["total_price"] == 0
    upd = m.put(f"/orders/{oid}", json={"client_id": c.json()["id"], "date_needed": "2099-03-03",
                                        "time_needed": "10:00", "theme": "Floral"})
    assert upd.status_code == 200 and upd.json()["theme"] == "Floral"
    assert m.post(f"/orders/{oid}/status", json={"status": "Baking"}).status_code == 200
    assert m.get("/designs").status_code == 200 and m.get("/orders/upcoming").status_code == 200
    item = m.post("/catalog/flavors", json={"name": f"Flavor {uuid.uuid4().hex[:6]}"})
    assert item.status_code == 200
    assert m.put(f"/catalog/flavors/{item.json()['id']}", json={"name": item.json()["name"], "active": False}).status_code == 200
    assert m.get("/feedback").status_code == 200 and m.get("/notifications").status_code == 200
    assert m.put("/settings", json={"phone": "0700111222"}).status_code == 200
    assert m.post(f"/orders/{oid}/archive").status_code == 200
    assert m.delete(f"/orders/{oid}").status_code == 200  # no payments -> allowed


def test_manager_cannot_delete_order_with_payments(manager, admin, data):
    assert manager["client"].delete(f"/orders/{data['order']['id']}").status_code == 403
    assert admin.get(f"/orders/{data['order']['id']}").status_code == 200
    assert len(admin.get(f"/payments?order_id={data['order']['id']}").json()["items"]) == 1


# ---------- accounts and privilege escalation ----------
def test_manager_cannot_create_accounts_or_assign_roles(manager, admin):
    m = manager["client"]
    for role in ("admin", "owner", "manager", "administrator"):
        r = m.post("/auth/staff", json={"name": "X", "email": f"x-{uuid.uuid4().hex[:6]}@example.org",
                                        "password": "Passw0rd!x", "role": role})
        assert r.status_code == 403, role
    assert m.put(f"/auth/staff/{manager['user']['id']}/role", json={"role": "admin"}).status_code == 403
    assert m.get("/auth/me").json()["access_role"] == "manager"
    team = m.get("/auth/staff")
    assert team.status_code == 200 and all("token_version" not in u and "password_hash" not in u for u in team.json())


def test_admin_role_management(admin):
    email = f"rm-{uuid.uuid4().hex[:8]}@example.org"
    created = admin.post("/auth/staff", json={"name": "Role Test", "email": email, "password": PASSWORD, "role": "staff"})
    assert created.status_code == 200 and created.json()["role"] == "manager"  # legacy "staff" is a manager
    uid_ = created.json()["id"]
    user = login(email, PASSWORD)
    assert user.get("/payments").status_code == 403

    assert admin.post("/auth/staff", json={"name": "Bad", "email": f"b-{uuid.uuid4().hex[:6]}@example.org",
                                           "password": PASSWORD, "role": "superuser"}).status_code == 400
    assert admin.put(f"/auth/staff/{uid_}/role", json={"role": "superuser"}).status_code == 400
    me = admin.get("/auth/me").json()
    assert admin.put(f"/auth/staff/{me['id']}/role", json={"role": "manager"}).status_code == 400  # not self
    assert admin.get("/auth/me").json()["access_role"] == "administrator"

    assert admin.put(f"/auth/staff/{uid_}/role", json={"role": "admin"}).status_code == 200
    assert user.get("/auth/me").status_code == 401  # old session invalidated on role change
    promoted = login(email, PASSWORD)
    assert promoted.get("/payments").status_code == 200
    assert admin.put(f"/auth/staff/{uid_}/role", json={"role": "manager"}).status_code == 200
    assert promoted.get("/payments").status_code == 401
    assert login(email, PASSWORD).get("/payments").status_code == 403
