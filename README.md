# LCO SuperApp — Monitoring Produksi

Aplikasi internal untuk mengelola seluruh alur kerja unit **sablon** di Langitan.co: dari pesanan masuk, proses produksi (manual & DTF), keuangan, penggajian tukang, hingga Pre-Order (PO) publik dan tracking pesanan oleh pelanggan.

> **Status:** Dikembangkan sendiri (self-taught / "vibe coding") oleh pemilik bisnis, tanpa tim developer formal. README ini dibuat dengan bantuan AI berdasarkan hasil pembacaan kode, sebagai dokumentasi dasar agar developer/AI berikutnya (termasuk versi masa depan dari pembuatnya sendiri) bisa cepat memahami sistem ini.

---

## 1. Tujuan Aplikasi

Menggantikan pencatatan manual/Excel/WA untuk operasional produksi sablon dengan satu dashboard terpusat yang mencakup:

- Pelacakan status setiap pesanan dari masuk sampai selesai/kirim.
- Pembagian kerja & upah tukang produksi (manual dan DTF) berbasis komposisi pekerjaan (gesut, finishing, packing).
- Pencatatan keuangan (DP, pelunasan, bukti transfer) per pesanan.
- Manajemen Pre-Order (PO) massal beserta portal reseller dan pendaftaran reseller publik.
- Halaman pelacakan pesanan yang bisa diakses pelanggan tanpa login.
- Notifikasi push (Firebase Cloud Messaging) untuk update status pesanan & keterlambatan.

## 2. Tech Stack

