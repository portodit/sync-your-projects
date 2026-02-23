import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, Clock, XCircle, AlertCircle,
  Smartphone, User, CreditCard, Zap, RefreshCw,
  Copy, ExternalLink, Building2, FileText, Ban,
  QrCode, Wallet, Banknote, Image as ImageIcon, Upload, Camera,
  PartyPopper, Star, MapPin,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ── Types ─────────────────────────────────────────────────────────────────────
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
  customer_user_id: string | null;
  payment_method_id: string | null;
  payment_method_name: string | null;
  discount_code: string | null;
  created_at: string;
  confirmed_at: string | null;
  created_by: string | null;
  confirmed_by: string | null;
  notes: string | null;
  payment_proof_url: string | null;
  admin_notified: boolean | null;
  branch_id: string;
  branches?: { name: string; code: string; google_maps_url: string | null } | null;
}

interface PaymentMethodDetail {
  id: string;
  name: string;
  type: string;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  qris_image_url: string | null;
}

interface TransactionItem {
  id: string;
  imei: string;
  product_label: string;
  selling_price: number;
}

interface TripayTransaction {
  reference: string;
  merchant_ref: string;
  payment_method: string;
  payment_name: string;
  customer_name: string;
  amount: number;
  fee_merchant: number;
  amount_received: number;
  pay_code: string | null;
  pay_url: string | null;
  checkout_url: string | null;
  status: string;
  paid_at: number | null;
  expired_at: number;
  expired_time?: number;
  instructions?: Array<{
    title: string;
    steps: string[];
  }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType; bg: string }> = {
  pending: { label: "Menunggu Pembayaran", color: "text-amber-600 dark:text-amber-400", icon: Clock, bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800" },
  completed: { label: "Selesai", color: "text-green-600 dark:text-green-400", icon: CheckCircle2, bg: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800" },
  cancelled: { label: "Dibatalkan", color: "text-destructive", icon: XCircle, bg: "bg-destructive/5 border-destructive/20" },
  failed: { label: "Gagal", color: "text-destructive", icon: XCircle, bg: "bg-destructive/5 border-destructive/20" },
  refunded: { label: "Dikembalikan/Refund", color: "text-muted-foreground", icon: RefreshCw, bg: "bg-muted/40 border-muted" },
};

const TRIPAY_STATUS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  UNPAID: { label: "Belum Dibayar", color: "text-amber-600 dark:text-amber-400", icon: Clock },
  PAID: { label: "Sudah Dibayar", color: "text-green-600 dark:text-green-400", icon: CheckCircle2 },
  EXPIRED: { label: "Kadaluarsa", color: "text-destructive", icon: XCircle },
  FAILED: { label: "Gagal", color: "text-destructive", icon: XCircle },
  REFUND: { label: "Dikembalikan", color: "text-muted-foreground", icon: RefreshCw },
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatExpiry(unix: number) {
  if (!unix || unix === 0) return "—";
  const d = new Date(unix * 1000);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("id-ID", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }) + " WIB";
}

function CopyButton({ text }: { text: string }) {
  const { toast } = useToast();
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); toast({ title: "Disalin!" }); }}
      className="ml-1 inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
      title="Salin"
    >
      <Copy className="w-3 h-3" />
    </button>
  );
}

