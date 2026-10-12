// lib/finance/salaryClient.ts  (aman dipakai di browser)
// Jembatan menu Gaji -> Keuangan: pembulatan rincian per order dan pemanggil API.

export type SalaryKind = 'manual' | 'qc' | 'tetap';

export interface SalaryLine {
  /** null = biaya umum (tanpa order), mis. gaji tetap */
  order_id: string | null;
  /** rupiah bulat, > 0 */
  amount: number;
  label: string;
  role?: string;
}

/** "2026-10" dari tahun dan indeks bulan 0-11 (selectedMonth di menu Gaji berbasis 0). */
export const salaryPeriodKey = (year: number, monthIndex0: number) =>
  `${year}-${String(monthIndex0 + 1).padStart(2, '0')}`;

/**
 * Membulatkan daftar nominal desimal ke rupiah bulat TANPA mengubah jumlahnya:
 * total = pembulatan dari jumlah nominal asli, lalu selisih pembulatan dibagikan ke
 * baris dengan sisa pecahan terbesar (metode "largest remainder").
 * Hasil: sum(amounts) === total, setiap nominal berbeda paling banyak Rp 1 dari aslinya.
 */
export function allocateRounded(exact: number[]): { amounts: number[]; total: number } {
  const safe = exact.map((n) => (Number.isFinite(n) && n > 0 ? n : 0));
  const total = Math.round(safe.reduce((a, b) => a + b, 0));
  const floors = safe.map((n) => Math.floor(n));
  let diff = total - floors.reduce((a, b) => a + b, 0);
  const order = safe
    .map((n, i) => ({ i, frac: n - Math.floor(n) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const amounts = [...floors];
  for (let k = 0; k < order.length && diff > 0; k++, diff--) amounts[order[k].i] += 1;
  return { amounts, total };
}

async function call<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `Permintaan gagal (${res.status})`);
  return json as T;
}

/** Mencatat gaji ke Keuangan (pengeluaran berstatus menunggu persetujuan). Idempoten. */
export const postSalaryToFinance = (a: {
  kind: SalaryKind;
  userId: string;
  period: string;
  total: number;
  lines: SalaryLine[];
}) =>
  call<{ created: number; already: boolean }>('/api/finance/salary/post', {
    kind: a.kind,
    user_id: a.userId,
    period: a.period,
    total: a.total,
    lines: a.lines,
  });

/** Membatalkan (void) pengeluaran gaji yang tercatat. Idempoten: 0 baris bila belum pernah dicatat. */
export const unpostSalaryFromFinance = (a: { kind: SalaryKind; userId: string; period: string }) =>
  call<{ voided: number }>('/api/finance/salary/unpost', {
    kind: a.kind,
    user_id: a.userId,
    period: a.period,
  });
