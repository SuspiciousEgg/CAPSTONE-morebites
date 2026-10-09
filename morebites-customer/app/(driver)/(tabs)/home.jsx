import { useCallback, useMemo, useRef, useState } from "react";
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
import { authStorage, driverApi } from "../../../src/api/client";

const FONT = "Plus Jakarta Sans";
const STATUS_OPTIONS = ["All", "Assigned", "Picked Up", "Out for Delivery"];
const SORT_OPTIONS = ["Newest", "Distance", "Amount"];

/**
 * PROMPT 39 DIAGNOSTIC REPORT: Notification Bell Badge Hide-at-Zero Behavior (Driver Mobile vs. Web)
 *
 * 1. Investigation Findings:
 *    - Web (`morebites-frontend/src/components/SuperAdminDashboard.jsx`, lines 635-639):
 *      * Conditionally renders `<span className="sa-bell-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>`
 *        strictly when `unreadCount > 0` (rendering `null` when `unreadCount === 0`).
 *      * Derives `unreadCount` directly from the fetched notifications list (`list.filter(n => Boolean(n.unread)).length`)
 *        and optimistically decrements `unreadCount` synchronously on click BEFORE awaiting the API call.
 *    - Driver Mobile (`morebites-drivers/app/(tabs)/home.jsx`) & Customer Mobile (`morebites-customer/app/(tabs)/orders.jsx`):
 *      * Previously rendered an empty red circle (`<View style={styles.unreadBadge} />` / `<View style={styles.unreadDot} />`)
 *        without the unread count number.
 *      * Fetched `unreadCount` and `notifications` in separate, unsynchronized requests and waited for the
 *        network `await` in `handleNotificationPress` / `handleMarkAllAsRead` before updating state. Because the
 *        3-second polling interval (`loadUnreadCount()`) ran concurrently without an in-flight read-mutation guard,
 *        reading the last remaining unread notification could race with an in-flight poll or delayed response,
 *        causing the empty red circle to linger visible at 0 unread items until the screen was reloaded or
 *        navigated away from and back.
 *
 * 2. Fix Applied:
 *    - Updated the badge on both Driver and Customer mobile apps to render the red circle and its count
 *      (`{unreadCount > 99 ? "99+" : String(unreadCount)}`) strictly when `unreadCount > 0`, and render `null`
 *      (no empty red circle, no "0") whenever the unread count for the logged-in user is 0.
 *    - Synchronized `unreadCount` with the per-user notifications list and added optimistic immediate state
 *      updates + `locallyReadIdsRef` tracking so the badge disappears the exact instant the last unread
 *      notification is read and reappears automatically as soon as a new unread notification arrives.
 */
