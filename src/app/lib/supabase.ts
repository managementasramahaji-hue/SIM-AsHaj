// @ts-nocheck
import { createClient } from '@supabase/supabase-js';
import type { CompleteStorageDatabase } from '../services/dataStorage';
import { initialRoomCapacityRates, initialUsers, initialBreakfastMenuItems } from '../data';
import { initialChatChannels } from '../chatData';
import { deduplicateRoomCapacityRates, normalizeBuildingName, getRoomBuildingKey, deduplicateRoomsByBuildingAndNumber } from './utils';
import { fetchFullDatabaseFromSpreadsheet, fetchFromGoogleSheet, updateBuildingInSpreadsheetDirect, deleteBuildingInSpreadsheetDirect } from '../services/spreadsheetStorage';
export { fetchFromGoogleSheet, fetchFullDatabaseFromSpreadsheet };
import type { 
  Building, 
  Room, 
  MeetingRoom, 
  Transaction, 
  Maintenance, 
  QcInspection, 
  WorkSession, 
  AuditLog, 
  ChatChannel, 
  ChatMessage, 
  BreakfastMenuItem, 
  BreakfastOrder, 
  User,
  RoomCapacityRate
} from '../types';

/**
 * Pembersihan URL Supabase jika pengguna menyertakan path endpoint '/rest/v1' atau trailing slash.
 * createClient memerlukan base project URL seperti https://xyz.supabase.co
 */
function sanitizeSupabaseUrl(url?: string): string {
  if (!url) return '';
  return url.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
}

// Deteksi konfigurasi database dari server / environment variable tanpa ketergantungan localStorage
const windowConfig = typeof window !== 'undefined' ? (window as any).__INITIAL_SUPABASE_CONFIG__ : null;

// Deteksi environment variable aman untuk Vite & Vercel
const rawEnvUrl = 
  (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_SUPABASE_URL) ||
  (typeof process !== 'undefined' && (process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)) ||
  '';

const rawEnvKey = 
  (typeof import.meta !== 'undefined' && ((import.meta as any)?.env?.VITE_SUPABASE_PUBLISHABLE_KEY || (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY)) ||
  (typeof process !== 'undefined' && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY)) ||
  '';

// Default fallback mengarah ke proyek Supabase yang telah dikonfigurasi aktif
const defaultFallbackUrl = 'https://iiopgzyxzvmnmkgnrzvc.supabase.co';
const defaultFallbackKey = 'sb_publishable_rpX2kofk6225g4vs6lB1gQ_6_F4bz80';

export let SUPABASE_URL = sanitizeSupabaseUrl(windowConfig?.url || rawEnvUrl || defaultFallbackUrl);
export let SUPABASE_ANON_KEY = (windowConfig?.anonKey || rawEnvKey || defaultFallbackKey || '').trim();

/**
 * Mendapatkan informasi sumber konfigurasi Supabase yang sedang aktif
 */
export function getSupabaseSourceInfo(): {
  url: string;
  source: 'server_config' | 'environment_variable' | 'default_hardcoded';
  host: string;
  isCustom: boolean;
  hasEnv: boolean;
} {
  let source: 'server_config' | 'environment_variable' | 'default_hardcoded' = 'default_hardcoded';
  if (windowConfig?.url && windowConfig?.anonKey) {
    source = 'server_config';
  } else if (rawEnvUrl && rawEnvKey) {
    source = 'environment_variable';
  }

  let host = SUPABASE_URL;
  try {
    const parsed = new URL(SUPABASE_URL);
    host = parsed.host;
  } catch {
    host = SUPABASE_URL.replace(/^https?:\/\//, '').split('/')[0];
  }

  return {
    url: SUPABASE_URL,
    source,
    host,
    isCustom: Boolean(windowConfig?.isCustom || (windowConfig?.url && windowConfig.url !== defaultFallbackUrl)),
    hasEnv: Boolean(rawEnvUrl && rawEnvKey)
  };
}

/**
 * Simpan kredensial Supabase kustom dan sinkronkan ke server (supabase_config.json dan .env)
 * secara realtime tanpa menyimpan payload data ke localStorage.
 */
export async function saveCustomSupabaseCredentials(url: string, key: string): Promise<boolean> {
  const cleanUrl = sanitizeSupabaseUrl(url);
  const cleanKey = key.trim();

  SUPABASE_URL = cleanUrl;
  SUPABASE_ANON_KEY = cleanKey;

  if (typeof window !== 'undefined') {
    (window as any).__INITIAL_SUPABASE_CONFIG__ = { url: cleanUrl, anonKey: cleanKey, isCustom: true };
    try {
      localStorage.removeItem('CUSTOM_SUPABASE_URL');
      localStorage.removeItem('CUSTOM_SUPABASE_ANON_KEY');
      localStorage.removeItem('SIM_ASRAMA_HAJI_DATABASE');
      localStorage.removeItem('CENTRAL_DB_CACHE');
    } catch (_) {}

    // Siarkan ke tab lain di browser yang sama
    try {
      if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel('sim_haji_realtime_bus_v2');
        bc.postMessage({
          type: 'config:supabase',
          payload: { url: cleanUrl, anonKey: cleanKey },
          timestamp: Date.now(),
        });
      }
    } catch (_) {}
  }

  reconfigureSupabaseClient(cleanUrl, cleanKey);

  // Sinkronkan ke server backend agar server & seluruh sesi memakai database ini
  try {
    const res = await fetch('/api/supabase-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: cleanUrl, anonKey: cleanKey }),
    });
    return res.ok;
  } catch (err) {
    console.warn('Gagal persist kredensial ke server:', err);
    return false;
  }
}

/**
 * Hapus kredensial Supabase kustom dan kembalikan ke .env / bawaan
 */
export async function removeCustomSupabaseCredentials(): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('CUSTOM_SUPABASE_URL');
    localStorage.removeItem('CUSTOM_SUPABASE_ANON_KEY');

    try {
      if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel('sim_haji_realtime_bus_v2');
        bc.postMessage({
          type: 'config:reset',
          payload: {},
          timestamp: Date.now(),
        });
      }
    } catch (_) {}
  }

  try {
    await fetch('/api/supabase-config', { method: 'DELETE' });
  } catch (_) {}
}

/**
 * Uji konektivitas ke database Supabase kustom sebelum disimpan
 */
export async function testCustomSupabaseConnection(testUrl: string, testKey: string): Promise<{ success: boolean; hasTables?: boolean; message: string }> {
  try {
    const cleanUrl = sanitizeSupabaseUrl(testUrl);
    if (!cleanUrl || !testKey) {
      return { success: false, hasTables: false, message: 'URL dan Anon Key Supabase wajib diisi.' };
    }
    const tempClient = createClient(cleanUrl, testKey.trim(), {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const [syncRes, bldRes] = await Promise.all([
      tempClient.from('app_database_sync').select('id').limit(1),
      tempClient.from('buildings').select('id').limit(1)
    ]);

    const hasTables = !syncRes.error || !bldRes.error;
    if (!hasTables) {
      if (syncRes.error?.code === '42P01' && bldRes.error?.code === '42P01') {
        return { 
          success: false, 
          hasTables: false,
          message: 'Terkoneksi ke Supabase, TETAPI tabel belum dibuat. Harap salin dan jalankan Skrip SQL di Tab ke-3 di SQL Editor Supabase Anda terlebih dahulu.' 
        };
      }
      const err = syncRes.error || bldRes.error;
      return { success: false, hasTables: false, message: `Koneksi gagal: ${err?.message || 'Error'} (Kode: ${err?.code || 'ERR'})` };
    }
    return { success: true, hasTables: true, message: 'Berhasil terhubung ke database Supabase! Struktur tabel siap digunakan.' };
  } catch (err: any) {
    return { success: false, hasTables: false, message: `Gagal menghubungi Supabase: ${err?.message || 'Network error'}` };
  }
}

/**
 * Migrasikan / Salin seluruh data aktif ke database Supabase baru secara lengkap dan terverifikasi
 */
export async function pushAllToTargetSupabase(targetUrl: string, targetKey: string, dbPayload: CompleteStorageDatabase): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanUrl = sanitizeSupabaseUrl(targetUrl);
    if (!cleanUrl || !targetKey) {
      return { success: false, error: 'URL atau Key tidak valid' };
    }
    const targetClient = createClient(cleanUrl, targetKey.trim(), {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    
    // 1. Verifikasi tabel utama
    const { error: pingErr } = await targetClient.from('app_database_sync').select('id').limit(1);
    if (pingErr) {
      if (pingErr.code === '42P01') {
        return {
          success: false,
          error: 'Tabel basis data belum dibuat di proyek Supabase baru. Silakan buka menu SQL Editor di Supabase baru Anda dan jalankan skrip SQL di Tab ke-3 (Skrip SQL Schema Baru) terlebih dahulu.'
        };
      }
      return {
        success: false,
        error: `Gagal mengakses Supabase target: ${pingErr.message} (Kode: ${pingErr.code})`
      };
    }

    // 2. Simpan atomic snapshot ke app_database_sync (dengan id 'main_production_db' dan 'root_snapshot')
    const { error: syncError } = await targetClient.from('app_database_sync').upsert([
      { id: 'main_production_db', database_payload: dbPayload, updated_at: new Date().toISOString() },
      { id: 'root_snapshot', database_payload: dbPayload, updated_at: new Date().toISOString() }
    ], { onConflict: 'id' });

    if (syncError) {
      return { success: false, error: `Gagal menyimpan snapshot ke app_database_sync: ${syncError.message}` };
    }

    // 3. Simpan buildings
    if (Array.isArray(dbPayload.buildings) && dbPayload.buildings.length > 0) {
      try {
        const bRows = dbPayload.buildings.map(b => ({
          id: b.id,
          name: b.name,
          code: b.code || '',
          floors: Number(b.floors) || 1,
          total_rooms: Number(b.totalRooms) || 0,
          capacity_desc: b.capacityDesc || '',
          category: b.category || 'PENGINAPAN',
          description: b.description || '',
          status: b.status || 'AKTIF'
        }));
        const { error: bErr } = await targetClient.from('buildings').upsert(bRows, { onConflict: 'id' });
        if (bErr) console.warn('Peringatan upsert buildings ke target:', bErr.message);
      } catch (err) {
        console.warn('Gagal upsert buildings ke target:', err);
      }
    }

    // 4. Simpan rooms
    if (Array.isArray(dbPayload.rooms) && dbPayload.rooms.length > 0) {
      try {
        const rRows = dbPayload.rooms.map(r => ({
          id: r.id,
          room_number: r.roomNumber,
          building: r.building,
          floor: Number(r.floor) || 1,
          type: r.type || 'Standard',
          bed_type: r.bedType || null,
          capacity: typeof r.capacity === 'string' ? r.capacity : String(r.capacity || '2 Orang'),
          capacity_number: Number(r.capacityNumber ?? 2),
          price_per_night: Number(r.pricePerNight || 0),
          status: r.status || 'KOSONG',
          active_tx_id: r.activeTxId || null,
          active_maint_id: r.activeMaintId || null,
          qc_status: r.qcStatus || 'LOLOS_QC',
          last_qc_date: r.lastQcDate || null,
          last_qc_by: r.lastQcBy || null,
          last_qc_notes: r.lastQcNotes || null,
          facilities: Array.isArray(r.facilities) ? r.facilities : []
        }));
        const { error: rErr } = await targetClient.from('rooms').upsert(rRows, { onConflict: 'id' });
        if (rErr) console.warn('Peringatan upsert rooms ke target:', rErr.message);
      } catch (err) {
        console.warn('Gagal upsert rooms ke target:', err);
      }
    }

    // 5. Simpan meeting_rooms
    if (Array.isArray(dbPayload.meetingRooms) && dbPayload.meetingRooms.length > 0) {
      try {
        const mrRows = dbPayload.meetingRooms.map(m => ({
          id: m.id,
          name: m.name,
          code: m.code || '',
          category: m.category || 'SERBAGUNA',
          building: m.building || 'Kompleks Ruang Pertemuan',
          capacity: m.capacity || '',
          capacity_number: Number(m.capacityNumber || 50),
          facilities: Array.isArray(m.facilities) ? m.facilities : [],
          daily_rate: Number(m.dailyRate || 0),
          session_rate: Number(m.sessionRate || 0),
          description: m.description || '',
          status: m.status || 'TERSEDIA',
          qc_status: m.qcStatus || 'LOLOS_QC',
          active_tx_id: m.activeTxId || null,
          active_maint_id: m.activeMaintId || null
        }));
        const { error: mrErr } = await targetClient.from('meeting_rooms').upsert(mrRows, { onConflict: 'id' });
        if (mrErr) console.warn('Peringatan upsert meeting_rooms ke target:', mrErr.message);
      } catch (err) {
        console.warn('Gagal upsert meeting_rooms ke target:', err);
      }
    }

    // 6. Simpan users
    if (Array.isArray(dbPayload.users) && dbPayload.users.length > 0) {
      try {
        const uRows = dbPayload.users.map(u => ({
          id: u.id,
          username: u.username,
          full_name: u.fullName || u.username,
          role: u.role,
          password: u.password || '',
          department: u.department || 'Operasional',
          supervisor_id: u.supervisorId || null,
          assigned_building: u.assignedBuilding || null,
          phone: u.phone || null,
          status: u.status || 'Aktif',
          email: u.email || `${u.username}@asramahaji.id`,
          nip: u.nip || null,
          is_owner: Boolean(u.isOwner),
          signature_url: u.signatureUrl || null,
          qr_code_url: u.qrCodeUrl || null,
          signature_history: u.signatureHistory || []
        }));
        const { error: uErr } = await targetClient.from('users').upsert(uRows, { onConflict: 'id' });
        if (uErr) console.warn('Peringatan upsert users ke target:', uErr.message);
      } catch (err) {
        console.warn('Gagal upsert users ke target:', err);
      }
    }

    // 7. Simpan room_capacity_rates
    if (Array.isArray(dbPayload.roomCapacityRates) && dbPayload.roomCapacityRates.length > 0) {
      try {
        const rcrRows = dbPayload.roomCapacityRates.map(rc => ({
          id: rc.id,
          room_type: rc.roomType,
          bed_type: rc.bedType,
          capacity_pax: rc.capacityPax,
          price_per_night: rc.pricePerNight,
          description: rc.description || '',
          updated_at: new Date().toISOString()
        }));
        await targetClient.from('room_capacity_rates').upsert(rcrRows, { onConflict: 'id' });
      } catch (err) {
        console.warn('Gagal upsert room_capacity_rates ke target:', err);
      }
    }

    // 8. Simpan transactions
    if (Array.isArray(dbPayload.transactions) && dbPayload.transactions.length > 0) {
      try {
        const txRows = dbPayload.transactions.map(t => ({
          id: t.id,
          room_id: t.roomId,
          room_number: t.roomNumber,
          category: t.category,
          guest_name: t.guestName,
          guest_type: t.guestType,
          nik_ktp: t.nikKtp,
          kloter: t.kloter,
          start_date: t.startDate,
          duration: t.duration,
          phone: t.phone,
          notes: t.notes,
          status: t.status,
          created_user: t.createdUser,
          is_group: t.isGroup,
          group_type: t.groupType,
          group_name: t.groupName,
          group_pic: t.groupPic,
          group_pic_phone: t.groupPicPhone,
          group_id: t.groupId,
          total_pax: t.totalPax,
          include_aula: t.includeAula,
          rent_aula_id: t.rentAulaId,
          rent_aula_name: t.rentAulaName,
          catering_package: t.cateringPackage,
          catering_pax_count: t.cateringPaxCount,
          spk_number: t.spkNumber,
          allocated_room_numbers: t.allocatedRoomNumbers,
          allocated_rooms_count: t.allocatedRoomsCount,
          breakfast: t.breakfast,
          breakfast_menu: t.breakfastMenu,
          breakfast_portions: t.breakfastPortions,
          breakfast_days: t.breakfastDays,
          breakfast_status: t.breakfastStatus,
          rent_type: t.rentType,
          duration_unit: t.durationUnit,
          extra_bed: t.extraBed,
          extra_bed_count: t.extraBedCount,
          extra_bed_price: t.extraBedPrice || 0,
          extra_bed_notes: t.extraBedNotes || null,
          agency_or_document: t.agencyOrDocument || null,
          price_per_night: t.pricePerNight || 0,
          payment_status: t.paymentStatus || 'BELUM_LUNAS',
          paid_amount: t.paidAmount || 0,
          dp_amount: t.dpAmount || 0,
          dp_date: t.dpDate || null,
          dp_method: t.dpMethod || null,
          dp_note: t.dpNote || null,
          remaining_amount: t.remainingAmount || 0,
          va_number: t.vaNumber || null,
          va_account_name: t.vaAccountName || null,
          bank_name: t.bankName || null,
          bank_account_number: t.bankAccountNumber || null,
          payment_method: t.paymentMethod || null,
          payment_date: t.paymentDate || null,
          payment_note: t.paymentNote || null,
          kwitansi_no: t.kwitansiNo || null,
          cancelled_at: t.cancelledAt || null,
          cancel_reason: t.cancelReason || null,
          cancelled_user: t.cancelledUser || null,
          extend_history: t.extendHistory || [],
          check_in_time: t.checkInTime,
          check_out_time: t.checkOutTime
        }));
        await targetClient.from('transactions').upsert(txRows, { onConflict: 'id' });
      } catch (err) {
        console.warn('Gagal upsert transactions ke target:', err);
      }
    }

    // 9. Simpan maintenances
    if (Array.isArray(dbPayload.maintenances) && dbPayload.maintenances.length > 0) {
      try {
        const maintRows = dbPayload.maintenances.map(m => ({
          id: m.id,
          room_id: m.roomId,
          building: m.building,
          room_number: m.roomNumber,
          category: m.category,
          urgency: m.urgency,
          technician: m.technician,
          description: m.description,
          report_time: m.reportTime,
          status: m.status,
          reported_user: m.reportedUser,
          assigned_technician_id: m.assignedTechnicianId,
          assigned_technician_name: m.assignedTechnicianName,
          assigned_by_manager: m.assignedByManager,
          assigned_time: m.assignedTime,
          manager_notes: m.managerNotes,
          work_completed_time: m.workCompletedTime,
          technician_notes: m.technicianNotes,
          resolved_time: m.resolvedTime,
          qc_inspection_id: m.qcInspectionId,
          facility_type: m.facilityType
        }));
        await targetClient.from('maintenances').upsert(maintRows, { onConflict: 'id' });
      } catch (err) {
        console.warn('Gagal upsert maintenances ke target:', err);
      }
    }

    // 10. Simpan app_settings
    if (dbPayload.appSettings) {
      try {
        await targetClient.from('app_settings').upsert({
          id: 'default',
          organization_name: dbPayload.appSettings.organizationName,
          sub_title: dbPayload.appSettings.subTitle,
          ministry_name: dbPayload.appSettings.ministryName,
          address: dbPayload.appSettings.address,
          phone: dbPayload.appSettings.phone,
          email: dbPayload.appSettings.email,
          portal_url: dbPayload.appSettings.portalUrl,
          app_logo: dbPayload.appSettings.appLogo || null,
          app_favicon: dbPayload.appSettings.appFavicon || null,
          tag_title: dbPayload.appSettings.tagTitle || null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
      } catch (_) {}
    }

    // 11. Simpan breakfast_menu_items
    if (Array.isArray(dbPayload.breakfastMenuItems) && dbPayload.breakfastMenuItems.length > 0) {
      try {
        const bmiRows = dbPayload.breakfastMenuItems.map(b => ({
          id: b.id,
          name: b.name,
          category: b.category,
          price: b.price || 0,
          description: b.description || '',
          is_available: b.isAvailable !== false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));
        await targetClient.from('breakfast_menu_items').upsert(bmiRows, { onConflict: 'id' });
      } catch (_) {}
    }

    // 12. Simpan breakfast_orders
    if (Array.isArray(dbPayload.breakfastOrders) && dbPayload.breakfastOrders.length > 0) {
      try {
        const boRows = dbPayload.breakfastOrders.map(o => ({
          id: o.id,
          room_number: o.roomNumber,
          building: o.building,
          guest_name: o.guestName,
          phone: o.phone || null,
          kloter: o.kloter || null,
          transaction_id: o.transactionId || null,
          menu_id: o.menuId || null,
          menu_name: o.menuName,
          portions: o.portions,
          days: o.days || 1,
          start_date: o.startDate || new Date().toISOString().slice(0, 10),
          delivery_time: o.deliveryTime || '06:30 WIB',
          status: o.status || 'MENUNGGU',
          notes: o.notes || '',
          price_per_portion: o.pricePerPortion || 0,
          total_price: o.totalPrice || 0
        }));
        await targetClient.from('breakfast_orders').upsert(boRows, { onConflict: 'id' });
      } catch (_) {}
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Gagal migrasi ke target database' };
  }
}

let _activeClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});

/**
 * Reconfigures the active Supabase client dynamically without page reload
 */
export function reconfigureSupabaseClient(newUrl: string, newKey: string) {
  SUPABASE_URL = sanitizeSupabaseUrl(newUrl);
  SUPABASE_ANON_KEY = newKey.trim();
  _activeClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });
}

/**
 * Klien resmi Supabase (@supabase/supabase-js) dinamis yang selalu mengarah ke database aktif
 */
export const supabase: any = new Proxy({} as any, {
  get(_target, prop) {
    const val = (_activeClient as any)[prop];
    return typeof val === 'function' ? val.bind(_activeClient) : val;
  }
});

export interface SupabaseSyncState {
  status: 'idle' | 'syncing' | 'connected' | 'error';
  lastSyncTime: string | null;
  errorMessage: string | null;
  isConfigured: boolean;
  isSyncing?: boolean;
  lastSyncedAt?: string | null;
  lastError?: string | null;
}

/**
 * Uji konektivitas ke Supabase
 */
export async function testSupabaseConnection(): Promise<{ success: boolean; message: string }> {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { success: false, message: 'URL atau Anon Key Supabase belum dikonfigurasi.' };
    }

    // Coba ping tabel app_database_sync atau users
    const { error } = await supabase.from('app_database_sync').select('id').limit(1);
    if (error) {
      // Jika tabel belum dibuat, periksa koneksi rest
      if (error.code === '42P01') {
        return { 
          success: true, 
          message: 'Terkoneksi ke Supabase! Catatan: Tabel database belum dibuat. Silakan jalankan script SQL yang telah disediakan di SQL Editor Supabase.' 
        };
      }
      return { success: false, message: `Koneksi Supabase gagal: ${error.message} (Code: ${error.code})` };
    }

    return { success: true, message: 'Berhasil terhubung ke Supabase Database secara realtime!' };
  } catch (err: any) {
    return { success: false, message: `Gagal menghubungi Supabase: ${err?.message || 'Network error'}` };
  }
}