| Layer             | Teknologi                                                                                                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework         | [Next.js 16](https://nextjs.org/) (App Router, React 19, TypeScript)                                                                                                                                  |
| Styling           | Tailwind CSS 4                                                                                                                                                                                        |
| Database & Auth   | [Supabase](https://supabase.com/) (Postgres, Auth, Storage, Realtime)                                                                                                                                 |
| Notifikasi push   | Firebase Cloud Messaging (client `firebase`, server `firebase-admin`)                                                                                                                                 |
| Integrasi lain    | Google Sheets API (`googleapis`) untuk sinkronisasi data pesanan                                                                                                                                      |
| Utilitas          | `date-fns`, `xlsx` (export Excel), `jspdf` + `html2canvas-pro`/`html-to-image` (export PDF/gambar nota & slip), `jszip`, `react-easy-crop`, `browser-image-compression`, `recharts` (chart dashboard) |
| Deployment target | Vercel (ada Cron Job & API routes yang sesuai konvensi Vercel)                                                                                                                                        |

## 3. Struktur Direktori

Struktur di bawah mengikuti isi repositori saat ini (`node_modules/`, `.next/`, dan `.git/` tidak ditampilkan). Saat menambah folder atau modul baru, perbarui bagian ini agar README tetap sesuai dengan kode.

```
.
├── app/                              # Next.js App Router (halaman, komponen UI, API routes)
│   ├── api/                          # API routes server-side (service role Supabase, dilindungi lib/apiAuth.ts)
│   │   ├── backup/                   #   backup seluruh tabel ke JSON
│   │   ├── cleanup-storage/          #   bersihkan file Storage yang tidak direferensikan order
│   │   ├── cron/
│   │   │   ├── check-overdue/        #   deteksi pesanan telat + kirim push notification
│   │   │   └── wa-reminders/         #   pengingat WhatsApp harian (dijadwalkan di Coolify, pakai CRON_SECRET)
│   │   ├── users/                    #   tambah/ubah/hapus user + akun login Supabase Auth sekaligus (admin/Super Admin)
│   │   ├── finance/                  #   API modul Keuangan
│   │   │   ├── audit/ expense-meta/ export-log/ invoice-settings/ meta/ order-lookup/
│   │   │   ├── expenses/[id]/        #     pengeluaran + aksi decide / proof / void
│   │   │   ├── invoices/             #     tagihan
│   │   │   ├── orders/[orderId]/     #     data keuangan per order (+ purge)
│   │   │   ├── overview/ report/ todo/ vendors/
│   │   │   ├── payments/[id]/        #     pembayaran + aksi proof / verify / void
│   │   │   └── salary/               #     posting / unposting gaji → pengeluaran (post, unpost)
│   │   ├── health/                   #   healthcheck ringan untuk Coolify (tanpa akses DB)
│   │   ├── po/orders/                #   hapus pesanan PO (service role)
│   │   ├── send-notification/        #   kirim push notification via Firebase Admin
│   │   ├── tracking/                 #   API publik untuk halaman /tracking (hanya kolom aman, exact match)
│   │   ├── version/                  #   info versi aplikasi (untuk UpdateBanner)
│   │   └── wa/                       #   integrasi WhatsApp
│   │       ├── gateway/              #     proxy ke service wa-gateway (status, QR, grup)
│   │       ├── notify/               #     masukkan notifikasi order ke antrian wa_outbox
│   │       └── settings/             #     saklar & pengaturan WhatsApp Bot
│   ├── components/                   # Komponen UI, dikelompokkan per modul
│   │   ├── apps/                     #   Kalkulator, Kalender, Config Harga, Nota, Gaji (SalaryView,
│   │   │                             #   FixedSalaryView, SalaryPrintSlip), Catatan Rapat, Log Aktivitas
│   │   ├── auth/                     #   layar login
│   │   ├── dashboard/                #   dashboard ringkasan, grafik, daftar aksi, banner update, share tiket
│   │   ├── finance/                  #   modul Keuangan (modal pembayaran/pengeluaran, invoice, panel per order)
│   │   │   └── tabs/                 #     tab: Overview, Payments, Expenses, Invoices, Report, Audit, Settings, Guide
│   │   ├── layout/                   #   Sidebar, Header, UnitSwitcher
│   │   ├── misc/                     #   FCMManager (push notif), AboutView, TestNotifButton
│   │   ├── orders/                   #   Buat/Edit pesanan, daftar, pesanan selesai, sampah, form approval,
│   │   │   │                         #   input ukuran & gesut, MerchandiseOrderForm (buat + edit pesanan merchandise)
│   │   │   └── detail/               #   bagian detail pesanan: header, ukuran, gesut, detail merchandise, step
│   │   │                             #   approval/produksi/finishing, catatan produksi, label pengiriman
│   │   ├── po/                       #   PO Management (admin): produk, reseller, rekap, packing, shipping, slip/struk A6
│   │   ├── settings/                 #   Pengaturan: user, permission, WhatsApp
│   │   │   └── tabs/                 #     tab: Users, Jenis Produksi, Gaji Gesut, Notifikasi, Pengumuman, Backup
│   │   └── ui/                       #   komponen umum: CustomAlert, DialogProvider, ProfileModal, AnnouncementBanner
│   ├── approval/[id]/                # Form Approval otomatis per order (wajib login)
│   ├── debug/                        # halaman debug internal (cek sesi & data user)
│   ├── po/                           # Halaman publik Pre-Order
│   │   ├── [slug]/                   #   katalog PO per event/slug
│   │   │   ├── daftar-reseller/      #     pendaftaran reseller baru (+ syarat & ketentuan)
│   │   │   └── reseller/
│   │   │       └── portal/           #     portal reseller: matrix produk, keranjang, riwayat, edit pesanan
│   │   └── order/                    #   form order publik
│   ├── po-management/[id]/           # halaman admin PO per campaign (memuat POManagementView)
│   ├── tracking/                     # halaman publik lacak pesanan (tanpa login) + timeline
│   ├── tv/                           # tampilan TV antrian produksi (/tv, atur lewat query ?per=&interval=&refresh=)
│   ├── globals.css, favicon.ico
│   ├── layout.tsx                    # root layout
│   └── page.tsx                      # entry point aplikasi internal (SPA-like, dynamic import per modul)
│
├── hooks/                            # Custom hooks (state & logika data per fitur)
│   ├── useAuth, useUsers, useUnitAccess            # sesi, user, akses antar unit
│   ├── useOrders, useOrderDetail, useUpload        # CRUD pesanan, detail, upload file
│   ├── useDashboard, useNotifications, useTVQueue  # dashboard, notifikasi, antrian TV
│   ├── useFinanceApi, useExpenseMeta, useInvoiceSettings   # modul Keuangan
│   └── usePagedList, usePOTabIdentity, useUpdateCheck      # daftar bertahap, judul tab PO, cek versi baru
│
├── lib/                              # Logika bersama (non-UI)
│   ├── finance/                      #   harga, pembayaran, pengeluaran, invoice, gaji (client & guard), helper API server
│   ├── po/                           #   helper PO: generator, harga, validasi order, optimasi gambar, arsip ZIP, pesan WA
│   ├── supabase/client.ts            #   browser client berbasis @supabase/ssr (cookie session)
│   ├── supabaseClient.ts, supabaseAdmin.ts         # client biasa & service role (server only)
│   ├── firebase.ts, firebaseAdmin.ts               # FCM client & admin
│   ├── apiAuth.ts                    #   proteksi API route (requireUser, requireCronSecret)
│   ├── orderLogic.ts, orderMerge.ts  #   logika status/notifikasi order & three-way merge antar user
│   ├── notificationHelper.ts         #   kirim push ke user / role
│   ├── waQueue.ts, waMessages.ts, waSettings.ts    # antrian & isi pesan WhatsApp (server only)
│   ├── gesutSystem.ts, roles.ts, tvQueue.ts, utils.ts
│   └── changelog.ts                  #   versi & riwayat perubahan aplikasi
│
├── types/                            # Definisi TypeScript
│   ├── index.ts                      #   Order, User, Permission, role, jenis pakaian, dll
│   └── po.ts                         #   tipe modul PO
│
├── supabase/
│   └── migrations/                   # SQL migrasi (010_finance_salary_posting.sql: posting gaji → pengeluaran;
│                                     #   011_merchandise_orders.sql: kolom pesanan merchandise — jalankan SEBELUM deploy)
│
├── wa-gateway/                       # Service terpisah: WhatsApp Gateway (Baileys), punya Dockerfile & package.json sendiri
│   └── src/index.ts                  #   worker antrian wa_outbox + HTTP kecil (/status, /qr.json, /groups, /send, /health)
│
├── scripts/                          # Script migrasi data satu-kali (dijalankan manual, lihat bagian 9)
├── public/                           # Aset statis: logo, header nota/approval, ikon, firebase-messaging-sw.js
│
├── proxy.ts                          # pengganti middleware.ts (Next.js 16): refresh sesi Supabase
├── Dockerfile, .dockerignore         # image produksi aplikasi utama (Node 20, output standalone)
├── next.config.ts, tsconfig.json, tailwind.config.ts, postcss.config.mjs, eslint.config.mjs
├── package.json, package-lock.json
└── README.md, LICENSE, NOTICE
```

## 4. Fitur Utama

### A. Aplikasi Internal (login diperlukan)

- **Dashboard** — ringkasan jumlah pesanan per status, grafik (bar/pie), daftar aksi yang perlu perhatian.
- **Pesanan Aktif** — daftar & detail pesanan dengan tahapan: Pesanan Masuk → On Process → Finishing → Kirim → Selesai (termasuk status Revisi/Ada Kendala/Telat). Detail per pesanan mencakup approval desain, input ukuran per warna/lengan, input komposisi gesut (untuk produksi manual), checklist QC & packing, upload bukti kirim/terima, label pengiriman, dan catatan kendala.
- **Merchandise** — menu & daftar terpisah untuk pesanan merchandise: lanyard, totebag, gantungan kunci, dan produk lain (tersimpan di tabel `orders` dengan `jenis_produksi = 'merchandise'`). Form: data pelanggan, jenis merchandise (+ varian bila produknya punya, mis. lanyard dengan/tanpa stopper), jumlah, PJ & helper, deadline, catatan tambahan. Alur: Approval (upload mockup) → Produksi (default: 1. Cetak Kertas Sublim ➜ tombol *Sudah Cetak*, 2. Produksi Sublim ➜ tombol *Sudah Diproduksi*, berurutan) → QC → Pengiriman (tanpa packing). **Menambah produk/varian**: edit `MERCHANDISE_PRODUCTS` di `types/index.ts`; **langkah produksi per produk**: edit `MERCHANDISE_STEPS` di `lib/utils.ts`. Tagihan/DP, tracking publik, notifikasi, dan antrian TV ikut bekerja; merchandise tidak masuk modul Gaji.
- **Kalender Produksi** — tampilan kalender deadline pesanan.
- **Pesanan Selesai** & **Sampah (Trash)** — arsip dan soft-delete pesanan.
- **Keuangan (Finance)** — pencatatan DP/pelunasan, bukti pembayaran (multi-file upload), status pembayaran per pesanan.
- **PO Management** — pembuatan event Pre-Order, katalog produk, data reseller, rekap PO, packing list, shipping list, cetak slip/struk (A6), dan pengaturan biaya tambahan (lengan panjang, ukuran XXL, dll).
- **Gaji & Upah (Salary)** — kalkulasi upah tukang berbasis komposisi kerja:
  - Produksi **Manual**: dihitung dari komposisi gesut (kecil/sedang/besar) × harga per kategori dari **Config Harga**.
  - Produksi **DTF**: dihitung dari kategori "finishing" dan "packing" (peran tim DTF berbeda: pressing, finishing, packing pada order sablon manual, bukan gesut).
  - Pesanan dengan PJ + Helper: upah dibagi berdasarkan persentase, bukan penuh ke masing-masing.
  - Cetak slip gaji (`SalaryPrintSlip`).
- **Config Harga** — histori harga per kategori (MANUAL/DTF/GENERAL/GROSIR) dengan `effective_date`, sehingga perubahan harga tidak menimpa histori gaji periode sebelumnya (setiap simpan = insert baris baru, bukan update).
- **Generator Nota** — pembuatan nota/invoice.
- **Kalkulator** — alat bantu hitung cepat.
- **Catatan Rapat (Weekly Notes)** — catatan mingguan tim.
- **Log Aktivitas** — audit trail aksi user.
- **Pengaturan Admin** — manajemen user, role, dan hak akses granular per modul (lihat bagian Role & Permission).
- **UnitSwitcher** — untuk direktur, memungkinkan berpindah antar unit bisnis Langitan.co (sablon/konveksi/dsb) yang merupakan proyek Next.js/Supabase terpisah.
- **Notifikasi push** — via Firebase Cloud Messaging + Supabase Realtime, termasuk notifikasi otomatis untuk pesanan yang telat (cron job).

### B. Halaman Publik (tanpa login)

- **`/tracking`** — pelanggan bisa melacak status pesanannya sendiri dengan kode produksi.
- **`/po/[slug]`** — katalog produk untuk event PO tertentu (per slug event), termasuk form order publik dan pendaftaran reseller baru (`daftar-reseller`).
- **`/po/reseller/portal`** — portal reseller: input pesanan (dengan matrix produk/warna/ukuran), keranjang, riwayat pesanan, edit pesanan sendiri.

### C. API Routes (server-side)

| Endpoint                      | Fungsi                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/backup`             | Backup seluruh tabel database ke JSON (pakai service role, bypass RLS).                                                       |
| `GET /api/cleanup-storage`    | Membersihkan file di Supabase Storage yang sudah tidak direferensikan order manapun.                                          |
| `GET /api/cron/check-overdue` | Cron job (dijadwalkan via Vercel Cron) untuk mendeteksi pesanan telat & kirim notifikasi push.                                |
| `POST/PATCH/DELETE /api/users`| Tambah/ubah/hapus user sekaligus akun login Supabase Auth (admin & Super Admin; hanya Super Admin yang boleh mengurus Super Admin).|
| `DELETE /api/po/orders`       | Hapus pesanan PO tertentu (service role).                                                                                     |
| `POST /api/send-notification` | Kirim push notification via Firebase Admin.                                                                                   |
| `GET/POST /api/sync-sheets`   | Sinkronisasi data pesanan ke Google Sheets.                                                                                   |
| `GET /api/test-migrate`       | Trigger script migrasi data massal (development/maintenance tool — **sebaiknya dihapus atau dilindungi sebelum production**). |
| `GET /api/version`            | Info versi aplikasi (dipakai untuk `UpdateBanner`).                                                                           |

## 5. Role & Hak Akses (Permission System)

Role user: `admin`, `produksi`, `qc`, `manager`, `designer`, `super_admin` (tampil sebagai "Super Admin"; akses penuh).

Setiap user punya objek `permissions` granular per modul (lihat `types/index.ts`), contoh modul: `dashboard`, `orders`, `merchandise`, `produksi`, `finishing`, `salary`, `logs`, `weekly_notes`, `settings`, `kalkulator`, `config_harga`, `trash`, `nota`, `keuangan`, `po_management`, dan `harga_pesanan` (kontrol khusus untuk boleh-tidaknya user tertentu melihat/mengisi harga jual di dalam detail order, terpisah dari hak edit order itu sendiri).

Catatan desain penting (dari komentar kode):

- Role `qc` dipakai untuk satu tim yang mengerjakan QC + finishing + packing DTF sekaligus (gaji dihitung gabungan per-pcs) — **tidak ada role terpisah** untuk finishing.
- `keuangan` memakai dua peran terpisah: **Maker** (terbitkan/revisi tagihan, catat pembayaran, pengeluaran, refund) dan **Approver** (verifikasi/tolak pembayaran & pengeluaran, Laporan), ditambah `view` dan `delete` (void). Kolom lama `create`/`edit` hanya dibaca sebagai cadangan untuk user lama (migration `013_finance_maker_approver.sql`). Definisi modul di layar Hak Akses ada di `lib/permissionModules.ts` (`MODULE_DEFS`); tambah modul baru cukup satu objek di sana.
- `harga_pesanan` sengaja dipisah dari `orders` (CRUD detail produksi) dan `keuangan` (mode koreksi), supaya admin yang boleh input data produksi belum tentu otomatis boleh melihat/mengisi harga jual.

## 6. Model Data Inti (ringkas)

- **Order** — entitas utama: data pemesan, jenis produksi, status, tahapan produksi (`steps_manual`/`steps_dtf`/`steps_merchandise`, dipilih lewat `getOrderSteps()` di `lib/utils.ts`), `jenis_merchandise` + `varian_merchandise` (khusus merchandise), QC & packing, shipping (bukti kirim/terima), kendala, harga & status pembayaran, bukti pembayaran (multi-file), serta `detail_gesut` (khusus produksi Manual, independen dari jumlah baju jadi karena gesut dihitung per potongan kain).
- **PricingConfig** — histori harga per kategori (`MANUAL`, `DTF`, `GENERAL`, `GROSIR`) dengan `key_name` dan `effective_date`. Tabel `pricing_configs` menjadi **satu-satunya sumber** baik untuk HPP/harga jual ke customer maupun upah per-pcs tukang (angka yang sama, bukan dua sumber terpisah).
- **PO** (`POSetting`, `POProduct`, `POOrder`, `POReseller`) — model untuk event Pre-Order: pengaturan event, katalog produk (dengan biaya tambahan lengan/ukuran), data reseller, dan pesanan PO beserta status pembayaran.

## 7. Environment Variables

Buat file `.env.local` di root project dengan variabel berikut:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # RAHASIA — hanya dipakai di server (API routes/scripts), jangan expose ke client

# Firebase Admin (untuk kirim push notification & cron overdue)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=             # simpan dengan \n literal, kode akan mengganti ke newline asli

# Google Sheets sync
GOOGLE_SHEET_ID=
GOOGLE_CLIENT_EMAIL=
GOOGLE_PRIVATE_KEY=

# Umum
NEXT_PUBLIC_APP_URL=              # base URL aplikasi (untuk link tracking, share, dsb)
```

> ⚠️ **Catatan keamanan:** Config Firebase _client-side_ (apiKey, authDomain, dst di `lib/firebase.ts`) memang lazim ter-embed di kode frontend (bukan rahasia oleh desain Firebase). Yang **wajib** dijaga kerahasiaannya adalah `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_PRIVATE_KEY`, dan `GOOGLE_PRIVATE_KEY` — semua hanya boleh dipakai di kode server (`app/api/*`, `scripts/*`), tidak pernah di komponen `"use client"`.

## 8. Menjalankan Proyek Secara Lokal

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000). Pastikan `.env.local` sudah diisi (lihat bagian 7) dan skema tabel Supabase sudah dibuat (tabel minimal: `users`, `orders`, `pricing_configs`, `announcements`, plus tabel-tabel PO: `po_settings`, `po_products`, `po_resellers`, `po_orders`).

Script lain yang tersedia:

```bash
npm run build   # build production
npm run start   # jalankan hasil build
npm run lint    # cek linting
```

## 9. Script Maintenance (`scripts/`)

Kumpulan script satu-kali (dijalankan manual, bukan bagian dari alur normal aplikasi) untuk migrasi/rename file bukti pembayaran & foto produksi di Supabase Storage agar penamaannya konsisten dengan `kode_produksi`:

- `migrate-dry-run.ts` — simulasi tanpa mengubah data (untuk cek dulu).
- `migrate-live.ts` / `migrate-all.ts` — eksekusi migrasi sungguhan.
- `force-sync-db.ts` — sinkronisasi ulang referensi file di database setelah rename.

**Saran:** jalankan selalu versi _dry-run_ dahulu sebelum versi live, dan lakukan backup (`/api/backup`) sebelum migrasi data massal apa pun.

## 10. Hal yang Perlu Diperhatikan / Technical Debt

Poin-poin ini diangkat dari catatan langsung di dalam kode (`// ── KOREKSI ──`, `// ⚠️`, dsb) — dicantumkan di sini supaya tidak hilang konteksnya:

- `app/api/test-migrate/route.ts` adalah endpoint pemicu migrasi massal yang sengaja dibuat untuk kebutuhan development. **Sebaiknya dihapus atau diberi proteksi (auth/IP-lock)** sebelum benar-benar dipakai di production agar tidak bisa dipicu oleh siapa pun yang tahu URL-nya.
- Key `PricingConfig` untuk kategori DTF (`dtf_finishing`, `dtf_packing`) ditandai sebagai **asumsi** di kode — perlu disesuaikan dengan `key_name` asli di database bila ternyata berbeda.
- Ada dua cara membuat Supabase client di `lib/` (`lib/supabaseClient.ts` dengan `createClient` biasa, dan `lib/supabase/client.ts` dengan `createBrowserClient` dari `@supabase/ssr`). Versi `@supabase/ssr` adalah yang dipakai bersama `middleware.ts` untuk sesi berbasis cookie — bila menambah kode baru, gunakan pola `@supabase/ssr` ini agar konsisten dengan autentikasi middleware.
- Riwayat perubahan permission (`UserPermissions`) dan skema role dicatat sebagai komentar inline di `types/index.ts` — baca komentar tersebut sebelum mengubah struktur permission, karena ada keputusan desain (mis. kenapa `harga_pesanan` dipisah dari `orders`/`keuangan`) yang tidak jelas kalau hanya membaca tipe datanya saja.

## 11. Changelog

Riwayat versi aplikasi dicatat langsung di kode: lihat `lib/changelog.ts` (`CHANGELOG` array) dan endpoint `GET /api/version`. Versi saat ini: **V.16.0** ("LCO SuperApp").

## 12. Kredit

Dibangun dan dikelola oleh **abdllahmajid** untuk operasional internal Langitan.co (unit Sablon).
