// @ts-nocheck
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext, formatHMS, isTeknisiRole, isManagerTeknisi, isManagerQc, isKoperasiRole, isRecepRole, isQcRole, isSuperAdmin, isKeuanganRole } from '../store';
import { formatIndonesianDate, addDaysToDateStr, getRealTodayDate, formatIndonesianDateTime, parseLocalTimeString, isMeetingFacility, compareBuildingOrder, formatRupiah } from '../lib/utils';
import { Transaction, Maintenance, WorkSession, BreakfastMenuItem, BreakfastOrder, AuditLog } from '../types';
import { consolidateGroupTransactions, calculateSystemFinancials, getBookingTimestamp, getGroupBookingTimestamp } from '../lib/reportExporter';
import { calculateTransactionPricing, calculateGroupPricing } from '../lib/pricingCalculator';
import { findRoomRate } from '../data';
import { useBodyScrollLock } from '../lib/scrollLock';
import { VerifyPdfView } from './VerifyPdfView';
import { RolePermissionsSection } from './RolePermissionsSection';
import { SpreadsheetIntegrationView } from './SpreadsheetIntegrationView';
import { getDirectChannelId } from '../chatData';

export function ReportsView() {
  const { currentUser, transactions, rooms, openModal, showToast, roomCapacityRates = [], meetingRooms = [], breakfastMenuItems = [], deleteTransaction, batchDeleteGroup } = useAppContext();
  const [activeTab, setActiveTab] = useState<'ALL' | 'ROMBONGAN' | 'INDIVIDU' | 'AULA'>('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'NEWEST_BOOKING' | 'NEWEST_CHECKIN' | 'OLDEST_CHECKIN' | 'GUEST_NAME' | 'HIGHEST_PRICE'>('NEWEST_BOOKING');
  const [search, setSearch] = useState('');
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Record<string, boolean>>({});
  const [itemToDelete, setItemToDelete] = useState<{ id: string; name: string; isGroup?: boolean } | null>(null);

  const canDeleteTx = currentUser?.role === 'Super Admin' || currentUser?.role === 'Admin' || isRecepRole(currentUser?.role);

  const isKeuangan = isKeuanganRole(currentUser?.role, currentUser?.department);

  const handleOpenKwitansi = (data: { transaction: any; room?: any; groupKey?: string; groupRecord?: any }) => {
    const isLunas = data.transaction?.paymentStatus === 'LUNAS';
    const isDp = data.transaction?.paymentStatus === 'DP' || (data.transaction?.dpAmount && Number(data.transaction?.dpAmount) > 0);
    
    if (data.transaction && !isLunas && !isDp) {
      showToast('Kwitansi belum dapat diterbitkan karena belum ada setoran pembayaran. Silakan buka lembar Invoice untuk mencatat pembayaran terlebih dahulu.', 'warning');
      openModal('modalInvoice', { ...data, autoOpenPaymentModal: true });
      return;
    }
    openModal('modalKwitansi', data);
  };

  const pricingOptions = useMemo(() => ({
    rooms,
    roomCapacityRates,
    meetingRooms,
    breakfastMenuItems
  }), [rooms, roomCapacityRates, meetingRooms, breakfastMenuItems]);

  const toggleGroupExpand = (key: string) => {
    setExpandedGroupKeys(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Base filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (statusFilter !== 'ALL' && tx.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchName = tx.guestName?.toLowerCase().includes(q) || tx.groupName?.toLowerCase().includes(q);
        const matchRoom = tx.roomNumber?.toLowerCase().includes(q) || (tx.allocatedRoomNumbers && tx.allocatedRoomNumbers.some(rn => rn.toLowerCase().includes(q)));
        const matchBuilding = tx.building?.toLowerCase().includes(q);
        const matchId = tx.id?.toLowerCase().includes(q) || tx.groupId?.toLowerCase().includes(q);
        const matchSpk = tx.spkNumber?.toLowerCase().includes(q) || tx.notes?.toLowerCase().includes(q);
        if (!matchName && !matchRoom && !matchBuilding && !matchId && !matchSpk) return false;
      }
      return true;
    });
  }, [transactions, statusFilter, search]);

  // Consolidate into structured entities: Rombongan, Individu, and Aula
  const { rombonganList, individuList, aulaList } = useMemo(() => {
    return consolidateGroupTransactions(filteredTransactions, rooms);
  }, [filteredTransactions, rooms]);

  // Urutan Laporan: Default adalah Pemesanan Terbaru (Paling Atas)
  const sortedRombonganList = useMemo(() => {
    return [...rombonganList].sort((a, b) => {
      if (sortBy === 'NEWEST_BOOKING') {
        const timeA = getGroupBookingTimestamp(a);
        const timeB = getGroupBookingTimestamp(b);
        return timeB - timeA;
      }
      if (sortBy === 'NEWEST_CHECKIN') {
        return (b.startDate || '').localeCompare(a.startDate || '');
      }
      if (sortBy === 'OLDEST_CHECKIN') {
        return (a.startDate || '').localeCompare(b.startDate || '');
      }
      if (sortBy === 'GUEST_NAME') {
        return (a.groupName || '').localeCompare(b.groupName || '');
      }
      if (sortBy === 'HIGHEST_PRICE') {
        const pA = calculateGroupPricing(a, pricingOptions).grandTotal;
        const pB = calculateGroupPricing(b, pricingOptions).grandTotal;
        return pB - pA;
      }
      return 0;
    });
  }, [rombonganList, sortBy, pricingOptions]);

  const sortedIndividuList = useMemo(() => {
    return [...individuList].sort((a, b) => {
      if (sortBy === 'NEWEST_BOOKING') {
        const timeA = getBookingTimestamp(a);
        const timeB = getBookingTimestamp(b);
        return timeB - timeA;
      }
      if (sortBy === 'NEWEST_CHECKIN') {
        return (b.startDate || '').localeCompare(a.startDate || '');
      }
      if (sortBy === 'OLDEST_CHECKIN') {
        return (a.startDate || '').localeCompare(b.startDate || '');
      }
      if (sortBy === 'GUEST_NAME') {
        return (a.guestName || '').localeCompare(b.guestName || '');
      }
      if (sortBy === 'HIGHEST_PRICE') {
        const pA = calculateTransactionPricing(a, pricingOptions).grandTotal;
        const pB = calculateTransactionPricing(b, pricingOptions).grandTotal;
        return pB - pA;
      }
      return 0;
    });
  }, [individuList, sortBy, pricingOptions]);

  const sortedAulaList = useMemo(() => {
    return [...aulaList].sort((a, b) => {
      if (sortBy === 'NEWEST_BOOKING') {
        const timeA = getBookingTimestamp(a);
        const timeB = getBookingTimestamp(b);
        return timeB - timeA;
      }
      if (sortBy === 'NEWEST_CHECKIN') {
        return (b.startDate || '').localeCompare(a.startDate || '');
      }
      if (sortBy === 'OLDEST_CHECKIN') {
        return (a.startDate || '').localeCompare(b.startDate || '');
      }
      if (sortBy === 'GUEST_NAME') {
        return (a.guestName || '').localeCompare(b.guestName || '');
      }
      if (sortBy === 'HIGHEST_PRICE') {
        const pA = calculateTransactionPricing(a, pricingOptions).grandTotal;
        const pB = calculateTransactionPricing(b, pricingOptions).grandTotal;
        return pB - pA;
      }
      return 0;
    });
  }, [aulaList, sortBy, pricingOptions]);

  // Overall Statistics & Nilai PNBP Terpadu
  const totalRombonganCount = rombonganList.length;
  const rombonganActiveCount = rombonganList.filter(r => r.status === 'TERISI' || r.status === 'BOOKED').length;
  const rombonganBatalCount = rombonganList.filter(r => r.status === 'DIBATALKAN' || r.status.includes('BATAL')).length;

  const totalIndividuCount = individuList.length;
  const individuActiveCount = individuList.filter(t => t.status === 'TERISI' || t.status === 'BOOKED').length;
  const individuBatalCount = individuList.filter(t => t.status === 'DIBATALKAN' || t.status.includes('BATAL')).length;

  const totalAulaCount = aulaList.length;
  const aulaActiveCount = aulaList.filter(t => t.status === 'TERISI' || t.status === 'BOOKED').length;
  const aulaBatalCount = aulaList.filter(t => t.status === 'DIBATALKAN' || t.status.includes('BATAL')).length;

  const totalBatalCount = rombonganBatalCount + individuBatalCount + aulaBatalCount;

  // Sinkronisasi PNBP Sentral (100% sama dengan Dashboard & Kwitansi)
  const systemFinancials = useMemo(() => {
    return calculateSystemFinancials(filteredTransactions, rooms, {
      roomCapacityRates,
      meetingRooms,
      breakfastMenuItems,
      realToday: getRealTodayDate()
    });
  }, [filteredTransactions, rooms, roomCapacityRates, meetingRooms, breakfastMenuItems]);

  const totalEstimatedPNBP = systemFinancials.totalEstimatedPNBP;
  const totalRealisasiKas = systemFinancials.totalPenerimaanPnbp;
  const totalPiutang = systemFinancials.totalSisaPiutang;

  return (
    <div className="space-y-6">
      {/* Top Metric Cards - Baris 1: Status Operasional & Pembatalan */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5">
        <div className="bg-white p-3 sm:p-4 rounded-xl shadow-xs border border-slate-200">
          <p className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase truncate">Rombongan Aktif</p>
          <p className="text-xl sm:text-2xl font-bold text-purple-700">{rombonganActiveCount}</p>
          <span className="text-[10px] text-slate-400">Total: {totalRombonganCount} Grup</span>
        </div>
        <div className="bg-white p-3 sm:p-4 rounded-xl shadow-xs border border-slate-200">
          <p className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase truncate">Hunian Kamar Aktif</p>
          <p className="text-xl sm:text-2xl font-bold text-emerald-600">{individuActiveCount}</p>
          <span className="text-[10px] text-slate-400">Total: {totalIndividuCount} Kamar</span>
        </div>
        <div className="bg-white p-3 sm:p-4 rounded-xl shadow-xs border border-slate-200">
          <p className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase truncate">Sewa Aula (Aktif)</p>
          <p className="text-xl sm:text-2xl font-bold text-indigo-600">{aulaActiveCount}</p>
          <span className="text-[10px] text-slate-400">Total: {totalAulaCount} Acara</span>
        </div>
        <div className="bg-white p-3 sm:p-4 rounded-xl shadow-xs border border-rose-200 bg-rose-50/40">
          <p className="text-[11px] sm:text-xs font-semibold text-rose-800 uppercase truncate flex items-center gap-1.5">
            <i className="fa-solid fa-calendar-xmark text-rose-600 text-xs"></i>
            <span>Reservasi Batal</span>
          </p>
          <p className="text-xl sm:text-2xl font-black text-rose-700">{totalBatalCount}</p>
          <span className="text-[10px] text-rose-600 font-medium truncate block">
            {rombonganBatalCount} Grup • {individuBatalCount} Kamar • {aulaBatalCount} Aula
          </span>
        </div>
      </div>

      {/* Baris 2: Keuangan & PNBP Terdaftar (Terletak di Bawahnya) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3.5">
        <div className="bg-white p-3 sm:p-4 rounded-xl shadow-xs border border-emerald-200 bg-emerald-50/40">
          <p className="text-[11px] sm:text-xs font-semibold text-emerald-800 uppercase truncate flex items-center gap-1">
            <i className="fa-solid fa-circle-check text-emerald-600 text-[10px]"></i>
            <span>Realisasi Kas Masuk</span>
          </p>
          <p className="text-lg sm:text-xl font-black text-emerald-700 truncate" title={formatRupiah(totalRealisasiKas)}>
            {formatRupiah(totalRealisasiKas)}
          </p>
          <span className="text-[10px] text-emerald-600 font-medium truncate block">Kas Diterima (Lunas/DP)</span>
        </div>
        <div className="bg-white p-3 sm:p-4 rounded-xl shadow-xs border border-amber-200 bg-amber-50/40">
          <p className="text-[11px] sm:text-xs font-semibold text-amber-800 uppercase truncate flex items-center gap-1">
            <i className="fa-solid fa-clock text-amber-600 text-[10px]"></i>
            <span>Sisa Piutang Belum Lunas</span>
          </p>
          <p className="text-lg sm:text-xl font-black text-amber-700 truncate" title={formatRupiah(totalPiutang)}>
            {formatRupiah(totalPiutang)}
          </p>
          <span className="text-[10px] text-amber-600 font-medium truncate block">Menunggu Pelunasan</span>
        </div>
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-3 sm:p-4 rounded-xl shadow-xs text-white border border-slate-700">
          <p className="text-[11px] sm:text-xs font-semibold text-gold-300 uppercase truncate flex items-center gap-1">
            <i className="fa-solid fa-coins text-gold-400 text-[11px]"></i>
            <span>Total PNBP Terdaftar</span>
          </p>
          <p className="text-lg sm:text-xl font-black text-gold-300 truncate" title={formatRupiah(totalEstimatedPNBP)}>
            {formatRupiah(totalEstimatedPNBP)}
          </p>
          <span className="text-[10px] text-slate-300 font-medium truncate block">Tarif Resmi Operasional</span>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white p-3 sm:p-5 rounded-xl shadow-xs border border-slate-200 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center">
              <i className="fa-solid fa-file-invoice text-emerald-600 mr-2"></i>
              Laporan Hunian Kamar & Booking Ruang Pertemuan
            </h3>
            <p className="text-xs text-slate-500">
              Pemisahan data terperinci antara Laporan Rombongan (Grup), Hunian Kamar Individu, dan Ruang Pertemuan (Aula) beserta kalkulasi tarif resmi PNBP UPT Asrama Haji Jakarta.
            </p>
          </div>
          <button 
            onClick={() => openModal('modalExport', { defaultType: activeTab === 'AULA' ? 'AULA' : 'KAMAR' })} 
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg shadow-xs transition flex items-center space-x-1.5 self-start md:self-auto cursor-pointer"
            title="Unduh Laporan Transaksi & Reservasi (PDF / Excel .xlsx)"
          >
            <i className="fa-solid fa-file-arrow-down"></i>
            <span>Unduh Laporan</span>
          </button>
        </div>

        {/* Filter and Tab Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
          {/* Section Tabs */}
          <div className="inline-flex bg-white p-1 rounded-lg border border-slate-200 shadow-2xs text-xs font-semibold overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1.5 rounded-md transition whitespace-nowrap ${activeTab === 'ALL' ? 'bg-slate-800 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Semua ({rombonganList.length + individuList.length + aulaList.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ROMBONGAN')}
              className={`px-3 py-1.5 rounded-md transition flex items-center space-x-1.5 whitespace-nowrap ${activeTab === 'ROMBONGAN' ? 'bg-purple-700 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <i className="fa-solid fa-users-rectangle"></i>
              <span>Rombongan ({rombonganList.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('INDIVIDU')}
              className={`px-3 py-1.5 rounded-md transition flex items-center space-x-1.5 whitespace-nowrap ${activeTab === 'INDIVIDU' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <i className="fa-solid fa-bed"></i>
              <span>Penyewaan Kamar ({individuList.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('AULA')}
              className={`px-3 py-1.5 rounded-md transition flex items-center space-x-1.5 whitespace-nowrap ${activeTab === 'AULA' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <i className="fa-solid fa-landmark"></i>
              <span>Ruang Pertemuan ({aulaList.length})</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Cari rombongan, kamar, PIC..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none w-44 sm:w-56"
              />
              <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-2.5 text-slate-400 text-xs"></i>
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter status transaksi"
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="ALL">Semua Status</option>
              <option value="TERISI">Terisi / Check-In</option>
              <option value="BOOKED">Booked / Reservasi</option>
              <option value="SELESAI">Selesai (Check-Out)</option>
              <option value="DIBATALKAN">Dibatalkan</option>
            </select>

            {/* Sort Filter: Default Pemesanan Terbaru (Paling Atas) */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              aria-label="Urutan Tampilan Laporan"
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="NEWEST_BOOKING">⚡ Pemesanan Terbaru (Teratas)</option>
              <option value="NEWEST_CHECKIN">📅 Check-In Terbaru</option>
              <option value="OLDEST_CHECKIN">📅 Check-In Terlama</option>
              <option value="GUEST_NAME">🔤 Nama Tamu / Rombongan (A-Z)</option>
              <option value="HIGHEST_PRICE">💰 Nilai PNBP Terbesar</option>
            </select>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* BAGIAN 1: LAPORAN KHUSUS ROMBONGAN (GRUP) */}
        {/* ========================================================================= */}
        {(activeTab === 'ALL' || activeTab === 'ROMBONGAN') && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <i className="fa-solid fa-users-rectangle text-purple-600"></i>
                  <span>Laporan Rombongan (Grup) dengan Rincian Alokasi Kamar & Gedung</span>
                </h4>
                <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-bold">
                  {rombonganList.length} Rombongan
                </span>
              </div>
            </div>

            {rombonganList.length === 0 ? (
              <div className="p-8 text-center text-slate-400 italic bg-slate-50 border border-slate-200 rounded-xl">
                Tidak ada data rombongan yang sesuai dengan filter.
              </div>
            ) : (
              <div className="space-y-3">
                {sortedRombonganList.map((grp) => {
                  const isExpanded = Boolean(expandedGroupKeys[grp.key]);
                  const checkoutDate = addDaysToDateStr(grp.startDate, grp.duration);
                  const grpPrice = calculateGroupPricing(grp, pricingOptions);

                  return (
                    <div 
                      key={grp.key}
                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-2xs hover:border-purple-300 dark:hover:border-purple-600 transition"
                    >
                      {/* Rombongan Header: Compact & High Density */}
                      <div className="px-3.5 py-2.5 bg-gradient-to-r from-purple-50/70 via-white to-slate-50 dark:from-purple-950/40 dark:via-slate-800 dark:to-slate-850 border-b border-slate-200 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 border border-purple-200 dark:border-purple-800 uppercase tracking-wide">
                              {grp.groupType === 'INSTANSI' ? 'Instansi / Lembaga' : grp.groupType === 'JEMAAH_HAJI' ? 'Jemaah Haji Akbar' : 'Rombongan Umum'}
                            </span>
                            <h5 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                              {grp.groupName}
                            </h5>
                            {grp.kloter && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-700">
                                Kloter: {grp.kloter}
                              </span>
                            )}
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              grp.status === 'TERISI' 
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700' 
                                : grp.status === 'BOOKED'
                                ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700'
                                : grp.status === 'SELESAI'
                                ? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600'
                                : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700'
                            }`}>
                              {grp.status === 'TERISI' ? 'Check-In (Aktif)' : grp.status === 'BOOKED' ? 'Reservasi Terjadwal' : grp.status === 'DIBATALKAN' ? 'Dibatalkan' : grp.status}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 whitespace-nowrap">
                              Tarif PNBP: {grpPrice.formattedGrandTotal}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                            <span>PIC: <strong className="text-slate-800 dark:text-slate-200">{grp.groupPic}</strong> ({grp.groupPicPhone})</span>
                            {grp.agencyOrDocument && (
                              <span>SPK: <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">{grp.agencyOrDocument}</span></span>
                            )}
                            <span>Jadwal: <strong className="text-slate-800 dark:text-slate-200">{formatIndonesianDate(grp.startDate)}</strong> s.d. <strong className="text-slate-800 dark:text-slate-200">{formatIndonesianDate(checkoutDate)}</strong> ({grp.duration} {grp.durationUnit})</span>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center space-x-1.5 shrink-0 self-start md:self-auto flex-wrap gap-y-1">
                          <button
                            type="button"
                            onClick={() => openModal('modalInvoice', { transaction: grp.representativeTx, groupKey: grp.key, groupRecord: grp })}
                            className="px-2.5 py-1 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-lg text-xs shadow-2xs flex items-center space-x-1.5 transition cursor-pointer"
                            title="Buka Lembar Cetak Dokumen: Invoice & Kwitansi Resmi Rombongan"
                          >
                            <i className="fa-solid fa-print text-[11px] text-gold-300"></i>
                            <span>Cetak Dokumen</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenKwitansi({ transaction: grp.representativeTx, groupKey: grp.key, groupRecord: grp })}
                            className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs shadow-2xs flex items-center space-x-1.5 transition cursor-pointer"
                            title="Buka Lembar Kwitansi Pembayaran Resmi Rombongan (PDF & Cetak)"
                          >
                            <i className="fa-solid fa-receipt text-[11px] text-gold-300"></i>
                            <span>Kwitansi</span>
                          </button>

                          {grp.status === 'TERISI' && (
                            <button
                              type="button"
                              onClick={() => openModal('modalExtend', { transaction: grp.representativeTx, groupKey: grp.key, groupRecord: grp })}
                              className="px-2 py-1 bg-teal-50 dark:bg-teal-950/50 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-800 dark:text-teal-300 font-bold rounded-lg text-xs border border-teal-200 dark:border-teal-700 flex items-center space-x-1 transition cursor-pointer"
                              title="Perpanjang durasi rombongan"
                            >
                              <i className="fa-solid fa-clock-rotate-left text-teal-600 dark:text-teal-400 text-[10px]"></i>
                              <span>Extend</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => toggleGroupExpand(grp.key)}
                            className="px-2 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-semibold rounded-lg text-xs border border-slate-300 dark:border-slate-600 flex items-center space-x-1 transition cursor-pointer"
                            title={isExpanded ? "Tutup rincian kamar" : "Buka rincian kamar rombongan"}
                          >
                            <i className={`fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-slate-500 dark:text-slate-400 text-[10px]`}></i>
                            <span>{isExpanded ? 'Tutup Rincian' : `Rincian Kamar (${grp.allRoomNumbers.length})`}</span>
                          </button>

                          {canDeleteTx && (
                            <button
                              type="button"
                              onClick={() => setItemToDelete({ id: grp.key, name: grp.name, isGroup: true })}
                              className="px-2 py-1 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-bold rounded-lg text-xs border border-rose-200 dark:border-rose-700 flex items-center space-x-1 transition cursor-pointer"
                              title="Hapus data transaksi rombongan secara permanen"
                            >
                              <i className="fa-solid fa-trash-can text-rose-500 text-[10px]"></i>
                              <span>Hapus</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Rombongan Body: Compact High-Density Summary */}
                      <div className="px-3.5 py-2.5 space-y-2 text-xs">
                        {/* Inline Badges Flow */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {grp.roomsBreakdown.map((bBlock) => (
                            <div 
                              key={bBlock.building} 
                              className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-50 dark:bg-slate-900/80 rounded-lg border border-slate-200 dark:border-slate-700"
                              title={`Gedung ${bBlock.building}: ${bBlock.rooms.map(r => r.roomNumber).join(', ')}`}
                            >
                              <span className="font-bold text-hajj-800 dark:text-emerald-400 flex items-center gap-1">
                                <i className="fa-solid fa-hotel text-gold-600 dark:text-gold-400 text-[10px]"></i>
                                <span>{bBlock.building}:</span>
                              </span>
                              <div className="flex items-center gap-1">
                                {bBlock.rooms.map((rm) => (
                                  <span 
                                    key={rm.roomNumber}
                                    className={`px-1 py-0.2 rounded font-mono font-bold text-[10px] ${
                                      rm.status === 'TERISI' 
                                        ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200' 
                                        : rm.status === 'BOOKED'
                                        ? 'bg-blue-100 dark:bg-blue-950/70 text-blue-900 dark:text-blue-200'
                                        : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                                    }`}
                                  >
                                    {rm.roomNumber}
                                  </span>
                                ))}
                              </div>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                                ({bBlock.rooms.length} Kamar)
                              </span>
                            </div>
                          ))}

                          {/* Aula Badge */}
                          {(grp.includeAula || grp.rentAulaName) && (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 dark:bg-purple-950/50 rounded-lg border border-purple-200 dark:border-purple-800 text-[11px] text-purple-900 dark:text-purple-200">
                              <i className="fa-solid fa-landmark text-purple-600 dark:text-purple-400 text-[10px]"></i>
                              <span className="font-bold">{grp.rentAulaName || 'Aula Utama'}</span>
                              <span className="text-[10px] text-purple-700 dark:text-purple-300">
                                ({grp.rentAulaSession || 'Reguler'}, {grp.rentAulaDuration || 1} Sesi)
                              </span>
                            </div>
                          )}

                          {/* Konsumsi Badge */}
                          <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-50 dark:bg-slate-900/80 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px]">
                            <i className="fa-solid fa-utensils text-slate-400 dark:text-slate-500 text-[10px]"></i>
                            {grp.cateringPackage && grp.cateringPackage !== 'TIDAK' ? (
                              <span className="font-semibold text-orange-700 dark:text-orange-300">
                                {grp.cateringPackage} ({grp.cateringPaxCount || grp.totalPax} Pack)
                              </span>
                            ) : grp.breakfast ? (
                              <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                                Sarapan ({grp.breakfastPortions || grp.totalPax} Porsi)
                              </span>
                            ) : (
                              <span className="text-slate-500 dark:text-slate-400">Tanpa Konsumsi</span>
                            )}
                          </div>

                          {/* Extra Bed Badge */}
                          {grp.extraBed && (
                            <div className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 dark:bg-indigo-950/50 rounded-lg border border-indigo-200 dark:border-indigo-800 text-[11px] text-indigo-700 dark:text-indigo-300 font-semibold">
                              <i className="fa-solid fa-mattress-pillow text-[10px]"></i>
                              <span>+{grp.extraBedCount || 1} Bed</span>
                            </div>
                          )}

                          {/* Total Kapasitas & Kamar Pill */}
                          <div className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-700/80 text-slate-700 dark:text-slate-300 font-bold text-[11px]">
                            <i className="fa-solid fa-users text-slate-500 text-[10px]"></i>
                            <span>Total: {grp.allRoomNumbers.length} Kamar • {grp.totalPax} Pax</span>
                          </div>

                          {/* Tagihan Resmi PNBP Pill */}
                          <div className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 font-bold text-[11px]">
                            <i className="fa-solid fa-money-bill-wave text-emerald-600 text-[10px]"></i>
                            <span>Tagihan: {grpPrice.formattedGrandTotal}</span>
                          </div>
                        </div>

                        {/* Detail Expandable Table: Rincian Kamar Per Kamar */}
                        {isExpanded && (
                          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 font-semibold text-[11px]">
                                  <th className="py-1.5 px-2.5 w-8 text-center">No</th>
                                  <th className="py-1.5 px-2.5">Gedung & Wilayah</th>
                                  <th className="py-1.5 px-2.5 font-mono">No. Kamar</th>
                                  <th className="py-1.5 px-2.5">Tipe / Fasilitas Ruangan</th>
                                  <th className="py-1.5 px-2.5 text-center">Kapasitas Bed</th>
                                  <th className="py-1.5 px-2.5 text-right">Tarif / Malam</th>
                                  <th className="py-1.5 px-2.5 text-right">Subtotal</th>
                                  <th className="py-1.5 px-2.5 text-center">Status Alokasi</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-700 text-slate-800 dark:text-slate-200">
                                {grp.roomsBreakdown.flatMap((b, bIdx) => 
                                  b.rooms.map((rm, rmIdx) => {
                                    const rObj = rooms.find(r => r.roomNumber === rm.roomNumber);
                                    const matchedRate = findRoomRate(rObj?.type || rm.type, rObj?.bedType, roomCapacityRates);
                                    const rate = rObj?.pricePerNight || matchedRate?.pricePerNight || (
                                      rm.type.toLowerCase().includes('superior') ? 500000 :
                                      rm.type.toLowerCase().includes('ekonomi') ? 380000 : 480000
                                    );
                                    const nights = Math.max(1, grp.duration || 1);
                                    const rmTotal = rate * nights;
                                    return (
                                      <tr key={`${b.building}-${rm.roomNumber}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/50">
                                        <td className="py-1.5 px-2.5 text-center text-slate-400 dark:text-slate-500">{rmIdx + 1}</td>
                                        <td className="py-1.5 px-2.5 font-semibold text-slate-800 dark:text-slate-200">{b.building}</td>
                                        <td className="py-1.5 px-2.5 font-bold font-mono text-purple-900 dark:text-purple-300">{rm.roomNumber}</td>
                                        <td className="py-1.5 px-2.5 text-slate-600 dark:text-slate-400">{rm.type} (AC, Kamar Mandi Dalam)</td>
                                        <td className="py-1.5 px-2.5 text-center font-medium">{rm.capacity} Orang</td>
                                        <td className="py-1.5 px-2.5 text-right font-mono text-slate-600 dark:text-slate-300">{formatRupiah(rate)}</td>
                                        <td className="py-1.5 px-2.5 text-right font-mono font-bold text-emerald-800 dark:text-emerald-400">{formatRupiah(rmTotal)}</td>
                                        <td className="py-1.5 px-2.5 text-center">
                                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                            rm.status === 'TERISI' 
                                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700' 
                                              : rm.status === 'BOOKED'
                                              ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700'
                                              : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                                          }`}>
                                            {rm.status === 'TERISI' ? 'Check-In' : rm.status === 'BOOKED' ? 'Reservasi' : rm.status}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* ========================================================================= */}
        {/* BAGIAN 2: TABEL PENYEWAAN HUNIAN KAMAR (INDIVIDU & ROMBONGAN) */}
        {/* ========================================================================= */}
        {(activeTab === 'ALL' || activeTab === 'INDIVIDU') && (
          <div className="space-y-2 pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                  <i className="fa-solid fa-bed text-emerald-600"></i>
                  <span>Laporan Penyewaan Hunian Kamar</span>
                </h4>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  {individuList.length} Kamar
                </span>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-100 dark:bg-slate-900 uppercase text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3">ID Transaksi</th>
                    <th className="p-3">Gedung &amp; No Kamar</th>
                    <th className="p-3">Tipe Sewa</th>
                    <th className="p-3">Kategori Tamu</th>
                    <th className="p-3">Nama Tamu</th>
                    <th className="p-3">Tanggal Check-In</th>
                    <th className="p-3">Tanggal Check-Out</th>
                    <th className="p-3">Durasi</th>
                    <th className="p-3">Extra Bed &amp; Sarapan</th>
                    <th className="p-3 text-right">Tarif &amp; Total (PNBP)</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Aksi Dokumen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-850">
                  {individuList.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="p-6 text-center text-slate-400 italic">
                        Tidak ada transaksi penyewaan hunian kamar yang sesuai dengan filter.
                      </td>
                    </tr>
                  ) : (
                    sortedIndividuList.map(tx => {
                      const checkoutDate = addDaysToDateStr(tx.startDate, tx.duration);
                      const matchingRoom = rooms.find(r => r.id === tx.roomId || r.roomNumber === tx.roomNumber);
                      const txPrice = calculateTransactionPricing(tx, pricingOptions);
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition">
                          <td className="p-3 font-bold font-mono text-emerald-800 dark:text-emerald-400">{tx.id}</td>
                          <td className="p-3 font-bold text-slate-800 dark:text-slate-200">
                            <div className="flex items-center space-x-1.5">
                              <span>{tx.roomNumber}</span>
                              {matchingRoom?.type && (
                                <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold border ${
                                  matchingRoom.type === 'Superior'
                                    ? 'bg-purple-100 text-purple-800 border-purple-200'
                                    : matchingRoom.type === 'Ekonomi'
                                    ? 'bg-teal-100 text-teal-800 border-teal-200'
                                    : 'bg-blue-100 text-blue-800 border-blue-200'
                                }`}>
                                  {matchingRoom.type}
                                </span>
                              )}
                            </div>
                            <span className="block text-[10px] font-normal text-slate-400">
                              {tx.building} {matchingRoom?.bedType ? `• ${matchingRoom.bedType}` : ''}
                            </span>
                          </td>
                          <td className="p-3">
                            {tx.isGroup || tx.guestType === 'ROMBONGAN' || tx.groupId ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-700 whitespace-nowrap">
                                  <i className="fa-solid fa-users-rectangle mr-1"></i> Rombongan
                                </span>
                                {tx.groupName && (
                                  <span className="block text-[10px] text-purple-700 dark:text-purple-300 font-semibold truncate max-w-[120px]" title={tx.groupName}>
                                    {tx.groupName}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 whitespace-nowrap">
                                <i className="fa-solid fa-user mr-1"></i> Individu
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-medium border border-slate-200 dark:border-slate-700">
                              {tx.category}
                            </span>
                          </td>
                          <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">
                            {tx.guestName}
                            {tx.kloter && <span className="block text-[10px] text-blue-600 dark:text-blue-400 font-normal">Kloter: {tx.kloter}</span>}
                          </td>
                          <td className="p-3 font-medium text-slate-800 dark:text-slate-200">{formatIndonesianDate(tx.startDate)}</td>
                          <td className="p-3 font-medium text-slate-600 dark:text-slate-400">{formatIndonesianDate(checkoutDate)}</td>
                          <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{tx.duration} {tx.durationUnit || 'Malam'}</td>
                          <td className="p-3">
                            <div className="space-y-1">
                              {tx.extraBed ? (
                                <div className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                  <i className="fa-solid fa-mattress-pillow mr-1"></i>
                                  +{tx.extraBedCount || 1} Extra Bed
                                </div>
                              ) : null}

                              {tx.breakfast ? (
                                <div>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border border-orange-200 dark:border-orange-800" title={tx.breakfastMenu}>
                                    <i className="fa-solid fa-utensils mr-1"></i>
                                    {tx.breakfastMenu || 'Pesan Sarapan'}
                                  </span>
                                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                                    {tx.breakfastPortions || 1} Porsi × {tx.breakfastDays || tx.duration || 1} Hari
                                  </div>
                                </div>
                              ) : (
                                !tx.extraBed && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                    <i className="fa-solid fa-minus mr-1"></i> Standar
                                  </span>
                                )
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            <div className="font-bold text-emerald-700 dark:text-emerald-400 font-mono text-xs">
                              {txPrice.formattedGrandTotal}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                              {txPrice.ratePerUnitLabel}
                            </div>
                            {(txPrice.subtotalExtraBed > 0 || txPrice.subtotalCatering > 0) && (
                              <div className="text-[9px] text-slate-400 font-normal">
                                +Fasilitas: {formatRupiah(txPrice.subtotalExtraBed + txPrice.subtotalCatering)}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              tx.status === 'TERISI' 
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700' 
                                : tx.status === 'BOOKED'
                                ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700' 
                                : tx.status === 'SELESAI'
                                ? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600'
                                : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700'
                            }`}>
                              {tx.status}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center justify-center space-x-1.5 flex-wrap gap-y-1">
                              <button
                                type="button"
                                onClick={() => openModal('modalInvoice', { transaction: tx, room: rooms.find(r => r.id === tx.roomId) })}
                                className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs shadow-2xs flex items-center space-x-1.5 transition cursor-pointer"
                                title="Buka Cetak Dokumen: Invoice & Kwitansi Resmi"
                              >
                                <i className="fa-solid fa-print text-[11px] text-gold-300"></i>
                                <span>Cetak Dokumen</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenKwitansi({ transaction: tx, room: rooms.find(r => r.id === tx.roomId) })}
                                className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs shadow-2xs flex items-center space-x-1 transition cursor-pointer"
                                title="Buka Lembar Kwitansi Pembayaran Resmi (PDF & Cetak)"
                              >
                                <i className="fa-solid fa-receipt text-[10px] text-gold-300"></i>
                                <span>Kwitansi</span>
                              </button>

                              {tx.status === 'TERISI' && (
                                <button
                                  type="button"
                                  onClick={() => openModal('modalExtend', { transaction: tx, room: rooms.find(r => r.id === tx.roomId) })}
                                  className="px-2 py-1 bg-teal-50 dark:bg-teal-950/50 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-800 dark:text-teal-300 font-bold rounded-lg text-xs border border-teal-200 dark:border-teal-700 flex items-center space-x-1 transition cursor-pointer"
                                  title="Perpanjang durasi menginap"
                                >
                                  <i className="fa-solid fa-clock-rotate-left text-teal-600 dark:text-teal-400"></i>
                                  <span>Extend</span>
                                </button>
                              )}

                              {canDeleteTx && (
                                <button
                                  type="button"
                                  onClick={() => setItemToDelete({ id: tx.id, name: tx.guestName, isGroup: false })}
                                  className="px-2 py-1 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-bold rounded-lg text-xs border border-rose-200 dark:border-rose-700 flex items-center space-x-1 transition cursor-pointer"
                                  title="Hapus transaksi ini secara permanen dari sistem"
                                >
                                  <i className="fa-solid fa-trash-can text-rose-500 text-[10px]"></i>
                                  <span>Hapus</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* BAGIAN 3: TABEL RUANGAN (RUANG PERTEMUAN / AULA) */}
        {/* ========================================================================= */}
        {(activeTab === 'ALL' || activeTab === 'AULA') && (
          <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-1.5">
                  <i className="fa-solid fa-landmark text-indigo-600 dark:text-indigo-400"></i>
                  <span>Laporan Penyewaan Ruang Pertemuan (Aula / Auditorium / Gedung SG)</span>
                </h4>
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300 text-[10px] font-bold border border-indigo-200 dark:border-indigo-800">
                  {aulaList.length} Penyewaan Aula
                </span>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-100 dark:bg-slate-900 uppercase text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3">ID Transaksi</th>
                    <th className="p-3">Nama Ruang Pertemuan / Aula</th>
                    <th className="p-3">Tipe Sewa</th>
                    <th className="p-3">Penyewa / Instansi</th>
                    <th className="p-3">Tanggal Pemakaian</th>
                    <th className="p-3">Tanggal Akhir Pemakaian</th>
                    <th className="p-3">Durasi Sewa</th>
                    <th className="p-3">Keterangan / Acara</th>
                    <th className="p-3 text-right">Tarif Sewa (PNBP)</th>
                    <th className="p-3">Petugas Input</th>
                    <th className="p-3 text-center">Status Booking</th>
                    <th className="p-3 text-center">Aksi Dokumen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-850">
                  {aulaList.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="p-6 text-center text-slate-400 italic">
                        Tidak ada transaksi sewa ruang pertemuan yang sesuai dengan filter.
                      </td>
                    </tr>
                  ) : (
                    sortedAulaList.map(tx => {
                      const aulaDaysCount = Math.max(1, Math.ceil(tx.duration / 24));
                      const endDateStr = addDaysToDateStr(tx.startDate, aulaDaysCount - 1);
                      const aulaPrice = calculateTransactionPricing(tx, pricingOptions);
                      return (
                      <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition">
                        <td className="p-3 font-bold font-mono text-indigo-800 dark:text-indigo-400">{tx.id}</td>
                        <td className="p-3 font-bold text-slate-900 dark:text-slate-100">
                          <i className="fa-solid fa-landmark text-indigo-600 dark:text-indigo-400 mr-1.5"></i>
                          {tx.roomNumber}
                        </td>
                        <td className="p-3">
                          {tx.isGroup || tx.guestType === 'ROMBONGAN' || tx.groupId ? (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-700 whitespace-nowrap">
                                <i className="fa-solid fa-users-rectangle mr-1"></i> Rombongan
                              </span>
                              {tx.groupName && (
                                <span className="block text-[10px] text-purple-700 dark:text-purple-300 font-semibold truncate max-w-[120px]" title={tx.groupName}>
                                  {tx.groupName}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 whitespace-nowrap">
                              <i className="fa-solid fa-user mr-1"></i> Mandiri / Acara
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                          {tx.guestName}
                          {tx.phone && <span className="block text-[10px] text-slate-400 font-normal">Telp: {tx.phone}</span>}
                        </td>
                        <td className="p-3 font-medium text-slate-900 dark:text-slate-100">{formatIndonesianDate(tx.startDate)}</td>
                        <td className="p-3 font-medium text-emerald-800 dark:text-emerald-400">{formatIndonesianDate(endDateStr)}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${tx.duration >= 24 ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800' : 'bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800'}`}>
                            {tx.duration} Jam {tx.duration >= 24 ? `(${aulaDaysCount} Hari Penuh)` : '(Sesi Harian)'}
                          </span>
                        </td>
                        <td className="p-3 text-slate-600 dark:text-slate-300 max-w-xs truncate" title={tx.notes || '-'}>
                          {tx.notes || '-'}
                        </td>
                        <td className="p-3 text-right">
                          <div className="font-bold text-indigo-700 dark:text-indigo-400 font-mono text-xs">
                            {aulaPrice.formattedGrandTotal}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                            {aulaPrice.ratePerUnitLabel}
                          </div>
                          {aulaPrice.subtotalCatering > 0 && (
                            <div className="text-[9px] text-slate-400">
                              +Konsumsi: {formatRupiah(aulaPrice.subtotalCatering)}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-slate-500 dark:text-slate-400 font-medium">{tx.createdUser || 'Resepsionis'}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            tx.status === 'BOOKED' 
                              ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800' 
                              : tx.status === 'TERISI'
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                              : tx.status === 'SELESAI'
                              ? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600'
                              : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700'
                          }`}>
                            {tx.status === 'BOOKED' ? 'Booked (Terjadwal)' : tx.status === 'DIBATALKAN' ? 'Dibatalkan' : tx.status}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-center space-x-1.5 flex-wrap gap-y-1">
                            <button
                              type="button"
                              onClick={() => openModal('modalInvoice', { transaction: tx, room: rooms.find(r => r.id === tx.roomId) })}
                              className="px-2.5 py-1 bg-indigo-700 hover:bg-indigo-800 text-white font-bold rounded-lg text-xs shadow-2xs flex items-center space-x-1.5 transition cursor-pointer"
                              title="Buka Cetak Dokumen: Invoice & Kwitansi Resmi Ruang Pertemuan"
                            >
                              <i className="fa-solid fa-print text-[11px] text-gold-300"></i>
                              <span>Cetak Dokumen</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenKwitansi({ transaction: tx, room: rooms.find(r => r.id === tx.roomId) })}
                              className="px-2 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs shadow-2xs flex items-center space-x-1 transition cursor-pointer"
                              title="Buka Lembar Kwitansi Pembayaran Resmi Ruang Pertemuan (PDF & Cetak)"
                            >
                              <i className="fa-solid fa-receipt text-[10px] text-gold-300"></i>
                              <span>Kwitansi</span>
                            </button>

                            {tx.status === 'TERISI' && (
                              <button
                                type="button"
                                onClick={() => openModal('modalExtend', { transaction: tx, room: rooms.find(r => r.id === tx.roomId) })}
                                className="px-2 py-1 bg-purple-50 hover:bg-purple-100 text-purple-800 font-bold rounded-lg text-xs border border-purple-200 flex items-center space-x-1 transition cursor-pointer"
                                title="Perpanjang sesi sewa aula"
                              >
                                <i className="fa-solid fa-clock-rotate-left text-purple-600"></i>
                                <span>Extend</span>
                              </button>
                            )}

                            {canDeleteTx && (
                              <button
                                type="button"
                                onClick={() => setItemToDelete({ id: tx.id, name: tx.guestName, isGroup: false })}
                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg text-xs border border-rose-200 flex items-center space-x-1 transition cursor-pointer"
                                title="Hapus transaksi aula ini secara permanen dari sistem"
                              >
                                <i className="fa-solid fa-trash-can text-rose-500 text-[10px]"></i>
                                <span>Hapus</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal Konfirmasi Hapus Transaksi Permanen */}
      {itemToDelete && (
        <div 
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
          onClick={() => setItemToDelete(null)}
        >
          <div 
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200 dark:border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 flex items-center justify-center text-xl shrink-0">
                <i className="fa-solid fa-trash-can"></i>
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-base">Hapus Transaksi Permanen</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">Data akan dihapus dari penyimpanan lokal dan Google Spreadsheet</p>
              </div>
            </div>

            <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl p-3 text-xs text-rose-900 dark:text-rose-200 space-y-1">
              <p className="font-bold">Apakah Anda yakin ingin menghapus data {itemToDelete.isGroup ? 'rombongan' : 'transaksi'} "{itemToDelete.name}"?</p>
              <p className="text-slate-600 dark:text-slate-400 text-[11px]">
                Data akan dibersihkan tuntas dan tidak akan muncul kembali di sistem maupun cloud. Kamar terkait akan otomatis dibebaskan ke status KOSONG jika tidak ada booking lain.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (itemToDelete.isGroup) {
                    batchDeleteGroup(itemToDelete.id);
                  } else {
                    deleteTransaction(itemToDelete.id);
                  }
                  setItemToDelete(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition flex items-center space-x-1.5 cursor-pointer shadow-sm"
              >
                <i className="fa-solid fa-trash-can"></i>
                <span>Ya, Hapus Permanen</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function MaintenanceReportsView() {
  const { maintenances, finishMaintenance, markMaintenanceRepaired, openModal, rooms, currentUser, setActiveTab } = useAppContext();
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [urgencyFilter, setUrgencyFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [facilityFilter, setFacilityFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedDetailMaintenance, setSelectedDetailMaintenance] = useState<Maintenance | null>(null);
  useBodyScrollLock(Boolean(selectedDetailMaintenance));

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    maintenances.forEach(m => {
      if (m.category) set.add(m.category);
    });
    ['Kebersihan', 'Kelistrikan', 'Pipa Air', 'AC & Pendingin', 'Furnitur & Pintu'].forEach(c => set.add(c));
    return Array.from(set);
  }, [maintenances]);

  const facilityHistoryList = useMemo(() => {
    if (!selectedDetailMaintenance) return [];
    return maintenances.filter(
      m => m.roomNumber === selectedDetailMaintenance.roomNumber && m.building === selectedDetailMaintenance.building
    );
  }, [maintenances, selectedDetailMaintenance]);

  const isTeknisi = isTeknisiRole(currentUser?.role) || currentUser?.role?.includes('Admin');
  const isManagerTek = isManagerTeknisi(currentUser?.role) || currentUser?.role?.includes('Admin');
  const isQc = isQcRole(currentUser?.role) || currentUser?.role?.includes('Admin');

  const getUrgBadge = (urg: string) => {
    if (urg === 'Urgent') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200 shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-red-600 mr-1.5 animate-pulse"></span>
          Urgent
        </span>
      );
    }
    if (urg === 'Tinggi') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-600 mr-1.5"></span>
          Tinggi
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mr-1.5"></span>
        {urg || 'Normal'}
      </span>
    );
  };

  const filteredMaintenances = useMemo(() => {
    return maintenances.filter(m => {
      if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
      if (urgencyFilter !== 'ALL' && m.urgency !== urgencyFilter) return false;
      if (categoryFilter !== 'ALL' && m.category !== categoryFilter) return false;
      const isAulaMaint = m.building === 'Ruang Pertemuan' || isMeetingFacility(m.building) || m.facilityType === 'AULA';
      if (facilityFilter === 'KAMAR' && isAulaMaint) return false;
      if (facilityFilter === 'AULA' && !isAulaMaint) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchRoom = m.roomNumber.toLowerCase().includes(q);
        const matchDesc = m.description.toLowerCase().includes(q);
        const matchTech = m.technician.toLowerCase().includes(q);
        const matchCat = m.category.toLowerCase().includes(q);
        if (!matchRoom && !matchDesc && !matchTech && !matchCat) return false;
      }
      return true;
    });
  }, [maintenances, statusFilter, urgencyFilter, categoryFilter, facilityFilter, search]);

  const totalMaint = maintenances.length;
  const waitingAssignmentCount = maintenances.filter(m => m.status === 'MENUNGGU_PENUGASAN').length;
  const inProcessCount = maintenances.filter(m => m.status === 'PROSES').length;
  const waitingQcCount = maintenances.filter(m => m.status === 'MENUNGGU_QC').length;
  const finishedCount = maintenances.filter(m => m.status === 'SELESAI').length;

  return (
    <div className="space-y-4">
      {/* 4 Step Alur Maintenance Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="bg-white dark:bg-slate-800 p-2.5 sm:p-3.5 rounded-xl shadow-xs border border-amber-200 dark:border-amber-700/60 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-amber-800 dark:text-amber-300 truncate">1. Butuh Penugasan</span>
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 flex items-center justify-center text-xs shrink-0">
              <i className="fa-solid fa-user-plus"></i>
            </div>
          </div>
          <div className="mt-1.5 sm:mt-2">
            <span className="text-xl sm:text-2xl font-black text-amber-900 dark:text-amber-200">{waitingAssignmentCount}</span>
            <p className="text-[9px] sm:text-[10px] text-amber-700 dark:text-amber-300/90 mt-0.5 truncate">Menunggu respon Manager</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-2.5 sm:p-3.5 rounded-xl shadow-xs border border-blue-200 dark:border-blue-700/60 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-blue-800 dark:text-blue-300 truncate">2. Sedang Dikerjakan</span>
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs shrink-0">
              <i className="fa-solid fa-screwdriver-wrench"></i>
            </div>
          </div>
          <div className="mt-1.5 sm:mt-2">
            <span className="text-xl sm:text-2xl font-black text-blue-900 dark:text-blue-200">{inProcessCount}</span>
            <p className="text-[9px] sm:text-[10px] text-blue-700 dark:text-blue-300/90 mt-0.5 truncate">Penanganan teknisi di lokasi</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-2.5 sm:p-3.5 rounded-xl shadow-xs border border-purple-300 dark:border-purple-600/60 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-purple-900 dark:text-purple-300 truncate">3. Menunggu Cek QC</span>
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-200 flex items-center justify-center text-xs shrink-0">
              <i className="fa-solid fa-clipboard-check"></i>
            </div>
          </div>
          <div className="mt-1.5 sm:mt-2">
            <span className="text-xl sm:text-2xl font-black text-purple-900 dark:text-purple-200">{waitingQcCount}</span>
            <p className="text-[9px] sm:text-[10px] text-purple-700 dark:text-purple-300/90 mt-0.5 truncate">Selesai diperbaiki, siap inspeksi</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-2.5 sm:p-3.5 rounded-xl shadow-xs border border-emerald-200 dark:border-emerald-600/60 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-emerald-800 dark:text-emerald-300 truncate">4. Selesai & Lolos QC</span>
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-xs shrink-0">
              <i className="fa-solid fa-circle-check"></i>
            </div>
          </div>
          <div className="mt-1.5 sm:mt-2">
            <span className="text-xl sm:text-2xl font-black text-emerald-900 dark:text-emerald-200">{finishedCount}</span>
            <p className="text-[9px] sm:text-[10px] text-emerald-700 dark:text-emerald-300/90 mt-0.5 truncate">Tuntas diperbaiki & lolos QC</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-3.5 sm:p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-700 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center">
              <i className="fa-solid fa-screwdriver-wrench text-amber-600 dark:text-amber-400 mr-2"></i>
              Laporan Perawatan &amp; Maintenance Fasilitas
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-300">Rekapitulasi kerusakan, alur penugasan teknisi, pelaporan perbaikan fisik, dan pengesahan inspeksi QC.</p>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => {
                const defaultRoom = rooms.find(r => r.status === 'KOSONG') || rooms[0];
                openModal('modalMaintenance', { roomId: defaultRoom?.id });
              }} 
              className="px-3 py-2 bg-hajj-700 hover:bg-hajj-800 text-white text-xs font-bold rounded-lg shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
            >
              <i className="fa-solid fa-plus-circle"></i>
              <span>Lapor Kerusakan</span>
            </button>
            <button 
              onClick={() => openModal('modalExport', { defaultType: 'MAINTENANCE' })} 
              className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
              title="Unduh Laporan Pemeliharaan Gedung (PDF / Excel .xlsx)"
            >
              <i className="fa-solid fa-file-arrow-down"></i>
              <span>Unduh Laporan</span>
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-2">
            {/* Fasilitas */}
            <select
              value={facilityFilter}
              onChange={(e) => setFacilityFilter(e.target.value)}
              aria-label="Filter fasilitas gedung"
              className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-hajj-700 focus:outline-none"
            >
              <option value="ALL">Semua Fasilitas</option>
              <option value="KAMAR">Gedung (Kamar Hunian)</option>
              <option value="AULA">Ruang Pertemuan (Aula / Rapat)</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter status perbaikan"
              className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-hajj-700 focus:outline-none"
            >
              <option value="ALL">Semua Status Alur</option>
              <option value="MENUNGGU_PENUGASAN">1. Menunggu Penugasan</option>
              <option value="PROSES">2. Sedang Dikerjakan</option>
              <option value="MENUNGGU_QC">3. Menunggu Cek QC</option>
              <option value="SELESAI">4. Lolos QC &amp; Selesai</option>
            </select>

            {/* Urgensi Filter */}
            <select
              value={urgencyFilter}
              onChange={(e) => setUrgencyFilter(e.target.value)}
              aria-label="Filter tingkat urgensi"
              className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-hajj-700 focus:outline-none"
            >
              <option value="ALL">Semua Tingkat Urgensi</option>
              <option value="Urgent">Urgent</option>
              <option value="Tinggi">Tinggi</option>
              <option value="Normal">Normal</option>
            </select>

            {/* Kategori Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filter kategori kerusakan"
              className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-hajj-700 focus:outline-none"
            >
              <option value="ALL">Semua Kategori</option>
              {availableCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Cari kamar, teknisi, kerusakan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 rounded-lg text-xs focus:ring-2 focus:ring-hajj-700 focus:outline-none w-48 sm:w-60"
            />
            <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-2.5 text-slate-400 text-xs"></i>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-200">
            <thead className="bg-slate-100 dark:bg-slate-900 uppercase text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-3 text-center whitespace-nowrap w-28 text-slate-700 dark:text-slate-200">Waktu Lapor</th>
                <th className="p-3 whitespace-nowrap w-36 text-slate-700 dark:text-slate-200">Fasilitas / Lokasi</th>
                <th className="p-3 text-center whitespace-nowrap w-32 text-slate-700 dark:text-slate-200">Kategori</th>
                <th className="p-3 text-center whitespace-nowrap w-28 text-slate-700 dark:text-slate-200">Urgensi</th>
                <th className="p-3 min-w-[220px] text-slate-700 dark:text-slate-200">Deskripsi &amp; Catatan</th>
                <th className="p-3 whitespace-nowrap w-36 text-slate-700 dark:text-slate-200">Teknisi PJ</th>
                <th className="p-3 whitespace-nowrap w-28 text-slate-700 dark:text-slate-200">Pelapor</th>
                <th className="p-3 text-center whitespace-nowrap w-40 text-slate-700 dark:text-slate-200">Status Alur</th>
                <th className="p-3 text-center whitespace-nowrap min-w-[150px] text-slate-700 dark:text-slate-200">Tindakan Alur</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
              {filteredMaintenances.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 italic">
                    Tidak ada data perbaikan yang cocok dengan filter pencarian.
                  </td>
                </tr>
              ) : (
                filteredMaintenances.map(m => (
                  <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition">
                    <td className="p-3 font-mono text-[11px] text-slate-600 dark:text-slate-300 text-center whitespace-nowrap">{m.reportTime}</td>
                    <td className="p-3 font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                      <div className="flex items-center space-x-1.5">
                        <i className={`fa-solid ${m.building === 'Ruang Pertemuan' ? 'fa-landmark text-purple-700 dark:text-purple-400' : 'fa-bed text-slate-500 dark:text-slate-400'} text-xs`}></i>
                        <span>{m.roomNumber}</span>
                      </div>
                      <span className="block text-[10px] font-normal text-slate-400 dark:text-slate-400 mt-0.5">{m.building}</span>
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/70 border border-amber-200 dark:border-amber-700 text-amber-900 dark:text-amber-200 font-semibold text-[10px]">
                        {m.category}
                      </span>
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">{getUrgBadge(m.urgency)}</td>
                    <td className="p-3 text-slate-700 dark:text-slate-200 max-w-xs">
                      <p className="font-semibold text-slate-900 dark:text-slate-100 leading-snug" title={m.description}>{m.description}</p>
                      {m.managerNotes && (
                        <div className="text-[10px] text-amber-900 dark:text-amber-200 font-medium bg-amber-50/90 dark:bg-amber-950/70 p-1.5 rounded-md mt-1 border border-amber-200 dark:border-amber-700 flex items-start space-x-1">
                          <i className="fa-solid fa-clipboard-user text-amber-600 dark:text-amber-400 mt-0.5 shrink-0"></i>
                          <span><strong>Manager:</strong> {m.managerNotes}</span>
                        </div>
                      )}
                      {m.technicianNotes && (
                        <div className="text-[10px] text-blue-900 dark:text-blue-200 font-medium bg-blue-50/90 dark:bg-blue-950/70 p-1.5 rounded-md mt-1 border border-blue-200 dark:border-blue-700 flex items-start space-x-1">
                          <i className="fa-solid fa-wrench text-blue-600 dark:text-blue-400 mt-0.5 shrink-0"></i>
                          <span><strong>Teknisi:</strong> {m.technicianNotes}</span>
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      <div className="flex items-center space-x-1.5">
                        <div className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[10px] text-slate-600 dark:text-slate-300 shrink-0">
                          <i className="fa-solid fa-user-gear"></i>
                        </div>
                        <span className="font-semibold text-slate-800 dark:text-slate-100 text-xs">{m.technician}</span>
                      </div>
                      {m.assignedBy && (
                        <span className="block text-[9px] text-slate-400 dark:text-slate-400 mt-0.5">Oleh: {m.assignedBy}</span>
                      )}
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-300 whitespace-nowrap text-xs">{m.reportedUser || 'Petugas'}</td>
                    <td className="p-3 text-center whitespace-nowrap">
                      {m.status === 'MENUNGGU_PENUGASAN' && (
                        <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-600 inline-flex items-center shadow-2xs">
                          <i className="fa-solid fa-clock mr-1.5 text-amber-600 dark:text-amber-400"></i> 1. Butuh Penugasan
                        </span>
                      )}
                      {m.status === 'PROSES' && (
                        <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-50 dark:bg-blue-950/80 text-blue-900 dark:text-blue-200 border border-blue-300 dark:border-blue-600 inline-flex items-center shadow-2xs">
                          <i className="fa-solid fa-screwdriver-wrench mr-1.5 text-blue-600 dark:text-blue-400"></i> 2. Sedang Dikerjakan
                        </span>
                      )}
                      {m.status === 'MENUNGGU_QC' && (
                        <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-purple-50 dark:bg-purple-950/80 text-purple-900 dark:text-purple-200 border border-purple-300 dark:border-purple-500 inline-flex items-center shadow-2xs">
                          <i className="fa-solid fa-clipboard-check mr-1.5 text-purple-700 dark:text-purple-300"></i> 3. Menunggu Cek QC
                        </span>
                      )}
                      {m.status === 'SELESAI' && (
                        <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-500 inline-flex items-center shadow-2xs">
                          <i className="fa-solid fa-circle-check mr-1.5 text-emerald-600 dark:text-emerald-300"></i> 4. Selesai Tugas (Lolos QC)
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {m.status === 'MENUNGGU_PENUGASAN' && (
                        <div className="flex items-center justify-center gap-1.5">
                          {isManagerTek ? (
                            <button 
                              type="button"
                              onClick={() => openModal('modalAssignTechnician', { maintenance: m })} 
                              className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center space-x-1 cursor-pointer"
                              title="Tugaskan Teknisi Pelaksana"
                            >
                              <i className="fa-solid fa-user-plus text-[10px]"></i>
                              <span>Tugaskan</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-amber-800 dark:text-amber-200 font-bold bg-amber-50 dark:bg-amber-950/70 px-2 py-1 rounded border border-amber-200 dark:border-amber-700">
                              Tunggu Manager
                            </span>
                          )}
                          <button 
                            type="button"
                            onClick={() => setSelectedDetailMaintenance(m)}
                            className="px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-950 dark:text-amber-200 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-2xs"
                            title="Detail Laporan & Riwayat Lengkap Fasilitas"
                          >
                            <i className="fa-solid fa-file-invoice text-[11px]"></i>
                            <span>Detail & Riwayat</span>
                          </button>
                        </div>
                      )}

                      {m.status === 'PROSES' && (
                        <div className="flex items-center justify-center gap-1.5">
                          {isTeknisi ? (
                            <button 
                              type="button"
                              onClick={() => openModal('modalUpdateMaintenance', { maintenance: m })} 
                              className="px-2.5 py-1.5 bg-blue-50 dark:bg-blue-950/70 hover:bg-blue-100 dark:hover:bg-blue-900/80 text-blue-800 dark:text-blue-200 font-bold rounded-lg text-xs border border-blue-200 dark:border-blue-700 flex items-center space-x-1 transition cursor-pointer"
                              title="Update Catatan &amp; Suku Cadang Perbaikan"
                            >
                              <i className="fa-solid fa-pen-to-square text-[10px]"></i>
                              <span>Update</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-blue-800 dark:text-blue-200 font-bold bg-blue-50 dark:bg-blue-950/70 px-2 py-1 rounded border border-blue-200 dark:border-blue-700">
                              Proses
                            </span>
                          )}
                          <button 
                            type="button"
                            onClick={() => setSelectedDetailMaintenance(m)}
                            className="px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-950 dark:text-amber-200 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-2xs"
                            title="Detail Laporan & Riwayat Lengkap Fasilitas"
                          >
                            <i className="fa-solid fa-file-invoice text-[11px]"></i>
                            <span>Detail & Riwayat</span>
                          </button>
                        </div>
                      )}

                      {m.status === 'MENUNGGU_QC' && (
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const targetRoom = rooms.find(r => r.id === m.roomId || r.roomNumber === m.roomNumber);
                              if (targetRoom && isQc) {
                                openModal('modalQcInspection', { room: targetRoom });
                              } else {
                                setActiveTab('qualityControl');
                              }
                            }}
                            className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-xs shadow-xs flex items-center space-x-1 transition cursor-pointer"
                            title="Buka Pengecekan QC untuk Pengesahan"
                          >
                            <i className="fa-solid fa-clipboard-check text-[11px]"></i>
                            <span>Inspeksi QC</span>
                          </button>
                          <button 
                            type="button"
                            onClick={() => setSelectedDetailMaintenance(m)}
                            className="px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-950 dark:text-amber-200 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-2xs"
                            title="Detail Laporan & Riwayat Lengkap Fasilitas"
                          >
                            <i className="fa-solid fa-file-invoice text-[11px]"></i>
                            <span>Detail & Riwayat</span>
                          </button>
                        </div>
                      )}

                      {m.status === 'SELESAI' && (
                        <div className="flex items-center justify-center gap-1.5">
                          <button 
                            type="button"
                            onClick={() => setSelectedDetailMaintenance(m)}
                            className="px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-950 dark:text-amber-200 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-2xs"
                            title="Detail Laporan & Riwayat Lengkap Fasilitas"
                          >
                            <i className="fa-solid fa-file-invoice text-[11px]"></i>
                            <span>Detail & Riwayat</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Maintenance Detail Popup Modal */}
      {selectedDetailMaintenance && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setSelectedDetailMaintenance(null)}
        >
          <div 
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto custom-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-base shadow-inner">
                  <i className="fa-solid fa-screwdriver-wrench"></i>
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base">Detail Laporan Perawatan &amp; Riwayat Full Fasilitas</h4>
                  <p className="text-[11px] text-slate-500 font-medium">Tiket ID: <strong className="text-amber-600 dark:text-amber-400">#{selectedDetailMaintenance.id}</strong> • Dibuat: {selectedDetailMaintenance.reportTime}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedDetailMaintenance(null)} 
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-lg text-sm cursor-pointer transition"
              >
                <i className="fa-solid fa-xmark text-base"></i>
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5 shadow-2xs">
                  <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <i className="fa-solid fa-building text-hajj-700"></i> Lokasi &amp; Fasilitas
                  </span>
                  <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                    {selectedDetailMaintenance.building} - Kamar {selectedDetailMaintenance.roomNumber}
                  </p>
                  <span className="text-[10px] text-slate-500 block">Tipe Fasilitas: {selectedDetailMaintenance.facilityType || 'Kamar Penginapan'}</span>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5 shadow-2xs">
                  <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <i className="fa-solid fa-tags text-amber-600"></i> Klasifikasi Kerusakan
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2.5 py-1 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 rounded-lg font-bold text-[10px] border border-amber-200 dark:border-amber-700">
                      {selectedDetailMaintenance.category}
                    </span>
                    {getUrgBadge(selectedDetailMaintenance.urgency)}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-1">Status Alur: <strong className="text-hajj-700 dark:text-gold-400">{selectedDetailMaintenance.status}</strong></span>
                </div>
              </div>

              <div className="p-4 bg-amber-50/60 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-700/60 space-y-2 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                  <i className="fa-solid fa-triangle-exclamation"></i> Deskripsi Kendala / Kerusakan Dilaporkan (Tiket #{selectedDetailMaintenance.id})
                </span>
                <p className="font-semibold text-slate-800 dark:text-slate-200 leading-relaxed text-xs bg-white dark:bg-slate-900/80 p-3 rounded-lg border border-amber-200/70 dark:border-amber-700/50">
                  "{selectedDetailMaintenance.description}"
                </p>
                <div className="text-[10px] text-slate-500 pt-1 flex items-center justify-between">
                  <span>Pelapor / Sumber: <strong>{selectedDetailMaintenance.reportedUser || 'Petugas Jemaah / Sistem'}</strong></span>
                  <span>Waktu Lapor: {selectedDetailMaintenance.reportTime}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1.5">
                      <i className="fa-solid fa-user-gear text-hajj-700 text-sm"></i> Petugas &amp; Teknisi Penanggung Jawab
                    </span>
                    {selectedDetailMaintenance.assignedByManager && (
                      <span className="text-[10px] text-slate-400 font-medium">Oleh Manager: {selectedDetailMaintenance.assignedByManager}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                        {selectedDetailMaintenance.technician || selectedDetailMaintenance.assignedTechnicianName || 'Belum ditugaskan'}
                      </div>
                      <div className="text-[10px] text-slate-500">Teknisi Pelaksana Lapangan</div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                      selectedDetailMaintenance.technician ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {selectedDetailMaintenance.technician ? 'Ditugaskan' : 'Menunggu Penugasan'}
                    </span>
                  </div>
                </div>

                {selectedDetailMaintenance.managerNotes && (
                  <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-700/60 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-blue-800 dark:text-blue-300 flex items-center gap-1">
                      <i className="fa-solid fa-note-sticky"></i> Catatan &amp; Instruksi Manager Teknisi
                    </span>
                    <p className="text-slate-700 dark:text-slate-200 text-xs leading-relaxed">{selectedDetailMaintenance.managerNotes}</p>
                  </div>
                )}

                {selectedDetailMaintenance.technicianNotes && (
                  <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-700/60 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                      <i className="fa-solid fa-wrench"></i> Catatan Pengerjaan &amp; Suku Cadang Teknisi
                    </span>
                    <p className="text-slate-700 dark:text-slate-200 text-xs leading-relaxed">{selectedDetailMaintenance.technicianNotes}</p>
                    {selectedDetailMaintenance.workCompletedTime && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block pt-1 font-semibold">
                        Selesai Dikerjakan: {selectedDetailMaintenance.workCompletedTime}
                      </span>
                    )}
                  </div>
                )}

                {selectedDetailMaintenance.resolvedTime && (
                  <div className="p-3.5 bg-purple-50 dark:bg-purple-950/40 rounded-xl border border-purple-200 dark:border-purple-700/60 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-purple-800 dark:text-purple-300 flex items-center gap-1">
                      <i className="fa-solid fa-circle-check"></i> Verifikasi &amp; Pengesahan QC
                    </span>
                    <p className="text-slate-700 dark:text-slate-200 text-xs">Verifikasi Kelayakan Lolos QC pada {selectedDetailMaintenance.resolvedTime}</p>
                  </div>
                )}
              </div>

              {/* Full Facility History Section */}
              <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-100 text-xs flex items-center gap-1.5">
                    <i className="fa-solid fa-clock-rotate-left text-hajj-700 dark:text-gold-400"></i>
                    Riwayat Full Perawatan / Kerusakan Sebelumnya ({selectedDetailMaintenance.building} - Kamar {selectedDetailMaintenance.roomNumber})
                  </span>
                  <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 font-bold rounded text-[10px]">
                    Total: {facilityHistoryList.length} Catatan Tiket
                  </span>
                </div>

                <div className="space-y-2.5 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                  {facilityHistoryList.length === 0 ? (
                    <p className="text-center text-slate-400 py-3 italic text-[11px]">Tidak ada catatan riwayat perawatan lain untuk fasilitas ini.</p>
                  ) : (
                    facilityHistoryList.map((hist, idx) => (
                      <div 
                        key={hist.id || idx} 
                        className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                          hist.id === selectedDetailMaintenance.id 
                            ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-600 ring-1 ring-amber-400/50' 
                            : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-bold text-slate-900 dark:text-slate-100">#{hist.id} - {hist.category}</span>
                            {hist.id === selectedDetailMaintenance.id && (
                              <span className="px-1.5 py-0.2 bg-amber-200 text-amber-900 font-bold text-[9px] rounded">Tiket Ini</span>
                            )}
                          </div>
                          <span className="font-mono text-[10px] text-slate-500">{hist.reportTime}</span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-200 italic">"{hist.description}"</p>
                        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                          <span>Status Alur: <strong className="text-hajj-700 dark:text-gold-400">{hist.status}</strong></span>
                          <span>Teknisi: <strong>{hist.technician || hist.assignedTechnicianName || '-'}</strong></span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="p-3.5 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300 font-bold">Timeline Status Alur Tiket Aktif:</span>
                <span className="font-bold px-3 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-hajj-700 dark:text-gold-400 uppercase text-[11px] shadow-2xs">
                  {selectedDetailMaintenance.status}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  const tech = selectedDetailMaintenance.technician || selectedDetailMaintenance.assignedTechnicianName || 'Teknisi Piket';
                  const emailSubject = `[URGENT] Penugasan Perbaikan Fasilitas Tiket #${selectedDetailMaintenance.id}`;
                  const emailBody = `Halo Sdr/i ${tech},\n\nTerdapat tugas perbaikan fasilitas asrama yang perlu segera ditindaklanjuti:\n\n- Nomor Tiket: #${selectedDetailMaintenance.id}\n- Lokasi: ${selectedDetailMaintenance.building} - Kamar ${selectedDetailMaintenance.roomNumber}\n- Kendala: ${selectedDetailMaintenance.description}\n- Tingkat Urgensi: ${selectedDetailMaintenance.urgency}\n- Status Alur: ${selectedDetailMaintenance.status}\n\nMohon segera lakukan pengecekan dan perbaikan di lapangan. Terima kasih.\n\nSistem Operasional UPT Asrama Haji`;
                  
                  const btn = document.getElementById('btn-send-gmail-auto');
                  if (btn) {
                    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-sm"></i><span>Mengirim Email...</span>`;
                    (btn as HTMLButtonElement).disabled = true;
                  }

                  setTimeout(() => {
                    if (btn) {
                      btn.innerHTML = `<i class="fa-solid fa-circle-check text-sm"></i><span>Email Berhasil Terkirim via Gmail!</span>`;
                      btn.className = "px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-sm";
                    }
                  }, 800);
                }}
                id="btn-send-gmail-auto"
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-sm"
                title="Kirim pengingat otomatis ke teknisi via Gmail"
              >
                <i className="fa-solid fa-envelope text-sm"></i>
                <span>Kirim Notifikasi Gmail Otomatis</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedDetailMaintenance(null)}
                className="px-5 py-2.5 bg-hajj-900 hover:bg-hajj-800 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-sm"
              >
                Tutup Detail &amp; Riwayat
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export function BreakfastOrdersView() {
  const { 
    transactions, 
    rooms, 
    openModal, 
    currentUser, 
    breakfastOrders = [], 
    breakfastMenuItems = [], 
    addBreakfastOrder, 
    updateBreakfastOrder, 
    deleteBreakfastOrder, 
    updateBreakfastOrderStatusState, 
    addBreakfastMenuItem, 
    updateBreakfastMenuItem, 
    deleteBreakfastMenuItem, 
    showToast,
    buildings = [],
    meetingRooms = [],
    updateTransaction,
    updateBreakfastStatus,
    selectedBuilding,
    setSelectedBuilding
  } = useAppContext();

  const [subView, setSubView] = useState<'ORDERS' | 'MENU_CATALOG'>('ORDERS');
  const [filterMode, setFilterMode] = useState<'ALL' | 'MENUNGGU' | 'SEDANG_DIBUAT' | 'PENGANTARAN' | 'SELESAI' | 'DIBATALKAN'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'CHECKIN_FIRST' | 'CHECKIN_ONLY' | 'BOOKED_ONLY' | 'CHECKOUT_ONLY' | 'CANCELLED_ONLY' | 'ALL'>('CHECKIN_FIRST');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'TOMORROW' | 'UPCOMING'>('ALL');
  const [buildingFilter, setBuildingFilter] = useState<string>(() => selectedBuilding || 'ALL');
  const [search, setSearch] = useState('');

  // Sync with selectedBuilding if updated from dashboard / rooms view
  useEffect(() => {
    if (selectedBuilding) {
      setBuildingFilter(selectedBuilding);
    }
  }, [selectedBuilding]);

  // Modals state
  const [isAddOrderOpen, setIsAddOrderOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [editingMenuItem, setEditingMenuItem] = useState<BreakfastMenuItem | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<BreakfastOrder | null>(null);
  const [orderToCancel, setOrderToCancel] = useState<BreakfastOrder | null>(null);
  const [menuToDelete, setMenuToDelete] = useState<BreakfastMenuItem | null>(null);

  // Menu Catalog Filter & Search state (clean and simple)
  const [menuSearch, setMenuSearch] = useState('');
  const [menuCategoryFilter, setMenuCategoryFilter] = useState<'ALL' | 'MAKANAN_BERAT' | 'BUBUR_SAYUR' | 'SNACK_KUDAPAN' | 'MINUMAN'>('ALL');
  const [menuStockFilter, setMenuStockFilter] = useState<'ALL' | 'AVAILABLE' | 'UNAVAILABLE'>('ALL');

  useBodyScrollLock(isAddOrderOpen || isAddMenuOpen || Boolean(orderToDelete) || Boolean(orderToCancel) || Boolean(menuToDelete));

  // Dynamic sorted buildings matching Manajemen Gedung order
  const sortedBuildings = useMemo(() => {
    const list = buildings.map(b => b.name);
    if (!list.includes('Ruang Pertemuan')) {
      list.push('Ruang Pertemuan');
    }
    return list.sort(compareBuildingOrder);
  }, [buildings]);

  // New Order Form state
  const todayStr = getRealTodayDate();
  const tomorrowStr = addDaysToDateStr(todayStr, 1);
  const [formRoomMode, setFormRoomMode] = useState<'SELECT_ACTIVE' | 'MANUAL'>('SELECT_ACTIVE');
  const [orderBuilding, setOrderBuilding] = useState(() => (sortedBuildings[0] || 'Gedung A (Arafah)'));
  const [orderRoomNumber, setOrderRoomNumber] = useState('');
  const [orderGuestName, setOrderGuestName] = useState('');
  const [orderPhone, setOrderPhone] = useState('');
  const [orderKloter, setOrderKloter] = useState('');
  const [orderMenuName, setOrderMenuName] = useState(breakfastMenuItems[0]?.name || 'Nasi Goreng Spesial & Telur Ceplok');
  const [orderPortions, setOrderPortions] = useState(2);
  const [orderDays, setOrderDays] = useState(1);
  const [orderStartDate, setOrderStartDate] = useState(todayStr);
  const [orderDeliveryTime, setOrderDeliveryTime] = useState('06:30 WIB');
  const [orderDietary, setOrderDietary] = useState('Biasa (Tidak ada pantangan)');
  const [orderNotes, setOrderNotes] = useState('Antar langsung ke depan kamar tamu');

  // Menu Catalog Form state
  const [menuName, setMenuName] = useState('');
  const [menuCategory, setMenuCategory] = useState<'MAKANAN_BERAT' | 'BUBUR_SAYUR' | 'SNACK_KUDAPAN' | 'MINUMAN'>('MAKANAN_BERAT');
  const [menuPrice, setMenuPrice] = useState(25000);
  const [menuDesc, setMenuDesc] = useState('');
  const [menuAllergens, setMenuAllergens] = useState('');
  const [menuIsAvailable, setMenuIsAvailable] = useState(true);

  // Active rooms from transactions for quick selection across all facilities including Ruang Pertemuan
  const activeRoomTxs = useMemo(() => {
    return transactions.filter(tx => tx.status === 'TERISI' || tx.status === 'BOOKED');
  }, [transactions]);

  // Rooms available in the currently selected building in the form
  const roomsInOrderBuilding = useMemo(() => {
    return rooms.filter(r => r.building === orderBuilding);
  }, [rooms, orderBuilding]);

  // Merge room transactions that have breakfast with standalone breakfastOrders
  // so no orders are lost and everything is linked to the breakfast database
  const consolidatedOrders = useMemo(() => {
    const list = [...breakfastOrders];
    
    // Check if any transaction with breakfast is not yet in breakfastOrders list
    transactions.forEach(tx => {
      const hasBreakfast = Boolean(tx.breakfast) && (!tx.cateringPackage || tx.cateringPackage !== 'TIDAK');
      if (hasBreakfast) {
        const fullTxId = tx.id;
        const exists = list.some(o => 
          (o.transactionId && o.transactionId === fullTxId) || 
          o.id === `BO-TX-${fullTxId}` || 
          (o.roomNumber === tx.roomNumber && o.guestName === tx.guestName)
        );
        if (!exists) {
          const isCancelled = tx.status === 'DIBATALKAN' || tx.breakfastStatus === 'DIBATALKAN';
          list.push({
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
            startDate: tx.startDate || todayStr,
            deliveryTime: '06:30 WIB',
            status: isCancelled ? 'DIBATALKAN' : ((tx.breakfastStatus as any) || 'MENUNGGU'),
            notes: isCancelled ? `Booking kamar dibatalkan${tx.cancelReason ? `: ${tx.cancelReason}` : ''}` : 'Pesanan terintegrasi dari data reservasi kamar',
            cancelReason: tx.cancelReason,
            cancelledAt: tx.cancelledAt,
            dietaryRestriction: 'Biasa',
            pricePerPortion: 25000,
            totalPrice: (tx.breakfastPortions || 4) * 25000 * (tx.breakfastDays || tx.duration || 1),
            createdAt: `${tx.startDate || todayStr} 06:00:00`
          });
        }
      }
    });

    // Ensure strict uniqueness of IDs across all items to prevent any React duplicate key warnings
    const seenIds = new Set<string>();
    const uniqueOrders: typeof list = [];
    list.forEach((order, idx) => {
      let uniqueId = order.id;
      if (!uniqueId || seenIds.has(uniqueId)) {
        uniqueId = `${uniqueId || 'BO'}-${order.transactionId || order.roomNumber || 'order'}-${idx + 1}`;
        order = { ...order, id: uniqueId };
      }
      seenIds.add(uniqueId);
      uniqueOrders.push(order);
    });

    // Synchronize cancellation, date adjustments, and exclusions from linked transaction
    const syncedOrders: BreakfastOrder[] = [];
    uniqueOrders.forEach(order => {
      const tx = transactions.find(t => 
        t.id === order.transactionId || 
        (order.id && t.id && order.id.includes(t.id)) ||
        (t.roomNumber === order.roomNumber && t.guestName === order.guestName)
      );

      // Jika data transaksi yang terhubung disesuaikan menjadi TANPA MAKAN/SARAPAN, jangan tampilkan di daftar pesanan dapur
      if (tx && (!tx.breakfast || tx.cateringPackage === 'TIDAK')) {
        return;
      }

      const isCancelled = order.status === 'DIBATALKAN' || tx?.status === 'DIBATALKAN' || tx?.breakfastStatus === 'DIBATALKAN';

      if (tx) {
        syncedOrders.push({
          ...order,
          startDate: tx.startDate || order.startDate,
          days: tx.breakfastDays || tx.duration || order.days,
          portions: tx.breakfastPortions || order.portions,
          menuName: tx.breakfastMenu || order.menuName,
          status: isCancelled ? ('DIBATALKAN' as const) : (((tx.breakfastStatus as any) || order.status || 'MENUNGGU')),
          cancelReason: isCancelled ? (order.cancelReason || tx.cancelReason || 'Pesanan dibatalkan') : order.cancelReason,
          cancelledAt: isCancelled ? (order.cancelledAt || tx.cancelledAt || new Date().toISOString()) : order.cancelledAt,
          totalPrice: (tx.breakfastPortions || order.portions || 1) * (order.pricePerPortion || 25000) * (tx.breakfastDays || tx.duration || order.days || 1),
        });
      } else {
        syncedOrders.push({
          ...order,
          status: isCancelled ? ('DIBATALKAN' as const) : (order.status || 'MENUNGGU')
        });
      }
    });

    // Sort: 
    // 1. Active Checked-in first
    // 2. Active Booked
    // 3. Checked out (Selesai)
    // 4. Cancelled at the bottom
    return syncedOrders.sort((a, b) => {
      const isCancelledA = a.status === 'DIBATALKAN';
      const isCancelledB = b.status === 'DIBATALKAN';
      if (!isCancelledA && isCancelledB) return -1;
      if (isCancelledA && !isCancelledB) return 1;

      const txA = transactions.find(t => t.id === a.transactionId || t.roomNumber === a.roomNumber);
      const txB = transactions.find(t => t.id === b.transactionId || t.roomNumber === b.roomNumber);
      const isCheckedInA = txA?.status === 'TERISI';
      const isCheckedInB = txB?.status === 'TERISI';
      if (isCheckedInA && !isCheckedInB) return -1;
      if (!isCheckedInA && isCheckedInB) return 1;

      const isBookedA = txA?.status === 'BOOKED';
      const isBookedB = txB?.status === 'BOOKED';
      if (isBookedA && !isBookedB) return -1;
      if (!isBookedA && isBookedB) return 1;

      return (a.id || '').localeCompare(b.id || '');
    });
  }, [breakfastOrders, transactions, todayStr]);

  // Metrics calculation: Strict partition between active and cancelled
  const totalOrdersCount = consolidatedOrders.length;
  const totalPortions = consolidatedOrders.reduce((acc, curr) => acc + (curr.portions || 1), 0);
  const totalBoxes = consolidatedOrders.reduce((acc, curr) => acc + ((curr.portions || 1) * (curr.days || 1)), 0);

  const todayOrdersCount = consolidatedOrders.filter(o => o.startDate === todayStr).length;
  const tomorrowOrdersCount = consolidatedOrders.filter(o => o.startDate === tomorrowStr).length;
  const upcomingOrdersCount = consolidatedOrders.filter(o => o.startDate > todayStr).length;

  const cancelledOrders = consolidatedOrders.filter(o => o.status === 'DIBATALKAN');
  const cancelledCount = cancelledOrders.length;
  const cancelledPortions = cancelledOrders.reduce((acc, curr) => acc + (curr.portions || 1), 0);

  // Active orders strictly exclude cancelled orders
  const activeOrders = consolidatedOrders.filter(o => o.status !== 'DIBATALKAN');
  const activePortions = activeOrders.reduce((acc, curr) => acc + (curr.portions || 1), 0);

  const checkedInOrders = activeOrders.filter(o => {
    const tx = transactions.find(t => t.id === o.transactionId || t.roomNumber === o.roomNumber);
    return tx?.status === 'TERISI';
  });
  const checkedInCount = checkedInOrders.length;
  const checkedInPortions = checkedInOrders.reduce((acc, curr) => acc + (curr.portions || 1), 0);

  const bookedOrders = activeOrders.filter(o => {
    const tx = transactions.find(t => t.id === o.transactionId || t.roomNumber === o.roomNumber);
    return tx?.status === 'BOOKED';
  });
  const bookedCount = bookedOrders.length;

  const checkedOutOrders = activeOrders.filter(o => {
    const tx = transactions.find(t => t.id === o.transactionId || t.roomNumber === o.roomNumber);
    return tx?.status === 'SELESAI';
  });
  const checkedOutCount = checkedOutOrders.length;

  // Status breakdown strictly partitioned from activeOrders so cancelled can NEVER appear as selesai or other states
  const menungguOrders = activeOrders.filter(o => (o.status || 'MENUNGGU') === 'MENUNGGU');
  const menungguCount = menungguOrders.length;
  const menungguPortions = menungguOrders.reduce((acc, curr) => acc + (curr.portions || 1), 0);

  const sedangDibuatOrders = activeOrders.filter(o => o.status === 'SEDANG_DIBUAT');
  const sedangDibuatCount = sedangDibuatOrders.length;
  const sedangDibuatPortions = sedangDibuatOrders.reduce((acc, curr) => acc + (curr.portions || 1), 0);

  const pengantaranOrders = activeOrders.filter(o => o.status === 'PENGANTARAN');
  const pengantaranCount = pengantaranOrders.length;
  const pengantaranPortions = pengantaranOrders.reduce((acc, curr) => acc + (curr.portions || 1), 0);

  const selesaiOrders = activeOrders.filter(o => o.status === 'SELESAI');
  const selesaiCount = selesaiOrders.length;
  const selesaiPortions = selesaiOrders.reduce((acc, curr) => acc + (curr.portions || 1), 0);

  // Breakdown statistics per building
  const buildingBreakdown = useMemo(() => {
    const breakdown: Record<string, { totalOrders: number; totalPortions: number; checkedInPortions: number }> = {};
    sortedBuildings.forEach(bName => {
      breakdown[bName] = { totalOrders: 0, totalPortions: 0, checkedInPortions: 0 };
    });

    consolidatedOrders.forEach(order => {
      const bName = order.building || 'Lainnya';
      if (!breakdown[bName]) {
        breakdown[bName] = { totalOrders: 0, totalPortions: 0, checkedInPortions: 0 };
      }
      breakdown[bName].totalOrders += 1;
      const portions = Number(order.portions) || 1;
      breakdown[bName].totalPortions += portions;

      const tx = transactions.find(t => t.id === order.transactionId || t.roomNumber === order.roomNumber);
      if (tx?.status === 'TERISI' && order.status !== 'DIBATALKAN') {
        breakdown[bName].checkedInPortions += portions;
      }
    });

    return breakdown;
  }, [consolidatedOrders, sortedBuildings, transactions]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return consolidatedOrders.filter(order => {
      const tx = transactions.find(t => 
        t.id === order.transactionId || 
        (order.id && t.id && order.id.includes(t.id)) ||
        (t.roomNumber === order.roomNumber && (
          t.guestName.trim().toLowerCase() === order.guestName.trim().toLowerCase() ||
          t.status === 'TERISI' || t.status === 'BOOKED'
        ))
      );
      const isCancelled = order.status === 'DIBATALKAN' || tx?.status === 'DIBATALKAN';
      const isCheckedIn = tx?.status === 'TERISI' && !isCancelled;
      const isBooked = tx?.status === 'BOOKED' && !isCancelled;
      const isCheckedOut = tx?.status === 'SELESAI' && !isCancelled;

      if (buildingFilter !== 'ALL' && order.building !== buildingFilter) return false;

      // Priority Filter
      if (priorityFilter === 'CHECKIN_ONLY' && !isCheckedIn) return false;
      if (priorityFilter === 'BOOKED_ONLY' && !isBooked) return false;
      if (priorityFilter === 'CHECKOUT_ONLY' && !isCheckedOut) return false;
      if (priorityFilter === 'CANCELLED_ONLY' && !isCancelled) return false;

      // Date Schedule Filter
      if (dateFilter === 'TODAY' && order.startDate !== todayStr) return false;
      if (dateFilter === 'TOMORROW' && order.startDate !== tomorrowStr) return false;
      if (dateFilter === 'UPCOMING' && order.startDate <= todayStr) return false;

      // Status Filter
      const bStatus = order.status || 'MENUNGGU';
      if (filterMode === 'MENUNGGU' && (bStatus !== 'MENUNGGU' || isCancelled)) return false;
      if (filterMode === 'SEDANG_DIBUAT' && (bStatus !== 'SEDANG_DIBUAT' || isCancelled)) return false;
      if (filterMode === 'PENGANTARAN' && (bStatus !== 'PENGANTARAN' || isCancelled)) return false;
      if (filterMode === 'SELESAI' && (bStatus !== 'SELESAI' || isCancelled)) return false;
      if (filterMode === 'DIBATALKAN' && !isCancelled) return false;

      // Search Query
      if (search) {
        const q = search.toLowerCase();
        const matchName = order.guestName.toLowerCase().includes(q);
        const matchRoom = order.roomNumber.toLowerCase().includes(q);
        const matchMenu = (order.menuName || '').toLowerCase().includes(q);
        const matchKloter = (order.kloter || '').toLowerCase().includes(q);
        const matchId = (order.id || '').toLowerCase().includes(q);
        const matchBuilding = (order.building || '').toLowerCase().includes(q);
        if (!matchName && !matchRoom && !matchMenu && !matchKloter && !matchId && !matchBuilding) return false;
      }

      return true;
    });
  }, [consolidatedOrders, transactions, buildingFilter, priorityFilter, dateFilter, filterMode, search, todayStr, tomorrowStr]);

  const canManage = true;

  // Handler: Cycle status
  const cycleBreakfastStatus = (orderId: string, currentStatus: string) => {
    if (!canManage) return;
    if (currentStatus === 'DIBATALKAN') {
      showToast('Pesanan ini dibatalkan karena reservasi kamar telah dibatalkan.', 'warning');
      return;
    }
    if (currentStatus === 'SELESAI') {
      showToast('Pesanan telah selesai disajikan. Alur produksi sudah tuntas.', 'info');
      return;
    }
    const nextStatus = 
      currentStatus === 'MENUNGGU' ? 'SEDANG_DIBUAT' :
      currentStatus === 'SEDANG_DIBUAT' ? 'PENGANTARAN' : 'SELESAI';
    updateBreakfastOrderStatusState(orderId, nextStatus as any);
  };

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderRoomNumber.trim()) {
      showToast('Harap masukkan atau pilih nomor kamar!', 'warning');
      return;
    }
    if (!orderGuestName.trim()) {
      showToast('Harap masukkan nama tamu/pemesan!', 'warning');
      return;
    }

    const selectedMenuItem = breakfastMenuItems.find(m => m.name === orderMenuName);
    const unitPrice = selectedMenuItem ? selectedMenuItem.price : 25000;
    const calcTotal = orderPortions * unitPrice * orderDays;

    const activeTx = activeRoomTxs.find(t => 
      t.roomNumber === orderRoomNumber && (t.building === orderBuilding || !orderBuilding)
    ) || activeRoomTxs.find(t => t.roomNumber === orderRoomNumber);

    const newOrder: BreakfastOrder = {
      id: `BO-${Date.now().toString().slice(-4)}`,
      roomNumber: orderRoomNumber,
      building: orderBuilding,
      guestName: orderGuestName,
      phone: orderPhone || undefined,
      kloter: orderKloter || undefined,
      transactionId: activeTx?.id,
      menuName: orderMenuName,
      portions: Number(orderPortions),
      days: Number(orderDays),
      startDate: orderStartDate,
      deliveryTime: orderDeliveryTime,
      status: 'MENUNGGU',
      notes: orderNotes,
      dietaryRestriction: orderDietary,
      pricePerPortion: unitPrice,
      totalPrice: calcTotal,
      createdAt: `${todayStr} 06:00:00`
    };

    addBreakfastOrder(newOrder);

    // Sync back to transaction in Manajemen Gedung
    if (activeTx && updateTransaction) {
      updateTransaction({
        ...activeTx,
        breakfast: true,
        breakfastMenu: orderMenuName,
        breakfastPortions: Number(orderPortions),
        breakfastDays: Number(orderDays),
        cateringPackage: activeTx.cateringPackage && activeTx.cateringPackage !== 'TIDAK' ? activeTx.cateringPackage : 'SARAPAN',
        cateringPaxCount: Number(orderPortions)
      });
      showToast(`Pesanan tersinkronisasi ke kamar ${orderRoomNumber} (${orderBuilding})`, 'success');
    } else {
      showToast(`Pesanan kamar ${orderRoomNumber} berhasil dicatat!`, 'success');
    }

    setIsAddOrderOpen(false);
    // Reset form
    setOrderRoomNumber('');
    setOrderGuestName('');
    setOrderPhone('');
    setOrderKloter('');
    setOrderPortions(2);
    setOrderNotes('Antar langsung ke depan kamar tamu');
  };

  // Handler: Add or update menu item
  const handleSaveMenuItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!menuName.trim()) {
      showToast('Nama menu sarapan wajib diisi!', 'warning');
      return;
    }

    if (editingMenuItem) {
      const updated: BreakfastMenuItem = {
        ...editingMenuItem,
        name: menuName,
        category: menuCategory,
        price: Number(menuPrice),
        description: menuDesc,
        allergens: menuAllergens,
        isAvailable: menuIsAvailable
      };
      updateBreakfastMenuItem(updated);
      setEditingMenuItem(null);
    } else {
      const newItem: BreakfastMenuItem = {
        id: `bmi-${Date.now().toString().slice(-4)}`,
        name: menuName,
        category: menuCategory,
        price: Number(menuPrice),
        description: menuDesc,
        allergens: menuAllergens,
        isAvailable: menuIsAvailable
      };
      addBreakfastMenuItem(newItem);
    }

    setIsAddMenuOpen(false);
    setMenuName('');
    setMenuDesc('');
    setMenuAllergens('');
    setMenuPrice(25000);
  };

  const openEditMenu = (item: BreakfastMenuItem) => {
    setEditingMenuItem(item);
    setMenuName(item.name);
    setMenuCategory(item.category);
    setMenuPrice(item.price);
    setMenuDesc(item.description);
    setMenuAllergens(item.allergens || '');
    setMenuIsAvailable(item.isAvailable);
    setIsAddMenuOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* 1. INFORMASI UTAMA: TOTAL PESANAN, PORSI & STATUS ALUR PRODUKSI (Terletak di Bagian Paling Atas Halaman) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
        {/* 1. Total Pesanan */}
        <div className="bg-white p-3 rounded-xl shadow-xs border border-orange-200 bg-orange-50/30">
          <p className="text-[10px] font-bold text-orange-700 uppercase tracking-wider truncate flex items-center">
            <i className="fa-solid fa-utensils text-orange-500 mr-1.5 text-[10px] shrink-0"></i>
            Total Pesanan
          </p>
          <p className="text-base sm:text-lg font-black text-orange-800 mt-1">
            {totalOrdersCount} <span className="text-[10px] sm:text-xs font-semibold text-orange-600">({totalPortions} porsi)</span>
          </p>
          <span className="text-[9px] text-orange-600 font-medium block truncate">{totalBoxes} box periode</span>
        </div>

        {/* 2. Menunggu */}
        <div className="bg-white p-3 rounded-xl shadow-xs border border-amber-200 bg-amber-50/30">
          <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider truncate flex items-center">
            <i className="fa-regular fa-clock text-amber-500 mr-1.5 text-[10px] shrink-0"></i>
            Menunggu
          </p>
          <p className="text-base sm:text-lg font-black text-amber-800 mt-1">
            {menungguCount} <span className="text-[10px] sm:text-xs font-semibold text-amber-600">({menungguPortions} porsi)</span>
          </p>
          <span className="text-[9px] text-amber-600 font-medium block truncate">Antrean dapur</span>
        </div>

        {/* 3. Dimasak */}
        <div className="bg-white p-3 rounded-xl shadow-xs border border-blue-200 bg-blue-50/30">
          <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider truncate flex items-center">
            <i className="fa-solid fa-fire text-blue-500 mr-1.5 text-[10px] shrink-0"></i>
            Dimasak
          </p>
          <p className="text-base sm:text-lg font-black text-blue-800 mt-1">
            {sedangDibuatCount} <span className="text-[10px] sm:text-xs font-semibold text-blue-600">({sedangDibuatPortions} porsi)</span>
          </p>
          <span className="text-[9px] text-blue-600 font-medium block truncate">Proses produksi</span>
        </div>

        {/* 4. Pengantaran */}
        <div className="bg-white p-3 rounded-xl shadow-xs border border-purple-200 bg-purple-50/30">
          <p className="text-[10px] font-bold text-purple-700 uppercase tracking-wider truncate flex items-center">
            <i className="fa-solid fa-truck-ramp-box text-purple-500 mr-1.5 text-[10px] shrink-0"></i>
            Pengantaran
          </p>
          <p className="text-base sm:text-lg font-black text-purple-800 mt-1">
            {pengantaranCount} <span className="text-[10px] sm:text-xs font-semibold text-purple-600">({pengantaranPortions} porsi)</span>
          </p>
          <span className="text-[9px] text-purple-600 font-medium block truncate">Menuju kamar</span>
        </div>

        {/* 5. Selesai */}
        <div className="bg-white p-3 rounded-xl shadow-xs border border-emerald-200 bg-emerald-50/30">
          <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider truncate flex items-center">
            <i className="fa-solid fa-circle-check text-emerald-500 mr-1.5 text-[10px] shrink-0"></i>
            Selesai
          </p>
          <p className="text-base sm:text-lg font-black text-emerald-800 mt-1">
            {selesaiCount} <span className="text-[10px] sm:text-xs font-semibold text-emerald-600">({selesaiPortions} porsi)</span>
          </p>
          <span className="text-[9px] text-emerald-600 font-medium block truncate">Telah disajikan</span>
        </div>

        {/* 6. Batal */}
        <div className="bg-white p-3 rounded-xl shadow-xs border border-rose-200 bg-rose-50/40">
          <p className="text-[10px] font-bold text-rose-700 uppercase tracking-wider truncate flex items-center">
            <i className="fa-solid fa-ban text-rose-500 mr-1.5 text-[10px] shrink-0"></i>
            Batal
          </p>
          <p className="text-base sm:text-lg font-black text-rose-800 mt-1">
            {cancelledCount} <span className="text-[10px] sm:text-xs font-semibold text-rose-600">({cancelledPortions} porsi)</span>
          </p>
          <span className="text-[9px] text-rose-600 font-medium block truncate">Pesanan dibatalkan</span>
        </div>
      </div>

      {/* View Switcher Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl shadow-xs border border-slate-200">
        <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setSubView('ORDERS')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-2 ${
              subView === 'ORDERS'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <i className="fa-solid fa-utensils text-xs"></i>
            <span>Status Pesanan</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${subView === 'ORDERS' ? 'bg-orange-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {consolidatedOrders.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubView('MENU_CATALOG')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-2 ${
              subView === 'MENU_CATALOG'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <i className="fa-solid fa-book-open text-xs"></i>
            <span>Katalog Menu</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${subView === 'MENU_CATALOG' ? 'bg-orange-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {breakfastMenuItems.length}
            </span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          {subView === 'ORDERS' ? (
            <button
              type="button"
              onClick={() => setIsAddOrderOpen(true)}
              className="px-3.5 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
            >
              <i className="fa-solid fa-plus text-xs"></i>
              <span>Buat Pesanan</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingMenuItem(null);
                setMenuName('');
                setMenuDesc('');
                setMenuAllergens('');
                setMenuPrice(25000);
                setIsAddMenuOpen(true);
              }}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
            >
              <i className="fa-solid fa-plus text-xs"></i>
              <span>Tambah Menu</span>
            </button>
          )}

          <button 
            type="button"
            onClick={() => openModal('modalExport', { 
              defaultType: 'SARAPAN',
              defaultBuilding: buildingFilter,
              defaultBreakfastPriority: priorityFilter === 'CHECKIN_ONLY' ? 'CHECKIN_ONLY' : priorityFilter === 'BOOKED_ONLY' ? 'BOOKED_ONLY' : 'ALL',
              defaultFormat: 'PDF'
            })} 
            className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-xl shadow transition flex items-center space-x-2 cursor-pointer"
            title="Unduh Rekap Laporan Pesanan"
          >
            <i className="fa-solid fa-file-arrow-down"></i>
            <span>Unduh Laporan</span>
          </button>
        </div>
      </div>

      {subView === 'ORDERS' ? (
        /* ================= SUBVIEW 1: ORDERS LIST & QUEUE ================= */
        <div className="space-y-6">

          {/* Building Management Sync & Selector Strip */}
          <div className="bg-white p-3.5 rounded-2xl shadow-xs border border-slate-200 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
              <div className="flex items-center space-x-2">
                <span className="w-6 h-6 rounded-lg bg-orange-600 text-white flex items-center justify-center text-xs shadow-xs">
                  <i className="fa-solid fa-hotel"></i>
                </span>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Distribusi Gedung &amp; Fasilitas Hunian</h4>
                  <p className="text-[11px] text-slate-500">Pilih gedung untuk melihat antrean distribusi makanan dan paket katering secara spesifik.</p>
                </div>
              </div>
              {buildingFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => {
                    setBuildingFilter('ALL');
                    if (setSelectedBuilding) setSelectedBuilding(null);
                  }}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg border border-slate-300 transition flex items-center space-x-1 cursor-pointer self-start sm:self-auto"
                >
                  <i className="fa-solid fa-rotate-left text-[10px]"></i>
                  <span>Tampilkan Semua Gedung</span>
                </button>
              )}
            </div>

            {/* Building Selection Tabs */}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => {
                  setBuildingFilter('ALL');
                  if (setSelectedBuilding) setSelectedBuilding(null);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                  buildingFilter === 'ALL'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                <span>Semua Gedung</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  buildingFilter === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {totalOrdersCount}
                </span>
              </button>

              {sortedBuildings.map(bName => {
                const stat = buildingBreakdown[bName] || { totalOrders: 0, totalPortions: 0, checkedInPortions: 0 };
                const isSelected = buildingFilter === bName;
                const isAula = bName === 'Ruang Pertemuan';

                return (
                  <button
                    key={bName}
                    type="button"
                    onClick={() => {
                      setBuildingFilter(bName);
                      if (setSelectedBuilding) setSelectedBuilding(bName);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                      isSelected
                        ? isAula 
                          ? 'bg-indigo-700 text-white shadow-xs'
                          : 'bg-orange-600 text-white shadow-xs'
                        : isAula
                          ? 'bg-indigo-50 text-indigo-900 hover:bg-indigo-100 border border-indigo-200'
                          : 'bg-white text-slate-700 hover:bg-orange-50 border border-slate-200'
                    }`}
                  >
                    <i className={isAula ? "fa-solid fa-landmark text-[10px]" : "fa-solid fa-building text-[10px]"}></i>
                    <span>{bName}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                      isSelected 
                        ? 'bg-white/25 text-white' 
                        : 'bg-slate-100 text-slate-800 border border-slate-200'
                    }`}>
                      {stat.totalPortions} Porsi
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            {/* Live Sync Badge Banner with Manajemen Gedung */}
            <div className="p-3 bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-emerald-500/10 border border-orange-200/80 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-orange-950">
              <div className="flex items-center space-x-2.5">
                <span className="w-6 h-6 rounded-full bg-orange-600 text-white flex items-center justify-center text-xs shrink-0 shadow-xs">
                  <i className="fa-solid fa-arrows-rotate"></i>
                </span>
                <div>
                  <span className="font-extrabold text-orange-950">Sinkronisasi Realtime dengan Manajemen Gedung:</span>
                  <span className="text-slate-600 ml-1.5 hidden sm:inline">Perubahan status kamar (Check-in, Check-out, Extend sewa, dan Pembatalan reservasi) otomatis tersinkron dengan alur dapur katering.</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {buildingFilter !== 'ALL' && (
                  <span className="font-bold text-[11px] text-orange-800 bg-orange-100 px-2 py-0.5 rounded-md border border-orange-300">
                    Filter: {buildingFilter}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 font-bold text-[11px] text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300 shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Sinkronisasi Gedung Aktif</span>
                </span>
              </div>
            </div>

            {/* Date Schedule Selector Bar */}
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center space-x-2">
                <span className="w-5 h-5 rounded-md bg-orange-100 text-orange-700 font-bold flex items-center justify-center text-[11px] shrink-0">
                  <i className="fa-solid fa-calendar-day"></i>
                </span>
                <span className="font-bold text-slate-800">Filter Jadwal Tanggal Makan:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setDateFilter('ALL')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${dateFilter === 'ALL' ? 'bg-orange-600 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'}`}
                >
                  Semua Tanggal ({consolidatedOrders.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDateFilter('TODAY')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${dateFilter === 'TODAY' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white text-emerald-800 border border-emerald-300 hover:bg-emerald-50'}`}
                >
                  <i className="fa-solid fa-calendar-check text-[10px]"></i>
                  <span>Hari Ini: {formatIndonesianDate(todayStr)} ({todayOrdersCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDateFilter('TOMORROW')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${dateFilter === 'TOMORROW' ? 'bg-blue-600 text-white shadow-xs' : 'bg-white text-blue-800 border border-blue-300 hover:bg-blue-50'}`}
                >
                  <i className="fa-solid fa-calendar-arrow-right text-[10px]"></i>
                  <span>Besok: {formatIndonesianDate(tomorrowStr)} ({tomorrowOrdersCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDateFilter('UPCOMING')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${dateFilter === 'UPCOMING' ? 'bg-purple-600 text-white shadow-xs' : 'bg-white text-purple-800 border border-purple-300 hover:bg-purple-50'}`}
                >
                  <i className="fa-solid fa-clock-rotate-left text-[10px]"></i>
                  <span>Terjadwal Mendatang ({upcomingOrdersCount})</span>
                </button>
              </div>
            </div>

            {/* Priority Quick Selector Bar */}
            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center space-x-2">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs shrink-0">
                  <i className="fa-solid fa-arrow-down-short-wide"></i>
                </span>
                <span className="font-bold text-emerald-950">Filter Prioritas Antrean Kamar:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setPriorityFilter('CHECKIN_FIRST')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${priorityFilter === 'CHECKIN_FIRST' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white text-emerald-800 border border-emerald-300 hover:bg-emerald-100/50'}`}
                  title="Urutkan pesanan tamu yang sudah check-in di paling atas"
                >
                  <i className="fa-solid fa-star text-amber-400"></i>
                  <span>Dahulukan Sudah Check-In ({checkedInCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPriorityFilter('CHECKIN_ONLY')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${priorityFilter === 'CHECKIN_ONLY' ? 'bg-emerald-700 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'}`}
                  title="Hanya tampilkan tamu yang kamarnya sudah check-in"
                >
                  <i className="fa-solid fa-door-open text-emerald-600"></i>
                  <span>Hanya Sudah Check-In</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPriorityFilter('BOOKED_ONLY')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${priorityFilter === 'BOOKED_ONLY' ? 'bg-amber-600 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'}`}
                  title="Hanya tampilkan pesanan yang masih status reservasi (belum check-in)"
                >
                  <i className="fa-regular fa-clock text-amber-600"></i>
                  <span>Standby (Booking Saja)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPriorityFilter('CHECKOUT_ONLY')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${priorityFilter === 'CHECKOUT_ONLY' ? 'bg-slate-700 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'}`}
                  title="Tampilkan pesanan dari kamar yang tamunya sudah check-out"
                >
                  <i className="fa-solid fa-door-closed text-slate-500"></i>
                  <span>Sudah Check-Out ({checkedOutCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPriorityFilter('CANCELLED_ONLY')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${priorityFilter === 'CANCELLED_ONLY' ? 'bg-rose-700 text-white shadow-xs' : 'bg-white text-rose-800 border border-rose-300 hover:bg-rose-50'}`}
                  title="Tampilkan pesanan dari kamar yang bookingnya telah dibatalkan"
                >
                  <i className="fa-solid fa-ban text-rose-500"></i>
                  <span>Booking Dibatalkan ({cancelledCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPriorityFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${priorityFilter === 'ALL' ? 'bg-slate-800 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'}`}
                >
                  Semua Pesanan
                </button>
              </div>
            </div>

            {/* Filter Controls */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex flex-wrap gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-xs text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setFilterMode('ALL')}
                  className={`px-2.5 py-1.5 rounded-md transition ${filterMode === 'ALL' ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Semua ({consolidatedOrders.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('MENUNGGU')}
                  className={`px-2.5 py-1.5 rounded-md transition flex items-center space-x-1 ${filterMode === 'MENUNGGU' ? 'bg-amber-600 text-white shadow-xs' : 'text-amber-800 hover:bg-amber-50'}`}
                >
                  <span>Menunggu ({menungguCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('SEDANG_DIBUAT')}
                  className={`px-2.5 py-1.5 rounded-md transition flex items-center space-x-1 ${filterMode === 'SEDANG_DIBUAT' ? 'bg-blue-600 text-white shadow-xs' : 'text-blue-800 hover:bg-blue-50'}`}
                >
                  <i className="fa-solid fa-fire text-[10px]"></i>
                  <span>Sedang Dibuat ({sedangDibuatCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('PENGANTARAN')}
                  className={`px-2.5 py-1.5 rounded-md transition flex items-center space-x-1 ${filterMode === 'PENGANTARAN' ? 'bg-purple-600 text-white shadow-xs' : 'text-purple-800 hover:bg-purple-50'}`}
                >
                  <i className="fa-solid fa-truck-ramp-box text-[10px]"></i>
                  <span>Pengantaran ({pengantaranCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('SELESAI')}
                  className={`px-2.5 py-1.5 rounded-md transition flex items-center space-x-1 ${filterMode === 'SELESAI' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-800 hover:bg-emerald-50'}`}
                >
                  <i className="fa-solid fa-circle-check text-[10px]"></i>
                  <span>Selesai ({selesaiCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('DIBATALKAN')}
                  className={`px-2.5 py-1.5 rounded-md transition flex items-center space-x-1 ${filterMode === 'DIBATALKAN' ? 'bg-rose-700 text-white shadow-xs' : 'text-rose-800 hover:bg-rose-50'}`}
                >
                  <i className="fa-solid fa-circle-xmark text-[10px]"></i>
                  <span>Dibatalkan ({cancelledCount})</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={buildingFilter}
                  onChange={e => setBuildingFilter(e.target.value)}
                  className="py-1.5 px-3 bg-white border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-orange-500 focus:outline-none"
                >
                  <option value="ALL">Semua Gedung</option>
                  {buildings.slice().sort((a, b) => compareBuildingOrder(a.name, b.name)).map(b => (
                    <option key={b.id} value={b.name}>{b.name}</option>
                  ))}
                  <option value="Ruang Pertemuan">Ruang Pertemuan / Aula</option>
                </select>

                <div className="relative">
                  <input
                    type="text"
                    placeholder="Cari tamu, kamar, kloter..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-orange-500 focus:outline-none w-44 sm:w-56"
                  />
                  <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-2.5 text-slate-400 text-xs"></i>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100 uppercase text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">ID &amp; Kamar</th>
                    <th className="p-3">Nama Tamu / Jemaah</th>
                    <th className="p-3">Menu &amp; Porsi</th>
                    <th className="p-3">Waktu &amp; Catatan</th>
                    <th className="p-3 text-center">Status Produksi</th>
                    <th className="p-3 text-center">Perbarui Alur Dapur</th>
                    <th className="p-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 font-medium">
                        Tidak ada data pesanan sarapan yang cocok dengan filter saat ini.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order, orderIdx) => {
                      const matchedRoom = rooms.find(r => 
                        r.roomNumber === order.roomNumber && (r.building === order.building || !order.building || isMeetingFacility(r.building))
                      ) || rooms.find(r => r.roomNumber === order.roomNumber);

                      const matchedTx = transactions.find(t => 
                        t.id === order.transactionId || 
                        (order.id && t.id && order.id.includes(t.id)) ||
                        (t.roomNumber === order.roomNumber && (t.building === order.building || !order.building) && t.status !== 'DIBATALKAN')
                      ) || transactions.find(t => 
                        t.roomNumber === order.roomNumber && (t.building === order.building || !order.building)
                      );

                      const isCancelled = order.status === 'DIBATALKAN' || matchedTx?.status === 'DIBATALKAN' || matchedTx?.breakfastStatus === 'DIBATALKAN';
                      const isCheckedIn = (matchedTx?.status === 'TERISI' || matchedRoom?.status === 'TERISI') && !isCancelled;
                      const isBooked = (matchedTx?.status === 'BOOKED' || matchedRoom?.status === 'BOOKED') && !isCancelled && !isCheckedIn;
                      const isCheckedOut = (matchedTx?.status === 'SELESAI' || (matchedRoom && matchedRoom.status === 'KOSONG' && !matchedTx)) && !isCancelled;
                      const isMaintenance = matchedRoom?.status === 'MAINTENANCE';
                      const bStatus = isCancelled ? 'DIBATALKAN' : (order.status || 'MENUNGGU');

                      return (
                        <tr 
                          key={`${order.id || 'bo'}-${order.roomNumber || ''}-${orderIdx}`} 
                          className={`transition ${
                            isCancelled 
                              ? 'bg-rose-50/50 hover:bg-rose-50/80 border-l-4 border-l-rose-500' 
                              : isCheckedIn 
                                ? 'bg-emerald-50/25 hover:bg-emerald-50/45 border-l-4 border-l-emerald-500' 
                                : isCheckedOut
                                  ? 'bg-slate-50/80 hover:bg-slate-100/70 border-l-4 border-l-slate-400 opacity-90'
                                  : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="p-3">
                            <div className="flex items-center space-x-1.5">
                              <span className={`font-bold text-sm ${isCancelled ? 'text-rose-950 line-through' : 'text-slate-900'}`}>{order.roomNumber}</span>
                              {isCheckedIn && (
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-pulse" title="Tamu sudah berada di kamar (Checked-In)"></span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 font-semibold flex items-center gap-1 mt-0.5">
                              <span>{order.building}</span>
                              {matchedRoom?.floor && (
                                <span className="text-slate-400">• Lt. {matchedRoom.floor}</span>
                              )}
                            </div>
                            <div className="text-[9px] font-mono text-slate-400 mt-0.5">#{order.id}</div>

                            {/* Status Kamar di Manajemen Gedung */}
                            <div className="flex flex-wrap items-center gap-1 mt-1.5">
                              {isCancelled ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                  <i className="fa-solid fa-ban mr-1 text-[8px]"></i> Booking Batal
                                </span>
                              ) : isCheckedIn ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse"></span>
                                  Terisi (Check-In)
                                </span>
                              ) : isBooked ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                                  <i className="fa-regular fa-clock mr-1 text-[8px]"></i> Booked (Standby)
                                </span>
                              ) : isCheckedOut ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 text-slate-700 border border-slate-300">
                                  <i className="fa-solid fa-door-closed mr-1 text-[8px]"></i> Sudah Check-Out
                                </span>
                              ) : isMaintenance ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                  <i className="fa-solid fa-wrench mr-1 text-[8px]"></i> Kamar Maintenance
                                </span>
                              ) : null}

                              {/* Tombol Pintas Buka Kamar di Manajemen Gedung */}
                              {matchedRoom && (
                                <button
                                  type="button"
                                  onClick={() => openModal('modalRoomDetail', { roomId: matchedRoom.id })}
                                  className="px-1.5 py-0.5 rounded text-[9px] font-bold text-slate-600 hover:text-emerald-700 bg-white hover:bg-emerald-50 border border-slate-300 hover:border-emerald-300 transition flex items-center space-x-1 cursor-pointer shadow-2xs"
                                  title="Buka rincian kamar ini di Manajemen Gedung"
                                >
                                  <i className="fa-solid fa-door-open text-[8px] text-emerald-600"></i>
                                  <span>Lihat Kamar</span>
                                </button>
                              )}
                            </div>
                          </td>

                          <td className="p-3">
                            <div className={`font-bold ${isCancelled ? 'text-rose-950 line-through' : 'text-slate-900'}`}>{order.guestName}</div>
                            
                            {/* Rombongan / Grup Badge jika reservasi grup */}
                            {matchedTx?.isGroup && matchedTx?.groupName ? (
                              <div className="mt-0.5">
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                  <i className="fa-solid fa-users mr-1 text-[8.5px]"></i> {matchedTx.groupName}
                                </span>
                              </div>
                            ) : null}

                            {order.kloter && order.kloter !== '-' ? (
                              <div className="text-[11px] text-blue-700 font-semibold mt-0.5">
                                <i className="fa-solid fa-kaaba mr-1 text-slate-400"></i> Kloter: {order.kloter}
                              </div>
                            ) : (
                              <div className="text-[10px] text-slate-400">Tamu Umum</div>
                            )}
                            {order.phone && <div className="text-[10px] text-slate-400"><i className="fa-solid fa-phone mr-1"></i>{order.phone}</div>}
                          </td>

                          <td className="p-3">
                            <div className="space-y-1">
                              <div className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold border ${isCancelled ? 'bg-rose-100/70 text-rose-900 border-rose-200' : 'bg-orange-100 text-orange-900 border-orange-200'}`}>
                                <i className="fa-solid fa-bowl-rice mr-1.5 text-orange-600"></i>
                                {order.menuName}
                              </div>
                              <div className="text-[11px] text-slate-700 font-semibold">
                                <span className="text-orange-700 font-bold">{order.portions} Porsi / Hari</span> × <span>{order.days || 1} Hari</span>
                              </div>
                              {order.totalPrice ? (
                                <div className="text-[10px] text-slate-500">
                                  Total: <strong className="text-slate-900">Rp {order.totalPrice.toLocaleString('id-ID')}</strong>
                                </div>
                              ) : null}
                            </div>
                          </td>

                          <td className="p-3">
                            <div className="text-xs font-semibold text-slate-800">
                              <i className="fa-regular fa-clock text-orange-600 mr-1"></i>
                              {order.deliveryTime || '06:30 WIB'}
                            </div>
                            <div className="mt-1">
                              {order.startDate === todayStr ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  <i className="fa-solid fa-calendar-check mr-1 text-[8.5px]"></i> Hari Ini ({formatIndonesianDate(order.startDate)})
                                </span>
                              ) : order.startDate === tomorrowStr ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                                  <i className="fa-solid fa-calendar-arrow-right mr-1 text-[8.5px]"></i> Besok ({formatIndonesianDate(order.startDate)})
                                </span>
                              ) : order.startDate > tomorrowStr ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
                                  <i className="fa-solid fa-clock-rotate-left mr-1 text-[8.5px]"></i> Terjadwal ({formatIndonesianDate(order.startDate)})
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-medium bg-slate-100 text-slate-600 border border-slate-300">
                                  <i className="fa-solid fa-calendar mr-1 text-[8.5px]"></i> {formatIndonesianDate(order.startDate)}
                                </span>
                              )}
                            </div>
                            {order.dietaryRestriction && order.dietaryRestriction !== 'Biasa' && (
                              <div className="mt-1 px-1.5 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-semibold inline-block">
                                {order.dietaryRestriction}
                              </div>
                            )}
                            {isCancelled ? (
                              <p className="text-[10px] text-rose-600 font-semibold mt-1 flex items-center">
                                <i className="fa-solid fa-triangle-exclamation mr-1 text-[9px]"></i>
                                {order.cancelReason || 'Reservasi booking kamar dibatalkan'}
                              </p>
                            ) : isCheckedOut ? (
                              <p className="text-[10px] text-slate-500 font-medium mt-1 flex items-center">
                                <i className="fa-solid fa-circle-info mr-1 text-[9px]"></i>
                                Tamu sudah check-out dari kamar
                              </p>
                            ) : order.notes ? (
                              <p className="text-[10px] text-slate-500 italic mt-0.5 line-clamp-1" title={order.notes}>
                                "{order.notes}"
                              </p>
                            ) : null}
                          </td>

                          <td className="p-3 text-center">
                            {isCancelled || bStatus === 'DIBATALKAN' ? (
                              <div className="flex flex-col items-center">
                                <span 
                                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 shadow-xs"
                                  title="Pesanan ini telah dibatalkan"
                                >
                                  <i className="fa-solid fa-circle-xmark mr-1.5 text-rose-600"></i>
                                  Dibatalkan
                                </span>
                                <span className="text-[9px] text-rose-600 font-semibold mt-1">Booking Kamar Batal</span>
                              </div>
                            ) : bStatus === 'MENUNGGU' ? (
                              <span 
                                onClick={() => cycleBreakfastStatus(order.id, bStatus)}
                                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 cursor-pointer hover:scale-105 transition shadow-xs"
                                title="Klik untuk ubah status alur dapur"
                              >
                                <span className="w-2 h-2 rounded-full bg-amber-500 mr-1.5 animate-pulse"></span>
                                Menunggu
                              </span>
                            ) : bStatus === 'SEDANG_DIBUAT' ? (
                              <span 
                                onClick={() => cycleBreakfastStatus(order.id, bStatus)}
                                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300 cursor-pointer hover:scale-105 transition shadow-xs"
                                title="Klik untuk ubah status alur dapur"
                              >
                                <i className="fa-solid fa-fire mr-1.5 text-blue-600"></i>
                                Dimasak
                              </span>
                            ) : bStatus === 'PENGANTARAN' ? (
                              <span 
                                onClick={() => cycleBreakfastStatus(order.id, bStatus)}
                                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300 cursor-pointer hover:scale-105 transition shadow-xs"
                                title="Klik untuk ubah status alur dapur"
                              >
                                <i className="fa-solid fa-truck-ramp-box mr-1.5 text-purple-600"></i>
                                Diantar
                              </span>
                            ) : (
                              <span 
                                onClick={() => cycleBreakfastStatus(order.id, bStatus)}
                                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 cursor-pointer hover:scale-105 transition shadow-xs"
                                title="Klik untuk ubah status alur dapur"
                              >
                                <i className="fa-solid fa-circle-check mr-1.5 text-emerald-600"></i>
                                Selesai
                              </span>
                            )}
                          </td>

                          <td className="p-3 text-center">
                            {isCancelled || bStatus === 'DIBATALKAN' ? (
                              <div className="p-1.5 bg-rose-100/70 border border-rose-200 rounded-lg text-center text-[10px] text-rose-800 font-bold flex flex-col items-center justify-center">
                                <div className="flex items-center space-x-1">
                                  <i className="fa-solid fa-ban text-rose-600 text-xs"></i>
                                  <span>Stop Produksi</span>
                                </div>
                                <span className="text-[9px] text-rose-600 font-normal mt-0.5">Booking Kamar Batal</span>
                              </div>
                            ) : canManage ? (
                              (() => {
                                const statusRanks: Record<string, number> = {
                                  MENUNGGU: 0,
                                  SEDANG_DIBUAT: 1,
                                  PENGANTARAN: 2,
                                  SELESAI: 3,
                                  DIBATALKAN: -1
                                };
                                const currentRank = statusRanks[bStatus] ?? 0;
                                return (
                                  <div className="grid grid-cols-2 gap-1 w-36 mx-auto">
                                    <button
                                      type="button"
                                      onClick={() => updateBreakfastOrderStatusState(order.id, 'MENUNGGU')}
                                      disabled={currentRank > 0}
                                      className={`py-1 px-1.5 rounded-md text-[10px] font-bold transition flex items-center justify-center space-x-1 ${
                                        currentRank > 0
                                          ? 'bg-slate-100 text-slate-300 border border-slate-200 cursor-not-allowed opacity-40'
                                          : bStatus === 'MENUNGGU'
                                          ? 'bg-amber-500 text-white shadow-xs'
                                          : 'bg-slate-100 text-slate-600 hover:bg-amber-50 hover:text-amber-900 border border-slate-200 cursor-pointer'
                                      }`}
                                      title={currentRank > 0 ? 'Tahap ini sudah terlewati (Forward-Only)' : 'Tandai Menunggu Antrean'}
                                    >
                                      <i className="fa-solid fa-clock text-[9px]"></i>
                                      <span>Antre</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => updateBreakfastOrderStatusState(order.id, 'SEDANG_DIBUAT')}
                                      disabled={currentRank > 1}
                                      className={`py-1 px-1.5 rounded-md text-[10px] font-bold transition flex items-center justify-center space-x-1 ${
                                        currentRank > 1
                                          ? 'bg-slate-100 text-slate-300 border border-slate-200 cursor-not-allowed opacity-40'
                                          : bStatus === 'SEDANG_DIBUAT'
                                          ? 'bg-blue-600 text-white shadow-xs'
                                          : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-900 border border-slate-200 cursor-pointer'
                                      }`}
                                      title={currentRank > 1 ? 'Tahap ini sudah terlewati (Forward-Only)' : 'Tandai Sedang Dimasak'}
                                    >
                                      <i className="fa-solid fa-fire text-[9px]"></i>
                                      <span>Masak</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => updateBreakfastOrderStatusState(order.id, 'PENGANTARAN')}
                                      disabled={currentRank > 2}
                                      className={`py-1 px-1.5 rounded-md text-[10px] font-bold transition flex items-center justify-center space-x-1 ${
                                        currentRank > 2
                                          ? 'bg-slate-100 text-slate-300 border border-slate-200 cursor-not-allowed opacity-40'
                                          : bStatus === 'PENGANTARAN'
                                          ? 'bg-purple-600 text-white shadow-xs'
                                          : 'bg-slate-100 text-slate-600 hover:bg-purple-50 hover:text-purple-900 border border-slate-200 cursor-pointer'
                                      }`}
                                      title={currentRank > 2 ? 'Tahap ini sudah terlewati (Forward-Only)' : 'Tandai Dalam Pengantaran'}
                                    >
                                      <i className="fa-solid fa-truck-ramp-box text-[9px]"></i>
                                      <span>Kirim</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => updateBreakfastOrderStatusState(order.id, 'SELESAI')}
                                      disabled={currentRank > 3}
                                      className={`py-1 px-1.5 rounded-md text-[10px] font-bold transition flex items-center justify-center space-x-1 ${
                                        currentRank > 3
                                          ? 'bg-slate-100 text-slate-300 border border-slate-200 cursor-not-allowed opacity-40'
                                          : bStatus === 'SELESAI'
                                          ? 'bg-emerald-600 text-white shadow-xs'
                                          : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-900 border border-slate-200 cursor-pointer'
                                      }`}
                                      title={currentRank > 3 ? 'Tahap ini sudah terlewati (Forward-Only)' : 'Tandai Selesai Disajikan'}
                                    >
                                      <i className="fa-solid fa-circle-check text-[9px]"></i>
                                      <span>Tiba</span>
                                    </button>
                                  </div>
                                );
                              })()
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Hanya Koperasi</span>
                            )}
                          </td>

                          <td className="p-3 text-center">
                            {canManage && (
                              <div className="flex items-center justify-center space-x-1.5">
                                {!isCancelled && (
                                  <button
                                    type="button"
                                    onClick={() => setOrderToCancel(order)}
                                    className="p-1.5 text-amber-700 hover:bg-amber-100 hover:text-amber-900 rounded-lg transition border border-amber-200 shadow-2xs cursor-pointer"
                                    title="Batalkan pesanan ini (ubah status menjadi Batal)"
                                  >
                                    <i className="fa-solid fa-ban text-xs"></i>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setOrderToDelete(order)}
                                  className="p-1.5 text-rose-600 hover:bg-rose-100/70 hover:text-rose-800 rounded-lg transition border border-rose-200 shadow-2xs cursor-pointer"
                                  title="Hapus pesanan ini dari database"
                                >
                                  <i className="fa-solid fa-trash text-xs"></i>
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* ================= SUBVIEW 2: MENU CATALOG (SIMPEL, BERSIH & SESUAI TEMA) ================= */
        <div className="space-y-4">
          {/* Header & Quick Action */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-xs border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-base font-bold shadow-2xs shrink-0 border border-emerald-200">
                <i className="fa-solid fa-utensils"></i>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-black text-slate-800 tracking-tight">
                    Katalog Menu &amp; Katering Koperasi
                  </h3>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold border border-slate-200">
                    {breakfastMenuItems.length} Menu
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Daftar hidangan sarapan dan paket katering jemaah UPT Asrama Haji Jakarta.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>{breakfastMenuItems.filter(m => m.isAvailable).length} Siap Pesan</span>
              </span>
              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingMenuItem(null);
                    setMenuName('');
                    setMenuCategory('MAKANAN_BERAT');
                    setMenuPrice(25000);
                    setMenuDesc('');
                    setMenuAllergens('');
                    setMenuIsAvailable(true);
                    setIsAddMenuOpen(true);
                  }}
                  className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 active:scale-98 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5 cursor-pointer ml-auto sm:ml-0 border border-emerald-600"
                >
                  <i className="fa-solid fa-plus text-xs"></i>
                  <span>Tambah Menu</span>
                </button>
              )}
            </div>
          </div>

          {/* Simple Filter & Search Bar */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs">
            {/* Category Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setMenuCategoryFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                  menuCategoryFilter === 'ALL'
                    ? 'bg-slate-800 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Semua ({breakfastMenuItems.length})
              </button>
              <button
                type="button"
                onClick={() => setMenuCategoryFilter('MAKANAN_BERAT')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                  menuCategoryFilter === 'MAKANAN_BERAT'
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                }`}
              >
                Makanan Utama ({breakfastMenuItems.filter(m => m.category === 'MAKANAN_BERAT').length})
              </button>
              <button
                type="button"
                onClick={() => setMenuCategoryFilter('BUBUR_SAYUR')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                  menuCategoryFilter === 'BUBUR_SAYUR'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                }`}
              >
                Bubur &amp; Sayur ({breakfastMenuItems.filter(m => m.category === 'BUBUR_SAYUR').length})
              </button>
              <button
                type="button"
                onClick={() => setMenuCategoryFilter('SNACK_KUDAPAN')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                  menuCategoryFilter === 'SNACK_KUDAPAN'
                    ? 'bg-purple-600 text-white shadow-2xs'
                    : 'bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-200'
                }`}
              >
                Snack ({breakfastMenuItems.filter(m => m.category === 'SNACK_KUDAPAN').length})
              </button>
              <button
                type="button"
                onClick={() => setMenuCategoryFilter('MINUMAN')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                  menuCategoryFilter === 'MINUMAN'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200'
                }`}
              >
                Minuman ({breakfastMenuItems.filter(m => m.category === 'MINUMAN').length})
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <select
                value={menuStockFilter}
                onChange={e => setMenuStockFilter(e.target.value as any)}
                className="py-1.5 px-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none text-slate-800"
              >
                <option value="ALL">Semua Status Stok</option>
                <option value="AVAILABLE">Tersedia Saja</option>
                <option value="UNAVAILABLE">Habis Saja</option>
              </select>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Cari menu / lauk..."
                  value={menuSearch}
                  onChange={e => setMenuSearch(e.target.value)}
                  className="py-1.5 pl-7 pr-6 text-xs bg-slate-50 border border-slate-300 rounded-lg w-36 sm:w-48 outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-800"
                />
                <i className="fa-solid fa-magnifying-glass absolute left-2 top-2.5 text-slate-400 text-[10px]"></i>
                {menuSearch && (
                  <button
                    type="button"
                    onClick={() => setMenuSearch('')}
                    className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Menu Cards Grid */}
          {(() => {
            const filteredList = breakfastMenuItems.filter(item => {
              if (menuCategoryFilter !== 'ALL' && item.category !== menuCategoryFilter) return false;
              if (menuStockFilter === 'AVAILABLE' && !item.isAvailable) return false;
              if (menuStockFilter === 'UNAVAILABLE' && item.isAvailable) return false;
              if (menuSearch.trim()) {
                const q = menuSearch.toLowerCase().trim();
                const matchName = item.name.toLowerCase().includes(q);
                const matchDesc = (item.description || '').toLowerCase().includes(q);
                const matchAllergen = (item.allergens || '').toLowerCase().includes(q);
                if (!matchName && !matchDesc && !matchAllergen) return false;
              }
              return true;
            });

            if (filteredList.length === 0) {
              return (
                <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl mx-auto border border-emerald-200 shadow-inner">
                    <i className="fa-solid fa-utensils"></i>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">Tidak Ada Menu yang Sesuai</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Coba sesuaikan kata kunci pencarian atau ubah filter kategori.
                    </p>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMenuItem(null);
                        setMenuName('');
                        setMenuCategory('MAKANAN_BERAT');
                        setMenuPrice(25000);
                        setMenuDesc('');
                        setMenuAllergens('');
                        setMenuIsAvailable(true);
                        setIsAddMenuOpen(true);
                      }}
                      className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition inline-flex items-center space-x-1.5 cursor-pointer"
                    >
                      <i className="fa-solid fa-plus text-xs"></i>
                      <span>Tambah Menu Baru</span>
                    </button>
                  )}
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredList.map(item => {
                  const categoryLabels: Record<string, { label: string; color: string; icon: string }> = {
                    MAKANAN_BERAT: { label: 'Makanan Utama', color: 'bg-emerald-50 text-emerald-800 border-emerald-200', icon: 'fa-bowl-rice' },
                    BUBUR_SAYUR: { label: 'Bubur & Sayur', color: 'bg-amber-50 text-amber-800 border-amber-200', icon: 'fa-wheat-awn' },
                    SNACK_KUDAPAN: { label: 'Snack / Kudapan', color: 'bg-purple-50 text-purple-800 border-purple-200', icon: 'fa-cookie-bite' },
                    MINUMAN: { label: 'Minuman', color: 'bg-blue-50 text-blue-800 border-blue-200', icon: 'fa-mug-hot' }
                  };
                  const catInfo = categoryLabels[item.category] || { label: item.category, color: 'bg-slate-50 text-slate-700 border-slate-200', icon: 'fa-utensils' };

                  return (
                    <div key={item.id} className="p-4 rounded-xl border border-slate-200 bg-white hover:shadow-md transition flex flex-col justify-between space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center space-x-1 ${catInfo.color}`}>
                            <i className={`fa-solid ${catInfo.icon} text-[9px]`}></i>
                            <span>{catInfo.label}</span>
                          </span>

                          <button
                            type="button"
                            onClick={() => {
                              const updated = { ...item, isAvailable: !item.isAvailable };
                              updateBreakfastMenuItem(updated);
                              showToast(`Menu "${item.name}" diatur: ${updated.isAvailable ? 'Tersedia' : 'Habis'}`, 'info');
                            }}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition flex items-center space-x-1 ${
                              item.isAvailable 
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100' 
                                : 'bg-rose-50 text-rose-800 border border-rose-300 hover:bg-rose-100'
                            }`}
                            title="Klik untuk toggle status ketersediaan stok"
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${item.isAvailable ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                            <span>{item.isAvailable ? 'Tersedia' : 'Habis'}</span>
                          </button>
                        </div>

                        <h4 className="font-bold text-slate-900 text-sm leading-snug">{item.name}</h4>
                        <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{item.description}</p>

                        {item.allergens && (
                          <div className="text-[10px] text-amber-900 bg-amber-50/80 px-2 py-1 rounded-md border border-amber-200 flex items-center space-x-1">
                            <i className="fa-solid fa-triangle-exclamation text-amber-600 text-[9px] shrink-0"></i>
                            <span className="truncate">Alergen: {item.allergens}</span>
                          </div>
                        )}
                      </div>

                      <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">Harga per Porsi</span>
                          <span className="text-sm font-extrabold text-emerald-700 font-mono">
                            Rp {item.price.toLocaleString('id-ID')}
                          </span>
                        </div>

                        {canManage && (
                          <div className="flex items-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => openEditMenu(item)}
                              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs transition cursor-pointer"
                              title="Ubah Menu"
                            >
                              <i className="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button
                              type="button"
                              onClick={() => setMenuToDelete(item)}
                              className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs transition cursor-pointer"
                              title="Hapus Menu"
                            >
                              <i className="fa-solid fa-trash-can"></i>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* ================= MODAL: BUAT PESANAN SARAPAN BARU ================= */}
      {isAddOrderOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setIsAddOrderOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 space-y-4 custom-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="font-bold text-slate-800 text-base flex items-center space-x-2">
                <i className="fa-solid fa-bowl-rice text-orange-600"></i>
                <span>Formulir Pesanan</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsAddOrderOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-sm"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="space-y-3.5 text-xs">
              {/* Selector Mode */}
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setFormRoomMode('SELECT_ACTIVE')}
                  className={`flex-1 py-1.5 rounded-lg font-bold border transition ${
                    formRoomMode === 'SELECT_ACTIVE'
                      ? 'bg-orange-50 border-orange-400 text-orange-800'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  Pilih Tamu / Kamar Aktif
                </button>
                <button
                  type="button"
                  onClick={() => setFormRoomMode('MANUAL')}
                  className={`flex-1 py-1.5 rounded-lg font-bold border transition ${
                    formRoomMode === 'MANUAL'
                      ? 'bg-orange-50 border-orange-400 text-orange-800'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  Input Bebas (Aula / Walk-In)
                </button>
              </div>

              {/* Pemilihan Gedung Terlebih Dahulu */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  <i className="fa-solid fa-hotel text-orange-600 mr-1"></i>
                  Pilih Gedung Fasilitas
                </label>
                <select
                  value={orderBuilding}
                  onChange={e => {
                    const newB = e.target.value;
                    setOrderBuilding(newB);
                    setOrderRoomNumber('');
                    setOrderGuestName('');
                    setOrderPhone('');
                    setOrderKloter('');
                  }}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none font-semibold focus:ring-2 focus:ring-orange-500"
                >
                  {sortedBuildings.map(bName => (
                    <option key={bName} value={bName}>{bName}</option>
                  ))}
                </select>
              </div>

              {formRoomMode === 'SELECT_ACTIVE' ? (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    <i className="fa-solid fa-door-open text-orange-600 mr-1"></i>
                    Pilih Kamar di {orderBuilding}
                  </label>
                  <select
                    value={orderRoomNumber}
                    onChange={e => {
                      const selRoom = e.target.value;
                      setOrderRoomNumber(selRoom);
                      const activeTx = activeRoomTxs.find(t => 
                        t.roomNumber === selRoom && (t.building === orderBuilding || !orderBuilding)
                      ) || activeRoomTxs.find(t => t.roomNumber === selRoom);

                      if (activeTx) {
                        setOrderGuestName(activeTx.guestName);
                        setOrderPhone(activeTx.phone || '');
                        setOrderKloter(activeTx.kloter || '');
                        setOrderPortions(activeTx.breakfastPortions || 2);
                        setOrderStartDate(activeTx.startDate || todayStr);
                        setOrderDays(activeTx.breakfastDays || activeTx.duration || 1);
                      }
                    }}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none font-semibold focus:ring-2 focus:ring-orange-500"
                    required
                  >
                    <option value="">-- Pilih Kamar di {orderBuilding} --</option>
                    {roomsInOrderBuilding.length > 0 ? (
                      roomsInOrderBuilding.map(r => {
                        const tx = activeRoomTxs.find(t => t.roomId === r.id || (t.roomNumber === r.roomNumber && t.building === r.building));
                        const statusIcon = 
                          r.status === 'TERISI' ? '🟢 [TERISI]' :
                          r.status === 'BOOKED' ? '🔵 [BOOKED]' :
                          r.status === 'MAINTENANCE' ? '🟡 [MAINTENANCE]' : '⚪ [KOSONG]';
                        const tenantInfo = tx ? ` - ${tx.guestName}` : (r.status === 'KOSONG' ? ' - Siap Dipesan Walk-In' : '');
                        return (
                          <option key={r.id} value={r.roomNumber}>
                            {statusIcon} Kamar {r.roomNumber} ({r.type || 'Standar'}){tenantInfo}
                          </option>
                        );
                      })
                    ) : (
                      activeRoomTxs.filter(t => t.building === orderBuilding).map(t => (
                        <option key={t.id} value={t.roomNumber}>
                          [{t.status}] Kamar {t.roomNumber} - {t.guestName}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    <i className="fa-solid fa-tag text-orange-600 mr-1"></i>
                    Nomor / Nama Ruangan (Input Manual)
                  </label>
                  <input
                    type="text"
                    placeholder="Misal: Aula Utama Arafah / Ruang VIP 101"
                    value={orderRoomNumber}
                    onChange={e => setOrderRoomNumber(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 font-semibold"
                    required
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nama Tamu / Pemesan</label>
                  <input
                    type="text"
                    value={orderGuestName}
                    onChange={e => setOrderGuestName(e.target.value)}
                    placeholder="Nama pemesan"
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kloter / Rombongan (Opsional)</label>
                  <input
                    type="text"
                    value={orderKloter}
                    onChange={e => setOrderKloter(e.target.value)}
                    placeholder="Contoh: 04 JKS"
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              {/* Menu & Portions */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Pilihan Menu Sarapan</label>
                  <select
                    value={orderMenuName}
                    onChange={e => setOrderMenuName(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none font-semibold focus:ring-2 focus:ring-orange-500"
                  >
                    {breakfastMenuItems.map(m => (
                      <option key={m.id} value={m.name}>
                        {m.name} - Rp {m.price.toLocaleString('id-ID')}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Jumlah Porsi</label>
                  <input
                    type="number"
                    min="1"
                    value={orderPortions}
                    onChange={e => setOrderPortions(Math.max(1, Number(e.target.value)))}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 font-bold text-center"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mulai Tanggal Antar</label>
                  <input
                    type="date"
                    value={orderStartDate}
                    onChange={e => setOrderStartDate(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Jam Pengantaran</label>
                  <select
                    value={orderDeliveryTime}
                    onChange={e => setOrderDeliveryTime(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 font-semibold"
                  >
                    <option value="05:30 WIB">05:30 WIB (Pagi Awal)</option>
                    <option value="06:00 WIB">06:00 WIB</option>
                    <option value="06:30 WIB">06:30 WIB (Standar)</option>
                    <option value="07:00 WIB">07:00 WIB</option>
                    <option value="07:30 WIB">07:30 WIB</option>
                    <option value="08:00 WIB">08:00 WIB</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Catatan Pantangan Makanan</label>
                <input
                  type="text"
                  value={orderDietary}
                  onChange={e => setOrderDietary(e.target.value)}
                  placeholder="Biasa / Bebas Santan / Tanpa MSG / Lansia"
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Instruksi Khusus Dapur / Kurir</label>
                <textarea
                  rows={2}
                  value={orderNotes}
                  onChange={e => setOrderNotes(e.target.value)}
                  placeholder="Misal: Antar ke meja kamar 101, hubungi no tamu dahulu..."
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddOrderOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-xs transition cursor-pointer"
                >
                  Simpan Pesanan ke Database
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: TAMBAH / UBAH MENU SARAPAN ================= */}
      {isAddMenuOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setIsAddMenuOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-base shrink-0 border border-emerald-200 shadow-2xs">
                  <i className="fa-solid fa-bowl-rice"></i>
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm sm:text-base leading-tight">
                    {editingMenuItem ? 'Ubah Data Menu' : 'Tambah Menu Baru'}
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Katalog Katering &amp; Hidangan Jemaah
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddMenuOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center text-sm transition"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleSaveMenuItem} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nama Menu / Hidangan <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Nasi Goreng Kampung Telur Ceplok"
                  value={menuName}
                  onChange={e => setMenuName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white font-semibold text-slate-900 transition"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kategori Menu</label>
                  <select
                    value={menuCategory}
                    onChange={e => setMenuCategory(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-none font-semibold focus:ring-2 focus:ring-emerald-600 focus:bg-white text-slate-800 transition"
                  >
                    <option value="MAKANAN_BERAT">🍚 Makanan Utama</option>
                    <option value="BUBUR_SAYUR">🥣 Bubur &amp; Sayur</option>
                    <option value="SNACK_KUDAPAN">🍪 Snack / Kudapan</option>
                    <option value="MINUMAN">☕ Minuman</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Harga per Porsi (Rp) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 font-bold text-slate-400 text-xs">Rp</span>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={menuPrice}
                      onChange={e => setMenuPrice(Number(e.target.value))}
                      className="w-full p-2.5 pl-8 bg-slate-50 border border-slate-300 rounded-xl outline-none font-bold text-emerald-800 focus:ring-2 focus:ring-emerald-600 focus:bg-white font-mono transition"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Deskripsi Menu &amp; Lauk Pendamping</label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Nasi pulen gurih dengan suwiran ayam, acar mentimun, emping dan kerupuk..."
                  value={menuDesc}
                  onChange={e => setMenuDesc(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white text-slate-800 transition"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Kandungan Alergen / Pantangan (Opsional)</label>
                <input
                  type="text"
                  placeholder="Contoh: Telur, Kacang Tanah, Gluten, Susu"
                  value={menuAllergens}
                  onChange={e => setMenuAllergens(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white text-slate-800 transition"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 block text-xs">Status Ketersediaan Stok</span>
                  <span className="text-[10px] text-slate-500 block">
                    {menuIsAvailable ? 'Menu aktif dan dapat langsung dipesan' : 'Menu ditandai habis (stok kosong)'}
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={menuIsAvailable}
                    onChange={e => setMenuIsAvailable(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddMenuOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl shadow-xs transition cursor-pointer flex items-center space-x-1.5 border border-emerald-600"
                >
                  <i className="fa-solid fa-check text-xs"></i>
                  <span>{editingMenuItem ? 'Simpan Perubahan' : 'Simpan ke Katalog'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: KONFIRMASI HAPUS PESANAN ================= */}
      {orderToDelete && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setOrderToDelete(null)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 space-y-4 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center text-xl mx-auto border border-rose-200 shadow-inner">
              <i className="fa-solid fa-trash-can"></i>
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-sm">Hapus Pesanan Makanan?</h4>
              <p className="text-xs text-slate-500 mt-1">
                Apakah Anda yakin ingin menghapus pesanan untuk <strong className="text-slate-800">Kamar {orderToDelete.roomNumber}</strong> ({orderToDelete.guestName})?
              </p>
              <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 text-left text-[11px] space-y-0.5 mt-2.5">
                <div>Gedung: <span className="font-bold text-slate-700">{orderToDelete.building}</span></div>
                <div>Menu: <span className="font-semibold text-orange-700">{orderToDelete.menuName} ({orderToDelete.portions} porsi)</span></div>
                <div>Tanggal: <span className="font-semibold text-slate-700">{formatIndonesianDate(orderToDelete.startDate)}</span></div>
              </div>
            </div>
            <div className="flex items-center justify-center space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setOrderToDelete(null)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteBreakfastOrder(orderToDelete.id);
                  setOrderToDelete(null);
                }}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-xs transition cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: KONFIRMASI BATALKAN PESANAN ================= */}
      {orderToCancel && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setOrderToCancel(null)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 space-y-4 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl mx-auto border border-amber-200 shadow-inner">
              <i className="fa-solid fa-ban"></i>
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-sm">Batalkan Pesanan Makanan?</h4>
              <p className="text-xs text-slate-500 mt-1">
                Apakah Anda yakin ingin membatalkan pesanan untuk <strong className="text-slate-800">Kamar {orderToCancel.roomNumber}</strong> ({orderToCancel.guestName})?
              </p>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-left text-[11px] space-y-1 mt-2.5">
                <div>Gedung: <span className="font-bold text-slate-700">{orderToCancel.building}</span></div>
                <div>Menu: <span className="font-semibold text-orange-700">{orderToCancel.menuName} ({orderToCancel.portions} porsi)</span></div>
                <div>Status Sekarang: <span className="font-semibold text-amber-700">{orderToCancel.status || 'MENUNGGU'}</span></div>
                <div>Status Baru: <span className="font-bold text-rose-700">DIBATALKAN (BATAL)</span></div>
              </div>
            </div>
            <div className="flex items-center justify-center space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setOrderToCancel(null)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={() => {
                  updateBreakfastOrderStatusState(orderToCancel.id, 'DIBATALKAN');
                  showToast(`Pesanan kamar ${orderToCancel.roomNumber} berhasil dibatalkan.`, 'info');
                  setOrderToCancel(null);
                }}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-xs transition cursor-pointer"
              >
                Ya, Batalkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: KONFIRMASI HAPUS MENU KATALOG ================= */}
      {menuToDelete && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setMenuToDelete(null)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 space-y-4 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center text-xl mx-auto border border-rose-200 shadow-inner">
              <i className="fa-solid fa-trash-can"></i>
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-base">Hapus Menu dari Katalog?</h4>
              <p className="text-xs text-slate-500 mt-1">
                Apakah Anda yakin ingin menghapus menu <strong className="text-slate-800">{menuToDelete.name}</strong> dari daftar katering?
              </p>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-left text-xs space-y-1 mt-3">
                <div className="flex justify-between">
                  <span className="text-slate-500">Kategori:</span>
                  <span className="font-bold text-slate-700">
                    {menuToDelete.category === 'MAKANAN_BERAT' ? 'Makanan Utama' :
                     menuToDelete.category === 'BUBUR_SAYUR' ? 'Bubur & Sayur' :
                     menuToDelete.category === 'SNACK_KUDAPAN' ? 'Snack / Kudapan' : 'Minuman'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Harga per Porsi:</span>
                  <span className="font-bold text-emerald-700 font-mono">Rp {menuToDelete.price.toLocaleString('id-ID')}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-center space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setMenuToDelete(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteBreakfastMenuItem(menuToDelete.id);
                  showToast(`Menu "${menuToDelete.name}" berhasil dihapus dari katalog.`, 'info');
                  setMenuToDelete(null);
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-xs transition cursor-pointer"
              >
                Ya, Hapus Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AuditLogView({ defaultSubView }: { defaultSubView?: 'WORK_SESSIONS' | 'ROLE_PERMISSIONS' | 'AUDIT_TRAIL' | 'PDF_DOWNLOAD_LOGS' | 'DATABASE_MGMT' | 'SPREADSHEET_MGMT' } = {}) {
  const { 
    auditLogs = [], workSessions = [], currentUser, showToast, openModal, login,
    exportDatabaseBackup, importDatabaseBackup, resetDatabase, clearWorkSessions, clearAuditLogs,
    buildings = [], rooms = [], transactions = [], maintenances = [], users = [],
    breakfastOrders = [], breakfastMenuItems = [], qcInspections = [],
    supabaseSyncState, manualSyncSupabase, pushAllToSupabase, setActiveTab, dataStorage,
    updateUser, appSettings, updateAppSettings,
    onlinePresences = [], openChat, forceEndWorkSession
  } = useAppContext();
  const safeWorkSessions = workSessions || [];
  const fileImportRef = React.useRef<HTMLInputElement>(null);
  const [showClearAuditModal, setShowClearAuditModal] = useState(false);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);

  // State for live ticker
  const [ticker, setTicker] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTicker(t => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Filter States
  const [selectedUser, setSelectedUser] = useState<string>('SEMUA');
  const [selectedRole, setSelectedRole] = useState<string>('SEMUA');
  const [sessionStatus, setSessionStatus] = useState<string>('SEMUA');
  const [datePreset, setDatePreset] = useState<'SEMUA' | 'HARI_INI' | 'KEMARIN' | '3_HARI' | '7_HARI' | 'KUSTOM'>('SEMUA');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Tab within this view: 'WORK_SESSIONS' | 'ROLE_PERMISSIONS' | 'AUDIT_TRAIL' | 'DATABASE_MGMT' | 'SPREADSHEET_MGMT'
  const canAccessAdminTabs = Boolean(currentUser && (isSuperAdmin(currentUser.role) || currentUser.role === 'Admin'));
  const [activeSubView, setActiveSubView] = useState<'WORK_SESSIONS' | 'ROLE_PERMISSIONS' | 'AUDIT_TRAIL' | 'DATABASE_MGMT' | 'SPREADSHEET_MGMT'>(
    defaultSubView === 'ROLE_PERMISSIONS' && canAccessAdminTabs
      ? 'ROLE_PERMISSIONS'
      : defaultSubView === 'DATABASE_MGMT' && canAccessAdminTabs
      ? 'DATABASE_MGMT'
      : defaultSubView === 'SPREADSHEET_MGMT' && canAccessAdminTabs
      ? 'SPREADSHEET_MGMT'
      : defaultSubView === 'AUDIT_TRAIL' || defaultSubView === 'PDF_DOWNLOAD_LOGS'
      ? 'AUDIT_TRAIL'
      : 'WORK_SESSIONS'
  );

  // Pastikan jika beralih ke akun selain Admin / Super Admin, tab khusus Admin otomatis kembali ke WORK_SESSIONS
  useEffect(() => {
    if (!canAccessAdminTabs && (activeSubView === 'ROLE_PERMISSIONS' || activeSubView === 'DATABASE_MGMT' || activeSubView === 'SPREADSHEET_MGMT')) {
      setActiveSubView('WORK_SESSIONS');
    }
  }, [canAccessAdminTabs, activeSubView]);

  // Sub-halaman di dalam Log Aktivitas Sistem (AUDIT_TRAIL): 'ALL_LOGS' | 'PDF_LOGS' | 'VERIFY'
  const [auditSubTab, setAuditSubTab] = useState<'ALL_LOGS' | 'PDF_LOGS' | 'VERIFY'>(
    defaultSubView === 'PDF_DOWNLOAD_LOGS' ? 'PDF_LOGS' : 'ALL_LOGS'
  );

  // PDF Download Log Filters
  const [pdfDatePreset, setPdfDatePreset] = useState<'SEMUA' | 'HARI_INI' | 'KEMARIN' | '3_HARI' | '7_HARI' | 'KUSTOM'>('SEMUA');
  const [pdfStartDate, setPdfStartDate] = useState<string>('');
  const [pdfEndDate, setPdfEndDate] = useState<string>('');
  const [pdfOfficerFilter, setPdfOfficerFilter] = useState<string>('SEMUA');
  const [pdfSearch, setPdfSearch] = useState<string>('');
  
  useEffect(() => {
    const targetSub = sessionStorage.getItem('audit_log_target_subview');
    if (targetSub) {
      sessionStorage.removeItem('audit_log_target_subview');
      if (targetSub === 'PDF_DOWNLOAD_LOGS') {
        setActiveSubView('AUDIT_TRAIL');
        setAuditSubTab('PDF_LOGS');
      } else {
        setActiveSubView(targetSub as any);
      }
    } else if (defaultSubView) {
      if (defaultSubView === 'PDF_DOWNLOAD_LOGS') {
        setActiveSubView('AUDIT_TRAIL');
        setAuditSubTab('PDF_LOGS');
      } else {
        setActiveSubView(defaultSubView as any);
      }
    }
    if (sessionStorage.getItem('verify_code_target')) {
      setActiveSubView('AUDIT_TRAIL');
      setAuditSubTab('VERIFY');
    }
  }, [defaultSubView]);

  // Modal konfirmasi Reset Database & Reset Sesi
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [showResetSessionsModal, setShowResetSessionsModal] = useState(false);
  useBodyScrollLock(showResetConfirmModal || showResetSessionsModal);
  
  // Audit Trail Filters
  const [auditActionFilter, setAuditActionFilter] = useState<string>('SEMUA');
  const [auditSearch, setAuditSearch] = useState<string>('');

  const realToday = getRealTodayDate();
  const realYesterday = addDaysToDateStr(realToday, -1);
  const dateMinus3 = addDaysToDateStr(realToday, -3);
  const dateMinus7 = addDaysToDateStr(realToday, -7);

  // Unique users and roles for filter dropdowns
  const uniqueUsers = useMemo(() => {
    const names = new Set<string>();
    safeWorkSessions.forEach(s => names.add(s.userName));
    return Array.from(names);
  }, [safeWorkSessions]);

  const uniqueRoles = useMemo(() => {
    const roles = new Set<string>();
    safeWorkSessions.forEach(s => roles.add(s.userRole));
    return Array.from(roles);
  }, [safeWorkSessions]);

  // Compute live duration for active sessions
  const sessionsWithLiveDuration = useMemo(() => {
    return safeWorkSessions.map(session => {
      if (session.status === 'AKTIF') {
        const loginDate = parseLocalTimeString(session.loginTime);
        const now = new Date();
        const diffSeconds = Math.max(0, Math.floor((now.getTime() - loginDate.getTime()) / 1000));
        return {
          ...session,
          durationSeconds: diffSeconds,
          durationFormatted: `${formatHMS(diffSeconds)} (Sedang Berjalan)`
        };
      }
      return session;
    });
  }, [safeWorkSessions, ticker]);

  // Filtered Sessions
  const filteredSessions = useMemo(() => {
    return sessionsWithLiveDuration.filter(session => {
      // User filter
      if (selectedUser !== 'SEMUA' && session.userName !== selectedUser) {
        return false;
      }

      // Role filter
      if (selectedRole !== 'SEMUA' && session.userRole !== selectedRole) {
        return false;
      }

      // Status filter
      if (sessionStatus !== 'SEMUA' && session.status !== sessionStatus) {
        return false;
      }

      // Date Presets
      const sessionDate = session.loginTime.split(' ')[0];
      if (datePreset === 'HARI_INI' && sessionDate !== realToday) {
        return false;
      }
      if (datePreset === 'KEMARIN' && sessionDate !== realYesterday) {
        return false;
      }
      if (datePreset === '3_HARI' && sessionDate < dateMinus3) {
        return false;
      }
      if (datePreset === '7_HARI' && sessionDate < dateMinus7) {
        return false;
      }
      if (datePreset === 'KUSTOM') {
        if (customStartDate && sessionDate < customStartDate) return false;
        if (customEndDate && sessionDate > customEndDate) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchId = session.id.toLowerCase().includes(q);
        const matchName = session.userName.toLowerCase().includes(q);
        const matchRole = session.userRole.toLowerCase().includes(q);
        const matchNotes = (session.notes || '').toLowerCase().includes(q);
        if (!matchId && !matchName && !matchRole && !matchNotes) {
          return false;
        }
      }

      return true;
    });
  }, [sessionsWithLiveDuration, selectedUser, selectedRole, sessionStatus, datePreset, customStartDate, customEndDate, searchQuery, realToday, realYesterday, dateMinus3, dateMinus7]);

  // Aggregate statistics for filtered sessions
  const totalFilteredSeconds = useMemo(() => {
    return filteredSessions.reduce((acc, s) => acc + s.durationSeconds, 0);
  }, [filteredSessions]);

  // Real-Time Active Officers List (merges active workSessions + live onlinePresences across all concurrent accounts)
  const activeOfficersList = useMemo(() => {
    const byUser = new Map<string, {
      sessionId: string;
      userId: string;
      userName: string;
      userRole: string;
      department?: string;
      assignedBuilding?: string;
      loginTime: string;
      durationSeconds: number;
      lastHeartbeat?: string;
      deviceInfo?: string;
      isCurrentUser: boolean;
      hasLivePresence: boolean;
    }>();

    const nowMs = Date.now();

    // 1. Add all active work sessions with live ticking duration
    sessionsWithLiveDuration
      .filter(s => s.status === 'AKTIF' && !s.logoutTime)
      .forEach(s => {
        const matchedUser = users.find(u => u.id === s.userId || u.fullName === s.userName);
        const uid = s.userId || matchedUser?.id || s.userName;
        const livePresence = onlinePresences.find(p => {
          if (p.userId !== uid) return false;
          const lastSeen = p.lastSeenMs || (p as any).lastSeen || 0;
          return !lastSeen || nowMs - lastSeen < 180000;
        });
        const existing = byUser.get(uid);
        if (!existing || (s.loginTime || '') > (existing.loginTime || '')) {
          byUser.set(uid, {
            sessionId: s.id,
            userId: uid,
            userName: s.userName || matchedUser?.fullName || 'Petugas',
            userRole: s.userRole || matchedUser?.role || 'Petugas',
            department: s.department || matchedUser?.department || livePresence?.department,
            assignedBuilding: s.assignedBuilding || matchedUser?.assignedBuilding || livePresence?.assignedBuilding,
            loginTime: s.loginTime,
            durationSeconds: s.durationSeconds,
            lastHeartbeat: s.lastHeartbeat || livePresence?.loginTime,
            deviceInfo: s.deviceInfo || (livePresence as any)?.deviceInfo,
            isCurrentUser: Boolean(currentUser && (uid === currentUser.id || s.userName === currentUser.fullName)),
            hasLivePresence: Boolean(livePresence || (currentUser && uid === currentUser.id))
          });
        }
      });

    // 2. Also include any account broadcasting live presence in real-time even if session record is still syncing
    onlinePresences.forEach(p => {
      const pLastSeen = p.lastSeenMs || (p as any).lastSeen || 0;
      if (!p.userId || (pLastSeen && nowMs - pLastSeen > 180000)) return;
      if (!byUser.has(p.userId)) {
        const matchedUser = users.find(u => u.id === p.userId);
        const loginStr = p.loginTime || `${realToday} 08:00:00`;
        const loginDate = parseLocalTimeString(loginStr);
        const diffSeconds = Math.max(0, Math.floor((nowMs - loginDate.getTime()) / 1000));
        byUser.set(p.userId, {
          sessionId: p.sessionId || `LIVE-${p.userId}`,
          userId: p.userId,
          userName: p.userName || matchedUser?.fullName || 'Petugas',
          userRole: p.userRole || matchedUser?.role || 'Petugas',
          department: p.department || matchedUser?.department,
          assignedBuilding: p.assignedBuilding || matchedUser?.assignedBuilding,
          loginTime: loginStr,
          durationSeconds: diffSeconds,
          lastHeartbeat: 'Live Real-Time',
          deviceInfo: p.deviceInfo,
          isCurrentUser: Boolean(currentUser && p.userId === currentUser.id),
          hasLivePresence: true
        });
      }
    });

    return Array.from(byUser.values()).sort((a, b) => {
      if (a.isCurrentUser !== b.isCurrentUser) return a.isCurrentUser ? -1 : 1;
      return b.durationSeconds - a.durationSeconds;
    });
  }, [sessionsWithLiveDuration, onlinePresences, users, currentUser, ticker, realToday]);

  const activeOfficersCount = activeOfficersList.length;

  const averageDurationSeconds = useMemo(() => {
    if (filteredSessions.length === 0) return 0;
    return Math.floor(totalFilteredSeconds / filteredSessions.length);
  }, [totalFilteredSeconds, filteredSessions.length]);

  // View mode for work records: 'REKAP_HARIAN' (Akumulasi harian) or 'RINCIAN_SESI' (Per sesi individual)
  const [recordViewMode, setRecordViewMode] = useState<'REKAP_HARIAN' | 'RINCIAN_SESI'>('REKAP_HARIAN');
  const [expandedDateRows, setExpandedDateRows] = useState<Record<string, boolean>>({});

  const toggleExpandDateRow = (key: string) => {
    setExpandedDateRows(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Group sessions by officer and date:
  // JIKA PETUGAS YANG SAMA TERDAPAT CHECK-IN DI TANGGAL YANG SAMA,
  // MAKA DURASI AKAN OTOMATIS TERAKUMULASI DI TANGGAL TERSEBUT
  // DAN JIKA DIA CHECK-IN LAGI DI TANGGAL YANG SAMA, MAKA REKAP AKAN MENYESUAIKAN!
  const dailyWorkRecords = useMemo(() => {
    const map = new Map<string, {
      key: string;
      date: string;
      userId: string;
      userName: string;
      userRole: string;
      sessionCount: number;
      totalDurationSeconds: number;
      firstLoginTime: string;
      lastLogoutTime: string | null;
      status: 'AKTIF' | 'SELESAI';
      hasActiveSession: boolean;
      sessions: (WorkSession & { durationSeconds: number; durationFormatted: string })[];
      hasMultipleSessions: boolean;
      notesList: string[];
    }>();

    // Sort chronologically ascending for clean timeline
    const sorted = [...filteredSessions].sort((a, b) => (a.loginTime || '').localeCompare(b.loginTime || ''));

    sorted.forEach(s => {
      const loginDate = (s.loginTime || '').split(' ')[0] || '';
      const key = `${s.userName || ''}___${loginDate}`;
      const existing = map.get(key);

      if (!existing) {
        map.set(key, {
          key,
          date: loginDate,
          userId: s.userId,
          userName: s.userName,
          userRole: s.userRole,
          sessionCount: 1,
          totalDurationSeconds: s.durationSeconds,
          firstLoginTime: s.loginTime,
          lastLogoutTime: s.logoutTime,
          status: s.status,
          hasActiveSession: s.status === 'AKTIF',
          sessions: [s],
          hasMultipleSessions: false,
          notesList: s.notes ? [s.notes] : []
        });
      } else {
        existing.sessionCount += 1;
        existing.totalDurationSeconds += s.durationSeconds;
        existing.sessions.push(s);
        existing.hasMultipleSessions = true;
        if (s.notes && !existing.notesList.includes(s.notes)) {
          existing.notesList.push(s.notes);
        }
        // If any session on this date is still AKTIF, daily status is AKTIF
        if (s.status === 'AKTIF') {
          existing.status = 'AKTIF';
          existing.hasActiveSession = true;
          existing.lastLogoutTime = null;
        } else if (!existing.hasActiveSession) {
          // Both are finished, update lastLogoutTime if s.logoutTime is later
          if (s.logoutTime && (!existing.lastLogoutTime || s.logoutTime > existing.lastLogoutTime)) {
            existing.lastLogoutTime = s.logoutTime;
          }
        }
      }
    });

    // Sort by date descending (newest first), then userName
    return Array.from(map.values()).sort((a, b) => {
      const cmpDate = (b.date || '').localeCompare(a.date || '');
      if (cmpDate !== 0) return cmpDate;
      return (a.userName || '').localeCompare(b.userName || '');
    });
  }, [filteredSessions]);

  // Lookup map to get daily accumulated info for any individual session
  const sessionDailyMap = useMemo(() => {
    const map = new Map<string, { totalDurationSeconds: number; sessionCount: number; date: string }>();
    dailyWorkRecords.forEach(rec => {
      rec.sessions.forEach(s => {
        map.set(s.id, {
          totalDurationSeconds: rec.totalDurationSeconds,
          sessionCount: rec.sessionCount,
          date: rec.date
        });
      });
    });
    return map;
  }, [dailyWorkRecords]);

  // Summary by individual officer
  const userSummaries = useMemo(() => {
    const map = new Map<string, {
      userId: string;
      userName: string;
      userRole: string;
      totalSeconds: number;
      sessionCount: number;
      uniqueDates: Set<string>;
      hasMultiCheckinDates: boolean;
      lastSession: WorkSession | null;
      isOnline: boolean;
    }>();

    sessionsWithLiveDuration.forEach(s => {
      const loginDate = s.loginTime.split(' ')[0];
      const existing = map.get(s.userName);
      if (!existing) {
        const dateSet = new Set<string>();
        dateSet.add(loginDate);
        map.set(s.userName, {
          userId: s.userId,
          userName: s.userName,
          userRole: s.userRole,
          totalSeconds: s.durationSeconds,
          sessionCount: 1,
          uniqueDates: dateSet,
          hasMultiCheckinDates: false,
          lastSession: s,
          isOnline: s.status === 'AKTIF'
        });
      } else {
        existing.totalSeconds += s.durationSeconds;
        existing.sessionCount += 1;
        if (existing.uniqueDates.has(loginDate)) {
          existing.hasMultiCheckinDates = true;
        } else {
          existing.uniqueDates.add(loginDate);
        }
        if (s.status === 'AKTIF') existing.isOnline = true;
      }
    });

    return Array.from(map.values()).map(item => ({
      ...item,
      uniqueDaysCount: item.uniqueDates.size
    })).sort((a, b) => b.totalSeconds - a.totalSeconds);
  }, [sessionsWithLiveDuration]);

  // Export CSV (Supports both Rekap Harian and Rincian Sesi)
  const handleExportCSV = () => {
    if (recordViewMode === 'REKAP_HARIAN') {
      if (dailyWorkRecords.length === 0) {
        showToast('Tidak ada data rekap harian untuk diekspor.', 'warning');
        return;
      }

      const headers = [
        'Tanggal Shift', 
        'Nama Petugas', 
        'Role/Jabatan', 
        'Jumlah Check-In', 
        'Jam Masuk Pertama', 
        'Jam Keluar Terakhir', 
        'Total Detik Akumulasi', 
        'Total Rekap Durasi Kerja', 
        'Status Sesi',
        'Rincian Tiap Sesi'
      ];

      const rows = dailyWorkRecords.map(rec => {
        const firstLoginTimeOnly = rec.firstLoginTime.split(' ')[1] || '';
        const lastLogoutTimeOnly = rec.lastLogoutTime ? (rec.lastLogoutTime.split(' ')[1] || '') : (rec.hasActiveSession ? 'Masih Aktif Bertugas' : '-');
        const sessionDetails = rec.sessions.map((s, idx) => {
          const inTime = s.loginTime.split(' ')[1] || '';
          const outTime = s.logoutTime ? (s.logoutTime.split(' ')[1] || '') : 'Aktif';
          return `Sesi ${idx + 1} (${s.id}): ${inTime}-${outTime} (${formatHMS(s.durationSeconds)})`;
        }).join('; ');

        return [
          `"${rec.date}"`,
          `"${rec.userName}"`,
          `"${rec.userRole}"`,
          rec.sessionCount,
          `"${firstLoginTimeOnly}"`,
          `"${lastLogoutTimeOnly}"`,
          rec.totalDurationSeconds,
          `"${formatHMS(rec.totalDurationSeconds)}"`,
          `"${rec.status}"`,
          `"${sessionDetails.replace(/"/g, '""')}"`
        ];
      });

      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Rekap_Harian_Akumulasi_Jam_Kerja_${realToday}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Laporan Rekap Harian Terakumulasi berhasil diunduh (CSV).', 'success');
    } else {
      if (filteredSessions.length === 0) {
        showToast('Tidak ada data sesi untuk diekspor.', 'warning');
        return;
      }

      const headers = ['ID Sesi', 'Nama Petugas', 'Role/Jabatan', 'Tgl Masuk', 'Jam Masuk', 'Tgl Keluar', 'Jam Keluar', 'Durasi Sesi Ini', 'Total Akumulasi Tgl Ini', 'Status', 'Catatan'];
      const rows = filteredSessions.map(s => {
        const [loginDate, loginTimeOnly] = s.loginTime.split(' ');
        let logoutDate = '-';
        let logoutTimeOnly = '-';
        if (s.logoutTime) {
          const parts = s.logoutTime.split(' ');
          logoutDate = parts[0];
          logoutTimeOnly = parts[1] || '';
        }
        const dailyInfo = sessionDailyMap.get(s.id);
        const accumulatedStr = dailyInfo ? formatHMS(dailyInfo.totalDurationSeconds) : s.durationFormatted;

        return [
          `"${s.id}"`,
          `"${s.userName}"`,
          `"${s.userRole}"`,
          `"${loginDate}"`,
          `"${loginTimeOnly || ''}"`,
          `"${logoutDate}"`,
          `"${logoutTimeOnly}"`,
          `"${formatHMS(s.durationSeconds)}"`,
          `"${accumulatedStr}"`,
          `"${s.status}"`,
          `"${(s.notes || '').replace(/"/g, '""')}"`
        ];
      });

      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Rincian_Sesi_Jam_Kerja_${realToday}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Laporan Rincian Sesi berhasil diunduh (CSV).', 'success');
    }
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSelectedUser('SEMUA');
    setSelectedRole('SEMUA');
    setSessionStatus('SEMUA');
    setDatePreset('SEMUA');
    setCustomStartDate('');
    setCustomEndDate('');
    setSearchQuery('');
    showToast('Filter telah direset.', 'info');
  };

  const isFilterActive = selectedUser !== 'SEMUA' || selectedRole !== 'SEMUA' || sessionStatus !== 'SEMUA' || datePreset !== 'SEMUA' || customStartDate || customEndDate || searchQuery.trim() !== '';

  // Helper untuk mengecek apakah log merupakan unduh PDF ber-QR & TTD yang sah
  const isVerifiedPdfWithQrAndTtd = (log: AuditLog) => {
    if (log.hasQrAndSignature === false) return false;
    if (log.action !== 'UNDUH_PDF_BER_QR') return false;
    if (!log.verificationCode || !log.verificationCode.trim()) return false;
    if (!log.signatoryName || log.signatoryName.includes('Belum Ada')) return false;
    return true;
  };

  // Deduplikasi absolut log aktivitas sistem (menjamin tidak ada satupun entri duplikat)
  const deduplicatedAuditLogs = useMemo(() => {
    const storageLogs = dataStorage.getAuditLogs() || [];
    const pool = [...auditLogs, ...storageLogs];
    const seenIds = new Set<string>();
    const seenCodes = new Set<string>();
    const seenContent = new Set<string>();
    const cleanList: AuditLog[] = [];

    for (const log of pool) {
      if (!log) continue;
      const normTime = (log.timestamp || '').trim();
      const normUser = (log.user || '').trim().toLowerCase();
      const normAction = (log.action || '').trim().toLowerCase();
      const normDetails = (log.details || '').trim().toLowerCase();
      const normCode = (log.verificationCode || '').trim().toLowerCase();
      const normId = (log.id ? String(log.id) : '').trim();

      // Normalize details for deduplication: remove surrounding spaces/brackets/VLOG tags
      const cleanDetails = normDetails.replace(/\[vlog-[^\]]+\]/gi, '').trim();
      const contentKey = `${normTime}|${normUser}|${normAction}|${cleanDetails}`;

      if (normId && seenIds.has(normId)) continue;
      if (normCode && seenCodes.has(normCode)) continue;
      if (contentKey && seenContent.has(contentKey)) continue;

      if (normId) seenIds.add(normId);
      if (normCode) seenCodes.add(normCode);
      if (contentKey) seenContent.add(contentKey);

      cleanList.push(log);
    }

    return cleanList.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime() || 0;
      const timeB = new Date(b.timestamp).getTime() || 0;
      if (timeA && timeB && timeA !== timeB) return timeB - timeA;
      return (b.timestamp || '').localeCompare(a.timestamp || '');
    });
  }, [auditLogs, dataStorage]);

  // Metrik ringkasan Log Aktivitas Sistem
  const todayLogsCount = useMemo(() => {
    return deduplicatedAuditLogs.filter(log => {
      const t = log.timestamp || '';
      return t.startsWith(realToday) || t.includes(realToday);
    }).length;
  }, [deduplicatedAuditLogs, realToday]);

  const transaksiLogsCount = useMemo(() => {
    return deduplicatedAuditLogs.filter(log => {
      const a = (log.action || '').toLowerCase();
      return a.includes('check-in') || a.includes('check-out') || a.includes('booking') || a.includes('reservasi') || a.includes('extend');
    }).length;
  }, [deduplicatedAuditLogs]);

  const maintQcLogsCount = useMemo(() => {
    return deduplicatedAuditLogs.filter(log => {
      const a = (log.action || '').toLowerCase();
      return a.includes('maintenance') || a.includes('perbaikan') || a.includes('qc') || a.includes('inspeksi');
    }).length;
  }, [deduplicatedAuditLogs]);

  // Filtered Audit Logs dari data yang telah terbebas dari duplikasi
  const filteredAuditLogs = useMemo(() => {
    return deduplicatedAuditLogs.filter(log => {
      // Date filter
      let logDate = '';
      if (log.timestamp) {
        if (log.timestamp.includes('/')) {
          const parts = log.timestamp.split(',')[0].trim().split('/');
          if (parts.length === 3) {
            logDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        } else if (log.timestamp.includes('-')) {
          logDate = log.timestamp.slice(0, 10);
        }
      }
      if (!logDate) {
        logDate = (log.timestamp || '').split(' ')[0];
      }

      if (datePreset === 'HARI_INI' && logDate !== realToday) return false;
      if (datePreset === 'KEMARIN' && logDate !== realYesterday) return false;
      if (datePreset === '3_HARI' && logDate < dateMinus3) return false;
      if (datePreset === '7_HARI' && logDate < dateMinus7) return false;
      if (datePreset === 'KUSTOM') {
        if (customStartDate && logDate < customStartDate) return false;
        if (customEndDate && logDate > customEndDate) return false;
      }

      if (auditActionFilter !== 'SEMUA') {
        const act = (log.action || '').toLowerCase();
        if (auditActionFilter === 'AUTH' && !act.includes('log') && !act.includes('masuk') && !act.includes('keluar')) return false;
        if (auditActionFilter === 'CHECKIN' && !act.includes('check-in')) return false;
        if (auditActionFilter === 'CHECKOUT' && !act.includes('check-out')) return false;
        if (auditActionFilter === 'SARAPAN' && !act.includes('sarapan') && !act.includes('makan')) return false;
        if (auditActionFilter === 'MAINTENANCE' && !act.includes('maintenance') && !act.includes('perbaikan')) return false;
        if (auditActionFilter === 'QC' && !act.includes('qc') && !act.includes('inspeksi')) return false;
        if (auditActionFilter === 'PDF_DOWNLOAD' && !act.includes('pdf') && !act.includes('unduh')) return false;
      }
      if (auditSearch.trim()) {
        const q = auditSearch.toLowerCase();
        const matchUser = (log.user || '').toLowerCase().includes(q);
        const matchAction = (log.action || '').toLowerCase().includes(q);
        const matchDetails = (log.details || '').toLowerCase().includes(q);
        const matchRole = (log.role || '').toLowerCase().includes(q);
        if (!matchUser && !matchAction && !matchDetails && !matchRole) return false;
      }
      return true;
    });
  }, [deduplicatedAuditLogs, auditActionFilter, auditSearch, datePreset, customStartDate, customEndDate, realToday, realYesterday, dateMinus3, dateMinus7]);

  // Unique officers who downloaded verified PDFs with QR and TTD
  const uniquePdfOfficers = useMemo(() => {
    const set = new Set<string>();
    deduplicatedAuditLogs.forEach(log => {
      if (isVerifiedPdfWithQrAndTtd(log)) {
        if (log.user) set.add(log.user);
      }
    });
    return Array.from(set);
  }, [deduplicatedAuditLogs]);

  // Filtered PDF Download Logs (Hanya yang ber-QR & TTD sah)
  const filteredPdfLogs = useMemo(() => {
    return deduplicatedAuditLogs.filter(log => {
      if (!isVerifiedPdfWithQrAndTtd(log)) return false;

      // Date parsing
      let logDate = '';
      if (log.timestamp) {
        if (log.timestamp.includes('/')) {
          const parts = log.timestamp.split(',')[0].trim().split('/');
          if (parts.length === 3) {
            logDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        } else if (log.timestamp.includes('-')) {
          logDate = log.timestamp.slice(0, 10);
        }
      }

      if (pdfDatePreset === 'HARI_INI' && logDate && logDate !== realToday) return false;
      if (pdfDatePreset === 'KEMARIN' && logDate && logDate !== realYesterday) return false;
      if (pdfDatePreset === '3_HARI' && logDate && logDate < dateMinus3) return false;
      if (pdfDatePreset === '7_HARI' && logDate && logDate < dateMinus7) return false;
      if (pdfDatePreset === 'KUSTOM') {
        if (pdfStartDate && logDate && logDate < pdfStartDate) return false;
        if (pdfEndDate && logDate && logDate > pdfEndDate) return false;
      }

      // Officer filter
      if (pdfOfficerFilter !== 'SEMUA' && log.user !== pdfOfficerFilter) return false;

      // Search query
      if (pdfSearch.trim()) {
        const q = pdfSearch.toLowerCase();
        const matchCode = (log.verificationCode || '').toLowerCase().includes(q);
        const matchUser = (log.user || '').toLowerCase().includes(q);
        const matchDetails = (log.details || '').toLowerCase().includes(q);
        const matchDoc = (log.documentTitle || '').toLowerCase().includes(q);
        const matchSign = (log.signatoryName || '').toLowerCase().includes(q);
        const matchTarget = (log.targetId || '').toLowerCase().includes(q);
        const matchRole = (log.role || '').toLowerCase().includes(q);
        if (!matchCode && !matchUser && !matchDetails && !matchDoc && !matchSign && !matchTarget && !matchRole) {
          return false;
        }
      }

      return true;
    });
  }, [deduplicatedAuditLogs, pdfDatePreset, pdfStartDate, pdfEndDate, pdfOfficerFilter, pdfSearch, realToday, realYesterday, dateMinus3, dateMinus7]);

  const pdfLogsTotalCount = useMemo(() => {
    return deduplicatedAuditLogs.filter(isVerifiedPdfWithQrAndTtd).length;
  }, [deduplicatedAuditLogs]);

  return (
    <div className="space-y-4">
      {/* Simplified Top Action & Sub-Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 overflow-x-auto max-w-full">
          <button
            onClick={() => setActiveSubView('WORK_SESSIONS')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-2 shrink-0 ${
              activeSubView === 'WORK_SESSIONS' 
                ? 'bg-white text-blue-800 shadow-xs font-black' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <i className="fa-solid fa-business-time"></i>
            <span>Rekap Sesi dan Jam</span>
          </button>
          {currentUser && isSuperAdmin(currentUser.role) && (
            <button
              onClick={() => setActiveSubView('ROLE_PERMISSIONS')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-2 shrink-0 ${
                activeSubView === 'ROLE_PERMISSIONS' 
                  ? 'bg-white text-emerald-800 shadow-xs font-black' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <i className="fa-solid fa-shield-halved text-emerald-600"></i>
              <span>Hak Akses &amp; Otorisasi</span>
            </button>
          )}
          <button
            onClick={() => setActiveSubView('AUDIT_TRAIL')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-2 shrink-0 ${
              activeSubView === 'AUDIT_TRAIL' 
                ? 'bg-white text-purple-800 shadow-xs font-black' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <i className="fa-solid fa-list-check"></i>
            <span>Log Aktivitas Sistem</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeSubView === 'AUDIT_TRAIL' ? 'bg-purple-100 text-purple-800' : 'bg-slate-200 text-slate-600'
            }`}>
              {deduplicatedAuditLogs.length}
            </span>
          </button>

          {canAccessAdminTabs && (
            <>
              <button
                onClick={() => setActiveSubView('DATABASE_MGMT')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-2 ${
                  activeSubView === 'DATABASE_MGMT' 
                    ? 'bg-white text-emerald-800 shadow-xs font-black' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <i className="fa-solid fa-database text-emerald-600"></i>
                <span>Basis Data</span>
              </button>

              <button
                onClick={() => setActiveSubView('SPREADSHEET_MGMT')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-2 ${
                  activeSubView === 'SPREADSHEET_MGMT' 
                    ? 'bg-white text-emerald-800 shadow-xs font-black' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <i className="fa-solid fa-file-excel text-emerald-600"></i>
                <span>Google Spreadsheet</span>
              </button>
            </>
          )}
        </div>

        <div className="flex items-center space-x-2 self-start sm:self-auto">
          {safeWorkSessions.length > 0 && isSuperAdmin(currentUser?.role) && activeSubView === 'WORK_SESSIONS' && (
            <button
              onClick={() => setShowResetSessionsModal(true)}
              className="px-3 py-2 bg-slate-100 hover:bg-amber-50 text-slate-600 hover:text-amber-800 text-xs font-bold rounded-xl border border-slate-200 hover:border-amber-200 flex items-center space-x-1.5 transition cursor-pointer"
              title="Bersihkan riwayat rekap sesi & jam kerja"
            >
              <i className="fa-solid fa-broom text-xs"></i>
              <span className="hidden sm:inline">Reset Sesi</span>
            </button>
          )}
          <button
            onClick={() => openModal('modalExport', { defaultType: activeSubView === 'WORK_SESSIONS' ? 'JAM_KERJA' : (activeSubView === 'AUDIT_TRAIL' && auditSubTab === 'PDF_LOGS' ? 'LOG_UNDUH' : 'AUDIT') })}
            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-xs flex items-center space-x-2 transition cursor-pointer"
            title="Unduh Laporan Resmi (PDF & Excel .xlsx)"
          >
            <i className="fa-solid fa-file-arrow-down"></i>
            <span>Unduh Laporan ({activeSubView === 'WORK_SESSIONS' ? 'Jam Kerja' : activeSubView === 'ROLE_PERMISSIONS' ? 'Hak Akses' : (activeSubView === 'AUDIT_TRAIL' && auditSubTab === 'PDF_LOGS' ? 'Log Unduh' : 'Audit')})</span>
          </button>
        </div>
      </div>

      {activeSubView === 'WORK_SESSIONS' ? (
        <div className="space-y-4">
          {/* Streamlined KPI Summary Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center text-base shrink-0">
                <i className="fa-solid fa-hourglass-half"></i>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Total Durasi Kerja</p>
                <p className="text-base font-black text-blue-700 truncate" title={formatHMS(totalFilteredSeconds)}>
                  {formatHMS(totalFilteredSeconds)}
                </p>
                <p className="text-[10px] text-slate-400">{filteredSessions.length} sesi tugas</p>
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center text-base shrink-0">
                <i className="fa-solid fa-calendar-check"></i>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Total Sesi Shift</p>
                <p className="text-base font-black text-slate-800">{filteredSessions.length} Sesi</p>
                <p className="text-[10px] text-slate-400">
                  {filteredSessions.filter(s => s.status === 'SELESAI').length} Selesai • {filteredSessions.filter(s => s.status === 'AKTIF').length} Aktif
                </p>
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center text-base shrink-0">
                <i className="fa-solid fa-user-clock"></i>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Petugas Aktif</p>
                <p className="text-base font-black text-emerald-700 flex items-center space-x-1.5">
                  <span>{activeOfficersCount} Petugas</span>
                  {activeOfficersCount > 0 && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                  )}
                </p>
                <p className="text-[10px] text-emerald-600 font-semibold">Sedang bertugas</p>
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center text-base shrink-0">
                <i className="fa-solid fa-chart-line"></i>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Rata-rata / Shift</p>
                <p className="text-base font-black text-amber-700 truncate" title={formatHMS(averageDurationSeconds)}>
                  {formatHMS(averageDurationSeconds)}
                </p>
                <p className="text-[10px] text-slate-400">Durasi rata-rata sesi</p>
              </div>
            </div>
          </div>

          {/* REAL-TIME MULTI-ACCOUNT ACTIVE OFFICERS MONITOR */}
          <div className="bg-gradient-to-r from-emerald-950 via-hajj-900 to-slate-900 text-white p-4 rounded-2xl shadow-md border border-emerald-500/30 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center justify-center text-sm shrink-0">
                  <i className="fa-solid fa-satellite-dish animate-pulse"></i>
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className="text-xs sm:text-sm font-black tracking-tight text-white">
                      Monitor Real-Time Petugas Sedang Aktif Bertugas
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500 text-slate-950 flex items-center space-x-1 shadow-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-950 animate-ping"></span>
                      <span>{activeOfficersList.length} Akun Online</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-200/80">
                    Menampilkan seluruh akun yang sedang login &amp; bertugas secara bersamaan dari berbagai perangkat secara real-time
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => openChat('channel-all-managers')}
                  className="px-3 py-1.5 bg-gold-500 hover:bg-gold-400 text-slate-950 font-extrabold rounded-xl text-xs transition flex items-center space-x-1.5 shadow-xs cursor-pointer"
                >
                  <i className="fa-solid fa-comments text-xs"></i>
                  <span>Forum Koordinasi Grup</span>
                </button>
              </div>
            </div>

            {activeOfficersList.length === 0 ? (
              <div className="text-center py-4 text-xs text-slate-300">
                Belum ada sesi petugas yang tercatat aktif saat ini.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {activeOfficersList.map(officer => {
                  const inTime = officer.loginTime.split(' ')[1] || officer.loginTime;
                  return (
                    <div
                      key={officer.userId}
                      className={`p-3 rounded-xl border transition flex flex-col justify-between gap-2.5 ${
                        officer.isCurrentUser
                          ? 'bg-emerald-900/50 border-emerald-400/50 shadow-sm'
                          : 'bg-white/10 hover:bg-white/15 border-white/15'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <div className="relative shrink-0">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs flex items-center justify-center shadow">
                              {officer.userName.substring(0, 2).toUpperCase()}
                            </div>
                            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-slate-900 animate-pulse" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center space-x-1.5">
                              <p className="font-bold text-xs text-white truncate">{officer.userName}</p>
                              {officer.isCurrentUser && (
                                <span className="px-1.5 py-0.1 bg-gold-500 text-slate-950 font-black rounded text-[9px] shrink-0">
                                  ANDA
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-emerald-200 truncate">
                              {officer.userRole}
                              {officer.department ? ` • ${officer.department}` : ''}
                              {officer.assignedBuilding ? ` (${officer.assignedBuilding})` : ''}
                            </p>
                            <p className="text-[10px] text-slate-300 font-mono mt-0.5">
                              Masuk: {inTime} WIB
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-mono font-black text-xs">
                            <i className="fa-solid fa-stopwatch text-[10px]"></i>
                            <span>{formatHMS(officer.durationSeconds)}</span>
                          </span>
                          <span className="block text-[9px] text-emerald-300/90 font-semibold mt-0.5">
                            ● Aktif Real-Time
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-white/10 text-[10px]">
                        <span className="text-slate-300 truncate font-mono text-[9px]">
                          ID: #{officer.sessionId}
                        </span>
                        <div className="flex items-center space-x-1.5">
                          {!officer.isCurrentUser && currentUser && (
                            <button
                              type="button"
                              onClick={() => {
                                const dmId = getDirectChannelId(currentUser.id, officer.userId);
                                openChat(dmId);
                                showToast(`Membuka chat pribadi dengan ${officer.userName}`, 'info');
                              }}
                              className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg transition flex items-center space-x-1 cursor-pointer shadow-2xs"
                              title={`Kirim pesan pribadi ke ${officer.userName}`}
                            >
                              <i className="fa-solid fa-comment-dots text-[10px]"></i>
                              <span>Chat Pribadi</span>
                            </button>
                          )}
                          {canAccessAdminTabs && !officer.isCurrentUser && !officer.sessionId.startsWith('LIVE-') && (
                            <button
                              type="button"
                              onClick={() => forceEndWorkSession(officer.sessionId)}
                              className="px-2 py-1 bg-red-500/20 hover:bg-red-500/40 text-red-200 border border-red-400/30 font-bold rounded-lg transition cursor-pointer"
                              title="Akhiri sesi kerja petugas ini"
                            >
                              Akhiri Sesi
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

          {/* Compact Single-Bar Filter & View Controls */}
          <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
              {/* Quick Search */}
              <div className="relative flex-1 max-w-sm">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Cari ID sesi, nama petugas, catatan..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 text-slate-800"
                />
                <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-2.5 text-slate-400 text-xs"></i>
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg border border-slate-200 self-start md:self-auto">
                <button
                  type="button"
                  onClick={() => setRecordViewMode('REKAP_HARIAN')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center space-x-1 ${
                    recordViewMode === 'REKAP_HARIAN' 
                      ? 'bg-white text-blue-700 shadow-xs font-black' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <i className="fa-solid fa-calendar-day text-[10px]"></i>
                  <span>Rekap Harian ({dailyWorkRecords.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRecordViewMode('RINCIAN_SESI')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center space-x-1 ${
                    recordViewMode === 'RINCIAN_SESI' 
                      ? 'bg-white text-blue-700 shadow-xs font-black' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <i className="fa-solid fa-list-check text-[10px]"></i>
                  <span>Rincian Sesi ({filteredSessions.length})</span>
                </button>
              </div>
            </div>

            {/* Filter Dropdowns Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Petugas</label>
                <select
                  value={selectedUser}
                  onChange={e => setSelectedUser(e.target.value)}
                  className="w-full p-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                >
                  <option value="SEMUA">Semua Petugas ({uniqueUsers.length})</option>
                  {uniqueUsers.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Jabatan / Role</label>
                <select
                  value={selectedRole}
                  onChange={e => setSelectedRole(e.target.value)}
                  className="w-full p-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                >
                  <option value="SEMUA">Semua Jabatan</option>
                  {uniqueRoles.map(role => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Status Sesi</label>
                <select
                  value={sessionStatus}
                  onChange={e => setSessionStatus(e.target.value)}
                  className="w-full p-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                >
                  <option value="SEMUA">Semua Status</option>
                  <option value="AKTIF">🟢 Sedang Aktif</option>
                  <option value="SELESAI">⚪ Selesai (Check-Out)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Periode Tanggal</label>
                <select
                  value={datePreset}
                  onChange={e => setDatePreset(e.target.value as any)}
                  className="w-full p-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                >
                  <option value="SEMUA">Semua Waktu</option>
                  <option value="HARI_INI">Hari Ini ({formatIndonesianDate(realToday)})</option>
                  <option value="KEMARIN">Kemarin ({formatIndonesianDate(realYesterday)})</option>
                  <option value="3_HARI">3 Hari Terakhir</option>
                  <option value="7_HARI">7 Hari Terakhir</option>
                  <option value="KUSTOM">Rentang Kustom</option>
                </select>
              </div>
            </div>

            {/* Custom Date Pickers if Selected */}
            {datePreset === 'KUSTOM' && (
              <div className="pt-2 flex flex-wrap items-center gap-3 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <div className="flex items-center space-x-1.5">
                  <span className="text-slate-600 font-medium">Dari:</span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={e => setCustomStartDate(e.target.value)}
                    className="p-1 border border-slate-300 rounded-md bg-white text-xs"
                  />
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-slate-600 font-medium">Sampai:</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={e => setCustomEndDate(e.target.value)}
                    className="p-1 border border-slate-300 rounded-md bg-white text-xs"
                  />
                </div>
              </div>
            )}

            {/* Active Filter Indicator & Reset */}
            {isFilterActive && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                <span className="text-slate-500 text-[11px]">
                  Menampilkan <strong>{recordViewMode === 'REKAP_HARIAN' ? dailyWorkRecords.length : filteredSessions.length}</strong> data terfilter
                </span>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-xs text-red-600 hover:text-red-700 font-bold flex items-center space-x-1"
                >
                  <i className="fa-solid fa-rotate-left text-[10px]"></i>
                  <span>Reset Filter</span>
                </button>
              </div>
            )}
          </div>

          {/* Work Sessions Table */}
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">

            {/* TAB 1: REKAPITULASI HARIAN TERAKUMULASI */}
            {recordViewMode === 'REKAP_HARIAN' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-100 uppercase text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3.5">Tanggal Shift</th>
                      <th className="p-3.5">Petugas & Role</th>
                      <th className="p-3.5 text-center">Frekuensi Masuk</th>
                      <th className="p-3.5">
                        <span className="flex items-center space-x-1">
                          <i className="fa-solid fa-clock text-blue-600"></i>
                          <span>Rentang Jam (Pertama s/d Terakhir)</span>
                        </span>
                      </th>
                      <th className="p-3.5">
                        <span className="flex items-center space-x-1">
                          <i className="fa-solid fa-stopwatch text-emerald-600"></i>
                          <span>Total Akumulasi Durasi Kerja</span>
                        </span>
                      </th>
                      <th className="p-3.5 text-center">Rincian Sesi</th>
                      <th className="p-3.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dailyWorkRecords.length > 0 ? (
                      dailyWorkRecords.map(rec => {
                        const isExpanded = !!expandedDateRows[rec.key];
                        const isToday = rec.date === realToday;
                        const firstLoginTimeOnly = rec.firstLoginTime.split(' ')[1] || '';
                        const lastLogoutTimeOnly = rec.lastLogoutTime ? (rec.lastLogoutTime.split(' ')[1] || '') : null;

                        return (
                          <React.Fragment key={rec.key}>
                            <tr className={`transition ${rec.hasMultipleSessions ? 'bg-blue-50/20 hover:bg-blue-50/40 border-l-4 border-l-blue-500' : 'hover:bg-slate-50'}`}>
                              {/* Tanggal Shift */}
                              <td className="p-3.5">
                                <div className="space-y-0.5">
                                  <div className="font-bold text-slate-900 flex items-center space-x-1.5">
                                    <i className="fa-regular fa-calendar text-blue-600"></i>
                                    <span>{formatIndonesianDate(rec.date)}</span>
                                  </div>
                                  <div className="flex items-center space-x-1.5">
                                    {isToday && (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-600 text-white uppercase">
                                        Hari Ini
                                      </span>
                                    )}
                                    <span className="text-[10px] text-slate-400 font-mono">{rec.date}</span>
                                  </div>
                                </div>
                              </td>

                              {/* Petugas & Role */}
                              <td className="p-3.5">
                                <div className="flex items-center space-x-2.5">
                                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs shadow-xs">
                                    {rec.userName.substring(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="font-bold text-slate-900 text-sm">{rec.userName}</p>
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                      {rec.userRole}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              {/* Frekuensi Masuk (Check-In) */}
                              <td className="p-3.5 text-center">
                                {rec.hasMultipleSessions ? (
                                  <div className="inline-flex flex-col items-center">
                                    <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-blue-600 text-white shadow-xs inline-flex items-center space-x-1">
                                      <i className="fa-solid fa-repeat text-amber-300 text-[10px]"></i>
                                      <span>{rec.sessionCount}x Check-In</span>
                                    </span>
                                    <span className="text-[10px] text-blue-700 font-bold mt-0.5">
                                      Terakumulasi Otomatis
                                    </span>
                                  </div>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                    1x Sesi
                                  </span>
                                )}
                              </td>

                              {/* Rentang Jam Kerja */}
                              <td className="p-3.5">
                                <div className="space-y-1">
                                  <div className="flex items-center space-x-2 text-[11px]">
                                    <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-mono font-bold">
                                      Masuk: {firstLoginTimeOnly} WIB
                                    </span>
                                    <span>→</span>
                                    {rec.hasActiveSession ? (
                                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded font-bold animate-pulse">
                                        Sedang Bertugas
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded font-mono font-bold">
                                        Keluar: {lastLogoutTimeOnly || '-'} WIB
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    {rec.hasMultipleSessions ? `Mencakup rentang ${rec.sessionCount} kali kedatangan tugas` : 'Satu sesi berkelanjutan'}
                                  </div>
                                </div>
                              </td>

                              {/* Total Akumulasi Durasi Kerja */}
                              <td className="p-3.5">
                                <div className="space-y-0.5">
                                  <div className="font-black text-blue-700 text-sm sm:text-base flex items-center space-x-1.5">
                                    <i className="fa-solid fa-stopwatch text-blue-600"></i>
                                    <span>{formatHMS(rec.totalDurationSeconds)}</span>
                                  </div>
                                  {rec.hasActiveSession ? (
                                    <div className="text-[10px] text-emerald-600 font-bold flex items-center space-x-1 animate-pulse">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                      <span>Menyesuaikan Real-Time...</span>
                                    </div>
                                  ) : (
                                    <div className="text-[10px] text-slate-400 font-mono">
                                      Total akumulasi {rec.totalDurationSeconds.toLocaleString('id-ID')} detik
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* Rincian Sesi Toggle */}
                              <td className="p-3.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => toggleExpandDateRow(rec.key)}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition inline-flex items-center space-x-1 ${isExpanded ? 'bg-slate-800 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'}`}
                                >
                                  <span>{isExpanded ? 'Tutup Rincian' : `Lihat ${rec.sessionCount} Sesi`}</span>
                                  <i className={`fa-solid fa-chevron-${isExpanded ? 'up' : 'down'} text-[10px]`}></i>
                                </button>
                              </td>

                              {/* Status */}
                              <td className="p-3.5 text-center">
                                {rec.hasActiveSession ? (
                                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center space-x-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping mr-1"></span>
                                    <span>AKTIF</span>
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-300">
                                    SELESAI
                                  </span>
                                )}
                              </td>
                            </tr>

                            {/* Sub-Rows: Individual Sessions Breakdown for this Date */}
                            {isExpanded && (
                              <tr className="bg-slate-50/80">
                                <td colSpan={7} className="p-4 pl-8 border-y border-slate-200">
                                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-2.5">
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                      <p className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                                        <i className="fa-solid fa-list-ol text-blue-600"></i>
                                        <span>Rincian Tiap Sesi Check-In {rec.userName} pada {formatIndonesianDate(rec.date)}:</span>
                                      </p>
                                      <span className="text-[11px] text-blue-700 font-extrabold">
                                        Akumulasi Total: {formatHMS(rec.totalDurationSeconds)}
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      {rec.sessions.map((s, sIdx) => {
                                        const inTime = s.loginTime.split(' ')[1] || '';
                                        const outTime = s.logoutTime ? (s.logoutTime.split(' ')[1] || '') : 'Masih Berjalan';
                                        return (
                                          <div key={s.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs">
                                            <div>
                                              <div className="font-bold text-slate-800 flex items-center space-x-1.5">
                                                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-black text-[10px] flex items-center justify-center">
                                                  {sIdx + 1}
                                                </span>
                                                <span className="font-mono text-[11px] text-slate-500">#{s.id}</span>
                                              </div>
                                              <div className="text-[11px] text-slate-600 mt-1 font-mono">
                                                {inTime} WIB ➔ {outTime} WIB
                                              </div>
                                              {s.notes && (
                                                <p className="text-[10px] text-slate-400 mt-0.5 italic">{s.notes}</p>
                                              )}
                                            </div>
                                            <div className="text-right">
                                              <span className="font-extrabold text-blue-700 block text-xs">
                                                {formatHMS(s.durationSeconds)}
                                              </span>
                                              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${s.status === 'AKTIF' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                                                {s.status}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                          Tidak ada catatan sesi jam kerja yang sesuai dengan filter yang dipilih.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              /* TAB 2: RINCIAN TIAP SESI INDIVIDUAL */
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-100 uppercase text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3.5">ID Sesi</th>
                      <th className="p-3.5">Petugas & Role</th>
                      <th className="p-3.5">
                        <span className="flex items-center space-x-1">
                          <i className="fa-solid fa-right-to-bracket text-blue-600"></i>
                          <span>Tanggal & Jam Masuk</span>
                        </span>
                      </th>
                      <th className="p-3.5">
                        <span className="flex items-center space-x-1">
                          <i className="fa-solid fa-right-from-bracket text-red-600"></i>
                          <span>Tanggal & Jam Keluar</span>
                        </span>
                      </th>
                      <th className="p-3.5">
                        <span className="flex items-center space-x-1">
                          <i className="fa-solid fa-stopwatch text-emerald-600"></i>
                          <span>Durasi Sesi Ini</span>
                        </span>
                      </th>
                      <th className="p-3.5">Akumulasi Tgl Tersebut</th>
                      <th className="p-3.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSessions.length > 0 ? (
                      filteredSessions.map((session, idx) => {
                        const [loginDate, loginTimeOnly] = session.loginTime.split(' ');
                        let logoutDate = '-';
                        let logoutTimeOnly = '-';
                        let isCrossDay = false;

                        if (session.logoutTime) {
                          const parts = session.logoutTime.split(' ');
                          logoutDate = parts[0];
                          logoutTimeOnly = parts[1] || '';
                          if (logoutDate !== loginDate) {
                            isCrossDay = true;
                          }
                        }

                        const dailyInfo = sessionDailyMap.get(session.id);
                        const hasMultipleOnDate = dailyInfo && dailyInfo.sessionCount > 1;

                        return (
                          <tr key={session.id || idx} className={`transition ${hasMultipleOnDate ? 'bg-blue-50/20 hover:bg-blue-50/40' : 'hover:bg-slate-50'}`}>
                            {/* ID Sesi */}
                            <td className="p-3.5 font-mono font-bold text-slate-500">
                              {session.id}
                            </td>

                            {/* Petugas & Role */}
                            <td className="p-3.5">
                              <div className="flex items-center space-x-2.5">
                                <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs">
                                  {session.userName.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-800">{session.userName}</p>
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                    {session.userRole}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Tanggal & Jam Masuk */}
                            <td className="p-3.5">
                              <div className="space-y-0.5">
                                <div className="font-bold text-slate-800 flex items-center space-x-1">
                                  <i className="fa-regular fa-calendar text-blue-500"></i>
                                  <span>{formatIndonesianDate(loginDate)}</span>
                                </div>
                                <div className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-mono font-bold text-[11px]">
                                  {loginTimeOnly} WIB
                                </div>
                              </div>
                            </td>

                            {/* Tanggal & Jam Keluar */}
                            <td className="p-3.5">
                              {session.status === 'AKTIF' ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-ping"></span>
                                  Sedang Bertugas (Belum Keluar)
                                </span>
                              ) : (
                                <div className="space-y-0.5">
                                  <div className="font-bold text-slate-800 flex items-center space-x-1">
                                    <i className="fa-regular fa-calendar-check text-red-500"></i>
                                    <span>{formatIndonesianDate(logoutDate)}</span>
                                  </div>
                                  <div className="inline-block px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded font-mono font-bold text-[11px]">
                                    {logoutTimeOnly} WIB
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* Durasi Sesi Ini */}
                            <td className="p-3.5">
                              <div className="space-y-1">
                                <div className="font-extrabold text-slate-800 text-xs flex items-center space-x-1.5">
                                  <span>{formatHMS(session.durationSeconds)}</span>
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  ({session.durationSeconds.toLocaleString('id-ID')} detik)
                                </div>
                              </div>
                            </td>

                            {/* Akumulasi Tgl Tersebut */}
                            <td className="p-3.5">
                              {dailyInfo ? (
                                <div>
                                  <span className="font-extrabold text-blue-700 text-xs block">
                                    {formatHMS(dailyInfo.totalDurationSeconds)}
                                  </span>
                                  {hasMultipleOnDate ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold mt-0.5">
                                      <i className="fa-solid fa-repeat mr-1 text-[9px]"></i>
                                      Total {dailyInfo.sessionCount}x check-in tgl {dailyInfo.date}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-400">1x sesi pada tanggal ini</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs">-</span>
                              )}
                            </td>

                            {/* Status Badge */}
                            <td className="p-3.5 text-center">
                              {session.status === 'AKTIF' ? (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  AKTIF
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-300">
                                  SELESAI
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                          Tidak ada catatan sesi jam kerja yang sesuai dengan filter yang dipilih.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : activeSubView === 'ROLE_PERMISSIONS' && currentUser && isSuperAdmin(currentUser.role) ? (
        <RolePermissionsSection
          currentUser={currentUser}
          users={users}
          onSwitchUser={(user) => {
            login(user);
            showToast(`Beralih akun berhasil: ${user.fullName} (${user.role})`, 'success');
          }}
          onOpenLaporanKwitansi={() => setActiveTab('laporanKamar')}
          onOpenGedungKamar={() => setActiveTab('gedung')}
          showToast={showToast}
          onUpdateUser={updateUser}
          appSettings={appSettings}
          onUpdateAppSettings={updateAppSettings}
        />
      ) : activeSubView === 'AUDIT_TRAIL' ? (
        /* ================= SUBVIEW: LOG AKTIVITAS SISTEM & RIWAYAT DOKUMEN RESMI ================= */
        <div className="space-y-4">
          {/* Sub Navigation Bar di dalam Log Aktivitas Sistem */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-800 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
            <div className="flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
              <button
                type="button"
                onClick={() => setAuditSubTab('ALL_LOGS')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
                  auditSubTab === 'ALL_LOGS'
                    ? 'bg-white dark:bg-slate-800 text-purple-900 dark:text-purple-300 shadow-xs font-black'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <i className="fa-solid fa-list-check text-purple-600"></i>
                <span>Log Aktivitas Sistem</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  auditSubTab === 'ALL_LOGS' ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                }`}>
                  {deduplicatedAuditLogs.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setAuditSubTab('PDF_LOGS')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
                  auditSubTab === 'PDF_LOGS'
                    ? 'bg-white dark:bg-slate-800 text-rose-800 dark:text-rose-400 shadow-xs font-black'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <i className="fa-solid fa-file-pdf text-rose-600"></i>
                <span>Log Unduh PDF Ber-QR</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  auditSubTab === 'PDF_LOGS' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                }`}>
                  {pdfLogsTotalCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setAuditSubTab('VERIFY')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
                  auditSubTab === 'VERIFY'
                    ? 'bg-white dark:bg-slate-800 text-blue-800 dark:text-blue-400 shadow-xs font-black'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <i className="fa-solid fa-shield-halved text-blue-600"></i>
                <span>Alat Verifikasi PDF &amp; QR Code</span>
              </button>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium px-2">
              {auditSubTab === 'ALL_LOGS' ? (
                <span>Rekam jejak seluruh operasi sistem tanpa duplikasi data</span>
              ) : auditSubTab === 'PDF_LOGS' ? (
                <span>Rekam jejak resmi berkas bertanda tangan QR terenkripsi</span>
              ) : (
                <span>Validasi keaslian berkas cetak dan sertifikat digital</span>
              )}
            </div>
          </div>

          {/* TAB CONTENT 1: ALL SYSTEM ACTIVITY LOGS (LOG AKTIVITAS SISTEM) */}
          {auditSubTab === 'ALL_LOGS' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Quick KPI Stats Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
                <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-purple-200 dark:border-purple-900/50 shadow-xs">
                  <span className="text-[10px] text-purple-700 dark:text-purple-300 uppercase font-bold tracking-wider block">
                    Total Aktivitas Terdata
                  </span>
                  <p className="text-lg sm:text-xl font-black text-purple-950 dark:text-white mt-1">
                    {deduplicatedAuditLogs.length}
                  </p>
                  <span className="text-[10px] text-purple-600 dark:text-purple-400">Semua riwayat petugas</span>
                </div>

                <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-blue-200 dark:border-blue-900/50 shadow-xs">
                  <span className="text-[10px] text-blue-700 dark:text-blue-300 uppercase font-bold tracking-wider block">
                    Aktivitas Hari Ini
                  </span>
                  <p className="text-lg sm:text-xl font-black text-blue-950 dark:text-white mt-1">
                    {todayLogsCount}
                  </p>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400">Shift operasional aktif</span>
                </div>

                <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/50 shadow-xs">
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-300 uppercase font-bold tracking-wider block">
                    Transaksi Kamar &amp; Tamu
                  </span>
                  <p className="text-lg sm:text-xl font-black text-emerald-950 dark:text-white mt-1">
                    {transaksiLogsCount}
                  </p>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Check-in, out &amp; booking</span>
                </div>

                <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/50 shadow-xs">
                  <span className="text-[10px] text-amber-700 dark:text-amber-300 uppercase font-bold tracking-wider block">
                    QC &amp; Pemeliharaan
                  </span>
                  <p className="text-lg sm:text-xl font-black text-amber-950 dark:text-white mt-1">
                    {maintQcLogsCount}
                  </p>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400">Inspeksi &amp; perbaikan</span>
                </div>

                <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/50 shadow-xs">
                  <span className="text-[10px] text-rose-700 dark:text-rose-300 uppercase font-bold tracking-wider block">
                    Unduh Dokumen Ber-QR
                  </span>
                  <p className="text-lg sm:text-xl font-black text-rose-950 dark:text-white mt-1">
                    {pdfLogsTotalCount}
                  </p>
                  <span className="text-[10px] text-rose-600 dark:text-rose-400">Laporan sah tersertifikasi</span>
                </div>
              </div>

              {/* Filter Controls: Date presets, action filter, search */}
              <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  {/* Date Preset Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center space-x-1.5 mr-1">
                      <i className="fa-regular fa-calendar-days text-purple-600"></i>
                      <span>Rentang Waktu:</span>
                    </span>
                    <div className="flex flex-wrap gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                      {[
                        { id: 'SEMUA', label: 'Semua Waktu' },
                        { id: 'HARI_INI', label: 'Hari Ini' },
                        { id: 'KEMARIN', label: 'Kemarin' },
                        { id: '3_HARI', label: '3 Hari' },
                        { id: '7_HARI', label: '7 Hari' },
                        { id: 'KUSTOM', label: 'Rentang Kustom' }
                      ].map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setDatePreset(preset.id as any)}
                          className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                            datePreset === preset.id
                              ? 'bg-purple-700 text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Action Filter Dropdown */}
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center space-x-1.5">
                      <i className="fa-solid fa-filter text-purple-600"></i>
                      <span className="whitespace-nowrap">Filter Tindakan:</span>
                    </span>
                    <select
                      value={auditActionFilter}
                      onChange={e => setAuditActionFilter(e.target.value)}
                      className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    >
                      <option value="SEMUA">-- Semua Jenis Tindakan --</option>
                      <option value="AUTH">Login &amp; Logout Petugas</option>
                      <option value="CHECKIN">Check-In Kamar</option>
                      <option value="CHECKOUT">Check-Out Kamar</option>
                      <option value="SARAPAN">Pesanan Makan &amp; Sarapan</option>
                      <option value="MAINTENANCE">Pemeliharaan &amp; Teknisi</option>
                      <option value="QC">Pengawasan Mutu (QC)</option>
                      <option value="PDF_DOWNLOAD">Pengunduhan Berkas PDF</option>
                    </select>
                  </div>
                </div>

                {/* Custom Date Inputs if KUSTOM selected */}
                {datePreset === 'KUSTOM' && (
                  <div className="flex flex-wrap items-center gap-3 p-3 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/50 rounded-xl text-xs animate-in fade-in">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-700 dark:text-slate-300">Dari:</span>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={e => setCustomStartDate(e.target.value)}
                        className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold"
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-700 dark:text-slate-300">Sampai:</span>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={e => setCustomEndDate(e.target.value)}
                        className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold"
                      />
                    </div>
                    {(customStartDate || customEndDate) && (
                      <button
                        type="button"
                        onClick={() => { setCustomStartDate(''); setCustomEndDate(''); }}
                        className="text-xs text-purple-600 hover:text-purple-800 font-bold underline cursor-pointer"
                      >
                        Reset Tanggal
                      </button>
                    )}
                  </div>
                )}

                {/* Search query input & clear button */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-700">
                  <div className="relative flex-grow w-full sm:w-auto">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-xs pointer-events-none">
                      <i className="fa-solid fa-magnifying-glass"></i>
                    </span>
                    <input
                      type="text"
                      value={auditSearch}
                      onChange={e => setAuditSearch(e.target.value)}
                      placeholder="Cari log berdasarkan nama petugas, role, jenis tindakan, kamar, atau rincian..."
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                  </div>

                  {(datePreset !== 'SEMUA' || auditActionFilter !== 'SEMUA' || auditSearch.trim() || customStartDate || customEndDate) && (
                    <button
                      type="button"
                      onClick={() => {
                        setDatePreset('SEMUA');
                        setAuditActionFilter('SEMUA');
                        setAuditSearch('');
                        setCustomStartDate('');
                        setCustomEndDate('');
                      }}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition flex items-center space-x-1.5 shrink-0 cursor-pointer"
                    >
                      <i className="fa-solid fa-rotate-left text-xs"></i>
                      <span>Reset Filter</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Tabel Log Aktivitas Sistem Bersih Tanpa Duplikat */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
                <div className="p-3.5 border-b border-slate-100 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-900/50">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                      Menampilkan {filteredAuditLogs.length} dari {deduplicatedAuditLogs.length} Entri Log
                    </span>
                    <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                      ✓ Rekam Jejak Audit Sistem
                    </span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">
                      Diurutkan kronologis terbalik (paling baru di atas)
                    </span>
                    {currentUser && (currentUser.role === 'Super Admin' || currentUser.role === 'Admin') && (
                      <button
                        type="button"
                        onClick={() => setShowClearAuditModal(true)}
                        className="px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-300 dark:border-rose-800 rounded-lg transition flex items-center space-x-1 cursor-pointer"
                        title="Bersihkan riwayat log aktivitas"
                      >
                        <i className="fa-solid fa-trash-can"></i>
                        <span>Kosongkan Log</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Banner Edukasi: Log Sistem adalah Audit Trail (bukan pengunci data) */}
                <div className="px-4 py-2 bg-purple-50/40 dark:bg-purple-950/20 border-b border-purple-100 dark:border-purple-900/30 flex items-center justify-between text-[11px] text-purple-900 dark:text-purple-300">
                  <div className="flex items-center space-x-2">
                    <i className="fa-solid fa-circle-info text-purple-600 shrink-0"></i>
                    <span>Log aktivitas merupakan rekam jejak audit petugas dan <strong>tidak membatasi maupun mengunci</strong> pengeditan/penghapusan gedung, kamar, atau transaksi.</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700 dark:text-slate-200">
                    <thead className="bg-slate-100 dark:bg-slate-900 uppercase text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700 text-[11px] tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Waktu &amp; Tanggal</th>
                        <th className="py-3 px-4">Pengguna (Petugas)</th>
                        <th className="py-3 px-4">Peran / Role</th>
                        <th className="py-3 px-4">Kategori Tindakan</th>
                        <th className="py-3 px-4">Rincian Objek &amp; Detail Aktivitas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {filteredAuditLogs.length > 0 ? (
                        filteredAuditLogs.map((log, idx) => {
                          const actLower = (log.action || '').toLowerCase();
                          let actBadgeClass = 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/70 dark:text-purple-300 dark:border-purple-800';
                          let actIcon = 'fa-circle-info';

                          if (actLower.includes('check-in') || actLower.includes('checkin')) {
                            actBadgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800';
                            actIcon = 'fa-right-to-bracket';
                          } else if (actLower.includes('check-out') || actLower.includes('checkout')) {
                            actBadgeClass = 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800';
                            actIcon = 'fa-right-from-bracket';
                          } else if (actLower.includes('booking') || actLower.includes('reservasi') || actLower.includes('extend')) {
                            actBadgeClass = 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-800';
                            actIcon = 'fa-calendar-check';
                          } else if (actLower.includes('qc') || actLower.includes('inspeksi') || actLower.includes('kelayakan')) {
                            actBadgeClass = 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-950/70 dark:text-cyan-300 dark:border-cyan-800';
                            actIcon = 'fa-clipboard-check';
                          } else if (actLower.includes('maintenance') || actLower.includes('perbaikan') || actLower.includes('rusak')) {
                            actBadgeClass = 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-800';
                            actIcon = 'fa-screwdriver-wrench';
                          } else if (actLower.includes('sarapan') || actLower.includes('makan') || actLower.includes('katering')) {
                            actBadgeClass = 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/70 dark:text-orange-300 dark:border-orange-800';
                            actIcon = 'fa-utensils';
                          } else if (actLower.includes('pdf') || actLower.includes('unduh') || actLower.includes('cetak')) {
                            actBadgeClass = 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800';
                            actIcon = 'fa-file-pdf';
                          } else if (actLower.includes('masuk') || actLower.includes('login') || actLower.includes('keluar') || actLower.includes('logout')) {
                            actBadgeClass = 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950/70 dark:text-indigo-300 dark:border-indigo-800';
                            actIcon = 'fa-key';
                          }

                          return (
                            <tr key={log.id || `${log.timestamp}-${idx}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/50 transition">
                              {/* Waktu */}
                              <td className="py-3 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                <span className="inline-flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                  <i className="fa-regular fa-clock text-slate-400 text-[10px]"></i>
                                  <span>{log.timestamp}</span>
                                </span>
                              </td>

                              {/* Petugas Pengguna */}
                              <td className="py-3 px-4">
                                <div className="flex items-center space-x-2.5">
                                  <div className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold flex items-center justify-center text-xs shrink-0">
                                    {(log.user || 'P').charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <span className="font-bold text-slate-900 dark:text-slate-100 block leading-tight">
                                      {log.user || 'Sistem'}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              {/* Peran */}
                              <td className="py-3 px-4">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                  {log.role || 'Petugas'}
                                </span>
                              </td>

                              {/* Kategori Tindakan */}
                              <td className="py-3 px-4">
                                <span className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[10.5px] font-bold border ${actBadgeClass}`}>
                                  <i className={`fa-solid ${actIcon} text-[10px]`}></i>
                                  <span>{log.action}</span>
                                </span>
                              </td>

                              {/* Rincian Objek & Detail */}
                              <td className="py-3 px-4 text-slate-700 dark:text-slate-200">
                                <div className="max-w-xl text-xs leading-relaxed">
                                  {log.details}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-12 px-4 text-center text-slate-400 dark:text-slate-500">
                            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-2 text-xl text-slate-400">
                              <i className="fa-solid fa-filter-circle-xmark"></i>
                            </div>
                            <p className="font-bold text-sm text-slate-600 dark:text-slate-300">Tidak ada log aktivitas sistem yang sesuai</p>
                            <p className="text-xs text-slate-400 mt-0.5">Silakan reset filter pencarian atau ubah rentang tanggal.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB CONTENT 2: LOG UNDUH PDF BER-QR CODE RESMI */}
          {auditSubTab === 'PDF_LOGS' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Header Info Banner */}
              <div className="bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 text-white p-6 rounded-2xl shadow-lg border border-rose-500/30 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                  <i className="fa-solid fa-file-pdf text-9xl text-rose-400"></i>
                </div>
                
                <div className="relative z-10 max-w-3xl space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center space-x-2 bg-rose-500/20 text-rose-300 border border-rose-400/30 px-3 py-1 rounded-full text-xs font-bold">
                      <i className="fa-solid fa-qrcode"></i>
                      <span>Log Rekam Jejak Unduh PDF Ber-QR Code &amp; Tanda Tangan</span>
                    </div>
                    <div className="inline-flex items-center space-x-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-1 rounded-full text-[11px] font-bold">
                      <i className="fa-solid fa-cloud-arrow-up"></i>
                      <span>Tersinkronisasi Realtime ke Database</span>
                    </div>
                  </div>

                  <h2 className="text-xl md:text-2xl font-black tracking-tight">
                    Riwayat Pengunduhan Dokumen Resmi &amp; ID Verifikasi Unik
                  </h2>
                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                    Setiap dokumen PDF yang diunduh dari sistem ini secara otomatis diberikan <strong>ID Verifikasi Unik</strong> dan rekam jejak digital ke dalam database sistem. Anda dapat memfilter berdasarkan rentang tanggal maupun nama petugas, serta menyalin ID verifikasi untuk divalidasi langsung melalui tab <em>Alat Verifikasi PDF &amp; QR Code</em>.
                  </p>
                </div>

                {/* Quick Metrics Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-rose-500/20 mt-4 relative z-10 text-xs">
                  <div className="bg-white/5 backdrop-blur-xs p-3 rounded-xl border border-white/10">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Unduh PDF</span>
                    <span className="text-lg font-black text-white">{pdfLogsTotalCount}</span>
                  </div>
                  <div className="bg-white/5 backdrop-blur-xs p-3 rounded-xl border border-white/10">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Hasil Filter Saat Ini</span>
                    <span className="text-lg font-black text-rose-300">{filteredPdfLogs.length}</span>
                  </div>
                  <div className="bg-white/5 backdrop-blur-xs p-3 rounded-xl border border-white/10">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Petugas Terdaftar</span>
                    <span className="text-lg font-black text-amber-300">{uniquePdfOfficers.length}</span>
                  </div>
                  <div className="bg-white/5 backdrop-blur-xs p-3 rounded-xl border border-white/10">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Status Cloud DB</span>
                    <span className="text-xs font-bold text-emerald-400 flex items-center space-x-1 mt-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span>Database Aktif</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Filter Bar: Rentang Tanggal, Nama Petugas, dan Pencarian Cepat */}
              <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  {/* Rentang Tanggal Preset */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center space-x-1.5 mr-1">
                      <i className="fa-regular fa-calendar-days text-rose-600"></i>
                      <span>Rentang Tanggal:</span>
                    </span>
                    <div className="flex flex-wrap gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                      {[
                        { id: 'SEMUA', label: 'Semua Waktu' },
                        { id: 'HARI_INI', label: 'Hari Ini' },
                        { id: 'KEMARIN', label: 'Kemarin' },
                        { id: '3_HARI', label: '3 Hari' },
                        { id: '7_HARI', label: '7 Hari' },
                        { id: 'KUSTOM', label: 'Rentang Kustom' }
                      ].map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setPdfDatePreset(preset.id as any)}
                          className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                            pdfDatePreset === preset.id
                              ? 'bg-rose-600 text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Filter Nama Petugas Dropdown */}
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center space-x-1.5">
                      <i className="fa-solid fa-user-tie text-rose-600"></i>
                      <span className="whitespace-nowrap">Nama Petugas:</span>
                    </span>
                    <select
                      value={pdfOfficerFilter}
                      onChange={(e) => setPdfOfficerFilter(e.target.value)}
                      className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                    >
                      <option value="SEMUA">-- Semua Petugas Pengunduh --</option>
                      {uniquePdfOfficers.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Jika Rentang Kustom Dipilih */}
                {pdfDatePreset === 'KUSTOM' && (
                  <div className="flex flex-wrap items-center gap-3 p-3 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs animate-in fade-in">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-700 dark:text-slate-300">Dari:</span>
                      <input
                        type="date"
                        value={pdfStartDate}
                        onChange={(e) => setPdfStartDate(e.target.value)}
                        className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold"
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-700 dark:text-slate-300">Sampai:</span>
                      <input
                        type="date"
                        value={pdfEndDate}
                        onChange={(e) => setPdfEndDate(e.target.value)}
                        className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPdfStartDate('');
                        setPdfEndDate('');
                      }}
                      className="text-xs text-rose-600 hover:text-rose-800 font-bold underline cursor-pointer"
                    >
                      Reset Tanggal
                    </button>
                  </div>
                )}

                {/* Pencarian Teks & Reset Global */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-700">
                  <div className="relative flex-grow w-full sm:w-auto">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-xs pointer-events-none">
                      <i className="fa-solid fa-magnifying-glass"></i>
                    </span>
                    <input
                      type="text"
                      value={pdfSearch}
                      onChange={(e) => setPdfSearch(e.target.value)}
                      placeholder="Cari ID Verifikasi (VLOG-...), nama dokumen, petugas, tamu, atau pejabat..."
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                    />
                  </div>

                  {(pdfDatePreset !== 'SEMUA' || pdfOfficerFilter !== 'SEMUA' || pdfSearch.trim() || pdfStartDate || pdfEndDate) && (
                    <button
                      type="button"
                      onClick={() => {
                        setPdfDatePreset('SEMUA');
                        setPdfStartDate('');
                        setPdfEndDate('');
                        setPdfOfficerFilter('SEMUA');
                        setPdfSearch('');
                      }}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition flex items-center space-x-1.5 shrink-0 cursor-pointer"
                    >
                      <i className="fa-solid fa-rotate-left text-xs"></i>
                      <span>Reset Semua Filter</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Tabel Log Aktivitas Unduh PDF */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700 dark:text-slate-200">
                    <thead className="bg-slate-100 dark:bg-slate-900 uppercase text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-3">ID Verifikasi Unik</th>
                        <th className="p-3">Waktu Unduh</th>
                        <th className="p-3">Petugas Pengunduh</th>
                        <th className="p-3">Nama Dokumen / Objek</th>
                        <th className="p-3">Pejabat TTD &amp; QR</th>
                        <th className="p-3 text-center">Status Keaslian</th>
                        <th className="p-3 text-center">Aksi Verifikasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {filteredPdfLogs.length > 0 ? (
                        filteredPdfLogs.map((log, idx) => {
                          const logIdStr = log.id ? String(log.id) : `LOG${idx + 1}`;
                          const verifCode = log.verificationCode || (logIdStr.toLowerCase().startsWith('vlog-') ? logIdStr.toUpperCase() : `VLOG-${logIdStr.slice(-8).toUpperCase()}`);
                          return (
                            <tr key={idx} className="hover:bg-rose-50/40 dark:hover:bg-slate-700/50 transition">
                              <td className="p-3">
                                <div className="flex items-center space-x-1.5">
                                  <span className="font-mono font-black text-[11px] text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                                    {verifCode}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (navigator.clipboard) {
                                        navigator.clipboard.writeText(verifCode);
                                        showToast(`ID Verifikasi "${verifCode}" disalin ke clipboard!`, 'success');
                                      }
                                    }}
                                    className="p-1 text-slate-400 hover:text-blue-600 transition cursor-pointer"
                                    title="Salin ID Verifikasi"
                                  >
                                    <i className="fa-regular fa-copy"></i>
                                  </button>
                                </div>
                              </td>
                              <td className="p-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                <i className="fa-regular fa-clock mr-1 text-slate-400"></i>
                                {log.timestamp}
                              </td>
                              <td className="p-3">
                                <div className="font-bold text-slate-900 dark:text-white">{log.user}</div>
                                <div className="text-[10px] text-slate-500">{log.role}</div>
                              </td>
                              <td className="p-3">
                                <div className="font-semibold text-slate-800 dark:text-slate-100 flex items-center space-x-1.5">
                                  <i className="fa-solid fa-file-pdf text-rose-600 text-xs"></i>
                                  <span>{log.documentTitle || log.targetId || log.details.replace(/\[VLOG-[^\]]+\]\s*/, '')}</span>
                                </div>
                              </td>
                              <td className="p-3">
                                <div className="font-bold text-slate-800 dark:text-slate-200">
                                  {log.signatoryName || 'Pejabat Penandatangan'}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  {log.signatoryRole || 'Pimpinan Divisi'} {log.signatoryNip ? `• NIP ${log.signatoryNip}` : ''}
                                </div>
                              </td>
                              <td className="p-3 text-center whitespace-nowrap">
                                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                  <i className="fa-solid fa-circle-check text-emerald-600"></i>
                                  <span>QR Valid &amp; Terdata</span>
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    sessionStorage.setItem('verify_code_target', verifCode);
                                    setAuditSubTab('VERIFY');
                                    showToast(`Membuka Alat Verifikasi Dokumen: ${verifCode}`, 'info');
                                  }}
                                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-[11px] shadow-xs transition flex items-center space-x-1.5 mx-auto cursor-pointer"
                                  title="Buka di Alat Verifikasi PDF &amp; QR"
                                >
                                  <i className="fa-solid fa-shield-halved"></i>
                                  <span>Verifikasi Dokumen</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400 dark:text-slate-500">
                            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-2 text-xl text-slate-400">
                              <i className="fa-solid fa-filter-circle-xmark"></i>
                            </div>
                            <p className="font-bold text-sm text-slate-600 dark:text-slate-400">Tidak ada log aktivitas unduh PDF yang sesuai</p>
                            <p className="text-xs text-slate-400 mt-0.5">Coba ubah rentang tanggal atau bersihkan filter pencarian nama petugas.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB CONTENT 3: ALAT VERIFIKASI KEASLIAN PDF & QR CODE */}
          {auditSubTab === 'VERIFY' && (
            <div className="animate-in fade-in duration-150">
              <VerifyPdfView />
            </div>
          )}
        </div>
      ) : activeSubView === 'DATABASE_MGMT' ? (
        /* Pusat Manajemen Basis Data (Google Spreadsheet) */
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Unified Central Database Banner & Real-Time Sync Control */}
          <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white p-6 rounded-2xl shadow-lg border border-emerald-500/30 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
              <i className="fa-solid fa-cloud-bolt text-9xl text-emerald-400"></i>
            </div>
            
            <div className="relative z-10 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="max-w-3xl space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center space-x-2 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-3 py-1 rounded-full text-xs font-bold">
                      <i className="fa-solid fa-database"></i>
                      <span>Basis Data Utama (Google Spreadsheet)</span>
                    </div>

                    <div className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                      supabaseSyncState?.isSyncing
                        ? 'bg-sky-500/20 text-sky-200 border-sky-400/40 animate-pulse'
                        : supabaseSyncState?.lastError
                        ? 'bg-rose-500/20 text-rose-200 border-rose-400/40'
                        : 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${
                        supabaseSyncState?.isSyncing
                          ? 'bg-sky-400'
                          : supabaseSyncState?.lastError
                          ? 'bg-rose-400'
                          : 'bg-emerald-400 animate-ping'
                      }`}></span>
                      <span>
                        {supabaseSyncState?.isSyncing
                          ? 'Status Sync: Menyinkronkan...'
                          : supabaseSyncState?.lastError
                          ? `Status Sync: ${supabaseSyncState.lastError}`
                          : 'Status Sync: Terhubung & Sinkron dengan Google Spreadsheet'}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                    Basis Data Terpusat SIM-Akomodasi UPT Asrama Haji Jakarta
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Sistem terhubung langsung ke <strong>Basis Data Utama Google Spreadsheet</strong>. Saat aplikasi dibuka dan masuk (login), data terbaru langsung ditarik dari spreadsheet pusat, dan setiap perubahan transaksi, master gedung, dan kamar disinkronkan secara aman.
                  </p>
                </div>

                {/* Primary Sync Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={async () => {
                      setIsCloudSyncing(true);
                      await manualSyncSupabase();
                      setIsCloudSyncing(false);
                    }}
                    disabled={isCloudSyncing || supabaseSyncState?.isSyncing}
                    className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition flex items-center space-x-2 shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    <i className={`fa-solid ${isCloudSyncing || supabaseSyncState?.isSyncing ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-down'}`}></i>
                    <span>Tarik Data Terbaru dari Spreadsheet</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      setIsCloudSyncing(true);
                      await pushAllToSupabase();
                      setIsCloudSyncing(false);
                    }}
                    disabled={isCloudSyncing || supabaseSyncState?.isSyncing}
                    className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold text-xs rounded-xl transition flex items-center space-x-2 shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    <i className="fa-solid fa-cloud-arrow-up text-emerald-300"></i>
                    <span>Kirim Pembaruan ke Spreadsheet</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveSubView('SPREADSHEET_MGMT')}
                    className="px-3.5 py-2.5 bg-emerald-500/30 hover:bg-emerald-500/40 text-emerald-100 border border-emerald-400/50 font-bold text-xs rounded-xl transition flex items-center space-x-1.5 cursor-pointer shadow-xs"
                    title="Buka panduan & integrasi Google Spreadsheet"
                  >
                    <i className="fa-solid fa-file-excel text-emerald-300"></i>
                    <span>Kelola Lembar Kerja &amp; Integrasi Spreadsheet</span>
                  </button>
                </div>
              </div>

              {/* Connection Metadata Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-3 border-t border-white/10 text-xs">
                <div className="bg-black/25 px-3.5 py-2 rounded-xl border border-white/10 flex items-center justify-between">
                  <span className="text-slate-400 text-[11px]">Database Utama:</span>
                  <span className="font-mono text-emerald-300 font-bold text-[11px] truncate max-w-[200px]">
                    Google Spreadsheet (Apps Script)
                  </span>
                </div>
                <div className="bg-black/25 px-3.5 py-2 rounded-xl border border-white/10 flex items-center justify-between">
                  <span className="text-slate-400 text-[11px]">Mode Penyimpanan:</span>
                  <span className="font-bold text-white text-[11px]">Spreadsheet + Real-Time Engine</span>
                </div>
                <div className="bg-black/25 px-3.5 py-2 rounded-xl border border-white/10 flex items-center justify-between">
                  <span className="text-slate-400 text-[11px]">Sinkronisasi Terakhir:</span>
                  <span className="font-mono text-emerald-300 font-bold text-[11px]">
                    {supabaseSyncState?.lastSyncedAt
                      ? `${new Date(supabaseSyncState.lastSyncedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} WIB`
                      : 'Real-Time Otomatis'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Current Database Metrics */}
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 pb-3">
              <div>
                <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center space-x-2">
                  <i className="fa-solid fa-chart-pie text-emerald-600"></i>
                  <span>Metrik &amp; Ringkasan Rekord Basis Data Pusat</span>
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Jumlah catatan operasional aktif yang tersimpan secara real-time di dalam basis data pusat saat ini.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs px-2.5 py-1 rounded-full font-bold border bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Sinkronisasi Langsung Aktif</span>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Gedung &amp; Kamar</span>
                <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{buildings.length} / {rooms.length}</p>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Gedung &amp; Unit Kamar</span>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Tamu &amp; Transaksi</span>
                <p className="text-xl font-black mt-1 text-slate-900 dark:text-white">{transactions.length}</p>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Transaksi reservasi</span>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Maintenance</span>
                <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{maintenances.length}</p>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Tiket teknisi</span>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Inspeksi QC</span>
                <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{qcInspections.length}</p>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Laporan kelayakan</span>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Petugas Terdaftar</span>
                <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{users.length}</p>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Akun sistem</span>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Katalog Menu Sarapan</span>
                <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{breakfastMenuItems.length}</p>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Item menu dapur</span>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Pesanan Sarapan</span>
                <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{breakfastOrders.length}</p>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Pesanan tercatat</span>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Log Aktivitas</span>
                <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{auditLogs.length}</p>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Audit trail sistem</span>
              </div>
            </div>
          </div>



          {/* Backup, Restore & Reset Action Tools */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <h4 className="font-bold text-slate-800 text-sm flex items-center space-x-2 border-b border-slate-100 pb-3">
              <i className="fa-solid fa-shield-halved text-indigo-600"></i>
              <span>Operasi &amp; Pemeliharaan Basis Data Mandiri</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Unduh Backup */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition flex flex-col justify-between space-y-3">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-lg mb-2">
                    <i className="fa-solid fa-file-arrow-down"></i>
                  </div>
                  <h5 className="font-bold text-slate-900 text-xs">Unduh Cadangan Basis Data</h5>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Ekspor seluruh data sistem (kamar, tamu, teknisi, QC, sarapan, user, log) ke file JSON mandiri untuk arsip offline.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={exportDatabaseBackup}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs"
                >
                  <i className="fa-solid fa-download"></i>
                  <span>Unduh File .JSON</span>
                </button>
              </div>

              {/* Pulihkan / Import Backup */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition flex flex-col justify-between space-y-3">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-lg mb-2">
                    <i className="fa-solid fa-file-arrow-up"></i>
                  </div>
                  <h5 className="font-bold text-slate-900 text-xs">Pulihkan dari File JSON</h5>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Unggah file cadangan JSON untuk memulihkan seluruh struktur kamar, transaksi, menu sarapan, dan riwayat operasional.
                  </p>
                </div>
                <div>
                  <input
                    type="file"
                    ref={fileImportRef}
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const content = event.target?.result as string;
                        if (content) {
                          const success = importDatabaseBackup(content);
                          if (success) {
                            showToast('Basis data berhasil dipulihkan dari cadangan!', 'success');
                          } else {
                            showToast('Gagal memulihkan: Format berkas JSON tidak valid!', 'error');
                          }
                        }
                      };
                      reader.readAsText(file);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileImportRef.current?.click()}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs"
                  >
                    <i className="fa-solid fa-upload"></i>
                    <span>Pilih Berkas JSON</span>
                  </button>
                </div>
              </div>

              {/* Reset ke Kondisi Awal */}
              <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/40 hover:bg-rose-50 transition flex flex-col justify-between space-y-3">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-lg mb-2">
                    <i className="fa-solid fa-user-shield"></i>
                  </div>
                  <h5 className="font-bold text-slate-900 text-xs">Reset Database</h5>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Kembalikan seluruh basis data ke kondisi awal. Seluruh data aktivitas, shift, QC, transaksi, dan tiket maintenance dikosongkan, serta hanya menyisakan akun <strong>Super Admin</strong> dan <strong>Admin</strong>.
                  </p>
                </div>
                <button
                  type="button"
                  id="btn-reset-database"
                  onClick={() => setShowResetConfirmModal(true)}
                  className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs"
                >
                  <i className="fa-solid fa-rotate-left"></i>
                  <span>Reset Database</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : activeSubView === 'SPREADSHEET_MGMT' ? (
        <div className="space-y-5 animate-in fade-in duration-200">
          <SpreadsheetIntegrationView />
        </div>
      ) : (
        /* Fallback Empty */
        null
      )}

      {/* Modal Konfirmasi Reset Database */}
      {showResetConfirmModal && (
        <div 
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
          onClick={() => setShowResetConfirmModal(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center text-xl shrink-0">
                <i className="fa-solid fa-triangle-exclamation"></i>
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-base">Konfirmasi Reset Database</h4>
                <p className="text-xs text-slate-500">Tindakan ini tidak dapat dibatalkan</p>
              </div>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-900 space-y-1.5">
              <p className="font-bold">Apakah Anda yakin ingin mereset basis data?</p>
              <ul className="list-disc list-inside space-y-0.5 text-slate-700 text-[11px]">
                <li>Riwayat <strong>log aktivitas</strong> akan dikosongkan.</li>
                <li>Rekap <strong>sesi &amp; jam kerja (shift)</strong> akan dikosongkan.</li>
                <li>Seluruh inspeksi <strong>Quality Control (QC)</strong> akan dikosongkan.</li>
                <li>Data transaksi tamu &amp; tiket maintenance dibersihkan.</li>
                <li>Hanya akun <strong>Super Admin</strong> dan <strong>Admin</strong> serta data master gedung &amp; kamar yang tersisa.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                id="btn-confirm-reset-database"
                onClick={() => {
                  resetDatabase();
                  setShowResetConfirmModal(false);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition flex items-center space-x-1.5 cursor-pointer shadow-sm"
              >
                <i className="fa-solid fa-rotate-left"></i>
                <span>Reset Database</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Reset Rekap Sesi Kerja */}
      {showResetSessionsModal && (
        <div 
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
          onClick={() => setShowResetSessionsModal(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl shrink-0">
                <i className="fa-solid fa-broom"></i>
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-base">Reset Rekap Sesi Kerja</h4>
                <p className="text-xs text-slate-500">Bersihkan seluruh riwayat shift &amp; durasi lama</p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1.5">
              <p className="font-bold">Apakah Anda yakin ingin mengosongkan riwayat sesi &amp; jam kerja?</p>
              <p className="text-slate-600 text-[11px]">
                Semua entri sesi lama yang tidak wajar atau duplikat akan dibersihkan. Catatan sesi baru akan mulai dihitung bersih dan akurat sejak waktu login terkini.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowResetSessionsModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                id="btn-confirm-reset-sessions"
                onClick={() => {
                  clearWorkSessions();
                  setShowResetSessionsModal(false);
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition flex items-center space-x-1.5 cursor-pointer shadow-sm"
              >
                <i className="fa-solid fa-check"></i>
                <span>Ya, Bersihkan Sesi</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Kosongkan Log Aktivitas */}
      {showClearAuditModal && (
        <div 
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
          onClick={() => setShowClearAuditModal(false)}
        >
          <div 
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200 dark:border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 flex items-center justify-center text-xl shrink-0">
                <i className="fa-solid fa-trash-can"></i>
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-base">Kosongkan Log Aktivitas</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">Hapus seluruh riwayat entri log aktivitas audit</p>
              </div>
            </div>

            <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-xl p-3 text-xs text-rose-900 dark:text-rose-200 space-y-1.5">
              <p className="font-bold">Apakah Anda yakin ingin mengosongkan log aktivitas?</p>
              <p className="text-slate-600 dark:text-slate-400 text-[11px]">
                Seluruh catatan audit tindakan petugas (check-in, check-out, ubah gedung, unduh PDF) akan dikosongkan. Data master gedung, kamar, dan reservasi tetap aman dan tidak terpengaruh.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setShowClearAuditModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  clearAuditLogs();
                  setShowClearAuditModal(false);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition flex items-center space-x-1.5 cursor-pointer shadow-sm"
              >
                <i className="fa-solid fa-trash-can"></i>
                <span>Kosongkan Log</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

