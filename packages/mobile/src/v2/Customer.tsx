import React, { useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { money } from "@localkart/shared";
import {
  AppButton,
  AppInput,
  Section,
  Collapsible,
  QueryState,
  styles,
} from "./Components";

export function AddressBook({ api, mutate, selected, onSelect }: any) {
  const addresses = useQuery({
    queryKey: ["addresses"],
    queryFn: () => api("/customers/addresses"),
  });
  const [form, setForm] = useState({
    label: "Home",
    recipient: "",
    phone: "",
    line1: "",
    locality: "Hyderabad",
    postalCode: "500081",
    latitude: "17.4483",
    longitude: "78.3915",
  });
  return (
    <Section title="Your saved addresses">
      <QueryState query={addresses} />
      {addresses.data?.map((a: any) => (
        <View key={a.id}>
          <Text>
            {a.label} · {a.line1}, {a.locality}
          </Text>
          {onSelect && (
            <AppButton
              secondary={selected !== a.id}
              title={selected === a.id ? "Selected" : "Use this address"}
              onPress={() => onSelect(a.id)}
            />
          )}
          <AppButton
            secondary
            title="Remove address"
            onPress={() =>
              mutate(() => api("/customers/addresses/" + a.id, "DELETE"))
            }
          />
        </View>
      ))}
      <Collapsible title="Add an address">
        {Object.entries(form).map(([field, value]) => (
          <AppInput
            key={field}
            placeholder={field}
            value={value}
            onChangeText={(text: string) => setForm({ ...form, [field]: text })}
          />
        ))}
        <AppButton
          title="Save address"
          onPress={() =>
            mutate(() =>
              api("/customers/addresses", "POST", {
                ...form,
                latitude: Number(form.latitude),
                longitude: Number(form.longitude),
              }),
            )
          }
        />
      </Collapsible>
    </Section>
  );
}
export function FulfillmentSelector({
  api,
  mutate,
  shopId,
  type,
  onType,
  quote,
  onQuote,
}: any) {
  const [addressId, setAddressId] = useState("");
  return (
    <Section title="How would you like your order?">
      <View style={styles.row}>
        <AppButton
          secondary={type !== "PICKUP"}
          title="Self pickup"
          onPress={() => {
            onType("PICKUP");
            onQuote(null);
          }}
        />
        <AppButton
          secondary={type !== "DELIVERY"}
          title="Home delivery"
          onPress={() => {
            onType("DELIVERY");
            onQuote(null);
          }}
        />
      </View>
      {type === "PICKUP" ? (
        <Text style={styles.muted}>
          Collect from the shop using your secure pickup code. Preparation time
          is shown on the shop page.
        </Text>
      ) : (
        <>
          <AddressBook
            api={api}
            mutate={mutate}
            selected={addressId}
            onSelect={(id: string) => {
              setAddressId(id);
              onQuote(null);
            }}
          />
          <AppButton
            title="Check serviceability & delivery charge"
            disabled={!addressId}
            onPress={() =>
              mutate(async () =>
                onQuote(
                  await api("/delivery/quotes", "POST", { shopId, addressId }),
                ),
              )
            }
          />
          {quote && (
            <>
              <Text>Delivery charge: {money(quote.feePaise)}</Text>
              <Text style={styles.muted}>{quote.notice}</Text>
              <Text style={styles.muted}>
                Quote valid until{" "}
                {new Date(quote.expiresAt).toLocaleTimeString()}. No delivery
                time has been promised.
              </Text>
            </>
          )}
        </>
      )}
    </Section>
  );
}
export function CustomerExtras({ api, mutate, onShop }: any) {
  const favorites = useQuery({
    queryKey: ["favorites"],
    queryFn: () => api("/customers/favorites"),
  });
  const lists = useQuery({
    queryKey: ["shopping-lists"],
    queryFn: () => api("/customers/shopping-lists"),
  });
  const tickets = useQuery({
    queryKey: ["tickets"],
    queryFn: () => api("/support/tickets"),
  });
  const wishlist = useQuery({
    queryKey: ["wishlist"],
    queryFn: () => api("/customers/wishlist"),
  });
  const refunds = useQuery({
    queryKey: ["refunds"],
    queryFn: () => api("/customers/refunds"),
  });
  const [name, setName] = useState("Weekly shopping");
  const [items, setItems] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  return (
    <>
      <AddressBook api={api} mutate={mutate} />
      <Collapsible title="Favorite shops">
        <QueryState query={favorites} />
        {favorites.data?.map((f: any) => (
          <AppButton
            key={f.shopId}
            title={f.shop.name}
            onPress={() => onShop(f.shop)}
          />
        ))}
      </Collapsible>
      <Collapsible title="Product wishlist">
        <QueryState query={wishlist} />
        {wishlist.data?.map((w: any) => (
          <Section key={w.productId} title={w.product.name}>
            <AppButton
              secondary
              title="Remove from wishlist"
              onPress={() =>
                mutate(() =>
                  api("/customers/wishlist/" + w.productId, "DELETE"),
                )
              }
            />
          </Section>
        ))}
      </Collapsible>
      <Collapsible title="Shopping lists">
        <QueryState query={lists} />
        {lists.data?.map((l: any) => (
          <Section key={l.id} title={l.name}>
            <Text>
              {l.items.map((i: any) => i.name + " × " + i.quantity).join("\n")}
            </Text>
            <AppButton
              secondary
              title="Reuse in list editor"
              onPress={() => {
                setName(l.name + " copy");
                setItems(l.items.map((i: any) => i.name).join("\n"));
              }}
            />
          </Section>
        ))}
        <AppInput placeholder="List name" value={name} onChangeText={setName} />
        <AppInput
          placeholder="One product per line"
          multiline
          value={items}
          onChangeText={setItems}
        />
        <AppButton
          title="Save shopping list"
          onPress={() =>
            mutate(() =>
              api("/customers/shopping-lists", "POST", {
                name,
                items: items
                  .split("\n")
                  .filter(Boolean)
                  .map((name) => ({ name, quantity: "1" })),
              }),
            )
          }
        />
      </Collapsible>
      <Collapsible title="Support & refund requests">
        <QueryState query={tickets} />
        {tickets.data?.map((t: any) => (
          <Section key={t.id} title={t.subject}>
            <Text>
              {t.status} · {t.resolution || t.body}
            </Text>
          </Section>
        ))}
        <AppInput
          placeholder="Subject"
          value={subject}
          onChangeText={setSubject}
        />
        <AppInput
          placeholder="Describe your issue"
          multiline
          value={body}
          onChangeText={setBody}
        />
        <AppButton
          title="Create support ticket"
          onPress={() =>
            mutate(() => api("/support/tickets", "POST", { subject, body }))
          }
        />
        {refunds.data?.map((r: any) => (
          <Text key={r.id}>
            {money(r.amountPaise)} · {r.status} · {r.resolution || r.reason}
          </Text>
        ))}
      </Collapsible>
    </>
  );
}
export function OrderCustomerActions({ api, mutate, order }: any) {
  const [reason, setReason] = useState("");
  return (
    <>
      <AppButton
        secondary
        title="Reorder into this shop’s cart"
        onPress={() =>
          mutate(() =>
            api("/customers/orders/" + order.id + "/reorder", "POST"),
          )
        }
      />
      {order.status === "COMPLETED" && (
        <Collapsible title="Request a refund">
          <AppInput
            placeholder="Explain the issue with this order"
            value={reason}
            onChangeText={setReason}
          />
          <Text style={styles.muted}>
            A request does not mean money has been refunded. Support will review
            it.
          </Text>
          <AppButton
            title="Request full order refund review"
            onPress={() =>
              mutate(() =>
                api("/customers/refunds", "POST", {
                  orderId: order.id,
                  amountPaise: order.totalPaise,
                  reason,
                }),
              )
            }
          />
        </Collapsible>
      )}
    </>
  );
}
