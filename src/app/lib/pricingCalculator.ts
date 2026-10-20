import { Transaction, Room, RoomCapacityRate, MeetingRoom, BreakfastMenuItem } from '../types';
import { findRoomRate, initialRoomCapacityRates } from '../data';
import { dataStorage } from '../services/dataStorage';
import { formatRupiah, isMeetingFacility } from './utils';

export interface EntityPricingResult {
  ratePerUnit: number;
  ratePerUnitLabel: string;
  subtotalRooms: number;
  subtotalAula: number;
  subtotalExtraBed: number;
  subtotalCatering: number;
  grandTotal: number;
  formattedGrandTotal: string;
  breakdownSummary: string;
}

export interface MeetingRoomPricingItem {
  isAula: boolean;
  meetingRoom: MeetingRoom | null;
  name: string;
  session: string;
  isDaily: boolean;
  rate: number;
  qty: number;
  durationText: string;
  subtotal: number;
  rateUnitLabel: string;
}

/**
 * Fungsi kalkulasi resmi & tunggal untuk penyewaan fasilitas Ruang Pertemuan (Aula / Auditorium / Gedung SG)
 * Menjamin 100% konsistensi antara Laporan, Invoice, Kwitansi, dan Berkas PDF.
 */
export function calculateMeetingRoomPricing(
  tx: Partial<Transaction> | undefined | null,
  meetingRooms?: MeetingRoom[]
): MeetingRoomPricingItem {
  if (!tx) {
    return {
      isAula: false,
      meetingRoom: null,
      name: '',
      session: '',
      isDaily: false,
      rate: 0,
      qty: 0,
      durationText: '',
      subtotal: 0,
      rateUnitLabel: ''
    };
  }

  const allMeetingRooms = meetingRooms && meetingRooms.length > 0 
    ? meetingRooms 
    : dataStorage.getMeetingRooms();

  const isAula = tx.category === 'AULA' ||
                 tx.building === 'Ruang Pertemuan' || 
                 tx.building === 'Ruang Pertemuan / Aula' || 
                 tx.building === 'Gedung Serbaguna (SG)' || 
                 tx.building === 'Gedung Serbaguna' || 
                 isMeetingFacility(tx.building || '') || 
                 isMeetingFacility(tx.roomNumber || '') || 
                 Boolean(tx.rentType?.toLowerCase().includes('ruangan')) ||
                 Boolean(tx.rentType?.toLowerCase().includes('serbaguna')) ||
                 Boolean(tx.includeAula) ||
                 Boolean(tx.rentAulaName) ||
                 Boolean(tx.rentAulaId);

  if (!isAula) {
    return {
      isAula: false,
      meetingRoom: null,
      name: '',
      session: '',
      isDaily: false,
      rate: 0,
      qty: 0,
      durationText: '',
      subtotal: 0,
      rateUnitLabel: ''
    };
  }

  const targetName = (tx.rentAulaName || tx.roomNumber || '').trim().toLowerCase();
  const mrObj = allMeetingRooms.find(m => 
    (m.id && (m.id === tx.roomId || m.id === tx.rentAulaId)) ||
    (m.name && m.name.toLowerCase() === targetName) ||
    (m.code && m.code.toLowerCase() === targetName) ||
    (m.name && targetName && (targetName.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(targetName))) ||
    (m.code && targetName && (targetName.includes(m.code.toLowerCase()) || m.code.toLowerCase().includes(targetName))) ||
    (tx.building && m.name && m.name.toLowerCase() === tx.building.toLowerCase()) ||
    (tx.building && m.building && m.building.toLowerCase() === tx.building.toLowerCase())
  ) || null;

  const isSG = targetName.includes('serbaguna') || 
               targetName.includes('gedung sg') || 
               targetName.includes('sg-') || 
               (tx.building && (tx.building.toLowerCase().includes('serbaguna') || tx.building.toLowerCase().includes('gedung sg'))) || 
               mrObj?.category === 'SERBAGUNA';

  // Deteksi pemakaian Harian / 12-24 jam vs Sesi 8 jam
  const durUnit = (tx.durationUnit || '').toLowerCase();
  const rentType = (tx.rentType || '').toLowerCase();
  const sessionStr = (tx.rentAulaSession || '').toLowerCase();

  const isDayDuration = durUnit === 'hari' || 
                        rentType.includes('harian') ||
                        tx.rentAulaDuration === 12 || 
                        tx.rentAulaDuration === 24 || 
                        (tx.duration !== undefined && tx.duration >= 24) || 
                        sessionStr.includes('12 jam') || 
                        sessionStr.includes('harian') || 
                        sessionStr.includes('full day') ||
                        sessionStr.includes('seharian');

  // Tarif resmi (Gunakan tx.pricePerNight jika ada dan valid)
  const defaultDaily = mrObj?.dailyRate || (isSG ? 15000000 : 12000000);
  const defaultSession = mrObj?.sessionRate || (isSG ? 8500000 : 7000000);

  let rate = 0;
  if (tx.pricePerNight && tx.pricePerNight > 0) {
    rate = tx.pricePerNight;
  } else {
    rate = isDayDuration ? defaultDaily : defaultSession;
  }

  // Hitung jumlah hari / sesi pemakaian
  let qty = 1;
  if (tx.rentAulaDurationDays && tx.rentAulaDurationDays >= 1) {
    qty = tx.rentAulaDurationDays;
  } else if (durUnit === 'hari' || rentType.includes('harian')) {
    qty = Math.max(1, tx.duration || 1);
  } else if (tx.duration && tx.duration >= 24) {
    qty = Math.ceil(tx.duration / 24);
  } else {
    qty = 1;
  }

  const subtotal = rate * qty;
  const resolvedName = tx.rentAulaName || tx.roomNumber || mrObj?.name || 'Ruang Pertemuan / Aula';
  const sessionDesc = tx.rentAulaSession || (isDayDuration ? 'Sewa Harian Penuh (12 Jam)' : 'Sesi Reguler (8 Jam)');
  const durationText = `${qty} ${isDayDuration ? 'Hari' : 'Sesi'}`;
  const rateUnitLabel = `${formatRupiah(rate)} / ${isDayDuration ? 'Hari' : 'Sesi'}`;

  return {
    isAula: true,
    meetingRoom: mrObj,
    name: resolvedName,
    session: sessionDesc,
    isDaily: isDayDuration,
    rate,
    qty,
    durationText,
    subtotal,
    rateUnitLabel
  };
}

