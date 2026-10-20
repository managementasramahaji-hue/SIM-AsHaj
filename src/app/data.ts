// @ts-nocheck
import { User, Room, Transaction, Maintenance, AuditLog, WorkSession, QcInspection, BreakfastMenuItem, BreakfastOrder, Building, MeetingRoom, RoomCapacityRate } from './types';
import { getRealTodayDate } from './lib/utils';

export const OFFICIAL_TARIFFS: Record<string, any> = {
    "Gedung A (Arafah)": { category: "KAMAR", capacity: "Superior & Standar (Double / 2-4 Single Bed)", desc: "Superior & Standar Arafah" },
    "Gedung B (Muzdalifah)": { category: "KAMAR", capacity: "Standar (2-6 Single Bed)", desc: "Standar Muzdalifah" },
    "Gedung C (Mina)": { category: "KAMAR", capacity: "Standar & Ekonomi (4-8 Single Bed)", desc: "Standar & Barak Mina" },
    "Gedung D (Madinah)": { category: "KAMAR", capacity: "Superior (Double & 2-4 Single Bed AC/TV)", desc: "Superior Deluxe Madinah" },
    "Ruang Pertemuan": { category: "AULA", capacity: "100 - 1500 Orang", desc: "Sewa per Hari / Acara" },
    "Ruang Pertemuan / Aula": { category: "AULA", capacity: "100 - 1500 Orang", desc: "Sewa per Hari / Acara" }
};

