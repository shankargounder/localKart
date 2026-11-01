ALTER TABLE "Inventory" ADD CONSTRAINT "inventory_nonnegative" CHECK ("onHand" >= 0 AND reserved >= 0 AND reserved <= "onHand");
ALTER TABLE "Variant" ADD CONSTRAINT "price_positive" CHECK ("pricePaise" > 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "order_item_positive" CHECK (quantity > 0 AND "pricePaise" > 0 AND "totalPaise" >= 0);
ALTER TABLE "CartItem" ADD CONSTRAINT "cart_quantity_positive" CHECK (quantity > 0);
ALTER TABLE "Reservation" ADD CONSTRAINT "reservation_quantity_positive" CHECK (quantity > 0);
ALTER TABLE "User" ADD CONSTRAINT "valid_role" CHECK (role IN ('CUSTOMER','MERCHANT','ADMIN'));
ALTER TABLE "Order" ADD CONSTRAINT "valid_order_status" CHECK (status IN ('PENDING_ACCEPTANCE','ACCEPTED','PREPARING','READY_FOR_PICKUP','COMPLETED','REJECTED','CANCELLED','EXPIRED'));
ALTER TABLE "Shop" ADD CONSTRAINT "valid_coordinates" CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180);
ALTER TABLE "Order" ADD CONSTRAINT "total_nonnegative" CHECK ("totalPaise" >= 0);
CREATE FUNCTION forbid_inventory_movement_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Inventory movement history is immutable'; END;
$$;
CREATE TRIGGER immutable_inventory_movement BEFORE UPDATE OR DELETE ON "InventoryMovement" FOR EACH ROW EXECUTE FUNCTION forbid_inventory_movement_mutation();
