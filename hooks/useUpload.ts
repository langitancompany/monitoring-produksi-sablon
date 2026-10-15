// hooks/useUpload.ts
import { useState, useRef, useCallback } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { getDocumentLabel, generateStorageFilename, getOrderSteps } from '@/lib/utils';
import imageCompression from 'browser-image-compression';
import { Order, UserData } from '@/types';

interface UploadContextState {
  type: string;
  stepId?: string;
  kendalaId?: string;
  // ── TAMBAHAN ── label bebas untuk konteks upload yang butuh sub-kategori,
  // dipakai untuk bukti_pembayaran ("DP" | "Lunas"). Generic string supaya
  // tidak perlu ubah signature tiap kali ada konteks baru yang butuh label.
  label?: string;
}

interface UseUploadProps {
  supabase: SupabaseClient;
  currentUser: (UserData & { id: string }) | null;
  orders: Order[];
  selectedOrderId: string | null;
  checkAutoStatus: (order: Order) => Promise<void>;
  writeLog: (params: {
    order: Order;
    category: 'STATUS' | 'FILE' | 'KENDALA' | 'QC' | 'REVISI' | 'SISTEM';
    event: string;
    ket?: string;
    newVal?: string;
    isSystem?: boolean;
    meta?: any;
  }) => Promise<void>;
  showAlert: (title: string, message: string, type?: 'success' | 'error') => void;
}

