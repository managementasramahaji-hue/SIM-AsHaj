import ExcelJS from 'exceljs';
import { ReportExportParams, generateReportData } from './reportExporter';
import { formatIndonesianDate, getRealTodayDate } from './utils';
import { getReportSignatory, calculateReportColumnWidths } from './pdfDownloader';
import { dataStorage } from '../services/dataStorage';

/**
 * Loads the official logo image as base64 and extension.
 * If appSettings.appLogo contains an uploaded image (PNG, JPG, WebP, SVG, blob/data URL),
 * it loads and renders it onto a 256x256 high-resolution transparent square canvas,
 * maintaining the natural 1:1 circular/square aspect ratio with zero distortion or squishing.
 * If not present or icon name, it generates an official high-resolution vector emblem badge image.
 */
export async function loadOfficialLogoImage(appLogo?: string): Promise<{ base64: string; extension: 'png' }> {
  if (appLogo && (appLogo.startsWith('data:') || appLogo.startsWith('http') || appLogo.startsWith('blob:') || appLogo.startsWith('/'))) {
    try {
      // Convert image to clean, centered 256x256 PNG via canvas to guarantee true 1:1 aspect ratio
      const dataUrl = await new Promise<string>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const targetSize = 256;
            const canvas = document.createElement('canvas');
            canvas.width = targetSize;
            canvas.height = targetSize;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, targetSize, targetSize);
              const imgW = img.naturalWidth || img.width || targetSize;
              const imgH = img.naturalHeight || img.height || targetSize;
              // Maintain exact aspect ratio within square bounding box
              const maxDim = targetSize - 8;
              const scale = Math.min(maxDim / imgW, maxDim / imgH);
              const drawW = Math.round(imgW * scale);
              const drawH = Math.round(imgH * scale);
              const drawX = Math.round((targetSize - drawW) / 2);
              const drawY = Math.round((targetSize - drawH) / 2);

              ctx.drawImage(img, drawX, drawY, drawW, drawH);
              resolve(canvas.toDataURL('image/png'));
              return;
            }
            resolve('');
          } catch (e) {
            resolve('');
          }
        };
        img.onerror = () => resolve('');
        img.src = appLogo;
      });

      if (dataUrl) {
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
        return { base64, extension: 'png' };
      }
    } catch (e) {
      console.warn('Could not load custom logo, falling back to official badge:', e);
    }
  }

  // Official high-resolution canvas emblem badge (256x256 px)
  try {
    const targetSize = 256;
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const cx = targetSize / 2;
      const cy = targetSize / 2;
      const r = 118;

      // Outer gold-bordered seal
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#6F4B2B'; // Official Chocolate Brown
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#B8860B'; // Gold border
      ctx.stroke();

      // Inner white badge
      ctx.beginPath();
      ctx.arc(cx, cy, r - 14, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#B8860B';
      ctx.stroke();

      // Center gold shield
      ctx.beginPath();
      ctx.rect(cx - 52, cy - 64, 104, 128);
      ctx.fillStyle = '#B8860B';
      ctx.fill();

      // Inner gold & white typography
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 38px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🏛️', cx, cy - 18);
      ctx.font = 'bold 30px Arial';
      ctx.fillText('KH', cx, cy + 26);

      const base64 = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
      return { base64, extension: 'png' };
    }
  } catch (e) {}

  return {
    base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    extension: 'png'
  };
}

/**
 * Exports data as genuine styled Microsoft Excel (.xlsx) file using ExcelJS.
 * Embeds the ACTUAL official logo image into cell A3:A5 with pure white background,
 * full typography, A4 page setup, and crisp double-ruled Kop borders.
 */
