import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Room, Transaction, Maintenance } from '../../types';
import { addDaysToDateStr, formatIndonesianDate, isMeetingFacility } from '../../lib/utils';

export type AgendaUrgency = 'KRITIS' | 'TINGGI' | 'RENDAH';
export type AgendaCategory = 'CHECKIN' | 'CHECKOUT' | 'QC' | 'BREAKFAST' | 'MAINTENANCE' | 'AULA' | 'SPECIAL';

export interface CompactAgendaCardItem {
  id: string;
  category: AgendaCategory;
  categoryLabel: string;
  categoryIcon: string;
  categoryBadgeClass: string;
  urgency: AgendaUrgency;
  urgencyLabel: string;
  urgencyReason?: string;
  title: string;
  subtitle: string;
  roomNumber?: string;
  building?: string;
  dateStr: string;
  extraInfo?: string;
  tags?: { label: string; color: string }[];
  actionLabel?: string;
  actionIcon?: string;
  actionClass?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

interface OperationalAgendaSectionProps {
  agendaFilter: 'ALL' | 'CHECKIN' | 'CHECKOUT' | 'QC' | 'BREAKFAST' | 'MAINTENANCE' | 'AULA' | 'SPECIAL';
  setAgendaFilter: (filter: 'ALL' | 'CHECKIN' | 'CHECKOUT' | 'QC' | 'BREAKFAST' | 'MAINTENANCE' | 'AULA' | 'SPECIAL') => void;
  realToday: string;
  formatIndonesianDate: (date: string) => string;
  currentUser: any;
  checkinTodayList: any[];
  checkoutTodayList: any[];
  qcNeedAttentionRooms: any[];
  activeBreakfastList: any[];
  totalBreakfastPortions: number;
  activeMaintenances: any[];
  sortedMaintenances: any[];
  aulaEventsToday: any[];
  specialRequestsList: any[];
  readyCleanRooms: Room[];
  terisiKamar: number;
  isTeknisi: boolean;
  isSuperAdmin: boolean;
  isQc: boolean;
  openModal: (modal: string, data?: any) => void;
  setActiveTab: (tab: string) => void;
  updateBreakfastStatus: (txId: string, status: any) => void;
  activateCheckin: (tx: any) => void;
  checkoutRoom: (roomId: string, guestName: string) => void;
  batchCheckinGroup: (groupId: string) => void;
  batchCheckoutGroup: (groupId: string) => void;
  rooms: Room[];
  transactions: Transaction[];
  maintenances?: Maintenance[];
}

export function OperationalAgendaSection({
  agendaFilter,
  setAgendaFilter,
  realToday,
  currentUser,
  checkinTodayList,
  checkoutTodayList,
  qcNeedAttentionRooms,
  activeBreakfastList,
  activeMaintenances,
  aulaEventsToday,
  specialRequestsList,
  readyCleanRooms,
  openModal,
  setActiveTab,
  updateBreakfastStatus,
  activateCheckin,
  checkoutRoom,
  batchCheckinGroup,
  rooms,
  transactions,
  maintenances = [],
}: OperationalAgendaSectionProps) {
  // Mini Calendar State
  const [selectedDateStr, setSelectedDateStr] = useState<string>(realToday || new Date().toISOString().split('T')[0]);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const [y, m] = (realToday || '').split('-').map(Number);
    return y && m ? new Date(y, m - 1, 1) : new Date();
  });
  
  // Filter urgency state: 'ALL' | 'KRITIS' | 'TINGGI' | 'RENDAH'
  const [urgencyFilter, setUrgencyFilter] = useState<'ALL' | 'KRITIS' | 'TINGGI' | 'RENDAH'>('ALL');

  // View Mode: 'SPLIT' (Mini Calendar + Cards) vs 'WEEK' (7-Day Strip)
  const [viewMode, setViewMode] = useState<'SPLIT' | 'WEEK'>('SPLIT');

  // Month navigation helpers
  const curYear = calendarMonth.getFullYear();
  const curMonth = calendarMonth.getMonth();

  const handlePrevMonth = () => {
    setCalendarMonth(new Date(curYear, curMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setCalendarMonth(new Date(curYear, curMonth + 1, 1));
  };

  const handleResetToToday = () => {
    const today = realToday || new Date().toISOString().split('T')[0];
    setSelectedDateStr(today);
    const [y, m] = today.split('-').map(Number);
    if (y && m) setCalendarMonth(new Date(y, m - 1, 1));
  };

  const handleOffsetDay = (offset: number) => {
    const newDateStr = addDaysToDateStr(selectedDateStr, offset);
    setSelectedDateStr(newDateStr);
    const [y, m] = newDateStr.split('-').map(Number);
    if (y && m) setCalendarMonth(new Date(y, m - 1, 1));
  };

  // Month names
  const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  // Days in month
  const daysInMonth = new Date(curYear, curMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(curYear, curMonth, 1).getDay(); // 0 is Sunday

  // Mini Calendar grid days
  const miniCalendarDays = useMemo(() => {
    const days: (Date | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(curYear, curMonth, i));
    }
    return days;
  }, [curYear, curMonth, daysInMonth, firstDayOfWeek]);

  // Week days for WEEK view mode
  const currentWeekDays = useMemo(() => {
    const [y, m, d] = selectedDateStr.split('-').map(Number);
    const curr = new Date(y, m - 1, d);
    const dayOfWeek = curr.getDay(); // 0 is Sunday
    const startOfWeek = new Date(curr);
    startOfWeek.setDate(curr.getDate() - dayOfWeek);

    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      const dt = new Date(startOfWeek);
      dt.setDate(startOfWeek.getDate() + i);
      const ny = dt.getFullYear();
      const nm = String(dt.getMonth() + 1).padStart(2, '0');
      const nd = String(dt.getDate()).padStart(2, '0');
      week.push(`${ny}-${nm}-${nd}`);
    }
    return week;
  }, [selectedDateStr]);

  // Unified function to generate agenda items for any specified date
  const generateAgendasForDate = useMemo(() => {
    return (targetDate: string): CompactAgendaCardItem[] => {
      const items: CompactAgendaCardItem[] = [];
      const isToday = targetDate === realToday;

      // 1. CHECK-IN AGENDAS
      if (isToday) {
        checkinTodayList.forEach((tx: any) => {
          const isOverdue = tx.startDate < realToday;
          const isGroup = tx.category === 'ROMBONGAN' || tx.kloter?.startsWith('GROUP:');
          const urgency: AgendaUrgency = isOverdue ? 'KRITIS' : 'TINGGI';

          items.push({
            id: `ci-${tx.id}`,
            category: 'CHECKIN',
            categoryLabel: 'Check-In Tamu',
            categoryIcon: 'fa-arrow-right-to-bracket',
            categoryBadgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300',
            urgency,
            urgencyLabel: isOverdue ? 'KRITIS: Terlambat' : 'TINGGI: Hari Ini',
            urgencyReason: isOverdue ? `Terlambat (${tx.startDate})` : 'Jadwal Masuk Hari Ini',
            title: tx.guestName,
            subtitle: `${tx.building || 'Penginapan'} · ${tx.duration} Malam`,
            roomNumber: tx.roomNumber,
            building: tx.building,
            dateStr: targetDate,
            tags: [
              ...(isOverdue ? [{ label: 'Terlambat Masuk', color: 'bg-rose-100 text-rose-800 border-rose-300' }] : []),
              ...(isGroup ? [{ label: 'Rombongan', color: 'bg-purple-100 text-purple-800 border-purple-300' }] : []),
              { label: `${tx.duration} Malam`, color: 'bg-slate-100 text-slate-700 border-slate-300' },
            ],
            actionLabel: isGroup && tx.kloter ? 'Check-In Rombongan' : 'Proses Check-In',
            actionIcon: isGroup ? 'fa-users-gear' : 'fa-check',
            actionClass: isGroup ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white',
            onAction: () => {
              const targetRoom = rooms.find(r => r.id === tx.roomId);
              if (isGroup && tx.kloter) {
                batchCheckinGroup(tx.kloter.replace('GROUP:', ''));
                if (tx.paymentStatus === 'LUNAS') {
                  openModal('modalKwitansi', { transaction: tx, room: targetRoom });
                } else {
                  openModal('modalInvoice', { transaction: tx, room: targetRoom });
                }
              } else {
                activateCheckin(tx);
                const updatedTx = { ...tx, status: 'TERISI' as const };
                if (tx.paymentStatus === 'LUNAS') {
                  openModal('modalKwitansi', { transaction: updatedTx, room: targetRoom });
                } else {
                  openModal('modalInvoice', { transaction: updatedTx, room: targetRoom });
                }
              }
            },
            secondaryActionLabel: 'Detail Kamar',
            onSecondaryAction: () => openModal('modalRoomDetail', { roomId: tx.roomId }),
          });
        });
      } else {
        // Other dates
        const dateCheckins = transactions.filter(tx => {
          if (tx.status === 'DIBATALKAN') return false;
          if (tx.building === 'Ruang Pertemuan' || isMeetingFacility(tx.building)) return false;
          return tx.startDate === targetDate && (tx.status === 'BOOKED' || tx.status === 'TERISI');
        });

        dateCheckins.forEach(tx => {
          const isPast = targetDate < realToday;
          const urgency: AgendaUrgency = isPast ? 'KRITIS' : 'RENDAH';
          const isGroup = tx.category === 'ROMBONGAN' || tx.kloter?.startsWith('GROUP:');

          items.push({
            id: `ci-${tx.id}`,
            category: 'CHECKIN',
            categoryLabel: 'Check-In Terjadwal',
            categoryIcon: 'fa-calendar-check',
            categoryBadgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300',
            urgency,
            urgencyLabel: isPast ? 'KRITIS: Lampau' : 'RENDAH: Terjadwal',
            urgencyReason: isPast ? 'Reservasi tanggal lampau belum check-in' : 'Rencana Kedatangan',
            title: tx.guestName,
            subtitle: `${tx.building || 'Penginapan'} · ${tx.duration} Malam`,
            roomNumber: tx.roomNumber,
            building: tx.building,
            dateStr: targetDate,
            tags: [
              ...(isGroup ? [{ label: 'Rombongan', color: 'bg-purple-100 text-purple-800 border-purple-300' }] : []),
              { label: `${tx.duration} Malam`, color: 'bg-slate-100 text-slate-700 border-slate-300' },
            ],
            actionLabel: 'Lihat Tamu',
            actionIcon: 'fa-eye',
            actionClass: 'bg-slate-700 hover:bg-slate-800 text-white',
            onAction: () => openModal('modalRoomDetail', { roomId: tx.roomId }),
          });
        });
      }

      // 2. CHECK-OUT AGENDAS
      if (isToday) {
        checkoutTodayList.forEach((tx: any) => {
          const checkoutDate = addDaysToDateStr(tx.startDate, tx.duration);
          const isOverdue = checkoutDate < realToday;
          const isUnpaid = tx.paymentStatus !== 'LUNAS';
          const isCritical = isOverdue || isUnpaid;
          const urgency: AgendaUrgency = isCritical ? 'KRITIS' : 'TINGGI';

          items.push({
            id: `co-${tx.id}`,
            category: 'CHECKOUT',
            categoryLabel: 'Check-Out Tamu',
            categoryIcon: 'fa-arrow-right-from-bracket',
            categoryBadgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300',
            urgency,
            urgencyLabel: isOverdue ? 'KRITIS: Overdue' : isUnpaid ? 'KRITIS: Belum Lunas' : 'TINGGI: Hari Ini',
            urgencyReason: isOverdue ? 'Waktu sewa berakhir (Overdue)' : isUnpaid ? 'Tagihan belum lunas' : 'Jadwal check-out normal',
            title: tx.guestName,
            subtitle: `${tx.building} · Tagihan: ${isUnpaid ? 'Belum Lunas' : 'Lunas'}`,
            roomNumber: tx.roomNumber,
            building: tx.building,
            dateStr: targetDate,
            tags: [
              ...(isOverdue ? [{ label: 'Overdue Sewa', color: 'bg-rose-100 text-rose-800 border-rose-300' }] : []),
              { label: isUnpaid ? 'Tagihan Tertunggak' : 'Lunas', color: isUnpaid ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-emerald-100 text-emerald-800 border-emerald-300' },
            ],
            actionLabel: 'Proses Check-Out',
            actionIcon: 'fa-door-open',
            actionClass: 'bg-blue-600 hover:bg-blue-700 text-white',
            onAction: () => checkoutRoom(tx.roomId, tx.guestName),
            secondaryActionLabel: 'Kuitansi / Tagihan',
            onSecondaryAction: () => openModal('modalPrintKuitansi', { transaction: tx }),
          });
        });
      } else {
        const dateCheckouts = transactions.filter(tx => {
          if (tx.status !== 'TERISI') return false;
          if (tx.building === 'Ruang Pertemuan' || isMeetingFacility(tx.building)) return false;
          const checkoutDate = addDaysToDateStr(tx.startDate, tx.duration);
          return checkoutDate === targetDate;
        });

        dateCheckouts.forEach(tx => {
          const isLunas = (tx as any).paymentStatus === 'LUNAS';
          items.push({
            id: `co-${tx.id}`,
            category: 'CHECKOUT',
            categoryLabel: 'Rencana Check-Out',
            categoryIcon: 'fa-clock-rotate-left',
            categoryBadgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300',
            urgency: 'RENDAH',
            urgencyLabel: 'RENDAH: Terjadwal',
            urgencyReason: 'Jadwal kepulangan tamu',
            title: tx.guestName,
            subtitle: `${tx.building} · ${isLunas ? 'Lunas' : 'Periksa Tagihan'}`,
            roomNumber: tx.roomNumber,
            building: tx.building,
            dateStr: targetDate,
            tags: [
              { label: isLunas ? 'Lunas' : 'Belum Lunas', color: 'bg-slate-100 text-slate-700 border-slate-300' }
            ],
            actionLabel: 'Detail Kamar',
            actionIcon: 'fa-eye',
            actionClass: 'bg-slate-700 hover:bg-slate-800 text-white',
            onAction: () => openModal('modalRoomDetail', { roomId: tx.roomId }),
          });
        });
      }

      // 3. QC & HOUSEKEEPING AGENDAS
      if (isToday) {
        qcNeedAttentionRooms.forEach((r: Room) => {
          const isButuhPerbaikan = r.qcStatus === 'PERLU_PERBAIKAN';
          const hasCheckinToday = checkinTodayList.some(tx => tx.roomId === r.id || tx.roomNumber === r.roomNumber);
          const urgency: AgendaUrgency = (isButuhPerbaikan || hasCheckinToday) ? 'KRITIS' : 'TINGGI';

          items.push({
            id: `qc-${r.id}`,
            category: 'QC',
            categoryLabel: 'Kebersihan & QC',
            categoryIcon: 'fa-clipboard-check',
            categoryBadgeClass: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 border-teal-300',
            urgency,
            urgencyLabel: urgency === 'KRITIS' ? 'KRITIS: Segera Tangani' : 'TINGGI: Perlu QC',
            urgencyReason: isButuhPerbaikan ? 'Kamar ditandai butuh perbaikan teknis' : hasCheckinToday ? 'Ada tamu check-in hari ini!' : 'Menunggu inspeksi kebersihan',
            title: `Unit ${r.roomNumber} (${r.type})`,
            subtitle: `${r.building} · Lantai ${r.floor || 1}`,
            roomNumber: r.roomNumber,
            building: r.building,
            dateStr: targetDate,
            tags: [
              { label: isButuhPerbaikan ? 'Butuh Perbaikan' : 'Perlu Inspeksi', color: isButuhPerbaikan ? 'bg-rose-100 text-rose-800 border-rose-300' : 'bg-amber-100 text-amber-800 border-amber-300' },
              ...(hasCheckinToday ? [{ label: 'Ada Tamu Check-In!', color: 'bg-red-100 text-red-800 font-bold border-red-300' }] : [])
            ],
            actionLabel: 'Inspeksi QC',
            actionIcon: 'fa-check-double',
            actionClass: 'bg-teal-600 hover:bg-teal-700 text-white',
            onAction: () => openModal('modalQcDetail', { room: r }),
            secondaryActionLabel: 'Buka Menu QC',
            onSecondaryAction: () => setActiveTab('qualityControl'),
          });
        });
      }

      // 4. BREAKFAST & DAPUR AGENDAS
      if (isToday) {
        activeBreakfastList.forEach((tx: any) => {
          const isSedangDibuat = tx.breakfastStatus === 'SEDANG_DIBUAT';
          const isPengantaran = tx.breakfastStatus === 'PENGANTARAN';
          const urgency: AgendaUrgency = isSedangDibuat ? 'KRITIS' : 'TINGGI';

          items.push({
            id: `bf-${tx.id}`,
            category: 'BREAKFAST',
            categoryLabel: 'Dapur & Sarapan',
            categoryIcon: 'fa-utensils',
            categoryBadgeClass: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border-amber-300',
            urgency,
            urgencyLabel: isSedangDibuat ? 'KRITIS: Antar Segera' : 'TINGGI: Siapkan Porsi',
            urgencyReason: isSedangDibuat ? 'Makanan matang, butuh pengantaran' : 'Pesanan sarapan belum selesai',
            title: `${tx.guestName} (${tx.breakfastPortions || 1} Porsi)`,
            subtitle: `${tx.building} · Menu: ${tx.breakfastMenu || 'Paket Standar'}`,
            roomNumber: tx.roomNumber,
            building: tx.building,
            dateStr: targetDate,
            tags: [
              { label: `${tx.breakfastPortions || 1} Porsi`, color: 'bg-amber-100 text-amber-800 border-amber-300' },
              { label: isSedangDibuat ? 'Sedang Dibuat' : isPengantaran ? 'Sedang Diantar' : 'Menunggu', color: 'bg-slate-100 text-slate-700 border-slate-300' }
            ],
            actionLabel: isSedangDibuat ? 'Kirim ke Kamar' : isPengantaran ? 'Tandai Selesai' : 'Mulai Masak',
            actionIcon: isPengantaran ? 'fa-check' : 'fa-truck',
            actionClass: 'bg-amber-600 hover:bg-amber-700 text-white',
            onAction: () => {
              const next = isSedangDibuat ? 'PENGANTARAN' : isPengantaran ? 'SELESAI' : 'SEDANG_DIBUAT';
              updateBreakfastStatus(tx.id, next);
            },
          });
        });
      }

      // 5. MAINTENANCE AGENDAS
      if (isToday) {
        activeMaintenances.forEach((m: any) => {
          const isUrgent = m.urgency === 'Urgent' || m.priority === 'TINGGI' || m.priority === 'DARURAT';
          const urgency: AgendaUrgency = isUrgent ? 'KRITIS' : 'TINGGI';

          items.push({
            id: `maint-${m.id}`,
            category: 'MAINTENANCE',
            categoryLabel: 'Perbaikan Kendala',
            categoryIcon: 'fa-triangle-exclamation',
            categoryBadgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300',
            urgency,
            urgencyLabel: isUrgent ? 'KRITIS: Darurat' : 'TINGGI: Prioritas',
            urgencyReason: m.issue || 'Kerusakan fasilitas kamar',
            title: m.issue || `Kendala Kamar ${m.roomNumber}`,
            subtitle: `${m.building || 'Penginapan'} · Dilaporkan: ${m.reportedDate || 'Hari Ini'}`,
            roomNumber: m.roomNumber,
            building: m.building,
            dateStr: targetDate,
            tags: [
              { label: isUrgent ? 'Mendesak / Rusak' : 'Dalam Antrean', color: isUrgent ? 'bg-rose-100 text-rose-800 font-bold border-rose-300' : 'bg-slate-100 text-slate-700 border-slate-300' },
              { label: m.status || 'PENDING', color: 'bg-slate-100 text-slate-700 border-slate-300' }
            ],
            actionLabel: 'Tindak Lanjut',
            actionIcon: 'fa-wrench',
            actionClass: 'bg-rose-600 hover:bg-rose-700 text-white',
            onAction: () => openModal('modalMaintenance', { item: m }),
            secondaryActionLabel: 'Menu Pemeliharaan',
            onSecondaryAction: () => setActiveTab('pemeliharaan'),
          });
        });
      } else {
        const dateMaints = (maintenances || []).filter(m => {
          if (m.status === 'SELESAI') return false;
          const repDate = m.reportTime ? m.reportTime.split(' ')[0] : (m as any).reportedDate;
          return repDate === targetDate;
        });
        dateMaints.forEach(m => {
          const desc = m.description || (m as any).issue || `Kendala Kamar ${m.roomNumber}`;
          items.push({
            id: `maint-${m.id}`,
            category: 'MAINTENANCE',
            categoryLabel: 'Perbaikan Terjadwal',
            categoryIcon: 'fa-screwdriver-wrench',
            categoryBadgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300',
            urgency: 'RENDAH',
            urgencyLabel: 'RENDAH: Terjadwal',
            urgencyReason: desc,
            title: desc,
            subtitle: `${m.building} · Unit ${m.roomNumber}`,
            roomNumber: m.roomNumber,
            building: m.building,
            dateStr: targetDate,
            actionLabel: 'Detail Masalah',
            actionIcon: 'fa-eye',
            actionClass: 'bg-slate-700 hover:bg-slate-800 text-white',
            onAction: () => openModal('modalMaintenance', { item: m }),
          });
        });
      }

      // 6. AULA & RUANG PERTEMUAN AGENDAS
      if (isToday) {
        aulaEventsToday.forEach((tx: any) => {
          items.push({
            id: `aula-${tx.id}`,
            category: 'AULA',
            categoryLabel: 'Pemakaian Aula',
            categoryIcon: 'fa-handshake',
            categoryBadgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-300',
            urgency: 'TINGGI',
            urgencyLabel: 'TINGGI: Acara Hari Ini',
            urgencyReason: 'Acara berlangsung hari ini',
            title: tx.guestName || tx.agencyOrDocument || (tx as any).instansi || 'Acara Pertemuan',
            subtitle: `${tx.rentAulaName || tx.roomNumber} · ${tx.rentAulaSession || `${tx.duration} Jam`}`,
            roomNumber: tx.rentAulaName || tx.roomNumber,
            building: tx.building || 'Ruang Pertemuan',
            dateStr: targetDate,
            tags: [
              { label: tx.rentAulaSession || 'Sesi Acara', color: 'bg-purple-100 text-purple-800 border-purple-300' },
              { label: tx.status, color: 'bg-slate-100 text-slate-700 border-slate-300' }
            ],
            actionLabel: 'Detail Acara',
            actionIcon: 'fa-landmark',
            actionClass: 'bg-purple-600 hover:bg-purple-700 text-white',
            onAction: () => openModal('modalRoomDetail', { roomId: tx.roomId || tx.rentAulaId }),
          });
        });
      } else {
        const dateAulas = transactions.filter(tx => {
          if (tx.status === 'DIBATALKAN') return false;
          const isAula = tx.building === 'Ruang Pertemuan' || isMeetingFacility(tx.building);
          if (!isAula) return false;
          const days = tx.duration >= 24 ? Math.ceil(tx.duration / 24) : 1;
          const endDate = addDaysToDateStr(tx.startDate, days);
          return targetDate >= tx.startDate && targetDate <= endDate;
        });

        dateAulas.forEach(tx => {
          items.push({
            id: `aula-${tx.id}`,
            category: 'AULA',
            categoryLabel: 'Agenda Aula',
            categoryIcon: 'fa-landmark',
            categoryBadgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-300',
            urgency: 'RENDAH',
            urgencyLabel: 'RENDAH: Terjadwal',
            urgencyReason: 'Reservasi ruang pertemuan',
            title: tx.guestName || tx.agencyOrDocument || (tx as any).instansi || 'Acara Pertemuan',
            subtitle: `${tx.rentAulaName || tx.roomNumber} · ${tx.duration} Jam`,
            roomNumber: tx.rentAulaName || tx.roomNumber,
            building: tx.building,
            dateStr: targetDate,
            actionLabel: 'Detail Acara',
            actionIcon: 'fa-eye',
            actionClass: 'bg-slate-700 hover:bg-slate-800 text-white',
            onAction: () => openModal('modalRoomDetail', { roomId: tx.roomId || tx.rentAulaId }),
          });
        });
      }

      // 7. SPECIAL REQUESTS / EXTRA BED
      if (isToday) {
        specialRequestsList.forEach((tx: any) => {
          const isPending = !tx.extraBedDelivered;
          const urgency: AgendaUrgency = isPending ? 'KRITIS' : 'RENDAH';

          items.push({
            id: `sp-${tx.id}`,
            category: 'SPECIAL',
            categoryLabel: 'Extra Bed & Khusus',
            categoryIcon: 'fa-bed',
            categoryBadgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-300',
            urgency,
            urgencyLabel: isPending ? 'KRITIS: Pasang Bed' : 'RENDAH: Terpenuhi',
            urgencyReason: tx.notes || `Pasang Extra Bed (${tx.extraBedCount || 1} Unit)`,
            title: `${tx.guestName} (${tx.extraBedCount || 1} Extra Bed)`,
            subtitle: `${tx.building} · ${tx.notes || 'Catatan khusus tamu'}`,
            roomNumber: tx.roomNumber,
            building: tx.building,
            dateStr: targetDate,
            tags: [
              { label: `+${tx.extraBedCount || 1} Bed`, color: 'bg-indigo-100 text-indigo-800 border-indigo-300' }
            ],
            actionLabel: 'Detail Tamu',
            actionIcon: 'fa-eye',
            actionClass: 'bg-indigo-600 hover:bg-indigo-700 text-white',
            onAction: () => openModal('modalRoomDetail', { roomId: tx.roomId }),
          });
        });
      }

      return items;
    };
  }, [
    realToday,
    checkinTodayList,
    checkoutTodayList,
    qcNeedAttentionRooms,
    activeBreakfastList,
    activeMaintenances,
    aulaEventsToday,
    specialRequestsList,
    transactions,
    rooms,
    maintenances,
    activateCheckin,
    batchCheckinGroup,
    checkoutRoom,
    updateBreakfastStatus,
    openModal,
    setActiveTab
  ]);

  // Precompute calendar day summaries (dots/counts) for entire displayed month
  const calendarMonthSummaries = useMemo(() => {
    const summaryMap: Record<string, { total: number; kritis: number; tinggi: number; rendah: number }> = {};
    for (let i = 1; i <= daysInMonth; i++) {
      const dayStr = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const agendas = generateAgendasForDate(dayStr);
      summaryMap[dayStr] = {
        total: agendas.length,
        kritis: agendas.filter(a => a.urgency === 'KRITIS').length,
        tinggi: agendas.filter(a => a.urgency === 'TINGGI').length,
        rendah: agendas.filter(a => a.urgency === 'RENDAH').length,
      };
    }
    return summaryMap;
  }, [curYear, curMonth, daysInMonth, generateAgendasForDate]);

  // Items for currently selected date
  const selectedDateAgendas = useMemo(() => {
    return generateAgendasForDate(selectedDateStr);
  }, [selectedDateStr, generateAgendasForDate]);

  // Filtered and Sorted agendas for current selection
  const filteredAgendas = useMemo(() => {
    let result = selectedDateAgendas;

    // Filter by category if set
    if (agendaFilter !== 'ALL') {
      result = result.filter(item => item.category === agendaFilter);
    }

    // Filter by urgency if set
    if (urgencyFilter !== 'ALL') {
      result = result.filter(item => item.urgency === urgencyFilter);
    }

    // Sort by Urgency: KRITIS first, then TINGGI, then RENDAH
    const order: Record<AgendaUrgency, number> = {
      KRITIS: 1,
      TINGGI: 2,
      RENDAH: 3,
    };

    return [...result].sort((a, b) => order[a.urgency] - order[b.urgency]);
  }, [selectedDateAgendas, agendaFilter, urgencyFilter]);

  // Count summaries for selected date
  const selectedDateCounts = useMemo(() => {
    const total = selectedDateAgendas.length;
    const kritis = selectedDateAgendas.filter(a => a.urgency === 'KRITIS').length;
    const tinggi = selectedDateAgendas.filter(a => a.urgency === 'TINGGI').length;
    const rendah = selectedDateAgendas.filter(a => a.urgency === 'RENDAH').length;
    return { total, kritis, tinggi, rendah };
  }, [selectedDateAgendas]);

  // Total for today
  const todaySummaries = calendarMonthSummaries[realToday] || { total: 0, kritis: 0, tinggi: 0, rendah: 0 };

  return (
    <motion.section 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.05 }}
      id="operational-agenda-section"
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs p-4 sm:p-5 space-y-4"
    >
      {/* 1. Header Command Center Agenda & Quick Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-3.5">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-hajj-50 dark:bg-hajj-950/80 text-hajj-800 dark:text-gold-400 border border-hajj-200/70 dark:border-hajj-800 flex items-center justify-center font-bold text-base shadow-xs shrink-0">
            <i className="fa-solid fa-calendar-check"></i>
          </div>
          <div>
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Agenda & Prioritas Operasional
              </h3>
              
              {/* Urgency Counter Pills */}
              <div className="flex items-center space-x-1.5">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300/80 dark:border-rose-800 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                  <span>{todaySummaries.kritis} Kritis</span>
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300/80 dark:border-amber-800 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  <span>{todaySummaries.tinggi} Tinggi</span>
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-800 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>{todaySummaries.rendah} Rendah</span>
                </span>
              </div>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Klik tanggal pada kalender mini untuk memeriksa tugas operasional harian berdasarkan tingkat urgensi.
            </p>
          </div>
        </div>

        {/* View Mode Toggle & Modal Shortcuts */}
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto shrink-0">
          {/* View mode toggle */}
          <div className="inline-flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('SPLIT')}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'SPLIT'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
              title="Tampilan Kalender Mini & Kartu"
            >
              <i className="fa-solid fa-table-columns text-xs"></i>
              <span>Kalender Mini</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('WEEK')}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'WEEK'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
              title="Tampilan Strip 7 Hari"
            >
              <i className="fa-solid fa-calendar-week text-xs"></i>
              <span>Mingguan</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleResetToToday}
            className="px-2.5 py-1 bg-gold-50 dark:bg-gold-950/40 text-gold-800 dark:text-gold-300 border border-gold-300 dark:border-gold-700 rounded-lg text-xs font-bold transition hover:bg-gold-100 flex items-center gap-1.5 cursor-pointer"
            title="Kembali ke hari ini"
          >
            <i className="fa-solid fa-bullseye text-xs text-gold-600"></i>
            <span>Hari Ini</span>
          </button>

          <button
            type="button"
            onClick={() => openModal('modalAgendaList', { defaultFilter: agendaFilter })}
            className="px-2.5 py-1 bg-hajj-700 hover:bg-hajj-800 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <i className="fa-solid fa-list-check text-xs"></i>
            <span>Daftar Lengkap</span>
          </button>
        </div>
      </div>

      {/* 2. MAIN LAYOUT: SPLIT VIEW (Mini Calendar on Left + Compact Cards on Right) */}
      {viewMode === 'SPLIT' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          
          {/* PANEL KIRI: Kalender Mini Interaktif yang Dapat Diklik (4 Kolom di lg) */}
          <div className="lg:col-span-4 bg-slate-50/80 dark:bg-slate-800/60 rounded-xl border border-slate-200/90 dark:border-slate-700/80 p-3.5 space-y-3 shadow-2xs">
            {/* Calendar Month Header & Nav */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-200/80 dark:border-slate-700">
              <div className="flex items-center space-x-1.5">
                <i className="fa-regular fa-calendar text-hajj-700 dark:text-gold-400 text-xs"></i>
                <h4 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                  {monthNames[curMonth]} {curYear}
                </h4>
              </div>

              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                  title="Bulan sebelumnya"
                >
                  <i className="fa-solid fa-chevron-left text-xs"></i>
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                  title="Bulan berikutnya"
                >
                  <i className="fa-solid fa-chevron-right text-xs"></i>
                </button>
              </div>
            </div>

            {/* Mini Calendar Grid (7 columns) */}
            <div className="grid grid-cols-7 gap-1 text-center select-none">
              {/* Day headers */}
              {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map((dName, dIdx) => (
                <div 
                  key={dName} 
                  className={`text-[10px] font-bold py-1 ${dIdx === 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  {dName}
                </div>
              ))}

              {/* Day Cells */}
              {miniCalendarDays.map((day, idx) => {
                if (!day) {
                  return <div key={`empty-${idx}`} className="h-9"></div>;
                }

                const dNum = day.getDate();
                const dStr = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
                const isSelected = dStr === selectedDateStr;
                const isToday = dStr === realToday;
                const summary = calendarMonthSummaries[dStr] || { total: 0, kritis: 0, tinggi: 0, rendah: 0 };
                const hasKritis = summary.kritis > 0;
                const hasTinggi = summary.tinggi > 0;
                const hasRendah = summary.rendah > 0;

                return (
                  <button
                    key={`day-${dNum}`}
                    type="button"
                    onClick={() => setSelectedDateStr(dStr)}
                    className={`h-9.5 rounded-lg flex flex-col items-center justify-center relative transition-all duration-150 cursor-pointer ${
                      isSelected
                        ? 'bg-hajj-700 text-white font-black shadow-xs ring-2 ring-gold-400 scale-105 z-10'
                        : isToday
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700'
                    }`}
                    title={`${dNum} ${monthNames[curMonth]} ${curYear}: ${summary.total} Agenda (${summary.kritis} Kritis, ${summary.tinggi} Tinggi)`}
                  >
                    <span className="text-xs leading-none">{dNum}</span>

                    {/* Urgency indicator dots below date */}
                    <div className="flex items-center justify-center gap-0.5 mt-0.5 h-1.5">
                      {hasKritis && (
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-rose-300' : 'bg-rose-500 animate-pulse'}`}></span>
                      )}
                      {hasTinggi && (
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-amber-300' : 'bg-amber-500'}`}></span>
                      )}
                      {hasRendah && !hasKritis && !hasTinggi && (
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-emerald-200' : 'bg-emerald-500'}`}></span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Quick Navigation Toolbar */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 dark:border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => handleOffsetDay(-1)}
                className="px-2 py-1 bg-white dark:bg-slate-700 rounded-md border border-slate-200 dark:border-slate-600 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition cursor-pointer"
              >
                ‹ Kemarin
              </button>
              
              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                {selectedDateStr === realToday ? (
                  <span className="text-emerald-700 dark:text-emerald-400 font-extrabold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Hari Ini
                  </span>
                ) : (
                  <span>{formatIndonesianDate(selectedDateStr)}</span>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleOffsetDay(1)}
                className="px-2 py-1 bg-white dark:bg-slate-700 rounded-md border border-slate-200 dark:border-slate-600 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition cursor-pointer"
              >
                Besok ›
              </button>
            </div>

            {/* Legend / Petunjuk Kode Warna Urgensi */}
            <div className="bg-white dark:bg-slate-900/90 rounded-lg p-2.5 border border-slate-200/70 dark:border-slate-700/80 space-y-1.5 text-[10.5px]">
              <div className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <i className="fa-solid fa-palette text-gold-600 text-[10px]"></i>
                <span>Panduan Kode Warna Urgensi:</span>
              </div>
              <div className="grid grid-cols-1 gap-1 text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
                  <span><strong>Kritis:</strong> Terlambat, kendala AC/kunci, kamar butuh perbaikan.</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                  <span><strong>Tinggi:</strong> Kedatangan/pulang hari ini, sarapan siap antar, aula.</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                  <span><strong>Rendah:</strong> Reservasi terjadwal, kamar lolos QC, sarapan tuntas.</span>
                </div>
              </div>
            </div>
          </div>

          {/* PANEL KANAN: Kartu Kecil dengan Kode Warna Urgensi (8 Kolom di lg) */}
          <div className="lg:col-span-8 space-y-3">
            
            {/* Sub-bar Filter & Tanggal Terpilih */}
            <div className="bg-slate-50/90 dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Agenda {formatIndonesianDate(selectedDateStr)}:
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200">
                  {selectedDateCounts.total} Item
                </span>
                {selectedDateStr === realToday && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    Hari Ini
                  </span>
                )}
              </div>

              {/* Segmented Filter Urgensi */}
              <div className="inline-flex bg-white dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setUrgencyFilter('ALL')}
                  className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                    urgencyFilter === 'ALL'
                      ? 'bg-slate-800 dark:bg-slate-700 text-white font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Semua ({selectedDateCounts.total})
                </button>
                <button
                  type="button"
                  onClick={() => setUrgencyFilter('KRITIS')}
                  className={`px-2 py-1 rounded-md transition flex items-center gap-1 cursor-pointer ${
                    urgencyFilter === 'KRITIS'
                      ? 'bg-rose-600 text-white font-bold'
                      : 'text-rose-700 dark:text-rose-400 hover:bg-rose-50'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                  <span>Kritis ({selectedDateCounts.kritis})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUrgencyFilter('TINGGI')}
                  className={`px-2 py-1 rounded-md transition flex items-center gap-1 cursor-pointer ${
                    urgencyFilter === 'TINGGI'
                      ? 'bg-amber-600 text-white font-bold'
                      : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  <span>Tinggi ({selectedDateCounts.tinggi})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUrgencyFilter('RENDAH')}
                  className={`px-2 py-1 rounded-md transition flex items-center gap-1 cursor-pointer ${
                    urgencyFilter === 'RENDAH'
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>Rendah ({selectedDateCounts.rendah})</span>
                </button>
              </div>
            </div>

            {/* Category Filter Ribbon */}
            <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-1 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setAgendaFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg transition shrink-0 cursor-pointer border ${
                  agendaFilter === 'ALL'
                    ? 'bg-slate-800 text-white border-slate-800 font-bold'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                Semua Kategori
              </button>
              <button
                type="button"
                onClick={() => setAgendaFilter('CHECKIN')}
                className={`px-2.5 py-1 rounded-lg transition shrink-0 cursor-pointer border ${
                  agendaFilter === 'CHECKIN'
                    ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                Check-In
              </button>
              <button
                type="button"
                onClick={() => setAgendaFilter('CHECKOUT')}
                className={`px-2.5 py-1 rounded-lg transition shrink-0 cursor-pointer border ${
                  agendaFilter === 'CHECKOUT'
                    ? 'bg-blue-600 text-white border-blue-600 font-bold'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                Check-Out
              </button>
              <button
                type="button"
                onClick={() => setAgendaFilter('QC')}
                className={`px-2.5 py-1 rounded-lg transition shrink-0 cursor-pointer border ${
                  agendaFilter === 'QC'
                    ? 'bg-teal-600 text-white border-teal-600 font-bold'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                QC & Kebersihan
              </button>
              <button
                type="button"
                onClick={() => setAgendaFilter('BREAKFAST')}
                className={`px-2.5 py-1 rounded-lg transition shrink-0 cursor-pointer border ${
                  agendaFilter === 'BREAKFAST'
                    ? 'bg-amber-600 text-white border-amber-600 font-bold'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                Dapur & Sarapan
              </button>
              <button
                type="button"
                onClick={() => setAgendaFilter('MAINTENANCE')}
                className={`px-2.5 py-1 rounded-lg transition shrink-0 cursor-pointer border ${
                  agendaFilter === 'MAINTENANCE'
                    ? 'bg-rose-600 text-white border-rose-600 font-bold'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                Perbaikan Kendala
              </button>
              <button
                type="button"
                onClick={() => setAgendaFilter('AULA')}
                className={`px-2.5 py-1 rounded-lg transition shrink-0 cursor-pointer border ${
                  agendaFilter === 'AULA'
                    ? 'bg-purple-600 text-white border-purple-600 font-bold'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                Aula & Rapat
              </button>
            </div>

            {/* Grid Kartu Kecil dengan Kode Warna Urgensi */}
            {filteredAgendas.length === 0 ? (
              <div className="py-12 px-4 text-center bg-slate-50/60 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 space-y-2">
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xl">
                  <i className="fa-solid fa-calendar-check"></i>
                </div>
                <h5 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Tidak Ada Agenda Operasional Tertunda
                </h5>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Semua tugas pada tanggal {formatIndonesianDate(selectedDateStr)} telah terselesaikan atau tidak memiliki antrean mendesak.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => openModal('modalCheckin')}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                  >
                    + Check-In / Reservasi Baru
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                <AnimatePresence>
                  {filteredAgendas.map((item) => {
                    // Card Urgency Color Coding
                    const isKritis = item.urgency === 'KRITIS';
                    const isTinggi = item.urgency === 'TINGGI';

                    const cardBg = isKritis
                      ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-300 dark:border-rose-900/80 border-l-4 border-l-rose-500 hover:border-rose-400'
                      : isTinggi
                        ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-900/80 border-l-4 border-l-amber-500 hover:border-amber-400'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 border-l-4 border-l-emerald-500 hover:border-emerald-400';

                    const urgencyBadge = isKritis ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-700 flex items-center gap-1 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                        KRITIS
                      </span>
                    ) : isTinggi ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 flex items-center gap-1 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        TINGGI
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 flex items-center gap-1 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        RENDAH
                      </span>
                    );

                    return (
                      <motion.div
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        key={item.id}
                        className={`rounded-xl p-3 border shadow-2xs transition-all duration-150 flex flex-col justify-between space-y-2.5 ${cardBg}`}
                      >
                        {/* Header: Kategori + Unit + Urgency Badge */}
                        <div>
                          <div className="flex items-center justify-between gap-1.5 pb-1.5 border-b border-black/5 dark:border-white/5">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1 ${item.categoryBadgeClass}`}>
                              <i className={`fa-solid ${item.categoryIcon} text-[9px]`}></i>
                              <span className="truncate">{item.categoryLabel}</span>
                            </span>
                            
                            {urgencyBadge}
                          </div>

                          {/* Room Number & Title */}
                          <div className="mt-2 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {item.roomNumber && (
                                <span className="px-1.5 py-0.2 bg-black/5 dark:bg-white/10 rounded font-mono font-bold text-[10.5px] text-slate-800 dark:text-slate-200">
                                  {item.roomNumber}
                                </span>
                              )}
                              <h6 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate max-w-[170px]" title={item.title}>
                                {item.title}
                              </h6>
                            </div>
                            
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate" title={item.subtitle}>
                              {item.subtitle}
                            </p>
                          </div>

                          {/* Reason or Tags */}
                          {item.urgencyReason && (
                            <div className="mt-1.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
                              <i className="fa-solid fa-circle-info text-[9px] text-slate-400"></i>
                              <span className="truncate">{item.urgencyReason}</span>
                            </div>
                          )}

                          {item.tags && item.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {item.tags.map((tag, tIdx) => (
                                <span key={tIdx} className={`px-1.5 py-0.2 rounded text-[9.5px] border ${tag.color}`}>
                                  {tag.label}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Actions Footer */}
                        <div className="pt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between gap-1 text-xs">
                          {item.secondaryActionLabel && item.onSecondaryAction ? (
                            <button
                              type="button"
                              onClick={item.onSecondaryAction}
                              className="text-[10.5px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline cursor-pointer truncate"
                            >
                              {item.secondaryActionLabel}
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-mono">
                              {item.building || 'Asrama'}
                            </span>
                          )}

                          {item.actionLabel && item.onAction && (
                            <button
                              type="button"
                              onClick={item.onAction}
                              className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer shrink-0 ${item.actionClass || 'bg-hajj-700 text-white'}`}
                            >
                              {item.actionIcon && <i className={`fa-solid ${item.actionIcon} text-[9px]`}></i>}
                              <span>{item.actionLabel}</span>
                            </button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>

        </div>
      ) : (
        /* 3. ALTERNATIVE LAYOUT: 7-DAY WEEKLY STRIP (Tampilan Strip 7 Hari) */
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-300">
              Pratinjau Agenda 7 Hari: {formatIndonesianDate(currentWeekDays[0])} s/d {formatIndonesianDate(currentWeekDays[6])}
            </span>
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => handleOffsetDay(-7)}
                className="px-2 py-1 bg-white dark:bg-slate-700 rounded-md border text-[11px] font-bold cursor-pointer"
              >
                ‹ Minggu Lalu
              </button>
              <button
                type="button"
                onClick={handleResetToToday}
                className="px-2 py-1 bg-gold-50 dark:bg-gold-950/40 text-gold-800 dark:text-gold-300 rounded-md border border-gold-300 text-[11px] font-bold cursor-pointer"
              >
                Minggu Ini
              </button>
              <button
                type="button"
                onClick={() => handleOffsetDay(7)}
                className="px-2 py-1 bg-white dark:bg-slate-700 rounded-md border text-[11px] font-bold cursor-pointer"
              >
                Minggu Depan ›
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
            {currentWeekDays.map((wDate) => {
              const [wy, wm, wd] = wDate.split('-').map(Number);
              const wObj = new Date(wy, wm - 1, wd);
              const dayName = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][wObj.getDay()];
              const isSelected = wDate === selectedDateStr;
              const isToday = wDate === realToday;
              const dayAgendas = generateAgendasForDate(wDate);
              const order: Record<AgendaUrgency, number> = { KRITIS: 1, TINGGI: 2, RENDAH: 3 };
              const sorted = [...dayAgendas].sort((a, b) => order[a.urgency] - order[b.urgency]);

              return (
                <div
                  key={wDate}
                  onClick={() => setSelectedDateStr(wDate)}
                  className={`rounded-xl border p-2.5 flex flex-col justify-between transition cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-500 ring-2 ring-emerald-500/40'
                      : isToday
                        ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800'
                        : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  {/* Day Header */}
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-700 text-xs">
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{dayName}</span>
                      <span className="text-[10px] text-slate-500 ml-1">{wd}</span>
                    </div>
                    {isToday && (
                      <span className="px-1 py-0.2 bg-amber-200 text-amber-900 rounded text-[9px] font-bold">
                        Hari Ini
                      </span>
                    )}
                    <span className="px-1.5 py-0.2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded font-mono text-[10px] font-bold">
                      {sorted.length}
                    </span>
                  </div>

                  {/* Mini Cards inside Day Column */}
                  <div className="space-y-1.5 mt-2 flex-grow min-h-[140px]">
                    {sorted.length === 0 ? (
                      <div className="text-[10px] text-slate-400 italic text-center py-4">
                        Tidak ada tugas
                      </div>
                    ) : (
                      sorted.slice(0, 3).map((item) => {
                        const isKritis = item.urgency === 'KRITIS';
                        const isTinggi = item.urgency === 'TINGGI';

                        const miniBg = isKritis
                          ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                          : isTinggi
                            ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                            : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-300';

                        return (
                          <div
                            key={item.id}
                            className={`p-1.5 rounded-lg border text-[10px] shadow-2xs ${miniBg}`}
                            title={`${item.categoryLabel}: ${item.title}`}
                          >
                            <div className="flex items-center justify-between gap-1 font-bold">
                              <span className="truncate">{item.roomNumber || item.categoryLabel}</span>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isKritis ? 'bg-rose-500 animate-pulse' : isTinggi ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                            </div>
                            <div className="truncate text-slate-600 dark:text-slate-400 text-[9.5px]">
                              {item.title}
                            </div>
                          </div>
                        );
                      })
                    )}
                    {sorted.length > 3 && (
                      <div className="text-[9.5px] text-slate-500 font-bold text-center pt-0.5">
                        +{sorted.length - 3} lainnya...
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </motion.section>
  );
}
