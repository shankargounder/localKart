const projectId =
  process.env.EXPO_CUSTOMER_PROJECT_ID ||
  "f552bb60-e05f-4007-89fd-8c3911b8a368";
import demoConfig from "../../scripts/native-demo-config.cjs";
const { validateDemoBuild } = demoConfig;
validateDemoBuild("customer", projectId, process.env.GOOGLE_SERVICES_JSON);
export default {
  expo: {
    name: "LocalKart",
    owner: "shankar33",
    slug: "localkart-customer",
    scheme: "localkart",
    version: "0.1.0",
    extra: {
      ...(projectId ? { eas: { projectId } } : {}),
      notificationTestDevice: process.env.LOCALKART_TEST_DEVICE === "true",
    },
    orientation: "portrait",
    userInterfaceStyle: "light",
    android: {
      package: "in.localkart.customer",
      ...(process.env.GOOGLE_SERVICES_JSON
        ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
        : {}),
      config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY || "" } },
    },
    ios: { bundleIdentifier: "in.localkart.customer", supportsTablet: true },
    plugins: [
      "expo-router",
      "expo-secure-store",
      [
        "expo-location",
        {
          locationWhenInUsePermission: "Find shops near your chosen location.",
        },
      ],
      ["expo-notifications", { color: "#FFC400", defaultChannel: "orders" }],
      [
        "expo-image-picker",
        {
          photosPermission:
            "Choose a product photograph you have permission to use.",
          cameraPermission: false,
          microphonePermission: false,
        },
      ],
      [
        "expo-build-properties",
        {
          android: {
            usesCleartextTraffic: process.env.LOCALKART_ALLOW_HTTP === "true",
          },
        },
      ],
    ],
  },
};
