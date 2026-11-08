// Kelas Tailwind untuk tab Pengaturan di layar sempit. Kelas ditulis utuh supaya terbaca oleh Tailwind.
// Tabel dan matriks berganti jadi kartu lewat container query (@container), bukan lebar layar:
// sidebar 256px memakan ruang dari `md`, jadi lebar viewport tidak menggambarkan lebar kartu.

/** Tinggi sentuh 44px sampai `lg` (HP dan tablet); kembali ringkas di layar lebar. */
export const tapCls = "min-h-11 lg:min-h-0";

/** Isian: 16px di HP supaya iOS tidak memperbesar halaman saat fokus; tinggi 44px sampai `lg`. */
export const fieldTouchCls = "max-md:text-base max-lg:min-h-11";

/** Tombol ikon: kotak 44px sampai `lg`. Ukuran ringkas di layar lebar diatur pemakainya. */
export const iconBtnCls = "inline-flex items-center justify-center max-lg:size-11";
