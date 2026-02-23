import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Plus, Search, LayoutGrid, List, X, RefreshCw, Download, AlertCircle, Trash2, CalendarIcon, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { id as localeId } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { StockStatusBadge, ConditionBadge } from "@/components/stock-units/StockBadges";
import { AddUnitModal } from "@/components/stock-units/AddUnitModal";
import { UnitDetailDrawer } from "@/components/stock-units/UnitDetailDrawer";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  StockUnit,
  StockStatus,
  SoldChannel,
  STOCK_STATUS_LABELS,
  STOCK_STATUS_STYLES,
  SOLD_CHANNEL_SHORT,
  VALID_TRANSITIONS,
  formatCurrency,
  formatDate,
} from "@/lib/stock-units";
import { WARRANTY_LABELS, type WarrantyType } from "@/lib/master-products";

const DEFAULT_STATUSES: StockStatus[] = ["available"];
const ALL_STATUSES: StockStatus[] = ["available", "reserved", "coming_soon", "service", "sold", "return", "lost"];
const PAGE_SIZE_OPTIONS = [10, 25, 50];

interface SummaryCount { status: StockStatus | "all" | "no_status"; count: number; }
interface Branch { id: string; name: string; }

const getWarrantyLabel = (key: string | undefined | null): string => {
  if (!key) return "—";
  return WARRANTY_LABELS[key as WarrantyType] ?? key.replace(/_/g, " ");
};

type StockUnitWithBranch = StockUnit & { branches?: { name: string } | null };