// =========================================================================
// MASTER KATALOG KAPASITAS & TARIF KAMAR (3 Tipe: Ekonomi, Standar, Superior)
// Konfigurasi Bed: Double Bed, 2 s/d 8 Single Bed dengan Tarif Berbeda-beda (CRUD)
// =========================================================================
export const initialRoomCapacityRates: RoomCapacityRate[] = [
    // --- 1. TIPE EKONOMI ---
    {
        id: 'rcr-eko-double',
        roomType: 'Ekonomi',
        bedType: 'Double Bed',
        capacityPax: 2,
        pricePerNight: 250000,
        description: 'Kamar Ekonomi dengan 1 tempat tidur Double (Kapasitas 2 Orang). Nyaman, terjangkau, dan bersih.',
        facilities: ['Kipas Angin / AC Standar', '1 Tempat Tidur Double', 'Kamar Mandi Bersih', 'Linen Standar', 'Lemari Pakaian'],
        isActive: true
    },
    {
        id: 'rcr-eko-2single',
        roomType: 'Ekonomi',
        bedType: '2 Single Bed',
        capacityPax: 2,
        pricePerNight: 250000,
        description: 'Kamar Ekonomi dengan 2 tempat tidur Single (Twin Bed). Cocok untuk jemaah dan staf bertugas.',
        facilities: ['Kipas Angin / AC Standar', '2 Single Bed', 'Kamar Mandi Bersih', 'Linen Standar', 'Lemari Pakaian'],
        isActive: true
    },
    {
        id: 'rcr-eko-3single',
        roomType: 'Ekonomi',
        bedType: '3 Single Bed',
        capacityPax: 3,
        pricePerNight: 320000,
        description: 'Kamar Ekonomi dengan 3 tempat tidur Single. Ideal untuk jemaah kelompok kecil.',
        facilities: ['AC Standar', '3 Single Bed', 'Kamar Mandi Bersih', 'Linen Standar', 'Lemari Pakaian'],
        isActive: true
    },
    {
        id: 'rcr-eko-4single',
        roomType: 'Ekonomi',
        bedType: '4 Single Bed',
        capacityPax: 4,
        pricePerNight: 380000,
        description: 'Kamar Ekonomi Quad dengan 4 tempat tidur Single. Pilihan hemat dan favorit rombongan.',
        facilities: ['AC Standar', '4 Single Bed', 'Kamar Mandi Bersih', 'Linen Standar', 'Lemari Pakaian 4 Pintu'],
        isActive: true
    },
    {
        id: 'rcr-eko-5single',
        roomType: 'Ekonomi',
        bedType: '5 Single Bed',
        capacityPax: 5,
        pricePerNight: 450000,
        description: 'Kamar Ekonomi kapasitas 5 orang dengan 5 tempat tidur Single.',
        facilities: ['AC Standar', '5 Single Bed', 'Kamar Mandi Bersih', 'Linen Bersih', 'Lemari'],
        isActive: true
    },
    {
        id: 'rcr-eko-6single',
        roomType: 'Ekonomi',
        bedType: '6 Single Bed',
        capacityPax: 6,
        pricePerNight: 520000,
        description: 'Kamar Ekonomi kapasitas 6 orang dengan 6 tempat tidur Single untuk regu rombongan.',
        facilities: ['AC Standar', '6 Single Bed', 'Kamar Mandi Bersih', 'Linen Bersih', 'Lemari'],
        isActive: true
    },
    {
        id: 'rcr-eko-7single',
        roomType: 'Ekonomi',
        bedType: '7 Single Bed',
        capacityPax: 7,
        pricePerNight: 590000,
        description: 'Kamar Ekonomi kapasitas 7 orang dengan 7 tempat tidur Single untuk regu besar.',
        facilities: ['AC Standar', '7 Single Bed', 'Kamar Mandi Bersih', 'Linen Bersih', 'Lemari'],
        isActive: true
    },
    {
        id: 'rcr-eko-8single',
        roomType: 'Ekonomi',
        bedType: '8 Single Bed',
        capacityPax: 8,
        pricePerNight: 650000,
        description: 'Kamar Ekonomi Barak/Keluarga kapasitas 8 orang dengan 8 tempat tidur Single.',
        facilities: ['AC Standar Dual', '8 Single Bed', 'Kamar Mandi Luas', 'Linen Bersih', 'Loker Penyimpanan'],
        isActive: true
    },

    // --- 2. TIPE STANDAR ---
    {
        id: 'rcr-std-double',
        roomType: 'Standar',
        bedType: 'Double Bed',
        capacityPax: 2,
        pricePerNight: 350000,
        description: 'Kamar Standar Asrama Haji dengan 1 Double Bed luas, AC Split dingin dan kamar mandi dalam.',
        facilities: ['AC Split Dingin', '1 Double Bed (Queen)', 'Kamar Mandi Dalam', 'Water Heater', 'Linen Steril', 'Lemari', 'Meja Kerja'],
        isActive: true
    },
    {
        id: 'rcr-std-2single',
        roomType: 'Standar',
        bedType: '2 Single Bed',
        capacityPax: 2,
        pricePerNight: 350000,
        description: 'Kamar Standar Twin dengan 2 Single Bed, AC Split, kamar mandi dalam dan fasilitas lengkap.',
        facilities: ['AC Split Dingin', '2 Single Bed', 'Kamar Mandi Dalam', 'Water Heater', 'Linen Steril', 'Lemari Pakaian', 'Meja'],
        isActive: true
    },
    {
        id: 'rcr-std-3single',
        roomType: 'Standar',
        bedType: '3 Single Bed',
        capacityPax: 3,
        pricePerNight: 420000,
        description: 'Kamar Standar Triple dengan 3 Single Bed, AC Split sejuk dan perlengkapan higienis.',
        facilities: ['AC Split Dingin', '3 Single Bed', 'Kamar Mandi Dalam', 'Water Heater', 'Linen Bersih UPT', 'Lemari', 'Sajadah'],
        isActive: true
    },
    {
        id: 'rcr-std-4single',
        roomType: 'Standar',
        bedType: '4 Single Bed',
        capacityPax: 4,
        pricePerNight: 480000,
        description: 'Kamar Standar Quad Resmi UPT dengan 4 Single Bed. Standar baku akomodasi jemaah haji & umrah.',
        facilities: ['AC Split Dingin', '4 Single Bed', 'Kamar Mandi Dalam', 'Water Heater', 'Linen Bersih UPT', 'Lemari 4 Pintu', 'Sajadah'],
        isActive: true
    },
    {
        id: 'rcr-std-5single',
        roomType: 'Standar',
        bedType: '5 Single Bed',
        capacityPax: 5,
        pricePerNight: 560000,
        description: 'Kamar Standar kapasitas 5 orang dengan 5 Single Bed dan tata ruang lapang.',
        facilities: ['AC Split Dingin', '5 Single Bed', 'Kamar Mandi Dalam', 'Water Heater', 'Linen Steril', 'Lemari', 'Sajadah'],
        isActive: true
    },
    {
        id: 'rcr-std-6single',
        roomType: 'Standar',
        bedType: '6 Single Bed',
        capacityPax: 6,
        pricePerNight: 640000,
        description: 'Kamar Standar kapasitas 6 orang dengan 6 Single Bed untuk rombongan regu haji.',
        facilities: ['AC Split Dingin Dual', '6 Single Bed', 'Kamar Mandi Dalam', 'Water Heater', 'Linen Steril', 'Lemari 6 Pintu'],
        isActive: true
    },
    {
        id: 'rcr-std-7single',
        roomType: 'Standar',
        bedType: '7 Single Bed',
        capacityPax: 7,
        pricePerNight: 720000,
        description: 'Kamar Standar kapasitas 7 orang dengan 7 Single Bed, nyaman dan sejuk.',
        facilities: ['AC Split Dingin Dual', '7 Single Bed', 'Kamar Mandi Dalam', 'Water Heater', 'Linen Steril', 'Lemari Loker'],
        isActive: true
    },
    {
        id: 'rcr-std-8single',
        roomType: 'Standar',
        bedType: '8 Single Bed',
        capacityPax: 8,
        pricePerNight: 800000,
        description: 'Kamar Standar kapasitas 8 orang dengan 8 Single Bed, ruang luas ber-AC ganda.',
        facilities: ['AC Split Dingin Dual', '8 Single Bed', '2 Kamar Mandi Dalam', 'Water Heater', 'Linen Steril', 'Loker Penyimpanan'],
        isActive: true
    },

    // --- 3. TIPE SUPERIOR ---
    {
        id: 'rcr-sup-double',
        roomType: 'Superior',
        bedType: 'Double Bed',
        capacityPax: 2,
        pricePerNight: 500000,
        description: 'Kamar Superior Mewah dengan 1 King/Queen Bed, Smart TV LED, AC Split, Water Heater dan Mini Bar.',
        facilities: ['AC Split Dingin', '1 King/Queen Double Bed', 'Smart TV LED 43 Inch', 'Kamar Mandi Dalam Mewah', 'Water Heater', 'Kulkas Mini', 'Linen Premium', 'WiFi Super Cepat', 'Kopi & Teh Set', 'Sofa Santai'],
        isActive: true
    },
    {
        id: 'rcr-sup-2single',
        roomType: 'Superior',
        bedType: '2 Single Bed',
        capacityPax: 2,
        pricePerNight: 500000,
        description: 'Kamar Superior Twin Eksekutif dengan 2 Single Bed empuk, Smart TV LED, dan fasilitas hotel bintang.',
        facilities: ['AC Split Dingin', '2 Single Bed Springbed', 'Smart TV LED 43 Inch', 'Kamar Mandi Dalam Mewah', 'Water Heater', 'Kulkas Mini', 'Linen Premium', 'WiFi Super Cepat', 'Kopi & Teh Set', 'Meja Kerja'],
        isActive: true
    },
    {
        id: 'rcr-sup-3single',
        roomType: 'Superior',
        bedType: '3 Single Bed',
        capacityPax: 3,
        pricePerNight: 600000,
        description: 'Kamar Superior Triple Premium dengan 3 Single Bed, Smart TV LED, dan kenyamanan paripurna.',
        facilities: ['AC Split Dingin', '3 Single Bed Springbed', 'Smart TV LED', 'Kamar Mandi Dalam Mewah', 'Water Heater', 'Kulkas Mini', 'Linen Premium', 'WiFi Cepat', 'Sajadah & Al-Quran'],
        isActive: true
    },
    {
        id: 'rcr-sup-4single',
        roomType: 'Superior',
        bedType: '4 Single Bed',
        capacityPax: 4,
        pricePerNight: 700000,
        description: 'Kamar Superior Quad VIP dengan 4 Single Bed Springbed, Smart TV LED, dan ruang santai lega.',
        facilities: ['AC Split Dingin Dual', '4 Single Bed Springbed', 'Smart TV LED 50 Inch', 'Kamar Mandi Dalam Mewah', 'Water Heater', 'Kulkas Mini', 'Linen Premium', 'WiFi Cepat', 'Lemari Luas', 'Sajadah'],
        isActive: true
    },
    {
        id: 'rcr-sup-5single',
        roomType: 'Superior',
        bedType: '5 Single Bed',
        capacityPax: 5,
        pricePerNight: 800000,
        description: 'Kamar Superior Keluarga VIP dengan 5 Single Bed dan ruang keluarga terpadu.',
        facilities: ['AC Split Dingin Dual', '5 Single Bed Springbed', 'Smart TV LED', 'Kamar Mandi Dalam Mewah', 'Water Heater', 'Kulkas Mini', 'Linen Premium', 'WiFi Cepat'],
        isActive: true
    },
    {
        id: 'rcr-sup-6single',
        roomType: 'Superior',
        bedType: '6 Single Bed',
        capacityPax: 6,
        pricePerNight: 900000,
        description: 'Kamar Superior kapasitas 6 orang dengan 6 Single Bed, fasilitas VIP dan TV layar lebar.',
        facilities: ['AC Split Dingin Dual', '6 Single Bed Springbed', 'Smart TV LED', 'Kamar Mandi Dalam Mewah', 'Water Heater', 'Linen Premium', 'WiFi Cepat'],
        isActive: true
    },
    {
        id: 'rcr-sup-7single',
        roomType: 'Superior',
        bedType: '7 Single Bed',
        capacityPax: 7,
        pricePerNight: 1000000,
        description: 'Kamar Superior Eksekutif kapasitas 7 orang dengan 7 Single Bed, nyaman berstandar suite.',
        facilities: ['AC Split Dingin Dual', '7 Single Bed Springbed', 'Smart TV LED', '2 Kamar Mandi Dalam', 'Water Heater', 'Linen Premium', 'WiFi Cepat'],
        isActive: true
    },
    {
        id: 'rcr-sup-8single',
        roomType: 'Superior',
        bedType: '8 Single Bed',
        capacityPax: 8,
        pricePerNight: 1100000,
        description: 'Kamar Superior Suite kapasitas 8 orang dengan 8 Single Bed, ruang luas dan fasilitas VVIP terlengkap.',
        facilities: ['AC Sentral & Split', '8 Single Bed Springbed', 'Smart TV LED 55 Inch', '2 Kamar Mandi Dalam Mewah', 'Water Heater', 'Kulkas & Pantry', 'Linen Premium', 'WiFi Super Cepat', 'Sofa VVIP'],
        isActive: true
    }
];

