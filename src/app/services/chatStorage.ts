// @ts-nocheck
import { ChatChannel, ChatMessage, ChatScope } from '../types';
import { initialChatChannels } from '../chatData';
import { dataStorage } from './dataStorage';
import { pushChatMessageToSpreadsheet } from './spreadsheetStorage';

/**
 * ============================================================================
 * SKEMA DATABASE PANEL CHAT MENGAMBANG (FLOATING CHAT PANEL DATABASE SCHEMA)
 * Mendukung Saluran Grup Divisi / Terpadu & Chat Pribadi 2-Arah (1-on-1)
 * ============================================================================
 */

export interface ChatChannelRecord {
  id: string; // ID unik: e.g. "channel-all-managers" atau "dm___user1___user2"
  name: string; // Nama grup atau nama lawan bicara
  type: 'GROUP' | 'DIRECT'; // Jenis: Grup tim atau pesan personal 1-on-1
  scope: ChatScope; // Cakupan hak akses: ALL_MANAGERS_GROUP, DIVISION_GROUP, DIRECT, dll
  department?: string; // Divisi operasional (jika grup divisi)
  participant_ids: string; // JSON Array string: daftar user ID yang terlibat
  description?: string; // Deskripsi fungsi saluran
  icon?: string; // Ikon FontAwesome
  last_message?: string; // Cuplikan teks pesan terakhir
  last_message_time?: string; // Waktu pesan terakhir (e.g. "14:20 WIB")
  last_sender_name?: string; // Nama pengirim pesan terakhir
  created_at: string; // ISO 8601 Timestamp pembuatan saluran
  updated_at: string; // ISO 8601 Timestamp pembaruan saluran terakhir
}

export interface ChatMessageRecord {
  id: string; // Primary key unik: e.g. "msg-1712345678901-xyz"
  channel_id: string; // Foreign key merujuk ke chat_channels.id
  channel_type: 'GROUP' | 'DIRECT'; // Jenis percakapan
  sender_id: string; // ID pengguna pengirim
  sender_name: string; // Nama lengkap pengirim
  sender_role: string; // Role / jabatan pengirim
  sender_department?: string; // Divisi pengirim
  message: string; // Konten teks pesan lengkap (multiline didukung)
  timestamp: string; // ISO 8601 Timestamp presisi (e.g. "2026-10-17T06:30:00.000Z")
  time_formatted: string; // Waktu lokal terformat (e.g. "13:30 WIB")
  priority: 'NORMAL' | 'PENTING' | 'URGENT'; // Derajat urgensi pesan
  is_instruction: boolean; // Flag penanda instruksi/arahan resmi pimpinan
  read_by: string; // JSON Array string user IDs yang telah membaca
  reply_to_id?: string; // ID pesan asal yang dibalas (opsional)
  reply_to_sender?: string; // Nama pengirim pesan asal (opsional)
  reply_to_text?: string; // Cuplikan teks pesan asal (opsional)
  created_at: string; // ISO 8601 Timestamp penyimpanan database permanen
}

