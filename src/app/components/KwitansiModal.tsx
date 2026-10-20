import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Transaction, Room, ConsolidatedGroupRecord } from '../types';
import { formatIndonesianDate, addDaysToDateStr, getRealTodayDate, formatRupiah, isMeetingFacility } from '../lib/utils';
import { useAppContext, isKeuanganRole, isRecepRole, isSuperAdmin } from '../store';
import { useBodyScrollLock } from '../lib/scrollLock';
import { consolidateGroupTransactions } from '../lib/reportExporter';
import { findRoomRate, INDONESIAN_BANKS, OFFICIAL_VA_CONFIG } from '../data';
import { calculateMeetingRoomPricing } from '../lib/pricingCalculator';
import { downloadElementAsPdf, downloadDirectKwitansiPdf } from '../lib/pdfDownloader';

function angkaKeTerbilang(nilai: number): string {
  if (isNaN(nilai) || nilai <= 0) return 'Nol Rupiah';
  const satuan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  
  function konversi(n: number): string {
    if (n < 12) return satuan[n];
    if (n < 20) return konversi(n - 10) + ' Belas';
    if (n < 100) return konversi(Math.floor(n / 10)) + ' Puluh' + (n % 10 !== 0 ? ' ' + konversi(n % 10) : '');
    if (n < 200) return 'Seratus' + (n - 100 !== 0 ? ' ' + konversi(n - 100) : '');
    if (n < 1000) return konversi(Math.floor(n / 100)) + ' Ratus' + (n % 100 !== 0 ? ' ' + konversi(n % 100) : '');
    if (n < 2000) return 'Seribu' + (n - 1000 !== 0 ? ' ' + konversi(n - 1000) : '');
    if (n < 1000000) return konversi(Math.floor(n / 1000)) + ' Ribu' + (n % 1000 !== 0 ? ' ' + konversi(n % 1000) : '');
    if (n < 1000000000) return konversi(Math.floor(n / 1000000)) + ' Juta' + (n % 1000000 !== 0 ? ' ' + konversi(n % 1000000) : '');
    if (n < 1000000000000) return konversi(Math.floor(n / 1000000000)) + ' Miliar' + (n % 1000000000 !== 0 ? ' ' + konversi(n % 1000000000) : '');
    return konversi(Math.floor(n / 1000000000000)) + ' Triliun' + (n % 1000000000000 !== 0 ? ' ' + konversi(n % 1000000000000) : '');
  }

  return konversi(Math.round(nilai)).trim() + ' Rupiah';
}

interface KwitansiModalProps {
  isOpen: boolean;
  onClose: () => void;
  tx: Transaction | null;
  room?: Room | null;
  groupKey?: string;
  groupRecord?: ConsolidatedGroupRecord;
  onOpenInvoice?: (tx: Transaction) => void;
}

export function KwitansiModal(props: KwitansiModalProps) {
  const { isOpen, tx } = props;
  useBodyScrollLock(Boolean(isOpen));

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('has-kwitansi-open');
      // Inject temporary A5 portrait print rule for guaranteed A5 portrait page setup
      let styleTag = document.getElementById('kwitansi-portrait-print-style') as HTMLStyleElement | null;
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'kwitansi-portrait-print-style';
        styleTag.innerHTML = `
          @media print {
            @page {
              size: A5 portrait !important;
              margin: 6mm 6mm !important;
            }
          }
        `;
        document.head.appendChild(styleTag);
      }
      return () => {
        document.body.classList.remove('has-kwitansi-open');
        const st = document.getElementById('kwitansi-portrait-print-style');
        if (st && st.parentNode) {
          st.parentNode.removeChild(st);
        }
      };
    }
  }, [isOpen]);

  if (!isOpen || !tx) {
    return null;
  }

  return <KwitansiModalInner {...props} tx={tx} />;
}

