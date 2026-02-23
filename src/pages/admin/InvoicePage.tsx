import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Download, Printer, CheckCircle2, Clock, XCircle,
  Smartphone, Building2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/stock-units";
import logoSrc from "@/assets/logo-horizontal.png";

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
  payment_method_name: string | null;
  discount_code: string | null;
  created_at: string;
  confirmed_at: string | null;
  notes: string | null;
  branches?: { name: string; code: string; city?: string | null; full_address?: string | null; phone?: string | null } | null;
}

interface TransactionItem {
  id: string;
  imei: string;
  product_label: string;
  selling_price: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  completed: { label: "LUNAS", color: "#16a34a", icon: CheckCircle2 },
  pending: { label: "MENUNGGU PEMBAYARAN", color: "#d97706", icon: Clock },
  cancelled: { label: "DIBATALKAN", color: "#dc2626", icon: XCircle },
  failed: { label: "GAGAL", color: "#dc2626", icon: XCircle },
};

// ── Invoice Component (print-friendly) ────────────────────────────────────────
function InvoiceDocument({ transaction, items }: { transaction: Transaction; items: TransactionItem[] }) {
  const statusInfo = STATUS_MAP[transaction.status] ?? STATUS_MAP["pending"];
  const StatusIcon = statusInfo.icon;
  const isPaid = transaction.status === "completed";

  return (
    <div
      id="invoice-print-area"
      style={{
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        background: "#ffffff",
        color: "#1a1a1a",
        width: "794px",
        minHeight: "1123px",
        margin: "0 auto",
        padding: "48px 56px",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "40px" }}>
        {/* Brand */}
        <div>
          <img src={logoSrc} alt="Ivalora Gadget" style={{ height: "36px", objectFit: "contain", marginBottom: "8px" }} />
          <p style={{ fontSize: "12px", color: "#6b7280", lineHeight: "1.6", margin: 0 }}>
            {transaction.branches?.full_address ?? "Surabaya, Jawa Timur"}<br />
            {transaction.branches?.phone ? `Telp: ${transaction.branches.phone}` : ""}
          </p>
        </div>

        {/* Invoice Title + Status */}
        <div style={{ textAlign: "right" }}>
          <h1 style={{ fontSize: "28px", fontWeight: "800", letterSpacing: "-0.5px", margin: "0 0 4px 0", color: "#111827" }}>
            INVOICE
          </h1>
          <p style={{ fontSize: "13px", color: "#6b7280", margin: "0 0 10px 0" }}>
            #{transaction.transaction_code ?? transaction.id.slice(0, 8).toUpperCase()}
          </p>
          {/* Status Badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "4px 12px", borderRadius: "20px",
            border: `1.5px solid ${statusInfo.color}`,
            color: statusInfo.color, fontSize: "11px", fontWeight: "700",
            letterSpacing: "0.5px",
          }}>
            {statusInfo.label}
          </div>
        </div>
      </div>

      {/* ── Divider ── */}
      <div style={{ height: "2px", background: "linear-gradient(90deg, #111827 0%, #e5e7eb 100%)", marginBottom: "32px", borderRadius: "2px" }} />

      {/* ── Invoice Meta ── */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "36px" }}>
        {/* Bill To */}
        <div>
          <p style={{ fontSize: "10px", fontWeight: "700", color: "#9ca3af", letterSpacing: "1px", textTransform: "uppercase", margin: "0 0 8px 0" }}>
            Tagihan Kepada
          </p>
          <p style={{ fontSize: "15px", fontWeight: "700", margin: "0 0 4px 0", color: "#111827" }}>
            {transaction.customer_name ?? "—"}
          </p>
          {transaction.customer_email && (
            <p style={{ fontSize: "12px", color: "#6b7280", margin: "0 0 2px 0" }}>{transaction.customer_email}</p>
          )}
          {transaction.customer_phone && (
            <p style={{ fontSize: "12px", color: "#6b7280", margin: 0 }}>{transaction.customer_phone}</p>
          )}
        </div>

        {/* Dates + Payment */}
        <div style={{ textAlign: "right" }}>
          <div style={{ marginBottom: "8px" }}>
            <p style={{ fontSize: "10px", fontWeight: "700", color: "#9ca3af", letterSpacing: "1px", textTransform: "uppercase", margin: "0 0 3px 0" }}>
              Tanggal Invoice
            </p>
            <p style={{ fontSize: "13px", fontWeight: "600", margin: 0, color: "#111827" }}>{formatDate(transaction.created_at)}</p>
          </div>
          {transaction.confirmed_at && (
            <div style={{ marginBottom: "8px" }}>
              <p style={{ fontSize: "10px", fontWeight: "700", color: "#9ca3af", letterSpacing: "1px", textTransform: "uppercase", margin: "0 0 3px 0" }}>
                Tanggal Pembayaran
              </p>
              <p style={{ fontSize: "13px", fontWeight: "600", margin: 0, color: "#16a34a" }}>{formatDate(transaction.confirmed_at)}</p>
            </div>
          )}
          <div>
            <p style={{ fontSize: "10px", fontWeight: "700", color: "#9ca3af", letterSpacing: "1px", textTransform: "uppercase", margin: "0 0 3px 0" }}>
              Metode Pembayaran
            </p>
            <p style={{ fontSize: "13px", fontWeight: "600", margin: 0, color: "#111827" }}>
              {transaction.payment_method_name ?? "—"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Items Table ── */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "28px" }}>
        <thead>
          <tr style={{ background: "#111827" }}>
            <th style={{ padding: "10px 14px", textAlign: "left", fontSize: "11px", fontWeight: "600", color: "#fff", letterSpacing: "0.5px", borderRadius: "0" }}>
              NO
            </th>
            <th style={{ padding: "10px 14px", textAlign: "left", fontSize: "11px", fontWeight: "600", color: "#fff", letterSpacing: "0.5px" }}>
              PRODUK
            </th>
            <th style={{ padding: "10px 14px", textAlign: "left", fontSize: "11px", fontWeight: "600", color: "#fff", letterSpacing: "0.5px" }}>
              IMEI / SERIAL
            </th>
            <th style={{ padding: "10px 14px", textAlign: "right", fontSize: "11px", fontWeight: "600", color: "#fff", letterSpacing: "0.5px" }}>
              HARGA
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id} style={{ background: idx % 2 === 0 ? "#f9fafb" : "#ffffff", borderBottom: "1px solid #e5e7eb" }}>
              <td style={{ padding: "12px 14px", fontSize: "12px", color: "#6b7280", fontWeight: "500" }}>
                {idx + 1}
              </td>
              <td style={{ padding: "12px 14px", fontSize: "13px", color: "#111827", fontWeight: "600" }}>
                {item.product_label}
              </td>
              <td style={{ padding: "12px 14px", fontSize: "11px", color: "#6b7280", fontFamily: "monospace" }}>
                {item.imei}
              </td>
              <td style={{ padding: "12px 14px", fontSize: "13px", color: "#111827", fontWeight: "700", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {formatCurrency(item.selling_price)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Summary ── */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "40px" }}>
        <div style={{ width: "280px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #e5e7eb" }}>
            <span style={{ fontSize: "13px", color: "#6b7280" }}>Subtotal</span>
            <span style={{ fontSize: "13px", color: "#111827", fontWeight: "600", fontVariantNumeric: "tabular-nums" }}>
              {formatCurrency(transaction.subtotal)}
            </span>
          </div>
          {transaction.discount_amount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #e5e7eb" }}>
              <span style={{ fontSize: "13px", color: "#2563eb" }}>
                Diskon{transaction.discount_code ? ` (${transaction.discount_code})` : ""}
              </span>
              <span style={{ fontSize: "13px", color: "#2563eb", fontWeight: "600", fontVariantNumeric: "tabular-nums" }}>
                -{formatCurrency(transaction.discount_amount)}
              </span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 14px", background: "#111827", borderRadius: "8px", marginTop: "8px" }}>
            <span style={{ fontSize: "14px", color: "#fff", fontWeight: "700" }}>TOTAL</span>
            <span style={{ fontSize: "16px", color: "#fff", fontWeight: "800", fontVariantNumeric: "tabular-nums" }}>
              {formatCurrency(transaction.total)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Payment Status Banner (only for PAID) ── */}
      {isPaid && (
        <div style={{
          display: "flex", alignItems: "center", gap: "12px",
          padding: "16px 20px", borderRadius: "12px",
          background: "#f0fdf4", border: "1.5px solid #86efac",
          marginBottom: "32px",
        }}>
          <CheckCircle2 style={{ width: "22px", height: "22px", color: "#16a34a", flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: "13px", fontWeight: "700", color: "#15803d", margin: "0 0 2px 0" }}>
              Pembayaran Telah Diterima
            </p>
            <p style={{ fontSize: "11px", color: "#4ade80", margin: 0 }}>
              {transaction.confirmed_at ? `Dikonfirmasi pada ${formatDateTime(transaction.confirmed_at)}` : "Transaksi selesai"}
            </p>
          </div>
        </div>
      )}

      {/* ── Notes ── */}
      {transaction.notes && (
        <div style={{ padding: "14px 18px", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb", marginBottom: "28px" }}>
          <p style={{ fontSize: "10px", fontWeight: "700", color: "#9ca3af", letterSpacing: "1px", textTransform: "uppercase", margin: "0 0 6px 0" }}>Catatan</p>
          <p style={{ fontSize: "13px", color: "#374151", margin: 0, lineHeight: "1.6" }}>{transaction.notes}</p>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "20px", marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p style={{ fontSize: "11px", color: "#9ca3af", margin: "0 0 2px 0" }}>
            Dokumen ini dibuat secara otomatis oleh sistem Ivalora Gadget RMS
          </p>
          <p style={{ fontSize: "11px", color: "#9ca3af", margin: 0 }}>
            Cabang: {transaction.branches?.name ?? "—"} · Kode: {transaction.branches?.code ?? "—"}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: "11px", color: "#9ca3af", margin: 0 }}>
            Dicetak: {formatDateTime(new Date().toISOString())}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [items, setItems] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: tx } = await supabase
        .from("transactions" as never)
        .select("*, branches(name, code, city, full_address, phone)")
        .eq("id", id)
        .single() as { data: Transaction | null };

      if (!tx) { setLoading(false); return; }
      setTransaction(tx);

      const { data: txItems } = await supabase
        .from("transaction_items" as never)
        .select("id, imei, product_label, selling_price")
        .eq("transaction_id", id);
      setItems((txItems as TransactionItem[]) ?? []);
      setLoading(false);
    })();
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="space-y-3 w-full max-w-2xl p-8">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">Transaksi tidak ditemukan.</p>
          <Button variant="outline" onClick={() => navigate("/admin/transaksi")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Kembali
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Print Styles ── */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #invoice-print-area, #invoice-print-area * { visibility: visible !important; }
          #invoice-print-area {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 32px 48px !important;
            box-shadow: none !important;
          }
          .no-print { display: none !important; }
          @page { size: A4; margin: 0; }
        }
      `}</style>

      {/* ── Toolbar (no-print) ── */}
      <div className="no-print sticky top-0 z-50 bg-background/90 backdrop-blur border-b border-border">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/transaksi/${id}`)} className="gap-1.5 h-8">
              <ArrowLeft className="w-4 h-4" />
              Kembali
            </Button>
            <span className="text-sm font-semibold text-foreground">
              Invoice #{transaction.transaction_code ?? id?.slice(0, 8).toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5 h-8">
              <Printer className="w-4 h-4" />
              Print
            </Button>
            <Button size="sm" onClick={handleDownloadPDF} className="gap-1.5 h-8 bg-primary text-primary-foreground">
              <Download className="w-4 h-4" />
              Download PDF
            </Button>
          </div>
        </div>
      </div>

      {/* ── Invoice Preview ── */}
      <div className="no-print min-h-screen bg-muted/40 py-8 px-4">
        <div className="shadow-2xl rounded-xl overflow-hidden border border-border">
          <InvoiceDocument transaction={transaction} items={items} />
        </div>
      </div>

      {/* ── Print-only: full invoice without wrapper styles ── */}
      <div className="hidden print:block">
        <InvoiceDocument transaction={transaction} items={items} />
      </div>
    </>
  );
}
