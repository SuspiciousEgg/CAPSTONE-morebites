import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Stack, router, useFocusEffect } from "expo-router";
import { authStorage } from "../../src/api/client";

export default function DriverLayout() {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const [token, user] = await Promise.all([
        authStorage.getToken(),
        authStorage.getUser(),
      ]);

      if (!token || !user) {
        setIsAuthorized(false);
        setIsChecking(false);
        router.replace("/(auth)/login");
        return;
      }

      const role = String(user.role || "").toLowerCase();
      const isDriver =
        role === "driver" ||
        (Array.isArray(user.role_access) && user.role_access.includes("driver")) ||
        (Array.isArray(user.roles) && user.roles.includes("driver")) ||
        user.is_driver === true;

      if (isDriver) {
        setIsAuthorized(true);
        setIsChecking(false);
      } else if (role === "customer") {
        setIsAuthorized(false);
        setIsChecking(false);
        router.replace("/(customer)/(tabs)/home");
      } else {
        setIsAuthorized(false);
        setIsChecking(false);
        router.replace("/(auth)/login");
      }
    } catch {
      setIsAuthorized(false);
      setIsChecking(false);
      router.replace("/(auth)/login");
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useFocusEffect(
    useCallback(() => {
      checkAuth();
    }, [checkAuth])
  );

  if (isChecking || !isAuthorized) {
    return <View style={styles.container} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
});

