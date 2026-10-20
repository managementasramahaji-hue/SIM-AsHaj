import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, Room, ConsolidatedGroupRecord } from '../types';
import { formatIndonesianDate, addDaysToDateStr, formatRupiah } from '../lib/utils';
import { useAppContext } from '../store';
import { useBodyScrollLock } from '../lib/scrollLock';
import { findRoomRate, INDONESIAN_BANKS, OFFICIAL_VA_CONFIG } from '../data';
import { calculateTransactionPricing, calculateGroupPricing } from '../lib/pricingCalculator';

interface ExtendModalProps {
  isOpen: boolean;
  onClose: () => void;
  tx: Transaction | null;
  room?: Room | null;
  returnToRoomId?: string | null;
  onReturn?: () => void;
  groupKey?: string;
  groupRecord?: ConsolidatedGroupRecord;
}

export function ExtendModal({
  isOpen,
  onClose,
  tx,
  room,
  returnToRoomId,
  onReturn,
  groupKey,
  groupRecord
}: ExtendModalProps) {
  const { 
    extendTransaction, 
    transactions, 
    rooms, 
    openModal, 
    roomCapacityRates = [], 
    meetingRooms = [], 
    breakfastMenuItems = [] 
  } = useAppContext();
  
  useBodyScrollLock(isOpen);
  
  const isAula = tx?.building === 'Ruang Pertemuan';
  const defaultAdd = isAula ? 24 : 1;
  const [addedDuration, setAddedDuration] = useState<number>(defaultAdd);
  const [reason, setReason] = useState<string>('Perpanjangan masa sewa atas permintaan tamu');
  
  // Previous choices from initial booking
  const previousHasFood = Boolean(
    tx?.breakfast || 
    (tx?.breakfastPortions && tx.breakfastPortions > 0) || 
    (tx?.cateringPackage && tx.cateringPackage !== 'TIDAK') ||
    groupRecord?.breakfast ||
    (groupRecord?.cateringPackage && groupRecord.cateringPackage !== 'TIDAK')
  );

  const previousHasExtraBed = Boolean(
    tx?.extraBed || 
    (tx?.extraBedCount && tx.extraBedCount > 0) ||
    groupRecord?.extraBed ||
    (groupRecord?.extraBedCount && groupRecord.extraBedCount > 0)
  );

  // Checkboxes default to previous choice: if previously ordered, default checked to continue
  const [extendBreakfast, setExtendBreakfast] = useState<boolean>(previousHasFood);
  const [extendExtraBed, setExtendExtraBed] = useState<boolean>(previousHasExtraBed);
  const [extendEntireGroup, setExtendEntireGroup] = useState<boolean>(true);

  // Payment Options State for Extension
  const isPreviouslyLunas = tx?.paymentStatus === 'LUNAS';
  const [paymentMode, setPaymentMode] = useState<'LUNAS_SEKARANG' | 'BAYAR_NANTI' | 'DP_SEKARANG'>('LUNAS_SEKARANG');
  const [paymentMethod, setPaymentMethod] = useState<'VA_UPT' | 'TRANSFER' | 'CASH' | 'QRIS'>(
    (tx?.paymentMethod === 'TRANSFER' || tx?.dpMethod === 'TRANSFER') ? 'TRANSFER' : 'VA_UPT'
  );
  const [paymentBank, setPaymentBank] = useState<string>(tx?.bankName || 'Bank Mandiri');
  
  // Customizable VA and Bank Account Numbers (just like in initial booking modal)
  const [customVaNumber, setCustomVaNumber] = useState<string>(tx?.vaNumber || OFFICIAL_VA_CONFIG.vaNumber);
  const [customVaAccountName, setCustomVaAccountName] = useState<string>(tx?.vaAccountName || OFFICIAL_VA_CONFIG.accountName);
  const [customBankAccountNumber, setCustomBankAccountNumber] = useState<string>(tx?.bankAccountNumber || OFFICIAL_VA_CONFIG.vaNumber);
  const [customBankAccountName, setCustomBankAccountName] = useState<string>(tx?.vaAccountName || OFFICIAL_VA_CONFIG.accountName);
  
  const [customPayAmount, setCustomPayAmount] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');

  const pricingOptions = useMemo(() => ({
    rooms,
    roomCapacityRates,
    meetingRooms,
    breakfastMenuItems
  }), [rooms, roomCapacityRates, meetingRooms, breakfastMenuItems]);

  // Sync defaults when tx changes
  useEffect(() => {
    if (tx) {
      setAddedDuration(tx.building === 'Ruang Pertemuan' ? 24 : 1);
      const hadFood = Boolean(
        tx.breakfast || 
        (tx.breakfastPortions && tx.breakfastPortions > 0) || 
        (tx.cateringPackage && tx.cateringPackage !== 'TIDAK') ||
        groupRecord?.breakfast ||
        (groupRecord?.cateringPackage && groupRecord.cateringPackage !== 'TIDAK')
      );
      const hadEb = Boolean(
        tx.extraBed || 
        (tx.extraBedCount && tx.extraBedCount > 0) ||
        groupRecord?.extraBed ||
        (groupRecord?.extraBedCount && groupRecord.extraBedCount > 0)
      );
      setExtendBreakfast(hadFood);
      setExtendExtraBed(hadEb);
      setReason('Perpanjangan masa sewa atas permintaan tamu');
      setExtendEntireGroup(true);
      setPaymentMode('LUNAS_SEKARANG');
      setPaymentMethod((tx.paymentMethod === 'TRANSFER' || tx.dpMethod === 'TRANSFER') ? 'TRANSFER' : 'VA_UPT');
      setPaymentBank(tx.bankName || 'Bank Mandiri');
      setCustomVaNumber(tx.vaNumber || OFFICIAL_VA_CONFIG.vaNumber);
      setCustomVaAccountName(tx.vaAccountName || OFFICIAL_VA_CONFIG.accountName);
      setCustomBankAccountNumber(tx.bankAccountNumber || OFFICIAL_VA_CONFIG.vaNumber);
      setCustomBankAccountName(tx.vaAccountName || OFFICIAL_VA_CONFIG.accountName);
      setCustomPayAmount('');
      setPaymentNotes('');
    }
  }, [tx, groupRecord]);

  const targetRoomId = returnToRoomId || room?.id || tx?.roomId;

  const handleDismiss = () => {
    onClose();
    if (targetRoomId) {
      if (onReturn) {
        onReturn();
      } else {
        openModal('modalRoomDetail', { roomId: targetRoomId });
      }
    }
  };

  // Group handling
  const isGroup = Boolean(tx?.isGroup || tx?.groupId || groupRecord);
  const memberTransactions = useMemo(() => {
    if (!tx || !isGroup) return [];
    if (tx.groupId) {
      return transactions.filter(t => t.groupId === tx.groupId && t.status !== 'DIBATALKAN' && t.status !== 'SELESAI');
    }
    return [tx];
  }, [tx, isGroup, transactions]);

  // Target rooms being extended
  const targetRoomsToCheck = useMemo(() => {
    if (!tx) return [];
    if (isAula) {
      return [{ roomId: tx.roomId, roomNumber: tx.roomNumber, building: tx.building }];
    }
    if (isGroup && extendEntireGroup) {
      if (groupRecord && groupRecord.allRoomNumbers.length > 0) {
        return groupRecord.allRoomNumbers.map(rNum => {
          const rObj = rooms.find(r => r.roomNumber === rNum);
          return { roomId: rObj?.id || rNum, roomNumber: rNum, building: rObj?.building || tx.building };
        });
      }
      return memberTransactions.map(m => ({ roomId: m.roomId, roomNumber: m.roomNumber, building: m.building }));
    }
    return [{ roomId: tx.roomId, roomNumber: tx.roomNumber, building: tx.building }];
  }, [tx, isAula, isGroup, extendEntireGroup, groupRecord, memberTransactions, rooms]);

  // Computed new dates
  const currentDuration = Number(tx?.duration) || 1;
  const currentCheckoutDate = tx ? (!isAula ? addDaysToDateStr(tx.startDate, currentDuration) : tx.startDate) : '';
  const newDuration = currentDuration + (Number(addedDuration) || 0);
  const newCheckoutDate = tx ? (!isAula ? addDaysToDateStr(tx.startDate, newDuration) : tx.startDate) : '';

  // Comprehensive Conflict Detection Engine
  const conflictsList = useMemo(() => {
    if (!tx || addedDuration <= 0) return [];

    const currentEndStr = !isAula 
      ? addDaysToDateStr(tx.startDate, currentDuration) 
      : addDaysToDateStr(tx.startDate, Math.max(1, Math.ceil(currentDuration / 24)) - 1);
    const newEndStr = !isAula 
      ? addDaysToDateStr(tx.startDate, newDuration) 
      : addDaysToDateStr(tx.startDate, Math.max(1, Math.ceil(newDuration / 24)) - 1);

    const checkRoomIds = targetRoomsToCheck.map(r => r.roomId);
    const checkRoomNums = targetRoomsToCheck.map(r => r.roomNumber);
    const currentMemberIds = memberTransactions.map(m => m.id);

    const collisions: Array<{
      roomNumber: string;
      building: string;
      conflictingTx: Transaction;
    }> = [];

    transactions.forEach(other => {
      if (other.id === tx.id || currentMemberIds.includes(other.id)) return;
      if (other.status === 'DIBATALKAN' || other.status === 'SELESAI') return;

      const isSameRoom = checkRoomIds.includes(other.roomId) || checkRoomNums.includes(other.roomNumber);
      if (!isSameRoom) return;

      const otherNights = other.durationUnit === 'Malam' ? other.duration : Math.max(1, Math.ceil((other.duration || 1) / 24));
      const otherEnd = !isAula 
        ? addDaysToDateStr(other.startDate, other.duration) 
        : addDaysToDateStr(other.startDate, otherNights);

      // Collision happens if other.startDate < newEndStr AND otherEnd > currentEndStr
      const overlaps = other.startDate < newEndStr && otherEnd > currentEndStr;

      if (overlaps) {
        collisions.push({
          roomNumber: other.roomNumber || 'Kamar',
          building: other.building,
          conflictingTx: other
        });
      }
    });

    return collisions;
  }, [tx, addedDuration, isAula, currentDuration, newDuration, targetRoomsToCheck, memberTransactions, transactions]);

  const hasConflict = conflictsList.length > 0;

  // Previous food & extrabed descriptions
  const previousFoodLabel = useMemo(() => {
    if (!tx) return 'Tidak ada';
    if (tx.cateringPackage && tx.cateringPackage !== 'TIDAK') {
      return `${tx.cateringPackage} (${tx.cateringPaxCount || tx.totalPax || 1} porsi/pax)`;
    }
    if (tx.breakfast) {
      return `Sarapan Pagi (${tx.breakfastPortions || 1} porsi)`;
    }
    if (groupRecord?.cateringPackage && groupRecord.cateringPackage !== 'TIDAK') {
      return `${groupRecord.cateringPackage} (${groupRecord.cateringPaxCount || groupRecord.totalPax || 1} porsi/pax)`;
    }
    if (groupRecord?.breakfast) {
      return `Sarapan Pagi (${groupRecord.breakfastPortions || groupRecord.totalPax || 1} porsi)`;
    }
    return 'Tidak memesan sarapan / katering pada booking awal';
  }, [tx, groupRecord]);

  const previousExtraBedCount = tx?.extraBedCount || groupRecord?.extraBedCount || (tx?.extraBed ? 1 : 0);
  const previousExtraBedLabel = useMemo(() => {
    if (previousHasExtraBed && previousExtraBedCount > 0) {
      return `${previousExtraBedCount} Unit Extra Bed (@ ${formatRupiah(tx?.extraBedPrice || 100000)}/malam)`;
    }
    return 'Tidak ada layanan extra bed pada booking awal';
  }, [previousHasExtraBed, previousExtraBedCount, tx]);

  // Calculate pricing breakdown of the extension
  const { addedCost, newGrandTotal, baseRoomRate, currentGrandTotal, previousPaid, remainingPreviousBill } = useMemo(() => {
    if (!tx) {
      return { 
        addedCost: 0, 
        newGrandTotal: 0, 
        baseRoomRate: 0, 
        currentGrandTotal: 0,
        previousPaid: 0,
        remainingPreviousBill: 0
      };
    }

    const prevPaid = Number(tx.paidAmount || tx.dpAmount || 0);

    if (isAula) {
      const mrObj = meetingRooms.find(m => m.name === tx.roomNumber || m.id === tx.roomId);
      const isDayDuration = tx.durationUnit === 'Hari' || addedDuration >= 24;
      const rate = isDayDuration ? (mrObj?.dailyRate || 15000000) : (mrObj?.sessionRate || 8500000);
      const qty = isDayDuration ? Math.ceil(addedDuration / 24) : 1;
      const addRoom = rate * qty;
      const curPricing = calculateTransactionPricing(tx, pricingOptions).grandTotal;
      const remPrev = Math.max(0, curPricing - prevPaid);
      return {
        addedCost: addRoom,
        newGrandTotal: curPricing + addRoom,
        baseRoomRate: rate,
        currentGrandTotal: curPricing,
        previousPaid: prevPaid,
        remainingPreviousBill: remPrev
      };
    }

    if (isGroup && extendEntireGroup && groupRecord) {
      const curGroup = calculateGroupPricing(groupRecord, pricingOptions).grandTotal;
      let roomRateSum = 0;
      groupRecord.allRoomNumbers.forEach(rNum => {
        const rObj = rooms.find(r => r.roomNumber === rNum);
        const matchedRate = findRoomRate(rObj?.type || 'Standar', rObj?.bedType, roomCapacityRates);
        const rRate = rObj?.pricePerNight || matchedRate?.pricePerNight || 480000;
        roomRateSum += rRate;
      });
      const addRoomCost = roomRateSum * Number(addedDuration);
      const addBfCost = extendBreakfast ? (groupRecord.totalPax || 1) * 25000 * Number(addedDuration) : 0;
      const addExtraCost = extendExtraBed ? (groupRecord.extraBedCount || 1) * 100000 * Number(addedDuration) : 0;
      const totalAdd = addRoomCost + addBfCost + addExtraCost;
      const remPrev = Math.max(0, curGroup - prevPaid);
      return {
        addedCost: totalAdd,
        newGrandTotal: curGroup + totalAdd,
        baseRoomRate: roomRateSum,
        currentGrandTotal: curGroup,
        previousPaid: prevPaid,
        remainingPreviousBill: remPrev
      };
    }

    // Individual Transaction
    const rObj = room || rooms.find(r => r.id === tx.roomId || r.roomNumber === tx.roomNumber);
    const matchedRate = findRoomRate(rObj?.type || tx.category || 'Standar', rObj?.bedType, roomCapacityRates);
    const rate = rObj?.pricePerNight || matchedRate?.pricePerNight || 480000;
    const addRoomCost = rate * Number(addedDuration);
    const addBfCost = extendBreakfast ? (tx.breakfastPortions || 1) * 25000 * Number(addedDuration) : 0;
    const addExtraCost = extendExtraBed ? (tx.extraBedCount || 1) * (tx.extraBedPrice || 100000) * Number(addedDuration) : 0;
    const totalAdd = addRoomCost + addBfCost + addExtraCost;
    const curPricing = calculateTransactionPricing(tx, pricingOptions).grandTotal;
    const remPrev = Math.max(0, curPricing - prevPaid);

    return {
      addedCost: totalAdd,
      newGrandTotal: curPricing + totalAdd,
      baseRoomRate: rate,
      currentGrandTotal: curPricing,
      previousPaid: prevPaid,
      remainingPreviousBill: remPrev
    };
  }, [tx, isAula, isGroup, extendEntireGroup, groupRecord, addedDuration, extendBreakfast, extendExtraBed, room, rooms, roomCapacityRates, meetingRooms, pricingOptions]);

  // Actual payment amount used for submit
  const effectivePaymentAmount = useMemo(() => {
    if (paymentMode === 'LUNAS_SEKARANG') {
      // If previously LUNAS, only pay addedCost. If previously has remaining, pay (remaining + addedCost)
      return isPreviouslyLunas ? addedCost : (remainingPreviousBill + addedCost);
    }
    if (paymentMode === 'DP_SEKARANG') {
      const val = parseInt(customPayAmount.replace(/\D/g, ''), 10);
      return isNaN(val) ? Math.round(addedCost * 0.3) : val;
    }
    return 0; // BAYAR_NANTI
  }, [paymentMode, addedCost, isPreviouslyLunas, remainingPreviousBill, customPayAmount]);

  if (!isOpen || !tx) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasConflict || addedDuration <= 0) return;

    extendTransaction(
      tx.id,
      Number(addedDuration),
      extendBreakfast,
      extendExtraBed,
      reason,
      {
        mode: paymentMode,
        amount: effectivePaymentAmount,
        method: paymentMethod,
        bankName: paymentBank,
        vaNumber: customVaNumber,
        vaAccountName: customVaAccountName,
        bankAccountNumber: customBankAccountNumber,
        notes: paymentNotes
      },
      isGroup && extendEntireGroup
    );

    onClose();

    // Directly open the official Invoice & Kwitansi modal for immediate inspection/printing
    openModal('modalInvoice', {
      transaction: tx,
      room,
      groupKey,
      groupRecord
    });
  };

  const isCheckedIn = tx?.status === 'TERISI';

  if (!isCheckedIn) {
    return (
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        onClick={handleDismiss}
      >
        <div 
          className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center space-y-4 my-auto border border-amber-300 animate-in fade-in zoom-in duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-14 h-14 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto text-2xl border border-amber-300 shadow-inner">
            <i className="fa-solid fa-clock-rotate-left"></i>
          </div>
          <div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 inline-block mb-1.5">
              Belum Check-In (Status: {tx?.status || 'Belum Terisi'})
            </span>
            <h3 className="font-bold text-base text-slate-900">Perpanjangan (Extend) Belum Tersedia</h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Tombol dan fitur <strong>Extend</strong> hanya dapat digunakan setelah tamu/rombongan resmi melakukan proses <strong>Check-In</strong> dan berstatus <strong>TERISI</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
          >
            Kembali
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={handleDismiss}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[94vh] my-auto animate-in fade-in zoom-in duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="bg-gradient-to-r from-hajj-800 to-hajj-900 px-6 py-4 text-white flex items-center justify-between shrink-0 border-b border-gold-500/20">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gold-400/20 border border-gold-400/30 text-gold-300 flex items-center justify-center font-bold text-base shadow-inner shrink-0">
              <i className="fa-solid fa-clock-rotate-left"></i>
            </div>
            <div>
              <h3 className="font-bold text-base text-white tracking-tight flex items-center gap-2">
                <span>Perpanjang Masa Sewa (Extend)</span>
              </h3>
              <p className="text-xs text-gold-200">
                {isGroup ? (groupRecord?.groupName || tx.groupName || 'Rombongan') : `${tx.roomNumber} • ${tx.building}`}
              </p>
            </div>
          </div>
          
          <button 
            type="button" 
            onClick={handleDismiss} 
            className="text-white/70 hover:text-white text-lg p-1.5 rounded-xl hover:bg-white/10 transition cursor-pointer"
            title="Tutup"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs text-slate-700">
          
          {/* Status Badge Strip & Informasi Pembayaran Sebelumnya */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase ${
                  isCheckedIn 
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-blue-100 text-blue-800 border border-blue-300'
                }`}>
                  {isCheckedIn ? 'Sedang Check-In' : 'Reservasi Terjadwal (Booked)'}
                </span>
                <span className="font-bold text-slate-800 text-xs">
                  {tx.guestName || tx.groupName}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 block">Status Pembayaran Sebelumnya:</span>
                <span className={`font-bold text-[11px] ${
                  isPreviouslyLunas ? 'text-emerald-700' : 'text-amber-700'
                }`}>
                  {isPreviouslyLunas 
                    ? `LUNAS (100% - ${formatRupiah(previousPaid)})` 
                    : previousPaid > 0 
                    ? `DP (${formatRupiah(previousPaid)})` 
                    : 'Belum Ada Pembayaran'}
                </span>
              </div>
            </div>

            {/* Clear explanation of remaining vs extend obligation */}
            <div className={`p-2.5 rounded-lg border text-[11px] flex items-start space-x-2 ${
              isPreviouslyLunas 
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950' 
                : 'bg-amber-50 border-amber-300 text-amber-950'
            }`}>
              <i className={`fa-solid mt-0.5 text-xs ${isPreviouslyLunas ? 'fa-circle-check text-emerald-600' : 'fa-circle-info text-amber-600'}`}></i>
              <div>
                {isPreviouslyLunas ? (
                  <p>
                    <strong>Ketentuan:</strong> Tagihan sewa sebelumnya sudah <strong>Lunas 100%</strong> (Sisa Tagihan Lama: Rp 0). Untuk perpanjangan ini, tamu <strong>hanya perlu membayar biaya extend</strong> saja.
                  </p>
                ) : (
                  <p>
                    <strong>Ketentuan:</strong> Masih terdapat sisa tagihan sebelumnya sebesar <strong>{formatRupiah(remainingPreviousBill)}</strong>. Biaya extend akan ditambahkan ke tagihan berjalan.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Group Extension Option */}
          {isGroup && memberTransactions.length > 1 && (
            <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-purple-950 text-xs flex items-center gap-1.5">
                  <i className="fa-solid fa-users-rectangle text-purple-700"></i>
                  <span>Cakupan Perpanjangan Rombongan:</span>
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-200 text-purple-900">
                  {memberTransactions.length} Kamar Terdaftar
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setExtendEntireGroup(true)}
                  className={`p-2 rounded-lg font-bold text-xs border text-left flex items-center justify-between transition cursor-pointer ${
                    extendEntireGroup 
                      ? 'bg-purple-700 text-white border-purple-700 shadow-xs' 
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span>Seluruh Kamar Grup ({memberTransactions.length})</span>
                  <i className={`fa-solid ${extendEntireGroup ? 'fa-circle-check text-gold-300' : 'fa-circle text-slate-300'}`}></i>
                </button>
                <button
                  type="button"
                  onClick={() => setExtendEntireGroup(false)}
                  className={`p-2 rounded-lg font-bold text-xs border text-left flex items-center justify-between transition cursor-pointer ${
                    !extendEntireGroup 
                      ? 'bg-purple-700 text-white border-purple-700 shadow-xs' 
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span>Kamar Ini Saja ({tx.roomNumber})</span>
                  <i className={`fa-solid ${!extendEntireGroup ? 'fa-circle-check text-gold-300' : 'fa-circle text-slate-300'}`}></i>
                </button>
              </div>
            </div>
          )}

          {/* Opsi Tambahan Durasi */}
          <div>
            <label className="block font-bold text-slate-800 mb-1.5">
              Tambah Durasi Sewa ({isAula ? 'Jam Acara' : 'Malam Menginap'})
            </label>
            <div className="grid grid-cols-3 gap-2">
              {isAula ? (
                <>
                  <button
                    type="button"
                    onClick={() => setAddedDuration(8)}
                    className={`py-2 px-3 rounded-lg font-bold border text-xs transition cursor-pointer ${
                      addedDuration === 8 
                        ? 'bg-hajj-700 text-white border-hajj-700 shadow-xs' 
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    +8 Jam (Sesi)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddedDuration(24)}
                    className={`py-2 px-3 rounded-lg font-bold border text-xs transition cursor-pointer ${
                      addedDuration === 24 
                        ? 'bg-hajj-700 text-white border-hajj-700 shadow-xs' 
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    +24 Jam (1 Hari)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddedDuration(48)}
                    className={`py-2 px-3 rounded-lg font-bold border text-xs transition cursor-pointer ${
                      addedDuration === 48 
                        ? 'bg-hajj-700 text-white border-hajj-700 shadow-xs' 
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    +48 Jam (2 Hari)
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setAddedDuration(1)}
                    className={`py-2 px-3 rounded-lg font-bold border text-xs transition cursor-pointer ${
                      addedDuration === 1 
                        ? 'bg-hajj-700 text-white border-hajj-700 shadow-xs' 
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    +1 Malam
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddedDuration(2)}
                    className={`py-2 px-3 rounded-lg font-bold border text-xs transition cursor-pointer ${
                      addedDuration === 2 
                        ? 'bg-hajj-700 text-white border-hajj-700 shadow-xs' 
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    +2 Malam
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddedDuration(3)}
                    className={`py-2 px-3 rounded-lg font-bold border text-xs transition cursor-pointer ${
                      addedDuration === 3 
                        ? 'bg-hajj-700 text-white border-hajj-700 shadow-xs' 
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    +3 Malam
                  </button>
                </>
              )}
            </div>

            {/* Input Manual jika durasi berbeda */}
            <div className="mt-2 flex items-center space-x-2">
              <span className="text-[11px] text-slate-500 font-medium">Atau masukkan jumlah persis:</span>
              <input 
                type="number" 
                min={1} 
                max={isAula ? 336 : 60}
                value={addedDuration} 
                onChange={e => setAddedDuration(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 p-1.5 border border-slate-300 rounded text-center font-bold text-xs outline-none focus:ring-2 focus:ring-hajj-600"
              />
              <span className="text-[11px] text-slate-600 font-bold">{isAula ? 'Jam' : 'Malam'}</span>
            </div>
          </div>

          {/* Preview Jadwal & Check-Out Baru */}
          <div className="p-3 bg-hajj-50 border border-hajj-200 rounded-xl space-y-1.5">
            <span className="font-bold text-hajj-900 text-[11px] block">Rangkuman Jadwal Perpanjangan:</span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-500 block text-[10px]">Total Durasi Setelah Extend:</span>
                <span className="text-hajj-900 font-black text-xs">{newDuration} {isAula ? 'Jam' : 'Malam'}</span>
              </div>
              {!isAula && (
                <div>
                  <span className="text-slate-500 block text-[10px]">Tanggal Check-Out Baru:</span>
                  <span className="text-emerald-700 font-black text-xs">{formatIndonesianDate(newCheckoutDate)}</span>
                </div>
              )}
            </div>
          </div>

          {/* WARNING BENTROK JADWAL (CONFLICT DETECTION) */}
          {hasConflict && (
            <div className="p-3.5 bg-rose-50 border-2 border-rose-500 rounded-xl text-rose-950 text-xs space-y-2 animate-in fade-in">
              <div className="font-black flex items-center space-x-2 text-rose-800 text-sm">
                <i className="fa-solid fa-triangle-exclamation text-rose-600"></i>
                <span>Tidak Dapat Memperpanjang Sewa: Jadwal Kamar Bentrok!</span>
              </div>
              <p className="leading-relaxed">
                Terdapat reservasi aktif lain yang telah terdaftar pada rentang tanggal perpanjangan tersebut:
              </p>
              <div className="bg-white/80 p-2.5 rounded-lg border border-rose-200 space-y-1 font-medium">
                {conflictsList.map((c, i) => (
                  <div key={i} className="flex items-start space-x-1.5 text-[11px]">
                    <span className="font-bold text-rose-700">• Kamar {c.roomNumber} ({c.building}):</span>
                    <span>Sudah di-booking oleh <strong>{c.conflictingTx.guestName || c.conflictingTx.groupName}</strong> pada tanggal <strong>{formatIndonesianDate(c.conflictingTx.startDate)}</strong> s.d. <strong>{formatIndonesianDate(addDaysToDateStr(c.conflictingTx.startDate, c.conflictingTx.duration))}</strong>.</span>
                  </div>
                ))}
              </div>
              <p className="text-[10.5px] text-rose-700 italic">
                Silakan kurangi durasi perpanjangan agar tidak melewati tanggal check-in tamu berikutnya.
              </p>
            </div>
          )}

          {/* OPSI LAYANAN TAMBAHAN (DENGAN TAMPILAN PILIHAN SEBELUMNYA) */}
          {!isAula && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="border-b border-slate-200 pb-1.5">
                <span className="font-bold text-slate-800 block text-xs">
                  Penyesuaian Layanan Tambahan (Melihat Pilihan Sebelumnya):
                </span>
                <p className="text-[10.5px] text-slate-500">
                  Cukup centang pilihan di bawah untuk melanjutkan layanan yang dipesan sebelumnya.
                </p>
              </div>

              {/* 1. Layanan Sarapan / Makanan */}
              <div className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 text-xs flex items-center gap-1.5">
                    <i className="fa-solid fa-utensils text-amber-600"></i>
                    <span>Pesanan Makan / Sarapan:</span>
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    previousHasFood ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {previousHasFood ? 'Sebelumnya Memesan' : 'Sebelumnya Tidak Memesan'}
                  </span>
                </div>
                <p className="text-[10.5px] text-slate-500">
                  Rincian Sebelumnya: <strong className="text-slate-700">{previousFoodLabel}</strong>
                </p>
                <label className="flex items-center space-x-2.5 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={extendBreakfast}
                    onChange={e => setExtendBreakfast(e.target.checked)}
                    className="rounded text-hajj-700 focus:ring-hajj-600 h-4 w-4 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-800">
                    Lanjutkan Pesanan Makan / Sarapan Selama Masa Extend (+Rp 25.000 / porsi / hari)
                  </span>
                </label>
              </div>

              {/* 2. Layanan Extra Bed */}
              <div className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 text-xs flex items-center gap-1.5">
                    <i className="fa-solid fa-bed text-indigo-600"></i>
                    <span>Layanan Extra Bed:</span>
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    previousHasExtraBed ? 'bg-indigo-100 text-indigo-900 border border-indigo-300' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {previousHasExtraBed ? 'Sebelumnya Menggunakan' : 'Sebelumnya Tidak Ada'}
                  </span>
                </div>
                <p className="text-[10.5px] text-slate-500">
                  Rincian Sebelumnya: <strong className="text-slate-700">{previousExtraBedLabel}</strong>
                </p>
                <label className="flex items-center space-x-2.5 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={extendExtraBed}
                    onChange={e => setExtendExtraBed(e.target.checked)}
                    className="rounded text-hajj-700 focus:ring-hajj-600 h-4 w-4 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-800">
                    Lanjutkan Layanan Extra Bed Selama Masa Extend (+Rp 100.000 / unit / malam)
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* KALKULASI BIAYA TAMBAHAN PERPANJANGAN */}
          <div className="p-3.5 bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-50 border-2 border-emerald-400 rounded-xl space-y-2">
            <div className="flex items-center justify-between border-b border-emerald-200 pb-1.5">
              <span className="font-black text-emerald-950 text-xs flex items-center gap-1.5">
                <i className="fa-solid fa-receipt text-emerald-700"></i>
                <span>Rincian Biaya Tambahan Perpanjangan (Extend):</span>
              </span>
              <span className="text-[10.5px] font-bold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-300">
                +{addedDuration} {isAula ? 'Jam' : 'Malam'}
              </span>
            </div>

            <div className="space-y-1 text-[11px] text-emerald-900">
              <div className="flex justify-between">
                <span>Biaya Sewa Unit ({isGroup && extendEntireGroup ? `${memberTransactions.length} Kamar` : '1 Unit'} × {addedDuration} {isAula ? 'Jam' : 'Malam'}):</span>
                <span className="font-mono font-bold">{formatRupiah(baseRoomRate * addedDuration)}</span>
              </div>
              {extendBreakfast && (
                <div className="flex justify-between text-orange-900">
                  <span>Biaya Sarapan Tambahan:</span>
                  <span className="font-mono font-bold">
                    +{formatRupiah((isGroup && extendEntireGroup ? (groupRecord?.totalPax || 1) : (tx.breakfastPortions || 1)) * 25000 * addedDuration)}
                  </span>
                </div>
              )}
              {extendExtraBed && (
                <div className="flex justify-between text-indigo-900">
                  <span>Biaya Extra Bed Tambahan:</span>
                  <span className="font-mono font-bold">
                    +{formatRupiah((isGroup && extendEntireGroup ? (groupRecord?.extraBedCount || 1) : (tx.extraBedCount || 1)) * (tx.extraBedPrice || 100000) * addedDuration)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-emerald-300 font-bold text-xs text-emerald-950">
                <span>TOTAL BIAYA TAMBAHAN EXTEND:</span>
                <span className="font-mono text-sm font-black text-emerald-800 bg-white px-2.5 py-0.5 rounded-lg border border-emerald-400 shadow-2xs">
                  {formatRupiah(addedCost)}
                </span>
              </div>
              
              <div className="flex justify-between items-center text-[10.5px] text-slate-600 pt-1 border-t border-dashed border-emerald-200">
                <span>Kewajiban Baru Yang Dibayar Saat Ini:</span>
                <span className="font-mono font-black text-xs text-slate-900">
                  {isPreviouslyLunas 
                    ? `${formatRupiah(addedCost)} (Hanya Biaya Extend)`
                    : `${formatRupiah(remainingPreviousBill + addedCost)} (Sisa Lama ${formatRupiah(remainingPreviousBill)} + Extend ${formatRupiah(addedCost)})`}
                </span>
              </div>
            </div>
          </div>

          {/* KETENTUAN DAN KANAL METODE PEMBAYARAN KETIKA EXTEND */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div>
              <label className="block font-black text-slate-800 text-xs">
                Ketentuan Pembayaran Perpanjangan (Extend):
              </label>
              <p className="text-[10.5px] text-slate-500">
                {isPreviouslyLunas
                  ? 'Karena sebelumnya sudah lunas, tamu cukup melanjutkan dengan membayar biaya perpanjangan (extend) saja:'
                  : 'Pilih bagaimana tamu menyelesaikan tagihan biaya tambahan ini:'}
              </p>
            </div>

            {/* 3 Payment Mode Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Option 1: Bayar Lunas Sekarang */}
              <button
                type="button"
                onClick={() => setPaymentMode('LUNAS_SEKARANG')}
                className={`p-2.5 rounded-xl border-2 text-left flex flex-col justify-between transition cursor-pointer ${
                  paymentMode === 'LUNAS_SEKARANG'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs">1. Bayar Lunas Sekarang</span>
                  <i className={`fa-solid ${paymentMode === 'LUNAS_SEKARANG' ? 'fa-circle-check text-emerald-600' : 'fa-circle text-slate-300'}`}></i>
                </div>
                <p className="text-[10px] text-slate-500 leading-snug">
                  {isPreviouslyLunas ? 'Tamu langsung melunasi biaya extend saat ini.' : 'Tamu melunasi seluruh sisa lama + biaya extend.'}
                </p>
                <span className="font-mono font-bold text-emerald-800 text-xs mt-1.5">
                  {formatRupiah(isPreviouslyLunas ? addedCost : (remainingPreviousBill + addedCost))}
                </span>
              </button>

              {/* Option 2: Bayar Nanti Saat Checkout */}
              <button
                type="button"
                onClick={() => setPaymentMode('BAYAR_NANTI')}
                className={`p-2.5 rounded-xl border-2 text-left flex flex-col justify-between transition cursor-pointer ${
                  paymentMode === 'BAYAR_NANTI'
                    ? 'border-amber-500 bg-amber-50 text-amber-950 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs">2. Bayar Saat Check-Out</span>
                  <i className={`fa-solid ${paymentMode === 'BAYAR_NANTI' ? 'fa-circle-check text-amber-600' : 'fa-circle text-slate-300'}`}></i>
                </div>
                <p className="text-[10px] text-slate-500 leading-snug">
                  Ditagihkan pada invoice akhir saat tamu check-out (Piutang).
                </p>
                <span className="font-mono font-bold text-amber-800 text-xs mt-1.5">
                  Ditagihkan Nanti
                </span>
              </button>

              {/* Option 3: Setor DP Tambahan */}
              <button
                type="button"
                onClick={() => setPaymentMode('DP_SEKARANG')}
                className={`p-2.5 rounded-xl border-2 text-left flex flex-col justify-between transition cursor-pointer ${
                  paymentMode === 'DP_SEKARANG'
                    ? 'border-blue-500 bg-blue-50 text-blue-950 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs">3. DP Tambahan</span>
                  <i className={`fa-solid ${paymentMode === 'DP_SEKARANG' ? 'fa-circle-check text-blue-600' : 'fa-circle text-slate-300'}`}></i>
                </div>
                <p className="text-[10px] text-slate-500 leading-snug">
                  Setor uang muka sebagian sekarang, sisanya saat check-out.
                </p>
                <span className="font-mono font-bold text-blue-800 text-xs mt-1.5">
                  Nominal Sebagian
                </span>
              </button>
            </div>

            {/* DETAIL INPUT KANAL & METODE PEMBAYARAN (SEPERTI DI AWAL, DAPAT ISI NOMOR VA & REKENING SENDIRI) */}
            {paymentMode !== 'BAYAR_NANTI' && (
              <div className="p-3.5 bg-slate-50 border border-slate-300 rounded-xl space-y-3 animate-in fade-in duration-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                      Kanal / Metode Penyetoran:
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as any)}
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-bold text-xs focus:ring-2 focus:ring-hajj-600 outline-none"
                    >
                      <option value="VA_UPT">Virtual Account UPT (VA Bank Mandiri)</option>
                      <option value="TRANSFER">Transfer Bank Langsung</option>
                      <option value="CASH">Tunai / Kasir UPT</option>
                      <option value="QRIS">QRIS Standar Resmi</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                      {paymentMode === 'DP_SEKARANG' ? 'Nominal DP yang Disetor:' : 'Nominal yang Dilunasi:'}
                    </label>
                    {paymentMode === 'DP_SEKARANG' ? (
                      <div className="relative">
                        <span className="absolute left-2.5 top-2 font-bold text-slate-400">Rp</span>
                        <input
                          type="text"
                          value={customPayAmount ? Number(customPayAmount.replace(/\D/g, '')).toLocaleString('id-ID') : (Math.round(addedCost * 0.3)).toLocaleString('id-ID')}
                          onChange={(e) => setCustomPayAmount(e.target.value.replace(/\D/g, ''))}
                          className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900 text-xs focus:ring-2 focus:ring-hajj-600 outline-none"
                        />
                      </div>
                    ) : (
                      <input
                        type="text"
                        readOnly
                        value={formatRupiah(isPreviouslyLunas ? addedCost : (remainingPreviousBill + addedCost))}
                        className="w-full px-2.5 py-1.5 bg-slate-100 border border-slate-300 rounded-lg font-mono font-bold text-emerald-800 text-xs cursor-not-allowed"
                      />
                    )}
                  </div>
                </div>

                {/* KANAL VA: INPUT NOMOR VA & NAMA AKUN SENDIRI */}
                {paymentMethod === 'VA_UPT' && (
                  <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-2">
                    <span className="font-bold text-slate-800 text-[11px] block">
                      Rincian Akun Virtual Account (Dapat Diedit / Disesuaikan):
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-500 block mb-0.5">Nomor Virtual Account:</span>
                        <input
                          type="text"
                          value={customVaNumber}
                          onChange={e => setCustomVaNumber(e.target.value)}
                          placeholder="Contoh: 887120812345678"
                          className="w-full p-1.5 bg-slate-50 border border-slate-300 rounded font-mono font-bold text-slate-900 text-xs focus:bg-white focus:ring-2 focus:ring-hajj-600 outline-none"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block mb-0.5">Atas Nama Rekening VA:</span>
                        <input
                          type="text"
                          value={customVaAccountName}
                          onChange={e => setCustomVaAccountName(e.target.value)}
                          placeholder="UPT ASRAMA HAJI JAKARTA"
                          className="w-full p-1.5 bg-slate-50 border border-slate-300 rounded font-bold text-slate-900 text-xs focus:bg-white focus:ring-2 focus:ring-hajj-600 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* KANAL TRANSFER BANK: INPUT PILIHAN BANK, NOMOR REKENING & ATAS NAMA SENDIRI */}
                {paymentMethod === 'TRANSFER' && (
                  <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-2">
                    <span className="font-bold text-slate-800 text-[11px] block">
                      Rincian Rekening Bank Transfer (Dapat Diedit / Disesuaikan):
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-500 block mb-0.5">Pilih Bank:</span>
                        <select
                          value={paymentBank}
                          onChange={(e) => setPaymentBank(e.target.value)}
                          className="w-full p-1.5 bg-slate-50 border border-slate-300 rounded font-bold text-slate-900 text-xs focus:bg-white focus:ring-2 focus:ring-hajj-600 outline-none"
                        >
                          {INDONESIAN_BANKS.map(b => (
                            <option key={b} value={b}>{b}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block mb-0.5">Nomor Rekening:</span>
                        <input
                          type="text"
                          value={customBankAccountNumber}
                          onChange={e => setCustomBankAccountNumber(e.target.value)}
                          placeholder="Contoh: 123-00-9876543-2"
                          className="w-full p-1.5 bg-slate-50 border border-slate-300 rounded font-mono font-bold text-slate-900 text-xs focus:bg-white focus:ring-2 focus:ring-hajj-600 outline-none"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block mb-0.5">Atas Nama Rekening:</span>
                        <input
                          type="text"
                          value={customBankAccountName}
                          onChange={e => setCustomBankAccountName(e.target.value)}
                          placeholder="UPT ASRAMA HAJI JAKARTA"
                          className="w-full p-1.5 bg-slate-50 border border-slate-300 rounded font-bold text-slate-900 text-xs focus:bg-white focus:ring-2 focus:ring-hajj-600 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-slate-500 italic">
                  {paymentMode === 'LUNAS_SEKARANG'
                    ? 'Pembayaran akan langsung tercatat sebagai realisasi kas masuk. Transaksi berstatus LUNAS dan kwitansi pelunasan resmi dapat langsung dicetak.'
                    : 'Uang muka akan dicatat pada faktur invoice dan sisa kekurangan bayar ditagihkan saat check-out.'}
                </p>
              </div>
            )}

            {paymentMode === 'BAYAR_NANTI' && (
              <div className="p-3 bg-amber-50/80 border border-amber-300 rounded-xl text-amber-900 text-[11px] space-y-1">
                <div className="font-bold flex items-center space-x-1.5">
                  <i className="fa-solid fa-clock text-amber-700"></i>
                  <span>Pembayaran Ditagihkan Saat Check-Out (Piutang)</span>
                </div>
                <p>
                  Biaya tambahan perpanjangan sebesar <strong>{formatRupiah(addedCost)}</strong> akan dicatat pada faktur tagihan invoice sebagai piutang yang menunggu pelunasan. Resepsionis dapat membuka lembar Invoice & Kwitansi untuk mencatat pelunasan saat tamu check-out.
                </p>
              </div>
            )}
          </div>

          {/* Alasan / Catatan */}
          <div>
            <label className="block font-bold text-slate-800 mb-1">Catatan / Alasan Extend & Pembayaran</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              placeholder="Contoh: Tamu memperpanjang menginap untuk rombongan dinas..."
              className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-hajj-600 text-xs"
            ></textarea>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={handleDismiss}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition flex items-center space-x-1.5 cursor-pointer"
            >
              <i className="fa-solid fa-arrow-left text-slate-500 text-[11px]"></i>
              <span>{targetRoomId ? 'Kembali' : 'Batal'}</span>
            </button>

            <button
              type="submit"
              disabled={hasConflict || addedDuration <= 0}
              className={`px-5 py-2 font-bold rounded-lg shadow-xs text-xs transition flex items-center space-x-1.5 cursor-pointer ${
                hasConflict || addedDuration <= 0
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-hajj-700 hover:bg-hajj-800 text-white'
              }`}
            >
              <i className="fa-solid fa-clock-rotate-left text-gold-300"></i>
              <span>
                {hasConflict 
                  ? 'Tidak Dapat Extend (Jadwal Bentrok)' 
                  : `Konfirmasi Extend (+${addedDuration} ${isAula ? 'Jam' : 'Malam'})`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
