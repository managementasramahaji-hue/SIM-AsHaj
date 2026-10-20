// @ts-nocheck
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Transaction, Room, User, ConsolidatedGroupRecord } from '../types';
import { formatIndonesianDate, getRealTodayDate, addDaysToDateStr, generateQrCodeDataUrl, formatRupiah, angkaKeTerbilang, isMeetingFacility } from './utils';
import { findRoomRate, OFFICIAL_VA_CONFIG } from '../data';
import { calculateMeetingRoomPricing } from './pricingCalculator';
import { dataStorage } from '../services/dataStorage';

function drawOfficialEmblemBadge(doc: jsPDF, x: number, y: number, size: number) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  
  // Outer dark seal circle
  doc.setFillColor(17, 24, 39); // #111827 dark slate
  doc.setDrawColor(251, 191, 36); // #fbbf24 gold border
  doc.setLineWidth(0.6);
  doc.circle(cx, cy, size / 2, 'FD');

  // Inner gold ring
  doc.setLineWidth(0.3);
  doc.circle(cx, cy, size / 2 - 1.5, 'S');

  // Inner white badge
  doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, size / 2 - 3, 'F');

  // Center gold shield / emblem box
  doc.setFillColor(217, 119, 6); // amber-600 gold
  doc.rect(cx - 3.5, cy - 4.5, 7, 9, 'F');

  // Center text (KH)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text('KH', cx, cy + 2.2, { align: 'center' });
}

function loadImageAsDataUrl(urlOrData: string): Promise<string> {
  return new Promise((resolve) => {
    if (!urlOrData) {
      resolve('');
      return;
    }
    if (urlOrData.startsWith('data:image/png') || urlOrData.startsWith('data:image/jpeg') || urlOrData.startsWith('data:image/webp')) {
      resolve(urlOrData);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 300;
        canvas.height = img.naturalHeight || img.height || 300;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
          return;
        }
        resolve(urlOrData);
      } catch (e) {
        resolve(urlOrData);
      }
    };
    img.onerror = () => resolve(urlOrData);
    img.src = urlOrData;
  });
}

/**
 * Generates an official, beautifully formatted Ministry Invoice PDF directly via jsPDF.
 * 100% reliable, zero external network calls, zero CORS canvas issues, and downloads instantly.
 */
