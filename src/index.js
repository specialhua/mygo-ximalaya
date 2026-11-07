import { fail } from "./utils.js";
import { account, requireAccount, signIn } from "./auth.js";
import { clearSession, signedIn } from "./session.js";
import { history, historyPage, played, purchasePage, purchases, recent as localRecent, recommendations, search, show, subscriptionPage, subscriptions } from "./catalog.js";

export { account, played, search, show, signIn };
export { stream } from "./playback.js";

export function signOut() { clearSession(); }

export async function recent() {
  if (!signedIn()) return [];
  return (await historyPage(1)).tracks;
}

export async function home() {
  const viewed = host.storage.get("viewedShows");
  const listening = localRecent();
  const loggedIn = signedIn();
  // Load independent sections together. A failure in one must not erase the
  // rest of the page or the user's local history.
  const [recommended, subscribed, purchased, listened] = await Promise.allSettled([
    recommendations(),
    loggedIn ? subscriptionPage(1) : Promise.resolve(null),
    loggedIn ? purchasePage(1) : Promise.resolve(null),
    loggedIn ? historyPage(1) : Promise.resolve(null),
  ]);
  const sections = [{
    title: "发现专辑", shows: recommended.status === "fulfilled" ? recommended.value.slice(0, 12) : [],
    empty: recommended.status === "rejected" ? `推荐暂不可用：${recommended.reason.message}` : "暂无推荐专辑",
    morePage: "discover",
  }];
  for (const [result, title, page, empty] of [
    [subscribed, "我的订阅", "subscriptions", "当前账号还没有订阅专辑"],
    [purchased, "已购专辑", "purchases", "当前账号没有单独购买的专辑；VIP 内容可通过搜索或订阅打开"],
  ]) {
    if (!loggedIn) continue;
    const value = result.status === "fulfilled" ? result.value : null;
    sections.push({ title, shows: value?.shows.slice(0, 12) || [], empty: result.status === "rejected" ? `暂时无法加载：${result.reason.message}` : empty, morePage: page });
  }
  if (loggedIn) sections.push({ title: "最近收听", tracks: listened.status === "fulfilled" ? listened.value.tracks.slice(0, 10) : [], empty: listened.status === "rejected" ? `云端历史暂不可用：${listened.reason.message}` : "云端还没有收听记录", morePage: "recent" });
  if (listening.length) sections.push({ title: "本机记录", tracks: listening.slice(0, 10), morePage: "local-recent" });
  if (Array.isArray(viewed) && viewed.length) sections.push({ title: "浏览过的专辑", shows: viewed });
  return {
    title: "喜马拉雅", subtitle: "搜索声音与节目专辑，也可粘贴专辑或单集链接",
    sections,
  };
}

export async function browse({ page }) {
  if (page === "local-recent") return { title: "本机记录", subtitle: "此设备的收听记录", sections: [{ tracks: localRecent(), empty: "还没有收听记录" }] };
  if (page === "account") {
    const me = await requireAccount();
    return { title: me.name, imageUrl: me.imageUrl, sections: [{ links: [{ title: "我的订阅", page: "subscriptions" }, { title: "已购专辑", page: "purchases" }, { title: "最近收听", page: "recent" }, { title: "本机记录", page: "local-recent" }] }] };
  }
  if (page === "discover") return { title: "发现专辑", sections: [{ title: "喜马拉雅推荐", shows: await recommendations(), empty: "暂无推荐专辑" }] };
  const match = /^(subscriptions|purchases|recent)(?::([1-9]\d{0,3}))?$/.exec(String(page));
  if (match) return ({ subscriptions, purchases, recent: history })[match[1]](match[2] ? Number(match[2]) : 1);
  throw fail("unsupported", "没有这个喜马拉雅页面");
}
