import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Room, Transaction, Maintenance } from '../../types';
import { formatRupiah, formatIndonesianDate } from '../../lib/utils';

// ============================================================================
// 1. QC & HOUSEKEEPING INSPECTION WORKLIST PANEL
// Khusus untuk Petugas & Manager Quality Control (QC)
// ============================================================================
interface QcWorklistPanelProps {
  qcNeedAttentionRooms: Room[];
  readyCleanRooms: Room[];
  rooms: Room[];
  openModal: (modal: string, data?: any) => void;
  setActiveTab: (tab: string) => void;
}

export function QcWorklistPanel({
  qcNeedAttentionRooms,
  readyCleanRooms,
  rooms,
  openModal,
  setActiveTab,
}: QcWorklistPanelProps) {
  const [filter, setFilter] = useState<'ALL' | 'MENUNGGU_QC' | 'PERLU_PERBAIKAN' | 'KOSONG'>('ALL');
  const [search, setSearch] = useState('');

  const waitingCount = qcNeedAttentionRooms.filter(r => r.qcStatus === 'MENUNGGU_QC').length;
  const repairCount = qcNeedAttentionRooms.filter(r => r.qcStatus === 'PERLU_PERBAIKAN').length;
  const needInspectCount = qcNeedAttentionRooms.filter(r => !r.qcStatus || r.qcStatus === 'PERLU_INSPEKSI').length;

  const filtered = useMemo(() => {
    return qcNeedAttentionRooms.filter(r => {
      if (filter === 'MENUNGGU_QC' && r.qcStatus !== 'MENUNGGU_QC') return false;
      if (filter === 'PERLU_PERBAIKAN' && r.qcStatus !== 'PERLU_PERBAIKAN') return false;
      if (filter === 'KOSONG' && r.status !== 'KOSONG') return false;
      if (search) {
        const q = search.toLowerCase();
        return r.roomNumber.toLowerCase().includes(q) || r.building.toLowerCase().includes(q);
      }
      return true;
    });
  }, [qcNeedAttentionRooms, filter, search]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-5 flex flex-col justify-between"
    >
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3.5">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center font-bold text-sm shrink-0 border border-teal-200 dark:border-teal-800">
              <i className="fa-solid fa-clipboard-check"></i>
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-800 dark:text-slate-100 tracking-tight">
                Antrean Kendali Mutu &amp; Kelaikan Kamar (QC)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Daftar unit yang butuh inspeksi kelaikan fisik sebelum dihuni jemaah &amp; tamu.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('qualityControl')}
            className="text-xs font-bold text-teal-700 hover:text-teal-800 dark:text-teal-400 flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
          >
            <span>Buka Modul QC Lengkap</span>
            <i className="fa-solid fa-arrow-right text-[10px]"></i>
          </button>
        </div>

        {/* Filter Badges & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 my-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                filter === 'ALL'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              Semua ({qcNeedAttentionRooms.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('MENUNGGU_QC')}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer flex items-center gap-1 ${
                filter === 'MENUNGGU_QC'
                  ? 'bg-purple-700 text-white shadow-xs'
                  : 'bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
              }`}
            >
              <span>Menunggu QC ({waitingCount})</span>
              {waitingCount > 0 && <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>}
            </button>
            <button
              type="button"
              onClick={() => setFilter('PERLU_PERBAIKAN')}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                filter === 'PERLU_PERBAIKAN'
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
              }`}
            >
              Perlu Perbaikan ({repairCount})
            </button>
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="Cari kamar / gedung..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 pl-7 pr-6 outline-none focus:ring-1 focus:ring-teal-600 w-full sm:w-44 text-slate-800 dark:text-slate-200"
            />
            <i className="fa-solid fa-magnifying-glass absolute left-2 top-2 text-[10px] text-slate-400"></i>
          </div>
        </div>

        {/* Room List Queue */}
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 space-y-2">
              <i className="fa-solid fa-circle-check text-2xl text-emerald-500"></i>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Tidak ada kamar dalam antrean verifikasi ini!
              </p>
              <p className="text-[11px] text-slate-500">
                Semua kamar telah lolos standar uji kelaikan mutu atau belum dilaporkan bermasalah.
              </p>
            </div>
          ) : (
            filtered.slice(0, 10).map(room => {
              const isWaiting = room.qcStatus === 'MENUNGGU_QC';
              const isNeedFix = room.qcStatus === 'PERLU_PERBAIKAN';

              return (
                <div
                  key={room.id}
                  className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition ${
                    isWaiting
                      ? 'bg-purple-50/60 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800'
                      : isNeedFix
                      ? 'bg-red-50/60 dark:bg-red-950/30 border-red-200 dark:border-red-800'
                      : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center font-black text-slate-900 dark:text-slate-100 text-xs shrink-0 shadow-2xs">
                      <span>{room.roomNumber}</span>
                      <span className="text-[8px] text-slate-500 font-normal">Lt {room.floor || 1}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900 dark:text-slate-100">{room.building}</span>
                        {isWaiting && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-purple-700 text-white animate-pulse">
                            Menunggu QC
                          </span>
                        )}
                        {isNeedFix && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 border border-red-300">
                            Perlu Perbaikan
                          </span>
                        )}
                        {!isWaiting && !isNeedFix && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-100 text-amber-800 border border-amber-300">
                            Perlu Cek
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Tipe: {room.type} • Status: <strong className={room.status === 'TERISI' ? 'text-blue-600' : 'text-emerald-600'}>{room.status}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => openModal('modalRoomDetail', { roomId: room.id })}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg transition cursor-pointer"
                    >
                      Detail
                    </button>
                    <button
                      type="button"
                      onClick={() => openModal('modalQcInspection', { room })}
                      className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <i className="fa-solid fa-clipboard-check text-[11px]"></i>
                      <span>Inspeksi QC</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
        <span>Menampilkan hingga 10 unit antrean teratas</span>
        <button
          type="button"
          onClick={() => setActiveTab('qualityControl')}
          className="text-teal-700 dark:text-teal-400 font-bold hover:underline"
        >
          Lihat Semua ({qcNeedAttentionRooms.length}) →
        </button>
      </div>
    </motion.div>
  );
}

// ============================================================================
// 2. TEKNISI & SARPRAS WORKLIST PANEL
// Khusus untuk Petugas & Manager Teknisi
// ============================================================================
interface TechnicianWorklistPanelProps {
  urgentMaintenances: Maintenance[];
  activeMaintenances: Maintenance[];
  openModal: (modal: string, data?: any) => void;
  setActiveTab: (tab: string) => void;
}

export function TechnicianWorklistPanel({
  urgentMaintenances,
  activeMaintenances,
  openModal,
  setActiveTab,
}: TechnicianWorklistPanelProps) {
  const [urgencyTab, setUrgencyTab] = useState<'ALL' | 'URGENT' | 'PROSES' | 'PENUGASAN'>('ALL');

  const filteredMaint = useMemo(() => {
    return activeMaintenances.filter(m => {
      if (urgencyTab === 'URGENT' && m.urgency !== 'Urgent') return false;
      if (urgencyTab === 'PROSES' && m.status !== 'PROSES') return false;
      if (urgencyTab === 'PENUGASAN' && m.status !== 'MENUNGGU_PENUGASAN') return false;
      return true;
    });
  }, [activeMaintenances, urgencyTab]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-5 flex flex-col justify-between"
    >
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3.5">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center font-bold text-sm shrink-0 border border-amber-200 dark:border-amber-800">
              <i className="fa-solid fa-screwdriver-wrench"></i>
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-800 dark:text-slate-100 tracking-tight">
                Daftar Tugas Perbaikan &amp; Kendala Sarpras
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Pusat tiket perbaikan kerusakan AC, kelistrikan, air, dan fasilitas kamar.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => openModal('modalMaintenanceRequest')}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <i className="fa-solid fa-plus text-[10px]"></i>
              <span>Lapor Kendala</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('laporanMaintenance')}
              className="text-xs font-bold text-amber-700 hover:text-amber-800 dark:text-amber-400 flex items-center gap-1 cursor-pointer"
            >
              <span>Laporan Lengkap</span>
              <i className="fa-solid fa-arrow-right text-[10px]"></i>
            </button>
          </div>
        </div>

        {/* Tab Filters */}
        <div className="flex flex-wrap items-center gap-1.5 my-3 text-xs">
          <button
            type="button"
            onClick={() => setUrgencyTab('ALL')}
            className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
              urgencyTab === 'ALL'
                ? 'bg-amber-700 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            Semua Tiket ({activeMaintenances.length})
          </button>
          <button
            type="button"
            onClick={() => setUrgencyTab('URGENT')}
            className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer flex items-center gap-1 ${
              urgencyTab === 'URGENT'
                ? 'bg-red-700 text-white shadow-xs'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            <span>Darurat / Urgent ({urgentMaintenances.length})</span>
            {urgentMaintenances.length > 0 && <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>}
          </button>
          <button
            type="button"
            onClick={() => setUrgencyTab('PROSES')}
            className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
              urgencyTab === 'PROSES'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'bg-blue-50 text-blue-700 border border-blue-200'
            }`}
          >
            Sedang Dikerjakan ({activeMaintenances.filter(m => m.status === 'PROSES').length})
          </button>
        </div>

        {/* Maintenance Cards */}
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {filteredMaint.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 space-y-2">
              <i className="fa-solid fa-wrench text-2xl text-emerald-500"></i>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Tidak ada tiket kendala dalam kategori ini!
              </p>
              <p className="text-[11px] text-slate-500">
                Semua fasilitas berfungsi dengan baik dan normal.
              </p>
            </div>
          ) : (
            filteredMaint.slice(0, 8).map(m => {
              const isUrgent = m.urgency === 'Urgent';

              return (
                <div
                  key={m.id}
                  className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition ${
                    isUrgent
                      ? 'bg-red-50/70 dark:bg-red-950/40 border-red-300 dark:border-red-800'
                      : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center font-black text-xs shrink-0 shadow-2xs border ${
                      isUrgent
                        ? 'bg-red-600 text-white border-red-700 animate-pulse'
                        : 'bg-amber-100 text-amber-900 border-amber-300'
                    }`}>
                      <span>{m.roomNumber}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900 dark:text-slate-100">{m.building}</span>
                        {isUrgent && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-red-700 text-white">
                            URGENT
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-700 border border-slate-300">
                          {m.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 font-medium line-clamp-1">
                        {m.description}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Teknisi: <strong>{m.assignedTechnicianName || m.technician || 'Belum Ditugaskan'}</strong> • Status: {m.status}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => openModal('modalUpdateMaintenance', { maintenance: m })}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <i className="fa-solid fa-pen-to-square text-[10px]"></i>
                      <span>Update Kasus</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
        <span>Menampilkan 8 kendala teratas</span>
        <button
          type="button"
          onClick={() => setActiveTab('laporanMaintenance')}
          className="text-amber-700 dark:text-amber-400 font-bold hover:underline"
        >
          Buka Laporan Perawatan Lengkap →
        </button>
      </div>
    </motion.div>
  );
}