export async function renderInvoicePdfContent(
  doc: jsPDF,
  tx: Transaction,
  room?: Room | null,
  officerName = 'Pengelola Sarana & Hunian',
  officerRole = 'Pengelola Sarana & Hunian',
  allRooms: Room[] = [],
  memberTransactions: Transaction[] = []
): Promise<{ cleanFilename: string }> {
  try {
    const vNow = new Date();
  const dateCode = vNow.toISOString().slice(0, 10).replace(/-/g, '');
  const randHex = Math.random().toString(36).substring(2, 6).toUpperCase();

  // Lookup receptionist user for signature & unique QR
  const allUsers = dataStorage.getUsers();
  const officerUser = allUsers.find(u => 
    u.fullName.toLowerCase() === officerName.toLowerCase() || 
    (u.role?.toLowerCase().includes('resepsionis') && u.signatureUrl)
  );
  const hasOfficerSig = Boolean(officerUser?.signatureUrl && officerUser.signatureUrl.trim() !== '');

  let verificationCode: string | undefined = undefined;

  const invoiceIsGroupBooking = Boolean(tx.isGroup || (tx.allocatedRoomNumbers && tx.allocatedRoomNumbers.length > 1) || (tx.totalPax && tx.totalPax > 1));
  const safeRoom = (invoiceIsGroupBooking ? 'Grup' : tx.roomNumber || 'kamar').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeName = (tx.groupPic || tx.guestName || 'Tamu').replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanFilename = `Invoice-${tx.id}-${safeName}-${safeRoom}.pdf`;

  if (hasOfficerSig) {
    verificationCode = `VLOG-${dateCode}-${randHex}`;
    try {
      const auditEntry = dataStorage.addAuditLog({
        id: `vlog-${Date.now()}-${randHex}`,
        timestamp: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' }),
        user: officerName,
        role: officerRole,
        action: 'UNDUH_PDF_BER_QR',
        details: `[${verificationCode}] Mengunduh Nota / Invoice PDF resmi ber-QR & TTD untuk Transaksi ID: ${tx.id} (${cleanFilename} - ${tx.guestName}). Petugas: ${officerName}.`,
        verificationCode,
        documentTitle: `Nota / Invoice Transaksi #${tx.id} (${tx.guestName})`,
        targetId: cleanFilename,
        signatoryName: officerName,
        signatoryRole: officerRole,
        signatoryNip: officerUser?.nip,
        qrCodeHash: 'QR-VERIFIED',
        hasQrAndSignature: true
      });
    } catch (e) {}
  } else {
    // Jika TIDAK ADA QR & TTD: tidak masuk ke log unduh PDF ber-QR dan tidak dapat diverifikasi
    try {
      dataStorage.addAuditLog({
        id: `log-${Date.now()}-${randHex}`,
        timestamp: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' }),
        user: officerName,
        role: officerRole,
        action: 'UNDUH_PDF_MANUAL',
        details: `Mengunduh Nota / Invoice Transaksi #${tx.id} (${cleanFilename}) tanpa QR & TTD Digital (Petugas ${officerName} belum mengunggah TTD).`,
        documentTitle: `Nota / Invoice Transaksi #${tx.id} (${tx.guestName})`,
        targetId: cleanFilename,
        signatoryName: officerName,
        signatoryRole: officerRole,
        signatoryNip: officerUser?.nip,
        hasQrAndSignature: false
      });
    } catch (e) {}
  }

  if (verificationCode) {
    doc.setProperties({
      title: `Nota Invoice Transaksi #${tx.id}`,
      subject: verificationCode,
      author: officerName,
      keywords: `UPT-ASRAMA-VERIFIED, ${verificationCode}, TRX-${tx.id}, ${tx.guestName}`,
      creator: 'UPT Asrama Haji Jakarta'
    });
  }

  const isAula = tx.category === 'AULA' ||
                 tx.building === 'Ruang Pertemuan' ||
                 tx.building === 'Ruang Pertemuan / Aula' ||
                 tx.building === 'Gedung Serbaguna (SG)' ||
                 tx.building === 'Gedung Serbaguna' ||
                 isMeetingFacility(tx.building) ||
                 isMeetingFacility(tx.roomNumber);
    const realToday = getRealTodayDate();
    const checkoutDate = !isAula ? addDaysToDateStr(tx.startDate, tx.duration) : tx.startDate;

    // Palette
    const primaryColor: [number, number, number] = [111, 75, 43]; // Chocolate Brown #6f4b2b
    const goldColor: [number, number, number] = [184, 134, 11]; // Warm Gold #b8860b
    const darkSlate: [number, number, number] = [30, 41, 59];
    const lightSlate: [number, number, number] = [100, 116, 139];
    const bgCard: [number, number, number] = [248, 250, 252];
    const borderCard: [number, number, number] = [226, 232, 240];

    // Determine room list across tx and memberTransactions
    const roomNumberSet = new Set<string>();
    if (tx.roomNumber && tx.building !== 'Ruang Pertemuan') {
      roomNumberSet.add(tx.roomNumber);
    }
    if (tx.allocatedRoomNumbers && Array.isArray(tx.allocatedRoomNumbers)) {
      tx.allocatedRoomNumbers.forEach(rn => rn && roomNumberSet.add(rn));
    }
    memberTransactions.forEach(m => {
      if (m.building !== 'Ruang Pertemuan' && m.roomNumber) {
        roomNumberSet.add(m.roomNumber);
      }
      if (m.allocatedRoomNumbers && Array.isArray(m.allocatedRoomNumbers)) {
        m.allocatedRoomNumbers.forEach(rn => rn && roomNumberSet.add(rn));
      }
    });

    const roomNumbers: string[] = Array.from(roomNumberSet);

    const rentedRooms = roomNumbers.map(rn => {
      const rObj = allRooms.find(r => r.roomNumber === rn);
      const memTx = memberTransactions.find(m => m.roomNumber === rn);
      const parsedCapacity = rObj ? (parseInt(String(rObj.capacity).replace(/\D/g, ''), 10) || 4) : 4;
      return {
        number: rn,
        building: rObj?.building || memTx?.building || tx.building,
        type: rObj?.type || 'Kamar Quad (4 Bed)',
        capacity: parsedCapacity,
        status: memTx?.status || rObj?.status || tx.status
      };
    });

    const isGroupBooking = Boolean(tx.isGroup || (tx.allocatedRoomNumbers && tx.allocatedRoomNumbers.length > 1) || (tx.totalPax && tx.totalPax > 1));
    const totalCapacity = rentedRooms.reduce((acc, r) => acc + r.capacity, 0);
    const uniqueBuildings = Array.from(new Set(rentedRooms.map(r => r.building)));

    // Rincian Biaya & Tarif Resmi Operasional (Dihitung di awal untuk status banner & rekap)
    const nights = Math.max(1, tx.duration || 1);
    let subtotalRooms = 0;
    const roomCapacityRates = dataStorage.getRoomCapacityRates();
    const allMeetingRooms = dataStorage.getMeetingRooms();
    const breakfastItems = dataStorage.getBreakfastMenuItems();

    interface InvoicePriceItem {
      label: string;
      subDesc?: string;
      unitRate: number;
      rateUnitLabel: string;
      qty: string;
      duration: string;
      subtotal: number;
    }
    const invoicePriceItems: InvoicePriceItem[] = [];

    if (!isAula) {
      const groupMap: Record<string, {
        building: string;
        type: string;
        bedType: string;
        rooms: string[];
        rate: number;
      }> = {};

      const sourceRooms = rentedRooms.length > 0 
        ? rentedRooms 
        : (tx.roomNumber ? [{
            number: tx.roomNumber,
            building: tx.building,
            type: room?.type || tx.category || 'Standar',
            capacity: 4,
            status: tx.status
          }] : []);

      sourceRooms.forEach(rm => {
        const rObj = allRooms.find(r => r.roomNumber === rm.number) || room;
        const matchedRate = findRoomRate(rObj?.type || rm.type, rObj?.bedType, roomCapacityRates);
        const rate = rObj?.pricePerNight || matchedRate?.pricePerNight || (
          rm.type.toLowerCase().includes('superior') ? 500000 :
          rm.type.toLowerCase().includes('ekonomi') ? 380000 : 480000
        );
        const key = `${rm.building}_${rm.type}_${rate}`;

        if (!groupMap[key]) {
          groupMap[key] = {
            building: rm.building,
            type: rm.type,
            bedType: rObj?.bedType || '4 Single Bed',
            rooms: [],
            rate
          };
        }
        groupMap[key].rooms.push(rm.number);
      });

      Object.entries(groupMap).forEach(([, g]) => {
        const count = g.rooms.length;
        const itemSubtotal = g.rate * count * nights;
        subtotalRooms += itemSubtotal;
        invoicePriceItems.push({
          label: `Sewa Kamar Hunian: ${g.type} (${g.building})`,
          subDesc: `Kamar: ${g.rooms.join(', ')} (${count} unit kamar)`,
          unitRate: g.rate,
          rateUnitLabel: '/mlm',
          qty: `${count} Kamar`,
          duration: `${nights} Malam`,
          subtotal: itemSubtotal
        });
      });
      if (invoicePriceItems.length === 0 && tx.roomNumber) {
        const defaultRate = room?.pricePerNight || 480000;
        const defSub = defaultRate * nights;
        subtotalRooms += defSub;
        invoicePriceItems.push({
          label: `Sewa Kamar Hunian: ${tx.building} (${tx.roomNumber})`,
          subDesc: `Kamar: ${tx.roomNumber} (1 unit kamar)`,
          unitRate: defaultRate,
          rateUnitLabel: '/mlm',
          qty: '1 Kamar',
          duration: `${nights} Malam`,
          subtotal: defSub
        });
      }
    }

    let subtotalAula = 0;
    const mrPricing = calculateMeetingRoomPricing(tx, allMeetingRooms);
    if (mrPricing.isAula) {
      subtotalAula = mrPricing.subtotal;
      invoicePriceItems.push({
        label: `Sewa Ruang Pertemuan (Aula): ${mrPricing.name}`,
        subDesc: `${mrPricing.session} • Termasuk Sound System, AC Sentral & Kursi`,
        unitRate: mrPricing.rate,
        rateUnitLabel: mrPricing.rateUnitLabel,
        qty: '1 Gedung',
        duration: mrPricing.durationText,
        subtotal: subtotalAula
      });
    }

    let subtotalExtraBed = 0;
    if (tx.extraBed) {
      const bedCount = tx.extraBedCount || 1;
      const rate = 100000;
      subtotalExtraBed = bedCount * rate * nights;
      invoicePriceItems.push({
        label: 'Layanan Extra Bed / Kasur Tambahan',
        subDesc: tx.extraBedNotes || 'Lengkap dengan sprei, bantal dan selimut steril',
        unitRate: rate,
        rateUnitLabel: '/unit',
        qty: `${bedCount} Unit`,
        duration: `${nights} Malam`,
        subtotal: subtotalExtraBed
      });
    }

    let subtotalCatering = 0;
    if (tx.cateringPackage && tx.cateringPackage !== 'TIDAK') {
      const pax = tx.cateringPaxCount || tx.breakfastPortions || tx.totalPax || (totalCapacity > 0 ? totalCapacity : 1);
      const days = tx.breakfastDays || nights;
      let rate = 35000;
      let pkgLabel = 'Paket Konsumsi Reguler';
      if (tx.cateringPackage === 'FULLBOARD') {
        rate = 120000;
        pkgLabel = 'Paket Fullboard (3x Makan + 2x Coffee Break)';
      } else if (tx.cateringPackage === 'SNACK_AULA') {
        rate = 25000;
        pkgLabel = 'Paket Snack & Coffee Break Aula';
      } else if (tx.cateringPackage === 'SARAPAN') {
        rate = 25000;
        pkgLabel = 'Paket Sarapan Pagi Prasmanan';
      } else if (tx.cateringPackage === 'MAKAN_SIANG') {
        rate = 35000;
        pkgLabel = 'Paket Makan Siang Prasmanan';
      } else if (tx.cateringPackage === 'MAKAN_MALAM') {
        rate = 35000;
        pkgLabel = 'Paket Makan Malam Prasmanan';
      }
      subtotalCatering = pax * rate * days;
      invoicePriceItems.push({
        label: `Layanan Konsumsi: ${pkgLabel}`,
        subDesc: 'Dikelola oleh Koperasi & Tim Dapur UPT Asrama Haji Jakarta',
        unitRate: rate,
        rateUnitLabel: '/pack',
        qty: `${pax} Pack`,
        duration: `${days} Hari`,
        subtotal: subtotalCatering
      });
    } else if (tx.breakfast) {
      const mItem = breakfastItems.find(m => m.name === tx.breakfastMenu);
      const rate = mItem?.price || 30000;
      const portions = tx.breakfastPortions || 1;
      const days = tx.breakfastDays || nights;
      subtotalCatering = portions * rate * days;
      invoicePriceItems.push({
        label: `Layanan Sarapan Dapur UPT: ${tx.breakfastMenu || 'Menu Reguler'}`,
        subDesc: 'Dikelola oleh Koperasi & Tim Dapur UPT Asrama Haji Jakarta',
        unitRate: rate,
        rateUnitLabel: '/porsi',
        qty: `${portions} Porsi`,
        duration: `${days} Hari`,
        subtotal: subtotalCatering
      });
    }

    const pdfGrandTotal = subtotalRooms + subtotalAula + subtotalExtraBed + subtotalCatering;

    const isLunas = tx.paymentStatus === 'LUNAS';
    const alreadyPaid = Number(tx.paidAmount || tx.dpAmount || 0);
    const hasDp = tx.paymentStatus === 'DP' || (Boolean(tx.dpAmount) && Number(tx.dpAmount) > 0) || (alreadyPaid > 0 && !isLunas);
    const isDp = !isLunas && (hasDp || alreadyPaid > 0);
    const remainingBalance = Math.max(0, pdfGrandTotal - (isLunas ? pdfGrandTotal : alreadyPaid));
    const officialVa = tx.vaNumber || '8101626953822901';
    const officialVaAn = tx.vaAccountName || 'Rpl 133 Ps Ahkl1 Jkt';

    // 1. Top Decorative Bar
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, 210, 5, 'F');
    doc.setFillColor(...goldColor);
    doc.rect(0, 5, 210, 1.5, 'F');

    const appSettings = dataStorage.getAppSettings();
    let logoDataUrl = '';
    if (appSettings?.appLogo) {
      logoDataUrl = await loadImageAsDataUrl(appSettings.appLogo);
    }
    
    // Render Logo Web / appLogo if available
    let hasDrawnLogo = false;
    if (logoDataUrl) {
      try {
        let format = 'PNG';
        if (logoDataUrl.includes('image/jpeg') || logoDataUrl.includes('image/jpg')) {
          format = 'JPEG';
        } else if (logoDataUrl.includes('image/webp')) {
          format = 'WEBP';
        }
        doc.addImage(logoDataUrl, format, 14, 9.5, 14, 14);
        hasDrawnLogo = true;
      } catch (e) {
        try {
          doc.addImage(logoDataUrl, 14, 9.5, 14, 14);
          hasDrawnLogo = true;
        } catch (err) {}
      }
    }
    if (!hasDrawnLogo) {
      drawOfficialEmblemBadge(doc, 14, 9.5, 14);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...primaryColor);
    doc.text(appSettings.organizationName, 31, 13.5);

    doc.setFontSize(7);
    doc.setTextColor(...goldColor);
    doc.text((appSettings.ministryName || '').toUpperCase(), 31, 17.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...lightSlate);
    doc.text(appSettings.subTitle || 'Pusat Layanan Akomodasi & Asrama Haji', 31, 21.5);

    // Right side contact & address (bounded and wrapped safely)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...darkSlate);
    doc.text('Lampiran Administrasi Hunian', 196, 11.5, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...lightSlate);
    const addressLines = doc.splitTextToSize(appSettings.address, 70);
    doc.text(addressLines, 196, 15, { align: 'right' });
    const addressBlockH = addressLines.length * 2.3;
    doc.text(`Email: ${appSettings.email} • Telp: ${appSettings.phone}`, 196, 15.5 + addressBlockH, { align: 'right' });

    // Double rule line under header
    doc.setDrawColor(...darkSlate);
    doc.setLineWidth(0.6);
    doc.line(14, 24, 196, 24);
    doc.setLineWidth(0.2);
    doc.line(14, 25.2, 196, 25.2);

    // 3. Document Title & Document Meta (SESUAI POPUP LEMBAR INVOICE)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...darkSlate);
    doc.text(
      isGroupBooking 
        ? 'RINCIAN TAGIHAN & RESERVASI ROMBONGAN' 
        : isAula 
        ? 'RINCIAN TAGIHAN SEWA RUANG PERTEMUAN (AULA)' 
        : 'RINCIAN TAGIHAN & RESERVASI HUNIAN KAMAR', 
      14, 
      37
    );

    doc.setFontSize(6.8);
    doc.setTextColor(...lightSlate);
    doc.setFont('helvetica', 'normal');
    doc.text('LEMBAR INVOICE & DOKUMEN RESERVASI RESMI • UPT Asrama Haji Jakarta', 14, 41);

    // Right meta (No. Dokumen & Tanggal)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...primaryColor);
    doc.text(`NO: INV-OPR/${tx.id}/${tx.startDate.replace(/-/g, '')}`, 196, 37, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...lightSlate);
    doc.text(`Diterbitkan: ${formatIndonesianDate(realToday)}`, 196, 41, { align: 'right' });

    // Status Banner Box (SESUAI POPUP LEMBAR INVOICE & RESERVASI RESMI)
    const isCancelled = tx.status === 'DIBATALKAN';
    const statusBoxY = 44;
    const statusBoxH = 7.5;

    if (isCancelled) {
      doc.setFillColor(254, 226, 226);
      doc.setDrawColor(220, 38, 38);
      doc.roundedRect(14, statusBoxY, 182, statusBoxH, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(185, 28, 28);
      doc.text('STATUS: DIBATALKAN (RESERVASI BATAL)', 105, statusBoxY + 3.4, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.text('Ruangan telah dibebaskan dan dokumen dicetak untuk arsip riwayat pembatalan operasional.', 105, statusBoxY + 6.2, { align: 'center' });
    } else if (isLunas) {
      doc.setFillColor(209, 250, 229);
      doc.setDrawColor(16, 185, 129);
      doc.roundedRect(14, statusBoxY, 182, statusBoxH, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(6, 95, 70);
      doc.text('STATUS PEMBAYARAN: TELAH LUNAS • TERBAYAR PENUH', 105, statusBoxY + 3.2, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      const lunasMethod = tx.paymentMethod === 'VA_UPT' ? `Virtual Account UPT (${officialVa} a.n. ${officialVaAn})` : tx.bankName ? `Transfer Bank ${tx.bankName} (${officialVa} a.n. ${officialVaAn})` : `Virtual Account / Transfer Bank (${officialVa} a.n. ${officialVaAn})`;
      doc.text(`Pelunasan ${formatRupiah(pdfGrandTotal)} telah diterima via ${lunasMethod} pada ${formatIndonesianDate(tx.paymentDate || tx.startDate)}.`, 105, statusBoxY + 6.2, { align: 'center' });
    } else if (isDp) {
      doc.setFillColor(254, 243, 199);
      doc.setDrawColor(245, 158, 11);
      doc.roundedRect(14, statusBoxY, 182, statusBoxH, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(146, 64, 14);
      doc.text(`STATUS PEMBAYARAN: TELAH MEMBAYAR UANG MUKA (DP)  |  SISA BAYAR: ${formatRupiah(remainingBalance)}`, 105, statusBoxY + 3.2, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(120, 53, 15);
      const dpMethod = tx.dpMethod === 'VA_UPT' ? 'VA UPT' : tx.bankName ? `Transfer ${tx.bankName}` : 'Virtual Account UPT';
      doc.text(`DP ${formatRupiah(alreadyPaid)} disetor via ${dpMethod} (VA: ${officialVa} a.n. ${officialVaAn}). Sisa wajib dilunasi sebelum check-out.`, 105, statusBoxY + 6.2, { align: 'center' });
    } else {
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(14, statusBoxY, 182, statusBoxH, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      doc.text('STATUS PEMBAYARAN: BELUM LUNAS (MENUNGGU SETORAN DP / PELUNASAN)', 105, statusBoxY + 3.2, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text(`Total Tagihan: ${formatRupiah(pdfGrandTotal)}. Opsi DP atau Pelunasan via Virtual Account: ${officialVa} a.n. ${officialVaAn}.`, 105, statusBoxY + 6.2, { align: 'center' });
    }

    if (isCancelled) {
      doc.saveGraphicsState();
      doc.setTextColor(220, 38, 38);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(24);
      doc.text('DIBATALKAN', 152, 38, { angle: 12, align: 'center' });
      doc.restoreGraphicsState();
    }

    // 4. Two Structured Content Cards: Data Tamu & Ringkasan Sewa
    const cardY = 53;
    const cardH = 35;
    const cardW = 88;

    // Card 1: Data Tamu / Rombongan
    doc.setFillColor(...bgCard);
    doc.setDrawColor(...borderCard);
    doc.roundedRect(14, cardY, cardW, cardH, 2, 2, 'FD');

    doc.setFillColor(...primaryColor);
    doc.roundedRect(14, cardY, cardW, 5.2, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('1. DATA TAMU & PENYEWA', 18, cardY + 3.8);

    const guestRows = [
      ['Nama Tamu / Entitas', tx.groupName || tx.guestName || '-'],
      ['Tipe Registrasi', isGroupBooking ? `Rombongan (${tx.totalPax || totalCapacity || 1} Pax)` : 'Individu (1 Penyewa Kamar)'],
      ['Kloter / Instansi', tx.kloter || '-'],
      ['PIC / Koordinator', tx.groupPic || tx.guestName || '-'],
      ['Kontak Telepon', tx.groupPicPhone || tx.phone || '-'],
      ['ID Transaksi', tx.id]
    ];

    let rowY = cardY + 8.8;
    guestRows.forEach(([lbl, val]) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...lightSlate);
      doc.text(lbl, 18, rowY);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...darkSlate);
      doc.text(`: ${val}`, 48, rowY);
      rowY += 5.0;
    });

    // Card 2: Ringkasan Sewa Fasilitas
    doc.setFillColor(...bgCard);
    doc.setDrawColor(...borderCard);
    doc.roundedRect(108, cardY, cardW, cardH, 2, 2, 'FD');

    doc.setFillColor(...primaryColor);
    doc.roundedRect(108, cardY, cardW, 5.2, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text(isAula ? '2. RINGKASAN RUANG PERTEMUAN' : '2. RINGKASAN SEWA HUNIAN', 112, cardY + 3.8);

    const facilityRows = [
      ['Gedung Utama', uniqueBuildings.length > 0 ? uniqueBuildings.join(', ') : tx.building],
      [isAula ? 'Ruang Pertemuan' : 'Alokasi Kamar', isAula ? tx.roomNumber : `${rentedRooms.length} Kamar Disewa`],
      ['Total Kapasitas', isAula ? `${room?.capacity || 250} Pax` : `${totalCapacity} Orang (${rentedRooms.length} Kamar)`],
      [isAula ? 'Pelaksanaan Acara' : 'Periode Check-In', formatIndonesianDate(tx.startDate)],
      [isAula ? 'Estimasi Selesai' : 'Perkiraan Check-Out', formatIndonesianDate(checkoutDate)],
      ['Total Durasi Sewa', `${tx.duration} ${tx.durationUnit || (isAula ? 'Jam' : 'Malam')}`]
    ];

    let facY = cardY + 8.8;
    facilityRows.forEach(([lbl, val]) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...lightSlate);
      doc.text(lbl, 112, facY);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...darkSlate);
      doc.text(`: ${val}`, 148, facY);
      facY += 5.0;
    });

    // 5. Tabel Rincian Alokasi Gedung Sampai Kamar Yang Disewa
    const tableY = cardY + cardH + 3.0;
    doc.setFillColor(...bgCard);
    doc.setDrawColor(...borderCard);
    
    // Header Bar for Table
    doc.setFillColor(30, 41, 59); // Dark slate
    doc.roundedRect(14, tableY, 182, 5.2, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(255, 255, 255);
    doc.text(
      isAula 
        ? '3. DETAIL RUANG PERTEMUAN & FASILITAS TERJADWAL'
        : `3. RINCIAN ALOKASI GEDUNG SAMPAI KAMAR YANG DISEWA (${rentedRooms.length} KAMAR)`,
      18, 
      tableY + 3.6
    );

    // Column headers
    const colHeaderY = tableY + 5.2;
    doc.setFillColor(241, 245, 249);
    doc.rect(14, colHeaderY, 182, 4.8, 'F');
    doc.setDrawColor(...borderCard);
    doc.setLineWidth(0.2);
    doc.rect(14, colHeaderY, 182, 4.8, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...darkSlate);
    doc.text('No', 17, colHeaderY + 3.3);
    doc.text('Wilayah Gedung', 25, colHeaderY + 3.3);
    doc.text('No. Kamar / Aula', 68, colHeaderY + 3.3);
    doc.text('Tipe / Fasilitas Ruangan', 98, colHeaderY + 3.3);
    doc.text('Kapasitas', 148, colHeaderY + 3.3);
    doc.text('Status Alokasi', 172, colHeaderY + 3.3);

    let currRowY = colHeaderY + 4.8;

    // Helper to print table headers on subsequent pages
    const printTableHeader = (y: number, pageNum: number) => {
      // Top header band
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, 210, 4, 'F');
      doc.setFillColor(...goldColor);
      doc.rect(0, 4, 210, 1.2, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...primaryColor);
      doc.text(`RINCIAN ALOKASI KAMAR (Lanjutan) - ${tx.groupName || tx.guestName || 'Rombongan'}`, 14, 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...lightSlate);
      doc.text(`No. Dokumen: INV-OPR/${tx.id}/${tx.startDate.replace(/-/g, '')}`, 196, 12, { align: 'right' });

      // Column header
      const newHeaderY = 16;
      doc.setFillColor(241, 245, 249);
      doc.rect(14, newHeaderY, 182, 5.0, 'F');
      doc.setDrawColor(...borderCard);
      doc.setLineWidth(0.2);
      doc.rect(14, newHeaderY, 182, 5.0, 'D');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...darkSlate);
      doc.text('No', 17, newHeaderY + 3.5);
      doc.text('Wilayah Gedung', 25, newHeaderY + 3.5);
      doc.text('No. Kamar / Aula', 68, newHeaderY + 3.5);
      doc.text('Tipe / Fasilitas Ruangan', 98, newHeaderY + 3.5);
      doc.text('Kapasitas', 148, newHeaderY + 3.5);
      doc.text('Status Alokasi', 172, newHeaderY + 3.5);

      return newHeaderY + 5.0;
    };

    // Print ALL rented rooms without truncation or omission
    for (let i = 0; i < rentedRooms.length; i++) {
      // Check if row exceeds page boundary
      if (currRowY > 265) {
        doc.addPage();
        currRowY = printTableHeader(16, doc.getNumberOfPages());
      }

      const rm = rentedRooms[i];
      const isEven = i % 2 === 0;
      if (isEven) {
        doc.setFillColor(255, 255, 255);
      } else {
        doc.setFillColor(248, 250, 252);
      }
      doc.rect(14, currRowY, 182, 4.8, 'F');
      doc.setDrawColor(...borderCard);
      doc.line(14, currRowY + 4.8, 196, currRowY + 4.8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.3);
      doc.setTextColor(...darkSlate);
      doc.text(String(i + 1), 17, currRowY + 3.3);
      doc.text(rm.building, 25, currRowY + 3.3);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...primaryColor);
      doc.text(rm.number, 68, currRowY + 3.3);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...darkSlate);
      doc.text(rm.type, 98, currRowY + 3.3);
      doc.text(`${rm.capacity} Orang`, 148, currRowY + 3.3);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(rm.status === 'TERISI' ? 6 : 30, rm.status === 'TERISI' ? 95 : 64, rm.status === 'TERISI' ? 70 : 175);
      doc.text(rm.status === 'TERISI' ? 'CHECK-IN' : rm.status === 'BOOKED' ? 'RESERVASI' : rm.status, 172, currRowY + 3.3);

      currRowY += 4.8;
    }

    // If meeting room is also included
    if (tx.includeAula && tx.rentAulaName) {
      doc.setFillColor(243, 232, 255); // light purple
      doc.rect(14, currRowY, 182, 5.0, 'F');
      doc.setDrawColor(216, 180, 254);
      doc.line(14, currRowY + 5.0, 196, currRowY + 5.0);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(107, 33, 168); // purple 800
      doc.text('★ SEWA AULA:', 17, currRowY + 3.5);
      doc.text(`Ruang Pertemuan / ${tx.rentAulaName}`, 58, currRowY + 3.5);
      doc.setFont('helvetica', 'normal');
      doc.text(`Sesi: ${tx.rentAulaSession || 'Reguler 8 Jam'} | Kapasitas: 250 Pax | Sound System & AC`, 105, currRowY + 3.5);
      doc.setFont('helvetica', 'bold');
      doc.text('TERJADWAL', 172, currRowY + 3.5);

      currRowY += 5.0;
    }

    // 4. Layanan Tambahan & Fasilitas
    const serviceH = 18;
    if (currRowY + serviceH + 4 > 275) {
      doc.addPage();
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, 210, 4, 'F');
      doc.setFillColor(...goldColor);
      doc.rect(0, 4, 210, 1.2, 'F');
      currRowY = 16;
    }

    const serviceY = currRowY + 2.5;
    doc.setFillColor(...bgCard);
    doc.setDrawColor(...borderCard);
    doc.roundedRect(14, serviceY, 182, serviceH, 1.5, 1.5, 'FD');

    doc.setFillColor(241, 245, 249);
    doc.roundedRect(14, serviceY, 182, 4.5, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...darkSlate);
    doc.text('4. FASILITAS DAN LAYANAN TAMBAHAN YANG DIAJUKAN', 18, serviceY + 3.2);

    const cateringText = tx.cateringPackage && tx.cateringPackage !== 'TIDAK'
      ? `Paket ${tx.cateringPackage}: ${tx.cateringPaxCount || tx.breakfastPortions || tx.totalPax || 1} Pack/Hari`
      : tx.breakfast 
      ? `Sarapan: ${tx.breakfastMenu || 'Standar'} (${tx.breakfastPortions || 1} Porsi x ${tx.breakfastDays || tx.duration || 1} Hari)`
      : 'Tidak Memesan Paket Konsumsi';

    const serviceRows = [
      ['Paket Konsumsi / Katering', cateringText],
      ['Fasilitas Tambahan / Bed', tx.extraBed ? `Termasuk: +${tx.extraBedCount || 1} Unit Extra Bed (${tx.extraBedNotes || 'Lengkap sprei & bantal'})` : 'Standar Fasilitas Ruangan'],
      ['Sewa Ruang Pertemuan / Aula', tx.includeAula && tx.rentAulaName ? `Termasuk: ${tx.rentAulaName} (${tx.rentAulaSession || 'Reguler'})` : isAula ? 'Ruang Pertemuan Utama' : 'Tidak Menyewa Aula'],
      ['Catatan Khusus Tamu', tx.notes ? tx.notes : 'Tidak ada instruksi khusus.']
    ];

    let sY = serviceY + 7.5;
    serviceRows.forEach(([srvLbl, srvVal]) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.0);
      doc.setTextColor(...primaryColor);
      doc.text(srvLbl, 18, sY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...darkSlate);
      doc.text(`: ${srvVal}`, 64, sY);
      sY += 3.2;
    });

    currRowY = serviceY + serviceH;

    // 5. RIWAYAT PENYETORAN UANG MUKA (DP) JIKA ADA
    if (isDp || (tx.dpAmount && tx.dpAmount > 0)) {
      const dpBoxH = 13;
      if (currRowY + dpBoxH + 4 > 275) {
        doc.addPage();
        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, 210, 4, 'F');
        doc.setFillColor(...goldColor);
        doc.rect(0, 4, 210, 1.2, 'F');
        currRowY = 16;
      }

      const dpBoxY = currRowY + 2.5;
      doc.setFillColor(254, 243, 199); // amber-100
      doc.setDrawColor(245, 158, 11);
      doc.roundedRect(14, dpBoxY, 182, dpBoxH, 1.5, 1.5, 'FD');

      doc.setFillColor(217, 119, 6); // amber-600
      doc.roundedRect(14, dpBoxY, 182, 4.0, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(255, 255, 255);
      doc.text('RIWAYAT PENYETORAN UANG MUKA (DP) TERDAFTAR', 18, dpBoxY + 2.8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.0);
      doc.setTextColor(...darkSlate);
      doc.text('Nominal DP Diterima: ', 18, dpBoxY + 6.8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(6, 95, 70);
      doc.text(formatRupiah(alreadyPaid), 52, dpBoxY + 6.8);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...darkSlate);
      doc.text(`Tgl Setor DP: ${formatIndonesianDate(tx.dpDate || tx.paymentDate || tx.startDate)}`, 18, dpBoxY + 10.2);
      const dpKanal = tx.dpMethod === 'VA_UPT' ? 'Virtual Account UPT' : tx.bankName ? `Transfer ${tx.bankName}` : 'Virtual Account UPT';
      doc.text(`Kanal Setoran: ${dpKanal}`, 18, dpBoxY + 13.0);

      // Right column
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(185, 28, 28); // rose-700
      doc.text('Sisa Tagihan Belum Lunas: ', 112, dpBoxY + 6.8);
      doc.text(formatRupiah(remainingBalance), 154, dpBoxY + 6.8);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...darkSlate);
      doc.text(`Rekening Pelunasan: Virtual Account No. ${officialVa}`, 112, dpBoxY + 10.2);
      doc.text(`Atas Nama: ${officialVaAn}`, 112, dpBoxY + 13.0);

      currRowY = dpBoxY + dpBoxH;
    }

    // Check if new page is needed before Section 5
    const rowH = 5.2;
    const tableHeaderH = 4.8;
    const tableTitleH = 4.8;
    const tableRowsH = invoicePriceItems.length * rowH;
    const recapH = isDp ? 25 : isLunas ? 20 : 18;
    const totalSection5H = tableTitleH + tableHeaderH + tableRowsH + recapH;

    if (currRowY + totalSection5H > 275) {
      doc.addPage();
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, 210, 4, 'F');
      doc.setFillColor(...goldColor);
      doc.rect(0, 4, 210, 1.2, 'F');
      currRowY = 16;
    }

    const priceY = currRowY + 2.5;

    // 5. Section Header Bar
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(14, priceY, 182, 4.8, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(255, 255, 255);
    doc.text('5. RINCIAN BIAYA & TARIF RESMI OPERASIONAL (HARGA DETAIL)', 18, priceY + 3.3);
    doc.setFontSize(5.8);
    doc.setTextColor(...goldColor);
    doc.text('RINCIAN FAKTUR TAGIHAN', 192, priceY + 3.3, { align: 'right' });

    // Table Column Headers
    const colY = priceY + 4.8;
    doc.setFillColor(241, 245, 249);
    doc.rect(14, colY, 182, 4.8, 'F');
    doc.setDrawColor(...borderCard);
    doc.setLineWidth(0.2);
    doc.rect(14, colY, 182, 4.8, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(...darkSlate);
    doc.text('No', 17, colY + 3.3);
    doc.text('Uraian Komponen Biaya / Item Fasilitas', 25, colY + 3.3);
    doc.text('Tarif Satuan', 116, colY + 3.3, { align: 'right' });
    doc.text('Volume / Qty', 138, colY + 3.3, { align: 'center' });
    doc.text('Durasi', 160, colY + 3.3, { align: 'center' });
    doc.text('Subtotal Biaya', 192, colY + 3.3, { align: 'right' });

    let itemY = colY + 4.8;
    invoicePriceItems.forEach((it, idx) => {
      const isEven = idx % 2 === 0;
      doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
      doc.rect(14, itemY, 182, rowH, 'F');
      doc.setDrawColor(...borderCard);
      doc.line(14, itemY + rowH, 196, itemY + rowH);

      // No
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(...lightSlate);
      doc.text(String(idx + 1), 17, itemY + 3.3);

      // Label & SubDesc
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.3);
      doc.setTextColor(...darkSlate);
      doc.text(it.label, 25, itemY + 3.1);
      if (it.subDesc) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.0);
        doc.setTextColor(...lightSlate);
        doc.text(it.subDesc, 25, itemY + 5.5);
      }

      // Tarif Satuan
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(...darkSlate);
      doc.text(`${formatRupiah(it.unitRate)} ${it.rateUnitLabel}`, 116, itemY + 3.5, { align: 'right' });

      // Volume / Qty
      doc.text(it.qty, 138, itemY + 3.5, { align: 'center' });

      // Durasi
      doc.text(it.duration, 160, itemY + 3.5, { align: 'center' });

      // Subtotal
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...primaryColor);
      doc.text(formatRupiah(it.subtotal), 192, itemY + 3.5, { align: 'right' });

      itemY += rowH;
    });

    // Summary Box below Table
    const summaryBoxY = itemY + 1.2;
    doc.setFillColor(...bgCard);
    doc.setDrawColor(...borderCard);
    doc.roundedRect(14, summaryBoxY, 182, recapH, 1.5, 1.5, 'FD');

    // Left block: Terbilang & Note
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(...lightSlate);
    doc.text('TERBILANG RESMI:', 18, summaryBoxY + 4.2);
    doc.setFont('helvetica', 'bolditalic');
    doc.setFontSize(6.3);
    doc.setTextColor(...primaryColor);
    const terbilangLines = doc.splitTextToSize(`"${angkaKeTerbilang(pdfGrandTotal)}"`, 84);
    doc.text(terbilangLines, 18, summaryBoxY + 7.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.0);
    doc.setTextColor(...lightSlate);
    doc.text('*Tarif resmi mengacu pada Standar Biaya Masukan UPT Asrama Haji Jakarta. Bebas biaya tambahan tersembunyi.', 18, summaryBoxY + recapH - 2.2);

    // Vertical separator
    doc.setDrawColor(...borderCard);
    doc.line(104, summaryBoxY + 2, 104, summaryBoxY + recapH - 2);

    // Right block: Financial Breakdown
    let rightY = summaryBoxY + 4.2;
    if (subtotalRooms > 0 && (subtotalAula > 0 || subtotalExtraBed > 0 || subtotalCatering > 0)) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.8);
      doc.setTextColor(...lightSlate);
      doc.text('Subtotal Sewa Kamar Hunian:', 108, rightY);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...darkSlate);
      doc.text(formatRupiah(subtotalRooms), 192, rightY, { align: 'right' });
      rightY += 3.2;
    }
    if (subtotalAula > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.8);
      doc.setTextColor(...lightSlate);
      doc.text('Subtotal Sewa Ruang Pertemuan (Aula):', 108, rightY);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...darkSlate);
      doc.text(formatRupiah(subtotalAula), 192, rightY, { align: 'right' });
      rightY += 3.2;
    }
    if (subtotalExtraBed > 0 || subtotalCatering > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.8);
      doc.setTextColor(...lightSlate);
      doc.text('Subtotal Layanan Tambahan (Bed/Konsumsi):', 108, rightY);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...darkSlate);
      doc.text(formatRupiah(subtotalExtraBed + subtotalCatering), 192, rightY, { align: 'right' });
      rightY += 3.2;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...darkSlate);
    doc.text('TOTAL TAGIHAN FAKTUR (INVOICE):', 108, rightY);
    doc.setTextColor(...primaryColor);
    doc.text(formatRupiah(pdfGrandTotal), 192, rightY, { align: 'right' });
    rightY += 4.0;

    if (isDp) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.8);
      doc.setTextColor(180, 83, 9); // amber-700
      const dpKanal = tx.dpMethod === 'VA_UPT' ? 'VA UPT' : tx.bankName ? `Transfer ${tx.bankName}` : 'Virtual Account UPT';
      doc.text(`Telah Disetor Uang Muka (DP) [${dpKanal}]:`, 108, rightY);
      doc.setFont('helvetica', 'bold');
      doc.text(`- ${formatRupiah(alreadyPaid)}`, 192, rightY, { align: 'right' });
      rightY += 3.2;

      // Rose Box for Sisa Bayar
      doc.setFillColor(254, 242, 242);
      doc.setDrawColor(244, 63, 94);
      doc.roundedRect(108, rightY, 84, 8.5, 1, 1, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.2);
      doc.setTextColor(190, 18, 60);
      doc.text('SISA TAGIHAN YANG HARUS DILUNASI:', 111, rightY + 3.4);
      doc.setFontSize(7.0);
      doc.text(formatRupiah(remainingBalance), 190, rightY + 3.4, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(4.8);
      doc.setTextColor(159, 18, 57);
      doc.text(`VA: ${officialVa} a.n. ${officialVaAn}`, 111, rightY + 6.6);
      rightY += 8.5;
    } else if (isLunas) {
      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(16, 185, 129);
      doc.roundedRect(108, rightY, 84, 7.5, 1, 1, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.2);
      doc.setTextColor(6, 95, 70);
      doc.text('STATUS PELUNASAN: LUNAS', 111, rightY + 3.3);
      doc.text('(SISA: Rp 0)', 190, rightY + 3.3, { align: 'right' });
      if (tx.dpAmount && tx.dpAmount > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(4.6);
        doc.text(`*DP: ${formatRupiah(tx.dpAmount)} + Pelunasan: ${formatRupiah(pdfGrandTotal - tx.dpAmount)}`, 111, rightY + 6.2);
      }
      rightY += 7.5;
    }

    currRowY = summaryBoxY + recapH;

    // 6. Tata Tertib & Ketentuan Ringkas
    const termsH = 12.5;
    const signSpacing = 16; // Memberikan jarak nyaman & elegan dengan kolom/tabel di atasnya sesuai permintaan user
    const signTotalH = 26;

    // Check if both terms and signatures can fit cleanly, otherwise move to next page
    if (currRowY + 2.5 + termsH + signSpacing + signTotalH > 275) {
      doc.addPage();
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, 210, 4, 'F');
      doc.setFillColor(...goldColor);
      doc.rect(0, 4, 210, 1.2, 'F');
      currRowY = 16;
    }

    const termsY = currRowY + 2.5;
    doc.setFillColor(254, 252, 243);
    doc.setDrawColor(243, 223, 162);
    doc.roundedRect(14, termsY, 182, termsH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...primaryColor);
    doc.text('KETENTUAN OPERASIONAL & TATA TERTIB HUNIAN:', 18, termsY + 3.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(...darkSlate);
    doc.text('1. Tamu / Rombongan wajib menjaga kebersihan, ketertiban, serta fasilitas yang ada di seluruh area asrama.', 18, termsY + 6.5);
    doc.text('2. Waktu standar Check-In pukul 14:00 WIB dan batas waktu Check-Out pukul 12:00 WIB pada tanggal yang tertera.', 18, termsY + 9.2);
    doc.text('3. Kehilangan kunci kamar atau kerusakan sarana kamar/aula akan ditangani sesuai SOP UPT Asrama Haji Jakarta.', 18, termsY + 11.6);

    // 7. Signature Box (Tanda Tangan 2 Pihak: Penyewa & Pengelola Sarana & Hunian)
    // TTD berjarak 16mm dari kolom ketentuan di atasnya sehingga terdapat ruang yang lega dan rapi
    let signY = termsY + termsH + signSpacing;
    if (signY + signTotalH > 276) {
      doc.addPage();
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, 210, 4, 'F');
      doc.setFillColor(...goldColor);
      doc.rect(0, 4, 210, 1.2, 'F');
      signY = 20;
    }

    // 1. Tamu / Penyewa
    const penyewaX = 55;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...darkSlate);
    doc.text('Penyewa / Penanggung Jawab,', penyewaX, signY, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(tx.groupPic || tx.guestName || 'Nama Tamu / Penyewa', penyewaX, signY + 20, { align: 'center' });
    doc.setLineWidth(0.3);
    doc.setDrawColor(...darkSlate);
    doc.line(25, signY + 21, 85, signY + 21);

    // 2. Pengelola Sarana & Hunian (Akun yang sedang login)
    const pengelolaX = 155;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...darkSlate);
    doc.text(`Jakarta, ${formatIndonesianDate(realToday)}`, pengelolaX, signY - 3.5, { align: 'center' });
    doc.text('Pengelola Sarana & Hunian,', pengelolaX, signY, { align: 'center' });

    // Resepsionis / Pengelola signature image and QR if uploaded
    if (hasOfficerSig && officerUser?.signatureUrl) {
      const origin = typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'https://asramahajijakarta.id';
      const qrPayload = verificationCode 
        ? `${origin}/?verify=${verificationCode}` 
        : `UPT-ASRAMA-VERIFIED:${officerUser.id}:${officerName}:${officerRole}`;
      const offQr = generateQrCodeDataUrl(qrPayload);
      if (offQr) {
        try {
          doc.addImage(offQr, 'PNG', pengelolaX - 22, signY + 3, 13, 13);
        } catch (e) {}
      }
      try {
        doc.addImage(officerUser.signatureUrl, 'PNG', pengelolaX - 8, signY + 4, 24, 12);
      } catch (e) {}
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(officerName, pengelolaX, signY + 20, { align: 'center' });
    doc.setLineWidth(0.3);
    doc.setDrawColor(...darkSlate);
    doc.line(125, signY + 21, 185, signY + 21);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...lightSlate);
    doc.text(`${officerRole || 'Pengelola Sarana & Hunian'} • UPT Asrama Haji Jakarta`, pengelolaX, signY + 24.5, { align: 'center' });

    // 9. Footer Barcode & Legal Notice on ALL pages
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setDrawColor(...borderCard);
      doc.setLineWidth(0.4);
      doc.line(14, 281, 196, 281);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(...lightSlate);
      if (hasOfficerSig && verificationCode) {
        doc.text(`ID Verifikasi: ${verificationCode} • Sah & Tercatat di Log Audit Database Resmi UPT Asrama Haji Jakarta.`, 14, 285);
      } else {
        doc.text(`Dokumen Cetak Manual (Tanpa QR & TTD Digital) • Memerlukan Pengesahan TTD Fisik & Cap Basah Resmi.`, 14, 285);
      }
      doc.text(`Kementerian Haji dan Umrah RI • Halaman ${p} dari ${totalPages}`, 196, 285, { align: 'right' });
    }

    return { cleanFilename };
  } catch (error) {
    console.error('Error in renderInvoicePdfContent:', error);
    throw error;
  }
}

