import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  useAppContext, 
  isSuperAdmin, 
  isRecepRole, 
  isTeknisiRole, 
  isQcRole, 
  isKoperasiRole,
  isKeuanganRole 
} from '../store';
import { getRealTodayDate, formatIndonesianDate, addDaysToDateStr } from '../lib/utils';
import { useBodyScrollLock } from '../lib/scrollLock';

export interface OperationalAlert {
  id: string;
  type: 'CHECKIN_TODAY' | 'CHECKOUT_TODAY' | 'BREAKFAST' | 'MAINTENANCE' | 'QC';
  division: 'RESEPSIONIS' | 'KOPERASI' | 'TEKNISI' | 'QC';
  title: string;
  subtitle: string;
  roomNumber?: string;
  building?: string;
  categoryBadge: string;
  severity: 'URGENT' | 'HIGH' | 'NORMAL';
  actionLabel: string;
  actionTab: string;
  modalToOpen?: string;
  modalData?: any;
}

/**
 * Helper to match user's assigned building with alert's building
 */
function matchesAssignedBuilding(assignedBuilding?: string, itemBuilding?: string): boolean {
  if (!assignedBuilding || assignedBuilding === 'Semua Gedung' || assignedBuilding === 'Semua' || assignedBuilding === '-') {
    return true;
  }
  const userB = assignedBuilding.toLowerCase();
  if (userB.includes('pusat komando') || userB.includes('kawasan') || userB.includes('terpadu') || userB.includes('seluruh') || userB.includes('penjamin mutu') || userB.includes('sarana & prasarana')) {
    return true;
  }
  if (!itemBuilding) return true;

  const itemB = itemBuilding.toLowerCase();

  // Gedung A & B
  if (userB.includes('gedung a') && itemB.includes('gedung a')) return true;
  if (userB.includes('gedung b') && itemB.includes('gedung b')) return true;
  if (userB.includes('gedung c') && itemB.includes('gedung c')) return true;
  if (userB.includes('gedung d') && itemB.includes('gedung d')) return true;
  if ((userB.includes('aula') || userB.includes('sg') || userB.includes('pertemuan')) && (itemB.includes('aula') || itemB.includes('sg') || itemB.includes('pertemuan') || itemB.includes('multipurpose'))) return true;

  return itemB.includes(userB) || userB.includes(itemB);
}

