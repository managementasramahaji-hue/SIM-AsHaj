// @ts-nocheck
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Transaction, Room, RoomCapacityRate, MeetingRoom, Building } from "../types"
import QRCode from 'qrcode';
import { dataStorage } from "../services/dataStorage";

const cachedLogoImages = new Map<string, HTMLImageElement>();

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Menghasilkan ID unik berikutnya secara berurutan (inkremental sekuensial) berdasarkan ID yang sudah ada di tabel/sheet.
 * Contoh: Jika tabel memiliki bld-1, bld-2, ..., bld-12, fungsi ini menghasilkan bld-13.
 * Jika tabel meetingRooms memiliki mr-1 ... mr-15, menghasilkan mr-16.
 */
export function getNextSequentialId(items: { id?: string }[] | undefined | null, prefix: string): string {
  let maxNum = 0;
  let found = false;
  // Cari ID yang berformat prefix diikuti angka sekuensial (misal: bld-1, mr-15, room-60, usr-3)
  const regex = new RegExp(`^${prefix}(\\d+)$`, 'i');
  for (const item of (items || [])) {
    if (!item?.id) continue;
    const strId = String(item.id).trim();
    const match = strId.match(regex);
    if (match) {
      found = true;
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum && num < 100000) {
        maxNum = num;
      }
    }
  }
  if (!found && items && items.length > 0) {
    // Jika belum ada ID numerik dengan prefix tersebut, hitung dari panjang daftar item
    maxNum = items.length;
  }
  let nextNum = maxNum + 1;
  let candidate = `${prefix}${nextNum}`;
  const existingSet = new Set((items || []).map(it => it?.id ? String(it.id).toLowerCase().trim() : ''));
  while (existingSet.has(candidate.toLowerCase())) {
    nextNum++;
    candidate = `${prefix}${nextNum}`;
  }
  return candidate;
}

export function getRealTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getRealLocalDateTimeStr(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

export function parseLocalTimeString(str: string | null | undefined): Date {
  if (!str) return new Date();
  const [datePart, timePart] = str.trim().split(' ');
  if (!datePart) return new Date();
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm, ss] = (timePart || '00:00:00').split(':').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return new Date();
  return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0);
}

