import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { diagnoseSyncError } from "@/lib/sync-diagnosis.functions";

function renderMarkdown(md: string) {
  return md.split("\n").map((line, i) => {
    const t = line.trim();
    if (t.startsWith("## ")) return <h4 key={i} className="mt-3 font-bold text-hajj-800">{t.slice(3)}</h4>;
    if (!t) return <div key={i} className="h-1" />;
    const html = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
    return <p key={i} className="leading-relaxed" dangerouslySetInnerHTML={{ __html: html.replace(/<(?!\/?(strong|code)>)/g, "&lt;") }} />;
  });
}

export function SyncErrorAssistant() {
  const diagnose = useServerFn(diagnoseSyncError);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");

  const run = async () => {
    setLoading(true); setError(""); setAnswer("");
    try {
      const r = await diagnose({ data: { errorText: text } });
      if (r.ok) setAnswer(r.text); else setError(r.error);
    } catch {
      setError("Permintaan gagal. Periksa pesan error (minimal 5 karakter) lalu coba lagi.");
    } finally { setLoading(false); }
  };

  return (
    <div className="bg-white rounded-2xl p-5 border border-hajj-200 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <i className="fa-solid fa-wand-magic-sparkles text-gold-600"></i>
        <h3 className="font-bold text-slate-800">Asisten AI: Analisis Error Sinkronisasi</h3>
      </div>
      <p className="text-slate-500 text-xs">Tempel pesan error sinkronisasi Google Spreadsheet. AI akan menjelaskan kemungkinan penyebab dan langkah perbaikan.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        maxLength={12000}
        placeholder="Contoh: HTTP 403 Forbidden: Akses ditolak oleh Google Apps Script..."
        className="w-full rounded-xl border border-slate-300 p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-hajj-400"
      />
      <button
        type="button"
        disabled={loading || text.trim().length < 5}
        onClick={run}
        className="px-4 py-2 rounded-xl bg-hajj-700 hover:bg-hajj-800 text-white font-bold text-xs disabled:opacity-50"
      >
        {loading ? "Menganalisis…" : "Analisis dengan AI"}
      </button>
      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-red-700 text-xs">{error}</div>}
      {answer && <div className="rounded-xl bg-hajj-50 border border-hajj-200 p-4 text-xs text-slate-700">{renderMarkdown(answer)}</div>}
    </div>
  );
}