// ============================================================================
// 3. KEUANGAN & PNBP BILLING WORKLIST PANEL
// Khusus untuk Bendahara, Kasir & Manager Keuangan
// ============================================================================
interface FinancialBillingPanelProps {
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
  openModal: (modal: string, data?: any) => void;
  setActiveTab: (tab: string) => void;
}

export function FinancialBillingPanel({
  financialStats,
  openModal,
  setActiveTab,
}: FinancialBillingPanelProps) {
  const [filterMode, setFilterMode] = useState<'ALL' | 'DP' | 'BIG_DEBT'>('ALL');

  const filtered = useMemo(() => {
    return financialStats.unpaidTxs.filter(item => {
      if (filterMode === 'DP' && item.paid <= 0) return false;
      if (filterMode === 'BIG_DEBT' && item.sisaBayar < 2000000) return false;
      return true;
    });
  }, [financialStats.unpaidTxs, filterMode]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-5 flex flex-col justify-between"
    >
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3.5">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-sm shrink-0 border border-emerald-200 dark:border-emerald-800">
              <i className="fa-solid fa-coins"></i>
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-800 dark:text-slate-100 tracking-tight">
                Monitoring Piutang &amp; Penagihan Invoice (Keuangan)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Daftar transaksi aktif yang memiliki sisa tagihan sewa kamar atau fasilitas belum lunas.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('laporanKamar')}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 flex items-center gap-1 cursor-pointer"
          >
            <span>Buka Laporan Kwitansi PNBP</span>
            <i className="fa-solid fa-arrow-right text-[10px]"></i>
          </button>
        </div>

        {/* Filter Badges */}
        <div className="flex items-center gap-1.5 my-3 text-xs">
          <button
            type="button"
            onClick={() => setFilterMode('ALL')}
            className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
              filterMode === 'ALL'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            Semua Tagihan ({financialStats.unpaidTxs.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('DP')}
            className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
              filterMode === 'DP'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'bg-blue-50 text-blue-700 border border-blue-200'
            }`}
          >
            Sudah DP Masuk
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('BIG_DEBT')}
            className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
              filterMode === 'BIG_DEBT'
                ? 'bg-amber-700 text-white shadow-xs'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
          >
            Sisa &gt; Rp 2.000.000
          </button>
        </div>

        {/* Invoice / Debt Cards */}
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 space-y-2">
              <i className="fa-solid fa-circle-check text-2xl text-emerald-500"></i>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Semua transaksi telah lunas terbayar!
              </p>
              <p className="text-[11px] text-slate-500">
                Tidak ada piutang tertunda pada kategori tagihan ini.
              </p>
            </div>
          ) : (
            filtered.slice(0, 8).map(({ tx, sisaBayar, paid, isGroup, groupRecord, groupKey }) => (
              <div
                key={isGroup ? `grp-${groupKey || tx.groupId || tx.id}` : tx.id}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                      {isGroup ? (groupRecord?.groupName || tx.groupName || tx.guestName) : tx.guestName}
                    </span>
                    {isGroup && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                        Rombongan
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                      Sisa: {formatRupiah(sisaBayar)}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {isGroup 
                      ? `${groupRecord?.buildingsList?.join(', ') || tx.building} • ${groupRecord?.allRoomNumbers?.length || 1} Kamar`
                      : `${tx.building} • ${tx.roomNumber ? `Kamar ${tx.roomNumber}` : 'Fasilitas'}`
                    } • Telah Dibayar: <strong className="text-emerald-600">{formatRupiah(paid)}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => openModal('modalInvoice', isGroup ? { transaction: tx, groupKey, groupRecord } : { transaction: tx })}
                    className="px-2.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-bold transition cursor-pointer"
                  >
                    Invoice
                  </button>
                  <button
                    type="button"
                    onClick={() => openModal('modalKwitansi', isGroup ? { transaction: tx, groupKey, groupRecord } : { transaction: tx })}
                    className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                  >
                    Kwitansi
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
        <span>Total Piutang Berjalan: <strong className="text-amber-600 font-bold">{formatRupiah(financialStats.totalSisaPiutang)}</strong></span>
        <button
          type="button"
          onClick={() => setActiveTab('laporanKamar')}
          className="text-emerald-700 dark:text-emerald-400 font-bold hover:underline"
        >
          Lihat Buku Kas PNBP →
        </button>
      </div>
    </motion.div>
  );
}

// ============================================================================
// 4. KOPERASI & KONSUMSI WORKLIST PANEL
// Khusus untuk Petugas & Manager Koperasi / Dapur
// ============================================================================
interface CateringWorklistPanelProps {
  cateringStats: {
    todayOrders: any[];
    waitingOrders: any[];
    cookingOrders: any[];
    deliveringOrders: any[];
    completedOrders: any[];
    totalPortions: number;
  };
  updateBreakfastStatus?: (txId: string, status: any) => void;
  setActiveTab: (tab: string) => void;
}

export function CateringWorklistPanel({
  cateringStats,
  updateBreakfastStatus,
  setActiveTab,
}: CateringWorklistPanelProps) {
  const [tab, setTab] = useState<'ALL' | 'MENUNGGU' | 'SEDANG_DIBUAT' | 'PENGANTARAN'>('ALL');

  const filtered = useMemo(() => {
    return cateringStats.todayOrders.filter(o => {
      if (tab === 'MENUNGGU' && o.status !== 'MENUNGGU') return false;
      if (tab === 'SEDANG_DIBUAT' && o.status !== 'SEDANG_DIBUAT') return false;
      if (tab === 'PENGANTARAN' && o.status !== 'PENGANTARAN') return false;
      return true;
    });
  }, [cateringStats.todayOrders, tab]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-5 flex flex-col justify-between"
    >
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3.5">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 flex items-center justify-center font-bold text-sm shrink-0 border border-rose-200 dark:border-rose-800">
              <i className="fa-solid fa-utensils"></i>
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-800 dark:text-slate-100 tracking-tight">
                Worklist Dapur &amp; Distribusi Makanan Hari Ini
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Penyajian sarapan dan katering jemaah / tamu asrama haji.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('pesananSarapan')}
            className="text-xs font-bold text-rose-700 hover:text-rose-800 dark:text-rose-400 flex items-center gap-1 cursor-pointer"
          >
            <span>Buka Modul Katering</span>
            <i className="fa-solid fa-arrow-right text-[10px]"></i>
          </button>
        </div>

        {/* Tab Filters */}
        <div className="flex flex-wrap items-center gap-1.5 my-3 text-xs">
          <button
            type="button"
            onClick={() => setTab('ALL')}
            className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
              tab === 'ALL'
                ? 'bg-rose-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            Semua ({cateringStats.todayOrders.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('MENUNGGU')}
            className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
              tab === 'MENUNGGU'
                ? 'bg-amber-700 text-white shadow-xs'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
          >
            Menunggu Masak ({cateringStats.waitingOrders.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('PENGANTARAN')}
            className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
              tab === 'PENGANTARAN'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'bg-blue-50 text-blue-700 border border-blue-200'
            }`}
          >
            Pengantaran ({cateringStats.deliveringOrders.length})
          </button>
        </div>

        {/* Catering Cards */}
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 space-y-2">
              <i className="fa-solid fa-bell text-2xl text-emerald-500"></i>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Tidak ada pesanan katering dalam antrean ini!
              </p>
              <p className="text-[11px] text-slate-500">
                Semua makanan hari ini telah disiapkan atau selesai diantar.
              </p>
            </div>
          ) : (
            filtered.slice(0, 8).map((order: any) => (
              <div
                key={order.id}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-900 dark:text-slate-100">{order.guestName}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                      {order.portions || 1} Porsi
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {order.building} • Kamar {order.roomNumber} • Menu: <strong>{order.menuName || 'Sarapan Standar UPT'}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                  {order.status === 'MENUNGGU' && (
                    <button
                      type="button"
                      onClick={() => updateBreakfastStatus && updateBreakfastStatus(order.id, 'SEDANG_DIBUAT')}
                      className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                    >
                      Mulai Masak
                    </button>
                  )}
                  {order.status === 'SEDANG_DIBUAT' && (
                    <button
                      type="button"
                      onClick={() => updateBreakfastStatus && updateBreakfastStatus(order.id, 'PENGANTARAN')}
                      className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                    >
                      Kirim ke Kamar
                    </button>
                  )}
                  {order.status === 'PENGANTARAN' && (
                    <button
                      type="button"
                      onClick={() => updateBreakfastStatus && updateBreakfastStatus(order.id, 'SELESAI')}
                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                    >
                      Tandai Selesai
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
        <span>Total Porsi Hari Ini: <strong className="text-rose-700 font-bold">{cateringStats.totalPortions} Porsi</strong></span>
        <button
          type="button"
          onClick={() => setActiveTab('pesananSarapan')}
          className="text-rose-700 dark:text-rose-400 font-bold hover:underline"
        >
          Buka Jadwal Dapur Lengkap →
        </button>
      </div>
    </motion.div>
  );
}
