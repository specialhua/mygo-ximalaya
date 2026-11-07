import assert from "node:assert/strict";
import test from "node:test";
import { albumPage, audioResponse, encryptedURL, json, loadPlugin, profile, savedSession, trackPage } from "./helpers.mjs";
import { decodePlayURL, selectStream } from "../src/playback.js";
import { imageURL, parseLink, text } from "../src/utils.js";

test("the bundle loads without host calls and home works offline", async () => {
  const { plugin, requests } = await loadPlugin();
  assert.equal(await plugin.account(), null);
  assert.equal(plugin.home().title, "喜马拉雅");
  assert.deepEqual(plugin.recent(), []);
  assert.equal(requests.length, 0);
  assert.equal(plugin.remotePlay, undefined);
  assert.equal(plugin.subscribeShow, undefined);
});

test("a completed web sign-in is verified before the session is saved", async () => {
  const env = await loadPlugin(({ url }) => {
    assert.equal(url.pathname, "/revision/main/getCurrentUser");
    assert.equal(env.storage.has("session"), false);
    return profile();
  });
  let prompt;
  env.host.webSignIn = async (options) => {
    prompt = options;
    return { cookie: "1&_token=synthetic-login; 1&_uid=42" };
  };
  const result = await env.plugin.signIn();
  assert.equal(result.id, "42");
  // Regression: www served the login HTML, but its relative QR API was 404.
  assert.equal(new URL(prompt.url).origin, "https://passport.ximalaya.com");
  assert.equal(new URL(prompt.url).pathname, "/page/web/login");
  assert.equal(new URL(prompt.url).searchParams.get("fromUri"), "https://www.ximalaya.com/");
  assert.deepEqual(prompt.until, ["1&_token"]);
  assert.equal(prompt.cookiesOf, "https://www.ximalaya.com/");
  assert.match(env.storage.get("session").cookie, /synthetic-login/);
  assert.equal((await env.plugin.account()).name, "测试用户");
  assert.equal(env.requests.length, 1);
});

test("a canceled login keeps the previous session intact", async () => {
  const { plugin, host, storage } = await loadPlugin(undefined, savedSession());
  host.webSignIn = async () => { throw new Error("窗口已关闭"); };
  await assert.rejects(plugin.signIn(), /窗口已关闭/);
  assert.match(storage.get("session").cookie, /synthetic-old/);
});

test("sign-out during login cannot resurrect the session", async () => {
  const { plugin, host, storage } = await loadPlugin(profile);
  let finish;
  host.webSignIn = () => new Promise((resolve) => { finish = resolve; });
  const pending = plugin.signIn();
  plugin.signOut();
  finish({ cookie: "1&_token=synthetic-login" });
  await assert.rejects(pending, /账号状态已改变/);
  assert.equal(storage.has("session"), false);
  assert.equal(await plugin.account(), null);
});

test("a missing login cookie is never saved as a successful login", async () => {
  const { plugin, host, storage } = await loadPlugin();
  host.webSignIn = async () => ({ cookie: "visitor=anonymous" });
  await assert.rejects(plugin.signIn(), { code: "signIn" });
  assert.equal(storage.has("session"), false);
});

test("expired account responses clear the saved session", async () => {
  const { plugin, storage } = await loadPlugin(() => json({ ret: 401, isNeedLogin: true }), savedSession());
  assert.equal(await plugin.account(), null);
  assert.equal(storage.has("session"), false);
});

test("network failures do not delete an otherwise valid session or expose cookies", async () => {
  const { plugin, storage } = await loadPlugin(() => { throw new Error("secret-header=synthetic-old"); }, savedSession());
  await assert.rejects(plugin.account(), (error) => /无法连接/.test(error.message) && !/synthetic-old/.test(error.message));
  assert.equal(storage.has("session"), true);
});

test("Set-Cookie deletion invalidates login even on a successful HTTP response", async () => {
  const { plugin, storage } = await loadPlugin(() => json({ ret: 200, data: { uid: 42 } }, { "Set-Cookie": "1&_token=; Max-Age=0; Path=/; Domain=.ximalaya.com" }), savedSession());
  assert.equal(await plugin.account(), null);
  assert.equal(storage.has("session"), false);
});

