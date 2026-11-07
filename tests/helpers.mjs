import { createCipheriv } from "node:crypto";

let serial = 0;

export function encryptedURL(url) {
  const cipher = createCipheriv("aes-128-ecb", Buffer.from("aaad3e4fd540b0f79dca95606e72bf93", "hex"), null);
  return Buffer.concat([cipher.update(url, "utf8"), cipher.final()]).toString("base64url");
}

export function audioResponse(id = "123", flags = {}) {
  return {
    ret: 0,
    trackInfo: {
      trackId: Number(id), isPaid: false, isAuthorized: true, isPublic: true, duration: 120,
      playUrlList: [{ type: "M4A_64", url: encryptedURL("https://audiopay.cos.tx.xmcdn.com/test.m4a?token=synthetic"), qualityLevel: 1, fileSize: 1024 }],
      ...flags,
    },
  };
}

export function json(body, headers = {}, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

export async function loadPlugin(handler = () => { throw new Error("Unexpected network request"); }, saved = {}) {
  const storage = new Map(Object.entries(structuredClone(saved)));
  const requests = [];
  const prompts = [];
  const host = {
    storage: {
      get(key) { return structuredClone(storage.get(key) ?? null); },
      set(key, value) { storage.set(key, structuredClone(value)); },
      remove(key) { storage.delete(key); },
    },
    signInPrompt(value) { prompts.push(value); },
    async webSignIn() { return { cookie: "1&_token=synthetic-login; 1&_uid=42" }; },
  };
  globalThis.host = host;
  globalThis.fetch = async (url, init) => {
    const call = { url: new URL(url), init };
    requests.push(call);
    return handler(call, requests.length);
  };
  const plugin = await import(`../index.js?test=${++serial}`);
  return { plugin, host, storage, requests, prompts };
}

export const savedSession = () => ({ session: { cookie: "1&_token=synthetic-old; 1&_uid=42", profile: { id: "42", name: "测试用户" } } });
export const profile = () => json({ ret: 200, data: { uid: 42, nickname: "测试用户", coverPath: "group/test.jpg" } });

export function albumPage(id = "55", total = 65) {
  return { ret: 200, data: { albumId: Number(id), mainInfo: { albumTitle: "测试专辑", cover: "group/test.jpg" }, anchorInfo: { anchorName: "测试主播" }, tracksInfo: { trackTotalCount: total } } };
}

export function trackPage(id, page, total = 65) {
  const start = (page - 1) * 30;
  return { ret: 200, data: {
    albumId: Number(id), pageNum: page, pageSize: 30, hasMore: start + 30 < total,
    tracksAudioPlay: Array.from({ length: Math.min(30, total - start) }, (_, i) => ({ trackId: 1000 + start + i, albumId: Number(id), trackName: `第${start + i + 1}集`, duration: 120 })),
  } };
}
