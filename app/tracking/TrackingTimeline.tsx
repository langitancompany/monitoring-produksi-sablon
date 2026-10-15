// app/tracking/TrackingTimeline.tsx
'use client';

import React from 'react';
import { orderTypeLabel } from '@/lib/utils';

interface TrackingTimelineProps {
  result: any;
}

const fmt = (d: string) => {
  if (!d) return null;
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

// ─── Dot ─────────────────────────────────────────────────────────────────────

function Dot({ state }: { state: 'done' | 'active' | 'pending' }) {
  const base = 'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border';
  if (state === 'done') return (
    <div className={`${base} bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800`}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M2.5 7l3 3 6-6" stroke="#059669" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
  if (state === 'active') return (
    <div className={`${base} bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700`}>
      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 dark:bg-blue-400 animate-pulse" />
    </div>
  );
  return (
    <div className={`${base} bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700`}>
      <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
    </div>
  );
}

// ─── Connector ───────────────────────────────────────────────────────────────

function Line({ done }: { done: boolean }) {
  return (
    <div className={`w-px mx-auto flex-1 min-h-[20px] my-1 ${done ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-slate-200 dark:bg-slate-700'}`} />
  );
}

// ─── File link ────────────────────────────────────────────────────────────────

function FileLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 px-2.5 py-1.5 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/40 transition w-fit"
    >
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
        <path d="M2 1.5h5l3 3v6H2v-9z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
        <path d="M7 1.5V4.5h3" stroke="currentColor" strokeWidth="1.2"/>
      </svg>
      {label}
    </a>
  );
}

// ─── Timeline Item ────────────────────────────────────────────────────────────

interface TimelineItemProps {
  state: 'done' | 'active' | 'pending';
  title: string;
  date?: string | null;
  isLast?: boolean;
  children?: React.ReactNode;
}

