import { useMemo } from 'react';
import { Order, MERCHANDISE_PRODUCTS } from '@/types';
import { getDeadlineStatus, isMerchandiseOrder, merchandiseProductLabel } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ActionItemType = 'KENDALA' | 'REVISI' | 'TELAT' | 'URGENT';

export type ActionItem = {
  uniqueKey: string;
  order: Order;
  type: ActionItemType;
  detail: string;
  timestamp?: string;
};

export interface DashboardStats {
  totalOrders: number;
  totalPcs: number;
  warning: number;
  overdue: number;
  trouble: number;
  onProcess: number;
  selesai: number;
  monthlyOrders: number; // pesanan masuk bulan aktif
  monthlyPcs: number;    // pcs terproduksi bulan aktif
  // ── TAMBAHAN ── bulan aktif dipisah per kelompok
  kaosMonthlyOrders: number;
  kaosMonthlyPcs: number;
  merchMonthlyOrders: number;
  merchMonthlyPcs: number;
}

export interface MonthlyDataPoint {
  name: string;
  monthIndex: number;
  year: number;
  total: number;
  pcs: number;
  [key: string]: unknown; // pcs per produk (p_<produk>) untuk grafik merchandise bertumpuk
}

export interface ProductionTypeDataPoint {
  name: string;
  value: number;
  [key: string]: unknown; // diperlukan oleh Recharts v3 ChartDataInput
}

/** Satu seri (produk merchandise) pada grafik tren bertumpuk. */
export interface MerchSeries {
  /** value produk di database, mis. 'lanyard' */
  key: string;
  /** kunci di dalam MonthlyDataPoint (diberi prefix agar tidak bentrok) */
  dataKey: string;
  label: string;
}

