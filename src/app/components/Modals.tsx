// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { useAppContext, isTeknisiRole, isQcRole, isSuperAdmin, isRecepRole, isKoperasiRole, isManagerTeknisi, isManagerQc } from '../store';
import { Transaction } from '../types';
import { INDONESIAN_BANKS, OFFICIAL_VA_CONFIG } from '../data';
import { getRealTodayDate, getRealDateWithOffset, formatIndonesianDate, addDaysToDateStr, formatRupiah, checkMeetingRoomAvailability, getTxDays, isMeetingFacility } from '../lib/utils';
import { exportToExcel, exportToPDF, generateReportData, ReportType, ExportFormat } from '../lib/reportExporter';
import { InvoiceModal } from './InvoiceModal';
import { KwitansiModal } from './KwitansiModal';
import { ExtendModal } from './ExtendModal';
import { RoomDetailModal } from './RoomDetailModal';
import { GroupRegistrationModal } from './GroupRegistrationModal';
import { AgendaListModal } from './AgendaListModal';
import { AccountProfileModal } from './AccountProfileModal';
import { RoomModal, RoomCapacityRateModal, DeleteConfirmModal } from './CatalogManagementModals';
import { useBodyScrollLock } from '../lib/scrollLock';
import { dataStorage } from '../services/dataStorage';