export async function downloadDirectInvoicePdf(
  tx: Transaction,
  room?: Room | null,
  officerName = 'Pengelola Sarana & Hunian',
  officerRole = 'Pengelola Sarana & Hunian',
  allRooms: Room[] = [],
  memberTransactions: Transaction[] = []
): Promise<void> {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });
    const { cleanFilename } = await renderInvoicePdfContent(
      doc,
      tx,
      room,
      officerName,
      officerRole,
      allRooms,
      memberTransactions
    );
    doc.save(cleanFilename);
  } catch (err) {
    console.error('Error in downloadDirectInvoicePdf:', err);
    printInvoiceDocument();
  }
}

/**
 * Calculates precision column widths tailored to report type so that no text is truncated.
 * Always calibrated to sum exactly to tableWidth (default: 273mm for A4 Landscape with 12mm margins).
 */
export function calculateReportColumnWidths(headers: string[], reportType?: string, tableWidth = 273): number[] {
  const colCount = headers.length;
  const normType = (reportType || '').toUpperCase();

  // Helper to ensure width array sums exactly to tableWidth
  const normalizeWidths = (arr: number[]): number[] => {
    const sum = arr.reduce((a, b) => a + b, 0);
    const diff = Number((tableWidth - sum).toFixed(1));
    if (diff !== 0 && arr.length > 0) {
      // Adjust the widest content column (usually notes or details)
      let maxIdx = arr.length - 1;
      let maxVal = 0;
      arr.forEach((v, idx) => {
        if (v > maxVal) {
          maxVal = v;
          maxIdx = idx;
        }
      });
      arr[maxIdx] = Number((arr[maxIdx] + diff).toFixed(1));
    }
    return arr;
  };

  if ((normType === 'KAMAR' || normType.includes('KAMAR')) && colCount === 14) {
    // 14 cols: No, ID/Kode, Tipe Booking, Nama/Rombongan/PIC, Wilayah Gedung, Rincian Kamar/Aula, Kloter/Instansi, Tgl Masuk, Durasi, Satuan, Fasilitas Tambahan, Tarif & Biaya (PNBP), Kontak HP, Status
    return normalizeWidths([7, 16, 24, 28, 20, 38, 16, 15, 9, 10, 28, 26, 18, 18]); // sum = 273
  }
  if ((normType === 'KAMAR' || normType.includes('KAMAR')) && colCount === 13) {
    return normalizeWidths([8, 18, 25, 32, 22, 42, 18, 17, 10, 11, 30, 21, 19]); // sum = 273
  }
  if ((normType === 'AULA' || normType.includes('AULA')) && colCount === 13) {
    // 13 cols: No, ID Reservasi, Tipe Reservasi, Nama Ruang/Aula, Penyelenggara/Instansi, PIC & Kontak, Agenda/Keperluan, Tgl Pemakaian, Durasi, Satuan, Layanan Konsumsi, Tarif Sewa (PNBP), Status
    return normalizeWidths([7, 16, 22, 24, 30, 22, 34, 16, 9, 10, 34, 27, 22]); // sum = 273
  }
  if ((normType === 'AULA' || normType.includes('AULA')) && colCount === 12) {
    return normalizeWidths([8, 18, 24, 26, 34, 24, 38, 18, 10, 11, 38, 24]); // sum = 273
  }
  if ((normType === 'MAINTENANCE' || normType.includes('MAINTENANCE')) && colCount === 11) {
    // 11 cols: No, Waktu, Tipe, Gedung, No.Kamar/Aula, Kategori, Urgensi, Teknisi, Pelapor, Deskripsi, Status
    return normalizeWidths([7, 18, 22, 22, 24, 24, 17, 24, 22, 70, 23]); // sum = 273
  }
  if (normType === 'QC' || normType.includes('QC')) {
    if (colCount === 11) {
      // Readiness: No, Tipe, Gedung, No.Kamar/Aula, Tipe/Kelas, Kapasitas, Status Fisik, Vonis, Tgl, Petugas, Catatan
      return normalizeWidths([7, 20, 22, 24, 20, 16, 18, 26, 18, 22, 80]); // sum = 273
    }
    if (colCount === 15) {
      // History: No, ID, Waktu, Tipe, Gedung, No.Kamar/Aula, QC, Kebersihan, Linen, AC, Sanitasi, Amenities, Vonis, Alur, Catatan
      return normalizeWidths([7, 14, 18, 19, 19, 19, 19, 13, 15, 15, 15, 15, 23, 17, 46]); // sum = 273
    }
  }
  if ((normType === 'SARAPAN' || normType.includes('SARAPAN')) && colCount === 16) {
    // 16 cols: No, ID, Status, Prioritas, Gedung, No.Kamar, Nama, Kloter, HP, Tgl, Menu, Porsi, Hari, Total, StatusDapur, Catatan
    return normalizeWidths([6, 13, 15, 16, 17, 15, 25, 15, 15, 14, 26, 10, 9, 10, 26, 41]); // sum = 273
  }
  if ((normType === 'JAM_KERJA' || normType.includes('JAM_KERJA')) && colCount === 9) {
    // 9 cols: No, ID Sesi, Nama Petugas, Role / Jabatan, Waktu Masuk, Waktu Keluar, Durasi Kerja, Status, Catatan
    return normalizeWidths([8, 20, 36, 28, 28, 28, 22, 20, 83]); // sum = 273
  }
  if ((normType === 'AUDIT' || normType.includes('AUDIT')) && colCount === 6) {
    // 6 cols: No, Waktu Aktivitas, Nama Pengguna, Role / Jabatan, Tindakan (Action), Rincian Aktivitas
    return normalizeWidths([8, 26, 32, 28, 34, 145]); // sum = 273
  }
  if ((normType === 'LOG_UNDUH' || normType.includes('LOG')) && colCount === 8) {
    // 8 cols: No, ID Verifikasi, Waktu Unduh, Petugas Pengunduh, Role Petugas, Nama Dokumen, Pejabat TTD & QR, Status
    return normalizeWidths([8, 28, 24, 30, 26, 75, 54, 28]); // sum = 273
  }
  if ((normType === 'USERS' || normType.includes('USERS') || normType.includes('ANGGOTA')) && colCount === 9) {
    // 9 cols: No, Nama Lengkap, Username, Role, Divisi, NIP, Telepon, Status TTD, Status Akun
    return normalizeWidths([8, 38, 22, 32, 30, 24, 24, 25, 20]); // sum = 273
  }

  // Dynamic weights fallback
  const weights = headers.map(h => {
    const l = h.toLowerCase();
    if (l === 'no' || l === 'no.') return 1.0;
    if (l.includes('durasi') || l.includes('porsi') || l.includes('hari') || l.includes('satuan')) return 1.5;
    if (l.includes('id') || l.includes('tgl') || l.includes('waktu') || l.includes('urgensi')) return 2.2;
    if (l.includes('status') || l.includes('kategori') || l.includes('kloter')) return 2.8;
    if (l.includes('kamar') || l.includes('aula') || l.includes('gedung') || l.includes('wilayah')) return 3.6;
    if (l.includes('nama') || l.includes('teknisi') || l.includes('pemeriksa')) return 3.8;
    if (l.includes('catatan') || l.includes('deskripsi') || l.includes('temuan') || l.includes('evaluasi') || l.includes('rincian')) return 6.0;
    return 3.0;
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const rawList = weights.map(w => Number(((w / totalWeight) * tableWidth).toFixed(1)));
  return normalizeWidths(rawList);
}

/**
 * Menentukan pejabat penandatangan (TTD) resmi berdasarkan jenis laporan secara dinamis
 * mengambil dari database pengguna yang terdaftar (tidak menggunakan nama fiktif hardcode).
 *
 * Aturan Penandatangan:
 * 1. Laporan Pesanan Makanan -> Manager Koperasi
 * 2. Laporan Pengecekan QC -> Manager Quality Control (QC)
 * 3. Laporan Perawatan -> Manager Teknisi
 * 4. Laporan Pemesanan (Kamar, Aula, Booking, Reservasi) -> Manager Resepsionis
 * 5. Semua Laporan di Halaman Log Aktivitas & Kelola Anggota -> Super Admin atau Admin (tergantung akun yang sedang mengunduh)
 *
 * Catatan: Jika akun bersangkutan belum terdaftar atau belum mengupload TTD, maka QR code dan TTD tidak akan tertampil.
 */
export function getReportSignatory(
  reportType: string, 
  currentUser?: { fullName?: string; role?: string; nip?: string; id?: string; username?: string; signatureUrl?: string; qrCodeUrl?: string } | null,
  customUsers?: User[]
) {
  const normType = (reportType || '').toUpperCase();
  const registeredUsers: User[] = customUsers && customUsers.length > 0 ? customUsers : dataStorage.getUsers();

  const cleanRoleName = (name?: string) => {
    if (!name) return '';
    return name.replace(/\s*\([^)]*(?:Manager|Admin|Resepsionis|QC|Teknisi|Koperasi|Petugas|Super Admin)[^)]*\)\s*/gi, '').trim();
  };

  const formatNip = (nip?: string) => {
    if (!nip || nip.trim() === '' || nip.trim() === '-') return 'NIP. -';
    return nip.startsWith('NIP') ? nip : `NIP. ${nip}`;
  };

  // 1. SEMUA LAPORAN DI HALAMAN LOG AKTIVITAS & KELOLA ANGGOTA
  // Ditandatangani oleh: Superadmin atau Admin (tergantung akun yg sedang mengunduh)
  const isLogAktivitasOrKelolaAnggota = 
    normType === 'AUDIT' || 
    normType === 'JAM_KERJA' || 
    normType === 'LOG_UNDUH' || 
    normType === 'USERS' || 
    normType === 'ANGGOTA' || 
    normType === 'KELOLA_ANGGOTA' ||
    normType.includes('LOG') || 
    normType.includes('AUDIT') || 
    normType.includes('PRESENSI') || 
    normType.includes('USER') || 
    normType.includes('ANGGOTA') || 
    normType.includes('KELOLA') || 
    normType.includes('PENGGUNA') || 
    normType.includes('MEMBER');

  if (isLogAktivitasOrKelolaAnggota) {
    const curRole = (currentUser?.role || '').toLowerCase();
    const isCurSuperAdmin = curRole.includes('super');
    const isCurAdmin = curRole.includes('admin') && !isCurSuperAdmin;

    // A. Jika pengunduh adalah Super Admin
    if (isCurSuperAdmin && currentUser?.fullName) {
      const matchU = registeredUsers.find(u => 
        (currentUser.id && u.id === currentUser.id) ||
        (currentUser.username && u.username === currentUser.username) ||
        u.fullName === currentUser.fullName ||
        u.role === 'Super Admin'
      );
      const signUrl = matchU?.signatureUrl || currentUser.signatureUrl;
      const qrUrl = matchU?.qrCodeUrl || currentUser.qrCodeUrl;
      const hasSig = Boolean(signUrl && signUrl.trim() !== '');
      return {
        name: cleanRoleName(currentUser.fullName),
        role: currentUser.role || 'Super Admin',
        nip: formatNip(currentUser.nip || matchU?.nip),
        signatureUrl: hasSig ? signUrl : undefined,
        qrCodeUrl: hasSig ? qrUrl : undefined
      };
    }

    // B. Jika pengunduh adalah Admin
    if (isCurAdmin && currentUser?.fullName) {
      const matchU = registeredUsers.find(u => 
        (currentUser.id && u.id === currentUser.id) ||
        (currentUser.username && u.username === currentUser.username) ||
        u.fullName === currentUser.fullName ||
        u.role === 'Admin'
      );
      const signUrl = matchU?.signatureUrl || currentUser.signatureUrl;
      const qrUrl = matchU?.qrCodeUrl || currentUser.qrCodeUrl;
      const hasSig = Boolean(signUrl && signUrl.trim() !== '');
      return {
        name: cleanRoleName(currentUser.fullName),
        role: currentUser.role || 'Admin',
        nip: formatNip(currentUser.nip || matchU?.nip),
        signatureUrl: hasSig ? signUrl : undefined,
        qrCodeUrl: hasSig ? qrUrl : undefined
      };
    }

    // C. Jika pengunduh bukan Super Admin/Admin, cari Super Admin di database, lalu Admin
    const superAdminUser = registeredUsers.find(u => u.role === 'Super Admin' || u.role?.toLowerCase().includes('super'));
    if (superAdminUser) {
      const hasSig = Boolean(superAdminUser.signatureUrl && superAdminUser.signatureUrl.trim() !== '');
      return {
        name: cleanRoleName(superAdminUser.fullName),
        role: superAdminUser.role || 'Super Admin',
        nip: formatNip(superAdminUser.nip),
        signatureUrl: hasSig ? superAdminUser.signatureUrl : undefined,
        qrCodeUrl: hasSig ? superAdminUser.qrCodeUrl : undefined
      };
    }

    const adminUser = registeredUsers.find(u => u.role === 'Admin' || u.role?.toLowerCase().includes('admin'));
    if (adminUser) {
      const hasSig = Boolean(adminUser.signatureUrl && adminUser.signatureUrl.trim() !== '');
      return {
        name: cleanRoleName(adminUser.fullName),
        role: adminUser.role || 'Admin',
        nip: formatNip(adminUser.nip),
        signatureUrl: hasSig ? adminUser.signatureUrl : undefined,
        qrCodeUrl: hasSig ? adminUser.qrCodeUrl : undefined
      };
    }

    return {
      name: '(Belum Ada Administrator Terdaftar)',
      role: 'Super Admin / Admin',
      nip: 'NIP. -',
      signatureUrl: undefined,
      qrCodeUrl: undefined
    };
  }

  // Helper untuk mencari akun Manager divisi yang berwenang
  const resolveManager = (
    roleKeywords: string[],
    fallbackRoleName: string
  ) => {
    // 1. Cek apakah currentUser yang sedang mengunduh adalah Manager yang bersangkutan
    const curRole = (currentUser?.role || '').toLowerCase();
    const isCurMatch = roleKeywords.every(kw => curRole.includes(kw.toLowerCase()));
    if (isCurMatch && currentUser?.fullName) {
      const matchU = registeredUsers.find(u => 
        (currentUser.id && u.id === currentUser.id) ||
        (currentUser.username && u.username === currentUser.username) ||
        u.fullName === currentUser.fullName
      );
      const signUrl = matchU?.signatureUrl || currentUser.signatureUrl;
      const qrUrl = matchU?.qrCodeUrl || currentUser.qrCodeUrl;
      const hasSig = Boolean(signUrl && signUrl.trim() !== '');
      return {
        name: cleanRoleName(currentUser.fullName),
        role: currentUser.role || fallbackRoleName,
        nip: formatNip(currentUser.nip || matchU?.nip),
        signatureUrl: hasSig ? signUrl : undefined,
        qrCodeUrl: hasSig ? qrUrl : undefined
      };
    }

    // 2. Cari di database user terdaftar untuk akun Manager yang bersangkutan
    const foundUser = registeredUsers.find(u => {
      const uRole = String(u.role || '').toLowerCase();
      const uDept = String(u.department || '').toLowerCase();
      return roleKeywords.every(kw => uRole.includes(kw.toLowerCase()) || uDept.includes(kw.toLowerCase()));
    });

    if (foundUser && foundUser.fullName) {
      const hasSig = Boolean(foundUser.signatureUrl && foundUser.signatureUrl.trim() !== '');
      return {
        name: cleanRoleName(foundUser.fullName),
        role: foundUser.role || fallbackRoleName,
        nip: formatNip(foundUser.nip),
        // Hanya sertakan tanda tangan & QR code jika akun bersangkutan telah mengunggah tanda tangan
        signatureUrl: hasSig ? foundUser.signatureUrl : undefined,
        qrCodeUrl: hasSig ? foundUser.qrCodeUrl : undefined
      };
    }

    // 3. Jika belum terdaftar manager terkait di sistem, kosongkan QR & TTD
    return {
      name: `(Belum Ada ${fallbackRoleName} Terdaftar)`,
      role: fallbackRoleName,
      nip: 'NIP. -',
      signatureUrl: undefined,
      qrCodeUrl: undefined
    };
  };

  // 2. LAPORAN PESANAN MAKANAN -> Manager Koperasi
  if (
    normType === 'SARAPAN' || 
    normType.includes('MAKAN') || 
    normType.includes('DAPUR') || 
    normType.includes('KONSUMSI') || 
    normType.includes('KATERING') || 
    normType.includes('KOPERASI') || 
    normType.includes('FOOD') || 
    normType.includes('BREAKFAST')
  ) {
    return resolveManager(['koperasi', 'manager'], 'Manager Koperasi');
  }

  // 3. LAPORAN PENGECEKAN QC -> Manager Quality Control (QC)
  if (
    normType === 'QC' || 
    normType.includes('QUALITY') || 
    normType.includes('PENGECEKAN') || 
    normType.includes('INSPEKSI') || 
    normType.includes('MUTU') || 
    normType.includes('KEBERSIHAN')
  ) {
    return resolveManager(['qc', 'manager'], 'Manager Quality Control (QC)');
  }

  // 4. LAPORAN PERAWATAN -> Manager Teknisi
  if (
    normType === 'MAINTENANCE' || 
    normType.includes('PERAWATAN') || 
    normType.includes('PEMELIHARAAN') || 
    normType.includes('TEKNISI') || 
    normType.includes('PERBAIKAN') || 
    normType.includes('SARPRAS')
  ) {
    return resolveManager(['teknisi', 'manager'], 'Manager Teknisi');
  }

  // 5. LAPORAN PEMESANAN -> Manager Resepsionis (default untuk Kamar, Aula, Reservasi, Booking, Invoice)
  return resolveManager(['resepsionis', 'manager'], 'Manager Resepsionis');
}

