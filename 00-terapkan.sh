#!/bin/bash
# Jalankan dari FOLDER ROOT proyek (yang berisi folder "app", "lib", "hooks"):
#   bash ~/Downloads/00-terapkan.sh
# Semua file 01-... sampai 08-... harus sudah ada di folder Downloads
# (atau beri folder lain:  bash 00-terapkan.sh /path/folder-unduhan).
set -e

SRC="${1:-$HOME/Downloads}"

# ── Cek lokasi & file ────────────────────────────────────────────
[ -d "app/po/reseller/portal" ] || { echo "❌ Jalankan dari folder root proyek (app/po/reseller/portal tidak ditemukan)."; exit 1; }
[ -e "app/po/[slug]/reseller" ] && { echo "❌ app/po/[slug]/reseller sudah ada. Berhenti supaya tidak menimpa."; exit 1; }
for f in 01-tabInfo.ts 02-slug-layout.tsx 03-reseller-layout.tsx 04-reseller-page.tsx \
         05-portal-page.tsx 06-slug-page.tsx 07-POOverview.tsx 08-POResellerList.tsx; do
  [ -f "$SRC/$f" ] || { echo "❌ File $f tidak ada di $SRC"; exit 1; }
done

# ── LANGKAH 1: pindahkan folder ──────────────────────────────────
mkdir -p "app/po/[slug]/reseller"
mv app/po/reseller/page.tsx "app/po/[slug]/reseller/page.tsx"
mv app/po/reseller/portal   "app/po/[slug]/reseller/portal"
rmdir app/po/reseller 2>/dev/null || true   # hapus folder lama kalau sudah kosong

# ── LANGKAH 2: taruh file hasil edit ─────────────────────────────
mkdir -p lib/po
cp "$SRC/01-tabInfo.ts"           "lib/po/tabInfo.ts"
cp "$SRC/02-slug-layout.tsx"      "app/po/[slug]/layout.tsx"
cp "$SRC/03-reseller-layout.tsx"  "app/po/[slug]/reseller/layout.tsx"
cp "$SRC/04-reseller-page.tsx"    "app/po/[slug]/reseller/page.tsx"
cp "$SRC/05-portal-page.tsx"      "app/po/[slug]/reseller/portal/page.tsx"
cp "$SRC/06-slug-page.tsx"        "app/po/[slug]/page.tsx"
cp "$SRC/07-POOverview.tsx"       "app/components/po/POOverview.tsx"
cp "$SRC/08-POResellerList.tsx"   "app/components/po/POResellerList.tsx"

echo "✅ Selesai. Hapus cache lalu jalankan ulang:  rm -rf .next && npm run dev"