export function getRealDateWithOffset(offsetDays: number = 1): string {
  const target = new Date();
  target.setDate(target.getDate() + offsetDays);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatIndonesianDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function addDaysToDateStr(dateStr: string, days: number = 1): string {
  if (!dateStr) return getRealDateWithOffset(days);
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const target = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  target.setDate(target.getDate() + days);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatRupiah(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
}

export function angkaKeTerbilang(nilai: number): string {
  if (isNaN(nilai) || nilai <= 0) return 'Nol Rupiah';
  const satuan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  
  function konversi(n: number): string {
    if (n < 12) return satuan[n];
    if (n < 20) return konversi(n - 10) + ' Belas';
    if (n < 100) return konversi(Math.floor(n / 10)) + ' Puluh' + (n % 10 !== 0 ? ' ' + konversi(n % 10) : '');
    if (n < 200) return 'Seratus' + (n - 100 !== 0 ? ' ' + konversi(n - 100) : '');
    if (n < 1000) return konversi(Math.floor(n / 100)) + ' Ratus' + (n % 100 !== 0 ? ' ' + konversi(n % 100) : '');
    if (n < 2000) return 'Seribu' + (n - 1000 !== 0 ? ' ' + konversi(n - 1000) : '');
    if (n < 1000000) return konversi(Math.floor(n / 1000)) + ' Ribu' + (n % 1000 !== 0 ? ' ' + konversi(n % 1000) : '');
    if (n < 1000000000) return konversi(Math.floor(n / 1000000)) + ' Juta' + (n % 1000000 !== 0 ? ' ' + konversi(n % 1000000) : '');
    if (n < 1000000000000) return konversi(Math.floor(n / 1000000000)) + ' Miliar' + (n % 1000000000 !== 0 ? ' ' + konversi(n % 1000000000) : '');
    return konversi(Math.floor(n / 1000000000000)) + ' Triliun' + (n % 1000000000000 !== 0 ? ' ' + konversi(n % 1000000000000) : '');
  }

  return konversi(Math.round(nilai)).trim() + ' Rupiah';
}

export function formatIndonesianDateTime(dateTimeStr: string | null | undefined): string {
  if (!dateTimeStr) return '-';
  const parts = dateTimeStr.split(' ');
  const datePart = parts[0];
  const timePart = parts[1] || '';
  const indDate = formatIndonesianDate(datePart);
  return timePart ? `${indDate}, ${timePart} WIB` : indDate;
}

export const BUILDING_ORDER = [
  'Gedung A',
  'Gedung A (Arafah)',
  'Arafah',
  'Gedung B',
  'Gedung B (Muzdalifah)',
  'Muzdalifah',
  'Gedung C',
  'Gedung C (Mina)',
  'Mina',
  'Gedung D',
  'Gedung D1',
  'Gedung D (Madinah)',
  'Madinah',
  'Gedung D2',
  'Gedung D3',
  'Gedung D4',
  'Gedung D5',
  'Gedung E',
  'Gedung F',
  'Gedung G',
  'Gedung H',
  'Gedung I',
  'Gedung J',
  'Gedung K',
  'Gedung Utama',
  'Gedung Serbaguna (SG)',
  'Gedung Serbaguna',
  'Ruang Pertemuan / Aula',
  'Ruang Pertemuan',
  'Aula'
];

/**
 * Checks if a building or room represents meeting / multipurpose / hall facilities
 */
export function isMeetingFacility(name: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return lower.includes('ruang pertemuan') || 
         lower.includes('aula') || 
         lower.includes('serbaguna') ||
         lower.includes('auditorium') ||
         lower.includes('gedung sg') ||
         lower.includes('multipurpose') ||
         lower.includes('sg-') ||
         lower.includes('sg 1') ||
         lower.includes('sg 2') ||
         lower.includes('meeting') ||
         lower.includes('rapat');
}

/**
 * Menghitung bobot urutan gedung agar konsisten dengan Katalog Gedung & Fasilitas UPT:
 * 1. Gedung Hunian berurutan alfabetis & numerik: Gedung A, Gedung B, Gedung C, Gedung D1, Gedung D2, Gedung D3, Gedung D4, Gedung D5, Gedung E, Gedung G, Gedung H
 * 2. Gedung Utama di akhir kelompok penginapan/hunian
 * 3. Gedung Serbaguna (SG)
 * 4. Ruang Pertemuan / Aula di urutan paling bawah
 */
export function getBuildingOrderRank(name?: string | null): number {
  if (!name) return 99999;
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();

  // Fasilitas Aula & Ruang Pertemuan selalu paling bawah
  if (lower.includes('aula') || lower.includes('pertemuan') || lower.includes('auditorium') || lower.includes('rapat')) {
    return 10000;
  }

  // Gedung Serbaguna (SG) konvensi
  if (lower.includes('serbaguna') || lower.includes('multipurpose') || lower.includes('sg')) {
    return 9000;
  }

  // Gedung Utama / Sekretariat
  if (lower.includes('utama') || lower.includes('sekretariat') || lower.includes('kantor')) {
    return 8000;
  }

  // Pola regex: "Gedung <Huruf><Nomor>?" (misal: "Gedung A", "Gedung B", "Gedung C", "Gedung D1", "Gedung D2", "Gedung D3", "Gedung D4", "Gedung D5", "Gedung E", dst)
  const m = lower.match(/gedung\s+([a-z])\s*(?:-|\s*)?(\d+)?/i);
  if (m) {
    const letterIdx = m[1].toUpperCase().charCodeAt(0) - 65; // A=0, B=1, C=2, D=3...
    const subNum = m[2] ? parseInt(m[2], 10) : 1;
    return 100 + (letterIdx * 20) + subNum;
  }

  // Pola huruf tunggal diawal string (misal: "A (Arafah)", "A-1", "D2")
  const m2 = lower.match(/^([a-z])(?:\s*(?:-|\s*)(\d+))?(?:\s+|$|\()/i);
  if (m2) {
    const letterIdx = m2[1].toUpperCase().charCodeAt(0) - 65;
    const subNum = m2[2] ? parseInt(m2[2], 10) : 1;
    return 100 + (letterIdx * 20) + subNum;
  }

  // Pencocokan alias nama bersejarah jika nama gedung tidak menyertakan kata "Gedung"
  if (lower.includes('arafah')) return 101;
  if (lower.includes('muzdalifah')) return 121;
  if (lower.includes('mina')) return 141;
  if (lower.includes('madinah')) return 161;

  return 5000;
}

/**
 * Compares building names to ensure consistent sorting:
 * 1. Standard residential buildings (Gedung A, Gedung B, Gedung C, Gedung D1, Gedung D2, Gedung D3, Gedung D4, Gedung D5, Gedung E, Gedung G, Gedung H, Gedung Utama)
 * 2. Gedung Serbaguna (SG)
 * 3. Ruang Pertemuan / Aula strictly at the very bottom
 */
export function compareBuildingOrder(a?: string | null, b?: string | null): number {
  const strA = (a || '').trim();
  const strB = (b || '').trim();
  if (strA === strB) return 0;
  if (!strA) return 1;
  if (!strB) return -1;

  const rankA = getBuildingOrderRank(strA);
  const rankB = getBuildingOrderRank(strB);

  if (rankA !== rankB) {
    return rankA - rankB;
  }

  return strA.localeCompare(strB, 'id-ID', { numeric: true, sensitivity: 'base' });
}

export function getTxDays(t: Transaction): number {
  if (t.rentAulaDurationDays && t.rentAulaDurationDays >= 1) {
    return t.rentAulaDurationDays;
  }
  if (t.durationUnit === 'Hari') {
    return t.duration >= 24 ? Math.ceil(t.duration / 24) : Math.max(1, t.duration);
  }
  if (t.duration >= 24) {
    return Math.ceil(t.duration / 24);
  }
  return 1;
}

export function checkMeetingRoomAvailability(
  roomId: string,
  startDate: string,
  duration: number,
  transactions: Transaction[],
  excludeTxId?: string,
  durationUnit?: string,
  daysCount?: number
): { isValid: boolean; message?: string } {
  const isEightHours = duration === 8;
  const isHourly = durationUnit === 'Jam' || duration === 8 || duration === 4 || duration === 12;
  const proposedDays = daysCount && daysCount >= 1
    ? daysCount
    : (durationUnit === 'Hari' || (!isHourly && duration < 24 && duration >= 1))
    ? (duration >= 24 ? Math.ceil(duration / 24) : Math.max(1, duration))
    : (duration >= 24 ? Math.ceil(duration / 24) : 1);

  const datesToCheck: string[] = [];
  for (let i = 0; i < proposedDays; i++) {
    datesToCheck.push(addDaysToDateStr(startDate, i));
  }

  for (const dateStr of datesToCheck) {
    const activeTxsOnDate = transactions.filter(t => {
      if (t.roomId !== roomId) return false;
      if (t.status === 'DIBATALKAN' || t.status === 'SELESAI') return false;
      if (excludeTxId && t.id === excludeTxId) return false;

      const tDays = getTxDays(t);
      for (let j = 0; j < tDays; j++) {
        if (addDaysToDateStr(t.startDate, j) === dateStr) {
          return true;
        }
      }
      return false;
    });

    const has12OrMultiDay = activeTxsOnDate.some(t => t.duration >= 12 || t.durationUnit === 'Hari' || t.duration >= 24);
    const count8 = activeTxsOnDate.filter(t => (t.duration === 8 || (t.duration < 12 && t.durationUnit !== 'Hari'))).length;

    if (isEightHours) {
      if (has12OrMultiDay) {
        return {
          isValid: false,
          message: `Pada tanggal ${formatIndonesianDate(dateStr)}, ruang pertemuan sudah disewa paket 12 Jam / Multi-hari. Silakan ganti ke tanggal lain yang kosong.`
        };
      }
      if (count8 >= 2) {
        return {
          isValid: false,
          message: `Pada tanggal ${formatIndonesianDate(dateStr)}, ruang pertemuan sudah mencapai batas maksimal 2 penyewa (2x 8 Jam). Silakan ganti ke tanggal lain yang kosong.`
        };
      }
    } else {
      if (activeTxsOnDate.length > 0) {
        return {
          isValid: false,
          message: `Pada tanggal ${formatIndonesianDate(dateStr)}, ruang pertemuan sudah memiliki jadwal penyewaan aktif (ada penyewa 8 Jam atau 12 Jam / Multi-hari). Pemesanan 12 Jam hingga berhari-hari memerlukan ruangan kosong penuh. Silakan ganti ke tanggal lain yang kosong.`
        };
      }
    }
  }

  return { isValid: true };
}

export function generateQrCodeDataUrl(text: string): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 180;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    // Fill white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 180, 180);

    const primaryColor = '#164e63'; // Rich dark teal / cyan matching reference

    // Generate actual standard-compliant QR matrix using qrcode library with high error correction ('H')
    const qr = QRCode.create(text || 'UPT-ASRAMA-VERIFIED', { errorCorrectionLevel: 'H' });
    const qrSize = qr.modules.size;
    const qrData = qr.modules.data;

    // Presisi simetris: Hitung ukuran sel dan margin agar QR code benar-benar berada tepat di tengah kanvas
    const availableSize = 160;
    const cellSize = availableSize / qrSize;
    const actualQrSize = qrSize * cellSize;
    const marginX = (canvas.width - actualQrSize) / 2;
    const marginY = (canvas.height - actualQrSize) / 2;

    // Draw data modules
    ctx.fillStyle = primaryColor;
    for (let row = 0; row < qrSize; row++) {
      for (let col = 0; col < qrSize; col++) {
        // Skip finder pattern zones (top-left 7x7, top-right 7x7, bottom-left 7x7)
        const isTopLeftFinder = row < 7 && col < 7;
        const isTopRightFinder = row < 7 && col >= qrSize - 7;
        const isBottomLeftFinder = row >= qrSize - 7 && col < 7;
        if (isTopLeftFinder || isTopRightFinder || isBottomLeftFinder) continue;

        // Skip center emblem zone (center modules)
        const centerModule = Math.floor(qrSize / 2);
        if (row >= centerModule - 3 && row <= centerModule + 3 && col >= centerModule - 3 && col <= centerModule + 3) {
          continue;
        }

        const idx = row * qrSize + col;
        if (qrData[idx]) {
          const x = marginX + col * cellSize;
          const y = marginY + row * cellSize;
          if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(x, y, cellSize * 0.92, cellSize * 0.92, 1);
            ctx.fill();
          } else {
            ctx.fillRect(x, y, cellSize * 0.92, cellSize * 0.92);
          }
        }
      }
    }

    // Draw stylized finder patterns (Top-Left, Top-Right, Bottom-Left)
    const drawFinderPattern = (startX: number, startY: number) => {
      const boxSize = 7 * cellSize;
      ctx.fillStyle = primaryColor;
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(startX, startY, boxSize, boxSize, 6);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(startX + cellSize * 1.2, startY + cellSize * 1.2, boxSize - cellSize * 2.4, boxSize - cellSize * 2.4, 4);
        ctx.fill();

        ctx.fillStyle = primaryColor;
        ctx.beginPath();
        ctx.roundRect(startX + cellSize * 2.2, startY + cellSize * 2.2, boxSize - cellSize * 4.4, boxSize - cellSize * 4.4, 2);
        ctx.fill();
      } else {
        ctx.fillRect(startX, startY, boxSize, boxSize);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(startX + cellSize * 1.2, startY + cellSize * 1.2, boxSize - cellSize * 2.4, boxSize - cellSize * 2.4);
        ctx.fillStyle = primaryColor;
        ctx.fillRect(startX + cellSize * 2.2, startY + cellSize * 2.2, boxSize - cellSize * 4.4, boxSize - cellSize * 4.4);
      }
    };

    drawFinderPattern(marginX, marginY);
    drawFinderPattern(marginX + (qrSize - 7) * cellSize, marginY);
    drawFinderPattern(marginX, marginY + (qrSize - 7) * cellSize);

    // Center Web Logo / Emblem - Terletak presisi di titik tengah kanvas (90, 90)
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const logoRadius = 20;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(centerX, centerY, logoRadius + 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, logoRadius + 2, 0, Math.PI * 2);
    ctx.stroke();

    let logoDrawn = false;
    try {
      const appSettings = dataStorage.getAppSettings();
      const appLogo = appSettings?.appLogo;
      if (appLogo && (appLogo.startsWith('data:image/') || appLogo.startsWith('http'))) {
        let cachedImg = cachedLogoImages.get(appLogo);
        if (!cachedImg) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = appLogo;
          cachedLogoImages.set(appLogo, img);
          cachedImg = img;
        }
        if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(centerX, centerY, logoRadius, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(cachedImg, centerX - logoRadius, centerY - logoRadius, logoRadius * 2, logoRadius * 2);
          ctx.restore();
          logoDrawn = true;
        }
      }
    } catch (e) {
      // ignore
    }

    if (!logoDrawn) {
      ctx.fillStyle = primaryColor;
      ctx.beginPath();
      ctx.arc(centerX, centerY, logoRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fef08a'; // gold inner seal
      ctx.beginPath();
      ctx.arc(centerX, centerY, logoRadius - 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#0f172a'; // dark core
      ctx.beginPath();
      ctx.arc(centerX, centerY, logoRadius - 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    return canvas.toDataURL('image/png');
  } catch (e) {
    return '';
  }
}

/**
 * Memastikan tanda tangan memiliki warna tinta hitam pekat (#0f172a atau #000000)
 * dengan transparansi latar belakang yang rapi saat disematkan ke dalam berkas PDF.
 */
export function ensureBlackSignatureDataUrl(signatureDataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    if (!signatureDataUrl || !signatureDataUrl.startsWith('data:image/')) {
      resolve(signatureDataUrl);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || img.width || 360;
        c.height = img.naturalHeight || img.height || 160;
        const ctx = c.getContext('2d');
        if (!ctx) {
          resolve(signatureDataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, c.width, c.height);
        const data = imgData.data;
        // Ubah semua goresan/tinta menjadi hitam (#0f172a) dengan mempertahankan kehalusan transparansi (alpha channel)
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha > 15) {
            data[i] = 15;     // R
            data[i + 1] = 23; // G
            data[i + 2] = 42; // B
          }
        }
        ctx.putImageData(imgData, 0, 0);
        resolve(c.toDataURL('image/png'));
      } catch (e) {
        resolve(signatureDataUrl);
      }
    };
    img.onerror = () => resolve(signatureDataUrl);
    img.src = signatureDataUrl;
  });
}

