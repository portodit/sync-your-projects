// ── Shared constants & helpers for Master Data Produk ──────────────────────

export type ProductCategory = "iphone" | "ipad" | "accessory";
export type WarrantyType = "resmi_bc" | "ibox" | "inter" | "whitelist" | "digimap";

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  iphone: "iPhone",
  ipad: "iPad",
  accessory: "Aksesoris",
};

export const WARRANTY_LABELS: Record<WarrantyType, string> = {
  resmi_bc: "Resmi BC",
  ibox: "Resmi iBox",
  inter: "Inter",
  whitelist: "Whitelist",
  digimap: "Resmi Digimap",
};

export const WARRANTY_LABELS_LONG: Record<WarrantyType, string> = {
  resmi_bc: "Resmi Bea Cukai (BC)",
  ibox: "Resmi Indonesia (iBox)",
  inter: "Internasional (Inter)",
  whitelist: "Whitelist Terdaftar",
  digimap: "Resmi Indonesia (Digimap)",
};

export const STORAGE_OPTIONS = [16, 32, 64, 128, 256, 512, 1024];

export interface MasterProduct {
  id: string;
  category: ProductCategory;
  series: string;
  storage_gb: number;
  color: string;
  warranty_type: WarrantyType;
  base_price: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
