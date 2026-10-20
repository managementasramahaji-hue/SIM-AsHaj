// @ts-nocheck
import React, { useState, useMemo } from 'react';
import { useAppContext, isKeuanganRole, isSuperAdmin, isRecepRole, isTeknisiRole, isQcRole, isKoperasiRole } from '../store';
import { motion } from 'motion/react';
import { GroupType, Transaction, Room, MeetingRoom } from '../types';
import { addDaysToDateStr, formatIndonesianDate, getRealTodayDate, compareBuildingOrder, isMeetingFacility, formatRupiah, getRoomBuildingKey } from '../lib/utils';
import { findRoomRate } from '../data';
import { useBodyScrollLock } from '../lib/scrollLock';
import { calculateTransactionPricing } from '../lib/pricingCalculator';
import { calculateSystemFinancials } from '../lib/reportExporter';
import { dataStorage } from '../services/dataStorage';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { OperationalStatsSection } from './dashboard/OperationalStatsSection';
import { OperationalAgendaSection } from './dashboard/OperationalAgendaSection';
import { BuildingOccupancySection } from './dashboard/BuildingOccupancySection';
import { GroupManagementSection } from './dashboard/GroupManagementSection';
import { MonthlyReservationCalendar } from './dashboard/MonthlyReservationCalendar';
import { RoleWorkspaceBanner } from './dashboard/RoleWorkspaceBanner';
import { QcWorklistPanel, TechnicianWorklistPanel, FinancialBillingPanel, CateringWorklistPanel } from './dashboard/RoleDedicatedPanels';

interface ConsolidatedAgendaItem {
  id: string;
  isGroup: boolean;
  groupId?: string;
  groupName: string;
  groupType?: GroupType;
  picName?: string;
  picPhone?: string;
  roomNumbers: string[];
  roomIds: string[];
  transactions: Transaction[];
  building: string;
  duration: number;
  startDate: string;
  status: string;
}

function groupAgendaTransactions(txs: Transaction[]): ConsolidatedAgendaItem[] {
  const map: Record<string, ConsolidatedAgendaItem> = {};
  const individuals: ConsolidatedAgendaItem[] = [];

  txs.forEach(tx => {
    let key = '';
    let gName = '';
    let detectedType: GroupType = 'UMUM';

    if (tx.groupId) {
      key = tx.groupId;
      detectedType = tx.groupType || (tx.category === 'JEMAAH' ? 'JEMAAH_HAJI' : 'INSTANSI');
      gName = tx.groupName || tx.guestName;
    } else if (tx.category === 'JEMAAH' && tx.kloter && tx.kloter !== '-') {
      key = `KLOTER-${tx.kloter}`;
      detectedType = 'JEMAAH_HAJI';
      gName = `Jemaah Haji Kloter ${tx.kloter}`;
    } else if (tx.notes && tx.notes.includes('[Rombongan:')) {
      const match = tx.notes.match(/\[Rombongan:\s*([^\]]+)\]/);
      gName = match ? match[1] : tx.guestName;
      key = `GRP-${gName.replace(/\s+/g, '-').toUpperCase()}`;
      detectedType = tx.groupType || 'UMUM';
    } else if (tx.groupName && tx.groupName.trim() !== '' && tx.groupName !== tx.guestName) {
      gName = tx.groupName;
      key = `GRP-${gName.replace(/\s+/g, '-').toUpperCase()}`;
      detectedType = tx.groupType || 'UMUM';
    } else if (tx.isGroup || tx.guestType === 'ROMBONGAN' || (tx.allocatedRoomNumbers && tx.allocatedRoomNumbers.length > 1)) {
      gName = tx.groupName || tx.guestName;
      key = `GRP-${gName.replace(/\s+/g, '-').toUpperCase()}`;
      detectedType = tx.groupType || 'UMUM';
    }

    if (key) {
      if (!map[key]) {
        map[key] = {
          id: key,
          isGroup: true,
          groupId: key,
          groupName: gName,
          groupType: detectedType,
          picName: tx.groupPic || tx.phone || '-',
          picPhone: tx.phone || '-',
          roomNumbers: [],
          roomIds: [],
          transactions: [],
          building: tx.building,
          duration: tx.duration,
          startDate: tx.startDate,
          status: tx.status
        };
      }
      map[key].transactions.push(tx);
      if (!map[key].roomNumbers.includes(tx.roomNumber)) {
        map[key].roomNumbers.push(tx.roomNumber);
      }
      if (!map[key].roomIds.includes(tx.roomId)) {
        map[key].roomIds.push(tx.roomId);
      }
    } else {
      individuals.push({
        id: tx.id,
        isGroup: false,
        groupName: tx.guestName,
        picName: tx.phone || '-',
        picPhone: tx.phone || '-',
        roomNumbers: [tx.roomNumber],
        roomIds: [tx.roomId],
        transactions: [tx],
        building: tx.building,
        duration: tx.duration,
        startDate: tx.startDate,
        status: tx.status
      });
    }
  });

  // Accurately determine consolidated status for each group item
  Object.values(map).forEach(grp => {
    if (grp.transactions.some(t => t.status === 'TERISI')) {
      grp.status = 'TERISI';
    } else if (grp.transactions.some(t => t.status === 'BOOKED')) {
      grp.status = 'BOOKED';
    } else if (grp.transactions.every(t => t.status === 'DIBATALKAN')) {
      grp.status = 'DIBATALKAN';
    } else if (grp.transactions.every(t => t.status === 'SELESAI')) {
      grp.status = 'SELESAI';
    }
  });

  return [...Object.values(map), ...individuals];
}

