// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Transaction, Room, ConsolidatedGroupRecord } from '../types';
import { formatIndonesianDate, addDaysToDateStr, getRealTodayDate, formatRupiah, isMeetingFacility } from '../lib/utils';
import { useAppContext } from '../store';
import { findRoomRate, INDONESIAN_BANKS, OFFICIAL_VA_CONFIG } from '../data';
import { downloadDirectInvoicePdf, downloadDirectKwitansiPdf, downloadCombinedInvoiceAndKwitansiPdf, printInvoiceDocument } from '../lib/pdfDownloader';
import { useBodyScrollLock } from '../lib/scrollLock';
import { consolidateGroupTransactions } from '../lib/reportExporter';
import { calculateMeetingRoomPricing } from '../lib/pricingCalculator';
import { KwitansiPrintSheet } from './KwitansiModal';

function angkaKeTerbilang(nilai: number): string {
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

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  tx: Transaction | null;
  room?: Room | null;
  returnToRoomId?: string | null;
  onReturn?: () => void;
  onExtend?: (tx: Transaction) => void;
  onEdit?: (tx: Transaction) => void;
  groupKey?: string;
  groupRecord?: ConsolidatedGroupRecord;
  autoOpenPaymentModal?: boolean;
}

export function InvoiceModal(props: InvoiceModalProps) {
  const { isOpen, tx } = props;
  useBodyScrollLock(Boolean(isOpen));

  // Mark body with has-invoice-open class when open so @media print works directly with Ctrl+P
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('has-invoice-open');
      return () => {
        document.body.classList.remove('has-invoice-open');
      };
    }
  }, [isOpen]);

  if (!isOpen || !tx) {
    return null;
  }

  return <InvoiceModalInner {...props} tx={tx} />;
}

