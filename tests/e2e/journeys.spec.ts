import { test, expect, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
const credentials = readFileSync(".local/demo-credentials.txt", "utf8");
const password = credentials.match(/Password: (.+)/)![1];
mkdirSync(".local/screenshots", { recursive: true });

async function trackingMerchantFixture(
  productName = "Synthetic tracking item",
) {
  process.loadEnvFile(".env");
  if (
    !["localhost", "127.0.0.1"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    )
  )
    throw new Error("UI fixtures require a local database");
  const { PrismaClient } = await import("@prisma/client");
  const { default: bcrypt } = await import("bcryptjs");
  const db = new PrismaClient();
  const tag = randomBytes(6).toString("hex");
  const email = `ui-merchant-${tag}@example.test`;
  const pass = "SyntheticMerchantPassword123!";
  try {
    const owner = await db.user.create({
      data: {
        name: "UI tracking merchant",
        email,
        passwordHash: await bcrypt.hash(pass, 10),
        role: "MERCHANT",
      },
    });
    const category = await db.category.findFirstOrThrow();
    const shop = await db.shop.create({
      data: {
        ownerId: owner.id,
        categoryId: category.id,
        name: "Synthetic tracking shop " + tag,
        address: "Synthetic test address",
        latitude: 17.44,
        longitude: 78.39,
        approval: "APPROVED",
        open: true,
        acceptingOrders: true,
      },
    });
    const image = await db.productImage.findFirst({ where: { isDemo: true } });
    await db.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        name: productName,
        description: "UI test fixture",
        unit: "PIECE",
        variants: {
          create: {
            label: "One",
            pricePaise: 1000,
            inventory: { create: { onHand: 20000 } },
          },
        },
        ...(image
          ? {
              images: {
                create: {
                  url: image.url,
                  alt: image.alt,
                  isDemo: true,
                  source: image.source,
                  sourceUrl: image.sourceUrl,
                  license: image.license,
                  credit: image.credit,
                },
              },
            }
          : {}),
      },
    });
    for (let i = 2; i <= 3; i++)
      await db.product.create({
        data: {
          shopId: shop.id,
          categoryId: category.id,
          name: "Synthetic tracking item " + i,
          description: "Test catalog product",
          unit: "PIECE",
          variants: {
            create: {
              label: "One",
              pricePaise: 1500,
              inventory: { create: { onHand: 20000 } },
            },
          },
        },
      });
    return { email, pass, shopId: shop.id };
  } finally {
    await db.$disconnect();
  }
}

async function mobileLogin(
  page: Page,
  url: string,
  email: string,
  pass = password,
) {
  await page.goto(url);
  await page.getByPlaceholder("Email address", { exact: true }).fill(email);
  await page.getByPlaceholder("Password (10+ characters)").fill(pass);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("tab").first()).toBeVisible();
}

