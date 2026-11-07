import { fail } from "./utils.js";

export const AUTH_COOKIE = "1&_token";
let session;
let generation = 0;

export function parseCookies(header) {
  const cookies = Object.create(null);
  for (const part of String(header || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!/^[!#$%&'*+\-.^_`|~\da-z]+$/i.test(name) || /[\r\n\x00-\x20\x7f;]/.test(value)) continue;
    if (value) cookies[name] = value;
  }
  return cookies;
}

export function currentSession() {
  if (!session) {
    const saved = host.storage.get("session");
    const cookie = saved?.cookie;
    const cookies = parseCookies(typeof cookie === "string" ? cookie : "");
    session = { cookies, profile: saved?.profile || null, checkedAt: 0 };
  }
  return session;
}

export function cookieHeader(active) {
  return Object.entries(active.cookies).map(([key, value]) => `${key}=${value}`).join("; ");
}

export function epoch() { return generation; }
export function beginSignIn() { return ++generation; }
export function assertCurrent(started) {
  if (started !== generation) throw new Error("账号状态已改变，请重试");
}

export function persist(active) {
  if (active !== session) return;
  if (active.cookies[AUTH_COOKIE]) host.storage.set("session", { cookie: cookieHeader(active), profile: active.profile });
  else host.storage.remove("session");
}

export function clearSession() {
  generation++;
  session = { cookies: Object.create(null), profile: null, checkedAt: 0 };
  host.storage.remove("session");
}

export function commitSession(active, started) {
  assertCurrent(started);
  session = active;
  persist(active);
}

export function signedIn(active = currentSession()) { return Boolean(active.cookies[AUTH_COOKIE]); }

export function expire(active) {
  if (active === session) clearSession();
  throw fail("signIn", "喜马拉雅登录状态已失效，请重新登录");
}

// These cookies come only from www.ximalaya.com. Other hosts never receive them.
export function acceptCookies(response, active) {
  if (typeof response.headers.getSetCookie !== "function") return;
  for (const line of response.headers.getSetCookie()) {
    const fields = line.split(";");
    const pair = fields.shift();
    const parsed = parseCookies(pair);
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator).trim();
    if (separator <= 0 || !/^[!#$%&'*+\-.^_`|~\da-z]+$/i.test(name)) continue;
    const attrs = Object.create(null);
    for (const field of fields) {
      const [key, ...value] = field.trim().split("=");
      attrs[key.toLowerCase()] = value.join("=");
    }
    if (attrs.domain && !["ximalaya.com", "www.ximalaya.com"].includes(attrs.domain.replace(/^\./, "").toLowerCase())) continue;
    // The session store is deliberately host-wide, not a general-purpose cookie jar.
    if (attrs.path && attrs.path !== "/") continue;
    const expired = attrs["max-age"] !== undefined ? Number(attrs["max-age"]) <= 0 : attrs.expires && Date.parse(attrs.expires) <= Date.now();
    if (expired || !parsed[name]) delete active.cookies[name];
    else active.cookies[name] = parsed[name];
  }
}
