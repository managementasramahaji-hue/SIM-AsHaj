// @ts-nocheck
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useAppContext, isManagerRole, isSuperAdmin } from '../store';
import { User, ChatChannel, ChatMessage } from '../types';
import { getDirectChannelId, resolveDirectPartner } from '../chatData';
import { useBodyScrollLock } from '../lib/scrollLock';
import { realtimeService } from '../services/realtimeService';
import { parseLocalTimeString } from '../lib/utils';

const QUICK_OPERATIONAL_TEMPLATES = [
  'Mohon laporan kesiapan kamar di gedung Anda.',
  'Tamu rombongan sudah tiba di lobi resepsionis.',
  'Mohon tim QC segera inspeksi kamar yang baru check-out.',
  'Mohon tim Teknisi cek fasilitas kamar yang dilaporkan.',
  'Siap, instruksi diterima dan segera ditindaklanjuti.'
];

export function FloatingChatPanel() {
  const {
    currentUser,
    users = [],
    chatChannels = [],
    chatMessages = [],
    isChatOpen,
    activeChatChannelId,
    chatSoundEnabled,
    chatNotificationToast,
    unreadTotalCount,
    openChat,
    closeChat,
    setActiveChatChannelId,
    toggleChatSound,
    sendChatMessage,
    dismissChatNotification,
    clearChatHistory,
    showToast,
    workSessions = [],
    onlinePresences = [],
    typingByChannel = {},
    notifyChatTyping,
    setActiveTab
  } = useAppContext();

  const [chatSubFilter, setChatSubFilter] = useState<'ALL' | 'GROUP' | 'DIRECT'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [newChatSearch, setNewChatSearch] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [isOfficialInstruction, setIsOfficialInstruction] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [showQuickTemplates, setShowQuickTemplates] = useState(false);
  const [isExpandedWidth, setIsExpandedWidth] = useState(false);

  // Modals state
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [showGroupInfoModal, setShowGroupInfoModal] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [showPartnerSessionModal, setShowPartnerSessionModal] = useState(false);
  const [selectedSessionUser, setSelectedSessionUser] = useState<User | null>(null);
  const [ticker, setTicker] = useState(0);

  // Live ticking timer for work session hours and durations
  useEffect(() => {
    if (!isChatOpen && !showPartnerSessionModal) return;
    const timer = setInterval(() => setTicker(t => (t + 1) % 1000), 1000);
    return () => clearInterval(timer);
  }, [isChatOpen, showPartnerSessionModal]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const lastTypingSentRef = useRef<number>(0);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Explicit real-time subscription for 2-way live communication filtered by current user's session ID and recipient ID
  useEffect(() => {
    if (!currentUser || !isChatOpen) return;

    const currentSessionId = workSessions.find(
      s => s.userId === currentUser.id && s.status === 'AKTIF' && !s.logoutTime
    )?.id || `SESI-${currentUser.id}`;

    let recipientId: string | undefined = undefined;
    if (activeChatChannelId) {
      const activeCh = chatChannels.find(c => c.id === activeChatChannelId);
      if (activeCh && activeCh.type === 'DIRECT') {
        const partner = resolveDirectPartner(activeCh, currentUser.id, users);
        recipientId = partner?.id;
      }
    }

    const handleRealtimeChats = (event: any) => {
      if (!event || !event.type) return;
      const isChatRelated =
        event.type === 'chat:message' ||
        event.type === 'chat:read' ||
        event.type === 'chat:channel' ||
        event.type === 'chat:clear' ||
        event.type === 'database:sync' ||
        event.type === 'init' ||
        event.type === 'state:sync';

      if (isChatRelated) {
        const msg = event.payload?.message;
        if (msg) {
          const matches =
            msg.senderId === currentUser.id ||
            msg.channelId === activeChatChannelId ||
            (recipientId && msg.senderId === recipientId);
          if (matches || event.type === 'database:sync' || event.type === 'init') {
            realtimeService.pollNow();
          }
        } else {
          realtimeService.pollNow();
        }
      }
    };

    const unsubscribe = realtimeService.subscribe(handleRealtimeChats);
    realtimeService.pollNow();

    const liveInterval = setInterval(() => {
      realtimeService.pollNow();
    }, 2000);

    return () => {
      unsubscribe();
      clearInterval(liveInterval);
    };
  }, [currentUser, isChatOpen, activeChatChannelId, workSessions, chatChannels, users]);

  // Otomatis tutup chat saat klik di luar panel chat
  useEffect(() => {
    if (!isChatOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (isNewChatModalOpen || showGroupInfoModal || showClearConfirmModal || showPartnerSessionModal) return;

      const target = event.target as Node;
      if (chatPanelRef.current && !chatPanelRef.current.contains(target)) {
        const launcher = document.getElementById('floating-chat-launcher');
        if (launcher && launcher.contains(target)) return;
        closeChat();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isChatOpen, isNewChatModalOpen, showGroupInfoModal, showClearConfirmModal, showPartnerSessionModal, closeChat]);

  const isAnyChatModalOpen = isNewChatModalOpen || showGroupInfoModal || showClearConfirmModal || showPartnerSessionModal || (isChatOpen && isMobile);
  useBodyScrollLock(isAnyChatModalOpen);

  if (!currentUser) return null;

  const isCurrentUserManager = isManagerRole(currentUser.role);

  // Real-Time Multi-Account Online Presence Engine
  const isUserOnline = (userId: string): boolean => {
    if (userId === currentUser.id) return true;
    const now = Date.now();
    // 1. Check live real-time presence heartbeats across concurrent devices
    const hasLivePresence = onlinePresences.some(p => {
      if (p.userId !== userId) return false;
      const lastSeen = p.lastSeenMs || (p as any).lastSeen || 0;
      return !lastSeen || (now - lastSeen < 180000);
    });
    if (hasLivePresence) return true;

    // 2. Check active work sessions
    const hasActiveShift = workSessions.some(s => {
      if (s.userId !== userId || s.status !== 'AKTIF' || s.logoutTime) return false;
      if (s.lastHeartbeat) {
        const hb = new Date(s.lastHeartbeat).getTime();
        if (!isNaN(hb)) return now - hb < 180000;
      }
      if (s.loginTime) {
        const start = parseLocalTimeString(s.loginTime).getTime();
        if (!isNaN(start)) return now - start < 4 * 3600 * 1000;
      }
      return true;
    });
    if (hasActiveShift) return true;

    return false;
  };

  // Get active session info for a user
  const getUserActiveSession = (userId: string) => {
    return workSessions.find(s => s.userId === userId && s.status === 'AKTIF' && !s.logoutTime);
  };

  // Live formatted elapsed time for an active session
  const formatSessionLiveDuration = (loginTimeStr?: string): string => {
    if (!loginTimeStr) return '0 mnt';
    try {
      let d: Date;
      if (loginTimeStr.includes('T')) {
        d = new Date(loginTimeStr);
      } else {
        const parts = loginTimeStr.split(' ');
        const dateParts = (parts[0] || '').split('-').map(Number);
        const timeParts = (parts[1] || '00:00:00').split(':').map(Number);
        d = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0] || 0, timeParts[1] || 0, timeParts[2] || 0);
      }
      const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
      const hours = Math.floor(diffSec / 3600);
      const minutes = Math.floor((diffSec % 3600) / 60);
      const seconds = diffSec % 60;
      if (hours > 0) return `${hours}j ${minutes}m ${seconds}d`;
      if (minutes > 0) return `${minutes}m ${seconds}d`;
      return `${seconds} dtk`;
    } catch (_) {
      return '0 mnt';
    }
  };

  // Channel helpers
  const getGroupMembers = (channel: ChatChannel): User[] => {
    if (channel.type === 'DIRECT') {
      return users.filter(u => channel.participantIds.includes(u.id));
    }
    if (channel.scope === 'ALL_MANAGERS_GROUP') {
      return users.filter(u => u.status === 'Aktif');
    }
    if (channel.department) {
      const deptUsers = users.filter(
        u =>
          u.department === channel.department ||
          channel.participantIds.includes(u.id) ||
          u.role === 'Super Admin' ||
          u.role === 'Admin'
      );
      return deptUsers.length > 0 ? deptUsers : users.filter(u => u.status === 'Aktif');
    }
    const explicitMembers = users.filter(u => channel.participantIds.includes(u.id));
    return explicitMembers.length > 0 ? explicitMembers : users.filter(u => u.status === 'Aktif');
  };

  const getDirectChatPartner = (channel: ChatChannel): User | undefined => {
    const partnerFromHelper = resolveDirectPartner(channel, currentUser.id, users);
    if (partnerFromHelper) return partnerFromHelper;
    const otherId = channel.participantIds.find(id => id !== currentUser.id);
    return users.find(u => u.id === otherId);
  };

  // Dynamic channel display name (so Direct Chat always shows the OTHER person's name to each participant!)
  const getChannelDisplayName = (channel: ChatChannel): string => {
    if (channel.type === 'DIRECT') {
      const partner = getDirectChatPartner(channel);
      if (partner) return partner.fullName;
    }
    return channel.name;
  };

  const getChannelSubtitle = (channel: ChatChannel): string => {
    if (channel.type === 'DIRECT') {
      const partner = getDirectChatPartner(channel);
      if (partner) {
        return `${partner.role}${partner.department ? ` • ${partner.department}` : ''}`;
      }
      return 'Pesan Pribadi (2 Arah)';
    }
    return channel.department ? `Grup Divisi ${channel.department}` : 'Grup Koordinasi Terpadu';
  };

  // Deduplicate and filter accessible channels for current user
  const accessibleChannels = useMemo(() => {
    const seenIds = new Set<string>();
    const seenDirectPartners = new Set<string>();
    const list: ChatChannel[] = [];

    // Sort channels so ones with recent messages come first among direct chats, while keeping primary groups accessible
    const sorted = [...chatChannels].sort((a, b) => {
      if (a.id === 'channel-all-managers') return -1;
      if (b.id === 'channel-all-managers') return 1;
      if (a.type !== b.type) return a.type === 'GROUP' ? -1 : 1;
      return (b.lastMessageTime || '').localeCompare(a.lastMessageTime || '');
    });

    for (const c of sorted) {
      if (seenIds.has(c.id)) continue;

      if (c.type === 'GROUP') {
        seenIds.add(c.id);
        list.push(c);
      } else if (c.type === 'DIRECT') {
        const isParticipant =
          c.participantIds.includes(currentUser.id) ||
          c.id.includes(currentUser.id);
        if (!isParticipant) continue;

        const partner = getDirectChatPartner(c);
        const partnerKey = partner ? partner.id : c.id;
        if (seenDirectPartners.has(partnerKey)) continue;
        seenDirectPartners.add(partnerKey);

        seenIds.add(c.id);
        list.push(c);
      }
    }
    return list;
  }, [chatChannels, currentUser.id, users]);

  const getChannelUnread = (channelId: string): number => {
    return chatMessages.filter(
      m =>
        m.channelId === channelId &&
        m.senderId !== currentUser.id &&
        !(m.readBy || []).includes(currentUser.id)
    ).length;
  };

  const groupUnreadTotal = useMemo(() => {
    return accessibleChannels
      .filter(c => c.type === 'GROUP')
      .reduce((acc, c) => acc + getChannelUnread(c.id), 0);
  }, [accessibleChannels, chatMessages, currentUser.id]);

  const directUnreadTotal = useMemo(() => {
    return accessibleChannels
      .filter(c => c.type === 'DIRECT')
      .reduce((acc, c) => acc + getChannelUnread(c.id), 0);
  }, [accessibleChannels, chatMessages, currentUser.id]);

  const filteredChannels = useMemo(() => {
    return accessibleChannels.filter(c => {
      if (chatSubFilter === 'GROUP' && c.type !== 'GROUP') return false;
      if (chatSubFilter === 'DIRECT' && c.type !== 'DIRECT') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const displayName = getChannelDisplayName(c).toLowerCase();
        const subtitle = getChannelSubtitle(c).toLowerCase();
        const lastMsg = (c.lastMessage || '').toLowerCase();
        return displayName.includes(q) || subtitle.includes(q) || lastMsg.includes(q);
      }
      return true;
    });
  }, [accessibleChannels, chatSubFilter, searchQuery, users, currentUser.id]);

  // All other active accounts for quick 1-click personal chat bar
  const otherColleagues = useMemo(() => {
    return users
      .filter(u => u.id !== currentUser.id && u.status === 'Aktif')
      .sort((a, b) => {
        const aOnline = isUserOnline(a.id) ? 1 : 0;
        const bOnline = isUserOnline(b.id) ? 1 : 0;
        if (aOnline !== bOnline) return bOnline - aOnline;
        return a.fullName.localeCompare(b.fullName);
      });
  }, [users, currentUser.id, onlinePresences, workSessions]);

  const onlineColleaguesCount = useMemo(() => {
    return otherColleagues.filter(u => isUserOnline(u.id)).length;
  }, [otherColleagues, onlinePresences, workSessions]);

  const activeChannel = chatChannels.find(c => c.id === activeChatChannelId);
  const channelMessages = useMemo(() => {
    if (!activeChatChannelId) return [];
    return chatMessages.filter(m => m.channelId === activeChatChannelId);
  }, [chatMessages, activeChatChannelId]);

  const activeDirectPartner =
    activeChannel && activeChannel.type === 'DIRECT'
      ? getDirectChatPartner(activeChannel)
      : undefined;
  const activePartnerSession = useMemo(() => {
    if (!activeDirectPartner) return undefined;
    return getUserActiveSession(activeDirectPartner.id);
  }, [activeDirectPartner, workSessions, ticker]);
  const activeGroupMembers = activeChannel ? getGroupMembers(activeChannel) : [];
  const activeGroupOnlineMembers = activeGroupMembers.filter(u => isUserOnline(u.id));

  const currentChannelTyping = activeChatChannelId ? typingByChannel[activeChatChannelId] : undefined;

  useEffect(() => {
    if (isChatOpen && activeChatChannelId) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [channelMessages.length, activeChatChannelId, isChatOpen, currentChannelTyping]);

  // Clear reply state when switching channels
  useEffect(() => {
    setReplyingTo(null);
    setShowQuickTemplates(false);
  }, [activeChatChannelId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);
    if (activeChatChannelId && e.target.value.trim()) {
      const now = Date.now();
      if (now - lastTypingSentRef.current > 2000) {
        lastTypingSentRef.current = now;
        notifyChatTyping(activeChatChannelId);
      }
    }
  };

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!messageInput.trim() || !activeChatChannelId) return;

    sendChatMessage(
      activeChatChannelId,
      messageInput.trim(),
      isUrgent ? 'URGENT' : 'NORMAL',
      isCurrentUserManager ? isOfficialInstruction : false,
      replyingTo
        ? {
            id: replyingTo.id,
            senderName: replyingTo.senderName,
            text: replyingTo.message
          }
        : undefined
    );
    setMessageInput('');
    setIsUrgent(false);
    setIsOfficialInstruction(false);
    setReplyingTo(null);
    setShowQuickTemplates(false);
  };

  const handleStartDirectChat = (targetUser: User) => {
    setIsNewChatModalOpen(false);
    setShowGroupInfoModal(false);
    const channelId = getDirectChannelId(currentUser.id, targetUser.id);
    openChat(channelId);
    showToast(`Membuka ruang chat pribadi 2 arah dengan ${targetUser.fullName}`, 'info');
  };

  return (
    <>
      {/* 1. REAL-TIME NOTIFICATION BANNER (TOAST) */}
      {chatNotificationToast && (
        <div
          id="floating-chat-toast"
          className="fixed bottom-20 right-4 sm:right-6 z-50 max-w-sm w-[92vw] sm:w-[390px] bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-gold-500/40 animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-hajj-700 text-gold-300 flex items-center justify-center font-bold text-xs shadow border border-gold-500/30 shrink-0">
                <i className={`fa-solid ${chatNotificationToast.message.isUrgent ? 'fa-triangle-exclamation text-red-400 animate-bounce' : 'fa-comments'}`}></i>
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] font-bold text-gold-400 uppercase tracking-wider">
                    {chatNotificationToast.message.isInstruction
                      ? '★ Arahan Pimpinan UPT'
                      : chatNotificationToast.message.scope === 'DIRECT'
                      ? 'Pesan Pribadi Masuk'
                      : 'Pesan Grup Operasional'}
                  </span>
                  {chatNotificationToast.message.isUrgent && (
                    <span className="px-1.5 py-0.2 bg-red-600 text-white text-[9px] font-black rounded uppercase">
                      URGENT
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold text-white truncate max-w-[230px]">
                  {chatNotificationToast.channelName}
                </p>
              </div>
            </div>
            <button
              onClick={dismissChatNotification}
              className="text-slate-400 hover:text-white p-1 text-xs cursor-pointer"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div className="text-xs text-slate-200 mt-2.5 bg-white/10 p-2.5 rounded-xl border border-white/10">
            <div className="flex items-center justify-between text-[10px] text-slate-300 mb-1">
              <strong className="text-gold-300">{chatNotificationToast.message.senderName}</strong>
              <span>{chatNotificationToast.message.senderRole} • {chatNotificationToast.message.timestamp}</span>
            </div>
            <p className="line-clamp-2 leading-relaxed">{chatNotificationToast.message.message}</p>
          </div>

          <div className="mt-3 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={dismissChatNotification}
              className="px-2.5 py-1 text-slate-400 hover:text-slate-200 text-xs font-medium cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={() => {
                openChat(chatNotificationToast.channelId);
                dismissChatNotification();
              }}
              className="px-3.5 py-1.5 bg-hajj-700 hover:bg-hajj-600 text-white rounded-lg text-xs font-bold shadow transition flex items-center space-x-1.5 border border-gold-500/30 cursor-pointer"
            >
              <i className="fa-solid fa-reply text-[10px]"></i>
              <span>Balas Pesan</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. COMPACT FLOATING LAUNCHER BUTTON */}
      {!isChatOpen && (
        <div
          id="floating-chat-launcher"
          className="fixed z-40 flex items-center space-x-1.5 select-none pointer-events-auto touch-manipulation"
          style={{
            right: 'calc(12px + env(safe-area-inset-right, 0px))',
            bottom: 'calc(14px + env(safe-area-inset-bottom, 0px))'
          }}
        >
          {/* Sound Toggle */}
          <button
            type="button"
            onClick={toggleChatSound}
            className={`hidden sm:flex w-8 h-8 rounded-full shadow-md border items-center justify-center text-xs transition-all hover:scale-105 active:scale-95 cursor-pointer ${
              chatSoundEnabled
                ? 'bg-white dark:bg-slate-800 text-hajj-700 dark:text-gold-400 border-hajj-300 dark:border-slate-600'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600'
            }`}
            title={chatSoundEnabled ? 'Suara Notifikasi Chat: AKTIF' : 'Suara Notifikasi Chat: SENYAP'}
          >
            <i className={`fa-solid ${chatSoundEnabled ? 'fa-volume-high' : 'fa-volume-xmark'}`}></i>
          </button>

          {/* Main Floating Chat Launcher */}
          <button
            type="button"
            onClick={() => openChat()}
            className="bg-hajj-700 hover:bg-hajj-800 active:bg-hajj-900 text-white shadow-xl shadow-hajj-950/30 p-2.5 sm:px-3.5 sm:py-2 rounded-full flex items-center space-x-2 transition-all hover:scale-105 active:scale-95 group cursor-pointer border border-gold-500/40 text-xs"
            title="Buka Chat Operasional (Grup & Pribadi Real-Time)"
            aria-label="Buka Chat Operasional Asrama"
          >
            <div className="relative flex items-center justify-center w-6 h-6 rounded-full bg-gold-500 text-hajj-950 font-bold text-xs shadow-inner shrink-0">
              <i className="fa-solid fa-comments text-[11px]"></i>
              {unreadTotalCount > 0 ? (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 ring-1 ring-white"></span>
                </span>
              ) : (
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-hajj-800"></span>
              )}
            </div>

            <div className="hidden sm:flex flex-col items-start leading-none">
              <span className="text-[11px] font-bold tracking-tight text-white whitespace-nowrap">
                Chat Operasional
              </span>
              <span className="text-[9px] text-gold-300 font-medium mt-0.5">
                {onlineColleaguesCount + 1} Akun Online
              </span>
            </div>

            {unreadTotalCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full ring-1 ring-white shrink-0 animate-pulse">
                {unreadTotalCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* 3. COMPACT & RESPONSIVE 2-WAY REAL-TIME CHAT PANEL */}
      {isChatOpen && (
        <>
          {/* Backdrop on mobile only for closing on click outside */}
          <div
            className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[1.5px] sm:hidden"
            onClick={closeChat}
          />

          <div
            ref={chatPanelRef}
            id="floating-chat-modal"
            className={`fixed z-50 sm:z-40 transition-all duration-200 ease-out flex flex-col overflow-hidden bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 rounded-2xl
              /* Mobile: compact floating card anchored comfortably at bottom, not overtaking full screen */
              left-2.5 right-2.5 bottom-2.5 sm:left-auto sm:inset-auto sm:bottom-4 sm:right-4 md:right-6
              /* Height: ergonomic & compact across mobile and desktop */
              h-[68vh] max-h-[520px] min-h-[380px] sm:h-[485px] sm:max-h-[82vh]
              /* Desktop Width: compact default 360px with expandable 440px option */
              w-auto sm:w-[360px] ${isExpandedWidth ? 'sm:w-[440px] sm:h-[530px]' : ''}
              animate-in fade-in zoom-in-95`}
          >
            {/* Top Header Bar */}
            <div className="bg-hajj-800 text-white px-3 py-2 sm:px-3.5 sm:py-2 flex items-center justify-between shrink-0 shadow-sm border-b border-gold-500/25">
              <div className="flex items-center space-x-2 min-w-0 pr-1.5">
                <div className="w-7 h-7 rounded-lg bg-gold-500 text-hajj-950 flex items-center justify-center font-bold text-xs shadow shrink-0">
                  <i className="fa-solid fa-comments"></i>
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-xs text-white leading-tight flex items-center space-x-1.5 truncate">
                    <span className="truncate">Chat Operasional UPT</span>
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-bold border border-emerald-400/30 shrink-0 flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                      <span>2-Arah</span>
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-300 flex items-center space-x-1 mt-0.5 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block shrink-0"></span>
                    <span className="truncate">
                      {currentUser.fullName} ({currentUser.role}) • {onlineColleaguesCount + 1} Aktif
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsNewChatModalOpen(true)}
                  className="px-2 py-0.5 rounded-md bg-gold-500/20 hover:bg-gold-500/30 text-gold-300 border border-gold-500/30 text-[10px] font-bold flex items-center space-x-1 transition cursor-pointer"
                  title="Mulai Chat Pribadi dengan Rekan"
                >
                  <i className="fa-solid fa-user-plus text-[9px]"></i>
                  <span className="hidden sm:inline">Pesan Baru</span>
                </button>
                <button
                  type="button"
                  onClick={toggleChatSound}
                  className={`w-6 h-6 rounded-md text-[11px] flex items-center justify-center transition cursor-pointer ${
                    chatSoundEnabled ? 'text-gold-300 bg-white/10' : 'text-slate-400 hover:text-white'
                  }`}
                  title={chatSoundEnabled ? 'Suara: Aktif' : 'Suara: Senyap'}
                >
                  <i className={`fa-solid ${chatSoundEnabled ? 'fa-volume-high' : 'fa-volume-xmark'}`}></i>
                </button>
                <button
                  type="button"
                  onClick={() => setIsExpandedWidth(prev => !prev)}
                  className="hidden sm:flex w-6 h-6 rounded-md text-slate-300 hover:text-white items-center justify-center hover:bg-white/10 transition cursor-pointer"
                  title={isExpandedWidth ? 'Perkecil Ukuran' : 'Perlebar Panel'}
                >
                  <i className={`fa-solid ${isExpandedWidth ? 'fa-compress' : 'fa-expand'} text-[11px]`}></i>
                </button>
                <button
                  type="button"
                  onClick={closeChat}
                  className="w-6 h-6 rounded-md text-slate-300 hover:text-white flex items-center justify-center hover:bg-white/10 transition cursor-pointer"
                  title="Tutup Panel Chat"
                >
                  <i className="fa-solid fa-xmark text-sm"></i>
                </button>
              </div>
            </div>

            {/* Sub-Header: Status Sinkronisasi Spreadsheet & Pintasan Rekap Sesi */}
            <div className="bg-hajj-900/95 text-[10px] text-slate-200 px-3 py-1.5 border-b border-gold-500/20 flex items-center justify-between shrink-0 select-none shadow-inner">
              <div className="flex items-center space-x-2 min-w-0 truncate">
                <span className="flex items-center space-x-1.5 text-emerald-300 font-semibold truncate">
                  <i className="fa-solid fa-file-excel text-[10px] text-emerald-400"></i>
                  <span>Spreadsheet: Tersinkron</span>
                </span>
                <span className="text-slate-500">•</span>
                <span className="text-gold-300 font-medium truncate">
                  {onlineColleaguesCount + 1} Akun Online
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('other');
                  closeChat();
                }}
                className="text-gold-300 hover:text-white font-bold flex items-center space-x-1 text-[9.5px] hover:underline cursor-pointer shrink-0 ml-1.5 bg-white/10 px-2 py-0.5 rounded border border-gold-500/30 transition"
                title="Buka menu lengkap Rekap Sesi dan Jam Kerja Petugas"
              >
                <i className="fa-solid fa-business-time text-[9px] text-gold-400"></i>
                <span>Rekap Sesi &amp; Jam</span>
                <i className="fa-solid fa-chevron-right text-[7px]"></i>
              </button>
            </div>

            {/* ================= TEAM CHANNELS / ACTIVE CHAT ROOM ================= */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {activeChatChannelId && activeChannel ? (
                /* ================= ACTIVE CHAT ROOM VIEW ================= */
                <div className="flex-1 flex flex-col h-full bg-slate-50">
                  {/* Chat Room Top Bar */}
                  <div className="bg-white px-3 py-2.5 border-b border-slate-200 flex items-center justify-between shrink-0 shadow-2xs">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => setActiveChatChannelId(null)}
                        className="p-1.5 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition cursor-pointer shrink-0"
                        title="Kembali ke Daftar Saluran"
                      >
                        <i className="fa-solid fa-arrow-left text-sm"></i>
                      </button>

                      <div className="relative shrink-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs border ${
                            activeChannel.type === 'DIRECT'
                              ? 'bg-blue-100 text-blue-800 border-blue-200'
                              : 'bg-hajj-100 text-hajj-800 border-hajj-200'
                          }`}
                        >
                          {activeChannel.type === 'DIRECT' ? (
                            activeDirectPartner ? (
                              activeDirectPartner.fullName.substring(0, 2).toUpperCase()
                            ) : (
                              'DM'
                            )
                          ) : (
                            <i className={`fa-solid ${activeChannel.icon || 'fa-users'}`}></i>
                          )}
                        </div>
                        {activeChannel.type === 'DIRECT' && activeDirectPartner && (
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
                              isUserOnline(activeDirectPartner.id) ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
                            }`}
                          />
                        )}
                      </div>

                      <div className="min-w-0">
                        <h4 className="font-bold text-xs text-slate-900 leading-tight truncate">
                          {getChannelDisplayName(activeChannel)}
                        </h4>
                        <div className="flex items-center space-x-1.5 text-[10px] text-slate-500 truncate mt-0.5">
                          {activeChannel.type === 'DIRECT' ? (
                            activeDirectPartner ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedSessionUser(activeDirectPartner);
                                  setShowPartnerSessionModal(true);
                                }}
                                className="flex items-center space-x-1 truncate hover:underline text-left cursor-pointer group"
                                title="Klik untuk melihat rekap sesi dan jam kerja petugas ini"
                              >
                                <span
                                  className={`font-bold flex items-center space-x-1 ${
                                    isUserOnline(activeDirectPartner.id) ? 'text-emerald-600' : 'text-slate-400'
                                  }`}
                                >
                                  {isUserOnline(activeDirectPartner.id) ? (
                                    <>
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-ping"></span>
                                      <span>● Sedang Bertugas</span>
                                      {activePartnerSession && (
                                        <span className="font-mono text-[9px] text-emerald-800 bg-emerald-100/90 font-bold px-1.5 py-0.2 rounded border border-emerald-300 ml-1">
                                          {formatSessionLiveDuration(activePartnerSession.loginTime)}
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <span>○ Offline</span>
                                  )}
                                </span>
                                <span>•</span>
                                <span className="truncate text-slate-600 group-hover:text-hajj-800">{activeDirectPartner.role}</span>
                                <i className="fa-solid fa-circle-info text-[9px] text-hajj-600 ml-0.5"></i>
                              </button>
                            ) : (
                              <span>Percakapan Pribadi 2 Arah</span>
                            )
                          ) : (
                            <button
                              type="button"
                              onClick={() => setShowGroupInfoModal(true)}
                              className="flex items-center space-x-1.5 truncate hover:underline text-left cursor-pointer"
                              title="Klik untuk melihat status anggota grup & rekap sesi kerja"
                            >
                              <span className="text-emerald-700 font-bold flex items-center space-x-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                <span>● {activeGroupOnlineMembers.length} Online</span>
                              </span>
                              <span>dari {activeGroupMembers.length} Petugas</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowGroupInfoModal(true)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-hajj-50 text-slate-700 hover:text-hajj-800 rounded-lg text-[10px] font-bold transition flex items-center space-x-1 border border-slate-200 cursor-pointer"
                        title={
                          activeChannel.type === 'DIRECT'
                            ? 'Informasi lawan bicara'
                            : 'Lihat daftar anggota grup & mulai chat pribadi'
                        }
                      >
                        <i className={`fa-solid ${activeChannel.type === 'DIRECT' ? 'fa-id-badge' : 'fa-users'}`}></i>
                        <span>{activeChannel.type === 'DIRECT' ? 'Profil' : `${activeGroupMembers.length} Anggota`}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowClearConfirmModal(true)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg text-xs cursor-pointer"
                        title="Bersihkan Riwayat Pesan di Saluran Ini"
                      >
                        <i className="fa-solid fa-trash-can"></i>
                      </button>
                    </div>
                  </div>

                  {/* Message History List */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 space-y-2 min-w-0 max-w-full overflow-x-hidden">
                    {channelMessages.length === 0 ? (
                      <div className="text-center py-10 px-3 text-slate-400 space-y-2">
                        <div className="w-10 h-10 rounded-2xl bg-slate-200/70 text-slate-400 flex items-center justify-center mx-auto text-lg">
                          <i className="fa-solid fa-comments"></i>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-slate-600">
                            Ruang Komunikasi {getChannelDisplayName(activeChannel)}
                          </p>
                          <p className="text-[10px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                            {activeChannel.type === 'DIRECT'
                              ? 'Pesan tersimpan permanen di database dan diterima seketika secara 2 arah.'
                              : 'Seluruh tim dapat berkoordinasi secara real-time dengan riwayat tersimpan permanen.'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      channelMessages.map(msg => {
                        const isMe = msg.senderId === currentUser.id;
                        const readCount = (msg.readBy || []).filter(id => id !== msg.senderId).length;
                        const senderUser = users.find(u => u.id === msg.senderId);
                        const displayTime = msg.timeFormatted || (msg.timestamp ? (msg.timestamp.includes('T') ? msg.timestamp.split('T')[1].substring(0, 5) : msg.timestamp.substring(11, 16)) : '');

                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-full min-w-0 group`}
                          >
                            {/* Sender Meta Header */}
                            <div className="flex items-center space-x-1 text-[9px] text-slate-500 mb-0.5 px-0.5 max-w-full min-w-0 truncate">
                              {!isMe && senderUser ? (
                                <button
                                  type="button"
                                  onClick={() => handleStartDirectChat(senderUser)}
                                  className="font-bold text-slate-800 hover:text-hajj-700 hover:underline cursor-pointer flex items-center space-x-1 truncate max-w-[140px]"
                                  title={`Klik untuk chat pribadi dengan ${msg.senderName}`}
                                >
                                  <span className="truncate">{msg.senderName}</span>
                                  <span className="text-[8px] font-semibold px-1 py-0.1 bg-slate-200 text-slate-700 rounded shrink-0">
                                    {msg.senderRole}
                                  </span>
                                </button>
                              ) : (
                                <span className="font-bold text-hajj-800 truncate max-w-[140px]">
                                  {isMe ? 'Anda' : msg.senderName}
                                </span>
                              )}
                              <span>•</span>
                              <span className="font-mono text-[8px] text-slate-400 shrink-0">{displayTime}</span>
                              {msg.priority === 'URGENT' && (
                                <span className="px-1 py-0.1 bg-red-100 text-red-700 font-bold rounded text-[8px] shrink-0">
                                  URGENT
                                </span>
                              )}
                              {msg.isInstruction && (
                                <span className="px-1 py-0.1 bg-amber-100 text-amber-800 font-bold rounded text-[8px] shrink-0">
                                  ★ Arahan
                                </span>
                              )}
                            </div>

                            {/* Message Bubble + Action Buttons */}
                            <div className={`flex items-end gap-1 max-w-[86%] sm:max-w-[82%] min-w-0 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                              <div
                                className={`p-2.5 rounded-2xl text-xs shadow-2xs relative min-w-0 max-w-full overflow-hidden break-words [overflow-wrap:anywhere] [word-break:break-word] hyphens-auto ${
                                  isMe
                                    ? 'bg-hajj-700 text-white rounded-tr-none'
                                    : msg.isInstruction
                                    ? 'bg-amber-50 text-slate-900 border border-amber-300 rounded-tl-none font-medium'
                                    : msg.priority === 'URGENT'
                                    ? 'bg-red-50 text-slate-900 border border-red-300 rounded-tl-none font-medium'
                                    : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'
                                }`}
                              >
                                {/* Quoted Reply Preview if any */}
                                {msg.replyToText && (
                                  <div
                                    className={`mb-1.5 p-1.5 rounded-lg text-[10px] border-l-2 min-w-0 max-w-full overflow-hidden ${
                                      isMe
                                        ? 'bg-hajj-800/80 border-gold-400 text-slate-100'
                                        : 'bg-slate-100 border-hajj-600 text-slate-600'
                                    }`}
                                  >
                                    <p className="font-bold text-[8px] opacity-90 truncate">
                                      Membalas {msg.replyToSender || 'Pesan'}:
                                    </p>
                                    <p className="truncate opacity-80 text-[10px]">{msg.replyToText}</p>
                                  </div>
                                )}

                                <p className="whitespace-pre-wrap leading-relaxed text-xs break-words [overflow-wrap:anywhere] [word-break:break-word] hyphens-auto min-w-0 max-w-full select-text">
                                  {msg.message}
                                </p>

                                {/* Read Receipt & Delivery Indicator */}
                                {isMe && (
                                  <div className="mt-0.5 flex items-center justify-end space-x-1 text-[8px] text-emerald-200/90 shrink-0">
                                    <i className={`fa-solid ${readCount > 0 ? 'fa-check-double text-gold-300' : 'fa-check'}`}></i>
                                    <span>
                                      {activeChannel.type === 'DIRECT'
                                        ? readCount > 0
                                          ? 'Dibaca'
                                          : 'Terkirim'
                                        : readCount > 0
                                        ? `Dibaca ${readCount}`
                                        : 'Terkirim'}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Reply Button */}
                              <button
                                type="button"
                                onClick={() => {
                                  setReplyingTo(msg);
                                  inputRef.current?.focus();
                                }}
                                className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-400 hover:text-hajj-700 hover:bg-slate-200/60 rounded-md text-[10px] transition cursor-pointer shrink-0"
                                title="Balas pesan ini"
                              >
                                <i className="fa-solid fa-reply"></i>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}

                    {/* Real-Time Typing Indicator */}
                    {currentChannelTyping && currentChannelTyping.userId !== currentUser.id && (
                      <div className="flex items-center space-x-2 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl w-fit animate-pulse">
                        <span className="flex space-x-1">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce"></span>
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce delay-75"></span>
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce delay-150"></span>
                        </span>
                        <span className="font-semibold">
                          {currentChannelTyping.userName} sedang mengetik pesan...
                        </span>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>

                  {/* Quick Operational Templates Bar */}
                  {showQuickTemplates && (
                    <div className="px-3 py-2 bg-slate-100 border-t border-slate-200 space-y-1.5 max-h-36 overflow-y-auto">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-600">
                        <span>Template Pesan Cepat Operasional:</span>
                        <button
                          type="button"
                          onClick={() => setShowQuickTemplates(false)}
                          className="text-slate-400 hover:text-slate-700"
                        >
                          <i className="fa-solid fa-xmark"></i>
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_OPERATIONAL_TEMPLATES.map((tpl, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setMessageInput(tpl);
                              setShowQuickTemplates(false);
                              inputRef.current?.focus();
                            }}
                            className="text-left text-[10px] bg-white hover:bg-hajj-50 text-slate-700 hover:text-hajj-800 border border-slate-200 hover:border-hajj-300 px-2.5 py-1 rounded-lg transition cursor-pointer"
                          >
                            {tpl}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Replying To Banner */}
                  {replyingTo && (
                    <div className="px-3 py-2 bg-hajj-50 border-t border-hajj-200 flex items-center justify-between text-xs">
                      <div className="min-w-0 flex-1 pr-2 border-l-2 border-hajj-700 pl-2">
                        <p className="text-[10px] font-bold text-hajj-800">
                          Membalas {replyingTo.senderName} ({replyingTo.senderRole})
                        </p>
                        <p className="text-[11px] text-slate-600 truncate">{replyingTo.message}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReplyingTo(null)}
                        className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                        title="Batalkan balasan"
                      >
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </div>
                  )}

                  {/* Message Input Form */}
                  <form onSubmit={handleSend} className="p-2 sm:p-2.5 bg-white border-t border-slate-200 space-y-1.5 shrink-0">
                    <div className="flex items-center justify-between text-[10px] px-0.5">
                      <div className="flex items-center space-x-2.5">
                        {isCurrentUserManager && (
                          <label className="flex items-center space-x-1 text-slate-700 font-medium cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isOfficialInstruction}
                              onChange={e => setIsOfficialInstruction(e.target.checked)}
                              className="w-3.5 h-3.5 rounded text-hajj-700 focus:ring-hajj-600"
                            />
                            <span>Arahan Pimpinan</span>
                          </label>
                        )}
                        <label className="flex items-center space-x-1 text-red-700 font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isUrgent}
                            onChange={e => setIsUrgent(e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-red-600 focus:ring-red-500"
                          />
                          <span>Penting / Urgent</span>
                        </label>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowQuickTemplates(prev => !prev)}
                        className="text-[10px] font-bold text-hajj-700 hover:text-hajj-800 flex items-center space-x-1 cursor-pointer"
                      >
                        <i className="fa-solid fa-bolt text-amber-500 text-[9px]"></i>
                        <span>Pesan Cepat</span>
                      </button>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <input
                        ref={inputRef}
                        type="text"
                        placeholder={
                          activeChannel.type === 'DIRECT'
                            ? `Pesan pribadi ke ${getChannelDisplayName(activeChannel)}...`
                            : `Pesan ke ${getChannelDisplayName(activeChannel)}...`
                        }
                        value={messageInput}
                        onChange={handleInputChange}
                        className="flex-1 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-hajj-600 focus:bg-white focus:outline-none text-slate-900 placeholder:text-slate-400 min-w-0"
                      />
                      <button
                        type="submit"
                        disabled={!messageInput.trim()}
                        className="px-3 py-1.5 bg-hajj-700 hover:bg-hajj-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-2xs transition flex items-center justify-center cursor-pointer shrink-0"
                        title="Kirim Pesan (Enter)"
                      >
                        <i className="fa-solid fa-paper-plane text-xs"></i>
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                /* ================= CHANNEL LIST & ONLINE COLLEAGUES VIEW ================= */
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
                  {/* Active Officers Horizontal Quick-Chat Strip */}
                  <div className="px-3 pt-2.5 pb-2 bg-white border-b border-slate-200 shrink-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>Klik Akun untuk Chat Pribadi 2 Arah ({onlineColleaguesCount} Aktif)</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsNewChatModalOpen(true)}
                        className="text-[10px] font-bold text-hajj-700 hover:underline cursor-pointer"
                      >
                        Lihat Semua ({otherColleagues.length})
                      </button>
                    </div>
                    <div className="flex items-center space-x-2 overflow-x-auto pb-1 custom-scrollbar">
                      {otherColleagues.map(colleague => {
                        const online = isUserOnline(colleague.id);
                        const dmChannelId = getDirectChannelId(currentUser.id, colleague.id);
                        const unreadDm = getChannelUnread(dmChannelId);

                        return (
                          <button
                            key={colleague.id}
                            type="button"
                            onClick={() => handleStartDirectChat(colleague)}
                            className="flex flex-col items-center min-w-[58px] max-w-[64px] p-1 rounded-xl hover:bg-hajj-50 transition cursor-pointer group shrink-0 relative"
                            title={`Chat Pribadi dengan ${colleague.fullName} (${colleague.role}) - ${online ? 'Sedang Aktif' : 'Offline'}`}
                          >
                            <div className="relative">
                              <div
                                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs border shadow-2xs transition group-hover:scale-105 ${
                                  online
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
                                {colleague.fullName.substring(0, 2).toUpperCase()}
                              </div>
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
                                  online ? 'bg-emerald-500' : 'bg-slate-300'
                                }`}
                              />
                              {unreadDm > 0 && (
                                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black px-1.5 rounded-full ring-1 ring-white">
                                  {unreadDm}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-semibold text-slate-700 group-hover:text-hajj-800 truncate w-full text-center mt-1">
                              {colleague.fullName.split(' ')[0]}
                            </span>
                            <span className="text-[8px] text-slate-400 truncate w-full text-center">
                              {colleague.role}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Search & Filter Tabs */}
                  <div className="p-2 sm:p-2.5 bg-white border-b border-slate-200 space-y-1.5 shrink-0">
                    <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200/80">
                      <button
                        type="button"
                        onClick={() => setChatSubFilter('ALL')}
                        className={`flex-1 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer flex items-center justify-center space-x-1 ${
                          chatSubFilter === 'ALL'
                            ? 'bg-white text-hajj-800 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span>Semua</span>
                        {unreadTotalCount > 0 && (
                          <span className="bg-red-500 text-white text-[8px] px-1.5 py-0.1 rounded-full font-black">
                            {unreadTotalCount}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setChatSubFilter('GROUP')}
                        className={`flex-1 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer flex items-center justify-center space-x-1 ${
                          chatSubFilter === 'GROUP'
                            ? 'bg-white text-hajj-800 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <i className="fa-solid fa-users text-[9px]"></i>
                        <span>Grup ({accessibleChannels.filter(c => c.type === 'GROUP').length})</span>
                        {groupUnreadTotal > 0 && (
                          <span className="bg-red-500 text-white text-[8px] px-1.5 py-0.1 rounded-full font-black">
                            {groupUnreadTotal}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setChatSubFilter('DIRECT')}
                        className={`flex-1 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer flex items-center justify-center space-x-1 ${
                          chatSubFilter === 'DIRECT'
                            ? 'bg-white text-hajj-800 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <i className="fa-solid fa-user-group text-[9px]"></i>
                        <span>Pribadi ({accessibleChannels.filter(c => c.type === 'DIRECT').length})</span>
                        {directUnreadTotal > 0 && (
                          <span className="bg-red-500 text-white text-[8px] px-1.5 py-0.1 rounded-full font-black">
                            {directUnreadTotal}
                          </span>
                        )}
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Cari saluran atau rekan..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-7 pr-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-hajj-600 focus:bg-white focus:outline-none text-slate-800 placeholder:text-slate-400"
                      />
                      <i className="fa-solid fa-magnifying-glass absolute left-2 top-2 text-slate-400 text-[10px]"></i>
                    </div>
                  </div>

                  {/* Channels List */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-2 sm:p-2.5 space-y-1.5 min-w-0">
                    {filteredChannels.length === 0 ? (
                      <div className="text-center py-6 px-3 text-slate-400 space-y-1.5">
                        <p className="text-xs">Belum ada percakapan pada kategori ini.</p>
                        <button
                          type="button"
                          onClick={() => setIsNewChatModalOpen(true)}
                          className="px-2.5 py-1 bg-hajj-700 text-white rounded-lg text-xs font-bold shadow-2xs cursor-pointer"
                        >
                          + Mulai Chat Pribadi Baru
                        </button>
                      </div>
                    ) : (
                      filteredChannels.map(channel => {
                        const unread = getChannelUnread(channel.id);
                        const partner =
                          channel.type === 'DIRECT' ? getDirectChatPartner(channel) : undefined;
                        const online = partner ? isUserOnline(partner.id) : false;
                        const groupMembers =
                          channel.type === 'GROUP' ? getGroupMembers(channel) : [];
                        const groupOnlineCount =
                          channel.type === 'GROUP'
                            ? groupMembers.filter(u => isUserOnline(u.id)).length
                            : 0;
                        const displayName = getChannelDisplayName(channel);
                        const subtitle = getChannelSubtitle(channel);

                        return (
                          <button
                            key={channel.id}
                            type="button"
                            onClick={() => openChat(channel.id)}
                            className={`w-full text-left p-2 sm:p-2.5 bg-white hover:bg-hajj-50/60 border rounded-xl transition flex items-center justify-between group cursor-pointer shadow-2xs min-w-0 ${
                              unread > 0
                                ? 'border-hajj-400 bg-hajj-50/30'
                                : 'border-slate-200'
                            }`}
                          >
                            <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                              <div className="relative shrink-0">
                                <div
                                  className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs border ${
                                    channel.type === 'DIRECT'
                                      ? 'bg-blue-100 text-blue-800 border-blue-200'
                                      : 'bg-hajj-100 text-hajj-800 border-hajj-200'
                                  }`}
                                >
                                  {channel.type === 'DIRECT' ? (
                                    partner ? (
                                      partner.fullName.substring(0, 2).toUpperCase()
                                    ) : (
                                      'DM'
                                    )
                                  ) : (
                                    <i className={`fa-solid ${channel.icon || 'fa-users'} text-[11px]`}></i>
                                  )}
                                </div>
                                {channel.type === 'DIRECT' && (
                                  <span
                                    className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-1.5 ring-white ${
                                      online ? 'bg-emerald-500' : 'bg-slate-300'
                                    }`}
                                  />
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center space-x-1.5 min-w-0">
                                    <span className="font-bold text-slate-900 text-xs group-hover:text-hajj-700 truncate">
                                      {displayName}
                                    </span>
                                    <span
                                      className={`text-[8px] font-bold px-1.5 py-0.1 rounded shrink-0 ${
                                        channel.type === 'DIRECT'
                                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      }`}
                                    >
                                      {channel.type === 'DIRECT' ? 'Pribadi' : `${groupOnlineCount} Aktif`}
                                    </span>
                                  </div>
                                  {channel.lastMessageTime && (
                                    <span className="text-[9px] text-slate-400 font-mono shrink-0">
                                      {channel.lastMessageTime}
                                    </span>
                                  )}
                                </div>

                                <p className="text-[9px] text-slate-400 truncate">{subtitle}</p>
                                <p
                                  className={`text-[10px] truncate mt-0.5 ${
                                    unread > 0 ? 'font-bold text-slate-900' : 'text-slate-500'
                                  }`}
                                >
                                  {channel.lastMessage || 'Belum ada pesan — klik untuk mulai obrolan'}
                                </p>
                              </div>
                            </div>

                            {unread > 0 && (
                              <span className="ml-1.5 bg-red-500 text-white font-black px-1.5 py-0.2 rounded-full text-[9px] shrink-0 shadow-2xs">
                                {unread}
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Mobile Bottom Close Action Bar */}
                  <div className="sm:hidden p-1.5 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 shrink-0">
                    <button
                      type="button"
                      onClick={closeChat}
                      className="w-full py-1.5 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-lg text-[11px] transition flex items-center justify-center space-x-1.5 shadow-2xs border border-slate-200 dark:border-slate-600 cursor-pointer"
                    >
                      <i className="fa-solid fa-chevron-down text-[10px]"></i>
                      <span>Tutup Panel Chat</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ================= MODAL: NEW DIRECT CHAT (PILIH AKUN REKAN KERJA) ================= */}
      {isNewChatModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-[92vw] sm:w-[380px] overflow-hidden border border-slate-200 flex flex-col max-h-[76vh]">
            <div className="p-3 bg-hajj-800 text-white flex items-center justify-between border-b border-gold-500/25">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-gold-500 text-hajj-950 flex items-center justify-center font-bold text-xs">
                  <i className="fa-solid fa-user-plus"></i>
                </div>
                <div>
                  <h4 className="font-bold text-xs text-white">Mulai Chat Pribadi (2 Arah)</h4>
                  <p className="text-[10px] text-slate-300">
                    Pilih akun rekan untuk pesan personal
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsNewChatModalOpen(false)}
                className="text-slate-300 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="p-3 border-b border-slate-200 bg-slate-50">
              <div className="relative">
                <input
                  type="text"
                  value={newChatSearch}
                  onChange={e => setNewChatSearch(e.target.value)}
                  placeholder="Cari nama petugas, jabatan, atau divisi..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-hajj-600 text-slate-800"
                />
                <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-2.5 text-slate-400 text-xs"></i>
              </div>
            </div>

            <div className="p-3 overflow-y-auto custom-scrollbar flex-1 space-y-1.5">
              {otherColleagues
                .filter(u => {
                  if (!newChatSearch.trim()) return true;
                  const q = newChatSearch.toLowerCase();
                  return (
                    String(u.fullName || '').toLowerCase().includes(q) ||
                    String(u.role || '').toLowerCase().includes(q) ||
                    String(u.department || '').toLowerCase().includes(q)
                  );
                })
                .map(u => {
                  const online = isUserOnline(u.id);
                  const activeSess = getUserActiveSession(u.id);

                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleStartDirectChat(u)}
                      className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:bg-hajj-50 hover:border-hajj-300 transition flex items-center justify-between text-xs cursor-pointer group"
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className="relative shrink-0">
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${
                              online
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-slate-100 text-slate-800 border border-slate-200'
                            }`}
                          >
                            {u.fullName.substring(0, 2).toUpperCase()}
                          </div>
                          <span
                            className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
                              online ? 'bg-emerald-500' : 'bg-slate-300'
                            }`}
                          />
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-slate-900 block group-hover:text-hajj-700 truncate">
                            {u.fullName}
                          </span>
                          <span className="text-[10px] text-slate-500 block truncate">
                            {u.role} • {u.department || 'Operasional'}
                            {u.assignedBuilding ? ` (${u.assignedBuilding})` : ''}
                          </span>
                          {activeSess && (
                            <span className="text-[9px] text-emerald-700 font-semibold block">
                              Masuk shift: {activeSess.loginTime.split(' ')[1] || activeSess.loginTime} WIB
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end shrink-0 ml-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            online
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {online ? '● Aktif' : 'Offline'}
                        </span>
                        <span className="text-[9px] text-hajj-700 font-bold mt-1 group-hover:underline">
                          Kirim Pesan →
                        </span>
                      </div>
                    </button>
                  );
                })}
            </div>

            <div className="p-2.5 bg-slate-50 border-t border-slate-200 text-right">
              <button
                type="button"
                onClick={() => setIsNewChatModalOpen(false)}
                className="px-3.5 py-1.5 text-slate-600 hover:text-slate-900 text-xs font-bold cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: GROUP / PARTNER INFO & MEMBER DIRECTORY ================= */}
      {showGroupInfoModal && activeChannel && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 flex flex-col max-h-[80vh]">
            <div className="p-3.5 bg-hajj-800 text-white flex items-center justify-between border-b border-gold-500/25">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-gold-500 text-hajj-950 flex items-center justify-center font-bold text-xs shrink-0">
                  <i className={`fa-solid ${activeChannel.type === 'DIRECT' ? 'fa-user' : 'fa-users'}`}></i>
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-xs text-white truncate">
                    {getChannelDisplayName(activeChannel)}
                  </h4>
                  <p className="text-[10px] text-slate-300 truncate">
                    {activeChannel.type === 'DIRECT'
                      ? 'Informasi Akun Lawan Bicara'
                      : `${activeGroupOnlineMembers.length} Aktif dari ${activeGroupMembers.length} Anggota Grup`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowGroupInfoModal(false)}
                className="text-slate-300 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="p-3 overflow-y-auto custom-scrollbar flex-1 space-y-2">
              {activeGroupMembers.map(member => {
                const online = isUserOnline(member.id);
                const isSelf = member.id === currentUser.id;
                const activeSess = getUserActiveSession(member.id);

                return (
                  <div
                    key={member.id}
                    className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="relative shrink-0">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${
                            online
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {member.fullName.substring(0, 2).toUpperCase()}
                        </div>
                        <span
                          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
                            online ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 truncate">
                          {member.fullName} {isSelf && <span className="text-hajj-700">(Anda)</span>}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate">
                          {member.role} • {member.department || 'Operasional'}
                        </p>
                        {activeSess ? (
                          <div className="flex items-center space-x-1.5 mt-0.5">
                            <span className="text-[9px] text-emerald-800 bg-emerald-50 border border-emerald-200 font-semibold px-1.5 py-0.2 rounded font-mono">
                              Masuk {activeSess.loginTime.split(' ')[1] || activeSess.loginTime} WIB
                            </span>
                            <span className="text-[9px] text-emerald-900 font-bold bg-emerald-100/80 px-1.5 py-0.2 rounded border border-emerald-300 font-mono">
                              {formatSessionLiveDuration(activeSess.loginTime)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[9px] text-slate-400 block mt-0.5">
                            Belum ada sesi shift aktif
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSessionUser(member);
                          setShowPartnerSessionModal(true);
                        }}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[9.5px] font-bold transition cursor-pointer"
                        title="Lihat rincian rekap sesi kerja petugas ini"
                      >
                        <i className="fa-solid fa-clock-rotate-left text-[9px] text-blue-600 mr-1"></i>
                        <span>Sesi</span>
                      </button>

                      {!isSelf && (
                        <button
                          type="button"
                          onClick={() => handleStartDirectChat(member)}
                          className="px-2.5 py-1 bg-hajj-700 hover:bg-hajj-800 text-white rounded-lg text-[10px] font-bold transition cursor-pointer flex items-center space-x-1 shadow-2xs"
                          title={`Kirim pesan pribadi 2 arah ke ${member.fullName}`}
                        >
                          <i className="fa-solid fa-comment-dots text-[9px]"></i>
                          <span className="hidden sm:inline">Chat</span>
                        </button>
                      )}
                      {isSelf && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          ● Anda
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setShowGroupInfoModal(false);
                  setActiveTab('other');
                  closeChat();
                }}
                className="text-hajj-800 hover:text-hajj-900 text-xs font-bold flex items-center space-x-1.5 hover:underline cursor-pointer"
              >
                <i className="fa-solid fa-business-time text-xs text-hajj-700"></i>
                <span>Buka Rekap Sesi dan Jam Lengkap</span>
              </button>
              <button
                type="button"
                onClick={() => setShowGroupInfoModal(false)}
                className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: CLEAR HISTORY ================= */}
      {showClearConfirmModal && activeChannel && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-4 border border-slate-200 space-y-3">
            <div className="flex items-center space-x-2 text-amber-600">
              <i className="fa-solid fa-triangle-exclamation text-lg"></i>
              <h4 className="font-bold text-sm text-slate-900">Bersihkan Riwayat Obrolan?</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Semua pesan dalam saluran <strong>"{getChannelDisplayName(activeChannel)}"</strong> akan dihapus secara real-time.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowClearConfirmModal(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  clearChatHistory(activeChannel.id);
                  setShowClearConfirmModal(false);
                  showToast('Riwayat obrolan berhasil dibersihkan.', 'info');
                }}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
              >
                Bersihkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: REKAP SESI & JAM PETUGAS ================= */}
      {showPartnerSessionModal && selectedSessionUser && (() => {
        const online = isUserOnline(selectedSessionUser.id);
        const userSess = getUserActiveSession(selectedSessionUser.id);
        const isSelf = selectedSessionUser.id === currentUser.id;

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-[92vw] sm:w-[390px] overflow-hidden border border-slate-200 flex flex-col max-h-[82vh]">
              {/* Modal Top Header */}
              <div className="p-3.5 bg-hajj-800 text-white flex items-center justify-between border-b border-gold-500/25">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-gold-500 text-hajj-950 flex items-center justify-center font-bold text-xs shrink-0 shadow">
                    <i className="fa-solid fa-business-time"></i>
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-xs text-white truncate">
                      Rekap Sesi &amp; Jam Petugas
                    </h4>
                    <p className="text-[10px] text-slate-300 truncate">
                      Status kehadiran real-time &amp; sinkronisasi database
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPartnerSessionModal(false)}
                  className="text-slate-300 hover:text-white p-1 rounded-lg cursor-pointer"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-3.5 overflow-y-auto custom-scrollbar flex-1 space-y-3 bg-slate-50">
                {/* Officer Profile Card */}
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center space-x-3">
                  <div className="relative shrink-0">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-sm border shadow-xs ${
                        online
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {selectedSessionUser.fullName.substring(0, 2).toUpperCase()}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white ${
                        online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
                      }`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-1.5">
                      <h5 className="font-bold text-slate-900 text-xs truncate">
                        {selectedSessionUser.fullName}
                      </h5>
                      {isSelf && (
                        <span className="px-1.5 py-0.2 bg-gold-500 text-slate-950 font-black rounded text-[8.5px]">
                          ANDA
                        </span>
                      )}
                    </div>
                    <p className="text-[10.5px] text-slate-500 truncate">
                      {selectedSessionUser.role} • {selectedSessionUser.department || 'Operasional'}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                      Username / NIP: {selectedSessionUser.username}
                    </p>
                  </div>
                </div>

                {/* Duty Session Card */}
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
                      <i className="fa-solid fa-clock-rotate-left text-blue-600"></i>
                      <span>Rekap Sesi Shift Aktif</span>
                    </span>
                    <span
                      className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full ${
                        online
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}
                    >
                      {online ? '● Sedang Bertugas' : '○ Offline / Non-Aktif'}
                    </span>
                  </div>

                  {userSess ? (
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 text-[11px]">ID Sesi:</span>
                        <span className="font-mono font-bold text-slate-800 text-[11px]">
                          #{userSess.id}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 text-[11px]">Jam Masuk Shift:</span>
                        <span className="font-bold text-slate-900 text-[11px] font-mono">
                          {userSess.loginTime.split(' ')[1] || userSess.loginTime} WIB
                        </span>
                      </div>
                      <div className="flex items-center justify-between bg-emerald-50/70 p-2 rounded-lg border border-emerald-200/80">
                        <span className="text-emerald-800 font-bold text-[11px] flex items-center space-x-1.5">
                          <i className="fa-solid fa-stopwatch text-emerald-600 animate-spin"></i>
                          <span>Durasi Berjalan:</span>
                        </span>
                        <span className="font-mono font-black text-emerald-800 text-xs">
                          {formatSessionLiveDuration(userSess.loginTime)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 text-[11px]">Penugasan Gedung:</span>
                        <span className="font-semibold text-slate-800 text-[11px]">
                          {selectedSessionUser.assignedBuilding || 'Semua Gedung (Umum)'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-3 text-center space-y-1 text-slate-400">
                      <i className="fa-regular fa-clock text-lg text-slate-300"></i>
                      <p className="text-[11px] text-slate-500 font-medium">
                        Petugas ini belum memulai sesi shift tugas baru hari ini.
                      </p>
                      <p className="text-[9.5px] text-slate-400">
                        Sesi akan otomatis tercatat saat petugas login ke sistem.
                      </p>
                    </div>
                  )}
                </div>

                {/* Database & Google Spreadsheet Guarantee */}
                <div className="bg-gradient-to-r from-emerald-50 to-blue-50 p-2.5 rounded-xl border border-emerald-200/60 text-[10px] space-y-1">
                  <div className="flex items-center space-x-1.5 text-emerald-800 font-bold">
                    <i className="fa-solid fa-shield-check text-xs text-emerald-600"></i>
                    <span>Database Google Spreadsheet &amp; Real-Time SSE</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed text-[9.5px]">
                    Riwayat obrolan pesan 2 arah dan rekap jam kerja petugas tersimpan permanen di basis data Google Spreadsheet (lembar <code className="text-emerald-700 font-bold">work_sessions</code> &amp; <code className="text-emerald-700 font-bold">chat_messages</code>).
                  </p>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-3 bg-white border-t border-slate-200 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPartnerSessionModal(false);
                    setActiveTab('other');
                    closeChat();
                  }}
                  className="px-2.5 py-1.5 text-blue-700 hover:text-blue-800 text-xs font-bold flex items-center space-x-1.5 hover:underline cursor-pointer"
                  title="Lihat riwayat seluruh shift dan jam kerja"
                >
                  <i className="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                  <span>Menu Rekap Lengkap</span>
                </button>

                <div className="flex items-center space-x-1.5">
                  {!isSelf && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowPartnerSessionModal(false);
                        handleStartDirectChat(selectedSessionUser);
                      }}
                      className="px-3 py-1.5 bg-hajj-700 hover:bg-hajj-800 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-2xs cursor-pointer"
                    >
                      <i className="fa-solid fa-comment-dots text-xs"></i>
                      <span>Chat Pribadi</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowPartnerSessionModal(false)}
                    className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold cursor-pointer"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
