import { ecb } from "@noble/ciphers/aes.js";
import { SITE, USER_AGENT, fail, idOf, positive } from "./utils.js";
import { assertCurrent, epoch } from "./session.js";
import { request } from "./client.js";

// Public web-player protocol key, not a user's password or an account credential.
// Source: Ximalaya's own web player; see THIRD_PARTY_NOTICES.md.
const URL_KEY = Uint8Array.from("aaad3e4fd540b0f79dca95606e72bf93".match(/../g), (s) => parseInt(s, 16));
const pending = new Map();

export function decodePlayURL(encoded) {
  try {
    if (typeof encoded !== "string" || !encoded || encoded.length > 16384) throw new Error();
    if (/^https?:\/\//i.test(encoded)) return validateAudioURL(encoded);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
    if (!/^[A-Za-z0-9+/]+$/.test(normalized) || normalized.length % 4 === 1) throw new Error();
    const bytes = [];
    let bits = 0, buffer = 0;
    for (const char of normalized) {
      buffer = (buffer << 6) | alphabet.indexOf(char);
      bits += 6;
      if (bits >= 8) { bits -= 8; bytes.push((buffer >>> bits) & 255); }
    }
    const plain = ecb(URL_KEY).decrypt(Uint8Array.from(bytes));
    const url = decodeURIComponent(Array.from(plain, (b) => "%" + b.toString(16).padStart(2, "0")).join(""));
    return validateAudioURL(url);
  } catch (error) {
    if (error.code === "unavailable") throw error;
    throw fail("unavailable", "喜马拉雅返回了不支持的音频地址");
  }
}

export function validateAudioURL(value) {
  const url = new URL(value.replace(/^http:/i, "https:"));
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !url.hostname.endsWith(".xmcdn.com")) throw new Error("Invalid audio host");
  if (/(?:_preview_|\/preview\/|\/sample\/)/i.test(url.pathname)) throw fail("unavailable", "当前账号只有试听权限，无法播放完整单集");
  return url.toString();
}

function mediaType(type) {
  const upper = String(type || "").toUpperCase();
  if (upper.includes("MP3")) return "mp3";
  if (upper.includes("M4A")) return "m4a";
  if (upper.includes("AAC")) return "aac";
  if (upper.includes("FLAC")) return "flac";
  return "";
}

export function selectStream(body, quality) {
  const track = body.trackInfo;
  if (!track || !Array.isArray(track.playUrlList)) throw fail("unavailable", "喜马拉雅未返回可播放的音频");
  if (track.isVideo || track.isPublic === false || track.isDraft) throw fail("unavailable", "该单集暂不支持播放");
  // Never infer purchase rights from the presence of an encrypted URL.
  if (track.isAuthorized === false || (track.isPaid === true && track.isAuthorized !== true && track.isFree !== true)) {
    throw fail("unavailable", "当前账号无完整播放权限，请在喜马拉雅官方客户端确认权限");
  }
  const formats = track.playUrlList.filter((audio) => audio?.url && mediaType(audio.type));
  if (!formats.length) throw fail("unavailable", "该单集没有 MyGo 支持的音频格式");
  // A free/trailer episode in a paid album may legitimately have sampleSize > 0.
  // Authorization above and preview URL checks distinguish it from a sample.
  const lossless = quality === "lossless";
  const candidates = lossless ? formats.filter((audio) => mediaType(audio.type) === "flac") : formats;
  if (!candidates.length) throw fail("unavailable", "该单集未提供可用的无损音质");
  const target = quality === "standard" ? 0 : 1;
  const rank = (a) => Math.abs(Number(a.qualityLevel ?? 1) - target) * 10 + (mediaType(a.type) === "m4a" ? 0 : 1);
  const audio = [...candidates].sort((a, b) => rank(a) - rank(b))[0];
  const type = mediaType(audio.type);
  const url = decodePlayURL(audio.url);
  return {
    url, type, size: positive(audio.fileSize), quality: type === "flac" ? "lossless" : Number(audio.qualityLevel) === 0 ? "standard" : "high",
    headers: { "User-Agent": USER_AGENT, Referer: SITE + "/" },
  };
}

export async function stream({ id, quality = "high" }) {
  id = idOf(id);
  if (!["standard", "high", "lossless"].includes(quality)) throw fail("unsupported", "不支持的音质选项");
  const generation = epoch();
  const key = `${generation}:${id}:${quality}`;
  if (pending.has(key)) return pending.get(key);
  const promise = (async () => {
    const body = await request(`/mobile-playpage/track/v3/baseInfo/${Date.now()}`, { device: "web", trackId: id, trackQualityLevel: quality === "standard" ? 0 : quality === "lossless" ? 3 : 1 });
    assertCurrent(generation);
    if (String(body.trackInfo?.trackId) !== id) throw fail("unavailable", "喜马拉雅返回的单集不匹配");
    return selectStream(body, quality);
  })();
  pending.set(key, promise);
  try { return await promise; }
  finally { if (pending.get(key) === promise) pending.delete(key); }
}
