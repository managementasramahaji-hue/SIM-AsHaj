import { dataStorage, type CompleteStorageDatabase } from './dataStorage';
import type { Building, Room, MeetingRoom, Transaction, Maintenance, QcInspection, User, ChatChannel, ChatMessage, WorkSession } from '../types';
import { OFFICIAL_APP_LOGO } from '../officialLogo';
import { normalizeBuildingName, deduplicateRoomsByBuildingAndNumber, getRoomBuildingKey } from '../lib/utils';

export interface SpreadsheetConfigInfo {
  webAppUrl: string;
  sheetDocUrl?: string;
  sheetId?: string;
  isConfigured: boolean;
  source: 'server_proxy' | 'custom_storage' | 'environment';
  updatedAt?: string;
}

export interface SpreadsheetSyncState {
  status: 'idle' | 'syncing' | 'connected' | 'error';
  lastSyncTime: string | null;
  errorMessage: string | null;
  isConfigured: boolean;
  isSyncing?: boolean;
  lastSyncedAt?: string | null;
  lastError?: string | null;
}

/**
 * Pembersihan URL Web App Google Apps Script
 */
export function sanitizeSpreadsheetWebAppUrl(url?: string): string {
  if (!url) return '';
  return url.trim();
}

/**
 * Mendapatkan konfigurasi Google Spreadsheet aktif dari browser / window / environment
 */
export function getSpreadsheetConfig(): SpreadsheetConfigInfo {
  let webAppUrl = '';
  let sheetDocUrl = '';
  let sheetId = '';
  let source: 'server_proxy' | 'custom_storage' | 'environment' = 'server_proxy';

  if (typeof window !== 'undefined') {
    const localWebApp = localStorage.getItem('CUSTOM_SHEET_WEBAPP_URL');
    const localDoc = localStorage.getItem('CUSTOM_SHEET_DOC_URL');
    if (localWebApp) {
      webAppUrl = localWebApp;
      sheetDocUrl = localDoc || '';
      source = 'custom_storage';
    }
  }

  const envUrl = 
    (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_SHEET_WEBAPP_URL) ||
    (typeof process !== 'undefined' && (process.env.VITE_SHEET_WEBAPP_URL || process.env.GOOGLE_SHEETS_WEBAPP_URL)) ||
    '';

  const envSheetId = 
    (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_GOOGLE_SHEETS_ID) ||
    (typeof process !== 'undefined' && (process.env.VITE_GOOGLE_SHEETS_ID || process.env.GOOGLE_SHEETS_ID)) ||
    '';

  if (!webAppUrl && envUrl) {
    webAppUrl = envUrl;
    source = 'environment';
  }

  const defaultWebUrl = 'https://script.google.com/macros/s/AKfycby9Tok8-zgcVsTuXfQBDA0prmRSpUs9kxpeyczsw9SRVjwZBEk6Y8st3tBv7LK7j_X6/exec';
  const defaultSheetDocUrl = 'https://docs.google.com/spreadsheets/d/15loY6F6CMmIJ5qZaafidY6AB0vvrEpsSsE_B0XXBqP4/edit?gid=0#gid=0';

  if (!webAppUrl) {
    webAppUrl = defaultWebUrl;
  }
  if (!sheetDocUrl || sheetDocUrl.includes('1AsramaHajiEmbarkasiJakartaSIM')) {
    sheetDocUrl = defaultSheetDocUrl;
  }

  if (!sheetId && envSheetId) {
    sheetId = envSheetId;
  }

  return {
    webAppUrl,
    sheetDocUrl,
    sheetId: sheetId && !sheetId.includes('1AsramaHajiEmbarkasiJakartaSIM') ? sheetId : '15loY6F6CMmIJ5qZaafidY6AB0vvrEpsSsE_B0XXBqP4',
    isConfigured: Boolean(webAppUrl),
    source
  };
}

/**
 * Simpan kredensial konfigurasi Web App Google Apps Script ke browser dan backend server
 */
export async function saveSpreadsheetConfig(webAppUrl: string, sheetDocUrl?: string): Promise<boolean> {
  const cleanUrl = sanitizeSpreadsheetWebAppUrl(webAppUrl);
  const cleanDoc = sheetDocUrl?.trim() || '';

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('CUSTOM_SHEET_WEBAPP_URL', cleanUrl);
      if (cleanDoc) {
        localStorage.setItem('CUSTOM_SHEET_DOC_URL', cleanDoc);
      }
    } catch (_) {}
  }

  // Sinkronkan ke backend Express server agar seluruh klien mendapatkan konfigurasi ini
  try {
    const res = await fetch('/api/sheets-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webAppUrl: cleanUrl, sheetDocUrl: cleanDoc })
    });
    return res.ok;
  } catch (err) {
    console.warn('Gagal menyimpan konfigurasi spreadsheet ke server:', err);
    return true;
  }
}

/**
 * Uji koneksi ke endpoint Google Spreadsheet Web App
 */
