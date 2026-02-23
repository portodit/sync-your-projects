#!/usr/bin/env python3
"""
Export semua tabel dari database Lovable Cloud ke file CSV.
Menggunakan Supabase REST API dengan anon key (public).

Untuk tabel yang dilindungi RLS, perlu login admin.

Cara pakai:
  1. pip install supabase
  2. python scripts/export_db.py --email admin@xxx.com --password xxx

Tanpa login hanya tabel publik yang bisa diakses.
File CSV akan disimpan di folder 'exports/'.
"""

import csv, pathlib, sys, argparse
from supabase import create_client

# ── Konfigurasi ────────────────────────────────────────────────────────────────
SUPABASE_URL = "https://aycnkakcjauxvqlxcugr.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5Y25rYWtjamF1eHZxbHhjdWdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MTQzMjYsImV4cCI6MjA4NzE5MDMyNn0.efCBfpynfztZTOajg5CLZAcCDUu8360QKxa_hyzbe3o"

TABLES = [
    "activity_logs",
    "bonus_products",
    "branches",
    "catalog_discount_codes",
    "catalog_products",
    "discount_codes",
    "flash_sale_settings",
    "master_products",
    "notifications",
    "opname_scanned_items",
    "opname_schedules",
    "opname_session_assignments",
    "opname_sessions",
    "opname_snapshot_items",
    "payment_methods",
    "stock_unit_logs",
    "stock_units",
    "suppliers",
    "transaction_items",
    "transactions",
    "user_branches",
    "user_profiles",
    "user_roles",
    "warranty_labels",
]

OUTPUT_DIR = pathlib.Path("exports")


def fetch_all_rows(client, table: str) -> list[dict]:
    """Fetch semua baris dari tabel (handle pagination 1000 rows)."""
    all_rows = []
    offset = 0
    batch = 1000
    while True:
        resp = client.table(table).select("*").range(offset, offset + batch - 1).execute()
        rows = resp.data or []
        all_rows.extend(rows)
        if len(rows) < batch:
            break
        offset += batch
    return all_rows


def export_table(client, table: str):
    """Export satu tabel ke CSV."""
    print(f"  📥 {table}...", end=" ", flush=True)
    try:
        rows = fetch_all_rows(client, table)
    except Exception as e:
        print(f"⚠️  SKIP ({e})")
        return

    if not rows:
        print("(kosong)")
        return

    filepath = OUTPUT_DIR / f"{table}.csv"
    keys = list(rows[0].keys())
    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        writer.writerows(rows)

    print(f"✅ {len(rows)} baris")


def main():
    parser = argparse.ArgumentParser(description="Export tabel database ke CSV")
    parser.add_argument("--email", help="Email admin untuk login (akses tabel RLS)")
    parser.add_argument("--password", help="Password admin")
    parser.add_argument("--key", help="Service Role Key (bypass RLS tanpa login)")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(exist_ok=True)

    # Pilih key: service role key jika ada, kalau tidak pakai anon key
    key = args.key if args.key else ANON_KEY
    client = create_client(SUPABASE_URL, key)

    if args.key:
        print("🔑 Menggunakan Service Role Key (bypass RLS)")
    elif args.email and args.password:
        print(f"🔑 Login sebagai {args.email}...")
        client.auth.sign_in_with_password({"email": args.email, "password": args.password})
        print("  ✅ Login berhasil")
    else:
        print("⚠️  Tanpa login — tabel dengan RLS mungkin tidak bisa diakses")
        print("   Gunakan: python scripts/export_db.py --email xxx --password xxx")

    print(f"📂 Export ke folder: {OUTPUT_DIR.resolve()}\n")

    for table in TABLES:
        export_table(client, table)

    print(f"\n✅ Selesai! File CSV ada di: {OUTPUT_DIR.resolve()}")


if __name__ == "__main__":
    main()