/**
 * Memperbarui nomor kamar secara otomatis ketika nomor lantai ("Lantai Ke-") diubah/diisi.
 * Mengikuti konvensi baku UPT Asrama Haji Jakarta:
 * Nomor lantai berada pada digit awal nomor unit kamar setelah pemisah/kode gedung (misal Gedung D5 Lantai 3 -> D5-301, Gedung A Lantai 2 -> A-201).
 */
export function updateRoomNumberWithFloor(currentRoomNumber: string, newFloor: number, bldCode?: string): string {
  const safeFloor = Math.max(1, Math.min(20, newFloor || 1));
  const trimmed = (currentRoomNumber || '').trim();

  // Jika string nomor kamar memiliki tanda pemisah '-' (contoh: "D5-201", "A-101", "SG-1")
  if (trimmed.includes('-')) {
    const lastHyphenIndex = trimmed.lastIndexOf('-');
    const prefix = trimmed.slice(0, lastHyphenIndex + 1); // contoh "D5-" atau "A-"
    const roomPart = trimmed.slice(lastHyphenIndex + 1).trim(); // contoh "201"

    const matchDigits = roomPart.match(/^(\d+)(.*)$/);
    if (matchDigits) {
      const digits = matchDigits[1];
      const suffix = matchDigits[2] || '';
      let newDigits = '';
      if (digits.length >= 3) {
        // Ganti digit lantai (angka pertama untuk 3 digit misal 201 -> 301, atau 2 digit awal untuk 4 digit misal 1001)
        if (digits.length === 3) {
          newDigits = `${safeFloor}${digits.slice(1)}`;
        } else {
          newDigits = `${safeFloor}${digits.slice(-2)}`;
        }
      } else {
        newDigits = `${safeFloor}01`;
      }
      return `${prefix}${newDigits}${suffix}`;
    }
    return `${prefix}${safeFloor}01`;
  }

  // Jika belum ada tanda pemisah '-', cek apakah diawali prefix gedung atau langsung angka
  const pfx = bldCode ? `${bldCode.trim().toUpperCase()}-` : '';
  if (!trimmed) {
    return `${pfx}${safeFloor}01`;
  }

  const matchLettersDigits = trimmed.match(/^([A-Za-z]+)(\d*)$/);
  if (matchLettersDigits) {
    const letters = matchLettersDigits[1];
    return `${letters}-${safeFloor}01`;
  }

  const pureDigitsMatch = trimmed.match(/^(\d+)$/);
  if (pureDigitsMatch) {
    const digits = pureDigitsMatch[1];
    if (digits.length >= 2) {
      return `${pfx}${safeFloor}${digits.slice(1)}`;
    }
    return `${pfx}${safeFloor}01`;
  }

  return `${pfx}${safeFloor}01`;
}

