// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { useAppContext } from '../store';
import { UserRole } from '../types';
import { useBodyScrollLock } from '../lib/scrollLock';
import { compareBuildingOrder } from '../lib/utils';
import { dataStorage } from '../services/dataStorage';

export function Login() {
  const { login, users, buildings = [], showToast, appSettings, registerAccountRequest, requestPasswordReset, pullFromCentralDatabase } = useAppContext();

  // Kunci scrollbar laman utama selama halaman login aktif agar tidak ada scrollbar browser
  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, []);

  // State Ingat Sesi Perangkat (Default false agar menutup browser/tab otomatis keluar)
  const [rememberDevice, setRememberDevice] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('sim_haji_remember_session');
      return stored === 'true';
    } catch {
      return false;
    }
  });

  // State Username & Password terhubung aktif HANYA jika pengguna memilih Ingat Sesi
  const [username, setUsername] = useState<string>(() => {
    try {
      const isRemember = localStorage.getItem('sim_haji_remember_session');
      if (isRemember === 'true') {
        return localStorage.getItem('sim_haji_remembered_username') || '';
      }
      return '';
    } catch {
      return '';
    }
  });

  const [password, setPassword] = useState<string>(() => {
    try {
      const isRemember = localStorage.getItem('sim_haji_remember_session');
      if (isRemember === 'true') {
        return localStorage.getItem('sim_haji_remembered_password') || '';
      }
      return '';
    } catch {
      return '';
    }
  });

  const [showPassword, setShowPassword] = useState(false);

  // Modals for Daftar Akun & Lupa Password
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  useBodyScrollLock(Boolean(showRegisterModal || showForgotPasswordModal));

  // Form State: Daftar Akun
  const [regFullName, setRegFullName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regRole, setRegRole] = useState<UserRole>('Resepsionis');
  const [regDepartment, setRegDepartment] = useState('Pelayanan & Resepsionis');
  const [regBuilding, setRegBuilding] = useState('Semua Gedung');
  const [regPhone, setRegPhone] = useState('');
  const [regError, setRegError] = useState('');
  const [regSuccessMsg, setRegSuccessMsg] = useState('');

  // Form State: Lupa Password
  const [fpUsername, setFpUsername] = useState('');
  const [fpNewPassword, setFpNewPassword] = useState('');
  const [fpConfirmPassword, setFpConfirmPassword] = useState('');
  const [fpNotes, setFpNotes] = useState('');
  const [fpError, setFpError] = useState('');
  const [fpSuccessMsg, setFpSuccessMsg] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const executeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoggingIn) return;

    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanUser) {
      showToast("Silakan masukkan Username / NIP Petugas!", "warning");
      return;
    }
    if (!cleanPass) {
      showToast("Silakan masukkan Kata Sandi!", "warning");
      return;
    }

    setIsLoggingIn(true);
    const startMs = Date.now();

    try {
      // 1. Tarik & sinkronkan data termutakhir dari basis data Spreadsheet agar data di setiap akun yang login identik
      try {
        await Promise.race([
          pullFromCentralDatabase(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2800))
        ]);
      } catch (_) {
        // Fallback cepat jika timeout: tetap lanjutkan dengan data lokal tersimpan
      }

      // Berikan jeda halus minimal 400ms agar animasi titik berjalan terlihat jelas
      const elapsed = Date.now() - startMs;
      if (elapsed < 400) {
        await new Promise(r => setTimeout(r, 400 - elapsed));
      }

      // 2. Ambil daftar users terbaru setelah penarikan database
      const currentUsers = dataStorage.getUsers();
      const userList = currentUsers && currentUsers.length > 0 ? currentUsers : users;
      const foundUser = userList.find(u => u.username.toLowerCase() === cleanUser);
      
      if (!foundUser) {
        showToast("Username / NIP tidak terdaftar di pangkalan data!", "error");
        setIsLoggingIn(false);
        return;
      }

      if (foundUser.status === 'Menunggu Persetujuan') {
        showToast("Pendaftaran akun Anda masih menunggu persetujuan (ACC) dari Administrator!", "warning");
        setIsLoggingIn(false);
        return;
      }

      if (foundUser.status === 'Non-Aktif') {
        showToast("Akses Ditolak: Akun petugas ini berstatus Non-Aktif. Hubungi Administrator!", "error");
        setIsLoggingIn(false);
        return;
      }

      const expectedPassword = foundUser.password || '12345';
      if (cleanPass !== expectedPassword) {
        showToast("Kata sandi yang Anda masukkan tidak cocok!", "error");
        setIsLoggingIn(false);
        return;
      }

      try {
        if (rememberDevice) {
          localStorage.setItem('sim_haji_remember_session', 'true');
          localStorage.setItem('sim_haji_remembered_username', cleanUser);
          localStorage.setItem('sim_haji_remembered_password', cleanPass);
        } else {
          localStorage.setItem('sim_haji_remember_session', 'false');
          localStorage.removeItem('sim_haji_remembered_username');
          localStorage.removeItem('sim_haji_remembered_password');
        }
      } catch (_) {}

      login(foundUser, undefined, rememberDevice);
    } catch (err: any) {
      showToast(`Terjadi kesalahan saat masuk: ${err?.message || 'Error'}`, 'error');
      setIsLoggingIn(false);
    }
  };

  const handleRoleSelection = (selected: UserRole) => {
    setRegRole(selected);
    if (selected === 'Super Admin' || selected === 'Admin') {
      setRegDepartment('Pimpinan / Tata Usaha');
    } else if (selected === 'Resepsionis') {
      setRegDepartment('Pelayanan & Resepsionis');
    } else if (selected === 'Quality Control') {
      setRegDepartment('Pengawasan Mutu Hunian');
    } else if (selected === 'Teknisi') {
      setRegDepartment('Sarana & Prasarana');
    } else if (selected === 'Petugas Koperasi') {
      setRegDepartment('Koperasi & Konsumsi');
    }
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    setRegSuccessMsg('');

    if (!regFullName.trim()) {
      setRegError('Nama lengkap wajib diisi!');
      return;
    }
    if (!regUsername.trim()) {
      setRegError('Username / NIP wajib diisi!');
      return;
    }
    if (!regPassword || regPassword.length < 3) {
      setRegError('Kata sandi minimal 3 karakter!');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setRegError('Konfirmasi kata sandi tidak sesuai!');
      return;
    }

    const res = registerAccountRequest({
      fullName: regFullName,
      username: regUsername,
      password: regPassword,
      role: regRole,
      department: regDepartment,
      assignedBuilding: regBuilding,
      phone: regPhone || '-'
    });

    if (!res.success) {
      setRegError(res.message);
      return;
    }

    setRegSuccessMsg(res.message);
    showToast(res.message, 'success');
    setTimeout(() => {
      setShowRegisterModal(false);
      setRegSuccessMsg('');
      setRegFullName('');
      setRegUsername('');
      setRegPassword('');
      setRegConfirmPassword('');
      setRegPhone('');
    }, 2500);
  };

  const handleForgotPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFpError('');
    setFpSuccessMsg('');

    if (!fpUsername.trim()) {
      setFpError('Username / NIP petugas wajib diisi!');
      return;
    }
    if (!fpNewPassword || fpNewPassword.length < 3) {
      setFpError('Kata sandi baru minimal 3 karakter!');
      return;
    }
    if (fpNewPassword !== fpConfirmPassword) {
      setFpError('Konfirmasi kata sandi baru tidak sesuai!');
      return;
    }

    const res = requestPasswordReset(fpUsername, fpNewPassword, fpNotes);
    if (!res.success) {
      setFpError(res.message);
      return;
    }

    setFpSuccessMsg(res.message);
    showToast(res.message, 'success');
    setTimeout(() => {
      setShowForgotPasswordModal(false);
      setFpSuccessMsg('');
      setFpUsername('');
      setFpNewPassword('');
      setFpConfirmPassword('');
      setFpNotes('');
    }, 2500);
  };

  return (
    <div className="h-screen w-full bg-[#2e1d11] relative flex items-center justify-center p-2 sm:p-4 overflow-hidden font-sans select-none">
      {/* Official Geometric Ambient Background */}
      <div className="absolute inset-0 bg-[radial-gradient(#cca241_1px,transparent_1px)] [background-size:28px_28px] opacity-15 pointer-events-none"></div>
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-hajj-700/40 blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-gold-500/25 blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden border border-gold-500/40 relative z-10 flex flex-col max-h-[calc(100vh-1rem)] my-auto">
        {/* Official Header Banner - Kementerian Haji dan Umrah RI */}
        <div className="bg-gradient-to-b from-hajj-900 via-hajj-800 to-hajj-900 px-4 py-3 sm:px-5 sm:py-3.5 text-white text-center relative border-b-2 border-gold-500 shrink-0">
          <div className="flex items-center justify-center mb-1.5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl flex items-center justify-center overflow-hidden shrink-0 transition-transform hover:scale-105 duration-200 bg-transparent border-0 shadow-none text-gold-400">
              {appSettings?.appLogo && (appSettings.appLogo.startsWith('data:') || appSettings.appLogo.startsWith('http') || appSettings.appLogo.startsWith('blob:') || appSettings.appLogo.startsWith('/')) ? (
                <img src={appSettings.appLogo} alt="Logo Asrama Haji" className="w-full h-full object-contain filter drop-shadow" />
              ) : (
                <i className={`fa-solid ${appSettings?.appLogo || 'fa-kaaba'} text-3xl sm:text-4xl drop-shadow-xs`}></i>
              )}
            </div>
          </div>
          
          <h1 className="text-sm sm:text-base font-black text-white tracking-tight leading-snug">
            {appSettings?.organizationName || 'ASRAMA HAJI JAKARTA'}
          </h1>
          <p className="text-[9.5px] sm:text-[10px] text-gold-100/90 mt-0.5 font-medium max-w-xs mx-auto mb-1">
            {appSettings?.subTitle || 'SIM - Sistem Informasi Manajemen'}
          </p>
          <span className="text-[8px] sm:text-[8.5px] uppercase tracking-wider text-gold-300 font-extrabold bg-gold-400/15 border border-gold-400/40 px-2 py-0.5 rounded-full inline-block">
            {appSettings?.ministryName || 'KEMENTERIAN HAJI DAN UMRAH REPUBLIK INDONESIA'}
          </span>
        </div>

        {/* Login Form Container */}
        <div className="p-3.5 sm:p-4 space-y-2.5 bg-white flex-1 overflow-y-auto custom-scrollbar">
          <form onSubmit={executeLogin} className="space-y-2.5">
            <div>
              <label className="block text-[10px] font-bold text-slate-800 uppercase tracking-wider mb-1">
                Username / NIP Petugas
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                  <i className="fa-solid fa-id-card-clip text-xs"></i>
                </span>
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required 
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-hajj-600 focus:border-hajj-600 focus:bg-white outline-none transition font-medium text-slate-900" 
                  placeholder="Masukkan Username" 
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-800 uppercase tracking-wider mb-1">
                Kata Sandi
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                  <i className="fa-solid fa-lock text-xs"></i>
                </span>
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required 
                  className="w-full pl-8 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-hajj-600 focus:border-hajj-600 focus:bg-white outline-none transition font-medium text-slate-900" 
                  placeholder="Masukkan Kata Sandi" 
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  title={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                >
                  <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-xs`}></i>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-600 pt-0.5">
              <label htmlFor="rememberDeviceCheckbox" className="flex items-center space-x-1.5 cursor-pointer select-none py-0.5">
                <input 
                  id="rememberDeviceCheckbox"
                  type="checkbox" 
                  checked={rememberDevice}
                  onChange={(e) => {
                    const val = e.target.checked;
                    setRememberDevice(val);
                    try {
                      if (val) {
                        localStorage.setItem('sim_haji_remember_session', 'true');
                        if (username.trim()) localStorage.setItem('sim_haji_remembered_username', username.trim().toLowerCase());
                        if (password.trim()) localStorage.setItem('sim_haji_remembered_password', password);
                      } else {
                        localStorage.setItem('sim_haji_remember_session', 'false');
                        localStorage.removeItem('sim_haji_remembered_username');
                        localStorage.removeItem('sim_haji_remembered_password');
                      }
                    } catch (_) {}
                  }}
                  className="rounded text-hajj-700 focus:ring-hajj-600 w-3.5 h-3.5 cursor-pointer accent-hajj-800" 
                />
                <span className="text-[10px] font-medium text-slate-700">Ingat sesi saya di perangkat ini (otomatis keluar jika browser ditutup)</span>
              </label>
            </div>

            <button 
              type="submit" 
              disabled={isLoggingIn}
              className="w-full py-2.5 bg-gradient-to-r from-hajj-800 to-hajj-700 hover:from-hajj-900 hover:to-hajj-800 disabled:opacity-90 disabled:cursor-wait text-white font-bold rounded-lg shadow-sm hover:shadow transition-all flex items-center justify-center space-x-2 cursor-pointer mt-0.5 text-xs select-none"
            >
              {isLoggingIn ? (
                <div className="flex items-center space-x-1.5 font-bold tracking-wide text-xs">
                  <i className="fa-solid fa-circle-notch fa-spin text-gold-300 text-xs"></i>
                  <span>Menyinkronkan Data</span>
                  <span className="inline-flex tracking-widest font-black text-gold-300">
                    <span className="inline-block animate-bounce [animation-delay:-0.3s]">.</span>
                    <span className="inline-block animate-bounce [animation-delay:-0.15s]">.</span>
                    <span className="inline-block animate-bounce">.</span>
                  </span>
                </div>
              ) : (
                <>
                  <i className="fa-solid fa-right-to-bracket text-xs text-gold-300"></i>
                  <span>Masuk</span>
                </>
              )}
            </button>
          </form>

          {/* Fitur Daftar Akun & Lupa Password */}
          <div className="pt-2.5 border-t border-slate-200">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setRegError('');
                  setRegSuccessMsg('');
                  setShowRegisterModal(true);
                }}
                className="w-full py-1.5 px-2 rounded-lg border border-hajj-700/25 bg-hajj-50/60 hover:bg-hajj-100/70 text-hajj-900 transition flex items-center justify-center space-x-1.5 text-[10.5px] font-bold cursor-pointer shadow-xs hover:border-hajj-700/40"
              >
                <i className="fa-solid fa-user-plus text-hajj-700 text-xs"></i>
                <span>Daftar Akun</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setFpError('');
                  setFpSuccessMsg('');
                  if (username.trim()) setFpUsername(username.trim());
                  setShowForgotPasswordModal(true);
                }}
                className="w-full py-1.5 px-2 rounded-lg border border-amber-300 bg-amber-50/70 hover:bg-amber-100/70 text-amber-950 transition flex items-center justify-center space-x-1.5 text-[10.5px] font-bold cursor-pointer shadow-xs hover:border-amber-400"
              >
                <i className="fa-solid fa-key text-amber-700 text-xs"></i>
                <span>Lupa Password?</span>
              </button>
            </div>

            <div className="mt-2 px-2.5 py-1 bg-slate-50 border border-slate-200/80 rounded-lg text-center">
              <p className="text-[9.5px] text-slate-500 font-medium">
                Pendaftaran akun dan permohonan lupa password akan diverifikasi oleh Administrator.
              </p>
            </div>
          </div>

          <div className="text-center pt-0.5">
            <p className="text-[9px] text-slate-400">
              Hak Cipta © {new Date().getFullYear()} Kementerian Haji dan Umrah Republik Indonesia
            </p>
          </div>
        </div>
      </div>

      {/* Modal 1: Daftar Akun Baru */}
      {showRegisterModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setShowRegisterModal(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-gold-500/40 w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-hajj-900 to-hajj-800 text-white px-5 py-3.5 flex items-center justify-between border-b-2 border-gold-500 shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-gold-500/20 border border-gold-400/40 flex items-center justify-center text-gold-300">
                  <i className="fa-solid fa-user-plus text-sm"></i>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Daftar Akun Petugas Baru</h3>
                  <p className="text-[10.5px] text-gold-200 font-normal">Memerlukan persetujuan (ACC) oleh Administrator</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowRegisterModal(false)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-xs"></i>
              </button>
            </div>

            <form onSubmit={handleRegisterSubmit} className="p-4 sm:p-5 space-y-3 overflow-y-auto custom-scrollbar flex-1">
              {regError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center space-x-2">
                  <i className="fa-solid fa-circle-exclamation text-rose-500 shrink-0"></i>
                  <span>{regError}</span>
                </div>
              )}
              {regSuccessMsg && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center space-x-2">
                  <i className="fa-solid fa-circle-check text-emerald-500 shrink-0"></i>
                  <span>{regSuccessMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Nama Lengkap Petugas *
                  </label>
                  <input
                    type="text"
                    required
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                    placeholder="Contoh: Ahmad Fauzi, S.Kom"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-hajj-600 focus:border-hajj-600 focus:bg-white outline-none font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Username / NIP *
                  </label>
                  <input
                    type="text"
                    required
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder="Contoh: ahmad.fauzi"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-hajj-600 focus:border-hajj-600 focus:bg-white outline-none font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Peran / Jabatan *
                  </label>
                  <select
                    value={regRole}
                    onChange={(e) => handleRoleSelection(e.target.value as UserRole)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-hajj-600 focus:border-hajj-600 focus:bg-white outline-none font-medium text-slate-800 cursor-pointer"
                  >
                    <option value="Resepsionis">Resepsionis (Front Office)</option>
                    <option value="Quality Control">Quality Control (QC Mutu)</option>
                    <option value="Teknisi">Teknisi & Sarpras</option>
                    <option value="Petugas Koperasi">Petugas Koperasi / Konsumsi</option>
                    <option value="Admin">Admin Operasional</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    No. Handphone / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="Contoh: 081234567890"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-hajj-600 focus:border-hajj-600 focus:bg-white outline-none font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Penugasan Gedung
                  </label>
                  <select
                    value={regBuilding}
                    onChange={(e) => setRegBuilding(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-hajj-600 focus:border-hajj-600 focus:bg-white outline-none font-medium text-slate-800 cursor-pointer"
                  >
                    <option value="Semua Gedung">Semua Gedung (Umum)</option>
                    {buildings.slice().sort((a, b) => compareBuildingOrder(a.name, b.name)).map(b => (
                      <option key={b.id} value={b.name}>{b.name}</option>
                    ))}
                    {!buildings.some(b => b.name === 'Ruang Pertemuan') && (
                      <option value="Ruang Pertemuan">Ruang Pertemuan / Aula</option>
                    )}
                    <option value="Dapur & Distribusi Sarapan">Dapur & Distribusi Sarapan</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Departemen / Unit Kerja
                  </label>
                  <input
                    type="text"
                    value={regDepartment}
                    onChange={(e) => setRegDepartment(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-hajj-600 focus:border-hajj-600 focus:bg-white outline-none font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-200">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Kata Sandi *
                  </label>
                  <input
                    type="password"
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Minimal 3 karakter"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-hajj-600 focus:border-hajj-600 focus:bg-white outline-none font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Ulangi Kata Sandi *
                  </label>
                  <input
                    type="password"
                    required
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder="Ketik ulang kata sandi"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-hajj-600 focus:border-hajj-600 focus:bg-white outline-none font-medium"
                  />
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl flex items-start space-x-2.5">
                <i className="fa-solid fa-shield-halved text-amber-600 mt-0.5 text-xs"></i>
                <div className="text-[10.5px] text-amber-900 leading-relaxed">
                  <span className="font-bold">Informasi Persetujuan Akun:</span> Setelah pendaftaran berhasil dikirim, akun Anda akan berstatus <i>Menunggu Persetujuan</i>. Anda baru dapat login setelah disetujui (ACC) oleh Administrator UPT Asrama Haji Jakarta.
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-hajj-700 hover:bg-hajj-800 text-white font-bold text-xs shadow-md transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <i className="fa-solid fa-paper-plane text-xs"></i>
                  <span>Kirim Pendaftaran Akun</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Lupa Password & Permohonan Kata Sandi Baru */}
      {showForgotPasswordModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setShowForgotPasswordModal(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-amber-400 w-full max-w-md overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-amber-900 to-amber-800 text-white px-5 py-3.5 flex items-center justify-between border-b-2 border-gold-400 shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-gold-500/20 border border-gold-400/40 flex items-center justify-center text-gold-300">
                  <i className="fa-solid fa-key text-sm"></i>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Permohonan Reset Kata Sandi</h3>
                  <p className="text-[10.5px] text-amber-200 font-normal">Ketik kata sandi baru untuk diverifikasi oleh Admin</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowForgotPasswordModal(false)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-xs"></i>
              </button>
            </div>

            <form onSubmit={handleForgotPasswordSubmit} className="p-4 sm:p-5 space-y-3 overflow-y-auto custom-scrollbar flex-1">
              {fpError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center space-x-2">
                  <i className="fa-solid fa-circle-exclamation text-rose-500 shrink-0"></i>
                  <span>{fpError}</span>
                </div>
              )}
              {fpSuccessMsg && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center space-x-2">
                  <i className="fa-solid fa-circle-check text-emerald-500 shrink-0"></i>
                  <span>{fpSuccessMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Username / NIP Petugas *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <i className="fa-solid fa-user text-xs"></i>
                  </span>
                  <input
                    type="text"
                    required
                    value={fpUsername}
                    onChange={(e) => setFpUsername(e.target.value)}
                    placeholder="Masukkan username akun Anda"
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-600 focus:border-amber-600 focus:bg-white outline-none font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Kata Sandi Baru *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <i className="fa-solid fa-lock text-xs"></i>
                  </span>
                  <input
                    type="password"
                    required
                    value={fpNewPassword}
                    onChange={(e) => setFpNewPassword(e.target.value)}
                    placeholder="Masukkan kata sandi baru"
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-600 focus:border-amber-600 focus:bg-white outline-none font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Ulangi Kata Sandi Baru *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <i className="fa-solid fa-check text-xs"></i>
                  </span>
                  <input
                    type="password"
                    required
                    value={fpConfirmPassword}
                    onChange={(e) => setFpConfirmPassword(e.target.value)}
                    placeholder="Ketik ulang kata sandi baru"
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-600 focus:border-amber-600 focus:bg-white outline-none font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Catatan / Alasan Permohonan
                </label>
                <textarea
                  rows={2}
                  value={fpNotes}
                  onChange={(e) => setFpNotes(e.target.value)}
                  placeholder="Contoh: Lupa kata sandi lama, mohon verifikasi kata sandi baru."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-600 focus:border-amber-600 focus:bg-white outline-none font-medium"
                />
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl flex items-start space-x-2.5">
                <i className="fa-solid fa-clock-rotate-left text-amber-600 mt-0.5 text-xs"></i>
                <div className="text-[10.5px] text-amber-900 leading-relaxed">
                  <span className="font-bold">Alur Pengesahan:</span> Setelah permohonan dikirim, Administrator akan memverifikasi permohonan. Setelah disetujui, Anda dapat langsung login menggunakan kata sandi baru tersebut.
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowForgotPasswordModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs shadow-md transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <i className="fa-solid fa-key text-xs"></i>
                  <span>Ajukan Kata Sandi Baru</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
