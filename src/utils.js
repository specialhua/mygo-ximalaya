export const SITE = "https://www.ximalaya.com";
export const PAGE_SIZE = 30;
export const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function idOf(value) {
  if (typeof value === "number" && !Number.isSafeInteger(value)) throw new Error("无效的喜马拉雅 ID");
  const id = String(value ?? "");
  if (!/^[1-9]\d{0,17}$/.test(id)) throw new Error("无效的喜马拉雅 ID");
  return id;
}

export function offsetOf(value) {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("无效的分页位置");
  return value;
}

export function text(value) {
  const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(value ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?(?:p|div|br|blockquote)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, entity) => {
      if (entity[0] !== "#") return entities[entity.toLowerCase()] ?? all;
      const n = /^#x/i.test(entity) ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "";
    })
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function positive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function imageURL(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  let url = value.trim();
  if (url.startsWith("//")) url = "https:" + url;
  else if (!/^https?:\/\//i.test(url)) url = "https://imagev2.xmcdn.com/" + url.replace(/^\/+/, "");
  url = url.replace(/^http:/i, "https:");
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || (parsed.port && parsed.port !== "443") || !parsed.hostname.endsWith(".xmcdn.com")) return "";
    return parsed.toString();
  } catch { return ""; }
}

// User input is an ID, never an arbitrary URL to fetch. This also prevents SSRF.
export function parseLink(value) {
  const input = String(value ?? "").trim();
  const explicit = /^(album|sound):([1-9]\d{0,17})$/.exec(input);
  if (explicit) return { kind: explicit[1], id: explicit[2] };
  if (!/^https?:\/\//i.test(input)) return null;
  try {
    const url = new URL(input);
    if (!["www.ximalaya.com", "m.ximalaya.com", "ximalaya.com"].includes(url.hostname) || url.username || url.password || url.port) return null;
    const match = /^\/(?:\d+\/)?(album|sound)\/([1-9]\d{0,17})\/?$/.exec(url.pathname);
    return match ? { kind: match[1], id: match[2] } : null;
  } catch { return null; }
}

export function hasMore(page, count, consumed, total) {
  if (typeof page.hasMore === "boolean") return page.hasMore;
  if (Number.isFinite(Number(total)) && Number(total) >= 0) return consumed < Number(total);
  return count === PAGE_SIZE;
}
