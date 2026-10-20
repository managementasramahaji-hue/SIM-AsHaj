import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({ errorText: z.string().trim().min(5).max(12000) });

const INSTRUCTIONS = `Anda adalah asisten teknis untuk administrator SIM Asrama Haji Jakarta.
Aplikasi menyinkronkan data (gedung, kamar, transaksi, pengguna, sarapan, chat) ke Google Spreadsheet melalui Google Apps Script Web App (.exec) yang dipanggil oleh server aplikasi.
Administrator akan menempelkan pesan error sinkronisasi. Jelaskan dalam Bahasa Indonesia yang jelas dan ringkas, dengan format Markdown:
## Ringkasan
(1-2 kalimat apa yang terjadi)
## Kemungkinan Penyebab
(daftar bernomor, paling mungkin di atas)
## Langkah Perbaikan
(langkah konkret yang bisa dilakukan administrator, mis. Deploy > Manage deployments > Who has access: Anyone, periksa nama sheet/kolom, batas kuota Apps Script, format URL /exec)
Jangan mengarang detail yang tidak ada di pesan error; sebutkan jika informasi kurang.`;

export const diagnoseSyncError = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false as const, error: "Konfigurasi AI belum tersedia." };
    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText } = await import("ai");
    const { createLovableAiGatewayRunIdFetch } = await import("./ai/run-id.server");
    const runIdFetch = createLovableAiGatewayRunIdFetch();
    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: runIdFetch.fetch,
    });
    let failure: string | null = null;
    const result = streamText({
      model: provider.responses("openai/gpt-6-astra"),
      instructions: INSTRUCTIONS,
      messages: [{ role: "user", content: data.errorText }],
      maxRetries: 0,
      onError: ({ error }) => {
        const e = error as any;
        const status = e?.statusCode ?? e?.status;
        console.error("diagnoseSyncError failed", status, e?.responseBody ?? e?.message);
        failure =
          status === 402
            ? "Kredit AI habis. Tambahkan kredit di pengaturan workspace."
            : status === 429
              ? "Terlalu banyak permintaan. Coba lagi sebentar lagi."
              : `Analisis AI gagal${status ? ` (${status})` : ""}.`;
      },
      providerOptions: {
        openai: {
          store: false,
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          include: ["reasoning.encrypted_content"],
        },
      },
    } as any);
    let text = "";
    try {
      text = await result.text;
    } catch {}
    if (failure || !text.trim()) return { ok: false as const, error: failure ?? "AI tidak memberikan jawaban." };
    return { ok: true as const, text };
  });