export function getOperationalAlerts(
  currentUser: any,
  rooms: any[],
  transactions: any[],
  maintenances: any[],
  realToday: string,
  breakfastOrders: any[] = []
): OperationalAlert[] {
  if (!currentUser) return [];
  const list: OperationalAlert[] = [];
  const role = currentUser.role || '';
  const canSeeRecep = isRecepRole(role);
  const canSeeKoperasi = isKoperasiRole(role);
  const canSeeTeknisi = isTeknisiRole(role);
  const canSeeQc = isQcRole(role);

  if (canSeeRecep) {
    transactions.forEach(tx => {
      const isAula = tx.building === 'Ruang Pertemuan';
      if (isAula) {
        if (tx.startDate === realToday) {
          if (matchesAssignedBuilding(currentUser.assignedBuilding, tx.building)) {
            list.push({
              id: `alert-aula-${tx.id}`,
              type: 'CHECKIN_TODAY',
              division: 'RESEPSIONIS',
              title: `Acara Berlangsung Hari Ini: ${tx.guestName}`,
              subtitle: `${tx.building} • ${tx.roomNumber} • Otomatis Terlaksana Hari Ini • Durasi ${tx.duration} Jam`,
              roomNumber: tx.roomNumber,
              building: tx.building,
              categoryBadge: 'Acara Aula Hari Ini',
              severity: 'HIGH',
              actionLabel: 'Lihat Rincian Gedung',
              actionTab: 'gedung',
              modalToOpen: 'modalRoomDetail',
              modalData: { roomId: tx.roomId }
            });
          }
        }
      } else {
        const isTodayCheckin = tx.startDate === realToday;
        const isPendingCheckin = tx.status === 'BOOKED' && (tx.startDate <= realToday);

        if (isPendingCheckin || (isTodayCheckin && tx.status === 'BOOKED')) {
          if (matchesAssignedBuilding(currentUser.assignedBuilding, tx.building)) {
            list.push({
              id: `alert-checkin-${tx.id}`,
              type: 'CHECKIN_TODAY',
              division: 'RESEPSIONIS',
              title: `Check-In Hari Ini: ${tx.guestName}`,
              subtitle: `${tx.building} • Kamar ${tx.roomNumber} (${tx.category === 'JEMAAH' ? `Kloter ${tx.kloter}` : 'Umum'}) • Durasi ${tx.duration} ${tx.durationUnit || 'Malam'}`,
              roomNumber: tx.roomNumber,
              building: tx.building,
              categoryBadge: 'Jadwal Check-In',
              severity: 'HIGH',
              actionLabel: 'Rincian & Check-In',
              actionTab: 'gedung',
              modalToOpen: 'modalRoomDetail',
              modalData: { roomId: tx.roomId }
            });
          }
        }
      }
    });

    transactions.forEach(tx => {
      if (tx.building === 'Ruang Pertemuan') return;

      if (tx.status === 'TERISI') {
        const checkoutDate = addDaysToDateStr(tx.startDate, tx.duration);
        if (checkoutDate <= realToday) {
          if (matchesAssignedBuilding(currentUser.assignedBuilding, tx.building)) {
            list.push({
              id: `alert-checkout-${tx.id}`,
              type: 'CHECKOUT_TODAY',
              division: 'RESEPSIONIS',
              title: `Jadwal Check-Out Hari Ini: ${tx.roomNumber}`,
              subtitle: `${tx.guestName} (${tx.building}) • Jatuh tempo hari ini (${formatIndonesianDate(checkoutDate)})`,
              roomNumber: tx.roomNumber,
              building: tx.building,
              categoryBadge: 'Jadwal Check-Out',
              severity: checkoutDate < realToday ? 'URGENT' : 'HIGH',
              actionLabel: 'Proses Check-Out',
              actionTab: 'gedung',
              modalToOpen: 'modalCheckoutSelection',
              modalData: { roomId: tx.roomId, type: 'CHECKOUT' }
            });
          }
        }
      }
    });
  }

  if (canSeeKoperasi) {
    const processedTxIds = new Set<string>();

    // 1. Dari transaksi kamar yang memesan sarapan
    transactions.forEach(tx => {
      // Logic Batal: Jika status transaksi batal atau status sarapan dibatalkan, langsung abaikan
      if (tx.status === 'DIBATALKAN' || tx.breakfastStatus === 'DIBATALKAN') return;

      // Jika tidak memesan sarapan atau paket catering diset TIDAK, abaikan
      const hasBreakfast = Boolean(tx.breakfast) && (!tx.cateringPackage || tx.cateringPackage !== 'TIDAK');
      if (!hasBreakfast) return;

      // Logic Selesai: Jika status sarapan sudah SELESAI atau transaksi sudah selesai (checkout), otomatis hilang
      if (tx.breakfastStatus === 'SELESAI' || tx.status === 'SELESAI') return;

      // Status aktif: MENUNGGU, SEDANG_DIBUAT (dimasak), atau PENGANTARAN
      const bStatus = tx.breakfastStatus || 'MENUNGGU';
      if (bStatus !== 'MENUNGGU' && bStatus !== 'SEDANG_DIBUAT' && bStatus !== 'PENGANTARAN') return;

      if (!matchesAssignedBuilding(currentUser.assignedBuilding, tx.building)) return;

      processedTxIds.add(tx.id);

      const isWaiting = bStatus === 'MENUNGGU';
      const isMaking = bStatus === 'SEDANG_DIBUAT';
      const statusLabel = isWaiting ? 'Menunggu Dapur' : isMaking ? 'Sedang Dimasak' : 'Pengantaran';

      list.push({
        id: `alert-breakfast-tx-${tx.id}`,
        type: 'BREAKFAST',
        division: 'KOPERASI',
        title: `Pesanan Sarapan: Kamar ${tx.roomNumber} (${tx.breakfastPortions || 4} Porsi)`,
        subtitle: `${tx.breakfastMenu || 'Sarapan Standar'} • Kamar ${tx.roomNumber} (${tx.guestName}) • Status: ${statusLabel}`,
        roomNumber: tx.roomNumber,
        building: tx.building,
        categoryBadge: 'Pesanan Sarapan',
        severity: isWaiting ? 'HIGH' : 'NORMAL',
        actionLabel: 'Buka Dapur Sarapan',
        actionTab: 'pesananSarapan',
        modalToOpen: 'modalBreakfastDetail',
        modalData: tx
      });
    });

    // 2. Dari daftar pesanan sarapan mandiri (breakfastOrders) jika ada
    (breakfastOrders || []).forEach(order => {
      // Logic Batal: Jika pesanan dibatalkan, langsung abaikan
      if (order.status === 'DIBATALKAN') return;

      // Logic Selesai: Jika pesanan selesai, otomatis hilang
      if (order.status === 'SELESAI') return;

      // Cek apakah sudah terproses dari transaksi kamar
      if (order.transactionId && processedTxIds.has(order.transactionId)) return;
      if (order.id && typeof order.id === 'string' && order.id.startsWith('BO-TX-')) {
        const rawTxId = order.id.replace('BO-TX-', '').split('-')[0];
        if (processedTxIds.has(rawTxId)) return;
      }

      // Cek transaksi tertaut
      const matchedTx = transactions.find(t => 
        (order.transactionId && t.id === order.transactionId) ||
        (t.roomNumber === order.roomNumber && t.guestName === order.guestName)
      );
      if (matchedTx) {
        if (matchedTx.status === 'DIBATALKAN' || matchedTx.breakfastStatus === 'DIBATALKAN') return;
        if (matchedTx.breakfastStatus === 'SELESAI' || matchedTx.status === 'SELESAI') return;
        if (!matchedTx.breakfast || matchedTx.cateringPackage === 'TIDAK') return;
      }

      // Status aktif: MENUNGGU, SEDANG_DIBUAT, PENGANTARAN
      const oStatus = order.status || 'MENUNGGU';
      if (oStatus !== 'MENUNGGU' && oStatus !== 'SEDANG_DIBUAT' && oStatus !== 'PENGANTARAN') return;

      if (!matchesAssignedBuilding(currentUser.assignedBuilding, order.building)) return;

      const isWaiting = oStatus === 'MENUNGGU';
      const isMaking = oStatus === 'SEDANG_DIBUAT';
      const statusLabel = isWaiting ? 'Menunggu Dapur' : isMaking ? 'Sedang Dimasak' : 'Pengantaran';

      list.push({
        id: `alert-breakfast-order-${order.id}`,
        type: 'BREAKFAST',
        division: 'KOPERASI',
        title: `Pesanan Sarapan: Kamar ${order.roomNumber} (${order.portions || 1} Porsi)`,
        subtitle: `${order.menuName || 'Sarapan Standar'} • Kamar ${order.roomNumber} (${order.guestName}) • Status: ${statusLabel}`,
        roomNumber: order.roomNumber,
        building: order.building,
        categoryBadge: 'Pesanan Sarapan',
        severity: isWaiting ? 'HIGH' : 'NORMAL',
        actionLabel: 'Buka Dapur Sarapan',
        actionTab: 'pesananSarapan',
        modalToOpen: 'modalBreakfastDetail',
        modalData: order
      });
    });
  }

  if (canSeeTeknisi) {
    maintenances.forEach(m => {
      if (m.status !== 'SELESAI') {
        if (matchesAssignedBuilding(currentUser.assignedBuilding, m.building)) {
          const isUrgent = m.urgency === 'Urgent';
          const isUnassigned = m.status === 'MENUNGGU_PENUGASAN';
          const isAssignedToMe = m.assignedTechnicianId === currentUser.id || m.technician === currentUser.username || m.assignedTechnicianName === currentUser.fullName;

          list.push({
            id: `alert-maint-${m.id}`,
            type: 'MAINTENANCE',
            division: 'TEKNISI',
            title: `${isUrgent ? 'DARURAT: ' : ''}Maintenance Kamar ${m.roomNumber}`,
            subtitle: `${m.building} • ${m.category}: "${m.description}" • ${isAssignedToMe ? '★ Ditugaskan Kepada Anda' : isUnassigned ? 'Belum Ada Teknisi' : `Teknisi: ${m.assignedTechnicianName || m.technician}`}`,
            roomNumber: m.roomNumber,
            building: m.building,
            categoryBadge: isUrgent ? 'Maintenance Urgent' : 'Perawatan Fasilitas',
            severity: isUrgent ? 'URGENT' : isUnassigned ? 'HIGH' : 'NORMAL',
            actionLabel: 'Tindak Lanjut Perbaikan',
            actionTab: 'laporanMaintenance',
            modalToOpen: 'modalMaintenanceDetail',
            modalData: m
          });
        }
      }
    });
  }

  if (canSeeQc) {
    rooms.forEach(r => {
      if (r.qcStatus === 'MENUNGGU_QC' || r.qcStatus === 'PERLU_INSPEKSI' || r.qcStatus === 'PERLU_PERBAIKAN') {
        if (matchesAssignedBuilding(currentUser.assignedBuilding, r.building)) {
          const isPostRepair = r.qcStatus === 'MENUNGGU_QC';
          const isDamaged = r.qcStatus === 'PERLU_PERBAIKAN';

          list.push({
            id: `alert-qc-${r.id}`,
            type: 'QC',
            division: 'QC',
            title: `Inspeksi QC: ${r.roomNumber} (${r.type || 'Kamar'})`,
            subtitle: `${r.building} • ${isPostRepair ? 'Menunggu verifikasi siap huni pasca perbaikan' : isDamaged ? 'Tercatat bermasalah / butuh penanganan' : 'Jadwal inspeksi berkala kesiapan kamar'}`,
            roomNumber: r.roomNumber,
            building: r.building,
            categoryBadge: 'Quality Control',
            severity: isPostRepair ? 'HIGH' : 'NORMAL',
            actionLabel: 'Inspeksi & Verifikasi QC',
            actionTab: 'qualityControl',
            modalToOpen: 'modalQcInspection',
            modalData: r
          });
        }
      }
    });
  }

  const severityOrder = { URGENT: 0, HIGH: 1, NORMAL: 2 };
  return list.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

export function OperationalNotifications() {
  const {
    currentUser,
    rooms,
    transactions,
    maintenances,
    breakfastOrders = [],
    setActiveTab,
    openModal
  } = useAppContext();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');
  const [urgencyFilter, setUrgencyFilter] = useState<'ALL' | 'URGENT'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useBodyScrollLock(isOpen && isMobile);

  const realToday = getRealTodayDate();

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (!currentUser) return null;

  const role = currentUser.role || '';
  const isSuper = isSuperAdmin(role);
  const canSeeRecep = isRecepRole(role);
  const canSeeKoperasi = isKoperasiRole(role);
  const canSeeTeknisi = isTeknisiRole(role);
  const canSeeQc = isQcRole(role);
  const canSeeKeuangan = isKeuanganRole(role, currentUser.department);

  // Compute operational alerts filtered by user's division and assigned building
  const alerts = useMemo<OperationalAlert[]>(() => {
    return getOperationalAlerts(currentUser, rooms, transactions, maintenances, realToday, breakfastOrders);
  }, [rooms, transactions, maintenances, realToday, currentUser, breakfastOrders]);

  // Counts specific to user's division
  const counts = useMemo(() => {
    return {
      total: alerts.length,
      urgent: alerts.filter(a => a.severity === 'URGENT').length,
      checkin: alerts.filter(a => a.type === 'CHECKIN_TODAY').length,
      checkout: alerts.filter(a => a.type === 'CHECKOUT_TODAY').length,
      breakfast: alerts.filter(a => a.type === 'BREAKFAST').length,
      maintenance: alerts.filter(a => a.type === 'MAINTENANCE').length,
      qc: alerts.filter(a => a.type === 'QC').length
    };
  }, [alerts]);

  // Available filter tabs
  const filterTabs = useMemo(() => {
    const tabs: { id: string; label: string; count: number; icon: string; badgeColor: string }[] = [
      { id: 'ALL', label: 'Semua Divisi Saya', count: counts.total, icon: 'fa-layer-group', badgeColor: 'bg-slate-700 text-white' }
    ];

    if (canSeeRecep) {
      tabs.push({ id: 'CHECKIN', label: 'Check-In', count: counts.checkin, icon: 'fa-calendar-check', badgeColor: 'bg-emerald-700 text-white' });
      tabs.push({ id: 'CHECKOUT', label: 'Check-Out', count: counts.checkout, icon: 'fa-door-open', badgeColor: 'bg-blue-700 text-white' });
    }
    if (canSeeKoperasi) {
      tabs.push({ id: 'BREAKFAST', label: 'Sarapan', count: counts.breakfast, icon: 'fa-utensils', badgeColor: 'bg-amber-600 text-white' });
    }
    if (canSeeTeknisi) {
      tabs.push({ id: 'MAINTENANCE', label: 'Maintenance', count: counts.maintenance, icon: 'fa-wrench', badgeColor: 'bg-red-700 text-white' });
    }
    if (canSeeQc) {
      tabs.push({ id: 'QC', label: 'Quality Control', count: counts.qc, icon: 'fa-shield-check', badgeColor: 'bg-purple-700 text-white' });
    }

    return tabs;
  }, [canSeeRecep, canSeeKoperasi, canSeeTeknisi, canSeeQc, counts]);

  // Filtered alerts with search & urgency
  const filteredAlerts = useMemo(() => {
    let result = alerts;
    if (selectedFilter !== 'ALL') {
      if (selectedFilter === 'CHECKIN') result = result.filter(a => a.type === 'CHECKIN_TODAY');
      else if (selectedFilter === 'CHECKOUT') result = result.filter(a => a.type === 'CHECKOUT_TODAY');
      else if (selectedFilter === 'BREAKFAST') result = result.filter(a => a.type === 'BREAKFAST');
      else if (selectedFilter === 'MAINTENANCE') result = result.filter(a => a.type === 'MAINTENANCE');
      else if (selectedFilter === 'QC') result = result.filter(a => a.type === 'QC');
    }

    if (urgencyFilter === 'URGENT') {
      result = result.filter(a => a.severity === 'URGENT' || a.severity === 'HIGH');
    }

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      result = result.filter(a => 
        a.title.toLowerCase().includes(q) || 
        a.subtitle.toLowerCase().includes(q) || 
        (a.roomNumber && a.roomNumber.toLowerCase().includes(q)) ||
        (a.building && a.building.toLowerCase().includes(q))
      );
    }

    return result;
  }, [alerts, selectedFilter, urgencyFilter, searchQuery]);

  const handleAction = (alert: OperationalAlert) => {
    setIsOpen(false);
    if (alert.modalToOpen) {
      openModal(alert.modalToOpen as any, alert.modalData);
    }
    setActiveTab(alert.actionTab as any);
  };

  const divisionLabel = isSuper 
    ? 'Akses Pimpinan (Seluruh Divisi)' 
    : canSeeKeuangan
    ? 'Divisi Keuangan & Perbendaharaan'
    : canSeeRecep 
    ? 'Divisi Resepsionis' 
    : canSeeTeknisi 
    ? 'Divisi Teknisi & Perawatan Fasilitas' 
    : canSeeQc 
    ? 'Divisi Quality Control' 
    : canSeeKoperasi 
    ? 'Divisi Koperasi & Konsumsi' 
    : currentUser.department || 'Divisi Operasional';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className={`relative w-7 h-7 sm:w-8 sm:h-8 rounded-md sm:rounded-lg transition-all flex items-center justify-center border text-xs font-semibold shadow-xs cursor-pointer ${
          counts.urgent > 0
            ? 'bg-red-500/30 hover:bg-red-500/40 border-red-400 text-white animate-pulse'
            : counts.total > 0
            ? 'bg-gold-500/25 hover:bg-gold-500/35 border-gold-400/50 text-gold-300'
            : 'bg-white/15 hover:bg-white/25 border-white/20 text-white'
        }`}
        title={`Pemberitahuan Operasional (${divisionLabel})`}
      >
        <div className="relative flex items-center justify-center">
          <i className="fa-solid fa-bell text-xs sm:text-sm text-gold-300"></i>
          {counts.total > 0 && (
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              {counts.urgent > 0 && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${counts.urgent > 0 ? 'bg-red-500' : 'bg-gold-400'}`}></span>
            </span>
          )}
        </div>

        {counts.total > 0 && (
          <span className="absolute -bottom-1 -right-1 px-1 py-0 rounded-full text-[8px] font-black bg-gold-500 text-slate-900 leading-none">
            {counts.total}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-xs lg:bg-transparent lg:inset-auto lg:p-0 lg:absolute lg:right-0 lg:top-full lg:mt-2 lg:z-40">
          {/* Mobile & Tablet backdrop */}
          <div 
            className="fixed inset-0 bg-transparent lg:hidden" 
            onClick={() => setIsOpen(false)} 
          />

          <div className="relative z-10 w-full h-full sm:h-auto sm:max-h-[86vh] sm:max-w-lg md:max-w-xl lg:w-[460px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-xs flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Header Panel */}
            <div className="p-3 sm:p-3.5 bg-gradient-to-r from-hajj-950 via-hajj-900 to-slate-900 text-white flex items-center justify-between border-b border-gold-500/30 shrink-0">
              <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0 pr-2">
                <div className="w-8 h-8 rounded-xl bg-gold-500 text-slate-900 flex items-center justify-center font-bold text-xs sm:text-sm shadow shrink-0">
                  <i className="fa-solid fa-bell-concierge"></i>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-xs sm:text-sm text-white truncate">Pusat Notifikasi Operasional</h3>
                    {counts.urgent > 0 && (
                      <span className="px-1.5 py-0.2 bg-red-600 text-white text-[9px] font-black rounded uppercase animate-pulse shrink-0">
                        {counts.urgent} Urgent
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-gold-300 font-medium truncate">
                    {divisionLabel} {currentUser.assignedBuilding && currentUser.assignedBuilding !== 'Semua Gedung' ? `• Area ${currentUser.assignedBuilding}` : ''}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer text-xs shrink-0"
                title="Tutup Panel Notifikasi"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* Search & Urgency Filter Bar */}
            <div className="p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700/80 space-y-2 shrink-0">
              <div className="relative">
                <i className="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-slate-400 text-xs"></i>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Cari nomor kamar, tamu, atau gedung..."
                  className="w-full pl-8 pr-7 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-gold-500 transition"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between gap-1.5">
                {/* Category Filter Tabs */}
                <div className="flex items-center space-x-1 overflow-x-auto custom-scrollbar pb-0.5 flex-1">
                  {filterTabs.map(tab => {
                    const isActive = selectedFilter === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setSelectedFilter(tab.id)}
                        className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[10px] font-bold whitespace-nowrap transition flex items-center space-x-1 cursor-pointer ${
                          isActive
                            ? `${tab.badgeColor} shadow-2xs`
                            : 'bg-white dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <i className={`fa-solid ${tab.icon} text-[9px]`}></i>
                        <span>{tab.label}</span>
                        <span className="text-[9px] opacity-80">({tab.count})</span>
                      </button>
                    );
                  })}
                </div>

                {/* Urgency Quick Toggle */}
                <button
                  type="button"
                  onClick={() => setUrgencyFilter(prev => prev === 'ALL' ? 'URGENT' : 'ALL')}
                  className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[10px] font-bold transition flex items-center space-x-1 shrink-0 cursor-pointer ${
                    urgencyFilter === 'URGENT'
                      ? 'bg-red-600 text-white shadow-2xs'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                  title="Saring agenda prioritas tinggi/darurat"
                >
                  <i className="fa-solid fa-bolt"></i>
                  <span>{urgencyFilter === 'URGENT' ? 'Urgent Saja' : 'Semua'}</span>
                </button>
              </div>
            </div>

            {/* List of Notifications */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 sm:p-3 space-y-2 bg-slate-100/70 dark:bg-slate-950/40 max-h-[50vh] sm:max-h-[52vh]">
              {filteredAlerts.length === 0 ? (
                <div className="text-center py-10 px-4 space-y-1.5 text-slate-500 dark:text-slate-400">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto text-base shadow-inner">
                    <i className="fa-solid fa-circle-check"></i>
                  </div>
                  <p className="font-bold text-xs text-slate-800 dark:text-slate-200">Semua tugas operasional terkendali!</p>
                  <p className="text-[10px] text-slate-500">
                    {searchQuery ? `Tidak ditemukan notifikasi dengan kata kunci "${searchQuery}".` : 'Tidak ada agenda tertunda untuk filter divisi ini.'}
                  </p>
                </div>
              ) : (
                filteredAlerts.map(item => {
                  let badgeStyle = 'bg-slate-100 text-slate-700 border-slate-200';
                  let icon = 'fa-circle-info';
                  let borderHighlight = 'border-slate-200 dark:border-slate-800';

                  if (item.type === 'CHECKIN_TODAY') {
                    badgeStyle = 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700';
                    icon = 'fa-calendar-check text-emerald-600 dark:text-emerald-400';
                  } else if (item.type === 'CHECKOUT_TODAY') {
                    badgeStyle = 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700';
                    icon = 'fa-door-open text-blue-600 dark:text-blue-400';
                  } else if (item.type === 'BREAKFAST') {
                    badgeStyle = 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700';
                    icon = 'fa-utensils text-amber-600 dark:text-amber-400';
                  } else if (item.type === 'MAINTENANCE') {
                    badgeStyle = item.severity === 'URGENT' ? 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 border-red-300 dark:border-red-700' : 'bg-orange-50 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-700';
                    icon = 'fa-triangle-exclamation text-red-600 dark:text-red-400';
                    borderHighlight = item.severity === 'URGENT' ? 'border-red-400 bg-red-50/50 dark:bg-red-950/20 shadow-xs' : borderHighlight;
                  } else if (item.type === 'QC') {
                    badgeStyle = 'bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-700';
                    icon = 'fa-shield-halved text-purple-600 dark:text-purple-400';
                  }

                  return (
                    <div
                      key={item.id}
                      className={`bg-white dark:bg-slate-800 rounded-xl p-2.5 sm:p-3 border transition-all shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 ${borderHighlight} hover:border-gold-400 group`}
                    >
                      <div className="flex items-start space-x-2.5">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-xs shrink-0 mt-0.5 shadow-2xs">
                          <i className={`fa-solid ${icon}`}></i>
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${badgeStyle}`}>
                              {item.categoryBadge}
                            </span>
                            {item.severity === 'URGENT' && (
                              <span className="px-1.5 py-0.2 bg-red-600 text-white rounded text-[9px] font-black animate-pulse">
                                DARURAT
                              </span>
                            )}
                            {item.roomNumber && (
                              <span className="font-bold text-slate-900 dark:text-slate-100 text-[11px] sm:text-xs">
                                Kamar {item.roomNumber}
                              </span>
                            )}
                          </div>

                          <h4 className="font-semibold text-xs text-slate-900 dark:text-slate-100 leading-tight">
                            {item.title}
                          </h4>
                          <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                            {item.subtitle}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAction(item)}
                        className="px-3 py-1.5 bg-hajj-900 hover:bg-hajj-800 text-white rounded-lg text-[11px] font-bold transition flex items-center justify-center space-x-1.5 self-end sm:self-center shrink-0 shadow-2xs cursor-pointer group-hover:bg-gold-600 group-hover:text-slate-900"
                      >
                        <span>{item.actionLabel}</span>
                        <i className="fa-solid fa-arrow-right text-[9px]"></i>
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-2.5 sm:p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300 shrink-0">
              <span className="flex items-center space-x-1.5 truncate pr-2">
                <i className="fa-solid fa-shield-halved text-gold-600 shrink-0"></i>
                <span className="truncate">{filteredAlerts.length} agenda aktif untuk {divisionLabel}.</span>
              </span>
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setActiveTab('gedung');
                  }}
                  className="text-hajj-700 dark:text-gold-400 font-bold hover:underline cursor-pointer text-xs"
                >
                  Denah Gedung →
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="lg:hidden px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-bold text-xs cursor-pointer"
                >
                  Tutup Notifikasi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Quick Operational Ribbon for Sub-Header
 * Shows real-time highlights of agendas strictly relevant to the logged-in user's division
 */
