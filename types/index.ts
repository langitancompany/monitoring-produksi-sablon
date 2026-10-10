// app/types/index.ts

// ── KOREKSI ── awalnya saya menambahkan role baru 'finishing' di sini,
// tapi ternyata SALAH — role 'qc' yang sudah ada dari awal itu memang
// sudah dipakai untuk tim yang sama (satu tim mengerjakan QC + finishing +
// packing DTF sekaligus, gajinya digabung & dihitung per-pcs). Jadi tidak
// perlu role baru; cukup pakai role === 'qc' (lihat SalaryView.tsx,
// CreateOrder.tsx, EditOrder.tsx).
export type UserRole = 'admin' | 'produksi' | 'qc' | 'manager' | 'supervisor' | 'designer';

// ─── Tipe dasar per modul ────────────────────────────────────────────────────

interface ModuleFull     { view: boolean; create: boolean; edit: boolean; delete: boolean }
interface ModuleView     { view: boolean }
interface ModuleViewEdit { view: boolean; edit: boolean }
interface ModuleTrash    { view: boolean; delete: boolean }
// ── TAMBAHAN ── utk modul yg butuh Buat & Edit tapi TIDAK butuh Hapus
// (mis. salary: "Buat" dipakai utk hak cetak slip, "Edit" utk hak edit
// order dari halaman Gaji — tidak ada aksi hapus apa pun di modul ini).
interface ModuleViewCreateEdit { view: boolean; create: boolean; edit: boolean }


// ─── Definisi Hak Akses ──────────────────────────────────────────────────────

export interface UserPermissions {
  dashboard:     ModuleView;
  orders:        ModuleFull;
  produksi:      ModuleFull;
  finishing:     ModuleFull;
  salary:        ModuleViewCreateEdit; // ── UBAH ── dulu ModuleView; sekarang
                                        // tambah create(=cetak) & edit(=edit
                                        // order dari halaman Gaji)
  logs:          ModuleView;
  weekly_notes:  ModuleView;
  settings:      ModuleFull;
  kalkulator:    ModuleView;
  config_harga:  ModuleViewEdit;
  trash:         ModuleTrash;
  nota:          ModuleView;
  // Menu Keuangan v2: view=lihat · create=terbitkan tagihan & catat pembayaran ·
  // edit=verifikasi pembayaran · delete=void (koreksi). Lihat lib/finance/caps.ts.
  keuangan:      ModuleFull;
  po_management: ModuleFull;
  // ── TAMBAHAN ──
  // Kontrol khusus untuk input harga & status pembayaran DI DALAM modul Order
  // (Order Detail). Sengaja dipisah dari `orders` (yang isinya CRUD detail
  // produksi) dan dari `keuangan` (yang sekarang jadi mode "koreksi" di
  // Finance) supaya admin yang boleh isi order belum tentu otomatis boleh
  // lihat/isi harga jual, kecuali permission ini juga di-ON-kan untuknya.
  // Pakai ModuleFull (bukan ModuleViewEdit) karena butuh slot `delete`
  // terpisah untuk hapus bukti pembayaran (create tidak dipakai/disembunyikan
  // di Settings lewat hasCreate:false).
  /** @deprecated Digantikan permission `keuangan` (menu Keuangan v2). Tidak lagi dipakai UI. */
  harga_pesanan: ModuleFull;
}

// ─── DEFAULT_PERMISSIONS ─────────────────────────────────────────────────────

export const DEFAULT_PERMISSIONS: UserPermissions = {
  dashboard:     { view: true  },
  orders:        { view: true,  create: false, edit: false, delete: false },
  produksi:      { view: true,  create: false, edit: false, delete: false },
  finishing:     { view: true,  create: false, edit: false, delete: false },
  salary:        { view: false, create: false, edit: false },
  logs:          { view: false },
  weekly_notes:  { view: false },
  settings:      { view: false, create: false, edit: false, delete: false },
  kalkulator:    { view: true  },
  config_harga:  { view: false, edit: false },
  trash:         { view: false, delete: false },
  nota:          { view: false },
  keuangan:      { view: false, create: false, edit: false, delete: false },
  po_management: { view: false, create: false, edit: false, delete: false },
  // ── TAMBAHAN ──
  harga_pesanan: { view: false, create: false, edit: false, delete: false },
};

// ─── User ────────────────────────────────────────────────────────────────────

export interface UserData {
  id: string;
  username: string;
  password?: string;
  name: string;
  role: UserRole; // role utama (kompatibilitas pengecekan akses lama)
  // ── TAMBAHAN ── semua role yang dipilih (boleh lebih dari satu). Kosong/
  // null = user lama → dianggap [role]. Lihat lib/roles.ts.
  roles?: string[] | null;
  permissions: UserPermissions;
  address?: string;
  dob?: string;
  avatar_url?: string;
  // ── TAMBAHAN ── nomor WhatsApp untuk notifikasi (08xx / 62xx)
  no_wa?: string | null;
}

// ─── Announcment ─────────────────────────────────────────────────────────────

export interface Announcement {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'update';
  is_active: boolean;
  created_by?: string;
  created_at: string;
  expires_at?: string | null;
}

// ─── Order ───────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'Pesanan Masuk'
  | 'On Process'
  | 'Finishing'
  | 'Kirim'
  | 'Selesai'
  | 'Revisi'
  | 'Ada Kendala'
  | 'Telat';

// ── TAMBAHAN ── satu bukti transfer/pembayaran
export interface BuktiPembayaran {
  id: string;
  url: string;
  label: 'DP' | 'Lunas';
  uploadedBy?: string;
  timestamp?: string;
}