test("admin sees real fee analytics and pilot delivery records", async ({
  page,
}) => {
  await page.goto("http://localhost:5173");
  await page.getByLabel("Email address").fill("admin@demo.localkart.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Completed merchandise GMV", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Net platform fee revenue", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/screenshots/admin-v2.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: /Delivery dispatch/ }).click();
  await expect(
    page.getByText("Pilot dispatch console", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record verified event" }),
  ).toBeDisabled();
  await expect(page.getByText("MOCK", { exact: true }).first()).toBeVisible();
  await page.getByRole("link", { name: /Notifications/ }).click();
  await expect(
    page.getByText(/Queue and provider receipts are shown below/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Queue test notification", exact: true }),
  ).toBeDisabled();
});
test("customer searches tomatoes, opens a shop and places a persisted pickup order", async ({
  page,
  request,
}) => {
  await trackingMerchantFixture("Tomato UI fixture");
  const tag = randomBytes(6).toString("hex");
  const email = `ui-${tag}@example.test`;
  const pass = "SyntheticUiPassword123!";
  const registration = await request.post(
    "http://localhost:4000/api/v1/auth/register",
    { data: { name: "Synthetic UI Customer", email, password: pass } },
  );
  expect(registration.status()).toBe(201);
  const session = await registration.json();
  await page.setViewportSize({ width: 390, height: 844 });
  await mobileLogin(page, "http://localhost:8081", email, pass);
  await page.getByRole("tab", { name: "Explore", exact: true }).click();
  const response = page.waitForResponse(
    (r) =>
      r.url().includes("/discovery/search?") && r.url().includes("q=tomatoes"),
  );
  await page.getByPlaceholder("Search shops or products").fill("tomatoes");
  const result = await (await response).json();
  expect(result.total).toBeGreaterThan(0);
  expect(result.results[0].name.toLowerCase()).toContain("tomato");
  await expect(
    page.getByText(result.results[0].name, { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(/matching variants within/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open shop & compare variants" }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open shop & compare variants" })
    .first()
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/screenshots/customer-v2.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Open shop & compare variants" })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Add to cart", exact: true })
    .first()
    .click();
  await page.getByRole("tab", { name: /Cart/ }).click();
  await expect(
    page.getByText("Your shop baskets", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await expect(
    page.getByText("Order placed successfully!", { exact: true }).first(),
  ).toBeVisible();
  const orders = await request.get("http://localhost:4000/api/v1/orders", {
    headers: { Authorization: "Bearer " + session.accessToken },
  });
  const rows = await orders.json();
  expect(rows).toHaveLength(1);
  expect(rows[0].fulfillmentType).toBe("PICKUP");
  await request.post(
    `http://localhost:4000/api/v1/orders/${rows[0].id}/cancel`,
    { headers: { Authorization: "Bearer " + session.accessToken } },
  );
  await page.getByRole("tab", { name: "Explore", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Nearby shops map; OpenStreetMap" }),
  ).toBeVisible();
  await expect(page.locator(".leaflet-interactive").first()).toBeAttached();
});
test("merchant sees gross online/offline reports and stock billing controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mobileLogin(
    page,
    "http://localhost:8082",
    "merchant1@demo.localkart.test",
  );
  await expect(
    page.getByText("Your business, clearly", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/screenshots/merchant-v2.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Inventory", exact: true }).click();
  await page.getByRole("button", { name: /Record an in-store sale/ }).click();
  await expect(
    page.getByRole("button", { name: "Complete offline sale", exact: true }),
  ).toBeVisible();
});

test("customer and merchant track one real order with preparation modal and no browser push permission", async ({
  page,
  context,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await trackingMerchantFixture();
  const api = "http://localhost:4000/api/v1";
  const tag = randomBytes(6).toString("hex");
  const email = `tracking-${tag}@example.test`;
  const pass = "SyntheticTrackingPassword123!";
  const registration = await request.post(api + "/auth/register", {
    data: { name: "Tracking test customer", email, password: pass },
  });
  expect(registration.status()).toBe(201);
  const customer = await registration.json();
  const login = await request.post(api + "/auth/login", {
    data: { email: fixture.email, password: fixture.pass },
  });
  expect(login.status()).toBe(200);
  const merchant = await login.json();
  const mh = { Authorization: "Bearer " + merchant.accessToken };
  const ch = { Authorization: "Bearer " + customer.accessToken };
  const shops = await (
    await request.get(api + "/merchant/shops", { headers: mh })
  ).json();
  const shop = shops[0];
  const products = await (
    await request.get(api + "/merchant/products?shopId=" + shop.id, {
      headers: mh,
    })
  ).json();
  const product = products.find(
    (p: any) =>
      p.images?.length &&
      p.variants.some(
        (v: any) => v.inventory.onHand - v.inventory.reserved >= 1000,
      ),
  );
  expect(product).toBeTruthy();
  const variant = product.variants.find(
    (v: any) => v.inventory.onHand - v.inventory.reserved >= 1000,
  );
  const merchantPage = await context.newPage();
  await merchantPage.setViewportSize({ width: 390, height: 844 });
  await mobileLogin(
    merchantPage,
    "http://localhost:8082",
    fixture.email,
    fixture.pass,
  );
  await expect(
    merchantPage.getByRole("button", {
      name: "Notifications (0)",
      exact: true,
    }),
  ).toBeVisible();
  const placed = await request.post(api + "/orders", {
    headers: { ...ch, "Idempotency-Key": "ui-track-" + tag },
    data: {
      shopId: shop.id,
      fulfillmentType: "PICKUP",
      paymentMethod: "PICKUP",
      items: [{ variantId: variant.id, quantity: 1000 }],
    },
  });
  expect(placed.status()).toBe(201);
  const order = await placed.json();

  try {
    await mobileLogin(page, "http://localhost:8081", email, pass);
    await page.goto(`http://localhost:8081/?tab=Orders&orderId=${order.id}`);
    await expect(
      page.getByText("Waiting for shop confirmation.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("img").first()).toBeVisible();
    await merchantPage
      .getByRole("button", { name: "Notifications (1)", exact: true })
      .click();
    const merchantDrawer = merchantPage.getByLabel("Notification drawer", {
      exact: true,
    });
    await expect(merchantDrawer.getByText(/New Order Received/)).toBeVisible();
    await merchantDrawer
      .getByRole("link", { name: "🛒 New Order Received!", exact: true })
      .click();
    await expect(merchantDrawer).not.toBeVisible();
    await merchantPage
      .getByRole("button", {
        name: "Accept & set preparation time",
        exact: true,
      })
      .click();
    await expect(
      merchantPage.getByText("Confirm preparation estimate", { exact: true }),
    ).toBeVisible();
    await merchantPage
      .getByRole("button", { name: "20 min", exact: true })
      .click();
    await merchantPage
      .getByRole("button", {
        name: "Confirm acceptance & reserve stock",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("Order accepted. This is an estimated readiness time.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Order accepted", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Please wait for pickup confirmation", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/^(19|20):[0-5][0-9]$/)).toBeVisible();
    await page.screenshot({
      path: ".local/screenshots/customer-live-tracking.png",
      fullPage: true,
    });
    await page.reload();
    await expect(page.getByText(/^(19|20):[0-5][0-9]$/)).toBeVisible();
    await merchantPage
      .getByRole("button", { name: "Start preparing", exact: true })
      .click();
    await merchantPage
      .getByRole("button", { name: "Mark ready for pickup", exact: true })
      .click();
    await expect(
      page.getByText("Your order is ready for pickup.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/^(19|20):[0-5][0-9]$/)).toHaveCount(0);
    await merchantPage.screenshot({
      path: ".local/screenshots/merchant-live-order.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: /Notifications \(/ }).click();
    const customerDrawer = page.getByLabel("Notification drawer", {
      exact: true,
    });
    await expect(
      customerDrawer.getByRole("link", {
        name: "🎉 Your Order Is Ready!",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      customerDrawer.getByText(
        /Your order is ready for pickup\. You can collect it now\./,
      ),
    ).toBeVisible();
    await customerDrawer
      .getByRole("link", { name: "🎉 Your Order Is Ready!", exact: true })
      .click();
    await expect(customerDrawer).not.toBeVisible();
    await expect(
      page.getByText("Ready for pickup", { exact: true }),
    ).toBeVisible();
    const back = page.getByRole("button", {
      name: "Back to orders",
      exact: true,
    });
    expect((await back.boundingBox())!.width).toBe(48);
    await back.click();
    await expect(page.getByText("Your orders", { exact: true })).toBeVisible();
    const latest = await (
      await request.get(api + "/orders/" + order.id, { headers: ch })
    ).json();
    expect(latest.readyAt).toBeTruthy();
    const completed = await request.post(
      api + `/merchant/orders/${order.id}/complete`,
      { headers: mh, data: { code: latest.pickupCode, collected: true } },
    );
    expect(completed.status()).toBe(200);
  } finally {
    await merchantPage.close();
    await request.post(api + `/orders/${order.id}/cancel`, { headers: ch });
  }
});

test("customer header opens a live notification drawer without navigating away", async ({
  page,
  request,
}) => {
  const fixture = await trackingMerchantFixture();
  const api = "http://localhost:4000/api/v1";
  const tag = randomBytes(6).toString("hex");
  const email = `drawer-${tag}@example.test`;
  const pass = "DrawerTestPassword123!";
  const customer = await (
    await request.post(api + "/auth/register", {
      data: { name: "Drawer test customer", email, password: pass },
    })
  ).json();
  const merchant = await (
    await request.post(api + "/auth/login", {
      data: { email: fixture.email, password: fixture.pass },
    })
  ).json();
  const mh = { Authorization: "Bearer " + merchant.accessToken };
  const ch = { Authorization: "Bearer " + customer.accessToken };
  const shops = await (
    await request.get(api + "/merchant/shops", { headers: mh })
  ).json();
  const products = await (
    await request.get(api + "/merchant/products?shopId=" + shops[0].id, {
      headers: mh,
    })
  ).json();
  const variant = products
    .flatMap((p: any) => p.variants)
    .find((v: any) => v.inventory.onHand - v.inventory.reserved >= 1000);
  const placed = await request.post(api + "/orders", {
    headers: { ...ch, "Idempotency-Key": "drawer-" + tag },
    data: {
      shopId: shops[0].id,
      fulfillmentType: "PICKUP",
      paymentMethod: "PICKUP",
      items: [{ variantId: variant.id, quantity: 1000 }],
    },
  });
  expect(placed.status()).toBe(201);
  const order = await placed.json();
  try {
    await mobileLogin(page, "http://127.0.0.1:8081", email, pass);
    const button = page.getByRole("button", {
      name: "Notifications (0)",
      exact: true,
    });
    await expect(button).toBeVisible();
    expect((await button.boundingBox())!.y).toBeLessThan(100);
    const original = page.url();
    await button.click();
    const drawer = page.getByLabel("Notification drawer", { exact: true });
    await expect(drawer).toBeVisible();
    expect(page.url()).toBe(original);
    await expect(
      drawer.getByText("You have no notifications yet.", { exact: true }),
    ).toBeVisible();
    expect((await drawer.boundingBox())!.x).toBeGreaterThan(700);
    const accepted = await request.post(
      api + `/merchant/orders/${order.id}/accept`,
      { headers: mh, data: { preparationDurationMinutes: 20 } },
    );
    expect(accepted.status()).toBe(200);
    await expect(drawer.getByText(/Your Order Is Confirmed/)).toBeVisible();
    await expect(drawer.getByText(/1 unread/).first()).toBeVisible();
    await page.screenshot({
      path: ".local/screenshots/customer-notification-drawer-desktop.png",
      fullPage: true,
    });
    const dialogs: string[] = [];
    page.on("dialog", async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });
    await page.route("**/notifications/read-all", (route) => route.abort());
    await drawer
      .getByRole("button", { name: "Mark all as read", exact: true })
      .click();
    await expect(drawer.getByRole("alert")).toContainText(
      "Could not mark notifications as read",
    );
    await expect(drawer.getByText(/1 unread/).first()).toBeVisible();
    expect(dialogs).toEqual([]);
    await page.unroute("**/notifications/read-all");
    await drawer
      .getByRole("button", { name: "Mark all as read", exact: true })
      .click();
    await expect(drawer.getByRole("alert")).toHaveCount(0);
    expect(dialogs).toEqual([]);
    await expect(
      drawer.getByRole("button", { name: "Open order", exact: true }),
    ).toHaveCount(0);
    await expect(drawer.getByText(/0 unread/).first()).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(async () => Math.round((await drawer.boundingBox())!.x))
      .toBe(24);
    await page.screenshot({
      path: ".local/screenshots/customer-notification-drawer-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Close notifications", exact: true })
      .click();
    await expect(drawer).not.toBeVisible();
    expect(page.url()).toBe(original);
    await page
      .getByRole("button", { name: "Notifications (0)", exact: true })
      .click();
    await page
      .getByLabel("Notification drawer", { exact: true })
      .getByRole("link", { name: /Your Order Is Confirmed/ })
      .click();
    await expect(
      page.getByLabel("Notification drawer", { exact: true }),
    ).not.toBeVisible();
    await expect(
      page.getByText("Order accepted", { exact: true }),
    ).toBeVisible();
  } finally {
    await request.post(api + `/orders/${order.id}/cancel`, { headers: ch });
  }
});

test("home lists shops within 2 km and opens a two-column shop catalog", async ({
  page,
  request,
}) => {
  const fixture = await trackingMerchantFixture();
  const tag = randomBytes(6).toString("hex");
  const email = `shop-home-${tag}@example.test`;
  const pass = "ShopHomeTestPassword123!";
  const registration = await request.post(
    "http://localhost:4000/api/v1/auth/register",
    { data: { name: "Shop home test", email, password: pass } },
  );
  expect(registration.status()).toBe(201);
  await page.setViewportSize({ width: 390, height: 844 });
  const nearbyResponse = page.waitForResponse(
    (r) => r.url().includes("/shops/nearby?") && r.url().includes("radius=2"),
  );
  await mobileLogin(page, "http://localhost:8081", email, pass);
  const nearby = await (await nearbyResponse).json();
  expect(nearby.every((s: any) => s.distanceKm <= 2)).toBe(true);
  await expect(
    page.getByText("Shops within 2 km", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Find it around the corner", { exact: true }),
  ).toHaveCount(0);
  const fixtureShop = nearby.find((s: any) => s.id === fixture.shopId);
  expect(fixtureShop).toBeTruthy();
  await page.getByPlaceholder("Search nearby shops").fill(fixtureShop.name);
  await page
    .getByRole("button", {
      name: "Browse shop " + fixtureShop.name,
      exact: true,
    })
    .click();
  await expect(page.getByText(fixtureShop.name, { exact: true })).toBeVisible();
  const grid = page.getByTestId("shop-product-grid");
  const cards = grid.locator('[data-testid^="shop-product-"]');
  await expect(cards).toHaveCount(3);
  const a = (await cards.nth(0).boundingBox())!,
    b = (await cards.nth(1).boundingBox())!,
    c = (await cards.nth(2).boundingBox())!;
  expect(Math.abs(a.y - b.y)).toBeLessThan(2);
  expect(b.x).toBeGreaterThan(a.x + a.width);
  expect(c.y).toBeGreaterThan(a.y);
  const back = page.getByRole("button", {
    name: "Back to all shops",
    exact: true,
  });
  expect((await back.boundingBox())!.width).toBeLessThanOrEqual(48);
  await page
    .getByRole("button", { name: "Save favorite shop", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove favorite shop", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Remove favorite shop", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save favorite shop", exact: true }),
  ).toBeVisible();
  await cards
    .nth(0)
    .getByRole("button", { name: /^Save to wishlist:/ })
    .click();
  await expect(
    cards.nth(0).getByRole("button", { name: /^Remove from wishlist:/ }),
  ).toBeVisible();
  await cards
    .nth(0)
    .getByRole("button", { name: /^Remove from wishlist:/ })
    .click();
  await page
    .getByRole("button", {
      name: "Product photos and image credits",
      exact: true,
    })
    .first()
    .click();
  await expect(
    page.getByText("Photos & credits", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close product photos", exact: true })
    .click();
  await expect(
    page.getByText("Photos & credits", { exact: true }),
  ).not.toBeVisible();
  await back.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/screenshots/customer-shop-two-columns.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Back to all shops", exact: true })
    .click();
  await expect(
    page.getByText("Shops within 2 km", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByPlaceholder("Search nearby shops").fill(fixtureShop.name);
  await page
    .getByRole("button", {
      name: "Browse shop " + fixtureShop.name,
      exact: true,
    })
    .click();
  await expect(cards).toHaveCount(3);
  const wideA = (await cards.nth(0).boundingBox())!,
    wideB = (await cards.nth(1).boundingBox())!;
  expect(Math.abs(wideA.y - wideB.y)).toBeLessThan(2);
});

test("product details selects variants and adds quantity through the compact cart row", async ({
  page,
  request,
}) => {
  const fixture = await trackingMerchantFixture();
  const api = "http://localhost:4000/api/v1";
  const tag = randomBytes(6).toString("hex");
  const email = `details-${tag}@example.test`;
  const pass = "ProductDetailsTest123!";
  const registration = await request.post(api + "/auth/register", {
    data: { name: "Product details test", email, password: pass },
  });
  expect(registration.status()).toBe(201);
  const session = await registration.json();
  const headers = { Authorization: "Bearer " + session.accessToken };
  const shop = await (
    await request.get(api + "/shops/" + fixture.shopId)
  ).json();
  const products = await (
    await request.get(api + "/shops/" + fixture.shopId + "/products")
  ).json();
  const p = products[0];
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  let pack: any;
  try {
    pack = await db.variant.create({
      data: {
        productId: p.id,
        label: "Family pack",
        pricePaise: 2500,
        inventory: { create: { onHand: 20000 } },
      },
    });
  } finally {
    await db.$disconnect();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await mobileLogin(page, "http://localhost:8081", email, pass);
  await page.getByPlaceholder("Search nearby shops").fill(shop.name);
  await page
    .getByRole("button", { name: "Browse shop " + shop.name, exact: true })
    .click();
  const card = page.getByTestId("shop-product-" + p.id);
  const row = card.getByTestId("quantity-cart-" + p.variants[0].id);
  const input = row.getByRole("textbox");
  const add = row.getByRole("button", { name: "Add to cart", exact: true });
  const inputBox = (await input.boundingBox())!,
    addBox = (await add.boundingBox())!;
  expect(Math.abs(inputBox.y - addBox.y)).toBeLessThan(2);
  expect(addBox.width).toBe(48);
  expect(addBox.x).toBeGreaterThan(inputBox.x);
  await input.fill("3");
  await add.click();
  await expect(card.getByText("Added to cart", { exact: true })).toBeVisible();
  const cart = await (await request.get(api + "/cart", { headers })).json();
  expect(cart.find((i: any) => i.variantId === p.variants[0].id).quantity).toBe(
    3000,
  );
  await card
    .getByRole("link", { name: "View product: " + p.name, exact: true })
    .click();
  const details = page.getByTestId("product-details");
  await expect(details.getByText(p.name, { exact: true })).toBeVisible();
  expect(page.url()).toContain("productId=" + p.id);
  await details
    .getByRole("button", { name: "Select variant Family pack", exact: true })
    .click();
  await expect(details.getByText(/₹25\.00/)).toBeVisible();
  const packRow = details.getByTestId("quantity-cart-" + pack.id);
  await packRow.getByRole("textbox").fill("2");
  await packRow
    .getByRole("button", { name: "Add to cart", exact: true })
    .click();
  await expect(
    details.getByText("Added to cart", { exact: true }),
  ).toBeVisible();
  const updated = await (await request.get(api + "/cart", { headers })).json();
  expect(updated.find((i: any) => i.variantId === pack.id).quantity).toBe(2000);
  await page.screenshot({
    path: ".local/screenshots/customer-product-details.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByTestId("product-details").getByText(p.name, { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to shop products", exact: true })
    .click();
  await expect(page.getByTestId("shop-product-grid")).toBeVisible();
  await expect(
    page
      .getByTestId("shop-product-grid")
      .locator('[data-testid^="shop-product-"]'),
  ).toHaveCount(3);
});

test("cart quantity controls and merchant compact actions use the shared navigation", async ({
  page,
  request,
  context,
}) => {
  const fixture = await trackingMerchantFixture();
  const api = "http://localhost:4000/api/v1";
  const tag = randomBytes(6).toString("hex");
  const email = `cart-ui-${tag}@example.test`;
  const pass = "CartUiTestPassword123!";
  const response = await request.post(api + "/auth/register", {
    data: { name: "Cart UI test", email, password: pass },
  });
  const session = await response.json();
  const headers = { Authorization: "Bearer " + session.accessToken };
  const products = await (
    await request.get(api + "/shops/" + fixture.shopId + "/products")
  ).json();
  const p = products.find((p: any) => p.images.length) || products[0];
  const v = p.variants[0];
  await request.post(api + "/cart/items", {
    headers,
    data: { variantId: v.id, quantity: 2000 },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await mobileLogin(page, "http://localhost:8081", email, pass);
  await page.getByRole("tab", { name: "Cart", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Cart", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Order summary", { exact: true })).toBeVisible();
  await page
    .getByRole("button", {
      name: "Increase quantity of " + p.name,
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Quantity 3", { exact: true })).toBeVisible();
  await page
    .getByRole("button", {
      name: "Decrease quantity of " + p.name,
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Quantity 2", { exact: true })).toBeVisible();
  await page.screenshot({
    path: ".local/screenshots/customer-cart-redesign.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Remove " + p.name, exact: true })
    .click();
  await expect(
    page.getByText("Your basket is empty", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Browse nearby shops", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Home", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const merchantPage = await context.newPage();
  try {
    await merchantPage.setViewportSize({ width: 390, height: 844 });
    await mobileLogin(
      merchantPage,
      "http://localhost:8082",
      fixture.email,
      fixture.pass,
    );
    await merchantPage
      .getByRole("tab", { name: "Products", exact: true })
      .click();
    await expect(merchantPage.getByPlaceholder("New product name")).toHaveCount(
      0,
    );
    await merchantPage
      .getByRole("button", { name: "Archive product", exact: true })
      .first()
      .click();
    await expect(
      merchantPage.getByRole("button", {
        name: "Restore product",
        exact: true,
      }),
    ).toBeVisible();
    await merchantPage
      .getByRole("button", { name: "Restore product", exact: true })
      .click();
    await merchantPage
      .getByRole("button", { name: "Edit product & variants", exact: true })
      .first()
      .click();
    await expect(
      merchantPage.getByPlaceholder("Product name", { exact: true }),
    ).toBeVisible();
    await merchantPage
      .getByRole("button", {
        name: "Close Edit product & variants",
        exact: true,
      })
      .click();
    await expect(
      merchantPage.getByPlaceholder("Product name", { exact: true }),
    ).not.toBeVisible();
    await merchantPage.screenshot({
      path: ".local/screenshots/merchant-compact-catalog.png",
      fullPage: true,
    });
    await merchantPage.getByRole("tab", { name: "Shop", exact: true }).click();
    await expect(
      merchantPage.getByRole("switch", { name: "Shop open", exact: true }),
    ).toBeVisible();
    await expect(
      merchantPage.getByRole("switch", { name: "Home delivery", exact: true }),
    ).toBeVisible();
    await merchantPage
      .getByRole("switch", { name: "Home delivery", exact: true })
      .click();
    await expect(
      merchantPage.getByRole("switch", { name: "Home delivery", exact: true }),
    ).toBeChecked();
    await merchantPage
      .getByRole("switch", { name: "Home delivery", exact: true })
      .click();
    await merchantPage.screenshot({
      path: ".local/screenshots/merchant-shop-switches.png",
      fullPage: true,
    });
    await merchantPage
      .getByRole("button", { name: /^Notifications \(/ })
      .click();
    await expect(
      merchantPage.getByLabel("Notification drawer", { exact: true }),
    ).toBeVisible();
  } finally {
    await merchantPage.close();
  }
});

test("merchant dashboard counts open matching details and floating add creates a product", async ({
  page,
  request,
}) => {
  const fixture = await trackingMerchantFixture();
  const api = "http://localhost:4000/api/v1";
  const tag = randomBytes(6).toString("hex");
  const customer = await (
    await request.post(api + "/auth/register", {
      data: {
        name: "Dashboard test customer",
        email: `dash-${tag}@example.test`,
        password: "DashboardCustomer123!",
      },
    })
  ).json();
  const merchant = await (
    await request.post(api + "/auth/login", {
      data: { email: fixture.email, password: fixture.pass },
    })
  ).json();
  const headers = { Authorization: "Bearer " + merchant.accessToken };
  const ch = { Authorization: "Bearer " + customer.accessToken };
  const products = await (
    await request.get(api + "/merchant/products", { headers })
  ).json();
  const v = products[0].variants[0];
  const place = async (key: string) => {
    const r = await request.post(api + "/orders", {
      headers: { ...ch, "Idempotency-Key": key },
      data: {
        shopId: fixture.shopId,
        fulfillmentType: "PICKUP",
        paymentMethod: "PICKUP",
        items: [{ variantId: v.id, quantity: 1000 }],
      },
    });
    expect(r.status()).toBe(201);
    return r.json();
  };
  const today = await place("dash-today-" + tag);
  const old = await place("dash-old-" + tag);
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  try {
    await db.order.update({
      where: { id: old.id },
      data: { createdAt: new Date(Date.now() - 2 * 86400000) },
    });
    await db.inventory.update({
      where: { variantId: v.id },
      data: { onHand: 500, lowStock: 1000 },
    });
  } finally {
    await db.$disconnect();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await mobileLogin(page, "http://localhost:8082", fixture.email, fixture.pass);
  const tiles = page.getByTestId("merchant-dashboard-counts");
  await expect(
    tiles
      .getByRole("button", { name: "View Today's orders", exact: true })
      .getByText("1", { exact: true }),
  ).toBeVisible();
  const first = (await tiles
      .getByTestId("merchant-order-statuses")
      .getByRole("button")
      .nth(0)
      .boundingBox())!,
    second = (await tiles
      .getByTestId("merchant-order-statuses")
      .getByRole("button")
      .nth(1)
      .boundingBox())!;
  expect(Math.abs(first.width - second.width)).toBeLessThan(1);
  expect(Math.abs(first.y - second.y)).toBeLessThan(1);
  await page.screenshot({
    path: ".local/screenshots/merchant-dashboard-tiles.png",
    fullPage: true,
  });
  await tiles
    .getByRole("button", { name: "View New orders", exact: true })
    .click();
  await expect(
    page.getByText("New orders today", { exact: true }),
  ).toBeVisible();
  const newOrders = await (
    await request.get(api + "/orders?dashboard=pending", { headers })
  ).json();
  expect(newOrders.map((o: any) => o.id)).toEqual([today.id]);
  await page
    .getByRole("button", { name: "Back to dashboard", exact: true })
    .click();
  for (const [label, title] of [
    ["Preparing", "Preparing today"],
    ["Ready for pickup", "Ready orders today"],
    ["Cancelled", "Cancelled orders today"],
  ]) {
    await tiles
      .getByRole("button", { name: "View " + label, exact: true })
      .click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await expect(
      page.getByText("No orders yet.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Back to dashboard", exact: true })
      .click();
  }
  await tiles
    .getByRole("button", { name: "View Low stock", exact: true })
    .click();
  await expect(
    page.getByText("Low-stock inventory", { exact: true }),
  ).toBeVisible();
  const low = await (
    await request.get(api + "/merchant/inventory?lowStock=true", { headers })
  ).json();
  expect(low.map((i: any) => i.variantId)).toEqual([v.id]);
  await page
    .getByRole("button", { name: "Back to dashboard", exact: true })
    .click();
  await tiles
    .getByRole("button", { name: "View Today's sales", exact: true })
    .click();
  await expect(
    page.getByText("Today's sales details", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to dashboard", exact: true })
    .click();
  await tiles
    .getByRole("button", { name: "View Products", exact: true })
    .click();
  await expect(
    page.getByText("Active products", { exact: true }),
  ).toBeVisible();
  const fab = page.getByRole("button", { name: "Add product", exact: true });
  const box = (await fab.boundingBox())!;
  expect(box.x + box.width).toBeGreaterThan(360);
  expect(box.y + box.height).toBeLessThan(780);
  await expect(page.getByPlaceholder("New product name")).toHaveCount(0);
  await page.screenshot({
    path: ".local/screenshots/merchant-floating-add-product.png",
    fullPage: true,
  });
  await fab.click();
  await page
    .getByPlaceholder("New product name")
    .fill("Floating product " + tag);
  await page.getByPlaceholder("Price in INR").fill("25");
  await page.getByPlaceholder("Stock (pieces)").fill("5");
  await page
    .getByRole("button", { name: "Create product in first shop", exact: true })
    .click();
  await expect(page.getByPlaceholder("New product name")).not.toBeVisible();
  await expect(
    page.getByText("Floating product " + tag, { exact: true }),
  ).toBeVisible();
  const saved = await (
    await request.get(api + "/merchant/products?active=true", { headers })
  ).json();
  expect(saved).toHaveLength(4);
  await page.getByRole("tab", { name: "Dashboard", exact: true }).click();
  await expect(
    tiles
      .getByRole("button", { name: "View Products", exact: true })
      .getByText("4", { exact: true }),
  ).toBeVisible();
});

test("merchant barcode entry saves a reviewed product and prevents UPC alias duplicates", async ({
  page,
  request,
}) => {
  const fixture = await trackingMerchantFixture();
  await page.setViewportSize({ width: 390, height: 844 });
  await mobileLogin(page, "http://localhost:8082", fixture.email, fixture.pass);
  await page.getByRole("tab", { name: "Products", exact: true }).click();
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Product barcode", exact: true })
    .fill("4006381333932");
  await page
    .getByRole("button", { name: "Look up barcode", exact: true })
    .click();
  await expect(
    page.getByText("Barcode check digit is invalid.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Create product in first shop",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Product barcode", exact: true })
    .fill("036000291452");
  await page
    .getByRole("button", { name: "Look up barcode", exact: true })
    .click();
  await expect(
    page.getByText("Barcode: 00036000291452", { exact: true }),
  ).toBeVisible();
  await page
    .getByPlaceholder("New product name")
    .fill("Reviewed barcode product");
  await page.getByPlaceholder("Price in INR").fill("42");
  await page.getByPlaceholder("Stock (pieces)").fill("4");
  await page
    .getByRole("button", { name: "Create product in first shop", exact: true })
    .click();
  await expect(
    page.getByText("Reviewed barcode product", { exact: true }),
  ).toBeVisible();
  const login = await (
    await request.post("http://localhost:4000/api/v1/auth/login", {
      data: { email: fixture.email, password: fixture.pass },
    })
  ).json();
  const rows = await (
    await request.get("http://localhost:4000/api/v1/merchant/products", {
      headers: { Authorization: "Bearer " + login.accessToken },
    })
  ).json();
  expect(
    rows.find((p: any) => p.name === "Reviewed barcode product").specifications
      .barcode,
  ).toBe("00036000291452");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Product barcode", exact: true })
    .fill("0036000291452");
  await page
    .getByRole("button", { name: "Look up barcode", exact: true })
    .click();
  await expect(
    page.getByText(/Already in your shop: Reviewed barcode product/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Create product in first shop",
      exact: true,
    }),
  ).toBeDisabled();
  await page.screenshot({
    path: ".local/screenshots/merchant-barcode-entry.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Close add product", exact: true })
    .click();
});
