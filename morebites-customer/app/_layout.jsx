import { Feather, Ionicons, MaterialIcons } from "@expo/vector-icons";
import { Asset } from "expo-asset";
import * as Font from "expo-font";
import { requireNativeModule } from "expo-modules-core";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { CartProvider } from "../src/context/CartContext";

/*
 * [DIAGNOSIS REPORT — Icon Font Not Loading App-Wide on the Merged Mobile App]
 *
 * 1. Icon Library / Font Used App-Wide & How It Was Declared:
 *    - The merged Expo app (`morebites-customer`) uses `@expo/vector-icons` (`^15.0.3`) backed by `expo-font` (`~14.0.12`)
 *      and `expo-asset` (`~12.0.13`), which wraps three icon font families:
 *      * `Ionicons` (`fontFamily: "ionicons"`, `Ionicons.ttf`) — used across all Customer & Auth screens (`(auth)/login.jsx`
 *        and `register.jsx` password show/hide eye icons `eye-outline`/`eye-off-outline`, `(customer)/(tabs)/_layout.jsx` tab
 *        bar icons, `(customer)/(tabs)/orders.jsx` filter dropdown chevrons `chevron-down`, notification bell `notifications`,
 *        and Track button location pin `location-outline`) as well as Driver screens.
 *      * `Feather` (`fontFamily: "feather"`, `Feather.ttf`) — used on Driver order cards (`package`, `check-circle`).
 *      * `MaterialIcons` (`fontFamily: "material"`, `MaterialIcons.ttf`) — used on the Driver header (`sports-motorsports`).
 *    - Prior to this fix, icon fonts were NOT declared or awaited at the app root (`app/_layout.jsx`) nor linked in `app.json`;
 *      instead, icons were imported per-screen (mixing named imports `import { Ionicons } from "@expo/vector-icons"` on Customer
 *      screens with default subpath imports `import Feather from "@expo/vector-icons/Feather"` on Driver screens), relying on
 *      lazy on-mount runtime font loading.
 *
 * 2. Why Empty Boxes (`[x]` / `☐`) Rendered Everywhere Instead of Blank Space:
 *    - In `@expo/vector-icons/build/createIconSet.js`, while `fontIsLoaded` is `false`, `<Icon>` renders an empty `<Text />`
 *      (blank space). Once `Font.loadAsync` resolves (`fontIsLoaded === true`), `<Icon>` renders the icon's Unicode Private Use
 *      Area codepoint (e.g. `\uF2B8` for `eye-off-outline`) with `fontFamily: "ionicons"` (`"feather"`, `"material"`).
 *    - Empty tofu boxes (`[x]` / `☐`) appear when `<Text>` renders those Private Use Area codepoints, but the native font manager
 *      (`ReactFontManager` on Android / `CTFontManager` on iOS) does not have a valid typeface registered for that `fontFamily`
 *      and falls back to the system font (`Roboto` / `SF Pro`).
 *    - Three root causes combined to break the icon font registration app-wide:
 *      * Root Cause A (Missing `expo-asset` & SDK 57 / SDK 54 Dependency Mismatch): `expo-font` relies on `expo-asset` to resolve
 *        and download `.ttf` assets to `FileSystem.cacheDirectory`. However, `expo-asset` was missing from `package.json` and not
 *        hoisted at `node_modules/expo-asset`, while `expo-application` (`57.0.2`), `expo-crypto` (`57.0.2`), and `expo-secure-store`
 *        (`57.0.3`) were installed from Expo SDK 57 alongside duplicate `expo-constants` (`18.0.13` vs `18.0.14`) in an Expo SDK 54
 *        project (`npx expo-doctor` failed 2 checks).
 *      * Root Cause B (Unconfigured Native Font Linking in `app.json`): `app.json` listed `"expo-font"` in `"plugins"` with no
 *        `"fonts"` array (`withFonts.js` immediately exits `if (!props) return config;`), so `ionicons.ttf`, `feather.ttf`, and
 *        `material.ttf` were never linked into `android/app/src/main/assets/fonts/` or iOS `Info.plist` (`UIAppFonts`).
 *      * Root Cause C (Stale Native `ExpoFontLoader` Cache & Deep `node_modules` Tunnel Asset Path): When a `.ttf` download from
 *        `/assets/node_modules/@expo/vector-icons/...` fails or is corrupted over `--tunnel`, Android API 26+ `Typeface.createFromFile`
 *        (`FontLoaderModule.kt` line 53) does not throw — it silently returns `Typeface.DEFAULT` (Roboto), registers `"ionicons"` ->
 *        `Typeface.DEFAULT` in `ReactFontManager`, and adds `"ionicons"` to `ExpoFontLoader.getLoadedFonts()`. Because `Font.loadAsync`
 *        short-circuits when `isLoaded("ionicons")` is true, a plain JS reload never re-registers the font in `ReactFontManager`.
 *
 * 3. When This Started & Rebuild vs. Reload Requirement:
 *    - Started after the Customer + Driver app merge (`903a316`) and subsequent commit `c19dfba` (which modified `package.json`,
 *      `package-lock.json`, and `app.json` plugins without linking `expo-font` assets or hoisting `expo-asset`).
 *    - Fix applied at the root:
 *      1. Installed `expo-asset` (`~12.0.13`) and aligned all Expo SDK 54 packages (`npx expo-doctor` now passes 18/18 checks).
 *      2. Bundled `ionicons.ttf`, `feather.ttf`, `material.ttf`, and `MaterialIcons.ttf` in `assets/fonts/` and linked them in
 *         `app.json` under the `["expo-font", { "fonts": [...] }]` config plugin.
 *      3. Added root-level font loading with `SplashScreen.preventAutoHideAsync()` and `loadSingleFontAsync` in `app/_layout.jsx`
 *         so all icon font families are forcefully registered in `ReactFontManager` / `CTFontManager` and awaited before any
 *         Customer, Auth, or Driver screen renders.
 *    - Rebuild vs. Reload:
 *      * If running a Custom Dev Client / Native APK build (`npx expo run:android` / `run:ios`), a full native rebuild is required
 *        so the `app.json` `expo-font` config plugin links the `.ttf` files into the native binary.
 *      * If running in Expo Go over the presentation tunnel, restart the tunnel (`.\scripts\start-presentation-tunnel.ps1`, which
 *        runs `npx expo start --tunnel --clear`) so Metro serves the new `assets/fonts/*.ttf` bundle and `loadSingleFontAsync`
 *        overwrites the native `ReactFontManager` typeface map.
 */

