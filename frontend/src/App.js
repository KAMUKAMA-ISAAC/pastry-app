import "@/App.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AppLayout from "./components/layout/AppLayout";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import OrderForm from "./pages/OrderForm";
import OrderDetail from "./pages/OrderDetail";
import CalendarPage from "./pages/CalendarPage";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import Designs from "./pages/Designs";
import Catalog from "./pages/Catalog";
import Payments from "./pages/Payments";
import FinanceDashboard from "./pages/FinanceDashboard";
import Receipts from "./pages/Receipts";
import ReceiptView from "./pages/ReceiptView";
import FeedbackPage from "./pages/Feedback";
import Reports from "./pages/Reports";
import Notifications from "./pages/Notifications";
import SettingsPage from "./pages/Settings";
import SearchResults from "./pages/SearchResults";

function RequireAuth({ children }) {
  const { user } = useAuth();
  if (user === null)
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center" data-testid="auth-loading">
        <p className="font-serif text-2xl tracking-[0.18em] text-[#2B1B17] animate-pulse">PASTRY QUIN</p>
      </div>
    );
  if (user === false) return <Navigate to="/login" replace />;
  return children;
}

// Route guard for UI only; the matching API endpoints reject unauthorised requests with 403.
function RequirePermission({ perm, children }) {
  const { can } = useAuth();
  return can(perm) ? children : <Navigate to="/" replace />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ style: { background: "#2B1B17", color: "#FAF8F5", border: "none" } }} />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/orders" element={<Orders />} />
            {/* Dedicated category URLs reuse the existing, tested order ledger and its category filter. */}
            <Route path="/wedding-introduction-cakes" element={<Navigate to="/orders?category=wedding_intro" replace />} />
            <Route path="/wedding-cakes" element={<Navigate to="/orders?category=wedding_intro" replace />} />
            <Route path="/wedding-intro" element={<Navigate to="/orders?category=wedding_intro" replace />} />
            <Route path="/small-cakes" element={<Navigate to="/orders?category=normal" replace />} />
            <Route path="/small-cake-orders" element={<Navigate to="/orders?category=normal" replace />} />
            <Route path="/orders/new" element={<OrderForm />} />
            <Route path="/orders/:id" element={<OrderDetail />} />
            <Route path="/orders/:id/edit" element={<OrderForm />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/clients/:id" element={<ClientDetail />} />
            <Route path="/designs" element={<Designs />} />
            <Route path="/flavors" element={<Catalog tab="flavors" />} />
            <Route path="/cake-types" element={<Catalog tab="cake-types" />} />
            <Route path="/payments" element={<RequirePermission perm="viewPayments"><Payments /></RequirePermission>} />
            <Route path="/expenses" element={<RequirePermission perm="manageExpenses"><FinanceDashboard mode="expenses" /></RequirePermission>} />
            <Route path="/bank-transfer" element={<RequirePermission perm="manageBankTransfers"><FinanceDashboard mode="bank" /></RequirePermission>} />
            <Route path="/receipts" element={<RequirePermission perm="viewReceipts"><Receipts /></RequirePermission>} />
            <Route path="/receipts/:id" element={<RequirePermission perm="viewReceipts"><ReceiptView /></RequirePermission>} />
            <Route path="/feedback" element={<FeedbackPage />} />
            <Route path="/reports" element={<RequirePermission perm="viewOperationalReports"><Reports /></RequirePermission>} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/search" element={<SearchResults />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
