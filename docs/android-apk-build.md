# Completed Android APKs — 1 November 2026

Both same-Wi-Fi builds finished successfully and were downloaded:

- Customer: `.local/apk-build/localkart-customer.apk`, package `in.localkart.customer`, SHA-256 `f42e038ccd8ad902379ac93cd30bcaa4cb2ed0dafeb547a7969c9b15fd8066a2`.
- Shopkeeper: `.local/apk-build/localkart-merchant.apk`, package `in.localkart.merchant`, SHA-256 `1c41cd3b1b4df29314f86896f0454696232324fe84f938b85a1ed3a5de144ab1`.

Each file is 98,589,214 bytes. ZIP integrity, package identity, APK signing block presence, minimum Android SDK 24, local cleartext setting and bundled `http://192.168.1.38:4000/api/v1` API address were checked. Expo generated the signing keys and built both release APKs. Physical installation/runtime behavior remains untested.

Keep phones and PC on the same Wi-Fi and leave the API/database running. These are local-demo APKs. Background OS push remains unconfigured without Firebase/FCM credentials. Use in-app order/notification testing while the API is reachable. Installation notes and the validation manifest are in ignored `.local/apk-build/INSTALL.md` and `apk-validation.json`.

---

# Android APK build status — 1 November 2026

Both Expo projects are created under shankar33: customer f552bb60-e05f-4007-89fd-8c3911b8a368 and merchant cc359856-a388-4c78-be2b-d96dab4a58be. Their dynamic configs are linked; the shared build guard now imports correctly in both Expo and EAS config loaders.

The user chose **same-Wi-Fi** builds. Both preview-local profiles target `http://192.168.1.38:4000/api/v1`, enable Android cleartext HTTP only for that local profile, and inherit the APK output format and Node 22 runtime. The API health endpoint was verified reachable at that LAN address. Keep both phones and PC on the same Wi-Fi, keep PostgreSQL/API running, and allow API traffic through the PC firewall if necessary. These builds are not internet-deployed apps.

Local archives are prepared under ignored `.local/apk-build/`. The inspected customer archive has 155 files, about 2.84 MB, and no environment files, database backups, node_modules, private signing files or credential files. .easignore additionally excludes .aws, .codex, .agents, signing keys and registry credential files.

The user explicitly approved the private source upload for both APKs on 1 November 2026. Both reviewed archives excluded environment files, databases and private credential files. Expo generated remote Android signing keystores and accepted the builds:

- Customer: d21a86b8-857b-477c-8996-808085d13ac4
- Merchant: e9599fe0-059c-4d45-959f-f0207b8ae66d

Both builds use preview-local, Android APK output and the same LAN API. No app-store submission or paid-plan purchase was performed. Build completion and artifact verification must be checked before reporting APK success.

```powershell
# Run separately from each app directory, not the monorepo root:
$env:EAS_NO_VCS='1'
eas build --platform android --profile preview-local --no-wait
```

Poll the resulting build IDs, download completed APKs into `.local/apk-build/`, and verify artifact types/checksums before handing them over. OS push remains unconfigured without matching Firebase/FCM credentials. Live sockets/polling and order acceptance/ready updates can be tested while the API is reachable. Camera/native permission behavior still requires installed-device testing. The hardened demo profile remains reserved for a public HTTPS backend with Firebase/EAS validation.

---

## Earlier build preparation

# Android APK

## Customer APK for this PC's local demo

The `preview-local` customer profile points to `http://192.168.1.38:4000/api/v1` and enables Android cleartext HTTP only for this testing profile. Keep the phone and PC on the same Wi-Fi with the API/database running. If your PC's Wi-Fi IP changes, update this profile before rebuilding. Production/normal preview do not enable cleartext HTTP.

```powershell
eas login --browser
cd apps/customer-mobile
eas build --platform android --profile preview-local
```

EAS sign-in, project linking and signing-key setup must complete before an APK can be produced. The cloud service provides a download link after a successful build. V2 uses Leaflet/OpenStreetMap in native WebView, with no paid Google account required. Internet access for tiles remains necessary.

Use Node 22 LTS. Each Expo app has an `eas.json` preview profile with `android.buildType=apk`.

```powershell
cd apps/customer-mobile
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --platform android --profile preview
# Repeat from apps/merchant-mobile
```

Configure EAS EXPO_PUBLIC_API_URL to a reachable HTTPS staging backend. Link each app to a separate Expo project. Add projectId in Expo extra.eas configuration when linking; do not commit credentials. V2 uses the no-key OpenStreetMap fallback on native and web platforms. Map functionality must be tested in the actual native build. List discovery and directions remain available without a map build.

Download the APK from the completed EAS build and install on a test device. Verify permission denied/manual coordinates, marker preview, small-screen layout, keyboard, login persistence, order status polling, five failed pickup attempts, and merchant/customer role separation. EAS builds and signing were not executed here. No Play Store or App Store publishing is authorized or configured.

For this update, configure each app’s EAS project ID, Firebase client file and FCM V1 credentials before rebuilding. See [live notifications setup and physical Android checklist](live-tracking-notifications.md). Both Android JS exports pass; physical OS push and native APK builds remain unverified.