export interface Order {
  id: string;
  created_at: string;
  kode_produksi: string;
  nama_pemesan: string;
  no_hp: string;
  alamat_pemesan?: string;
  jumlah: number;
  tanggal_masuk: string;
  deadline: string;
  jenis_produksi: string;
  detail_ukuran?: SizeEntry[] | null;
  status: OrderStatus;

  assigned_to?: string | null;
  assigned_user?: { name: string } | null;

  helper_id?: string | null;
  helper_user?: { name: string } | null;

  link_approval: { link: string | null; by: string | null; timestamp: string | null } | null;
  steps_manual: ProductionStep[];
  steps_dtf: ProductionStep[];
  finishing_qc: { isPassed: boolean; notes: string; checkedBy?: string; timestamp?: string; completedAt?: string | null };
  finishing_packing: { isPacked: boolean; fileUrl?: string | null; packedBy?: string | null; timestamp?: string | null; completedAt?: string | null };
  shipping: {
    bukti_kirim?: string | null; uploaded_by_kirim?: string | null; timestamp_kirim?: string | null;
    bukti_terima?: string | null; uploaded_by_terima?: string | null; timestamp_terima?: string | null;
  };
  kendala: KendalaNote[];
  deleted_at?: string | null;
  harga_per_pcs?:      number;
  total_harga?:        number;
  dp_masuk?:           number;
  status_pembayaran?:  'Belum DP' | 'DP' | 'Lunas';
  biaya_ukuran_besar?: number;
  biaya_lengan_panjang?: number;
  // ── TAMBAHAN ──
  bukti_pembayaran?: BuktiPembayaran[];

  // ── TAMBAHAN ── komposisi gesut, hanya relevan untuk jenis_produksi Manual.
  // Independen dari detail_ukuran/jumlah (boleh beda total — gesut dihitung
  // per potongan kain, bukan per baju jadi). null/undefined = belum diisi.
  detail_gesut?: GesutEntry | null;

  // ── TAMBAHAN ── opsional, tampil di Form Approval otomatis
  ukuran_desain_depan?: string | null;
  ukuran_desain_belakang?: string | null;
  catatan_pesanan?: string | null;
  // ── TAMBAHAN ── jenis aplikasi per posisi art, boleh lebih dari satu
  jenis_aplikasi_art?: JenisAplikasiArt | null;
  // ── TAMBAHAN ── jenis pakaian. null/undefined = 'kaos' (data lama)
  jenis_pakaian?: JenisPakaian | null;
}

// ── TAMBAHAN ── T-Shirt: lengan bisa dipilih. Sweater/Hoodie: lengan otomatis panjang.
export type JenisPakaian = 'kaos' | 'sweater_hoodie';
export const JENIS_PAKAIAN_OPTIONS: { value: JenisPakaian; label: string }[] = [
  { value: 'kaos', label: 'T-Shirt' },
  { value: 'sweater_hoodie', label: 'Sweater / Hoodie' },
];

// Pilihan jenis aplikasi untuk dropdown (ubah di sini bila ada jenis baru)
export const JENIS_APLIKASI_OPTIONS = ['Platisol','Rubber','Plascharger','Discharge','Pollyflex','Plastidol HDC','Plastisol GID', 'DTF'];

export interface JenisAplikasiArt {
  depan?: string[];
  belakang?: string[];
  kanan?: string[];
  kiri?: string[];
}

// ── TAMBAHAN ── Komposisi gesut untuk order Manual. Basis hitung gaji tukang
// produksi manual (assigned_to + helper_id), berbeda dari DTF yang pakai
// rate finishing+packing agregat per tim (lihat pricing_configs kategori DTF
// dan SalaryView.tsx).
export interface GesutEntry {
  kecil: number;
  sedang: number;
  besar: number;
}

export interface ProductionStep {
  id: string;
  name: string;
  type: 'upload_image' | 'upload_pdf' | 'status_update';
  isCompleted: boolean;
  fileUrl?: string | null;
  uploadedBy?: string;
  timestamp?: string;
  // ISO 8601 — waktu step diselesaikan, dipakai menentukan bulan gaji (SalaryView).
  completedAt?: string | null;
}

export interface KendalaNote {
  id: string;
  notes: string;
  reportedBy: string;
  timestamp: string;
  isResolved: boolean;
  resolvedBy?: string;
  resolvedTimestamp?: string;
  buktiFile?: string | null;
}

export interface ProductionTypeData {
  id: string;
  name: string;
  value: string;
}

// ─── Size / Detail Ukuran ────────────────────────────────────────────────────

export type UkuranKey = 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'XXXL';

export interface SizeEntry {
  id: string;
  warna: string;
  lengan: 'pendek' | 'panjang';
  ukuran: Partial<Record<string, number>>;
}

// ─── Pricing Config (histori harga) ──────────────────────────────────────────
// ── TAMBAHAN ── effective_date ditambahkan supaya perubahan harga tidak
// menimpa histori gaji periode lalu. Setiap simpan = INSERT baris baru
// (bukan UPDATE), lihat ConfigPriceView.tsx → handleSaveConfigs.
//
// Key yang dipakai SalaryView.tsx untuk kalkulasi gaji:
//  - category MANUAL: gesut_manual_kecil, gesut_manual_sedang, gesut_manual_besar
//  - category DTF:     dtf_finishing, dtf_packing
//    (⚠️ nama key DTF ini ASUMSI — sesuaikan dengan key_name asli di DB kalau beda)
export interface PricingConfig {
  id: number;
  category: 'GENERAL' | 'DTF' | 'MANUAL' | 'GROSIR' | string;
  key_name: string;
  display_name: string;
  unit: string;
  value_amount: number;
  effective_date: string; // ISO date, mis. "2026-09-14"
}