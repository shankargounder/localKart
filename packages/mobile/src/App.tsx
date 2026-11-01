import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Linking,
  Platform,
  ActivityIndicator,
  Modal,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Location from "expo-location";

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { create } from "zustand";
import { loginSchema, money, lineTotal } from "@localkart/shared";
import { colors } from "@localkart/design-tokens";
import { useRouter, useLocalSearchParams } from "expo-router";
import { AppErrorBoundary } from "./v2/Components";
import { SmartDiscovery } from "./v2/Discovery";
import {
  CustomerExtras,
  FulfillmentSelector,
  OrderCustomerActions,
} from "./v2/Customer";
import {
  BusinessReports,
  OfflineBilling,
  ShopOperations,
  ProductMaintenance,
} from "./v2/Merchant";
import { BarcodeLookup } from "./live/BarcodeLookup";
import { MerchantDashboardCards } from "./live/MerchantDashboardCards";
import { BottomNavigation } from "./live/BottomNavigation";
import { ProductDetails } from "./live/ProductDetails";
import { AddToCartControl } from "./live/AddToCartControl";
import { IconButton } from "./live/IconButton";
import { useLiveOrders } from "./live/useLiveOrders";
import { IncomingBanner, NotificationDrawer } from "./live/NotificationCenter";
import { OrderDetails, AcceptOrderButton } from "./live/OrderDetails";
import {
  ProductPhoto,
  ProductGallery,
  MerchantPhotoUpload,
  selectProductImage,
} from "./live/ProductPhoto";
const client = new QueryClient();
const base =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "web"
    ? "http://localhost:4000/api/v1"
    : "http://10.0.2.2:4000/api/v1");
const useSession = create<{ session: any; set: (s: any) => void }>((set) => ({
  session: null,
  set: (session) => set({ session }),
}));
const storage = {
  get: async () =>
    Platform.OS === "web"
      ? sessionStorage.getItem("localkart")
      : SecureStore.getItemAsync("localkart"),
  set: async (v: string) => {
    if (Platform.OS === "web") sessionStorage.setItem("localkart", v);
    else await SecureStore.setItemAsync("localkart", v);
  },
  clear: async () => {
    if (Platform.OS === "web") sessionStorage.removeItem("localkart");
    else await SecureStore.deleteItemAsync("localkart");
  },
};
let refreshing: Promise<any> | null = null;
async function api(
  path: string,
  method = "GET",
  body?: any,
  key?: string,
  retry = true,
): Promise<any> {
  const session = useSession.getState().session;
  const multipart = typeof FormData !== "undefined" && body instanceof FormData;
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(!multipart ? { "Content-Type": "application/json" } : {}),
      ...(session ? { Authorization: "Bearer " + session.accessToken } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: multipart ? body : body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401 && session && retry) {
    refreshing ??= fetch(base + "/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("Session expired");
        const next = await r.json();
        await storage.set(JSON.stringify(next));
        useSession.getState().set(next);
      })
      .finally(() => {
        refreshing = null;
      });
    try {
      await refreshing;
      return api(path, method, body, key, false);
    } catch {
      await storage.clear();
      useSession.getState().set(null);
      throw new Error("Please log in again");
    }
  }
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(result.message || "Request failed");
  return result;
}
const notify = (message: string) =>
  Platform.OS === "web"
    ? globalThis.alert(message)
    : Alert.alert("LocalKart", message);