/**
 * Mendeteksi lantai dari digit nomor unit kamar (bukan dari digit kode gedung).
 * Contoh:
 * - "D5-301" -> 3 (lantai 3, bukan 5)
 * - "A-205"  -> 2
 * - "101"    -> 1
 * - "B-1205" -> 12
 */
export function extractFloorFromRoomNumber(roomNum: string): number | null {
  if (!roomNum) return null;
  const trimmed = roomNum.trim();

  // Jika terdapat hyphen '-', ambil bagian kamar setelah hyphen terakhir
  let targetNumStr = trimmed;
  if (trimmed.includes('-')) {
    const lastHyphenIndex = trimmed.lastIndexOf('-');
    targetNumStr = trimmed.slice(lastHyphenIndex + 1).trim();
  }

  const match = targetNumStr.match(/\d+/);
  if (match && match[0].length > 0) {
    const numStr = match[0];
    if (numStr.length === 3) {
      const flr = parseInt(numStr[0], 10);
      if (!isNaN(flr) && flr >= 1 && flr <= 20) return flr;
    } else if (numStr.length >= 4) {
      const flr = parseInt(numStr.slice(0, numStr.length - 2), 10);
      if (!isNaN(flr) && flr >= 1 && flr <= 20) return flr;
    } else if (numStr.length >= 1) {
      const flr = parseInt(numStr[0], 10);
      if (!isNaN(flr) && flr >= 1 && flr <= 20) return flr;
    }
  }
  return null;
}