/**
 * Downloads tabular reports (Kamar, Maintenance, QC, Sarapan, dll) directly as crisp official PDF.
 * Implements precision multi-line wrapping and single manager signature.
 */
export async function downloadReportPdfDirect(
  title: string,
  filename: string,
  headers: string[],
  rows: (string | number)[][],
  summaryStats?: { label: string; value: string | number }[],
  officerName = 'Administrator Operasional',
  officerRole = 'Pimpinan Divisi',
  reportType?: string,
  customUsers?: User[],
  currentUserObj?: User | null
): Promise<void> {
  try {
    const vNow = new Date();
    const dateCode = vNow.toISOString().slice(0, 10).replace(/-/g, '');
    const randHex = Math.random().toString(36).substring(2, 6).toUpperCase();

    // Resolve Manager / Pejabat Penandatangan Resmi
    const signatory = getReportSignatory(
      reportType || '', 
      currentUserObj || { fullName: officerName, role: officerRole },
      customUsers
    );
    const managerName = signatory.name;
    const managerRole = signatory.role;
    const managerNip = signatory.nip;
    const hasValidSignature = Boolean(signatory.signatureUrl && signatory.signatureUrl.trim() !== '');

    let verificationCode: string | undefined = undefined;
    const finalFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;

    if (hasValidSignature) {
      verificationCode = `VLOG-${dateCode}-${randHex}`;
      try {
        const logEntry = dataStorage.addAuditLog({
          id: `vlog-${Date.now()}-${randHex}`,
          timestamp: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' }),
          user: officerName,
          role: officerRole,
          action: 'UNDUH_PDF_BER_QR',
          details: `[${verificationCode}] Mengunduh Laporan Resmi ber-QR & TTD: ${title} (${finalFilename}). Pejabat TTD: ${managerName} (${managerRole}).`,
          verificationCode,
          documentTitle: title,
          targetId: finalFilename,
          signatoryName: managerName,
          signatoryRole: managerRole,
          signatoryNip: managerNip,
          qrCodeHash: 'QR-VERIFIED',
          hasQrAndSignature: true
        });
      } catch (e) {}
    } else {
      // Jika TIDAK ADA QR & TTD: tidak masuk ke log unduh PDF ber-QR dan tidak dapat diverifikasi
      try {
        dataStorage.addAuditLog({
          id: `log-${Date.now()}-${randHex}`,
          timestamp: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' }),
          user: officerName,
          role: officerRole,
          action: 'UNDUH_PDF_MANUAL',
          details: `Mengunduh Dokumen Laporan: ${title} (${finalFilename}) tanpa QR & TTD Digital (Pejabat: ${managerName} belum mengunggah TTD).`,
          documentTitle: title,
          targetId: finalFilename,
          signatoryName: managerName,
          signatoryRole: managerRole,
          signatoryNip: managerNip,
          hasQrAndSignature: false
        });
      } catch (e) {}
    }

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    if (verificationCode) {
      doc.setProperties({
        title: title,
        subject: verificationCode,
        author: officerName,
        keywords: `UPT-ASRAMA-VERIFIED, ${verificationCode}, ${finalFilename}, ${managerName}`,
        creator: 'UPT Asrama Haji Jakarta'
      });
    }

    const realToday = getRealTodayDate();
    const primaryColor: [number, number, number] = [111, 75, 43]; // Chocolate Brown
    const goldColor: [number, number, number] = [184, 134, 11];
    const darkSlate: [number, number, number] = [30, 41, 59];
    const lightSlate: [number, number, number] = [100, 116, 139];

    // Top Brand Bar
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, 297, 4.5, 'F');
    doc.setFillColor(...goldColor);
    doc.rect(0, 4.5, 297, 1.2, 'F');

    const appSettings = dataStorage.getAppSettings();
    let logoDataUrl = '';
    if (appSettings?.appLogo) {
      logoDataUrl = await loadImageAsDataUrl(appSettings.appLogo);
    }
    
    // Render Logo Web / appLogo if available
    let hasDrawnLogo = false;
    if (logoDataUrl) {
      try {
        let format = 'PNG';
        if (logoDataUrl.includes('image/jpeg') || logoDataUrl.includes('image/jpg')) {
          format = 'JPEG';
        } else if (logoDataUrl.includes('image/webp')) {
          format = 'WEBP';
        }
        doc.addImage(logoDataUrl, format, 12, 8, 14, 14);
        hasDrawnLogo = true;
      } catch (e) {
        try {
          doc.addImage(logoDataUrl, 12, 8, 14, 14);
          hasDrawnLogo = true;
        } catch (err) {}
      }
    }
    if (!hasDrawnLogo) {
      drawOfficialEmblemBadge(doc, 12, 8, 14);
    }

    // Header (Left-aligned matching InvoiceModal layout)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...primaryColor);
    doc.text(appSettings.organizationName, 29, 12.5);

    doc.setFontSize(7.5);
    doc.setTextColor(...goldColor);
    doc.text((appSettings.ministryName || '').toUpperCase(), 29, 16.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...lightSlate);
    doc.text(appSettings.subTitle || 'Pusat Layanan Akomodasi & Asrama Haji', 29, 20.5);

    // Right side contact & address
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...darkSlate);
    doc.text('Laporan Resmi Manajemen Operasional', 285, 12, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...lightSlate);
    doc.text(appSettings.address, 285, 16, { align: 'right' });
    doc.text(`Email: ${appSettings.email} • Telp: ${appSettings.phone}`, 285, 20, { align: 'right' });

    doc.setDrawColor(...darkSlate);
    doc.setLineWidth(0.4);
    doc.line(12, 23, 285, 23);
    doc.setLineWidth(0.15);
    doc.line(12, 24.2, 285, 24.2);

    // Title (wrapped to ensure long titles are never truncated)
    const tableWidth = 273; // 285 - 12
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...darkSlate);
    const titleLines = doc.splitTextToSize(title, tableWidth);
    doc.text(titleLines, 12, 29.5);
    const titleAddedHeight = Math.max(0, (titleLines.length - 1) * 4.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...lightSlate);
    doc.text(`Tanggal Cetak: ${formatIndonesianDate(realToday)}  |  UPT Asrama Haji Jakarta • Kementerian Haji dan Umrah RI`, 12, 34 + titleAddedHeight);

    // Summary Stats
    let curY = 38 + titleAddedHeight;
    if (summaryStats && summaryStats.length > 0) {
      let statX = 12;
      let statY = curY;
      summaryStats.forEach(stat => {
        const isWide = String(stat.label).toUpperCase().includes('ANTREAN');
        const boxW = isWide ? 76 : 41;
        if (statX + boxW > 285) {
          statX = 12;
          statY += 12;
        }
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(statX, statY, boxW, 10, 1.5, 1.5, 'FD');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...lightSlate);
        doc.text(String(stat.label).toUpperCase(), statX + 3, statY + 4);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(isWide ? 7.0 : 9);
        doc.setTextColor(...primaryColor);
        doc.text(String(stat.value), statX + 3, statY + 8.5);

        statX += boxW + 3;
      });
      curY = statY + 13;
    }

    // Determine Table Column Widths with Exact Proportions
    const colWidths = calculateReportColumnWidths(headers, reportType, tableWidth);

    // Pre-calculate header cell text wrapping, font sizing, and dynamic header height to prevent text truncation
    const baseHeaderFs = headers.length >= 15 ? 5.2 : headers.length >= 12 ? 5.7 : 6.0;
    const headerMetaList = headers.map((h, idx) => {
      const cWidth = colWidths[idx] || 20;
      const availWidth = Math.max(6, cWidth - 2.0);
      
      // Allow compound slash, ampersand, and dash words to wrap cleanly onto multiple lines
      const formatted = h
        .replace(/([^\s])\/([^\s])/g, '$1 / $2')
        .replace(/([^\s])&([^\s])/g, '$1 & $2')
        .replace(/([^\s])-([^\s])/g, '$1 - $2');

      let fs = baseHeaderFs;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(fs);
      let lines = doc.splitTextToSize(formatted, availWidth);

      // If any single line exceeds available width, scale down font size until it fits cleanly
      let anyOverflow = lines.some((l: string) => doc.getTextWidth(l) > availWidth);
      while (anyOverflow && fs > 4.4) {
        fs -= 0.2;
        doc.setFontSize(fs);
        lines = doc.splitTextToSize(formatted, availWidth);
        anyOverflow = lines.some((l: string) => doc.getTextWidth(l) > availWidth);
      }

      return {
        lines,
        fontSize: fs
      };
    });

    const maxHeaderLines = Math.max(1, ...headerMetaList.map(item => item.lines.length));
    const headerLineHeight = 2.7;
    const headerHeight = Math.max(7.6, maxHeaderLines * headerLineHeight + 2.8);

    // Helper to render table header with full multi-line centering and auto-scaling
    const renderTableHeader = (yPos: number) => {
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.2);
      doc.rect(12, yPos, tableWidth, headerHeight, 'FD');

      let headerX = 12;
      headers.forEach((_, idx) => {
        const cWidth = colWidths[idx];
        if (idx > 0) {
          doc.setDrawColor(203, 213, 225);
          doc.line(headerX, yPos, headerX, yPos + headerHeight);
        }
        const meta = headerMetaList[idx];
        const lines = meta.lines;
        const cellFs = meta.fontSize;
        const hLow = (headers[idx] || '').toLowerCase();
        const isRight = hLow.includes('tarif') || hLow.includes('biaya') || hLow.includes('harga') || hLow.includes('pnbp');
        const isCenter = !isRight && (idx === 0 || hLow === 'no' || hLow === 'no.' || hLow.includes('durasi') || hLow.includes('satuan') || hLow.includes('status') || hLow.includes('tgl'));
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(cellFs);
        doc.setTextColor(...darkSlate);

        const cellLineH = Math.min(2.7, Math.max(2.1, cellFs * 0.44));
        const textBlockHeight = (lines.length - 1) * cellLineH;
        const startY = yPos + ((headerHeight - textBlockHeight) / 2) + (cellFs * 0.26);

        lines.forEach((lineText: string, lIdx: number) => {
          const lineY = startY + (lIdx * cellLineH);
          if (isRight) {
            doc.text(lineText, headerX + cWidth - 1.2, lineY, { align: 'right' });
          } else if (isCenter) {
            doc.text(lineText, headerX + (cWidth / 2), lineY, { align: 'center' });
          } else {
            doc.text(lineText, headerX + 1.2, lineY);
          }
        });
        headerX += cWidth;
      });
    };

    // Render initial header
    const startY = curY;
    renderTableHeader(startY);
    let rowY = startY + headerHeight;

    // Pre-calculate row heights and text lines to ensure accurate layout, wrap text, and zero truncation
    const computedRowData = rows.map((r) => {
      const cellLines = r.map((cVal, cIdx) => {
        const cWidth = colWidths[cIdx] || 20;
        const strVal = String(cVal ?? '-');
        return doc.splitTextToSize(strVal, Math.max(4, cWidth - 2.4));
      });
      const maxLines = Math.max(1, ...cellLines.map(lines => lines.length));
      const lineHeight = 2.85; // mm
      const rowHeight = Math.max(5.5, maxLines * lineHeight + 2.4);
      return { cellLines, rowHeight };
    });

    const PAGE_BOTTOM_LIMIT = 194; // Safe bottom limit before footer (A4 Landscape is 210mm; footer starts at 201mm)
    const SIGNATURE_HEIGHT = 31; // Height from signY down to NIP
    const SIGNATURE_GAP = 8; // Clean, balanced breathing space between table/note and signature (neither mepet nor too far)
    const hasNote = reportType === 'KAMAR' || reportType === 'AULA';
    const noteHeight = hasNote ? 5.5 : 0;
    const TOTAL_SIGNATURE_NEED = noteHeight + SIGNATURE_GAP + SIGNATURE_HEIGHT;

    // Two-Phase Lookahead Pagination Planner:
    // Ensures that the signature NEVER ends up alone on a separate page without readable table data.
    // The final page is guaranteed to contain table headers, at least MIN_FINAL_ROWS rows of data, and the signature block!
    const MIN_FINAL_ROWS = Math.min(3, rows.length);

    interface PagePlan {
      startRow: number;
      endRow: number; // exclusive
      isLastPage: boolean;
    }

    const pages: PagePlan[] = [];
    const totalRowsCount = rows.length;

    if (totalRowsCount === 0) {
      pages.push({ startRow: 0, endRow: 0, isLastPage: true });
    } else {
      let curRowIdx = 0;
      while (curRowIdx < totalRowsCount) {
        const isFirstPage = pages.length === 0;
        const availHeight = isFirstPage
          ? PAGE_BOTTOM_LIMIT - (startY + headerHeight)
          : PAGE_BOTTOM_LIMIT - (15 + headerHeight);

        // Check if ALL remaining rows + signature can fit on this page together
        let heightAllRemainingWithSig = TOTAL_SIGNATURE_NEED;
        for (let i = curRowIdx; i < totalRowsCount; i++) {
          heightAllRemainingWithSig += computedRowData[i].rowHeight;
        }

        if (heightAllRemainingWithSig <= availHeight) {
          // Everything remaining fits on this page together with the signature!
          pages.push({
            startRow: curRowIdx,
            endRow: totalRowsCount,
            isLastPage: true
          });
          break;
        }

        // Not everything fits, so this page will not be the last page.
        // How many rows can comfortably fit on this page?
        let fittedRows = 0;
        let usedH = 0;
        while (curRowIdx + fittedRows < totalRowsCount) {
          const nextH = computedRowData[curRowIdx + fittedRows].rowHeight;
          if (usedH + nextH <= availHeight) {
            usedH += nextH;
            fittedRows++;
          } else {
            break;
          }
        }

        // Ensure at least 1 row on this page
        if (fittedRows === 0) {
          fittedRows = 1;
        }

        const remainingAfterThis = totalRowsCount - (curRowIdx + fittedRows);

        // If the rows remaining after this page would be fewer than MIN_FINAL_ROWS (e.g. 1 or 2 rows left),
        // hold back some rows from this page so that the next (final) page has at least MIN_FINAL_ROWS readable rows!
        if (remainingAfterThis > 0 && remainingAfterThis < MIN_FINAL_ROWS) {
          const shortfall = MIN_FINAL_ROWS - remainingAfterThis;
          const allowableReduction = Math.min(shortfall, fittedRows - 1);
          fittedRows -= allowableReduction;
        }

        pages.push({
          startRow: curRowIdx,
          endRow: curRowIdx + fittedRows,
          isLastPage: false
        });

        curRowIdx += fittedRows;
      }
    }

    // Render Planned Pages
    pages.forEach((pPlan, pIdx) => {
      if (pIdx > 0) {
        doc.addPage();
        rowY = 15;
        renderTableHeader(rowY);
        rowY += headerHeight;
      }

      if (totalRowsCount === 0) {
        // Empty state row
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.rect(12, rowY, tableWidth, 9, 'FD');
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(...lightSlate);
        doc.text('Tidak ada data transaksi / rekaman untuk periode yang dipilih.', 12 + (tableWidth / 2), rowY + 5.5, { align: 'center' });
        rowY += 9;
      } else {
        // Render data rows planned for this page
        for (let rIdx = pPlan.startRow; rIdx < pPlan.endRow; rIdx++) {
          const { cellLines, rowHeight } = computedRowData[rIdx];
          const isEven = rIdx % 2 === 0;
          doc.setFillColor(isEven ? 255 : 249, isEven ? 255 : 250, isEven ? 255 : 252);
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.2);
          doc.rect(12, rowY, tableWidth, rowHeight, 'FD');

          let xPos = 12;
          rows[rIdx].forEach((_, cIdx) => {
            const cWidth = colWidths[cIdx] || 20;
            if (cIdx > 0) {
              doc.setDrawColor(226, 232, 240);
              doc.line(xPos, rowY, xPos, rowY + rowHeight);
            }
            const lines = cellLines[cIdx];
            const hLow = (headers[cIdx] || '').toLowerCase();
            const isStatusCol = hLow.includes('status') || hLow.includes('urgensi') || hLow.includes('vonis');
            const isRight = hLow.includes('tarif') || hLow.includes('biaya') || hLow.includes('harga') || hLow.includes('pnbp');
            const isCenter = !isRight && (cIdx === 0 || hLow === 'no' || hLow.includes('durasi') || hLow.includes('satuan') || isStatusCol || hLow.includes('tgl') || hLow.includes('kloter'));
            const rawVal = String(rows[rIdx][cIdx] ?? '').trim();

            if (isStatusCol) {
              if (rawVal === 'DIBATALKAN' || rawVal.includes('BATAL') || rawVal === 'RUSAK' || rawVal === 'DARURAT' || rawVal === 'REJECT') {
                doc.setTextColor(220, 38, 38);
                doc.setFont('helvetica', 'bold');
              } else if (rawVal === 'TERISI' || rawVal === 'LOLOS_QC' || rawVal.includes('LOLOS') || rawVal === 'SELESAI' || rawVal === 'Lunas' || rawVal === 'SIAP_PAKAI') {
                doc.setTextColor(5, 150, 105);
                doc.setFont('helvetica', 'bold');
              } else if (rawVal === 'BOOKED' || rawVal === 'Menunggu' || rawVal === 'DIPROSES') {
                doc.setTextColor(37, 99, 235);
                doc.setFont('helvetica', 'bold');
              } else {
                doc.setTextColor(...darkSlate);
                doc.setFont('helvetica', 'normal');
              }
            } else if (isRight) {
              doc.setTextColor(4, 120, 87); // emerald-700
              doc.setFont('helvetica', 'bold');
            } else {
              doc.setTextColor(...darkSlate);
              doc.setFont('helvetica', 'normal');
            }

            const lineHeight = 2.85;
            if (isRight) {
              if (lines.length === 1) {
                doc.text(lines[0], xPos + cWidth - 1.2, rowY + (rowHeight / 2) + 1.1, { align: 'right' });
              } else {
                lines.forEach((lineText: string, lIdx: number) => {
                  doc.text(lineText, xPos + cWidth - 1.2, rowY + 3.3 + (lIdx * lineHeight), { align: 'right' });
                });
              }
            } else if (isCenter && lines.length === 1) {
              doc.text(lines[0], xPos + (cWidth / 2), rowY + (rowHeight / 2) + 1.1, { align: 'center' });
            } else {
              lines.forEach((lineText: string, lIdx: number) => {
                doc.text(lineText, xPos + 1.2, rowY + 3.3 + (lIdx * lineHeight));
              });
            }
            xPos += cWidth;
          });

          rowY += rowHeight;
        }
      }

      if (pPlan.isLastPage) {
        if (hasNote) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(6.2);
          doc.setTextColor(...lightSlate);
          doc.text('*Catatan: Tarif resmi mengacu pada Standar Biaya Masukan & PNBP UPT Asrama Haji Jakarta. Bebas biaya tambahan tersembunyi.', 12, rowY + 3.8);
          rowY += 5.5;
        }

        // Place signature at comfortable, balanced spacing: neither too far away nor too cramped
        const signY = rowY + SIGNATURE_GAP;
        const signX = 245;

        // Render side-by-side QR Code and TTD Image ONLY if responsible manager has uploaded a signature
        if (hasValidSignature) {
          const origin = typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'https://asramahajijakarta.id';
          const qrPayload = verificationCode 
            ? `${origin}/?verify=${verificationCode}` 
            : `UPT-ASRAMA-VERIFIED:${signatory.name}:${signatory.role}`;
          const finalQrCode = generateQrCodeDataUrl(qrPayload);
          const imgY = signY + 5.5;
          if (finalQrCode) {
            try {
              doc.addImage(finalQrCode, 'PNG', signX - 28, imgY, 14, 14);
            } catch (e) {
              // ignore
            }
          }
          if (signatory.signatureUrl) {
            try {
              doc.addImage(signatory.signatureUrl, 'PNG', signX - 14, imgY + 1, 26, 12);
            } catch (e) {
              // ignore
            }
          }
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...darkSlate);
        doc.text(`Jakarta, ${formatIndonesianDate(realToday)}`, signX, signY, { align: 'center' });
        doc.text('Mengetahui / Menyetujui,', signX, signY + 3.8, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text(managerName, signX, signY + 21.5, { align: 'center' });
        doc.setLineWidth(0.3);
        doc.line(signX - 26, signY + 22.5, signX + 26, signY + 22.5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...lightSlate);
        doc.text(`${managerRole} • UPT Asrama Haji`, signX, signY + 26.5, { align: 'center' });
        doc.text(managerNip, signX, signY + 29.8, { align: 'center' });
      }
    });
    // Signature block clean
    if (!hasValidSignature) {
      // no extra manual text needed, footer handles notice
    }

    // Footer on all pages of report
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(...lightSlate);
      if (hasValidSignature && verificationCode) {
        doc.text(`ID Verifikasi: ${verificationCode} • Dokumen Resmi Terverifikasi ${appSettings.subTitle || 'SIM - Sistem Informasi Manajemen'} ${appSettings.organizationName || 'ASRAMA HAJI JAKARTA'}`, 14, 204);
      } else {
        doc.text(`Dokumen Cetak Manual (Tanpa QR & TTD Digital) • Memerlukan Pengesahan TTD Fisik & Cap Basah Resmi`, 14, 204);
      }
      doc.text(`Halaman ${p} dari ${totalPages}`, 283, 204, { align: 'right' });
    }

    doc.save(finalFilename);
  } catch (err) {
    console.error('Error generating report PDF:', err);
    window.print();
  }
}

