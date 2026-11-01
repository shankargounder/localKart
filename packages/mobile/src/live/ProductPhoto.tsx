import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Linking,
  Platform,
  Modal,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { IconButton } from "./IconButton";
import { colors } from "@localkart/design-tokens";
import { AppButton, Section, Collapsible } from "../v2/Components";
export function selectProductImage(images: any[] = []) {
  return images.find((i) => !i.isDemo) || images[0];
}
export function mediaUrl(url: string | undefined, base: string) {
  return !url
    ? null
    : url.startsWith("/media/")
      ? base.replace(/\/api\/v1\/?$/, "") + url
      : /^https?:\/\//.test(url)
        ? url
        : null;
}
export function ProductPhoto({ image, base, height = 150 }: any) {
  const uri = mediaUrl(image?.url, base);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(!!uri);
  useEffect(() => {
    setFailed(false);
    setLoading(!!uri);
  }, [uri]);
  return (
    <View
      style={{
        width: "100%",
        height,
        backgroundColor: colors.surface,
        borderRadius: 14,
        overflow: "hidden",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {uri && !failed ? (
        <>
          <Image
            source={{ uri }}
            accessibilityLabel={image.alt || "Product photograph"}
            style={{ width: "100%", height: "100%" }}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={150}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setFailed(true);
              setLoading(false);
            }}
          />
          {loading && (
            <ActivityIndicator
              style={{ position: "absolute" }}
              color={colors.text}
            />
          )}
        </>
      ) : (
        <Text style={{ color: colors.muted }}>
          {failed ? "Photo unavailable" : "No product photo yet"}
        </Text>
      )}
    </View>
  );
}
export function ProductGallery({ images = [], base, compact = false }: any) {
  const [open, setOpen] = useState(false);
  if (compact)
    return images.length ? (
      <>
        <IconButton
          icon="ⓘ"
          label="Product photos and image credits"
          onPress={() => setOpen(true)}
        />
        <Modal
          visible={open}
          transparent
          animationType="fade"
          onRequestClose={() => setOpen(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "#10182888",
              justifyContent: "center",
              padding: 20,
            }}
          >
            <View
              style={{
                backgroundColor: colors.background,
                borderRadius: 20,
                padding: 16,
                maxHeight: "85%",
                maxWidth: 520,
                width: "100%",
                alignSelf: "center",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    color: colors.text,
                  }}
                >
                  Photos & credits
                </Text>
                <IconButton
                  icon="×"
                  label="Close product photos"
                  onPress={() => setOpen(false)}
                />
              </View>
              <ScrollView>
                {images.map((image: any) => (
                  <Section key={image.id || image.url}>
                    <ProductPhoto image={image} base={base} height={220} />
                    <Text>
                      {image.isDemo
                        ? "Generic demo photo — not a verified brand or SKU image"
                        : "Merchant-supplied photograph"}
                    </Text>
                    <Text>{image.credit}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      {image.license}
                    </Text>
                    {image.sourceUrl && (
                      <AppButton
                        secondary
                        title="View image source & usage license"
                        onPress={() => Linking.openURL(image.sourceUrl)}
                      />
                    )}
                  </Section>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </>
    ) : null;
  return images.length ? (
    <>
      <AppButton
        secondary
        title={open ? "Hide photos & credits" : "Photos & image credits"}
        onPress={() => setOpen(!open)}
      />
      {open &&
        images.map((image: any) => (
          <Section key={image.id || image.url}>
            <ProductPhoto image={image} base={base} height={240} />
            <Text>
              {image.isDemo
                ? "Generic demo photo — not a verified brand or SKU image"
                : "Merchant-supplied photograph"}
            </Text>
            {image.credit && <Text>{image.credit}</Text>}
            {image.license && (
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {image.license}
              </Text>
            )}
            {image.sourceUrl && (
              <AppButton
                secondary
                title="View image source & usage license"
                onPress={() => Linking.openURL(image.sourceUrl)}
              />
            )}
          </Section>
        ))}
    </>
  ) : null;
}
export function MerchantPhotoUpload({
  api,
  mutate,
  productId,
  compact = false,
}: any) {
  const [rights, setRights] = useState(false);
  return (
    <Collapsible compact={compact} icon="↑" title="Upload product photo">
      <AppButton
        secondary
        title={
          (rights ? "☑ " : "☐ ") + "I have permission to use the product photo"
        }
        onPress={() => setRights(!rights)}
      />
      <AppButton
        title="Upload product photo"
        disabled={!rights}
        onPress={() =>
          mutate(async () => {
            if (Platform.OS !== "web") {
              const permission =
                await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (!permission.granted)
                throw new Error("Photo library access was not granted");
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              quality: 0.9,
              allowsMultipleSelection: false,
            });
            if (result.canceled) return;
            const asset = result.assets[0];
            const form = new FormData();
            if (Platform.OS === "web") {
              const file =
                asset.file || (await (await fetch(asset.uri)).blob());
              form.append("image", file, asset.fileName || "product.jpg");
            } else
              form.append("image", {
                uri: asset.uri,
                name: asset.fileName || "product.jpg",
                type: asset.mimeType || "image/jpeg",
              } as any);
            form.append("rightsConfirmed", "true");
            await api(
              "/merchant/products/" + productId + "/images",
              "POST",
              form,
            );
          })
        }
      />
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        JPEG, PNG or WebP · up to 5 MB. Images are resized and location metadata
        is removed.
      </Text>
    </Collapsible>
  );
}