// Helper untuk menemukan tarif kapasitas default
export function findRoomRate(
    roomType: string = 'Standar', 
    bedType: string = '4 Single Bed',
    customRates: RoomCapacityRate[] = initialRoomCapacityRates
): RoomCapacityRate | undefined {
    return customRates.find(r => 
        r.roomType.toLowerCase() === roomType.toLowerCase() && 
        r.bedType.toLowerCase() === bedType.toLowerCase()
    );
}

// Master Users: Akun Resmi Petugas Terpadu SIM-HAJI UPT Asrama Haji Jakarta (Hanya Super Admin & Admin)
export const initialUsers: User[] = [
    { 
        id: 'u-superadmin', 
        username: 'superadmin', 
        fullName: 'Ahmad Faisal (Super Admin)', 
        role: 'Super Admin', 
        password: '12345',
        department: 'Pimpinan & IT UPT',
        supervisorId: null,
        assignedBuilding: 'Semua Gedung', 
        phone: '081211112222', 
        status: 'Aktif' 
    },
    { 
        id: 'u-admin', 
        username: 'admin', 
        fullName: 'Administrator Operasional (Admin)', 
        role: 'Admin', 
        password: '12345',
        department: 'Administrasi & Pelayanan UPT',
        supervisorId: null,
        assignedBuilding: 'Semua Gedung', 
        phone: '081233334444', 
        status: 'Aktif' 
    }
];

