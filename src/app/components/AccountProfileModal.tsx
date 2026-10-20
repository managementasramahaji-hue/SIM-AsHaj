import React, { useState, useEffect, useRef } from 'react';
import { useAppContext, isSuperAdmin, getUserEffectivePermissions } from '../store';
import { useBodyScrollLock } from '../lib/scrollLock';
import { generateQrCodeDataUrl } from '../lib/utils';

interface AccountProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSection?: 'PROFIL' | 'BRANDING';
}

export function AccountProfileModal({ isOpen, onClose, initialSection }: AccountProfileModalProps) {
  const { currentUser, updateCurrentAccount, updateAppSettings, dataStorage, showToast, isDarkMode } = useAppContext();

  const [activeTab, setActiveTab] = useState<'PROFIL' | 'BRANDING'>('PROFIL');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [signatureHistory, setSignatureHistory] = useState<{ id: string; timestamp: string; signatureUrl: string; method: 'UPLOAD' | 'DRAWN'; resolution?: string }[]>([]);
  const [showDrawModal, setShowDrawModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const validateAndSetSignature = (dataUrl: string, method: 'UPLOAD' | 'DRAWN', customWidth?: number, customHeight?: number) => {
    const img = new Image();
    img.onload = () => {
      const w = customWidth || img.width;
      const h = customHeight || img.height;

      // Validation: Min resolution 80x30px
      if (w < 80 || h < 30) {
        showToast(`Resolusi tanda tangan terlalu kecil (${w}x${h}px). Minimum resolusi adalah 80x30 piksel untuk kualitas cetak PDF optimal.`, 'warning');
        return;
      }

      // Aspect ratio validation (between 0.2 and 6.0)
      const ratio = w / h;
      if (ratio < 0.2 || ratio > 6.0) {
        showToast('Aspek rasio tanda tangan tidak valid (terlalu ekstrem vertikal/horizontal).', 'warning');
        return;
      }

      // Pastikan tinta tanda tangan yang disimpan untuk dokumen PDF selalu berwarna hitam (#0f172a)
      let finalSignatureUrl = dataUrl;
      try {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const imgData = ctx.getImageData(0, 0, w, h);
          const data = imgData.data;
          let modified = false;
          for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            // Jika ada piksel yang terlihat dan terang/putih, ubah menjadi tinta hitam
            if (alpha > 15) {
              data[i] = 15;     // R
              data[i + 1] = 23; // G
              data[i + 2] = 42; // B
              modified = true;
            }
          }
          if (modified) {
            ctx.putImageData(imgData, 0, 0);
            finalSignatureUrl = c.toDataURL('image/png');
          }
        }
      } catch (err) {
        finalSignatureUrl = dataUrl;
      }

      setSignatureUrl(finalSignatureUrl);
      // Compute unique hash for this specific signature to guarantee 1 signature = 1 unique QR code
      let sigHashNum = 0;
      for (let i = 0; i < finalSignatureUrl.length; i++) {
        sigHashNum = ((sigHashNum << 5) - sigHashNum) + finalSignatureUrl.charCodeAt(i);
        sigHashNum |= 0;
      }
      const uniqueSigCode = `SIG-${currentUser.id}-${Math.abs(sigHashNum).toString(16).toUpperCase()}`;
      const newQr = generateQrCodeDataUrl(`UPT-ASRAMA-VERIFIED:${currentUser.id}:${username}:${fullName}:${uniqueSigCode}`);
      setQrCodeUrl(newQr);

      const newItem = {
        id: `sig-${Date.now()}`,
        timestamp: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
        signatureUrl: finalSignatureUrl,
        method,
        resolution: `${w}x${h}px`,
        uniqueCode: uniqueSigCode
      };
      setSignatureHistory(prev => [newItem, ...prev].slice(0, 10));
      showToast('Tanda Tangan berhasil divalidasi & diperbarui (tinta hitam resmi)!', 'success');
    };
    img.src = dataUrl;
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    // Saat menggambar langsung: mode gelap tinta putih (#ffffff), mode cerah tinta hitam (#0f172a)
    ctx.strokeStyle = isDarkMode ? '#ffffff' : '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const saveDrawnSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Pastikan coretan diubah menjadi tinta hitam (#0f172a) berlatar transparan untuk PDF
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const expCtx = exportCanvas.getContext('2d');
    if (!expCtx) return;

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    let hasStrokes = false;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha > 15) {
        hasStrokes = true;
        // Konversi ke tinta hitam pekat
        data[i] = 15;     // R
        data[i + 1] = 23; // G
        data[i + 2] = 42; // B
      }
    }

    if (!hasStrokes) {
      showToast('Kanvas tanda tangan masih kosong. Silakan gambar tanda tangan terlebih dahulu.', 'warning');
      return;
    }

    expCtx.putImageData(imgData, 0, 0);
    const dataUrl = exportCanvas.toDataURL('image/png');
    validateAndSetSignature(dataUrl, 'DRAWN', canvas.width, canvas.height);
    setShowDrawModal(false);
  };

  // Admin settings for Web Title & Logo
  const [webTitle, setWebTitle] = useState('UPT Asrama Haji Jakarta');
  const [webSubTitle, setWebSubTitle] = useState('Sistem Informasi Manajemen Operasional');
  const [webLogo, setWebLogo] = useState('fa-kaaba');
  const [tagTitle, setTagTitle] = useState('UPT Asrama Haji Jakarta');
  const [appFavicon, setAppFavicon] = useState('');

  useBodyScrollLock(isOpen || showDrawModal || showHistoryModal);

  useEffect(() => {
    if (currentUser && isOpen) {
      if (initialSection) {
        setActiveTab(initialSection);
      } else {
        setActiveTab('PROFIL');
      }
      setFullName(currentUser.fullName);
      setUsername(currentUser.username);
      setPhone(currentUser.phone && currentUser.phone !== '-' ? currentUser.phone : '');
      setPassword(currentUser.password || '12345');
      setShowPassword(false);
      setSignatureUrl(currentUser.signatureUrl || '');
      setSignatureHistory(currentUser.signatureHistory || []);
      
      const qrData = generateQrCodeDataUrl(`UPT-ASRAMA-VERIFIED:${currentUser.id}:${currentUser.username}:${currentUser.fullName}`);
      setQrCodeUrl(qrData);

      const appSettings = dataStorage.getAppSettings();
      if (appSettings?.organizationName) setWebTitle(appSettings.organizationName);
      if (appSettings?.subTitle) setWebSubTitle(appSettings.subTitle);
      if (appSettings?.appLogo) setWebLogo(appSettings.appLogo);
      if (appSettings?.tagTitle) setTagTitle(appSettings.tagTitle);
      if (appSettings?.appFavicon) setAppFavicon(appSettings.appFavicon);
    }
  }, [currentUser, isOpen, initialSection, dataStorage]);

  if (!isOpen || !currentUser) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      showToast('Nama lengkap wajib diisi!', 'warning');
      return;
    }
    if (!username.trim()) {
      showToast('Username / NIP wajib diisi!', 'warning');
      return;
    }

    // Update account profile
    updateCurrentAccount({
      fullName: fullName.trim(),
      username: username.trim(),
      phone: phone.trim() || '-',
      password: password.trim() || '12345',
      signatureUrl: signatureUrl.trim() || undefined,
      qrCodeUrl: qrCodeUrl.trim() || undefined,
      signatureHistory
    });

    // If super admin / admin / has permission, also update app settings
    const canManageApp = currentUser && (
      isSuperAdmin(currentUser.role) || 
      currentUser.role === 'Admin' || 
      currentUser.isOwner || 
      getUserEffectivePermissions(currentUser).canConfigApp
    );
    if (canManageApp) {
      updateAppSettings({
        organizationName: webTitle.trim(),
        subTitle: webSubTitle.trim(),
        appLogo: webLogo,
        tagTitle: tagTitle.trim(),
        appFavicon: appFavicon
      });
    }

    showToast('Profil akun, TTD, dan QR Code berhasil diperbarui!', 'success');
    onClose();
  };

  const handleSignatureFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showToast('Ukuran file tanda tangan maksimal 2MB!', 'warning');
        return;
      }
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const result = uploadEvent.target?.result as string;
        if (result) {
          validateAndSetSignature(result, 'UPLOAD');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const logoOptions = [
    { id: 'fa-kaaba', label: 'Kabah (Keagamaan)' },
    { id: 'fa-mosque', label: 'Masjid (Islamic)' },
    { id: 'fa-building-shield', label: 'Gedung Resmi (Pemerintahan)' },
    { id: 'fa-hotel', label: 'Akomodasi & Hotel' },
    { id: 'fa-shield-halal', label: 'Halal & Syariah' }
  ];

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showToast('Ukuran file logo maksimal 2MB!', 'warning');
        return;
      }
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const result = uploadEvent.target?.result as string;
        if (result) {
          setWebLogo(result);
          try {
            updateAppSettings({ appLogo: result });
            dataStorage.updateAppSettings({ appLogo: result });
          } catch (err) {}
          showToast('Logo resmi instansi berhasil diunggah & tersimpan di database untuk seluruh laporan (Excel & PDF)!', 'success');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleResetLogo = () => {
    setWebLogo('');
    try {
      updateAppSettings({ appLogo: '' });
      dataStorage.updateAppSettings({ appLogo: '' });
    } catch (err) {}
    showToast('Logo resmi telah direset. Laporan kini menggunakan lambang emblem standar.', 'info');
  };

  const handleFaviconFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1 * 1024 * 1024) {
        showToast('Ukuran file favicon maksimal 1MB!', 'warning');
        return;
      }
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const result = uploadEvent.target?.result as string;
        if (result) {
          setAppFavicon(result);
          showToast('Favicon berhasil diunggah!', 'success');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 bg-hajj-800 text-white flex items-center justify-between border-b border-gold-500/30">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gold-500 text-hajj-950 flex items-center justify-center font-bold text-base shadow">
              <i className={`fa-solid ${activeTab === 'BRANDING' ? 'fa-globe' : 'fa-user-gear'}`}></i>
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">
                {activeTab === 'BRANDING' ? 'Pengaturan Judul & Logo Web' : 'Edit Profil Akun Saya'}
              </h3>
              <p className="text-[11px] text-slate-300">
                {activeTab === 'BRANDING' ? 'Kustomisasi identitas instansi, nama sistem & logo' : 'Perbarui informasi kredensial & identitas login Anda'}
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-slate-300 hover:text-white p-1 rounded-lg transition cursor-pointer"
          >
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        {/* Tab Navigation for Admin / Super Admin (Only shown if opened without specific section) */}
        {isSuperAdmin(currentUser.role) && !initialSection && (
          <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 pt-2.5 gap-2 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('PROFIL')}
              className={`pb-2 px-3 font-bold border-b-2 transition flex items-center space-x-1.5 cursor-pointer ${
                activeTab === 'PROFIL'
                  ? 'border-hajj-700 text-hajj-800 dark:border-gold-400 dark:text-gold-300'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <i className="fa-solid fa-user-pen"></i>
              <span>Profil Akun</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('BRANDING')}
              className={`pb-2 px-3 font-bold border-b-2 transition flex items-center space-x-1.5 cursor-pointer ${
                activeTab === 'BRANDING'
                  ? 'border-hajj-700 text-hajj-800 dark:border-gold-400 dark:text-gold-300'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <i className="fa-solid fa-globe"></i>
              <span>Judul & Logo Web</span>
            </button>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1 text-xs">
          {activeTab === 'PROFIL' ? (
            <>
              {/* Read-Only Role & Division Notice */}
              <div className="bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-700/80 p-3 rounded-xl flex items-start space-x-2.5">
                <i className="fa-solid fa-shield-halal text-amber-600 dark:text-amber-400 text-sm mt-0.5"></i>
                <div>
                  <span className="font-bold text-amber-900 dark:text-amber-200 block">Hak Akses & Peran Sistem</span>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                    Peran (<strong>{currentUser.role}</strong>) dan Divisi Anda dikelola secara terpusat oleh Administrator UPT. Anda hanya dapat mengubah informasi profil pribadi.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Nama Lengkap & Gelar</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    required
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl font-medium focus:ring-2 focus:ring-hajj-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Username / NIP Login</label>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl font-medium focus:ring-2 focus:ring-hajj-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Nomor WhatsApp / Kontak</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="0812xxxxxxxx"
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl font-medium focus:ring-2 focus:ring-hajj-600 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Kata Sandi / PIN Masuk</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      className="w-full p-2.5 pr-10 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl font-medium focus:ring-2 focus:ring-hajj-600 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                    </button>
                  </div>
                </div>

                {/* Dedicated Official Logo Upload Card for Admins (Auto-applied to PDF & Excel) */}
                {isSuperAdmin(currentUser.role) && (
                  <div className="sm:col-span-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                    <div className="p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-slate-800 dark:to-slate-800/90 border border-amber-200 dark:border-amber-600/70 rounded-2xl space-y-3 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center justify-center text-sm font-bold">
                            <i className="fa-solid fa-landmark"></i>
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 dark:text-slate-100 text-xs block">
                              Logo Resmi Instansi (Kop Semua Laporan PDF &amp; Excel)
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                              Tersimpan permanen di database &amp; otomatis menjadi kop semua laporan
                            </span>
                          </div>
                        </div>
                        <span className="text-[9px] bg-amber-100 dark:bg-amber-900/80 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full font-bold border border-amber-300 dark:border-amber-700 shrink-0">
                          Khusus Admin
                        </span>
                      </div>

                      <div className="flex items-center gap-3.5 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                        {/* Preview Box */}
                        <div className="shrink-0 flex flex-col items-center">
                          <div className="w-16 h-16 bg-white border border-slate-300 dark:border-slate-600 rounded-xl shadow-2xs flex items-center justify-center p-1.5 relative overflow-hidden">
                            {webLogo && (webLogo.startsWith('data:') || webLogo.startsWith('http') || webLogo.startsWith('blob:')) ? (
                              <img src={webLogo} alt="Logo Kop" className="w-full h-full object-contain" />
                            ) : (
                              <div className="text-center">
                                <i className={`fa-solid ${webLogo || 'fa-landmark'} text-amber-700 dark:text-amber-400 text-xl`}></i>
                                <div className="text-[8px] font-bold text-amber-900 dark:text-amber-300 leading-tight mt-0.5">KEMENHAJI</div>
                              </div>
                            )}
                          </div>
                          <span className="text-[9px] font-medium text-slate-500 mt-1">Pratinjau Kop</span>
                        </div>

                        {/* Controls */}
                        <div className="flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="cursor-pointer px-3 py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-98 text-slate-950 font-bold rounded-xl text-xs transition flex items-center gap-1.5 shadow-2xs">
                              <i className="fa-solid fa-cloud-arrow-up text-xs"></i>
                              <span>{webLogo && (webLogo.startsWith('data:') || webLogo.startsWith('http')) ? 'Ganti Logo Resmi...' : 'Unggah Logo Resmi...'}</span>
                              <input 
                                type="file" 
                                accept="image/png,image/jpeg,image/webp,image/svg+xml" 
                                onChange={handleLogoFileChange} 
                                className="hidden" 
                              />
                            </label>
                            {webLogo && (webLogo.startsWith('data:') || webLogo.startsWith('http')) && (
                              <button
                                type="button"
                                onClick={handleResetLogo}
                                className="px-2.5 py-1.5 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-xl text-xs transition font-semibold cursor-pointer border border-slate-200 dark:border-slate-700"
                                title="Hapus logo & kembali ke lambang standar"
                              >
                                <i className="fa-solid fa-trash-can mr-1 text-xs"></i>
                                Hapus
                              </button>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                            Format PNG, JPG, atau WebP. Logo ini otomatis disimpan di database dan diterapkan pada kop laporan <strong>PDF</strong> dan <strong>Excel (.xlsx)</strong> tanpa perlu diunggah ulang setiap unduh.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="sm:col-span-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                    <i className="fa-solid fa-signature text-hajj-700 mr-1.5"></i>
                    Tanda Tangan Digital &amp; Auto-Generate QR Code Pengesahan
                  </label>
                  <p className="text-[11px] text-slate-500 mb-2.5">
                    Unggah tanda tangan (.png/.jpg) atau gambar tanda tangan langsung. Sistem akan otomatis men-generate QR Code verifikasi. Kedua atribut ini akan ditempelkan berdampingan pada setiap laporan PDF yang Anda terbitkan.
                  </p>

                  <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-50 dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                    {/* TTD Preview & Action Buttons */}
                    <div className="flex-1 text-center sm:text-left space-y-2 w-full">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block">Preview Tanda Tangan</span>
                      <div className="h-20 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center p-2 shadow-2xs">
                        {signatureUrl ? (
                          <img src={signatureUrl} alt="Signature Preview" className="max-h-full max-w-full object-contain" />
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Belum ada tanda tangan</span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <label className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-hajj-100 dark:bg-hajj-900 text-hajj-800 dark:file:text-hajj-200 dark:text-hajj-200 rounded-lg text-xs font-bold hover:bg-hajj-200 cursor-pointer transition">
                          <i className="fa-solid fa-upload"></i>
                          <span>Unggah File</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleSignatureFileChange}
                            className="hidden"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => setShowDrawModal(true)}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-700 cursor-pointer transition"
                        >
                          <i className="fa-solid fa-pen-nib"></i>
                          <span>Gambar Langsung</span>
                        </button>
                      </div>
                    </div>

                    {/* QR Code Preview (Side-by-side) */}
                    <div className="shrink-0 text-center space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block">Auto QR Code</span>
                      <div className="w-20 h-20 bg-white rounded-lg border border-slate-200 flex items-center justify-center p-1 shadow-2xs mx-auto">
                        {qrCodeUrl ? (
                          <img src={qrCodeUrl} alt="QR Code Preview" className="w-full h-full object-contain" />
                        ) : (
                          <i className="fa-solid fa-qrcode text-slate-300 text-2xl"></i>
                        )}
                      </div>
                      <span className="text-[9px] text-slate-400 block">Otomatis Ter-generate</span>
                    </div>
                  </div>

                  {/* Live Render Preview Card for PDF Document Footer */}
                  <div className="mt-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl p-3">
                    <div className="flex items-center space-x-1.5 text-amber-800 dark:text-amber-300 font-bold text-xs mb-2">
                      <i className="fa-solid fa-eye"></i>
                      <span>Pratinjau Blok Tanda Tangan Dokumen PDF (Side-by-Side)</span>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-center relative overflow-hidden">
                      <div className="text-[9px] text-slate-400 uppercase tracking-widest mb-1">Jakarta, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                      <div className="text-[10px] font-bold text-slate-700 dark:text-slate-200 mb-1">{currentUser.role || 'Pejabat Penandatangan'}</div>
                      
                      {/* Side-by-side rendered simulation (menempel / touching) */}
                      <div className="h-16 flex items-center justify-center space-x-0 my-1">
                        <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-l border border-r-0 border-slate-200 dark:border-slate-700 flex items-center justify-center p-0.5">
                          {qrCodeUrl ? (
                            <img src={qrCodeUrl} alt="QR" className="w-full h-full object-contain" />
                          ) : (
                            <span className="text-[8px] text-slate-400">QR</span>
                          )}
                        </div>
                        <div className="w-24 h-12 bg-slate-50 dark:bg-slate-800 rounded-r border border-l-0 border-slate-200 dark:border-slate-700 flex items-center justify-center p-0.5">
                          {signatureUrl ? (
                            <img src={signatureUrl} alt="TTD" className="max-h-full max-w-full object-contain" />
                          ) : (
                            <span className="text-[9px] text-slate-400 italic">TTD Digital</span>
                          )}
                        </div>
                      </div>

                      <div className="border-t border-slate-300 dark:border-slate-700 w-44 mx-auto my-1"></div>
                      <div className="text-[11px] font-bold text-slate-900 dark:text-slate-100">{fullName || 'Nama Staf / Pejabat'}</div>
                      <div className="text-[9px] text-slate-500">{currentUser.role || 'Jabatan'} • UPT Asrama Haji</div>
                      <div className="text-[8.5px] text-slate-400">{username ? `NIP. ${username}` : 'NIP. -'}</div>
                    </div>
                  </div>

                  {/* Signature History Section */}
                  <div className="mt-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-1.5 text-slate-700 dark:text-slate-300 font-bold text-xs">
                        <i className="fa-solid fa-clock-rotate-left text-hajj-700"></i>
                        <span>Riwayat Perubahan Tanda Tangan ({signatureHistory.length})</span>
                      </div>
                      {signatureHistory.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowHistoryModal(true)}
                          className="text-[11px] font-bold text-hajj-700 dark:text-hajj-300 hover:underline flex items-center space-x-1 cursor-pointer"
                        >
                          <i className="fa-solid fa-folder-open"></i>
                          <span>Buka Modal Riwayat</span>
                        </button>
                      )}
                    </div>

                    {signatureHistory.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1">
                        {signatureHistory.map((item) => {
                          const isDbActive = item.signatureUrl === currentUser.signatureUrl;
                          return (
                            <div 
                              key={item.id} 
                              onClick={() => {
                                setSignatureUrl(item.signatureUrl);
                                showToast('Tanda tangan dari riwayat berhasil dimuat!', 'success');
                              }}
                              className={`p-2 rounded-lg border cursor-pointer transition text-center group relative ${
                                isDbActive 
                                  ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-600' 
                                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-hajj-600'
                              }`}
                            >
                              {isDbActive && (
                                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500" title="Aktif di Database"></span>
                              )}
                              <div className="h-10 flex items-center justify-center mb-1">
                                <img src={item.signatureUrl} alt="History Sig" className="max-h-full max-w-full object-contain" />
                              </div>
                              <div className="text-[9px] font-bold text-slate-600 dark:text-slate-300 truncate">{item.method}</div>
                              <div className="text-[8px] text-slate-400">{item.timestamp}</div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-slate-400 text-xs italic">
                        Belum ada riwayat tanda tangan tersimpan.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Admin / Super Admin Web Title & Logo Settings */
            <div className="space-y-3.5">
              <div className="flex items-center space-x-2 text-hajj-800 dark:text-gold-300 font-bold bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <i className="fa-solid fa-screwdriver-wrench text-gold-600 dark:text-gold-400"></i>
                <span>Konfigurasi Khusus Administrator (Judul & Logo Web)</span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Judul Web Sistem (Header)</label>
                <input
                  type="text"
                  value={webTitle}
                  onChange={e => setWebTitle(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl font-medium focus:ring-2 focus:ring-hajj-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Sub-Judul / Teks Sistem (Header, Login &amp; Identitas)
                </label>
                <input
                  type="text"
                  value={webSubTitle}
                  onChange={e => setWebSubTitle(e.target.value)}
                  placeholder="Contoh: Sistem Informasi Manajemen Operasional"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl font-medium focus:ring-2 focus:ring-hajj-600 focus:outline-none"
                />
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                  Teks ini otomatis menyesuaikan tampilan sistem secara keseluruhan termasuk di form login, header web, dan dokumen resmi.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Edit Tag Title (Judul Tab Browser)</label>
                <input
                  type="text"
                  value={tagTitle}
                  onChange={e => setTagTitle(e.target.value)}
                  placeholder="Contoh: SIM-Akomodasi Asrama Haji"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl font-medium focus:ring-2 focus:ring-hajj-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Logo Resmi Instansi &amp; Kop Laporan (PDF &amp; Excel)
                </label>
                <div className="flex items-center space-x-3 mb-2">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden shrink-0 text-slate-700 dark:text-slate-200 text-lg ${webLogo && (webLogo.startsWith('data:') || webLogo.startsWith('http') || webLogo.startsWith('blob:')) ? 'bg-white border border-slate-300 dark:border-slate-600 shadow-2xs' : 'bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700'}`}>
                    {webLogo && (webLogo.startsWith('data:') || webLogo.startsWith('http') || webLogo.startsWith('blob:')) ? (
                      <img src={webLogo} alt="Logo Preview" className="w-full h-full object-contain p-1" />
                    ) : (
                      <i className={`fa-solid ${webLogo || 'fa-kaaba'} text-2xl text-amber-700`}></i>
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="cursor-pointer px-3 py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-98 text-slate-950 font-bold rounded-xl text-xs transition flex items-center gap-1.5 shadow-2xs">
                        <i className="fa-solid fa-cloud-arrow-up text-xs"></i>
                        <span>{webLogo && (webLogo.startsWith('data:') || webLogo.startsWith('http')) ? 'Ganti Logo...' : 'Unggah File Logo...'}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          onChange={handleLogoFileChange}
                          className="hidden"
                        />
                      </label>
                      {webLogo && (webLogo.startsWith('data:') || webLogo.startsWith('http')) && (
                        <button
                          type="button"
                          onClick={handleResetLogo}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-xl text-xs transition font-semibold cursor-pointer border border-slate-200 dark:border-slate-700"
                          title="Hapus logo & kembali ke default"
                        >
                          <i className="fa-solid fa-trash-can mr-1 text-xs"></i>
                          Hapus Logo
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      Format PNG, JPG, atau WebP (Maks. 2MB). Otomatis tersimpan di database &amp; menjadi kop surat resmi seluruh laporan PDF dan Excel.
                    </p>
                  </div>
                </div>

                <select
                  value={webLogo && typeof webLogo === 'string' && (webLogo.startsWith('data:') || webLogo.startsWith('http')) ? 'custom' : (webLogo || '')}
                  onChange={e => {
                    if (e.target.value !== 'custom') {
                      setWebLogo(e.target.value);
                      try {
                        updateAppSettings({ appLogo: e.target.value });
                        dataStorage.updateAppSettings({ appLogo: e.target.value });
                      } catch (err) {}
                    }
                  }}
                  aria-label="Pilih Logo Preset Sistem"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl font-medium focus:ring-2 focus:ring-hajj-600 focus:outline-none text-xs"
                >
                  <option value="custom" disabled={!webLogo || typeof webLogo !== 'string' || (!webLogo.startsWith('data:') && !webLogo.startsWith('http'))}>-- Logo Kustom Diunggah (Aktif di Kop Laporan) --</option>
                  {logoOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Edit Favicon (Ikon Tab Browser .ico/.png)</label>
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                    {appFavicon ? (
                      <img src={appFavicon} alt="Favicon Preview" className="w-full h-full object-contain" />
                    ) : (
                      <i className="fa-solid fa-globe text-slate-500 dark:text-slate-400"></i>
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/png, image/x-icon, image/ico, image/svg+xml"
                      onChange={handleFaviconFileChange}
                      className="w-full text-xs text-slate-500 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-hajj-100 dark:file:bg-hajj-900 file:text-hajj-800 dark:file:text-hajj-200 hover:file:bg-hajj-200 cursor-pointer"
                    />
                    <p className="text-[10px] text-slate-400 mt-0.5">Format ICO atau PNG (Maks. 1MB)</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="pt-3 flex items-center justify-end space-x-2.5 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-hajj-700 hover:bg-hajj-800 text-white font-bold rounded-xl shadow-md transition flex items-center space-x-1.5 cursor-pointer"
            >
              <i className="fa-solid fa-floppy-disk"></i>
              <span>Simpan Perubahan</span>
            </button>
          </div>
        </form>
      </div>

      {/* Signature Drawing Modal */}
      {showDrawModal && (
        <div 
          className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowDrawModal(false)}
        >
          <div 
            className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 animate-in fade-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-slate-900 dark:text-slate-100 font-bold">
                <i className="fa-solid fa-pen-nib text-hajj-700"></i>
                <span>Buat Tanda Tangan Digital</span>
              </div>
              <button
                type="button"
                onClick={() => setShowDrawModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1"
              >
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Silakan tulis atau gambar tanda tangan Anda pada area di bawah ini menggunakan mouse atau layar sentuh.
            </p>

            <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 overflow-hidden relative flex justify-center items-center">
              <canvas
                ref={canvasRef}
                width={360}
                height={160}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="touch-none cursor-crosshair bg-white dark:bg-white rounded-lg shadow-inner"
              />
              <span className="absolute bottom-2 right-3 text-[10px] text-slate-400 pointer-events-none select-none">
                Area Tanda Tangan
              </span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={clearCanvas}
                className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 font-bold text-xs rounded-xl transition flex items-center space-x-1.5 cursor-pointer"
              >
                <i className="fa-solid fa-rotate-right"></i>
                <span>Ulangi / Bersihkan</span>
              </button>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowDrawModal(false)}
                  className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={saveDrawnSignature}
                  className="px-4 py-1.5 bg-hajj-700 hover:bg-hajj-800 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <i className="fa-solid fa-check"></i>
                  <span>Gunakan Tanda Tangan</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Signature History Modal */}
      {showHistoryModal && (
        <div 
          className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowHistoryModal(false)}
        >
          <div 
            className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 animate-in fade-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-slate-900 dark:text-slate-100 font-bold">
                <i className="fa-solid fa-clock-rotate-left text-hajj-700"></i>
                <span>Riwayat Perubahan Tanda Tangan Digital</span>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Daftar versi tanda tangan digital yang pernah Anda buat atau unggah sebelumnya. Anda dapat melihat waktu, resolusi, dan memuat kembali tanda tangan tersebut.
            </p>

            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {signatureHistory.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs italic">
                  Belum ada riwayat tanda tangan tersimpan.
                </div>
              ) : (
                signatureHistory.map((item, idx) => {
                  const isActive = item.signatureUrl === currentUser.signatureUrl || item.signatureUrl === signatureUrl;
                  return (
                    <div 
                      key={item.id}
                      className={`p-3 rounded-xl border flex items-center justify-between transition ${
                        isActive 
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-600' 
                          : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-20 h-12 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center p-1 shadow-2xs">
                          <img src={item.signatureUrl} alt="Sig" className="max-h-full max-w-full object-contain" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                              Versi #{signatureHistory.length - idx} ({item.method})
                            </span>
                            {isActive && (
                              <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 rounded-full text-[9px] font-bold">
                                ✓ Aktif / Tersimpan
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {item.timestamp} {item.resolution ? `• ${item.resolution}` : ''}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSignatureUrl(item.signatureUrl);
                          let sigHashNum = 0;
                          for (let i = 0; i < item.signatureUrl.length; i++) {
                            sigHashNum = ((sigHashNum << 5) - sigHashNum) + item.signatureUrl.charCodeAt(i);
                            sigHashNum |= 0;
                          }
                          const uniqueSigCode = (item as any).uniqueCode || `SIG-${currentUser.id}-${Math.abs(sigHashNum).toString(16).toUpperCase()}`;
                          const newQr = generateQrCodeDataUrl(`UPT-ASRAMA-VERIFIED:${currentUser.id}:${username}:${fullName}:${uniqueSigCode}`);
                          setQrCodeUrl(newQr);
                          showToast('Tanda tangan versi ini berhasil dimuat!', 'success');
                          setShowHistoryModal(false);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          isActive
                            ? 'bg-emerald-700 text-white shadow-xs'
                            : 'bg-hajj-100 dark:bg-hajj-900 text-hajj-800 dark:text-hajj-200 hover:bg-hajj-200'
                        }`}
                      >
                        {isActive ? 'Digunakan' : 'Gunakan Versi Ini'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
