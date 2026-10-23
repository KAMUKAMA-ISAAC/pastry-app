"""Central role-based access control for PASTRY QUIN.

Two access roles exist:
  * administrator - every permission (stored roles "owner" and "admin")
  * manager       - every non-financial permission (stored roles "manager" and legacy "staff")

A stored role that maps to neither gets no permissions at all (deny by default).
Everything here is derived from the user record in the database, never from the
client. Routes enforce it with `auth.require_permission(...)`.
"""

ADMINISTRATOR = "administrator"
MANAGER = "manager"

# Stored `users.role` values -> access role.
ROLE_ALIASES = {"owner": ADMINISTRATOR, "admin": ADMINISTRATOR, "manager": MANAGER, "staff": MANAGER}

# Roles an administrator may assign through the API (stored values).
ASSIGNABLE_ROLES = {"admin": "Administrator", "manager": "Manager"}

OPERATIONAL_PERMISSIONS = frozenset({
    "manageClients",
    "manageOrders",
    "deleteOrders",          # managers may delete unpaid orders; paid orders require administrator permissions
    "manageDesigns",
    "manageCatalog",       # flavors, cake types, sizes, fillings, frostings, design categories
    "manageFeedback",
    "manageSettings",
    "viewNotifications",
    "viewOperationalReports",
    "viewTeam",
    "createManagerAccounts",   # managers may add Manager accounts, never Administrators
})

FINANCIAL_PERMISSIONS = frozenset({
    "viewFinancials",          # prices, totals, balances and payment status on orders/clients/dashboard
    "managePrices",
    "viewPayments",
    "managePayments",
    "viewReceipts",
    "manageReceipts",
    "viewFinancialReports",
    "exportFinancialData",
})

ADMIN_ONLY_PERMISSIONS = frozenset({"manageTeam", "assignRoles", "manageExpenses", "manageBankTransfers"})

ALL_PERMISSIONS = OPERATIONAL_PERMISSIONS | FINANCIAL_PERMISSIONS | ADMIN_ONLY_PERMISSIONS

ROLE_PERMISSIONS = {
    ADMINISTRATOR: ALL_PERMISSIONS,
    MANAGER: OPERATIONAL_PERMISSIONS,
}


def access_role(user: dict) -> str | None:
    return ROLE_ALIASES.get((user or {}).get("role"))


def permissions_for(user: dict) -> frozenset:
    return ROLE_PERMISSIONS.get(access_role(user), frozenset())


def can(user: dict, permission: str) -> bool:
    return permission in permissions_for(user)


# ---- Financial redaction (applied server-side before data leaves the API) ----

ORDER_FINANCIAL_FIELDS = ("total_price", "total_paid", "payment_status", "balance")
# Audit log entries / notifications / reminders whose text or existence is financial.
FINANCIAL_AUDIT_ACTIONS = (
    "Payment recorded", "Payment deleted", "Order price changed", "Receipt emailed",
    "Expense recorded", "Expense corrected", "Expense reversed",
    "Bank deposit recorded", "Bank deposit corrected", "Bank deposit reversed",
    "Other fund use recorded", "Customer payment reconciled",
)
FINANCIAL_NOTIFICATION_TYPES = ("payment", "deposit", "finance", "receipt")
FINANCIAL_REMINDER_TYPES = ("deposit_due",)


def redact_order(user: dict, order: dict) -> dict:
    """Remove money fields from an order unless the user may view financials."""
    if not can(user, "viewFinancials"):
        for f in ORDER_FINANCIAL_FIELDS:
            order.pop(f, None)
    return order


def redact_orders(user: dict, orders: list) -> list:
    for o in orders:
        redact_order(user, o)
    return orders