export function useUpload({
  supabase,
  currentUser,
  orders,
  selectedOrderId,
  checkAutoStatus,
  writeLog,
  showAlert,
}: UseUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadContext, setUploadContext] = useState<UploadContextState | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // ── UBAH ── tambah parameter opsional `label` di posisi ke-4.
  // Dipanggil dari StepPembayaran.tsx sebagai:
  //   onTriggerUpload('bukti_pembayaran', undefined, undefined, 'DP')
  // Semua pemanggilan lama (packing, shipping_kirim, dst) tetap jalan apa
  // adanya karena parameter ini opsional dan diletakkan di paling akhir.
  const triggerUpload = useCallback((targetType: string, stepId?: string, kendalaId?: string, label?: string) => {
    setUploadContext({ type: targetType, stepId, kendalaId, label });
    setTimeout(() => {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
        fileInputRef.current.click();
      }
    }, 50);
  }, []);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (!file || !selectedOrderId || !uploadContext) return;

  // 🟢 Ambil data order dulu — dibutuhkan untuk penamaan file
  const order = orders.find((o: Order) => o.id === selectedOrderId);
  if (!order) return;

  // ── UBAH ── Approval = upload MOCKUP (gambar). Form approval dibentuk
  // otomatis dari gambar ini, jadi PDF tidak diterima.
  const isApproval = uploadContext.type === 'approval';
  if (isApproval && !file.type.startsWith('image/')) {
    showAlert('Format Tidak Didukung', 'Mockup harus berupa gambar (JPG/PNG).', 'error');
    if (fileInputRef.current) fileInputRef.current.value = '';
    return;
  }

  setIsUploading(true);
  let processedFile = file;

  if (file.type.startsWith('image/')) {
    try {
      // Mockup memuat size chart bertulisan kecil → resolusi lebih tinggi.
      processedFile = await imageCompression(file, {
        maxSizeMB: isApproval ? 2 : 1,
        maxWidthOrHeight: isApproval ? 2560 : 1920,
        useWebWorker: true,
      });
    } catch (error) {
      console.error('Kompresi gagal, pakai asli', error);
    }
  } else if (file.type === 'application/pdf') {
    const MAX_MB = 15;
    if (file.size > MAX_MB * 1024 * 1024) {
      alert(`File PDF terlalu besar (> ${MAX_MB}MB). Harap kecilkan ukuran file.`);
      setIsUploading(false);
      return;
    }
  }

  // 🟢 Cari nama step (kalau type === 'step') untuk label dokumen
  let stepName: string | undefined;
  if (uploadContext.type === 'step' && uploadContext.stepId) {
    const step = getOrderSteps(order).find((s: any) => s.id === uploadContext.stepId);
    stepName = (step as any)?.name;
  }

  // 🟢 Susun nama file terstruktur: YYYY-MM-DD_KodeProduksi_JenisDokumen.ext
  // ── UBAH ── untuk bukti_pembayaran, sisipkan label (DP/Lunas) + timestamp
  // ke docLabel supaya nama file unik per upload (tidak upsert/overwrite
  // seperti field single-file lain, karena ini harus terkumpul di array).
  const docLabel = uploadContext.type === 'bukti_pembayaran'
    ? `bukti-pembayaran-${(uploadContext.label || 'DP').toLowerCase()}-${Date.now()}`
    : getDocumentLabel(uploadContext.type, stepName);
  const ext = processedFile.name.split('.').pop();
  const baseFilename = generateStorageFilename(docLabel, order.kode_produksi);
  const fileName = `${selectedOrderId}/${baseFilename}.${ext}`;

  // ── UBAH ── upsert:false khusus bukti_pembayaran, karena nama filenya
  // sudah unik (ada timestamp) — tidak ada skenario "replace file lama".
  const { error: uploadError } = await supabase.storage
    .from('production-proofs')
    .upload(fileName, processedFile, { upsert: uploadContext.type !== 'bukti_pembayaran' });

  if (uploadError) {
    showAlert('Gagal Upload', uploadError.message, 'error');
    setIsUploading(false);
    return;
  }

  const { data: urlData } = supabase.storage.from('production-proofs').getPublicUrl(fileName);

  await writeLog({
    order,
    category: 'FILE',
    event: `Upload File ${uploadContext.type}`,
    ket: `Nama File: ${baseFilename}.${ext}`,
    meta: { url: urlData.publicUrl, context: uploadContext },
  });

    const updatedOrder = JSON.parse(JSON.stringify(order));
    const common = {
      fileUrl: urlData.publicUrl,
      timestamp: new Date().toLocaleString(),
      uploadedBy: currentUser?.name,
    };

    if (uploadContext.type === 'approval') {
      updatedOrder.link_approval = {
        link: urlData.publicUrl,
        by: currentUser?.name,
        timestamp: common.timestamp,
      };
    } else if (uploadContext.type === 'step' && uploadContext.stepId) {
      const steps = getOrderSteps(updatedOrder) as any[];
      const idx = steps.findIndex((s: any) => s.id === uploadContext.stepId);

      if (idx >= 0) {
        const isProofing = steps[idx].name.toLowerCase().includes('proofing');
        steps[idx] = {
          ...steps[idx],
          fileUrl: urlData.publicUrl,
          timestamp: common.timestamp,
          uploadedBy: currentUser?.name,
          isCompleted: !isProofing,
          completedAt: isProofing ? null : new Date().toISOString(),
          proofing_note: isProofing ? undefined : steps[idx].proofing_note,
        };
      }
    } else if (uploadContext.type === 'packing') {
      updatedOrder.finishing_packing = { isPacked: true, ...common, completedAt: new Date().toISOString() };
    } else if (uploadContext.type === 'shipping_kirim') {
      updatedOrder.shipping.bukti_kirim = urlData.publicUrl;
    } else if (uploadContext.type === 'shipping_terima') {
      updatedOrder.shipping.bukti_terima = urlData.publicUrl;
    } else if (uploadContext.type === 'kendala_bukti' && uploadContext.kendalaId) {
      const idx = updatedOrder.kendala.findIndex((k: any) => k.id === uploadContext.kendalaId);
      if (idx >= 0) updatedOrder.kendala[idx].buktiFile = urlData.publicUrl;
    } else if (uploadContext.type === 'bukti_pembayaran') {
      // ── TAMBAHAN ── push entry baru ke array, TIDAK overwrite yang lama.
      if (!Array.isArray(updatedOrder.bukti_pembayaran)) updatedOrder.bukti_pembayaran = [];
      updatedOrder.bukti_pembayaran.push({
        id: `bp_${Date.now()}`,
        url: urlData.publicUrl,
        label: uploadContext.label || 'DP',
        uploadedBy: currentUser?.name,
        timestamp: common.timestamp,
      });
    }

    await checkAutoStatus(updatedOrder);

    setIsUploading(false);
    setUploadContext(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    showAlert('Sukses', 'File terupload');
  }, [selectedOrderId, uploadContext, supabase, orders, currentUser, writeLog, checkAutoStatus, showAlert]);

  return {
    fileInputRef,
    isUploading,
    triggerUpload,
    handleFileChange,
  };
}