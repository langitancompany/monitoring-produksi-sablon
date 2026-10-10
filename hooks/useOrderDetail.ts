// app/hooks/useOrderDetail.ts

import { useState, useCallback } from 'react';
import { Order, UserData, KendalaNote } from '@/types';

// Sama persis dengan signature writeLog di useOrders.ts — didefinisikan
// ulang di sini karena writeLog tidak diekspor sebagai type tersendiri.
type WriteLogFn = (params: {
  order: Order;
  category: 'STATUS' | 'FILE' | 'KENDALA' | 'QC' | 'REVISI' | 'SISTEM';
  event: string;
  ket?: string;
  newVal?: string;
  isSystem?: boolean;
  meta?: any;
}) => Promise<void>;

interface UseOrderDetailProps {
  order: Order;
  currentUser: UserData;
  onUpdateOrder: (updatedOrder: Order) => void | Promise<void>; // ── UBAH ── boleh async supaya bisa ditunggu
  onConfirm: (title: string, msg: string, action: () => void) => void;
  writeLog: WriteLogFn; // 🟢 TAMBAHAN — sebelumnya tidak ada, makanya log
                        // KENDALA/QC/REVISI tidak pernah tercatat.
}

export function useOrderDetail({ order, currentUser, onUpdateOrder, onConfirm, writeLog }: UseOrderDetailProps) {
  const [qcNote, setQcNote] = useState(order.finishing_qc.notes || '');
  const [kendalaNote, setKendalaNote] = useState('');
  const [showKendalaForm, setShowKendalaForm] = useState(false);
  const [proofingRevisiNote, setProofingRevisiNote] = useState('');
  const [proofingStepId, setProofingStepId] = useState<string | null>(null);

  // ── TAMBAHAN ── penanda aksi yang sedang diproses, dipakai untuk loading di tombol.
  // Nilai: `step:<stepId>` | 'proofing-revisi' | 'qc-pass' | 'qc-revisi' | null
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const jenisProd = order.jenis_produksi?.toLowerCase() || '';
  const isManual = jenisProd === 'manual' || jenisProd === 'sablon';

  // ─── Step Handlers ────────────────────────────────────────────────────────

  const handleStatusStep = useCallback(async (stepId: string) => {
    if (loadingAction) return;
    const updated = JSON.parse(JSON.stringify(order));
    const steps = (isManual ? updated.steps_manual : updated.steps_dtf) as any[];
    const idx = steps.findIndex((s: any) => s.id === stepId);
    const stepName = idx >= 0 ? steps[idx].name : stepId;
    if (idx >= 0) {
      steps[idx].isCompleted = true;
      steps[idx].uploadedBy = currentUser.name;
      steps[idx].timestamp = new Date().toLocaleString();
      steps[idx].completedAt = new Date().toISOString();
      if (steps[idx].proofing_note) delete steps[idx].proofing_note;
    }
    const allDone = steps.every((s: any) => s.isCompleted);
    if (allDone && updated.status === 'On Process') updated.status = 'Finishing';
    setLoadingAction(`step:${stepId}`);
    try {
      await Promise.all([
        onUpdateOrder(updated),
        writeLog({
          order: updated,
          category: 'STATUS',
          event: 'Step Produksi Selesai',
          ket: `Step "${stepName}" ditandai selesai`,
        }),
      ]);
    } finally {
      setLoadingAction(null);
    }
  }, [order, isManual, currentUser.name, onUpdateOrder, writeLog, loadingAction]);

  const handleSaveProofingRevisi = useCallback(async () => {
    if (!proofingRevisiNote.trim() || !proofingStepId || loadingAction) return;
    const updated = JSON.parse(JSON.stringify(order));
    const steps = (isManual ? updated.steps_manual : updated.steps_dtf) as any[];
    const idx = steps.findIndex((s: any) => s.id === proofingStepId);
    const stepName = idx >= 0 ? steps[idx].name : proofingStepId;
    if (idx >= 0) {
      steps[idx].proofing_note = proofingRevisiNote;
      steps[idx].isCompleted = false;
    }
    setLoadingAction('proofing-revisi');
    try {
      await Promise.all([
        onUpdateOrder(updated),
        writeLog({
          order: updated,
          category: 'REVISI',
          event: 'Revisi Proofing Diminta',
          ket: `Step "${stepName}": ${proofingRevisiNote}`,
        }),
      ]);
      setProofingRevisiNote('');
      setProofingStepId(null);
    } finally {
      setLoadingAction(null);
    }
  }, [order, isManual, proofingRevisiNote, proofingStepId, onUpdateOrder, writeLog, loadingAction]);

  // ─── QC Handlers ─────────────────────────────────────────────────────────

  const handleQC = useCallback(async (pass: boolean) => {
    if (loadingAction) return;
    const updated = JSON.parse(JSON.stringify(order));
    updated.finishing_qc = {
      isPassed: pass,
      notes: pass ? 'Lolos QC' : qcNote,
      checkedBy: currentUser.name,
      timestamp: new Date().toLocaleString(),
      completedAt: pass ? new Date().toISOString() : null,
    };
    if (!pass) updated.status = 'Revisi';
    setLoadingAction(pass ? 'qc-pass' : 'qc-revisi');
    try {
      await Promise.all([
        onUpdateOrder(updated),
        pass
          ? writeLog({
              order: updated,
              category: 'QC',
              event: 'Lolos QC',
              ket: 'Pesanan lolos pemeriksaan kualitas',
              newVal: updated.status,
            })
          : writeLog({
              order: updated,
              category: 'REVISI',
              event: 'QC Gagal — Revisi',
              ket: qcNote,
              newVal: 'Revisi',
            }),
      ]);
    } finally {
      setLoadingAction(null);
    }
  }, [order, qcNote, currentUser.name, onUpdateOrder, writeLog, loadingAction]);

  const handleDeleteQC = useCallback(() => {
    onConfirm('Reset Status QC?', 'Status QC akan dikembalikan ke belum dicek.', () => {
      const updated = JSON.parse(JSON.stringify(order));
      updated.finishing_qc = { isPassed: false, notes: '', checkedBy: '', timestamp: '' };
      onUpdateOrder(updated);
      writeLog({
        order: updated,
        category: 'QC',
        event: 'Reset Status QC',
        ket: 'Status QC dikembalikan ke belum dicek',
      });
    });
  }, [order, onConfirm, onUpdateOrder, writeLog]);

  const handleRevisiSelesai = useCallback(() => {
    onConfirm('Selesaikan Revisi?', 'Status akan kembali ke On Process.', () => {
      const updated = JSON.parse(JSON.stringify(order));
      updated.status = 'On Process';
      updated.finishing_qc.isPassed = false;
      onUpdateOrder(updated);
      writeLog({
        order: updated,
        category: 'REVISI',
        event: 'Revisi Selesai',
        ket: 'Revisi dikonfirmasi selesai, kembali ke On Process',
        newVal: 'On Process',
      });
    });
  }, [order, onConfirm, onUpdateOrder, writeLog]);

  // ─── Kendala Handlers ─────────────────────────────────────────────────────

  const handleAddKendala = useCallback(() => {
    if (!kendalaNote.trim()) return;
    const updated = JSON.parse(JSON.stringify(order));
    if (!updated.kendala) updated.kendala = [];
    updated.kendala.push({
      id: Date.now().toString(),
      notes: kendalaNote,
      reportedBy: currentUser.name,
      timestamp: new Date().toLocaleString(),
      isResolved: false,
    });
    updated.status = 'Ada Kendala';
    onUpdateOrder(updated);
    writeLog({
      order: updated,
      category: 'KENDALA',
      event: 'Lapor Kendala',
      ket: kendalaNote,
      newVal: 'Ada Kendala',
    });
    setKendalaNote('');
    setShowKendalaForm(false);
  }, [order, kendalaNote, currentUser.name, onUpdateOrder, writeLog]);

  const handleResolveKendala = useCallback((kendalaId: string) => {
    const updated = JSON.parse(JSON.stringify(order));
    const idx = updated.kendala.findIndex((k: KendalaNote) => k.id === kendalaId);
    const kendalaText = idx >= 0 ? updated.kendala[idx].notes : '';
    if (idx >= 0) {
      updated.kendala[idx].isResolved = true;
      updated.kendala[idx].resolvedBy = currentUser.name;
      updated.kendala[idx].resolvedTimestamp = new Date().toLocaleString();
    }
    const stillHasKendala = updated.kendala.some((k: any) => !k.isResolved);
    if (!stillHasKendala) {
      const steps = isManual ? updated.steps_manual : updated.steps_dtf;
      const allStepsDone = steps && steps.every((s: any) => s.isCompleted);
      updated.status = allStepsDone ? 'Finishing' : 'On Process';
    }
    onUpdateOrder(updated);
    writeLog({
      order: updated,
      category: 'KENDALA',
      event: 'Kendala Diselesaikan',
      ket: kendalaText,
      newVal: updated.status,
    });
  }, [order, isManual, currentUser.name, onUpdateOrder, writeLog]);

  const handleDeleteKendala = useCallback((kendalaId: string) => {
    onConfirm('Hapus Laporan?', 'Laporan kendala ini akan dihapus permanen.', () => {
      const updated = JSON.parse(JSON.stringify(order));
      const target = updated.kendala.find((k: KendalaNote) => k.id === kendalaId);
      updated.kendala = updated.kendala.filter((k: KendalaNote) => k.id !== kendalaId);
      const allResolved = updated.kendala.length === 0 || updated.kendala.every((k: any) => k.isResolved);
      if (allResolved && updated.status === 'Ada Kendala') {
        const steps = isManual ? updated.steps_manual : updated.steps_dtf;
        const allStepsDone = steps && steps.every((s: any) => s.isCompleted);
        updated.status = allStepsDone ? 'Finishing' : 'On Process';
      }
      onUpdateOrder(updated);
      writeLog({
        order: updated,
        category: 'KENDALA',
        event: 'Laporan Kendala Dihapus',
        ket: target?.notes || '-',
        newVal: updated.status,
      });
    });
  }, [order, isManual, onConfirm, onUpdateOrder, writeLog]);

  // ─── File Delete Handler ──────────────────────────────────────────────────

  const handleFileDelete = useCallback((field: string, isStep = false, stepId?: string) => {
    onConfirm('Hapus File/Bukti?', 'File tidak bisa dikembalikan.', () => {
      const updated = JSON.parse(JSON.stringify(order));
      let label = field;
      if (isStep && stepId) {
        const steps = isManual ? updated.steps_manual : updated.steps_dtf;
        const idx = steps.findIndex((s: any) => s.id === stepId);
        if (idx >= 0) { label = steps[idx].name; steps[idx].isCompleted = false; steps[idx].fileUrl = null; }
      } else if (field === 'approval') {
        updated.link_approval = null;
      } else if (field === 'packing') {
        updated.finishing_packing.isPacked = false;
        updated.finishing_packing.fileUrl = null;
      } else if (field === 'shipping_kirim') {
        updated.shipping.bukti_kirim = null;
      } else if (field === 'shipping_terima') {
        updated.shipping.bukti_terima = null;
      }
      onUpdateOrder(updated);
      writeLog({
        order: updated,
        category: 'FILE',
        event: 'File Dihapus',
        ket: `File "${label}" dihapus`,
      });
    });
  }, [order, isManual, onConfirm, onUpdateOrder, writeLog]);

  return {
    // State
    qcNote, setQcNote,
    kendalaNote, setKendalaNote,
    showKendalaForm, setShowKendalaForm,
    proofingRevisiNote, setProofingRevisiNote,
    proofingStepId, setProofingStepId,
    loadingAction, // ── TAMBAHAN ──
    // Handlers
    handleStatusStep,
    handleSaveProofingRevisi,
    handleQC,
    handleDeleteQC,
    handleRevisiSelesai,
    handleAddKendala,
    handleResolveKendala,
    handleDeleteKendala,
    handleFileDelete,
  };
}