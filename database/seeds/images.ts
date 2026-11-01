import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const db = new PrismaClient();
const patterns: [RegExp, string][] = [
  [/^Tomato\b/i, "tomato"],
  [/^Potato\b/i, "potato"],
  [/^Onion\b/i, "onion"],
  [/^Carrot\b/i, "carrot"],
  [/^Banana\b/i, "banana"],
  [/^Apple\b/i, "apple"],
  [/rice/i, "rice"],
  [/^Sugar\b/i, "sugar"],
  [/salt/i, "salt"],
  [/bread|garlic loaf/i, "bread"],
  [/notebook/i, "notebook"],
  [/ball pen|ballpoint/i, "pen"],
  [/USB.C cable|Micro USB cable/i, "cable"],
  [/Wireless mouse/i, "mouse"],
  [/Claw hammer/i, "hammer"],
  [/Screwdriver set/i, "screwdriver"],
  [/LED bulb/i, "bulb"],
  [/dishwashing liquid/i, "dishwashing"],
  [/^Broom\b/i, "broom"],
  [/shoe polish/i, "shoepolish"],
  [/^(Everyday|Rain) sandals/i, "sandals"],
  [/canvas shoes/i, "canvas"],
  [/slippers/i, "slippers"],
  [/shoe laces/i, "laces"],
  [/shoe brush/i, "shoebrush"],
  [/insoles/i, "insoles"],
  [/sports socks/i, "socks"],
];
export async function seedDemoImages(client = db) {
  if (
    process.env.NODE_ENV === "production" ||
    !/(localhost|127\.0\.0\.1)/.test(process.env.DATABASE_URL || "")
  )
    throw new Error("Demo image seed is local only");
  const manifest = JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL("../../assets/catalog/manifest.json", import.meta.url),
      ),
      "utf8",
    ),
  );
  const products = await client.product.findMany({
    where: { shop: { owner: { email: { endsWith: "@demo.localkart.test" } } } },
    include: { images: true },
  });
  let added = 0;
  for (const product of products) {
    if (product.images.length) continue;
    const slug = patterns.find(([pattern]) => pattern.test(product.name))?.[1];
    const photo = manifest.find((p: any) => p.slug === slug);
    if (!photo) continue;
    await client.$transaction(
      async (tx) => {
        if (await tx.productImage.count({ where: { productId: product.id } }))
          return;
        await tx.productImage.create({
          data: {
            productId: product.id,
            url: photo.url,
            alt: photo.alt,
            source: "WIKIMEDIA_COMMONS",
            sourceUrl: photo.sourceUrl,
            license: photo.license + " — " + photo.licenseUrl,
            credit: photo.credit,
            width: photo.width,
            height: photo.height,
            isDemo: true,
            contentHash: photo.sha256,
          },
        });
        added++;
      },
      { isolationLevel: "Serializable" },
    );
  }
  console.log(
    "Added licensed demo photos to " +
      added +
      " products; existing images were not overwritten.",
  );
  return added;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  seedDemoImages().finally(() => db.$disconnect());