export default function StockIMEIPage() {
  const { role, activeBranch } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = role === "super_admin";
  const isAdminBranch = role === "admin_branch";
  const isEmployee = role === "employee";
  const canEditStatus = isSuperAdmin || isAdminBranch;

  const [units, setUnits] = useState<StockUnitWithBranch[]>([]);
  const [summary, setSummary] = useState<SummaryCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "compact">("table");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Branch filter (super admin only)
  const [branches, setBranches] = useState<Branch[]>([]);
  const [filterBranch, setFilterBranch] = useState("all");

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStatuses, setFilterStatuses] = useState<Set<StockStatus>>(new Set(DEFAULT_STATUSES));
  const [showAll, setShowAll] = useState(false);
  const [filterSeries, setFilterSeries] = useState("all");
  const [filterCondition, setFilterCondition] = useState("all");
  const [allSeries, setAllSeries] = useState<string[]>([]);
  const [seriesSearch, setSeriesSearch] = useState("");
  const [seriesDropdownOpen, setSeriesDropdownOpen] = useState(false);
  const seriesRef = useRef<HTMLDivElement>(null);

  // Date filter
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  // Modals
  const [addOpen, setAddOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<StockUnit | null>(null);
  const [exportEmptyOpen, setExportEmptyOpen] = useState(false);

  // Inline status change
  const [inlineStatusUnit, setInlineStatusUnit] = useState<string | null>(null);
  const [inlineNewStatus, setInlineNewStatus] = useState<StockStatus | "">("");
  const [inlineSoldChannel, setInlineSoldChannel] = useState<SoldChannel | "">("");
  const [inlineUpdating, setInlineUpdating] = useState(false);

  // Bulk delete
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [debouncedSearch, filterStatuses, showAll, filterSeries, filterCondition, dateRange, sortOrder, filterBranch, pageSize]);

  // Close series dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (seriesRef.current && !seriesRef.current.contains(e.target as Node)) setSeriesDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Fetch branches (super admin)
  useEffect(() => {
    if (isSuperAdmin) {
      supabase.from("branches").select("id, name").eq("is_active", true).order("name")
        .then(({ data }) => setBranches(data ?? []));
    }
  }, [isSuperAdmin]);

  // Fetch all unique series
  const fetchAllSeries = useCallback(async () => {
    const { data } = await supabase.from("master_products").select("series").is("deleted_at", null).eq("is_active", true);
    if (data) {
      const unique = Array.from(new Set(data.map((d: { series: string }) => d.series))).sort();
      setAllSeries(unique);
    }
  }, []);

  // Build base query with filters (reusable for count + data)
  const applyFilters = useCallback((query: any) => {
    if (!showAll) {
      query = query.in("stock_status", Array.from(filterStatuses));
    }
    if (isSuperAdmin && filterBranch !== "all") {
      query = query.eq("branch_id", filterBranch);
    }
    if (filterCondition === "no_minus") query = query.eq("condition_status", "no_minus");
    else if (filterCondition === "minus") query = query.eq("condition_status", "minus");

    if (dateRange?.from) {
      query = query.gte("received_at", format(dateRange.from, "yyyy-MM-dd"));
    }
    if (dateRange?.to) {
      const toDate = new Date(dateRange.to);
      toDate.setDate(toDate.getDate() + 1);
      query = query.lt("received_at", format(toDate, "yyyy-MM-dd"));
    }
    return query;
  }, [showAll, filterStatuses, filterCondition, dateRange, isSuperAdmin, filterBranch]);

  // Fetch product IDs for series filter (to avoid ilike on joined table which corrupts product names)
  const [seriesProductIds, setSeriesProductIds] = useState<string[] | null>(null);
  useEffect(() => {
    if (filterSeries === "all") { setSeriesProductIds(null); return; }
    supabase.from("master_products").select("id").eq("series", filterSeries).is("deleted_at", null)
      .then(({ data }) => {
        setSeriesProductIds(data?.map(d => d.id) ?? []);
      });
  }, [filterSeries]);

  const fetchUnits = useCallback(async () => {
    // Wait for series product IDs to resolve if filtering by series
    if (filterSeries !== "all" && seriesProductIds === null) return;

    setLoading(true);
    setError(null);

    // Count query
    let countQuery = supabase.from("stock_units").select("*", { count: "exact", head: true });
    countQuery = applyFilters(countQuery);
    if (seriesProductIds && seriesProductIds.length > 0) {
      countQuery = countQuery.in("product_id", seriesProductIds);
    } else if (seriesProductIds && seriesProductIds.length === 0) {
      setUnits([]); setTotalCount(0); setLoading(false); return;
    }
    if (debouncedSearch.trim()) {
      countQuery = countQuery.or(`imei.ilike.%${debouncedSearch}%`);
    }

    // Data query with pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let dataQuery = supabase
      .from("stock_units")
      .select(`*, master_products(series, storage_gb, color, warranty_type, category), branches(name)`)
      .order("received_at", { ascending: sortOrder === "asc" })
      .range(from, to);
    dataQuery = applyFilters(dataQuery);
    if (seriesProductIds && seriesProductIds.length > 0) {
      dataQuery = dataQuery.in("product_id", seriesProductIds);
    }
    if (debouncedSearch.trim()) {
      dataQuery = dataQuery.or(`imei.ilike.%${debouncedSearch}%`);
    }

    const [countResult, dataResult] = await Promise.all([countQuery, dataQuery]);

    if (dataResult.error) { setError(dataResult.error.message); setLoading(false); return; }

    setTotalCount(countResult.count ?? 0);
    setUnits((dataResult.data as StockUnitWithBranch[]) ?? []);
    setLoading(false);
  }, [debouncedSearch, filterStatuses, showAll, filterCondition, dateRange, sortOrder, isSuperAdmin, filterBranch, page, pageSize, applyFilters, seriesProductIds, filterSeries]);

  const fetchSummary = useCallback(async () => {
    const counts: SummaryCount[] = [];
    let totalCount = 0;

    // Batch all status counts in parallel
    const branchFilter = isSuperAdmin && filterBranch !== "all" ? filterBranch : null;
    const queries = ALL_STATUSES.map(s => {
      let q = supabase.from("stock_units").select("*", { count: "exact", head: true }).eq("stock_status", s);
      if (branchFilter) q = q.eq("branch_id", branchFilter);
      return q;
    });
    let nullQ = supabase.from("stock_units").select("*", { count: "exact", head: true }).is("stock_status", null);
    if (branchFilter) nullQ = nullQ.eq("branch_id", branchFilter);
    queries.push(nullQ);

    const results = await Promise.all(queries);

    ALL_STATUSES.forEach((s, i) => {
      const c = results[i].count ?? 0;
      counts.push({ status: s, count: c });
      totalCount += c;
    });
    const nc = results[results.length - 1].count ?? 0;
    totalCount += nc;
    counts.push({ status: "no_status", count: nc });
    counts.unshift({ status: "all", count: totalCount });
    setSummary(counts);
  }, [isSuperAdmin, filterBranch]);

  useEffect(() => { fetchUnits(); }, [fetchUnits]);
  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchAllSeries(); }, [fetchAllSeries]);

  const handleRefresh = () => { fetchUnits(); fetchSummary(); setSelectedIds(new Set()); setConfirmBulkDelete(false); };
  const isDefaultFilter = !showAll && filterStatuses.size === DEFAULT_STATUSES.length && DEFAULT_STATUSES.every(s => filterStatuses.has(s));
  const resetFilters = () => { setSearch(""); setDebouncedSearch(""); setFilterStatuses(new Set(DEFAULT_STATUSES)); setShowAll(false); setFilterSeries("all"); setFilterCondition("all"); setDateRange(undefined); setSeriesSearch(""); setSortOrder("desc"); setFilterBranch("all"); };
  const hasActiveFilters = search || !isDefaultFilter || filterSeries !== "all" || filterCondition !== "all" || dateRange?.from || showAll;

  const filteredSeriesList = allSeries.filter(s => s.toLowerCase().includes(seriesSearch.toLowerCase()));

  // Bulk delete
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === units.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(units.map(u => u.id)));
  };
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    const { error } = await supabase.from("stock_units").delete().in("id", Array.from(selectedIds));
    setBulkDeleting(false);
    if (error) { toast({ title: "Gagal menghapus", description: error.message, variant: "destructive" }); return; }
    toast({ title: `${selectedIds.size} unit berhasil dihapus` });
    handleRefresh();
  };

  // Inline status change — role-based transitions
  const getValidTransitions = (currentStatus: StockStatus): StockStatus[] => {
    if (isSuperAdmin) return ALL_STATUSES.filter(s => s !== currentStatus);
    if (isAdminBranch) {
      // Admin branch: all normal transitions
      return VALID_TRANSITIONS[currentStatus].filter(s => s !== currentStatus);
    }
    if (isEmployee) {
      // Employee: available→reserved,coming_soon,service,sold(shopee/tokopedia only)
      // No other transitions allowed
      if (currentStatus === "available") {
        return ["reserved", "coming_soon", "service", "sold"];
      }
      return [];
    }
    return [];
  };

  const canEditSoldChannel = isSuperAdmin || isAdminBranch;
  const handleSoldChannelUpdate = async (unitId: string, channel: SoldChannel) => {
    setInlineUpdating(true);
    const { error } = await supabase.from("stock_units").update({ sold_channel: channel } as never).eq("id", unitId);
    setInlineUpdating(false);
    if (error) { toast({ title: "Gagal mengubah channel", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Channel penjualan berhasil diperbarui" });
    handleRefresh();
  };

  const handleInlineStatusChange = async (unitId: string, currentStatus: StockStatus, newStatus: StockStatus) => {
    if (newStatus === currentStatus) return;
    if (newStatus === "sold") {
      setInlineStatusUnit(unitId);
      setInlineNewStatus(newStatus);
      setInlineSoldChannel("");
      return;
    }
    setInlineUpdating(true);
    const { error } = await supabase.from("stock_units").update({ stock_status: newStatus } as never).eq("id", unitId);
    setInlineUpdating(false);
    if (error) { toast({ title: "Gagal mengubah status", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Status berhasil diperbarui" });
    handleRefresh();
  };

  const handleSoldChannelConfirm = async () => {
    if (!inlineStatusUnit || !inlineSoldChannel) return;
    setInlineUpdating(true);
    const { error } = await supabase.from("stock_units").update({ stock_status: "sold", sold_channel: inlineSoldChannel } as never).eq("id", inlineStatusUnit);
    setInlineUpdating(false);
    if (error) { toast({ title: "Gagal mengubah status", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Status berhasil diperbarui" });
    setInlineStatusUnit(null); setInlineNewStatus(""); setInlineSoldChannel("");
    handleRefresh();
  };

  const dateLabel = () => {
    if (dateRange?.from && dateRange?.to) return `${format(dateRange.from, "dd MMM", { locale: localeId })} — ${format(dateRange.to, "dd MMM yy", { locale: localeId })}`;
    if (dateRange?.from) return format(dateRange.from, "dd MMM yy", { locale: localeId });
    return "Tanggal";
  };

  // Sold channel options for employee — only shopee/tokopedia
  const getSoldChannelOptions = () => {
    if (isSuperAdmin) {
      return [
        { value: "pos", label: "Terjual Offline Store (POS)" },
        { value: "ecommerce_tokopedia", label: "Terjual E-Commerce (Tokopedia)" },
        { value: "ecommerce_shopee", label: "Terjual E-Commerce (Shopee)" },
        { value: "website", label: "Terjual Online (Website)" },
      ];
    }
    if (isAdminBranch) {
      return [
        { value: "ecommerce_tokopedia", label: "Terjual E-Commerce (Tokopedia)" },
        { value: "ecommerce_shopee", label: "Terjual E-Commerce (Shopee)" },
      ];
    }
    // Employee: only shopee/tokopedia
    return [
      { value: "ecommerce_tokopedia", label: "Terjual E-Commerce (Tokopedia)" },
      { value: "ecommerce_shopee", label: "Terjual E-Commerce (Shopee)" },
    ];
  };

  // Pagination controls
  const paginationRange = useMemo(() => {
    const delta = 1;
    const range: (number | "...")[] = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
        range.push(i);
      } else if (range[range.length - 1] !== "...") {
        range.push("...");
      }
    }
    return range;
  }, [page, totalPages]);

  return (
    <DashboardLayout pageTitle="Stok IMEI">
      <div className="space-y-4 sm:space-y-5 pb-20">
        {/* ── Page header ── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Stok IMEI</h1>
            <p className="text-xs text-muted-foreground">Kelola dan pantau seluruh unit berbasis IMEI secara real-time.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="h-8 sm:h-9 gap-1.5 text-xs" onClick={handleRefresh}>
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Segarkan</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 sm:h-9 gap-1.5 text-xs"
              onClick={() => {
                if (units.length === 0) { setExportEmptyOpen(true); return; }
                const csvRows = units.map((u) => {
                  const prod = `${u.master_products?.series ?? ""} ${u.master_products?.storage_gb ? u.master_products.storage_gb + "GB" : ""}`.trim();
                  const color = u.master_products?.color ?? "";
                  const warranty = getWarrantyLabel(u.master_products?.warranty_type);
                  const kondisi = u.condition_status === "no_minus" ? "No Minus" : "Ada Minus";
                  const hargaJual = u.selling_price != null ? u.selling_price.toString() : "";
                  const status = u.stock_status === "sold" && u.sold_channel ? `Terjual ${SOLD_CHANNEL_SHORT[u.sold_channel]}` : u.stock_status;
                  const tanggal = u.received_at ? new Date(u.received_at).toLocaleDateString("id-ID") : "";
                  if (isSuperAdmin) {
                    return [u.imei, prod, color, warranty, kondisi, hargaJual, u.cost_price?.toString() ?? "", status, u.supplier ?? "", u.batch_code ?? "", tanggal].join(",");
                  }
                  return [prod, color, warranty, kondisi, hargaJual, status, tanggal].join(",");
                });
                const csvHeaders = isSuperAdmin
                  ? ["IMEI", "Produk", "Warna", "Tipe", "Kondisi", "Harga Jual", "Harga Beli", "Status", "Supplier", "Batch", "Tanggal Masuk"]
                  : ["Produk", "Warna", "Tipe", "Kondisi", "Harga Jual", "Status", "Tanggal Masuk"];
                const csv = [csvHeaders.join(","), ...csvRows].join("\n");
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `stok-imei-${new Date().toISOString().slice(0, 10)}.csv`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
              }}
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ekspor</span>
            </Button>
            {(isSuperAdmin || isAdminBranch) && (
              <Button size="sm" className="h-8 sm:h-9 gap-1.5 text-xs" onClick={() => setAddOpen(true)}>
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Tambah Unit</span>
                <span className="xs:hidden">Tambah</span>
              </Button>
            )}
          </div>
        </div>

        {/* ── Summary bar ── */}
        <div className="flex overflow-x-auto gap-1.5 sm:gap-2 pb-1 -mx-4 px-4 sm:mx-0 sm:px-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
          {(() => {
            const totalCount = summary.find(c => c.status === "all")?.count ?? 0;
            return (
              <button
                onClick={() => { setShowAll(true); setFilterStatuses(new Set(ALL_STATUSES)); }}
                className={`min-w-[72px] sm:min-w-0 sm:flex-1 flex-shrink-0 rounded-xl border p-2 sm:p-3 text-left transition-all duration-150 hover:shadow-sm ${
                  showAll ? "bg-primary/10 border-primary/30" : "bg-card border-border hover:border-border/70"
                }`}
              >
                <p className={`text-lg sm:text-xl font-bold leading-none ${showAll ? "text-primary" : "text-foreground"}`}>{totalCount}</p>
                <p className={`text-[10px] sm:text-[10px] mt-1 font-medium uppercase tracking-wider ${showAll ? "text-primary" : "text-muted-foreground"} truncate`}>Semua</p>
              </button>
            );
          })()}
          {ALL_STATUSES.map((s) => {
            const count = summary.find((c) => c.status === s)?.count ?? 0;
            const style = STOCK_STATUS_STYLES[s];
            const isActive = !showAll && filterStatuses.has(s);
            return (
              <button
                key={s}
                onClick={() => {
                  setShowAll(false);
                  setFilterStatuses(prev => {
                    const next = new Set(prev);
                    if (next.has(s)) { next.delete(s); if (next.size === 0) next.add(s); } else { next.add(s); }
                    return next;
                  });
                }}
                className={`min-w-[72px] sm:min-w-0 sm:flex-1 flex-shrink-0 rounded-xl border p-2 sm:p-3 text-left transition-all duration-150 hover:shadow-sm ${
                  isActive ? `${style.bg} border-transparent` : "bg-card border-border hover:border-border/70"
                }`}
              >
                <p className={`text-lg sm:text-xl font-bold leading-none ${isActive ? style.text : "text-foreground"}`}>{count}</p>
                <p className={`text-[10px] sm:text-[10px] mt-1 font-medium uppercase tracking-wider ${isActive ? style.text : "text-muted-foreground"} truncate`}>{STOCK_STATUS_LABELS[s]}</p>
              </button>
            );
          })}
        </div>

        {/* ── Filter & Search panel ── */}
        <div className="bg-card rounded-xl border border-border p-3 md:p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari IMEI…" className="pl-9 h-9 text-sm" />
            </div>
            {isSuperAdmin && branches.length > 0 && (
              <div className="hidden sm:block">
                <Select value={filterBranch} onValueChange={setFilterBranch}>
                  <SelectTrigger className={cn("h-9 w-44 text-sm", filterBranch !== "all" && "border-primary text-primary")}><SelectValue placeholder="Semua Cabang" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Cabang</SelectItem>
                    {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="hidden sm:block">
              <Select value={filterCondition} onValueChange={setFilterCondition}>
                <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="Kondisi" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kondisi</SelectItem>
                  <SelectItem value="no_minus">No Minus</SelectItem>
                  <SelectItem value="minus">Minus</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Searchable series filter */}
            <div className="hidden sm:block relative" ref={seriesRef}>
              <div
                className="h-9 w-48 flex items-center border border-input rounded-md bg-background px-3 cursor-pointer text-sm"
                onClick={() => setSeriesDropdownOpen(!seriesDropdownOpen)}
              >
                <span className={cn("flex-1 truncate", filterSeries === "all" && "text-muted-foreground")}>
                  {filterSeries === "all" ? "Semua Seri" : filterSeries}
                </span>
                <Search className="w-3 h-3 text-muted-foreground shrink-0 ml-1" />
              </div>
              {seriesDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 max-h-60 overflow-hidden flex flex-col">
                  <div className="p-2 border-b border-border">
                    <Input value={seriesSearch} onChange={(e) => setSeriesSearch(e.target.value)} placeholder="Cari seri..." className="h-8 text-sm" autoFocus />
                  </div>
                  <div className="overflow-y-auto max-h-48">
                    <button type="button" onClick={() => { setFilterSeries("all"); setSeriesDropdownOpen(false); setSeriesSearch(""); }}
                      className={cn("w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors", filterSeries === "all" && "bg-accent font-medium")}>
                      Semua Seri
                    </button>
                    {filteredSeriesList.map((s) => (
                      <button key={s} type="button" onClick={() => { setFilterSeries(s); setSeriesDropdownOpen(false); setSeriesSearch(""); }}
                        className={cn("w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors", filterSeries === s && "bg-accent font-medium")}>
                        {s}
                      </button>
                    ))}
                    {filteredSeriesList.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Tidak ditemukan</p>}
                  </div>
                </div>
              )}
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-9 gap-1.5 text-xs hidden sm:flex", dateRange?.from && "border-primary text-primary")}>
                  <CalendarIcon className="w-3.5 h-3.5" />{dateLabel()}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Pilih tanggal atau rentang tanggal</p>
                  <Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={1} className={cn("p-0 pointer-events-auto")} locale={localeId} />
                  {dateRange?.from && <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setDateRange(undefined)}>Reset Tanggal</Button>}
                </div>
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs hidden sm:flex" onClick={() => setSortOrder(prev => prev === "desc" ? "asc" : "desc")}>
              <ArrowUpDown className="w-3.5 h-3.5" />{sortOrder === "desc" ? "Terbaru" : "Terlama"}
            </Button>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1 h-9">
              <button onClick={() => setViewMode("table")} className={`px-2.5 py-1 rounded-md transition-colors ${viewMode === "table" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <List className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setViewMode("compact")} className={`px-2.5 py-1 rounded-md transition-colors ${viewMode === "compact" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-xs text-muted-foreground hidden sm:flex" onClick={resetFilters}>
                <X className="w-3 h-3" /> Reset
              </Button>
            )}
          </div>
          {/* Mobile filters */}
          {isSuperAdmin && branches.length > 0 && (
            <div className="flex sm:hidden gap-2">
              <Select value={filterBranch} onValueChange={setFilterBranch}>
                <SelectTrigger className={cn("h-8 flex-1 text-xs", filterBranch !== "all" && "border-primary text-primary")}><SelectValue placeholder="Semua Cabang" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Cabang</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex sm:hidden items-center gap-2 pb-0.5 -mx-1 px-1">
            {[{ v: "all", label: "Semua" }, { v: "no_minus", label: "No Minus" }, { v: "minus", label: "Minus" }].map(({ v, label }) => (
              <button key={v} onClick={() => setFilterCondition(v)}
                className={`shrink-0 flex-1 px-2 py-1 rounded-full text-[11px] font-medium border transition-all text-center ${
                  filterCondition === v ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-border"
                }`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex sm:hidden gap-2">
            <Select value={filterSeries} onValueChange={setFilterSeries}>
              <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="Seri" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Seri</SelectItem>
                {allSeries.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-8 gap-1 text-[11px] shrink-0", dateRange?.from && "border-primary text-primary")}>
                  <CalendarIcon className="w-3 h-3" />{dateRange?.from ? dateLabel() : "Tanggal"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <div className="p-3 space-y-2">
                  <Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={1} className={cn("p-0 pointer-events-auto")} locale={localeId} />
                  {dateRange?.from && <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setDateRange(undefined)}>Reset</Button>}
                </div>
              </PopoverContent>
            </Popover>
            <button onClick={() => setSortOrder(prev => prev === "desc" ? "asc" : "desc")}
              className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border border-border bg-background text-muted-foreground flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3" />{sortOrder === "desc" ? "Baru" : "Lama"}
            </button>
            {hasActiveFilters && (
              <button className="shrink-0 px-2 py-1 rounded-full text-[10px] font-medium border border-destructive/30 text-destructive" onClick={resetFilters}>Reset</button>
            )}
          </div>
          {!isDefaultFilter && !showAll && (
            <p className="text-xs text-muted-foreground">
              Filter aktif: <span className="font-medium text-foreground">{Array.from(filterStatuses).map(s => STOCK_STATUS_LABELS[s]).join(", ")}</span>
              {" · "}<button className="underline" onClick={() => { setFilterStatuses(new Set(DEFAULT_STATUSES)); setShowAll(false); }}>tampilkan default</button>
            </p>
          )}
          {showAll && (
            <p className="text-xs text-muted-foreground">
              Menampilkan <span className="font-medium text-foreground">semua status</span>
              {" · "}<button className="underline" onClick={() => { setShowAll(false); setFilterStatuses(new Set(DEFAULT_STATUSES)); }}>tampilkan default</button>
            </p>
          )}
        </div>

        {/* ── Content ── */}
        {error ? (
          <div className="bg-card rounded-xl border border-border p-8 text-center space-y-3">
            <p className="text-sm text-destructive">Terjadi kesalahan saat memuat data. Silakan coba kembali.</p>
            <Button variant="outline" size="sm" onClick={handleRefresh}>Coba Lagi</Button>
          </div>
        ) : loading ? (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 space-y-3">
              {[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />)}
            </div>
          </div>
        ) : units.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-8 sm:p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto"><Search className="w-5 h-5 text-muted-foreground" /></div>
            <p className="text-sm font-medium text-foreground">Belum ada unit dengan kriteria ini.</p>
            <p className="text-xs text-muted-foreground">Coba ubah filter atau tambahkan unit baru.</p>
          </div>
        ) : viewMode === "table" ? (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {isSuperAdmin && selectedIds.size > 0 && (
              <div className="px-3 sm:px-4 py-2.5 border-b border-border bg-destructive/5 flex items-center justify-between">
                <p className="text-xs font-medium text-destructive">{selectedIds.size} unit dipilih</p>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setSelectedIds(new Set()); setConfirmBulkDelete(false); }}>Batal</Button>
                  {!confirmBulkDelete ? (
                    <Button variant="destructive" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setConfirmBulkDelete(true)}>
                      <Trash2 className="w-3 h-3" /> Hapus
                    </Button>
                  ) : (
                    <Button variant="destructive" size="sm" className="h-7 text-xs gap-1.5" disabled={bulkDeleting} onClick={handleBulkDelete}>
                      {bulkDeleting ? <div className="w-3 h-3 border border-destructive-foreground/30 border-t-destructive-foreground rounded-full animate-spin" /> : "Konfirmasi Hapus"}
                    </Button>
                  )}
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {isSuperAdmin && (
                      <th className="w-10 px-2 sm:px-3 py-3">
                        <Checkbox checked={units.length > 0 && selectedIds.size === units.length} onCheckedChange={toggleSelectAll} />
                      </th>
                    )}
                    <th className="text-left px-2 sm:px-4 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Produk</th>
                    <th className="text-left px-2 sm:px-4 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground hidden sm:table-cell">Kondisi</th>
                    <th className="text-left px-2 sm:px-4 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Harga</th>
                    <th className="text-left px-2 sm:px-4 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Status</th>
                    <th className="text-left px-2 sm:px-4 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground hidden md:table-cell">Supplier</th>
                    <th className="text-left px-2 sm:px-4 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground hidden md:table-cell">Masuk</th>
                    {isSuperAdmin && (
                      <th className="text-left px-2 sm:px-4 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground hidden lg:table-cell">Cabang</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {units.map((unit) => {
                    const unitWithBranch = unit as StockUnitWithBranch;
                    const validTransitions = getValidTransitions(unit.stock_status);
                    const canChangeStatus = (isSuperAdmin || isAdminBranch || (isEmployee && validTransitions.length > 0)) && validTransitions.length > 0;
                    return (
                      <tr key={unit.id} className={`hover:bg-accent/40 cursor-pointer transition-colors ${selectedIds.has(unit.id) ? "bg-accent/20" : ""}`} onDoubleClick={() => setSelectedUnit(unit)}>
                        {isSuperAdmin && (
                          <td className="w-10 px-2 sm:px-3 py-3" onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={selectedIds.has(unit.id)} onCheckedChange={() => toggleSelect(unit.id)} />
                          </td>
                        )}
                        <td className="px-2 sm:px-4 py-3">
                          <p className="font-semibold text-foreground text-xs sm:text-sm leading-tight truncate max-w-[180px] sm:max-w-none">
                            {unit.master_products?.series} {unit.master_products?.storage_gb}GB
                          </p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 truncate max-w-[180px] sm:max-w-none">
                            {unit.master_products?.color} · {getWarrantyLabel(unit.master_products?.warranty_type)}
                          </p>
                          <p className="font-mono text-[10px] sm:text-xs text-muted-foreground/70 mt-0.5 truncate">{unit.imei}</p>
                          <div className="sm:hidden mt-1"><ConditionBadge condition={unit.condition_status} /></div>
                        </td>
                        <td className="px-2 sm:px-4 py-3 hidden sm:table-cell"><ConditionBadge condition={unit.condition_status} /></td>
                        <td className="px-2 sm:px-4 py-3">
                          <span className="font-medium text-foreground text-xs sm:text-sm">{formatCurrency(unit.selling_price)}</span>
                        </td>
                        <td className="px-2 sm:px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          {canChangeStatus ? (
                            <div className="space-y-1">
                              <Select value={unit.stock_status} onValueChange={(val) => handleInlineStatusChange(unit.id, unit.stock_status, val as StockStatus)}>
                                <SelectTrigger className="h-7 w-[110px] sm:w-[130px] text-[10px] sm:text-xs border-dashed p-1 sm:p-2">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={unit.stock_status}>{STOCK_STATUS_LABELS[unit.stock_status]}</SelectItem>
                                  {validTransitions.map((s) => <SelectItem key={s} value={s}>{STOCK_STATUS_LABELS[s]}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              {unit.stock_status === "sold" && canEditSoldChannel ? (
                                <Select value={unit.sold_channel ?? "none"} onValueChange={(val) => handleSoldChannelUpdate(unit.id, val as SoldChannel)}>
                                  <SelectTrigger className={`h-6 w-[130px] sm:w-[150px] text-[9px] sm:text-[10px] border-dashed p-1 ${!unit.sold_channel ? "text-destructive border-destructive/30" : ""}`}>
                                    <SelectValue placeholder="Pilih channel..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {!unit.sold_channel && <SelectItem value="none" disabled>Belum ditentukan</SelectItem>}
                                    <SelectItem value="pos">Offline Store (POS)</SelectItem>
                                    <SelectItem value="ecommerce_tokopedia">Online (Tokopedia)</SelectItem>
                                    <SelectItem value="ecommerce_shopee">Online (Shopee)</SelectItem>
                                    <SelectItem value="website">Online (Website)</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : unit.stock_status === "sold" && unit.sold_channel ? (
                                <p className="text-[9px] sm:text-[10px] text-muted-foreground">{SOLD_CHANNEL_SHORT[unit.sold_channel]}</p>
                              ) : unit.stock_status === "sold" && !unit.sold_channel ? (
                                <p className="text-[9px] sm:text-[10px] text-destructive">Belum ditentukan</p>
                              ) : null}
                            </div>
                          ) : (
                            <div>
                              <StockStatusBadge status={unit.stock_status} />
                              {unit.stock_status === "sold" && unit.sold_channel ? (
                                <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">{SOLD_CHANNEL_SHORT[unit.sold_channel]}</p>
                              ) : unit.stock_status === "sold" && !unit.sold_channel ? (
                                <p className="text-[9px] sm:text-[10px] text-destructive mt-0.5">Belum ditentukan</p>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="px-2 sm:px-4 py-3 text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap hidden md:table-cell truncate max-w-[120px]">{unit.supplier ?? "—"}</td>
                        <td className="px-2 sm:px-4 py-3 text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap hidden md:table-cell">{formatDate(unit.received_at)}</td>
                        {isSuperAdmin && (
                          <td className="px-2 sm:px-4 py-3 text-[10px] sm:text-xs text-muted-foreground hidden lg:table-cell">{unitWithBranch.branches?.name ?? "—"}</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-3 sm:px-4 py-2.5 border-t border-border flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{totalCount} unit total · halaman {page}/{totalPages}</p>
              <p className="text-[10px] text-muted-foreground hidden sm:block">Klik 2x pada baris untuk melihat detail unit</p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">Tampilan ringkas untuk pengecekan cepat di etalase.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {units.map((unit) => (
                <button key={unit.id} onClick={() => setSelectedUnit(unit)}
                  className="bg-card rounded-xl border border-border p-3 sm:p-4 text-left hover:shadow-md hover:border-border/70 transition-all duration-150 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground leading-tight truncate">{unit.master_products?.series} {unit.master_products?.storage_gb}GB</p>
                      <p className="text-xs text-muted-foreground truncate">{unit.master_products?.color}</p>
                    </div>
                    <StockStatusBadge status={unit.stock_status} className="shrink-0" />
                  </div>
                  <div className="flex items-center justify-between">
                    <ConditionBadge condition={unit.condition_status} />
                    <p className="text-sm font-bold text-foreground">{formatCurrency(unit.selling_price)}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 truncate">{getWarrantyLabel(unit.master_products?.warranty_type)} · Masuk {formatDate(unit.received_at)}</p>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Fixed Pagination Bar ── */}
      {!loading && totalCount > 0 && (
        <div className="fixed bottom-0 left-0 md:left-[72px] right-0 z-40 bg-card/95 backdrop-blur-sm border-t border-border shadow-lg">
          <div className="px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2">
            {/* Page size selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:inline">Tampilkan</span>
              <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="h-8 w-[70px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map(s => <SelectItem key={s} value={s.toString()}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground hidden sm:inline">per halaman</span>
            </div>

            {/* Page info (mobile) */}
            <span className="text-xs text-muted-foreground sm:hidden">{page}/{totalPages}</span>

            {/* Pagination buttons */}
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="hidden sm:flex items-center gap-1">
                {paginationRange.map((item, idx) =>
                  item === "..." ? (
                    <span key={`dots-${idx}`} className="w-8 text-center text-xs text-muted-foreground">…</span>
                  ) : (
                    <Button key={item} variant={page === item ? "default" : "outline"} size="sm"
                      className={cn("h-8 w-8 p-0 text-xs", page === item && "pointer-events-none")}
                      onClick={() => setPage(item as number)}>
                      {item}
                    </Button>
                  )
                )}
              </div>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <AddUnitModal open={addOpen} onClose={() => setAddOpen(false)} onSuccess={handleRefresh} />
      <UnitDetailDrawer unit={selectedUnit} onClose={() => setSelectedUnit(null)} onUpdate={handleRefresh} />

      {/* Sold channel picker modal */}
      {inlineStatusUnit && inlineNewStatus === "sold" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => { setInlineStatusUnit(null); setInlineNewStatus(""); setInlineSoldChannel(""); }} />
          <div className="relative z-10 bg-card rounded-2xl border border-border shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Pilih Channel Penjualan</h3>
            <p className="text-xs text-muted-foreground">Unit akan ditandai sebagai terjual. Pilih channel penjualan.</p>
            <Select value={inlineSoldChannel} onValueChange={(v) => setInlineSoldChannel(v as SoldChannel)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Pilih channel..." /></SelectTrigger>
              <SelectContent>
                {getSoldChannelOptions().map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              {isSuperAdmin
                ? "Sebagai Super Admin, Anda dapat memilih semua channel."
                : "POS & Website hanya otomatis terisi saat transaksi sukses."}
            </p>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1 h-9 text-sm" onClick={() => { setInlineStatusUnit(null); setInlineNewStatus(""); setInlineSoldChannel(""); }}>Batal</Button>
              <Button className="flex-1 h-9 text-sm" disabled={!inlineSoldChannel || inlineUpdating} onClick={handleSoldChannelConfirm}>
                {inlineUpdating ? <div className="w-3 h-3 border border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> : "Konfirmasi"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Export empty modal */}
      {exportEmptyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setExportEmptyOpen(false)} />
          <div className="relative z-10 bg-card rounded-2xl border border-border shadow-2xl w-full max-w-sm p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-xl bg-[hsl(var(--status-minus-bg))] flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-[hsl(var(--status-minus-fg))]" />
              </div>
              <button onClick={() => setExportEmptyOpen(false)} className="p-1 rounded-lg hover:bg-accent"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Ekspor Tidak Dapat Dilakukan</h2>
              <p className="text-sm text-muted-foreground mt-1">Tidak ada data yang dapat diekspor. Reset filter untuk menampilkan semua unit.</p>
            </div>
            <div className="flex gap-2 pt-1">
              {hasActiveFilters && <Button variant="outline" className="flex-1 h-9 text-sm" onClick={() => { resetFilters(); setExportEmptyOpen(false); }}>Reset Filter</Button>}
              <Button className="flex-1 h-9 text-sm" onClick={() => setExportEmptyOpen(false)}>Mengerti</Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
