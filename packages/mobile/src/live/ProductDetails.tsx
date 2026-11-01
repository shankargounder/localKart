import React, { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { money } from "@localkart/shared";
import { colors } from "@localkart/design-tokens";
import { IconButton } from "./IconButton";
import { ProductPhoto, ProductGallery } from "./ProductPhoto";
import { AddToCartControl } from "./AddToCartControl";
export function ProductDetails({
  productId,
  api,
  base,
  onBack,
  wishlist,
  mutate,
}: any) {
  const product = useQuery({
    queryKey: ["product-detail", productId],
    queryFn: () => api("/products/" + productId),
    refetchInterval: 15000,
  });
  const shop = useQuery({
    queryKey: ["product-shop", product.data?.shopId],
    queryFn: () => api("/shops/" + product.data.shopId),
    enabled: !!product.data?.shopId,
  });
  const [selected, setSelected] = useState<string>();
  const [photo, setPhoto] = useState(0);
  const p = product.data;
  const variant =
    p?.variants.find((v: any) => v.id === selected) || p?.variants[0];
  const images = [...(p?.images || [])].sort(
    (a: any, b: any) => Number(a.isDemo) - Number(b.isDemo),
  );
  const saved =
    wishlist.data?.some((i: any) => i.productId === productId) || false;
  return (
    <View testID="product-details" style={{ gap: 16 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <IconButton
          icon="‹"
          label="Back to shop products"
          onPress={() => onBack(shop.data)}
        />
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text }}>
          Product details
        </Text>
        {p ? (
          <IconButton
            icon={saved ? "♥" : "♡"}
            label={
              saved
                ? "Remove product from wishlist"
                : "Save product to wishlist"
            }
            active={saved}
            onPress={() =>
              mutate(() =>
                api("/customers/wishlist/" + p.id, saved ? "DELETE" : "PUT"),
              )
            }
          />
        ) : (
          <View style={{ width: 48 }} />
        )}
      </View>
      {product.isLoading && <Text>Loading product…</Text>}
      {product.error && (
        <View>
          <Text accessibilityRole="alert" style={{ color: colors.error }}>
            This product is unavailable or could not be loaded.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void product.refetch()}
          >
            <Text>Try again</Text>
          </Pressable>
        </View>
      )}
      {p && (
        <>
          <View style={{ position: "relative" }}>
            <ProductPhoto
              image={images[photo] || images[0]}
              base={base}
              height={280}
            />
            <View style={{ position: "absolute", right: 8, bottom: 8 }}>
              <ProductGallery compact images={images} base={base} />
            </View>
          </View>
          {images.length > 1 && (
            <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
              {images.map((image: any, index: number) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={"View product photo " + (index + 1)}
                  accessibilityState={{ selected: photo === index }}
                  key={image.id || image.url}
                  onPress={() => setPhoto(index)}
                  style={{
                    width: 72,
                    borderWidth: 2,
                    borderColor:
                      photo === index ? colors.primary : colors.border,
                    borderRadius: 12,
                  }}
                >
                  <ProductPhoto image={image} base={base} height={65} />
                </Pressable>
              ))}
            </ScrollView>
          )}
          <View style={{ gap: 6 }}>
            {p.brand && <Text style={{ color: colors.muted }}>{p.brand}</Text>}
            <Text
              style={{ fontSize: 25, fontWeight: "800", color: colors.text }}
            >
              {p.name}
            </Text>
            {shop.data && (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={"Browse " + shop.data.name}
                onPress={() => onBack(shop.data)}
              >
                <Text style={{ color: colors.muted }}>{shop.data.name} →</Text>
              </Pressable>
            )}
            <Text style={{ fontSize: 15, lineHeight: 23, color: colors.text }}>
              {p.description}
            </Text>
          </View>
          <View
            style={{
              gap: 12,
              padding: 16,
              backgroundColor: colors.background,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "700" }}>
              Choose a variant
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {p.variants.map((v: any) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={"Select variant " + v.label}
                  accessibilityState={{ selected: variant?.id === v.id }}
                  key={v.id}
                  onPress={() => setSelected(v.id)}
                  style={{
                    padding: 12,
                    minHeight: 48,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor:
                      variant?.id === v.id ? colors.primary : colors.border,
                    backgroundColor:
                      variant?.id === v.id ? colors.light : colors.background,
                  }}
                >
                  <Text>{v.label}</Text>
                </Pressable>
              ))}
            </View>
            {variant ? (
              <>
                <Text
                  style={{
                    fontSize: 24,
                    fontWeight: "800",
                    color: colors.text,
                  }}
                >
                  {money(variant.pricePaise)}{" "}
                  <Text style={{ fontSize: 13, fontWeight: "400" }}>
                    {" "}
                    / {p.unit.toLowerCase()}
                  </Text>
                </Text>
                <Text
                  style={{
                    color:
                      variant.availability === "OUT_OF_STOCK"
                        ? colors.error
                        : colors.successText,
                  }}
                >
                  {variant.availability.replaceAll("_", " ")}
                </Text>
                {variant.availableMilli !== undefined && (
                  <Text>
                    Available: {variant.availableMilli / 1000}{" "}
                    {p.unit.toLowerCase()}
                  </Text>
                )}
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  Quantity in {p.unit.toLowerCase()}. Final price and
                  availability are checked by the shop.
                </Text>
                <AddToCartControl
                  key={variant.id}
                  variant={variant}
                  unit={p.unit}
                  api={api}
                />
              </>
            ) : (
              <Text>No variants are currently available.</Text>
            )}
          </View>
          {p.freshnessInstructions && (
            <View>
              <Text style={{ fontWeight: "700" }}>Care & storage</Text>
              <Text>{p.freshnessInstructions}</Text>
            </View>
          )}
          {p.specifications && Object.keys(p.specifications).length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 17, fontWeight: "700" }}>
                Product information
              </Text>
              {Object.entries(p.specifications).map(([key, value]) => (
                <Text key={key}>
                  {key}:{" "}
                  {typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value)}
                </Text>
              ))}
            </View>
          )}
          {p.sku && <Text style={{ color: colors.muted }}>SKU: {p.sku}</Text>}
        </>
      )}
    </View>
  );
}
