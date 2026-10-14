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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { authStorage, customerApi, mediaUrl } from "../../../src/api/client";

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

function getHistoryMeta(item) {
  switch (item.type) {
    case "earn":
      return {
        icon: "add-circle",
        iconColor: "#16A34A",
        title: item.order_code ? `Order ${item.order_code}` : "Points Earned",
        pointsText: `+${Math.abs(item.points)} pts`,
        pointsColor: "#16A34A",
        subtitle: item.date || item.date_short || "Earned",
      };
    case "redeem":
      return {
        icon: "bag-handle",
        iconColor: "#EA580C",
        title: item.order_code ? `Order ${item.order_code}` : "Points Used",
        pointsText: `-${Math.abs(item.points)} pts`,
        pointsColor: "#EA580C",
        subtitle: item.date || item.date_short || "Redeemed",
      };
    case "refund":
      return {
        icon: "refresh-circle",
        iconColor: "#2563EB",
        title: item.order_code ? `Order ${item.order_code}` : "Points Refunded",
        pointsText: `+${Math.abs(item.points)} pts`,
        pointsColor: "#2563EB",
        subtitle: item.date || item.date_short || "Refunded",
      };
    case "expire":
      return {
        icon: "alert-circle",
        iconColor: "#DC2626",
        title: "Points Expired",
        pointsText: `-${Math.abs(item.points)} pts`,
        pointsColor: "#DC2626",
        subtitle: item.date || item.date_short || "Expired",
      };
    default:
      return {
        icon: "swap-horizontal",
        iconColor: "#6B7280",
        title: item.note || "Points Adjustment",
        pointsText: `${item.points >= 0 ? `+${item.points}` : item.points} pts`,
        pointsColor: item.points >= 0 ? "#16A34A" : "#DC2626",
        subtitle: item.date || item.date_short || "Adjusted",
      };
  }
}

