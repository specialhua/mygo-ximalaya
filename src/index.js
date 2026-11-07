import { fail } from "./utils.js";
import { account, requireAccount, signIn } from "./auth.js";
import { clearSession } from "./session.js";
import { played, recent, search, show, subscriptions } from "./catalog.js";

export { account, played, recent, search, show, signIn };
export { stream } from "./playback.js";

export function signOut() { clearSession(); }

export function home() {
  const viewed = host.storage.get("viewedShows");
  return {
    title: "喜马拉雅", subtitle: "搜索声音与节目专辑，也可粘贴专辑或单集链接",
    sections: [
      { title: "我的喜马拉雅", links: [{ title: "我的订阅", subtitle: "登录后查看订阅专辑", page: "subscriptions" }, { title: "最近收听", subtitle: "此设备的收听记录", page: "recent" }] },
      { title: "最近收听", tracks: recent().slice(0, 10), empty: "播放单集后会显示在这里", morePage: "recent" },
      { title: "浏览过的专辑", shows: Array.isArray(viewed) ? viewed : [], empty: "搜索节目专辑，或粘贴喜马拉雅专辑链接" },
    ],
  };
}

export async function browse({ page }) {
  if (page === "recent") return { title: "最近收听", subtitle: "仅保存在此设备，不同步云端进度", sections: [{ tracks: recent(), empty: "还没有收听记录" }] };
  if (page === "account") {
    const me = await requireAccount();
    return { title: me.name, imageUrl: me.imageUrl, sections: [{ links: [{ title: "我的订阅", page: "subscriptions" }, { title: "最近收听", page: "recent" }] }] };
  }
  const match = /^subscriptions(?::([1-9]\d{0,3}))?$/.exec(String(page));
  if (match) return subscriptions(match[1] ? Number(match[1]) : 1);
  throw fail("unsupported", "没有这个喜马拉雅页面");
}
