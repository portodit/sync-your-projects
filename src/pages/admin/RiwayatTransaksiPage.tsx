import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Filter, Calendar, ChevronRight, RefreshCw,
  ShoppingCart, Globe, ShoppingBag, Store, Package,
  CheckCircle2, Clock, XCircle, AlertCircle, Trash2,
  CreditCard, Zap, User,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/stock-units";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Branch { id: string; name: string; code: string }

interface Transaction {
  id: string;
  transaction_code: string | null;
  status: string;
  subtotal: number;
  discount_amount: number;
  total: number;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  payment_method_id: string | null;
  payment_method_name: string | null;
  discount_code: string | null;
  created_at: string;
  confirmed_at: string | null;
  notes: string | null;
  branch_id: string;
  created_by: string | null;
  branches: { name: string; code: string } | null;
  transaction_items: { id: string }[];
}

// ── Channel config ─────────────────────────────────────────────────────────────
type ChannelFilter = "all" | "pos" | "website" | "shopee" | "tokopedia";

const CHANNEL_CONFIG: Record<ChannelFilter, {
  label: string;
  icon: React.ElementType;
  color: string;
  badge: string;
  soldChannels: string[];
}> = {
  all: { label: "Semua", icon: Package, color: "text-foreground", badge: "bg-muted text-foreground", soldChannels: [] },
  pos: { label: "Point of Sales", icon: Store, color: "text-blue-600 dark:text-blue-400", badge: "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300", soldChannels: ["pos", "manual"] },
  website: { label: "Website / Online", icon: Globe, color: "text-violet-600 dark:text-violet-400", badge: "bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300", soldChannels: ["website"] },
  shopee: { label: "Shopee", icon: ShoppingBag, color: "text-orange-600 dark:text-orange-400", badge: "bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300", soldChannels: ["ecommerce_shopee"] },
  tokopedia: { label: "Tokopedia", icon: ShoppingCart, color: "text-green-600 dark:text-green-400", badge: "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300", soldChannels: ["ecommerce_tokopedia"] },
};

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; dot: string }> = {
  pending: { label: "Pending", icon: Clock, color: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  completed: { label: "Selesai", icon: CheckCircle2, color: "text-green-600 dark:text-green-400", dot: "bg-green-500" },
  cancelled: { label: "Dibatalkan", icon: XCircle, color: "text-destructive", dot: "bg-destructive" },
  failed: { label: "Gagal", icon: XCircle, color: "text-destructive", dot: "bg-destructive" },
  refunded: { label: "Refund", icon: RefreshCw, color: "text-muted-foreground", dot: "bg-muted-foreground" },
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function getChannelFromTransaction(tx: Transaction): ChannelFilter {
  const pmName = (tx.payment_method_name ?? "").toLowerCase();
  if (pmName.includes("shopee")) return "shopee";
  if (pmName.includes("tokopedia")) return "tokopedia";
  if (pmName.includes("tripay") || pmName.includes("online") || pmName.includes("website")) return "website";
  return "pos";
}

function getPaymentLabel(tx: Transaction): { type: string; detail: string } {
  const pmName = tx.payment_method_name ?? "";
  if (pmName.toLowerCase().includes("tripay")) {
    const detail = pmName.replace(/^tripay\s*[-–—]\s*/i, "").trim();
    return { type: "TriPay", detail: detail || "Online" };
  }
  // Manual payment
  return { type: "Manual", detail: pmName || "—" };
}

function ChannelBadge({ channel }: { channel: ChannelFilter }) {
  const cfg = CHANNEL_CONFIG[channel];
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap shrink-0", cfg.badge)}>
      <Icon className="w-2.5 h-2.5 shrink-0" />
      {cfg.label}
    </span>
  );
}

function PaymentBadge({ tx }: { tx: Transaction }) {
  const { type, detail } = getPaymentLabel(tx);
  const isTriPay = type === "TriPay";
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md whitespace-nowrap shrink-0",
      isTriPay
        ? "bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300"
        : "bg-muted text-muted-foreground"
    )}>
      {isTriPay ? <Zap className="w-2.5 h-2.5 shrink-0" /> : <CreditCard className="w-2.5 h-2.5 shrink-0" />}
      {detail}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold shrink-0", cfg.color)}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function RiwayatTransaksiPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { role } = useAuth();
  const isSuperAdmin = role === "super_admin";

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [handlerNames, setHandlerNames] = useState<Record<string, string>>({});

  // Filters
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  // Fetch branches (super_admin only)
  useEffect(() => {
    if (!isSuperAdmin) return;
    supabase.from("branches" as never).select("id, name, code").then(({ data }) => {
      if (data) setBranches(data as Branch[]);
    });
  }, [isSuperAdmin]);

  // Fetch transactions
  const fetchTransactions = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      let query = (supabase as never as { from: (t: string) => any })
        .from("transactions")
        .select("id, transaction_code, status, subtotal, discount_amount, total, customer_name, customer_email, customer_phone, payment_method_id, payment_method_name, discount_code, created_at, confirmed_at, notes, branch_id, created_by, branches(name, code), transaction_items(id)")
        .order("created_at", { ascending: false })
        .limit(200);

      if (branchFilter !== "all") query = query.eq("branch_id", branchFilter);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (dateFrom) query = query.gte("created_at", `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59`);

      const { data, error } = await query;
      if (error) throw error;
      const txs = (data as Transaction[]) ?? [];
      setTransactions(txs);

      // Fetch handler names
      const userIds = Array.from(new Set(txs.map(t => t.created_by).filter(Boolean))) as string[];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("user_profiles" as never)
          .select("id, full_name, email")
          .in("id", userIds as never);
        const map: Record<string, string> = {};
        for (const p of (profiles as Array<{ id: string; full_name: string | null; email: string }>) ?? []) {
          map[p.id] = p.full_name || p.email;
        }
        setHandlerNames(map);
      }
    } catch (err) {
      toast({ title: "Gagal memuat transaksi", variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [branchFilter, statusFilter, dateFrom, dateTo, toast]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  // Delete transaction (only non-completed)
  const handleDelete = async () => {
    if (!deleteTargetId) return;
    setDeleting(true);
    try {
      // Find items to release reserved stock
      const { data: txItems } = await supabase
        .from("transaction_items" as never)
        .select("imei")
        .eq("transaction_id", deleteTargetId as never);

      if (txItems && (txItems as { imei: string }[]).length > 0) {
        const imeis = (txItems as { imei: string }[]).map(i => i.imei);
        await supabase
          .from("stock_units" as never)
          .update({ stock_status: "available", sold_reference_id: null } as never)
          .in("imei", imeis as never)
          .eq("stock_status", "reserved" as never);
      }

      // Delete transaction items first
      await supabase
        .from("transaction_items" as never)
        .delete()
        .eq("transaction_id", deleteTargetId as never);

      // Delete transaction
      const { error } = await supabase
        .from("transactions" as never)
        .delete()
        .eq("id", deleteTargetId as never)
        .not("status", "eq", "completed" as never);

      if (error) throw error;

      toast({ title: "Transaksi berhasil dihapus" });
      setDeleteTargetId(null);
      fetchTransactions(true);
    } catch {
      toast({ title: "Gagal menghapus transaksi", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  // Client-side filtering for channel + search
  const filtered = transactions.filter(tx => {
    const txChannel = getChannelFromTransaction(tx);
    if (channelFilter !== "all" && txChannel !== channelFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchCode = tx.transaction_code?.toLowerCase().includes(q);
      const matchCustomer = tx.customer_name?.toLowerCase().includes(q);
      const matchPhone = tx.customer_phone?.toLowerCase().includes(q);
      const matchEmail = tx.customer_email?.toLowerCase().includes(q);
      if (!matchCode && !matchCustomer && !matchPhone && !matchEmail) return false;
    }
    return true;
  });

  // Summary counts per channel
  const counts = {
    all: transactions.length,
    pos: transactions.filter(t => getChannelFromTransaction(t) === "pos").length,
    website: transactions.filter(t => getChannelFromTransaction(t) === "website").length,
    shopee: transactions.filter(t => getChannelFromTransaction(t) === "shopee").length,
    tokopedia: transactions.filter(t => getChannelFromTransaction(t) === "tokopedia").length,
  } as Record<ChannelFilter, number>;

  const totalRevenue = filtered.filter(t => t.status === "completed").reduce((acc, t) => acc + t.total, 0);
  const deleteTarget = transactions.find(t => t.id === deleteTargetId);

  return (
    <DashboardLayout pageTitle="Riwayat Transaksi">
      <div className="space-y-4 pb-10">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-foreground">Riwayat Transaksi</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {filtered.length} transaksi · Revenue: <span className="font-semibold text-foreground">{formatCurrency(totalRevenue)}</span>
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 self-start sm:self-auto"
            onClick={() => fetchTransactions(true)}
            disabled={refreshing}
          >
            <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* ── Channel Tabs ────────────────────────────────────────── */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {(Object.entries(CHANNEL_CONFIG) as [ChannelFilter, typeof CHANNEL_CONFIG[ChannelFilter]][]).map(([key, cfg]) => {
            const Icon = cfg.icon;
            const isActive = channelFilter === key;
            return (
              <button
                key={key}
                onClick={() => setChannelFilter(key)}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {cfg.label}
                <span className={cn(
                  "ml-0.5 px-1.5 py-0.5 rounded-full text-[10px]",
                  isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  {counts[key]}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Filters Row ─────────────────────────────────────────── */}
        <div className="space-y-2">
          {/* Row 1: Search + Status + Branch (branch only super_admin) */}
          <div className={cn("grid gap-2 grid-cols-1", isSuperAdmin ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Kode, nama, telepon..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 text-sm">
                <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Selesai</SelectItem>
                <SelectItem value="cancelled">Dibatalkan</SelectItem>
                <SelectItem value="refunded">Refund</SelectItem>
              </SelectContent>
            </Select>

            {isSuperAdmin && (
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger className="h-9 text-sm">
                  <Store className="w-3.5 h-3.5 mr-1.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Cabang" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Cabang</SelectItem>
                  {branches.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Row 2: Date filters */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
            <div className="flex items-center text-xs text-muted-foreground shrink-0">s/d</div>
            <div className="relative flex-1">
              <Input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>
        </div>

        {/* ── List ───────────────────────────────────────────────── */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <AlertCircle className="w-10 h-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">
              Tidak ada transaksi{channelFilter !== "all" ? ` untuk channel ${CHANNEL_CONFIG[channelFilter].label}` : ""}.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(tx => {
              const channel = getChannelFromTransaction(tx);
              const statusCfg = STATUS_CONFIG[tx.status] ?? STATUS_CONFIG.pending;
              const StatusIcon = statusCfg.icon;
              const itemCount = tx.transaction_items?.length ?? 0;
              const isDeletable = tx.status !== "completed";

              return (
                <div key={tx.id} className="relative group">
                  <button
                    onClick={() => navigate(`/admin/transaksi/${tx.id}`)}
                    className="w-full text-left bg-card border border-border rounded-xl px-4 py-3 hover:border-primary/40 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", statusCfg.dot)} />
                      <div className="flex-1 min-w-0 pr-8">
                        {/* Row 1: Code + Channel + Total */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                            <span className="text-sm font-bold text-foreground truncate min-w-0">
                              {tx.transaction_code ?? tx.id.slice(0, 8).toUpperCase()}
                            </span>
                            <ChannelBadge channel={channel} />
                          </div>
                          <span className="text-sm font-bold text-foreground tabular-nums shrink-0 ml-2">
                            {formatCurrency(tx.total)}
                          </span>
                        </div>

                        {/* Row 2: Customer + Branch + Items + Status */}
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <div className="flex items-center gap-3 text-xs text-muted-foreground min-w-0">
                            {tx.customer_name ? (
                              <span className="truncate">{tx.customer_name}</span>
                            ) : tx.customer_phone ? (
                              <span className="truncate">{tx.customer_phone}</span>
                            ) : (
                              <span className="italic">Tanpa nama</span>
                            )}
                            {tx.branches && (
                              <span className="hidden sm:inline shrink-0">· {tx.branches.name}</span>
                            )}
                            <span className="shrink-0">{itemCount} item</span>
                          </div>
                          <StatusBadge status={tx.status} />
                        </div>

                        {/* Row 3: Date + Payment method */}
                        <div className="flex items-center justify-between mt-1">
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap">
                            <Calendar className="w-2.5 h-2.5 shrink-0" />
                            <span>{formatDate(tx.created_at)}</span>
                            <span>{formatTime(tx.created_at)}</span>
                            {tx.branches && (
                              <span className="sm:hidden">· {tx.branches.code}</span>
                            )}
                            <span className="hidden sm:inline">·</span>
                            <PaymentBadge tx={tx} />
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                        </div>

                        {/* Row 4: Handler info + mobile payment badge */}
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <div className="sm:hidden"><PaymentBadge tx={tx} /></div>
                          {tx.created_by && handlerNames[tx.created_by] && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                              <User className="w-2.5 h-2.5 shrink-0" />
                              {handlerNames[tx.created_by]}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Delete button — only for non-completed, appears on hover */}
                  {isDeletable && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTargetId(tx.id); }}
                      className="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                      title="Hapus transaksi"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Shopee / Tokopedia note ─────────────────────────────── */}
        {(channelFilter === "shopee" || channelFilter === "tokopedia") && filtered.length > 0 && (
          <div className="bg-muted/50 border border-border rounded-xl p-3 flex gap-2">
            <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Data transaksi {CHANNEL_CONFIG[channelFilter].label} ditampilkan berdasarkan catatan yang diinput secara manual.
              Klik transaksi untuk melihat detail dan informasi pelanggan.
            </p>
          </div>
        )}
      </div>

      {/* ── Delete Confirmation Dialog ── */}
      <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Transaksi?</AlertDialogTitle>
            <AlertDialogDescription>
              Transaksi <span className="font-semibold">{deleteTarget?.transaction_code ?? deleteTargetId?.slice(0, 8).toUpperCase()}</span> akan dihapus secara permanen.
              {deleteTarget?.status === "pending" && " Stok unit yang dicadangkan akan dikembalikan ke status tersedia."}
              {" "}Tindakan ini tidak dapat diurungkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Menghapus..." : "Ya, Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
