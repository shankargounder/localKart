-- Backfill historical pickup snapshots without recalculating historical prices.
UPDATE "Order" SET "merchandisePaise"="totalPaise","merchantPayablePaise"="totalPaise" WHERE "merchandisePaise"=0;
ALTER TABLE "Order" DROP CONSTRAINT "valid_order_status";
ALTER TABLE "Order" ADD CONSTRAINT "valid_order_status" CHECK (status IN ('PENDING_ACCEPTANCE','ACCEPTED','PREPARING','READY_FOR_PICKUP','PICKUP_COMPLETED','AWAITING_RIDER','RIDER_ASSIGNED','RIDER_PICKED_UP','OUT_FOR_DELIVERY','DELIVERED','DELIVERY_FAILED','COMPLETED','REJECTED','CANCELLED','EXPIRED'));
ALTER TABLE "Order" ADD CONSTRAINT "valid_fulfillment_type" CHECK ("fulfillmentType" IN ('PICKUP','DELIVERY'));
ALTER TABLE "Order" ADD CONSTRAINT "financial_snapshot_consistent" CHECK ("merchandisePaise">=0 AND "deliveryFeePaise">=0 AND "platformFeePaise">=0 AND "platformFeePaise"<="merchandisePaise" AND "totalPaise"="merchandisePaise"+"deliveryFeePaise" AND "merchantPayablePaise"="merchandisePaise"-"platformFeePaise" AND "commissionBps" BETWEEN 0 AND 10000);
ALTER TABLE "CommissionRule" ADD CONSTRAINT "valid_commission" CHECK ("basisPoints" BETWEEN 0 AND 10000 AND "minimumFeePaise">=0);
ALTER TABLE "CommissionRule" ADD FOREIGN KEY ("shopId") REFERENCES "Shop"(id);
ALTER TABLE "CommissionRule" ADD FOREIGN KEY ("categoryId") REFERENCES "Category"(id);
ALTER TABLE "DeliveryQuote" ADD FOREIGN KEY ("customerId") REFERENCES "User"(id);
ALTER TABLE "DeliveryQuote" ADD FOREIGN KEY ("shopId") REFERENCES "Shop"(id);
ALTER TABLE "DeliveryQuote" ADD FOREIGN KEY ("addressId") REFERENCES "Address"(id);
ALTER TABLE "DeliveryQuote" ADD CONSTRAINT "valid_quote" CHECK ("feePaise">=0 AND "distanceKm">=0);
ALTER TABLE "OfflineSale" ADD CONSTRAINT "positive_offline_total" CHECK ("totalPaise">=0);
ALTER TABLE "OfflineSaleItem" ADD FOREIGN KEY ("variantId") REFERENCES "Variant"(id);
ALTER TABLE "OfflineSaleItem" ADD CONSTRAINT "valid_offline_line" CHECK (quantity>0 AND "pricePaise">0 AND "totalPaise">=0);
ALTER TABLE "Review" ADD CONSTRAINT "valid_review_rating" CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE "Refund" ADD CONSTRAINT "positive_refund" CHECK ("amountPaise">0);
ALTER TABLE "Shop" ADD CONSTRAINT "valid_delivery_radius" CHECK ("deliveryRadiusKm">0 AND "deliveryRadiusKm"<=25);
ALTER TABLE "Address" ADD CONSTRAINT "valid_address_coordinates" CHECK (latitude BETWEEN -85 AND 85 AND longitude BETWEEN -180 AND 180);
-- Generated vector updates on catalogue edits; no paid search service or extension.
ALTER TABLE "Product" ADD COLUMN "searchDocument" tsvector GENERATED ALWAYS AS (to_tsvector('simple',coalesce(name,'')||' '||coalesce(brand,'')||' '||coalesce(keywords,'')||' '||coalesce(description,''))) STORED;
CREATE INDEX "product_search_gin" ON "Product" USING GIN ("searchDocument");
CREATE INDEX "shop_visible_geo" ON "Shop" (latitude,longitude) WHERE approval='APPROVED';
CREATE INDEX "delivery_quote_expiry" ON "DeliveryQuote" ("customerId","expiresAt") WHERE "consumedAt" IS NULL;
CREATE FUNCTION immutable_order_financials() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW."totalPaise",NEW."merchandisePaise",NEW."deliveryFeePaise",NEW."platformFeePaise",NEW."merchantPayablePaise",NEW."commissionBps",NEW."fulfillmentType") IS DISTINCT FROM (OLD."totalPaise",OLD."merchandisePaise",OLD."deliveryFeePaise",OLD."platformFeePaise",OLD."merchantPayablePaise",OLD."commissionBps",OLD."fulfillmentType") THEN
  RAISE EXCEPTION 'Order financial and fulfillment snapshots are immutable';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER protect_order_snapshots BEFORE UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION immutable_order_financials();
