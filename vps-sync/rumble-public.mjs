const ORIGIN = "https://rumble.com";
const VIDEO_PATH = /^\/(v[a-z0-9]+)-[a-z0-9._-]+\.html$/i;
const CHANNEL_PATH = /^\/(?:c|user)\/[a-z0-9_-]+$/i;

function attribute(tag, name) {
  return tag?.match(new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))
    ?.slice(1).find((value) => value !== undefined);
}

function decode(value = "") {
  const entities = { amp: "&", apos: "'", quot: '"', lt: "<", gt: ">", nbsp: " " };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
    if (!code.startsWith("#")) return entities[code] ?? entity;
    const number = /^#x/i.test(code) ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : entity;
  });
}

export function publicRumbleCards(html) {
  const cards = [];
  const seen = new Set();
  const blocks = html.split(/<div\b(?=[^>]*\bclass="videostream thumbnail__grid--item")[^>]*\bdata-video-id="(\d+)"[^>]*>/i);
  for (let i = 1; i < blocks.length && cards.length < 50; i += 2) {
    const rumbleId = Number(blocks[i]);
    const card = blocks[i + 1];
    const link = card.match(/<a\b[^>]*\bclass="videostream__link link"[^>]*>/i)?.[0];
    const path = attribute(link, "href")?.split("?")[0];
    const id = path?.match(VIDEO_PATH)?.[1];
    const titleTag = card.match(/<h3\b[^>]*\bclass="thumbnail__title[^"]*"[^>]*>/i)?.[0];
    const image = card.match(/<img\b[^>]*\bclass="thumbnail__image[^"]*"[^>]*>/i)?.[0];
    const title = decode(attribute(titleTag, "title") ?? attribute(image, "alt")).trim();
    if (!id || !title || seen.has(id) || !Number.isSafeInteger(rumbleId)) continue;
    seen.add(id);
    const author = card.match(/<a\b[^>]*\brel="author"[^>]*>/i)?.[0];
    const channelPath = attribute(author, "href")?.split("?")[0];
    const channelNameTag = card.match(/<span\b[^>]*\bclass="channel__name[^"]*"[^>]*>/i)?.[0];
    cards.push({
      id,
      rumble_id: rumbleId,
      url: ORIGIN + path,
      title,
      thumbnail: decode(attribute(image, "src")),
      published_at: attribute(card.match(/<time\b[^>]*>/i)?.[0], "datetime"),
      duration: card.match(/videostream__status--duration"[^>]*>\s*([\d:]+)/i)?.[1],
      live: /videostream__status--live"/i.test(card),
      channel: { name: decode(attribute(channelNameTag, "title")),
        url: CHANNEL_PATH.test(channelPath ?? "") ? ORIGIN + channelPath : null },
    });
  }
  return cards;
}

async function publicPage(url, accept) {
  try {
    const response = await fetch(url, {
      headers: { accept },
      redirect: "error",
      signal: AbortSignal.timeout(4000),
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

export async function fetchPublicRumbleFeed(input, editorPicks = false) {
  if (input.mode === "live" && !editorPicks) return null;
  const url = new URL(editorPicks ? "/editor-picks" : "/search/video", ORIGIN);
  if (!editorPicks && input.mode === "search") url.searchParams.set("q", input.query);
  if (!editorPicks && input.mode === "channel") url.pathname = new URL(input.query).pathname;
  if (input.page > 1) url.searchParams.set("page", String(input.page));
  const html = await publicPage(url, "text/html");
  const videos = html ? publicRumbleCards(html) : [];
  return videos.length ? { videos } : null;
}

export async function fetchPublicRumbleVideo(url, rumbleId) {
  if (!Number.isSafeInteger(rumbleId) || rumbleId <= 0) return null;
  const embed = new URL("/embedJS/u3/", ORIGIN);
  embed.search = new URLSearchParams({ request: "video", ver: "2", v: "v" + rumbleId.toString(36) });
  const body = await publicPage(embed, "application/json");
  if (!body) return null;
  try {
    const data = JSON.parse(body);
    const id = new URL(url).pathname.match(/^\/(v[a-z0-9]+)/i)?.[1]?.toLowerCase();
    // A public watch ID and the embed ID can refer to different videos.
    const sharedId = new URL(data.share_url, ORIGIN).pathname.match(/^\/share\/(v[a-z0-9]+)$/i)?.[1];
    if (!id || data.vid !== rumbleId || sharedId?.toLowerCase() !== id) return null;
    const files = ["hls", "mp4"].flatMap((type) =>
      Object.entries(data.ua?.[type] ?? {}).map(([quality, source]) =>
        ({ type, url: source?.url, quality_text: quality })));
    return {
      id,
      url,
      rumble_id: rumbleId,
      title: data.title,
      thumbnail: data.i,
      duration_s: data.duration,
      published_at: data.pubDate,
      live: data.live === 2,
      channel: data.author,
      files,
    };
  } catch {
    return null;
  }
}