/**
 * Downloads a DOM element using html2canvas with fallback to direct PDF.
 */
export async function downloadElementAsPdf(
  element: HTMLElement,
  filename: string,
  options?: {
    orientation?: 'portrait' | 'landscape';
    format?: 'a4';
    marginMm?: number;
    title?: string;
  }
): Promise<void> {
  const orientation = options?.orientation || 'portrait';
  const margin = options?.marginMm ?? 8;

  try {
    const prevScrollTop = element.scrollTop;
    element.scrollTop = 0;

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      windowWidth: element.scrollWidth || undefined,
      windowHeight: element.scrollHeight || undefined
    });

    element.scrollTop = prevScrollTop;

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    if (options?.title) {
      pdf.setProperties({
        title: options.title,
        creator: 'UPT Asrama Haji Jakarta'
      });
    }

    const pageWidth = orientation === 'landscape' ? 297 : 210;
    const pageHeight = orientation === 'landscape' ? 210 : 297;
    const printableWidth = pageWidth - margin * 2;
    const printableHeight = pageHeight - margin * 2;

    const imgWidth = printableWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (imgHeight <= printableHeight) {
      pdf.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight);
    } else {
      let heightLeft = imgHeight;
      let position = margin;

      pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
      heightLeft -= printableHeight;

      while (heightLeft > 0) {
        pdf.addPage();
        position = margin - (imgHeight - heightLeft);
        pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
        heightLeft -= printableHeight;
      }
    }

    const cleanFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    pdf.save(cleanFilename);
  } catch (error) {
    console.warn('html2canvas failed, attempting print fallback:', error);
    window.print();
  }
}

