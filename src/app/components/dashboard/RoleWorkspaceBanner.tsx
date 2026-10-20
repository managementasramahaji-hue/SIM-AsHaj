// @ts-nocheck
import React, { useState } from 'react';
import { motion } from 'motion/react';
import { formatRupiah, isMeetingFacility } from '../../lib/utils';
import { Transaction, Room, Maintenance } from '../../types';
import { useAppContext } from '../../store';

interface RoleWorkspaceBannerProps {
  currentUser: any;
  activePerspective: 'ALL' | 'RESEPSIONIS' | 'KEUANGAN' | 'TEKNISI' | 'QC' | 'KOPERASI';
  setActivePerspective: (perspective: 'ALL' | 'RESEPSIONIS' | 'KEUANGAN' | 'TEKNISI' | 'QC' | 'KOPERASI') => void;
  financialStats: {
    totalPenerimaanPnbp: number;
    totalLunasCount: number;
    totalBelumLunasCount: number;
    totalSisaPiutang: number;
    totalDpMasuk: number;
    pnbpHariIni?: number;
    totalEstimatedPNBP?: number;
    unpaidTxs: { 
      tx: Transaction; 
      pricing: any; 
      sisaBayar: number; 
      paid: number;
      isGroup?: boolean;
      groupRecord?: any;
      groupKey?: string;
    }[];
  };
  cateringStats: {
    todayOrders: any[];
    waitingOrders: any[];
    cookingOrders: any[];
    deliveringOrders: any[];
    completedOrders: any[];
    totalPortions: number;
  };
  checkinTodayList: Transaction[];
  checkoutTodayList: Transaction[];
  qcNeedAttentionRooms: Room[];
  urgentMaintenances: Maintenance[];
  activeMaintenances: Maintenance[];
  readyCleanRooms: Room[];
  terisiKamar: number;
  totalKamar: number;
  openModal: (modal: string, data?: any) => void;
  setActiveTab: (tab: string) => void;
  updateBreakfastStatus?: (txId: string, status: any) => void;
  setSelectedBuilding?: (building: string) => void;
}