export default function ProfileScreen() {
  const [user, setUser] = useState({ fullName: "Customer", phone: "", photo: null });
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [loyalty, setLoyalty] = useState({
    points: 0,
    points_worth: 0,
    points_worth_label: "₱0.00",
    points_expire_at: null,
    expiry_date_label: null,
    expiry_enabled: false,
    explanation: "",
    history: [],
    loading: true,
  });

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      const loadData = async () => {
        try {
          const savedUser = await authStorage.getUser();
          if (savedUser && isMounted) {
            let resolved = { ...savedUser };
            if (!resolved.photo && resolved.phone) {
              const cachedRaw = await AsyncStorage.getItem("cached_user_photos");
              const cachedMap = cachedRaw ? JSON.parse(cachedRaw) : {};
              if (cachedMap[resolved.phone]) {
                resolved.photo = cachedMap[resolved.phone];
              }
            }
            setUser((current) => ({ ...current, ...resolved }));
          }
        } catch {
          // ignore
        }

        try {
          const res = await customerApi.loyalty();
          if (res && isMounted) {
            setLoyalty({
              points: res.points ?? 0,
              points_worth: res.points_worth ?? 0,
              points_worth_label: res.points_worth_label || `₱${(res.points_worth ?? 0).toFixed(2)}`,
              points_expire_at: res.points_expire_at || null,
              expiry_date_label: res.expiry_date_label || null,
              expiry_enabled: !!res.expiry_enabled,
              explanation: res.explanation || "",
              history: Array.isArray(res.history) ? res.history : [],
              loading: false,
            });
          }
        } catch (err) {
          console.warn("[Profile] Failed to load loyalty data:", err?.message || err);
          if (isMounted) {
            setLoyalty((prev) => ({ ...prev, loading: false }));
          }
        }
      };

      loadData();

      return () => {
        isMounted = false;
      };
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
            <Image source={{ uri: mediaUrl(user.photo) || user.photo }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Ionicons name="person" size={50} color="#8A8A8A" />
            </View>
          )}
        </View>

        <Text style={styles.sectionLabel}>LOYALTY & REWARDS</Text>
        <View style={styles.loyaltyCard}>
          <View style={styles.loyaltyTopRow}>
            <View style={styles.loyaltyHeaderLeft}>
              <View style={styles.loyaltyIconWrap}>
                <Ionicons name="ribbon-outline" size={20} color={PRIMARY} />
              </View>
              <Text style={styles.loyaltyHeaderTitle}>Loyalty Points</Text>
            </View>
            <View style={styles.pointsWorthBadge}>
              <Text style={styles.pointsWorthBadgeText}>
                Worth {loyalty.points_worth_label || `₱${(loyalty.points_worth || 0).toFixed(2)}`}
              </Text>
            </View>
          </View>

          <View style={styles.loyaltyBalanceRow}>
            <Text style={styles.loyaltyPointsValue}>{loyalty.points}</Text>
            <Text style={styles.loyaltyPointsUnit}> pts</Text>
          </View>

          {loyalty.points > 0 && loyalty.expiry_enabled && loyalty.expiry_date_label ? (
            <View style={styles.expiryRow}>
              <Ionicons name="time-outline" size={14} color="#D97706" />
              <Text style={styles.expiryText}>Points expire on {loyalty.expiry_date_label}</Text>
            </View>
          ) : null}

          {loyalty.explanation ? (
            <View style={styles.explanationWrap}>
              <Ionicons name="information-circle-outline" size={15} color="#6B7280" style={{ marginTop: 1 }} />
              <Text style={styles.explanationText}>{loyalty.explanation}</Text>
            </View>
          ) : null}
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>POINTS HISTORY</Text>
        <View style={styles.historyCard}>
          {loyalty.history.length === 0 ? (
            <View style={styles.emptyHistoryWrap}>
              <Ionicons name="receipt-outline" size={32} color="#D1D5DB" />
              <Text style={styles.emptyHistoryText}>No points yet. Complete an order to start earning.</Text>
            </View>
          ) : (
            loyalty.history.map((entry, idx) => {
              const meta = getHistoryMeta(entry);
              const isLast = idx === loyalty.history.length - 1;
              return (
                <View key={entry.id || idx} style={[styles.historyRow, isLast && styles.lastHistoryRow]}>
                  <View style={[styles.historyIconWrap, { backgroundColor: `${meta.iconColor}15` }]}>
                    <Ionicons name={meta.icon} size={20} color={meta.iconColor} />
                  </View>
                  <View style={styles.historyDetails}>
                    <Text style={styles.historyTitle}>{meta.title}</Text>
                    <Text style={styles.historySubtitle}>{meta.subtitle}</Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={[styles.historyPoints, { color: meta.pointsColor }]}>
                      {meta.pointsText}
                    </Text>
                    <Text style={styles.historyBalance}>Bal: {entry.balance_after} pts</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>PERSONAL INFORMATION</Text>
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
            onPress={() => router.push("/(customer)/saved-addresses")}
          />
          <MenuRow
            icon="create-outline"
            color="#121212"
            label="Edit Profile"
            onPress={() => router.push("/(customer)/edit-profile")}
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
            <Image source={require("../../../assets/images/logout.png")} style={styles.modalImage} />
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
  loyaltyCard: {
    borderWidth: 1,
    borderColor: "#FED7AA",
    borderRadius: 14,
    backgroundColor: "#FFFBF7",
    padding: 16,
    shadowColor: "#F97000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  loyaltyTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  loyaltyHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  loyaltyIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFEDD5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  loyaltyHeaderTitle: {
    color: "#7C2D12",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  pointsWorthBadge: {
    backgroundColor: "#EA580C",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pointsWorthBadgeText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 11,
    fontWeight: "700",
  },
  loyaltyBalanceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 12,
  },
  loyaltyPointsValue: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 34,
    fontWeight: "800",
    lineHeight: 38,
  },
  loyaltyPointsUnit: {
    color: PRIMARY,
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "700",
  },
  expiryRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignSelf: "flex-start",
    marginTop: 10,
    gap: 6,
  },
  expiryText: {
    color: "#92400E",
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: "600",
  },
  explanationWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#FED7AA",
    gap: 6,
  },
  explanationText: {
    flex: 1,
    color: "#4B5563",
    fontFamily: FONT,
    fontSize: 12,
    lineHeight: 17,
  },
  historyCard: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  emptyHistoryWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyHistoryText: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 18,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  lastHistoryRow: {
    borderBottomWidth: 0,
  },
  historyIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  historyDetails: {
    flex: 1,
  },
  historyTitle: {
    color: "#111827",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "700",
  },
  historySubtitle: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 11,
    marginTop: 2,
  },
  historyRight: {
    alignItems: "flex-end",
    marginLeft: 8,
  },
  historyPoints: {
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
  },
  historyBalance: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 11,
    marginTop: 2,
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
