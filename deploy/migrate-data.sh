#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Ivalora Gadget — Data Migration Script
# Export data from Lovable Cloud → Import to VPS Supabase
# ═══════════════════════════════════════════════════════════════════
#
# Usage:
#   1. Install prerequisites: sudo apt install -y postgresql-client jq
#   2. Edit the SOURCE and TARGET variables below
#   3. Run: bash deploy/migrate-data.sh
#
# This script exports all public tables from Lovable Cloud Supabase
# and imports them into your self-hosted VPS Supabase instance.
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# ── SOURCE: Lovable Cloud Supabase ──────────────────────────────
# Get this from Lovable Cloud > Settings > Database
# Format: postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
SOURCE_DB_URL="${SOURCE_DB_URL:-}"

# ── TARGET: Your VPS Supabase ───────────────────────────────────
# Format: postgresql://postgres:[password]@localhost:5432/postgres
TARGET_DB_URL="${TARGET_DB_URL:-}"

# ── Tables to migrate (in dependency order) ─────────────────────
# NOTE: auth.users is NOT included — users must re-register or be
# re-created via supabase auth admin commands on the target.
TABLES=(
  # Reference / master data (no FK dependencies)
  "warranty_labels"
  "suppliers"
  "bonus_products"

  # Core product data
  "master_products"

  # Branch / user structure
  "branches"
  "user_profiles"
  "user_roles"
  "user_branches"

  # Stock
  "stock_units"
  "stock_unit_logs"

  # Catalog / sales
  "discount_codes"
  "catalog_products"
  "catalog_discount_codes"

  # Flash sale
  "flash_sale_settings"

  # Payment channels
  "payment_methods"

  # Transactions (depends on branches, stock_units)
  "transactions"
  "transaction_items"

  # Notifications & logs
  "notifications"
  "activity_logs"

  # Stock opname
  "opname_schedules"
  "opname_sessions"
  "opname_session_assignments"
  "opname_snapshot_items"
  "opname_scanned_items"
)

# ── Colors ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

DUMP_DIR="/tmp/ivalora-migration-$(date +%Y%m%d_%H%M%S)"

# ── Validation ──────────────────────────────────────────────────
if [ -z "$SOURCE_DB_URL" ]; then
  echo -e "${RED}ERROR: SOURCE_DB_URL is not set.${NC}"
  echo ""
  echo "Set it like this:"
  echo "  export SOURCE_DB_URL=\"postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres\""
  echo ""
  echo "Find the connection string in: Lovable Cloud → Cloud View → Database → Connect"
  exit 1
fi

if [ -z "$TARGET_DB_URL" ]; then
  echo -e "${RED}ERROR: TARGET_DB_URL is not set.${NC}"
  echo ""
  echo "Set it like this:"
  echo "  export TARGET_DB_URL=\"postgresql://postgres:VPS_DB_PASSWORD@localhost:5432/postgres\""
  exit 1
fi

# Check prerequisites
for cmd in psql pg_dump jq; do
  if ! command -v $cmd &> /dev/null; then
    echo -e "${RED}ERROR: '$cmd' not found. Install with: sudo apt install -y postgresql-client jq${NC}"
    exit 1
  fi
done

echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Ivalora Gadget — Data Migration Tool v2          ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""

mkdir -p "$DUMP_DIR"

# ── Step 1: Test connections ────────────────────────────────────
echo -e "${YELLOW}[1/4] Testing database connections...${NC}"

echo -n "  Source (Lovable Cloud): "
if psql "$SOURCE_DB_URL" -c "SELECT 1" &>/dev/null; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${RED}FAILED${NC}"
  echo "  Cannot connect to source database. Check SOURCE_DB_URL."
  exit 1
fi

echo -n "  Target (VPS):          "
if psql "$TARGET_DB_URL" -c "SELECT 1" &>/dev/null; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${RED}FAILED${NC}"
  echo "  Cannot connect to target database. Check TARGET_DB_URL."
  exit 1
fi

echo ""

# ── Step 2: Export data from source ─────────────────────────────
echo -e "${YELLOW}[2/4] Exporting data from Lovable Cloud...${NC}"

EXPORT_COUNT=0
SKIP_COUNT=0

for table in "${TABLES[@]}"; do
  ROW_COUNT=$(psql "$SOURCE_DB_URL" -t -A -c "SELECT COUNT(*) FROM public.\"$table\"" 2>/dev/null || echo "0")
  ROW_COUNT=$(echo "$ROW_COUNT" | tr -d '[:space:]')

  if [ "$ROW_COUNT" = "0" ] || [ -z "$ROW_COUNT" ]; then
    echo -e "  ${CYAN}${table}${NC}: skipped (empty)"
    ((SKIP_COUNT++))
    continue
  fi

  pg_dump "$SOURCE_DB_URL" \
    --data-only \
    --table="public.\"$table\"" \
    --column-inserts \
    --no-owner \
    --no-privileges \
    --disable-triggers \
    -f "$DUMP_DIR/${table}.sql" 2>/dev/null

  if [ -f "$DUMP_DIR/${table}.sql" ]; then
    echo -e "  ${CYAN}${table}${NC}: ${GREEN}${ROW_COUNT} rows exported${NC}"
    ((EXPORT_COUNT++))
  else
    echo -e "  ${CYAN}${table}${NC}: ${RED}export failed${NC}"
  fi
