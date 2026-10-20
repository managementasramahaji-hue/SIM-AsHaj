// @ts-nocheck
import React, { useState, useMemo } from 'react';
import { useAppContext, isSuperAdmin, isKeuanganRole } from '../store';
import { User, UserRole } from '../types';
import { useBodyScrollLock } from '../lib/scrollLock';
import { getNextSequentialId, compareBuildingOrder } from '../lib/utils';

export function UserManagementView() {
  const { 
    users = [], 
    currentUser, 
    buildings = [],
    addUser, 
    updateUser, 
    toggleUserStatus, 
    deleteUser, 
    showToast, 
    openModal,
    login,
    setActiveTab,
    passwordResetRequests = [],
    approvePasswordReset,
    rejectPasswordReset,
    approveUserRegistration,
    rejectUserRegistration
  } = useAppContext();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Aktif' | 'Non-Aktif' | 'Menunggu Persetujuan'>('ALL');
  const [buildingFilter, setBuildingFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'GRID' | 'TABLE'>('TABLE');
  const [approvalTab, setApprovalTab] = useState<'REGISTER' | 'PASSWORD_RESET'>('REGISTER');
  const [showApprovalSection, setShowApprovalSection] = useState(false);

  // Form Drawer / Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // Form Fields
  const [fFullName, setFFullName] = useState('');
  const [fNip, setFNip] = useState('');
  const [fUsername, setFUsername] = useState('');
  const [fPassword, setFPassword] = useState('');
  const [fRole, setFRole] = useState<UserRole>('Resepsionis');
  const [fDepartment, setFDepartment] = useState('Pelayanan & Resepsionis');
  const [fAssignedBuilding, setFAssignedBuilding] = useState('Semua Gedung');
  const [fSupervisorId, setFSupervisorId] = useState<string>('');
  const [fPhone, setFPhone] = useState('');
  const [fStatus, setFStatus] = useState<'Aktif' | 'Non-Aktif'>('Aktif');
  const [showPassword, setShowPassword] = useState(false);

  // Quick Password Change Modal
  const [pwdTargetUser, setPwdTargetUser] = useState<User | null>(null);
  const [newPasswordVal, setNewPasswordVal] = useState('');

  // In-App Confirmation Modal (Mencegah window.confirm terblokir di iframe sandbox)
  const [confirmActionModal, setConfirmActionModal] = useState<{
    type: 'REJECT_REG' | 'REJECT_RESET' | 'DELETE_USER';
    id: string;
    title: string;
    description: string;
    targetName: string;
    targetUsername: string;
  } | null>(null);
  useBodyScrollLock(Boolean(pwdTargetUser || confirmActionModal));

  const handleConfirmActionExecute = () => {
    if (!confirmActionModal) return;
    const { type, id } = confirmActionModal;
    if (type === 'REJECT_REG') {
      rejectUserRegistration(id);
    } else if (type === 'REJECT_RESET') {
      rejectPasswordReset(id);
    } else if (type === 'DELETE_USER') {
      deleteUser(id);
    }
    setConfirmActionModal(null);
  };

  // Handle role change to auto-suggest department & default supervisor
  const handleRoleChange = (selectedRole: string) => {
    setFRole(selectedRole as UserRole);

    if (selectedRole === 'Super Admin') {
      setFDepartment('Pimpinan / Tata Usaha');
      setFAssignedBuilding('Semua Gedung');
      setFSupervisorId('');
    } else if (selectedRole === 'Admin') {
      setFDepartment('Pimpinan / Tata Usaha');
      setFAssignedBuilding('Semua Gedung');
      const superAdmin = users.find(u => u.role === 'Super Admin');
      setFSupervisorId(superAdmin ? superAdmin.id : '');
    } else if (selectedRole === 'Manager Resepsionis') {
      setFDepartment('Pelayanan & Resepsionis');
      setFAssignedBuilding('Semua Gedung');
      const adminUser = users.find(u => u.role === 'Super Admin' || u.role === 'Admin');
      setFSupervisorId(adminUser ? adminUser.id : '');
    } else if (selectedRole === 'Resepsionis') {
      setFDepartment('Pelayanan & Resepsionis');
      const managerRecep = users.find(u => u.role === 'Manager Resepsionis');
      setFSupervisorId(managerRecep ? managerRecep.id : '');
    } else if (selectedRole === 'Manager Keuangan') {
      setFDepartment('Keuangan & Perbendaharaan');
      setFAssignedBuilding('Semua Gedung');
      const adminUser = users.find(u => u.role === 'Super Admin' || u.role === 'Admin');
      setFSupervisorId(adminUser ? adminUser.id : '');
    } else if (selectedRole === 'Bendahara / Keuangan' || selectedRole === 'Bendahara' || selectedRole === 'Keuangan') {
      setFDepartment('Keuangan & Perbendaharaan');
      setFAssignedBuilding('Semua Gedung');
      const mgrKeuangan = users.find(u => u.role === 'Manager Keuangan') || users.find(u => u.role === 'Super Admin');
      setFSupervisorId(mgrKeuangan ? mgrKeuangan.id : '');
    } else if (selectedRole === 'Staff Keuangan') {
      setFDepartment('Keuangan & Perbendaharaan');
      setFAssignedBuilding('Semua Gedung');
      const mgrKeuangan = users.find(u => u.role === 'Bendahara / Keuangan' || u.role === 'Manager Keuangan');
      setFSupervisorId(mgrKeuangan ? mgrKeuangan.id : '');
    } else if (selectedRole === 'Manager QC') {
      setFDepartment('Pengawasan Mutu & QC');
      setFAssignedBuilding('Semua Gedung');
      const adminUser = users.find(u => u.role === 'Super Admin' || u.role === 'Admin');
      setFSupervisorId(adminUser ? adminUser.id : '');
    } else if (selectedRole === 'Quality Control') {
      setFDepartment('Pengawasan Mutu & QC');
      const managerQc = users.find(u => u.role === 'Manager QC');
      setFSupervisorId(managerQc ? managerQc.id : '');
    } else if (selectedRole === 'Manager Teknisi') {
      setFDepartment('Pemeliharaan Fasilitas & Teknisi');
      setFAssignedBuilding('Semua Gedung');
      const adminUser = users.find(u => u.role === 'Super Admin' || u.role === 'Admin');
      setFSupervisorId(adminUser ? adminUser.id : '');
    } else if (selectedRole === 'Teknisi') {
      setFDepartment('Pemeliharaan Fasilitas & Teknisi');
      const managerTek = users.find(u => u.role === 'Manager Teknisi');
      setFSupervisorId(managerTek ? managerTek.id : '');
    } else if (selectedRole === 'Manager Koperasi') {
      setFDepartment('Koperasi, Dapur & Konsumsi');
      setFAssignedBuilding('Dapur & Distribusi Sarapan');
      const adminUser = users.find(u => u.role === 'Super Admin' || u.role === 'Admin');
      setFSupervisorId(adminUser ? adminUser.id : '');
    } else if (selectedRole === 'Petugas Koperasi' || selectedRole === 'Koperasi') {
      setFDepartment('Koperasi, Dapur & Konsumsi');
      setFAssignedBuilding('Dapur & Distribusi Sarapan');
      const managerKop = users.find(u => u.role === 'Manager Koperasi');
      setFSupervisorId(managerKop ? managerKop.id : '');
    }
  };

  const handleOpenAddForm = () => {
    setEditingUserId(null);
    setFFullName('');
    setFNip('');
    setFUsername('');
    setFPassword('12345');
    setFRole('Resepsionis');
    setFDepartment('Pelayanan & Resepsionis');
    setFAssignedBuilding('Semua Gedung');
    const managerRecep = users.find(u => u.role === 'Manager Resepsionis');
    setFSupervisorId(managerRecep ? managerRecep.id : '');
    setFPhone('');
    setFStatus('Aktif');
    setShowPassword(false);
    setIsFormOpen(true);
    setTimeout(() => {
      document.getElementById('user-form-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const handleStartEdit = (user: User) => {
    setEditingUserId(user.id);
    setFFullName(user.fullName);
    setFNip(user.nip || '');
    setFUsername(user.username);
    setFPassword(user.password || '12345');
    setFRole(user.role);
    setFDepartment(user.department || 'Pelayanan & Resepsionis');
    setFAssignedBuilding(user.assignedBuilding || 'Semua Gedung');
    setFSupervisorId(user.supervisorId || '');
    setFPhone(user.phone && user.phone !== '-' ? user.phone : '');
    setFStatus(user.status === 'Non-Aktif' ? 'Non-Aktif' : 'Aktif');
    setShowPassword(false);
    setIsFormOpen(true);
    setTimeout(() => {
      document.getElementById('user-form-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fFullName.trim()) {
      showToast('Nama Lengkap anggota wajib diisi!', 'warning');
      return;
    }
    if (!fUsername.trim()) {
      showToast('Username / NIP anggota wajib diisi!', 'warning');
      return;
    }

    const cleanUsername = fUsername.trim().toLowerCase();

    // Check duplicate username
    const duplicate = users.find(u => u.username.toLowerCase() === cleanUsername && u.id !== editingUserId);
    if (duplicate) {
      showToast(`Username "${cleanUsername}" sudah digunakan oleh petugas lain (${duplicate.fullName})!`, 'error');
      return;
    }

    if (editingUserId) {
      const existing = users.find(u => u.id === editingUserId);
      updateUser({
        id: editingUserId,
        fullName: fFullName.trim(),
        nip: fNip.trim() || undefined,
        username: cleanUsername,
        password: fPassword.trim() || existing?.password || '12345',
        role: fRole,
        department: fDepartment,
        assignedBuilding: fAssignedBuilding,
        supervisorId: fSupervisorId || null,
        phone: fPhone.trim() || '-',
        status: fStatus,
        email: existing?.email
      });
      setIsFormOpen(false);
    } else {
      const newId = getNextSequentialId(users, 'usr-');
      addUser({
        id: newId,
        fullName: fFullName.trim(),
        nip: fNip.trim() || undefined,
        username: cleanUsername,
        password: fPassword.trim() || '12345',
        role: fRole,
        department: fDepartment,
        assignedBuilding: fAssignedBuilding,
        supervisorId: fSupervisorId || null,
        phone: fPhone.trim() || '-',
        status: fStatus
      });
      setIsFormOpen(false);
    }
  };

  // Quick Password Change Handler
  const handleSaveQuickPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwdTargetUser) return;
    if (!newPasswordVal.trim()) {
      showToast('Kata sandi baru tidak boleh kosong!', 'warning');
      return;
    }
    updateUser({
      ...pwdTargetUser,
      password: newPasswordVal.trim()
    });
    showToast(`Kata sandi untuk ${pwdTargetUser.fullName} (${pwdTargetUser.username}) berhasil diubah!`, 'success');
    setPwdTargetUser(null);
    setNewPasswordVal('');
  };

  // Pending Approvals
  const pendingRegistrations = useMemo(() => {
    return users.filter(u => u.status === 'Menunggu Persetujuan');
  }, [users]);

  const pendingPasswordResets = useMemo(() => {
    return (passwordResetRequests || []).filter(r => r.status === 'MENUNGGU_PERSETUJUAN');
  }, [passwordResetRequests]);

  const totalPendingApprovals = pendingRegistrations.length + pendingPasswordResets.length;

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      // Query Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = String(user.fullName || '').toLowerCase().includes(q);
        const matchUser = String(user.username || '').toLowerCase().includes(q);
        const matchPhone = String(user.phone || '').toLowerCase().includes(q);
        const matchDept = String(user.department || '').toLowerCase().includes(q);
        const matchRole = String(user.role || '').toLowerCase().includes(q);
        if (!matchName && !matchUser && !matchPhone && !matchDept && !matchRole) {
          return false;
        }
      }

      // Role filter
      if (roleFilter !== 'ALL') {
        const rStr = String(user.role || '');
        if (roleFilter === 'ADMIN_GROUP' && !isSuperAdmin(user.role)) return false;
        if (roleFilter === 'RECEP_GROUP' && !rStr.includes('Resepsionis')) return false;
        if (roleFilter === 'FINANCE_GROUP' && !isKeuanganRole(user.role, user.department)) return false;
        if (roleFilter === 'QC_GROUP' && !rStr.includes('QC') && !rStr.includes('Quality')) return false;
        if (roleFilter === 'TEK_GROUP' && !rStr.includes('Teknisi')) return false;
        if (roleFilter === 'KOP_GROUP' && !rStr.includes('Koperasi')) return false;
      }

      // Status filter
      if (statusFilter !== 'ALL' && user.status !== statusFilter) {
        return false;
      }

      // Building filter
      if (buildingFilter !== 'ALL' && user.assignedBuilding !== buildingFilter) {
        return false;
      }

      return true;
    });
  }, [users, searchQuery, roleFilter, statusFilter, buildingFilter]);

  // Role Badges & Colors Helper
  const getRoleBadge = (role: string) => {
    if (role === 'Super Admin') {
      return { bg: 'bg-purple-100 dark:bg-purple-950/70 text-purple-900 dark:text-purple-200 border-purple-300 dark:border-purple-600', icon: 'fa-crown', label: 'Super Admin' };
    }
    if (role === 'Admin') {
      return { bg: 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-900 dark:text-indigo-200 border-indigo-300 dark:border-indigo-600', icon: 'fa-shield-halved', label: 'Admin Sistem' };
    }
    if (role === 'Manager Resepsionis') {
      return { bg: 'bg-blue-100 dark:bg-blue-950/70 text-blue-900 dark:text-blue-200 border-blue-300 dark:border-blue-600', icon: 'fa-user-tie', label: 'Manager Pelayanan' };
    }
    if (role === 'Resepsionis') {
      return { bg: 'bg-sky-100 dark:bg-sky-950/70 text-sky-900 dark:text-sky-200 border-sky-300 dark:border-sky-600', icon: 'fa-bell-concierge', label: 'Resepsionis' };
    }
    if (role === 'Manager Keuangan') {
      return { bg: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-600', icon: 'fa-file-invoice-dollar', label: 'Manager Keuangan' };
    }
    if (role === 'Bendahara / Keuangan' || role === 'Bendahara') {
      return { bg: 'bg-teal-100 dark:bg-teal-950/70 text-teal-900 dark:text-teal-200 border-teal-300 dark:border-teal-600', icon: 'fa-money-bill-transfer', label: 'Bendahara Penerimaan' };
    }
    if (role === 'Staff Keuangan' || role === 'Keuangan') {
      return { bg: 'bg-teal-50 dark:bg-teal-950/60 text-teal-900 dark:text-teal-200 border-teal-200 dark:border-teal-600', icon: 'fa-receipt', label: 'Staf Keuangan / Kasir' };
    }
    if (role === 'Manager QC') {
      return { bg: 'bg-cyan-100 dark:bg-cyan-950/70 text-cyan-900 dark:text-cyan-200 border-cyan-300 dark:border-cyan-600', icon: 'fa-clipboard-check', label: 'Manager QC' };
    }
    if (role === 'Quality Control') {
      return { bg: 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-900 dark:text-cyan-200 border-cyan-200 dark:border-cyan-600', icon: 'fa-magnifying-glass-check', label: 'Staf QC' };
    }
    if (role === 'Manager Teknisi') {
      return { bg: 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-600', icon: 'fa-wrench', label: 'Manager Fasilitas' };
    }
    if (role === 'Teknisi') {
      return { bg: 'bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-600', icon: 'fa-screwdriver-wrench', label: 'Teknisi Lapangan' };
    }
    if (role === 'Manager Koperasi') {
      return { bg: 'bg-orange-100 dark:bg-orange-950/70 text-orange-900 dark:text-orange-200 border-orange-300 dark:border-orange-600', icon: 'fa-store', label: 'Manager Konsumsi' };
    }
    return { bg: 'bg-orange-50 dark:bg-orange-950/60 text-orange-900 dark:text-orange-200 border-orange-200 dark:border-orange-600', icon: 'fa-utensils', label: 'Petugas Koperasi' };
  };

  // Export List as CSV
  const handleExportCSV = () => {
    const headers = ['ID', 'Username/NIP', 'Nama Lengkap', 'Jabatan / Peran', 'Departemen', 'Penugasan Gedung', 'Atasan Langsung', 'No. HP', 'Status Akun'];
    const rows = filteredUsers.map(u => {
      const supervisor = users.find(s => s.id === u.supervisorId);
      return [
        u.id,
        u.username,
        `"${u.fullName.replace(/"/g, '""')}"`,
        `"${u.role}"`,
        `"${u.department || '-'}"`,
        `"${u.assignedBuilding || 'Semua Gedung'}"`,
        `"${supervisor ? supervisor.fullName : '-'}"`,
        `"${u.phone || '-'}"`,
        u.status
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Daftar_Petugas_UPT_Asrama_Haji_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Berkas daftar anggota (.CSV) berhasil diunduh.', 'success');
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 1. TOP HEADER BANNER */}
      <div className="bg-gradient-to-r from-slate-900 via-hajj-900 to-slate-900 rounded-2xl p-4 sm:p-6 text-white shadow-md border border-gold-500/30 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 flex items-center pr-10 pointer-events-none">
          <i className="fa-solid fa-users-gear text-9xl"></i>
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <div className="inline-flex items-center space-x-2 bg-gold-400/20 text-gold-300 border border-gold-400/30 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[11px] sm:text-xs font-bold">
                <i className="fa-solid fa-user-shield"></i>
                <span>Otoritas Administrator Operasional</span>
              </div>
              <div className="inline-flex items-center space-x-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[11px] sm:text-xs font-semibold">
                <i className="fa-solid fa-database text-[10px] sm:text-[11px]"></i>
                <span>Penyimpanan Lokal Mandiri</span>
              </div>
            </div>

            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2.5 flex-wrap">
              <span>Kelola Anggota & Akun Petugas</span>
            </h2>

            <p className="text-[11px] sm:text-xs text-slate-300 leading-relaxed">
              Pusat otorisasi dan penugasan staf UPT Asrama Haji Jakarta. Sebagai Administrator, Anda memiliki wewenang penuh untuk mendaftarkan petugas baru, mengatur struktur divisi & atasan, mengelola hak akses gedung, mereset sandi, serta menonaktifkan akun petugas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleOpenAddForm}
              className="px-3.5 sm:px-4 py-2 sm:py-2.5 bg-gold-500 hover:bg-gold-600 text-slate-900 font-bold text-xs rounded-xl shadow-md transition flex items-center space-x-2 cursor-pointer"
            >
              <i className="fa-solid fa-user-plus"></i>
              <span>+ Tambah Anggota</span>
            </button>

            <button
              type="button"
              onClick={() => openModal('modalExport', { defaultType: 'USERS' })}
              className="px-3 sm:px-3.5 py-2 sm:py-2.5 bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center space-x-2 cursor-pointer"
              title="Unduh Laporan Resmi Daftar Anggota & Petugas (PDF Ber-QR / Excel)"
            >
              <i className="fa-solid fa-file-pdf"></i>
              <span className="hidden sm:inline">Laporan (PDF)</span>
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 sm:px-3.5 py-2 sm:py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-600 transition flex items-center space-x-2 cursor-pointer"
              title="Unduh daftar anggota (.CSV)"
            >
              <i className="fa-solid fa-file-csv text-emerald-400"></i>
              <span className="hidden sm:inline">Ekspor CSV</span>
            </button>
          </div>
        </div>

        {/* Quick KPI stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3 mt-4 sm:mt-6 pt-4 sm:pt-5 border-t border-white/10">
          <div className="bg-white/5 backdrop-blur-xs p-2.5 sm:p-3 rounded-xl border border-white/10">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Anggota</span>
            <p className="text-lg sm:text-xl font-black text-white mt-0.5">{users.length}</p>
            <span className="text-[10px] text-emerald-400 font-medium">
              {users.filter(u => u.status === 'Aktif').length} Aktif
            </span>
          </div>

          <div className="bg-white/5 backdrop-blur-xs p-2.5 sm:p-3 rounded-xl border border-white/10">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Pimpinan & Admin</span>
            <p className="text-lg sm:text-xl font-black text-purple-300 mt-0.5">
              {users.filter(u => isSuperAdmin(u.role)).length}
            </p>
            <span className="text-[10px] text-slate-400">Tata Usaha</span>
          </div>

          <div className="bg-white/5 backdrop-blur-xs p-2.5 sm:p-3 rounded-xl border border-white/10">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Resepsionis</span>
            <p className="text-lg sm:text-xl font-black text-sky-300 mt-0.5">
              {users.filter(u => u.role.includes('Resepsionis')).length}
            </p>
            <span className="text-[10px] text-slate-400">Front Office</span>
          </div>

          <div className="bg-white/5 backdrop-blur-xs p-2.5 sm:p-3 rounded-xl border border-white/10">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Tim QC</span>
            <p className="text-lg sm:text-xl font-black text-teal-300 mt-0.5">
              {users.filter(u => u.role.includes('QC') || u.role.includes('Quality')).length}
            </p>
            <span className="text-[10px] text-slate-400">Pengawasan Mutu</span>
          </div>

          <div className="bg-white/5 backdrop-blur-xs p-2.5 sm:p-3 rounded-xl border border-white/10">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Tim Teknisi</span>
            <p className="text-lg sm:text-xl font-black text-amber-300 mt-0.5">
              {users.filter(u => u.role.includes('Teknisi')).length}
            </p>
            <span className="text-[10px] text-slate-400">Pemeliharaan</span>
          </div>

          <div className="bg-white/5 backdrop-blur-xs p-2.5 sm:p-3 rounded-xl border border-white/10">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Tim Koperasi</span>
            <p className="text-lg sm:text-xl font-black text-emerald-300 mt-0.5">
              {users.filter(u => u.role.includes('Koperasi')).length}
            </p>
            <span className="text-[10px] text-slate-400">Konsumsi & Dapur</span>
          </div>
        </div>
      </div>

      {/* 1.5. ANTREAN PERSETUJUAN (ACC) AKUN & RESET PASSWORD */}
      <div id="approval-queue-section" className={`rounded-2xl border transition-all overflow-hidden scroll-mt-24 ${
        totalPendingApprovals > 0 
          ? 'bg-amber-50/70 border-amber-300 shadow-sm' 
          : 'bg-white border-slate-200'
      }`}>
        <div className="p-4 sm:p-5 flex items-center justify-between border-b border-slate-200/80">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-xs ${
              totalPendingApprovals > 0 ? 'bg-amber-600' : 'bg-slate-600'
            }`}>
              <i className="fa-solid fa-clipboard-check text-lg"></i>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-black text-slate-900 text-sm sm:text-base">
                  Antrean Persetujuan (Verifikasi)
                </h3>
                {totalPendingApprovals > 0 ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white shadow-xs animate-pulse">
                    {totalPendingApprovals} Menunggu ACC
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    Semua Terproses
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Verifikasi pendaftaran anggota baru dan permohonan pembaruan kata sandi dari petugas
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowApprovalSection(s => !s)}
            className="px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer"
          >
            <span>{showApprovalSection ? 'Sembunyikan' : 'Buka Antrean'}</span>
            <i className={`fa-solid fa-chevron-${showApprovalSection ? 'up' : 'down'} text-[10px]`}></i>
          </button>
        </div>

        {showApprovalSection && (
          <div className="p-4 sm:p-5 space-y-4">
            {/* Sub-tabs: Pendaftaran vs Lupa Password */}
            <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
              <button
                type="button"
                onClick={() => setApprovalTab('REGISTER')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
                  approvalTab === 'REGISTER'
                    ? 'bg-hajj-800 text-gold-300 shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <i className="fa-solid fa-user-plus text-xs"></i>
                <span>Pendaftaran Akun Baru</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  pendingRegistrations.length > 0
                    ? 'bg-amber-500 text-white font-bold'
                    : 'bg-slate-200 text-slate-600'
                }`}>
                  {pendingRegistrations.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setApprovalTab('PASSWORD_RESET')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
                  approvalTab === 'PASSWORD_RESET'
                    ? 'bg-amber-800 text-gold-300 shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <i className="fa-solid fa-key text-xs"></i>
                <span>Permohonan Reset Kata Sandi</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  pendingPasswordResets.length > 0
                    ? 'bg-amber-500 text-white font-bold'
                    : 'bg-slate-200 text-slate-600'
                }`}>
                  {pendingPasswordResets.length}
                </span>
              </button>
            </div>

            {/* TAB 1: Pendaftaran Akun Baru */}
            {approvalTab === 'REGISTER' && (
              <div>
                {pendingRegistrations.length === 0 ? (
                  <div className="py-8 text-center bg-white rounded-xl border border-dashed border-slate-200">
                    <i className="fa-solid fa-user-check text-slate-300 text-3xl mb-2"></i>
                    <p className="text-xs font-bold text-slate-600">Tidak ada pendaftaran akun baru yang menunggu persetujuan.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Semua permohonan akun petugas telah diproses.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {pendingRegistrations.map(cand => (
                      <div key={cand.id} className="bg-white p-4 rounded-xl border-2 border-amber-300 shadow-xs flex flex-col justify-between space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 flex items-center justify-center font-bold text-sm">
                              {cand.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <h4 className="font-bold text-slate-900 text-sm leading-snug">{cand.fullName}</h4>
                              <p className="text-xs font-mono text-slate-500">@{cand.username}</p>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                            Menunggu ACC
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-slate-600">
                          <div>
                            <span className="text-slate-400 text-[10px] block">Peran / Jabatan:</span>
                            <span className="font-bold text-slate-800">{cand.role}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 text-[10px] block">Departemen:</span>
                            <span className="font-semibold text-slate-800 truncate block">{cand.department || 'Pelayanan'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 text-[10px] block">Gedung Tugas:</span>
                            <span className="font-medium text-slate-700">{cand.assignedBuilding || 'Semua Gedung'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 text-[10px] block">No. HP / WA:</span>
                            <span className="font-medium text-slate-700">{cand.phone || '-'}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmActionModal({
                                type: 'REJECT_REG',
                                id: cand.id,
                                title: 'Tolak Pendaftaran Akun',
                                description: 'Apakah Anda yakin ingin menolak permohonan pendaftaran akun petugas ini? Akun akan dihapus dari antrean persetujuan.',
                                targetName: cand.fullName,
                                targetUsername: cand.username
                              });
                            }}
                            className="px-3 py-1.5 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition flex items-center space-x-1 cursor-pointer"
                          >
                            <i className="fa-solid fa-xmark text-xs"></i>
                            <span>Tolak</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => approveUserRegistration(cand.id)}
                            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
                          >
                            <i className="fa-solid fa-check text-xs"></i>
                            <span>Setujui (ACC)</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Permohonan Reset Kata Sandi */}
            {approvalTab === 'PASSWORD_RESET' && (
              <div>
                {pendingPasswordResets.length === 0 ? (
                  <div className="py-8 text-center bg-white rounded-xl border border-dashed border-slate-200">
                    <i className="fa-solid fa-key text-slate-300 text-3xl mb-2"></i>
                    <p className="text-xs font-bold text-slate-600">Tidak ada permohonan reset kata sandi yang menunggu persetujuan.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Semua pengajuan kata sandi baru telah diproses.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {pendingPasswordResets.map(req => (
                      <div key={req.id} className="bg-white p-4 rounded-xl border-2 border-amber-300 shadow-xs flex flex-col justify-between space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 flex items-center justify-center font-bold text-sm">
                              <i className="fa-solid fa-key"></i>
                            </div>
                            <div>
                              <h4 className="font-bold text-slate-900 text-sm leading-snug">{req.fullName}</h4>
                              <p className="text-xs font-mono text-slate-500">@{req.username} • {req.role}</p>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                            Menunggu ACC
                          </span>
                        </div>

                        <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs text-slate-700">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 text-[11px]">Kata Sandi Baru Diajukan:</span>
                            <span className="font-mono font-bold bg-amber-100 border border-amber-300 text-amber-900 px-2 py-0.5 rounded text-xs">
                              {req.newPassword}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-400">Waktu Pengajuan:</span>
                            <span className="text-slate-600 font-medium">{req.requestDate}</span>
                          </div>
                          {req.notes && (
                            <div className="text-[11px] pt-1 border-t border-slate-200 text-slate-500 italic">
                              "{req.notes}"
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmActionModal({
                                type: 'REJECT_RESET',
                                id: req.id,
                                title: 'Tolak Reset Kata Sandi',
                                description: 'Apakah Anda yakin ingin menolak permohonan pembaruan kata sandi untuk akun petugas ini? Kata sandi lama tetap digunakan.',
                                targetName: req.fullName,
                                targetUsername: req.username
                              });
                            }}
                            className="px-3 py-1.5 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition flex items-center space-x-1 cursor-pointer"
                          >
                            <i className="fa-solid fa-xmark text-xs"></i>
                            <span>Tolak</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => approvePasswordReset(req.id)}
                            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
                          >
                            <i className="fa-solid fa-check text-xs"></i>
                            <span>Setujui (ACC Sandi)</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. ADD / EDIT USER FORM (COLLAPSIBLE / MODAL-LIKE DRAWER) */}
      {isFormOpen && (
        <div id="user-form-section" className="bg-white rounded-2xl p-6 shadow-md border-2 border-hajj-600 space-y-5 animate-in fade-in slide-in-from-top-4 duration-200 scroll-mt-24">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center space-x-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold ${
                editingUserId ? 'bg-amber-600' : 'bg-hajj-700'
              }`}>
                <i className={`fa-solid ${editingUserId ? 'fa-user-pen' : 'fa-user-plus'}`}></i>
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-base">
                  {editingUserId ? `Edit Data Anggota Petugas: ${fFullName}` : 'Tambah Anggota / Petugas Baru'}
                </h3>
                <p className="text-xs text-slate-500">
                  {editingUserId 
                    ? 'Perbarui profil, jabatan, kata sandi, dan gedung penugasan anggota ini.'
                    : 'Daftarkan petugas baru ke dalam sistem operasional online UPT Asrama Haji Jakarta.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="text-slate-400 hover:text-slate-700 p-2 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              title="Tutup Formulir"
            >
              <i className="fa-solid fa-xmark text-lg"></i>
            </button>
          </div>

          <form onSubmit={handleSaveUser} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {/* Nama Lengkap */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Lengkap & Gelar <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Siti Rahmawati, S.Kom"
                  value={fFullName}
                  onChange={e => setFFullName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-hajj-600 focus:bg-white"
                />
              </div>

              {/* NIP Resmi */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  NIP Resmi Pegawai <span className="text-slate-400 font-normal">(Opsional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: 19850712 201001 1 002"
                  value={fNip}
                  onChange={e => setFNip(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 font-mono focus:outline-hidden focus:ring-2 focus:ring-hajj-600 focus:bg-white"
                />
                <span className="text-[10px] text-slate-400">Dicantumkan pada lembar tanda tangan laporan PDF</span>
              </div>

              {/* Username */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Username Login <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 text-xs">@</span>
                  <input
                    type="text"
                    required
                    placeholder="siti.rahma..."
                    value={fUsername}
                    onChange={e => setFUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                    className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 font-mono focus:outline-hidden focus:ring-2 focus:ring-hajj-600 focus:bg-white"
                  />
                </div>
                <span className="text-[10px] text-slate-400">Digunakan untuk login (huruf kecil tanpa spasi)</span>
              </div>

              {/* Kata Sandi */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Kata Sandi Login <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Kata sandi akun"
                    value={fPassword}
                    onChange={e => setFPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 font-mono focus:outline-hidden focus:ring-2 focus:ring-hajj-600 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-xs`}></i>
                  </button>
                </div>
                <span className="text-[10px] text-slate-400">Default: <code className="font-mono font-bold text-slate-600">12345</code></span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {/* Peran / Jabatan */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Peran / Jabatan <span className="text-rose-500">*</span>
                </label>
                <select
                  value={fRole}
                  onChange={e => handleRoleChange(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-hajj-600 focus:bg-white"
                >
                  <optgroup label="Pimpinan & Administrator">
                    <option value="Super Admin">Super Admin</option>
                    <option value="Admin">Admin Sistem</option>
                  </optgroup>
                  <optgroup label="Divisi Pelayanan (Front Office)">
                    <option value="Manager Resepsionis">Manager Resepsionis</option>
                    <option value="Resepsionis">Resepsionis</option>
                  </optgroup>
                  <optgroup label="Divisi Keuangan & Perbendaharaan">
                    <option value="Manager Keuangan">Manager Keuangan</option>
                    <option value="Bendahara / Keuangan">Bendahara / Keuangan</option>
                    <option value="Staff Keuangan">Staff Keuangan</option>
                  </optgroup>
                  <optgroup label="Divisi Pengawasan Mutu (QC)">
                    <option value="Manager QC">Manager QC</option>
                    <option value="Quality Control">Quality Control (QC)</option>
                  </optgroup>
                  <optgroup label="Divisi Pemeliharaan & Fasilitas">
                    <option value="Manager Teknisi">Manager Teknisi</option>
                    <option value="Teknisi">Teknisi</option>
                  </optgroup>
                  <optgroup label="Divisi Koperasi & Konsumsi">
                    <option value="Manager Koperasi">Manager Koperasi</option>
                    <option value="Petugas Koperasi">Petugas Koperasi</option>
                  </optgroup>
                </select>
              </div>

              {/* Departemen */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Departemen / Divisi</label>
                <select
                  value={fDepartment}
                  onChange={e => setFDepartment(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-hajj-600 focus:bg-white"
                >
                  <option value="Pimpinan / Tata Usaha">Pimpinan / Tata Usaha</option>
                  <option value="Keuangan & Perbendaharaan">Keuangan & Perbendaharaan</option>
                  <option value="Pelayanan & Resepsionis">Pelayanan & Resepsionis</option>
                  <option value="Pengawasan Mutu & QC">Pengawasan Mutu & QC</option>
                  <option value="Pemeliharaan Fasilitas & Teknisi">Pemeliharaan Fasilitas & Teknisi</option>
                  <option value="Koperasi, Dapur & Konsumsi">Koperasi, Dapur & Konsumsi</option>
                </select>
              </div>

              {/* Penugasan Gedung */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Penugasan Gedung</label>
                <select
                  value={fAssignedBuilding}
                  onChange={e => setFAssignedBuilding(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-hajj-600 focus:bg-white"
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

              {/* Atasan Langsung */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Atasan Langsung (Hirarki)</label>
                <select
                  value={fSupervisorId}
                  onChange={e => setFSupervisorId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-hajj-600 focus:bg-white"
                >
                  <option value="">-- Tidak Ada (Puncak Hirarki) --</option>
                  {users
                    .filter(u => u.id !== editingUserId)
                    .map(u => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.role})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Kontak WhatsApp / HP */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nomor Telepon / WhatsApp</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 text-xs">
                    <i className="fa-solid fa-phone"></i>
                  </span>
                  <input
                    type="text"
                    placeholder="081234567890"
                    value={fPhone}
                    onChange={e => setFPhone(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-hajj-600 focus:bg-white"
                  />
                </div>
              </div>

              {/* Status Akun */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Status Keaktifan Akun</label>
                <div className="flex items-center space-x-3 pt-1">
                  <label className="flex items-center space-x-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="uStatus"
                      value="Aktif"
                      checked={fStatus === 'Aktif'}
                      onChange={() => setFStatus('Aktif')}
                      className="text-hajj-600 focus:ring-hajj-500"
                    />
                    <span className="font-bold text-emerald-700 flex items-center space-x-1">
                      <i className="fa-solid fa-circle-check text-xs"></i>
                      <span>Aktif (Dapat Login)</span>
                    </span>
                  </label>

                  <label className="flex items-center space-x-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="uStatus"
                      value="Non-Aktif"
                      checked={fStatus === 'Non-Aktif'}
                      onChange={() => setFStatus('Non-Aktif')}
                      className="text-slate-600 focus:ring-slate-500"
                    />
                    <span className="font-medium text-slate-600 flex items-center space-x-1">
                      <i className="fa-solid fa-ban text-xs text-slate-400"></i>
                      <span>Non-Aktif (Akses Ditangguhkan)</span>
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-hajj-700 hover:bg-hajj-800 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center space-x-2 cursor-pointer"
              >
                <i className="fa-solid fa-floppy-disk"></i>
                <span>{editingUserId ? 'Simpan Perubahan Anggota' : 'Daftarkan Anggota Baru'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. FILTER & SEARCH CONTROLS */}
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
              <i className="fa-solid fa-magnifying-glass text-xs"></i>
            </span>
            <input
              type="text"
              placeholder="Cari anggota berdasarkan nama, username, NIP, peran, atau no. telp..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-hajj-600 focus:bg-white"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                <i className="fa-solid fa-xmark text-xs"></i>
              </button>
            )}
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 self-start md:self-auto shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('TABLE')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer ${
                viewMode === 'TABLE' ? 'bg-white text-hajj-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-table-list"></i>
              <span>Tabel</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('GRID')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer ${
                viewMode === 'GRID' ? 'bg-white text-hajj-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-grip"></i>
              <span>Kartu</span>
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
          <div className="flex items-center space-x-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">Divisi:</span>
            {[
              { id: 'ALL', label: 'Semua' },
              { id: 'ADMIN_GROUP', label: 'Pimpinan & Admin' },
              { id: 'RECEP_GROUP', label: 'Resepsionis' },
              { id: 'FINANCE_GROUP', label: 'Keuangan' },
              { id: 'QC_GROUP', label: 'Quality Control' },
              { id: 'TEK_GROUP', label: 'Teknisi' },
              { id: 'KOP_GROUP', label: 'Koperasi' }
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setRoleFilter(f.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  roleFilter === f.id
                    ? 'bg-hajj-800 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block"></div>

          {/* Status Filter */}
          <div className="flex items-center space-x-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">Status:</span>
            {[
              { id: 'ALL', label: 'Semua' },
              { id: 'Aktif', label: 'Aktif' },
              { id: 'Non-Aktif', label: 'Non-Aktif' },
              { id: 'Menunggu Persetujuan', label: `Menunggu ACC (${pendingRegistrations.length})` }
            ].map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStatusFilter(s.id as any)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  statusFilter === s.id
                    ? s.id === 'Menunggu Persetujuan' ? 'bg-amber-600 text-white shadow-xs' : 'bg-slate-800 text-white shadow-xs'
                    : s.id === 'Menunggu Persetujuan' && pendingRegistrations.length > 0 ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block"></div>

          {/* Building Filter */}
          <div className="flex items-center space-x-1.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Penugasan:</span>
            <select
              value={buildingFilter}
              onChange={e => setBuildingFilter(e.target.value)}
              className="text-xs bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg px-2.5 py-1 font-semibold text-slate-700 outline-none cursor-pointer focus:ring-1 focus:ring-hajj-600"
            >
              <option value="ALL">Semua Penugasan</option>
              <option value="Semua Gedung">Semua Gedung (Umum)</option>
              {buildings.slice().sort((a, b) => compareBuildingOrder(a.name, b.name)).map(b => (
                <option key={b.id} value={b.name}>{b.name}</option>
              ))}
              <option value="Ruang Pertemuan">Ruang Pertemuan / Aula</option>
              <option value="Dapur & Distribusi Sarapan">Dapur & Distribusi Sarapan</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4. MEMBER DIRECTORY VIEW (TABLE OR GRID) */}
      {filteredUsers.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-xs space-y-3">
          <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto text-2xl">
            <i className="fa-solid fa-user-slash"></i>
          </div>
          <h4 className="font-bold text-slate-800 text-base">Tidak Ada Petugas Ditemukan</h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Tidak ada data anggota petugas yang sesuai dengan kata kunci pencarian atau filter yang dipilih.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setRoleFilter('ALL');
              setStatusFilter('ALL');
              setBuildingFilter('ALL');
            }}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition"
          >
            Reset Semua Filter
          </button>
        </div>
      ) : viewMode === 'TABLE' ? (
        /* TABLE VIEW */
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-slate-800 dark:text-slate-100 text-xs">
                Menampilkan {filteredUsers.length} dari {users.length} Petugas
              </span>
            </div>
            <span className="text-[11px] text-slate-600 dark:text-slate-100 font-medium">
              Klik nama atau tombol aksi untuk mengubah wewenang &amp; status akun.
            </span>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-100 font-bold border-b border-slate-200 dark:border-slate-700 text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4 text-slate-700 dark:text-slate-100">Petugas</th>
                  <th className="py-3 px-4 text-slate-700 dark:text-slate-100">Jabatan &amp; Divisi</th>
                  <th className="py-3 px-4 text-slate-700 dark:text-slate-100">Penugasan Gedung</th>
                  <th className="py-3 px-4 text-slate-700 dark:text-slate-100">Atasan Langsung</th>
                  <th className="py-3 px-4 text-slate-700 dark:text-slate-100">Kontak HP</th>
                  <th className="py-3 px-4 text-slate-700 dark:text-slate-100">Kata Sandi</th>
                  <th className="py-3 px-4 text-center text-slate-700 dark:text-slate-100">Status</th>
                  <th className="py-3 px-4 text-right text-slate-700 dark:text-slate-100">Aksi &amp; Kelola</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredUsers.map(user => {
                  const badge = getRoleBadge(user.role);
                  const supervisor = users.find(u => u.id === user.supervisorId);
                  const isCurrent = currentUser?.id === user.id;
                  const isMainAdmin = user.username.toLowerCase() === 'admin';

                  return (
                    <tr key={user.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/40 transition-colors">
                      {/* Petugas info */}
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-3">
                          <div className="relative">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                              user.role.includes('Admin') ? 'bg-purple-700 text-white' :
                              user.role.includes('QC') ? 'bg-teal-700 text-white' :
                              user.role.includes('Teknisi') ? 'bg-amber-600 text-white' :
                              user.role.includes('Koperasi') ? 'bg-emerald-700 text-white' :
                              'bg-blue-700 text-white'
                            }`}>
                              {user.fullName.charAt(0).toUpperCase()}
                            </div>
                            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-800 ${
                              user.status === 'Aktif' ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}></span>
                          </div>

                          <div>
                            <div className="flex items-center space-x-1.5 flex-wrap">
                              <span className="font-bold text-slate-900 dark:text-slate-100">{user.fullName}</span>
                              {isCurrent && (
                                <span className="bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 text-[9px] font-black px-1.5 py-0.2 rounded border border-emerald-300 dark:border-emerald-700">
                                  Akun Anda
                                </span>
                              )}
                            </div>
                            <div className="flex items-center space-x-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap gap-y-0.5">
                              <span className="font-mono text-slate-600 dark:text-slate-300">@{user.username}</span>
                              {user.nip && (
                                <>
                                  <span>•</span>
                                  <span className="text-slate-600 dark:text-slate-300 font-mono text-[10px] bg-slate-100 dark:bg-slate-700/60 px-1.5 py-0.2 rounded border border-slate-200 dark:border-slate-600">
                                    NIP: {user.nip}
                                  </span>
                                </>
                              )}
                              {user.email && (
                                <>
                                  <span>•</span>
                                  <span className="text-slate-600 dark:text-slate-300 font-mono text-[10px]">
                                    {user.email}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Jabatan & Divisi */}
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold border ${badge.bg}`}>
                            <i className={`fa-solid ${badge.icon}`}></i>
                            <span>{user.role}</span>
                          </span>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">{user.department || 'Pelayanan'}</p>
                        </div>
                      </td>

                      {/* Penugasan Gedung */}
                      <td className="py-3 px-4">
                        <span className="text-slate-700 dark:text-slate-200 font-medium">{user.assignedBuilding || 'Semua Gedung'}</span>
                      </td>

                      {/* Atasan Langsung */}
                      <td className="py-3 px-4">
                        {supervisor ? (
                          <div>
                            <p className="font-semibold text-slate-800 dark:text-slate-100">{supervisor.fullName}</p>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">{supervisor.role}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 italic text-[11px]">- (Puncak Hirarki)</span>
                        )}
                      </td>

                      {/* Kontak HP */}
                      <td className="py-3 px-4">
                        {user.phone && user.phone !== '-' ? (
                          <a
                            href={`https://wa.me/${user.phone.replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-700 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-400 font-medium flex items-center space-x-1"
                            title="Chat WhatsApp"
                          >
                            <i className="fa-brands fa-whatsapp text-emerald-600 dark:text-emerald-400"></i>
                            <span>{user.phone}</span>
                          </a>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">-</span>
                        )}
                      </td>

                      {/* Kata Sandi */}
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-1.5">
                          <code className="text-slate-700 dark:text-slate-200 font-mono bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-[11px] border border-slate-200 dark:border-slate-600">
                            {user.password || '12345'}
                          </code>
                          <button
                            type="button"
                            onClick={() => {
                              setPwdTargetUser(user);
                              setNewPasswordVal(user.password || '12345');
                            }}
                            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                            title="Ubah Kata Sandi Petugas"
                          >
                            <i className="fa-solid fa-key text-[10px]"></i>
                          </button>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        {user.status === 'Menunggu Persetujuan' ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 animate-pulse inline-flex items-center space-x-1">
                            <i className="fa-solid fa-clock text-[9px]"></i>
                            <span>MENUNGGU ACC</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleUserStatus(user.id)}
                            disabled={isMainAdmin || isCurrent}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black transition cursor-pointer ${
                              user.status === 'Aktif'
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-300'
                            } ${isMainAdmin || isCurrent ? 'opacity-60 cursor-not-allowed' : ''}`}
                            title={isMainAdmin ? 'Akun Administrator utama tidak dapat dinonaktifkan' : 'Klik untuk mengubah status aktif/non-aktif'}
                          >
                            {user.status === 'Aktif' ? '● AKTIF' : '○ NON-AKTIF'}
                          </button>
                        )}
                      </td>

                      {/* Aksi & Kelola */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          {user.status === 'Menunggu Persetujuan' ? (
                            <button
                              type="button"
                              onClick={() => {
                                setShowApprovalSection(true);
                                setApprovalTab('REGISTER');
                                document.getElementById('approval-queue-section')?.scrollIntoView({ behavior: 'smooth' });
                              }}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer shadow-xs"
                              title="Buka panel persetujuan akun ini di Antrean Verifikasi"
                            >
                              <i className="fa-solid fa-clipboard-check text-xs"></i>
                              <span>Verifikasi di Antrean</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                login(user);
                                setActiveTab('dashboard');
                                showToast(`Simulasi login: ${user.fullName} (${user.role})`, 'success');
                              }}
                              className="p-1.5 text-indigo-700 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                              title="Simulasikan login sebagai anggota ini"
                            >
                              <i className="fa-solid fa-arrow-right-to-bracket text-xs"></i>
                            </button>
                          )}

                          {/* Edit User */}
                          <button
                            type="button"
                            onClick={() => handleStartEdit(user)}
                            className="p-1.5 text-blue-700 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                            title="Edit data & profil anggota"
                          >
                            <i className="fa-solid fa-pen-to-square text-xs"></i>
                          </button>

                          {/* Delete User */}
                          <button
                            type="button"
                            onClick={() => {
                              if (isMainAdmin) {
                                showToast('Akun Administrator Utama (admin) dilindungi dan tidak dapat dihapus!', 'error');
                                return;
                              }
                              if (isCurrent) {
                                showToast('Anda tidak dapat menghapus akun Anda sendiri!', 'warning');
                                return;
                              }
                              setConfirmActionModal({
                                type: 'DELETE_USER',
                                id: user.id,
                                title: 'Hapus Akun Petugas',
                                description: 'Apakah Anda yakin ingin menghapus akun petugas ini dari pangkalan data sistem? Tindakan ini permanen.',
                                targetName: user.fullName,
                                targetUsername: user.username
                              });
                            }}
                            disabled={isMainAdmin || isCurrent}
                            className={`p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer ${
                              isMainAdmin || isCurrent ? 'opacity-30 cursor-not-allowed' : ''
                            }`}
                            title={isMainAdmin ? 'Dilindungi' : 'Hapus akun petugas'}
                          >
                            <i className="fa-solid fa-trash-can text-xs"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* GRID CARD VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.map(user => {
            const badge = getRoleBadge(user.role);
            const supervisor = users.find(u => u.id === user.supervisorId);
            const isCurrent = currentUser?.id === user.id;
            const isMainAdmin = user.username.toLowerCase() === 'admin';

            return (
              <div 
                key={user.id}
                className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-xs border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm transition-all space-y-3.5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-3">
                      <div className="relative">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm text-white shadow-xs ${
                          user.role.includes('Admin') ? 'bg-purple-700' :
                          user.role.includes('QC') ? 'bg-teal-700' :
                          user.role.includes('Teknisi') ? 'bg-amber-600' :
                          user.role.includes('Koperasi') ? 'bg-emerald-700' :
                          'bg-blue-700'
                        }`}>
                          {user.fullName.charAt(0).toUpperCase()}
                        </div>
                        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-800 ${
                          user.status === 'Aktif' ? 'bg-emerald-500' : 'bg-slate-400'
                        }`}></span>
                      </div>

                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-tight flex items-center gap-1.5">
                          <span>{user.fullName}</span>
                        </h4>
                        <span className="text-slate-500 dark:text-slate-300 font-mono text-xs block">@{user.username}</span>
                        {user.nip && (
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono block">NIP: {user.nip}</span>
                        )}
                      </div>
                    </div>

                    {user.status === 'Menunggu Persetujuan' ? (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full border bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-600 animate-pulse">
                        MENUNGGU ACC
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleUserStatus(user.id)}
                        disabled={isMainAdmin || isCurrent}
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                          user.status === 'Aktif'
                            ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-200 border-emerald-300 dark:border-emerald-600'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 border-slate-300 dark:border-slate-600'
                        } ${isMainAdmin || isCurrent ? 'opacity-70' : 'cursor-pointer hover:bg-opacity-80'}`}
                      >
                        {user.status}
                      </button>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 dark:text-slate-400 text-[11px]">Peran:</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badge.bg}`}>
                        <i className={`fa-solid ${badge.icon} mr-1`}></i>
                        {user.role}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 dark:text-slate-400 text-[11px]">Penugasan:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-100 text-[11px] truncate max-w-[170px]">
                        {user.assignedBuilding || 'Semua Gedung'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 dark:text-slate-400 text-[11px]">Atasan:</span>
                      <span className="text-slate-700 dark:text-slate-200 text-[11px] truncate max-w-[170px]">
                        {supervisor ? supervisor.fullName : '-'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 dark:text-slate-400 text-[11px]">Kata Sandi:</span>
                      <div className="flex items-center space-x-1">
                        <code className="font-mono bg-slate-100 dark:bg-slate-700 px-1.5 py-0.2 rounded text-[11px] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600">
                          {user.password || '12345'}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            setPwdTargetUser(user);
                            setNewPasswordVal(user.password || '12345');
                          }}
                          className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          title="Ganti Password"
                        >
                          <i className="fa-solid fa-key text-[10px]"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  {user.status === 'Menunggu Persetujuan' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowApprovalSection(true);
                        setApprovalTab('REGISTER');
                        document.getElementById('approval-queue-section')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs"
                      title="Buka panel persetujuan akun ini di Antrean Verifikasi"
                    >
                      <i className="fa-solid fa-clipboard-check text-xs"></i>
                      <span>Verifikasi di Antrean</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        login(user);
                        setActiveTab('dashboard');
                        showToast(`Beralih simulasi login ke akun ${user.fullName}`, 'success');
                      }}
                      className="flex-1 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-lg transition flex items-center justify-center space-x-1 cursor-pointer"
                    >
                      <i className="fa-solid fa-arrow-right-to-bracket text-xs"></i>
                      <span>Uji Masuk</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleStartEdit(user)}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition cursor-pointer"
                    title="Edit Profil Petugas"
                  >
                    <i className="fa-solid fa-pen-to-square"></i>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (isMainAdmin) {
                        showToast('Akun Administrator Utama (admin) dilindungi dan tidak dapat dihapus!', 'error');
                        return;
                      }
                      if (isCurrent) {
                        showToast('Anda tidak dapat menghapus akun Anda sendiri!', 'warning');
                        return;
                      }
                      setConfirmActionModal({
                        type: 'DELETE_USER',
                        id: user.id,
                        title: 'Hapus Akun Petugas',
                        description: 'Apakah Anda yakin ingin menghapus akun petugas ini dari pangkalan data sistem? Tindakan ini permanen.',
                        targetName: user.fullName,
                        targetUsername: user.username
                      });
                    }}
                    disabled={isMainAdmin || isCurrent}
                    className={`p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-lg transition ${
                      isMainAdmin || isCurrent ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
                    }`}
                    title={isMainAdmin ? 'Dilindungi' : 'Hapus akun petugas'}
                  >
                    <i className="fa-solid fa-trash-can"></i>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. QUICK PASSWORD MODAL */}
      {pwdTargetUser && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setPwdTargetUser(null)}
        >
          <div 
            className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 flex items-center justify-center font-bold text-base">
                  <i className="fa-solid fa-key"></i>
                </div>
                <div>
                  <h4 className="font-black text-slate-900 dark:text-slate-100 text-sm">Ganti Kata Sandi Petugas</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-300">{pwdTargetUser.fullName} (@{pwdTargetUser.username})</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPwdTargetUser(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleSaveQuickPassword} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Masukkan Kata Sandi Baru
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: 12345 atau SandiBaru123"
                  value={newPasswordVal}
                  onChange={e => setNewPasswordVal(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-hajj-600 focus:bg-white dark:focus:bg-slate-900"
                />
                <p className="text-[10px] text-slate-500 dark:text-slate-300 mt-1">
                  Petugas akan menggunakan kata sandi baru ini untuk login berikutnya.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setPwdTargetUser(null)}
                  className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-hajj-700 hover:bg-hajj-800 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <i className="fa-solid fa-check"></i>
                  <span>Simpan Kata Sandi</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. IN-APP CONFIRMATION ACTION MODAL (SAFE FROM IFRAME RESTRICTIONS) */}
      {confirmActionModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setConfirmActionModal(null)}
        >
          <div 
            className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-rose-200 dark:border-rose-900/50 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-3">
              <div className="w-11 h-11 rounded-xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-lg shrink-0">
                <i className="fa-solid fa-triangle-exclamation"></i>
              </div>
              <div>
                <h4 className="font-black text-slate-900 dark:text-slate-100 text-sm leading-snug">{confirmActionModal.title}</h4>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-300">@{confirmActionModal.targetUsername} • {confirmActionModal.targetName}</p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-200 leading-relaxed">
              {confirmActionModal.description}
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setConfirmActionModal(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmActionExecute}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
              >
                <i className="fa-solid fa-trash-can text-xs"></i>
                <span>Ya, Konfirmasi Tindakan</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