/**
 * Ambil seluruh database dari Supabase
 */
/**
 * Pemetaan record tabel users Supabase (snake_case) ke objek User aplikasi (camelCase)
 */
export function mapSupabaseUserToAppUser(u: any): User {
  return {
    id: String(u.id || ''),
    username: String(u.username || ''),
    fullName: String(u.full_name || u.fullName || u.username || ''),
    role: u.role || 'Resepsionis',
    password: String(u.password || '12345'),
    department: typeof u.department === 'string' ? u.department : (u.department ? String(u.department) : 'Operasional'),
    supervisorId: u.supervisor_id || u.supervisorId || undefined,
    assignedBuilding: String(u.assigned_building || u.assignedBuilding || 'Semua Gedung'),
    phone: String(u.phone || '-'),
    status: String(u.status || 'Aktif'),
    email: u.email ? String(u.email) : undefined,
    nip: u.nip ? String(u.nip) : undefined,
    isOwner: Boolean(u.is_owner ?? u.isOwner ?? false),
    signatureUrl: u.signature_url || u.signatureUrl || undefined,
    qrCodeUrl: u.qr_code_url || u.qrCodeUrl || undefined,
    signatureHistory: Array.isArray(u.signature_history || u.signatureHistory) ? (u.signature_history || u.signatureHistory) : []
  };
}

export function mapSupabaseBuildingToAppBuilding(b: any): Building {
  return {
    id: b.id,
    name: b.name,
    code: b.code || undefined,
    floors: b.floors ?? 1,
    totalRooms: b.total_rooms ?? b.totalRooms ?? 0,
    capacityDesc: b.capacity_desc || b.capacityDesc || undefined,
    category: b.category || 'PENGINAPAN',
    description: b.description || undefined,
    status: b.status || 'AKTIF',
    createdAt: b.created_at || b.createdAt || undefined
  };
}

export function mapSupabaseMeetingRoomToAppMeetingRoom(m: any): MeetingRoom {
  return {
    id: m.id,
    name: m.name,
    code: m.code || undefined,
    building: m.building,
    capacity: m.capacity || '',
    capacityNumber: m.capacity_number ?? m.capacityNumber ?? 0,
    facilities: m.facilities || [],
    dailyRate: Number(m.daily_rate ?? m.dailyRate ?? 0),
    sessionRate: Number(m.session_rate ?? m.sessionRate ?? 0),
    description: m.description || undefined,
    status: m.status || 'TERSEDIA',
    qcStatus: m.qc_status || m.qcStatus || 'LOLOS_QC',
    activeTxId: m.active_tx_id || m.activeTxId || null,
    createdAt: m.created_at || m.createdAt || undefined
  };
}

export function mapSupabaseRoomToAppRoom(r: any): Room {
  return {
    id: r.id,
    building: r.building,
    roomNumber: r.room_number || r.roomNumber,
    floor: r.floor ?? undefined,
    type: r.type,
    bedType: r.bed_type || r.bedType || undefined,
    capacity: r.capacity || '',
    capacityNumber: r.capacity_number ?? r.capacityNumber ?? undefined,
    status: r.status || 'KOSONG',
    qcStatus: r.qc_status || r.qcStatus || 'LOLOS_QC',
    lastQcDate: r.last_qc_date || r.lastQcDate || undefined,
    lastQcBy: r.last_qc_by || r.lastQcBy || undefined,
    lastQcNotes: r.last_qc_notes || r.lastQcNotes || undefined,
    activeTxId: r.active_tx_id !== undefined ? r.active_tx_id : (r.activeTxId !== undefined ? r.activeTxId : null),
    activeMaintId: r.active_maint_id !== undefined ? r.active_maint_id : (r.activeMaintId !== undefined ? r.activeMaintId : null),
    pricePerNight: Number(r.price_per_night ?? r.pricePerNight ?? 0),
    facilities: r.facilities || [],
    createdAt: r.created_at || r.createdAt || undefined
  };
}

export function mapSupabaseTransactionToAppTransaction(t: any): Transaction {
  return {
    id: t.id,
    roomId: t.room_id || t.roomId || '',
    building: t.building || '',
    roomNumber: t.room_number || t.roomNumber || '',
    category: t.category || '',
    guestName: t.guest_name || t.guestName || '',
    guestType: t.guest_type || t.guestType || 'INDIVIDU',
    nikKtp: t.nik_ktp || t.nikKtp || undefined,
    kloter: t.kloter || '',
    startDate: t.start_date || t.startDate || '',
    duration: Number(t.duration || 1),
    phone: t.phone || '',
    notes: t.notes || '',
    status: t.status || 'AKTIF',
    createdUser: t.created_user || t.createdUser || 'System',
    isGroup: Boolean(t.is_group ?? t.isGroup),
    groupType: t.group_type || t.groupType || undefined,
    groupName: t.group_name || t.groupName || undefined,
    groupPic: t.group_pic || t.groupPic || undefined,
    groupPicPhone: t.group_pic_phone || t.groupPicPhone || undefined,
    groupId: t.group_id || t.groupId || undefined,
    totalPax: t.total_pax ?? t.totalPax ?? undefined,
    includeAula: Boolean(t.include_aula ?? t.includeAula),
    rentAulaId: t.rent_aula_id || t.rentAulaId || undefined,
    rentAulaName: t.rent_aula_name || t.rentAulaName || undefined,
    rentAulaDuration: t.rent_aula_duration ?? t.rentAulaDuration ?? undefined,
    rentAulaDurationDays: t.rent_aula_duration_days ?? t.rentAulaDurationDays ?? undefined,
    rentAulaSession: t.rent_aula_session || t.rentAulaSession || undefined,
    cateringPackage: t.catering_package || t.cateringPackage || undefined,
    cateringPaxCount: t.catering_pax_count ?? t.cateringPaxCount ?? undefined,
    agencyOrDocument: t.agency_or_document || t.agencyOrDocument || undefined,
    spkNumber: t.spk_number || t.spkNumber || undefined,
    allocatedRoomNumbers: t.allocated_room_numbers || t.allocatedRoomNumbers || undefined,
    allocatedRoomsCount: t.allocated_rooms_count ?? t.allocatedRoomsCount ?? undefined,
    breakfast: Boolean(t.breakfast),
    breakfastMenu: t.breakfast_menu || t.breakfastMenu || undefined,
    breakfastPortions: t.breakfast_portions ?? t.breakfastPortions ?? undefined,
    breakfastDays: t.breakfast_days ?? t.breakfastDays ?? undefined,
    breakfastStatus: t.breakfast_status || t.breakfastStatus || undefined,
    rentType: t.rent_type || t.rentType || undefined,
    durationUnit: t.duration_unit || t.durationUnit || 'Hari',
    pricePerNight: Number(t.price_per_night ?? t.pricePerNight ?? 0),
    extraBed: Boolean(t.extra_bed ?? t.extraBed),
    extraBedCount: Number(t.extra_bed_count ?? t.extraBedCount ?? 0),
    extraBedPrice: Number(t.extra_bed_price ?? t.extraBedPrice ?? 0),
    extraBedNotes: t.extra_bed_notes || t.extraBedNotes || undefined,
    checkInTime: t.check_in_time || t.checkInTime || undefined,
    checkOutTime: t.check_out_time || t.checkOutTime || undefined,
    paymentStatus: t.payment_status || t.paymentStatus || 'BELUM_LUNAS',
    paidAmount: Number(t.paid_amount ?? t.paidAmount ?? 0),
    dpAmount: Number(t.dp_amount ?? t.dpAmount ?? 0),
    dpDate: t.dp_date || t.dpDate || undefined,
    dpMethod: t.dp_method || t.dpMethod || undefined,
    dpNote: t.dp_note || t.dpNote || undefined,
    remainingAmount: Number(t.remaining_amount ?? t.remainingAmount ?? 0),
    vaNumber: t.va_number || t.vaNumber || undefined,
    vaAccountName: t.va_account_name || t.vaAccountName || undefined,
    bankName: t.bank_name || t.bankName || undefined,
    bankAccountNumber: t.bank_account_number || t.bankAccountNumber || undefined,
    paymentMethod: t.payment_method || t.paymentMethod || undefined,
    paymentDate: t.payment_date || t.paymentDate || undefined,
    paymentNote: t.payment_note || t.paymentNote || undefined,
    kwitansiNo: t.kwitansi_no || t.kwitansiNo || undefined,
    cancelledAt: t.cancelled_at || t.cancelledAt || undefined,
    cancelReason: t.cancel_reason || t.cancelReason || undefined,
    cancelledUser: t.cancelled_user || t.cancelledUser || undefined,
    extendedCount: Number(t.extended_count ?? t.extendedCount ?? 0),
    extendHistory: t.extend_history || t.extendHistory || []
  };
}

