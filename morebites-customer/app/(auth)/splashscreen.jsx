import { useEffect, useRef } from "react";
import { router } from "expo-router";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authStorage, customerApi } from "../../src/api/client";

const FONT = "Plus Jakarta Sans";

export default function SplashScreen() {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.08,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();

    let cancelled = false;
    const boot = async () => {
      const minDelay = new Promise((resolve) => setTimeout(resolve, 1800));
      let nextRoute = "/(auth)/login";

      try {
        const token = await authStorage.getToken();
        if (token) {
          const res = await customerApi.me();
          if (res?.user) {
            await authStorage.updateUser(res.user);
            nextRoute = "/(tabs)/home";
          }
        }
      } catch {
        await authStorage.clear();
        nextRoute = "/(auth)/login";
      }

      await minDelay;
      if (!cancelled) {
        router.replace(nextRoute);
      }
    };
    boot();

    return () => {
      cancelled = true;
      pulse.stop();
    };
  }, [scale]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Animated.Image
          source={require("../../assets/images/morebytes.png")}
          style={[styles.logo, { transform: [{ scale }] }]}
        />
        <Text style={styles.tagline}>Good food for Good life</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: "#F97000",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  content: {
    alignItems: "center",
    width: "100%",
  },
  logo: { height: 215, resizeMode: "contain", width: 215 },
  tagline: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 30,
    lineHeight: 36,
    marginTop: 24,
    textAlign: "center",
  },
});