interface PricingOptions {
  rooms?: Room[];
  roomCapacityRates?: RoomCapacityRate[];
  meetingRooms?: MeetingRoom[];
  breakfastMenuItems?: BreakfastMenuItem[];
}

function resolveOptions(opts?: PricingOptions) {
  const rooms = opts?.rooms || dataStorage.getRooms();
  const roomCapacityRates = opts?.roomCapacityRates && opts.roomCapacityRates.length > 0
    ? opts.roomCapacityRates
    : dataStorage.getRoomCapacityRates() || initialRoomCapacityRates;
  const meetingRooms = opts?.meetingRooms && opts.meetingRooms.length > 0
    ? opts.meetingRooms
    : dataStorage.getMeetingRooms();
  const breakfastMenuItems = opts?.breakfastMenuItems && opts.breakfastMenuItems.length > 0
    ? opts.breakfastMenuItems
    : dataStorage.getBreakfastMenuItems();

  return { rooms, roomCapacityRates, meetingRooms, breakfastMenuItems };
}

/**
 * Menghitung rincian harga & tarif resmi (PNBP) untuk satu transaksi kamar individu atau aula
 */
export function calculateTransactionPricing(
  tx: Transaction,
  options?: PricingOptions
): EntityPricingResult {
  const { rooms, roomCapacityRates, meetingRooms, breakfastMenuItems } = resolveOptions(options);

  const mrPricing = calculateMeetingRoomPricing(tx, meetingRooms);
  const isPureAula = mrPricing.isAula && (
    tx.category === 'AULA' ||
    tx.building === 'Ruang Pertemuan' || 
    tx.building === 'Ruang Pertemuan / Aula' || 
    tx.building === 'Gedung Serbaguna (SG)' || 
    tx.building === 'Gedung Serbaguna' || 
    isMeetingFacility(tx.building || '') || 
    isMeetingFacility(tx.roomNumber || '') || 
    Boolean(tx.rentType?.toLowerCase().includes('ruangan')) ||
    Boolean(tx.rentType?.toLowerCase().includes('serbaguna'))
  );

  const nights = Math.max(1, tx.duration || 1);

  let subtotalRooms = 0;
  let subtotalAula = 0;
  let subtotalExtraBed = 0;
  let subtotalCatering = 0;
  let ratePerUnit = 0;
  let ratePerUnitLabel = '';

  if (mrPricing.isAula) {
    subtotalAula = mrPricing.subtotal;
    if (isPureAula) {
      ratePerUnit = mrPricing.rate;
      ratePerUnitLabel = mrPricing.rateUnitLabel;
    }
  }

  if (!isPureAula) {
    const rObj = rooms.find(r => r.id === tx.roomId || r.roomNumber === tx.roomNumber);
    const matchedRate = findRoomRate(rObj?.type || tx.category || 'Standar', rObj?.bedType, roomCapacityRates);
    const rate = rObj?.pricePerNight || matchedRate?.pricePerNight || (
      (rObj?.type || tx.category || '').toLowerCase().includes('superior') ? 500000 :
      (rObj?.type || tx.category || '').toLowerCase().includes('ekonomi') ? 380000 : 480000
    );
    subtotalRooms = rate * nights;
    ratePerUnit = rate;
    ratePerUnitLabel = `${formatRupiah(rate)} / Malam`;
  }

  // Extra Bed (bisa pada kamar maupun sewa aula jika ada request kasur panitia)
  if (tx.extraBed) {
    const ebRate = (tx.extraBedPrice !== undefined && tx.extraBedPrice !== null) ? tx.extraBedPrice : 100000;
    subtotalExtraBed = (tx.extraBedCount || 1) * ebRate * nights;
  }

  // Catering / Breakfast / Konsumsi Acara
  if (tx.cateringPackage && tx.cateringPackage !== 'TIDAK') {
    const pax = tx.cateringPaxCount || tx.breakfastPortions || tx.totalPax || 1;
    const days = tx.breakfastDays || (isPureAula ? (mrPricing.qty || 1) : nights);
    const mItem = breakfastMenuItems.find(m => m.name === tx.breakfastMenu);
    let rateCat = mItem?.price;
    if (!rateCat) {
      if (tx.cateringPackage === 'FULLBOARD') rateCat = 120000;
      else if (tx.cateringPackage === 'SNACK_AULA') rateCat = 25000;
      else rateCat = 25000;
    }
    subtotalCatering = pax * rateCat * days;
  } else if (tx.breakfast) {
    const mItem = breakfastMenuItems.find(m => m.name === tx.breakfastMenu);
    const rateBf = mItem?.price || 25000;
    const portions = tx.breakfastPortions || 1;
    const days = tx.breakfastDays || (isPureAula ? (mrPricing.qty || 1) : nights);
    subtotalCatering = portions * rateBf * days;
  }

  const grandTotal = subtotalRooms + subtotalAula + subtotalExtraBed + subtotalCatering;

  // Breakdown text summary
  const parts: string[] = [];
  if (subtotalRooms > 0) parts.push(`Kamar: ${formatRupiah(subtotalRooms)}`);
  if (subtotalAula > 0) parts.push(`Aula: ${formatRupiah(subtotalAula)}`);
  if (subtotalExtraBed > 0) parts.push(`Extra Bed: ${formatRupiah(subtotalExtraBed)}`);
  if (subtotalCatering > 0) parts.push(`Konsumsi: ${formatRupiah(subtotalCatering)}`);

  return {
    ratePerUnit,
    ratePerUnitLabel,
    subtotalRooms,
    subtotalAula,
    subtotalExtraBed,
    subtotalCatering,
    grandTotal,
    formattedGrandTotal: formatRupiah(grandTotal),
    breakdownSummary: parts.join(' • ') || formatRupiah(grandTotal)
  };
}