export function mapSupabaseMaintenanceToAppMaintenance(m: any): Maintenance {
  return {
    id: m.id,
    roomId: m.room_id || m.roomId || '',
    building: m.building || '',
    roomNumber: m.room_number || m.roomNumber || '',
    category: m.category || '',
    urgency: m.urgency || 'SEDANG',
    technician: m.technician || '',
    description: m.description || '',
    reportTime: m.report_time || m.reportTime || '',
    status: m.status || 'MENUNGGU_PENUGASAN',
    reportedUser: m.reported_user || m.reportedUser || 'System',
    assignedTechnicianId: m.assigned_technician_id || m.assignedTechnicianId || undefined,
    assignedTechnicianName: m.assigned_technician_name || m.assignedTechnicianName || undefined,
    assignedByManager: m.assigned_by_manager || m.assignedByManager || undefined,
    assignedTime: m.assigned_time || m.assignedTime || undefined,
    managerNotes: m.manager_notes || m.managerNotes || undefined,
    workCompletedTime: m.work_completed_time || m.workCompletedTime || undefined,
    technicianNotes: m.technician_notes || m.technicianNotes || undefined,
    resolvedTime: m.resolved_time || m.resolvedTime || undefined,
    qcInspectionId: m.qc_inspection_id || m.qcInspectionId || undefined,
    qcVerdict: m.qc_verdict || m.qcVerdict || undefined,
    facilityType: m.facility_type || m.facilityType || 'KAMAR'
  };
}

export function mapSupabaseQcToAppQc(q: any): QcInspection {
  return {
    id: q.id,
    roomId: q.room_id || q.roomId || '',
    building: q.building || '',
    roomNumber: q.room_number || q.roomNumber || '',
    inspectorId: q.inspector_id || q.inspectorId || '',
    inspectorName: q.inspector_name || q.inspectorName || '',
    inspectionDate: q.inspection_date || q.inspectionDate || '',
    cleanliness: q.cleanliness || 'BAIK',
    linenBed: q.linen_bed || q.linenBed || 'LENGKAP_BERSIH',
    acElectricity: q.ac_electricity || q.acElectricity || 'NORMAL',
    plumbingWater: q.plumbing_water || q.plumbingWater || 'LANCAR',
    amenities: q.amenities || 'LENGKAP',
    result: q.result || 'LOLOS_QC',
    decisionType: q.decision_type || q.decisionType || undefined,
    notes: q.notes || '',
    maintenanceIdCreated: q.maintenance_id_created || q.maintenanceIdCreated || undefined,
    facilityType: q.facility_type || q.facilityType || 'KAMAR'
  };
}

export function mapSupabaseWorkSessionToAppWorkSession(s: any): WorkSession {
  return {
    id: s.id,
    userId: s.user_id || s.userId || '',
    userName: s.user_name || s.userName || '',
    userRole: s.user_role || s.userRole || '',
    loginTime: s.login_time || s.loginTime || '',
    logoutTime: s.logout_time || s.logoutTime || null,
    durationSeconds: Number(s.duration_seconds ?? s.durationSeconds ?? 0),
    durationFormatted: s.duration_formatted || s.durationFormatted || '0 Jam 0 Menit 0 Detik',
    status: s.status || 'AKTIF',
    notes: s.notes || undefined
  };
}

export function mapSupabaseAuditLogToAppAuditLog(a: any): AuditLog {
  return {
    id: a.id,
    timestamp: a.timestamp || '',
    user: a.user_name || a.user || '',
    role: a.role || '',
    action: a.action || '',
    details: a.details || '',
    durationMinutes: a.duration_minutes ? Number(a.duration_minutes) : (a.durationMinutes ? Number(a.durationMinutes) : undefined),
    verificationCode: a.verification_code || a.verificationCode || undefined,
    documentTitle: a.document_title || a.documentTitle || undefined,
    targetId: a.target_id || a.targetId || undefined,
    signatoryName: a.signatory_name || a.signatoryName || undefined,
    signatoryRole: a.signatory_role || a.signatoryRole || undefined,
    signatoryNip: a.signatory_nip || a.signatoryNip || undefined,
    qrCodeHash: a.qr_code_hash || a.qrCodeHash || undefined,
    hasQrAndSignature: a.has_qr_and_signature !== undefined ? Boolean(a.has_qr_and_signature) : (a.hasQrAndSignature !== undefined ? Boolean(a.hasQrAndSignature) : true)
  };
}

export function mapSupabaseBreakfastOrderToAppBreakfastOrder(o: any): BreakfastOrder {
  return {
    id: o.id,
    roomNumber: o.room_number || o.roomNumber || '',
    building: o.building || '',
    guestName: o.guest_name || o.guestName || '',
    phone: o.phone || '',
    kloter: o.kloter || '',
    transactionId: o.transaction_id || o.transactionId || '',
    menuId: o.menu_id || o.menuId || undefined,
    menuName: o.menu_name || o.menuName || '',
    portions: Number(o.portions || 1),
    days: Number(o.days || 1),
    startDate: o.start_date || o.startDate || undefined,
    deliveryTime: o.delivery_time || o.deliveryTime || undefined,
    status: o.status || 'MENUNGGU',
    notes: o.notes || '',
    dietaryRestriction: o.dietary_restriction || o.dietaryRestriction || undefined,
    pricePerPortion: Number(o.price_per_portion ?? o.pricePerPortion ?? 0),
    totalPrice: Number(o.total_price ?? o.totalPrice ?? 0),
    createdAt: o.created_at || o.createdAt || new Date().toISOString(),
    updatedAt: o.updated_at || o.updatedAt || undefined
  };
}

export function mapSupabaseBreakfastMenuItemToAppMenuItem(m: any): BreakfastMenuItem {
  return {
    id: m.id,
    name: m.name,
    category: m.category,
    price: Number(m.price || 0),
    description: m.description || '',
    isAvailable: m.is_available ?? m.isAvailable ?? true,
    allergens: m.allergens || undefined
  };
}

export function mapSupabaseRoomCapacityRateToAppRate(r: any): RoomCapacityRate {
  return {
    id: r.id,
    roomType: r.room_type || r.roomType,
    bedType: r.bed_type || r.bedType,
    capacityPax: Number(r.capacity_pax ?? r.capacityPax ?? 1),
    pricePerNight: Number(r.price_per_night ?? r.pricePerNight ?? 0),
    description: r.description || undefined,
    facilities: r.facilities || [],
    isActive: r.is_active ?? r.isActive ?? true,
    updatedAt: r.updated_at || r.updatedAt || undefined
  };
}

/**
 * Mengambil seluruh database dari Supabase Cloud
 */
export async function fetchFullDatabaseFromSupabase(): Promise<CompleteStorageDatabase | null> {
  try {
    // 0. Prioritaskan penarikan data dari endpoint Google Sheets Web App yang telah dideploy
    try {
      const sheetDb = await fetchFullDatabaseFromSpreadsheet();
      if (sheetDb && ((sheetDb.rooms && sheetDb.rooms.length > 0) || (sheetDb.buildings && sheetDb.buildings.length > 0) || (sheetDb.users && sheetDb.users.length > 0))) {
        return sheetDb;
      }
    } catch (sheetErr) {
      console.warn('Gagal membaca data dari Google Spreadsheet Web App, mencoba fallback Supabase:', sheetErr);
    }

    // 1. Ambil data users langsung dari tabel Supabase users agar selalu sinkron dengan database
    let directUsers: User[] | null = null;
    try {
      const { data: uData } = await supabase.from('users').select('*');
      if (uData && uData.length > 0) {
        directUsers = uData.map(mapSupabaseUserToAppUser);
      }
    } catch (uErr) {
      console.warn('Gagal membaca tabel users Supabase:', uErr);
    }

    // 2. Ambil dari tabel snapshot terpadu app_database_sync dan tabel-tabel relasional
    const [syncRes, buildingsRes, roomsRes, meetingRoomsRes, transactionsRes, maintenancesRes, qcRes, sessionsRes, auditRes, breakfastMenuRes, breakfastOrdersRes, ratesRes, pwdRes, settingsRes] = await Promise.all([
      supabase.from('app_database_sync').select('database_payload, updated_at').eq('id', 'main_production_db').maybeSingle(),
      supabase.from('buildings').select('*'),
      supabase.from('rooms').select('*'),
      supabase.from('meeting_rooms').select('*'),
      supabase.from('transactions').select('*'),
      supabase.from('maintenances').select('*'),
      supabase.from('qc_inspections').select('*'),
      supabase.from('work_sessions').select('*'),
      supabase.from('audit_logs').select('*'),
      supabase.from('breakfast_menu_items').select('*'),
      supabase.from('breakfast_orders').select('*'),
      supabase.from('room_capacity_rates').select('*'),
      supabase.from('password_reset_requests').select('*'),
      supabase.from('app_settings').select('*').maybeSingle()
    ]);

    const syncPayload = (!syncRes.error && syncRes.data && syncRes.data.database_payload)
      ? (syncRes.data.database_payload as CompleteStorageDatabase)
      : null;

    const relBuildings = (buildingsRes.data || []).map(mapSupabaseBuildingToAppBuilding);
    const relRooms = (roomsRes.data || []).map(mapSupabaseRoomToAppRoom);
    const relMeetingRooms = (meetingRoomsRes.data || []).map(mapSupabaseMeetingRoomToAppMeetingRoom);
    const relTransactions = (transactionsRes.data || []).map(mapSupabaseTransactionToAppTransaction);
    const relMaintenances = (maintenancesRes.data || []).map(mapSupabaseMaintenanceToAppMaintenance);
    const relQc = (qcRes.data || []).map(mapSupabaseQcToAppQc);
    const relSessions = (sessionsRes.data || []).map(mapSupabaseWorkSessionToAppWorkSession);
    const relAudit = (auditRes.data || []).map(mapSupabaseAuditLogToAppAuditLog);
    const relMenu = (breakfastMenuRes.data || []).map(mapSupabaseBreakfastMenuItemToAppMenuItem);
    const relOrders = (breakfastOrdersRes.data || []).map(mapSupabaseBreakfastOrderToAppBreakfastOrder);
    const relRates = ratesRes.data && ratesRes.data.length > 0
      ? deduplicateRoomCapacityRates(ratesRes.data.map(mapSupabaseRoomCapacityRateToAppRate))
      : (syncPayload?.roomCapacityRates || initialRoomCapacityRates);

    // Cek apakah server Supabase berhasil dihubungi (bukan kegagalan koneksi total)
    const isSupabaseReachable = !buildingsRes.error || !roomsRes.error || !transactionsRes.error || !syncRes.error;
    if (!isSupabaseReachable) {
      return null;
    }

    // PRIORITASKAN TABEL RELASIONAL SUPABASE SECARA LANGSUNG SEBAGAI SINGLE SOURCE OF TRUTH:
    // Aksi CRUD (tambah, edit nama gedung, hapus) langsung membaca tabel database Supabase
    // sehingga perubahan di database akan langsung terlihat dan tidak pernah ter-reset oleh snapshot usang.
    const mergedBuildings = !buildingsRes.error
      ? relBuildings
      : (Array.isArray(syncPayload?.buildings) ? syncPayload.buildings : []);

    const mergedMeetingRooms = !meetingRoomsRes.error
      ? relMeetingRooms
      : (Array.isArray(syncPayload?.meetingRooms) ? syncPayload.meetingRooms : []);

    const mergedTransactions = !transactionsRes.error
      ? relTransactions
      : (Array.isArray(syncPayload?.transactions) ? syncPayload.transactions : []);

    const mergedMaintenances = !maintenancesRes.error
      ? relMaintenances
      : (Array.isArray(syncPayload?.maintenances) ? syncPayload.maintenances : []);

    const mergedRooms = !roomsRes.error
      ? deduplicateRoomsByBuildingAndNumber(relRooms, mergedMeetingRooms)
      : (Array.isArray(syncPayload?.rooms) ? deduplicateRoomsByBuildingAndNumber(syncPayload.rooms, mergedMeetingRooms) : []);

    const mergedQc = !qcRes.error
      ? relQc
      : (Array.isArray(syncPayload?.qcInspections) ? syncPayload.qcInspections : []);

    const mergedAudit = !auditRes.error
      ? relAudit
      : (Array.isArray(syncPayload?.auditLogs) ? syncPayload.auditLogs.slice(0, 300) : []);

    const mergedUsers = (directUsers !== null && directUsers !== undefined)
      ? directUsers
      : (syncPayload?.users && syncPayload.users.length > 0 ? syncPayload.users : initialUsers);

    const mergedOrders = !breakfastOrdersRes.error
      ? relOrders
      : (Array.isArray(syncPayload?.breakfastOrders) ? syncPayload.breakfastOrders : []);

    const mergedMenu = !breakfastMenuRes.error
      ? relMenu
      : (Array.isArray(syncPayload?.breakfastMenuItems) && syncPayload.breakfastMenuItems.length > 0 ? syncPayload.breakfastMenuItems : initialBreakfastMenuItems);

    const mergedRates = !ratesRes.error
      ? relRates
      : (Array.isArray(syncPayload?.roomCapacityRates) && syncPayload.roomCapacityRates.length > 0 ? deduplicateRoomCapacityRates(syncPayload.roomCapacityRates) : initialRoomCapacityRates);

    // Gabungkan workSessions dari syncPayload dan tabel relasional work_sessions secara aman (mendukung banyak akun aktif bersamaan)
    const sessionMap = new Map<string, WorkSession>();
    for (const s of [...relSessions, ...(syncPayload?.workSessions || [])]) {
      if (!s || !s.id) continue;
      const existing = sessionMap.get(s.id);
      if (!existing) {
        sessionMap.set(s.id, s);
      } else {
        // Jika salah satu sudah SELESAI (sudah checkout), pertahankan status SELESAI
        if (existing.status === 'SELESAI' && s.status !== 'SELESAI') {
          continue;
        } else if (s.status === 'SELESAI' && existing.status !== 'SELESAI') {
          sessionMap.set(s.id, s);
        } else {
          // Keduanya AKTIF atau keduanya SELESAI: ambil durasi yang lebih mutakhir
          sessionMap.set(s.id, (s.durationSeconds || 0) >= (existing.durationSeconds || 0) ? { ...existing, ...s } : { ...s, ...existing });
        }
      }
    }
    const mergedWorkSessions = Array.from(sessionMap.values()).sort((a, b) => (b.loginTime || '').localeCompare(a.loginTime || ''));

    // Gabungkan chatChannels agar grup divisi default selalu tersedia bersama grup kustom & chat pribadi (DIRECT)
    const channelMap = new Map<string, ChatChannel>();
    for (const ch of initialChatChannels) {
      channelMap.set(ch.id, { ...ch });
    }
    for (const ch of (syncPayload?.chatChannels || [])) {
      if (!ch || !ch.id) continue;
      const existing = channelMap.get(ch.id);
      channelMap.set(ch.id, existing ? { ...existing, ...ch } : ch);
    }
    const mergedChatChannels = Array.from(channelMap.values());

    // Deduplikasi pesan chat berdasarkan id dan urutkan secara kronologis
    const msgMap = new Map<string, ChatMessage>();
    for (const m of (syncPayload?.chatMessages || [])) {
      if (!m || !m.id) continue;
      const existing = msgMap.get(m.id);
      if (!existing) {
        msgMap.set(m.id, m);
      } else {
        const readSet = new Set([...(existing.readBy || []), ...(m.readBy || [])]);
        msgMap.set(m.id, { ...existing, ...m, readBy: Array.from(readSet) });
      }
    }
    const mergedChatMessages = Array.from(msgMap.values());

    // Pemetaan akurat pengaturan aplikasi (snake_case dari Supabase ke camelCase aplikasi)
    let finalAppSettings = syncPayload?.appSettings;
    if (settingsRes.data) {
      const s = settingsRes.data as any;
      finalAppSettings = {
        organizationName: s.organization_name || s.organizationName || finalAppSettings?.organizationName || 'ASRAMA HAJI JAKARTA',
        subTitle: s.sub_title || s.subTitle || finalAppSettings?.subTitle || 'Sistem Informasi Manajemen Operasional',
        ministryName: s.ministry_name || s.ministryName || finalAppSettings?.ministryName || 'KEMENTERIAN HAJI DAN UMRAH REPUBLIK INDONESIA',
        address: s.address || finalAppSettings?.address || '',
        phone: s.phone || finalAppSettings?.phone || '',
        email: s.email || finalAppSettings?.email || '',
        portalUrl: s.portal_url || s.portalUrl || finalAppSettings?.portalUrl || '',
        appLogo: s.app_logo || s.appLogo || finalAppSettings?.appLogo || undefined,
        appFavicon: s.app_favicon || s.appFavicon || finalAppSettings?.appFavicon || undefined,
        tagTitle: s.tag_title || s.tagTitle || finalAppSettings?.tagTitle || undefined,
        updatedAt: s.updated_at || finalAppSettings?.updatedAt || undefined
      };
    }

    const resultDb: CompleteStorageDatabase = {
      schemaVersion: 4,
      appName: syncPayload?.appName || 'SIM Asrama Haji Jakarta',
      exportedAt: new Date().toISOString(),
      appSettings: finalAppSettings,
      users: mergedUsers,
      buildings: mergedBuildings,
      rooms: mergedRooms,
      meetingRooms: mergedMeetingRooms,
      transactions: mergedTransactions,
      maintenances: mergedMaintenances,
      qcInspections: mergedQc,
      workSessions: mergedWorkSessions,
      auditLogs: mergedAudit,
      chatChannels: mergedChatChannels,
      chatMessages: mergedChatMessages,
      breakfastMenuItems: relMenu.length > 0 ? relMenu : (syncPayload?.breakfastMenuItems || []),
      breakfastOrders: mergedOrders,
      roomCapacityRates: relRates,
      passwordResetRequests: pwdRes.data || syncPayload?.passwordResetRequests || []
    };

    // Pastikan app_database_sync (main_production_db & root_snapshot) selalu selaras dengan tabel relasional
    try {
      supabase.from('app_database_sync').upsert([
        { id: 'main_production_db', database_payload: resultDb, updated_at: new Date().toISOString() },
        { id: 'root_snapshot', database_payload: resultDb, updated_at: new Date().toISOString() }
      ], { onConflict: 'id' }).then(() => {});
    } catch (_) {}

    return resultDb;
  } catch (e) {
    console.warn('Gagal membaca data dari Supabase:', e);
    return null;
  }
}

