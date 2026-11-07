import { SITE, USER_AGENT, fail, idOf, imageURL, text } from "./utils.js";
import { AUTH_COOKIE, assertCurrent, beginSignIn, commitSession, currentSession, parseCookies, persist, signedIn } from "./session.js";
import { request } from "./client.js";

async function profileFor(active) {
  const { data } = await request("/revision/main/getCurrentUser", {}, { session: active });
  if (!data?.uid || !signedIn(active)) throw fail("signIn", "无法确认喜马拉雅登录状态，请重新登录");
  return {
    id: idOf(data.uid), name: text(data.nickname || data.nickName || data.name) || "喜马拉雅用户",
    imageUrl: imageURL(data.coverPath || data.avatar || data.logoPic || data.imgUrl), page: "account",
  };
}

export async function account() {
  const active = currentSession();
  if (!signedIn(active)) return null;
  if (active.profile && Date.now() - active.checkedAt < 60000) return active.profile;
  try {
    const profile = await profileFor(active);
    active.profile = profile;
    active.checkedAt = Date.now();
    persist(active);
    return profile;
  } catch (error) {
    if (error.code === "signIn") return null;
    throw error;
  }
}

export async function requireAccount() {
  const me = await account();
  if (!me) throw fail("signIn", "请先登录喜马拉雅账号");
  return me;
}

export async function signIn() {
  const started = beginSignIn();
  if (typeof host.webSignIn !== "function") throw fail("setup", "请更新 MyGo Music 后使用网页登录");
  host.signInPrompt({ text: "请在喜马拉雅登录窗口中扫码，并在手机上确认登录" });
  const result = await host.webSignIn({
    url: SITE + "/page/web/login", cookiesOf: SITE + "/", until: [AUTH_COOKIE], userAgent: USER_AGENT,
  });
  assertCurrent(started);
  const pending = { cookies: parseCookies(result?.cookie), profile: null, checkedAt: 0 };
  if (!signedIn(pending)) throw fail("signIn", "登录窗口未返回有效会话，请重新登录");
  pending.profile = await profileFor(pending);
  assertCurrent(started);
  pending.checkedAt = Date.now();
  commitSession(pending, started);
  host.signInPrompt({ text: "登录成功" });
  return pending.profile;
}
