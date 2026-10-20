import React from 'react';
import { useAppContext, isSuperAdmin, isRecepRole } from '../store';
import { Transaction, Room } from '../types';
import { formatIndonesianDate, addDaysToDateStr, getRealTodayDate, formatRupiah, isMeetingFacility, normalizeBuildingName } from '../lib/utils';
import { useBodyScrollLock } from '../lib/scrollLock';

interface RoomDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string | null;
}

export const RoomDetailModal: React.FC<RoomDetailModalProps> = ({
  isOpen,
  onClose,
  roomId,
}) => {
  useBodyScrollLock(isOpen);
  const { 
    rooms, 
    transactions, 
    meetingRooms = [],
    currentUser, 
    openModal, 
    checkoutRoom, 
    activateCheckin, 
    cancelBooking,
    showToast 
  } = useAppContext();

  const canManageRooms = currentUser && (isSuperAdmin(currentUser.role) || currentUser.role === 'Admin' || isRecepRole(currentUser.role) || currentUser.role === 'Manager');

  const handleOpenGroupEdit = (tx: Transaction) => {
    onClose();
    const groupTxs = transactions.filter(t => t.groupId === tx.groupId);
    const roomIds = Array.from(new Set(groupTxs.map(t => t.roomId)));
    const firstTx = groupTxs[0] || tx;
    const meetingTx = groupTxs.find(t => 
      t.building === 'Ruang Pertemuan' || 
      t.building === 'Gedung Serbaguna (SG)' || 
      t.building === 'Gedung Serbaguna' || 
      isMeetingFacility(t.building) || 
      isMeetingFacility(t.roomNumber) ||
      Boolean(t.rentType?.toLowerCase().includes('serbaguna'))
    );
    
    openModal('modalGroupRegistration', {
      isEdit: true,
      editGroupId: tx.groupId,
      defaultGroupType: firstTx.groupType || 'INSTANSI',
      initialGroupName: firstTx.groupName || firstTx.guestName,
      initialPicName: firstTx.groupPic || firstTx.guestName,
      initialPicPhone: firstTx.groupPicPhone || firstTx.phone,
      initialMembers: firstTx.totalPax || groupTxs.length * 4,
      initialStartDate: firstTx.startDate,
      initialDuration: firstTx.duration,
      initialRoomIds: roomIds,
      initialAgencyOrDocument: firstTx.spkNumber || firstTx.kloter || '',
      initialCateringPackage: firstTx.cateringPackage || 'TIDAK',
      initialIncludeBreakfast: firstTx.breakfast,
      initialBreakfastPortions: firstTx.cateringPaxCount || firstTx.breakfastPortions || 0,
      initialIncludeAula: !!meetingTx,
      initialMeetingRoomId: meetingTx ? meetingTx.roomId : '',
      initialMeetingRoomSession: meetingTx ? meetingTx.rentAulaSession || 'Reguler 8 Jam' : 'Reguler 8 Jam',
      initialMeetingRoomDays: meetingTx ? meetingTx.duration : 1,
      initialStatusMode: firstTx.status === 'TERISI' ? 'TERISI' : 'BOOKED'
    });
  };

  if (!isOpen || !roomId) return null;

  let room = rooms.find(r => r.id === roomId) || rooms.find(r => r.roomNumber === roomId);
  if (!room && meetingRooms && meetingRooms.length > 0) {
    const mr = meetingRooms.find(m => m.id === roomId || m.name.toLowerCase() === roomId.toLowerCase());
    if (mr) {
      const isSG = mr.category === 'SERBAGUNA' || (mr.name || '').toLowerCase().includes('serbaguna');
      const targetBld = mr.building && mr.building !== 'Ruang Pertemuan' && mr.building !== 'Gedung Serbaguna' && mr.building !== 'Gedung Serbaguna (SG)'
        ? mr.building
        : (isSG ? 'Gedung Serbaguna (SG)' : 'Ruang Pertemuan');
      room = {
        id: mr.id,
        building: targetBld,
        roomNumber: mr.name,
        type: isSG ? 'Gedung Serbaguna (SG)' : 'Ruang Pertemuan / Aula',
        capacity: mr.capacity,
        status: mr.status === 'MAINTENANCE' ? 'MAINTENANCE' : (mr.status === 'TERPAKAI' ? 'TERISI' : 'KOSONG'),
        qcStatus: mr.qcStatus || 'LOLOS_QC',
        activeTxId: mr.activeTxId || null,
        activeMaintId: null
      };
    }
  }
  if (!room) return null;

  const isAula = Boolean(
    room.building === 'Ruang Pertemuan' ||
    room.building === 'Gedung Serbaguna (SG)' ||
    room.building === 'Gedung Serbaguna' ||
    isMeetingFacility(room.building) ||
    isMeetingFacility(room.roomNumber) ||
    room.type?.toLowerCase().includes('aula') ||
    room.type?.toLowerCase().includes('pertemuan') ||
    room.type?.toLowerCase().includes('serbaguna')
  );
  const isSG = Boolean(
    isAula && (
      room.building?.toLowerCase().includes('serbaguna') ||
      room.type?.toLowerCase().includes('serbaguna') ||
      room.roomNumber?.toLowerCase().includes('serbaguna') ||
      room.roomNumber?.toLowerCase().startsWith('sg')
    )
  );
  const realToday = getRealTodayDate();

  // Pencocokan multi-field transaksi aktif untuk kamar ini
  const isMatchRoom = (t: Transaction) => 
    t.roomId === room.id || 
    t.id === room.activeTxId || 
    (t.roomNumber && t.roomNumber.toLowerCase() === room.roomNumber.toLowerCase() && (!t.building || normalizeBuildingName(t.building) === normalizeBuildingName(room.building)));

  // For Ruang Pertemuan (Aula), booking on real today is automatically active / terlaksana today
  const terisiTxs = transactions.filter(t => 
    isMatchRoom(t) && 
    (t.status === 'TERISI' || (isAula && t.status === 'BOOKED' && t.startDate === realToday))
  );
  const bookedTxs = transactions.filter(t => 
    isMatchRoom(t) && 
    t.status === 'BOOKED' && 
    (!isAula || t.startDate > realToday)
  );
  const pastTxs = transactions.filter(t => isMatchRoom(t) && t.status === 'SELESAI');
  const cancelledTxs = transactions.filter(t => isMatchRoom(t) && t.status === 'DIBATALKAN');

  const todayStr = realToday;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  return (
    <div 
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[92vh] sm:max-h-[90vh] my-auto animate-in fade-in zoom-in duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="bg-gradient-to-r from-hajj-800 to-hajj-900 px-3.5 sm:px-5 py-2.5 sm:py-3 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0 pr-1">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-sm sm:text-base border border-white/10 text-gold-300 shrink-0">
              <i className={isSG ? "fa-solid fa-building-columns" : isAula ? "fa-solid fa-landmark" : "fa-solid fa-door-open"}></i>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="font-bold text-xs sm:text-sm md:text-base leading-snug break-words text-white">
                  {isAula ? `${isSG ? 'Gedung Serbaguna' : 'Ruang Pertemuan / Aula'}: ${room.roomNumber}` : `Kamar ${room.roomNumber} - ${room.building}`}
                </h3>
                <span className={`text-[9px] font-bold px-2 py-0.2 rounded-full shrink-0 shadow-xs ${
                  room.status === 'TERISI' ? 'bg-emerald-500 text-white' :
                  room.status === 'BOOKED' ? 'bg-blue-500 text-white' :
                  room.status === 'MAINTENANCE' ? 'bg-red-500 text-white' :
                  'bg-white/20 text-white'
                }`}>
                  {isAula && room.status === 'TERISI' ? 'SEDANG DIGUNAKAN' : room.status}
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-hajj-200 mt-0.5 truncate">
                {isAula ? 'Ruang Pertemuan / Aula Serbaguna' : `${room.building} • ${room.type || 'Standar'}`} • Kapasitas: {room.capacity} {isAula ? 'Pax' : 'Orang'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer shrink-0 ml-2"
          >
            <i className="fa-solid fa-xmark text-xs sm:text-sm"></i>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-y-auto custom-scrollbar flex-1 bg-slate-50/50">
          
          {/* Quick Room / Aula Stats Bar */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 bg-white p-3.5 rounded-xl border border-slate-200 text-center text-xs shadow-2xs">
            <div>
              <span className="text-[10px] text-slate-400 block font-medium">
                {isAula ? 'Acara Sedang Berlangsung' : 'Tamu Menginap'}
              </span>
              <span className="font-bold text-slate-800 text-sm">
                {terisiTxs.length} {isAula ? 'Acara' : 'Orang'}
              </span>
            </div>
            <div className="border-x border-slate-100">
              <span className="text-[10px] text-slate-400 block font-medium">
                {isAula ? 'Sesi Terjadwal (Booked)' : 'Reservasi Booked'}
              </span>
              <span className="font-bold text-blue-700 text-sm">
                {bookedTxs.length} {isAula ? 'Sesi' : 'Data'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-medium">
                {isAula ? 'Kondisi Ruangan' : 'Kesiapan Fasilitas'}
              </span>
              <span className="font-bold text-emerald-700 text-xs">
                {room.status === 'MAINTENANCE' ? '⚠️ Dalam Perawatan' : '✓ Siap Digunakan'}
              </span>
            </div>
          </div>

          {/* Special Spec Sheet for Ruang Pertemuan / Aula */}
          {isAula && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between text-hajj-900 font-bold">
                <span className="flex items-center space-x-1.5">
                  <i className="fa-solid fa-sliders text-hajj-700"></i>
                  <span>Spesifikasi & Fasilitas Standar Ruang Pertemuan</span>
                </span>
                <span className="text-[10px] bg-gold-200 text-hajj-900 font-bold px-2 py-0.5 rounded-md border border-gold-300">
                  Kapasitas {room.capacity} Pax
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-hajj-950 pt-1">
                <div className="bg-white/90 p-2 rounded-lg border border-amber-200/80 flex items-center space-x-1.5 shadow-2xs">
                  <i className="fa-solid fa-microphone text-hajj-700"></i>
                  <span>Sound & Mic Wireless</span>
                </div>
                <div className="bg-white/90 p-2 rounded-lg border border-amber-200/80 flex items-center space-x-1.5 shadow-2xs">
                  <i className="fa-solid fa-video text-hajj-700"></i>
                  <span>Proyektor & Layar</span>
                </div>
                <div className="bg-white/90 p-2 rounded-lg border border-amber-200/80 flex items-center space-x-1.5 shadow-2xs">
                  <i className="fa-solid fa-snowflake text-hajj-700"></i>
                  <span>AC Sentral & Dingin</span>
                </div>
                <div className="bg-white/90 p-2 rounded-lg border border-amber-200/80 flex items-center space-x-1.5 shadow-2xs">
                  <i className="fa-solid fa-chair text-hajj-700"></i>
                  <span>Podium & Kursi Tamu</span>
                </div>
              </div>
            </div>
          )}

          {/* Spesifikasi Kamar Hunian (3 Tipe: Ekonomi, Standar, Superior; Double s/d 8 Bed) */}
          {!isAula && (
            <div className={`p-3.5 rounded-xl border text-xs space-y-2.5 ${
              room.type === 'Superior'
                ? 'bg-purple-50/70 border-purple-200'
                : room.type === 'Ekonomi'
                ? 'bg-teal-50/70 border-teal-200'
                : 'bg-blue-50/70 border-blue-200'
            }`}>
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center space-x-1.5 text-slate-800">
                  <i className="fa-solid fa-bed text-emerald-700"></i>
                  <span>Pangkalan Data Spesifikasi Kamar &amp; Kapasitas</span>
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                  room.type === 'Superior'
                    ? 'bg-purple-100 text-purple-900 border-purple-300'
                    : room.type === 'Ekonomi'
                    ? 'bg-teal-100 text-teal-900 border-teal-300'
                    : 'bg-blue-100 text-blue-900 border-blue-300'
                }`}>
                  Tipe {room.type || 'Standar'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-0.5">
                <div className="bg-white/95 p-2 rounded-lg border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-slate-400 block font-medium">Tempat Tidur:</span>
                  <span className="font-bold text-slate-800 block truncate">{room.bedType || '4 Single Bed'}</span>
                </div>
                <div className="bg-white/95 p-2 rounded-lg border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-slate-400 block font-medium">Kapasitas Maksimal:</span>
                  <span className="font-bold text-slate-800 block">{room.capacity || '4 Orang'}</span>
                </div>
                <div className="bg-white/95 p-2 rounded-lg border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-slate-400 block font-medium">Tarif Resmi / Malam:</span>
                  <span className="font-bold text-emerald-700 font-mono block">
                    {room.pricePerNight ? `${formatRupiah(room.pricePerNight)}` : 'Sesuai Katalog'}
                  </span>
                </div>
                <div className="bg-white/95 p-2 rounded-lg border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-slate-400 block font-medium">Lokasi Gedung:</span>
                  <span className="font-bold text-slate-800 block truncate">Lt. {room.floor || 1} • {room.building}</span>
                </div>
              </div>

              {room.facilities && room.facilities.length > 0 && (
                <div className="pt-1.5 border-t border-slate-200/70">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Fasilitas Kamar:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {room.facilities.map((fac, idx) => (
                      <span key={idx} className="px-1.5 py-0.5 bg-white text-slate-700 rounded text-[9px] font-medium border border-slate-200 shadow-2xs">
                        {fac}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section 1: Tamu / Acara Sedang Berlangsung (Check-In Aktif) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>{isAula ? 'Acara / Penyelenggara Sedang Berlangsung' : 'Tamu Sedang Menginap'} ({terisiTxs.length})</span>
              </h4>
              {terisiTxs.length > 0 && (
                <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {isAula ? 'Sedang Digunakan' : 'Check-In Terkonfirmasi'}
                </span>
              )}
            </div>

            {terisiTxs.length === 0 ? (
              <div className="p-5 bg-white rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-500 space-y-3">
                <i className={isAula ? "fa-solid fa-calendar-xmark text-slate-300 text-2xl mb-1 block" : "fa-solid fa-bed text-slate-300 text-2xl mb-1 block"}></i>
                <div>
                  <p className="font-semibold text-slate-700">
                    {isAula 
                      ? 'Tidak ada acara yang sedang berlangsung di ruang pertemuan ini.' 
                      : 'Kamar ini sedang kosong / tidak ada tamu yang sedang menginap.'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Fasilitas siap untuk digunakan atau dijadwalkan pemesanan.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      openModal('modalCheckin', {
                        roomId: room.id,
                        actionType: 'CHECKIN',
                        initialDate: todayStr,
                        initialDuration: isAula ? 8 : 1,
                        returnToRoomId: room.id
                      });
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
                  >
                    <i className="fa-solid fa-door-open"></i>
                    <span>{isAula ? 'Check-In Acara Sekarang' : 'Check-In Tamu Sekarang'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      openModal('modalCheckin', {
                        roomId: room.id,
                        actionType: 'BOOKING',
                        initialDate: isAula ? todayStr : tomorrowStr,
                        initialDuration: isAula ? 8 : 1,
                        returnToRoomId: room.id
                      });
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
                  >
                    <i className="fa-solid fa-calendar-plus"></i>
                    <span>Booking Tgl Lain</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {terisiTxs.map(tx => (
                  <div key={tx.id} className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-sm text-slate-900">{tx.guestName}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            {tx.category === 'JEMAAH' ? `Jemaah Haji (${tx.kloter || '-'})` : (isAula ? 'Penyewa Acara' : 'Tamu Umum')}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center space-x-3">
                          <span><i className="fa-solid fa-phone text-slate-400 mr-1"></i>{tx.phone || '-'}</span>
                          <span><i className="fa-solid fa-id-badge text-slate-400 mr-1"></i>ID: {tx.id}</span>
                        </div>
                      </div>

                      <div className="text-right text-xs">
                        <span className="text-[10px] text-slate-400 block font-medium">Durasi Sewa</span>
                        <span className="font-bold text-hajj-800 text-sm">
                          {isAula && tx.duration >= 24 ? `${tx.duration / 24} Hari Penuh (${tx.duration} Jam)` : `${tx.duration} ${tx.durationUnit || (isAula ? 'Jam' : 'Malam')}`}
                        </span>
                      </div>
                    </div>

                    {/* Schedule & Inclusions */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1">
                        <div className="flex justify-between">
                          <span className="text-slate-500">{isAula ? 'Mulai Pelaksanaan:' : 'Mulai Check-In:'}</span>
                          <span className="font-semibold text-slate-800">{formatIndonesianDate(tx.startDate)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">{isAula ? 'Perkiraan Selesai:' : 'Perkiraan Check-Out:'}</span>
                          <span className="font-semibold text-slate-800">
                            {isAula 
                              ? `${formatIndonesianDate(addDaysToDateStr(tx.startDate, tx.duration >= 24 ? Math.ceil(tx.duration / 24) : 1))} (${tx.duration >= 24 ? `${tx.duration / 24} Hari Penuh (${tx.duration} Jam)` : `${tx.duration} Jam`})` 
                              : formatIndonesianDate(addDaysToDateStr(tx.startDate, tx.duration))}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Skema Sewa:</span>
                          <span className="font-semibold text-slate-700">{tx.rentType || (isAula ? 'Per Jam / Ruangan' : 'Per Kamar')}</span>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">{isAula ? 'Fasilitas Tambahan:' : 'Extra Bed:'}</span>
                          {tx.extraBed ? (
                            <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 text-[11px]">
                              <i className="fa-solid fa-plus-circle mr-1"></i>+{tx.extraBedCount || 1} Unit Tambahan
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">{isAula ? 'Standar Ruang Aula' : 'Tidak Ada'}</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">{isAula ? 'Katering / Konsumsi:' : 'Paket Sarapan:'}</span>
                          {tx.breakfast ? (
                            <span className="font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded border border-orange-200 text-[11px]" title={tx.breakfastMenu}>
                              <i className="fa-solid fa-utensils mr-1"></i>{tx.breakfastPortions || 1} Porsi ({tx.breakfastMenu || (isAula ? 'Snack Box' : 'Sarapan')})
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">{isAula ? 'Tanpa Konsumsi' : 'Tidak Termasuk'}</span>
                          )}
                        </div>
                        {tx.notes && (
                          <div className="text-[11px] text-slate-500 italic truncate pt-0.5">
                            <span className="font-semibold text-slate-600 not-italic">Catatan:</span> {tx.notes}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons for this tenant */}
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
                      {/* Unified Cetak Dokumen Button */}
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          openModal('modalInvoice', { transaction: tx, room, returnToRoomId: room.id });
                        }}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg text-xs shadow-2xs flex items-center space-x-1.5 transition cursor-pointer"
                        title="Buka pratinjau dan cetak dokumen resmi (Invoice & Kwitansi)"
                      >
                        <i className="fa-solid fa-print text-gold-400"></i>
                        <span>Cetak</span>
                      </button>

                      {/* Akses Cepat Kwitansi Resmi (Keuangan & Staf) */}
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          const isLunas = tx.paymentStatus === 'LUNAS';
                          const isDp = tx.paymentStatus === 'DP' || (tx.dpAmount && Number(tx.dpAmount) > 0) || (tx.paidAmount && Number(tx.paidAmount) > 0);
                          if (!isLunas && !isDp) {
                            showToast('Belum ada setoran pembayaran untuk transaksi ini. Silakan catat pembayaran atau buka invoice terlebih dahulu.', 'warning');
                            openModal('modalInvoice', { transaction: tx, room, autoOpenPaymentModal: true, returnToRoomId: room.id });
                          } else {
                            openModal('modalKwitansi', { transaction: tx, room, returnToRoomId: room.id });
                          }
                        }}
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs shadow-2xs flex items-center space-x-1.5 transition cursor-pointer"
                        title="Buka Lembar Kwitansi Pembayaran Resmi (PDF & Cetak)"
                      >
                        <i className="fa-solid fa-receipt text-gold-300"></i>
                        <span>Kwitansi</span>
                      </button>

                      {tx.paymentStatus !== 'LUNAS' && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            openModal('modalInvoice', { transaction: tx, room, autoOpenPaymentModal: true, returnToRoomId: room.id });
                          }}
                          className={`px-3 py-1.5 font-bold rounded-lg text-xs shadow-2xs flex items-center space-x-1.5 transition cursor-pointer ${
                            tx.paymentStatus === 'DP'
                              ? 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          }`}
                          title="Catat setoran pembayaran"
                        >
                          <i className="fa-solid fa-hand-holding-dollar text-gold-300"></i>
                          <span>{tx.paymentStatus === 'DP' ? 'Pelunasan Sisa' : 'Catat Bayar / DP'}</span>
                        </button>
                      )}

                      {tx.status === 'TERISI' && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            openModal('modalExtend', { transaction: tx, room, returnToRoomId: room.id });
                          }}
                          className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold rounded-lg text-xs border border-teal-200 flex items-center space-x-1.5 transition cursor-pointer"
                          title={isAula ? "Perpanjang jam sewa aula" : "Perpanjang masa sewa hunian"}
                        >
                          <i className="fa-solid fa-clock-rotate-left text-teal-600"></i>
                          <span>Tambah Sewa</span>
                        </button>
                      )}

                      {tx.isGroup && tx.groupId ? (
                        <button
                          type="button"
                          onClick={() => handleOpenGroupEdit(tx)}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-lg text-xs shadow-xs flex items-center space-x-1.5 transition cursor-pointer"
                          title="Sesuaikan data dan fasilitas seluruh rombongan"
                        >
                          <i className="fa-solid fa-users-gear"></i>
                          <span>Sesuaikan Data Rombongan</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            openModal('modalCheckin', {
                              roomId: room.id,
                              actionType: 'EDIT_BOOKING',
                              txToEdit: tx,
                              initialDate: tx.startDate,
                              initialDuration: tx.duration,
                              returnToRoomId: room.id
                            });
                          }}
                          className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold rounded-lg text-xs border border-amber-200 flex items-center space-x-1.5 transition cursor-pointer"
                          title="Sesuaikan data dan fasilitas"
                        >
                          <i className="fa-solid fa-pen-to-square text-amber-600"></i>
                          <span>Sesuaikan Data</span>
                        </button>
                      )}

                      {!isAula ? (
                        <button
                          type="button"
                          onClick={() => {
                            checkoutRoom(room.id, tx.id);
                            showToast(`Tamu ${tx.guestName} berhasil check-out dari ${room.roomNumber}.`, 'success');
                            onClose();
                          }}
                          className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs shadow-xs flex items-center space-x-1.5 transition cursor-pointer"
                          title="Proses check-out tamu ini"
                        >
                          <i className="fa-solid fa-right-from-bracket"></i>
                          <span>Check-Out</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            checkoutRoom(room.id, tx.id);
                            showToast(`Acara ${tx.guestName} di ${room.roomNumber} telah selesai!`, 'success');
                            onClose();
                          }}
                          className="px-3.5 py-1.5 bg-hajj-700 hover:bg-hajj-800 text-white font-bold rounded-lg text-xs shadow-xs flex items-center space-x-1.5 transition cursor-pointer"
                          title="Tandai pemakaian aula selesai"
                        >
                          <i className="fa-solid fa-circle-check"></i>
                          <span>Selesaikan Pemakaian Aula</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Reservasi Mendatang (Booked) */}
          {bookedTxs.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  <span>{isAula ? 'Jadwal Pemesanan / Booking Aula Mendatang' : 'Reservasi Mendatang'} ({bookedTxs.length})</span>
                </h4>
                <span className="text-[11px] text-blue-600 font-semibold">
                  {isAula ? 'Menunggu Waktu Acara' : 'Menunggu Kedatangan Tamu'}
                </span>
              </div>

              <div className="space-y-3">
                {bookedTxs.map(tx => (
                  <div key={tx.id} className="bg-white rounded-xl border border-blue-200/80 shadow-xs p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-sm text-slate-900">{tx.guestName}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                            Booked ({tx.category === 'JEMAAH' ? `Jemaah Kloter ${tx.kloter || '-'}` : (isAula ? 'Penyewa Acara' : 'Tamu Umum')})
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span><i className="fa-solid fa-phone text-slate-400 mr-1"></i>{tx.phone || '-'}</span>
                          <span><i className="fa-solid fa-calendar text-slate-400 mr-1"></i>Tgl: {formatIndonesianDate(tx.startDate)}</span>
                          <span>
                            <i className="fa-solid fa-clock text-slate-400 mr-1"></i>
                            Durasi: {tx.duration} {tx.durationUnit || (isAula ? 'Jam' : 'Malam')}
                            {isAula && ` (${tx.duration >= 12 ? '12 Jam' : 'Sesi 8 Jam'})`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1">
                        {tx.extraBed && (
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded border border-indigo-200">
                            +{tx.extraBedCount || 1} {isAula ? 'Unit Extra' : 'Bed'}
                          </span>
                        )}
                        {tx.breakfast && (
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-orange-50 text-orange-700 rounded border border-orange-200">
                            {isAula ? 'Konsumsi' : 'Sarapan'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {/* Unified Cetak Dokumen Button */}
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          openModal('modalInvoice', { transaction: tx, room, returnToRoomId: room.id });
                        }}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg text-xs shadow-2xs flex items-center space-x-1.5 transition cursor-pointer"
                        title="Buka pratinjau dan cetak dokumen resmi (Invoice & Kwitansi)"
                      >
                        <i className="fa-solid fa-print text-gold-400"></i>
                        <span>Cetak</span>
                      </button>

                      {/* Akses Cepat Kwitansi Resmi (Keuangan & Staf) */}
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          const isLunas = tx.paymentStatus === 'LUNAS';
                          const isDp = tx.paymentStatus === 'DP' || (tx.dpAmount && Number(tx.dpAmount) > 0) || (tx.paidAmount && Number(tx.paidAmount) > 0);
                          if (!isLunas && !isDp) {
                            showToast('Belum ada setoran pembayaran untuk transaksi ini. Silakan catat pembayaran atau buka invoice terlebih dahulu.', 'warning');
                            openModal('modalInvoice', { transaction: tx, room, autoOpenPaymentModal: true, returnToRoomId: room.id });
                          } else {
                            openModal('modalKwitansi', { transaction: tx, room, returnToRoomId: room.id });
                          }
                        }}
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs shadow-2xs flex items-center space-x-1.5 transition cursor-pointer"
                        title="Buka Lembar Kwitansi Pembayaran Resmi (PDF & Cetak)"
                      >
                        <i className="fa-solid fa-receipt text-gold-300"></i>
                        <span>Kwitansi</span>
                      </button>

                      {tx.paymentStatus !== 'LUNAS' && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            openModal('modalInvoice', { transaction: tx, room, autoOpenPaymentModal: true, returnToRoomId: room.id });
                          }}
                          className={`px-3 py-1.5 font-bold rounded-lg text-xs shadow-2xs flex items-center space-x-1.5 transition cursor-pointer ${
                            tx.paymentStatus === 'DP'
                              ? 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          }`}
                          title="Catat setoran pembayaran"
                        >
                          <i className="fa-solid fa-hand-holding-dollar text-gold-300"></i>
                          <span>{tx.paymentStatus === 'DP' ? 'Pelunasan Sisa' : 'Catat Bayar / DP'}</span>
                        </button>
                      )}

                      {tx.isGroup && tx.groupId ? (
                        <button
                          type="button"
                          onClick={() => handleOpenGroupEdit(tx)}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-lg text-xs shadow-xs flex items-center space-x-1.5 transition cursor-pointer"
                          title="Sesuaikan data dan fasilitas seluruh rombongan"
                        >
                          <i className="fa-solid fa-users-gear"></i>
                          <span>Sesuaikan Data Rombongan</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            openModal('modalCheckin', {
                              roomId: room.id,
                              actionType: 'EDIT_BOOKING',
                              txToEdit: tx,
                              initialDate: tx.startDate,
                              initialDuration: tx.duration,
                              returnToRoomId: room.id
                            });
                          }}
                          className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold rounded-lg text-xs border border-amber-200 flex items-center space-x-1.5 transition cursor-pointer"
                          title="Sesuaikan jadwal atau fasilitas booking"
                        >
                          <i className="fa-solid fa-pen-to-square text-amber-600"></i>
                          <span>Sesuaikan Data</span>
                        </button>
                      )}

                      {!isAula && (
                        <button
                          type="button"
                          onClick={() => {
                            activateCheckin(room.id, tx.id);
                            showToast(`Tamu ${tx.guestName} berhasil check-in di ${room.roomNumber}!`, 'success');
                            onClose();
                            openModal('modalInvoice', { transaction: { ...tx, status: 'TERISI' }, room, returnToRoomId: room.id });
                          }}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-xs flex items-center space-x-1.5 transition cursor-pointer"
                          title="Proses check-in masuk sekarang"
                        >
                          <i className="fa-solid fa-door-open"></i>
                          <span>Check-In Sekarang</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Yakin ingin membatalkan reservasi booking atas nama "${tx.guestName}"? Status reservasi akan diperbarui menjadi DIBATALKAN dan tetap tersimpan dalam laporan.`)) {
                            cancelBooking(room.id, tx.id, 'Dibatalkan oleh Pengguna');
                            onClose();
                          }
                        }}
                        className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-lg text-xs border border-red-200 flex items-center space-x-1.5 transition cursor-pointer"
                        title="Batalkan reservasi ini"
                      >
                        <i className="fa-solid fa-ban"></i>
                        <span>Batalkan</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 3: Riwayat Pemakaian Terakhir */}
          {terisiTxs.length === 0 && pastTxs.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center space-x-1.5">
                <i className="fa-solid fa-clock-rotate-left text-slate-400"></i>
                <span>{isAula ? 'Riwayat Pemakaian Acara Terakhir' : 'Riwayat Tamu Terakhir (Selesai Check-Out)'}</span>
              </h4>

              {(() => {
                const lastTx = pastTxs[pastTxs.length - 1];
                return (
                  <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-bold text-slate-800">{lastTx.guestName}</div>
                      <div className="text-slate-500 text-[11px] mt-0.5">
                        {isAula ? 'Pelaksanaan Acara' : 'Menginap'}: {formatIndonesianDate(lastTx.startDate)} ({lastTx.duration} {lastTx.durationUnit || (isAula ? 'Jam' : 'Malam')})
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        openModal('modalInvoice', { transaction: lastTx, room });
                      }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs flex items-center space-x-1.5 transition cursor-pointer"
                      title="Lihat dan cetak invoice transaksi yang telah selesai"
                    >
                      <i className="fa-solid fa-print text-indigo-600"></i>
                      <span>Lihat Invoice Selesai</span>
                    </button>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Section 4: Riwayat Reservasi Dibatalkan */}
          {cancelledTxs.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-600 flex items-center space-x-1.5">
                <i className="fa-solid fa-ban text-rose-500"></i>
                <span>Riwayat Reservasi Dibatalkan ({cancelledTxs.length})</span>
              </h4>

              <div className="space-y-2">
                {cancelledTxs.slice(-3).reverse().map(cTx => (
                  <div key={cTx.id} className="bg-rose-50/60 rounded-xl border border-rose-200/80 p-3 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-800">{cTx.guestName}</span>
                        <span className="px-1.5 py-0.2 bg-rose-100 text-rose-700 border border-rose-300 rounded text-[9px] font-bold">
                          DIBATALKAN
                        </span>
                      </div>
                      <div className="text-slate-500 text-[11px] mt-0.5">
                        Jadwal: {formatIndonesianDate(cTx.startDate)} ({cTx.duration} {cTx.durationUnit || (isAula ? 'Jam' : 'Malam')})
                        {cTx.cancelledAt ? ` • Dibatalkan: ${cTx.cancelledAt.substring(0, 10)}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        openModal('modalInvoice', { transaction: cTx, room });
                      }}
                      className="px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold flex items-center space-x-1 transition cursor-pointer shadow-2xs"
                      title="Lihat dokumen bukti pembatalan"
                    >
                      <i className="fa-solid fa-file-invoice"></i>
                      <span>Bukti Batal</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-2.5 sm:p-3.5 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                openModal('modalMaintenance', { roomId: room.id });
              }}
              className="px-2.5 sm:px-3 py-1.5 bg-slate-100 hover:bg-amber-50 text-slate-700 hover:text-amber-800 font-semibold rounded-lg text-xs border border-slate-200 transition flex items-center space-x-1.5 cursor-pointer"
            >
              <i className="fa-solid fa-wrench text-amber-600"></i>
              <span>{isAula ? 'Lapor Aula' : 'Lapor Perawatan'}</span>
            </button>

            {!isAula && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openModal('modalCheckin', {
                    roomId: room.id,
                    actionType: 'CHECKIN',
                    initialDate: todayStr,
                    initialDuration: 1,
                    returnToRoomId: room.id
                  });
                }}
                className="px-2.5 sm:px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200 font-bold rounded-lg text-xs border transition flex items-center space-x-1.5 cursor-pointer"
              >
                <i className="fa-solid fa-door-open"></i>
                <span>+ Check-In</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onClose();
                openModal('modalCheckin', {
                  roomId: room.id,
                  actionType: 'BOOKING',
                  initialDate: isAula ? todayStr : tomorrowStr,
                  initialDuration: isAula ? 8 : 1,
                  returnToRoomId: room.id
                });
              }}
              className={`px-2.5 sm:px-3 py-1.5 ${isAula ? 'bg-amber-50 hover:bg-amber-100 text-hajj-900 border-amber-300' : 'bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-200'} font-bold rounded-lg text-xs border transition flex items-center space-x-1.5 cursor-pointer`}
            >
              <i className="fa-solid fa-calendar-plus"></i>
              <span>{isAula ? '+ Booking Acara' : '+ Booking Tgl Lain'}</span>
            </button>

            {canManageRooms && !isAula && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openModal('modalRoomEdit', { room });
                }}
                className="px-2.5 sm:px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-200 font-bold rounded-lg text-xs border transition flex items-center space-x-1.5 cursor-pointer"
                title="Edit data kamar, tipe (Ekonomi/Standar/Superior), kapasitas bed & harga"
              >
                <i className="fa-solid fa-pen-to-square text-blue-600"></i>
                <span>Edit Kamar</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg text-xs shadow-xs transition cursor-pointer"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
};
