import { setTimeout } from "node:timers";
import { URLSearchParams } from "node:url";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
const subjects = {
  tomato: "tomato fruit isolated",
  potato: "potato tubers",
  onion: "onion bulbs",
  carrot: "carrot roots",
  banana: "banana fruit",
  apple: "apple fruit",
  rice: "uncooked rice grains",
  sugar: "white sugar crystals",
  salt: "table salt",
  bread: "bread loaf",
  notebook: "notebook stationery",
  pen: "ballpoint pen",
  cable: "USB cable",
  mouse: "computer mouse",
  hammer: "claw hammer",
  screwdriver: "screwdriver tool",
  bulb: "LED light bulb",
  dishwashing: "dishwashing liquid bottle",
  broom: "broom household",
  shoepolish: "shoe polish -horse -Reutter",
  sandals: "sandals footwear",
  canvas: "canvas shoes",
  slippers: "slippers footwear",
  laces: "shoelaces",
  shoebrush: "shoe brush",
  insoles: "shoe insoles",
  socks: "socks clothing",
};
const strip = (value) =>
  String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, "")
    .trim();
subjects.bread = "intitle:bread loaf -school -campus -mountain";
const entries = Object.entries(subjects);
mkdirSync(".local", { recursive: true });
const results = existsSync(".local/photo-candidates.json")
  ? JSON.parse(readFileSync(".local/photo-candidates.json", "utf8"))
  : {};
for (let offset = 0; offset < entries.length; offset += 2) {
  await Promise.all(
    entries.slice(offset, offset + 2).map(async ([slug, query]) => {
      if (results[slug]?.length) return;
      const params = new URLSearchParams({
        action: "query",
        format: "json",
        generator: "search",
        gsrsearch: query + " filetype:bitmap",
        gsrnamespace: "6",
        gsrlimit: "10",
        prop: "imageinfo",
        iiprop: "url|extmetadata|mime|size",
        iiurlwidth: "640",
      });
      let response;
      for (let attempt = 0; attempt < 4; attempt++) {
        response = await fetch(
          "https://commons.wikimedia.org/w/api.php?" + params,
          {
            headers: {
              "User-Agent":
                "LocalKartDemo/0.2 (licensed educational marketplace catalogue assets)",
            },
          },
        );
        if (response.status !== 429) break;
        const delay = Math.max(
          15,
          Number(response.headers.get("retry-after")) || 15,
        );
        console.log("Respecting Commons retry delay: " + delay + "s");
        await new Promise((r) => setTimeout(r, delay * 1000));
      }
      if (!response.ok)
        throw new Error("Commons lookup failed " + response.status);
      const data = await response.json();
      results[slug] = Object.values(data.query?.pages || {})
        .sort((a, b) => a.index - b.index)
        .map((p) => {
          const info = p.imageinfo?.[0];
          const meta = info?.extmetadata || {};
          return {
            title: p.title,
            url: info?.url,
            thumbnail: info?.thumburl,
            sourceUrl: info?.descriptionurl,
            mime: info?.mime,
            width: info?.width,
            height: info?.height,
            license: strip(meta.LicenseShortName?.value),
            licenseUrl: strip(meta.LicenseUrl?.value),
            author: strip(meta.Artist?.value),
            description: strip(meta.ImageDescription?.value).slice(0, 300),
          };
        })
        .filter(
          (p) =>
            p.mime === "image/jpeg" &&
            /^(CC BY|CC0|Public domain)/i.test(p.license) &&
            p.width >= 300 &&
            p.height >= 200,
        );
      console.log(
        slug +
          ": " +
          results[slug]
            .slice(0, 3)
            .map((p) => p.title + " [" + p.license + "]")
            .join(" | "),
      );
      writeFileSync(
        ".local/photo-candidates.json",
        JSON.stringify(results, null, 2),
      );
    }),
  );
  await new Promise((r) => setTimeout(r, 1500));
}
mkdirSync(".local", { recursive: true });
writeFileSync(".local/photo-candidates.json", JSON.stringify(results, null, 2));