/**
 * Simpan seluruh database ke Supabase dengan penggabungan aman untuk sesi kerja & chat multi-akun
 */
export async function syncFullDatabaseToSupabase(db: CompleteStorageDatabase): Promise<{ success: boolean; error?: string }> {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { success: false, error: 'Kredensial Supabase tidak ditemukan' };
    }

    // Ambil snapshot saat ini di cloud agar sesi kerja & pesan chat dari akun/perangkat lain tidak tertimpa
    let payloadToSave: CompleteStorageDatabase = db;
    try {
      const { data: existingSync } = await supabase
        .from('app_database_sync')
        .select('database_payload')
        .eq('id', 'main_production_db')
        .maybeSingle();

      if (existingSync?.database_payload) {
        const remote = existingSync.database_payload as CompleteStorageDatabase;

        // 1. Gabungkan workSessions lintas akun
        const wsMap = new Map<string, WorkSession>();
        for (const s of (remote.workSessions || [])) {
          if (s && s.id) wsMap.set(s.id, s);
        }
        for (const s of (db.workSessions || [])) {
          if (!s || !s.id) continue;
          const prev = wsMap.get(s.id);
          if (!prev) {
            wsMap.set(s.id, s);
          } else if (prev.status === 'SELESAI' && s.status !== 'SELESAI') {
            wsMap.set(s.id, prev);
          } else if (s.status === 'SELESAI' && prev.status !== 'SELESAI') {
            wsMap.set(s.id, s);
          } else {
            wsMap.set(s.id, (s.durationSeconds || 0) >= (prev.durationSeconds || 0) ? { ...prev, ...s } : { ...s, ...prev });
          }
        }

        // 2. Gabungkan chatChannels lintas akun
        const chMap = new Map<string, ChatChannel>();
        for (const ch of initialChatChannels) chMap.set(ch.id, { ...ch });
        for (const ch of (remote.chatChannels || [])) {
          if (ch && ch.id) chMap.set(ch.id, { ...(chMap.get(ch.id) || {}), ...ch });
        }
        for (const ch of (db.chatChannels || [])) {
          if (ch && ch.id) chMap.set(ch.id, { ...(chMap.get(ch.id) || {}), ...ch });
        }

        // 3. Gabungkan chatMessages lintas akun
        const msgMap = new Map<string, ChatMessage>();
        for (const m of (remote.chatMessages || [])) {
          if (m && m.id) msgMap.set(m.id, m);
        }
        for (const m of (db.chatMessages || [])) {
          if (!m || !m.id) continue;
          const prev = msgMap.get(m.id);
          if (!prev) {
            msgMap.set(m.id, m);
          } else {
            const readSet = new Set([...(prev.readBy || []), ...(m.readBy || [])]);
            msgMap.set(m.id, { ...prev, ...m, readBy: Array.from(readSet) });
          }
        }

        payloadToSave = {
          ...db,
          workSessions: Array.from(wsMap.values()).sort((a, b) => (b.loginTime || '').localeCompare(a.loginTime || '')),
          chatChannels: Array.from(chMap.values()),
          chatMessages: Array.from(msgMap.values()),
        };
      }
    } catch (_) {}

    // 1. Simpan snapshot terpadu ke app_database_sync (cepat, atomic, dan menjamin relasi utuh)
    const { error: syncError } = await supabase
      .from('app_database_sync')
      .upsert([
        { id: 'main_production_db', database_payload: payloadToSave, updated_at: new Date().toISOString() },
        { id: 'root_snapshot', database_payload: payloadToSave, updated_at: new Date().toISOString() }
      ], { onConflict: 'id' });

    if (syncError && syncError.code !== '42P01') {
      console.warn('Peringatan saat upsert app_database_sync:', syncError.message);
    }

    // 2. Simpan juga ke tabel-tabel individual jika tabel sudah dibuat
    await syncIndividualTables(payloadToSave).catch(err => {
      console.warn('Sync individual tables info/warning:', err?.message);
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error syncing to Supabase:', err);
    return { success: false, error: err?.message || 'Sync error' };
  }
}

/**
 * Sinkronisasi data ke tabel-tabel individual Supabase (upsert batch)
 */
