import { ChatChannel, ChatMessage, User } from './types';

export const initialChatChannels: ChatChannel[] = [
  {
    id: 'channel-all-managers',
    name: 'Forum Koordinasi Terpadu UPT',
    scope: 'ALL_MANAGERS_GROUP',
    type: 'GROUP',
    participantIds: [],
    description: 'Ruang koordinasi strategis pimpinan dan seluruh divisi operasional Asrama Haji.',
    icon: 'fa-users-gear',
    lastMessage: 'Sistem komunikasi operasional aktif. Gunakan saluran ini untuk koordinasi lintas unit.',
    lastMessageTime: '08:00',
    lastSenderName: 'Sistem UPT'
  },
  {
    id: 'channel-operasional',
    name: 'Operasional Reservasi & Front Office',
    scope: 'DIVISION_GROUP',
    type: 'GROUP',
    department: 'Divisi Resepsionis',
    participantIds: [],
    description: 'Koordinasi penempatan jemaah, check-in, check-out, dan status kamar.',
    icon: 'fa-bell-concierge',
    lastMessage: 'Saluran koordinasi reservasi dan registrasi jemaah siap digunakan.',
    lastMessageTime: '08:00',
    lastSenderName: 'Sistem UPT'
  },
  {
    id: 'channel-fasilitas-teknisi',
    name: 'Sarana Prasarana, Teknisi & QC',
    scope: 'DIVISION_GROUP',
    type: 'GROUP',
    department: 'Divisi Teknisi & QC',
    participantIds: [],
    description: 'Saluran penugasan perbaikan fasilitas, genset, AC, plumbing, dan verifikasi kelayakan kamar.',
    icon: 'fa-screwdriver-wrench',
    lastMessage: 'Saluran pemeliharaan sarana prasarana dan inspeksi QC aktif.',
    lastMessageTime: '08:00',
    lastSenderName: 'Sistem UPT'
  },
  {
    id: 'channel-koperasi-konsumsi',
    name: 'Layanan Koperasi & Sarapan Tamu',
    scope: 'DIVISION_GROUP',
    type: 'GROUP',
    department: 'Divisi Koperasi',
    participantIds: [],
    description: 'Koordinasi pemesanan konsumsi, menu sarapan, dan pengantaran ke kamar tamu.',
    icon: 'fa-utensils',
    lastMessage: 'Saluran katering dan koperasi siap memproses pesanan sarapan.',
    lastMessageTime: '08:00',
    lastSenderName: 'Sistem UPT'
  },
  {
    id: 'channel-keuangan-bendahara',
    name: 'Koordinasi Keuangan & Verifikasi PNBP',
    scope: 'DIVISION_GROUP',
    type: 'GROUP',
    department: 'Divisi Keuangan',
    participantIds: [],
    description: 'Koordinasi tagihan sewa, pelunasan DP, kwitansi resmi, dan rekonsiliasi keuangan asrama.',
    icon: 'fa-file-invoice-dollar',
    lastMessage: 'Saluran koordinasi keuangan dan verifikasi pembayaran siap digunakan.',
    lastMessageTime: '08:00',
    lastSenderName: 'Sistem UPT'
  }
];

// Seluruh pesan chat awal dikosongkan (tanpa pesan dummy)
export const initialChatMessages: ChatMessage[] = [];

/**
 * Menghasilkan ID channel DIRECT (personal 2 arah) yang deterministik & kanonik
 * untuk pasangan 2 akun, sehingga Akun A -> Akun B dan Akun B -> Akun A selalu
 * masuk ke ruang obrolan pribadi yang sama.
 */
export function getDirectChannelId(userAId: string, userBId: string): string {
  const sorted = [String(userAId).trim(), String(userBId).trim()].sort();
  return `dm___${sorted[0]}___${sorted[1]}`;
}

/**
 * Menentukan pasangan lawan bicara (partner) pada saluran DIRECT untuk user yang sedang login
 */
export function resolveDirectPartner(
  channel: ChatChannel,
  currentUserId: string,
  users: User[]
): User | undefined {
  if (channel.type !== 'DIRECT') return undefined;

  // 1. Cek dari participantIds
  if (Array.isArray(channel.participantIds) && channel.participantIds.length > 0) {
    const otherId = channel.participantIds.find(id => id && id !== currentUserId) || channel.participantIds[0];
    const found = users.find(u => u.id === otherId);
    if (found) return found;
  }

  // 2. Cek dari format baru dm___uid1___uid2
  if (channel.id.startsWith('dm___')) {
    const parts = channel.id.split('___').slice(1);
    const otherId = parts.find(id => id && id !== currentUserId) || parts[0];
    const found = users.find(u => u.id === otherId);
    if (found) return found;
  }

  // 3. Cek dari format lama dm-uid1-uid2 (mendukung user.id yang mengandung tanda hubung seperti u-superadmin)
  if (channel.id.startsWith('dm-')) {
    const body = channel.id.slice(3);
    for (const u of users) {
      if (u.id !== currentUserId && body.includes(u.id)) {
        return u;
      }
    }
  }

  // 4. Fallback berdasarkan nama channel
  return users.find(u => u.id !== currentUserId && u.fullName.toLowerCase() === (channel.name || '').toLowerCase());
}

/**
 * Mengecek apakah seorang user merupakan peserta / berhak menerima pesan pada suatu channel
 */
export function isUserParticipantInChannel(user: User, channel: ChatChannel): boolean {
  if (!user || !channel) return false;
  if (channel.type === 'GROUP') {
    // Jika grup khusus dengan participantIds eksplisit (dan bukan default grup umum), cek participantIds
    // Namun semua grup operasional default terbuka untuk komunikasi 2 arah lintas petugas aktif
    if (
      channel.id.startsWith('channel-') ||
      !channel.participantIds ||
      channel.participantIds.length === 0 ||
      (channel.participantIds.length <= 2 && channel.participantIds.includes('u-superadmin'))
    ) {
      return true;
    }
    return channel.participantIds.includes(user.id) || user.role === 'Super Admin' || user.role === 'Admin';
  }

  // Untuk DIRECT (Chat Personal 2 Arah):
  if (Array.isArray(channel.participantIds) && channel.participantIds.includes(user.id)) {
    return true;
  }
  if (channel.id.startsWith('dm___')) {
    const parts = channel.id.split('___').slice(1);
    return parts.includes(user.id);
  }
  if (channel.id.startsWith('dm-')) {
    return channel.id.includes(user.id);
  }
  return false;
}
