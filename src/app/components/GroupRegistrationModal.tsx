import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../store';
import { GroupType, Transaction, Room } from '../types';
import { initialMeetingRooms, INDONESIAN_BANKS, OFFICIAL_VA_CONFIG, findRoomRate } from '../data';
import { getRealTodayDate, formatIndonesianDate, addDaysToDateStr, checkMeetingRoomAvailability, formatRupiah, isMeetingFacility } from '../lib/utils';
import { useBodyScrollLock } from '../lib/scrollLock';

interface GroupRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultGroupType?: GroupType;
  initialGroupName?: string;
  initialPicName?: string;
  initialPicPhone?: string;
  initialMembers?: number;
  isEdit?: boolean;
  editGroupId?: string;
  initialStartDate?: string;
  initialDuration?: number;
  initialRoomIds?: string[];
  initialAgencyOrDocument?: string;
  initialCateringPackage?: 'SARAPAN' | 'FULLBOARD' | 'SNACK_AULA' | 'TIDAK';
  initialIncludeBreakfast?: boolean;
  initialBreakfastPortions?: number;
  initialIncludeAula?: boolean;
  initialMeetingRoomId?: string;
  initialMeetingRoomSession?: string;
  initialMeetingRoomDays?: number;
  initialStatusMode?: 'TERISI' | 'BOOKED';
}

