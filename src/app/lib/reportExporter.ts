import XLSX from 'xlsx-js-style';
import ExcelJS from 'exceljs';
import { exportToExcelWithExcelJs, loadOfficialLogoImage } from './excelExporter';
export { loadOfficialLogoImage };
import { Transaction, Maintenance, QcInspection, WorkSession, AuditLog, Room, User, ConsolidatedGroupRecord, GroupType, BreakfastOrder } from '../types';
import { formatIndonesianDate, formatRupiah, getRealTodayDate, addDaysToDateStr, isMeetingFacility } from './utils';
import { downloadHtmlContentAsPdf, downloadReportPdfDirect, getReportSignatory, calculateReportColumnWidths } from './pdfDownloader';
import { dataStorage } from '../services/dataStorage';
import { calculateTransactionPricing, calculateGroupPricing } from './pricingCalculator';

export type ReportType = 'KAMAR' | 'AULA' | 'MAINTENANCE' | 'QC' | 'SARAPAN' | 'JAM_KERJA' | 'AUDIT' | 'LOG_UNDUH' | 'USERS';
export type ExportFormat = 'PDF' | 'XLSX';
export type ReportPeriod = 'Harian' | 'Mingguan' | 'Bulanan' | 'Tahunan' | 'Semua';

export interface ReportExportParams {
  type: ReportType;
  format: ExportFormat;
  period: ReportPeriod;
  buildingFilter?: string;
  qcMode?: 'HISTORY' | 'READINESS';
  breakfastPriorityFilter?: 'ALL' | 'CHECKIN_ONLY' | 'BOOKED_ONLY';
  customLogoText?: string;
  customLogoImage?: string;
  transactions: Transaction[];
  maintenances: Maintenance[];
  qcInspections?: QcInspection[];
  workSessions?: WorkSession[];
  auditLogs?: AuditLog[];
  rooms?: Room[];
  currentUser?: User | null;
  users?: User[];
  breakfastOrders?: BreakfastOrder[];
}

/**
 * Consolidates transactions into structured group bookings, individual room bookings,
 * and meeting room (aula) rentals. This ensures reports treat groups as unified entities
 * with complete room allocations and linked meeting spaces.
 */
export function consolidateGroupTransactions(
  transactions: Transaction[],
  rooms: Room[] = []
): {
  rombonganList: ConsolidatedGroupRecord[];
  individuList: Transaction[];
  aulaList: Transaction[];
} {
  const groupMap = new Map<string, Transaction[]>();
  const individuList: Transaction[] = [];
  const aulaList: Transaction[] = [];

  transactions.forEach(t => {
    const isAula = t.category === 'AULA' ||
                   t.building === 'Ruang Pertemuan' || 
                   t.building === 'Ruang Pertemuan / Aula' || 
                   t.building === 'Gedung Serbaguna (SG)' || 
                   t.building === 'Gedung Serbaguna' || 
                   isMeetingFacility(t.building) || 
                   isMeetingFacility(t.roomNumber) || 
                   Boolean(t.rentType?.toLowerCase().includes('ruangan') || t.rentType?.toLowerCase().includes('serbaguna'));
    const isGroup = Boolean(
      t.isGroup || 
      t.guestType === 'ROMBONGAN' || 
      t.groupId || 
      (t.allocatedRoomNumbers && t.allocatedRoomNumbers.length > 1)
    );

    if (isAula) {
      aulaList.push(t);
    } else {
      if (isGroup) {
        const groupKey = t.groupId || `GRP_${(t.groupName || t.guestName || 'Grup').replace(/\s+/g, '_')}_${t.startDate}`;
        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, []);
        }
        groupMap.get(groupKey)!.push(t);
      } else {
        individuList.push(t);
      }
    }
  });

  const rombonganList: ConsolidatedGroupRecord[] = [];

  groupMap.forEach((memberTxs, key) => {
    const primaryTx = memberTxs.find(m => m.isGroup && m.allocatedRoomNumbers && m.allocatedRoomNumbers.length > 0) || memberTxs[0];

    const roomNumberSet = new Set<string>();
    memberTxs.forEach(m => {
      if (m.roomNumber) roomNumberSet.add(m.roomNumber);
      if (m.allocatedRoomNumbers && Array.isArray(m.allocatedRoomNumbers)) {
        m.allocatedRoomNumbers.forEach(rn => {
          if (rn) roomNumberSet.add(rn);
        });
      }
    });

    const allRoomNumbers = Array.from(roomNumberSet);

    const mappedRooms = allRoomNumbers.map(rn => {
      const roomObj = rooms.find(r => r.roomNumber === rn);
      const memberTxForRoom = memberTxs.find(m => m.roomNumber === rn);
      return {
        roomNumber: rn,
        roomId: roomObj?.id || memberTxForRoom?.roomId || `room-${rn}`,
        building: roomObj?.building || memberTxForRoom?.building || primaryTx.building,
        type: roomObj?.type || primaryTx.category || 'Standard',
        capacity: roomObj?.capacity || '4',
        status: memberTxForRoom?.status || roomObj?.status || primaryTx.status,
        txId: memberTxForRoom?.id || primaryTx.id
      };
    });

    const buildingsMap = new Map<string, typeof mappedRooms>();
    mappedRooms.forEach(rm => {
      if (!buildingsMap.has(rm.building)) {
        buildingsMap.set(rm.building, []);
      }
      buildingsMap.get(rm.building)!.push(rm);
    });

    const buildingsList = Array.from(buildingsMap.keys());
    const roomsBreakdown = Array.from(buildingsMap.entries()).map(([building, bRooms]) => ({
      building,
      rooms: bRooms
    }));

    let status: 'BOOKED' | 'TERISI' | 'SELESAI' | string = primaryTx.status;
    if (memberTxs.some(m => m.status === 'TERISI')) {
      status = 'TERISI';
    } else if (memberTxs.some(m => m.status === 'BOOKED')) {
      status = 'BOOKED';
    } else if (memberTxs.every(m => m.status === 'SELESAI' || m.status === 'CHECKED_OUT')) {
      status = 'SELESAI';
    }

    const includeAula = Boolean(primaryTx.includeAula || primaryTx.rentAulaName);
    const rentAulaName = primaryTx.rentAulaName;
    const rentAulaDuration = primaryTx.rentAulaDuration;
    const rentAulaSession = primaryTx.rentAulaSession;
    const rentAulaId = primaryTx.rentAulaId;

    const cateringPackage = primaryTx.cateringPackage;
    const cateringPaxCount = primaryTx.cateringPaxCount;
    const breakfast = primaryTx.breakfast;
    const breakfastMenu = primaryTx.breakfastMenu;
    const breakfastPortions = primaryTx.breakfastPortions;
    const extraBed = primaryTx.extraBed;
    const extraBedCount = primaryTx.extraBedCount;

    rombonganList.push({
      key,
      groupId: primaryTx.groupId || key,
      groupName: primaryTx.groupName || primaryTx.guestName,
      groupType: (primaryTx.groupType as GroupType) || 'UMUM',
      groupPic: primaryTx.groupPic || primaryTx.guestName,
      groupPicPhone: primaryTx.groupPicPhone || primaryTx.phone || '-',
      agencyOrDocument: primaryTx.spkNumber || primaryTx.notes,
      spkNumber: primaryTx.spkNumber,
      kloter: primaryTx.kloter && primaryTx.kloter !== '-' ? primaryTx.kloter : undefined,
      startDate: primaryTx.startDate,
      duration: primaryTx.duration,
      durationUnit: primaryTx.durationUnit || 'Malam',
      totalPax: primaryTx.totalPax || (allRoomNumbers.length * 4),
      status,
      createdUser: primaryTx.createdUser,
      notes: primaryTx.notes,
      allRoomNumbers,
      allRoomIds: mappedRooms.map(r => r.roomId),
      buildingsList,
      roomsBreakdown,
      includeAula,
      rentAulaId,
      rentAulaName,
      rentAulaDuration,
      rentAulaSession,
      cateringPackage,
      cateringPaxCount,
      breakfast,
      breakfastMenu,
      breakfastPortions,
      extraBed,
      extraBedCount,
      representativeTx: primaryTx,
      memberTransactions: memberTxs
    });
  });

  return { rombonganList, individuList, aulaList };
}

/**
 * Ekstraksi timestamp pemesanan yang akurat untuk pengurutan data terbaru paling atas.
 * Memprioritaskan createdAt, checkInTime, kombinasi tanggal startDate, dan nomor urut ID.
 */