/**
 * Menghitung nomor kamar berikutnya secara otomatis berdasarkan kamar terakhir yang terdaftar
 * pada gedung dan lantai yang dipilih.
 * Contoh:
 * - Gedung D5 Lantai 3 -> D5-301 (atau D5-302 jika D5-301 sudah ada).
 * - Gedung A Lantai 2 -> A-201 (atau A-202 jika A-201 sudah ada).
 */
export function getNextRoomNumber(
  allRooms: Room[] = [],
  buildingName: string = '',
  floor: number = 1,
  buildingCode?: string
): string {
  const safeFloor = Math.max(1, Math.min(20, floor || 1));
  const bNameClean = (buildingName || '').trim().toLowerCase();

  // Filter kamar yang berada di gedung yang sama
  const buildingRooms = (allRooms || []).filter(r => 
    (r.building || '').trim().toLowerCase() === bNameClean
  );

  // Tentukan prefix gedung (misal "D5-", "A-", "B-", "SG-")
  let prefix = '';
  if (buildingCode && buildingCode.trim()) {
    const cleanCode = buildingCode.trim().toUpperCase();
    prefix = cleanCode.endsWith('-') ? cleanCode : `${cleanCode}-`;
  } else if (buildingRooms.length > 0) {
    const sample = buildingRooms.find(r => r.roomNumber && r.roomNumber.includes('-'));
    if (sample) {
      const lastHyphen = sample.roomNumber.lastIndexOf('-');
      prefix = sample.roomNumber.slice(0, lastHyphen + 1).toUpperCase();
    }
  }

  if (!prefix && buildingName) {
    // Tangkap kode gedung misal "Gedung D5 (Madinah)" -> "D5-", "Gedung A (Arafah)" -> "A-"
    const matchGedung = buildingName.match(/Gedung\s+([A-Za-z0-9]+)/i);
    if (matchGedung) {
      prefix = `${matchGedung[1].toUpperCase()}-`;
    }
  }

  // Filter kamar yang berada di lantai yang sama
  const floorRooms = buildingRooms.filter(r => {
    if (Number(r.floor) === safeFloor) return true;
    const detected = extractFloorFromRoomNumber(r.roomNumber);
    return detected === safeFloor;
  });

  if (floorRooms.length === 0) {
    return `${prefix}${safeFloor}01`;
  }

  // Cari nomor urut kamar terbesar di lantai ini
  let maxSeqNumber = 0;
  let detectedFloorPrefix = prefix;

  floorRooms.forEach(r => {
    const raw = (r.roomNumber || '').trim();
    if (raw.includes('-')) {
      const lastHyphenIndex = raw.lastIndexOf('-');
      detectedFloorPrefix = raw.slice(0, lastHyphenIndex + 1);
      const roomPart = raw.slice(lastHyphenIndex + 1).trim();
      const match = roomPart.match(/^(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeqNumber) {
          maxSeqNumber = num;
        }
      }
    } else {
      const match = raw.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeqNumber) {
          maxSeqNumber = num;
        }
      }
    }
  });

  if (maxSeqNumber > 0) {
    // Misal maxSeqNumber adalah 301 -> kamar berikutnya 302
    // Pastikan angka lantai tetap sesuai safeFloor
    const nextNumber = maxSeqNumber + 1;
    return `${detectedFloorPrefix || prefix}${nextNumber}`;
  }

  return `${prefix}${safeFloor}01`;
}

