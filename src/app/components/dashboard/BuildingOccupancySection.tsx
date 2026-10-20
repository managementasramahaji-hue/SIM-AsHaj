// @ts-nocheck
import React, { useState, useMemo } from 'react';
import { BuildingDetailModal } from './BuildingDetailModal';
import { Room, Transaction, Maintenance } from '../../types';
import { useAppContext } from '../../store';
import { compareBuildingOrder } from '../../lib/utils';

export interface BuildingStat {
  name: string;
  shortName: string;
  total: number;
  occupied: number;
  reserved: number;
  vacant: number;
  maintenance: number;
  occPercent: number;
  icon: string;
  isAula?: boolean;
  minPrice?: number;
  maxPrice?: number;
  priceLabel?: string;
  totalPax?: number;
  capacityDesc?: string;
}

interface BuildingOccupancySectionProps {
  buildingStats: BuildingStat[];
  totalKamar: number;
  terisiKamar: number;
  bookedKamar: number;
  kosongKamar: number;
  maintKamar: number;
  occupancyPercent: number;
  setSelectedBuilding: (building: string) => void;
  setActiveTab: (tab: string) => void;
  rooms?: Room[];
  transactions?: Transaction[];
  maintenances?: Maintenance[];
  onOpenRoomDetail?: (roomId: string) => void;
}