/** Ringkasan satu kelompok (Kaos / Merchandise). */
export interface CategorySummary {
  orders: number;
  pcs: number;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function formatDateDiff(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface UseDashboardReturn {
  stats: DashboardStats;
  monthlyData: MonthlyDataPoint[];
  productionTypeData: ProductionTypeDataPoint[];
  actionItems: ActionItem[];
  // ── TAMBAHAN ── data dipisah: Kaos (non-merchandise) vs Merchandise
  kaosMonthlyData: MonthlyDataPoint[];
  kaosTypeData: ProductionTypeDataPoint[];
  kaosSummary: CategorySummary;
  merchMonthlyData: MonthlyDataPoint[];
  merchTypeData: ProductionTypeDataPoint[];
  merchSeries: MerchSeries[];
  merchSummary: CategorySummary;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Kunci produk merchandise untuk satu pesanan (fallback 'lainnya'). */
const merchKey = (o: Order) => o.jenis_merchandise || 'lainnya';

/** Tren 6 bulan terakhir. `seriesKey` (opsional) memecah pcs per produk. */
function buildMonthly(
  list: Order[],
  seriesKey?: (o: Order) => string,
): MonthlyDataPoint[] {
  const last6: MonthlyDataPoint[] = [];
  for (let i = 5; i >= 0; i--) {
    // setDate(1) dulu supaya tanggal 31 tidak "melompat" ke bulan berikutnya
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    last6.push({ name: MONTH_NAMES[d.getMonth()], monthIndex: d.getMonth(), year: d.getFullYear(), total: 0, pcs: 0 });
  }
  list.forEach((o) => {
    const d = new Date(o.tanggal_masuk);
    const item = last6.find((m) => m.monthIndex === d.getMonth() && m.year === d.getFullYear());
    if (!item) return;
    item.total += 1;
    item.pcs += o.jumlah;
    if (seriesKey) {
      const k = `p_${seriesKey(o)}`;
      item[k] = ((item[k] as number) || 0) + o.jumlah;
    }
  });
  return last6;
}

export function useDashboard(orders: Order[]): UseDashboardReturn {

  const monthlyData = useMemo<MonthlyDataPoint[]>(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const last6Months: MonthlyDataPoint[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      last6Months.push({
        name: months[d.getMonth()],
        monthIndex: d.getMonth(),
        year: d.getFullYear(),
        total: 0,
        pcs: 0,
      });
    }

    orders.forEach((order) => {
      const d = new Date(order.tanggal_masuk);
      const item = last6Months.find(
        (m) => m.monthIndex === d.getMonth() && m.year === d.getFullYear()
      );
      if (item) {
        item.total += 1;
        item.pcs += order.jumlah;
      }
    });

    return last6Months;
  }, [orders]);

  const productionTypeData = useMemo<ProductionTypeDataPoint[]>(() => {
    const types: Record<string, number> = {};
    orders.forEach((order) => {
      const type = order.jenis_produksi || 'Lainnya';
      types[type] = (types[type] || 0) + 1;
    });
    return Object.keys(types).map((key) => ({
      name: key.toUpperCase(),
      value: types[key],
    }));
  }, [orders]);

  const stats = useMemo<DashboardStats>(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const thisMonthOrders = orders.filter((o) => {
      const d = new Date(o.tanggal_masuk);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const thisMonthKaos = thisMonthOrders.filter((o) => !isMerchandiseOrder(o));
    const thisMonthMerch = thisMonthOrders.filter((o) => isMerchandiseOrder(o));

    return {
      totalOrders: orders.length,
      totalPcs: orders.reduce((acc, curr) => acc + curr.jumlah, 0),
      warning: orders.filter((o) => getDeadlineStatus(o.deadline, o.status) === 'warning').length,
      overdue: orders.filter((o) => getDeadlineStatus(o.deadline, o.status) === 'overdue').length,
      trouble: orders.filter((o) => o.kendala && o.kendala.some((k) => !k.isResolved)).length,
      onProcess: orders.filter((o) => o.status === 'On Process').length,
      selesai: orders.filter((o) => o.status === 'Selesai').length,
      monthlyOrders: thisMonthOrders.length,
      monthlyPcs: thisMonthOrders.reduce((acc, curr) => acc + curr.jumlah, 0),
      kaosMonthlyOrders: thisMonthKaos.length,
      kaosMonthlyPcs: thisMonthKaos.reduce((acc, curr) => acc + curr.jumlah, 0),
      merchMonthlyOrders: thisMonthMerch.length,
      merchMonthlyPcs: thisMonthMerch.reduce((acc, curr) => acc + curr.jumlah, 0),
    };
  }, [orders]);

  const actionItems = useMemo<ActionItem[]>(() => {
    const items: ActionItem[] = [];

    orders.forEach((order) => {
      const deadlineStatus = getDeadlineStatus(order.deadline, order.status);

      const activeKendala = order.kendala ? order.kendala.filter((k) => !k.isResolved) : [];
      if (activeKendala.length > 0) {
        const latest = [...activeKendala].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )[0];
        items.push({
          uniqueKey: `${order.id}-kendala`,
          order,
          type: 'KENDALA',
          detail: latest.notes,
          timestamp: latest.timestamp,
        });
      }

      if (order.status === 'Revisi') {
        items.push({
          uniqueKey: `${order.id}-revisi`,
          order,
          type: 'REVISI',
          detail: order.finishing_qc?.notes || 'Perbaikan QC diperlukan',
        });
      }

      if (deadlineStatus === 'overdue') {
        items.push({
          uniqueKey: `${order.id}-telat`,
          order,
          type: 'TELAT',
          detail: `Telat ${formatDateDiff(order.deadline)} hari`,
        });
      } else if (deadlineStatus === 'warning') {
        items.push({
          uniqueKey: `${order.id}-urgent`,
          order,
          type: 'URGENT',
          detail: 'Deadline < 2 hari',
        });
      }
    });

    const priority: Record<ActionItemType, number> = { KENDALA: 4, REVISI: 3, TELAT: 2, URGENT: 1 };
    return items.sort((a, b) => priority[b.type] - priority[a.type]);
  }, [orders]);

  // ── Pemisahan Kaos vs Merchandise ─────────────────────────────────────────
  const kaosOrders = useMemo(() => orders.filter((o) => !isMerchandiseOrder(o)), [orders]);
  const merchOrders = useMemo(() => orders.filter((o) => isMerchandiseOrder(o)), [orders]);

  const kaosMonthlyData = useMemo(() => buildMonthly(kaosOrders), [kaosOrders]);

  const kaosTypeData = useMemo<ProductionTypeDataPoint[]>(() => {
    const types: Record<string, number> = {};
    kaosOrders.forEach((o) => {
      const t = o.jenis_produksi || 'Lainnya';
      types[t] = (types[t] || 0) + 1;
    });
    return Object.keys(types).map((k) => ({ name: k.toUpperCase(), value: types[k] }));
  }, [kaosOrders]);

  const kaosSummary = useMemo<CategorySummary>(
    () => ({ orders: kaosOrders.length, pcs: kaosOrders.reduce((a, o) => a + o.jumlah, 0) }),
    [kaosOrders],
  );

  // Produk merchandise yang ada pesanannya, urut sesuai MERCHANDISE_PRODUCTS
  const merchSeries = useMemo<MerchSeries[]>(() => {
    const present = new Set<string>(merchOrders.map(merchKey));
    const known: string[] = MERCHANDISE_PRODUCTS.filter((p) => present.has(p.value)).map((p) => p.value);
    const unknown: string[] = Array.from(present).filter((k) => !known.includes(k));
    return [...known, ...unknown].map((key) => ({
      key,
      dataKey: `p_${key}`,
      label: key === 'lainnya' ? 'Lainnya' : merchandiseProductLabel(key),
    }));
  }, [merchOrders]);

  const merchMonthlyData = useMemo(() => buildMonthly(merchOrders, merchKey), [merchOrders]);

  const merchTypeData = useMemo<ProductionTypeDataPoint[]>(() => {
    const counts: Record<string, number> = {};
    merchOrders.forEach((o) => {
      const k = merchKey(o);
      counts[k] = (counts[k] || 0) + 1;
    });
    // urutan sama dengan merchSeries supaya warna konsisten di bar & pie
    return merchSeries.map((s) => ({ name: s.label.toUpperCase(), value: counts[s.key] || 0 }));
  }, [merchOrders, merchSeries]);

  const merchSummary = useMemo<CategorySummary>(
    () => ({ orders: merchOrders.length, pcs: merchOrders.reduce((a, o) => a + o.jumlah, 0) }),
    [merchOrders],
  );

  return {
    stats, monthlyData, productionTypeData, actionItems,
    kaosMonthlyData, kaosTypeData, kaosSummary,
    merchMonthlyData, merchTypeData, merchSeries, merchSummary,
  };
}