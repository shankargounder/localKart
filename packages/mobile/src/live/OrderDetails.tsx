import React, { useEffect, useState } from "react";
import { Text, View, AppState, Linking, Modal } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { money, pickupCountdown } from "@localkart/shared";
import {
  AppButton,
  AppInput,
  Section,
  QueryState,
  styles,
} from "../v2/Components";
import { IconButton } from "./IconButton";
import { ProductPhoto } from "./ProductPhoto";
import { persisted } from "./persistence";
export function AcceptOrderButton({ order, api, mutate }: any) {
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState("20");
  return (
    <>
      <AppButton
        title="Accept & set preparation time"
        onPress={() => setOpen(true)}
      />
      <Modal
        transparent
        visible={open}
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#0008",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <Section title="Confirm preparation estimate">
            <Text>
              Accept this order and prepare it in {minutes || "…"} minutes?
            </Text>
            <View style={styles.row}>
              {[10, 15, 20, 30, 45].map((value) => (
                <AppButton
                  secondary={Number(minutes) !== value}
                  title={value + " min"}
                  key={value}
                  onPress={() => setMinutes(String(value))}
                />
              ))}
            </View>
            <AppInput
              placeholder="Custom preparation minutes"
              keyboardType="number-pad"
              value={minutes}
              onChangeText={setMinutes}
            />
            <AppButton
              title="Confirm acceptance & reserve stock"
              onPress={() =>
                mutate(async () => {
                  await api(
                    "/merchant/orders/" + order.id + "/accept",
                    "POST",
                    { preparationDurationMinutes: Number(minutes) },
                  );
                  setOpen(false);
                })
              }
            />
            <AppButton secondary title="Back" onPress={() => setOpen(false)} />
          </Section>
        </View>
      </Modal>
    </>
  );
}
export function OrderDetails({
  orderId,
  userId,
  merchant,
  api,
  mutate,
  base,
  offset,
  onClose,
}: any) {
  const [cached, setCached] = useState<any>(null);
  const [now, setNow] = useState(Date.now());
  const [minutes, setMinutes] = useState("20");
  const [code, setCode] = useState("");
  const key = "tracking." + userId + "." + orderId;
  const query = useQuery({
    queryKey: ["order-detail", userId, orderId],
    queryFn: () => api("/orders/" + orderId),
    refetchInterval: 5000,
  });
  useEffect(() => {
    let active = true;
    setCached(null);
    void persisted.get(key).then((value) => {
      if (value && active)
        try {
          setCached(JSON.parse(value));
        } catch {
          /* Ignore invalid local cache. */
        }
    });
    return () => {
      active = false;
    };
  }, [key]);
  useEffect(() => {
    if (query.data) {
      setCached(query.data);
      void persisted.set(key, JSON.stringify(query.data));
      void api("/orders/" + orderId + "/notifications/read", "PATCH").catch(
        () => {},
      );
    }
  }, [query.data?.version, orderId]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        setNow(Date.now());
        void query.refetch();
      }
    });
    return () => {
      clearInterval(timer);
      app.remove();
    };
  }, [orderId]);
  const order = query.data || cached;
  if (!order)
    return (
      <>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <IconButton icon="‹" label="Back to orders" onPress={onClose} />
          <Text style={{ fontSize: 18, fontWeight: "700" }}>Order details</Text>
        </View>
        <QueryState query={query} />
      </>
    );
  const countdown = pickupCountdown(order, Math.max(now, Date.now()) + offset);
  const ready = order.status === "READY_FOR_PICKUP";
  const short = "#" + order.id.slice(0, 8).toUpperCase();
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <IconButton icon="‹" label="Back to orders" onPress={onClose} />
        <Text style={{ fontSize: 18, fontWeight: "700" }}>Order details</Text>
      </View>
      <Section
        title={
          order.status === "PENDING_ACCEPTANCE"
            ? "Order placed successfully!"
            : order.status === "COMPLETED"
              ? "Order completed"
              : ready
                ? "Ready for pickup"
                : order.status === "ACCEPTED"
                  ? "Order accepted"
                  : "Track your order"
        }
      >
        <Text style={styles.heading}>{short}</Text>
        <Text>{new Date(order.createdAt).toLocaleString()}</Text>
        <Text>{order.shop.name}</Text>
        <Text>{order.shop.address}</Text>
        {order.shop.phone && <Text>Shop contact: {order.shop.phone}</Text>}
        {merchant && order.customer?.name && (
          <Text>Customer: {order.customer.name}</Text>
        )}
        <Text>
          {order.fulfillmentType === "PICKUP" ? "Self pickup" : "Home delivery"}{" "}
          · {order.status.replaceAll("_", " ")}
        </Text>
        {query.error && (
          <Text style={styles.muted}>
            Offline or reconnecting. Showing the last saved order; no status is
            inferred from the timer.
          </Text>
        )}
      </Section>
      <Section
        title={
          order.fulfillmentType === "PICKUP"
            ? "Pickup progress"
            : "Shop preparation & delivery"
        }
      >
        <Text>{countdown.label}</Text>
        {order.fulfillmentType === "PICKUP" &&
          ["ACCEPTED", "PREPARING"].includes(order.status) && (
            <View
              style={{
                backgroundColor: "#FFF8D6",
                borderRadius: 12,
                padding: 12,
                gap: 6,
              }}
            >
              <Text style={{ fontWeight: "700" }}>
                Please wait for pickup confirmation
              </Text>
              <Text>
                The shop is preparing your order. Collect it only after the
                status changes to Ready for pickup.
              </Text>
            </View>
          )}
        {ready && (
          <View
            style={{
              backgroundColor: "#F0FDF4",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Text style={{ fontWeight: "700", color: "#166534" }}>
              Your order is ready for pickup. You can collect it now.
            </Text>
          </View>
        )}
        {order.fulfillmentType === "PICKUP" &&
          order.estimatedReadyAt &&
          ["ACCEPTED", "PREPARING"].includes(order.status) && (
            <>
              <Text>
                Estimated ready:{" "}
                {new Date(order.estimatedReadyAt).toLocaleTimeString()}
              </Text>
              {countdown.seconds !== null && countdown.seconds > 0 && (
                <Text style={{ fontSize: 32, fontWeight: "800" }}>
                  {Math.floor(countdown.seconds / 60)}:
                  {String(countdown.seconds % 60).padStart(2, "0")}
                </Text>
              )}
            </>
          )}
        {order.fulfillmentType === "DELIVERY" && (
          <>
            <Text>
              {order.preparationDurationMinutes
                ? "Shop-confirmed preparation: " +
                  order.preparationDurationMinutes +
                  " min"
                : "Waiting for the shop to confirm preparation."}
            </Text>
            {order.delivery && (
              <Text>
                {order.delivery.provider === "MOCK"
                  ? "SIMULATED DELIVERY · "
                  : ""}
                Last verified status: {order.delivery.status} ·{" "}
                {order.delivery.events?.at(-1)?.createdAt
                  ? new Date(
                      order.delivery.events.at(-1).createdAt,
                    ).toLocaleString()
                  : "Dispatch not yet confirmed"}
              </Text>
            )}
            <Text style={styles.muted}>
              No live rider location or unconfirmed arrival time is shown.
            </Text>
          </>
        )}
        {!merchant && order.pickupCode && (
          <>
            <Text>
              {order.fulfillmentType === "PICKUP"
                ? "Give this code at pickup"
                : "Give this code only after receiving your delivery"}
            </Text>
            <Text style={{ fontSize: 36, fontWeight: "800" }}>
              {order.pickupCode}
            </Text>
          </>
        )}
        <Text>{order.shop.pickupInstructions}</Text>
        <IconButton
          icon="↗"
          label="Directions to shop"
          onPress={() =>
            Linking.openURL(
              `https://www.google.com/maps/dir/?api=1&destination=${order.shop.latitude},${order.shop.longitude}`,
            )
          }
        />
      </Section>
      <Section title="Order summary">
        {order.items.map((item: any) => (
          <Section key={item.id}>
            <ProductPhoto
              base={base}
              height={110}
              image={{ url: item.imageUrl, alt: item.imageAlt || item.name }}
            />
            <Text style={styles.heading}>{item.name}</Text>
            <Text>
              {item.quantity / 1000} {item.unit.toLowerCase()} ×{" "}
              {money(item.pricePaise)} = {money(item.totalPaise)}
            </Text>
          </Section>
        ))}
        <Text>Subtotal: {money(order.merchandisePaise)}</Text>
        <Text>Delivery charge: {money(order.deliveryFeePaise)}</Text>
        <Text style={styles.heading}>Total: {money(order.totalPaise)}</Text>
        <Text>
          Payment method:{" "}
          {order.payment?.method === "PICKUP"
            ? "Pay at pickup"
            : order.payment?.method === "COD"
              ? "Cash on delivery"
              : "SIMULATED — testing only"}
        </Text>
        <Text>
          Payment status: {order.payment?.status.replaceAll("_", " ")}
        </Text>
        {order.packingPreferences && (
          <Text>Packing preferences: {order.packingPreferences}</Text>
        )}
        {order.delivery?.addressSnapshot && (
          <Text>
            Delivery: {order.delivery.addressSnapshot.line1},{" "}
            {order.delivery.addressSnapshot.locality}
          </Text>
        )}
      </Section>
      <Section title="Order timeline">
        {order.history.map((h: any) => (
          <Text key={h.id}>
            ✓ {h.status.replaceAll("_", " ")} ·{" "}
            {new Date(h.createdAt).toLocaleString()}
            {h.reason ? " · " + h.reason : ""}
          </Text>
        ))}
      </Section>
      {merchant && (
        <Section title="Order actions">
          {order.status === "PENDING_ACCEPTANCE" && (
            <>
              <AcceptOrderButton order={order} api={api} mutate={mutate} />
              <AppButton
                secondary
                title="Reject: items unavailable"
                onPress={() =>
                  mutate(() =>
                    api("/merchant/orders/" + order.id + "/reject", "POST", {
                      reason: "Items unavailable at the shop",
                    }),
                  )
                }
              />
            </>
          )}
          {order.status === "ACCEPTED" && (
            <AppButton
              title="Start preparing"
              onPress={() =>
                mutate(() =>
                  api("/merchant/orders/" + order.id + "/preparing", "POST"),
                )
              }
            />
          )}{" "}
          {["ACCEPTED", "PREPARING"].includes(order.status) && (
            <>
              <AppInput
                placeholder="Updated readiness estimate in minutes from now"
                value={minutes}
                onChangeText={setMinutes}
                keyboardType="number-pad"
              />
              <AppButton
                secondary
                title="Update preparation estimate"
                onPress={() =>
                  mutate(() =>
                    api(
                      "/merchant/orders/" + order.id + "/estimated-ready-time",
                      "PATCH",
                      { minutes: Number(minutes) },
                      "eta-" + order.id + "-" + order.version + "-" + minutes,
                    ),
                  )
                }
              />
            </>
          )}
          {order.status === "PREPARING" && (
            <AppButton
              title={
                order.fulfillmentType === "PICKUP"
                  ? "Mark ready for pickup"
                  : "Package ready · request rider"
              }
              onPress={() =>
                mutate(() =>
                  api("/merchant/orders/" + order.id + "/ready", "POST"),
                )
              }
            />
          )}{" "}
          {order.status === "READY_FOR_PICKUP" && (
            <>
              <AppInput
                placeholder="Customer pickup code"
                value={code}
                maxLength={6}
                onChangeText={setCode}
              />
              <AppButton
                title="Payment collected · verify pickup"
                onPress={() =>
                  mutate(() =>
                    api("/merchant/orders/" + order.id + "/complete", "POST", {
                      code,
                      collected: true,
                    }),
                  )
                }
              />
            </>
          )}
        </Section>
      )}
    </>
  );
}