/**
 * Deduplikasi daftar konfigurasi tarif kapasitas kamar berdasarkan ID dan kombinasi roomType::bedType
 */
export function deduplicateRoomCapacityRates(rates: RoomCapacityRate[]): RoomCapacityRate[] {
  if (!Array.isArray(rates)) return [];
  const seenIds = new Set<string>();
  const seenCombos = new Set<string>();
  return rates.filter(r => {
    if (!r) return false;
    const idKey = String(r.id || '').trim();
    const comboKey = `${String(r.roomType || '').trim().toLowerCase()}::${String(r.bedType || '').trim().toLowerCase()}`;
    
    // Cegah duplikasi ID ataupun duplikasi kombinasi roomType dan bedType
    if (idKey && seenIds.has(idKey)) return false;
    if (comboKey !== '::' && seenCombos.has(comboKey)) return false;

    if (idKey) seenIds.add(idKey);
    if (comboKey !== '::') seenCombos.add(comboKey);
    return true;
  });
}

/**
 * Normalisasi nama gedung untuk alias singkat legacy (misal: "d2" -> "Gedung D2")
 * Menjaga 100% nama gedung kustom hasil input/edit pengguna di seluruh aplikasi.
 */
export function normalizeBuildingName(name: string): string {
  if (!name) return '';
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();

  // Hanya normalisasi alias singkatan mentah jika bukan nama lengkap
  if (lower === 'd2') return 'Gedung D2';
  if (lower === 'd3') return 'Gedung D3';
  if (lower === 'd4') return 'Gedung D4';
  if (lower === 'd5') return 'Gedung D5';
  if (lower === 'utama') return 'Gedung Utama';
  if (lower === 'sg') return 'Gedung Serbaguna (SG)';
  if (lower === 'aula') return 'Ruang Pertemuan / Aula';

  return trimmed;
}

