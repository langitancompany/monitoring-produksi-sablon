// app/components/orders/detail/ProductionNotes.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Loader2, MessageSquare, Send, Trash2 } from "lucide-react";
import { UserData } from "@/types";

interface ProductionNote {
  id: string;
  content: string;
  section: string;
  created_by_id: string;
  created_by_name: string;
  created_at: string;
}

interface ProductionNotesProps {
  orderId: string;
  kodeProduksi: string;
  namaPemesan: string;
  section: "produksi" | "finishing" | "pengiriman";
  currentUser: UserData;
}

export default function ProductionNotes({
  orderId,
  kodeProduksi,
  namaPemesan,
  section,
  currentUser,
}: ProductionNotesProps) {
  const [notes, setNotes] = useState<ProductionNote[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  );

  // ─── Fetch catatan ──────────────────────────────────────────────────────

  const fetchNotes = async () => {
    const { data } = await supabase
      .from("production_notes")
      .select("*")
      .eq("order_id", orderId)
      .eq("section", section)
      .order("created_at", { ascending: true });
    setNotes(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchNotes();
  }, [orderId, section]);

  // ─── Tambah catatan ─────────────────────────────────────────────────────

  const handleSend = async () => {
    if (!input.trim()) return;
    setSending(true);
    await supabase.from("production_notes").insert({
      order_id: orderId,
      kode_produksi: kodeProduksi,
      nama_pemesan: namaPemesan,
      content: input.trim(),
      section,
      created_by_id: currentUser.id,
      created_by_name: currentUser.name,
    });
    setInput("");
    await fetchNotes();
    setSending(false);
  };

  // ─── Hapus catatan ──────────────────────────────────────────────────────

  const handleDelete = async (noteId: string) => {
    await supabase.from("production_notes").delete().eq("id", noteId);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  };

  const canDelete = (note: ProductionNote) =>
    note.created_by_id === currentUser.id || currentUser.role === "super_admin";

  // ─── Format waktu ───────────────────────────────────────────────────────

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
        <span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
          Catatan
        </span>
        {notes.length > 0 && (
          <span className="font-mono tabular-nums text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400">
            {notes.length}
          </span>
        )}
      </div>

      {/* List catatan */}
      {loading ? (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
          <span className="text-xs text-zinc-400">Memuat catatan...</span>
        </div>
      ) : notes.length === 0 ? (
        <p className="text-[11px] text-zinc-300 dark:text-zinc-700 italic mb-3">
          Belum ada catatan
        </p>
      ) : (
        <div className="space-y-2 mb-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="flex items-start gap-2 bg-zinc-50 dark:bg-zinc-900 rounded-md px-3 py-2 border-l-2 border-zinc-200 dark:border-zinc-800"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-700 dark:text-zinc-200 leading-relaxed">
                  {note.content}
                </p>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">
                  {note.created_by_name} · {formatTime(note.created_at)}
                </p>
              </div>
              {canDelete(note) && (
                <button
                  onClick={() => handleDelete(note.id)}
                  className="text-zinc-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 transition-colors duration-150 flex-shrink-0 mt-0.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Input catatan baru */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Tulis catatan..."
          className="flex-1 text-xs px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md outline-none focus:border-[#124540] dark:focus:border-[#124540] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 transition-colors duration-150"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="bg-[#124540] text-white px-3 py-2 rounded-md text-xs font-semibold flex items-center gap-1.5 hover:bg-[#0d332f] disabled:opacity-50 transition-colors duration-150"
        >
          {sending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
