// hooks/useUsers.ts
//
// Daftar user + simpan/hapus user (dipakai Pengaturan → Pengguna).
// Tambah/ubah/hapus user lewat API server (/api/users) yang mengurus akun
// login Supabase Auth DAN profilnya sekaligus — browser tidak menulis ke
// tabel `users` dan tidak pernah menerima kolom password.
import { useState, useCallback } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { UserData, ProductionTypeData } from '@/types';
import { DEFAULT_PRODUCTION_TYPES } from '@/lib/utils';

interface UseUsersProps {
  supabase: SupabaseClient;
  showAlert: (title: string, message: string, type?: 'success' | 'error') => void;
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
}

// Kolom yang dimuat ke browser (sengaja tanpa `password`).
const USER_COLUMNS =
  'id, username, name, role, roles, permissions, address, dob, avatar_url, no_wa';

async function callUsersApi(method: 'POST' | 'PATCH' | 'DELETE', body: unknown) {
  try {
    const res = await fetch('/api/users', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json } as const;
  } catch {
    return {
      ok: false,
      status: 0,
      json: { error: 'Tidak bisa menghubungi server. Periksa koneksi internet.' },
    } as const;
  }
}

export function useUsers({ supabase, showAlert, showConfirm }: UseUsersProps) {
  const [usersList, setUsersList] = useState<UserData[]>([]);
  const [productionTypes, setProductionTypes] = useState<ProductionTypeData[]>([]);

  // ─── Fetch ────────────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    const { data } = await supabase.from('users').select(USER_COLUMNS).order('name');
    if (data) setUsersList(data as unknown as UserData[]);
  }, [supabase]);

  const fetchProductionTypes = useCallback(async () => {
    const { data } = await supabase.from('production_types').select('*').order('name');
    if (data) setProductionTypes(data);
    else setProductionTypes(DEFAULT_PRODUCTION_TYPES);
  }, [supabase]);

  // ─── User CRUD ────────────────────────────────────────────────────────────

  /** Tambah (tanpa id) atau ubah (dengan id). Mengembalikan true bila berhasil. */
  const handleSaveUser = useCallback(async (u: any): Promise<boolean> => {
    const isEdit = !!u.id;
    const res = await callUsersApi(isEdit ? 'PATCH' : 'POST', {
      id: u.id || undefined,
      name: u.name,
      username: u.username,
      password: u.password || undefined,
      roles: u.roles,
      no_wa: u.no_wa,
      permissions: u.permissions,
    });

    if (!res.ok) {
      showAlert('Gagal', res.json?.error ?? 'User gagal disimpan', 'error');
      return false;
    }

    await fetchUsers();
    if (isEdit) {
      showAlert(
        'Sukses',
        res.json?.passwordChanged
          ? 'User tersimpan. Password baru berlaku di semua aplikasi Langitan.'
          : 'User tersimpan',
      );
    } else if (res.json?.linked) {
      showAlert(
        'Sukses',
        'User ditambahkan ke Sablon. Email ini sudah punya akun login di aplikasi lain, jadi password-nya tidak diubah.',
      );
    } else {
      showAlert('Sukses', 'User dan akun login berhasil dibuat');
    }
    return true;
  }, [fetchUsers, showAlert]);

  const handleDeleteUser = useCallback((id: string) => {
    showConfirm(
      'Hapus User?',
      'User dihapus dari Sablon. Akun login ikut dihapus hanya bila tidak dipakai aplikasi lain.',
      async () => {
        const res = await callUsersApi('DELETE', { userId: id });
        if (!res.ok) {
          showAlert('Gagal', res.json?.error ?? 'User gagal dihapus', 'error');
          return;
        }
        await fetchUsers();
        showAlert(
          'Sukses',
          res.json?.authKept
            ? 'User dihapus dari Sablon. Akun login dipertahankan karena masih dipakai aplikasi lain.'
            : 'User dan akun login berhasil dihapus',
        );
      },
    );
  }, [showConfirm, fetchUsers, showAlert]);

  // ─── Production Type CRUD ─────────────────────────────────────────────────

  const handleSaveType = useCallback(async (t: any) => {
    const p = { name: t.name, value: t.value };
    const { error } = t.id
      ? await supabase.from('production_types').update(p).eq('id', t.id)
      : await supabase.from('production_types').insert([p]);
    if (!error) { fetchProductionTypes(); showAlert('Sukses', 'Tipe tersimpan'); }
  }, [supabase, fetchProductionTypes, showAlert]);

  const handleDeleteType = useCallback(async (id: string) => {
    showConfirm('Hapus Tipe?', 'Yakin hapus?', async () => {
      await supabase.from('production_types').delete().eq('id', id);
      fetchProductionTypes();
      showAlert('Sukses', 'Dihapus');
    });
  }, [showConfirm, supabase, fetchProductionTypes, showAlert]);

  return {
    usersList,
    productionTypes,
    fetchUsers,
    fetchProductionTypes,
    handleSaveUser,
    handleDeleteUser,
    handleSaveType,
    handleDeleteType,
  };
}