import React, { useState } from 'react';
import { Room } from '../../types';

interface GroupItem {
  id: string;
  groupName: string;
  groupType: 'JEMAAH_HAJI' | 'UMUM' | 'INSTANSI';
  picName: string;
  picPhone: string;
  roomNumbers: string[];
  meetingRooms: string[];
  startDate: string;
  duration: number;
  transactions: any[];
  roomIds: string[];
  breakfast?: boolean;
  extraBed?: boolean;
  memberCount?: number;
}

interface GroupManagementSectionProps {
  allGroups: GroupItem[];
  filteredGroups: GroupItem[];
  groupTabFilter: 'ALL' | 'JEMAAH_HAJI' | 'UMUM' | 'INSTANSI';
  setGroupTabFilter: (tab: 'ALL' | 'JEMAAH_HAJI' | 'UMUM' | 'INSTANSI') => void;
  groupSortBy: 'DATE' | 'ROOMS' | 'NAME';
  setGroupSortBy: (sort: 'DATE' | 'ROOMS' | 'NAME') => void;
  groupSearchQuery: string;
  setGroupSearchQuery: (q: string) => void;
  hajiGroupsCount: number;
  umumGroupsCount: number;
  instansiGroupsCount: number;
  totalGroupRooms: number;
  rooms: Room[];
  openModal: (modal: string, data?: any) => void;
  batchCheckinGroup: (groupId: string) => void;
  batchCheckoutGroup: (groupId: string) => void;
  batchCancelGroup?: (groupId: string, reason?: string) => void;
}

