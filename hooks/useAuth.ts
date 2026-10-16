// app/hooks/useAuth.ts

import { useState, useEffect, useCallback } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { UserData, resolvePermissions } from '@/types';

interface CurrentUser extends UserData {
  id: string;
}

interface UseAuthProps {
  supabase: SupabaseClient;
  showAlert: (title: string, message: string, type?: 'success' | 'error') => void;
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
}

export function useAuth({ supabase, showAlert, showConfirm }: UseAuthProps) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // ─── Init Session ─────────────────────────────────────────────────────────

  useEffect(() => {
    const initSession = async () => {
      setLoadingUser(true);
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        const { data: userData } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (userData) {
          setCurrentUser({
            id: session.user.id,
            username: userData.username || '',
            name: userData.name || 'User',
            role: userData.role || 'produksi',
            password: '',
            permissions: resolvePermissions(userData.permissions),
            address: userData.address,
            dob: userData.dob,
            avatar_url: userData.avatar_url,
          });
        }
      }

      setLoadingUser(false);
    };

    initSession();
  }, [supabase]);

  // ─── Logout ───────────────────────────────────────────────────────────────

  const handleLogout = useCallback(async () => {
    showConfirm('Logout', 'Keluar aplikasi?', async () => {
      await supabase.auth.signOut();
      window.location.reload();
    });
  }, [showConfirm, supabase]);

  // ─── Update Profil ────────────────────────────────────────────────────────

  const handleUpdateProfile = useCallback(async (
    newData: any,
    onSuccess: () => void
  ) => {
    if (!currentUser) return;

    const { error } = await supabase
      .from('users')
      .update({
        name: newData.name,
        address: newData.address,
        dob: newData.dob,
        avatar_url: newData.avatar_url,
      })
      .eq('id', currentUser.id);

    if (!error) {
      setCurrentUser(prev => prev ? { ...prev, ...newData } : prev);
      onSuccess();
      showAlert('Sukses', 'Profil diperbarui');
    } else {
      showAlert('Gagal', error.message, 'error');
    }
  }, [currentUser, supabase, showAlert]);

  return {
    currentUser,
    loadingUser,
    handleLogout,
    handleUpdateProfile,
  };
}