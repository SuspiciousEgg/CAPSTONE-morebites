import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authStorage, customerApi } from "../../src/api/client";

const FONT = "Plus Jakarta Sans";
const PRIMARY = "#F97000";
const DANGER = "#EF4444";

function MenuRow({ icon, color, label, onPress, last }) {
  return (
    <Pressable style={[styles.menuRow, last && styles.lastMenuRow]} onPress={onPress}>
      <Ionicons name={icon} size={21} color={color} />
      <Text style={[styles.menuLabel, color === DANGER && styles.dangerText]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const [user, setUser] = useState({ fullName: "Customer", phone: "", photo: null });
  const [logoutVisible, setLogoutVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const loadUser = async () => {
        const savedUser = await authStorage.getUser();
        if (savedUser) setUser((current) => ({ ...current, ...savedUser }));
      };
      loadUser();
    }, [])
  );

  const logOut = async () => {
    setLogoutVisible(false);
    await customerApi.logout();
    router.replace("/(auth)/login");
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarSection}>
          {user.photo ? (
            <Image source={{ uri: user.photo }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Ionicons name="person" size={50} color="#8A8A8A" />
            </View>
          )}
        </View>

        <Text style={styles.sectionLabel}>PERSONAL INFORMATION</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>FULL NAME</Text>
            <Text style={styles.infoValue}>{user.fullName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>PHONE NUMBER</Text>
            <Text style={styles.infoValue}>{user.phone || "Not provided"}</Text>
          </View>
        </View>

        <View style={styles.menuCard}>
          <MenuRow
            icon="location-outline"
            color={DANGER}
            label="Saved Addresses"
            onPress={() => router.push("/saved-addresses")}
          />
          <MenuRow
            icon="create-outline"
            color="#121212"
            label="Edit Profile"
            onPress={() => router.push("/edit-profile")}
          />
          <MenuRow
            icon="log-out-outline"
            color={DANGER}
            label="Log Out"
            onPress={() => setLogoutVisible(true)}
            last
          />
        </View>
      </ScrollView>

      <Modal
        visible={logoutVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setLogoutVisible(false)}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <Image source={require("../../assets/images/logout.png")} style={styles.modalImage} />
            <Text style={styles.modalTitle}>Log Out?</Text>
            <Text style={styles.modalText}>Are you sure want to log out of your account?</Text>
            <Pressable style={styles.logoutButton} onPress={logOut}>
              <Text style={styles.logoutButtonText}>Yes, Log Out</Text>
            </Pressable>
            <Pressable style={styles.cancelButton} onPress={() => setLogoutVisible(false)}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  headerTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 20,
    fontWeight: "700",
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  avatarSection: {
    alignItems: "center",
    paddingVertical: 24,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: PRIMARY,
    backgroundColor: "#E5E7EB",
  },
  avatarFallback: {
    width: 90,
    height: 90,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 45,
    borderWidth: 2,
    borderColor: PRIMARY,
    backgroundColor: "#E5E7EB",
  },
  sectionLabel: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: 8,
  },
  infoCard: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  infoRow: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  infoLabel: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 10,
  },
  infoValue: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 3,
  },
  menuCard: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    marginTop: 20,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  lastMenuRow: {
    borderBottomWidth: 0,
  },
  menuLabel: {
    flex: 1,
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 12,
  },
  dangerText: {
    color: DANGER,
  },
  modalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    paddingHorizontal: 24,
  },
  modalCard: {
    width: "100%",
    alignItems: "center",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    padding: 20,
  },
  modalImage: {
    width: 72,
    height: 72,
    resizeMode: "contain",
  },
  modalTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 20,
    fontWeight: "700",
    marginTop: 10,
  },
  modalText: {
    color: "#8A8A8A",
    fontFamily: FONT,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  logoutButton: {
    width: "100%",
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: DANGER,
  },
  logoutButtonText: {
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
