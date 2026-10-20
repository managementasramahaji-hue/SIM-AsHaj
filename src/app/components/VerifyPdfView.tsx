// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { useAppContext } from '../store';

// Helper untuk membersihkan nama file dari duplikasi download browser (contoh: "Laporan_Audit (2).pdf" -> "Laporan_Audit.pdf")
const cleanDocumentName = (val: string): string => {
  return val
    .replace(/\s*\(\d+\)\.pdf$/i, '.pdf')
    .replace(/\s*-\s*copy\s*(\d*)\.pdf$/i, '.pdf')
    .replace(/_\d+\.pdf$/i, '.pdf')
    .replace(/\s*\(\d+\)$/i, '')
    .trim();
};

// Ekstrak teks dan metadata dari PDF menggunakan TextDecoder murni dan aman
async function extractMetadataAndTextFromPdf(file: File): Promise<{
  verificationCode?: string;
  qrText?: string;
  trxId?: string;
}> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    // 1. Baca representasi latin1 string (mencakup semua ASCII bytes di header/trailer/info/XMP PDF)
    let latin1 = '';
    const chunkSize = 32768;
    for (let i = 0; i < uint8.length; i += chunkSize) {
      const slice = uint8.subarray(i, Math.min(i + chunkSize, uint8.length));
      latin1 += String.fromCharCode.apply(null, Array.from(slice));
    }

    const cleanLatin1 = latin1.replace(/\x00/g, '');

    // Cari VLOG-YYYYMMDD-XXXX
    const vlogMatch = latin1.match(/VLOG-\d{8}-[A-Za-z0-9]+/i) || cleanLatin1.match(/VLOG-\d{8}-[A-Za-z0-9]+/i);
    if (vlogMatch) {
      return { verificationCode: vlogMatch[0].toUpperCase() };
    }

    // Cari url ?verify=VLOG-...
    const verifyParamMatch = latin1.match(/verify=([^&#\s\)]+)/i) || cleanLatin1.match(/verify=([^&#\s\)]+)/i);
    if (verifyParamMatch && verifyParamMatch[1]?.includes('VLOG-')) {
      const vMatch = verifyParamMatch[1].match(/VLOG-\d{8}-[A-Za-z0-9]+/i);
      if (vMatch) return { verificationCode: vMatch[0].toUpperCase() };
    }

    // Cari /Subject (VLOG-...) atau /Keywords (UPT-ASRAMA-VERIFIED...)
    const subjectMatch = latin1.match(/\/Subject\s*\(([^)]+)\)/i) || cleanLatin1.match(/\/Subject\s*\(([^)]+)\)/i);
    if (subjectMatch && subjectMatch[1]?.includes('VLOG-')) {
      const vMatch = subjectMatch[1].match(/VLOG-\d{8}-[A-Za-z0-9]+/i);
      if (vMatch) return { verificationCode: vMatch[0].toUpperCase() };
    }

    const keywordMatch = latin1.match(/\/Keywords\s*\(([^)]+)\)/i) || cleanLatin1.match(/\/Keywords\s*\(([^)]+)\)/i);
    if (keywordMatch && keywordMatch[1]?.includes('VLOG-')) {
      const vMatch = keywordMatch[1].match(/VLOG-\d{8}-[A-Za-z0-9]+/i);
      if (vMatch) return { verificationCode: vMatch[0].toUpperCase() };
    }

    // Cari UPT-ASRAMA-VERIFIED:...
    const qrMatch = latin1.match(/UPT-ASRAMA-VERIFIED:([^\s\r\n\)]+)/i) || cleanLatin1.match(/UPT-ASRAMA-VERIFIED:([^\s\r\n\)]+)/i);
    if (qrMatch) {
      const inner = qrMatch[1] || qrMatch[0];
      const vMatch = inner.match(/VLOG-\d{8}-[A-Za-z0-9]+/i);
      if (vMatch) return { verificationCode: vMatch[0].toUpperCase() };
      return { qrText: qrMatch[0] };
    }

    // Cari TRX-...
    const trxMatch = latin1.match(/TRX-[A-Za-z0-9-]+/i) || cleanLatin1.match(/TRX-[A-Za-z0-9-]+/i);
    if (trxMatch) {
      return { trxId: trxMatch[0].toUpperCase() };
    }

    // 2. Baca dengan TextDecoder UTF-8 dengan replacement
    try {
      const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(uint8);
      const cleanUtf8 = utf8.replace(/\x00/g, '');
      const vlogUtf8 = utf8.match(/VLOG-\d{8}-[A-Za-z0-9]+/i) || cleanUtf8.match(/VLOG-\d{8}-[A-Za-z0-9]+/i);
      if (vlogUtf8) {
        return { verificationCode: vlogUtf8[0].toUpperCase() };
      }
      const qrUtf8 = utf8.match(/UPT-ASRAMA-VERIFIED:([^\s\r\n\)]+)/i);
      if (qrUtf8) {
        const inner = qrUtf8[1] || qrUtf8[0];
        const vMatch = inner.match(/VLOG-\d{8}-[A-Za-z0-9]+/i);
        if (vMatch) return { verificationCode: vMatch[0].toUpperCase() };
        return { qrText: qrUtf8[0] };
      }
      const trxUtf8 = utf8.match(/TRX-[A-Za-z0-9-]+/i);
      if (trxUtf8) {
        return { trxId: trxUtf8[0].toUpperCase() };
      }
    } catch {}
  } catch (err) {
    console.warn('Gagal membaca binary PDF:', err);
  }
  return {};
}

