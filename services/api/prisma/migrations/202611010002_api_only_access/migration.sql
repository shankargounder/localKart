-- Application access goes through LocalKart JWT/role checks in the API.
-- No Supabase Auth policies: anon/authenticated must never read these tables.
-- Table owners (the Prisma backend/migration role) continue to bypass RLS.
DO $$
DECLARE table_name text; role_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['User', 'Session', 'PasswordReset', 'Category', 'Shop', 'ShopHour', 'Product', 'ProductImage', 'Variant', 'Inventory', 'InventoryMovement', 'Reservation', 'CartItem', 'Order', 'OrderItem', 'OrderHistory', 'Payment', 'PaymentEvent', 'Notification', 'DeviceToken', 'NotificationPreference', 'NotificationOutbox', 'NotificationDelivery', 'NotificationDeliveryAttempt', 'RealtimeEvent', 'AuditLog', 'Address', 'DeliveryQuote', 'Delivery', 'DeliveryEvent', 'OfflineSale', 'OfflineSaleItem', 'CommissionRule', 'Refund', 'Favorite', 'WishlistItem', 'ShoppingList', 'Review', 'SupportTicket']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, role_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;