/**
 * Helper terpadu dan akurat untuk menentukan nama gedung pengelompokan kamar/ruangan
 * Menghubungkan secara sinkron: Katalog Gedung & Fasilitas, Denah Penyewaan, dan Halaman QC
 */
export function getRoomBuildingKey(r: Room, meetingRooms?: MeetingRoom[]): string {
  if (!r) return '';

  // 1. Cek dari master meetingRooms jika terdaftar
  if (meetingRooms && meetingRooms.length > 0) {
    const matchingMr = meetingRooms.find(m => m.id === r.id || m.name.toLowerCase() === (r.roomNumber || '').toLowerCase());
    if (matchingMr) {
      if (matchingMr.category === 'SERBAGUNA') {
        return 'Gedung Serbaguna (SG)';
      }
      if (matchingMr.category === 'AULA' || matchingMr.category === 'RUANG_PERTEMUAN') {
        return 'Ruang Pertemuan / Aula';
      }
      if (matchingMr.building && matchingMr.building !== 'Ruang Pertemuan' && matchingMr.building !== 'Ruang Pertemuan / Aula' && matchingMr.building !== 'Gedung Serbaguna' && matchingMr.building !== 'Gedung Serbaguna (SG)') {
        return matchingMr.building.trim();
      }
      const nLower = matchingMr.name.toLowerCase().trim();
      const cLower = (matchingMr.code || '').toLowerCase().trim();
      const bLower = (matchingMr.building || '').toLowerCase().trim();
      if (nLower.startsWith('ruang pertemuan') || nLower.startsWith('aula') || nLower.startsWith('auditorium') || nLower.startsWith('ruang rapat') || nLower.startsWith('ruang vip')) {
        return 'Ruang Pertemuan / Aula';
      }
      if (nLower.includes('serbaguna') || nLower.includes('multipurpose') || nLower.startsWith('gedung sg') || nLower.startsWith('sg-') || cLower === 'mp' || cLower.startsWith('sg-') || bLower.includes('serbaguna')) {
        return 'Gedung Serbaguna (SG)';
      }
      return 'Ruang Pertemuan / Aula';
    }
  }

  // 2. Evaluasi tipe/kategori ruang serbaguna & aula
  if (r.building === 'Gedung Serbaguna (SG)' || r.building === 'Gedung Serbaguna' || r.type === 'Gedung Serbaguna (SG)') {
    return 'Gedung Serbaguna (SG)';
  }
  if (r.building === 'Ruang Pertemuan' || r.building === 'Ruang Pertemuan / Aula' || r.type === 'Ruang Pertemuan / Aula' || isMeetingFacility(r.building) || isMeetingFacility(r.type || '')) {
    return 'Ruang Pertemuan / Aula';
  }

  // 3. Utamakan nama gedung yang tersimpan pada objek kamar (r.building) agar saat nama gedung diedit tidak memicu gedung baru/terpisah
  if (r.building && r.building.trim() !== '') {
    return r.building.trim();
  }

  // 4. Fallback evaluasi prefix nomor kamar hanya jika r.building kosong
  const rNum = (r.roomNumber || '').trim().toUpperCase();
  if (rNum.startsWith('D2-') || rNum.startsWith('D2 ')) return 'Gedung D2';
  if (rNum.startsWith('D3-') || rNum.startsWith('D3 ')) return 'Gedung D3';
  if (rNum.startsWith('D4-') || rNum.startsWith('D4 ')) return 'Gedung D4';
  if (rNum.startsWith('D5-') || rNum.startsWith('D5 ')) return 'Gedung D5';
  if (rNum.startsWith('D1-') || rNum.startsWith('D-')) return 'Gedung D';
  if (rNum.startsWith('A-')) return 'Gedung A';
  if (rNum.startsWith('B-')) return 'Gedung B';
  if (rNum.startsWith('C-')) return 'Gedung C';
  if (rNum.startsWith('E-')) return 'Gedung E';
  if (rNum.startsWith('G-')) return 'Gedung G';
  if (rNum.startsWith('H-')) return 'Gedung H';
  if (rNum.startsWith('GU-')) return 'Gedung Utama';

  return '';
}

/**
 * Memeriksa apakah sebuah kamar secara akurat dan toleran termasuk ke dalam suatu Gedung.
 * Menghubungkan variasi penamaan seperti 'Gedung A' vs 'Gedung A (Arafah)', pencocokan kode prefix (misal 'A-101' -> Gedung A),
 * ID gedung, maupun nama alias resmi yang tersimpan di spreadsheet / master data.
 */
