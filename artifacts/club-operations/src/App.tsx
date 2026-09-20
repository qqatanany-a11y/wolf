import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Link,
  Route,
  Switch,
  useLocation,
  useSearch,
  Router as WouterRouter,
} from "wouter";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  CircleDot,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Coffee,
  CreditCard,
  Gamepad2,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  Package,
  Pause,
  Pencil,
  Play,
  Plus,
  ReceiptText,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  Square,
  Table2,
  TimerReset,
  Trash2,
  Utensils,
  WalletCards,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  getGetDashboardQueryKey,
  getGetProfitReportQueryKey,
  getListOrdersQueryKey,
  getListProductsQueryKey,
  getListResourcesQueryKey,
  getListSessionsQueryKey,
  useCreateOrder,
  useCreateProduct,
  useCreateSession,
  useGetDashboard,
  useGetProfitReport,
  useListOrders,
  useListProducts,
  useListResources,
  useListSessions,
  usePayOrder,
  useUpdateResource,
  useUpdateSession,
} from "@workspace/api-client-react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();
const money = (value: number | undefined) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "JOD",
    currencyDisplay: "code",
  }).format(value ?? 0);
const moneySum = (values: number[]) =>
  values.reduce((total, value) => total + Math.round((Number(value) || 0) * 100), 0) / 100;
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(value),
  );
const fullDateLabel = (value: string | Date = new Date()) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
const timeLabel = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const today = () => {
  const date = new Date();
  return dateKey(date);
};
const currentWeekBounds = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  // Club reporting weeks run Sunday through Saturday.
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { from: dateKey(start), to: dateKey(end) };
};
const cafeteriaCategoryOrder = [
  "cold drinks",
  "hot drinks",
  "snacks",
  "shisha",
  "extra",
];
const cafeteriaCategoryRank = (category: string) => {
  const rank = cafeteriaCategoryOrder.indexOf(category.trim().toLowerCase());
  return rank === -1 ? cafeteriaCategoryOrder.length : rank;
};

const reportDateFor = (value: string | Date | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  const hour = date.getHours();
  if (hour >= 16) return dateKey(date);
  if (hour >= 12) return null;
  date.setDate(date.getDate() - 1);
  return dateKey(date);
};
const secondsLabel = (seconds: number | null | undefined) => {
  const safe = Math.max(0, seconds ?? 0);
  return `${String(Math.floor(safe / 3600)).padStart(2, "0")}:${String(Math.floor((safe % 3600) / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
};
const useCurrentTime = () => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, []);
  return now;
};
const timestamp = (value: string | Date | null | undefined) =>
  value ? new Date(value).getTime() : null;
const sessionElapsedSeconds = (session: any, now: number) => {
  const startedAt = timestamp(session.startedAt);
  const endedAt = timestamp(session.endedAt);
  const pausedAt = timestamp(session.pausedAt);
  const endsAt = session.mode === "limited" ? timestamp(session.endsAt) : null;
  if (!startedAt) return session.elapsedSeconds ?? 0;
  const activeEnd = pausedAt ?? now;
  const currentEnd =
    endedAt ?? (endsAt === null ? activeEnd : Math.min(activeEnd, endsAt));
  return Math.max(0, Math.floor((currentEnd - startedAt) / 1000));
};
const sessionBilledSeconds = (session: any, now: number) => {
  const halfHourSeconds = 30 * 60;
  return Math.max(
    halfHourSeconds,
    Math.ceil(sessionElapsedSeconds(session, now) / halfHourSeconds) *
      halfHourSeconds,
  );
};
const sessionPlayingTotal = (session: any, now: number) =>
  (sessionBilledSeconds(session, now) / 3600) * (session.hourlyRate ?? 0);
const liveResourceUsageLines = (session: any, now: number) => {
  const usages = session.resourceUsages ?? [];
  const lines = usages.map((usage: any) => {
    const started = timestamp(usage.startedAt);
    const ended = timestamp(usage.endedAt) ?? timestamp(session.endedAt) ?? timestamp(session.pausedAt) ?? now;
    const limitedEnd = session.mode === "limited" ? timestamp(session.endsAt) : null;
    return {
      ...usage,
      elapsedSeconds: Math.max(0, Math.floor((Math.min(ended, limitedEnd ?? ended) - (started ?? ended)) / 1000)),
      total: 0,
    };
  });
  for (let index = 0; index < lines.length;) {
    const group = [lines[index]];
    while (index + group.length < lines.length && lines[index + group.length].hourlyRate === group[0].hourlyRate) {
      group.push(lines[index + group.length]);
    }
    const elapsed = group.reduce((sum, line) => sum + line.elapsedSeconds, 0);
    const billedSeconds = Math.max(1800, Math.ceil(elapsed / 1800) * 1800);
    const groupTotal = (billedSeconds / 3600) * (group[0].hourlyRate ?? 0);
    let assigned = 0;
    group.slice(0, -1).forEach((line) => {
      line.total = elapsed ? Math.round((groupTotal * line.elapsedSeconds / elapsed) * 100) / 100 : 0;
      assigned += line.total;
    });
    group[group.length - 1].total = Math.round((groupTotal - assigned) * 100) / 100;
    index += group.length;
  }
  return lines;
};
const liveSessionPlayingTotal = (session: any, now: number) => {
  if (session.resourceUsages?.length) {
    return liveResourceUsageLines(session, now).reduce(
      (sum: number, usage: any) => sum + usage.total,
      0,
    );
  }
  const calculatedTotal = sessionPlayingTotal(session, now);
  return session.mode === "limited"
    ? calculatedTotal
    : Math.max(session.total ?? 0, calculatedTotal);
};
const sessionGrandTotal = (session: any, playingTotal: number) =>
  playingTotal + (session.cafeteriaTotal ?? 0);
const resourceRemainingSeconds = (resource: any, now: number) => {
  const endsAt = timestamp(resource.activeSessionEndsAt);
  const pausedAt = timestamp(resource.activeSessionPausedAt);
  return endsAt === null
    ? resource.remainingSeconds
    : Math.max(0, Math.floor((endsAt - (pausedAt ?? now)) / 1000));
};
const sessionRemainingSeconds = (session: any, now: number) => {
  const endsAt = timestamp(session.endsAt);
  const pausedAt = timestamp(session.pausedAt);
  return endsAt === null
    ? null
    : Math.max(0, Math.floor((endsAt - (pausedAt ?? now)) / 1000));
};
const isSessionOverdue = (session: any, now: number) => {
  const endsAt = timestamp(session.endsAt);
  return (
    !session.endedAt && !session.pausedAt && endsAt !== null && endsAt <= now
  );
};
const isResourceOverdue = (resource: any, now: number) => {
  const endsAt = timestamp(resource.activeSessionEndsAt);
  return resource.status === "active" && endsAt !== null && endsAt <= now;
};
const withLiveSessionValues = (session: any, now: number) => {
  // A paid/completed session is an invoice, not a live timer.  Never run the
  // clock calculation over it: doing so mutates the shared query cache every
  // second and can make historical invoice amounts drift on screen.
  if (session.endedAt) return session;
  const elapsedSeconds = sessionElapsedSeconds(session, now);
  const total = liveSessionPlayingTotal(session, now);
  return {
    ...session,
    status: isSessionOverdue(session, now) ? "overdue" : session.status,
    elapsedSeconds,
    remainingSeconds: sessionRemainingSeconds(session, now),
    total,
    resourceUsages: liveResourceUsageLines(session, now),
    grandTotal: sessionGrandTotal(session, total),
  };
};

function ResourceUsageBillLines({ session }: { session: any }) {
  const usages = session.resourceUsages ?? [{ resourceName: session.resourceName, elapsedSeconds: session.elapsedSeconds, hourlyRate: session.hourlyRate, total: session.total }];
  return <>
    <div className="border-t border-border pt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Playing details</div>
    {usages.map((usage: any, index: number) => (
      <div key={`${usage.resourceId ?? usage.resourceName}-${index}`} className="rounded-md bg-muted/35 p-2.5">
        <div className="flex justify-between font-bold"><span>{usage.resourceName}</span><span>{money(usage.total)}</span></div>
        <div className="mt-1 flex justify-between text-muted-foreground"><span>{secondsLabel(usage.elapsedSeconds)} · {money(usage.hourlyRate)}/hr</span><span>Table {index + 1}</span></div>
      </div>
    ))}
  </>;
}
const withLiveResourceValues = (resource: any, now: number) => ({
  ...resource,
  status: isResourceOverdue(resource, now) ? "overdue" : resource.status,
  remainingSeconds: resourceRemainingSeconds(resource, now),
});
const manageApi = async (
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  data?: unknown,
) => {
  const response = await fetch(`/api${path}`, {
    method,
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error ?? "Could not save changes");
  }
  return response.status === 204 ? null : response.json();
};

type Account = {
  username: string;
  role?: "super_admin" | "staff";
  mustChangePassword: boolean;
};

const isSuperAdmin = (account: Account) =>
  account.role === "super_admin" ||
  account.username === "ahmed" ||
  account.username === "mazen";

function SettlementDialog({
  invoice,
  onClose,
  onConfirm,
  saving = false,
  initialNotes = "",
}: {
  invoice: { label: string; subtotal: number };
  onClose: () => void;
  onConfirm: (
    paymentMethod: "cash" | "cliq",
    discountType: "amount" | "percentage",
    discountValue: number,
    discountReason: string,
    notes: string,
  ) => void;
  saving?: boolean;
  initialNotes?: string;
}) {
  const [discountType, setDiscountType] = useState<"amount" | "percentage">(
    "amount",
  );
  const [discountValue, setDiscountValue] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState(initialNotes);
  const [error, setError] = useState("");
  const value = discountValue.trim() === "" ? 0 : Number(discountValue);
  const amount =
    Number.isFinite(value) && value >= 0
      ? discountType === "percentage"
        ? (invoice.subtotal * value) / 100
        : value
      : 0;
  const total = Math.max(
    0,
    invoice.subtotal - amount,
  );
  const settle = (paymentMethod: "cash" | "cliq") => {
    const limit = discountType === "percentage" ? 100 : invoice.subtotal;
    if (!Number.isFinite(value) || value < 0 || value > limit)
      return setError(
        discountType === "percentage"
          ? "Enter a percentage between zero and 100."
          : "Enter a discount between zero and the invoice subtotal.",
      );
    if (amount > 0 && !reason.trim())
      return setError("A discount reason is required.");
    onConfirm(paymentMethod, discountType, value, reason.trim(), notes.trim());
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-primary/35 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settlement-title"
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl fade-up"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Settle invoice
            </div>
            <h2 id="settlement-title" className="mt-1 text-xl font-extrabold">
              {invoice.label}
            </h2>
          </div>
          <button
            aria-label="Close settlement dialog"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-5 space-y-4">
          <div className="flex justify-between border-b border-border pb-3 text-sm">
            <span className="text-muted-foreground">Invoice subtotal</span>
            <span className="font-bold">{money(invoice.subtotal)}</span>
          </div>
          <div>
            <span className="block text-xs font-bold">Discount type</span>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {([
                ["amount", "Fixed amount (JOD)"],
                ["percentage", "Percentage (%)"],
              ] as const).map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setDiscountType(type);
                    setDiscountValue("");
                    setError("");
                  }}
                  className={`rounded-lg border px-3 py-2 text-xs font-bold ${discountType === type ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold" htmlFor="invoice-notes">
              Invoice notes
            </label>
            <textarea
              id="invoice-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Optional notes for this invoice"
              className="mt-1.5 w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <label className="block text-xs font-bold">
            {discountType === "percentage"
              ? "Discount percentage (optional)"
              : "Discount amount (JOD, optional)"}
            <input
              autoFocus
              inputMode="decimal"
              type="number"
              min="0"
              max={discountType === "percentage" ? 100 : invoice.subtotal}
              step="0.01"
              value={discountValue}
              onChange={(event) => {
                setDiscountValue(event.target.value);
                setError("");
              }}
              placeholder={discountType === "percentage" ? "0" : "0.00"}
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
            />
          </label>
          {amount > 0 && (
            <label className="block text-xs font-bold">
              Discount reason <span className="text-destructive">*</span>
              <textarea
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setError("");
                }}
                maxLength={250}
                rows={2}
                placeholder="Required when a discount is applied"
                className="mt-1.5 w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
              />
            </label>
          )}
          <div className="flex justify-between border-t border-border pt-3 text-sm font-extrabold">
            <span>Total due</span>
            <span>{money(total)}</span>
          </div>
          {error && (
            <p role="alert" className="text-xs font-semibold text-destructive">
              {error}
            </p>
          )}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            disabled={saving}
            onClick={() => settle("cash")}
            className="rounded-lg border border-border py-3 text-sm font-bold hover:border-primary disabled:opacity-50"
          >
            Cash
          </button>
          <button
            disabled={saving}
            onClick={() => settle("cliq")}
            className="rounded-lg bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            CliQ
          </button>
        </div>
      </div>
    </div>
  );
}

const authApi = async (path: string, data?: Record<string, string>) => {
  const response = await fetch(`/api/auth${path}`, {
    method: data ? "POST" : "GET",
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error ?? "Could not complete the request");
  }
  return response.status === 204 ? null : response.json();
};

function PasswordForm({
  mode,
  username,
  onDone,
}: {
  mode: "change" | "reset";
  username?: string;
  onDone: (account?: Account) => void;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(
      new FormData(event.currentTarget),
    ) as Record<string, string>;
    if (values.newPassword !== values.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const account = await authApi(
        mode === "change" ? "/change-password" : "/reset-password",
        values,
      );
      onDone(account as Account | undefined);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update the password",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      {mode === "reset" && (
        <>
          <label className="block text-xs font-bold">
            Username
            <input
              name="username"
              defaultValue={username}
              autoComplete="username"
              required
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block text-xs font-bold">
            Recovery code
            <input
              name="recoveryCode"
              type="password"
              required
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </>
      )}
      {mode === "change" && (
        <label className="block text-xs font-bold">
          Current password
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
      )}
      <label className="block text-xs font-bold">
        New password
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      <label className="block text-xs font-bold">
        Confirm new password
        <input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
        >
          {error}
        </p>
      )}
      <button
        disabled={saving}
        className="wolf-primary-action flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
      >
        <KeyRound size={16} />
        {saving ? "Saving..." : "Save password"}
      </button>
    </form>
  );
}

function LoginScreen({
  onAuthenticated,
}: {
  onAuthenticated: (account: Account) => void;
}) {
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(
      new FormData(event.currentTarget),
    ) as Record<string, string>;
    setSaving(true);
    setError("");
    try {
      onAuthenticated((await authApi("/login", values)) as Account);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign in");
    } finally {
      setSaving(false);
    }
  };
  return (
    <main className="login-screen grain flex min-h-dvh items-center justify-center px-4 py-8 text-foreground">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-2xl sm:p-8">
        <div className="flex items-center justify-center">
          <IconMark />
        </div>
        <div className="mt-5 text-center">
          <div className="mono text-[10px] font-bold tracking-[0.2em] text-accent">
            THE WOLF
          </div>
          <h1 className="mt-2 text-2xl font-extrabold">Club Operations</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Authorized staff access only
          </p>
        </div>
        {mode === "login" ? (
          <form onSubmit={submit} className="mt-7 space-y-4">
            <label className="block text-xs font-bold">
              Username
              <input
                name="username"
                autoComplete="username"
                required
                className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="block text-xs font-bold">
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            {error && (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
              >
                {error}
              </p>
            )}
            <button
              disabled={saving}
              className="wolf-primary-action flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              <LockKeyhole size={16} />
              {saving ? "Signing in..." : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("reset");
                setError("");
              }}
              className="w-full py-1 text-xs font-bold text-accent hover:underline"
            >
              Forgot password?
            </button>
          </form>
        ) : (
          <div className="mt-7">
            <h2 className="mb-2 text-lg font-extrabold">Reset password</h2>
            <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
              Enter the club recovery code and set a new password.
            </p>
            <PasswordForm
              mode="reset"
              onDone={() => {
                setMode("login");
                setError("Password reset complete. You can sign in now.");
              }}
            />
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
              }}
              className="mt-4 w-full text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              Back to sign in
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

