// @ts-nocheck
import { useState, useRef, useEffect } from 'react';
import { useAppContext, isSuperAdmin, isKeuanganRole } from '../store';
import { OperationalNotifications, OperationalSummaryRibbon } from './OperationalNotifications';
import { useBodyScrollLock } from '../lib/scrollLock';

export function Header() {
  const { 
    currentUser, login, logout, activeTab, setActiveTab, openModal, users, showToast, isDarkMode, toggleDarkMode, appSettings,
    supabaseSyncState, manualSyncSupabase
  } = useAppContext();
  const [isSwitchOpen, setIsSwitchOpen] = useState(false);
  const switchRef = useRef<HTMLDivElement>(null);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useBodyScrollLock(isSwitchOpen && isMobile);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (switchRef.current && !switchRef.current.contains(e.target as Node)) {
        setIsSwitchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!currentUser) return null;

  const ALL_TABS_CONFIG = [
    { 
      id: 'dashboard', 
      label: 'Dashboard', 
      icon: 'fa-chart-pie', 
      roles: ['Super Admin', 'Admin', 'Manager Resepsionis', 'Resepsionis', 'Manager Keuangan', 'Bendahara', 'Keuangan', 'Bendahara / Keuangan', 'Staff Keuangan', 'Manager QC', 'Quality Control', 'Manager Teknisi', 'Teknisi', 'Manager Koperasi', 'Petugas Koperasi', 'Koperasi', 'Manager'] 
    },
    { 
      id: 'gedung', 
      label: 'Manajemen Gedung', 
      icon: 'fa-building', 
      roles: ['Super Admin', 'Admin', 'Manager Resepsionis', 'Resepsionis', 'Manager Keuangan', 'Bendahara', 'Keuangan', 'Bendahara / Keuangan', 'Staff Keuangan', 'Manager QC', 'Quality Control', 'Manager Teknisi', 'Teknisi', 'Manager Koperasi', 'Petugas Koperasi', 'Koperasi', 'Manager'] 
    },
    { 
      id: 'pesananSarapan', 
      label: 'Pesanan Makan', 
      icon: 'fa-utensils', 
      roles: ['Super Admin', 'Admin', 'Manager Koperasi', 'Petugas Koperasi', 'Manager Resepsionis', 'Resepsionis', 'Manager', 'Koperasi'] 
    },
    { 
      id: 'qualityControl', 
      label: 'Pengecekan (QC)', 
      icon: 'fa-clipboard-check', 
      roles: ['Super Admin', 'Admin', 'Manager QC', 'Quality Control', 'Manager Resepsionis', 'Manager'] 
    },
    { 
      id: 'laporanMaintenance', 
      label: 'Laporan Perawatan', 
      icon: 'fa-screwdriver-wrench', 
      roles: ['Super Admin', 'Admin', 'Manager Teknisi', 'Teknisi', 'Manager QC', 'Quality Control', 'Manager Resepsionis', 'Manager'] 
    },
    { 
      id: 'laporanKamar', 
      label: 'Laporan & Kwitansi', 
      icon: 'fa-file-invoice', 
      roles: ['Super Admin', 'Admin', 'Manager Resepsionis', 'Resepsionis', 'Manager', 'Manager Keuangan', 'Bendahara / Keuangan', 'Bendahara', 'Keuangan', 'Staff Keuangan'] 
    },
    { 
      id: 'auditLog', 
      label: 'Manajemen Sistem', 
      icon: 'fa-gears', 
      roles: ['Super Admin', 'Admin', 'Manager Resepsionis', 'Resepsionis', 'Manager Keuangan', 'Bendahara / Keuangan', 'Bendahara', 'Keuangan', 'Staff Keuangan', 'Manager QC', 'Quality Control', 'Manager Teknisi', 'Teknisi', 'Manager Koperasi', 'Petugas Koperasi', 'Koperasi', 'Manager'] 
    },
    { 
      id: 'kelolaAnggota', 
      label: 'Kelola Anggota', 
      icon: 'fa-users-gear', 
      roles: ['Super Admin', 'Admin'] 
    }
  ];

  const getDefaultTabForRole = (_role: string): string => {
    return 'dashboard';
  };

  const handleSwitchAccount = (user: typeof users[0]) => {
    login(user);
    setIsSwitchOpen(false);
    setActiveTab('dashboard');
    showToast(`Beralih akun: ${user.fullName} (${user.role}) - Membuka Dashboard`, 'success');
  };

  const tabs = ALL_TABS_CONFIG.filter(tab => tab.roles.includes(currentUser.role));

  // Group users for switcher dropdown
  const divisions = [
    { 
      name: 'Administrator (Super Admin & Admin)', 
      color: 'text-emerald-600 font-bold', 
      users: users.filter(u => isSuperAdmin(u.role) || String(u.username || '').toLowerCase() === 'admin') 
    },
    { name: 'Divisi Resepsionis', color: 'text-blue-600', users: users.filter(u => String(u.role || '').includes('Resepsionis')) },
    { 
      name: 'Divisi Keuangan & Perbendaharaan', 
      color: 'text-emerald-700 font-bold', 
      users: users.filter(u => isKeuanganRole(u.role, u.department)) 
    },
    { name: 'Divisi Quality Control', color: 'text-teal-600', users: users.filter(u => String(u.role || '').includes('QC') || String(u.role || '').includes('Quality')) },
    { name: 'Divisi Teknisi', color: 'text-amber-600', users: users.filter(u => String(u.role || '').includes('Teknisi')) },
    { name: 'Divisi Koperasi', color: 'text-orange-600', users: users.filter(u => String(u.role || '').includes('Koperasi')) },
  ];

  return (
    <header className="bg-gradient-to-r from-hajj-900 via-hajj-800 to-slate-900 text-white shadow-md sticky top-0 z-40 no-print">
      <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-12 sm:h-16">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
            <div className={`w-7 h-7 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-bold text-sm sm:text-xl shadow-md border overflow-hidden shrink-0 ${appSettings?.appLogo && typeof appSettings.appLogo === 'string' && (appSettings.appLogo.startsWith('data:') || appSettings.appLogo.startsWith('http') || appSettings.appLogo.startsWith('blob:') || appSettings.appLogo.startsWith('/')) ? 'bg-transparent border-0 shadow-none' : 'bg-gold-500 text-slate-900 border-gold-400'}`}>
              {appSettings?.appLogo && typeof appSettings.appLogo === 'string' && (appSettings.appLogo.startsWith('data:') || appSettings.appLogo.startsWith('http') || appSettings.appLogo.startsWith('blob:') || appSettings.appLogo.startsWith('/')) ? (
                <img src={appSettings.appLogo} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <i className={`fa-solid ${appSettings?.appLogo || 'fa-kaaba'}`}></i>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-xs sm:text-base md:text-lg tracking-wide text-white truncate leading-tight">{appSettings?.organizationName || 'ASRAMA HAJI JAKARTA'}</h1>
              <p className="text-[9px] sm:text-xs text-gold-400 font-medium hidden sm:block truncate">{appSettings?.subTitle || 'SIM - Sistem Informasi Manajemen'}</p>
            </div>
          </div>

          <div className="flex items-center space-x-1 sm:space-x-3 ml-auto shrink-0">
            {/* Dark Mode Toggle & Notifications Compact Icon Buttons */}
            <div className="flex items-center space-x-1 sm:space-x-2 bg-white/10 p-1 sm:p-1.5 rounded-lg sm:rounded-xl border border-white/15">
              <button
                type="button"
                onClick={toggleDarkMode}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-white/15 hover:bg-white/25 text-gold-400 border border-white/20 flex items-center justify-center transition cursor-pointer shadow-xs"
                title={isDarkMode ? "Mode Gelap aktif. Klik untuk beralih ke Mode Terang (Matahari)." : "Mode Terang aktif. Klik untuk beralih ke Mode Gelap (Bulan)."}
                aria-label={`Beralih mode tema, saat ini ${isDarkMode ? 'Mode Gelap' : 'Mode Terang'}`}
              >
                <i className={`fa-solid ${isDarkMode ? 'fa-sun text-amber-300 text-xs sm:text-sm' : 'fa-moon text-gold-300 text-xs sm:text-sm'}`}></i>
              </button>
              <div className="h-3.5 sm:h-5 w-px bg-white/15"></div>
              <OperationalNotifications />
            </div>

            {/* Unified Super Admin / User Account Menu */}
            <div className="relative" ref={switchRef}>
              <button
                type="button"
                onClick={() => setIsSwitchOpen(prev => !prev)}
                className="flex items-center space-x-1 sm:space-x-2 p-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl border text-xs bg-white/10 hover:bg-white/20 backdrop-blur-md border-white/20 cursor-pointer hover:ring-2 hover:ring-gold-400 transition-all text-left shadow-xs"
                title="Buka Menu Akun Super Admin & Pengaturan"
              >
                <div className="relative shrink-0 flex items-center space-x-1">
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md sm:rounded-lg bg-gold-500 text-slate-900 font-bold flex items-center justify-center text-[10px] sm:text-xs shadow-xs">
                    {currentUser.role.includes('Admin') ? (
                      <i className="fa-solid fa-user-shield text-[10px] sm:text-[12px]"></i>
                    ) : (
                      currentUser.fullName.charAt(0)
                    )}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-400 border-2 border-slate-900"></div>
                  <i className={`fa-solid fa-chevron-down text-[7px] sm:text-[8px] text-gold-300 sm:hidden transition-transform ml-0.5 ${isSwitchOpen ? 'rotate-180' : ''}`}></i>
                </div>
                <div className="hidden sm:flex flex-col text-left">
                  <span className="font-bold text-gold-400 text-[10px] leading-tight flex items-center space-x-1">
                    <span className="truncate max-w-[90px]">{currentUser.role}</span>
                    <i className={`fa-solid fa-chevron-down text-[8px] text-gold-300 transition-transform ${isSwitchOpen ? 'rotate-180' : ''}`}></i>
                  </span>
                  <span className="text-slate-200 text-[11px] font-medium leading-tight truncate max-w-[120px]">
                    {currentUser.fullName}
                  </span>
                </div>
              </button>

              {isSwitchOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-xs lg:bg-transparent lg:inset-auto lg:p-0 lg:absolute lg:right-0 lg:top-full lg:mt-2 lg:z-40">
                  {/* Mobile & Tablet backdrop */}
                  <div 
                    className="fixed inset-0 bg-transparent lg:hidden" 
                    onClick={() => setIsSwitchOpen(false)} 
                  />

                  <div className="relative z-10 w-full h-full sm:h-auto sm:max-h-[86vh] sm:max-w-md lg:w-96 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden text-xs flex flex-col animate-in fade-in zoom-in-95 duration-150">
                    {/* 1. Header Profil Super Admin / Petugas (MUNCUL PERTAMA) */}
                    <div className="p-3 sm:p-3.5 bg-gradient-to-r from-hajj-900 via-slate-900 to-hajj-950 text-white space-y-2 shrink-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gold-500 text-slate-900 font-extrabold flex items-center justify-center text-xs sm:text-sm shadow-md shrink-0">
                            {currentUser.role.includes('Admin') ? (
                              <i className="fa-solid fa-user-shield"></i>
                            ) : (
                              currentUser.fullName.charAt(0)
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center space-x-1.5">
                              <h4 className="font-bold text-xs sm:text-sm text-white truncate">{currentUser.fullName}</h4>
                              <span className="text-[9px] bg-gold-400/20 text-gold-300 px-1.5 py-0.2 rounded font-bold border border-gold-400/30 shrink-0">
                                {currentUser.role}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-300 font-mono">@{currentUser.username}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsSwitchOpen(false)}
                          className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer text-xs shrink-0"
                          title="Tutup Menu Akun"
                        >
                          <i className="fa-solid fa-xmark"></i>
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-1.5 border-t border-white/10 text-[10px] sm:text-[11px] text-slate-300">
                        <div className="flex items-center space-x-1.5 truncate">
                          <i className="fa-solid fa-building-user text-gold-400 text-xs shrink-0"></i>
                          <span className="truncate">{currentUser.department || 'Pimpinan & IT UPT'}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsSwitchOpen(false);
                            logout();
                          }}
                          className="px-2 py-0.5 sm:px-2.5 sm:py-1 bg-red-600 hover:bg-red-700 text-white rounded-md font-bold text-[10px] sm:text-[11px] flex items-center space-x-1 transition border border-red-400/40 shrink-0 cursor-pointer shadow-2xs"
                          title="Keluar dari sesi saat ini"
                        >
                          <i className="fa-solid fa-right-from-bracket text-[10px]"></i>
                          <span>Keluar</span>
                        </button>
                      </div>
                    </div>

                  {/* 2. MENU PENGATURAN AKUN & STATUS DATABASE */}
                  <div className="p-3 overflow-y-auto custom-scrollbar space-y-2.5 flex-1 bg-slate-50/50 dark:bg-slate-900">
                    {/* 2a. Konfigurasi Judul & Logo Web (KHUSUS SUPER ADMIN & ADMIN) */}
                    {isSuperAdmin(currentUser.role) && (
                      <div className="p-3 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-600/70 rounded-xl space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/80 text-amber-800 dark:text-amber-300 flex items-center justify-center text-xs shrink-0">
                              <i className="fa-solid fa-palette"></i>
                            </div>
                            <div>
                              <span className="font-bold text-slate-900 dark:text-slate-100 text-xs block">Konfigurasi Judul &amp; Logo Web</span>
                              <span className="text-[10px] text-slate-500 dark:text-slate-300 block">Identitas Instansi, Favicon &amp; Tampilan</span>
                            </div>
                          </div>
                          <span className="text-[9px] bg-amber-100 dark:bg-amber-900/80 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded font-bold border border-amber-300 dark:border-amber-700">
                            Admin
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setIsSwitchOpen(false);
                            openModal('modalAccountProfile', { section: 'BRANDING' });
                          }}
                          className="w-full py-1.5 px-3 bg-amber-50 dark:bg-slate-700 hover:bg-amber-100 dark:hover:bg-slate-600 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-500 rounded-lg text-xs font-bold flex items-center justify-center space-x-2 transition cursor-pointer shadow-xs"
                        >
                          <i className="fa-solid fa-pen-ruler text-amber-600 dark:text-amber-400"></i>
                          <span>Buka Pengaturan Judul &amp; Logo</span>
                        </button>
                      </div>
                    )}

                    {/* 2b. Profil Akun (TERSEDIA UNTUK SEMUA AKUN PETUGAS & ADMIN) */}
                    <div className="p-3 bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-600/70 rounded-xl space-y-2 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/80 text-emerald-800 dark:text-emerald-300 flex items-center justify-center text-xs shrink-0">
                            <i className="fa-solid fa-user-gear"></i>
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 dark:text-slate-100 text-xs block">Profil Akun Saya</span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-300 block">Kredensial Login, TTD Digital &amp; Kontak Pribadi</span>
                          </div>
                        </div>
                        <span className="text-[9px] bg-emerald-100 dark:bg-emerald-900/80 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.5 rounded font-bold border border-emerald-300 dark:border-emerald-700">
                          Akun
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setIsSwitchOpen(false);
                          openModal('modalAccountProfile', { section: 'PROFIL' });
                        }}
                        className="w-full py-1.5 px-3 bg-emerald-50 dark:bg-slate-700 hover:bg-emerald-100 dark:hover:bg-slate-600 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-500 rounded-lg text-xs font-bold flex items-center justify-center space-x-2 transition cursor-pointer shadow-xs"
                      >
                        <i className="fa-solid fa-user-pen text-emerald-600 dark:text-emerald-400"></i>
                        <span>Buka Pengaturan Profil Akun</span>
                      </button>
                    </div>

                    {/* 3b. Status Sync dengan Database (Google Spreadsheet Utama) */}
                    <div className="p-3 bg-white dark:bg-slate-800 border border-sky-200 dark:border-sky-600/70 rounded-xl space-y-1.5 shadow-2xs">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-2">
                          <div className="w-7 h-7 rounded-lg bg-sky-100 dark:bg-sky-900/80 text-sky-700 dark:text-sky-300 flex items-center justify-center text-xs shrink-0">
                            <i className="fa-solid fa-cloud-bolt"></i>
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 dark:text-slate-100 text-xs block">Status Sync Database</span>
                            <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold block">Google Spreadsheet Utama</span>
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1 shrink-0 ${
                          supabaseSyncState?.isSyncing
                            ? 'bg-blue-100 dark:bg-blue-900/80 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 animate-pulse'
                            : supabaseSyncState?.lastError
                            ? 'bg-rose-100 dark:bg-rose-900/80 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700'
                            : 'bg-emerald-100 dark:bg-emerald-900/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            supabaseSyncState?.isSyncing
                              ? 'bg-blue-600 dark:bg-blue-400'
                              : supabaseSyncState?.lastError
                              ? 'bg-rose-600 dark:bg-rose-400'
                              : 'bg-emerald-600 dark:bg-emerald-400 animate-ping'
                          }`}></span>
                          <span>
                            {supabaseSyncState?.isSyncing
                              ? 'Menyinkronkan...'
                              : supabaseSyncState?.lastError
                              ? 'Gangguan Koneksi'
                              : 'Terhubung Real-Time'}
                          </span>
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-700/70">
                        <span>Sinkronisasi instan otomatis</span>
                        {supabaseSyncState?.lastSyncedAt && (
                          <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                            {new Date(supabaseSyncState.lastSyncedAt).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            })} WIB
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 3c. Integrasi Google Spreadsheet (Khusus Admin & Super Admin) */}
                    {currentUser && (isSuperAdmin(currentUser.role) || currentUser.role === 'Admin') && (
                      <div className="p-3 bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-600/70 rounded-xl space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/80 text-emerald-800 dark:text-emerald-300 flex items-center justify-center text-xs shrink-0">
                              <i className="fa-solid fa-file-excel"></i>
                            </div>
                            <div>
                              <span className="font-bold text-slate-900 dark:text-slate-100 text-xs block">Google Spreadsheet</span>
                              <span className="text-[10px] text-slate-500 dark:text-slate-300 block">Baca &amp; Sinkronisasi Data Sheet</span>
                            </div>
                          </div>
                          <span className="text-[9px] bg-emerald-100 dark:bg-emerald-900/80 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.5 rounded font-bold border border-emerald-300 dark:border-emerald-700">
                            Apps Script
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsSwitchOpen(false);
                            setActiveTab('spreadsheetSync');
                          }}
                          className="w-full py-1.5 px-3 bg-emerald-50 dark:bg-slate-700 hover:bg-emerald-100 dark:hover:bg-slate-600 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-500 rounded-lg text-xs font-bold flex items-center justify-center space-x-2 transition cursor-pointer shadow-xs"
                        >
                          <i className="fa-solid fa-arrow-right-to-bracket text-emerald-600 dark:text-emerald-400"></i>
                          <span>Buka Panel Google Spreadsheet</span>
                        </button>
                      </div>
                    )}
                    {/* Mobile & Tablet Bottom Close Action Bar */}
                    <div className="lg:hidden p-2.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsSwitchOpen(false)}
                        className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-lg text-xs transition flex items-center justify-center space-x-2 cursor-pointer shadow-2xs"
                      >
                        <i className="fa-solid fa-arrow-left text-xs"></i>
                        <span>Tutup Menu Akun</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      </div>

      {/* Operational Highlights Ribbon (Checkin, Checkout, Breakfast, Urgent Maintenance, QC) */}
      <OperationalSummaryRibbon />

      <div className="bg-hajj-900/95 border-t border-white/10 px-2 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex space-x-1 overflow-x-auto custom-scrollbar py-1">
          {tabs.map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id)} 
              className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs transition-all flex items-center space-x-1.5 shrink-0 whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'text-gold-400 bg-white/12 font-bold shadow-2xs' 
                  : 'text-slate-300 hover:text-white hover:bg-white/5 font-medium'
              }`}
            >
              <i className={`fa-solid ${tab.icon} text-[10px] sm:text-[11px]`}></i>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