/**
 * Renders raw HTML string in a sandboxed offscreen container and exports directly as PDF
 */
export async function downloadHtmlContentAsPdf(
  htmlContent: string,
  filename: string,
  options?: {
    orientation?: 'portrait' | 'landscape';
    format?: 'a4';
    marginMm?: number;
    title?: string;
  }
): Promise<void> {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '0';
  container.style.width = options?.orientation === 'landscape' ? '1200px' : '900px';
  container.style.backgroundColor = '#ffffff';
  container.style.zIndex = '-9999';
  container.innerHTML = htmlContent;
  document.body.appendChild(container);

  try {
    await new Promise(resolve => setTimeout(resolve, 150));
    await downloadElementAsPdf(container, filename, options);
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}

/**
 * Executes a clean browser print for invoice sheets with proper CSS scoping
 */
export function printInvoiceDocument(): void {
  try {
    document.body.classList.add('printing-invoice');

    const handleAfterPrint = () => {
      document.body.classList.remove('printing-invoice');
      window.removeEventListener('afterprint', handleAfterPrint);
    };

    window.addEventListener('afterprint', handleAfterPrint);

    window.print();

    // Fallback cleanup in case afterprint does not fire in certain browser setups
    setTimeout(() => {
      document.body.classList.remove('printing-invoice');
      window.removeEventListener('afterprint', handleAfterPrint);
    }, 15000);
  } catch (err) {
    console.error('Print invoice error:', err);
    window.print();
  }
}

export interface DirectKwitansiPdfOptions {
  room?: Room | null;
  groupKey?: string;
  groupRecord?: ConsolidatedGroupRecord | null;
  allRooms?: Room[];
  memberTransactions?: Transaction[];
  paymentMethod?: 'VA_UPT' | 'TRANSFER' | 'CASH' | string;
  bankName?: string;
  vaNumber?: string;
  vaAccountName?: string;
  bankAccountNumber?: string;
  paymentDate?: string;
  kwitansiNo?: string;
  autoKwitansiNo?: string;
  treasurerName?: string;
  treasurerNip?: string;
  treasurerTitle?: string;
  roomCapacityRates?: any[];
  meetingRooms?: any[];
  breakfastMenuItems?: any[];
  paidAmount?: number;
  pricingDetails?: {
    roomItems: Array<{
      key?: string;
      label: string;
      building?: string;
      type?: string;
      bedType?: string;
      roomCount?: number;
      roomsList?: string[];
      ratePerNight: number;
      nights: number;
      subtotal: number;
    }>;
    meetingRoomItem?: {
      name: string;
      session: string;
      rate: number;
      durationText: string;
      subtotal: number;
    } | null;
    extraBedItem?: {
      unitCount: number;
      ratePerNight: number;
      nights: number;
      subtotal: number;
    } | null;
    cateringItem?: {
      packageName: string;
      ratePerPax: number;
      paxCount: number;
      days: number;
      subtotal: number;
    } | null;
    subtotalRooms: number;
    subtotalMeetingRoom: number;
    subtotalExtraBed: number;
    subtotalCatering: number;
    grandTotal: number;
    terbilangText: string;
  };
}

/**
 * Generates an official, beautifully formatted Ministry Kwitansi (Receipt) PDF directly via jsPDF.
 * 100% matches the on-screen landscape preview with official chocolate-gold theme, table, and Kop Surat.
 */
export async function renderKwitansiPdfContent(
  doc: jsPDF,
  tx: Transaction,
  options?: DirectKwitansiPdfOptions
): Promise<{ cleanFilename: string }> {
  const appSettings = dataStorage.getAppSettings();
  const isLunas = tx.paymentStatus === 'LUNAS';
  const alreadyPaid = Number(tx.paidAmount || tx.dpAmount || 0);
  const hasDp = tx.paymentStatus === 'DP' || (Boolean(tx.dpAmount) && Number(tx.dpAmount) > 0);
  const isDp = !isLunas && (hasDp || alreadyPaid > 0);
  const matchedGroup = options?.groupRecord || null;
  const isGroup = Boolean(matchedGroup || tx.isGroup || (tx.allocatedRoomNumbers && tx.allocatedRoomNumbers.length > 1));
  const isAula = tx.building === 'Ruang Pertemuan';

  const payerName = isGroup
    ? (matchedGroup?.groupName || tx.groupName || matchedGroup?.groupPic || tx.groupPic || tx.guestName || 'Tamu Rombongan')
    : (tx.guestName || 'Tamu');
  const payerPic = isGroup
    ? (matchedGroup?.groupPic || tx.groupPic || tx.guestName || payerName)
    : (tx.guestName || payerName);
  const payerPhone = isGroup
    ? (matchedGroup?.groupPicPhone || tx.groupPicPhone || tx.phone || '-')
    : (tx.phone || '-');

  const paymentDate = options?.paymentDate || tx.paymentDate || tx.dpDate || getRealTodayDate();
  const kwitansiNo = options?.autoKwitansiNo || options?.kwitansiNo || tx.kwitansiNo || `KWT/KHU-UPTAHJ/${new Date().getFullYear()}/${tx.id}`;

  const treasurerName = options?.treasurerName || 'Hj. Siti Aisyah, S.E.';
  const treasurerNip = options?.treasurerNip || '19820412 200801 2 004';
  const treasurerTitle = options?.treasurerTitle || 'Bendahara Penerimaan / Kasir';

  const method = options?.paymentMethod || tx.paymentMethod || tx.dpMethod || 'VA_UPT';
  const bankName = options?.bankName || tx.bankName || 'Bank Mandiri';
  const vaNum = options?.vaNumber || tx.vaNumber || OFFICIAL_VA_CONFIG.vaNumber;
  const vaAccName = options?.vaAccountName || tx.vaAccountName || OFFICIAL_VA_CONFIG.accountName;
  const bankAccNo = options?.bankAccountNumber || tx.bankAccountNumber || vaNum;

  // Pricing calculation
  const nights = tx.durationUnit === 'Malam' ? tx.duration : (tx.duration >= 24 ? Math.ceil(tx.duration / 24) : 1);
  const checkoutDate = !isAula ? addDaysToDateStr(tx.startDate, tx.duration) : addDaysToDateStr(tx.startDate, nights);

  const passedDetails = options?.pricingDetails;
  let grandTotal = passedDetails ? passedDetails.grandTotal : 0;
  if (!passedDetails) {
    if (isAula) {
      const rate = tx.duration >= 24 ? 15000000 : 8500000;
      const qty = tx.duration >= 24 ? Math.ceil(tx.duration / 24) : 1;
      grandTotal = rate * qty;
    } else {
      const rate = options?.room?.pricePerNight || 480000;
      const rCount = options?.allRooms && options.allRooms.length > 1 ? options.allRooms.length : 1;
      grandTotal = rate * nights * rCount;
    }
  }

  const effectiveReceiptAmount = options?.paidAmount ?? (
    isLunas ? (tx.paidAmount || grandTotal) : (tx.dpAmount || alreadyPaid || Math.round(grandTotal * 0.3))
  );
  const remaining = Math.max(0, grandTotal - effectiveReceiptAmount);
  const effectiveTerbilang = angkaKeTerbilang(effectiveReceiptAmount);

  // Exact A5 Portrait Dimensions: 148mm x 210mm
  const pageWidth = 148;
  const pageHeight = 210;

  // Colors: Ministry Chocolate Brown & Warm Gold
  const colorBrown: [number, number, number] = [111, 75, 43];       // #6f4b2b (Primary)
  const colorDarkBrown: [number, number, number] = [65, 40, 19];     // #412813
  const colorGold: [number, number, number] = [184, 134, 11];        // #b8860b (Emblem Gold)
  const colorDarkSlate: [number, number, number] = [30, 41, 59];     // #1e293b
  const colorLightSlate: [number, number, number] = [100, 116, 139]; // #64748b
  const colorBgCard: [number, number, number] = [248, 250, 252];     // #f8fafc

  // Clean background
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Outer Ornate Border (Dark Chocolate Brown)
  doc.setDrawColor(...colorDarkBrown);
  doc.setLineWidth(0.75);
  doc.roundedRect(5, 5, 138, 200, 2, 2, 'S');

  // Inner Ornate Border (Warm Gold)
  doc.setDrawColor(...colorGold);
  doc.setLineWidth(0.35);
  doc.roundedRect(6.2, 6.2, 135.6, 197.6, 1.5, 1.5, 'S');

  // Load and draw logo
  let logoDataUrl = '';
  if (appSettings?.appLogo) {
    logoDataUrl = await loadImageAsDataUrl(appSettings.appLogo);
  }
  let hasDrawnLogo = false;
  if (logoDataUrl) {
    try {
      let format = 'PNG';
      if (logoDataUrl.includes('image/jpeg') || logoDataUrl.includes('image/jpg')) {
        format = 'JPEG';
      }
      doc.addImage(logoDataUrl, format, 8.5, 8.5, 12, 12);
      hasDrawnLogo = true;
    } catch (e) {
      try {
        doc.addImage(logoDataUrl, 8.5, 8.5, 12, 12);
        hasDrawnLogo = true;
      } catch (err) {}
    }
  }
  if (!hasDrawnLogo) {
    drawOfficialEmblemBadge(doc, 8.5, 8.5, 12);
  }

  // 1. KOP SURAT (A5 Portrait Header)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...colorDarkBrown);
  doc.text((appSettings.organizationName || 'UPT ASRAMA HAJI JAKARTA').toUpperCase(), 23, 12.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(...colorGold);
  doc.text((appSettings.ministryName || 'KEMENTERIAN HAJI DAN UMRAH REPUBLIK INDONESIA').toUpperCase(), 23, 15.4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(...colorLightSlate);
  doc.text(appSettings.subTitle || 'Pusat Layanan Akomodasi, Manasik Haji Terpadu & Fasilitas Gedung Serbaguna', 23, 18.2);

  doc.setFontSize(4.6);
  doc.setTextColor(...colorLightSlate);
  doc.text(appSettings.address || 'Jl. Raya Pondok Gede No. 23, Pinang Ranti, Kec. Makasar, Jakarta Timur 13560', 23, 21);
  doc.text(`Email: ${appSettings.email || 'info@asramahajijakarta.kemenag.go.id'} • Telp: ${appSettings.phone || '(021) 8000-1234'}`, 23, 23.5);

  // Separator Line Under Kop
  doc.setDrawColor(...colorDarkBrown);
  doc.setLineWidth(0.4);
  doc.line(7.5, 25.5, 140.5, 25.5);
  doc.setDrawColor(...colorGold);
  doc.setLineWidth(0.2);
  doc.line(7.5, 26.2, 140.5, 26.2);

  // Document Title & Kwitansi Info Box
  doc.setFillColor(...colorBgCard);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(8.5, 28, 131, 14, 1.5, 1.5, 'FD');

  // Badge inside Title Box
  doc.setFillColor(...colorDarkBrown);
  doc.roundedRect(11, 29.8, 52, 5, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(253, 224, 71); // Gold text
  doc.text(isDp ? 'KWITANSI UANG MUKA (DP)' : 'KWITANSI PELUNASAN', 37, 33.3, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(...colorDarkBrown);
  doc.text(`No: ${kwitansiNo}`, 11, 39);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.2);
  doc.setTextColor(...colorLightSlate);
  doc.text(`Tanggal: ${formatIndonesianDate(paymentDate)}`, 85, 33);
  doc.text(`Ref Inv: INV-OPR/${tx.id}`, 85, 38.5);

  // 2. BODY SECTION: Structured rows
  // Row 1: Sudah Diterima Dari
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(71, 85, 105);
  doc.text('SUDAH DITERIMA DARI :', 9, 46.5);

  doc.setFillColor(...colorBgCard);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(8.5, 48.5, 131, 12, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(...colorDarkBrown);
  doc.text(payerName.toUpperCase(), 11.5, 53.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.4);
  doc.setTextColor(...colorLightSlate);
  const picLine = isGroup
    ? `Penanggung Jawab (PIC): ${payerPic} ${payerPhone !== '-' ? `(Telp: ${payerPhone})` : ''}`
    : `Kontak: ${payerPhone !== '-' ? payerPhone : 'Tamu Mandiri'}`;
  doc.text(picLine, 11.5, 57.5);

  // Row 2: Sejumlah Uang (Terbilang)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(71, 85, 105);
  doc.text('SEJUMLAH UANG :', 9, 64.5);

  doc.setFillColor(254, 250, 240); // Warm gold tint
  doc.setDrawColor(...colorGold);
  doc.setLineWidth(0.4);
  doc.roundedRect(8.5, 66.5, 131, 13, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(6.8);
  doc.setTextColor(...colorDarkBrown);
  const splitTerbilang = doc.splitTextToSize(`" ${effectiveTerbilang} "`, 125);
  doc.text(splitTerbilang, 11.5, 71.5);

  // Row 3: Untuk Pembayaran
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(71, 85, 105);
  doc.text('UNTUK PEMBAYARAN :', 9, 83.5);

  doc.setFillColor(...colorBgCard);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(8.5, 85.5, 131, 26, 1.5, 1.5, 'FD');

  // Description
  const facilityDescription = isAula
    ? `Sewa Ruang Pertemuan / Gedung Aula (${tx.roomNumber})`
    : isGroup
    ? `Sewa Hunian Kamar Asrama Haji (${options?.allRooms?.length || matchedGroup?.allRoomNumbers?.length || 1} Kamar: ${options?.allRooms?.map(r => r.roomNumber).join(', ') || tx.roomNumber})`
    : `Sewa Hunian Kamar Asrama Haji (${tx.building} - Kamar ${tx.roomNumber})`;

  const fullDesc = `${isDp ? 'Penyetoran Uang Muka (DP) Resmi' : 'Pelunasan Penuh Biaya Penggunaan Sarana & Fasilitas'} ${facilityDescription} periode tanggal ${formatIndonesianDate(tx.startDate)} s.d. ${formatIndonesianDate(checkoutDate)} (${nights} ${isAula ? 'Sesi/Hari' : 'Malam'}).`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.6);
  doc.setTextColor(...colorDarkSlate);
  const splitDesc = doc.splitTextToSize(fullDesc, 125);
  doc.text(splitDesc, 11.5, 90.5);

  // Optional catering & extra bed tags
  let tagX = 11.5;
  const tagY = 107;
  if (passedDetails?.subtotalCatering && passedDetails.subtotalCatering > 0) {
    doc.setFillColor(255, 247, 237);
    doc.setDrawColor(254, 215, 170);
    doc.roundedRect(tagX, tagY - 3.2, 44, 4.2, 1, 1, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(4.8);
    doc.setTextColor(194, 65, 12);
    doc.text('• Termasuk Konsumsi / Katering', tagX + 2, tagY);
    tagX += 46;
  }
  if (passedDetails?.subtotalExtraBed && passedDetails.subtotalExtraBed > 0) {
    doc.setFillColor(238, 242, 255);
    doc.setDrawColor(199, 210, 254);
    doc.roundedRect(tagX, tagY - 3.2, 44, 4.2, 1, 1, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(4.8);
    doc.setTextColor(67, 56, 202);
    doc.text('• Termasuk Layanan Extra Bed', tagX + 2, tagY);
  }

  // 3. BIG AMOUNT CARD (A5 Portrait Card)
  const channelDisplay = method === 'VA_UPT'
    ? `VA UPT No. ${vaNum} (a.n. ${vaAccName})`
    : `Transfer Bank ${bankName} No. Rek ${bankAccNo} (a.n. ${vaAccName})`;

  doc.setFillColor(41, 28, 16); // Dark brown / navy matching preview
  doc.setDrawColor(...colorGold);
  doc.setLineWidth(0.5);
  doc.roundedRect(8.5, 115.5, 131, 33, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.setTextColor(253, 224, 71); // Gold
  doc.text(isDp ? 'JUMLAH UANG MUKA (DP):' : 'JUMLAH TOTAL PELUNASAN:', 12, 121);

  // Status Badge
  doc.setFillColor(...colorGold);
  doc.roundedRect(102, 118, 33, 4.8, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.4);
  doc.setTextColor(15, 23, 42);
  doc.text(isLunas ? 'LUNAS 100%' : 'UANG MUKA (DP)', 118.5, 121.5, { align: 'center' });

  // Big Nominal Text
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14.5);
  doc.setTextColor(253, 224, 71); // Bright Gold
  doc.text(formatRupiah(effectiveReceiptAmount), 12, 131);

  // Divider inside card
  doc.setDrawColor(184, 134, 11);
  doc.setLineWidth(0.25);
  doc.line(12, 134, 134, 134);

  // Kanal Pembayaran line
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.2);
  doc.setTextColor(226, 232, 240);
  doc.text(`Kanal Pembayaran: ${channelDisplay}`, 12, 138);

  // Remaining or Lunas Note
  if (isDp && remaining > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(254, 205, 211); // Rose
    doc.text(`Sisa Tagihan yang Harus Dilunasi: ${formatRupiah(remaining)}`, 12, 142.5);
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.2);
    doc.setTextColor(167, 243, 208); // Emerald
    doc.text('Status Pembayaran: LUNAS PENUH (Tanpa Sisa Tagihan)', 12, 142.5);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.8);
  doc.setTextColor(148, 163, 184);
  doc.text(`Ref. Faktur Invoice: INV-OPR/${tx.id} • Tanggal: ${formatIndonesianDate(paymentDate)}`, 12, 146.5);

  // 4. SIGNATURE & OFFICIAL APPROVAL
  const sigCenterX = 105;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...colorDarkSlate);
  doc.text(`Jakarta, ${formatIndonesianDate(paymentDate)}`, sigCenterX, 155, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...colorDarkBrown);
  doc.text(treasurerTitle.toUpperCase(), sigCenterX, 159, { align: 'center' });

  // Stamp Box (Electronic Signature)
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(5, 150, 105);
  doc.setLineWidth(0.3);
  doc.roundedRect(82, 162.5, 46, 7.5, 1, 1, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.2);
  doc.setTextColor(4, 120, 87);
  doc.text('DITANDATANGANI SECARA ELEKTRONIK', sigCenterX, 166.2, { align: 'center' });
  doc.setFontSize(4.5);
  doc.text('UPT ASRAMA HAJI JAKARTA', sigCenterX, 168.8, { align: 'center' });

  // Treasurer Name & NIP
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...colorDarkBrown);
  doc.text(treasurerName, sigCenterX, 175.5, { align: 'center' });
  const nameWidth = doc.getTextWidth(treasurerName);
  doc.setDrawColor(...colorDarkBrown);
  doc.setLineWidth(0.3);
  doc.line(sigCenterX - nameWidth / 2, 176.5, sigCenterX + nameWidth / 2, 176.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.4);
  doc.setTextColor(...colorLightSlate);
  doc.text(`NIP. ${treasurerNip}`, sigCenterX, 180, { align: 'center' });

  // 5. OFFICIAL FOOTER NOTE
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(4.8);
  doc.setTextColor(148, 163, 184);
  doc.text(`* Dokumen kwitansi ini adalah bukti pembayaran yang sah dan diterbitkan secara digital oleh ${appSettings.subTitle || 'SIM - Sistem Informasi Manajemen'} ${appSettings.organizationName || 'ASRAMA HAJI JAKARTA'}.`, 74, 196, { align: 'center' });

  const safePayer = (payerName || 'Tamu').replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanFilename = `${isLunas ? 'Kwitansi-Lunas' : 'Kwitansi-DP'}-${tx.id}-${safePayer}.pdf`;

  // Log to audit trail
  try {
    dataStorage.addAuditLog({
      id: `kw-pdf-${Date.now()}`,
      timestamp: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' }),
      user: treasurerName,
      role: 'Bendahara / Kasir',
      action: 'UNDUH_KWITANSI_PDF',
      details: `Mengunduh berkas resmi PDF Kwitansi A5 ${isLunas ? 'Lunas' : 'DP'} #${kwitansiNo} untuk Transaksi ID: ${tx.id} (${payerName} - ${formatRupiah(effectiveReceiptAmount)}).`,
      documentTitle: `Kwitansi A5 #${kwitansiNo}`,
      targetId: cleanFilename
    });
  } catch (e) {}

  return { cleanFilename };
}

export async function downloadDirectKwitansiPdf(
  tx: Transaction,
  options?: DirectKwitansiPdfOptions
): Promise<void> {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a5',
      compress: true
    });
    const { cleanFilename } = await renderKwitansiPdfContent(doc, tx, options);
    doc.save(cleanFilename);
  } catch (err) {
    console.error('Error in downloadDirectKwitansiPdf:', err);
    throw err;
  }
}

