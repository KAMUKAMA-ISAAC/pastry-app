import { CakeSlice } from "lucide-react";

export const STATUS_STYLES = {
  Inquiry: "bg-[#F5EFEA] text-[#4A3B32] border-[#EDE5DE]",
  Confirmed: "bg-[#EEF4EB] text-[#2E5A2A] border-[#CADBC2]",
  "Deposit Pending": "bg-[#FDF0F0] text-[#9E2A2B] border-[#F5CDCD]",
  "Deposit Paid": "bg-[#EEF4EB] text-[#2E5A2A] border-[#CADBC2]",
  "In Preparation": "bg-[#FAF1E8] text-[#9E5A20] border-[#F0D5BD]",
  Baking: "bg-[#FAF1E8] text-[#9E5A20] border-[#F0D5BD]",
  Decorating: "bg-[#F3EBF7] text-[#6B3280] border-[#DFCBE8]",
  Ready: "bg-[#F3EBF7] text-[#6B3280] border-[#DFCBE8]",
  "Picked Up": "bg-[#F5EFEA] text-[#4A3B32] border-[#EDE5DE]",
  Delivered: "bg-[#F5EFEA] text-[#4A3B32] border-[#EDE5DE]",
  Completed: "bg-[#EEF4EB] text-[#2E5A2A] border-[#CADBC2]",
  Cancelled: "bg-[#FDF0F0] text-[#9E2A2B] border-[#F5CDCD]",
};

export const PAY_STYLES = {
  Unpaid: "bg-[#FDF0F0] text-[#9E2A2B] border-[#F5CDCD]",
  "Partially Paid": "bg-[#FAF1E8] text-[#B45309] border-[#F0D5BD]",
  "Fully Paid": "bg-[#EEF4EB] text-[#2E5A2A] border-[#CADBC2]",
  Overpaid: "bg-[#F3EBF7] text-[#6B3280] border-[#DFCBE8]",
};

export function Badge({ label, styles, testid }) {
  return (
    <span
      data-testid={testid}
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${styles[label] || "bg-[#F5EFEA] text-[#4A3B32] border-[#EDE5DE]"}`}
    >
      {label}
    </span>
  );
}

export const StatusBadge = ({ s, testid }) => <Badge label={s} styles={STATUS_STYLES} testid={testid} />;
export const PayBadge = ({ s, testid }) => <Badge label={s} styles={PAY_STYLES} testid={testid} />;

export function CategoryBadge({ category, testid }) {
  return category === "wedding_intro" ? (
    <span data-testid={testid} className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold bg-[#F7EBE8] text-[#9E4A3B] border-[#EAC9C1]">
      Wedding &amp; Intro
    </span>
  ) : (
    <span data-testid={testid} className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold bg-[#EEF4EB] text-[#3B5A33] border-[#CADBC2]">
      Normal Cake
    </span>
  );
}

export function UrgencyPill({ dateNeeded, testid }) {
  if (!dateNeeded) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateNeeded + "T00:00:00");
  const days = Math.round((d - today) / 86400000);
  if (days < 0) return null;
  if (days === 0)
    return (
      <span data-testid={testid} className="inline-flex items-center gap-1.5 rounded-full bg-[#9E2A2B] px-2.5 py-0.5 text-[11px] font-bold text-white animate-pulse">
        ● DUE TODAY
      </span>
    );
  if (days <= 3)
    return (
      <span data-testid={testid} className="inline-flex items-center gap-1.5 rounded-full bg-[#FDF0F0] border border-[#F5CDCD] px-2.5 py-0.5 text-[11px] font-bold text-[#9E2A2B]">
        ▲ {days} day{days > 1 ? "s" : ""} left
      </span>
    );
  if (days <= 7)
    return (
      <span data-testid={testid} className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF1E8] border border-[#F0D5BD] px-2.5 py-0.5 text-[11px] font-semibold text-[#9E5A20]">
        ◆ {days} days left
      </span>
    );
  return (
    <span data-testid={testid} className="inline-flex items-center rounded-full bg-[#F5EFEA] border border-[#EDE5DE] px-2.5 py-0.5 text-[11px] font-medium text-[#78665E]">
      {days} days left
    </span>
  );
}

export function EmptyState({ title, hint, action, testid }) {
  return (
    <div data-testid={testid} className="pq-card flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-[#F7EBE8] flex items-center justify-center mb-4">
        <CakeSlice size={20} className="text-[#B76E60]" strokeWidth={1.5} />
      </div>
      <p className="font-serif text-xl text-[#2B1B17]">{title}</p>
      {hint && <p className="text-sm text-[#78665E] mt-1.5 max-w-sm">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, children, testid }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-7" data-testid={testid}>
      <div>
        {eyebrow && <p className="pq-eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-[#2B1B17]">{title}</h1>
      </div>
      {children && <div className="flex items-center gap-2.5">{children}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, testid }) {
  return (
    <div data-testid={testid} className="pq-card p-5 hover:border-[#D8A49B]/50 transition-colors">
      <p className="pq-eyebrow mb-2">{label}</p>
      <p className="font-serif text-2xl sm:text-3xl font-light tracking-tight text-[#2B1B17]">{value}</p>
      {sub && <p className="text-xs text-[#78665E] mt-1">{sub}</p>}
    </div>
  );
}

export function Field({ label, children, testid }) {
  return (
    <div data-testid={testid}>
      <label className="pq-label">{label}</label>
      {children}
    </div>
  );
}

// A clean multi-select: click a chip to add/remove it from the selection.
// Used for order flavors/fillings/frostings, which can be one or many.
export function MultiSelectChips({ label, options, selected, onChange, testid, emptyHint }) {
  const toggle = (name) => {
    onChange(selected.includes(name) ? selected.filter((s) => s !== name) : [...selected, name]);
  };
  return (
    <div data-testid={testid}>
      <label className="pq-label">{label}</label>
      {options.length === 0 ? (
        <p className="text-xs text-[#B9ABA2] mt-1">{emptyHint || "None active yet — add some in the catalog."}</p>
      ) : (
        <div className="flex flex-wrap gap-2 mt-1.5">
          {options.map((opt) => {
            const active = selected.includes(opt.name);
            return (
              <button
                type="button"
                key={opt.id}
                onClick={() => toggle(opt.name)}
                aria-pressed={active}
                data-testid={`${testid}-opt-${opt.id}`}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  active ? "bg-[#2B1B17] text-[#FAF8F5] border-[#2B1B17]" : "border-[#EDE5DE] text-[#5A483E] hover:border-[#D8A49B]"
                }`}
              >
                {opt.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
