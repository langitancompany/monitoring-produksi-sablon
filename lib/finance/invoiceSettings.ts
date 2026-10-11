// lib/finance/invoiceSettings.ts
// Pengaturan tampilan invoice customer (header, rekening, TTD).
// Dipakai server (validasi sebelum simpan) dan browser (form + dokumen invoice).
// Disimpan sebagai SATU baris di tabel `finance_settings` dengan key "invoice_settings";
// gambar disimpan sebagai data URL kecil (sudah dikecilkan di browser sebelum dikirim).

export const INVOICE_SETTINGS_KEY = 'invoice_settings';

export interface InvoiceBankAccount {
  bank: string;
  number: string;
  holder: string;
}

export interface InvoiceSettings {
  store_name: string;
  store_address: string;
  /** Data URL gambar kop. null = pakai kop bawaan (/header-nota.png). */
  header_image: string | null;
  accounts: InvoiceBankAccount[];
  payment_note: string;
  show_signature: boolean;
  /** Data URL gambar tanda tangan (disarankan PNG transparan). */
  signature_image: string | null;
  signature_name: string;
  signature_title: string;
  updated_by?: string | null;
  updated_at?: string | null;
}

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  store_name: 'Langitan.co',
  store_address: 'Mandungan, Widang, Tuban, Jawa Timur',
  header_image: null,
  accounts: [],
  payment_note: 'Transfer sebesar sisa tagihan, lalu kirim bukti pembayaran.',
  show_signature: false,
  signature_image: null,
  signature_name: '',
  signature_title: '',
  updated_by: null,
  updated_at: null,
};

/** Ukuran gambar yang direkomendasikan, dipakai di form dan petunjuk. */
export const HEADER_SPEC = { widthMm: 192, heightMm: 22, pxW: 2268, pxH: 260 } as const;
export const SIGNATURE_SPEC = { widthMm: 40, heightMm: 18, pxW: 480, pxH: 216 } as const;

export const MAX_ACCOUNTS = 4;
// Batas panjang data URL (karakter). ~1,4 jt karakter ≈ 1 MB gambar; TTD lebih kecil.
export const MAX_HEADER_DATAURL = 1_400_000;
export const MAX_SIGNATURE_DATAURL = 600_000;

const DATA_URL_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

const str = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/\s+$/g, '').slice(0, max) : '';

function img(v: unknown, max: number): string | null | 'invalid' {
  if (v == null || v === '') return null;
  if (typeof v !== 'string' || v.length > max || !DATA_URL_RE.test(v)) return 'invalid';
  return v;
}

export type SanitizeResult =
  | { ok: true; value: InvoiceSettings }
  | { ok: false; error: string };

/** Validasi ketat masukan dari browser (dipakai server). Tidak mempercayai bentuk data apa pun. */
export function sanitizeInvoiceSettings(raw: unknown): SanitizeResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Data pengaturan tidak valid' };
  const r = raw as Record<string, unknown>;

  const header = img(r.header_image, MAX_HEADER_DATAURL);
  if (header === 'invalid') return { ok: false, error: 'Gambar header tidak valid atau terlalu besar (maks ±1 MB, PNG/JPG/WebP)' };
  const sign = img(r.signature_image, MAX_SIGNATURE_DATAURL);
  if (sign === 'invalid') return { ok: false, error: 'Gambar tanda tangan tidak valid atau terlalu besar (maks ±450 KB, PNG/JPG/WebP)' };

  const accounts: InvoiceBankAccount[] = [];
  if (r.accounts != null) {
    if (!Array.isArray(r.accounts)) return { ok: false, error: 'Daftar rekening tidak valid' };
    for (const a of r.accounts.slice(0, MAX_ACCOUNTS)) {
      const o = (a ?? {}) as Record<string, unknown>;
      const bank = str(o.bank, 60).trim();
      const number = str(o.number, 40).trim();
      const holder = str(o.holder, 120).trim();
      if (!bank && !number && !holder) continue; // baris kosong diabaikan
      if (!bank || !number) return { ok: false, error: 'Setiap rekening wajib diisi nama bank dan nomor rekening' };
      accounts.push({ bank, number, holder });
    }
  }

  return {
    ok: true,
    value: {
      store_name: str(r.store_name, 120).trim() || DEFAULT_INVOICE_SETTINGS.store_name,
      store_address: str(r.store_address, 250).trim(),
      header_image: header,
      accounts,
      payment_note: str(r.payment_note, 300).trim(),
      show_signature: r.show_signature === true,
      signature_image: sign,
      signature_name: str(r.signature_name, 100).trim(),
      signature_title: str(r.signature_title, 100).trim(),
    },
  };
}

/** Bacaan longgar dari database -> selalu menghasilkan objek lengkap (nilai rusak jatuh ke default). */
export function readInvoiceSettings(raw: unknown): InvoiceSettings {
  const res = sanitizeInvoiceSettings(raw);
  const base = res.ok ? res.value : { ...DEFAULT_INVOICE_SETTINGS };
  const meta = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    ...base,
    updated_by: typeof meta.updated_by === 'string' ? meta.updated_by : null,
    updated_at: typeof meta.updated_at === 'string' ? meta.updated_at : null,
  };
}

/** Teks rekening untuk pesan WhatsApp. */
export function formatAccountsText(accounts: InvoiceBankAccount[]): string {
  return accounts
    .map((a) => `${a.bank} ${a.number}${a.holder ? ` a.n. ${a.holder}` : ''}`)
    .join('\n');
}