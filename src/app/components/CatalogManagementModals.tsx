// @ts-nocheck
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext, isSuperAdmin, isRecepRole } from '../store';
import { Building, MeetingRoom, Room, RoomCapacityRate } from '../types';
import { formatRupiah, updateRoomNumberWithFloor, extractFloorFromRoomNumber, getNextRoomNumber, isMeetingFacility, getRoomBuildingKey, getNextSequentialId, compareBuildingOrder } from '../lib/utils';
import { useBodyScrollLock } from '../lib/scrollLock';
import { findRoomRate, initialRoomCapacityRates } from '../data';

// =========================================================================
// 1. MODAL KELOLA GEDUNG (INPUT BARU & EDIT)
// =========================================================================
interface BuildingModalProps {
  isOpen: boolean;
  onClose: () => void;
  buildingToEdit: Building | null;
}

export function BuildingModal({ isOpen, onClose, buildingToEdit }: BuildingModalProps) {
  const { addBuilding, updateBuilding, currentUser, showToast, rooms, meetingRooms } = useAppContext();
  const isEdit = Boolean(buildingToEdit);

  useBodyScrollLock(isOpen);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [floors, setFloors] = useState<number>(3);
  const [totalRooms, setTotalRooms] = useState<number>(3);
  const [capacityDesc, setCapacityDesc] = useState('');
  const [category, setCategory] = useState<'PENGINAPAN' | 'SERBAGUNA' | 'RUANG_PERTEMUAN' | 'KANTOR'>('PENGINAPAN');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'AKTIF' | 'NONAKTIF'>('AKTIF');
  const [isSaving, setIsSaving] = useState(false);

  const liveBuildingRoomsCount = useMemo(() => {
    if (!buildingToEdit) return 0;
    const targetName = (buildingToEdit.name || '').trim().toLowerCase();
    return (rooms || []).filter(r => {
      const bKey = getRoomBuildingKey(r, meetingRooms);
      return bKey.toLowerCase() === targetName || (r.building || '').trim().toLowerCase() === targetName;
    }).length;
  }, [buildingToEdit, rooms, meetingRooms]);

  useEffect(() => {
    if (buildingToEdit) {
      setName(buildingToEdit.name || '');
      setCode(buildingToEdit.code || '');
      setFloors(buildingToEdit.floors || 3);
      const initialRoomCount = liveBuildingRoomsCount > 0
        ? liveBuildingRoomsCount
        : (buildingToEdit.totalRooms !== undefined ? buildingToEdit.totalRooms : 3);
      setTotalRooms(initialRoomCount);
      setCapacityDesc(buildingToEdit.capacityDesc || '');
      setCategory((buildingToEdit.category as any) || 'PENGINAPAN');
      setDescription(buildingToEdit.description || '');
      setStatus(buildingToEdit.status || 'AKTIF');
    } else {
      setName('');
      setCode('');
      setFloors(3);
      setTotalRooms(3);
      setCapacityDesc('3 Kamar Hunian Ber-AC');
      setCategory('PENGINAPAN');
      setDescription('');
      setStatus('AKTIF');
    }
  }, [buildingToEdit, isOpen, liveBuildingRoomsCount]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) {
      showToast('Nama dan kode gedung wajib diisi!', 'warning');
      return;
    }

    const isLodging = category === 'PENGINAPAN';
    const parsedRooms = Number(totalRooms);
    const finalTotalRooms = isLodging ? (!isNaN(parsedRooms) && parsedRooms >= 0 ? parsedRooms : 3) : 0;
    let finalCapDesc = capacityDesc.trim();
    if (isLodging && (!finalCapDesc || /^\d+\s*Kamar/i.test(finalCapDesc))) {
      finalCapDesc = finalCapDesc
        ? finalCapDesc.replace(/^\d+/, String(finalTotalRooms))
        : `${finalTotalRooms} Kamar Hunian`;
    } else if (!finalCapDesc) {
      finalCapDesc = 'Kapasitas Gedung Utuh';
    }

    setIsSaving(true);
    try {
      if (isEdit && buildingToEdit) {
        await updateBuilding({
          ...buildingToEdit,
          name: name.trim(),
          code: code.trim().toUpperCase(),
          floors: Number(floors) || 1,
          totalRooms: finalTotalRooms,
          capacityDesc: finalCapDesc,
          category,
          description: description.trim(),
          status
        });
      } else {
        await addBuilding({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          floors: Number(floors) || 1,
          totalRooms: finalTotalRooms,
          capacityDesc: finalCapDesc,
          category,
          description: description.trim(),
          status
        });
      }
      onClose();
    } catch (err: any) {
      showToast(`Gagal menyimpan gedung ke database: ${err?.message || 'Error'}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const canManage = currentUser && (isSuperAdmin(currentUser.role) || currentUser.role === 'Admin');

  const isSerbagunaBuilding = category === 'SERBAGUNA';
  const isKantorBuilding = category === 'KANTOR';

  return (
    <div 
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`bg-gradient-to-r ${
          isSerbagunaBuilding 
            ? 'from-slate-900 via-purple-950 to-slate-900' 
            : isKantorBuilding
            ? 'from-slate-900 via-slate-800 to-slate-900'
            : 'from-slate-900 via-emerald-950 to-slate-900'
        } text-white p-4 flex items-center justify-between transition-colors`}>
          <div className="flex items-center space-x-2.5">
            <div className={`w-8 h-8 rounded-lg ${
              isSerbagunaBuilding
                ? 'bg-purple-500/20 text-purple-400 border border-purple-400/30'
                : isKantorBuilding
                ? 'bg-slate-500/20 text-slate-300 border border-slate-400/30'
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-400/30'
            } flex items-center justify-center`}>
              <i className={`fa-solid ${
                isSerbagunaBuilding ? 'fa-landmark' : isKantorBuilding ? 'fa-briefcase' : 'fa-building'
              }`}></i>
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center space-x-2">
                <span>{isEdit ? 'Edit Data Gedung' : 'Input Gedung Baru'}</span>
                {isSerbagunaBuilding && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-300 font-semibold border border-purple-400/30">
                    Serbaguna / Aula
                  </span>
                )}
              </h3>
              <p className="text-[10px] text-slate-300">Pangkalan Data Fasilitas UPT Asrama Haji Jakarta</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-1 rounded-lg transition"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {!canManage ? (
          <div className="p-6 text-center space-y-3">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center mx-auto text-xl">
              <i className="fa-solid fa-lock"></i>
            </div>
            <p className="text-xs text-slate-600 font-medium">
              Hanya <strong>Super Admin / Admin</strong> yang memiliki hak akses untuk menginput atau mengubah data katalog gedung.
            </p>
            <button 
              type="button" 
              onClick={onClose} 
              className="px-4 py-2 bg-slate-200 text-slate-800 font-bold text-xs rounded-xl hover:bg-slate-300 transition"
            >
              Tutup
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-bold text-slate-700">Nama Gedung *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Gedung E (Multazam)"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Kode Gedung *</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="Contoh: E"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs uppercase font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Kategori Fasilitas *</label>
                <select
                  value={category}
                  onChange={e => {
                    const newCat = e.target.value as any;
                    setCategory(newCat);
                    if (newCat === 'SERBAGUNA' && (!capacityDesc || capacityDesc.includes('Kamar Hunian'))) {
                      setCapacityDesc('Kapasitas 500 - 1500 Orang (Gedung Serbaguna SG)');
                    } else if (newCat === 'RUANG_PERTEMUAN' && (!capacityDesc || capacityDesc.includes('Kamar Hunian'))) {
                      setCapacityDesc('Kapasitas 300 - 800 Orang (Ruang Pertemuan / Aula)');
                    } else if (newCat === 'PENGINAPAN' && (capacityDesc.includes('Serbaguna') || capacityDesc.includes('Ruang Pertemuan'))) {
                      setCapacityDesc(`${totalRooms || 3} Kamar Hunian Ber-AC`);
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <option key="PENGINAPAN" value="PENGINAPAN">Penginapan (Asrama/Kamar)</option>
                  <option key="SERBAGUNA" value="SERBAGUNA">Serbaguna (Sewa Gedung Utuh)</option>
                  <option key="RUANG_PERTEMUAN" value="RUANG_PERTEMUAN">Ruang Pertemuan / Aula</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Status Operasional</label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <option key="AKTIF" value="AKTIF">Aktif (Dapat Ditempati)</option>
                  <option key="NONAKTIF" value="NONAKTIF">Nonaktif (Perbaikan / Ditutup)</option>
                </select>
              </div>
            </div>

            {category === 'PENGINAPAN' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Jumlah Lantai</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={floors}
                    onChange={e => setFloors(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">Jumlah Kamar (Unit)</label>
                    <span className="text-[10px] text-emerald-600 font-bold">
                      {isEdit ? `Di Denah: ${liveBuildingRoomsCount} Unit` : 'Default: 3 Unit'}
                    </span>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={totalRooms}
                    onChange={e => {
                      const val = parseInt(e.target.value, 10);
                      const nextCount = isNaN(val) ? 0 : Math.max(0, val);
                      setTotalRooms(nextCount);
                      if (/^\d+\s*Kamar/i.test(capacityDesc.trim())) {
                        setCapacityDesc(capacityDesc.trim().replace(/^\d+/, String(nextCount)));
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                  {isEdit ? (
                    <p className={`text-[10px] font-semibold ${
                      totalRooms > liveBuildingRoomsCount
                        ? 'text-blue-700'
                        : totalRooms < liveBuildingRoomsCount
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                    }`}>
                      {totalRooms > liveBuildingRoomsCount
                        ? `+ Menambah ${totalRooms - liveBuildingRoomsCount} unit kamar baru di Denah Penyewaan (Total menjadi ${totalRooms} unit).`
                        : totalRooms < liveBuildingRoomsCount
                        ? `- Mengurangi ${liveBuildingRoomsCount - totalRooms} unit kamar kosong di Denah Penyewaan (Total menjadi ${totalRooms} unit).`
                        : `✓ Sinkron dengan jumlah unit di Denah Penyewaan (${totalRooms} unit).`}
                    </p>
                  ) : (
                    <p className="text-[10px] text-slate-500">
                      Default 3 unit kamar awal akan otomatis disiapkan di Denah Penyewaan.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl space-y-1.5 text-xs text-purple-900">
                <div className="flex items-center space-x-2 font-bold text-purple-950">
                  <i className={`fa-solid ${category === 'SERBAGUNA' ? 'fa-landmark' : 'fa-users'} text-purple-600`}></i>
                  <span>Sewa Paket Gedung / Ruangan Utuh (Bukan Unit Kamar)</span>
                </div>
                <p className="text-[11px] text-purple-800 leading-relaxed">
                  Fasilitas <strong>{category === 'SERBAGUNA' ? 'Gedung Serbaguna (SG)' : 'Ruang Pertemuan / Aula'}</strong> disewa sebagai 1 kesatuan gedung/ruangan untuk event akbar, pernikahan, atau rapat dinas. Sistem <strong>tidak membuat unit-unit kamar tidur</strong> di Denah Penyewaan.
                </p>
              </div>
            )}

            {category === 'PENGINAPAN' && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start space-x-2.5 text-xs text-emerald-900">
                <i className="fa-solid fa-hotel text-emerald-600 text-sm mt-0.5 shrink-0"></i>
                <div className="space-y-0.5">
                  <span className="font-bold block text-emerald-950">Sinkronisasi ke Denah Penyewaan</span>
                  <p className="text-[11px] text-emerald-800 leading-relaxed">
                    Setiap unit kamar di gedung penginapan ini terhubung dengan <strong>Katalog Tipe Kamar</strong> (tarif &amp; fasilitas) dan langsung dapat disewa tamu di <strong>Denah Penyewaan</strong>.
                  </p>
                </div>
              </div>
            )}

            {(category === 'SERBAGUNA' || category === 'RUANG_PERTEMUAN') && (
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl flex items-start space-x-2.5 text-xs text-purple-900">
                <i className={`fa-solid ${category === 'SERBAGUNA' ? 'fa-layer-group text-amber-600' : 'fa-landmark text-purple-600'} text-sm mt-0.5 shrink-0`}></i>
                <div className="space-y-0.5">
                  <span className="font-bold block text-purple-950">Terhubung Otomatis ke Katalog Ruang Pertemuan / Aula &amp; Denah</span>
                  <p className="text-[11px] text-purple-800 leading-relaxed">
                    Karena kategori ini adalah <strong>{category === 'SERBAGUNA' ? 'Serbaguna (SG)' : 'Ruang Pertemuan / Aula'}</strong>, data gedung beserta ruang pertemuannya akan otomatis disinkronkan ke <strong>Katalog Ruang pertemuan / aula</strong> dan Denah Penyewaan.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Keterangan Kapasitas & Spesifikasi Singkat</label>
              <input
                type="text"
                placeholder={category === 'SERBAGUNA' ? 'Contoh: Kapasitas 500 - 1000 Orang (AC Central, Videotron)' : 'Contoh: 50 Kamar Hunian AC & Kamar Mandi Dalam'}
                value={capacityDesc}
                onChange={e => setCapacityDesc(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Deskripsi / Catatan Tambahan</label>
              <textarea
                rows={2}
                placeholder="Catatan fasilitas khusus, penanggung jawab zona, dsb..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className={`px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow transition flex items-center space-x-1.5 ${
                  isSaving ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                {isSaving ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin"></i>
                    <span>Menyimpan ke Database...</span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-floppy-disk"></i>
                    <span>{isEdit ? 'Simpan Perubahan Gedung' : 'Tambahkan Gedung Baru'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// =========================================================================
// 2. MODAL KELOLA RUANG PERTEMUAN / AULA (INPUT BARU & EDIT)
// =========================================================================
interface MeetingRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  meetingRoomToEdit: MeetingRoom | null;
  defaultCategory?: 'AULA' | 'SERBAGUNA';
}

export function MeetingRoomModal({ isOpen, onClose, meetingRoomToEdit, defaultCategory }: MeetingRoomModalProps) {
  const { addMeetingRoom, updateMeetingRoom, buildings, currentUser, showToast } = useAppContext();
  const isEdit = Boolean(meetingRoomToEdit);

  useBodyScrollLock(isOpen);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [category, setCategory] = useState<'AULA' | 'SERBAGUNA'>(defaultCategory || 'AULA');
  const [building, setBuilding] = useState('Ruang Pertemuan / Aula');
  const [capacity, setCapacity] = useState('300 - 500 Orang');
  const [capacityNumber, setCapacityNumber] = useState(500);
  const [dailyRate, setDailyRate] = useState(7500000);
  const [sessionRate, setSessionRate] = useState(4500000);
  const [facilitiesText, setFacilitiesText] = useState('AC Sentral, Sound System Standar, Mic Wireless, LCD Proyektor & Screen, Kursi VIP & Banquet, Toilet');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'TERSEDIA' | 'TERPAKAI' | 'MAINTENANCE'>('TERSEDIA');

  const defaultFacilityPills = [
    'AC Sentral',
    'Sound System 5000W',
    'Mic Wireless (4 pcs)',
    'Videotron LED Panggung',
    'LCD Proyektor & Screen',
    'Podium & Panggung Utama',
    'Kursi VIP & Banquet',
    'Meja Rapat / Round Table',
    'Ruang Transit VIP',
    'Toilet Bersih Dalam',
    'Wifi Dedicated 100Mbps',
    'Genset Cadangan Otomatis'
  ];

  useEffect(() => {
    if (meetingRoomToEdit) {
      setName(meetingRoomToEdit.name || '');
      setCode(meetingRoomToEdit.code || '');
      
      // Tentukan kategori secara akurat dari category tersimpan atau fallback cerdas
      let cat: 'AULA' | 'SERBAGUNA' = 'AULA';
      if (meetingRoomToEdit.category === 'SERBAGUNA') {
        cat = 'SERBAGUNA';
      } else if (meetingRoomToEdit.category === 'AULA' || meetingRoomToEdit.category === 'RUANG_PERTEMUAN') {
        cat = 'AULA';
      } else {
        const nLower = (meetingRoomToEdit.name || '').toLowerCase().trim();
        const cLower = (meetingRoomToEdit.code || '').toLowerCase().trim();
        const bLower = (meetingRoomToEdit.building || '').toLowerCase().trim();
        if (nLower.startsWith('ruang pertemuan') || nLower.startsWith('aula') || nLower.startsWith('auditorium') || nLower.startsWith('ruang rapat') || nLower.startsWith('ruang vip')) {
          cat = 'AULA';
        } else if (nLower.includes('serbaguna') || nLower.includes('multipurpose') || nLower.startsWith('gedung sg') || nLower.startsWith('sg-') || cLower === 'mp' || cLower.startsWith('sg-') || bLower.includes('serbaguna')) {
          cat = 'SERBAGUNA';
        } else {
          cat = 'AULA';
        }
      }
      setCategory(cat);

      // Tentukan lokasi gedung sesuai data atau kategori yang terpilih
      if (meetingRoomToEdit.building) {
        setBuilding(meetingRoomToEdit.building === 'Ruang Pertemuan' ? 'Ruang Pertemuan / Aula' : meetingRoomToEdit.building);
      } else {
        setBuilding(cat === 'SERBAGUNA' ? 'Gedung Serbaguna (SG)' : 'Ruang Pertemuan / Aula');
      }

      setCapacity(meetingRoomToEdit.capacity || (cat === 'SERBAGUNA' ? '800 - 1500 Orang' : '300 - 500 Orang'));
      setCapacityNumber(meetingRoomToEdit.capacityNumber || (cat === 'SERBAGUNA' ? 1000 : 500));
      setDailyRate(meetingRoomToEdit.dailyRate || (cat === 'SERBAGUNA' ? 15000000 : 7500000));
      setSessionRate(meetingRoomToEdit.sessionRate || (cat === 'SERBAGUNA' ? 8500000 : 4500000));
      setFacilitiesText((meetingRoomToEdit.facilities || []).join(', '));
      setDescription(meetingRoomToEdit.description || '');
      setStatus(meetingRoomToEdit.status || 'TERSEDIA');
    } else {
      const initialCat = defaultCategory || 'AULA';
      setName('');
      setCode('');
      setCategory(initialCat);
      setBuilding(initialCat === 'SERBAGUNA' ? 'Gedung Serbaguna (SG)' : 'Ruang Pertemuan / Aula');
      setCapacity(initialCat === 'SERBAGUNA' ? '800 - 1500 Orang' : '300 - 500 Orang');
      setCapacityNumber(initialCat === 'SERBAGUNA' ? 1000 : 500);
      setDailyRate(initialCat === 'SERBAGUNA' ? 15000000 : 7500000);
      setSessionRate(initialCat === 'SERBAGUNA' ? 8500000 : 4500000);
      setFacilitiesText(initialCat === 'SERBAGUNA' 
        ? 'AC Sentral, Panggung Utama, Sound System 10.000 Watt, Videotron LED, VIP Room'
        : 'AC Sentral, Sound System Standar, Mic Wireless, LCD Proyektor & Screen, Kursi VIP & Banquet, Toilet');
      setDescription('');
      setStatus('TERSEDIA');
    }
  }, [meetingRoomToEdit, isOpen, defaultCategory]);

  if (!isOpen) return null;

  const toggleFacility = (item: string) => {
    const list = facilitiesText
      .split(',')
      .map(f => f.trim())
      .filter(f => f.length > 0);
    const exists = list.some(f => f.toLowerCase() === item.toLowerCase());
    let updated: string[];
    if (exists) {
      updated = list.filter(f => f.toLowerCase() !== item.toLowerCase());
    } else {
      updated = [...list, item];
    }
    setFacilitiesText(updated.join(', '));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Nama ruang pertemuan / aula wajib diisi!', 'warning');
      return;
    }

    const facilitiesArray = facilitiesText
      .split(',')
      .map(f => f.trim())
      .filter(f => f.length > 0);

    const targetBuilding = building.trim() || (category === 'SERBAGUNA' ? 'Gedung Serbaguna (SG)' : 'Ruang Pertemuan / Aula');
    const categoryLabel = category === 'SERBAGUNA' ? 'Gedung Serbaguna (SG)' : 'Ruang Pertemuan / Aula';

    if (isEdit && meetingRoomToEdit) {
      updateMeetingRoom({
        ...meetingRoomToEdit,
        name: name.trim(),
        code: code.trim() || undefined,
        category,
        building: targetBuilding,
        capacity: capacity.trim(),
        capacityNumber: Number(capacityNumber) || 100,
        dailyRate: Number(dailyRate) || 0,
        sessionRate: Number(sessionRate) || 0,
        facilities: facilitiesArray,
        description: description.trim() || `Kategori: ${categoryLabel}`,
        status
      });
      showToast(`Fasilitas ${name.trim()} (${categoryLabel}) berhasil diperbarui!`, 'success');
    } else {
      addMeetingRoom({
        name: name.trim(),
        code: code.trim() || undefined,
        category,
        building: targetBuilding,
        capacity: capacity.trim(),
        capacityNumber: Number(capacityNumber) || 100,
        dailyRate: Number(dailyRate) || 0,
        sessionRate: Number(sessionRate) || 0,
        facilities: facilitiesArray,
        description: description.trim() || `Kategori: ${categoryLabel}`,
        status
      });
      showToast(`Fasilitas ${name.trim()} (${categoryLabel}) berhasil ditambahkan ke katalog!`, 'success');
    }

    onClose();
  };

  const canManage = currentUser && (isSuperAdmin(currentUser.role) || currentUser.role === 'Admin' || isRecepRole(currentUser.role));

  const currentFacilitiesList = facilitiesText
    .split(',')
    .map(f => f.trim().toLowerCase());

  return (
    <div 
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 text-white p-4 flex items-center justify-between border-b border-purple-800/40">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-400/40 flex items-center justify-center text-base shadow-inner">
              <i className="fa-solid fa-landmark"></i>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-sm text-white">
                  {isEdit ? 'Edit Ruang Pertemuan / Aula' : 'Input Ruang Pertemuan Baru'}
                </h3>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-200 border border-purple-400/30">
                  Fasilitas Aula &amp; Serbaguna
                </span>
              </div>
              <p className="text-[11px] text-purple-200">
                {isEdit ? 'Perbarui informasi fasilitas aula, gedung serbaguna & ruang rapat' : 'Tambahkan aula, gedung serbaguna & ruang rapat baru ke pangkalan data'}
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-1.5 rounded-lg transition hover:bg-white/10"
          >
            <i className="fa-solid fa-xmark text-base"></i>
          </button>
        </div>

        {!canManage ? (
          <div className="p-6 text-center space-y-3 bg-white dark:bg-slate-800">
            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-xl flex items-center justify-center mx-auto text-xl">
              <i className="fa-solid fa-lock"></i>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
              Anda tidak memiliki otorisasi untuk menambah atau mengubah data ruang pertemuan / aula.
            </p>
            <button 
              type="button" 
              onClick={onClose} 
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl hover:bg-slate-300 dark:hover:bg-slate-600 transition"
            >
              Tutup
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto custom-scrollbar bg-white dark:bg-slate-800">
            {/* Notice header explaining hall vs bedroom */}
            <div className="p-2.5 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 rounded-xl flex items-center space-x-2.5 text-xs text-purple-900 dark:text-purple-200">
              <i className="fa-solid fa-circle-info text-purple-600 dark:text-purple-400 text-sm shrink-0"></i>
              <div className="leading-tight">
                <span className="font-bold">Fasilitas Pertemuan / Aula Publik:</span> Form ini khusus untuk fasilitas serbaguna, auditorium, dan ruang rapat (bukan kamar tidur hunian).
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Nama Ruang Pertemuan / Aula *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Gedung SG-1 (SG-1) atau Aula Utama Arafah"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Kode Singkat
                </label>
                <input
                  type="text"
                  placeholder="Contoh: SG-1 / AU-A"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs uppercase font-bold text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between">
                  <span>Kategori Fasilitas *</span>
                  <span className="text-[10px] font-semibold flex items-center gap-1">
                    <i className={`fa-solid ${category === 'SERBAGUNA' ? 'fa-building-columns text-amber-600' : 'fa-landmark text-purple-600'}`}></i>
                    <span className={category === 'SERBAGUNA' ? 'text-amber-700 dark:text-amber-400' : 'text-purple-700 dark:text-purple-400'}>
                      {category === 'SERBAGUNA' ? 'Gedung Serbaguna' : 'Ruang Pertemuan / Aula'}
                    </span>
                  </span>
                </label>
                <select
                  value={category}
                  onChange={e => {
                    const newCat = e.target.value as 'AULA' | 'SERBAGUNA';
                    setCategory(newCat);
                    if (newCat === 'AULA' && (building === 'Gedung Serbaguna (SG)' || building === 'Gedung Serbaguna')) {
                      setBuilding('Ruang Pertemuan / Aula');
                    } else if (newCat === 'SERBAGUNA' && (building === 'Ruang Pertemuan' || building === 'Ruang Pertemuan / Aula')) {
                      setBuilding('Gedung Serbaguna (SG)');
                    }
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-600 cursor-pointer"
                >
                  <option value="AULA">🏛️ Ruang Pertemuan / Aula</option>
                  <option value="SERBAGUNA">🏢 Gedung Serbaguna (SG)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Lokasi / Kawasan Gedung *
                </label>
                <select
                  value={building === 'Ruang Pertemuan' ? 'Ruang Pertemuan / Aula' : building}
                  onChange={e => setBuilding(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-600 cursor-pointer"
                >
                  <option value="Ruang Pertemuan / Aula">🏛️ Ruang Pertemuan / Aula</option>
                  <option value="Gedung Serbaguna (SG)">🏢 Gedung Serbaguna (SG)</option>
                  {(Array.from(new Set(buildings.map(b => b.name))) as string[])
                    .filter(name => 
                      name !== 'Gedung Sekretariat' && 
                      name !== 'Kawasan Utama' && 
                      name !== 'Ruang Pertemuan' && 
                      name !== 'Ruang Pertemuan / Aula' && 
                      name !== 'Gedung Serbaguna (SG)' && 
                      name !== 'Gedung Serbaguna'
                    )
                    .slice()
                    .sort((a, b) => compareBuildingOrder(a, b))
                    .map(bName => {
                      const bObj = buildings.find(b => b.name === bName);
                      return (
                        <option key={bName} value={bName}>
                          {bName} {bObj?.category === 'SERBAGUNA' ? '(Serbaguna)' : bObj?.category === 'RUANG_PERTEMUAN' ? '(Aula)' : ''}
                        </option>
                      );
                    })}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Kapasitas (Deskripsi Rentang)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: 1.000 - 1.500 Orang (Standing / Theater)"
                  value={capacity}
                  onChange={e => setCapacity(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Maks. Kursi
                </label>
                <input
                  type="number"
                  min={10}
                  step={10}
                  value={capacityNumber}
                  onChange={e => setCapacityNumber(parseInt(e.target.value) || 100)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Tarif Sewa Harian / 12 Jam (Rp)
                </label>
                <input
                  type="number"
                  step={500000}
                  value={dailyRate}
                  onChange={e => setDailyRate(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block">{formatRupiah(dailyRate)} / 12 Jam</span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Tarif Per Sesi / 8 Jam (Rp)
                </label>
                <input
                  type="number"
                  step={500000}
                  value={sessionRate}
                  onChange={e => setSessionRate(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-indigo-700 dark:text-indigo-400 focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block">{formatRupiah(sessionRate)} / 8 Jam</span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Status Kesiapan
                </label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as any)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-600"
                >
                  <option value="TERSEDIA">Tersedia (Siap Disewa)</option>
                  <option value="TERPAKAI">Sedang Terpakai</option>
                  <option value="MAINTENANCE">Maintenance / Perawatan</option>
                </select>
              </div>
            </div>

            {/* Quick facility tags selector */}
            <div className="space-y-1.5 pt-1 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Fasilitas &amp; Sarana Pendukung (Klik untuk menambah/menghapus)
                </label>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Pilih cepat fasilitas</span>
              </div>
              
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700">
                {defaultFacilityPills.map(item => {
                  const isSelected = currentFacilitiesList.includes(item.toLowerCase());
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleFacility(item)}
                      className={`text-[10px] px-2 py-1 rounded-lg font-semibold transition border flex items-center space-x-1 cursor-pointer ${
                        isSelected 
                          ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 border-purple-300 dark:border-purple-700 font-bold'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <i className={`fa-solid ${isSelected ? 'fa-check text-purple-600 dark:text-purple-300' : 'fa-plus text-slate-400'}`}></i>
                      <span>{item}</span>
                    </button>
                  );
                })}
              </div>

              <textarea
                rows={2}
                placeholder="AC Sentral, Sound System 5000W, Mic Wireless, Videotron, Kursi VIP, Toilet"
                value={facilitiesText}
                onChange={e => setFacilitiesText(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Deskripsi &amp; Peruntukan Acara
              </label>
              <textarea
                rows={2}
                placeholder="Sangat cocok untuk resepsi pernikahan, manasik haji akbar, seminar kedinasan, wisuda akbar, rapat koordinasi..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-600"
              />
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded-xl shadow transition flex items-center space-x-1.5 cursor-pointer"
              >
                <i className="fa-solid fa-floppy-disk"></i>
                <span>{isEdit ? 'Simpan Perubahan Ruang' : 'Tambahkan Ruang Pertemuan'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// =========================================================================
// 3. MODAL KELOLA KAMAR & TEMPAT TIDUR (INPUT BARU & EDIT)
// Mendukung 3 Tipe: Ekonomi, Standar, Superior & Konfigurasi Bed (Double s/d 8 Bed)
// =========================================================================
interface RoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomToEdit: Room | null;
  defaultBuilding?: string;
}

export function RoomModal({ isOpen, onClose, roomToEdit, defaultBuilding }: RoomModalProps) {
  const { addRoom, updateRoom, buildings, rooms = [], currentUser, showToast, roomCapacityRates } = useAppContext();
  const isEdit = Boolean(roomToEdit);

  useBodyScrollLock(isOpen);

  const [roomNumber, setRoomNumber] = useState('');
  const [building, setBuilding] = useState(defaultBuilding || buildings[0]?.name || 'Gedung A (Arafah)');
  const [floor, setFloor] = useState(1);
  const [capacity, setCapacity] = useState(4);
  const [type, setType] = useState('Standar');
  const [bedType, setBedType] = useState('4 Single Bed');
  const [status, setStatus] = useState<'KOSONG' | 'TERISI' | 'BOOKED' | 'MAINTENANCE'>('KOSONG');
  const [pricePerNight, setPricePerNight] = useState(480000);
  const [facilitiesText, setFacilitiesText] = useState('AC Split Dingin, 4 Single Bed, Kamar Mandi Dalam, Water Heater, Linen Bersih UPT, Lemari 4 Pintu, Sajadah');
  const [selectedTypeMode, setSelectedTypeMode] = useState('Standar');
  const [customTypeInput, setCustomTypeInput] = useState('');

  const knownRoomTypes = useMemo(() => {
    const list = ['Ekonomi', 'Standar', 'Superior', 'Deluxe', 'VIP', 'VVIP', 'Suite', 'Transit'];
    (roomCapacityRates || []).forEach(r => {
      if (r.roomType && !list.includes(r.roomType)) {
        list.push(r.roomType);
      }
    });
    return list;
  }, [roomCapacityRates]);

  const selectedBuilding = buildings.find(b => b.name === building);
  const isSerbagunaRoom = Boolean(
    selectedBuilding?.category === 'SERBAGUNA' || 
    selectedBuilding?.category === 'RUANG_PERTEMUAN' ||
    building === 'Ruang Pertemuan' || 
    building === 'Gedung Serbaguna (SG)' || 
    building === 'Gedung Serbaguna' || 
    type === 'Ruang Pertemuan / Aula' ||
    type === 'Gedung Serbaguna (SG)' ||
    isMeetingFacility(building) ||
    isMeetingFacility(type)
  );

  // Daftar tarif/bed yang terdaftar di katalog untuk tipe kamar ini
  const registeredBedRatesForType = useMemo(() => {
    return (roomCapacityRates || []).filter(r => 
      r.roomType.toLowerCase() === type.toLowerCase() && r.isActive !== false
    );
  }, [roomCapacityRates, type]);

  // Daftar semua pilihan bed (termasuk yang ada di katalog atau standar)
  const allBedOptions = useMemo(() => {
    const defaultBeds = [
      'Double Bed',
      '2 Single Bed',
      '3 Single Bed',
      '4 Single Bed',
      '5 Single Bed',
      '6 Single Bed',
      '7 Single Bed',
      '8 Single Bed'
    ];
    const registeredBeds = registeredBedRatesForType.map(r => r.bedType);
    return Array.from(new Set([...registeredBeds, ...defaultBeds]));
  }, [registeredBedRatesForType]);

  const isCurrentBedRegistered = useMemo(() => {
    if (isSerbagunaRoom) return true;
    return registeredBedRatesForType.some(r => r.bedType.toLowerCase() === bedType.toLowerCase());
  }, [isSerbagunaRoom, registeredBedRatesForType, bedType]);

  const handleFloorChange = (newFloorVal: number) => {
    const validFloor = Math.max(1, Math.min(20, newFloorVal || 1));
    setFloor(validFloor);
    if (!isSerbagunaRoom) {
      const targetBld = buildings.find(b => b.name === building);
      if (!isEdit) {
        // Otomatis melanjutkan dari kamar terakhir di lantai yang baru diketik/dipilih
        const next = getNextRoomNumber(rooms, building, validFloor, targetBld?.code);
        setRoomNumber(next);
      } else {
        const updated = updateRoomNumberWithFloor(roomNumber, validFloor, targetBld?.code);
        setRoomNumber(updated);
      }
    }
  };

  const handleBuildingChange = (newBldName: string) => {
    setBuilding(newBldName);
    const bObj = buildings.find(b => b.name === newBldName);
    const isMtg = bObj?.category === 'SERBAGUNA' || bObj?.category === 'RUANG_PERTEMUAN' || newBldName === 'Ruang Pertemuan' || newBldName === 'Gedung Serbaguna (SG)' || newBldName === 'Gedung Serbaguna' || isMeetingFacility(newBldName);
    if (isMtg) {
      const isSG = newBldName.toLowerCase().includes('serbaguna') || bObj?.category === 'SERBAGUNA';
      handleTypeOrBedChange(isSG ? 'Gedung Serbaguna (SG)' : 'Ruang Pertemuan / Aula', '');
    } else if (!isEdit) {
      // Otomatis melanjutkan dari kamar terakhir di gedung baru pada lantai saat ini
      const next = getNextRoomNumber(rooms, newBldName, floor, bObj?.code);
      setRoomNumber(next);
    }
  };

  const handleRoomNumberChange = (newVal: string) => {
    setRoomNumber(newVal);
    if (!isSerbagunaRoom) {
      const detected = extractFloorFromRoomNumber(newVal);
      if (detected !== null && detected >= 1 && detected <= 20) {
        setFloor(detected);
      }
    }
  };

  const applyAutoRoomNumber = () => {
    if (isSerbagunaRoom) return;
    const targetBld = buildings.find(b => b.name === building);
    const next = getNextRoomNumber(rooms, building, floor, targetBld?.code);
    setRoomNumber(next);
    showToast(`Nomor kamar diperbarui otomatis: ${next}`, 'success');
  };

  useEffect(() => {
    if (roomToEdit) {
      const rNum = roomToEdit.roomNumber || '';
      setRoomNumber(rNum);
      const bldName = roomToEdit.building || defaultBuilding || buildings[0]?.name || 'Gedung A (Arafah)';
      setBuilding(bldName);
      const detectedFloor = extractFloorFromRoomNumber(rNum);
      setFloor(detectedFloor !== null ? detectedFloor : (roomToEdit.floor || 1));
      
      const rType = roomToEdit.type || 'Standar';
      const rBed = roomToEdit.bedType || '4 Single Bed';
      if (knownRoomTypes.includes(rType) || rType === 'Ruang Pertemuan / Aula') {
        setSelectedTypeMode(rType);
        setCustomTypeInput('');
      } else {
        setSelectedTypeMode('CUSTOM');
        setCustomTypeInput(rType);
      }
      setType(rType);
      setBedType(rBed);
      
      const capNum = roomToEdit.capacityNumber || parseInt(String(roomToEdit.capacity).replace(/\D/g, '')) || 4;
      setCapacity(capNum);
      setStatus(roomToEdit.status || 'KOSONG');
      const defRate = findRoomRate(rType, rBed, roomCapacityRates);
      const catalogPrice = defRate ? defRate.pricePerNight : roomToEdit.pricePerNight;
      setPricePerNight(catalogPrice || 480000);
      setFacilitiesText((roomToEdit.facilities || []).join(', '));
    } else {
      const targetBldName = defaultBuilding || buildings[0]?.name || 'Gedung A (Arafah)';
      const targetBldObj = buildings.find(b => b.name === targetBldName) || buildings[0];
      setBuilding(targetBldName);
      setFloor(1);
      // Menghitung nomor kamar otomatis melanjutkan dari kamar terakhir di lantai 1
      const autoNum = getNextRoomNumber(rooms, targetBldName, 1, targetBldObj?.code);
      setRoomNumber(autoNum);
      setSelectedTypeMode('Standar');
      setCustomTypeInput('');
      setType('Standar');
      setBedType('4 Single Bed');
      setCapacity(4);
      setStatus('KOSONG');
      const defRate = findRoomRate('Standar', '4 Single Bed', roomCapacityRates);
      setPricePerNight(defRate?.pricePerNight || 480000);
      setFacilitiesText(defRate?.facilities?.join(', ') || 'AC Split Dingin, 4 Single Bed, Kamar Mandi Dalam, Water Heater, Linen Bersih UPT, Lemari 4 Pintu, Sajadah');
    }
  }, [roomToEdit, isOpen, buildings, rooms, roomCapacityRates, knownRoomTypes, defaultBuilding]);

  if (!isOpen) return null;

  const handleTypeOrBedChange = (newType: string, newBed: string) => {
    let resolvedBed = newBed;
    const isMtg = newType === 'Ruang Pertemuan / Aula' || newType === 'Gedung Serbaguna (SG)' || newType.toLowerCase().includes('serbaguna');

    if (!isMtg) {
      const availableRatesForNewType = (roomCapacityRates || []).filter(r => 
        r.roomType.toLowerCase() === newType.toLowerCase() && r.isActive !== false
      );
      const isNewBedAvailable = availableRatesForNewType.some(r => r.bedType.toLowerCase() === newBed.toLowerCase());
      if (!isNewBedAvailable && availableRatesForNewType.length > 0) {
        resolvedBed = availableRatesForNewType[0].bedType;
      }
    }

    setType(newType);
    setBedType(resolvedBed);

    if (isMtg) {
      const isSG = newType.toLowerCase().includes('serbaguna') || building.toLowerCase().includes('serbaguna');
      if (capacity <= 8) setCapacity(isSG ? 1000 : 500);
      if (pricePerNight <= 1500000) setPricePerNight(isSG ? 15000000 : 8500000);
      setFacilitiesText(isSG 
        ? 'AC Sentral, Panggung Utama, Sound System 10.000 Watt, Videotron LED, VIP Room, Kursi Konvensi' 
        : 'AC Sentral, Sound System 5000W, Proyektor & Videotron, Kursi VIP & Seminar, Podium Pidato, Ruang Rias & Toilet VIP');
      return;
    }

    const matchedRate = findRoomRate(newType, resolvedBed, roomCapacityRates);
    if (matchedRate) {
      setCapacity(matchedRate.capacityPax);
      setPricePerNight(matchedRate.pricePerNight);
      if (matchedRate.facilities && matchedRate.facilities.length > 0) {
        setFacilitiesText(matchedRate.facilities.join(', '));
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomNumber.trim()) {
      showToast('Nomor kamar wajib diisi!', 'warning');
      return;
    }

    const finalType = selectedTypeMode === 'CUSTOM' ? (customTypeInput.trim() || 'Kustom') : type;

    if (!isSerbagunaRoom && !isCurrentBedRegistered) {
      showToast(`Tempat tidur '${bedType}' belum terdaftar di Katalog Tipe Kamar untuk tipe '${finalType}'. Pilihlah opsi bed yang tersedia atau daftarkan terlebih dahulu di Katalog Tipe Kamar.`, 'warning');
      return;
    }

    const facilitiesArray = facilitiesText
      .split(',')
      .map(f => f.trim())
      .filter(f => f.length > 0);

    const parsedCap = Number(capacity) || 1;
    const matchedCatalogRate = findRoomRate(finalType, bedType, roomCapacityRates);
    const inputPrice = Number(pricePerNight);
    const finalPrice = (!isNaN(inputPrice) && inputPrice > 0)
      ? inputPrice
      : (!isSerbagunaRoom && matchedCatalogRate ? matchedCatalogRate.pricePerNight : 400000);

    if (isEdit && roomToEdit) {
      updateRoom({
        ...roomToEdit,
        roomNumber: roomNumber.trim(),
        building,
        floor: Number(floor) || 1,
        capacity: `${parsedCap} Orang`,
        capacityNumber: parsedCap,
        type: finalType,
        bedType: isSerbagunaRoom ? undefined : bedType,
        status,
        pricePerNight: finalPrice,
        facilities: facilitiesArray
      });
    } else {
      addRoom({
        id: getNextSequentialId(rooms, 'room-'),
        roomNumber: roomNumber.trim(),
        building,
        floor: Number(floor) || 1,
        capacity: `${parsedCap} Orang`,
        capacityNumber: parsedCap,
        type: finalType,
        bedType: isSerbagunaRoom ? undefined : bedType,
        status,
        qcStatus: 'LOLOS_QC',
        activeTxId: null,
        activeMaintId: null,
        pricePerNight: finalPrice,
        facilities: facilitiesArray
      });
    }

    onClose();
  };

  const canManage = currentUser && (isSuperAdmin(currentUser.role) || currentUser.role === 'Admin' || isRecepRole(currentUser.role));

  return (
    <div 
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`bg-gradient-to-r ${
          isSerbagunaRoom 
            ? 'from-slate-900 via-purple-950 to-slate-900' 
            : type === 'Superior'
            ? 'from-slate-900 via-indigo-950 to-slate-900'
            : type === 'Ekonomi'
            ? 'from-slate-900 via-teal-950 to-slate-900'
            : 'from-slate-900 via-blue-950 to-slate-900'
        } text-white p-4 flex items-center justify-between transition-colors border-b border-blue-900/40`}>
          <div className="flex items-center space-x-2.5">
            <div className={`w-9 h-9 rounded-lg ${
              isSerbagunaRoom
                ? (building.toLowerCase().includes('serbaguna') || type.toLowerCase().includes('serbaguna') ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30' : 'bg-purple-500/20 text-purple-400 border border-purple-400/30')
                : type === 'Superior'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/30'
                : type === 'Ekonomi'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-400/30'
                : 'bg-blue-500/20 text-blue-400 border border-blue-400/30'
            } flex items-center justify-center text-base`}>
              <i className={`fa-solid ${isSerbagunaRoom ? (building.toLowerCase().includes('serbaguna') || type.toLowerCase().includes('serbaguna') ? 'fa-building-columns' : 'fa-landmark') : 'fa-bed'}`}></i>
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center space-x-2">
                <span>{isEdit ? (isSerbagunaRoom ? (building.toLowerCase().includes('serbaguna') || type.toLowerCase().includes('serbaguna') ? 'Edit Fasilitas Gedung Serbaguna' : 'Edit Ruang Pertemuan / Aula') : 'Edit Unit Kamar') : (isSerbagunaRoom ? (building.toLowerCase().includes('serbaguna') || type.toLowerCase().includes('serbaguna') ? 'Input Fasilitas Gedung Serbaguna' : 'Input Ruang Pertemuan') : 'Input Kamar Tidur Baru')}</span>
                {!isSerbagunaRoom && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                    type === 'Superior'
                      ? 'bg-indigo-500/30 text-indigo-300 border-indigo-400/30'
                      : type === 'Ekonomi'
                      ? 'bg-teal-500/30 text-teal-300 border-teal-400/30'
                      : 'bg-blue-500/30 text-blue-300 border-blue-400/30'
                  }`}>
                    {type}
                  </span>
                )}
                {isSerbagunaRoom && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                    building.toLowerCase().includes('serbaguna') || type.toLowerCase().includes('serbaguna')
                      ? 'bg-amber-500/30 text-amber-300 border-amber-400/30'
                      : 'bg-purple-500/30 text-purple-300 border-purple-400/30'
                  }`}>
                    {building.toLowerCase().includes('serbaguna') || type.toLowerCase().includes('serbaguna') ? 'Gedung Serbaguna (SG)' : 'Aula / Serbaguna'}
                  </span>
                )}
              </h3>
              <p className="text-[10px] text-blue-200">
                {isSerbagunaRoom 
                  ? (building.toLowerCase().includes('serbaguna') || type.toLowerCase().includes('serbaguna') ? 'Pangkalan Data Fasilitas Gedung Serbaguna & Konvensi UPT' : 'Pangkalan Data Fasilitas Ruang Pertemuan & Aula')
                  : 'Manajemen Kamar Hunian UPT Asrama Haji Jakarta'}
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-1 rounded-lg transition hover:bg-white/10"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {!canManage ? (
          <div className="p-6 text-center space-y-3 bg-white dark:bg-slate-800">
            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-xl flex items-center justify-center mx-auto text-xl">
              <i className="fa-solid fa-lock"></i>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
              Anda tidak memiliki otorisasi untuk menambah atau mengubah data kamar.
            </p>
            <button 
              type="button" 
              onClick={onClose} 
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl hover:bg-slate-300 dark:hover:bg-slate-600 transition"
            >
              Tutup
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-3.5 max-h-[80vh] overflow-y-auto custom-scrollbar bg-white dark:bg-slate-800">
            {isSerbagunaRoom && (
              <div className="p-3 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 rounded-xl flex items-start space-x-2.5 text-xs text-purple-900 dark:text-purple-200">
                <i className="fa-solid fa-landmark text-purple-600 dark:text-purple-400 text-sm mt-0.5 shrink-0"></i>
                <div>
                  <span className="font-bold block text-purple-950 dark:text-purple-100">Fasilitas Pertemuan / Aula</span>
                  <p className="text-[11px] text-purple-800 dark:text-purple-300 leading-relaxed">
                    Unit ini merupakan fasilitas pertemuan/aula publik (bukan kamar tidur). Anda juga dapat mengelola fasilitas ini secara lengkap di tab <strong>Katalog Ruang Pertemuan</strong>.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Gedung Penginapan *</label>
              <select
                value={building}
                onChange={e => handleBuildingChange(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
              >
                {buildings
                  .filter(b => 
                    b.category !== 'SERBAGUNA' && 
                    b.category !== 'RUANG_PERTEMUAN' && 
                    !b.name.toLowerCase().includes('serbaguna') && 
                    !b.name.toLowerCase().includes('pertemuan') &&
                    !b.name.toLowerCase().includes('aula') &&
                    b.name !== 'Gedung Sekretariat' && 
                    b.name !== 'Kawasan Utama'
                  )
                  .slice()
                  .sort((a, b) => compareBuildingOrder(a.name, b.name))
                  .map(b => (
                    <option key={b.id || b.name} value={b.name}>
                      🏨 {b.name} ({b.totalRooms || 3} Unit Kamar)
                    </option>
                  ))}
              </select>
              <p className="text-[10px] text-slate-500">
                Pilih gedung penginapan yang menjadi lokasi unit kamar ini. Fasilitas aula &amp; serbaguna disewa per gedung/ruangan utuh.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    {isSerbagunaRoom ? 'Nama / No Ruangan *' : 'Nomor Kamar *'}
                  </label>
                  {!isSerbagunaRoom && !isEdit && (
                    <button
                      type="button"
                      onClick={applyAutoRoomNumber}
                      className="text-[10px] text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 font-bold flex items-center space-x-1 cursor-pointer bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800"
                      title="Hitung ulang otomatis dari kamar terakhir di lantai ini"
                    >
                      <i className="fa-solid fa-wand-magic-sparkles text-[9px]"></i>
                      <span>Auto Nomor</span>
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  required
                  placeholder={isSerbagunaRoom ? 'Contoh: Aula Serbaguna 1' : 'Contoh: A-101'}
                  value={roomNumber}
                  onChange={e => handleRoomNumberChange(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                {!isSerbagunaRoom && (
                  <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                    <i className="fa-solid fa-circle-check mr-1 text-[9px]"></i>
                    Otomatis melanjutkan dari nomor kamar terakhir di Lantai {floor}.
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Lantai Ke- *</label>
                  {!isSerbagunaRoom && (
                    <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">
                      Lantai {floor}
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={floor}
                  onChange={e => handleFloorChange(parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                {!isSerbagunaRoom && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Ketik lantai untuk langsung melanjutkan kamar terakhir lantai tersebut (misal: Lantai 2 → A-211).
                  </p>
                )}
              </div>
            </div>

            {/* Pilihan Tipe Kamar & Konfigurasi Bed */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between">
                  <span>Tipe Kamar <span className="text-rose-500">*</span></span>
                  <span className="text-[10px] text-blue-600 font-semibold">Bebas Kustom</span>
                </label>
                <select
                  value={selectedTypeMode}
                  onChange={e => {
                    const newMode = e.target.value;
                    setSelectedTypeMode(newMode);
                    const effType = newMode === 'CUSTOM' ? (customTypeInput.trim() || 'Kustom') : newMode;
                    handleTypeOrBedChange(effType, bedType);
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <optgroup label="Tipe Standar &amp; Populer">
                    <option value="Ekonomi">🟢 Ekonomi</option>
                    <option value="Standar">🔵 Standar (Reguler/Haji)</option>
                    <option value="Superior">🟣 Superior (Deluxe/VIP)</option>
                    <option value="Deluxe">🟡 Deluxe</option>
                    <option value="VIP">🔴 VIP / VVIP</option>
                    <option value="Suite">💎 Suite</option>
                    <option value="Transit">⏱️ Transit</option>
                  </optgroup>
                  {knownRoomTypes.filter(t => !['Ekonomi', 'Standar', 'Superior', 'Deluxe', 'VIP', 'VVIP', 'Suite', 'Transit'].includes(t) && t !== 'Ruang Pertemuan / Aula' && !t.includes('Serbaguna')).length > 0 && (
                    <optgroup label="Tipe Kustom Tersimpan di Database">
                      {knownRoomTypes.filter(t => !['Ekonomi', 'Standar', 'Superior', 'Deluxe', 'VIP', 'VVIP', 'Suite', 'Transit'].includes(t) && t !== 'Ruang Pertemuan / Aula' && !t.includes('Serbaguna')).map(t => (
                        <option key={t} value={t}>🏷️ {t}</option>
                      ))}
                    </optgroup>
                  )}
                  <option value="CUSTOM">➕ Tulis Tipe Kamar Baru (Kustom)...</option>
                </select>

                {selectedTypeMode === 'CUSTOM' && (
                  <div className="pt-1 animate-in fade-in duration-150">
                    <input
                      type="text"
                      required
                      placeholder="Ketik tipe kamar baru..."
                      value={customTypeInput}
                      onChange={e => {
                        setCustomTypeInput(e.target.value);
                        handleTypeOrBedChange(e.target.value || 'Kustom', bedType);
                      }}
                      className="w-full bg-blue-50/80 dark:bg-slate-900 border-2 border-blue-400 dark:border-blue-600 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      autoFocus
                    />
                  </div>
                )}
              </div>

              {!isSerbagunaRoom ? (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between">
                    <span>Tempat Tidur (Bed) <span className="text-rose-500">*</span></span>
                    <span className="text-[10px] text-emerald-600 font-semibold">Kapasitas {capacity} Pax</span>
                  </label>
                  <select
                    value={bedType}
                    onChange={e => handleTypeOrBedChange(type, e.target.value)}
                    className={`w-full bg-slate-50 dark:bg-slate-900 border rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer ${
                      !isCurrentBedRegistered
                        ? 'border-rose-400 dark:border-rose-600 ring-1 ring-rose-400'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {allBedOptions.map(opt => {
                      const matched = registeredBedRatesForType.find(r => r.bedType.toLowerCase() === opt.toLowerCase());
                      const isRegistered = Boolean(matched);
                      return (
                        <option 
                          key={opt} 
                          value={opt} 
                          disabled={!isRegistered}
                          className={!isRegistered ? 'text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800' : 'text-slate-900 dark:text-slate-100 font-bold'}
                        >
                          {isRegistered 
                            ? `✓ ${opt} (${matched?.capacityPax || 2} Pax • ${formatRupiah(matched?.pricePerNight || 0)})`
                            : `✕ ${opt} (Belum Terdaftar di Katalog Tipe Kamar)`}
                        </option>
                      );
                    })}
                  </select>

                  {!isCurrentBedRegistered ? (
                    <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-[10.5px] text-rose-800 dark:text-rose-200 flex items-start space-x-1.5 animate-in fade-in">
                      <i className="fa-solid fa-triangle-exclamation text-rose-600 mt-0.5 shrink-0"></i>
                      <div>
                        <span className="font-bold">Bed Belum Terdaftar:</span>
                        <p className="mt-0.5 text-[10px] leading-relaxed">
                          Pilihan <strong>{bedType}</strong> belum terdaftar di sub menu <strong>Katalog Tipe Kamar</strong> untuk tipe <strong>{type}</strong> sehingga tidak dapat dipilih. Pilihlah opsi bertanda centang hijau (✓), atau daftarkan konfigurasi baru ini terlebih dahulu di Katalog Tipe Kamar.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1">
                      <i className="fa-solid fa-circle-check text-[9px]"></i>
                      Terdaftar di Katalog Resmi ({registeredBedRatesForType.find(r => r.bedType.toLowerCase() === bedType.toLowerCase())?.capacityPax} Pax • Terkoneksi)
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Kapasitas Peserta (Orang)</label>
                  <input
                    type="number"
                    min={1}
                    max={2000}
                    value={capacity}
                    onChange={e => setCapacity(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              )}
            </div>

            {/* Info Badge Otomatis */}
            {!isSerbagunaRoom && (
              <div className="p-2.5 bg-emerald-50/70 dark:bg-slate-900/60 border border-emerald-200 dark:border-slate-700 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <i className="fa-solid fa-tags text-emerald-600"></i>
                  <span className="text-slate-600 dark:text-slate-300 text-[11px]">
                    Tarif Resmi Katalog <strong>{type} ({bedType})</strong>:
                  </span>
                </div>
                <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400 text-xs">
                  {formatRupiah(findRoomRate(type, bedType, roomCapacityRates)?.pricePerNight || pricePerNight)} / malam
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    {isSerbagunaRoom ? 'Tarif Sewa per Sesi/Hari (Rp)' : 'Tarif Sewa per Malam'}
                  </label>
                  {!isSerbagunaRoom && (
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                      <i className="fa-solid fa-circle-check text-[9px]"></i> Otomatis Katalog
                    </span>
                  )}
                </div>
                {!isSerbagunaRoom ? (
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      tabIndex={-1}
                      value={`${formatRupiah(findRoomRate(type, bedType, roomCapacityRates)?.pricePerNight || pricePerNight)} / malam`}
                      className="w-full bg-slate-100 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 cursor-not-allowed select-none"
                    />
                    <div className="absolute right-3 top-2.5 text-emerald-600 text-xs">
                      <i className="fa-solid fa-lock text-[10px]"></i>
                    </div>
                  </div>
                ) : (
                  <input
                    type="number"
                    step={25000}
                    value={pricePerNight}
                    onChange={e => setPricePerNight(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                )}
                {!isSerbagunaRoom && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Tarif terisi otomatis dari Katalog Tarif. Tidak perlu diisi manual.
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Status Operasional</label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as any)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option key="KOSONG" value="KOSONG">{isSerbagunaRoom ? 'Tersedia (Dapat Disewa)' : 'Kosong (Tersedia)'}</option>
                  <option key="TERISI" value="TERISI">{isSerbagunaRoom ? 'Terpakai / Berlangsung Acara' : 'Terisi (Check-In)'}</option>
                  <option key="BOOKED" value="BOOKED">Booked (Reservasi Acara)</option>
                  <option key="MAINTENANCE" value="MAINTENANCE">Maintenance</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                {isSerbagunaRoom ? 'Fasilitas Aula / Ruang Rapat (Pisahkan dengan koma)' : 'Fasilitas Kamar (Pisahkan dengan koma)'}
              </label>
              <textarea
                rows={2}
                placeholder={isSerbagunaRoom ? 'AC Sentral, Sound System 5000W, Videotron, Kursi VIP...' : 'AC Split, Kamar Mandi Dalam, Linen Steril, Lemari...'}
                value={facilitiesText}
                onChange={e => setFacilitiesText(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-xl shadow transition flex items-center space-x-1.5 cursor-pointer"
              >
                <i className="fa-solid fa-floppy-disk"></i>
                <span>{isEdit ? 'Simpan Perubahan Kamar' : 'Tambahkan Kamar Baru'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// =========================================================================
// 3B. MODAL KELOLA MASTER TARIF & KAPASITAS KAMAR (CRUD KATALOG)
// =========================================================================
interface RoomCapacityRateModalProps {
  isOpen: boolean;
  onClose: () => void;
  rateToEdit: RoomCapacityRate | null;
}

export function RoomCapacityRateModal({ isOpen, onClose, rateToEdit }: RoomCapacityRateModalProps) {
  const { addRoomCapacityRate, updateRoomCapacityRate, applyRateToAllRooms, currentUser, showToast, roomCapacityRates = [] } = useAppContext();
  const isEdit = Boolean(rateToEdit);

  useBodyScrollLock(isOpen);

  const [selectedTypeMode, setSelectedTypeMode] = useState<string>('Standar');
  const [customTypeName, setCustomTypeName] = useState('');
  const [bedType, setBedType] = useState('4 Single Bed');
  const [capacityPax, setCapacityPax] = useState(4);
  const [pricePerNight, setPricePerNight] = useState(480000);
  const [description, setDescription] = useState('');
  const [facilitiesText, setFacilitiesText] = useState('AC Split Dingin, 4 Single Bed, Kamar Mandi Dalam, Water Heater, Linen Bersih, Lemari');
  const [applyToExistingRooms, setApplyToExistingRooms] = useState(true);

  // Daftar tipe kamar unik yang sudah ada di database
  const knownTypes = useMemo(() => {
    const list = ['Ekonomi', 'Standar', 'Superior', 'Deluxe', 'VIP', 'VVIP', 'Suite', 'Transit'];
    (roomCapacityRates || []).forEach(r => {
      if (r.roomType && !list.includes(r.roomType)) {
        list.push(r.roomType);
      }
    });
    return list;
  }, [roomCapacityRates]);

  useEffect(() => {
    if (rateToEdit) {
      const rType = rateToEdit.roomType || 'Standar';
      if (knownTypes.includes(rType)) {
        setSelectedTypeMode(rType);
        setCustomTypeName('');
      } else {
        setSelectedTypeMode('CUSTOM');
        setCustomTypeName(rType);
      }
      setBedType(rateToEdit.bedType || '4 Single Bed');
      setCapacityPax(rateToEdit.capacityPax || 4);
      setPricePerNight(rateToEdit.pricePerNight || 400000);
      setDescription(rateToEdit.description || '');
      setFacilitiesText((rateToEdit.facilities || []).join(', '));
      setApplyToExistingRooms(true);
    } else {
      setSelectedTypeMode('Standar');
      setCustomTypeName('');
      setBedType('4 Single Bed');
      setCapacityPax(4);
      setPricePerNight(480000);
      setDescription('');
      setFacilitiesText('AC Split Dingin, 4 Single Bed, Kamar Mandi Dalam, Water Heater, Linen Bersih, Lemari');
      setApplyToExistingRooms(true);
    }
  }, [rateToEdit, isOpen, knownTypes]);

  if (!isOpen) return null;

  const effectiveRoomType = selectedTypeMode === 'CUSTOM' ? (customTypeName.trim() || 'Kustom') : selectedTypeMode;

  const handleBedSelect = (newBed: string, currentType?: string) => {
    setBedType(newBed);
    const activeType = currentType || effectiveRoomType;
    let pax = 4;
    if (newBed === 'Double Bed' || newBed === '2 Single Bed') pax = 2;
    else if (newBed === '3 Single Bed') pax = 3;
    else if (newBed === '4 Single Bed') pax = 4;
    else if (newBed === '5 Single Bed') pax = 5;
    else if (newBed === '6 Single Bed') pax = 6;
    else if (newBed === '7 Single Bed') pax = 7;
    else if (newBed === '8 Single Bed') pax = 8;
    setCapacityPax(pax);

    // Auto default pricing estimate based on tier & pax
    let base = 250000;
    if (activeType === 'Standar') base = 350000;
    else if (activeType === 'Superior') base = 500000;
    else if (activeType === 'Deluxe') base = 650000;
    else if (activeType === 'VIP' || activeType === 'VVIP') base = 850000;
    else if (activeType === 'Suite') base = 1200000;
    else if (activeType === 'Transit') base = 200000;

    let addedPerBed = 0;
    if (pax > 2) {
      const extraBeds = pax - 2;
      const ratePerExtra = activeType === 'Ekonomi' ? 65000 : (activeType === 'Standar' ? 75000 : 100000);
      addedPerBed = extraBeds * ratePerExtra;
    }
    setPricePerNight(base + addedPerBed);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const finalRoomType = selectedTypeMode === 'CUSTOM' ? customTypeName.trim() : selectedTypeMode;
    if (!finalRoomType) {
      showToast('Nama tipe kamar wajib diisi!', 'warning');
      return;
    }

    const facilitiesArray = facilitiesText
      .split(',')
      .map(f => f.trim())
      .filter(f => f.length > 0);

    const payload: RoomCapacityRate = {
      id: rateToEdit?.id || `rcr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      roomType: finalRoomType,
      bedType,
      capacityPax: Number(capacityPax) || 2,
      pricePerNight: Number(pricePerNight) || 300000,
      description: description.trim() || `Kamar ${finalRoomType} dengan kapasitas ${capacityPax} orang (${bedType})`,
      facilities: facilitiesArray,
      isActive: true,
      updatedAt: new Date().toISOString()
    };

    if (isEdit && rateToEdit) {
      updateRoomCapacityRate(payload);
    } else {
      addRoomCapacityRate(payload);
    }

    if (applyToExistingRooms) {
      applyRateToAllRooms(finalRoomType, bedType, payload.pricePerNight, facilitiesArray);
    }

    onClose();
  };

  const canManage = currentUser && (isSuperAdmin(currentUser.role) || currentUser.role === 'Admin' || isRecepRole(currentUser.role) || currentUser.role === 'Manager');

  return (
    <div 
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white p-4 flex items-center justify-between border-b border-emerald-900/40">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-400/30 flex items-center justify-center text-base">
              <i className="fa-solid fa-tags"></i>
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center space-x-2">
                <span>{isEdit ? 'Edit Tipe Kamar & Tarif' : 'Tambah Tipe Kamar & Tarif'}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-300 font-bold border border-emerald-400/30">
                  {effectiveRoomType}
                </span>
              </h3>
              <p className="text-[10px] text-emerald-200">
                Pangkalan Data Katalog Tipe Kamar &amp; Kapasitas Bed UPT Asrama Haji
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-1 rounded-lg transition hover:bg-white/10"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {!canManage ? (
          <div className="p-6 text-center space-y-3 bg-white dark:bg-slate-800">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center mx-auto text-xl">
              <i className="fa-solid fa-lock"></i>
            </div>
            <p className="text-xs text-slate-600 font-medium">
              Hanya Administrator atau Manager Resepsionis yang dapat mengelola katalog tipe kamar.
            </p>
            <button 
              type="button" 
              onClick={onClose} 
              className="px-4 py-2 bg-slate-200 text-slate-800 font-bold text-xs rounded-xl hover:bg-slate-300 transition"
            >
              Tutup
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-3.5 max-h-[80vh] overflow-y-auto custom-scrollbar bg-white dark:bg-slate-800">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between">
                  <span>Tipe Kamar <span className="text-rose-500">*</span></span>
                  <span className="text-[10px] text-emerald-600 font-semibold">Bebas Kustom</span>
                </label>
                <select
                  value={selectedTypeMode}
                  onChange={e => {
                    const newMode = e.target.value;
                    setSelectedTypeMode(newMode);
                    const effType = newMode === 'CUSTOM' ? (customTypeName.trim() || 'Kustom') : newMode;
                    handleBedSelect(bedType, effType);
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <optgroup label="Tipe Standar &amp; Populer">
                    <option value="Ekonomi">🟢 Ekonomi</option>
                    <option value="Standar">🔵 Standar (Reguler/Haji)</option>
                    <option value="Superior">🟣 Superior (Deluxe/VIP)</option>
                    <option value="Deluxe">🟡 Deluxe</option>
                    <option value="VIP">🔴 VIP / VVIP</option>
                    <option value="Suite">💎 Suite</option>
                    <option value="Transit">⏱️ Transit</option>
                  </optgroup>
                  {knownTypes.filter(t => !['Ekonomi', 'Standar', 'Superior', 'Deluxe', 'VIP', 'VVIP', 'Suite', 'Transit'].includes(t)).length > 0 && (
                    <optgroup label="Tipe Kustom Tersimpan di Database">
                      {knownTypes.filter(t => !['Ekonomi', 'Standar', 'Superior', 'Deluxe', 'VIP', 'VVIP', 'Suite', 'Transit'].includes(t)).map(t => (
                        <option key={t} value={t}>🏷️ {t}</option>
                      ))}
                    </optgroup>
                  )}
                  <option value="CUSTOM">➕ Tulis Tipe Kamar Baru (Kustom)...</option>
                </select>

                {selectedTypeMode === 'CUSTOM' && (
                  <div className="pt-1 animate-in fade-in duration-150">
                    <input
                      type="text"
                      required
                      placeholder="Ketik nama tipe baru (misal: VIP Musyrif, Paviliun, dll.)"
                      value={customTypeName}
                      onChange={e => {
                        setCustomTypeName(e.target.value);
                        handleBedSelect(bedType, e.target.value || 'Kustom');
                      }}
                      className="w-full bg-emerald-50/80 dark:bg-slate-900 border-2 border-emerald-400 dark:border-emerald-600 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      autoFocus
                    />
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Konfigurasi Tempat Tidur <span className="text-rose-500">*</span>
                </label>
                <select
                  value={bedType}
                  onChange={e => handleBedSelect(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <option value="Double Bed">Double Bed (2 Orang)</option>
                  <option value="2 Single Bed">2 Single Bed (2 Orang)</option>
                  <option value="3 Single Bed">3 Single Bed (3 Orang)</option>
                  <option value="4 Single Bed">4 Single Bed (4 Orang)</option>
                  <option value="5 Single Bed">5 Single Bed (5 Orang)</option>
                  <option value="6 Single Bed">6 Single Bed (6 Orang)</option>
                  <option value="7 Single Bed">7 Single Bed (7 Orang)</option>
                  <option value="8 Single Bed">8 Single Bed (8 Orang)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Kapasitas Tamu (Orang)
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={capacityPax}
                  onChange={e => setCapacityPax(parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Tarif Sewa per Malam (Rp) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step={10000}
                  required
                  value={pricePerNight}
                  onChange={e => setPricePerNight(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Deskripsi Konfigurasi</label>
              <input
                type="text"
                placeholder="Contoh: Kamar Standar Quad 4 Bed resmi UPT Asrama Haji..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Fasilitas Standar (Pisahkan dengan koma)</label>
              <textarea
                rows={2}
                placeholder="AC Split, Kamar Mandi Dalam, Water Heater, Linen Bersih..."
                value={facilitiesText}
                onChange={e => setFacilitiesText(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div className="p-3 bg-emerald-50/80 dark:bg-slate-900/60 border border-emerald-200 dark:border-slate-700 rounded-xl">
              <label className="flex items-start space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyToExistingRooms}
                  onChange={e => setApplyToExistingRooms(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 mt-0.5"
                />
                <div className="text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">
                    Terapkan otomatis ke semua kamar yang memiliki tipe &amp; bed ini
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    Jika dicentang, unit kamar di Gedung A, B, C, D yang bertipe {effectiveRoomType} ({bedType}) akan langsung disinkronkan dengan tarif Rp {pricePerNight.toLocaleString('id-ID')}/malam.
                  </p>
                </div>
              </label>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow transition flex items-center space-x-1.5 cursor-pointer"
              >
                <i className="fa-solid fa-floppy-disk"></i>
                <span>{isEdit ? 'Simpan Konfigurasi Tarif' : 'Tambahkan Konfigurasi Tarif'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// =========================================================================
// 4. MODAL KONFIRMASI HAPUS
// =========================================================================
interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  itemName: string;
  itemType: string;
  onConfirm: () => void;
}

export function DeleteConfirmModal({ isOpen, onClose, title, itemName, itemType, onConfirm }: DeleteConfirmModalProps) {
  useBodyScrollLock(isOpen);
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-rose-200 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 bg-rose-50 border-b border-rose-100 flex items-center space-x-3 text-rose-800">
          <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-lg font-bold shrink-0">
            <i className="fa-solid fa-trash-can text-rose-600"></i>
          </div>
          <div>
            <h4 className="font-bold text-sm text-rose-950">{title}</h4>
            <p className="text-[11px] text-rose-600 font-medium">Konfirmasi Hapus dari Database</p>
          </div>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            Apakah Anda yakin ingin menghapus {itemType} <strong>&quot;{itemName}&quot;</strong> secara permanen dari database?
          </p>
          <div className="bg-rose-50 p-2.5 rounded-xl border border-rose-200 text-[11px] text-rose-800 font-medium leading-relaxed">
            <i className="fa-solid fa-triangle-exclamation mr-1.5 text-rose-600"></i>
            Tindakan ini akan menghapus data tersebut secara permanen dari Database Pusat (Google Spreadsheet) dan tidak dapat dibatalkan.
          </div>
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow transition flex items-center space-x-1.5 cursor-pointer"
          >
            <i className="fa-solid fa-trash-can"></i>
            <span>Ya, Hapus Permanen dari Database</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// 5. MODAL KONFIRMASI TINDAKAN UMUM (RESET & TERAPKAN MASSAL)
// =========================================================================
export interface ActionConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  message: string;
  confirmText: string;
  variant?: 'danger' | 'warning' | 'primary' | 'success';
  icon?: string;
  onConfirm: () => void;
}

export function ActionConfirmModal({
  isOpen,
  onClose,
  title,
  subtitle,
  message,
  confirmText,
  variant = 'primary',
  icon = 'fa-circle-question',
  onConfirm
}: ActionConfirmModalProps) {
  useBodyScrollLock(isOpen);
  if (!isOpen) return null;

  const bgHeader = variant === 'danger' 
    ? 'bg-rose-50 border-rose-100 text-rose-800'
    : variant === 'warning'
    ? 'bg-amber-50 border-amber-100 text-amber-900'
    : variant === 'success'
    ? 'bg-emerald-50 border-emerald-100 text-emerald-900'
    : 'bg-blue-50 border-blue-100 text-blue-900';

  const iconColor = variant === 'danger'
    ? 'bg-rose-100 text-rose-600'
    : variant === 'warning'
    ? 'bg-amber-100 text-amber-700'
    : variant === 'success'
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-blue-100 text-blue-700';

  const btnConfirm = variant === 'danger'
    ? 'bg-rose-600 hover:bg-rose-700 text-white'
    : variant === 'warning'
    ? 'bg-amber-600 hover:bg-amber-700 text-white'
    : variant === 'success'
    ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
    : 'bg-blue-700 hover:bg-blue-800 text-white';

  return (
    <div 
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`p-4 border-b flex items-center space-x-3 ${bgHeader}`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 ${iconColor}`}>
            <i className={`fa-solid ${icon}`}></i>
          </div>
          <div>
            <h4 className="font-bold text-sm text-slate-900">{title}</h4>
            <p className="text-[11px] opacity-80">{subtitle || 'Konfirmasi Tindakan Sistem'}</p>
          </div>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-700 leading-relaxed font-medium">
            {message}
          </p>
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 text-xs font-bold rounded-xl shadow transition flex items-center space-x-1.5 cursor-pointer ${btnConfirm}`}
          >
            <i className={`fa-solid ${icon}`}></i>
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
