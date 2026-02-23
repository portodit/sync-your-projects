import { useState, useEffect, useRef } from "react";
import {
  Plus, Pencil, Trash2, Building2, Wallet, Banknote, CreditCard,
  GripVertical, ChevronDown, X, AlertCircle, Image as ImageIcon,
  MapPin,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface PaymentMethod {
  id: string;
  branch_id: string;
  name: string;
  type: string;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  is_active: boolean;
  sort_order: number;
  qris_image_url: string | null;
}

interface BranchOption {
  id: string;
  name: string;
  code: string;
}

const PAYMENT_TYPES = [
  { value: "cash", label: "Tunai (Cash)", icon: Banknote },
  { value: "bank_transfer", label: "Transfer Bank", icon: Building2 },
  { value: "ewallet", label: "E-Wallet", icon: Wallet },
  { value: "other", label: "Lainnya (QRIS, dll)", icon: CreditCard },
];

const TYPE_ICON: Record<string, React.ElementType> = {
  cash: Banknote,
  bank_transfer: Building2,
  ewallet: Wallet,
  other: CreditCard,
};

const TYPE_LABEL: Record<string, string> = {
  cash: "Tunai",
  bank_transfer: "Transfer Bank",
  ewallet: "E-Wallet",
  other: "Lainnya",
};

interface MethodFormData {
  bank_name: string;
  type: string;
  account_number: string;
  account_name: string;
}

const DEFAULT_FORM: MethodFormData = {
  bank_name: "",
  type: "bank_transfer",
  account_number: "",
  account_name: "",
};

export default function KanalPembayaranPage() {
  const { activeBranch, userBranches, role } = useAuth();
  const { toast } = useToast();

  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  // Branch selector
  const [allBranches, setAllBranches] = useState<BranchOption[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<BranchOption | null>(null);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const branchRef = useRef<HTMLDivElement>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MethodFormData>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);

  // QRIS image upload state
  const [qrisFile, setQrisFile] = useState<File | null>(null);
  const [qrisPreview, setQrisPreview] = useState<string | null>(null);
  const [existingQrisUrl, setExistingQrisUrl] = useState<string | null>(null);
  const [uploadingQris, setUploadingQris] = useState(false);
  const [qrisDragOver, setQrisDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const branchId = selectedBranch?.id ?? null;

  // ── Init branches ──────────────────────────────────────────────────────
  useEffect(() => {
    if (role === "super_admin") {
      supabase
        .from("branches")
        .select("id, name, code")
        .eq("is_active", true)
        .order("name")
        .then(({ data }) => {
          const bs = (data as BranchOption[]) ?? [];
          setAllBranches(bs);
          if (!selectedBranch && bs.length > 0) {
            const active = bs.find(b => b.id === activeBranch?.id);
            setSelectedBranch(active ?? bs[0]);
          }
        });
    } else {
      // admin_branch / employee: only their branches
      const branches = (userBranches ?? []).map(b => ({ id: b.id, name: b.name, code: (b as BranchOption).code ?? "" }));
      setAllBranches(branches);
      if (!selectedBranch && branches.length > 0) {
        const active = branches.find(b => b.id === activeBranch?.id);
        setSelectedBranch(active ?? branches[0]);
      }
    }
  }, [role, activeBranch, userBranches]);

  // Close branch dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (branchRef.current && !branchRef.current.contains(e.target as Node)) setBranchDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchMethods = async (bid: string) => {
    setLoading(true);
    const { data } = await supabase
      .from("payment_methods")
      .select("*")
      .eq("branch_id", bid)
      .order("sort_order");
    setMethods((data as unknown as PaymentMethod[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (branchId) fetchMethods(branchId);
    else setLoading(false);
  }, [branchId]);

  const openCreate = () => {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setQrisFile(null);
    setQrisPreview(null);
    setExistingQrisUrl(null);
    setModalOpen(true);
  };

  const openEdit = (m: PaymentMethod) => {
    setEditingId(m.id);
    setForm({
      bank_name: m.bank_name ?? m.name ?? "",
      type: m.type,
      account_number: m.account_number ?? "",
      account_name: m.account_name ?? "",
    });
    setQrisFile(null);
    setQrisPreview(null);
    setExistingQrisUrl(m.qris_image_url ?? null);
    setModalOpen(true);
  };

  function deriveName(type: string, bank_name: string): string {
    if (type === "cash") return "Tunai";
    if (type === "other") return bank_name.trim() || "QRIS / Lainnya";
    return bank_name.trim() || (type === "ewallet" ? "E-Wallet" : "Transfer Bank");
  }

  const handleQrisFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrisFile(file);
    const reader = new FileReader();
    reader.onload = () => setQrisPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const uploadQrisImage = async (paymentMethodId: string): Promise<string | null> => {
    if (!qrisFile) return existingQrisUrl;
    setUploadingQris(true);
    const ext = qrisFile.name.split(".").pop() ?? "jpg";
    const path = `${branchId}/${paymentMethodId}.${ext}`;
    const { error } = await supabase.storage
      .from("payment-method-images")
      .upload(path, qrisFile, { upsert: true });
    setUploadingQris(false);
    if (error) {
      toast({ title: "Gagal upload gambar QRIS", description: error.message, variant: "destructive" });
      return existingQrisUrl;
    }
    const { data: urlData } = supabase.storage
      .from("payment-method-images")
      .getPublicUrl(path);
    return urlData.publicUrl;
  };

  const handleSave = async () => {
    if (!branchId) return;

    if ((form.type === "bank_transfer" || form.type === "ewallet") && !form.bank_name.trim()) {
      toast({ title: "Nama bank/e-wallet wajib diisi", variant: "destructive" });
      return;
    }

    setSaving(true);
    const derivedName = deriveName(form.type, form.bank_name);
    const payload: Record<string, unknown> = {
      branch_id: branchId,
      name: derivedName,
      type: form.type,
      bank_name: form.bank_name.trim() || null,
      account_number: form.account_number.trim() || null,
      account_name: form.account_name.trim() || null,
    };

    if (editingId) {
      // Upload QRIS image if applicable
      if (form.type === "other") {
        const url = await uploadQrisImage(editingId);
        payload.qris_image_url = url;
      } else {
        payload.qris_image_url = null;
      }
      const { error } = await supabase.from("payment_methods").update(payload as never).eq("id", editingId);
      if (error) {
        toast({ title: "Gagal menyimpan", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Metode pembayaran diperbarui" });
        setModalOpen(false);
        fetchMethods(branchId);
      }
    } else {
      // Insert first to get ID, then upload image
      const insertPayload = { ...payload, sort_order: methods.length };
      const { data: insertData, error } = await supabase
        .from("payment_methods")
        .insert(insertPayload as never)
        .select("id")
        .single();
      if (error || !insertData) {
        toast({ title: "Gagal menambahkan", description: error?.message, variant: "destructive" });
      } else {
        // Upload QRIS image if applicable
        if (form.type === "other" && qrisFile) {
          const url = await uploadQrisImage((insertData as { id: string }).id);
          if (url) {
            await supabase.from("payment_methods").update({ qris_image_url: url } as never).eq("id", (insertData as { id: string }).id);
          }
        }
        toast({ title: "Metode pembayaran ditambahkan" });
        setModalOpen(false);
        fetchMethods(branchId);
      }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId || !branchId) return;
    setDeleting(true);
    const { error } = await supabase.from("payment_methods").delete().eq("id", deleteId);
    setDeleting(false);
    if (error) {
      toast({ title: "Gagal menghapus", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Metode pembayaran dihapus" });
      setDeleteId(null);
      fetchMethods(branchId);
    }
  };

  const toggleActive = async (m: PaymentMethod) => {
    if (!branchId) return;
    await supabase.from("payment_methods").update({ is_active: !m.is_active } as never).eq("id", m.id);
    fetchMethods(branchId);
  };

  const selectedTypeInfo = PAYMENT_TYPES.find(t => t.value === form.type);

  const grouped = PAYMENT_TYPES.map(pt => ({
    ...pt,
    items: methods.filter(m => m.type === pt.value),
  })).filter(g => g.items.length > 0);

  return (
    <DashboardLayout pageTitle="Kanal Pembayaran">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Kanal Pembayaran</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Kelola metode pembayaran yang tersedia di POS cabang Anda.
            </p>
          </div>
          <Button size="sm" className="gap-1.5 text-xs" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5" />
            Tambah Metode
          </Button>
        </div>

        {/* Branch selector */}
        <div className="relative" ref={branchRef}>
          <button
            onClick={() => allBranches.length > 1 && setBranchDropdownOpen(!branchDropdownOpen)}
            className={cn(
              "w-full sm:w-auto flex items-center gap-2 px-3 py-2 rounded-xl border bg-card text-sm transition-colors",
              allBranches.length > 1
                ? "border-border hover:bg-muted/50 cursor-pointer"
                : "border-border/50 cursor-default"
            )}
          >
            <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="font-medium text-foreground truncate">
              {selectedBranch?.name ?? "Pilih Cabang"}
            </span>
            {allBranches.length > 1 && (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            )}
          </button>
          {branchDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-full sm:w-72 bg-popover border border-border rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
              <div className="p-1">
                {allBranches.map(b => (
                  <button
                    key={b.id}
                    onClick={() => { setSelectedBranch(b); setBranchDropdownOpen(false); }}
                    className={cn(
                      "w-full text-left flex items-center gap-2 px-3 py-2.5 text-xs rounded-lg transition-colors",
                      selectedBranch?.id === b.id ? "bg-accent font-medium" : "hover:bg-accent"
                    )}
                  >
                    <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{b.name}</span>
                    {b.code && <span className="text-[9px] text-muted-foreground font-mono">{b.code}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Info box */}
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
          <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Metode pembayaran ini akan muncul sebagai pilihan di halaman POS, dikelompokkan berdasarkan tipe (Tunai, Transfer Bank, E-Wallet, dll).
          </p>
        </div>

        {!branchId ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center bg-card rounded-2xl border border-border">
            <p className="text-sm font-medium text-foreground">Tidak ada cabang aktif</p>
            <p className="text-xs text-muted-foreground">Pilih cabang terlebih dahulu di sidebar.</p>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : methods.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center bg-card rounded-2xl border border-border">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Belum ada metode pembayaran</p>
              <p className="text-xs text-muted-foreground">Tambahkan metode pertama untuk mulai menggunakan POS</p>
            </div>
            <Button size="sm" className="gap-1.5 text-xs" onClick={openCreate}>
              <Plus className="w-3.5 h-3.5" />
              Tambah Metode
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(group => {
              const GroupIcon = group.icon;
              return (
                <div key={group.value}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                      <GroupIcon className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <p className="text-xs font-semibold text-foreground">{group.label}</p>
                    <span className="text-[10px] text-muted-foreground">({group.items.length})</span>
                  </div>
                  <div className="space-y-2 pl-0">
                    {group.items.map(m => {
                      const Icon = TYPE_ICON[m.type] ?? CreditCard;
                      return (
                        <div
                          key={m.id}
                          className={cn(
                            "flex items-center gap-3 p-4 rounded-xl border bg-card transition-all",
                            !m.is_active && "opacity-50"
                          )}
                        >
                          <GripVertical className="w-4 h-4 text-muted-foreground/50 shrink-0 cursor-grab" />
                          {/* QRIS thumbnail */}
                          {m.type === "other" && m.qris_image_url ? (
                            <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 border border-border">
                              <img src={m.qris_image_url} alt="QRIS" className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className={cn(
                              "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                              m.is_active ? "bg-primary/10" : "bg-muted"
                            )}>
                              <Icon className={cn("w-4 h-4", m.is_active ? "text-primary" : "text-muted-foreground")} />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-foreground truncate">
                                {m.bank_name ?? m.name}
                              </p>
                              <span className={cn(
                                "text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0",
                                m.is_active
                                  ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300"
                                  : "bg-muted text-muted-foreground"
                              )}>
                                {m.is_active ? "Aktif" : "Nonaktif"}
                              </span>
                            </div>
                            {m.account_number && (
                              <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                                {m.account_number}
                                {m.account_name ? ` · ${m.account_name}` : ""}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => toggleActive(m)}
                              className="h-8 px-2.5 rounded-lg border border-border text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              {m.is_active ? "Nonaktifkan" : "Aktifkan"}
                            </button>
                            <button
                              onClick={() => openEdit(m)}
                              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteId(m.id)}
                              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/5 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create/Edit Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h3 className="text-base font-semibold text-foreground">
                {editingId ? "Edit Metode Pembayaran" : "Tambah Metode Pembayaran"}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Type */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Tipe Pembayaran *</label>
                <div className="relative">
                  <button
                    onClick={() => setTypeDropdownOpen(!typeDropdownOpen)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
                  >
                    {selectedTypeInfo && <selectedTypeInfo.icon className="w-4 h-4 text-muted-foreground shrink-0" />}
                    <span className="flex-1 text-left">{selectedTypeInfo?.label ?? "Pilih tipe"}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  {typeDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                      {PAYMENT_TYPES.map(t => (
                        <button
                          key={t.value}
                          onClick={() => {
                            setForm(f => ({ ...f, type: t.value, bank_name: "" }));
                            setTypeDropdownOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left",
                            form.type === t.value && "bg-accent"
                          )}
                        >
                          <t.icon className="w-4 h-4 text-muted-foreground" />
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Name / Bank field */}
              {form.type !== "cash" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    {form.type === "bank_transfer" ? "Nama Bank *" : form.type === "ewallet" ? "Nama E-Wallet *" : "Label (opsional)"}
                  </label>
                  <Input
                    value={form.bank_name}
                    onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                    placeholder={
                      form.type === "bank_transfer" ? "Contoh: BCA, Mandiri, BNI, SeaBank" :
                      form.type === "ewallet" ? "Contoh: GoPay, OVO, Dana" :
                      "Contoh: QRIS Merchant"
                    }
                    className="h-9 text-sm"
                  />
                </div>
              )}

              {/* Account fields for bank/ewallet */}
              {(form.type === "bank_transfer" || form.type === "ewallet") && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Nomor Rekening / No. HP</label>
                    <Input
                      value={form.account_number}
                      onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))}
                      placeholder="Contoh: 1234567890"
                      className="h-9 text-sm font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Nama Pemilik Rekening</label>
                    <Input
                      value={form.account_name}
                      onChange={e => setForm(f => ({ ...f, account_name: e.target.value }))}
                      placeholder="Contoh: Ivalora Gadget Surabaya"
                      className="h-9 text-sm"
                    />
                  </div>
                </>
              )}

              {/* QRIS Image Upload — only for type "other" */}
              {form.type === "other" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Gambar QRIS (opsional)</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleQrisFileChange}
                    className="hidden"
                  />
                  {(qrisPreview || existingQrisUrl) ? (
                    <div className="relative rounded-xl border border-border overflow-hidden bg-muted/30">
                      <img
                        src={qrisPreview || existingQrisUrl!}
                        alt="QRIS Preview"
                        className="w-full max-h-48 object-contain mx-auto"
                      />
                      <div className="absolute bottom-2 right-2 flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-2.5 py-1 rounded-lg bg-card/90 border border-border text-[11px] text-foreground hover:bg-accent transition-colors backdrop-blur-sm"
                        >
                          Ganti
                        </button>
                        <button
                          type="button"
                          onClick={() => { setQrisFile(null); setQrisPreview(null); setExistingQrisUrl(null); }}
                          className="px-2.5 py-1 rounded-lg bg-card/90 border border-border text-[11px] text-destructive hover:bg-destructive/10 transition-colors backdrop-blur-sm"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setQrisDragOver(false); const f = e.dataTransfer.files?.[0]; if (f && f.type.startsWith("image/")) { setQrisFile(f); setQrisPreview(URL.createObjectURL(f)); } }}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setQrisDragOver(true); }}
                      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setQrisDragOver(false); }}
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        "w-full flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed transition-colors cursor-pointer",
                        qrisDragOver ? "border-foreground bg-accent/50" : "border-border hover:border-primary/40 hover:bg-primary/5"
                      )}
                    >
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                        <ImageIcon className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-medium text-foreground">{qrisDragOver ? "Lepas untuk upload" : "Seret atau klik untuk upload QRIS"}</p>
                        <p className="text-[10px] text-muted-foreground">JPG, PNG, atau WebP</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Preview of derived name */}
              <div className="p-2.5 rounded-lg bg-muted/60 border border-border">
                <p className="text-[10px] text-muted-foreground">Akan tampil di POS sebagai:</p>
                <p className="text-sm font-semibold text-foreground mt-0.5">
                  {TYPE_LABEL[form.type] ?? form.type} · {form.type === "cash" ? "Tunai" : (form.bank_name.trim() || "—")}
                </p>
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2 shrink-0">
              <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)} disabled={saving || uploadingQris}>
                Batal
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={handleSave}
                disabled={saving || uploadingQris || (form.type !== "cash" && form.type !== "other" && !form.bank_name.trim())}
              >
                {saving || uploadingQris ? "Menyimpan..." : editingId ? "Simpan Perubahan" : "Tambah"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-xl p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Hapus Metode Pembayaran?</h3>
                <p className="text-xs text-muted-foreground">Tindakan ini tidak dapat dibatalkan.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteId(null)} disabled={deleting}>Batal</Button>
              <Button variant="destructive" className="flex-1" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Menghapus..." : "Hapus"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