export function GroupRegistrationModal({ 
  isOpen, 
  onClose, 
  defaultGroupType = 'INSTANSI',
  initialGroupName = '',
  initialPicName = '',
  initialPicPhone = '',
  initialMembers = 0,
  isEdit = false,
  editGroupId,
  initialStartDate,
  initialDuration,
  initialRoomIds = [],
  initialAgencyOrDocument = '',
  initialCateringPackage = 'TIDAK',
  initialIncludeBreakfast = false,
  initialBreakfastPortions = 0,
  initialIncludeAula = false,
  initialMeetingRoomId = '',
  initialMeetingRoomSession = 'Reguler 8 Jam',
  initialMeetingRoomDays = 1,
  initialStatusMode = 'TERISI'
}: GroupRegistrationModalProps) {
  const { rooms, meetingRooms = [], buildings = [], currentUser, addGroupBooking, updateGroupBooking, showToast, breakfastMenuItems = [], transactions, openModal, roomCapacityRates = [] } = useAppContext();

  useBodyScrollLock(isOpen);

  const [groupType, setGroupType] = useState<GroupType>(defaultGroupType);
  const [groupName, setGroupName] = useState(initialGroupName);
  const [picName, setPicName] = useState(initialPicName);
  const [picPhone, setPicPhone] = useState(initialPicPhone);
  const [agencyOrDocument, setAgencyOrDocument] = useState('');
  const [estimatedMembers, setEstimatedMembers] = useState<number>(initialMembers || 0);
  const [startDate, setStartDate] = useState(getRealTodayDate());
  const [duration, setDuration] = useState<number>(initialDuration || 1);
  const [statusMode, setStatusMode] = useState<'TERISI' | 'BOOKED'>('TERISI');

  // Payment state
  const [payStatus, setPayStatus] = useState<'BELUM_LUNAS' | 'DP' | 'LUNAS'>('BELUM_LUNAS');
  const [payMethod, setPayMethod] = useState<'VA_UPT' | 'TRANSFER' | 'CASH'>('VA_UPT');
  const [payBank, setPayBank] = useState('Bank Mandiri');
  const [customBank, setCustomBank] = useState('');
  const [payDpAmount, setPayDpAmount] = useState<number>(0);
  const [payDate, setPayDate] = useState(getRealTodayDate());
  const [payVaNumber, setPayVaNumber] = useState(OFFICIAL_VA_CONFIG.vaNumber);
  const [payVaName, setPayVaName] = useState(OFFICIAL_VA_CONFIG.accountName);
  const [payBankAccountNumber, setPayBankAccountNumber] = useState(OFFICIAL_VA_CONFIG.vaNumber);
  const [payNote, setPayNote] = useState('');

  useEffect(() => {
    if (isOpen) {
      setGroupType(defaultGroupType);
      setGroupName(initialGroupName || '');
      setPicName(initialPicName || '');
      setPicPhone(initialPicPhone || '');
      setAgencyOrDocument(initialAgencyOrDocument || (defaultGroupType === 'JEMAAH_HAJI' ? 'JKG-' : ''));
      setEstimatedMembers(initialMembers || 0);
      setStartDate(initialStartDate || getRealTodayDate());
      setDuration(initialDuration || 1);
      setSelectedRoomIds(initialRoomIds || []);
      setCateringPackage(initialCateringPackage || 'TIDAK');
      setIncludeBreakfast(initialIncludeBreakfast || false);
      setBreakfastPortions(initialBreakfastPortions || 0);
      setIncludeAula(initialIncludeAula || false);
      setSelectedMeetingRoomId(initialMeetingRoomId || '');
      setMeetingRoomSession(initialMeetingRoomSession || 'Reguler 8 Jam');
      setMeetingRoomDays(initialMeetingRoomDays || 1);
      setStatusMode(initialStatusMode || 'TERISI');
    }
  }, [isOpen, editGroupId]);

  // Facilities allocation
  const [selectedBuildingFilter, setSelectedBuildingFilter] = useState<string>('ALL');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
  const [selectedBedFilter, setSelectedBedFilter] = useState<string>('ALL');
  const [roomSearchFilter, setRoomSearchFilter] = useState('');
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);

  // Additional services & Packs
  const [cateringPackage, setCateringPackage] = useState<'SARAPAN' | 'FULLBOARD' | 'SNACK_AULA' | 'TIDAK'>('TIDAK');
  const [includeBreakfast, setIncludeBreakfast] = useState(false);
  const [breakfastMenu, setBreakfastMenu] = useState('Nasi Goreng Spesial & Telur Ceplok');
  const [breakfastPortions, setBreakfastPortions] = useState<number>(0);
  const [includeAula, setIncludeAula] = useState(false);
  const [selectedMeetingRoomId, setSelectedMeetingRoomId] = useState<string>('');
  const [meetingRoomSession, setMeetingRoomSession] = useState<string>('Reguler 8 Jam');
  const [meetingRoomDuration, setMeetingRoomDuration] = useState<number>(8);
  const [meetingRoomDays, setMeetingRoomDays] = useState<number>(1);
  const [meetingRoomPurpose, setMeetingRoomPurpose] = useState<string>('Koordinasi & Pertemuan Rombongan');
  const [includeExtraBed, setIncludeExtraBed] = useState(false);
  const [extraBedCount, setExtraBedCount] = useState<number>(1);
  const [extraBedPrice, setExtraBedPrice] = useState<number>(100000);
  const [notes, setNotes] = useState('');

  // Pastikan data Ruang Pertemuan (Aula) & Gedung Serbaguna (SG) selalu lengkap dari master meetingRooms & rooms
  const availableMeetingRooms = useMemo(() => {
    const masterList = (meetingRooms && meetingRooms.length > 0) ? meetingRooms : initialMeetingRooms;
    return masterList.map(mr => {
      // Cek apakah ada booking aktif pada tanggal mulai yang dipilih
      const isBooked = transactions.some(t => {
        const isSame = (t.roomId === mr.id || t.roomNumber === mr.name || t.rentAulaId === mr.id || t.rentAulaName === mr.name);
        const isActive = t.status === 'TERISI' || t.status === 'BOOKED';
        const isCurrentTx = editGroupId && (t.groupId === editGroupId || t.id === editGroupId);
        return isSame && isActive && !isCurrentTx;
      });

      const isSG = mr.category === 'SERBAGUNA' || 
                   mr.building?.toLowerCase().includes('serbaguna') || 
                   mr.name?.toLowerCase().includes('serbaguna') ||
                   (mr.code && mr.code.toLowerCase().startsWith('sg'));

      return {
        id: mr.id,
        name: mr.name,
        roomNumber: mr.name,
        building: mr.building || (isSG ? 'Gedung Serbaguna (SG)' : 'Ruang Pertemuan'),
        type: isSG ? 'Gedung Serbaguna (SG)' : 'Ruang Pertemuan / Aula',
        category: mr.category || (isSG ? 'SERBAGUNA' : 'AULA'),
        capacity: mr.capacity,
        ratePerSession: mr.sessionRate,
        sessionRate: mr.sessionRate,
        dailyRate: mr.dailyRate,
        facilities: mr.facilities || ['AC Central', 'Sound System & Mic Wireless', 'Screen & LCD Proyektor', 'Podium'],
        status: mr.status === 'MAINTENANCE' ? 'MAINTENANCE' : (isBooked ? 'TERPAKAI' : 'TERSEDIA'),
        qcStatus: mr.qcStatus || 'LOLOS_QC'
      };
    });
  }, [meetingRooms, transactions, editGroupId, startDate]);

  const priceBreakdown = useMemo(() => {
    const selectedMeetingObj = (includeAula && selectedMeetingRoomId)
      ? (availableMeetingRooms.find(m => m.id === selectedMeetingRoomId) || rooms.find(r => r.id === selectedMeetingRoomId || r.roomNumber === selectedMeetingRoomId) || null)
      : null;

    const roomsTotal = selectedRoomIds.reduce((sum, rId) => {
      const rObj = rooms.find(r => r.id === rId);
      const matchedRate = findRoomRate(rObj?.type, rObj?.bedType, roomCapacityRates);
      const rate = rObj?.pricePerNight || matchedRate?.pricePerNight || 480000;
      return sum + (rate * Math.max(1, duration));
    }, 0);

    const meetingRatePerDay = meetingRoomDuration === 12 
      ? ((selectedMeetingObj as any)?.dailyRate || 15000000) 
      : ((selectedMeetingObj as any)?.sessionRate || (selectedMeetingObj as any)?.ratePerSession || 8500000);
    const meetingTotal = (includeAula && selectedMeetingObj)
      ? meetingRatePerDay * Math.max(1, meetingRoomDays)
      : 0;

    const matchedMenuItem = breakfastMenuItems.find(m => m.name === breakfastMenu);
    let catRate = matchedMenuItem?.price;
    if (!catRate) {
      if (cateringPackage === 'FULLBOARD') catRate = 120000;
      else if (cateringPackage === 'SNACK_AULA') catRate = 25000;
      else catRate = 25000;
    }
    const cateringTotal = (cateringPackage !== 'TIDAK' && breakfastPortions > 0)
      ? breakfastPortions * Math.max(1, duration) * catRate
      : 0;

    const extraBedTotal = includeExtraBed ? extraBedCount * Math.max(1, duration) * (extraBedPrice || 100000) : 0;
    const grandTotal = roomsTotal + meetingTotal + cateringTotal + extraBedTotal;

    return {
      selectedMeetingObj,
      roomsTotal,
      meetingTotal,
      meetingRatePerDay,
      cateringTotal,
      extraBedTotal,
      grandTotal,
      catRate
    };
  }, [selectedRoomIds, rooms, roomCapacityRates, duration, includeAula, selectedMeetingRoomId, availableMeetingRooms, meetingRoomDays, meetingRoomDuration, cateringPackage, breakfastMenu, breakfastMenuItems, breakfastPortions, includeExtraBed, extraBedCount, extraBedPrice]);

  const groupGrandTotal = priceBreakdown.grandTotal;

  const isMeetingBuilding = (name?: string) => {
    if (!name) return false;
    return name === 'Ruang Pertemuan' || 
           name === 'Gedung Serbaguna (SG)' || 
           name === 'Gedung Serbaguna' || 
           isMeetingFacility(name);
  };

  const buildingFilterOptions = useMemo(() => {
    const list = [{ id: 'ALL', label: 'Semua Gedung' }];
    const seen = new Set<string>();
    (buildings || []).forEach(b => {
      if (!isMeetingBuilding(b.name) && b.category !== 'SERBAGUNA' && b.category !== 'RUANG_PERTEMUAN' && !seen.has(b.name)) {
        seen.add(b.name);
        list.push({ id: b.name, label: b.name });
      }
    });
    rooms.forEach(r => {
      if (r.building && !isMeetingBuilding(r.building) && !r.type?.toLowerCase().includes('serbaguna') && !r.type?.toLowerCase().includes('aula') && !seen.has(r.building)) {
        seen.add(r.building);
        list.push({ id: r.building, label: r.building });
      }
    });
    if (list.length === 1) {
      list.push(
        { id: 'Gedung A', label: 'Gedung A (Arafah)' },
        { id: 'Gedung B', label: 'Gedung B (Mina)' },
        { id: 'Gedung C', label: 'Gedung C (Muzdalifah)' },
        { id: 'Gedung D', label: 'Gedung D (Madinah)' },
      );
    }
    return list;
  }, [buildings, rooms]);

  if (!isOpen) return null;

  // Filter available lodging rooms (only empty and verified LOLOS QC, strictly exclude meeting & serbaguna facilities)
  const emptyRooms = rooms.filter(r => 
    !isMeetingBuilding(r.building) && 
    !isMeetingFacility(r.roomNumber) &&
    !r.type?.toLowerCase().includes('aula') &&
    !r.type?.toLowerCase().includes('pertemuan') &&
    !r.type?.toLowerCase().includes('serbaguna') &&
    r.status === 'KOSONG' && 
    (r.qcStatus === 'LOLOS_QC' || !r.qcStatus)
  );
  const emptyMeetingRooms = availableMeetingRooms;

  const filteredAvailableRooms = emptyRooms.filter(r => {
    if (roomSearchFilter.trim()) {
      const q = roomSearchFilter.trim().toLowerCase();
      const matchNum = r.roomNumber.toLowerCase().includes(q);
      const matchBld = r.building.toLowerCase().includes(q);
      const matchType = (r.type || '').toLowerCase().includes(q);
      if (!matchNum && !matchBld && !matchType) return false;
    }
    if (selectedBuildingFilter !== 'ALL') {
      const matchBuilding = r.building.toLowerCase().includes(selectedBuildingFilter.toLowerCase()) || 
                            selectedBuildingFilter.toLowerCase().includes(r.building.toLowerCase());
      if (!matchBuilding) return false;
    }
    if (selectedTypeFilter !== 'ALL' && r.type !== selectedTypeFilter) {
      return false;
    }
    if (selectedBedFilter !== 'ALL' && r.bedType !== selectedBedFilter) {
      return false;
    }
    return true;
  });

  const toggleRoomSelection = (roomId: string) => {
    setSelectedRoomIds(prev => 
      prev.includes(roomId) ? prev.filter(id => id !== roomId) : [...prev, roomId]
    );
  };

  const handleSelectAllInBuilding = () => {
    const idsInFilter = filteredAvailableRooms.map(r => r.id);
    const allSelected = idsInFilter.every(id => selectedRoomIds.includes(id));
    if (allSelected) {
      setSelectedRoomIds(prev => prev.filter(id => !idsInFilter.includes(id)));
    } else {
      setSelectedRoomIds(prev => Array.from(new Set([...prev, ...idsInFilter])));
    }
  };

  const handleQuickAutoSelect = (count: number) => {
    const toPick = filteredAvailableRooms.slice(0, count).map(r => r.id);
    setSelectedRoomIds(toPick);
    if (estimatedMembers === 0) {
      setEstimatedMembers(toPick.length * 4);
    }
  };

  const calculateTotalBeds = () => {
    const selected = rooms.filter(r => selectedRoomIds.includes(r.id));
    return selected.reduce((sum, r) => {
      const cap = r.capacityNumber || parseInt(String(r.capacity).replace(/\D/g, '')) || 4;
      return sum + cap;
    }, 0);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!groupName.trim()) {
      showToast('Mohon isi nama rombongan atau instansi!', 'warning');
      return;
    }

    if (!picName.trim()) {
      showToast('Mohon isi nama PIC / Koordinator rombongan!', 'warning');
      return;
    }

    if (selectedRoomIds.length === 0 && !selectedMeetingRoomId) {
      showToast('Mohon pilih minimal 1 kamar atau 1 ruang pertemuan untuk rombongan!', 'warning');
      return;
    }

    const groupId = isEdit && editGroupId ? editGroupId : `GRP-${Date.now().toString().slice(-5)}`;
    const newTransactions: Transaction[] = [];

    const selectedRooms = rooms.filter(r => selectedRoomIds.includes(r.id));
    const allocatedRoomNumbers = selectedRooms.map(r => r.roomNumber);
    const meetingObj = (includeAula && selectedMeetingRoomId)
      ? (availableMeetingRooms.find(m => m.id === selectedMeetingRoomId) || rooms.find(r => r.id === selectedMeetingRoomId || r.roomNumber === selectedMeetingRoomId) || null)
      : null;

    if (includeAula && meetingObj) {
      const aulaDurationVal = meetingRoomDays > 1 ? meetingRoomDays : meetingRoomDuration;
      const aulaDurationUnit = meetingRoomDays > 1 ? 'Hari' : (meetingRoomDuration >= 24 ? 'Hari' : 'Jam');
      const checkAula = checkMeetingRoomAvailability(
        meetingObj.id,
        startDate,
        aulaDurationVal,
        transactions,
        undefined,
        aulaDurationUnit
      );
      if (!checkAula.isValid) {
        showToast(checkAula.message || 'Ruang pertemuan tidak tersedia pada rentang tanggal tersebut.', 'error');
        return;
      }
    }

    const hasActiveCatering = cateringPackage !== 'TIDAK' && breakfastPortions > 0;
    const finalPaidAmount = payStatus === 'LUNAS' ? groupGrandTotal : (payStatus === 'DP' ? payDpAmount : 0);
    const paymentFields = {
      paymentStatus: payStatus,
      paidAmount: finalPaidAmount,
      dpAmount: payStatus === 'DP' ? payDpAmount : undefined,
      dpDate: payStatus === 'DP' ? payDate : undefined,
      dpMethod: payStatus === 'DP' ? payMethod : undefined,
      paymentDate: payStatus === 'LUNAS' ? payDate : (payStatus === 'DP' ? payDate : undefined),
      paymentMethod: payMethod,
      bankName: payMethod === 'TRANSFER' ? (payBank === 'Bank Lainnya' ? customBank : payBank) : undefined,
      vaNumber: payVaNumber.trim() || OFFICIAL_VA_CONFIG.vaNumber,
      vaAccountName: payVaName.trim() || OFFICIAL_VA_CONFIG.accountName,
      bankAccountNumber: payBankAccountNumber.trim() || payVaNumber.trim() || OFFICIAL_VA_CONFIG.vaNumber,
      paymentNote: payNote,
    };

    // Create transactions for each room
    selectedRoomIds.forEach((rId, idx) => {
      const roomObj = rooms.find(r => r.id === rId);
      if (!roomObj) return;

      const matchedRate = findRoomRate(roomObj.type, roomObj.bedType, roomCapacityRates);
      const roomPrice = roomObj.pricePerNight || matchedRate?.pricePerNight || 480000;

      const txId = `TRX-${Date.now().toString().slice(-4)}${idx + 1}`;
      newTransactions.push({
        id: txId,
        createdAt: new Date().toISOString(),
        roomId: roomObj.id,
        building: roomObj.building,
        roomNumber: roomObj.roomNumber,
        category: groupType === 'JEMAAH_HAJI' ? 'JEMAAH' : 'UMUM',
        guestType: 'ROMBONGAN',
        isGroup: true,
        guestName: groupName,
        kloter: groupType === 'JEMAAH_HAJI' ? (agencyOrDocument || 'Haji') : (agencyOrDocument || '-'),
        startDate,
        duration,
        durationUnit: duration === 0 ? 'Hari' : 'Malam',
        rentType: 'Per Kamar',
        pricePerNight: roomPrice,
        phone: picPhone,
        notes: `[Rombongan: ${groupName}] PIC: ${picName} (${picPhone}). ${notes ? 'Catatan: ' + notes : ''}`,
        status: statusMode,
        createdUser: currentUser?.username || 'admin',
        groupType,
        groupName,
        groupPic: picName,
        groupPicPhone: picPhone,
        groupId,
        totalPax: estimatedMembers,
        includeAula: includeAula && !!meetingObj,
        rentAulaId: meetingObj ? meetingObj.id : undefined,
        rentAulaName: meetingObj ? meetingObj.roomNumber : undefined,
        rentAulaDuration: meetingObj ? meetingRoomDuration : undefined,
        rentAulaDurationDays: meetingObj ? meetingRoomDays : undefined,
        rentAulaSession: meetingObj ? meetingRoomSession : undefined,
        cateringPackage: cateringPackage,
        cateringPaxCount: breakfastPortions,
        spkNumber: agencyOrDocument,
        allocatedRoomNumbers,
        allocatedRoomsCount: selectedRoomIds.length,
        breakfast: hasActiveCatering,
        breakfastMenu: hasActiveCatering ? breakfastMenu : undefined,
        breakfastPortions: hasActiveCatering ? Math.max(1, Math.round(breakfastPortions / Math.max(1, selectedRoomIds.length))) : 0,
        breakfastDays: hasActiveCatering ? Math.max(1, duration) : undefined,
        breakfastStatus: hasActiveCatering ? 'MENUNGGU' : undefined,
        extraBed: includeExtraBed,
        extraBedCount: includeExtraBed ? Math.ceil(extraBedCount / Math.max(1, selectedRoomIds.length)) : undefined,
        extraBedPrice: includeExtraBed ? extraBedPrice : undefined,
        remainingAmount: Math.max(0, groupGrandTotal - finalPaidAmount),
        ...paymentFields,
      });
    });

    // If meeting room or Gedung Serbaguna is selected as well
    if (includeAula && meetingObj) {
      const isSGMeeting = meetingObj.building?.toLowerCase().includes('serbaguna') || 
                          meetingObj.name?.toLowerCase().includes('serbaguna') || 
                          (meetingObj as any).category === 'SERBAGUNA';
      const meetingRatePerDay = meetingRoomDuration === 12
        ? ((meetingObj as any).dailyRate || 15000000)
        : ((meetingObj as any).sessionRate || (meetingObj as any).dailyRate || 8500000);
      const meetingPrice = meetingRatePerDay * Math.max(1, meetingRoomDays);
      const meetingTxId = `TRX-AULA-${Date.now().toString().slice(-4)}`;
      newTransactions.push({
        id: meetingTxId,
        createdAt: new Date().toISOString(),
        roomId: meetingObj.id,
        building: meetingObj.building,
        roomNumber: meetingObj.roomNumber,
        category: 'UMUM',
        guestType: 'ROMBONGAN',
        isGroup: true,
        guestName: `${groupName} (${isSGMeeting ? 'Sewa Gedung Serbaguna' : 'Sewa Ruang Pertemuan / Aula'})`,
        kloter: agencyOrDocument || '-',
        startDate,
        duration: meetingRoomDays > 1 ? meetingRoomDays : meetingRoomDuration,
        durationUnit: meetingRoomDays > 1 ? 'Hari' : (meetingRoomDuration >= 24 ? 'Hari' : 'Jam'),
        rentType: isSGMeeting ? 'Sewa Gedung Serbaguna' : 'Sewa Ruang Pertemuan / Aula',
        pricePerNight: meetingPrice,
        phone: picPhone,
        notes: `[Sewa ${isSGMeeting ? 'Gedung Serbaguna' : 'Aula'} Rombongan: ${groupName}] Sesi: ${meetingRoomSession}, Durasi: ${meetingRoomDays} Hari (${meetingRoomDuration} Jam). Keperluan: ${meetingRoomPurpose}. PIC: ${picName}. ${notes}`,
        status: statusMode,
        createdUser: currentUser?.username || 'admin',
        groupType,
        groupName,
        groupPic: picName,
        groupPicPhone: picPhone,
        groupId,
        totalPax: estimatedMembers,
        includeAula: true,
        rentAulaId: meetingObj.id,
        rentAulaName: meetingObj.roomNumber,
        rentAulaDuration: meetingRoomDuration,
        rentAulaDurationDays: meetingRoomDays,
        rentAulaSession: meetingRoomSession,
        cateringPackage: cateringPackage,
        cateringPaxCount: breakfastPortions,
        spkNumber: agencyOrDocument,
        allocatedRoomNumbers: selectedRoomIds.length > 0 ? allocatedRoomNumbers : [meetingObj.roomNumber],
        allocatedRoomsCount: selectedRoomIds.length > 0 ? selectedRoomIds.length : 1,
        ...paymentFields,
      });
    }

    if (isEdit && editGroupId) {
      updateGroupBooking(editGroupId, newTransactions, groupName);
    } else {
      addGroupBooking(newTransactions, groupName);
    }
    onClose();

    if (newTransactions.length > 0) {
      const repTx = newTransactions[0];
      const grpKey = `grp-${repTx.groupId || repTx.id}`;
      const grpRecord = {
        id: repTx.groupId,
        key: grpKey,
        name: groupName,
        pic: picName,
        phone: picPhone,
        groupType,
        roomNumbers: allocatedRoomNumbers,
        roomIds: selectedRoomIds,
        representativeTx: repTx,
        transactions: newTransactions
      };

      if (payStatus === 'LUNAS') {
        openModal('modalKwitansi', {
          transaction: repTx,
          groupKey: grpKey,
          groupRecord: grpRecord
        });
      } else {
        openModal('modalInvoice', {
          transaction: repTx,
          groupKey: grpKey,
          groupRecord: grpRecord
        });
      }
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[94vh] my-auto animate-in fade-in zoom-in duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-hajj-900 via-hajj-800 to-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0 border-b border-gold-500/30">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gold-500 text-slate-950 flex items-center justify-center text-lg font-black shadow-md border border-gold-400">
              <i className="fa-solid fa-users-rectangle"></i>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base tracking-wide text-white">
                  {isEdit ? 'Sesuaikan Data Rombongan' : 'Pendaftaran Data Rombongan Baru'}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-gold-400 text-slate-950">
                  Kolektif
                </span>
              </div>
              <p className="text-xs text-gold-200">
                Registrasi pemesanan untuk Jemaah Haji, Instansi/Kementerian, atau Tamu Umum Rombongan
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-white/70 hover:text-white text-lg p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 text-xs overflow-y-auto flex-1 custom-scrollbar bg-slate-50/50">
          
          {/* 1. Pilih Tipe Rombongan */}
          <div>
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
              1. Pilih Kategori Rombongan <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Option: Jemaah Haji / Umrah */}
              <div
                onClick={() => {
                  setGroupType('JEMAAH_HAJI');
                  if (!agencyOrDocument) setAgencyOrDocument('JKG-');
                }}
                className={`p-3.5 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                  groupType === 'JEMAAH_HAJI'
                    ? 'border-emerald-600 bg-emerald-50/80 ring-2 ring-emerald-500/20 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center space-x-2.5 mb-1.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                    groupType === 'JEMAAH_HAJI' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    <i className="fa-solid fa-kaaba"></i>
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-900">Jemaah Haji / Umrah</h4>
                    <span className="text-[10px] text-slate-500">Kloter, KBIHU, Biro Travel</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-600 line-clamp-2">
                  Alokasi rombongan transit embarkasi, kepulangan jemaah haji, atau pembinaan manasik.
                </p>
              </div>

              {/* Option: Instansi / Kementerian / Lembaga */}
              <div
                onClick={() => setGroupType('INSTANSI')}
                className={`p-3.5 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                  groupType === 'INSTANSI'
                    ? 'border-blue-600 bg-blue-50/80 ring-2 ring-blue-500/20 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center space-x-2.5 mb-1.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                    groupType === 'INSTANSI' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    <i className="fa-solid fa-building-columns"></i>
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-900">Instansi / Lembaga</h4>
                    <span className="text-[10px] text-slate-500">Kementerian, BUMN, Pemda</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-600 line-clamp-2">
                  Kegiatan kedinasan, diklat kementerian, rapat kerja lembaga, atau seminar instansi.
                </p>
              </div>

              {/* Option: Tamu Umum Rombongan */}
              <div
                onClick={() => setGroupType('UMUM')}
                className={`p-3.5 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                  groupType === 'UMUM'
                    ? 'border-amber-600 bg-amber-50/80 ring-2 ring-amber-500/20 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center space-x-2.5 mb-1.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                    groupType === 'UMUM' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    <i className="fa-solid fa-people-group"></i>
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-900">Tamu Umum Rombongan</h4>
                    <span className="text-[10px] text-slate-500">Keluarga, Majelis, Komunitas</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-600 line-clamp-2">
                  Pemesanan rombongan keluarga besar, wisata religi, reuni alumni, atau ziarah.
                </p>
              </div>
            </div>
          </div>

          {/* 2. Informasi Utama Rombongan */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center space-x-1.5 border-b border-slate-100 pb-2">
              <i className="fa-solid fa-id-card text-hajj-700"></i>
              <span>2. Informasi Identitas & Penanggung Jawab Rombongan</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nama Rombongan / Nama Instansi <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder={
                    groupType === 'JEMAAH_HAJI' 
                      ? 'Contoh: KBIHU Al-Mabruur Kloter JKG-04' 
                      : groupType === 'INSTANSI'
                      ? 'Contoh: Pusdiklat Balai Litbang Kemenag RI'
                      : 'Contoh: Rombongan Keluarga Besar H. Abdullah'
                  }
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-hajj-600 focus:bg-white outline-none font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nama PIC / Ketua Rombongan / Kontak <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={picName}
                  onChange={(e) => setPicName(e.target.value)}
                  placeholder="Contoh: Drs. H. Ahmad Fauzi, M.Pd"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-hajj-600 focus:bg-white outline-none font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nomor HP / WhatsApp PIC <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="tel" 
                  value={picPhone}
                  onChange={(e) => setPicPhone(e.target.value)}
                  placeholder="Contoh: 0812-3456-7890"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-hajj-600 focus:bg-white outline-none font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {groupType === 'JEMAAH_HAJI' ? 'No. Kloter / Kode Rombongan' : 'No. Surat Tugas / Dokumen Resmi (Opsional)'}
                </label>
                <input 
                  type="text" 
                  value={agencyOrDocument}
                  onChange={(e) => setAgencyOrDocument(e.target.value)}
                  placeholder={groupType === 'JEMAAH_HAJI' ? 'Contoh: JKG-04' : 'Contoh: B-1044/DJ.I/HM.01/05/2026'}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-hajj-600 focus:bg-white outline-none font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Estimasi Jumlah Peserta / Jemaah (Orang)
                </label>
                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const nextVal = Math.max(0, estimatedMembers - (estimatedMembers > 10 ? 5 : 1));
                      setEstimatedMembers(nextVal);
                      if (includeBreakfast && breakfastPortions > 0) setBreakfastPortions(nextVal);
                    }}
                    className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-black text-sm flex items-center justify-center transition cursor-pointer shrink-0 shadow-2xs"
                    title="Kurangi 1 atau 5 orang"
                  >
                    -
                  </button>
                  <div className="relative flex-1">
                    <input 
                      type="number" 
                      min={0}
                      value={estimatedMembers}
                      onChange={(e) => {
                        const val = Math.max(0, parseInt(e.target.value) || 0);
                        setEstimatedMembers(val);
                        if (includeBreakfast && breakfastPortions > 0) setBreakfastPortions(val);
                      }}
                      onFocus={(e) => e.target.select()}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-hajj-600 focus:bg-white outline-none font-bold text-center text-sm"
                    />
                    <span className="absolute right-3 top-2 text-slate-400 text-xs pointer-events-none">Orang</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const nextVal = estimatedMembers + (estimatedMembers >= 10 ? 5 : 1);
                      setEstimatedMembers(nextVal);
                      if (includeBreakfast && breakfastPortions > 0) setBreakfastPortions(nextVal);
                    }}
                    className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-black text-sm flex items-center justify-center transition cursor-pointer shrink-0 shadow-2xs"
                    title="Tambah 1 atau 5 orang"
                  >
                    +
                  </button>
                </div>
                {/* Preset Chips */}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {[0, 10, 20, 40, 80, 160].map(cnt => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => {
                        setEstimatedMembers(cnt);
                        if (includeBreakfast && breakfastPortions > 0) setBreakfastPortions(cnt);
                      }}
                      className={`px-2 py-0.5 text-[10px] rounded font-bold border transition cursor-pointer ${
                        estimatedMembers === cnt 
                          ? 'bg-hajj-700 text-white border-hajj-800 shadow-2xs' 
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {cnt === 0 ? '0 Orang' : cnt === 40 ? '40 (1 Bus)' : cnt === 80 ? '80 (2 Bus)' : cnt === 160 ? '160 (Kloter)' : `${cnt} Pax`}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Status Penerimaan Rombongan <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setStatusMode('TERISI')}
                    className={`py-2 px-3 rounded-lg font-bold border text-center cursor-pointer transition ${
                      statusMode === 'TERISI' 
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs' 
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <i className="fa-solid fa-door-open mr-1.5"></i>
                    Langsung Check-In
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusMode('BOOKED')}
                    className={`py-2 px-3 rounded-lg font-bold border text-center cursor-pointer transition ${
                      statusMode === 'BOOKED' 
                        ? 'bg-blue-600 text-white border-blue-700 shadow-xs' 
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <i className="fa-solid fa-calendar-plus mr-1.5"></i>
                    Reservasi / Booking
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Tanggal Masuk (Check-In) <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-hajj-600 focus:bg-white outline-none font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Durasi Menginap (Malam) <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={() => setDuration(prev => Math.max(0, prev - 1))}
                    className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-black text-sm flex items-center justify-center transition cursor-pointer shrink-0 shadow-2xs"
                    title="Kurangi 1 malam"
                  >
                    -
                  </button>
                  <input 
                    type="number" 
                    min={0} 
                    max={60}
                    value={duration}
                    onChange={(e) => setDuration(Math.max(0, parseInt(e.target.value) || 0))}
                    onFocus={(e) => e.target.select()}
                    required
                    className="w-20 px-2 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-hajj-600 focus:bg-white outline-none font-bold text-center text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setDuration(prev => prev + 1)}
                    className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-black text-sm flex items-center justify-center transition cursor-pointer shrink-0 shadow-2xs"
                    title="Tambah 1 malam"
                  >
                    +
                  </button>
                  <span className="text-slate-600 font-medium text-[11px] leading-tight flex-1 ml-1">
                    {duration === 0 
                      ? <strong className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">0 Malam (Transit / Acara 1 Hari)</strong>
                      : <>Malam (Check-Out: <strong>{formatIndonesianDate(addDaysToDateStr(startDate, duration))}</strong>)</>}
                  </span>
                </div>
                {/* Preset Chips */}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {[0, 1, 2, 3, 5, 7].map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDuration(d)}
                      className={`px-2 py-0.5 text-[10px] rounded font-bold border transition cursor-pointer ${
                        duration === d 
                          ? 'bg-hajj-700 text-white border-hajj-800 shadow-2xs' 
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {d === 0 ? '0 Malam (Transit)' : `${d} Malam`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Estimasi Tanggal Check-Out Card */}
              <div className="sm:col-span-2 p-3 bg-gradient-to-r from-emerald-50 via-teal-50/50 to-emerald-50 rounded-xl border border-emerald-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-lg bg-emerald-700 text-white flex items-center justify-center text-sm font-bold shrink-0 shadow-2xs">
                    <i className="fa-solid fa-calendar-check"></i>
                  </div>
                  <div>
                    <div className="text-[10.5px] uppercase tracking-wider font-extrabold text-emerald-900 flex items-center gap-1.5">
                      <span>Perkiraan Rentang Waktu Menginap Rombongan:</span>
                    </div>
                    <div className="text-xs font-bold text-slate-800 flex flex-wrap items-center gap-2 mt-0.5">
                      <span>Check-In: <strong className="text-emerald-800">{formatIndonesianDate(startDate)}</strong></span>
                      <i className="fa-solid fa-arrow-right text-[10px] text-emerald-600"></i>
                      <span>Estimasi Check-Out: <strong className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">{formatIndonesianDate(addDaysToDateStr(startDate, duration))}</strong></span>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-700 text-white shadow-2xs inline-block">
                    {duration === 0 ? 'Transit 1 Hari' : `${duration} Malam Menginap`}
                  </span>
                  <span className="block text-[10px] text-slate-500 mt-0.5 font-medium">Batas Waktu Check-Out: 12.00 WIB</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Alokasi Kamar Rombongan */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
              <div>
                <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                  <i className="fa-solid fa-bed text-emerald-700"></i>
                  <span>3. Alokasi Kamar Rombongan {includeAula && selectedMeetingRoomId && selectedRoomIds.length === 0 ? '(Opsional - Hanya Sewa Fasilitas)' : '(Opsional jika hanya sewa Aula/Gedung SG)'}</span>
                </h4>
                <p className="text-[11px] text-slate-500">
                  {includeAula && selectedMeetingRoomId && selectedRoomIds.length === 0
                    ? 'Rombongan saat ini hanya menyewa Ruang Pertemuan / Gedung Serbaguna (tanpa hunian kamar tidur). Pilih kamar di bawah jika membutuhkan akomodasi tambahan.'
                    : `Pilih kamar kosong untuk ditempati rombongan (${emptyRooms.length} kamar kosong tersedia)`}
                </p>
              </div>

              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <span className={`px-2.5 py-1 font-bold rounded-lg border text-xs flex items-center gap-1.5 ${
                  selectedRoomIds.length > 0
                    ? (calculateTotalBeds() >= estimatedMembers || estimatedMembers === 0)
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-amber-100 text-amber-900 border-amber-300'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}>
                  <i className="fa-solid fa-bed"></i>
                  <span>{selectedRoomIds.length} Kamar ({calculateTotalBeds()} Bed)</span>
                  {estimatedMembers > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-extrabold ${
                      calculateTotalBeds() >= estimatedMembers ? 'bg-emerald-700 text-white' : 'bg-amber-700 text-white'
                    }`}>
                      {calculateTotalBeds() >= estimatedMembers ? '✓ Cukup' : `⚠️ Kurang ${estimatedMembers - calculateTotalBeds()} Bed`}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={handleSelectAllInBuilding}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg border border-slate-300 cursor-pointer transition text-xs"
                >
                  Pilih Semua di Gedung Ini
                </button>
              </div>
            </div>

            {/* Quick Auto-Select Helper & Search */}
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-bold text-slate-700">Pilih Cepat:</span>
                {[2, 4, 6, 8, 10].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleQuickAutoSelect(n)}
                    className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-700 font-medium rounded border border-slate-300 shadow-2xs cursor-pointer"
                  >
                    + {n} Kamar
                  </button>
                ))}
                {selectedRoomIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedRoomIds([])}
                    className="px-2 py-0.5 text-rose-600 hover:underline font-bold ml-1 cursor-pointer"
                  >
                    Reset Pilihan
                  </button>
                )}
              </div>

              {/* Room Search Input */}
              <div className="relative w-44">
                <input
                  type="text"
                  value={roomSearchFilter}
                  onChange={e => setRoomSearchFilter(e.target.value)}
                  placeholder="Cari no kamar..."
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg pl-7 pr-6 py-1 focus:ring-1 focus:ring-emerald-600 outline-none text-slate-800"
                />
                <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-2 text-slate-400 text-[10px]"></i>
                {roomSearchFilter && (
                  <button
                    type="button"
                    onClick={() => setRoomSearchFilter('')}
                    className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                )}
              </div>
            </div>

            {/* Filter Controls: Gedung, Tipe Kamar, & Kapasitas Bed */}
            <div className="space-y-2 pt-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Gedung:</span>
                {buildingFilterOptions.map(b => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBuildingFilter(b.id)}
                    className={`px-2.5 py-0.5 rounded-full font-bold transition cursor-pointer text-[11px] ${
                      selectedBuildingFilter === b.id
                        ? 'bg-hajj-800 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase">3 Tipe Kamar:</span>
                {(['ALL', 'Ekonomi', 'Standar', 'Superior'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelectedTypeFilter(t)}
                    className={`px-2 py-0.5 rounded-lg font-bold transition cursor-pointer text-[10px] ${
                      selectedTypeFilter === t
                        ? t === 'Superior' ? 'bg-purple-700 text-white' : t === 'Ekonomi' ? 'bg-teal-700 text-white' : 'bg-blue-700 text-white'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {t === 'ALL' ? 'Semua Tipe' : t}
                  </button>
                ))}

                <span className="text-[10px] font-bold text-slate-400 ml-2">Kapasitas Bed:</span>
                <select
                  value={selectedBedFilter}
                  onChange={e => setSelectedBedFilter(e.target.value)}
                  className="text-[10px] bg-slate-50 border border-slate-200 rounded px-2 py-0.5 font-bold text-slate-700 outline-none"
                >
                  <option value="ALL">Semua Bed (Double s/d 8 Bed)</option>
                  <option value="Double Bed">Double Bed (2 Orang)</option>
                  <option value="2 Single Bed">2 Single Bed</option>
                  <option value="3 Single Bed">3 Single Bed</option>
                  <option value="4 Single Bed">4 Single Bed</option>
                  <option value="5 Single Bed">5 Single Bed</option>
                  <option value="6 Single Bed">6 Single Bed</option>
                  <option value="7 Single Bed">7 Single Bed</option>
                  <option value="8 Single Bed">8 Single Bed</option>
                </select>
              </div>
            </div>

            {/* Room Selection Grid */}
            {filteredAvailableRooms.length === 0 ? (
              <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                Tidak ada kamar kosong yang sesuai dengan filter gedung, tipe kamar, atau kapasitas bed ini.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-56 overflow-y-auto p-1 custom-scrollbar">
                {filteredAvailableRooms.map(r => {
                  const isSelected = selectedRoomIds.includes(r.id);
                  const isSuperior = r.type === 'Superior';
                  const isEkonomi = r.type === 'Ekonomi';
                  const matchedRate = findRoomRate(r.type, r.bedType, roomCapacityRates);
                  const roomPrice = r.pricePerNight || matchedRate?.pricePerNight || (isSuperior ? 500000 : isEkonomi ? 380000 : 480000);

                  return (
                    <div
                      key={r.id}
                      onClick={() => toggleRoomSelection(r.id)}
                      className={`p-2 rounded-xl border text-center cursor-pointer transition flex flex-col items-center justify-between space-y-1 ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-500 text-white font-black shadow-xs ring-2 ring-emerald-300'
                          : 'border-slate-200 bg-white hover:border-slate-400 text-slate-800'
                      }`}
                    >
                      <div className="w-full flex items-center justify-between text-[9px]">
                        <span className="opacity-80 truncate">{r.building.split(' ')[1] || r.building}</span>
                        <span className={`px-1 py-0.2 rounded font-bold text-[8px] ${
                          isSelected
                            ? 'bg-white/25 text-white'
                            : isSuperior ? 'bg-purple-100 text-purple-800' : isEkonomi ? 'bg-teal-100 text-teal-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {r.type || 'Standar'}
                        </span>
                      </div>
                      <div className="text-xs font-black">{r.roomNumber}</div>
                      <div className="text-[9px] opacity-85 leading-tight truncate max-w-full">
                        {r.bedType || `${r.capacity} Bed`}
                      </div>
                      <div className={`text-[9px] font-black px-1.5 py-0.5 rounded w-full truncate ${
                        isSelected
                          ? 'bg-black/20 text-white'
                          : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      }`}>
                        {formatRupiah(roomPrice)}/mlm
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 4. Sewa Ruang Pertemuan (Aula) & Gedung Serbaguna (SG) Terintegrasi */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
              <div>
                <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                  <i className="fa-solid fa-landmark text-purple-700"></i>
                  <span>4. Alokasi Ruang Pertemuan / Aula & Gedung Serbaguna (Sewa Fasilitas Rombongan)</span>
                </h4>
                <p className="text-[11px] text-slate-500">
                  Untuk pembekalan manasik haji akbar, konvensi, resepsi, rapat koordinasi kementerian, bimbingan teknis, atau gathering
                </p>
              </div>

              <label className="flex items-center space-x-2 cursor-pointer px-3 py-1.5 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition">
                <input 
                  type="checkbox" 
                  checked={includeAula}
                  onChange={(e) => {
                    setIncludeAula(e.target.checked);
                    if (e.target.checked && !selectedMeetingRoomId && emptyMeetingRooms.length > 0) {
                      setSelectedMeetingRoomId(emptyMeetingRooms[0].id);
                    }
                  }}
                  className="w-4 h-4 text-purple-600 rounded border-purple-300 focus:ring-purple-500" 
                />
                <span className="font-bold text-purple-900 text-xs">Menyewa Ruang Pertemuan / Aula / Gedung Serbaguna</span>
              </label>
            </div>

            {includeAula ? (
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Pilih Ruang Pertemuan / Aula / Gedung Serbaguna (Grid Real Fasilitas) <span className="text-rose-500">*</span>
                  </label>
                  {emptyMeetingRooms.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      Tidak ada ruang pertemuan atau gedung serbaguna kosong yang tersedia saat ini.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto p-1 custom-scrollbar">
                      {availableMeetingRooms.map(m => {
                        const isSelected = selectedMeetingRoomId === m.id;
                        const isOccupied = m.status === 'TERPAKAI';
                        const isMaint = m.status === 'MAINTENANCE';
                        const isSG = m.category === 'SERBAGUNA' || 
                                     m.building?.toLowerCase().includes('serbaguna') || 
                                     m.name?.toLowerCase().includes('serbaguna') ||
                                     m.roomNumber?.toLowerCase().includes('serbaguna');
                        return (
                          <div
                            key={m.id}
                            onClick={() => {
                              if (!isMaint) setSelectedMeetingRoomId(m.id);
                            }}
                            className={`p-3 rounded-xl border-2 transition flex flex-col justify-between space-y-1.5 ${
                              isMaint 
                                ? 'opacity-50 cursor-not-allowed bg-slate-100 border-slate-200' 
                                : isSelected
                                ? isSG
                                  ? 'border-amber-600 bg-amber-50 text-amber-950 font-bold shadow-xs ring-2 ring-amber-300 cursor-pointer'
                                  : 'border-purple-600 bg-purple-50 text-purple-950 font-bold shadow-xs ring-2 ring-purple-300 cursor-pointer'
                                : isSG
                                ? 'border-amber-200/80 bg-amber-50/30 hover:border-amber-400 text-slate-800 cursor-pointer'
                                : 'border-slate-200 bg-white hover:border-purple-300 text-slate-800 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                isSG 
                                  ? 'bg-amber-100 text-amber-900 border-amber-300' 
                                  : 'bg-purple-100 text-purple-800 border-purple-200'
                              }`}>
                                <i className={`fa-solid ${isSG ? 'fa-building-columns text-amber-700 mr-1' : 'fa-landmark text-purple-700 mr-1'}`}></i>
                                {m.building}
                              </span>
                              <div className="flex items-center space-x-1">
                                {isOccupied ? (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                    Ada Reservasi
                                  </span>
                                ) : isMaint ? (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">
                                    Perbaikan
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                    Tersedia
                                  </span>
                                )}
                                {isSelected && (
                                  <i className={`fa-solid fa-circle-check text-sm ${isSG ? 'text-amber-700' : 'text-purple-700'}`}></i>
                                )}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-black text-slate-900">{m.roomNumber}</div>
                              <div className="text-[11px] text-slate-600 mt-1 flex flex-col gap-0.5">
                                <div className="flex items-center justify-between">
                                  <span>Kapasitas: <strong className="text-slate-800">{m.capacity}</strong></span>
                                  <span className={`${isSG ? 'text-amber-900 bg-amber-100/90 border-amber-300' : 'text-purple-800 bg-purple-100/90 border-purple-300'} font-extrabold text-[11px] px-2 py-0.5 rounded border`}>
                                    {formatRupiah(m.ratePerSession || 8500000)} / Sesi
                                  </span>
                                </div>
                                <div className="text-[9.5px] text-slate-500 flex justify-between items-center">
                                  <span>Tarif Seharian Penuh:</span>
                                  <span className={`font-semibold ${isSG ? 'text-amber-950' : 'text-purple-950'}`}>{formatRupiah(m.dailyRate || 15000000)} / Hari</span>
                                </div>
                              </div>
                              {m.facilities && m.facilities.length > 0 && (
                                <div className="text-[9px] text-slate-400 truncate mt-1">
                                  {m.facilities.slice(0, 3).join(' • ')}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-purple-100">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Sesi & Durasi Jam Pemakaian Aula <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={meetingRoomSession}
                      onChange={(e) => {
                        setMeetingRoomSession(e.target.value);
                        if (e.target.value.includes('12 Jam')) setMeetingRoomDuration(12);
                        else setMeetingRoomDuration(8);
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-purple-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-purple-600 focus:bg-white outline-none font-medium text-xs"
                    >
                      <option value="Reguler 8 Jam (Sesi Pagi - 08.00 s/d 16.00 WIB)">Reguler 8 Jam (Sesi Pagi • Maks 2 Penyewa)</option>
                      <option value="Reguler 8 Jam (Sesi Siang/Malam - 13.00 s/d 21.00 WIB)">Reguler 8 Jam (Sesi Siang/Malam • Maks 2 Penyewa)</option>
                      <option value="Full Day 12 Jam (08.00 s/d 20.00 WIB)">Full Day 12 Jam (Seharian Penuh • Maks 1 Penyewa)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Durasi Pemesanan (Hari) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={meetingRoomDays}
                      onChange={(e) => setMeetingRoomDays(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-3 py-2 bg-slate-50 border border-purple-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-purple-600 focus:bg-white outline-none font-medium"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Keperluan Acara / Agenda Kegiatan
                    </label>
                    <input 
                      type="text" 
                      value={meetingRoomPurpose}
                      onChange={(e) => setMeetingRoomPurpose(e.target.value)}
                      placeholder={
                        groupType === 'JEMAAH_HAJI'
                          ? 'Bimbingan Manasik Haji Akbar & Pelepasan Kloter'
                          : groupType === 'INSTANSI'
                          ? 'Rapat Koordinasi Kerja & Diklat Kepegawaian'
                          : 'Pertemuan Silaturahmi & Temu Komunitas'
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-purple-600 focus:bg-white outline-none font-medium"
                    />
                  </div>
                </div>

                <div className="bg-purple-50 p-2.5 rounded-lg border border-purple-100 flex items-start space-x-2">
                  <i className="fa-solid fa-circle-check text-purple-600 mt-0.5 shrink-0 text-sm"></i>
                  <div className="text-[11px] text-purple-900">
                    <strong className="block">Fasilitas Standar Aula Termasuk:</strong>
                    Sound system 4 mic wireless, Proyektor & screen 3000 lumens, Podium sambutan, AC central, Meja penerima tamu.
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-slate-500 text-[11px] flex items-center justify-between">
                <span>Rombongan ini tidak menyewa ruang pertemuan / aula (Hanya alokasi akomodasi kamar tidur).</span>
                <button
                  type="button"
                  onClick={() => {
                    setIncludeAula(true);
                    if (availableMeetingRooms.length > 0) setSelectedMeetingRoomId(availableMeetingRooms[0].id);
                  }}
                  className="text-purple-700 hover:text-purple-900 font-bold hover:underline ml-2 shrink-0 cursor-pointer"
                >
                  + Tambahkan Aula
                </button>
              </div>
            )}
          </div>

          {/* 5. Layanan Konsumsi & Kebutuhan Pack Katering */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
              <div>
                <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                  <i className="fa-solid fa-utensils text-orange-600"></i>
                  <span>5. Paket Konsumsi Koperasi & Detail Pack</span>
                </h4>
                <p className="text-[11px] text-slate-500">
                  Hitung kebutuhan pack makanan utama, sarapan pagi, atau coffee break aula rombongan
                </p>
              </div>

              <div className="text-right">
                <span className="text-[11px] font-bold text-orange-800 bg-orange-100 px-2.5 py-1 rounded-lg border border-orange-200">
                  Kebutuhan: {estimatedMembers} Pack Peserta
                </span>
              </div>
            </div>

            {/* Pilihan Jenis Paket Konsumsi */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'TIDAK', label: 'Tidak Pakai Konsumsi', desc: 'Konsumsi Mandiri / 0 Pack', icon: 'fa-ban', color: 'slate' },
                { id: 'SARAPAN', label: 'Sarapan Pagi', desc: '1x Sarapan / Hari', icon: 'fa-mug-hot', color: 'orange' },
                { id: 'FULLBOARD', label: 'Fullboard Diklat', desc: '3x Makan + 2x Snack', icon: 'fa-bowl-food', color: 'emerald' },
                { id: 'SNACK_AULA', label: 'Snack Box Aula', desc: 'Snack & Kopi Rapat', icon: 'fa-cookie-bite', color: 'purple' },
              ].map((pkg) => (
                <div
                  key={pkg.id}
                  onClick={() => {
                    const nextPkg = pkg.id as any;
                    setCateringPackage(nextPkg);
                    setIncludeBreakfast(nextPkg !== 'TIDAK');
                    if (nextPkg === 'TIDAK') {
                      setBreakfastPortions(0);
                    } else {
                      if (breakfastPortions === 0 && estimatedMembers > 0) {
                        setBreakfastPortions(estimatedMembers);
                      }
                      if (nextPkg === 'FULLBOARD') {
                        const fb = breakfastMenuItems.find(m => m.name.toLowerCase().includes('fullboard') || m.category === 'MAKANAN_BERAT');
                        setBreakfastMenu(fb?.name || 'Paket Fullboard Diklat & Rombongan (3x Makan + 2x Snack)');
                      } else if (nextPkg === 'SNACK_AULA') {
                        const sb = breakfastMenuItems.find(m => m.category === 'SNACK_KUDAPAN' || m.name.toLowerCase().includes('snack'));
                        setBreakfastMenu(sb?.name || 'Snack Box Premium Acara Ruang Pertemuan');
                      } else if (nextPkg === 'SARAPAN') {
                        const br = breakfastMenuItems.find(m => m.category === 'MAKANAN_BERAT' || m.category === 'BUBUR_SAYUR' || m.name.toLowerCase().includes('nasi'));
                        setBreakfastMenu(br?.name || 'Nasi Goreng Spesial Telur Ceplok & Kerupuk');
                      }
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
                      Jumlah Pack Konsumsi (Default 0 - Mode: Tidak Pakai Konsumsi)
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Rombongan mandiri / tanpa konsumsi. Jumlah pack disetel <strong>0</strong> secara default.
                    </p>
                  </div>
                  <div className="flex items-center space-x-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setBreakfastPortions(prev => Math.max(0, prev - (prev > 10 ? 5 : 1)))}
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
                      className="w-20 px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-slate-500 outline-none font-bold text-center text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setBreakfastPortions(prev => prev + (prev >= 10 ? 5 : 1))}
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
                  {estimatedMembers > 0 && (
                    <button
                      type="button"
                      onClick={() => setBreakfastPortions(estimatedMembers)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition cursor-pointer ${
                        breakfastPortions === estimatedMembers 
                          ? 'bg-slate-800 text-white border-slate-900 shadow-2xs' 
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      = {estimatedMembers} Pack (Semua Peserta)
                    </button>
                  )}
                  {[5, 10, 20, 40].map(p => (
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
                      {cateringPackage === 'FULLBOARD' ? 'Paket 3x Makan + 2x Snack Diklat' : cateringPackage === 'SNACK_AULA' ? 'Sajian Snack Box & Coffee Break Aula' : 'Menu Sarapan Pagi Koperasi'}
                    </span>
                  </div>

                  {/* Themed Interactive Food Menu Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto p-1 custom-scrollbar">
                    {(() => {
                      let itemsToDisplay = [...breakfastMenuItems];
                      if (itemsToDisplay.length > 0) {
                        if (cateringPackage === 'FULLBOARD') {
                          const fbMatches = itemsToDisplay.filter(m => 
                            m.name.toLowerCase().includes('fullboard') || 
                            m.name.toLowerCase().includes('prasmanan') ||
                            m.category === 'MAKANAN_BERAT'
                          );
                          if (fbMatches.length > 0) itemsToDisplay = fbMatches;
                        } else if (cateringPackage === 'SNACK_AULA') {
                          const snackMatches = itemsToDisplay.filter(m => 
                            m.category === 'SNACK_KUDAPAN' || 
                            m.name.toLowerCase().includes('snack') ||
                            m.name.toLowerCase().includes('coffee')
                          );
                          if (snackMatches.length > 0) itemsToDisplay = snackMatches;
                        } else if (cateringPackage === 'SARAPAN') {
                          const bfMatches = itemsToDisplay.filter(m => 
                            !m.name.toLowerCase().includes('fullboard') && 
                            !m.name.toLowerCase().includes('prasmanan')
                          );
                          if (bfMatches.length > 0) itemsToDisplay = bfMatches;
                        }
                      }

                      return (itemsToDisplay.length > 0 ? (
                        itemsToDisplay.map(m => ({
                          title: m.name,
                          desc: m.description || 'Pilihan menu lezat dan higienis bersertifikasi halal resmi UPT',
                          price: m.price,
                          priceText: `Rp ${m.price.toLocaleString('id-ID')} / pack`,
                          badge: m.name.toLowerCase().includes('fullboard') ? 'Fullboard Diklat' : m.category === 'SNACK_KUDAPAN' ? 'Snack Box' : 'Menu Koperasi'
                        }))
                      ) : cateringPackage === 'FULLBOARD' ? [
                        {
                          title: 'Paket Fullboard Diklat & Rombongan (3x Makan + 2x Snack)',
                          desc: 'Rawon Daging Sapi, Ayam Bakar Madu, Ikan Bakar Jimbaran, Snack Lemper Ayam & Risol Mayo',
                          price: 120000,
                          priceText: 'Rp 120.000 / pax',
                          badge: '3x Makan + 2x Snack'
                        },
                        {
                          title: 'Paket Prasmanan Nusantara Rombongan (Makan Siang / Malam)',
                          desc: 'Soto Betawi Daging Gurih, Ayam Goreng Lengkuas, Asinan Sayur, Kerupuk & Aneka Kue Basah',
                          price: 50000,
                          priceText: 'Rp 50.000 / pax',
                          badge: 'Prasmanan Rombongan'
                        }
                      ] : cateringPackage === 'SNACK_AULA' ? [
                        {
                          title: 'Snack Box Premium Acara Ruang Pertemuan',
                          desc: 'Kroket Daging Sapi, Bolu Gulung Keju, Pastel Telur, Air Mineral Cup, Kopi & Teh Tarik Hangat',
                          price: 25000,
                          priceText: 'Rp 25.000 / pax',
                          badge: 'Coffee Break Premium'
                        },
                        {
                          title: 'Snack Box & Kopi / Teh Hangat',
                          desc: 'Lontong Sayur Ayam, Lemper Bakar, Tahu Bakso Semarang, Permen & Air Mineral 330ml',
                          price: 15000,
                          priceText: 'Rp 15.000 / pax',
                          badge: 'Snack Rapat Singkat'
                        }
                      ] : [
                        {
                          title: 'Nasi Goreng Spesial Telur Ceplok & Kerupuk',
                          desc: 'Dilengkapi telur ceplok kuning lembut, kerupuk udang renyah, acar segar, dan sambal khas',
                          price: 25000,
                          priceText: 'Rp 25.000 / porsi',
                          badge: 'Favorit Jemaah'
                        },
                        {
                          title: 'Nasi Kuning Komplit Ayam Suwir',
                          desc: 'Nasi kuning rempah kunyit harum, telur dadar iris tipis, orek tempe manis gurih, kerupuk bawang',
                          price: 28000,
                          priceText: 'Rp 28.000 / porsi',
                          badge: 'Nusantara'
                        }
                      ]);
                    })().map(item => {
                      const isSelected = breakfastMenu === item.title;
                      return (
                        <div
                          key={item.title}
                          onClick={() => setBreakfastMenu(item.title)}
                          className={`p-3 rounded-xl border-2 transition cursor-pointer flex flex-col justify-between space-y-2 ${
                            isSelected
                              ? 'border-orange-500 bg-orange-50/90 shadow-sm ring-2 ring-orange-300'
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
                          <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
                            <span className="text-slate-400 font-medium">{item.badge}</span>
                            <span className="font-extrabold text-orange-700 font-mono">{item.priceText}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <label className="block font-bold text-slate-700 mb-1 text-xs">
                    Jumlah Pack Konsumsi per Sesi / Hari
                  </label>
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={() => setBreakfastPortions(prev => Math.max(0, prev - (prev > 10 ? 5 : 1)))}
                      className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-bold text-sm flex items-center justify-center transition cursor-pointer shadow-2xs"
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
                      className="w-24 px-3 py-2 bg-slate-50 border border-orange-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-orange-500 focus:bg-white outline-none font-bold text-center text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setBreakfastPortions(prev => prev + (prev >= 10 ? 5 : 1))}
                      className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-bold text-sm flex items-center justify-center transition cursor-pointer shadow-2xs"
                      title="Tambah pack"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => setBreakfastPortions(estimatedMembers)}
                      title="Samakan dengan jumlah estimasi peserta"
                      className="px-2.5 py-2 bg-orange-100 hover:bg-orange-200 text-orange-800 text-[11px] font-bold rounded-lg border border-orange-300 shrink-0 cursor-pointer"
                    >
                      = {estimatedMembers} Pack
                    </button>
                  </div>

                  {/* Quick shortcuts */}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {[0, 10, 20, 40, 80].map(cnt => (
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
                        {cnt === 0 ? '0 Pack' : `${cnt} Pack`}
                      </button>
                    ))}
                  </div>

                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Total estimasi konsumsi: {breakfastPortions} Pack × {Math.max(1, duration)} Hari = <strong>{breakfastPortions * Math.max(1, duration)} Porsi Terjadwal</strong>
                  </span>
                </div>
              </div>
            )}

            {/* Extra Bed & Catatan */}
            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <label className="flex items-center space-x-2 cursor-pointer font-bold text-slate-800">
                <input 
                  type="checkbox"
                  checked={includeExtraBed}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIncludeExtraBed(checked);
                    if (checked && (!extraBedCount || extraBedCount === 4)) {
                      setExtraBedCount(1);
                    }
                  }}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
                <span className="text-xs sm:text-sm">Kebutuhan Kasur Lipat Tambahan (Extra Bed)</span>
              </label>

              {includeExtraBed && (
                <div className="flex flex-wrap items-center gap-2.5 bg-indigo-50/80 p-2.5 rounded-xl border border-indigo-200 text-xs">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-indigo-950 font-bold">Jumlah:</span>
                    <input 
                      type="number" 
                      min={1}
                      max={50}
                      value={extraBedCount}
                      onChange={(e) => setExtraBedCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 px-2 py-1 bg-white border border-indigo-300 rounded-lg text-center font-bold text-indigo-950 outline-none focus:ring-2 focus:ring-indigo-500"
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
                        onChange={(e) => setExtraBedPrice(parseInt(e.target.value.replace(/\D/g, '')) || 0)}
                        placeholder="100.000"
                        className="w-24 text-right font-mono font-bold text-indigo-950 outline-none"
                      />
                    </div>
                    <span className="text-indigo-700">/ malam</span>
                  </div>

                  <div className="text-indigo-900 font-bold bg-white px-2.5 py-1 rounded-lg border border-indigo-200">
                    Subtotal: <span className="font-mono text-indigo-800">{formatRupiah(extraBedCount * extraBedPrice * Math.max(1, duration))}</span>
                  </div>
                </div>
              )}
            </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Catatan Khusus Kebutuhan Rombongan
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Contoh: Rombongan tiba dengan 2 bus pariwisata jam 14:00. Mohon bantuan pengangkutan koper dan briefing singkat di lobi."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-hajj-600 focus:bg-white outline-none font-medium"
                ></textarea>
              </div>
            </div>

          {/* 6. Status & Rincian Pembayaran Awal (Sebelum Invoice Terbentuk) */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <div className="border-b border-slate-100 pb-2">
              <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                <i className="fa-solid fa-money-check-dollar text-emerald-700"></i>
                <span>6. Status &amp; Rincian Pembayaran Awal (Sebelum Invoice Terbentuk)</span>
              </h4>
              <p className="text-[11px] text-slate-500">
                Tentukan status pembayaran awal (Belum Bayar, DP, atau Lunas) beserta kanal pembayarannya sebelum invoice diterbitkan.
              </p>
            </div>

            {/* Rincian Komponen Tagihan Transparan (Sinkron Master Tarif) */}
            <div className="bg-slate-100/90 border border-slate-200 p-3 rounded-xl space-y-1.5 text-[11px]">
              <div className="font-bold text-slate-800 pb-1 border-b border-slate-200 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <i className="fa-solid fa-receipt text-slate-600"></i>
                  <span>Rincian Tagihan Rombongan (Sinkron Tarif Resmi):</span>
                </span>
                <span className="font-mono text-slate-600">Durasi: {duration} Malam</span>
              </div>
              <div className="flex justify-between items-center text-slate-700">
                <span>• Sewa Kamar ({selectedRoomIds.length} Kamar x {duration} Malam)</span>
                <span className="font-mono font-semibold text-slate-900">{formatRupiah(priceBreakdown.roomsTotal)}</span>
              </div>
              {includeAula && (
                <div className="flex justify-between items-center text-purple-800">
                  <span>• Sewa Ruang Pertemuan ({priceBreakdown.selectedMeetingObj?.name || 'Aula'} - Paket {meetingRoomDuration === 12 ? '12 Jam' : '8 Jam'}: {meetingRoomDays} Hari x {formatRupiah(priceBreakdown.meetingRatePerDay)})</span>
                  <span className="font-mono font-semibold">{formatRupiah(priceBreakdown.meetingTotal)}</span>
                </div>
              )}
              {cateringPackage !== 'TIDAK' && breakfastPortions > 0 && (
                <div className="flex justify-between items-center text-amber-800">
                  <span>• Paket Konsumsi ({breakfastMenu || cateringPackage}: {breakfastPortions} Pack x {duration} Hari @ {formatRupiah(priceBreakdown.catRate)})</span>
                  <span className="font-mono font-semibold">{formatRupiah(priceBreakdown.cateringTotal)}</span>
                </div>
              )}
              {includeExtraBed && extraBedCount > 0 && (
                <div className="flex justify-between items-center text-teal-800">
                  <span>• Extra Bed ({extraBedCount} Unit x {duration} Malam)</span>
                  <span className="font-mono font-semibold">{formatRupiah(priceBreakdown.extraBedTotal)}</span>
                </div>
              )}
            </div>

            <div className="p-3 bg-gradient-to-r from-emerald-50/70 via-gold-50/40 to-emerald-50/70 border border-emerald-300 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-emerald-950 uppercase tracking-wide">
                  Estimasi Total Tagihan Rombongan:
                </span>
                <span className="font-mono font-black text-emerald-800 text-sm">
                  {formatRupiah(groupGrandTotal)}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'BELUM_LUNAS', label: 'Belum Bayar', icon: 'fa-clock', color: 'slate' },
                  { id: 'DP', label: 'Uang Muka (DP)', icon: 'fa-hand-holding-dollar', color: 'amber' },
                  { id: 'LUNAS', label: 'Lunas Penuh', icon: 'fa-circle-check', color: 'emerald' },
                ].map(st => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setPayStatus(st.id as any)}
                    className={`p-2.5 rounded-lg border text-xs font-bold transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
                      payStatus === st.id
                        ? st.id === 'LUNAS'
                          ? 'bg-emerald-700 text-white border-emerald-800 shadow-sm'
                          : st.id === 'DP'
                          ? 'bg-amber-600 text-white border-amber-700 shadow-sm'
                          : 'bg-slate-800 text-white border-slate-900 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <i className={`fa-solid ${st.icon} text-sm`}></i>
                    <span>{st.label}</span>
                  </button>
                ))}
              </div>

              {payStatus === 'LUNAS' && (
                <div className="p-2.5 bg-emerald-100/90 border border-emerald-300 rounded-lg text-[11px] text-emerald-900 flex items-center gap-2 animate-in fade-in duration-100">
                  <i className="fa-solid fa-circle-check text-emerald-700 text-sm shrink-0"></i>
                  <span><strong>Status Lunas:</strong> Kwitansi pelunasan resmi (hijau) akan langsung tersedia, dan nota tagihan invoice selesai dibayar.</span>
                </div>
              )}
              {payStatus === 'DP' && (
                <div className="p-2 bg-amber-100/80 border border-amber-300 rounded-lg text-[11px] text-amber-900 flex items-center gap-2 animate-in fade-in duration-100">
                  <i className="fa-solid fa-hand-holding-dollar text-amber-700 text-sm shrink-0"></i>
                  <span><strong>Status DP:</strong> Kwitansi tanda terima DP &amp; Invoice tagihan pelunasan akan diterbitkan bersama rincian sisa tagihan.</span>
                </div>
              )}
              {payStatus === 'BELUM_LUNAS' && (
                <div className="p-2 bg-slate-100 border border-slate-300 rounded-lg text-[11px] text-slate-700 flex items-center gap-2 animate-in fade-in duration-100">
                  <i className="fa-solid fa-clock text-slate-500 text-sm shrink-0"></i>
                  <span><strong>Status Belum Bayar:</strong> Dokumen Invoice resmi akan diterbitkan untuk penagihan ke instansi atau perwakilan rombongan.</span>
                </div>
              )}

              {payStatus === 'DP' && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg space-y-2.5 text-xs animate-in fade-in duration-100">
                  <div>
                    <label className="block font-bold text-amber-950 mb-1">Nominal Uang Muka (DP):</label>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-amber-900">Rp</span>
                      <input
                        type="text"
                        value={payDpAmount ? Number(payDpAmount).toLocaleString('id-ID') : ''}
                        onChange={e => setPayDpAmount(parseInt(e.target.value.replace(/\D/g, '')) || 0)}
                        placeholder="Contoh: 1000000"
                        className="w-full p-2 bg-white border border-amber-300 rounded-lg font-mono font-bold text-amber-950 outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div className="flex gap-1.5 mt-1.5">
                      {[
                        { label: '20%', pct: 0.2 },
                        { label: '30%', pct: 0.3 },
                        { label: '50%', pct: 0.5 },
                        { label: '70%', pct: 0.7 }
                      ].map(preset => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setPayDpAmount(Math.round(groupGrandTotal * preset.pct))}
                          className="flex-1 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 font-bold rounded text-[10px] cursor-pointer"
                        >
                          {preset.label} ({formatRupiah(Math.round(groupGrandTotal * preset.pct))})
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="text-[11px] text-amber-900 flex justify-between pt-1 border-t border-amber-200">
                    <span>Sisa Tagihan Otomatis:</span>
                    <span className="font-mono font-black text-rose-700">
                      {formatRupiah(Math.max(0, groupGrandTotal - payDpAmount))}
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kanal / Metode Setoran:</label>
                  <select
                    value={payMethod}
                    onChange={e => setPayMethod(e.target.value as any)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg font-semibold text-slate-800 outline-none cursor-pointer"
                  >
                    <option value="VA_UPT">Virtual Account (VA) UPT Asrama Haji Jakarta</option>
                    <option value="TRANSFER">Transfer Bank Lainnya</option>
                    <option value="CASH">Tunai / Cash di Resepsionis</option>
                  </select>
                </div>

                {payMethod === 'TRANSFER' && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Pilih Bank:</label>
                    <select
                      value={payBank}
                      onChange={e => setPayBank(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg font-semibold text-slate-800 outline-none cursor-pointer"
                    >
                      {INDONESIAN_BANKS.map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tanggal Transaksi:</label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={e => setPayDate(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg font-semibold text-slate-800 outline-none"
                  />
                </div>
              </div>

              {payMethod === 'VA_UPT' && (
                <div className="p-3 bg-emerald-50/70 border border-emerald-300 rounded-xl space-y-2 text-xs animate-in fade-in duration-100">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-emerald-900 font-bold uppercase tracking-wider block">
                      Nomor Virtual Account Resmi:
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setPayVaNumber(OFFICIAL_VA_CONFIG.vaNumber);
                        setPayVaName(OFFICIAL_VA_CONFIG.accountName);
                      }}
                      className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 underline flex items-center gap-1 cursor-pointer"
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
                        className="w-full px-2.5 py-1.5 bg-white border border-emerald-300 rounded-lg text-slate-900 font-mono font-bold text-xs focus:ring-1 focus:ring-emerald-600 outline-none"
                        title="Nomor Virtual Account (dapat diisi sendiri)"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={payVaName}
                        onChange={(e) => setPayVaName(e.target.value)}
                        placeholder="Atas Nama VA"
                        className="w-full px-2.5 py-1.5 bg-white border border-emerald-300 rounded-lg text-slate-900 font-medium text-xs focus:ring-1 focus:ring-emerald-600 outline-none"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 italic">
                    *Nomor VA resmi default UPT Asrama Haji Jakarta: {OFFICIAL_VA_CONFIG.vaNumber}. Anda dapat mengisi nomor VA kustom di atas.
                  </p>
                </div>
              )}

              {payMethod === 'TRANSFER' && (
                <div className="p-3 bg-blue-50/70 border border-blue-300 rounded-xl space-y-2 text-xs animate-in fade-in duration-100">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-blue-900 font-bold uppercase tracking-wider block">
                      Nomor Rekening / Bukti Transfer:
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setPayBankAccountNumber(OFFICIAL_VA_CONFIG.vaNumber);
                        setPayVaName(OFFICIAL_VA_CONFIG.accountName);
                      }}
                      className="text-[10px] font-bold text-blue-700 hover:text-blue-900 underline flex items-center gap-1 cursor-pointer"
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
                        className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-slate-900 font-mono font-bold text-xs focus:ring-1 focus:ring-blue-600 outline-none"
                        title="Nomor Rekening Bank (dapat diisi sendiri)"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={payVaName}
                        onChange={(e) => setPayVaName(e.target.value)}
                        placeholder="Atas Nama Pemilik Rekening"
                        className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-slate-900 font-medium text-xs focus:ring-1 focus:ring-blue-600 outline-none"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 italic">
                    *Masukkan nomor rekening tujuan transfer atau referensi pembayaran bank.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Modal Footer Buttons */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-slate-500 text-xs">
              Alokasi: <strong className="text-slate-800">{selectedRoomIds.length} Kamar ({calculateTotalBeds()} Bed)</strong>
              {includeAula && selectedMeetingRoomId && (
                <strong className="text-purple-700 ml-1">+ 1 Ruang Pertemuan</strong>
              )}
              <span className="mx-2 text-slate-300">|</span>
              Peserta: <strong className="text-orange-700">{estimatedMembers} Pack</strong>
              {cateringPackage !== 'TIDAK' && (
                <span className="ml-1 text-[11px] text-emerald-700 font-semibold">({cateringPackage} - {breakfastPortions} Porsi/Hari)</span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold rounded-xl shadow-md transition flex items-center space-x-2 cursor-pointer"
              >
                <i className="fa-solid fa-check"></i>
                <span>{isEdit ? 'Simpan Perubahan Data Rombongan' : 'Simpan & Daftarkan Rombongan'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