export function getBookingTimestamp(tx?: Partial<Transaction> | null): number {
  if (!tx) return 0;
  if (tx.createdAt) {
    const t = new Date(tx.createdAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (tx.checkInTime && tx.checkInTime.includes('-')) {
    const t = new Date(tx.checkInTime).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (tx.startDate) {
    const timePart = (tx.checkInTime && tx.checkInTime.includes(':'))
      ? tx.checkInTime.slice(0, 5)
      : '12:00';
    const t = new Date(`${tx.startDate}T${timePart}:00`).getTime();
    if (!isNaN(t) && t > 0) {
      const numMatch = (tx.id || '').match(/\d+/g);
      const tieBreaker = numMatch ? parseInt(numMatch.join(''), 10) % 100000 : 0;
      return t + tieBreaker;
    }
  }
  const numMatch = (tx.id || '').match(/\d+/g);
  if (numMatch) {
    return parseInt(numMatch.join(''), 10);
  }
  return 0;
}

/**
 * Ekstraksi timestamp pemesanan untuk grup rombongan.
 */
export function getGroupBookingTimestamp(grp: ConsolidatedGroupRecord): number {
  const repTime = getBookingTimestamp(grp.representativeTx);
  if (repTime > 0) return repTime;
  if (grp.memberTransactions && grp.memberTransactions.length > 0) {
    return Math.max(...grp.memberTransactions.map(m => getBookingTimestamp(m)));
  }
  if (grp.startDate) {
    const t = new Date(`${grp.startDate}T12:00:00`).getTime();
    if (!isNaN(t)) return t;
  }
  return 0;
}

export interface SystemFinancialStats {
  totalEstimatedPNBP: number;
  totalPenerimaanPnbp: number;
  pnbpHariIni: number;
  totalSisaPiutang: number;
  totalDpMasuk: number;
  totalLunasCount: number;
  totalBelumLunasCount: number;
  totalBatalCount: number;
  unpaidItems: {
    id: string;
    isGroup: boolean;
    guestName: string;
    building: string;
    roomNumber?: string;
    grandTotal: number;
    paid: number;
    sisaBayar: number;
    hasDp: boolean;
    status: string;
    tx: Transaction;
    groupRecord?: ConsolidatedGroupRecord;
    groupKey?: string;
  }[];
  unpaidTxs: {
    tx: Transaction;
    pricing: any;
    sisaBayar: number;
    paid: number;
    isGroup?: boolean;
    groupRecord?: ConsolidatedGroupRecord;
    groupKey?: string;
  }[];
}

/**
 * Kalkulasi keuangan & PNBP sentral terpadu yang 100% SINKRON antara:
 * - Fokus Keuangan & PNBP Dashboard
 * - Halaman Laporan Hunian Kamar & Booking Ruang Pertemuan
 * - Lembar Invoice & Kwitansi Resmi
 */
export function calculateSystemFinancials(
  transactions: Transaction[],
  rooms: Room[] = [],
  options?: {
    roomCapacityRates?: any[];
    meetingRooms?: any[];
    breakfastMenuItems?: any[];
    realToday?: string;
  }
): SystemFinancialStats {
  const realToday = options?.realToday || getRealTodayDate();
  const pricingOptions = {
    rooms,
    roomCapacityRates: options?.roomCapacityRates,
    meetingRooms: options?.meetingRooms,
    breakfastMenuItems: options?.breakfastMenuItems
  };

  const { rombonganList, individuList, aulaList } = consolidateGroupTransactions(transactions, rooms);

  let totalEstimatedPNBP = 0;
  let totalPenerimaanPnbp = 0;
  let pnbpHariIni = 0;
  let totalSisaPiutang = 0;
  let totalDpMasuk = 0;
  let totalLunasCount = 0;
  let totalBelumLunasCount = 0;
  let totalBatalCount = 0;

  const unpaidItems: SystemFinancialStats['unpaidItems'] = [];

  // 1. Rombongan List (Grup dihitung sebagai satu entitas resmi)
  rombonganList.forEach(grp => {
    const isBatal = grp.status === 'DIBATALKAN' || grp.status.includes('BATAL') || grp.status.includes('BATAK');
    if (isBatal) {
      totalBatalCount++;
      return;
    }

    const pricing = calculateGroupPricing(grp, pricingOptions);
    const grandTotal = pricing.grandTotal;
    const rep = grp.representativeTx;

    const isLunas = rep.paymentStatus === 'LUNAS' || rep.isPaid || (grp.memberTransactions && grp.memberTransactions.some(m => m.paymentStatus === 'LUNAS' || m.isPaid));
    const maxMemberPaid = grp.memberTransactions ? grp.memberTransactions.reduce((acc, m) => Math.max(acc, Number(m.paidAmount || m.dpAmount || m.alreadyPaid || 0)), 0) : 0;
    const repPaid = Number(rep.paidAmount || rep.dpAmount || rep.alreadyPaid || 0);
    const alreadyPaid = isLunas ? grandTotal : Math.max(repPaid, maxMemberPaid);
    const hasDp = rep.paymentStatus === 'DP' || (Boolean(rep.dpAmount) && Number(rep.dpAmount) > 0) || (alreadyPaid > 0 && !isLunas);
    const sisaBayar = Math.max(0, grandTotal - alreadyPaid);

    totalEstimatedPNBP += grandTotal;
    totalPenerimaanPnbp += alreadyPaid;

    const payDate = rep.paymentDate || rep.dpDate || (isLunas ? rep.startDate : '');
    if (payDate === realToday && alreadyPaid > 0) {
      pnbpHariIni += alreadyPaid;
    }

    if (isLunas || alreadyPaid >= grandTotal) {
      totalLunasCount++;
    } else {
      totalBelumLunasCount++;
      totalSisaPiutang += sisaBayar;
      if (alreadyPaid > 0) {
        totalDpMasuk += alreadyPaid;
      }
      unpaidItems.push({
        id: grp.groupId || grp.key,
        isGroup: true,
        guestName: `${grp.groupName} (PIC: ${grp.groupPic})`,
        building: grp.buildingsList.join(', '),
        roomNumber: `${grp.allRoomNumbers.length} Kamar`,
        grandTotal,
        paid: alreadyPaid,
        sisaBayar,
        hasDp,
        status: grp.status,
        tx: rep,
        groupRecord: grp,
        groupKey: grp.key
      });
    }
  });

  // 2. Individu List (Hunian kamar non-grup)
  individuList.forEach(tx => {
    const isBatal = tx.status === 'DIBATALKAN' || tx.status.includes('BATAL') || tx.status.includes('BATAK');
    if (isBatal) {
      totalBatalCount++;
      return;
    }

    const pricing = calculateTransactionPricing(tx, pricingOptions);
    const grandTotal = pricing.grandTotal;
    const isLunas = tx.paymentStatus === 'LUNAS' || tx.isPaid;
    const alreadyPaid = isLunas ? grandTotal : Number(tx.paidAmount || tx.dpAmount || tx.alreadyPaid || 0);
    const hasDp = tx.paymentStatus === 'DP' || (Boolean(tx.dpAmount) && Number(tx.dpAmount) > 0) || (alreadyPaid > 0 && !isLunas);
    const sisaBayar = Math.max(0, grandTotal - alreadyPaid);

    totalEstimatedPNBP += grandTotal;
    totalPenerimaanPnbp += alreadyPaid;

    const payDate = tx.paymentDate || tx.dpDate || (isLunas ? tx.startDate : '');
    if (payDate === realToday && alreadyPaid > 0) {
      pnbpHariIni += alreadyPaid;
    }

    if (isLunas || alreadyPaid >= grandTotal) {
      totalLunasCount++;
    } else {
      totalBelumLunasCount++;
      totalSisaPiutang += sisaBayar;
      if (alreadyPaid > 0) {
        totalDpMasuk += alreadyPaid;
      }
      unpaidItems.push({
        id: tx.id,
        isGroup: false,
        guestName: tx.guestName,
        building: tx.building,
        roomNumber: `Kamar ${tx.roomNumber}`,
        grandTotal,
        paid: alreadyPaid,
        sisaBayar,
        hasDp,
        status: tx.status,
        tx
      });
    }
  });

  // 3. Aula List (Sewa Ruang Pertemuan / Gedung SG)
  aulaList.forEach(tx => {
    const isBatal = tx.status === 'DIBATALKAN' || tx.status.includes('BATAL') || tx.status.includes('BATAK');
    if (isBatal) {
      totalBatalCount++;
      return;
    }

    const pricing = calculateTransactionPricing(tx, pricingOptions);
    const grandTotal = pricing.grandTotal;
    const isLunas = tx.paymentStatus === 'LUNAS' || tx.isPaid;
    const alreadyPaid = isLunas ? grandTotal : Number(tx.paidAmount || tx.dpAmount || tx.alreadyPaid || 0);
    const hasDp = tx.paymentStatus === 'DP' || (Boolean(tx.dpAmount) && Number(tx.dpAmount) > 0) || (alreadyPaid > 0 && !isLunas);
    const sisaBayar = Math.max(0, grandTotal - alreadyPaid);

    totalEstimatedPNBP += grandTotal;
    totalPenerimaanPnbp += alreadyPaid;

    const payDate = tx.paymentDate || tx.dpDate || (isLunas ? tx.startDate : '');
    if (payDate === realToday && alreadyPaid > 0) {
      pnbpHariIni += alreadyPaid;
    }

    if (isLunas || alreadyPaid >= grandTotal) {
      totalLunasCount++;
    } else {
      totalBelumLunasCount++;
      totalSisaPiutang += sisaBayar;
      if (alreadyPaid > 0) {
        totalDpMasuk += alreadyPaid;
      }
      unpaidItems.push({
        id: tx.id,
        isGroup: false,
        guestName: tx.guestName,
        building: tx.building,
        roomNumber: tx.roomNumber,
        grandTotal,
        paid: alreadyPaid,
        sisaBayar,
        hasDp,
        status: tx.status,
        tx
      });
    }
  });

  unpaidItems.sort((a, b) => b.sisaBayar - a.sisaBayar);

  const unpaidTxs = unpaidItems.map(item => ({
    tx: item.tx,
    pricing: { grandTotal: item.grandTotal },
    sisaBayar: item.sisaBayar,
    paid: item.paid,
    isGroup: item.isGroup,
    groupRecord: item.groupRecord,
    groupKey: item.groupKey
  }));

  return {
    totalEstimatedPNBP,
    totalPenerimaanPnbp,
    pnbpHariIni,
    totalSisaPiutang,
    totalDpMasuk,
    totalLunasCount,
    totalBelumLunasCount,
    totalBatalCount,
    unpaidItems,
    unpaidTxs
  };
}

export function filterDataByPeriod<T>(
  items: T[],
  period: ReportPeriod,
  dateExtractor: (item: T) => string
): T[] {
  if (period === 'Semua') return items;
  const now = new Date();
  const limit = new Date();
  if (period === 'Mingguan') {
    limit.setDate(now.getDate() - 7);
  } else if (period === 'Bulanan') {
    limit.setMonth(now.getMonth() - 1);
  } else if (period === 'Tahunan') {
    limit.setFullYear(now.getFullYear() - 1);
  } else {
    // Harian (Hari Ini)
    limit.setHours(0, 0, 0, 0);
  }

  return items.filter(item => {
    const rawDate = dateExtractor(item);
    if (!rawDate) return false;
    const itemDate = new Date(rawDate.includes(' ') ? rawDate.split(' ')[0] : rawDate);
    return itemDate >= limit;
  });
}

export function generateReportData(params: ReportExportParams) {
  const { 
    type, 
    period, 
    buildingFilter = 'ALL', 
    qcMode = 'HISTORY',
    breakfastPriorityFilter = 'ALL',
    transactions, 
    maintenances, 
    qcInspections = [], 
    workSessions = [], 
    auditLogs = [],
    rooms = [],
    users = []
  } = params;

  let title = '';
  let filename = '';
  let headers: string[] = [];
  let rows: (string | number)[][] = [];
  let summaryStats: { label: string; value: string | number }[] = [];

  const realToday = getRealTodayDate();

  if (type === 'KAMAR') {
    title = 'LAPORAN REKAPITULASI HUNIAN KAMAR, ROMBONGAN & RUANG PERTEMUAN';
    filename = `Laporan_Hunian_Kamar_${period}_${realToday}`;
    headers = [
      'No',
      'ID / Kode',
      'Tipe Booking',
      'Nama Tamu / Rombongan / PIC',
      'Wilayah Gedung',
      'Rincian Kamar / Ruang Pertemuan',
      'Kloter / Instansi',
      'Tgl Masuk',
      'Durasi',
      'Satuan',
      'Fasilitas Tambahan',
      'Tarif & Biaya (PNBP)',
      'Kontak HP',
      'Status'
    ];

    let filtered = filterDataByPeriod(transactions, period, t => t.startDate);

    // Consolidate into Rombongan, Individu, and Aula
    const { rombonganList, individuList, aulaList } = consolidateGroupTransactions(filtered, rooms);

    // Apply building filter if selected
    let filteredRombongan = rombonganList;
    let filteredIndividu = individuList;
    let filteredAula = aulaList;

    if (buildingFilter !== 'ALL') {
      const isMtgFilter = buildingFilter === 'Ruang Pertemuan' || 
                          buildingFilter === 'Gedung Serbaguna (SG)' || 
                          buildingFilter === 'Gedung Serbaguna' || 
                          isMeetingFacility(buildingFilter);
      if (isMtgFilter) {
        filteredRombongan = rombonganList.filter(g => g.includeAula);
        filteredIndividu = [];
        filteredAula = aulaList.filter(t => {
          if (buildingFilter === 'Gedung Serbaguna (SG)' || buildingFilter === 'Gedung Serbaguna') {
            return t.building?.includes('Serbaguna') || t.roomNumber?.includes('SG') || t.roomNumber?.toLowerCase().includes('serbaguna');
          }
          if (buildingFilter === 'Ruang Pertemuan') {
            return t.building === 'Ruang Pertemuan' || !t.building?.includes('Serbaguna');
          }
          return t.building === buildingFilter;
        });
      } else {
        filteredRombongan = rombonganList.filter(g => g.buildingsList.includes(buildingFilter));
        filteredIndividu = individuList.filter(t => t.building === buildingFilter);
        filteredAula = [];
      }
    }

    filteredRombongan.sort((a, b) => getGroupBookingTimestamp(b) - getGroupBookingTimestamp(a));
    filteredIndividu.sort((a, b) => getBookingTimestamp(b) - getBookingTimestamp(a));
    filteredAula.sort((a, b) => getBookingTimestamp(b) - getBookingTimestamp(a));

    // Pastikan seluruh kategori (Rombongan, Kamar Individu, dan Ruang Pertemuan) tetap tercantum lengkap
    let rowCounter = 1;
    let totalPnbpAmount = 0;

    // 1. Baris Rombongan (tetap sebagai satu kesatuan rombongan dengan rincian gedung & kamar)
    filteredRombongan.forEach(grp => {
      const isBatal = grp.status === 'DIBATALKAN' || grp.status.includes('BATAL') || grp.status.includes('BATAK');
      let roomDetails = `${grp.allRoomNumbers.length} Kamar (${grp.allRoomNumbers.join(', ')})`;
      if (grp.includeAula && grp.rentAulaName) {
        roomDetails += ` + Aula: ${grp.rentAulaName} (${grp.rentAulaDurationDays || grp.representativeTx?.rentAulaDurationDays || 1} Hari - ${grp.rentAulaDuration || 8} Jam)`;
      }

      let svcDetails = grp.cateringPackage && grp.cateringPackage !== 'TIDAK'
        ? `Katering: ${grp.cateringPackage} (${grp.cateringPaxCount || grp.totalPax} Pack)`
        : grp.breakfast
        ? `Sarapan (${grp.breakfastPortions || 1} Porsi)`
        : 'Standar';
      if (grp.extraBed) svcDetails += ` + Bed (${grp.extraBedCount || 1})`;

      const groupTypeLabel = grp.groupType === 'JEMAAH_HAJI' 
        ? 'Jemaah Haji' 
        : grp.groupType === 'INSTANSI' 
        ? 'Instansi' 
        : 'Umum';

      const grpPrice = calculateGroupPricing(grp, { rooms });
      if (!isBatal) {
        totalPnbpAmount += grpPrice.grandTotal;
      }

      rows.push([
        rowCounter++,
        grp.groupId,
        `Rombongan (${groupTypeLabel}) - ${grp.totalPax} Pax`,
        `${grp.groupName} (PIC: ${grp.groupPic})`,
        grp.buildingsList.join(', '),
        roomDetails,
        grp.kloter ? `Kloter ${grp.kloter}` : (grp.spkNumber || '-'),
        grp.startDate,
        grp.duration,
        grp.durationUnit || 'Malam',
        svcDetails,
        isBatal ? 'Rp 0 (Dibatalkan)' : grpPrice.formattedGrandTotal,
        grp.groupPicPhone || '-',
        grp.status
      ]);
    });

    // 2. Baris Tamu Individu (Per Kamar)
    filteredIndividu.forEach(t => {
      const isBatal = t.status === 'DIBATALKAN' || t.status.includes('BATAL') || t.status.includes('BATAK');
      let svcDetails = t.breakfast ? `Sarapan (${t.breakfastPortions || 1} Porsi)` : 'Standar';
      if (t.extraBed) svcDetails += ` + Bed (${t.extraBedCount || 1})`;

      const bookingTypeLabel = t.isGroup || t.guestType === 'ROMBONGAN' || t.groupId
        ? `Rombongan (${t.groupName || 'Grup'})`
        : 'Penyewaan Kamar Individu';

      const txPrice = calculateTransactionPricing(t, { rooms });
      if (!isBatal) {
        totalPnbpAmount += txPrice.grandTotal;
      }

      rows.push([
        rowCounter++,
        t.id,
        bookingTypeLabel,
        t.guestName,
        t.building,
        `Kamar ${t.roomNumber} (1 Kamar)`,
        t.kloter && t.kloter !== '-' ? `Kloter ${t.kloter}` : '-',
        t.startDate,
        t.duration,
        t.durationUnit || 'Malam',
        svcDetails,
        isBatal ? 'Rp 0 (Dibatalkan)' : txPrice.formattedGrandTotal,
        t.phone || '-',
        t.status
      ]);
    });

    // 3. Baris Ruang Pertemuan (Aula)
    filteredAula.forEach(t => {
      const isBatal = t.status === 'DIBATALKAN' || t.status.includes('BATAL') || t.status.includes('BATAK');
      const aulaPrice = calculateTransactionPricing(t, { rooms });
      if (!isBatal) {
        totalPnbpAmount += aulaPrice.grandTotal;
      }

      const isSG = t.building?.toLowerCase().includes('serbaguna') || 
                   t.roomNumber?.toLowerCase().includes('serbaguna') ||
                   Boolean(t.rentType?.toLowerCase().includes('serbaguna'));
      rows.push([
        rowCounter++,
        t.id,
        isSG ? 'Sewa Gedung Serbaguna (SG)' : 'Sewa Ruang Pertemuan (Aula)',
        t.guestName,
        t.building || (isSG ? 'Gedung Serbaguna (SG)' : 'Ruang Pertemuan'),
        `${t.roomNumber} (${t.duration} ${t.durationUnit || 'Jam'})`,
        t.notes || '-',
        t.startDate,
        t.duration,
        t.durationUnit || 'Jam',
        t.breakfast ? `Konsumsi (${t.breakfastMenu || 'Pesan'})` : (isSG ? 'Standar Fasilitas Serbaguna' : 'Standar Sewa Ruang'),
        isBatal ? 'Rp 0 (Dibatalkan)' : aulaPrice.formattedGrandTotal,
        t.phone || '-',
        t.status
      ]);
    });

    const totalRoomsRombongan = filteredRombongan.reduce((acc, g) => acc + g.allRoomNumbers.length, 0);

    summaryStats = [
      { label: 'Total Entitas Reservasi', value: filteredRombongan.length + filteredIndividu.length + filteredAula.length },
      { label: 'Rombongan Terdaftar', value: `${filteredRombongan.length} Grup (${totalRoomsRombongan} Kamar)` },
      { label: 'Kamar Tamu Individu', value: `${filteredIndividu.length} Kamar` },
      { label: 'Sewa Ruang Pertemuan', value: `${filteredAula.length} Aula` },
      { label: 'Total Nilai PNBP Terdaftar', value: formatRupiah(totalPnbpAmount) },
      { 
        label: 'Check-In Aktif (Terisi)', 
        value: filteredRombongan.filter(g => g.status === 'TERISI').length + 
               filteredIndividu.filter(t => t.status === 'TERISI').length + 
               filteredAula.filter(t => t.status === 'TERISI').length 
      },
      { 
        label: 'Reservasi Booked', 
        value: filteredRombongan.filter(g => g.status === 'BOOKED').length + 
               filteredIndividu.filter(t => t.status === 'BOOKED').length + 
               filteredAula.filter(t => t.status === 'BOOKED').length 
      },
    ];
  } else if (type === 'AULA') {
    title = 'LAPORAN REKAPITULASI RESERVASI & PENGGUNAAN RUANG PERTEMUAN (AULA / RAPAT)';
    filename = `Laporan_Sewa_Aula_${period}_${realToday}`;
    headers = [
      'No',
      'ID Reservasi',
      'Tipe Reservasi',
      'Nama Ruang / Aula',
      'Penyelenggara / Instansi',
      'PIC & Kontak HP',
      'Agenda / Keperluan Acara',
      'Tgl Pemakaian',
      'Durasi',
      'Satuan',
      'Layanan Konsumsi / Katering',
      'Tarif Sewa (PNBP)',
      'Status'
    ];

    let filtered = filterDataByPeriod(transactions, period, t => t.startDate);
    const { rombonganList, aulaList } = consolidateGroupTransactions(filtered, rooms);
    rombonganList.sort((a, b) => getGroupBookingTimestamp(b) - getGroupBookingTimestamp(a));
    aulaList.sort((a, b) => getBookingTimestamp(b) - getBookingTimestamp(a));

    let rowCounter = 1;
    let totalAulaPnbp = 0;

    // 1. Aula Mandiri
    aulaList.forEach(t => {
      const isBatal = t.status === 'DIBATALKAN' || t.status.includes('BATAL') || t.status.includes('BATAK');
      const aulaPrice = calculateTransactionPricing(t, { rooms });
      if (!isBatal) {
        totalAulaPnbp += aulaPrice.grandTotal;
      }

      rows.push([
        rowCounter++,
        t.id,
        'Sewa Aula Mandiri',
        t.roomNumber || 'Aula',
        t.guestName || '-',
        `${t.guestName} (${t.phone || '-'})`,
        t.notes || 'Pertemuan / Rapat / Acara',
        t.startDate,
        t.duration,
        t.durationUnit || 'Jam',
        t.breakfast ? `Konsumsi (${t.breakfastMenu || 'Pesan Dapur'})` : 'Standar Fasilitas Aula',
        isBatal ? 'Rp 0 (Dibatalkan)' : aulaPrice.formattedGrandTotal,
        t.status
      ]);
    });

    // 2. Aula dari Rombongan (Paket Gedung + Aula)
    rombonganList.filter(g => g.includeAula).forEach(grp => {
      const isBatal = grp.status === 'DIBATALKAN' || grp.status.includes('BATAL') || grp.status.includes('BATAK');
      const aulaDays = grp.rentAulaDurationDays || grp.representativeTx?.rentAulaDurationDays || 1;
      const aulaHours = grp.rentAulaDuration || 8;
      const grpPrice = calculateGroupPricing(grp, { rooms });
      const pkgAulaPrice = grpPrice.subtotalAula || (12000000 * aulaDays);
      if (!isBatal) {
        totalAulaPnbp += pkgAulaPrice;
      }

      rows.push([
        rowCounter++,
        grp.groupId,
        `Paket Rombongan (${grp.groupType === 'INSTANSI' ? 'Instansi' : grp.groupType === 'JEMAAH_HAJI' ? 'Haji' : 'Umum'})`,
        grp.rentAulaName || 'Aula Pertemuan',
        grp.groupName,
        `${grp.groupPic} (${grp.groupPicPhone || '-'})`,
        grp.notes || 'Pembekalan Manasik / Rapat Koordinasi Rombongan',
        grp.startDate,
        aulaDays > 1 ? aulaDays : aulaHours,
        aulaDays > 1 ? 'Hari' : 'Jam',
        grp.cateringPackage && grp.cateringPackage !== 'TIDAK' ? `Katering: ${grp.cateringPackage}` : (grp.breakfast ? 'Sarapan' : 'Standar Fasilitas Aula'),
        isBatal ? 'Rp 0 (Dibatalkan)' : formatRupiah(pkgAulaPrice),
        grp.status
      ]);
    });

    const totalAulaBookings = rows.length;
    summaryStats = [
      { label: 'Total Reservasi Aula', value: `${totalAulaBookings} Acara` },
      { label: 'Aula Mandiri', value: `${aulaList.length} Reservasi` },
      { label: 'Aula Paket Rombongan', value: `${rombonganList.filter(g => g.includeAula).length} Rombongan` },
      { label: 'Total Nilai Sewa (PNBP)', value: formatRupiah(totalAulaPnbp) },
      { label: 'Acara Sedang Berlangsung', value: rows.filter(r => r[12] === 'TERISI').length },
      { label: 'Booking Mendatang', value: rows.filter(r => r[12] === 'BOOKED').length }
    ];
  } else if (type === 'MAINTENANCE') {
    title = 'LAPORAN PERAWATAN & PERBAIKAN KERUSAKAN FASILITAS';
    filename = `Laporan_Maintenance_${period}_${realToday}`;
    headers = [
      'No',
      'Waktu Lapor',
      'Tipe Fasilitas',
      'Gedung',
      'No. Kamar / Aula',
      'Kategori Kerusakan',
      'Tingkat Urgensi',
      'Teknisi Bertugas',
      'Pelapor',
      'Deskripsi Kerusakan',
      'Status Tiket'
    ];

    let filtered = filterDataByPeriod(maintenances, period, m => m.reportTime);
    if (buildingFilter !== 'ALL') {
      filtered = filtered.filter(m => m.building === buildingFilter);
    }

    filtered.forEach((m, index) => {
      const isAula = m.building === 'Ruang Pertemuan';
      rows.push([
        index + 1,
        m.reportTime,
        isAula ? 'Ruang Pertemuan (Aula)' : 'Kamar Penginapan',
        m.building,
        m.roomNumber,
        m.category,
        m.urgency,
        m.technician || m.assignedTechnicianName || 'Belum Ditugaskan',
        m.reportedUser,
        m.description,
        m.status
      ]);
    });

    summaryStats = [
      { label: 'Total Laporan Kerusakan', value: filtered.length },
      { label: 'Selesai & Lolos QC', value: filtered.filter(m => m.status === 'SELESAI').length },
      { label: 'Dalam Pengerjaan', value: filtered.filter(m => m.status === 'PROSES').length },
      { label: 'Menunggu QC / Verifikasi', value: filtered.filter(m => m.status === 'MENUNGGU_QC').length },
    ];
  } else if (type === 'QC') {
    if (qcMode === 'READINESS') {
      title = 'AUDIT KESIAPAN & STANDAR MUTU KAMAR PENGINAPAN & RUANG PERTEMUAN (AULA)';
      filename = `Audit_Kesiapan_Mutu_${buildingFilter !== 'ALL' ? buildingFilter.replace(/\s+/g, '_') : 'Semua'}_${realToday}`;
      headers = [
        'No',
        'Tipe Fasilitas',
        'Gedung / Wilayah',
        'No. Kamar / Aula',
        'Tipe / Kelas',
        'Kapasitas (Pax)',
        'Status Fisik',
        'Vonis Kelayakan QC',
        'Tgl Cek Terakhir',
        'Petugas QC',
        'Evaluasi & Catatan Mutu'
      ];

      let targetRooms = rooms;
      if (buildingFilter !== 'ALL') {
        targetRooms = targetRooms.filter(r => r.building === buildingFilter);
      }

      targetRooms.forEach((r, idx) => {
        const isAula = r.building === 'Ruang Pertemuan' || r.roomNumber.toLowerCase().includes('aula');
        const qcStatus = r.qcStatus || 'PERLU_INSPEKSI';
        let qcLabel = 'BELUM DIINSPEKSI';
        if (qcStatus === 'LOLOS_QC') qcLabel = 'LOLOS STANDAR (LAYAK)';
        else if (qcStatus === 'MENUNGGU_QC') qcLabel = 'MENUNGGU VERIFIKASI QC';
        else if (qcStatus === 'PERLU_PERBAIKAN') qcLabel = 'PERLU PERBAIKAN FISIK';

        rows.push([
          idx + 1,
          isAula ? 'Ruang Pertemuan (Aula)' : 'Kamar Penginapan',
          r.building,
          r.roomNumber,
          r.type || (isAula ? 'Aula Serbaguna' : 'Standar'),
          `${r.capacity || (isAula ? 200 : 4)} Orang`,
          r.status,
          qcLabel,
          r.lastQcDate || '-',
          r.lastQcBy || '-',
          r.lastQcNotes || (qcStatus === 'LOLOS_QC' ? 'Sesuai SOP Standar Mutu Asrama Haji Jakarta' : 'Perlu atensi inspeksi berkala')
        ]);
      });

      const totalKamar = targetRooms.filter(r => r.building !== 'Ruang Pertemuan').length;
      const totalAula = targetRooms.filter(r => r.building === 'Ruang Pertemuan').length;
      const lolosCount = targetRooms.filter(r => r.qcStatus === 'LOLOS_QC').length;
      const perluCount = targetRooms.filter(r => r.qcStatus === 'PERLU_PERBAIKAN').length;
      const tungguCount = targetRooms.filter(r => r.qcStatus === 'MENUNGGU_QC').length;

      summaryStats = [
        { label: 'Total Fasilitas Terdata', value: targetRooms.length },
        { label: 'Kamar Penginapan', value: totalKamar },
        { label: 'Ruang Pertemuan (Aula)', value: totalAula },
        { label: 'Lolos Standar Mutu', value: `${lolosCount} (${targetRooms.length > 0 ? Math.round((lolosCount / targetRooms.length) * 100) : 0}%)` },
        { label: 'Perlu Perbaikan', value: perluCount },
        { label: 'Menunggu Verifikasi', value: tungguCount }
      ];
    } else {
      // HISTORY AUDIT LOG
      title = 'LAPORAN REKAPITULASI HASIL INSPEKSI QUALITY CONTROL (QC)';
      filename = `Laporan_Inspeksi_QC_${period}_${realToday}`;
      headers = [
        'No',
        'ID Inspeksi',
        'Waktu Pemeriksaan',
        'Tipe Fasilitas',
        'Gedung / Wilayah',
        'No. Kamar / Aula',
        'Petugas QC',
        'Kebersihan',
        'Linen / Tata Ruang',
        'AC & Kelistrikan',
        'Sanitasi / Air',
        'Amenities / Alat',
        'Hasil QC (Vonis)',
        'Tipe Alur',
        'Catatan Hasil Evaluasi'
      ];

      let filtered = filterDataByPeriod(qcInspections, period, q => q.inspectionDate);
      if (buildingFilter !== 'ALL') {
        filtered = filtered.filter(q => q.building === buildingFilter);
      }

      filtered.forEach((q, index) => {
        const isAula = q.building === 'Ruang Pertemuan' || q.roomNumber.toLowerCase().includes('aula');
        rows.push([
          index + 1,
          q.id,
          q.inspectionDate,
          isAula ? 'Ruang Pertemuan (Aula)' : 'Kamar Penginapan',
          q.building,
          q.roomNumber,
          q.inspectorName,
          q.cleanliness === 'BAIK' ? 'Baik' : q.cleanliness === 'CUKUP' ? 'Cukup' : 'Buruk',
          q.linenBed === 'LENGKAP_BERSIH' ? 'Lengkap & Bersih' : 'Perlu Ganti/Rapikan',
          q.acElectricity === 'NORMAL' ? 'Normal / Dingin' : 'Bermasalah',
          q.plumbingWater === 'LANCAR' ? 'Lancar / Bersih' : 'Bermasalah',
          q.amenities === 'LENGKAP' ? 'Lengkap Standar' : 'Kurang / Habis',
          q.result === 'LOLOS_QC' ? 'LOLOS QC (LAYAK PAKAI)' : 'PERLU PERBAIKAN',
          q.maintenanceIdCreated ? 'Pasca Perbaikan Teknisi' : 'Inspeksi Rutin',
          q.notes || '-'
        ]);
      });

      const lolos = filtered.filter(q => q.result === 'LOLOS_QC').length;
      const perbaikan = filtered.filter(q => q.result === 'PERLU_PERBAIKAN').length;
      const aulaCount = filtered.filter(q => q.building === 'Ruang Pertemuan' || q.roomNumber.toLowerCase().includes('aula')).length;
      const kamarCount = filtered.length - aulaCount;
      const kebersihanBaik = filtered.filter(q => q.cleanliness === 'BAIK').length;
      const acNormal = filtered.filter(q => q.acElectricity === 'NORMAL').length;

      summaryStats = [
        { label: 'Total Inspeksi Tercatat', value: filtered.length },
        { label: 'Lolos Standar QC', value: `${lolos} (${filtered.length > 0 ? Math.round((lolos / filtered.length) * 100) : 0}%)` },
        { label: 'Temuan Kerusakan', value: perbaikan },
        { label: 'Inspeksi Kamar', value: kamarCount },
        { label: 'Inspeksi Ruang Pertemuan (Aula)', value: aulaCount },
        { label: 'Kebersihan Sesuai Standar', value: `${kebersihanBaik} (${filtered.length > 0 ? Math.round((kebersihanBaik / filtered.length) * 100) : 0}%)` },
        { label: 'AC & Listrik Normal', value: `${acNormal} (${filtered.length > 0 ? Math.round((acNormal / filtered.length) * 100) : 0}%)` }
      ];
    }
  } else if (type === 'SARAPAN') {
    title = 'LAPORAN REKAPITULASI PESANAN SARAPAN KOPERASI & DISTRIBUSI KAMAR';
    filename = `Laporan_Pesanan_Sarapan_${period}_${realToday}`;
    headers = [
      'No',
      'ID Transaksi',
      'Status Kamar',
      'Prioritas Dapur',
      'Gedung',
      'No. Kamar',
      'Nama Pemesan / Jemaah',
      'Kloter / Instansi',
      'Kontak HP',
      'Tgl Mulai Sajian',
      'Pilihan Menu Sarapan',
      'Porsi / Hari',
      'Total Hari',
      'Total Box Akumulasi',
      'Status Dapur / Pengantaran',
      'Catatan Khusus / Diet / Alergi'
    ];

    // Gabungkan standalone breakfastOrders dan transaksi kamar yang memesan sarapan
    const existingBreakfastOrders = params.breakfastOrders || [];
    const baseOrders: any[] = [...existingBreakfastOrders];

    transactions.forEach(tx => {
      const hasBreakfast = Boolean(tx.breakfast) && (!tx.cateringPackage || tx.cateringPackage !== 'TIDAK');
      if (hasBreakfast) {
        const fullTxId = tx.id;
        const exists = baseOrders.some(o => 
          (o.transactionId && o.transactionId === fullTxId) || 
          o.id === `BO-TX-${fullTxId}` || 
          (o.roomNumber === tx.roomNumber && o.guestName === tx.guestName)
        );
        if (!exists) {
          const isCancelled = tx.status === 'DIBATALKAN' || tx.breakfastStatus === 'DIBATALKAN';
          baseOrders.push({
            id: `BO-TX-${fullTxId}`,
            roomNumber: tx.roomNumber,
            building: tx.building,
            guestName: tx.guestName,
            phone: tx.phone,
            kloter: tx.kloter,
            transactionId: fullTxId,
            menuName: tx.breakfastMenu || (tx.building === 'Ruang Pertemuan' ? 'Snack Box Pertemuan' : 'Nasi Goreng Spesial & Telur Ceplok'),
            portions: tx.breakfastPortions || 4,
            days: tx.breakfastDays || tx.duration || 1,
            startDate: tx.startDate || realToday,
            deliveryTime: '06:30 WIB',
            status: isCancelled ? 'DIBATALKAN' : ((tx.breakfastStatus as any) || 'MENUNGGU'),
            notes: isCancelled ? `Booking kamar dibatalkan${tx.cancelReason ? `: ${tx.cancelReason}` : ''}` : (tx.notes || 'Pesanan terintegrasi dari data reservasi kamar'),
            cancelReason: tx.cancelReason,
            cancelledAt: tx.cancelledAt,
            dietaryRestriction: 'Biasa',
            pricePerPortion: 25000,
            totalPrice: (tx.breakfastPortions || 4) * 25000 * (tx.breakfastDays || tx.duration || 1),
            createdAt: `${tx.startDate || realToday} 06:00:00`
          });
        }
      }
    });

    interface ConsolidatedReportOrder {
      id: string;
      transactionId?: string;
      roomNumber: string;
      building: string;
      guestName: string;
      kloter: string;
      phone: string;
      startDate: string;
      days: number;
      portions: number;
      menuName: string;
      isCancelled: boolean;
      statusKamar: string;
      prioritasDapur: string;
      statusDapur: string;
      notes: string;
      rawStatus: 'MENUNGGU' | 'SEDANG_DIBUAT' | 'PENGANTARAN' | 'SELESAI' | 'DIBATALKAN';
    }

    let ordersList: ConsolidatedReportOrder[] = [];

    baseOrders.forEach(o => {
      const tx = transactions.find(t => 
        t.id === o.transactionId || 
        (o.id && t.id && o.id.includes(t.id)) ||
        (t.roomNumber === o.roomNumber && t.guestName === o.guestName)
      );

      // Jika data transaksi yang terhubung disesuaikan menjadi TANPA MAKAN/SARAPAN, abaikan
      if (tx && (!tx.breakfast || tx.cateringPackage === 'TIDAK')) {
        return;
      }

      const isCancelled = o.status === 'DIBATALKAN' || tx?.status === 'DIBATALKAN' || tx?.breakfastStatus === 'DIBATALKAN';
      const isCheckedIn = !isCancelled && tx?.status === 'TERISI';
      const isCheckedOut = !isCancelled && tx?.status === 'SELESAI';

      // Status Dapur: Jika batal maka status WAJIB Batal, tidak boleh Selesai atau tahap lainnya
      let statusDapur = 'Menunggu';
      let rawKitchenStatus: ConsolidatedReportOrder['rawStatus'] = 'MENUNGGU';
      if (isCancelled) {
        statusDapur = 'Batal';
        rawKitchenStatus = 'DIBATALKAN';
      } else {
        const st = (o.status || tx?.breakfastStatus || 'MENUNGGU').toUpperCase();
        if (st === 'SELESAI') {
          statusDapur = 'Selesai';
          rawKitchenStatus = 'SELESAI';
        } else if (st === 'PENGANTARAN') {
          statusDapur = 'Pengantaran';
          rawKitchenStatus = 'PENGANTARAN';
        } else if (st === 'SEDANG_DIBUAT' || st === 'DIMASAK') {
          statusDapur = 'Dimasak';
          rawKitchenStatus = 'SEDANG_DIBUAT';
        } else {
          statusDapur = 'Menunggu';
          rawKitchenStatus = 'MENUNGGU';
        }
      }

      let statusKamar = 'RESERVASI (BOOKED)';
      if (isCancelled) {
        statusKamar = 'DIBATALKAN (BATAL)';
      } else if (isCheckedIn) {
        statusKamar = 'SUDAH CHECK-IN (TERISI)';
      } else if (isCheckedOut) {
        statusKamar = 'SUDAH CHECK-OUT';
      }

      let prioritasDapur = 'STANDBY (PERSIAPAN)';
      if (isCancelled) {
        prioritasDapur = 'BATAL (STOP PRODUKSI)';
      } else if (isCheckedIn) {
        prioritasDapur = 'PRIORITAS 1 (ANTAR SEGERA)';
      }

      ordersList.push({
        id: o.transactionId || o.id,
        transactionId: o.transactionId,
        roomNumber: o.roomNumber || '-',
        building: o.building || tx?.building || '-',
        guestName: o.guestName || tx?.guestName || '-',
        kloter: o.kloter || tx?.kloter || '-',
        phone: o.phone || tx?.phone || '-',
        startDate: o.startDate || tx?.startDate || realToday,
        days: Number(o.days) || Number(tx?.breakfastDays) || Number(tx?.duration) || 1,
        portions: Number(o.portions) || Number(tx?.breakfastPortions) || 1,
        menuName: o.menuName || tx?.breakfastMenu || 'Nasi Goreng Spesial',
        isCancelled,
        statusKamar,
        prioritasDapur,
        statusDapur,
        notes: isCancelled 
          ? (o.cancelReason || tx?.cancelReason || 'Pesanan/Booking dibatalkan') 
          : (o.notes || tx?.notes || 'Standar tanpa alergi'),
        rawStatus: rawKitchenStatus
      });
    });

    // Date filtering: For 'Harian', include guests currently staying (TERISI) or today's arrivals
    let filtered = ordersList;
    if (period !== 'Semua') {
      const now = new Date();
      const limit = new Date();
      if (period === 'Mingguan') {
        limit.setDate(now.getDate() - 7);
        limit.setHours(0, 0, 0, 0);
        filtered = ordersList.filter(t => new Date(t.startDate + 'T00:00:00') >= limit);
      } else if (period === 'Bulanan') {
        limit.setMonth(now.getMonth() - 1);
        limit.setHours(0, 0, 0, 0);
        filtered = ordersList.filter(t => new Date(t.startDate + 'T00:00:00') >= limit);
      } else if (period === 'Tahunan') {
        limit.setFullYear(now.getFullYear() - 1);
        limit.setHours(0, 0, 0, 0);
        filtered = ordersList.filter(t => new Date(t.startDate + 'T00:00:00') >= limit);
      } else {
        // Harian (Hari Ini)
        filtered = ordersList.filter(t => {
          if (t.statusKamar.includes('TERISI')) return true;
          if (t.startDate === realToday) return true;
          return t.startDate <= realToday && addDaysToDateStr(t.startDate, t.days || 1) >= realToday;
        });
      }
    }

    if (buildingFilter !== 'ALL') {
      filtered = filtered.filter(t => t.building === buildingFilter);
    }

    if (breakfastPriorityFilter === 'CHECKIN_ONLY') {
      filtered = filtered.filter(t => !t.isCancelled && t.statusKamar.includes('TERISI'));
    } else if (breakfastPriorityFilter === 'BOOKED_ONLY') {
      filtered = filtered.filter(t => !t.isCancelled && t.statusKamar.includes('BOOKED'));
    }

    // STRICT SORT:
    // 1. Pesanan Aktif Check-in (TERISI) paling atas
    // 2. Pesanan Aktif Booked
    // 3. Pesanan Check-Out
    // 4. Pesanan DIBATALKAN paling bawah
    filtered.sort((a, b) => {
      if (!a.isCancelled && b.isCancelled) return -1;
      if (a.isCancelled && !b.isCancelled) return 1;
      if (a.statusKamar.includes('TERISI') && !b.statusKamar.includes('TERISI')) return -1;
      if (!a.statusKamar.includes('TERISI') && b.statusKamar.includes('TERISI')) return 1;
      return a.roomNumber.localeCompare(b.roomNumber);
    });

    filtered.forEach((o, index) => {
      const totalBox = (o.portions || 1) * (o.days || 1);
      rows.push([
        index + 1,
        o.id,
        o.statusKamar,
        o.prioritasDapur,
        o.building,
        o.roomNumber,
        o.guestName,
        o.kloter,
        o.phone,
        o.startDate,
        o.menuName,
        `${o.portions} Porsi`,
        `${o.days} Hari`,
        `${totalBox} Box`,
        o.statusDapur,
        o.notes
      ]);
    });

    const totalOrders = filtered.length;
    const cancelledList = filtered.filter(t => t.isCancelled);
    const cancelledCount = cancelledList.length;
    const activeList = filtered.filter(t => !t.isCancelled);

    const totalDailyPortions = filtered.reduce((acc, curr) => acc + (curr.portions || 1), 0);
    const totalAccumulatedBoxes = filtered.reduce((acc, curr) => acc + ((curr.portions || 1) * (curr.days || 1)), 0);

    const menungguCount = activeList.filter(t => t.rawStatus === 'MENUNGGU').length;
    const dimasakCount = activeList.filter(t => t.rawStatus === 'SEDANG_DIBUAT').length;
    const pengantaranCount = activeList.filter(t => t.rawStatus === 'PENGANTARAN').length;
    const selesaiCount = activeList.filter(t => t.rawStatus === 'SELESAI').length;

    summaryStats = [
      { label: 'Total Pesanan Sarapan', value: totalOrders },
      { label: 'Menunggu (Antrean Dapur)', value: menungguCount },
      { label: 'Dimasak (Sedang Diproses)', value: dimasakCount },
      { label: 'Pengantaran (Dalam Perjalanan)', value: pengantaranCount },
      { label: 'Selesai (Sudah Disajikan)', value: selesaiCount },
      { label: 'Batal (Pesanan Dibatalkan)', value: cancelledCount },
      { label: 'Total Porsi Harian', value: `${totalDailyPortions} Porsi/Hari` },
      { label: 'Total Box Periode', value: `${totalAccumulatedBoxes} Box` }
    ];
  } else if (type === 'JAM_KERJA') {
    title = 'LAPORAN REKAPITULASI PRESENSI & JAM KERJA PETUGAS SHIFT';
    filename = `Laporan_Presensi_Jam_Kerja_${period}_${realToday}`;
    headers = [
      'No',
      'ID Sesi',
      'Nama Petugas',
      'Role / Jabatan',
      'Waktu Masuk (Check-In)',
      'Waktu Keluar (Check-Out)',
      'Durasi Kerja',
      'Status Sesi',
      'Catatan Petugas'
    ];

    let filtered = filterDataByPeriod(workSessions, period, s => s.loginTime);

    filtered.forEach((s, index) => {
      rows.push([
        index + 1,
        s.id,
        s.userName,
        s.userRole,
        s.loginTime,
        s.logoutTime || 'Masih Bertugas (Aktif)',
        s.durationFormatted || '-',
        s.status,
        s.notes || '-'
      ]);
    });

    summaryStats = [
      { label: 'Total Catatan Presensi', value: filtered.length },
      { label: 'Sesi Selesai', value: filtered.filter(s => s.status === 'SELESAI').length },
      { label: 'Sesi Sedang Aktif', value: filtered.filter(s => s.status === 'AKTIF').length },
    ];
  } else if (type === 'AUDIT') {
    title = 'LAPORAN LOG AUDIT AKTIVITAS SISTEM OPERASIONAL';
    filename = `Laporan_Audit_Log_${period}_${realToday}`;
    headers = [
      'No',
      'Waktu Aktivitas',
      'Nama Pengguna',
      'Role / Jabatan',
      'Tindakan (Action)',
      'Rincian Aktivitas'
    ];

    let filtered = filterDataByPeriod(auditLogs, period, a => a.timestamp);

    filtered.forEach((a, index) => {
      rows.push([
        index + 1,
        a.timestamp,
        a.user,
        a.role,
        a.action,
        a.details
      ]);
    });

    summaryStats = [
      { label: 'Total Log Tercatat', value: filtered.length },
    ];
  } else if (type === 'LOG_UNDUH') {
    title = 'LAPORAN LOG RIWAYAT PENGUNDUHAN PDF BER-QR CODE & TANDA TANGAN';
    filename = `Laporan_Log_Unduh_PDF_${period}_${realToday}`;
    headers = [
      'No',
      'ID Verifikasi',
      'Waktu Unduh',
      'Petugas Pengunduh',
      'Role Petugas',
      'Nama Dokumen / Objek',
      'Pejabat TTD & QR',
      'Status Dokumen'
    ];

    const allDownloadLogs = (auditLogs || []).filter(a => 
      a.action === 'UNDUH_PDF_BER_QR' && 
      Boolean(a.verificationCode) && 
      a.hasQrAndSignature !== false &&
      Boolean(a.signatoryName && !a.signatoryName.includes('Belum Ada'))
    );
    let filtered = filterDataByPeriod(allDownloadLogs, period, a => a.timestamp);

    filtered.forEach((a, index) => {
      const logIdStr = a.id ? String(a.id) : `LOG${index + 1}`;
      const vCode = a.verificationCode || (logIdStr.toLowerCase().startsWith('vlog-') ? logIdStr.toUpperCase() : `VLOG-${logIdStr.slice(-8).toUpperCase()}`);
      const docName = a.documentTitle || a.targetId || a.details.slice(0, 40);
      const signatory = a.signatoryName ? `${a.signatoryName} (${a.signatoryRole || 'Pejabat'})` : '-';

      rows.push([
        index + 1,
        vCode,
        a.timestamp,
        a.user,
        a.role,
        docName,
        signatory,
        'ASLI & TERDAFTAR'
      ]);
    });

    summaryStats = [
      { label: 'Total Unduhan Terdata', value: filtered.length },
      { label: 'Status Keabsahan', value: '100% Terverifikasi Digital' }
    ];
  } else if (type === 'USERS') {
    title = 'LAPORAN RESMI DAFTAR ANGGOTA & AKUN PETUGAS SISTEM OPERASIONAL';
    filename = `Laporan_Daftar_Anggota_Petugas_${realToday}`;
    headers = [
      'No',
      'Nama Lengkap',
      'Username',
      'Role / Jabatan',
      'Divisi / Departemen',
      'NIP',
      'No. Telepon',
      'Status TTD Digital',
      'Status Akun'
    ];

    const userList = (users && users.length > 0) ? users : dataStorage.getUsers();
    userList.forEach((u, index) => {
      rows.push([
        index + 1,
        u.fullName,
        u.username,
        u.role,
        u.department || 'Operasional',
        u.nip || '-',
        u.phone || '-',
        u.signatureUrl ? 'Terunggah (Aktif)' : 'Belum Ada TTD',
        u.status || 'Aktif'
      ]);
    });

    summaryStats = [
      { label: 'Total Anggota / Petugas', value: userList.length },
      { label: 'Memiliki TTD & QR', value: userList.filter(u => u.signatureUrl).length },
      { label: 'Akun Aktif', value: userList.filter(u => u.status !== 'Nonaktif').length }
    ];
  }

  return { title, filename, headers, rows, summaryStats };
}

/**
 * Exports data as genuine styled Microsoft Excel (.xlsx) file using ExcelJS.
 * Embeds the ACTUAL official logo image into cell A3:A5 with pure white background,
 * full typography, A4 page setup, and crisp double-ruled Kop borders.
 */
export async function exportToExcel(params: ReportExportParams): Promise<void> {
  return exportToExcelWithExcelJs(params);
}

/**
 * Helper to safely trigger document print via invisible iframe
 * and automatically deliver download of the formatted A4 document as PDF
 */
export function printOrDownloadHtmlDocument(htmlContent: string, filename: string, title: string) {
  // 1. Download official .pdf file
  try {
    downloadHtmlContentAsPdf(htmlContent, `${filename}.pdf`, {
      orientation: 'landscape',
      marginMm: 6,
      title
    }).catch(err => {
      console.warn('Direct PDF export error, attempting fallback:', err);
    });
  } catch (err) {
    console.warn('PDF exporter error:', err);
  }

  // 2. Direct hidden iframe print (reliable in iframes and triggers native print)
  try {
    const oldIframe = document.getElementById('report-print-iframe');
    if (oldIframe && document.body.contains(oldIframe)) {
      document.body.removeChild(oldIframe);
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'report-print-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(htmlContent);
      doc.close();
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.warn('Iframe print error:', e);
        }
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 60000);
      }, 500);
    }
  } catch (err) {
    console.warn('Iframe setup error:', err);
  }
}