export async function exportToExcelWithExcelJs(params: ReportExportParams): Promise<void> {
  const { title, filename, headers, rows, summaryStats } = generateReportData(params);

  const appSettings = dataStorage.getAppSettings();
  const realToday = getRealTodayDate();

  // Determine Manager Signature according to report type (matches PDF signatory logic)
  const signatory = getReportSignatory(params.type, params.currentUser, params.users);
  const managerName = signatory.name;
  const managerRole = signatory.role;
  const managerNip = signatory.nip;

  const numCols = headers.length;

  // Initialize ExcelJS Workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'UPT Asrama Haji Jakarta';
  workbook.lastModifiedBy = 'UPT Asrama Haji Jakarta';
  workbook.created = new Date();
  workbook.modified = new Date();

  // Configure A4 Landscape Worksheet matching PDF print setup
  const ws = workbook.addWorksheet('Laporan_Resmi', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.35,
        right: 0.35,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2
      },
      horizontalCentered: true
    },
    views: [{ showGridLines: true }]
  });

  // Calculate dynamic content-aware column widths calibrated for A4 Landscape
  // Ensures total table width fits comfortably on A4 Landscape (~135-146 width units)
  const rawColWidths = headers.map((h, cIdx) => {
    const hLen = h.length;
    let maxContentLen = 0;
    rows.forEach(r => {
      const val = String(r[cIdx] ?? '');
      if (val) {
        val.split('\n').forEach(line => {
          if (line.length > maxContentLen) maxContentLen = line.length;
        });
      }
    });

    const hLow = h.toLowerCase();
    let baseMin = 10;
    let baseMax = 26;

    if (cIdx === 0 || hLow === 'no' || hLow === 'no.') {
      baseMin = 6;
      baseMax = 8;
    } else if (hLow.includes('durasi') || hLow.includes('satuan') || hLow.includes('hari') || hLow.includes('porsi')) {
      baseMin = 8;
      baseMax = 11;
    } else if (hLow.includes('id') || hLow.includes('kode') || hLow.includes('tgl') || hLow.includes('waktu')) {
      baseMin = 11;
      baseMax = 15;
    } else if (hLow.includes('status') || hLow.includes('urgensi') || hLow.includes('vonis')) {
      baseMin = 11;
      baseMax = 15;
    } else if (hLow.includes('kontak') || hLow.includes('telepon') || hLow.includes('hp') || hLow.includes('nip')) {
      baseMin = 13;
      baseMax = 16;
    } else if (hLow.includes('tarif') || hLow.includes('biaya') || hLow.includes('harga') || hLow.includes('pnbp')) {
      baseMin = 14;
      baseMax = 18;
    } else if (hLow.includes('gedung') || hLow.includes('wilayah') || hLow.includes('kloter')) {
      baseMin = 12;
      baseMax = 18;
    } else if (hLow.includes('nama') || hLow.includes('penyelenggara') || hLow.includes('instansi') || hLow.includes('petugas')) {
      baseMin = 16;
      baseMax = 24;
    } else if (hLow.includes('kamar') || hLow.includes('aula') || hLow.includes('ruang') || hLow.includes('fasilitas')) {
      baseMin = 16;
      baseMax = 24;
    } else if (hLow.includes('agenda') || hLow.includes('catatan') || hLow.includes('deskripsi') || hLow.includes('rincian')) {
      baseMin = 20;
      baseMax = 32;
    }

    const estimated = Math.max(hLen + 2, Math.min(maxContentLen + 2, baseMax));
    const clamped = Math.max(baseMin, Math.min(estimated, baseMax));
    return clamped;
  });

  // Normalize column widths so sum fits within A4 Landscape printable width (~140-145 wch)
  const TARGET_A4_TOTAL = 142;
  const currentTotal = rawColWidths.reduce((a, b) => a + b, 0);
  const colWidths = rawColWidths.map((w, idx) => {
    if (idx === 0) return { wch: Math.max(7, w) }; // No. column kept at 7-8
    if (currentTotal > TARGET_A4_TOTAL) {
      const nonNoCurrent = currentTotal - rawColWidths[0];
      const nonNoTarget = TARGET_A4_TOTAL - rawColWidths[0];
      const scaled = Math.round((w / nonNoCurrent) * nonNoTarget);
      return { wch: Math.max(8, scaled) };
    }
    return { wch: w };
  });

  const totalCalculatedWch = colWidths.reduce((a, b) => a + (b.wch || 12), 0);

  for (let c = 0; c < numCols; c++) {
    const colObj = ws.getColumn(c + 1);
    colObj.width = colWidths[c]?.wch || 12;
  }

  // Row 1: Top Brand Primary Bar (Chocolate Brown #6F4B2B)
  ws.getRow(1).height = 4.5;
  ws.mergeCells(1, 1, 1, numCols);
  for (let c = 1; c <= numCols; c++) {
    const cell = ws.getCell(1, c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6F4B2B' } };
  }

  // Row 2: Gold Accent Bar (Warm Gold #B8860B)
  ws.getRow(2).height = 2.5;
  ws.mergeCells(2, 1, 2, numCols);
  for (let c = 1; c <= numCols; c++) {
    const cell = ws.getCell(2, c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8860B' } };
  }

  // Row 3 to 5: Kop Header Area
  // Calculate split column for Kop area so that both sides get balanced space (~50-52% left, ~48-50% right)
  let cumW = 0;
  let splitCol = 2;
  const halfTotal = totalCalculatedWch * 0.52;
  for (let c = 1; c <= numCols; c++) {
    cumW += (colWidths[c - 1]?.wch || 12);
    if (cumW >= halfTotal && c < numCols) {
      splitCol = c;
      break;
    }
  }
  splitCol = Math.max(2, Math.min(numCols - 1, splitCol));

  // Determine row 4 height dynamically based on address length and available width in right side of Kop
  const rightKopWidth = colWidths.slice(splitCol).reduce((a, b) => a + (b.wch || 12), 0);
  const addrText = appSettings.address || '';
  const addrLines = Math.max(1, Math.ceil(addrText.length / Math.max(20, rightKopWidth - 4)));
  const row4Height = Math.max(22, Math.min(38, addrLines * 12 + 6));

  ws.getRow(3).height = 22;
  ws.getRow(4).height = row4Height; // Accommodates address text wrap without clipping
  ws.getRow(5).height = 18;

  // Merge A3:A5 for official logo
  ws.mergeCells(3, 1, 5, 1);
  for (let r = 3; r <= 5; r++) {
    const cell = ws.getCell(r, 1);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    cell.border = {};
  }
  ws.getCell(3, 1).value = '';

  // Embed REAL LOGO IMAGE into A3:A5 (True 1:1 Aspect Ratio, 42x42 px centered)
  const logoInfo = await loadOfficialLogoImage(params.customLogoImage || appSettings?.appLogo);
  if (logoInfo && logoInfo.base64) {
    try {
      const imageId = workbook.addImage({
        base64: logoInfo.base64,
        extension: logoInfo.extension,
      });

      ws.addImage(imageId, {
        tl: {
          nativeCol: 0,
          nativeColOff: 110000,
          nativeRow: 2,
          nativeRowOff: 90000
        },
        ext: { width: 42, height: 42 },
        editAs: 'oneCell'
      } as any);
    } catch (imgErr) {
      console.warn('Could not embed logo image into Excel, continuing:', imgErr);
    }
  }

  // Row 3 (Excel row 3): Org Name Left, Title Right
  ws.mergeCells(3, 2, 3, splitCol);
  const cellOrg = ws.getCell(3, 2);
  cellOrg.value = appSettings.organizationName || 'UPT ASRAMA HAJI JAKARTA';
  cellOrg.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FF6F4B2B' } };
  cellOrg.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  ws.mergeCells(3, splitCol + 1, 3, numCols);
  const cellCat = ws.getCell(3, splitCol + 1);
  cellCat.value = 'Laporan Resmi Manajemen Operasional';
  cellCat.font = { name: 'Arial', size: 7.5, bold: true, color: { argb: 'FF1E293B' } };
  cellCat.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };

  // Row 4 (Excel row 4): Ministry Name Left, Address Right
  ws.mergeCells(4, 2, 4, splitCol);
  const cellMinistry = ws.getCell(4, 2);
  cellMinistry.value = (appSettings.ministryName || 'KEMENTERIAN HAJI DAN UMRAH REPUBLIK INDONESIA').toUpperCase();
  cellMinistry.font = { name: 'Arial', size: 7.5, bold: true, color: { argb: 'FFB8860B' } };
  cellMinistry.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  ws.mergeCells(4, splitCol + 1, 4, numCols);
  const cellAddr = ws.getCell(4, splitCol + 1);
  cellAddr.value = appSettings.address;
  cellAddr.font = { name: 'Arial', size: 6.8, color: { argb: 'FF64748B' } };
  cellAddr.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };

  // Row 5 (Excel row 5): Subtitle Left, Contact Right
  ws.mergeCells(5, 2, 5, splitCol);
  const cellSub = ws.getCell(5, 2);
  cellSub.value = appSettings.subTitle || 'Pusat Layanan Akomodasi & Asrama Haji';
  cellSub.font = { name: 'Arial', size: 6.8, color: { argb: 'FF64748B' } };
  cellSub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  ws.mergeCells(5, splitCol + 1, 5, numCols);
  const cellContact = ws.getCell(5, splitCol + 1);
  cellContact.value = `Email: ${appSettings.email} • Telp: ${appSettings.phone}`;
  cellContact.font = { name: 'Arial', size: 6.8, color: { argb: 'FF64748B' } };
  cellContact.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };

  // Double bottom line on Row 5 (border bottom for the whole Kop)
  for (let c = 1; c <= numCols; c++) {
    const cell = ws.getCell(5, c);
    cell.border = {
      ...cell.border,
      bottom: { style: 'double', color: { argb: 'FF6F4B2B' } }
    };
  }

  // Row 6 & 7: Spacing
  ws.getRow(6).height = 5;
  ws.getRow(7).height = 5;

  // Row 8: Document Title
  ws.getRow(8).height = 24;
  ws.mergeCells(8, 1, 8, numCols);
  const titleCell = ws.getCell(8, 1);
  titleCell.value = title.toUpperCase();
  titleCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1E293B' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  for (let c = 1; c <= numCols; c++) {
    const cCell = ws.getCell(8, c);
    cCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    cCell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: c === 1 ? { style: 'thin', color: { argb: 'FFCBD5E1' } } : undefined,
      right: c === numCols ? { style: 'thin', color: { argb: 'FFCBD5E1' } } : undefined
    };
  }

  // Row 9: Metadata (Left & Right)
  ws.getRow(9).height = 18;
  const midCol = Math.max(2, Math.floor(numCols / 2));
  ws.mergeCells(9, 1, 9, midCol);
  const metaLeft = ws.getCell(9, 1);
  metaLeft.value = `Tanggal Cetak: ${formatIndonesianDate(realToday)}  |  UPT Asrama Haji Jakarta • Kementerian Haji dan Umrah RI`;
  metaLeft.font = { name: 'Arial', size: 7.0, bold: true, color: { argb: 'FF475569' } };
  metaLeft.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

  ws.mergeCells(9, midCol + 1, 9, numCols);
  const metaRight = ws.getCell(9, midCol + 1);
  metaRight.value = `Periode: ${params.period}   |   Wilayah: ${params.buildingFilter && params.buildingFilter !== 'ALL' ? params.buildingFilter : 'Semua Gedung & Aula'}`;
  metaRight.font = { name: 'Arial', size: 7.0, color: { argb: 'FF64748B' } };
  metaRight.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };

  for (let c = 1; c <= numCols; c++) {
    const cCell = ws.getCell(9, c);
    cCell.border = {
      ...cCell.border,
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }
    };
  }

  // Row 10: Spacing
  ws.getRow(10).height = 5;
  let currentRow = 11;

  // Summary KPI Cards (Executive Summary) with balanced column distribution
  if (summaryStats && summaryStats.length > 0) {
    const labelRow = currentRow;
    const valueRow = currentRow + 1;
    ws.getRow(labelRow).height = 14;
    ws.getRow(valueRow).height = 18;

    const numCards = summaryStats.length;
    if (numCols >= numCards) {
      const baseCols = Math.floor(numCols / numCards);
      const remainder = numCols % numCards;

      let currentStartCol = 1;
      summaryStats.forEach((stat, idx) => {
        const cardCols = Math.max(1, baseCols + (idx < remainder ? 1 : 0));
        const colStart = currentStartCol;
        const colEnd = Math.min(numCols, colStart + cardCols - 1);
        currentStartCol = colEnd + 1;

        if (colEnd > colStart) {
          ws.mergeCells(labelRow, colStart, labelRow, colEnd);
          ws.mergeCells(valueRow, colStart, valueRow, colEnd);
        }

        const lCell = ws.getCell(labelRow, colStart);
        lCell.value = stat.label.toUpperCase();
        lCell.font = { name: 'Arial', size: 6.2, bold: true, color: { argb: 'FF64748B' } };
        lCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

        const vCell = ws.getCell(valueRow, colStart);
        vCell.value = stat.value;
        vCell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FF6F4B2B' } };
        vCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

        for (let c = colStart; c <= colEnd; c++) {
          const lc = ws.getCell(labelRow, c);
          lc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
          lc.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: c === colStart ? { style: 'thin', color: { argb: 'FFCBD5E1' } } : undefined,
            right: c === colEnd ? { style: 'thin', color: { argb: 'FFCBD5E1' } } : undefined
          };

          const vc = ws.getCell(valueRow, c);
          vc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
          vc.border = {
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: c === colStart ? { style: 'thin', color: { argb: 'FFCBD5E1' } } : undefined,
            right: c === colEnd ? { style: 'thin', color: { argb: 'FFCBD5E1' } } : undefined
          };
        }
      });
    } else {
      // More cards than columns (rare), each card gets 1 column up to numCols
      summaryStats.slice(0, numCols).forEach((stat, idx) => {
        const c = idx + 1;
        const lCell = ws.getCell(labelRow, c);
        lCell.value = stat.label.toUpperCase();
        lCell.font = { name: 'Arial', size: 6.0, bold: true, color: { argb: 'FF64748B' } };
        lCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        lCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        lCell.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };

        const vCell = ws.getCell(valueRow, c);
        vCell.value = stat.value;
        vCell.font = { name: 'Arial', size: 8.0, bold: true, color: { argb: 'FF6F4B2B' } };
        vCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        vCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        vCell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
      });
    }

    currentRow += 2;
    ws.getRow(currentRow).height = 5;
    currentRow++;
  }

  // Table Header Row
  const headerRowIdx = currentRow;
  // Dynamic header row height based on wrapped lines
  let maxHeaderLines = 1;
  headers.forEach((h, cIdx) => {
    const colW = colWidths[cIdx]?.wch || 12;
    const estLines = Math.max(1, Math.ceil(h.length / Math.max(1, colW - 2)));
    if (estLines > maxHeaderLines) maxHeaderLines = estLines;
  });
  ws.getRow(headerRowIdx).height = Math.max(26, maxHeaderLines * 12 + 8);

  // Set repeat header on every printed page in Excel
  ws.pageSetup.printTitlesRow = `${headerRowIdx}:${headerRowIdx}`;

  headers.forEach((h, cIdx) => {
    const colNum = cIdx + 1;
    const cell = ws.getCell(headerRowIdx, colNum);
    cell.value = h;
    const hLow = h.toLowerCase();
    const isRight = hLow.includes('tarif') || hLow.includes('biaya') || hLow.includes('harga') || hLow.includes('pnbp');
    const isCenter = !isRight && (cIdx === 0 || hLow === 'no' || hLow === 'no.' || hLow.includes('durasi') || hLow.includes('satuan') || hLow.includes('status') || hLow.includes('tgl') || hLow.includes('kloter'));

    cell.font = { name: 'Arial', size: 7.8, bold: true, color: { argb: 'FF1E293B' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    cell.alignment = { vertical: 'middle', horizontal: isRight ? 'right' : (isCenter ? 'center' : 'left'), wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
  });
  currentRow++;

  // Table Data Rows
  rows.forEach((rowVals, rIdx) => {
    const rowNum = currentRow;
    const isEven = rIdx % 2 === 0;
    const rowBg = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

    // Calculate required row height dynamically based on content lines to prevent text truncation
    let maxLinesInRow = 1;
    headers.forEach((_, cIdx) => {
      const colW = colWidths[cIdx]?.wch || 12;
      const strVal = String(rowVals[cIdx] ?? '');
      if (strVal) {
        const lines = strVal.split('\n');
        let linesCount = 0;
        lines.forEach(l => {
          linesCount += Math.max(1, Math.ceil(l.length / Math.max(1, colW - 2)));
        });
        if (linesCount > maxLinesInRow) {
          maxLinesInRow = linesCount;
        }
      }
    });

    const calculatedHeight = Math.max(20, Math.min(85, maxLinesInRow * 13 + 7));
    ws.getRow(rowNum).height = calculatedHeight;

    headers.forEach((h, cIdx) => {
      const colNum = cIdx + 1;
      const cell = ws.getCell(rowNum, colNum);
      const rawVal = String(rowVals[cIdx] ?? '').trim();
      cell.value = rowVals[cIdx] ?? '';

      const hLow = h.toLowerCase();
      const isStatusCol = hLow.includes('status') || hLow.includes('urgensi') || hLow.includes('vonis');
      const isRight = hLow.includes('tarif') || hLow.includes('biaya') || hLow.includes('harga') || hLow.includes('pnbp');
      const isCenter = !isRight && (cIdx === 0 || hLow === 'no' || hLow === 'no.' || hLow.includes('durasi') || hLow.includes('satuan') || isStatusCol || hLow.includes('tgl') || hLow.includes('waktu') || hLow.includes('kloter'));

      let cellFont = { name: 'Arial', size: 7.5, color: { argb: 'FF1E293B' }, bold: false };
      let cellFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: rowBg } };
      let cellBorder: any = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      if (isStatusCol) {
        if (rawVal === 'TERISI' || rawVal === 'LOLOS_QC' || rawVal === 'SELESAI' || rawVal === 'Lunas' || rawVal === 'SIAP_PAKAI') {
          cellFont = { name: 'Arial', size: 7.5, bold: true, color: { argb: 'FF059669' } };
          cellFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
          cellBorder = {
            top: { style: 'thin', color: { argb: 'FFA7F3D0' } },
            bottom: { style: 'thin', color: { argb: 'FFA7F3D0' } },
            left: { style: 'thin', color: { argb: 'FFA7F3D0' } },
            right: { style: 'thin', color: { argb: 'FFA7F3D0' } }
          };
        } else if (rawVal === 'BOOKED' || rawVal === 'Menunggu' || rawVal === 'DIPROSES') {
          cellFont = { name: 'Arial', size: 7.5, bold: true, color: { argb: 'FF2563EB' } };
          cellFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
          cellBorder = {
            top: { style: 'thin', color: { argb: 'FFBFDBFE' } },
            bottom: { style: 'thin', color: { argb: 'FFBFDBFE' } },
            left: { style: 'thin', color: { argb: 'FFBFDBFE' } },
            right: { style: 'thin', color: { argb: 'FFBFDBFE' } }
          };
        } else if (rawVal === 'DIBATALKAN' || rawVal.includes('BATAL') || rawVal === 'RUSAK' || rawVal === 'DARURAT' || rawVal === 'REJECT') {
          cellFont = { name: 'Arial', size: 7.5, bold: true, color: { argb: 'FFDC2626' } };
          cellFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } };
          cellBorder = {
            top: { style: 'thin', color: { argb: 'FFFECACA' } },
            bottom: { style: 'thin', color: { argb: 'FFFECACA' } },
            left: { style: 'thin', color: { argb: 'FFFECACA' } },
            right: { style: 'thin', color: { argb: 'FFFECACA' } }
          };
        } else if (rawVal === 'TINGGI' || rawVal === 'Urgent' || rawVal === 'MENUNGGU_QC' || rawVal === 'PERLU_INSPEKSI' || rawVal === 'SEDANG_DIBUAT') {
          cellFont = { name: 'Arial', size: 7.5, bold: true, color: { argb: 'FFD97706' } };
          cellFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
          cellBorder = {
            top: { style: 'thin', color: { argb: 'FFFDE68A' } },
            bottom: { style: 'thin', color: { argb: 'FFFDE68A' } },
            left: { style: 'thin', color: { argb: 'FFFDE68A' } },
            right: { style: 'thin', color: { argb: 'FFFDE68A' } }
          };
        }
      } else if (isRight) {
        cellFont = { name: 'Arial', size: 7.5, bold: true, color: { argb: 'FF047857' } };
      }

      cell.font = cellFont;
      cell.fill = cellFill;
      cell.border = cellBorder;
      cell.alignment = { 
        vertical: 'middle', 
        horizontal: isRight ? 'right' : (isCenter ? 'center' : 'left'), 
        wrapText: true 
      };
    });
    currentRow++;
  });

  // PNBP official footnote for KAMAR and AULA reports
  if (params.type === 'KAMAR' || params.type === 'AULA') {
    currentRow++;
    const noteRow = currentRow;
    ws.mergeCells(noteRow, 1, noteRow, numCols);
    const nCell = ws.getCell(noteRow, 1);
    nCell.value = '*Catatan: Tarif resmi mengacu pada Standar Biaya Masukan & PNBP UPT Asrama Haji Jakarta. Bebas biaya tambahan tersembunyi. Transaksi berstatus Dibatalkan tidak dihitung ke dalam nilai penerimaan PNBP.';
    nCell.font = { name: 'Arial', size: 7.5, italic: true, color: { argb: 'FF64748B' } };
    nCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    ws.getRow(noteRow).height = 18;
  }

  // Sign-off block at bottom right (matching PDF report layout)
  // Clean, comfortable spacing from table / note (neither mepet nor too far away)
  ws.getRow(currentRow).height = 9;
  currentRow++;
  ws.getRow(currentRow).height = 9;
  currentRow++;

  const signStartRow = currentRow;

  // Calculate signature start column dynamically so the merged block has sufficient width (at least 32 chars)
  let signStartCol = numCols;
  let cumSignWidth = 0;
  for (let c = numCols; c >= 1; c--) {
    cumSignWidth += (colWidths[c - 1]?.wch || 12);
    signStartCol = c;
    if (cumSignWidth >= 32) break;
  }
  // Ensure it occupies a sensible proportion of the sheet (between col 2 and numCols)
  signStartCol = Math.max(signStartCol, Math.max(2, Math.floor(numCols * 0.55)));

  // Row heights for signature
  ws.getRow(signStartRow).height = 14;
  ws.getRow(signStartRow + 1).height = 13;
  ws.getRow(signStartRow + 2).height = 16;
  ws.getRow(signStartRow + 3).height = 12;
  ws.getRow(signStartRow + 4).height = 12;
  ws.getRow(signStartRow + 5).height = 16;
  ws.getRow(signStartRow + 6).height = 12;
  ws.getRow(signStartRow + 7).height = 12;

  // Merging signature column block
  ws.mergeCells(signStartRow, signStartCol, signStartRow, numCols);
  ws.mergeCells(signStartRow + 1, signStartCol, signStartRow + 1, numCols);
  ws.mergeCells(signStartRow + 2, signStartCol, signStartRow + 2, numCols);
  ws.mergeCells(signStartRow + 3, signStartCol, signStartRow + 3, numCols);
  ws.mergeCells(signStartRow + 4, signStartCol, signStartRow + 4, numCols);
  ws.mergeCells(signStartRow + 5, signStartCol, signStartRow + 5, numCols);
  ws.mergeCells(signStartRow + 6, signStartCol, signStartRow + 6, numCols);
  ws.mergeCells(signStartRow + 7, signStartCol, signStartRow + 7, numCols);

  // 1. Jakarta date
  const sCell1 = ws.getCell(signStartRow, signStartCol);
  sCell1.value = `Jakarta, ${formatIndonesianDate(realToday)}`;
  sCell1.font = { name: 'Arial', size: 7.5, color: { argb: 'FF475569' } };
  sCell1.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  // 2. Mengetahui / Menyetujui
  const sCell2 = ws.getCell(signStartRow + 1, signStartCol);
  sCell2.value = 'Mengetahui / Menyetujui,';
  sCell2.font = { name: 'Arial', size: 7.5, bold: true, color: { argb: 'FF1E293B' } };
  sCell2.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  // 3 & 4 & 5. Empty space for physical stamp / signature
  ws.getCell(signStartRow + 2, signStartCol).value = '';
  ws.getCell(signStartRow + 3, signStartCol).value = '';
  ws.getCell(signStartRow + 4, signStartCol).value = '';

  // 6. Manager Name (Bold Underline)
  const sCell6 = ws.getCell(signStartRow + 5, signStartCol);
  sCell6.value = managerName;
  sCell6.font = { name: 'Arial', size: 8.5, bold: true, underline: true, color: { argb: 'FF1E293B' } };
  sCell6.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  // 7. Manager Role
  const sCell7 = ws.getCell(signStartRow + 6, signStartCol);
  sCell7.value = `${managerRole} • UPT Asrama Haji`;
  sCell7.font = { name: 'Arial', size: 6.8, color: { argb: 'FF64748B' } };
  sCell7.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  // 8. Manager NIP
  const sCell8 = ws.getCell(signStartRow + 7, signStartCol);
  sCell8.value = managerNip;
  sCell8.font = { name: 'Arial', size: 6.8, color: { argb: 'FF64748B' } };
  sCell8.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  currentRow += 8;

  // Spacing before footer
  ws.getRow(currentRow).height = 8;
  currentRow++;

  // Footer Row
  const footerRowIdx = currentRow;
  ws.getRow(footerRowIdx).height = 16;
  ws.mergeCells(footerRowIdx, 1, footerRowIdx, numCols);
  const footerCell = ws.getCell(footerRowIdx, 1);
  footerCell.value = 'Dokumen Cetak Manual (Tanpa QR & TTD Digital) • Memerlukan Pengesahan TTD Fisik & Cap Basah Resmi';
  footerCell.font = { name: 'Arial', size: 6.5, italic: true, color: { argb: 'FF64748B' } };
  footerCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  for (let c = 1; c <= numCols; c++) {
    const fc = ws.getCell(footerRowIdx, c);
    fc.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
  }

  // Generate Excel buffer and trigger browser download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 250);
}