export function BuildingOccupancySection({
  buildingStats,
  totalKamar,
  terisiKamar,
  bookedKamar,
  kosongKamar,
  maintKamar,
  occupancyPercent,
  setSelectedBuilding,
  setActiveTab,
  rooms = [],
  transactions = [],
  maintenances = [],
  onOpenRoomDetail,
}: BuildingOccupancySectionProps) {
  const context = useAppContext();
  const [bCategoryFilter, setBCategoryFilter] = useState<'ALL' | 'RESIDENTIAL' | 'SG' | 'AULA'>('ALL');
  const [selectedBuildingDetail, setSelectedBuildingDetail] = useState<BuildingStat | null>(null);

  const filteredBuildings = useMemo(() => {
    return buildingStats
      .filter(b => {
        const isSG = b.name.includes('Serbaguna') || b.name.includes('SG');
        const isAula = !isSG && (b.name.includes('Pertemuan') || b.name.includes('Aula'));
        const isResidential = !isSG && !isAula;
        if (bCategoryFilter === 'RESIDENTIAL') return isResidential;
        if (bCategoryFilter === 'SG') return isSG;
        if (bCategoryFilter === 'AULA') return isAula;
        return true;
      })
      .slice()
      .sort((a, b) => compareBuildingOrder(a.name, b.name));
  }, [buildingStats, bCategoryFilter]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs p-4 sm:p-5 h-full flex flex-col justify-between space-y-4">
      <div className="space-y-3.5">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 dark:border-slate-800/80 pb-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200/70 dark:border-blue-800 flex items-center justify-center font-bold text-base shadow-xs shrink-0">
              <i className="fa-solid fa-building"></i>
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Keterisian & Denah Per Gedung
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Monitoring visual okupansi {buildingStats.length} Gedung Asrama, Gedung Serbaguna (SG) &amp; Aula
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              Realtime Sync
            </span>
          </div>
        </div>

        {/* Category Filter Tabs: Semua, Gedung Hunian, Gedung Serbaguna (SG), Ruang Pertemuan / Aula */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-xs font-semibold overflow-x-auto">
          <button
            type="button"
            onClick={() => setBCategoryFilter('ALL')}
            className={`flex-1 min-w-[70px] py-1.5 px-2 rounded-lg transition cursor-pointer text-center text-xs ${
              bCategoryFilter === 'ALL'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Semua ({buildingStats.length})
          </button>
          <button
            type="button"
            onClick={() => setBCategoryFilter('RESIDENTIAL')}
            className={`flex-1 min-w-[95px] py-1.5 px-2 rounded-lg transition cursor-pointer text-center text-xs ${
              bCategoryFilter === 'RESIDENTIAL'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Gedung Hunian
          </button>
          <button
            type="button"
            onClick={() => setBCategoryFilter('SG')}
            className={`flex-1 min-w-[130px] py-1.5 px-2 rounded-lg transition cursor-pointer text-center text-xs ${
              bCategoryFilter === 'SG'
                ? 'bg-amber-600 text-white shadow-2xs font-bold'
                : 'text-amber-800 dark:text-amber-300 hover:bg-amber-100/50'
            }`}
          >
            🏢 Gedung Serbaguna (SG)
          </button>
          <button
            type="button"
            onClick={() => setBCategoryFilter('AULA')}
            className={`flex-1 min-w-[130px] py-1.5 px-2 rounded-lg transition cursor-pointer text-center text-xs ${
              bCategoryFilter === 'AULA'
                ? 'bg-purple-600 text-white shadow-2xs font-bold'
                : 'text-purple-800 dark:text-purple-300 hover:bg-purple-100/50'
            }`}
          >
            🏛️ Ruang Pertemuan / Aula
          </button>
        </div>

        {/* Global Complex Progress Strip */}
        <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/70 dark:border-slate-700/70 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-400 font-semibold">
              Okupansi Asrama Keseluruhan:
            </span>
            <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
              {terisiKamar}/{totalKamar} Kamar ({occupancyPercent}%)
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden flex">
            <div 
              className="bg-emerald-600 h-full transition-all duration-500" 
              style={{ width: `${(terisiKamar / Math.max(1, totalKamar)) * 100}%` }} 
              title={`Terisi: ${terisiKamar}`}
            />
            <div 
              className="bg-blue-600 h-full transition-all duration-500" 
              style={{ width: `${(bookedKamar / Math.max(1, totalKamar)) * 100}%` }} 
              title={`Booking: ${bookedKamar}`}
            />
            <div 
              className="bg-amber-500 h-full transition-all duration-500" 
              style={{ width: `${(maintKamar / Math.max(1, totalKamar)) * 100}%` }} 
              title={`Maintenance: ${maintKamar}`}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-0.5">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
              <span>Terisi ({terisiKamar})</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
              <span>Booking ({bookedKamar})</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600"></span>
              <span>Kosong ({kosongKamar})</span>
            </span>
            {maintKamar > 0 && (
              <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                <span>Maint ({maintKamar})</span>
              </span>
            )}
          </div>
        </div>

        {/* Building Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto pr-0.5">
          {filteredBuildings.map(b => {
            const isSG = b.name.includes('Serbaguna') || b.name.includes('SG');
            const isAula = !isSG && (b.name.includes('Pertemuan') || b.name.includes('Aula'));
            const cardBorder = isSG 
              ? 'border-amber-300 dark:border-amber-700/80 hover:border-amber-500 bg-amber-50/30 dark:bg-amber-950/20' 
              : isAula 
              ? 'border-purple-300 dark:border-purple-700/80 hover:border-purple-500 bg-purple-50/30 dark:bg-purple-950/20' 
              : 'border-slate-200/80 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 bg-slate-50/80 dark:bg-slate-800/80';

            const iconColor = isSG ? 'text-amber-600 dark:text-amber-400' : isAula ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400 group-hover:text-blue-500';
            const progressColor = isSG ? 'bg-amber-500' : isAula ? 'bg-purple-600' : 'bg-emerald-600';

            return (
              <div 
                key={b.name} 
                onClick={() => setSelectedBuildingDetail(b)}
                className={`p-3 rounded-xl border ${cardBorder} hover:bg-white dark:hover:bg-slate-800 space-y-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs cursor-pointer group`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-1.5 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    <i className={`fa-solid ${b.icon} ${iconColor} text-xs transition-colors shrink-0`}></i>
                    <span className="truncate">{b.shortName}</span>
                    {isSG && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
                        Konvensi
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 shrink-0">
                    {b.occupied}/{b.total} ({b.occPercent}%)
                  </span>
                </div>

                {/* Progress bar per building */}
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden flex">
                  <div 
                    className={`${progressColor} h-full transition-all duration-500`} 
                    style={{ width: `${b.occPercent}%` }} 
                  />
                  <div 
                    className="bg-blue-600 h-full transition-all duration-500" 
                    style={{ width: `${b.total > 0 ? (b.reserved / b.total) * 100 : 0}%` }} 
                  />
                  <div 
                    className="bg-amber-500 h-full transition-all duration-500" 
                    style={{ width: `${b.total > 0 ? (b.maintenance / b.total) * 100 : 0}%` }} 
                  />
                </div>

                {/* Status Badges: Terisi, Booking, Kosong, Maint (Simpel tanpa harga & pax) */}
                <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold text-[10px]">
                      {b.occupied} Terisi
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-semibold text-[10px]">
                      {b.reserved} Booking
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 font-medium text-[10px]">
                      {b.vacant} Kosong
                    </span>
                    {b.maintenance > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-semibold text-[10px]">
                        {b.maintenance} Maint
                      </span>
                    )}
                  </div>
                  <span className="text-blue-700 dark:text-blue-400 font-bold group-hover:underline flex items-center space-x-0.5 transition shrink-0 text-[10.5px]">
                    <span>Detail</span>
                    <span>→</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Ringkasan */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span>Total: <strong className="text-slate-700 dark:text-slate-200 font-mono">{totalKamar} Kamar</strong></span>
          <span>•</span>
          <span>Okupansi: <strong className="text-emerald-700 dark:text-emerald-400 font-bold font-mono">{occupancyPercent}%</strong></span>
        </span>
        <button
          type="button"
          onClick={() => setActiveTab('gedung')}
          className="text-blue-700 dark:text-blue-400 font-bold hover:underline flex items-center gap-1 cursor-pointer"
        >
          <span>Buka Modul Denah Kamar →</span>
        </button>
      </div>

      {/* Modal Popup Detail & Monitoring Gedung */}
      <BuildingDetailModal
        isOpen={Boolean(selectedBuildingDetail)}
        onClose={() => setSelectedBuildingDetail(null)}
        building={selectedBuildingDetail}
        rooms={rooms}
        transactions={transactions}
        maintenances={maintenances}
        meetingRooms={context.meetingRooms || []}
        onOpenRoomDetail={onOpenRoomDetail}
        onGoToFloorPlan={(bName) => {
          setSelectedBuilding(bName);
          setActiveTab('gedung');
        }}
      />
    </div>
  );
}

