export const formatRupiah = (value: number): string => {
  if (!value) return "Rp 0";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export const parseRupiah = (value: string): number => {
  return parseInt(value.replace(/[^0-9]/g, ""), 10) || 0;
};

/** "2026-10-10" atau ISO timestamp -> "10 Okt 26". Date-only diparse sebagai tanggal lokal (tanpa geser hari). */
export const formatDateShort = (dateStr?: string | null): string => {
  if (!dateStr) return "-";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? new Date(`${dateStr}T00:00:00`)
    : new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "2-digit" });
};

export const formatDateTime = (iso?: string | null): string => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("id-ID", {
    day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });
};

/** YYYY-MM-DD menurut jam lokal perangkat (bukan UTC). */
export const toYmd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const todayYmd = (): string => toYmd(new Date());

export const monthStartYmd = (): string => {
  const d = new Date();
  return toYmd(new Date(d.getFullYear(), d.getMonth(), 1));
};