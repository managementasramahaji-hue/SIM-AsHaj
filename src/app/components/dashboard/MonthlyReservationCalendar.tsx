import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Transaction, Room, Maintenance, GroupType } from '../../types';
import { isMeetingFacility, formatIndonesianDate as defaultFormatIndonesianDate, addDaysToDateStr, getRealTodayDate } from '../../lib/utils';
import { useBodyScrollLock } from '../../lib/scrollLock';

export interface MonthlyReservationCalendarProps {
  transactions: Transaction[];
  rooms: Room[];
  maintenances?: Maintenance[];
  openModal: (modal: string, data?: any) => void;
  facilityFilter: 'ALL' | 'KAMAR' | 'AULA';
  setFacilityFilter: (filter: 'ALL' | 'KAMAR' | 'AULA') => void;
  currentDate: Date;
  setCurrentDate: (date: Date) => void;
  currentUser?: any;
  realToday?: string;
  formatIndonesianDate?: (dateStr: string) => string;
  updateBreakfastStatus?: (txId: string, status: any) => void;
  activateCheckin?: (roomIdOrTxId: string, targetTxId?: string) => void;
  checkoutRoom?: (roomIdOrTxId: string, txId?: string) => void;
  cancelBooking?: (roomIdOrTxId: string, txId?: string, reason?: string) => void;
  batchCheckinGroup?: (groupId: string) => void;
  batchCheckoutGroup?: (groupId: string) => void;
  setActiveTab?: (tab: string) => void;
}

export type UrgencyLevel = 'KRITIS' | 'TINGGI' | 'RENDAH';
export type AgendaCategory = 'CHECKIN' | 'CHECKOUT' | 'IN_HOUSE' | 'BREAKFAST' | 'QC' | 'MAINTENANCE' | 'AULA' | 'EXTRABED' | 'BATAL';

export interface AgendaItem {
  id: string;
  category: AgendaCategory;
  categoryLabel: string;
  categoryIcon: string;
  categoryBadgeClass: string;
  urgency: UrgencyLevel;
  urgencyReason: string;
  targetDate: string;
  roomNumber: string;
  building: string;
  guestName: string;
  isGroup?: boolean;
  groupName?: string;
  groupType?: GroupType;
  phone?: string;
  notes?: string;
  extraBed?: boolean;
  extraBedCount?: number;
  breakfastMenu?: string;
  breakfastPortions?: number;
  breakfastStatus?: string;
  txId?: string;
  roomId?: string;
  maintenanceId?: string;
  maintenancePriority?: string;
  isLunas?: boolean;
  tx?: Transaction;
  maintenance?: Maintenance;
  room?: Room;
}

