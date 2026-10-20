import React from 'react';
import { motion } from 'motion/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Room } from '../../types';

interface OperationalStatsSectionProps {
  totalKamar: number;
  terisiKamar: number;
  bookedKamar: number;
  kosongKamar: number;
  maintKamar: number;
  occupancyPercent: number;
  readyCleanRooms: Room[];
  activeMaintenances: any[];
  urgentMaintenances: any[];
  totalBreakfastPortions: number;
  activeBreakfastList: any[];
  last7DaysMaintenanceData: { day: string; Selesai: number; Proses: number; Total: number }[];
  maintResolvedRate: number;
  qcPassRate: number;
  facilityHealthRate: number;
  systemHealthScore: number;
  readyQcRooms: number;
  totalRegisteredUnits?: number;
  aulaEventsToday: any[];
  totalAula: number;
  setActiveTab: (tab: string) => void;
  setActiveChartPopup: (popup: 'PIE' | 'MAINT_TREND' | 'SYSTEM_TREND' | null) => void;
}

export function OperationalStatsSection({
  totalKamar,
  terisiKamar,
  bookedKamar,
  kosongKamar,
  maintKamar,
  occupancyPercent,
  readyCleanRooms,
  activeMaintenances,
  urgentMaintenances,
  totalBreakfastPortions,
  activeBreakfastList,
  last7DaysMaintenanceData,
  maintResolvedRate,
  qcPassRate,
  facilityHealthRate,
  systemHealthScore,
  readyQcRooms,
  totalRegisteredUnits,
  aulaEventsToday,
  totalAula,
  setActiveTab,
  setActiveChartPopup,
}: OperationalStatsSectionProps) {
  const total7DaysMaint = last7DaysMaintenanceData.reduce((acc, d) => acc + d.Total, 0);
  const totalUnits = totalRegisteredUnits || totalKamar;
  const safeQcRate = Math.min(100, Math.max(0, qcPassRate));

  return (
    <motion.section 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4"
    >
      {/* Header Utama Panel */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-3.5">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-hajj-700 via-hajj-800 to-hajj-900 text-gold-300 border border-gold-500/20 flex items-center justify-center font-bold text-base shadow-xs shrink-0">
            <i className="fa-solid fa-chart-pie"></i>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Analisis & Informasi Statistik Sistem Operasional
              </h3>
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-hajj-50 dark:bg-hajj-950/60 text-hajj-800 dark:text-gold-400 border border-hajj-200/60 dark:border-hajj-800">
                Pusat Kendali Terpadu
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Monitoring riil okupansi hunian kamar, evaluasi tiket perawatan 7 hari, dan indikator mutu layanan asrama.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto shrink-0">
          <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800 flex items-center gap-1.5 shadow-2xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Sistem Normal (Online)</span>
          </span>
          <button
            type="button"
            onClick={() => setActiveTab('laporanKamar')}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-[11px] font-bold transition flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 cursor-pointer"
          >
            <i className="fa-solid fa-file-waveform text-xs text-slate-500"></i>
            <span>Laporan Lengkap</span>
          </button>
        </div>
      </div>

      {/* 4 Kartu Ringkasan Eksekutif Terpadu (Telemetry Strip) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {/* Metric 1: Okupansi */}
        <div 
          onClick={() => setActiveTab('gedung')}
          className="p-3 bg-slate-50/80 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 hover:border-emerald-400 dark:hover:border-emerald-500 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span className="font-semibold text-[11px] flex items-center gap-1.5">
              <i className="fa-solid fa-bed text-emerald-600 dark:text-emerald-400"></i>
              <span>Tingkat Okupansi</span>
            </span>
            <span className="text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-300 group-hover:underline">
              {occupancyPercent}%
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tabular-nums">
              {terisiKamar}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              / {totalKamar} Kamar Terisi
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mt-2">
            <div 
              className="bg-emerald-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${occupancyPercent}%` }}
            />
          </div>
        </div>

        {/* Metric 2: Kesiapan Siap Huni */}
        <div 
          onClick={() => setActiveTab('qualityControl')}
          className="p-3 bg-slate-50/80 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 hover:border-teal-400 dark:hover:border-teal-500 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span className="font-semibold text-[11px] flex items-center gap-1.5">
              <i className="fa-solid fa-shield-check text-teal-600 dark:text-teal-400"></i>
              <span>Kesiapan Kamar QC</span>
            </span>
            <span className="text-[10px] font-mono font-bold text-teal-700 dark:text-teal-300 group-hover:underline">
              {safeQcRate}% Lolos
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tabular-nums">
              {readyCleanRooms.length}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Kamar Siap Huni
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mt-2">
            <div 
              className="bg-teal-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${safeQcRate}%` }}
            />
          </div>
        </div>

        {/* Metric 3: Tiket Kerusakan & SLA */}
        <div 
          onClick={() => setActiveTab('laporanMaintenance')}
          className="p-3 bg-slate-50/80 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 hover:border-red-400 dark:hover:border-red-500 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span className="font-semibold text-[11px] flex items-center gap-1.5">
              <i className="fa-solid fa-screwdriver-wrench text-red-600 dark:text-red-400"></i>
              <span>Kendala Fasilitas</span>
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
              urgentMaintenances.length > 0 
                ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 animate-pulse' 
                : 'text-slate-500'
            }`}>
              {urgentMaintenances.length > 0 ? `${urgentMaintenances.length} Urgent` : '0 Mendesak'}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tabular-nums">
              {activeMaintenances.length}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Tiket Aktif · {maintResolvedRate}% Selesai
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mt-2">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${activeMaintenances.length > 0 ? 'bg-amber-500' : 'bg-emerald-600'}`}
              style={{ width: `${facilityHealthRate}%` }}
            />
          </div>
        </div>

        {/* Metric 4: Indeks Mutu Asrama */}
        <div 
          onClick={() => setActiveChartPopup('SYSTEM_TREND')}
          className="p-3 bg-slate-50/80 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 hover:border-indigo-400 dark:hover:border-indigo-500 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span className="font-semibold text-[11px] flex items-center gap-1.5">
              <i className="fa-solid fa-award text-indigo-600 dark:text-indigo-400"></i>
              <span>Indeks Mutu Operasional</span>
            </span>
            <span className="text-[10px] font-mono font-bold text-indigo-700 dark:text-indigo-300 group-hover:underline">
              SOP Terpenuhi
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
              {systemHealthScore}%
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Prima & Terstandarisasi
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mt-2">
            <div 
              className="bg-indigo-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${systemHealthScore}%` }}
            />
          </div>
        </div>
      </div>

      {/* 3 Grid Charts Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 pt-1">
        
        {/* Panel 1: Diagram Pie/Donut Terintegrasi (Distribusi Status Kamar) */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/90 dark:border-slate-700 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
            <div className="flex items-center space-x-2">
              <i className="fa-solid fa-chart-pie text-emerald-600 dark:text-emerald-400 text-xs"></i>
              <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Distribusi Status Kamar
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setActiveChartPopup('PIE')}
              className="px-2 py-0.8 text-[10px] font-bold bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 rounded-md border border-slate-200 dark:border-slate-700 transition cursor-pointer flex items-center gap-1 shadow-2xs"
            >
              <i className="fa-solid fa-up-right-from-square text-[9px] text-emerald-600"></i>
              <span>Popup Pie</span>
            </button>
          </div>

          {/* Donut Chart Visual */}
          <div className="flex items-center justify-center gap-4 py-1">
            <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="38" fill="transparent" stroke="#e2e8f0" strokeWidth="15" className="dark:stroke-slate-700" />
                <circle cx="50" cy="50" r="38" fill="transparent" stroke="#059669" strokeWidth="15"
                  strokeDasharray={`${(terisiKamar / Math.max(1, totalKamar)) * 238.76} 238.76`}
                  strokeDashoffset="0"
                />
                <circle cx="50" cy="50" r="38" fill="transparent" stroke="#2563eb" strokeWidth="15"
                  strokeDasharray={`${(bookedKamar / Math.max(1, totalKamar)) * 238.76} 238.76`}
                  strokeDashoffset={`-${(terisiKamar / Math.max(1, totalKamar)) * 238.76}`}
                />
                <circle cx="50" cy="50" r="38" fill="transparent" stroke="#94a3b8" strokeWidth="15"
                  strokeDasharray={`${(kosongKamar / Math.max(1, totalKamar)) * 238.76} 238.76`}
                  strokeDashoffset={`-${((terisiKamar + bookedKamar) / Math.max(1, totalKamar)) * 238.76}`}
                />
                <circle cx="50" cy="50" r="38" fill="transparent" stroke="#f59e0b" strokeWidth="15"
                  strokeDasharray={`${(maintKamar / Math.max(1, totalKamar)) * 238.76} 238.76`}
                  strokeDashoffset={`-${((terisiKamar + bookedKamar + kosongKamar) / Math.max(1, totalKamar)) * 238.76}`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <span className="text-base font-black text-slate-900 dark:text-slate-100 tabular-nums">
                  {occupancyPercent}%
                </span>
                <span className="text-[8.5px] text-slate-500 font-bold uppercase tracking-tight">Terisi</span>
              </div>
            </div>

            {/* List of 4 status rows */}
            <div className="flex-1 space-y-1 text-[11px]">
              <div 
                onClick={() => setActiveTab('gedung')} 
                className="flex items-center justify-between p-1 rounded hover:bg-emerald-50/60 dark:hover:bg-slate-700/50 cursor-pointer transition"
              >
                <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shrink-0"></span>
                  <span>Terisi</span>
                </span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                  {terisiKamar} <span className="text-slate-400 font-normal">({totalKamar > 0 ? Math.round((terisiKamar / totalKamar) * 100) : 0}%)</span>
                </span>
              </div>

              <div 
                onClick={() => setActiveTab('laporanKamar')} 
                className="flex items-center justify-between p-1 rounded hover:bg-blue-50/60 dark:hover:bg-slate-700/50 cursor-pointer transition"
              >
                <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0"></span>
                  <span>Booking</span>
                </span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                  {bookedKamar} <span className="text-slate-400 font-normal">({totalKamar > 0 ? Math.round((bookedKamar / totalKamar) * 100) : 0}%)</span>
                </span>
              </div>

              <div 
                onClick={() => setActiveTab('gedung')} 
                className="flex items-center justify-between p-1 rounded hover:bg-slate-100/60 dark:hover:bg-slate-700/50 cursor-pointer transition"
              >
                <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0"></span>
                  <span>Kosong</span>
                </span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                  {kosongKamar} <span className="text-slate-400 font-normal">({totalKamar > 0 ? Math.round((kosongKamar / totalKamar) * 100) : 0}%)</span>
                </span>
              </div>

              <div 
                onClick={() => setActiveTab('laporanMaintenance')} 
                className="flex items-center justify-between p-1 rounded hover:bg-amber-50/60 dark:hover:bg-slate-700/50 cursor-pointer transition"
              >
                <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></span>
                  <span>Perbaikan</span>
                </span>
                <span className="font-mono font-bold text-amber-700 dark:text-amber-400">
                  {maintKamar} <span className="text-slate-400 font-normal">({totalKamar > 0 ? Math.round((maintKamar / totalKamar) * 100) : 0}%)</span>
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[10.5px] text-slate-500 dark:text-slate-400">
            <span>Total: <strong>{totalKamar} Kamar Asrama</strong></span>
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <i className="fa-solid fa-circle-check text-[9px]"></i>
              <span>{readyCleanRooms.length} Steril Siap Huni</span>
            </span>
          </div>
        </div>

        {/* Panel 2: Tren Laporan Maintenance 7 Hari (Bar Chart) */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/90 dark:border-slate-700 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
            <div className="flex items-center space-x-2">
              <i className="fa-solid fa-chart-column text-amber-600 dark:text-amber-400 text-xs"></i>
              <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Tren Maintenance 7 Hari
              </h4>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                {total7DaysMaint} Tiket
              </span>
              <button
                type="button"
                onClick={() => setActiveChartPopup('MAINT_TREND')}
                className="px-2 py-0.8 text-[10px] font-bold bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 rounded-md border border-slate-200 dark:border-slate-700 transition cursor-pointer flex items-center gap-1 shadow-2xs"
              >
                <i className="fa-solid fa-up-right-from-square text-[9px] text-amber-600"></i>
                <span>Tren</span>
              </button>
            </div>
          </div>

          {/* Bar Chart Container */}
          <div className="h-32 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last7DaysMaintenanceData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="day" tick={{ fontSize: 9.5 }} stroke="#94a3b8" />
                <YAxis allowDecimals={false} tick={{ fontSize: 9.5 }} stroke="#94a3b8" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#0f172a', 
                    borderRadius: '8px', 
                    border: 'none', 
                    color: '#fff', 
                    fontSize: '11px',
                    padding: '6px 10px'
                  }}
                  formatter={(value: any, name: any) => [
                    `${value} Kasus`, 
                    name === 'Selesai' ? 'Selesai Servis' : 'Dalam Proses'
                  ]}
                  labelFormatter={(label) => `Tanggal: ${label}`}
                />
                <Bar dataKey="Selesai" name="Selesai" fill="#059669" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Proses" name="Proses" fill="#2563eb" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[10.5px]">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded bg-emerald-600"></span>
                <span>Selesai</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded bg-blue-600"></span>
                <span>Proses</span>
              </span>
            </div>
            <span className="font-bold text-emerald-700 dark:text-emerald-400">
              {maintResolvedRate}% SLA Terpenuhi
            </span>
          </div>
        </div>

        {/* Panel 3: Indeks Mutu & 4 Pilar Layanan Asrama */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/90 dark:border-slate-700 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
            <div className="flex items-center space-x-2">
              <i className="fa-solid fa-gauge-high text-indigo-600 dark:text-indigo-400 text-xs"></i>
              <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Indeks Mutu & SOP Layanan
              </h4>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300">
              {systemHealthScore}% Prima
            </span>
          </div>

          {/* 4 Pilar Layanan Grid */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {/* Pilar 1: Kebersihan QC */}
            <div 
              onClick={() => setActiveTab('qualityControl')} 
              className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200/70 dark:border-slate-700 hover:border-teal-400 transition cursor-pointer"
            >
              <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>Inspeksi QC</span>
                <span className="font-bold text-teal-600">{safeQcRate}%</span>
              </div>
              <div className="font-bold text-slate-800 dark:text-slate-200 text-xs mt-0.5">
                {Math.min(readyQcRooms, totalUnits)}/{totalUnits} Unit Lolos
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-700 h-1 rounded-full overflow-hidden mt-1.5">
                <div className="bg-teal-600 h-full rounded-full" style={{ width: `${safeQcRate}%` }} />
              </div>
            </div>

            {/* Pilar 2: Sarana & Fisik */}
            <div 
              onClick={() => setActiveTab('laporanMaintenance')} 
              className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200/70 dark:border-slate-700 hover:border-emerald-400 transition cursor-pointer"
            >
              <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>Sarana Fisik</span>
                <span className="font-bold text-emerald-600">{facilityHealthRate}%</span>
              </div>
              <div className="font-bold text-slate-800 dark:text-slate-200 text-xs mt-0.5">
                {totalKamar - maintKamar}/{totalKamar} Prima
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-700 h-1 rounded-full overflow-hidden mt-1.5">
                <div className="bg-emerald-600 h-full rounded-full" style={{ width: `${facilityHealthRate}%` }} />
              </div>
            </div>

            {/* Pilar 3: Dapur & Katering */}
            <div 
              onClick={() => setActiveTab('pesananSarapan')} 
              className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200/70 dark:border-slate-700 hover:border-amber-400 transition cursor-pointer"
            >
              <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>Dapur & Sarapan</span>
                <span className="font-bold text-amber-600">{totalBreakfastPortions} Porsi</span>
              </div>
              <div className="font-bold text-slate-800 dark:text-slate-200 text-xs mt-0.5 truncate">
                {activeBreakfastList.length} Kamar Terjadwal
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-700 h-1 rounded-full overflow-hidden mt-1.5">
                <div className="bg-amber-500 h-full rounded-full" style={{ width: `${Math.min(100, (activeBreakfastList.length / Math.max(1, terisiKamar)) * 100)}%` }} />
              </div>
            </div>

            {/* Pilar 4: Aula Pertemuan */}
            <div 
              onClick={() => setActiveTab('gedung')} 
              className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200/70 dark:border-slate-700 hover:border-purple-400 transition cursor-pointer"
            >
              <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>Aula & R. Rapat</span>
                <span className="font-bold text-purple-600">{aulaEventsToday.length} Acara</span>
              </div>
              <div className="font-bold text-slate-800 dark:text-slate-200 text-xs mt-0.5">
                {totalAula} Unit Aula Siap
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-700 h-1 rounded-full overflow-hidden mt-1.5">
                <div className="bg-purple-600 h-full rounded-full" style={{ width: `${Math.min(100, (aulaEventsToday.length / Math.max(1, totalAula)) * 100)}%` }} />
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[10.5px]">
            <span className="text-slate-500 dark:text-slate-400">Standarisasi Layanan Asrama Haji</span>
            <button
              type="button"
              onClick={() => setActiveChartPopup('SYSTEM_TREND')}
              className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer flex items-center gap-1"
            >
              <span>Audit Mutu →</span>
            </button>
          </div>
        </div>

      </div>
    </motion.section>
  );
}
