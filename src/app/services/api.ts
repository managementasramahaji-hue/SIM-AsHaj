// @ts-nocheck
import { normalizeSpreadsheetPayload } from './spreadsheetStorage';
import type { CompleteStorageDatabase } from './dataStorage';

/**
 * URL Google Apps Script Web App yang telah dideploy
 */
export function getGoogleSheetWebAppUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_SHEET_WEBAPP_URL || (import.meta as any).env?.GOOGLE_SHEETS_WEBAPP_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim();
  }
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('CUSTOM_SHEET_WEBAPP_URL');
    if (custom && custom.trim()) {
      return custom.trim();
    }
  }
  return '';
}

/**
 * Mengambil data spesifik dari sheet Google Spreadsheet melalui Web App URL
 * Sesuai dengan instruksi penarikan data dari endpoint Google Sheets yang telah dideploy.
 */
export async function fetchFromGoogleSheet(sheetName: string): Promise<any[]> {
  const webAppUrl = getGoogleSheetWebAppUrl();
  if (!webAppUrl) {
    console.error("VITE_SHEET_WEBAPP_URL belum diatur!");
    return [];
  }
  
  try {
    const response = await fetch(`${webAppUrl}?sheet=${encodeURIComponent(sheetName)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) {
      console.warn(`HTTP error ${response.status} saat mengambil data dari sheet ${sheetName}`);
      return [];
    }
    const result = await response.json();
    
    // Tangani respons array langsung
    if (Array.isArray(result.data)) {
      return result.data;
    }
    if (Array.isArray(result)) {
      return result;
    }
    
    // Tangani respons payload bersarang seperti { data: { rooms: [...] } }
    if (result.data && typeof result.data === 'object') {
      const targetKey = Object.keys(result.data).find(
        k => k.toLowerCase() === sheetName.toLowerCase() || 
             k.replace(/_/g, '').toLowerCase() === sheetName.replace(/_/g, '').toLowerCase()
      );
      if (targetKey && Array.isArray(result.data[targetKey])) {
        return result.data[targetKey];
      }
    }

    return result.data || [];
  } catch (error) {
    console.warn(`[API] Tidak dapat memuat data sheet ${sheetName} secara langsung, beralih ke fallback:`, error);
    try {
      const fallbackRes = await fetch(`/api/sheets/database?sheet=${encodeURIComponent(sheetName)}`);
      if (fallbackRes.ok) {
        const fallbackJson = await fallbackRes.json();
        const d = fallbackJson.data;
        if (Array.isArray(d)) return d;
        if (d && typeof d === 'object') {
          const matchKey = Object.keys(d).find(
            k => k.toLowerCase() === sheetName.toLowerCase() || 
                 k.replace(/_/g, '').toLowerCase() === sheetName.replace(/_/g, '').toLowerCase()
          );
          if (matchKey && Array.isArray(d[matchKey])) return d[matchKey];
        }
      }
    } catch (_) {}
    return [];
  }
}

/**
 * Mengambil seluruh database lengkap dari endpoint Google Sheets Web App
 */
export async function fetchAllDataFromGoogleSheet(): Promise<CompleteStorageDatabase | null> {
  const webAppUrl = getGoogleSheetWebAppUrl();
  if (!webAppUrl) {
    console.error("VITE_SHEET_WEBAPP_URL belum diatur!");
    return null;
  }

  try {
    const response = await fetch(webAppUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const result = await response.json();
    const data = result.data || result;
    if (data && typeof data === 'object') {
      return normalizeSpreadsheetPayload(data);
    }
  } catch (error) {
    console.warn("Gagal mengambil seluruh data dari Google Spreadsheet langsung, mencoba server proxy:", error);
    try {
      const proxyRes = await fetch('/api/sheets/database');
      if (proxyRes.ok) {
        const proxyJson = await proxyRes.json();
        const data = proxyJson.data;
        if (data && typeof data === 'object') {
          return normalizeSpreadsheetPayload(data);
        }
      }
    } catch (proxyError) {
      console.error("Gagal mengambil data dari proxy backend:", proxyError);
    }
  }

  return null;
}