function TimelineItem({ state, title, date, isLast, children }: TimelineItemProps) {
  return (
    <div className="flex gap-3">
      {/* Dot + line */}
      <div className="flex flex-col items-center w-7 flex-shrink-0">
        <Dot state={state} />
        {!isLast && <Line done={state === 'done'} />}
      </div>

      {/* Konten */}
      <div className={`flex-1 ${!isLast ? 'pb-5' : 'pb-1'}`}>
        <p className={`text-sm font-medium leading-tight ${
          state === 'pending' ? 'text-slate-400 dark:text-slate-600' : 'text-slate-800 dark:text-slate-100'
        }`}>
          {title}
        </p>

        {date && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{date}</p>
        )}

        {/* Badge "sedang diproses" */}
        {state === 'active' && (
          <span className="inline-flex items-center gap-1.5 mt-2 text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 px-2.5 py-1 rounded-md">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            Sedang diproses
          </span>
        )}

        {/* File links — selalu di bawah badge, dalam block flex-col */}
        {children && (
          <div className="flex flex-col gap-1.5 mt-2">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    'Pesanan Masuk': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    'On Process':    'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    'Finishing':     'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-violet-200 dark:border-violet-800',
    'Revisi':        'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800',
    'Ada Kendala':   'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800',
    'Kirim':         'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    'Selesai':       'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  };
  return (
    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-wide ${map[status] || map['Pesanan Masuk']}`}>
      {status}
    </span>
  );
}

// ─── Komponen Utama ───────────────────────────────────────────────────────────

export default function TrackingTimeline({ result }: TrackingTimelineProps) {
  const jenis = result.jenis_produksi?.toLowerCase() || '';
  const isMerchandise = jenis === 'merchandise'; // merchandise: tanpa tahap packing
  // Pelanggan melihat nama produknya (mis. "Lanyard"), bukan kata "merchandise".
  const jenisLabel = isMerchandise ? orderTypeLabel(result) : result.jenis_produksi;
  const isManual = jenis.includes('manual') || jenis.includes('sablon');
  const steps: any[] = isMerchandise
    ? (result.steps_merchandise || [])
    : isManual ? (result.steps_manual || []) : (result.steps_dtf || []);

  const hasApproval  = !!result.link_approval?.link;
  const prodDone     = steps.length > 0 && steps.every((s: any) => s.isCompleted);
  const qcDone       = result.finishing_qc?.isPassed && (isMerchandise || result.finishing_packing?.isPacked);
  const shipped      = !!result.shipping?.bukti_kirim;
  const received     = !!result.shipping?.bukti_terima;
  const isSelesai    = result.status === 'Selesai';

  // Semua step yang punya file
  const stepsWithFile = steps.filter((s: any) => s.fileUrl);

  const approvalState: 'done' | 'active' | 'pending' = hasApproval ? 'done' : 'active';
  const prodState: 'done' | 'active' | 'pending'     = prodDone ? 'done' : hasApproval ? 'active' : 'pending';
  const qcState: 'done' | 'active' | 'pending'       = qcDone ? 'done' : prodDone ? 'active' : 'pending';
  const shipState: 'done' | 'active' | 'pending'     = shipped ? 'done' : qcDone ? 'active' : 'pending';
  const doneState: 'done' | 'active' | 'pending'     = isSelesai ? 'done' : shipped ? 'active' : 'pending';

  return (
    <div>
      {/* Info pesanan */}
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-white leading-tight">{result.nama_pemesan}</p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 font-mono">#{result.kode_produksi}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {result.jumlah} pcs · {jenisLabel}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <StatusBadge status={result.status} />
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Deadline: <span className="font-medium text-slate-600 dark:text-slate-300">{fmt(result.deadline)}</span>
          </p>
        </div>
      </div>

      {/* Timeline */}
      <div className="px-5 pt-5 pb-4">
        <p className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 font-medium mb-4">
          Progres produksi
        </p>

        {/* Step 1: Pesanan masuk */}
        <TimelineItem state="done" title="Pesanan diterima" date={fmt(result.tanggal_masuk)} />

        {/* Step 2: Approval */}
        <TimelineItem state={approvalState} title="Approval desain" date={hasApproval ? fmt(result.link_approval?.timestamp) : null}>
          {hasApproval && result.link_approval?.link && (
            <FileLink href={result.link_approval.link} label="Lihat file desain" />
          )}
        </TimelineItem>

        {/* Step 3: Produksi */}
        <TimelineItem state={prodState} title={`Produksi (${jenisLabel})`} date={prodDone ? 'Selesai' : null}>
          {stepsWithFile.map((s: any) => (
            <FileLink key={s.id} href={s.fileUrl} label={s.name} />
          ))}
        </TimelineItem>

        {/* Step 4: QC & Packing */}
        <TimelineItem state={qcState} title={isMerchandise ? 'Quality control' : 'Quality control & packing'} date={qcDone ? fmt(result.finishing_qc?.timestamp) : null}>
          {result.finishing_packing?.fileUrl && (
            <FileLink href={result.finishing_packing.fileUrl} label="Lihat foto packing" />
          )}
        </TimelineItem>

        {/* Step 5: Pengiriman */}
        <TimelineItem state={shipState} title="Pengiriman" date={shipped ? fmt(result.shipping?.timestamp_kirim) : null}>
          {result.shipping?.bukti_kirim && (
            <FileLink href={result.shipping.bukti_kirim} label="Lihat resi pengiriman" />
          )}
        </TimelineItem>

        {/* Step 6: Selesai */}
        <TimelineItem state={doneState} title="Pesanan selesai" date={received ? fmt(result.shipping?.timestamp_terima) : null} isLast>
          {result.shipping?.bukti_terima && (
            <FileLink href={result.shipping.bukti_terima} label="Lihat bukti terima" />
          )}
        </TimelineItem>
      </div>

      {/* Banner selesai */}
      {isSelesai && (
        <div className="mx-5 mb-5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8l3.5 3.5 7-7" stroke="#059669" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Pesanan telah selesai</p>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-500 mt-0.5">Terima kasih telah mempercayai Langitan.co</p>
          </div>
        </div>
      )}
    </div>
  );
}