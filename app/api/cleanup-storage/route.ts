import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireCronSecret } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

// PERINGATAN: endpoint ini MENGHAPUS file di storage secara permanen.
// Wajib header: Authorization: Bearer <CRON_SECRET>
export async function GET(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const supabase = getSupabaseAdmin();

  const BUCKET_NAME = 'production-proofs'; 
  const TABLE_NAME = 'orders';
  
  const COLUMNS_TO_CHECK = [
    'link_approval',      
    'steps_manual',       
    'steps_dtf',          
    'finishing_packing',  
    'shipping',
    // Kolom di bawah ini dulu TIDAK dicek -> file bukti pembayaran & bukti kendala dianggap
    // "yatim" lalu ikut terhapus permanen. Bukti keuangan baru ada di bucket 'finance-proofs'
    // (tidak disentuh endpoint ini), tapi bukti lama masih di bucket ini.
    'kendala',
    'bukti_pembayaran'
  ];

  try {
    // 1. HELPER: NORMALISASI PATH
    const normalizePath = (rawPath: string) => {
      if (!rawPath) return '';
      let clean = decodeURIComponent(rawPath);
      if (clean.includes(`/${BUCKET_NAME}/`)) {
        clean = clean.split(`/${BUCKET_NAME}/`)[1];
      }
      if (clean.includes('?')) clean = clean.split('?')[0];
      return clean.trim();
    };

    // 2. SIAPKAN DATA DARI DB
    const validPathsSet = new Set<string>();

    const extractPaths = (data: any) => {
      if (!data) return;
      if (typeof data === 'string') {
        if (data.includes('/') && data.length > 10) { 
           validPathsSet.add(normalizePath(data));
        }
      } else if (Array.isArray(data)) {
        data.forEach(item => extractPaths(item));
      } else if (typeof data === 'object') {
        Object.values(data).forEach(val => extractPaths(val));
      }
    };

    const { data: dbRecords, error: dbError } = await supabase
      .from(TABLE_NAME)
      .select(COLUMNS_TO_CHECK.join(','));

    if (dbError) throw dbError;

    dbRecords.forEach((row: any) => {
      COLUMNS_TO_CHECK.forEach(colName => {
        const cellData = (row as any)[colName]; 
        extractPaths(cellData);
      });
    });

    // 3. SCAN STORAGE
    const { data: rootFolders, error: folderError } = await supabase
      .storage
      .from(BUCKET_NAME)
      .list();

    if (folderError) throw folderError;

    let scannedCount = 0;
    let filesToDelete: string[] = [];

    for (const folder of rootFolders) {
      if (folder.name === '.emptyFolderPlaceholder') continue;

      const { data: filesInFolder } = await supabase
        .storage
        .from(BUCKET_NAME)
        .list(folder.name);

      if (filesInFolder) {
        for (const file of filesInFolder) {
          if (file.name === '.emptyFolderPlaceholder') continue;
          
          scannedCount++;
          const rawFullPath = `${folder.name}/${file.name}`;
          const cleanFullPath = normalizePath(rawFullPath);

          // Cek apakah ada di daftar valid
          if (!validPathsSet.has(cleanFullPath)) {
            // Push path asli (raw) karena Supabase remove butuh path asli
            filesToDelete.push(rawFullPath);
          }
        }
      }
    }

    // 4. EKSEKUSI PENGHAPUSAN (DELETE)
    const deletedCount = filesToDelete.length;
    const deletedFilesLog: string[] = [];

    if (deletedCount > 0) {
        // Hapus per batch 50 file
        const batchSize = 50;
        for (let i = 0; i < deletedCount; i += batchSize) {
            const batch = filesToDelete.slice(i, i + batchSize);
            
            const { error: deleteError } = await supabase
                .storage
                .from(BUCKET_NAME)
                .remove(batch);
            
            if (deleteError) {
                console.error('Error deleting batch:', deleteError);
            } else {
                deletedFilesLog.push(...batch);
            }
        }
    }

    return NextResponse.json({
      status: 'success',
      mode: 'EKSEKUSI (Live Delete)',
      info: 'File yang tercantum di bawah ini SUDAH DIHAPUS selamanya.',
      stats: {
        total_file_di_storage_awal: scannedCount,
        total_file_valid_dipertahankan: scannedCount - deletedCount,
        total_sampah_dihapus: deletedCount,
      },
      daftar_file_yang_dihapus: deletedFilesLog
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}