export const CHAT_DATABASE_SCHEMA_META = {
  chat_channels: {
    sheetName: 'chat_channels',
    tableName: 'chat_channels',
    label: 'Saluran & Grup Chat',
    category: 'Sistem & Komunikasi',
    primaryKey: 'id',
    headers: [
      'id',
      'name',
      'scope',
      'type',
      'department',
      'participant_ids',
      'description',
      'icon',
      'last_message',
      'last_message_time',
      'last_sender_name',
      'created_at',
      'updated_at'
    ],
    sqlDefinition: `
      CREATE TABLE IF NOT EXISTS chat_channels (
        id VARCHAR(120) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(20) NOT NULL DEFAULT 'GROUP',
        scope VARCHAR(50) NOT NULL DEFAULT 'ALL_MANAGERS_GROUP',
        department VARCHAR(100),
        participant_ids TEXT DEFAULT '[]',
        description TEXT,
        icon VARCHAR(50) DEFAULT 'fa-comments',
        last_message TEXT,
        last_message_time VARCHAR(50),
        last_sender_name VARCHAR(150),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_chat_channels_type ON chat_channels(type);
      CREATE INDEX IF NOT EXISTS idx_chat_channels_scope ON chat_channels(scope);
    `
  },
  chat_messages: {
    sheetName: 'chat_messages',
    tableName: 'chat_messages',
    label: 'Riwayat Pesan Chat',
    category: 'Sistem & Komunikasi',
    primaryKey: 'id',
    headers: [
      'id',
      'channel_id',
      'channel_type',
      'sender_id',
      'sender_name',
      'sender_role',
      'sender_department',
      'message',
      'timestamp',
      'time_formatted',
      'priority',
      'is_instruction',
      'read_by',
      'reply_to_id',
      'reply_to_sender',
      'reply_to_text',
      'created_at'
    ],
    sqlDefinition: `
      CREATE TABLE IF NOT EXISTS chat_messages (
        id VARCHAR(120) PRIMARY KEY,
        channel_id VARCHAR(120) NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
        channel_type VARCHAR(20) NOT NULL DEFAULT 'GROUP',
        sender_id VARCHAR(100) NOT NULL,
        sender_name VARCHAR(150) NOT NULL,
        sender_role VARCHAR(100) NOT NULL,
        sender_department VARCHAR(100),
        message TEXT NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
        time_formatted VARCHAR(30) NOT NULL,
        priority VARCHAR(20) DEFAULT 'NORMAL',
        is_instruction BOOLEAN DEFAULT FALSE,
        read_by TEXT DEFAULT '[]',
        reply_to_id VARCHAR(120),
        reply_to_sender VARCHAR(150),
        reply_to_text TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages(channel_id);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id);
    `
  }
};

/**
 * Normalisasi data channel dari format database ke ChatChannel aplikasi
 */
export function mapRecordToChatChannel(r: any): ChatChannel {
  let participantIds: string[] = [];
  if (Array.isArray(r.participantIds || r.participant_ids)) {
    participantIds = r.participantIds || r.participant_ids;
  } else if (typeof (r.participant_ids || r.participantIds) === 'string') {
    try {
      const parsed = JSON.parse(r.participant_ids || r.participantIds);
      if (Array.isArray(parsed)) participantIds = parsed;
    } catch (_) {
      participantIds = (r.participant_ids || r.participantIds).split(',').map((s: string) => s.trim()).filter(Boolean);
    }
  }

  return {
    id: String(r.id || ''),
    name: String(r.name || 'Ruang Obrolan'),
    type: r.type === 'DIRECT' ? 'DIRECT' : 'GROUP',
    scope: (r.scope || 'ALL_MANAGERS_GROUP') as ChatScope,
    department: r.department || undefined,
    participantIds,
    description: r.description || undefined,
    icon: r.icon || (r.type === 'DIRECT' ? 'fa-user' : 'fa-comments'),
    lastMessage: r.lastMessage || r.last_message || undefined,
    lastMessageTime: r.lastMessageTime || r.last_message_time || undefined,
    lastSenderName: r.lastSenderName || r.last_sender_name || undefined
  };
}

/**
 * Normalisasi data pesan dari format database ke ChatMessage aplikasi
 */
export function mapRecordToChatMessage(r: any): ChatMessage {
  let readBy: string[] = [];
  if (Array.isArray(r.readBy || r.read_by)) {
    readBy = r.readBy || r.read_by;
  } else if (typeof (r.read_by || r.readBy) === 'string') {
    try {
      const parsed = JSON.parse(r.read_by || r.readBy);
      if (Array.isArray(parsed)) readBy = parsed;
    } catch (_) {
      readBy = (r.read_by || r.readBy).split(',').map((s: string) => s.trim()).filter(Boolean);
    }
  }

  const rawTimestamp = r.timestamp || r.created_at || new Date().toISOString();
  let timeFormatted = r.timeFormatted || r.time_formatted;
  if (!timeFormatted) {
    try {
      const d = new Date(rawTimestamp);
      timeFormatted = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
    } catch (_) {
      timeFormatted = '00:00 WIB';
    }
  }

  return {
    id: String(r.id || `msg-${Date.now()}`),
    channelId: String(r.channelId || r.channel_id || ''),
    senderId: String(r.senderId || r.sender_id || ''),
    senderName: String(r.senderName || r.sender_name || 'Petugas'),
    senderRole: String(r.senderRole || r.sender_role || 'Staf'),
    senderDepartment: r.senderDepartment || r.sender_department || undefined,
    message: String(r.message || ''),
    timestamp: rawTimestamp,
    timeFormatted,
    priority: (r.priority || 'NORMAL') as 'NORMAL' | 'PENTING' | 'URGENT',
    isInstruction: Boolean(r.isInstruction ?? r.is_instruction ?? false),
    readBy,
    replyToId: r.replyToId || r.reply_to_id || undefined,
    replyToSender: r.replyToSender || r.reply_to_sender || undefined,
    replyToText: r.replyToText || r.reply_to_text || undefined
  };
}