function PasswordDialog({
  account,
  force,
  onDone,
  onClose,
}: {
  account: Account;
  force?: boolean;
  onDone: (account: Account) => void;
  onClose?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mono text-[10px] tracking-[0.18em] text-accent">
              ACCOUNT SECURITY
            </div>
            <h2 className="mt-1 text-xl font-extrabold">
              {force ? "Set a new password" : "Change password"}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {force
                ? "Change your temporary password before using the system."
                : `Account: ${account.username}`}
            </p>
          </div>
          {!force && (
            <button
              aria-label="Close"
              onClick={onClose}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <div className="mt-6">
          <PasswordForm
            mode="change"
            onDone={(updated) =>
              onDone(updated ?? { ...account, mustChangePassword: false })
            }
          />
        </div>
      </div>
    </div>
  );
}

function IconMark() {
  return (
    <div className="wolf-logo-wrap">
      <img
        src="/brand/wolf-billiards-logo.jpg"
        alt="The Wolf for Billiards & Snooker"
        className="wolf-logo"
      />
    </div>
  );
}

function Shell({
  children,
  account,
  onPasswordChange,
  onLogout,
}: {
  children: ReactNode;
  account: Account;
  onPasswordChange: () => void;
  onLogout: () => void;
}) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav = [
    { href: "/", label: "Live floor", icon: LayoutDashboard },
    { href: "/sessions", label: "Sessions", icon: TimerReset },
    { href: "/cafeteria", label: "Cafeteria", icon: Coffee },
    { href: "/reports", label: "Reports", icon: BarChart3 },
    { href: "/settings", label: "Settings", icon: Settings },
  ].filter(
    (item) =>
      isSuperAdmin(account) ||
      (item.href !== "/reports" && item.href !== "/settings"),
  );
  return (
    <div className="app-shell grain flex bg-background text-foreground">
      <aside
        className={`${mobileOpen ? "translate-x-0" : "-translate-x-full"} wolf-sidebar fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 transition-transform md:sticky md:top-0 md:h-dvh md:self-start md:overflow-y-auto md:translate-x-0`}
      >
        <div className="mb-10 flex items-center gap-3 px-2">
          <IconMark />
          <div className="min-w-0">
            <div className="wolf-brand-name text-sidebar-foreground">
              THE WOLF
            </div>
            <div className="wolf-brand-subtitle text-sidebar-foreground/55">
              BILLIARDS & SNOOKER
            </div>
          </div>
        </div>
        <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/40">
          Club control
        </div>
        <nav className="space-y-1">
          {nav.map((item) => {
            const active = location === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={`link-${item.label.toLowerCase().replace(" ", "-")}`}
                onClick={() => setMobileOpen(false)}
                className={`wolf-nav-item group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/60 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"}`}
              >
                <Icon size={17} strokeWidth={active ? 2.4 : 1.8} />
                <span>{item.label}</span>
                {item.href === "/" && (
                  <span className="ml-auto status-dot bg-[hsl(var(--accent))]" />
                )}
                {item.href === "/cafeteria" && (
                  <span className="ml-auto rounded-full bg-sidebar-primary/15 px-1.5 py-0.5 text-[9px] text-sidebar-primary">
                    open
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-sidebar-border px-3 pt-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-extrabold text-sidebar-foreground">
                {account.username}
              </div>
              <div className="mt-0.5 text-[10px] text-sidebar-foreground/45">
                {isSuperAdmin(account) ? "Super admin" : "Staff"}
              </div>
            </div>
            <div className="flex items-center">
              <button
                title="Change password"
                aria-label="Change password"
                onClick={onPasswordChange}
                className="rounded-md p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <KeyRound size={15} />
              </button>
              <button
                title="Log out"
                aria-label="Log out"
                onClick={onLogout}
                className="rounded-md p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-foreground/45">
            <span className="status-dot bg-[hsl(var(--accent))]" /> Floor online
          </div>
          <div className="mt-2 text-xs text-sidebar-foreground/55">
            Run the table. Own the night.
          </div>
        </div>
      </aside>
      {mobileOpen && (
        <button
          aria-label="Close menu"
          data-testid="button-close-menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-[hsl(var(--primary)/0.35)] md:hidden"
        />
      )}
      <main className="min-w-0 flex-1">
        <div className="wolf-mobile-bar md:hidden">
          <button
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 text-foreground hover:bg-muted"
          >
            <Menu size={21} />
          </button>
          <div className="flex items-center gap-2">
            <IconMark />
            <span className="wolf-brand-name text-foreground">THE WOLF</span>
          </div>
        </div>
        <div className="paper-grid min-h-dvh px-4 py-6 md:px-8 md:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="wolf-page-heading mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <div className="wolf-eyebrow mono mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          {eyebrow}
        </div>
        <h1 className="text-[29px] font-extrabold text-foreground md:text-[34px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "accent" | "warm";
  icon: LucideIcon;
}) {
  const openDailyInvoices = label === "Revenue";
  return (
    <div
      role={openDailyInvoices ? "button" : undefined}
      tabIndex={openDailyInvoices ? 0 : undefined}
      onClick={
        openDailyInvoices
          ? () => {
              window.location.assign(`/reports/invoices?date=${today()}`);
            }
          : undefined
      }
      onKeyDown={
        openDailyInvoices
          ? (event) => {
              if (event.key === "Enter" || event.key === " ")
                window.location.assign(`/reports/invoices?date=${today()}`);
            }
          : undefined
      }
      className={`wolf-metric rounded-xl border p-4 ${openDailyInvoices ? "cursor-pointer hover:border-primary/50 hover:shadow-sm" : ""} ${tone === "accent" ? "border-primary/20 bg-primary text-primary-foreground" : tone === "warm" ? "border-accent/30 bg-accent/15" : "border-border bg-card"}`}
    >
      <div className="flex items-start justify-between">
        <span
          className={`text-[11px] font-bold uppercase tracking-[0.12em] ${tone === "accent" ? "text-primary-foreground/65" : "text-muted-foreground"}`}
        >
          {label}
        </span>
        <Icon
          size={17}
          className={
            tone === "accent" ? "text-accent" : "text-muted-foreground"
          }
        />
      </div>
      <div
        className={`tabular mt-4 text-[27px] font-extrabold tracking-[-0.04em] ${tone === "accent" ? "text-primary-foreground" : "text-foreground"}`}
      >
        {value}
      </div>
      <div
        className={`mt-1 flex items-center gap-1 text-[11px] font-semibold ${tone === "accent" ? "text-primary-foreground/60" : "text-muted-foreground"}`}
      >
        <ArrowUpRight size={13} /> {detail}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-primary/15 text-primary",
    paused: "bg-accent/15 text-accent",
    available: "bg-muted text-muted-foreground",
    overdue: "bg-destructive/15 text-destructive",
    open: "bg-accent/15 text-accent",
    paid: "bg-primary/15 text-primary",
    completed: "bg-muted text-muted-foreground",
    unpaid: "bg-accent/15 text-accent",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold capitalize ${styles[status] ?? styles.available}`}
    >
      <span className="status-dot bg-current" />
      {status}
    </span>
  );
}

function ResourceTile({
  resource,
  now,
  onStart,
}: {
  resource: any;
  now: number;
  onStart: (id: number) => void;
}) {
  const isPlaystation = resource.kind === "playstation";
  const isActive = resource.status !== "available";
  const resourceImages: Record<string, string> = {
    snooker: "/resource-cards/snooker-table.jpg",
    billiards: "/resource-cards/billiards-table.jpg",
    playstation: "/resource-cards/playstation-5.jpg",
  };
  const image = resourceImages[resource.kind];
  return (
    <div
      data-testid={`card-resource-${resource.id}`}
      className={`wolf-resource-tile group relative overflow-hidden rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${resource.status === "overdue" ? "border-red-200 bg-red-50/60" : "border-border bg-card"}`}
    >
      {image && (
        <div className="resource-card-media -mx-4 -mt-4 mb-4">
          <img
            src={image}
            alt={
              isPlaystation ? "PlayStation 5 console" : `${resource.kind} table`
            }
          />
        </div>
      )}
      <div className="flex items-start justify-between">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${isPlaystation ? "bg-accent/15 text-accent" : "bg-primary/10 text-primary"}`}
        >
          {isPlaystation ? <Gamepad2 size={19} /> : <Table2 size={19} />}
        </div>
        <StatusBadge status={resource.status} />
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <div className="text-sm font-extrabold">{resource.name}</div>
          <div className="mt-1 text-[11px] capitalize text-muted-foreground">
            {resource.kind} · {money(resource.hourlyRate)}/hr
          </div>
        </div>
        {isActive && (
          <div
            className={`mono tabular text-right text-sm font-medium ${resource.status === "overdue" ? "text-red-700" : "text-primary"}`}
          >
            {resource.remainingSeconds != null
              ? secondsLabel(resourceRemainingSeconds(resource, now))
              : "OPEN"}
          </div>
        )}
      </div>
      {isActive ? (
        <div className="mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground">
          <div className="flex justify-between">
            <span>
              {resource.status === "overdue"
                ? "Time exceeded"
                : "Session in progress"}
            </span>
            <span className="font-bold text-foreground">
              #{resource.activeSessionId}
            </span>
          </div>
          <button
            data-testid={`button-manage-resource-${resource.id}`}
            onClick={() => onStart(resource.id)}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-1.5 text-[11px] font-bold hover:bg-muted"
          >
            <Square size={11} fill="currentColor" /> View session ledger
          </button>
        </div>
      ) : (
        <button
          data-testid={`button-start-resource-${resource.id}`}
          onClick={() => onStart(resource.id)}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-md bg-primary py-2 text-[11px] font-bold text-primary-foreground hover:opacity-90"
        >
          <Plus size={13} /> Start session
        </button>
      )}
    </div>
  );
}

function SessionDialog({
  resources,
  open,
  onClose,
  selectedResourceId,
}: {
  resources: any[];
  open: boolean;
  onClose: () => void;
  selectedResourceId?: number | null;
}) {
  const create = useCreateSession();
  const client = useQueryClient();
  const [resourceId, setResourceId] = useState(
    String(
      resources.find((r) => r.status === "available")?.id ??
        resources[0]?.id ??
        "",
    ),
  );
  const [mode, setMode] = useState("open");
  const [duration, setDuration] = useState("60");
  const availableResources = resources.filter(
    (resource) => resource.status === "available",
  );
  useEffect(() => {
    if (!open) return;
    const requestedResource = availableResources.find(
      (resource) => resource.id === selectedResourceId,
    );
    const currentResourceIsAvailable = availableResources.some(
      (resource) => String(resource.id) === resourceId,
    );
    if (requestedResource) {
      setResourceId(String(requestedResource.id));
    } else if (!currentResourceIsAvailable) {
      setResourceId(String(availableResources[0]?.id ?? ""));
    }
  }, [availableResources, open, resourceId, selectedResourceId]);
  if (!open) return null;
  const submit = () =>
    create.mutate(
      {
        data: {
          resourceId: Number(resourceId),
          mode: mode as "open" | "limited",
          durationMinutes: mode === "limited" ? Number(duration) : null,
        },
      },
      {
        onSuccess: () => {
          client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          client.invalidateQueries({ queryKey: getListResourcesQueryKey() });
          client.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          onClose();
        },
      },
    );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/35 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl fade-up">
        <div className="flex items-start justify-between">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              New activity
            </div>
            <h2 className="mt-1 text-xl font-extrabold tracking-tight">
              Start a session
            </h2>
          </div>
          <button
            aria-label="Close dialog"
            data-testid="button-close-session-dialog"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-6 space-y-4">
          <label className="block text-xs font-bold">
            Resource
            <select
              data-testid="select-session-resource"
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
            >
              {availableResources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {money(r.hourlyRate)}/hr
                  </option>
                ))}
            </select>
          </label>
          <div>
            <div className="mb-1.5 text-xs font-bold">Session mode</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["open", "Open play", "No end time"],
                ["limited", "Limited", "Set a duration"],
              ].map(([value, label, hint]) => (
                <button
                  type="button"
                  key={value}
                  data-testid={`button-mode-${value}`}
                  onClick={() => setMode(value)}
                  className={`rounded-lg border p-3 text-left ${mode === value ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                >
                  <div className="text-xs font-extrabold">{label}</div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {hint}
                  </div>
                </button>
              ))}
            </div>
          </div>
          {mode === "limited" && (
            <label className="block text-xs font-bold">
              Duration (minutes)
              <input
                data-testid="input-session-duration"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                type="number"
                min="1"
                className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
              />
            </label>
          )}
        </div>
        <button
          disabled={create.isPending || !resourceId}
          data-testid="button-confirm-start-session"
          onClick={submit}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {create.isPending ? "Starting…" : "Start session"}
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function Dashboard() {
  const { data, isLoading, isError, refetch } = useGetDashboard({
    query: { queryKey: getGetDashboardQueryKey(), refetchInterval: 30000 },
  });
  const now = useCurrentTime();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedResourceId, setSelectedResourceId] = useState<number | null>(
    null,
  );
  const [, setLocation] = useLocation();
  const resources = data?.resources ?? [];
  const openSessionDialog = (resourceId: number | null = null) => {
    setSelectedResourceId(resourceId);
    setDialogOpen(true);
  };
  if (isLoading) return <LoadingPage />;
  if (isError || !data) return <ErrorPage onRetry={refetch} />;
  return (
    <>
      <PageHeading
        eyebrow={`${fullDateLabel()} / The Wolf is live`}
        title="Own the floor."
        description="Live tables, open tabs, and every move that matters tonight."
        action={
          <button
            data-testid="button-start-session"
            onClick={() => openSessionDialog()}
            className="wolf-primary-action flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm hover:opacity-90"
          >
            <Plus size={16} /> Start session
          </button>
        }
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric
          label="Today's revenue"
          value={money(data.revenue)}
          detail="Collected across the club"
          tone="accent"
          icon={CircleDollarSign}
        />
        <Metric
          label="Active sessions"
          value={String(data.activeSessions).padStart(2, "0")}
          detail={`${resources.filter((r) => r.status === "overdue").length} needs attention`}
          icon={Clock3}
        />
        <Metric
          label="Open cafeteria"
          value={String(data.openOrders).padStart(2, "0")}
          detail="Orders waiting to close"
          icon={ReceiptText}
        />
      </div>
      <section className="mt-7">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-extrabold tracking-tight">
              Live floor
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Every resource, at a glance
            </p>
          </div>
          <Link
            href="/sessions"
            data-testid="link-view-sessions"
            className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
          >
            View sessions <ChevronRight size={14} />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {resources.map((r) => (
            <ResourceTile
              key={r.id}
              resource={r}
              now={now}
              onStart={() =>
                r.status === "available"
                  ? openSessionDialog(r.id)
                  : setLocation("/sessions")
              }
            />
          ))}
        </div>
      </section>
      <div className="mt-7 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <PaymentMix data={data} />
        <ActivityPanel activities={data.recentActivity} />
      </div>
      <SessionDialog
        resources={resources}
        open={dialogOpen}
        selectedResourceId={selectedResourceId}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}

function PaymentMix({ data }: { data: any }) {
  const total = (data.paymentMix.cash ?? 0) + (data.paymentMix.cliq ?? 0);
  const cashPercent = total
    ? Math.round((data.paymentMix.cash / total) * 100)
    : 0;
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-extrabold">Payment mix</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Collected today across all revenue
          </p>
        </div>
        <WalletCards size={18} className="text-muted-foreground" />
      </div>
      <div className="mt-6 flex items-center gap-7">
        <div
          className="relative h-28 w-28 shrink-0 rounded-full"
          style={{
            background: `conic-gradient(hsl(var(--primary)) ${cashPercent}%, hsl(var(--accent)) 0)`,
          }}
        >
          <div className="absolute inset-[9px] flex flex-col items-center justify-center rounded-full bg-card">
            <span className="tabular text-2xl font-extrabold">
              {cashPercent}%
            </span>
            <span className="text-[9px] uppercase text-muted-foreground">
              cash
            </span>
          </div>
        </div>
        <div className="flex-1 space-y-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-semibold">
              <span className="status-dot bg-primary" /> Cash
            </span>
            <span className="tabular text-xs font-extrabold">
              {money(data.paymentMix.cash)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-semibold">
              <span className="status-dot bg-accent" /> CliQ
            </span>
            <span className="tabular text-xs font-extrabold">
              {money(data.paymentMix.cliq)}
            </span>
          </div>
          <div className="border-t border-border pt-2 text-[10px] text-muted-foreground">
            Reconciliation looks balanced{" "}
            <Check size={12} className="ml-1 inline text-emerald-600" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityPanel({ activities }: { activities: any[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-extrabold">Recent activity</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Latest transactions and changes
          </p>
        </div>
        <Activity size={18} className="text-muted-foreground" />
      </div>
      <div className="mt-4 space-y-1">
        {(activities ?? []).slice(0, 5).map((item) => (
          <div
            key={item.id}
            data-testid={`activity-${item.id}`}
            className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted"
          >
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-md ${item.type === "session" ? "bg-primary/10 text-primary" : "bg-accent/20 text-amber-800"}`}
            >
              {item.type === "session" ? (
                <Table2 size={14} />
              ) : (
                <Utensils size={14} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold">{item.label}</div>
              <div className="text-[10px] text-muted-foreground">
                {timeLabel(item.createdAt)} · {item.paymentMethod ?? "open"}
              </div>
            </div>
            <div className="tabular text-xs font-extrabold">
              {money(item.amount)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const activeAlertAudioContexts = new Set<AudioContext>();

function stopOverdueTone() {
  activeAlertAudioContexts.forEach((context) => {
    void context.close();
  });
  activeAlertAudioContexts.clear();
}

function playOverdueTone() {
  const AudioContextClass =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  activeAlertAudioContexts.add(context);
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(880, context.currentTime);
  oscillator.frequency.setValueAtTime(660, context.currentTime + 0.28);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.6);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.62);
  oscillator.onended = () => {
    activeAlertAudioContexts.delete(context);
    void context.close();
  };
}

function OverdueAlert() {
  const { data: sessions = [] } = useListSessions(
    { status: "active" },
    {
      query: {
        queryKey: getListSessionsQueryKey({ status: "active" }),
        refetchInterval: 5000,
      },
    },
  );
  const now = useCurrentTime();
  const notified = useRef(new Set<number>());
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    const overdueSessions = sessions.filter((session: any) =>
      isSessionOverdue(session, now),
    );
    const overdueIds = new Set(
      overdueSessions.map((session: any) => session.id),
    );
    notified.current.forEach((id) => {
      if (!overdueIds.has(id)) notified.current.delete(id);
    });
    const newlyOverdue = overdueSessions.filter(
      (session: any) => !notified.current.has(session.id),
    );
    newlyOverdue.forEach((session: any) => notified.current.add(session.id));
    setAlerts((current) => [
      ...current.filter((session) => overdueIds.has(session.id)),
      ...newlyOverdue,
    ]);
  }, [sessions, now]);

  useEffect(() => {
    if (!alerts.length) {
      stopOverdueTone();
      return;
    }
    playOverdueTone();
    const interval = window.setInterval(playOverdueTone, 1000);
    return () => {
      window.clearInterval(interval);
      stopOverdueTone();
    };
  }, [alerts.length]);

  useEffect(() => () => stopOverdueTone(), []);

  if (!alerts.length) return null;
  const dismiss = () => {
    stopOverdueTone();
    setAlerts([]);
  };
  return (
    <div className="overdue-alert" role="alert" aria-live="assertive">
      <div className="overdue-alert__panel">
        <Bell size={22} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-extrabold">Session time ended</div>
          <div className="mt-0.5 text-xs">
            The timer and bill are paused. Use Close session to extend time or
            end the table.
          </div>
        </div>
        <button
          onClick={dismiss}
          className="rounded-md bg-destructive px-3 py-2 text-xs font-extrabold text-destructive-foreground"
        >
          Turn off alert
        </button>
      </div>
    </div>
  );
}

function LegacyOverdueAlert() {
  const { data: sessions = [] } = useListSessions(
    { status: "active" },
    {
      query: {
        queryKey: getListSessionsQueryKey({ status: "active" }),
        refetchInterval: 5000,
      },
    },
  );
  const client = useQueryClient();
  const now = useCurrentTime();
  const notified = useRef(new Set<number>());
  const [alerts, setAlerts] = useState<any[]>([]);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [settlingSession, setSettlingSession] = useState<any | null>(null);
  useEffect(() => {
    const overdueSessions = sessions.filter((session: any) =>
      isSessionOverdue(session, now),
    );
    const overdueIds = new Set(
      overdueSessions.map((session: any) => session.id),
    );
    notified.current.forEach((id) => {
      if (!overdueIds.has(id)) notified.current.delete(id);
    });
    const newlyOverdue = overdueSessions.filter(
      (session: any) => !notified.current.has(session.id),
    );
    newlyOverdue.forEach((session: any) => notified.current.add(session.id));
    setAlerts((current) => [
      ...current.filter((session) => overdueIds.has(session.id)),
      ...newlyOverdue,
    ]);
  }, [sessions, now]);
  useEffect(() => {
    if (!alerts.length) return;
    playOverdueTone();
    const interval = window.setInterval(playOverdueTone, 1000);
    return () => {
      window.clearInterval(interval);
      stopOverdueTone();
    };
  }, [alerts.length]);
  const dismiss = () => {
    stopOverdueTone();
    setAlerts([]);
  };
  if (!alerts.length) return null;
  return (
    <div className="overdue-alert" role="alert" aria-live="assertive">
      <div className="overdue-alert__panel">
        <Bell size={22} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-extrabold">Session time ended</div>
          <div className="mt-0.5 text-xs">
            The timer and bill are paused. Use Close session to extend time or
            end the table.
          </div>
        </div>
        <button
          onClick={dismiss}
          className="rounded-md bg-destructive px-3 py-2 text-xs font-extrabold text-destructive-foreground"
        >
          Turn off alert
        </button>
      </div>
    </div>
  );
  const extend = async (session: any) => {
    const value: string | null = null;
    if (value === null) return;
    const minutes = Number(value);
    if (!Number.isInteger(minutes) || minutes < 1) {
      return;
    }
    setProcessingId(session.id);
    try {
      await manageApi(`/sessions/${session.id}`, "PATCH", {
        action: "extend",
        durationMinutes: minutes,
      });
      notified.current.delete(session.id);
      setAlerts((current) => current.filter((item) => item.id !== session.id));
      client.invalidateQueries({ queryKey: getListSessionsQueryKey() });
      client.invalidateQueries({ queryKey: getListResourcesQueryKey() });
      client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    } catch {
      return;
    } finally {
      setProcessingId(null);
    }
  };
  const openBill = (session: any) => {
    setAlerts((current) => current.filter((item) => item.id !== session.id));
    setSettlingSession(session);
  };
  return (
    <>
      {alerts.length > 0 && (
        <div className="overdue-alert" role="alert" aria-live="assertive">
          <div className="overdue-alert__panel">
            <Bell size={22} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold">Session time ended</div>
              <div className="mt-0.5 text-xs">
                {alerts.map((session) => session.resourceName).join(", ")} is
                paused until you extend or close it.
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                disabled={processingId !== null}
                onClick={() => void extend(alerts[0])}
                className="rounded-md border border-border bg-card px-3 py-2 text-xs font-extrabold text-foreground disabled:opacity-50"
              >
                {processingId === alerts[0]?.id
                  ? "Extending..."
                  : "Extend time"}
              </button>
              <button
                disabled={processingId !== null}
                onClick={() => openBill(alerts[0])}
                className="rounded-md bg-destructive px-3 py-2 text-xs font-extrabold text-destructive-foreground disabled:opacity-50"
              >
                End table
              </button>
              <button
                aria-label="Dismiss alert"
                onClick={dismiss}
                className="rounded-md p-2 text-destructive-foreground/75 hover:bg-destructive-foreground/10"
              >
                <X size={17} />
              </button>
            </div>
          </div>
        </div>
      )}
      {settlingSession && (
        <LiveSessionBillDialog
          session={settlingSession}
          products={products as any[]}
          allowSettlement
          onClose={() => {
            notified.current.delete(settlingSession.id);
            setSettlingSession(null);
            client.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          }}
          onUpdated={setSettlingSession}
        />
      )}
    </>
  );
}

function SessionBillDialog({
  session,
  products,
  onClose,
  onUpdated,
}: {
  session: any;
  products: any[];
  onClose: () => void;
  onUpdated: (session: any) => void;
}) {
  const client = useQueryClient();
  const createOrder = useCreateOrder();
  const updateSession = useUpdateSession();
  const [cart, setCart] = useState<Record<number, number>>({});
  const [showPayment, setShowPayment] = useState(false);
  const activeProducts = products.filter((product: any) => product.isActive);
  const addedTotal = activeProducts.reduce(
    (sum: number, product: any) =>
      sum + (cart[product.id] ?? 0) * product.price,
    0,
  );
  const changeQuantity = (id: number, amount: number) =>
    setCart((current) => {
      const quantity = Math.max(0, (current[id] ?? 0) + amount);
      if (quantity === 0) {
        const { [id]: _, ...rest } = current;
        return rest;
      }
      return { ...current, [id]: quantity };
    });
  const addProduct = (id: number) => {
    const target = window.event?.target;
    const control =
      target instanceof HTMLElement ? target.closest("span") : null;
    if (
      control?.classList.contains("rounded-full") &&
      window.event instanceof MouseEvent
    ) {
      const bounds = control.getBoundingClientRect();
      changeQuantity(
        id,
        window.event.clientX < bounds.left + bounds.width / 2 ? -1 : 1,
      );
      return;
    }
    changeQuantity(id, 1);
  };
  const saveItems = () => {
    const items = Object.entries(cart)
      .filter(([, quantity]) => quantity > 0)
      .map(([productId, quantity]) => ({
        productId: Number(productId),
        quantity,
      }));
    if (!items.length) return;
    createOrder.mutate(
      { data: { sessionId: session.id, items } },
      {
        onSuccess: (order: any) => {
          client.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          client.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          setCart({});
          onUpdated({
            ...session,
            cafeteriaOrders: [...(session.cafeteriaOrders ?? []), order],
            cafeteriaOrderCount: session.cafeteriaOrderCount + 1,
            cafeteriaTotal: session.cafeteriaTotal + order.total,
            grandTotal: session.grandTotal + order.total,
          });
        },
      },
    );
  };
  const closeSession = (paymentMethod: "cash" | "cliq") =>
    updateSession.mutate(
      { id: session.id, data: { action: "stop", paymentMethod } },
      {
        onSuccess: () => {
          client.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          client.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          client.invalidateQueries({ queryKey: getListResourcesQueryKey() });
          client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          onClose();
        },
      },
    );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/35 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl fade-up">
        <div className="flex items-start justify-between border-b border-border p-5">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Session #{session.id}
            </div>
            <h2 className="mt-1 text-xl font-extrabold">
              {session.resourceName} bill
            </h2>
          </div>
          <button
            aria-label="Close session bill"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>
        <div className="grid max-h-[70vh] overflow-y-auto md:grid-cols-[1fr_0.9fr]">
          <div className="border-b border-border p-5 md:border-b-0 md:border-r">
            <div className="text-xs font-extrabold">Add cafeteria items</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {activeProducts.map((product: any) => (
                <button
                  key={product.id}
                  onClick={() => addProduct(product.id)}
                  className="rounded-lg border border-border p-3 text-left hover:border-primary hover:bg-primary/5"
                >
                  <div className="flex items-center justify-between">
                    <Package size={15} className="text-primary" />
                    {cart[product.id] ? (
                      <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                        {cart[product.id]}
                      </span>
                    ) : (
                      <Plus size={14} className="text-muted-foreground" />
                    )}
                  </div>
                  <div className="mt-3 text-xs font-extrabold">
                    {product.name}
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {money(product.price)}
                  </div>
                </button>
              ))}
            </div>
            <button
              disabled={addedTotal === 0 || createOrder.isPending}
              onClick={saveItems}
              className="mt-4 flex w-full items-center justify-center rounded-lg bg-primary py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-40"
            >
              {createOrder.isPending
                ? "Adding..."
                : `Add ${money(addedTotal)} to bill`}
            </button>
          </div>
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-extrabold">Detailed bill</div>
              <StatusBadge status={session.status} />
            </div>
            <div className="mt-4 space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Playing time</span>
                <span>{secondsLabel(session.elapsedSeconds)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Play rate</span>
                <span>{money(session.hourlyRate)}/hr</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Play total</span>
                <span>{money(session.total)}</span>
              </div>
              <div className="border-t border-border pt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Cafeteria
              </div>
              {(session.cafeteriaOrders ?? [])
                .flatMap((order: any) => order.items)
                .map((item: any, index: number) => (
                  <div
                    key={`${item.productId}-${index}`}
                    className="flex justify-between"
                  >
                    <span>
                      {item.quantity} x {item.productName}
                    </span>
                    <span>{money(item.lineTotal)}</span>
                  </div>
                ))}
              {session.cafeteriaTotal === 0 && (
                <div className="text-muted-foreground">
                  No cafeteria items yet.
                </div>
              )}
              <div className="flex justify-between font-bold">
                <span>Cafeteria total</span>
                <span>{money(session.cafeteriaTotal)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-3 text-sm font-extrabold">
                <span>Final total</span>
                <span>{money(session.grandTotal)}</span>
              </div>
            </div>
            <div className="mt-5 border-t border-border pt-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Payment and close session
              </div>
              {showPayment ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    disabled={updateSession.isPending}
                    onClick={() => closeSession("cash")}
                    className="rounded-lg border border-border py-2.5 text-xs font-bold hover:border-primary"
                  >
                    Cash
                  </button>
                  <button
                    disabled={updateSession.isPending}
                    onClick={() => closeSession("cliq")}
                    className="rounded-lg bg-primary py-2.5 text-xs font-bold text-primary-foreground"
                  >
                    CliQ
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowPayment(true)}
                  className="mt-3 flex w-full items-center justify-center rounded-lg bg-destructive py-2.5 text-xs font-bold text-destructive-foreground"
                >
                  Close and settle {money(session.grandTotal)}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveSessionBillDialog({
  session,
  products,
  allowSettlement,
  onClose,
  onUpdated,
}: {
  session: any;
  products: any[];
  allowSettlement: boolean;
  onClose: () => void;
  onUpdated: (session: any) => void;
}) {
  const client = useQueryClient();
  const updateSession = useUpdateSession();
  const { data: resources = [] } = useListResources({
    query: { queryKey: getListResourcesQueryKey() },
  });
  const [current, setCurrent] = useState(session);
  const now = useCurrentTime();
  const [showPayment, setShowPayment] = useState(false);
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);
  const [invoiceNotes, setInvoiceNotes] = useState(session.notes ?? "");
  const [changingProduct, setChangingProduct] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [actionStep, setActionStep] = useState<
    "choices" | "extend" | "change-resource" | "details"
  >(allowSettlement ? "choices" : "details");
  const [extensionMinutes, setExtensionMinutes] = useState("30");
  const [extensionError, setExtensionError] = useState("");
  useEffect(() => {
    document.body.classList.toggle("session-cafeteria-only", !allowSettlement);
    return () => document.body.classList.remove("session-cafeteria-only");
  }, [allowSettlement]);
  useEffect(() => {
    setCurrent((previous: any) => withLiveSessionValues(previous, now));
  }, [now]);
  const quantities = (current.cafeteriaOrders ?? [])
    .flatMap((order: any) => order.items)
    .reduce(
      (total: Record<number, number>, item: any) => ({
        ...total,
        [item.productId]: (total[item.productId] ?? 0) + item.quantity,
      }),
      {},
    );
  const activeProducts = products.filter((product: any) => product.isActive);
  const categories = useMemo(
    () =>
      Array.from(
        new Set(activeProducts.map((product: any) => String(product.category ?? "Other"))),
      ).sort((first, second) => {
        const rankDifference = cafeteriaCategoryRank(first) - cafeteriaCategoryRank(second);
        return rankDifference || first.localeCompare(second);
      }),
    [activeProducts],
  );
  const visibleProducts = activeProducts.filter(
    (product: any) => categoryFilter === "all" || product.category === categoryFilter,
  );
  const changeQuantity = async (productId: number, quantityDelta: 1 | -1) => {
    setChangingProduct(productId);
    try {
      const updated = await manageApi(
        `/sessions/${current.id}/cafeteria-items`,
        "PATCH",
        { productId, quantityDelta },
      );
      setCurrent(updated);
      onUpdated(updated);
      client.invalidateQueries({ queryKey: getListSessionsQueryKey() });
      client.invalidateQueries({ queryKey: getListOrdersQueryKey() });
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Could not update item",
      );
    } finally {
      setChangingProduct(null);
    }
  };
  const closeSession = (
    paymentMethod: "cash" | "cliq",
    discountType: "amount" | "percentage" = "amount",
    discountValue = 0,
    discountReason = "",
    notes = "",
  ) =>
    updateSession.mutate(
      {
        id: current.id,
        data: {
          action: "stop",
          paymentMethod,
          discountType,
          discountValue,
          discountReason,
          notes,
        },
      } as any,
      {
        onSuccess: () => {
          client.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          client.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          client.invalidateQueries({ queryKey: getListResourcesQueryKey() });
          client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          onClose();
        },
      },
    );
  const togglePause = () =>
    updateSession.mutate(
      {
        id: current.id,
        data: { action: current.pausedAt ? "resume" : "pause" },
      },
      {
        onSuccess: (updated: any) => {
          setCurrent(updated);
          onUpdated(updated);
          client.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          client.invalidateQueries({ queryKey: getListResourcesQueryKey() });
          client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        },
      },
    );
  const extendSession = () => {
    const minutes = Number(extensionMinutes);
    if (!Number.isInteger(minutes) || minutes < 1) {
      setExtensionError("Enter a whole number of minutes.");
      return;
    }
    setExtensionError("");
    updateSession.mutate(
      { id: current.id, data: { action: "extend", durationMinutes: minutes } },
      {
        onSuccess: (updated: any) => {
          setCurrent(updated);
          onUpdated(updated);
          client.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          client.invalidateQueries({ queryKey: getListResourcesQueryKey() });
          client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          onClose();
        },
        onError: () => setExtensionError("Could not extend the session."),
      },
    );
  };
  const changeResource = (resourceId: number) =>
    updateSession.mutate(
      { id: current.id, data: { action: "change_resource", resourceId } } as any,
      {
        onSuccess: (updated: any) => {
          setCurrent(updated);
          onUpdated(updated);
          client.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          client.invalidateQueries({ queryKey: getListResourcesQueryKey() });
          client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          setActionStep("details");
        },
      },
    );
  if (allowSettlement && actionStep === "choices")
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/35 p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-details-title"
          className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl fade-up"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Session #{current.id}
              </div>
              <h2
                id="session-details-title"
                className="mt-1 text-xl font-extrabold"
              >
                Session details
              </h2>
            </div>
            <button
              aria-label="Close session details"
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            >
              <X size={18} />
            </button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Pause or extend the session, add cafeteria items, or end the table
            and collect payment.
          </p>
          <div className="mt-6 grid gap-3">
            <button
              disabled={updateSession.isPending}
              onClick={togglePause}
              className="flex items-center justify-center gap-2 rounded-lg border border-border py-3 text-sm font-bold hover:border-primary hover:bg-muted"
            >
              {current.pausedAt ? <Play size={15} /> : <Pause size={15} />}
              {current.pausedAt ? "Resume time" : "Pause time"}
            </button>
            <button
              onClick={() => setActionStep("extend")}
              className="rounded-lg border border-border py-3 text-sm font-bold hover:border-primary hover:bg-muted"
            >
              Extend time
            </button>
            <button
              disabled={Boolean(current.pausedAt) || updateSession.isPending}
              onClick={() => setActionStep("change-resource")}
              className="rounded-lg border border-border py-3 text-sm font-bold hover:border-primary hover:bg-muted disabled:opacity-50"
            >
              Change table / device
            </button>
            <button
              data-testid={`button-add-cafeteria-items-${current.id}`}
              onClick={() => setActionStep("details")}
              className="flex items-center justify-center gap-2 rounded-lg border border-primary py-3 text-sm font-bold text-primary hover:bg-primary/5"
            >
              <Coffee size={15} /> Add cafeteria items
            </button>
            <button
              onClick={() => setActionStep("details")}
              className="rounded-lg bg-destructive py-3 text-sm font-bold text-destructive-foreground"
            >
              End table and show bill
            </button>
          </div>
        </div>
      </div>
    );
  if (allowSettlement && actionStep === "change-resource")
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/35 p-4">
        <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl fade-up">
          <div className="flex items-start justify-between">
            <div>
              <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Session #{current.id}</div>
              <h2 className="mt-1 text-xl font-extrabold">Change table / device</h2>
            </div>
            <button aria-label="Back to session details" onClick={() => setActionStep("choices")} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X size={18} /></button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Time already used stays on {current.resourceName}; the new resource starts a separate line at its own hourly rate.</p>
          <div className="mt-5 grid gap-2">
            {(resources as any[]).filter((resource) => resource.id !== current.resourceId && !resource.activeSessionId).map((resource) => (
              <button key={resource.id} disabled={updateSession.isPending} onClick={() => changeResource(resource.id)} className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-left text-sm font-bold hover:border-primary hover:bg-muted disabled:opacity-50">
                <span>{resource.name} <span className="text-xs font-normal capitalize text-muted-foreground">({resource.kind})</span></span>
                <span className="text-xs text-primary">{money(resource.hourlyRate)}/hr</span>
              </button>
            ))}
            {(resources as any[]).filter((resource) => resource.id !== current.resourceId && !resource.activeSessionId).length === 0 && <p className="text-sm text-muted-foreground">No other available tables or devices.</p>}
          </div>
        </div>
      </div>
    );
  if (allowSettlement && actionStep === "extend")
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/35 p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="extend-session-title"
          className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl fade-up"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Session #{current.id}
              </div>
              <h2
                id="extend-session-title"
                className="mt-1 text-xl font-extrabold"
              >
                Extend time
              </h2>
            </div>
            <button
              aria-label="Back to session details"
              onClick={() => setActionStep("choices")}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            >
              <X size={18} />
            </button>
          </div>
          <label className="mt-5 block text-xs font-bold">
            Minutes
            <input
              autoFocus
              type="number"
              min="1"
              step="1"
              value={extensionMinutes}
              onChange={(event) => setExtensionMinutes(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
            />
          </label>
          {extensionError && (
            <p
              role="alert"
              className="mt-3 text-xs font-semibold text-destructive"
            >
              {extensionError}
            </p>
          )}
          <button
            disabled={updateSession.isPending}
            onClick={extendSession}
            className="mt-6 flex w-full items-center justify-center rounded-lg bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {updateSession.isPending ? "Extending..." : "Confirm extension"}
          </button>
        </div>
      </div>
    );
  if (showDiscountDialog)
    return (
      <SettlementDialog
        invoice={{
          label: `${current.resourceName} bill`,
          subtotal: current.subtotal ?? current.grandTotal,
        }}
        saving={updateSession.isPending}
        initialNotes={invoiceNotes}
        onClose={() => setShowDiscountDialog(false)}
        onConfirm={closeSession}
      />
    );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/35 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between border-b border-border p-5">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Session #{current.id}
            </div>
            <h2 className="mt-1 text-xl font-extrabold">
              {current.resourceName} bill
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>
        <div className="grid max-h-[70vh] overflow-y-auto md:grid-cols-[1fr_0.9fr]">
          <div className="border-b border-border p-5 md:border-b-0 md:border-r">
            <div className="flex items-center justify-between">
              <div className="text-xs font-extrabold">Cafeteria items</div>
              <span className="text-[10px] text-muted-foreground">{visibleProducts.length} items</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                aria-pressed={categoryFilter === "all"}
                onClick={() => setCategoryFilter("all")}
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${categoryFilter === "all" ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground"}`}
              >
                All
              </button>
              {categories.map((category) => (
                <button
                  key={category}
                  aria-pressed={categoryFilter === category}
                  onClick={() => setCategoryFilter(category)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${categoryFilter === category ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {category}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {visibleProducts.map((product: any) => {
                  const quantity = quantities[product.id] ?? 0;
                  return (
                    <div
                      key={product.id}
                      className="rounded-lg border border-border p-3"
                    >
                      <div className="flex items-center justify-between">
                        <Package size={15} className="text-primary" />
                        <div className="flex items-center overflow-hidden rounded-md border border-border">
                          <button
                            disabled={
                              quantity === 0 || changingProduct === product.id
                            }
                            onClick={() => changeQuantity(product.id, -1)}
                            aria-label={`Decrease ${product.name}`}
                            className="px-2 py-1 text-sm font-bold disabled:opacity-30"
                          >
                            −
                          </button>
                          <span className="min-w-7 border-x border-border px-1 py-1 text-center text-xs font-extrabold">
                            {quantity}
                          </span>
                          <button
                            disabled={changingProduct === product.id}
                            onClick={() => changeQuantity(product.id, 1)}
                            aria-label={`Increase ${product.name}`}
                            className="px-2 py-1 text-sm font-bold text-primary disabled:opacity-30"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 text-xs font-extrabold">
                        {product.name}
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {money(product.price)}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-extrabold">Detailed bill</div>
              <StatusBadge status={current.status} />
            </div>
            <div className="mt-4 space-y-3 text-xs">
              <ResourceUsageBillLines session={current} />
              <div className="flex justify-between font-bold">
                <span>Play total</span>
                <span>{money(current.total)}</span>
              </div>
              <div className="border-t border-border pt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Cafeteria
              </div>
              {Object.entries(quantities).map(([productId, quantity]) => {
                const product = products.find(
                  (item: any) => item.id === Number(productId),
                );
                return (
                  <div key={productId} className="flex justify-between">
                    <span>
                      {quantity} x {product?.name}
                    </span>
                    <span>
                      {money(Number(quantity) * (product?.price ?? 0))}
                    </span>
                  </div>
                );
              })}
              {current.cafeteriaTotal === 0 && (
                <div className="text-muted-foreground">
                  No cafeteria items yet.
                </div>
              )}
              <div className="flex justify-between font-bold">
                <span>Cafeteria total</span>
                <span>{money(current.cafeteriaTotal)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-3 text-sm font-extrabold">
                <span>Final total</span>
                <span>{money(current.grandTotal)}</span>
              </div>
            </div>
            <label className="mt-5 block border-t border-border pt-4 text-xs font-bold">
              Invoice notes <span className="font-normal text-muted-foreground">(optional)</span>
              <textarea
                value={invoiceNotes}
                onChange={(event) => setInvoiceNotes(event.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Add an optional note to this invoice"
                className="mt-1.5 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal outline-none focus:border-primary"
              />
            </label>
            <div className="mt-5 border-t border-border pt-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Payment and close session
              </div>
              {showPayment ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    disabled={updateSession.isPending}
                    onClick={() => closeSession("cash", "amount", 0, "", invoiceNotes.trim())}
                    className="rounded-lg border border-border py-2.5 text-xs font-bold"
                  >
                    Cash
                  </button>
                  <button
                    disabled={updateSession.isPending}
                    onClick={() => closeSession("cliq", "amount", 0, "", invoiceNotes.trim())}
                    className="rounded-lg bg-primary py-2.5 text-xs font-bold text-primary-foreground"
                  >
                    CliQ
                  </button>
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setShowDiscountDialog(true)}
                    className="rounded-lg border border-primary py-2.5 text-xs font-bold text-primary hover:bg-primary/5"
                  >
                    Apply discount
                  </button>
                  <button
                    onClick={() => setShowPayment(true)}
                    className="rounded-lg bg-destructive py-2.5 text-xs font-bold text-destructive-foreground"
                  >
                    Close &amp; settle {money(current.grandTotal)}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompletedSessionInvoiceDialog({
  session,
  onClose,
}: {
  session: any;
  onClose: () => void;
}) {
  const invoiceTotal = Math.max(
    0,
    (session.subtotal ?? session.grandTotal ?? 0) - (session.discountAmount ?? 0),
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/35 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="completed-session-invoice-title"
        className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-2xl fade-up"
      >
        <div className="flex items-start justify-between border-b border-border p-5">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Paid invoice - Session #{session.id}
            </div>
            <h2 id="completed-session-invoice-title" className="mt-1 text-xl font-extrabold">
              {session.resourceName} bill
            </h2>
          </div>
          <button
            aria-label="Close invoice"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto p-5 text-xs">
          <div className="rounded-md border border-border bg-muted/35 p-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Started</span>
              <span>{dateLabel(session.startedAt)} {timeLabel(session.startedAt)}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Paid by</span>
              <span className="font-bold">{session.completedBy ?? "System"}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Payment</span>
              <span className="font-bold capitalize">{session.paymentMethod ?? session.paymentStatus ?? "Settled"}</span>
            </div>
          </div>
          <ResourceUsageBillLines session={session} />
          <div className="flex justify-between font-bold">
            <span>Play total</span>
            <span>{money(session.total)}</span>
          </div>
          <div className="border-t border-border pt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Cafeteria
          </div>
          {(session.cafeteriaOrders ?? [])
            .flatMap((order: any) => order.items)
            .map((item: any, index: number) => (
              <div key={`${item.productId}-${index}`} className="flex justify-between">
                <span>{item.quantity} x {item.productName}</span>
                <span>{money(item.lineTotal)}</span>
              </div>
            ))}
          {session.cafeteriaTotal === 0 && (
            <div className="text-muted-foreground">No cafeteria items.</div>
          )}
          <div className="flex justify-between font-bold">
            <span>Cafeteria total</span>
            <span>{money(session.cafeteriaTotal)}</span>
          </div>
          {(session.discountAmount ?? 0) > 0 && (
            <div className="flex justify-between text-destructive">
              <span>Discount</span>
              <span>-{money(session.discountAmount)}</span>
            </div>
          )}
          {session.notes && (
            <div className="rounded-md bg-muted p-3 text-xs">
              <span className="font-bold">Invoice notes: </span>
              {session.notes}
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-3 text-sm font-extrabold">
            <span>Invoice total</span>
            <span>{money(invoiceTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SessionsPage() {
  const [filter, setFilter] = useState<"active" | "completed">("active");
  const { data: resources = [] } = useListResources({
    query: { queryKey: getListResourcesQueryKey() },
  });
  const { data: products = [] } = useListProducts({
    query: { queryKey: getListProductsQueryKey() },
  });
  const {
    data: sessions = [],
    isLoading,
    isError,
    refetch,
  } = useListSessions(
    { status: filter },
    {
      query: {
        queryKey: getListSessionsQueryKey({ status: filter }),
        refetchInterval: 30000,
      },
    },
  );
  const update = useUpdateSession();
  const client = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [completedInvoice, setCompletedInvoice] = useState<any | null>(null);
  const stop = (id: number, paymentMethod: "cash" | "cliq") =>
    update.mutate(
      { id, data: { action: "stop", paymentMethod } },
      {
        onSuccess: () => {
          client.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          client.invalidateQueries({ queryKey: getListResourcesQueryKey() });
          setSettlingId(null);
        },
      },
    );
  const [billSession, setBillSession] = useState<any | null>(null);
  const [billAllowsSettlement, setBillAllowsSettlement] = useState(false);
  const [settlingId, setSettlingIdState] = useState<number | null>(null);
  const openSessionBill = (session: any, allowSettlement = false) => {
    if (
      session.status === "active" ||
      session.status === "paused" ||
      session.status === "overdue"
    ) {
      setBillSession(session);
      setBillAllowsSettlement(allowSettlement);
    } else if (session.status === "completed") {
      setCompletedInvoice(session);
    }
  };
  const setSettlingId = (id: number | null) => {
    if (id !== null) {
      const session = sessions.find((item: any) => item.id === id);
      if (session) openSessionBill(session, true);
    }
    setSettlingIdState(null);
  };
  return (
    <>
      <PageHeading
        eyebrow="Operations / session ledger"
        title="Sessions"
        description="Start, monitor, and close every playing session."
        action={
          <button
            data-testid="button-new-session"
            onClick={() => setDialogOpen(true)}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"
          >
            <Plus size={16} /> New session
          </button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["active", "completed"] as const).map((item) => (
          <button
            key={item}
            data-testid={`button-filter-${item}`}
            onClick={() => setFilter(item)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold capitalize ${filter === item ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:text-foreground"}`}
          >
            {item}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {sessions.length} records
        </span>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {isLoading ? (
          <TableSkeleton />
        ) : isError ? (
          <InlineError onRetry={refetch} />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={TimerReset}
            title="No sessions in this view"
            text="Sessions will appear here as soon as play starts."
            action={() => setDialogOpen(true)}
          />
        ) : (
          <div className="mobile-scroll scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[880px] text-left">
              <thead className="border-b border-border bg-muted/50">
                <tr className="text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
                  <th className="px-5 py-3.5">Resource</th>
                  <th className="px-4 py-3.5">Started</th>
                  <th className="px-4 py-3.5">Mode</th>
                  <th className="px-4 py-3.5">Duration</th>
                  <th className="px-4 py-3.5">Time remaining</th>
                  <th className="px-4 py-3.5">Total</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sessions.map((session: any) => {
                  const isOpen =
                    session.status === "active" ||
                    session.status === "paused" ||
                    session.status === "overdue";
                  return (
                    <tr
                      key={session.id}
                      data-testid={`row-session-${session.id}`}
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        if (!(event.target as HTMLElement).closest("button"))
                          openSessionBill(session, true);
                      }}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" || event.key === " "
                        ) {
                          event.preventDefault();
                          openSessionBill(session, true);
                        }
                      }}
                      className="cursor-pointer text-sm hover:bg-muted/35"
                    >
                      <td className="px-5 py-3.5">
                        <div className="font-extrabold">
                          {session.resourceName}
                        </div>
                        <div className="mt-0.5 text-[10px] capitalize text-muted-foreground">
                          {session.resourceKind} - #{session.id}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground">
                        {dateLabel(session.startedAt)} -{" "}
                        {timeLabel(session.startedAt)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="rounded bg-muted px-2 py-1 text-[10px] font-bold capitalize">
                          {session.mode}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 mono tabular text-xs">
                        {isOpen
                          ? secondsLabel(session.elapsedSeconds)
                          : `${session.durationMinutes ?? 0} min`}
                      </td>
                      <td
                        className={`px-4 py-3.5 mono tabular text-xs font-bold ${session.status === "overdue" ? "text-red-700" : "text-primary"}`}
                      >
                        {session.endsAt
                          ? secondsLabel(session.remainingSeconds)
                          : "Open"}
                      </td>
                      <td className="px-4 py-3.5 tabular text-xs font-extrabold">
                        {money(session.total)}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={session.status} />
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {isOpen ? (
                          <button
                            disabled={update.isPending}
                            data-testid={`button-stop-session-${session.id}`}
                            onClick={() => openSessionBill(session, true)}
                            className="rounded-md border border-border px-2.5 py-1.5 text-[11px] font-bold hover:border-primary hover:text-primary"
                          >
                            Session details
                          </button>
                        ) : (
                          <button
                            data-testid={`button-view-invoice-${session.id}`}
                            onClick={() => setCompletedInvoice(session)}
                            className="rounded-md border border-border px-2.5 py-1.5 text-[11px] font-bold hover:border-primary hover:text-primary"
                          >
                            View invoice
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <SessionDialog
        resources={resources as any[]}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
      {billSession && (
        <LiveSessionBillDialog
          session={billSession}
          products={products as any[]}
          allowSettlement={billAllowsSettlement}
          onClose={() => {
            setBillSession(null);
            setBillAllowsSettlement(false);
          }}
          onUpdated={setBillSession}
        />
      )}
      {completedInvoice && (
        <CompletedSessionInvoiceDialog
          session={completedInvoice}
          onClose={() => setCompletedInvoice(null)}
        />
      )}
    </>
  );
}

function OpenCounterOrderDialog() {
  const [order, setOrder] = useState<any | null>(null);
  const [changing, setChanging] = useState<number | null>(null);
  const client = useQueryClient();
  const { data: products = [] } = useListProducts({
    query: { queryKey: getListProductsQueryKey() },
  });
  useEffect(() => {
    const open = (event: Event) => setOrder((event as CustomEvent).detail);
    window.addEventListener("open-counter-order", open);
    return () => window.removeEventListener("open-counter-order", open);
  }, []);
  if (!order) return null;
  const quantities = order.items.reduce(
    (all: Record<number, number>, item: any) => ({
      ...all,
      [item.productId]: item.quantity,
    }),
    {},
  );
  const change = async (productId: number, quantityDelta: 1 | -1) => {
    setChanging(productId);
    try {
      const updated = await manageApi(`/orders/${order.id}/items`, "PATCH", {
        productId,
        quantityDelta,
      });
      setOrder(updated);
      client.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Could not update order",
      );
    } finally {
      setChanging(null);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/35 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between border-b border-border p-5">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Open order #{order.id}
            </div>
            <h2 className="mt-1 text-xl font-extrabold">
              Edit cafeteria order
            </h2>
          </div>
          <button
            onClick={() => setOrder(null)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>
        <div className="grid max-h-[65vh] grid-cols-2 gap-2 overflow-y-auto p-5 sm:grid-cols-3">
          {products
            .filter((product: any) => product.isActive)
            .map((product: any) => {
              const quantity = quantities[product.id] ?? 0;
              return (
                <div
                  key={product.id}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex items-center justify-between">
                    <Package size={15} className="text-primary" />
                    <div className="flex items-center overflow-hidden rounded-md border border-border">
                      <button
                        disabled={!quantity || changing === product.id}
                        onClick={() => change(product.id, -1)}
                        className="px-2 py-1 text-sm font-bold disabled:opacity-30"
                      >
                        −
                      </button>
                      <span className="min-w-7 border-x border-border px-1 py-1 text-center text-xs font-extrabold">
                        {quantity}
                      </span>
                      <button
                        disabled={changing === product.id}
                        onClick={() => change(product.id, 1)}
                        className="px-2 py-1 text-sm font-bold text-primary disabled:opacity-30"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 text-xs font-extrabold">
                    {product.name}
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {money(product.price)}
                  </div>
                </div>
              );
            })}
        </div>
        <div className="flex items-center justify-between border-t border-border p-5">
          <span className="text-xs font-bold">Order total</span>
          <span className="tabular text-lg font-extrabold">
            {money(order.total)}
          </span>
        </div>
      </div>
    </div>
  );
}

function CafeteriaPage() {
  const client = useQueryClient();
  const { data: products = [], isLoading: productsLoading } = useListProducts({
    query: { queryKey: getListProductsQueryKey() },
  });
  const { data: orders = [], isLoading: ordersLoading } = useListOrders(
    undefined,
    { query: { queryKey: getListOrdersQueryKey(), refetchInterval: 30000 } },
  );
  const { data: sessions = [] } = useListSessions(
    { status: "active" },
    { query: { queryKey: getListSessionsQueryKey({ status: "active" }) } },
  );
  const createProduct = useCreateProduct();
  const createOrder = useCreateOrder();
  const payOrder = usePayOrder();
  const [showProduct, setShowProduct] = useState(false);
  const [productForm, setProductForm] = useState({
    name: "",
    category: "Drinks",
    price: "",
  });
  const [cart, setCart] = useState<Record<number, number>>({});
  useEffect(() => {
    const openOrder = (event: MouseEvent) => {
      const row =
        event.target instanceof HTMLElement
          ? event.target.closest('[data-testid^="row-order-"]')
          : null;
      if (
        !row ||
        (event.target instanceof HTMLElement && event.target.closest("button"))
      )
        return;
      const id = Number(
        row.getAttribute("data-testid")?.replace("row-order-", ""),
      );
      const order = orders.find((item: any) => item.id === id);
      if (order?.status === "open" && !order.sessionId)
        window.dispatchEvent(
          new CustomEvent("open-counter-order", { detail: order }),
        );
    };
    document.addEventListener("click", openOrder);
    return () => document.removeEventListener("click", openOrder);
  }, [orders]);
  const activeProducts = products.filter((p: any) => p.isActive);
  const openOrders = orders.filter((o: any) => o.status === "open");
  const cartTotal = activeProducts.reduce(
    (sum: number, p: any) => sum + (cart[p.id] ?? 0) * p.price,
    0,
  );
  const addToCart = (id: number) =>
    setCart((old) => ({ ...old, [id]: (old[id] ?? 0) + 1 }));
  const submitProduct = () =>
    createProduct.mutate(
      {
        data: {
          name: productForm.name,
          category: productForm.category,
          price: Number(productForm.price),
        },
      },
      {
        onSuccess: () => {
          client.invalidateQueries({ queryKey: getListProductsQueryKey() });
          setProductForm({ name: "", category: "Drinks", price: "" });
          setShowProduct(false);
        },
      },
    );
  const submitOrder = () => {
    const items = Object.entries(cart)
      .filter(([, quantity]) => quantity > 0)
      .map(([productId, quantity]) => ({
        productId: Number(productId),
        quantity,
      }));
    if (!items.length) return;
    const options = sessions
      .map((session: any) => `#${session.id} ${session.resourceName}`)
      .join(", ");
    const selected = window.prompt(
      `Attach this order to a session? Enter its number, or leave blank for a counter order. Available: ${options}`,
    );
    const sessionId = selected?.trim() ? Number(selected) : null;
    if (
      sessionId !== null &&
      !sessions.some((session: any) => session.id === sessionId)
    )
      return;
    createOrder.mutate(
      { data: { items, sessionId } },
      {
        onSuccess: () => {
          client.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          client.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          setCart({});
        },
      },
    );
  };
  const settle = (id: number, paymentMethod: "cash" | "cliq") =>
    payOrder.mutate(
      { id, data: { paymentMethod } },
      {
        onSuccess: () => {
          client.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        },
      },
    );
  return (
    <>
      <PageHeading
        eyebrow="Cafeteria / till"
        title="Cafeteria"
        description="Build orders quickly, then close the till with confidence."
        action={
          <button
            data-testid="button-add-product"
            onClick={() => setShowProduct(true)}
            className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-bold hover:bg-muted"
          >
            <Plus size={16} /> Add product
          </button>
        }
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-extrabold">Quick order</h2>
            <span className="text-xs text-muted-foreground">
              {activeProducts.length} active items
            </span>
          </div>
          {productsLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="h-28 animate-pulse rounded-xl bg-muted" />
              <div className="h-28 animate-pulse rounded-xl bg-muted" />
              <div className="h-28 animate-pulse rounded-xl bg-muted" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {activeProducts.map((product: any) => (
                <button
                  key={product.id}
                  data-testid={`button-add-product-${product.id}`}
                  onClick={() => addToCart(product.id)}
                  className="group rounded-xl border border-border bg-card p-4 text-left hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20 text-amber-800">
                      <Package size={16} />
                    </div>
                    {cart[product.id] ? (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                        {cart[product.id]}
                      </span>
                    ) : (
                      <Plus
                        size={15}
                        className="text-muted-foreground opacity-0 group-hover:opacity-100"
                      />
                    )}
                  </div>
                  <div className="mt-4 text-xs font-extrabold">
                    {product.name}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {product.category} ·{" "}
                    <span className="font-bold text-foreground">
                      {money(product.price)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-primary/20 bg-primary p-5 text-primary-foreground">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-extrabold">Current order</h2>
              <p className="mt-1 text-[11px] text-primary-foreground/60">
                {Object.values(cart).reduce((a, b) => a + b, 0)} items selected
              </p>
            </div>
            <ReceiptText size={18} className="text-accent" />
          </div>
          <div className="mt-6 min-h-[112px] space-y-2">
            {activeProducts
              .filter((p: any) => cart[p.id])
              .map((p: any) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-xs"
                >
                  <span>
                    {cart[p.id]} × {p.name}
                  </span>
                  <span className="tabular font-bold">
                    {money(cart[p.id] * p.price)}
                  </span>
                </div>
              ))}
            {cartTotal === 0 && (
              <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-primary-foreground/20 text-xs text-primary-foreground/45">
                Tap a product to begin
              </div>
            )}
          </div>
          <div className="mt-4 flex items-end justify-between border-t border-primary-foreground/15 pt-3">
            <span className="text-xs text-primary-foreground/60">Total</span>
            <span className="tabular text-2xl font-extrabold">
              {money(cartTotal)}
            </span>
          </div>
          <button
            disabled={cartTotal === 0 || createOrder.isPending}
            data-testid="button-save-order"
            onClick={submitOrder}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-xs font-extrabold text-primary hover:opacity-90 disabled:opacity-40"
          >
            {createOrder.isPending ? "Saving…" : "Save open order"}
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <section className="mt-8">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-sm font-extrabold">Open orders</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Unpaid tickets still on the floor
            </p>
          </div>
          <span className="rounded-full bg-accent/20 px-2.5 py-1 text-[10px] font-bold text-amber-800">
            {openOrders.length} open
          </span>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {ordersLoading ? (
            <TableSkeleton />
          ) : openOrders.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="The counter is clear"
              text="New open orders will appear here."
            />
          ) : (
            <div className="divide-y divide-border">
              {openOrders.map((order: any) => (
                <div
                  key={order.id}
                  data-testid={`row-order-${order.id}`}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/20 text-amber-800">
                      <ReceiptText size={15} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold">
                        Order #{order.id}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {order.items
                          .map((i: any) => `${i.quantity} × ${i.productName}`)
                          .join(" · ")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-5 sm:justify-end">
                    <div className="text-right">
                      <div className="tabular text-sm font-extrabold">
                        {money(order.total)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {timeLabel(order.createdAt)}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        disabled={payOrder.isPending}
                        data-testid={`button-pay-cash-${order.id}`}
                        onClick={() => settle(order.id, "cash")}
                        className="rounded-md border border-border px-2.5 py-1.5 text-[10px] font-bold hover:border-primary"
                      >
                        Cash
                      </button>
                      <button
                        disabled={payOrder.isPending}
                        data-testid={`button-pay-cliq-${order.id}`}
                        onClick={() => settle(order.id, "cliq")}
                        className="rounded-md bg-primary px-2.5 py-1.5 text-[10px] font-bold text-primary-foreground hover:opacity-90"
                      >
                        CliQ
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      {showProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/35 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl fade-up">
            <div className="flex items-start justify-between">
              <div>
                <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Catalogue
                </div>
                <h2 className="mt-1 text-xl font-extrabold">Add product</h2>
              </div>
              <button
                aria-label="Close product dialog"
                data-testid="button-close-product-dialog"
                onClick={() => setShowProduct(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <label className="col-span-2 text-xs font-bold">
                Product name
                <input
                  data-testid="input-product-name"
                  value={productForm.name}
                  onChange={(e) =>
                    setProductForm({ ...productForm, name: e.target.value })
                  }
                  className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-bold">
                Category
                <input
                  data-testid="input-product-category"
                  value={productForm.category}
                  onChange={(e) =>
                    setProductForm({ ...productForm, category: e.target.value })
                  }
                  className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-bold">
                Price
                <input
                  data-testid="input-product-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={productForm.price}
                  onChange={(e) =>
                    setProductForm({ ...productForm, price: e.target.value })
                  }
                  className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
                />
              </label>
            </div>
            <button
              disabled={createProduct.isPending || !productForm.name}
              data-testid="button-confirm-product"
              onClick={submitProduct}
              className="mt-6 w-full rounded-lg bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {createProduct.isPending ? "Adding…" : "Add to catalogue"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function PaidInvoiceEditDialog({
  invoice,
  products,
  onClose,
  onSaved,
}: {
  invoice: any;
  products: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<any[]>(() =>
    invoice.invoiceType === "session"
      ? (invoice.cafeteriaOrders ?? []).flatMap((order: any) => order.items ?? [])
      : invoice.items ?? [],
  );
  const [category, setCategory] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState(invoice.paymentMethod === "cliq" ? "cliq" : "cash");
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [discount, setDiscount] = useState(String(invoice.discountAmount ?? 0));
  const [discountReason, setDiscountReason] = useState(invoice.discountReason ?? "");
  const [targetTotal, setTargetTotal] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const activeProducts = products.filter((product: any) => product.isActive);
  const categories = Array.from(new Set(activeProducts.map((product: any) => product.category))).sort() as string[];
  const visibleProducts = activeProducts.filter((product: any) => category === "all" || product.category === category);
  const quantityFor = (productId: number) => items.find((item) => item.productId === productId)?.quantity ?? 0;
  const changeQuantity = (product: any, delta: 1 | -1) => setItems((current) => {
    const existing = current.find((item) => item.productId === product.id);
    if (!existing && delta < 0) return current;
    if (!existing) return [...current, { productId: product.id, productName: product.name, quantity: 1, unitPrice: product.price }];
    if (existing.quantity + delta <= 0) return current.filter((item) => item.productId !== product.id);
    return current.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + delta } : item);
  });
  const cafeteriaTotal = moneySum(items.map((item) => Number(item.quantity) * Number(item.unitPrice)));
  const playTotal = invoice.invoiceType === "session" ? Number(invoice.total ?? 0) : 0;
  const discountAmount = Number(discount || 0);
  const calculatedTotal = Math.max(0, moneySum([playTotal, cafeteriaTotal, -discountAmount]));
  const finalTotal = targetTotal === "" ? calculatedTotal : Number(targetTotal);
  const save = async () => {
    if (!reason.trim()) { setError("A reason for this edit is required."); return; }
    if (discountAmount > 0 && !discountReason.trim()) { setError("A discount reason is required."); return; }
    if (targetTotal !== "" && (!Number.isFinite(Number(targetTotal)) || Number(targetTotal) < 0)) { setError("Correct final total must be a non-negative number."); return; }
    setConfirming(true);
  };
  const confirmSave = async () => {
    setConfirming(false);
    setSaving(true); setError("");
    try {
      await manageApi(`/reports/invoices/${invoice.invoiceType === "session" ? "session" : "order"}/${invoice.id}/adjustments`, "PATCH", {
        paymentMethod, notes, discountType: "amount", discountValue: discountAmount,
        discountReason: discountReason.trim(), reason: reason.trim(),
        targetTotal: targetTotal || undefined,
        items: items.map((item) => ({ productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice })),
      });
      onSaved();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Could not save invoice changes"); }
    finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-primary/35 p-4">
    <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
      <div className="flex items-start justify-between border-b border-border p-5"><div><div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Edit paid bill</div><h2 className="mt-1 text-xl font-extrabold">{invoice.resourceName ?? invoice.name ?? `Cafeteria order #${invoice.id}`}</h2></div><button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X size={18} /></button></div>
      <div className="grid max-h-[70vh] overflow-y-auto md:grid-cols-[1fr_0.9fr]">
        <div className="border-b border-border p-5 md:border-b-0 md:border-r"><div className="flex items-center justify-between"><div className="text-xs font-extrabold">Cafeteria items</div><span className="text-[10px] text-muted-foreground">{visibleProducts.length} items</span></div><div className="mt-3 flex flex-wrap gap-1.5"><button onClick={() => setCategory("all")} className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${category === "all" ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>All</button>{categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${category === item ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>{item}</button>)}</div><div className="mt-3 grid grid-cols-2 gap-2">{visibleProducts.map((product: any) => { const quantity = quantityFor(product.id); return <div key={product.id} className="rounded-lg border border-border p-3"><div className="flex items-center justify-between"><Package size={15} className="text-primary"/><div className="flex overflow-hidden rounded-md border border-border"><button onClick={() => changeQuantity(product, -1)} disabled={!quantity} className="px-2 py-1 text-sm font-bold disabled:opacity-30">−</button><span className="min-w-7 border-x border-border px-1 py-1 text-center text-xs font-extrabold">{quantity}</span><button onClick={() => changeQuantity(product, 1)} className="px-2 py-1 text-sm font-bold text-primary">+</button></div></div><div className="mt-3 text-xs font-extrabold">{product.name}</div><div className="mt-1 text-[10px] text-muted-foreground">{money(product.price)}</div></div>; })}</div></div>
        <div className="p-5"><div className="text-xs font-extrabold">Detailed bill</div><div className="mt-4 space-y-3 text-xs">{invoice.invoiceType === "session" && <><ResourceUsageBillLines session={invoice}/><div className="flex justify-between font-bold"><span>Play total</span><span>{money(playTotal)}</span></div></>}<div className="border-t border-border pt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Cafeteria</div>{items.map((item) => <div key={item.productId} className="flex justify-between"><span>{item.quantity} x {item.productName}</span><span>{money(item.quantity * item.unitPrice)}</span></div>)}<div className="flex justify-between font-bold"><span>Cafeteria total</span><span>{money(cafeteriaTotal)}</span></div><div className="flex justify-between border-t border-border pt-3 text-sm font-extrabold"><span>Final total</span><span>{money(finalTotal)}</span></div></div><label className="mt-5 block border-t border-border pt-4 text-xs font-bold">Invoice notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={3} className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal" /></label><div className="mt-4 grid grid-cols-2 gap-2"><label className="text-xs font-bold">Payment<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"><option value="cash">Cash</option><option value="cliq">CliQ</option></select></label><label className="text-xs font-bold">Discount<input type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" /></label></div>{discountAmount > 0 && <input value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} placeholder="Discount reason" className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />}<label className="mt-3 block text-xs font-bold">Correct final total <span className="font-normal text-muted-foreground">(optional)</span><input type="number" min="0" step="0.01" value={targetTotal} onChange={(event) => setTargetTotal(event.target.value)} placeholder={String(calculatedTotal)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" /></label><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for this edit (required)" maxLength={500} className="mt-3 min-h-16 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />{error && <p className="mt-2 text-xs font-semibold text-destructive">{error}</p>}<div className="mt-3 grid grid-cols-2 gap-2"><button onClick={onClose} disabled={saving} className="rounded-lg border border-border py-2.5 text-xs font-bold">Cancel</button><button onClick={save} disabled={saving} className="rounded-lg bg-destructive py-2.5 text-xs font-bold text-destructive-foreground">{saving ? "Saving..." : `Save bill ${money(finalTotal)}`}</button></div></div>
      </div>
    </div>
    {confirming && <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/45 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl"><div className="text-base font-extrabold">Save invoice changes?</div><p className="mt-2 text-xs text-muted-foreground">The bill total, payment method, and reports will be updated.</p><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => setConfirming(false)} className="rounded-lg border border-border py-2.5 text-xs font-bold">Cancel</button><button type="button" onClick={confirmSave} className="rounded-lg bg-primary py-2.5 text-xs font-bold text-primary-foreground">Confirm save</button></div></div></div>}
  </div>;
}

function InvoicesPage() {
  const client = useQueryClient();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const requestedDate = useMemo(
    () => new URLSearchParams(search).get("date"),
    [search],
  );
  const [range, setRange] = useState<"daily" | "weekly" | "monthly">("daily");
  const [paymentFilter, setPaymentFilter] = useState<"all" | "cash" | "cliq">(
    "all",
  );
  const [invoiceTypeFilter, setInvoiceTypeFilter] = useState<
    "all" | "session" | "cafeteria"
  >("all");
  const [invoiceStateFilter, setInvoiceStateFilter] = useState<
    "active" | "adjusted" | "deleted"
  >("active");
  const [selected, setSelected] = useState<any | null>(null);
  const [billMode, setBillMode] = useState<"menu" | "view" | "edit" | "delete">("menu");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [adjustmentError, setAdjustmentError] = useState("");
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(false);
  const [editPaymentMethod, setEditPaymentMethod] = useState<"cash" | "cliq">("cash");
  const [editNotes, setEditNotes] = useState("");
  const [editDiscount, setEditDiscount] = useState("");
  const [editDiscountReason, setEditDiscountReason] = useState("");
  const [editFinalPrice, setEditFinalPrice] = useState("");
  const [editPriceReason, setEditPriceReason] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editItems, setEditItems] = useState<any[]>([]);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingInvoice, setDeletingInvoice] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => requestedDate ?? today());
  useEffect(() => {
    if (requestedDate) {
      setSelectedDate(requestedDate);
      setRange("daily");
    }
  }, [requestedDate]);
  const { data: sessions = [], isLoading: sessionsLoading } = useListSessions(
    { status: "completed" },
    { query: { queryKey: getListSessionsQueryKey({ status: "completed" }) } },
  );
  const { data: orders = [], isLoading: ordersLoading } = useListOrders(
    undefined,
    { query: { queryKey: getListOrdersQueryKey() } },
  );
  const { data: products = [] } = useListProducts({
    query: { queryKey: getListProductsQueryKey() },
  });
  const period = useMemo(() => {
    const selected = new Date(`${selectedDate}T00:00:00`);
    const start = new Date(selected);
    const end = new Date(selected);
    if (range === "weekly") {
      // Club weeks run Sunday through Saturday, not a rolling seven-day period.
      start.setDate(selected.getDate() - selected.getDay());
      end.setDate(start.getDate() + 6);
    }
    if (range === "monthly") start.setDate(1);
    return {
      start: dateKey(start),
      end: dateKey(end),
    };
  }, [range, selectedDate]);
  const isInPeriod = (value: string) => {
    const date = reportDateFor(value);
    return date !== null && date >= period.start && date <= period.end;
  };
  const allInvoices = [
    ...sessions
      .filter((session: any) =>
        session.status === "completed" &&
        session.paymentStatus === "paid" &&
        Boolean(session.paymentMethod) &&
        isInPeriod(session.endedAt ?? session.startedAt),
      )
      .map((session: any) => ({
        ...session,
        invoiceType: "session",
        invoiceDate: session.endedAt ?? session.startedAt,
        invoiceTotal: session.grandTotal ?? Math.max(0, (session.subtotal ?? (session.total ?? 0) + (session.cafeteriaTotal ?? 0)) - (session.discountAmount ?? 0)),
      })),
    ...orders
      .filter(
        (order: any) =>
          !order.sessionId &&
          order.status === "paid" &&
          Boolean(order.paymentMethod) &&
          isInPeriod(order.createdAt),
      )
      .map((order: any) => ({
        ...order,
        invoiceType: "cafeteria",
        invoiceDate: order.createdAt,
        invoiceTotal: order.total ?? Math.max(0, (order.subtotal ?? 0) - (order.discountAmount ?? 0)),
      })),
  ].sort(
    (a: any, b: any) =>
      new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime(),
  );
  const invoices = allInvoices.filter(
    (invoice: any) =>
      (paymentFilter === "all" || invoice.paymentMethod === paymentFilter) &&
      (invoiceTypeFilter === "all" ||
        invoice.invoiceType === invoiceTypeFilter) &&
      (invoiceStateFilter === "active" && !invoice.deletedAt ||
        (invoiceStateFilter === "adjusted" && !invoice.deletedAt && (Boolean(invoice.editedAt) || (invoice.adjustments?.length ?? 0) > 0)) ||
        (invoiceStateFilter === "deleted" && Boolean(invoice.deletedAt))),
  );
  // The summary always shows both payment methods for the selected period/type;
  // the payment buttons below only narrow the invoice list.
  const periodInvoices = allInvoices.filter(
    (invoice: any) =>
      !invoice.deletedAt &&
      (invoiceTypeFilter === "all" || invoice.invoiceType === invoiceTypeFilter),
  );
  const cashTotal = periodInvoices
    .filter((invoice: any) => invoice.paymentMethod === "cash")
    .map((invoice: any) => invoice.invoiceTotal);
  const cliqTotal = periodInvoices
    .filter((invoice: any) => invoice.paymentMethod === "cliq")
    .map((invoice: any) => invoice.invoiceTotal);
  const cashTotalAmount = moneySum(cashTotal);
  const cliqTotalAmount = moneySum(cliqTotal);
  const total = moneySum([cashTotalAmount, cliqTotalAmount]);
  const saveAdjustment = async () => {
    if (!selected) return;
    const amount = Number(adjustmentAmount);
    if (!Number.isFinite(amount) || amount === 0) {
      setAdjustmentError("Enter a non-zero amount. Use a minus sign to reduce the invoice.");
      return;
    }
    if (!adjustmentReason.trim()) {
      setAdjustmentError("A reason for this adjustment is required.");
      return;
    }
    setSavingAdjustment(true);
    setAdjustmentError("");
    try {
      await manageApi(
        `/reports/invoices/${selected.invoiceType === "session" ? "session" : "order"}/${selected.id}/adjustments`,
        "POST",
        { amount, reason: adjustmentReason.trim() },
      );
      setSelected(null);
      setAdjustmentAmount("");
      setAdjustmentReason("");
      await client.invalidateQueries();
    } catch (error) {
      setAdjustmentError(error instanceof Error ? error.message : "Could not save the adjustment");
    } finally {
      setSavingAdjustment(false);
    }
  };
  const deleteInvoice = async () => {
    if (!selected || !deleteReason.trim()) {
      setDeleteError("A deletion reason is required.");
      return;
    }
    setDeletingInvoice(true);
    setDeleteError("");
    try {
      await manageApi(
        `/reports/invoices/${selected.invoiceType === "session" ? "session" : "order"}/${selected.id}/adjustments`,
        "DELETE",
        { reason: deleteReason.trim() },
      );
      setSelected(null);
      setShowDeleteForm(false);
      setDeleteReason("");
      await client.invalidateQueries();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete the invoice");
    } finally {
      setDeletingInvoice(false);
    }
  };
  const openInvoice = (invoice: any) => {
    setSelected(invoice);
    setBillMode("menu");
    setEditingInvoice(false);
    setShowDeleteForm(false);
    setEditPaymentMethod(invoice.paymentMethod === "cliq" ? "cliq" : "cash");
    setEditNotes(invoice.notes ?? "");
    setEditDiscount(String(invoice.discountValue ?? invoice.discountAmount ?? 0));
    setEditDiscountReason(invoice.discountReason ?? "");
    setEditFinalPrice("");
    setEditPriceReason("");
    setEditReason("");
    setEditItems(
      invoice.invoiceType === "session"
        ? (invoice.cafeteriaOrders ?? []).flatMap((order: any) => order.items ?? [])
        : invoice.items ?? [],
    );
    setEditError("");
  };
  const saveInvoiceEdit = async () => {
    if (!selected) return;
    const discountValue = Number(editDiscount || 0);
    if (!Number.isFinite(discountValue) || discountValue < 0) {
      setEditError("Discount must be a non-negative number.");
      return;
    }
    if (discountValue > 0 && !editDiscountReason.trim()) {
      setEditError("A discount reason is required.");
      return;
    }
    if (!editReason.trim()) {
      setEditError("A reason for this edit is required.");
      return;
    }
    if (!window.confirm("Save these invoice changes?")) return;
    setSavingEdit(true);
    setEditError("");
    try {
      await manageApi(
        `/reports/invoices/${selected.invoiceType === "session" ? "session" : "order"}/${selected.id}/adjustments`,
        "PATCH",
        {
          paymentMethod: editPaymentMethod,
          notes: editNotes,
          discountType: "amount",
          discountValue,
          discountReason: editDiscountReason.trim(),
          targetTotal: editFinalPrice || undefined,
          reason: editReason.trim(),
          items: editItems.map((item) => ({
            productId: item.productId,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
          })),
        },
      );
      setSelected(null);
      setEditingInvoice(false);
      await client.invalidateQueries();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Could not save invoice changes");
    } finally {
      setSavingEdit(false);
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="Reports / invoices"
        title="Invoices"
        description="Select a period, then open any invoice for the complete session and cafeteria breakdown."
        action={
          <button
            onClick={() => setLocation("/reports")}
            className="rounded-lg border border-border bg-card px-4 py-2.5 text-xs font-bold hover:bg-muted"
          >
            Back to reports
          </button>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(["daily", "weekly", "monthly"] as const).map((item) => (
          <button
            key={item}
            onClick={() => setRange(item)}
            className={`rounded-md px-4 py-2 text-xs font-bold capitalize ${range === item ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:text-foreground"}`}
          >
            {item}
          </button>
        ))}
        <input
          aria-label="Report date"
          type="date"
          value={selectedDate}
          onChange={(event) => {
            setSelectedDate(event.target.value);
            setRange("daily");
          }}
          className="rounded-md border border-input bg-card px-3 py-2 text-xs font-bold"
        />
        <div className="ml-auto grid grid-cols-3 divide-x divide-border overflow-hidden rounded-lg border border-border bg-card text-right">
          <div className="px-4 py-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Cash total
            </div>
            <div className="tabular text-base font-extrabold text-emerald-700">
              {money(cashTotalAmount)}
            </div>
          </div>
          <div className="px-4 py-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              CliQ total
            </div>
            <div className="tabular text-base font-extrabold text-primary">
              {money(cliqTotalAmount)}
            </div>
          </div>
          <div className="bg-muted/50 px-4 py-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Period total
            </div>
            <div className="tabular text-xl font-extrabold">{money(total)}</div>
          </div>
        </div>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-border bg-card">
          {(["all", "cash", "cliq"] as const).map((method) => (
            <button
              key={method}
              aria-pressed={paymentFilter === method}
              onClick={() => setPaymentFilter(method)}
              className={`border-r border-border px-3 py-2 text-xs font-bold last:border-r-0 ${paymentFilter === method ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              {method === "all"
                ? "All payments"
                : method === "cliq"
                  ? "CliQ"
                  : "Cash"}
            </button>
          ))}
        </div>
        <div className="flex overflow-hidden rounded-md border border-border bg-card">
          {(["all", "session", "cafeteria"] as const).map((type) => (
            <button
              key={type}
              aria-pressed={invoiceTypeFilter === type}
              onClick={() => setInvoiceTypeFilter(type)}
              className={`border-r border-border px-3 py-2 text-xs font-bold last:border-r-0 ${invoiceTypeFilter === type ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              {type === "all"
                ? "All types"
                : type === "session"
                  ? "Sessions"
                  : "Cafeteria"}
            </button>
          ))}
        </div>
        <div className="flex overflow-hidden rounded-md border border-border bg-card">
          {(["active", "adjusted", "deleted"] as const).map((state) => (
            <button
              key={state}
              aria-pressed={invoiceStateFilter === state}
              onClick={() => setInvoiceStateFilter(state)}
              className={`border-r border-border px-3 py-2 text-xs font-bold last:border-r-0 ${invoiceStateFilter === state ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              {state === "active" ? "Active" : state === "adjusted" ? "Edited" : "Deleted"}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {sessionsLoading || ordersLoading ? (
          <TableSkeleton />
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="No matching invoices"
            text="Try a different payment, type, or period."
          />
        ) : (
          <div className="divide-y divide-border">
            {invoices.map((invoice: any) => (
              <button
                key={`${invoice.invoiceType}-${invoice.id}`}
                onClick={() => openInvoice(invoice)}
                className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-muted"
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${invoice.invoiceType === "session" ? "bg-primary/10 text-primary" : "bg-accent/20 text-amber-800"}`}
                >
                  {invoice.invoiceType === "session" ? (
                    <Table2 size={16} />
                  ) : (
                    <Utensils size={16} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-extrabold">
                    {invoice.invoiceType === "session"
                      ? `${invoice.resourceName} · Session #${invoice.id}`
                      : invoice.name || `Cafeteria order #${invoice.id}`}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {dateLabel(invoice.invoiceDate)} ·{" "}
                    {timeLabel(invoice.invoiceDate)} · {invoice.paymentMethod}
                  </div>
                  {invoice.deletedAt && (
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-destructive">
                      Deleted invoice
                    </div>
                  )}
                </div>
                <div className="hidden text-[10px] font-semibold text-muted-foreground sm:block">
                  Recorded by{" "}
                  {invoice.invoiceType === "session"
                    ? invoice.completedBy
                    : invoice.paidBy}
                </div>
                <div className="tabular text-sm font-extrabold">
                  {money(invoice.invoiceTotal)}
                </div>
                <ChevronRight size={16} className="text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </div>
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/35 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between border-b border-border p-5">
              <div>
                <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Paid invoice
                </div>
                <h2 className="mt-1 text-lg font-extrabold">
                  {selected.invoiceType === "session"
                    ? selected.resourceName
                    : selected.name || `Cafeteria order #${selected.id}`}
                </h2>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 p-5 text-xs">
              {billMode !== "menu" && <>
              <div className="rounded-md border border-border bg-muted/35 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Audit trail
                </div>
                <div className="mt-2 flex justify-between">
                  <span>Created by</span>
                  <span className="font-bold">{selected.createdBy}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span>
                    {selected.invoiceType === "session"
                      ? "Closed by"
                      : "Paid by"}
                  </span>
                  <span className="font-bold">
                    {selected.invoiceType === "session"
                      ? selected.completedBy
                      : selected.paidBy}
                  </span>
                </div>
              </div>
              {selected.invoiceType === "session" && (
                <>
                  <ResourceUsageBillLines session={selected} />
                  <div className="flex justify-between font-bold">
                    <span>Play total</span>
                    <span>{money(selected.total)}</span>
                  </div>
                  <div className="border-t border-border pt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Cafeteria
                  </div>
                  {(selected.cafeteriaOrders ?? [])
                    .flatMap((order: any) => order.items)
                    .map((item: any, index: number) => (
                      <div
                        key={`${item.productId}-${index}`}
                        className="flex justify-between"
                      >
                        <span>
                          {item.quantity} x {item.productName}
                        </span>
                        <span>{money(item.lineTotal)}</span>
                      </div>
                    ))}
                  <div className="flex justify-between font-bold">
                    <span>Cafeteria total</span>
                    <span>{money(selected.cafeteriaTotal)}</span>
                  </div>
                </>
              )}
              {selected.invoiceType === "cafeteria" &&
                selected.items.map((item: any) => (
                  <div key={item.productId} className="flex justify-between">
                    <span>
                      {item.quantity} x {item.productName}
                    </span>
                    <span>{money(item.lineTotal)}</span>
                  </div>
                ))}
              {(selected.discountAmount ?? 0) > 0 && (
                <>
                  <div className="flex justify-between text-destructive">
                    <span>Discount</span>
                    <span>-{money(selected.discountAmount)}</span>
                  </div>
                  <div className="rounded-md bg-muted p-3 text-xs">
                    <span className="font-bold">Discount reason: </span>
                    {selected.discountReason}
                  </div>
                </>
              )}
              {selected.notes && (
                <div className="rounded-md bg-muted p-3 text-xs">
                  <span className="font-bold">Invoice notes: </span>
                  {selected.notes}
                </div>
              )}
              {billMode === "menu" && (
                <div className="grid gap-2">
                  <button type="button" onClick={() => setBillMode("view")} className="rounded-md border border-border bg-card px-3 py-3 text-xs font-bold hover:bg-muted">Show bill</button>
                  {!selected.deletedAt && <button type="button" onClick={() => { setEditingInvoice(true); setBillMode("edit"); }} className="rounded-md bg-primary px-3 py-3 text-xs font-bold text-primary-foreground">Edit bill</button>}
                  {!selected.deletedAt && <button type="button" onClick={() => { setShowDeleteForm(true); setBillMode("delete"); }} className="rounded-md border border-destructive/40 px-3 py-3 text-xs font-bold text-destructive hover:bg-destructive/10">Delete bill</button>}
                </div>
              )}
              {false && billMode === "view" && (selected.adjustments ?? []).length > 0 && (
                <div className="space-y-2 rounded-md border border-border bg-muted/35 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Super admin adjustments
                  </div>
                  {selected.adjustments.map((adjustment: any) => (
                    <div key={adjustment.id} className="border-t border-border pt-2 first:border-t-0 first:pt-0">
                      <div className={`flex justify-between font-bold ${adjustment.amount < 0 ? "text-destructive" : "text-emerald-700"}`}>
                        <span>{adjustment.amount < 0 ? "Decrease" : "Increase"}</span>
                        <span>{adjustment.amount < 0 ? "-" : "+"}{money(Math.abs(adjustment.amount))}</span>
                      </div>
                      <div className="mt-1 text-muted-foreground">{adjustment.reason}</div>
                      <div className="mt-1 text-[10px] text-muted-foreground">By {adjustment.createdBy} · {dateLabel(adjustment.createdAt)} {timeLabel(adjustment.createdAt)}</div>
                    </div>
                  ))}
                </div>
              )}
              {billMode === "view" && selected.deletedAt && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
                  <div className="font-bold text-destructive">Deleted invoice</div>
                  <div className="mt-1">{selected.deletedReason}</div>
                  <div className="mt-1 text-muted-foreground">Deleted by {selected.deletedBy} · {dateLabel(selected.deletedAt)} {timeLabel(selected.deletedAt)}</div>
                </div>
              )}
              {billMode === "edit" && !selected.deletedAt && (
                <div className="space-y-2 rounded-md border border-border bg-muted/35 p-3">
                  {!editingInvoice ? (
                    <button
                      type="button"
                      onClick={() => setEditingInvoice(true)}
                      className="rounded-md border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-muted"
                    >
                      Edit invoice
                    </button>
                  ) : (
                    <>
                      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Edit invoice details</div>
                      <label className="block text-xs font-bold">Payment method
                        <select value={editPaymentMethod} onChange={(event) => setEditPaymentMethod(event.target.value as "cash" | "cliq")} className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-xs">
                          <option value="cash">Cash</option>
                          <option value="cliq">CliQ</option>
                        </select>
                      </label>
                      <label className="block text-xs font-bold">Invoice notes
                        <textarea value={editNotes} onChange={(event) => setEditNotes(event.target.value)} maxLength={1000} className="mt-1 min-h-16 w-full rounded-md border border-input bg-card px-3 py-2 text-xs" />
                      </label>
                      <div className="space-y-2 border-t border-border pt-2">
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Cafeteria items</div>
                        {editItems.map((item, index) => (
                          <div key={`${item.productId}-${index}`} className="grid grid-cols-[1fr_54px_70px_auto] gap-1">
                            <span className="truncate self-center text-xs">{item.productName}</span>
                            <input aria-label={`Quantity for ${item.productName}`} type="number" min="1" value={item.quantity} onChange={(event) => setEditItems((items) => items.map((value, itemIndex) => itemIndex === index ? { ...value, quantity: event.target.value } : value))} className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs" />
                            <input aria-label={`Price for ${item.productName}`} type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => setEditItems((items) => items.map((value, itemIndex) => itemIndex === index ? { ...value, unitPrice: event.target.value } : value))} className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs" />
                            <button type="button" onClick={() => setEditItems((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="px-1 text-xs font-bold text-destructive">Remove</button>
                          </div>
                        ))}
                        <select aria-label="Add cafeteria item" defaultValue="" onChange={(event) => { const product = products.find((value: any) => String(value.id) === event.target.value); if (product) { setEditItems((items) => [...items, { productId: product.id, productName: product.name, quantity: 1, unitPrice: product.price }]); event.currentTarget.value = ""; } }} className="w-full rounded-md border border-input bg-card px-3 py-2 text-xs">
                          <option value="">Add cafeteria item…</option>
                          {products.filter((product: any) => product.isActive).map((product: any) => <option key={product.id} value={product.id}>{product.name}</option>)}
                        </select>
                      </div>
                      <label className="block text-xs font-bold">Discount amount
                        <input type="number" min="0" step="0.01" value={editDiscount} onChange={(event) => setEditDiscount(event.target.value)} className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-xs" />
                      </label>
                      <label className="block text-xs font-bold">Discount reason
                        <input value={editDiscountReason} onChange={(event) => setEditDiscountReason(event.target.value)} maxLength={250} className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-xs" placeholder="Required when a discount is applied" />
                      </label>
                      <div className="border-t border-border pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Final price only</div>
                      <input type="number" min="0" step="0.01" value={editFinalPrice} onChange={(event) => setEditFinalPrice(event.target.value)} className="w-full rounded-md border border-input bg-card px-3 py-2 text-xs" placeholder="Optional corrected final total" />
                      <textarea value={editReason} onChange={(event) => setEditReason(event.target.value)} maxLength={500} className="min-h-16 w-full rounded-md border border-input bg-card px-3 py-2 text-xs" placeholder="Reason for this edit (required)" />
                      {editError && <p role="alert" className="text-xs font-semibold text-destructive">{editError}</p>}
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setBillMode("menu")} disabled={savingEdit} className="rounded-md border border-border bg-card px-3 py-2 text-xs font-bold">Cancel</button>
                        <button type="button" onClick={saveInvoiceEdit} disabled={savingEdit} className="rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60">{savingEdit ? "Saving…" : "Save invoice changes"}</button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {false && !selected.deletedAt && <div className="space-y-2 rounded-md border border-primary/25 bg-primary/5 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
                  Super admin invoice adjustment
                </div>
                <p className="text-[11px] text-muted-foreground">
                  This keeps the original invoice calculation unchanged. Enter a positive value to add or a negative value to subtract.
                </p>
                <input
                  aria-label="Invoice adjustment amount"
                  type="number"
                  step="0.01"
                  value={adjustmentAmount}
                  onChange={(event) => setAdjustmentAmount(event.target.value)}
                  placeholder="e.g. 2.50 or -2.50"
                  className="w-full rounded-md border border-input bg-card px-3 py-2 text-xs"
                />
                <textarea
                  aria-label="Invoice adjustment reason"
                  value={adjustmentReason}
                  onChange={(event) => setAdjustmentReason(event.target.value)}
                  maxLength={500}
                  placeholder="Reason for this adjustment (required)"
                  className="min-h-16 w-full rounded-md border border-input bg-card px-3 py-2 text-xs"
                />
                {adjustmentError && <p role="alert" className="text-xs font-semibold text-destructive">{adjustmentError}</p>}
                <button
                  type="button"
                  onClick={saveAdjustment}
                  disabled={savingAdjustment}
                  className="rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
                >
                  {savingAdjustment ? "Saving…" : "Save adjustment"}
                </button>
              </div>
              }
              {billMode === "delete" && !selected.deletedAt && (
                <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  {!showDeleteForm ? (
                    <button
                      type="button"
                      onClick={() => { setShowDeleteForm(true); setDeleteError(""); }}
                      className="rounded-md border border-destructive/40 px-3 py-2 text-xs font-bold text-destructive hover:bg-destructive/10"
                    >
                      Delete invoice
                    </button>
                  ) : (
                    <>
                      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-destructive">Delete paid invoice</div>
                      <p className="text-[11px] text-muted-foreground">This removes the invoice from reports and accounting totals. It remains visible only in the Deleted filter for audit purposes.</p>
                      <textarea
                        aria-label="Invoice deletion reason"
                        value={deleteReason}
                        onChange={(event) => setDeleteReason(event.target.value)}
                        maxLength={500}
                        placeholder="Deletion reason (required)"
                        className="min-h-16 w-full rounded-md border border-input bg-card px-3 py-2 text-xs"
                      />
                      {deleteError && <p role="alert" className="text-xs font-semibold text-destructive">{deleteError}</p>}
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setBillMode("menu")} disabled={deletingInvoice} className="rounded-md border border-border bg-card px-3 py-2 text-xs font-bold">Cancel</button>
                        <button type="button" onClick={deleteInvoice} disabled={deletingInvoice} className="rounded-md bg-destructive px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{deletingInvoice ? "Deleting…" : "Confirm deletion"}</button>
                      </div>
                    </>
                  )}
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-3 text-sm font-extrabold">
                <span>Invoice total</span>
                <span>{money(selected.invoiceTotal)}</span>
              </div>
              </>}
              {billMode === "menu" && (
                <div className="grid gap-2">
                  <button type="button" onClick={() => setBillMode("view")} className="rounded-md border border-border bg-card px-3 py-3 text-xs font-bold hover:bg-muted">Show bill</button>
                  {!selected.deletedAt && <button type="button" onClick={() => { setEditingInvoice(true); setBillMode("edit"); }} className="rounded-md bg-primary px-3 py-3 text-xs font-bold text-primary-foreground">Edit bill</button>}
                  {!selected.deletedAt && <button type="button" onClick={() => { setShowDeleteForm(true); setBillMode("delete"); }} className="rounded-md border border-destructive/40 px-3 py-3 text-xs font-bold text-destructive hover:bg-destructive/10">Delete bill</button>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {selected && billMode === "edit" && (
        <PaidInvoiceEditDialog
          invoice={selected}
          products={products}
          onClose={() => setBillMode("menu")}
          onSaved={async () => {
            setSelected(null);
            setBillMode("menu");
            await client.invalidateQueries();
          }}
        />
      )}
    </>
  );
}

function CounterCafeteriaPage() {
  const client = useQueryClient();
  const { data: products = [] } = useListProducts({
    query: { queryKey: getListProductsQueryKey() },
  });
  const { data: orders = [] } = useListOrders(undefined, {
    query: { queryKey: getListOrdersQueryKey(), refetchInterval: 15000 },
  });
  const createProduct = useCreateProduct();
  const createOrder = useCreateOrder();
  const payOrder = usePayOrder();
  const [cart, setCart] = useState<Record<number, number>>({});
  const [orderName, setOrderName] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [productForm, setProductForm] = useState({
    name: "",
    category: "Drinks",
    price: "",
  });
  const [productError, setProductError] = useState("");
  const [settlingOrder, setSettlingOrder] = useState<any | null>(null);
  const activeProducts = products.filter((product: any) => product.isActive);
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          activeProducts.map((product: any) => String(product.category ?? "Other")),
        ),
      ).sort((first, second) => {
        const rankDifference =
          cafeteriaCategoryRank(first) - cafeteriaCategoryRank(second);
        return rankDifference || first.localeCompare(second);
      }),
    [activeProducts],
  );
  const visibleProducts = activeProducts.filter(
    (product: any) =>
      categoryFilter === "all" || product.category === categoryFilter,
  );
  const change = (id: number, delta: number) =>
    setCart((current) => {
      const quantity = Math.max(0, (current[id] ?? 0) + delta);
      if (!quantity) {
        const { [id]: _, ...rest } = current;
        return rest;
      }
      return { ...current, [id]: quantity };
    });
  const total = activeProducts.reduce(
    (sum: number, product: any) =>
      sum + (cart[product.id] ?? 0) * product.price,
    0,
  );
  const save = () => {
    const items = Object.entries(cart).map(([productId, quantity]) => ({
      productId: Number(productId),
      quantity,
    }));
    if (!items.length || !orderName.trim()) return;
    createOrder.mutate(
      { data: { name: orderName.trim(), notes: orderNotes.trim(), items } },
      {
        onSuccess: () => {
          setCart({});
          setOrderName("");
          setOrderNotes("");
          client.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        },
      },
    );
  };
  const pay = (
    id: number,
    paymentMethod: "cash" | "cliq",
    discountType: "amount" | "percentage" = "amount",
    discountValue = 0,
    discountReason = "",
    notes = "",
  ) =>
    payOrder.mutate(
      {
        id,
        data: { paymentMethod, discountType, discountValue, discountReason, notes },
      } as any,
      {
        onSuccess: () => {
          client.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          setSettlingOrder(null);
        },
      },
    );
  const addProduct = () => {
    const name = productForm.name.trim();
    const category = productForm.category.trim();
    const price = Number(productForm.price);
    if (
      !name ||
      !category ||
      !productForm.price.trim() ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      setProductError(
        "Enter a name, category, and a valid non-negative price.",
      );
      return;
    }

    setProductError("");
    createProduct.mutate(
      { data: { name, category, price } },
      {
        onSuccess: () => {
          client.invalidateQueries({ queryKey: getListProductsQueryKey() });
          setProductForm({ name: "", category: "Drinks", price: "" });
          setShowProductDialog(false);
        },
        onError: (error) => {
          setProductError(
            error instanceof Error
              ? error.message
              : "Could not add the product.",
          );
        },
      },
    );
  };
  const openOrders = orders.filter(
    (order: any) => order.status === "open" && !order.sessionId,
  );
  return (
    <>
      <PageHeading
        eyebrow="Cafeteria / till"
        title="Cafeteria"
        description="Build and edit open cafeteria orders."
        action={
          <button
            data-testid="button-add-product"
            onClick={() => {
              setProductError("");
              setShowProductDialog(true);
            }}
            className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-bold hover:bg-muted"
          >
            <Plus size={16} /> Add product
          </button>
        }
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-extrabold">Quick order</h2>
            <span className="text-xs text-muted-foreground">
              {activeProducts.length} active items
            </span>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              aria-pressed={categoryFilter === "all"}
              onClick={() => setCategoryFilter("all")}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${categoryFilter === "all" ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:text-foreground"}`}
            >
              All
            </button>
            {categories.map((category) => (
              <button
                key={category}
                aria-pressed={categoryFilter === category}
                onClick={() => setCategoryFilter(category)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${categoryFilter === category ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:text-foreground"}`}
              >
                {category}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {visibleProducts.map((product: any) => {
              const quantity = cart[product.id] ?? 0;
              return (
                <div
                  key={product.id}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20 text-amber-800">
                      <Package size={16} />
                    </div>
                    <div className="flex items-center overflow-hidden rounded-md border border-border">
                      <button
                        onClick={() => change(product.id, -1)}
                        disabled={!quantity}
                        className="px-2 py-1 text-sm font-bold disabled:opacity-30"
                      >
                        −
                      </button>
                      <span className="min-w-7 border-x border-border px-1 py-1 text-center text-xs font-extrabold">
                        {quantity}
                      </span>
                      <button
                        onClick={() => change(product.id, 1)}
                        className="px-2 py-1 text-sm font-bold text-primary"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 text-xs font-extrabold">
                    {product.name}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {product.category} ·{" "}
                    <span className="font-bold text-foreground">
                      {money(product.price)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <aside className="rounded-xl border border-primary/20 bg-primary p-5 text-primary-foreground">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-extrabold">Current order</h2>
              <p className="mt-1 text-[11px] text-primary-foreground/60">
                {Object.values(cart).reduce(
                  (sum, quantity) => sum + quantity,
                  0,
                )}{" "}
                items selected
              </p>
            </div>
            <ReceiptText size={18} className="text-accent" />
          </div>
          <label className="mt-5 block text-[10px] font-bold uppercase tracking-[0.12em] text-primary-foreground/70">
            Invoice name
            <input
              value={orderName}
              onChange={(event) => setOrderName(event.target.value)}
              placeholder="Required"
              className="mt-1.5 w-full rounded-md border border-primary-foreground/25 bg-primary-foreground/10 px-3 py-2 text-sm text-primary-foreground outline-none placeholder:text-primary-foreground/45"
            />
          </label>
          <label className="mt-3 block text-[10px] font-bold uppercase tracking-[0.12em] text-primary-foreground/70">
            Invoice notes
            <textarea
              value={orderNotes}
              onChange={(event) => setOrderNotes(event.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="Optional"
              className="mt-1.5 w-full resize-y rounded-md border border-primary-foreground/25 bg-primary-foreground/10 px-3 py-2 text-sm text-primary-foreground outline-none placeholder:text-primary-foreground/45"
            />
          </label>
          <div className="mt-5 min-h-[82px] space-y-2">
            {activeProducts
              .filter((product: any) => cart[product.id])
              .map((product: any) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between text-xs"
                >
                  <span>
                    {cart[product.id]} x {product.name}
                  </span>
                  <span className="font-bold">
                    {money(cart[product.id] * product.price)}
                  </span>
                </div>
              ))}
          </div>
          <div className="mt-4 flex items-end justify-between border-t border-primary-foreground/15 pt-3">
            <span className="text-xs text-primary-foreground/60">Total</span>
            <span className="tabular text-2xl font-extrabold">
              {money(total)}
            </span>
          </div>
          <button
            disabled={!total || !orderName.trim() || createOrder.isPending}
            onClick={save}
            className="mt-4 flex w-full items-center justify-center rounded-lg bg-white py-2.5 text-xs font-extrabold text-primary shadow-sm transition hover:bg-primary-foreground/90 disabled:bg-primary-foreground/35 disabled:text-primary-foreground/60 disabled:opacity-100"
          >
            Save open order <ChevronRight size={15} />
          </button>
        </aside>
      </div>
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-extrabold">Open orders</h2>
          <span className="text-xs text-muted-foreground">
            Click an order to edit its quantities
          </span>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="divide-y divide-border">
            {openOrders.map((order: any) => (
              <div key={order.id} className="flex items-center gap-3 px-5 py-4">
                <button
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("open-counter-order", { detail: order }),
                    )
                  }
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="text-xs font-extrabold">
                    {order.name || `Order #${order.id}`}
                  </div>
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">
                    {order.items
                      .map(
                        (item: any) => `${item.quantity} x ${item.productName}`,
                      )
                      .join(" · ")}
                  </div>
                </button>
                <div className="tabular text-sm font-extrabold">
                  {money(order.total)}
                </div>
                <button
                  onClick={() => setSettlingOrder(order)}
                  className="rounded-md border border-border px-2.5 py-1.5 text-[10px] font-bold text-foreground"
                >
                  Cash
                </button>
                <button
                  onClick={() => setSettlingOrder(order)}
                  className="rounded-md bg-primary px-2.5 py-1.5 text-[10px] font-bold text-primary-foreground"
                >
                  CliQ
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
      {settlingOrder && (
        <SettlementDialog
          invoice={{
            label: settlingOrder.name || `Cafeteria order #${settlingOrder.id}`,
            subtotal: settlingOrder.subtotal ?? settlingOrder.total,
          }}
          saving={payOrder.isPending}
          onClose={() => setSettlingOrder(null)}
          onConfirm={(paymentMethod, discountType, discountValue, discountReason, notes) =>
            pay(
              settlingOrder.id,
              paymentMethod,
              discountType,
              discountValue,
              discountReason,
              notes,
            )
          }
        />
      )}
      {showProductDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/35 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl fade-up">
            <div className="flex items-start justify-between">
              <div>
                <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Catalogue
                </div>
                <h2 className="mt-1 text-xl font-extrabold">Add product</h2>
              </div>
              <button
                aria-label="Close product dialog"
                data-testid="button-close-product-dialog"
                onClick={() => setShowProductDialog(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <label className="col-span-2 text-xs font-bold">
                Product name
                <input
                  data-testid="input-product-name"
                  value={productForm.name}
                  onChange={(event) =>
                    setProductForm({ ...productForm, name: event.target.value })
                  }
                  className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-bold">
                Category
                <input
                  data-testid="input-product-category"
                  value={productForm.category}
                  onChange={(event) =>
                    setProductForm({
                      ...productForm,
                      category: event.target.value,
                    })
                  }
                  className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-bold">
                Price
                <input
                  data-testid="input-product-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={productForm.price}
                  onChange={(event) =>
                    setProductForm({
                      ...productForm,
                      price: event.target.value,
                    })
                  }
                  className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
                />
              </label>
            </div>
            {productError && (
              <p
                role="alert"
                className="mt-3 text-xs font-semibold text-destructive"
              >
                {productError}
              </p>
            )}
            <button
              disabled={createProduct.isPending}
              data-testid="button-confirm-product"
              onClick={addProduct}
              className="mt-6 flex w-full items-center justify-center rounded-lg bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {createProduct.isPending ? "Adding..." : "Add to catalogue"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ReportsPage() {
  const [, setLocation] = useLocation();
  const [from, setFrom] = useState(() => currentWeekBounds().from);
  const [to, setTo] = useState(() => currentWeekBounds().to);
  const [auditEntries, setAuditEntries] = useState<any[]>([]);
  const params = useMemo(() => ({ from, to }), [from, to]);
  const { data, isLoading, isError, refetch } = useGetProfitReport(params, {
    query: { queryKey: getGetProfitReportQueryKey(params) },
  });
  useEffect(() => {
    fetch("/api/reports/audit")
      .then((response) => (response.ok ? response.json() : []))
      .then(setAuditEntries)
      .catch(() => setAuditEntries([]));
  }, []);
  return (
    <>
      <PageHeading
        eyebrow="Reporting / reconciliation"
        title="Reports"
        description="Each report date covers 4:00 PM through 12:00 PM the following day."
        action={
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-1.5">
            <CalendarDays size={15} className="ml-2 text-muted-foreground" />
            <input
              aria-label="Report from date"
              data-testid="input-report-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="bg-transparent px-1 text-xs font-bold outline-none"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              aria-label="Report to date"
              data-testid="input-report-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="bg-transparent px-1 text-xs font-bold outline-none"
            />
          </div>
        }
      />
      {isLoading ? (
        <LoadingPage />
      ) : isError || !data ? (
        <ErrorPage onRetry={refetch} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Metric
              label="Net revenue"
              value={money(data.revenue)}
              detail={`${dateLabel(data.from)} - ${dateLabel(data.to)}`}
              tone="accent"
              icon={CircleDollarSign}
            />
            <Metric
              label="Gross revenue"
              value={money((data as any).grossRevenue ?? data.revenue)}
              detail="Before discounts"
              icon={WalletCards}
            />
            <Metric
              label="Discounts"
              value={money((data as any).discountTotal ?? 0)}
              detail="Fixed JOD amounts"
              tone="warm"
              icon={ArrowDownRight}
            />
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_0.65fr]">
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-start justify-between border-b border-border p-5">
                <div>
                  <h2 className="text-sm font-extrabold">
                    Daily payment summary
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Cash and CliQ collected each day
                  </p>
                </div>
                <BarChart3 size={18} className="text-muted-foreground" />
              </div>
              <div className="mobile-scroll overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="bg-muted/50 text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3">Report date</th>
                      <th className="px-4 py-3 text-right">Cash</th>
                      <th className="px-4 py-3 text-right">CliQ</th>
                      <th className="px-4 py-3 text-right">Discounts</th>
                      <th className="px-5 py-3 text-right">Net total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.byDay.map((day: any) => (
                      <tr
                        key={day.date}
                        data-testid={`report-day-${day.date}`}
                        onClick={() => setLocation(`/reports/invoices?date=${day.date}`)}
                        className="cursor-pointer hover:bg-muted/35"
                      >
                        <td className="px-5 py-4 font-bold">
                          {dateLabel(day.date)}
                        </td>
                        <td className="px-4 py-4 text-right tabular font-bold text-emerald-700">
                          {money(day.cash)}
                        </td>
                        <td className="px-4 py-4 text-right tabular font-bold text-primary">
                          {money(day.cliq)}
                        </td>
                        <td className="px-4 py-4 text-right tabular font-bold text-destructive">
                          -{money(day.discounts ?? 0)}
                        </td>
                        <td className="px-5 py-4 text-right tabular font-extrabold">
                          {money(day.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-extrabold">Revenue split</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                By operating area
              </p>
              <div className="mt-6 space-y-5">
                <SplitLine
                  label="Sessions"
                  value={data.sessionRevenue}
                  total={data.revenue}
                  color="bg-primary"
                />
                <SplitLine
                  label="Cafeteria"
                  value={data.cafeteriaRevenue}
                  total={data.revenue}
                  color="bg-accent"
                />
              </div>
              <div className="mt-7 border-t border-border pt-5">
                <h3 className="text-xs font-extrabold">
                  Payment reconciliation
                </h3>
                <div className="mt-3 space-y-3">
                  <div className="flex justify-between text-xs">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <span className="status-dot bg-primary" /> Cash
                    </span>
                    <span className="tabular font-extrabold">
                      {money(data.byPaymentMethod.cash)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <span className="status-dot bg-accent" /> CliQ
                    </span>
                    <span className="tabular font-extrabold">
                      {money(data.byPaymentMethod.cliq)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <section className="mt-5 overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-sm font-extrabold">Audit trail</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  The most recent saved actions and the staff account
                  responsible.
                </p>
              </div>
              <Activity size={18} className="text-muted-foreground" />
            </div>
            <div className="divide-y divide-border">
              {auditEntries.length ? (
                auditEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-4 px-5 py-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold">{entry.action}</div>
                      <div className="mt-1 truncate text-[11px] text-muted-foreground">
                        {entry.subject}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-primary">
                        {entry.username}
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {dateLabel(entry.createdAt)}{" "}
                        {timeLabel(entry.createdAt)}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-5 py-8 text-center text-xs text-muted-foreground">
                  No audit activity yet.
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function SplitLine({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs">
        <span className="font-semibold text-muted-foreground">{label}</span>
        <span className="tabular font-extrabold">{money(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${total ? (value / total) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}

function SettingsPage() {
  const { data: resources = [], isLoading: resourcesLoading } =
    useListResources({ query: { queryKey: getListResourcesQueryKey() } });
  const { data: products = [], isLoading: productsLoading } = useListProducts({
    query: { queryKey: getListProductsQueryKey() },
  });
  const client = useQueryClient();
  const invalidateRates = () => {
    client.invalidateQueries({ queryKey: getListResourcesQueryKey() });
    client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  };
  const invalidateProducts = () => {
    client.invalidateQueries({ queryKey: getListProductsQueryKey() });
    client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  };
  const createResource = async () => {
    const name = window.prompt("Resource name");
    if (!name?.trim()) return;
    const kind = window.prompt(
      "Type: snooker, billiards, or playstation",
      "snooker",
    );
    const hourlyRate = window.prompt("Hourly rate (JOD)", "0");
    if (!kind || hourlyRate === null) return;
    try {
      await manageApi("/resources", "POST", {
        name,
        kind: kind.toLowerCase(),
        hourlyRate: Number(hourlyRate),
      });
      invalidateRates();
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Could not add resource",
      );
    }
  };
  const editResource = async (resource: any) => {
    const name = window.prompt("Resource name", resource.name);
    const kind = window.prompt(
      "Type: snooker, billiards, or playstation",
      resource.kind,
    );
    const hourlyRate = window.prompt(
      "Hourly rate (JOD)",
      String(resource.hourlyRate),
    );
    if (!name || !kind || hourlyRate === null) return;
    try {
      await manageApi(`/resources/${resource.id}`, "PATCH", {
        name,
        kind: kind.toLowerCase(),
        hourlyRate: Number(hourlyRate),
      });
      invalidateRates();
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Could not update resource",
      );
    }
  };
  const deleteResource = async (resource: any) => {
    if (!window.confirm(`Delete ${resource.name}?`)) return;
    try {
      await manageApi(`/resources/${resource.id}`, "DELETE");
      invalidateRates();
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Could not delete resource",
      );
    }
  };
  const editProduct = async (product: any) => {
    const name = window.prompt("Product name", product.name);
    const category = window.prompt("Category", product.category);
    const price = window.prompt("Sale price (JOD)", String(product.price));
    if (!name || !category || price === null) return;
    try {
      await manageApi(`/products/${product.id}`, "PATCH", {
        name,
        category,
        price: Number(price),
        isActive: product.isActive,
      });
      invalidateProducts();
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Could not update product",
      );
    }
  };
  const deleteProduct = async (product: any) => {
    if (!window.confirm(`Delete ${product.name}?`)) return;
    try {
      await manageApi(`/products/${product.id}`, "DELETE");
      invalidateProducts();
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Could not delete product",
      );
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="Configuration / club defaults"
        title="Settings"
        description="The source of truth for rates and the products your floor team can sell."
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-extrabold">Resource rates</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Hourly pricing applied to new sessions
              </p>
            </div>
            <SlidersHorizontal size={18} className="text-muted-foreground" />
          </div>
          {resourcesLoading ? (
            <TableSkeleton />
          ) : (
            <div className="divide-y divide-border">
              {resources.map((resource: any) => (
                <ResourceRateRow
                  key={resource.id}
                  resource={resource}
                  onSaved={invalidateRates}
                />
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-extrabold">Cafeteria products</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Current catalogue
              </p>
            </div>
            <Package size={18} className="text-muted-foreground" />
          </div>
          {productsLoading ? (
            <TableSkeleton />
          ) : (
            <div className="divide-y divide-border">
              {products.map((product: any) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between px-5 py-4"
                >
                  <div>
                    <div className="text-xs font-extrabold">{product.name}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {product.category} ·{" "}
                      {product.isActive ? "Active" : "Paused"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tabular text-xs font-extrabold">
                      {money(product.price)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="mt-5 flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/10 p-4">
        <Settings size={17} className="mt-0.5 text-amber-800" />
        <div>
          <div className="text-xs font-extrabold">
            Rate editing is protected
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Changes apply to new sessions. Keep the rate card aligned with the
            prices shown on the floor.
          </p>
        </div>
      </div>
    </>
  );
}

function openManagementEditor(item: any) {
  window.dispatchEvent(
    new CustomEvent("open-management-editor", { detail: item }),
  );
}

function ManagementEditorDialog() {
  const [item, setItem] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const open = (event: Event) => setItem((event as CustomEvent).detail);
    window.addEventListener("open-management-editor", open);
    return () => window.removeEventListener("open-management-editor", open);
  }, []);
  if (!item) return null;
  const isResource = item.type === "resource";
  const save = async () => {
    setSaving(true);
    try {
      const values = Object.fromEntries(
        new FormData(
          document.getElementById("management-editor-form") as HTMLFormElement,
        ),
      );
      const path = isResource
        ? item.id
          ? `/resources/${item.id}`
          : "/resources"
        : `/products/${item.id}`;
      const method = item.id ? "PATCH" : "POST";
      const data = isResource
        ? {
            name: values.name,
            kind: values.kind,
            hourlyRate: Number(values.hourlyRate),
          }
        : {
            name: values.name,
            category: values.category,
            price: Number(values.price),
            isActive: true,
          };
      await manageApi(path, method, data);
      window.dispatchEvent(new Event("management-saved"));
      setItem(null);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Could not save changes",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/35 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Club management
            </div>
            <h2 className="mt-1 text-xl font-extrabold">
              {item.id ? "Edit" : "Add"} {isResource ? "resource" : "product"}
            </h2>
          </div>
          <button
            onClick={() => setItem(null)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>
        <form
          id="management-editor-form"
          className="mt-5 grid grid-cols-2 gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="col-span-2 text-xs font-bold">
            Name
            <input
              name="name"
              defaultValue={item.name ?? ""}
              required
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
            />
          </label>
          {isResource ? (
            <>
              <label className="text-xs font-bold">
                Type
                <select
                  name="kind"
                  defaultValue={item.kind ?? "snooker"}
                  className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
                >
                  <option value="snooker">Snooker</option>
                  <option value="billiards">Billiards</option>
                  <option value="playstation">PlayStation</option>
                </select>
              </label>
              <label className="text-xs font-bold">
                Hourly rate
                <input
                  name="hourlyRate"
                  type="number"
                  min="0"
                  step="0.25"
                  defaultValue={item.hourlyRate ?? 0}
                  required
                  className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
                />
              </label>
            </>
          ) : (
            <>
              <label className="col-span-2 text-xs font-bold">
                Category
                <input
                  name="category"
                  defaultValue={item.category ?? ""}
                  required
                  className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
                />
              </label>
              <label className="col-span-2 text-xs font-bold">
                Sale price
                <input
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={item.price ?? 0}
                  required
                  className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
                />
              </label>
            </>
          )}
          <button
            disabled={saving}
            className="col-span-2 mt-3 rounded-lg bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </form>
      </div>
    </div>
  );
}

function RemoveConfirmationDialog() {
  const [target, setTarget] = useState<{ path: string; label: string } | null>(
    null,
  );
  const [removing, setRemoving] = useState(false);
  const client = useQueryClient();
  useEffect(() => {
    const open = (event: Event) =>
      setTarget((event as CustomEvent<{ path: string; label: string }>).detail);
    window.addEventListener("confirm-remove", open);
    return () => window.removeEventListener("confirm-remove", open);
  }, []);
  if (!target) return null;
  const confirm = async () => {
    setRemoving(true);
    try {
      await manageApi(target.path, "DELETE");
      client.invalidateQueries({ queryKey: getListResourcesQueryKey() });
      client.invalidateQueries({ queryKey: getListProductsQueryKey() });
      client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      setTarget(null);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Could not remove this item",
      );
    } finally {
      setRemoving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/35 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="remove-dialog-title"
        className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Confirm removal
            </div>
            <h2
              id="remove-dialog-title"
              className="mt-1 text-xl font-extrabold"
            >
              Remove {target.label}?
            </h2>
          </div>
          <button
            aria-label="Close confirmation"
            disabled={removing}
            onClick={() => setTarget(null)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          It will be removed from current use, while existing invoices remain
          unchanged.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            disabled={removing}
            onClick={() => setTarget(null)}
            className="rounded-lg border border-border py-2.5 text-xs font-bold hover:bg-muted"
          >
            Cancel
          </button>
          <button
            disabled={removing}
            onClick={() => void confirm()}
            className="rounded-lg bg-destructive py-2.5 text-xs font-bold text-destructive-foreground disabled:opacity-50"
          >
            {removing ? "Removing..." : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ManagementSettingsPage() {
  const { data: resources = [] } = useListResources({
    query: { queryKey: getListResourcesQueryKey() },
  });
  const { data: products = [] } = useListProducts({
    query: { queryKey: getListProductsQueryKey() },
  });
  const client = useQueryClient();
  const refresh = () => {
    client.invalidateQueries({ queryKey: getListResourcesQueryKey() });
    client.invalidateQueries({ queryKey: getListProductsQueryKey() });
    client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  };
  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      refresh();
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Could not save changes",
      );
    }
  };
  const createResource = () => openManagementEditor({ type: "resource" });
  const editResource = (resource: any) =>
    openManagementEditor({ ...resource, type: "resource" });
  const editProduct = (product: any) =>
    openManagementEditor({ ...product, type: "product" });
  useEffect(() => {
    window.addEventListener("management-saved", refresh);
    return () => window.removeEventListener("management-saved", refresh);
  }, []);
  const remove = (path: string, label: string) =>
    window.dispatchEvent(
      new CustomEvent("confirm-remove", { detail: { path, label } }),
    );
  return (
    <>
      <PageHeading
        eyebrow="Configuration / management"
        title="Manage club"
        description="Add, edit, and delete club resources and cafeteria products."
        action={
          <button
            onClick={createResource}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground"
          >
            <Plus size={15} /> Add resource
          </button>
        }
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-extrabold">Club resources</h2>
            <SlidersHorizontal size={18} className="text-muted-foreground" />
          </div>
          <div className="divide-y divide-border">
            {resources.map((resource: any) => (
              <div
                key={resource.id}
                className="flex items-center gap-3 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-extrabold">{resource.name}</div>
                  <div className="mt-1 text-[10px] capitalize text-muted-foreground">
                    {resource.kind} · {money(resource.hourlyRate)}/hr
                  </div>
                </div>
                <button
                  onClick={() => editResource(resource)}
                  aria-label={`Edit ${resource.name}`}
                  className="rounded-md p-2 text-muted-foreground hover:bg-muted"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() =>
                    remove(`/resources/${resource.id}`, resource.name)
                  }
                  aria-label={`Delete ${resource.name}`}
                  className="rounded-md p-2 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-extrabold">Cafeteria products</h2>
            <Package size={18} className="text-muted-foreground" />
          </div>
          <div className="divide-y divide-border">
            {products.map((product: any) => (
              <div
                key={product.id}
                className="flex items-center gap-3 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-extrabold">{product.name}</div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {product.category} · Sale {money(product.price)}
                  </div>
                </div>
                <button
                  onClick={() => editProduct(product)}
                  aria-label={`Edit ${product.name}`}
                  className="rounded-md p-2 text-muted-foreground hover:bg-muted"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() =>
                    remove(`/products/${product.id}`, product.name)
                  }
                  aria-label={`Delete ${product.name}`}
                  className="rounded-md p-2 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function ResourceRateRow({
  resource,
  onSaved,
}: {
  resource: any;
  onSaved: () => void;
}) {
  const update = useUpdateResource();
  const [rate, setRate] = useState(String(resource.hourlyRate));
  const dirty = Number(rate) !== resource.hourlyRate;
  const save = () => {
    const value = Number(rate);
    if (!Number.isFinite(value) || value < 0) return;
    update.mutate(
      { id: resource.id, data: { hourlyRate: value } },
      { onSuccess: onSaved },
    );
  };
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {resource.kind === "playstation" ? (
            <Gamepad2 size={15} />
          ) : (
            <Table2 size={15} />
          )}
        </div>
        <div>
          <div className="text-xs font-extrabold">{resource.name}</div>
          <div className="mt-0.5 text-[10px] capitalize text-muted-foreground">
            {resource.kind}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="mono text-xs text-muted-foreground">/ hour</span>
        <div className="flex items-center rounded-md border border-input bg-background px-2.5 py-1.5">
          <span className="text-xs text-muted-foreground">JOD</span>
          <input
            aria-label={`Rate for ${resource.name}`}
            data-testid={`input-rate-${resource.id}`}
            value={rate}
            onChange={(event) => setRate(event.target.value)}
            type="number"
            min="0"
            step="0.25"
            className="w-16 bg-transparent pl-1 text-right text-xs font-bold outline-none"
          />
        </div>
        <button
          disabled={!dirty || update.isPending}
          aria-label={`Save ${resource.name} rate`}
          data-testid={`button-save-rate-${resource.id}`}
          onClick={save}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-35"
        >
          {update.isPending ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <Check size={15} />
          )}
        </button>
      </div>
    </div>
  );
}

function LoadingPage() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-56 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="h-72 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
function TableSkeleton() {
  return (
    <div className="space-y-3 p-5">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}
function ErrorPage({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="max-w-sm text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-700">
          <RefreshCw size={21} />
        </div>
        <h2 className="mt-4 text-lg font-extrabold">
          Could not load the floor
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The control room is waiting for a fresh signal.
        </p>
        <button
          data-testid="button-retry"
          onClick={onRetry}
          className="mt-5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
function InlineError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="p-10 text-center">
      <p className="text-sm font-bold">Could not load this list.</p>
      <button
        data-testid="button-retry-list"
        onClick={onRetry}
        className="mt-3 text-xs font-bold text-primary underline"
      >
        Try again
      </button>
    </div>
  );
}
function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  action?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon size={20} />
      </div>
      <h3 className="mt-4 text-sm font-extrabold">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{text}</p>
      {action && (
        <button
          data-testid="button-empty-action"
          onClick={action}
          className="mt-4 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
        >
          Start one
        </button>
      )}
    </div>
  );
}

function Router({
  account,
  onAccountChange,
  onLogout,
}: {
  account: Account;
  onAccountChange: (account: Account) => void;
  onLogout: () => void;
}) {
  const [location] = useLocation();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const canManage = isSuperAdmin(account);
  return (
    <ErrorBoundary resetKey={location}>
      <Shell
        account={account}
        onPasswordChange={() => setPasswordOpen(true)}
        onLogout={onLogout}
      >
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/sessions" component={SessionsPage} />
          <Route path="/cafeteria" component={CounterCafeteriaPage} />
          <Route
            path="/reports/invoices"
            component={() =>
              canManage ? <InvoicesPage /> : <AccessDeniedPage />
            }
          />
          <Route
            path="/reports"
            component={() =>
              canManage ? <ReportsPage /> : <AccessDeniedPage />
            }
          />
          <Route
            path="/settings"
            component={() =>
              canManage ? <ManagementSettingsPage /> : <AccessDeniedPage />
            }
          />
          <Route component={NotFound} />
        </Switch>
      </Shell>
      <OverdueAlert />
      <ManagementEditorDialog />
      <RemoveConfirmationDialog />
      <OpenCounterOrderDialog />
      {(account.mustChangePassword || passwordOpen) && (
        <PasswordDialog
          account={account}
          force={account.mustChangePassword}
          onClose={() => setPasswordOpen(false)}
          onDone={(updated) => {
            onAccountChange(updated);
            setPasswordOpen(false);
          }}
        />
      )}
    </ErrorBoundary>
  );
}

function AccessDeniedPage() {
  const [, setLocation] = useLocation();
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
      <LockKeyhole size={28} className="mx-auto text-muted-foreground" />
      <h1 className="mt-4 text-xl font-extrabold">Access denied</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your account does not have permission to open this page.
      </p>
      <button
        onClick={() => setLocation("/")}
        className="mt-6 rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground"
      >
        Back to live floor
      </button>
    </div>
  );
}

function LiveSessionClock() {
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      queryClient.setQueriesData(
        { queryKey: getListSessionsQueryKey() },
        (sessions: any) =>
          Array.isArray(sessions)
            ? sessions.map((session) => withLiveSessionValues(session, now))
            : sessions,
      );
      queryClient.setQueriesData(
        { queryKey: getListResourcesQueryKey() },
        (resources: any) =>
          Array.isArray(resources)
            ? resources.map((resource) => withLiveResourceValues(resource, now))
            : resources,
      );
      queryClient.setQueriesData(
        { queryKey: getGetDashboardQueryKey() },
        (dashboard: any) =>
          dashboard
            ? {
                ...dashboard,
                resources: dashboard.resources?.map((resource: any) =>
                  withLiveResourceValues(resource, now),
                ),
              }
            : dashboard,
      );
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, []);
  return null;
}

function LiveDataSync() {
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") {
        void queryClient.refetchQueries({ type: "active" });
      }
    };
    const interval = window.setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return null;
}

function AuthGate() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  useEffect(() => {
    authApi("/me")
      .then((result) => setAccount(result as Account))
      .catch(() => setAccount(null));
  }, []);
  const logout = async () => {
    await authApi("/logout", {});
    queryClient.clear();
    setAccount(null);
  };
  if (account === undefined) return <div className="min-h-dvh bg-background" />;
  if (!account)
    return (
      <LoginScreen
        onAuthenticated={(authenticated) => {
          queryClient.clear();
          setAccount(authenticated);
        }}
      />
    );
  return (
    <>
      <LiveSessionClock />
      <LiveDataSync />
      <Router
        account={account}
        onAccountChange={setAccount}
        onLogout={() => void logout()}
      />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AuthGate />
      </WouterRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
