import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authStorage, customerApi } from "../../src/api/client";

const FONT = "Plus Jakarta Sans";

export default function SplashScreen() {
  const scale = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const [checking, setChecking] = useState(true);

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
      try {
        const token = await authStorage.getToken();
        if (token) {
          const res = await customerApi.me();
          if (res?.user) {
            await authStorage.updateUser(res.user);
            await minDelay;
            if (!cancelled) router.replace("/(tabs)/home");
            return;
          }
        }
      } catch {
        await authStorage.clear();
      }

      await minDelay;
      if (!cancelled) {
        setChecking(false);
        Animated.timing(fade, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();
      }
    };
    boot();

    return () => {
      cancelled = true;
      pulse.stop();
    };
  }, [fade, scale]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Animated.Image
          source={require("../../assets/images/morebytes.png")}
          style={[styles.logo, { transform: [{ scale }] }]}
        />
        <Text style={styles.tagline}>Good food for Good life</Text>

        {!checking ? (
          <Animated.View style={[styles.actions, { opacity: fade }]}>
            <TouchableOpacity
              style={styles.primaryButton}
              activeOpacity={0.85}
              onPress={() => router.replace("/(auth)/register")}
            >
              <Text style={styles.primaryText}>Create Account</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              activeOpacity={0.85}
              onPress={() => router.replace("/(auth)/login")}
            >
              <Text style={styles.secondaryText}>Login</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : null}
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
  actions: {
    marginTop: 48,
    width: "100%",
    maxWidth: 320,
    gap: 12,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    height: 52,
    justifyContent: "center",
  },
  primaryText: {
    color: "#F97000",
    fontFamily: FONT,
    fontSize: 17,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1.5,
    height: 52,
    justifyContent: "center",
  },
  secondaryText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 17,
    fontWeight: "700",
  },
});
