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

export async function subscriptionPage(page = 1) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new Error("无效的订阅分页");
  await requireAccount();
  const { data } = await request("/revision/my/getSubscriptionSynthesize", { pageNum: page, pageSize: PAGE_SIZE });
  // The live subscription API returns `page`, unlike purchases (`pageNum`).
  if (!data || !Array.isArray(data.albumsInfo) || Number(data.page ?? data.pageNum) !== page) throw new Error("喜马拉雅未返回有效订阅列表");
  const shows = data.albumsInfo.map((item) => toShow(item, { subscribed: true }));
  const more = hasMore(data, shows.length, (page - 1) * PAGE_SIZE + shows.length, data.totalCount);
  if (more && !shows.length) throw new Error("喜马拉雅订阅分页暂不可用，请重新打开");
  return { shows, more };
}

export async function subscriptions(page = 1) {
  const { shows, more } = await subscriptionPage(page);
  return {
    title: "我的订阅", subtitle: "喜马拉雅账号订阅",
    sections: [{ title: "订阅专辑", shows, empty: "还没有订阅专辑", ...(more ? { morePage: `subscriptions:${page + 1}` } : {}) }],
  };
}

export async function purchasePage(page = 1) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new Error("无效的已购分页");
  await requireAccount();
  const { data } = await request("/revision/my/getHasBroughtAlbums", { pageNum: page, pageSize: PAGE_SIZE });
  if (!data || !Array.isArray(data.albumList) || Number(data.pageNum ?? data.page) !== page) throw new Error("喜马拉雅未返回有效已购列表");
  const shows = data.albumList.map((item) => toShow(item));
  // The live API misspells pageSize as pageSie; use our requested limit instead.
  const more = hasMore(data, shows.length, (page - 1) * PAGE_SIZE + shows.length, data.totalCount);
  if (more && !shows.length) throw new Error("喜马拉雅已购分页暂不可用，请重新打开");
  return { shows, more };
}

export async function purchases(page = 1) {
  const { shows, more } = await purchasePage(page);
  return {
    title: "已购专辑", subtitle: "单独购买的专辑；VIP 可听内容请通过搜索或订阅打开",
    sections: [{ title: "已购专辑", shows, empty: "当前账号没有单独购买的专辑；VIP 权益内容可通过搜索或订阅打开", ...(more ? { morePage: `purchases:${page + 1}` } : {}) }],
  };
}

export async function recommendations() {
  const { data } = await request("/revision/explore/guessYouLike", { page: 1, pageSize: 30 });
  if (!data || !Array.isArray(data.recommendInfoList)) throw new Error("喜马拉雅未返回有效推荐列表");
  return data.recommendInfoList.filter((item) => !item.isDeleted).slice(0, 60).map((item) => toShow(item));
}

function clockTime(value) {
  const seconds = Math.floor(Math.max(0, Number(value) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const rest = String(seconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

export async function historyPage(page = 1) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new Error("无效的历史分页");
  await requireAccount();
  const { data } = await request("/revision/track/history/listen", { includeChannel: false, includeRadio: false, pageNum: page, pageSize: PAGE_SIZE });
  const groups = [["today", "今天"], ["yesterday", "昨天"], ["earlier", "更早"]];
  if (!data || Number(data.pageNum) !== page || groups.some(([key]) => !Array.isArray(data[key]))) throw new Error("喜马拉雅未返回有效云端历史");
  const seen = new Set();
  let received = 0;
  const sections = groups.map(([key, title]) => {
    const rows = data[key];
    received += rows.length;
    const items = [];
    // History order is newest first, including multiple listens to one episode.
    for (const row of [...rows].sort((a, b) => Number(b.startedAt || 0) - Number(a.startedAt || 0))) {
      if (row.isDeleted || row.childIsVideo || Number(row.type) !== 1) continue;
      const id = idOf(row.childId);
      if (seen.has(id)) continue;
      seen.add(id);
      const track = toTrack({ trackId: id, trackName: row.childTitle, trackCoverPath: row.itemCoverUrl, albumId: row.itemId, albumName: row.itemTitle, anchorId: row.uid, anchorName: row.userName, duration: row.length, isPaid: row.isPaid });
      // Listening time is not an episode's publication date. The host has no
      // resume-position field for stream tracks, so present it as a description.
      if (Number.isFinite(Number(row.breakSecond)) && row.breakSecond !== null && row.breakSecond !== undefined) track.description = `上次听到 ${clockTime(row.breakSecond)}`;
      items.push(rememberTrack(track));
    }
    return { title, tracks: items };
  }).filter((section) => section.tracks.length);
  const more = hasMore(data, received, (page - 1) * PAGE_SIZE + received, data.totalCount);
  if (more && !received) throw new Error("喜马拉雅历史分页暂不可用，请重新打开");
  return { sections, tracks: sections.flatMap((section) => section.tracks), more };
}

export async function history(page = 1) {
  const result = await historyPage(page);
  const sections = result.sections.length ? result.sections : [{ title: "云端历史", tracks: [], empty: "喜马拉雅云端还没有可播放的历史记录" }];
  if (result.more) sections[sections.length - 1].morePage = `recent:${page + 1}`;
  return { title: "最近收听", subtitle: "喜马拉雅云端历史", sections };
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
