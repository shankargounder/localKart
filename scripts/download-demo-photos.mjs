import { Buffer } from "node:buffer";
import { setTimeout } from "node:timers";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import sharp from "sharp";
import { createHash } from "node:crypto";
const candidates = JSON.parse(
  readFileSync(".local/photo-candidates.json", "utf8"),
);
const selections = {
  tomato: 0,
  potato: 0,
  onion: 0,
  carrot: 0,
  banana: 1,
  apple: 0,
  rice: 0,
  sugar: 1,
  salt: 1,
  bread: 3,
  notebook: 1,
  pen: 1,
  cable: 1,
  mouse: 6,
  hammer: 0,
  screwdriver: 3,
  bulb: 2,
  dishwashing: 4,
  broom: 3,
  shoepolish: 0,
  sandals: 2,
  canvas: 1,
  slippers: 0,
  laces: 0,
  insoles: 3,
};
const plain = (value) =>
  String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .trim();
const tomato = JSON.parse(readFileSync(".local/tomato-photo.json", "utf8"));
const info = tomato.imageinfo[0];
const m = info.extmetadata;
candidates.tomato = [
  {
    title: tomato.title,
    thumbnail: info.thumburl,
    sourceUrl: info.descriptionurl,
    license: plain(m.LicenseShortName.value),
    licenseUrl: plain(m.LicenseUrl.value),
    author: plain(m.Artist.value),
  },
];
mkdirSync("assets/catalog", { recursive: true });
const manifest = [];
for (const [slug, index] of Object.entries(selections)) {
  const photo = candidates[slug][index];
  if (
    !photo ||
    !photo.author ||
    !photo.sourceUrl ||
    !photo.licenseUrl ||
    !/^CC (BY|0)|^Public domain/.test(photo.license)
  )
    throw new Error("Incomplete rights metadata for " + slug);
  const temporary = ".local/" + slug + "-photo.webp";
  let bytes;
  if (existsSync(temporary)) bytes = readFileSync(temporary);
  else {
    const response = await fetch(photo.thumbnail, {
      headers: {
        "User-Agent": "LocalKartDemo/0.2 (attributed Commons catalogue)",
      },
    });
    if (!response.ok)
      throw new Error("Photo download failed " + slug + " " + response.status);
    const input = Buffer.from(await response.arrayBuffer());
    bytes = await sharp(input, { limitInputPixels: 20000000 })
      .rotate()
      .resize({
        width: 800,
        height: 800,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
    writeFileSync(temporary, bytes);
  }
  const hash = createHash("sha256").update(bytes).digest("hex");
  const file = slug + "-" + hash.slice(0, 12) + ".webp";
  writeFileSync("assets/catalog/" + file, bytes);
  const metadata = await sharp(bytes).metadata();
  manifest.push({
    slug,
    file,
    url: "/media/catalog/" + file,
    alt: `Generic demonstration photograph of ${slug}; not a verified branded product image`,
    title: photo.title,
    sourceUrl: photo.sourceUrl,
    license: photo.license,
    licenseUrl: photo.licenseUrl,
    credit: photo.author,
    width: metadata.width,
    height: metadata.height,
    sha256: hash,
    changes: "Resized and converted to WebP; original image license retained.",
  });
  console.log(slug + " saved, " + bytes.length + " bytes");
  await new Promise((r) => setTimeout(r, 750));
}
writeFileSync(
  "assets/catalog/manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
writeFileSync(
  "assets/catalog/ATTRIBUTION.md",
  "# Demo photo attribution\n\nThese photographs illustrate synthetic demonstration products; they do not verify a merchant, brand or SKU. Each asset is distributed under its listed original license. Resized and converted to WebP.\n\n" +
    manifest
      .map(
        (p) =>
          `- **${p.slug}** — [${p.title}](${p.sourceUrl}), ${p.credit}. [${p.license}](${p.licenseUrl}). Local file: ${p.file}.`,
      )
      .join("\n") +
    "\n",
);
const tiles = await Promise.all(
  manifest.map(async (p, index) => ({
    input: await sharp("assets/catalog/" + p.file)
      .resize(220, 150, { fit: "contain", background: "white" })
      .extend({ bottom: 25, background: "white" })
      .composite([
        {
          input: Buffer.from(
            `<svg width="220" height="25"><text x="8" y="19" font-size="16">${p.slug}</text></svg>`,
          ),
          top: 150,
          left: 0,
        },
      ])
      .png()
      .toBuffer(),
    left: (index % 4) * 220,
    top: Math.floor(index / 4) * 175,
  })),
);
await sharp({
  create: {
    width: 880,
    height: Math.ceil(manifest.length / 4) * 175,
    channels: 3,
    background: "white",
  },
})
  .composite(tiles)
  .png()
  .toFile(".local/photo-contact-sheet.png");