async function syncIndividualTables(db: CompleteStorageDatabase) {
  // Simpan settings
  if (db.appSettings) {
    const fullSettingsPayload = {
      id: 'default',
      organization_name: db.appSettings.organizationName,
      sub_title: db.appSettings.subTitle,
      ministry_name: db.appSettings.ministryName,
      address: db.appSettings.address,
      phone: db.appSettings.phone,
      email: db.appSettings.email,
      portal_url: db.appSettings.portalUrl,
      app_logo: db.appSettings.appLogo || null,
      app_favicon: db.appSettings.appFavicon || null,
      tag_title: db.appSettings.tagTitle || null,
      updated_at: new Date().toISOString()
    };
    const { error: setErr } = await supabase.from('app_settings').upsert(fullSettingsPayload, { onConflict: 'id' });
    if (setErr && (setErr.message.includes('column') || setErr.code === 'PGRST204')) {
      // Fallback tanpa kolom baru
      const { app_favicon, tag_title, ...baseSettingsPayload } = fullSettingsPayload;
      await supabase.from('app_settings').upsert(baseSettingsPayload, { onConflict: 'id' });
    }
  }

  // Simpan users
  if (db.users && db.users.length > 0) {
    const userPayloads = db.users.map(u => ({
      id: u.id,
      username: u.username,
      full_name: u.fullName,
      role: u.role,
      password: u.password,
      department: u.department,
      supervisor_id: u.supervisorId || null,
      assigned_building: u.assignedBuilding || null,
      phone: u.phone || null,
      status: u.status || 'Aktif',
      email: u.email || null,
      nip: u.nip || null,
      is_owner: Boolean(u.isOwner),
      signature_url: u.signatureUrl || null,
      qr_code_url: u.qrCodeUrl || null,
      signature_history: u.signatureHistory || []
    }));
    
    const { error: uErr } = await supabase.from('users').upsert(userPayloads, { onConflict: 'id' });
    if (uErr && (uErr.message.includes('column') || uErr.code === 'PGRST204')) {
      // Fallback ke kolom standar jika skema SQL belum di-alter di dashboard
      const fallbackUserPayloads = db.users.map(u => ({
        id: u.id,
        username: u.username,
        full_name: u.fullName,
        role: u.role,
        password: u.password,
        department: u.department,
        supervisor_id: u.supervisorId || null,
        assigned_building: u.assignedBuilding || null,
        phone: u.phone || null,
        status: u.status || 'Aktif',
        email: u.email || null,
        is_owner: Boolean(u.isOwner)
      }));
      await supabase.from('users').upsert(fallbackUserPayloads, { onConflict: 'id' });
    }
  }

  // Simpan buildings
  if (Array.isArray(db.buildings)) {
    if (db.buildings.length > 0) {
      const bldPayloads = db.buildings.map(b => ({
        id: b.id,
        name: b.name,
        code: b.code || null,
        floors: Number(b.floors) || 1,
        total_rooms: Number(b.totalRooms) || 0,
        capacity_desc: b.capacityDesc || null,
        category: b.category || 'PENGINAPAN',
        description: b.description || null,
        status: b.status || 'AKTIF'
      }));
      await supabase.from('buildings').upsert(bldPayloads, { onConflict: 'id' });
    }
    try {
      const activeIds = db.buildings.map(b => b.id).filter(Boolean);
      const { data: existingRows } = await supabase.from('buildings').select('id');
      if (existingRows && existingRows.length > 0) {
        const toDelete = existingRows.map(r => r.id).filter(id => !activeIds.includes(id));
        if (toDelete.length > 0) {
          await supabase.from('buildings').delete().in('id', toDelete);
        }
      }
    } catch (_) {}
  }

  // Simpan rooms
  if (Array.isArray(db.rooms)) {
    if (db.rooms.length > 0) {
      const roomPayloads = db.rooms.map(r => ({
        id: r.id,
        building: r.building,
        room_number: r.roomNumber,
        floor: Number(r.floor) || 1,
        type: r.type || 'Standar',
        bed_type: r.bedType || null,
        capacity: r.capacity || '',
        capacity_number: Number(r.capacityNumber) || null,
        status: r.status || 'KOSONG',
        qc_status: r.qcStatus || 'LOLOS_QC',
        last_qc_date: r.lastQcDate || null,
        last_qc_by: r.lastQcBy || null,
        last_qc_notes: r.lastQcNotes || null,
        active_tx_id: r.activeTxId || null,
        active_maint_id: r.activeMaintId || null,
        price_per_night: Number(r.pricePerNight) || 0,
        facilities: Array.isArray(r.facilities) ? r.facilities : []
      }));
      await supabase.from('rooms').upsert(roomPayloads, { onConflict: 'id' });
    }
    try {
      const activeIds = db.rooms.map(r => r.id).filter(Boolean);
      const { data: existingRows } = await supabase.from('rooms').select('id');
      if (existingRows && existingRows.length > 0) {
        const toDelete = existingRows.map(r => r.id).filter(id => !activeIds.includes(id));
        if (toDelete.length > 0) {
          await supabase.from('rooms').delete().in('id', toDelete);
        }
      }
    } catch (_) {}
  }

  // Simpan meeting rooms
  if (Array.isArray(db.meetingRooms)) {
    if (db.meetingRooms.length > 0) {
      const mrPayloads = db.meetingRooms.map(m => ({
        id: m.id,
        name: m.name,
        code: m.code,
        building: m.building,
        capacity: m.capacity,
        capacity_number: m.capacityNumber,
        facilities: m.facilities,
        daily_rate: m.dailyRate,
        session_rate: m.sessionRate,
        description: m.description,
        status: m.status,
        qc_status: m.qcStatus,
        active_tx_id: m.activeTxId
      }));
      await supabase.from('meeting_rooms').upsert(mrPayloads, { onConflict: 'id' });
    }
    try {
      const activeIds = db.meetingRooms.map(m => m.id).filter(Boolean);
      const { data: existingRows } = await supabase.from('meeting_rooms').select('id');
      if (existingRows && existingRows.length > 0) {
        const toDelete = existingRows.map(r => r.id).filter(id => !activeIds.includes(id));
        if (toDelete.length > 0) {
          await supabase.from('meeting_rooms').delete().in('id', toDelete);
        }
      }
    } catch (_) {}
  }

  // Simpan transactions
  if (Array.isArray(db.transactions)) {
    if (db.transactions.length > 0) {
      const txPayloads = db.transactions.map(t => ({
        id: t.id,
        room_id: t.roomId,
        building: t.building,
        room_number: t.roomNumber,
        category: t.category,
        guest_name: t.guestName,
        guest_type: t.guestType,
        nik_ktp: t.nikKtp,
        kloter: t.kloter,
        start_date: t.startDate,
        duration: t.duration,
        phone: t.phone,
        notes: t.notes,
        status: t.status,
        created_user: t.createdUser,
        is_group: t.isGroup,
        group_type: t.groupType,
        group_name: t.groupName,
        group_pic: t.groupPic,
        group_pic_phone: t.groupPicPhone,
        group_id: t.groupId,
        total_pax: t.totalPax,
        include_aula: t.includeAula,
        rent_aula_id: t.rentAulaId,
        rent_aula_name: t.rentAulaName,
        catering_package: t.cateringPackage,
        catering_pax_count: t.cateringPaxCount,
        spk_number: t.spkNumber,
        allocated_room_numbers: t.allocatedRoomNumbers,
        allocated_rooms_count: t.allocatedRoomsCount,
        breakfast: t.breakfast,
        breakfast_menu: t.breakfastMenu,
        breakfast_portions: t.breakfastPortions,
        breakfast_days: t.breakfastDays,
        breakfast_status: t.breakfastStatus,
        rent_type: t.rentType,
        duration_unit: t.durationUnit,
        extra_bed: t.extraBed,
        extra_bed_count: t.extraBedCount,
        extra_bed_price: t.extraBedPrice || 0,
        extra_bed_notes: t.extraBedNotes || null,
        agency_or_document: t.agencyOrDocument || null,
        price_per_night: t.pricePerNight || 0,
        payment_status: t.paymentStatus || 'BELUM_LUNAS',
        paid_amount: t.paidAmount || 0,
        dp_amount: t.dpAmount || 0,
        dp_date: t.dpDate || null,
        dp_method: t.dpMethod || null,
        dp_note: t.dpNote || null,
        remaining_amount: t.remainingAmount || 0,
        va_number: t.vaNumber || null,
        va_account_name: t.vaAccountName || null,
        bank_name: t.bankName || null,
        bank_account_number: t.bankAccountNumber || null,
        payment_method: t.paymentMethod || null,
        payment_date: t.paymentDate || null,
        payment_note: t.paymentNote || null,
        kwitansi_no: t.kwitansiNo || null,
        cancelled_at: t.cancelledAt || null,
        cancel_reason: t.cancelReason || null,
        cancelled_user: t.cancelledUser || null,
        extend_history: t.extendHistory || [],
        check_in_time: t.checkInTime,
        check_out_time: t.checkOutTime
      }));
      await supabase.from('transactions').upsert(txPayloads, { onConflict: 'id' });
      try {
        const activeIds = db.transactions.map(t => t.id).filter(Boolean);
        const { data: existingRows } = await supabase.from('transactions').select('id');
        if (existingRows && existingRows.length > 0) {
          const toDelete = existingRows.map(r => r.id).filter(id => !activeIds.includes(id));
          if (toDelete.length > 0) {
            await supabase.from('transactions').delete().in('id', toDelete);
          }
        }
      } catch (_) {}
    } else {
      // Jika data transaksi kosong, bersihkan seluruh baris dari tabel transactions Supabase
      try {
        await supabase.from('transactions').delete().neq('id', '___NEVER___');
      } catch (_) {}
    }
  }

  // Simpan maintenances
  if (Array.isArray(db.maintenances)) {
    if (db.maintenances.length > 0) {
      const maintPayloads = db.maintenances.map(m => ({
        id: m.id,
        room_id: m.roomId,
        building: m.building,
        room_number: m.roomNumber,
        category: m.category,
        urgency: m.urgency,
        technician: m.technician,
        description: m.description,
        report_time: m.reportTime,
        status: m.status,
        reported_user: m.reportedUser,
        assigned_technician_id: m.assignedTechnicianId,
        assigned_technician_name: m.assignedTechnicianName,
        assigned_by_manager: m.assignedByManager,
        assigned_time: m.assignedTime,
        manager_notes: m.managerNotes,
        work_completed_time: m.workCompletedTime,
        technician_notes: m.technicianNotes,
        resolved_time: m.resolvedTime,
        qc_inspection_id: m.qcInspectionId,
        facility_type: m.facilityType
      }));
      await supabase.from('maintenances').upsert(maintPayloads, { onConflict: 'id' });
      try {
        const activeIds = db.maintenances.map(m => m.id).filter(Boolean);
        const { data: existingRows } = await supabase.from('maintenances').select('id');
        if (existingRows && existingRows.length > 0) {
          const toDelete = existingRows.map(r => r.id).filter(id => !activeIds.includes(id));
          if (toDelete.length > 0) {
            await supabase.from('maintenances').delete().in('id', toDelete);
          }
        }
      } catch (_) {}
    } else {
      try {
        await supabase.from('maintenances').delete().neq('id', '___NEVER___');
      } catch (_) {}
    }
  }

  // Simpan QC inspections
  if (Array.isArray(db.qcInspections)) {
    if (db.qcInspections.length > 0) {
      const qcPayloads = db.qcInspections.map(q => ({
        id: q.id,
        room_id: q.roomId,
        building: q.building,
        room_number: q.roomNumber,
        inspector_id: q.inspectorId,
        inspector_name: q.inspectorName,
        inspection_date: q.inspectionDate,
        cleanliness: q.cleanliness,
        linen_bed: q.linenBed,
        ac_electricity: q.acElectricity,
        plumbing_water: q.plumbingWater,
        amenities: q.amenities,
        result: q.result,
        decision_type: q.decisionType || null,
        notes: q.notes,
        facility_type: q.facilityType
      }));
      await supabase.from('qc_inspections').upsert(qcPayloads, { onConflict: 'id' });
      try {
        const activeIds = db.qcInspections.map(q => q.id).filter(Boolean);
        const { data: existingRows } = await supabase.from('qc_inspections').select('id');
        if (existingRows && existingRows.length > 0) {
          const toDelete = existingRows.map(r => r.id).filter(id => !activeIds.includes(id));
          if (toDelete.length > 0) {
            await supabase.from('qc_inspections').delete().in('id', toDelete);
          }
        }
      } catch (_) {}
    } else {
      try {
        await supabase.from('qc_inspections').delete().neq('id', '___NEVER___');
      } catch (_) {}
    }
  }

  // Simpan Breakfast items
  if (Array.isArray(db.breakfastMenuItems)) {
    if (db.breakfastMenuItems.length > 0) {
      const menuPayloads = db.breakfastMenuItems.map(m => ({
        id: m.id,
        name: m.name,
        category: m.category,
        price: m.price,
        description: m.description,
        is_available: m.isAvailable,
        allergens: m.allergens
      }));
      await supabase.from('breakfast_menu_items').upsert(menuPayloads, { onConflict: 'id' });
      try {
        const activeIds = db.breakfastMenuItems.map(m => m.id).filter(Boolean);
        const { data: existingRows } = await supabase.from('breakfast_menu_items').select('id');
        if (existingRows && existingRows.length > 0) {
          const toDelete = existingRows.map(r => r.id).filter(id => !activeIds.includes(id));
          if (toDelete.length > 0) {
            await supabase.from('breakfast_menu_items').delete().in('id', toDelete);
          }
        }
      } catch (_) {}
    }
  }

  // Simpan Breakfast orders
  if (Array.isArray(db.breakfastOrders)) {
    if (db.breakfastOrders.length > 0) {
      const orderPayloads = db.breakfastOrders.map(o => ({
        id: o.id,
        room_number: o.roomNumber,
        building: o.building,
        guest_name: o.guestName,
        phone: o.phone,
        kloter: o.kloter,
        transaction_id: o.transactionId,
        menu_name: o.menuName,
        portions: o.portions,
        days: o.days,
        start_date: o.startDate,
        delivery_time: o.deliveryTime,
        status: o.status,
        notes: o.notes,
        price_per_portion: o.pricePerPortion,
        total_price: o.totalPrice
      }));
      await supabase.from('breakfast_orders').upsert(orderPayloads, { onConflict: 'id' });
      try {
        const activeIds = db.breakfastOrders.map(o => o.id).filter(Boolean);
        const { data: existingRows } = await supabase.from('breakfast_orders').select('id');
        if (existingRows && existingRows.length > 0) {
          const toDelete = existingRows.map(r => r.id).filter(id => !activeIds.includes(id));
          if (toDelete.length > 0) {
            await supabase.from('breakfast_orders').delete().in('id', toDelete);
          }
        }
      } catch (_) {}
    } else {
      try {
        await supabase.from('breakfast_orders').delete().neq('id', '___NEVER___');
      } catch (_) {}
    }
  }

  // Simpan Audit Logs & PDF Download Logs
  if (Array.isArray(db.auditLogs)) {
    if (db.auditLogs.length > 0) {
      const auditPayloads = db.auditLogs.map((a, i) => ({
        id: a.id || `audit-${i}-${Date.now()}`,
        timestamp: a.timestamp,
        user_name: a.user,
        role: a.role,
        action: a.action,
        details: a.details,
        verification_code: a.verificationCode || null,
        document_title: a.documentTitle || null,
        target_id: a.targetId || null,
        signatory_name: a.signatoryName || null,
        signatory_role: a.signatoryRole || null,
        signatory_nip: a.signatoryNip || null,
        qr_code_hash: a.qrCodeHash || null,
        has_qr_and_signature: a.hasQrAndSignature !== false
      }));
      await supabase.from('audit_logs').upsert(auditPayloads, { onConflict: 'id' });

      // Filter yang bertipe unduh PDF ber-QR & TTD sah untuk tabel cepat pdf_download_logs
      const pdfLogs = db.auditLogs
        .filter(a => 
          a.action === 'UNDUH_PDF_BER_QR' && 
          Boolean(a.verificationCode) && 
          a.hasQrAndSignature !== false && 
          Boolean(a.signatoryName && !a.signatoryName.includes('Belum Ada'))
        )
        .map(p => ({
          id: p.id || `vlog-${Date.now()}`,
          verification_code: p.verificationCode,
          timestamp: p.timestamp,
          user_name: p.user,
          role: p.role,
          document_title: p.documentTitle || p.details,
          target_id: p.targetId || null,
          signatory_name: p.signatoryName || null,
          signatory_role: p.signatoryRole || null,
          signatory_nip: p.signatoryNip || null,
          qr_code_hash: p.qrCodeHash || null,
          has_qr_and_signature: true
        }));
      if (pdfLogs.length > 0) {
        await supabase.from('pdf_download_logs').upsert(pdfLogs, { onConflict: 'verification_code' });
      }
    } else {
      try {
        await supabase.from('audit_logs').delete().neq('id', '___NEVER___');
      } catch (_) {}
    }
  }

  // Simpan Work Sessions (Rekap Sesi & Jam Kerja Shift - Non-Destructive untuk Multi-Akun)
  if (Array.isArray(db.workSessions) && db.workSessions.length > 0) {
    const sessionPayloads = db.workSessions.map(s => ({
      id: s.id,
      user_id: s.userId,
      user_name: s.userName,
      user_role: s.userRole,
      login_time: s.loginTime,
      logout_time: s.logoutTime || null,
      duration_seconds: s.durationSeconds || 0,
      duration_formatted: s.durationFormatted || '0 Jam 0 Menit 0 Detik',
      status: s.status || 'AKTIF',
      notes: s.notes || null
    }));
    await supabase.from('work_sessions').upsert(sessionPayloads, { onConflict: 'id' });
  }

  // Simpan Permohonan Reset Password (password_reset_requests)
  if (Array.isArray(db.passwordResetRequests)) {
    if (db.passwordResetRequests.length > 0) {
      const pwdPayloads = db.passwordResetRequests.map(p => ({
        id: p.id,
        user_id: p.userId,
        username: p.username,
        full_name: p.fullName,
        role: p.role,
        new_password: p.newPassword,
        request_date: p.requestDate,
        status: p.status || 'MENUNGGU_PERSETUJUAN',
        notes: p.notes || null,
        processed_by: p.processedBy || null,
        processed_at: p.processedAt || null
      }));
      await supabase.from('password_reset_requests').upsert(pwdPayloads, { onConflict: 'id' });
      try {
        const activeIds = db.passwordResetRequests.map(p => p.id).filter(Boolean);
        const { data: existingRows } = await supabase.from('password_reset_requests').select('id');
        if (existingRows && existingRows.length > 0) {
          const toDelete = existingRows.map(r => r.id).filter(id => !activeIds.includes(id));
          if (toDelete.length > 0) {
            await supabase.from('password_reset_requests').delete().in('id', toDelete);
          }
        }
      } catch (_) {}
    } else {
      try {
        await supabase.from('password_reset_requests').delete().neq('id', '___NEVER___');
      } catch (_) {}
    }
  }

  // Simpan Master Tarif Kapasitas Kamar (room_capacity_rates)
  if (db.roomCapacityRates) {
    const cleanRates = deduplicateRoomCapacityRates(db.roomCapacityRates);
    if (cleanRates.length > 0) {
      const ratePayloads = cleanRates.map(r => ({
        id: r.id,
        room_type: r.roomType,
        bed_type: r.bedType,
        capacity_pax: r.capacityPax,
        price_per_night: r.pricePerNight,
        description: r.description || null,
        facilities: r.facilities || [],
        is_active: r.isActive ?? true,
        updated_at: r.updatedAt || new Date().toISOString()
      }));
      await supabase.from('room_capacity_rates').upsert(ratePayloads, { onConflict: 'id' });
    }

    // Hapus dari Supabase row tarif kamar yang sudah dihapus oleh pengguna
    try {
      const activeRateIds = db.roomCapacityRates.map(r => r.id);
      const { data: existingRates } = await supabase.from('room_capacity_rates').select('id');
      if (existingRates && existingRates.length > 0) {
        const toDelete = existingRates.map(r => r.id).filter(id => !activeRateIds.includes(id));
        if (toDelete.length > 0) {
          await supabase.from('room_capacity_rates').delete().in('id', toDelete);
        }
      }
    } catch (delErr) {
      console.warn('Gagal membersihkan rate terhapus di Supabase:', delErr);
    }
  }
}

/**
 * Catat log unduh PDF ber-QR langsung ke Supabase (audit_logs & pdf_download_logs)
 */
