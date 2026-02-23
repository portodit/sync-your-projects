# 🚀 Panduan: Mengganti Project Lovable dengan Project React Sendiri via GitHub

## Langkah-langkah

### Step 1: Integrasikan GitHub
1. Buka Lovable → Settings → GitHub → Connect
2. Buat repository baru atau hubungkan ke repo existing
3. Tunggu sync selesai

### Step 2: Ganti Isi Repo GitHub
1. Clone repo GitHub yang sudah terkoneksi Lovable
2. Hapus semua file bawaan Lovable
3. Copy-paste project React Anda ke dalam repo
4. **Pastikan project Anda Vite-based** (bukan Next.js/CRA)
5. Commit & push ke branch utama (`main`)
6. Tunggu ~1 menit agar Lovable sync otomatis

### Step 3: Kirim Prompt ke Lovable (1 Pesan, Hemat Credit)

Copy-paste prompt di bawah ini ke chat Lovable yang baru. **Sesuaikan bagian dalam `[...]`** dengan detail project Anda.

---

## ✅ Template Prompt (Salin Ini)

```
Saya sudah mengganti isi repo GitHub yang terintegrasi dengan project React saya sendiri. 
Tolong lakukan hal berikut:

1. Baca dan pahami struktur project yang sekarang ada di repo. Mulai dari:
   - package.json (dependencies & scripts)
   - vite.config.ts atau vite.config.js
   - src/App.tsx dan src/main.tsx
   - Struktur folder src/

2. Info project saya:
   - Stack: [React + Vite + TypeScript + Tailwind CSS] (sesuaikan)
   - Deskripsi: [Aplikasi toko online / dashboard / portfolio / dll]
   - Backend: [Supabase / belum ada / API eksternal di URL xxx]
   - Environment variables yang dibutuhkan: [VITE_API_URL, VITE_SUPABASE_URL, dll]

3. Setelah memahami project, tolong:
   - Pastikan project bisa di-build tanpa error
   - Perbaiki jika ada masalah kompatibilitas dengan environment Lovable
   - Deploy/preview project ini di Lovable

Jangan ubah fungsionalitas apapun, cukup pastikan berjalan dengan baik di Lovable.
```

---

## 💡 Tips Tambahan

| Tips | Penjelasan |
|------|-----------|
| **Vite only** | Lovable hanya support Vite. Jika project Anda CRA/Next.js, perlu migrasi dulu |
| **Port 8080** | Lovable menggunakan port 8080, pastikan `vite.config` tidak conflict |
| **Env variables** | Gunakan prefix `VITE_` untuk semua env yang diakses di frontend |
| **Node modules** | Tidak perlu di-push, Lovable akan `npm install` otomatis |
| **Supabase** | Jika butuh backend, aktifkan Lovable Cloud dari chat |

## ⚠️ Yang Harus Dihindari

- ❌ Jangan push `node_modules/` ke repo
- ❌ Jangan gunakan Next.js, Angular, Vue, atau Svelte
- ❌ Jangan hardcode API keys di kode (gunakan secrets/env)
- ❌ Jangan langsung minta fitur baru sebelum Lovable paham projectnya
