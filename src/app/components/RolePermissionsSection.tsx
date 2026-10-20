// @ts-nocheck
import React, { useState, useMemo, useEffect } from 'react';
import { User, UserRole, UserPermissions } from '../types';
import { AppSettings } from '../services/dataStorage';
import { isSuperAdmin, getUserEffectivePermissions } from '../store';
import { useBodyScrollLock } from '../lib/scrollLock';

interface RolePermissionsSectionProps {
  currentUser: User | null;
  users: User[];
  onSwitchUser?: (user: User) => void;
  onOpenLaporanKwitansi?: () => void;
  onOpenGedungKamar?: () => void;
  showToast: (msg: string, type?: string) => void;
  onUpdateUser?: (user: User) => void;
  appSettings?: AppSettings;
  onUpdateAppSettings?: (newTitleOrUpdates?: string | Partial<AppSettings>, newLogo?: string) => void;
}

type DivisionKey = 'SEMUA' | 'KEUANGAN' | 'RESEPSIONIS' | 'QC' | 'TEKNISI' | 'KOPERASI' | 'ADMIN';
type AccessLevel = 'FULL' | 'CONDITIONAL' | 'READ_ONLY' | 'NO_ACCESS';

interface PermissionFieldConfig {
  key: keyof UserPermissions;
  label: string;
  shortDesc: string;
  category: 'CONFIG' | 'HUNIAN' | 'KEUANGAN' | 'OPERASIONAL' | 'SISTEM';
  icon: string;
}

const PERMISSION_FIELD_CONFIGS: PermissionFieldConfig[] = [
  // 1. Identitas & Konfigurasi Web
  {
    key: 'canConfigApp',
    label: 'Konfigurasi Judul, Sub Judul, Alamat & Logo Instansi',
    shortDesc: 'Mengubah nama organisasi, sub judul, nama kementerian, kop surat dokumen, logo, dan favicon sistem.',
    category: 'CONFIG',
    icon: 'fa-sliders'
  },
  {
    key: 'canManageProfile',
    label: 'Profil Akun & Ganti Password Mandiri',
    shortDesc: 'Memperbarui nama lengkap, nomor telepon, dan mengganti kata sandi akun sendiri.',
    category: 'CONFIG',
    icon: 'fa-user-pen'
  },
  {
    key: 'canManageSignature',
    label: 'Spesimen Tanda Tangan Digital & QR Code',
    shortDesc: 'Mengatur atau menggambar tanda tangan resmi dan QR code verifikasi keaslian dokumen.',
    category: 'CONFIG',
    icon: 'fa-signature'
  },

  // 2. Hunian, Kamar & Denah
  {
    key: 'canCrudRooms',
    label: 'Katalog Kamar, Master Gedung & Tarif PNBP (CRUD)',
    shortDesc: 'Menambah kamar, mengubah tarif sewa per malam, mengedit tipe bed & fasilitas, dan menghapus unit.',
    category: 'HUNIAN',
    icon: 'fa-bed'
  },
  {
    key: 'canCrudCheckin',
    label: 'Check-In & Check-Out Tamu Individu',
    shortDesc: 'Melakukan registrasi check-in tamu, verifikasi NIK KTP, aktivasi kamar, dan check-out kepulangan.',
    category: 'HUNIAN',
    icon: 'fa-door-open'
  },
  {
    key: 'canCrudBooking',
    label: 'Booking Kalender & Perpanjang Sewa (Extend)',
    shortDesc: 'Membuat reservasi booking tanggal mendatang, mengatur uang muka (DP), dan perpanjangan inap.',
    category: 'HUNIAN',
    icon: 'fa-calendar-plus'
  },
  {
    key: 'canCrudGroup',
    label: 'Pendaftaran & Kelola Rombongan Instansi',
    shortDesc: 'Pendaftaran rombongan kloter/instansi, alokasi blok kamar massal, dan pembatalan rombongan.',
    category: 'HUNIAN',
    icon: 'fa-users'
  },
  {
    key: 'canCrudAula',
    label: 'Sewa Ruang Pertemuan & Gedung Serbaguna (SG)',
    shortDesc: 'Pemesanan convention hall SG-1, SG-2, MP, auditorium, dan ruang rapat (harian/sesi).',
    category: 'HUNIAN',
    icon: 'fa-building-columns'
  },

  // 3. Keuangan & Kwitansi
  {
    key: 'canRecordPayment',
    label: 'Catat Setoran Uang Muka (DP) & Pelunasan 100%',
    shortDesc: 'Mencatat bukti transfer bank, Virtual Account Mandiri/BNI, dan pelunasan tagihan sewa.',
    category: 'KEUANGAN',
    icon: 'fa-cash-register'
  },
  {
    key: 'canIssueInvoice',
    label: 'Terbitkan Faktur Tagihan (Invoice PNBP)',
    shortDesc: 'Menerbitkan dan mengunduh faktur tagihan resmi untuk tamu perseorangan maupun instansi.',
    category: 'KEUANGAN',
    icon: 'fa-file-invoice-dollar'
  },
  {
    key: 'canIssueKwitansi',
    label: 'Cetak Kwitansi Ber-QR Resmi Sah',
    shortDesc: 'Menerbitkan bukti setor sah ber-QR code anti-duplikasi dengan spesimen tanda tangan bendahara.',
    category: 'KEUANGAN',
    icon: 'fa-receipt'
  },

  // 4. Operasional, QC, Maintenance & Koperasi
  {
    key: 'canCrudQc',
    label: 'Inspeksi Kelayakan & Verifikasi Lolos QC',
    shortDesc: 'Uji checklist kebersihan & fasilitas, merilis status LOLOS_QC, atau menandai PERLU_PERBAIKAN.',
    category: 'OPERASIONAL',
    icon: 'fa-clipboard-check'
  },
  {
    key: 'canCrudMaintenance',
    label: 'Tiket Perbaikan & Disposisi Teknisi',
    shortDesc: 'Membuat tiket kerusakan, penugasan teknisi lapangan, dan update status penyelesaian perbaikan.',
    category: 'OPERASIONAL',
    icon: 'fa-screwdriver-wrench'
  },
  {
    key: 'canCrudCatering',
    label: 'Pesanan Sarapan & Katalog Menu Koperasi',
    shortDesc: 'Input pesanan konsumsi kamar/aula, update status produksi dapur, dan CRUD menu masakan.',
    category: 'OPERASIONAL',
    icon: 'fa-utensils'
  },

  // 5. Manajemen Sistem & Audit
  {
    key: 'canManageUsers',
    label: 'Kelola Akun Pegawai / Petugas (CRUD Akun)',
    shortDesc: 'Menambah petugas baru, mengedit data akun, reset kata sandi, dan menonaktifkan akun.',
    category: 'SISTEM',
    icon: 'fa-user-gear'
  },
  {
    key: 'canManagePermissions',
    label: 'Kelola Hak Akses & Otorisasi Petugas Lain',
    shortDesc: 'Wewenang mengatur dan mengalokasikan izin akses detail akun petugas di halaman ini.',
    category: 'SISTEM',
    icon: 'fa-shield-halved'
  },
  {
    key: 'canViewAuditLog',
    label: 'Akses Log Audit Aktivitas & Jam Kerja Shift',
    shortDesc: 'Melihat rekam jejak aktivitas sistem, riwayat unduh berkas PDF ber-QR, dan durasi kerja.',
    category: 'SISTEM',
    icon: 'fa-clock-rotate-left'
  },
  {
    key: 'canExportReports',
    label: 'Ekspor Laporan Resmi (Excel .xlsx & PDF)',
    shortDesc: 'Mengunduh laporan rekapitulasi okupansi, data keuangan PNBP, dan log audit ke Excel & PDF.',
    category: 'SISTEM',
    icon: 'fa-file-excel'
  }
];

