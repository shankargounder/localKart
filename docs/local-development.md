# Local development

1. Install Node 22 LTS, npm and Docker Desktop (or PostgreSQL 17).
2. Run `npm ci`, copy root `.env.example` to `.env`, and replace both secrets.
3. Run `docker compose up -d`, `npm run db:generate`, `npm run db:migrate`, `npm run db:seed`.
4. Run `npm run dev:api`; check `http://localhost:4000/api/v1/health`.
5. Run `npm run dev:admin`; open `http://localhost:5173`.
6. Copy mobile environment examples and run each Expo app from separate terminals.

The Prisma wrapper loads root `.env` without overriding existing shell/deployment variables. No duplicate environment files are needed for database commands. Without Docker, set root DATABASE_URL to `postgresql://localkart:local-development-only@127.0.0.1:55432/localkart` and run `npm run db:local` before migrations. Database files live in ignored `.local/postgres`; stop the terminal with Ctrl+C.

Approve the pending demo shop using the admin account. To test the 20→17 flow from scratch, register a merchant, create a shop, approve it as admin, then create a product with 20 units. Use the customer map around Hyderabad, add three units, checkout, and accept/prepare/ready/verify using the merchant app.

For simulation, set root `ENABLE_SIMULATED_PAYMENTS=true`, restart the API, choose simulated payment in customer checkout, and pay using the explicitly labelled test action after merchant acceptance. Production configuration rejects simulations.

## Shop-first customer Home

Home lists approved shops within 2 km of the selected locality (Use my location or enter coordinates), nearest first. It does not render product discovery cards. Select a shop to open its catalog, where all active public products load across API pages and display in two columns on phone and desktop widths. Product search/radius exploration remains under Explore. Returning with All shops restores the shop list. Distances are straight-line estimates, not road travel distances.

Shop catalog secondary actions now use labeled 48-pixel icon targets: back, shop favorite, directions, product wishlist hearts and photo/credit popups. Stock filtering is a compact switch beside the product count. Favorites/wishlist icons reflect saved backend state and support removal. Primary Add to cart actions remain clearly labeled. Browser checks cover these toggles, photo-popup close, compact back control and two-column layout.

Product cards now use one compact row for quantity and the cart icon, with inline add/error feedback. The product image and name open a product-details page identified by productId in the URL. Details use current public API data for photos/credits, description, variants, prices, stock visibility, unit, available brand/SKU/specifications and care instructions. Details support variant-specific quantity/cart controls, wishlist toggle, reload and return to the owning shop. Cart rows retain backend validation and invalidate the saved basket after successful updates. Browser tests verify row geometry, variant pricing, persisted quantities, direct URL reload and return to the full catalog.

## Cart, navigation and merchant controls update

Both mobile apps share an Expo vector-icon bottom bar with persistent labels, active-tab highlight and cart/incoming-order badges. Customer cart baskets are horizontal shop chips; item rows include product photos, variant/unit prices, line totals, labeled remove/decrease/increase icons and a separate subtotal summary. Existing fulfillment quotes and checkout remain server driven. Empty baskets link back to nearby shops. The API includes product images in owned cart responses.

Merchant notifications now open from the header drawer, matching the customer shell. Catalogue creation is collapsed; product photos/credits, upload, edit and archive/restore actions use compact icon controls. Edit/upload forms open in dismissible popups. Shop availability, pickup acceptance, delivery, COD and holiday mode use labeled switches. Important confirmation and save actions retain text labels. Inventory adjustment and order-detail shortcuts use labeled icons.

Browser validation covers customer checkout, merchant reports/billing, cart quantity/remove/empty behavior, active navigation state, merchant archive/restore/edit popups, shop switch persistence and notification drawer access using isolated local fixtures. No native-device verification is implied by browser checks.

Merchant dashboard metrics now use uniform two-column icon tiles. Today/new/preparing/ready/cancelled order tiles open server-filtered lists using the same IST day boundary as the dashboard. Products opens active products, Low stock opens inventory whose on-hand minus reserved balance is at/below its threshold, and Today’s sales opens the one-day report. Detail screens include a compact return to dashboard control. List queries load all pages to avoid truncating count destinations. The Products page has a floating Add product button above bottom navigation, opening a dismissible creation form and closing after successful creation. Browser checks cover filtered order dates/statuses, low-stock matching, each destination and saved product creation from the floating button, using isolated synthetic fixtures.
