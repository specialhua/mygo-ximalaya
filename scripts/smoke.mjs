// Opt-in, public read-only requests. No real account credentials are loaded.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const storage = new Map();
globalThis.host = {
  storage: { get: (key) => structuredClone(storage.get(key) ?? null), set: (key, value) => storage.set(key, structuredClone(value)), remove: (key) => storage.delete(key) },
};
const plugin = await import(`../index.js?smoke=${randomUUID()}`);
assert.equal(await plugin.account(), null);
assert.equal(plugin.home().title, "喜马拉雅");
for (const kind of ["shows", "tracks"]) {
  const found = await plugin.search({ query: "唐诗", kind, offset: 0 });
  assert.ok(found[kind].length > 0);
  console.log(`${kind}: ${found[kind].length} results; more=${found.more}`);
}
const a = await plugin.show({ id: "5534601", offset: 0 });
const b = await plugin.show({ id: "5534601", offset: a.episodes.length });
assert.ok(a.episodes.length && b.episodes.length);
assert.equal(new Set([...a.episodes, ...b.episodes].map((t) => t.id)).size, a.episodes.length + b.episodes.length);
console.log(`show: ${a.show.name}; pages=${a.episodes.length}+${b.episodes.length}`);
const resolved = await plugin.search({ query: "https://www.ximalaya.com/sound/47740352", kind: "tracks" });
assert.equal(resolved.tracks[0].id, "47740352");
const audio = await plugin.stream({ id: "47740352", quality: "high" });
assert.ok(["mp3", "m4a", "aac"].includes(audio.type));
const response = await fetch(audio.url, { headers: { ...audio.headers, Range: "bytes=0-255" }, redirect: "error", signal: AbortSignal.timeout(10000) });
assert.equal(response.status, 206);
const reader = response.body.getReader();
const first = await reader.read();
await reader.cancel();
assert.ok(first.value?.byteLength > 0);
console.log(`audio: HTTP ${response.status}; type=${audio.type}; range=${response.headers.get("content-range")}`);
await plugin.played({ id: a.episodes[0].id });
assert.equal(plugin.recent()[0].id, a.episodes[0].id);
console.log("Public smoke passed. Account login and paid playback still require an in-app test.");