interface RoleReference {
  id: string;
  role: UserRole;
  divisionKey: DivisionKey;
  divisionName: string;
  defaultUserName: string;
  icon: string;
  badgeColor: string;
  summary: string;
  permissions: Record<string, AccessLevel>;
}

const ROLES_REFERENCE_CATALOG: RoleReference[] = [
  {
    id: 'ref-super-admin',
    role: 'Super Admin',
    divisionKey: 'ADMIN',
    divisionName: 'Pimpinan & Administrator Tertinggi',
    defaultUserName: 'Administrator Utama (Kepala UPT)',
    icon: 'fa-crown',
    badgeColor: 'bg-purple-100 text-purple-900 border-purple-300 font-black',
    summary: 'Akses penuh tanpa batas ke seluruh modul operasional, keuangan, perbaikan, konsumsi, dan konfigurasi identitas instansi.',
    permissions: {
      canConfigApp: 'FULL',
      canManageProfile: 'FULL',
      canManageSignature: 'FULL',
      canCrudRooms: 'FULL',
      canCrudCheckin: 'FULL',
      canCrudBooking: 'FULL',
      canCrudGroup: 'FULL',
      canCrudAula: 'FULL',
      canRecordPayment: 'FULL',
      canIssueInvoice: 'FULL',
      canIssueKwitansi: 'FULL',
      canCrudQc: 'FULL',
      canCrudMaintenance: 'FULL',
      canCrudCatering: 'FULL',
      canManageUsers: 'FULL',
      canManagePermissions: 'FULL',
      canViewAuditLog: 'FULL',
      canExportReports: 'FULL'
    }
  },
  {
    id: 'ref-admin',
    role: 'Admin',
    divisionKey: 'ADMIN',
    divisionName: 'Tata Usaha & Administrator Operasional',
    defaultUserName: 'Admin Tata Usaha UPT',
    icon: 'fa-user-shield',
    badgeColor: 'bg-indigo-100 text-indigo-900 border-indigo-300 font-bold',
    summary: 'Pengelolaan operasional harian, otorisasi akun pengguna, konfigurasi instansi, dan rekapitulasi pelaporan.',
    permissions: {
      canConfigApp: 'FULL',
      canManageProfile: 'FULL',
      canManageSignature: 'FULL',
      canCrudRooms: 'FULL',
      canCrudCheckin: 'FULL',
      canCrudBooking: 'FULL',
      canCrudGroup: 'FULL',
      canCrudAula: 'FULL',
      canRecordPayment: 'FULL',
      canIssueInvoice: 'FULL',
      canIssueKwitansi: 'FULL',
      canCrudQc: 'FULL',
      canCrudMaintenance: 'FULL',
      canCrudCatering: 'FULL',
      canManageUsers: 'FULL',
      canManagePermissions: 'FULL',
      canViewAuditLog: 'FULL',
      canExportReports: 'FULL'
    }
  },
  {
    id: 'ref-mgr-keuangan',
    role: 'Manager Keuangan',
    divisionKey: 'KEUANGAN',
    divisionName: 'Divisi Keuangan & Perbendaharaan',
    defaultUserName: 'H. Ahmad Fauzi, S.E., M.M.',
    icon: 'fa-landmark-dome',
    badgeColor: 'bg-amber-100 text-amber-950 border-amber-300 font-black',
    summary: 'Pimpinan pengawasan kas PNBP, penetapan tarif, rekonsiliasi kas perbankan, serta otorisasi kwitansi dan invoice.',
    permissions: {
      canConfigApp: 'READ_ONLY',
      canManageProfile: 'FULL',
      canManageSignature: 'FULL',
      canCrudRooms: 'READ_ONLY',
      canCrudCheckin: 'READ_ONLY',
      canCrudBooking: 'READ_ONLY',
      canCrudGroup: 'READ_ONLY',
      canCrudAula: 'READ_ONLY',
      canRecordPayment: 'FULL',
      canIssueInvoice: 'FULL',
      canIssueKwitansi: 'FULL',
      canCrudQc: 'READ_ONLY',
      canCrudMaintenance: 'READ_ONLY',
      canCrudCatering: 'READ_ONLY',
      canManageUsers: 'READ_ONLY',
      canManagePermissions: 'NO_ACCESS',
      canViewAuditLog: 'FULL',
      canExportReports: 'FULL'
    }
  },
  {
    id: 'ref-bendahara',
    role: 'Bendahara / Keuangan',
    divisionKey: 'KEUANGAN',
    divisionName: 'Divisi Keuangan & Perbendaharaan',
    defaultUserName: 'Hj. Siti Aisyah, S.E.',
    icon: 'fa-receipt',
    badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold',
    summary: 'Pejabat fungsional perbendaharaan pemegang spesimen tanda tangan dan stempel digital pada Kwitansi Resmi ber-QR.',
    permissions: {
      canConfigApp: 'NO_ACCESS',
      canManageProfile: 'FULL',
      canManageSignature: 'FULL',
      canCrudRooms: 'READ_ONLY',
      canCrudCheckin: 'READ_ONLY',
      canCrudBooking: 'READ_ONLY',
      canCrudGroup: 'READ_ONLY',
      canCrudAula: 'READ_ONLY',
      canRecordPayment: 'FULL',
      canIssueInvoice: 'FULL',
      canIssueKwitansi: 'FULL',
      canCrudQc: 'READ_ONLY',
      canCrudMaintenance: 'READ_ONLY',
      canCrudCatering: 'READ_ONLY',
      canManageUsers: 'NO_ACCESS',
      canManagePermissions: 'NO_ACCESS',
      canViewAuditLog: 'FULL',
      canExportReports: 'FULL'
    }
  },
  {
    id: 'ref-staff-keuangan',
    role: 'Staff Keuangan',
    divisionKey: 'KEUANGAN',
    divisionName: 'Divisi Keuangan & Perbendaharaan',
    defaultUserName: 'Rian Hidayat, A.Md.',
    icon: 'fa-wallet',
    badgeColor: 'bg-teal-100 text-teal-900 border-teal-300 font-semibold',
    summary: 'Petugas loket kasir, verifikasi bukti bayar VA/transfer, input pencatatan pembayaran DP/Lunas, dan cetak faktur.',
    permissions: {
      canConfigApp: 'NO_ACCESS',
      canManageProfile: 'FULL',
      canManageSignature: 'FULL',
      canCrudRooms: 'READ_ONLY',
      canCrudCheckin: 'READ_ONLY',
      canCrudBooking: 'READ_ONLY',
      canCrudGroup: 'READ_ONLY',
      canCrudAula: 'READ_ONLY',
      canRecordPayment: 'FULL',
      canIssueInvoice: 'FULL',
      canIssueKwitansi: 'FULL',
      canCrudQc: 'NO_ACCESS',
      canCrudMaintenance: 'NO_ACCESS',
      canCrudCatering: 'READ_ONLY',
      canManageUsers: 'NO_ACCESS',
      canManagePermissions: 'NO_ACCESS',
      canViewAuditLog: 'READ_ONLY',
      canExportReports: 'FULL'
    }
  },
  {
    id: 'ref-mgr-recep',
    role: 'Manager Resepsionis',
    divisionKey: 'RESEPSIONIS',
    divisionName: 'Pelayanan & Resepsionis',
    defaultUserName: 'Dra. Hj. Nurhayati, M.Pd.',
    icon: 'fa-hotel',
    badgeColor: 'bg-blue-100 text-blue-900 border-blue-300 font-bold',
    summary: 'Pimpinan operasional front desk, alokasi blok rombongan haji, jadwal sewa aula convention, dan master kamar.',
    permissions: {
      canConfigApp: 'NO_ACCESS',
      canManageProfile: 'FULL',
      canManageSignature: 'FULL',
      canCrudRooms: 'FULL',
      canCrudCheckin: 'FULL',
      canCrudBooking: 'FULL',
      canCrudGroup: 'FULL',
      canCrudAula: 'FULL',
      canRecordPayment: 'READ_ONLY',
      canIssueInvoice: 'FULL',
      canIssueKwitansi: 'READ_ONLY',
      canCrudQc: 'READ_ONLY',
      canCrudMaintenance: 'READ_ONLY',
      canCrudCatering: 'READ_ONLY',
      canManageUsers: 'READ_ONLY',
      canManagePermissions: 'NO_ACCESS',
      canViewAuditLog: 'FULL',
      canExportReports: 'FULL'
    }
  },
  {
    id: 'ref-recep',
    role: 'Resepsionis',
    divisionKey: 'RESEPSIONIS',
    divisionName: 'Pelayanan & Resepsionis',
    defaultUserName: 'Bambang Supriyanto',
    icon: 'fa-bell-concierge',
    badgeColor: 'bg-sky-100 text-sky-900 border-sky-300 font-semibold',
    summary: 'Pelayanan check-in tamu, check-out, registrasi rombongan, booking kamar, dan penerbitan faktur tagihan invoice awal.',
    permissions: {
      canConfigApp: 'NO_ACCESS',
      canManageProfile: 'FULL',
      canManageSignature: 'FULL',
      canCrudRooms: 'FULL',
      canCrudCheckin: 'FULL',
      canCrudBooking: 'FULL',
      canCrudGroup: 'FULL',
      canCrudAula: 'FULL',
      canRecordPayment: 'NO_ACCESS',
      canIssueInvoice: 'FULL',
      canIssueKwitansi: 'NO_ACCESS',
      canCrudQc: 'READ_ONLY',
      canCrudMaintenance: 'READ_ONLY',
      canCrudCatering: 'READ_ONLY',
      canManageUsers: 'NO_ACCESS',
      canManagePermissions: 'NO_ACCESS',
      canViewAuditLog: 'READ_ONLY',
      canExportReports: 'FULL'
    }
  },
  {
    id: 'ref-mgr-qc',
    role: 'Manager QC',
    divisionKey: 'QC',
    divisionName: 'Quality Control (QC)',
    defaultUserName: 'Ir. Hendra Gunawan',
    icon: 'fa-check-double',
    badgeColor: 'bg-teal-100 text-teal-950 border-teal-300 font-bold',
    summary: 'Pengawasan standar mutu sanitasi, rilis kelayakan kamar LOLOS_QC, penolakan kamar tidak layak, dan audit fasilitas.',
    permissions: {
      canConfigApp: 'NO_ACCESS',
      canManageProfile: 'FULL',
      canManageSignature: 'FULL',
      canCrudRooms: 'READ_ONLY',
      canCrudCheckin: 'READ_ONLY',
      canCrudBooking: 'READ_ONLY',
      canCrudGroup: 'READ_ONLY',
      canCrudAula: 'READ_ONLY',
      canRecordPayment: 'NO_ACCESS',
      canIssueInvoice: 'NO_ACCESS',
      canIssueKwitansi: 'NO_ACCESS',
      canCrudQc: 'FULL',
      canCrudMaintenance: 'FULL',
      canCrudCatering: 'NO_ACCESS',
      canManageUsers: 'NO_ACCESS',
      canManagePermissions: 'NO_ACCESS',
      canViewAuditLog: 'READ_ONLY',
      canExportReports: 'FULL'
    }
  },
  {
    id: 'ref-qc',
    role: 'Quality Control',
    divisionKey: 'QC',
    divisionName: 'Quality Control (QC)',
    defaultUserName: 'Dewi Lestari, S.Si.',
    icon: 'fa-clipboard-check',
    badgeColor: 'bg-emerald-100 text-emerald-950 border-emerald-300 font-semibold',
    summary: 'Inspeksi lapangan kebersihan kamar, linen, kamar mandi, dan input checklist kelayakan kamar harian.',
    permissions: {
      canConfigApp: 'NO_ACCESS',
      canManageProfile: 'FULL',
      canManageSignature: 'FULL',
      canCrudRooms: 'READ_ONLY',
      canCrudCheckin: 'NO_ACCESS',
      canCrudBooking: 'NO_ACCESS',
      canCrudGroup: 'NO_ACCESS',
      canCrudAula: 'NO_ACCESS',
      canRecordPayment: 'NO_ACCESS',
      canIssueInvoice: 'NO_ACCESS',
      canIssueKwitansi: 'NO_ACCESS',
      canCrudQc: 'FULL',
      canCrudMaintenance: 'FULL',
      canCrudCatering: 'NO_ACCESS',
      canManageUsers: 'NO_ACCESS',
      canManagePermissions: 'NO_ACCESS',
      canViewAuditLog: 'READ_ONLY',
      canExportReports: 'READ_ONLY'
    }
  },
  {
    id: 'ref-mgr-tek',
    role: 'Manager Teknisi',
    divisionKey: 'TEKNISI',
    divisionName: 'Pemeliharaan & Teknisi',
    defaultUserName: 'ST. Agus Riyanto',
    icon: 'fa-toolbox',
    badgeColor: 'bg-amber-100 text-amber-950 border-amber-300 font-bold',
    summary: 'Disposisi tiket perbaikan AC, kelistrikan, genset, plumbing air panas/dingin, dan verifikasi penyelesaian tiket.',
    permissions: {
      canConfigApp: 'NO_ACCESS',
      canManageProfile: 'FULL',
      canManageSignature: 'FULL',
      canCrudRooms: 'READ_ONLY',
      canCrudCheckin: 'NO_ACCESS',
      canCrudBooking: 'NO_ACCESS',
      canCrudGroup: 'NO_ACCESS',
      canCrudAula: 'NO_ACCESS',
      canRecordPayment: 'NO_ACCESS',
      canIssueInvoice: 'NO_ACCESS',
      canIssueKwitansi: 'NO_ACCESS',
      canCrudQc: 'READ_ONLY',
      canCrudMaintenance: 'FULL',
      canCrudCatering: 'NO_ACCESS',
      canManageUsers: 'NO_ACCESS',
      canManagePermissions: 'NO_ACCESS',
      canViewAuditLog: 'READ_ONLY',
      canExportReports: 'FULL'
    }
  },
  {
    id: 'ref-tek',
    role: 'Teknisi',
    divisionKey: 'TEKNISI',
    divisionName: 'Pemeliharaan & Teknisi',
    defaultUserName: 'Joko Susilo',
    icon: 'fa-screwdriver-wrench',
    badgeColor: 'bg-yellow-100 text-yellow-950 border-yellow-300 font-semibold',
    summary: 'Eksekusi perbaikan teknis fisik di unit kamar, aula serbaguna, lift, serta pembaruan catatan teknisi.',
    permissions: {
      canConfigApp: 'NO_ACCESS',
      canManageProfile: 'FULL',
      canManageSignature: 'FULL',
      canCrudRooms: 'READ_ONLY',
      canCrudCheckin: 'NO_ACCESS',
      canCrudBooking: 'NO_ACCESS',
      canCrudGroup: 'NO_ACCESS',
      canCrudAula: 'NO_ACCESS',
      canRecordPayment: 'NO_ACCESS',
      canIssueInvoice: 'NO_ACCESS',
      canIssueKwitansi: 'NO_ACCESS',
      canCrudQc: 'READ_ONLY',
      canCrudMaintenance: 'FULL',
      canCrudCatering: 'NO_ACCESS',
      canManageUsers: 'NO_ACCESS',
      canManagePermissions: 'NO_ACCESS',
      canViewAuditLog: 'READ_ONLY',
      canExportReports: 'NO_ACCESS'
    }
  },
  {
    id: 'ref-mgr-kop',
    role: 'Manager Koperasi',
    divisionKey: 'KOPERASI',
    divisionName: 'Koperasi & Konsumsi',
    defaultUserName: 'H. Rusli Thamrin',
    icon: 'fa-utensils',
    badgeColor: 'bg-orange-100 text-orange-950 border-orange-300 font-bold',
    summary: 'Manajemen katering dapur jemaah haji, harga porsi sarapan, stok makanan basah/kering, dan rekapitulasi pesanan.',
    permissions: {
      canConfigApp: 'NO_ACCESS',
      canManageProfile: 'FULL',
      canManageSignature: 'FULL',
      canCrudRooms: 'READ_ONLY',
      canCrudCheckin: 'READ_ONLY',
      canCrudBooking: 'READ_ONLY',
      canCrudGroup: 'READ_ONLY',
      canCrudAula: 'READ_ONLY',
      canRecordPayment: 'NO_ACCESS',
      canIssueInvoice: 'READ_ONLY',
      canIssueKwitansi: 'NO_ACCESS',
      canCrudQc: 'NO_ACCESS',
      canCrudMaintenance: 'NO_ACCESS',
      canCrudCatering: 'FULL',
      canManageUsers: 'NO_ACCESS',
      canManagePermissions: 'NO_ACCESS',
      canViewAuditLog: 'READ_ONLY',
      canExportReports: 'FULL'
    }
  },
  {
    id: 'ref-kop',
    role: 'Petugas Koperasi',
    divisionKey: 'KOPERASI',
    divisionName: 'Koperasi & Konsumsi',
    defaultUserName: 'Siti Rahmawati',
    icon: 'fa-kitchen-set',
    badgeColor: 'bg-amber-100 text-amber-900 border-amber-300 font-semibold',
    summary: 'Penyajian makanan sarapan kamar jemaah, pengantaran box snack aula pertemuan, dan update status sajian.',
    permissions: {
      canConfigApp: 'NO_ACCESS',
      canManageProfile: 'FULL',
      canManageSignature: 'FULL',
      canCrudRooms: 'NO_ACCESS',
      canCrudCheckin: 'NO_ACCESS',
      canCrudBooking: 'NO_ACCESS',
      canCrudGroup: 'NO_ACCESS',
      canCrudAula: 'NO_ACCESS',
      canRecordPayment: 'NO_ACCESS',
      canIssueInvoice: 'NO_ACCESS',
      canIssueKwitansi: 'NO_ACCESS',
      canCrudQc: 'NO_ACCESS',
      canCrudMaintenance: 'NO_ACCESS',
      canCrudCatering: 'FULL',
      canManageUsers: 'NO_ACCESS',
      canManagePermissions: 'NO_ACCESS',
      canViewAuditLog: 'NO_ACCESS',
      canExportReports: 'NO_ACCESS'
    }
  }
];

