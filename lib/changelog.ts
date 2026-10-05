// app/lib/changelog.ts

export const APP_INFO = {
  name: "LCO SuperApp",
  version: "V.17.0",
  purpose: "Aplikasi produksi Sablon, Langitan.co.",
  creator: "abdllahmajid",
  creationDate: "13 Desember 2025",
  notes: 'Penambahan menu baru + Perbaikan bug',
};

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
  version: "17.0",
  date: "2026-09-14",
  changes: [
    "Redesign visual 'LCO Flat' diterapkan ke seluruh menu PO Management (Produk, Reseller, Packing, Pengiriman): palet netral zinc, satu warna aksen teal untuk elemen interaktif/data, dan hijau tua untuk tombol aksi utama.",
    "Status pesanan (kurang stok, nonaktif, dsb) kini ditampilkan sebagai indikator teks berwarna, menggantikan badge kotak solid agar tabel & daftar lebih mudah dipindai.",
    "Semua kode PO, kode produk/reseller, dan angka kini konsisten memakai font monospace agar lebih mudah dibaca dan dibandingkan.",
    "Penyederhanaan animasi antarmuka: transisi dibatasi pada perubahan warna saja, menghilangkan efek scale/shadow/fade yang tidak perlu untuk tampilan lebih cepat dan bersih.",
  ],
  },
  {
    version: "15.1",
    date: "2026-09-13",
    changes: [
      "Tampilan baru pada menu Dashboard",
      "Perbaikan bug aplikasi",
    ],
  },
  {
    version: "15.0",
    date: "2026-07-07",
    changes: [
      "Perbaikan dan penambahan fitur baru: Po Management, Keuangan"
    ],
  },
  {
    version: "14.5",
    date: "2026-06-17",
    changes: [
      "Penambahan menu PO Management yang hanya bisa di akses oleh supervisor, guna keperluan management PO, serta perekapan PO.",
      "Perbaikan bug",
    ],
  },
  {
    version: "14.0",
    date: "2026-06-06",
    changes: [
      "Penambahan menu keuangan.",
      "Perbaikan bug",
    ],
  },
  {
    version: "13.5",
    date: "2026-05-18",
    changes: [
      "Update perbaikan bug",
      "Perbaikan routing aplikasi",
      "Penambahan card baru di hero section"
    ],
  },
  {
    version: "13.1",
    date: "2026-05-13",
    changes: [
      "Update perbaikan bug",
      "Perbaikan Notfikasi aplikasi yg sering bertumpuk"
    ],
  },
    {
    version: "13",
    date: "2026-05-11",
    changes: [
      "Penambahan kolom input ukuran di bagian buat pesanan baru.",
      "Membuat logika baru untuk input nomor telpon di input pesanan baru, agar support wa.",
      "Sekarang detail ukuran bisa dilihat di detail produksi",
      "Menambahkan fitur pengumuman yg ditampilkan di setiap dashboard users"
    ],
  },
  {
    version: "12",
    date: "2026-05-03",
    changes: [
      "Penambahan Fitur catatan jika ada kendala dalam setiap berjalannya produksi.",
      "Menambahkan menu Catatan produksi untuk digunakan rapat mingguan.",
    ],
  },
  {
    version: "11.5",
    date: "2026-05-03",
    changes: [
      "Restruktur SettingsPage dan user premission.",
      "Menambahkan fitur tracking untuk customer, dan link bisa dibagikan melalui DetailOrder.",
    ],
  },
  {
    version: "11.0",
    date: "2026-05-03",
    changes: [
      "Redesign tampilan Daftar Pesanan: Desktop menggunakan Kanban Board 4 kolom (Pesanan Masuk → On Process → Finishing → Siap Kirim), Mobile menggunakan Progress Bar Card yang informatif.",
      "Kanban Board: Setiap kolom memiliki warna header tersendiri untuk membedakan tahapan secara visual.",
      "Progress Bar Card (Mobile): Menampilkan indikator 4 tahap produksi per card, dengan warna merah untuk telat/kendala, hijau untuk selesai, dan biru untuk aktif.",
      "Smart Sorting Otomatis 3 Tier: Pesanan diurutkan otomatis — (1) Telat/Overdue paling atas, (2) Mendekati deadline ≤ H-3 diurutkan by deadline terdekat, (3) Sisa pesanan diurutkan by antrian masuk (FIFO).",
      "Filter pill baru 'Kendala' untuk menyaring pesanan berstatus Ada Kendala dan Revisi sekaligus, dilengkapi badge merah dengan hitungan.",
      "Redesign panel notifikasi: Setiap notifikasi kini memiliki ikon berwarna sesuai tipe (warning/info/success), timestamp lebih jelas, dan dot biru untuk yang belum dibaca.",
      "Fitur baru: Tombol 'Tandai semua dibaca' di panel notifikasi, muncul hanya saat ada notifikasi yang belum dibaca.",
      "Refactor arsitektur: page.tsx dipecah menjadi 5 custom hooks terpisah (useAuth, useNotifications, useOrders, useUpload, useUsers) untuk kemudahan maintenance.",
      "Pemisahan data changelog ke file tersendiri (lib/changelog.ts) agar AboutView lebih ringkas dan update versi lebih mudah.",
    ],
  },
  {
    version: "10.5",
    date: "2026-02-04",
    changes: [
      "Penambahan menu gaji.",
      "Penambahan fitur helper untuk setiap produksi.",
    ],
  },
  {
    version: "10.0",
    date: "2026-01-22",
    changes: [
      "Menambahkan Menu Kalender Produksi.",
      "Perbaikan tampilan Kalender Hybrid: Mode Desktop menampilkan list lengkap, Mode Mobile menggunakan indikator titik (dots) yang responsif.",
      "Fitur Agenda baru yang terintegrasi database (Supabase), kini mendukung input Waktu, Lokasi, dan Label Warna.",
      "Optimasi UI/UX Kalender: Perbaikan isu layout terpotong, performa modal lebih ringan, dan penyelarasan warna indikator.",
    ],
  },
  {
    version: "9.5",
    date: "2025-12-26",
    changes: [
      "Menu baru: 1. Menu Pesanan Selesai, 2. Menu Log Pesanan.",
      "Pesanan dengan status selesai sekarang menunya dipindahkan sendiri.",
      "Menu Aktivitas Log digunakan untuk memantau pergerakan pesanan untuk kebutuhan R&D.",
    ],
  },
  {
    version: "9.0",
    date: "2025-12-22",
    changes: [
      "New Theme, Support Dark Mode.",
      "Menambahkan persetujuan proofing sebelum produksi massal, tim produksi tidak akan bisa melanjutkan step sebelum mendapatkan persetujuan proofing.",
    ],
  },
  {
    version: "8.5",
    date: "2025-12-22",
    changes: [
      "New Feature: 'Arsip Selesai' — Menu dedikasi untuk melihat rekapitulasi pesanan yang telah rampung dengan statistik grafik.",
      "Smart Pagination: Tabel arsip kini dilengkapi fitur paginasi (10/20/50 baris) dengan custom dropdown.",
      "Advanced Filtering: Penambahan filter arsip berdasarkan bulan spesifik dan pencarian realtime.",
      "Mobile-Optimized Tables: Tabel kini menggunakan sistem 'Internal Scroll' dengan 'Sticky Header'.",
      "Dynamic Header System: Tampilan header kini adaptif; menampilkan judul menu saat di Mobile dan salam sapaan saat di Desktop.",
      "SPA Back Navigation: Logika tombol 'Back' browser diperbaiki.",
      "UI/UX Refinement: Perbaikan layout grid statistik pada tampilan mobile.",
    ],
  },
  {
    version: "8.0",
    date: "2025-12-21",
    changes: [
      "Smart Notification System: Sistem notifikasi interaktif dengan navigasi langsung ke detail pesanan.",
      "Real-time Notification Center: Notifikasi realtime ditampilkan di header dengan badge unread count dan dropdown modern.",
      "One-Click Navigation: Klik notifikasi langsung mengarahkan user ke halaman detail pesanan yang relevan.",
      "Auto Mark as Read: Notifikasi otomatis ditandai sebagai 'dibaca' saat diklik.",
      "Persistent Notification Storage: Notifikasi tersimpan permanen di database.",
      "Performance Optimization: Fetch notifikasi menggunakan useCallback dengan interval polling 60 detik.",
    ],
  },
  {
    version: "7.0",
    date: "2025-12-18",
    changes: [
      "Smart Push Notifications (Firebase Integration): Sistem kini mendukung notifikasi realtime ke HP/Laptop.",
      "Role-Based Notification Logic: Notifikasi dikirim hanya ke role yang relevan.",
      "Automated Morning Guard (Cron Job): Sistem otomatis mengecek pesanan telat setiap jam 09:00 pagi.",
      "FCM Token Management: Penambahan sistem penyimpanan token perangkat di database Supabase.",
      "Stability Fixes: Perbaikan inisialisasi Firebase Messaging untuk mencegah Race Condition.",
    ],
  },
  {
    version: "6.9",
    date: "2025-12-17",
    changes: [
      "HD Share Ticket: Fitur berbagi laporan menghasilkan gambar tiket resolusi tinggi yang profesional.",
      "Smart Action Dashboard: Bagian 'Perlu Tindakan Segera' kini lebih cerdas, satu pesanan bisa muncul 2x jika memiliki masalah berbeda.",
      "Redesain Order Detail: Tampilan QC & Packing kini menggunakan layout Split View yang simetris.",
      "Logika Status 'Telat' (Frontend Override): Status 'Telat' kini murni indikator waktu visual.",
      "UI/UX Polish: Perbaikan konsistensi tombol, badge status, dan kartu daftar pesanan.",
    ],
  },
  {
    version: "6.5",
    date: "2025-12-16",
    changes: [
      "Matrix Hak Akses V2 (Granular): Sistem izin super detail per fitur.",
      "Mobile-First Settings UI: Tampilan pengaturan user dikembalikan ke mode Modal.",
      "Smart Auto-Status: Status otomatis dihitung ulang saat deadline diedit.",
      "Data Safeguard: Penambahan fitur 'Smart Merge' untuk data user lama.",
    ],
  },
  {
    version: "6.1",
    date: "2025-12-12",
    changes: [
      "Revamp Kalkulator Sablon Manual: Kini mendukung perhitungan multi-area dalam satu order.",
      "Core System Upgrade: Migrasi total ke @supabase/ssr untuk stabilitas penuh di Next.js 16.",
      "Fix Logika Status Kendala: Status otomatis kembali normal setelah semua kendala diselesaikan.",
      "Smart Sorting: Tampilan pengaturan harga kini otomatis urut (Kecil → Sedang → Besar).",
    ],
  },
  {
    version: "6.0",
    date: "2025-12-07",
    changes: [
      "Matrix Hak Akses (CRUD): Upgrade sistem keamanan dengan akses sangat spesifik.",
      "Database Security (RLS): Penerapan Row Level Security tingkat lanjut.",
      "Manajemen User Lanjutan: Tampilan pengaturan user dengan tabel matriks checklist.",
      "Fix Bug Sidebar Blank: Perbaikan logika rendering menu sidebar.",
    ],
  },
  {
    version: "5.9",
    date: "2025-12-06",
    changes: [
      "Granular Access Control: Sistem hak akses baru berbasis checklist menu.",
      "Dynamic Sidebar: Menu sidebar otomatis menyesuaikan dengan izin user.",
      "Logika HPP Manual: Perhitungan upah gesut kini proporsional berdasarkan jumlah warna.",
    ],
  },
  {
    version: "5.8",
    date: "2025-12-05",
    changes: [
      "Menambah tombol share pada laporan kendala.",
    ],
  },
  {
    version: "5.5",
    date: "2025-12-03",
    changes: [
      "Dashboard dirombak total: Menampilkan grafik tren PCS dan komposisi jenis produksi.",
      "Logic status urgent/telat diperbaiki: Prioritas utama diberikan pada status 'Ada Kendala'.",
      "Kalkulator produksi: Loading spinner dan tampilan mobile diperbaiki.",
    ],
  },
  {
    version: "4.0",
    date: "2025-11-28",
    changes: [
      "Fitur Add-ons Harga ditambahkan di Pengaturan Harga.",
      "Input login diubah menggunakan Supabase Auth Cookies.",
      "UI Login diperbaiki agar lebih profesional.",
    ],
  },
  {
    version: "1.0",
    date: "2025-11-15",
    changes: [
      "Peluncuran awal sistem.",
      "Integrasi Supabase dan Kalkulasi HPP Dasar (DTF/Manual).",
    ],
  },
];