// ── Tripay Panel ─────────────────────────────────────────────────────────────
function TripayPaymentCard({
  tx,
  index,
  total: totalCount,
}: {
  tx: TripayTransaction;
  index: number;
  total: number;
}) {
  const statusInfo = TRIPAY_STATUS[tx.status] ?? { label: tx.status, color: "text-muted-foreground", icon: Clock };
  const StatusIcon = statusInfo.icon;
  const isPaid = tx.status === "PAID";
  const isExpired = tx.status === "EXPIRED" || tx.status === "FAILED";

  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-3",
      isPaid ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/10"
        : isExpired ? "border-destructive/20 bg-destructive/5"
          : "border-primary/20 bg-primary/5"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold",
            totalCount > 1
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground"
          )}>
            {totalCount > 1 ? `${index + 1}/${totalCount}` : <Zap className="w-3.5 h-3.5" />}
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">{tx.payment_name}</p>
            <p className="text-[10px] text-muted-foreground font-mono">{tx.reference}</p>
          </div>
        </div>
        <div className={cn("flex items-center gap-1", statusInfo.color)}>
          <StatusIcon className="w-3.5 h-3.5" />
          <span className="text-[11px] font-semibold">{statusInfo.label}</span>
        </div>
      </div>

      {/* Amount */}
      <div className="flex items-center justify-between py-2 border-y border-border/50">
        <span className="text-xs text-muted-foreground">Jumlah Tagihan</span>
        <span className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(tx.amount)}</span>
      </div>

      {/* VA / Pay Code */}
      {tx.pay_code && !isPaid && !isExpired && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Nomor Virtual Account</p>
          <div className="flex items-center gap-2 bg-background rounded-lg px-3 py-2 border border-border">
            <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-bold text-foreground font-mono tracking-widest flex-1">{tx.pay_code}</span>
            <CopyButton text={tx.pay_code} />
          </div>
        </div>
      )}

      {/* Checkout URL */}
      {tx.checkout_url && !isPaid && !isExpired && (
        <a
          href={tx.checkout_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border border-primary text-primary text-xs font-medium hover:bg-primary/5 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Buka Halaman Pembayaran
        </a>
      )}

      {/* Paid info */}
      {isPaid && tx.paid_at && (
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <p className="text-xs">Dibayar pada {formatDateTime(new Date(tx.paid_at * 1000).toISOString())}</p>
        </div>
      )}

      {/* Expiry — shown when UNPAID */}
      {!isPaid && !isExpired && (tx.expired_at > 0 || (tx.expired_time && tx.expired_time > 0)) && (
        <div className="flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400">
          <Clock className="w-3 h-3 shrink-0" />
          <span>Batas Pembayaran: <span className="font-semibold">{formatExpiry(tx.expired_at || tx.expired_time || 0)}</span></span>
        </div>
      )}

      {/* Expired notice */}
      {isExpired && (tx.expired_at > 0 || (tx.expired_time && tx.expired_time > 0)) && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <XCircle className="w-3 h-3 shrink-0" />
          <span>Batas berlaku: <span className="font-medium">{formatExpiry(tx.expired_at || tx.expired_time || 0)}</span></span>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TransaksiDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [items, setItems] = useState<TransactionItem[]>([]);
  const [tripayTxs, setTripayTxs] = useState<TripayTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTripay, setLoadingTripay] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodDetail | null>(null);

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [adminNotified, setAdminNotified] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [handlerName, setHandlerName] = useState<string | null>(null);

  const { user, activeBranch } = useAuth();

  // ── Fetch handler name ────────────────────────────────────────────────────
  const fetchHandlerName = useCallback(async (userId: string | null) => {
    if (!userId) { setHandlerName(null); return; }
    const { data } = await supabase
      .from("user_profiles" as never)
      .select("full_name, email")
      .eq("id", userId)
      .single() as { data: { full_name: string | null; email: string } | null };
    setHandlerName(data?.full_name || data?.email || null);
  }, []);

  // ── Fetch Transaction ───────────────────────────────────────────────────────
  const fetchTransaction = useCallback(async () => {
    if (!id) return;
    const { data: tx } = await supabase
      .from("transactions" as never)
      .select("*, branches(name, code, google_maps_url)")
      .eq("id", id)
      .single() as { data: Transaction | null };

    if (!tx) { setLoading(false); return; }
    setTransaction(tx);
    fetchHandlerName(tx.created_by);

    const { data: txItems } = await supabase
      .from("transaction_items" as never)
      .select("id, imei, product_label, selling_price")
      .eq("transaction_id", id);
    setItems((txItems as TransactionItem[]) ?? []);

    // Fetch payment method details for manual payments
    if (tx.payment_method_id) {
      const { data: pm } = await supabase
        .from("payment_methods" as never)
        .select("id, name, type, bank_name, account_name, account_number, qris_image_url")
        .eq("id", tx.payment_method_id)
        .single() as { data: PaymentMethodDetail | null };
      setPaymentMethod(pm ?? null);
    }

    setLoading(false);
  }, [id]);

  // ── Fetch TriPay status ─────────────────────────────────────────────────────
  const fetchTripayStatus = useCallback(async (code: string, silent = false) => {
    if (!silent) setLoadingTripay(true);
    else setRefreshing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tripay-check-status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ transactionCode: code, transactionId: id }),
        }
      );
      const json = await res.json();
      if (json.success && json.data) {
        setTripayTxs(json.data);
        const allPaid = json.data.every((t: TripayTransaction) => t.status === "PAID");
        if (allPaid && transaction?.status === "pending") {
          fetchTransaction();
          setSuccessDialogOpen(true);
        }
      }
    } catch {
      if (!silent) toast({ title: "Gagal memuat status TriPay", variant: "destructive" });
    } finally {
      setLoadingTripay(false);
      setRefreshing(false);
    }
  }, [fetchTransaction, toast]);

  // ── Cancel / Refund ──────────────────────────────────────────────────────────
  const handleCancel = async () => {
    if (!id) return;
    setCancelling(true);
    try {
      const { error } = await supabase
        .from("transactions" as never)
        .update({ status: "cancelled" } as never)
        .eq("id", id)
        .in("status", ["pending"] as never);

      if (error) throw error;

      // Release reserved stock units
      if (items.length > 0) {
        const imeis = items.map(i => i.imei);
        await supabase
          .from("stock_units" as never)
          .update({ stock_status: "available", sold_reference_id: null } as never)
          .in("imei", imeis as never)
          .eq("stock_status", "reserved" as never);
      }

      toast({ title: "Transaksi berhasil dibatalkan" });
      setCancelDialogOpen(false);
      fetchTransaction();
    } catch (err) {
      toast({ title: "Gagal membatalkan transaksi", variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  // ── Confirm Payment (Manual) ────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!id) return;
    setConfirming(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase
        .from("transactions" as never)
        .update({
          status: "completed",
          confirmed_by: session?.user?.id ?? null,
          confirmed_at: new Date().toISOString(),
        } as never)
        .eq("id", id)
        .eq("status", "pending" as never);

      if (error) throw error;

      // Mark stock units as sold
      if (items.length > 0) {
        const imeis = items.map(i => i.imei);
        await supabase
          .from("stock_units" as never)
          .update({ stock_status: "sold", sold_channel: "pos" } as never)
          .in("imei", imeis as never)
          .eq("stock_status", "reserved" as never);
      }

      setConfirmDialogOpen(false);
      fetchTransaction();
      setSuccessDialogOpen(true);
    } catch (err) {
      toast({ title: "Gagal mengkonfirmasi pembayaran", variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  };

  // ── Upload payment proof ────────────────────────────────────────────────
  const handleUploadProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploadingProof(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${id}/proof-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("payment-proofs").upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage.from("payment-proofs").getPublicUrl(path);

      await supabase
        .from("transactions" as never)
        .update({ payment_proof_url: publicUrl } as never)
        .eq("id", id);

      toast({ title: "Bukti pembayaran berhasil diunggah" });
      fetchTransaction();
    } catch {
      toast({ title: "Gagal mengunggah bukti pembayaran", variant: "destructive" });
    } finally {
      setUploadingProof(false);
    }
  };

  // ── Toggle admin notified ─────────────────────────────────────────────
  const handleAdminNotified = async (checked: boolean) => {
    if (!id) return;
    setAdminNotified(checked);
    await supabase
      .from("transactions" as never)
      .update({ admin_notified: checked } as never)
      .eq("id", id);
  };

  useEffect(() => {
    fetchTransaction();
  }, [fetchTransaction]);

  // Sync adminNotified state when transaction loads
  useEffect(() => {
    if (transaction) setAdminNotified(!!transaction.admin_notified);
  }, [transaction?.id]);

  const isTriPay = !!transaction?.payment_method_name?.toLowerCase().includes("tripay");

  useEffect(() => {
    if (transaction && isTriPay && transaction.transaction_code) {
      fetchTripayStatus(transaction.transaction_code);
    }
  }, [transaction?.id]);

  // Auto-refresh every 15s if pending TriPay (not cancelled/completed)
  useEffect(() => {
    if (!transaction?.transaction_code) return;
    if (transaction.status === "completed" || transaction.status === "cancelled") return;
    if (!isTriPay) return;

    const interval = setInterval(() => {
      fetchTripayStatus(transaction.transaction_code!, true);
    }, 15_000);
    return () => clearInterval(interval);
  }, [transaction?.id, transaction?.status]);

  const statusInfo = STATUS_CONFIG[transaction?.status ?? ""] ?? STATUS_CONFIG["pending"];
  const StatusIcon = statusInfo.icon;

  const paidCount = tripayTxs.filter(t => t.status === "PAID").length;
  const progressPct = tripayTxs.length > 0 ? Math.round((paidCount / tripayTxs.length) * 100) : 0;

  const isPending = transaction?.status === "pending";
  const isCompleted = transaction?.status === "completed";

  if (loading) {
    return (
      <DashboardLayout pageTitle="Detail Transaksi">
        <div className="max-w-5xl mx-auto space-y-4 animate-pulse">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-muted rounded-xl" />)}
        </div>
      </DashboardLayout>
    );
  }

  if (!transaction) {
    return (
      <DashboardLayout pageTitle="Detail Transaksi">
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <AlertCircle className="w-10 h-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Transaksi tidak ditemukan.</p>
          <Button variant="outline" onClick={() => navigate("/admin/transaksi")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Riwayat Transaksi
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle="Detail Transaksi">
      <div className="max-w-5xl mx-auto space-y-5 pb-10 px-0 sm:px-2">

        {/* ── Back + Header + Invoice button ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/transaksi")} className="gap-1.5 h-8 px-2 shrink-0">
            <ArrowLeft className="w-4 h-4" />
            Transaksi
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-foreground truncate">
              {transaction.transaction_code ?? "Detail Transaksi"}
            </h1>
            <p className="text-xs text-muted-foreground">{formatDateTime(transaction.created_at)}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-semibold shrink-0", statusInfo.bg, statusInfo.color)}>
              <StatusIcon className="w-3.5 h-3.5" />
              {statusInfo.label}
            </div>
            {isCompleted && (
              <Button
                size="sm"
                className="h-8 gap-1.5 shrink-0"
                onClick={() => navigate(`/admin/transaksi/${id}/invoice`)}
              >
                <FileText className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Lihat </span>Invoice
              </Button>
            )}
            {isPending && !isTriPay && (
              <Button
                size="sm"
                className="h-8 gap-1.5 shrink-0 bg-green-600 hover:bg-green-700 text-white"
                onClick={() => setConfirmDialogOpen(true)}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Konfirmasi Pembayaran</span>
                <span className="sm:hidden">Konfirmasi</span>
              </Button>
            )}
            {isPending && (
              <Button
                size="sm"
                variant="destructive"
                className="h-8 gap-1.5 shrink-0"
                onClick={() => setCancelDialogOpen(true)}
              >
                <Ban className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Batalkan</span>
                <span className="sm:hidden">Batal</span>
              </Button>
            )}
          </div>
        </div>

        {/* ── TriPay Panel ── */}
        {isTriPay && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Pembayaran TriPay</h2>
                {tripayTxs.length > 1 && (
                  <Badge variant="secondary" className="text-[10px]">
                    Split {tripayTxs.length}×
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                disabled={refreshing || loadingTripay}
                onClick={() => transaction.transaction_code && fetchTripayStatus(transaction.transaction_code, true)}
              >
                <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
                Refresh
              </Button>
            </div>

            {/* Cancelled warning */}
            {transaction.status === "cancelled" && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <p className="text-xs font-semibold">Transaksi Dibatalkan di Sistem</p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Transaksi ini telah dibatalkan di Ivalora Gadget. TriPay tidak memiliki API pembatalan, sehingga status di TriPay mungkin masih "Belum Dibayar" hingga otomatis kedaluwarsa.
                  <strong className="text-foreground"> Jika pembayaran tetap dilakukan di TriPay, admin akan mendapatkan notifikasi</strong> untuk ditindaklanjuti (refund manual).
                </p>
                {tripayTxs.length > 0 && tripayTxs[0].expired_at > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    TriPay akan otomatis kedaluwarsa pada: <span className="font-semibold">{formatExpiry(tripayTxs[0].expired_at)}</span>
                  </p>
                )}
              </div>
            )}

            {/* Progress bar for split */}
            {tripayTxs.length > 1 && transaction.status !== "cancelled" && (
              <div className="bg-card border border-border rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Progress Pembayaran</span>
                  <span className="font-semibold text-foreground">{paidCount}/{tripayTxs.length} terbayar</span>
                </div>
                <Progress value={progressPct} className="h-2" />
                <p className="text-[10px] text-muted-foreground">
                  Total harus dibayar dalam <span className="font-semibold">{tripayTxs.length} transaksi terpisah</span> karena nilai melebihi Rp 10 juta.
                </p>
              </div>
            )}

            {/* Cards — only show payment details if not cancelled */}
            {transaction.status !== "cancelled" && (
              <>
                {loadingTripay ? (
                  <div className="space-y-3">
                    {[...Array(1)].map((_, i) => <div key={i} className="h-36 bg-muted rounded-xl animate-pulse" />)}
                  </div>
                ) : tripayTxs.length === 0 ? (
                  <div className="p-4 rounded-xl border border-border bg-muted/40 text-center">
                    <p className="text-xs text-muted-foreground">Data TriPay belum tersedia atau gagal dimuat.</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-xs h-7"
                      onClick={() => transaction.transaction_code && fetchTripayStatus(transaction.transaction_code)}
                    >
                      Coba Lagi
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {tripayTxs.map((t, i) => (
                      <TripayPaymentCard key={t.reference} tx={t} index={i} total={tripayTxs.length} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Manual payment info ── */}
        {!isTriPay && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-border">
              {paymentMethod?.type === "other" ? (
                <QrCode className="w-5 h-5 text-primary shrink-0" />
              ) : paymentMethod?.type === "ewallet" ? (
                <Wallet className="w-5 h-5 text-primary shrink-0" />
              ) : (
                <Banknote className="w-5 h-5 text-primary shrink-0" />
              )}
              <div>
                <p className="text-xs font-semibold text-foreground">{transaction.payment_method_name ?? "—"}</p>
                <p className="text-[10px] text-muted-foreground">Pembayaran Manual</p>
              </div>
            </div>

            {/* Payment Instructions */}
            <div className="p-4 space-y-3">
              {/* Total to pay */}
              <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-primary/5 border border-primary/10">
                <span className="text-xs text-muted-foreground">Total yang harus dibayar</span>
                <span className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(transaction.total)}</span>
              </div>

              {/* QRIS Image */}
              {paymentMethod?.type === "other" && paymentMethod.qris_image_url && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Scan QR Code untuk Pembayaran</p>
                  <div className="flex justify-center p-4 bg-white rounded-lg border border-border">
                    <img
                      src={paymentMethod.qris_image_url}
                      alt="QRIS"
                      className="max-w-[240px] w-full h-auto rounded"
                    />
                  </div>
                </div>
              )}

              {/* Bank Transfer Instructions */}
              {paymentMethod?.type === "bank_transfer" && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Instruksi Transfer Bank</p>
                  <div className="bg-muted/40 rounded-lg p-3 space-y-2 text-xs">
                    {paymentMethod.bank_name && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Bank</span>
                        <span className="font-semibold text-foreground">{paymentMethod.bank_name}</span>
                      </div>
                    )}
                    {paymentMethod.account_number && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">No. Rekening</span>
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-foreground font-mono tracking-wider">{paymentMethod.account_number}</span>
                          <CopyButton text={paymentMethod.account_number} />
                        </div>
                      </div>
                    )}
                    {paymentMethod.account_name && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Atas Nama</span>
                        <span className="font-semibold text-foreground">{paymentMethod.account_name}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <span className="text-muted-foreground">Jumlah Transfer</span>
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-foreground tabular-nums">{formatCurrency(transaction.total)}</span>
                        <CopyButton text={transaction.total.toString()} />
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Pastikan nominal transfer sesuai hingga digit terakhir agar pembayaran dapat diverifikasi.
                  </p>
                </div>
              )}

              {/* E-Wallet Instructions */}
              {paymentMethod?.type === "ewallet" && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Instruksi Pembayaran E-Wallet</p>
                  <div className="bg-muted/40 rounded-lg p-3 space-y-2 text-xs">
                    {paymentMethod.bank_name && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Platform</span>
                        <span className="font-semibold text-foreground">{paymentMethod.bank_name}</span>
                      </div>
                    )}
                    {paymentMethod.account_number && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Nomor</span>
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-foreground font-mono tracking-wider">{paymentMethod.account_number}</span>
                          <CopyButton text={paymentMethod.account_number} />
                        </div>
                      </div>
                    )}
                    {paymentMethod.account_name && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Atas Nama</span>
                        <span className="font-semibold text-foreground">{paymentMethod.account_name}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <span className="text-muted-foreground">Jumlah Bayar</span>
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-foreground tabular-nums">{formatCurrency(transaction.total)}</span>
                        <CopyButton text={transaction.total.toString()} />
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Transfer ke nomor di atas melalui aplikasi {paymentMethod.bank_name ?? "e-wallet"} Anda. Pastikan nominal sesuai.
                  </p>
                </div>
              )}

              {/* QRIS (other type) text instructions */}
              {paymentMethod?.type === "other" && (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Instruksi Pembayaran QRIS</p>
                  <div className="bg-muted/40 rounded-lg p-3 space-y-1.5 text-xs text-muted-foreground">
                    <p>1. Buka aplikasi e-wallet atau mobile banking Anda</p>
                    <p>2. Pilih menu <span className="font-semibold text-foreground">Scan QR / QRIS</span></p>
                    <p>3. Scan kode QR di atas</p>
                    <p>4. Masukkan jumlah: <span className="font-bold text-foreground tabular-nums">{formatCurrency(transaction.total)}</span></p>
                    <p>5. Konfirmasi dan selesaikan pembayaran</p>
                  </div>
                </div>
              )}

              {/* No payment method detail available */}
              {!paymentMethod && (
                <p className="text-xs text-muted-foreground">Detail metode pembayaran tidak tersedia.</p>
              )}
            </div>
          </div>
        )}

        {/* ── Payment Proof & Admin Notification (Manual only) ── */}
        {!isTriPay && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Bukti Pembayaran</h2>

            {/* Existing proof image */}
            {transaction.payment_proof_url && (
              <div className="space-y-2">
                <img
                  src={transaction.payment_proof_url}
                  alt="Bukti pembayaran"
                  className="w-full max-w-xs rounded-lg border border-border cursor-pointer"
                  onClick={() => window.open(transaction.payment_proof_url!, "_blank")}
                />
                <p className="text-[10px] text-muted-foreground">Klik gambar untuk melihat ukuran penuh</p>
              </div>
            )}

            {/* Upload button (only if pending) */}
            {isPending && (
              <div className="space-y-2">
                <label className="flex items-center justify-center gap-2 w-full py-3 rounded-lg border-2 border-dashed border-border hover:border-primary/40 cursor-pointer transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleUploadProof}
                    disabled={uploadingProof}
                  />
                  {uploadingProof ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Upload className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="text-xs text-muted-foreground">
                    {transaction.payment_proof_url ? "Ganti bukti pembayaran" : "Unggah bukti pembayaran"}
                  </span>
                </label>
              </div>
            )}

            {!transaction.payment_proof_url && !isPending && (
              <p className="text-xs text-muted-foreground italic">Tidak ada bukti pembayaran yang diunggah.</p>
            )}

            {/* Admin notification checkbox */}
            {isPending && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border border-border">
                <Checkbox
                  id="admin-notified"
                  checked={adminNotified}
                  onCheckedChange={(checked) => handleAdminNotified(!!checked)}
                  className="mt-0.5"
                />
                <label htmlFor="admin-notified" className="text-xs text-foreground leading-relaxed cursor-pointer">
                  Sudah memberitahu admin bahwa ada transaksi pembayaran manual di store dan sudah dikabari masuk pembayarannya
                </label>
              </div>
            )}

            {!isPending && transaction.admin_notified && (
              <div className="flex items-center gap-2 text-[11px] text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Admin sudah diberitahu tentang pembayaran ini</span>
              </div>
            )}
          </div>
        )}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Item Dibeli</h2>
          <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
            {items.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Smartphone className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{item.product_label}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{item.imei}</p>
                </div>
                <p className="text-xs font-bold text-foreground tabular-nums shrink-0">{formatCurrency(item.selling_price)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Price Summary ── */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Subtotal</span>
            <span className="tabular-nums font-medium text-foreground">{formatCurrency(transaction.subtotal)}</span>
          </div>
          {transaction.discount_amount > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-blue-600 dark:text-blue-400">
                Diskon{transaction.discount_code ? ` (${transaction.discount_code})` : ""}
              </span>
              <span className="text-blue-600 dark:text-blue-400 tabular-nums font-medium">
                -{formatCurrency(transaction.discount_amount)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-border text-sm font-bold text-foreground">
            <span>Total</span>
            <span className="tabular-nums">{formatCurrency(transaction.total)}</span>
          </div>
        </div>

        {/* ── Customer ── */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Data Customer</h2>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap w-[120px] sm:w-[140px]">Tipe Customer</td>
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    {transaction.customer_user_id ? "Akun Terdaftar" : "Tanpa Akun"}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">Nama</td>
                  <td className="px-4 py-2.5 font-medium text-foreground">{transaction.customer_name || "—"}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">Alamat Email</td>
                  <td className="px-4 py-2.5 font-medium text-foreground">{transaction.customer_email || "Tidak ada"}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">Nomor Telepon</td>
                  <td className="px-4 py-2.5 font-medium text-foreground">{transaction.customer_phone || "Tidak ada"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Notes ── */}
        {transaction.notes && (
          <div className="bg-muted/40 border border-border rounded-xl p-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Catatan</p>
            <p className="text-xs text-foreground">{transaction.notes}</p>
          </div>
        )}
      </div>

      {/* ── Cancel Dialog ── */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan Transaksi?</AlertDialogTitle>
            <AlertDialogDescription>
              Transaksi <span className="font-semibold">{transaction?.transaction_code}</span> akan dibatalkan dan stok unit yang terkait akan dikembalikan ke status tersedia.
              Tindakan ini tidak dapat diurungkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Kembali</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? "Membatalkan..." : "Ya, Batalkan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Confirm Dialog ── */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi Pembayaran?</AlertDialogTitle>
            <AlertDialogDescription>
              Pembayaran untuk transaksi <span className="font-semibold">{transaction?.transaction_code}</span> sebesar <span className="font-semibold">{formatCurrency(transaction.total)}</span> akan dikonfirmasi. Status transaksi akan berubah menjadi <span className="font-semibold">Selesai</span> dan stok unit akan ditandai sebagai terjual.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirming}>Kembali</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={confirming}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              {confirming ? "Mengkonfirmasi..." : "Ya, Konfirmasi"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Success Dialog ── */}
      <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <PartyPopper className="w-5 h-5" />
              Transaksi Berhasil! 🎉
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Transaction summary table */}
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="text-xs text-muted-foreground py-2 font-medium">ID Transaksi</TableCell>
                    <TableCell className="text-xs font-semibold text-foreground py-2">{transaction?.transaction_code ?? "—"}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs text-muted-foreground py-2 font-medium">ID Invoice</TableCell>
                    <TableCell className="text-xs font-semibold text-foreground py-2">{transaction?.id?.slice(0, 8).toUpperCase() ?? "—"}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs text-muted-foreground py-2 font-medium">Tanggal</TableCell>
                    <TableCell className="text-xs text-foreground py-2">{transaction ? formatDateTime(transaction.created_at) : "—"}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs text-muted-foreground py-2 font-medium">Total</TableCell>
                    <TableCell className="text-xs font-bold text-foreground py-2">{formatCurrency(transaction?.total ?? 0)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs text-muted-foreground py-2 font-medium">Dihandle oleh</TableCell>
                    <TableCell className="text-xs font-semibold text-foreground py-2">{handlerName ?? user?.email ?? "—"}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs text-muted-foreground py-2 font-medium">Cabang</TableCell>
                    <TableCell className="text-xs text-foreground py-2">{transaction?.branches?.name ?? "—"}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Reminder note */}
            <div className="rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4 space-y-2.5">
              <p className="text-xs font-semibold text-green-700 dark:text-green-300">📋 Checklist Setelah Transaksi:</p>
              <ul className="space-y-1.5 text-[11px] text-green-700 dark:text-green-300 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span>😊</span>
                  <span>Ucapkan <strong>terima kasih</strong> kepada customer dan tunjukkan senyum terbaik!</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>🎁</span>
                  <span>Berikan <strong>bonus</strong>: Tumbler/Glass, Tas, dan Casing gratis.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>📸</span>
                  <span>Minta customer untuk <strong>foto testimoni</strong> bersama produk.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>⭐</span>
                  <span>
                    Arahkan customer untuk memberikan <strong>rating di Google Maps</strong> untuk cabang{" "}
                    <strong>{transaction?.branches?.name ?? "ini"}</strong>.
                  </span>
                </li>
              </ul>
              {transaction?.branches?.google_maps_url && (
                <a
                  href={transaction.branches.google_maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 text-xs font-medium hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors mt-1"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  Buka Google Maps — {transaction.branches.name}
                </a>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5"
                onClick={() => {
                  setSuccessDialogOpen(false);
                  navigate(`/admin/transaksi/${id}/invoice`);
                }}
              >
                <FileText className="w-3.5 h-3.5" />
                Lihat Invoice
              </Button>
              <Button
                size="sm"
                className="flex-1 gap-1.5"
                onClick={() => setSuccessDialogOpen(false)}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Selesai
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
