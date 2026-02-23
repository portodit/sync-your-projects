import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { CustomerAuthProvider } from "@/contexts/CustomerAuthContext";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import NotFound from "./pages/NotFound";

// Customer pages
import LandingPage from "./pages/customer/LandingPage";
import ShopPage from "./pages/customer/ShopPage";
import ProductDetailPage from "./pages/customer/ProductDetailPage";
import CartPage from "./pages/customer/CartPage";
import CheckoutPage from "./pages/customer/CheckoutPage";
import CustomerTransaksiPage from "./pages/customer/CustomerTransaksiPage";
import CustomerTransaksiDetailPage from "./pages/customer/CustomerTransaksiDetailPage";

// Customer auth pages
import CustomerLoginPage from "./pages/auth/CustomerLoginPage";
import CustomerRegisterPage from "./pages/auth/CustomerRegisterPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";

// Admin auth pages
import AdminLoginPage from "./pages/auth/AdminLoginPage";
import AdminRegisterPage from "./pages/auth/AdminRegisterPage";
import AdminForgotPasswordPage from "./pages/auth/AdminForgotPasswordPage";
import AdminResetPasswordPage from "./pages/auth/AdminResetPasswordPage";
import WaitingApprovalPage from "./pages/auth/WaitingApprovalPage";

// Admin dashboard pages (protected)
import DashboardPage from "./pages/admin/DashboardPage";
import MasterProductsPage from "./pages/admin/MasterProductsPage";
import StockIMEIPage from "./pages/admin/StockIMEIPage";
import StokOpnamePage from "./pages/admin/StokOpnamePage";
import ManajemenAdminPage from "./pages/admin/ManajemenAdminPage";
import ManajemenCustomerPage from "./pages/admin/ManajemenCustomerPage";
import LaporanPage from "./pages/admin/LaporanPage";
import ProfilPage from "./pages/admin/ProfilPage";
import PengaturanPage from "./pages/admin/PengaturanPage";
import ActivityLogPage from "./pages/admin/ActivityLogPage";
import KatalogPage from "./pages/admin/KatalogPage";
import KatalogFormPage from "./pages/admin/katalog/KatalogFormPage";
import BonusProductsPage from "./pages/admin/katalog/BonusProductsPage";
import DiscountCodesPage from "./pages/admin/katalog/DiscountCodesPage";
import FlashSalePage from "./pages/admin/FlashSalePage";
import ManajemenCabangPage from "./pages/admin/ManajemenCabangPage";
import POSPage from "./pages/admin/POSPage";
import KanalPembayaranPage from "./pages/admin/KanalPembayaranPage";
import TransaksiDetailPage from "./pages/admin/TransaksiDetailPage";
import RiwayatTransaksiPage from "./pages/admin/RiwayatTransaksiPage";
import InvoicePage from "./pages/admin/InvoicePage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <LocaleProvider>
          <CustomerAuthProvider>
          <AuthProvider>

          <Routes>
            {/* ── Public / Landing ──────────────────────────────── */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/katalog" element={<ShopPage />} />
            <Route path="/produk/:slug" element={<ProductDetailPage />} />
            <Route path="/keranjang" element={<CartPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/riwayat" element={<CustomerTransaksiPage />} />
            <Route path="/riwayat/:id" element={<CustomerTransaksiDetailPage />} />

            {/* ── Customer auth routes ───────────────────────────── */}
            <Route path="/login" element={<CustomerLoginPage />} />
            <Route path="/register" element={<CustomerRegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* ── Admin auth routes (/admin/...) ─────────────────── */}
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/admin/register" element={<AdminRegisterPage />} />
            <Route path="/admin/forgot-password" element={<AdminForgotPasswordPage />} />
            <Route path="/admin/reset-password" element={<AdminResetPasswordPage />} />
            <Route path="/admin/waiting-approval" element={<WaitingApprovalPage />} />

            {/* ── Protected dashboard routes (/admin/...) ────── */}
            <Route path="/admin/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/admin/master-produk" element={<ProtectedRoute><MasterProductsPage /></ProtectedRoute>} />
            <Route path="/admin/stok-imei" element={<ProtectedRoute><StockIMEIPage /></ProtectedRoute>} />
            <Route path="/admin/stok-opname" element={<ProtectedRoute><StokOpnamePage /></ProtectedRoute>} />
            <Route path="/admin/manajemen-customer" element={<ProtectedRoute allowRoles={["super_admin", "admin_branch"]}><ManajemenCustomerPage /></ProtectedRoute>} />
            <Route path="/admin/manajemen-admin" element={<ProtectedRoute allowRoles={["super_admin", "admin_branch"]}><ManajemenAdminPage /></ProtectedRoute>} />
            <Route path="/admin/manajemen-admin/:tab" element={<ProtectedRoute allowRoles={["super_admin", "admin_branch"]}><ManajemenAdminPage /></ProtectedRoute>} />
            <Route path="/admin/laporan" element={<ProtectedRoute><LaporanPage /></ProtectedRoute>} />
            <Route path="/admin/profil" element={<ProtectedRoute><ProfilPage /></ProtectedRoute>} />
            <Route path="/admin/pengaturan" element={<ProtectedRoute><PengaturanPage /></ProtectedRoute>} />
            <Route path="/admin/log-aktivitas" element={<ProtectedRoute requireRole="super_admin"><ActivityLogPage /></ProtectedRoute>} />
            {/* Katalog & Flash Sale: web_admin + super_admin only */}
            <Route path="/admin/katalog" element={<ProtectedRoute allowRoles={["super_admin", "web_admin"]}><KatalogPage /></ProtectedRoute>} />
            <Route path="/admin/katalog/tambah" element={<ProtectedRoute allowRoles={["super_admin", "web_admin"]}><KatalogFormPage /></ProtectedRoute>} />
            <Route path="/admin/katalog/edit/:id" element={<ProtectedRoute allowRoles={["super_admin", "web_admin"]}><KatalogFormPage /></ProtectedRoute>} />
            <Route path="/admin/katalog/bonus" element={<ProtectedRoute requireRole="super_admin"><BonusProductsPage /></ProtectedRoute>} />
            <Route path="/admin/katalog/diskon" element={<ProtectedRoute requireRole="super_admin"><DiscountCodesPage /></ProtectedRoute>} />
            <Route path="/admin/flash-sale" element={<ProtectedRoute allowRoles={["super_admin", "web_admin"]}><FlashSalePage /></ProtectedRoute>} />
            <Route path="/admin/cabang" element={<ProtectedRoute requireRole="super_admin"><ManajemenCabangPage /></ProtectedRoute>} />
            <Route path="/admin/pos" element={<ProtectedRoute><POSPage /></ProtectedRoute>} />
            <Route path="/admin/transaksi" element={<ProtectedRoute><RiwayatTransaksiPage /></ProtectedRoute>} />
            <Route path="/admin/transaksi/:id" element={<ProtectedRoute><TransaksiDetailPage /></ProtectedRoute>} />
            <Route path="/admin/transaksi/:id/invoice" element={<ProtectedRoute><InvoicePage /></ProtectedRoute>} />
            <Route path="/admin/penjualan/kanal-pembayaran" element={<ProtectedRoute allowRoles={["super_admin", "admin_branch"]}><KanalPembayaranPage /></ProtectedRoute>} />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </AuthProvider>
          </CustomerAuthProvider>
        </LocaleProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
