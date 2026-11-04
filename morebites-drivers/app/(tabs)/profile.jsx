import { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { authStorage, driverApi, mediaUrl } from "../../src/api/client";

const FONT = "Plus Jakarta Sans";
const DANGER = "#EF4444";
const EMPTY_USER = {
  fullName: "Driver",
  phone: "Not provided",
  email: "Not provided",
  photo: "",
};

export default function ProfileScreen() {
  const [user, setUser] = useState(EMPTY_USER);
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const loadUser = async () => {
        const savedUser = await authStorage.getUser();
        if (savedUser) {
          let resolved = { ...savedUser };
          if (!resolved.photo && resolved.phone) {
            const cachedRaw = await AsyncStorage.getItem("cached_user_photos");
            const cachedMap = cachedRaw ? JSON.parse(cachedRaw) : {};
            if (cachedMap[resolved.phone]) {
              resolved.photo = cachedMap[resolved.phone];
            }
          }
          setUser({ ...EMPTY_USER, ...resolved });
        } else {
          setUser(EMPTY_USER);
        }
      };

      loadUser();
    }, []),
  );

  const logOut = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await driverApi.logout();
    } finally {
      setLoggingOut(false);
      setLogoutVisible(false);
      router.replace("/(auth)/login");
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.avatarSection}>
          <View style={styles.avatarCircle}>
            {user.photo ? (
              <Image source={{ uri: mediaUrl(user.photo) || user.photo }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person" size={48} color="#9CA3AF" />
            )}
          </View>
          <Text style={styles.driverName}>{user.fullName}</Text>
          <Text style={styles.driverEmail}>{user.email}</Text>
        </View>

        <Text style={styles.sectionTitle}>RIDER INFORMATION</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Full Name</Text>
            <Text style={styles.infoValue}>{user.fullName}</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phone Number</Text>
            <Text style={styles.infoValue}>{user.phone}</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{user.email}</Text>
          </View>
        </View>

        <View style={styles.menuCard}>
          <TouchableOpacity
            style={styles.menuRow}
            activeOpacity={0.75}
            onPress={() => router.push("/edit-profile")}
          >
            <View style={styles.menuLeft}>
              <View style={styles.menuIconWrap}>
                <Ionicons name="pencil-outline" size={20} color="#121212" />
              </View>
              <Text style={styles.menuText}>Edit Profile</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity
            style={styles.menuRow}
            activeOpacity={0.75}
            onPress={() => setLogoutVisible(true)}
          >
            <View style={styles.menuLeft}>
              <View style={styles.menuIconWrap}>
                <Ionicons name="log-out-outline" size={20} color={DANGER} />
              </View>
              <Text style={styles.logoutText}>Log Out</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={logoutVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setLogoutVisible(false)}
        >
          <Pressable style={styles.logoutModal} onPress={() => {}}>
            <Image
              source={require("../../assets/logout.png")}
              style={styles.logoutModalIconImage}
            />
            <Text style={styles.logoutModalTitle}>Log Out?</Text>
            <Text style={styles.logoutModalText}>
              Are you sure want to log out of your account?
            </Text>
            <TouchableOpacity
              style={[styles.confirmButton, loggingOut && { opacity: 0.7 }]}
              onPress={logOut}
              disabled={loggingOut}
            >
              <Text style={styles.confirmButtonText}>
                {loggingOut ? "Logging Out..." : "Yes, Log Out"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setLogoutVisible(false)}
              disabled={loggingOut}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    flex: 1,
  },
  header: {
    alignItems: "center",
    minHeight: 58,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  headerTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 22,
    fontWeight: "700",
  },
  scrollContent: {
    paddingBottom: 32,
    paddingHorizontal: 20,
  },
  avatarSection: {
    alignItems: "center",
    paddingBottom: 30,
    paddingTop: 14,
  },
  avatarCircle: {
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderColor: "#F97000",
    borderRadius: 47,
    borderWidth: 2,
    height: 94,
    justifyContent: "center",
    overflow: "hidden",
    width: 94,
  },
  avatarImage: {
    height: "100%",
    resizeMode: "cover",
    width: "100%",
  },
  driverName: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 20,
    fontWeight: "700",
    marginTop: 14,
  },
  driverEmail: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 13,
    marginTop: 4,
  },
  sectionTitle: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  infoCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#F3F4F6",
    borderRadius: 12,
    borderWidth: 1,
    elevation: 1,
    paddingHorizontal: 16,
    shadowColor: "#121212",
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  infoRow: {
    paddingVertical: 14,
  },
  infoLabel: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 11,
  },
  infoValue: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 5,
  },
  infoDivider: {
    backgroundColor: "#F3F4F6",
    height: 1,
  },
  menuCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#F3F4F6",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 22,
    overflow: "hidden",
  },
  menuRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 62,
    paddingHorizontal: 14,
  },
  menuLeft: {
    alignItems: "center",
    flexDirection: "row",
  },
  menuIconWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    width: 28,
  },
  menuText: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "600",
  },
  logoutText: {
    color: DANGER,
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "600",
  },
  menuDivider: {
    backgroundColor: "#F3F4F6",
    height: 1,
    marginHorizontal: 14,
  },
  modalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    paddingHorizontal: 24,
  },
  logoutModal: {
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    padding: 20,
  },
  logoutModalIconImage: {
    height: 72,
    resizeMode: "contain",
    width: 72,
  },
  logoutModalTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 20,
    fontWeight: "700",
    marginTop: 10,
  },
  logoutModalText: {
    color: "#8A8A8A",
    fontFamily: FONT,
    fontSize: 14,
    marginTop: 8,
    marginBottom: 20,
    textAlign: "center",
  },
  confirmButton: {
    width: "100%",
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: DANGER,
  },
  confirmButtonText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: "700",
  },
  cancelButton: {
    width: "100%",
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D4D4D4",
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    marginTop: 10,
  },
  cancelButtonText: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: "700",
  },
});
