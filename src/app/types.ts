// @ts-nocheck
export type UserRole = 
  | 'Super Admin' 
  | 'Admin'
  | 'Manager Resepsionis' 
  | 'Resepsionis' 
  | 'Manager Keuangan'
  | 'Bendahara'
  | 'Keuangan'
  | 'Bendahara / Keuangan'
  | 'Staff Keuangan'
  | 'Manager QC' 
  | 'Quality Control' 
  | 'Manager Teknisi' 
  | 'Teknisi' 
  | 'Manager Koperasi' 
  | 'Petugas Koperasi'
  | 'Manager'
  | string;

export interface UserPermissions {
  canConfigApp?: boolean;          // Konfigurasi Judul, Sub Judul, Logo & Favicon
  canManageProfile?: boolean;       // Mengedit Profil & Password Akun Sendiri
  canManageSignature?: boolean;     // Mengatur Tanda Tangan Digital & QR Code
  canCrudRooms?: boolean;           // CRUD Kamar, Gedung & Master Tarif
  canCrudCheckin?: boolean;         // Check-In & Check-Out Tamu
  canCrudBooking?: boolean;         // Booking Tanggal Mendatang & Extend Sewa
  canCrudGroup?: boolean;           // Pendaftaran & Kelola Rombongan
  canCrudAula?: boolean;            // Sewa Ruang Pertemuan & Gedung Serbaguna (SG)
  canRecordPayment?: boolean;       // Catat Setoran DP & Pelunasan 100%
  canIssueInvoice?: boolean;        // Terbitkan & Cetak Faktur Tagihan (Invoice)
  canIssueKwitansi?: boolean;       // Terbitkan & Cetak Kwitansi Ber-QR Resmi Sah
  canCrudMaintenance?: boolean;     // CRUD Tiket Maintenance & Teknisi
  canCrudQc?: boolean;              // CRUD Inspeksi Mutu QC & Checklist
  canCrudCatering?: boolean;        // CRUD Menu & Pesanan Makan Koperasi
  canManageUsers?: boolean;         // Menambah / Edit / Hapus Akun Petugas
  canManagePermissions?: boolean;   // Mengatur Hak Akses & Otorisasi Akun
  canViewAuditLog?: boolean;        // Melihat Log Audit & Sesi Jam Kerja
  canExportReports?: boolean;       // Ekspor Laporan Excel (.xlsx) & PDF
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  password?: string;
  department?: string;
  supervisorId?: string | null;
  assignedBuilding: string;
  phone: string;
  status: string;
  email?: string;
  nip?: string;
  isOwner?: boolean;
  signatureUrl?: string;
  qrCodeUrl?: string;
  signatureHistory?: { id: string; timestamp: string; signatureUrl: string; method: 'UPLOAD' | 'DRAWN'; resolution?: string }[];
  permissions?: UserPermissions;
  lastSeen?: string | number;
  updatedAt?: string;
}

export interface Building {
  id: string;
  name: string; // e.g. "Gedung A (Arafah)"
  code: string; // e.g. "A"
  floors?: number;
  totalRooms?: number;
  capacityDesc?: string;
  category?: 'PENGINAPAN' | 'SERBAGUNA' | 'RUANG_PERTEMUAN' | 'KANTOR' | string;
  description?: string;
  status: 'AKTIF' | 'NONAKTIF';
  createdAt?: string;
  updatedAt?: string;
}