/**
 * Mengambil database chat lengkap dari backend server
 */
export async function fetchChatDatabaseFromServer(): Promise<{ channels: ChatChannel[]; messages: ChatMessage[] } | null> {
  try {
    const res = await fetch('/api/chat/database', {
      headers: { Accept: 'application/json' }
    });
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return null;
      }
      const data = await res.json();
      if (data && data.ok) {
        // Sinkronkan antrean offline jika ada saat koneksi pulih
        syncOfflineMessageQueue().catch(() => {});
        return {
          channels: (data.channels || []).map(mapRecordToChatChannel),
          messages: (data.messages || []).map(mapRecordToChatMessage)
        };
      }
    }
  } catch (err) {
    console.warn('[ChatStorage] Gagal mengambil riwayat chat dari server:', err);
  }
  return null;
}

/**
 * Menyimpan pesan chat secara permanen ke server database dan penyimpanan lokal
 */
const OFFLINE_QUEUE_KEY = 'SIM_OFFLINE_CHAT_QUEUE_V1';

export function queueOfflineMessage(message: ChatMessage, channel?: ChatChannel) {
  try {
    const queue = getOfflineMessageQueue();
    queue.push({ message, channel, queuedAt: new Date().toISOString() });
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (_) {}
}

export function getOfflineMessageQueue(): Array<{ message: ChatMessage; channel?: ChatChannel; queuedAt: string }> {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

export async function syncOfflineMessageQueue(): Promise<void> {
  const queue = getOfflineMessageQueue();
  if (queue.length === 0) return;

  const remaining: Array<{ message: ChatMessage; channel?: ChatChannel; queuedAt: string }> = [];
  for (const item of queue) {
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: item.message, channel: item.channel })
      });
      if (!res.ok) {
        remaining.push(item);
      }
    } catch (_) {
      remaining.push(item);
    }
  }

  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  } catch (_) {}
}

export async function persistChatMessage(
  message: ChatMessage,
  channel?: ChatChannel
): Promise<ChatMessage> {
  // 1. Simpan di dataStorage lokal (IndexedDB / LocalStorage)
  dataStorage.saveChatMessage(message, channel);

  // 2. Kirim langsung ke basis data Google Spreadsheet secara real-time
  pushChatMessageToSpreadsheet(message, channel).catch(err => {
    console.warn('[ChatStorage] Gagal push chat ke Google Spreadsheet:', err);
  });

  // 3. Kirim ke backend server proxy jika ada untuk broadcast SSE lokal
  try {
    const res = await fetch('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, channel })
    });
    if (!res.ok) {
      queueOfflineMessage(message, channel);
    } else {
      // Jika berhasil, coba sinkronkan antrean offline yang mungkin tertunda
      syncOfflineMessageQueue().catch(() => {});
    }
  } catch (err) {
    queueOfflineMessage(message, channel);
  }

  return message;
}

/**
 * Menyimpan atau memperbarui saluran chat (Grup / Direct) ke server
 */
export async function persistChatChannel(channel: ChatChannel): Promise<ChatChannel> {
  dataStorage.saveChatChannel(channel);

  try {
    fetch('/api/chat/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel })
    }).catch(err => {
      console.warn('[ChatStorage] Gagal persistensi channel ke server:', err);
    });
  } catch (_) {}

  return channel;
}

/**
 * Memperbarui tanda pesan telah dibaca (Read Receipt) secara permanen
 */
export async function markChatChannelAsRead(channelId: string, userId: string): Promise<void> {
  try {
    fetch('/api/chat/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId, userId })
    }).catch(() => {});
  } catch (_) {}
}
