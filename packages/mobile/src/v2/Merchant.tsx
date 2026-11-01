import React, { useState } from "react";
import { IconButton } from "../live/IconButton";
import { Text, View, Linking } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { lineTotal, money } from "@localkart/shared";
import {
  AppButton,
  SettingSwitch,
  AppInput,
  Section,
  Collapsible,
  QueryState,
  styles,
} from "./Components";

export function BusinessReports({ api, initialDays = 7 }: any) {
  const [days, setDays] = useState(initialDays);
  const report = useQuery({
    queryKey: ["merchant-reports", days],
    queryFn: () => api("/merchant/reports?days=" + days),
  });
  return (
    <Section title="Your business, clearly">
      <View style={styles.row}>
        {[1, 7, 30].map((d) => (
          <AppButton
            secondary={days !== d}
            key={d}
            title={d === 1 ? "Today" : d + " days"}
            onPress={() => setDays(d)}
          />
        ))}
      </View>
      <QueryState query={report} />
      {report.data && (
        <>
          <Text>
            Online merchandise sales: {money(report.data.onlineSalesPaise)}
          </Text>
          <Text>Offline sales: {money(report.data.offlineSalesPaise)}</Text>
          <Text>Platform fees: {money(report.data.platformFeesPaise)}</Text>
          <Text style={styles.muted}>
            Sales use completion time. These are gross sales before refunds, not
            a bank payout statement.
          </Text>
          {report.data.daily.map((d: any) => (
            <Text key={d.date}>
              {d.date} · {money(d.totalPaise)}
            </Text>
          ))}
          <Text style={styles.heading}>Top products</Text>
          {report.data.topProducts.map((p: any) => (
            <Text key={p.name}>
              {p.name} · {p.quantityMilli / 1000} units · {money(p.totalPaise)}
            </Text>
          ))}
        </>
      )}
    </Section>
  );
}
export function OfflineBilling({ api, mutate, inventory }: any) {
  const [basket, setBasket] = useState<Record<string, number>>({});
  const [key, setKey] = useState("");
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("CASH");
  const [last, setLast] = useState<any>(null);
  const rows = inventory || [];
  const shopId = rows.find((r: any) => basket[r.variantId])?.variant.product
    .shopId;
  const total = rows.reduce(
    (s: number, r: any) =>
      s +
      (basket[r.variantId]
        ? lineTotal(r.variant.pricePaise, basket[r.variantId])
        : 0),
    0,
  );
  const edit = (variantId: string, amount: number) => {
    setBasket({ ...basket, [variantId]: amount });
    setKey("");
  };
  return (
    <Collapsible title="Record an in-store sale">
      <Text style={styles.muted}>
        Use this only for a new offline purchase. LocalKart online pickups are
        finalized through their existing orders.
      </Text>
      <AppInput
        placeholder="Search products"
        value={search}
        onChangeText={setSearch}
      />
      {rows
        .filter((r: any) =>
          r.variant.product.name.toLowerCase().includes(search.toLowerCase()),
        )
        .map((r: any) => (
          <Section key={r.variantId} title={r.variant.product.name}>
            <Text>
              {money(r.variant.pricePaise)} /{" "}
              {r.variant.product.unit.toLowerCase()} · Available{" "}
              {(r.onHand - r.reserved) / 1000}
            </Text>
            <AppInput
              placeholder="Quantity in displayed units"
              keyboardType="decimal-pad"
              value={String((basket[r.variantId] || 0) / 1000)}
              onChangeText={(text: string) =>
                edit(r.variantId, Math.round(Number(text) * 1000))
              }
            />
          </Section>
        ))}
      <Text>Total {money(total)}</Text>
      <View style={styles.row}>
        {["CASH", "UPI", "CARD"].map((m) => (
          <AppButton
            secondary={m !== method}
            title={m}
            key={m}
            onPress={() => {
              setMethod(m);
              setKey("");
            }}
          />
        ))}
      </View>
      <AppButton
        title="Complete offline sale"
        onPress={() =>
          mutate(async () => {
            const chosen = rows.filter((r: any) => basket[r.variantId] > 0);
            if (
              new Set(chosen.map((r: any) => r.variant.product.shopId)).size !==
              1
            )
              throw new Error("Select products from exactly one shop");
            const nextKey =
              key ||
              "offline-" +
                Date.now() +
                "-" +
                Math.random().toString(36).slice(2);
            setKey(nextKey);
            const sale = await api(
              "/merchant/offline-sales",
              "POST",
              {
                shopId,
                paymentMethod: method,
                items: chosen.map((r: any) => ({
                  variantId: r.variantId,
                  quantity: basket[r.variantId],
                })),
              },
              nextKey,
            );
            setLast(sale);
            setBasket({});
            setKey("");
          })
        }
      />
      {last && (
        <Text>
          Sale #{last.id.slice(0, 8)} recorded: {money(last.totalPaise)}
        </Text>
      )}
    </Collapsible>
  );
}
export function ShopOperations({ api, mutate, shops }: any) {
  const [hours, setHours] = useState({ opens: "09:00", closes: "21:00" });
  return (
    <>
      {shops?.map((shop: any) => (
        <Section key={shop.id} title={shop.name}>
          <Text>
            {shop.approval} · {shop.address}
          </Text>
          <SettingSwitch
            label="Shop open"
            value={shop.open}
            onChange={(open: boolean) =>
              mutate(() => api("/merchant/shops/" + shop.id, "PATCH", { open }))
            }
          />
          <SettingSwitch
            label="Accept pickup orders"
            value={shop.acceptingOrders}
            onChange={(acceptingOrders: boolean) =>
              mutate(() =>
                api("/merchant/shops/" + shop.id, "PATCH", { acceptingOrders }),
              )
            }
          />
          <SettingSwitch
            label="Home delivery"
            value={shop.deliveryEnabled}
            onChange={(deliveryEnabled: boolean) =>
              mutate(() =>
                api("/merchant/shops/" + shop.id, "PATCH", { deliveryEnabled }),
              )
            }
          />
          <SettingSwitch
            label="Cash on delivery"
            value={shop.codEnabled}
            onChange={(codEnabled: boolean) =>
              mutate(() =>
                api("/merchant/shops/" + shop.id, "PATCH", { codEnabled }),
              )
            }
          />
          <SettingSwitch
            label="Holiday mode"
            value={shop.holidayMode}
            onChange={(holidayMode: boolean) =>
              mutate(() =>
                api("/merchant/shops/" + shop.id, "PATCH", { holidayMode }),
              )
            }
          />
          <IconButton
            icon="↥"
            label="Share shop catalogue"
            onPress={() =>
              Linking.openURL(
                "https://wa.me/?text=" +
                  encodeURIComponent(
                    `Shop ${shop.name} on LocalKart. Shop code: ${shop.id}`,
                  ),
              )
            }
          />
          <Collapsible title="Opening hours (all days)">
            <AppInput
              placeholder="Opens HH:mm"
              value={hours.opens}
              onChangeText={(opens: string) => setHours({ ...hours, opens })}
            />
            <AppInput
              placeholder="Closes HH:mm"
              value={hours.closes}
              onChangeText={(closes: string) => setHours({ ...hours, closes })}
            />
            <AppButton
              title="Save weekly opening hours"
              onPress={() =>
                mutate(() =>
                  api(
                    "/merchant/shops/" + shop.id + "/hours",
                    "PUT",
                    Array.from({ length: 7 }, (_, day) => ({ day, ...hours })),
                  ),
                )
              }
            />
          </Collapsible>
          <Text style={styles.muted}>
            Delivery is coordinated by an administrator. Development deliveries
            are clearly marked simulations.
          </Text>
        </Section>
      ))}
    </>
  );
}
export function ProductMaintenance({
  api,
  mutate,
  product,
  compact = false,
}: any) {
  const [name, setName] = useState(product.name);
  const [brand, setBrand] = useState(product.brand || "");
  const [sku, setSku] = useState(product.sku || "");
  const [price, setPrice] = useState(
    String(product.variants[0]?.pricePaise / 100 || ""),
  );
  const [label, setLabel] = useState("");
  const [stock, setStock] = useState("0");
  return (
    <Collapsible compact={compact} title="Edit product & variants">
      <AppInput
        placeholder="Product name"
        value={name}
        onChangeText={setName}
      />
      <AppInput placeholder="Brand" value={brand} onChangeText={setBrand} />
      <AppInput placeholder="SKU" value={sku} onChangeText={setSku} />
      <AppButton
        title="Save product details"
        onPress={() =>
          mutate(() =>
            api("/merchant/products/" + product.id, "PATCH", {
              name,
              brand,
              sku,
            }),
          )
        }
      />
      <AppInput
        placeholder="New price in INR"
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
      />
      {product.variants.map((v: any) => (
        <AppButton
          key={v.id}
          secondary
          title={"Update " + v.label + " price"}
          onPress={() =>
            mutate(() =>
              api("/merchant/variants/" + v.id, "PATCH", {
                pricePaise: Math.round(Number(price) * 100),
              }),
            )
          }
        />
      ))}
      <AppInput
        placeholder="New variant label"
        value={label}
        onChangeText={setLabel}
      />
      <AppInput
        placeholder="Initial stock in displayed units"
        value={stock}
        onChangeText={setStock}
        keyboardType="decimal-pad"
      />
      <AppButton
        title="Add variant at entered price"
        onPress={() =>
          mutate(() =>
            api("/merchant/products/" + product.id + "/variants", "POST", {
              label,
              pricePaise: Math.round(Number(price) * 100),
              stockMilli: Math.round(Number(stock) * 1000),
            }),
          )
        }
      />
    </Collapsible>
  );
}
