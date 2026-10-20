import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../store';
import { ActionConfirmModal } from './CatalogManagementModals';
import { normalizeSpreadsheetPayload, syncFullDatabaseToSpreadsheet } from '../services/spreadsheetStorage';

interface SheetReportItem {
  key: string;
  sheetName: string;
  label: string;
  description: string;
  exists: boolean;
  expectedHeaders: string[];
  foundHeaders: string[];
  missingHeaders: string[];
  status: 'READY' | 'MISSING_HEADERS' | 'MISSING_SHEET';
}

interface InspectionResponse {
  ok: boolean;
  overallStatus: 'READY' | 'NEEDS_PROVISIONING' | 'LEGACY_SCRIPT';
  isLegacyAppsScript?: boolean;
  legacyNotice?: string | null;
  totalExpected: number;
  totalReady: number;
  totalMissingSheets: number;
  sheetReports: SheetReportItem[];
  conflictSheetsFound?: string[];
  inspectedAt: string;
}

export function SpreadsheetIntegrationView() {
  const { 
    currentUser, 
    showToast, 
    buildings, 
    rooms, 
    meetingRooms, 
    roomCapacityRates,
    breakfastMenuItems,
    breakfastOrders,
    transactions, 
    users, 
    maintenances, 
    qcInspections,
    workSessions,
    auditLogs,
    appSettings,
    dataStorage,
    pushAllToSupabase,
    pullFromCentralDatabase
  } = useAppContext();

  const defaultWebAppUrl = 'https://script.google.com/macros/s/AKfycby9Tok8-zgcVsTuXfQBDA0prmRSpUs9kxpeyczsw9SRVjwZBEk6Y8st3tBv7LK7j_X6/exec';
  const defaultSheetDocUrl = 'https://docs.google.com/spreadsheets/d/15loY6F6CMmIJ5qZaafidY6AB0vvrEpsSsE_B0XXBqP4/edit?gid=0#gid=0';

  const [scriptUrl, setScriptUrl] = useState(() => {
    try {
      return localStorage.getItem('CUSTOM_SHEET_WEBAPP_URL') || defaultWebAppUrl;
    } catch (_) {
      return defaultWebAppUrl;
    }
  });
  const [sheetDocUrl, setSheetDocUrl] = useState(() => {
    try {
      const saved = localStorage.getItem('CUSTOM_SHEET_DOC_URL');
      if (saved && !saved.includes('1AsramaHajiEmbarkasiJakartaSIM')) return saved;
      return defaultSheetDocUrl;
    } catch (_) {
      return defaultSheetDocUrl;
    }
  });
  const [isConnected, setIsConnected] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isAutoProvisioning, setIsAutoProvisioning] = useState(false);
  const [populateSeedOnProvision, setPopulateSeedOnProvision] = useState(true);
  const [syncStatus, setSyncStatus] = useState<string>('Terkonfigurasi dengan URL Default');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [isForbiddenError, setIsForbiddenError] = useState(false);
  const [isScriptUpdateNeeded, setIsScriptUpdateNeeded] = useState(false);
  const [showWhyMissingGuide, setShowWhyMissingGuide] = useState(true);
  const [isCleaningConflicts, setIsCleaningConflicts] = useState(false);

  // Status Inspeksi Skema Lembar Kerja
  const [inspectionResult, setInspectionResult] = useState<InspectionResponse | null>(null);

  // Data hasil baca dari Spreadsheet (Semua 13 Tabel)
  const [fetchedData, setFetchedData] = useState<{
    buildings?: any[];
    rooms?: any[];
    meeting_rooms?: any[];
    room_capacity_rates?: any[];
    breakfast_menu_items?: any[];
    transactions?: any[];
    users?: any[];
    maintenances?: any[];
    qc_inspections?: any[];
    breakfast_orders?: any[];
    work_sessions?: any[];
    system_logs?: any[];
    app_settings?: any[];
    raw?: any;
  } | null>(null);
  
  const [activePreviewTab, setActivePreviewTab] = useState<
    'BUILDINGS' | 'ROOMS' | 'ROOM_RATES' | 'MEETING_ROOMS' | 'BREAKFAST_MENUS' | 'TRANSACTIONS' | 'USERS' | 'QC' | 'MAINTENANCES' | 'ORDERS' | 'WORK_SESSIONS' | 'RAW'
  >('ROOM_RATES');
  const [activeGuideTab, setActiveGuideTab] = useState<'AUTO' | 'STEP1' | 'STEP2' | 'STEP3' | 'SCRIPT'>('AUTO');
  const [copiedScript, setCopiedScript] = useState(false);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [showPushConfirm, setShowPushConfirm] = useState(false);
  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [syncLogs, setSyncLogs] = useState<Array<{ time: string; type: 'FETCH' | 'PUSH' | 'CONFIG' | 'PROVISION'; message: string; success: boolean }>>([]);

  // Ambil konfigurasi tersimpan saat pertama kali dibuka (dari localStorage dan backend server)
  useEffect(() => {
    try {
      const savedUrl = localStorage.getItem('CUSTOM_SHEET_WEBAPP_URL');
      const savedDocUrl = localStorage.getItem('CUSTOM_SHEET_DOC_URL');
      const savedLastTime = localStorage.getItem('CUSTOM_SHEET_LAST_SYNC');
      
      if (savedUrl) {
        setScriptUrl(savedUrl);
        setIsConnected(true);
        setSyncStatus('Terkonfigurasi dengan URL Web App');
      } else {
        setScriptUrl(defaultWebAppUrl);
      }
      if (savedDocUrl && !savedDocUrl.includes('1AsramaHajiEmbarkasiJakartaSIM')) {
        setSheetDocUrl(savedDocUrl);
      } else {
        setSheetDocUrl(defaultSheetDocUrl);
      }
      if (savedLastTime) {
        setLastSyncTime(savedLastTime);
      }
    } catch (_) {}

    // Selalu sinkronkan dengan status konfigurasi di server backend
    fetch('/api/sheets-config')
      .then(res => res.json())
      .then(cfg => {
        if (cfg && cfg.webAppUrl) {
          setScriptUrl(prev => prev || cfg.webAppUrl || defaultWebAppUrl);
          setIsConnected(true);
          setSyncStatus('Terkonfigurasi dengan Google Spreadsheet (Server)');
          if (cfg.sheetDocUrl || cfg.sheetId) {
            const docUrl = cfg.sheetDocUrl || cfg.sheetId;
            if (docUrl && !docUrl.includes('1AsramaHajiEmbarkasiJakartaSIM')) {
              setSheetDocUrl(prev => (prev && !prev.includes('1AsramaHajiEmbarkasiJakartaSIM')) ? prev : docUrl);
            }
          }
        }
      })
      .catch(() => {});
  }, []);

  const addLog = (type: 'FETCH' | 'PUSH' | 'CONFIG' | 'PROVISION', message: string, success: boolean) => {
    const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setSyncLogs(prev => [{ time: timeStr, type, message, success }, ...prev.slice(0, 19)]);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = scriptUrl.trim();
    if (!cleanUrl.startsWith('https://script.google.com/macros/s/') || !cleanUrl.includes('/exec')) {
      showToast('Format URL Web App Google Apps Script tidak valid! Harus berawalan https://script.google.com/macros/s/... dan berakhiran /exec', 'warning');
      return;
    }
    
    try {
      localStorage.setItem('CUSTOM_SHEET_WEBAPP_URL', cleanUrl);
      if (sheetDocUrl.trim()) {
        localStorage.setItem('CUSTOM_SHEET_DOC_URL', sheetDocUrl.trim());
      }
      setIsConnected(true);
      setSyncStatus('URL Web App Google Apps Script berhasil disimpan');
      addLog('CONFIG', 'URL Web App Google Apps Script berhasil disimpan.', true);
      showToast('Konfigurasi Google Spreadsheet berhasil disimpan!', 'success');

      // Simpan juga ke backend server
      fetch('/api/sheets-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webAppUrl: cleanUrl, sheetId: sheetDocUrl.trim() })
      }).catch(() => {});

      // Langsung lakukan inspeksi deteksi struktur lembar kerja
      handleInspectSchema(cleanUrl);
    } catch (err: any) {
      showToast('Gagal menyimpan konfigurasi ke browser', 'error');
    }
  };

  const handleResetConfig = () => {
    try {
      localStorage.removeItem('CUSTOM_SHEET_WEBAPP_URL');
      localStorage.removeItem('CUSTOM_SHEET_DOC_URL');
      localStorage.removeItem('CUSTOM_SHEET_LAST_SYNC');
      setScriptUrl(defaultWebAppUrl);
      setSheetDocUrl(defaultSheetDocUrl);
      setIsConnected(true);
      setFetchedData(null);
      setInspectionResult(null);
      setSyncStatus('Konfigurasi telah dikembalikan ke URL Default');
      setLastSyncTime(null);
      addLog('CONFIG', 'Konfigurasi Spreadsheet dikembalikan ke URL default resmi.', true);
      showToast('Konfigurasi integrasi Spreadsheet telah dikembalikan ke URL default.', 'info');

      // Sinkronkan juga ke backend server
      fetch('/api/sheets-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webAppUrl: defaultWebAppUrl, sheetId: defaultSheetDocUrl })
      }).catch(() => {});
    } catch (_) {}
  };

  // Bersihkan sheet konflik / duplikat (seperti users_conflict...) secara otomatis
  const handleCleanConflicts = async () => {
    const targetUrl = scriptUrl.trim();
    if (!targetUrl) {
      showToast('Masukkan URL Web App terlebih dahulu!', 'warning');
      return;
    }
    setIsCleaningConflicts(true);
    setSyncStatus('Sedang membersihkan sheet konflik/duplikat di Spreadsheet...');
    try {
      const res = await fetch('/api/sheets/clean-conflicts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webAppUrl: targetUrl })
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Sheet konflik berhasil dibersihkan dari Google Spreadsheet!', 'success');
        addLog('CONFIG', 'Sheet duplikat/konflik berhasil dibersihkan.', true);
        await handleInspectSchema();
      } else {
        throw new Error(data.error || 'Gagal membersihkan sheet konflik');
      }
    } catch (err: any) {
      showToast(`Gagal membersihkan sheet konflik: ${err?.message || 'Error'}`, 'error');
    } finally {
      setIsCleaningConflicts(false);
    }
  };

  // 1. Deteksi & Periksa Struktur Sheet dan Kolom Header
  const handleInspectSchema = async (overrideUrl?: string) => {
    const targetUrl = overrideUrl || scriptUrl.trim();
    if (!targetUrl) {
      showToast('Masukkan URL Web App Google Apps Script terlebih dahulu!', 'warning');
      return;
    }

    setIsInspecting(true);
    setSyncStatus('Sedang mendeteksi lembar kerja & kolom header di Google Spreadsheet...');

    try {
      const res = await fetch('/api/sheets/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webAppUrl: targetUrl })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Gagal melakukan inspeksi`);
      }

      const json: InspectionResponse = await res.json();
      if ((json as any).isForbidden) {
        setIsForbiddenError(true);
        setSyncStatus('Akses Web App ditolak (HTTP 403 Forbidden). Ubah izin deploy Web App menjadi "Anyone" (Siapa Saja).');
        addLog('CONFIG', 'HTTP 403 Forbidden: Akses Web App Google Apps Script dibatasi.', false);
        showToast('HTTP 403 Forbidden: Pastikan izin deploy Web App disetel ke "Anyone" (Siapa saja).', 'error');
        return;
      }

      if (!json.ok) {
        throw new Error((json as any).error || 'Gagal memeriksa skema');
      }

      setIsForbiddenError(false);
      setInspectionResult(json);
      setIsConnected(true);

      const isLegacy = json.isLegacyAppsScript || json.overallStatus === 'LEGACY_SCRIPT';
      const msg = json.overallStatus === 'READY'
        ? `Seluruh struktur tabel lengkap! (${json.totalReady}/${json.totalExpected} lembar kerja siap digunakan)`
        : isLegacy
        ? `Lembar kerja di Google Spreadsheet Anda sebenarnya sudah ada (12 sheet)! Perbarui kode di Extensions > Apps Script dan Deploy Versi Baru agar ke-9 tabel lainnya terbaca.`
        : `Ditemukan ${json.totalMissingSheets} lembar kerja belum dibuat. Klik "Inisialisasi Otomatis" untuk menyusunnya.`;

      setSyncStatus(msg);
      addLog('CONFIG', msg, json.overallStatus === 'READY');
      showToast(msg, json.overallStatus === 'READY' ? 'success' : isLegacy ? 'warning' : 'info');
    } catch (err: any) {
      console.warn('Gagal memanggil endpoint inspeksi server, mencoba direct fetch:', err);
      // Fallback direct request
      try {
        const directRes = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'INSPECT_SCHEMA' })
        });
        if (directRes.status === 403) {
          setIsForbiddenError(true);
          setSyncStatus('HTTP 403 Forbidden: Akses ditolak oleh Google Apps Script.');
          showToast('HTTP 403 Forbidden: Pastikan izin deploy Web App diatur ke "Anyone".', 'error');
          return;
        }
        const directJson = await directRes.json();
        if (directJson && directJson.status === 'success') {
          setIsForbiddenError(false);
          showToast('Koneksi berhasil! Lembar kerja terdeteksi dari Spreadsheet.', 'success');
          setSyncStatus(`Terdeteksi ${directJson.totalSheets || 0} lembar kerja di Google Spreadsheet.`);
        }
      } catch (fallbackErr: any) {
        const is403 = String(err?.message || '').includes('403') || String(fallbackErr?.message || '').includes('403');
        if (is403) setIsForbiddenError(true);
        const errorMsg = is403 
          ? 'HTTP 403 Forbidden: Pastikan izin deploy Web App diatur ke "Anyone" (Siapa Saja).'
          : `Gagal memeriksa Spreadsheet: ${err?.message || 'Cek izin Web App'}`;
        setSyncStatus(errorMsg);
        addLog('CONFIG', errorMsg, false);
        showToast(is403 ? 'HTTP 403 Forbidden: Izin akses Web App dibatasi.' : 'Gagal memeriksa Spreadsheet. Pastikan akses Web App diset ke "Anyone" (Siapa Saja).', 'error');
      }
    } finally {
      setIsInspecting(false);
    }
  };

  // 2. Eksekusi Auto-Provisioning: Otomatis Membuat Sheet & Menyusun Header Kolom
  const handleExecuteAutoProvision = async () => {
    setShowProvisionModal(false);
    if (!scriptUrl.trim()) {
      showToast('Masukkan URL Web App Google Apps Script terlebih dahulu!', 'warning');
      return;
    }

    setIsAutoProvisioning(true);
    setSyncStatus('Sedang otomatis membuat lembar kerja & menyusun baris header tabel di Spreadsheet...');

    let payloadData: any = {};
    try {
      const currentFullDb = dataStorage.getDatabase();
      payloadData = populateSeedOnProvision ? currentFullDb : {};

      const res = await fetch('/api/sheets/auto-provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webAppUrl: scriptUrl.trim(),
          populateData: populateSeedOnProvision,
          data: payloadData
        })
      });

      const resJson = await res.json().catch(() => ({ ok: false, error: 'Respon server tidak valid' }));

      if (!res.ok || !resJson.ok) {
        if (resJson.needsScriptUpdate || resJson.is500 || String(resJson.error || '').includes('500')) {
          setIsScriptUpdateNeeded(true);
          const errorMsg = resJson.error || 'Google Apps Script memerlukan pembaruan kode ke Versi 3.0 (Dukungan 13 Tabel & 74 Kolom).';
          setSyncStatus(errorMsg);
          addLog('PROVISION', errorMsg, false);
          showToast('Pembaruan kode Apps Script diperlukan. Klik tombol "Salin Kode Script Terbaru" di bawah.', 'warning');
          return;
        }

        if (resJson.isForbidden) {
          setIsForbiddenError(true);
          const errorMsg = resJson.error || 'Akses ditolak (HTTP 403). Pastikan akses Web App diatur ke Anyone.';
          setSyncStatus(errorMsg);
          addLog('PROVISION', errorMsg, false);
          showToast(errorMsg, 'error');
          return;
        }

        const errMsg = resJson.error || `HTTP ${res.status}: Gagal melakukan auto-provisioning`;
        setSyncStatus(errMsg);
        addLog('PROVISION', errMsg, false);
        showToast(errMsg, 'error');
        return;
      }

      setIsConnected(true);
      setIsScriptUpdateNeeded(false);
      setIsForbiddenError(false);
      const successMsg = 'Inisialisasi Otomatis Berhasil! Seluruh lembar kerja & header tabel telah dibuat di Google Spreadsheet.';
      setSyncStatus(successMsg);
      addLog('PROVISION', successMsg, true);
      showToast(successMsg, 'success');

      // Jalankan inspeksi kembali agar tampilan tabel langsung berubah menjadi hijau (Siap Digunakan)
      setTimeout(() => {
        handleInspectSchema();
      }, 1000);
    } catch (err: any) {
      console.warn('Kendala koneksi auto-provisioning:', err);
      // Fallback direct request
      try {
        const directPayload = {
          action: 'AUTO_PROVISION',
          populateData: false, // fallback ringan tanpa payload masif
          data: {}
        };
        const directRes = await fetch(scriptUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(directPayload)
        });
        const directJson = await directRes.json().catch(() => null);
        if (directJson && directJson.status === 'success') {
          setIsConnected(true);
          setIsScriptUpdateNeeded(false);
          setIsForbiddenError(false);
          showToast('Inisialisasi otomatis berhasil dijalankan langsung ke Apps Script!', 'success');
          setTimeout(() => handleInspectSchema(), 1000);
          return;
        }
      } catch (_) {}

      const errorMsg = `Gagal inisialisasi: ${err?.message || 'Cek deploy Web App'}`;
      setSyncStatus(errorMsg);
      addLog('PROVISION', errorMsg, false);
      showToast('Gagal melakukan inisialisasi otomatis. Silakan salin kode Google Apps Script terbaru di tab Panduan & Kode Script.', 'warning');
    } finally {
      setIsAutoProvisioning(false);
    }
  };

  // 3. Baca Data dari Spreadsheet via GET
  const handleTestDataFetch = async () => {
    if (!scriptUrl.trim()) {
      showToast('Masukkan URL Web App Google Apps Script terlebih dahulu!', 'warning');
      return;
    }
    setIsLoading(true);
    setSyncStatus('Sedang membaca database dari Google Spreadsheet...');
    
    try {
      // 1. Prioritaskan pembacaan melalui backend proxy server (menghindari CORS dan blokir header)
      let raw: any = null;
      let is403 = false;
      try {
        const proxyRes = await fetch('/api/sheets/database');
        if (proxyRes.ok) {
          const proxyJson = await proxyRes.json();
          if (proxyJson.isForbidden) {
            is403 = true;
          }
          if (proxyJson.status === 'success' && proxyJson.data) {
            raw = proxyJson.data;
          } else if (proxyJson.status === 'fallback' && proxyJson.data) {
            raw = proxyJson.data;
            if (proxyJson.warning) {
              setSyncStatus(proxyJson.warning);
            }
          }
        }
      } catch (_) {}

      // 2. Direct fetch jika proxy belum mengembalikan data
      if (!raw && !is403) {
        const response = await fetch(scriptUrl.trim(), {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        });

        if (response.status === 403) {
          is403 = true;
          throw new Error('HTTP 403 Forbidden: Akses Web App ditolak');
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const text = await response.text();
        try {
          raw = JSON.parse(text);
        } catch (_) {
          if (text.includes('accounts.google.com') || text.includes('ServiceLogin')) {
            is403 = true;
            throw new Error('HTTP 403 Forbidden: Web App meminta login akun');
          }
        }
      }

      if (is403) {
        setIsForbiddenError(true);
        const errMsg = 'Akses Ditolak (HTTP 403 Forbidden). Pastikan deploy Web App diatur ke "Anyone" (Siapa Saja).';
        setSyncStatus(errMsg);
        addLog('FETCH', errMsg, false);
        showToast('Koneksi Ditolak (403 Forbidden). Ubah izin deploy Web App menjadi "Anyone".', 'error');
        return;
      }

      setIsForbiddenError(false);
      const nowStr = new Date().toLocaleString('id-ID');
      setLastSyncTime(nowStr);
      try {
        localStorage.setItem('CUSTOM_SHEET_LAST_SYNC', nowStr);
      } catch (_) {}

      // Normalisasi struktur data yang dikembalikan oleh doGet
      let normalizedBuildings: any[] = [];
      let normalizedRooms: any[] = [];
      let normalizedMeetingRooms: any[] = [];
      let normalizedRoomRates: any[] = [];
      let normalizedBreakfastMenus: any[] = [];
      let normalizedTransactions: any[] = [];
      let normalizedUsers: any[] = [];
      let normalizedMaintenances: any[] = [];
      let normalizedQc: any[] = [];
      let normalizedOrders: any[] = [];
      let normalizedWorkSessions: any[] = [];
      let normalizedLogs: any[] = [];
      let normalizedSettings: any[] = [];

      if (raw && typeof raw === 'object') {
        const d = raw.data || raw;
        if (Array.isArray(d.buildings)) normalizedBuildings = d.buildings;
        if (Array.isArray(d.rooms)) normalizedRooms = d.rooms;
        if (Array.isArray(d.meeting_rooms || d.meetingRooms)) normalizedMeetingRooms = d.meeting_rooms || d.meetingRooms;
        if (Array.isArray(d.room_capacity_rates || d.roomCapacityRates)) normalizedRoomRates = d.room_capacity_rates || d.roomCapacityRates;
        if (Array.isArray(d.breakfast_menu_items || d.breakfastMenuItems)) normalizedBreakfastMenus = d.breakfast_menu_items || d.breakfastMenuItems;
        if (Array.isArray(d.transactions)) normalizedTransactions = d.transactions;
        if (Array.isArray(d.users)) normalizedUsers = d.users;
        if (Array.isArray(d.maintenances)) normalizedMaintenances = d.maintenances;
        if (Array.isArray(d.qc_inspections || d.qcInspections)) normalizedQc = d.qc_inspections || d.qcInspections;
        if (Array.isArray(d.breakfast_orders || d.breakfastOrders)) normalizedOrders = d.breakfast_orders || d.breakfastOrders;
        if (Array.isArray(d.work_sessions || d.workSessions)) normalizedWorkSessions = d.work_sessions || d.workSessions;
        if (Array.isArray(d.system_logs || d.auditLogs)) normalizedLogs = d.system_logs || d.auditLogs;
        if (Array.isArray(d.app_settings || d.appSettings)) normalizedSettings = d.app_settings || d.appSettings;
      }

      setFetchedData({
        buildings: normalizedBuildings,
        rooms: normalizedRooms,
        meeting_rooms: normalizedMeetingRooms,
        room_capacity_rates: normalizedRoomRates,
        breakfast_menu_items: normalizedBreakfastMenus,
        transactions: normalizedTransactions,
        users: normalizedUsers,
        maintenances: normalizedMaintenances,
        qc_inspections: normalizedQc,
        breakfast_orders: normalizedOrders,
        work_sessions: normalizedWorkSessions,
        system_logs: normalizedLogs,
        app_settings: normalizedSettings,
        raw
      });

      setIsConnected(true);
      const summaryMsg = `Berhasil membaca: ${normalizedBuildings.length} Gedung, ${normalizedRooms.length} Kamar, ${normalizedRoomRates.length} Katalog Tipe Kamar, ${normalizedMeetingRooms.length} Aula, ${normalizedTransactions.length} Transaksi, ${normalizedUsers.length} Petugas`;
      setSyncStatus(summaryMsg);
      addLog('FETCH', summaryMsg, true);
      showToast('Koneksi berhasil! Seluruh data dari Google Spreadsheet berhasil terbaca.', 'success');
    } catch (err: any) {
      console.warn('Peringatan pembacaan spreadsheet:', err?.message || err);
      const errStr = String(err?.message || '');
      const is403 = errStr.includes('403') || errStr.includes('Forbidden');
      if (is403) {
        setIsForbiddenError(true);
      }
      const errMsg = is403
        ? 'Akses Ditolak (HTTP 403 Forbidden): Pastikan izin Web App diatur ke "Anyone" (Siapa Saja).'
        : `Gagal membaca Spreadsheet: ${err?.message || 'Pastikan izin Web App diatur ke "Anyone"'}`;
      setSyncStatus(errMsg);
      addLog('FETCH', errMsg, false);
      showToast(is403 ? 'HTTP 403 Forbidden: Akses Web App ditolak. Ubah izin ke "Anyone".' : 'Gagal terhubung ke Spreadsheet.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Terapkan data yang dibaca dari Spreadsheet ke aplikasi
  const handleApplyDataToApp = async () => {
    if (!fetchedData) return;
    setShowApplyConfirm(false);
    setIsLoading(true);

    try {
      const currentDb = dataStorage.getDatabase();
      const rawPayload = fetchedData.raw?.data || fetchedData.raw || fetchedData;
      const normalizedFromSheet = normalizeSpreadsheetPayload(rawPayload);

      const updatedDb = {
        ...currentDb,
        buildings: (normalizedFromSheet.buildings && normalizedFromSheet.buildings.length > 0) ? normalizedFromSheet.buildings : currentDb.buildings,
        rooms: (normalizedFromSheet.rooms && normalizedFromSheet.rooms.length > 0) ? normalizedFromSheet.rooms : currentDb.rooms,
        meetingRooms: (normalizedFromSheet.meetingRooms && normalizedFromSheet.meetingRooms.length > 0) ? normalizedFromSheet.meetingRooms : currentDb.meetingRooms,
        roomCapacityRates: (normalizedFromSheet.roomCapacityRates && normalizedFromSheet.roomCapacityRates.length > 0) ? normalizedFromSheet.roomCapacityRates : currentDb.roomCapacityRates,
        breakfastMenuItems: (normalizedFromSheet.breakfastMenuItems && normalizedFromSheet.breakfastMenuItems.length > 0) ? normalizedFromSheet.breakfastMenuItems : currentDb.breakfastMenuItems,
        transactions: (normalizedFromSheet.transactions && normalizedFromSheet.transactions.length > 0) ? normalizedFromSheet.transactions : currentDb.transactions,
        users: (normalizedFromSheet.users && normalizedFromSheet.users.length > 0) ? normalizedFromSheet.users : currentDb.users,
        maintenances: (normalizedFromSheet.maintenances && normalizedFromSheet.maintenances.length > 0) ? normalizedFromSheet.maintenances : currentDb.maintenances,
        qcInspections: (normalizedFromSheet.qcInspections && normalizedFromSheet.qcInspections.length > 0) ? normalizedFromSheet.qcInspections : currentDb.qcInspections,
        breakfastOrders: (normalizedFromSheet.breakfastOrders && normalizedFromSheet.breakfastOrders.length > 0) ? normalizedFromSheet.breakfastOrders : currentDb.breakfastOrders,
        workSessions: (normalizedFromSheet.workSessions && normalizedFromSheet.workSessions.length > 0) ? normalizedFromSheet.workSessions : currentDb.workSessions,
        auditLogs: (normalizedFromSheet.auditLogs && normalizedFromSheet.auditLogs.length > 0) ? normalizedFromSheet.auditLogs : currentDb.auditLogs,
        appSettings: normalizedFromSheet.appSettings || currentDb.appSettings,
        exportedAt: new Date().toISOString()
      };

      dataStorage.saveDatabase(updatedDb);
      await syncFullDatabaseToSpreadsheet(updatedDb);
      await pushAllToSupabase(updatedDb);
      await pullFromCentralDatabase();

      showToast('Data dari Google Spreadsheet berhasil diterapkan ke sistem dan database!', 'success');
      addLog('FETCH', 'Data dari Spreadsheet berhasil diterapkan ke sistem aplikasi.', true);
    } catch (err: any) {
      showToast(`Gagal menerapkan data: ${err?.message || 'Error'}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Kirim (Export) Data Aplikasi ke Google Spreadsheet via POST
  const handlePushDataToSpreadsheet = async () => {
    setShowPushConfirm(false);
    if (!scriptUrl.trim()) {
      showToast('Masukkan URL Web App terlebih dahulu!', 'warning');
      return;
    }
    setIsPushing(true);
    setSyncStatus('Sedang mengirim data aplikasi ke Google Spreadsheet...');

    try {
      const currentDb = dataStorage.getDatabase();
      const result = await syncFullDatabaseToSpreadsheet(currentDb);
      if (!result.success && result.error) {
        throw new Error(result.error);
      }

      const nowStr = new Date().toLocaleString('id-ID');
      setLastSyncTime(nowStr);
      try {
        localStorage.setItem('CUSTOM_SHEET_LAST_SYNC', nowStr);
      } catch (_) {}

      setSyncStatus('Seluruh data aplikasi & katalog berhasil disinkronkan ke Google Spreadsheet!');
      addLog('PUSH', 'Seluruh data aplikasi berhasil dikirim ke Google Spreadsheet.', true);
      showToast('Data aplikasi & seluruh katalog berhasil disinkronkan ke Google Spreadsheet!', 'success');
    } catch (err: any) {
      console.error('Error pushing data to spreadsheet:', err);
      const errMsg = `Gagal mengirim data ke Spreadsheet: ${err?.message || 'Cek fungsi doPost di Apps Script'}`;
      setSyncStatus(errMsg);
      addLog('PUSH', errMsg, false);
      showToast('Gagal mengirim data ke Spreadsheet. Pastikan fungsi doPost() terpasang di Apps Script.', 'error');
    } finally {
      setIsPushing(false);
    }
  };

  // Kode Google Apps Script Resmi Lengkap (Code.gs)
  const appsScriptCode = `/**
 * ==============================================================================
 * KODE RESMI GOOGLE APPS SCRIPT: INTEGRASI & AUTO-PROVISIONING SIM ASRAMA HAJI
 * Pasang skrip ini di Google Spreadsheet: Menu Extensions > Apps Script
 * Dilengkapi fitur: Menu OnOpen Otomatis, Auto-Create 13 Sheet & Header Row,
 * Pembersihan Sheet Konflik Otomatis, & Toleransi Nama Kolom CamelCase / snake_case.
 * ==============================================================================
 */

// 0. MENU OTOMATIS SAAT SPREADSHEET DIBUKA (UI MENU GOOGLE SPREADSHEET)
function onOpen() {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu("🕌 SIM Asrama Haji")
      .addItem("⚡ Buat Semua 13 Sheet & Header Otomatis", "menuAutoProvisionAllSheets")
      .addItem("⬆️ Isi Data Master Awal (Seed Data)", "menuProvisionWithSeedData")
      .addSeparator()
      .addItem("🧹 Bersihkan Sheet Konflik Otomatis", "menuCleanConflictSheets")
      .addItem("📊 Cek Status & Inspeksi Semua Sheet", "menuInspectAllSheets")
      .addToUi();
  } catch (_) {}
}

function menuAutoProvisionAllSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rep = autoProvisionAllSheets(ss, getDefaultSchema(), false, {});
  SpreadsheetApp.getUi().alert("✅ Berhasil! " + rep.totalCreated + " lembar kerja baru dibuat dan " + rep.totalUpdated + " disesuaikan dengan header baku (Warna Hijau Emerald Kemenag).");
}

function menuProvisionWithSeedData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rep = autoProvisionAllSheets(ss, getDefaultSchema(), true, getDefaultSeedData());
  SpreadsheetApp.getUi().alert("✅ Berhasil! Seluruh 13 lembar kerja dan data master awal asrama haji telah dimuat ke Google Spreadsheet.");
}

function menuCleanConflictSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var deleted = cleanConflictSheets(ss);
  SpreadsheetApp.getUi().alert("🧹 Berhasil! Sebanyak " + deleted + " lembar kerja duplikat/konflik telah dibersihkan.");
}

function menuInspectAllSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rep = inspectAllSheets(ss);
  SpreadsheetApp.getUi().alert("📊 Hasil Inspeksi: Terdeteksi " + rep.totalSheets + " lembar kerja aktif di spreadsheet.");
}

// 1. FUNGSI UNTUK MEMBACA DATA ATAU STATUS DARI SPREADSHEET (GET REQUEST)
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "";

    if (action === "inspect") {
      return ContentService.createTextOutput(JSON.stringify(inspectAllSheets(ss)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Helper pembacaan aman per lembar kerja agar sheet kosong / error tidak menggagalkan seluruh respon
    var safeRead = function(name) {
      try {
        return readSheetAsObjects(ss, name);
      } catch (err) {
        return [];
      }
    };

    // Dukungan permintaan data lembar spesifik via parameter URL ?sheet=nama_sheet
    if (e && e.parameter && e.parameter.sheet) {
      var requestedSheet = e.parameter.sheet;
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        sheet: requestedSheet,
        data: safeRead(requestedSheet)
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var sheetsList = inspectAllSheets(ss).sheets;
    var result = {
      status: "success",
      generatedAt: new Date().toISOString(),
      sheets: sheetsList,
      data: {
        buildings: safeRead("buildings"),
        rooms: safeRead("rooms"),
        meeting_rooms: safeRead("meeting_rooms"),
        room_capacity_rates: safeRead("room_capacity_rates"),
        breakfast_menu_items: safeRead("breakfast_menu_items"),
        transactions: safeRead("transactions"),
        users: safeRead("users"),
        maintenances: safeRead("maintenances"),
        qc_inspections: safeRead("qc_inspections"),
        breakfast_orders: safeRead("breakfast_orders"),
        work_sessions: safeRead("work_sessions"),
        app_settings: safeRead("app_settings"),
        system_logs: safeRead("system_logs"),
        chat_channels: safeRead("chat_channels"),
        chat_messages: safeRead("chat_messages")
      }
    };

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 2. FUNGSI UNTUK MENERIMA PERINTAH PROVISIONING, INSPEKSI, ATAU SIMPAN (POST REQUEST)
function doPost(e) {
  try {
    var contents = e.postData ? e.postData.contents : "";
    var payload = JSON.parse(contents || "{}");
    var ss = null;
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (_) {}
    if (!ss && payload && (payload.spreadsheetId || payload.spreadsheetUrl)) {
      try {
        if (payload.spreadsheetId) ss = SpreadsheetApp.openById(payload.spreadsheetId);
        else if (payload.spreadsheetUrl) ss = SpreadsheetApp.openByUrl(payload.spreadsheetUrl);
      } catch (_) {}
    }
    if (!ss) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "Google Spreadsheet tidak terhubung. Buka Ekstensi (Extensions) > Apps Script langsung dari file Google Spreadsheet Anda."
      })).setMimeType(ContentService.MimeType.JSON);
    }
    var action = payload.action || "SAVE_ALL";

    // AKSI 0: PEMBERSIHAN SHEET KONFLIK (misal: users_conflict...)
    if (action === "CLEAN_CONFLICT_SHEETS") {
      var deletedCount = cleanConflictSheets(ss);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "Pembersihan selesai! Sebanyak " + deletedCount + " sheet konflik telah dihapus.",
        deletedCount: deletedCount
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // AKSI A: INSPEKSI STRUKTUR LEMBAR KERJA & HEADER
    if (action === "INSPECT_SCHEMA") {
      return ContentService.createTextOutput(JSON.stringify(inspectAllSheets(ss)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // AKSI B: AUTO-PROVISIONING (MEMBUAT SHEET & MENATA HEADER OTOMATIS)
    if (action === "AUTO_PROVISION" || action === "INIT_SCHEMA") {
      var schema = payload.schema || getDefaultSchema();
      var populateData = Boolean(payload.populateData);
      var dataObj = payload.data || {};

      cleanConflictSheets(ss); // Bersihkan sheet konflik saat provisioning
      var provisionReport = autoProvisionAllSheets(ss, schema, populateData, dataObj);

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "Auto-provisioning seluruh 13 lembar kerja & header berhasil diselesaikan!",
        report: provisionReport,
        updatedAt: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // AKSI D: SINKRONISASI PESAN CHAT SAJA (SYNC_CHAT / APPEND_CHAT_MESSAGE)
    if (action === "SYNC_CHAT" || action === "APPEND_CHAT_MESSAGE") {
      var cMessages = payload.chatMessages || payload.chat_messages;
      if (Array.isArray(cMessages) && cMessages.length > 0) {
        writeObjectsToSheet(ss, "chat_messages", cMessages, defaultSchema.chat_messages.headers);
      }
      var cChannels = payload.chatChannels || payload.chat_channels;
      if (Array.isArray(cChannels) && cChannels.length > 0) {
        writeObjectsToSheet(ss, "chat_channels", cChannels, defaultSchema.chat_channels.headers);
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "Pesan chat dan saluran berhasil disinkronkan ke Google Spreadsheet!",
        updatedAt: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // AKSI E: SINKRONISASI SESI KERJA & DETAK JANTUNG PRESENSI ONLINE (SYNC_WORK_SESSIONS / UPDATE_PRESENCE)
    if (action === "SYNC_WORK_SESSIONS" || action === "UPDATE_PRESENCE") {
      var wSessions = payload.workSessions || payload.work_sessions;
      if (Array.isArray(wSessions) && wSessions.length > 0) {
        writeObjectsToSheet(ss, "work_sessions", wSessions, defaultSchema.work_sessions.headers);
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "Status online dan sesi kerja petugas berhasil diperbarui di Google Spreadsheet!",
        updatedAt: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // AKSI C: SIMPAN / SINKRONISASI SELURUH DATA (SAVE_ALL)
    cleanConflictSheets(ss); // Bersihkan sheet konflik

    // 1. Pastikan seluruh 13 lembar kerja & header selalu terbuat jika belum ada
    var defaultSchema = getDefaultSchema();
    var schemaKeys = Object.keys(defaultSchema);
    for (var k = 0; k < schemaKeys.length; k++) {
      var sKey = schemaKeys[k];
      var sDef = defaultSchema[sKey];
      var targetSheet = getSheetCaseInsensitive(ss, sDef.sheetName);
      if (!targetSheet) {
        targetSheet = ss.insertSheet(sDef.sheetName);
        ensureSheetDimensions(targetSheet, 1, sDef.headers.length);
        targetSheet.getRange(1, 1, 1, sDef.headers.length).setValues([sDef.headers]);
        var hr = targetSheet.getRange(1, 1, 1, sDef.headers.length);
        hr.setFontWeight("bold");
        hr.setFontColor("#ffffff");
        hr.setBackground("#059669");
        targetSheet.setFrozenRows(1);
        try { targetSheet.autoResizeColumns(1, sDef.headers.length); } catch (_) {}
      }
    }

    // 2. Tulis data ke masing-masing sheet secara aman (hanya jika tabel disertakan)
    if (payload.buildings !== undefined) {
      writeObjectsToSheet(ss, "buildings", Array.isArray(payload.buildings) ? payload.buildings : [], defaultSchema.buildings.headers);
    }
    if (payload.rooms !== undefined) {
      writeObjectsToSheet(ss, "rooms", Array.isArray(payload.rooms) ? payload.rooms : [], defaultSchema.rooms.headers);
    }
    if (payload.meetingRooms !== undefined || payload.meeting_rooms !== undefined) {
      var mRooms = payload.meetingRooms || payload.meeting_rooms || [];
      writeObjectsToSheet(ss, "meeting_rooms", Array.isArray(mRooms) ? mRooms : [], defaultSchema.meeting_rooms.headers);
    }
    if (payload.roomCapacityRates !== undefined || payload.room_capacity_rates !== undefined) {
      var rRates = payload.roomCapacityRates || payload.room_capacity_rates || [];
      writeObjectsToSheet(ss, "room_capacity_rates", Array.isArray(rRates) ? rRates : [], defaultSchema.room_capacity_rates.headers);
    }
    if (payload.breakfastMenuItems !== undefined || payload.breakfast_menu_items !== undefined) {
      var bMenus = payload.breakfastMenuItems || payload.breakfast_menu_items || [];
      writeObjectsToSheet(ss, "breakfast_menu_items", Array.isArray(bMenus) ? bMenus : [], defaultSchema.breakfast_menu_items.headers);
    }
    if (payload.transactions !== undefined) {
      writeObjectsToSheet(ss, "transactions", Array.isArray(payload.transactions) ? payload.transactions : [], defaultSchema.transactions.headers);
    }
    if (payload.users !== undefined) {
      writeObjectsToSheet(ss, "users", Array.isArray(payload.users) ? payload.users : [], defaultSchema.users.headers);
    }
    if (payload.maintenances !== undefined) {
      writeObjectsToSheet(ss, "maintenances", Array.isArray(payload.maintenances) ? payload.maintenances : [], defaultSchema.maintenances.headers);
    }
    if (payload.qcInspections !== undefined || payload.qc_inspections !== undefined) {
      var qcs = payload.qcInspections || payload.qc_inspections || [];
      writeObjectsToSheet(ss, "qc_inspections", Array.isArray(qcs) ? qcs : [], defaultSchema.qc_inspections.headers);
    }
    if (payload.breakfastOrders !== undefined || payload.breakfast_orders !== undefined) {
      var bOrders = payload.breakfastOrders || payload.breakfast_orders || [];
      writeObjectsToSheet(ss, "breakfast_orders", Array.isArray(bOrders) ? bOrders : [], defaultSchema.breakfast_orders.headers);
    }
    if (payload.workSessions !== undefined || payload.work_sessions !== undefined) {
      var wSessions = payload.workSessions || payload.work_sessions || [];
      writeObjectsToSheet(ss, "work_sessions", Array.isArray(wSessions) ? wSessions : [], defaultSchema.work_sessions.headers);
    }
    if (payload.app_settings !== undefined || payload.appSettings !== undefined) {
      var aSettings = payload.app_settings || payload.appSettings || [];
      var arrSettings = Array.isArray(aSettings) ? aSettings : (aSettings ? [aSettings] : []);
      writeObjectsToSheet(ss, "app_settings", arrSettings, defaultSchema.app_settings.headers);
    }
    if (payload.auditLogs !== undefined || payload.system_logs !== undefined) {
      var sysLogs = payload.auditLogs || payload.system_logs || [];
      writeObjectsToSheet(ss, "system_logs", Array.isArray(sysLogs) ? sysLogs.slice(0, 100) : [], defaultSchema.system_logs.headers);
    }
    if (payload.chatChannels !== undefined || payload.chat_channels !== undefined) {
      var cChannels = payload.chatChannels || payload.chat_channels || [];
      writeObjectsToSheet(ss, "chat_channels", Array.isArray(cChannels) ? cChannels : [], defaultSchema.chat_channels.headers);
    }
    if (payload.chatMessages !== undefined || payload.chat_messages !== undefined) {
      var cMessages = payload.chatMessages || payload.chat_messages || [];
      writeObjectsToSheet(ss, "chat_messages", Array.isArray(cMessages) ? cMessages : [], defaultSchema.chat_messages.headers);
    }

    // Bersihkan lembar default "Sheet1" jika ada lembar tabel lain
    try {
      var defaultSheet = ss.getSheetByName("Sheet1") || ss.getSheetByName("Sheet 1") || ss.getSheetByName("Lembar 1");
      if (defaultSheet && ss.getSheets().length > 1 && defaultSheet.getLastRow() <= 1) {
        ss.deleteSheet(defaultSheet);
      }
    } catch (_) {}

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Data seluruh tabel master, operasional, dan riwayat chat berhasil disimpan dan disinkronkan ke Google Spreadsheet!",
      updatedAt: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// FUNGSI PEMBERSIHAN SHEET KONFLIK (misal: users_conflict...)
function cleanConflictSheets(ss) {
  var sheets = ss.getSheets();
  var deleted = 0;
  for (var i = 0; i < sheets.length; i++) {
    var s = sheets[i];
    var sName = s.getName();
    if (sName.toLowerCase().indexOf("conflict") !== -1) {
      try {
        ss.deleteSheet(s);
        deleted++;
      } catch (_) {}
    }
  }
  return deleted;
}

// HELPER PENCARI SHEET FLEKSIBEL (Case-Insensitive & Mengabaikan Underscore)
function getSheetCaseInsensitive(ss, sheetName) {
  var direct = ss.getSheetByName(sheetName);
  if (direct) return direct;
  var sheets = ss.getSheets();
  var targetNorm = sheetName.replace(/_/g, "").toLowerCase();
  for (var i = 0; i < sheets.length; i++) {
    var s = sheets[i];
    var sName = s.getName();
    if (sName.toLowerCase().indexOf("conflict") !== -1) continue; // Abaikan sheet conflict
    if (sName.replace(/_/g, "").toLowerCase() === targetNorm) {
      return s;
    }
  }
  return null;
}

// FUNGSI INSPEKSI STRUKTUR SELURUH SHEET
function inspectAllSheets(ss) {
  var allSheets = ss.getSheets();
  var reports = [];
  var conflictSheets = [];

  for (var i = 0; i < allSheets.length; i++) {
    var sheet = allSheets[i];
    var sheetName = sheet.getName();

    // Saring sheet konflik
    if (sheetName.toLowerCase().indexOf("conflict") !== -1) {
      conflictSheets.push(sheetName);
      continue;
    }

    var lastCol = sheet.getLastColumn();
    var headers = [];

    if (lastCol > 0) {
      var rowValues = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      for (var c = 0; c < rowValues.length; c++) {
        var h = String(rowValues[c] || "").trim();
        if (h) headers.push(h);
      }
    }

    reports.push({
      name: sheetName,
      rowCount: sheet.getLastRow(),
      colCount: lastCol,
      headers: headers
    });
  }

  return {
    status: "success",
    totalSheets: reports.length,
    sheets: reports,
    conflictSheets: conflictSheets,
    inspectedAt: new Date().toISOString()
  };
}

// HELPER AUTO-EXPAND DIMENSI SHEET (Mencegah Error Limit 26 Kolom Google Sheets)
function ensureSheetDimensions(sheet, minRows, minCols) {
  if (!sheet) return;
  try {
    var maxCols = sheet.getMaxColumns();
    if (minCols && maxCols < minCols) {
      sheet.insertColumnsAfter(maxCols, minCols - maxCols);
    }
  } catch (_) {}
  try {
    var maxRows = sheet.getMaxRows();
    if (minRows && maxRows < minRows) {
      sheet.insertRowsAfter(maxRows, minRows - maxRows);
    }
  } catch (_) {}
}

// FUNGSI AUTO-PROVISIONING: MEMBUAT SHEET & MENATA HEADER OTOMATIS
function autoProvisionAllSheets(ss, schema, populateData, dataObj) {
  var created = [];
  var updated = [];

  var keys = Object.keys(schema);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var tableDef = schema[key];
    var sheetName = tableDef.sheetName || key;
    var headers = tableDef.headers || [];

    var sheet = getSheetCaseInsensitive(ss, sheetName);

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      created.push(sheetName);
    } else {
      updated.push(sheetName);
    }

    // Tulis dan Format Baris Header di Baris 1 (Auto-Expand Kolom agar tidak error limit 26 kolom)
    if (headers.length > 0) {
      ensureSheetDimensions(sheet, 1, headers.length);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight("bold");
      headerRange.setFontColor("#ffffff");
      headerRange.setBackground("#059669"); // Hijau Emerald Kemenag
      sheet.setFrozenRows(1);
    }

    // Jika diminta mengisi data dan datanya tersedia
    if (populateData && dataObj) {
      var items = dataObj[key] || dataObj[sheetName] || [];
      if (Array.isArray(items) && items.length > 0) {
        var rowsData = [];
        for (var r = 0; r < items.length; r++) {
          var item = items[r];
          var row = [];
          for (var c = 0; c < headers.length; c++) {
            var hName = headers[c];
            var camelName = hName.replace(/_([a-z])/g, function(g) { return g[1].toUpperCase(); });
            var snakeName = hName.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
            var val = item[hName] !== undefined ? item[hName] : (item[camelName] !== undefined ? item[camelName] : item[snakeName]);
            if (val === undefined || val === null) {
              val = "";
            } else if (Array.isArray(val)) {
              if (val.length > 0 && typeof val[0] === "object") {
                val = JSON.stringify(val);
              } else {
                val = val.join(", ");
              }
            } else if (typeof val === "object") {
              val = JSON.stringify(val);
            } else if (typeof val === "boolean") {
              val = val ? "true" : "false";
            }
            row.push(val);
          }
          rowsData.push(row);
        }
        if (rowsData.length > 0) {
          ensureSheetDimensions(sheet, rowsData.length + 1, headers.length);
          var lastRow = sheet.getLastRow();
          if (lastRow > 1) {
            sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
          }
          sheet.getRange(2, 1, rowsData.length, headers.length).setValues(rowsData);
        }
      }
    }

    try {
      sheet.autoResizeColumns(1, headers.length);
    } catch (_) {}
  }

  // Bersihkan lembar bawaan "Sheet1" jika kosong dan sheet baru telah dibuat
  try {
    var defaultSheet = ss.getSheetByName("Sheet1") || ss.getSheetByName("Sheet 1") || ss.getSheetByName("Lembar 1");
    if (defaultSheet && ss.getSheets().length > 1 && defaultSheet.getLastRow() <= 1) {
      ss.deleteSheet(defaultSheet);
    }
  } catch (_) {}

  return {
    createdSheets: created,
    updatedSheets: updated,
    totalCreated: created.length,
    totalUpdated: updated.length
  };
}

// SKEMA DEFAULT JIKA TIDAK DIKIRIM CLIENT (Lengkap & Terstandarisasi)
function getDefaultSchema() {
  return {
    buildings: {
      sheetName: "buildings",
      headers: [
        "id", "name", "code", "floors", "total_rooms", "capacity_desc", "category", "status", "description", "created_at", "updated_at"
      ]
    },
    rooms: {
      sheetName: "rooms",
      headers: [
        "id", "room_number", "building", "building_id", "floor", "type", "bed_type", "capacity", "capacity_number", "status", "price_per_night", "facilities", "qc_status", "last_qc_date", "last_qc_by", "last_qc_notes", "active_tx_id", "active_maint_id", "notes", "created_at", "updated_at"
      ]
    },
    meeting_rooms: {
      sheetName: "meeting_rooms",
      headers: [
        "id", "name", "code", "category", "building", "floor", "capacity", "capacity_number", "daily_rate", "session_rate", "rate_half_day", "rate_full_day", "status", "qc_status", "facilities", "amenities", "description", "active_tx_id", "active_maint_id", "notes", "created_at", "updated_at"
      ]
    },
    room_capacity_rates: {
      sheetName: "room_capacity_rates",
      headers: [
        "id", "room_type", "bed_type", "capacity_pax", "price_per_night", "description", "facilities", "is_active", "updated_at"
      ]
    },
    breakfast_menu_items: {
      sheetName: "breakfast_menu_items",
      headers: [
        "id", "name", "category", "price", "description", "is_available", "allergens", "updated_at"
      ]
    },
    transactions: {
      sheetName: "transactions",
      headers: [
        "id", "room_id", "room_number", "building", "guest_name", "guest_type", "nik_ktp", "kloter", "phone", "email", "category", "status", "start_date", "duration", "duration_unit", "price_per_night", "total_amount", "payment_status", "payment_method", "payment_date", "payment_note", "kwitansi_no", "is_paid", "paid_amount", "dp_amount", "dp_date", "dp_method", "dp_note", "remaining_amount", "already_paid", "va_number", "va_account_name", "bank_name", "bank_account_number", "is_group", "group_id", "group_type", "group_name", "group_pic", "group_pic_phone", "total_pax", "agency_or_document", "spk_number", "allocated_room_numbers", "allocated_rooms_count", "include_aula", "rent_aula_id", "rent_aula_name", "rent_aula_duration", "rent_aula_duration_days", "rent_aula_session", "catering_package", "catering_pax_count", "breakfast", "breakfast_menu", "breakfast_portions", "breakfast_days", "breakfast_status", "rent_type", "extra_bed", "extra_bed_count", "extra_bed_price", "extra_bed_notes", "check_in_time", "check_out_time", "notes", "created_user", "created_at", "updated_at", "cancelled_at", "cancel_reason", "cancelled_user", "extended_count", "extend_history"
      ]
    },
    users: {
      sheetName: "users",
      headers: [
        "id", "username", "full_name", "role", "department", "assigned_building", "supervisor_id", "phone", "email", "nip", "status", "is_owner", "password", "signature_url", "qr_code_url", "permissions", "updated_at"
      ]
    },
    maintenances: {
      sheetName: "maintenances",
      headers: [
        "id", "room_id", "room_number", "building", "category", "issue", "description", "urgency", "status", "technician", "assigned_technician_id", "assigned_technician_name", "assigned_by_manager", "assigned_time", "manager_notes", "technician_notes", "work_completed_time", "reporter", "reported_user", "report_time", "created_at", "resolved_time", "resolved_at", "qc_inspection_id", "qc_verdict", "facility_type", "notes", "updated_at"
      ]
    },
    qc_inspections: {
      sheetName: "qc_inspections",
      headers: [
        "id", "room_id", "building", "room_number", "inspector_id", "inspector_name", "inspection_date", "cleanliness", "linen_bed", "ac_electricity", "plumbing_water", "amenities", "result", "decision_type", "notes", "maintenance_id_created", "facility_type", "updated_at"
      ]
    },
    breakfast_orders: {
      sheetName: "breakfast_orders",
      headers: [
        "id", "room_number", "building", "guest_name", "phone", "kloter", "transaction_id", "menu_id", "menu_name", "portions", "days", "start_date", "order_date", "delivery_time", "status", "price_per_portion", "total_price", "dietary_restriction", "notes", "cancel_reason", "cancelled_at", "created_at", "updated_at"
      ]
    },
    work_sessions: {
      sheetName: "work_sessions",
      headers: [
        "id", "user_id", "user_name", "user_role", "department", "assigned_building", "login_time", "logout_time", "duration_seconds", "duration_formatted", "status", "last_heartbeat", "device_info", "notes"
      ]
    },
    app_settings: {
      sheetName: "app_settings",
      headers: [
        "organization_name", "sub_title", "ministry_name", "address", "phone", "email", "portal_url", "tag_title", "app_logo", "app_favicon", "updated_at"
      ]
    },
    system_logs: {
      sheetName: "system_logs",
      headers: [
        "id", "timestamp", "user", "role", "action", "details", "duration_minutes", "verification_code", "document_title", "target_id", "signatory_name", "signatory_role", "signatory_nip", "qr_code_hash", "has_qr_and_signature"
      ]
    },
    chat_channels: {
      sheetName: "chat_channels",
      headers: [
        "id", "name", "scope", "type", "department", "participant_ids", "description", "icon", "last_message", "last_message_time", "last_sender_name", "created_at", "updated_at"
      ]
    },
    chat_messages: {
      sheetName: "chat_messages",
      headers: [
        "id", "channel_id", "channel_type", "sender_id", "sender_name", "sender_role", "sender_department", "message", "timestamp", "time_formatted", "priority", "is_instruction", "read_by", "reply_to_id", "reply_to_sender", "reply_to_text", "created_at"
      ]
    }
  };
}

// DATA MASTER AWAL UNTUK INISIALISASI (SEED DATA ASRAMA HAJI)
function getDefaultSeedData() {
  return {
    buildings: [
      { id: "bld-1", name: "Gedung Mina", code: "MINA", floors: 4, total_rooms: 48, category: "PENGINAPAN", status: "AKTIF", description: "Gedung asrama jamaah dan penginapan umum utama" },
      { id: "bld-2", name: "Gedung Arafah", code: "ARF", floors: 3, total_rooms: 36, category: "PENGINAPAN", status: "AKTIF", description: "Penginapan paviliun VIP & delegasi" },
      { id: "bld-3", name: "Gedung Muzdalifah", code: "MZD", floors: 2, total_rooms: 24, category: "PENGINAPAN", status: "AKTIF", description: "Asrama reguler & transit jamaah" },
      { id: "bld-4", name: "Gedung Madinah", code: "MDN", floors: 3, total_rooms: 30, category: "PENGINAPAN", status: "AKTIF", description: "Wisma penginapan syariah & bimbingan" }
    ],
    room_capacity_rates: [
      { id: "rcr-1", room_type: "Ekonomi", bed_type: "4 Single Bed", capacity_pax: 4, price_per_night: 250000, description: "Kamar rombongan hemat ber-AC", facilities: "AC, Kamar Mandi Dalam, 4 Lemari", is_active: "true" },
      { id: "rcr-2", room_type: "Standar", bed_type: "2 Single Bed", capacity_pax: 2, price_per_night: 350000, description: "Kamar nyaman twin bed ber-AC & TV", facilities: "AC, TV, Meja, Air Panas, WiFi", is_active: "true" },
      { id: "rcr-3", room_type: "Superior", bed_type: "1 Double Bed", capacity_pax: 2, price_per_night: 450000, description: "Kamar keluarga luas dengan fasilitas lengkap", facilities: "AC, Smart TV, Kulkas Mini, Pemanas Air, WiFi", is_active: "true" }
    ],
    meeting_rooms: [
      { id: "mr-1", name: "Aula Serbaguna Utama", building: "Gedung Mina", floor: 1, capacity: 500, rate_half_day: 3500000, rate_full_day: 6000000, status: "TERSEDIA", amenities: "Sound System, AC Sentral, Proyektor, Podium, Kursi 500 unit" },
      { id: "mr-2", name: "Ruang Rapat Al-Haram", building: "Gedung Arafah", floor: 2, capacity: 50, rate_half_day: 1200000, rate_full_day: 2000000, status: "TERSEDIA", amenities: "Smart TV 75 inch, Sound, AC, Whiteboard, WiFi High-Speed" }
    ],
    app_settings: [
      { organization_name: "UPT Asrama Haji Embarkasi Jakarta", sub_title: "Sistem Informasi Manajemen Penginapan & Aset", ministry_name: "Kementerian Agama Republik Indonesia", address: "Jl. Raya Pondok Gede No. 1, Jakarta Timur", phone: "(021) 8094444", email: "info@asramahaji-jakarta.kemenag.go.id", portal_url: "https://asramahaji-jakarta.kemenag.go.id", tag_title: "SIM Asrama Haji Jakarta" }
    ]
  };
}

// HELPER MEMBACA SHEET MENJADI ARRAY OF OBJECTS (Toleran CamelCase & snake_case)
function readSheetAsObjects(ss, sheetName) {
  var sheet = getSheetCaseInsensitive(ss, sheetName);
  if (!sheet) return [];
  if (sheet.getName().toLowerCase().indexOf("conflict") !== -1) return [];

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  // Jika sheet kosong atau hanya ada header (baris 1), kembalikan array kosong [] secara anggun
  if (lastRow <= 1 || lastCol < 1) return [];

  var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  if (data.length <= 1) return [];

  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var obj = {};
    var hasContent = false;
    for (var j = 0; j < headers.length; j++) {
      var rawKey = String(headers[j]).trim();
      if (!rawKey) continue;

      var val = row[j];
      if (val instanceof Date) {
        val = val.toISOString();
      }

      // 1. Simpan key asli
      obj[rawKey] = val;

      // 2. Simpan camelCase key
      var camelKey = rawKey.replace(/_([a-z])/g, function(g) { return g[1].toUpperCase(); });
      obj[camelKey] = val;

      // 3. Simpan snake_case key
      var snakeKey = rawKey.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
      obj[snakeKey] = val;

      if (val !== "" && val !== null && val !== undefined) {
        hasContent = true;
      }
    }

    // Normalisasi khusus kolom users: fullName <-> name, assignedBuilding <-> building
    if (obj.name && !obj.fullName) {
      obj.fullName = obj.name;
      obj.full_name = obj.name;
    }
    if (obj.building && !obj.assignedBuilding) {
      obj.assignedBuilding = obj.building;
      obj.assigned_building = obj.building;
    }
    if (!obj.password) {
      obj.password = "12345";
    }

    if (hasContent) {
      rows.push(obj);
    }
  }
  return rows;
}

// HELPER MENULIS ARRAY OF OBJECTS KE SHEET (Toleran field CamelCase & snake_case)
function writeObjectsToSheet(ss, sheetName, items, defaultHeaders) {
  var sheet = getSheetCaseInsensitive(ss, sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    sheet.clearContents();
  }

  var headers = defaultHeaders || ((items && items.length > 0) ? Object.keys(items[0]) : []);
  if (!headers || headers.length === 0) return;

  var output = [headers];

  if (items && Array.isArray(items) && items.length > 0) {
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var row = [];
      for (var j = 0; j < headers.length; j++) {
        var hName = headers[j];
        var camelName = hName.replace(/_([a-z])/g, function(g) { return g[1].toUpperCase(); });
        var snakeName = hName.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");

        var val = item[hName] !== undefined ? item[hName] : (item[camelName] !== undefined ? item[camelName] : item[snakeName]);

        // Alias tambahan untuk users & rooms
        if (val === undefined || val === null) {
          if (hName === "full_name" || camelName === "fullName") val = item.name || item.fullName || item.full_name;
          else if (hName === "assigned_building" || camelName === "assignedBuilding") val = item.building || item.assignedBuilding;
          else if (hName === "room_number" || camelName === "roomNumber") val = item.no_kamar || item.nomor_kamar;
          else if (hName === "price_per_night" || camelName === "pricePerNight") val = item.tarif || item.harga;
          else if (hName === "capacity_pax" || camelName === "capacityPax") val = item.capacityNumber || item.capacity_number || item.capacity;
        }

        if (val === undefined || val === null) {
          val = "";
        } else if (Array.isArray(val)) {
          if (val.length > 0 && typeof val[0] === "object") {
            val = JSON.stringify(val);
          } else {
            val = val.join(", ");
          }
        } else if (typeof val === "object") {
          val = JSON.stringify(val);
        } else if (typeof val === "boolean") {
          val = val ? "true" : "false";
        }

        // Batas sel Google Sheets adalah 50.000 karakter. Potong aman & ubah logo panjang ke penanda OFFICIAL_LOGO
        if (typeof val === "string") {
          if ((hName === "app_logo" || camelName === "appLogo") && (val.length > 20000 || val.indexOf("data:image/") === 0)) {
            val = "OFFICIAL_LOGO";
          } else if (val.length > 45000) {
            val = val.substring(0, 45000);
          }
        }

        row.push(val);
      }
      output.push(row);
    }
  }

  ensureSheetDimensions(sheet, output.length, headers.length);
  sheet.getRange(1, 1, output.length, headers.length).setValues(output);
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight("bold");
  headerRange.setFontColor("#ffffff");
  headerRange.setBackground("#059669");
  sheet.setFrozenRows(1);
  try {
    sheet.autoResizeColumns(1, headers.length);
  } catch (_) {}
}`;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(appsScriptCode);
    setCopiedScript(true);
    showToast('Kode skrip Google Apps Script berhasil disalin ke clipboard!', 'success');
    setTimeout(() => setCopiedScript(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto my-4 text-xs sm:text-sm animate-in fade-in duration-200">
      {/* 1. Header & Hero Bar */}
      <div className="bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-900 text-white rounded-3xl p-5 sm:p-7 shadow-xl border border-emerald-500/30 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 pointer-events-none flex items-center justify-center">
          <i className="fa-solid fa-file-excel text-[180px]"></i>
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start sm:items-center space-x-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center justify-center text-2xl sm:text-3xl shrink-0 shadow-inner">
              <i className="fa-solid fa-file-excel"></i>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base sm:text-xl font-black text-white tracking-wide">
                  Integrasi &amp; Auto-Provisioning Google Spreadsheet
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 uppercase tracking-wider">
                  Auto-Schema Ready
                </span>
              </div>
              <p className="text-xs sm:text-sm text-emerald-200/90 mt-1 max-w-2xl leading-relaxed">
                Hubungkan Google Spreadsheet kosong sekalipun — aplikasi akan <strong>secara otomatis mendeteksi, membuat lembar kerja (sheet), dan menyusun header tabel</strong> tanpa perlu Anda buat manual!
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {sheetDocUrl && (
              <a
                href={sheetDocUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-emerald-200 border border-emerald-400/30 font-bold rounded-xl text-xs transition flex items-center space-x-1.5 shadow-sm"
              >
                <i className="fa-solid fa-arrow-up-right-from-square text-xs"></i>
                <span>Buka Spreadsheet</span>
              </a>
            )}
            <button
              type="button"
              onClick={handleCopyScript}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-xl text-xs transition flex items-center space-x-1.5 shadow-md cursor-pointer"
            >
              <i className={`fa-solid ${copiedScript ? 'fa-check' : 'fa-copy'}`}></i>
              <span>{copiedScript ? 'Tersalin!' : 'Salin Skrip Code.gs'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Status Koneksi & Aksi Utama */}
      <div className={`p-4 sm:p-5 rounded-2xl border transition-all shadow-sm ${
        isConnected 
          ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700/60 text-emerald-950 dark:text-emerald-100' 
          : 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700/60 text-amber-950 dark:text-amber-100'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${
              isConnected 
                ? 'bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200' 
                : 'bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200'
            }`}>
              <i className={`fa-solid ${isConnected ? 'fa-circle-check' : 'fa-triangle-exclamation'}`}></i>
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-sm block">
                  Status: {isConnected ? 'Terhubung ke Google Spreadsheet' : 'Belum Dikonfigurasi'}
                </span>
                {lastSyncTime && (
                  <span className="text-[10px] bg-emerald-200/60 dark:bg-emerald-800/60 px-2 py-0.5 rounded-md font-mono text-emerald-800 dark:text-emerald-200">
                    Terakhir: {lastSyncTime}
                  </span>
                )}
              </div>
              <p className="text-xs opacity-90 truncate mt-0.5">{syncStatus}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto shrink-0">
            {/* Tombol Deteksi / Periksa Skema */}
            <button
              type="button"
              onClick={() => handleInspectSchema()}
              disabled={isInspecting || !scriptUrl.trim()}
              className="px-3.5 py-2.5 bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white font-bold rounded-xl shadow transition flex items-center space-x-2 cursor-pointer text-xs"
              title="Periksa keberadaan lembar kerja dan baris header kolom di Google Spreadsheet"
            >
              {isInspecting ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  <span>Mendeteksi...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-magnifying-glass-chart"></i>
                  <span>Deteksi Struktur Sheet</span>
                </>
              )}
            </button>

            {/* Tombol Auto-Provisioning */}
            <button
              type="button"
              onClick={() => setShowProvisionModal(true)}
              disabled={isAutoProvisioning || !scriptUrl.trim()}
              className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold rounded-xl shadow transition flex items-center space-x-2 cursor-pointer text-xs"
              title="Otomatis buat seluruh lembar kerja dan baris header di Spreadsheet"
            >
              {isAutoProvisioning ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  <span>Menginisialisasi...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-wand-magic-sparkles text-amber-300"></i>
                  <span>Inisialisasi Otomatis (Auto-Provision)</span>
                </>
              )}
            </button>

            {/* Tombol Baca Data */}
            <button
              type="button"
              onClick={handleTestDataFetch}
              disabled={isLoading || isPushing || !scriptUrl.trim()}
              className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-bold rounded-xl shadow transition flex items-center space-x-2 cursor-pointer text-xs"
            >
              {isLoading ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  <span>Membaca Data...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-cloud-arrow-down"></i>
                  <span>Baca Data</span>
                </>
              )}
            </button>

            {/* Tombol Kirim Data */}
            <button
              type="button"
              onClick={() => setShowPushConfirm(true)}
              disabled={isLoading || isPushing || !scriptUrl.trim()}
              className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 text-white font-bold rounded-xl shadow transition flex items-center space-x-2 cursor-pointer text-xs"
              title="Kirim data aktif aplikasi ke Google Spreadsheet"
            >
              {isPushing ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  <span>Mengirim...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-cloud-arrow-up"></i>
                  <span>Kirim Data</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Box Penanganan Pembaruan Kode Apps Script (Error 500 / Kolom Melebihi Batas) */}
      {isScriptUpdateNeeded && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-400 dark:border-amber-600 shadow-md space-y-3 animate-in fade-in">
          <div className="flex items-start space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center text-lg font-black shrink-0">
              <i className="fa-solid fa-code-compare"></i>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-extrabold text-amber-950 dark:text-amber-100 text-sm sm:text-base">
                Pembaruan Kode Google Apps Script Diperlukan (Versi 3.0)
              </h3>
              <p className="text-xs text-amber-900/90 dark:text-amber-200/90 mt-0.5 leading-relaxed">
                Google Apps Script di Spreadsheet Anda perlu diperbarui dengan kode terbaru agar dapat otomatis memperluas kolom tabel transaksi (74 kolom) dan menyusun 13 lembar kerja secara lengkap tanpa terbentur batas 26 kolom bawaan Google Sheets.
              </p>
            </div>
          </div>

          <div className="bg-white/80 dark:bg-slate-900/80 p-3.5 rounded-xl border border-amber-300 dark:border-amber-700/60 space-y-2 text-xs text-slate-800 dark:text-slate-200">
            <span className="font-bold text-emerald-700 dark:text-emerald-400 block">
              🛠️ Langkah Mudah Memperbarui Script (Hanya 1 Menit):
            </span>
            <ol className="list-decimal list-inside space-y-1.5 pl-1 leading-relaxed">
              <li>Klik tombol hijau <strong>"Salin Kode Script Terbaru (v3.0)"</strong> di bawah.</li>
              <li>Buka Google Spreadsheet Anda &gt; menu <strong>Extensions &gt; Apps Script</strong>.</li>
              <li>Hapus seluruh kode lama di editor Apps Script (tekan Ctrl+A lalu Delete), kemudian Paste kode baru.</li>
              <li>Klik tombol biru <strong>Deploy &gt; New deployment</strong> &gt; pilih jenis <strong>Web app</strong> (Who has access: <em>Anyone</em>) &gt; klik <strong>Deploy</strong>.</li>
              <li>Kembali ke sini dan klik tombol <strong>"Inisialisasi Otomatis"</strong> lagi.</li>
            </ol>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleCopyScript}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold rounded-xl text-xs shadow transition flex items-center space-x-2 cursor-pointer"
            >
              <i className="fa-solid fa-copy"></i>
              <span>{copiedScript ? "Kode Tersalin!" : "Salin Kode Script Terbaru (v3.0)"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveGuideTab('SCRIPT');
                const guideEl = document.getElementById('apps-script-guide-section');
                if (guideEl) guideEl.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs border border-slate-200 dark:border-slate-700 transition cursor-pointer"
            >
              Lihat Editor Kode Script
            </button>
            <button
              type="button"
              onClick={() => setIsScriptUpdateNeeded(false)}
              className="px-3 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-300 rounded-xl text-xs ml-auto cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Box Penanganan Khusus Error 403 Forbidden */}
      {isForbiddenError && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-400 dark:border-amber-600 shadow-md space-y-3">
          <div className="flex items-start space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center text-lg font-black shrink-0">
              <i className="fa-solid fa-triangle-exclamation"></i>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-extrabold text-amber-950 dark:text-amber-100 text-sm sm:text-base">
                Terdeteksi Akses Ditolak (HTTP 403 Forbidden)
              </h3>
              <p className="text-xs text-amber-900/90 dark:text-amber-200/90 mt-0.5 leading-relaxed">
                Penyebab utama error ini: Opsi <strong>"Who has access"</strong> saat melakukan <strong>Deploy Web App</strong> di Google Apps Script masih disetel ke <em>"Only myself" (Hanya saya)</em> atau akun organisasi terbatas, sehingga Google memblokir akses publik.
              </p>
            </div>
          </div>

          <div className="bg-white/80 dark:bg-slate-900/80 p-3.5 rounded-xl border border-amber-300 dark:border-amber-700/60 space-y-2 text-xs text-slate-800 dark:text-slate-200">
            <span className="font-bold text-emerald-700 dark:text-emerald-400 block">
              🛠️ Cara Memperbaiki dalam 30 Detik (Tanpa Mengubah URL):
            </span>
            <ol className="list-decimal list-inside space-y-1.5 pl-1 leading-relaxed">
              <li>Buka file Google Spreadsheet Anda &gt; menu <strong>Extensions &gt; Apps Script</strong>.</li>
              <li>Di pojok kanan atas, klik tombol biru <strong>Deploy &gt; Manage deployments</strong>.</li>
              <li>Klik ikon <strong>Pensil (Edit)</strong> pada deployment aktif Web App Anda.</li>
              <li>Pada opsi <strong>"Who has access" (Siapa yang memiliki akses)</strong>, ubah menjadi <strong className="text-emerald-700 dark:text-emerald-300 font-extrabold">Anyone (Siapa saja)</strong>.</li>
              <li>Klik tombol biru <strong>Deploy</strong>. Selesai! URL Web App tetap sama dan koneksi akan langsung berhasil.</li>
            </ol>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-1">
            <button
              type="button"
              onClick={() => handleTestDataFetch()}
              disabled={isLoading}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold rounded-xl text-xs shadow transition flex items-center space-x-1.5 cursor-pointer"
            >
              <i className="fa-solid fa-rotate-right"></i>
              <span>Coba Tes Koneksi Ulang</span>
            </button>
            <button
              type="button"
              onClick={() => setIsForbiddenError(false)}
              className="px-3 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition cursor-pointer"
            >
              Tutup Petunjuk
            </button>
          </div>
        </div>
      )}

      {/* Box Penjelasan & Solusi Cepat: Kenapa Sheet & Header Belum Muncul */}
      {showWhyMissingGuide && (
        <div className="relative bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-slate-900 border border-emerald-300 dark:border-emerald-700/60 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
          <button
            type="button"
            onClick={() => setShowWhyMissingGuide(false)}
            className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs w-6 h-6 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
            title="Tutup panduan"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
          <div className="flex items-start space-x-3 pr-8">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-base shrink-0 shadow-sm">
              <i className="fa-solid fa-circle-question"></i>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-extrabold text-emerald-950 dark:text-emerald-100 text-sm sm:text-base">
                Kenapa di Google Spreadsheet Belum Termuat Semua Sheet &amp; Headernya?
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                Google Spreadsheet baru secara default <strong>hanya berisi 1 lembar kosong ("Sheet1")</strong>. Menempelkan kode skrip di Apps Script belum mengeksekusi pembuatan tabel sebelum diinstruksikan. Berikut 3 hal yang perlu diketahui:
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-1">
            <div className="bg-white/80 dark:bg-slate-800/80 p-3 rounded-xl border border-emerald-200 dark:border-slate-700 space-y-1.5">
              <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center space-x-1.5">
                <span>1️⃣ Jalankan Auto-Provisioning</span>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                Cukup klik tombol hijau <strong>"Inisialisasi Otomatis (Auto-Provision)"</strong> di bawah. Seluruh 13 lembar kerja beserta baris header hijau emerald akan langsung dibuatkan otomatis dalam 3 detik!
              </p>
            </div>

            <div className="bg-white/80 dark:bg-slate-800/80 p-3 rounded-xl border border-emerald-200 dark:border-slate-700 space-y-1.5">
              <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center space-x-1.5">
                <span>2️⃣ Menu Langsung di Spreadsheet</span>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                Di lembar Google Spreadsheet Anda, cukup refresh halaman dan klik menu atas <strong>"🕌 SIM Asrama Haji" &gt; "⚡ Buat Semua 13 Sheet &amp; Header Otomatis"</strong>.
              </p>
            </div>

            <div className="bg-white/80 dark:bg-slate-800/80 p-3 rounded-xl border border-emerald-200 dark:border-slate-700 space-y-1.5">
              <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center space-x-1.5">
                <span>3️⃣ Akses Deploy Harus "Anyone"</span>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                Saat deploy Web App di Apps Script, pastikan <em>"Who has access"</em> disetel ke <strong>Anyone (Siapa saja)</strong> agar server tidak terhalang firewall Google (HTTP 403 Forbidden).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 3. Panel Khusus: Auto-Provisioning & Deteksi Struktur Tabel */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 pb-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-sm">
                <i className="fa-solid fa-wand-magic-sparkles"></i>
              </span>
              <h2 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                Auto-Provisioning: Pembuatan Otomatis Lembar Kerja &amp; Header
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Anda tidak perlu membuat lembar kerja (sheet) satu per satu secara manual. Cukup hubungkan Spreadsheet kosong, sistem akan memeriksa kelengkapan tabel dan secara otomatis membuat sheet serta menata header kolom tabel sesuai skema aplikasi.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setShowProvisionModal(true)}
              disabled={isAutoProvisioning || !scriptUrl.trim()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow transition flex items-center space-x-2 cursor-pointer"
            >
              <i className="fa-solid fa-bolt text-amber-300"></i>
              <span>Mulai Auto-Provisioning</span>
            </button>
          </div>
        </div>

        {/* Ringkasan Status Inspeksi */}
        {inspectionResult && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <span className={`w-3 h-3 rounded-full ${inspectionResult.overallStatus === 'READY' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
                <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                  Hasil Deteksi: {inspectionResult.totalReady} dari {inspectionResult.totalExpected} Lembar Kerja Siap Digunakan
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                Diperiksa: {new Date(inspectionResult.inspectedAt).toLocaleTimeString('id-ID')}
              </span>
            </div>

            {/* Banner Khusus Sheet Konflik / Duplikat Terdeteksi */}
            {inspectionResult.conflictSheetsFound && inspectionResult.conflictSheetsFound.length > 0 && (
              <div className="p-3.5 sm:p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
                <div className="flex items-start space-x-3 text-xs">
                  <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold shrink-0 mt-0.5">
                    <i className="fa-solid fa-broom"></i>
                  </div>
                  <div>
                    <h4 className="font-bold text-amber-950 dark:text-amber-200">
                      Terdeteksi {inspectionResult.conflictSheetsFound.length} Sheet Konflik / Duplikat ({inspectionResult.conflictSheetsFound.join(', ')})
                    </h4>
                    <p className="text-amber-800/80 dark:text-amber-300/80 text-[11px] mt-0.5 leading-relaxed">
                      Sistem telah otomatis mengabaikan sheet konflik ini agar sinkronisasi tetap berjalan lancar. Anda dapat menghapusnya permanen dari Google Spreadsheet dengan 1-klik di samping.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCleanConflicts}
                  disabled={isCleaningConflicts}
                  className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-xs transition flex items-center space-x-1.5 shrink-0 cursor-pointer"
                >
                  <i className={`fa-solid ${isCleaningConflicts ? 'fa-spinner fa-spin' : 'fa-trash-can'}`}></i>
                  <span>{isCleaningConflicts ? 'Sedang Menghapus...' : 'Bersihkan Sheet Konflik'}</span>
                </button>
              </div>
            )}

            {/* Banner Khusus Skrip Versi Lama Terdeteksi */}
            {(inspectionResult.isLegacyAppsScript || inspectionResult.overallStatus === 'LEGACY_SCRIPT') && (
              <div className="p-4 rounded-xl bg-gradient-to-r from-sky-50 to-blue-50 dark:from-sky-950/40 dark:to-blue-950/40 border border-sky-300 dark:border-sky-700 flex flex-col sm:flex-row items-start justify-between gap-4 shadow-xs">
                <div className="flex items-start space-x-3.5 text-xs">
                  <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center font-bold shrink-0 mt-0.5 text-lg shadow-sm">
                    <i className="fa-solid fa-code-branch"></i>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 bg-sky-600 text-white font-extrabold text-[10px] rounded-md tracking-wider uppercase">
                        Informasi Struktur
                      </span>
                      <h4 className="font-bold text-sky-950 dark:text-sky-100 text-sm">
                        Lembar Kerja Anda Sudah Ada di Spreadsheet! Perbarui Kode Google Apps Script (Code.gs)
                      </h4>
                    </div>
                    <p className="text-sky-900/90 dark:text-sky-200/90 leading-relaxed text-xs">
                      Di Google Spreadsheet fisik Anda, ke-12 lembar kerja sebenarnya <strong>sudah ada</strong>. Notifikasi <em>"9 lembar kerja belum dibuat"</em> muncul karena Web App Google Apps Script Anda saat ini masih menjalankan <strong>versi skrip lama</strong> yang baru mengekspos 4 tabel (<em>buildings</em>, <em>rooms</em>, <em>transactions</em>, <em>users</em>).
                    </p>
                    <div className="pt-1 flex flex-wrap gap-2 items-center text-xs">
                      <span className="font-bold text-sky-950 dark:text-sky-100">Langkah Pembaruan (1 Menit):</span>
                      <span className="bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-sky-200 dark:border-sky-800 text-slate-700 dark:text-slate-300 font-medium">
                        1. Salin kode terbaru di tab <strong>Panduan &amp; Kode Script</strong>
                      </span>
                      <span className="bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-sky-200 dark:border-sky-800 text-slate-700 dark:text-slate-300 font-medium">
                        2. Tempel di <code>Extensions &gt; Apps Script</code> &amp; Save
                      </span>
                      <span className="bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-bold">
                        3. Klik Deploy &gt; Manage deployments &gt; Edit (Pensil) &gt; Version: New version &gt; Deploy!
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveGuideTab('SCRIPT');
                    handleCopyScript();
                    const el = document.getElementById('apps-script-guide-box');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs shadow transition flex items-center space-x-2 shrink-0 cursor-pointer self-stretch sm:self-center justify-center"
                >
                  <i className="fa-solid fa-copy"></i>
                  <span>Salin Kode &amp; Buka Panduan</span>
                </button>
              </div>
            )}

            {/* Grid Kartu Tabel */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              {inspectionResult.sheetReports.map((report) => {
                const isLegacy = inspectionResult.isLegacyAppsScript || inspectionResult.overallStatus === 'LEGACY_SCRIPT';
                return (
                  <div 
                    key={report.key}
                    className={`p-3 rounded-xl border transition-all ${
                      report.status === 'READY'
                        ? 'bg-white dark:bg-slate-800/90 border-emerald-300 dark:border-emerald-700/60 shadow-xs'
                        : report.status === 'MISSING_HEADERS'
                        ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700/60'
                        : isLegacy
                        ? 'bg-sky-50/60 dark:bg-sky-950/30 border-sky-300 dark:border-sky-800/60'
                        : 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div>
                        <span className="font-mono text-emerald-600 dark:text-emerald-400 font-extrabold text-xs block">
                          {report.sheetName}
                        </span>
                        <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs mt-0.5">
                          {report.label}
                        </h4>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        report.status === 'READY'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                          : report.status === 'MISSING_HEADERS'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                          : isLegacy
                          ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-300'
                          : 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300'
                      }`}>
                        {report.status === 'READY' 
                          ? 'Siap' 
                          : report.status === 'MISSING_HEADERS' 
                          ? 'Header Kurang' 
                          : isLegacy 
                          ? 'Perlu Update Script' 
                          : 'Belum Dibuat'}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                      {report.description}
                    </p>

                    <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span>{report.expectedHeaders.length} Kolom Baku</span>
                      <span>
                        {report.exists 
                          ? 'Sheet Ada' 
                          : isLegacy 
                          ? 'Ada di Sheet (Update Script)' 
                          : 'Perlu Dibuat'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Jika belum pernah diinspeksi */}
        {!inspectionResult && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-dashed border-slate-300 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 flex items-center justify-center text-lg shrink-0">
                <i className="fa-solid fa-table-list"></i>
              </div>
              <div>
                <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200">
                  Struktur Baku Database: 13 Lembar Kerja Master, Operasional &amp; Sistem
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Mencakup <code>buildings</code>, <code>rooms</code>, <code>room_capacity_rates</code> (katalog tipe kamar &amp; tarif), <code>meeting_rooms</code>, <code>breakfast_menu_items</code>, <code>transactions</code>, <code>users</code>, <code>maintenances</code>, <code>qc_inspections</code>, <code>breakfast_orders</code>, <code>work_sessions</code>, <code>app_settings</code>, dan <code>system_logs</code>.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleInspectSchema()}
              disabled={isInspecting || !scriptUrl.trim()}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition cursor-pointer shrink-0"
            >
              {isInspecting ? 'Mendeteksi...' : 'Periksa Kelengkapan Sheet Sekarang'}
            </button>
          </div>
        )}
      </div>

      {/* 4. Form Input URL Web App & Dokumen Spreadsheet */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
          <div className="flex items-center space-x-2">
            <i className="fa-solid fa-link text-emerald-600 text-sm"></i>
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
              Pengaturan URL Endpoint Google Apps Script &amp; Spreadsheet
            </h3>
          </div>
          {isConnected && (
            <button
              type="button"
              onClick={handleResetConfig}
              className="text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 font-bold flex items-center space-x-1 cursor-pointer"
            >
              <i className="fa-solid fa-trash-can"></i>
              <span>Reset Pengaturan</span>
            </button>
          )}
        </div>

        <form onSubmit={handleSaveConfig} className="space-y-3.5">
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 text-xs mb-1">
              URL Web App Google Apps Script (.exec) <span className="text-rose-500">*</span>
            </label>
            <input
              type="url"
              required
              value={scriptUrl}
              onChange={(e) => setScriptUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/AKfycbx.../exec"
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-600 focus:outline-none transition"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              URL ini Anda peroleh setelah klik <strong>Deploy &gt; New deployment &gt; Web app</strong> di Google Apps Script editor.
            </p>
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 text-xs mb-1">
              URL Dokumen Google Spreadsheet (Tautan Spreadsheet Langsung - Opsional)
            </label>
            <input
              type="url"
              value={sheetDocUrl}
              onChange={(e) => setSheetDocUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/.../edit"
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-600 focus:outline-none transition"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Tautan ke berkas Google Sheet Anda agar tombol <em>Buka Spreadsheet</em> dapat langsung membuka tab baru.
            </p>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-700">
            <button
              type="submit"
              className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl shadow transition cursor-pointer flex items-center space-x-1.5"
            >
              <i className="fa-solid fa-floppy-disk"></i>
              <span>Simpan Konfigurasi URL</span>
            </button>
          </div>
        </form>
      </div>

      {/* 5. Hasil Pembacaan Data Spreadsheet (Preview & Terapkan) */}
      {fetchedData && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-emerald-200 dark:border-emerald-800 shadow-sm space-y-4 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center space-x-2">
                <i className="fa-solid fa-table text-emerald-600"></i>
                <span>Hasil Pembacaan Data dari Google Spreadsheet</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Data berikut berhasil ditarik dari sheet. Anda dapat meninjaunya atau langsung menerapkan ke aplikasi.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setShowApplyConfirm(true)}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs shadow transition flex items-center space-x-1.5 cursor-pointer"
              >
                <i className="fa-solid fa-download"></i>
                <span>Terapkan Data Ini ke Aplikasi</span>
              </button>
            </div>
          </div>

          {/* Tab Selector Hasil Baca */}
          <div className="flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setActivePreviewTab('ROOM_RATES')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shrink-0 ${
                activePreviewTab === 'ROOM_RATES' 
                  ? 'bg-emerald-600 text-white shadow-xs' 
                  : 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100'
              }`}
            >
              <i className="fa-solid fa-tags"></i>
              <span>Katalog Tipe Kamar &amp; Tarif ({fetchedData.room_capacity_rates?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePreviewTab('BUILDINGS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shrink-0 ${
                activePreviewTab === 'BUILDINGS' 
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-building"></i>
              <span>Gedung ({fetchedData.buildings?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePreviewTab('ROOMS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shrink-0 ${
                activePreviewTab === 'ROOMS' 
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-door-open"></i>
              <span>Kamar ({fetchedData.rooms?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePreviewTab('MEETING_ROOMS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shrink-0 ${
                activePreviewTab === 'MEETING_ROOMS' 
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-people-roof"></i>
              <span>Aula ({fetchedData.meeting_rooms?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePreviewTab('BREAKFAST_MENUS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shrink-0 ${
                activePreviewTab === 'BREAKFAST_MENUS' 
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-utensils"></i>
              <span>Menu Sarapan ({fetchedData.breakfast_menu_items?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePreviewTab('TRANSACTIONS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shrink-0 ${
                activePreviewTab === 'TRANSACTIONS' 
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-receipt"></i>
              <span>Transaksi ({fetchedData.transactions?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePreviewTab('USERS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shrink-0 ${
                activePreviewTab === 'USERS' 
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-users"></i>
              <span>Petugas ({fetchedData.users?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePreviewTab('QC')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shrink-0 ${
                activePreviewTab === 'QC' 
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-clipboard-check"></i>
              <span>Inspeksi QC ({fetchedData.qc_inspections?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePreviewTab('MAINTENANCES')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shrink-0 ${
                activePreviewTab === 'MAINTENANCES' 
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-wrench"></i>
              <span>Perawatan ({fetchedData.maintenances?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePreviewTab('ORDERS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shrink-0 ${
                activePreviewTab === 'ORDERS' 
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-bowl-food"></i>
              <span>Pesanan Makan ({fetchedData.breakfast_orders?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePreviewTab('WORK_SESSIONS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shrink-0 ${
                activePreviewTab === 'WORK_SESSIONS' 
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-user-clock"></i>
              <span>Sesi Kerja ({fetchedData.work_sessions?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePreviewTab('RAW')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shrink-0 ${
                activePreviewTab === 'RAW' 
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-code"></i>
              <span>JSON Raw</span>
            </button>
          </div>

          {/* Preview Content */}
          <div className="overflow-x-auto max-h-72 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900 p-2 text-xs">
            {activePreviewTab === 'ROOM_RATES' && (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold">
                    <th className="p-2">Tipe Kamar</th>
                    <th className="p-2">Varian Bed</th>
                    <th className="p-2">Kapasitas Pax</th>
                    <th className="p-2">Tarif per Malam</th>
                    <th className="p-2">Fasilitas / Catatan</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(fetchedData.room_capacity_rates || []).map((r, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800">
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          (r.room_type || r.roomType) === 'Superior' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                          (r.room_type || r.roomType) === 'Standar' ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' :
                          'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        }`}>
                          {r.room_type || r.roomType || 'Standar'}
                        </span>
                      </td>
                      <td className="p-2 font-bold text-slate-800 dark:text-slate-200">{r.bed_type || r.bedType}</td>
                      <td className="p-2">{r.capacity_pax || r.capacityPax || 2} Pax</td>
                      <td className="p-2 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        Rp {Number(r.price_per_night || r.pricePerNight || 0).toLocaleString('id-ID')}
                      </td>
                      <td className="p-2 text-slate-500 max-w-xs truncate">{r.description || (Array.isArray(r.facilities) ? r.facilities.join(', ') : r.facilities) || '-'}</td>
                      <td className="p-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 dark:bg-slate-700">
                          {String(r.is_active || r.isActive) === 'true' || r.is_active === true ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {(!fetchedData.room_capacity_rates || fetchedData.room_capacity_rates.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-400">Belum ada baris di sheet 'room_capacity_rates'. Klik 'Inisialisasi Otomatis' untuk menyusunnya.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activePreviewTab === 'MEETING_ROOMS' && (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold">
                    <th className="p-2">Nama Aula</th>
                    <th className="p-2">Gedung</th>
                    <th className="p-2">Kapasitas</th>
                    <th className="p-2">Tarif Full Day</th>
                    <th className="p-2">Tarif Half Day</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(fetchedData.meeting_rooms || []).map((m, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800">
                      <td className="p-2 font-bold text-slate-800 dark:text-slate-200">{m.name}</td>
                      <td className="p-2">{m.building}</td>
                      <td className="p-2">{m.capacity}</td>
                      <td className="p-2 font-mono">Rp {Number(m.rate_full_day || m.dailyRate || 0).toLocaleString('id-ID')}</td>
                      <td className="p-2 font-mono">Rp {Number(m.rate_half_day || m.sessionRate || 0).toLocaleString('id-ID')}</td>
                      <td className="p-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-700">
                          {m.status || 'TERSEDIA'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {(!fetchedData.meeting_rooms || fetchedData.meeting_rooms.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-400">Tidak ada baris data aula di sheet 'meeting_rooms'.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activePreviewTab === 'BREAKFAST_MENUS' && (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold">
                    <th className="p-2">Nama Menu</th>
                    <th className="p-2">Kategori</th>
                    <th className="p-2">Harga per Porsi</th>
                    <th className="p-2">Keterangan</th>
                    <th className="p-2">Ketersediaan</th>
                  </tr>
                </thead>
                <tbody>
                  {(fetchedData.breakfast_menu_items || []).map((b, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800">
                      <td className="p-2 font-bold text-slate-800 dark:text-slate-200">{b.name}</td>
                      <td className="p-2">{b.category}</td>
                      <td className="p-2 font-mono font-bold text-emerald-600">Rp {Number(b.price || 0).toLocaleString('id-ID')}</td>
                      <td className="p-2 text-slate-500 truncate max-w-xs">{b.description || '-'}</td>
                      <td className="p-2">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800">
                          {String(b.is_available) === 'true' || b.is_available === true ? 'Tersedia' : 'Habis'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {(!fetchedData.breakfast_menu_items || fetchedData.breakfast_menu_items.length === 0) && (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-400">Tidak ada baris data menu di sheet 'breakfast_menu_items'.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activePreviewTab === 'BUILDINGS' && (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold">
                    <th className="p-2">ID</th>
                    <th className="p-2">Nama Gedung</th>
                    <th className="p-2">Kode</th>
                    <th className="p-2">Lantai</th>
                    <th className="p-2">Total Kamar</th>
                    <th className="p-2">Kategori</th>
                  </tr>
                </thead>
                <tbody>
                  {(fetchedData.buildings || []).map((b, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800">
                      <td className="p-2 font-mono text-slate-500">{b.id || `bld-${i+1}`}</td>
                      <td className="p-2 font-bold text-slate-800 dark:text-slate-200">{b.name}</td>
                      <td className="p-2 font-mono">{b.code}</td>
                      <td className="p-2">{b.floors}</td>
                      <td className="p-2">{b.total_rooms || b.totalRooms || 0}</td>
                      <td className="p-2">{b.category}</td>
                    </tr>
                  ))}
                  {(!fetchedData.buildings || fetchedData.buildings.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-400">Tidak ada baris data gedung di sheet 'buildings'.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activePreviewTab === 'ROOMS' && (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold">
                    <th className="p-2">No. Kamar</th>
                    <th className="p-2">Gedung</th>
                    <th className="p-2">Lantai</th>
                    <th className="p-2">Tipe</th>
                    <th className="p-2">Varian Bed</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Tarif/Malam</th>
                  </tr>
                </thead>
                <tbody>
                  {(fetchedData.rooms || []).map((r, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800">
                      <td className="p-2 font-bold text-slate-800 dark:text-slate-200">{r.room_number || r.roomNumber}</td>
                      <td className="p-2">{r.building}</td>
                      <td className="p-2">{r.floor}</td>
                      <td className="p-2">{r.type}</td>
                      <td className="p-2 text-slate-500">{r.bed_type || r.bedType || '-'}</td>
                      <td className="p-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-700">
                          {r.status || 'KOSONG'}
                        </span>
                      </td>
                      <td className="p-2 font-mono">Rp {Number(r.price_per_night || r.pricePerNight || 0).toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                  {(!fetchedData.rooms || fetchedData.rooms.length === 0) && (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-slate-400">Tidak ada baris data kamar di sheet 'rooms'.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activePreviewTab === 'TRANSACTIONS' && (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold">
                    <th className="p-2">Nama Tamu</th>
                    <th className="p-2">Kamar</th>
                    <th className="p-2">Kategori</th>
                    <th className="p-2">Tgl Mulai</th>
                    <th className="p-2">Durasi</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(fetchedData.transactions || []).map((t, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800">
                      <td className="p-2 font-bold text-slate-800 dark:text-slate-200">{t.guest_name || t.guestName}</td>
                      <td className="p-2">{t.room_number || t.roomNumber}</td>
                      <td className="p-2">{t.category}</td>
                      <td className="p-2 font-mono">{t.start_date || t.startDate}</td>
                      <td className="p-2">{t.duration} Hari</td>
                      <td className="p-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {(!fetchedData.transactions || fetchedData.transactions.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-400">Tidak ada baris data transaksi di sheet 'transactions'.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activePreviewTab === 'USERS' && (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold">
                    <th className="p-2">Username</th>
                    <th className="p-2">Nama Lengkap</th>
                    <th className="p-2">Role</th>
                    <th className="p-2">Departemen</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(fetchedData.users || []).map((u, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800">
                      <td className="p-2 font-mono text-emerald-600 font-bold">@{u.username}</td>
                      <td className="p-2 font-bold text-slate-800 dark:text-slate-200">{u.full_name || u.fullName}</td>
                      <td className="p-2">{u.role}</td>
                      <td className="p-2">{u.department}</td>
                      <td className="p-2">{u.status || 'Aktif'}</td>
                    </tr>
                  ))}
                  {(!fetchedData.users || fetchedData.users.length === 0) && (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-400">Tidak ada baris data petugas di sheet 'users'.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activePreviewTab === 'QC' && (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold">
                    <th className="p-2">No. Kamar</th>
                    <th className="p-2">Gedung</th>
                    <th className="p-2">Pemeriksa QC</th>
                    <th className="p-2">Tanggal</th>
                    <th className="p-2">Kebersihan</th>
                    <th className="p-2">Hasil QC</th>
                  </tr>
                </thead>
                <tbody>
                  {(fetchedData.qc_inspections || []).map((q, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800">
                      <td className="p-2 font-bold text-slate-800 dark:text-slate-200">{q.room_number || q.roomNumber}</td>
                      <td className="p-2">{q.building}</td>
                      <td className="p-2">{q.inspector_name || q.inspectorName}</td>
                      <td className="p-2 font-mono text-slate-500">{q.inspection_date || q.inspectionDate}</td>
                      <td className="p-2">{q.cleanliness}</td>
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          (q.result || 'LOLOS_QC').includes('LOLOS') ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {q.result || 'LOLOS_QC'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {(!fetchedData.qc_inspections || fetchedData.qc_inspections.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-400">Tidak ada baris inspeksi mutu di sheet 'qc_inspections'.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activePreviewTab === 'MAINTENANCES' && (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold">
                    <th className="p-2">No. Kamar</th>
                    <th className="p-2">Gedung</th>
                    <th className="p-2">Kendala / Masalah</th>
                    <th className="p-2">Urgensi</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Pelapor</th>
                  </tr>
                </thead>
                <tbody>
                  {(fetchedData.maintenances || []).map((m, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800">
                      <td className="p-2 font-bold text-slate-800 dark:text-slate-200">{m.room_number || m.roomNumber}</td>
                      <td className="p-2">{m.building}</td>
                      <td className="p-2 text-slate-800 dark:text-slate-200 max-w-xs truncate">{m.issue}</td>
                      <td className="p-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800">{m.urgency}</span>
                      </td>
                      <td className="p-2">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-200 dark:bg-slate-700">{m.status}</span>
                      </td>
                      <td className="p-2 text-slate-500">{m.reporter}</td>
                    </tr>
                  ))}
                  {(!fetchedData.maintenances || fetchedData.maintenances.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-400">Tidak ada data tiket perbaikan di sheet 'maintenances'.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activePreviewTab === 'ORDERS' && (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold">
                    <th className="p-2">Tamu</th>
                    <th className="p-2">No. Kamar</th>
                    <th className="p-2">Menu</th>
                    <th className="p-2">Porsi</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Total Harga</th>
                  </tr>
                </thead>
                <tbody>
                  {(fetchedData.breakfast_orders || []).map((o, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800">
                      <td className="p-2 font-bold text-slate-800 dark:text-slate-200">{o.guest_name || o.guestName}</td>
                      <td className="p-2">{o.room_number || o.roomNumber}</td>
                      <td className="p-2">{o.menu_name || o.menuName}</td>
                      <td className="p-2">{o.portions} Porsi</td>
                      <td className="p-2">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800">{o.status}</span>
                      </td>
                      <td className="p-2 font-mono">Rp {Number(o.total_price || o.totalPrice || 0).toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                  {(!fetchedData.breakfast_orders || fetchedData.breakfast_orders.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-400">Tidak ada baris pesanan makan di sheet 'breakfast_orders'.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activePreviewTab === 'WORK_SESSIONS' && (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold">
                    <th className="p-2">Nama Petugas</th>
                    <th className="p-2">Role</th>
                    <th className="p-2">Waktu Masuk</th>
                    <th className="p-2">Waktu Keluar</th>
                    <th className="p-2">Durasi Kerja</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(fetchedData.work_sessions || []).map((w, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800">
                      <td className="p-2 font-bold text-slate-800 dark:text-slate-200">{w.user_name || w.userName}</td>
                      <td className="p-2">{w.user_role || w.userRole}</td>
                      <td className="p-2 font-mono text-[11px]">{w.login_time || w.loginTime}</td>
                      <td className="p-2 font-mono text-[11px]">{w.logout_time || w.logoutTime || 'Sedang Bertugas'}</td>
                      <td className="p-2">{w.duration_formatted || w.durationFormatted || '-'}</td>
                      <td className="p-2">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-200 dark:bg-slate-700">{w.status}</span>
                      </td>
                    </tr>
                  ))}
                  {(!fetchedData.work_sessions || fetchedData.work_sessions.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-400">Tidak ada baris sesi kerja di sheet 'work_sessions'.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activePreviewTab === 'RAW' && (
              <pre className="p-3 font-mono text-[11px] text-slate-700 dark:text-slate-300 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(fetchedData.raw, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* 6. Panduan Lengkap Konfigurasi & Auto-Provisioning */}
      <div id="apps-script-guide-box" className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 pb-3">
          <div className="flex items-center space-x-2">
            <i className="fa-solid fa-circle-question text-emerald-600 text-sm"></i>
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
              Panduan Konfigurasi Google Spreadsheet &amp; Apps Script
            </h3>
          </div>

          <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveGuideTab('AUTO')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition shrink-0 ${activeGuideTab === 'AUTO' ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'}`}
            >
              🚀 Cara Otomatis (Cepat)
            </button>
            <button
              type="button"
              onClick={() => setActiveGuideTab('STEP1')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition shrink-0 ${activeGuideTab === 'STEP1' ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-2xs' : 'text-slate-600 dark:text-slate-400'}`}
            >
              1. Buat Sheet
            </button>
            <button
              type="button"
              onClick={() => setActiveGuideTab('STEP2')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition shrink-0 ${activeGuideTab === 'STEP2' ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-2xs' : 'text-slate-600 dark:text-slate-400'}`}
            >
              2. Apps Script
            </button>
            <button
              type="button"
              onClick={() => setActiveGuideTab('STEP3')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition shrink-0 ${activeGuideTab === 'STEP3' ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-2xs' : 'text-slate-600 dark:text-slate-400'}`}
            >
              3. Deploy Web App
            </button>
            <button
              type="button"
              onClick={() => setActiveGuideTab('SCRIPT')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition shrink-0 ${activeGuideTab === 'SCRIPT' ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-2xs' : 'text-slate-600 dark:text-slate-400'}`}
            >
              Kode Skrip
            </button>
          </div>
        </div>

        {activeGuideTab === 'AUTO' && (
          <div className="space-y-3 animate-in fade-in">
            <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-xl border border-emerald-300 dark:border-emerald-700/60 space-y-3">
              <div className="flex items-center space-x-2 text-emerald-900 dark:text-emerald-200">
                <i className="fa-solid fa-sparkles text-emerald-600 text-base"></i>
                <h4 className="font-extrabold text-sm">
                  Metode Auto-Provisioning (Hanya 3 Langkah Praktis):
                </h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-emerald-200 dark:border-emerald-800/60 space-y-1.5 shadow-2xs">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 font-bold flex items-center justify-center text-xs">1</span>
                  <h5 className="font-bold text-xs text-slate-800 dark:text-slate-200">Buat File Kosong</h5>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Buka <a href="https://sheets.new" target="_blank" rel="noreferrer" className="text-emerald-600 font-bold underline">sheets.new</a>. Biarkan dokumen kosong (cukup ada <em>Sheet1</em> bawaan). Anda tidak perlu membuat tab atau kolom apapun!
                  </p>
                </div>

                <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-emerald-200 dark:border-emerald-800/60 space-y-1.5 shadow-2xs">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 font-bold flex items-center justify-center text-xs">2</span>
                  <h5 className="font-bold text-xs text-slate-800 dark:text-slate-200">Pasang &amp; Deploy Skrip</h5>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Buka <strong>Extensions &gt; Apps Script</strong>, tempelkan kode skrip dari tab <em>Kode Skrip</em>, lalu Deploy sebagai <strong>Web App</strong> dengan akses <strong>Anyone</strong>. Salin URL-nya ke form di atas.
                  </p>
                </div>

                <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-emerald-200 dark:border-emerald-800/60 space-y-1.5 shadow-2xs">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 font-bold flex items-center justify-center text-xs">3</span>
                  <h5 className="font-bold text-xs text-slate-800 dark:text-slate-200">Klik Inisialisasi Otomatis</h5>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Klik tombol <strong>Inisialisasi Otomatis</strong> di atas. Sistem akan mandiri membuat 8 lembar kerja, menyusun header hijau berformat rapi, dan membekukan baris pertama.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeGuideTab === 'STEP1' && (
          <div className="space-y-3 animate-in fade-in">
            <div className="flex items-start space-x-3 p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 font-bold flex items-center justify-center text-xs shrink-0">1</span>
              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-900 dark:text-slate-100">Buat File Google Spreadsheet Baru</h4>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-xs">
                  Buka <a href="https://sheets.new" target="_blank" rel="noreferrer" className="text-emerald-600 dark:text-emerald-400 font-bold underline">sheets.new</a> di browser Anda. Berikan nama dokumen, misalnya: <strong>Database SIM Asrama Haji Jakarta</strong>.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2">
                  <div className="p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="font-mono text-emerald-600 font-bold text-xs block">Tab: buildings</span>
                    <span className="text-[11px] text-slate-500">Header: id, name, code, floors, total_rooms, category, status</span>
                  </div>
                  <div className="p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="font-mono text-emerald-600 font-bold text-xs block">Tab: rooms</span>
                    <span className="text-[11px] text-slate-500">Header: id, room_number, building, floor, type, status, price_per_night</span>
                  </div>
                  <div className="p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="font-mono text-emerald-600 font-bold text-xs block">Tab: transactions</span>
                    <span className="text-[11px] text-slate-500">Header: id, guest_name, room_number, building, start_date, duration, status</span>
                  </div>
                  <div className="p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="font-mono text-emerald-600 font-bold text-xs block">Tab: users</span>
                    <span className="text-[11px] text-slate-500">Header: id, username, full_name, role, department, status, phone</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeGuideTab === 'STEP2' && (
          <div className="space-y-3 animate-in fade-in">
            <div className="flex items-start space-x-3 p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 font-bold flex items-center justify-center text-xs shrink-0">2</span>
              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 dark:text-slate-100">Buka Menu Extensions &gt; Apps Script</h4>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-xs">
                  Di Google Spreadsheet Anda, klik menu <strong>Extensions (Ekstensi) &gt; Apps Script</strong>.
                </p>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-xs">
                  Hapus fungsi bawaan <code className="text-emerald-600 font-mono">myFunction()</code>, kemudian tempelkan (paste) seluruh kode dari tab <strong>Kode Skrip</strong> di atas ke dalam file <strong>Code.gs</strong>. Tekan tombol <strong>Save (Ctrl+S / Cmd+S)</strong>.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeGuideTab === 'STEP3' && (
          <div className="space-y-3 animate-in fade-in">
            <div className="flex items-start space-x-3 p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 font-bold flex items-center justify-center text-xs shrink-0">3</span>
              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 dark:text-slate-100">Deploy sebagai Web App (Akses Anyone)</h4>
                <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <p>1. Di editor Apps Script, klik tombol biru <strong>Deploy &gt; New deployment</strong> di kanan atas.</p>
                  <p>2. Pilih jenis deployment: ikon gerigi &gt; <strong>Web app</strong>.</p>
                  <p>3. <strong>Execute as:</strong> Pilih <em>Me (email Anda)</em>.</p>
                  <p>4. <strong>Who has access:</strong> Pilih <strong className="text-emerald-700 dark:text-emerald-400">Anyone (Siapa saja)</strong> agar aplikasi dapat membaca dan menulis data tanpa memblokir CORS.</p>
                  <p>5. Klik <strong>Deploy</strong>, izinkan akses akun (Authorize access), lalu salin <strong>Web App URL</strong> yang dihasilkan (berakhiran <code className="text-emerald-600 font-mono">/exec</code>) dan masukkan ke kolom di atas.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeGuideTab === 'SCRIPT' && (
          <div className="space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">File: Code.gs (Versi Auto-Provisioning &amp; Real-Time Sync)</span>
              <button
                type="button"
                onClick={handleCopyScript}
                className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
              >
                <i className={`fa-solid ${copiedScript ? 'fa-check' : 'fa-copy'}`}></i>
                <span>{copiedScript ? 'Tersalin!' : 'Salin Kode'}</span>
              </button>
            </div>
            <pre className="p-3.5 bg-slate-950 text-emerald-300 rounded-xl font-mono text-[11px] overflow-x-auto max-h-96 leading-relaxed border border-slate-800 custom-scrollbar">
              {appsScriptCode}
            </pre>
          </div>
        )}
      </div>

      {/* 7. Riwayat Log Sinkronisasi */}
      {syncLogs.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2.5">
            <div className="flex items-center space-x-2">
              <i className="fa-solid fa-clock-rotate-left text-slate-500"></i>
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                Log Riwayat Sinkronisasi &amp; Auto-Provisioning Sesi Ini
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setSyncLogs([])}
              className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              Bersihkan Log
            </button>
          </div>

          <div className="space-y-1.5 font-mono text-[11px]">
            {syncLogs.map((log, idx) => (
              <div 
                key={idx}
                className={`p-2 rounded-lg flex items-center justify-between gap-2 border ${
                  log.success 
                    ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-200' 
                    : 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40 text-rose-900 dark:text-rose-200'
                }`}
              >
                <div className="flex items-center space-x-2 truncate">
                  <span className="font-bold text-[10px] px-1.5 py-0.2 rounded bg-white dark:bg-slate-800 border">
                    {log.type}
                  </span>
                  <span className="truncate">{log.message}</span>
                </div>
                <span className="text-[10px] text-slate-400 shrink-0">{log.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmation Modals */}
      <ActionConfirmModal
        isOpen={showApplyConfirm}
        title="Terapkan Data dari Google Spreadsheet"
        subtitle="Konfirmasi Sinkronisasi Masuk"
        message="Apakah Anda yakin ingin menerapkan seluruh data yang terbaca dari Google Spreadsheet ke dalam aplikasi dan database pusat? Data lokal & cloud akan diselaraskan."
        confirmText="Ya, Terapkan ke Aplikasi"
        variant="primary"
        icon="fa-download"
        onClose={() => setShowApplyConfirm(false)}
        onConfirm={handleApplyDataToApp}
      />

      <ActionConfirmModal
        isOpen={showPushConfirm}
        title="Kirim Seluruh Data ke Google Spreadsheet"
        subtitle="Sinkronisasi Seluruh 13 Tabel Aplikasi"
        message="Apakah Anda yakin ingin mengekspor seluruh data aktif (Gedung, Kamar, Katalog Tipe Kamar & Tarif, Aula, Katering & Menu, Reservasi Tamu, Petugas, Perawatan, Inspeksi QC, Presensi Kerja, Pengaturan Instansi, dan Audit Log) ke Google Spreadsheet? Seluruh baris data pada sheet terkait akan diperbarui dan diselaraskan."
        confirmText="Ya, Kirim Semua Data ke Spreadsheet"
        variant="primary"
        icon="fa-cloud-arrow-up"
        onClose={() => setShowPushConfirm(false)}
        onConfirm={handlePushDataToSpreadsheet}
      />

      {/* Modal Konfirmasi Auto-Provisioning */}
      {showProvisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex items-start space-x-3.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-xl shrink-0 font-bold">
                <i className="fa-solid fa-wand-magic-sparkles"></i>
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">
                  Inisialisasi Otomatis (Auto-Provisioning)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Membangun struktur database lengkap ke Google Spreadsheet Anda.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs space-y-2">
              <p className="text-slate-700 dark:text-slate-300">
                Sistem akan secara otomatis menjalankan:
              </p>
              <ul className="space-y-1 text-slate-600 dark:text-slate-400 list-disc list-inside">
                <li>Mendeteksi &amp; membuat 13 lembar kerja lengkap: <strong>buildings</strong>, <strong>rooms</strong>, <strong>room_capacity_rates</strong> (katalog tipe kamar &amp; tarif), <strong>meeting_rooms</strong>, <strong>breakfast_menu_items</strong>, <strong>transactions</strong>, <strong>users</strong>, <strong>maintenances</strong>, <strong>qc_inspections</strong>, <strong>breakfast_orders</strong>, <strong>work_sessions</strong>, <strong>app_settings</strong>, <strong>system_logs</strong>.</li>
                <li>Menyusun baris pertama (header) dengan format baku, teks tebal, dan warna hijau Kemenag.</li>
                <li>Membekukan baris header (freeze row 1) dan menyesuaikan lebar kolom.</li>
                <li>Membersihkan tab bawaan kosong jika tidak digunakan.</li>
              </ul>
            </div>

            {/* Checklist Pengisian Data Awal */}
            <label className="flex items-center space-x-2.5 p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 cursor-pointer">
              <input
                type="checkbox"
                checked={populateSeedOnProvision}
                onChange={(e) => setPopulateSeedOnProvision(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 border-slate-300 cursor-pointer"
              />
              <span className="text-xs font-bold text-emerald-950 dark:text-emerald-200">
                Sekaligus isi data master sistem saat ini ke lembar kerja yang baru dibuat
              </span>
            </label>

            <div className="flex items-center justify-end space-x-2.5 pt-2 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setShowProvisionModal(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteAutoProvision}
                className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold rounded-xl text-xs shadow-md transition flex items-center space-x-2 cursor-pointer"
              >
                <i className="fa-solid fa-wand-magic-sparkles text-amber-300"></i>
                <span>Jalankan Auto-Provisioning Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
