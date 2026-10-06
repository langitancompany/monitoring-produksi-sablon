// hooks/useUsers.ts
import { useState, useCallback } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { UserData, ProductionTypeData } from '@/types';
import { DEFAULT_PRODUCTION_TYPES } from '@/lib/utils';
import { primaryRole } from '@/lib/roles';

interface UseUsersProps {
  supabase: SupabaseClient;
  showAlert: (title: string, message: string, type?: 'success' | 'error') => void;
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
}

export function useUsers({ supabase, showAlert, showConfirm }: UseUsersProps) {
  const [usersList, setUsersList] = useState<UserData[]>([]);
  const [productionTypes, setProductionTypes] = useState<ProductionTypeData[]>([]);

  // ─── Fetch ────────────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    const { data } = await supabase.from('users').select('*').order('name');
    if (data) setUsersList(data);
  }, [supabase]);

  const fetchProductionTypes = useCallback(async () => {
    const { data } = await supabase.from('production_types').select('*').order('name');
    if (data) setProductionTypes(data);
    else setProductionTypes(DEFAULT_PRODUCTION_TYPES);
  }, [supabase]);

  // ─── User CRUD ────────────────────────────────────────────────────────────

  const handleSaveUser = useCallback(async (u: any) => {
    // Role ganda: `roles` = semua pilihan, `role` = role utama (lihat lib/roles.ts).
    const roles: string[] =
      Array.isArray(u.roles) && u.roles.length > 0
        ? u.roles
        : [u.role || 'produksi'];
    const p: any = {
      name: u.name,
      role: primaryRole(roles),
      roles,
      username: u.username,
      no_wa: u.no_wa?.trim() || null, // ── TAMBAHAN ── nomor WhatsApp untuk notifikasi
    };
    if (u.permissions) p.permissions = u.permissions;
    if (u.password?.trim()) p.password = u.password;
    const { error } = u.id
      ? await supabase.from('users').update(p).eq('id', u.id)
      : await supabase.from('users').insert([p]);
    if (!error) { fetchUsers(); showAlert('Sukses', 'User tersimpan'); }
    else showAlert('Gagal', `${error.message} (pastikan migration kolom "roles" sudah dijalankan)`, 'error');
  }, [supabase, fetchUsers, showAlert]);

  const handleDeleteUser = useCallback(async (id: string) => {
    showConfirm('Hapus User?', 'User akan dihapus dari aplikasi dan akun login.', async () => {
      try {
        // 1. Hapus dari tabel users
        await supabase.from('users').delete().eq('id', id);

        // 2. Hapus dari auth via API route
        await fetch('/api/delete-user', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: id }),
        });

        fetchUsers();
        showAlert('Sukses', 'User berhasil dihapus');
      } catch (err: any) {
        showAlert('Gagal', err.message, 'error');
      }
    });
  }, [showConfirm, supabase, fetchUsers, showAlert]);
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