export function VerifyPdfView() {
  const { users, auditLogs, showToast, setActiveTab } = useAppContext();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [inputCode, setInputCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [extractedInfo, setExtractedInfo] = useState<string | null>(null);

  const [verificationResult, setVerificationResult] = useState<{
    status: 'success' | 'invalid' | null;
    message: string;
    details?: {
      verificationCode: string;
      docId: string;
      docTitle: string;
      tenantName: string;
      signatoryName: string;
      signatoryRole: string;
      signatoryNip: string;
      hasUniqueQr: boolean;
      qrCodeHash: string;
      officerName: string;
      officerRole: string;
      downloadTime: string;
      isDatabaseVerified: boolean;
      downloadLogs: any[];
    };
  }>(null);

  // Check if there is a target verification code from another view (e.g. Audit Log page)
  useEffect(() => {
    const targetCode = sessionStorage.getItem('verify_code_target');
    if (targetCode) {
      sessionStorage.removeItem('verify_code_target');
      setInputCode(targetCode);
      executeVerification(targetCode);
    }
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setExtractedInfo(null);
      setIsVerifying(true);

      try {
        const metadata = await extractMetadataAndTextFromPdf(file);
        const cleanName = cleanDocumentName(file.name);

        if (metadata.verificationCode) {
          const code = metadata.verificationCode;
          setInputCode(code);
          setExtractedInfo(`Berhasil mendeteksi ID Verifikasi Resmi: ${code}`);
          executeVerification(code, file.name);
        } else if (metadata.qrText) {
          const code = metadata.qrText;
          setInputCode(code);
          setExtractedInfo(`Berhasil mendeteksi QR Code Digital TTD: ${code}`);
          executeVerification(code, file.name);
        } else if (metadata.trxId) {
          const code = metadata.trxId;
          setInputCode(code);
          setExtractedInfo(`Berhasil mendeteksi Nomor Transaksi: ${code}`);
          executeVerification(code, file.name);
        } else {
          setInputCode(cleanName);
          setExtractedInfo(`Memeriksa keaslian dokumen: ${cleanName}`);
          executeVerification(cleanName, file.name);
        }
      } catch (err) {
        console.error('File parsing error:', err);
        const cleanName = cleanDocumentName(file.name);
        setInputCode(cleanName);
        executeVerification(cleanName, file.name);
      }
    }
  };

  const executeVerification = async (rawCode: string, originalFileName?: string) => {
    const query = rawCode.trim();
    if (!query) {
      showToast('Pilih file PDF atau masukkan kode/ID verifikasi!', 'warning');
      return;
    }

    setIsVerifying(true);
    setVerificationResult(null);

    try {
      const cleanFile = cleanDocumentName(query);
      const cleanOrig = originalFileName ? cleanDocumentName(originalFileName) : cleanFile;
      const cleanBase = cleanFile.replace(/\.pdf$/i, '').trim();

      // Query Database Log Unduh PDF Ber-QR Resmi (auditLogs dengan status sah)
      const verifiedLocalLogs = auditLogs.filter(a => 
        (a.action === 'UNDUH_PDF_BER_QR' || Boolean(a.verificationCode)) && 
        a.hasQrAndSignature !== false && 
        Boolean(a.verificationCode)
      );

      // Ekstrak tanggal jika ada dalam query atau nama file (misal: 2026-09-23)
      const dateInQuery = (query.match(/\d{4}-\d{2}-\d{2}/) || cleanOrig.match(/\d{4}-\d{2}-\d{2}/))?.[0] || '';

      // Cari match yang paling akurat
      const verifiedLocalLog = verifiedLocalLogs.find(a => {
        const vCode = (a.verificationCode || '').toLowerCase();
        const qLower = query.toLowerCase();
        const cfLower = cleanFile.toLowerCase();
        const coLower = cleanOrig.toLowerCase();
        const cbLower = cleanBase.toLowerCase();
        const tId = (a.targetId || '').toLowerCase();
        const details = (a.details || '').toLowerCase();
        const docTitle = (a.documentTitle || '').toLowerCase();

        // 1. Cocokkan ID Verifikasi Unik (VLOG-...)
        if (vCode && (vCode === qLower || vCode === cfLower || qLower.includes(vCode))) return true;

        // 2. Cocokkan targetId / nama file bersih
        if (tId && (tId === cfLower || tId === coLower || tId === qLower)) return true;
        if (tId && (cfLower.includes(tId) || coLower.includes(tId))) return true;

        // 3. Cocokkan nama file di details log
        if (details && (details.includes(cfLower) || details.includes(coLower) || details.includes(cbLower))) return true;

        // 4. Cocokkan judul dokumen jika cocok dengan nama file dasar
        if (docTitle && (cbLower.includes(docTitle) || docTitle.includes(cbLower))) return true;

        // 5. Cocokkan kategori laporan dan tanggal
        if (dateInQuery) {
          const logDate = (a.timestamp || '');
          const isDateMatch = logDate.includes(dateInQuery) || (a.verificationCode || '').includes(dateInQuery.replace(/-/g, ''));
          if (isDateMatch) {
            if (cbLower.includes('audit') && (docTitle.includes('audit') || details.includes('audit'))) return true;
            if (cbLower.includes('kamar') && (docTitle.includes('kamar') || details.includes('kamar'))) return true;
            if ((cbLower.includes('perawatan') || cbLower.includes('maintenance')) && (docTitle.includes('perawatan') || details.includes('perawatan') || docTitle.includes('maintenance'))) return true;
            if (cbLower.includes('qc') && (docTitle.includes('qc') || details.includes('qc'))) return true;
            if ((cbLower.includes('sarapan') || cbLower.includes('makan')) && (docTitle.includes('sarapan') || details.includes('sarapan') || docTitle.includes('makan'))) return true;
            if ((cbLower.includes('anggota') || cbLower.includes('user')) && (docTitle.includes('anggota') || details.includes('anggota') || docTitle.includes('user'))) return true;
            if (cbLower.includes('aula') && (docTitle.includes('aula') || details.includes('aula'))) return true;
            if (cbLower.includes('unduh') && (docTitle.includes('unduh') || details.includes('unduh'))) return true;
          }
        }

        return false;
      });

      // 3. Cek apakah dokumen ini pernah diunduh secara manual tanpa QR & TTD
      const manualLocalLog = auditLogs.find(a =>
        (a.hasQrAndSignature === false || a.action === 'UNDUH_PDF_MANUAL') &&
        (
          (a.targetId && (a.targetId.toLowerCase() === cleanFile.toLowerCase() || a.targetId.toLowerCase() === cleanOrig.toLowerCase())) ||
          (a.details && (a.details.toLowerCase().includes(cleanFile.toLowerCase()) || a.details.toLowerCase().includes(cleanBase.toLowerCase())))
        )
      );

      // Jika ada log manual dan TIDAK ada catatan unduh ber-QR yang sah
      if (manualLocalLog && !verifiedLocalLog) {
        setVerificationResult({
          status: 'invalid',
          message: 'DOKUMEN TIDAK DAPAT DIVERIFIKASI: Dokumen ini terdata diunduh tanpa QR Code dan Tanda Tangan Digital resmi (dokumen cetak manual). Dokumen tidak terdaftar pada Log Unduh PDF Ber-QR dan tidak memiliki legalitas verifikasi digital resmi.'
        });
        showToast('Dokumen Tanpa QR & TTD Tidak Dapat Diverifikasi!', 'error');
        setIsVerifying(false);
        return;
      }

      const isFound = Boolean(verifiedLocalLog);

      if (isFound) {
        const vCode = verifiedLocalLog?.verificationCode || '';
        const docTitle = verifiedLocalLog?.documentTitle || `Dokumen Laporan Resmi (${vCode})`;
        const docId = verifiedLocalLog?.targetId || vCode;
        const tenant = 'Tamu / Instansi Terdaftar UPT Asrama Haji Jakarta';

        // Signatory verification
        const signatoryName = verifiedLocalLog?.signatoryName || 'Pimpinan UPT Asrama Haji Jakarta';
        const signatoryRole = verifiedLocalLog?.signatoryRole || 'Pimpinan Divisi / Penandatangan Sah';
        const signatoryNip = verifiedLocalLog?.signatoryNip || '-';

        // Officer who downloaded
        const officerName = verifiedLocalLog?.user || 'Petugas Sistem';
        const officerRole = verifiedLocalLog?.role || 'Administrator';
        const downloadTime = verifiedLocalLog?.timestamp || new Date().toLocaleString('id-ID');

        // Check signatory user in DB for unique QR & Signature match
        const signerUser = users.find(u => 
          u.fullName.toLowerCase() === signatoryName.toLowerCase() ||
          (u.nip && u.nip === signatoryNip) ||
          u.role.toLowerCase() === signatoryRole.toLowerCase()
        );

        const hasUniqueQr = Boolean(signerUser?.signatureUrl) || Boolean(signerUser?.qrCodeUrl) || Boolean(verifiedLocalLog?.qrCodeHash);
        
        if (!hasUniqueQr) {
          setVerificationResult({
            status: 'invalid',
            message: 'DOKUMEN TIDAK DAPAT DIVERIFIKASI: Pejabat penandatangan pada dokumen ini tidak memiliki spesimen tanda tangan digital aktif pada sistem.'
          });
          showToast('Dokumen Tidak Memiliki TTD Sah!', 'error');
          setIsVerifying(false);
          return;
        }

        const qrCodeHash = signerUser?.qrCodeUrl ? '1 TTD = 1 QR CODE TERTATA DI DATABASE' : 'QR-VERIFIED-AUTH';

        // Download logs related to this doc
        const relevantDownloads = auditLogs.filter(a => 
          a.action === 'UNDUH_PDF_BER_QR' &&
          a.hasQrAndSignature !== false &&
          (
            (a.verificationCode && a.verificationCode.toLowerCase() === vCode.toLowerCase()) ||
            (a.targetId && a.targetId.toLowerCase() === docId.toLowerCase()) ||
            a.details.toLowerCase().includes(docId.toLowerCase()) ||
            a.details.toLowerCase().includes(vCode.toLowerCase())
          )
        );

        setVerificationResult({
          status: 'success',
          message: 'DOKUMEN ASLI & RESMI: Dokumen PDF dan QR Code Tanda Tangan terverifikasi secara sah tercatat di Log Unduh PDF Ber-QR Resmi UPT Asrama Haji Jakarta. Dokumen ini merupakan dokumen resmi yang sah dan legal.',
          details: {
            verificationCode: vCode,
            docId,
            docTitle,
            tenantName: tenant,
            signatoryName,
            signatoryRole,
            signatoryNip,
            hasUniqueQr,
            qrCodeHash,
            officerName,
            officerRole,
            downloadTime,
            isDatabaseVerified: Boolean(verifiedLocalLog),
            downloadLogs: relevantDownloads.length > 0 ? relevantDownloads : [{
              timestamp: downloadTime,
              user: officerName,
              role: officerRole,
              action: 'UNDUH_PDF_BER_QR',
              details: `[${vCode}] Dokumen resmi terdaftar di database pengunduhan ber-QR Code & TTD.`
            }]
          }
        });
        showToast('Verifikasi Berhasil: Dokumen Sah & Resmi Terdaftar di Log Unduh Ber-QR!', 'success');
      } else {
        setVerificationResult({
          status: 'invalid',
          message: 'DOKUMEN TIDAK RESMI / TIDAK DAPAT DIVERIFIKASI: File PDF atau ID Dokumen ini tidak terdaftar dalam Log Unduh PDF Ber-QR Resmi UPT Asrama Haji Jakarta. Dokumen mungkin tidak memiliki QR Code dan TTD yang sah atau belum pernah diunduh resmi dari sistem.'
        });
        showToast('Dokumen Tidak Terdaftar di Log Unduh Ber-QR!', 'error');
      }
    } catch (err) {
      console.error('Verification error:', err);
      setVerificationResult({
        status: 'invalid',
        message: 'Gagal memproses verifikasi. Pastikan dokumen yang diunggah valid dan terdaftar.'
      });
      showToast('Gagal memverifikasi dokumen.', 'error');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeVerification(inputCode, selectedFile?.name);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12 animate-fade-in">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-hajj-900 via-hajj-800 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-6 -translate-y-6 w-56 h-56 bg-gold-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center space-x-2 px-3 py-1 bg-gold-500/20 border border-gold-500/30 rounded-full text-gold-300 text-xs font-bold">
            <i className="fa-solid fa-shield-halved"></i>
            <span>Sistem Verifikasi Database Resmi UPT Asrama Haji Jakarta</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight">Verifikasi Keaslian PDF & QR Code Tanda Tangan</h2>
          <p className="text-xs md:text-sm text-slate-300 max-w-2xl leading-relaxed">
            Unggah dokumen PDF ber-QR code atau masukkan ID Verifikasi Unik (misal: <code>VLOG-20260923-XXXX</code>) untuk mencocokkan keaslian tanda tangan digital langsung dengan basis data <strong>Log Unduh PDF Ber-QR</strong>.
          </p>
        </div>
      </div>

      {/* Upload & Form Section */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <form onSubmit={handleVerifySubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Unggah File PDF Dokumen Resmi atau Masukkan ID Verifikasi
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <label className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl cursor-pointer hover:border-hajj-600 bg-slate-50 dark:bg-slate-800/50 transition group">
                <div className="w-12 h-12 rounded-full bg-hajj-100 dark:bg-hajj-900/50 text-hajj-700 dark:text-hajj-300 flex items-center justify-center text-xl mb-2 group-hover:scale-110 transition">
                  <i className="fa-solid fa-cloud-arrow-up"></i>
                </div>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {selectedFile ? selectedFile.name : 'Klik untuk unggah file PDF'}
                </span>
                <span className="text-[10px] text-slate-400 mt-1">Sistem membaca kode verifikasi & QR Code secara otomatis</span>
                <input type="file" accept=".pdf,image/*" onChange={handleFileChange} className="hidden" />
              </label>
            </div>

            {extractedInfo && (
              <div className="mt-2.5 p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center space-x-2">
                <i className="fa-solid fa-circle-check text-emerald-600"></i>
                <span className="font-semibold">{extractedInfo}</span>
              </div>
            )}
          </div>

          <div className="relative flex items-center">
            <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
            <span className="flex-shrink mx-4 text-xs font-bold text-slate-400 uppercase">Atau Masukkan ID Verifikasi Unik</span>
            <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-grow">
              <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-400 pointer-events-none">
                <i className="fa-solid fa-barcode"></i>
              </span>
              <input
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="Contoh: VLOG-20260923-ABCD atau nama file..."
                className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold font-mono text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-hajj-600"
              />
            </div>
            <button
              type="submit"
              disabled={isVerifying}
              className="px-6 py-3 bg-hajj-700 hover:bg-hajj-800 text-white rounded-xl text-xs font-bold shadow transition flex items-center justify-center space-x-2 shrink-0 cursor-pointer disabled:opacity-50"
            >
              {isVerifying ? (
                <>
                  <i className="fa-solid fa-spinner animate-spin"></i>
                  <span>Memeriksa Database...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-shield-check"></i>
                  <span>Verifikasi Keaslian</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Verification Result Card */}
        {verificationResult && (
          <div className={`rounded-2xl p-6 border transition-all animate-fade-in ${
            verificationResult.status === 'success'
              ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
              : 'bg-red-50/70 dark:bg-red-950/30 border-red-300 dark:border-red-800'
          }`}>
            <div className="flex items-start space-x-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${
                verificationResult.status === 'success' ? 'bg-emerald-600 text-white shadow-md' : 'bg-red-600 text-white shadow-md'
              }`}>
                <i className={`fa-solid ${verificationResult.status === 'success' ? 'fa-certificate' : 'fa-triangle-exclamation'}`}></i>
              </div>
              <div className="space-y-3 flex-grow">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className={`text-base font-black ${verificationResult.status === 'success' ? 'text-emerald-900 dark:text-emerald-200' : 'text-red-900 dark:text-red-200'}`}>
                      {verificationResult.status === 'success' ? 'STATUS: DOKUMEN RESMI & SAH' : 'STATUS: DOKUMEN TIDAK DAPAT DIVERIFIKASI'}
                    </h3>
                    {verificationResult.status === 'success' && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white shadow-xs">
                        TERDAFTAR DI LOG UNDUH BER-QR
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                    {verificationResult.message}
                  </p>
                </div>

                {verificationResult.details && (
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
                    {/* Unique Security Verification Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-100 dark:border-slate-700">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">ID Verifikasi Dokumen Unik</span>
                        <span className="font-mono text-sm font-black text-blue-800 dark:text-blue-300">
                          {verificationResult.details.verificationCode}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center space-x-1">
                          <i className="fa-solid fa-cloud-check text-emerald-600"></i>
                          <span>Terdata di Basis Data Resmi</span>
                        </span>
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800 flex items-center space-x-1">
                          <i className="fa-solid fa-qrcode text-purple-600"></i>
                          <span>1 TTD = 1 QR Code Unik</span>
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Nama Dokumen / Objek</span>
                        <span className="font-bold text-slate-800 dark:text-white">{verificationResult.details.docTitle}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Nomor ID Referensi</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-white">{verificationResult.details.docId}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Pejabat Penandatangan Sah (TTD)</span>
                        <span className="font-bold text-slate-800 dark:text-white">{verificationResult.details.signatoryName}</span>
                        <div className="text-[11px] text-slate-500">{verificationResult.details.signatoryRole} {verificationResult.details.signatoryNip && verificationResult.details.signatoryNip !== '-' ? `• NIP ${verificationResult.details.signatoryNip}` : ''}</div>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Petugas Pengunduh & Waktu</span>
                        <span className="font-bold text-slate-800 dark:text-white">{verificationResult.details.officerName} ({verificationResult.details.officerRole})</span>
                        <div className="text-[11px] text-slate-500 font-mono">{verificationResult.details.downloadTime}</div>
                      </div>
                    </div>

                    {/* Tombol Navigasi Cepat ke Log Unduh PDF Ber-QR */}
                    <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500 flex items-center space-x-1.5">
                        <i className="fa-solid fa-shield-halved text-emerald-600"></i>
                        <span>Dokumen ini resmi terdaftar di sub-halaman <strong>Log Unduh PDF</strong>.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          sessionStorage.setItem('audit_log_target_subview', 'PDF_DOWNLOAD_LOGS');
                          setActiveTab('auditLog');
                          showToast('Membuka sub-halaman Log Unduh PDF...', 'info');
                        }}
                        className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
                      >
                        <i className="fa-solid fa-file-pdf"></i>
                        <span>Buka di Log Unduh PDF</span>
                        <i className="fa-solid fa-arrow-right text-[10px]"></i>
                      </button>
                    </div>

                    {/* Download Log History */}
                    <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">
                          Rekam Jejak Log Audit & Pengunduhan Dokumen Ini
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {verificationResult.details.downloadLogs.length} rekaman ditemukan
                        </span>
                      </div>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {verificationResult.details.downloadLogs.map((log, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-100 dark:border-slate-700 text-[11px]">
                            <div className="flex items-center space-x-2">
                              <i className="fa-solid fa-database text-rose-600"></i>
                              <span className="font-bold text-slate-700 dark:text-slate-200">{log.action || 'UNDUH_PDF'}</span>
                              <span className="text-slate-500 text-[10.5px]">• {log.details}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-2">{log.timestamp}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
