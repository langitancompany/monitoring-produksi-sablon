// app/components/ui/ProfileModal.tsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { UserData } from "@/types";
import {
  X,
  Save,
  Camera,
  Loader2,
  Trash2,
  Check,
  ZoomIn,
  Image as ImageIcon,
  ChevronRight,
} from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import imageCompression from "browser-image-compression";
import Cropper from "react-easy-crop";
import { Point, Area } from "react-easy-crop";

import { roleLabel } from "@/lib/roles";
interface Props {
  user: UserData;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
}

// --- UTILITY: Fungsi Crop ---
const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<File> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2d context");
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  );
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(new File([blob!], "cropped-profile.jpg", { type: "image/jpeg" }));
    }, "image/jpeg");
  });
}

export default function ProfileModal({ user, isOpen, onClose, onSave }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPhotoMenu, setShowPhotoMenu] = useState(false); // State untuk menu pilihan

  const [formData, setFormData] = useState({
    name: "",
    address: "",
    dob: "",
    role: "",
    no_wa: "",
    avatar_url: "" as string | null,
  });
  const [waError, setWaError] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  useEffect(() => {
    if (isOpen && user) {
      setFormData({
        name: user.name || "",
        address: user.address || "",
        dob: user.dob || "",
        role: user.role || "",
        no_wa: user.no_wa || "",
        avatar_url: user.avatar_url || null,
      });
      setWaError(null);
      setShowDeleteConfirm(false);
      setShowPhotoMenu(false);
    }
  }, [isOpen, user]);

  // Handle klik di luar menu untuk menutup menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowPhotoMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        setImageSrc(reader.result?.toString() || "");
        setIsCropping(true);
        setShowPhotoMenu(false);
      });
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const onCropComplete = useCallback(
    (croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    [],
  );

  const handleCropAndUpload = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setIsUploading(true);
    try {
      const croppedFile = await getCroppedImg(imageSrc, croppedAreaPixels);
      const compressedFile = await imageCompression(croppedFile, {
        maxSizeMB: 0.2,
        maxWidthOrHeight: 500,
        useWebWorker: true,
      });
      const fileName = `${user.id}-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("production-proofs")
        .upload(`avatars/${fileName}`, compressedFile);
      if (uploadError) throw uploadError;
      const {
        data: { publicUrl },
      } = supabase.storage
        .from("production-proofs")
        .getPublicUrl(`avatars/${fileName}`);
      setFormData((prev) => ({ ...prev, avatar_url: publicUrl }));
      setIsCropping(false);
      setImageSrc(null);
    } catch (error) {
      alert("Gagal memproses gambar");
    } finally {
      setIsUploading(false);
    }
  };

  const confirmDelete = () => {
    setFormData((prev) => ({ ...prev, avatar_url: null }));
    setShowDeleteConfirm(false);
    setShowPhotoMenu(false);
  };

  const handleSaveWrapper = () => {
    const noWa = formData.no_wa.trim();
    // Boleh dikosongkan. Bila diisi, harus 9–15 digit (08xx / 62xx / +62xx).
    if (noWa) {
      const digits = noWa.replace(/\D/g, "");
      if (digits.length < 9 || digits.length > 15) {
        setWaError("Nomor WhatsApp tidak valid. Contoh: 081234567890");
        return;
      }
    }
    setWaError(null);
    onSave({
      ...formData,
      dob: formData.dob === "" ? null : formData.dob,
      no_wa: noWa || null,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white dark:bg-zinc-950 rounded-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90dvh] relative border border-zinc-200 dark:border-zinc-800">
        {/* === POP UP KONFIRMASI HAPUS (Gaya CustomAlert) === */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 z-[70] bg-white/90 dark:bg-zinc-950/90 flex items-center justify-center p-6">
            <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 w-full max-w-sm text-center">
              <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600 dark:text-red-400">
                <Trash2 className="w-6 h-6" />
              </div>
              <h4 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight mb-2">
                Hapus Foto?
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-8 leading-relaxed">
                Foto profil Anda akan dihapus. Klik simpan untuk menerapkan
                secara permanen.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-3 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-semibold text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150"
                >
                  Batal
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 py-3 rounded-md bg-red-600 text-white font-semibold text-sm hover:bg-red-700 transition-colors duration-150"
                >
                  Ya, Hapus
                </button>
              </div>
            </div>
          </div>
        )}

        {/* HEADER */}
        <div className="flex justify-between items-center p-4 sm:p-6 border-b border-zinc-200 dark:border-zinc-800">
          <h3 className="font-semibold text-base text-zinc-900 dark:text-zinc-100 tracking-tight">
            {isCropping ? "Sesuaikan Foto" : "Edit Profil"}
          </h3>
          {!isCropping && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md text-zinc-400 transition-colors duration-150"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* CONTENT */}
        <div className="overflow-y-auto p-4 sm:p-6 no-scrollbar">
          {isCropping ? (
            /* --- MODE CROP --- */
            <div className="flex flex-col h-full">
              <div className="relative w-full h-64 bg-zinc-900 rounded-xl overflow-hidden mb-4 border border-zinc-200 dark:border-zinc-700">
                <Cropper
                  image={imageSrc!}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                  cropShape="round"
                  showGrid={false}
                />
              </div>
              <div className="flex items-center gap-2 mb-6">
                <ZoomIn className="w-4 h-4 text-zinc-400" />
                <input
                  type="range"
                  value={zoom}
                  min={1}
                  max={3}
                  step={0.1}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-md appearance-none cursor-pointer accent-[#124540]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    setIsCropping(false);
                    setImageSrc(null);
                  }}
                  className="py-4 rounded-md border border-zinc-200 dark:border-zinc-800 font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150"
                >
                  Batal
                </button>
                <button
                  onClick={handleCropAndUpload}
                  disabled={isUploading}
                  className="py-4 rounded-md bg-[#124540] text-white font-semibold hover:bg-[#0d332f] transition-colors duration-150 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}{" "}
                  Simpan Foto
                </button>
              </div>
            </div>
          ) : (
            /* --- MODE EDIT FORM --- */
            <>
              <div className="flex flex-col items-center mb-6 sm:mb-8 pt-1 sm:pt-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileChange}
                />

                <div className="relative w-28 h-28 sm:w-32 sm:h-32">
                  <div className="w-full h-full rounded-full bg-zinc-100 dark:bg-zinc-800 border-[5px] border-white dark:border-zinc-950 flex items-center justify-center overflow-hidden relative z-10">
                    {formData.avatar_url ? (
                      <img
                        src={formData.avatar_url}
                        alt="Profile"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-5xl font-semibold text-zinc-300 dark:text-zinc-700 uppercase">
                        {formData.name.charAt(0)}
                      </span>
                    )}
                  </div>

                  {/* TOMBOL KAMERA SEKARANG SEBAGAI MENU TOGGLE */}
                  <div
                    className="absolute -bottom-1 -right-1 z-20"
                    ref={menuRef}
                  >
                    <button
                      onClick={() => setShowPhotoMenu(!showPhotoMenu)}
                      className="p-3 bg-[#124540] text-white rounded-full hover:bg-[#0d332f] border-[3px] border-white dark:border-zinc-950 transition-colors duration-150"
                      title="Opsi Foto"
                    >
                      <Camera className="w-5 h-5" />
                    </button>

                    {/* MENU PILIHAN (POP-UP KECIL) */}
                    {showPhotoMenu && (
                      <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors duration-150"
                        >
                          <ImageIcon className="w-4 h-4 text-zinc-400" />
                          <span>Pilih Foto Baru</span>
                        </button>

                        {formData.avatar_url && (
                          <button
                            onClick={() => {
                              setShowDeleteConfirm(true);
                              setShowPhotoMenu(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors duration-150 border-t border-zinc-200 dark:border-zinc-800"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Hapus Foto</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-600 mt-5 uppercase tracking-[0.14em]">
                  {isUploading ? "Memproses..." : "Foto Profil"}
                </p>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] mb-2 block">
                    Nama Lengkap
                  </label>
                  <input
                    className="w-full border border-zinc-200 dark:border-zinc-700 rounded-md p-3.5 sm:p-4 text-base sm:text-sm font-medium text-zinc-900 dark:text-zinc-100 focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-100 outline-none bg-zinc-50 dark:bg-zinc-900 focus:bg-white dark:focus:bg-zinc-950 transition-colors duration-150"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-4">
                  <div>
                    <label className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] mb-2 block">
                      Tgl Lahir
                    </label>
                    <input
                      type="date"
                      className="w-full border border-zinc-200 dark:border-zinc-700 rounded-md p-3.5 sm:p-4 text-base sm:text-sm font-medium font-mono tabular-nums text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-zinc-900 outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors duration-150 [color-scheme:light] dark:[color-scheme:dark]"
                      value={formData.dob}
                      onChange={(e) =>
                        setFormData({ ...formData, dob: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.12em] mb-2 block">
                      Role
                    </label>
                    <input
                      disabled
                      className="w-full border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900/50 rounded-md p-3.5 sm:p-4 text-base sm:text-sm font-medium text-zinc-400 dark:text-zinc-600 uppercase"
                      value={roleLabel(formData.role)}
                      readOnly
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] mb-2 block">
                    No. WhatsApp
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="08xxxxxxxxxx"
                    className={`w-full border rounded-md p-3.5 sm:p-4 text-base sm:text-sm font-medium font-mono tabular-nums text-zinc-900 dark:text-zinc-100 outline-none bg-zinc-50 dark:bg-zinc-900 focus:bg-white dark:focus:bg-zinc-950 focus:ring-1 transition-colors duration-150 ${
                      waError
                        ? "border-red-500 focus:ring-red-500 focus:border-red-500"
                        : "border-zinc-200 dark:border-zinc-700 focus:ring-zinc-900 dark:focus:ring-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-100"
                    }`}
                    value={formData.no_wa}
                    onChange={(e) => {
                      // hanya angka, spasi, + dan -
                      const v = e.target.value.replace(/[^0-9+\-\s]/g, "");
                      setFormData({ ...formData, no_wa: v });
                      if (waError) setWaError(null);
                    }}
                  />
                  {waError ? (
                    <p className="text-[11px] text-red-600 dark:text-red-400 mt-1.5">
                      {waError}
                    </p>
                  ) : (
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1.5">
                      Dipakai untuk notifikasi WhatsApp pesanan. Boleh
                      dikosongkan.
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] mb-2 block">
                    Alamat
                  </label>
                  <textarea
                    className="w-full border border-zinc-200 dark:border-zinc-700 rounded-md p-3.5 sm:p-4 text-base sm:text-sm font-medium text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-zinc-900 focus:bg-white dark:focus:bg-zinc-950 outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-100 h-24 resize-none transition-colors duration-150"
                    value={formData.address}
                    onChange={(e) =>
                      setFormData({ ...formData, address: e.target.value })
                    }
                  />
                </div>
              </div>

              <button
                onClick={handleSaveWrapper}
                disabled={isUploading}
                className="w-full bg-[#124540] text-white font-semibold py-4 sm:py-5 rounded-xl mt-6 sm:mt-8 hover:bg-[#0d332f] transition-colors duration-150 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}{" "}
                Simpan Perubahan
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
