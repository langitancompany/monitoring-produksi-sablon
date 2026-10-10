"use client";

// Pengganti alert() dan confirm() bawaan browser.
// Memakai komponen CustomAlert yang sudah ada, jadi tampilannya seragam,
// mendukung dark mode, dan rapi di HP.
//
// Pemakaian:
//   const { notify, confirmAsync } = useDialog();
//   notify("Gagal menyimpan: " + error);
//   if (!(await confirmAsync("Hapus produk ini?"))) return;

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import CustomAlert, { type AlertState } from "./CustomAlert";

interface NotifyOptions {
  title?: string;
  type?: "success" | "error";
}

interface ConfirmOptions {
  title?: string;
}

interface DialogApi {
  notify: (message: string, options?: NotifyOptions) => void;
  confirmAsync: (message: string, options?: ConfirmOptions) => Promise<boolean>;
}

const DialogContext = createContext<DialogApi | null>(null);

const CLOSED: AlertState = {
  isOpen: false,
  title: "",
  message: "",
  type: "error",
};

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AlertState>(CLOSED);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(value);
  }, []);

  const notify = useCallback<DialogApi["notify"]>(
    (message, options) => {
      // Kalau ada konfirmasi yang masih terbuka, anggap dibatalkan.
      settle(false);
      const isSuccess =
        options?.type === "success" ||
        (!options?.type &&
          /berhasil/i.test(message) &&
          !/^gagal/i.test(message));
      const type = isSuccess ? "success" : "error";
      const title =
        options?.title ??
        (isSuccess
          ? "Berhasil"
          : /^gagal/i.test(message)
            ? "Gagal"
            : "Perhatian");
      setState({ isOpen: true, title, message, type });
    },
    [settle],
  );

  const confirmAsync = useCallback<DialogApi["confirmAsync"]>(
    (message, options) =>
      new Promise<boolean>((resolve) => {
        settle(false);
        resolverRef.current = resolve;
        setState({
          isOpen: true,
          title: options?.title ?? "Konfirmasi",
          message,
          type: "confirm",
          onConfirm: () => settle(true),
        });
      }),
    [settle],
  );

  const closeAlert = useCallback(() => {
    // CustomAlert memanggil onConfirm lebih dulu (settle(true)) lalu closeAlert;
    // settle kedua tidak berpengaruh. Tombol Batal / X berarti false.
    settle(false);
    setState((s) => ({ ...s, isOpen: false }));
  }, [settle]);

  const api = useMemo(() => ({ notify, confirmAsync }), [notify, confirmAsync]);

  return (
    <DialogContext.Provider value={api}>
      {children}
      <CustomAlert alertState={state} closeAlert={closeAlert} />
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error("useDialog harus dipakai di dalam DialogProvider");
  }
  return ctx;
}
