// Email Notification Service for Maintenance System
// LodgingPro / UPT Asrama Haji Management System

import { Maintenance, User } from '../types';

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

const STORAGE_KEY = 'hajj_lodging_email_notifications';

export const DEFAULT_MANAGER_TEKNISI = {
  name: 'Ir. H. Bambang Sudirman, M.T.',
  email: 'manajer.teknisi@hajjlodging.kemenag.go.id',
  role: 'Manager Teknisi'
};

export function getEmailNotifications(): EmailNotificationItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveEmailNotifications(list: EmailNotificationItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to save email notifications', e);
  }
}

export function clearEmailNotificationHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear email notification history', e);
  }
}

export function markEmailNotificationAsRead(id: string): EmailNotificationItem[] {
  const list = getEmailNotifications();
  const updated = list.map(item => item.id === id ? { ...item, status: 'DIBACA' as const } : item);
  saveEmailNotifications(updated);
  return updated;
}

interface GenerateEmailParams {
  maintenance: Maintenance;
  eventType: 'URGENT_MAINTENANCE' | 'MAINTENANCE_COMPLETED';
  currentUser?: User | null;
  technicianNotes?: string;
  resolvedTime?: string;
  managerRecipient?: { name: string; email: string; role: string };
}

export function generateMaintenanceEmailHtml(params: GenerateEmailParams): { subject: string; previewText: string; html: string } {
  const { maintenance, eventType, currentUser, technicianNotes, resolvedTime, managerRecipient } = params;
  const recipient = managerRecipient || DEFAULT_MANAGER_TEKNISI;
  const now = new Date();
  const formattedDate = now.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const formattedTime = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit'
  }) + ' WIB';

  if (eventType === 'URGENT_MAINTENANCE') {
    const subject = `🚨 [URGENT] Tiket Perbaikan Mendesak: ${maintenance.roomNumber} (${maintenance.category}) - ${maintenance.building}`;
    const previewText = `Pemberitahuan darurat untuk Manager Teknisi: Kerusakan fasilitas mendesak di ${maintenance.roomNumber} butuh penanganan segera.`;

    const html = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; color: #1e293b; }
    .wrapper { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%); padding: 24px; color: #ffffff; text-align: center; }
    .badge { display: inline-block; background-color: #fef2f2; color: #991b1b; font-weight: 800; font-size: 11px; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; border: 1px solid #fecaca; }
    .title { font-size: 20px; font-weight: 800; margin: 0; line-height: 1.3; }
    .subtitle { font-size: 12px; opacity: 0.9; margin-top: 4px; }
    .content { padding: 24px; }
    .salutation { font-size: 14px; font-weight: 600; margin-bottom: 16px; color: #0f172a; }
    .alert-box { background-color: #fff1f2; border-left: 4px solid #e11d48; padding: 14px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 13px; color: #9f1239; line-height: 1.5; }
    .details-table { width: 100%; border-collapse: separate; border-spacing: 0; background-color: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; margin-bottom: 20px; }
    .details-table td { padding: 10px 14px; font-size: 13px; border-bottom: 1px solid #e2e8f0; }
    .details-table tr:last-child td { border-bottom: none; }
    .label { font-weight: 600; color: #64748b; width: 38%; }
    .value { font-weight: 700; color: #0f172a; }
    .btn-container { text-align: center; margin: 24px 0 16px; }
    .btn { display: inline-block; background-color: #dc2626; color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 13px; padding: 12px 28px; border-radius: 10px; box-shadow: 0 2px 4px rgba(220,38,38,0.2); }
    .footer { background-color: #f1f5f9; padding: 16px 24px; font-size: 11px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="badge">🚨 Peringatan Darurat (Urgent Action)</div>
      <h1 class="title">Tiket Maintenance Mendesak</h1>
      <div class="subtitle">UPT Asrama Haji • Sistem Koordinasi Sarana & Prasarana</div>
    </div>
    <div class="content">
      <div class="salutation">
        Yth. ${recipient.name}<br>
        <span style="font-size: 12px; color: #64748b; font-weight: normal;">${recipient.role} (${recipient.email})</span>
      </div>

      <div class="alert-box">
        <strong>PEMBERITAHUAN MENDESAK:</strong> Fasilitas berikut memerlukan penugasan atau tindakan cepat dari divisi teknisi agar tidak mengganggu operasional penginapan jemaah.
      </div>

      <table class="details-table">
        <tr>
          <td class="label">Nomor Tiket</td>
          <td class="value"><span style="font-family: monospace; background: #fee2e2; padding: 2px 6px; border-radius: 4px; color: #991b1b;">#${maintenance.id}</span></td>
        </tr>
        <tr>
          <td class="label">Lokasi Kamar / Unit</td>
          <td class="value"><span style="color: #b91c1c; font-size: 15px;">Kamar ${maintenance.roomNumber}</span> (${maintenance.building})</td>
        </tr>
        <tr>
          <td class="label">Kategori Kerusakan</td>
          <td class="value"><strong>${maintenance.category}</strong> (Prioritas: <span style="color: #dc2626; font-weight: 800;">URGENT</span>)</td>
        </tr>
        <tr>
          <td class="label">Rincian Kendala</td>
          <td class="value" style="color: #334155; font-style: italic;">"${maintenance.description || (maintenance as any).issue || 'Kendala operasional fasilitas'}"</td>
        </tr>
        <tr>
          <td class="label">Petugas Pelapor</td>
          <td class="value">${(params.maintenance as any).reportedBy || params.maintenance.reportedUser || params.currentUser?.fullName || 'Petugas Operasional'} (${(params.maintenance as any).reporterRole || params.currentUser?.role || 'Staf'})</td>
        </tr>
        <tr>
          <td class="label">Waktu Dilaporkan</td>
          <td class="value">${formattedDate}, pukul ${formattedTime}</td>
        </tr>
        <tr>
          <td class="label">Status Saat Ini</td>
          <td class="value"><span style="color: #ea580c; font-weight: 800;">MENUNGGU PENUGASAN TEKNISI</span></td>
        </tr>
      </table>

      <div class="btn-container">
        <span class="btn">🛠️ Buka Panel Manajemen Teknisi</span>
      </div>

      <p style="font-size: 12px; color: #64748b; text-align: center; margin: 0;">
        Harap segera menunjuk teknisi penanggung jawab melalui modul Manajemen Perawatan.
      </p>
    </div>

    <div class="footer">
      Email otomatis diterbitkan oleh Sistem Manajemen Penginapan Terpadu (LodgingPro).<br>
      Kementerian Agama Republik Indonesia • UPT Asrama Haji.
    </div>
  </div>
</body>
</html>
    `.trim();

    return { subject, previewText, html };
  } else {
    // MAINTENANCE_COMPLETED
    const subject = `✅ [SELESAI] Laporan Perbaikan Tuntas: ${maintenance.roomNumber} (${maintenance.category}) - Siap Huni`;
    const previewText = `Pemberitahuan penyelesaian untuk Manager Teknisi: Pekerjaan perbaikan di ${maintenance.roomNumber} telah selesai diperbaiki dan diverifikasi.`;

    const techName = maintenance.assignedTechnicianName || maintenance.technician || currentUser?.fullName || 'Teknisi Lapangan';
    const notes = technicianNotes || maintenance.technicianNotes || 'Pekerjaan perbaikan telah selesai dilaksanakan sesuai SOP.';
    const timeStr = resolvedTime || formattedDate + ', ' + formattedTime;

    const html = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; color: #1e293b; }
    .wrapper { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #047857 0%, #065f46 100%); padding: 24px; color: #ffffff; text-align: center; }
    .badge { display: inline-block; background-color: #ecfdf5; color: #065f46; font-weight: 800; font-size: 11px; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; border: 1px solid #a7f3d0; }
    .title { font-size: 20px; font-weight: 800; margin: 0; line-height: 1.3; }
    .subtitle { font-size: 12px; opacity: 0.9; margin-top: 4px; }
    .content { padding: 24px; }
    .salutation { font-size: 14px; font-weight: 600; margin-bottom: 16px; color: #0f172a; }
    .success-box { background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 14px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 13px; color: #166534; line-height: 1.5; }
    .details-table { width: 100%; border-collapse: separate; border-spacing: 0; background-color: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; margin-bottom: 20px; }
    .details-table td { padding: 10px 14px; font-size: 13px; border-bottom: 1px solid #e2e8f0; }
    .details-table tr:last-child td { border-bottom: none; }
    .label { font-weight: 600; color: #64748b; width: 38%; }
    .value { font-weight: 700; color: #0f172a; }
    .btn-container { text-align: center; margin: 24px 0 16px; }
    .btn { display: inline-block; background-color: #059669; color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 13px; padding: 12px 28px; border-radius: 10px; box-shadow: 0 2px 4px rgba(5,150,105,0.2); }
    .footer { background-color: #f1f5f9; padding: 16px 24px; font-size: 11px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="badge">✅ Laporan Pekerjaan Tuntas (Completed)</div>
      <h1 class="title">Fasilitas Berhasil Diperbaiki</h1>
      <div class="subtitle">UPT Asrama Haji • Sistem Koordinasi Sarana & Prasarana</div>
    </div>
    <div class="content">
      <div class="salutation">
        Yth. ${recipient.name}<br>
        <span style="font-size: 12px; color: #64748b; font-weight: normal;">${recipient.role} (${recipient.email})</span>
      </div>

      <div class="success-box">
        <strong>PEKERJAAN TUNTAS:</strong> Fasilitas di bawah ini telah selesai diperbaiki oleh teknisi lapangan dan telah dinyatakan lolos uji kelayakan/siap pakai kembali.
      </div>

      <table class="details-table">
        <tr>
          <td class="label">Nomor Tiket</td>
          <td class="value"><span style="font-family: monospace; background: #dcfce7; padding: 2px 6px; border-radius: 4px; color: #166534;">#${maintenance.id}</span></td>
        </tr>
        <tr>
          <td class="label">Lokasi Kamar / Unit</td>
          <td class="value"><span style="color: #047857; font-size: 15px;">Kamar ${maintenance.roomNumber}</span> (${maintenance.building})</td>
        </tr>
        <tr>
          <td class="label">Kategori Pekerjaan</td>
          <td class="value"><strong>${maintenance.category}</strong></td>
        </tr>
        <tr>
          <td class="label">Teknisi Pelaksana</td>
          <td class="value"><strong>${techName}</strong></td>
        </tr>
        <tr>
          <td class="label">Laporan Tindakan Teknisi</td>
          <td class="value" style="color: #334155;">"${notes}"</td>
        </tr>
        <tr>
          <td class="label">Waktu Penyelesaian</td>
          <td class="value">${timeStr}</td>
        </tr>
        <tr>
          <td class="label">Status Kamar</td>
          <td class="value"><span style="color: #059669; font-weight: 800;">LOLOS QC & SIAP HUNI (KOSONG)</span></td>
        </tr>
      </table>

      <div class="btn-container">
        <span class="btn">📋 Tinjau Arsip Laporan Perbaikan</span>
      </div>

      <p style="font-size: 12px; color: #64748b; text-align: center; margin: 0;">
        Data perbaikan ini telah dicatat otomatis ke dalam riwayat log audit UPT Asrama Haji.
      </p>
    </div>

    <div class="footer">
      Email otomatis diterbitkan oleh Sistem Manajemen Penginapan Terpadu (LodgingPro).<br>
      Kementerian Agama Republik Indonesia • UPT Asrama Haji.
    </div>
  </div>
</body>
</html>
    `.trim();

    return { subject, previewText, html };
  }
}

export function sendMaintenanceEmailNotification(params: GenerateEmailParams): EmailNotificationItem {
  const { subject, previewText, html } = generateMaintenanceEmailHtml(params);
  const recipient = params.managerRecipient || DEFAULT_MANAGER_TEKNISI;
  const now = new Date().toISOString();

  const newEmail: EmailNotificationItem = {
    id: `EML-${Date.now().toString().slice(-6)}`,
    recipientEmail: recipient.email,
    recipientName: recipient.name,
    recipientRole: recipient.role,
    subject,
    previewText,
    htmlBody: html,
    eventType: params.eventType,
    maintenanceId: params.maintenance.id,
    roomNumber: params.maintenance.roomNumber,
    building: params.maintenance.building,
    category: params.maintenance.category,
    urgency: params.maintenance.urgency,
    technicianName: params.maintenance.assignedTechnicianName || params.maintenance.technician || params.currentUser?.fullName,
    reportedBy: (params.maintenance as any).reportedBy || params.maintenance.reportedUser || params.currentUser?.fullName,
    sentAt: now,
    status: 'TERKIRIM'
  };

  const existing = getEmailNotifications();
  const updated = [newEmail, ...existing];
  saveEmailNotifications(updated);

  console.log(`[Email Dispatcher] Notifikasi otomatis berhasil dikirim ke: ${recipient.email} - Subjek: "${subject}"`);
  return newEmail;
}
