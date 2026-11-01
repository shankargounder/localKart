import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const db = new PrismaClient();
async function main() {
  if (
    process.env.NODE_ENV === "production" ||
    !/(localhost|127\.0\.0\.1)/.test(process.env.DATABASE_URL || "")
  )
    throw new Error("Demo seed is restricted to local databases");
  const credentialsFile = new URL(
    "../../.local/demo-credentials.txt",
    import.meta.url,
  );
  const previous = existsSync(credentialsFile)
    ? readFileSync(credentialsFile, "utf8").match(/Password: (.+)/)?.[1]
    : undefined;
  const password =
    process.env.DEMO_PASSWORD ||
    previous ||
    randomBytes(14).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 12);
  const categories = [
    "Grocery",
    "Bakery",
    "Fruits & vegetables",
    "Stationery",
    "Electronics",
    "Mobile accessories",
    "Clothing",
    "Footwear",
    "Hardware",
    "Electrical supplies",
    "Gifts",
    "Household essentials",
  ];
  const catalogue: Record<string, [string, number][]> = {
    Grocery: [
      ["Sona Masoori rice · 1 kg", 6500],
      ["Toor dal · 500 g", 8500],
      ["Sunflower oil · 1 L", 14500],
      ["Aashirvaad atta · 1 kg", 6200],
      ["Turmeric powder · 100 g", 3500],
      ["Cumin seeds · 100 g", 6000],
      ["Iodised salt · 1 kg", 2800],
      ["Sugar · 1 kg", 4800],
      ["Tea leaves · 250 g", 12500],
      ["Poha · 500 g", 4200],
    ],
    Bakery: [
      ["Whole wheat bread", 4500],
      ["Milk bread", 4000],
      ["Butter bun", 2500],
      ["Vegetable puff", 3000],
      ["Coconut cookies · 200 g", 8000],
      ["Fruit cake · 250 g", 18000],
      ["Rusk · 200 g", 5500],
      ["Banana muffin", 5000],
      ["Garlic loaf", 9000],
      ["Chocolate brownie", 7500],
    ],
    "Fruits & vegetables": [
      ["Tomato · 1 kg", 4000],
      ["Potato · 1 kg", 3500],
      ["Onion · 1 kg", 4500],
      ["Banana · 6 pcs", 5000],
      ["Apple · 500 g", 12000],
      ["Carrot · 500 g", 3000],
      ["Spinach bunch", 2000],
      ["Green chilli · 100 g", 1500],
      ["Lemon · 4 pcs", 2500],
      ["Cucumber · 500 g", 3000],
    ],
    Stationery: [
      ["A4 notebook · 160 pages", 6500],
      ["Blue ball pen · 5 pack", 5000],
      ["HB pencils · 10 pack", 6000],
      ["Eraser", 1000],
      ["Sharpener", 1500],
      ["Geometry box", 15000],
      ["A4 copier paper · 100 sheets", 8000],
      ["Sticky notes", 4500],
      ["Glue stick", 3500],
      ["Sketch pens · 12 colours", 10000],
    ],
    Electronics: [
      ["USB desk fan", 49900],
      ["LED desk lamp", 69900],
      ["Wireless mouse", 44900],
      ["USB keyboard", 59900],
      ["HDMI cable · 1 m", 24900],
      ["USB hub · 4 ports", 39900],
      ["Laptop stand", 79900],
      ["Screen cleaning kit", 14900],
      ["Mouse pad", 9900],
      ["Cable organiser", 7900],
    ],
    "Mobile accessories": [
      ["USB-C cable", 19900],
      ["Phone stand", 14900],
      ["Tempered glass", 12900],
      ["Phone pouch", 9900],
      ["USB charger · 20 W", 59900],
      ["Wired earphones", 29900],
      ["Cable protector", 4900],
      ["Micro USB cable", 9900],
      ["Car phone mount", 39900],
      ["SIM ejector kit", 3900],
    ],
    Clothing: [
      ["Cotton T-shirt · M", 39900],
      ["Cotton T-shirt · L", 39900],
      ["Handkerchief · 3 pack", 9900],
      ["Cotton socks · pair", 7900],
      ["Cotton kurta · M", 79900],
      ["Leggings · M", 34900],
      ["Cotton scarf", 19900],
      ["Kids T-shirt · age 6", 24900],
      ["Track pants · L", 59900],
      ["Cotton cap", 14900],
    ],
    Footwear: [
      ["Everyday sandals · size 8", 49900],
      ["Canvas shoes · size 8", 89900],
      ["Home slippers · size 7", 19900],
      ["Kids sandals · size 2", 34900],
      ["Shoe laces", 4900],
      ["Shoe brush", 7900],
      ["Insoles · pair", 14900],
      ["Shoe polish", 6900],
      ["Sports socks", 9900],
      ["Rain sandals · size 9", 39900],
    ],
    Hardware: [
      ["Screwdriver set", 29900],
      ["Claw hammer", 34900],
      ["Measuring tape · 3 m", 14900],
      ["Steel nails · 100 g", 3900],
      ["Wall plugs · 20 pcs", 4900],
      ["Adjustable wrench", 39900],
      ["Padlock", 24900],
      ["Door stopper", 7900],
      ["Work gloves", 9900],
      ["Utility knife", 8900],
    ],
    "Electrical supplies": [
      ["LED bulb · 9 W", 9900],
      ["Extension board", 39900],
      ["Insulation tape", 2900],
      ["Cable ties · 50 pcs", 7900],
      ["Plug top · 6 A", 4900],
      ["Night lamp", 14900],
      ["Switch · 6 A", 5900],
      ["Bulb holder", 3900],
      ["Tester screwdriver", 6900],
      ["LED tube light", 29900],
    ],
    Gifts: [
      ["Greeting card", 7900],
      ["Gift wrap roll", 4900],
      ["Photo frame", 24900],
      ["Ceramic mug", 19900],
      ["Gift bag", 3900],
      ["Ribbon spool", 5900],
      ["Desk calendar", 14900],
      ["Keyring", 6900],
      ["Decorative notebook", 17900],
      ["Bookmarks · 5 pack", 4900],
    ],
    "Household essentials": [
      ["Dishwashing liquid · 500 ml", 9900],
      ["Laundry powder · 1 kg", 14900],
      ["Floor cleaner · 1 L", 15900],
      ["Cotton cleaning cloth · 3 pack", 7900],
      ["Steel scrubber · 3 pack", 3900],
      ["Garbage bags · 30 pcs", 9900],
      ["Storage container · 1 L", 12900],
      ["Clothes pegs · 12 pack", 5900],
      ["Kitchen towel", 8900],
      ["Broom", 14900],
    ],
  };
  const cats = [];
  for (const name of categories)
    cats.push(
      await db.category.upsert({
        where: { name },
        create: { name },
        update: {},
      }),
    );
  for (const [email, name, role] of [
    ["admin@demo.localkart.test", "Demo Administrator", "ADMIN"],
    ["customer@demo.localkart.test", "Demo Customer", "CUSTOMER"],
  ])
    await db.user.upsert({
      where: { email },
      create: { email, name, role, passwordHash },
      update: {},
    });
  for (let i = 0; i < 20; i++) {
    const email = `merchant${i + 1}@demo.localkart.test`;
    const owner = await db.user.upsert({
      where: { email },
      create: {
        email,
        name: `Demo Owner ${i + 1}`,
        passwordHash,
        role: "MERCHANT",
      },
      update: {},
    });
    const existing = await db.shop.findFirst({ where: { ownerId: owner.id } });
    const category = cats[i % cats.length];
    const shop =
      existing ||
      (await db.shop.create({
        data: {
          ownerId: owner.id,
          name: `Demo ${["Madhapur", "Kondapur", "HITEC", "Jubilee", "Gachibowli"][i % 5]} ${category.name} ${i + 1}`,
          description:
            "Synthetic LocalKart demonstration shop. Not an operating business.",
          categoryId: category.id,
          address: `Demo Lane ${i + 1}, Hyderabad (synthetic address)`,
          latitude: 17.4483 + ((i % 5) - 2) * 0.005,
          longitude: 78.3915 + (Math.floor(i / 5) - 1) * 0.006,
          approval: i === 14 ? "PENDING" : "APPROVED",
          deliveryEnabled: true,
          codEnabled: true,
          hours: {
            create: Array.from({ length: 7 }, (_, day) => ({
              day,
              opens: "09:00",
              closes: "21:00",
            })),
          },
        },
      }));
    for (let j = 0; j < 15; j++) {
      const entry = catalogue[category.name][j % 10];
      const name = entry[0] + (j >= 10 ? " · Value pack" : "");
      const pricePaise = entry[1] * (j >= 10 ? 2 : 1);
      if (await db.product.findFirst({ where: { shopId: shop.id, name } }))
        continue;
      const p = await db.product.create({
        data: {
          shopId: shop.id,
          categoryId: category.id,
          name,
          description: `Sample catalogue item: ${name}. Demonstration data only.`,
          brand: "Demo local brand",
          keywords: category.name,
          unit: "PIECE",
          variants: {
            create: {
              label: "Standard",
              pricePaise,
              inventory: { create: { onHand: 20000, lowStock: 3000 } },
            },
          },
        },
        include: { variants: true },
      });
      await db.inventoryMovement.create({
        data: {
          variantId: p.variants[0].id,
          onHandDelta: 20000,
          reservedDelta: 0,
          reason: "DEMO_INITIAL_STOCK",
          actorId: owner.id,
        },
      });
    }
  }
  const customer = await db.user.findUniqueOrThrow({
    where: { email: "customer@demo.localkart.test" },
  });
  const firstShop = await db.shop.findFirstOrThrow({
    where: { owner: { email: "merchant1@demo.localkart.test" } },
    include: { products: { include: { variants: true } } },
  });
  if (
    !(await db.order.findUnique({
      where: {
        customerId_idempotencyKey: {
          customerId: customer.id,
          idempotencyKey: "demo-completed-order",
        },
      },
    }))
  ) {
    const p = firstShop.products[0];
    const v = p.variants[0];
    await db.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          customerId: customer.id,
          shopId: firstShop.id,
          idempotencyKey: "demo-completed-order",
          requestHash: "synthetic-seed",
          status: "COMPLETED",
          totalPaise: v.pricePaise,
          merchandisePaise: v.pricePaise,
          merchantPayablePaise: v.pricePaise,
          completedAt: new Date(),
          expiresAt: new Date(),
          items: {
            create: {
              variantId: v.id,
              name: p.name,
              description: p.description,
              unit: p.unit,
              quantity: 1000,
              pricePaise: v.pricePaise,
              totalPaise: v.pricePaise,
            },
          },
          history: {
            create: [
              "PENDING_ACCEPTANCE",
              "ACCEPTED",
              "PREPARING",
              "READY_FOR_PICKUP",
              "COMPLETED",
            ].map((status) => ({
              status,
              reason: "Synthetic demonstration history",
            })),
          },
          payment: {
            create: {
              method: "PICKUP",
              status: "COLLECTED_AT_PICKUP",
              amountPaise: v.pricePaise,
            },
          },
        },
      });
      await tx.inventory.update({
        where: { variantId: v.id },
        data: { onHand: { decrement: 1000 } },
      });
      await tx.inventoryMovement.create({
        data: {
          variantId: v.id,
          orderId: order.id,
          onHandDelta: -1000,
          reservedDelta: 0,
          reason: "DEMO_SALE",
          actorId: firstShop.ownerId,
        },
      });
    });
  }
  const deliveryShop = await db.shop.findFirstOrThrow({
    where: { owner: { email: "merchant16@demo.localkart.test" } },
    include: { products: { include: { variants: true } } },
  });
  if (
    !(await db.order.findUnique({
      where: {
        customerId_idempotencyKey: {
          customerId: customer.id,
          idempotencyKey: "demo-v2-delivery",
        },
      },
    }))
  ) {
    const address =
      (await db.address.findFirst({
        where: { userId: customer.id, label: "Demo delivery" },
      })) ||
      (await db.address.create({
        data: {
          userId: customer.id,
          label: "Demo delivery",
          recipient: "Synthetic Customer",
          phone: "9999999999",
          line1: "Synthetic Demo Apartment 1",
          locality: "Hyderabad",
          postalCode: "500081",
          latitude: deliveryShop.latitude + 0.001,
          longitude: deliveryShop.longitude,
        },
      }));
    const {
      id: _id,
      userId: _user,
      createdAt: _created,
      archived: _archived,
      ...snapshot
    } = address;
    const quote = await db.deliveryQuote.create({
      data: {
        customerId: customer.id,
        shopId: deliveryShop.id,
        addressId: address.id,
        addressSnapshot: snapshot,
        provider: "MOCK",
        feePaise: 3500,
        distanceKm: 0.12,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    const { createOrder, transitionOrder } =
      await import("../../services/api/src/orders.js");
    const order = await createOrder(customer.id, "demo-v2-delivery", {
      shopId: deliveryShop.id,
      fulfillmentType: "DELIVERY",
      paymentMethod: "COD",
      quoteId: quote.id,
      items: [
        { variantId: deliveryShop.products[0].variants[0].id, quantity: 1000 },
      ],
    });
    for (const state of ["ACCEPTED", "PREPARING", "AWAITING_RIDER"] as const)
      await transitionOrder(
        order.id,
        { id: deliveryShop.ownerId, role: "MERCHANT" },
        state,
      );
  }
  const directory = fileURLToPath(new URL("../../.local/", import.meta.url));
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    new URL("../../.local/demo-credentials.txt", import.meta.url),
    `LOCAL DEMONSTRATION ONLY\nPassword: ${password}\nCustomer: customer@demo.localkart.test\nMerchant: merchant1@demo.localkart.test\nAdmin: admin@demo.localkart.test\n`,
  );
  console.log(
    "Local demo database seeded: 20 shops, 300 products, synthetic pickup history and a simulated delivery order. Existing accounts and stock were preserved.",
  );
  console.log("Local-only credentials saved in .local/demo-credentials.txt");
}
main().finally(() => db.$disconnect());
