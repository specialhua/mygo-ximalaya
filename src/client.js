import { SITE, USER_AGENT, fail } from "./utils.js";
import { acceptCookies, assertCurrent, cookieHeader, currentSession, epoch, expire, persist, signedIn } from "./session.js";

export async function request(path, params = {}, options = {}) {
  if (!path.startsWith("/") || path.startsWith("//") || /[?#\r\n]/.test(path)) throw new Error("无效的请求路径");
  const active = options.session || currentSession();
  const started = epoch();
  const url = new URL(path, SITE);
  if (url.origin !== SITE) throw new Error("无效的请求地址");
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
  const headers = { "User-Agent": USER_AGENT, Referer: SITE + "/", Accept: "application/json" };
  const cookie = cookieHeader(active);
  if (cookie) headers.Cookie = cookie;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let response;
  let body;
  try {
    response = await fetch(url.toString(), { headers, signal: controller.signal, redirect: "error" });
    assertCurrent(started);
    const wasSignedIn = signedIn(active);
    acceptCookies(response, active);
    persist(active);
    if (wasSignedIn && !signedIn(active)) expire(active);
    if (response.status === 401) expire(active);
    if (!response.ok) throw new Error(`喜马拉雅请求失败（HTTP ${response.status}）`);
    try { body = await response.json(); }
    catch { throw new Error("喜马拉雅返回了无法识别的数据，请稍后重试"); }
  } catch (error) {
    if (started !== epoch()) throw error.code === "signIn" ? error : new Error("账号状态已改变，请重试");
    if (error.code === "signIn") throw error;
    if (controller.signal.aborted) throw new Error("喜马拉雅请求超时，请稍后重试");
    // Do not expose response bodies, cookies, signed URLs or lower-level fetch errors.
    if (response) throw error;
    throw new Error("无法连接喜马拉雅，请检查网络后重试");
  } finally { clearTimeout(timer); }
  assertCurrent(started);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("喜马拉雅返回了无效数据");
  if (body.isNeedLogin || body.needLogin || Number(body.ret) === 401) expire(active);
  if (body.ret === undefined || ![0, 200].includes(Number(body.ret))) {
    if (Number(body.ret) === 404) throw fail("unavailable", "内容不存在或已下架");
    if ([403, 407, 429].includes(Number(body.ret))) throw new Error("喜马拉雅要求验证访问，请重新登录，或稍后在官方网页确认可正常访问");
    throw new Error(`喜马拉雅接口暂不可用（${Number.isFinite(Number(body.ret)) ? Number(body.ret) : "未知"}）`);
  }
  const data = body.data;
  if (data?.riskLevel || data?.reason || data?.illegal) throw new Error("喜马拉雅要求完成网页验证，请重新登录后重试");
  return body;
}
