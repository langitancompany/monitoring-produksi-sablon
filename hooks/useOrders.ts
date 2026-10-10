// app/hooks/useOrders.ts
import { useState, useCallback, useMemo } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Order, OrderStatus, UserData } from '@/types';
import { triggerOrderNotifications } from '@/lib/orderLogic';
import { finFetch } from '@/hooks/useFinanceApi';

interface UseOrdersProps {
  supabase: SupabaseClient;
  currentUser: (UserData & { id: string }) | null;
  fetchNotifications: () => Promise<void>;
  showAlert: (title: string, message: string, type?: 'success' | 'error') => void;
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
  setView: (view: 'list' | 'detail' | 'create' | 'edit') => void;
}

// ── TAMBAHAN ── rapikan jenis_aplikasi_art: buang array kosong; semua kosong → null
function cleanArt(v: any) {
  if (!v) return null;
  const out: Record<string, string[]> = {};
  (['depan', 'belakang', 'kanan', 'kiri'] as const).forEach((k) => {
    if (Array.isArray(v[k]) && v[k].length) out[k] = v[k];
  });
  return Object.keys(out).length ? out : null;
}

export function useOrders({
  supabase,
  currentUser,
  fetchNotifications,
  showAlert,
  showConfirm,
  setView,
}: UseOrdersProps) {
  const [orders, setOrders] = useState<Order[]>([]);

  // ── TAMBAHAN ── state loading untuk indikator di tombol
  const [isCreating, setIsCreating] = useState(false);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);

  // ─── Fetch ────────────────────────────────────────────────────────────────

  const fetchOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select(`*, assigned_user:users!assigned_to ( name ), helper_user:users!helper_id ( name )`)
      .order('created_at', { ascending: false });

    if (data) setOrders(data.map((o: any) => ({
      ...o,
      kendala: Array.isArray(o.kendala) ? o.kendala : [],
      bukti_pembayaran: Array.isArray(o.bukti_pembayaran) ? o.bukti_pembayaran : [], // ── TAMBAHAN ──
    })));
  }, [supabase]);

  const activeOrders = useMemo(() => orders.filter(o => !o.deleted_at), [orders]);

  // ─── Generate Kode Produksi ───────────────────────────────────────────────

  const generateProductionCode = useCallback(() => {
    const now = new Date();
    const prefix = `LCO-${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getFullYear()).slice(-2)}-`;
    const existingCodes = orders
      .filter(o => o.kode_produksi?.startsWith(prefix))
      .map(o => parseInt(o.kode_produksi.split('-').pop()!) || 0);
    const max = existingCodes.length > 0 ? Math.max(...existingCodes) : 0;
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
  }, [orders]);

  // ─── Write Log ────────────────────────────────────────────────────────────

  const writeLog = useCallback(async ({
    order,
    category,
    event,
    ket = '-',
    newVal = '',
    isSystem = false,
    meta = {},
  }: {
    order: Order;
    category: 'STATUS' | 'FILE' | 'KENDALA' | 'QC' | 'REVISI' | 'SISTEM';
    event: string;
    ket?: string;
    newVal?: string;
    isSystem?: boolean;
    meta?: any;
  }) => {
    if (!currentUser && !isSystem) return;

    const { error } = await supabase.from('order_logs').insert([{
      order_id: order.id,
      kode_produksi: order.kode_produksi,
      category,
      event_name: event,
      description: ket,
      old_value: order.status,
      new_value: newVal || order.status,
      oleh: isSystem ? 'Sistem' : (currentUser?.name || 'Unknown'),
      metadata: meta,
    }]);

    if (error) console.error('Gagal mencatat log R&D:', error);
  }, [currentUser, supabase]);

  // ─── Check Auto Status ────────────────────────────────────────────────────

  const checkAutoStatus = useCallback(async (orderData: Order) => {
    const oldStatus = orderData.status as OrderStatus;
    const hasUnresolvedKendala = orderData.kendala?.some((k: any) => !k.isResolved);

    const type = orderData.jenis_produksi?.toLowerCase() || '';
    const isManual = type.includes('manual') || type.includes('sablon');
    const steps = (isManual ? orderData.steps_manual : orderData.steps_dtf) as any[];
    const productionDone = Array.isArray(steps) && steps.length > 0 && steps.every((s: any) => s.isCompleted);

    let normalStatus = 'Pesanan Masuk';

    if (!orderData.link_approval?.link) {
      normalStatus = 'Pesanan Masuk';
    } else if (!productionDone) {
      normalStatus = 'On Process';
    } else if (!orderData.finishing_qc?.isPassed || !orderData.finishing_packing?.isPacked) {
      if (orderData.finishing_qc?.isPassed === false && orderData.finishing_qc?.notes) {
        normalStatus = 'Revisi';
      } else {
        normalStatus = 'Finishing';
      }
    } else if (!orderData.shipping?.bukti_terima) {
      normalStatus = 'Kirim';
    } else {
      normalStatus = 'Selesai';
    }

    const finalStatus = (hasUnresolvedKendala ? 'Ada Kendala' : normalStatus) as OrderStatus;

    const payload: any = { ...orderData, status: finalStatus };
    delete payload.assigned_user;
    delete payload.helper_user;
    delete payload.id;
    delete payload.created_at;
    // Kolom harga/pembayaran lama JANGAN ikut ditulis: data di state bisa usang dan akan menimpa
    // angka keuangan yang baru. Keuangan sekarang hanya diubah lewat /api/finance.
    delete payload.harga_per_pcs;
    delete payload.biaya_ukuran_besar;
    delete payload.biaya_lengan_panjang;
    delete payload.total_harga;
    delete payload.dp_masuk;
    delete payload.status_pembayaran;
    delete payload.bukti_pembayaran;

    const { error } = await supabase.from('orders').update(payload).eq('id', orderData.id);

    if (!error) {
      if (oldStatus !== finalStatus) {
        await writeLog({
          order: orderData,
          category: 'STATUS',
          event: 'Perubahan Status Otomatis',
          ket: `Status berubah dari ${oldStatus} menjadi ${finalStatus}`,
          newVal: finalStatus,
          isSystem: true,
        });
      }
      fetchOrders();
      await triggerOrderNotifications({ ...orderData, status: finalStatus }, oldStatus);
      await fetchNotifications();
    } else {
      console.error('DB Error Details:', JSON.stringify(error, null, 2));
      showAlert('Error Database', error.message || error.details || 'Gagal menyimpan data', 'error');
    }
  }, [supabase, fetchOrders, fetchNotifications, showAlert, writeLog]);

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  const handleCreateOrder = useCallback(async (formData: any) => {
    if (isCreating) return; // ── TAMBAHAN ── cegah klik ganda saat sedang menyimpan
    setIsCreating(true);
    try {
    const payload: any = {
      kode_produksi: generateProductionCode(),
      nama_pemesan: formData.nama,
      no_hp: formData.hp,
      alamat_pemesan: formData.alamat_pemesan || null,
      jumlah: formData.jumlah || 0,
      detail_ukuran: formData.detail_ukuran || null,
      detail_gesut: formData.detail_gesut || null, // ── TAMBAHAN ── sebelumnya tidak ikut terkirim ke DB sama sekali
      tanggal_masuk: new Date().toISOString().split('T')[0],
      deadline: formData.deadline,
      jenis_produksi: formData.type,
      assigned_to: formData.assigned_to || null,
      helper_id: formData.helper_id || null,
      // ── TAMBAHAN ── field opsional untuk Form Approval
      ukuran_desain_depan: formData.ukuran_desain_depan?.trim() || null,
      ukuran_desain_belakang: formData.ukuran_desain_belakang?.trim() || null,
      catatan_pesanan: formData.catatan_pesanan?.trim() || null,
      jenis_aplikasi_art: cleanArt(formData.jenis_aplikasi_art),
      jenis_pakaian: formData.jenis_pakaian || 'kaos',
      status: 'Pesanan Masuk',
      steps_manual: [
        { id: 'm1', name: 'Pecah Gambar (PDF)', type: 'upload_pdf', isCompleted: false },
        { id: 'm2', name: 'Print Film', type: 'upload_image', isCompleted: false },
        { id: 'm3', name: 'Proofing', type: 'upload_image', isCompleted: false },
        { id: 'm4', name: 'Produksi Massal', type: 'upload_image', isCompleted: false },
      ],
      steps_dtf: [
        { id: 'd1', name: 'Cetak DTF', type: 'status_update', isCompleted: false },
        { id: 'd2', name: 'Press Kaos', type: 'upload_image', isCompleted: false },
      ],
      finishing_qc: { isPassed: false, notes: '' },
      finishing_packing: { isPacked: false },
      shipping: {},
      kendala: [],
      // Harga & pembayaran tidak lagi ditulis di sini: diterbitkan sebagai tagihan lewat menu Keuangan.
    };

    const { data, error } = await supabase.from('orders').insert([payload]).select().single();
    if (!error) {
      await writeLog({
        order: data,
        category: 'STATUS',
        event: 'Pesanan Masuk',
        ket: 'Pesanan baru dibuat',
        isSystem: true,
      });
      await fetchOrders();
      setView('list');
      showAlert('Sukses', 'Pesanan dibuat');
      triggerOrderNotifications(data);
    } else {
      showAlert('Error', error.message, 'error');
    }
    } finally {
      setIsCreating(false);
    }
  }, [generateProductionCode, supabase, fetchOrders, showAlert, writeLog, setView, isCreating]);

  const handleEditOrder = useCallback(async (d: any, selectedOrderId: string) => {
    const updates = {
      nama_pemesan: d.nama,
      no_hp: d.hp,
      alamat_pemesan: d.alamat_pemesan || null,
      jumlah: d.jumlah || 0,
      detail_ukuran: d.detail_ukuran || null,
      detail_gesut: d.detail_gesut || null, // ── TAMBAHAN ── ini yang bikin update gesut tidak tersimpan
      deadline: d.deadline,
      jenis_produksi: d.type,
      assigned_to: d.assigned_to || null,
      helper_id: d.helper_id || null,
      // ── TAMBAHAN ── field opsional untuk Form Approval
      ukuran_desain_depan: d.ukuran_desain_depan?.trim() || null,
      ukuran_desain_belakang: d.ukuran_desain_belakang?.trim() || null,
      catatan_pesanan: d.catatan_pesanan?.trim() || null,
      jenis_aplikasi_art: cleanArt(d.jenis_aplikasi_art),
      jenis_pakaian: d.jenis_pakaian || 'kaos',
    };
    const { error } = await supabase.from('orders').update(updates).eq('id', selectedOrderId);
    if (!error) {
      const old = orders.find(o => o.id === selectedOrderId);
      if (old) await checkAutoStatus({ ...old, ...updates });
      await fetchOrders();
      setView('detail');
      showAlert('Sukses', 'Diupdate');
    }
  }, [supabase, orders, fetchOrders, showAlert, checkAutoStatus, setView]);

  const handleDeleteOrder = useCallback(async (id: string) => {
    const orderToDelete = orders.find(o => o.id === id);
    showConfirm('Hapus?', 'Pindah ke sampah.', async () => {
      setDeletingOrderId(id); // ── TAMBAHAN ── tombol Hapus menampilkan loading
      try {
        const { error } = await supabase.from('orders').update({ deleted_at: new Date().toISOString() }).eq('id', id);
        if (!error) {
          if (orderToDelete) {
            await writeLog({
              order: orderToDelete,
              category: 'STATUS',
              event: 'Pesanan Dihapus',
              ket: 'Pesanan dipindahkan ke sampah',
              newVal: 'Sampah',
            });
          }
          await fetchOrders();
          setView('list');
          showAlert('Sukses', 'Dihapus');
        } else {
          showAlert('Gagal Hapus', error.message, 'error'); // ── TAMBAHAN ── sebelumnya gagal diam-diam
        }
      } finally {
        setDeletingOrderId(null);
      }
    });
  }, [showConfirm, supabase, fetchOrders, showAlert, orders, writeLog, setView]);

  const handleRestoreOrder = useCallback(async (id: string) => {
    const orderToRestore = orders.find(o => o.id === id);
    const { error } = await supabase.from('orders').update({ deleted_at: null }).eq('id', id);
    if (!error) {
      if (orderToRestore) {
        await writeLog({
          order: orderToRestore,
          category: 'STATUS',
          event: 'Pesanan Dipulihkan',
          ket: 'Pesanan dikembalikan dari sampah',
          newVal: orderToRestore.status,
        });
      }
      fetchOrders();
      showAlert('Sukses', 'Dipulihkan');
    }
  }, [supabase, fetchOrders, showAlert, orders, writeLog]);

  const handlePermanentDelete = useCallback(async (id: string) => {
    // Cek dulu data keuangan order ini: untuk pesan konfirmasi, dan agar user tanpa izin
    // ditolak SEBELUM file/log apa pun dihapus.
    let fin = { invoices: 0, payments: 0, can_purge: true };
    try {
      fin = await finFetch<typeof fin>(`/api/finance/orders/${id}/purge`);
    } catch {
      // Gagal mengecek: lanjut dengan pesan umum; penghapusan tetap dicek ulang di server.
    }
    const hasFin = fin.invoices + fin.payments > 0;

    if (hasFin && !fin.can_purge) {
      showAlert(
        'Tidak Bisa Dihapus',
        'Order ini punya data keuangan. Hanya supervisor atau user dengan izin Keuangan → Void yang boleh menghapusnya permanen.',
        'error',
      );
      return;
    }

    const confirmMsg = hasFin
      ? `Data, semua file lampiran, dan DATA KEUANGAN order ini (${fin.invoices} tagihan, ${fin.payments} pembayaran) akan hilang selamanya. Tindakan ini tidak bisa dibatalkan.`
      : 'Data dan semua file lampiran akan hilang selamanya.';

    showConfirm('Hapus Permanen?', confirmMsg, async () => {
      try {
        // Data keuangan dihapus lebih dulu (server + database). Bila ditolak (mis. periode sudah
        // ditutup), error dilempar dan file/log pesanan belum disentuh.
        await finFetch(`/api/finance/orders/${id}/purge`, { method: 'POST' });

        const { data: orderData } = await supabase
          .from('orders')
          // ── TAMBAHAN ── sertakan bukti_pembayaran supaya file-nya ikut
          // ditemukan & dihapus dari Storage oleh processData() di bawah.
          .select('link_approval, steps_manual, steps_dtf, finishing_packing, shipping, kendala, bukti_pembayaran')
          .eq('id', id)
          .single();

        if (orderData) {
          const BUCKET_NAME = 'production-proofs';
          const filesToDelete: string[] = [];

          const extractPath = (rawPath: string) => {
            if (typeof rawPath !== 'string' || !rawPath.includes(`/${BUCKET_NAME}/`)) return;
            const path = decodeURIComponent(rawPath).split(`/${BUCKET_NAME}/`)[1]?.split('?')[0];
            if (path) filesToDelete.push(path);
          };

          const processData = (obj: any) => {
            if (!obj) return;
            if (typeof obj === 'string') extractPath(obj);
            else if (Array.isArray(obj)) obj.forEach(processData);
            else if (typeof obj === 'object') Object.values(obj).forEach(processData);
          };

          processData(orderData);
          if (filesToDelete.length > 0) {
            await supabase.storage.from(BUCKET_NAME).remove(filesToDelete);
          }
        }

        const { error: logError } = await supabase.from('order_logs').delete().eq('order_id', id);
        if (logError) console.error('Gagal menghapus log:', logError);

        const { error: dbError } = await supabase.from('orders').delete().eq('id', id);
        if (!dbError) {
          await fetchOrders();
          showAlert('Sukses', 'Order dan file terkait telah dihapus selamanya');
        } else {
          throw dbError;
        }
      } catch (err: any) {
        const hasFinance = err?.code === '23503'; // foreign key: order punya tagihan/pembayaran
        showAlert(
          'Gagal Hapus',
          hasFinance
            ? 'Order ini punya catatan keuangan (tagihan/pembayaran) sehingga tidak bisa dihapus permanen. Data keuangan sengaja dipertahankan sebagai arsip.'
            : err.message,
          'error',
        );
      }
    });
  }, [showConfirm, supabase, fetchOrders, showAlert]);

  return {
    orders,
    activeOrders,
    isCreating, // ── TAMBAHAN ──
    deletingOrderId, // ── TAMBAHAN ──
    fetchOrders,
    writeLog,
    checkAutoStatus,
    handleCreateOrder,
    handleEditOrder,
    handleDeleteOrder,
    handleRestoreOrder,
    handlePermanentDelete,
  };
}