test("new cookies are saved, but unrelated-domain cookies are not", async () => {
  const { plugin, storage } = await loadPlugin(() => {
    const response = profile();
    response.headers.append("Set-Cookie", "1&_token=synthetic-new; Path=/; Domain=.ximalaya.com");
    response.headers.append("Set-Cookie", "unrelated=no; Path=/; Domain=example.org");
    return response;
  }, savedSession());
  await plugin.account();
  assert.match(storage.get("session").cookie, /synthetic-new/);
  assert.doesNotMatch(storage.get("session").cookie, /unrelated/);
});

test("search converts HTML titles and seconds and preserves arbitrary offsets", async () => {
  const { plugin, requests } = await loadPlugin(({ url }) => {
    assert.equal(url.pathname, "/revision/search/seo");
    return json({ ret: 200, data: { track: { total: 40, docs: Array.from({ length: 30 }, (_, i) => ({ id: 100 + i, title: "<em>唐诗</em>", albumId: 55, duration: 93.5 })) } } });
  });
  const found = await plugin.search({ query: "唐诗", offset: 25 });
  assert.equal(found.tracks.length, 5);
  assert.equal(found.tracks[0].id, "125");
  assert.equal(found.tracks[0].name, "唐诗");
  assert.equal(found.tracks[0].duration, 93500);
  assert.equal(found.tracks[0].showId, "55");
  assert.equal(found.more, true);
  assert.equal(requests[0].url.searchParams.get("page"), "1");
});

test("HTTP 200 risk responses are errors, never empty successful searches", async () => {
  const { plugin } = await loadPlugin(() => json({ ret: 200, data: { riskLevel: 5, reason: "risk invalid" } }));
  await assert.rejects(plugin.search({ query: "唐诗" }), /验证/);
});

test("album pagination is chronological and does not skip the tail of a partial page", async () => {
  const { plugin, storage } = await loadPlugin(({ url }) => {
    if (url.pathname === "/revision/album") return json(albumPage());
    assert.equal(url.searchParams.get("sort"), "0");
    const page = Number(url.searchParams.get("num"));
    return json(trackPage("55", page));
  });
  const partial = await plugin.show({ id: "55", offset: 25 });
  const next = await plugin.show({ id: "55", offset: 30 });
  const last = await plugin.show({ id: "55", offset: 60 });
  assert.deepEqual(partial.episodes.map((t) => t.id), ["1025", "1026", "1027", "1028", "1029"]);
  assert.equal(next.episodes[0].id, "1030");
  assert.equal(last.episodes.length, 5);
  assert.equal(last.more, false);
  assert.equal(storage.has("viewedShows"), false);
  await plugin.show({ id: "55", offset: 0 });
  assert.equal(storage.get("viewedShows")[0].episodeCount, 65);
});

test("a pagination response for another album is rejected", async () => {
  const { plugin } = await loadPlugin(({ url }) => json(url.pathname === "/revision/album" ? albumPage() : trackPage("999", 1)));
  await assert.rejects(plugin.show({ id: "55" }), /无效专辑分页/);
});

test("pasted album links resolve IDs without fetching arbitrary URLs", async () => {
  const { plugin, requests } = await loadPlugin(() => json(albumPage()));
  const result = await plugin.search({ query: "https://www.ximalaya.com/album/55?from=share", kind: "shows" });
  assert.equal(result.shows[0].id, "55");
  assert.equal(requests[0].url.pathname, "/revision/album");
  assert.equal(parseLink("https://www.ximalaya.com.evil.example/album/55"), null);
  assert.equal(parseLink("http://127.0.0.1/album/55"), null);
});

test("the native audio stream includes no account cookies", async () => {
  const { plugin, requests } = await loadPlugin(() => json(audioResponse()), savedSession());
  const audio = await plugin.stream({ id: "123" });
  assert.equal(audio.type, "m4a");
  assert.equal(audio.url, "https://audiopay.cos.tx.xmcdn.com/test.m4a?token=synthetic");
  assert.match(requests[0].init.headers.Cookie, /synthetic-old/);
  assert.equal(audio.headers.Cookie, undefined);
});

