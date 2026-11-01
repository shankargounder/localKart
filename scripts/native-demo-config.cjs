const { readFileSync, existsSync } = require("node:fs");
function validateDemoBuild(role, projectId, googleServicesFile) {
  if (process.env.LOCALKART_DEMO_BUILD !== "true") return;
  const raw = process.env.EXPO_PUBLIC_API_URL;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      "Demo APK requires EXPO_PUBLIC_API_URL with a public HTTPS API.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !url.pathname.endsWith("/api/v1") ||
    /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$)/i.test(
      url.hostname,
    ) ||
    url.hostname.endsWith(".local")
  )
    throw new Error(
      "Demo APK must use a public HTTPS API ending /api/v1, never a LAN/localhost address.",
    );
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      projectId || "",
    )
  )
    throw new Error("Demo APK requires its EAS project UUID.");
  if (!googleServicesFile || !existsSync(googleServicesFile))
    throw new Error(
      "Demo APK requires the matching Firebase google-services.json build file.",
    );
  const data = JSON.parse(readFileSync(googleServicesFile, "utf8"));
  const expected = "in.localkart." + role;
  if (
    !data.client?.some(
      (client) =>
        client.client_info?.android_client_info?.package_name === expected,
    )
  )
    throw new Error("Firebase client file package does not match " + expected);
  if (process.env.LOCALKART_ALLOW_HTTP === "true")
    throw new Error("Demo APK must not enable cleartext HTTP.");
}
module.exports = { validateDemoBuild };