export async function recordPdfDownloadLogToSupabase(log: AuditLog): Promise<boolean> {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;

    const auditPayload = {
      id: log.id || `audit-${Date.now()}`,
      timestamp: log.timestamp,
      user_name: log.user,
      role: log.role,
      action: log.action,
      details: log.details,
      verification_code: log.verificationCode || null,
      document_title: log.documentTitle || null,
      target_id: log.targetId || null,
      signatory_name: log.signatoryName || null,
      signatory_role: log.signatoryRole || null,
      signatory_nip: log.signatoryNip || null,
      qr_code_hash: log.qrCodeHash || null,
      has_qr_and_signature: log.hasQrAndSignature !== false
    };

    await supabase.from('audit_logs').upsert([auditPayload], { onConflict: 'id' });

    // Hanya masukkan ke tabel pdf_download_logs jika benar-benar memiliki QR & TTD sah
    if (
      log.action === 'UNDUH_PDF_BER_QR' && 
      log.verificationCode && 
      log.hasQrAndSignature !== false &&
      log.signatoryName && 
      !log.signatoryName.includes('Belum Ada')
    ) {
      await supabase.from('pdf_download_logs').upsert([{
        id: log.id || `vlog-${Date.now()}`,
        verification_code: log.verificationCode,
        timestamp: log.timestamp,
        user_name: log.user,
        role: log.role,
        document_title: log.documentTitle || log.details,
        target_id: log.targetId || null,
        signatory_name: log.signatoryName || null,
        signatory_role: log.signatoryRole || null,
        signatory_nip: log.signatoryNip || null,
        qr_code_hash: log.qrCodeHash || null,
        has_qr_and_signature: true
      }], { onConflict: 'verification_code' });
    }

    return true;
  } catch (err) {
    console.warn('Gagal mencatat log unduh PDF ke Supabase:', err);
    return false;
  }
}

/**
 * Verifikasi keaslian dokumen PDF / QR Code langsung terhadap Supabase Database
 */
export async function verifyDocumentFromSupabase(queryCode: string): Promise<{
  found: boolean;
  source: 'pdf_download_logs' | 'audit_logs' | 'users' | 'not_found';
  data?: any;
}> {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { found: false, source: 'not_found' };

    const rawClean = queryCode.trim();
    if (!rawClean) return { found: false, source: 'not_found' };

    // Bersihkan nama file jika berformat duplikat unduhan browser (contoh: "Laporan_Audit_Log (2).pdf" -> "Laporan_Audit_Log.pdf")
    const cleanFile = rawClean
      .replace(/\s*\(\d+\)\.pdf$/i, '.pdf')
      .replace(/\s*-\s*copy\s*(\d*)\.pdf$/i, '.pdf')
      .replace(/_\d+\.pdf$/i, '.pdf')
      .trim();
    const cleanBase = cleanFile.replace(/\.pdf$/i, '').trim();

    // 1. Cek di tabel pdf_download_logs (Database resmi Log Unduh PDF Ber-QR)
    const { data: pdfLog } = await supabase
      .from('pdf_download_logs')
      .select('*')
      .or(`verification_code.ilike.%${rawClean}%,verification_code.ilike.%${cleanFile}%,target_id.ilike.%${cleanFile}%,target_id.ilike.%${rawClean}%,document_title.ilike.%${cleanBase}%`)
      .limit(1)
      .maybeSingle();

    if (pdfLog) {
      return { found: true, source: 'pdf_download_logs', data: pdfLog };
    }

    // 2. Cek di tabel audit_logs khusus aksi UNDUH_PDF_BER_QR
    const { data: auditLog } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('action', 'UNDUH_PDF_BER_QR')
      .or(`verification_code.ilike.%${rawClean}%,target_id.ilike.%${cleanFile}%,details.ilike.%${cleanFile}%,details.ilike.%${cleanBase}%`)
      .limit(1)
      .maybeSingle();

    if (auditLog && auditLog.verification_code) {
      return { found: true, source: 'audit_logs', data: auditLog };
    }

    // 3. Cek di tabel users untuk QR Code atau identitas pejabat
    const { data: userMatch } = await supabase
      .from('users')
      .select('id, username, full_name, role, nip, signature_url, qr_code_url')
      .or(`id.ilike.%${rawClean}%,full_name.ilike.%${rawClean}%,username.ilike.%${rawClean}%`)
      .limit(1)
      .maybeSingle();

    if (userMatch && userMatch.signature_url) {
      return { 
        found: true, 
        source: 'users', 
        data: { 
          user: userMatch.full_name, 
          role: userMatch.role, 
          signatory_name: userMatch.full_name, 
          signatory_role: userMatch.role, 
          signatory_nip: userMatch.nip,
          signature_url: userMatch.signature_url,
          qr_code_url: userMatch.qr_code_url
        } 
      };
    }

    return { found: false, source: 'not_found' };
  } catch (e) {
    console.warn('Gagal verifikasi dari Supabase:', e);
    return { found: false, source: 'not_found' };
  }
}

export interface ModuleChecksumItem {
  key: 'buildings' | 'rooms' | 'meetingRooms' | 'transactions' | 'maintenances';
  label: string;
  localCount: number;
  remoteCount: number;
  localHash: string;
  remoteHash: string;
  isMatch: boolean;
}

export interface DatabaseChecksumReport {
  status: 'CHECKING' | 'SYNCED' | 'MISMATCH' | 'OFFLINE' | 'ERROR';
  localChecksum: string;
  remoteChecksum: string;
  isMatch: boolean;
  checkedAt: string;
  modules: ModuleChecksumItem[];
  mismatchedModules: string[];
  message: string;
}

/**
 * Algoritma FNV-1a 32-bit deterministik untuk menghasilkan kode checksum 8-karakter Hex
 */
export function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

/**
 * Menghitung checksum kanonik per modul dan master checksum untuk suatu dataset
 */
