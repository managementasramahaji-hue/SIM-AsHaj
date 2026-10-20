// Replaces the old Express /api server: Google Sheet proxy, chat and live-update state.
// State is kept in the server_store table (server-only access).
import { createFileRoute } from "@tanstack/react-router";

const DEFAULT_SHEET_URL =
  "https://script.google.com/macros/s/AKfycby9Tok8-zgcVsTuXfQBDA0prmRSpUs9kxpeyczsw9SRVjwZBEk6Y8st3tBv7LK7j_X6/exec";

type RT = { presences: Record<string, any>; workSessions: any[]; chatChannels: any[]; chatMessages: any[] };

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
async function getKey<T>(key: string, fallback: T): Promise<T> {
  const { data } = await (await db()).from("server_store").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}
async function setKey(key: string, value: unknown) {
  await (await db()).from("server_store").upsert({ key, value: value as any, updated_at: new Date().toISOString() });
}
const emptyRT = (): RT => ({ presences: {}, workSessions: [], chatChannels: [], chatMessages: [] });
async function getRT(): Promise<RT> {
  const rt = { ...emptyRT(), ...(await getKey<RT>("realtime", emptyRT())) };
  const now = Date.now();
  for (const [k, p] of Object.entries(rt.presences)) if (now - (p as any).lastSeenMs > 120000) delete rt.presences[k];
  return rt;
}
async function sheetsConfig() {
  return getKey<any>("sheets_config", { webAppUrl: DEFAULT_SHEET_URL, isConfigured: true });
}

const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function upsertChannel(rt: RT, ch: any, extra: any = {}) {
  const i = rt.chatChannels.findIndex((c) => c.id === ch.id);
  const now = new Date().toISOString();
  if (i >= 0) rt.chatChannels[i] = { ...rt.chatChannels[i], ...ch, ...extra, updatedAt: now };
  else rt.chatChannels.unshift({ ...ch, ...extra, createdAt: now, updatedAt: now });
}
function addMessage(rt: RT, msg: any, channel?: any) {
  if (!rt.chatMessages.some((m) => m.id === msg.id)) rt.chatMessages.push(msg);
  if (rt.chatMessages.length > 2000) rt.chatMessages = rt.chatMessages.slice(-2000);
  if (channel?.id)
    upsertChannel(rt, channel, {
      lastMessage: msg.message,
      lastMessageTime: msg.timeFormatted,
      lastSenderName: msg.senderName,
    });
}
function markRead(rt: RT, channelId: string, userId: string) {
  rt.chatMessages = rt.chatMessages.map((m) =>
    m.channelId === channelId && Array.isArray(m.readBy) && !m.readBy.includes(userId)
      ? { ...m, readBy: [...m.readBy, userId] }
      : m,
  );
}

async function handleEvent(body: any) {
  const { type, payload, clientId } = body || {};
  if (!type) return json({ error: "Missing event type" }, 400);
  if (type === "chat:typing") return json({ ok: true });
  if (type === "database:sync") {
    if (payload?.db && typeof payload.db === "object") await setKey("db_cache", payload.db);
    return json({ ok: true });
  }
  const rt = await getRT();
  if (type === "presence:heartbeat" && payload?.userId) {
    rt.presences[`${payload.userId}___${clientId || "default"}`] = { ...payload, clientId: clientId || "default", lastSeenMs: Date.now() };
  } else if (type === "presence:leave" || type === "presence:logout") {
    for (const [k, p] of Object.entries(rt.presences))
      if ((p as any).userId === payload?.userId && (!clientId || (p as any).clientId === clientId || payload?.allDevices)) delete rt.presences[k];
  } else if (type === "session:upsert" && payload?.id) {
    const i = rt.workSessions.findIndex((s) => s.id === payload.id);
    if (i >= 0) rt.workSessions[i] = { ...rt.workSessions[i], ...payload };
    else rt.workSessions.unshift(payload);
    if (payload.closeOtherUserSessions && payload.userId)
      rt.workSessions = rt.workSessions.map((s) =>
        s.userId === payload.userId && s.id !== payload.id && s.status === "AKTIF"
          ? { ...s, status: "SELESAI", logoutTime: payload.loginTime || new Date().toISOString().replace("T", " ").substring(0, 19) }
          : s,
      );
  } else if (type === "session:sync_bulk" && Array.isArray(payload)) {
    const byId = new Map(rt.workSessions.filter((s) => s?.id).map((s) => [s.id, s]));
    for (const s of payload) {
      if (!s?.id) continue;
      const e = byId.get(s.id);
      byId.set(s.id, !e ? s : e.status === "SELESAI" && s.status === "AKTIF" ? e : { ...e, ...s });
    }
    rt.workSessions = Array.from(byId.values());
  } else if (type === "session:clear") {
    rt.workSessions = [];
  } else if (type === "chat:message" && payload?.message?.id) {
    addMessage(rt, payload.message, payload.channel);
  } else if (type === "chat:read" && payload?.channelId && payload?.userId) {
    markRead(rt, payload.channelId, payload.userId);
  } else if (type === "chat:channel" && payload?.id) {
    upsertChannel(rt, payload);
  } else if (type === "chat:clear") {
    rt.chatMessages = payload?.channelId ? rt.chatMessages.filter((m) => m.channelId !== payload.channelId) : [];
  }
  await setKey("realtime", rt);
  return json({ ok: true });
}

