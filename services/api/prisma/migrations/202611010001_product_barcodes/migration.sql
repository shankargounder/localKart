-- Additive index over optional barcode metadata. Existing products are unchanged.
CREATE UNIQUE INDEX "Product_shop_barcode_key" ON "Product" ("shopId", ("specifications"->>'barcode')) WHERE "specifications" ? 'barcode' AND "specifications"->>'barcode' <> '';