export function RolePermissionsSection({
  currentUser,
  users = [],
  onSwitchUser,
  onOpenLaporanKwitansi,
  showToast,
  onUpdateUser,
  appSettings,
  onUpdateAppSettings
}: RolePermissionsSectionProps) {
  // Mode Tampilan: 'AKUN' (Kelola per akun - default) atau 'MATRIKS' (Matriks Standar Role)
  const [viewMode, setViewMode] = useState<'AKUN' | 'MATRIKS'>('AKUN');
  
  // Filter Akun
  const [selectedDivision, setSelectedDivision] = useState<DivisionKey>('SEMUA');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Akun Terpilih untuk Dikelola
  const [selectedUserId, setSelectedUserId] = useState<string>(() => {
    return currentUser?.id || users[0]?.id || '';
  });

  // Local state form izin akun terpilih
  const selectedUser = useMemo(() => {
    return users.find(u => u.id === selectedUserId) || users[0] || null;
  }, [users, selectedUserId]);

  const [localPermissions, setLocalPermissions] = useState<UserPermissions>(() => {
    return getUserEffectivePermissions(selectedUser);
  });

  const [isDirty, setIsDirty] = useState(false);

  // Sync saat selectedUser berganti
  React.useEffect(() => {
    if (selectedUser) {
      setLocalPermissions(getUserEffectivePermissions(selectedUser));
      setIsDirty(false);
    }
  }, [selectedUser]);

  // Modal Konfigurasi Judul, Sub Judul & Logo
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configOrgName, setConfigOrgName] = useState(appSettings?.organizationName || 'ASRAMA HAJI JAKARTA');
  const [configSubTitle, setConfigSubTitle] = useState(appSettings?.subTitle || 'SIM - Sistem Informasi Manajemen');
  const [configMinistry, setConfigMinistry] = useState(appSettings?.ministryName || 'KEMENTERIAN HAJI DAN UMRAH REPUBLIK INDONESIA');
  const [configTagTitle, setConfigTagTitle] = useState(appSettings?.tagTitle || 'SIM - Asrama Haji Jakarta');
  const [configAddress, setConfigAddress] = useState(appSettings?.address || 'Jl. Raya Pd. Gede, RT.1/RW.1, Pinang Ranti, Kec. Makasar, Kota Jakarta Timur, DKI Jakarta 13560');
  const [configPhone, setConfigPhone] = useState(appSettings?.phone || '0816243154');
  const [configEmail, setConfigEmail] = useState(appSettings?.email || 'info@asramahajijakarta.id');
  const [configLogo, setConfigLogo] = useState(appSettings?.appLogo || '');

  // Sinkronkan state modal saat modal dibuka atau appSettings diperbarui
  useEffect(() => {
    if (showConfigModal && appSettings) {
      setConfigOrgName(appSettings.organizationName || 'ASRAMA HAJI JAKARTA');
      setConfigSubTitle(appSettings.subTitle || 'SIM - Sistem Informasi Manajemen');
      setConfigMinistry(appSettings.ministryName || 'KEMENTERIAN HAJI DAN UMRAH REPUBLIK INDONESIA');
      setConfigTagTitle(appSettings.tagTitle || 'SIM - Asrama Haji Jakarta');
      setConfigAddress(appSettings.address || 'Jl. Raya Pd. Gede, RT.1/RW.1, Pinang Ranti, Kec. Makasar, Kota Jakarta Timur, DKI Jakarta 13560');
      setConfigPhone(appSettings.phone || '0816243154');
      setConfigEmail(appSettings.email || 'info@asramahajijakarta.id');
      setConfigLogo(appSettings.appLogo || '');
    }
  }, [showConfigModal, appSettings]);

  useBodyScrollLock(showConfigModal);

  // Periksa apakah user saat ini punya wewenang mengedit hak akses akun (HANYA Super Admin & Admin)
  const canAdminManage = Boolean(
    currentUser && (
      isSuperAdmin(currentUser.role) || 
      currentUser.role === 'Admin'
    )
  );

  const canEditBranding = Boolean(
    currentUser && (
      isSuperAdmin(currentUser.role) || 
      currentUser.role === 'Admin'
    )
  );

  // Filter daftar pengguna berdasarkan divisi & pencarian
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      // Division filter
      if (selectedDivision !== 'SEMUA') {
        const role = String(u.role || '').toLowerCase();
        const dept = String(u.department || '').toLowerCase();
        if (selectedDivision === 'KEUANGAN') {
          if (!role.includes('keuangan') && !role.includes('bendahara') && !dept.includes('keuangan')) return false;
        } else if (selectedDivision === 'RESEPSIONIS') {
          if (!role.includes('resepsionis') && !dept.includes('resepsionis') && !dept.includes('pelayanan')) return false;
        } else if (selectedDivision === 'QC') {
          if (!role.includes('qc') && !role.includes('quality') && !dept.includes('qc')) return false;
        } else if (selectedDivision === 'TEKNISI') {
          if (!role.includes('teknisi') && !dept.includes('teknisi') && !dept.includes('pemeliharaan')) return false;
        } else if (selectedDivision === 'KOPERASI') {
          if (!role.includes('koperasi') && !dept.includes('koperasi')) return false;
        } else if (selectedDivision === 'ADMIN') {
          if (!role.includes('admin') && !dept.includes('tata usaha') && !dept.includes('pimpinan')) return false;
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = String(u.fullName || '').toLowerCase().includes(q);
        const matchUser = String(u.username || '').toLowerCase().includes(q);
        const matchRole = String(u.role || '').toLowerCase().includes(q);
        const matchDept = String(u.department || '').toLowerCase().includes(q);
        if (!matchName && !matchUser && !matchRole && !matchDept) return false;
      }

      return true;
    });
  }, [users, selectedDivision, searchQuery]);

  // Toggle izin spesifik
  const handleTogglePermission = (key: keyof UserPermissions) => {
    if (!canAdminManage) {
      showToast('Akses Terbatas: Hanya Administrator yang berwenang mengubah hak akses petugas!', 'warning');
      return;
    }
    setLocalPermissions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
    setIsDirty(true);
  };

  // Preset Aksi Cepat
  const handlePresetAll = (grantAll: boolean) => {
    if (!canAdminManage) return;
    const next: UserPermissions = {};
    PERMISSION_FIELD_CONFIGS.forEach(f => {
      next[f.key] = grantAll;
    });
    setLocalPermissions(next);
    setIsDirty(true);
    showToast(grantAll ? 'Seluruh hak akses CRUD diaktifkan!' : 'Seluruh akses dinonaktifkan (Read-Only)!', 'info');
  };

  const handleResetToRoleDefault = () => {
    if (!canAdminManage || !selectedUser) return;
    // Bersihkan custom overrides
    const updatedUser: User = {
      ...selectedUser,
      permissions: undefined
    };
    if (onUpdateUser) {
      onUpdateUser(updatedUser);
    }
    setLocalPermissions(getUserEffectivePermissions({ ...selectedUser, permissions: undefined }));
    setIsDirty(false);
    showToast(`Hak akses akun ${selectedUser.fullName} dikembalikan ke standar SOP peran (${selectedUser.role}).`, 'success');
  };

  // Simpan Izin Akun
  const handleSavePermissions = () => {
    if (!canAdminManage) {
      showToast('Akses Ditolak: Anda tidak memiliki otoritas Administrator!', 'error');
      return;
    }
    if (!selectedUser || !onUpdateUser) return;

    const updatedUser: User = {
      ...selectedUser,
      permissions: { ...localPermissions }
    };

    onUpdateUser(updatedUser);
    setIsDirty(false);
    showToast(`Hak akses akun ${selectedUser.fullName} (@${selectedUser.username}) berhasil disimpan secara detail!`, 'success');
  };

  // Simpan Konfigurasi Web Branding
  const handleSaveAppConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateAppSettings) return;

    onUpdateAppSettings({
      organizationName: configOrgName.trim(),
      subTitle: configSubTitle.trim(),
      ministryName: configMinistry.trim(),
      tagTitle: configTagTitle.trim(),
      address: configAddress.trim(),
      phone: configPhone.trim(),
      email: configEmail.trim(),
      appLogo: configLogo
    });

    setShowConfigModal(false);
    showToast('Konfigurasi judul, sub judul, kementerian & logo berhasil diperbarui ke seluruh sistem!', 'success');
  };

  // Hitung jumlah izin aktif
  const activePermissionsCount = useMemo(() => {
    return Object.values(localPermissions).filter(Boolean).length;
  }, [localPermissions]);

  const hasCustomOverrides = Boolean(selectedUser?.permissions && Object.keys(selectedUser.permissions).length > 0);

  // Group permission fields by category for neat UI
  const groupedFields = useMemo(() => {
    return {
      CONFIG: PERMISSION_FIELD_CONFIGS.filter(f => f.category === 'CONFIG'),
      HUNIAN: PERMISSION_FIELD_CONFIGS.filter(f => f.category === 'HUNIAN'),
      KEUANGAN: PERMISSION_FIELD_CONFIGS.filter(f => f.category === 'KEUANGAN'),
      OPERASIONAL: PERMISSION_FIELD_CONFIGS.filter(f => f.category === 'OPERASIONAL'),
      SISTEM: PERMISSION_FIELD_CONFIGS.filter(f => f.category === 'SISTEM')
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* Top Banner & Control Strip */}
      <div className="bg-gradient-to-r from-hajj-800 via-hajj-900 to-slate-900 text-white p-5 rounded-2xl shadow-sm border border-gold-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-gold-400 animate-pulse"></span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-gold-300">
              Manajemen Sistem &amp; Keamanan
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-black text-white">
            Hak Akses &amp; Otorisasi Akun Petugas
          </h2>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Kelola wewenang operasional setiap akun secara terperinci: konfigurasi judul &amp; logo, profil, hingga hak CRUD per modul kamar, reservasi, keuangan, kwitansi, QC, teknisi, dan koperasi.
          </p>
        </div>

        {/* Global Action: Tombol Buka Konfigurasi Judul, Sub Judul & Logo */}
        <div className="flex items-center space-x-2 self-start md:self-auto shrink-0">
          {canEditBranding && (
            <button
              type="button"
              onClick={() => setShowConfigModal(true)}
              className="px-3.5 py-2 bg-gold-500 hover:bg-gold-600 text-slate-950 font-black text-xs rounded-xl shadow-xs transition flex items-center space-x-2 cursor-pointer"
              title="Atur Judul, Sub Judul, Kementerian, Alamat & Logo Instansi"
            >
              <i className="fa-solid fa-sliders text-sm"></i>
              <span>Konfigurasi Judul &amp; Logo</span>
            </button>
          )}

          {onOpenLaporanKwitansi && (
            <button
              type="button"
              onClick={onOpenLaporanKwitansi}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-xl border border-white/20 transition flex items-center space-x-1.5 cursor-pointer"
            >
              <i className="fa-solid fa-receipt text-gold-300"></i>
              <span className="hidden sm:inline">Laporan Kwitansi</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Sub Navigation Bar: Simple Two-Tab View Mode */}
      <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setViewMode('AKUN')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
              viewMode === 'AKUN'
                ? 'bg-white dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 shadow-xs font-black'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <i className="fa-solid fa-user-gear text-emerald-600"></i>
            <span>Kelola Hak Akses Per Akun ({users.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('MATRIKS')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
              viewMode === 'MATRIKS'
                ? 'bg-white dark:bg-slate-800 text-purple-800 dark:text-purple-300 shadow-xs font-black'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <i className="fa-solid fa-table-cells text-purple-600"></i>
            <span>Matriks Ringkasan Role</span>
          </button>
        </div>

        {/* Quick Search Input */}
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cari akun, nama, NIP, atau role..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-2.5 text-slate-400 text-xs pointer-events-none"></i>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODE 1: KELOLA HAK AKSES PER AKUN (INTERAKTIF & DETAIL)                  */}
      {/* ========================================================================= */}
      {viewMode === 'AKUN' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Sisi Kiri: Daftar Akun Petugas (4 Kolom) */}
          <div className="lg:col-span-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-3.5 space-y-3">
            {/* Division Filter Badges */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2">
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                Pilih Akun Petugas ({filteredUsers.length})
              </span>
              <span className="text-[10px] text-slate-400">
                Klik kartu untuk atur izin
              </span>
            </div>

            <div className="flex flex-wrap gap-1">
              {[
                { key: 'SEMUA', label: 'Semua' },
                { key: 'ADMIN', label: 'Admin' },
                { key: 'KEUANGAN', label: 'Keuangan' },
                { key: 'RESEPSIONIS', label: 'Resepsionis' },
                { key: 'QC', label: 'QC' },
                { key: 'TEKNISI', label: 'Teknisi' },
                { key: 'KOPERASI', label: 'Koperasi' }
              ].map(d => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setSelectedDivision(d.key as DivisionKey)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                    selectedDivision === d.key
                      ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900 shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {/* List of Accounts */}
            <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1 custom-scrollbar">
              {filteredUsers.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 italic">
                  Tidak ada akun petugas yang sesuai dengan pencarian.
                </div>
              ) : (
                filteredUsers.map(user => {
                  const isSelected = selectedUser?.id === user.id;
                  const isCurrent = currentUser?.id === user.id;
                  const hasCustom = Boolean(user.permissions && Object.keys(user.permissions).length > 0);

                  return (
                    <div
                      key={user.id}
                      onClick={() => setSelectedUserId(user.id)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer space-y-1.5 ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 shadow-xs ring-2 ring-emerald-500/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <div className={`w-8 h-8 rounded-xl font-bold flex items-center justify-center text-xs shrink-0 ${
                            isSelected
                              ? 'bg-emerald-700 text-white'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                          }`}>
                            {user.fullName.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                              {user.fullName}
                            </h4>
                            <p className="text-[10px] text-slate-500 truncate">
                              @{user.username} {user.nip ? `• NIP: ${user.nip}` : ''}
                            </p>
                          </div>
                        </div>

                        {isCurrent && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-blue-100 text-blue-800 border border-blue-200 shrink-0">
                            Anda
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-100 dark:border-slate-700/60">
                        <span className="px-2 py-0.5 rounded-full font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 truncate max-w-[150px]">
                          {user.role}
                        </span>

                        {hasCustom ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center space-x-1 shrink-0">
                            <i className="fa-solid fa-sliders text-[9px]"></i>
                            <span>Izin Kustom</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 font-medium shrink-0">
                            Standar Role
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Sisi Kanan: Editor Hak Akses Detail Akun Terpilih (8 Kolom) */}
          <div className="lg:col-span-8 space-y-4">
            {selectedUser ? (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-4 sm:p-5 space-y-5">
                {/* Header Akun Terpilih */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 pb-4">
                  <div className="flex items-center space-x-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-800 text-white font-black text-lg flex items-center justify-center shadow-xs shrink-0">
                      {selectedUser.fullName.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-black text-base text-slate-900 dark:text-white">
                          {selectedUser.fullName}
                        </h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-900 border border-emerald-300">
                          {selectedUser.role}
                        </span>
                        {hasCustomOverrides && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            Override Aktif
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Username: <strong>@{selectedUser.username}</strong> • Departemen: {selectedUser.department || '-'} • Gedung: {selectedUser.assignedBuilding || 'Semua Gedung'}
                      </p>
                    </div>
                  </div>

                  {/* Quick Action: Beralih Akun (Switch) */}
                  {onSwitchUser && currentUser?.id !== selectedUser.id && (
                    <button
                      type="button"
                      onClick={() => onSwitchUser(selectedUser)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition flex items-center space-x-1.5 self-start sm:self-auto cursor-pointer"
                      title="Beralih ke akun ini untuk simulasi pengujian hak akses"
                    >
                      <i className="fa-solid fa-arrow-right-to-bracket text-emerald-600"></i>
                      <span>Masuk sbg Akun Ini</span>
                    </button>
                  )}
                </div>

                {/* Preset & Kontrol Aksi Cepat */}
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">Otorisasi Aktif:</span>
                    <strong className="text-emerald-700 dark:text-emerald-400 font-black">
                      {activePermissionsCount} dari {PERMISSION_FIELD_CONFIGS.length} Izin
                    </strong>
                    {isDirty && (
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px] animate-pulse">
                        Ada Perubahan Belum Disimpan
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={() => handlePresetAll(true)}
                      disabled={!canAdminManage}
                      className="px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-emerald-50 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-lg text-[11px] font-bold transition cursor-pointer disabled:opacity-50"
                      title="Beri semua hak akses CRUD"
                    >
                      Beri Semua
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePresetAll(false)}
                      disabled={!canAdminManage}
                      className="px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-rose-50 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-lg text-[11px] font-bold transition cursor-pointer disabled:opacity-50"
                      title="Cabut semua hak akses tulis/CRUD"
                    >
                      Hanya Lihat
                    </button>
                    <button
                      type="button"
                      onClick={handleResetToRoleDefault}
                      disabled={!canAdminManage}
                      className="px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-blue-50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 rounded-lg text-[11px] font-bold transition cursor-pointer disabled:opacity-50"
                      title="Kembalikan izin sesuai SOP standar role"
                    >
                      Reset ke SOP Role
                    </button>
                  </div>
                </div>

                {/* FORM GRUP IZIN BERDASARKAN KATEGORI */}
                <div className="space-y-4">
                  {/* GRUP 1: IDENTITAS, WEB & PROFIL */}
                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <div className="bg-slate-100 dark:bg-slate-750 px-4 py-2.5 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
                      <div className="flex items-center space-x-2">
                        <i className="fa-solid fa-sliders text-gold-600 dark:text-gold-400"></i>
                        <h4 className="font-bold text-xs text-slate-800 dark:text-white uppercase tracking-wider">
                          1. Konfigurasi Judul, Sub Judul, Logo &amp; Profil Akun
                        </h4>
                      </div>
                      <span className="text-[10px] text-slate-500 font-semibold">
                        Identitas &amp; Pengaturan Dasar
                      </span>
                    </div>

                    <div className="p-3.5 space-y-2.5 divide-y divide-slate-100 dark:divide-slate-700">
                      {groupedFields.CONFIG.map(f => {
                        const isGranted = Boolean(localPermissions[f.key]);
                        return (
                          <div key={f.key} className="pt-2.5 first:pt-0 flex items-start justify-between gap-3">
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex items-center space-x-2">
                                <i className={`fa-solid ${f.icon} text-slate-400 text-xs shrink-0`}></i>
                                <span className="font-bold text-xs text-slate-900 dark:text-white">
                                  {f.label}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                {f.shortDesc}
                              </p>
                              {f.key === 'canConfigApp' && isGranted && canEditBranding && (
                                <button
                                  type="button"
                                  onClick={() => setShowConfigModal(true)}
                                  className="mt-1 px-2.5 py-1 bg-gold-100 hover:bg-gold-200 text-gold-950 font-bold text-[10px] rounded-lg transition inline-flex items-center space-x-1 cursor-pointer"
                                >
                                  <i className="fa-solid fa-pen-to-square"></i>
                                  <span>Buka Dialog Konfigurasi Judul &amp; Logo</span>
                                </button>
                              )}
                            </div>

                            {/* Toggle Switch */}
                            <button
                              type="button"
                              onClick={() => handleTogglePermission(f.key)}
                              disabled={!canAdminManage}
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                                isGranted ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                  isGranted ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* GRUP 2: OPERASIONAL HUNIAN & KAMAR (CRUD) */}
                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <div className="bg-slate-100 dark:bg-slate-750 px-4 py-2.5 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
                      <div className="flex items-center space-x-2">
                        <i className="fa-solid fa-bed text-blue-600 dark:text-blue-400"></i>
                        <h4 className="font-bold text-xs text-slate-800 dark:text-white uppercase tracking-wider">
                          2. Wewenang Operasional Kamar, Check-In &amp; Gedung Serbaguna (CRUD)
                        </h4>
                      </div>
                      <span className="text-[10px] text-slate-500 font-semibold">
                        Akomodasi &amp; Reservasi
                      </span>
                    </div>

                    <div className="p-3.5 space-y-2.5 divide-y divide-slate-100 dark:divide-slate-700">
                      {groupedFields.HUNIAN.map(f => {
                        const isGranted = Boolean(localPermissions[f.key]);
                        return (
                          <div key={f.key} className="pt-2.5 first:pt-0 flex items-start justify-between gap-3">
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex items-center space-x-2">
                                <i className={`fa-solid ${f.icon} text-slate-400 text-xs shrink-0`}></i>
                                <span className="font-bold text-xs text-slate-900 dark:text-white">
                                  {f.label}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                {f.shortDesc}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleTogglePermission(f.key)}
                              disabled={!canAdminManage}
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                                isGranted ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                  isGranted ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* GRUP 3: KEUANGAN, KASIR & KWITANSI BER-QR */}
                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <div className="bg-slate-100 dark:bg-slate-750 px-4 py-2.5 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
                      <div className="flex items-center space-x-2">
                        <i className="fa-solid fa-coins text-emerald-600 dark:text-emerald-400"></i>
                        <h4 className="font-bold text-xs text-slate-800 dark:text-white uppercase tracking-wider">
                          3. Wewenang Keuangan, Kasir &amp; Dokumen Kwitansi Sah
                        </h4>
                      </div>
                      <span className="text-[10px] text-slate-500 font-semibold">
                        Penerimaan PNBP &amp; Kwitansi
                      </span>
                    </div>

                    <div className="p-3.5 space-y-2.5 divide-y divide-slate-100 dark:divide-slate-700">
                      {groupedFields.KEUANGAN.map(f => {
                        const isGranted = Boolean(localPermissions[f.key]);
                        return (
                          <div key={f.key} className="pt-2.5 first:pt-0 flex items-start justify-between gap-3">
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex items-center space-x-2">
                                <i className={`fa-solid ${f.icon} text-slate-400 text-xs shrink-0`}></i>
                                <span className="font-bold text-xs text-slate-900 dark:text-white">
                                  {f.label}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                {f.shortDesc}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleTogglePermission(f.key)}
                              disabled={!canAdminManage}
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                                isGranted ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                  isGranted ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* GRUP 4: QUALITY CONTROL, MAINTENANCE & KOPERASI */}
                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <div className="bg-slate-100 dark:bg-slate-750 px-4 py-2.5 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
                      <div className="flex items-center space-x-2">
                        <i className="fa-solid fa-wrench text-amber-600 dark:text-amber-400"></i>
                        <h4 className="font-bold text-xs text-slate-800 dark:text-white uppercase tracking-wider">
                          4. Wewenang QC, Teknisi Perbaikan &amp; Dapur Koperasi
                        </h4>
                      </div>
                      <span className="text-[10px] text-slate-500 font-semibold">
                        Mutu, Fisik &amp; Konsumsi
                      </span>
                    </div>

                    <div className="p-3.5 space-y-2.5 divide-y divide-slate-100 dark:divide-slate-700">
                      {groupedFields.OPERASIONAL.map(f => {
                        const isGranted = Boolean(localPermissions[f.key]);
                        return (
                          <div key={f.key} className="pt-2.5 first:pt-0 flex items-start justify-between gap-3">
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex items-center space-x-2">
                                <i className={`fa-solid ${f.icon} text-slate-400 text-xs shrink-0`}></i>
                                <span className="font-bold text-xs text-slate-900 dark:text-white">
                                  {f.label}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                {f.shortDesc}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleTogglePermission(f.key)}
                              disabled={!canAdminManage}
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                                isGranted ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                  isGranted ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* GRUP 5: MANAJEMEN SISTEM, PENGGUNA & LAPORAN */}
                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <div className="bg-slate-100 dark:bg-slate-750 px-4 py-2.5 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
                      <div className="flex items-center space-x-2">
                        <i className="fa-solid fa-gears text-purple-600 dark:text-purple-400"></i>
                        <h4 className="font-bold text-xs text-slate-800 dark:text-white uppercase tracking-wider">
                          5. Manajemen Akun Pengguna, Log Audit &amp; Ekspor Laporan
                        </h4>
                      </div>
                      <span className="text-[10px] text-slate-500 font-semibold">
                        Administrasi Sistem
                      </span>
                    </div>

                    <div className="p-3.5 space-y-2.5 divide-y divide-slate-100 dark:divide-slate-700">
                      {groupedFields.SISTEM.map(f => {
                        const isGranted = Boolean(localPermissions[f.key]);
                        return (
                          <div key={f.key} className="pt-2.5 first:pt-0 flex items-start justify-between gap-3">
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex items-center space-x-2">
                                <i className={`fa-solid ${f.icon} text-slate-400 text-xs shrink-0`}></i>
                                <span className="font-bold text-xs text-slate-900 dark:text-white">
                                  {f.label}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                {f.shortDesc}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleTogglePermission(f.key)}
                              disabled={!canAdminManage}
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                                isGranted ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                  isGranted ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* BOTTOM STICKY SAVE BAR */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">
                    {isDirty ? (
                      <span className="text-amber-700 dark:text-amber-400 font-bold flex items-center space-x-1.5">
                        <i className="fa-solid fa-circle-exclamation"></i>
                        <span>Perubahan izin belum disimpan. Klik tombol Simpan di sebelah kanan.</span>
                      </span>
                    ) : (
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium flex items-center space-x-1.5">
                        <i className="fa-solid fa-circle-check"></i>
                        <span>Hak akses akun ini sudah sinkron dengan basis data.</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setLocalPermissions(getUserEffectivePermissions(selectedUser))}
                      disabled={!isDirty || !canAdminManage}
                      className="flex-1 sm:flex-initial px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-xl transition cursor-pointer disabled:opacity-40"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleSavePermissions}
                      disabled={!canAdminManage}
                      className={`flex-1 sm:flex-initial px-6 py-2 rounded-xl text-xs font-black shadow-xs transition flex items-center justify-center space-x-2 cursor-pointer ${
                        isDirty
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md animate-pulse'
                          : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                      } disabled:opacity-50`}
                    >
                      <i className="fa-solid fa-floppy-disk"></i>
                      <span>Simpan Hak Akses Akun</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-slate-400">
                <i className="fa-solid fa-user-xmark text-4xl mb-2"></i>
                <p className="text-xs font-semibold">Pilih akun petugas di sebelah kiri untuk melihat dan mengelola hak aksesnya.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 2: MATRIKS STANDAR ROLE & PEDOMAN OTORITAS                         */}
      {/* ========================================================================= */}
      {viewMode === 'MATRIKS' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden space-y-4 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Matriks Standar Otoritas Berdasarkan Peran (SOP)
              </h3>
              <p className="text-xs text-slate-500">
                Pedoman alokasi hak akses default untuk 13 peran resmi di UPT Asrama Haji Jakarta.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1 font-semibold text-emerald-700">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span>Penuh (CRUD)</span>
              </span>
              <span className="flex items-center gap-1 font-semibold text-blue-700">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span>
                <span>Lihat Saja</span>
              </span>
              <span className="flex items-center gap-1 font-semibold text-slate-400">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300"></span>
                <span>Tidak Ada</span>
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 uppercase font-bold text-[11px] border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3 min-w-[200px]">Peran &amp; Divisi</th>
                  <th className="p-3 text-center">Konfigurasi Web</th>
                  <th className="p-3 text-center">Profil</th>
                  <th className="p-3 text-center">Kamar &amp; Denah</th>
                  <th className="p-3 text-center">Check-In</th>
                  <th className="p-3 text-center">Aula &amp; SG</th>
                  <th className="p-3 text-center">Kas &amp; DP</th>
                  <th className="p-3 text-center">Kwitansi</th>
                  <th className="p-3 text-center">QC</th>
                  <th className="p-3 text-center">Teknisi</th>
                  <th className="p-3 text-center">Katering</th>
                  <th className="p-3 text-center">Kelola Akun</th>
                  <th className="p-3 text-center">Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-750">
                {ROLES_REFERENCE_CATALOG.map(r => {
                  const renderBadge = (level: AccessLevel) => {
                    if (level === 'FULL') {
                      return <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800">FULL</span>;
                    }
                    if (level === 'READ_ONLY') {
                      return <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">LIHAT</span>;
                    }
                    return <span className="text-slate-300 text-[10px]">-</span>;
                  };

                  return (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-750 transition">
                      <td className="p-3">
                        <div className="flex items-center space-x-2">
                          <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-xs shrink-0">
                            <i className={`fa-solid ${r.icon}`}></i>
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white text-xs">{r.role}</div>
                            <div className="text-[10px] text-slate-500">{r.divisionName}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-center">{renderBadge(r.permissions.canConfigApp)}</td>
                      <td className="p-3 text-center">{renderBadge(r.permissions.canManageProfile)}</td>
                      <td className="p-3 text-center">{renderBadge(r.permissions.canCrudRooms)}</td>
                      <td className="p-3 text-center">{renderBadge(r.permissions.canCrudCheckin)}</td>
                      <td className="p-3 text-center">{renderBadge(r.permissions.canCrudAula)}</td>
                      <td className="p-3 text-center">{renderBadge(r.permissions.canRecordPayment)}</td>
                      <td className="p-3 text-center">{renderBadge(r.permissions.canIssueKwitansi)}</td>
                      <td className="p-3 text-center">{renderBadge(r.permissions.canCrudQc)}</td>
                      <td className="p-3 text-center">{renderBadge(r.permissions.canCrudMaintenance)}</td>
                      <td className="p-3 text-center">{renderBadge(r.permissions.canCrudCatering)}</td>
                      <td className="p-3 text-center">{renderBadge(r.permissions.canManageUsers)}</td>
                      <td className="p-3 text-center">{renderBadge(r.permissions.canViewAuditLog)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: KONFIGURASI JUDUL, SUB JUDUL, ALAMAT & LOGO INSTANSI               */}
      {/* ========================================================================= */}
      {showConfigModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setShowConfigModal(false)}
        >
          <div 
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-xl w-full border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-hajj-800 to-hajj-900 px-5 py-4 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center text-gold-300 text-sm">
                  <i className="fa-solid fa-sliders"></i>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">
                    Konfigurasi Judul, Sub Judul &amp; Logo Sistem
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Pengaturan kop identitas instansi, logo resmi, dan informasi web
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="w-7 h-7 rounded-lg text-white/70 hover:text-white hover:bg-white/10 flex items-center justify-center cursor-pointer"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveAppConfig} className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1 text-xs">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-[11px] space-y-1">
                <span className="font-bold block flex items-center gap-1.5">
                  <i className="fa-solid fa-circle-info"></i>
                  <span>Otoritas Khusus Administrator:</span>
                </span>
                <p>
                  Perubahan konfigurasi ini akan langsung tampil pada seluruh Header aplikasi, kop surat Kwitansi Resmi ber-QR, Faktur Invoice PNBP, dan judul tab browser secara real-time.
                </p>
              </div>

              {/* 1. Nama Organisasi / Judul Aplikasi */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-200 block">
                  Nama Organisasi / Judul Aplikasi:
                </label>
                <input
                  type="text"
                  required
                  value={configOrgName}
                  onChange={e => setConfigOrgName(e.target.value)}
                  placeholder="e.g. UPT ASRAMA HAJI JAKARTA"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* 2. Sub Judul Aplikasi */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-200 block">
                  Sub Judul Aplikasi:
                </label>
                <input
                  type="text"
                  required
                  value={configSubTitle}
                  onChange={e => setConfigSubTitle(e.target.value)}
                  placeholder="e.g. Sistem Informasi Manajemen Operasional"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* 3. Nama Kementerian */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-200 block">
                  Nama Kementerian / Lembaga Pembina:
                </label>
                <input
                  type="text"
                  value={configMinistry}
                  onChange={e => setConfigMinistry(e.target.value)}
                  placeholder="e.g. KEMENTERIAN HAJI DAN UMRAH REPUBLIK INDONESIA"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* 4. Tag Title Browser */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-200 block">
                  Judul Tab Browser (HTML &lt;title&gt;):
                </label>
                <input
                  type="text"
                  value={configTagTitle}
                  onChange={e => setConfigTagTitle(e.target.value)}
                  placeholder="e.g. V44 Manajemen Asrama Haji"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* 5. Alamat Lengkap */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-200 block">
                  Alamat Kantor Resmi UPT:
                </label>
                <textarea
                  rows={2}
                  value={configAddress}
                  onChange={e => setConfigAddress(e.target.value)}
                  placeholder="Alamat kantor UPT Asrama Haji..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* 6. Telepon & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-200 block">
                    No. Telepon / Hotline:
                  </label>
                  <input
                    type="text"
                    value={configPhone}
                    onChange={e => setConfigPhone(e.target.value)}
                    placeholder="0816243154"
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-200 block">
                    Email Resmi:
                  </label>
                  <input
                    type="email"
                    value={configEmail}
                    onChange={e => setConfigEmail(e.target.value)}
                    placeholder="info@asramahajijakarta.id"
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* 7. Logo Instansi */}
              <div className="space-y-2 border-t border-slate-100 dark:border-slate-700 pt-3">
                <label className="font-bold text-slate-700 dark:text-slate-200 block">
                  Logo Resmi Instansi (Header &amp; Dokumen):
                </label>
                <div className="flex items-center space-x-3">
                  <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                    {configLogo ? (
                      <img src={configLogo} alt="Pratinjau Logo" className="w-full h-full object-contain" />
                    ) : (
                      <i className="fa-solid fa-kaaba text-2xl text-slate-400"></i>
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 2 * 1024 * 1024) {
                            showToast('Ukuran logo maksimal 2MB!', 'warning');
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            if (typeof ev.target?.result === 'string') {
                              setConfigLogo(ev.target.result);
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-100 file:text-emerald-800 hover:file:bg-emerald-200 cursor-pointer"
                    />
                    <p className="text-[10px] text-slate-400">
                      Disarankan file PNG transparan atau SVG (Maks. 2MB).
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer Modal */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <i className="fa-solid fa-check"></i>
                  <span>Simpan Konfigurasi Web</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