export default function HomeScreen() {
  const [firstName, setFirstName] = useState("Driver");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState("Newest");
  const [openDropdown, setOpenDropdown] = useState("");
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const notificationsVisibleRef = useRef(notificationsVisible);
  notificationsVisibleRef.current = notificationsVisible;
  const locallyReadIdsRef = useRef(new Set());
  const pendingReadMutationsRef = useRef(0);

  const syncNotifications = useCallback(async () => {
    try {
      const [countRes, listRes] = await Promise.all([
        driverApi.unreadNotificationsCount(),
        driverApi.notifications(),
      ]);
      const rawList = Array.isArray(listRes?.data)
        ? listRes.data
        : Array.isArray(listRes)
          ? listRes
          : null;
      if (rawList) {
        const normalizedList = rawList.map((n) => {
          if (locallyReadIdsRef.current.has(n.id)) {
            return { ...n, is_read: true, unread: false };
          }
          const isUnread = Boolean(n.unread || (!n.is_read && n.is_read !== undefined));
          return { ...n, is_read: !isUnread, unread: isUnread };
        });
        setNotifications(normalizedList);
        setUnreadCount(normalizedList.filter((n) => n.unread).length);
      } else if (pendingReadMutationsRef.current === 0) {
        const count = Math.max(0, Number(countRes?.count ?? countRes?.data?.count ?? 0) || 0);
        setUnreadCount(count);
      }
    } catch {
      // offline / fallback
    }
  }, []);

  const openNotifications = async () => {
    setNotificationsVisible(true);
    setNotificationsLoading(true);
    try {
      await syncNotifications();
    } catch (err) {
      console.warn("Failed to load notifications:", err);
    } finally {
      setNotificationsLoading(false);
    }
  };

  const handleNotificationPress = async (item) => {
    const isItemUnread = Boolean(item.unread || !item.is_read);
    if (isItemUnread) {
      locallyReadIdsRef.current.add(item.id);
      setNotifications((prev) => {
        const next = prev.map((n) =>
          n.id === item.id ? { ...n, is_read: true, unread: false } : n
        );
        setUnreadCount(next.filter((n) => Boolean(n.unread && !n.is_read)).length);
        return next;
      });
      pendingReadMutationsRef.current += 1;
      try {
        await driverApi.markNotificationRead(item.id);
      } catch (err) {
        console.warn("Failed to mark notification as read:", err);
      } finally {
        pendingReadMutationsRef.current = Math.max(0, pendingReadMutationsRef.current - 1);
      }
    }
  };

  const handleMarkAllAsRead = async () => {
    notifications.forEach((n) => {
      if (n?.id != null) locallyReadIdsRef.current.add(n.id);
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true, unread: false })));
    setUnreadCount(0);
    pendingReadMutationsRef.current += 1;
    try {
      await driverApi.markAllNotificationsRead();
    } catch (err) {
      console.warn("Failed to mark all notifications as read:", err);
    } finally {
      pendingReadMutationsRef.current = Math.max(0, pendingReadMutationsRef.current - 1);
    }
  };

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

          const [res] = await Promise.all([
            driverApi.orders("All"),
            syncNotifications(),
          ]);
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

      const interval = setInterval(async () => {
        if (!active) return;
        syncNotifications();
        try {
          const res = await driverApi.orders("All");
          if (active && res?.data) setOrders(res.data);
        } catch {
          // offline / ignore
        }
      }, 3000);

      return () => {
        active = false;
        clearInterval(interval);
      };
    }, [syncNotifications]),
  );

  const activeOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.status !== "Delivered" &&
          order.status !== "Completed" &&
          order.status !== "Cancelled",
      ),
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
          onPress={openNotifications}
          accessibilityLabel="Notifications"
          accessibilityRole="button"
        >
          <Ionicons name="notifications-outline" size={24} color="#121212" />
          {unreadCount > 0 ? (
            <View
              style={styles.unreadBadge}
              accessibilityLabel={`${unreadCount} unread notifications`}
            >
              <Text style={styles.unreadBadgeText}>
                {unreadCount > 99 ? "99+" : String(unreadCount)}
              </Text>
            </View>
          ) : null}
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
                    <Text style={styles.orderNumber}>Order {String(order.id || '').startsWith('#') ? order.id : `#${order.id}`}</Text>
                    <Feather name="package" size={22} color="#F97000" />
                  </View>
                  <Text style={styles.orderAmount}>
                    â‚±{Number(order.amount || 0).toFixed(2)}
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
                      pathname: "/(driver)/order-details",
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
                source={require("../../../assets/pizza.png")}
                style={styles.endStateImage}
              />
              <Text style={styles.endStateText}>End of history</Text>
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Image
              source={require("../../../assets/pizza.png")}
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
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                {notifications.some((n) => n.unread || !n.is_read) ? (
                  <TouchableOpacity activeOpacity={0.7} onPress={handleMarkAllAsRead}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#F97000", fontFamily: FONT }}>
                      Mark all as read
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={styles.closeButton}
                  activeOpacity={0.7}
                  onPress={() => setNotificationsVisible(false)}
                >
                  <Ionicons name="close" size={22} color="#121212" />
                </TouchableOpacity>
              </View>
            </View>
            {notificationsLoading ? (
              <View style={styles.notificationEmpty}>
                <ActivityIndicator size="small" color="#F97000" />
                <Text style={[styles.notificationEmptyText, { marginTop: 8 }]}>Loading notifications...</Text>
              </View>
            ) : notifications.length > 0 ? (
              notifications.map((notification) => {
                const isUnread = notification.unread || !notification.is_read;
                return (
                  <TouchableOpacity
                    key={notification.id}
                    activeOpacity={0.7}
                    onPress={() => handleNotificationPress(notification)}
                    style={[
                      styles.notificationItem,
                      isUnread && styles.notificationItemHighlighted,
                    ]}
                  >
                    <View style={[styles.notificationDot, !isUnread && { backgroundColor: "#D1D5DB" }]} />
                    <View style={styles.notificationContent}>
                      <Text style={[styles.notificationText, isUnread && { fontWeight: "700" }]}>
                        {notification.title}
                      </Text>
                      {notification.message || notification.detail ? (
                        <Text style={styles.notificationDetail}>
                          {notification.message || notification.detail}
                        </Text>
                      ) : null}
                      <Text style={styles.notificationTime}>
                        {notification.time || notification.timestamp || "Just now"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={styles.notificationEmpty}>
                <Ionicons name="notifications-off-outline" size={32} color="#D1D5DB" style={{ marginBottom: 6 }} />
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
    alignItems: "center",
    backgroundColor: "#EF4444",
    borderColor: "#FFFFFF",
    borderRadius: 9,
    borderWidth: 1.5,
    height: 18,
    justifyContent: "center",
    minWidth: 18,
    paddingHorizontal: 4,
    position: "absolute",
    right: 2,
    top: 2,
  },
  unreadBadgeText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 12,
    textAlign: "center",
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
