import { useCallback, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import {
  ActivityIndicator,
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
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Feather from "@expo/vector-icons/Feather";
import { authStorage, driverApi } from "../../src/api/client";

const FONT = "Plus Jakarta Sans";
const STATUS_OPTIONS = ["All", "Assigned", "Picked Up", "Out for Delivery"];
const SORT_OPTIONS = ["Newest", "Distance", "Amount"];

const NOTIFICATIONS = [];

export default function HomeScreen() {
  const [firstName, setFirstName] = useState("Driver");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState("Newest");
  const [openDropdown, setOpenDropdown] = useState("");
  const [notificationsVisible, setNotificationsVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const load = async () => {
        setLoading(true);
        setLoadError("");
        try {
          const savedUser = await authStorage.getUser();
          const name = savedUser?.fullName?.trim().split(/\s+/)[0];
          if (active) setFirstName(name || "Driver");

          const res = await driverApi.orders("All");
          if (active) setOrders(res.data || []);
        } catch (err) {
          if (active) {
            setLoadError(err.message || "Failed to load orders");
            setOrders([]);
          }
        } finally {
          if (active) setLoading(false);
        }
      };

      load();
      return () => {
        active = false;
      };
    }, []),
  );

  const activeOrders = useMemo(
    () => orders.filter((order) => order.status !== "Delivered"),
    [orders],
  );

  const visibleOrders = useMemo(() => {
    const filtered =
      filter === "All"
        ? [...activeOrders]
        : activeOrders.filter((order) => order.status === filter);

    if (sort === "Distance") {
      return filtered.sort(
        (a, b) => Number.parseFloat(a.distance) - Number.parseFloat(b.distance),
      );
    }
    if (sort === "Amount") {
      return filtered.sort((a, b) => b.amount - a.amount);
    }
    return filtered;
  }, [filter, sort, activeOrders]);

  const activeOrderCount = activeOrders.length;
  const hasUnreadNotifications = NOTIFICATIONS.some(
    (notification) => notification.unread,
  );

  const chooseFilter = (value) => {
    setFilter(value);
    setOpenDropdown("");
  };

  const chooseSort = (value) => {
    setSort(value);
    setOpenDropdown("");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Dashboard</Text>
        <TouchableOpacity
          style={styles.bellButton}
          activeOpacity={0.7}
          onPress={() => setNotificationsVisible(true)}
        >
          <Ionicons name="notifications-outline" size={24} color="#121212" />
          {hasUnreadNotifications ? <View style={styles.unreadBadge} /> : null}
        </TouchableOpacity>
      </View>

      <Text style={styles.welcomeText}>Welcome, {firstName}!</Text>

      <View style={styles.activeOrdersRow}>
        <Text style={styles.activeOrdersLabel}>Active orders</Text>
        <View style={styles.activeOrdersBadge}>
          <MaterialIcons name="sports-motorsports" size={24} color="white" />
          <Text style={styles.activeOrdersCount}>{activeOrderCount}</Text>
        </View>
      </View>

      <Text style={styles.filterLabel}>Filter:</Text>
      <View style={styles.filterRow}>
        <View style={styles.dropdownGroup}>
          <TouchableOpacity
            style={styles.dropdownButton}
            activeOpacity={0.75}
            onPress={() =>
              setOpenDropdown(openDropdown === "filter" ? "" : "filter")
            }
          >
            <Text style={styles.dropdownButtonText}>{filter}</Text>
            <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
          </TouchableOpacity>
          {openDropdown === "filter" ? (
            <View style={styles.dropdownMenu}>
              {STATUS_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={styles.dropdownOption}
                  onPress={() => chooseFilter(option)}
                >
                  <Text style={styles.dropdownOptionText}>{option}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.dropdownGroup}>
          <TouchableOpacity
            style={styles.dropdownButton}
            activeOpacity={0.75}
            onPress={() =>
              setOpenDropdown(openDropdown === "sort" ? "" : "sort")
            }
          >
            <Text style={styles.dropdownButtonText}>{sort}</Text>
            <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
          </TouchableOpacity>
          {openDropdown === "sort" ? (
            <View style={styles.dropdownMenu}>
              {SORT_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={styles.dropdownOption}
                  onPress={() => chooseSort(option)}
                >
                  <Text style={styles.dropdownOptionText}>{option}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={styles.orderList}
        contentContainerStyle={styles.orderListContent}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => setOpenDropdown("")}
      >
        {loading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color="#F97000" />
            <Text style={styles.emptyStateText}>Loading orders...</Text>
          </View>
        ) : loadError ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>Could not load orders</Text>
            <Text style={styles.emptyStateText}>{loadError}</Text>
          </View>
        ) : visibleOrders.length > 0 ? (
          <>
            {visibleOrders.map((order) => (
              <View key={order.db_id || order.id} style={styles.orderCard}>
                <View style={styles.orderTopRow}>
                  <View style={styles.orderNumberRow}>
                    <Text style={styles.orderNumber}>Order #{order.id}</Text>
                    <Feather name="package" size={22} color="#F97000" />
                  </View>
                  <Text style={styles.orderAmount}>
                    ₱{Number(order.amount || 0).toFixed(2)}
                  </Text>
                </View>
                <Text style={styles.customerName}>{order.customer}</Text>
                <Text style={styles.locationText}>{order.location}</Text>
                <View style={styles.pillRow}>
                  <View style={styles.assignedBadge}>
                    <View style={styles.assignedDot} />
                    <Text style={styles.pillText}>{order.status}</Text>
                  </View>
                  <View style={styles.distanceBadge}>
                    <Ionicons
                      name="location-outline"
                      size={15}
                      color="#9CA3AF"
                    />
                    <Text style={styles.pillText}>{order.distance}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.viewOrderButton}
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push({
                      pathname: "/order-details",
                      params: {
                        id: String(order.id),
                        dbId: String(order.db_id),
                      },
                    })
                  }
                >
                  <Text style={styles.viewOrderText}>View order</Text>
                </TouchableOpacity>
              </View>
            ))}
            <View style={styles.endState}>
              <Image
                source={require("../../assets/pizza.png")}
                style={styles.endStateImage}
              />
              <Text style={styles.endStateText}>End of history</Text>
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Image
              source={require("../../assets/pizza.png")}
              style={styles.emptyStateImage}
            />
            <Text style={styles.emptyStateTitle}>No orders assigned yet</Text>
            <Text style={styles.emptyStateText}>
              New orders will appear here once assigned to you
            </Text>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={notificationsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNotificationsVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setNotificationsVisible(false)}
        >
          <Pressable style={styles.notificationsPanel} onPress={() => {}}>
            <View style={styles.notificationsHeader}>
              <Text style={styles.notificationsTitle}>Notifications</Text>
              <TouchableOpacity
                style={styles.closeButton}
                activeOpacity={0.7}
                onPress={() => setNotificationsVisible(false)}
              >
                <Ionicons name="close" size={22} color="#121212" />
              </TouchableOpacity>
            </View>
            {NOTIFICATIONS.length > 0 ? (
              NOTIFICATIONS.map((notification) => (
              <View
                key={notification.id}
                style={[
                  styles.notificationItem,
                  notification.highlighted && styles.notificationItemHighlighted,
                ]}
              >
                <View style={styles.notificationDot} />
                <View style={styles.notificationContent}>
                  <Text style={styles.notificationText}>
                    {notification.title}
                  </Text>
                  {notification.detail ? (
                    <Text style={styles.notificationDetail}>
                      {notification.detail}
                    </Text>
                  ) : null}
                  <Text style={styles.notificationTime}>
                    {notification.timestamp}
                  </Text>
                </View>
              </View>
              ))
            ) : (
              <View style={styles.notificationEmpty}>
                <Text style={styles.notificationEmptyText}>
                  No new notifications
                </Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
  },
  headerTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 22,
    fontWeight: "700",
  },
  bellButton: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    position: "relative",
    width: 40,
  },
  unreadBadge: {
    backgroundColor: "red",
    borderColor: "#FFFFFF",
    borderRadius: 5,
    borderWidth: 1,
    height: 9,
    position: "absolute",
    right: 7,
    top: 6,
    width: 9,
  },
  welcomeText: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 16,
  },
  activeOrdersRow: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: 4,
  },
  activeOrdersLabel: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 13,
    marginRight: 8,
  },
  activeOrdersBadge: {
    alignItems: "center",
    backgroundColor: "#F97000",
    borderRadius: 15,
    flexDirection: "row",
    gap: 4,
    minHeight: 28,
    paddingHorizontal: 10,
  },
  activeOrdersCount: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
  },
  filterLabel: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 12,
    marginTop: 14,
  },
  filterRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
    zIndex: 10,
  },
  dropdownGroup: {
    minWidth: 112,
    position: "relative",
  },
  dropdownButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#9CA3AF",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 38,
    paddingHorizontal: 12,
  },
  dropdownButtonText: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 13,
    marginRight: 8,
  },
  dropdownMenu: {
    backgroundColor: "#FFFFFF",
    borderColor: "#9CA3AF",
    borderRadius: 8,
    borderWidth: 1,
    elevation: 5,
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    shadowColor: "#121212",
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    top: 42,
    zIndex: 20,
  },
  dropdownOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownOptionText: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 12,
  },
  orderList: {
    flex: 1,
    marginHorizontal: -4,
    marginTop: 14,
  },
  orderListContent: {
    paddingBottom: 28,
    paddingHorizontal: 4,
  },
  orderCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    elevation: 2,
    marginBottom: 12,
    padding: 16,
    shadowColor: "#121212",
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  orderTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  orderNumberRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  orderNumber: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 17,
    fontWeight: "700",
  },
  orderAmount: {
    color: "#F97000",
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: "700",
  },
  customerName: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 14,
  },
  locationText: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 13,
    marginTop: 3,
  },
  pillRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  assignedBadge: {
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    borderRadius: 8,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  assignedDot: {
    backgroundColor: "#22C55E",
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  distanceBadge: {
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  pillText: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 12,
  },
  viewOrderButton: {
    alignItems: "center",
    backgroundColor: "#F97000",
    borderRadius: 9,
    justifyContent: "center",
    marginTop: 12,
    minHeight: 44,
  },
  viewOrderText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 330,
    paddingHorizontal: 28,
  },
  emptyStateImage: {
    height: 86,
    resizeMode: "contain",
    width: 86,
  },
  emptyStateTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 17,
    fontWeight: "700",
    marginTop: 14,
  },
  emptyStateText: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    textAlign: "center",
  },
  endState: {
    alignItems: "center",
    paddingBottom: 8,
    paddingTop: 18,
  },
  endStateImage: {
    height: 52,
    resizeMode: "contain",
    width: 52,
  },
  endStateText: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 8,
  },
  modalOverlay: {
    backgroundColor: "rgba(0,0,0,0.35)",
    flex: 1,
    paddingHorizontal: 10,
    paddingTop: 46,
  },
  notificationsPanel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    elevation: 8,
    overflow: "hidden",
    paddingBottom: 6,
    shadowColor: "#121212",
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  notificationEmpty: {
    paddingHorizontal: 18,
    paddingVertical: 28,
  },
  notificationEmptyText: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 13,
    textAlign: "center",
  },
  notificationsHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  notificationsTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 21,
    fontWeight: "700",
  },
  closeButton: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  notificationItem: {
    borderBottomColor: "#F3F4F6",
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  notificationItemHighlighted: {
    backgroundColor: "#FDECD8",
  },
  notificationDot: {
    backgroundColor: "red",
    borderRadius: 4,
    height: 8,
    marginRight: 10,
    marginTop: 6,
    width: 8,
  },
  notificationContent: {
    flex: 1,
  },
  notificationText: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  notificationDetail: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  notificationTime: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 11,
    marginTop: 6,
  },
});
