// @ts-nocheck
import { useState, useEffect, useMemo } from 'react';
import { useAppContext, isQcRole } from '../store';
import { Room, MeetingRoom, Building } from '../types';
import { compareBuildingOrder, formatRupiah, isMeetingFacility, getRoomBuildingKey, resolveRoomBuildingName, isRoomMatchingBuilding, extractFloorFromRoomNumber } from '../lib/utils';
import { OFFICIAL_TARIFFS } from '../data';

// Helper for distinctive building-related icons for penginapan and other facilities (synchronized with RoomsView)
const PENGINAPAN_ICONS = [
  'fa-hotel',
  'fa-city',
  'fa-building-columns',
  'fa-building-user',
  'fa-house-chimney-window',
  'fa-building-shield',
  'fa-building-flag',
  'fa-tower-observation',
  'fa-archway',
  'fa-landmark-dome'
];

function getBuildingIcon(bName: string, category?: string): string {
  const norm = bName.toLowerCase();
  if (category === 'SERBAGUNA' || norm.includes('serbaguna') || norm.includes('sg-') || norm.includes('(sg)')) {
    return 'fa-layer-group';
  }
  if (category === 'RUANG_PERTEMUAN' || norm.includes('ruang pertemuan') || norm.includes('aula') || norm.includes('auditorium')) {
    return 'fa-landmark';
  }
  if (norm.includes('arafah')) return 'fa-kaaba';
  if (norm.includes('muzdalifah')) return 'fa-mosque';
  if (norm.includes('mina')) return 'fa-tents';
  if (norm.includes('madinah')) return 'fa-archway';
  if (norm.includes('sekretariat') || norm.includes('kantor')) return 'fa-building-columns';
  
  let hash = 0;
  for (let i = 0; i < bName.length; i++) {
    hash = (hash * 31 + bName.charCodeAt(i)) >>> 0;
  }
  return PENGINAPAN_ICONS[hash % PENGINAPAN_ICONS.length];
}