/**
 * Menghitung rincian harga & tarif resmi (PNBP) untuk Rombongan (Grup banyak kamar)
 */
export function calculateGroupPricing(
  grp: {
    duration?: number;
    durationUnit?: string;
    allRoomNumbers?: string[];
    includeAula?: boolean;
    rentAulaName?: string;
    rentAulaDurationDays?: number;
    extraBed?: boolean;
    extraBedCount?: number;
    cateringPackage?: string;
    cateringPaxCount?: number;
    totalPax?: number;
    breakfast?: boolean;
    breakfastPortions?: number;
    representativeTx?: Transaction;
  },
  options?: PricingOptions
): EntityPricingResult {
  const { rooms, roomCapacityRates, meetingRooms, breakfastMenuItems } = resolveOptions(options);

  const nights = Math.max(1, grp.duration || grp.representativeTx?.duration || 1);
  const roomNumbers = grp.allRoomNumbers || (grp.representativeTx?.allocatedRoomNumbers) || (grp.representativeTx?.roomNumber ? [grp.representativeTx.roomNumber] : []);

  let subtotalRooms = 0;
  roomNumbers.forEach(rn => {
    const rObj = rooms.find(r => r.roomNumber === rn);
    const matchedRate = findRoomRate(rObj?.type || 'Standar', rObj?.bedType, roomCapacityRates);
    const rate = rObj?.pricePerNight || matchedRate?.pricePerNight || (
      (rObj?.type || '').toLowerCase().includes('superior') ? 500000 :
      (rObj?.type || '').toLowerCase().includes('ekonomi') ? 380000 : 480000
    );
    subtotalRooms += rate * nights;
  });

  // Aula Sewa dalam Paket Rombongan
  let subtotalAula = 0;
  if (grp.includeAula && grp.rentAulaName) {
    const mrObj = meetingRooms.find(m => 
      m.name.toLowerCase() === grp.rentAulaName?.toLowerCase() || 
      m.code?.toLowerCase() === grp.rentAulaName?.toLowerCase()
    );
    const days = grp.rentAulaDurationDays || grp.representativeTx?.rentAulaDurationDays || 1;
    const durHours = grp.representativeTx?.rentAulaDuration || (grp.representativeTx?.rentAulaSession?.includes('12 Jam') ? 12 : 8);
    const isSG = mrObj?.category === 'SERBAGUNA' || grp.rentAulaName?.toLowerCase().includes('serbaguna');
    const sessionRate = mrObj?.sessionRate || (isSG ? 8500000 : 7000000);
    const dailyRate = mrObj?.dailyRate || (isSG ? 15000000 : 12000000);

    const is12Hours = durHours === 12 || Boolean(grp.representativeTx?.rentAulaSession?.includes('12 Jam'));
    const rate = is12Hours ? dailyRate : sessionRate;
    subtotalAula = rate * Math.max(1, days);
  }

  // Extra Bed
  let subtotalExtraBed = 0;
  if (grp.extraBed) {
    const bedCount = grp.extraBedCount || 1;
    const ebRate = (grp as any).extraBedPrice ?? grp.representativeTx?.extraBedPrice ?? 100000;
    subtotalExtraBed = bedCount * ebRate * nights;
  }

  // Catering / Breakfast
  let subtotalCatering = 0;
  const totalPax = grp.totalPax || (roomNumbers.length * 4) || 1;
  const days = grp.representativeTx?.breakfastDays || nights;

  if (grp.cateringPackage && grp.cateringPackage !== 'TIDAK') {
    const pax = grp.cateringPaxCount || totalPax;
    const menuItemName = grp.representativeTx?.breakfastMenu;
    const mItem = breakfastMenuItems.find(m => m.name === menuItemName);
    let rateCat = mItem?.price;
    if (!rateCat) {
      if (grp.cateringPackage === 'FULLBOARD') rateCat = 120000;
      else if (grp.cateringPackage === 'SNACK_AULA') rateCat = 25000;
      else rateCat = 25000;
    }
    subtotalCatering = pax * rateCat * days;
  } else if (grp.breakfast) {
    const menuItemName = grp.representativeTx?.breakfastMenu;
    const mItem = breakfastMenuItems.find(m => m.name === menuItemName);
    const rateBf = mItem?.price || 25000;
    const portions = grp.breakfastPortions || totalPax;
    subtotalCatering = portions * rateBf * days;
  }

  const grandTotal = subtotalRooms + subtotalAula + subtotalExtraBed + subtotalCatering;
  const avgRoomRate = roomNumbers.length > 0 ? Math.round(subtotalRooms / (roomNumbers.length * nights)) : 480000;

  const parts: string[] = [];
  if (subtotalRooms > 0) parts.push(`${roomNumbers.length} Kamar: ${formatRupiah(subtotalRooms)}`);
  if (subtotalAula > 0) parts.push(`Aula: ${formatRupiah(subtotalAula)}`);
  if (subtotalExtraBed > 0) parts.push(`Extra Bed: ${formatRupiah(subtotalExtraBed)}`);
  if (subtotalCatering > 0) parts.push(`Konsumsi: ${formatRupiah(subtotalCatering)}`);

  return {
    ratePerUnit: avgRoomRate,
    ratePerUnitLabel: `${formatRupiah(avgRoomRate)} / Kamar / Malam`,
    subtotalRooms,
    subtotalAula,
    subtotalExtraBed,
    subtotalCatering,
    grandTotal,
    formattedGrandTotal: formatRupiah(grandTotal),
    breakdownSummary: parts.join(' • ') || formatRupiah(grandTotal)
  };
}