// Master Gedung (Buildings)
export const initialBuildings: Building[] = [
    {
        id: 'bld-1',
        name: 'Gedung A (Arafah)',
        code: 'A',
        floors: 3,
        totalRooms: 5,
        capacityDesc: '5 Kamar (Double / Single Bed)',
        category: 'PENGINAPAN',
        description: 'Superior & Standar Arafah',
        status: 'AKTIF',
        createdAt: '2026-01-01'
    },
    {
        id: 'bld-2',
        name: 'Gedung B (Muzdalifah)',
        code: 'B',
        floors: 3,
        totalRooms: 5,
        capacityDesc: '5 Kamar (Single Bed)',
        category: 'PENGINAPAN',
        description: 'Standar Muzdalifah',
        status: 'AKTIF',
        createdAt: '2026-01-01'
    },
    {
        id: 'bld-3',
        name: 'Gedung C (Mina)',
        code: 'C',
        floors: 3,
        totalRooms: 5,
        capacityDesc: '5 Kamar (Barak)',
        category: 'PENGINAPAN',
        description: 'Standar & Barak Mina',
        status: 'AKTIF',
        createdAt: '2026-01-01'
    },
    {
        id: 'bld-4',
        name: 'Gedung D (Madinah)',
        code: 'D',
        floors: 3,
        totalRooms: 5,
        capacityDesc: '5 Kamar (Superior AC/TV)',
        category: 'PENGINAPAN',
        description: 'Superior Deluxe Madinah',
        status: 'AKTIF',
        createdAt: '2026-01-01'
    }
];

