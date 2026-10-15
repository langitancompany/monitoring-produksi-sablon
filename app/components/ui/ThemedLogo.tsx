// app/components/ui/ThemedLogo.tsx
//
// Logo Langitan.co yang otomatis ganti mengikuti tema:
//   - Mode terang → /logo.png
//   - Mode gelap  → /Green Icon.png
//
// Pergantian dilakukan murni lewat CSS (dark:hidden / hidden dark:block),
// bukan lewat JavaScript, jadi tidak ada kedipan logo yang salah saat
// halaman pertama kali dimuat (aman untuk SSR / hydration).

type ThemedLogoProps = {
  /** Kelas ukuran/posisi, mis. "h-8 w-auto object-contain". */
  className?: string;
  /** Teks alternatif. Kosongkan ("") bila logo hanya dekoratif. */
  alt?: string;
};

const LIGHT_SRC = "/logo.png";
// Nama file mengandung spasi, jadi ditulis sebagai %20 agar aman di semua browser.
const DARK_SRC = "/Green%20Icon.png";

export default function ThemedLogo({
  className = "",
  alt = "Logo Langitan.co",
}: ThemedLogoProps) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LIGHT_SRC}
        alt={alt}
        className={`${className} block dark:hidden`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={DARK_SRC}
        alt={alt}
        aria-hidden={alt === "" ? true : undefined}
        className={`${className} hidden dark:block`}
      />
    </>
  );
}