SplashScreen.preventAutoHideAsync().catch(() => {});

const ICON_FONT_SOURCES = {
  ionicons: require("../assets/fonts/ionicons.ttf"),
  Ionicons: require("../assets/fonts/ionicons.ttf"),
  feather: require("../assets/fonts/feather.ttf"),
  Feather: require("../assets/fonts/feather.ttf"),
  material: require("../assets/fonts/material.ttf"),
  MaterialIcons: require("../assets/fonts/MaterialIcons.ttf"),
  "Material Icons": require("../assets/fonts/MaterialIcons.ttf"),
};

export default function RootLayout() {
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function prepareIconFonts() {
      try {
        // On native (Android / iOS), explicitly download the local bundled .ttf assets and
        // call ExpoFontLoader.loadAsync so ReactFontManager / CTFontManager is overwritten
        // even if a prior reload left a stale entry in getLoadedFonts().
        if (Platform.OS !== "web") {
          const ExpoFontLoader = requireNativeModule("ExpoFontLoader");
          const nativeEntries = Object.entries(ICON_FONT_SOURCES);
          await Promise.all(
            nativeEntries.map(async ([family, moduleId]) => {
              const asset = Asset.fromModule(moduleId);
              await asset.downloadAsync();
              if (asset.localUri) {
                await ExpoFontLoader.loadAsync(family, asset.localUri);
              }
            })
          );
        }

        // Register in expo-font's JS cache so Font.isLoaded('ionicons' | 'feather' | 'material')
        // returns true synchronously when @expo/vector-icons components mount.
        await Font.loadAsync({
          ...Ionicons.font,
          ...Feather.font,
          ...MaterialIcons.font,
          ...ICON_FONT_SOURCES,
        });
      } catch (err) {
        console.warn("Failed to preload icon fonts:", err);
      } finally {
        if (isMounted) {
          setFontsReady(true);
          SplashScreen.hideAsync().catch(() => {});
        }
      }
    }

    prepareIconFonts();

    return () => {
      isMounted = false;
    };
  }, []);

  if (!fontsReady) {
    return null;
  }

  return (
    <CartProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(customer)" options={{ headerShown: false }} />
        <Stack.Screen name="(driver)" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </CartProvider>
  );
}