// Master Ruang Pertemuan (Meeting Rooms / Aula)
export const initialMeetingRooms: MeetingRoom[] = [
    {
        id: 'mr-1',
        name: 'Gedung SG-1 (SG-1)',
        code: 'SG-1',
        category: 'SERBAGUNA',
        building: 'Gedung Serbaguna (SG)',
        capacity: '1000 - 1500 Orang',
        capacityNumber: 1500,
        facilities: ['AC Sentral', 'Panggung Utama', 'Sound System 10.000 Watt', 'Videotron LED', 'VIP Room'],
        dailyRate: 15000000,
        sessionRate: 8500000,
        description: 'Aula konvensi termegah berkapasitas ribuan peserta untuk manasik akbar atau resepsi.',
        status: 'TERSEDIA',
        qcStatus: 'LOLOS_QC',
        activeTxId: null
    },
    {
        id: 'mr-2',
        name: 'Gedung SG-2 (SG-2)',
        code: 'SG-2',
        category: 'SERBAGUNA',
        building: 'Gedung Serbaguna (SG)',
        capacity: '800 - 1000 Orang',
        capacityNumber: 1000,
        facilities: ['AC Sentral', 'Sound System', 'Proyektor Dual', 'Panggung'],
        dailyRate: 12000000,
        sessionRate: 7000000,
        description: 'Aula serbaguna kedua ideal untuk pelepasan jemaah, seminar nasional, dan wisuda.',
        status: 'TERSEDIA',
        qcStatus: 'LOLOS_QC',
        activeTxId: null
    },
    {
        id: 'mr-3',
        name: 'Gedung Multipurpose',
        code: 'MP',
        category: 'SERBAGUNA',
        building: 'Gedung Serbaguna (SG)',
        capacity: '500 - 700 Orang',
        capacityNumber: 700,
        facilities: ['AC Sentral', 'Sound System', 'LCD Proyektor', 'Meja Kursi Seminar'],
        dailyRate: 9000000,
        sessionRate: 5500000,
        description: 'Ruang serbaguna fleksibel untuk pameran, pelatihan manasik, dan rapat kerja.',
        status: 'TERSEDIA',
        qcStatus: 'LOLOS_QC',
        activeTxId: null
    },
    {
        id: 'mr-4',
        name: 'Aula Utama Arafah',
        code: 'AU-A',
        category: 'AULA',
        building: 'Ruang Pertemuan / Aula',
        capacity: '300 - 500 Orang',
        capacityNumber: 500,
        facilities: ['AC', 'Sound System Standar', 'Proyektor HD', 'Mimbar Resmi'],
        dailyRate: 7500000,
        sessionRate: 4500000,
        description: 'Aula lantai dasar sayap Arafah untuk pertemuan pembekalan kloter jemaah.',
        status: 'TERSEDIA',
        qcStatus: 'LOLOS_QC',
        activeTxId: null
    },
    {
        id: 'mr-5',
        name: 'Aula Muzdalifah',
        code: 'AU-M',
        category: 'AULA',
        building: 'Ruang Pertemuan / Aula',
        capacity: '300 - 400 Orang',
        capacityNumber: 400,
        facilities: ['AC', 'Sound System', 'Wireless Mic', 'Screen'],
        dailyRate: 6500000,
        sessionRate: 4000000,
        description: 'Aula sayap Muzdalifah untuk konsolidasi regu dan bimbingan ibadah.',
        status: 'TERSEDIA',
        qcStatus: 'LOLOS_QC',
        activeTxId: null
    },
    {
        id: 'mr-6',
        name: 'Aula Mina',
        code: 'AU-MINA',
        category: 'AULA',
        building: 'Ruang Pertemuan / Aula',
        capacity: '250 - 350 Orang',
        capacityNumber: 350,
        facilities: ['AC', 'Sound System', 'Kursi Chitose 300 unit'],
        dailyRate: 6000000,
        sessionRate: 3500000,
        description: 'Aula sayap Mina untuk kegiatan evaluasi berkala dan rapat koordinasi karom.',
        status: 'TERSEDIA',
        qcStatus: 'LOLOS_QC',
        activeTxId: null
    },
    {
        id: 'mr-7',
        name: 'Auditorium Madinah',
        code: 'AUD-M',
        category: 'AULA',
        building: 'Ruang Pertemuan / Aula',
        capacity: '200 - 300 Orang',
        capacityNumber: 300,
        facilities: ['AC', 'Sound System Theater', 'Lighting Panggung', 'Videotron'],
        dailyRate: 7000000,
        sessionRate: 4200000,
        description: 'Auditorium bertingkat dengan kenyamanan kursi teater untuk pemutaran film & seminar.',
        status: 'TERSEDIA',
        qcStatus: 'LOLOS_QC',
        activeTxId: null
    },
    {
        id: 'mr-8',
        name: 'Ruang Rapat Bir Ali 1',
        code: 'RR-BA1',
        category: 'AULA',
        building: 'Ruang Pertemuan / Aula',
        capacity: '30 - 50 Orang',
        capacityNumber: 50,
        facilities: ['AC', 'Smart TV 75 inch', 'Meja Rapat Oval', 'WiFi Super Cepat', 'Mic Conference'],
        dailyRate: 3000000,
        sessionRate: 1800000,
        description: 'Ruang rapat VIP pimpinan dan koordinasi teknis dinas Kementerian.',
        status: 'TERSEDIA',
        qcStatus: 'LOLOS_QC',
        activeTxId: null
    },
    {
        id: 'mr-9',
        name: 'Ruang Rapat Bir Ali 2',
        code: 'RR-BA2',
        category: 'AULA',
        building: 'Ruang Pertemuan / Aula',
        capacity: '20 - 35 Orang',
        capacityNumber: 35,
        facilities: ['AC', 'Smart TV', 'Whiteboard Glass', 'WiFi'],
        dailyRate: 2500000,
        sessionRate: 1500000,
        description: 'Ruang rapat eksekutif untuk rapat koordinasi lintas divisi.',
        status: 'TERSEDIA',
        qcStatus: 'LOLOS_QC',
        activeTxId: null
    },
    {
        id: 'mr-10',
        name: 'Ruang Rapat Bir Ali 3',
        code: 'RR-BA3',
        category: 'AULA',
        building: 'Ruang Pertemuan / Aula',
        capacity: '15 - 25 Orang',
        capacityNumber: 25,
        facilities: ['AC', 'TV Display', 'WiFi', 'Meja Rapat'],
        dailyRate: 2000000,
        sessionRate: 1200000,
        description: 'Ruang rapat tim teknis, konsumsi, dan logistik lapangan.',
        status: 'TERSEDIA',
        qcStatus: 'LOLOS_QC',
        activeTxId: null
    },
    {
        id: 'mr-11',
        name: 'Ruang VIP Quba',
        code: 'VIP-Q',
        category: 'AULA',
        building: 'Ruang Pertemuan / Aula',
        capacity: '20 - 30 Orang',
        capacityNumber: 30,
        facilities: ['Sofa Mewah', 'AC', 'Toilet Privat VIP', 'Mini Bar'],
        dailyRate: 4000000,
        sessionRate: 2500000,
        description: 'Transit VIP untuk menteri, duta besar, dan tamu kehormatan.',
        status: 'TERSEDIA',
        qcStatus: 'LOLOS_QC',
        activeTxId: null
    },
    {
        id: 'mr-12',
        name: 'Ruang VIP Uhud',
        code: 'VIP-U',
        category: 'AULA',
        building: 'Ruang Pertemuan / Aula',
        capacity: '15 - 20 Orang',
        capacityNumber: 20,
        facilities: ['Sofa VIP', 'AC', 'Private Pantry', 'Smart TV'],
        dailyRate: 3500000,
        sessionRate: 2200000,
        description: 'Ruang tunggu transit delegasi dan narasumber VVIP.',
        status: 'TERSEDIA',
        qcStatus: 'LOLOS_QC',
        activeTxId: null
    },
    {
        id: 'mr-13',
        name: 'Ruang Pertemuan Nabawi',
        code: 'RP-N',
        category: 'AULA',
        building: 'Ruang Pertemuan / Aula',
        capacity: '100 - 150 Orang',
        capacityNumber: 150,
        facilities: ['AC', 'Sound System', 'Screen LCD', 'Podium'],
        dailyRate: 5000000,
        sessionRate: 3000000,
        description: 'Ruang pertemuan sedang bernuansa islami untuk pengajian dan rapat kerja.',
        status: 'TERSEDIA',
        qcStatus: 'LOLOS_QC',
        activeTxId: null
    }
];