function getBuildingColorClass(bName: string, category?: string): { bg: string; text: string; border: string } {
  const norm = bName.toLowerCase();
  if (category === 'SERBAGUNA' || norm.includes('serbaguna') || norm.includes('sg-')) {
    return { bg: 'bg-amber-600 text-white', text: 'text-amber-800', border: 'border-amber-700' };
  }
  if (category === 'RUANG_PERTEMUAN' || norm.includes('ruang pertemuan') || norm.includes('aula')) {
    return { bg: 'bg-purple-700 text-white', text: 'text-purple-800', border: 'border-purple-800' };
  }
  if (norm.includes('arafah')) return { bg: 'bg-emerald-800 text-emerald-100', text: 'text-emerald-800', border: 'border-emerald-700' };
  if (norm.includes('muzdalifah')) return { bg: 'bg-blue-800 text-blue-100', text: 'text-blue-800', border: 'border-blue-700' };
  if (norm.includes('mina')) return { bg: 'bg-teal-800 text-teal-100', text: 'text-teal-800', border: 'border-teal-700' };
  if (norm.includes('madinah')) return { bg: 'bg-amber-800 text-amber-100', text: 'text-amber-800', border: 'border-amber-700' };
  
  const palette = [
    { bg: 'bg-indigo-800 text-indigo-100', text: 'text-indigo-800', border: 'border-indigo-700' },
    { bg: 'bg-cyan-800 text-cyan-100', text: 'text-cyan-800', border: 'border-cyan-700' },
    { bg: 'bg-rose-800 text-rose-100', text: 'text-rose-800', border: 'border-rose-700' },
    { bg: 'bg-emerald-700 text-emerald-100', text: 'text-emerald-700', border: 'border-emerald-600' },
    { bg: 'bg-violet-800 text-violet-100', text: 'text-violet-800', border: 'border-violet-700' },
  ];
  let hash = 0;
  for (let i = 0; i < bName.length; i++) {
    hash = (hash * 31 + bName.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}

export function QualityControlView() {
  const { 
    rooms, qcInspections = [], currentUser, openModal, setActiveTab, selectedBuilding, setSelectedBuilding, 
    buildings = [], meetingRooms = [], showToast 
  } = useAppContext();

  const [bFilter, setBFilter] = useState('ALL');
  const [qcFilter, setQcFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'ROOMS' | 'HISTORY'>('ROOMS');
  const [buildingFloorFilters, setBuildingFloorFilters] = useState<Record<string, number | 'ALL'>>({});
  const [activeBuildingName, setActiveBuildingName] = useState<string>('');

  const canInspect = isQcRole(currentUser?.role);

  // Tangani filter langsung jika datang dari Dashboard atau Denah Gedung
  useEffect(() => {
    if (selectedBuilding) {
      let targetBldg = selectedBuilding;
      if (targetBldg === 'Ruang Pertemuan') targetBldg = 'Ruang Pertemuan / Aula';
      if (targetBldg === 'Gedung Serbaguna') targetBldg = 'Gedung Serbaguna (SG)';

      if (targetBldg === 'Ruang Pertemuan / Aula' || targetBldg === 'Gedung Serbaguna (SG)') {
        setBFilter(targetBldg);
      } else {
        setBFilter('ALL');
        setActiveBuildingName(targetBldg);
      }

      const timer = setTimeout(() => {
        const cleanId = `qc-building-section-${targetBldg.replace(/[^a-zA-Z0-9]/g, '-')}`;
        const el = document.getElementById(cleanId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [selectedBuilding]);

  // Master lodging buildings (selaras dengan RoomsView & Katalog Gedung: Gedung A, Gedung B, Gedung C, dst)
  const lodgingBuildings = useMemo(() => {
    return (buildings || [])
      .filter(b => {
        const name = b.name || '';
        const cat = b.category || '';
        if (name === 'Ruang Pertemuan' || name === 'Ruang Pertemuan / Aula' || name === 'Gedung Serbaguna' || name === 'Gedung Serbaguna (SG)') return false;
        if (cat === 'SERBAGUNA' || cat === 'RUANG_PERTEMUAN') return false;
        if (isMeetingFacility(name)) return false;
        return true;
      })
      .slice()
      .sort((a, b) => compareBuildingOrder(a.name, b.name));
  }, [buildings]);

  // Master lodging rooms
  const lodgingRooms = useMemo(() => {
    return rooms.filter(r => {
      const bKey = resolveRoomBuildingName(r, lodgingBuildings, meetingRooms);
      if (isMeetingFacility(bKey)) return false;
      if (r.building === 'Ruang Pertemuan' || r.building === 'Ruang Pertemuan / Aula' || r.building === 'Gedung Serbaguna (SG)') return false;
      return true;
    });
  }, [rooms, lodgingBuildings, meetingRooms]);

  // Filtered rooms for Master-Detail
  const roomsForMasterDetail = useMemo(() => {
    return lodgingRooms.filter(r => {
      const effectiveBuilding = resolveRoomBuildingName(r, lodgingBuildings, meetingRooms);
      if (qcFilter !== 'ALL') {
        const roomQc = r.qcStatus || 'PERLU_INSPEKSI';
        if (roomQc !== qcFilter) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const matchNum = r.roomNumber.toLowerCase().includes(q);
        const matchBld = r.building.toLowerCase().includes(q) || effectiveBuilding.toLowerCase().includes(q);
        const matchNotes = (r.lastQcNotes || '').toLowerCase().includes(q);
        const matchBy = (r.lastQcBy || '').toLowerCase().includes(q);
        if (!matchNum && !matchBld && !matchNotes && !matchBy) return false;
      }
      return true;
    });
  }, [lodgingRooms, lodgingBuildings, meetingRooms, qcFilter, search]);

  const grouped: Record<string, Room[]> = {};
  lodgingBuildings.forEach(b => {
    grouped[b.name] = [];
  });

  roomsForMasterDetail.forEach(r => {
    const matchedBld = lodgingBuildings.find(b => isRoomMatchingBuilding(r, b, meetingRooms));
    if (matchedBld) {
      if (!grouped[matchedBld.name]) grouped[matchedBld.name] = [];
      if (!grouped[matchedBld.name].some(existing => existing.id === r.id)) {
        grouped[matchedBld.name].push({
          ...r,
          building: matchedBld.name
        });
      }
    } else {
      const bKey = getRoomBuildingKey(r, meetingRooms);
      if (bKey && !isMeetingFacility(bKey)) {
        if (!grouped[bKey]) grouped[bKey] = [];
        if (!grouped[bKey].some(existing => existing.id === r.id)) {
          grouped[bKey].push(r);
        }
      }
    }
  });

  const buildingNames = useMemo(() => {
    const list: string[] = [];
    lodgingBuildings.forEach(b => {
      if (search) {
        const q = search.toLowerCase();
        const matchName = b.name.toLowerCase().includes(q);
        const matchCode = b.code?.toLowerCase().includes(q);
        const bRooms = grouped[b.name] || [];
        if (!matchName && !matchCode && bRooms.length === 0 && qcFilter !== 'ALL') return;
      }
      list.push(b.name);
    });
    Object.keys(grouped).forEach(k => {
      if (!list.includes(k) && (grouped[k] || []).length > 0) {
        list.push(k);
      }
    });
    return list.sort(compareBuildingOrder);
  }, [lodgingBuildings, search, grouped, qcFilter]);

  const selectedBuildingKey = useMemo(() => {
    if (
      bFilter !== 'ALL' &&
      bFilter !== 'Gedung Serbaguna (SG)' &&
      bFilter !== 'Gedung Serbaguna' &&
      bFilter !== 'Ruang Pertemuan / Aula' &&
      bFilter !== 'Ruang Pertemuan'
    ) {
      const match = buildingNames.find(b => b.toLowerCase() === bFilter.toLowerCase());
      if (match) return match;
    }
    if (activeBuildingName && buildingNames.includes(activeBuildingName)) {
      return activeBuildingName;
    }
    return buildingNames[0] || '';
  }, [bFilter, activeBuildingName, buildingNames]);

  // Meeting rooms & Serbaguna filtered
  const meetingFacilities = useMemo(() => {
    return (meetingRooms || []).filter(m => {
      const effectiveBuilding = m.building || 'Ruang Pertemuan / Aula';
      const isSG = m.category === 'SERBAGUNA' || effectiveBuilding.includes('Serbaguna');
      if (bFilter === 'Gedung Serbaguna (SG)' && !isSG) return false;
      if (bFilter === 'Ruang Pertemuan / Aula' && isSG) return false;
      if (qcFilter !== 'ALL') {
        const roomQc = m.qcStatus || 'PERLU_INSPEKSI';
        if (roomQc !== qcFilter) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const matchName = m.name.toLowerCase().includes(q);
        const matchBld = effectiveBuilding.toLowerCase().includes(q);
        if (!matchName && !matchBld) return false;
      }
      return true;
    });
  }, [meetingRooms, bFilter, qcFilter, search]);

  // KPI Metrics
  const totalRooms = rooms.length;
  const lolosQcCount = rooms.filter(r => r.qcStatus === 'LOLOS_QC').length;
  const menungguQcCount = rooms.filter(r => r.qcStatus === 'MENUNGGU_QC').length;
  const perluPerbaikanCount = rooms.filter(r => r.qcStatus === 'PERLU_PERBAIKAN').length;
  const perluInspeksiCount = rooms.filter(r => !r.qcStatus || r.qcStatus === 'PERLU_INSPEKSI').length;

  const getQcBadge = (status?: string, compact = true) => {
    switch (status) {
      case 'LOLOS_QC':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <i className="fa-solid fa-circle-check mr-1 text-emerald-600 text-[8px]"></i>
            {compact ? 'Lolos QC' : 'Lolos QC (Siap Pakai)'}
          </span>
        );
      case 'MENUNGGU_QC':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-900 border border-purple-300 animate-pulse">
            <i className="fa-solid fa-bell mr-1 text-purple-600 text-[8px]"></i>
            {compact ? 'Cek QC' : 'Telah Diperbaiki (Cek QC)'}
          </span>
        );
      case 'PERLU_PERBAIKAN':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <i className="fa-solid fa-triangle-exclamation mr-1 text-rose-600 text-[8px]"></i>
            {compact ? 'Perbaikan' : 'Perlu Perbaikan'}
          </span>
        );
      case 'PERLU_INSPEKSI':
      default:
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
            <i className="fa-solid fa-clock-rotate-left mr-1 text-amber-600 text-[8px]"></i>
            {compact ? 'Perlu Cek' : 'Perlu Inspeksi Rutin'}
          </span>
        );
    }
  };

  const renderRoomCard = (room: Room) => {
    const qc = room.qcStatus || 'PERLU_INSPEKSI';
    let cardBorder = 'border-slate-200';
    if (qc === 'LOLOS_QC') cardBorder = 'border-emerald-300 hover:border-emerald-400';
    if (qc === 'MENUNGGU_QC') cardBorder = 'border-purple-300 ring-2 ring-purple-300/70 shadow-xs';
    if (qc === 'PERLU_PERBAIKAN') cardBorder = 'border-rose-200 hover:border-rose-300';
    if (qc === 'PERLU_INSPEKSI') cardBorder = 'border-amber-200 hover:border-amber-300';

    const displayName = `Kamar ${room.roomNumber}`;
    const subTitle = `${room.building} • Hunian`;
    const effectiveStatus = room.status;

    const statusBadge = (
      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold shrink-0 ${
        effectiveStatus === 'TERISI' ? 'bg-rose-600 text-white' :
        effectiveStatus === 'BOOKED' ? 'bg-blue-600 text-white' :
        effectiveStatus === 'MAINTENANCE' ? 'bg-amber-600 text-white' : 'bg-emerald-600 text-white'
      }`}>
        {effectiveStatus}
      </span>
    );

    return (
      <div key={room.id} className={`p-3 rounded-xl border ${cardBorder} shadow-xs flex flex-col justify-between space-y-2 hover:shadow-md transition bg-white dark:bg-slate-800`}>
        <div>
          {qc === 'MENUNGGU_QC' && (
            <div className="mb-2 -mt-0.5 -mx-0.5 px-2 py-0.5 rounded-lg bg-purple-100 text-purple-900 text-[9px] font-bold flex items-center justify-between border border-purple-300">
              <span className="flex items-center">
                <i className="fa-solid fa-bolt mr-1 text-purple-600 text-[8px]"></i> Siap Cek Pasca Teknisi
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-ping"></span>
            </div>
          )}

          <div className="flex items-start justify-between gap-1.5">
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 shrink-0 shadow-2xs">
                <i className="fa-solid fa-bed text-xs text-slate-600 dark:text-slate-300"></i>
              </span>
              <div className="min-w-0 flex-1 flex flex-col justify-center">
                <span className="font-bold text-xs text-slate-900 dark:text-white leading-tight break-words block" title={displayName}>
                  {displayName}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-tight block truncate mt-0.5" title={subTitle}>
                  {subTitle}
                </span>
              </div>
            </div>
            <div className="shrink-0 pt-0.5 flex flex-col items-end space-y-1">
              {statusBadge}
              {getQcBadge(room.qcStatus, true)}
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-700">
            <span className="inline-flex items-center space-x-1 font-medium">
              <i className="fa-solid fa-users text-slate-400 text-[10px]"></i>
              <span>{room.capacity} Orang</span>
            </span>
            <div className="flex items-center space-x-1">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                room.type === 'Superior'
                  ? 'bg-purple-100 text-purple-800 border-purple-300'
                  : room.type === 'Ekonomi'
                  ? 'bg-teal-100 text-teal-800 border-teal-300'
                  : 'bg-blue-100 text-blue-800 border-blue-300'
              }`}>
                {room.type || 'Standar'}
              </span>
              {room.bedType && (
                <span className="text-[9px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600">
                  {room.bedType}
                </span>
              )}
            </div>
          </div>

          {room.pricePerNight && room.pricePerNight > 0 ? (
            <div className="text-[10px] text-right font-mono font-bold text-emerald-700 dark:text-emerald-400 pt-0.5">
              {formatRupiah(room.pricePerNight)} <span className="text-[9px] font-sans text-slate-400 font-normal">/mlm</span>
            </div>
          ) : null}

          {/* QC Audit Details */}
          <div className="mt-2 space-y-1 bg-slate-50 dark:bg-slate-900 p-1.5 rounded-lg border border-slate-100 dark:border-slate-700 text-[10px]">
            {room.lastQcDate && (
              <div className="text-slate-600 dark:text-slate-300 flex items-center justify-between">
                <span className="text-slate-400 text-[9px]">Inspeksi:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200 font-mono text-[9px]">{room.lastQcDate}</span>
              </div>
            )}
            {room.lastQcBy && (
              <div className="text-slate-600 dark:text-slate-300 flex items-center justify-between">
                <span className="text-slate-400 text-[9px]">Pemeriksa:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center text-[9px] truncate max-w-[90px]" title={room.lastQcBy}>
                  <i className="fa-solid fa-user-check text-teal-600 mr-1 text-[8px]"></i>
                  {room.lastQcBy}
                </span>
              </div>
            )}
            {room.lastQcNotes && (
              <div className="text-slate-700 dark:text-slate-300 italic text-[9px] line-clamp-1 pt-0.5 border-t border-slate-200/60 dark:border-slate-700" title={room.lastQcNotes}>
                "{room.lastQcNotes}"
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-700 space-y-1">
          {canInspect ? (
            <button
              type="button"
              onClick={() => openModal('modalQcInspection', { room })}
              className={`w-full py-1.5 font-bold rounded-lg text-[10px] shadow-xs flex items-center justify-center space-x-1.5 transition cursor-pointer ${
                (qc === 'PERLU_INSPEKSI' || qc === 'MENUNGGU_QC')
                  ? 'bg-amber-400 hover:bg-amber-500 text-slate-950 border border-amber-500 font-extrabold shadow-sm ring-1 ring-amber-300'
                  : qc === 'PERLU_PERBAIKAN'
                  ? 'bg-rose-700 hover:bg-rose-800 text-white font-bold'
                  : 'bg-teal-700 hover:bg-teal-800 text-white font-semibold'
              }`}
            >
              <i className={`fa-solid ${
                qc === 'MENUNGGU_QC' ? 'fa-stamp text-slate-950' : 
                qc === 'PERLU_INSPEKSI' ? 'fa-clipboard-check text-slate-950' :
                qc === 'PERLU_PERBAIKAN' ? 'fa-wrench text-white' : 'fa-circle-check text-white'
              } text-[9px]`}></i>
              <span>
                {qc === 'MENUNGGU_QC' ? 'Inspeksi QC (Perlu Cek)' : 
                 qc === 'PERLU_INSPEKSI' ? 'Inspeksi QC (Perlu Cek)' : 
                 qc === 'PERLU_PERBAIKAN' ? 'Re-Inspeksi Teknisi' : 'Inspeksi QC (Lolos)'}
              </span>
            </button>
          ) : (
            <div className="text-center text-[9px] text-slate-400 italic py-0.5">
              <i className="fa-solid fa-lock mr-1 text-slate-300 text-[8px]"></i> Khusus QC
            </div>
          )}

          <div className="flex items-center space-x-1 pt-0.5">
            {qc === 'PERLU_PERBAIKAN' && (
              <button
                type="button"
                onClick={() => openModal('modalMaintenance', { roomId: room.id })}
                className="flex-1 py-1 px-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded text-[9px] font-bold transition flex items-center justify-center space-x-1 cursor-pointer"
                title="Laporkan tiket perbaikan fasilitas"
              >
                <i className="fa-solid fa-plus text-[8px]"></i>
                <span>Tiket</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSelectedBuilding(room.building);
                setActiveTab('gedung');
              }}
              className="flex-1 py-1 px-1 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded text-[9px] font-bold transition flex items-center justify-center space-x-1 cursor-pointer"
              title="Buka lokasi kamar di denah manajemen gedung"
            >
              <i className="fa-solid fa-door-open text-[8px] text-teal-700"></i>
              <span>Denah Gedung</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-emerald-200/80 shadow-xs hover:border-emerald-300 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold text-slate-700">Lolos QC (Siap Huni)</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs sm:text-sm border border-emerald-100">
              <i className="fa-solid fa-circle-check"></i>
            </div>
          </div>
          <div className="flex items-baseline space-x-2 mt-1.5 sm:mt-2">
            <span className="text-xl sm:text-2xl font-black text-slate-900">{lolosQcCount}</span>
            <span className="text-[11px] sm:text-xs font-bold text-emerald-600">{totalRooms > 0 ? Math.round((lolosQcCount / totalRooms) * 100) : 0}%</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-1.5 sm:mt-2 overflow-hidden">
            <div 
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${totalRooms > 0 ? Math.round((lolosQcCount / totalRooms) * 100) : 0}%` }}
            ></div>
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-500 mt-1 sm:mt-1.5 truncate">Standar mutu kamar siap digunakan</p>
        </div>

        <div className="bg-white p-3 sm:p-4 rounded-xl border border-purple-200/90 shadow-xs hover:border-purple-300 transition bg-purple-50/20">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold text-purple-900 flex items-center gap-1.5">
              <span>Perlu Cek QC</span>
              {menungguQcCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-purple-600 animate-ping"></span>
              )}
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center text-xs sm:text-sm border border-purple-200">
              <i className="fa-solid fa-bell"></i>
            </div>
          </div>
          <div className="flex items-baseline space-x-2 mt-1.5 sm:mt-2">
            <span className="text-xl sm:text-2xl font-black text-purple-900">{menungguQcCount}</span>
            <span className="text-[10px] sm:text-[11px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">Prioritas</span>
          </div>
          <div className="w-full bg-purple-100/70 h-1.5 rounded-full mt-1.5 sm:mt-2 overflow-hidden">
            <div 
              className="bg-purple-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${totalRooms > 0 ? Math.min(100, Math.round((menungguQcCount / totalRooms) * 100) * 3) : 0}%` }}
            ></div>
          </div>
          <p className="text-[10px] sm:text-[11px] text-purple-700 mt-1 sm:mt-1.5 font-medium truncate">Menunggu verifikasi pasca teknisi</p>
        </div>

        <div className="bg-white p-3 sm:p-4 rounded-xl border border-rose-200/80 shadow-xs hover:border-rose-300 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold text-slate-700">Perlu Perbaikan</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center text-xs sm:text-sm border border-rose-100">
              <i className="fa-solid fa-wrench"></i>
            </div>
          </div>
          <div className="flex items-baseline space-x-2 mt-1.5 sm:mt-2">
            <span className="text-xl sm:text-2xl font-black text-slate-900">{perluPerbaikanCount}</span>
            <span className="text-[10px] sm:text-[11px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">Teknisi</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-1.5 sm:mt-2 overflow-hidden">
            <div 
              className="bg-rose-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${totalRooms > 0 ? Math.min(100, Math.round((perluPerbaikanCount / totalRooms) * 100) * 3) : 0}%` }}
            ></div>
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-500 mt-1 sm:mt-1.5 truncate">Kendala dalam proses teknisi</p>
        </div>

        <div className="bg-white p-3 sm:p-4 rounded-xl border border-amber-200/80 shadow-xs hover:border-amber-300 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold text-slate-700">Inspeksi Rutin</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-xs sm:text-sm border border-amber-100">
              <i className="fa-solid fa-clipboard-list"></i>
            </div>
          </div>
          <div className="flex items-baseline space-x-2 mt-1.5 sm:mt-2">
            <span className="text-xl sm:text-2xl font-black text-slate-900">{perluInspeksiCount}</span>
            <span className="text-[10px] sm:text-[11px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Rutin</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-1.5 sm:mt-2 overflow-hidden">
            <div 
              className="bg-amber-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${totalRooms > 0 ? Math.round((perluInspeksiCount / totalRooms) * 100) : 0}%` }}
            ></div>
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-500 mt-1 sm:mt-1.5 truncate">Selesai checkout & baru</p>
        </div>
      </div>

      {/* Navigation Sub-Tabs & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveSubTab('ROOMS')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition flex items-center space-x-2 ${
              activeSubTab === 'ROOMS'
                ? 'bg-white text-teal-800 shadow-xs font-black'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <i className="fa-solid fa-door-open"></i>
            <span>Status Kamar & Gedung</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeSubTab === 'ROOMS' ? 'bg-teal-100 text-teal-800' : 'bg-slate-200 text-slate-600'
            }`}>
              {roomsForMasterDetail.length}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('HISTORY')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition flex items-center space-x-2 ${
              activeSubTab === 'HISTORY'
                ? 'bg-white text-teal-800 shadow-xs font-black'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <i className="fa-solid fa-clock-rotate-left"></i>
            <span>Riwayat Log QC</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeSubTab === 'HISTORY' ? 'bg-teal-100 text-teal-800' : 'bg-slate-200 text-slate-600'
            }`}>
              {qcInspections.length}
            </span>
          </button>
        </div>

        {/* Download QC Report Button */}
        <div className="flex items-center space-x-2 self-start sm:self-auto">
          <button
            onClick={() => openModal('modalExport', { 
              defaultType: 'QC', 
              defaultQcMode: activeSubTab === 'ROOMS' ? 'READINESS' : 'HISTORY',
              defaultBuilding: bFilter,
              defaultFormat: 'PDF'
            })}
            className="px-3 py-2 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-xl shadow-xs flex items-center space-x-1.5 transition text-xs cursor-pointer"
            title="Unduh Laporan QC"
          >
            <i className="fa-solid fa-file-arrow-down"></i>
            <span>Unduh Laporan</span>
          </button>
        </div>
      </div>

      {/* SUB-VIEW 1: ROOMS INSPECTION GROUPED BY BUILDING & AULA (MASTER-DETAIL SELARAS MANAJEMEN GEDUNG) */}
      {activeSubTab === 'ROOMS' && (
        <div className="space-y-5">
          {/* Filter & Display Controls Bar - Synchronized with RoomsView */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-xs border border-slate-200 space-y-4">
            {/* Top Row: Title, Summary Count, Search Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-base shrink-0 shadow-2xs border border-teal-200">
                  <i className="fa-solid fa-clipboard-check"></i>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-black text-slate-800 tracking-tight">
                      Denah Kamar &amp; Ruang Pertemuan (Pengecekan QC)
                    </h3>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold border border-slate-200">
                      {roomsForMasterDetail.length} dari {rooms.length} Kamar
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Inspeksi kelayakan hunian, kebersihan, dan kesiapan fasilitas per gedung sebelum ditempati jemaah.
                  </p>
                </div>
              </div>

              {/* Right Side: Search Box */}
              <div className="flex items-center gap-2 w-full lg:w-auto shrink-0">
                <div className="relative flex-1 sm:w-72">
                  <input 
                    type="text" 
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Cari No Kamar / Nama Aula..." 
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 pl-8 pr-7 focus:ring-2 focus:ring-teal-600 focus:bg-white outline-none font-medium text-slate-900 transition" 
                  />
                  <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-3 text-slate-400 text-xs"></i>
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs cursor-pointer p-0.5"
                      title="Hapus pencarian"
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Middle Row: Quick Status Filters (1-Click Pill Buttons) */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 hidden sm:inline">Status QC:</span>
                <button
                  type="button"
                  onClick={() => setQcFilter('ALL')}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1.5 border ${
                    qcFilter === 'ALL'
                      ? 'bg-slate-800 text-white border-slate-800 shadow-2xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  <span>Semua Status</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-current">{rooms.length}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setQcFilter('LOLOS_QC')}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1.5 border ${
                    qcFilter === 'LOLOS_QC'
                      ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                      : 'bg-emerald-50/60 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Lolos QC (Siap Pakai)</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/30 text-current">
                    {lolosQcCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setQcFilter('MENUNGGU_QC')}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1.5 border ${
                    qcFilter === 'MENUNGGU_QC'
                      ? 'bg-purple-700 text-white border-purple-700 shadow-2xs'
                      : 'bg-purple-50/60 hover:bg-purple-100 text-purple-800 border-purple-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  <span>Cek QC (Pasca Teknisi)</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/30 text-current">
                    {menungguQcCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setQcFilter('PERLU_INSPEKSI')}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1.5 border ${
                    qcFilter === 'PERLU_INSPEKSI'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                      : 'bg-amber-50/60 hover:bg-amber-100 text-amber-800 border-amber-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  <span>Perlu Inspeksi</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/30 text-current">
                    {perluInspeksiCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setQcFilter('PERLU_PERBAIKAN')}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1.5 border ${
                    qcFilter === 'PERLU_PERBAIKAN'
                      ? 'bg-rose-700 text-white border-rose-700 shadow-2xs'
                      : 'bg-rose-50/60 hover:bg-rose-100 text-rose-800 border-rose-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  <span>Perlu Perbaikan</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/30 text-current">
                    {perluPerbaikanCount}
                  </span>
                </button>
              </div>
            </div>

            {/* Bottom Row: Detailed Dropdown Filter Bar in a Clean Light Box */}
            <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/80">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Filter 1: Gedung */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <i className="fa-solid fa-building text-slate-400"></i>
                    <span>Pilih Gedung Fasilitas:</span>
                  </label>
                  <select 
                    value={bFilter} 
                    onChange={e => {
                      const val = e.target.value;
                      setBFilter(val);
                      if (
                        val !== 'ALL' &&
                        val !== 'Gedung Serbaguna (SG)' &&
                        val !== 'Gedung Serbaguna' &&
                        val !== 'Ruang Pertemuan / Aula' &&
                        val !== 'Ruang Pertemuan'
                      ) {
                        setActiveBuildingName(val);
                      }
                    }} 
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-teal-600 outline-none font-medium text-slate-800 cursor-pointer shadow-2xs"
                  >
                    <option key="all" value="ALL">Semua Fasilitas Gedung &amp; Aula</option>
                    {lodgingBuildings.slice().sort((a, b) => compareBuildingOrder(a.name, b.name)).map(b => (
                      <option key={b.id} value={b.name}>{b.name}</option>
                    ))}
                    <option key="gedung-serbaguna" value="Gedung Serbaguna (SG)">🏢 Gedung Serbaguna (SG)</option>
                    <option key="ruang-pertemuan" value="Ruang Pertemuan / Aula">🏛️ Ruang Pertemuan / Aula</option>
                  </select>
                </div>

                {/* Filter 2: Status QC */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <i className="fa-solid fa-clipboard-check text-slate-400"></i>
                    <span>Status Quality Control:</span>
                  </label>
                  <select
                    value={qcFilter}
                    onChange={e => setQcFilter(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-teal-600 outline-none font-medium text-slate-800 cursor-pointer shadow-2xs"
                  >
                    <option key="all" value="ALL">Semua Status QC</option>
                    <option key="lolos" value="LOLOS_QC">🟢 Lolos QC (Siap Pakai)</option>
                    <option key="menunggu" value="MENUNGGU_QC">🟣 Perlu Cek QC (Pasca Teknisi)</option>
                    <option key="inspeksi" value="PERLU_INSPEKSI">🟡 Perlu Inspeksi Rutin</option>
                    <option key="perbaikan" value="PERLU_PERBAIKAN">🔴 Perlu Perbaikan (Teknisi)</option>
                  </select>
                </div>
              </div>

              {/* Active Filter Reset */}
              {(bFilter !== 'ALL' || qcFilter !== 'ALL' || search) && (
                <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-slate-200 text-xs text-slate-600">
                  <span className="flex items-center gap-1.5 font-medium">
                    <i className="fa-solid fa-filter text-teal-700"></i>
                    <span>Filter aktif: menampilkan <strong>{roomsForMasterDetail.length}</strong> unit</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setBFilter('ALL');
                      setQcFilter('ALL');
                      setSearch('');
                    }}
                    className="text-teal-800 hover:text-teal-950 font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <i className="fa-solid fa-rotate-left text-[11px]"></i>
                    <span>Reset Semua Filter</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-8">
            {/* BAGIAN 1: GEDUNG PENGINAPAN (MASTER-DETAIL SEPERTI MANAJEMEN GEDUNG) */}
            {(bFilter === 'ALL' || lodgingBuildings.some(b => b.name.toLowerCase() === bFilter.toLowerCase())) && (
              <div id="lodging-master-detail-section" className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-base text-slate-900 flex items-center space-x-2">
                      <i className="fa-solid fa-hotel text-teal-700"></i>
                      <span>Gedung Penginapan &amp; Kamar Hunian (QC)</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 tabular-nums">
                        {buildingNames.length} Gedung • {lodgingRooms.length} Kamar Tidur
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Pilih gedung penginapan di sebelah kiri untuk melakukan inspeksi QC unit kamar di sebelah kanan.
                    </p>
                  </div>
                </div>

                {buildingNames.length === 0 ? (
                  <div className="bg-white p-8 text-center rounded-2xl border border-slate-200 text-slate-400">
                    <i className="fa-solid fa-hotel text-3xl mb-2 text-slate-300"></i>
                    <p className="text-xs font-semibold">Tidak ada gedung penginapan yang sesuai dengan filter QC.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                    {/* Sisi Kiri: Daftar Gedung Penginapan (4 Kolom) */}
                    <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                          Pilih Gedung Penginapan ({buildingNames.length})
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Klik untuk lihat kamar
                        </span>
                      </div>

                      <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1.5 custom-scrollbar">
                        {buildingNames.map(bName => {
                          const bRooms = grouped[bName] || [];
                          const bObj = lodgingBuildings.find(b => b.name.toLowerCase() === bName.toLowerCase());
                          const isSelected = selectedBuildingKey.toLowerCase() === bName.toLowerCase();
                          const bLolos = bRooms.filter(r => r.qcStatus === 'LOLOS_QC').length;
                          const bMenunggu = bRooms.filter(r => r.qcStatus === 'MENUNGGU_QC').length;
                          const bPerluPerbaikan = bRooms.filter(r => r.qcStatus === 'PERLU_PERBAIKAN').length;
                          const bPerluInspeksi = bRooms.filter(r => !r.qcStatus || r.qcStatus === 'PERLU_INSPEKSI').length;
                          const uniqueTypes: string[] = Array.from(
                            new Set(bRooms.map(r => (r.type || 'Standar').trim()).filter(Boolean))
                          );
                          const formattedTypes = uniqueTypes.map(t => {
                            const clean = String(t).replace(/^(type|tipe)\s+/i, '').trim();
                            return `Type ${clean}`;
                          });
                          const roomTypesLabel = formattedTypes.length === 0
                            ? 'Type Standar'
                            : formattedTypes.length === 1
                            ? formattedTypes[0]
                            : formattedTypes.length === 2
                            ? `${formattedTypes[0]} & ${formattedTypes[1]}`
                            : `${formattedTypes.slice(0, -1).join(', ')} & ${formattedTypes[formattedTypes.length - 1]}`;

                          return (
                            <div
                              key={bName}
                              onClick={() => {
                                setActiveBuildingName(bName);
                                if (bFilter !== 'ALL' && bFilter.toLowerCase() !== bName.toLowerCase()) {
                                  setBFilter('ALL');
                                }
                              }}
                              className={`p-3 rounded-xl border transition-all cursor-pointer space-y-2 ${
                                isSelected
                                  ? 'border-teal-500 bg-teal-50/50 shadow-xs ring-2 ring-teal-500/20'
                                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center space-x-2.5 min-w-0">
                                  <div className={`w-9 h-9 rounded-xl font-bold flex items-center justify-center text-xs shrink-0 ${
                                    isSelected
                                      ? 'bg-teal-700 text-white shadow-2xs'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}>
                                    <i className={`fa-solid ${getBuildingIcon(bName, bObj?.category)}`}></i>
                                  </div>
                                  <div className="min-w-0">
                                    <h4 className="font-bold text-xs text-slate-900 truncate">
                                      {bName}
                                    </h4>
                                    <p className="text-[10px] text-slate-500 truncate" title={roomTypesLabel}>
                                      {roomTypesLabel}
                                    </p>
                                  </div>
                                </div>

                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase shrink-0 ${
                                  isSelected
                                    ? 'bg-teal-100 text-teal-800 border border-teal-300'
                                    : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {bObj?.code || 'ASRAMA'}
                                </span>
                              </div>

                              <div className="flex items-center justify-between text-[10px] pt-1.5 border-t border-slate-100 tabular-nums">
                                <div className="flex items-center flex-wrap gap-1.5 text-slate-600 font-semibold">
                                  <span className="text-emerald-700 font-bold">{bLolos} Lolos</span>
                                  <span aria-hidden="true">·</span>
                                  {bMenunggu > 0 ? (
                                    <span className="text-purple-800 font-bold animate-pulse">{bMenunggu} Cek QC</span>
                                  ) : (
                                    <span className="text-amber-700 font-bold">{bPerluInspeksi} Perlu Cek</span>
                                  )}
                                  {bPerluPerbaikan > 0 && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="text-rose-700 font-bold">{bPerluPerbaikan} Perbaikan</span>
                                    </>
                                  )}
                                </div>

                                {isSelected ? (
                                  <span className="text-teal-700 font-bold flex items-center space-x-1 shrink-0">
                                    <span>Aktif</span>
                                    <i className="fa-solid fa-chevron-right text-[9px]"></i>
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-medium shrink-0">
                                    Pilih
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Sisi Kanan: Daftar Kamar dari Gedung Terpilih (8 Kolom) */}
                    <div className="lg:col-span-8 space-y-4">
                      {selectedBuildingKey ? (() => {
                        const bName = selectedBuildingKey;
                        const bRooms = grouped[bName] || [];
                        const bObj = lodgingBuildings.find(b => b.name.toLowerCase() === bName.toLowerCase());
                        const bDescription = (bObj?.description && bObj.description.trim())
                          || OFFICIAL_TARIFFS[bName]?.desc
                          || 'Fasilitas Kamar Hunian UPT Asrama Haji Jakarta';

                        const floorsInBuilding = Array.from(
                          new Set(bRooms.map(r => r.floor || extractFloorFromRoomNumber(r.roomNumber) || 1))
                        ).sort((a, b) => a - b);
                        const currentFloorFilter = buildingFloorFilters[bName] || 'ALL';

                        const displayedRooms = currentFloorFilter === 'ALL'
                          ? bRooms
                          : bRooms.filter(r => (r.floor || extractFloorFromRoomNumber(r.roomNumber) || 1) === currentFloorFilter);

                        return (
                          <div
                            id={`qc-building-section-${bName.replace(/[^a-zA-Z0-9]/g, '-')}`}
                            className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-4"
                          >
                            {/* Header Gedung Terpilih */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                              <div className="flex items-center space-x-3.5">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 text-white font-black text-lg flex items-center justify-center shadow-xs shrink-0">
                                  <i className={`fa-solid ${getBuildingIcon(bName, bObj?.category)}`}></i>
                                </div>
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="font-black text-base text-slate-900">
                                      {bName}
                                    </h3>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-teal-100 text-teal-900 border border-teal-300">
                                      {bObj?.code || 'PENGINAPAN'}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 tabular-nums">
                                      {floorsInBuilding.length || 1} Lantai • {bRooms.length} Kamar
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    {bDescription}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedBuilding(bName);
                                    setActiveTab('gedung');
                                  }}
                                  className="px-3 py-1.5 bg-slate-100 hover:bg-teal-50 border border-slate-200 hover:border-teal-300 text-slate-700 hover:text-teal-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                                  title="Buka denah gedung di Manajemen Gedung"
                                >
                                  <i className="fa-solid fa-map-location-dot text-teal-600"></i>
                                  <span>Denah Gedung</span>
                                </button>
                              </div>
                            </div>

                            {/* Bar Filter Lantai & Ringkasan QC */}
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums">
                                <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded-lg font-bold">
                                  {bRooms.filter(r => r.qcStatus === 'LOLOS_QC').length} Lolos QC
                                </span>
                                <span className="px-2 py-1 bg-purple-100 text-purple-900 rounded-lg font-bold">
                                  {bRooms.filter(r => r.qcStatus === 'MENUNGGU_QC').length} Cek QC
                                </span>
                                <span className="px-2 py-1 bg-rose-100 text-rose-800 rounded-lg font-bold">
                                  {bRooms.filter(r => r.qcStatus === 'PERLU_PERBAIKAN').length} Perbaikan
                                </span>
                                <span className="px-2 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg font-bold">
                                  {bRooms.filter(r => !r.qcStatus || r.qcStatus === 'PERLU_INSPEKSI').length} Perlu Cek
                                </span>
                              </div>

                              {/* Filter Lantai */}
                              <div className="flex items-center flex-wrap gap-1">
                                <span className="text-[11px] font-bold text-slate-500 mr-1">Lantai:</span>
                                <button
                                  type="button"
                                  onClick={() => setBuildingFloorFilters(prev => ({ ...prev, [bName]: 'ALL' }))}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer tabular-nums whitespace-nowrap shrink-0 ${
                                    currentFloorFilter === 'ALL'
                                      ? 'bg-teal-700 text-white shadow-2xs'
                                      : 'bg-white border border-slate-200 hover:bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  Semua ({bRooms.length})
                                </button>
                                {floorsInBuilding.map(fl => {
                                  const countInFloor = bRooms.filter(r => (r.floor || extractFloorFromRoomNumber(r.roomNumber) || 1) === fl).length;
                                  return (
                                    <button
                                      key={fl}
                                      type="button"
                                      onClick={() => setBuildingFloorFilters(prev => ({ ...prev, [bName]: fl }))}
                                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer tabular-nums whitespace-nowrap shrink-0 ${
                                        currentFloorFilter === fl
                                          ? 'bg-teal-700 text-white shadow-2xs'
                                          : 'bg-white border border-slate-200 hover:bg-slate-100 text-slate-700'
                                      }`}
                                    >
                                      Lt. {fl} ({countInFloor})
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Daftar Kamar */}
                            {displayedRooms.length === 0 ? (
                              <div className="p-8 text-center bg-slate-50 border border-slate-100 rounded-xl space-y-2">
                                <i className="fa-solid fa-bed text-3xl text-slate-300"></i>
                                <p className="text-xs font-bold text-slate-700">Tidak ada unit kamar yang sesuai dengan filter QC di lantai ini.</p>
                              </div>
                            ) : (
                              <div className="max-h-[500px] overflow-y-auto pr-1.5 custom-scrollbar">
                                <div className="grid gap-2.5 sm:gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                                  {displayedRooms.map(r => renderRoomCard(r))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })() : (
                        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400">
                          <i className="fa-solid fa-hotel text-3xl mb-2 text-slate-300"></i>
                          <p className="text-xs font-semibold">Pilih gedung penginapan di sebelah kiri untuk melihat daftar kamar QC.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* BAGIAN 2: FASILITAS GEDUNG SERBAGUNA & RUANG PERTEMUAN / AULA */}
            {(bFilter === 'ALL' || bFilter === 'Gedung Serbaguna (SG)' || bFilter === 'Ruang Pertemuan / Aula') && (
              <div className="space-y-4 pt-2">
                <div className="border-b border-slate-200 pb-2.5">
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-900 flex items-center space-x-2">
                    <i className="fa-solid fa-landmark text-purple-700"></i>
                    <span>Ruang Pertemuan, Aula &amp; Gedung Serbaguna (QC)</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 tabular-nums">
                      {meetingFacilities.length} Unit Aula/SG
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Inspeksi kelayakan fasilitas ruang rapat besar, auditorium, dan gedung serbaguna (SG).
                  </p>
                </div>

                {meetingFacilities.length === 0 ? (
                  <div className="bg-white p-8 text-center rounded-2xl border border-slate-200 text-slate-400">
                    <i className="fa-solid fa-landmark text-3xl mb-2 text-slate-300"></i>
                    <p className="text-xs font-semibold">Tidak ada aula atau ruang serbaguna yang sesuai dengan filter QC.</p>
                  </div>
                ) : (
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {meetingFacilities.map((m: MeetingRoom) => {
                      const qc = m.qcStatus || 'PERLU_INSPEKSI';
                      const isSG = m.category === 'SERBAGUNA' || (m.building || '').includes('Serbaguna');
                      let cardBorder = 'border-slate-200';
                      if (qc === 'LOLOS_QC') cardBorder = 'border-emerald-300 hover:border-emerald-400';
                      if (qc === 'MENUNGGU_QC') cardBorder = 'border-purple-300 ring-2 ring-purple-300/70 shadow-xs';
                      if (qc === 'PERLU_PERBAIKAN') cardBorder = 'border-rose-200 hover:border-rose-300';
                      if (qc === 'PERLU_INSPEKSI') cardBorder = 'border-amber-200 hover:border-amber-300';

                      return (
                        <div key={m.id} className={`p-3.5 rounded-xl border ${cardBorder} shadow-xs flex flex-col justify-between space-y-3 bg-white`}>
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2.5 min-w-0">
                                <span className={`inline-flex items-center justify-center w-8 h-8 rounded-xl ${
                                  isSG ? 'bg-amber-100 text-amber-900 border border-amber-200' : 'bg-purple-100 text-purple-900 border border-purple-200'
                                } shrink-0 shadow-2xs`}>
                                  <i className={`fa-solid ${isSG ? 'fa-building-columns text-amber-700' : 'fa-landmark text-purple-700'} text-xs`}></i>
                                </span>
                                <div className="min-w-0">
                                  <h4 className="font-bold text-xs text-slate-900 truncate" title={m.name}>
                                    {m.name}
                                  </h4>
                                  <p className="text-[10px] text-slate-500 truncate">
                                    {m.building || 'Ruang Pertemuan / Aula'} • Kap. {m.capacity} Orang
                                  </p>
                                </div>
                              </div>
                              {getQcBadge(m.qcStatus, true)}
                            </div>

                            <div className="mt-2 text-[10px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100 space-y-1">
                              <div className="flex justify-between">
                                <span className="text-slate-400">Tarif 8 Jam:</span>
                                <strong className="font-mono text-slate-800">{formatRupiah(m.sessionRate || 7000000)}</strong>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Tarif 12 Jam:</span>
                                <strong className="font-mono text-slate-800">{formatRupiah(m.dailyRate || 12000000)}</strong>
                              </div>
                              {(m as any).lastQcNotes && (
                                <div className="italic text-slate-700 pt-1 border-t border-slate-200/60" title={(m as any).lastQcNotes}>
                                  "{(m as any).lastQcNotes}"
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-100">
                            {canInspect ? (
                              <button
                                type="button"
                                onClick={() => openModal('modalQcInspection', { room: { ...m, roomNumber: m.name } })}
                                className="w-full py-1.5 font-bold rounded-lg text-[10px] bg-teal-700 hover:bg-teal-800 text-white shadow-xs flex items-center justify-center space-x-1.5 transition cursor-pointer"
                              >
                                <i className="fa-solid fa-clipboard-check text-[9px]"></i>
                                <span>Inspeksi QC Aula</span>
                              </button>
                            ) : (
                              <div className="text-center text-[9px] text-slate-400 italic py-0.5">
                                <i className="fa-solid fa-lock mr-1 text-slate-300 text-[8px]"></i> Khusus QC
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
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: INSPECTION AUDIT HISTORY */}
      {activeSubTab === 'HISTORY' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center">
              <i className="fa-solid fa-list-check text-teal-600 mr-2"></i>
              Buku Log Inspeksi Mutu & Kesiapan Kamar (QC Audit Trail)
            </h3>
            <span className="text-[11px] text-slate-500">Total {qcInspections.length} pemeriksaan tercatat</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 uppercase text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Waktu Inspeksi</th>
                  <th className="p-3">Kamar / Fasilitas</th>
                  <th className="p-3">Pemeriksa QC</th>
                  <th className="p-3">Kebersihan</th>
                  <th className="p-3">Linen & Sprei</th>
                  <th className="p-3">AC & Listrik</th>
                  <th className="p-3">Sanitasi & Air</th>
                  <th className="p-3">Amenities</th>
                  <th className="p-3 text-center">Hasil QC</th>
                  <th className="p-3">Catatan Temuan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {qcInspections.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">{item.inspectionDate}</td>
                    <td className="p-3 font-bold text-slate-800">
                      {item.roomNumber}
                      <span className="block text-[10px] font-normal text-slate-400">{item.building}</span>
                    </td>
                    <td className="p-3 font-medium text-slate-800">{item.inspectorName}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.cleanliness === 'BAIK' ? 'bg-emerald-100 text-emerald-800' :
                        item.cleanliness === 'CUKUP' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {item.cleanliness}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.linenBed === 'LENGKAP_BERSIH' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {item.linenBed === 'LENGKAP_BERSIH' ? 'Bersih' : 'Perlu Ganti'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.acElectricity === 'NORMAL' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {item.acElectricity}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.plumbingWater === 'LANCAR' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {item.plumbingWater}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.amenities === 'LENGKAP' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {item.amenities}
                      </span>
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      {item.result === 'LOLOS_QC' ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <i className="fa-solid fa-check mr-1 text-emerald-600"></i> LOLOS QC
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-red-100 text-red-800 border border-red-300">
                          <i className="fa-solid fa-wrench mr-1 text-red-600"></i> PERLU PERBAIKAN
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-slate-600 max-w-xs truncate" title={item.notes}>
                      {item.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