done

echo ""

# ── Step 3: Count exported files ────────────────────────────────
FILE_COUNT=$(find "$DUMP_DIR" -name "*.sql" -type f | wc -l)

if [ "$FILE_COUNT" -eq 0 ]; then
  echo -e "${YELLOW}No data to migrate. All tables are empty.${NC}"
  rm -rf "$DUMP_DIR"
  exit 0
fi

echo -e "${YELLOW}[3/4] ${FILE_COUNT} tables ready for import (${SKIP_COUNT} skipped as empty).${NC}"
echo ""

# ── Confirmation ────────────────────────────────────────────────
echo -e "${RED}⚠ WARNING: This will INSERT data into your VPS database.${NC}"
echo -e "${RED}  Existing rows with same IDs may cause CONFLICT errors.${NC}"
echo -e "${RED}  auth.users data is NOT migrated — users must re-register.${NC}"
echo ""
read -p "Continue with import? (y/N): " CONFIRM

if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Aborted. Exported files saved at: $DUMP_DIR"
  exit 0
fi

echo ""

# ── Step 4: Import data to target ──────────────────────────────
echo -e "${YELLOW}[4/4] Importing data to VPS...${NC}"

IMPORTED=0
FAILED=0

for table in "${TABLES[@]}"; do
  DUMP_FILE="$DUMP_DIR/${table}.sql"
  [ ! -f "$DUMP_FILE" ] && continue

  if psql "$TARGET_DB_URL" -f "$DUMP_FILE" &>/dev/null; then
    echo -e "  ${CYAN}${table}${NC}: ${GREEN}imported OK${NC}"
    ((IMPORTED++))
  else
    echo -e "  ${CYAN}${table}${NC}: ${RED}failed — retrying with conflict handling...${NC}"

    # Retry: wrap in transaction with replica mode to disable triggers
    TEMP_SQL="$DUMP_DIR/${table}_retry.sql"
    {
      echo "BEGIN;"
      echo "SET session_replication_role = replica;"
      cat "$DUMP_FILE"
      echo "SET session_replication_role = DEFAULT;"
      echo "COMMIT;"
    } > "$TEMP_SQL"

    if psql "$TARGET_DB_URL" -f "$TEMP_SQL" &>/dev/null; then
      echo -e "  ${CYAN}${table}${NC}: ${GREEN}retry succeeded${NC}"
      ((IMPORTED++))
    else
      echo -e "  ${CYAN}${table}${NC}: ${RED}retry ALSO failed — manual intervention needed${NC}"
      echo -e "         Dump: ${DUMP_DIR}/${table}.sql"
      ((FAILED++))
    fi
  fi
done

# ── Summary ─────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Migration complete!${NC}"
echo -e "${GREEN}  Imported : ${IMPORTED} tables${NC}"
echo -e "${YELLOW}  Skipped  : ${SKIP_COUNT} tables (empty)${NC}"
if [ "$FAILED" -gt 0 ]; then
  echo -e "${RED}  Failed   : ${FAILED} tables — see output above${NC}"
fi
echo -e "${BLUE}  Dump dir : ${DUMP_DIR}${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}IMPORTANT NOTES:${NC}"
echo -e "  1. auth.users NOT migrated — users must re-register on VPS or"
echo -e "     use: supabase auth admin create-user on the target instance."
echo -e "  2. Run all supabase/migrations/*.sql on target BEFORE importing."
echo -e "  3. Storage files must be migrated manually (see below)."
echo ""

# ── Optional: List storage buckets ──────────────────────────────
echo -e "${YELLOW}Checking storage buckets...${NC}"
BUCKETS=$(psql "$SOURCE_DB_URL" -t -A -c "SELECT id FROM storage.buckets" 2>/dev/null || echo "")

if [ -n "$BUCKETS" ]; then
  echo -e "  Buckets found: ${GREEN}${BUCKETS}${NC}"
  echo -e "  ${YELLOW}Storage files must be migrated manually:${NC}"
  echo -e "    1. Download from Lovable Cloud storage via the Cloud UI"
  echo -e "    2. Upload to VPS Supabase storage"
  echo -e "    3. Or use: supabase storage cp (Supabase CLI)"
else
  echo -e "  No storage buckets found or no access."
fi