// Generator master kamar bersih (Semua KOSONG, Siap Digunakan)
export function getCleanRooms(): Room[] {
    const rooms: Room[] = [];
    const buildings = [
        { name: "Gedung A (Arafah)", code: "A" },
        { name: "Gedung B (Muzdalifah)", code: "B" },
        { name: "Gedung C (Mina)", code: "C" },
        { name: "Gedung D (Madinah)", code: "D" }
    ];

    buildings.forEach(b => {
        for (let i = 1; i <= 5; i++) {
            const floorNum = Math.ceil(i / 2);
            
            // Konfigurasi variasi 3 tipe kamar (Ekonomi, Standar, Superior) dan bed (Double s/d 8 Bed)
            let rType: 'Ekonomi' | 'Standar' | 'Superior' = 'Standar';
            let rBed: string = '4 Single Bed';
            let rPax: number = 4;

            if (b.code === 'A') {
                // Gedung A (Arafah): Superior & Standar VIP
                if (i <= 18) {
                    rType = 'Superior';
                    if (i % 4 === 1) { rBed = 'Double Bed'; rPax = 2; }
                    else if (i % 4 === 2) { rBed = '2 Single Bed'; rPax = 2; }
                    else if (i % 4 === 3) { rBed = '3 Single Bed'; rPax = 3; }
                    else { rBed = '4 Single Bed'; rPax = 4; }
                } else if (i <= 36) {
                    rType = 'Standar';
                    if (i % 3 === 0) { rBed = 'Double Bed'; rPax = 2; }
                    else if (i % 3 === 1) { rBed = '2 Single Bed'; rPax = 2; }
                    else { rBed = '4 Single Bed'; rPax = 4; }
                } else {
                    rType = 'Ekonomi';
                    rBed = i % 2 === 0 ? '4 Single Bed' : '6 Single Bed';
                    rPax = i % 2 === 0 ? 4 : 6;
                }
            } else if (b.code === 'B') {
                // Gedung B (Muzdalifah): Standar
                rType = 'Standar';
                if (i <= 10) { rBed = '2 Single Bed'; rPax = 2; }
                else if (i <= 25) { rBed = '3 Single Bed'; rPax = 3; }
                else if (i <= 42) { rBed = '4 Single Bed'; rPax = 4; }
                else { rBed = '6 Single Bed'; rPax = 6; }
            } else if (b.code === 'C') {
                // Gedung C (Mina): Standar & Ekonomi Barak
                if (i <= 20) {
                    rType = 'Standar';
                    rBed = i % 2 === 0 ? '3 Single Bed' : '4 Single Bed';
                    rPax = i % 2 === 0 ? 3 : 4;
                } else if (i <= 38) {
                    rType = 'Ekonomi';
                    rBed = i % 2 === 0 ? '4 Single Bed' : '6 Single Bed';
                    rPax = i % 2 === 0 ? 4 : 6;
                } else {
                    rType = 'Ekonomi';
                    rBed = i % 2 === 0 ? '7 Single Bed' : '8 Single Bed';
                    rPax = i % 2 === 0 ? 7 : 8;
                }
            } else {
                // Gedung D (Madinah): Superior Eksekutif & Standar
                if (i <= 35) {
                    rType = 'Superior';
                    if (i % 4 === 1) { rBed = 'Double Bed'; rPax = 2; }
                    else if (i % 4 === 2) { rBed = '2 Single Bed'; rPax = 2; }
                    else if (i % 4 === 3) { rBed = '3 Single Bed'; rPax = 3; }
                    else { rBed = '4 Single Bed'; rPax = 4; }
                } else {
                    rType = 'Standar';
                    rBed = i % 2 === 0 ? '2 Single Bed' : '4 Single Bed';
                    rPax = i % 2 === 0 ? 2 : 4;
                }
            }

            const matchedRate = findRoomRate(rType, rBed);
            const price = matchedRate ? matchedRate.pricePerNight : 400000;
            const facilities = matchedRate?.facilities || ['AC', 'Kamar Mandi Dalam', `${rBed}`, 'Water Heater', 'Linen Bersih'];

            rooms.push({
                id: `room-${b.code}-${i}`,
                building: b.name,
                roomNumber: `${b.code}-${100 + i}`,
                floor: floorNum,
                type: rType,
                bedType: rBed,
                capacity: `${rPax} Orang`,
                capacityNumber: rPax,
                pricePerNight: price,
                facilities: facilities,
                status: "KOSONG",
                qcStatus: "LOLOS_QC",
                lastQcDate: undefined,
                lastQcBy: undefined,
                lastQcNotes: undefined,
                activeTxId: null,
                activeMaintId: null
            });
        }
    });

    return rooms;
}