export interface MeetingRoom {
  id: string;
  name: string; // e.g. "Gedung SG-1 (SG-1)", "Aula Utama Arafah"
  code?: string;
  category?: 'SERBAGUNA' | 'AULA' | string;
  building: string; // e.g. "Kompleks Ruang Pertemuan & Aula"
  capacity: string; // e.g. "1000 - 1500 Orang"
  capacityNumber?: number;
  facilities: string[];
  dailyRate: number;
  sessionRate?: number;
  description?: string;
  status: 'TERSEDIA' | 'TERPAKAI' | 'MAINTENANCE';
  qcStatus?: 'LOLOS_QC' | 'PERLU_INSPEKSI' | 'PERLU_PERBAIKAN' | 'MENUNGGU_QC';
  activeTxId?: string | null;
  activeMaintId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type LodgingRoomType = 'Ekonomi' | 'Standar' | 'Superior' | string;

export type BedTypeOption = 
  | 'Double Bed'
  | '2 Single Bed'
  | '3 Single Bed'
  | '4 Single Bed'
  | '5 Single Bed'
  | '6 Single Bed'
  | '7 Single Bed'
  | '8 Single Bed'
  | string;

export interface RoomCapacityRate {
  id: string;
  roomType: 'Ekonomi' | 'Standar' | 'Superior' | string;
  bedType: BedTypeOption;
  capacityPax: number;
  pricePerNight: number;
  description?: string;
  facilities?: string[];
  isActive?: boolean;
  updatedAt?: string;
}

export interface Room {
  id: string;
  building: string;
  roomNumber: string;
  floor?: number;
  type: string; // 'Ekonomi' | 'Standar' | 'Superior' | 'Ruang Pertemuan / Aula'
  bedType?: string; // 'Double Bed' | '2 Single Bed' | ... | '8 Single Bed'
  capacity: string; // e.g. "4 Orang" or "4 Bed"
  capacityNumber?: number; // e.g. 2, 3, 4, 5, 6, 7, 8
  status: "KOSONG" | "TERISI" | "BOOKED" | "MAINTENANCE";
  qcStatus?: "LOLOS_QC" | "PERLU_INSPEKSI" | "PERLU_PERBAIKAN" | "MENUNGGU_QC";
  lastQcDate?: string;
  lastQcBy?: string;
  lastQcNotes?: string;
  activeTxId: string | null;
  activeMaintId: string | null;
  pricePerNight?: number;
  facilities?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface QcInspection {
  id: string;
  roomId: string;
  building: string;
  roomNumber: string;
  inspectorId: string;
  inspectorName: string;
  inspectionDate: string;
  cleanliness: 'BAIK' | 'CUKUP' | 'BURUK';
  linenBed: 'LENGKAP_BERSIH' | 'PERLU_GANTI';
  acElectricity: 'NORMAL' | 'BERMASALAH';
  plumbingWater: 'LANCAR' | 'BOCOR_MAMPET' | 'BERMASALAH';
  amenities: 'LENGKAP' | 'KURANG';
  result: 'LOLOS_QC' | 'PERLU_PERBAIKAN' | 'LOLOS_VERIFIKASI_TEKNISI' | 'REVISI_PERBAIKAN';
  decisionType?: 'LOLOS_RUTIN' | 'LOLOS_PASCA_TEKNISI' | 'REVISI_TEKNISI' | 'PERLU_PERBAIKAN_BARU';
  notes: string;
  maintenanceIdCreated?: string;
  facilityType?: 'KAMAR' | 'RUANG_PERTEMUAN';
  updatedAt?: string;
}

export type GroupType = 'JEMAAH_HAJI' | 'UMUM' | 'INSTANSI';

export interface GroupBooking {
  id: string;
  groupName: string;
  groupType: GroupType;
  picName: string;
  picPhone: string;
  agencyOrDocument?: string;
  spkNumber?: string;
  estimatedMembers: number;
  startDate: string;
  duration: number;
  roomIds: string[];
  roomNumbers: string[];
  buildingList: string[];
  includeAula?: boolean;
  meetingRoomIds?: string[];
  rentAulaId?: string;
  rentAulaName?: string;
  rentAulaDuration?: number;
  rentAulaDurationDays?: number;
  rentAulaSession?: string;
  cateringPackage?: 'TIDAK' | 'SARAPAN' | 'FULLBOARD' | 'SNACK_AULA' | string;
  cateringPaxCount?: number;
  breakfast: boolean;
  breakfastMenu?: string;
  breakfastPortions?: number;
  extraBed?: boolean;
  extraBedCount?: number;
  extraBedPrice?: number;
  notes?: string;
  status: 'BOOKED' | 'TERISI' | 'SELESAI';
  createdAt: string;
  createdUser: string;
}

export interface ConsolidatedGroupRecord {
  key: string;
  groupId: string;
  groupName: string;
  groupType: GroupType;
  groupPic: string;
  groupPicPhone: string;
  agencyOrDocument?: string;
  spkNumber?: string;
  kloter?: string;
  startDate: string;
  duration: number;
  durationUnit?: string;
  totalPax: number;
  status: 'BOOKED' | 'TERISI' | 'SELESAI' | string;
  createdUser: string;
  notes?: string;
  // Detail kamar dan gedung
  allRoomNumbers: string[];
  allRoomIds: string[];
  buildingsList: string[];
  roomsBreakdown: {
    building: string;
    rooms: {
      roomNumber: string;
      roomId: string;
      type: string;
      capacity: number | string;
      status: string;
      txId?: string;
    }[];
  }[];
  // Ruang Pertemuan (Aula)
  includeAula?: boolean;
  rentAulaId?: string;
  rentAulaName?: string;
  rentAulaDuration?: number;
  rentAulaDurationDays?: number;
  rentAulaSession?: string;
  // Catering & Extra Bed
  cateringPackage?: string;
  cateringPaxCount?: number;
  breakfast?: boolean;
  breakfastMenu?: string;
  breakfastPortions?: number;
  extraBed?: boolean;
  extraBedCount?: number;
  extraBedPrice?: number;
  // Referensi transaksi
  representativeTx: Transaction;
  memberTransactions: Transaction[];
}

export interface Transaction {
  id: string;
  roomId: string;
  building: string;
  roomNumber: string;
  category: string;
  guestName: string;
  guestType?: 'INDIVIDU' | 'ROMBONGAN';
  nikKtp?: string;
  kloter: string;
  startDate: string;
  duration: number;
  phone: string;
  notes: string;
  status: string;
  createdUser: string;
  isGroup?: boolean;
  groupType?: GroupType;
  groupName?: string;
  groupPic?: string;
  groupPicPhone?: string;
  groupId?: string;
  totalPax?: number; // Total Pack / Estimasi Peserta
  includeAula?: boolean; // Menyewa Aula / Ruang Pertemuan
  rentAulaId?: string;
  rentAulaName?: string;
  rentAulaDuration?: number;
  rentAulaDurationDays?: number;
  rentAulaSession?: string;
  cateringPackage?: 'TIDAK' | 'SARAPAN' | 'FULLBOARD' | 'SNACK_AULA' | string;
  cateringPaxCount?: number;
  agencyOrDocument?: string;
  spkNumber?: string;
  allocatedRoomNumbers?: string[];
  allocatedRoomsCount?: number;
  breakfast?: boolean;
  breakfastMenu?: string;
  breakfastPortions?: number;
  breakfastDays?: number;
  breakfastStatus?: 'MENUNGGU' | 'SEDANG_DIBUAT' | 'PENGANTARAN' | 'SELESAI' | 'DIBATALKAN';
  rentType?: string;
  durationUnit?: string;
  pricePerNight?: number;
  extraBed?: boolean;
  extraBedCount?: number;
  extraBedPrice?: number;
  extraBedNotes?: string;
  checkInTime?: string;
  checkOutTime?: string;
  paymentStatus?: 'LUNAS' | 'BELUM_LUNAS' | 'DP' | string;
  isPaid?: boolean;
  paidAmount?: number;
  dpAmount?: number;
  alreadyPaid?: number;
  dpDate?: string;
  dpMethod?: 'VA_UPT' | 'TRANSFER' | string;
  dpNote?: string;
  remainingAmount?: number;
  vaNumber?: string;
  vaAccountName?: string;
  bankName?: string;
  bankAccountNumber?: string;
  paymentMethod?: 'VA_UPT' | 'TRANSFER' | string;
  paymentDate?: string;
  paymentNote?: string;
  kwitansiNo?: string;
  createdAt?: string;
  updatedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  cancelledUser?: string;
  extendedCount?: number;
  extendHistory?: {
    date: string;
    addedDuration: number;
    unit: string;
    newTotalDuration: number;
    user: string;
    reason?: string;
  }[];
}

export interface Maintenance {
  id: string;
  roomId: string;
  building: string;
  roomNumber: string;
  category: string;
  urgency: string;
  technician: string;
  description: string;
  reportTime: string;
  status: 'MENUNGGU_PENUGASAN' | 'PROSES' | 'MENUNGGU_QC' | 'SELESAI' | string;
  reportedUser: string;
  assignedTechnicianId?: string;
  assignedTechnicianName?: string;
  assignedByManager?: string;
  assignedTime?: string;
  managerNotes?: string;
  workCompletedTime?: string;
  technicianNotes?: string;
  resolvedTime?: string;
  qcInspectionId?: string;
  qcVerdict?: 'LOLOS_QC' | 'PERLU_PERBAIKAN';
  facilityType?: 'KAMAR' | 'RUANG_PERTEMUAN';
  updatedAt?: string;
}

export interface AuditLog {
  id?: string;
  timestamp: string;
  user: string;
  role: string;
  action: string;
  details: string;
  durationMinutes?: number;
  verificationCode?: string;
  documentTitle?: string;
  targetId?: string;
  signatoryName?: string;
  signatoryRole?: string;
  signatoryNip?: string;
  qrCodeHash?: string;
  hasQrAndSignature?: boolean;
}

export interface WorkSession {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  loginTime: string;       // "YYYY-MM-DD HH:mm:ss"
  logoutTime: string | null; // "YYYY-MM-DD HH:mm:ss" or null if currently active
  durationSeconds: number; // in seconds
  durationFormatted: string; // e.g. "8 Jam 15 Menit 30 Detik"
  status: 'AKTIF' | 'SELESAI';
  notes?: string;
  department?: string;
  assignedBuilding?: string;
  lastHeartbeat?: string;
  deviceInfo?: string;
  deviceId?: string;
}

export interface DailyWorkRecord {
  id: string;              // unique key `${userName}_${date}`
  date: string;            // "YYYY-MM-DD"
  userId: string;
  userName: string;
  userRole: string;
  sessionCount: number;
  totalDurationSeconds: number;
  totalDurationFormatted: string;
  firstLoginTime: string;
  lastLogoutTime: string | null;
  status: 'AKTIF' | 'SELESAI';
  sessions: WorkSession[];
}

export type ChatScope = 'MANAGER_TO_MANAGER' | 'MANAGER_TO_SUBORDINATE' | 'DIVISION_GROUP' | 'ALL_MANAGERS_GROUP' | 'DIRECT';

export interface ChatMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  senderDepartment?: string;
  message: string;
  timestamp: string;
  timeFormatted: string;
  priority?: 'NORMAL' | 'PENTING' | 'URGENT';
  isInstruction?: boolean;
  readBy: string[];
  replyToId?: string;
  replyToSender?: string;
  replyToText?: string;
}

export interface ChatChannel {
  id: string;
  name: string;
  scope: ChatScope;
  type: 'DIRECT' | 'GROUP';
  department?: string;
  participantIds: string[];
  description?: string;
  icon?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  lastSenderName?: string;
}

export interface BreakfastMenuItem {
  id: string;
  name: string;
  category: 'MAKANAN_BERAT' | 'BUBUR_SAYUR' | 'SNACK_KUDAPAN' | 'MINUMAN' | 'SEHAT_LANSIA';
  price: number;
  description: string;
  isAvailable: boolean;
  allergens?: string;
  updatedAt?: string;
}

export interface BreakfastOrder {
  id: string;
  roomNumber: string;
  building: string;
  guestName: string;
  phone?: string;
  kloter?: string;
  transactionId?: string;
  menuId?: string;
  menuName: string;
  portions: number;
  days: number;
  startDate: string; // "YYYY-MM-DD"
  deliveryTime: string; // e.g. "06:30 WIB"
  status: 'MENUNGGU' | 'SEDANG_DIBUAT' | 'PENGANTARAN' | 'SELESAI' | 'DIBATALKAN';
  cancelReason?: string;
  cancelledAt?: string;
  notes?: string;
  dietaryRestriction?: string;
  pricePerPortion?: number;
  totalPrice?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface PasswordResetRequest {
  id: string;
  userId: string;
  username: string;
  fullName: string;
  role: string;
  newPassword: string;
  requestDate: string;
  status: 'MENUNGGU_PERSETUJUAN' | 'DISETUJUI' | 'DITOLAK';
  notes?: string;
  processedBy?: string;
  processedAt?: string;
}

export interface EmailNotificationItem {
  id: string;
  recipientEmail: string;
  recipientName: string;
  recipientRole: string;
  subject: string;
  previewText: string;
  htmlBody: string;
  eventType: 'URGENT_MAINTENANCE' | 'MAINTENANCE_COMPLETED';
  maintenanceId: string;
  roomNumber: string;
  building: string;
  category: string;
  urgency: string;
  technicianName?: string;
  reportedBy?: string;
  sentAt: string;
  status: 'TERKIRIM' | 'DIBACA';
}
