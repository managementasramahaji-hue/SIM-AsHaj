// Mirrors the app database (stored in Lovable Cloud) into a Google Spreadsheet
// owned by the connected Google account. The spreadsheet is a read-only copy for reporting.
const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

export const MIRROR_TABS: { tab: string; key: string; omit?: string[] }[] = [
  { tab: "Gedung", key: "buildings" },
  { tab: "Kamar", key: "rooms" },
  { tab: "Ruang Pertemuan", key: "meetingRooms" },
  { tab: "Tarif Kapasitas", key: "roomCapacityRates" },
  { tab: "Transaksi", key: "transactions" },
  { tab: "Pengguna", key: "users", omit: ["password", "passwordHash", "signatureImage"] },
  { tab: "Menu Sarapan", key: "breakfastMenuItems" },
  { tab: "Pesanan Sarapan", key: "breakfastOrders" },
  { tab: "Pemeliharaan", key: "maintenances" },
  { tab: "Inspeksi QC", key: "qcInspections" },
  { tab: "Sesi Kerja", key: "workSessions" },
  { tab: "Log Audit", key: "auditLogs" },
];

function headers() {
  const lovable = process.env["LOVABLE_API_KEY"];
  const conn = process.env["GOOGLE_SHEETS_API_KEY"];
  if (!lovable || !conn) throw new Error("Koneksi Google Sheets belum tersedia");
  return { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": conn, "Content-Type": "application/json" };
}

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${GATEWAY}${path}`, { ...init, headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Sheets mirror failed [${res.status}]: ${body}`);
    throw new Error(`Google Sheets [${res.status}]: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export async function createMirrorSpreadsheet(): Promise<{ id: string; url: string }> {
  const r = await call("/spreadsheets", {
    method: "POST",
    body: JSON.stringify({
      properties: { title: "SIM Asrama Haji Jakarta - Database (salinan otomatis)", locale: "in_ID", timeZone: "Asia/Jakarta" },
      sheets: MIRROR_TABS.map((t) => ({ properties: { title: t.tab, gridProperties: { frozenRowCount: 1 } } })),
    }),
  });
  return { id: r.spreadsheetId, url: r.spreadsheetUrl };
}

function cell(v: unknown): string | number | boolean {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" || typeof v === "boolean") return v;
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (s.startsWith("data:")) return "[gambar]";
  return s.length > 45000 ? s.slice(0, 45000) : s;
}

export function toRows(list: any[], omit: string[] = []): (string | number | boolean)[][] {
  const items = (Array.isArray(list) ? list : []).filter((x) => x && typeof x === "object");
  const cols: string[] = [];
  for (const it of items) for (const k of Object.keys(it)) if (!omit.includes(k) && !cols.includes(k)) cols.push(k);
  if (!cols.length) return [["(kosong)"]];
  return [cols, ...items.map((it) => cols.map((c) => cell(it[c])))];
}

export async function writeMirror(spreadsheetId: string, db: any) {
  const ranges = MIRROR_TABS.map((t) => `'${t.tab}'`);
  await call(`/spreadsheets/${spreadsheetId}/values:batchClear`, { method: "POST", body: JSON.stringify({ ranges }) });
  await call(`/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: MIRROR_TABS.map((t) => ({ range: `'${t.tab}'!A1`, values: toRows(db?.[t.key], t.omit) })),
    }),
  });
}
