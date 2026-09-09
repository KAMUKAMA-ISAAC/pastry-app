import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ImagePlus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import api, { fileUrl, fmtErr } from "../lib/api";
import { PageHeader } from "../components/ui-bits";
import { useAuth } from "../context/AuthContext";

function StaffDialog({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "staff" });
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/auth/staff", form);
      toast.success("Staff account created");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(fmtErr(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="staff-dialog">
      <div className="absolute inset-0 bg-[#2B1B17]/40" onClick={onClose} />
      <form onSubmit={submit} className="relative pq-card p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-xl text-[#2B1B17]">Add Staff Member</h3>
          <button type="button" onClick={onClose} className="text-[#78665E]"><X size={18} /></button>
        </div>
        <div><label className="pq-label">Name *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="pq-input" data-testid="staff-name-input" /></div>
        <div><label className="pq-label">Email *</label><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="pq-input" data-testid="staff-email-input" /></div>
        <div><label className="pq-label">Temporary password *</label><input required minLength={8} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="pq-input" data-testid="staff-password-input" /></div>
        <div><label className="pq-label">Role</label>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="pq-input" data-testid="staff-role-select">
            <option value="staff">Staff</option><option value="admin">Admin</option><option value="owner">Owner</option>
          </select>
        </div>
        <button type="submit" disabled={saving} className="pq-btn-primary w-full" data-testid="staff-save-btn">{saving ? "Creating…" : "Create Account"}</button>
      </form>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [staff, setStaff] = useState([]);
  const [showStaff, setShowStaff] = useState(false);
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const logoInput = useRef(null);

  const load = () => {
    api.get("/settings").then((r) => setSettings(r.data)).catch(() => {});
    api.get("/auth/staff").then((r) => setStaff(r.data)).catch(() => {});
  };
  useEffect(load, []);

  if (!settings) return <div className="pq-card h-96 animate-pulse" data-testid="settings-loading" />;
  const set = (k, v) => setSettings((s) => ({ ...s, [k]: v }));

  const save = async () => {
    try {
      await api.put("/settings", settings);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(fmtErr(err));
    }
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api.post("/settings/logo", fd);
      toast.success("Logo updated");
      load();
    } catch (err) {
      toast.error(fmtErr(err));
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    try {
      await api.post("/auth/change-password", pw);
      toast.success("Password changed");
      setPw({ current_password: "", new_password: "" });
    } catch (err) {
      toast.error(fmtErr(err));
    }
  };

  return (
    <div data-testid="settings-page" className="max-w-4xl space-y-8">
      <PageHeader eyebrow="Configuration" title="Settings" testid="settings-header" />

      <section className="pq-card p-6" data-testid="settings-business">
        <p className="pq-eyebrow mb-4">Business Settings</p>
        <div className="flex items-center gap-5 mb-5">
          <div className="w-20 h-20 rounded-xl border border-[#EDE5DE] bg-[#FDFBF7] flex items-center justify-center overflow-hidden">
            {settings.logo_path ? (
              <img src={fileUrl(settings.logo_path)} alt="PASTRY QUIN logo" className="max-w-full max-h-full object-contain" data-testid="settings-logo-preview" />
            ) : (
              <span className="font-serif text-lg text-[#C9B8AE]">PQ</span>
            )}
          </div>
          <div>
            <button onClick={() => logoInput.current?.click()} className="pq-btn-outline !py-2 text-xs" data-testid="upload-logo-btn"><ImagePlus size={14} /> Upload official logo</button>
            <input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={(e) => uploadLogo(e.target.files[0])} data-testid="logo-input" />
            <p className="text-[11px] text-[#B9ABA2] mt-1.5">Shown in the sidebar and on brand surfaces.</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="pq-label">Business name</label><input value={settings.business_name || ""} onChange={(e) => set("business_name", e.target.value)} className="pq-input" data-testid="settings-business-name" /></div>
          <div><label className="pq-label">Tagline</label><input value={settings.tagline || ""} onChange={(e) => set("tagline", e.target.value)} className="pq-input" data-testid="settings-tagline" /></div>
          <div><label className="pq-label">Phone</label><input value={settings.phone || ""} onChange={(e) => set("phone", e.target.value)} className="pq-input" data-testid="settings-phone" /></div>
          <div><label className="pq-label">WhatsApp</label><input value={settings.whatsapp || ""} onChange={(e) => set("whatsapp", e.target.value)} className="pq-input" data-testid="settings-whatsapp" /></div>
          <div><label className="pq-label">Email</label><input value={settings.email || ""} onChange={(e) => set("email", e.target.value)} className="pq-input" data-testid="settings-email" /></div>
          <div><label className="pq-label">Currency</label><input value={settings.currency || "UGX"} onChange={(e) => set("currency", e.target.value)} className="pq-input" data-testid="settings-currency" /></div>
          <div className="sm:col-span-2"><label className="pq-label">Address</label><input value={settings.address || ""} onChange={(e) => set("address", e.target.value)} className="pq-input" data-testid="settings-address" /></div>
        </div>
        <button onClick={save} className="pq-btn-primary mt-5" data-testid="settings-save-btn">Save Settings</button>
      </section>

      <section className="pq-card p-6" data-testid="settings-email">
        <p className="pq-eyebrow mb-4">Email Settings</p>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div><p className="text-[11px] uppercase tracking-wider text-[#B9ABA2]">Provider</p><p className="text-[#2B1B17] mt-0.5">Managed transactional email (Resend)</p></div>
          <div><p className="text-[11px] uppercase tracking-wider text-[#B9ABA2]">Sender name</p><p className="text-[#2B1B17] mt-0.5">PASTRY QUIN</p></div>
        </div>
        <p className="text-xs text-[#78665E] mt-4 leading-relaxed">
          Automatic reminders are sent for deposit due, 7 days before, 3 days before and on the cake day.
          Reminders go to the client email saved on each client profile. The scheduler runs every morning.
        </p>
      </section>

      <section className="pq-card p-6" data-testid="settings-cake">
        <p className="pq-eyebrow mb-4">Cake Settings</p>
        <p className="text-sm text-[#78665E] mb-4">Manage flavors, cake types, sizes and design categories used across orders and reports.</p>
        <div className="flex gap-2.5">
          <Link to="/flavors" className="pq-btn-outline" data-testid="settings-manage-flavors">Manage Flavors</Link>
          <Link to="/cake-types" className="pq-btn-outline" data-testid="settings-manage-types">Manage Types & Sizes</Link>
        </div>
      </section>

      <section className="pq-card p-6" data-testid="settings-admin">
        <p className="pq-eyebrow mb-4">Admin Settings</p>
        <p className="text-sm text-[#4A3B32] mb-1">Signed in as <strong>{user?.name}</strong> ({user?.email}) · role: {user?.role}</p>
        <form onSubmit={changePassword} className="grid sm:grid-cols-3 gap-4 mt-4 items-end">
          <div><label className="pq-label">Current password</label><input type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} className="pq-input" data-testid="current-password-input" /></div>
          <div><label className="pq-label">New password</label><input type="password" minLength={8} value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} className="pq-input" data-testid="new-password-input" /></div>
          <button type="submit" className="pq-btn-outline" data-testid="change-password-btn">Change Password</button>
        </form>
      </section>

      <section className="pq-card p-6" data-testid="settings-staff">
        <div className="flex items-center justify-between mb-4">
          <p className="pq-eyebrow">Staff Management</p>
          <button onClick={() => setShowStaff(true)} className="pq-btn-outline !py-2 text-xs" data-testid="add-staff-btn"><Plus size={14} /> Add Staff</button>
        </div>
        <div className="divide-y divide-[#F2EAE1]">
          {staff.map((s) => (
            <div key={s.id} className="flex items-center justify-between py-3" data-testid={`staff-${s.id}`}>
              <div>
                <p className="text-sm font-medium text-[#2B1B17]">{s.name}</p>
                <p className="text-xs text-[#78665E]">{s.email}</p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8C6D62] bg-[#F5EFEA] rounded-full px-2.5 py-1">{s.role}</span>
            </div>
          ))}
        </div>
      </section>

      {showStaff && <StaffDialog onClose={() => setShowStaff(false)} onSaved={load} />}
    </div>
  );
}
