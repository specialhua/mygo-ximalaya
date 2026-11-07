import { SITE, idOf, imageURL, positive, text } from "./utils.js";

export function toShow(record, extra = {}) {
  const id = idOf(record.albumId ?? record.id);
  return {
    id, name: text(record.albumTitle || record.title || record.name) || "未命名专辑",
    imageUrl: imageURL(record.cover || record.coverPath || record.coverLarge || record.albumCoverPath),
    description: text(record.richIntro || record.intro || record.description || record.shortIntro),
    publisher: text(record.anchorName || record.nickname || record.anchor?.anchorNickName),
    episodeCount: Math.floor(positive(record.trackTotalCount ?? record.trackCount ?? record.tracksCount)),
    subscribed: Boolean(record.isSubscribe), ...extra,
  };
}

export function toTrack(record, album = {}) {
  const id = idOf(record.trackId ?? record.id);
  const showId = record.albumId ?? album.id ?? album.albumId;
  const author = record.anchorId ?? record.anchorUid ?? record.uid;
  const duration = positive(record.duration ?? record.length);
  const track = {
    id, name: text(record.trackName || record.title || record.name) || "未命名单集",
    artists: [{ id: author ? idOf(author) : "", name: text(record.nickname || record.anchorName || album.publisher) }],
    album: {
      id: showId ? idOf(showId) : "", name: text(record.albumName || record.albumTitle || album.name || album.title),
      imageUrl: imageURL(record.trackCoverPath || record.coverPath || record.coverLarge || record.albumCoverPath || album.imageUrl || album.coverPath),
    },
    duration: Math.round(duration * 1000), url: `${SITE}/sound/${id}`,
    description: text(record.intro || record.richIntro || record.description),
    unavailable: record.isNoCopyright === true || record.isPublic === false || (record.isPaid === true && record.isAuthorized === false && record.isFree !== true),
  };
  if (showId) track.showId = idOf(showId);
  if (positive(record.createdAt)) track.published = new Date(Number(record.createdAt)).toISOString().slice(0, 10);
  else if (typeof record.createTime === "string") track.published = record.createTime;
  return track;
}