async function proxySheet(url: string, init?: RequestInit) {
  const res = await fetch(url, { redirect: "follow", ...init });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} dari Google Spreadsheet`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Respons Google Spreadsheet bukan JSON");
  }
}

function stream() {
  const enc = new TextEncoder();
  let timer: any;
  const body = new ReadableStream({
    async start(ctrl) {
      let last = "";
      const send = async () => {
        try {
          const rt = await getRT();
          const cfg = await sheetsConfig();
          const s = JSON.stringify({
            type: "init",
            payload: { presences: Object.values(rt.presences), workSessions: rt.workSessions, chatChannels: rt.chatChannels, chatMessages: rt.chatMessages, sheetsConfig: cfg, databaseConfig: cfg },
            timestamp: Date.now(),
          });
          const sig = s.replace(/"timestamp":\d+/, "");
          ctrl.enqueue(enc.encode(sig !== last ? `data: ${s}\n\n` : `: keepalive\n\n`));
          last = sig;
        } catch {}
      };
      await send();
      let n = 0;
      timer = setInterval(async () => {
        if (++n > 15) { clearInterval(timer); try { ctrl.close(); } catch {} return; }
        await send();
      }, 3000);
    },
    cancel() { clearInterval(timer); },
  });
  return new Response(body, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" } });
}

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const path = (params as any)._splat as string;
        const url = new URL(request.url);
        if (path === "sheets-config") return json(await sheetsConfig());
        if (path === "realtime/stream") return stream();
        if (path === "realtime/state") {
          const rt = await getRT();
          return json({ ok: true, presences: Object.values(rt.presences), workSessions: rt.workSessions, chatChannels: rt.chatChannels, chatMessages: rt.chatMessages, timestamp: Date.now() });
        }
        if (path === "chat/database") {
          const rt = await getRT();
          return json({ ok: true, channels: rt.chatChannels, messages: rt.chatMessages, count: { channels: rt.chatChannels.length, messages: rt.chatMessages.length }, timestamp: Date.now() });
        }
        if (path === "sheets/database" || path === "database") {
          const cfg = await sheetsConfig();
          const target = cfg.webAppUrl || DEFAULT_SHEET_URL;
          const sheet = url.searchParams.get("sheet");
          try {
            const data = await proxySheet(sheet ? `${target}${target.includes("?") ? "&" : "?"}sheet=${encodeURIComponent(sheet)}` : target);
            return json({ status: "success", data: data?.data ?? data, source: "google_sheets", updatedAt: new Date().toISOString() });
          } catch (e: any) {
            const cache = await getKey<any>("db_cache", null);
            if (cache) return json({ status: "cached", message: e.message, data: cache });
            return json({ status: "unconfigured", message: `Google Spreadsheet belum dapat diakses: ${e.message}`, data: null });
          }
        }
        return json({ error: "Not found" }, 404);
      },
      POST: async ({ request, params }) => {
        const path = (params as any)._splat as string;
        const body = await request.json().catch(() => ({}));
        if (path === "sheets-config") {
          const cfg = {
            webAppUrl: String(body.webAppUrl || "").trim(),
            sheetId: String(body.sheetId || "").trim(),
            sheetDocUrl: String(body.sheetId || "").trim(),
            apiKey: String(body.apiKey || "").trim(),
            isConfigured: Boolean(body.webAppUrl),
            updatedAt: new Date().toISOString(),
          };
          await setKey("sheets_config", cfg);
          return json({ ok: true, success: true, config: cfg });
        }
        if (path === "realtime/event") return handleEvent(body);
        if (path === "chat/messages") {
          const m = body.message;
          if (!m?.channelId || !m?.message) return json({ ok: false, error: "Pesan tidak lengkap" }, 400);
          const now = new Date();
          const msg = {
            ...m,
            id: m.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: m.timestamp || now.toISOString(),
            timeFormatted: m.timeFormatted || now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) + " WIB",
            priority: m.priority || "NORMAL",
            readBy: Array.isArray(m.readBy) ? m.readBy : [m.senderId].filter(Boolean),
            createdAt: m.createdAt || now.toISOString(),
          };
          const rt = await getRT();
          addMessage(rt, msg, body.channel);
          await setKey("realtime", rt);
          return json({ ok: true, message: msg });
        }
        if (path === "chat/channels") {
          if (!body.channel?.id) return json({ ok: false, error: "Data channel tidak lengkap" }, 400);
          const rt = await getRT();
          upsertChannel(rt, body.channel);
          await setKey("realtime", rt);
          return json({ ok: true, channel: body.channel });
        }
        if (path === "chat/mark-read") {
          if (body.channelId && body.userId) {
            const rt = await getRT();
            markRead(rt, body.channelId, body.userId);
            await setKey("realtime", rt);
          }
          return json({ ok: true });
        }
        if (path === "sheets/database" || path === "database") {
          const cfg = await sheetsConfig();
          const target = String(body.webAppUrl || cfg.webAppUrl || DEFAULT_SHEET_URL).trim();
          await setKey("db_cache", body);
          try {
            const r = await proxySheet(target, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
            return json({ status: "success", result: r });
          } catch (e: any) {
            return json({ status: "warning", warning: `Tersimpan di server, tetapi gagal push ke Spreadsheet: ${e.message}` });
          }
        }
        return json({ error: "Not found" }, 404);
      },
    },
  },
});