function KwitansiModalInner({
  onClose,
  tx,
  room,
  groupKey,
  groupRecord,
  onOpenInvoice
}: KwitansiModalProps & { tx: Transaction }) {
  const {
    currentUser,
    rooms,
    transactions,
    appSettings,
    dataStorage,
    openModal,
    showToast,
    roomCapacityRates = [],
    meetingRooms = [],
    breakfastMenuItems = []
  } = useAppContext();

  const settings = appSettings || dataStorage.getAppSettings();
  const realToday = getRealTodayDate();
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const printableSheetRef = useRef<HTMLDivElement>(null);

  // Check authorization
  const isAuthorized = 
    isKeuanganRole(currentUser?.role, currentUser?.department) || 
    isRecepRole(currentUser?.role) || 
    isSuperAdmin(currentUser?.role) ||
    currentUser?.role?.toLowerCase().includes('admin') ||
    currentUser?.role?.toLowerCase().includes('manager');

  // Consolidate group transactions
  const { rombonganList } = useMemo(() => {
    return consolidateGroupTransactions(transactions, rooms);
  }, [transactions, rooms]);

  const matchedGroup = useMemo(() => {
    if (!tx) return null;
    if (groupRecord) return groupRecord;
    if (groupKey) {
      const found = rombonganList.find(g => g.key === groupKey);
      if (found) return found;
    }
    return rombonganList.find(grp => 
      grp.representativeTx.id === tx.id ||
      (tx.groupId && grp.groupId === tx.groupId) ||
      (tx.groupName && grp.groupName.trim().toLowerCase() === tx.groupName.trim().toLowerCase() && grp.startDate === tx.startDate) ||
      (grp.allRoomNumbers && tx.roomNumber && grp.allRoomNumbers.includes(tx.roomNumber))
    );
  }, [rombonganList, tx, groupKey, groupRecord]);

  const isGroup = Boolean(matchedGroup || tx.isGroup || (tx.allocatedRoomNumbers && tx.allocatedRoomNumbers.length > 1));

  // Determine all rooms and member transactions
  const memberTransactions = matchedGroup ? matchedGroup.memberTransactions : transactions.filter(t => {
    if (t.id === tx.id) return true;
    if (tx.groupId && t.groupId === tx.groupId) return true;
    if (tx.isGroup && t.isGroup && tx.groupName && tx.groupName.trim().toLowerCase() === (t.groupName || '').trim().toLowerCase() && tx.startDate === t.startDate) return true;
    if (tx.allocatedRoomNumbers && tx.allocatedRoomNumbers.includes(t.roomNumber)) return true;
    return false;
  });

  const isMeetingTx = (t?: Transaction | null) => {
    if (!t) return false;
    return t.building === 'Ruang Pertemuan' || 
           t.building === 'Gedung Serbaguna (SG)' || 
           t.building === 'Gedung Serbaguna' || 
           isMeetingFacility(t.building) || 
           isMeetingFacility(t.roomNumber) || 
           Boolean(t.rentType?.toLowerCase().includes('ruangan') || t.rentType?.toLowerCase().includes('serbaguna'));
  };

  const roomNumberSet = new Set<string>();
  if (tx.roomNumber && !isMeetingTx(tx)) {
    roomNumberSet.add(tx.roomNumber);
  }
  if (tx.allocatedRoomNumbers && Array.isArray(tx.allocatedRoomNumbers)) {
    tx.allocatedRoomNumbers.forEach(rn => rn && !isMeetingFacility(rn) && roomNumberSet.add(rn));
  }
  memberTransactions.forEach(m => {
    if (!isMeetingTx(m) && m.roomNumber) {
      roomNumberSet.add(m.roomNumber);
    }
    if (m.allocatedRoomNumbers && Array.isArray(m.allocatedRoomNumbers)) {
      m.allocatedRoomNumbers.forEach(rn => rn && !isMeetingFacility(rn) && roomNumberSet.add(rn));
    }
  });

  const allocatedRoomNumbers = matchedGroup ? matchedGroup.allRoomNumbers : Array.from(roomNumberSet);

  const detailedAllocatedRooms = allocatedRoomNumbers.map((rNum, idx) => {
    const rObj = rooms.find(r => r.roomNumber === rNum);
    return {
      index: idx + 1,
      number: rNum,
      roomId: rObj?.id || `room-${idx + 1}`,
      building: rObj?.building || tx.building,
      type: rObj?.type || 'Standar',
      capacity: rObj?.capacity || 4
    };
  });

  const currentRoom = room || rooms.find(r => r.id === tx.roomId) || null;
  const isAulaMain = isMeetingTx(tx);
  const isSG = isAulaMain && (
    tx.building?.toLowerCase().includes('serbaguna') || 
    tx.roomNumber?.toLowerCase().includes('serbaguna') || 
    Boolean(tx.rentType?.toLowerCase().includes('serbaguna'))
  );
  const hasAula = Boolean(tx.includeAula || (tx.rentAulaId && tx.rentAulaId.trim() !== ''));
  const resolvedAulaName = tx.rentAulaName || 'Aula Utama UPT';
  const resolvedAulaSession = tx.rentAulaSession || 'Sewa Tambahan Acara';
  const resolvedAulaDurationDays = tx.rentAulaDurationDays || 1;

  const nights = tx.durationUnit === 'Malam' ? tx.duration : (tx.duration >= 24 ? Math.ceil(tx.duration / 24) : 1);
  const checkoutDate = !isAulaMain ? addDaysToDateStr(tx.startDate, tx.duration) : addDaysToDateStr(tx.startDate, nights);

  const uniqueBuildings = Array.from(new Set([
    tx.building,
    ...detailedAllocatedRooms.map(r => r.building)
  ])).filter(Boolean);

  const totalCapacity = detailedAllocatedRooms.reduce((acc, curr) => acc + (Number(curr.capacity) || 4), 0);

  // Pricing calculation mirroring invoice exactly
  const pricingDetails = useMemo(() => {
    // 1. Rooms
    const roomItems: {
      key: string;
      label: string;
      building: string;
      type: string;
      bedType: string;
      roomCount: number;
      roomsList: string[];
      ratePerNight: number;
      nights: number;
      subtotal: number;
    }[] = [];
    let subtotalRooms = 0;

    if (!isAulaMain) {
      const groupMap: Record<string, {
        building: string;
        type: string;
        bedType: string;
        rooms: string[];
        rate: number;
      }> = {};

      const sourceRooms = detailedAllocatedRooms.length > 0 
        ? detailedAllocatedRooms 
        : (tx.roomNumber ? [{
            index: 1,
            number: tx.roomNumber,
            roomId: tx.roomId || 'room-1',
            building: tx.building,
            type: currentRoom?.type || tx.category || 'Standar',
            capacity: 4
          }] : []);

      sourceRooms.forEach(rm => {
        const rObj = rooms.find(r => r.roomNumber === rm.number) || currentRoom;
        const matchedRate = findRoomRate(rObj?.type || rm.type, rObj?.bedType, roomCapacityRates);
        const rate = rObj?.pricePerNight || matchedRate?.pricePerNight || (
          rm.type.toLowerCase().includes('superior') ? 500000 :
          rm.type.toLowerCase().includes('ekonomi') ? 380000 : 480000
        );
        const key = `${rm.building}_${rm.type}_${rate}`;

        if (!groupMap[key]) {
          groupMap[key] = {
            building: rm.building,
            type: rm.type,
            bedType: rObj?.bedType || '4 Single Bed',
            rooms: [],
            rate
          };
        }
        groupMap[key].rooms.push(rm.number);
      });

      Object.entries(groupMap).forEach(([k, g]) => {
        const count = g.rooms.length;
        const lineTotal = count * g.rate * nights;
        subtotalRooms += lineTotal;
        roomItems.push({
          key: k,
          label: `${g.building} - Tipe ${g.type} (${g.bedType})`,
          building: g.building,
          type: g.type,
          bedType: g.bedType,
          roomCount: count,
          roomsList: g.rooms,
          ratePerNight: g.rate,
          nights,
          subtotal: lineTotal
        });
      });
    }

    // 2. Aula / Auditorium / Gedung SG
    let meetingRoomItem: {
      name: string;
      session: string;
      rate: number;
      durationText: string;
      subtotal: number;
    } | null = null;
    let subtotalMeetingRoom = 0;

    const mrPricing = calculateMeetingRoomPricing(tx, meetingRooms);
    if (mrPricing.isAula) {
      subtotalMeetingRoom = mrPricing.subtotal;
      meetingRoomItem = {
        name: mrPricing.name,
        session: mrPricing.session,
        rate: mrPricing.rate,
        durationText: mrPricing.durationText,
        subtotal: mrPricing.subtotal
      };
    }

    // 3. Extra Bed
    let extraBedItem: {
      unitCount: number;
      ratePerNight: number;
      nights: number;
      subtotal: number;
    } | null = null;
    let subtotalExtraBed = 0;

    if (tx.extraBed) {
      const bedCount = tx.extraBedCount || 1;
      const rateBed = (tx.extraBedPrice !== undefined && tx.extraBedPrice !== null) ? tx.extraBedPrice : 100000;
      const totalBed = bedCount * rateBed * nights;
      subtotalExtraBed = totalBed;
      extraBedItem = {
        unitCount: bedCount,
        ratePerNight: rateBed,
        nights,
        subtotal: totalBed
      };
    }

    // 4. Katering
    let cateringItem: {
      packageName: string;
      ratePerPax: number;
      paxCount: number;
      days: number;
      subtotal: number;
    } | null = null;
    let subtotalCatering = 0;

    const hasCateringPkg = tx.cateringPackage && tx.cateringPackage !== 'TIDAK';
    const hasBreakfast = tx.breakfast;

    if (hasCateringPkg) {
      const pax = tx.cateringPaxCount || tx.breakfastPortions || tx.totalPax || (totalCapacity > 0 ? totalCapacity : 1);
      const days = tx.breakfastDays || tx.duration || 1;
      const menuObj = breakfastMenuItems.find(b => b.name === tx.breakfastMenu);
      let ratePerPax = menuObj?.price;
      let pkgLabel = tx.breakfastMenu ? `Katering: ${tx.breakfastMenu}` : 'Paket Katering Lengkap';

      if (!ratePerPax) {
        if (tx.cateringPackage === 'SARAPAN') {
          ratePerPax = 25000;
          pkgLabel = 'Paket Sarapan Pagi Reguler';
        } else if (tx.cateringPackage === 'FULLBOARD') {
          ratePerPax = 120000;
          pkgLabel = 'Paket Fullboard Diklat (3x Makan + 2x Snack)';
        } else if (tx.cateringPackage === 'SNACK_AULA') {
          ratePerPax = 25000;
          pkgLabel = 'Snack Box Acara Ruang Pertemuan';
        } else {
          ratePerPax = 35000;
          pkgLabel = 'Paket Katering Prasmanan';
        }
      }

      const totalCat = ratePerPax * pax * days;
      subtotalCatering = totalCat;
      cateringItem = {
        packageName: pkgLabel,
        ratePerPax,
        paxCount: pax,
        days,
        subtotal: totalCat
      };
    } else if (hasBreakfast) {
      const portions = tx.breakfastPortions || tx.totalPax || 1;
      const days = tx.breakfastDays || tx.duration || 1;
      const menuObj = breakfastMenuItems.find(b => b.name === tx.breakfastMenu);
      const ratePerPax = menuObj?.price || 25000;
      const totalBf = ratePerPax * portions * days;
      subtotalCatering = totalBf;
      cateringItem = {
        packageName: `Sarapan Dapur UPT (${tx.breakfastMenu || 'Menu Reguler'})`,
        ratePerPax,
        paxCount: portions,
        days,
        subtotal: totalBf
      };
    }

    const grandTotal = subtotalRooms + subtotalMeetingRoom + subtotalExtraBed + subtotalCatering;

    return {
      roomItems,
      meetingRoomItem,
      extraBedItem,
      cateringItem,
      subtotalRooms,
      subtotalMeetingRoom,
      subtotalExtraBed,
      subtotalCatering,
      grandTotal,
      terbilangText: angkaKeTerbilang(grandTotal)
    };
  }, [tx, detailedAllocatedRooms, rooms, roomCapacityRates, meetingRooms, breakfastMenuItems, isAulaMain, hasAula, resolvedAulaName, resolvedAulaSession, resolvedAulaDurationDays, currentRoom, totalCapacity, nights]);

  // Payment state
  const isLunas = tx.paymentStatus === 'LUNAS';
  const alreadyPaid = Number(tx.paidAmount || tx.dpAmount || 0);
  const hasDp = tx.paymentStatus === 'DP' || (Boolean(tx.dpAmount) && Number(tx.dpAmount) > 0);
  const isDp = !isLunas && (hasDp || alreadyPaid > 0);
  const sisaBayar = Math.max(0, pricingDetails.grandTotal - (isLunas ? pricingDetails.grandTotal : alreadyPaid));
  const effectiveReceiptAmount = isLunas ? pricingDetails.grandTotal : alreadyPaid;
  const effectiveTerbilang = angkaKeTerbilang(effectiveReceiptAmount);

  const [paymentMethod, setPaymentMethod] = useState<'VA_UPT' | 'TRANSFER'>(
    (tx.paymentMethod === 'TRANSFER' || tx.dpMethod === 'TRANSFER') ? 'TRANSFER' : 'VA_UPT'
  );
  const [selectedBank, setSelectedBank] = useState<string>(tx.bankName || 'Bank Mandiri');
  const [paymentDate, setPaymentDate] = useState(tx.paymentDate || tx.dpDate || realToday);

  // Virtual Account Number for UPT AHJ - editable
  const [vaNumber, setVaNumber] = useState<string>(tx.vaNumber || OFFICIAL_VA_CONFIG.vaNumber);
  const [vaAccountName, setVaAccountName] = useState<string>(tx.vaAccountName || OFFICIAL_VA_CONFIG.accountName);
  const [bankAccountNumber, setBankAccountNumber] = useState<string>(tx.bankAccountNumber || tx.vaNumber || OFFICIAL_VA_CONFIG.vaNumber);

  // Channel display description
  const channelDisplay = useMemo(() => {
    if (paymentMethod === 'VA_UPT') {
      return `Virtual Account UPT No. ${vaNumber} a.n. ${vaAccountName}`;
    }
    return `Transfer Bank ${selectedBank} (No. Rek: ${bankAccountNumber || vaNumber} a.n. ${vaAccountName})`;
  }, [paymentMethod, selectedBank, vaNumber, vaAccountName, bankAccountNumber]);

  // Receipt Number
  const autoKwitansiNo = useMemo(() => {
    if (tx.kwitansiNo) return tx.kwitansiNo;
    const [y, m] = (paymentDate || realToday).split('-');
    const safeId = (tx.groupId || tx.id).replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
    return isDp ? `KWT-DP/KHU-UPTAHJ/${y}/${m}/${safeId}` : `KWT/KHU-UPTAHJ/${y}/${m}/${safeId}`;
  }, [tx, paymentDate, realToday, isDp]);

  // Payer Names
  const payerName = isGroup 
    ? (matchedGroup?.groupName || tx.groupName || tx.guestName) 
    : tx.guestName;
  const payerPic = isGroup 
    ? (matchedGroup?.groupPic || tx.groupPic || tx.guestName) 
    : tx.guestName;
  const payerPhone = isGroup 
    ? (matchedGroup?.groupPicPhone || tx.groupPicPhone || tx.phone) 
    : tx.phone;

  // Treasurer Info
  const isFinanceUser = isKeuanganRole(currentUser?.role, currentUser?.department);
  const treasurerName = currentUser?.fullName && isFinanceUser
    ? currentUser.fullName
    : 'Hj. Siti Aisyah, S.E.';
  const treasurerNip = currentUser && isFinanceUser && currentUser.nip
    ? currentUser.nip
    : '19820412 200801 2 004';
  const treasurerTitle = currentUser && isFinanceUser
    ? (currentUser.role === 'Manager Keuangan' ? 'Manager Keuangan / Perbendaharaan' : currentUser.role === 'Staff Keuangan' ? 'Staf Keuangan / Kasir' : 'Bendahara Penerimaan')
    : 'Bendahara Penerimaan / Kasir';

  const handlePrint = () => {
    try {
      document.body.classList.add('printing-kwitansi');
      const handleAfterPrint = () => {
        document.body.classList.remove('printing-kwitansi');
        window.removeEventListener('afterprint', handleAfterPrint);
      };
      window.addEventListener('afterprint', handleAfterPrint);
      window.print();
      setTimeout(() => {
        document.body.classList.remove('printing-kwitansi');
        window.removeEventListener('afterprint', handleAfterPrint);
      }, 12000);
    } catch {
      window.print();
    }
  };

  const handleDownloadKwitansiPdf = async () => {
    try {
      setIsDownloadingPdf(true);
      await downloadDirectKwitansiPdf(tx, {
        room: currentRoom,
        groupKey,
        groupRecord: matchedGroup,
        allRooms: rooms,
        memberTransactions,
        paymentMethod,
        bankName: selectedBank,
        vaNumber,
        vaAccountName,
        bankAccountNumber,
        paymentDate,
        autoKwitansiNo,
        treasurerName,
        treasurerNip,
        treasurerTitle,
        paidAmount: isLunas ? pricingDetails.grandTotal : alreadyPaid,
        pricingDetails
      });
      showToast(`Kwitansi resmi (${autoKwitansiNo}) berhasil diunduh dalam format PDF!`, 'success');
    } catch (err) {
      console.error('Download Kwitansi direct error, falling back:', err);
      try {
        if (printableSheetRef.current) {
          const safeName = payerName.replace(/[^a-zA-Z0-9_-]/g, '_');
          const prefix = isLunas ? 'Kwitansi-Lunas' : 'Kwitansi-DP';
          const filename = `${prefix}-${tx.id}-${safeName}.pdf`;
          await downloadElementAsPdf(printableSheetRef.current, filename, {
            orientation: 'portrait',
            format: 'a5' as any,
            marginMm: 6,
            title: `Kwitansi Pelunasan Resmi - ${autoKwitansiNo}`
          });
          showToast(`Kwitansi resmi (${filename}) berhasil diunduh!`, 'success');
        } else {
          handlePrint();
        }
      } catch (e) {
        handlePrint();
      }
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleBackToInvoice = () => {
    onClose();
    if (onOpenInvoice) {
      onOpenInvoice(tx);
    } else {
      openModal('modalInvoice', {
        transaction: tx,
        room: currentRoom,
        groupKey,
        groupRecord
      });
    }
  };

  // If user does not have authorization
  if (!isAuthorized) {
    return (
      <div 
        className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div 
          className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border-2 border-rose-300 text-center space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto text-2xl shadow-inner">
            <i className="fa-solid fa-shield-halved"></i>
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900">Akses Ditolak: Otoritas Khusus</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Dokumen <strong>Kwitansi Resmi</strong> hanya dapat diakses oleh petugas operasional (Keuangan, Resepsionis, dan Pimpinan UPT Asrama Haji Jakarta).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    );
  }

  // GATE: KWITANSI HANYA BERLAKU JIKA SUDAH LUNAS 100%
  if (!isLunas) {
    return (
      <div 
        className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div 
          className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border-2 border-amber-300 text-center space-y-4 animate-in fade-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto text-2xl shadow-inner border border-amber-200">
            <i className="fa-solid fa-receipt"></i>
          </div>
          <div>
            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider inline-block mb-2 bg-rose-100 text-rose-900 border border-rose-300">
              Status Tagihan: Belum Lunas
            </span>
            <h3 className="text-base sm:text-lg font-black text-slate-900">
              Kwitansi Resmi Belum Dapat Diterbitkan
            </h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Dokumen <strong>Kwitansi Resmi Pembayaran</strong> hanya diterbitkan setelah pembayaran lunas 100%. Silakan buka Faktur Tagihan (Invoice) untuk melakukan dan mencatat pelunasan pembayaran.
            </p>
          </div>

          <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200 text-left text-xs space-y-1.5 text-amber-950">
            <div className="flex justify-between">
              <span className="text-amber-800">Nomor Faktur / Ref:</span>
              <span className="font-mono font-bold text-amber-950">INV-OPR/{tx.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-amber-800">Nama Tamu / Entitas:</span>
              <span className="font-bold text-amber-950">{payerName}</span>
            </div>
            <div className="flex justify-between border-t border-amber-200 pt-1 text-slate-800 font-bold">
              <span>Total Tagihan Invoice:</span>
              <span className="font-mono font-black text-sm text-slate-900">{formatRupiah(pricingDetails.grandTotal)}</span>
            </div>
            {alreadyPaid > 0 && (
              <div className="flex justify-between text-xs text-amber-900 font-semibold">
                <span>Sudah Disetor (Uang Muka / DP):</span>
                <span className="font-mono text-emerald-700">{formatRupiah(alreadyPaid)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-rose-800 font-bold pt-1 border-t border-amber-200">
              <span>Sisa Tagihan yang Belum Lunas:</span>
              <span className="font-mono">{formatRupiah(sisaBayar)}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                openModal('modalInvoice', {
                  transaction: tx,
                  room: currentRoom,
                  groupKey,
                  groupRecord,
                  autoOpenPaymentModal: true
                });
              }}
              className="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold rounded-xl text-xs shadow-md transition flex items-center justify-center space-x-2 cursor-pointer"
            >
              <i className="fa-solid fa-file-invoice text-gold-300"></i>
              <span>Buka Invoice &amp; Catat Pelunasan</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs transition cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      id="kwitansi-modal-overlay" 
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs overflow-y-auto flex items-center justify-center p-2 sm:p-4 print:p-0 print:bg-white print:static print:inset-auto print:overflow-visible print:block"
      onClick={onClose}
    >
      {/* ELEGANT A5 PORTRAIT CONTAINER (THEMED WITH WEBSITE HAJJ & GOLD COLORS) */}
      <div 
        id="kwitansi-modal-card" 
        className="bg-white rounded-2xl shadow-2xl border border-gold-600/40 max-w-3xl w-full my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150 print:max-h-none print:h-auto print:shadow-none print:border-none print:w-full print:m-0 print:rounded-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar (Hidden on Print) */}
        <div className="no-print bg-gradient-to-r from-hajj-900 via-hajj-800 to-slate-900 text-white px-5 py-3.5 flex items-center justify-between gap-3 border-b border-gold-500/30">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gold-500 text-slate-950 flex items-center justify-center text-base font-black shadow-xs shrink-0">
              <i className="fa-solid fa-receipt"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-xs sm:text-sm tracking-wide text-white">
                  {isDp ? 'KWITANSI RESMI TANDA TERIMA UANG MUKA (DP)' : 'KWITANSI RESMI PEMBAYARAN'}
                </h3>
                {isLunas ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-gold-500 text-slate-950 border border-gold-400">
                    <i className="fa-solid fa-circle-check mr-1 text-slate-950"></i>
                    LUNAS
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 border border-amber-300">
                    <i className="fa-solid fa-coins mr-1 text-slate-950"></i>
                    UANG MUKA (DP)
                  </span>
                )}
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-gold-300 border border-gold-400/40 hidden sm:inline">
                  Desain Resmi UPT Asrama Haji Jakarta
                </span>
              </div>
              <p className="text-[11px] text-gold-300/90 font-medium">
                {isDp 
                  ? 'Tanda Bukti Setoran Uang Muka (DP) Resmi UPT Asrama Haji Jakarta' 
                  : 'Tanda Bukti Pelunasan Resmi Kementerian Haji dan Umrah RI'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 bg-white/10 hover:bg-white/20 text-gold-300 hover:text-white rounded-lg flex items-center justify-center text-sm transition cursor-pointer"
            title="Tutup Jendela"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* PRINTABLE OFFICIAL KWITANSI SHEET - LANDSCAPE VIEW LIKE INVOICE */}
        {/* ========================================================================= */}
        <div 
          ref={printableSheetRef}
          id="kwitansi-printable-sheet" 
          className="p-5 sm:p-7 bg-white text-slate-900 text-xs print:p-0 print:m-0"
        >
          {/* Double Ornate Border Frame (Guilloche Elegance with Website Hajj & Gold Theme) */}
          <div className="border-[2.5px] border-hajj-900 p-1 sm:p-1.5 rounded-2xl bg-gradient-to-b from-hajj-900/5 via-white to-hajj-900/5 relative">
            <div className="border border-gold-600/70 p-4 sm:p-6 rounded-xl bg-white space-y-4 relative overflow-hidden">
              
              {/* Subtle Watermark Logo Kemenhaj RI */}
              <div className="absolute inset-0 flex items-center justify-center opacity-[0.035] pointer-events-none select-none z-0">
                <div className="w-[500px] h-[500px] rounded-full border-[18px] border-hajj-900 flex items-center justify-center">
                  <i className="fa-solid fa-kaaba text-[220px] text-hajj-900"></i>
                </div>
              </div>

              {/* 1. KOP SURAT RESMI IDENTIK DENGAN INVOICE (LENGKAP DENGAN ALAMAT, EMAIL, DAN NO TELP) */}
              <div className="relative z-10 border-b-2 border-hajj-900 pb-3 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
                <div className="flex items-center space-x-3.5">
                  <div className="shrink-0">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl shadow-sm shrink-0 overflow-hidden ${settings?.appLogo && typeof settings.appLogo === 'string' && (settings.appLogo.startsWith('data:') || settings.appLogo.startsWith('http') || settings.appLogo.startsWith('blob:')) ? 'bg-transparent border-0 shadow-none' : 'bg-hajj-800 text-gold-400 border-2 border-gold-400'}`}>
                      {settings?.appLogo && typeof settings.appLogo === 'string' && (settings.appLogo.startsWith('data:') || settings.appLogo.startsWith('http') || settings.appLogo.startsWith('blob:')) ? (
                        <img src={settings.appLogo} alt="Logo" className="w-full h-full object-contain" />
                      ) : (
                        <i className={`fa-solid ${settings?.appLogo || 'fa-kaaba'}`}></i>
                      )}
                    </div>
                  </div>

                  <div>
                    <h2 className="text-base sm:text-lg font-black tracking-tight text-hajj-900 leading-tight">
                      {settings.organizationName}
                    </h2>
                    <p className="text-[10px] uppercase tracking-widest font-black text-gold-600">
                      {settings.ministryName}
                    </p>
                    <p className="text-[11px] text-slate-600 font-medium">
                      {settings.subTitle}
                    </p>
                    <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                      {settings.address}
                    </p>
                    <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                      Email: {settings.email} • Telp: {settings.phone}
                    </p>
                  </div>
                </div>

                {/* Sebelah kanan hanya No. Kwitansi dan Ref. Invoice / Faktur Tagihan */}
                <div className="text-right sm:border-l sm:border-slate-200 sm:pl-4 text-xs text-slate-600 space-y-1.5 shrink-0 w-full sm:w-auto">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">No. Kwitansi:</span>
                    <strong className="font-mono text-hajj-950 font-bold bg-hajj-50 px-2 py-0.5 rounded border border-hajj-200 inline-block text-xs sm:text-sm">
                      {autoKwitansiNo}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">Ref. Faktur Tagihan (Invoice):</span>
                    <strong className="font-mono text-slate-800 text-xs font-bold inline-block">
                      INV-OPR/{tx.id}
                    </strong>
                  </div>
                </div>
              </div>

              {/* 2. JUDUL DOKUMEN KWITANSI LANDSCAPE (WARNA WEBSITE) */}
              <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-gradient-to-r from-hajj-900 via-hajj-800 to-hajj-900 text-white p-3 rounded-xl border-2 border-gold-500 shadow-xs">
                <div>
                  <span className="text-[10px] font-bold text-gold-300 uppercase tracking-widest block">
                    TANDA BUKTI PENERIMAAN PEMBAYARAN RESMI
                  </span>
                  <h1 className="text-sm sm:text-base font-black text-white uppercase tracking-wide">
                    {isDp 
                      ? (isGroup ? 'KWITANSI TANDA TERIMA UANG MUKA (DP) ROMBONGAN' : isAulaMain ? 'KWITANSI TANDA TERIMA UANG MUKA (DP) RUANG PERTEMUAN (AULA)' : 'KWITANSI TANDA TERIMA UANG MUKA (DP) HUNIAN KAMAR')
                      : (isGroup ? 'KWITANSI PELUNASAN SEWA AKOMODASI ROMBONGAN' : isAulaMain ? 'KWITANSI PELUNASAN SEWA RUANG PERTEMUAN (AULA)' : 'KWITANSI PELUNASAN SEWA AKOMODASI HUNIAN KAMAR')}
                  </h1>
                </div>
                <div className="text-left sm:text-right shrink-0">
                  {isLunas ? (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black bg-gold-500 text-slate-950 shadow-2xs border border-gold-400">
                      <i className="fa-solid fa-stamp mr-1.5 text-slate-950"></i>
                      LUNAS
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black bg-gold-500 text-slate-950 shadow-2xs border border-gold-400">
                      <i className="fa-solid fa-coins mr-1.5 text-slate-950"></i>
                      SETORAN UANG MUKA (DP)
                    </span>
                  )}
                </div>
              </div>

              {/* 3. RINCIAN DATA PENYETOR & FASILITAS (LANDSCAPE 2-KOLOM SEIMBANG) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {/* Box Kiri: Data Penyetor / Tamu */}
                <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200 space-y-2">
                  <h4 className="font-bold text-slate-900 border-b border-slate-200 pb-1 flex items-center justify-between text-xs">
                    <span className="flex items-center space-x-1.5 text-hajj-950 font-bold">
                      <i className="fa-solid fa-user-check text-hajj-700"></i>
                      <span>Telah Diterima Dari (Penyetor):</span>
                    </span>
                    <span className="text-[9.5px] px-2 py-0.5 rounded font-bold bg-gold-50 text-hajj-900 border border-gold-300">
                      {isGroup ? `ROMBONGAN (${tx.totalPax || totalCapacity || 1} PAX)` : isAulaMain ? 'AULA / RUANG RAPAT' : 'INDIVIDU'}
                    </span>
                  </h4>
                  <div className="space-y-1 text-slate-700 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Nama Penyetor / Instansi:</span>
                      <span className="font-black text-slate-900 text-right uppercase">{payerName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">PIC / Penanggung Jawab:</span>
                      <span className="font-semibold text-slate-800 text-right">{payerPic} {payerPhone ? `(${payerPhone})` : ''}</span>
                    </div>
                    {(matchedGroup?.agencyOrDocument || tx.agencyOrDocument || tx.kloter) && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Instansi / No. Surat / Kloter:</span>
                        <span className="font-semibold text-slate-800 text-right">{matchedGroup?.agencyOrDocument || tx.agencyOrDocument || tx.kloter}</span>
                      </div>
                    )}
                    {tx.nikKtp && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">NIK Identitas KTP:</span>
                        <span className="font-mono text-slate-800">{tx.nikKtp}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-500">No. Kontak / HP:</span>
                      <span className="font-mono text-slate-800">{payerPhone || '-'}</span>
                    </div>
                  </div>
                </div>

                {/* Box Kanan: Fasilitas & Kanal Penyetoran */}
                <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200 space-y-2">
                  <h4 className="font-bold text-slate-900 border-b border-slate-200 pb-1 flex items-center justify-between text-xs">
                    <span className="flex items-center space-x-1.5 text-hajj-950 font-bold">
                      <i className="fa-solid fa-hotel text-hajj-700"></i>
                      <span>Guna Pembayaran Fasilitas &amp; Masa Sewa:</span>
                    </span>
                    <span className="text-[9.5px] px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-semibold">
                      {uniqueBuildings.length > 0 ? uniqueBuildings.join(', ') : tx.building}
                    </span>
                  </h4>
                  <div className="space-y-1 text-slate-700 text-[11px]">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-slate-500 shrink-0">{isDp ? 'Fasilitas yang Disetor DP:' : 'Fasilitas yang Dilunasi:'}</span>
                      <span className="font-bold text-slate-900 text-right">
                        {isAulaMain 
                          ? `${tx.building} (${tx.roomNumber})`
                          : isGroup 
                          ? `${detailedAllocatedRooms.length} Kamar (${uniqueBuildings.join(', ')})`
                          : `${tx.building} - Kamar ${tx.roomNumber}`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Periode Hunian / Sewa:</span>
                      <span className="font-semibold text-slate-800">
                        {formatIndonesianDate(tx.startDate)} s.d. {formatIndonesianDate(checkoutDate)} ({tx.duration} {tx.durationUnit || (isAulaMain ? 'Jam' : 'Malam')})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Kanal Penyetoran:</span>
                      <span className="font-bold text-hajj-900">
                        {channelDisplay}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Tanggal Setor / Diterima:</span>
                      <span className="font-bold text-slate-900">{formatIndonesianDate(paymentDate)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. TABEL RINCIAN BIAYA & KOMPONEN YANG DILUNASI (SEPERTI DI INVOICE & WARNA WEBSITE) */}
              <div className="border border-slate-300 rounded-xl overflow-hidden text-xs shadow-2xs">
                <div className="bg-gradient-to-r from-hajj-900 to-hajj-800 text-white px-3.5 py-2 font-bold flex items-center justify-between border-b border-gold-500/40">
                  <div className="flex items-center space-x-2">
                    <i className="fa-solid fa-list-check text-gold-300"></i>
                    <span className="uppercase text-[11px] tracking-wide text-white">
                      {isDp 
                        ? `Rincian Komponen Biaya Tagihan & Alokasi Setoran DP (Faktur INV-OPR/${tx.id})`
                        : `Rincian Fasilitas & Komponen yang Dilunasi (Sesuai Faktur INV-OPR/${tx.id})`}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[9.5px] font-bold bg-gold-500/20 text-gold-300 border border-gold-400/30">
                    TARIF RESMI LAYANAN
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-hajj-50/80 text-hajj-950 border-b border-hajj-200 font-semibold text-[10.5px]">
                        <th className="py-2 px-3 w-8 text-center">No</th>
                        <th className="py-2 px-3">Uraian Komponen / Fasilitas Hunian</th>
                        <th className="py-2 px-3 text-right">Tarif Satuan</th>
                        <th className="py-2 px-3 text-center">Volume / Qty</th>
                        <th className="py-2 px-3 text-center">Durasi</th>
                        <th className="py-2 px-3 text-right">{isDp ? 'Subtotal Nilai' : 'Subtotal Terbayar'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-800 text-[11px]">
                      {/* Rows for Rooms */}
                      {pricingDetails.roomItems.map((item, idx) => (
                        <tr key={item.key} className="hover:bg-hajj-50/40 transition">
                          <td className="py-2 px-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                          <td className="py-2 px-3">
                            <div className="font-bold text-slate-900">{item.label}</div>
                            <div className="text-[10px] text-slate-500">
                              No Kamar: <span className="font-mono text-slate-700 font-semibold">{item.roomsList.join(', ')}</span> ({item.roomCount} unit)
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-slate-700">
                            {formatRupiah(item.ratePerNight)} <span className="text-[9.5px] text-slate-400">/mlm</span>
                          </td>
                          <td className="py-2 px-3 text-center font-medium">
                            {item.roomCount} Kamar
                          </td>
                          <td className="py-2 px-3 text-center font-medium">
                            {item.nights} Malam
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                            {formatRupiah(item.subtotal)}
                          </td>
                        </tr>
                      ))}

                      {/* Row for Meeting Room */}
                      {pricingDetails.meetingRoomItem && (
                        <tr className="bg-gold-50/20 hover:bg-gold-50/40 transition">
                          <td className="py-2 px-3 text-center text-slate-400 font-medium">
                            {pricingDetails.roomItems.length + 1}
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-bold text-hajj-950 flex items-center gap-1.5">
                              <i className="fa-solid fa-landmark text-hajj-700 text-[10px]"></i>
                              <span>Sewa Ruang Pertemuan (Aula): {pricingDetails.meetingRoomItem.name}</span>
                            </div>
                            <div className="text-[10px] text-hajj-800">
                              {pricingDetails.meetingRoomItem.session} • Termasuk Sound System &amp; AC Sentral
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-hajj-950">
                            {formatRupiah(pricingDetails.meetingRoomItem.rate)}
                          </td>
                          <td className="py-2 px-3 text-center font-medium text-hajj-900">
                            1 Gedung
                          </td>
                          <td className="py-2 px-3 text-center font-medium text-hajj-900">
                            {pricingDetails.meetingRoomItem.durationText}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-hajj-950">
                            {formatRupiah(pricingDetails.meetingRoomItem.subtotal)}
                          </td>
                        </tr>
                      )}

                      {/* Row for Extra Bed */}
                      {pricingDetails.extraBedItem && (
                        <tr className="hover:bg-hajj-50/40 transition">
                          <td className="py-2 px-3 text-center text-slate-400 font-medium">
                            {pricingDetails.roomItems.length + (pricingDetails.meetingRoomItem ? 1 : 0) + 1}
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <i className="fa-solid fa-bed text-indigo-600 text-[10px]"></i>
                              <span>Layanan Extra Bed / Kasur Tambahan</span>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {tx.extraBedNotes || 'Lengkap dengan sprei, bantal dan selimut steril'}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-slate-700">
                            {formatRupiah(pricingDetails.extraBedItem.ratePerNight)} <span className="text-[9.5px] text-slate-400">/unit</span>
                          </td>
                          <td className="py-2 px-3 text-center font-medium">
                            {pricingDetails.extraBedItem.unitCount} Unit
                          </td>
                          <td className="py-2 px-3 text-center font-medium">
                            {pricingDetails.extraBedItem.nights} Malam
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                            {formatRupiah(pricingDetails.extraBedItem.subtotal)}
                          </td>
                        </tr>
                      )}

                      {/* Row for Catering */}
                      {pricingDetails.cateringItem && (
                        <tr className="hover:bg-hajj-50/40 transition">
                          <td className="py-2 px-3 text-center text-slate-400 font-medium">
                            {pricingDetails.roomItems.length + (pricingDetails.meetingRoomItem ? 1 : 0) + (pricingDetails.extraBedItem ? 1 : 0) + 1}
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <i className="fa-solid fa-utensils text-orange-600 text-[10px]"></i>
                              <span>Layanan Konsumsi: {pricingDetails.cateringItem.packageName}</span>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Dikelola oleh Koperasi &amp; Tim Dapur UPT Asrama Haji Jakarta
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-slate-700">
                            {formatRupiah(pricingDetails.cateringItem.ratePerPax)} <span className="text-[9.5px] text-slate-400">/pack</span>
                          </td>
                          <td className="py-2 px-3 text-center font-medium">
                            {pricingDetails.cateringItem.paxCount} Pack
                          </td>
                          <td className="py-2 px-3 text-center font-medium">
                            {pricingDetails.cateringItem.days} Hari
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                            {formatRupiah(pricingDetails.cateringItem.subtotal)}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Subtotal & Total Summary in Landscape Grid */}
                <div className="bg-slate-50 p-3.5 border-t-2 border-slate-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-center">
                    {/* Left: Terbilang & Cap Lunas / DP */}
                    <div className="space-y-2 border-b md:border-b-0 md:border-r border-slate-200 pb-2 md:pb-0 md:pr-4">
                      <span className="text-[9.5px] uppercase font-bold text-slate-500 tracking-wider block">
                        {isDp ? 'Uang Muka (DP) Sejumlah (Terbilang Resmi):' : 'Uang Sejumlah (Terbilang Resmi):'}
                      </span>
                      <p className="text-xs sm:text-sm font-bold text-hajj-950 italic bg-hajj-50 p-2.5 rounded-lg border-2 border-gold-400/80 font-serif">
                        # {effectiveTerbilang} #
                      </p>
                      <div className="flex items-center space-x-2 pt-0.5">
                        <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border-2 border-gold-600 bg-gold-50 text-hajj-950">
                          <span className="font-black text-[10px] uppercase tracking-wider">
                            {isDp 
                              ? 'TANDA TERIMA UANG MUKA (DP) SAH KEMENHAJ RI'
                              : 'LUNAS'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Rekapitulasi Pembayaran (Mendukung Rincian DP jika ada) */}
                    <div className="space-y-1.5 text-xs text-slate-700">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-500">Total Nilai Tagihan (Invoice):</span>
                        <span className="font-mono font-bold text-slate-800">{formatRupiah(pricingDetails.grandTotal)}</span>
                      </div>

                      {isDp ? (
                        <>
                          <div className="flex justify-between items-center text-[11px] text-emerald-900 font-bold bg-emerald-50/80 p-1.5 rounded-lg border border-emerald-200">
                            <span className="flex items-center gap-1">
                              <i className="fa-solid fa-circle-check text-emerald-600"></i>
                              <span>Uang Muka (DP) Disetor:</span>
                            </span>
                            <span className="font-mono font-black text-emerald-900">
                              {formatRupiah(alreadyPaid)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] text-slate-500 px-1">
                            <span>Kanal Setoran DP:</span>
                            <span className="font-semibold text-slate-700">{channelDisplay}</span>
                          </div>
                          <div className="flex justify-between items-center text-[11px] text-rose-800 font-bold bg-rose-50/80 p-1.5 rounded-lg border border-rose-200">
                            <span>Sisa Tagihan yang Harus Dilunasi:</span>
                            <span className="font-mono font-black text-xs sm:text-sm text-rose-800">
                              {formatRupiah(sisaBayar)}
                            </span>
                          </div>
                        </>
                      ) : tx.dpAmount && tx.dpAmount > 0 ? (
                        <>
                          <div className="flex justify-between items-center text-[11px] text-amber-900">
                            <span>Uang Muka (DP) Telah Disetor:</span>
                            <span className="font-mono font-semibold">
                              {formatRupiah(tx.dpAmount)} ({tx.dpMethod === 'VA_UPT' ? 'VA 8101626953822901' : tx.bankName ? `Transfer ${tx.bankName}` : (tx.dpMethod || 'Transfer Bank')})
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[11px] text-hajj-900">
                            <span>Pelunasan Sisa Disetor:</span>
                            <span className="font-mono font-semibold">
                              {formatRupiah(pricingDetails.grandTotal - tx.dpAmount)} ({tx.paymentMethod === 'VA_UPT' ? 'VA 8101626953822901' : tx.bankName ? `Transfer ${tx.bankName}` : (tx.paymentMethod || 'Transfer Bank')})
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-slate-500">Sisa Tagihan / Piutang:</span>
                            <span className="font-mono font-bold text-slate-800">Rp 0 (LUNAS)</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-slate-500">Jumlah Penyetoran:</span>
                            <span className="font-mono font-bold text-hajj-800">{formatRupiah(pricingDetails.grandTotal)}</span>
                          </div>
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-slate-500">Sisa Tagihan / Piutang:</span>
                            <span className="font-mono font-bold text-slate-800">Rp 0 (LUNAS)</span>
                          </div>
                        </>
                      )}

                      <div className="pt-2 border-t-2 border-slate-300 flex justify-between items-center">
                        <span className="text-xs sm:text-sm font-black text-slate-900 uppercase">
                          {isDp ? 'TOTAL UANG MUKA (DP) DITERIMA:' : 'TOTAL TERBAYAR LUNAS:'}
                        </span>
                        <span className="text-base sm:text-lg font-black font-mono text-hajj-900">
                          {formatRupiah(effectiveReceiptAmount)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Modal Footer Controls (Hidden on Print) */}
        <div className="no-print bg-slate-50 border-t border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center space-x-1.5">
            <i className="fa-solid fa-circle-check text-emerald-600"></i>
            <span>
              Kwitansi ini adalah Bukti Pembayaran Resmi yang Sah di lingkungan <strong>Kementerian Haji dan Umrah RI</strong>.
            </span>
          </div>

          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            {isDp && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openModal('modalInvoice', {
                    transaction: tx,
                    room: currentRoom,
                    groupKey,
                    groupRecord
                  });
                }}
                className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold rounded-lg text-xs shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
                title="Lakukan pelunasan sisa tagihan reservasi ini"
              >
                <i className="fa-solid fa-hand-holding-dollar text-gold-300"></i>
                <span>Pelunasan Sisa ({formatRupiah(sisaBayar)})</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleBackToInvoice}
              className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-lg text-xs border border-slate-300 shadow-2xs transition cursor-pointer flex items-center space-x-1.5"
            >
              <i className="fa-solid fa-file-invoice text-hajj-700"></i>
              <span>Kembali ke Lembar Invoice</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadKwitansiPdf}
              disabled={isDownloadingPdf}
              className="px-3.5 py-1.5 bg-hajj-700 hover:bg-hajj-600 text-white font-bold rounded-lg text-xs flex items-center space-x-1.5 shadow-xs transition cursor-pointer disabled:bg-slate-600 border border-gold-500/40"
              title="Unduh Berkas PDF Kwitansi Resmi"
            >
              {isDownloadingPdf ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin text-gold-300"></i>
                  <span>Menyiapkan PDF...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-file-pdf text-gold-300"></i>
                  <span>Unduh PDF</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-gold-500 hover:bg-gold-400 text-slate-950 font-black rounded-lg text-xs shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
            >
              <i className="fa-solid fa-print"></i>
              <span>Cetak Dokumen</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-lg text-xs transition cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

export function KwitansiPrintSheet({
  tx,
  room,
  groupKey,
  groupRecord,
  printableRef,
  compact = false
}: {
  tx: Transaction;
  room?: Room | null;
  groupKey?: string;
  groupRecord?: ConsolidatedGroupRecord;
  printableRef?: React.RefObject<HTMLDivElement | null>;
  compact?: boolean;
}) {
  const {
    currentUser,
    rooms,
    transactions,
    appSettings,
    dataStorage,
    roomCapacityRates = [],
    meetingRooms = [],
    breakfastMenuItems = []
  } = useAppContext();

  const settings = appSettings || dataStorage.getAppSettings();
  const realToday = getRealTodayDate();

  const { rombonganList } = useMemo(() => {
    return consolidateGroupTransactions(transactions, rooms);
  }, [transactions, rooms]);

  const matchedGroup = useMemo(() => {
    if (!tx) return null;
    if (groupRecord) return groupRecord;
    if (groupKey) {
      const found = rombonganList.find(g => g.key === groupKey);
      if (found) return found;
    }
    return rombonganList.find(grp => 
      grp.representativeTx.id === tx.id ||
      (tx.groupId && grp.groupId === tx.groupId) ||
      (tx.groupName && grp.groupName.trim().toLowerCase() === tx.groupName.trim().toLowerCase() && grp.startDate === tx.startDate) ||
      (grp.allRoomNumbers && tx.roomNumber && grp.allRoomNumbers.includes(tx.roomNumber))
    );
  }, [rombonganList, tx, groupKey, groupRecord]);

  const isGroup = Boolean(matchedGroup || tx.isGroup || (tx.allocatedRoomNumbers && tx.allocatedRoomNumbers.length > 1));

  const memberTransactions = matchedGroup ? matchedGroup.memberTransactions : transactions.filter(t => {
    if (t.id === tx.id) return true;
    if (tx.groupId && t.groupId === tx.groupId) return true;
    if (tx.isGroup && t.isGroup && tx.groupName && tx.groupName.trim().toLowerCase() === (t.groupName || '').trim().toLowerCase() && tx.startDate === t.startDate) return true;
    if (tx.allocatedRoomNumbers && tx.allocatedRoomNumbers.includes(t.roomNumber)) return true;
    return false;
  });

  const isMeetingTx = (t?: Transaction | null) => {
    if (!t) return false;
    return t.building === 'Ruang Pertemuan' || 
           t.building === 'Gedung Serbaguna (SG)' || 
           t.building === 'Gedung Serbaguna' || 
           isMeetingFacility(t.building) || 
           isMeetingFacility(t.roomNumber) || 
           Boolean(t.rentType?.toLowerCase().includes('ruangan') || t.rentType?.toLowerCase().includes('serbaguna'));
  };

  const roomNumberSet = new Set<string>();
  if (tx.roomNumber && !isMeetingTx(tx)) {
    roomNumberSet.add(tx.roomNumber);
  }
  if (tx.allocatedRoomNumbers && Array.isArray(tx.allocatedRoomNumbers)) {
    tx.allocatedRoomNumbers.forEach(rn => rn && !isMeetingFacility(rn) && roomNumberSet.add(rn));
  }
  memberTransactions.forEach(m => {
    if (!isMeetingTx(m) && m.roomNumber) {
      roomNumberSet.add(m.roomNumber);
    }
    if (m.allocatedRoomNumbers && Array.isArray(m.allocatedRoomNumbers)) {
      m.allocatedRoomNumbers.forEach(rn => rn && !isMeetingFacility(rn) && roomNumberSet.add(rn));
    }
  });

  const allocatedRoomNumbers = matchedGroup ? matchedGroup.allRoomNumbers : Array.from(roomNumberSet);

  const detailedAllocatedRooms = allocatedRoomNumbers.map((rNum, idx) => {
    const rObj = rooms.find(r => r.roomNumber === rNum);
    return {
      index: idx + 1,
      number: rNum,
      roomId: rObj?.id || `room-${idx + 1}`,
      building: rObj?.building || tx.building,
      type: rObj?.type || 'Standar',
      capacity: rObj?.capacity || 4
    };
  });

  const currentRoom = room || rooms.find(r => r.id === tx.roomId) || null;
  const isAulaMain = isMeetingTx(tx);
  const isSG = isAulaMain && (
    tx.building?.toLowerCase().includes('serbaguna') || 
    tx.roomNumber?.toLowerCase().includes('serbaguna') || 
    Boolean(tx.rentType?.toLowerCase().includes('serbaguna'))
  );
  const hasAula = Boolean(tx.includeAula || (tx.rentAulaId && tx.rentAulaId.trim() !== ''));
  const resolvedAulaName = tx.rentAulaName || 'Aula Utama UPT';
  const resolvedAulaSession = tx.rentAulaSession || 'Sewa Tambahan Acara';
  const resolvedAulaDurationDays = tx.rentAulaDurationDays || 1;

  const nights = tx.durationUnit === 'Malam' ? tx.duration : (tx.duration >= 24 ? Math.ceil(tx.duration / 24) : 1);
  const checkoutDate = !isAulaMain ? addDaysToDateStr(tx.startDate, tx.duration) : addDaysToDateStr(tx.startDate, nights);

  const totalCapacity = detailedAllocatedRooms.reduce((acc, curr) => acc + (Number(curr.capacity) || 4), 0);

  const pricingDetails = useMemo(() => {
    const roomItems: {
      key: string;
      label: string;
      building: string;
      type: string;
      bedType: string;
      roomCount: number;
      roomsList: string[];
      ratePerNight: number;
      nights: number;
      subtotal: number;
    }[] = [];
    let subtotalRooms = 0;

    if (!isAulaMain) {
      const groupMap: Record<string, {
        building: string;
        type: string;
        bedType: string;
        rooms: string[];
        rate: number;
      }> = {};

      const sourceRooms = detailedAllocatedRooms.length > 0 
        ? detailedAllocatedRooms 
        : (tx.roomNumber ? [{
            index: 1,
            number: tx.roomNumber,
            roomId: tx.roomId || 'room-1',
            building: tx.building,
            type: currentRoom?.type || tx.category || 'Standar',
            capacity: 4
          }] : []);

      sourceRooms.forEach(rm => {
        const rObj = rooms.find(r => r.roomNumber === rm.number) || currentRoom;
        const matchedRate = findRoomRate(rObj?.type || rm.type, rObj?.bedType, roomCapacityRates);
        const rate = rObj?.pricePerNight || matchedRate?.pricePerNight || (
          rm.type.toLowerCase().includes('superior') ? 500000 :
          rm.type.toLowerCase().includes('ekonomi') ? 380000 : 480000
        );
        const key = `${rm.building}_${rm.type}_${rate}`;

        if (!groupMap[key]) {
          groupMap[key] = {
            building: rm.building,
            type: rm.type,
            bedType: rObj?.bedType || '4 Single Bed',
            rooms: [],
            rate
          };
        }
        groupMap[key].rooms.push(rm.number);
      });

      Object.entries(groupMap).forEach(([k, g]) => {
        const count = g.rooms.length;
        const lineTotal = count * g.rate * nights;
        subtotalRooms += lineTotal;
        roomItems.push({
          key: k,
          label: `${g.building} - Tipe ${g.type} (${g.bedType})`,
          building: g.building,
          type: g.type,
          bedType: g.bedType,
          roomCount: count,
          roomsList: g.rooms,
          ratePerNight: g.rate,
          nights,
          subtotal: lineTotal
        });
      });
    }

    let meetingRoomItem: {
      name: string;
      session: string;
      rate: number;
      durationText: string;
      subtotal: number;
    } | null = null;
    let subtotalMeetingRoom = 0;

    const mrPricing = calculateMeetingRoomPricing(tx, meetingRooms);
    if (mrPricing.isAula) {
      subtotalMeetingRoom = mrPricing.subtotal;
      meetingRoomItem = {
        name: mrPricing.name,
        session: mrPricing.session,
        rate: mrPricing.rate,
        durationText: mrPricing.durationText,
        subtotal: mrPricing.subtotal
      };
    }

    let extraBedItem: {
      unitCount: number;
      ratePerNight: number;
      nights: number;
      subtotal: number;
    } | null = null;
    let subtotalExtraBed = 0;

    if (tx.extraBed) {
      const bedCount = tx.extraBedCount || 1;
      const rateBed = (tx.extraBedPrice !== undefined && tx.extraBedPrice !== null) ? tx.extraBedPrice : 100000;
      const totalBed = bedCount * rateBed * nights;
      subtotalExtraBed = totalBed;
      extraBedItem = {
        unitCount: bedCount,
        ratePerNight: rateBed,
        nights,
        subtotal: totalBed
      };
    }

    let cateringItem: {
      packageName: string;
      ratePerPax: number;
      paxCount: number;
      days: number;
      subtotal: number;
    } | null = null;
    let subtotalCatering = 0;

    const hasCateringPkg = tx.cateringPackage && tx.cateringPackage !== 'TIDAK';
    const hasBreakfast = tx.breakfast;

    if (hasCateringPkg) {
      const pax = tx.cateringPaxCount || tx.totalPax || (totalCapacity > 0 ? totalCapacity : 1);
      const days = tx.duration || 1;
      let ratePerPax = 65000;
      let pkgLabel = 'Paket Katering Lengkap (3x Makan + Snack)';

      if (tx.cateringPackage === 'SARAPAN') {
        ratePerPax = 25000;
        pkgLabel = 'Paket Sarapan Pagi Reguler';
      } else if (tx.cateringPackage === 'MAKAN_SIANG') {
        ratePerPax = 35000;
        pkgLabel = 'Paket Makan Siang Prasmanan';
      } else if (tx.cateringPackage === 'MAKAN_MALAM') {
        ratePerPax = 35000;
        pkgLabel = 'Paket Makan Malam Prasmanan';
      } else if (tx.cateringPackage === 'FULLBOARD') {
        ratePerPax = 85000;
        pkgLabel = 'Paket Fullboard (3x Makan + 2x Coffee Break)';
      }

      const totalCat = ratePerPax * pax * days;
      subtotalCatering = totalCat;
      cateringItem = {
        packageName: pkgLabel,
        ratePerPax,
        paxCount: pax,
        days,
        subtotal: totalCat
      };
    } else if (hasBreakfast) {
      const portions = tx.breakfastPortions || tx.totalPax || 1;
      const days = tx.breakfastDays || tx.duration || 1;
      const menuObj = breakfastMenuItems.find(b => b.name === tx.breakfastMenu);
      const ratePerPax = menuObj?.price || 25000;
      const totalBf = ratePerPax * portions * days;
      subtotalCatering = totalBf;
      cateringItem = {
        packageName: `Sarapan Dapur UPT (${tx.breakfastMenu || 'Menu Reguler'})`,
        ratePerPax,
        paxCount: portions,
        days,
        subtotal: totalBf
      };
    }

    const grandTotal = subtotalRooms + subtotalMeetingRoom + subtotalExtraBed + subtotalCatering;

    return {
      roomItems,
      meetingRoomItem,
      extraBedItem,
      cateringItem,
      subtotalRooms,
      subtotalMeetingRoom,
      subtotalExtraBed,
      subtotalCatering,
      grandTotal,
      terbilangText: angkaKeTerbilang(grandTotal)
    };
  }, [tx, detailedAllocatedRooms, rooms, roomCapacityRates, meetingRooms, breakfastMenuItems, isAulaMain, hasAula, resolvedAulaName, resolvedAulaSession, resolvedAulaDurationDays, currentRoom, totalCapacity, nights]);

  const isLunas = tx.paymentStatus === 'LUNAS';
  const alreadyPaid = Number(tx.paidAmount || tx.dpAmount || 0);
  const hasDp = tx.paymentStatus === 'DP' || (Boolean(tx.dpAmount) && Number(tx.dpAmount) > 0);
  const isDp = !isLunas && (hasDp || alreadyPaid > 0);
  const sisaBayar = Math.max(0, pricingDetails.grandTotal - (isLunas ? pricingDetails.grandTotal : alreadyPaid));
  const effectiveReceiptAmount = isLunas ? pricingDetails.grandTotal : alreadyPaid;
  const effectiveTerbilang = angkaKeTerbilang(effectiveReceiptAmount);

  const paymentMethod: 'VA_UPT' | 'TRANSFER' = (tx.paymentMethod === 'TRANSFER' || tx.dpMethod === 'TRANSFER') ? 'TRANSFER' : 'VA_UPT';
  const selectedBank = tx.bankName || 'Bank Mandiri';
  const paymentDate = tx.paymentDate || tx.dpDate || realToday;

  const vaNumber = tx.vaNumber || OFFICIAL_VA_CONFIG.vaNumber;
  const vaAccountName = tx.vaAccountName || OFFICIAL_VA_CONFIG.accountName;
  const bankAccountNumber = tx.bankAccountNumber || tx.vaNumber || OFFICIAL_VA_CONFIG.vaNumber;

  const channelDisplay = paymentMethod === 'VA_UPT'
    ? `Virtual Account UPT No. ${vaNumber} a.n. ${vaAccountName}`
    : `Transfer Bank ${selectedBank} (No. Rek: ${bankAccountNumber || vaNumber} a.n. ${vaAccountName})`;

  const autoKwitansiNo = useMemo(() => {
    if (tx.kwitansiNo) return tx.kwitansiNo;
    const [y, m] = (paymentDate || realToday).split('-');
    const safeId = (tx.groupId || tx.id).replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
    return isDp ? `KWT-DP/KHU-UPTAHJ/${y}/${m}/${safeId}` : `KWT/KHU-UPTAHJ/${y}/${m}/${safeId}`;
  }, [tx, paymentDate, realToday, isDp]);

  const payerName = isGroup 
    ? (matchedGroup?.groupName || tx.groupName || tx.guestName) 
    : tx.guestName;
  const payerPic = isGroup 
    ? (matchedGroup?.groupPic || tx.groupPic || tx.guestName) 
    : tx.guestName;
  const payerPhone = isGroup 
    ? (matchedGroup?.groupPicPhone || tx.groupPicPhone || tx.phone) 
    : tx.phone;

  const isFinanceUser = isKeuanganRole(currentUser?.role, currentUser?.department);
  const treasurerName = currentUser?.fullName && isFinanceUser
    ? currentUser.fullName
    : 'Hj. Siti Aisyah, S.E.';
  const treasurerNip = currentUser && isFinanceUser && currentUser.nip
    ? currentUser.nip
    : '19820412 200801 2 004';
  const treasurerTitle = currentUser && isFinanceUser
    ? (currentUser.role === 'Manager Keuangan' ? 'Manager Keuangan / Perbendaharaan' : currentUser.role === 'Staff Keuangan' ? 'Staf Keuangan / Kasir' : 'Bendahara Penerimaan')
    : 'Bendahara Penerimaan / Kasir';

  return (
    <div 
      ref={printableRef}
      id="kwitansi-printable-sheet" 
      className={`${compact ? 'p-3 sm:p-4 text-[10.5px]' : 'p-4 sm:p-5 text-xs'} bg-white text-slate-900 print:p-0 print:m-0 max-w-[500px] mx-auto`}
    >
      <div className="border-[2px] border-hajj-900 p-1 rounded-2xl bg-gradient-to-b from-hajj-900/5 via-white to-hajj-900/5 relative shadow-xs">
        <div className={`border border-gold-600/70 ${compact ? 'p-3 sm:p-4 space-y-2.5' : 'p-4 sm:p-6 space-y-3.5'} rounded-xl bg-white relative overflow-hidden`}>
          
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none select-none z-0">
            <div className="w-[380px] h-[380px] rounded-full border-[14px] border-hajj-900 flex items-center justify-center">
              <i className="fa-solid fa-kaaba text-[180px] text-hajj-900"></i>
            </div>
          </div>

          <div className="relative z-10 border-b-2 border-hajj-900 pb-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
            <div className="flex items-center space-x-3">
              <div className="shrink-0">
                <div className={`${compact ? 'w-11 h-11' : 'w-13 h-13'} rounded-xl flex items-center justify-center font-black text-xl shadow-xs shrink-0 overflow-hidden ${settings?.appLogo && typeof settings.appLogo === 'string' && (settings.appLogo.startsWith('data:') || settings.appLogo.startsWith('http') || settings.appLogo.startsWith('blob:')) ? 'bg-transparent border-0' : 'bg-hajj-800 text-gold-400 border border-gold-400'}`}>
                  {settings?.appLogo && typeof settings.appLogo === 'string' && (settings.appLogo.startsWith('data:') || settings.appLogo.startsWith('http') || settings.appLogo.startsWith('blob:')) ? (
                    <img src={settings.appLogo} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <i className={`fa-solid ${settings?.appLogo || 'fa-kaaba'}`}></i>
                  )}
                </div>
              </div>

              <div>
                <h2 className={`${compact ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'} font-black tracking-tight text-hajj-900 leading-tight`}>
                  {settings.organizationName}
                </h2>
                <p className="text-[9.5px] uppercase tracking-widest font-black text-gold-600">
                  {settings.ministryName}
                </p>
                <p className="text-[10px] text-slate-600 font-medium">
                  {settings.subTitle}
                </p>
                <p className="text-[9.5px] text-slate-500 leading-tight mt-0.5">
                  {settings.address} • Telp: {settings.phone}
                </p>
              </div>
            </div>

            <div className="text-right sm:border-l sm:border-slate-200 sm:pl-3 space-y-0.5 shrink-0">
              <div className="inline-block px-2.5 py-0.5 rounded-lg bg-hajj-900 text-gold-400 font-black text-[10px] uppercase tracking-wider shadow-2xs border border-gold-500/40">
                {isDp ? 'KWITANSI UANG MUKA (DP)' : 'KWITANSI PELUNASAN'}
              </div>
              <div className="text-[11px] font-mono font-bold text-slate-800">
                No: {autoKwitansiNo}
              </div>
              <div className="text-[9.5px] text-slate-500">
                Tanggal: <strong className="text-slate-800">{formatIndonesianDate(paymentDate)}</strong>
              </div>
              <div className="text-[9px] text-slate-400 font-mono">
                Ref Inv: INV-OPR/{tx.id}
              </div>
            </div>
          </div>

          <div className="relative z-10 space-y-2 py-0.5">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-1.5 text-xs">
              <div className="md:col-span-3 text-slate-600 font-bold uppercase tracking-wider text-[10px] pt-1">
                Sudah Diterima Dari :
              </div>
              <div className="md:col-span-9 bg-slate-50 p-2 rounded-lg border border-slate-200">
                <span className="font-extrabold text-xs sm:text-sm text-hajj-950 uppercase">{payerName}</span>
                {isGroup && (
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Penanggung Jawab (PIC): <strong>{payerPic}</strong> {payerPhone ? `(Telp: ${payerPhone})` : ''}
                  </span>
                )}
              </div>

              <div className="md:col-span-3 text-slate-600 font-bold uppercase tracking-wider text-[10px] pt-1">
                Sejumlah Uang :
              </div>
              <div className="md:col-span-9 bg-gradient-to-r from-gold-50/80 via-amber-50/50 to-gold-50/80 p-2 rounded-lg border border-gold-400/80">
                <span className="font-serif italic font-bold text-[11px] sm:text-xs text-hajj-950 block">
                  &ldquo; {effectiveTerbilang} &rdquo;
                </span>
              </div>

              <div className="md:col-span-3 text-slate-600 font-bold uppercase tracking-wider text-[10px] pt-1">
                Untuk Pembayaran :
              </div>
              <div className="md:col-span-9 bg-slate-50 p-2 rounded-lg border border-slate-200 space-y-1">
                <p className="font-semibold text-slate-900 leading-snug text-[10.5px]">
                  {isDp ? 'Penyetoran Uang Muka (DP) Resmi' : 'Pelunasan Penuh Biaya Penggunaan Sarana & Fasilitas'}{' '}
                  {isAulaMain 
                    ? `Sewa Ruang Pertemuan / Gedung Aula (${tx.roomNumber})` 
                    : `Sewa Hunian Kamar Asrama Haji (${detailedAllocatedRooms.length > 0 ? `${detailedAllocatedRooms.length} Kamar: ${detailedAllocatedRooms.map(r => r.number).join(', ')}` : tx.roomNumber})`}
                  {' '}periode tanggal <strong>{formatIndonesianDate(tx.startDate)}</strong> s.d. <strong>{formatIndonesianDate(checkoutDate)}</strong> ({nights} {isAulaMain ? 'Sesi/Hari' : 'Malam'}).
                </p>
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {pricingDetails.subtotalCatering > 0 && (
                    <span className="text-[9.5px] text-orange-800 bg-orange-50 px-1.5 py-0.2 rounded border border-orange-200 inline-block font-semibold">
                      <i className="fa-solid fa-utensils mr-1"></i> Termasuk Konsumsi / Katering
                    </span>
                  )}
                  {pricingDetails.subtotalExtraBed > 0 && (
                    <span className="text-[9.5px] text-indigo-800 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200 inline-block font-semibold">
                      <i className="fa-solid fa-bed mr-1"></i> Termasuk Layanan Extra Bed
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-1.5 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
              <div className="sm:col-span-6 bg-gradient-to-r from-hajj-900 via-hajj-850 to-slate-900 text-white p-3 rounded-xl border border-gold-400 shadow-xs">
                <div className="flex items-center justify-between text-[10.5px] text-gold-300 font-semibold mb-0.5">
                  <span>{isDp ? 'JUMLAH UANG MUKA (DP):' : 'JUMLAH TOTAL PELUNASAN:'}</span>
                  <span className="text-[9px] bg-gold-500 text-slate-950 font-black px-1.5 py-0.2 rounded font-mono">
                    {isLunas ? 'LUNAS 100%' : 'UANG MUKA (DP)'}
                  </span>
                </div>
                <div className={`${compact ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'} font-black font-mono text-gold-300 tracking-wider`}>
                  {formatRupiah(effectiveReceiptAmount)}
                </div>
                <div className="text-[9.5px] text-slate-300 mt-1 border-t border-gold-500/20 pt-1 flex justify-between">
                  <span>Kanal Pembayaran:</span>
                  <span className="font-semibold text-gold-200 truncate max-w-[180px]">{channelDisplay}</span>
                </div>
                {isDp && sisaBayar > 0 && (
                  <div className="text-[9.5px] text-rose-300 font-bold mt-0.5 flex justify-between">
                    <span>Sisa Tagihan:</span>
                    <span className="font-mono">{formatRupiah(sisaBayar)}</span>
                  </div>
                )}
              </div>

              <div className="sm:col-span-6 text-center space-y-0.5 sm:pl-4">
                <p className="text-[10px] text-slate-600">
                  Jakarta, {formatIndonesianDate(paymentDate)}
                </p>
                <p className="text-[10.5px] font-bold text-hajj-900 uppercase">
                  {treasurerTitle}
                </p>
                <div className="h-10 flex items-center justify-center">
                  <div className="px-2.5 py-0.5 border border-dashed border-emerald-600 rounded-lg text-emerald-700 text-[9px] font-bold bg-emerald-50">
                    <i className="fa-solid fa-stamp mr-1"></i> TERTANDATANGANI SECARA ELEKTRONIK
                  </div>
                </div>
                <p className="text-[11px] font-black text-hajj-900 underline">
                  {treasurerName}
                </p>
                <p className="text-[9.5px] text-slate-500 font-mono">
                  NIP. {treasurerNip}
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