/**
 * Generates and triggers clean official PDF print document
 */
export function exportToPDF(params: ReportExportParams) {
  const { title, filename, headers, rows, summaryStats } = generateReportData(params);

  // Directly download official vector PDF with single manager signature & precision columns
  downloadReportPdfDirect(
    title,
    filename,
    headers,
    rows,
    summaryStats,
    params.currentUser?.fullName || 'Administrator Operasional',
    params.currentUser?.role || 'Pimpinan Divisi',
    params.type,
    params.users,
    params.currentUser
  );
  return;
  const appSettings = dataStorage.getAppSettings();
  const realToday = getRealTodayDate();

  const tableHeaderHtml = headers.map(h => `<th style="border: 1px solid #cbd5e1; padding: 8px 6px; background-color: #f1f5f9; font-size: 10px; text-transform: uppercase; font-weight: 700; color: #1e293b; text-align: left;">${h}</th>`).join('');

  const tableRowsHtml = rows.map((r, rIdx) => {
    const bg = rIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
    const cells = r.map((c, cIdx) => {
      const align = cIdx === 0 ? 'center' : 'left';
      return `<td style="border: 1px solid #e2e8f0; padding: 6px; font-size: 10px; color: #334155; text-align: ${align};">${c}</td>`;
    }).join('');
    return `<tr style="background-color: ${bg};">${cells}</tr>`;
  }).join('');

  const summaryHtml = summaryStats.map(s => `
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; display: inline-block; margin-right: 12px; margin-bottom: 8px;">
      <div style="font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 600;">${s.label}</div>
      <div style="font-size: 13px; font-weight: 800; color: #0f172a; margin-top: 2px;">${s.value}</div>
    </div>
  `).join('');

  const signatoryFallback = getReportSignatory(params.type, params.currentUser, params.users);

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>${title} - ${filename}</title>
      <style>
        @page {
          size: A4 landscape;
          margin: 15mm 12mm 15mm 12mm;
        }
        body {
          font-family: Arial, Helvetica, sans-serif;
          margin: 0;
          padding: 20px;
          color: #0f172a;
          background: #ffffff;
        }
        .header-kop {
          text-align: center;
          position: relative;
          padding-bottom: 12px;
          border-bottom: 3px double #0f172a;
          margin-bottom: 16px;
        }
        .header-kop h2 {
          margin: 0;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: #0f172a;
        }
        .header-kop h1 {
          margin: 2px 0;
          font-size: 16px;
          font-weight: 900;
          letter-spacing: 1px;
          color: #047857;
        }
        .header-kop p {
          margin: 2px 0 0;
          font-size: 9.5px;
          color: #475569;
        }
        .doc-title {
          text-align: center;
          margin: 14px 0 10px;
        }
        .doc-title h3 {
          margin: 0;
          font-size: 13px;
          font-weight: 800;
          text-decoration: underline;
          color: #0f172a;
          letter-spacing: 0.5px;
        }
        .meta-info {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: #475569;
          margin-bottom: 12px;
          border-bottom: 1px dashed #cbd5e1;
          padding-bottom: 8px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        .sign-container {
          margin-top: 35px;
          display: flex;
          justify-content: flex-end;
          page-break-inside: avoid;
        }
        .sign-box {
          text-align: center;
          width: 250px;
          font-size: 10.5px;
        }
        .sign-space {
          height: 55px;
        }
        @media print {
          body {
            padding: 0;
          }
          .no-print {
            display: none !important;
          }
        }
      </style>
    </head>
    <body>
      <div class="no-print" style="background-color: #ecfdf5; border: 1px solid #a7f3d0; padding: 10px 16px; border-radius: 8px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between;">
        <div style="font-size: 12px; font-weight: bold; color: #065f46;">
          📄 Dokumen Resmi Siap Cetak (A4 PDF / Cetak Mandiri)
        </div>
        <div>
          <button onclick="window.print()" style="background-color: #059669; color: white; border: none; padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: bold; cursor: pointer; margin-right: 8px;">
            🖨️ Cetak Dokumen Ini
          </button>
          <button onclick="window.close()" style="background-color: #e2e8f0; color: #334155; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: bold; cursor: pointer;">
            Tutup
          </button>
        </div>
      </div>

      <div class="header-kop">
        <h1>${appSettings.organizationName}</h1>
        <h2>${appSettings.ministryName}</h2>
        <p>${appSettings.address}</p>
        <p>Telp: ${appSettings.phone} | Email: ${appSettings.email} | Portal: ${appSettings.portalUrl}</p>
      </div>

      <div class="doc-title">
        <h3>${title}</h3>
      </div>

      <div class="meta-info">
        <div>
          <strong>Periode:</strong> ${params.period} &nbsp;|&nbsp; 
          <strong>Wilayah:</strong> ${params.buildingFilter && params.buildingFilter !== 'ALL' ? params.buildingFilter : 'Semua Gedung & Aula'}
        </div>
        <div>
          <strong>Dicetak Oleh:</strong> ${params.currentUser?.fullName || 'Administrator'} (${params.currentUser?.role || 'Staff'}) &nbsp;|&nbsp; 
          <strong>Tgl:</strong> ${realToday}
        </div>
      </div>

      ${summaryStats.length > 0 ? `<div style="margin-bottom: 12px;">${summaryHtml}</div>` : ''}

      <table>
        <thead>
          <tr>${tableHeaderHtml}</tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>

      <div class="sign-container">
        <div class="sign-box">
          <div>Jakarta, ${formatIndonesianDate(realToday)}</div>
          <div style="font-weight: bold; margin-top: 4px;">Mengetahui / Penanggung Jawab,</div>
          <div class="sign-space"></div>
          <div style="font-weight: bold; text-decoration: underline;">${signatoryFallback.name}</div>
          <div style="color: #64748b; font-size: 9.5px;">${signatoryFallback.role}</div>
          <div style="color: #94a3b8; font-size: 9px; margin-top: 2px;">${signatoryFallback.nip}</div>
        </div>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 400);
        };
      </script>
    </body>
    </html>
  `;

  printOrDownloadHtmlDocument(htmlContent, filename, title);
}