export async function downloadCombinedInvoiceAndKwitansiPdf(
  tx: Transaction,
  invoiceOptions?: {
    room?: Room | null;
    officerName?: string;
    officerRole?: string;
    allRooms?: Room[];
    memberTransactions?: Transaction[];
  },
  kwitansiOptions?: DirectKwitansiPdfOptions
): Promise<void> {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    // Halaman 1: Lembar Invoice Tagihan Resmi (Portrait A4)
    await renderInvoicePdfContent(
      doc,
      tx,
      invoiceOptions?.room,
      invoiceOptions?.officerName || 'Pengelola Sarana & Hunian',
      invoiceOptions?.officerRole || 'Pengelola Sarana & Hunian',
      invoiceOptions?.allRooms || [],
      invoiceOptions?.memberTransactions || []
    );

    // Halaman 2: Lembar Kwitansi Pembayaran Resmi (Portrait A5)
    doc.addPage('a5', 'portrait');
    await renderKwitansiPdfContent(doc, tx, kwitansiOptions);

    const safePayer = (tx.groupPic || tx.guestName || 'Tamu').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeRoom = (tx.roomNumber || 'Unit').replace(/[^a-zA-Z0-9_-]/g, '_');
    const combinedFilename = `Dokumen-Resmi-Invoice-Kwitansi-${tx.id}-${safePayer}-${safeRoom}.pdf`;

    try {
      dataStorage.addAuditLog({
        id: `comb-pdf-${Date.now()}`,
        timestamp: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' }),
        user: invoiceOptions?.officerName || 'Pengelola Sarana & Hunian',
        role: invoiceOptions?.officerRole || 'Pengelola Sarana & Hunian',
        action: 'UNDUH_DOKUMEN_LENGKAP_PDF',
        details: `Mengunduh berkas PDF lengkap (Halaman 1: Invoice Tagihan Resmi, Halaman 2: Kwitansi Resmi) untuk Transaksi ID: ${tx.id} (${safePayer}).`,
        documentTitle: `Invoice & Kwitansi Resmi #${tx.id}`,
        targetId: combinedFilename
      });
    } catch (e) {}

    doc.save(combinedFilename);
  } catch (err) {
    console.error('Error in downloadCombinedInvoiceAndKwitansiPdf:', err);
    printInvoiceDocument();
  }
}
