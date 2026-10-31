-- 013 — Izin Keuangan: Maker & Approver terpisah (database SABLON, schema monitoring_sablon).
--
-- Aman dijalankan ulang. Tidak mengubah struktur tabel; hanya mengisi ulang kolom JSON
-- `users.permissions`. Konveksi dan schema lain tidak disentuh.
--
-- ATURAN BARU (cermin lib/finance/caps.ts)
--   keuangan.view     → membuka menu, melihat tagihan/transaksi/laporan
--   keuangan.maker    → menerbitkan/merevisi tagihan, mencatat pembayaran, pengeluaran & refund
--   keuangan.approver → memverifikasi/menolak pembayaran & pengeluaran, Laporan
--   keuangan.delete   → void (tidak berubah)
--
-- DATA LAMA
--   keuangan.create → keuangan.maker
--   keuangan.edit   → keuangan.approver
-- Kunci create/edit dihapus dari bagian keuangan. Nilai maker/approver yang SUDAH tertulis
-- tidak ditimpa. Super Admin tidak terpengaruh (kode selalu mengizinkan semua aksi Keuangan).
--
-- Penegakan izin Keuangan ada di API server (requireFinance, service role); fungsi database
-- keuangan hanya bisa dipanggil service_role, jadi tidak ada fungsi yang perlu diubah.
--
-- CEK DULU (opsional, sekali saja): pastikan tidak ada policy RLS yang membaca create/edit
-- milik keuangan. Bila hasilnya ada baris, kabari sebelum menjalankan skrip ini:
--   select schemaname, tablename, policyname, qual, with_check
--   from pg_policies
--   where schemaname = 'monitoring_sablon'
--     and (coalesce(qual,'') ilike '%keuangan%' or coalesce(with_check,'') ilike '%keuangan%');

begin;

update monitoring_sablon.users u
set permissions = jsonb_set(
  u.permissions,
  '{keuangan}',
  ((u.permissions -> 'keuangan') - 'create' - 'edit')
  || jsonb_build_object(
       'maker',
       coalesce((u.permissions -> 'keuangan' ->> 'maker') = 'true',
                (u.permissions -> 'keuangan' ->> 'create') = 'true', false),
       'approver',
       coalesce((u.permissions -> 'keuangan' ->> 'approver') = 'true',
                (u.permissions -> 'keuangan' ->> 'edit') = 'true', false)
     )
)
where jsonb_typeof(u.permissions -> 'keuangan') = 'object'
  and (   not (u.permissions -> 'keuangan' ? 'maker')
       or not (u.permissions -> 'keuangan' ? 'approver')
       or u.permissions -> 'keuangan' ? 'create'
       or u.permissions -> 'keuangan' ? 'edit');

commit;

notify pgrst, 'reload schema';

-- ─── Cek hasil ───────────────────────────────────────────────────────────────
--   select name, role, permissions -> 'keuangan' as keuangan
--   from monitoring_sablon.users
--   where permissions -> 'keuangan' is not null
--   order by name;