const Button = ({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: any) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ disabled }}
    disabled={disabled}
    style={[s.button, secondary && s.secondary, disabled && { opacity: 0.5 }]}
    onPress={onPress}
  >
    <Text style={[s.buttonText, secondary && { color: colors.text }]}>
      {title}
    </Text>
  </Pressable>
);
const Input = (props: any) => (
  <TextInput
    placeholderTextColor="#79877d"
    style={s.input}
    autoCapitalize="none"
    {...props}
  />
);
const Card = ({ children, style, testID }: any) => (
  <View testID={testID} style={[s.card, style]}>
    {children}
  </View>
);
const Heading = ({ children }: any) => (
  <Text style={s.heading}>{children}</Text>
);
function Login({ merchant }: any) {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const [register, setRegister] = useState(false);
  const [name, setName] = useState("");
  const [reset, setReset] = useState("");
  const submit = handleSubmit(async (values) => {
    try {
      const result = await api(
        register ? "/auth/register" : "/auth/login",
        "POST",
        {
          ...values,
          ...(register
            ? { name, role: merchant ? "MERCHANT" : "CUSTOMER" }
            : {}),
        },
      );
      if (result.user.role !== (merchant ? "MERCHANT" : "CUSTOMER"))
        throw new Error("Use the application for your account role");
      await storage.set(JSON.stringify(result));
      useSession.getState().set(result);
    } catch (e) {
      notify((e as Error).message);
    }
  });
  return (
    <ScrollView contentContainerStyle={s.login}>
      <Text style={s.brand}>
        LocalKart<Text style={{ color: colors.primary }}> ●</Text>
      </Text>
      <Heading>
        {merchant
          ? "Your shop. Your neighbourhood."
          : "Your local market, one app."}
      </Heading>
      <Text style={s.muted}>
        Find what you need nearby. Pick up or choose available delivery.
      </Text>
      <Card>
        <Heading>{register ? "Create your account" : "Welcome back"}</Heading>
        {register && (
          <Input placeholder="Your name" value={name} onChangeText={setName} />
        )}
        <Controller
          control={control}
          name="email"
          render={({ field }) => (
            <Input
              placeholder="Email address"
              keyboardType="email-address"
              value={field.value}
              onChangeText={field.onChange}
            />
          )}
        />
        {errors.email && <Text style={s.error}>{errors.email.message}</Text>}
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <Input
              placeholder="Password (10+ characters)"
              secureTextEntry
              value={field.value}
              onChangeText={field.onChange}
            />
          )}
        />
        {errors.password && (
          <Text style={s.error}>{errors.password.message}</Text>
        )}
        <Button
          title={
            isSubmitting
              ? "Please wait…"
              : register
                ? "Create account"
                : "Log in"
          }
          onPress={submit}
        />
        <Button
          secondary
          title={
            register ? "Already registered? Log in" : "New here? Create account"
          }
          onPress={() => setRegister(!register)}
        />
        <Button
          secondary
          title="Forgot password"
          onPress={handleSubmit(async (v) => {
            try {
              const r = await api("/auth/forgot-password", "POST", {
                email: v.email,
              });
              notify(
                r.developmentResetToken
                  ? "Development reset token: " + r.developmentResetToken
                  : r.message,
              );
            } catch (e) {
              notify((e as Error).message);
            }
          })}
        />
        <Input
          placeholder="Reset token (if requested)"
          value={reset}
          onChangeText={setReset}
        />
        {reset && (
          <Button
            title="Reset using password above"
            onPress={handleSubmit(async (v) => {
              try {
                await api("/auth/reset-password", "POST", {
                  token: reset,
                  password: v.password,
                });
                setReset("");
                notify("Password reset. Log in with your new password.");
              } catch (e) {
                notify((e as Error).message);
              }
            })}
          />
        )}
      </Card>
      <Text style={s.muted}>
        Pickup or delivery where available · Support local shops
      </Text>
    </ScrollView>
  );
}
function Main({ merchant }: any) {
  const qc = useQueryClient();
  const session = useSession((v) => v.session);
  const router = useRouter();
  const params = useLocalSearchParams();
  const tab =
    typeof params.tab === "string"
      ? params.tab
      : merchant
        ? "Dashboard"
        : "Home";
  const setTab = (tab: string) => router.setParams({ tab });
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [barcodeDraft, setBarcodeDraft] = useState<any>(null);
  const [productBrand, setProductBrand] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productLabel, setProductLabel] = useState("Standard");
  const dashboardFilter =
    typeof params.dashboardFilter === "string" ? params.dashboardFilter : "";
  const dashboardDetail = params.dashboardDetail === "sales";
  useEffect(() => {
    if (params.tab === "Notifications") {
      setNotificationsOpen(true);
      router.setParams({ tab: merchant ? "Dashboard" : "Home" });
    }
  }, [params.tab, merchant]);
  const [cartShopId, setCartShopId] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState("PICKUP");
  const [deliveryQuote, setDeliveryQuote] = useState<any>(null);
  const [packingPreferences, setPackingPreferences] = useState("");
  const [unit, setUnit] = useState("PIECE");
  const [shop, setShop] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState({ lat: 17.4483, lng: 78.3915 });
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [pendingLocation, setPendingLocation] = useState(location);
  const [manual, setManual] = useState("17.4483,78.3915");
  const [stockOnly, setStockOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [newName, setNewName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("20");
  const [address, setAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("PICKUP");
  const [checkoutKey, setCheckoutKey] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    const t = setTimeout(() => setLocation(pendingLocation), 500);
    return () => clearTimeout(t);
  }, [pendingLocation]);
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api("/categories"),
  });
  const shops = useQuery({
    queryKey: ["shops", debounced, category, location, 2],
    queryFn: () =>
      api(
        `/shops/nearby?lat=${location.lat}&lng=${location.lng}&radius=2&limit=100&q=${encodeURIComponent(debounced)}${category ? "&categoryId=" + category : ""}`,
      ),
    enabled: !merchant,
  });
  const owned = useQuery({
    queryKey: ["owned"],
    queryFn: () => api("/merchant/shops"),
    enabled: merchant,
  });
  const products = useQuery({
    queryKey: ["products", shop?.id, debounced, merchant, dashboardFilter],
    queryFn: async () => {
      if (merchant) {
        const result: any[] = [];
        for (let page = 1; ; page++) {
          const batch = await api(
            `/merchant/products?limit=100&page=${page}${dashboardFilter === "active" ? "&active=true" : ""}`,
          );
          result.push(...batch);
          if (batch.length < 100) return result;
        }
      }
      const rows: any[] = [];
      for (let page = 1; ; page++) {
        const batch = await api(
          `/shops/${shop.id}/products?q=${encodeURIComponent(debounced)}&limit=100&page=${page}`,
        );
        rows.push(...batch);
        if (batch.length < 100) return rows;
      }
    },
    enabled: merchant || !!shop,
  });
  const orders = useQuery({
    queryKey: ["orders", merchant ? dashboardFilter : ""],
    queryFn: async () => {
      const rows: any[] = [];
      for (let page = 1; ; page++) {
        const batch = await api(
          `/orders?limit=100&page=${page}${merchant && ["today", "pending", "preparing", "ready", "cancelled"].includes(dashboardFilter) ? "&dashboard=" + dashboardFilter : ""}`,
        );
        rows.push(...batch);
        if (batch.length < 100) return rows;
      }
    },
    refetchInterval: 5000,
  });
  const cart = useQuery({
    queryKey: ["cart"],
    queryFn: () => api("/cart"),
    enabled: !merchant,
  });
  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api("/merchant/dashboard"),
    enabled: merchant,
    refetchInterval: 10000,
  });
  const inventory = useQuery({
    queryKey: ["inventory", dashboardFilter],
    queryFn: async () => {
      const rows: any[] = [];
      for (let page = 1; ; page++) {
        const batch = await api(
          `/merchant/inventory?limit=100&page=${page}${dashboardFilter === "lowStock" ? "&lowStock=true" : ""}`,
        );
        rows.push(...batch);
        if (batch.length < 100) return rows;
      }
    },
    enabled: merchant,
  });
  const favorites = useQuery({
    queryKey: ["favorites"],
    queryFn: () => api("/customers/favorites"),
    enabled: !merchant,
  });
  const wishlist = useQuery({
    queryKey: ["wishlist"],
    queryFn: () => api("/customers/wishlist"),
    enabled: !merchant,
  });
  const shopSaved =
    favorites.data?.some((item: any) => item.shopId === shop?.id) || false;
  const selectedProductId =
    typeof params.productId === "string" ? params.productId : "";
  const selectedOrderId =
    typeof params.orderId === "string" ? params.orderId : "";
  const live = useLiveOrders({
    session,
    api,
    base,
    onOpen: (orderId: string) => {
      setNotificationsOpen(false);
      router.setParams({ tab: "Orders", orderId });
    },
  });
  const mutate = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const locate = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        notify("Enter latitude,longitude below to choose a locality manually.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      setUserLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
      setPendingLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
    } catch {
      notify("Location unavailable. Choose a locality manually.");
    }
  };
  const tabs = merchant
    ? ["Dashboard", "Orders", "Products", "Inventory", "Shop"]
    : ["Home", "Explore", "Orders", "Cart", "Profile"];
  const selectedCartShop = cartShopId || cart.data?.[0]?.variant.product.shopId;
  const cartItems = (cart.data || []).filter(
    (i: any) => i.variant.product.shopId === selectedCartShop,
  );
  useEffect(() => {
    setCheckoutKey("");
    setDeliveryQuote(null);
  }, [selectedCartShop]);
  const subtotal = (cartItems || []).reduce(
    (sum: number, item: any) =>
      sum + lineTotal(item.variant.pricePaise, item.quantity),
    0,
  );
  const loading = [
    shops,
    owned,
    products,
    orders,
    cart,
    dashboard,
    inventory,
  ].some((q) => q.isLoading);
  const failure = [
    shops,
    owned,
    products,
    orders,
    cart,
    dashboard,
    inventory,
  ].find((q) => q.error)?.error;
  return (
    <View style={s.root}>
      <View
        style={[
          s.top,
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={s.brand}>
            LocalKart<Text style={{ color: colors.primary }}> ●</Text>
          </Text>
          <Text style={[s.muted, { fontSize: 10 }]}>
            {merchant ? "MERCHANT WORKSPACE" : "YOUR NEIGHBOURHOOD, CLOSER"}
          </Text>
        </View>
        {
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Notifications (${live.counts.data?.unread || 0})`}
            accessibilityState={{ expanded: notificationsOpen }}
            onPress={() => setNotificationsOpen(true)}
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: colors.light,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View accessibilityElementsHidden style={{ width: 26, height: 30 }}>
              <View
                style={{
                  position: "absolute",
                  left: 5,
                  top: 3,
                  width: 16,
                  height: 19,
                  borderWidth: 2,
                  borderColor: colors.text,
                  borderTopLeftRadius: 10,
                  borderTopRightRadius: 10,
                  borderBottomLeftRadius: 3,
                  borderBottomRightRadius: 3,
                }}
              />
              <View
                style={{
                  position: "absolute",
                  left: 2,
                  top: 21,
                  width: 22,
                  height: 2,
                  backgroundColor: colors.text,
                  borderRadius: 2,
                }}
              />
              <View
                style={{
                  position: "absolute",
                  left: 10,
                  top: 25,
                  width: 6,
                  height: 3,
                  borderBottomLeftRadius: 4,
                  borderBottomRightRadius: 4,
                  backgroundColor: colors.text,
                }}
              />
            </View>
            {!!live.counts.data?.unread && (
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  minWidth: 19,
                  height: 19,
                  borderRadius: 10,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 4,
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: "800" }}>
                  {live.counts.data.unread > 99
                    ? "99+"
                    : live.counts.data.unread}
                </Text>
              </View>
            )}
          </Pressable>
        }
      </View>
      {
        <NotificationDrawer
          merchant={merchant}
          visible={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          live={live}
          api={api}
          mutate={mutate}
        />
      }
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.body}
      >
        <IncomingBanner live={live} />
        {busy && <ActivityIndicator color={colors.text} />}
        {loading && <Text style={s.muted}>Loading your neighbourhood…</Text>}
        {failure && (
          <Card>
            <Text style={s.error}>{(failure as Error).message}</Text>
            <Button title="Try again" onPress={() => qc.invalidateQueries()} />
          </Card>
        )}
        {!merchant &&
          ["Home", "Explore"].includes(tab) &&
          !shop &&
          !selectedProductId && (
            <>
              <View style={s.hero}>
                <Text style={s.eyebrow}>GOOD THINGS ARE NEARBY</Text>
                <Text style={s.heroTitle}>{"Shop local.\nPick up happy."}</Text>
                <Text style={s.muted}>
                  Discover your neighbourhood favourites.
                </Text>
              </View>
              <Input
                placeholder={
                  tab === "Home"
                    ? "Search nearby shops"
                    : "Search shops or products"
                }
                value={search}
                onChangeText={setSearch}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Button
                  secondary
                  title="All shops"
                  onPress={() => setCategory("")}
                />
                {categories.data?.map((c: any) => (
                  <Button
                    key={c.id}
                    secondary={category !== c.id}
                    title={c.name}
                    onPress={() => setCategory(c.id)}
                  />
                ))}
              </ScrollView>
              <Button secondary title="Use my location" onPress={locate} />
              <View style={s.row}>
                <Input
                  accessibilityLabel="Locality coordinates"
                  value={manual}
                  onChangeText={setManual}
                />
                <Button
                  title="Set locality"
                  onPress={() => {
                    const [lat, lng] = manual.split(",").map(Number);
                    if (
                      !Number.isFinite(lat) ||
                      !Number.isFinite(lng) ||
                      Math.abs(lat) > 85 ||
                      Math.abs(lng) > 180
                    ) {
                      notify("Enter valid latitude,longitude");
                      return;
                    }
                    setPendingLocation({ lat, lng });
                  }}
                />
              </View>
              <Text style={s.muted}>
                Near {location.lat.toFixed(3)}, {location.lng.toFixed(3)} · 2 km
                shop radius
              </Text>
              {tab === "Explore" && (
                <SmartDiscovery
                  userLocation={userLocation}
                  pending={search !== debounced}
                  map={tab === "Explore"}
                  onMove={setPendingLocation}
                  api={api}
                  base={base}
                  query={debounced}
                  location={location}
                  category={category}
                  onShop={(value: any) => {
                    setShop(value);
                    setSearch("");
                  }}
                />
              )}
              <Heading>Shops within 2 km</Heading>
              <Text style={s.muted}>
                Choose a local shop to browse its products. Distances are
                straight-line estimates.
              </Text>
              {shops.data?.length === 0 && (
                <Text>
                  No shops found within 2 km. Try another locality or category.
                </Text>
              )}
              {shops.data?.map((item: any) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={"Browse shop " + item.name}
                  onPress={() => {
                    setShop(item);
                    setSearch("");
                  }}
                >
                  <Card>
                    <Text style={s.eyebrow}>
                      {item.category.name.toUpperCase()}
                    </Text>
                    <Heading>{item.name}</Heading>
                    <Text style={s.muted}>{item.address}</Text>
                    <Text style={s.green}>
                      {item.distanceKm.toFixed(1)} km away
                    </Text>
                    <Text>
                      {item.open ? "Open" : "Closed"} ·{" "}
                      {item.acceptingOrders && !item.holidayMode
                        ? "Accepting pickup"
                        : "Pickup paused"}
                    </Text>
                    <Text style={{ color: colors.text, fontWeight: "700" }}>
                      Browse products →
                    </Text>
                  </Card>
                </Pressable>
              ))}
            </>
          )}
        {!merchant &&
          shop &&
          !selectedProductId &&
          ["Home", "Explore"].includes(tab) && (
            <>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <IconButton
                  icon="‹"
                  label="Back to all shops"
                  onPress={() => {
                    setShop(null);
                    setSearch("");
                  }}
                />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <IconButton
                    icon={shopSaved ? "♥" : "♡"}
                    label={
                      shopSaved ? "Remove favorite shop" : "Save favorite shop"
                    }
                    active={shopSaved}
                    disabled={busy || favorites.isLoading}
                    onPress={() =>
                      mutate(() =>
                        api(
                          "/customers/favorites/" + shop.id,
                          shopSaved ? "DELETE" : "PUT",
                        ),
                      )
                    }
                  />
                  <IconButton
                    icon="↗"
                    label="Directions to shop"
                    onPress={() =>
                      Linking.openURL(
                        `https://www.google.com/maps/dir/?api=1&destination=${shop.latitude},${shop.longitude}`,
                      )
                    }
                  />
                </View>
              </View>
              <View style={{ gap: 4 }}>
                <Heading>{shop.name}</Heading>
                <Text style={s.muted}>{shop.address}</Text>
                <Text style={s.muted}>
                  Estimated preparation · {shop.preparationMinutes} min
                </Text>
              </View>
              <Input
                placeholder="Search this catalogue"
                value={search}
                onChangeText={setSearch}
              />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <Text style={s.muted}>
                  {products.data?.length || 0} products
                </Text>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityLabel="In-stock products only"
                  accessibilityState={{ checked: stockOnly }}
                  onPress={() => setStockOnly(!stockOnly)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    minHeight: 48,
                    paddingHorizontal: 12,
                    borderRadius: 24,
                    backgroundColor: stockOnly
                      ? colors.light
                      : colors.background,
                    borderWidth: 1,
                    borderColor: stockOnly ? colors.primary : colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: colors.text,
                      fontWeight: "600",
                    }}
                  >
                    In stock
                  </Text>
                  <View
                    style={{
                      width: 30,
                      height: 18,
                      borderRadius: 10,
                      padding: 2,
                      backgroundColor: stockOnly
                        ? colors.primary
                        : colors.border,
                      alignItems: stockOnly ? "flex-end" : "flex-start",
                    }}
                  >
                    <View
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 7,
                        backgroundColor: colors.background,
                      }}
                    />
                  </View>
                </Pressable>
              </View>
              <View
                testID="shop-product-grid"
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                {products.data
                  ?.filter(
                    (p: any) =>
                      !stockOnly ||
                      p.variants.some(
                        (v: any) => v.availability !== "OUT_OF_STOCK",
                      ),
                  )
                  .map((p: any) => (
                    <Card
                      key={p.id}
                      testID={"shop-product-" + p.id}
                      style={{
                        width: "48%",
                        padding: 12,
                        marginVertical: 0,
                        minWidth: 0,
                      }}
                    >
                      <View style={{ position: "relative" }}>
                        <Pressable
                          accessibilityRole="link"
                          accessibilityLabel={"View product: " + p.name}
                          onPress={() => router.setParams({ productId: p.id })}
                        >
                          <ProductPhoto
                            image={selectProductImage(p.images)}
                            base={base}
                            height={140}
                          />
                        </Pressable>
                        <View
                          style={{ position: "absolute", top: 4, right: 4 }}
                        >
                          <IconButton
                            icon={
                              wishlist.data?.some(
                                (item: any) => item.productId === p.id,
                              )
                                ? "♥"
                                : "♡"
                            }
                            label={
                              (wishlist.data?.some(
                                (item: any) => item.productId === p.id,
                              )
                                ? "Remove from wishlist: "
                                : "Save to wishlist: ") + p.name
                            }
                            active={
                              wishlist.data?.some(
                                (item: any) => item.productId === p.id,
                              ) || false
                            }
                            disabled={busy || wishlist.isLoading}
                            onPress={() =>
                              mutate(() =>
                                api(
                                  "/customers/wishlist/" + p.id,
                                  wishlist.data?.some(
                                    (item: any) => item.productId === p.id,
                                  )
                                    ? "DELETE"
                                    : "PUT",
                                ),
                              )
                            }
                          />
                        </View>
                        <View
                          style={{ position: "absolute", bottom: 4, left: 4 }}
                        >
                          <ProductGallery
                            compact
                            images={p.images}
                            base={base}
                          />
                        </View>
                      </View>
                      <Pressable
                        accessibilityRole="link"
                        accessibilityLabel={"Product details: " + p.name}
                        onPress={() => router.setParams({ productId: p.id })}
                      >
                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: "700",
                            color: colors.text,
                          }}
                        >
                          {p.name}
                        </Text>
                      </Pressable>
                      <Text numberOfLines={2} style={s.muted}>
                        {p.description}
                      </Text>
                      {p.variants
                        .filter(
                          (v: any) =>
                            !stockOnly || v.availability !== "OUT_OF_STOCK",
                        )
                        .map((v: any) => (
                          <View key={v.id}>
                            <Text>
                              {v.label} · {money(v.pricePaise)} /{" "}
                              {p.unit.toLowerCase()}
                            </Text>
                            <Text style={s.green}>
                              {v.availability.replaceAll("_", " ")}
                            </Text>
                            <AddToCartControl
                              variant={v}
                              unit={p.unit}
                              api={api}
                            />
                          </View>
                        ))}
                    </Card>
                  ))}
              </View>
              {products.data?.length === 0 && (
                <Text>No products match your search.</Text>
              )}
            </>
          )}
        {!merchant &&
          selectedProductId &&
          ["Home", "Explore"].includes(tab) && (
            <ProductDetails
              key={selectedProductId}
              productId={selectedProductId}
              api={api}
              base={base}
              wishlist={wishlist}
              mutate={mutate}
              onBack={(value: any) => {
                if (value) setShop(value);
                setSearch("");
                router.setParams({ productId: "" });
              }}
            />
          )}
        {!merchant && tab === "Cart" && (
          <>
            <View style={{ gap: 4 }}>
              <Heading>Your shop baskets</Heading>
              <Text style={s.muted}>
                Review your items and choose how to receive your order.
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {Array.from(
                new Set(
                  (cart.data || []).map((i: any) => i.variant.product.shopId),
                ),
              ).map((id: any) => (
                <Button
                  key={id}
                  secondary={selectedCartShop !== id}
                  title={
                    cart.data?.find(
                      (item: any) => item.variant.product.shopId === id,
                    )?.variant.product.shop?.name || "Shop basket"
                  }
                  onPress={() => setCartShopId(id)}
                />
              ))}
            </ScrollView>
            <Text style={s.muted}>
              One shop per order. Final prices and availability are checked by
              the shop server.
            </Text>
            <View style={{ gap: 12 }}>
              {cartItems?.map((item: any) => (
                <Card
                  key={item.id}
                  testID={"cart-item-" + item.id}
                  style={{ marginVertical: 0, padding: 14 }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 12,
                      alignItems: "flex-start",
                    }}
                  >
                    <View style={{ width: 72 }}>
                      <ProductPhoto
                        image={selectProductImage(item.variant.product.images)}
                        base={base}
                        height={76}
                      />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "700",
                          color: colors.text,
                        }}
                      >
                        {item.variant.product.name}
                      </Text>
                      <Text style={s.muted}>
                        {item.variant.label} · {money(item.variant.pricePaise)}{" "}
                        / {item.variant.product.unit.toLowerCase()}
                      </Text>
                      <Text style={{ fontSize: 16, fontWeight: "800" }}>
                        {money(
                          lineTotal(item.variant.pricePaise, item.quantity),
                        )}
                      </Text>
                    </View>
                    <IconButton
                      icon="⌫"
                      label={"Remove " + item.variant.product.name}
                      disabled={busy}
                      onPress={() =>
                        mutate(() => api("/cart/items/" + item.id, "DELETE"))
                      }
                    />
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: 4,
                    }}
                  >
                    <Text style={s.muted}>
                      {item.variant.product.unit.toLowerCase()}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 24,
                      }}
                    >
                      <IconButton
                        icon="−"
                        label={
                          "Decrease quantity of " + item.variant.product.name
                        }
                        disabled={busy}
                        onPress={() =>
                          mutate(() =>
                            api(
                              "/cart/items/" + item.id,
                              item.quantity <= 1000 ? "DELETE" : "PATCH",
                              { quantity: item.quantity - 1000 },
                            ),
                          )
                        }
                      />
                      <Text
                        accessibilityLabel={"Quantity " + item.quantity / 1000}
                        style={{
                          fontWeight: "800",
                          minWidth: 20,
                          textAlign: "center",
                        }}
                      >
                        {item.quantity / 1000}
                      </Text>
                      <IconButton
                        icon="+"
                        label={
                          "Increase quantity of " + item.variant.product.name
                        }
                        disabled={busy}
                        onPress={() =>
                          mutate(() =>
                            api("/cart/items/" + item.id, "PATCH", {
                              quantity: item.quantity + 1000,
                            }),
                          )
                        }
                      />
                    </View>
                  </View>
                </Card>
              ))}
            </View>
            {cartItems?.length > 0 && (
              <Card>
                <Text style={{ fontSize: 18, fontWeight: "800" }}>
                  Order summary
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={s.muted}>
                    {cartItems.length}{" "}
                    {cartItems.length === 1 ? "item" : "items"} · Subtotal
                  </Text>
                  <Text style={{ fontWeight: "700" }}>{money(subtotal)}</Text>
                </View>
              </Card>
            )}
            {!cartItems?.length ? (
              <Card>
                <Text style={{ fontSize: 20, fontWeight: "700" }}>
                  Your basket is empty
                </Text>
                <Text style={s.muted}>
                  Browse local shops and add something you need.
                </Text>
                <Button
                  title="Browse nearby shops"
                  onPress={() =>
                    router.setParams({
                      tab: "Home",
                      productId: "",
                      orderId: "",
                    })
                  }
                />
              </Card>
            ) : (
              <>
                <FulfillmentSelector
                  api={api}
                  mutate={mutate}
                  shopId={selectedCartShop}
                  type={fulfillmentType}
                  onType={setFulfillmentType}
                  quote={deliveryQuote}
                  onQuote={setDeliveryQuote}
                />
                <Input
                  placeholder="Packing preferences (optional)"
                  value={packingPreferences}
                  onChangeText={setPackingPreferences}
                />
                <Heading>
                  Total{" "}
                  {money(
                    subtotal +
                      (fulfillmentType === "DELIVERY"
                        ? deliveryQuote?.feePaise || 0
                        : 0),
                  )}
                </Heading>
                <Text>
                  Payment:{" "}
                  {paymentMethod === "SIMULATED"
                    ? "SIMULATED testing only"
                    : fulfillmentType === "DELIVERY"
                      ? "Cash on delivery (if enabled)"
                      : "Pay at pickup"}
                </Text>
                <Button
                  secondary
                  title="Toggle pickup / simulated payment"
                  onPress={() =>
                    setPaymentMethod(
                      paymentMethod === "PICKUP" ? "SIMULATED" : "PICKUP",
                    )
                  }
                />
                <Button
                  title="Place order"
                  onPress={() =>
                    mutate(async () => {
                      const key =
                        checkoutKey ||
                        `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                      setCheckoutKey(key);
                      const placed = await api(
                        "/orders",
                        "POST",
                        {
                          shopId: cartItems[0].variant.product.shopId,
                          fulfillmentType,
                          quoteId:
                            fulfillmentType === "DELIVERY"
                              ? deliveryQuote?.id
                              : undefined,
                          packingPreferences,
                          paymentMethod:
                            paymentMethod === "SIMULATED"
                              ? "SIMULATED"
                              : fulfillmentType === "DELIVERY"
                                ? "COD"
                                : "PICKUP",
                          items: cartItems.map((i: any) => ({
                            variantId: i.variantId,
                            quantity: i.quantity,
                          })),
                        },
                        key,
                      );
                      setCheckoutKey("");
                      router.setParams({ tab: "Orders", orderId: placed.id });
                    })
                  }
                />
              </>
            )}
          </>
        )}
        {merchant && dashboardFilter && tab !== "Dashboard" && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <IconButton
              icon="‹"
              label="Back to dashboard"
              onPress={() =>
                router.setParams({
                  tab: "Dashboard",
                  dashboardFilter: "",
                  dashboardDetail: "",
                  orderId: "",
                })
              }
            />
            <Text style={s.muted}>Dashboard details</Text>
          </View>
        )}
        {tab === "Orders" && !selectedOrderId && (
          <>
            <Heading>
              {merchant
                ? (
                    {
                      today: "Today’s orders",
                      pending: "New orders today",
                      preparing: "Preparing today",
                      ready: "Ready orders today",
                      cancelled: "Cancelled orders today",
                    } as Record<string, string>
                  )[dashboardFilter] || "Manage orders"
                : "Your orders"}
            </Heading>
            <Text style={s.muted}>Automatically refreshed every 5 seconds</Text>
            {!orders.data?.length && <Text>No orders yet.</Text>}
            {orders.data?.map((o: any) => (
              <Card key={o.id}>
                <IconButton
                  icon="↗"
                  label="Open order details"
                  onPress={() =>
                    router.setParams({ tab: "Orders", orderId: o.id })
                  }
                />
                <Text style={s.eyebrow}>{o.status.replaceAll("_", " ")}</Text>
                <Heading>
                  {o.shop.name} · {money(o.totalPaise)}
                </Heading>
                <Text style={s.muted}>
                  #{o.id.slice(0, 8)} · {o.fulfillmentType} ·{" "}
                  {o.payment?.status}
                </Text>
                {o.items.map((i: any) => (
                  <Text key={i.id}>
                    {i.quantity / 1000} × {i.name}
                  </Text>
                ))}
                {o.history.map((h: any) => (
                  <Text key={h.id} style={s.muted}>
                    ✓ {h.status.replaceAll("_", " ")}
                  </Text>
                ))}
                {o.pickupCode && (
                  <>
                    <Text>
                      {o.fulfillmentType === "DELIVERY"
                        ? "Give this code only after receiving your order"
                        : "Your pickup code"}
                    </Text>
                    <Text style={s.heroTitle}>{o.pickupCode}</Text>
                  </>
                )}
                {o.delivery && (
                  <Text style={s.muted}>
                    {o.delivery.provider === "MOCK"
                      ? "SIMULATED DELIVERY · "
                      : ""}
                    {o.delivery.status} ·{" "}
                    {o.delivery.riderName || "Awaiting dispatcher"} · Delivery
                    charge {money(o.deliveryFeePaise)}
                  </Text>
                )}
                {!merchant && (
                  <OrderCustomerActions api={api} mutate={mutate} order={o} />
                )}
                {!merchant &&
                  ["PENDING_ACCEPTANCE", "ACCEPTED"].includes(o.status) && (
                    <Button
                      secondary
                      title="Cancel order"
                      onPress={() =>
                        mutate(() => api("/orders/" + o.id + "/cancel", "POST"))
                      }
                    />
                  )}{" "}
                {!merchant &&
                  o.payment?.method === "SIMULATED" &&
                  o.payment.status === "UNPAID" &&
                  [
                    "ACCEPTED",
                    "PREPARING",
                    "READY_FOR_PICKUP",
                    "AWAITING_RIDER",
                    "RIDER_ASSIGNED",
                  ].includes(o.status) && (
                    <Button
                      title="Run simulated test payment"
                      onPress={() =>
                        mutate(() =>
                          api("/payments/create", "POST", { orderId: o.id }),
                        )
                      }
                    />
                  )}{" "}
                {merchant && o.status === "PENDING_ACCEPTANCE" && (
                  <>
                    <AcceptOrderButton order={o} api={api} mutate={mutate} />
                    <Button
                      secondary
                      title="Reject: unavailable"
                      onPress={() =>
                        mutate(() =>
                          api(`/merchant/orders/${o.id}/reject`, "POST", {
                            reason: "Items unavailable at the shop",
                          }),
                        )
                      }
                    />
                  </>
                )}
                {merchant && o.status === "ACCEPTED" && (
                  <Button
                    title="Start preparing"
                    onPress={() =>
                      mutate(() =>
                        api(`/merchant/orders/${o.id}/preparing`, "POST"),
                      )
                    }
                  />
                )}{" "}
                {merchant && o.status === "PREPARING" && (
                  <Button
                    title={
                      o.fulfillmentType === "DELIVERY"
                        ? "Ready · Request rider"
                        : "Ready for pickup"
                    }
                    onPress={() =>
                      mutate(() =>
                        api(`/merchant/orders/${o.id}/ready`, "POST"),
                      )
                    }
                  />
                )}{" "}
                {merchant && o.status === "READY_FOR_PICKUP" && (
                  <>
                    <Input
                      placeholder="6-digit customer pickup code"
                      keyboardType="number-pad"
                      maxLength={6}
                      value={code}
                      onChangeText={setCode}
                    />
                    <Button
                      title={
                        o.payment.method === "PICKUP"
                          ? "Payment collected · Verify & complete"
                          : "Verify & complete"
                      }
                      onPress={() =>
                        mutate(() =>
                          api(`/merchant/orders/${o.id}/complete`, "POST", {
                            code,
                            collected: true,
                          }),
                        )
                      }
                    />
                  </>
                )}
              </Card>
            ))}
          </>
        )}
        {merchant && tab === "Dashboard" && (
          <>
            <View style={{ gap: 6, paddingVertical: 4 }}>
              <Text style={{ fontSize: 12, color: colors.muted }}>
                YOUR SHOP, TODAY
              </Text>
              <Text
                style={{ fontSize: 28, fontWeight: "800", color: colors.text }}
              >
                Hello, {session.user.name.split(" ")[0]}.
              </Text>
              <Text style={s.muted}>Here's what's happening in your shop.</Text>
            </View>
            {dashboardDetail ? (
              <>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <IconButton
                    icon="‹"
                    label="Back to dashboard"
                    onPress={() => router.setParams({ dashboardDetail: "" })}
                  />
                  <Heading>Today's sales details</Heading>
                </View>
                <BusinessReports key="today-sales" initialDays={1} api={api} />
              </>
            ) : (
              <>
                <MerchantDashboardCards
                  data={dashboard.data}
                  onSelect={(key: string) => {
                    if (key === "salesPaise") {
                      router.setParams({ dashboardDetail: "sales" });
                      return;
                    }
                    const target =
                      key === "totalProducts"
                        ? "Products"
                        : key === "lowStock"
                          ? "Inventory"
                          : "Orders";
                    const filter = (
                      {
                        todayOrders: "today",
                        pending: "pending",
                        preparing: "preparing",
                        ready: "ready",
                        cancelled: "cancelled",
                        totalProducts: "active",
                        lowStock: "lowStock",
                      } as Record<string, string>
                    )[key];
                    router.setParams({
                      tab: target,
                      dashboardFilter: filter,
                      orderId: "",
                      productId: "",
                      dashboardDetail: "",
                    });
                  }}
                />
                <BusinessReports api={api} />
              </>
            )}
            <Heading>Your shops</Heading>
            {owned.data?.map((o: any) => (
              <Card key={o.id}>
                <Heading>{o.name}</Heading>
                <Text>{o.approval}</Text>
                <Button
                  secondary
                  title={
                    o.acceptingOrders
                      ? "Pause pickup orders"
                      : "Resume pickup orders"
                  }
                  onPress={() =>
                    mutate(() =>
                      api("/merchant/shops/" + o.id, "PATCH", {
                        acceptingOrders: !o.acceptingOrders,
                      }),
                    )
                  }
                />
              </Card>
            ))}
            {owned.data?.length === 0 && (
              <>
                <Heading>Register your shop</Heading>
                <Input
                  placeholder="Shop name"
                  value={newName}
                  onChangeText={setNewName}
                />
                <Input
                  placeholder="Address"
                  value={address}
                  onChangeText={setAddress}
                />
                <Input
                  placeholder="Latitude,longitude"
                  value={manual}
                  onChangeText={setManual}
                />
                <Text>Select category</Text>
                {categories.data?.map((c: any) => (
                  <Button
                    secondary={category !== c.id}
                    key={c.id}
                    title={c.name}
                    onPress={() => setCategory(c.id)}
                  />
                ))}
                <Button
                  title="Submit for admin approval"
                  onPress={() =>
                    mutate(() => {
                      const [latitude, longitude] = manual
                        .split(",")
                        .map(Number);
                      return api("/merchant/shops", "POST", {
                        name: newName,
                        address,
                        categoryId: category,
                        latitude,
                        longitude,
                      });
                    })
                  }
                />
              </>
            )}
          </>
        )}
        {merchant && tab === "Products" && (
          <>
            <Heading>
              {dashboardFilter === "active"
                ? "Active products"
                : "Your catalogue"}
            </Heading>
            <Modal
              visible={addProductOpen}
              transparent
              animationType="fade"
              onRequestClose={() => setAddProductOpen(false)}
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
                    maxHeight: "90%",
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
                    <Heading>Add product</Heading>
                    <IconButton
                      icon="×"
                      label="Close add product"
                      onPress={() => setAddProductOpen(false)}
                    />
                  </View>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ gap: 12, paddingVertical: 12 }}
                  >
                    <BarcodeLookup
                      api={api}
                      shopId={owned.data?.[0]?.id}
                      onResult={(result: any) => {
                        setBarcodeDraft(result);
                        if (result.product) {
                          setNewName(result.product.name);
                          setProductBrand(result.product.brand || "");
                          setProductDescription(
                            result.product.description || "",
                          );
                          setProductLabel(result.product.label || "Standard");
                          setPrice("");
                        }
                      }}
                    />
                    {barcodeDraft && (
                      <Text style={s.muted}>
                        Barcode: {barcodeDraft.barcode}
                      </Text>
                    )}
                    <ScrollView horizontal>
                      {[
                        "PIECE",
                        "PACKET",
                        "KILOGRAM",
                        "GRAM",
                        "MILLILITER",
                        "LITER",
                      ].map((u) => (
                        <Button
                          secondary={unit !== u}
                          title={u}
                          key={u}
                          onPress={() => setUnit(u)}
                        />
                      ))}
                    </ScrollView>
                    <Input
                      placeholder="New product name"
                      value={newName}
                      onChangeText={setNewName}
                    />
                    <Input
                      placeholder="Brand (optional)"
                      value={productBrand}
                      onChangeText={setProductBrand}
                    />
                    <Input
                      placeholder="Product description (optional)"
                      value={productDescription}
                      onChangeText={setProductDescription}
                    />
                    <Input
                      placeholder="Pack or variant label"
                      value={productLabel}
                      onChangeText={setProductLabel}
                    />
                    <Input
                      placeholder="Price in INR"
                      keyboardType="decimal-pad"
                      value={price}
                      onChangeText={setPrice}
                    />
                    <Input
                      placeholder="Stock (pieces)"
                      keyboardType="number-pad"
                      value={stock}
                      onChangeText={setStock}
                    />
                    <Button
                      title="Create product in first shop"
                      disabled={
                        !!barcodeDraft?.existing || !!barcodeDraft?.pending
                      }
                      onPress={() =>
                        mutate(async () => {
                          await api(
                            `/merchant/shops/${owned.data?.[0]?.id}/products`,
                            "POST",
                            {
                              name: newName,
                              brand: productBrand,
                              description: productDescription,
                              label: productLabel,
                              barcode: barcodeDraft?.barcode,
                              catalogSource:
                                barcodeDraft?.product?.source || "MANUAL",
                              categoryId: owned.data?.[0]?.categoryId,
                              unit,
                              pricePaise: Math.round(Number(price) * 100),
                              stockMilli: Math.round(Number(stock) * 1000),
                            },
                          );
                          setAddProductOpen(false);
                        })
                      }
                    />
                  </ScrollView>
                </View>
              </View>
            </Modal>
            {products.data?.map((p: any) => (
              <Card key={p.id}>
                <ProductPhoto
                  image={selectProductImage(p.images)}
                  base={base}
                />
                <Heading>{p.name}</Heading>
                <Text style={{ fontWeight: "700" }}>
                  {p.variants.map((v: any) => money(v.pricePaise)).join(" / ")}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <ProductGallery compact images={p.images} base={base} />
                  <MerchantPhotoUpload
                    api={api}
                    mutate={mutate}
                    compact
                    productId={p.id}
                  />
                  <ProductMaintenance
                    compact
                    api={api}
                    mutate={mutate}
                    product={p}
                  />
                  <IconButton
                    icon={p.active ? "▣" : "↶"}
                    label={p.active ? "Archive product" : "Restore product"}
                    disabled={busy}
                    onPress={() =>
                      mutate(() =>
                        api("/merchant/products/" + p.id, "PATCH", {
                          active: !p.active,
                        }),
                      )
                    }
                  />
                </View>
              </Card>
            ))}
          </>
        )}
        {merchant && tab === "Inventory" && (
          <>
            <Heading>
              {dashboardFilter === "lowStock"
                ? "Low-stock inventory"
                : "Stock control"}
            </Heading>
            <OfflineBilling
              api={api}
              mutate={mutate}
              inventory={inventory.data}
            />
            <Text style={s.muted}>
              Record offline sales here to keep stock accurate. Reserved stock
              cannot be consumed by adjustments.
            </Text>
            <Input
              placeholder="Adjustment quantity in units (e.g. -2)"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="numbers-and-punctuation"
            />
            {inventory.data?.map((i: any) => (
              <Card key={i.variantId}>
                <Heading>{i.variant.product.name}</Heading>
                <Text>
                  On hand {i.onHand / 1000} · Reserved {i.reserved / 1000} ·
                  Available {(i.onHand - i.reserved) / 1000}
                </Text>
                <IconButton
                  icon="↶"
                  label="Record stock adjustment"
                  onPress={() =>
                    mutate(() =>
                      api("/merchant/inventory/adjustments", "POST", {
                        variantId: i.variantId,
                        delta: Math.round(Number(quantity) * 1000),
                        reason:
                          "Merchant recorded offline sale or stock correction",
                      }),
                    )
                  }
                />
              </Card>
            ))}
          </>
        )}
        {(tab === "Profile" || (merchant && tab === "Shop")) && (
          <>
            {merchant ? (
              <ShopOperations api={api} mutate={mutate} shops={owned.data} />
            ) : (
              <CustomerExtras
                api={api}
                mutate={mutate}
                onShop={(value: any) => {
                  setShop(value);
                  setTab("Home");
                }}
              />
            )}
            <Heading>{session.user.name}</Heading>
            <Text>{session.user.email}</Text>
            <Input
              placeholder="Update your name"
              value={newName}
              onChangeText={setNewName}
            />
            <Button
              title="Save profile"
              onPress={() =>
                mutate(async () => {
                  const user = await api("/users/me", "PATCH", {
                    name: newName,
                  });
                  const next = { ...session, user };
                  await storage.set(JSON.stringify(next));
                  useSession.getState().set(next);
                })
              }
            />

            <Button
              secondary
              title="Log out"
              onPress={() =>
                mutate(async () => {
                  await live.disablePush();
                  await api("/auth/logout", "POST", {
                    refreshToken: session.refreshToken,
                  });
                  await storage.clear();
                  useSession.getState().set(null);
                  qc.clear();
                })
              }
            />
          </>
        )}
        {tab === "Orders" && selectedOrderId && (
          <OrderDetails
            orderId={selectedOrderId}
            userId={session.user.id}
            merchant={merchant}
            api={api}
            mutate={mutate}
            base={base}
            offset={live.offset}
            onClose={() => router.setParams({ orderId: "" })}
          />
        )}
        <Text style={s.footer}>LocalKart · Your local market, one app</Text>
      </ScrollView>
      {merchant && tab === "Products" && !addProductOpen && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add product"
          onPress={() => {
            setBarcodeDraft(null);
            setProductBrand("");
            setProductDescription("");
            setProductLabel("Standard");
            setNewName("");
            setPrice("");
            setStock("0");
            setAddProductOpen(true);
          }}
          style={{
            position: "absolute",
            right: 20,
            bottom: 94,
            zIndex: 10,
            minHeight: 56,
            paddingHorizontal: 20,
            borderRadius: 28,
            backgroundColor: colors.primary,
            flexDirection: "row",
            gap: 10,
            alignItems: "center",
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 8,
            elevation: 6,
          }}
        >
          <Text style={{ fontSize: 28 }}>+</Text>
          <Text style={{ fontWeight: "800" }}>Add product</Text>
        </Pressable>
      )}
      <BottomNavigation
        tabs={tabs}
        selected={tab}
        cartCount={cart.data?.length || 0}
        orderCount={merchant ? live.counts.data?.incomingOrders || 0 : 0}
        onSelect={(t: string) => {
          router.setParams({
            tab: t,
            orderId: "",
            productId: "",
            dashboardFilter: "",
            dashboardDetail: "",
          });
          setShop(null);
          setSearch("");
        }}
      />
    </View>
  );
}
function Root({ merchant }: any) {
  const session = useSession((v) => v.session);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    storage
      .get()
      .then((value) => {
        if (value)
          try {
            useSession.getState().set(JSON.parse(value));
          } catch {
            void storage.clear();
          }
      })
      .finally(() => setLoaded(true));
  }, []);
  if (!loaded) return <ActivityIndicator />;
  return session ? <Main merchant={merchant} /> : <Login merchant={merchant} />;
}
export default function LocalKart({ merchant = false }) {
  return (
    <QueryClientProvider client={client}>
      <AppErrorBoundary>
        <Root merchant={merchant} />
      </AppErrorBoundary>
    </QueryClientProvider>
  );
}
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingTop: Platform.OS === "android" ? 32 : 0,
  },
  top: {
    padding: 20,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  brand: {
    fontSize: 28,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -1,
  },
  body: {
    padding: 18,
    paddingBottom: 30,
    gap: 12,
    maxWidth: 900,
    width: "100%",
    alignSelf: "center",
  },
  login: {
    padding: 24,
    gap: 22,
    backgroundColor: colors.surface,
    flexGrow: 1,
    justifyContent: "center",
    maxWidth: 600,
    width: "100%",
    alignSelf: "center",
  },
  hero: {
    backgroundColor: colors.light,
    padding: 24,
    borderRadius: 24,
    gap: 12,
  },
  heroTitle: {
    fontSize: 38,
    fontWeight: "800",
    color: colors.text,
    lineHeight: 43,
  },
  eyebrow: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  heading: {
    fontSize: 21,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 6,
  },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  green: { color: colors.successText, fontWeight: "700" },
  error: { color: colors.error },
  card: {
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: 5,
    gap: 8,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    minHeight: 48,
    marginVertical: 4,
    flexShrink: 1,
  },
  button: {
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    margin: 3,
  },
  secondary: { backgroundColor: colors.light },
  buttonText: { color: colors.text, fontWeight: "700", fontSize: 14 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  nav: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingBottom: 20,
    paddingTop: 15,
  },
  navItem: { flex: 1, alignItems: "center", minHeight: 44 },
  navText: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  footer: {
    textAlign: "center",
    color: colors.muted,
    fontSize: 12,
    marginTop: 20,
  },
});
