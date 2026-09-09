"""PASTRY QUIN backend integration tests - covers auth, clients, orders, payments,
receipts, images, catalog, feedback, notifications, settings, staff, search, dashboard."""
import io
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://quin-orders.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "quinpastry@gmail.com"
ADMIN_PASSWORD = "PastryQuin@2026"


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def sess():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("email") == ADMIN_EMAIL
    return s


@pytest.fixture(scope="session")
def created(sess):
    return {}


# ---------- auth ----------
class TestAuth:
    def test_login_bad_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_me(self, sess):
        r = sess.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_forgot_password_generic(self):
        r = requests.post(f"{API}/auth/forgot-password", json={"email": "nonexistent-xyz@example.com"}, timeout=15)
        assert r.status_code == 200
        assert "registered" in r.json().get("message", "").lower()

    def test_unauth_me(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401


# ---------- catalog ----------
class TestCatalog:
    def test_meta_orders(self, sess):
        r = sess.get(f"{API}/orders/meta", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "Cash" in data["payment_methods"]
        cat_ids = [c["id"] for c in data["categories"]]
        assert "wedding_intro" in cat_ids and "normal" in cat_ids

    def test_flavors_seeded(self, sess):
        r = sess.get(f"{API}/flavors", timeout=15)
        assert r.status_code == 200
        assert len(r.json()) >= 5

    def test_add_flavor(self, sess, created):
        name = f"TEST_Flavor_{int(time.time())}"
        r = sess.post(f"{API}/flavors", json={"name": name, "description": "test"}, timeout=15)
        assert r.status_code == 200, r.text
        flavor = r.json()
        assert flavor["name"] == name
        created["flavor_id"] = flavor["id"]

    def test_update_flavor(self, sess, created):
        fid = created["flavor_id"]
        r = sess.put(f"{API}/flavors/{fid}", json={"name": "TEST_Flavor_Updated", "description": "x", "active": False}, timeout=15)
        assert r.status_code == 200, r.text


# ---------- clients ----------
class TestClients:
    def test_create_client(self, sess, created):
        payload = {"full_name": "TEST_Jane_Doe", "phone": "0700000000", "email": "test_jane@example.com"}
        r = sess.post(f"{API}/clients", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["full_name"] == payload["full_name"]
        assert "id" in c
        created["client_id"] = c["id"]

    def test_get_client(self, sess, created):
        r = sess.get(f"{API}/clients/{created['client_id']}", timeout=15)
        assert r.status_code == 200
        # profile route
        assert r.json().get("client", {}).get("id") == created["client_id"] or r.json().get("id") == created["client_id"]

    def test_list_clients(self, sess, created):
        r = sess.get(f"{API}/clients", timeout=15)
        assert r.status_code == 200
        items = r.json().get("items", r.json())
        ids = [c.get("id") for c in items]
        assert created["client_id"] in ids


# ---------- orders + payments ----------
class TestOrdersPayments:
    def test_create_order_with_initial_payment(self, sess, created):
        from datetime import date, timedelta
        date_needed = (date.today() + timedelta(days=10)).isoformat()
        payload = {
            "client_id": created["client_id"],
            "category": "wedding_intro",
            "cake_type": "Wedding",
            "flavor": "Vanilla",
            "size": "10 inch",
            "date_needed": date_needed,
            "total_price": 350000,
            "status": "Confirmed",
            "initial_payment": {"amount": 100000, "method": "Mobile Money", "notes": "Deposit"},
        }
        r = sess.post(f"{API}/orders", json=payload, timeout=25)
        assert r.status_code == 200, r.text
        order = r.json()
        assert order["order_number"].startswith("PQ-")
        assert order["total_paid"] == 100000
        assert order["payment_status"] == "Partially Paid"
        created["order_id"] = order["id"]
        created["order_number"] = order["order_number"]

    def test_get_order_detail(self, sess, created):
        r = sess.get(f"{API}/orders/{created['order_id']}", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["order"]["balance"] == 250000
        assert len(data["payments"]) == 1
        assert len(data["reminders"]) >= 1

    def test_record_second_payment(self, sess, created):
        r = sess.post(f"{API}/orders/{created['order_id']}/payments",
                      json={"amount": 100000, "method": "Cash"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["receipt"]["receipt_number"].startswith("PQ-R-")
        created["receipt_id"] = data["receipt"]["id"]
        # verify balance
        r2 = sess.get(f"{API}/orders/{created['order_id']}", timeout=15)
        o = r2.json()["order"]
        assert o["total_paid"] == 200000
        assert o["balance"] == 150000
        assert o["payment_status"] == "Partially Paid"

    def test_list_orders_category_filter(self, sess, created):
        r = sess.get(f"{API}/orders", params={"category": "wedding_intro"}, timeout=15)
        assert r.status_code == 200
        ids = [o["id"] for o in r.json()["items"]]
        assert created["order_id"] in ids

        r2 = sess.get(f"{API}/orders", params={"category": "normal"}, timeout=15)
        assert r2.status_code == 200
        ids2 = [o["id"] for o in r2.json()["items"]]
        assert created["order_id"] not in ids2

    def test_update_status_audit(self, sess, created):
        r = sess.post(f"{API}/orders/{created['order_id']}/status", json={"status": "In Preparation"}, timeout=15)
        assert r.status_code == 200
        r2 = sess.get(f"{API}/orders/{created['order_id']}", timeout=15)
        audits = r2.json()["audits"]
        assert any("Status" in a.get("title", "") for a in audits)


# ---------- images ----------
class TestImages:
    def _tiny_png(self):
        # 1x1 transparent PNG
        import base64
        return base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        )

    def test_upload_final_design(self, sess, created):
        files = {"file": ("cake.png", self._tiny_png(), "image/png")}
        r = sess.post(f"{API}/orders/{created['order_id']}/images",
                      params={"kind": "final"}, files=files, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["kind"] == "final"

    def test_upload_reference(self, sess, created):
        files = {"file": ("ref.png", self._tiny_png(), "image/png")}
        r = sess.post(f"{API}/orders/{created['order_id']}/images",
                      params={"kind": "reference"}, files=files, timeout=30)
        assert r.status_code == 200, r.text


# ---------- receipts ----------
class TestReceipts:
    def test_get_receipt(self, sess, created):
        r = sess.get(f"{API}/receipts/{created['receipt_id']}", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["receipt"]["id"] == created["receipt_id"]
        assert data["settings"]["business_name"] == "PASTRY QUIN"

    def test_receipt_pdf(self, sess, created):
        r = sess.get(f"{API}/receipts/{created['receipt_id']}/pdf", timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 500

    def test_email_no_email(self, sess, created):
        # our test client has email, so add a client with no email and test that path
        r = sess.post(f"{API}/clients", json={"full_name": "TEST_NoEmail"}, timeout=15)
        cid = r.json()["id"]
        from datetime import date, timedelta
        r2 = sess.post(f"{API}/orders", json={
            "client_id": cid, "category": "normal", "cake_type": "Birthday",
            "date_needed": (date.today() + timedelta(days=5)).isoformat(),
            "total_price": 50000, "initial_payment": {"amount": 20000, "method": "Cash"},
        }, timeout=20)
        assert r2.status_code == 200
        oid = r2.json()["id"]
        detail = sess.get(f"{API}/orders/{oid}", timeout=15).json()
        rid = detail["payments"][0]["receipt_id"]
        rem = sess.post(f"{API}/receipts/{rid}/email", timeout=15)
        assert rem.status_code == 400
        assert "email" in rem.json().get("detail", "").lower()


# ---------- dashboard + search ----------
class TestDashSearch:
    def test_dashboard(self, sess):
        r = sess.get(f"{API}/dashboard", timeout=15)
        assert r.status_code == 200
        s = r.json()["stats"]
        for k in ("total_clients", "total_orders", "upcoming_cakes", "pending_payments",
                  "total_revenue", "outstanding_balance", "orders_this_month", "completed_orders"):
            assert k in s
        assert s["total_orders"] >= 1

    def test_search(self, sess, created):
        r = sess.get(f"{API}/search", params={"q": "TEST_Jane"}, timeout=15)
        assert r.status_code == 200
        assert any(c["id"] == created["client_id"] for c in r.json()["clients"])
        r2 = sess.get(f"{API}/search", params={"q": created["order_number"]}, timeout=15)
        assert any(o["id"] == created["order_id"] for o in r2.json()["orders"])


# ---------- feedback ----------
class TestFeedback:
    def test_add_feedback(self, sess, created):
        r = sess.post(f"{API}/feedback", json={
            "client_id": created["client_id"], "order_id": created["order_id"],
            "rating": 5, "comment": "TEST feedback"}, timeout=15)
        assert r.status_code == 200, r.text
        r2 = sess.get(f"{API}/feedback", timeout=15)
        assert r2.status_code == 200


# ---------- notifications ----------
class TestNotifications:
    def test_notifications_and_mark_read(self, sess):
        r = sess.get(f"{API}/notifications", timeout=15)
        assert r.status_code == 200
        items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        assert isinstance(items, list)
        r2 = sess.post(f"{API}/notifications/read-all", timeout=15)
        assert r2.status_code == 200


# ---------- settings + staff ----------
class TestSettingsStaff:
    def test_settings_get(self, sess):
        r = sess.get(f"{API}/settings", timeout=15)
        assert r.status_code == 200
        assert r.json().get("business_name") == "PASTRY QUIN"

    def test_settings_update(self, sess):
        r = sess.put(f"{API}/settings", json={"business_name": "PASTRY QUIN", "phone": "0777123456", "email": "info@pastryquin.test"}, timeout=15)
        assert r.status_code == 200
        r2 = sess.get(f"{API}/settings", timeout=15)
        assert r2.json()["phone"] == "0777123456"

    def test_staff_create_and_login(self, sess, created):
        email = f"test_staff_{int(time.time())}@example.com"
        r = sess.post(f"{API}/auth/staff", json={"name": "TEST Staff", "email": email, "password": "StaffPass@2026", "role": "staff"}, timeout=15)
        assert r.status_code == 200, r.text
        # login with new staff
        s2 = requests.Session()
        r2 = s2.post(f"{API}/auth/login", json={"email": email, "password": "StaffPass@2026"}, timeout=15)
        assert r2.status_code == 200


# ---------- reports ----------
class TestReports:
    def test_reports(self, sess):
        r = sess.get(f"{API}/reports", timeout=20)
        assert r.status_code == 200

    def test_export_orders_csv(self, sess):
        r = sess.get(f"{API}/export/orders", timeout=20)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")


# ---------- archive/restore ----------
class TestArchive:
    def test_client_archive_restore(self, sess, created):
        cid = created["client_id"]
        r = sess.post(f"{API}/clients/{cid}/archive", timeout=15)
        assert r.status_code == 200
        r2 = sess.post(f"{API}/clients/{cid}/restore", timeout=15)
        assert r2.status_code == 200

    def test_order_archive(self, sess, created):
        r = sess.post(f"{API}/orders/{created['order_id']}/archive", timeout=15)
        assert r.status_code == 200
        r2 = sess.post(f"{API}/orders/{created['order_id']}/restore", timeout=15)
        assert r2.status_code == 200



# ---------- delete order + client ----------
class TestDeleteOrderClient:
    def test_delete_client_with_orders_blocked(self, sess):
        # create client + order
        r = sess.post(f"{API}/clients", json={"full_name": "TEST_DelBlocked"}, timeout=15)
        assert r.status_code == 200
        cid = r.json()["id"]
        from datetime import date, timedelta
        r2 = sess.post(f"{API}/orders", json={
            "client_id": cid, "category": "normal", "cake_type": "Birthday",
            "date_needed": (date.today() + timedelta(days=7)).isoformat(),
            "total_price": 100000,
        }, timeout=20)
        assert r2.status_code == 200
        oid = r2.json()["id"]
        # try delete client -> should fail
        rd = sess.delete(f"{API}/clients/{cid}", timeout=15)
        assert rd.status_code == 400
        assert "order" in rd.json().get("detail", "").lower()
        # cleanup: delete order then client
        rdo = sess.delete(f"{API}/orders/{oid}", timeout=15)
        assert rdo.status_code == 200
        # verify order gone
        rg = sess.get(f"{API}/orders/{oid}", timeout=15)
        assert rg.status_code == 404
        rdc = sess.delete(f"{API}/clients/{cid}", timeout=15)
        assert rdc.status_code == 200

    def test_delete_order_cascades(self, sess, created):
        oid = created["order_id"]
        cid = created["client_id"]
        rd = sess.delete(f"{API}/orders/{oid}", timeout=15)
        assert rd.status_code == 200
        # verify gone
        rg = sess.get(f"{API}/orders/{oid}", timeout=15)
        assert rg.status_code == 404
        # now client should be deletable
        rdc = sess.delete(f"{API}/clients/{cid}", timeout=15)
        assert rdc.status_code == 200
        rgc = sess.get(f"{API}/clients/{cid}", timeout=15)
        assert rgc.status_code == 404

    def test_delete_nonexistent_order(self, sess):
        r = sess.delete(f"{API}/orders/nonexistent-id-xyz", timeout=15)
        assert r.status_code == 404

    def test_delete_nonexistent_client(self, sess):
        r = sess.delete(f"{API}/clients/nonexistent-id-xyz", timeout=15)
        assert r.status_code == 404
