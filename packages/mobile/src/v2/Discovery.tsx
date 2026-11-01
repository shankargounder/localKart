import React, { useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { createMarketplaceClient } from "@localkart/api-client";
import { money } from "@localkart/shared";
import { AppButton, Section, QueryState, styles } from "./Components";
import ShopMap from "../Map";
import { ProductPhoto } from "../live/ProductPhoto";

export function SmartDiscovery({
  api,
  base,
  query,
  location,
  category,
  onShop,
  map = false,
  onMove,
  pending = false,
  userLocation,
}: any) {
  const [radius, setRadius] = useState(0);
  const [sort, setSort] = useState("distance");
  const [offset, setOffset] = useState(0);
  const [available, setAvailable] = useState(true);
  const key = JSON.stringify([
    query,
    location,
    category,
    radius,
    sort,
    available,
  ]);
  const [previous, setPrevious] = useState(key);
  if (previous !== key) {
    setPrevious(key);
    if (offset) setOffset(0);
  }
  const client = createMarketplaceClient(api);
  const search = useQuery({
    queryKey: ["smart-search", key, offset],
    queryFn: () =>
      client.search({
        q: query,
        lat: location.lat,
        lng: location.lng,
        sort,
        available: String(available),
        offset,
        ...(category ? { categoryId: category } : {}),
        ...(radius ? { radius } : {}),
        limit: 20,
      }),
  });
  const result = search.data;
  const suggestions = useQuery({
    queryKey: ["suggestions", query],
    queryFn: () => api("/discovery/suggestions?q=" + encodeURIComponent(query)),
    enabled: query.length >= 2,
  });
  const [openError, setOpenError] = useState("");
  const open = async (p: any) => {
    setOpenError("");
    try {
      onShop(await api("/shops/" + p.shopId));
    } catch (e) {
      setOpenError((e as Error).message);
    }
  };
  const shops = Array.from(
    new Map(
      (result?.results || []).map((p) => [
        p.shopId,
        {
          id: p.shopId,
          name: p.shopName,
          latitude: p.latitude,
          longitude: p.longitude,
          category: { name: p.categoryName },
        },
      ]),
    ).values(),
  );
  if (pending)
    return (
      <Section title="Searching nearby…">
        <Text style={styles.muted}>
          Checking products and availability around your locality.
        </Text>
      </Section>
    );
  return (
    <Section title="Find it around the corner">
      <Text style={styles.muted}>
        Search products, brands, variants or categories. Distances are
        straight-line estimates.
      </Text>
      <View style={styles.row}>
        {[0, 1, 2, 5, 10, 15, 25].map((r) => (
          <AppButton
            secondary={radius !== r}
            key={r}
            title={r ? r + " km" : "Smart radius"}
            onPress={() => setRadius(r)}
          />
        ))}
      </View>
      <View style={styles.row}>
        <AppButton
          secondary
          title={available ? "In-stock only" : "Include out of stock"}
          onPress={() => setAvailable(!available)}
        />
        <AppButton
          secondary
          title={
            sort === "distance"
              ? "Sort: nearest"
              : sort === "price-asc"
                ? "Sort: lowest price"
                : "Sort: highest price"
          }
          onPress={() =>
            setSort(
              sort === "distance"
                ? "price-asc"
                : sort === "price-asc"
                  ? "price-desc"
                  : "distance",
            )
          }
        />
      </View>
      <QueryState query={search} />
      {openError && <Text style={styles.muted}>{openError}</Text>}
      {result && (
        <Text style={styles.muted}>
          {result.total} matching variants within {result.radiusKm} km
          {result.expanded ? " · Automatically expanded from 1 km" : ""}
        </Text>
      )}
      {map && (
        <ShopMap
          userLocation={userLocation}
          shops={shops}
          location={location}
          onSelect={(shop: any) => void open({ shopId: shop.id })}
          onMove={onMove || (() => {})}
        />
      )}
      {result?.results.map((p) => (
        <Section key={p.variantId} title={p.name}>
          <ProductPhoto
            base={base}
            image={{ url: p.imageUrl, alt: p.imageAlt || p.name }}
          />
          <Text>
            {p.brand} · {p.label} · {money(p.pricePaise)} /{" "}
            {p.unit.toLowerCase()}
          </Text>
          <Text style={styles.muted}>
            {p.shopName} · {p.distanceKm.toFixed(2)} km ·{" "}
            {p.available ? "In stock" : "Out of stock"}
          </Text>
          <Text style={styles.muted}>
            {p.pickupEligible ? "Pickup available" : "Pickup paused"} ·{" "}
            {p.deliveryEligible ? "Shop offers delivery" : "Pickup only"}
          </Text>
          <AppButton
            title="Open shop & compare variants"
            onPress={() => void open(p)}
          />
        </Section>
      ))}
      {result?.total === 0 && (
        <Text>
          No matching products. Try a suggestion or extend the radius.
        </Text>
      )}
      {!!suggestions.data?.length && (
        <Text style={styles.muted}>
          Suggestions: {suggestions.data.join(" · ")}
        </Text>
      )}
      <View style={styles.row}>
        <AppButton
          secondary
          title="Previous"
          disabled={offset === 0}
          onPress={() => setOffset(Math.max(0, offset - 20))}
        />
        <AppButton
          secondary
          title="Next"
          disabled={!result || offset + 20 >= result.total}
          onPress={() => setOffset(offset + 20)}
        />
      </View>
    </Section>
  );
}
