import React, { useState, useMemo } from 'react';
import { useAppContext } from '../store';
import { Transaction, Room } from '../types';
import { getRealTodayDate, formatIndonesianDate, addDaysToDateStr } from '../lib/utils';
import { useBodyScrollLock } from '../lib/scrollLock';

interface AgendaListModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'CHECKIN' | 'CHECKOUT';
}

interface ConsolidatedAgendaItem {
  id: string;
  isGroup: boolean;
  groupId?: string;
  groupName: string;
  category: string;
  kloter?: string;
  transactions: Transaction[];
  roomNumbers: string[];
  roomIds: string[];
  building: string;
  duration: number;
  startDate: string;
  phone: string;
  picName: string;
}

export function AgendaListModal({ isOpen, onClose, type }: AgendaListModalProps) {
  const { transactions, rooms, openModal, batchCheckinGroup, batchCheckoutGroup } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'GROUP' | 'INDIVIDUAL'>('ALL');
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  useBodyScrollLock(isOpen);

  const realToday = getRealTodayDate();
  const isCheckin = type === 'CHECKIN';

  // Raw list based on type
  const rawList = useMemo(() => {
    if (isCheckin) {
      return transactions.filter(tx => {
        return tx.building !== 'Ruang Pertemuan' && tx.status === 'BOOKED' && tx.startDate === realToday;
      });
    } else {
      return transactions.filter(tx => {
        if (tx.status !== 'TERISI') return false;
        const checkoutDate = addDaysToDateStr(tx.startDate, tx.duration);
        return checkoutDate === realToday || checkoutDate < realToday;
      });
    }
  }, [transactions, isCheckin, realToday]);

  // Consolidate groups
  const consolidatedList: ConsolidatedAgendaItem[] = useMemo(() => {
    const groupMap = new Map<string, Transaction[]>();
    const individuals: Transaction[] = [];

    rawList.forEach(tx => {
      let groupKey: string | null = null;
      if (tx.groupId) {
        groupKey = tx.groupId;
      } else if (tx.kloter && tx.kloter !== '-') {
        groupKey = `KLOTER-${tx.kloter}`;
      } else if (
        tx.guestName &&
        (tx.guestName.toLowerCase().includes('rombongan') || 
         tx.guestName.toLowerCase().includes('kloter'))
      ) {
        groupKey = `NAME-${(tx.guestName || '').trim().toLowerCase()}-${tx.startDate}`;
      }

      if (groupKey) {
        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, []);
        }
        groupMap.get(groupKey)!.push(tx);
      } else {
        individuals.push(tx);
      }
    });

    const items: ConsolidatedAgendaItem[] = [];

    // Group items
    groupMap.forEach((txList, key) => {
      const first = txList[0];
      const gName = first.groupName || (first.kloter && first.kloter !== '-' ? `Kloter ${first.kloter} (Haji)` : first.guestName);
      items.push({
        id: key,
        isGroup: true,
        groupId: first.groupId || key,
        groupName: gName,
        category: first.category,
        kloter: first.kloter,
        transactions: txList,
        roomNumbers: txList.map(t => t.roomNumber || '').filter(Boolean).sort(),
        roomIds: txList.map(t => t.roomId),
        building: txList.map(t => t.building).filter((v, i, a) => a.indexOf(v) === i).join(', '),
        duration: first.duration,
        startDate: first.startDate,
        phone: first.phone || '-',
        picName: first.guestName
      });
    });

    // Individual items
    individuals.forEach(tx => {
      items.push({
        id: tx.id,
        isGroup: false,
        groupName: tx.guestName,
        category: tx.category,
        kloter: tx.kloter,
        transactions: [tx],
        roomNumbers: [tx.roomNumber],
        roomIds: [tx.roomId],
        building: tx.building,
        duration: tx.duration,
        startDate: tx.startDate,
        phone: tx.phone || '-',
        picName: tx.guestName
      });
    });

    return items;
  }, [rawList]);

  // Filtered list
  const filteredList = useMemo(() => {
    return consolidatedList.filter(item => {
      if (filterMode === 'GROUP' && !item.isGroup) return false;
      if (filterMode === 'INDIVIDUAL' && item.isGroup) return false;

      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const matchName = item.groupName.toLowerCase().includes(term);
      const matchRoom = item.roomNumbers.some(rn => rn.toLowerCase().includes(term));
      const matchPic = item.picName.toLowerCase().includes(term);
      const matchBuilding = item.building.toLowerCase().includes(term);
      return matchName || matchRoom || matchPic || matchBuilding;
    });
  }, [consolidatedList, filterMode, searchTerm]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`p-4 sm:p-5 border-b flex items-center justify-between ${isCheckin ? 'bg-emerald-700 text-white' : 'bg-blue-700 text-white'}`}>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-lg">
              <i className={`fa-solid ${isCheckin ? 'fa-door-open' : 'fa-right-from-bracket'}`}></i>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight">
                  {isCheckin ? 'Daftar Agenda Check-In Hari Ini' : 'Daftar Agenda Check-Out Hari Ini'}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-white/20">
                  {rawList.length} Kamar
                </span>
              </div>
              <p className="text-xs text-white/80">
                {formatIndonesianDate(realToday)} • {consolidatedList.length} Entitas ({consolidatedList.filter(i => i.isGroup).length} Rombongan, {consolidatedList.filter(i => !i.isGroup).length} Perseorangan)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Toolbar: Search and Filter Tabs */}
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="relative w-full sm:w-72">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Cari nama tamu, rombongan, atau no. kamar..."
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-hajj-600 focus:border-hajj-600 font-medium"
            />
          </div>

          <div className="inline-flex bg-slate-200/80 p-0.5 rounded-lg text-xs font-semibold self-stretch sm:self-auto justify-center">
            <button
              type="button"
              onClick={() => setFilterMode('ALL')}
              className={`px-3 py-1 rounded-md transition cursor-pointer ${filterMode === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Semua ({consolidatedList.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('GROUP')}
              className={`px-3 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${filterMode === 'GROUP' ? 'bg-white text-emerald-800 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <span>👥 Rombongan</span>
              <span className="text-[10px] px-1 py-0.2 rounded-full bg-slate-100">{consolidatedList.filter(i => i.isGroup).length}</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('INDIVIDUAL')}
              className={`px-3 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${filterMode === 'INDIVIDUAL' ? 'bg-white text-blue-800 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <span>👤 Perseorangan</span>
              <span className="text-[10px] px-1 py-0.2 rounded-full bg-slate-100">{consolidatedList.filter(i => !i.isGroup).length}</span>
            </button>
          </div>
        </div>

        {/* List Content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3 custom-scrollbar">
          {filteredList.length === 0 ? (
            <div className="p-10 text-center text-slate-400 space-y-2">
              <i className={`fa-solid ${isCheckin ? 'fa-door-closed' : 'fa-bed'} text-4xl text-slate-300`}></i>
              <p className="text-sm font-semibold text-slate-600">
                {searchTerm 
                  ? 'Tidak ada agenda yang cocok dengan pencarian Anda.' 
                  : isCheckin 
                    ? 'Tidak ada jadwal check-in kamar baru untuk hari ini.' 
                    : 'Tidak ada jadwal check-out untuk hari ini.'}
              </p>
              <p className="text-xs text-slate-400">
                {isCheckin ? 'Semua reservasi telah check-in atau belum jatuh tempo.' : 'Seluruh tamu aktif menginap masih dalam masa sewa.'}
              </p>
            </div>
          ) : (
            filteredList.map(item => {
              const isExpanded = expandedGroupId === item.id;
              const firstTx = item.transactions[0];
              const targetRoom = rooms.find(r => r.id === firstTx?.roomId);

              return (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-xl border transition shadow-2xs ${
                    item.isGroup 
                      ? 'border-emerald-200 bg-emerald-50/30 hover:border-emerald-300' 
                      : 'border-slate-200 bg-white hover:border-blue-300'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        {item.isGroup ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-600 text-white flex items-center space-x-1">
                            <i className="fa-solid fa-users text-[9px]"></i>
                            <span>Rombongan ({item.roomNumbers.length} Kamar)</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-200">
                            Perseorangan
                          </span>
                        )}

                        <span className="text-xs font-bold text-slate-500">
                          {item.building}
                        </span>
                      </div>

                      <h4 className="font-bold text-sm text-slate-900 truncate">
                        {item.groupName}
                      </h4>

                      <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <div>
                          <i className="fa-solid fa-user-tie text-slate-400 mr-1"></i>
                          <span>PIC: <strong>{item.picName}</strong> ({item.phone})</span>
                        </div>
                        <div>
                          <i className="fa-regular fa-calendar text-slate-400 mr-1"></i>
                          <span>{item.startDate} ({item.duration} Malam)</span>
                        </div>
                      </div>

                      {/* Room numbers display */}
                      <div className="pt-1 flex flex-wrap items-center gap-1">
                        <span className="text-[11px] font-semibold text-slate-600 mr-1">Kamar:</span>
                        {item.roomNumbers.map(rn => (
                          <span key={rn} className="px-1.5 py-0.5 rounded bg-white text-slate-800 border border-slate-200 text-[10px] font-bold font-mono">
                            {rn}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 shrink-0 self-end sm:self-center">
                      {item.isGroup ? (
                        <>
                          {isCheckin ? (
                            <button
                              type="button"
                              onClick={() => {
                                batchCheckinGroup(item.groupId || item.id);
                              }}
                              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shadow-2xs cursor-pointer"
                              title={`Check-In langsung 1 klik untuk seluruh ${item.roomNumbers.length} kamar`}
                            >
                              <i className="fa-solid fa-bolt text-amber-300"></i>
                              <span>Batch Check-In ({item.roomNumbers.length})</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                batchCheckoutGroup(item.groupId || item.id);
                              }}
                              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shadow-2xs cursor-pointer"
                              title={`Check-Out langsung 1 klik untuk seluruh ${item.roomNumbers.length} kamar`}
                            >
                              <i className="fa-solid fa-right-from-bracket text-blue-200"></i>
                              <span>Batch Check-Out ({item.roomNumbers.length})</span>
                            </button>
                          )}

                          {firstTx?.paymentStatus === 'LUNAS' ? (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                openModal('modalKwitansi', { transaction: firstTx, room: targetRoom });
                              }}
                              className="px-2.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-2xs cursor-pointer"
                              title="Buka dan unduh kwitansi resmi rombongan (Lunas)"
                            >
                              <i className="fa-solid fa-receipt text-gold-300"></i>
                              <span>Kwitansi</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                openModal('modalInvoice', { transaction: firstTx, room: targetRoom });
                              }}
                              className="px-2.5 py-2 bg-slate-900 hover:bg-hajj-800 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-2xs cursor-pointer"
                              title="Buka dan cetak invoice resmi rombongan"
                            >
                              <i className="fa-solid fa-file-invoice text-gold-400"></i>
                              <span>Invoice</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setExpandedGroupId(isExpanded ? null : item.id)}
                            className="px-2.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition cursor-pointer"
                            title="Tampilkan rincian kamar individu"
                          >
                            <i className={`fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                          </button>
                        </>
                      ) : (
                        <>
                          {isCheckin ? (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                openModal('modalRoomDetail', { roomId: item.roomIds[0] });
                              }}
                              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-2xs cursor-pointer"
                            >
                              <i className="fa-solid fa-door-open"></i>
                              <span>Check-In</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                openModal('modalCheckoutSelection', { roomId: item.roomIds[0], type: 'CHECKOUT' });
                              }}
                              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-2xs cursor-pointer"
                            >
                              <i className="fa-solid fa-right-from-bracket"></i>
                              <span>Check-Out</span>
                            </button>
                          )}

                          {firstTx?.paymentStatus === 'LUNAS' ? (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                openModal('modalKwitansi', { transaction: firstTx, room: targetRoom });
                              }}
                              className="px-2.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-2xs cursor-pointer"
                              title="Buka dan cetak kwitansi resmi (Lunas)"
                            >
                              <i className="fa-solid fa-receipt text-gold-300"></i>
                              <span>Kwitansi</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                openModal('modalInvoice', { transaction: firstTx, room: targetRoom });
                              }}
                              className="px-2.5 py-2 bg-slate-900 hover:bg-hajj-800 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-2xs cursor-pointer"
                              title="Buka dan cetak invoice resmi"
                            >
                              <i className="fa-solid fa-file-invoice text-gold-400"></i>
                              <span>Invoice</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expanded Individual Rooms List for Group */}
                  {item.isGroup && isExpanded && (
                    <div className="mt-3 pt-3 border-t border-emerald-200/80 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {item.transactions.map(tx => {
                        const r = rooms.find(room => room.id === tx.roomId);
                        return (
                          <div key={tx.id} className="p-2 bg-white rounded-lg border border-slate-200 flex items-center justify-between text-xs">
                            <div>
                              <div className="font-bold text-slate-800">Kamar {tx.roomNumber} ({tx.building})</div>
                              <div className="text-[10px] text-slate-500">
                                Status: <span className="font-semibold text-emerald-700">{tx.status}</span> • {tx.duration} Malam
                              </div>
                            </div>
                            <div className="flex items-center space-x-1">
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  openModal('modalRoomDetail', { roomId: tx.roomId });
                                }}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-bold cursor-pointer"
                              >
                                Detail
                              </button>
                              {tx.paymentStatus === 'LUNAS' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose();
                                    openModal('modalKwitansi', { transaction: tx, room: r });
                                  }}
                                  className="px-2 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[10px] font-bold cursor-pointer"
                                  title="Kwitansi Lunas"
                                >
                                  Kwt
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose();
                                    openModal('modalInvoice', { transaction: tx, room: r });
                                  }}
                                  className="px-2 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded text-[10px] font-bold cursor-pointer"
                                  title="Invoice"
                                >
                                  Inv
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <i className="fa-solid fa-circle-info text-blue-500"></i>
            <span>Gunakan tombol <strong>Batch</strong> untuk memproses rombongan sekaligus dalam 1 klik.</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-lg text-xs transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
