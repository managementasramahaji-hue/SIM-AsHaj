import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Custom hook untuk mendengarkan perubahan tabel secara real-time dari Supabase
 * Menggunakan supabase.channel() postgres_changes listener
 * 
 * @param onDataChanged Callback yang dipanggil saat ada event INSERT, UPDATE, atau DELETE
 * @param table (Opsional) Nama tabel spesifik yang ingin didengarkan, default: semua tabel schema 'public'
 */
export function useRealtimeSync(onDataChanged: (payload: any) => void, table?: string) {
  useEffect(() => {
    const channelName = table ? `realtime-${table}-changes` : 'schema-db-changes';
    const filterConfig: any = {
      event: '*',
      schema: 'public',
    };
    if (table) {
      filterConfig.table = table;
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        filterConfig,
        (payload) => {
          console.log(`[Realtime Sync] Perubahan terdeteksi (${payload.eventType} pada ${payload.table || table}):`, payload);
          onDataChanged(payload);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime Sync] Berhasil terhubung ke channel ${channelName}`);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onDataChanged, table]);
}

export default useRealtimeSync;