export function Modals() {
  const { 
    modalState, closeModal, openModal, rooms, addTransaction, updateTransaction, 
    activateCheckin, addMaintenance, assignTechnicianToMaintenance, markMaintenanceRepaired, 
    updateMaintenanceStatus, addQcInspection, currentUser, addUser, updateUser, toggleUserStatus, deleteUser, users, transactions, 
    checkoutRoom, cancelBooking, batchCheckinGroup, batchCheckoutGroup, maintenances, showToast, qcInspections = [], workSessions = [], auditLogs = [], breakfastMenuItems = [], buildings = [], meetingRooms = [], breakfastOrders = []
  } = useAppContext();

  // CHECKIN MODAL
  const checkinData = modalState.modalCheckin?.data;
  const isCheckinOpen = modalState.modalCheckin?.isOpen;
  const isCheckoutSelectionOpen = modalState.modalCheckoutSelection?.isOpen;
  const room = rooms.find(r => r.id === checkinData?.roomId) || 
               rooms.find(r => r.roomNumber === checkinData?.roomId) ||
               (() => {
                 if (!checkinData?.roomId) return null;
                 const mr = meetingRooms.find(m => m.id === checkinData.roomId || m.name.toLowerCase() === checkinData.roomId.toLowerCase() || m.code?.toLowerCase() === checkinData.roomId.toLowerCase());
                 if (!mr) return null;
                 const isSG = mr.category === 'SERBAGUNA';
                 return {
                   id: mr.id,
                   building: mr.building || (isSG ? 'Gedung Serbaguna (SG)' : 'Ruang Pertemuan'),
                   roomNumber: mr.name,
                   type: isSG ? 'Gedung Serbaguna (SG)' : 'Ruang Pertemuan / Aula',
                   capacity: mr.capacity,
                   capacityNumber: mr.capacityNumber || 500,
                   pricePerNight: mr.dailyRate,
                   facilities: mr.facilities,
                   status: mr.status === 'MAINTENANCE' ? 'MAINTENANCE' : 'KOSONG',
                   qcStatus: mr.qcStatus || 'LOLOS_QC',
                   activeTxId: mr.activeTxId || null,
                   activeMaintId: null
                 } as any;
               })();
  
  // State for confirm action in checkout/cancel modal
  const [confirmActionTxId, setConfirmActionTxId] = useState<string | null>(null);

  useEffect(() => {
    if (!isCheckoutSelectionOpen) {
      setConfirmActionTxId(null);
    }
  }, [isCheckoutSelectionOpen]);
  
  // Global Body Scroll Lock: Memastikan halaman latar belakang tidak dapat di-scroll saat popup manapun terbuka
  const isAnyModalOpen = Boolean(
    Object.values(modalState).some((m: any) => m?.isOpen)
  );
  useBodyScrollLock(isAnyModalOpen);

  const realToday = getRealTodayDate();
  const realTomorrow = getRealDateWithOffset(1);
  const realPlus2 = getRealDateWithOffset(2);

  const [category, setCategory] = useState('JEMAAH');
  const [guestName, setGuestName] = useState('');
  const [nikKtp, setNikKtp] = useState('');
  const [kloter, setKloter] = useState('');
  const [startDate, setStartDate] = useState(realToday);
  const [duration, setDuration] = useState(1);
  const [aulaRentalDays, setAulaRentalDays] = useState<number>(1);
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [cateringPackage, setCateringPackage] = useState<'TIDAK' | 'SARAPAN' | 'FULLBOARD' | 'SNACK_AULA'>('TIDAK');
  const [includeBreakfast, setIncludeBreakfast] = useState(false);
  const [breakfastMenu, setBreakfastMenu] = useState('Nasi Goreng Spesial');
  const [breakfastPortions, setBreakfastPortions] = useState(1);
  const [breakfastDays, setBreakfastDays] = useState(1);
  const [breakfastStatus, setBreakfastStatus] = useState<'MENUNGGU' | 'SEDANG_DIBUAT' | 'PENGANTARAN' | 'SELESAI'>('MENUNGGU');
  const [rentType, setRentType] = useState('Per Kamar'); // for rooms
  const [includeExtraBed, setIncludeExtraBed] = useState(false);
  const [extraBedCount, setExtraBedCount] = useState(1);
  const [extraBedPrice, setExtraBedPrice] = useState<number>(100000);
  const [extraBedNotes, setExtraBedNotes] = useState('1 Kasur Lipat + Bantal & Sprei Bersih');
  const [aulaPax, setAulaPax] = useState<number>(50);
  const [checkinMode, setCheckinMode] = useState<'SELECT_BOOKING' | 'NEW_GUEST'>('NEW_GUEST');
  const [selectedBookingTxId, setSelectedBookingTxId] = useState<string | null>(null);

  const [payStatus, setPayStatus] = useState<'BELUM_LUNAS' | 'DP' | 'LUNAS'>('BELUM_LUNAS');
  const [payMethod, setPayMethod] = useState<'VA_UPT' | 'TRANSFER' | 'CASH'>('VA_UPT');
  const [payBank, setPayBank] = useState('BRI');
  const [payDpAmount, setPayDpAmount] = useState<number>(0);
  const [payDate, setPayDate] = useState(realToday);
  const [payVaNumber, setPayVaNumber] = useState(OFFICIAL_VA_CONFIG.vaNumber);
  const [payVaName, setPayVaName] = useState(OFFICIAL_VA_CONFIG.accountName);
  const [payBankAccountNumber, setPayBankAccountNumber] = useState(OFFICIAL_VA_CONFIG.vaNumber);

  useEffect(() => {
    if (isCheckinOpen) {
      if (checkinData?.txToEdit) {
        const txEdit = checkinData.txToEdit;
        setCategory(txEdit.category);
        setGuestName(txEdit.guestName);
        setNikKtp(txEdit.nikKtp || '');
        setKloter(txEdit.kloter && txEdit.kloter !== '-' ? txEdit.kloter : '');
        setStartDate(txEdit.startDate);
        const isAulaEdit = txEdit.building === 'Ruang Pertemuan' || isMeetingFacility(txEdit.building) || isMeetingFacility(txEdit.roomNumber);
        if (isAulaEdit) {
          setDuration(txEdit.rentAulaDuration || (txEdit.duration === 12 || txEdit.durationUnit === 'Hari' ? 12 : 8));
          setAulaRentalDays(txEdit.rentAulaDurationDays || (txEdit.durationUnit === 'Hari' ? txEdit.duration : 1));
        } else {
          setDuration(txEdit.duration);
          setAulaRentalDays(1);
        }
        setPhone(txEdit.phone && txEdit.phone !== '-' ? txEdit.phone : '');
        setNotes(txEdit.notes || '');
        setRentType(txEdit.rentType || 'Per Kamar');
        const pkg = (txEdit.cateringPackage as any) || (txEdit.breakfast ? 'SARAPAN' : 'TIDAK');
        setCateringPackage(pkg);
        setIncludeBreakfast(pkg !== 'TIDAK');
        setBreakfastMenu(txEdit.breakfastMenu || 'Nasi Goreng Spesial');
        setBreakfastPortions(txEdit.breakfastPortions || 1);
        setBreakfastDays(txEdit.breakfastDays || txEdit.duration || 1);
        setBreakfastStatus(txEdit.breakfastStatus || 'MENUNGGU');
        setIncludeExtraBed(!!txEdit.extraBed);
        setExtraBedCount(txEdit.extraBedCount || 1);
        setExtraBedPrice(txEdit.extraBedPrice || 100000);
        setExtraBedNotes(txEdit.extraBedNotes || '1 Kasur Lipat + Bantal & Sprei Bersih');
        setAulaPax(txEdit.totalPax || 50);
        setSelectedBookingTxId(txEdit.id);
        setCheckinMode('NEW_GUEST');
        setPayStatus(txEdit.paymentStatus || 'BELUM_LUNAS');
        setPayMethod(txEdit.paymentMethod || txEdit.dpMethod || 'VA_UPT');
        setPayBank(txEdit.bankName || 'BRI');
        setPayDpAmount(txEdit.dpAmount || 0);
        setPayDate(txEdit.paymentDate || txEdit.dpDate || realToday);
        setPayVaNumber(txEdit.vaNumber || OFFICIAL_VA_CONFIG.vaNumber);
        setPayVaName(txEdit.vaAccountName || OFFICIAL_VA_CONFIG.accountName);
        setPayBankAccountNumber(txEdit.bankAccountNumber || txEdit.vaNumber || OFFICIAL_VA_CONFIG.vaNumber);
        return;
      }

      setCategory('UMUM');
      setGuestName('');
      setNikKtp('');
      setKloter('');
      setPayStatus('BELUM_LUNAS');
      setPayMethod('VA_UPT');
      setPayBank('BRI');
      setPayDpAmount(0);
      setPayDate(realToday);
      setPayVaNumber(OFFICIAL_VA_CONFIG.vaNumber);
      setPayVaName(OFFICIAL_VA_CONFIG.accountName);
      setPayBankAccountNumber(OFFICIAL_VA_CONFIG.vaNumber);
      
      // Cek apakah ada booking atau stay aktif/terisi, sesuaikan dengan tanggal selesai book (mencari tanggal kosong berikutnya)
      const targetRoomId = checkinData?.roomId || room?.id;
      const activeOrBookedTxs = targetRoomId ? transactions.filter(t => t.roomId === targetRoomId && (t.status === 'BOOKED' || t.status === 'TERISI')) : [];
      let latestEndDate = '';
      if (activeOrBookedTxs.length > 0) {
        activeOrBookedTxs.forEach(t => {
          const tDays = getTxDays(t);
          const tEnd = addDaysToDateStr(t.startDate, tDays);
          if (!latestEndDate || tEnd > latestEndDate) {
            latestEndDate = tEnd;
          }
        });
      }
      const isRoomAulaInitial = Boolean(
        room && (
          room.building === 'Ruang Pertemuan' ||
          room.building === 'Gedung Serbaguna (SG)' ||
          room.building === 'Gedung Serbaguna' ||
          isMeetingFacility(room.building) ||
          isMeetingFacility(room.roomNumber) ||
          room.type?.toLowerCase().includes('aula') ||
          room.type?.toLowerCase().includes('pertemuan') ||
          room.type?.toLowerCase().includes('serbaguna') ||
          meetingRooms.some(m => m.id === room?.id || m.name.toLowerCase() === room?.roomNumber?.toLowerCase())
        )
      );
      const isSGInitial = Boolean(
        isRoomAulaInitial && room && (
          room.building?.toLowerCase().includes('serbaguna') ||
          room.type?.toLowerCase().includes('serbaguna') ||
          room.roomNumber?.toLowerCase().includes('serbaguna') ||
          room.roomNumber?.toLowerCase().startsWith('sg') ||
          meetingRooms.some(m => (m.id === room?.id || m.name.toLowerCase() === room?.roomNumber?.toLowerCase()) && m.category === 'SERBAGUNA')
        )
      );
      const initialDateToUse = latestEndDate || checkinData?.initialDate || (checkinData?.actionType === 'BOOKING' ? realTomorrow : realToday);
      setStartDate(initialDateToUse);
      
      const dur = checkinData?.initialDuration || (isRoomAulaInitial ? 8 : 1);
      setDuration(dur);
      setAulaRentalDays(1);
      setAulaPax(isSGInitial ? 100 : 50);

      setPhone('');
      setNotes('');
      setCateringPackage('TIDAK');
      setIncludeBreakfast(false);
      setBreakfastMenu('Nasi Goreng Spesial');
      setBreakfastPortions(1);
      setBreakfastDays(dur);
      setBreakfastStatus('MENUNGGU');
      setRentType(isRoomAulaInitial ? (isSGInitial ? 'Sewa Gedung Serbaguna' : 'Sewa Ruangan') : 'Per Kamar');
      setIncludeExtraBed(false);
      setExtraBedCount(1);
      setExtraBedPrice(100000);
      setExtraBedNotes('1 Kasur Lipat + Bantal & Sprei Bersih');
      setSelectedBookingTxId(null);

      // Cek apakah di Gedung ada data booking tamu untuk kamar ini saat mode CHECKIN
      const hasBookings = room && !isRoomAulaInitial && transactions.some(t => t.roomId === room.id && t.status === 'BOOKED');
      if (checkinData?.actionType === 'CHECKIN' && hasBookings) {
        setCheckinMode('SELECT_BOOKING');
      } else {
        setCheckinMode('NEW_GUEST');
      }
    }
  }, [isCheckinOpen, checkinData, room, transactions, meetingRooms]);

  const isAula = Boolean(
    room && (
      room.building === 'Ruang Pertemuan' ||
      room.building === 'Gedung Serbaguna (SG)' ||
      room.building === 'Gedung Serbaguna' ||
      isMeetingFacility(room.building) ||
      isMeetingFacility(room.roomNumber) ||
      room.type?.toLowerCase().includes('aula') ||
      room.type?.toLowerCase().includes('pertemuan') ||
      room.type?.toLowerCase().includes('serbaguna') ||
      meetingRooms.some(m => m.id === room?.id || m.name.toLowerCase() === room?.roomNumber?.toLowerCase())
    )
  );

  const matchingMr = isAula ? meetingRooms.find(m => 
    m.id === room?.id || 
    m.id === `mr-${room?.id}` ||
    m.name.toLowerCase() === room?.roomNumber?.toLowerCase() ||
    m.code?.toLowerCase() === room?.roomNumber?.toLowerCase() ||
    m.name.toLowerCase() === room?.building?.toLowerCase() ||
    (room?.building && m.building?.toLowerCase() === room.building.toLowerCase())
  ) : null;

  const isSG = Boolean(
    isAula && (
      room?.building?.toLowerCase().includes('serbaguna') ||
      room?.type?.toLowerCase().includes('serbaguna') ||
      room?.roomNumber?.toLowerCase().includes('serbaguna') ||
      room?.roomNumber?.toLowerCase().startsWith('sg') ||
      matchingMr?.category === 'SERBAGUNA'
    )
  );

  const facilityDailyRate = matchingMr?.dailyRate || (isSG ? 15000000 : 12000000);
  const facilitySessionRate = matchingMr?.sessionRate || (isSG ? 8500000 : 7000000);

  const calculateMeetingRate = (dur: number, daysCount: number = aulaRentalDays): number => {
    const ratePerDay = dur === 12 ? facilityDailyRate : facilitySessionRate;
    return ratePerDay * Math.max(1, daysCount);
  };

  const isKamar = !!room && !isAula;
  const isSameDayBooking = startDate <= realToday;
  const isFutureBooking = startDate > realToday;
  const isPaymentRestrictedToFull = isKamar && isSameDayBooking;

  // Aturan Pembayaran SIM Asrama Haji:
  // Untuk pemesanan kamar (bukan aula) hari ini (same-day), wajib bayar lunas (tidak bisa DP / belum bayar)
  useEffect(() => {
    if (isCheckinOpen && isPaymentRestrictedToFull && payStatus !== 'LUNAS') {
      setPayStatus('LUNAS');
    }
  }, [isCheckinOpen, isPaymentRestrictedToFull, payStatus]);

  // Real-time capacity calculation on selected startDate and duration span for Ruang Pertemuan / Serbaguna
  const proposedDays = isAula ? Math.max(1, aulaRentalDays) : duration;
  const proposedDatesToCheck: string[] = [];
  for (let i = 0; i < proposedDays; i++) {
    proposedDatesToCheck.push(addDaysToDateStr(startDate, i));
  }

  const hasAnyTxAcrossProposedDates = isAula ? proposedDatesToCheck.some(dStr => {
    const txsOnDStr = transactions.filter(t => {
      if (t.roomId !== room?.id) return false;
      if (t.status === 'DIBATALKAN' || t.status === 'SELESAI') return false;
      const tDays = getTxDays(t);
      for (let j = 0; j < tDays; j++) {
        if (addDaysToDateStr(t.startDate, j) === dStr) return true;
      }
      return false;
    });
    return txsOnDStr.length > 0;
  }) : false;

  const aulaTxsOnStartDate = isAula ? transactions.filter(t => {
    if (t.roomId !== room?.id) return false;
    if (t.status === 'DIBATALKAN' || t.status === 'SELESAI') return false;
    const tDays = getTxDays(t);
    for (let j = 0; j < tDays; j++) {
      if (addDaysToDateStr(t.startDate, j) === startDate) return true;
    }
    return false;
  }) : [];

  const aulaHas12OrMultiDayStart = aulaTxsOnStartDate.some(t => t.duration >= 12 || t.durationUnit === 'Hari');
  const aulaCount8OnStart = aulaTxsOnStartDate.filter(t => (t.duration === 8 || (t.duration < 12 && t.durationUnit !== 'Hari'))).length;
  const is8HourDisabled = aulaHas12OrMultiDayStart || aulaCount8OnStart >= 2;
  const isMultiDayOr12Disabled = hasAnyTxAcrossProposedDates || aulaCount8OnStart > 0;
  const isAulaOnly8Available = !aulaHas12OrMultiDayStart && aulaCount8OnStart === 1;

  const isAulaDateFull = is8HourDisabled;
  const aulaHas12OrMultiDay = hasAnyTxAcrossProposedDates || aulaHas12OrMultiDayStart;
  const aulaCount8OnDate = aulaCount8OnStart;
  const aulaTxsOnDate = aulaTxsOnStartDate;

  // Auto-enforce 8 hours if 1 tenant already booked 8 hours on start date
  useEffect(() => {
    if (isAula && isAulaOnly8Available && duration >= 12) {
      setDuration(8);
    }
  }, [isAula, isAulaOnly8Available, duration]);

  // Real-time overlap check for Kamar
  const existingTerisi = (!isAula && room) ? transactions.filter(t => t.roomId === room.id && t.status === 'TERISI') : [];
  const kamarOverlap = (!isAula && room) ? transactions.some(t => {
    if (t.roomId !== room.id) return false;
    if (t.status === 'DIBATALKAN' || t.status === 'SELESAI') return false;
    if (selectedBookingTxId && t.id === selectedBookingTxId) return false;
    if (checkinData?.actionType === 'CHECKIN' && t.status === 'TERISI') return false;
    
    const newStart = new Date(startDate);
    newStart.setHours(0,0,0,0);
    const newEnd = new Date(newStart);
    newEnd.setDate(newEnd.getDate() + duration);

    const tStart = new Date(t.startDate);
    tStart.setHours(0,0,0,0);
    const tEnd = new Date(tStart);
    tEnd.setDate(tEnd.getDate() + t.duration);

    return Math.max(newStart.getTime(), tStart.getTime()) < Math.min(newEnd.getTime(), tEnd.getTime());
  }) : false;

  const handleCheckin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!room || !currentUser) return;

    if (isPaymentRestrictedToFull && payStatus !== 'LUNAS') {
      showToast('Pemesanan kamar hari ini wajib dibayar lunas penuh (tidak dapat menggunakan DP atau Belum Bayar).', 'warning');
      setPayStatus('LUNAS');
      return;
    }

    const estRoomRate = !isAula ? (room?.pricePerNight || 480000) * duration : 0;
    const estAulaRate = isAula ? calculateMeetingRate(duration, aulaRentalDays) : 0;
    let estRateCat = 25000;
    if (cateringPackage === 'FULLBOARD') estRateCat = 120000;
    else if (cateringPackage === 'SNACK_AULA') estRateCat = 25000;
    else if (cateringPackage === 'SARAPAN') {
      const mItem = breakfastMenuItems.find(m => m.name === breakfastMenu);
      estRateCat = mItem?.price || 25000;
    }
    const estBreakfast = (includeBreakfast && cateringPackage !== 'TIDAK') ? breakfastPortions * breakfastDays * estRateCat : 0;
    const estExtraBed = includeExtraBed ? extraBedCount * duration * (extraBedPrice || 100000) : 0;
    const estGrandTotal = estRoomRate + estAulaRate + estBreakfast + estExtraBed;

    const finalPaidAmount = payStatus === 'LUNAS' ? estGrandTotal : (payStatus === 'DP' ? payDpAmount : 0);
    const paymentFields = {
      paymentStatus: payStatus,
      paidAmount: finalPaidAmount,
      dpAmount: payStatus === 'DP' ? payDpAmount : undefined,
      dpDate: payStatus === 'DP' ? payDate : undefined,
      dpMethod: payStatus === 'DP' ? payMethod : undefined,
      paymentDate: payStatus === 'LUNAS' ? payDate : (payStatus === 'DP' ? payDate : undefined),
      paymentMethod: payMethod,
      bankName: payMethod === 'TRANSFER' ? payBank : undefined,
      vaNumber: payVaNumber.trim() || OFFICIAL_VA_CONFIG.vaNumber,
      vaAccountName: payVaName.trim() || OFFICIAL_VA_CONFIG.accountName,
      bankAccountNumber: payBankAccountNumber.trim() || payVaNumber.trim() || OFFICIAL_VA_CONFIG.vaNumber,
    };
    
    if (isAula) {
      const excludeId = checkinData?.txToEdit?.id || selectedBookingTxId || undefined;
      const checkResult = checkMeetingRoomAvailability(room.id, startDate, duration, transactions, excludeId, 'Hari', aulaRentalDays);
      if (!checkResult.isValid) {
        showToast(checkResult.message || `${isSG ? 'Gedung serbaguna' : 'Ruang pertemuan'} tidak tersedia pada rentang tanggal tersebut.`, 'error');
        return;
      }
    } else {
      const newStart = new Date(startDate);
      newStart.setHours(0,0,0,0);
      const newEnd = new Date(newStart);
      newEnd.setDate(newEnd.getDate() + duration);

      const hasOverlap = transactions.some(t => {
        if (t.roomId !== room.id) return false;
        if (t.status === 'DIBATALKAN' || t.status === 'SELESAI') return false;
        if (selectedBookingTxId && t.id === selectedBookingTxId) return false;
        if (checkinData?.actionType === 'CHECKIN' && t.status === 'TERISI') return false;
        
        const tStart = new Date(t.startDate);
        tStart.setHours(0,0,0,0);
        const tEnd = new Date(tStart);
        tEnd.setDate(tEnd.getDate() + t.duration);

        return Math.max(newStart.getTime(), tStart.getTime()) < Math.min(newEnd.getTime(), tEnd.getTime());
      });

      if (hasOverlap) {
        showToast("Kamar sudah terisi atau di-booking pada rentang tanggal tersebut. Silakan pilih tanggal lain (+1 hari).", "error");
        return;
      }
    }

    if (checkinData?.actionType === 'EDIT_BOOKING' && checkinData?.txToEdit) {
      const existing = checkinData.txToEdit;
      const isAulaTarget = isAula;
      const finalBreakfast = isAulaTarget ? false : includeBreakfast;
      const finalExtraBed = isAulaTarget ? false : includeExtraBed;

      // Jika tanggal dipindahkan ke tanggal mendatang (> hari ini), status diubah ke BOOKED
      let finalStatus = existing.status;
      if (startDate > realToday && finalStatus === 'TERISI') {
        finalStatus = 'BOOKED';
      }

      updateTransaction({
        ...existing,
        status: finalStatus,
        category,
        guestName,
        nikKtp: nikKtp || undefined,
        kloter: category === 'JEMAAH' ? kloter : '-',
        startDate,
        duration,
        totalPax: isAula ? Number(aulaPax) : (existing.totalPax || 1),
        durationUnit: isAulaTarget ? (duration >= 12 ? 'Hari' : 'Jam') : 'Malam',
        rentType: isAulaTarget ? (isSG ? 'Sewa Gedung Serbaguna' : 'Sewa Ruangan') : rentType,
        phone,
        notes,
        breakfast: finalBreakfast,
        breakfastMenu: finalBreakfast ? breakfastMenu : undefined,
        breakfastPortions: finalBreakfast ? Number(breakfastPortions) : undefined,
        breakfastDays: finalBreakfast ? Number(breakfastDays) : undefined,
        breakfastStatus: finalBreakfast ? (breakfastStatus || 'MENUNGGU') : undefined,
        cateringPackage: finalBreakfast ? (existing.cateringPackage && existing.cateringPackage !== 'TIDAK' ? existing.cateringPackage : 'SARAPAN') : 'TIDAK',
        cateringPaxCount: finalBreakfast ? Number(breakfastPortions) : 0,
        extraBed: finalExtraBed,
        extraBedCount: finalExtraBed ? Number(extraBedCount) : undefined,
        extraBedPrice: finalExtraBed ? extraBedPrice : undefined,
        extraBedNotes: finalExtraBed ? extraBedNotes : undefined,
        ...paymentFields,
      });
      showToast(`Data reservasi ${guestName} berhasil disesuaikan!`, 'success');
      closeModal('modalCheckin');
      const targetRoomId = checkinData?.returnToRoomId || checkinData?.roomId || room?.id;
      if (targetRoomId) {
        openModal('modalRoomDetail', { roomId: targetRoomId });
      }
      return;
    }

    if (selectedBookingTxId) {
      const updatedTx: Transaction = {
        id: selectedBookingTxId,
        roomId: room.id,
        building: room.building,
        roomNumber: room.roomNumber,
        category,
        guestName,
        nikKtp: nikKtp || undefined,
        guestType: 'INDIVIDU',
        isGroup: false,
        totalPax: isAula ? Number(aulaPax) : 1,
        kloter: category === 'JEMAAH' ? kloter : '-',
        startDate,
        duration: isAula ? aulaRentalDays : duration,
        durationUnit: isAula ? 'Hari' : 'Malam',
        rentAulaDuration: isAula ? duration : undefined,
        rentAulaDurationDays: isAula ? aulaRentalDays : undefined,
        rentAulaSession: isAula ? (duration === 12 ? 'Full Day 12 Jam (Harian Penuh)' : 'Reguler 8 Jam (Per Sesi)') : undefined,
        pricePerNight: isAula ? (duration === 12 ? facilityDailyRate : facilitySessionRate) : room.pricePerNight,
        rentType: isAula ? (isSG ? 'Sewa Gedung Serbaguna' : 'Sewa Ruangan') : rentType,
        phone,
        notes,
        status: 'TERISI',
        createdUser: currentUser.username,
        breakfast: isAula ? false : includeBreakfast,
        breakfastMenu: isAula ? undefined : (includeBreakfast ? breakfastMenu : undefined),
        breakfastPortions: isAula ? undefined : (includeBreakfast ? Number(breakfastPortions) : undefined),
        breakfastDays: isAula ? undefined : (includeBreakfast ? Number(breakfastDays) : undefined),
        breakfastStatus: isAula ? undefined : (includeBreakfast ? (breakfastStatus || 'MENUNGGU') : undefined),
        cateringPackage: (includeBreakfast && cateringPackage !== 'TIDAK' && !isAula) ? cateringPackage : 'TIDAK',
        cateringPaxCount: (includeBreakfast && cateringPackage !== 'TIDAK' && !isAula) ? Number(breakfastPortions) : 0,
        extraBed: isAula ? false : includeExtraBed,
        extraBedCount: isAula ? undefined : (includeExtraBed ? Number(extraBedCount) : undefined),
        extraBedPrice: isAula ? undefined : (includeExtraBed ? extraBedPrice : undefined),
        extraBedNotes: isAula ? undefined : (includeExtraBed ? extraBedNotes : undefined)
      };
      const finalUpdatedTx = {
        ...updatedTx,
        ...paymentFields,
      };
      updateTransaction(finalUpdatedTx);
      activateCheckin(room.id, selectedBookingTxId);
      closeModal('modalCheckin');
      if (payStatus === 'LUNAS') {
        openModal('modalKwitansi', { transaction: finalUpdatedTx, room, returnToRoomId: room.id });
      } else {
        openModal('modalInvoice', { transaction: finalUpdatedTx, room, returnToRoomId: room.id });
      }
      return;
    }

    const tx: Transaction = {
      id: `TRX-${Math.floor(1000 + Math.random() * 9000)}`,
      createdAt: new Date().toISOString(),
      roomId: room.id,
      building: room.building,
      roomNumber: room.roomNumber,
      category,
      guestName,
      nikKtp: nikKtp || undefined,
      guestType: 'INDIVIDU',
      isGroup: false,
      totalPax: isAula ? Number(aulaPax) : 1,
      kloter: category === 'JEMAAH' ? kloter : '-',
      startDate,
      duration: isAula ? aulaRentalDays : duration,
      durationUnit: isAula ? 'Hari' : 'Malam',
      rentAulaDuration: isAula ? duration : undefined,
      rentAulaDurationDays: isAula ? aulaRentalDays : undefined,
      rentAulaSession: isAula ? (duration === 12 ? 'Full Day 12 Jam (Harian Penuh)' : 'Reguler 8 Jam (Per Sesi)') : undefined,
      pricePerNight: isAula ? (duration === 12 ? facilityDailyRate : facilitySessionRate) : room.pricePerNight,
      rentType: isAula ? (isSG ? 'Sewa Gedung Serbaguna' : 'Sewa Ruangan') : rentType,
      phone,
      notes,
      status: isAula ? 'BOOKED' : (checkinData.actionType === 'BOOKING' ? 'BOOKED' : 'TERISI'),
      createdUser: currentUser.username,
      breakfast: isAula ? false : includeBreakfast,
      breakfastMenu: (includeBreakfast && !isAula) ? breakfastMenu : undefined,
      breakfastPortions: (includeBreakfast && !isAula) ? Number(breakfastPortions) : undefined,
      breakfastDays: (includeBreakfast && !isAula) ? Number(breakfastDays) : undefined,
      breakfastStatus: (includeBreakfast && !isAula) ? 'MENUNGGU' : undefined,
      cateringPackage: (includeBreakfast && cateringPackage !== 'TIDAK' && !isAula) ? cateringPackage : 'TIDAK',
      cateringPaxCount: (includeBreakfast && cateringPackage !== 'TIDAK' && !isAula) ? Number(breakfastPortions) : 0,
      extraBed: isAula ? false : includeExtraBed,
      extraBedCount: (includeExtraBed && !isAula) ? Number(extraBedCount) : undefined,
      extraBedPrice: (includeExtraBed && !isAula) ? extraBedPrice : undefined,
      extraBedNotes: (includeExtraBed && !isAula) ? extraBedNotes : undefined,
      ...paymentFields
    };
    addTransaction(tx);
    closeModal('modalCheckin');
    if (payStatus === 'LUNAS') {
      openModal('modalKwitansi', { transaction: tx, room, returnToRoomId: room.id });
    } else {
      openModal('modalInvoice', { transaction: tx, room, returnToRoomId: room.id });
    }
  };

  // MAINTENANCE MODAL
  const maintData = modalState.modalMaintenance?.data;
  const isMaintOpen = modalState.modalMaintenance?.isOpen;
  
  const [maintRoomId, setMaintRoomId] = useState('');
  const [maintCategory, setMaintCategory] = useState('Perawatan Rutin');
  const [maintUrgency, setMaintUrgency] = useState('Biasa');
  const [maintTechnician, setMaintTechnician] = useState('Budi Santoso (Teknisi AC/Listrik)');
  const [maintDesc, setMaintDesc] = useState('');

  useEffect(() => {
    if (isMaintOpen) {
      let targetId = maintData?.roomId;
      if (targetId && !rooms.some(r => r.id === targetId)) {
        const foundByNum = rooms.find(r => r.roomNumber === targetId || r.id === targetId);
        if (foundByNum) targetId = foundByNum.id;
      }
      if (!targetId && maintData?.building) {
        const found = rooms.find(r => r.building === maintData.building);
        if (found) targetId = found.id;
      }
      if (!targetId) {
        targetId = rooms.find(r => r.status === 'KOSONG')?.id || rooms[0]?.id || '';
      }
      setMaintRoomId(targetId);
      setMaintCategory('Perawatan Rutin');
      setMaintUrgency('Biasa');
      setMaintTechnician('Budi Santoso (Teknisi AC/Listrik)');
      setMaintDesc('');
    }
  }, [isMaintOpen, maintData, rooms]);

  const handleMaintenance = (e: React.FormEvent) => {
    e.preventDefault();
    const maintRoom = rooms.find(r => r.id === maintRoomId);
    const maintMr = !maintRoom ? meetingRooms.find(m => m.id === maintRoomId || m.name === maintRoomId) : null;
    if (!maintRoom && !maintMr) return;
    
    const roomId = maintRoom ? maintRoom.id : maintMr!.id;
    const building = maintRoom ? maintRoom.building : (maintMr!.building || 'Ruang Pertemuan');
    const roomNumber = maintRoom ? maintRoom.roomNumber : maintMr!.name;
    const isAula = !maintRoom || isMeetingFacility(building);

    addMaintenance({
      id: `M-${Math.floor(1000 + Math.random() * 9000)}`,
      roomId,
      building,
      roomNumber,
      category: maintCategory,
      urgency: maintUrgency,
      technician: maintTechnician,
      description: maintDesc,
      reportTime: new Date().toISOString().replace('T', ' ').substring(0, 16),
      status: 'PROSES',
      reportedUser: currentUser ? currentUser.username : 'petugas',
      facilityType: isAula ? 'AULA' : 'KAMAR'
    });
    closeModal('modalMaintenance');
  };

  // UPDATE MAINTENANCE STATUS MODAL (KHUSUS TEKNISI)
  const isUpdateMaintOpen = modalState.modalUpdateMaintenance?.isOpen;
  const updateMaintData = modalState.modalUpdateMaintenance?.data;
  const targetMaintenance = updateMaintData?.maintenance;
  const [upStatus, setUpStatus] = useState<'MENUNGGU_PENUGASAN' | 'PROSES' | 'MENUNGGU_QC' | 'SELESAI'>('PROSES');
  const [upNotes, setUpNotes] = useState('');

  useEffect(() => {
    if (isUpdateMaintOpen && targetMaintenance) {
      setUpStatus((targetMaintenance.status as any) || 'PROSES');
      setUpNotes(targetMaintenance.technicianNotes || '');
    }
  }, [isUpdateMaintOpen, targetMaintenance]);

  const handleUpdateMaintenanceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetMaintenance) return;
    
    // If technician marks as MENUNGGU_QC (telah diperbaiki, menunggu QC cek)
    if (upStatus === 'MENUNGGU_QC') {
      const ok = markMaintenanceRepaired(targetMaintenance.id, upNotes || 'Pekerjaan perbaikan fisik telah diselesaikan teknisi. Menunggu verifikasi lolos QC.');
      if (ok) {
        closeModal('modalUpdateMaintenance');
      }
      return;
    }

    const ok = updateMaintenanceStatus(targetMaintenance.id, upStatus, upNotes);
    if (ok) {
      closeModal('modalUpdateMaintenance');
    }
  };

  // ASSIGN TECHNICIAN MODAL (KHUSUS MANAGER TEKNISI & SUPER ADMIN)
  const isAssignTechOpen = modalState.modalAssignTechnician?.isOpen;
  const assignTechData = modalState.modalAssignTechnician?.data;
  const targetMaintToAssign = assignTechData?.maintenance;
  const [selectedTechId, setSelectedTechId] = useState('u9');
  const [managerAssignNotes, setManagerAssignNotes] = useState('');

  useEffect(() => {
    if (isAssignTechOpen && targetMaintToAssign) {
      setSelectedTechId(targetMaintToAssign.assignedTechnicianId || 'u9');
      setManagerAssignNotes(targetMaintToAssign.managerNotes || '');
    }
  }, [isAssignTechOpen, targetMaintToAssign]);

  const handleAssignTechnicianSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetMaintToAssign) return;
    const techUser = users.find(u => u.id === selectedTechId);
    const techName = techUser ? techUser.fullName : 'Budi Santoso';
    const ok = assignTechnicianToMaintenance(targetMaintToAssign.id, selectedTechId, techName, managerAssignNotes);
    if (ok) {
      closeModal('modalAssignTechnician');
    }
  };

  // USER MGMT MODAL (Kelola Akun Petugas Berstandar Tampilan Booking)
  const isUserMgmtOpen = modalState.modalUserManagement?.isOpen;
  const [userModalTab, setUserModalTab] = useState<'FORM' | 'LIST'>('FORM');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [uUsername, setUUsername] = useState('');
  const [uFullName, setUFullName] = useState('');
  const [uRole, setURole] = useState('Resepsionis');
  const [uSupervisorId, setUSupervisorId] = useState('u2');
  const [uPhone, setUPhone] = useState('');
  const [uAssigned, setUAssigned] = useState('Semua Gedung');
  const [uPass, setUPass] = useState('');
  const [uStatus, setUStatus] = useState<'Aktif' | 'Non-Aktif'>('Aktif');
  const [uDepartment, setUDepartment] = useState('Pelayanan & Resepsionis');
  const [uSearch, setUSearch] = useState('');
  const [uDeptFilter, setUDeptFilter] = useState<'ALL' | 'Resepsionis' | 'QC' | 'Teknisi' | 'Koperasi'>('ALL');
  const [userToDelete, setUserToDelete] = useState<{ id: string; fullName: string; username: string } | null>(null);

  // Auto-fill supervisor and department when role changes
  const handleRoleChange = (newRole: string) => {
    setURole(newRole);
    if (newRole === 'Super Admin') {
      setUSupervisorId('');
      setUDepartment('Pimpinan / Tata Usaha');
      setUAssigned('Semua Gedung');
    } else if (newRole === 'Admin') {
      const topAdmin = users.find(u => u.role === 'Super Admin');
      setUSupervisorId(topAdmin ? topAdmin.id : 'u1');
      setUDepartment('Pimpinan / Tata Usaha');
      setUAssigned('Semua Gedung');
    } else if (newRole === 'Manager Resepsionis') {
      setUSupervisorId('u1');
      setUDepartment('Pelayanan & Resepsionis');
      setUAssigned('Semua Gedung');
    } else if (newRole === 'Resepsionis') {
      setUSupervisorId('u2');
      setUDepartment('Pelayanan & Resepsionis');
    } else if (newRole === 'Manager QC') {
      setUSupervisorId('u1');
      setUDepartment('Pengawasan Mutu & QC');
      setUAssigned('Semua Gedung');
    } else if (newRole === 'Quality Control') {
      setUSupervisorId('u5');
      setUDepartment('Pengawasan Mutu & QC');
    } else if (newRole === 'Manager Teknisi') {
      setUSupervisorId('u1');
      setUDepartment('Pemeliharaan Fasilitas & Teknisi');
      setUAssigned('Semua Gedung');
    } else if (newRole === 'Teknisi') {
      setUSupervisorId('u8');
      setUDepartment('Pemeliharaan Fasilitas & Teknisi');
    } else if (newRole === 'Manager Koperasi') {
      setUSupervisorId('u1');
      setUDepartment('Koperasi, Dapur & Konsumsi');
      setUAssigned('Dapur & Distribusi Sarapan');
    } else if (newRole === 'Petugas Koperasi') {
      setUSupervisorId('u11');
      setUDepartment('Koperasi, Dapur & Konsumsi');
      setUAssigned('Dapur & Distribusi Sarapan');
    }
  };

  const handleStartEditUser = (user: any) => {
    setEditingUserId(user.id);
    setUUsername(user.username);
    setUFullName(user.fullName);
    setURole(user.role);
    setUSupervisorId(user.supervisorId || '');
    setUPhone(user.phone && user.phone !== '-' ? user.phone : '');
    setUAssigned(user.assignedBuilding || 'Semua Gedung');
    setUDepartment(user.department || 'Pelayanan & Resepsionis');
    setUStatus(user.status === 'Non-Aktif' ? 'Non-Aktif' : 'Aktif');
    setUPass('');
    setUserModalTab('FORM');
  };

  const handleResetUserForm = () => {
    setEditingUserId(null);
    setUUsername('');
    setUFullName('');
    setURole('Resepsionis');
    setUSupervisorId('u2');
    setUPhone('');
    setUAssigned('Semua Gedung');
    setUDepartment('Pelayanan & Resepsionis');
    setUStatus('Aktif');
    setUPass('');
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uUsername.trim() || !uFullName.trim()) {
      showToast('Mohon lengkapi Username dan Nama Lengkap petugas!', 'warning');
      return;
    }

    if (editingUserId) {
      const existing = users.find(u => u.id === editingUserId);
      updateUser({
        id: editingUserId,
        username: uUsername.trim(),
        fullName: uFullName.trim(),
        role: uRole as any,
        phone: uPhone.trim() || '-',
        assignedBuilding: uAssigned,
        supervisorId: uSupervisorId || undefined,
        status: uStatus,
        department: uDepartment,
        password: uPass.trim() || existing?.password || '12345'
      });
      handleResetUserForm();
    } else {
      addUser({
        id: `u-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        username: uUsername.trim(),
        fullName: uFullName.trim(),
        role: uRole as any,
        phone: uPhone.trim() || '-',
        assignedBuilding: uAssigned,
        supervisorId: uSupervisorId || undefined,
        status: uStatus,
        department: uDepartment,
        password: uPass.trim() || '12345'
      });
      handleResetUserForm();
    }
  };

  // QC INSPECTION MODAL
  const isQcInspectionOpen = modalState.modalQcInspection?.isOpen;
  const qcModalData = modalState.modalQcInspection?.data;
  const qcTargetRoom = qcModalData?.room;
  const [cleanliness, setCleanliness] = useState<'BAIK' | 'CUKUP' | 'BURUK'>('BAIK');
  const [linenBed, setLinenBed] = useState<'LENGKAP_BERSIH' | 'PERLU_GANTI'>('LENGKAP_BERSIH');
  const [acElectricity, setAcElectricity] = useState<'NORMAL' | 'BERMASALAH'>('NORMAL');
  const [plumbingWater, setPlumbingWater] = useState<'LANCAR' | 'BERMASALAH'>('LANCAR');
  const [amenities, setAmenities] = useState<'LENGKAP' | 'KURANG'>('LENGKAP');
  const [qcResult, setQcResult] = useState<'LOLOS_QC' | 'LOLOS_VERIFIKASI_TEKNISI' | 'REVISI_PERBAIKAN' | 'PERLU_PERBAIKAN'>('LOLOS_QC');
  const [inspectionCategory, setInspectionCategory] = useState<'PENGECEKAN_RUTIN' | 'PEMBERSIHAN_SELESAI_DIGUNAKAN' | 'VERIFIKASI_PASCA_TEKNISI' | 'BUTUH_PERBAIKAN'>('PEMBERSIHAN_SELESAI_DIGUNAKAN');
  const [qcNotes, setQcNotes] = useState('');

  // Cari tiket maintenance aktif untuk kamar yang sedang diinspeksi (jika ada)
  const activeMaintForQc = qcTargetRoom 
    ? maintenances.find(m => m.id === qcTargetRoom.activeMaintId || (m.roomId === qcTargetRoom.id && (m.status === 'MENUNGGU_QC' || m.status === 'PROSES' || m.status === 'MENUNGGU_PENUGASAN')))
    : undefined;

  useEffect(() => {
    if (isQcInspectionOpen && qcTargetRoom) {
      setCleanliness('BAIK');
      setLinenBed('LENGKAP_BERSIH');
      setAcElectricity('NORMAL');
      setPlumbingWater('LANCAR');
      setAmenities('LENGKAP');
      setQcNotes('');

      const isPostRepair = qcTargetRoom.qcStatus === 'MENUNGGU_QC' || activeMaintForQc?.status === 'MENUNGGU_QC';
      if (isPostRepair) {
        setQcResult('LOLOS_VERIFIKASI_TEKNISI');
        setInspectionCategory('VERIFIKASI_PASCA_TEKNISI');
      } else {
        setQcResult('LOLOS_QC');
        setInspectionCategory('PEMBERSIHAN_SELESAI_DIGUNAKAN');
      }
    }
  }, [isQcInspectionOpen, qcTargetRoom, activeMaintForQc?.status]);

  // Auto recommend PERLU_PERBAIKAN if issues are flagged
  const hasIssue = cleanliness === 'BURUK' || linenBed === 'PERLU_GANTI' || acElectricity === 'BERMASALAH' || plumbingWater === 'BERMASALAH' || amenities === 'KURANG' || inspectionCategory === 'BUTUH_PERBAIKAN';

  const handleQcInspectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qcTargetRoom) return;

    const isQcAula = qcTargetRoom.building === 'Ruang Pertemuan' || qcTargetRoom.roomNumber.toLowerCase().includes('aula');
    
    let decisionType: 'LOLOS_RUTIN' | 'LOLOS_PASCA_TEKNISI' | 'REVISI_TEKNISI' | 'PERLU_PERBAIKAN_BARU' = 'LOLOS_RUTIN';
    if (qcResult === 'LOLOS_VERIFIKASI_TEKNISI') {
      decisionType = 'LOLOS_PASCA_TEKNISI';
    } else if (qcResult === 'REVISI_PERBAIKAN') {
      decisionType = 'REVISI_TEKNISI';
    } else if (qcResult === 'PERLU_PERBAIKAN') {
      decisionType = 'PERLU_PERBAIKAN_BARU';
    }

    const categoryLabel = 
      inspectionCategory === 'PENGECEKAN_RUTIN' ? '[Pengecekan Rutin]' : 
      inspectionCategory === 'PEMBERSIHAN_SELESAI_DIGUNAKAN' ? '[Pembersihan Selesai Digunakan]' : 
      inspectionCategory === 'VERIFIKASI_PASCA_TEKNISI' ? '[Verifikasi Pasca Teknisi]' :
      '[Butuh Perbaikan Teknisi]';

    addQcInspection({
      id: `QC-${Date.now().toString().slice(-4)}`,
      roomId: qcTargetRoom.id,
      roomNumber: qcTargetRoom.roomNumber,
      building: qcTargetRoom.building,
      inspectorId: currentUser?.id || 'qc-1',
      inspectorName: currentUser?.fullName || 'Petugas QC',
      inspectionDate: new Date().toISOString().replace('T', ' ').substring(0, 19),
      cleanliness,
      linenBed,
      acElectricity,
      plumbingWater,
      amenities,
      result: qcResult,
      decisionType,
      notes: qcNotes ? `${categoryLabel} ${qcNotes}` : `${categoryLabel} Seluruh checklist kelayakan terverifikasi oleh Tim QC.`,
      facilityType: isQcAula ? 'RUANG_PERTEMUAN' : 'KAMAR'
    });
    closeModal('modalQcInspection');
  };

  const isKloterOpen = modalState.modalKloter?.isOpen;
  const isExportOpen = modalState.modalExport?.isOpen;
  const isCalendarDetailOpen = modalState.modalCalendarDetail?.isOpen;
  const calendarDetailData = modalState.modalCalendarDetail?.data;
  
  const isReceiptOpen = modalState.modalReceipt?.isOpen;
  const receiptData = modalState.modalReceipt?.data;
  const receiptTx = transactions.find(t => t.id === receiptData?.txId);

  // EXPORT STATE & HANDLER (PDF & Excel .xlsx)
  const [exportType, setExportType] = useState<ReportType>('KAMAR');
  const [exportPeriod, setExportPeriod] = useState<'Harian' | 'Mingguan' | 'Bulanan' | 'Tahunan'>('Harian');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('PDF');
  const [exportBuilding, setExportBuilding] = useState<string>('ALL');
  const [exportQcMode, setExportQcMode] = useState<'HISTORY' | 'READINESS'>('HISTORY');
  const [exportBreakfastPriority, setExportBreakfastPriority] = useState<'ALL' | 'CHECKIN_ONLY' | 'BOOKED_ONLY'>('ALL');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (modalState.modalExport?.isOpen) {
      if (modalState.modalExport?.data?.defaultType) {
        setExportType(modalState.modalExport.data.defaultType as ReportType);
      }
      if (modalState.modalExport?.data?.defaultBuilding) {
        setExportBuilding(modalState.modalExport.data.defaultBuilding);
      } else {
        setExportBuilding('ALL');
      }
      if (modalState.modalExport?.data?.defaultQcMode) {
        setExportQcMode(modalState.modalExport.data.defaultQcMode);
      }
      if (modalState.modalExport?.data?.defaultBreakfastPriority) {
        setExportBreakfastPriority(modalState.modalExport.data.defaultBreakfastPriority);
      }
      if (modalState.modalExport?.data?.defaultPeriod) {
        setExportPeriod(modalState.modalExport.data.defaultPeriod);
      }
      if (modalState.modalExport?.data?.defaultFormat) {
        setExportFormat(modalState.modalExport.data.defaultFormat);
      }
    }
  }, [modalState.modalExport?.isOpen, modalState.modalExport?.data]);

  const executeExport = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsExporting(true);
    try {
      const params = {
        type: exportType,
        format: exportFormat,
        period: exportPeriod,
        buildingFilter: exportBuilding,
        qcMode: exportQcMode,
        breakfastPriorityFilter: exportBreakfastPriority,
        transactions,
        maintenances,
        rooms,
        qcInspections: qcInspections || [],
        workSessions: workSessions || [],
        auditLogs: auditLogs || [],
        currentUser,
        breakfastOrders: breakfastOrders || [],
      };

      if (exportFormat === 'XLSX') {
        await exportToExcel(params);
        showToast(`Laporan ${exportType} (.xlsx) berhasil diunduh.`, 'success');
      } else {
        exportToPDF(params);
        showToast(`Dokumen PDF resmi siap dicetak atau disimpan.`, 'success');
      }
      closeModal('modalExport');
    } catch (err: any) {
      showToast('Gagal memproses laporan: ' + (err?.message || 'Terjadi kesalahan teknis'), 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      {isCheckinOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto overflow-x-hidden"
          onClick={() => closeModal('modalCheckin')}
        >
          <div 
            className={`bg-white dark:bg-slate-800 rounded-2xl shadow-2xl ${isAula ? 'max-w-2xl' : 'max-w-xl'} w-full overflow-hidden border border-slate-100 dark:border-slate-700 animate-in fade-in zoom-in duration-150 flex flex-col max-h-[92vh] my-auto min-w-0`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-hajj-800 to-hajj-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-base flex items-center space-x-2 flex-wrap gap-1">
                  <span>
                    {checkinData.actionType === 'EDIT_BOOKING'
                      ? `Sesuaikan Data Reservasi`
                      : checkinData.actionType === 'BOOKING' 
                      ? (isAula ? `Booking ${isSG ? 'Gedung Serbaguna' : 'Ruang Pertemuan / Aula'} (${room?.roomNumber})` : `Booking ${room?.type}`) 
                      : checkinMode === 'SELECT_BOOKING' && (isKamar && transactions.filter(t => t.roomId === room?.id && t.status === 'BOOKED').length > 0)
                        ? `Pilih Tamu Check-In ${room?.type}`
                        : (isAula ? `Check-In / Sewa ${isSG ? 'Gedung Serbaguna' : 'Ruang Pertemuan / Aula'}` : `Check-In ${room?.type}`)}
                  </span>
                  {room && (!room.qcStatus || room.qcStatus !== 'LOLOS_QC') && (
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-400 text-amber-950 rounded-full inline-flex items-center space-x-1 shadow-2xs">
                      <i className="fa-solid fa-triangle-exclamation text-[9px]"></i>
                      <span>Perlu Cek QC</span>
                    </span>
                  )}
                </h3>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-gold-300 mt-0.5">
                  <span className="font-semibold">{room?.building} - {room?.roomNumber}</span>
                  {room?.type && (
                    <span className="text-[10px] px-2 py-0.2 bg-white/20 text-white rounded-full font-bold">
                      {room.type} {room.bedType && !isAula ? `(${room.bedType})` : ''}
                    </span>
                  )}
                  {isAula ? (
                    <span className="text-[10px] text-emerald-300 font-mono font-bold">
                      {formatRupiah(facilitySessionRate)} / 8 Jam • {formatRupiah(facilityDailyRate)} / 12 Jam
                    </span>
                  ) : room?.pricePerNight && room.pricePerNight > 0 ? (
                    <span className="text-[10px] text-emerald-300 font-mono font-bold">
                      {formatRupiah(room.pricePerNight)}/mlm
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center space-x-1.5">
                {(checkinData.actionType === 'EDIT_BOOKING' || checkinData.returnToRoomId) && (
                  <button 
                    type="button" 
                    onClick={() => {
                      closeModal('modalCheckin');
                      const targetRoomId = checkinData.returnToRoomId || checkinData.roomId || room?.id;
                      if (targetRoomId) {
                        openModal('modalRoomDetail', { roomId: targetRoomId });
                      }
                    }} 
                    className="px-2.5 py-1.5 bg-white/15 hover:bg-white/25 text-white rounded-lg text-xs font-semibold flex items-center space-x-1 transition border border-white/20 cursor-pointer"
                    title="Kembali ke rincian kamar sebelumnya"
                  >
                    <i className="fa-solid fa-arrow-left text-[11px]"></i>
                    <span>Kembali</span>
                  </button>
                )}
                <button onClick={() => closeModal('modalCheckin')} className="text-white/70 hover:text-white text-lg p-1 rounded-lg hover:bg-white/10 transition cursor-pointer" title="Tutup">
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>

            {/* QC STATUS ALERT BANNER DI BAGIAN ATAS POPUP FORM */}
            {room && (!room.qcStatus || room.qcStatus !== 'LOLOS_QC') && (
              <div className="bg-amber-50 border-b-2 border-amber-300 px-6 py-3 text-amber-900 flex items-start space-x-3 shrink-0">
                <div className="w-8 h-8 rounded-lg bg-amber-200 text-amber-800 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                  <i className="fa-solid fa-triangle-exclamation text-base text-amber-700"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 flex-wrap gap-1">
                    <span className="font-extrabold text-xs uppercase tracking-wide text-amber-900">Perlu Cek QC</span>
                    <span className="text-[10px] font-bold px-2 py-0.2 bg-amber-200/90 text-amber-950 border border-amber-300 rounded-md">
                      {room.qcStatus === 'MENUNGGU_QC'
                        ? 'Menunggu Verifikasi QC'
                        : room.qcStatus === 'PERLU_PERBAIKAN'
                        ? 'Perlu Perbaikan Teknisi'
                        : 'Belum Diinspeksi QC'}
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                    Fasilitas <strong>{room.roomNumber} ({room.building})</strong> saat ini berstatus <strong>Perlu Cek QC</strong>. Formulir booking tetap dapat diisi dan diproses untuk reservasi jadwal mendatang. Pastikan inspeksi mutu telah diselesaikan sebelum tamu check-in fisik.
                  </p>
                </div>
              </div>
            )}

            {/* JIKA MODE CHECKIN GEDUNG DAN MEMILIKI DATA BOOKING, TAMPILKAN PILIHAN TAMU BOOKING */}
            {checkinData.actionType === 'CHECKIN' && !isAula && checkinMode === 'SELECT_BOOKING' && transactions.filter(t => t.roomId === room?.id && t.status === 'BOOKED').length > 0 ? (
              <div className="p-6 space-y-4 text-xs overflow-y-auto flex-1 custom-scrollbar">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900">
                  <div className="font-bold text-xs flex items-center space-x-1.5 text-blue-800">
                    <i className="fa-solid fa-calendar-check text-blue-600"></i>
                    <span>Ditemukan {transactions.filter(t => t.roomId === room?.id && t.status === 'BOOKED').length} Reservasi Booking untuk Kamar {room?.roomNumber}</span>
                  </div>
                  <p className="text-[11px] text-blue-700 mt-1">
                    Silakan pilih data tamu yang telah tiba untuk melakukan proses Check-In ke dalam kamar:
                  </p>
                </div>

                <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                  {transactions.filter(t => t.roomId === room?.id && t.status === 'BOOKED').map((bTx) => (
                    <div 
                      key={bTx.id} 
                      className="p-3.5 bg-white border-2 border-slate-200 hover:border-emerald-500 rounded-xl transition shadow-xs space-y-2.5"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-sm text-slate-900">{bTx.guestName}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              bTx.category === 'JEMAAH' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
                            }`}>
                              {bTx.category === 'JEMAAH' ? 'Jemaah Haji' : 'Tamu Umum'}
                            </span>
                          </div>
                          {bTx.kloter && bTx.kloter !== '-' && (
                            <div className="text-[11px] text-blue-700 font-semibold mt-0.5">
                              <i className="fa-solid fa-kaaba mr-1"></i> Kloter: {bTx.kloter}
                            </div>
                          )}
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">ID Reservasi: {bTx.id}</div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                          BOOKED
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <div>
                          <i className="fa-regular fa-calendar-check text-slate-400 mr-1"></i>
                          Jadwal: <span className="font-semibold text-slate-800">{formatIndonesianDate(bTx.startDate)}</span>
                        </div>
                        <div>
                          <i className="fa-solid fa-clock text-slate-400 mr-1"></i>
                          Durasi: <span className="font-semibold text-slate-800">{bTx.duration} {bTx.durationUnit || 'Malam'}</span>
                        </div>
                        <div>
                          <i className="fa-solid fa-bed text-slate-400 mr-1"></i>
                          Sewa: <span className="font-semibold text-slate-800">{bTx.rentType || 'Per Kamar'}</span>
                        </div>
                        <div>
                          <i className="fa-solid fa-utensils text-slate-400 mr-1"></i>
                          Sarapan: {bTx.breakfast ? (
                            <span className="font-bold text-orange-700">
                              {bTx.breakfastMenu || 'Pesan'} ({bTx.breakfastPortions || 1} Porsi × {bTx.breakfastDays || bTx.duration} Hari)
                            </span>
                          ) : (
                            <span className="text-slate-400">Tidak Pesan</span>
                          )}
                        </div>
                        <div className="col-span-2 pt-1 border-t border-slate-200/60 flex items-center justify-between">
                          <span className="text-slate-500">
                            <i className="fa-solid fa-mattress-pillow text-indigo-500 mr-1"></i>
                            Extra Bed:
                          </span>
                          {bTx.extraBed ? (
                            <span className="font-bold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                              +{bTx.extraBedCount || 1} Bed ({bTx.extraBedNotes || 'Kasur Lipat Lengkap'})
                            </span>
                          ) : (
                            <span className="text-slate-400">Tidak Ada</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-end space-x-2 pt-1 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => {
                            setCategory(bTx.category);
                            setGuestName(bTx.guestName);
                            setKloter(bTx.kloter || '');
                            setStartDate(bTx.startDate);
                            setDuration(bTx.duration);
                            setRentType(bTx.rentType || 'Per Kamar');
                            setPhone(bTx.phone || '');
                            setNotes(bTx.notes || '');
                            setIncludeBreakfast(!!bTx.breakfast);
                            setBreakfastMenu(bTx.breakfastMenu || 'Nasi Goreng Spesial');
                            setBreakfastPortions(bTx.breakfastPortions || 1);
                            setBreakfastDays(bTx.breakfastDays || bTx.duration);
                            setBreakfastStatus(bTx.breakfastStatus || 'MENUNGGU');
                            setIncludeExtraBed(!!bTx.extraBed);
                            setExtraBedCount(bTx.extraBedCount || 1);
                            setExtraBedNotes(bTx.extraBedNotes || '1 Kasur Lipat + Bantal & Sprei Bersih');
                            setSelectedBookingTxId(bTx.id);
                            setCheckinMode('NEW_GUEST');
                          }}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition flex items-center space-x-1"
                          title="Lihat & sesuaikan rincian sebelum check-in"
                        >
                          <i className="fa-solid fa-pen-to-square"></i>
                          <span>Sesuaikan Data</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (room) {
                              activateCheckin(room.id, bTx.id);
                              closeModal('modalCheckin');
                              openModal('modalInvoice', { transaction: { ...bTx, status: 'TERISI' }, room, returnToRoomId: room.id });
                            }
                          }}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow flex items-center space-x-1.5 transition"
                          title="Langsung Check-In tamu ini"
                        >
                          <i className="fa-solid fa-door-open"></i>
                          <span>Check-In Tamu Ini</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBookingTxId(null);
                      setGuestName('');
                      setKloter('');
                      setPhone('');
                      setNotes('');
                      setIncludeBreakfast(false);
                      setStartDate(realToday);
                      setDuration(1);
                      setCheckinMode('NEW_GUEST');
                    }}
                    className="text-xs text-blue-700 hover:text-blue-900 font-bold flex items-center space-x-1 py-1"
                  >
                    <i className="fa-solid fa-user-plus"></i>
                    <span>+ Check-In Tamu Baru (Walk-In / Tanpa Reservasi)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => closeModal('modalCheckin')}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs"
                  >
                    Batal
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCheckin} className="p-4 sm:p-6 space-y-4 text-xs overflow-y-auto overflow-x-hidden flex-1 custom-scrollbar w-full min-w-0">
                {checkinData.actionType === 'CHECKIN' && !isAula && transactions.filter(t => t.roomId === room?.id && t.status === 'BOOKED').length > 0 && (
                  <div className="flex items-center justify-between bg-blue-50 p-2.5 rounded-lg border border-blue-200">
                    <div className="flex items-center space-x-1.5 text-xs text-blue-900">
                      <i className="fa-solid fa-circle-info text-blue-600"></i>
                      <span>
                        {selectedBookingTxId 
                          ? <span>Menyesuaikan data Check-In Tamu: <strong className="text-slate-900">{guestName}</strong></span>
                          : <span>Check-In Tamu Baru (Walk-in tanpa booking)</span>
                        }
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBookingTxId(null);
                        setCheckinMode('SELECT_BOOKING');
                      }}
                      className="text-xs text-blue-700 hover:text-blue-900 font-bold underline flex items-center space-x-1"
                    >
                      <i className="fa-solid fa-list-check"></i>
                      <span>Pilih dari Booking ({transactions.filter(t => t.roomId === room?.id && t.status === 'BOOKED').length})</span>
                    </button>
                  </div>
                )}

                {/* Banner pembeda Tamu Individu vs Tamu Rombongan */}
                {!isAula && (
                  <div className="p-3 bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 dark:from-slate-800 dark:via-slate-800 dark:to-slate-800 border border-emerald-200 dark:border-emerald-800/60 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5 text-emerald-900 dark:text-emerald-300 font-bold text-xs">
                        <i className="fa-solid fa-user-check text-emerald-700 dark:text-emerald-400"></i>
                        <span>Mode: Registrasi Tamu Individu (1 Penyewa Kamar)</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 rounded">
                        1 Kamar • 1 Penyewa
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                      Formulir ini dikhususkan untuk 1 orang penyewa perseorangan. Jika Anda ingin mendaftarkan <strong>Tamu Rombongan</strong> (Instansi, Jemaah Haji Kloter, atau Tamu Umum Rombongan dengan estimasi peserta &gt; 1 orang, alokasi multi-kamar, paket katering, atau sewa aula):
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        closeModal('modalCheckin');
                        openModal('modalGroupRegistration', {
                          defaultGroupType: category === 'JEMAAH' ? 'JEMAAH_HAJI' : 'UMUM',
                          initialGroupName: guestName || undefined
                        });
                      }}
                      className="inline-flex items-center space-x-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300 hover:text-emerald-950 dark:hover:text-emerald-100 underline cursor-pointer pt-0.5"
                    >
                      <i className="fa-solid fa-users-rectangle"></i>
                      <span>Beralih ke Formulir Pendaftaran Data Rombongan →</span>
                    </button>
                  </div>
                )}

                <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center space-x-2.5">
                    <div className={`w-8 h-8 rounded-lg ${isSG ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300' : isAula ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300'} flex items-center justify-center text-sm font-bold shrink-0`}>
                      <i className={`fa-solid ${isSG ? 'fa-building-columns' : isAula ? 'fa-landmark' : 'fa-user'}`}></i>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Kategori Tamu:</span>
                        <span className={`px-2.5 py-0.5 rounded text-[11px] font-black shadow-2xs ${isSG ? 'bg-amber-700 text-white' : isAula ? 'bg-purple-700 text-white' : 'bg-emerald-700 text-white'}`}>
                          {isAula ? 'Penyewa Perseorangan / Mandiri' : 'Tamu Individu / Personal'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {isAula
                          ? `Formulir pemesanan sewa ${isSG ? 'gedung serbaguna' : 'ruang pertemuan / aula'} untuk pemohon perseorangan, resepsi keluarga, seminar, atau acara khusus.`
                          : 'Formulir ini dikhususkan untuk pemesanan kamar perseorangan (1 Kamar).'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      closeModal('modalCheckin');
                      openModal('modalGroupRegistration', {
                        defaultGroupType: category === 'JEMAAH' ? 'JEMAAH_HAJI' : 'UMUM',
                        initialGroupName: guestName || undefined,
                        initialIncludeAula: isAula,
                        initialMeetingRoomId: isAula ? (room?.id || undefined) : undefined
                      });
                    }}
                    className={`text-[11px] font-bold ${isSG ? 'text-amber-800 dark:text-amber-400 hover:text-amber-950' : isAula ? 'text-purple-700 dark:text-purple-400 hover:text-purple-900' : 'text-emerald-700 dark:text-emerald-400 hover:text-emerald-900'} underline flex items-center gap-1 cursor-pointer shrink-0 self-start sm:self-auto`}
                  >
                    <i className="fa-solid fa-users text-[10px]"></i>
                    <span>Pendaftaran Rombongan (Kloter/Instansi) →</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Nama Lengkap Penyewa <span className="text-rose-500">*</span>
                    </label>
                    <input 
                      type="text" 
                      value={guestName} 
                      onChange={e => setGuestName(e.target.value)} 
                      required 
                      placeholder="Contoh: Bp. Hendra Kurniawan" 
                      className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-hajj-600 font-medium" 
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Nomor KTP / NIK (Identitas Tamu)
                    </label>
                    <input 
                      type="text" 
                      value={nikKtp} 
                      onChange={e => setNikKtp(e.target.value)} 
                      placeholder="Contoh: 3201..." 
                      className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-hajj-600 font-mono" 
                    />
                  </div>
                </div>
                {category === 'JEMAAH' && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Nomor Kloter & Asal Embarkasi</label>
                    <input type="text" value={kloter} onChange={e => setKloter(e.target.value)} placeholder="Contoh: JKG-04 (DKI Jakarta)" className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-hajj-600" />
                  </div>
                )}
                {isAula ? (
                  /* Form Durasi & Jadwal Khusus Gedung Serbaguna & Ruang Pertemuan / Aula (Responsive & No Horizontal Scroll) */
                  <div className="space-y-3.5 p-3.5 bg-purple-50/60 dark:bg-slate-900/60 rounded-xl border border-purple-200 dark:border-slate-700">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Tanggal Pemakaian */}
                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1 text-xs">
                          Tanggal Mulai Pemakaian <span className="text-rose-500">*</span>
                        </label>
                        <input 
                          type="date" 
                          value={startDate} 
                          onChange={e => setStartDate(e.target.value)} 
                          required 
                          className={`w-full p-2.5 border rounded-lg outline-none font-medium transition text-xs ${isAulaDateFull ? 'border-red-400 bg-red-50/50 text-red-900 focus:ring-2 focus:ring-red-500' : 'border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-purple-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100'}`} 
                        />
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <button 
                            type="button" 
                            onClick={() => setStartDate(realToday)} 
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition cursor-pointer ${startDate === realToday ? 'bg-purple-800 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'}`}
                          >
                            Hari Ini
                          </button>
                          <button 
                            type="button" 
                            onClick={() => setStartDate(prev => addDaysToDateStr(prev, 1))} 
                            className="px-2.5 py-1 rounded-md text-[10px] font-bold transition cursor-pointer bg-purple-600 hover:bg-purple-700 text-white border border-purple-400 shadow-2xs"
                          >
                            +1 Hari
                          </button>
                          <button 
                            type="button" 
                            onClick={() => setStartDate(prev => addDaysToDateStr(prev, 2))} 
                            className="px-2.5 py-1 rounded-md text-[10px] font-bold transition cursor-pointer bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50"
                          >
                            +2 Hari
                          </button>
                          <button 
                            type="button" 
                            onClick={() => setStartDate(prev => addDaysToDateStr(prev, 3))} 
                            className="px-2.5 py-1 rounded-md text-[10px] font-bold transition cursor-pointer bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50"
                          >
                            +3 Hari
                          </button>
                        </div>
                      </div>

                      {/* Durasi Sewa Hari */}
                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1 text-xs">
                          Durasi Hari Sewa
                        </label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            min="1" 
                            max="30"
                            value={aulaRentalDays} 
                            onChange={e => setAulaRentalDays(Math.max(1, parseInt(e.target.value) || 1))} 
                            className="w-16 p-2 border border-purple-300 dark:border-purple-700 rounded-lg outline-none focus:ring-2 focus:ring-purple-600 font-bold text-center text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" 
                          />
                          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Hari</span>
                          <div className="flex flex-wrap items-center gap-1">
                            {[1, 2, 3, 5].map(d => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => setAulaRentalDays(d)}
                                className={`px-2 py-1 text-[10px] font-bold rounded-md border transition cursor-pointer ${
                                  aulaRentalDays === d 
                                    ? 'bg-purple-700 text-white border-purple-800 shadow-2xs' 
                                    : 'bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700 hover:bg-purple-50'
                                }`}
                              >
                                {d} Hari
                              </button>
                            ))}
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5">
                          Sewa harian atau multi-hari dihitung berdasarkan jumlah hari pemakaian.
                        </p>
                      </div>
                    </div>

                    {/* Sesi Sewa (8 Jam vs 12 Jam) */}
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1.5 text-xs">
                        Pilihan Paket Sesi Sewa
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div 
                          onClick={() => {
                            if (!is8HourDisabled) setDuration(8);
                          }}
                          className={`p-2.5 rounded-xl border transition cursor-pointer flex flex-col justify-between space-y-1 ${
                            is8HourDisabled 
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 opacity-60 cursor-not-allowed'
                              : duration === 8 
                              ? 'bg-purple-100/90 dark:bg-purple-950/80 border-purple-600 text-purple-950 dark:text-purple-100 shadow-2xs ring-1 ring-purple-500'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-purple-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs">Paket Sesi (8 Jam)</span>
                            <span className="font-mono font-bold text-xs text-purple-900 dark:text-purple-300">{formatRupiah(facilitySessionRate)}</span>
                          </div>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                            Maksimal 2 Penyewa bergantian • {isAulaOnly8Available ? 'Sesi 2 Tersedia' : (aulaCount8OnDate >= 2 ? 'Kuota 2 Sesi Penuh' : 'Tersedia')}
                          </span>
                        </div>

                        <div 
                          onClick={() => {
                            if (!aulaCount8OnDate && !hasAnyTxAcrossProposedDates) setDuration(12);
                          }}
                          className={`p-2.5 rounded-xl border transition cursor-pointer flex flex-col justify-between space-y-1 ${
                            aulaCount8OnDate > 0 || hasAnyTxAcrossProposedDates 
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 opacity-60 cursor-not-allowed'
                              : duration === 12 
                              ? 'bg-purple-100/90 dark:bg-purple-950/80 border-purple-600 text-purple-950 dark:text-purple-100 shadow-2xs ring-1 ring-purple-500'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-purple-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs">Paket Harian Penuh (12 Jam)</span>
                            <span className="font-mono font-bold text-xs text-purple-900 dark:text-purple-300">{formatRupiah(facilityDailyRate)}</span>
                          </div>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                            Eksklusif 1 Penyewa Seharian Penuh • {aulaCount8OnDate > 0 ? 'Tidak Tersedia (ada sesi 8 jam)' : (hasAnyTxAcrossProposedDates ? 'Ada Booking Aktif' : 'Tersedia')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Ringkasan Subtotal Sewa */}
                    <div className="p-2.5 bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-800 rounded-lg text-xs flex flex-wrap items-center justify-between gap-1 font-semibold text-purple-950 dark:text-purple-200">
                      <span>
                        {duration === 8 ? 'Paket Sesi 8 Jam/Hari' : 'Paket Harian Penuh 12 Jam/Hari'} × {aulaRentalDays} Hari
                      </span>
                      <span className="font-mono font-bold text-sm text-purple-900 dark:text-purple-300">
                        Total Sewa: {formatRupiah(calculateMeetingRate(duration, aulaRentalDays))}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Tipe Sewa</label>
                      <select value={rentType} onChange={e => setRentType(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-hajj-600">
                        <option value="Per Kamar">Per Kamar</option>
                        <option value="Per Bed">Per Bed</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between mb-1 mt-3">
                      <label className="block font-bold text-slate-700">
                        Tanggal Mulai / Check-In
                      </label>
                      {startDate === realTomorrow ? (
                        <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full border border-purple-200">
                          +1 Hari dari Real Hari Ini (Besok)
                        </span>
                      ) : startDate === realToday ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                          Real Hari Ini
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                          {formatIndonesianDate(startDate)}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <input 
                          type="date" 
                          value={startDate} 
                          onChange={e => setStartDate(e.target.value)} 
                          required 
                          className={`w-full p-2.5 border rounded-lg outline-none font-medium transition ${kamarOverlap ? 'border-red-400 bg-red-50/50 text-red-900 focus:ring-2 focus:ring-red-500' : 'border-slate-300 focus:ring-2 focus:ring-hajj-600'}`} 
                        />
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <button 
                            type="button" 
                            onClick={() => setStartDate(realToday)} 
                            className={`px-2 py-1 rounded text-[10px] font-bold transition flex-1 text-center ${startDate === realToday ? 'bg-hajj-700 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                            title="Pilih Real Hari Ini"
                          >
                            Hari Ini
                          </button>
                          <button 
                            type="button" 
                            onClick={() => setStartDate(prev => addDaysToDateStr(prev, 1))} 
                            className="px-2 py-1 rounded text-[10px] font-bold transition flex-1 text-center bg-purple-600 hover:bg-purple-700 text-white border border-purple-300 shadow-sm"
                            title="Tambah +1 hari ke depan"
                          >
                            +1 Hari
                          </button>
                          <button 
                            type="button" 
                            onClick={() => setStartDate(prev => addDaysToDateStr(prev, 2))} 
                            className="px-2 py-1 rounded text-[10px] font-bold transition flex-1 text-center bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200"
                            title="Tambah +2 hari ke depan"
                          >
                            +2 Hari
                          </button>
                          <button 
                            type="button" 
                            onClick={() => setStartDate(prev => addDaysToDateStr(prev, 3))} 
                            className="px-2 py-1 rounded text-[10px] font-bold transition flex-1 text-center bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200"
                            title="Tambah +3 hari ke depan"
                          >
                            +3 Hari
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Durasi Sewa Kamar</label>
                        <div className="flex items-center space-x-2">
                          <input 
                            type="number" 
                            min="1" 
                            value={duration} 
                            onChange={e => setDuration(Number(e.target.value))} 
                            required 
                            className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-hajj-600 font-semibold" 
                          />
                          <span className="text-slate-500 font-semibold">Malam</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                  {/* Visual timeline indicator */}
                  <div className="mt-2.5 p-2 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-300">
                    <div className="flex items-center space-x-1.5">
                      <i className="fa-solid fa-arrow-right-to-bracket text-emerald-600"></i>
                      <span>Masuk: <strong className="text-slate-900 dark:text-slate-100">{formatIndonesianDate(startDate)}</strong></span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      {isAula ? `${aulaRentalDays} Hari (${duration} Jam/Hari)` : `${duration} Malam`}
                    </span>
                    <div className="flex items-center space-x-1.5">
                      <i className="fa-solid fa-arrow-right-from-bracket text-rose-600"></i>
                      <span>Keluar: <strong className="text-slate-900 dark:text-slate-100">{formatIndonesianDate(addDaysToDateStr(startDate, isAula ? aulaRentalDays : duration))}</strong></span>
                    </div>
                  </div>

                  {/* Real-time status banners for capacity logic */}
                  {isAula && (
                    <div className="mt-2.5">
                      {isAulaDateFull ? (
                        <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-red-900 text-xs space-y-1.5">
                          <div className="font-bold flex items-center space-x-1.5 text-red-700">
                            <i className="fa-solid fa-circle-exclamation text-base"></i>
                            <span>Kuota Sewa Penuh pada Tanggal Ini ({formatIndonesianDate(startDate)})</span>
                          </div>
                          <p className="text-[11px] text-red-800 leading-relaxed">
                            {aulaHas12OrMultiDay 
                              ? `${isSG ? 'Gedung Serbaguna' : 'Ruang Pertemuan'} telah disewa 12 Jam / Multi-hari penuh oleh 1 Penyewa (${aulaTxsOnDate[0]?.guestName}). Pilihan 12 Jam / Multi-hari hanya mengizinkan 1 penyewa.` 
                              : `${isSG ? 'Gedung Serbaguna' : 'Ruang Pertemuan'} telah mencapai batas maksimal 2 Penyewa pilihan 8 Jam (${aulaTxsOnDate.map(t => t.guestName).join(' & ')}).`}
                          </p>
                          <div className="pt-1">
                            <button 
                              type="button" 
                              onClick={() => setStartDate(prev => addDaysToDateStr(prev, 1))} 
                              className="px-3 py-1.5 bg-hajj-700 hover:bg-hajj-800 text-white rounded-lg text-xs font-bold shadow flex items-center space-x-1.5 transition cursor-pointer"
                            >
                              <i className="fa-solid fa-calendar-plus text-gold-300"></i>
                              <span>Pindah ke Besok (+1 Hari: {formatIndonesianDate(addDaysToDateStr(startDate, 1))})</span>
                            </button>
                          </div>
                        </div>
                      ) : isAulaOnly8Available ? (
                        <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs">
                          <div className="font-bold flex items-center space-x-1.5 text-blue-800">
                            <i className="fa-solid fa-circle-info"></i>
                            <span>Sudah ada 1 Penyewa ({aulaTxsOnDate[0]?.guestName} - 8 Jam)</span>
                          </div>
                          <p className="text-[11px] text-blue-700 mt-0.5">
                            Tersedia sisa 1 Sesi (8 Jam) lagi untuk penyewa kedua. Paket 12 Jam dinonaktifkan otomatis.
                          </p>
                        </div>
                      ) : (
                        <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs flex items-center space-x-2">
                          <i className="fa-solid fa-circle-check text-emerald-600 text-base"></i>
                          <div>
                            <div className="font-bold text-emerald-800">{isSG ? 'Gedung Serbaguna' : 'Ruangan'} Kosong pada Tanggal Ini</div>
                            <div className="text-[11px] text-emerald-700">Tersedia pilihan paket 8 Jam (maksimal 2 penyewa) atau 12 Jam (maksimal 1 penyewa).</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {isAula && (
                    <div className="mt-3">
                      <label className="block font-bold text-slate-700 mb-1 text-xs">
                        Jumlah Peserta / Kapasitas Rombongan (Orang) <span className="text-rose-500">*</span>
                      </label>
                      <div className="flex items-center space-x-2">
                        <input 
                          type="number" 
                          min="1" 
                          max="2000" 
                          value={aulaPax} 
                          onChange={e => setAulaPax(Math.max(1, parseInt(e.target.value) || 1))} 
                          required 
                          className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-hajj-600 font-bold text-xs bg-white" 
                        />
                        <span className="text-slate-500 font-semibold text-xs whitespace-nowrap">Orang / Peserta</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">
                        Jumlah peserta aula ini otomatis disinkronkan dengan laporan rekapitulasi, export PDF, dan Excel.
                      </p>
                    </div>
                  )}

                  {!isAula && kamarOverlap && (
                    <div className="mt-2.5 p-3 bg-red-50 border border-red-300 rounded-xl text-red-900 text-xs space-y-1.5">
                      <div className="font-bold flex items-center space-x-1.5 text-red-700">
                        <i className="fa-solid fa-circle-exclamation text-base"></i>
                        <span>Kamar Sudah Terisi / Di-Booking pada Rentang Tanggal Ini</span>
                      </div>
                      <p className="text-[11px] text-red-800">
                        Silakan pilih tanggal lain untuk reservasi kamar ini (+1 hari dari tanggal yang tertampil).
                      </p>
                      <button 
                        type="button" 
                        onClick={() => setStartDate(prev => addDaysToDateStr(prev, 1))} 
                        className="px-3 py-1.5 bg-hajj-700 hover:bg-hajj-800 text-white rounded-lg text-xs font-bold shadow flex items-center space-x-1.5 transition cursor-pointer"
                      >
                        <i className="fa-solid fa-calendar-plus text-gold-300"></i>
                        <span>Pindah ke Besok (+1 Hari: {formatIndonesianDate(addDaysToDateStr(startDate, 1))})</span>
                      </button>
                    </div>
                  )}

                  {!isAula && checkinData.actionType === 'CHECKIN' && existingTerisi.length > 0 && (
                    <div className="mt-2.5 p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs space-y-1">
                      <div className="font-bold flex items-center space-x-1.5 text-amber-800">
                        <i className="fa-solid fa-users text-amber-600"></i>
                        <span>Info Hunian: Terdapat Tamu yang Sedang Menginap</span>
                      </div>
                      <p className="text-[11px] text-amber-700 leading-relaxed">
                        Kamar saat ini tercatat terisi oleh: <strong>{existingTerisi.map(t => t.guestName).join(', ')}</strong> (Menunggu proses Check-Out). Check-In tamu baru / tambahan jemaah tetap dapat diproses.
                      </p>
                    </div>
                  )}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nomor Kontak / Telepon</label>
                  <input type="text" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0812xxxxxxxx" className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-hajj-600" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Keperluan / Catatan Tambahan</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Tujuan sewa / kebutuhan khusus..." className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-hajj-600"></textarea>
                </div>
                
                {!isAula && (
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div>
                        <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                          <i className="fa-solid fa-utensils text-orange-600"></i>
                          <span>Paket Konsumsi Koperasi &amp; Detail Pack</span>
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Pilihan paket makanan katering, sarapan pagi, atau coffee break yang disediakan koperasi
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-[11px] font-bold text-orange-800 bg-orange-100 px-2.5 py-1 rounded-lg border border-orange-200">
                          Durasi: {duration} {isAula ? 'Sesi' : 'Malam'}
                        </span>
                      </div>
                    </div>

                    {/* Pilihan 4 Jenis Paket Konsumsi */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: 'TIDAK', label: 'Tidak Pakai Konsumsi', desc: 'Konsumsi Mandiri / 0 Pack', icon: 'fa-ban' },
                        { id: 'SARAPAN', label: 'Sarapan Pagi', desc: '1x Sarapan / Hari', icon: 'fa-mug-hot' },
                        { id: 'FULLBOARD', label: 'Fullboard Diklat', desc: '3x Makan + 2x Snack', icon: 'fa-bowl-food' },
                        { id: 'SNACK_AULA', label: 'Snack Box Aula', desc: 'Snack & Kopi Rapat', icon: 'fa-cookie-bite' },
                      ].map((pkg) => (
                        <div
                          key={pkg.id}
                          onClick={() => {
                            setCateringPackage(pkg.id as any);
                            setIncludeBreakfast(pkg.id !== 'TIDAK');
                            if (pkg.id === 'TIDAK') {
                              setBreakfastPortions(0);
                            } else if (breakfastPortions === 0) {
                              setBreakfastPortions(1);
                            }
                          }}
                          className={`p-2.5 rounded-xl border-2 text-center cursor-pointer transition flex flex-col items-center justify-center ${
                            cateringPackage === pkg.id
                              ? 'border-orange-500 bg-orange-50/80 ring-1 ring-orange-400 font-bold shadow-2xs'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <i className={`fa-solid ${pkg.icon} text-base mb-1 ${cateringPackage === pkg.id ? 'text-orange-600' : 'text-slate-400'}`}></i>
                          <div className="text-xs text-slate-800">{pkg.label}</div>
                          <div className="text-[10px] text-slate-500">{pkg.desc}</div>
                        </div>
                      ))}
                    </div>

                    {/* Jika TIDAK PAKAI KONSUMSI dipilih */}
                    {cateringPackage === 'TIDAK' && (
                      <div className="space-y-2 pt-2 border-t border-slate-100 bg-slate-50/70 p-3 rounded-xl border border-slate-200">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <label className="block font-bold text-slate-800 text-xs mb-0.5">
                              Jumlah Pack Konsumsi (Default 0 - Mode: Tanpa Konsumsi)
                            </label>
                            <p className="text-[11px] text-slate-500">
                              Tamu mandiri / tanpa konsumsi. Jumlah pack disetel <strong>0</strong> secara default.
                            </p>
                          </div>
                          <div className="flex items-center space-x-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setBreakfastPortions(prev => Math.max(0, prev - 1))}
                              className="w-8 h-8 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-sm flex items-center justify-center transition cursor-pointer shadow-2xs"
                              title="Kurangi pack"
                            >
                              -
                            </button>
                            <input 
                              type="number"
                              min={0}
                              value={breakfastPortions}
                              onChange={(e) => setBreakfastPortions(Math.max(0, parseInt(e.target.value) || 0))}
                              onFocus={(e) => e.target.select()}
                              className="w-16 px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-slate-500 outline-none font-bold text-center text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => setBreakfastPortions(prev => prev + 1)}
                              className="w-8 h-8 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-sm flex items-center justify-center transition cursor-pointer shadow-2xs"
                              title="Tambah pack"
                            >
                              +
                            </button>
                            <span className="text-xs font-bold text-slate-600">Pack</span>
                          </div>
                        </div>
                        {/* Shortcut Chips */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[10px] text-slate-400 font-semibold">Isi Cepat:</span>
                          <button
                            type="button"
                            onClick={() => setBreakfastPortions(0)}
                            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition cursor-pointer ${
                              breakfastPortions === 0 
                                ? 'bg-slate-800 text-white border-slate-900 shadow-2xs' 
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            0 Pack (Default)
                          </button>
                          {[1, 2, 4].map(p => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setBreakfastPortions(p)}
                              className={`px-2 py-0.5 text-[10px] font-bold rounded border transition cursor-pointer ${
                                breakfastPortions === p 
                                  ? 'bg-slate-800 text-white border-slate-900' 
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {p} Pack
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Jika PAKET KONSUMSI AKTIF dipilih */}
                    {cateringPackage !== 'TIDAK' && (
                      <div className="space-y-3 pt-2">
                        <div className="space-y-2">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <label className="block font-bold text-slate-800 text-xs flex items-center gap-1.5">
                              <i className="fa-solid fa-utensils text-orange-600"></i>
                              <span>Pilihan Menu Hidangan / Katering</span>
                            </label>
                            <span className="text-[10.5px] font-semibold text-orange-800 bg-orange-100/80 px-2 py-0.5 rounded border border-orange-200">
                              {cateringPackage === 'FULLBOARD' ? 'Paket 3x Makan + 2x Snack Diklat' : cateringPackage === 'SNACK_AULA' ? 'Sajian Snack Box & Coffee Break' : 'Menu Sarapan Pagi Koperasi'}
                            </span>
                          </div>

                          {/* Themed Interactive Food Menu Cards */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto p-1 custom-scrollbar">
                            {(breakfastMenuItems.length > 0 ? (
                              breakfastMenuItems.map(m => ({
                                title: m.name,
                                desc: m.description || 'Pilihan menu lezat dan higienis bersertifikasi halal',
                                price: m.price,
                                priceText: `Rp ${m.price.toLocaleString('id-ID')}`,
                                badge: 'Menu Koperasi'
                              }))
                            ) : cateringPackage === 'FULLBOARD' ? [
                              {
                                title: 'Paket Nusantara Komplit',
                                desc: 'Rawon Daging Sapi, Ayam Bakar Madu, Ikan Bakar Jimbaran, Snack Lemper Ayam & Risol Mayo',
                                price: 120000,
                                priceText: 'Rp 120.000 / pax',
                                badge: '3x Makan + 2x Snack'
                              },
                              {
                                title: 'Paket Tradisional Betawi',
                                desc: 'Soto Betawi Daging Gurih, Ayam Goreng Lengkuas, Asinan Sayur, Kerupuk & Aneka Kue Basah',
                                price: 120000,
                                priceText: 'Rp 120.000 / pax',
                                badge: '3x Makan + 2x Snack'
                              },
                              {
                                title: 'Paket Standar Diklat Asrama Haji',
                                desc: 'Variasi hidangan resmi standar Kementerian Agama RI selama rotasi menu bergizi seimbang',
                                price: 110000,
                                priceText: 'Rp 110.000 / pax',
                                badge: 'Menu Resmi Diklat'
                              }
                            ] : cateringPackage === 'SNACK_AULA' ? [
                              {
                                title: 'Snack Box Premium Acara',
                                desc: 'Kroket Daging Sapi, Bolu Gulung Keju, Pastel Telur, Air Mineral Cup, Kopi & Teh Tarik Hangat',
                                price: 25000,
                                priceText: 'Rp 25.000 / pax',
                                badge: 'Coffee Break Premium'
                              },
                              {
                                title: 'Snack Box Ekonomis Rapat',
                                desc: 'Lontong Sayur Ayam, Lemper Bakar, Tahu Bakso Semarang, Permen & Air Mineral 330ml',
                                price: 20000,
                                priceText: 'Rp 20.000 / pax',
                                badge: 'Snack Rapat Singkat'
                              },
                              {
                                title: 'Coffee Break Lengkap & Buah Segar',
                                desc: 'Aneka Pastry Mini, Roti Manis Kemenag, Potongan Buah Segar Semangka/Melon, Kopi Arabika',
                                price: 30000,
                                priceText: 'Rp 30.000 / pax',
                                badge: 'Buffet Coffee Break'
                              }
                            ] : [
                              {
                                title: 'Nasi Goreng Spesial Asrama Haji & Telur Ceplok',
                                desc: 'Dilengkapi telur ceplok kuning lembut, kerupuk udang renyah, acar segar, dan sambal khas',
                                price: 30000,
                                priceText: 'Rp 30.000 / porsi',
                                badge: 'Favorit Jemaah'
                              },
                              {
                                title: 'Lontong Sayur Betawi Gurih & Telur Balado',
                                desc: 'Kuah santan gurih kaya rempah, labu siam, tahu tempe bumbu kuning, dan telur balado pedas manis',
                                price: 30000,
                                priceText: 'Rp 30.000 / porsi',
                                badge: 'Khas Jakarta'
                              },
                              {
                                title: 'Bubur Ayam Komplit Asrama Haji Spesial',
                                desc: 'Bubur beras pulen lembut, kuah kuning gurih, suwir ayam kampung, cakwe, kedelai goreng, kerupuk',
                                price: 30000,
                                priceText: 'Rp 30.000 / porsi',
                                badge: 'Hangat & Bergizi'
                              },
                              {
                                title: 'Nasi Uduk Gurih Komplit Semur Tahu & Bihun',
                                desc: 'Nasi uduk aroma daun pandan dan serai, bihun goreng kampung, semur tahu legit, ayam suwir gurih',
                                price: 35000,
                                priceText: 'Rp 35.000 / porsi',
                                badge: 'Porsi Kenyang'
                              },
                              {
                                title: 'Nasi Kuning Nusantara & Orek Tempe Manis',
                                desc: 'Nasi kuning rempah kunyit harum, telur dadar iris tipis, orek tempe manis gurih, kerupuk bawang',
                                price: 35000,
                                priceText: 'Rp 35.000 / porsi',
                                badge: 'Nusantara'
                              }
                            ]).map(item => {
                              const isSelected = breakfastMenu === item.title;
                              return (
                                <div
                                  key={item.title}
                                  onClick={() => setBreakfastMenu(item.title)}
                                  className={`p-2.5 rounded-xl border-2 transition cursor-pointer flex flex-col justify-between space-y-1.5 ${
                                    isSelected
                                      ? 'border-orange-500 bg-orange-50/90 shadow-2xs ring-2 ring-orange-300'
                                      : 'border-slate-200 bg-white hover:border-orange-300 hover:bg-orange-50/30'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-1.5">
                                    <span className="font-bold text-xs text-slate-900 leading-snug">{item.title}</span>
                                    {isSelected ? (
                                      <i className="fa-solid fa-circle-check text-orange-600 text-sm shrink-0"></i>
                                    ) : (
                                      <span className="w-4 h-4 rounded-full border border-slate-300 shrink-0"></span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed">
                                    {item.desc}
                                  </p>
                                  <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[10px]">
                                    <span className="text-slate-400 font-medium">{item.badge}</span>
                                    <span className="font-extrabold text-orange-700 font-mono">{item.priceText}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Jumlah Pack & Durasi Hari */}
                        <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block font-bold text-slate-700 mb-1 text-xs">
                              Jumlah Pack per Hari
                            </label>
                            <div className="flex items-center space-x-1.5">
                              <button
                                type="button"
                                onClick={() => setBreakfastPortions(prev => Math.max(1, prev - 1))}
                                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-bold text-sm flex items-center justify-center transition cursor-pointer shadow-2xs"
                                title="Kurangi pack"
                              >
                                -
                              </button>
                              <input 
                                type="number"
                                min={1}
                                value={breakfastPortions}
                                onChange={(e) => setBreakfastPortions(Math.max(1, parseInt(e.target.value) || 1))}
                                onFocus={(e) => e.target.select()}
                                className="w-20 px-2 py-1.5 bg-slate-50 border border-orange-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-orange-500 focus:bg-white outline-none font-bold text-center text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => setBreakfastPortions(prev => prev + 1)}
                                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-bold text-sm flex items-center justify-center transition cursor-pointer shadow-2xs"
                                title="Tambah pack"
                              >
                                +
                              </button>
                              <span className="text-xs font-bold text-slate-600">Porsi</span>
                            </div>
                            {/* Quick chips */}
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {[1, 2, 4, 8].map(cnt => (
                                <button
                                  key={cnt}
                                  type="button"
                                  onClick={() => setBreakfastPortions(cnt)}
                                  className={`px-2 py-0.5 text-[10px] rounded font-bold border transition cursor-pointer ${
                                    breakfastPortions === cnt 
                                      ? 'bg-orange-600 text-white border-orange-700 shadow-2xs' 
                                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  {cnt} Porsi
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <label className="block font-bold text-slate-700 mb-1 text-xs">
                              Pesan Berapa Hari?
                            </label>
                            <div className="flex items-center space-x-1.5">
                              <input 
                                type="number"
                                min={1}
                                max={duration || 1}
                                value={breakfastDays}
                                onChange={(e) => setBreakfastDays(Math.min(duration || 1, Math.max(1, parseInt(e.target.value) || 1)))}
                                className="w-full px-3 py-1.5 bg-slate-50 border border-orange-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-orange-500 focus:bg-white outline-none font-bold text-center text-xs"
                              />
                              <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">Hari (Maks: {duration})</span>
                            </div>
                            <span className="text-[10px] text-slate-500 mt-1 block">
                              Total: <strong>{breakfastPortions * breakfastDays} Porsi</strong> Terjadwal
                            </span>
                          </div>
                        </div>

                        {/* Rangkuman Biaya Konsumsi */}
                        {(() => {
                          const ratePerPax = cateringPackage === 'FULLBOARD' ? 120000 : cateringPackage === 'SNACK_AULA' ? 25000 : 30000;
                          return (
                            <div className="p-2.5 bg-orange-50/80 border border-orange-200 rounded-lg flex items-center justify-between text-slate-800 text-xs shadow-2xs">
                              <div className="flex items-center space-x-2">
                                <i className="fa-solid fa-calculator text-orange-600"></i>
                                <span className="font-semibold text-slate-700">Subtotal Konsumsi Koperasi:</span>
                              </div>
                              <span className="font-mono font-bold text-orange-900">
                                {formatRupiah(breakfastPortions * breakfastDays * ratePerPax)}
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {/* EXTRA BED SECTION (MATCHING GROUP REGISTRATION MODAL) */}
                {!isAula && (
                  <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 shadow-2xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <label className="flex items-center space-x-2 font-bold text-slate-800 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={includeExtraBed} 
                          onChange={e => {
                            const val = e.target.checked;
                            setIncludeExtraBed(val);
                            if (val && (!extraBedCount || extraBedCount === 4)) {
                              setExtraBedCount(1);
                            }
                          }} 
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" 
                        />
                        <span className="text-xs flex items-center gap-1.5">
                          <i className="fa-solid fa-bed text-indigo-600"></i>
                          <span>Kebutuhan Kasur Lipat Tambahan (Extra Bed)</span>
                        </span>
                      </label>

                      {includeExtraBed && (
                        <div className="flex flex-wrap items-center gap-2.5 bg-indigo-50/80 p-2 rounded-xl border border-indigo-200 text-xs">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-indigo-950 font-bold">Jumlah:</span>
                            <input 
                              type="number" 
                              min="1" 
                              max="10" 
                              value={extraBedCount} 
                              onChange={e => setExtraBedCount(Math.max(1, parseInt(e.target.value) || 1))} 
                              className="w-14 px-2 py-1 bg-white border border-indigo-300 rounded-lg text-center font-bold text-indigo-950 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <span className="text-indigo-800 font-semibold">Unit</span>
                          </div>

                          <div className="flex items-center space-x-1.5">
                            <span className="text-indigo-950 font-bold">Harga per Unit:</span>
                            <div className="flex items-center bg-white border border-indigo-300 rounded-lg px-2 py-1 focus-within:ring-2 focus-within:ring-indigo-500">
                              <span className="text-indigo-800 font-bold mr-1">Rp</span>
                              <input 
                                type="text"
                                value={extraBedPrice ? Number(extraBedPrice).toLocaleString('id-ID') : ''}
                                onChange={e => setExtraBedPrice(parseInt(e.target.value.replace(/\D/g, '')) || 0)}
                                placeholder="100.000"
                                className="w-20 text-right font-mono font-bold text-indigo-950 outline-none"
                              />
                            </div>
                            <span className="text-indigo-700">/ malam</span>
                          </div>

                          <div className="text-indigo-900 font-bold bg-white px-2.5 py-1 rounded-lg border border-indigo-200">
                            Subtotal: <span className="font-mono text-indigo-800">{formatRupiah(extraBedCount * duration * (extraBedPrice || 100000))}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {includeExtraBed && (
                      <div className="pt-2 border-t border-slate-100 flex items-center gap-2 text-xs">
                        <label className="font-semibold text-slate-600 shrink-0">Perlengkapan Kasur:</label>
                        <select
                          value={extraBedNotes}
                          onChange={e => setExtraBedNotes(e.target.value)}
                          className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-semibold bg-white"
                        >
                          <option value="1 Kasur Lipat + Bantal & Sprei Bersih">1 Kasur Lipat + Bantal & Sprei Bersih</option>
                          <option value="Kasur Busa Tebal + Selimut & Bantal">Kasur Busa Tebal + Selimut & Bantal</option>
                          <option value="Kasur Single Standar + Paket Lengkap">Kasur Single Standar + Paket Lengkap</option>
                        </select>
                      </div>
                    )}
                  </div>
                )}
                
                {/* STATUS & OPSI PEMBAYARAN SEBELUM INVOICE TERBENTUK */}
                <div className="p-4 bg-gradient-to-r from-emerald-50/70 via-gold-50/40 to-emerald-50/70 dark:from-slate-800 dark:via-slate-800 dark:to-slate-800 border border-emerald-300 dark:border-emerald-700/60 rounded-xl space-y-3.5">
                  <div className="flex items-center justify-between text-xs font-black text-emerald-950 dark:text-emerald-300 uppercase tracking-wide">
                    <div className="flex items-center space-x-2">
                      <i className="fa-solid fa-money-check-dollar text-emerald-700 dark:text-emerald-400"></i>
                      <span>Status &amp; Rincian Pembayaran</span>
                    </div>
                    {isPaymentRestrictedToFull ? (
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                        <i className="fa-solid fa-lock text-[9px]"></i>
                        <span>Hari Ini: Wajib Lunas</span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                        H+1: DP &amp; Belum Bayar Aktif
                      </span>
                    )}
                  </div>

                  {/* Ringkasan Estimasi Biaya */}
                  {(() => {
                    const estRoomRate = !isAula ? (room?.pricePerNight || 480000) * duration : 0;
                    const estAulaRate = isAula ? calculateMeetingRate(duration, aulaRentalDays) : 0;
                    let estRateCat = 25000;
                    if (cateringPackage === 'FULLBOARD') estRateCat = 120000;
                    else if (cateringPackage === 'SNACK_AULA') estRateCat = 25000;
                    else if (cateringPackage === 'SARAPAN') {
                      const mItem = breakfastMenuItems.find(m => m.name === breakfastMenu);
                      estRateCat = mItem?.price || 25000;
                    }
                    const estBreakfast = (includeBreakfast && cateringPackage !== 'TIDAK') ? breakfastPortions * breakfastDays * estRateCat : 0;
                    const estExtraBed = includeExtraBed ? extraBedCount * duration * (extraBedPrice || 100000) : 0;
                    const estGrandTotal = estRoomRate + estAulaRate + estBreakfast + estExtraBed;
                    const sisaTagihan = Math.max(0, estGrandTotal - (payStatus === 'DP' ? payDpAmount : (payStatus === 'LUNAS' ? estGrandTotal : 0)));

                    return (
                      <div className="space-y-3">
                        <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5 shadow-2xs">
                          <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                            <span>Tarif Sewa {isAula ? `${isSG ? 'Gedung Serbaguna (SG)' : 'Ruang Pertemuan / Aula'} (${duration} Jam/Hari × ${aulaRentalDays} Hari)` : `Kamar (${duration} Malam)`}:</span>
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{formatRupiah(estRoomRate || estAulaRate)}</span>
                          </div>
                          {includeBreakfast && estBreakfast > 0 && (
                            <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                              <span>Paket Konsumsi ({breakfastPortions} Porsi × {breakfastDays} Hari):</span>
                              <span className="font-mono font-bold text-orange-700 dark:text-orange-400">+{formatRupiah(estBreakfast)}</span>
                            </div>
                          )}
                          {includeExtraBed && estExtraBed > 0 && (
                            <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                              <span>Extra Bed ({extraBedCount} Kasur × {duration} Malam):</span>
                              <span className="font-mono font-bold text-indigo-700 dark:text-indigo-400">+{formatRupiah(estExtraBed)}</span>
                            </div>
                          )}
                          <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs font-black">
                            <span className="text-slate-800 dark:text-slate-200 uppercase tracking-wider">Total Tagihan:</span>
                            <span className="text-emerald-700 dark:text-emerald-400 text-sm font-mono">{formatRupiah(estGrandTotal)}</span>
                          </div>
                        </div>

                        {/* 3 Tombol Opsi Status Pembayaran */}
                        <div className="grid grid-cols-3 gap-2">
                          {/* 1. Belum Bayar */}
                          <button
                            type="button"
                            disabled={isPaymentRestrictedToFull}
                            onClick={() => {
                              if (!isPaymentRestrictedToFull) setPayStatus('BELUM_LUNAS');
                            }}
                            className={`p-2.5 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center gap-1 relative ${
                              isPaymentRestrictedToFull
                                ? 'bg-slate-100 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-55'
                                : payStatus === 'BELUM_LUNAS'
                                ? 'bg-slate-800 text-white border-slate-900 shadow-sm ring-2 ring-slate-400 cursor-pointer'
                                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50 cursor-pointer'
                            }`}
                            title={isPaymentRestrictedToFull ? 'Pemesanan kamar hari ini wajib dibayar lunas penuh' : 'Pelunasan diselesaikan sebelum/saat check-in'}
                          >
                            <div className="flex items-center space-x-1.5">
                              {isPaymentRestrictedToFull ? (
                                <i className="fa-solid fa-lock text-[11px] text-amber-600"></i>
                              ) : (
                                <i className="fa-solid fa-clock text-[11px]"></i>
                              )}
                              <span>Belum Bayar</span>
                            </div>
                            {isPaymentRestrictedToFull ? (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-bold">
                                Wajib H+1
                              </span>
                            ) : (
                              <span className={`text-[9px] ${payStatus === 'BELUM_LUNAS' ? 'text-slate-300' : 'text-slate-500'}`}>
                                Saat Check-In
                              </span>
                            )}
                          </button>

                          {/* 2. Uang Muka (DP) */}
                          <button
                            type="button"
                            disabled={isPaymentRestrictedToFull}
                            onClick={() => {
                              if (!isPaymentRestrictedToFull) setPayStatus('DP');
                            }}
                            className={`p-2.5 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center gap-1 relative ${
                              isPaymentRestrictedToFull
                                ? 'bg-slate-100 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-55'
                                : payStatus === 'DP'
                                ? 'bg-amber-600 text-white border-amber-700 shadow-sm ring-2 ring-amber-400 cursor-pointer'
                                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50 cursor-pointer'
                            }`}
                            title={isPaymentRestrictedToFull ? 'Pemesanan kamar hari ini wajib dibayar lunas penuh' : 'Bayar uang muka terlebih dahulu'}
                          >
                            <div className="flex items-center space-x-1.5">
                              {isPaymentRestrictedToFull ? (
                                <i className="fa-solid fa-lock text-[11px] text-amber-600"></i>
                              ) : (
                                <i className="fa-solid fa-hand-holding-dollar text-[11px]"></i>
                              )}
                              <span>Uang Muka (DP)</span>
                            </div>
                            {isPaymentRestrictedToFull ? (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-bold">
                                Wajib H+1
                              </span>
                            ) : (
                              <span className={`text-[9px] ${payStatus === 'DP' ? 'text-amber-100' : 'text-amber-600 font-semibold'}`}>
                                Setor DP
                              </span>
                            )}
                          </button>

                          {/* 3. Lunas Penuh */}
                          <button
                            type="button"
                            onClick={() => setPayStatus('LUNAS')}
                            className={`p-2.5 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center gap-1 relative cursor-pointer ${
                              payStatus === 'LUNAS'
                                ? 'bg-emerald-700 text-white border-emerald-800 shadow-sm ring-2 ring-emerald-500'
                                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center space-x-1.5">
                              <i className="fa-solid fa-circle-check text-[11px]"></i>
                              <span>Lunas Penuh</span>
                            </div>
                            {isPaymentRestrictedToFull ? (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-900 font-extrabold uppercase animate-pulse">
                                Wajib Hari Ini
                              </span>
                            ) : (
                              <span className={`text-[9px] ${payStatus === 'LUNAS' ? 'text-emerald-100' : 'text-emerald-700 font-semibold'}`}>
                                Bayar 100%
                              </span>
                            )}
                          </button>
                        </div>

                        {/* Banner & Catatan Kebijakan Pembayaran */}
                        {isPaymentRestrictedToFull && (
                          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 rounded-xl flex items-start space-x-2.5 text-xs text-amber-950 dark:text-amber-200 animate-in fade-in duration-150">
                            <div className="w-6 h-6 rounded-md bg-amber-200 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0 mt-0.5 font-bold">
                              <i className="fa-solid fa-lock text-xs"></i>
                            </div>
                            <div className="space-y-0.5 leading-snug">
                              <div className="font-extrabold text-amber-900 dark:text-amber-300 flex items-center space-x-1.5">
                                <span>Pemesanan Kamar Hari Ini: Wajib Bayar Penuh (Lunas)</span>
                              </div>
                              <p className="text-[11px] text-amber-800 dark:text-amber-300/90">
                                Untuk pemesanan atau check-in kamar pada hari ini ({formatIndonesianDate(realToday)}), pembayaran wajib diselesaikan secara <strong>Lunas Penuh</strong>. Pilihan <strong>DP</strong> dan <strong>Belum Bayar</strong> tidak dapat digunakan untuk pemesanan hari ini.
                              </p>
                            </div>
                          </div>
                        )}

                        {isFutureBooking && isKamar && (
                          <div className="p-3 bg-blue-50/80 dark:bg-slate-900/60 border border-blue-200 dark:border-blue-800/60 rounded-xl space-y-2 text-xs text-blue-950 dark:text-blue-200 animate-in fade-in duration-150">
                            <div className="flex items-start space-x-2.5">
                              <div className="w-6 h-6 rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0 mt-0.5">
                                <i className="fa-solid fa-calendar-check text-xs"></i>
                              </div>
                              <div className="space-y-0.5 leading-snug">
                                <span className="font-bold text-blue-900 dark:text-blue-300 block">
                                  Reservasi Kamar Mendatang (+1 Hari dari Hari Ini)
                                </span>
                                <p className="text-[11px] text-blue-800 dark:text-blue-300/80">
                                  Pemesanan untuk tanggal <strong>{formatIndonesianDate(startDate)}</strong> dapat menggunakan opsi <strong>Uang Muka (DP)</strong> atau <strong>Belum Bayar</strong>.
                                </p>
                              </div>
                            </div>

                            {/* Catatan Penting Wajib Dilunasi Sebelum Cekin */}
                            <div className="p-2.5 bg-amber-100/90 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800/80 rounded-lg text-amber-950 dark:text-amber-200 text-[11px] font-semibold flex items-center space-x-2">
                              <i className="fa-solid fa-triangle-exclamation text-amber-700 dark:text-amber-400 text-sm shrink-0"></i>
                              <div className="leading-tight">
                                <span className="font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300 mr-1">Catatan Penting:</span>
                                <span>Pelunasan sisa tagihan <u>wajib diselesaikan</u> sebelum atau saat proses Check-In fisik dilakukan.</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {isAula && (
                          <div className="p-3 bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 rounded-xl flex items-start space-x-2.5 text-xs text-purple-950 dark:text-purple-200">
                            <i className="fa-solid fa-landmark text-purple-700 dark:text-purple-400 text-sm mt-0.5 shrink-0"></i>
                            <div>
                              <span className="font-bold text-purple-950 dark:text-purple-200 block">Penyewaan {isSG ? 'Gedung Serbaguna (SG)' : 'Ruang Pertemuan / Aula'}</span>
                              <p className="text-[11px] text-purple-800 dark:text-purple-300 leading-relaxed">
                                Tersedia pilihan pembayaran Lunas Penuh, Uang Muka (DP), atau Belum Bayar untuk konfirmasi sewa {isSG ? 'gedung serbaguna' : 'aula / ruang pertemuan'}.
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Form Nominal DP jika DP dipilih */}
                        {payStatus === 'DP' && !isPaymentRestrictedToFull && (
                          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 rounded-xl space-y-2.5 text-xs animate-in fade-in duration-100">
                            <div>
                              <label className="block font-bold text-amber-950 dark:text-amber-200 mb-1">Nominal Uang Muka (DP):</label>
                              <div className="flex items-center space-x-2">
                                <input
                                  type="number"
                                  min="10000"
                                  step="10000"
                                  value={payDpAmount}
                                  onChange={e => setPayDpAmount(parseInt(e.target.value) || 0)}
                                  className="w-full p-2 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-lg font-mono font-bold text-amber-950 dark:text-amber-100 outline-none focus:ring-2 focus:ring-amber-500"
                                />
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-1.5">
                                {[
                                  { label: '20%', pct: 0.2 },
                                  { label: '30%', pct: 0.3 },
                                  { label: '50%', pct: 0.5 },
                                  { label: '70%', pct: 0.7 }
                                ].map(preset => (
                                  <button
                                    key={preset.label}
                                    type="button"
                                    onClick={() => setPayDpAmount(Math.round(estGrandTotal * preset.pct))}
                                    className="py-1 px-1.5 bg-amber-200 dark:bg-amber-900/60 hover:bg-amber-300 text-amber-900 dark:text-amber-200 font-bold rounded text-[10px] cursor-pointer transition text-center truncate"
                                  >
                                    {preset.label} ({formatRupiah(Math.round(estGrandTotal * preset.pct))})
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="text-[11px] text-amber-900 dark:text-amber-300 flex justify-between pt-1 border-t border-amber-200 dark:border-amber-800">
                              <span>Sisa Tagihan (Wajib Lunas Sebelum Check-In):</span>
                              <span className="font-mono font-black text-rose-700 dark:text-rose-400">
                                {formatRupiah(sisaTagihan)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Kanal / Metode Setoran:</label>
                      <select
                        value={payMethod}
                        onChange={e => setPayMethod(e.target.value as any)}
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg font-semibold text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                      >
                        <option value="VA_UPT">Virtual Account (VA) UPT Asrama Haji Jakarta</option>
                        <option value="TRANSFER">Transfer Bank Lainnya</option>
                        <option value="CASH">Tunai / Cash di Resepsionis</option>
                      </select>
                    </div>

                    {payMethod === 'TRANSFER' && (
                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Pilih Bank:</label>
                        <select
                          value={payBank}
                          onChange={e => setPayBank(e.target.value)}
                          className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg font-semibold text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                        >
                          {INDONESIAN_BANKS.map(b => (
                            <option key={b} value={b}>{b}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Tanggal Transaksi:</label>
                      <input
                        type="date"
                        value={payDate}
                        onChange={e => setPayDate(e.target.value)}
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg font-semibold text-slate-800 dark:text-slate-200 outline-none"
                      />
                    </div>
                  </div>

                  {payMethod === 'VA_UPT' && (
                    <div className="p-3 bg-emerald-50/70 dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700/60 rounded-xl space-y-2 text-xs animate-in fade-in duration-100">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-emerald-900 dark:text-emerald-300 font-bold uppercase tracking-wider block">
                          Nomor Virtual Account Resmi:
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setPayVaNumber(OFFICIAL_VA_CONFIG.vaNumber);
                            setPayVaName(OFFICIAL_VA_CONFIG.accountName);
                          }}
                          className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 underline flex items-center gap-1 cursor-pointer"
                        >
                          <i className="fa-solid fa-rotate-left text-[9px]"></i>
                          <span>Gunakan Default ({OFFICIAL_VA_CONFIG.vaNumber})</span>
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <input
                            type="text"
                            value={payVaNumber}
                            onChange={(e) => setPayVaNumber(e.target.value)}
                            placeholder="Nomor Virtual Account"
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono font-bold text-xs focus:ring-1 focus:ring-emerald-600 outline-none"
                            title="Nomor Virtual Account (dapat diedit sendiri)"
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            value={payVaName}
                            onChange={(e) => setPayVaName(e.target.value)}
                            placeholder="Atas Nama VA"
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-lg text-slate-900 dark:text-slate-100 font-medium text-xs focus:ring-1 focus:ring-emerald-600 outline-none"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 italic">
                        *Default adalah nomor VA resmi UPT Asrama Haji Jakarta. Anda dapat mengisi sendiri nomor VA di atas.
                      </p>
                    </div>
                  )}

                  {payMethod === 'TRANSFER' && (
                    <div className="p-3 bg-blue-50/70 dark:bg-slate-900 border border-blue-300 dark:border-blue-700/60 rounded-xl space-y-2 text-xs animate-in fade-in duration-100">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-blue-900 dark:text-blue-300 font-bold uppercase tracking-wider block">
                          Nomor Rekening / Bukti Transfer:
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setPayBankAccountNumber(OFFICIAL_VA_CONFIG.vaNumber);
                            setPayVaName(OFFICIAL_VA_CONFIG.accountName);
                          }}
                          className="text-[10px] font-bold text-blue-700 dark:text-blue-400 hover:text-blue-900 underline flex items-center gap-1 cursor-pointer"
                        >
                          <i className="fa-solid fa-rotate-left text-[9px]"></i>
                          <span>Default Rekening UPT</span>
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <input
                            type="text"
                            value={payBankAccountNumber}
                            onChange={(e) => setPayBankAccountNumber(e.target.value)}
                            placeholder="Nomor Rekening / No. Bukti Transfer"
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono font-bold text-xs focus:ring-1 focus:ring-blue-600 outline-none"
                            title="Nomor Rekening Bank (dapat diisi sendiri)"
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            value={payVaName}
                            onChange={(e) => setPayVaName(e.target.value)}
                            placeholder="Atas Nama Pemilik Rekening"
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 rounded-lg text-slate-900 dark:text-slate-100 font-medium text-xs focus:ring-1 focus:ring-blue-600 outline-none"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 italic">
                        *Masukkan nomor rekening tujuan atau nomor referensi bukti transfer bank.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700">
                  {(checkinData.actionType === 'EDIT_BOOKING' || checkinData.returnToRoomId) ? (
                    <button 
                      type="button" 
                      onClick={() => {
                        closeModal('modalCheckin');
                        const targetRoomId = checkinData.returnToRoomId || checkinData.roomId || room?.id;
                        if (targetRoomId) {
                          openModal('modalRoomDetail', { roomId: targetRoomId });
                        }
                      }} 
                      className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl text-xs transition flex items-center space-x-1.5 cursor-pointer"
                    >
                      <i className="fa-solid fa-arrow-left text-slate-500 text-[11px]"></i>
                      <span>Kembali ke Rincian</span>
                    </button>
                  ) : (
                    <button type="button" onClick={() => closeModal('modalCheckin')} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl text-xs transition cursor-pointer">Batal</button>
                  )}

                  <div className="flex items-center space-x-2">
                    <button 
                      type="submit" 
                      disabled={isAulaDateFull || kamarOverlap} 
                      className={`px-5 py-2.5 font-bold rounded-xl shadow-xs text-xs transition flex items-center space-x-2 cursor-pointer ${
                        isAulaDateFull || kamarOverlap 
                          ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed shadow-none' 
                          : 'bg-hajj-700 hover:bg-hajj-800 text-white'
                      }`}
                    >
                      <i className="fa-solid fa-check"></i>
                      <span>
                        {isAulaDateFull 
                          ? 'Tanggal Penuh (Pilih Tgl Lain)' 
                          : kamarOverlap 
                            ? 'Kamar Terisi (Pilih Tgl Lain)' 
                            : checkinData.actionType === 'EDIT_BOOKING'
                              ? 'Simpan Perubahan Reservasi'
                              : selectedBookingTxId
                                ? `Konfirmasi Check-In Tamu Booking`
                                : checkinData.actionType === 'BOOKING'
                                  ? (payStatus === 'LUNAS' 
                                      ? `Konfirmasi Booking (Lunas)` 
                                      : payStatus === 'DP' 
                                      ? `Konfirmasi Booking (DP ${formatRupiah(payDpAmount)})` 
                                      : `Konfirmasi Booking (Belum Bayar)`)
                                  : `Konfirmasi Check-In (${payStatus === 'LUNAS' ? 'Lunas Penuh' : 'Selesai'})`}
                      </span>
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {isMaintOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => closeModal('modalMaintenance')}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 flex flex-col max-h-[92vh] my-auto animate-in fade-in zoom-in duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 via-hajj-900 to-amber-950 px-6 py-4.5 text-white flex items-center justify-between shrink-0 border-b border-amber-500/30">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-400 flex items-center justify-center font-bold text-base shadow-inner">
                  <i className="fa-solid fa-screwdriver-wrench"></i>
                </div>
                <div>
                  <h3 className="font-bold text-base text-white tracking-tight">Form Laporan Kerusakan Fasilitas</h3>
                  <p className="text-xs text-amber-300/90">UPT Asrama Haji • Pelaporan Masalah & Penugasan Teknisi</p>
                </div>
              </div>
              <button 
                onClick={() => closeModal('modalMaintenance')} 
                className="text-white/70 hover:text-white text-lg p-1.5 rounded-xl hover:bg-white/10 transition"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleMaintenance} className="p-6 space-y-4 text-xs overflow-y-auto flex-1 custom-scrollbar">
              {/* Selected Room / Facility Preview */}
              {(() => {
                const selectedRoom = rooms.find(r => r.id === maintRoomId);
                const selectedMr = !selectedRoom ? meetingRooms.find(m => m.id === maintRoomId || m.name === maintRoomId) : null;
                const isMr = !selectedRoom && !!selectedMr;
                const displayName = selectedRoom ? `Kamar ${selectedRoom.roomNumber}` : (selectedMr?.name || '—');
                const displayBuilding = selectedRoom ? selectedRoom.building : (selectedMr?.building || 'Ruang Pertemuan / Serbaguna');
                const displayStatus = selectedRoom ? selectedRoom.status : (selectedMr?.status || '—');
                const displayType = selectedRoom ? selectedRoom.type : (selectedMr?.category === 'SERBAGUNA' ? 'Gedung Serbaguna' : 'Ruang Pertemuan / Aula');
                const displayCap = selectedRoom ? `${selectedRoom.capacity || 4} Orang` : `${selectedMr?.capacity || '500+'} Orang`;

                return (
                  <div className="p-3.5 bg-gradient-to-r from-amber-50/70 to-slate-50 border border-amber-200/80 rounded-xl flex items-center justify-between shadow-xs">
                    <div className="flex items-center space-x-3">
                      <div className={`px-3.5 py-2 rounded-xl font-black text-xs shadow-2xs whitespace-nowrap ${
                        isMr ? 'bg-purple-100 text-purple-900 border border-purple-300' : 'bg-amber-100 text-amber-900 border border-amber-300'
                      }`}>
                        {isMr ? <i className="fa-solid fa-landmark mr-1.5"></i> : <i className="fa-solid fa-door-open mr-1.5"></i>}
                        {displayName}
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 text-xs block">{displayBuilding}</span>
                        <div className="flex items-center space-x-2 text-[10px] text-slate-500 mt-0.5">
                          <span>Status: <strong className="text-slate-800">{displayStatus}</strong></span>
                          <span>•</span>
                          <span>Kapasitas: <strong className="text-slate-800">{displayCap}</strong></span>
                        </div>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border shadow-2xs ${
                      isMr ? 'bg-purple-100 text-purple-800 border-purple-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                    }`}>
                      {displayType}
                    </span>
                  </div>
                );
              })()}

              {/* Facility Selection */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5 flex items-center space-x-1.5">
                  <i className="fa-solid fa-door-open text-amber-600 text-xs"></i>
                  <span>Pilih Fasilitas / Kamar / Aula <strong className="text-rose-500">*</strong></span>
                </label>
                <select 
                  value={maintRoomId} 
                  onChange={e => setMaintRoomId(e.target.value)} 
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-amber-500 font-semibold text-slate-800 text-xs shadow-xs"
                >
                  <optgroup label="🏢 Gedung & Kamar Hunian Asrama">
                    {rooms.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.building} — Kamar {r.roomNumber} ({r.type || 'Standar'} • {r.status})
                      </option>
                    ))}
                  </optgroup>
                  {meetingRooms.length > 0 && (
                    <optgroup label="🏛️ Ruang Pertemuan & Gedung Serbaguna">
                      {meetingRooms.map(mr => (
                        <option key={mr.id} value={mr.id}>
                          {mr.building || 'Ruang Pertemuan'} — {mr.name} ({mr.category || 'Aula'} • {mr.status})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Category & Technician Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Category Selection */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5 flex items-center space-x-1.5">
                    <i className="fa-solid fa-tag text-amber-600 text-xs"></i>
                    <span>Kategori Kendala</span>
                  </label>
                  <select 
                    value={maintCategory} 
                    onChange={e => setMaintCategory(e.target.value)} 
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-amber-500 text-slate-800 text-xs shadow-xs font-medium"
                  >
                    <option value="Kerusakan Sedang">AC & Kelistrikan (Tidak Dingin / Mati Lampu)</option>
                    <option value="Kerusakan Kecil">Sanitasi & Plumbing (Kran Bocor / Mampet)</option>
                    <option value="Perawatan Rutin">Perawatan Rutin & Pembersihan</option>
                    <option value="Kerusakan Besar">Bangunan / Plafon / Pintu / Kunci</option>
                    <option value="Pengecekan Fasilitas">Pengecekan Berkala Mandiri</option>
                  </select>
                </div>

                {/* Technician Dropdown */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5 flex items-center space-x-1.5">
                    <i className="fa-solid fa-user-gear text-amber-600 text-xs"></i>
                    <span>Tugaskan Teknisi</span>
                  </label>
                  <select 
                    value={maintTechnician} 
                    onChange={e => setMaintTechnician(e.target.value)} 
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-amber-500 text-slate-800 text-xs shadow-xs font-medium"
                  >
                    {users.filter(u => u.role.includes('Teknisi')).length > 0 ? (
                      users.filter(u => u.role.includes('Teknisi')).map(u => (
                        <option key={u.id} value={`${u.fullName} (${u.role})`}>
                          {u.fullName} ({u.role})
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="Budi Santoso (Teknisi AC/Listrik)">Budi Santoso (AC & Listrik)</option>
                        <option value="Dede Supriatna (Teknisi Sipil/Plumbing)">Dede Supriatna (Sipil & Plumbing)</option>
                        <option value="Rizal Utama (Teknisi Umum)">Rizal Utama (Teknisi Umum)</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {/* Urgency Level Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5 flex items-center space-x-1.5">
                  <i className="fa-solid fa-gauge-high text-amber-600 text-xs"></i>
                  <span>Tingkat Urgensi Penanganan</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { val: 'Biasa', label: 'Biasa', icon: 'fa-circle-check', color: 'emerald', sub: 'Terencana' },
                    { val: 'Sedang', label: 'Sedang', icon: 'fa-clock', color: 'blue', sub: 'Reguler' },
                    { val: 'Tinggi', label: 'Tinggi', icon: 'fa-triangle-exclamation', color: 'amber', sub: 'Prioritas' },
                    { val: 'Urgent', label: 'Urgent', icon: 'fa-fire', color: 'red', sub: 'Kunci Kamar' },
                  ].map(u => {
                    const isSelected = maintUrgency === u.val;
                    return (
                      <button
                        type="button"
                        key={u.val}
                        onClick={() => setMaintUrgency(u.val)}
                        className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center justify-center space-y-1 ${
                          isSelected 
                            ? (u.val === 'Urgent' ? 'bg-red-600 text-white border-red-600 shadow-sm font-bold ring-2 ring-red-400' :
                               u.val === 'Tinggi' ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-sm font-bold ring-2 ring-amber-300' :
                               u.val === 'Sedang' ? 'bg-blue-600 text-white border-blue-700 shadow-sm font-bold ring-2 ring-blue-400' :
                               'bg-emerald-600 text-white border-emerald-700 shadow-sm font-bold ring-2 ring-emerald-400')
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        <i className={`fa-solid ${u.icon} text-xs ${isSelected ? (u.val === 'Tinggi' ? 'text-slate-950' : 'text-white') : 'text-slate-400'}`}></i>
                        <span className="font-bold text-[11px] leading-none">{u.label}</span>
                        <span className={`text-[9px] ${isSelected ? (u.val === 'Tinggi' ? 'text-slate-800' : 'text-white/80') : 'text-slate-400'}`}>{u.sub}</span>
                      </button>
                    );
                  })}
                </div>
                {maintUrgency === 'Urgent' && (
                  <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-900 text-[11px] flex items-center space-x-2 animate-pulse">
                    <i className="fa-solid fa-triangle-exclamation text-red-600 text-sm"></i>
                    <span><strong>Peringatan Darurat:</strong> Status kamar akan otomatis dikunci ke mode Maintenance dan tidak dapat dipesan tamu sampai diverifikasi QC.</span>
                  </div>
                )}
              </div>

              {/* Quick Preset Tags */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-slate-700 flex items-center space-x-1.5">
                    <i className="fa-solid fa-pen-to-square text-amber-600 text-xs"></i>
                    <span>Deskripsi Kerusakan & Kebutuhan</span>
                  </label>
                  <span className="text-[10px] text-slate-400">Pilih gejala untuk isi cepat:</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[
                    "AC tidak dingin / bocor air",
                    "Kran wastafel / shower patah",
                    "Lampu utama kamar mati",
                    "Flush toilet mampet",
                    "Kunci pintu macet / rusak",
                    "Sprei / selimut butuh ganti"
                  ].map(tag => (
                    <button
                      type="button"
                      key={tag}
                      onClick={() => setMaintDesc(prev => prev ? `${prev}, ${tag}` : tag)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900 border border-slate-200 text-[10px] font-medium transition active:scale-95"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
                <textarea 
                  value={maintDesc} 
                  onChange={e => setMaintDesc(e.target.value)} 
                  rows={3} 
                  required 
                  placeholder="Uraikan kendala teknis atau kebutuhan suku cadang secara spesifik..." 
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-amber-500 text-slate-800 text-xs shadow-xs"
                ></textarea>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end space-x-2.5 pt-3 border-t border-slate-100 shrink-0">
                <button 
                  type="button" 
                  onClick={() => closeModal('modalMaintenance')} 
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition text-xs"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-bold rounded-xl shadow-md transition flex items-center space-x-2 text-xs"
                >
                  <i className="fa-solid fa-paper-plane text-xs"></i>
                  <span>Kirim Laporan Kerusakan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isUpdateMaintOpen && targetMaintenance && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => closeModal('modalUpdateMaintenance')}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-emerald-900/10 flex flex-col max-h-[90vh] my-auto animate-in fade-in zoom-in duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-emerald-800 via-hajj-800 to-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="p-1.5 bg-white/20 rounded-lg text-white">
                    <i className="fa-solid fa-wrench"></i>
                  </span>
                  <h3 className="font-bold text-base">Tindak Lanjut & Status Perbaikan</h3>
                </div>
                <p className="text-xs text-gold-300 mt-0.5">
                  {targetMaintenance.building} - Kamar {targetMaintenance.roomNumber} (#{targetMaintenance.id})
                </p>
              </div>
              <button 
                onClick={() => closeModal('modalUpdateMaintenance')} 
                className="text-white/70 hover:text-white text-lg p-1 rounded-lg hover:bg-white/10 transition"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleUpdateMaintenanceSubmit} className="p-6 space-y-4 text-xs overflow-y-auto flex-1 custom-scrollbar">
              {/* Technician / Manager Role Check Banner */}
              {!isTeknisiRole(currentUser?.role) ? (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-800 space-y-1">
                  <div className="flex items-center space-x-2 font-bold text-xs">
                    <i className="fa-solid fa-triangle-exclamation text-red-600 text-sm"></i>
                    <span>Akses Dibatasi: Khusus Divisi Teknisi</span>
                  </div>
                  <p className="text-[11px] text-red-700 leading-relaxed">
                    Anda saat ini login sebagai <strong>{currentUser?.role || 'Pengguna'}</strong> ({currentUser?.fullName}). Berdasarkan SOP Kementerian Haji, hanya <strong>Divisi Teknisi</strong> (Manager Teknisi / Teknisi Pelaksana) yang berwenang menindaklanjuti perbaikan fasilitas.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-xs">
                      <i className="fa-solid fa-user-gear"></i>
                    </div>
                    <div>
                      <div className="font-bold text-xs">Petugas: {currentUser?.fullName}</div>
                      <div className="text-[10px] text-emerald-700">
                        {isManagerTeknisi(currentUser?.role) ? 'Manager Teknisi (Wewenang Penugasan & Supervisi)' : 'Teknisi Pelaksana Lapangan'}
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-200 text-emerald-900 rounded font-bold text-[10px]">
                    Teknisi Terotorisasi
                  </span>
                </div>
              )}

              {/* Status Alur Terkini */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-semibold">Status Tiket Saat Ini:</span>
                  <span className={`px-2.5 py-1 rounded-full font-bold text-[10px] ${
                    targetMaintenance.status === 'MENUNGGU_PENUGASAN' ? 'bg-amber-100 text-amber-900 border border-amber-300' :
                    targetMaintenance.status === 'PROSES' ? 'bg-blue-100 text-blue-900 border border-blue-300' :
                    targetMaintenance.status === 'MENUNGGU_QC' ? 'bg-purple-100 text-purple-900 border border-purple-300' :
                    'bg-emerald-100 text-emerald-900 border border-emerald-300'
                  }`}>
                    {targetMaintenance.status === 'MENUNGGU_PENUGASAN' ? '⏳ Menunggu Penugasan Manager' :
                     targetMaintenance.status === 'PROSES' ? '🔧 Sedang Dikerjakan Teknisi' :
                     targetMaintenance.status === 'MENUNGGU_QC' ? '📋 Telah Diperbaiki - Menunggu QC' :
                     '✅ Lolos Verifikasi QC & Selesai'}
                  </span>
                </div>

                {/* Manager Assignment info */}
                {targetMaintenance.assignedTechnicianName && (
                  <div className="text-[11px] bg-white p-2 rounded-lg border border-slate-200 space-y-1">
                    <div className="flex justify-between text-slate-600">
                      <span>Teknisi Ditugaskan:</span>
                      <span className="font-bold text-slate-800">{targetMaintenance.assignedTechnicianName}</span>
                    </div>
                    {targetMaintenance.assignedByManager && (
                      <div className="flex justify-between text-slate-500 text-[10px]">
                        <span>Ditugaskan oleh Manager:</span>
                        <span>{targetMaintenance.assignedByManager} ({targetMaintenance.assignedAt})</span>
                      </div>
                    )}
                    {targetMaintenance.managerNotes && (
                      <div className="text-slate-700 bg-amber-50/70 p-1.5 rounded text-[10px] border border-amber-100 mt-1">
                        <span className="font-bold text-amber-900">Instruksi Manager: </span>
                        {targetMaintenance.managerNotes}
                      </div>
                    )}
                  </div>
                )}

                {/* Quick button for Manager Teknisi to Assign / Reassign */}
                {isManagerTeknisi(currentUser?.role) && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        closeModal('modalUpdateMaintenance');
                        openModal('modalAssignTechnician', { maintenance: targetMaintenance });
                      }}
                      className="w-full py-1.5 px-3 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold rounded-lg transition text-xs flex items-center justify-center space-x-1.5 shadow-sm"
                    >
                      <i className="fa-solid fa-user-plus"></i>
                      <span>{targetMaintenance.assignedTechnicianName ? 'Ubah Penugasan Teknisi' : 'Tugaskan Teknisi Pelaksana'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Info Keluhan / Laporan Awal */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium text-[11px]">Kategori & Urgensi:</span>
                  <div className="flex items-center space-x-1.5">
                    <span className="font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200 text-[10px]">
                      {targetMaintenance.category}
                    </span>
                    <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                      targetMaintenance.urgency === 'Urgent' ? 'bg-red-100 text-red-700' :
                      targetMaintenance.urgency === 'Tinggi' ? 'bg-orange-100 text-orange-700' :
                      targetMaintenance.urgency === 'Sedang' ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {targetMaintenance.urgency}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 font-medium text-[11px] block">Keluhan / Temuan Kerusakan:</span>
                  <p className="text-slate-700 font-semibold bg-white p-2 rounded border border-slate-200 mt-0.5 text-xs">
                    "{targetMaintenance.description}"
                  </p>
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 pt-1">
                  <span>Pelapor: <strong>{targetMaintenance.reportedUser}</strong></span>
                  <span>Waktu: {targetMaintenance.reportTime}</span>
                </div>
              </div>

              {/* Status Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5 text-xs">
                  Pilih Tindakan / Update Status:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={!isTeknisiRole(currentUser?.role)}
                    onClick={() => setUpStatus('PROSES')}
                    className={`p-3 rounded-xl border text-left transition flex items-start space-x-2.5 ${
                      upStatus === 'PROSES' 
                        ? 'border-blue-500 bg-blue-50/80 ring-2 ring-blue-400/60 shadow-sm' 
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    } ${!isTeknisiRole(currentUser?.role) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                      upStatus === 'PROSES' ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                    }`}>
                      {upStatus === 'PROSES' && <span className="w-1.5 h-1.5 rounded-full bg-white"></span>}
                    </div>
                    <div>
                      <div className="font-bold text-blue-900 text-xs">Dalam Proses Pengerjaan</div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Sedang diperbaiki teknisi. Fasilitas tetap berstatus MAINTENANCE.</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={!isTeknisiRole(currentUser?.role)}
                    onClick={() => setUpStatus('MENUNGGU_QC')}
                    className={`p-3 rounded-xl border text-left transition flex items-start space-x-2.5 ${
                      upStatus === 'MENUNGGU_QC' 
                        ? 'border-purple-500 bg-purple-50/80 ring-2 ring-purple-400/60 shadow-sm' 
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    } ${!isTeknisiRole(currentUser?.role) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                      upStatus === 'MENUNGGU_QC' ? 'border-purple-600 bg-purple-600' : 'border-slate-300'
                    }`}>
                      {upStatus === 'MENUNGGU_QC' && <span className="w-1.5 h-1.5 rounded-full bg-white"></span>}
                    </div>
                    <div>
                      <div className="font-bold text-purple-900 text-xs">Telah Selesai Diperbaiki</div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Fisik selesai. Wajib dicek & diverifikasi lolos oleh Tim QC sebelum disewakan.</p>
                    </div>
                  </button>
                </div>

                {upStatus === 'MENUNGGU_QC' && (
                  <div className="mt-2.5 p-2.5 bg-purple-50 border border-purple-200 rounded-xl text-[11px] text-purple-900 flex items-start space-x-2">
                    <i className="fa-solid fa-shield-halved text-purple-600 mt-0.5"></i>
                    <div>
                      <strong>SOP Verifikasi Wajib QC:</strong> Setelah disimpan, status kamar akan berubah menjadi <em>"Menunggu Inspeksi QC"</em>. Kamar <strong>TIDAK BISA</strong> langsung disewakan atau di-check-in hingga Tim QC melakukan uji kelayakan dan menyetujuinya.
                    </div>
                  </div>
                )}
              </div>

              {/* Catatan Tindakan Teknisi */}
              <div>
                <label className="block font-bold text-slate-700 mb-1 text-xs">
                  Catatan Tindakan Teknisi & Suku Cadang yang Diganti
                </label>
                <textarea
                  disabled={!isTeknisiRole(currentUser?.role)}
                  value={upNotes}
                  onChange={e => setUpNotes(e.target.value)}
                  rows={3}
                  placeholder={isTeknisiRole(currentUser?.role) ? "Contoh: Kompresor AC dibersihkan dan freon diisi ulang, keran wastafel diganti baru, uji operasional normal..." : "Hanya petugas divisi teknisi yang dapat mengisi catatan"}
                  className={`w-full p-2.5 border rounded-lg outline-none text-xs ${
                    !isTeknisiRole(currentUser?.role) ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' : 'border-slate-300 focus:ring-2 focus:ring-emerald-500 bg-white'
                  }`}
                ></textarea>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 shrink-0">
                <button 
                  type="button" 
                  onClick={() => closeModal('modalUpdateMaintenance')} 
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition"
                >
                  Tutup
                </button>
                {isTeknisiRole(currentUser?.role) ? (
                  <button 
                    type="submit" 
                    className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg shadow transition flex items-center space-x-1.5"
                  >
                    <i className="fa-solid fa-floppy-disk"></i>
                    <span>Simpan Perubahan</span>
                  </button>
                ) : (
                  <button 
                    type="button" 
                    disabled 
                    className="px-4 py-2 bg-slate-200 text-slate-400 font-bold rounded-lg cursor-not-allowed flex items-center space-x-1.5"
                  >
                    <i className="fa-solid fa-lock"></i>
                    <span>Khusus Divisi Teknisi</span>
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PENUGASAN TEKNISI OLEH MANAGER TEKNISI */}
      {isAssignTechOpen && targetMaintToAssign && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => closeModal('modalAssignTechnician')}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-emerald-900/10 flex flex-col max-h-[90vh] my-auto animate-in fade-in zoom-in duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="p-1.5 bg-white/20 rounded-lg text-white">
                    <i className="fa-solid fa-user-check"></i>
                  </span>
                  <h3 className="font-bold text-base">Penugasan Teknisi Pelaksana</h3>
                </div>
                <p className="text-xs text-amber-200 mt-0.5">
                  Wewenang Manager Teknisi - {targetMaintToAssign.building} {targetMaintToAssign.roomNumber} (#{targetMaintToAssign.id})
                </p>
              </div>
              <button 
                onClick={() => closeModal('modalAssignTechnician')} 
                className="text-white/70 hover:text-white text-lg p-1 rounded-lg hover:bg-white/10 transition"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleAssignTechnicianSubmit} className="p-6 space-y-4 text-xs overflow-y-auto flex-1 custom-scrollbar">
              {/* Role validation */}
              {!isManagerTeknisi(currentUser?.role) ? (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 space-y-1">
                  <div className="flex items-center space-x-2 font-bold text-xs">
                    <i className="fa-solid fa-lock text-red-600"></i>
                    <span>Wewenang Khusus: Manager Teknisi</span>
                  </div>
                  <p className="text-[11px] text-red-700">
                    Hanya <strong>Manager Teknisi</strong> (atau Super Admin) yang berhak menugaskan staf teknisi untuk menindaklanjuti perbaikan gedung/kamar.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold text-xs">
                      <i className="fa-solid fa-user-tie"></i>
                    </div>
                    <div>
                      <div className="font-bold text-xs">{currentUser?.fullName}</div>
                      <div className="text-[10px] text-amber-800">{currentUser?.role} - Otoritas Disposisi Tugas Teknisi</div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded font-bold text-[10px]">
                    Manager Teknisi
                  </span>
                </div>
              )}

              {/* Rincian Tiket */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Keluhan / Masalah:</span>
                  <span className="font-bold text-slate-800">{targetMaintToAssign.category} ({targetMaintToAssign.urgency})</span>
                </div>
                <div className="bg-white p-2 rounded border border-slate-200 font-medium text-slate-700">
                  "{targetMaintToAssign.description}"
                </div>
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Dilaporkan oleh: <strong>{targetMaintToAssign.reportedUser}</strong></span>
                  <span>Waktu: {targetMaintToAssign.reportTime}</span>
                </div>
              </div>

              {/* Pilih Teknisi */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Pilih Staf Teknisi Pelaksana:
                </label>
                <select
                  disabled={!isManagerTeknisi(currentUser?.role)}
                  value={selectedTechId}
                  onChange={e => setSelectedTechId(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 font-semibold bg-white"
                >
                  {users.filter(u => u.role === 'Teknisi' || u.role === 'Manager Teknisi').map(u => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.role}) - {u.assignedBuilding}
                    </option>
                  ))}
                </select>
              </div>

              {/* Catatan / Instruksi Manager */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Instruksi Khusus & Prioritas dari Manager Teknisi:
                </label>
                <textarea
                  disabled={!isManagerTeknisi(currentUser?.role)}
                  value={managerAssignNotes}
                  onChange={e => setManagerAssignNotes(e.target.value)}
                  rows={3}
                  placeholder="Contoh: Tolong segera perbaiki pagi ini sebelum kloter baru tiba, bawa spare part kran dan seal pipa..."
                  className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 text-xs bg-white"
                ></textarea>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => closeModal('modalAssignTechnician')}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!isManagerTeknisi(currentUser?.role)}
                  className={`px-5 py-2 font-bold rounded-lg shadow transition flex items-center space-x-1.5 ${
                    isManagerTeknisi(currentUser?.role)
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <i className="fa-solid fa-paper-plane"></i>
                  <span>Tugaskan Teknisi Sekarang</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isUserMgmtOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => closeModal('modalUserManagement')}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-100 flex flex-col max-h-[92vh] my-auto animate-in fade-in zoom-in duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header: Sesuai Style Booking Kamar */}
            <div className="bg-gradient-to-r from-hajj-800 to-hajj-900 px-6 py-4 text-white flex items-center justify-between shrink-0 border-b border-gold-500/30">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-gold-500/20 border border-gold-400/40 text-gold-300 flex items-center justify-center font-bold text-base shadow-inner shrink-0">
                  <i className="fa-solid fa-users-gear"></i>
                </div>
                <div>
                  <h3 className="font-bold text-base text-white tracking-tight flex items-center gap-2">
                    <span>{editingUserId ? 'Edit Akun Petugas' : 'Manajemen Akun & Hak Akses Petugas'}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gold-500/20 text-gold-300 border border-gold-400/30">
                      UPT Asrama Haji
                    </span>
                  </h3>
                  <p className="text-xs text-gold-200/90">
                    {editingUserId 
                      ? `Memperbarui data dan hak akses petugas: ${uFullName || uUsername}` 
                      : 'Konfigurasi profil petugas, hirarki atasan, hak akses peran, dan penugasan gedung'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  handleResetUserForm();
                  closeModal('modalUserManagement');
                }} 
                className="text-white/70 hover:text-white text-lg p-1.5 rounded-xl hover:bg-white/10 transition cursor-pointer"
                title="Tutup"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* Mode Switcher Tabs (Mirip Navigasi Booking vs Check-in) */}
            <div className="px-6 pt-3 pb-2 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
              <div className="flex items-center space-x-1.5 bg-slate-200/70 p-1 rounded-xl border border-slate-300/80">
                <button
                  type="button"
                  onClick={() => setUserModalTab('FORM')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                    userModalTab === 'FORM'
                      ? 'bg-white text-hajj-900 shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <i className={`fa-solid ${editingUserId ? 'fa-user-pen text-amber-600' : 'fa-user-plus text-hajj-700'}`}></i>
                  <span>{editingUserId ? 'Edit Data Petugas' : 'Formulir Akun Baru'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUserModalTab('LIST')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                    userModalTab === 'LIST'
                      ? 'bg-white text-hajj-900 shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <i className="fa-solid fa-address-book text-hajj-700"></i>
                  <span>Direktori & Struktur</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-hajj-100 text-hajj-800">
                    {users.length}
                  </span>
                </button>
              </div>

              {/* Quick Info Badge */}
              <div className="flex items-center space-x-2 text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>{users.filter(u => u.status === 'Aktif').length} Aktif</span>
                </span>
                <span>•</span>
                <span>4 Divisi Teknis</span>
                {editingUserId && (
                  <button
                    type="button"
                    onClick={handleResetUserForm}
                    className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold hover:bg-amber-200 transition cursor-pointer"
                  >
                    Batal Edit (Buat Baru)
                  </button>
                )}
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1 bg-slate-50/50">
              {userModalTab === 'FORM' ? (
                <div className="space-y-5">
                  {/* LIVE PREVIEW CARD: Mirip Kartu Info Kamar pada Booking Modal */}
                  <div className="p-4 bg-white rounded-xl border border-purple-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center space-x-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-700 to-indigo-800 text-white font-black text-lg flex items-center justify-center shadow-xs shrink-0 border-2 border-purple-200">
                        {uFullName ? uFullName.charAt(0).toUpperCase() : 'P'}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="font-black text-sm text-slate-900">
                            {uFullName || 'Nama Lengkap Petugas'}
                          </h4>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            uStatus === 'Aktif' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                          }`}>
                            ● {uStatus}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                          <span className="font-mono font-bold text-purple-800">@{uUsername || 'username_nip'}</span>
                          <span>•</span>
                          <span>{uAssigned}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex sm:flex-col sm:items-end justify-between border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                        uRole.includes('Super Admin') ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                        uRole.includes('Manager') ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                        uRole.includes('Quality') ? 'bg-teal-100 text-teal-800 border border-teal-200' :
                        uRole.includes('Teknisi') ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                        uRole.includes('Koperasi') ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                        'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}>
                        <i className="fa-solid fa-id-card-clip mr-1 text-[10px]"></i>
                        {uRole}
                      </span>
                      <span className="text-[10px] text-slate-400 mt-1">
                        Atasan: {users.find(s => s.id === uSupervisorId)?.fullName || 'Pimpinan Tertinggi'}
                      </span>
                    </div>
                  </div>

                  {/* FORMULIR PETUGAS (Layout 2 Kolom Bersih seperti Booking) */}
                  <form onSubmit={handleSaveUser} className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                      <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
                        <i className="fa-solid fa-user-shield text-purple-600"></i>
                        <span>1. Identitas & Kredensial Login</span>
                      </span>
                      <span className="text-[10px] text-slate-400">* Wajib diisi</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {/* Username / NIP */}
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Username / NIP Petugas <strong className="text-rose-500">*</strong>
                        </label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                            <i className="fa-solid fa-id-badge"></i>
                          </span>
                          <input 
                            type="text" 
                            value={uUsername} 
                            onChange={e => setUUsername(e.target.value)} 
                            required 
                            placeholder="Contoh: recep4, tek3, qc3" 
                            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-600 font-mono text-xs" 
                          />
                        </div>
                      </div>

                      {/* Nama Lengkap */}
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Nama Lengkap Petugas <strong className="text-rose-500">*</strong>
                        </label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                            <i className="fa-solid fa-user"></i>
                          </span>
                          <input 
                            type="text" 
                            value={uFullName} 
                            onChange={e => setUFullName(e.target.value)} 
                            required 
                            placeholder="Contoh: Siti Nurhaliza, S.E." 
                            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-600 text-xs font-semibold" 
                          />
                        </div>
                      </div>

                      {/* Nomor WhatsApp / HP */}
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Nomor WhatsApp / Kontak HP
                        </label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-emerald-600 pointer-events-none">
                            <i className="fa-brands fa-whatsapp"></i>
                          </span>
                          <input 
                            type="text" 
                            value={uPhone} 
                            onChange={e => setUPhone(e.target.value)} 
                            placeholder="Contoh: 081234567890" 
                            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-600 text-xs" 
                          />
                        </div>
                      </div>

                      {/* Password */}
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          {editingUserId ? 'Kata Sandi Baru (Opsional)' : 'Kata Sandi Akun'} {!editingUserId && <strong className="text-rose-500">*</strong>}
                        </label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                            <i className="fa-solid fa-lock"></i>
                          </span>
                          <input 
                            type="password" 
                            value={uPass} 
                            onChange={e => setUPass(e.target.value)} 
                            required={!editingUserId}
                            placeholder={editingUserId ? 'Biarkan kosong jika tidak diubah' : '••••••••'} 
                            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-600 text-xs" 
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-b border-slate-100 pt-2 pb-2.5">
                      <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
                        <i className="fa-solid fa-sitemap text-indigo-600"></i>
                        <span>2. Struktur Organisasi, Peran & Penugasan</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {/* Role / Jabatan */}
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Peran / Jabatan (Role) <strong className="text-rose-500">*</strong>
                        </label>
                        <select 
                          value={uRole} 
                          onChange={e => handleRoleChange(e.target.value)} 
                          className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-600 font-bold text-xs bg-white"
                        >
                          <optgroup label="Pimpinan & Administrator">
                            <option value="Super Admin">Super Admin (Pimpinan UPT)</option>
                            <option value="Admin">Admin (Administrator Sistem)</option>
                          </optgroup>
                          <optgroup label="Divisi Resepsionis (Pelayanan & Kasir)">
                            <option value="Manager Resepsionis">Manager Resepsionis</option>
                            <option value="Resepsionis">Resepsionis (Staff Pelayanan)</option>
                          </optgroup>
                          <optgroup label="Divisi Quality Control (Inspeksi Mutu)">
                            <option value="Manager QC">Manager Quality Control (QC)</option>
                            <option value="Quality Control">Quality Control (QC Staff)</option>
                          </optgroup>
                          <optgroup label="Divisi Pemeliharaan (Teknisi Gedung)">
                            <option value="Manager Teknisi">Manager Teknisi</option>
                            <option value="Teknisi">Teknisi Gedung (Staff)</option>
                          </optgroup>
                          <optgroup label="Divisi Koperasi & Konsumsi (Dapur)">
                            <option value="Manager Koperasi">Manager Koperasi</option>
                            <option value="Petugas Koperasi">Petugas Koperasi (Dapur & Sarapan)</option>
                          </optgroup>
                        </select>
                      </div>

                      {/* Atasan Langsung */}
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Atasan Langsung (Supervisor)
                        </label>
                        <select 
                          value={uSupervisorId} 
                          onChange={e => setUSupervisorId(e.target.value)} 
                          className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-600 font-semibold text-xs bg-white"
                        >
                          <option value="">- Tidak Ada (Pimpinan Tertinggi) -</option>
                          {users
                            .filter(u => u.role.includes('Super Admin') || u.role.includes('Manager'))
                            .map(sup => (
                              <option key={sup.id} value={sup.id}>
                                {sup.fullName} ({sup.role})
                              </option>
                            ))
                          }
                        </select>
                      </div>

                      {/* Status Akun */}
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Status Akun Petugas
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setUStatus('Aktif')}
                            className={`py-2 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1.5 border ${
                              uStatus === 'Aktif'
                                ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                            }`}
                          >
                            <i className="fa-solid fa-circle-check text-xs"></i>
                            <span>Aktif</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setUStatus('Non-Aktif')}
                            className={`py-2 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1.5 border ${
                              uStatus === 'Non-Aktif'
                                ? 'bg-slate-700 text-white border-slate-800 shadow-xs'
                                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                            }`}
                          >
                            <i className="fa-solid fa-circle-xmark text-xs"></i>
                            <span>Non-Aktif</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Submit & Action Buttons (Mirip Booking Modal Action Footer) */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <div className="flex items-center space-x-2">
                        {editingUserId ? (
                          <button
                            type="button"
                            onClick={handleResetUserForm}
                            className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 font-bold transition flex items-center space-x-1.5 text-xs"
                          >
                            <i className="fa-solid fa-arrow-rotate-left"></i>
                            <span>Batal Edit</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleResetUserForm}
                            className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 font-bold transition text-xs"
                          >
                            Reset Form
                          </button>
                        )}
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            handleResetUserForm();
                            closeModal('modalUserManagement');
                          }}
                          className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-bold transition text-xs"
                        >
                          Tutup
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2 bg-hajj-700 hover:bg-hajj-800 text-white font-bold rounded-xl shadow-xs transition flex items-center space-x-2 text-xs cursor-pointer"
                        >
                          <i className={`fa-solid ${editingUserId ? 'fa-check' : 'fa-plus'}`}></i>
                          <span>{editingUserId ? 'Simpan Perubahan Petugas' : 'Tambahkan Akun Petugas'}</span>
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              ) : (
                /* TAB 2: DIREKTORI & STRUKTUR ORGANISASI */
                <div className="space-y-4">
                  {/* Search & Filter Bar */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                    <div className="relative flex-1">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                        <i className="fa-solid fa-magnifying-glass"></i>
                      </span>
                      <input
                        type="text"
                        value={uSearch}
                        onChange={e => setUSearch(e.target.value)}
                        placeholder="Cari nama petugas, username/NIP, atau peran..."
                        className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-hajj-600 text-xs"
                      />
                    </div>

                    <div className="flex items-center space-x-1 overflow-x-auto pb-1 sm:pb-0">
                      {(['ALL', 'Resepsionis', 'QC', 'Teknisi', 'Koperasi'] as const).map(f => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setUDeptFilter(f)}
                          className={`px-2.5 py-1 rounded-lg font-bold text-[11px] whitespace-nowrap transition ${
                            uDeptFilter === f
                              ? 'bg-hajj-700 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {f === 'ALL' ? 'Semua Divisi' : f}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Daftar Petugas Cards / Table */}
                  <div className="space-y-2.5">
                    {users
                      .filter(u => {
                        if (uDeptFilter === 'Resepsionis' && !u.role.includes('Resepsionis')) return false;
                        if (uDeptFilter === 'QC' && !u.role.includes('Quality') && !u.role.includes('QC')) return false;
                        if (uDeptFilter === 'Teknisi' && !u.role.includes('Teknisi')) return false;
                        if (uDeptFilter === 'Koperasi' && !u.role.includes('Koperasi')) return false;
                        if (uSearch.trim()) {
                          const query = uSearch.toLowerCase();
                          return (
                            u.fullName.toLowerCase().includes(query) ||
                            u.username.toLowerCase().includes(query) ||
                            u.role.toLowerCase().includes(query)
                          );
                        }
                        return true;
                      })
                      .map(u => {
                        const supervisor = users.find(s => s.id === u.supervisorId);
                        const isSelf = currentUser?.id === u.id;
                        return (
                          <div 
                            key={u.id} 
                            className={`p-4 bg-white border-2 rounded-xl transition shadow-xs space-y-3 ${
                              editingUserId === u.id 
                                ? 'border-amber-500 bg-amber-50/20 ring-2 ring-amber-300' 
                                : 'border-slate-200 hover:border-hajj-600'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-hajj-700 to-hajj-900 text-white font-black flex items-center justify-center text-sm shadow-xs shrink-0 border border-gold-400/30">
                                  {u.fullName.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="flex items-center space-x-2">
                                    <span className="font-bold text-sm text-slate-900">{u.fullName}</span>
                                    {isSelf && (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-blue-100 text-blue-800 border border-blue-200">
                                        Akun Anda
                                      </span>
                                    )}
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      u.role.includes('Super Admin') ? 'bg-purple-100 text-purple-800' :
                                      u.role.includes('Manager') ? 'bg-blue-100 text-blue-800' :
                                      u.role.includes('Quality') ? 'bg-teal-100 text-teal-800' :
                                      u.role.includes('Teknisi') ? 'bg-amber-100 text-amber-800' :
                                      u.role.includes('Koperasi') ? 'bg-rose-100 text-rose-800' :
                                      'bg-emerald-100 text-emerald-800'
                                    }`}>
                                      {u.role}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                    ID/NIP: <strong className="text-hajj-900">@{u.username}</strong>
                                  </div>
                                </div>
                              </div>

                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                u.status === 'Aktif' 
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                                  : 'bg-slate-100 text-slate-600 border-slate-300'
                              }`}>
                                {u.status}
                              </span>
                            </div>

                            {/* Info Grid (Struktur 2 Kolom Bersih) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                              <div>
                                <i className="fa-solid fa-id-card text-slate-400 mr-1.5"></i>
                                Peran / Jabatan: <span className="font-semibold text-slate-800">{u.role}</span>
                              </div>
                              <div>
                                <i className="fa-solid fa-sitemap text-slate-400 mr-1.5"></i>
                                Atasan Langsung: <span className="font-semibold text-slate-800">{supervisor ? supervisor.fullName : 'Pimpinan Tertinggi'}</span>
                              </div>
                              <div>
                                <i className="fa-brands fa-whatsapp text-emerald-600 mr-1.5"></i>
                                Kontak WhatsApp: {u.phone && u.phone !== '-' ? (
                                  <a 
                                    href={`https://wa.me/${u.phone.replace(/[^0-9]/g, '')}`} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="font-semibold text-emerald-700 hover:underline"
                                  >
                                    {u.phone}
                                  </a>
                                ) : (
                                  <span className="text-slate-400 italic">Belum diisi</span>
                                )}
                              </div>
                              <div>
                                <i className="fa-solid fa-shield-halved text-slate-400 mr-1.5"></i>
                                Status Akses: <span className="font-semibold text-slate-800">{u.status}</span>
                              </div>
                            </div>

                            {/* Tombol Aksi Bawah */}
                            <div className="flex items-center justify-end space-x-2 pt-1 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => handleStartEditUser(u)}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition flex items-center space-x-1 cursor-pointer"
                                title="Lihat & sesuaikan data petugas"
                              >
                                <i className="fa-solid fa-pen-to-square text-amber-600"></i>
                                <span>Sesuaikan Data</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => toggleUserStatus(u.id)}
                                disabled={isSelf}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer border ${
                                  isSelf 
                                    ? 'opacity-40 cursor-not-allowed bg-slate-100 text-slate-400 border-slate-200' 
                                    : u.status === 'Aktif' 
                                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' 
                                      : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-xs'
                                }`}
                                title={u.status === 'Aktif' ? 'Nonaktifkan Akun' : 'Aktifkan Akun'}
                              >
                                <i className={`fa-solid ${u.status === 'Aktif' ? 'fa-user-slash' : 'fa-user-check'}`}></i>
                                <span>{u.status === 'Aktif' ? 'Non-Aktifkan' : 'Aktifkan'}</span>
                              </button>

                              {!isSelf && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUserToDelete({ id: u.id, fullName: u.fullName, username: u.username });
                                  }}
                                  className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs transition border border-rose-200 cursor-pointer"
                                  title="Hapus Akun"
                                >
                                  <i className="fa-solid fa-trash-can"></i>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <DeleteConfirmModal
        isOpen={Boolean(userToDelete)}
        title="Hapus Akun Petugas"
        itemName={userToDelete ? `${userToDelete.fullName} (@${userToDelete.username})` : ''}
        itemType="Akun Petugas"
        onClose={() => setUserToDelete(null)}
        onConfirm={() => {
          if (userToDelete) {
            deleteUser(userToDelete.id);
            setUserToDelete(null);
          }
        }}
      />

      {isKloterOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => closeModal('modalKloter')}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-100 flex flex-col max-h-[90vh] my-auto animate-in fade-in zoom-in duration-150"
            onClick={(e) => e.stopPropagation()}
          >
              <div className="bg-gradient-to-r from-blue-800 to-indigo-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
                  <div>
                      <h3 className="font-bold text-base flex items-center"><i className="fa-solid fa-plane-arrival mr-2 text-gold-400"></i> Jadwal Kloter Jemaah Haji</h3>
                      <p className="text-xs text-blue-200">Kedatangan & Kepulangan Embarkasi Jakarta</p>
                  </div>
                  <button onClick={() => closeModal('modalKloter')} className="text-white/70 hover:text-white text-lg"><i className="fa-solid fa-xmark"></i></button>
              </div>
              <div className="p-6 space-y-4 text-xs overflow-y-auto flex-1 custom-scrollbar">
                  <div className="border rounded-xl overflow-hidden">
                      <table className="w-full text-left">
                          <thead className="bg-slate-100 uppercase font-bold text-slate-600">
                              <tr>
                                  <th className="p-2.5">Kloter</th>
                                  <th className="p-2.5">Asal Daerah</th>
                                  <th className="p-2.5">Jumlah</th>
                                  <th className="p-2.5">Tgl Masuk</th>
                                  <th className="p-2.5">Alokasi Gedung</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              <tr><td className="p-2.5 font-bold">JKG-01</td><td className="p-2.5">Jakarta Timur</td><td className="p-2.5">393 Orang</td><td className="p-2.5">12 Mei 2026</td><td className="p-2.5 font-semibold text-hajj-700">Gedung A & B</td></tr>
                              <tr><td className="p-2.5 font-bold">JKG-02</td><td className="p-2.5">Jakarta Barat</td><td className="p-2.5">388 Orang</td><td className="p-2.5">14 Mei 2026</td><td className="p-2.5 font-semibold text-hajj-700">Gedung C & D</td></tr>
                              <tr><td className="p-2.5 font-bold">JKG-03</td><td className="p-2.5">Tangerang</td><td className="p-2.5">390 Orang</td><td className="p-2.5">16 Mei 2026</td><td className="p-2.5 font-semibold text-hajj-700">Gedung A & C</td></tr>
                          </tbody>
                      </table>
                  </div>
              </div>
          </div>
        </div>
      )}

      {isExportOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => closeModal('modalExport')}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 flex flex-col max-h-[92vh] my-auto animate-in fade-in zoom-in duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-gold-400 text-lg shadow-2xs">
                  <i className="fa-solid fa-file-arrow-down"></i>
                </div>
                <div>
                  <h3 className="font-bold text-base tracking-wide flex items-center">
                    Unduh Laporan Rekapitulasi
                  </h3>
                  <p className="text-[11px] text-emerald-200">
                    UPT Asrama Haji Jakarta • Kementerian Haji dan Umrah RI
                  </p>
                </div>
              </div>
              <button 
                onClick={() => closeModal('modalExport')} 
                className="text-white/70 hover:text-white text-lg p-1.5 rounded-lg hover:bg-white/10 transition"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={executeExport} className="p-6 space-y-5 text-xs overflow-y-auto flex-1 custom-scrollbar">
              {/* Format Selection Cards (PDF vs XLSX - No CSV) */}
              <div>
                <label className="block font-bold text-slate-700 mb-2">
                  Pilih Format Laporan <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {/* Option 1: PDF */}
                  <div
                    onClick={() => setExportFormat('PDF')}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                      exportFormat === 'PDF'
                        ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base ${
                        exportFormat === 'PDF' ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'
                      }`}>
                        <i className="fa-solid fa-file-pdf"></i>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        exportFormat === 'PDF' ? 'bg-rose-200 text-rose-800' : 'bg-slate-100 text-slate-500'
                      }`}>
                        Resmi
                      </span>
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800">Format PDF</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        Kop resmi Kementerian Haji dan Umrah RI, UPT Asrama Haji Jakarta, siap cetak A4.
                      </p>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center text-[10px] font-semibold text-emerald-700">
                      <i className={`fa-solid ${exportFormat === 'PDF' ? 'fa-circle-check text-emerald-600' : 'fa-circle text-slate-300'} mr-1.5 text-xs`}></i>
                      <span>{exportFormat === 'PDF' ? 'Format Dipilih' : 'Pilih Dokumen PDF'}</span>
                    </div>
                  </div>

                  {/* Option 2: Excel (.xlsx) */}
                  <div
                    onClick={() => setExportFormat('XLSX')}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                      exportFormat === 'XLSX'
                        ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base ${
                        exportFormat === 'XLSX' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        <i className="fa-solid fa-file-excel"></i>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        exportFormat === 'XLSX' ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-100 text-slate-500'
                      }`}>
                        .xlsx
                      </span>
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800">Excel (.xlsx)</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        Buku kerja Excel murni dengan auto-width kolom & styling data.
                      </p>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center text-[10px] font-semibold text-emerald-700">
                      <i className={`fa-solid ${exportFormat === 'XLSX' ? 'fa-circle-check text-emerald-600' : 'fa-circle text-slate-300'} mr-1.5 text-xs`}></i>
                      <span>{exportFormat === 'XLSX' ? 'Format Dipilih' : 'Pilih Spreadsheet Excel'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Data Type Selection */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Jenis Data Laporan
                </label>
                <div className="relative">
                  <select 
                    value={exportType}
                    onChange={e => setExportType(e.target.value as ReportType)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-none font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:bg-white text-xs"
                  >
                    <option value="KAMAR">🏨 Laporan Hunian Kamar & Booking Ruang Pertemuan</option>
                    <option value="AULA">🏛️ Laporan Khusus Reservasi Ruang Pertemuan (Aula)</option>
                    <option value="MAINTENANCE">🛠️ Laporan Pemeliharaan & Kerusakan Fasilitas</option>
                    <option value="QC">🔍 Laporan Hasil Inspeksi Mutu & Quality Control</option>
                    <option value="SARAPAN">🍳 Laporan Rekapitulasi Pesanan Sarapan Koperasi</option>
                    <option value="JAM_KERJA">⏱️ Laporan Akumulasi Jam Kerja & Sesi Shift Petugas</option>
                    <option value="AUDIT">📋 Laporan Log Aktivitas Sistem & Audit Trail</option>
                    <option value="LOG_UNDUH">📄 Laporan Log Riwayat Unduh PDF Ber-QR Code</option>
                    <option value="USERS">👥 Laporan Resmi Daftar Anggota & Petugas Operasional</option>
                  </select>
                </div>
              </div>

              {/* Wilayah / Gedung Selection */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Wilayah / Gedung Fasilitas
                </label>
                <div className="relative">
                  <select 
                    value={exportBuilding}
                    onChange={e => setExportBuilding(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-none font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:bg-white text-xs"
                  >
                    <option value="ALL">🏛️ Semua Gedung & Ruang Pertemuan (Aula)</option>
                    <option value="Ruang Pertemuan">🤝 Khusus Ruang Pertemuan ({meetingRooms.length || 13} Aula Serbaguna)</option>
                    {buildings.filter(b => b.name !== 'Ruang Pertemuan' && b.id !== 'bld-5').map(b => (
                      <option key={b.id} value={b.name}>🏢 {b.name} ({b.totalRooms || 50} Kamar)</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sub-Option for QC Reports */}
              {exportType === 'QC' && (
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
                  <label className="block font-bold text-emerald-900 text-xs">
                    Sub-Tipe Dokumen QC
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setExportQcMode('HISTORY')}
                      className={`p-2 rounded-lg text-left border transition ${
                        exportQcMode === 'HISTORY'
                          ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="font-bold text-[11px] flex items-center">
                        <i className="fa-solid fa-list-check mr-1.5"></i>
                        Riwayat Log Inspeksi
                      </div>
                      <div className={`text-[10px] mt-0.5 ${exportQcMode === 'HISTORY' ? 'text-emerald-100' : 'text-slate-500'}`}>
                        Detail parameter ac, linen, kebersihan & vonis
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportQcMode('READINESS')}
                      className={`p-2 rounded-lg text-left border transition ${
                        exportQcMode === 'READINESS'
                          ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="font-bold text-[11px] flex items-center">
                        <i className="fa-solid fa-building-circle-check mr-1.5"></i>
                        Audit Kesiapan Fasilitas
                      </div>
                      <div className={`text-[10px] mt-0.5 ${exportQcMode === 'READINESS' ? 'text-emerald-100' : 'text-slate-500'}`}>
                        Master sheet kesiapan 200 kamar & 13 aula terkini
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Sub-Option for Breakfast Reports */}
              {exportType === 'SARAPAN' && (
                <div className="p-3 bg-orange-50/70 border border-orange-200 rounded-xl space-y-2">
                  <label className="block font-bold text-orange-900 text-xs">
                    Filter Prioritas Pengantaran Tamu
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'ALL', label: 'Semua Tamu' },
                      { id: 'CHECKIN_ONLY', label: 'Sudah Check-In (Prioritas)' },
                      { id: 'BOOKED_ONLY', label: 'Tamu Booked' }
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setExportBreakfastPriority(opt.id as any)}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border transition text-center ${
                          exportBreakfastPriority === opt.id
                            ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Period Selection */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Rentang Periode Laporan
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {(['Harian', 'Mingguan', 'Bulanan', 'Tahunan', 'Semua'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setExportPeriod(p)}
                      className={`py-2 px-2 rounded-lg font-bold text-xs border text-center transition ${
                        exportPeriod === p
                          ? 'bg-emerald-800 text-white border-emerald-800 shadow-2xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {p === 'Harian' && 'Hari Ini'}
                      {p === 'Mingguan' && '7 Hari'}
                      {p === 'Bulanan' && '30 Hari'}
                      {p === 'Tahunan' && '1 Tahun'}
                      {p === 'Semua' && 'Semua Data'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Information & Signatory Notice */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-slate-600">
                <div className="flex items-center space-x-2 text-emerald-800 font-bold text-xs">
                  <i className="fa-solid fa-signature text-emerald-600"></i>
                  <span>Pejabat Penandatangan Resmi (TTD & QR):</span>
                </div>
                <p className="text-[11px] font-bold text-slate-800">
                  {exportType === 'SARAPAN' && '🍳 Manager Koperasi (Laporan Pesanan Makanan & Konsumsi)'}
                  {exportType === 'QC' && '🔍 Manager Quality Control (QC) (Laporan Pengecekan QC)'}
                  {exportType === 'MAINTENANCE' && '🛠️ Manager Teknisi (Laporan Perawatan & Kerusakan Fasilitas)'}
                  {(exportType === 'KAMAR' || exportType === 'AULA') && '🏨 Manager Resepsionis (Laporan Pemesanan Kamar & Aula)'}
                  {(exportType === 'AUDIT' || exportType === 'JAM_KERJA' || exportType === 'LOG_UNDUH' || exportType === 'USERS') && (
                    `👑 ${currentUser?.role?.toLowerCase().includes('super') ? 'Super Admin' : 'Admin'} (${currentUser?.fullName || 'Akun Pengunduh'})`
                  )}
                </p>
                <p className="text-[10px] text-slate-500">
                  Dokumen akan diekspor dalam format <strong className="text-emerald-800">{exportFormat === 'PDF' ? 'PDF Resmi Ber-QR' : 'Excel .xlsx'}</strong> untuk periode <strong>{exportPeriod}</strong>. TTD &amp; QR Code hanya tertampil jika akun penandatangan bersangkutan telah mengunggah spesimen TTD.
                </p>
                {(exportType === 'KAMAR' || exportType === 'AULA') && (
                  <p className="text-[10px] text-emerald-800 font-semibold bg-emerald-50/80 p-1.5 rounded-lg border border-emerald-200 flex items-center gap-1.5">
                    <i className="fa-solid fa-coins text-gold-600 text-[11px]"></i>
                    <span>Laporan memuat rincian tarif resmi UPT Asrama Haji Jakarta &amp; rekapitulasi nilai biaya.</span>
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-2.5 pt-3 border-t border-slate-100 shrink-0">
                <button 
                  type="button" 
                  onClick={() => closeModal('modalExport')} 
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  disabled={isExporting}
                  className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 active:scale-98 text-white font-bold rounded-xl shadow-md transition flex items-center space-x-2 disabled:opacity-50"
                >
                  {isExporting ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin"></i>
                      <span>Menyiapkan...</span>
                    </>
                  ) : (
                    <>
                      <i className={`fa-solid ${exportFormat === 'PDF' ? 'fa-file-pdf' : 'fa-file-excel'}`}></i>
                      <span>Unduh {exportFormat === 'PDF' ? 'PDF Resmi' : 'Excel (.xlsx)'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isCalendarDetailOpen && calendarDetailData && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => closeModal('modalCalendarDetail')}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-100 flex flex-col max-h-[90vh] my-auto animate-in fade-in zoom-in duration-150"
            onClick={(e) => e.stopPropagation()}
          >
              <div className="bg-gradient-to-r from-slate-900 via-hajj-900 to-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
                  <div>
                      <div className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-gold-400 animate-pulse"></span>
                        <h3 className="font-bold text-base tracking-wide">Agenda & Reservasi Harian</h3>
                      </div>
                      <p className="text-xs text-gold-300 mt-0.5">
                        <i className="fa-regular fa-calendar-days mr-1.5"></i>
                        {formatIndonesianDate(calendarDetailData.dateStr)} ({calendarDetailData.dateStr})
                      </p>
                  </div>
                  <button onClick={() => closeModal('modalCalendarDetail')} className="text-white/70 hover:text-white text-lg p-1 rounded-lg hover:bg-white/10 transition">
                    <i className="fa-solid fa-xmark"></i>
                  </button>
              </div>

              {/* Summary Badges Bar */}
              {(() => {
                const allTxs: Transaction[] = calendarDetailData.dayTxs || [];
                const isMeetingTx = (t: Transaction) => t.building === 'Ruang Pertemuan' || t.building === 'Gedung Serbaguna (SG)' || t.building === 'Gedung Serbaguna' || isMeetingFacility(t.building) || isMeetingFacility(t.roomNumber);
                const kamarTxs = allTxs.filter(t => !isMeetingTx(t));
                const aulaTxs = allTxs.filter(t => isMeetingTx(t));
                return (
                  <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full font-bold flex items-center space-x-1.5 border border-emerald-200">
                        <i className="fa-solid fa-bed text-emerald-600"></i>
                        <span>{kamarTxs.length} Kamar Terisi/Booked</span>
                      </span>
                      <span className="px-2.5 py-1 bg-purple-100 text-purple-800 rounded-full font-bold flex items-center space-x-1.5 border border-purple-200">
                        <i className="fa-solid fa-landmark text-purple-600"></i>
                        <span>{aulaTxs.length} Aula / Serbaguna Disewa</span>
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          closeModal('modalCalendarDetail');
                          const vacantRoom = rooms.find(r => r.status === 'KOSONG' && r.building !== 'Ruang Pertemuan' && r.building !== 'Gedung Serbaguna (SG)' && !isMeetingFacility(r.building)) || rooms[0];
                          if (vacantRoom) {
                            openModal('modalCheckin', { roomId: vacantRoom.id, actionType: 'BOOKING', initialDate: calendarDetailData.dateStr });
                          }
                        }}
                        className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-xs cursor-pointer"
                        title="Booking kamar langsung untuk tanggal ini"
                      >
                        <i className="fa-solid fa-calendar-plus text-gold-300 text-xs"></i>
                        <span>+ Booking Kamar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          closeModal('modalCalendarDetail');
                          const aulaRoom = rooms.find(r => r.building === 'Ruang Pertemuan' || r.building === 'Gedung Serbaguna (SG)' || isMeetingFacility(r.building)) || rooms[rooms.length - 1];
                          if (aulaRoom) {
                            openModal('modalCheckin', { roomId: aulaRoom.id, actionType: 'BOOKING', initialDate: calendarDetailData.dateStr, initialDuration: 8 });
                          }
                        }}
                        className="px-2.5 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-xs cursor-pointer"
                        title="Sewa aula ruang pertemuan untuk tanggal ini"
                      >
                        <i className="fa-solid fa-landmark text-xs"></i>
                        <span>+ Sewa Aula</span>
                      </button>
                    </div>
                  </div>
                );
              })()}

              <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                {(() => {
                  const allTxs: Transaction[] = calendarDetailData.dayTxs || [];
                  const isMeetingTx = (t: Transaction) => t.building === 'Ruang Pertemuan' || t.building === 'Gedung Serbaguna (SG)' || t.building === 'Gedung Serbaguna' || isMeetingFacility(t.building) || isMeetingFacility(t.roomNumber);
                  const kamarTxs = allTxs.filter(t => !isMeetingTx(t));
                  const aulaTxs = allTxs.filter(t => isMeetingTx(t));

                  if (allTxs.length === 0) {
                    return (
                      <div className="p-10 text-center text-slate-400 space-y-2">
                        <i className="fa-solid fa-calendar-xmark text-5xl text-slate-300"></i>
                        <p className="text-sm font-semibold text-slate-600">Tidak ada agenda hunian kamar atau sewa ruangan pada tanggal ini.</p>
                        <p className="text-xs text-slate-400">Seluruh kamar dan ruangan berstatus kosong / siap dibooking.</p>
                      </div>
                    );
                  }

                  return (
                    <>
                      {/* Section 1: Gedung & Kamar Penginapan */}
                      <div>
                        <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-2">
                          <h4 className="font-bold text-xs uppercase tracking-wider text-emerald-800 flex items-center space-x-2">
                            <span className="p-1 rounded bg-emerald-100 text-emerald-700">
                              <i className="fa-solid fa-hotel"></i>
                            </span>
                            <span>Kamar Penginapan (Gedung A, B, C, D)</span>
                          </h4>
                          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            {kamarTxs.length} Kamar
                          </span>
                        </div>

                        {kamarTxs.length === 0 ? (
                          <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-center text-xs text-slate-400">
                            Tidak ada kamar yang menginap atau dibooking pada tanggal ini.
                          </div>
                        ) : (() => {
                          // Consolidate groups
                          const groupMap = new Map<string, Transaction[]>();
                          const individualTxs: Transaction[] = [];

                          kamarTxs.forEach(tx => {
                            let groupKey: string | null = null;
                            if (tx.groupId) {
                              groupKey = tx.groupId;
                            } else if (tx.kloter && tx.kloter !== '-') {
                              groupKey = `KLOTER-${tx.kloter}`;
                            } else if (
                              tx.guestName &&
                              (tx.guestName.toLowerCase().includes('rombongan') ||
                               tx.guestName.toLowerCase().includes('kloter'))
                            ) {
                              groupKey = `NAME-${(tx.guestName || '').trim().toLowerCase()}-${tx.startDate}`;
                            }

                            if (groupKey) {
                              if (!groupMap.has(groupKey)) {
                                groupMap.set(groupKey, []);
                              }
                              groupMap.get(groupKey)!.push(tx);
                            } else {
                              individualTxs.push(tx);
                            }
                          });

                          const groups = Array.from(groupMap.entries()).map(([key, txList]) => {
                            const first = txList[0];
                            const gName = first.groupName || (first.kloter && first.kloter !== '-' ? `Kloter ${first.kloter} (Haji)` : first.guestName);
                            const isHaji = first.category === 'JEMAAH' || (first.kloter && first.kloter !== '-');
                            const bookedCount = txList.filter(t => t.status === 'BOOKED').length;
                            const terisiCount = txList.filter(t => t.status === 'TERISI').length;
                            return {
                              id: key,
                              groupId: first.groupId || key,
                              groupName: gName,
                              isHaji,
                              transactions: txList,
                              roomNumbers: txList.map(t => t.roomNumber || '').filter(Boolean).sort(),
                              roomIds: txList.map(t => t.roomId),
                              buildings: txList.map(t => t.building).filter((v, i, a) => a.indexOf(v) === i).join(', '),
                              duration: first.duration,
                              startDate: first.startDate,
                              bookedCount,
                              terisiCount,
                              picName: first.guestName,
                              phone: first.phone || '-'
                            };
                          });

                          return (
                            <div className="space-y-4">
                              {/* Rombongan Groups */}
                              {groups.length > 0 && (
                                <div className="space-y-2.5">
                                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                    <i className="fa-solid fa-users text-emerald-600"></i>
                                    <span>Rombongan ({groups.length})</span>
                                  </div>
                                  <div className="grid grid-cols-1 gap-3">
                                    {groups.map(grp => (
                                      <div key={grp.id} className="p-4 rounded-xl border-2 border-emerald-300 bg-emerald-50/40 shadow-xs flex flex-col justify-between space-y-3">
                                        <div>
                                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                            <div className="flex items-center space-x-2">
                                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-700 text-white flex items-center space-x-1">
                                                <i className={`fa-solid ${grp.isHaji ? 'fa-kaaba' : 'fa-users'} text-[9px]`}></i>
                                                <span>{grp.isHaji ? 'Jemaah Haji (Kloter)' : 'Rombongan'}</span>
                                              </span>
                                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-emerald-800 border border-emerald-200">
                                                {grp.roomNumbers.length} Kamar ({grp.buildings})
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[10px] font-bold">
                                              {grp.terisiCount > 0 && (
                                                <span className="px-2 py-0.5 rounded bg-emerald-600 text-white">
                                                  {grp.terisiCount} Menginap
                                                </span>
                                              )}
                                              {grp.bookedCount > 0 && (
                                                <span className="px-2 py-0.5 rounded bg-blue-600 text-white">
                                                  {grp.bookedCount} Booked
                                                </span>
                                              )}
                                            </div>
                                          </div>

                                          <h5 className="font-black text-sm text-slate-900">
                                            {grp.groupName}
                                          </h5>

                                          <div className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                                            <div>
                                              <i className="fa-solid fa-user-tie text-emerald-600 mr-1"></i>
                                              <span>PIC: <strong>{grp.picName}</strong> {grp.phone !== '-' && `(${grp.phone})`}</span>
                                            </div>
                                            <div>
                                              <i className="fa-regular fa-calendar text-slate-400 mr-1"></i>
                                              <span>Mulai: <strong>{grp.startDate}</strong> ({grp.duration} Malam)</span>
                                            </div>
                                          </div>

                                          {/* Room numbers */}
                                          <div className="mt-2 flex flex-wrap items-center gap-1">
                                            <span className="text-[11px] font-semibold text-slate-600 mr-1">Daftar Kamar:</span>
                                            {grp.roomNumbers.map(rn => (
                                              <span key={rn} className="px-1.5 py-0.5 rounded bg-white text-slate-800 border border-emerald-200 text-[10px] font-bold font-mono">
                                                {rn}
                                              </span>
                                            ))}
                                          </div>
                                        </div>

                                        {/* Action Buttons: Batch Check-in / Checkout / Invoice */}
                                        <div className="pt-2.5 border-t border-emerald-200 flex flex-wrap items-center justify-between gap-2">
                                          <div className="flex items-center gap-1.5">
                                            {grp.bookedCount > 0 && (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  batchCheckinGroup(grp.groupId);
                                                  closeModal('modalCalendarDetail');
                                                }}
                                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-xs cursor-pointer"
                                                title="Check-In sekaligus seluruh kamar rombongan"
                                              >
                                                <i className="fa-solid fa-bolt text-amber-300"></i>
                                                <span>⚡ Batch Check-In ({grp.bookedCount})</span>
                                              </button>
                                            )}

                                            {grp.terisiCount > 0 && (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  batchCheckoutGroup(grp.groupId);
                                                  closeModal('modalCalendarDetail');
                                                }}
                                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-xs cursor-pointer"
                                                title="Check-Out sekaligus seluruh kamar rombongan"
                                              >
                                                <i className="fa-solid fa-right-from-bracket text-blue-200"></i>
                                                <span>⚡ Batch Check-Out ({grp.terisiCount})</span>
                                              </button>
                                            )}
                                          </div>

                                          <div className="flex items-center gap-1.5">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                closeModal('modalCalendarDetail');
                                                openModal('modalInvoice', {
                                                  transaction: grp.transactions[0],
                                                  room: rooms.find(r => r.id === grp.transactions[0].roomId),
                                                  onReturn: () => openModal('modalCalendarDetail', calendarDetailData)
                                                });
                                              }}
                                              className="px-3 py-1.5 bg-slate-900 hover:bg-hajj-800 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-xs cursor-pointer"
                                              title="Buka dan cetak invoice resmi seluruh kamar rombongan"
                                            >
                                              <i className="fa-solid fa-file-invoice text-gold-400"></i>
                                              <span>Invoice Rombongan</span>
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Individual Guests */}
                              {individualTxs.length > 0 && (
                                <div className="space-y-2.5">
                                  {groups.length > 0 && (
                                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 pt-1">
                                      <i className="fa-solid fa-user text-blue-600"></i>
                                      <span>Tamu Perseorangan ({individualTxs.length})</span>
                                    </div>
                                  )}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {individualTxs.map(tx => (
                                      <div key={tx.id} className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs flex flex-col justify-between space-y-2">
                                        <div>
                                          <div className="flex items-center justify-between mb-1.5">
                                            <div className="flex items-center space-x-1.5">
                                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-white">{tx.building}</span>
                                              <span className="font-black text-slate-800 text-sm">No. {tx.roomNumber}</span>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${tx.status === 'TERISI' ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'}`}>
                                              {tx.status === 'TERISI' ? 'Menginap' : 'Booked'}
                                            </span>
                                          </div>
                                          <div className="font-bold text-xs text-slate-900 flex items-center space-x-1">
                                            <i className="fa-solid fa-user text-emerald-600 text-[11px]"></i>
                                            <span>{tx.guestName}</span>
                                            <span className="text-[10px] text-slate-500 font-normal">({tx.category === 'JEMAAH' ? `Kloter ${tx.kloter}` : 'Tamu Umum'})</span>
                                          </div>
                                          <div className="text-[11px] text-slate-600 mt-1 space-y-0.5">
                                            <div><i className="fa-regular fa-calendar text-slate-400 mr-1"></i> Mulai: <span className="font-semibold">{tx.startDate}</span> ({tx.duration} Malam)</div>
                                            <div><i className="fa-solid fa-bed text-slate-400 mr-1"></i> Tipe: <span className="font-semibold">{tx.rentType || 'Per Kamar'}</span></div>
                                            {tx.phone && <div><i className="fa-solid fa-phone text-slate-400 mr-1"></i> {tx.phone}</div>}
                                          </div>
                                        </div>
                                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                                          <span className="text-slate-400 font-mono">#{tx.id}</span>
                                          <div className="flex items-center space-x-1.5">
                                            <button 
                                              type="button"
                                              onClick={() => {
                                                closeModal('modalCalendarDetail');
                                                openModal('modalRoomDetail', { roomId: tx.roomId });
                                              }} 
                                              className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-md border border-slate-200 flex items-center space-x-1 transition shadow-2xs cursor-pointer"
                                              title="Lihat Rincian Kamar"
                                            >
                                              <i className="fa-solid fa-eye text-slate-500"></i>
                                              <span>Kamar</span>
                                            </button>
                                            <button 
                                              type="button"
                                              onClick={() => {
                                                closeModal('modalCalendarDetail');
                                                openModal('modalInvoice', { 
                                                  transaction: tx, 
                                                  room: rooms.find(r => r.id === tx.roomId),
                                                  onReturn: () => openModal('modalCalendarDetail', calendarDetailData)
                                                });
                                              }} 
                                              className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-md shadow-xs flex items-center space-x-1.5 transition cursor-pointer"
                                              title="Buka & Cetak Invoice Resmi"
                                            >
                                              <i className="fa-solid fa-file-invoice text-emerald-200"></i>
                                              <span>Invoice Resmi</span>
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Section 2: Ruang Pertemuan (Aula) */}
                      <div>
                        <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-2">
                          <h4 className="font-bold text-xs uppercase tracking-wider text-purple-800 flex items-center space-x-2">
                            <span className="p-1 rounded bg-purple-100 text-purple-700">
                              <i className="fa-solid fa-landmark"></i>
                            </span>
                            <span>Ruang Pertemuan / Aula</span>
                          </h4>
                          <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                            {aulaTxs.length} Ruangan Disewa
                          </span>
                        </div>

                        {aulaTxs.length === 0 ? (
                          <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-center text-xs text-slate-400">
                            Tidak ada ruang pertemuan yang disewa pada tanggal ini. Seluruh aula siap dibooking.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {aulaTxs.map(tx => (
                              <div key={tx.id} className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/50 shadow-xs flex flex-col justify-between space-y-2">
                                <div>
                                  <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center space-x-1.5">
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-700 text-white">Aula</span>
                                      <span className="font-black text-slate-800 text-sm">{tx.roomNumber}</span>
                                    </div>
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-600 text-white">
                                      {tx.duration} Jam Sewa
                                    </span>
                                  </div>
                                  <div className="font-bold text-xs text-slate-900 flex items-center space-x-1">
                                    <i className="fa-solid fa-building-user text-purple-600 text-[11px]"></i>
                                    <span>{tx.guestName}</span>
                                    <span className="text-[10px] text-slate-500 font-normal">({tx.category})</span>
                                  </div>
                                  <div className="text-[11px] text-slate-600 mt-1 space-y-0.5">
                                    <div><i className="fa-regular fa-calendar-check text-slate-400 mr-1"></i> Tanggal: <span className="font-semibold">{tx.startDate}</span></div>
                                    <div><i className="fa-solid fa-clock text-slate-400 mr-1"></i> Durasi: <span className="font-bold text-purple-900">{tx.duration} Jam</span> ({tx.duration === 12 ? 'Penuh 1 Penyewa' : 'Paket 8 Jam'})</div>
                                    {tx.notes && <div className="text-slate-700 bg-white/70 p-1.5 rounded border border-purple-100 text-[10px]"><i className="fa-solid fa-note-sticky text-slate-400 mr-1"></i> {tx.notes}</div>}
                                    {tx.phone && <div><i className="fa-solid fa-phone text-slate-400 mr-1"></i> {tx.phone}</div>}
                                  </div>
                                </div>
                                <div className="pt-2 border-t border-purple-200/60 flex items-center justify-between text-[10px]">
                                  <span className="text-slate-400 font-mono">#{tx.id}</span>
                                  <div className="flex items-center space-x-1.5">
                                    <button 
                                      type="button"
                                      onClick={() => {
                                        closeModal('modalCalendarDetail');
                                        openModal('modalRoomDetail', { roomId: tx.roomId });
                                      }} 
                                      className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-md border border-slate-200 flex items-center space-x-1 transition shadow-2xs cursor-pointer"
                                      title="Lihat Rincian Aula"
                                    >
                                      <i className="fa-solid fa-eye text-slate-500"></i>
                                      <span>Aula</span>
                                    </button>
                                    <button 
                                      type="button"
                                      onClick={() => {
                                        closeModal('modalCalendarDetail');
                                        openModal('modalInvoice', { 
                                          transaction: tx, 
                                          room: rooms.find(r => r.id === tx.roomId),
                                          onReturn: () => openModal('modalCalendarDetail', calendarDetailData)
                                        });
                                      }} 
                                      className="px-2.5 py-1 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-md shadow-xs flex items-center space-x-1.5 transition cursor-pointer"
                                      title="Buka & Cetak Invoice Resmi"
                                    >
                                      <i className="fa-solid fa-file-invoice text-purple-200"></i>
                                      <span>Invoice Resmi</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
                  <div className="text-xs text-slate-500">
                    Petugas Operasional UPT Asrama Haji
                  </div>
                  <button onClick={() => closeModal('modalCalendarDetail')} className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition shadow">
                    Tutup
                  </button>
              </div>
          </div>
        </div>
      )}

      {isReceiptOpen && receiptTx && (
        <InvoiceModal 
          isOpen={true}
          onClose={() => closeModal('modalReceipt')}
          tx={receiptTx}
          room={rooms.find(r => r.id === receiptTx.roomId) || null}
          returnToRoomId={receiptTx.roomId}
        />
      )}

      {isCheckoutSelectionOpen && (() => {
        const targetRoomId = modalState.modalCheckoutSelection?.data?.roomId;
        const modalType = modalState.modalCheckoutSelection?.data?.type || 'CHECKOUT';
        const targetRoom = rooms.find(r => r.id === targetRoomId);
        const isAula = Boolean(
          targetRoom && (
            targetRoom.building === 'Ruang Pertemuan' ||
            targetRoom.building === 'Gedung Serbaguna (SG)' ||
            targetRoom.building === 'Gedung Serbaguna' ||
            isMeetingFacility(targetRoom.building) ||
            isMeetingFacility(targetRoom.roomNumber) ||
            targetRoom.type?.toLowerCase().includes('aula') ||
            targetRoom.type?.toLowerCase().includes('pertemuan') ||
            targetRoom.type?.toLowerCase().includes('serbaguna')
          )
        );
        const isCancel = modalType === 'CANCEL';

        // Filter active transactions for this room
        const activeTxs = transactions.filter(t => {
          if (t.roomId !== targetRoomId) return false;
          if (t.status === 'DIBATALKAN' || t.status === 'SELESAI') return false;
          if (isCancel) {
            return t.status === 'BOOKED' || t.status === 'TERISI';
          } else {
            return t.status === 'TERISI' || t.status === 'BOOKED';
          }
        }).sort((a, b) => {
          if (isCancel) {
            if (a.status === 'BOOKED' && b.status !== 'BOOKED') return -1;
            if (a.status !== 'BOOKED' && b.status === 'BOOKED') return 1;
          } else {
            if (a.status === 'TERISI' && b.status !== 'TERISI') return -1;
            if (a.status !== 'TERISI' && b.status === 'TERISI') return 1;
          }
          return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
        });

        const headerGradient = isCancel 
          ? 'bg-gradient-to-r from-amber-700 via-amber-800 to-slate-900' 
          : 'bg-gradient-to-r from-red-800 via-red-900 to-slate-900';

        const headerTitle = isCancel 
          ? `Pilih Reservasi Dibatalkan ${targetRoom?.type ? `(${targetRoom.type})` : ''}` 
          : `Pilih Tamu Check-Out ${targetRoom?.type ? `(${targetRoom.type})` : ''}`;

        return (
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
            onClick={() => closeModal('modalCheckoutSelection')}
          >
            <div 
              className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-150 flex flex-col max-h-[92vh] my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              
              {/* HEADER (Matches modalCheckin style) */}
              <div className={`${headerGradient} px-6 py-4 text-white flex items-center justify-between shrink-0`}>
                <div>
                  <h3 className="font-bold text-base flex items-center space-x-2">
                    <i className={isCancel ? "fa-solid fa-ban text-amber-300" : "fa-solid fa-right-from-bracket text-red-300"}></i>
                    <span>{headerTitle}</span>
                  </h3>
                  <p className="text-xs text-gold-300 font-medium mt-0.5 flex items-center space-x-1.5">
                    <i className="fa-solid fa-hotel text-[10px]"></i>
                    <span>{targetRoom?.building || 'Asrama Haji'} - {targetRoom?.roomNumber || targetRoomId}</span>
                  </p>
                </div>
                <button 
                  onClick={() => {
                    setConfirmActionTxId(null);
                    closeModal('modalCheckoutSelection');
                  }} 
                  className="text-white/70 hover:text-white text-lg p-1.5 rounded-lg hover:bg-white/10 transition"
                  title="Tutup"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>

              {/* CONTENT BODY */}
              <div className="p-6 space-y-4 text-xs overflow-y-auto flex-1 custom-scrollbar">
                {/* NOTIFICATION INFO BANNER */}
                {isCancel ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                    <div className="font-bold text-xs flex items-center space-x-1.5 text-amber-800">
                      <i className="fa-solid fa-calendar-xmark text-amber-600"></i>
                      <span>Ditemukan {activeTxs.length} Reservasi Booking untuk {isAula ? 'Ruangan' : 'Kamar'} {targetRoom?.roomNumber}</span>
                    </div>
                    <p className="text-[11px] text-amber-700 mt-1">
                      Silakan pilih data tamu / pemesan di bawah ini yang ingin dibatalkan reservasinya dari sistem:
                    </p>
                  </div>
                ) : (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-900">
                    <div className="font-bold text-xs flex items-center space-x-1.5 text-red-800">
                      <i className="fa-solid fa-door-closed text-red-600"></i>
                      <span>Ditemukan {activeTxs.length} Tamu yang Sedang Menginap di Kamar {targetRoom?.roomNumber}</span>
                    </div>
                    <p className="text-[11px] text-red-700 mt-1">
                      Silakan pilih data tamu yang telah menyelesaikan masa inap untuk memproses Check-Out dan pengembalian kunci kamar:
                    </p>
                  </div>
                )}

                {/* LIST OF CARDS */}
                {activeTxs.length === 0 ? (
                  <div className="p-8 text-center space-y-3 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center text-xl mx-auto">
                      <i className="fa-solid fa-inbox"></i>
                    </div>
                    <div className="font-bold text-slate-700 text-sm">
                      Tidak Ada Data {isCancel ? 'Reservasi Booking' : 'Tamu Menginap'} Aktif
                    </div>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto">
                      Kamar/ruangan ini tidak memiliki transaksi aktif yang sesuai kriteria.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                    {activeTxs.map((bTx) => (
                      <div 
                        key={bTx.id} 
                        className={`p-3.5 bg-white border-2 rounded-xl transition shadow-xs space-y-2.5 ${
                          isCancel 
                            ? 'border-slate-200 hover:border-amber-500' 
                            : 'border-slate-200 hover:border-red-500'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                              <span className="font-bold text-sm text-slate-900">{bTx.guestName}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                bTx.category === 'JEMAAH' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
                              }`}>
                                {bTx.category === 'JEMAAH' ? 'Jemaah Haji' : 'Tamu Umum'}
                              </span>
                              {bTx.phone && (
                                <span className="text-[11px] text-slate-500 flex items-center space-x-1">
                                  <i className="fa-solid fa-phone text-[9px] text-slate-400"></i>
                                  <span>{bTx.phone}</span>
                                </span>
                              )}
                            </div>
                            {bTx.kloter && bTx.kloter !== '-' && (
                              <div className="text-[11px] text-blue-700 font-semibold mt-0.5">
                                <i className="fa-solid fa-kaaba mr-1"></i> Kloter: {bTx.kloter}
                              </div>
                            )}
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">ID Reservasi: {bTx.id}</div>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold border shrink-0 ${
                            bTx.status === 'TERISI' 
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                              : 'bg-blue-100 text-blue-800 border-blue-300'
                          }`}>
                            {bTx.status === 'TERISI' ? 'SEDANG MENGINAP' : 'BOOKED'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          <div>
                            <i className="fa-regular fa-calendar-check text-slate-400 mr-1"></i>
                            Jadwal: <span className="font-semibold text-slate-800">{formatIndonesianDate(bTx.startDate)}</span>
                          </div>
                          <div>
                            <i className="fa-solid fa-clock text-slate-400 mr-1"></i>
                            Durasi: <span className="font-semibold text-slate-800">{bTx.duration} {bTx.durationUnit || (isAula ? 'Jam' : 'Malam')}</span>
                          </div>
                          <div>
                            <i className="fa-solid fa-bed text-slate-400 mr-1"></i>
                            Sewa: <span className="font-semibold text-slate-800">{bTx.rentType || (isAula ? 'Sewa Aula' : 'Per Kamar')}</span>
                          </div>
                          <div>
                            <i className="fa-solid fa-receipt text-slate-400 mr-1"></i>
                            Total: <span className="font-bold text-slate-900">{formatRupiah(bTx.totalPrice || 0)}</span>
                          </div>
                          <div>
                            <i className="fa-solid fa-utensils text-slate-400 mr-1"></i>
                            Sarapan: {bTx.breakfast ? (
                              <span className="font-bold text-orange-700">
                                {bTx.breakfastMenu || 'Pesan'} ({bTx.breakfastPortions || 1} Porsi × {bTx.breakfastDays || bTx.duration} Hari)
                              </span>
                            ) : (
                              <span className="text-slate-400">Tidak Pesan</span>
                            )}
                          </div>
                          <div>
                            <i className="fa-solid fa-calendar-xmark text-slate-400 mr-1"></i>
                            Selesai: <span className="font-semibold text-slate-800">{formatIndonesianDate(addDaysToDateStr(bTx.startDate, bTx.duration))}</span>
                          </div>
                          {bTx.notes && (
                            <div className="col-span-2 text-[10px] text-slate-500 italic bg-white/80 p-1.5 rounded border border-slate-100">
                              <i className="fa-solid fa-note-sticky mr-1 text-slate-400"></i> Catatan: {bTx.notes}
                            </div>
                          )}
                        </div>

                        {/* ACTION BUTTONS (Matches modalCheckin layout) */}
                        <div className="flex items-center justify-end space-x-2 pt-1 border-t border-slate-100">
                          {confirmActionTxId === bTx.id ? (
                            <div className="flex items-center space-x-2 w-full justify-end flex-wrap gap-y-1">
                              <span className="text-xs font-bold text-slate-700">
                                Yakin {isCancel ? 'batalkan booking' : 'check-out'} tamu ini?
                              </span>
                              <button
                                type="button"
                                onClick={() => setConfirmActionTxId(null)}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition"
                              >
                                Batal
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (isCancel) {
                                    cancelBooking(targetRoomId, bTx.id);
                                  } else {
                                    checkoutRoom(targetRoomId, bTx.id);
                                  }
                                  setConfirmActionTxId(null);
                                  closeModal('modalCheckoutSelection');
                                }}
                                className={`px-3.5 py-1.5 text-white font-bold rounded-lg text-xs shadow flex items-center space-x-1.5 transition ${
                                  isCancel 
                                    ? 'bg-amber-600 hover:bg-amber-700' 
                                    : 'bg-red-600 hover:bg-red-700'
                                }`}
                              >
                                <i className="fa-solid fa-check"></i>
                                <span>{isCancel ? 'Ya, Batalkan' : 'Ya, Check-Out'}</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center justify-end gap-1.5 w-full">
                              <button
                                type="button"
                                onClick={() => openModal('modalInvoice', { transaction: bTx })}
                                className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-lg text-xs border border-slate-300 shadow-2xs flex items-center space-x-1 transition cursor-pointer"
                                title="Cetak invoice administrasi"
                              >
                                <i className="fa-solid fa-print text-indigo-600"></i>
                                <span>Invoice</span>
                              </button>

                              {bTx.status === 'TERISI' && (
                                <button
                                  type="button"
                                  onClick={() => openModal('modalExtend', { transaction: bTx })}
                                  className="px-2.5 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold rounded-lg text-xs border border-teal-200 flex items-center space-x-1 transition cursor-pointer"
                                  title="Perpanjang durasi sewa"
                                >
                                  <i className="fa-solid fa-clock-rotate-left text-teal-600"></i>
                                  <span>Extend</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  openModal('modalCheckin', {
                                    roomId: targetRoomId,
                                    actionType: 'EDIT_BOOKING',
                                    txToEdit: bTx,
                                    initialDate: bTx.startDate,
                                    initialDuration: bTx.duration,
                                  });
                                }}
                                className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold rounded-lg text-xs border border-amber-200 flex items-center space-x-1 transition cursor-pointer"
                                title="Sesuaikan data tamu, extra bed, dan paket sarapan"
                              >
                                <i className="fa-solid fa-pen-to-square text-amber-600"></i>
                                <span>Sesuaikan</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setConfirmActionTxId(bTx.id)}
                                className={`px-3.5 py-1.5 text-white font-bold rounded-lg text-xs shadow flex items-center space-x-1.5 transition cursor-pointer ${
                                  isCancel 
                                    ? 'bg-amber-600 hover:bg-amber-700' 
                                    : 'bg-red-600 hover:bg-red-700'
                                }`}
                                title={isCancel ? 'Batalkan reservasi tamu ini' : 'Proses check-out tamu ini'}
                              >
                                <i className={isCancel ? "fa-solid fa-ban" : "fa-solid fa-right-from-bracket"}></i>
                                <span>{isCancel ? 'Batalkan' : 'Check-Out'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* MODAL FOOTER */}
                <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                  <div className="text-[11px] text-slate-400 flex items-center space-x-1.5">
                    <i className="fa-solid fa-shield-halved text-emerald-600"></i>
                    <span>UPT Asrama Haji Jakarta • Manajemen Hunian</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmActionTxId(null);
                      closeModal('modalCheckoutSelection');
                    }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL QC INSPECTION */}
      {isQcInspectionOpen && qcTargetRoom && (() => {
        const isQcAula = qcTargetRoom.building === 'Ruang Pertemuan' || qcTargetRoom.roomNumber.toLowerCase().includes('aula');
        return (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => closeModal('modalQcInspection')}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-100 flex flex-col max-h-[92vh] my-auto animate-in fade-in zoom-in duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-teal-700 via-teal-800 to-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="p-1.5 bg-white/20 rounded-lg text-white">
                    <i className="fa-solid fa-clipboard-check"></i>
                  </span>
                  <h3 className="font-bold text-base">
                    {isQcAula ? 'Inspeksi Quality Control (QC) Ruang Pertemuan (Aula)' : 'Inspeksi Quality Control (QC) Kamar'}
                  </h3>
                </div>
                <p className="text-xs text-teal-200 mt-0.5">
                  {qcTargetRoom.building} - {qcTargetRoom.roomNumber} ({qcTargetRoom.type})
                </p>
              </div>
              <button onClick={() => closeModal('modalQcInspection')} className="text-white/70 hover:text-white text-lg p-1 rounded-lg hover:bg-white/10 transition">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleQcInspectionSubmit} className="p-6 space-y-4 text-xs overflow-y-auto flex-1 custom-scrollbar">
              {!isQcRole(currentUser?.role) ? (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 space-y-1">
                  <div className="flex items-center space-x-1.5 font-bold text-xs">
                    <i className="fa-solid fa-circle-exclamation text-red-600"></i>
                    <span>Akses Terbatas: Khusus Tim Quality Control</span>
                  </div>
                  <p className="text-[11px] text-red-700">
                    Akun Anda ({currentUser?.role}) tidak memiliki otoritas mengesahkan standar QC. Hubungi Manager QC atau Petugas QC bertugas.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-teal-900 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-full bg-teal-700 text-white flex items-center justify-center font-bold text-xs">
                      <i className="fa-solid fa-user-check"></i>
                    </div>
                    <div>
                      <div className="font-bold text-xs">Petugas QC: {currentUser?.fullName}</div>
                      <div className="text-[10px] text-teal-700">{currentUser?.role} - Verifikasi kelayakan {isQcAula ? 'ruang pertemuan' : 'kamar'}</div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-teal-200 text-teal-900 rounded font-bold text-[10px]">
                    Tim QC Terverifikasi
                  </span>
                </div>
              )}

              {/* Banner Khusus Verifikasi Pasca Teknisi */}
              {(qcTargetRoom?.qcStatus === 'MENUNGGU_QC' || activeMaintForQc?.status === 'MENUNGGU_QC') && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl space-y-2 text-amber-950">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 font-bold text-xs">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
                      <i className="fa-solid fa-bell text-amber-600"></i>
                      <span>Verifikasi Akhir Pasca Perbaikan Teknisi</span>
                    </div>
                    <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded font-bold text-[10px]">
                      {activeMaintForQc?.id || 'TIKET TEKNISI'}
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-900 leading-relaxed">
                    Petugas teknisi <strong>({activeMaintForQc?.technician || 'Teknisi Bertugas'})</strong> telah menyelesaikan perbaikan fisik. Lakukan pengujian fungsi secara teliti dan putuskan kelayakan akhir sebelum kamar/aula dibuka kembali untuk tamu.
                  </p>
                  {activeMaintForQc?.technicianNotes && (
                    <div className="bg-white/80 p-2 rounded-lg border border-amber-200 text-[11px] text-slate-800">
                      <span className="font-bold text-amber-900 block mb-0.5">Catatan Pengerjaan Teknisi:</span>
                      "{activeMaintForQc.technicianNotes}"
                    </div>
                  )}
                </div>
              )}

              {/* Jenis / Fokus Inspeksi QC */}
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700 text-xs">
                  Jenis / Fokus Inspeksi QC:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setInspectionCategory('PEMBERSIHAN_SELESAI_DIGUNAKAN');
                      setQcResult('LOLOS_QC');
                    }}
                    className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                      inspectionCategory === 'PEMBERSIHAN_SELESAI_DIGUNAKAN'
                        ? 'bg-teal-50 border-teal-500 text-teal-900 font-bold ring-1 ring-teal-400'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-[10px] font-bold">🧹 Pembersihan Selesai</div>
                    <div className="text-[8px] text-slate-500 mt-0.5">Pasca check-out</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInspectionCategory('PENGECEKAN_RUTIN');
                      setQcResult('LOLOS_QC');
                    }}
                    className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                      inspectionCategory === 'PENGECEKAN_RUTIN'
                        ? 'bg-teal-50 border-teal-500 text-teal-900 font-bold ring-1 ring-teal-400'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-[10px] font-bold">🔍 Cek Rutin Berkala</div>
                    <div className="text-[8px] text-slate-500 mt-0.5">Inspeksi terjadwal</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInspectionCategory('VERIFIKASI_PASCA_TEKNISI');
                      setQcResult('LOLOS_VERIFIKASI_TEKNISI');
                    }}
                    className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                      inspectionCategory === 'VERIFIKASI_PASCA_TEKNISI'
                        ? 'bg-amber-50 border-amber-500 text-amber-900 font-bold ring-1 ring-amber-400'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-[10px] font-bold">🔧 Pasca Teknisi</div>
                    <div className="text-[8px] text-slate-500 mt-0.5">Uji verifikasi akhir</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInspectionCategory('BUTUH_PERBAIKAN');
                      setQcResult('PERLU_PERBAIKAN');
                    }}
                    className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                      inspectionCategory === 'BUTUH_PERBAIKAN'
                        ? 'bg-red-50 border-red-500 text-red-900 font-bold ring-1 ring-red-400'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-[10px] font-bold">⚠️ Butuh Perbaikan</div>
                    <div className="text-[8px] text-slate-500 mt-0.5">Kirim ke teknisi</div>
                  </button>
                </div>
              </div>

              {/* Checklist Parameters */}
              <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <h4 className="font-bold text-slate-800 uppercase tracking-wide text-[11px] flex items-center">
                  <i className="fa-solid fa-list-check text-teal-600 mr-1.5"></i>
                  {isQcAula ? 'Checklist Kelayakan Fasilitas Ruang Pertemuan (Aula)' : 'Checklist Parameter Kelayakan Kamar'}
                </h4>

                {/* 1. Kebersihan */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                  <div>
                    <div className="font-bold text-slate-800">
                      {isQcAula ? '1. Kebersihan Lantai, Karpet & Toilet' : '1. Kebersihan Lantai & Kamar Mandi'}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {isQcAula ? 'Debu, karpet disedot, higienitas toilet & sanitasi' : 'Debu, sampah, bau, dan higienitas sanitasi'}
                    </div>
                  </div>
                  <select 
                    value={cleanliness} 
                    onChange={e => setCleanliness(e.target.value as any)}
                    className="p-1.5 border border-slate-300 rounded-lg font-bold bg-white text-xs"
                  >
                    <option value="BAIK">🟢 Bersih &amp; Higienis (BAIK)</option>
                    <option value="CUKUP">🟡 Cukup Bersih (CUKUP)</option>
                    <option value="BURUK">🔴 Kotor / Perlu Dibilas (BURUK)</option>
                  </select>
                </div>

                {/* 2. Linen / Tata Ruang */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                  <div>
                    <div className="font-bold text-slate-800">
                      {isQcAula ? '2. Penataan Meja, Kursi & Podium' : '2. Sprei, Selimut & Linen Kasur'}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {isQcAula ? 'Kerapian susunan kursi, kebersihan cover meja/kursi' : 'Kerapian, wangi cucian, tidak bernoda'}
                    </div>
                  </div>
                  <select 
                    value={linenBed} 
                    onChange={e => setLinenBed(e.target.value as any)}
                    className="p-1.5 border border-slate-300 rounded-lg font-bold bg-white text-xs"
                  >
                    <option value="LENGKAP_BERSIH">{isQcAula ? '🟢 Rapi, Lengkap & Siap Pakai' : '🟢 Lengkap, Rapi & Bersih'}</option>
                    <option value="PERLU_GANTI">{isQcAula ? '🔴 Berantakan / Cover Bernoda' : '🔴 Noda / Kusut (Perlu Ganti)'}</option>
                  </select>
                </div>

                {/* 3. AC & Listrik */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                  <div>
                    <div className="font-bold text-slate-800">
                      {isQcAula ? '3. AC Sentral/Standing & Penerangan' : '3. AC, Saklar & Kelistrikan'}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {isQcAula ? 'Suhu pendingin stabil, lampu panggung/ruangan berfungsi' : 'Suhu AC dingin, remote berfungsi, lampu menyala'}
                    </div>
                  </div>
                  <select 
                    value={acElectricity} 
                    onChange={e => setAcElectricity(e.target.value as any)}
                    className="p-1.5 border border-slate-300 rounded-lg font-bold bg-white text-xs"
                  >
                    <option value="NORMAL">🟢 Normal &amp; Berfungsi Baik</option>
                    <option value="BERMASALAH">🔴 Bermasalah (Tidak Dingin/Mati)</option>
                  </select>
                </div>

                {/* 4. Plumbing / Sound System */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                  <div>
                    <div className="font-bold text-slate-800">
                      {isQcAula ? '4. Sound System, Wireless Mic & Proyektor' : '4. Kran, Wastafel & Flush Toilet'}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {isQcAula ? 'Kualitas audio, mic tanpa gangguan, layar proyektor' : 'Aliran air lancar, tidak mampet, water heater'}
                    </div>
                  </div>
                  <select 
                    value={plumbingWater} 
                    onChange={e => setPlumbingWater(e.target.value as any)}
                    className="p-1.5 border border-slate-300 rounded-lg font-bold bg-white text-xs"
                  >
                    <option value="LANCAR">{isQcAula ? '🟢 Suara Jernih & Alat Normal' : '🟢 Lancar & Deras'}</option>
                    <option value="BERMASALAH">{isQcAula ? '🔴 Audio Mati / Mic Bermasalah' : '🔴 Bocor / Mampet / Air Mati'}</option>
                  </select>
                </div>

                {/* 5. Amenities / Perlengkapan Acara */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                  <div>
                    <div className="font-bold text-slate-800">
                      {isQcAula ? '5. Perlengkapan Pendukung Acara' : '5. Perlengkapan & Amenities'}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {isQcAula ? 'Kabel roll, stand mic, papan penunjuk arah, signage' : 'Handuk, sabun, gantungan baju, sajadah'}
                    </div>
                  </div>
                  <select 
                    value={amenities} 
                    onChange={e => setAmenities(e.target.value as any)}
                    className="p-1.5 border border-slate-300 rounded-lg font-bold bg-white text-xs"
                  >
                    <option value="LENGKAP">🟢 Lengkap Sesuai Standar</option>
                    <option value="KURANG">🔴 Kurang / Belum Disediakan</option>
                  </select>
                </div>
              </div>

              {/* Status Hasil Inspeksi - Detailed 4-Option Decision Matrix */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-800 text-xs">
                    Keputusan Hasil Inspeksi &amp; Verifikasi QC:
                  </label>
                  <span className="text-[10px] text-slate-500">Pilih salah satu keputusan resmi</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Opsi 1: Lolos QC Rutin */}
                  <button
                    type="button"
                    onClick={() => setQcResult('LOLOS_QC')}
                    className={`p-3 rounded-xl border text-left transition flex items-start space-x-2.5 cursor-pointer ${
                      qcResult === 'LOLOS_QC' 
                        ? 'border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-400 shadow-sm' 
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                      qcResult === 'LOLOS_QC' ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
                    }`}>
                      {qcResult === 'LOLOS_QC' && <span className="w-1.5 h-1.5 rounded-full bg-white"></span>}
                    </div>
                    <div>
                      <div className="font-bold text-emerald-950 text-xs flex items-center space-x-1">
                        <span>1. Lolos QC Rutin (Siap Huni)</span>
                      </div>
                      <p className="text-[10px] text-slate-600 mt-0.5 leading-snug">
                        {isQcAula 
                          ? 'Aula bersih, sarana normal, dan siap digunakan untuk acara.' 
                          : 'Kamar memenuhi seluruh standar kebersihan & fasilitas rutin. Siap ditempati tamu.'}
                      </p>
                    </div>
                  </button>

                  {/* Opsi 2: Verifikasi Lolos Pasca Teknisi */}
                  <button
                    type="button"
                    onClick={() => setQcResult('LOLOS_VERIFIKASI_TEKNISI')}
                    className={`p-3 rounded-xl border text-left transition flex items-start space-x-2.5 cursor-pointer ${
                      qcResult === 'LOLOS_VERIFIKASI_TEKNISI' 
                        ? 'border-teal-600 bg-teal-50 ring-2 ring-teal-500 shadow-sm' 
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                      qcResult === 'LOLOS_VERIFIKASI_TEKNISI' ? 'border-teal-700 bg-teal-700' : 'border-slate-300'
                    }`}>
                      {qcResult === 'LOLOS_VERIFIKASI_TEKNISI' && <span className="w-1.5 h-1.5 rounded-full bg-white"></span>}
                    </div>
                    <div>
                      <div className="font-bold text-teal-950 text-xs flex items-center space-x-1">
                        <span>2. Lolos Pasca Perbaikan Teknisi</span>
                      </div>
                      <p className="text-[10px] text-slate-600 mt-0.5 leading-snug">
                        Hasil perbaikan teknisi terbukti tuntas &amp; sempurna. Tiket perawatan resmi <strong>SELESAI</strong> dan kamar siap huni.
                      </p>
                    </div>
                  </button>

                  {/* Opsi 3: Revisi Perbaikan Teknisi */}
                  <button
                    type="button"
                    onClick={() => setQcResult('REVISI_PERBAIKAN')}
                    className={`p-3 rounded-xl border text-left transition flex items-start space-x-2.5 cursor-pointer ${
                      qcResult === 'REVISI_PERBAIKAN' 
                        ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-400 shadow-sm' 
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                      qcResult === 'REVISI_PERBAIKAN' ? 'border-amber-600 bg-amber-600' : 'border-slate-300'
                    }`}>
                      {qcResult === 'REVISI_PERBAIKAN' && <span className="w-1.5 h-1.5 rounded-full bg-white"></span>}
                    </div>
                    <div>
                      <div className="font-bold text-amber-950 text-xs flex items-center space-x-1">
                        <span>3. Revisi Perbaikan (Ditolak QC)</span>
                      </div>
                      <p className="text-[10px] text-slate-600 mt-0.5 leading-snug">
                        Hasil perbaikan teknisi belum tuntas / tidak lolos uji fungsi. Tiket dikembalikan ke Teknisi (status <strong>PROSES</strong>) untuk diperbaiki ulang.
                      </p>
                    </div>
                  </button>

                  {/* Opsi 4: Perlu Perbaikan Baru */}
                  <button
                    type="button"
                    onClick={() => setQcResult('PERLU_PERBAIKAN')}
                    className={`p-3 rounded-xl border text-left transition flex items-start space-x-2.5 cursor-pointer ${
                      qcResult === 'PERLU_PERBAIKAN' 
                        ? 'border-red-500 bg-red-50 ring-2 ring-red-400 shadow-sm' 
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                      qcResult === 'PERLU_PERBAIKAN' ? 'border-red-600 bg-red-600' : 'border-slate-300'
                    }`}>
                      {qcResult === 'PERLU_PERBAIKAN' && <span className="w-1.5 h-1.5 rounded-full bg-white"></span>}
                    </div>
                    <div>
                      <div className="font-bold text-red-950 text-xs flex items-center space-x-1">
                        <span>4. Perlu Perbaikan (Temuan Baru)</span>
                      </div>
                      <p className="text-[10px] text-slate-600 mt-0.5 leading-snug">
                        Ditemukan kerusakan fisik/sarana baru. Otomatis terbitkan tiket perbaikan baru ke Manager Teknisi.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Catatan QC */}
              <div>
                <label className="block font-bold text-slate-700 mb-1 text-xs">
                  Catatan Rekomendasi / Detail Temuan QC:
                </label>
                <textarea
                  value={qcNotes}
                  onChange={e => setQcNotes(e.target.value)}
                  rows={2}
                  placeholder={
                    qcResult === 'REVISI_PERBAIKAN'
                      ? "Jelaskan alasan penolakan dan bagian yang wajib diperbaiki ulang teknisi..."
                      : qcResult === 'LOLOS_VERIFIKASI_TEKNISI'
                      ? "Contoh: Pipa telah diganti teknisi dan diuji tidak bocor lagi. Fungsi kelistrikan aman dan normal."
                      : isQcAula
                      ? "Contoh: Sound system jernih, AC aula dingin, proyektor tajam..."
                      : "Contoh: Kondisi sangat bersih, AC dingin 18°C, handuk sudah tertata rapi..."
                  }
                  className="w-full p-2.5 border border-slate-300 rounded-lg outline-none text-xs focus:ring-2 focus:ring-teal-500 bg-white"
                ></textarea>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 shrink-0">
                <button 
                  type="button" 
                  onClick={() => closeModal('modalQcInspection')} 
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  disabled={!isQcRole(currentUser?.role)}
                  className={`px-5 py-2 font-bold rounded-lg shadow transition flex items-center space-x-1.5 cursor-pointer ${
                    !isQcRole(currentUser?.role)
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : qcResult === 'LOLOS_QC'
                      ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                      : qcResult === 'LOLOS_VERIFIKASI_TEKNISI'
                      ? 'bg-teal-700 hover:bg-teal-800 text-white'
                      : qcResult === 'REVISI_PERBAIKAN'
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-rose-700 hover:bg-rose-800 text-white'
                  }`}
                >
                  <i className={`fa-solid ${
                    qcResult === 'LOLOS_QC' ? 'fa-circle-check' :
                    qcResult === 'LOLOS_VERIFIKASI_TEKNISI' ? 'fa-stamp' :
                    qcResult === 'REVISI_PERBAIKAN' ? 'fa-rotate-left' :
                    'fa-wrench'
                  }`}></i>
                  <span>
                    {qcResult === 'LOLOS_QC' ? 'Sahkan Lolos QC (Siap Huni)' :
                     qcResult === 'LOLOS_VERIFIKASI_TEKNISI' ? 'Sahkan Lolos Verifikasi Pasca Teknisi' :
                     qcResult === 'REVISI_PERBAIKAN' ? 'Tolak & Kembalikan ke Teknisi (Revisi)' :
                     'Terbitkan Tiket Perbaikan Teknisi'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
        );
      })()}

      {/* MODAL EXTEND / PERPANJANG SEWA HUNIAN ATAU RUANG */}
      <ExtendModal 
        isOpen={Boolean(modalState.modalExtend?.isOpen)}
        onClose={() => closeModal('modalExtend')}
        tx={(modalState.modalExtend?.data?.transaction as Transaction) || null}
        room={modalState.modalExtend?.data?.room || null}
        groupKey={modalState.modalExtend?.data?.groupKey}
        groupRecord={modalState.modalExtend?.data?.groupRecord}
        returnToRoomId={modalState.modalExtend?.data?.returnToRoomId || modalState.modalExtend?.data?.room?.id || null}
      />

      {/* MODAL INVOICE CETAK RINCIAN CHECKIN / CHECKOUT (NON-HARGA) */}
      <InvoiceModal 
        isOpen={Boolean(modalState.modalInvoice?.isOpen)}
        onClose={() => closeModal('modalInvoice')}
        tx={
          (modalState.modalInvoice?.data?.transaction as Transaction) || 
          (modalState.modalInvoice?.data?.tx as Transaction) || 
          (modalState.modalInvoice?.data?.id ? (modalState.modalInvoice.data as Transaction) : null) || 
          null
        }
        room={
          modalState.modalInvoice?.data?.room || 
          (modalState.modalInvoice?.data?.id && transactions.find(t => t.id === modalState.modalInvoice.data.id) ? rooms.find(r => r.id === transactions.find(t => t.id === modalState.modalInvoice.data.id)?.roomId) : null) ||
          null
        }
        groupKey={modalState.modalInvoice?.data?.groupKey}
        groupRecord={modalState.modalInvoice?.data?.groupRecord}
        returnToRoomId={modalState.modalInvoice?.data?.returnToRoomId || modalState.modalInvoice?.data?.room?.id || null}
        onReturn={modalState.modalInvoice?.data?.onReturn}
        autoOpenPaymentModal={Boolean(modalState.modalInvoice?.data?.autoOpenPaymentModal)}
        onExtend={(targetTx) => {
          closeModal('modalInvoice');
          openModal('modalExtend', { transaction: targetTx, returnToRoomId: targetTx.roomId });
        }}
        onEdit={(targetTx) => {
          closeModal('modalInvoice');
          openModal('modalCheckin', {
            roomId: targetTx.roomId,
            actionType: 'EDIT_BOOKING',
            txToEdit: targetTx,
            initialDate: targetTx.startDate,
            initialDuration: targetTx.duration,
            returnToRoomId: targetTx.roomId
          });
        }}
      />

      {/* MODAL KWITANSI RESMI TANDA TERIMA PEMBAYARAN (AKSES KHUSUS TIM OPERASIONAL) */}
      <KwitansiModal
        isOpen={Boolean(modalState.modalKwitansi?.isOpen)}
        onClose={() => closeModal('modalKwitansi')}
        tx={
          (modalState.modalKwitansi?.data?.transaction as Transaction) || 
          (modalState.modalKwitansi?.data?.tx as Transaction) || 
          (modalState.modalKwitansi?.data?.id ? (modalState.modalKwitansi.data as Transaction) : null) || 
          null
        }
        room={
          modalState.modalKwitansi?.data?.room || 
          (modalState.modalKwitansi?.data?.id && transactions.find(t => t.id === modalState.modalKwitansi.data.id) ? rooms.find(r => r.id === transactions.find(t => t.id === modalState.modalKwitansi.data.id)?.roomId) : null) ||
          null
        }
        groupKey={modalState.modalKwitansi?.data?.groupKey}
        groupRecord={modalState.modalKwitansi?.data?.groupRecord}
      />

      {/* MODAL RINCIAN & ADMINISTRASI HUNIAN KAMAR / RUANG */}
      <RoomDetailModal
        isOpen={Boolean(modalState.modalRoomDetail?.isOpen)}
        onClose={() => closeModal('modalRoomDetail')}
        roomId={modalState.modalRoomDetail?.data?.roomId || null}
      />

      {/* MODAL PENDAFTARAN ROMBONGAN (HAJI, UMUM & INSTANSI) */}
      <GroupRegistrationModal
        isOpen={Boolean(modalState.modalGroupRegistration?.isOpen)}
        onClose={() => closeModal('modalGroupRegistration')}
        defaultGroupType={modalState.modalGroupRegistration?.data?.defaultGroupType || 'INSTANSI'}
        initialGroupName={modalState.modalGroupRegistration?.data?.initialGroupName}
        initialPicName={modalState.modalGroupRegistration?.data?.initialPicName}
        initialPicPhone={modalState.modalGroupRegistration?.data?.initialPicPhone}
        initialMembers={modalState.modalGroupRegistration?.data?.initialMembers}
        isEdit={modalState.modalGroupRegistration?.data?.isEdit}
        editGroupId={modalState.modalGroupRegistration?.data?.editGroupId}
        initialStartDate={modalState.modalGroupRegistration?.data?.initialStartDate}
        initialDuration={modalState.modalGroupRegistration?.data?.initialDuration}
        initialRoomIds={modalState.modalGroupRegistration?.data?.initialRoomIds}
        initialAgencyOrDocument={modalState.modalGroupRegistration?.data?.initialAgencyOrDocument}
        initialCateringPackage={modalState.modalGroupRegistration?.data?.initialCateringPackage}
        initialIncludeBreakfast={modalState.modalGroupRegistration?.data?.initialIncludeBreakfast}
        initialBreakfastPortions={modalState.modalGroupRegistration?.data?.initialBreakfastPortions}
        initialIncludeAula={modalState.modalGroupRegistration?.data?.initialIncludeAula}
        initialMeetingRoomId={modalState.modalGroupRegistration?.data?.initialMeetingRoomId}
        initialMeetingRoomSession={modalState.modalGroupRegistration?.data?.initialMeetingRoomSession}
        initialMeetingRoomDays={modalState.modalGroupRegistration?.data?.initialMeetingRoomDays}
        initialStatusMode={modalState.modalGroupRegistration?.data?.initialStatusMode}
      />

      {/* MODAL DAFTAR AGENDA LENGKAP HARI INI (CHECKIN / CHECKOUT) */}
      <AgendaListModal
        isOpen={Boolean(modalState.modalAgendaList?.isOpen)}
        onClose={() => closeModal('modalAgendaList')}
        type={modalState.modalAgendaList?.data?.type || 'CHECKIN'}
      />

      {/* MODAL EDIT PROFIL AKUN PENGGUNA */}
      <AccountProfileModal
        isOpen={Boolean(modalState.modalAccountProfile?.isOpen)}
        onClose={() => closeModal('modalAccountProfile')}
        initialSection={modalState.modalAccountProfile?.data?.section}
      />

      {/* MODAL INPUT & EDIT UNIT KAMAR (3 Tipe: Ekonomi, Standar, Superior; Double s/d 8 Bed) */}
      <RoomModal
        isOpen={Boolean(modalState.modalRoomEdit?.isOpen)}
        onClose={() => closeModal('modalRoomEdit')}
        roomToEdit={modalState.modalRoomEdit?.data?.room || null}
      />

      {/* MODAL MASTER TARIF & KAPASITAS KAMAR */}
      <RoomCapacityRateModal
        isOpen={Boolean(modalState.modalRoomCapacityRate?.isOpen)}
        onClose={() => closeModal('modalRoomCapacityRate')}
        rateToEdit={modalState.modalRoomCapacityRate?.data?.rate || null}
      />
    </>
  );
}