export function RoleWorkspaceBanner({
  currentUser,
  activePerspective,
  setActivePerspective,
  financialStats,
  cateringStats,
  checkinTodayList,
  checkoutTodayList,
  qcNeedAttentionRooms,
  urgentMaintenances,
  activeMaintenances,
  readyCleanRooms,
  terisiKamar,
  totalKamar,
  openModal,
  setActiveTab,
  updateBreakfastStatus,
  setSelectedBuilding,
}: RoleWorkspaceBannerProps) {
  const roleName = currentUser?.role || 'Pengguna';
  const assignedBuilding = currentUser?.assignedBuilding || 'Semua Gedung';
  const hasAssignedZone = assignedBuilding && !assignedBuilding.includes('Semua') && assignedBuilding !== '-';

  const {
    supabaseSyncState
  } = useAppContext();

  const lastSyncFormatted = supabaseSyncState?.lastSyncedAt
    ? new Date(supabaseSyncState.lastSyncedAt).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    : null;

  // Badge style based on role
  const getRoleBadge = () => {
    if (roleName.includes('Super Admin') || roleName === 'Admin') {
      return { bg: 'bg-purple-100 text-purple-800 border-purple-300', icon: 'fa-shield-halved' };
    }
    if (roleName.includes('Keuangan') || roleName.includes('Bendahara')) {
      return { bg: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: 'fa-money-bill-wave' };
    }
    if (roleName.includes('Teknisi')) {
      return { bg: 'bg-amber-100 text-amber-800 border-amber-300', icon: 'fa-screwdriver-wrench' };
    }
    if (roleName.includes('QC') || roleName.includes('Quality Control')) {
      return { bg: 'bg-teal-100 text-teal-800 border-teal-300', icon: 'fa-clipboard-check' };
    }
    if (roleName.includes('Koperasi')) {
      return { bg: 'bg-rose-100 text-rose-800 border-rose-300', icon: 'fa-utensils' };
    }
    return { bg: 'bg-blue-100 text-blue-800 border-blue-300', icon: 'fa-bell-concierge' };
  };

  const badge = getRoleBadge();

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden"
    >
      {/* Top Banner: Greeting, Role & Assigned Zone */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-hajj-900 text-white p-3.5 sm:p-4.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-white/10 backdrop-blur-xs text-gold-400 border border-gold-400/30 flex items-center justify-center text-lg shrink-0 shadow-inner">
            <i className={`fa-solid ${badge.icon}`}></i>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm sm:text-base font-black text-white tracking-tight">
                Halo, {currentUser?.fullName || currentUser?.username || 'Petugas'}!
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1.5 shadow-2xs ${badge.bg}`}>
                <i className={`fa-solid ${badge.icon} text-[9px]`}></i>
                <span>{roleName}</span>
              </span>

              {/* STATUS SYNC DENGAN DATABASE */}
              <span
                title={
                  supabaseSyncState?.lastError
                    ? `Gangguan sinkronisasi: ${supabaseSyncState.lastError}`
                    : lastSyncFormatted
                    ? `Terhubung ke Google Spreadsheet (Sinkron terakhir pukul ${lastSyncFormatted} WIB)`
                    : 'Terhubung langsung dengan Database Google Spreadsheet'
                }
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1.5 shadow-2xs ${
                  supabaseSyncState?.isSyncing
                    ? 'bg-blue-500/20 text-blue-200 border-blue-400/40'
                    : supabaseSyncState?.lastError
                    ? 'bg-rose-500/25 text-rose-200 border-rose-400/50'
                    : 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                }`}
              >
                {supabaseSyncState?.isSyncing ? (
                  <>
                    <i className="fa-solid fa-arrows-rotate fa-spin text-[9px] text-blue-300"></i>
                    <span>Sync Spreadsheet: Menyinkronkan...</span>
                  </>
                ) : supabaseSyncState?.lastError ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                    <i className="fa-solid fa-triangle-exclamation text-[9px] text-rose-300"></i>
                    <span>Sync Spreadsheet: Gangguan Koneksi</span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                    <i className="fa-solid fa-file-excel text-[9px] text-emerald-300"></i>
                    <span>
                      Sync Spreadsheet: Terhubung
                      {lastSyncFormatted ? ` (${lastSyncFormatted})` : ''}
                    </span>
                  </>
                )}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-slate-300">
              <span>Departemen: <strong>{currentUser?.department || 'Operasional'}</strong></span>
              {hasAssignedZone && (
                <>
                  <span className="text-slate-500">•</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gold-500/20 text-gold-300 border border-gold-500/30 font-bold text-[11px]">
                    <i className="fa-solid fa-map-pin text-[9px]"></i>
                    <span>Zona Tugas: {assignedBuilding}</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Perspective Switcher Buttons */}
        <div className="flex items-center gap-1 bg-black/30 p-1 rounded-xl border border-white/10 overflow-x-auto max-w-full text-xs self-start md:self-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActivePerspective('ALL')}
            className={`px-2.5 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activePerspective === 'ALL'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
            title="Tampilan Lengkap Semua Divisi"
          >
            <i className="fa-solid fa-layer-group text-xs text-purple-400"></i>
            <span>Semua</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePerspective('RESEPSIONIS')}
            className={`px-2.5 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activePerspective === 'RESEPSIONIS'
                ? 'bg-white text-blue-900 shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <i className="fa-solid fa-bell-concierge text-xs text-blue-400"></i>
            <span>Resepsionis</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePerspective('KEUANGAN')}
            className={`px-2.5 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activePerspective === 'KEUANGAN'
                ? 'bg-white text-emerald-900 shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <i className="fa-solid fa-coins text-xs text-emerald-400"></i>
            <span>Keuangan</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePerspective('TEKNISI')}
            className={`px-2.5 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activePerspective === 'TEKNISI'
                ? 'bg-white text-amber-900 shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <i className="fa-solid fa-wrench text-xs text-amber-400"></i>
            <span>Teknisi</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePerspective('QC')}
            className={`px-2.5 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activePerspective === 'QC'
                ? 'bg-white text-teal-900 shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <i className="fa-solid fa-clipboard-check text-xs text-teal-400"></i>
            <span>QC</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePerspective('KOPERASI')}
            className={`px-2.5 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activePerspective === 'KOPERASI'
                ? 'bg-white text-rose-900 shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <i className="fa-solid fa-utensils text-xs text-rose-400"></i>
            <span>Koperasi</span>
          </button>
        </div>
      </div>

      {/* Role-Tailored Dynamic Content Area */}
      <div className="p-3.5 sm:p-4 bg-slate-50/70 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800">
        {/* PERSPECTIVE: KEUANGAN */}
        {activePerspective === 'KEUANGAN' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                <i className="fa-solid fa-wallet text-emerald-600"></i>
                <span>Fokus Keuangan &amp; PNBP Hari Ini</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('laporanKamar')}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 flex items-center gap-1 cursor-pointer"
              >
                <span>Buka Laporan &amp; Kwitansi PNBP</span>
                <i className="fa-solid fa-arrow-right text-[10px]"></i>
              </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total PNBP Diterima</div>
                <div className="text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-400 mt-1">
                  {formatRupiah(financialStats.totalPenerimaanPnbp)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  <span>{financialStats.totalLunasCount} Transaksi Lunas</span>
                  {Boolean(financialStats.pnbpHariIni && financialStats.pnbpHariIni > 0) && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold block">Hari Ini: +{formatRupiah(financialStats.pnbpHariIni || 0)}</span>
                  )}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sisa Piutang Berjalan</div>
                <div className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400 mt-1">
                  {formatRupiah(financialStats.totalSisaPiutang)}
                </div>
                <div className="text-[10px] text-amber-700 dark:text-amber-300 font-semibold mt-0.5">
                  {financialStats.totalBelumLunasCount} Tagihan Belum Lunas
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Uang Muka (DP) Masuk</div>
                <div className="text-base sm:text-lg font-black text-blue-700 dark:text-blue-400 mt-1">
                  {formatRupiah(financialStats.totalDpMasuk)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Estimasi Total: {formatRupiah(financialStats.totalEstimatedPNBP || (financialStats.totalPenerimaanPnbp + financialStats.totalSisaPiutang))}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tindakan Cepat</div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-1">Kwitansi &amp; Invoice</div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('laporanKamar')}
                  className="mt-2 w-full py-1.5 px-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <i className="fa-solid fa-receipt text-[10px]"></i>
                  <span>Cek Laporan &amp; Kwitansi</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PERSPECTIVE: TEKNISI */}
        {activePerspective === 'TEKNISI' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                <i className="fa-solid fa-screwdriver-wrench text-amber-600"></i>
                <span>Fokus Pemeliharaan Sarana &amp; Fasilitas Hari Ini</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('laporanMaintenance')}
                className="text-xs font-bold text-amber-700 hover:text-amber-800 dark:text-amber-400 flex items-center gap-1 cursor-pointer"
              >
                <span>Buka Tiket Perbaikan Fasilitas</span>
                <i className="fa-solid fa-arrow-right text-[10px]"></i>
              </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <div className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Tiket Urgent</div>
                <div className="text-base sm:text-lg font-black text-red-600 mt-1">
                  {urgentMaintenances.length} Kasus
                </div>
                <div className="text-[10px] text-red-700 font-semibold mt-0.5">Perlu Tindakan Segera</div>
              </div>

              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Perbaikan Berjalan</div>
                <div className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400 mt-1">
                  {activeMaintenances.length} Unit
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Dalam Penanganan Teknisi</div>
              </div>

              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kamar Siap Huni</div>
                <div className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {readyCleanRooms.length} Kamar
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Lolos Uji Standar Kelayakan</div>
              </div>

              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tindakan Lapangan</div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-1">Lapor / Selesai Perbaikan</div>
                </div>
                <button
                  type="button"
                  onClick={() => openModal('modalMaintenanceRequest')}
                  className="mt-2 w-full py-1.5 px-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <i className="fa-solid fa-plus text-[10px]"></i>
                  <span>Input Kendala Fasilitas</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PERSPECTIVE: QUALITY CONTROL (QC) */}
        {activePerspective === 'QC' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                <i className="fa-solid fa-clipboard-check text-teal-600"></i>
                <span>Fokus Penjaminan Mutu &amp; Kelaikan Kamar (QC)</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('qualityControl')}
                className="text-xs font-bold text-teal-700 hover:text-teal-800 dark:text-teal-400 flex items-center gap-1 cursor-pointer"
              >
                <span>Buka Modul Inspeksi Mutu QC</span>
                <i className="fa-solid fa-arrow-right text-[10px]"></i>
              </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <div className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">Menunggu QC</div>
                <div className="text-base sm:text-lg font-black text-purple-700 dark:text-purple-400 mt-1">
                  {qcNeedAttentionRooms.filter(r => r.qcStatus === 'MENUNGGU_QC').length} Kamar
                </div>
                <div className="text-[10px] text-purple-700 font-semibold mt-0.5">Selesai Dikerjakan, Butuh Verifikasi</div>
              </div>

              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Perlu Cek / Inspeksi</div>
                <div className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400 mt-1">
                  {qcNeedAttentionRooms.length} Unit
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Antrean Pemeriksaan Kamar</div>
              </div>

              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Lolos Standar Mutu</div>
                <div className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {readyCleanRooms.length} Kamar
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Siap Dihuni Jemaah / Tamu</div>
              </div>

              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Aksi Verifikasi</div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-1">Form Kendali Mutu</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const candidate = qcNeedAttentionRooms[0] || readyCleanRooms[0];
                    if (candidate) openModal('modalQcInspection', { room: candidate });
                    else setActiveTab('qualityControl');
                  }}
                  className="mt-2 w-full py-1.5 px-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <i className="fa-solid fa-magnifying-glass-check text-[10px]"></i>
                  <span>Mulai Cek Kelaikan QC</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PERSPECTIVE: KOPERASI & KONSUMSI */}
        {activePerspective === 'KOPERASI' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                <i className="fa-solid fa-utensils text-rose-600"></i>
                <span>Fokus Distribusi Makanan &amp; Katering Hari Ini</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('pesananSarapan')}
                className="text-xs font-bold text-rose-700 hover:text-rose-800 dark:text-rose-400 flex items-center gap-1 cursor-pointer"
              >
                <span>Buka Jadwal Katering Lengkap</span>
                <i className="fa-solid fa-arrow-right text-[10px]"></i>
              </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Porsi Hari Ini</div>
                <div className="text-base sm:text-lg font-black text-rose-700 dark:text-rose-400 mt-1">
                  {cateringStats.totalPortions} Porsi
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">{cateringStats.todayOrders.length} Pesanan Aktif</div>
              </div>

              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Menunggu Diproses</div>
                <div className="text-base sm:text-lg font-black text-amber-600 mt-1">
                  {cateringStats.waitingOrders.length} Pesanan
                </div>
                <div className="text-[10px] text-amber-700 font-semibold mt-0.5">Butuh Penyiapan Dapur</div>
              </div>

              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Sedang Diantar</div>
                <div className="text-base sm:text-lg font-black text-blue-600 mt-1">
                  {cateringStats.deliveringOrders.length} Pesanan
                </div>
                <div className="text-[10px] text-blue-700 font-semibold mt-0.5">Proses Pengantaran ke Kamar</div>
              </div>

              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pesanan Terselesaikan</div>
                  <div className="text-base sm:text-lg font-black text-emerald-600 mt-1">
                    {cateringStats.completedOrders.length} Pesanan
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('pesananSarapan')}
                  className="mt-2 w-full py-1.5 px-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <i className="fa-solid fa-list-check text-[10px]"></i>
                  <span>Kelola Status Pesanan</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PERSPECTIVE: RESEPSIONIS */}
        {activePerspective === 'RESEPSIONIS' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                <i className="fa-solid fa-bell-concierge text-blue-600"></i>
                <span>Fokus Front Desk &amp; Alur Tamu Hari Ini</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('gedung')}
                className="text-xs font-bold text-blue-700 hover:text-blue-800 dark:text-blue-400 flex items-center gap-1 cursor-pointer"
              >
                <span>Buka Denah &amp; Manajemen Kamar</span>
                <i className="fa-solid fa-arrow-right text-[10px]"></i>
              </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Jadwal Check-In Hari Ini</div>
                <div className="text-base sm:text-lg font-black text-blue-700 dark:text-blue-400 mt-1">
                  {checkinTodayList.length} Kamar
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Tamu / Jemaah Masuk</div>
              </div>

              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <div className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">Jadwal Check-Out Hari Ini</div>
                <div className="text-base sm:text-lg font-black text-rose-700 dark:text-rose-400 mt-1">
                  {checkoutTodayList.length} Kamar
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Selesai Masa Menginap</div>
              </div>

              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Kamar Siap Pakai</div>
                <div className="text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-400 mt-1">
                  {readyCleanRooms.length} Kamar
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Lolos QC, Bersih &amp; Siap Huni</div>
              </div>

              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pemesanan Baru</div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-1">Registrasi Tamu / Jemaah</div>
                </div>
                <button
                  type="button"
                  onClick={() => openModal('modalCheckin', { roomId: readyCleanRooms[0]?.id })}
                  className="mt-2 w-full py-1.5 px-2 bg-hajj-700 hover:bg-hajj-800 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <i className="fa-solid fa-calendar-plus text-[10px]"></i>
                  <span>Input Tamu / Check-In</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PERSPECTIVE: ALL (EXECUTIVE & PIMPINAN) */}
        {activePerspective === 'ALL' && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-700 dark:text-slate-300">Ringkasan Operasional Hari Ini:</span>
              <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded font-semibold border border-blue-200 dark:border-blue-800">
                {checkinTodayList.length} Kedatangan
              </span>
              <span className="px-2 py-0.5 bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 rounded font-semibold border border-rose-200 dark:border-rose-800">
                {checkoutTodayList.length} Kepulangan
              </span>
              <span className="px-2 py-0.5 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 rounded font-semibold border border-amber-200 dark:border-amber-800">
                {activeMaintenances.length} Perbaikan
              </span>
              <span className="px-2 py-0.5 bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 rounded font-semibold border border-teal-200 dark:border-teal-800">
                {qcNeedAttentionRooms.length} Antrean QC
              </span>
              <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded font-semibold border border-emerald-200 dark:border-emerald-800">
                {readyCleanRooms.length} Kamar Bersih
              </span>
            </div>

            <span className="text-[11px] text-slate-500 italic">
              Klik tab di pojok kanan atas untuk memfokuskan dashboard ke divisi tertentu.
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