export function computeDatasetChecksums(dataset: {
  buildings?: Building[];
  rooms?: Room[];
  meetingRooms?: MeetingRoom[];
  transactions?: Transaction[];
  maintenances?: Maintenance[];
}) {
  // 1. Buildings (dinormalisasi berdasarkan nama gedung unik)
  const bldMap = new Map<string, string>();
  (dataset.buildings || []).forEach(b => {
    if (!b || !b.name) return;
    const normName = normalizeBuildingName(b.name);
    if (!normName || normName === 'Ruang Pertemuan' || normName === 'Ruang Pertemuan / Aula' || normName === 'Gedung Serbaguna (SG)') return;
    bldMap.set(normName.toLowerCase(), `${normName}|${Number(b.floors || 1)}`);
  });
  const bldSorted = Array.from(bldMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(e => e[1]);
  const buildingsHash = fnv1aHex(bldSorted.join(';;'));

  // 2. Meeting Rooms (diurutkan berdasarkan ID unik)
  const mrMap = new Map<string, string>();
  (dataset.meetingRooms || []).forEach(m => {
    if (!m || !m.id) return;
    mrMap.set(m.id, `${m.id}|${(m.name || '').trim().toLowerCase()}|${Number(m.dailyRate || 0)}|${Number(m.sessionRate || 0)}`);
  });
  const mrSorted = Array.from(mrMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(e => e[1]);
  const meetingRoomsHash = fnv1aHex(mrSorted.join(';;'));

  // 3. Transactions (diurutkan berdasarkan ID unik)
  const txList = dataset.transactions || [];
  const txMap = new Map<string, string>();
  txList.forEach(t => {
    if (!t || !t.id) return;
    const isCancelled = t.status === 'DIBATALKAN' ? 'CANCELLED' : (t.status === 'SELESAI' ? 'DONE' : 'ACTIVE');
    txMap.set(
      t.id,
      `${t.id}|${(t.roomNumber || '').trim().toUpperCase()}|${t.startDate || ''}|${Number(t.duration || 1)}|${t.paymentStatus || 'BELUM_LUNAS'}|${Number(t.paidAmount || 0)}|${isCancelled}`
    );
  });
  const txSorted = Array.from(txMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(e => e[1]);
  const transactionsHash = fnv1aHex(txSorted.join(';;'));

  // 4. Maintenances (diurutkan berdasarkan ID unik)
  const maintList = dataset.maintenances || [];
  const maintMap = new Map<string, string>();
  maintList.forEach(m => {
    if (!m || !m.id) return;
    maintMap.set(m.id, `${m.id}|${(m.roomNumber || '').trim().toUpperCase()}|${m.status || 'PROSES'}`);
  });
  const maintSorted = Array.from(maintMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(e => e[1]);
  const maintenancesHash = fnv1aHex(maintSorted.join(';;'));

  // 5. Rooms (diurutkan berdasarkan ID unik setelah deduplikasi, dengan status efektif diselaraskan terhadap transaksi & perawatan aktif)
  const roomMap = new Map<string, string>();
  const cleanRooms = deduplicateRoomsByBuildingAndNumber(dataset.rooms || [], dataset.meetingRooms);
  cleanRooms.forEach(r => {
    if (!r || !r.id) return;
    const matchingActiveTxs = txList.filter(t =>
      (t.roomId === r.id || (t.roomNumber === r.roomNumber && (!t.building || normalizeBuildingName(t.building) === normalizeBuildingName(r.building))) || t.id === r.activeTxId) &&
      t.status !== 'DIBATALKAN' &&
      t.status !== 'SELESAI'
    );
    const terisiTx = matchingActiveTxs.find(t => t.status === 'TERISI');
    const bookedTx = matchingActiveTxs.find(t => t.status === 'BOOKED');
    const activeMaint = maintList.find(m =>
      (m.id === r.activeMaintId || m.roomId === r.id || (m.roomNumber === r.roomNumber && (!m.building || normalizeBuildingName(m.building) === normalizeBuildingName(r.building)))) &&
      m.status !== 'SELESAI'
    );

    let effectiveStatus = r.status || 'KOSONG';
    if (activeMaint) {
      effectiveStatus = 'MAINTENANCE';
    } else if (terisiTx) {
      effectiveStatus = 'TERISI';
    } else if (bookedTx) {
      if (effectiveStatus !== 'MAINTENANCE') effectiveStatus = 'BOOKED';
    } else if (effectiveStatus === 'TERISI' || effectiveStatus === 'BOOKED' || effectiveStatus === 'MAINTENANCE') {
      effectiveStatus = 'KOSONG';
    }

    const bldKey = getRoomBuildingKey(r, dataset.meetingRooms);
    roomMap.set(
      r.id,
      `${r.id}|${(r.roomNumber || '').trim().toUpperCase()}|${bldKey.toLowerCase()}|${effectiveStatus}|${Number(r.pricePerNight || 0)}`
    );
  });
  const roomSorted = Array.from(roomMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(e => e[1]);
  const roomsHash = fnv1aHex(roomSorted.join(';;'));

  const masterChecksum = `CHK-${fnv1aHex(`${buildingsHash}:${meetingRoomsHash}:${roomsHash}:${transactionsHash}:${maintenancesHash}`)}`;

  return {
    masterChecksum,
    buildings: { count: bldSorted.length, hash: buildingsHash },
    meetingRooms: { count: mrSorted.length, hash: meetingRoomsHash },
    rooms: { count: roomSorted.length, hash: roomsHash },
    transactions: { count: txSorted.length, hash: transactionsHash },
    maintenances: { count: maintSorted.length, hash: maintenancesHash }
  };
}

/**
 * Validasi Checksum Cache Lokal terhadap Central Database (Supabase)
 */
export async function validateDatabaseChecksumAgainstSupabase(localDataset: {
  buildings?: Building[];
  rooms?: Room[];
  meetingRooms?: MeetingRoom[];
  transactions?: Transaction[];
  maintenances?: Maintenance[];
}): Promise<DatabaseChecksumReport> {
  const localSig = computeDatasetChecksums(localDataset);
  const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return {
        status: 'OFFLINE',
        localChecksum: localSig.masterChecksum,
        remoteChecksum: 'OFFLINE',
        isMatch: false,
        checkedAt: nowStr,
        modules: [],
        mismatchedModules: [],
        message: 'Perangkat sedang offline. Menggunakan cache lokal.'
      };
    }

    const remoteDb = await fetchFullDatabaseFromSupabase();
    if (!remoteDb) {
      return {
        status: 'ERROR',
        localChecksum: localSig.masterChecksum,
        remoteChecksum: 'UNAVAILABLE',
        isMatch: false,
        checkedAt: nowStr,
        modules: [],
        mismatchedModules: [],
        message: 'Tidak dapat mengambil metadata checksum dari Database Pusat.'
      };
    }

    const remoteSig = computeDatasetChecksums(remoteDb);

    const modules: ModuleChecksumItem[] = [
      {
        key: 'buildings',
        label: 'Gedung Asrama',
        localCount: localSig.buildings.count,
        remoteCount: remoteSig.buildings.count,
        localHash: localSig.buildings.hash,
        remoteHash: remoteSig.buildings.hash,
        isMatch: localSig.buildings.hash === remoteSig.buildings.hash
      },
      {
        key: 'rooms',
        label: 'Kamar & Unit Fasilitas',
        localCount: localSig.rooms.count,
        remoteCount: remoteSig.rooms.count,
        localHash: localSig.rooms.hash,
        remoteHash: remoteSig.rooms.hash,
        isMatch: localSig.rooms.hash === remoteSig.rooms.hash
      },
      {
        key: 'meetingRooms',
        label: 'Ruang Pertemuan / Aula',
        localCount: localSig.meetingRooms.count,
        remoteCount: remoteSig.meetingRooms.count,
        localHash: localSig.meetingRooms.hash,
        remoteHash: remoteSig.meetingRooms.hash,
        isMatch: localSig.meetingRooms.hash === remoteSig.meetingRooms.hash
      },
      {
        key: 'transactions',
        label: 'Transaksi & Reservasi',
        localCount: localSig.transactions.count,
        remoteCount: remoteSig.transactions.count,
        localHash: localSig.transactions.hash,
        remoteHash: remoteSig.transactions.hash,
        isMatch: localSig.transactions.hash === remoteSig.transactions.hash
      },
      {
        key: 'maintenances',
        label: 'Tiket Perawatan',
        localCount: localSig.maintenances.count,
        remoteCount: remoteSig.maintenances.count,
        localHash: localSig.maintenances.hash,
        remoteHash: remoteSig.maintenances.hash,
        isMatch: localSig.maintenances.hash === remoteSig.maintenances.hash
      }
    ];

    const mismatchedModules = modules.filter(m => !m.isMatch).map(m => m.label);
    const isMatch = localSig.masterChecksum === remoteSig.masterChecksum && mismatchedModules.length === 0;

    return {
      status: isMatch ? 'SYNCED' : 'MISMATCH',
      localChecksum: localSig.masterChecksum,
      remoteChecksum: remoteSig.masterChecksum,
      isMatch,
      checkedAt: nowStr,
      modules,
      mismatchedModules,
      message: isMatch
        ? `Cache lokal terverifikasi identik dengan Database Pusat (${localSig.masterChecksum}).`
        : `Perbedaan Checksum terdeteksi pada: ${mismatchedModules.join(', ')}.`
    };
  } catch (err: any) {
    return {
      status: 'ERROR',
      localChecksum: localSig.masterChecksum,
      remoteChecksum: 'ERROR',
      isMatch: false,
      checkedAt: nowStr,
      modules: [],
      mismatchedModules: [],
      message: err?.message || 'Gagal memvalidasi checksum terhadap Database Pusat.'
    };
  }
}

/**
 * 1. Fungsi UPDATE langsung ke tabel transactions di Supabase (menjamin data permanen & lintas perangkat)
 * Dilengkapi error handling dan re-fetch otomatis.
 */
export async function updateTransactionInSupabaseDirect(t: Transaction): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = {
      id: t.id,
      room_id: t.roomId,
      building: t.building,
      room_number: t.roomNumber,
      category: t.category,
      guest_name: t.guestName,
      guest_type: t.guestType,
      nik_ktp: t.nikKtp,
      kloter: t.kloter,
      start_date: t.startDate,
      duration: t.duration,
      phone: t.phone,
      notes: t.notes,
      status: t.status,
      created_user: t.createdUser,
      is_group: t.isGroup,
      group_type: t.groupType,
      group_name: t.groupName,
      group_pic: t.groupPic,
      group_pic_phone: t.groupPicPhone,
      group_id: t.groupId,
      total_pax: t.totalPax,
      include_aula: t.includeAula,
      rent_aula_id: t.rentAulaId,
      rent_aula_name: t.rentAulaName,
      catering_package: t.cateringPackage,
      catering_pax_count: t.cateringPaxCount,
      spk_number: t.spkNumber,
      allocated_room_numbers: t.allocatedRoomNumbers,
      allocated_rooms_count: t.allocatedRoomsCount,
      breakfast: t.breakfast,
      breakfast_menu: t.breakfastMenu,
      breakfast_portions: t.breakfastPortions,
      breakfast_days: t.breakfastDays,
      breakfast_status: t.breakfastStatus,
      rent_type: t.rentType,
      duration_unit: t.durationUnit,
      extra_bed: t.extraBed,
      extra_bed_count: t.extraBedCount,
      extra_bed_price: t.extraBedPrice || 0,
      extra_bed_notes: t.extraBedNotes || null,
      agency_or_document: t.agencyOrDocument || null,
      price_per_night: t.pricePerNight || 0,
      payment_status: t.paymentStatus || 'BELUM_LUNAS',
      paid_amount: t.paidAmount || 0,
      dp_amount: t.dpAmount || 0,
      dp_date: t.dpDate || null,
      dp_method: t.dpMethod || null,
      dp_note: t.dpNote || null,
      remaining_amount: t.remainingAmount || 0,
      va_number: t.vaNumber || null,
      va_account_name: t.vaAccountName || null,
      bank_name: t.bankName || null,
      bank_account_number: t.bankAccountNumber || null,
      payment_method: t.paymentMethod || null,
      payment_date: t.paymentDate || null,
      payment_note: t.paymentNote || null,
      kwitansi_no: t.kwitansiNo || null,
      cancelled_at: t.cancelledAt || null,
      cancel_reason: t.cancelReason || null,
      cancelled_user: t.cancelledUser || null,
      extend_history: t.extendHistory || [],
      check_in_time: t.checkInTime,
      check_out_time: t.checkOutTime
    };

    const { error } = await supabase.from('transactions').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.error('Error updating transaction in Supabase:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error('Exception updating transaction in Supabase:', err);
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * 2. Fungsi UPDATE langsung ke tabel rooms di Supabase
 */
export async function updateRoomInSupabaseDirect(r: Room): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = {
      id: r.id,
      building: r.building,
      room_number: r.roomNumber,
      floor: r.floor,
      type: r.type,
      capacity: r.capacity,
      status: r.status,
      qc_status: r.qcStatus,
      last_qc_date: r.lastQcDate,
      last_qc_by: r.lastQcBy,
      last_qc_notes: r.lastQcNotes,
      active_tx_id: r.activeTxId,
      active_maint_id: r.activeMaintId,
      price_per_night: r.pricePerNight,
      facilities: r.facilities
    };
    const { error } = await supabase.from('rooms').upsert(payload, { onConflict: 'id' });
    if (error) {
      return { success: false, error: error.message };
    }

    // Perbarui juga data di app_database_sync agar snapshot konsisten
    try {
      const { data: syncData } = await supabase.from('app_database_sync').select('database_payload').eq('id', 'main_production_db').maybeSingle();
      if (syncData?.database_payload) {
        const p = syncData.database_payload as CompleteStorageDatabase;
        if (Array.isArray(p.rooms)) {
          const idx = p.rooms.findIndex(item => item.id === r.id);
          if (idx >= 0) {
            p.rooms[idx] = { ...p.rooms[idx], ...r };
          } else {
            p.rooms.push(r);
          }
          await supabase.from('app_database_sync').upsert([
            { id: 'main_production_db', database_payload: p, updated_at: new Date().toISOString() },
            { id: 'root_snapshot', database_payload: p, updated_at: new Date().toISOString() }
          ], { onConflict: 'id' });
        }
      }
    } catch (_) {}

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * 3. Fungsi UPDATE langsung ke tabel users di Supabase
 */
export async function updateUserInSupabaseDirect(u: User): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = {
      id: u.id,
      username: u.username,
      full_name: u.fullName,
      role: u.role,
      password: u.password,
      department: u.department,
      supervisor_id: u.supervisorId || null,
      assigned_building: u.assignedBuilding || null,
      phone: u.phone || null,
      status: u.status || 'Aktif',
      email: u.email || null,
      nip: u.nip || null,
      is_owner: Boolean(u.isOwner),
      signature_url: u.signatureUrl || null,
      qr_code_url: u.qrCodeUrl || null,
      signature_history: u.signatureHistory || []
    };
    const { error } = await supabase.from('users').upsert(payload, { onConflict: 'id' });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * 4. Fungsi UPDATE langsung ke tabel meeting_rooms di Supabase
 */
export async function updateMeetingRoomInSupabaseDirect(m: MeetingRoom): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = {
      id: m.id,
      name: m.name,
      code: m.code,
      building: m.building,
      capacity: m.capacity,
      capacity_number: m.capacityNumber,
      facilities: m.facilities,
      daily_rate: m.dailyRate,
      session_rate: m.sessionRate,
      description: m.description,
      status: m.status,
      qc_status: m.qcStatus,
      active_tx_id: m.activeTxId
    };
    const { error } = await supabase.from('meeting_rooms').upsert(payload, { onConflict: 'id' });
    if (error) {
      return { success: false, error: error.message };
    }

    // Perbarui juga data di app_database_sync agar snapshot konsisten
    try {
      const { data: syncData } = await supabase.from('app_database_sync').select('database_payload').eq('id', 'main_production_db').maybeSingle();
      if (syncData?.database_payload) {
        const p = syncData.database_payload as CompleteStorageDatabase;
        if (Array.isArray(p.meetingRooms)) {
          const idx = p.meetingRooms.findIndex(item => item.id === m.id);
          if (idx >= 0) {
            p.meetingRooms[idx] = { ...p.meetingRooms[idx], ...m };
          } else {
            p.meetingRooms.push(m);
          }
          await supabase.from('app_database_sync').upsert([
            { id: 'main_production_db', database_payload: p, updated_at: new Date().toISOString() },
            { id: 'root_snapshot', database_payload: p, updated_at: new Date().toISOString() }
          ], { onConflict: 'id' });
        }
      }
    } catch (_) {}

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * 5. Fungsi UPDATE langsung ke tabel maintenances di Supabase
 */
export async function updateMaintenanceInSupabaseDirect(item: Maintenance): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = {
      id: item.id,
      room_id: item.roomId,
      building: item.building,
      room_number: item.roomNumber,
      category: item.category,
      urgency: item.urgency,
      technician: item.technician,
      description: item.description,
      report_time: item.reportTime,
      status: item.status,
      reported_user: item.reportedUser,
      assigned_technician_id: item.assignedTechnicianId,
      assigned_technician_name: item.assignedTechnicianName,
      assigned_by_manager: item.assignedByManager,
      assigned_time: item.assignedTime,
      manager_notes: item.managerNotes,
      work_completed_time: item.workCompletedTime,
      technician_notes: item.technicianNotes,
      resolved_time: item.resolvedTime,
      qc_inspection_id: item.qcInspectionId,
      facility_type: item.facilityType
    };
    const { error } = await supabase.from('maintenances').upsert(payload, { onConflict: 'id' });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

export { useRealtimeSync } from '../hooks/useRealtimeSync';

/**
 * 6. Fungsi UPDATE langsung ke tabel buildings di Supabase
 */
export async function updateBuildingInSupabaseDirect(b: Building, previousName?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanName = b.name.trim();
    const cleanPrev = (previousName || '').trim();

    // 1. Cari target ID di database: utamakan b.id, jika belum ada cari berdasarkan nama sebelumnya
    let targetId = b.id;
    let existingFound = false;
    try {
      const { data: byId } = await supabase.from('buildings').select('id, name').eq('id', b.id).maybeSingle();
      if (byId) {
        existingFound = true;
      } else if (cleanPrev) {
        const { data: byName } = await supabase.from('buildings').select('id, name').ilike('name', cleanPrev).maybeSingle();
        if (byName?.id) {
          targetId = byName.id;
          existingFound = true;
        }
      }
    } catch (_) {}

    const payload = {
      id: targetId,
      name: cleanName,
      code: (b.code || '').trim().toUpperCase() || null,
      floors: Number(b.floors) || 1,
      total_rooms: Number(b.totalRooms) || 0,
      capacity_desc: b.capacityDesc || null,
      category: b.category || 'PENGINAPAN',
      description: b.description || null,
      status: b.status || 'AKTIF'
    };

    let saveErr = null;
    if (existingFound) {
      // Jalankan direct SQL UPDATE terlebih dahulu
      const { error: updErr } = await supabase.from('buildings').update(payload).eq('id', targetId);
      if (updErr) {
        const { error: upErr } = await supabase.from('buildings').upsert(payload, { onConflict: 'id' });
        saveErr = upErr;
      }
    } else {
      const { error: insErr } = await supabase.from('buildings').upsert(payload, { onConflict: 'id' });
      saveErr = insErr;
    }

    if (saveErr) {
      console.warn('Supabase update building warning (melanjutkan sinkronisasi Google Spreadsheet):', saveErr?.message || saveErr);
    }

    // 2. Jika nama gedung berubah, sinkronkan ke semua tabel relasional di database Supabase secara real-time
    if (cleanPrev && cleanPrev.toLowerCase() !== cleanName.toLowerCase()) {
      try {
        await Promise.allSettled([
          supabase.from('rooms').update({ building: cleanName }).ilike('building', cleanPrev),
          supabase.from('transactions').update({ building: cleanName }).ilike('building', cleanPrev),
          supabase.from('maintenances').update({ building: cleanName }).ilike('building', cleanPrev),
          supabase.from('qc_inspections').update({ building: cleanName }).ilike('building', cleanPrev),
          supabase.from('meeting_rooms').update({ building: cleanName }).ilike('building', cleanPrev),
          supabase.from('users').update({ assigned_building: cleanName }).ilike('assigned_building', cleanPrev)
        ]);
      } catch (e) {
        console.warn('Gagal cascade update nama gedung ke tabel relasional Supabase:', e);
      }
    }

    // 3. Perbarui juga snapshot terpadu di app_database_sync agar konsisten seketika
    try {
      const { data: syncData } = await supabase.from('app_database_sync').select('database_payload').eq('id', 'main_production_db').maybeSingle();
      if (syncData?.database_payload) {
        const p = syncData.database_payload as CompleteStorageDatabase;
        if (Array.isArray(p.buildings)) {
          p.buildings = p.buildings.map(item => (item.id === targetId || item.id === b.id) ? { ...item, ...b, id: targetId, name: cleanName } : item);
          if (cleanPrev && cleanPrev.toLowerCase() !== cleanName.toLowerCase()) {
            const oldLower = cleanPrev.toLowerCase();
            if (Array.isArray(p.rooms)) {
              p.rooms = p.rooms.map(r => (r.building || '').trim().toLowerCase() === oldLower ? { ...r, building: cleanName } : r);
            }
            if (Array.isArray(p.transactions)) {
              p.transactions = p.transactions.map(t => (t.building || '').trim().toLowerCase() === oldLower ? { ...t, building: cleanName } : t);
            }
            if (Array.isArray(p.maintenances)) {
              p.maintenances = p.maintenances.map(m => (m.building || '').trim().toLowerCase() === oldLower ? { ...m, building: cleanName } : m);
            }
            if (Array.isArray(p.qcInspections)) {
              p.qcInspections = p.qcInspections.map(q => (q.building || '').trim().toLowerCase() === oldLower ? { ...q, building: cleanName } : q);
            }
          }
          await supabase.from('app_database_sync').upsert([
            { id: 'main_production_db', database_payload: p, updated_at: new Date().toISOString() },
            { id: 'root_snapshot', database_payload: p, updated_at: new Date().toISOString() }
          ], { onConflict: 'id' });
        }
      }
    } catch (_) {}

    // Selalu sinkronkan juga ke Google Spreadsheet
    try {
      await updateBuildingInSpreadsheetDirect(b, previousName);
    } catch (_) {}

    return { success: true };
  } catch (err: any) {
    console.warn('Supabase update building error (fallback Spreadsheet):', err?.message || err);
    try {
      await updateBuildingInSpreadsheetDirect(b, previousName);
    } catch (_) {}
    return { success: true };
  }
}

/**
 * 7. Fungsi UPDATE langsung ke tabel room_capacity_rates di Supabase
 */
export async function updateRoomCapacityRateInSupabaseDirect(rate: RoomCapacityRate): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = {
      id: rate.id,
      room_type: rate.roomType,
      bed_type: rate.bedType,
      capacity_pax: rate.capacityPax,
      price_per_night: rate.pricePerNight,
      description: rate.description || null,
      facilities: rate.facilities || [],
      is_active: rate.isActive ?? true,
      updated_at: rate.updatedAt || new Date().toISOString()
    };
    const { error } = await supabase.from('room_capacity_rates').upsert(payload, { onConflict: 'id' });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * 8. Fungsi DELETE langsung ke tabel rooms di Supabase
 */
export async function deleteRoomInSupabaseDirect(roomId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('rooms').delete().eq('id', roomId);
    if (error && error.code !== '42P01') {
      return { success: false, error: error.message };
    }
    // Hapus juga dari snapshot app_database_sync agar tidak pernah bangkit lagi
    try {
      const { data: syncData } = await supabase.from('app_database_sync').select('database_payload').eq('id', 'main_production_db').maybeSingle();
      if (syncData?.database_payload) {
        const payload = syncData.database_payload as CompleteStorageDatabase;
        if (Array.isArray(payload.rooms)) {
          payload.rooms = payload.rooms.filter(r => r.id !== roomId);
          await supabase.from('app_database_sync').upsert([
            { id: 'main_production_db', database_payload: payload, updated_at: new Date().toISOString() },
            { id: 'root_snapshot', database_payload: payload, updated_at: new Date().toISOString() }
          ], { onConflict: 'id' });
        }
      }
    } catch (_) {}
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * 9. Fungsi DELETE langsung ke tabel buildings di Supabase
 */
export async function deleteBuildingInSupabaseDirect(buildingId: string, buildingName?: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Hapus dari tabel buildings berdasarkan id
    const { error } = await supabase.from('buildings').delete().eq('id', buildingId);
    if (error && error.code !== '42P01') {
      console.warn('Gagal delete building by id:', error.message);
    }

    // Jika buildingName tersedia, hapus juga record yang memiliki nama sama di tabel buildings
    if (buildingName) {
      try {
        await supabase.from('buildings').delete().ilike('name', buildingName.trim());
      } catch (_) {}
    }

    // Bersihkan juga unit-unit kamar yang terafiliasi dengan gedung ini dari tabel rooms Supabase
    try {
      if (buildingName) {
        await supabase.from('rooms').delete().ilike('building', buildingName.trim());
      }
    } catch (_) {}

    // Bersihkan juga dari meeting_rooms jika ada fasilitas aula di gedung ini
    try {
      if (buildingName) {
        await supabase.from('meeting_rooms').delete().ilike('building', buildingName.trim());
      }
    } catch (_) {}

    // Hapus dari snapshot app_database_sync
    try {
      const { data: syncData } = await supabase.from('app_database_sync').select('database_payload').eq('id', 'main_production_db').maybeSingle();
      if (syncData?.database_payload) {
        const payload = syncData.database_payload as CompleteStorageDatabase;
        const bLower = (buildingName || '').trim().toLowerCase();
        if (Array.isArray(payload.buildings)) {
          payload.buildings = payload.buildings.filter(b => b.id !== buildingId && (bLower ? b.name.trim().toLowerCase() !== bLower : true));
        }
        if (buildingName && Array.isArray(payload.rooms)) {
          payload.rooms = payload.rooms.filter(r => (r.building || '').trim().toLowerCase() !== bLower);
        }
        if (buildingName && Array.isArray(payload.meetingRooms)) {
          payload.meetingRooms = payload.meetingRooms.filter(m => (m.building || '').trim().toLowerCase() !== bLower && m.name.trim().toLowerCase() !== bLower);
        }
        await supabase.from('app_database_sync').upsert([
          { id: 'main_production_db', database_payload: payload, updated_at: new Date().toISOString() },
          { id: 'root_snapshot', database_payload: payload, updated_at: new Date().toISOString() }
        ], { onConflict: 'id' });
      }
    } catch (_) {}
    try {
      await deleteBuildingInSpreadsheetDirect(buildingId, buildingName);
    } catch (_) {}
    return { success: true };
  } catch (err: any) {
    console.warn('Supabase delete building network warning (fallback Spreadsheet):', err?.message || err);
    try {
      await deleteBuildingInSpreadsheetDirect(buildingId, buildingName);
    } catch (_) {}
    return { success: true };
  }
}

/**
 * 10. Fungsi DELETE langsung ke tabel meeting_rooms di Supabase
 */
export async function deleteMeetingRoomInSupabaseDirect(meetingRoomId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('meeting_rooms').delete().eq('id', meetingRoomId);
    if (error && error.code !== '42P01') {
      return { success: false, error: error.message };
    }
    try {
      const { data: syncData } = await supabase.from('app_database_sync').select('database_payload').eq('id', 'main_production_db').maybeSingle();
      if (syncData?.database_payload) {
        const payload = syncData.database_payload as CompleteStorageDatabase;
        if (Array.isArray(payload.meetingRooms)) {
          payload.meetingRooms = payload.meetingRooms.filter(m => m.id !== meetingRoomId);
          await supabase.from('app_database_sync').upsert([
            { id: 'main_production_db', database_payload: payload, updated_at: new Date().toISOString() },
            { id: 'root_snapshot', database_payload: payload, updated_at: new Date().toISOString() }
          ], { onConflict: 'id' });
        }
      }
    } catch (_) {}
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * 11. Fungsi DELETE langsung ke tabel transactions di Supabase
 */
export async function deleteTransactionInSupabaseDirect(transactionId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('transactions').delete().eq('id', transactionId);
    if (error && error.code !== '42P01') {
      return { success: false, error: error.message };
    }
    try {
      const { data: syncData } = await supabase.from('app_database_sync').select('database_payload').eq('id', 'main_production_db').maybeSingle();
      if (syncData?.database_payload) {
        const payload = syncData.database_payload as CompleteStorageDatabase;
        if (Array.isArray(payload.transactions)) {
          payload.transactions = payload.transactions.filter(t => t.id !== transactionId);
          await supabase.from('app_database_sync').upsert([
            { id: 'main_production_db', database_payload: payload, updated_at: new Date().toISOString() },
            { id: 'root_snapshot', database_payload: payload, updated_at: new Date().toISOString() }
          ], { onConflict: 'id' });
        }
      }
    } catch (_) {}
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * 12. Fungsi DELETE langsung ke tabel users di Supabase
 */
export async function deleteUserInSupabaseDirect(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('users').delete().eq('id', userId);
    if (error && error.code !== '42P01') {
      return { success: false, error: error.message };
    }
    try {
      const { data: syncData } = await supabase.from('app_database_sync').select('database_payload').eq('id', 'main_production_db').maybeSingle();
      if (syncData?.database_payload) {
        const payload = syncData.database_payload as CompleteStorageDatabase;
        if (Array.isArray(payload.users)) {
          payload.users = payload.users.filter(u => u.id !== userId);
          await supabase.from('app_database_sync').upsert([
            { id: 'main_production_db', database_payload: payload, updated_at: new Date().toISOString() },
            { id: 'root_snapshot', database_payload: payload, updated_at: new Date().toISOString() }
          ], { onConflict: 'id' });
        }
      }
    } catch (_) {}
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * 13. Fungsi DELETE langsung ke tabel room_capacity_rates di Supabase
 */
export async function deleteRoomCapacityRateInSupabaseDirect(rateId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('room_capacity_rates').delete().eq('id', rateId);
    if (error && error.code !== '42P01') {
      return { success: false, error: error.message };
    }
    try {
      const { data: syncData } = await supabase.from('app_database_sync').select('database_payload').eq('id', 'main_production_db').maybeSingle();
      if (syncData?.database_payload) {
        const payload = syncData.database_payload as CompleteStorageDatabase;
        if (Array.isArray(payload.roomCapacityRates)) {
          payload.roomCapacityRates = payload.roomCapacityRates.filter(r => r.id !== rateId);
          await supabase.from('app_database_sync').upsert({ id: 'main_production_db', database_payload: payload, updated_at: new Date().toISOString() });
        }
      }
    } catch (_) {}
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * 14. Fungsi DELETE langsung ke tabel maintenances di Supabase
 */
export async function deleteMaintenanceInSupabaseDirect(maintenanceId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('maintenances').delete().eq('id', maintenanceId);
    if (error && error.code !== '42P01') {
      return { success: false, error: error.message };
    }
    try {
      const { data: syncData } = await supabase.from('app_database_sync').select('database_payload').eq('id', 'main_production_db').maybeSingle();
      if (syncData?.database_payload) {
        const payload = syncData.database_payload as CompleteStorageDatabase;
        if (Array.isArray(payload.maintenances)) {
          payload.maintenances = payload.maintenances.filter(m => m.id !== maintenanceId);
          await supabase.from('app_database_sync').upsert({ id: 'main_production_db', database_payload: payload, updated_at: new Date().toISOString() });
        }
      }
    } catch (_) {}
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * 15. Fungsi DELETE langsung ke tabel qc_inspections di Supabase
 */
export async function deleteQcInspectionInSupabaseDirect(qcId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('qc_inspections').delete().eq('id', qcId);
    if (error && error.code !== '42P01') {
      return { success: false, error: error.message };
    }
    try {
      const { data: syncData } = await supabase.from('app_database_sync').select('database_payload').eq('id', 'main_production_db').maybeSingle();
      if (syncData?.database_payload) {
        const payload = syncData.database_payload as CompleteStorageDatabase;
        if (Array.isArray(payload.qcInspections)) {
          payload.qcInspections = payload.qcInspections.filter(q => q.id !== qcId);
          await supabase.from('app_database_sync').upsert({ id: 'main_production_db', database_payload: payload, updated_at: new Date().toISOString() });
        }
      }
    } catch (_) {}
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * 16. Fungsi DELETE langsung ke tabel breakfast_orders di Supabase
 */
export async function deleteBreakfastOrderInSupabaseDirect(orderId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('breakfast_orders').delete().eq('id', orderId);
    if (error && error.code !== '42P01') {
      return { success: false, error: error.message };
    }
    try {
      const { data: syncData } = await supabase.from('app_database_sync').select('database_payload').eq('id', 'main_production_db').maybeSingle();
      if (syncData?.database_payload) {
        const payload = syncData.database_payload as CompleteStorageDatabase;
        if (Array.isArray(payload.breakfastOrders)) {
          payload.breakfastOrders = payload.breakfastOrders.filter(o => o.id !== orderId);
          await supabase.from('app_database_sync').upsert({ id: 'main_production_db', database_payload: payload, updated_at: new Date().toISOString() });
        }
      }
    } catch (_) {}
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * 17. Fungsi DELETE langsung ke tabel breakfast_menu_items di Supabase
 */
export async function deleteBreakfastMenuItemInSupabaseDirect(menuItemId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('breakfast_menu_items').delete().eq('id', menuItemId);
    if (error && error.code !== '42P01') {
      return { success: false, error: error.message };
    }
    try {
      const { data: syncData } = await supabase.from('app_database_sync').select('database_payload').eq('id', 'main_production_db').maybeSingle();
      if (syncData?.database_payload) {
        const payload = syncData.database_payload as CompleteStorageDatabase;
        if (Array.isArray(payload.breakfastMenuItems)) {
          payload.breakfastMenuItems = payload.breakfastMenuItems.filter(m => m.id !== menuItemId);
          await supabase.from('app_database_sync').upsert({ id: 'main_production_db', database_payload: payload, updated_at: new Date().toISOString() });
        }
      }
    } catch (_) {}
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * 18. Fungsi bersihkan total seluruh log audit di Supabase
 */
export async function clearAuditLogsInSupabaseDirect(): Promise<{ success: boolean; error?: string }> {
  try {
    await supabase.from('audit_logs').delete().neq('id', '___NEVER___');
    try {
      await supabase.from('pdf_download_logs').delete().neq('id', '___NEVER___');
    } catch (_) {}
    try {
      const { data: syncData } = await supabase.from('app_database_sync').select('database_payload').eq('id', 'main_production_db').maybeSingle();
      if (syncData?.database_payload) {
        const payload = syncData.database_payload as CompleteStorageDatabase;
        payload.auditLogs = [];
        await supabase.from('app_database_sync').upsert({ id: 'main_production_db', database_payload: payload, updated_at: new Date().toISOString() });
      }
    } catch (_) {}
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * 19. Fungsi bersihkan total seluruh rekap sesi kerja di Supabase
 */
export async function clearWorkSessionsInSupabaseDirect(): Promise<{ success: boolean; error?: string }> {
  try {
    await supabase.from('work_sessions').delete().neq('id', '___NEVER___');
    try {
      const { data: syncData } = await supabase.from('app_database_sync').select('database_payload').eq('id', 'main_production_db').maybeSingle();
      if (syncData?.database_payload) {
        const payload = syncData.database_payload as CompleteStorageDatabase;
        payload.workSessions = [];
        await supabase.from('app_database_sync').upsert({ id: 'main_production_db', database_payload: payload, updated_at: new Date().toISOString() });
      }
    } catch (_) {}
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * 20. Fungsi UPSERT langsung satu sesi kerja ke Supabase (work_sessions + app_database_sync)
 */
export async function upsertWorkSessionInSupabaseDirect(session: WorkSession): Promise<{ success: boolean; error?: string }> {
  try {
    const rowPayload = {
      id: session.id,
      user_id: session.userId,
      user_name: session.userName,
      user_role: session.userRole,
      login_time: session.loginTime,
      logout_time: session.logoutTime || null,
      duration_seconds: session.durationSeconds || 0,
      duration_formatted: session.durationFormatted || '0 Jam 0 Menit 0 Detik',
      status: session.status || 'AKTIF',
      notes: session.notes || null
    };
    await supabase.from('work_sessions').upsert(rowPayload, { onConflict: 'id' });

    try {
      const { data: syncData } = await supabase.from('app_database_sync').select('database_payload').eq('id', 'main_production_db').maybeSingle();
      if (syncData?.database_payload) {
        const payload = syncData.database_payload as CompleteStorageDatabase;
        const list = Array.isArray(payload.workSessions) ? [...payload.workSessions] : [];
        const idx = list.findIndex(s => s.id === session.id);
        if (idx >= 0) {
          list[idx] = { ...list[idx], ...session };
        } else {
          list.unshift(session);
        }
        payload.workSessions = list;
        await supabase.from('app_database_sync').upsert({
          id: 'main_production_db',
          database_payload: payload,
          updated_at: new Date().toISOString()
        });
      }
    } catch (_) {}
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * 21. Fungsi UPSERT langsung pesan chat & channel ke Supabase (app_database_sync)
 */
export async function upsertChatMessageInSupabaseDirect(msg: ChatMessage, channel?: ChatChannel): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: syncData } = await supabase.from('app_database_sync').select('database_payload').eq('id', 'main_production_db').maybeSingle();
    if (syncData?.database_payload) {
      const payload = syncData.database_payload as CompleteStorageDatabase;
      const messages = Array.isArray(payload.chatMessages) ? [...payload.chatMessages] : [];
      if (!messages.some(m => m.id === msg.id)) {
        messages.push(msg);
      }
      payload.chatMessages = messages;

      const channels = Array.isArray(payload.chatChannels) ? [...payload.chatChannels] : [...initialChatChannels];
      const chIdx = channels.findIndex(c => c.id === msg.channelId);
      if (chIdx >= 0) {
        channels[chIdx] = {
          ...channels[chIdx],
          ...(channel || {}),
          lastMessage: msg.message,
          lastMessageTime: msg.timeFormatted,
          lastSenderName: msg.senderName
        };
      } else if (channel) {
        channels.unshift({
          ...channel,
          lastMessage: msg.message,
          lastMessageTime: msg.timeFormatted,
          lastSenderName: msg.senderName
        });
      }
      payload.chatChannels = channels;

      await supabase.from('app_database_sync').upsert({
        id: 'main_production_db',
        database_payload: payload,
        updated_at: new Date().toISOString()
      });
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * 22. Fungsi bersihkan pesan chat di Supabase (per channel atau seluruhnya)
 */
export async function clearChatMessagesInSupabaseDirect(channelId?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: syncData } = await supabase.from('app_database_sync').select('database_payload').eq('id', 'main_production_db').maybeSingle();
    if (syncData?.database_payload) {
      const payload = syncData.database_payload as CompleteStorageDatabase;
      if (channelId) {
        payload.chatMessages = (payload.chatMessages || []).filter(m => m.channelId !== channelId);
      } else {
        payload.chatMessages = [];
      }
      await supabase.from('app_database_sync').upsert({
        id: 'main_production_db',
        database_payload: payload,
        updated_at: new Date().toISOString()
      });
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