function InvoiceModalInner({ 
  isOpen, 
  onClose, 
  tx, 
  room, 
  returnToRoomId, 
  onReturn,
  onExtend,
  onEdit,
  groupKey,
  groupRecord,
  autoOpenPaymentModal
}: InvoiceModalProps & { tx: Transaction }) {
  const { 
    currentUser, 
    rooms, 
    transactions, 
    openModal, 
    showToast, 
    appSettings, 
    dataStorage, 
    updateAppSettings,
    updateTransaction,
    roomCapacityRates = [],
    meetingRooms = [],
    breakfastMenuItems = []
  } = useAppContext();
  const settings = appSettings || dataStorage.getAppSettings();
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Active Transaction synced with real-time store
  const activeTx = transactions.find(t => t.id === tx.id) || tx;

  // Ref for crisp DOM rendering directly into PDF
  const printableSheetRef = useRef<HTMLDivElement>(null);

  // Default Official Virtual Account & Bank Configuration
  const defaultVaNumber = OFFICIAL_VA_CONFIG.vaNumber;
  const defaultAccountName = OFFICIAL_VA_CONFIG.accountName;

  // Payment Recording State
  const [showPayModal, setShowPayModal] = useState(Boolean(autoOpenPaymentModal));
  const isLunas = activeTx.paymentStatus === 'LUNAS';
  const alreadyPaid = Number(activeTx.paidAmount || activeTx.dpAmount || 0);
  const hasDp = activeTx.paymentStatus === 'DP' || (Boolean(activeTx.dpAmount) && Number(activeTx.dpAmount) > 0) || (alreadyPaid > 0 && !isLunas);

  // Customizable VA / Account Number (defaults to official UPT config)
  const [inputAccountNo, setInputAccountNo] = useState<string>(activeTx.vaNumber || defaultVaNumber);
  const [inputAccountName, setInputAccountName] = useState<string>(activeTx.vaAccountName || defaultAccountName);

  // If already paid DP, payMode must ONLY be 'FULL' (Pelunasan Sisa), no DP choice
  const [payMode, setPayMode] = useState<'FULL' | 'DP'>(hasDp ? 'FULL' : 'FULL');
  const [payMethod, setPayMethod] = useState<'VA_UPT' | 'TRANSFER'>(
    (activeTx.paymentMethod === 'TRANSFER' || activeTx.dpMethod === 'TRANSFER') ? 'TRANSFER' : 'VA_UPT'
  );
  const [selectedBank, setSelectedBank] = useState<string>(activeTx.bankName || 'Bank Mandiri');
  const [customBank, setCustomBank] = useState<string>('');
  const [dpInputValue, setDpInputValue] = useState<string>('');
  const [showInvoicePreview, setShowInvoicePreview] = useState(true);
  const [payDate, setPayDate] = useState(activeTx.paymentDate || getRealTodayDate());
  const [payNote, setPayNote] = useState(activeTx.paymentNote || '');

  // Document Selector Mode: INVOICE, KWITANSI, or BOTH (Default to BOTH for side-by-side view)
  const [activeDocTab, setActiveDocTab] = useState<'INVOICE' | 'KWITANSI' | 'BOTH'>('BOTH');

  useEffect(() => {
    if (activeTx.vaNumber) {
      setInputAccountNo(activeTx.vaNumber);
    }
    if (activeTx.vaAccountName) {
      setInputAccountName(activeTx.vaAccountName);
    }
  }, [activeTx.vaNumber, activeTx.vaAccountName]);

  useEffect(() => {
    if (autoOpenPaymentModal) {
      setShowPayModal(true);
      if (hasDp) {
        setPayMode('FULL');
      }
    }
  }, [autoOpenPaymentModal, hasDp]);

  useEffect(() => {
    if (hasDp) {
      setPayMode('FULL');
    }
  }, [hasDp]);
  const payerName = activeTx.groupName || activeTx.guestName;

  // Consolidate group transactions to perfectly synchronize with ReportsView
  const { rombonganList } = useMemo(() => {
    return consolidateGroupTransactions(transactions, rooms);
  }, [transactions, rooms]);

  const matchedGroup = useMemo(() => {
    if (!tx) return null;
    if (groupRecord) return groupRecord;
    if (groupKey) {
      const found = rombonganList.find(g => g.key === groupKey);
      if (found) return found;
    }
    return rombonganList.find(grp => 
      grp.representativeTx.id === tx.id ||
      (tx.groupId && grp.groupId === tx.groupId) ||
      (tx.groupName && grp.groupName.trim().toLowerCase() === tx.groupName.trim().toLowerCase() && grp.startDate === tx.startDate) ||
      (grp.allRoomNumbers && tx.roomNumber && grp.allRoomNumbers.includes(tx.roomNumber))
    );
  }, [rombonganList, tx, groupKey, groupRecord]);

  const currentRoom = room || rooms.find(r => r.id === tx.roomId) || (meetingRooms.find(m => m.id === tx.roomId) as any) || null;
  const resolvedTargetRoomId = returnToRoomId || (currentRoom ? currentRoom.id : tx?.roomId) || null;
  const canGoBack = Boolean(onReturn || resolvedTargetRoomId);

  const isMeetingTx = (t?: Transaction | null) => {
    if (!t) return false;
    return t.category === 'AULA' ||
           t.building === 'Ruang Pertemuan' || 
           t.building === 'Ruang Pertemuan / Aula' || 
           t.building === 'Gedung Serbaguna (SG)' || 
           t.building === 'Gedung Serbaguna' || 
           isMeetingFacility(t.building || '') || 
           isMeetingFacility(t.roomNumber || '') || 
           Boolean(t.rentType?.toLowerCase().includes('ruangan')) ||
           Boolean(t.rentType?.toLowerCase().includes('serbaguna')) ||
           Boolean(t.includeAula) ||
           Boolean(t.rentAulaName) ||
           Boolean(t.rentAulaId);
  };

  const isAulaMain = isMeetingTx(tx);
  const isSG = isAulaMain && (
    tx.building?.toLowerCase().includes('serbaguna') || 
    tx.roomNumber?.toLowerCase().includes('serbaguna') || 
    Boolean(tx.rentType?.toLowerCase().includes('serbaguna'))
  );
  const aulaDays = isAulaMain && tx.duration >= 24 ? Math.ceil(tx.duration / 24) : 1;
  const checkoutDate = !isAulaMain ? addDaysToDateStr(tx.startDate, tx.duration) : addDaysToDateStr(tx.startDate, aulaDays);

  // Filter all member transactions belonging to this group / reservation
  const memberTransactions = matchedGroup ? matchedGroup.memberTransactions : transactions.filter(t => {
    if (t.id === tx.id) return true;
    if (tx.groupId && t.groupId === tx.groupId) return true;
    if (tx.isGroup && t.isGroup && tx.groupName && tx.groupName.trim().toLowerCase() === (t.groupName || '').trim().toLowerCase() && tx.startDate === t.startDate) return true;
    if (tx.allocatedRoomNumbers && tx.allocatedRoomNumbers.includes(t.roomNumber)) return true;
    return false;
  });

  // Collect all room numbers from this transaction and member transactions
  const roomNumberSet = new Set<string>();
  if (tx.roomNumber && !isMeetingTx(tx)) {
    roomNumberSet.add(tx.roomNumber);
  }
  if (tx.allocatedRoomNumbers && Array.isArray(tx.allocatedRoomNumbers)) {
    tx.allocatedRoomNumbers.forEach(rn => {
      if (rn && !isMeetingFacility(rn)) roomNumberSet.add(rn);
    });
  }
  memberTransactions.forEach(m => {
    if (!isMeetingTx(m) && m.roomNumber) {
      roomNumberSet.add(m.roomNumber);
    }
    if (m.allocatedRoomNumbers && Array.isArray(m.allocatedRoomNumbers)) {
      m.allocatedRoomNumbers.forEach(rn => {
        if (rn && !isMeetingFacility(rn)) roomNumberSet.add(rn);
      });
    }
  });

  const allocatedRoomNumbers = matchedGroup ? matchedGroup.allRoomNumbers : Array.from(roomNumberSet);
  const isGroupBooking = Boolean(
    tx.isGroup || 
    matchedGroup ||
    allocatedRoomNumbers.length > 1 || 
    (tx.totalPax && tx.totalPax > 1) || 
    memberTransactions.length > 1
  );

  // Map detailed room objects
  const detailedAllocatedRooms = allocatedRoomNumbers.map((rNum, idx) => {
    const roomObj = rooms.find(r => r.roomNumber === rNum);
    const memTx = memberTransactions.find(m => m.roomNumber === rNum);
    const parsedCap = roomObj ? (parseInt(String(roomObj.capacity).replace(/\D/g, ''), 10) || 4) : 4;
    
    // Determine floor based on room number format
    const floorMatch = rNum.match(/[-_]?(\d)\d{2}/);
    const floor = floorMatch ? parseInt(floorMatch[1], 10) : (rNum.includes('-1') ? 1 : rNum.includes('-2') ? 2 : 1);

    return {
      index: idx + 1,
      number: rNum,
      roomId: roomObj?.id || memTx?.roomId || `room-${rNum}`,
      building: roomObj?.building || memTx?.building || tx.building,
      floor,
      type: roomObj?.type || memTx?.category || tx.category || 'Kamar Quad (4 Bed)',
      capacity: parsedCap,
      status: memTx?.status || roomObj?.status || tx.status,
      facilities: ['AC Split', 'Kamar Mandi Dalam', 'Water Heater', 'Linen Bersih']
    };
  });

  // Group rooms by building
  const roomsByBuilding = detailedAllocatedRooms.reduce((acc, rm) => {
    if (!acc[rm.building]) {
      acc[rm.building] = [];
    }
    acc[rm.building].push(rm);
    return acc;
  }, {} as Record<string, typeof detailedAllocatedRooms>);

  const uniqueBuildings = Object.keys(roomsByBuilding);
  const totalCapacity = detailedAllocatedRooms.reduce((acc, r) => acc + r.capacity, 0);

  // Check if Aula / Ruang Pertemuan / Gedung Serbaguna is involved
  const linkedAulaTx = memberTransactions.find(m => isMeetingTx(m) || m.includeAula);
  const hasAula = Boolean(
    isAulaMain || 
    tx.includeAula || 
    tx.rentAulaName || 
    linkedAulaTx
  );

  const resolvedAulaName = tx.rentAulaName || (isAulaMain ? tx.roomNumber : linkedAulaTx?.roomNumber) || 'Aula Serbaguna Utama';
  const resolvedAulaSession = tx.rentAulaSession || (linkedAulaTx ? linkedAulaTx.rentAulaSession : null) || 'Sesi Pagi - Siang (08:00 - 16:00 WIB)';
  const resolvedAulaDurationDays = tx.rentAulaDurationDays || (isAulaMain && tx.durationUnit === 'Hari' ? tx.duration : linkedAulaTx?.rentAulaDurationDays) || 1;
  const resolvedAulaDurationHours = tx.rentAulaDuration || (isAulaMain ? tx.duration : linkedAulaTx?.duration) || 8;
  const resolvedAulaBuilding = isAulaMain ? (isSG ? 'Gedung Serbaguna (SG)' : 'Ruang Pertemuan / Aula Utama') : (linkedAulaTx?.building || 'Gedung Serbaguna / Aula UPT');

  // Perhitungan Rincian Harga & Tarif Resmi Operasional (Invoice Pricing Breakdown)
  const pricingDetails = useMemo(() => {
    if (!tx) {
      return {
        roomItems: [],
        meetingRoomItem: null,
        extraBedItem: null,
        cateringItem: null,
        subtotalRooms: 0,
        subtotalMeetingRoom: 0,
        subtotalExtraBed: 0,
        subtotalCatering: 0,
        grandTotal: 0,
        terbilangText: 'Nol Rupiah'
      };
    }

    const nights = Math.max(1, tx.duration || 1);

    // 1. Biaya Sewa Kamar Hunian
    let roomItems: {
      key: string;
      label: string;
      building: string;
      type: string;
      bedType: string;
      roomCount: number;
      roomsList: string[];
      ratePerNight: number;
      nights: number;
      subtotal: number;
    }[] = [];
    let subtotalRooms = 0;

    if (!isAulaMain) {
      const groupMap: Record<string, {
        building: string;
        type: string;
        bedType: string;
        rooms: string[];
        rate: number;
      }> = {};

      const sourceRooms = detailedAllocatedRooms.length > 0 
        ? detailedAllocatedRooms 
        : (tx.roomNumber ? [{
            index: 1,
            number: tx.roomNumber,
            roomId: tx.roomId || 'room-1',
            building: tx.building,
            floor: 1,
            type: currentRoom?.type || tx.category || 'Standar',
            capacity: 4,
            status: tx.status,
            facilities: []
          }] : []);

      sourceRooms.forEach(rm => {
        const rObj = rooms.find(r => r.roomNumber === rm.number) || currentRoom;
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

      Object.entries(groupMap).forEach(([k, g]) => {
        const count = g.rooms.length;
        const lineTotal = count * g.rate * nights;
        subtotalRooms += lineTotal;
        roomItems.push({
          key: k,
          label: `${g.building} - Tipe ${g.type} (${g.bedType})`,
          building: g.building,
          type: g.type,
          bedType: g.bedType,
          roomCount: count,
          roomsList: g.rooms,
          ratePerNight: g.rate,
          nights,
          subtotal: lineTotal
        });
      });
    }

    // 2. Biaya Ruang Pertemuan (Aula / Auditorium / Gedung SG)
    let meetingRoomItem: {
      name: string;
      session: string;
      rate: number;
      durationText: string;
      subtotal: number;
    } | null = null;
    let subtotalMeetingRoom = 0;

    const mrPricing = calculateMeetingRoomPricing(tx, meetingRooms);
    if (mrPricing.isAula) {
      subtotalMeetingRoom = mrPricing.subtotal;
      meetingRoomItem = {
        name: mrPricing.name,
        session: mrPricing.session,
        rate: mrPricing.rate,
        durationText: mrPricing.durationText,
        subtotal: mrPricing.subtotal
      };
    }

    // 3. Biaya Extra Bed
    let extraBedItem: {
      unitCount: number;
      ratePerNight: number;
      nights: number;
      subtotal: number;
    } | null = null;
    let subtotalExtraBed = 0;

    if (tx.extraBed) {
      const bedCount = tx.extraBedCount || 1;
      const rateBed = 100000; // Rp 100.000 / unit / malam
      const totalBed = bedCount * rateBed * nights;
      subtotalExtraBed = totalBed;
      extraBedItem = {
        unitCount: bedCount,
        ratePerNight: rateBed,
        nights,
        subtotal: totalBed
      };
    }

    // 4. Biaya Layanan Konsumsi & Katering
    let cateringItem: {
      packageName: string;
      ratePerPax: number;
      paxCount: number;
      days: number;
      subtotal: number;
    } | null = null;
    let subtotalCatering = 0;

    const hasCateringPkg = tx.cateringPackage && tx.cateringPackage !== 'TIDAK';
    const hasBreakfastOnly = Boolean(tx.breakfast) && !hasCateringPkg;

    if (hasCateringPkg) {
      const pax = tx.cateringPaxCount || tx.breakfastPortions || tx.totalPax || (totalCapacity > 0 ? totalCapacity : 1);
      const days = tx.breakfastDays || nights;
      const mItem = breakfastMenuItems.find(m => m.name === tx.breakfastMenu);
      let ratePerPax = mItem?.price;
      let pkgName = tx.breakfastMenu ? `Katering: ${tx.breakfastMenu}` : 'Katering Sarapan Pagi';
      if (!ratePerPax) {
        if (tx.cateringPackage === 'FULLBOARD') {
          ratePerPax = 120000;
          pkgName = 'Katering Fullboard (3x Makan & 2x Snack)';
        } else if (tx.cateringPackage === 'SNACK_AULA') {
          ratePerPax = 25000;
          pkgName = 'Snack Box Acara Ruang Pertemuan';
        } else {
          ratePerPax = 25000;
        }
      }
      const totalCat = pax * ratePerPax * days;
      subtotalCatering = totalCat;
      cateringItem = {
        packageName: pkgName,
        ratePerPax,
        paxCount: pax,
        days,
        subtotal: totalCat
      };
    } else if (hasBreakfastOnly) {
      const menuItem = breakfastMenuItems.find(m => m.name === tx.breakfastMenu);
      const ratePerPax = menuItem?.price || 30000;
      const portions = tx.breakfastPortions || 1;
      const days = tx.breakfastDays || nights;
      const totalBf = portions * ratePerPax * days;
      subtotalCatering = totalBf;
      cateringItem = {
        packageName: `Sarapan Dapur UPT (${tx.breakfastMenu || 'Menu Reguler'})`,
        ratePerPax,
        paxCount: portions,
        days,
        subtotal: totalBf
      };
    }

    const grandTotal = subtotalRooms + subtotalMeetingRoom + subtotalExtraBed + subtotalCatering;

    return {
      roomItems,
      meetingRoomItem,
      extraBedItem,
      cateringItem,
      subtotalRooms,
      subtotalMeetingRoom,
      subtotalExtraBed,
      subtotalCatering,
      grandTotal,
      terbilangText: angkaKeTerbilang(grandTotal)
    };
  }, [
    tx, 
    detailedAllocatedRooms, 
    rooms, 
    roomCapacityRates, 
    meetingRooms, 
    breakfastMenuItems, 
    isAulaMain, 
    hasAula, 
    resolvedAulaName, 
    resolvedAulaSession, 
    resolvedAulaDurationDays, 
    currentRoom, 
    totalCapacity
  ]);

  const grandTotal = pricingDetails.grandTotal;
  const currentRemaining = Math.max(0, grandTotal - alreadyPaid);

  const defaultDpPreset = Math.round(grandTotal * 0.3);

  const enteredAmount = useMemo(() => {
    if (payMode === 'FULL') {
      return currentRemaining;
    }
    const clean = Number(dpInputValue.replace(/\D/g, ''));
    if (!dpInputValue || isNaN(clean) || clean <= 0) {
      return Math.min(defaultDpPreset, currentRemaining);
    }
    return Math.min(clean, currentRemaining);
  }, [payMode, dpInputValue, currentRemaining, defaultDpPreset]);

  const projectedRemaining = Math.max(0, currentRemaining - enteredAmount);

  // Active Virtual Account & Account Name display
  const activeVaNumber = activeTx.vaNumber || defaultVaNumber;
  const activeVaAccountName = activeTx.vaAccountName || defaultAccountName;

  const handleConfirmPayment = () => {
    const effectiveBank = payMethod === 'TRANSFER'
      ? (selectedBank === 'Bank Lainnya' ? (customBank.trim() || 'Bank Lainnya') : selectedBank)
      : undefined;

    const isPayingFull = hasDp || payMode === 'FULL' || enteredAmount >= currentRemaining;
    const newPaidAmount = isPayingFull ? grandTotal : (alreadyPaid + enteredAmount);
    const newRemaining = Math.max(0, grandTotal - newPaidAmount);
    const newStatus = isPayingFull ? 'LUNAS' : 'DP';

    // Auto generate kwitansiNo if LUNAS
    const [y, m] = (payDate || getRealTodayDate()).split('-');
    const safeId = (activeTx.groupId || activeTx.id).replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
    const generatedKwitansiNo = activeTx.kwitansiNo || `KWT/KHU-UPTAHJ/${y}/${m}/${safeId}`;
    const cleanVa = (inputAccountNo.trim() || defaultVaNumber).replace(/\s+/g, '');
    const effectiveAccountName = inputAccountName.trim() || defaultAccountName;

    const updated: Transaction = {
      ...activeTx,
      paymentStatus: newStatus,
      paidAmount: newPaidAmount,
      remainingAmount: newRemaining,
      paymentMethod: payMethod,
      bankName: effectiveBank,
      paymentDate: payDate,
      paymentNote: payNote,
      vaNumber: cleanVa,
      vaAccountName: effectiveAccountName,
      bankAccountNumber: cleanVa,
      kwitansiNo: isPayingFull ? generatedKwitansiNo : activeTx.kwitansiNo,
      dpAmount: isPayingFull 
        ? (activeTx.dpAmount || (alreadyPaid > 0 ? alreadyPaid : undefined))
        : (alreadyPaid + enteredAmount),
      dpDate: activeTx.dpDate || payDate,
      dpMethod: activeTx.dpMethod || payMethod,
      dpNote: activeTx.dpNote || payNote
    };
    updateTransaction(updated);

    if (isGroupBooking && memberTransactions.length > 0) {
      memberTransactions.forEach(m => {
        if (m.id !== activeTx.id) {
          updateTransaction({
            ...m,
            paymentStatus: newStatus,
            paidAmount: isPayingFull ? (m.paidAmount || undefined) : undefined,
            remainingAmount: newRemaining,
            paymentMethod: payMethod,
            bankName: effectiveBank,
            paymentDate: payDate,
            kwitansiNo: isPayingFull ? generatedKwitansiNo : m.kwitansiNo,
            vaNumber: cleanVa,
            vaAccountName: effectiveAccountName,
            bankAccountNumber: cleanVa
          });
        }
      });
    }

    if (isPayingFull) {
      showToast(`Pelunasan tagihan ${formatRupiah(enteredAmount)} berhasil dicatat LUNAS! Kwitansi resmi kini telah aktif dan siap dicetak.`, 'success');
    } else {
      showToast(`Penyetoran Uang Muka (DP) sebesar ${formatRupiah(enteredAmount)} berhasil dicatat ke invoice! Sisa bayar: ${formatRupiah(newRemaining)}.`, 'success');
    }
    setShowPayModal(false);
  };

  const [showRevertConfirm, setShowRevertConfirm] = useState(false);

  const handleRevertPayment = () => {
    setShowRevertConfirm(true);
  };

  const executeRevertPayment = () => {
    setShowRevertConfirm(false);
    const updated: Transaction = {
      ...activeTx,
      paymentStatus: 'BELUM_LUNAS',
      paidAmount: undefined,
      dpAmount: undefined,
      dpDate: undefined,
      dpMethod: undefined,
      dpNote: undefined,
      remainingAmount: pricingDetails.grandTotal
    };
    updateTransaction(updated);
    if (isGroupBooking && memberTransactions.length > 0) {
      memberTransactions.forEach(m => {
        if (m.id !== activeTx.id) {
          updateTransaction({
            ...m,
            paymentStatus: 'BELUM_LUNAS',
            paidAmount: undefined,
            dpAmount: undefined,
            remainingAmount: undefined
          });
        }
      });
    }
    showToast('Status pembayaran tagihan berhasil direset menjadi Belum Lunas.', 'info');
  };

  const handleGoBack = () => {
    onClose();
    if (onReturn) {
      onReturn();
    } else if (resolvedTargetRoomId) {
      openModal('modalRoomDetail', { roomId: resolvedTargetRoomId });
    }
  };

  const handlePrint = () => {
    if (activeDocTab === 'BOTH') {
      if (!isLunas) {
        showToast('Status Belum Lunas: Mencetak lembar Invoice tagihan resmi. Lembar kwitansi belum diterbitkan sebelum pelunasan.', 'info');
      }
      try {
        window.print();
      } catch {
        printInvoiceDocument();
      }
    } else if (activeDocTab === 'KWITANSI') {
      if (!isLunas) {
        showToast('Status Belum Lunas: Kwitansi resmi belum dapat dicetak sebelum status pembayaran lunas 100%.', 'warning');
        return;
      }
      try {
        document.body.classList.add('printing-kwitansi');
        const handleAfterPrint = () => {
          document.body.classList.remove('printing-kwitansi');
          window.removeEventListener('afterprint', handleAfterPrint);
        };
        window.addEventListener('afterprint', handleAfterPrint);
        window.print();
        setTimeout(() => {
          document.body.classList.remove('printing-kwitansi');
          window.removeEventListener('afterprint', handleAfterPrint);
        }, 12000);
      } catch {
        window.print();
      }
    } else {
      printInvoiceDocument();
    }
  };

  const handleDownloadPdf = async () => {
    try {
      setIsGeneratingPdf(true);
      const [y, m] = (payDate || getRealTodayDate()).split('-');
      const safeId = (activeTx.groupId || activeTx.id).replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
      const autoKwtNo = activeTx.kwitansiNo || (isLunas ? `KWT/KHU-UPTAHJ/${y}/${m}/${safeId}` : `KWT-DP/KHU-UPTAHJ/${y}/${m}/${safeId}`);

      const kwtOptions = {
        room: currentRoom,
        groupKey,
        groupRecord,
        allRooms: rooms,
        memberTransactions,
        paymentMethod: payMethod,
        bankName: selectedBank,
        vaNumber: activeVaNumber,
        vaAccountName: activeVaAccountName,
        bankAccountNumber: activeVaNumber,
        paymentDate: payDate,
        autoKwitansiNo: autoKwtNo,
        treasurerName: 'Hj. Siti Aisyah, S.E.',
        treasurerNip: '19820412 200801 2 004',
        treasurerTitle: 'Bendahara Penerimaan / Kasir',
        paidAmount: isLunas ? pricingDetails.grandTotal : alreadyPaid,
        pricingDetails
      };

      if (activeDocTab === 'BOTH') {
        if (!isLunas) {
          await downloadDirectInvoicePdf(
            activeTx,
            currentRoom,
            currentUser?.fullName || 'Pengelola Sarana & Hunian',
            currentUser?.role || 'Pengelola Sarana & Hunian',
            rooms,
            memberTransactions
          );
          showToast(`Status Belum Lunas: Berkas Invoice #${activeTx.id} berhasil diunduh. Lembar kwitansi resmi belum diterbitkan sebelum pelunasan.`, 'info');
        } else {
          await downloadCombinedInvoiceAndKwitansiPdf(
            activeTx,
            {
              room: currentRoom,
              officerName: currentUser?.fullName || 'Pengelola Sarana & Hunian',
              officerRole: currentUser?.role || 'Pengelola Sarana & Hunian',
              allRooms: rooms,
              memberTransactions
            },
            kwtOptions
          );
          showToast(`Berkas PDF Lengkap (Halaman 1: Invoice A4, Halaman 2: Kwitansi A5 Portrait) berhasil diunduh.`, 'success');
        }
      } else if (activeDocTab === 'KWITANSI') {
        if (!isLunas) {
          showToast('Status Belum Lunas: Kwitansi resmi belum dapat diterbitkan sebelum pembayaran lunas.', 'warning');
          return;
        }
        await downloadDirectKwitansiPdf(activeTx, kwtOptions);
        showToast(`Berkas PDF Kwitansi (${autoKwtNo}) berhasil diunduh resmi.`, 'success');
      } else {
        await downloadDirectInvoicePdf(
          activeTx,
          currentRoom,
          currentUser?.fullName || 'Pengelola Sarana & Hunian',
          currentUser?.role || 'Pengelola Sarana & Hunian',
          rooms,
          memberTransactions
        );
        showToast(`Berkas PDF Invoice #${activeTx.id} berhasil diunduh resmi.`, 'success');
      }
    } catch (err) {
      console.error('Download PDF error:', err);
      handlePrint();
    } finally {
      setTimeout(() => {
        setIsGeneratingPdf(false);
      }, 400);
    }
  };

  return (
    <div 
      id="invoice-modal-overlay" 
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:static print:inset-auto print:overflow-visible print:block print:z-auto"
      onClick={onClose}
    >
      <div 
        id="invoice-modal-card" 
        className={`bg-white rounded-2xl shadow-2xl ${activeDocTab === 'BOTH' ? 'max-w-[96vw] xl:max-w-7xl' : 'max-w-5xl'} w-full overflow-hidden border border-slate-200 flex flex-col max-h-[94vh] my-auto animate-in fade-in zoom-in duration-150 print:max-h-none print:h-auto print:shadow-none print:border-none print:w-full print:overflow-visible print:static print:m-0 print:rounded-none`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header Toolbar */}
        <div className="bg-gradient-to-r from-hajj-800 to-hajj-900 px-6 py-3.5 text-white flex items-center justify-between shrink-0 print:hidden border-b border-gold-500/20">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-gold-500/20 border border-gold-400/40 text-gold-300 flex items-center justify-center font-bold text-sm">
              <i className="fa-solid fa-print"></i>
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Cetak Dokumen: Invoice &amp; Kwitansi Resmi</h3>
              <p className="text-[11px] text-gold-300 font-mono">No. Dokumen: INV-OPR/{tx.id}/{tx.startDate.replace(/-/g, '')}</p>
            </div>
          </div>
          
          <button 
            type="button" 
            onClick={onClose} 
            className="text-white/70 hover:text-white text-lg p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer"
            title="Tutup lembar dokumen"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Document Selection Toolbar (Invoice / Kwitansi / Keduanya) */}
        <div className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5 print:hidden shrink-0">
          <div className="flex items-center space-x-1.5 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveDocTab('INVOICE')}
              className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 cursor-pointer ${
                activeDocTab === 'INVOICE'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <i className="fa-solid fa-file-invoice text-emerald-500"></i>
              <span>Cetak Invoice</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveDocTab('KWITANSI')}
              className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 cursor-pointer ${
                activeDocTab === 'KWITANSI'
                  ? isLunas ? 'bg-emerald-700 text-white shadow-2xs' : 'bg-amber-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <i className="fa-solid fa-receipt text-gold-300"></i>
              <span>Cetak Kwitansi</span>
              {isLunas ? (
                <span className="ml-1 px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-900 text-emerald-200">
                  LUNAS
                </span>
              ) : hasDp ? (
                <span className="ml-1 px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-900 text-amber-200">
                  DP
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => setActiveDocTab('BOTH')}
              className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 cursor-pointer ${
                activeDocTab === 'BOTH'
                  ? 'bg-purple-700 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <i className="fa-solid fa-copy"></i>
              <span>Cetak Keduanya</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            {!isLunas ? (
              <button
                type="button"
                onClick={() => setShowPayModal(true)}
                className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white text-xs font-bold rounded-lg shadow-2xs flex items-center space-x-1.5 cursor-pointer"
                title="Catat Pembayaran atau Pelunasan Sisa"
              >
                <i className="fa-solid fa-wallet text-gold-300"></i>
                <span>{hasDp ? 'Pelunasan Sisa' : 'Catat Bayar / DP'}</span>
              </button>
            ) : (
              <span className="px-3 py-1 rounded-lg text-xs font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1.5">
                <i className="fa-solid fa-circle-check text-emerald-700"></i>
                <span>Status: LUNAS (100%)</span>
              </span>
            )}
          </div>
        </div>

        {/* Modal Content / Printable Document Body */}
        {activeDocTab === 'KWITANSI' ? (
          isLunas ? (
            <div className="overflow-y-auto custom-scrollbar flex-1 bg-white">
              <KwitansiPrintSheet
                tx={activeTx}
                room={currentRoom}
                groupKey={groupKey}
                groupRecord={groupRecord}
                printableRef={printableSheetRef}
              />
            </div>
          ) : (
            <div className="p-8 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-amber-300 space-y-3 m-6">
              <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center mx-auto text-xl font-bold">
                <i className="fa-solid fa-receipt"></i>
              </div>
              <div>
                <h4 className="font-bold text-slate-800 text-sm">Kwitansi Belum Diterbitkan (Status: Belum Bayar)</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Kwitansi resmi diterbitkan setelah ada setoran pembayaran (Uang Muka DP atau Pelunasan). Silakan gunakan lembar Invoice untuk penagihan atau klik tombol di bawah untuk mencatat pembayaran.
                </p>
              </div>
              <div className="flex justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveDocTab('INVOICE')}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  Lihat Lembar Invoice
                </button>
                <button
                  type="button"
                  onClick={() => setShowPayModal(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  Catat Pembayaran Sekarang
                </button>
              </div>
            </div>
          )
        ) : (
          <div className={activeDocTab === 'BOTH' ? "grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 bg-slate-100 overflow-y-auto custom-scrollbar flex-1 print:p-0 print:m-0 print:block print:bg-white" : "overflow-y-auto custom-scrollbar flex-1 bg-white"}>
            {/* If BOTH, wrap in Left Column Card with Header Badge */}
            <div className={activeDocTab === 'BOTH' ? "bg-white rounded-xl shadow-xs border border-slate-300 flex flex-col overflow-hidden print:border-none print:shadow-none print:block" : "w-full"}>
              {activeDocTab === 'BOTH' && (
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-4 py-2.5 flex items-center justify-between text-xs font-bold shrink-0 print:hidden border-b border-slate-700">
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-black shadow-xs">1</span>
                    <span className="tracking-wide">HALAMAN 1: LEMBAR INVOICE RESMI (TAGIHAN)</span>
                  </div>
                  <span className="text-[10px] text-slate-300 font-mono bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">Format A4 Portrait</span>
                </div>
              )}
              <div 
                id="invoice-printable-sheet" 
                ref={printableSheetRef}
                className={activeDocTab === 'BOTH' 
                  ? "p-4 sm:p-5 space-y-3.5 overflow-y-auto max-h-[74vh] print:max-h-none print:overflow-visible print:p-0 text-slate-800 text-[11px] leading-tight bg-white rounded-xl shadow-xs border border-slate-200 max-w-[640px] mx-auto print:max-w-none print:border-none print:shadow-none print:text-xs"
                  : "p-6 sm:p-8 space-y-5 overflow-y-auto custom-scrollbar flex-1 bg-white text-slate-800 print:p-0 print:m-0 print:overflow-visible print:w-full print:block"
                }
              >
          {/* 1. KOP SURAT RESMI KEMENTERIAN HAJI & UMRAH RI */}
          <div className="border-b-2 border-hajj-900 pb-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
            <div className="flex items-center space-x-3.5">
              <div className="shrink-0">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl shadow-sm shrink-0 overflow-hidden ${settings?.appLogo && typeof settings.appLogo === 'string' && (settings.appLogo.startsWith('data:') || settings.appLogo.startsWith('http') || settings.appLogo.startsWith('blob:')) ? 'bg-transparent border-0 shadow-none' : 'bg-hajj-800 text-gold-400 border-2 border-gold-400'}`}>
                  {settings?.appLogo && typeof settings.appLogo === 'string' && (settings.appLogo.startsWith('data:') || settings.appLogo.startsWith('http') || settings.appLogo.startsWith('blob:')) ? (
                    <img src={settings.appLogo} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <i className={`fa-solid ${settings?.appLogo || 'fa-kaaba'}`}></i>
                  )}
                </div>
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black tracking-tight text-hajj-900 leading-tight">
                  {settings.organizationName}
                </h2>
                <p className="text-[10px] uppercase tracking-widest font-black text-gold-600">{settings.ministryName}</p>
                <p className="text-[11px] text-slate-600 font-medium">
                  {settings.subTitle}
                </p>
              </div>
            </div>
            <div className="text-right sm:border-l sm:border-slate-200 sm:pl-4 text-[11px] text-slate-500">
              <p className="font-bold text-slate-700">Lampiran Administrasi Hunian</p>
              <p>{settings.address}</p>
              <p>Email: {settings.email} • Telp: {settings.phone}</p>
            </div>
          </div>

          {/* 2. JUDUL DOKUMEN & METADATA */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">FAKTUR TAGIHAN RESERVASI (INVOICE)</span>
              <h1 className="text-sm sm:text-base font-bold text-slate-900">
                {isGroupBooking 
                  ? 'RINCIAN TAGIHAN & RESERVASI ROMBONGAN' 
                  : isAulaMain 
                  ? 'RINCIAN TAGIHAN SEWA RUANG PERTEMUAN (AULA)' 
                  : 'RINCIAN TAGIHAN & RESERVASI HUNIAN KAMAR'}
              </h1>
            </div>
            <div className="text-left sm:text-right">
              <span className="text-[10px] text-slate-500 block">Jenis Dokumen:</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300">
                <i className="fa-solid fa-file-invoice text-amber-700 mr-1.5 text-[10px]"></i>
                Faktur Tagihan Layanan
              </span>
            </div>
          </div>

          {/* STATUS PEMBAYARAN & GERBANG KWITANSI RESMI */}
          {isLunas ? (
            <div className="bg-gradient-to-r from-emerald-50 via-emerald-100/60 to-emerald-50 border-2 border-emerald-600 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-emerald-950 shadow-2xs">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center text-lg shadow-sm shrink-0 border border-emerald-500">
                  <i className="fa-solid fa-stamp text-gold-300"></i>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-xs sm:text-sm uppercase tracking-wide text-emerald-950">
                      STATUS PEMBAYARAN: TELAH LUNAS
                    </span>
                    <span className="px-2 py-0.5 rounded text-[9.5px] font-black bg-emerald-800 text-white uppercase tracking-wider">
                      TERBAYAR PENUH (LUNAS)
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-900 mt-0.5">
                    Pelunasan senilai <strong>{formatRupiah(pricingDetails.grandTotal)}</strong> telah diterima via <strong>{activeTx.paymentMethod === 'VA_UPT' ? `Virtual Account UPT Asrama Haji Jakarta (${activeVaNumber} a.n. ${activeVaAccountName})` : activeTx.bankName ? `Transfer ${activeTx.bankName} (${activeVaNumber} a.n. ${activeVaAccountName})` : 'Transfer Bank'}</strong> pada <strong>{formatIndonesianDate(activeTx.paymentDate || activeTx.startDate)}</strong>.
                    {activeTx.dpAmount && activeTx.dpAmount > 0 ? (
                      <span className="block text-[10px] text-emerald-800 font-medium mt-0.5">
                        *Riwayat: Uang Muka (DP) {formatRupiah(activeTx.dpAmount)} + Pelunasan Akhir {formatRupiah(pricingDetails.grandTotal - activeTx.dpAmount)}.
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 print:hidden" data-html2canvas-ignore="true">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    openModal('modalKwitansi', {
                      transaction: activeTx,
                      room: currentRoom,
                      groupKey,
                      groupRecord
                    });
                  }}
                  className="px-3.5 py-2 bg-gradient-to-r from-emerald-700 to-teal-800 hover:from-emerald-800 hover:to-teal-900 text-white font-bold rounded-xl text-xs shadow-md flex items-center space-x-1.5 transition cursor-pointer"
                  title="Buka Lembar Kwitansi Resmi Tanda Terima"
                >
                  <i className="fa-solid fa-receipt text-gold-300"></i>
                  <span>Buka Kwitansi Resmi</span>
                </button>
                <button
                  type="button"
                  onClick={handleRevertPayment}
                  className="p-2 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-700 rounded-lg text-xs border border-slate-300 transition cursor-pointer"
                  title="Reset status kembali ke Belum Lunas"
                >
                  <i className="fa-solid fa-rotate-left"></i>
                </button>
              </div>
            </div>
          ) : activeTx.paymentStatus === 'DP' ? (
            <div className="bg-gradient-to-r from-amber-50 via-gold-50/70 to-amber-50 border-2 border-amber-400 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-950 shadow-2xs">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center text-lg shadow-sm shrink-0 border border-amber-500">
                  <i className="fa-solid fa-hand-holding-dollar text-gold-200"></i>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-xs sm:text-sm uppercase tracking-wide text-amber-950">
                      STATUS PEMBAYARAN: TELAH MEMBAYAR UANG MUKA (DP)
                    </span>
                    <span className="px-2 py-0.5 rounded text-[9.5px] font-black bg-amber-600 text-white uppercase tracking-wider">
                      DP TERKONFIRMASI
                    </span>
                    <span className="px-2.5 py-0.5 rounded text-[10px] font-black bg-rose-600 text-white uppercase tracking-wider">
                      SISA BAYAR: {formatRupiah(currentRemaining)}
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-900 mt-0.5">
                    Uang Muka (DP) senilai <strong>{formatRupiah(alreadyPaid)}</strong> telah diterima via <strong>{activeTx.dpMethod === 'VA_UPT' ? `Virtual Account UPT Asrama Haji Jakarta (${activeVaNumber} a.n. ${activeVaAccountName})` : activeTx.bankName ? `Transfer ${activeTx.bankName} (${activeVaNumber} a.n. ${activeVaAccountName})` : (activeTx.dpMethod || 'Virtual Account UPT')}</strong> pada <strong>{formatIndonesianDate(activeTx.dpDate || activeTx.paymentDate || activeTx.startDate)}</strong>. Sisa tagihan yang harus dilunasi adalah <strong>{formatRupiah(currentRemaining)}</strong>.
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5 italic">
                    *Dokumen resmi saat ini adalah Faktur Tagihan (Invoice). Kwitansi resmi akan otomatis diterbitkan setelah sisa tagihan dilunasi penuh.
                  </p>
                </div>
              </div>
              <div className="flex items-center flex-wrap gap-2 shrink-0 print:hidden" data-html2canvas-ignore="true">
                <button
                  type="button"
                  onClick={() => {
                    setPayMode('FULL');
                    setShowPayModal(true);
                  }}
                  className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold rounded-xl text-xs shadow-md flex items-center space-x-1.5 transition cursor-pointer"
                  title="Catat pelunasan sisa tagihan reservasi ini"
                >
                  <i className="fa-solid fa-money-bill-wave text-gold-300"></i>
                  <span>Pelunasan Sisa ({formatRupiah(currentRemaining)})</span>
                </button>
                <button
                  type="button"
                  onClick={handleRevertPayment}
                  className="p-2 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-700 rounded-lg text-xs border border-slate-300 transition cursor-pointer"
                  title="Reset status kembali ke Belum Lunas"
                >
                  <i className="fa-solid fa-rotate-left"></i>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50/90 border-2 border-amber-300 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-950 shadow-2xs">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 border border-amber-300 flex items-center justify-center text-lg shadow-sm shrink-0">
                  <i className="fa-solid fa-file-invoice-dollar"></i>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-xs sm:text-sm uppercase tracking-wide text-amber-950">
                      STATUS PEMBAYARAN: BELUM LUNAS
                    </span>
                    <span className="px-2 py-0.5 rounded text-[9.5px] font-black bg-amber-600 text-white uppercase tracking-wider">
                      MENUNGGU PELUNASAN / DP
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-900 mt-0.5">
                    Lembar ini merupakan Faktur Tagihan (Invoice). <strong>Tersedia opsi pembayaran Uang Muka (DP) via Virtual Account UPT Asrama Haji Jakarta atau Pelunasan Penuh (100%).</strong>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 print:hidden" data-html2canvas-ignore="true">
                <button
                  type="button"
                  onClick={() => setShowPayModal(true)}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold rounded-xl text-xs shadow-md flex items-center space-x-1.5 transition cursor-pointer"
                  title="Catat dan konfirmasi pembayaran tagihan ini (DP atau Pelunasan)"
                >
                  <i className="fa-solid fa-money-bill-wave text-gold-300"></i>
                  <span>Catat Pelunasan Tagihan / DP</span>
                </button>
              </div>
            </div>
          )}

          {/* Cancellation Notice Banner */}
          {tx.status === 'DIBATALKAN' && (
            <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-3.5 flex items-center justify-between gap-3 text-rose-800 text-xs">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-rose-200/80 text-rose-700 flex items-center justify-center text-sm shrink-0">
                  <i className="fa-solid fa-triangle-exclamation"></i>
                </div>
                <div>
                  <h4 className="font-bold text-rose-900 uppercase tracking-wide">PERINGATAN RESMI: RESERVASI INI TELAH DIBATALKAN</h4>
                  <p className="text-[11px] text-rose-700 mt-0.5">
                    {tx.cancelledAt ? `Dibatalkan pada ${formatIndonesianDate(tx.cancelledAt.substring(0, 10))}` : 'Status reservasi dinyatakan batal'}. Ruangan telah dibebaskan dan dokumen ini dicetak untuk arsip riwayat pembatalan operasional.
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-rose-600 text-white font-bold rounded-md text-[10px] uppercase tracking-wider shrink-0">
                BATAL
              </span>
            </div>
          )}

          {/* 3. RINCIAN DATA TAMU & FASILITAS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Box Tamu / Penyewa */}
            <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 space-y-2.5">
              <h4 className="font-bold text-slate-900 border-b border-slate-200 pb-1.5 flex items-center justify-between text-xs">
                <span className="flex items-center space-x-1.5">
                  <i className="fa-solid fa-user-tie text-hajj-700"></i>
                  <span>Data Tamu / Penyewa</span>
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                  isGroupBooking
                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}>
                  {isGroupBooking 
                    ? `ROMBONGAN (${tx.totalPax || totalCapacity || 1} PAX)` 
                    : isAulaMain 
                    ? 'PENYEWA RUANG PERTEMUAN'
                    : 'TAMU INDIVIDU / REGULER'}
                </span>
              </h4>
              <div className="space-y-1.5 text-slate-700">
                <div className="flex justify-between">
                  <span className="text-slate-500">Nama Tamu / Entitas:</span>
                  <span className="font-bold text-slate-900 text-right">{tx.groupName || tx.guestName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Kategori Registrasi:</span>
                  <span className="font-semibold text-slate-800 text-right">
                    {isGroupBooking 
                      ? `Rombongan (${tx.groupType === 'INSTANSI' ? 'Instansi / Lembaga' : tx.groupType === 'JEMAAH_HAJI' ? 'Jemaah Haji Akbar' : 'Tamu Umum Rombongan'})`
                      : isAulaMain
                      ? 'Penyewaan Fasilitas Aula / Ruang Rapat'
                      : 'Individu (1 Kamar / 1 Penyewa)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Kloter / Instansi:</span>
                  <span className="font-semibold text-slate-800 text-right">{tx.kloter || tx.agencyOrDocument || '-'}</span>
                </div>
                {(tx.groupPic || (isGroupBooking && tx.phone)) && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">PIC / Penanggung Jawab:</span>
                    <span className="font-semibold text-slate-800 text-right">
                      {tx.groupPic || tx.guestName} {tx.groupPicPhone ? `(${tx.groupPicPhone})` : ''}
                    </span>
                  </div>
                )}
                {tx.nikKtp && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">NIK / Identitas KTP:</span>
                    <span className="font-mono text-slate-800">{tx.nikKtp}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">No. Kontak / HP:</span>
                  <span className="font-mono text-slate-800">{tx.groupPicPhone || tx.phone || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">ID Registrasi Dokumen:</span>
                  <span className="font-mono text-slate-600">{tx.id}</span>
                </div>
              </div>
            </div>

            {/* Box Fasilitas & Durasi */}
            <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 space-y-2.5">
              <h4 className="font-bold text-slate-900 border-b border-slate-200 pb-1.5 flex items-center justify-between text-xs">
                <span className="flex items-center space-x-1.5">
                  <i className={`fa-solid ${isAulaMain ? 'fa-landmark text-hajj-700' : 'fa-bed text-hajj-700'}`}></i>
                  <span>{isAulaMain ? 'Fasilitas Ruang Pertemuan' : isGroupBooking ? 'Ringkasan Alokasi Gedung & Kamar' : 'Fasilitas Kamar Hunian'}</span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-semibold">
                  {uniqueBuildings.length > 0 ? uniqueBuildings.join(', ') : tx.building}
                </span>
              </h4>
              <div className="space-y-1.5 text-slate-700">
                <div className="flex justify-between items-start gap-2">
                  <span className="text-slate-500 shrink-0">{isAulaMain ? 'Gedung & Ruangan:' : isGroupBooking ? 'Jumlah Gedung & Kamar:' : 'Gedung & Kamar:'}</span>
                  <span className="font-bold text-slate-900 text-right break-words">
                    {isAulaMain 
                      ? `${tx.building} (${tx.roomNumber})`
                      : isGroupBooking 
                      ? `${uniqueBuildings.length} Gedung • ${detailedAllocatedRooms.length} Kamar` 
                      : `${tx.building} - Kamar ${tx.roomNumber}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Kapasitas Maksimal:</span>
                  <span className="font-semibold text-slate-800">
                    {isAulaMain 
                      ? `${currentRoom ? currentRoom.capacity : 250} Pax` 
                      : `${totalCapacity} Orang (${detailedAllocatedRooms.length} Kamar)`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{isAulaMain ? 'Tgl Pelaksanaan:' : 'Tgl Check-In:'}</span>
                  <span className="font-bold text-slate-900">{formatIndonesianDate(tx.startDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{isAulaMain ? 'Estimasi Selesai:' : 'Perkiraan Check-Out:'}</span>
                  <span className="font-bold text-slate-900">{formatIndonesianDate(checkoutDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Durasi Sewa:</span>
                  <span className="font-bold text-hajj-800">
                    {isAulaMain && tx.duration >= 24 ? `${tx.duration / 24} Hari Penuh (${tx.duration} Jam)` : `${tx.duration} ${tx.durationUnit || (isAulaMain ? 'Jam' : 'Malam')}`}
                  </span>
                </div>
                {hasAula && !isAulaMain && (
                  <div className="flex justify-between text-purple-900 font-semibold bg-purple-50 p-1.5 rounded border border-purple-200 text-[11px]">
                    <span className="text-purple-700">Paket Aula:</span>
                    <span>{resolvedAulaName}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4. DATA GEDUNG SAMPAI KAMAR YANG DISEWA */}
          {!isAulaMain && (
            <div className="border border-slate-200 rounded-xl overflow-hidden text-xs space-y-0">
              <div className="bg-slate-800 text-white px-4 py-2.5 font-bold flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <i className="fa-solid fa-building-user text-gold-300"></i>
                  <span>
                    Rincian Alokasi Gedung Sampai Kamar yang Disewa ({detailedAllocatedRooms.length} Kamar)
                  </span>
                </div>
                <span className="text-[10px] bg-slate-700 px-2.5 py-0.5 rounded text-slate-200 font-medium">
                  {uniqueBuildings.length} Wilayah Gedung
                </span>
              </div>

              {/* Ringkasan Per Gedung */}
              <div className="p-3 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                {uniqueBuildings.map(bld => {
                  const bldRooms = roomsByBuilding[bld] || [];
                  const bldCap = bldRooms.reduce((acc, r) => acc + r.capacity, 0);
                  return (
                    <div key={bld} className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs">
                      <div className="flex items-center justify-between text-slate-700 font-bold">
                        <span className="flex items-center gap-1.5 text-hajj-800">
                          <i className="fa-solid fa-hotel text-gold-600 text-xs"></i>
                          <span>{bld}</span>
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                          {bldRooms.length} Kamar
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Kapasitas: <strong className="text-slate-800">{bldCap} Bed / Orang</strong>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">
                        No: {bldRooms.map(r => r.number).join(', ')}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tabel Rinci Kamar per Gedung */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold text-[11px]">
                      <th className="py-2 px-3 w-10 text-center">No</th>
                      <th className="py-2 px-3">Wilayah Gedung & Lantai</th>
                      <th className="py-2 px-3 font-mono">Nomor Kamar</th>
                      <th className="py-2 px-3">Tipe / Fasilitas Ruangan</th>
                      <th className="py-2 px-3 text-center">Kapasitas</th>
                      <th className="py-2 px-3 text-center">Status Alokasi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-800 text-xs">
                    {detailedAllocatedRooms.map((rm) => (
                      <tr key={rm.number} className="hover:bg-slate-50/70 transition">
                        <td className="py-2 px-3 text-center text-slate-400 font-medium">{rm.index}</td>
                        <td className="py-2 px-3 font-medium">
                          <div className="flex items-center gap-1.5 font-bold text-slate-900">
                            <i className="fa-solid fa-hotel text-slate-400 text-[10px]"></i>
                            <span>{rm.building}</span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-normal">Lantai {rm.floor}</span>
                        </td>
                        <td className="py-2 px-3 font-bold text-hajj-800 font-mono text-sm">
                          {rm.number}
                        </td>
                        <td className="py-2 px-3 text-slate-600 text-[11px]">
                          <div className="font-semibold text-slate-800">{rm.type}</div>
                          <div className="text-[10px] text-slate-400">Fasilitas: {rm.facilities.join(', ')}</div>
                        </td>
                        <td className="py-2 px-3 text-center font-semibold">
                          {rm.capacity} Orang
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            rm.status === 'TERISI' 
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                              : rm.status === 'BOOKED'
                              ? 'bg-blue-100 text-blue-800 border border-blue-300'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {rm.status === 'TERISI' ? 'Check-In' : rm.status === 'BOOKED' ? 'Reservasi' : rm.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer Ringkasan Kamar & Gedung */}
              <div className="bg-slate-100/90 px-4 py-2 border-t border-slate-200 flex flex-wrap items-center justify-between text-slate-700 font-medium text-xs">
                <div className="flex items-center space-x-3">
                  <span>Total Kamar: <strong className="text-slate-900">{detailedAllocatedRooms.length} Kamar</strong></span>
                  <span>•</span>
                  <span>Total Kapasitas: <strong className="text-slate-900">{totalCapacity} Orang / Pax</strong></span>
                </div>
                <div className="text-slate-500 text-[11px]">
                  Gedung Terkait: <span className="font-semibold text-slate-800">{uniqueBuildings.join(', ')}</span>
                </div>
              </div>
            </div>
          )}

          {/* 5. FASILITAS SEWA RUANG PERTEMUAN (AULA) - DISESUAIKAN SECARA KHUSUS */}
          {hasAula && (
            <div className="border border-purple-200 rounded-xl overflow-hidden text-xs">
              <div className="bg-purple-900 text-white px-4 py-2.5 font-bold flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <i className="fa-solid fa-landmark text-gold-300"></i>
                  <span>
                    {isAulaMain 
                      ? 'Rincian Sewa Fasilitas Ruang Pertemuan (Aula Utama)' 
                      : 'Fasilitas Ruang Pertemuan (Aula) Rombongan'}
                  </span>
                </div>
                <span className="text-[10px] bg-purple-800 px-2.5 py-0.5 rounded text-purple-200 font-medium">
                  Operasional Gedung Serbaguna
                </span>
              </div>
              <div className="p-4 bg-purple-50/50 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-white rounded-lg border border-purple-200">
                    <span className="text-slate-400 block text-[10px]">Nama Ruang & Gedung:</span>
                    <strong className="text-purple-950 text-sm block mt-0.5">{resolvedAulaName}</strong>
                    <span className="text-[10px] text-purple-700">{resolvedAulaBuilding}</span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-purple-200">
                    <span className="text-slate-400 block text-[10px]">Sesi & Durasi Pelaksanaan:</span>
                    <strong className="text-purple-950 text-xs block mt-0.5">{resolvedAulaSession}</strong>
                    <span className="text-[10px] text-purple-700">Durasi: {resolvedAulaDurationDays} Hari ({resolvedAulaDurationHours} Jam / Sesi)</span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-purple-200">
                    <span className="text-slate-400 block text-[10px]">Kapasitas Peserta Ruangan:</span>
                    <strong className="text-purple-950 text-sm block mt-0.5">250 - 500 Pax</strong>
                    <span className="text-[10px] text-purple-700">Format Teater / Seminar</span>
                  </div>
                </div>

                <div className="p-3 bg-white rounded-lg border border-purple-100 text-purple-900 text-xs space-y-1.5">
                  <span className="font-bold text-purple-950 block text-[11px]">
                    Fasilitas Standard Ruang Pertemuan (Aula):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-700">
                    <div className="flex items-start gap-1.5">
                      <i className="fa-solid fa-volume-high text-purple-600 mt-0.5"></i>
                      <span>Sound System Gedung 5000 Watt, 4 Mic Wireless & 2 Mic Podium</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <i className="fa-solid fa-snowflake text-purple-600 mt-0.5"></i>
                      <span>Air Conditioner (AC) Central & Exhaust Fan Sirkulasi</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <i className="fa-solid fa-chalkboard-user text-purple-600 mt-0.5"></i>
                      <span>Podium Resmi Kementerian, Panggung Utama, dan Meja VIP</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <i className="fa-solid fa-tv text-purple-600 mt-0.5"></i>
                      <span>Layar Proyektor / Screen Display & Akses Listrik Acara</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 6. LAYANAN KONSUMSI & TAMBAHAN */}
          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <div className="bg-slate-100/90 px-4 py-2 font-bold text-slate-800 border-b border-slate-200 flex items-center justify-between">
              <span>Layanan Konsumsi & Fasilitas Tambahan</span>
              <span className="text-[10px] text-slate-500 font-normal">Koperasi & Dapur UPT</span>
            </div>
            <div className="p-4 bg-white">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                  <span className="text-slate-400 block text-[10px]">Paket Konsumsi / Katering:</span>
                  <div className="font-semibold text-slate-800 mt-0.5">
                    {tx.breakfast && tx.cateringPackage && tx.cateringPackage !== 'TIDAK' ? (
                      <span className="text-orange-700 flex items-center gap-1 font-bold">
                        <i className="fa-solid fa-utensils text-orange-600"></i>
                        <span>{tx.cateringPackage} ({tx.cateringPaxCount || tx.breakfastPortions || tx.totalPax || 1} Pack)</span>
                      </span>
                    ) : tx.breakfast ? (
                      <span className="text-emerald-700 flex items-center gap-1 font-bold">
                        <i className="fa-solid fa-circle-check text-emerald-600"></i>
                        <span>{tx.breakfastMenu || 'Sarapan'} ({tx.breakfastPortions || 1} Porsi)</span>
                      </span>
                    ) : (
                      <span className="text-slate-500 inline-flex items-center gap-1">
                        <i className="fa-solid fa-ban text-slate-400"></i>
                        <span>Tidak Pakai Konsumsi (0 Pack)</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                  <span className="text-slate-400 block text-[10px]">Extra Bed / Kasur Tambahan:</span>
                  <div className="font-semibold text-slate-800 mt-0.5">
                    {Boolean(tx.extraBed) ? (
                      <span className="text-indigo-700 flex items-center gap-1 font-bold">
                        <i className="fa-solid fa-circle-check text-indigo-600"></i>
                        <span>+{tx.extraBedCount || 1} Unit Extra Bed</span>
                      </span>
                    ) : (
                      <span className="text-slate-500">Standar Fasilitas Kamar</span>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                  <span className="text-slate-400 block text-[10px]">Format Alokasi Tamu:</span>
                  <div className="font-semibold text-slate-800 mt-0.5">
                    {isGroupBooking 
                      ? `Rombongan (${tx.totalPax || totalCapacity || 1} Pax)` 
                      : (tx.rentType || (isAulaMain ? (isSG ? 'Sewa Gedung Serbaguna (SG)' : 'Sewa Ruang Pertemuan / Aula') : 'Sewa Kamar Individu'))}
                  </div>
                </div>
              </div>

              {tx.notes && (
                <div className="mt-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                  <span className="font-bold block text-[10px] text-amber-800">Catatan Khusus Tamu / Rombongan:</span>
                  <p className="mt-0.5">{tx.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* 6.5. RIWAYAT PENYETORAN UANG MUKA (DP) JIKA ADA */}
          {(hasDp || activeTx.paymentStatus === 'DP') && (
            <div className="p-3.5 bg-gradient-to-r from-amber-50/90 via-gold-50/70 to-amber-50/90 rounded-xl border-2 border-amber-400 space-y-2 text-xs text-amber-950">
              <div className="flex items-center justify-between border-b border-amber-300/80 pb-2">
                <div className="flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-amber-700 text-gold-200 flex items-center justify-center text-xs font-bold shadow-xs">
                    <i className="fa-solid fa-hand-holding-dollar"></i>
                  </span>
                  <span className="font-black text-xs uppercase tracking-wide text-amber-950">
                    RIWAYAT PENYETORAN UANG MUKA (DP) TERDAFTAR
                  </span>
                </div>
                <span className="px-2.5 py-0.5 rounded text-[9.5px] font-black bg-amber-700 text-white uppercase tracking-wider">
                  DP TERVERIFIKASI
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-amber-800">Nominal DP Diterima:</span>
                    <span className="font-mono font-black text-emerald-800 text-xs">{formatRupiah(alreadyPaid)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-amber-800">Tanggal Penyetoran:</span>
                    <span className="font-bold text-slate-800">{formatIndonesianDate(activeTx.dpDate || activeTx.paymentDate || activeTx.startDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-amber-800">Kanal Penyetoran:</span>
                    <span className="font-bold text-slate-800">
                      {activeTx.dpMethod === 'VA_UPT' ? 'Virtual Account UPT Asrama Haji Jakarta' : activeTx.dpMethod || 'Virtual Account UPT Asrama Haji Jakarta'}
                    </span>
                  </div>
                </div>
                <div className="sm:border-l sm:border-amber-300 sm:pl-3 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-rose-700 font-bold">Sisa Tagihan Belum Lunas:</span>
                    <span className="font-mono font-black text-rose-700 text-xs">{formatRupiah(currentRemaining)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">No. Virtual Account:</span>
                    <div className="text-right">
                      <span className="font-mono font-bold text-hajj-900 bg-white px-2 py-0.5 rounded border border-amber-300 text-[10.5px]">
                        {activeVaNumber}
                      </span>
                      <span className="block text-[9.5px] text-slate-700 font-semibold">a.n. {activeVaAccountName}</span>
                    </div>
                  </div>
                  {activeTx.dpNote && (
                    <div className="text-[10px] text-slate-500 italic">
                      Catatan: {activeTx.dpNote}
                    </div>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-amber-900 italic pt-1 border-t border-amber-200 leading-relaxed">
                *Pelunasan sisa tagihan sebesar <strong>{formatRupiah(currentRemaining)}</strong> dapat disetorkan melalui Virtual Account UPT Asrama Haji Jakarta: <strong>{activeVaNumber} (a.n. {activeVaAccountName})</strong> sebelum batas waktu check-out fasilitas.
              </p>
            </div>
          )}

          {/* 7. RINCIAN BIAYA & TARIF RESMI OPERASIONAL (HARGA DETAIL) */}
          <div className="border border-slate-300 rounded-xl overflow-hidden text-xs shadow-xs print:border-slate-400">
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white px-4 py-2.5 font-bold flex flex-wrap items-center justify-between gap-2 border-b border-gold-500/30">
              <div className="flex items-center space-x-2">
                <i className="fa-solid fa-receipt text-gold-300"></i>
                <span className="font-bold text-xs uppercase tracking-wide">
                  Rincian Biaya &amp; Tarif Resmi Operasional (Harga Detail)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-300 font-normal hidden sm:inline">
                  Standar Biaya &amp; Tarif Layanan
                </span>
                <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-gold-300 border border-gold-400/30">
                  RINCIAN FAKTUR TAGIHAN
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold text-[11px]">
                    <th className="py-2.5 px-3 w-10 text-center">No</th>
                    <th className="py-2.5 px-3">Uraian Komponen Biaya / Item Fasilitas</th>
                    <th className="py-2.5 px-3 text-right">Tarif Satuan</th>
                    <th className="py-2.5 px-3 text-center">Volume / Qty</th>
                    <th className="py-2.5 px-3 text-center">Durasi</th>
                    <th className="py-2.5 px-3 text-right">Subtotal Biaya</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-800 text-xs">
                  {/* Rows for Rooms */}
                  {pricingDetails.roomItems.map((item, idx) => (
                    <tr key={item.key} className="hover:bg-slate-50/70 transition">
                      <td className="py-2.5 px-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">{item.label}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Kamar: <span className="font-mono text-slate-700 font-semibold">{item.roomsList.join(', ')}</span> ({item.roomCount} unit kamar)
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                        {formatRupiah(item.ratePerNight)} <span className="text-[10px] text-slate-400">/mlm</span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-medium">
                        {item.roomCount} Kamar
                      </td>
                      <td className="py-2.5 px-3 text-center font-medium">
                        {item.nights} Malam
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {formatRupiah(item.subtotal)}
                      </td>
                    </tr>
                  ))}

                  {/* Row for Meeting Room (Aula) */}
                  {pricingDetails.meetingRoomItem && (
                    <tr className="hover:bg-purple-50/40 transition bg-purple-50/20">
                      <td className="py-2.5 px-3 text-center text-slate-400 font-medium">
                        {pricingDetails.roomItems.length + 1}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-purple-950 flex items-center gap-1.5">
                          <i className="fa-solid fa-landmark text-purple-700 text-[11px]"></i>
                          <span>Sewa Ruang Pertemuan (Aula): {pricingDetails.meetingRoomItem.name}</span>
                        </div>
                        <div className="text-[10px] text-purple-800 mt-0.5">
                          {pricingDetails.meetingRoomItem.session} • Termasuk Sound System, AC Sentral &amp; Kursi
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-purple-950">
                        {formatRupiah(pricingDetails.meetingRoomItem.rate)}
                      </td>
                      <td className="py-2.5 px-3 text-center font-medium text-purple-900">
                        1 Gedung
                      </td>
                      <td className="py-2.5 px-3 text-center font-medium text-purple-900">
                        {pricingDetails.meetingRoomItem.durationText}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-purple-950">
                        {formatRupiah(pricingDetails.meetingRoomItem.subtotal)}
                      </td>
                    </tr>
                  )}

                  {/* Row for Extra Bed */}
                  {pricingDetails.extraBedItem && (
                    <tr className="hover:bg-slate-50/70 transition">
                      <td className="py-2.5 px-3 text-center text-slate-400 font-medium">
                        {pricingDetails.roomItems.length + (pricingDetails.meetingRoomItem ? 1 : 0) + 1}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <i className="fa-solid fa-bed text-indigo-600 text-[11px]"></i>
                          <span>Layanan Extra Bed / Kasur Tambahan</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {tx.extraBedNotes || 'Lengkap dengan sprei, bantal dan selimut steril'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                        {formatRupiah(pricingDetails.extraBedItem.ratePerNight)} <span className="text-[10px] text-slate-400">/unit</span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-medium">
                        {pricingDetails.extraBedItem.unitCount} Unit
                      </td>
                      <td className="py-2.5 px-3 text-center font-medium">
                        {pricingDetails.extraBedItem.nights} Malam
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {formatRupiah(pricingDetails.extraBedItem.subtotal)}
                      </td>
                    </tr>
                  )}

                  {/* Row for Catering / Breakfast */}
                  {pricingDetails.cateringItem && (
                    <tr className="hover:bg-slate-50/70 transition">
                      <td className="py-2.5 px-3 text-center text-slate-400 font-medium">
                        {pricingDetails.roomItems.length + (pricingDetails.meetingRoomItem ? 1 : 0) + (pricingDetails.extraBedItem ? 1 : 0) + 1}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <i className="fa-solid fa-utensils text-orange-600 text-[11px]"></i>
                          <span>Layanan Konsumsi: {pricingDetails.cateringItem.packageName}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Dikelola oleh Koperasi &amp; Tim Dapur UPT Asrama Haji Jakarta
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                        {formatRupiah(pricingDetails.cateringItem.ratePerPax)} <span className="text-[10px] text-slate-400">/pack</span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-medium">
                        {pricingDetails.cateringItem.paxCount} Pack
                      </td>
                      <td className="py-2.5 px-3 text-center font-medium">
                        {pricingDetails.cateringItem.days} Hari
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {formatRupiah(pricingDetails.cateringItem.subtotal)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Total Summary Footer */}
            <div className="bg-slate-50 p-3 sm:p-4 border-t-2 border-slate-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                {/* Left: Terbilang & Catatan */}
                <div className="space-y-1.5 border-b md:border-b-0 md:border-r border-slate-200 pb-3 md:pb-0 md:pr-4">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                    Terbilang Resmi:
                  </span>
                  <p className="text-xs sm:text-sm font-bold text-slate-800 italic bg-white p-2 rounded-lg border border-slate-200">
                    "{pricingDetails.terbilangText}"
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                    *Tarif resmi mengacu pada Standar Biaya Masukan UPT Asrama Haji Jakarta. Bebas biaya tambahan tersembunyi.
                  </p>
                </div>

                {/* Right: Rekap Subtotal & Grand Total */}
                <div className="space-y-1.5 text-xs text-slate-700">
                  {pricingDetails.subtotalRooms > 0 && (
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-500">Subtotal Sewa Kamar Hunian:</span>
                      <span className="font-mono font-bold text-slate-800">{formatRupiah(pricingDetails.subtotalRooms)}</span>
                    </div>
                  )}
                  {pricingDetails.subtotalMeetingRoom > 0 && (
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-500">Subtotal Sewa Ruang Pertemuan (Aula):</span>
                      <span className="font-mono font-bold text-purple-900">{formatRupiah(pricingDetails.subtotalMeetingRoom)}</span>
                    </div>
                  )}
                  {pricingDetails.subtotalExtraBed > 0 && (
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-500">Subtotal Layanan Extra Bed:</span>
                      <span className="font-mono font-bold text-indigo-900">{formatRupiah(pricingDetails.subtotalExtraBed)}</span>
                    </div>
                  )}
                  {pricingDetails.subtotalCatering > 0 && (
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-500">Subtotal Layanan Konsumsi &amp; Katering:</span>
                      <span className="font-mono font-bold text-orange-900">{formatRupiah(pricingDetails.subtotalCatering)}</span>
                    </div>
                  )}
                  <div className="pt-2 border-t-2 border-slate-300 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-xs sm:text-sm font-black text-slate-900 block uppercase">
                          TOTAL TAGIHAN FAKTUR (INVOICE):
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          *Total nilai bruto pemakaian fasilitas &amp; layanan operasional.
                        </span>
                      </div>
                      <span className="text-base sm:text-lg font-black font-mono text-slate-900">
                        {formatRupiah(pricingDetails.grandTotal)}
                      </span>
                    </div>

                    {alreadyPaid > 0 && !isLunas && (
                      <>
                        <div className="flex justify-between items-center text-xs bg-amber-50 p-2.5 rounded-lg border border-amber-300 text-amber-950 font-medium">
                          <span>
                            <i className="fa-solid fa-circle-check text-amber-600 mr-1.5"></i>
                            Telah Disetor Uang Muka (DP) ({activeTx.dpMethod === 'VA_UPT' ? 'Virtual Account UPT' : activeTx.bankName ? `Transfer ${activeTx.bankName}` : (activeTx.dpMethod || 'Virtual Account UPT')}):
                          </span>
                          <span className="font-mono font-bold text-amber-900">
                            - {formatRupiah(alreadyPaid)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center p-3 rounded-xl border-2 border-rose-500 bg-rose-50 text-rose-950 shadow-xs">
                          <div>
                            <span className="text-xs sm:text-sm font-black block uppercase tracking-wide text-rose-900">
                              SISA TAGIHAN YANG HARUS DILUNASI:
                            </span>
                            <span className="text-[10px] text-rose-700 block">
                              *Wajib diselesaikan sebelum batas waktu check-out fasilitas.
                            </span>
                            <span className="text-[10px] text-slate-600 italic block mt-0.5">
                              Terbilang Sisa: "#{angkaKeTerbilang(currentRemaining)}#"
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-base sm:text-xl font-black font-mono text-rose-700 block">
                              {formatRupiah(currentRemaining)}
                            </span>
                            <span className="text-[9.5px] font-mono font-bold text-hajj-900 bg-white px-1.5 py-0.5 rounded border border-amber-300 inline-block mt-0.5">
                              VA: {activeVaNumber} (a.n. {activeVaAccountName})
                            </span>
                          </div>
                        </div>
                      </>
                    )}

                    {isLunas && (
                      <div className="flex justify-between items-center text-xs bg-emerald-50 p-2 rounded-lg border border-emerald-300 text-emerald-950 font-bold">
                        <span className="flex items-center gap-1.5">
                          <i className="fa-solid fa-stamp text-emerald-700 text-sm"></i>
                          <span>STATUS PELUNASAN:</span>
                        </span>
                        <span className="font-mono text-emerald-800 text-sm font-black">
                          LUNAS (SISA TAGIHAN: Rp 0)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 8. KETENTUAN DAN TATA TERTIB */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 space-y-1">
            <span className="font-bold text-slate-800 block text-xs">Ketentuan &amp; Tata Tertib Operasional UPT Asrama Haji:</span>
            <ul className="list-disc list-inside space-y-0.5 text-[10px] text-slate-500">
              <li>Waktu standar Check-In pukul 14:00 WIB dan batas waktu Check-Out pukul 12:00 WIB.</li>
              <li>Penyewa wajib menjaga kebersihan, ketertiban, dan keutuhan fasilitas gedung, kamar, dan ruang pertemuan.</li>
              <li>Kehilangan kunci atau kerusakan inventaris akan diselesaikan sesuai SOP pengelola UPT Asrama Haji Jakarta.</li>
            </ul>
          </div>

          {/* 8. KOLOM TANDA TANGAN RESMI (2 PIHAK: PENYEWA & PENGELOLA SARANA & HUNIAN) */}
          <div className="pt-12 mt-10 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 gap-8 text-center text-xs text-slate-700 max-w-2xl mx-auto">
            <div>
              <p className="text-slate-500 font-medium">Penyewa / Penanggung Jawab,</p>
              <div className="h-16 flex items-end justify-center">
                <div className="w-52 border-b border-slate-400 font-bold text-slate-900 pb-1 truncate">
                  {tx.groupPic || tx.guestName}
                </div>
              </div>
            </div>

            <div>
              <p className="text-slate-500 font-medium">
                Jakarta, {formatIndonesianDate(getRealTodayDate())}
              </p>
              <p className="text-slate-500 font-medium">Pengelola Sarana &amp; Hunian,</p>
              <div className="h-11 flex items-end justify-center">
                <div className="w-52 border-b border-slate-400 font-bold text-slate-900 pb-1 truncate">
                  {currentUser?.fullName || 'Pengelola Sarana & Hunian'}
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                {currentUser?.role || 'Pengelola Sarana & Hunian'} • UPT Asrama Haji Jakarta
              </p>
            </div>
          </div>
        </div>
            </div>

            {/* If BOTH, render Right Column Card for Kwitansi */}
            {activeDocTab === 'BOTH' && (
              <div className={`bg-white rounded-xl shadow-xs border border-slate-300 flex flex-col overflow-hidden print:border-none print:shadow-none ${!isLunas ? 'print:hidden' : 'print:block print:break-before-page'}`}>
                <div className="bg-gradient-to-r from-hajj-900 to-hajj-800 text-gold-300 px-4 py-2.5 flex items-center justify-between text-xs font-bold shrink-0 print:hidden border-b border-gold-500/30">
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-gold-500 text-hajj-950 flex items-center justify-center text-[10px] font-black shadow-xs">2</span>
                    <span className="tracking-wide text-white">HALAMAN 2: LEMBAR KWITANSI RESMI (TANDA TERIMA)</span>
                  </div>
                  <span className="text-[10px] text-gold-400 font-mono bg-hajj-950/80 px-2 py-0.5 rounded border border-gold-500/30">Format A5 Portrait</span>
                </div>
                <div className="p-2 sm:p-3 overflow-y-auto max-h-[74vh] custom-scrollbar print:max-h-none print:overflow-visible print:p-0 bg-slate-50/50">
                  {isLunas ? (
                    <KwitansiPrintSheet
                      tx={activeTx}
                      room={currentRoom}
                      groupKey={groupKey}
                      groupRecord={groupRecord}
                      compact={true}
                    />
                  ) : (
                    <div className="p-6 sm:p-8 text-center bg-white rounded-xl border-2 border-dashed border-amber-300 space-y-3.5 m-2 shadow-2xs print:hidden">
                      <div className="w-14 h-14 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto text-2xl shadow-inner border border-amber-200">
                        <i className="fa-solid fa-receipt"></i>
                      </div>
                      <div className="space-y-1">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200">
                          Status: Belum Lunas
                        </span>
                        <h4 className="font-bold text-slate-800 text-sm">
                          Lembar Kwitansi Resmi Belum Diterbitkan
                        </h4>
                        <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                          Dokumen kwitansi resmi hanya diterbitkan setelah pembayaran lunas 100%. Untuk transaksi ini, lembar Invoice (Halaman 1) dapat digunakan untuk penagihan administrasi.
                        </p>
                      </div>
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => setShowPayModal(true)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer inline-flex items-center space-x-1.5 transition"
                        >
                          <i className="fa-solid fa-wallet text-gold-300"></i>
                          <span>Catat Pelunasan Sekarang</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

      {/* Modal Footer Actions */}
      <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0 print:hidden">
        {canGoBack ? (
          <button
            type="button"
            onClick={handleGoBack}
            className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-lg text-xs transition flex items-center space-x-1.5 cursor-pointer border border-slate-300"
            title="Kembali ke rincian kamar sebelumnya"
          >
            <i className="fa-solid fa-arrow-left text-slate-500 text-[11px]"></i>
            <span>Kembali ke Rincian</span>
          </button>
        ) : (
          <div className="flex items-center space-x-2 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Dokumen Administrasi Resmi UPT Asrama Haji</span>
          </div>
        )}

        <div className="flex items-center flex-wrap gap-2">
          {onExtend && tx.status === 'TERISI' && (
            <button
              type="button"
              onClick={() => onExtend(tx)}
              className="px-3 py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 font-semibold rounded-lg text-xs border border-teal-200 transition flex items-center space-x-1.5 cursor-pointer"
              title="Perpanjang durasi hunian"
            >
              <i className="fa-solid fa-clock-rotate-left text-teal-600"></i>
              <span>Perpanjang</span>
            </button>
          )}

          {onEdit && tx.status === 'BOOKED' && (
            <button
              type="button"
              onClick={() => onEdit(tx)}
              className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold rounded-lg text-xs border border-amber-200 transition flex items-center space-x-1.5 cursor-pointer"
              title="Sesuaikan data reservasi"
            >
              <i className="fa-solid fa-pen-to-square text-amber-600"></i>
              <span>Ubah Reservasi</span>
            </button>
          )}

            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 bg-slate-700 hover:bg-slate-800 text-white font-bold rounded-lg text-xs shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
              title="Cetak langsung dokumen"
            >
              <i className="fa-solid fa-print"></i>
              <span>Cetak Dokumen</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="px-4 py-2 bg-hajj-700 hover:bg-hajj-800 disabled:bg-slate-400 text-white font-bold rounded-lg text-xs shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
              title="Unduh berkas PDF resmi ke perangkat"
            >
              {isGeneratingPdf ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin text-gold-300"></i>
                  <span>Menyiapkan PDF...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-file-pdf text-gold-300"></i>
                  <span>Unduh File PDF</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg text-xs transition cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>

      {/* MODAL DIALOG CATAT PELUNASAN TAGIHAN & UANG MUKA (DP) */}
      {showPayModal && (
        <div 
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => setShowPayModal(false)}
        >
          <div 
            className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 my-auto animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* Header Popup */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-hajj-800 text-gold-400 flex items-center justify-center font-bold text-base shadow-xs border border-gold-400/40">
                  <i className="fa-solid fa-money-bill-transfer"></i>
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-slate-900">
                    Catat Pelunasan Tagihan &amp; Uang Muka (DP)
                  </h3>
                  <p className="text-[10.5px] text-slate-500 font-mono">
                    No. Faktur: INV-OPR/{activeTx.id} • {payerName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPayModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg text-base cursor-pointer hover:bg-slate-100 transition"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* 1. TINJAUAN INVOICE TERLEBIH DAHULU (INVOICE PREVIEW ACCORDION) */}
            <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden text-xs">
              <div className="p-3 bg-gradient-to-r from-hajj-50 via-gold-50/40 to-hajj-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center space-x-2 font-bold text-slate-800">
                  <i className="fa-solid fa-file-invoice text-hajj-700"></i>
                  <span>Tinjauan Rincian Tagihan Invoice Terlebih Dahulu</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInvoicePreview(prev => !prev)}
                  className="text-[11px] text-hajj-800 hover:text-hajj-950 font-bold flex items-center space-x-1 cursor-pointer bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs"
                >
                  <span>{showInvoicePreview ? 'Sembunyikan' : 'Lihat Rincian Item'}</span>
                  <i className={`fa-solid fa-chevron-down transition-transform ${showInvoicePreview ? 'rotate-180' : ''}`}></i>
                </button>
              </div>

              {/* Summary Strip (Always Visible) */}
              <div className="p-3.5 space-y-2 text-[11px]">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Nama Tamu / Entitas:</span>
                  <span className="font-bold text-slate-900 uppercase">{payerName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Fasilitas &amp; Periode:</span>
                  <span className="font-semibold text-slate-800">
                    {tx.building} {tx.roomNumber ? `(${tx.roomNumber})` : ''} • {tx.duration} {tx.durationUnit || (isAulaMain ? 'Jam' : 'Malam')}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-200">
                  <span className="text-slate-700 font-bold">Total Nilai Tagihan (Gross):</span>
                  <span className="font-mono font-black text-slate-900 text-xs sm:text-sm">
                    {formatRupiah(grandTotal)}
                  </span>
                </div>

                {/* Status Pembayaran Saat Ini & Riwayat DP */}
                {alreadyPaid > 0 ? (
                  <div className="p-2.5 rounded-lg bg-amber-50/90 border border-amber-300 space-y-1">
                    <div className="flex justify-between items-center text-amber-950 font-bold">
                      <span className="flex items-center gap-1">
                        <i className="fa-solid fa-circle-check text-amber-600"></i>
                        <span>Uang Muka (DP) Telah Diterima:</span>
                      </span>
                      <span className="font-mono text-emerald-800">
                        {formatRupiah(alreadyPaid)}
                      </span>
                    </div>
                    <div className="text-[10px] text-amber-900 flex justify-between">
                      <span>Kanal Setoran DP:</span>
                      <span className="font-semibold">{activeTx.dpMethod === 'VA_UPT' ? 'Virtual Account UPT Asrama Haji Jakarta' : activeTx.dpMethod || 'Virtual Account UPT'}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1.5 border-t border-amber-200 text-rose-700 font-bold">
                      <span className="uppercase text-[10.5px]">Sisa Bayar yang Harus Dilunasi:</span>
                      <span className="font-mono font-black text-xs sm:text-sm bg-rose-100 text-rose-800 px-2 py-0.5 rounded border border-rose-300">
                        {formatRupiah(currentRemaining)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center pt-1 border-t border-slate-200 text-rose-700 font-bold">
                    <span>Sisa Tagihan yang Belum Terbayar:</span>
                    <span className="font-mono font-black text-xs sm:text-sm">
                      {formatRupiah(currentRemaining)}
                    </span>
                  </div>
                )}
              </div>

              {/* Detailed Breakdown Item (Collapsible) */}
              {showInvoicePreview && (
                <div className="p-3 bg-white border-t border-slate-200 space-y-1.5 text-[10.5px] text-slate-600 animate-in fade-in duration-100">
                  <p className="font-bold text-slate-700 text-[10px] uppercase tracking-wider mb-1">Rincian Komponen Biaya Invoice:</p>
                  {pricingDetails.roomItems.length > 0 && (
                    <div className="flex justify-between">
                      <span>• Sewa Kamar Hunian ({pricingDetails.roomItems.length} kelompok kamar):</span>
                      <span className="font-mono font-semibold text-slate-800">{formatRupiah(pricingDetails.subtotalRooms)}</span>
                    </div>
                  )}
                  {pricingDetails.subtotalMeetingRoom > 0 && (
                    <div className="flex justify-between text-purple-900">
                      <span>• Sewa Ruang Pertemuan (Aula):</span>
                      <span className="font-mono font-semibold">{formatRupiah(pricingDetails.subtotalMeetingRoom)}</span>
                    </div>
                  )}
                  {pricingDetails.subtotalExtraBed > 0 && (
                    <div className="flex justify-between text-indigo-900">
                      <span>• Layanan Extra Bed:</span>
                      <span className="font-mono font-semibold">{formatRupiah(pricingDetails.subtotalExtraBed)}</span>
                    </div>
                  )}
                  {pricingDetails.subtotalCatering > 0 && (
                    <div className="flex justify-between text-orange-900">
                      <span>• Layanan Konsumsi &amp; Katering:</span>
                      <span className="font-mono font-semibold">{formatRupiah(pricingDetails.subtotalCatering)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2. PILIHAN TIPE PEMBAYARAN: PELUNASAN PENUH ATAU UANG MUKA (DP) */}
            {hasDp ? (
              <div className="p-3.5 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 rounded-xl border-2 border-emerald-500 space-y-1.5 animate-in fade-in duration-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 rounded-md bg-emerald-600 text-white flex items-center justify-center text-xs font-black shadow-xs">
                      <i className="fa-solid fa-check-double"></i>
                    </div>
                    <span className="font-black text-xs text-emerald-950 uppercase tracking-wide">
                      Tahap Pelunasan Sisa Tagihan (100% LUNAS)
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[9.5px] font-black bg-emerald-700 text-white uppercase tracking-wider">
                    Pelunasan Akhir
                  </span>
                </div>
                <p className="text-[11px] text-emerald-900 leading-relaxed">
                  Uang Muka (DP) senilai <strong>{formatRupiah(alreadyPaid)}</strong> telah tercatat pada faktur ini. Penyetoran ini akan langsung <strong>melunasi sisa tagihan</strong> menjadi Lunas 100%. <em>(Opsi DP dinonaktifkan karena reservasi ini telah masuk tahap pelunasan sisa)</em>.
                </p>
                <div className="flex justify-between items-center pt-1.5 border-t border-emerald-200">
                  <span className="text-slate-700 text-xs font-bold">Total Sisa Tagihan yang Dilunasi:</span>
                  <span className="font-mono text-sm sm:text-base font-black text-emerald-800 bg-white px-2.5 py-0.5 rounded-lg border border-emerald-300">
                    {formatRupiah(currentRemaining)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block font-bold text-xs text-slate-700">
                  Pilih Jenis Penyetoran <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayMode('FULL')}
                    className={`p-2.5 rounded-xl border-2 text-left flex flex-col justify-between transition cursor-pointer ${
                      payMode === 'FULL'
                        ? 'border-emerald-600 bg-emerald-50/80 text-emerald-950 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs">Pelunasan Penuh</span>
                      <i className={`fa-solid ${payMode === 'FULL' ? 'fa-circle-check text-emerald-600' : 'fa-circle text-slate-300'}`}></i>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Bayar penuh 100%
                    </span>
                    <span className="font-mono font-bold text-emerald-800 text-xs mt-1">
                      {formatRupiah(grandTotal)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPayMode('DP')}
                    className={`p-2.5 rounded-xl border-2 text-left flex flex-col justify-between transition cursor-pointer ${
                      payMode === 'DP'
                        ? 'border-amber-500 bg-amber-50/80 text-amber-950 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs">Uang Muka (DP)</span>
                      <i className={`fa-solid ${payMode === 'DP' ? 'fa-circle-check text-amber-600' : 'fa-circle text-slate-300'}`}></i>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Setor uang muka bertahap
                    </span>
                    <span className="font-mono font-bold text-amber-900 text-xs mt-1">
                      Nominal Fleksibel
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* 3. INPUT NOMINAL PEMBAYARAN JIKA MEMILIH DP (HANYA MUNCUL JIKA BELUM DP) */}
            {!hasDp && payMode === 'DP' && (
              <div className="space-y-2 p-3 bg-amber-50/50 rounded-xl border border-amber-200 animate-in fade-in duration-150 text-xs">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-amber-950">
                    Tentukan Nominal DP yang Disetor:
                  </label>
                  <span className="text-[10px] text-amber-800">
                    Maks: {formatRupiah(currentRemaining)}
                  </span>
                </div>

                {/* Preset DP Buttons */}
                <div className="flex gap-1.5">
                  {[
                    { label: '20%', pct: 0.2 },
                    { label: '30%', pct: 0.3 },
                    { label: '50%', pct: 0.5 },
                    { label: '70%', pct: 0.7 }
                  ].map(preset => {
                    const presetVal = Math.round(grandTotal * preset.pct);
                    const safeVal = Math.min(presetVal, currentRemaining);
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setDpInputValue(String(safeVal))}
                        className="flex-1 py-1 bg-white hover:bg-amber-100 border border-amber-300 rounded-lg text-[10.5px] font-bold text-amber-900 transition cursor-pointer"
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                {/* Custom DP Input */}
                <div>
                  <div className="relative">
                    <span className="absolute left-3 top-2 font-bold text-slate-400">Rp</span>
                    <input
                      type="text"
                      value={dpInputValue ? Number(dpInputValue.replace(/\D/g, '')).toLocaleString('id-ID') : ''}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '');
                        setDpInputValue(raw);
                      }}
                      placeholder={`Contoh: ${(Math.round(grandTotal * 0.3)).toLocaleString('id-ID')}`}
                      className="w-full pl-10 pr-3 py-2 bg-white border border-amber-300 rounded-lg text-slate-900 font-mono font-bold focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                    />
                  </div>
                </div>

                {/* Live DP Calculation Card */}
                <div className="bg-white p-2.5 rounded-lg border border-amber-200 text-[11px] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Nominal DP Disetor Sekarang:</span>
                    <span className="font-mono font-bold text-emerald-700">{formatRupiah(enteredAmount)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-1">
                    <span className="text-slate-700 font-bold">Sisa Tagihan Setelah Pembayaran Ini:</span>
                    <span className="font-mono font-black text-rose-700">{formatRupiah(projectedRemaining)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 4. KANAL & METODE PENYETORAN */}
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Kanal / Metode Penyetoran <span className="text-rose-500">*</span>
                </label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-semibold focus:ring-2 focus:ring-hajj-700 focus:bg-white outline-none cursor-pointer"
                >
                  <option value="VA_UPT">Virtual Account UPT Asrama Haji Jakarta (Default: {defaultVaNumber} a.n. {defaultAccountName})</option>
                  <option value="TRANSFER">Transfer Bank (Pilihan Bank Seluruh Indonesia)</option>
                </select>
              </div>

              {/* VIRTUAL ACCOUNT BOX DISPLAY (JIKA METODE VA_UPT DIPILIH) */}
              {payMethod === 'VA_UPT' && (
                <div className="p-3 bg-gradient-to-r from-hajj-50 via-gold-50/40 to-hajj-50 border-2 border-gold-400 rounded-xl space-y-2.5 text-xs animate-in fade-in duration-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded bg-hajj-800 text-gold-400 flex items-center justify-center text-xs font-bold">
                        <i className="fa-solid fa-building-columns"></i>
                      </div>
                      <span className="font-black text-hajj-950 uppercase tracking-wide text-[11px]">
                        Virtual Account UPT Asrama Haji Jakarta
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[9.5px] font-black bg-gold-500 text-slate-950 border border-gold-400">
                      BSI &amp; Mandiri
                    </span>
                  </div>

                  <div className="space-y-2 bg-white p-2.5 rounded-lg border border-gold-300">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] text-slate-600 font-bold uppercase tracking-wider block">
                          Nomor Virtual Account:
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setInputAccountNo(defaultVaNumber);
                            setInputAccountName(defaultAccountName);
                            showToast(`Nomor VA direset ke default resmi (${defaultVaNumber}).`, 'info');
                          }}
                          className="text-[10px] font-bold text-hajj-700 hover:text-hajj-900 underline flex items-center gap-1 cursor-pointer"
                          title="Gunakan nomor VA resmi default UPT"
                        >
                          <i className="fa-solid fa-rotate-left text-[9px]"></i>
                          <span>Gunakan Default ({defaultVaNumber})</span>
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={inputAccountNo}
                          onChange={(e) => setInputAccountNo(e.target.value)}
                          placeholder={`Nomor VA (default: ${defaultVaNumber})`}
                          className="flex-1 px-3 py-1.5 bg-slate-50 border border-gold-400 rounded-lg text-slate-900 font-mono font-black text-sm tracking-wider focus:ring-2 focus:ring-hajj-700 focus:bg-white outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(inputAccountNo.trim() || defaultVaNumber);
                            showToast(`Nomor VA ${inputAccountNo.trim() || defaultVaNumber} berhasil disalin!`, 'info');
                          }}
                          className="px-3 py-1.5 bg-hajj-50 hover:bg-hajj-100 text-hajj-800 rounded-lg font-bold text-xs border border-hajj-200 transition flex items-center space-x-1 cursor-pointer shrink-0"
                          title="Salin nomor Virtual Account"
                        >
                          <i className="fa-solid fa-copy"></i>
                          <span>Salin</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-600 font-bold uppercase tracking-wider block mb-1">
                        Atas Nama (A.n.) Rekening / VA:
                      </label>
                      <input
                        type="text"
                        value={inputAccountName}
                        onChange={(e) => setInputAccountName(e.target.value)}
                        placeholder={`Atas Nama (default: ${defaultAccountName})`}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-semibold text-xs focus:ring-2 focus:ring-hajj-700 focus:bg-white outline-none"
                      />
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-500 italic leading-relaxed">
                    *Pilihan default adalah nomor Virtual Account resmi UPT Asrama Haji Jakarta: <strong>{defaultVaNumber}</strong> (a.n. {defaultAccountName}). Anda dapat mengedit atau mengisi nomor VA kustom di atas jika diperlukan.
                  </p>
                </div>
              )}

              {/* TRANSFER BANK BOX DISPLAY (JIKA METODE TRANSFER DIPILIH) */}
              {payMethod === 'TRANSFER' && (
                <div className="p-3 bg-blue-50/70 border-2 border-blue-400 rounded-xl space-y-2.5 text-xs animate-in fade-in duration-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded bg-blue-800 text-white flex items-center justify-center text-xs font-bold">
                        <i className="fa-solid fa-building-columns"></i>
                      </div>
                      <span className="font-black text-blue-950 uppercase tracking-wide text-[11px]">
                        Transfer Bank (Bank Seluruh Indonesia)
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[9.5px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                      Giro / Rekening
                    </span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Pilih Bank Tujuan Transfer:
                    </label>
                    <select
                      value={selectedBank}
                      onChange={(e) => setSelectedBank(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-blue-300 rounded-lg text-slate-900 font-semibold focus:ring-2 focus:ring-blue-600 outline-none cursor-pointer"
                    >
                      {INDONESIAN_BANKS.map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>

                  {selectedBank === 'Bank Lainnya' && (
                    <div>
                      <input
                        type="text"
                        value={customBank}
                        onChange={(e) => setCustomBank(e.target.value)}
                        placeholder="Ketik nama bank lainnya..."
                        className="w-full px-3 py-1.5 bg-white border border-blue-300 rounded-lg text-slate-900 font-semibold focus:ring-2 focus:ring-blue-600 outline-none text-xs"
                      />
                    </div>
                  )}

                  <div className="space-y-2 bg-white p-2.5 rounded-lg border border-blue-300">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] text-slate-600 font-bold uppercase tracking-wider block">
                          Nomor Rekening Tujuan Transfer:
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setInputAccountNo(defaultVaNumber);
                            setInputAccountName(defaultAccountName);
                            showToast(`Nomor rekening direset ke default (${defaultVaNumber}).`, 'info');
                          }}
                          className="text-[10px] font-bold text-blue-700 hover:text-blue-900 underline flex items-center gap-1 cursor-pointer"
                          title="Gunakan nomor rekening default resmi"
                        >
                          <i className="fa-solid fa-rotate-left text-[9px]"></i>
                          <span>Gunakan Default ({defaultVaNumber})</span>
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={inputAccountNo}
                          onChange={(e) => setInputAccountNo(e.target.value)}
                          placeholder={`Nomor rekening (default: ${defaultVaNumber})`}
                          className="flex-1 px-3 py-1.5 bg-slate-50 border border-blue-400 rounded-lg text-slate-900 font-mono font-black text-sm tracking-wider focus:ring-2 focus:ring-blue-600 focus:bg-white outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(inputAccountNo.trim() || defaultVaNumber);
                            showToast(`Nomor rekening ${inputAccountNo.trim() || defaultVaNumber} berhasil disalin!`, 'info');
                          }}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-lg font-bold text-xs border border-blue-200 transition flex items-center space-x-1 cursor-pointer shrink-0"
                          title="Salin nomor rekening"
                        >
                          <i className="fa-solid fa-copy"></i>
                          <span>Salin</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-600 font-bold uppercase tracking-wider block mb-1">
                        Atas Nama (A.n.) Pemilik Rekening:
                      </label>
                      <input
                        type="text"
                        value={inputAccountName}
                        onChange={(e) => setInputAccountName(e.target.value)}
                        placeholder={`Atas Nama (default: ${defaultAccountName})`}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-semibold text-xs focus:ring-2 focus:ring-blue-600 focus:bg-white outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Tanggal Pembayaran */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Tanggal Pembayaran / Setoran <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-semibold focus:ring-2 focus:ring-hajj-700 focus:bg-white outline-none"
                />
              </div>

              {/* Catatan / No. Bukti */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Catatan Pembayaran / Nomor Ref NTPN / VA (Opsional):
                </label>
                <input
                  type="text"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="Contoh: Setor via VA BSI Ref #93821 / Slip Kasir UPT"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-hajj-700 focus:bg-white outline-none font-medium"
                />
              </div>

              {/* Status Notice */}
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-start space-x-2">
                <i className="fa-solid fa-circle-info text-hajj-700 mt-0.5 shrink-0"></i>
                <span>
                  {payMode === 'FULL' || enteredAmount >= currentRemaining ? (
                    <>Setelah pelunasan dikonfirmasi penuh, <strong>Kwitansi Resmi Tanda Terima (Format Landscape)</strong> akan otomatis berstatus Lunas dan siap dicetak.</>
                  ) : (
                    <>Pembayaran ini akan dicatat sebagai <strong>Uang Muka (DP)</strong> di invoice. Lembar tagihan memuat rincian DP dan sisa tagihan yang harus dilunasi, serta Kwitansi Tanda Terima DP resmi dapat dicetak.</>
                  )}
                </span>
              </div>
            </div>

            {/* Actions Buttons */}
            <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowPayModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmPayment}
                className={`px-5 py-2 text-white font-bold rounded-xl text-xs shadow-md transition flex items-center space-x-1.5 cursor-pointer ${
                  payMode === 'FULL' || enteredAmount >= currentRemaining
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800'
                    : 'bg-gradient-to-r from-amber-600 to-orange-700 hover:from-amber-700 hover:to-orange-800'
                }`}
              >
                <i className={`fa-solid ${payMode === 'FULL' || enteredAmount >= currentRemaining ? 'fa-check-double' : 'fa-coins'}`}></i>
                <span>
                  {payMode === 'FULL' || enteredAmount >= currentRemaining
                    ? `Konfirmasi Pelunasan Penuh (${formatRupiah(enteredAmount)})`
                    : `Simpan Uang Muka / DP (${formatRupiah(enteredAmount)})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showRevertConfirm && (
        <div 
          className="fixed inset-0 z-60 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setShowRevertConfirm(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-4 text-center border border-amber-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl mx-auto border border-amber-200">
              <i className="fa-solid fa-rotate-left"></i>
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-sm">Reset Status Pembayaran?</h4>
              <p className="text-xs text-slate-500 mt-1">
                Apakah Anda yakin ingin mereset status pembayaran tagihan ini kembali ke <strong className="text-rose-700">Belum Lunas</strong>?
              </p>
            </div>
            <div className="flex items-center justify-center space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setShowRevertConfirm(false)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={executeRevertPayment}
                className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-xs transition cursor-pointer"
              >
                Ya, Reset Status
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
