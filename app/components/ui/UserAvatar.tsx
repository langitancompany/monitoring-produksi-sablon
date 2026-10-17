// app/components/ui/UserAvatar.tsx
//
// Lingkaran avatar: menampilkan foto profil bila ada, kalau tidak ada (atau
// gagal dimuat) otomatis menampilkan `fallback` (mis. inisial nama).
// Ukuran, warna latar, dan border diatur lewat `className` oleh pemanggil.
"use client";

import React, { useEffect, useState } from "react";

interface UserAvatarProps {
  src?: string | null;
  alt?: string;
  /** Isi cadangan bila tidak ada foto, mis. huruf pertama / inisial nama. */
  fallback: React.ReactNode;
  className?: string;
}

export default function UserAvatar({
  src,
  alt = "",
  fallback,
  className = "",
}: UserAvatarProps) {
  const [failed, setFailed] = useState(false);

  // Foto diganti → coba muat lagi
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showImage = !!src && !failed;

  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden rounded-full select-none ${className}`}
    >
      {showImage ? (
        <img
          src={src!}
          alt={alt}
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        fallback
      )}
    </span>
  );
}