export function isRoomMatchingBuilding(r: Room, b: Building, allMeetingRooms?: MeetingRoom[]): boolean {
  if (!r || !b) return false;

  // 1. Pencocokan ID Gedung langsung jika tersedia
  if ((r as any).buildingId && b.id && String((r as any).buildingId).trim() === String(b.id).trim()) {
    return true;
  }

  const bNameClean = (b.name || '').trim().toLowerCase();
  const rBldClean = (r.building || '').trim().toLowerCase();
  if (rBldClean && rBldClean === bNameClean) return true;

  // 2. Pencocokan melalui getRoomBuildingKey
  const effKey = getRoomBuildingKey(r, allMeetingRooms).toLowerCase();
  if (effKey && effKey === bNameClean) return true;

  // 3. Pencocokan melalui kode gedung dan prefix nomor kamar (misal: Code 'A' dengan nomor 'A-101' atau 'A101')
  const bCode = (b.code || '').trim().toUpperCase();
  const rNum = (r.roomNumber || '').trim().toUpperCase();
  if (bCode && (rNum.startsWith(`${bCode}-`) || rNum.startsWith(`${bCode} `) || (rNum.startsWith(bCode) && /^\d/.test(rNum.slice(bCode.length))))) {
    return true;
  }

  // 4. Pencocokan nama dasar tanpa tanda kurung (misal: "Gedung A" vs "Gedung A (Arafah)")
  const getBaseName = (str: string) => str.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
  const bBase = getBaseName(b.name || '');
  const rBase = getBaseName(r.building || '');
  if (bBase && rBase && bBase === rBase) return true;

  // 5. Pencocokan awalan huruf nama gedung (misal: "Gedung A..." dan "Gedung A...")
  if (bBase.startsWith('gedung ') && rBase.startsWith('gedung ')) {
    const bPart = bBase.slice(7).trim();
    const rPart = rBase.slice(7).trim();
    if (bPart && rPart && bPart[0] === rPart[0] && (bPart.length === 1 || rPart.length === 1)) {
      return true;
    }
  }

  // 6. Substring match
  if (bBase.length >= 4 && (rBldClean.includes(bBase) || bNameClean.includes(rBase))) {
    return true;
  }

  return false;
}

/**
 * Menemukan nama gedung resmi dari daftar gedung master untuk suatu kamar
 */
export function resolveRoomBuildingName(r: Room, buildings: Building[], allMeetingRooms?: MeetingRoom[]): string {
  if (!r) return '';
  if (Array.isArray(buildings) && buildings.length > 0) {
    const matchedBld = buildings.find(b => isRoomMatchingBuilding(r, b, allMeetingRooms));
    if (matchedBld) return matchedBld.name;
  }
  return getRoomBuildingKey(r, allMeetingRooms) || r.building || '';
}

/**
 * Deduplikasi daftar kamar berdasarkan ID serta kombinasi (gedung + nomor kamar)
 * Memprioritaskan kamar yang sedang aktif (TERISI / BOOKED / MAINTENANCE) agar data transaksi aman
 */
export function deduplicateRoomsByBuildingAndNumber(rooms: Room[], meetingRooms?: MeetingRoom[]): Room[] {
  if (!Array.isArray(rooms)) return [];
  const byId = new Map<string, Room>();
  rooms.forEach(r => {
    if (!r || !r.id) return;
    byId.set(String(r.id).trim(), r);
  });

  const byBuildingAndNum = new Map<string, Room>();
  Array.from(byId.values()).forEach(r => {
    const bKey = getRoomBuildingKey(r, meetingRooms);
    const numKey = String(r.roomNumber || '').trim().toUpperCase();
    const compositeKey = `${bKey.toLowerCase()}::${numKey}`;
    if (!numKey) {
      byBuildingAndNum.set(`id::${r.id}`, { ...r, building: bKey || r.building });
      return;
    }
    const existing = byBuildingAndNum.get(compositeKey);
    if (!existing) {
      byBuildingAndNum.set(compositeKey, { ...r, building: bKey || r.building });
    } else {
      const existingActive = existing.status === 'TERISI' || existing.status === 'BOOKED' || existing.status === 'MAINTENANCE' || Boolean(existing.activeTxId) || Boolean(existing.activeMaintId);
      const currentActive = r.status === 'TERISI' || r.status === 'BOOKED' || r.status === 'MAINTENANCE' || Boolean(r.activeTxId) || Boolean(r.activeMaintId);
      if (currentActive && !existingActive) {
        byBuildingAndNum.set(compositeKey, { ...r, building: bKey || r.building });
      }
    }
  });

  return Array.from(byBuildingAndNum.values());
}