export function MonthlyReservationCalendar({
  transactions,
  rooms,
  maintenances = [],
  openModal,
  facilityFilter,
  setFacilityFilter,
  currentDate,
  setCurrentDate,
  currentUser,
  realToday = getRealTodayDate(),
  formatIndonesianDate = defaultFormatIndonesianDate,
  updateBreakfastStatus,
  activateCheckin,
  checkoutRoom,
  cancelBooking,
  batchCheckinGroup,
  batchCheckoutGroup,
  setActiveTab,
}: MonthlyReservationCalendarProps) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const [selectedDateStr, setSelectedDateStr] = useState<string>(realToday);
  const [isDateModalOpen, setIsDateModalOpen] = useState<string | null>(null);
  const [modalUrgencyFilter, setModalUrgencyFilter] = useState<'ALL' | UrgencyLevel>('ALL');
  const [modalCategoryFilter, setModalCategoryFilter] = useState<string>('ALL');
  useBodyScrollLock(Boolean(isDateModalOpen));

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const handleResetToCurrent = () => {
    setCurrentDate(new Date());
    setSelectedDateStr(realToday);
  };

  const calendarDays = useMemo(() => {
    const days: (Date | null)[] = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  }, [year, month, daysInMonth, firstDayOfMonth]);

  const isTxMeetingFacility = (tx: Transaction) => {
    return tx.building === 'Ruang Pertemuan' || isMeetingFacility(tx.building);
  };

  const getTransactionsForDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const checkDateStr = `${y}-${m}-${d}`;

    return transactions.filter(tx => {
      if (tx.status === 'DIBATALKAN' || tx.status === 'SELESAI') return false;
      const isAula = isTxMeetingFacility(tx);
      if (facilityFilter === 'KAMAR' && isAula) return false;
      if (facilityFilter === 'AULA' && !isAula) return false;

      if (isAula) {
        const aulaDays = tx.duration >= 24 ? Math.ceil(tx.duration / 24) : 1;
        const aulaEndDateStr = addDaysToDateStr(tx.startDate, aulaDays);
        return checkDateStr >= tx.startDate && checkDateStr < aulaEndDateStr;
      }
      const checkoutDateStr = addDaysToDateStr(tx.startDate, tx.duration);
      return checkDateStr >= tx.startDate && checkDateStr < checkoutDateStr;
    });
  };

  const getConsolidatedCalendarForDate = (txs: Transaction[]) => {
    const map: { [key: string]: any } = {};
    const individuals: any[] = [];

    txs.forEach(tx => {
      let key = '';
      let detectedType = 'UMUM';
      let gName = '';

      if (tx.groupId) {
        key = tx.groupId;
        detectedType = tx.groupType || (tx.category === 'JEMAAH' ? 'JEMAAH_HAJI' : 'INSTANSI');
        gName = tx.groupName || tx.guestName;
      } else if (tx.category === 'JEMAAH' && tx.kloter && tx.kloter !== '-') {
        key = `KLOTER-${tx.kloter}`;
        detectedType = 'JEMAAH_HAJI';
        gName = `Kloter ${tx.kloter}`;
      } else if (tx.notes && tx.notes.includes('[Rombongan:')) {
        const match = tx.notes.match(/\[Rombongan:\s*([^\]]+)\]/);
        gName = match ? match[1] : tx.guestName;
        key = `GRP-${gName.replace(/\s+/g, '-').toUpperCase()}`;
        detectedType = tx.groupType || 'UMUM';
      }

      if (key) {
        if (!map[key]) {
          map[key] = {
            id: key,
            isGroup: true,
            groupId: key,
            title: gName,
            groupType: detectedType,
            roomNumbers: [],
            count: 0,
            status: tx.status,
            building: tx.building,
            isMeeting: isTxMeetingFacility(tx),
            transactions: []
          };
        }
        map[key].transactions.push(tx);
        map[key].count += 1;
        if (!map[key].roomNumbers.includes(tx.roomNumber)) {
          map[key].roomNumbers.push(tx.roomNumber);
        }
        if (tx.status === 'TERISI' && map[key].status === 'BOOKED') {
          map[key].status = 'CAMPUR';
        }
      } else {
        individuals.push({
          id: tx.id,
          isGroup: false,
          title: `${tx.roomNumber} · ${tx.guestName}`,
          roomNumbers: [tx.roomNumber],
          count: 1,
          status: tx.status,
          building: tx.building,
          isMeeting: isTxMeetingFacility(tx),
          transactions: [tx]
        });
      }
    });

    return [...Object.values(map), ...individuals];
  };

  const monthMetrics = useMemo(() => {
    const monthStartStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const nextMonthYear = month === 11 ? year + 1 : year;
    const nextMonth = month === 11 ? 1 : month + 2;
    const monthEndStr = `${nextMonthYear}-${String(nextMonth).padStart(2, '0')}-01`;

    const activeTxs = transactions.filter(tx => {
      if (tx.status === 'DIBATALKAN' || tx.status === 'SELESAI') return false;
      const checkoutStr = addDaysToDateStr(tx.startDate, tx.duration);
      return tx.startDate < monthEndStr && checkoutStr >= monthStartStr;
    });

    const kamarTxs = activeTxs.filter(t => !isTxMeetingFacility(t));
    const aulaTxs = activeTxs.filter(t => isTxMeetingFacility(t));
    const checkedInCount = kamarTxs.filter(t => t.status === 'TERISI').length;
    const bookedCount = kamarTxs.filter(t => t.status === 'BOOKED').length;

    return {
      total: activeTxs.length,
      kamarTotal: kamarTxs.length,
      checkedInCount,
      bookedCount,
      aulaCount: aulaTxs.length,
    };
  }, [transactions, year, month]);

  const getDayUrgencyProfile = (dateStr: string) => {
    let hasCritical = false;
    let hasHigh = false;

    const checkouts = transactions.filter(t => {
      if (t.status === 'DIBATALKAN' || t.status === 'SELESAI') return false;
      const coDate = addDaysToDateStr(t.startDate, t.duration);
      return coDate === dateStr;
    });
    if (checkouts.length > 0) {
      if (dateStr === realToday) {
        if (checkouts.some(t => t.status === 'TERISI' && (t as any).paymentStatus !== 'LUNAS')) {
          hasCritical = true;
        } else {
          hasHigh = true;
        }
      } else if (dateStr < realToday && checkouts.some(t => t.status === 'TERISI')) {
        hasCritical = true;
      }
    }

    const checkins = transactions.filter(t => {
      if (t.status === 'DIBATALKAN' || t.status === 'SELESAI') return false;
      return t.startDate === dateStr;
    });
    if (checkins.length > 0) {
      if (dateStr === realToday && checkins.some(t => t.status === 'BOOKED')) {
        hasHigh = true;
      } else if (dateStr < realToday && checkins.some(t => t.status === 'BOOKED')) {
        hasCritical = true;
      }
    }

    const dayMaints = maintenances.filter(m => {
      if (m.status === 'SELESAI') return false;
      const mDate = m.reportTime ? m.reportTime.split(' ')[0] : (m as any).reportedDate;
      return mDate === dateStr;
    });
    if (dayMaints.some(m => m.urgency === 'DARURAT' || (m as any).priority === 'DARURAT' || m.status === 'MENUNGGU_PENUGASAN')) {
      hasCritical = true;
    } else if (dayMaints.length > 0) {
      hasHigh = true;
    }

    return { hasCritical, hasHigh };
  };

  // Build agenda items for the modal active date
  const agendaItemsForModalDate = useMemo(() => {
    if (!isDateModalOpen) return [];
    const targetDate = isDateModalOpen;
    const isTargetToday = targetDate === realToday;
    const isPastDate = targetDate < realToday;
    const items: AgendaItem[] = [];

    // 1. CHECK-OUT
    const dateCheckouts = transactions.filter(tx => {
      if (tx.status === 'DIBATALKAN' || tx.status === 'SELESAI') return false;
      const isAula = isTxMeetingFacility(tx);
      if (facilityFilter === 'KAMAR' && isAula) return false;
      if (facilityFilter === 'AULA' && !isAula) return false;
      const coDate = addDaysToDateStr(tx.startDate, tx.duration);
      return coDate === targetDate;
    });

    dateCheckouts.forEach(tx => {
      const isLunas = (tx as any).paymentStatus === 'LUNAS';
      let urgency: UrgencyLevel = 'RENDAH';
      let urgencyReason = 'Jadwal Check-Out Normal';

      if (isTargetToday && tx.status === 'TERISI') {
        if (!isLunas) {
          urgency = 'KRITIS';
          urgencyReason = 'Check-Out Hari Ini (Tagihan Belum Lunas)';
        } else {
          urgency = 'TINGGI';
          urgencyReason = 'Jadwal Check-Out Hari Ini (Kunci & Kamar)';
        }
      } else if (isPastDate && tx.status === 'TERISI') {
        urgency = 'KRITIS';
        urgencyReason = 'Overdue / Terlambat Check-Out';
      }

      items.push({
        id: `co-${tx.id}`,
        category: 'CHECKOUT',
        categoryLabel: 'Check-Out',
        categoryIcon: 'fa-right-from-bracket',
        categoryBadgeClass: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
        urgency,
        urgencyReason,
        targetDate,
        roomNumber: tx.roomNumber,
        building: tx.building,
        guestName: tx.guestName,
        isGroup: tx.isGroup || !!tx.groupId,
        groupName: tx.groupName || (tx.category === 'JEMAAH' ? `Kloter ${tx.kloter}` : undefined),
        groupType: tx.groupType,
        phone: tx.phone,
        notes: tx.notes,
        isLunas,
        txId: tx.id,
        roomId: tx.roomId,
        tx,
        room: rooms.find(r => r.id === tx.roomId),
      });
    });

    // 2. CHECK-IN
    const dateCheckins = transactions.filter(tx => {
      if (tx.status === 'DIBATALKAN' || tx.status === 'SELESAI') return false;
      const isAula = isTxMeetingFacility(tx);
      if (facilityFilter === 'KAMAR' && isAula) return false;
      if (facilityFilter === 'AULA' && !isAula) return false;
      return tx.startDate === targetDate;
    });

    dateCheckins.forEach(tx => {
      let urgency: UrgencyLevel = 'RENDAH';
      let urgencyReason = 'Reservasi Check-In Terjadwal';

      if (isTargetToday && tx.status === 'BOOKED') {
        urgency = 'TINGGI';
        urgencyReason = 'Tamu Menunggu Check-In Hari Ini';
      } else if (isPastDate && tx.status === 'BOOKED') {
        urgency = 'KRITIS';
        urgencyReason = 'Reservasi Tertunda / Belum Datang';
      }

      items.push({
        id: `ci-${tx.id}`,
        category: 'CHECKIN',
        categoryLabel: 'Check-In',
        categoryIcon: 'fa-key',
        categoryBadgeClass: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
        urgency,
        urgencyReason,
        targetDate,
        roomNumber: tx.roomNumber,
        building: tx.building,
        guestName: tx.guestName,
        isGroup: tx.isGroup || !!tx.groupId,
        groupName: tx.groupName || (tx.category === 'JEMAAH' ? `Kloter ${tx.kloter}` : undefined),
        groupType: tx.groupType,
        phone: tx.phone,
        notes: tx.notes,
        txId: tx.id,
        roomId: tx.roomId,
        tx,
        room: rooms.find(r => r.id === tx.roomId),
      });
    });

    // 3. IN-HOUSE
    const inHouseTxs = transactions.filter(tx => {
      if (tx.status !== 'TERISI') return false;
      const isAula = isTxMeetingFacility(tx);
      if (facilityFilter === 'KAMAR' && isAula) return false;
      if (facilityFilter === 'AULA' && !isAula) return false;
      const coDate = addDaysToDateStr(tx.startDate, tx.duration);
      return tx.startDate < targetDate && targetDate < coDate;
    });

    inHouseTxs.forEach(tx => {
      items.push({
        id: `inhouse-${tx.id}`,
        category: 'IN_HOUSE',
        categoryLabel: 'Tamu Menginap',
        categoryIcon: 'fa-bed',
        categoryBadgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
        urgency: 'RENDAH',
        urgencyReason: 'Tamu Sedang Menginap (In-House)',
        targetDate,
        roomNumber: tx.roomNumber,
        building: tx.building,
        guestName: tx.guestName,
        isGroup: tx.isGroup || !!tx.groupId,
        groupName: tx.groupName || (tx.category === 'JEMAAH' ? `Kloter ${tx.kloter}` : undefined),
        groupType: tx.groupType,
        phone: tx.phone,
        notes: tx.notes,
        isLunas: (tx as any).paymentStatus === 'LUNAS',
        txId: tx.id,
        roomId: tx.roomId,
        tx,
        room: rooms.find(r => r.id === tx.roomId),
      });
    });

    // 4. BREAKFAST
    const dateBreakfastTxs = transactions.filter(tx => {
      if (tx.status === 'DIBATALKAN' || tx.status === 'SELESAI') return false;
      if (facilityFilter === 'AULA') return false;
      const hasBreakfast = Boolean(tx.breakfast) && (!tx.cateringPackage || tx.cateringPackage !== 'TIDAK');
      if (!hasBreakfast) return false;
      const coDate = addDaysToDateStr(tx.startDate, tx.duration);
      return targetDate >= tx.startDate && targetDate < coDate;
    });

    dateBreakfastTxs.forEach(tx => {
      let urgency: UrgencyLevel = 'RENDAH';
      let urgencyReason = 'Jadwal Sarapan Rutin';
      const bStatus = tx.breakfastStatus || 'MENUNGGU';

      if (isTargetToday && bStatus === 'MENUNGGU') {
        urgency = 'TINGGI';
        urgencyReason = 'Pesanan Sarapan Baru (Perlu Dimasak)';
      }

      items.push({
        id: `bf-${tx.id}`,
        category: 'BREAKFAST',
        categoryLabel: 'Layanan Dapur',
        categoryIcon: 'fa-utensils',
        categoryBadgeClass: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
        urgency,
        urgencyReason,
        targetDate,
        roomNumber: tx.roomNumber,
        building: tx.building,
        guestName: tx.guestName,
        phone: tx.phone,
        notes: tx.notes,
        breakfastMenu: tx.breakfastMenu || 'Nasi Goreng Spesial',
        breakfastPortions: tx.breakfastPortions || 1,
        breakfastStatus: bStatus,
        txId: tx.id,
        roomId: tx.roomId,
        tx,
        room: rooms.find(r => r.id === tx.roomId),
      });
    });

    // 5. QC
    if (isTargetToday && facilityFilter !== 'AULA') {
      rooms.forEach(rm => {
        if (rm.building === 'Ruang Pertemuan' || isMeetingFacility(rm.building)) return;
        const needsCleaning = rm.qcStatus === 'PERLU_PERBAIKAN' || (rm as any).status === 'KOTOR';
        const needsInspection = rm.status === 'KOSONG' && (rm.qcStatus === 'MENUNGGU_QC' || rm.qcStatus === 'PERLU_INSPEKSI');

        if (needsCleaning) {
          items.push({
            id: `qc-clean-${rm.id}`,
            category: 'QC',
            categoryLabel: 'Kebersihan & QC',
            categoryIcon: 'fa-broom',
            categoryBadgeClass: 'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800',
            urgency: 'KRITIS',
            urgencyReason: rm.qcStatus === 'PERLU_PERBAIKAN' ? 'Kamar Ditolak QC (Butuh Perbaikan)' : 'Kamar Kotor (Perlu Dibersihkan)',
            targetDate,
            roomNumber: rm.roomNumber,
            building: rm.building,
            guestName: 'Petugas Housekeeping',
            roomId: rm.id,
            room: rm,
          });
        } else if (needsInspection) {
          items.push({
            id: `qc-inspect-${rm.id}`,
            category: 'QC',
            categoryLabel: 'Inspeksi QC',
            categoryIcon: 'fa-clipboard-check',
            categoryBadgeClass: 'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800',
            urgency: 'TINGGI',
            urgencyReason: 'Kamar Selesai Dibersihkan (Menunggu QC)',
            targetDate,
            roomNumber: rm.roomNumber,
            building: rm.building,
            guestName: 'Inspektur QC',
            roomId: rm.id,
            room: rm,
          });
        }
      });
    }

    // 6. MAINTENANCE
    const activeTickets = maintenances.filter(m => {
      if (m.status === 'SELESAI') return false;
      const isAula = m.building === 'Ruang Pertemuan' || isMeetingFacility(m.building || '');
      if (facilityFilter === 'KAMAR' && isAula) return false;
      if (facilityFilter === 'AULA' && !isAula) return false;
      const repDate = m.reportTime ? m.reportTime.split(' ')[0] : (m as any).reportedDate;
      if (isTargetToday) return true;
      return repDate === targetDate;
    });

    activeTickets.forEach(m => {
      const isDarurat = m.urgency === 'DARURAT' || (m as any).priority === 'DARURAT' || m.status === 'MENUNGGU_PENUGASAN';
      const urgency: UrgencyLevel = isDarurat ? 'KRITIS' : 'TINGGI';

      items.push({
        id: `maint-${m.id}`,
        category: 'MAINTENANCE',
        categoryLabel: 'Perbaikan Sarana',
        categoryIcon: 'fa-screwdriver-wrench',
        categoryBadgeClass: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800',
        urgency,
        urgencyReason: isDarurat ? 'Kerusakan Mendesak' : 'Tiket Dalam Pengerjaan',
        targetDate,
        roomNumber: m.roomNumber,
        building: m.building || 'Fasilitas UPT',
        guestName: m.technician || 'Belum Ditugaskan',
        notes: m.description,
        maintenanceId: m.id,
        maintenancePriority: m.urgency,
        maintenance: m,
        roomId: m.roomId,
        room: rooms.find(r => r.id === m.roomId),
      });
    });

    // 7. AULA
    if (facilityFilter !== 'KAMAR') {
      const dateAulaTxs = transactions.filter(tx => {
        if (tx.status === 'DIBATALKAN' || tx.status === 'SELESAI') return false;
        if (!isTxMeetingFacility(tx)) return false;
        const aulaDays = tx.duration >= 24 ? Math.ceil(tx.duration / 24) : 1;
        const aulaEndDateStr = addDaysToDateStr(tx.startDate, aulaDays);
        return targetDate >= tx.startDate && targetDate < aulaEndDateStr;
      });

      dateAulaTxs.forEach(tx => {
        items.push({
          id: `aula-${tx.id}`,
          category: 'AULA',
          categoryLabel: 'Ruang Pertemuan',
          categoryIcon: 'fa-landmark',
          categoryBadgeClass: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800',
          urgency: isTargetToday ? 'TINGGI' : 'RENDAH',
          urgencyReason: isTargetToday ? 'Acara Berlangsung Hari Ini' : 'Jadwal Pemakaian Aula',
          targetDate,
          roomNumber: tx.roomNumber,
          building: tx.building,
          guestName: tx.guestName,
          phone: tx.phone,
          notes: tx.notes || `Durasi: ${tx.duration} Jam`,
          txId: tx.id,
          roomId: tx.roomId,
          tx,
          room: rooms.find(r => r.id === tx.roomId),
        });
      });
    }

    const urgencyWeight = { KRITIS: 0, TINGGI: 1, RENDAH: 2 };
    return items.sort((a, b) => urgencyWeight[a.urgency] - urgencyWeight[b.urgency]);
  }, [isDateModalOpen, transactions, rooms, maintenances, realToday, facilityFilter]);

  const modalFilteredAgenda = useMemo(() => {
    return agendaItemsForModalDate.filter(item => {
      if (modalUrgencyFilter !== 'ALL' && item.urgency !== modalUrgencyFilter) return false;
      if (modalCategoryFilter !== 'ALL' && item.category !== modalCategoryFilter) return false;
      return true;
    });
  }, [agendaItemsForModalDate, modalUrgencyFilter, modalCategoryFilter]);

  const modalCounts = useMemo(() => {
    const total = agendaItemsForModalDate.length;
    const kritis = agendaItemsForModalDate.filter(i => i.urgency === 'KRITIS').length;
    const tinggi = agendaItemsForModalDate.filter(i => i.urgency === 'TINGGI').length;
    const rendah = agendaItemsForModalDate.filter(i => i.urgency === 'RENDAH').length;
    const checkin = agendaItemsForModalDate.filter(i => i.category === 'CHECKIN').length;
    const checkout = agendaItemsForModalDate.filter(i => i.category === 'CHECKOUT').length;
    const inhouse = agendaItemsForModalDate.filter(i => i.category === 'IN_HOUSE').length;
    const breakfast = agendaItemsForModalDate.filter(i => i.category === 'BREAKFAST').length;
    const qc = agendaItemsForModalDate.filter(i => i.category === 'QC').length;
    const maint = agendaItemsForModalDate.filter(i => i.category === 'MAINTENANCE').length;
    const aula = agendaItemsForModalDate.filter(i => i.category === 'AULA').length;
    return { total, kritis, tinggi, rendah, checkin, checkout, inhouse, breakfast, qc, maint, aula };
  }, [agendaItemsForModalDate]);

  const isModalDateToday = isDateModalOpen === realToday;
  const actualToday = new Date();

  return (
    <motion.section 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.12 }}
      id="dashboard-calendar-section" 
      className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/90 dark:border-slate-800 overflow-hidden"
    >
      {/* TOP HEADER: TITLE, MONTH STATS, CONTROLS */}
      <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-slate-900 via-hajj-900 to-slate-900 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-xl bg-gold-400/20 text-gold-300 border border-gold-400/30 flex items-center justify-center font-bold text-lg shrink-0 shadow-xs">
            <i className="fa-solid fa-calendar-days"></i>
          </div>
          <div>
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <h3 className="text-base sm:text-lg font-black tracking-tight text-white">
                Kalender Reservasi &amp; Agenda Operasional Terpadu
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-gold-400/20 text-gold-300 border border-gold-400/30">
                {monthMetrics.total} Reservasi Aktif Bulan Ini
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Klik tanggal mana saja pada kalender untuk membuka popup agenda, prioritas tugas, dan rincian tamu harian.
            </p>
          </div>
        </div>

        {/* Controls: Facility Filter, Month Navigation */}
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          {/* Facility Filter Pills */}
          <div className="inline-flex bg-slate-800/80 p-1 rounded-xl border border-slate-700/80 text-xs font-semibold backdrop-blur-xs">
            <button
              type="button"
              onClick={() => setFacilityFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                facilityFilter === 'ALL' ? 'bg-gold-500 text-slate-900 font-bold shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              Semua
            </button>
            <button
              type="button"
              onClick={() => setFacilityFilter('KAMAR')}
              className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 cursor-pointer ${
                facilityFilter === 'KAMAR' ? 'bg-emerald-600 text-white font-bold shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              <i className="fa-solid fa-bed text-[10px]"></i>
              <span>Kamar ({monthMetrics.kamarTotal})</span>
            </button>
            <button
              type="button"
              onClick={() => setFacilityFilter('AULA')}
              className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 cursor-pointer ${
                facilityFilter === 'AULA' ? 'bg-purple-600 text-white font-bold shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              <i className="fa-solid fa-landmark text-[10px]"></i>
              <span>Aula ({monthMetrics.aulaCount})</span>
            </button>
          </div>

          {/* Month Navigation */}
          <div className="flex items-center space-x-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/80 backdrop-blur-xs">
            <button type="button" onClick={handlePrevMonth} className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition cursor-pointer" title="Bulan sebelumnya">
              <i className="fa-solid fa-chevron-left text-xs"></i>
            </button>
            <span className="text-xs font-bold text-white min-w-[120px] text-center px-1">
              {monthNames[month]} {year}
            </span>
            <button type="button" onClick={handleNextMonth} className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition cursor-pointer" title="Bulan berikutnya">
              <i className="fa-solid fa-chevron-right text-xs"></i>
            </button>
            <button type="button" onClick={handleResetToCurrent} className="px-2.5 py-1 bg-gold-500/20 hover:bg-gold-500/30 text-gold-300 text-xs font-bold rounded-lg border border-gold-500/30 transition cursor-pointer ml-1">
              Hari Ini
            </button>
          </div>
        </div>
      </div>

      {/* SUB-BAR: REAL-TIME SUMMARY PILLS */}
      <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <div className="flex items-center space-x-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 px-3 py-1 rounded-lg font-semibold shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Kamar Terisi: <strong>{monthMetrics.checkedInCount}</strong></span>
          </div>
          <div className="flex items-center space-x-2 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60 px-3 py-1 rounded-lg font-semibold shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            <span>Reservasi Terjadwal: <strong>{monthMetrics.bookedCount}</strong></span>
          </div>
          <div className="flex items-center space-x-2 bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/60 px-3 py-1 rounded-lg font-semibold shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
            <span>Aula Pertemuan: <strong>{monthMetrics.aulaCount}</strong></span>
          </div>
        </div>

        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
          <span>Tip: Klik kotak tanggal pada kalender untuk membuka rincian agenda tugas harian.</span>
        </div>
      </div>

      {/* CALENDAR MONTH GRID */}
      <div className="p-3 sm:p-5 overflow-x-auto custom-scrollbar">
        <div className="min-w-[680px] rounded-xl border border-slate-200 dark:border-slate-700/80 overflow-hidden shadow-2xs bg-white dark:bg-slate-900">
          <div className="grid grid-cols-7 text-center font-bold text-xs bg-slate-100/90 dark:bg-slate-800/90 py-2.5 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
            <div className="text-rose-600 dark:text-rose-400">Minggu</div>
            <div>Senin</div>
            <div>Selasa</div>
            <div>Rabu</div>
            <div>Kamis</div>
            <div>Jumat</div>
            <div className="text-blue-600 dark:text-blue-400">Sabtu</div>
          </div>

          <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-700/80">
            {calendarDays.map((day, idx) => {
              if (!day) {
                return <div key={`empty-${idx}`} className="min-h-[85px] sm:min-h-[96px] bg-slate-50/40 dark:bg-slate-900/30 p-2"></div>;
              }

              const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
              const dayTxs = getTransactionsForDate(day);
              const consolidatedItems = getConsolidatedCalendarForDate(dayTxs);
              const isToday = (
                day.getDate() === actualToday.getDate() && 
                day.getMonth() === actualToday.getMonth() && 
                day.getFullYear() === actualToday.getFullYear()
              );
              const isSunday = day.getDay() === 0;
              const isSaturday = day.getDay() === 6;
              const urgencyProfile = getDayUrgencyProfile(dateStr);

              return (
                <div 
                  key={`day-${day.getDate()}`} 
                  onClick={() => {
                    setModalUrgencyFilter('ALL');
                    setModalCategoryFilter('ALL');
                    setIsDateModalOpen(dateStr);
                  }} 
                  className={`min-h-[85px] sm:min-h-[96px] p-2 transition cursor-pointer flex flex-col justify-between group select-none relative ${
                    isToday 
                      ? 'bg-amber-50/50 dark:bg-amber-950/20 ring-1 ring-amber-400/50' 
                      : 'bg-white dark:bg-slate-900 hover:bg-emerald-50/40 dark:hover:bg-slate-850'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <span className={`text-xs font-bold transition flex items-center justify-center ${
                        isToday 
                          ? 'w-6 h-6 rounded-lg bg-amber-500 text-white font-black shadow-xs' 
                          : isSunday
                            ? 'text-rose-600 dark:text-rose-400 font-bold'
                            : isSaturday
                              ? 'text-blue-600 dark:text-blue-400 font-bold'
                              : 'text-slate-800 dark:text-slate-200'
                      }`}>
                        {day.getDate()}
                      </span>

                      <div className="flex items-center space-x-0.5">
                        {urgencyProfile.hasCritical && (
                          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title="Terdapat tugas kritis"></span>
                        )}
                        {urgencyProfile.hasHigh && !urgencyProfile.hasCritical && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Tugas prioritas tinggi"></span>
                        )}
                        {dayTxs.length > 0 && !urgencyProfile.hasCritical && !urgencyProfile.hasHigh && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Hunian aktif"></span>
                        )}
                      </div>
                    </div>

                    {dayTxs.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700">
                        {dayTxs.length} Unit
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 overflow-hidden flex-grow mt-1.5">
                    {consolidatedItems.slice(0, 2).map((item, tIdx) => {
                      const isAula = item.isMeeting;
                      const isTerisi = item.status === "TERISI";
                      const isCampur = item.status === "CAMPUR";

                      const itemBg = isAula
                        ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-900 dark:text-purple-200 border-purple-200/90 dark:border-purple-800'
                        : isTerisi
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 border-emerald-200/90 dark:border-emerald-800'
                          : isCampur
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200 border-indigo-200/90 dark:border-indigo-800'
                            : 'bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-200 border-blue-200/90 dark:border-blue-800';

                      const dotColor = isAula ? 'bg-purple-600' : isTerisi ? 'bg-emerald-600' : isCampur ? 'bg-indigo-600' : 'bg-blue-600';

                      return (
                        <div 
                          key={tIdx} 
                          className={`text-[10px] px-1.5 py-0.5 rounded-md border ${itemBg} truncate font-semibold flex items-center gap-1 transition shadow-2xs`} 
                          title={item.isGroup ? `${item.title} (${item.count} Unit)` : item.title}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0`}></span>
                          <span className="truncate">{item.isGroup ? `${item.title} (${item.count})` : item.title}</span>
                        </div>
                      );
                    })}

                    {consolidatedItems.length > 2 && (
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold px-0.5 transition flex items-center gap-1">
                        <i className="fa-solid fa-plus text-[8px]"></i>
                        <span>{consolidatedItems.length - 2} lainnya...</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* DATE CLICK AGENDA & PRIORITY POPUP MODAL */}
      {isDateModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setIsDateModalOpen(null)}
        >
          <div 
            className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-6 sm:p-7 space-y-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center font-bold text-base shadow-lg shadow-emerald-500/30">
                  <i className="fa-solid fa-calendar-check"></i>
                </div>
                <div>
                  <div className="flex items-center space-x-2 flex-wrap">
                    <h4 className="font-black text-slate-900 dark:text-slate-100 text-base sm:text-lg tracking-tight">
                      Agenda &amp; Prioritas: {formatIndonesianDate(isDateModalOpen)}
                    </h4>
                    {isModalDateToday && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 animate-pulse">
                        HARI INI
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {modalCounts.total} Tugas Operasional ({modalCounts.kritis} Kritis, {modalCounts.tinggi} Tinggi)
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsDateModalOpen(null)} 
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center transition cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>

            {/* Modal Date Stepper & Quick Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700">
              <div className="inline-flex items-center space-x-1 bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setIsDateModalOpen(addDaysToDateStr(isDateModalOpen, -1))}
                  className="px-2.5 py-1 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition cursor-pointer"
                >
                  <i className="fa-solid fa-chevron-left text-[10px] mr-1"></i> Kemarin
                </button>
                <button
                  type="button"
                  onClick={() => setIsDateModalOpen(realToday)}
                  className="px-2.5 py-1 text-emerald-700 dark:text-emerald-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition cursor-pointer font-bold"
                >
                  Hari Ini
                </button>
                <button
                  type="button"
                  onClick={() => setIsDateModalOpen(addDaysToDateStr(isDateModalOpen, 1))}
                  className="px-2.5 py-1 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition cursor-pointer"
                >
                  Besok <i className="fa-solid fa-chevron-right text-[10px] ml-1"></i>
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const vacant = rooms.find(r => r.status === 'KOSONG' && r.building !== 'Ruang Pertemuan') || rooms[0];
                    if (vacant) {
                      setIsDateModalOpen(null);
                      openModal('modalCheckin', { roomId: vacant.id, actionType: 'BOOKING', initialDate: isDateModalOpen });
                    }
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-2xs transition cursor-pointer flex items-center gap-1"
                >
                  <i className="fa-solid fa-plus text-[10px]"></i>
                  <span>Booking Kamar</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const aula = rooms.find(r => r.building === 'Ruang Pertemuan') || rooms[rooms.length - 1];
                    if (aula) {
                      setIsDateModalOpen(null);
                      openModal('modalCheckin', { roomId: aula.id, actionType: 'BOOKING', initialDate: isDateModalOpen, initialDuration: 8 });
                    }
                  }}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-2xs transition cursor-pointer flex items-center gap-1"
                >
                  <i className="fa-solid fa-landmark text-[10px]"></i>
                  <span>Sewa Aula</span>
                </button>
              </div>
            </div>

            {/* Urgency & Category Filter Pills */}
            <div className="space-y-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-slate-500 dark:text-slate-400 font-bold mr-1 text-[11px]">Prioritas:</span>
                <button
                  type="button"
                  onClick={() => setModalUrgencyFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${modalUrgencyFilter === 'ALL' ? 'bg-slate-800 text-white shadow-2xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
                >
                  Semua ({modalCounts.total})
                </button>
                <button
                  type="button"
                  onClick={() => setModalUrgencyFilter('KRITIS')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center space-x-1 cursor-pointer ${modalUrgencyFilter === 'KRITIS' ? 'bg-rose-600 text-white shadow-2xs' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                  <span>Kritis ({modalCounts.kritis})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalUrgencyFilter('TINGGI')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center space-x-1 cursor-pointer ${modalUrgencyFilter === 'TINGGI' ? 'bg-amber-600 text-white shadow-2xs' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  <span>Tinggi ({modalCounts.tinggi})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalUrgencyFilter('RENDAH')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center space-x-1 cursor-pointer ${modalUrgencyFilter === 'RENDAH' ? 'bg-emerald-600 text-white shadow-2xs' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>Rendah ({modalCounts.rendah})</span>
                </button>
              </div>

              {/* Category Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1 pt-1 text-[11px] font-semibold">
                {[
                  { key: 'ALL', label: 'Semua', count: modalCounts.total },
                  { key: 'CHECKIN', label: 'Check-In & Booking', count: modalCounts.checkin },
                  { key: 'CHECKOUT', label: 'Check-Out', count: modalCounts.checkout },
                  { key: 'IN_HOUSE', label: 'Tamu Menginap', count: modalCounts.inhouse },
                  { key: 'AULA', label: 'Aula', count: modalCounts.aula },
                  { key: 'BREAKFAST', label: 'Sarapan / Dapur', count: modalCounts.breakfast },
                  { key: 'QC', label: 'QC & Kebersihan', count: modalCounts.qc },
                  { key: 'MAINTENANCE', label: 'Perbaikan Teknisi', count: modalCounts.maint },
                ].map(tab => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setModalCategoryFilter(tab.key)}
                    className={`px-2.5 py-1 rounded-md transition cursor-pointer ${modalCategoryFilter === tab.key ? 'bg-emerald-600 text-white font-bold shadow-2xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
                  >
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>
            </div>

            {/* Agenda Cards Grid in Modal */}
            <div className="space-y-2.5 max-h-[48vh] overflow-y-auto pr-1">
              {modalFilteredAgenda.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 font-medium bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 space-y-1.5">
                  <i className="fa-solid fa-circle-check text-2xl text-emerald-500 mb-1"></i>
                  <div className="font-bold text-slate-800 dark:text-slate-200 text-sm">Tidak Ada Tugas yang Sesuai Filter</div>
                  <p className="text-xs text-slate-500">Seluruh agenda pada tanggal ini sudah beres atau belum ada jadwal.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {modalFilteredAgenda.map(item => {
                    const isKritis = item.urgency === 'KRITIS';
                    const isTinggi = item.urgency === 'TINGGI';
                    const borderClass = isKritis
                      ? 'border-l-4 border-l-rose-600 border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-800'
                      : isTinggi
                        ? 'border-l-4 border-l-amber-500 border-amber-200 dark:border-amber-900/60 bg-white dark:bg-slate-800'
                        : 'border-l-4 border-l-emerald-500 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800';

                    return (
                      <div key={item.id} className={`p-3 rounded-xl border transition flex flex-col justify-between space-y-2 shadow-2xs ${borderClass}`}>
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center space-x-1 ${item.categoryBadgeClass}`}>
                              <i className={`fa-solid ${item.categoryIcon}`}></i>
                              <span>{item.categoryLabel}</span>
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[9.5px] font-black ${
                              isKritis ? 'bg-rose-600 text-white animate-pulse' : isTinggi ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {item.urgency}
                            </span>
                          </div>

                          <div className="flex items-baseline justify-between gap-2">
                            <h5 className="font-black text-slate-900 dark:text-slate-100 text-xs">
                              {item.roomNumber ? `No. ${item.roomNumber}` : item.building}
                            </h5>
                            <span className="text-[10.5px] text-slate-500">{item.building}</span>
                          </div>

                          <p className={`text-[11px] mt-0.5 font-semibold leading-tight ${isKritis ? 'text-rose-700' : isTinggi ? 'text-amber-800' : 'text-slate-600'}`}>
                            {item.urgencyReason}
                          </p>

                          {item.guestName && (
                            <div className="mt-1.5 text-[10.5px] text-slate-600 dark:text-slate-300 truncate font-medium bg-slate-50 dark:bg-slate-900/40 p-1.5 rounded-lg">
                              <i className="fa-solid fa-user text-[9px] text-slate-400 mr-1"></i> {item.guestName}
                              {item.groupName && <span className="text-emerald-600 ml-1">({item.groupName})</span>}
                            </div>
                          )}

                          {item.tx && (item.tx.extraBed || (item.tx.breakfast && (!item.tx.cateringPackage || item.tx.cateringPackage !== 'TIDAK'))) && (
                            <div className="flex flex-wrap items-center gap-1 mt-1.5">
                              {item.tx.extraBed && (
                                <span className="text-[9.5px] px-1.5 py-0.5 rounded font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  +{item.tx.extraBedCount || 1} Bed
                                </span>
                              )}
                              {item.tx.breakfast && (!item.tx.cateringPackage || item.tx.cateringPackage !== 'TIDAK') && (
                                <span className="text-[9.5px] px-1.5 py-0.5 rounded font-bold bg-orange-50 text-orange-700 border border-orange-200">
                                  🍱 {item.tx.breakfastPortions || 1} Porsi
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-1 text-[11px]">
                          {item.category === 'CHECKIN' && item.txId && (
                            <button
                              type="button"
                              onClick={() => {
                                if (activateCheckin) {
                                  activateCheckin(item.roomId || item.txId!, item.txId);
                                  const targetTx = transactions.find(t => t.id === item.txId);
                                  if (targetTx) {
                                    openModal('modalInvoice', { transaction: { ...targetTx, status: 'TERISI' }, room: item.room });
                                  }
                                } else {
                                  openModal('modalCheckin', { roomId: item.roomId, actionType: 'CHECKIN' });
                                }
                              }}
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-bold text-[10.5px] cursor-pointer"
                            >
                              Check-In
                            </button>
                          )}
                          {item.category === 'CHECKOUT' && item.roomId && (
                            <button
                              type="button"
                              onClick={() => {
                                if (checkoutRoom) checkoutRoom(item.roomId, item.txId);
                                else openModal('modalCheckoutSelection', { roomId: item.roomId });
                              }}
                              className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-md font-bold text-[10.5px] cursor-pointer"
                            >
                              Check-Out
                            </button>
                          )}
                          {item.category === 'QC' && item.roomId && (
                            <button
                              type="button"
                              onClick={() => openModal('modalQcInspection', { roomId: item.roomId })}
                              className="px-2 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-bold text-[10.5px] cursor-pointer"
                            >
                              Inspeksi QC
                            </button>
                          )}
                          {item.category === 'MAINTENANCE' && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsDateModalOpen(null);
                                if (setActiveTab) setActiveTab('laporanMaintenance');
                              }}
                              className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md font-bold text-[10.5px] cursor-pointer"
                            >
                              Perbaikan
                            </button>
                          )}

                          <div className="flex items-center space-x-1 ml-auto">
                            {item.phone && (
                              <a href={`https://wa.me/${item.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="px-1.5 py-1 bg-emerald-50 text-emerald-700 rounded text-[10.5px] font-bold" title="WhatsApp">
                                <i className="fa-brands fa-whatsapp"></i>
                              </a>
                            )}
                            {item.tx && item.tx.paymentStatus !== 'LUNAS' && (
                              <button type="button" onClick={() => openModal('modalInvoice', { transaction: item.tx, room: item.room })} className="px-1.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded text-[10.5px] font-bold" title="Invoice">
                                <i className="fa-solid fa-file-invoice"></i>
                              </button>
                            )}
                            {item.tx && item.tx.paymentStatus === 'LUNAS' && (
                              <button type="button" onClick={() => openModal('modalKwitansi', { transaction: item.tx, room: item.room })} className="px-1.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10.5px] font-bold shadow-2xs" title="Kwitansi (Lunas)">
                                <i className="fa-solid fa-receipt text-gold-300"></i>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-500">
                Menampilkan agenda untuk tanggal {formatIndonesianDate(isDateModalOpen)}
              </span>
              <button
                type="button"
                onClick={() => setIsDateModalOpen(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.section>
  );
}