export function GroupManagementSection({
  allGroups,
  filteredGroups,
  groupTabFilter,
  setGroupTabFilter,
  groupSortBy,
  setGroupSortBy,
  groupSearchQuery,
  setGroupSearchQuery,
  hajiGroupsCount,
  umumGroupsCount,
  instansiGroupsCount,
  totalGroupRooms,
  rooms,
  openModal,
  batchCheckinGroup,
  batchCheckoutGroup,
  batchCancelGroup,
}: GroupManagementSectionProps) {
  // Interactive menu accordion: track which group(s) are expanded
  // By default, open the first group for quick access
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(
    filteredGroups.length > 0 ? filteredGroups[0].id : null
  );

  const toggleGroupExpand = (id: string) => {
    setExpandedGroupId(prev => (prev === id ? null : id));
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-xs p-4 sm:p-5 h-full flex flex-col justify-between space-y-4">
      <div className="space-y-4">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/90 pb-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-hajj-700 dark:text-gold-400 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold text-base shrink-0">
              <i className="fa-solid fa-users-rectangle"></i>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                  Registrasi & Data Rombongan
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  ({allGroups.length} Grup)
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                Alokasi kolektif kamar Jemaah Haji, Tamu Umum, & Instansi Kedinasan.
              </p>
            </div>
          </div>

          {/* Primary Action Button */}
          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => openModal('modalGroupRegistration')}
              className="px-3 py-1.5 bg-hajj-700 hover:bg-hajj-800 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-2xs cursor-pointer whitespace-nowrap"
            >
              <i className="fa-solid fa-plus text-xs"></i>
              <span>Daftar Rombongan</span>
            </button>
          </div>
        </div>

        {/* Filter, Search & Sort Toolbar - Fully Wrapped with Zero Horizontal Scroll */}
        <div className="space-y-2.5">
          {/* Category Tabs: Flex-wrap, never overflow horizontally */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg border border-slate-200 dark:border-slate-700/80 text-xs font-medium">
            <button
              type="button"
              onClick={() => setGroupTabFilter('ALL')}
              className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                groupTabFilter === 'ALL'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Semua ({allGroups.length})
            </button>
            <button
              type="button"
              onClick={() => setGroupTabFilter('JEMAAH_HAJI')}
              className={`px-2.5 py-1 rounded-md transition flex items-center space-x-1.5 cursor-pointer ${
                groupTabFilter === 'JEMAAH_HAJI'
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
              <span>Haji ({hajiGroupsCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setGroupTabFilter('UMUM')}
              className={`px-2.5 py-1 rounded-md transition flex items-center space-x-1.5 cursor-pointer ${
                groupTabFilter === 'UMUM'
                  ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-2xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
              <span>Umum ({umumGroupsCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setGroupTabFilter('INSTANSI')}
              className={`px-2.5 py-1 rounded-md transition flex items-center space-x-1.5 cursor-pointer ${
                groupTabFilter === 'INSTANSI'
                  ? 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-400 shadow-2xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
              <span>Instansi ({instansiGroupsCount})</span>
            </button>
          </div>

          {/* Search Input & Sort Dropdown */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
              <input
                type="text"
                value={groupSearchQuery}
                onChange={(e) => setGroupSearchQuery(e.target.value)}
                placeholder="Cari rombongan/PIC..."
                className="w-full pl-7 pr-7 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-xs placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-hajj-600 text-slate-800 dark:text-slate-200"
              />
              {groupSearchQuery && (
                <button 
                  type="button"
                  onClick={() => setGroupSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              )}
            </div>

            <select
              value={groupSortBy}
              onChange={(e) => setGroupSortBy(e.target.value as any)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-2.5 text-xs text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer shrink-0"
            >
              <option value="DATE">Tanggal</option>
              <option value="ROOMS">Kamar</option>
              <option value="NAME">Nama</option>
            </select>
          </div>
        </div>

        {/* Empty State */}
        {filteredGroups.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-3 my-2">
            <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center text-lg">
              <i className="fa-solid fa-users-slash"></i>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {groupSearchQuery ? `Tidak ada rombongan dengan kata kunci "${groupSearchQuery}"` : 'Belum Ada Data Rombongan'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Daftarkan rombongan kloter haji, instansi kedinasan, atau kelompok umum untuk reservasi massal.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openModal('modalGroupRegistration')}
              className="px-3.5 py-1.5 bg-hajj-700 hover:bg-hajj-800 text-white text-xs font-semibold rounded-lg shadow-2xs transition cursor-pointer inline-flex items-center gap-1.5"
            >
              <i className="fa-solid fa-plus text-xs"></i>
              <span>Daftarkan Rombongan Sekarang</span>
            </button>
          </div>
        ) : (
          /* MENU KECIL INTERAKTIF: CLICKABLE LIST WITH EXPANDABLE DETAIL DRAWER */
          <div className="space-y-2 max-h-[460px] overflow-y-auto pr-0.5 custom-scrollbar">
            {filteredGroups.map(group => {
              const isHaji = group.groupType === 'JEMAAH_HAJI';
              const isInstansi = group.groupType === 'INSTANSI';
              const typeLabel = isHaji ? 'Jemaah Haji' : isInstansi ? 'Instansi Dinas' : 'Tamu Umum';
              const typeBadgeClass = isHaji 
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800'
                : isInstansi
                ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200/80 dark:border-purple-800'
                : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200/80 dark:border-blue-800';

              const bookedCount = group.transactions.filter(t => t.status === 'BOOKED' && t.building !== 'Ruang Pertemuan').length;
              const terisiCount = group.transactions.filter(t => t.status === 'TERISI' && t.building !== 'Ruang Pertemuan').length;
              const batalCount = group.transactions.filter(t => t.status === 'DIBATALKAN').length;
              const isAllCancelled = batalCount > 0 && terisiCount === 0 && bookedCount === 0;

              const targetTx = group.transactions[0];
              const targetRoom = rooms.find(r => r.id === targetTx?.roomId);
              const isExpanded = expandedGroupId === group.id;

              return (
                <div 
                  key={group.id}
                  className={`rounded-xl border transition-all ${
                    isAllCancelled
                      ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200/80 dark:border-rose-900/50 opacity-80'
                      : isExpanded 
                      ? 'bg-white dark:bg-slate-800/90 border-slate-300 dark:border-slate-600 shadow-xs' 
                      : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-100/70 dark:hover:bg-slate-800'
                  }`}
                >
                  {/* Clickable Header Row: Menu Kecil Jadi Tinggal Klik */}
                  <div 
                    onClick={() => toggleGroupExpand(group.id)}
                    className="p-3 flex items-center justify-between gap-2.5 cursor-pointer select-none"
                    title="Klik untuk membuka/menutup aksi dan rincian rombongan"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                      {/* Category Icon Badge */}
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold border shrink-0 ${
                        isAllCancelled
                          ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                          : typeBadgeClass
                      }`}>
                        <i className={`fa-solid ${isAllCancelled ? 'fa-ban' : isHaji ? 'fa-kaaba' : isInstansi ? 'fa-building-columns' : 'fa-users'}`}></i>
                      </div>

                      {/* Group Name & Sub-meta */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h4 className={`font-bold text-xs sm:text-sm truncate ${isAllCancelled ? 'text-slate-600 dark:text-slate-400 line-through' : 'text-slate-900 dark:text-slate-100'}`}>
                            {group.groupName}
                          </h4>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold border shrink-0 hidden xs:inline-block ${
                            isAllCancelled
                              ? 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900 dark:text-rose-200'
                              : typeBadgeClass
                          }`}>
                            {isAllCancelled ? 'Dibatalkan' : typeLabel}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          <span>PIC: <strong>{group.picName || '-'}</strong></span>
                          <span>·</span>
                          <span className="font-mono">{group.picPhone || '-'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right Meta: Room Count + Occupancy Status + Chevron */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                          {group.roomNumbers.length} Kamar
                        </div>
                        <div className="text-[10px]">
                          {terisiCount > 0 && bookedCount === 0 && (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Semua Masuk</span>
                          )}
                          {bookedCount > 0 && terisiCount === 0 && (
                            <span className="text-blue-600 dark:text-blue-400 font-semibold">Terjadwal</span>
                          )}
                          {bookedCount > 0 && terisiCount > 0 && (
                            <span className="text-amber-600 dark:text-amber-400 font-semibold">{terisiCount} Masuk · {bookedCount} Tunggu</span>
                          )}
                          {isAllCancelled && (
                            <span className="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1 justify-end">
                              <i className="fa-solid fa-ban text-[9px]"></i>
                              <span>Batal ({batalCount})</span>
                            </span>
                          )}
                          {!isAllCancelled && bookedCount === 0 && terisiCount === 0 && (
                            <span className="text-slate-400">Selesai</span>
                          )}
                        </div>
                      </div>

                      {/* Expand Chevron Icon */}
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 transition-transform ${isExpanded ? 'rotate-180 text-hajj-700 dark:text-gold-400' : ''}`}>
                        <i className="fa-solid fa-chevron-down text-xs"></i>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Detail & Action Drawer: Opened on Click */}
                  {isExpanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-700/80 space-y-3 animate-fadeIn">
                      {/* Cancellation Alert Banner */}
                      {isAllCancelled && (
                        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg p-2.5 flex items-center gap-2 text-rose-800 dark:text-rose-200 text-xs">
                          <i className="fa-solid fa-circle-exclamation text-rose-600 text-sm shrink-0"></i>
                          <span>Seluruh reservasi rombongan ini telah berstatus <strong>DIBATALKAN</strong>. Kamar telah dibebaskan kembali dan data tetap tersimpan dalam laporan serta audit log sistem.</span>
                        </div>
                      )}

                      {/* Meta Grid: Dates, Members & Notes */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-800">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-slate-500 dark:text-slate-400">Jadwal Menginap:</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {group.startDate} ({group.duration} Hari)
                            </span>
                          </div>
                          <div className="flex justify-between text-[11px]">
                            <span className="text-slate-500 dark:text-slate-400">Perkiraan Tamu:</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              ~{group.memberCount || group.roomNumbers.length * 2} Orang
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-slate-500 dark:text-slate-400">Fasilitas Tambahan:</span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {[
                                group.breakfast ? 'Sarapan' : null,
                                group.extraBed ? 'Extra Bed' : null,
                                group.meetingRooms.length > 0 ? `${group.meetingRooms.length} Aula` : null,
                              ].filter(Boolean).join(', ') || 'Standar Kamar'}
                            </span>
                          </div>
                          <div className="flex justify-between text-[11px]">
                            <span className="text-slate-500 dark:text-slate-400">Status Alokasi:</span>
                            <span className="font-semibold">
                              {isAllCancelled 
                                ? `${batalCount} Dibatalkan`
                                : `${terisiCount} Check-In · ${bookedCount} Reservasi`}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Allocated Room Pills (Wrap cleanly without horizontal scroll) */}
                      <div>
                        <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                          <span>Kamar yang Dialokasikan ({group.roomNumbers.length}):</span>
                          {group.meetingRooms.length > 0 && (
                            <span className="text-purple-600 dark:text-purple-400 text-[10px]">
                              Aula: {group.meetingRooms.join(', ')}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto custom-scrollbar p-1 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                          {group.roomNumbers.map(rn => (
                            <span 
                              key={rn}
                              className={`px-2 py-0.5 rounded text-[10.5px] font-mono font-semibold border ${
                                isAllCancelled
                                  ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {rn}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Direct One-Click Batch Actions */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {bookedCount > 0 && (
                          <button
                            type="button"
                            onClick={() => batchCheckinGroup(group.id)}
                            className="flex-1 min-w-[120px] py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                            title="Check-In seluruh kamar rombongan"
                          >
                            <i className="fa-solid fa-check text-[11px]"></i>
                            <span>Check-In ({bookedCount})</span>
                          </button>
                        )}
                        {terisiCount > 0 && (
                          <button
                            type="button"
                            onClick={() => batchCheckoutGroup(group.id)}
                            className="flex-1 min-w-[120px] py-1.5 px-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                            title="Check-Out seluruh kamar rombongan"
                          >
                            <i className="fa-solid fa-right-from-bracket text-[11px]"></i>
                            <span>Check-Out ({terisiCount})</span>
                          </button>
                        )}
                        {bookedCount > 0 && batchCancelGroup && (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Batalkan seluruh reservasi untuk rombongan "${group.groupName}" (${bookedCount} kamar)? Status akan diubah menjadi DIBATALKAN dan tetap tercatat di laporan.`)) {
                                batchCancelGroup(group.id, 'Dibatalkan oleh Pengguna');
                              }
                            }}
                            className="py-1.5 px-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                            title="Batalkan reservasi booking rombongan ini"
                          >
                            <i className="fa-solid fa-ban text-xs"></i>
                            <span>Batal Rombongan</span>
                          </button>
                        )}
                        {targetTx && targetTx.paymentStatus !== 'LUNAS' && (
                          <button
                            type="button"
                            onClick={() => openModal('modalInvoice', { transaction: targetTx, room: targetRoom })}
                            className="py-1.5 px-3 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                            title="Cetak Nota / Invoice"
                          >
                            <i className="fa-solid fa-file-invoice text-xs"></i>
                            <span>Nota / Invoice</span>
                          </button>
                        )}
                        {targetTx && (targetTx.paymentStatus === 'LUNAS' || targetTx.paymentStatus === 'DP' || (targetTx.dpAmount && targetTx.dpAmount > 0)) && (
                          <button
                            type="button"
                            onClick={() => openModal('modalKwitansi', { transaction: targetTx, room: targetRoom })}
                            className={`py-1.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                              targetTx.paymentStatus === 'LUNAS' 
                                ? 'bg-emerald-700 hover:bg-emerald-800 text-white' 
                                : 'bg-amber-600 hover:bg-amber-700 text-white'
                            }`}
                            title={targetTx.paymentStatus === 'LUNAS' ? "Buka Kwitansi Pelunasan Resmi" : "Buka Kwitansi Tanda Terima DP"}
                          >
                            <i className="fa-solid fa-receipt text-xs text-gold-300"></i>
                            <span>{targetTx.paymentStatus === 'LUNAS' ? 'Kwitansi (Lunas)' : 'Kwitansi (DP)'}</span>
                          </button>
                        )}
                        {group.roomIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => openModal('modalRoomDetail', { roomId: group.roomIds[0] })}
                            className="py-1.5 px-3 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                            title="Lihat Rincian Kamar"
                          >
                            <i className="fa-solid fa-eye text-xs"></i>
                            <span>Detail</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Ringkasan */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span>Total: <strong className="text-slate-700 dark:text-slate-200">{allGroups.length} Rombongan</strong></span>
          <span aria-hidden="true">·</span>
          <span>Alokasi: <strong className="text-slate-700 dark:text-slate-200 font-mono">{totalGroupRooms} Kamar</strong></span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Haji: {hajiGroupsCount}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            <span>Umum: {umumGroupsCount}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
            <span>Instansi: {instansiGroupsCount}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
