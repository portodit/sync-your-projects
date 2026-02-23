import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRecaptcha } from "@/hooks/use-recaptcha";
import { logActivity } from "@/lib/activity-log";
import logoFull from "@/assets/logo-full.svg";
import storeFront from "@/assets/ruko.jpg";

const schema = z.object({
  email: z.string().email("Email tidak valid"),
  password: z.string().min(1, "Password wajib diisi"),
});

type FormData = z.infer<typeof schema>;

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { getToken, verifyToken } = useRecaptcha();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const state = location.state as { blocked?: boolean; status?: string } | null;

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setServerError(null);

    const rcToken = await getToken("login");
    if (rcToken) await verifyToken(rcToken, "login");

    // First try normal login; if "Email not confirmed" allow through for admin roles
    let authData: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>["data"] | null = null;
    let authError: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>["error"] | null = null;

    const result = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    authData = result.data;
    authError = result.error;

    // If email not confirmed error, check if they have a valid admin role first
    if (authError?.message.includes("Email not confirmed")) {
      // Try to get user via OTP signIn won't work, so we check if credentials are valid
      // by using signInWithPassword and checking if role exists
      // We allow them in to show the waiting-approval page
      // First we need to check role from DB using their email
      const { data: profileByEmail } = await supabase
        .from("user_profiles")
        .select("id, status")
        .eq("email", data.email)
        .maybeSingle();

      if (profileByEmail) {
        // Any pending admin (role or no role) should go to waiting-approval
        if (profileByEmail.status === "pending") {
          navigate("/admin/waiting-approval", { replace: true });
          return;
        }
        const { data: roleCheck } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", profileByEmail.id)
          .maybeSingle();

        const allowedRoles = ["super_admin", "admin_branch", "employee", "web_admin"];
        if (roleCheck && allowedRoles.includes(roleCheck.role)) {
          navigate("/admin/waiting-approval", { replace: true });
          return;
        }
      }
      setServerError("Email belum diverifikasi. Periksa inbox Anda.");
      return;
    }

    if (authError) {
      if (authError.message.includes("Invalid login credentials")) {
        setServerError("Email atau password salah.");
      } else {
        setServerError(authError.message);
      }
      return;
    }

    if (!authData?.user) return;

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("status")
      .eq("id", authData.user.id)
      .single();

    const status = profile?.status;

    // Check role - only admin/super_admin allowed here
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    // Block anyone who doesn't have a valid admin role
    // BUT allow pending users who registered as admin (no role yet) to see waiting-approval
    const allowedRoles = ["super_admin", "admin_branch", "employee", "web_admin"];
    if (!roleData || !allowedRoles.includes(roleData.role)) {
      // Check if user is pending (just registered, role not yet assigned)
      if (status === "pending") {
        navigate("/admin/waiting-approval", { replace: true });
        return;
      }
      await supabase.auth.signOut();
      setServerError("Akun ini tidak memiliki akses ke panel admin. Gunakan halaman login yang sesuai.");
      return;
    }

    await logActivity({
      action: "admin_login",
      actor_id: authData.user.id,
      actor_email: authData.user.email,
      metadata: { status },
    });

    if (status === "pending") {
      navigate("/admin/waiting-approval", { replace: true });
    } else if (status === "suspended") {
      await supabase.auth.signOut();
      setServerError("Akun Anda telah disuspend. Hubungi administrator.");
    } else if (status === "rejected") {
      await supabase.auth.signOut();
      setServerError("Akun Anda ditolak. Hubungi administrator.");
    } else {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/admin/dashboard";
      navigate(from, { replace: true });
    }
  };

  return (
    <div className="auth-page min-h-screen flex bg-background">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-1/2 relative overflow-hidden">
        <img src={storeFront} alt="Ivalora Gadget Store" className="absolute inset-0 w-full h-full object-cover object-top" />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
        <div className="absolute top-8 left-8">
          <img src={logoFull} alt="Ivalora Gadget" className="h-6 brightness-0 invert" />
        </div>
        <div className="absolute bottom-10 left-8 right-8 space-y-2">
          <p className="text-white/60 text-xs uppercase tracking-[0.2em] font-medium">Dashboard Admin</p>
          <h2 className="text-white text-3xl xl:text-4xl font-bold leading-tight">
            Pusat Jual Beli<br />iPhone Surabaya
          </h2>
          <p className="text-white/50 text-sm">Kelola penjualan, stok IMEI, dan laporan dalam satu platform.</p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col min-h-screen px-6 py-10 sm:px-8 lg:px-12 xl:px-16">
        <div className="lg:hidden flex justify-center mb-6">
          <img src={logoFull} alt="Ivalora Gadget" className="h-7 invert" />
        </div>

        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-sm space-y-8">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Panel Admin</p>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Masuk ke akun admin</h1>
              <p className="text-sm text-muted-foreground">Gunakan email dan password yang terdaftar</p>
            </div>

            {state?.blocked && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {state.status === "suspended" ? "Akun Anda telah disuspend." : "Akun Anda ditolak oleh administrator."}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Email</Label>
                <Input id="email" type="email" placeholder="Email admin" autoComplete="email" {...register("email")} className="h-11 bg-background" />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Password</Label>
                  <Link to="/admin/forgot-password" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Lupa password?</Link>
                </div>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} placeholder="Password Anda" autoComplete="current-password" {...register("password")} className="h-11 pr-10 bg-background" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>

              {serverError && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{serverError}</div>
              )}

              <Button type="submit" className="w-full h-11 gap-2 font-semibold" disabled={isSubmitting}>
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (<>Masuk <ArrowRight className="w-4 h-4" /></>)}
              </Button>
            </form>

            <p className="text-sm text-center text-muted-foreground">
              Belum punya akun?{" "}
              <Link to="/admin/register" className="font-semibold text-foreground hover:underline underline-offset-4">Daftar sebagai Admin</Link>
            </p>
          </div>
        </div>

        <p className="pt-8 text-center text-xs text-muted-foreground/50">Ivalora Gadget RMS · Admin Panel</p>
      </div>
    </div>
  );
}