export async function testSpreadsheetConnection(testUrl: string): Promise<{ success: boolean; message: string; dataCount?: number }> {
  const cleanUrl = sanitizeSpreadsheetWebAppUrl(testUrl);
  if (!cleanUrl || !cleanUrl.startsWith('https://script.google.com/macros/s/')) {
    return {
      success: false,
      message: 'Format URL Web App Google Apps Script tidak valid. Harus diawali dengan https://script.google.com/macros/s/... dan berakhiran /exec'
    };
  }

  // 1. Coba verifikasi melalui proxy backend server terlebih dahulu (menghindari CORS dan isu header)
  try {
    const proxyRes = await fetch('/api/sheets/database', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (proxyRes.ok) {
      const json = await proxyRes.json();
      if (json.status === 'success' && json.data) {
        const data = json.data;
        const count = (data.buildings?.length || 0) + (data.rooms?.length || 0) + (data.transactions?.length || 0);
        return {
          success: true,
          message: 'Koneksi ke Google Spreadsheet berhasil diverifikasi melalui server! Database aktif dan siap digunakan.',
          dataCount: count,
        };
      } else if (json.isForbidden) {
        return {
          success: false,
          message: 'HTTP 403 Forbidden: Akses Web App ditolak. Pastikan pada Deploy Web App, pilihan "Who has access" disetel ke "Anyone" (Siapa saja), bukan "Only myself".',
        };
      }
    }
  } catch (_) {}

  // 2. Direct fetch dari browser
  try {
    const res = await fetch(cleanUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'follow',
    });

    if (!res.ok) {
      if (res.status === 403) {
        return {
          success: false,
          message: 'Koneksi ditolak (HTTP 403 Forbidden). Pastikan pada Google Apps Script > Deploy > Manage deployments > Edit > "Who has access" disetel ke "Anyone" (Siapa saja).',
        };
      }
      return {
        success: false,
        message: `Koneksi ditolak oleh Google Apps Script (HTTP ${res.status}: ${res.statusText}). Pastikan izin deploy diatur ke "Anyone".`,
      };
    }

    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch (_) {
      if (text.includes('accounts.google.com') || text.includes('ServiceLogin')) {
        return {
          success: false,
          message: 'HTTP 403 / Login Google: Web App meminta login akun. Pastikan opsi "Who has access" dipilih "Anyone" (Siapa saja).',
        };
      }
    }

    const data = json?.data || json || {};
    const count = (data.buildings?.length || 0) + (data.rooms?.length || 0) + (data.transactions?.length || 0);

    return {
      success: true,
      message: 'Koneksi ke Google Spreadsheet berhasil diverifikasi! Endpoint Web App aktif dan siap menerima query.',
      dataCount: count,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Gagal menghubungi Google Apps Script: ${err?.message || 'Cek koneksi internet dan izin akses Web App (pilih "Anyone")'}`,
    };
  }
}

/**
 * Contoh fungsi untuk mengambil data dari Google Sheet melalui Web App URL
 */
export async function fetchFromGoogleSheet(sheetName: string): Promise<any[]> {
  // Coba ambil melalui server proxy backend terlebih dahulu untuk menghindari pembatasan CORS browser pada Google Apps Script redirect
  try {
    const proxyRes = await fetch(`/api/sheets/database?sheet=${encodeURIComponent(sheetName)}`);
    if (proxyRes.ok) {
      const json = await proxyRes.json();
      const d = json.data;
      if (Array.isArray(d)) return d;
      if (d && typeof d === 'object') {
        const matchKey = Object.keys(d).find(
          k => k.toLowerCase() === sheetName.toLowerCase() || k.replace(/_/g, '').toLowerCase() === sheetName.replace(/_/g, '').toLowerCase()
        );
        if (matchKey && Array.isArray(d[matchKey])) return d[matchKey];
        if (Array.isArray(d.sheets)) {
          // Jika mengembalikan seluruh struktur database, cari lembar spesifik
          const targetSheetObj = d.sheets.find((s: any) => s.name && s.name.replace(/_/g, '').toLowerCase() === sheetName.replace(/_/g, '').toLowerCase());
          if (targetSheetObj && Array.isArray(targetSheetObj.rows)) return targetSheetObj.rows;
        }
      }
    }
  } catch (_) {}

  const webAppUrl = 
    (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_SHEET_WEBAPP_URL) ||
    (typeof process !== 'undefined' && (process.env.VITE_SHEET_WEBAPP_URL || process.env.GOOGLE_SHEETS_WEBAPP_URL)) ||
    getSpreadsheetConfig().webAppUrl ||
    'https://script.google.com/macros/s/AKfycby9Tok8-zgcVsTuXfQBDA0prmRSpUs9kxpeyczsw9SRVjwZBEk6Y8st3tBv7LK7j_X6/exec';

  if (!webAppUrl) {
    return [];
  }
  
  try {
    const response = await fetch(`${webAppUrl}?sheet=${encodeURIComponent(sheetName)}`, {
      method: 'GET',
      mode: 'cors'
    });
    const result = await response.json();
    if (Array.isArray(result.data)) {
      return result.data;
    }
    if (result.data && typeof result.data === 'object') {
      const matchKey = Object.keys(result.data).find(
        k => k.toLowerCase() === sheetName.toLowerCase() || k.replace(/_/g, '').toLowerCase() === sheetName.replace(/_/g, '').toLowerCase()
      );
      if (matchKey && Array.isArray(result.data[matchKey])) {
        return result.data[matchKey];
      }
    }
    if (Array.isArray(result)) {
      return result;
    }
    return result.data || [];
  } catch (error) {
    return [];
  }
}

/**
 * BACA SELURUH DATABASE DARI GOOGLE SPREADSHEET (VIA DIRECT WEB APP ATAU SERVER PROXY)
 * Berfungsi sebagai Single Source of Truth utama
 */
export async function fetchFullDatabaseFromSpreadsheet(): Promise<CompleteStorageDatabase | null> {
  const cfg = getSpreadsheetConfig();
  const webAppUrl = 
    (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_SHEET_WEBAPP_URL) ||
    cfg.webAppUrl ||
    'https://script.google.com/macros/s/AKfycby9Tok8-zgcVsTuXfQBDA0prmRSpUs9kxpeyczsw9SRVjwZBEk6Y8st3tBv7LK7j_X6/exec';

  // 1. Utamakan pembacaan instan (< 10ms) dari endpoint backend proxy /api/sheets/database
  try {
    const proxyRes = await fetch('/api/sheets/database', {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });

    if (proxyRes.ok) {
      const json = await proxyRes.json();
      if ((json.status === 'success' || json.status === 'cached' || json.status === 'fallback') && json.data) {
        const d = json.data;
        if (d && typeof d === 'object') {
          const normalized = normalizeSpreadsheetPayload(d);
          if (normalized.rooms.length > 0 || normalized.buildings.length > 0 || normalized.users.length > 0) {
            return normalized;
          }
        }
      }
    }
  } catch (e) {
    console.warn('Proxy /api/sheets/database tidak merespons, mencoba akses direct Web App:', e);
  }

  // 2. Fallback direct fetch ke Web App Apps Script jika server proxy offline/preview
  if (webAppUrl) {
    try {
      const directRes = await fetch(webAppUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });

      if (directRes.ok) {
        const json = await directRes.json();
        if (json && json.status !== 'error') {
          const d = json.data || (Array.isArray(json.buildings) || Array.isArray(json.rooms) ? json : null);
          if (d && typeof d === 'object') {
            const normalized = normalizeSpreadsheetPayload(d);
            if (normalized.rooms.length > 0 || normalized.buildings.length > 0 || normalized.users.length > 0) {
              return normalized;
            }
          }
        }
      }
    } catch (directErr) {
      console.warn('Direct fetch to Google Apps Script failed:', directErr);
    }
  }

  return null;
}

/**
 * SIMPAN / SINKRONISASIKAN SELURUH DATABASE KE GOOGLE SPREADSHEET
 */
export async function syncFullDatabaseToSpreadsheet(db: CompleteStorageDatabase): Promise<{ success: boolean; error?: string }> {
  const cfg = getSpreadsheetConfig();

  const sanitizeSettings = (s: any) => {
    if (!s || typeof s !== 'object') return null;
    const copy = { ...s };
    if (typeof copy.appLogo === 'string' && (copy.appLogo.length > 20000 || copy.appLogo.startsWith('data:image/'))) {
      copy.appLogo = 'OFFICIAL_LOGO';
    }
    if (typeof copy.app_logo === 'string' && (copy.app_logo.length > 20000 || copy.app_logo.startsWith('data:image/'))) {
      copy.app_logo = 'OFFICIAL_LOGO';
    }
    return copy;
  };

  const safeAppSettings = sanitizeSettings(db.appSettings);

  const rawRoomsList = Array.isArray(db.rooms) ? db.rooms : [];
  const pureLodgingRooms = rawRoomsList.filter((r: any) => {
    if (!r) return false;
    const b = (r.building || "").toLowerCase();
    const t = (r.type || "").toLowerCase();
    const id = (r.id || "").toLowerCase();
    if (id.startsWith("mr-")) return false;
    if (b.includes("pertemuan") || b.includes("aula") || b.includes("serbaguna")) return false;
    if (t.includes("pertemuan") || t.includes("aula") || t.includes("serbaguna")) return false;
    return true;
  });

  const formattedPayload = {
    action: 'SAVE_ALL',
    timestamp: new Date().toISOString(),
    buildings: Array.isArray(db.buildings) ? db.buildings : [],
    rooms: pureLodgingRooms,
    transactions: Array.isArray(db.transactions) ? db.transactions : [],
    users: Array.isArray(db.users) ? db.users : [],
    meetingRooms: Array.isArray(db.meetingRooms) ? db.meetingRooms : [],
    roomCapacityRates: Array.isArray(db.roomCapacityRates) ? db.roomCapacityRates : [],
    breakfastMenuItems: Array.isArray(db.breakfastMenuItems) ? db.breakfastMenuItems : [],
    breakfastOrders: Array.isArray(db.breakfastOrders) ? db.breakfastOrders : [],
    maintenances: Array.isArray(db.maintenances) ? db.maintenances : [],
    qcInspections: Array.isArray(db.qcInspections) ? db.qcInspections : [],
    workSessions: Array.isArray(db.workSessions) ? db.workSessions : [],
    auditLogs: Array.isArray(db.auditLogs) ? db.auditLogs : [],
    chatChannels: Array.isArray(db.chatChannels) ? db.chatChannels : [],
    chatMessages: Array.isArray(db.chatMessages) ? db.chatMessages : [],
    appSettings: safeAppSettings,
    // Alias snake_case untuk kompatibilitas penuh dengan skrip Google Spreadsheet
    meeting_rooms: Array.isArray(db.meetingRooms) ? db.meetingRooms : [],
    room_capacity_rates: Array.isArray(db.roomCapacityRates) ? db.roomCapacityRates : [],
    breakfast_menu_items: Array.isArray(db.breakfastMenuItems) ? db.breakfastMenuItems : [],
    breakfast_orders: Array.isArray(db.breakfastOrders) ? db.breakfastOrders : [],
    qc_inspections: Array.isArray(db.qcInspections) ? db.qcInspections : [],
    work_sessions: Array.isArray(db.workSessions) ? db.workSessions : [],
    system_logs: Array.isArray(db.auditLogs) ? db.auditLogs : [],
    chat_channels: Array.isArray(db.chatChannels) ? db.chatChannels : [],
    chat_messages: Array.isArray(db.chatMessages) ? db.chatMessages : [],
    app_settings: safeAppSettings,
  };

  // 1. Kirim melalui backend server proxy
  try {
    const proxyRes = await fetch('/api/sheets/database', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...formattedPayload,
        webAppUrl: cfg.webAppUrl || '',
      })
    });

    if (proxyRes.ok) {
      const resJson = await proxyRes.json().catch(() => null);
      if (resJson && resJson.status === 'success') {
        return { success: true };
      }
    }
  } catch (_) {}

  // 2. Fallback: kirim langsung ke Web App Apps Script
  if (cfg.webAppUrl) {
    try {
      const directRes = await fetch(cfg.webAppUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(formattedPayload)
      });

      if (directRes.ok) {
        return { success: true };
      }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Gagal mengirim data ke Google Spreadsheet' };
    }
  }

  return { success: true };
}

/**
 * UPDATE LANGSUNG GEDUNG KE GOOGLE SPREADSHEET
 */
export async function updateBuildingInSpreadsheetDirect(b: Building, previousName?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const cfg = getSpreadsheetConfig();
    if (!cfg.webAppUrl) return { success: true };

    const payload = {
      action: 'UPDATE_BUILDING',
      timestamp: new Date().toISOString(),
      building: b,
      previousName: previousName || null
    };

    fetch(cfg.webAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).catch(() => {});

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * HAPUS LANGSUNG GEDUNG DARI GOOGLE SPREADSHEET
 */
export async function deleteBuildingInSpreadsheetDirect(buildingId: string, buildingName?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const cfg = getSpreadsheetConfig();
    if (!cfg.webAppUrl) return { success: true };

    const payload = {
      action: 'DELETE_BUILDING',
      timestamp: new Date().toISOString(),
      buildingId,
      buildingName: buildingName || null
    };

    fetch(cfg.webAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).catch(() => {});

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Helper normalisasi payload dari Google Spreadsheet menjadi CompleteStorageDatabase
 * Melakukan pemetaan field snake_case dan camelCase untuk seluruh tabel & katalog,
 * serta menyaring sheet konflik/duplikat secara otomatis.
 */
export function normalizeSpreadsheetPayload(d: any): CompleteStorageDatabase {
  if (!d || typeof d !== 'object') {
    return {
      schemaVersion: 4,
      appName: 'SIM-Akomodasi UPT Asrama Haji Jakarta',
      exportedAt: new Date().toISOString(),
      appSettings: null,
      users: [],
      buildings: [],
      rooms: [],
      meetingRooms: [],
      roomCapacityRates: [],
      breakfastMenuItems: [],
      transactions: [],
      maintenances: [],
      qcInspections: [],
      breakfastOrders: [],
      workSessions: [],
      auditLogs: [],
      chatChannels: [],
      chatMessages: [],
      passwordResetRequests: []
    };
  }

  // Bersihkan key konflik (seperti users_conflict...) agar tidak digunakan
  for (const k of Object.keys(d)) {
    if (k.toLowerCase().includes('conflict')) {
      delete d[k];
    }
  }

  // Helper parsing aman untuk data JSON / Array dari cell Google Spreadsheet
  const safeParseJson = <T>(val: any, fallback: T): T => {
    if (!val) return fallback;
    if (typeof val === 'object') return val as T;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          return JSON.parse(trimmed) as T;
        } catch (_) {
          return fallback;
        }
      }
    }
    return fallback;
  };

  const safeArray = (val: any): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed.map(String);
        } catch (_) {}
      }
      return trimmed.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  };

  const safeBool = (val: any, defaultVal: boolean = false): boolean => {
    if (val === undefined || val === null || val === '') return defaultVal;
    if (typeof val === 'boolean') return val;
    const str = String(val).toLowerCase().trim();
    if (str === 'true' || str === '1' || str === 'ya' || str === 'yes') return true;
    if (str === 'false' || str === '0' || str === 'tidak' || str === 'no') return false;
    return defaultVal;
  };

  // 1. Normalisasi Katalog Tipe Kamar & Tarif Kapasitas
  const rawRates = Array.isArray(d.roomCapacityRates) ? d.roomCapacityRates : (Array.isArray(d.room_capacity_rates) ? d.room_capacity_rates : []);
  const normalizedRates = rawRates.map((r: any) => ({
    id: String(r.id || `rcr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`),
    roomType: r.roomType || r.room_type || 'Standar',
    bedType: r.bedType || r.bed_type || 'Double Bed',
    capacityPax: Number(r.capacityPax || r.capacity_pax || r.capacityNumber || r.capacity_number || 2),
    pricePerNight: Number(r.pricePerNight || r.price_per_night || r.tarif || r.harga || 0),
    description: r.description || '',
    facilities: safeArray(r.facilities),
    isActive: safeBool(r.isActive ?? r.is_active, true),
    updatedAt: r.updatedAt || r.updated_at || undefined,
  }));

  // 2. Normalisasi Katalog Menu Sarapan & Katering Koperasi
  const rawMenus = Array.isArray(d.breakfastMenuItems) ? d.breakfastMenuItems : (Array.isArray(d.breakfast_menu_items) ? d.breakfast_menu_items : []);
  const normalizedMenus = rawMenus.map((m: any) => ({
    id: String(m.id || `menu-${Date.now()}`),
    name: m.name || '',
    category: m.category || 'MAKANAN_BERAT',
    price: Number(m.price || 0),
    description: m.description || '',
    isAvailable: safeBool(m.isAvailable ?? m.is_available, true),
    allergens: m.allergens || '',
    updatedAt: m.updatedAt || m.updated_at || undefined,
  }));

  // 3. Normalisasi Master Unit Kamar (Lengkap dengan seluruh status & relasi - Murni Kamar Hunian)
  const rawRooms = Array.isArray(d.rooms) ? d.rooms : [];
  const pureRooms = rawRooms.filter((r: any) => {
    if (!r) return false;
    const b = (r.building || r.gedung || "").toLowerCase();
    const t = (r.type || r.room_type || r.roomType || "").toLowerCase();
    const id = (r.id || "").toLowerCase();
    if (id.startsWith("mr-")) return false;
    if (b.includes("pertemuan") || b.includes("aula") || b.includes("serbaguna")) return false;
    if (t.includes("pertemuan") || t.includes("aula") || t.includes("serbaguna")) return false;
    return true;
  });
  const normalizedRooms = pureRooms.map((r: any, idx: number) => {
    const roomNumber = String(r.roomNumber || r.room_number || r.no_kamar || r.nomor_kamar || '').trim();
    const building = String(r.building || r.gedung || '').trim();
    const id = String(r.id || `room-${building.replace(/[^a-zA-Z0-9]/g, '')}-${roomNumber || idx + 1}`);
    const buildingId = r.buildingId || r.building_id || undefined;
    const floor = Number(r.floor || r.lantai || 1);
    const type = String(r.type || r.room_type || r.roomType || 'Standar').trim();
    const bedType = r.bedType || r.bed_type || undefined;
    const capacityNumber = r.capacityNumber !== undefined 
      ? Number(r.capacityNumber) 
      : (r.capacity_number !== undefined 
          ? Number(r.capacity_number) 
          : (r.capacityPax !== undefined ? Number(r.capacityPax) : (r.capacity_pax !== undefined ? Number(r.capacity_pax) : undefined)));
    const capacity = String(r.capacity || r.kapasitas || (capacityNumber ? `${capacityNumber} Bed` : '2 Orang'));
    const status = (r.status || r.room_status || 'KOSONG').toString().toUpperCase();
    const qcStatus = (r.qcStatus || r.qc_status || 'LOLOS_QC').toString().toUpperCase();
    const pricePerNight = Number(r.pricePerNight || r.price_per_night || r.tarif || r.harga || 0);
    const facilities = safeArray(r.facilities);
    const lastQcDate = r.lastQcDate || r.last_qc_date || undefined;
    const lastQcBy = r.lastQcBy || r.last_qc_by || undefined;
    const lastQcNotes = r.lastQcNotes || r.last_qc_notes || undefined;
    const activeTxId = r.activeTxId || r.active_tx_id || null;
    const activeMaintId = r.activeMaintId || r.active_maint_id || null;
    const notes = String(r.notes || r.catatan || '');
    const createdAt = r.createdAt || r.created_at || undefined;
    const updatedAt = r.updatedAt || r.updated_at || undefined;

    return {
      id,
      roomNumber,
      building,
      buildingId,
      floor,
      type,
      bedType,
      capacity,
      capacityNumber,
      status: (['KOSONG', 'TERISI', 'BOOKED', 'MAINTENANCE'].includes(status) ? status : 'KOSONG') as any,
      qcStatus: (['LOLOS_QC', 'PERLU_INSPEKSI', 'PERLU_PERBAIKAN', 'MENUNGGU_QC'].includes(qcStatus) ? qcStatus : 'LOLOS_QC') as any,
      pricePerNight,
      facilities,
      lastQcDate,
      lastQcBy,
      lastQcNotes,
      activeTxId,
      activeMaintId,
      notes,
      createdAt,
      updatedAt,
    };
  });

  // 4. Normalisasi Ruang Pertemuan / Aula
  const rawMeeting = Array.isArray(d.meetingRooms) ? d.meetingRooms : (Array.isArray(d.meeting_rooms) ? d.meeting_rooms : []);
  const normalizedMeeting = rawMeeting.map((m: any) => ({
    id: String(m.id || ''),
    name: m.name || '',
    code: m.code || undefined,
    category: m.category || (m.name && m.name.toLowerCase().includes('serbaguna') ? 'SERBAGUNA' : 'AULA'),
    building: m.building || m.gedung || '',
    floor: Number(m.floor || m.lantai || 1),
    capacity: String(m.capacity || m.kapasitas || '100 - 1500 Orang'),
    capacityNumber: Number(m.capacityNumber || m.capacity_number || 0) || undefined,
    dailyRate: Number(m.dailyRate || m.rate_full_day || m.rateFullDay || 0),
    sessionRate: Number(m.sessionRate || m.rate_half_day || m.rateHalfDay || 0),
    status: (m.status || 'TERSEDIA').toString().toUpperCase() as any,
    qcStatus: m.qcStatus || m.qc_status || 'LOLOS_QC',
    facilities: safeArray(m.facilities || m.amenities),
    description: m.description || '',
    activeTxId: m.activeTxId || m.active_tx_id || null,
    activeMaintId: m.activeMaintId || m.active_maint_id || null,
    createdAt: m.createdAt || m.created_at || undefined,
    updatedAt: m.updatedAt || m.updated_at || undefined,
  }));

  // 5. Normalisasi Inspeksi QC
  const rawQc = Array.isArray(d.qcInspections) ? d.qcInspections : (Array.isArray(d.qc_inspections) ? d.qc_inspections : []);
  const normalizedQc = rawQc.map((q: any) => ({
    id: String(q.id || `qc-${Date.now()}`),
    roomId: String(q.roomId || q.room_id || ''),
    building: q.building || q.gedung || '',
    roomNumber: String(q.roomNumber || q.room_number || ''),
    inspectorId: String(q.inspectorId || q.inspector_id || ''),
    inspectorName: q.inspectorName || q.inspector_name || 'Petugas QC',
    inspectionDate: q.inspectionDate || q.inspection_date || new Date().toISOString(),
    cleanliness: q.cleanliness || 'BAIK',
    linenBed: q.linenBed || q.linen_bed || 'LENGKAP_BERSIH',
    acElectricity: q.acElectricity || q.ac_electricity || 'NORMAL',
    plumbingWater: q.plumbingWater || q.plumbing_water || 'LANCAR',
    amenities: q.amenities || 'LENGKAP',
    result: q.result || 'LOLOS_QC',
    decisionType: q.decisionType || q.decision_type || undefined,
    notes: q.notes || '',
    maintenanceIdCreated: q.maintenanceIdCreated || q.maintenance_id_created || undefined,
    facilityType: q.facilityType || q.facility_type || 'KAMAR',
    updatedAt: q.updatedAt || q.updated_at || undefined,
  }));

  // 6. Normalisasi Sesi Jam Kerja Petugas
  const rawWork = Array.isArray(d.workSessions) ? d.workSessions : (Array.isArray(d.work_sessions) ? d.work_sessions : []);
  const normalizedWork = rawWork.map((w: any) => ({
    id: String(w.id || `ws-${Date.now()}`),
    userId: String(w.userId || w.user_id || ''),
    userName: w.userName || w.user_name || '',
    userRole: w.userRole || w.user_role || '',
    department: w.department || undefined,
    assignedBuilding: w.assignedBuilding || w.assigned_building || undefined,
    loginTime: w.loginTime || w.login_time || '',
    logoutTime: w.logoutTime || w.logout_time || null,
    durationSeconds: Number(w.durationSeconds || w.duration_seconds || 0),
    durationFormatted: w.durationFormatted || w.duration_formatted || '',
    status: (w.status || 'SELESAI') as 'AKTIF' | 'SELESAI',
    lastHeartbeat: w.lastHeartbeat || w.last_heartbeat || undefined,
    deviceInfo: w.deviceInfo || w.device_info || undefined,
    notes: w.notes || '',
  }));

  // 7. Normalisasi Profil Lembaga & Pengaturan SIM
  let settingsObj: any = null;
  if (d.appSettings && typeof d.appSettings === 'object' && !Array.isArray(d.appSettings)) {
    settingsObj = { ...d.appSettings };
  } else if (Array.isArray(d.app_settings) && d.app_settings.length > 0) {
    const s = d.app_settings[0];
    settingsObj = {
      organizationName: s.organizationName || s.organization_name || '',
      subTitle: s.subTitle || s.sub_title || '',
      ministryName: s.ministryName || s.ministry_name || '',
      address: s.address || '',
      phone: s.phone || '',
      email: s.email || '',
      portalUrl: s.portalUrl || s.portal_url || '',
      tagTitle: s.tagTitle || s.tag_title || '',
      appLogo: s.appLogo || s.app_logo || undefined,
      appFavicon: s.appFavicon || s.app_favicon || undefined,
      updatedAt: s.updatedAt || s.updated_at || undefined,
    };
  }

  if (settingsObj) {
    const curLogo = settingsObj.appLogo || settingsObj.app_logo;
    if (!curLogo || curLogo === 'OFFICIAL_LOGO' || curLogo === 'DEFAULT_LOGO') {
      settingsObj.appLogo = OFFICIAL_APP_LOGO;
    }
  }

  // 8. Normalisasi Log Audit
  const rawAudit = Array.isArray(d.auditLogs) ? d.auditLogs : (Array.isArray(d.system_logs) ? d.system_logs : []);
  const normalizedAudit = rawAudit.map((a: any) => ({
    id: String(a.id || `log-${Date.now()}`),
    timestamp: a.timestamp || new Date().toISOString(),
    user: a.user || a.username || 'Sistem',
    role: a.role || 'Admin',
    action: a.action || 'SISTEM',
    details: a.details || a.detail || '',
    durationMinutes: Number(a.durationMinutes || a.duration_minutes || 0) || undefined,
    verificationCode: a.verificationCode || a.verification_code || undefined,
    documentTitle: a.documentTitle || a.document_title || undefined,
    targetId: a.targetId || a.target_id || undefined,
    signatoryName: a.signatoryName || a.signatory_name || undefined,
    signatoryRole: a.signatoryRole || a.signatory_role || undefined,
    signatoryNip: a.signatoryNip || a.signatory_nip || undefined,
    qrCodeHash: a.qrCodeHash || a.qr_code_hash || undefined,
    hasQrAndSignature: safeBool(a.hasQrAndSignature ?? a.has_qr_and_signature, false),
  }));

  // 9. Normalisasi Pesanan Sarapan & Katering
  const rawOrders = Array.isArray(d.breakfastOrders) ? d.breakfastOrders : (Array.isArray(d.breakfast_orders) ? d.breakfast_orders : []);
  const normalizedOrders = rawOrders.map((o: any) => ({
    id: String(o.id || `ord-${Date.now()}`),
    roomNumber: String(o.roomNumber || o.room_number || ''),
    building: String(o.building || o.gedung || ''),
    guestName: String(o.guestName || o.guest_name || ''),
    phone: o.phone || undefined,
    kloter: o.kloter || undefined,
    transactionId: o.transactionId || o.transaction_id || undefined,
    menuId: o.menuId || o.menu_id || undefined,
    menuName: String(o.menuName || o.menu_name || ''),
    portions: Number(o.portions || o.porsi || 1),
    days: Number(o.days || o.hari || 1),
    startDate: o.startDate || o.start_date || o.order_date || o.orderDate || new Date().toISOString().split('T')[0],
    deliveryTime: o.deliveryTime || o.delivery_time || '06:30',
    status: (o.status || 'MENUNGGU') as any,
    pricePerPortion: Number(o.pricePerPortion || o.price_per_portion || 0) || undefined,
    totalPrice: Number(o.totalPrice || o.total_price || 0),
    dietaryRestriction: o.dietaryRestriction || o.dietary_restriction || undefined,
    notes: o.notes || o.catatan || '',
    cancelReason: o.cancelReason || o.cancel_reason || undefined,
    cancelledAt: o.cancelledAt || o.cancelled_at || undefined,
    createdAt: o.createdAt || o.created_at || new Date().toISOString(),
    updatedAt: o.updatedAt || o.updated_at || undefined,
  }));

  // 10. Normalisasi Transaksi / Reservasi Tamu (Lengkap seluruh kolom operasional, DP, Aula & Rombongan)
  const rawTransactions = Array.isArray(d.transactions) ? d.transactions : [];
  const normalizedTransactions = rawTransactions.map((t: any) => {
    const allocatedRooms = safeArray(t.allocatedRoomNumbers || t.allocated_room_numbers);
    const extendHist = safeParseJson(t.extendHistory || t.extend_history, []);

    return {
      id: String(t.id || `tx-${Date.now()}`),
      roomId: String(t.roomId || t.room_id || ''),
      roomNumber: String(t.roomNumber || t.room_number || ''),
      building: String(t.building || t.gedung || ''),
      guestName: String(t.guestName || t.guest_name || t.nama_tamu || ''),
      guestType: (t.guestType || t.guest_type || (t.isGroup || t.is_group ? 'ROMBONGAN' : 'INDIVIDU')) as any,
      nikKtp: t.nikKtp || t.nik_ktp || t.nik || undefined,
      kloter: String(t.kloter || ''),
      phone: String(t.phone || t.no_hp || ''),
      email: t.email ? String(t.email) : undefined,
      category: t.category || t.kategori || 'INDIVIDU',
      status: t.status || 'TERISI',
      startDate: t.startDate || t.start_date || new Date().toISOString().split('T')[0],
      duration: Number(t.duration || t.durasi || 1),
      durationUnit: t.durationUnit || t.duration_unit || 'Malam',
      pricePerNight: Number(t.pricePerNight || t.price_per_night || 0) || undefined,
      totalAmount: Number(t.totalAmount || t.total_amount || t.total_biaya || 0),
      paymentStatus: (t.paymentStatus || t.payment_status || 'LUNAS') as any,
      paymentMethod: t.paymentMethod || t.payment_method || undefined,
      paymentDate: t.paymentDate || t.payment_date || undefined,
      paymentNote: t.paymentNote || t.payment_note || undefined,
      kwitansiNo: t.kwitansiNo || t.kwitansi_no || undefined,
      isPaid: safeBool(t.isPaid ?? t.is_paid, false),
      paidAmount: Number(t.paidAmount || t.paid_amount || 0) || undefined,
      dpAmount: Number(t.dpAmount || t.dp_amount || 0) || undefined,
      dpDate: t.dpDate || t.dp_date || undefined,
      dpMethod: t.dpMethod || t.dp_method || undefined,
      dpNote: t.dpNote || t.dp_note || undefined,
      remainingAmount: Number(t.remainingAmount || t.remaining_amount || 0) || undefined,
      alreadyPaid: Number(t.alreadyPaid || t.already_paid || 0) || undefined,
      vaNumber: t.vaNumber || t.va_number || undefined,
      vaAccountName: t.vaAccountName || t.va_account_name || undefined,
      bankName: t.bankName || t.bank_name || undefined,
      bankAccountNumber: t.bankAccountNumber || t.bank_account_number || undefined,
      isGroup: safeBool(t.isGroup ?? t.is_group, false),
      groupId: t.groupId || t.group_id || undefined,
      groupType: t.groupType || t.group_type || undefined,
      groupName: t.groupName || t.group_name || undefined,
      groupPic: t.groupPic || t.group_pic || undefined,
      groupPicPhone: t.groupPicPhone || t.group_pic_phone || undefined,
      totalPax: Number(t.totalPax || t.total_pax || 0) || undefined,
      agencyOrDocument: t.agencyOrDocument || t.agency_or_document || undefined,
      spkNumber: t.spkNumber || t.spk_number || undefined,
      allocatedRoomNumbers: allocatedRooms.length > 0 ? allocatedRooms : undefined,
      allocatedRoomsCount: Number(t.allocatedRoomsCount || t.allocated_rooms_count || allocatedRooms.length || 0) || undefined,
      includeAula: safeBool(t.includeAula ?? t.include_aula, false),
      rentAulaId: t.rentAulaId || t.rent_aula_id || undefined,
      rentAulaName: t.rentAulaName || t.rent_aula_name || undefined,
      rentAulaDuration: Number(t.rentAulaDuration || t.rent_aula_duration || 0) || undefined,
      rentAulaDurationDays: Number(t.rentAulaDurationDays || t.rent_aula_duration_days || 0) || undefined,
      rentAulaSession: t.rentAulaSession || t.rent_aula_session || undefined,
      cateringPackage: t.cateringPackage || t.catering_package || undefined,
      cateringPaxCount: Number(t.cateringPaxCount || t.catering_pax_count || 0) || undefined,
      breakfast: safeBool(t.breakfast, false),
      breakfastMenu: t.breakfastMenu || t.breakfast_menu || undefined,
      breakfastPortions: Number(t.breakfastPortions || t.breakfast_portions || 0) || undefined,
      breakfastDays: Number(t.breakfastDays || t.breakfast_days || 0) || undefined,
      breakfastStatus: t.breakfastStatus || t.breakfast_status || undefined,
      rentType: t.rentType || t.rent_type || undefined,
      extraBed: safeBool(t.extraBed ?? t.extra_bed, false),
      extraBedCount: Number(t.extraBedCount || t.extra_bed_count || 0) || undefined,
      extraBedPrice: Number(t.extraBedPrice || t.extra_bed_price || 0) || undefined,
      extraBedNotes: t.extraBedNotes || t.extra_bed_notes || undefined,
      checkInTime: t.checkInTime || t.check_in_time || undefined,
      checkOutTime: t.checkOutTime || t.check_out_time || undefined,
      notes: t.notes || t.catatan || '',
      createdUser: t.createdUser || t.created_user || 'Petugas',
      createdAt: t.createdAt || t.created_at || new Date().toISOString(),
      updatedAt: t.updatedAt || t.updated_at || undefined,
      cancelledAt: t.cancelledAt || t.cancelled_at || undefined,
      cancelReason: t.cancelReason || t.cancel_reason || undefined,
      cancelledUser: t.cancelledUser || t.cancelled_user || undefined,
      extendedCount: Number(t.extendedCount || t.extended_count || 0) || undefined,
      extendHistory: Array.isArray(extendHist) && extendHist.length > 0 ? extendHist : undefined,
    };
  });

  // 11. Normalisasi Perawatan / Maintenance
  const rawMaintenances = Array.isArray(d.maintenances) ? d.maintenances : [];
  const normalizedMaintenances = rawMaintenances.map((m: any) => ({
    id: String(m.id || `maint-${Date.now()}`),
    roomId: String(m.roomId || m.room_id || ''),
    roomNumber: String(m.roomNumber || m.room_number || ''),
    building: String(m.building || m.gedung || ''),
    category: m.category || 'Fasilitas Kamar',
    issue: String(m.issue || m.kerusakan || ''),
    description: String(m.description || m.deskripsi || m.issue || ''),
    urgency: m.urgency || 'SEDANG',
    status: m.status || 'MENUNGGU_PENUGASAN',
    technician: m.technician || 'Belum Ditugaskan',
    assignedTechnicianId: m.assignedTechnicianId || m.assigned_technician_id || undefined,
    assignedTechnicianName: m.assignedTechnicianName || m.assigned_technician_name || undefined,
    assignedByManager: m.assignedByManager || m.assigned_by_manager || undefined,
    assignedTime: m.assignedTime || m.assigned_time || undefined,
    managerNotes: m.managerNotes || m.manager_notes || undefined,
    technicianNotes: m.technicianNotes || m.technician_notes || m.notes || m.catatan || '',
    workCompletedTime: m.workCompletedTime || m.work_completed_time || undefined,
    reporter: m.reporter || m.reportedUser || m.reported_user || 'Resepsionis',
    reportedUser: m.reportedUser || m.reported_user || m.reporter || 'Resepsionis',
    reportTime: m.reportTime || m.report_time || m.created_at || m.createdAt || new Date().toISOString(),
    resolvedTime: m.resolvedTime || m.resolved_time || m.resolved_at || m.resolvedAt || undefined,
    qcInspectionId: m.qcInspectionId || m.qc_inspection_id || undefined,
    qcVerdict: m.qcVerdict || m.qc_verdict || undefined,
    facilityType: m.facilityType || m.facility_type || 'KAMAR',
    updatedAt: m.updatedAt || m.updated_at || undefined,
  }));

  // 12. Normalisasi Data Pengguna
  const rawUsers = Array.isArray(d.users) ? d.users : [];
  const normalizedUsers = rawUsers
    .filter((u: any) => u && typeof u === 'object')
    .map((u: any, idx: number) => {
      const username = String(u.username || u.user_name || '').trim();
      const fullName = String(u.fullName || u.full_name || u.name || username || 'Petugas').trim();
      const assignedBuilding = String(u.assignedBuilding || u.assigned_building || u.building || 'Semua Gedung').trim();
      const role = u.role || 'Resepsionis';
      const password = String(u.password || '12345');
      const department = typeof u.department === 'string' ? u.department : (u.department ? String(u.department) : 'Operasional');
      const supervisorId = u.supervisorId || u.supervisor_id || undefined;
      const phone = String(u.phone || '-');
      const status = String(u.status || 'Aktif');
      const email = u.email ? String(u.email) : undefined;
      const nip = u.nip ? String(u.nip) : undefined;
      const id = String(u.id || `user-${username.toLowerCase().replace(/[^a-z0-9]/g, '') || idx + 1}`);
      const permissions = safeParseJson(u.permissions, undefined);

      return {
        id,
        username,
        fullName,
        role,
        password,
        department,
        supervisorId,
        assignedBuilding,
        phone,
        status,
        email,
        nip,
        isOwner: Boolean(u.isOwner ?? u.is_owner ?? false),
        signatureUrl: u.signatureUrl || u.signature_url || undefined,
        qrCodeUrl: u.qrCodeUrl || u.qr_code_url || undefined,
        permissions,
        updatedAt: u.updatedAt || u.updated_at || undefined,
      };
    });

  // 13. Normalisasi Master Gedung
  const rawBuildings = Array.isArray(d.buildings) ? d.buildings : [];
  const normalizedBuildings = rawBuildings
    .filter((b: any) => b && typeof b === 'object')
    .map((b: any, idx: number) => {
      const name = String(b.name || b.nama || `Gedung ${String.fromCharCode(65 + idx)}`).trim();
      const code = String(b.code || b.kode || name.charAt(0)).trim();
      const id = String(b.id || `bld-${code.toLowerCase() || idx + 1}`);
      const floors = Number(b.floors || b.lantai || 3);
      const totalRooms = Number(b.totalRooms || b.total_rooms || b.jumlah_kamar || 0);
      const capacityDesc = b.capacityDesc || b.capacity_desc || undefined;
      const category = b.category || b.kategori || 'PENGINAPAN';
      const status = (b.status || 'AKTIF').toString().toUpperCase() === 'NONAKTIF' ? 'NONAKTIF' : 'AKTIF';
      const description = String(b.description || b.deskripsi || '');
      const createdAt = b.createdAt || b.created_at || undefined;
      const updatedAt = b.updatedAt || b.updated_at || undefined;

      return {
        id,
        name,
        code,
        floors,
        totalRooms,
        capacityDesc,
        category,
        status: status as 'AKTIF' | 'NONAKTIF',
        description,
        createdAt,
        updatedAt,
      };
    });

  // 14. Normalisasi Saluran Chat (Grup Divisi & Chat Personal)
  const rawChannels = Array.isArray(d.chatChannels) ? d.chatChannels : (Array.isArray(d.chat_channels) ? d.chat_channels : []);
  const normalizedChatChannels = rawChannels.map((c: any) => ({
    id: String(c.id || ''),
    name: String(c.name || 'Ruang Obrolan'),
    type: (c.type === 'DIRECT' ? 'DIRECT' : 'GROUP') as 'DIRECT' | 'GROUP',
    scope: (c.scope || 'ALL_MANAGERS_GROUP') as any,
    department: c.department || undefined,
    participantIds: safeArray(c.participantIds || c.participant_ids),
    description: c.description || '',
    icon: c.icon || (c.type === 'DIRECT' ? 'fa-user' : 'fa-comments'),
    lastMessage: c.lastMessage || c.last_message || undefined,
    lastMessageTime: c.lastMessageTime || c.last_message_time || undefined,
    lastSenderName: c.lastSenderName || c.last_sender_name || undefined,
  }));

  // 15. Normalisasi Riwayat Pesan Chat
  const rawMessages = Array.isArray(d.chatMessages) ? d.chatMessages : (Array.isArray(d.chat_messages) ? d.chat_messages : []);
  const normalizedChatMessages = rawMessages.map((m: any) => ({
    id: String(m.id || `msg-${Date.now()}`),
    channelId: String(m.channelId || m.channel_id || ''),
    channelType: (m.channelType || m.channel_type || (m.channelId?.startsWith('dm___') ? 'DIRECT' : 'GROUP')) as 'GROUP' | 'DIRECT',
    senderId: String(m.senderId || m.sender_id || ''),
    senderName: String(m.senderName || m.sender_name || 'Petugas'),
    senderRole: String(m.senderRole || m.sender_role || 'Staf'),
    senderDepartment: m.senderDepartment || m.sender_department || undefined,
    message: String(m.message || ''),
    timestamp: m.timestamp || m.created_at || new Date().toISOString(),
    timeFormatted: m.timeFormatted || m.time_formatted || '00:00 WIB',
    priority: (m.priority || 'NORMAL') as any,
    isInstruction: safeBool(m.isInstruction ?? m.is_instruction, false),
    readBy: safeArray(m.readBy || m.read_by),
    replyToId: m.replyToId || m.reply_to_id || undefined,
    replyToSender: m.replyToSender || m.reply_to_sender || undefined,
    replyToText: m.replyToText || m.reply_to_text || undefined,
  }));

  return {
    schemaVersion: 4,
    appName: d.appName || 'SIM-Akomodasi UPT Asrama Haji Jakarta',
    exportedAt: new Date().toISOString(),
    appSettings: settingsObj,
    users: normalizedUsers,
    buildings: normalizedBuildings,
    rooms: normalizedRooms,
    meetingRooms: normalizedMeeting,
    roomCapacityRates: normalizedRates,
    breakfastMenuItems: normalizedMenus,
    transactions: normalizedTransactions,
    maintenances: normalizedMaintenances,
    qcInspections: normalizedQc,
    breakfastOrders: normalizedOrders,
    workSessions: normalizedWork,
    auditLogs: normalizedAudit,
    chatChannels: normalizedChatChannels.length > 0 ? normalizedChatChannels : (Array.isArray(d.chatChannels) ? d.chatChannels : []),
    chatMessages: normalizedChatMessages.length > 0 ? normalizedChatMessages : (Array.isArray(d.chatMessages) ? d.chatMessages : []),
    passwordResetRequests: Array.isArray(d.passwordResetRequests) ? d.passwordResetRequests : []
  };
}

export interface ModuleChecksumItem {
  key: string;
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

export function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

export function computeDatasetChecksums(dataset: {
  buildings?: Building[];
  rooms?: Room[];
  meetingRooms?: MeetingRoom[];
  transactions?: Transaction[];
  maintenances?: Maintenance[];
}) {
  const bldMap = new Map<string, string>();
  (dataset.buildings || []).forEach(b => {
    if (!b || !b.name) return;
    const normName = normalizeBuildingName(b.name);
    if (!normName || normName === 'Ruang Pertemuan' || normName === 'Ruang Pertemuan / Aula' || normName === 'Gedung Serbaguna (SG)') return;
    bldMap.set(normName.toLowerCase(), `${normName}|${Number(b.floors || 1)}`);
  });
  const bldSorted = Array.from(bldMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(e => e[1]);
  const buildingsHash = fnv1aHex(bldSorted.join(';;'));

  const mrMap = new Map<string, string>();
  (dataset.meetingRooms || []).forEach(m => {
    if (!m || !m.id) return;
    mrMap.set(m.id, `${m.id}|${(m.name || '').trim().toLowerCase()}|${Number(m.dailyRate || 0)}|${Number(m.sessionRate || 0)}`);
  });
  const mrSorted = Array.from(mrMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(e => e[1]);
  const meetingRoomsHash = fnv1aHex(mrSorted.join(';;'));

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

  const maintList = dataset.maintenances || [];
  const maintMap = new Map<string, string>();
  maintList.forEach(m => {
    if (!m || !m.id) return;
    maintMap.set(m.id, `${m.id}|${(m.roomNumber || '').trim().toUpperCase()}|${m.status || 'PROSES'}`);
  });
  const maintSorted = Array.from(maintMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(e => e[1]);
  const maintenancesHash = fnv1aHex(maintSorted.join(';;'));

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

export async function validateDatabaseChecksumAgainstSpreadsheet(localDataset: {
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

    const remoteDb = await fetchFullDatabaseFromSpreadsheet();
    if (!remoteDb) {
      return {
        status: 'ERROR',
        localChecksum: localSig.masterChecksum,
        remoteChecksum: 'UNAVAILABLE',
        isMatch: false,
        checkedAt: nowStr,
        modules: [],
        mismatchedModules: [],
        message: 'Tidak dapat mengambil metadata checksum dari Google Spreadsheet.'
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
      message: isMatch ? 'Sinkronisasi database dengan Google Spreadsheet sempurna & valid.' : `Perbedaan terdeteksi pada modul: ${mismatchedModules.join(', ')}`
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
      message: `Gagal memvalidasi checksum dengan Google Spreadsheet: ${err?.message || err}`
    };
  }
}

/**
 * MENGAMBIL RIWAYAT PESAN CHAT SECARA REAL-TIME LANGSUNG DARI GOOGLE SPREADSHEET
 */
export async function fetchChatMessagesFromSpreadsheet(): Promise<ChatMessage[]> {
  try {
    const raw = await fetchFromGoogleSheet('chat_messages');
    if (!Array.isArray(raw)) return [];
    return raw.map((m: any) => ({
      id: String(m.id || `msg-${Date.now()}`),
      channelId: String(m.channelId || m.channel_id || ''),
      channelType: (m.channelType || m.channel_type || (m.channelId?.startsWith('dm___') ? 'DIRECT' : 'GROUP')) as 'GROUP' | 'DIRECT',
      senderId: String(m.senderId || m.sender_id || ''),
      senderName: String(m.senderName || m.sender_name || 'Petugas'),
      senderRole: String(m.senderRole || m.sender_role || 'Staf'),
      senderDepartment: m.senderDepartment || m.sender_department || undefined,
      message: String(m.message || ''),
      timestamp: m.timestamp || m.created_at || new Date().toISOString(),
      timeFormatted: m.timeFormatted || m.time_formatted || '00:00 WIB',
      priority: (m.priority || 'NORMAL') as any,
      isInstruction: Boolean(m.isInstruction ?? m.is_instruction ?? false),
      readBy: Array.isArray(m.readBy || m.read_by) ? (m.readBy || m.read_by) : (typeof (m.readBy || m.read_by) === 'string' ? (m.readBy || m.read_by).split(',').map((s: string) => s.trim()).filter(Boolean) : []),
      replyToId: m.replyToId || m.reply_to_id || undefined,
      replyToSender: m.replyToSender || m.reply_to_sender || undefined,
      replyToText: m.replyToText || m.reply_to_text || undefined
    }));
  } catch (err) {
    console.warn('[SpreadsheetStorage] Gagal memuat chat_messages dari spreadsheet:', err);
    return [];
  }
}

/**
 * MENGAMBIL REKAP SESI & STATUS ONLINE PETUGAS LANGSUNG DARI GOOGLE SPREADSHEET
 */
export async function fetchWorkSessionsFromSpreadsheet(): Promise<WorkSession[]> {
  try {
    const raw = await fetchFromGoogleSheet('work_sessions');
    if (!Array.isArray(raw)) return [];
    return raw.map((w: any) => ({
      id: String(w.id || `ws-${Date.now()}`),
      userId: String(w.userId || w.user_id || ''),
      userName: w.userName || w.user_name || '',
      userRole: w.userRole || w.user_role || '',
      department: w.department || undefined,
      assignedBuilding: w.assignedBuilding || w.assigned_building || undefined,
      loginTime: w.loginTime || w.login_time || '',
      logoutTime: w.logoutTime || w.logout_time || null,
      durationSeconds: Number(w.durationSeconds || w.duration_seconds || 0),
      durationFormatted: w.durationFormatted || w.duration_formatted || '',
      status: (w.status || 'SELESAI') as 'AKTIF' | 'SELESAI',
      lastHeartbeat: w.lastHeartbeat || w.last_heartbeat || undefined,
      deviceInfo: w.deviceInfo || w.device_info || undefined,
      notes: w.notes || undefined
    }));
  } catch (err) {
    console.warn('[SpreadsheetStorage] Gagal memuat work_sessions dari spreadsheet:', err);
    return [];
  }
}

/**
 * MENGAMBIL DAFTAR SALURAN CHAT DARI GOOGLE SPREADSHEET
 */
export async function fetchChatChannelsFromSpreadsheet(): Promise<ChatChannel[]> {
  try {
    const raw = await fetchFromGoogleSheet('chat_channels');
    if (!Array.isArray(raw)) return [];
    return raw.map((c: any) => ({
      id: String(c.id || `ch-${Date.now()}`),
      name: String(c.name || 'Saluran Chat'),
      type: (c.type || (c.id?.startsWith('dm___') ? 'DIRECT' : 'GROUP')) as 'GROUP' | 'DIRECT',
      scope: (c.scope || (c.id?.startsWith('dm___') ? 'DIRECT' : 'ALL_MANAGERS_GROUP')) as any,
      department: c.department || undefined,
      participantIds: Array.isArray(c.participantIds || c.participant_ids)
        ? (c.participantIds || c.participant_ids)
        : (typeof (c.participantIds || c.participant_ids) === 'string'
            ? (() => {
                try {
                  const p = JSON.parse(c.participantIds || c.participant_ids);
                  return Array.isArray(p) ? p : [];
                } catch (_) {
                  return (c.participantIds || c.participant_ids).split(',').map((s: string) => s.trim()).filter(Boolean);
                }
              })()
            : []),
      description: c.description || undefined,
      icon: c.icon || undefined,
      lastMessage: c.lastMessage || c.last_message || undefined,
      lastMessageTime: c.lastMessageTime || c.last_message_time || undefined,
      lastSenderName: c.lastSenderName || c.last_sender_name || undefined
    }));
  } catch (err) {
    console.warn('[SpreadsheetStorage] Gagal memuat chat_channels dari spreadsheet:', err);
    return [];
  }
}

/**
 * POLLING LIVE CHAT & STATUS PRESENSI PETUGAS SECARA PARALEL DARI GOOGLE SPREADSHEET
 */
export async function fetchLiveChatAndPresenceFromSpreadsheet(): Promise<{
  messages: ChatMessage[];
  sessions: WorkSession[];
  channels: ChatChannel[];
}> {
  try {
    const [messages, sessions, channels] = await Promise.all([
      fetchChatMessagesFromSpreadsheet(),
      fetchWorkSessionsFromSpreadsheet(),
      fetchChatChannelsFromSpreadsheet()
    ]);
    return { messages, sessions, channels };
  } catch (err) {
    console.warn('[SpreadsheetStorage] Gagal polling live chat & sesi:', err);
    return { messages: [], sessions: [], channels: [] };
  }
}

/**
 * SIMPAN / KIRIM PESAN CHAT LANGSUNG KE GOOGLE SPREADSHEET (DENGAN PENGGABUNGAN AMAN ID & DATA MASTER)
 */
export async function pushChatMessageToSpreadsheet(
  newMsg: ChatMessage,
  channel?: ChatChannel
): Promise<{ success: boolean; error?: string }> {
  const cfg = getSpreadsheetConfig();
  const webAppUrl = cfg.webAppUrl;
  if (!webAppUrl) return { success: false, error: 'URL Google Spreadsheet belum diatur' };

  try {
    // 1. Simpan di dataStorage lokal terlebih dahulu
    dataStorage.saveChatMessage(newMsg, channel);

    const fullDb = dataStorage.getDatabase();
    const allMessages = fullDb.chatMessages || [];
    const msgMap = new Map<string, any>();
    allMessages.forEach(m => msgMap.set(m.id, m));
    msgMap.set(newMsg.id, newMsg);
    const mergedMessages = Array.from(msgMap.values());

    const allChannels = fullDb.chatChannels || [];
    const chMap = new Map<string, any>();
    allChannels.forEach(c => chMap.set(c.id, c));
    if (channel) chMap.set(channel.id, channel);
    const mergedChannels = Array.from(chMap.values());

    const sanitizeSettings = (s: any) => {
      if (!s || typeof s !== 'object') return null;
      const copy = { ...s };
      if (typeof copy.appLogo === 'string' && (copy.appLogo.length > 20000 || copy.appLogo.startsWith('data:image/'))) {
        copy.appLogo = 'OFFICIAL_LOGO';
      }
      return copy;
    };

    const payload = {
      action: 'SYNC_CHAT',
      timestamp: new Date().toISOString(),
      buildings: fullDb.buildings || [],
      rooms: fullDb.rooms || [],
      meetingRooms: fullDb.meetingRooms || [],
      meeting_rooms: fullDb.meetingRooms || [],
      roomCapacityRates: fullDb.roomCapacityRates || [],
      room_capacity_rates: fullDb.roomCapacityRates || [],
      breakfastMenuItems: fullDb.breakfastMenuItems || [],
      breakfast_menu_items: fullDb.breakfastMenuItems || [],
      transactions: fullDb.transactions || [],
      users: fullDb.users || [],
      maintenances: fullDb.maintenances || [],
      qcInspections: fullDb.qcInspections || [],
      qc_inspections: fullDb.qcInspections || [],
      breakfastOrders: fullDb.breakfastOrders || [],
      breakfast_orders: fullDb.breakfastOrders || [],
      workSessions: fullDb.workSessions || [],
      work_sessions: fullDb.workSessions || [],
      appSettings: sanitizeSettings(fullDb.appSettings),
      app_settings: sanitizeSettings(fullDb.appSettings),
      system_logs: (fullDb.auditLogs || []).slice(0, 100),
      auditLogs: fullDb.auditLogs || [],
      chatChannels: mergedChannels,
      chat_channels: mergedChannels,
      chatMessages: mergedMessages,
      chat_messages: mergedMessages,
    };

    // 2. Kirim update ke Google Spreadsheet
    const res = await fetch(webAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      return { success: true };
    }
    return { success: false, error: `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Gagal mengirim chat ke Spreadsheet' };
  }
}

/**
 * SIMPAN / SINKRONKAN SESI KERJA & DETAK JANTUNG ONLINE KE GOOGLE SPREADSHEET
 */
export async function pushWorkSessionToSpreadsheet(
  session: WorkSession
): Promise<{ success: boolean; error?: string }> {
  const cfg = getSpreadsheetConfig();
  const webAppUrl = cfg.webAppUrl;
  if (!webAppUrl) return { success: false, error: 'URL Google Spreadsheet belum diatur' };

  try {
    dataStorage.saveWorkSession(session);

    const fullDb = dataStorage.getDatabase();
    const allSessions = fullDb.workSessions || [];
    const sessionMap = new Map<string, any>();
    allSessions.forEach(s => sessionMap.set(s.id, s));
    sessionMap.set(session.id, session);
    const mergedSessions = Array.from(sessionMap.values());

    const sanitizeSettings = (s: any) => {
      if (!s || typeof s !== 'object') return null;
      const copy = { ...s };
      if (typeof copy.appLogo === 'string' && (copy.appLogo.length > 20000 || copy.appLogo.startsWith('data:image/'))) {
        copy.appLogo = 'OFFICIAL_LOGO';
      }
      return copy;
    };

    const payload = {
      action: 'SYNC_WORK_SESSIONS',
      timestamp: new Date().toISOString(),
      buildings: fullDb.buildings || [],
      rooms: fullDb.rooms || [],
      meetingRooms: fullDb.meetingRooms || [],
      meeting_rooms: fullDb.meetingRooms || [],
      roomCapacityRates: fullDb.roomCapacityRates || [],
      room_capacity_rates: fullDb.roomCapacityRates || [],
      breakfastMenuItems: fullDb.breakfastMenuItems || [],
      breakfast_menu_items: fullDb.breakfastMenuItems || [],
      transactions: fullDb.transactions || [],
      users: fullDb.users || [],
      maintenances: fullDb.maintenances || [],
      qcInspections: fullDb.qcInspections || [],
      qc_inspections: fullDb.qcInspections || [],
      breakfastOrders: fullDb.breakfastOrders || [],
      breakfast_orders: fullDb.breakfastOrders || [],
      workSessions: mergedSessions,
      work_sessions: mergedSessions,
      appSettings: sanitizeSettings(fullDb.appSettings),
      app_settings: sanitizeSettings(fullDb.appSettings),
      system_logs: (fullDb.auditLogs || []).slice(0, 100),
      auditLogs: fullDb.auditLogs || [],
      chatChannels: fullDb.chatChannels || [],
      chat_channels: fullDb.chatChannels || [],
      chatMessages: fullDb.chatMessages || [],
      chat_messages: fullDb.chatMessages || [],
    };

    const res = await fetch(webAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      return { success: true };
    }
    return { success: false, error: `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Gagal mengirim sesi ke Spreadsheet' };
  }
}