// Initial rooms sama dengan clean rooms (tanpa transaksi dummy)
export function getInitialRooms(): Room[] {
    return getCleanRooms();
}

// Data Dummy Dikosongkan: Bersih untuk operasional riil
export const initialTransactions: Transaction[] = [];
export const initialMaintenances: Maintenance[] = [];
export const initialQcInspections: QcInspection[] = [];
export const initialWorkSessions: WorkSession[] = [];

// Master Menu Sarapan Resmi Koperasi UPT (Dapat di-CRUD)
export const initialBreakfastMenuItems: BreakfastMenuItem[] = [
    {
        id: 'bmi-1',
        name: 'Nasi Goreng Spesial Telur Ceplok & Kerupuk',
        category: 'MAKANAN_BERAT',
        price: 25000,
        description: 'Nasi goreng bumbu rempah nusantara dengan suwiran ayam, telur mata sapi renyah, acar segar, dan kerupuk udang.',
        isAvailable: true,
        allergens: 'Telur, Udang'
    },
    {
        id: 'bmi-2',
        name: 'Paket Sarapan Sehat: Bubur Kacang Hijau & Telur Rebus',
        category: 'SEHAT_LANSIA',
        price: 20000,
        description: 'Bubur kacang hijau murni gula aren organik dengan kuah santan daun pandan wangi, disajikan bersama telur ayam rebus.',
        isAvailable: true,
        allergens: 'Telur'
    },
    {
        id: 'bmi-3',
        name: 'Nasi Uduk Komplit Betawi Asli',
        category: 'MAKANAN_BERAT',
        price: 25000,
        description: 'Nasi uduk wangi daun salam serai, bihun goreng kampung, orek tempe manis gurih, telur balado, sambal terasi.',
        isAvailable: true,
        allergens: 'Telur, Kedelai'
    },
    {
        id: 'bmi-4',
        name: 'Bubur Ayam Gurih Spesial Sukabumi',
        category: 'BUBUR_SAYUR',
        price: 20000,
        description: 'Bubur beras pulen kuah kuning kari harum, suwiran ayam kampung, cakwe renyah, kacang kedelai goreng, seledri, kerupuk.',
        isAvailable: true,
        allergens: 'Kedelai, Gluten'
    },
    {
        id: 'bmi-5',
        name: 'Nasi Kuning Komplit Ayam Suwir',
        category: 'MAKANAN_BERAT',
        price: 28000,
        description: 'Nasi kuning rempah kunyit santan murni, ayam suwir rica gurih, telur dadar iris, perkedel kentang lembut, kerupuk.',
        isAvailable: true,
        allergens: 'Telur'
    },
    {
        id: 'bmi-6',
        name: 'Snack Box Premium Acara Ruang Pertemuan',
        category: 'SNACK_KUDAPAN',
        price: 25000,
        description: 'Paket coffee break & snack pertemuan: 3 jenis kue premium (Lemper ayam, Risol mayo, Bolu gulung), air mineral botol, kopi & teh hangat.',
        isAvailable: true,
        allergens: 'Gluten, Telur, Susu'
    },
    {
        id: 'bmi-7',
        name: 'Snack Box & Kopi / Teh Hangat',
        category: 'SNACK_KUDAPAN',
        price: 15000,
        description: 'Paket 2 jenis kue basah tradisional (Lemper ayam, Pastel sayur telur) dilengkapi air mineral dan teh manis/kopi hangat.',
        isAvailable: true,
        allergens: 'Gluten, Telur'
    },
    {
        id: 'bmi-8',
        name: 'Paket Fullboard Diklat & Rombongan (3x Makan + 2x Snack)',
        category: 'MAKANAN_BERAT',
        price: 120000,
        description: 'Paket konsumsi komplit diklat resmi: Sarapan pagi, makan siang prasmanan nusantara, makan malam bergizi, serta 2x coffee break & snack box.',
        isAvailable: true,
        allergens: 'Ayam, Daging, Ikan, Telur, Kedelai'
    },
    {
        id: 'bmi-9',
        name: 'Paket Prasmanan Nusantara Rombongan (Makan Siang / Malam)',
        category: 'MAKANAN_BERAT',
        price: 50000,
        description: 'Prasmanan lengkap: Nasi putih, olahan ayam/daging, sup segar, tahu/tempe rempah, kerupuk, sambal, lalapan, puding, dan buah iris segar.',
        isAvailable: true,
        allergens: 'Daging, Telur, Kedelai'
    },
    {
        id: 'bmi-10',
        name: 'Roti Bakar Bandung Cokelat Keju',
        category: 'SNACK_KUDAPAN',
        price: 15000,
        description: 'Roti tawar tebal dipanggang margarin wangi dengan isian meses cokelat premium dan taburan keju cheddar parut.',
        isAvailable: true,
        allergens: 'Susu, Gluten'
    },
    {
        id: 'bmi-11',
        name: 'Susu Jahe Merah & Teh Tarik Hangat',
        category: 'MINUMAN',
        price: 10000,
        description: 'Minuman penghangat tubuh seduhan jahe merah segar geprek dengan susu kental manis atau pilihan teh tarik berbusa.',
        isAvailable: true,
        allergens: 'Susu'
    }
];

