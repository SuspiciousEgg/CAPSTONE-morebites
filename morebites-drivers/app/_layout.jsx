import { Feather, Ionicons, MaterialIcons } from "@expo/vector-icons";
import { Asset } from "expo-asset";
import * as Font from "expo-font";
import { requireNativeModule } from "expo-modules-core";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import "react-native-reanimated";

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
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="dark" />
    </>
  );
}
