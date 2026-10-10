// lib/po/store-info.ts
// Satu sumber identitas toko untuk invoice & resi PO.
// Sebelumnya "Langitan.co" dan alamatnya ditulis manual di banyak file.
// Sekarang: pakai nilai dari Pengaturan PO kalau diisi, kalau kosong
// jatuh ke default di bawah ini (jadi tampilan lama tidak berubah).

import type { POSetting } from "@/types/po";

export const DEFAULT_STORE_NAME = "Langitan.co";
export const DEFAULT_STORE_ADDRESS = "Mandungan, Widang, Tuban, Jawa Timur";

export interface StoreInfo {
  storeName: string;
  storeAddress: string;
}

export function getStoreInfo(
  setting?: Pick<POSetting, "store_name" | "store_address"> | null,
): StoreInfo {
  return {
    storeName: setting?.store_name?.trim() || DEFAULT_STORE_NAME,
    storeAddress: setting?.store_address?.trim() || DEFAULT_STORE_ADDRESS,
  };
}