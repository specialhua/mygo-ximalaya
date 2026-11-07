import { PAGE_SIZE, fail, hasMore, idOf, offsetOf, parseLink } from "./utils.js";
import { request } from "./client.js";
import { requireAccount } from "./auth.js";
import { assertCurrent, epoch } from "./session.js";
import { toShow, toTrack } from "./models.js";

const albums = new Map();
const tracks = new Map();

function rememberTrack(track) {
  tracks.delete(track.id);
  tracks.set(track.id, track);
  if (tracks.size > 200) tracks.delete(tracks.keys().next().value);
  return track;
}

export async function loadShow(id) {
  id = idOf(id);
  const generation = epoch();
  const key = `${generation}:${id}`;
  const cached = albums.get(key);
  if (cached && Date.now() - cached.at < 120000) return cached.value;
  const { data } = await request("/revision/album", { albumId: id });
  if (!data?.mainInfo || !data?.tracksInfo || String(data.albumId) !== id) throw new Error("喜马拉雅未返回完整专辑信息");
  assertCurrent(generation);
  const value = toShow({ ...data.mainInfo, albumId: id, trackTotalCount: data.tracksInfo.trackTotalCount, anchorName: data.anchorInfo?.anchorName });
  albums.set(key, { at: Date.now(), value });
  if (albums.size > 30) albums.delete(albums.keys().next().value);
  return value;
}

export async function loadTrack(id) {
  id = idOf(id);
  const { data } = await request("/revision/track/simple", { trackId: id });
  if (!data?.trackInfo || String(data.trackInfo.trackId) !== id) throw fail("unavailable", "喜马拉雅未返回有效单集信息");
  const info = data.trackInfo;
  const album = data.albumInfo || {};
  const track = toTrack({ ...info, albumId: album.albumId ?? info.albumId, albumTitle: album.title, nickname: info.anchorName || info.nickname }, album);
  return rememberTrack(track);
}

export async function search({ query, kind = "tracks", offset = 0 }) {
  if (!["tracks", "shows"].includes(kind)) throw fail("unsupported", "支持搜索声音和节目专辑");
  offset = offsetOf(offset);
  const keyword = String(query || "").trim();
  if (!keyword) return { [kind]: [], more: false };
  if (keyword.length > 500) throw new Error("搜索内容过长");
  const link = parseLink(keyword);
  if (link) {
    // MyGo defaults to its Songs tab; an album link should work there too.
    if (kind === "tracks" && link.kind === "album") {
      const result = await show({ id: link.id, offset });
      return { tracks: result.episodes, more: result.more };
    }
    const matches = (kind === "shows" && link.kind === "album") || (kind === "tracks" && link.kind === "sound");
    if (!matches || offset > 0) return { [kind]: [], more: false };
    return { [kind]: [link.kind === "album" ? await loadShow(link.id) : await loadTrack(link.id)], more: false };
  }
  const core = kind === "shows" ? "album" : "track";
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const { data } = await request("/revision/search/seo", { kw: keyword, core, page, rows: PAGE_SIZE });
  const result = data?.[core];
  if (!result || !Array.isArray(result.docs)) throw new Error("喜马拉雅未返回有效搜索结果，请稍后重试");
  const records = result.docs.slice(offset % PAGE_SIZE);
  const items = records.map((item) => kind === "shows" ? toShow(item) : rememberTrack(toTrack(item)));
  const more = hasMore(result, result.docs.length, (page - 1) * PAGE_SIZE + result.docs.length, result.total);
  if (more && items.length === 0) throw new Error("喜马拉雅搜索分页暂不可用，请重新搜索");
  return { [kind]: items, more };
}

export async function show({ id, offset = 0 }) {
  id = idOf(id);
  offset = offsetOf(offset);
  const generation = epoch();
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const [album, response] = await Promise.all([
    loadShow(id),
    request("/revision/play/v1/show", { id, ptype: 0, num: page, size: PAGE_SIZE, sort: 0 }),
  ]);
  assertCurrent(generation);
  const data = response.data;
  if (!data || String(data.albumId) !== id || !Array.isArray(data.tracksAudioPlay) || Number(data.pageNum) !== page) throw new Error("喜马拉雅返回了无效专辑分页");
  const episodes = data.tracksAudioPlay.slice(offset % PAGE_SIZE).map((record) => rememberTrack(toTrack(record, album)));
  const more = hasMore(data, data.tracksAudioPlay.length, (page - 1) * PAGE_SIZE + data.tracksAudioPlay.length, album.episodeCount);
  if (more && !episodes.length) throw new Error("喜马拉雅专辑分页暂不可用，请重新打开专辑");
  if (offset === 0) {
    const previous = host.storage.get("viewedShows");
    const saved = Array.isArray(previous) ? previous.filter((item) => item?.id && item.id !== id) : [];
    host.storage.set("viewedShows", [album, ...saved].slice(0, 20));
  }
  return { show: album, episodes, more };
}

export async function subscriptions(page = 1) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new Error("无效的订阅分页");
  await requireAccount();
  const { data } = await request("/revision/my/getSubscriptionSynthesize", { pageNum: page, pageSize: PAGE_SIZE });
  if (!data || !Array.isArray(data.albumsInfo) || Number(data.pageNum) !== page) throw new Error("喜马拉雅未返回有效订阅列表");
  const shows = data.albumsInfo.map((item) => toShow(item, { subscribed: true }));
  const more = hasMore(data, shows.length, (page - 1) * PAGE_SIZE + shows.length, data.totalCount);
  if (more && !shows.length) throw new Error("喜马拉雅订阅分页暂不可用，请重新打开");
  return {
    title: "我的订阅", subtitle: "喜马拉雅账号订阅",
    sections: [{ title: "订阅专辑", shows, empty: "还没有订阅专辑", ...(more ? { morePage: `subscriptions:${page + 1}` } : {}) }],
  };
}

export function recent() {
  const records = host.storage.get("recent");
  return Array.isArray(records) ? records.filter((record) => record?.id && record?.album) : [];
}

export async function played({ id }) {
  id = idOf(id);
  const generation = epoch();
  const track = tracks.get(id) || await loadTrack(id);
  assertCurrent(generation);
  host.storage.set("recent", [track, ...recent().filter((item) => item.id !== id)].slice(0, 50));
}