// Inisialisasi pesanan sarapan bersih (tidak ada pesanan dummy)
export function getInitialBreakfastOrders(_txList: Transaction[] = initialTransactions): BreakfastOrder[] {
    return [];
}

// Log inisialisasi sistem default (Dikosongkan sesuai permintaan pengguna)
export const initialAuditLogs: AuditLog[] = [];

// =========================================================================
// KONFIGURASI RESMI PENERIMAAN PNBP & BANK TRANSFER INDONESIA
// =========================================================================
export const OFFICIAL_VA_CONFIG = {
  vaNumber: '8101626953822901',
  accountName: 'Rpl 133 Ps Ahkl1 Jkt',
  bankName: 'Bank Syariah Indonesia (BSI) / Bank Mandiri (VA UPT Asrama Haji Jakarta)'
};

export const INDONESIAN_BANKS = [
  'Bank Mandiri',
  'Bank Syariah Indonesia (BSI)',
  'Bank BRI (Bank Rakyat Indonesia)',
  'Bank BNI (Bank Negara Indonesia)',
  'Bank BCA (Bank Central Asia)',
  'Bank DKI',
  'Bank BTN (Bank Tabungan Negara)',
  'Bank CIMB Niaga',
  'Bank Permata',
  'Bank Danamon',
  'Bank Mega',
  'Bank BJB (Bank Jawa Barat)',
  'Bank Jateng',
  'Bank Jatim',
  'Bank Muamalat',
  'Bank Sinarmas',
  'Bank Lainnya'
];