export function Dashboard() {
  const { 
    rooms, 
    transactions, 
    openModal, 
    maintenances, 
    qcInspections, 
    auditLogs, 
    setActiveTab, 
    buildings,
    meetingRooms = [],
    roomCapacityRates = [],
    setSelectedBuilding,
    currentUser, 
    updateBreakfastStatus, 
    showToast, 
    batchCheckinGroup, 
    batchCheckoutGroup,
    batchCancelGroup,
    activateCheckin,
    checkoutRoom,
    cancelBooking,
    breakfastOrders = [],
    breakfastMenuItems = []
  } = useAppContext();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [facilityFilter, setFacilityFilter] = useState<'ALL' | 'KAMAR' | 'AULA'>('ALL');
  const [groupTabFilter, setGroupTabFilter] = useState<'ALL' | 'JEMAAH_HAJI' | 'UMUM' | 'INSTANSI'>('ALL');
  const [groupSortBy, setGroupSortBy] = useState<'DATE' | 'ROOMS' | 'NAME'>('DATE');
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [isRombonganSectionOpen, setIsRombonganSectionOpen] = useState(true);
  const [activeChartPopup, setActiveChartPopup] = useState<'PIE' | 'MAINT_TREND' | 'SYSTEM_TREND' | null>(null);
  useBodyScrollLock(Boolean(activeChartPopup));
  const [agendaFilter, setAgendaFilter] = useState<'ALL' | 'CHECKIN' | 'CHECKOUT' | 'QC' | 'BREAKFAST' | 'MAINTENANCE' | 'AULA' | 'SPECIAL'>('ALL');

  const realToday = getRealTodayDate();

  // Role detection for tailored operational dashboard
  const userRole = currentUser?.role || 'Resepsionis';
  const isSuperAdminUser = isSuperAdmin(userRole);
  const isKeuanganUser = isKeuanganRole(userRole, currentUser?.department);
  const isTeknisiUser = isTeknisiRole(userRole);
  const isQcUser = isQcRole(userRole);
  const isKoperasiUser = isKoperasiRole(userRole);
  const isResepsionisUser = isRecepRole(userRole);

  const defaultPerspective: 'ALL' | 'RESEPSIONIS' | 'KEUANGAN' | 'TEKNISI' | 'QC' | 'KOPERASI' = 
    isKeuanganUser ? 'KEUANGAN' :
    isTeknisiUser ? 'TEKNISI' :
    isQcUser ? 'QC' :
    isKoperasiUser ? 'KOPERASI' :
    isResepsionisUser ? 'RESEPSIONIS' : 'ALL';

  const [activePerspective, setActivePerspective] = useState<'ALL' | 'RESEPSIONIS' | 'KEUANGAN' | 'TEKNISI' | 'QC' | 'KOPERASI'>(defaultPerspective);

  // Perhitungan Keuangan & PNBP untuk Tampilan Akun Keuangan & Pimpinan (100% Sinkron dengan Laporan & Kwitansi)
  const financialStats = useMemo(() => {
    return calculateSystemFinancials(transactions, rooms, {
      roomCapacityRates,
      meetingRooms,
      breakfastMenuItems,
      realToday
    });
  }, [transactions, rooms, roomCapacityRates, meetingRooms, breakfastMenuItems, realToday]);

  // Perhitungan Katering & Konsumsi untuk Tampilan Akun Koperasi
  const cateringStats = useMemo(() => {
    const todayOrders = breakfastOrders.filter(o => o.startDate === realToday || !o.startDate);
    const waitingOrders = todayOrders.filter(o => o.status === 'MENUNGGU');
    const cookingOrders = todayOrders.filter(o => o.status === 'SEDANG_DIBUAT');
    const deliveringOrders = todayOrders.filter(o => o.status === 'PENGANTARAN');
    const completedOrders = todayOrders.filter(o => o.status === 'SELESAI');
    const totalPortions = todayOrders.reduce((acc, o) => acc + (o.portions || 1), 0);

    return {
      todayOrders,
      waitingOrders,
      cookingOrders,
      deliveringOrders,
      completedOrders,
      totalPortions
    };
  }, [breakfastOrders, realToday]);

  // Metrics for Rooms & Aula
  const kamarRooms = rooms.filter(r => r.building !== 'Ruang Pertemuan' && !isMeetingFacility(r.building) && !r.type?.toLowerCase().includes('pertemuan') && !r.type?.toLowerCase().includes('aula'));
  const totalKamar = kamarRooms.length;
  const terisiKamar = kamarRooms.filter(r => r.status === 'TERISI').length;
  const bookedKamar = kamarRooms.filter(r => r.status === 'BOOKED').length;
  const maintKamar = kamarRooms.filter(r => r.status === 'MAINTENANCE').length;
  const kosongKamar = kamarRooms.filter(r => r.status === 'KOSONG').length;
  const occupancyPercent = totalKamar > 0 ? Math.round((terisiKamar / totalKamar) * 100) : 0;

  const aulaRooms = rooms.filter(r => r.building === 'Ruang Pertemuan' || isMeetingFacility(r.building) || r.type?.toLowerCase().includes('pertemuan') || r.type?.toLowerCase().includes('aula'));
  const totalAula = aulaRooms.length;
  const aulaTerisi = aulaRooms.filter(r => r.status === 'TERISI' || r.status === 'BOOKED').length;

  // Active Guests Calculation
  const activeTransactions = transactions.filter(tx => tx.status === 'TERISI');
  const jemaahCount = activeTransactions.filter(tx => tx.category === 'JEMAAH').length;
  const umumCount = activeTransactions.filter(tx => tx.category === 'UMUM').length;

  // Today's Operations
  // 1. Check-In Hari Ini & Tertunda (Kamar Penginapan yang belum check-in)
  const checkinTodayList = useMemo(() => {
    return transactions
      .filter(tx => {
        return (
          tx.building !== 'Ruang Pertemuan' &&
          tx.status === 'BOOKED' &&
          tx.startDate <= realToday
        );
      })
      .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
  }, [transactions, realToday]);

  // Set ID kamar yang ada jadwal kedatangan check-in hari ini
  const incomingCheckinRoomIds = useMemo(() => {
    return new Set(checkinTodayList.map(tx => tx.roomId));
  }, [checkinTodayList]);

  // Acara Ruang Pertemuan (Aula) Terlaksana Hari Ini / Sedang Berlangsung (Multi-day & Single-day)
  const aulaEventsToday = useMemo(() => {
    return transactions
      .filter(tx => {
        if (tx.status === 'DIBATALKAN') return false;
        const isAulaRoom = tx.building === 'Ruang Pertemuan';
        const hasLinkedAula = Boolean(tx.rentAulaId || tx.rentAulaName);
        if (!isAulaRoom && !hasLinkedAula) return false;

        const isMultiDay = tx.durationUnit === 'Hari' || tx.duration >= 24;
        if (isMultiDay) {
          const days = tx.durationUnit === 'Hari' ? tx.duration : Math.ceil(tx.duration / 24);
          const endDate = addDaysToDateStr(tx.startDate, days);
          return realToday >= tx.startDate && realToday <= endDate;
        }
        return tx.startDate === realToday || tx.status === 'TERISI';
      })
      .sort((a, b) => (a.roomNumber || '').localeCompare(b.roomNumber || '', undefined, { numeric: true }));
  }, [transactions, realToday]);

  // 2. Check-Out Hari Ini & Melewati Waktu Sewa (Overdue)
  const checkoutTodayList = useMemo(() => {
    return transactions
      .filter(tx => {
        if (tx.status !== 'TERISI') return false;
        if (tx.building === 'Ruang Pertemuan') return false;
        const checkoutDate = addDaysToDateStr(tx.startDate, tx.duration);
        return checkoutDate <= realToday;
      })
      .sort((a, b) => {
        const dateA = addDaysToDateStr(a.startDate, a.duration) || '';
        const dateB = addDaysToDateStr(b.startDate, b.duration) || '';
        return (dateA || '').localeCompare(dateB || '');
      });
  }, [transactions, realToday]);

  // Consolidated Agenda Items (Grouped Rombongan & Individuals)
  const checkinAgendaItems = useMemo(() => {
    return groupAgendaTransactions(checkinTodayList);
  }, [checkinTodayList]);

  const checkoutAgendaItems = useMemo(() => {
    return groupAgendaTransactions(checkoutTodayList);
  }, [checkoutTodayList]);

  // 3. Breakfast Orders Aktif Hari Ini (Hanya untuk tamu aktif / check-in hari ini yang belum selesai diantar)
  const activeBreakfastList = useMemo(() => {
    return transactions
      .filter(tx => {
        if (tx.status === 'DIBATALKAN' || tx.breakfastStatus === 'DIBATALKAN') return false;
        const isActive = tx.status === 'TERISI' || (tx.status === 'BOOKED' && tx.startDate <= realToday);
        if (!isActive) return false;
        const hasBreakfast = Boolean(tx.breakfast) && (!tx.cateringPackage || tx.cateringPackage !== 'TIDAK');
        if (!hasBreakfast) return false;
        return tx.breakfastStatus !== 'SELESAI';
      })
      .sort((a, b) => {
        const priority: Record<string, number> = { 'SEDANG_DIBUAT': 1, 'PENGANTARAN': 2, 'MENUNGGU': 3 };
        const pA = priority[a.breakfastStatus || 'MENUNGGU'] || 4;
        const pB = priority[b.breakfastStatus || 'MENUNGGU'] || 4;
        return pA - pB;
      });
  }, [transactions, realToday]);

  const totalBreakfastPortions = useMemo(() => {
    return activeBreakfastList.reduce((acc, tx) => acc + (Number(tx.breakfastPortions) || 1), 0);
  }, [activeBreakfastList]);

  // 4. Maintenance Issues
  const urgentMaintenances = useMemo(() => {
    return maintenances.filter(m => m.status !== 'SELESAI' && m.urgency === 'Urgent');
  }, [maintenances]);
  const activeMaintenances = useMemo(() => {
    return maintenances.filter(m => m.status !== 'SELESAI');
  }, [maintenances]);

  // 5. QC & Housekeeping Ready Status
  const readyQcRooms = rooms.filter(r => r.qcStatus === 'LOLOS_QC').length;
  const waitingQcRooms = rooms.filter(r => r.qcStatus === 'MENUNGGU_QC').length;
  const inspectionNeededRooms = rooms.filter(r => !r.qcStatus || r.qcStatus === 'PERLU_INSPEKSI').length;

  // Kamar yang perlu disiapkan / dibersihkan / diperiksa QC
  // Diurutkan berdasarkan urgensi operasional nyata:
  // 1) Kamar yang ada jadwal kedatangan tamu check-in HARI INI (Mendesak!)
  // 2) Kamar berstatus MENUNGGU_QC (teknisi selesai, butuh approval QC untuk siap huni)
  // 3) Kamar berstatus PERLU_PERBAIKAN / REVISI_PERBAIKAN
  // 4) Kamar kosong belum diinspeksi
  const qcNeedAttentionRooms = useMemo(() => {
    const raw = rooms.filter(r => {
      if (r.building === 'Ruang Pertemuan') return false;
      // Kamar terisi tidak masuk antrean pembersihan check-in kecuali berstatus MENUNGGU_QC / PERLU_INSPEKSI
      if (r.status === 'TERISI' && r.qcStatus !== 'MENUNGGU_QC' && r.qcStatus !== 'PERLU_INSPEKSI') return false;
      // Kamar dalam perbaikan aktif teknisi belum diserahkan ke QC
      if (r.status === 'MAINTENANCE' && r.qcStatus !== 'MENUNGGU_QC') return false;

      return (
        r.qcStatus === 'MENUNGGU_QC' || 
        r.qcStatus === 'PERLU_INSPEKSI' || 
        !r.qcStatus || 
        r.qcStatus === 'PERLU_PERBAIKAN' ||
        r.qcStatus === 'REVISI_PERBAIKAN' ||
        (r.status === 'KOSONG' && r.qcStatus !== 'LOLOS_QC') ||
        (incomingCheckinRoomIds.has(r.id) && r.qcStatus !== 'LOLOS_QC')
      );
    });

    return raw.sort((a, b) => {
      const aCheckin = incomingCheckinRoomIds.has(a.id);
      const bCheckin = incomingCheckinRoomIds.has(b.id);
      if (aCheckin && !bCheckin) return -1;
      if (!aCheckin && bCheckin) return 1;

      if (a.qcStatus === 'MENUNGGU_QC' && b.qcStatus !== 'MENUNGGU_QC') return -1;
      if (a.qcStatus !== 'MENUNGGU_QC' && b.qcStatus === 'MENUNGGU_QC') return 1;

      if (a.qcStatus === 'PERLU_PERBAIKAN' && b.qcStatus !== 'PERLU_PERBAIKAN') return -1;
      if (a.qcStatus !== 'PERLU_PERBAIKAN' && b.qcStatus === 'PERLU_PERBAIKAN') return 1;

      return (a.roomNumber || '').localeCompare(b.roomNumber || '', undefined, { numeric: true });
    });
  }, [rooms, incomingCheckinRoomIds]);

  // Kamar kosong yang sudah bersih & lolos QC (siap langsung huni)
  const readyCleanRooms = useMemo(() => {
    return rooms.filter(r => r.building !== 'Ruang Pertemuan' && r.status === 'KOSONG' && r.qcStatus === 'LOLOS_QC');
  }, [rooms]);

  // Daftar permintaan khusus tamu (Extra Bed & catatan khusus)
  // Menangkap tamu yang sedang menginap (TERISI) maupun yang akan check-in hari ini (BOOKED)
  const specialRequestsList = useMemo(() => {
    return transactions
      .filter(tx => {
        const isRelevant = tx.status === 'TERISI' || (tx.status === 'BOOKED' && tx.startDate <= realToday);
        if (!isRelevant) return false;
        const hasExtraBed = Boolean(tx.extraBed);
        const cleanNotes = (tx.notes || '').trim();
        const hasNotes = Boolean(cleanNotes && cleanNotes !== '-' && !cleanNotes.startsWith('[Rombongan:') && !cleanNotes.toLowerCase().includes('extend'));
        return hasExtraBed || hasNotes;
      })
      .sort((a, b) => {
        const aExtra = Boolean(a.extraBed);
        const bExtra = Boolean(b.extraBed);
        if (aExtra && !bExtra) return -1;
        if (!aExtra && bExtra) return 1;
        return (a.roomNumber || '').localeCompare(b.roomNumber || '', undefined, { numeric: true });
      });
  }, [transactions, realToday]);

  // Urutan maintenance: Urgent terlebih dahulu, kemudian kamar yang berdampak ke tamu hari ini
  const sortedMaintenances = useMemo(() => {
    return [...activeMaintenances].sort((a, b) => {
      if (a.urgency === 'Urgent' && b.urgency !== 'Urgent') return -1;
      if (a.urgency !== 'Urgent' && b.urgency === 'Urgent') return 1;
      const aImpact = incomingCheckinRoomIds.has(a.roomId);
      const bImpact = incomingCheckinRoomIds.has(b.roomId);
      if (aImpact && !bImpact) return -1;
      if (!aImpact && bImpact) return 1;
      return 0;
    });
  }, [activeMaintenances, incomingCheckinRoomIds]);

  // 6. Active Kloters Summary
  const activeKloters = useMemo(() => {
    const map: Record<string, { kloter: string; guestName: string; rooms: string[]; jemaahCount: number; startDate: string; duration: number }> = {};
    activeTransactions.forEach(tx => {
      if (tx.category === 'JEMAAH' && tx.kloter) {
        if (!map[tx.kloter]) {
          map[tx.kloter] = {
            kloter: tx.kloter,
            guestName: tx.guestName,
            rooms: [],
            jemaahCount: 0,
            startDate: tx.startDate,
            duration: tx.duration,
          };
        }
        map[tx.kloter].rooms.push(tx.roomNumber);
        map[tx.kloter].jemaahCount += 4; // Standard 4 bed per room
      }
    });
    return Object.values(map);
  }, [activeTransactions]);

  // 6. Comprehensive Group Bookings (Jemaah Haji, Tamu Umum, & Instansi)
  const allGroups = useMemo(() => {
    const map: Record<string, {
      id: string;
      groupName: string;
      groupType: GroupType;
      picName: string;
      picPhone: string;
      roomNumbers: string[];
      roomIds: string[];
      meetingRooms: string[];
      memberCount: number;
      startDate: string;
      duration: number;
      status: string;
      breakfast: boolean;
      extraBed: boolean;
      transactions: Transaction[];
    }> = {};

    transactions.forEach(tx => {
      let key = '';
      let detectedType: GroupType = 'UMUM';
      let gName = '';
      let pic = tx.groupPic || tx.phone || '-';

      if (tx.groupId) {
        key = tx.groupId;
        detectedType = tx.groupType || (tx.category === 'JEMAAH' ? 'JEMAAH_HAJI' : 'INSTANSI');
        gName = tx.groupName || tx.guestName;
      } else if (tx.category === 'JEMAAH' && tx.kloter && tx.kloter !== '-') {
        key = `KLOTER-${tx.kloter}`;
        detectedType = 'JEMAAH_HAJI';
        gName = `Jemaah Haji Kloter ${tx.kloter}`;
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
            groupName: gName,
            groupType: detectedType,
            picName: pic,
            picPhone: tx.phone || '-',
            roomNumbers: [],
            roomIds: [],
            meetingRooms: [],
            memberCount: 0,
            startDate: tx.startDate,
            duration: tx.duration,
            status: tx.status,
            breakfast: false,
            extraBed: false,
            transactions: []
          };
        }
        map[key].transactions.push(tx);
        if (tx.building === 'Ruang Pertemuan') {
          if (!map[key].meetingRooms.includes(tx.roomNumber)) {
            map[key].meetingRooms.push(tx.roomNumber);
          }
        } else {
          if (!map[key].roomNumbers.includes(tx.roomNumber)) {
            map[key].roomNumbers.push(tx.roomNumber);
            map[key].roomIds.push(tx.roomId);
            map[key].memberCount += 4; // standard 4 beds per room
          }
        }
        if (tx.breakfast) map[key].breakfast = true;
        if (tx.extraBed) map[key].extraBed = true;
      }
    });

    // Compute consolidated status for each group so DIBATALKAN or SELESAI groups remain visible with correct badge
    Object.values(map).forEach(group => {
      if (group.transactions.some(t => t.status === 'TERISI')) {
        group.status = 'TERISI';
      } else if (group.transactions.some(t => t.status === 'BOOKED')) {
        group.status = 'BOOKED';
      } else if (group.transactions.every(t => t.status === 'DIBATALKAN')) {
        group.status = 'DIBATALKAN';
      } else if (group.transactions.every(t => t.status === 'SELESAI')) {
        group.status = 'SELESAI';
      }
    });

    return Object.values(map);
  }, [transactions]);

  // Filtered Groups for Dashboard Section
  const filteredGroups = useMemo(() => {
    let list = [...allGroups];
    if (groupTabFilter !== 'ALL') {
      list = list.filter(g => g.groupType === groupTabFilter);
    }
    if (groupSearchQuery.trim()) {
      const q = groupSearchQuery.toLowerCase();
      list = list.filter(g => 
        (g.groupName && g.groupName.toLowerCase().includes(q)) ||
        (g.picName && g.picName.toLowerCase().includes(q)) ||
        (g.picPhone && g.picPhone.includes(q)) ||
        g.roomNumbers.some(rn => rn.toLowerCase().includes(q)) ||
        (g.meetingRooms && g.meetingRooms.some(mr => mr.toLowerCase().includes(q)))
      );
    }
    if (groupSortBy === 'DATE') {
      list.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
    } else if (groupSortBy === 'ROOMS') {
      list.sort((a, b) => b.roomNumbers.length - a.roomNumbers.length);
    } else if (groupSortBy === 'NAME') {
      list.sort((a, b) => (a.groupName || '').localeCompare(b.groupName || ''));
    }
    return list;
  }, [allGroups, groupTabFilter, groupSearchQuery, groupSortBy]);

  const hajiGroupsCount = useMemo(() => allGroups.filter(g => g.groupType === 'JEMAAH_HAJI').length, [allGroups]);
  const umumGroupsCount = useMemo(() => allGroups.filter(g => g.groupType === 'UMUM').length, [allGroups]);
  const instansiGroupsCount = useMemo(() => allGroups.filter(g => g.groupType === 'INSTANSI').length, [allGroups]);
  const totalGroupRooms = useMemo(() => allGroups.reduce((acc, g) => acc + g.roomNumbers.length, 0), [allGroups]);

  // Role-Specific Tailored Datasets
  // For QC: Rooms waiting for QC inspection (vacant or just checked-out)
  const qcPendingRoomsList = useMemo(() => {
    return rooms.filter(r => r.building !== 'Ruang Pertemuan' && (r.qcStatus === 'MENUNGGU_QC' || r.qcStatus === 'PERLU_INSPEKSI' || !r.qcStatus)).slice(0, 4);
  }, [rooms]);

  // For Teknisi: Urgent and active maintenance tickets
  const teknisiWorkList = useMemo(() => {
    return maintenances.filter(m => m.status !== 'SELESAI').slice(0, 4);
  }, [maintenances]);

  // 7-Day Maintenance Trend Data for Recharts Bar Chart (Murni berdasarkan data riil operasional)
  const last7DaysMaintenanceData = useMemo(() => {
    const days: { dateStr: string; displayDate: string; Selesai: number; Proses: number; Total: number }[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
      const displayDate = `${dayNames[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;

      const dayMaints = (maintenances || []).filter(m => {
        if (!m.reportTime) return false;
        return m.reportTime.includes(dateStr) || m.reportTime.includes(`${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`);
      });

      const selesaiCount = dayMaints.filter(m => m.status === 'SELESAI').length;
      const prosesCount = dayMaints.filter(m => m.status !== 'SELESAI').length;

      days.push({
        dateStr,
        displayDate,
        Selesai: selesaiCount,
        Proses: prosesCount,
        Total: selesaiCount + prosesCount
      });
    }
    return days;
  }, [maintenances]);

  // System Health & Quality Index metrics for Tren & Mutu Sistem
  // Berapapun kamar atau ruang pertemuan yang terdaftar, persentase akhir selalu akurat dan maksimal 100%
  const totalRegisteredUnits = rooms.length;
  // Unit yang siap dan tidak terkendala perbaikan / gagal inspeksi
  const faultyRooms = rooms.filter(r => r.status === 'MAINTENANCE' || r.qcStatus === 'PERLU_PERBAIKAN').length;
  const qcPassRate = totalRegisteredUnits > 0 
    ? Math.min(100, Math.max(0, Math.round(((totalRegisteredUnits - faultyRooms) / totalRegisteredUnits) * 100))) 
    : 100;
  const facilityHealthRate = totalRegisteredUnits > 0 
    ? Math.min(100, Math.max(0, Math.round(((totalRegisteredUnits - maintKamar) / totalRegisteredUnits) * 100))) 
    : 100;
  const maintResolvedRate = useMemo(() => {
    // Jika tidak ada tiket perawatan aktif yang tertunda, maka kepatuhan SLA dan capaian penanganan adalah 100%
    if (activeMaintenances.length === 0) return 100;
    const totalMaint = (maintenances || []).length;
    const resolvedMaint = (maintenances || []).filter(m => m.status === 'SELESAI').length;
    return totalMaint > 0 ? Math.min(100, Math.max(0, Math.round((resolvedMaint / totalMaint) * 100))) : 100;
  }, [maintenances, activeMaintenances]);

  // Ketika seluruh kamar dalam kondisi prima, tidak ada kerusakan aktif, dan seluruh SOP QC terpenuhi,
  // maka Indeks Mutu Operasional tercapai 100% sempurna
  const systemHealthScore = Math.min(100, Math.max(0, Math.round(
    (qcPassRate * 0.4) + (facilityHealthRate * 0.4) + (maintResolvedRate * 0.2)
  )));

  // Building Occupancy Breakdown - Synchronized with Master Catalog & RoomsView Order
  const buildingsList = useMemo(() => {
    // 1. Gather all unique buildings from dynamic catalog and rooms
    const catalogBuildingNames = (buildings || []).map(b => b.name);
    const roomBuildingNames = Array.from(new Set(rooms.map(r => r.building))).filter(Boolean);
    const combinedNames = Array.from(new Set([...catalogBuildingNames, ...roomBuildingNames]));

    // Separate residential buildings from meeting / multipurpose facilities
    const regularBuildings = combinedNames.filter(name => 
      !isMeetingFacility(name) && 
      !name.toLowerCase().includes('serbaguna') && 
      !name.toLowerCase().includes('sg') &&
      !name.toLowerCase().includes('pertemuan') &&
      !name.toLowerCase().includes('aula')
    );
    
    // Sort regular buildings using compareBuildingOrder
    regularBuildings.sort((a, b) => compareBuildingOrder(a, b));

    const result = regularBuildings.map(name => {
      let icon = 'fa-building';
      let color = 'blue';
      const lower = name.toLowerCase();
      if (lower.includes('arafah') || lower === 'gedung a' || lower.startsWith('gedung a ')) { icon = 'fa-kaaba'; color = 'emerald'; }
      else if (lower.includes('muzdalifah') || lower === 'gedung b' || lower.startsWith('gedung b ')) { icon = 'fa-mosque'; color = 'blue'; }
      else if (lower.includes('mina') || lower === 'gedung c' || lower.startsWith('gedung c ')) { icon = 'fa-tents'; color = 'teal'; }
      else if (lower.includes('madinah') || lower.startsWith('gedung d')) { icon = 'fa-archway'; color = 'amber'; }
      return {
        name,
        shortName: name,
        icon,
        color
      };
    });

    // If there were no regular buildings found, provide default 4
    if (result.length === 0) {
      result.push(
        { name: 'Gedung A', shortName: 'Gedung A', icon: 'fa-kaaba', color: 'emerald' },
        { name: 'Gedung B', shortName: 'Gedung B', icon: 'fa-mosque', color: 'blue' },
        { name: 'Gedung C', shortName: 'Gedung C', icon: 'fa-tents', color: 'teal' },
        { name: 'Gedung D1', shortName: 'Gedung D1', icon: 'fa-archway', color: 'amber' },
      );
    }

    // Entri representatif untuk Gedung Serbaguna (SG)
    result.push({
      name: 'Gedung Serbaguna (SG)',
      shortName: 'Gedung Serbaguna (SG)',
      icon: 'fa-building-columns',
      color: 'amber'
    });

    // Entri representatif untuk Ruang Pertemuan / Aula
    result.push({
      name: 'Ruang Pertemuan / Aula',
      shortName: 'Ruang Pertemuan / Aula',
      icon: 'fa-landmark',
      color: 'purple'
    });

    return result;
  }, [buildings, rooms]);

  const buildingStats = useMemo(() => {
    // Helper untuk klasifikasi Serbaguna (SG) vs Ruang Pertemuan / Aula identik dengan RoomsView
    const isMeetingRoomSG = (m: MeetingRoom): boolean => {
      if (m.category === 'AULA' || m.category === 'RUANG_PERTEMUAN') return false;
      if (m.category === 'SERBAGUNA') return true;
      const nLower = (m.name || '').toLowerCase().trim();
      const cLower = (m.code || '').toLowerCase().trim();
      const bLower = (m.building || '').toLowerCase().trim();
      if (nLower.startsWith('ruang pertemuan') || nLower.startsWith('aula') || nLower.startsWith('auditorium') || nLower.startsWith('ruang rapat') || nLower.startsWith('ruang vip')) {
        return false;
      }
      return (
        nLower.includes('serbaguna') || 
        nLower.includes('multipurpose') || 
        nLower.startsWith('gedung sg') || 
        nLower.startsWith('sg-') || 
        cLower === 'mp' || 
        cLower === 'sg-1' || 
        cLower === 'sg-2' ||
        bLower.includes('serbaguna')
      );
    };

    const isRoomSG = (r: Room): boolean => {
      const matchingMr = (meetingRooms || []).find(m => m.id === r.id || m.name.toLowerCase() === r.roomNumber.toLowerCase());
      if (matchingMr) return isMeetingRoomSG(matchingMr);
      const bLower = (r.building || '').toLowerCase();
      const tLower = (r.type || '').toLowerCase();
      const numLower = (r.roomNumber || '').toLowerCase();
      return bLower.includes('serbaguna') || bLower.includes('sg') || tLower.includes('serbaguna') || tLower.includes('sg') || numLower.includes('sg-') || numLower.includes('multipurpose');
    };

    const isRoomAula = (r: Room): boolean => {
      if (isRoomSG(r)) return false;
      const matchingMr = (meetingRooms || []).find(m => m.id === r.id || m.name.toLowerCase() === r.roomNumber.toLowerCase());
      if (matchingMr) return !isMeetingRoomSG(matchingMr);
      const bLower = (r.building || '').toLowerCase();
      const tLower = (r.type || '').toLowerCase();
      return bLower.includes('pertemuan') || bLower.includes('aula') || tLower.includes('pertemuan') || tLower.includes('aula') || isMeetingFacility(r.building) || isMeetingFacility(r.type);
    };

    return buildingsList.map(b => {
      const isSG = b.name === 'Gedung Serbaguna (SG)' || b.name.includes('Serbaguna');
      const isAula = b.name === 'Ruang Pertemuan / Aula' || (!isSG && (b.name.includes('Pertemuan') || b.name.includes('Aula') || isMeetingFacility(b.name)));

      let bRooms: Room[] = [];
      if (isSG) {
        bRooms = rooms.filter(r => getRoomBuildingKey(r, meetingRooms) === 'Gedung Serbaguna (SG)' || isRoomSG(r));
      } else if (isAula) {
        bRooms = rooms.filter(r => getRoomBuildingKey(r, meetingRooms) === 'Ruang Pertemuan / Aula' || isRoomAula(r));
      } else {
        bRooms = rooms.filter(r => {
          const rBldKey = getRoomBuildingKey(r, meetingRooms);
          if (rBldKey.toLowerCase() === b.name.toLowerCase()) return true;
          return false;
        });
      }

      const catalogInfo = (buildings || []).find(bld => bld.name.toLowerCase() === b.name.toLowerCase());
      const fallbackTotal = isSG 
        ? ((meetingRooms || []).filter(isMeetingRoomSG).length || 3)
        : isAula 
          ? ((meetingRooms || []).filter(m => !isMeetingRoomSG(m)).length || 10)
          : (catalogInfo?.totalRooms || 0);

      const total = bRooms.length > 0 ? bRooms.length : fallbackTotal;
      const occupied = bRooms.filter(r => r.status === 'TERISI').length;
      const reserved = bRooms.filter(r => r.status === 'BOOKED').length;
      const maintenance = bRooms.filter(r => r.status === 'MAINTENANCE').length;
      const vacant = bRooms.length > 0 
        ? bRooms.filter(r => r.status === 'KOSONG').length 
        : Math.max(0, total - occupied - reserved - maintenance);
      const readyQc = bRooms.filter(r => r.qcStatus === 'LOLOS_QC').length;
      const occPercent = total > 0 ? Math.round((occupied / total) * 100) : 0;

      let minPrice = 0;
      let maxPrice = 0;
      let priceLabel = '';
      let totalPax = 0;
      let capacityDesc = '';

      if (isSG) {
        const sgList = (meetingRooms || []).filter(isMeetingRoomSG);
        const sessionPrice = sgList[0]?.sessionRate || 8500000;
        const dailyPrice = sgList[0]?.dailyRate || 15000000;
        minPrice = sessionPrice;
        maxPrice = dailyPrice;
        priceLabel = `Sesi: ${formatRupiah(sessionPrice)} • Harian: ${formatRupiah(dailyPrice)}`;
        capacityDesc = '800 - 1.500 Orang';
      } else if (isAula) {
        const aulaList = (meetingRooms || []).filter(m => !isMeetingRoomSG(m));
        const sessionPrice = aulaList[0]?.sessionRate || 4500000;
        const dailyPrice = aulaList[0]?.dailyRate || 7500000;
        minPrice = sessionPrice;
        maxPrice = dailyPrice;
        priceLabel = `Sesi: ${formatRupiah(sessionPrice)} • Harian: ${formatRupiah(dailyPrice)}`;
        capacityDesc = '300 - 500 Orang';
      } else {
        const prices = bRooms.map(r => {
          const matched = findRoomRate(r.type, r.bedType, roomCapacityRates);
          return r.pricePerNight || matched?.pricePerNight || 480000;
        });
        if (prices.length > 0) {
          minPrice = Math.min(...prices);
          maxPrice = Math.max(...prices);
          priceLabel = minPrice === maxPrice 
            ? `${formatRupiah(minPrice)}/mlm` 
            : `${formatRupiah(minPrice)} - ${formatRupiah(maxPrice)}/mlm`;
        } else {
          priceLabel = 'Mulai Rp 380.000/mlm';
        }
        totalPax = bRooms.reduce((acc, r) => acc + (r.capacityNumber || 4), 0);
        capacityDesc = `${totalPax} Pax (${total} Kamar)`;
      }

      return {
        ...b,
        total,
        occupied,
        reserved,
        maintenance,
        vacant,
        readyQc,
        occPercent,
        isAula: isSG || isAula,
        minPrice,
        maxPrice,
        priceLabel,
        totalPax,
        capacityDesc
      };
    });
  }, [buildingsList, rooms, buildings, meetingRooms, roomCapacityRates]);

  // Recent audit logs (latest 4)
  const recentLogs = useMemo(() => {
    return (auditLogs || []).slice(0, 4);
  }, [auditLogs]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full space-y-4 sm:space-y-5"
    >
      {/* 0. RUANG KERJA TERPADU SESUAI PERAN AKUN & ZONA TUGAS */}
      <RoleWorkspaceBanner
        currentUser={currentUser}
        activePerspective={activePerspective}
        setActivePerspective={setActivePerspective}
        financialStats={financialStats}
        cateringStats={cateringStats}
        checkinTodayList={checkinTodayList}
        checkoutTodayList={checkoutTodayList}
        qcNeedAttentionRooms={qcNeedAttentionRooms}
        urgentMaintenances={urgentMaintenances}
        activeMaintenances={activeMaintenances}
        readyCleanRooms={readyCleanRooms}
        terisiKamar={terisiKamar}
        totalKamar={totalKamar}
        openModal={openModal}
        setActiveTab={setActiveTab}
        updateBreakfastStatus={updateBreakfastStatus}
        setSelectedBuilding={setSelectedBuilding}
      />

      {/* 1. ANALISIS & INFORMASI STATISTIK SISTEM OPERASIONAL (CHART PIE, BATANG & GRAFIK) */}
      <OperationalStatsSection
        totalKamar={totalKamar}
        terisiKamar={terisiKamar}
        bookedKamar={bookedKamar}
        kosongKamar={kosongKamar}
        maintKamar={maintKamar}
        occupancyPercent={occupancyPercent}
        readyCleanRooms={readyCleanRooms}
        activeMaintenances={activeMaintenances}
        urgentMaintenances={urgentMaintenances}
        totalBreakfastPortions={totalBreakfastPortions}
        activeBreakfastList={activeBreakfastList}
        last7DaysMaintenanceData={last7DaysMaintenanceData}
        maintResolvedRate={maintResolvedRate}
        qcPassRate={qcPassRate}
        facilityHealthRate={facilityHealthRate}
        systemHealthScore={systemHealthScore}
        readyQcRooms={readyQcRooms}
        totalRegisteredUnits={totalRegisteredUnits}
        aulaEventsToday={aulaEventsToday}
        totalAula={totalAula}
        setActiveTab={setActiveTab}
        setActiveChartPopup={setActiveChartPopup}
      />

      {/* 2 & 3: KETERISIAN PER GEDUNG (KIRI) & MANAJEMEN DATA ROMBONGAN (KANAN) - BERDAMPINGAN */}
      <motion.section 
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch"
      >
        {/* PANEL KIRI: Ringkasan Keterisian Per Gedung & Denah Fasilitas */}
        <BuildingOccupancySection
          buildingStats={buildingStats}
          totalKamar={totalKamar}
          terisiKamar={terisiKamar}
          bookedKamar={bookedKamar}
          kosongKamar={kosongKamar}
          maintKamar={maintKamar}
          occupancyPercent={occupancyPercent}
          setSelectedBuilding={setSelectedBuilding}
          setActiveTab={setActiveTab}
          rooms={rooms}
          transactions={transactions}
          maintenances={maintenances}
          onOpenRoomDetail={(roomId) => openModal('modalRoomDetail', { roomId })}
        />

        {/* PANEL KANAN DINAMIS SESUAI KEBUTUHAN AKUN:
            - QC: Antrean Kendali Mutu & Kelaikan Kamar (QC Inspection Worklist)
            - Teknisi: Tiket Perbaikan Fasilitas & Kendala Sarpras
            - Keuangan: Monitoring Piutang & Penagihan Invoice PNBP
            - Koperasi: Worklist Dapur & Distribusi Katering Hari Ini
            - Resepsionis / Super Admin: Registrasi & Manajemen Data Rombongan
        */}
        {(activePerspective === 'QC' || (activePerspective === 'ALL' && isQcUser && !isSuperAdminUser)) ? (
          <QcWorklistPanel
            qcNeedAttentionRooms={qcNeedAttentionRooms}
            readyCleanRooms={readyCleanRooms}
            rooms={rooms}
            openModal={openModal}
            setActiveTab={setActiveTab}
          />
        ) : (activePerspective === 'TEKNISI' || (activePerspective === 'ALL' && isTeknisiUser && !isSuperAdminUser)) ? (
          <TechnicianWorklistPanel
            urgentMaintenances={urgentMaintenances}
            activeMaintenances={activeMaintenances}
            openModal={openModal}
            setActiveTab={setActiveTab}
          />
        ) : (activePerspective === 'KEUANGAN' || (activePerspective === 'ALL' && isKeuanganUser && !isSuperAdminUser)) ? (
          <FinancialBillingPanel
            financialStats={financialStats}
            openModal={openModal}
            setActiveTab={setActiveTab}
          />
        ) : (activePerspective === 'KOPERASI' || (activePerspective === 'ALL' && isKoperasiUser && !isSuperAdminUser)) ? (
          <CateringWorklistPanel
            cateringStats={cateringStats}
            updateBreakfastStatus={updateBreakfastStatus}
            setActiveTab={setActiveTab}
          />
        ) : (
          <GroupManagementSection
            allGroups={allGroups}
            filteredGroups={filteredGroups}
            groupTabFilter={groupTabFilter}
            setGroupTabFilter={setGroupTabFilter}
            groupSortBy={groupSortBy}
            setGroupSortBy={setGroupSortBy}
            groupSearchQuery={groupSearchQuery}
            setGroupSearchQuery={setGroupSearchQuery}
            hajiGroupsCount={hajiGroupsCount}
            umumGroupsCount={umumGroupsCount}
            instansiGroupsCount={instansiGroupsCount}
            totalGroupRooms={totalGroupRooms}
            rooms={rooms}
            openModal={openModal}
            batchCheckinGroup={batchCheckinGroup}
            batchCheckoutGroup={batchCheckoutGroup}
            batchCancelGroup={batchCancelGroup}
          />
        )}
      </motion.section>

      {/* 4. KALENDER RESERVASI & AGENDA OPERASIONAL TERPADU 
          (Khusus untuk Resepsionis, Keuangan, Admin & Super Admin; disembunyikan dari QC, Teknisi, dan Koperasi agar fokus pada tugas divisi) */}
      {(isSuperAdminUser || (!isQcUser && !isTeknisiUser && !isKoperasiUser) || activePerspective === 'RESEPSIONIS' || activePerspective === 'ALL') && (
        <MonthlyReservationCalendar
          transactions={transactions}
          rooms={rooms}
          maintenances={maintenances}
          openModal={openModal}
          facilityFilter={facilityFilter}
          setFacilityFilter={setFacilityFilter}
          currentDate={currentDate}
          setCurrentDate={setCurrentDate}
          currentUser={currentUser}
          realToday={realToday}
          formatIndonesianDate={formatIndonesianDate}
          updateBreakfastStatus={updateBreakfastStatus}
          activateCheckin={activateCheckin}
          checkoutRoom={checkoutRoom}
          batchCheckinGroup={batchCheckinGroup}
          batchCheckoutGroup={batchCheckoutGroup}
          cancelBooking={cancelBooking}
          setActiveTab={setActiveTab}
        />
      )}

      {/* 5. LOG AKTIVITAS SISTEM TERKINI */}
      {recentLogs.length > 0 && (
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl shadow-xs hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all duration-300">
          <div className="flex items-center space-x-2 text-xs">
            <span className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
              <i className="fa-solid fa-history"></i>
            </span>
            <span className="font-bold text-slate-800">Aktivitas Terkini:</span>
            <span className="text-slate-600 truncate max-w-lg">
              <strong>{recentLogs[0].userName || recentLogs[0].user}</strong>: {recentLogs[0].details}
            </span>
          </div>
          <button 
            onClick={() => setActiveTab('auditLog')}
            className="text-blue-700 hover:text-blue-900 font-bold text-xs shrink-0 self-end sm:self-auto"
          >
            Buka Log Aktivitas & Shift →
          </button>
        </div>
      )}


      {/* Interactive Chart Popup Modals */}
      {activeChartPopup === 'PIE' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full p-6 sm:p-8 space-y-6 relative overflow-hidden">
            {/* Ambient background glow */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 relative z-10">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center font-bold text-base shadow-lg shadow-emerald-500/30">
                  <i className="fa-solid fa-chart-pie"></i>
                </div>
                <div>
                  <h4 className="font-black text-slate-900 dark:text-slate-100 text-base sm:text-lg tracking-tight">
                    Visualisasi 3D: Distribusi Status Kamar
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Model 3D interaktif real-time seluruh unit asrama
                  </p>
                </div>
              </div>
              <button onClick={() => setActiveChartPopup(null)} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center transition cursor-pointer">
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center relative z-10">
              {/* 3D Isometric Donut Chart Container with CSS perspective and drop shadows */}
              <div className="relative w-52 h-52 mx-auto flex items-center justify-center group">
                {/* 3D Shadow Base */}
                <div className="absolute inset-4 rounded-full bg-emerald-900/10 dark:bg-emerald-400/5 blur-xl transform translate-y-4 scale-95 group-hover:scale-105 transition duration-500"></div>

                <svg className="w-full h-full transform -rotate-90 drop-shadow-2xl transition-transform duration-500 group-hover:scale-105" viewBox="0 0 100 100" style={{ filter: 'drop-shadow(0px 10px 15px rgba(0, 0, 0, 0.2))' }}>
                  <circle cx="50" cy="50" r="38" fill="transparent" stroke="#e2e8f0" strokeWidth="18" className="dark:stroke-slate-800" />
                  <circle cx="50" cy="50" r="38" fill="transparent" stroke="url(#emeraldGrad)" strokeWidth="18"
                    strokeDasharray={`${(terisiKamar / Math.max(1, totalKamar)) * 238.76} 238.76`}
                    strokeDashoffset="0"
                    strokeLinecap="round"
                  />
                  <circle cx="50" cy="50" r="38" fill="transparent" stroke="url(#blueGrad)" strokeWidth="18"
                    strokeDasharray={`${(bookedKamar / Math.max(1, totalKamar)) * 238.76} 238.76`}
                    strokeDashoffset={`-${(terisiKamar / Math.max(1, totalKamar)) * 238.76}`}
                    strokeLinecap="round"
                  />
                  <circle cx="50" cy="50" r="38" fill="transparent" stroke="url(#slateGrad)" strokeWidth="18"
                    strokeDasharray={`${(kosongKamar / Math.max(1, totalKamar)) * 238.76} 238.76`}
                    strokeDashoffset={`-${((terisiKamar + bookedKamar) / Math.max(1, totalKamar)) * 238.76}`}
                    strokeLinecap="round"
                  />
                  <circle cx="50" cy="50" r="38" fill="transparent" stroke="url(#amberGrad)" strokeWidth="18"
                    strokeDasharray={`${(maintKamar / Math.max(1, totalKamar)) * 238.76} 238.76`}
                    strokeDashoffset={`-${((terisiKamar + bookedKamar + kosongKamar) / Math.max(1, totalKamar)) * 238.76}`}
                    strokeLinecap="round"
                  />
                  <defs>
                    <linearGradient id="emeraldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#34d399" />
                      <stop offset="100%" stopColor="#059669" />
                    </linearGradient>
                    <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#60a5fa" />
                      <stop offset="100%" stopColor="#2563eb" />
                    </linearGradient>
                    <linearGradient id="slateGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#cbd5e1" />
                      <stop offset="100%" stopColor="#64748b" />
                    </linearGradient>
                    <linearGradient id="amberGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#fbbf24" />
                      <stop offset="100%" stopColor="#d97706" />
                    </linearGradient>
                  </defs>
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none drop-shadow-md">
                  <span className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">{totalKamar}</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-extrabold tracking-widest">Total Unit</span>
                </div>
              </div>

              {/* 3D Legend & Breakdown */}
              <div className="space-y-2.5 text-xs">
                <div 
                  onClick={() => { setActiveChartPopup(null); setActiveTab('gedung'); }}
                  className="p-3 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 rounded-2xl border border-emerald-200/80 dark:border-emerald-800 flex items-center justify-between shadow-xs hover:scale-[1.02] transition cursor-pointer"
                >
                  <span className="flex items-center gap-2 font-bold text-emerald-900 dark:text-emerald-200">
                    <span className="w-3.5 h-3.5 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-700 shadow-sm"></span>
                    <span>Terisi</span>
                  </span>
                  <span className="font-black text-emerald-900 dark:text-emerald-200 font-mono text-sm">{terisiKamar} <span className="text-xs font-normal opacity-80">({totalKamar > 0 ? Math.round((terisiKamar / totalKamar) * 100) : 0}%)</span></span>
                </div>

                <div 
                  onClick={() => { setActiveChartPopup(null); setActiveTab('gedung'); }}
                  className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 rounded-2xl border border-blue-200/80 dark:border-blue-800 flex items-center justify-between shadow-xs hover:scale-[1.02] transition cursor-pointer"
                >
                  <span className="flex items-center gap-2 font-bold text-blue-900 dark:text-blue-200">
                    <span className="w-3.5 h-3.5 rounded-lg bg-gradient-to-br from-blue-400 to-blue-700 shadow-sm"></span>
                    <span>Reservasi (Booking)</span>
                  </span>
                  <span className="font-black text-blue-900 dark:text-blue-200 font-mono text-sm">{bookedKamar} <span className="text-xs font-normal opacity-80">({totalKamar > 0 ? Math.round((bookedKamar / totalKamar) * 100) : 0}%)</span></span>
                </div>

                <div 
                  onClick={() => { setActiveChartPopup(null); setActiveTab('gedung'); }}
                  className="p-3 bg-gradient-to-r from-slate-50 to-zinc-100 dark:from-slate-800 dark:to-zinc-800 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between shadow-xs hover:scale-[1.02] transition cursor-pointer"
                >
                  <span className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                    <span className="w-3.5 h-3.5 rounded-lg bg-gradient-to-br from-slate-300 to-slate-600 shadow-sm"></span>
                    <span>Kosong (Vacant)</span>
                  </span>
                  <span className="font-black text-slate-900 dark:text-slate-100 font-mono text-sm">{kosongKamar} <span className="text-xs font-normal opacity-80">({totalKamar > 0 ? Math.round((kosongKamar / totalKamar) * 100) : 0}%)</span></span>
                </div>

                <div 
                  onClick={() => { setActiveChartPopup(null); setActiveTab('laporanMaintenance'); }}
                  className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 rounded-2xl border border-amber-200/80 dark:border-amber-800 flex items-center justify-between shadow-xs hover:scale-[1.02] transition cursor-pointer"
                >
                  <span className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-200">
                    <span className="w-3.5 h-3.5 rounded-lg bg-gradient-to-br from-amber-400 to-amber-700 shadow-sm"></span>
                    <span>Maintenance</span>
                  </span>
                  <span className="font-black text-amber-900 dark:text-amber-200 font-mono text-sm">{maintKamar} <span className="text-xs font-normal opacity-80">({totalKamar > 0 ? Math.round((maintKamar / totalKamar) * 100) : 0}%)</span></span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 relative z-10">
              <span className="text-xs text-slate-500 font-medium">
                Sinkron dengan Modul Denah Asrama
              </span>
              <button
                type="button"
                onClick={() => { setActiveChartPopup(null); setActiveTab('gedung'); }}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-2xl text-xs font-bold shadow-lg shadow-emerald-600/30 transition flex items-center gap-2 cursor-pointer"
              >
                <span>Buka Denah Gedung & Kamar</span>
                <i className="fa-solid fa-arrow-right text-[10px]"></i>
              </button>
            </div>
          </div>
        </div>
      )}

      {activeChartPopup === 'MAINT_TREND' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full p-5 sm:p-6 space-y-4 sm:space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 flex items-center justify-center font-bold text-sm">
                  <i className="fa-solid fa-chart-column"></i>
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base leading-tight">
                    Tren Laporan Maintenance 7 Hari Terakhir
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Statistik penanganan perbaikan fasilitas, SLA penyelesaian, & tiket aktif
                  </p>
                </div>
              </div>
              <button onClick={() => setActiveChartPopup(null)} className="text-slate-400 hover:text-slate-700 text-sm cursor-pointer p-1">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* Quick KPI Bar in Popup */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 text-center">
                <div className="text-[10px] text-slate-500">Total 7 Hari</div>
                <div className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {last7DaysMaintenanceData.reduce((acc, d) => acc + d.Total, 0)} Kasus
                </div>
              </div>
              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 text-center">
                <div className="text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold">Selesai (QC)</div>
                <div className="text-base font-bold text-emerald-700">
                  {last7DaysMaintenanceData.reduce((acc, d) => acc + d.Selesai, 0)} Unit
                </div>
              </div>
              <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 text-center">
                <div className="text-[10px] text-blue-700 dark:text-blue-300 font-semibold">Dalam Proses</div>
                <div className="text-base font-bold text-blue-700">
                  {last7DaysMaintenanceData.reduce((acc, d) => acc + d.Proses, 0)} Unit
                </div>
              </div>
            </div>

            {/* Expanded Bar Chart */}
            <div className="w-full h-48 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={last7DaysMaintenanceData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="displayDate" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '11px' }}
                    formatter={(value: any, name: any) => [value + ' Laporan', name === 'Selesai' ? 'Selesai (Lolos QC)' : 'Proses Pengerjaan']}
                    labelStyle={{ color: '#fbbf24', fontWeight: 'bold', marginBottom: '4px' }}
                  />
                  <Bar dataKey="Selesai" fill="#059669" radius={[5, 5, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="Proses" fill="#2563eb" radius={[5, 5, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Active Urgent Maintenance List Preview */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                <span>Tiket Maintenance Urgent & Aktif Saat Ini</span>
                <span className="text-[10px] font-semibold text-amber-600">{activeMaintenances.length} Kasus</span>
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {activeMaintenances.length === 0 ? (
                  <div className="p-3 text-center text-xs text-emerald-600 font-semibold bg-emerald-50 dark:bg-emerald-950/40 rounded-xl">
                    Semua fasilitas dalam kondisi prima. Tidak ada kendala aktif!
                  </div>
                ) : (
                  activeMaintenances.slice(0, 4).map((m: any) => (
                    <div key={m.id} className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-slate-100">{m.roomNumber || m.building || 'Kamar'}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-xs">{m.issue}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        m.urgency === 'Urgent' 
                          ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' 
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                      }`}>
                        {m.urgency || 'Normal'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => { setActiveChartPopup(null); setActiveTab('laporanMaintenance'); }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
              >
                <span>Buka Manajemen Perbaikan</span>
                <i className="fa-solid fa-arrow-right text-[10px]"></i>
              </button>
            </div>
          </div>
        </div>
      )}


      {activeChartPopup === 'SYSTEM_TREND' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 flex items-center justify-center font-bold text-sm">
                  <i className="fa-solid fa-chart-line"></i>
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base leading-tight">
                    Analisis Tren & Mutu Sistem Operasional
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Audit real-time seluruh domain: kamar, housekeeping QC, logistik dapur, sarana, aula, & akuntabilitas
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setActiveChartPopup(null)} 
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-base cursor-pointer p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* Top 4 KPI Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 text-center space-y-0.5">
                <div className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">Skor Mutu Sistem</div>
                <div className="text-lg font-black text-emerald-700 dark:text-emerald-400">{systemHealthScore}%</div>
                <div className="text-[9px] text-emerald-600 font-medium">Kategori Prima</div>
              </div>
              <div className="p-2.5 bg-teal-50 dark:bg-teal-950/40 rounded-xl border border-teal-200 dark:border-teal-800 text-center space-y-0.5">
                <div className="text-[10px] font-semibold text-teal-800 dark:text-teal-300">Kesiapan QC Kamar</div>
                <div className="text-lg font-black text-teal-700 dark:text-teal-400">{qcPassRate}%</div>
                <div className="text-[9px] text-teal-600 font-medium">{Math.min(readyQcRooms, totalRegisteredUnits)}/{totalRegisteredUnits} Lolos</div>
              </div>
              <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800 text-center space-y-0.5">
                <div className="text-[10px] font-semibold text-blue-800 dark:text-blue-300">Sarana & Fisik</div>
                <div className="text-lg font-black text-blue-700 dark:text-blue-400">{facilityHealthRate}%</div>
                <div className="text-[9px] text-blue-600 font-medium">{totalKamar - maintKamar} Kamar Prima</div>
              </div>
              <div className="p-2.5 bg-purple-50 dark:bg-purple-950/40 rounded-xl border border-purple-200 dark:border-purple-800 text-center space-y-0.5">
                <div className="text-[10px] font-semibold text-purple-800 dark:text-purple-300">SLA Perbaikan 7 Hari</div>
                <div className="text-lg font-black text-purple-700 dark:text-purple-400">{maintResolvedRate}%</div>
                <div className="text-[9px] text-purple-600 font-medium">Kasus Terselesaikan</div>
              </div>
            </div>

            {/* 6 Detailed Pillar Breakdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs pt-1">
              {/* Pillar 1: Housekeeping & QC */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <i className="fa-solid fa-clipboard-check text-emerald-600"></i>
                    <span>Quality Control & Kebersihan</span>
                  </span>
                  <span className="font-bold text-emerald-700 text-[11px]">{readyQcRooms} Kamar Lolos</span>
                </div>
                <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span>Kamar Kosong Siap Huni:</span>
                    <strong className="text-emerald-700 font-bold">{readyCleanRooms.length} Kamar</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Menunggu Verifikasi Petugas QC:</span>
                    <strong className="text-amber-700 font-bold">{waitingQcRooms} Kamar</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Perlu Pembersihan / Inspeksi:</span>
                    <strong className="text-slate-700 dark:text-slate-200 font-semibold">{inspectionNeededRooms} Kamar</strong>
                  </div>
                </div>
              </div>

              {/* Pillar 2: Maintenance & Fasilitas */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <i className="fa-solid fa-screwdriver-wrench text-red-600"></i>
                    <span>Pemeliharaan Sarana & Kerusakan</span>
                  </span>
                  <span className={`font-bold text-[11px] ${activeMaintenances.length > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                    {activeMaintenances.length} Kasus Aktif
                  </span>
                </div>
                <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span>Kategori Urgent / Mendesak:</span>
                    <strong className="text-red-600 font-bold">{urgentMaintenances.length} Kasus</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Kamar Terisolasi Maintenance:</span>
                    <strong className="text-amber-700 font-bold">{maintKamar} Kamar</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Tingkat Penyelesaian Masalah:</span>
                    <strong className="text-emerald-700 font-bold">{maintResolvedRate}% Selesai</strong>
                  </div>
                </div>
              </div>

              {/* Pillar 3: F&B Dapur & Sarapan */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <i className="fa-solid fa-utensils text-amber-600"></i>
                    <span>Layanan Dapur & Katering</span>
                  </span>
                  <span className="font-bold text-amber-700 text-[11px]">{totalBreakfastPortions} Porsi</span>
                </div>
                <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span>Pesanan Dapur Aktif:</span>
                    <strong className="text-slate-800 dark:text-slate-200 font-bold">{activeBreakfastList.length} Kamar</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Status Pengantaran:</span>
                    <strong className="text-blue-700 font-semibold">{activeBreakfastList.filter(t => t.breakfastStatus === 'PENGANTARAN').length} Sedang Diantar</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Katering / Paket Makan:</span>
                    <strong className="text-emerald-700 font-semibold">Tersedia & Terjadwal</strong>
                  </div>
                </div>
              </div>

              {/* Pillar 4: Fasilitas Gedung Pertemuan / Aula */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <i className="fa-solid fa-building-columns text-purple-600"></i>
                    <span>Utilisasi Ruang Pertemuan & Aula</span>
                  </span>
                  <span className="font-bold text-purple-700 text-[11px]">{aulaEventsToday.length} Acara Aktif</span>
                </div>
                <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span>Total Kapasitas Aula:</span>
                    <strong className="text-slate-800 dark:text-slate-200 font-bold">{totalAula} Ruang</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Aula Kosong / Siap Booking:</span>
                    <strong className="text-emerald-700 font-bold">{Math.max(0, totalAula - aulaEventsToday.length)} Aula Siap</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Reservasi Hari Ini:</span>
                    <strong className="text-purple-700 font-semibold">{aulaEventsToday.length > 0 ? 'Sedang Berlangsung' : 'Tidak Ada Acara'}</strong>
                  </div>
                </div>
              </div>

              {/* Pillar 5: Permintaan Khusus & Extra Bed */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <i className="fa-solid fa-bed text-indigo-600"></i>
                    <span>Permintaan Khusus & Extra Bed</span>
                  </span>
                  <span className="font-bold text-indigo-700 text-[11px]">{specialRequestsList.length} Kamar</span>
                </div>
                <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span>Extra Bed Terpasang / Diminta:</span>
                    <strong className="text-indigo-700 font-bold">
                      {specialRequestsList.filter(t => t.extraBed).length} Unit
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Catatan Khusus Tamu Terdata:</span>
                    <strong className="text-slate-800 dark:text-slate-200 font-semibold">
                      {specialRequestsList.filter(t => t.notes && t.notes.trim() !== '-' && !t.notes.startsWith('[Rombongan:')).length} Catatan
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Kesiapan Staf Layanan:</span>
                    <strong className="text-emerald-700 font-semibold">Tersinkronisasi Realtime</strong>
                  </div>
                </div>
              </div>

              {/* Pillar 6: Jejak Audit & Keamanan */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <i className="fa-solid fa-shield-halved text-blue-600"></i>
                    <span>Audit Trail & Integritas Sistem</span>
                  </span>
                  <span className="font-bold text-blue-700 text-[11px]">{recentLogs.length} Log Hari Ini</span>
                </div>
                <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span>Total Arsip Riwayat Aktivitas:</span>
                    <strong className="text-blue-700 font-bold">{auditLogs.length} Rekam Log</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Transaksi Aktif:</span>
                    <strong className="text-slate-800 dark:text-slate-200 font-bold">{transactions.length} Data</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Integritas Keamanan Data:</span>
                    <strong className="text-emerald-700 font-semibold">Tervalidasi & Terlindungi</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Navigation Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[11px] text-slate-500">Akses Cepat Modul Terkait:</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => { setActiveChartPopup(null); setActiveTab('qc'); }}
                  className="px-2.5 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1"
                >
                  <i className="fa-solid fa-clipboard-check text-[10px]"></i>
                  <span>QC Kamar</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveChartPopup(null); setActiveTab('pesananSarapan'); }}
                  className="px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-950 dark:text-amber-300 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1"
                >
                  <i className="fa-solid fa-utensils text-[10px]"></i>
                  <span>Dapur Sarapan</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveChartPopup(null); setActiveTab('laporanMaintenance'); }}
                  className="px-2.5 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 dark:bg-red-950 dark:text-red-300 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1"
                >
                  <i className="fa-solid fa-screwdriver-wrench text-[10px]"></i>
                  <span>Perbaikan</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveChartPopup(null); setActiveTab('ruangPertemuan'); }}
                  className="px-2.5 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-800 dark:bg-purple-950 dark:text-purple-300 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1"
                >
                  <i className="fa-solid fa-building-columns text-[10px]"></i>
                  <span>Aula</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveChartPopup(null); setActiveTab('auditLog'); }}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 shadow-2xs"
                >
                  <i className="fa-solid fa-shield-halved text-[10px]"></i>
                  <span>Audit Log →</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
