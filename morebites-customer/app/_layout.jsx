import { Feather, Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { CartProvider } from "../src/context/CartContext";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
    ...Feather.font,
    ...MaterialIcons.font,
    ionicons: require("../assets/fonts/ionicons.ttf"),
    feather: require("../assets/fonts/feather.ttf"),
    material: require("../assets/fonts/material.ttf"),
  });

  useEffect(() => {
    if (fontError) {
      console.warn("Failed to load icon fonts:", fontError);
    }
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
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