export function OperationalSummaryRibbon() {
  const { currentUser, rooms, transactions, maintenances, breakfastOrders = [], setActiveTab } = useAppContext();
  const realToday = getRealTodayDate();

  const role = currentUser?.role || '';
  const canSeeRecep = isRecepRole(role);
  const canSeeKoperasi = isKoperasiRole(role);
  const canSeeTeknisi = isTeknisiRole(role);
  const canSeeQc = isQcRole(role);

  const alerts = useMemo(() => {
    return getOperationalAlerts(currentUser, rooms, transactions, maintenances, realToday, breakfastOrders);
  }, [currentUser, rooms, transactions, maintenances, realToday, breakfastOrders]);

  const checkinTodayCount = alerts.filter(a => a.type === 'CHECKIN_TODAY' && !a.id.includes('aula')).length;
  const aulaEventsTodayCount = alerts.filter(a => a.type === 'CHECKIN_TODAY' && a.id.includes('aula')).length;
  const checkoutTodayCount = alerts.filter(a => a.type === 'CHECKOUT_TODAY').length;
  const breakfastPendingCount = alerts.filter(a => a.type === 'BREAKFAST').length;
  const urgentMaintCount = alerts.filter(a => a.type === 'MAINTENANCE' && a.severity === 'URGENT').length;
  const qcPendingCount = alerts.filter(a => a.type === 'QC').length;

  const hasAnyAlert = alerts.length > 0;

  if (!hasAnyAlert) return null;

  return (
    <div className="bg-slate-900/95 border-b border-gold-500/20 px-4 sm:px-6 lg:px-8 py-1.5 text-xs text-slate-200 flex items-center justify-between overflow-x-auto custom-scrollbar no-print">
      <div className="max-w-7xl mx-auto w-full flex items-center space-x-3 text-[11px] whitespace-nowrap">
        <span className="font-bold text-gold-400 flex items-center space-x-1 shrink-0">
          <i className="fa-solid fa-clock-rotate-left"></i>
          <span>Agenda Operasional Hari Ini:</span>
        </span>

        <div className="flex items-center space-x-2">
          {canSeeRecep && aulaEventsTodayCount > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('gedung')}
              className="bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-md flex items-center space-x-1 font-semibold transition"
              title="Klik untuk melihat acara aula yang sedang berlangsung"
            >
              <i className="fa-solid fa-handshake text-[10px]"></i>
              <span>{aulaEventsTodayCount} Acara Aula Hari Ini</span>
            </button>
          )}

          {canSeeRecep && checkinTodayCount > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('gedung')}
              className="bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-md flex items-center space-x-1 font-semibold transition"
              title="Klik untuk proses tamu check-in"
            >
              <i className="fa-solid fa-calendar-check text-[10px]"></i>
              <span>{checkinTodayCount} Check-In</span>
            </button>
          )}

          {canSeeRecep && checkoutTodayCount > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('gedung')}
              className="bg-blue-950/80 hover:bg-blue-900 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-md flex items-center space-x-1 font-semibold transition"
              title="Klik untuk proses tamu check-out"
            >
              <i className="fa-solid fa-door-open text-[10px]"></i>
              <span>{checkoutTodayCount} Check-Out</span>
            </button>
          )}

          {canSeeKoperasi && breakfastPendingCount > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('pesananSarapan')}
              className="bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-md flex items-center space-x-1 font-semibold transition"
              title="Klik untuk melihat pesanan sarapan aktif"
            >
              <i className="fa-solid fa-utensils text-[10px]"></i>
              <span>{breakfastPendingCount} Pesanan</span>
            </button>
          )}

          {canSeeTeknisi && urgentMaintCount > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('laporanMaintenance')}
              className="bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-500/30 px-2 py-0.5 rounded-md flex items-center space-x-1 font-bold animate-pulse transition"
              title="Klik untuk menindaklanjuti perbaikan darurat"
            >
              <i className="fa-solid fa-triangle-exclamation text-[10px]"></i>
              <span>{urgentMaintCount} Maint Urgent</span>
            </button>
          )}

          {canSeeQc && qcPendingCount > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('qualityControl')}
              className="bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-md flex items-center space-x-1 font-semibold transition"
              title="Klik untuk inspeksi kelayakan kamar"
            >
              <i className="fa-solid fa-shield-check text-[10px]"></i>
              <span>{qcPendingCount} Butuh QC</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