test("an album link on the default Songs tab returns playable episodes and supports the next page", async () => {
  const { plugin } = await loadPlugin(({ url }) => json(url.pathname === "/revision/album" ? albumPage() : trackPage("55", Number(url.searchParams.get("num")))));
  const first = await plugin.search({ query: "https://www.ximalaya.com/album/55" });
  const next = await plugin.search({ query: "https://www.ximalaya.com/album/55", offset: first.tracks.length });
  assert.equal(first.tracks[0].id, "1000");
  assert.equal(next.tracks[0].id, "1030");
  assert.equal(first.more, true);
});

test("concurrent stream requests share one request and later plays fetch a fresh URL", async () => {
  let finish;
  const { plugin, requests } = await loadPlugin(() => new Promise((resolve) => { finish = resolve; }));
  const a = plugin.stream({ id: "123" });
  const b = plugin.stream({ id: "123" });
  assert.equal(requests.length, 1);
  finish(json(audioResponse()));
  assert.deepEqual(await a, await b);
  const c = plugin.stream({ id: "123" });
  assert.equal(requests.length, 2);
  finish(json(audioResponse()));
  await c;
});

test("sign-out invalidates a pending stream before its response is returned", async () => {
  let finish;
  const { plugin } = await loadPlugin(() => new Promise((resolve) => { finish = resolve; }), savedSession());
  const pending = plugin.stream({ id: "123" });
  plugin.signOut();
  finish(json(audioResponse()));
  await assert.rejects(pending, /账号状态已改变/);
});

test("purchase authorization is required even if a paid response contains URLs", () => {
  assert.throws(() => selectStream(audioResponse("123", { isPaid: true, isAuthorized: false }), "high"), { code: "unavailable" });
  assert.throws(() => selectStream(audioResponse("123", { isPaid: true, isAuthorized: undefined }), "high"), { code: "unavailable" });
});

test("preview audio and unsupported lossless requests are rejected", () => {
  assert.throws(() => selectStream(audioResponse("123", { playUrlList: [{ type: "M4A_64", url: encryptedURL("https://audio.xmcdn.com/_preview_/test.m4a") }] }), "high"), { code: "unavailable" });
  assert.throws(() => selectStream(audioResponse(), "lossless"), /无损/);
});

test("encrypted playback URLs cannot point to private or third-party hosts", () => {
  for (const url of ["https://127.0.0.1/a.m4a", "https://audio.xmcdn.com.evil.example/a.m4a", "https://user:password@audio.xmcdn.com/a.m4a", "https://audio.xmcdn.com:8443/a.m4a", "file:///tmp/test"]) {
    assert.throws(() => decodePlayURL(encryptedURL(url)), { code: "unavailable" });
  }
  assert.throws(() => decodePlayURL("broken!"), { code: "unavailable" });
});

test("subscribed albums are paged rather than loading an unbounded list", async () => {
  const { plugin, requests } = await loadPlugin(({ url }) => {
    if (url.pathname.endsWith("getCurrentUser")) return profile();
    assert.equal(url.searchParams.get("pageNum"), "2");
    return json({ ret: 200, data: { pageNum: 2, pageSize: 30, totalCount: 100, albumsInfo: [{ id: 55, title: "测试订阅", anchor: { anchorNickName: "主播" } }] } });
  }, savedSession());
  const result = await plugin.browse({ page: "subscriptions:2" });
  assert.equal(result.sections[0].shows[0].publisher, "主播");
  assert.equal(result.sections[0].morePage, "subscriptions:3");
  assert.equal(requests.length, 2);
});

test("local listening history deduplicates episodes and persists metadata only", async () => {
  const { plugin, storage } = await loadPlugin(({ url }) => json(url.pathname === "/revision/album" ? albumPage() : trackPage("55", 1)));
  await plugin.show({ id: "55" });
  await plugin.played({ id: "1000" });
  await plugin.played({ id: "1001" });
  await plugin.played({ id: "1000" });
  assert.deepEqual(plugin.recent().map((t) => t.id), ["1000", "1001"]);
  assert.doesNotMatch(JSON.stringify(storage.get("recent")), /synthetic|playUrlList/);
});

test("HTML text and image inputs cannot introduce arbitrary schemes", () => {
  assert.equal(text("<p>&lt;唐诗&gt;</p><script>bad()</script>"), "<唐诗>");
  assert.equal(imageURL("https://evil.example/cover.jpg"), "");
  assert.equal(imageURL("//imagev2.xmcdn.com/test.jpg"), "https://imagev2.xmcdn.com/test.jpg");
});
