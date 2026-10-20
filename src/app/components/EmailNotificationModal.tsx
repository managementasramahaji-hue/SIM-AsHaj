// @ts-nocheck
import React, { useState } from 'react';
import { useAppContext } from '../store';
import { EmailNotificationItem } from '../types';
import { formatIndonesianDate } from '../lib/utils';
import { useBodyScrollLock } from '../lib/scrollLock';

interface EmailNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedEmailId?: string;
}

export function EmailNotificationModal({ isOpen, onClose, selectedEmailId }: EmailNotificationModalProps) {
  const { 
    emailNotifications = [], 
    markEmailAsRead, 
    clearEmailHistory, 
    sendMaintenanceEmail,
    maintenances = [],
    currentUser
  } = useAppContext();

  const [activeFilter, setActiveFilter] = useState<'ALL' | 'URGENT' | 'COMPLETED'>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(selectedEmailId || null);
  const [previewMode, setPreviewMode] = useState<'RENDER' | 'METADATA'>('RENDER');

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  const filteredList = emailNotifications.filter(item => {
    if (activeFilter === 'URGENT') return item.eventType === 'URGENT_MAINTENANCE';
    if (activeFilter === 'COMPLETED') return item.eventType === 'MAINTENANCE_COMPLETED';
    return true;
  });

  const activeEmail: EmailNotificationItem | undefined = 
    emailNotifications.find(e => e.id === selectedId) || filteredList[0];

  const handleSelectEmail = (item: EmailNotificationItem) => {
    setSelectedId(item.id);
    if (item.status === 'TERKIRIM') {
      markEmailAsRead(item.id);
    }
  };

  const handleTestSendUrgent = () => {
    const sampleMaint = maintenances.find(m => m.urgency === 'Urgent') || maintenances[0] || {
      id: `MNT-${Date.now().toString().slice(-4)}`,
      roomId: 'room-A-101',
      roomNumber: 'A-101',
      building: 'Gedung A (Arafah)',
      category: 'AC & Pendingin Udara',
      urgency: 'Urgent',
      description: 'AC kamar mati total dan terjadi kebocoran air di atas tempat tidur jemaah.',
      reportTime: new Date().toISOString(),
      status: 'MENUNGGU_PENUGASAN',
      reportedUser: currentUser?.username || 'admin',
      reportedBy: currentUser?.fullName || 'Petugas Resepsionis'
    };

    sendMaintenanceEmail({
      maintenance: sampleMaint,
      eventType: 'URGENT_MAINTENANCE',
      currentUser
    });
  };

  const handleTestSendCompleted = () => {
    const sampleMaint = maintenances.find(m => m.status === 'SELESAI') || maintenances[0] || {
      id: `MNT-${Date.now().toString().slice(-4)}`,
      roomId: 'room-B-205',
      roomNumber: 'B-205',
      building: 'Gedung B (Muzdalifah)',
      category: 'Sanitasi & Pipa Air',
      urgency: 'Standar',
      description: 'Kran wastafel bocor dan pipa pembuangan tersumbat.',
      reportTime: new Date().toISOString(),
      status: 'SELESAI',
      reportedUser: currentUser?.username || 'admin',
      reportedBy: currentUser?.fullName || 'Petugas QC',
      assignedTechnicianName: 'Suryanto (Teknisi Sanitasi)',
      technicianNotes: 'Pipa pembuangan diganti baru, kran wastafel dipasang seal baru. Uji alir normal dan lolos QC.'
    };

    sendMaintenanceEmail({
      maintenance: { ...sampleMaint, status: 'SELESAI' },
      eventType: 'MAINTENANCE_COMPLETED',
      currentUser,
      technicianNotes: sampleMaint.technicianNotes || 'Pekerjaan perbaikan selesai dilaksanakan sesuai standar operasional.'
    });
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-5 py-4 text-white flex items-center justify-between border-b border-indigo-500/20 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 flex items-center justify-center text-lg shadow-inner">
              <i className="fa-solid fa-envelope-circle-check"></i>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-extrabold text-sm sm:text-base text-white">Sistem Notifikasi Email Manajer Teknisi</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Otomatis Aktif
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Pengiriman surat elektronik instan ke Manajer Teknisi saat status tiket: <strong>Mendesak (Urgent)</strong> atau <strong>Tuntas (Selesai)</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer text-sm"
              title="Tutup"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        {/* Toolbar & Test Actions */}
        <div className="p-3 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 text-xs shrink-0">
          <div className="flex items-center space-x-1.5 bg-white p-1 rounded-xl border border-slate-300 shadow-2xs">
            <button
              type="button"
              onClick={() => setActiveFilter('ALL')}
              className={`px-3 py-1 rounded-lg font-bold transition ${activeFilter === 'ALL' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              Semua ({emailNotifications.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('URGENT')}
              className={`px-3 py-1 rounded-lg font-bold transition flex items-center space-x-1 ${activeFilter === 'URGENT' ? 'bg-red-600 text-white shadow-xs' : 'text-red-700 hover:bg-red-50'}`}
            >
              <i className="fa-solid fa-triangle-exclamation text-[10px]"></i>
              <span>Darurat / Urgent ({emailNotifications.filter(e => e.eventType === 'URGENT_MAINTENANCE').length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('COMPLETED')}
              className={`px-3 py-1 rounded-lg font-bold transition flex items-center space-x-1 ${activeFilter === 'COMPLETED' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-700 hover:bg-emerald-50'}`}
            >
              <i className="fa-solid fa-circle-check text-[10px]"></i>
              <span>Selesai Perbaikan ({emailNotifications.filter(e => e.eventType === 'MAINTENANCE_COMPLETED').length})</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleTestSendUrgent}
              className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-lg font-bold text-xs flex items-center space-x-1 transition cursor-pointer shadow-2xs"
              title="Kirim email simulasi untuk tiket Urgent"
            >
              <i className="fa-solid fa-paper-plane text-rose-600"></i>
              <span>Test Email Urgent</span>
            </button>
            <button
              type="button"
              onClick={handleTestSendCompleted}
              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg font-bold text-xs flex items-center space-x-1 transition cursor-pointer shadow-2xs"
              title="Kirim email simulasi untuk perbaikan Selesai"
            >
              <i className="fa-solid fa-paper-plane text-emerald-600"></i>
              <span>Test Email Selesai</span>
            </button>
            {emailNotifications.length > 0 && (
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                title="Hapus semua arsip notifikasi"
              >
                <i className="fa-solid fa-trash-can text-sm"></i>
              </button>
            )}
          </div>
        </div>

        {/* Modal Main Body (2 Columns) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-50 min-h-0">
          {/* Column 1: Outbox List */}
          <div className="w-full md:w-80 lg:w-96 border-r border-slate-200 bg-white flex flex-col overflow-hidden shrink-0">
            <div className="p-3 border-b border-slate-100 text-[11px] font-bold text-slate-500 bg-slate-50 flex items-center justify-between">
              <span>DAFTAR SURAT TERKIRIM</span>
              <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded-full text-slate-700">
                {filteredList.length} Arsip
              </span>
            </div>

            <div className="overflow-y-auto flex-1 divide-y divide-slate-100 custom-scrollbar">
              {filteredList.length === 0 ? (
                <div className="p-8 text-center text-slate-400 space-y-2">
                  <i className="fa-solid fa-inbox text-3xl text-slate-300"></i>
                  <p className="text-xs font-semibold">Belum ada surat notifikasi email pada filter ini.</p>
                  <p className="text-[11px] text-slate-400">Klik tombol "Test Email" di atas atau ubah status tiket maintenance.</p>
                </div>
              ) : (
                filteredList.map((item) => {
                  const isSelected = activeEmail?.id === item.id;
                  const isUrgent = item.eventType === 'URGENT_MAINTENANCE';

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectEmail(item)}
                      className={`p-3.5 transition cursor-pointer text-left border-l-4 ${
                        isSelected 
                          ? (isUrgent ? 'bg-red-50/70 border-l-red-600' : 'bg-emerald-50/70 border-l-emerald-600') 
                          : (isUrgent ? 'border-l-red-400 hover:bg-slate-50' : 'border-l-emerald-400 hover:bg-slate-50')
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5 mb-1">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                          isUrgent ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}>
                          {isUrgent ? '🚨 URGENT' : '✅ SELESAI'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(item.sentAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                        </span>
                      </div>

                      <h4 className="font-bold text-xs text-slate-900 leading-snug line-clamp-1">
                        Kamar {item.roomNumber} ({item.category})
                      </h4>
                      <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                        {item.previewText}
                      </p>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 pt-1 border-t border-slate-100">
                        <span className="truncate">Kepada: {item.recipientName}</span>
                        <span className="font-mono text-[9px]">#{item.id}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Column 2: Email Previewer */}
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-100">
            {activeEmail ? (
              <>
                {/* Email Viewer Header */}
                <div className="p-3.5 bg-white border-b border-slate-200 shadow-2xs space-y-2 shrink-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Subjek Surat Elektronik</span>
                      <h3 className="font-extrabold text-sm sm:text-base text-slate-900 leading-snug">
                        {activeEmail.subject}
                      </h3>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={() => setPreviewMode(previewMode === 'RENDER' ? 'METADATA' : 'RENDER')}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg border border-slate-300 transition"
                      >
                        <i className={`fa-solid ${previewMode === 'RENDER' ? 'fa-code' : 'fa-desktop'} mr-1`}></i>
                        <span>{previewMode === 'RENDER' ? 'Lihat Detail Teknis' : 'Tampilan Desain Email'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Recipient & Metadata Strip */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Penerima Resmi:</span>
                      <strong className="text-slate-800 text-[11px] block">{activeEmail.recipientName}</strong>
                      <span className="text-[10px] text-slate-500 font-mono truncate block">{activeEmail.recipientEmail}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Jabatan / Role:</span>
                      <strong className="text-indigo-900 text-[11px] block">{activeEmail.recipientRole}</strong>
                      <span className="text-[10px] text-slate-500">Divisi Sarana &amp; Prasarana UPT</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Waktu Kirim:</span>
                      <strong className="text-slate-800 text-[11px] block">
                        {formatIndonesianDate(activeEmail.sentAt.split('T')[0])}
                      </strong>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(activeEmail.sentAt).toLocaleTimeString('id-ID')} WIB (Terkirim Otomatis)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Email Viewer Body */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                  {previewMode === 'RENDER' ? (
                    <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                      <div 
                        dangerouslySetInnerHTML={{ __html: activeEmail.htmlBody }} 
                      />
                    </div>
                  ) : (
                    <div className="max-w-2xl mx-auto bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4 text-xs">
                      <h4 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">
                        Parameter Metadata Email Notifikasi
                      </h4>
                      <div className="space-y-2">
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">ID Pengiriman:</span>
                          <span className="font-mono font-bold text-slate-800">{activeEmail.id}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Tipe Peristiwa:</span>
                          <span className="font-bold text-slate-800">{activeEmail.eventType}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">ID Tiket Maintenance:</span>
                          <span className="font-mono font-bold text-slate-800">#{activeEmail.maintenanceId}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Fasilitas / Lokasi:</span>
                          <span className="font-bold text-slate-800">Kamar {activeEmail.roomNumber} ({activeEmail.building})</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Kategori / Urgensi:</span>
                          <span className="font-bold text-slate-800">{activeEmail.category} [{activeEmail.urgency}]</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Status Server Email:</span>
                          <span className="font-bold text-emerald-600">DELIVERED_SUCCESS (250 OK)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8 text-center text-slate-400">
                <div>
                  <i className="fa-solid fa-envelope-open-text text-4xl text-slate-300 mb-2"></i>
                  <p className="text-sm font-semibold">Pilih notifikasi email di sebelah kiri untuk melihat isi pesan.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Gateway Notifikasi Email SMTP Terhubung &amp; Siap Pakai</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition cursor-pointer shadow-xs"
          >
            Tutup Lembar Notifikasi
          </button>
        </div>
      </div>

      {showClearConfirm && (
        <div 
          className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setShowClearConfirm(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-4 text-center border border-rose-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center text-xl mx-auto border border-rose-200">
              <i className="fa-solid fa-trash-can"></i>
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-sm">Kosongkan Riwayat Notifikasi Email?</h4>
              <p className="text-xs text-slate-500 mt-1">
                Apakah Anda yakin ingin menghapus seluruh log dan arsip email notifikasi? Tindakan ini permanen.
              </p>
            </div>
            <div className="flex items-center justify-center space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  clearEmailHistory();
                  setShowClearConfirm(false);
                }}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-xs transition cursor-pointer"
              >
                Ya, Kosongkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
