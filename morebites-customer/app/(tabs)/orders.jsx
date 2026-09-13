/**
 * PROMPT 17 INVESTIGATION REPORT: Mobile Orders Tab Restoration
 *
 * 1. Current State vs. Missing Requirements:
 *    - Header:
 *      * Existed: Static centered "My Orders" title with no action items.
 *      * Missing: Notification bell icon (`Ionicons name="notifications"`) in the top right,
 *        dynamic red indicator indicating unread notifications count, and the notifications panel/modal.
 *    - Status-Dependent Action Buttons:
 *      * Existed: Broad condition `canTrack = ["Out for Delivery", "Assigned", "Picked Up"]` and `canRate`
 *        for completed/delivered orders, causing "Track" to appear prematurely when an order was only
 *        assigned or picked up.
 *      * Missing: Strict status-to-button mapping where ONLY "Out for Delivery" displays the "Track" button
 *        (solid black, with location icon) side-by-side with "View Details" (outline button). All other stages
 *        (Assigned, Pending, Preparing, Completed, Cancelled) display "View Details" only.
 *    - End of History Footer:
 *      * Existed: None (the list simply ended with empty bottom padding).
 *      * Missing: Centered footer element featuring the muted food illustration (`assets/images/pizza.png`)
 *        and "End of history" text in gray once all orders for the active filter have rendered.
 *
 * 2. Restoration vs. New Functionality:
 *    - In the initial codebase commit (c72b419), this exact UI pattern (header notification bell with
 *      unread badge, notifications modal overlay with read/unread indicators, and end-of-history footer
 *      with the pizza illustration) was originally created in the project (originally colocated in the
 *      driver home tab).
 *    - During subsequent customer app iterations and backend API integration, the notification bell,
 *      badge, modal, and footer were omitted, and button logic diverged.
 *    - Therefore, this is a RESTORATION of previously-specified design features, updated to consume
 *      the live, per-user-scoped Laravel `notifications` and `notification_reads` database source of truth.
 */

import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { customerApi } from "../../src/api/client";
import { feesFromOrder } from "../../src/api/fees";

const FONT = "Plus Jakarta Sans";
const PRIMARY = "#F97000";

const STATUS_ICONS = {
  "Out for Delivery": "bicycle",
  Assigned: "bicycle",
  Delivered: "checkmark-circle-outline",
  Completed: "checkmark-circle-outline",
  Preparing: "flame-outline",
  Pending: "time-outline",
  Cancelled: "close-circle-outline",
};

function StatusIndicator({ status }) {
  const icon = STATUS_ICONS[status] || "time-outline";
  return (
    <View style={styles.statusIndicator}>
      <Ionicons name={icon} size={18} color="#121212" />
      <Text style={styles.statusText}>{status}</Text>
    </View>
  );
}

function OrderCard({ order, onViewDetails }) {
  // Only the "Out for Delivery" status displays the "Track" button
  const isOutForDelivery = order.status === "Out for Delivery";

  return (
    <View style={styles.orderCard}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.orderIdLabel}>ORDER ID</Text>
          <Text style={styles.orderId}>{order.id}</Text>
        </View>
        <StatusIndicator status={order.status} />
      </View>

      <Text style={styles.itemsText}>{order.itemsLabel}</Text>

      <View style={styles.dateRow}>
        <Ionicons name="calendar-outline" size={14} color="#9CA3AF" />
        <Text style={styles.dateText}>{order.dateLabel}</Text>
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>TOTAL AMOUNT</Text>
        <Text style={styles.totalAmount}>₱{Number(order.total).toLocaleString()}</Text>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          style={[styles.detailsButton, isOutForDelivery && styles.detailsButtonHalf]}
          onPress={() => onViewDetails(order)}
        >
          <Text style={styles.detailsButtonText}>View Details</Text>
        </Pressable>
        {isOutForDelivery ? (
          <Pressable
            style={styles.trackButton}
            onPress={() =>
              router.push({
                pathname: "/order-tracking",
                params: { orderId: order.id, dbId: String(order.db_id || "") },
              })
            }
          >
            <Ionicons name="location-outline" size={16} color="#FFFFFF" />
            <Text style={styles.trackButtonText}>Track</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function EndOfHistory() {
  return (
    <View style={styles.endState}>
      <Image
        source={require("../../assets/images/pizza.png")}
        style={styles.endStateImage}
      />
      <Text style={styles.endStateText}>End of history</Text>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <Ionicons name="receipt-outline" size={68} color="#D1D5DB" />
      <Text style={styles.emptyTitle}>No orders yet</Text>
      <Text style={styles.emptySubtitle}>Your order history will appear here</Text>
      <Pressable style={styles.orderNowButton} onPress={() => router.push("/(tabs)/home")}>
        <Text style={styles.orderNowText}>Order Now</Text>
      </Pressable>
    </View>
  );
}

function SummaryRow({ label, value, total, discount }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, total && styles.summaryTotalLabel]}>{label}</Text>
      <Text
        style={[
          styles.summaryValue,
          total && styles.summaryTotalValue,
          discount && styles.discountValue,
        ]}
      >
        {discount ? "- ₱0" : `₱${Number(value).toLocaleString()}`}
      </Text>
    </View>
  );
}

function OrderDetailsModal({ visible, order, onClose }) {
  if (!order) return null;

  const { deliveryFee, serviceFee } = feesFromOrder(order);
  const subtotal = Math.max(0, Number(order.total) - deliveryFee - serviceFee);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.detailsModalOverlay} onPress={onClose}>
        <Pressable style={styles.detailsSheet} onPress={(event) => event.stopPropagation()}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.detailsHeader}>
              <View>
                <Text style={styles.orderIdLabel}>ORDER ID</Text>
                <Text style={styles.detailsOrderId}>{order.id}</Text>
              </View>
              <StatusIndicator status={order.status} />
            </View>

            <View style={styles.detailsDateRow}>
              <Ionicons name="calendar-outline" size={15} color="#8A8A8A" />
              <Text style={styles.dateText}>{order.dateLabel}</Text>
            </View>

            <Text style={styles.sectionTitle}>Items</Text>
            <View style={styles.sectionCard}>
              {(order.items || []).map((item) => (
                <View key={item.id} style={styles.detailItemRow}>
                  <View style={styles.foodPlaceholder}>
                    <Ionicons name="fast-food-outline" size={25} color="#8A8A8A" />
                  </View>
                  <View style={styles.detailItemInfo}>
                    <Text style={styles.detailItemName}>{item.name}</Text>
                    {item.size ? <Text style={styles.detailItemSize}>Size: {item.size}</Text> : null}
                    <Text style={styles.detailItemPrice}>₱{item.price}</Text>
                  </View>
                  <Text style={styles.detailQuantity}>x{item.quantity}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Order Summary</Text>
            <View style={styles.sectionCard}>
              <SummaryRow label="Subtotal" value={subtotal} />
              <SummaryRow label="Delivery Fee" value={deliveryFee} />
              <SummaryRow label="Service Fee" value={serviceFee} />
              <SummaryRow label="Discount" value={0} discount />
              <View style={styles.summaryDivider} />
              <SummaryRow label="Total Amount" value={order.total} total />
            </View>

            <Text style={styles.sectionTitle}>Delivery Address</Text>
            <View style={styles.addressCard}>
              <Ionicons name="location-outline" size={20} color={PRIMARY} />
              <View style={styles.addressContent}>
                <Text style={styles.customerName}>{order.customer || "Customer"}</Text>
                <Text style={styles.addressText}>{order.address || "No address on file"}</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Payment Method</Text>
            <View style={styles.paymentCard}>
              <Ionicons name="cash-outline" size={20} color="#6B7280" />
              <Text style={styles.paymentText}>
                {order.payment_method === "COD" || !order.payment_method
                  ? "Cash on Delivery (COD)"
                  : order.payment_method}
              </Text>
            </View>

            {["Delivered", "Completed"].includes(order.status) ? (
              <>
                <Text style={styles.sectionTitle}>Proof of Delivery</Text>
                {order.proof_of_delivery ? (
                  <View style={styles.proofCard}>
                    <Image
                      source={{ uri: order.proof_of_delivery }}
                      style={styles.proofImage}
                      resizeMode="cover"
                    />
                    <Text style={styles.proofCaption}>
                      Photo sent by your rider
                      {order.delivered_at_label ? ` · ${order.delivered_at_label}` : ""}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.proofEmpty}>
                    <Ionicons name="image-outline" size={22} color="#9CA3AF" />
                    <Text style={styles.proofEmptyText}>
                      No delivery photo was uploaded for this order.
                    </Text>
                  </View>
                )}
              </>
            ) : null}
          </ScrollView>

          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function NotificationsModal({
  visible,
  notifications,
  loading,
  onClose,
  onNotificationPress,
  onMarkAllAsRead,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.notificationsPanel} onPress={(e) => e.stopPropagation()}>
          <View style={styles.notificationsHeader}>
            <Text style={styles.notificationsTitle}>Notifications</Text>
            <Pressable style={styles.modalCloseButton} hitSlop={8} onPress={onClose}>
              <Ionicons name="close" size={22} color="#121212" />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.notificationLoading}>
              <ActivityIndicator size="small" color={PRIMARY} />
              <Text style={styles.notificationLoadingText}>Loading notifications...</Text>
            </View>
          ) : notifications.length === 0 ? (
            <View style={styles.notificationEmpty}>
              <Ionicons name="notifications-off-outline" size={38} color="#D1D5DB" />
              <Text style={styles.notificationEmptyText}>No new notifications</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.notificationsList}
              contentContainerStyle={styles.notificationsListContent}
              showsVerticalScrollIndicator={false}
            >
              {notifications.map((item) => {
                const isUnread = Boolean(item.unread || (!item.is_read && item.is_read !== undefined));
                return (
                  <Pressable
                    key={item.id}
                    style={[styles.notificationItem, isUnread && styles.notificationItemUnread]}
                    onPress={() => onNotificationPress(item)}
                  >
                    <View style={styles.notificationBulletWrap}>
                      {isUnread ? (
                        <View style={styles.notificationDotUnread} />
                      ) : (
                        <View style={styles.notificationDotRead} />
                      )}
                    </View>
                    <View style={styles.notificationContent}>
                      <Text style={[styles.notificationText, isUnread && styles.notificationTextUnread]}>
                        {item.message || item.title}
                      </Text>
                      <Text style={styles.notificationTime}>
                        {item.time ||
                          (item.created_at
                            ? new Date(item.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "Just now")}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {notifications.some((n) => n.unread || !n.is_read) ? (
            <Pressable style={styles.markAllButton} onPress={onMarkAllAsRead}>
              <Text style={styles.markAllButtonText}>Mark all as read</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function OrdersScreen() {
  const [activeTab, setActiveTab] = useState("All");
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Notification states
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  const loadUnreadCount = useCallback(async () => {
    try {
      const res = await customerApi.unreadNotificationsCount();
      const count = Number(res?.count ?? res?.data?.count ?? 0);
      setUnreadCount(count);
    } catch {
      // offline or unauthenticated fallback
    }
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [ordersRes] = await Promise.all([
        customerApi.orders(),
        loadUnreadCount(),
      ]);
      setOrders(ordersRes.data || []);
    } catch (err) {
      setLoadError(err.message || "Failed to load orders");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [loadUnreadCount]);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [loadOrders]),
  );

  const openNotifications = async () => {
    setNotificationsVisible(true);
    setNotificationsLoading(true);
    try {
      const res = await customerApi.notifications();
      setNotifications(res.data || []);
      const countRes = await customerApi.unreadNotificationsCount();
      setUnreadCount(Number(countRes?.count ?? countRes?.data?.count ?? 0));
    } catch (err) {
      console.warn("Failed to load notifications:", err);
    } finally {
      setNotificationsLoading(false);
    }
  };

  const handleNotificationPress = async (item) => {
    if (item.unread || !item.is_read) {
      try {
        await customerApi.markNotificationRead(item.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, is_read: true, unread: false } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch (err) {
        console.warn("Failed to mark notification as read:", err);
      }
    }

    const orderData = item.data || {};
    const orderStatus = orderData.status;

    if (orderStatus === "Out for Delivery" || item.message?.includes("out for delivery")) {
      setNotificationsVisible(false);
      router.push({
        pathname: "/order-tracking",
        params: {
          orderId: orderData.order_code || String(orderData.order_id || ""),
          dbId: String(orderData.order_id || ""),
        },
      });
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await customerApi.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true, unread: false })));
      setUnreadCount(0);
    } catch (err) {
      console.warn("Failed to mark all notifications as read:", err);
    }
  };

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const visibleOrders =
    activeTab === "All"
      ? orders
      : orders.filter((order) => order.date && new Date(order.date) >= thirtyDaysAgo);

  const openDetails = (order) => {
    setSelectedOrder(order);
    setDetailsVisible(true);
  };

  const closeDetails = () => {
    setDetailsVisible(false);
    setSelectedOrder(null);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Orders</Text>
        <Pressable
          style={styles.bellButton}
          onPress={openNotifications}
          hitSlop={10}
          accessibilityLabel="Notifications"
          accessibilityRole="button"
        >
          <Ionicons name="notifications" size={22} color="#121212" />
          {unreadCount > 0 ? <View style={styles.unreadDot} /> : null}
        </Pressable>
      </View>

      <View style={styles.tabContainer}>
        {["All", "Past 30 Days"].map((tab) => {
          const active = tab === activeTab || (tab === "Past 30 Days" && activeTab === "Last 30 Days");
          return (
            <Pressable
              key={tab}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={PRIMARY} />
          <Text style={styles.helperText}>Loading orders...</Text>
        </View>
      ) : loadError ? (
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Could not load orders</Text>
          <Text style={styles.helperText}>{loadError}</Text>
          <Pressable style={styles.retryButton} onPress={loadOrders}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : visibleOrders.length === 0 ? (
        <EmptyState />
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {visibleOrders.map((order) => (
            <OrderCard key={order.db_id || order.id} order={order} onViewDetails={openDetails} />
          ))}
          <EndOfHistory />
        </ScrollView>
      )}

      <OrderDetailsModal visible={detailsVisible} order={selectedOrder} onClose={closeDetails} />

      <NotificationsModal
        visible={notificationsVisible}
        notifications={notifications}
        loading={notificationsLoading}
        onClose={() => setNotificationsVisible(false)}
        onNotificationPress={handleNotificationPress}
        onMarkAllAsRead={handleMarkAllAsRead}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#FFFFFF", flex: 1 },
  header: {
    alignItems: "center",
    borderBottomColor: "#F0F0F0",
    borderBottomWidth: 1,
    flexDirection: "row",
    height: 58,
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  headerTitle: { color: "#121212", fontFamily: FONT, fontSize: 24, fontWeight: "800" },
  bellButton: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    position: "relative",
    width: 40,
  },
  unreadDot: {
    backgroundColor: "#EF4444",
    borderColor: "#FFFFFF",
    borderRadius: 5,
    borderWidth: 1.5,
    height: 10,
    position: "absolute",
    right: 7,
    top: 6,
    width: 10,
  },
  tabContainer: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    flexDirection: "row",
    marginHorizontal: 16,
    marginVertical: 14,
    padding: 4,
  },
  tab: {
    alignItems: "center",
    borderRadius: 10,
    flex: 1,
    justifyContent: "center",
    paddingVertical: 10,
  },
  tabActive: { backgroundColor: "#000000" },
  tabText: { color: "#6B7280", fontFamily: FONT, fontSize: 14, fontWeight: "600" },
  tabTextActive: { color: "#FFFFFF", fontWeight: "700" },
  list: { paddingBottom: 24, paddingHorizontal: 16 },
  orderCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    borderRadius: 16,
    borderWidth: 1,
    elevation: 1,
    marginBottom: 14,
    padding: 16,
    shadowColor: "#000000",
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  orderIdLabel: { color: "#9CA3AF", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  orderId: { color: "#121212", fontSize: 15, fontWeight: "800", marginTop: 2 },
  statusIndicator: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  statusText: { color: "#121212", fontFamily: FONT, fontSize: 13, fontWeight: "700" },
  itemsText: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 8,
  },
  dateRow: { alignItems: "center", flexDirection: "row", gap: 6, marginBottom: 12 },
  dateText: { color: "#9CA3AF", fontFamily: FONT, fontSize: 12, fontWeight: "500" },
  totalRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  totalLabel: { color: "#9CA3AF", fontFamily: FONT, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  totalAmount: { color: "#F97000", fontFamily: FONT, fontSize: 18, fontWeight: "800" },
  actionRow: { flexDirection: "row", gap: 12 },
  detailsButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    paddingVertical: 12,
  },
  detailsButtonHalf: {
    flex: 1,
  },
  detailsButtonText: { color: "#121212", fontFamily: FONT, fontSize: 14, fontWeight: "700" },
  trackButton: {
    alignItems: "center",
    backgroundColor: "#000000",
    borderRadius: 10,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    paddingVertical: 12,
  },
  trackButtonText: { color: "#FFFFFF", fontFamily: FONT, fontSize: 14, fontWeight: "700" },
  endState: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 40,
    paddingTop: 32,
  },
  endStateImage: {
    height: 72,
    resizeMode: "contain",
    tintColor: "#B8BDC3",
    width: 72,
  },
  endStateText: {
    color: "#B8BDC3",
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 10,
  },
  emptyState: { alignItems: "center", flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  emptyTitle: { color: "#121212", fontSize: 18, fontWeight: "800", marginTop: 12 },
  emptySubtitle: { color: "#9CA3AF", fontSize: 13, marginTop: 6, textAlign: "center" },
  orderNowButton: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    marginTop: 18,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  orderNowText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  centered: { alignItems: "center", paddingTop: 48 },
  helperText: { color: "#9CA3AF", fontSize: 13, marginTop: 8, textAlign: "center" },
  errorTitle: { color: "#121212", fontSize: 16, fontWeight: "700" },
  retryButton: {
    backgroundColor: PRIMARY,
    borderRadius: 10,
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: { color: "#FFFFFF", fontWeight: "700" },
  detailsModalOverlay: {
    backgroundColor: "rgba(0,0,0,0.45)",
    flex: 1,
    justifyContent: "flex-end",
  },
  detailsSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "88%",
    padding: 20,
  },
  detailsHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  detailsOrderId: { color: "#121212", fontSize: 18, fontWeight: "800", marginTop: 2 },
  detailsDateRow: { alignItems: "center", flexDirection: "row", gap: 6, marginTop: 10 },
  sectionTitle: {
    color: "#121212",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 8,
    marginTop: 18,
  },
  sectionCard: {
    backgroundColor: "#FAFAFA",
    borderRadius: 12,
    padding: 12,
  },
  detailItemRow: { alignItems: "center", flexDirection: "row", gap: 10, marginBottom: 10 },
  foodPlaceholder: {
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  detailItemInfo: { flex: 1 },
  detailItemName: { color: "#121212", fontSize: 14, fontWeight: "700" },
  detailItemSize: { color: "#9CA3AF", fontSize: 12, marginTop: 2 },
  detailItemPrice: { color: PRIMARY, fontSize: 13, fontWeight: "700", marginTop: 2 },
  detailQuantity: { color: "#6B7280", fontSize: 13, fontWeight: "700" },
  summaryRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryLabel: { color: "#6B7280", fontSize: 13 },
  summaryValue: { color: "#121212", fontSize: 13, fontWeight: "600" },
  summaryTotalLabel: { color: "#121212", fontWeight: "800" },
  summaryTotalValue: { color: PRIMARY, fontSize: 15, fontWeight: "800" },
  discountValue: { color: "#22C55E" },
  summaryDivider: { backgroundColor: "#E5E7EB", height: 1, marginBottom: 8, marginTop: 4 },
  addressCard: {
    alignItems: "flex-start",
    backgroundColor: "#FAFAFA",
    borderRadius: 12,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  addressContent: { flex: 1 },
  customerName: { color: "#121212", fontSize: 14, fontWeight: "700", marginBottom: 4 },
  addressText: { color: "#6B7280", fontSize: 13, lineHeight: 18 },
  paymentCard: {
    alignItems: "center",
    backgroundColor: "#FAFAFA",
    borderRadius: 12,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  paymentText: { color: "#374151", fontSize: 13, fontWeight: "600" },
  proofCard: {
    backgroundColor: "#FAFAFA",
    borderRadius: 12,
    overflow: "hidden",
  },
  proofImage: {
    backgroundColor: "#F3F4F6",
    height: 220,
    width: "100%",
  },
  proofCaption: {
    color: "#6B7280",
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  proofEmpty: {
    alignItems: "center",
    backgroundColor: "#FAFAFA",
    borderRadius: 12,
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  proofEmptyText: { color: "#6B7280", flex: 1, fontSize: 13, lineHeight: 18 },
  closeButton: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: 12,
    marginTop: 16,
    paddingVertical: 14,
  },
  closeButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },

  // Notifications Modal Styles
  modalOverlay: {
    backgroundColor: "rgba(0,0,0,0.45)",
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 56,
  },
  notificationsPanel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    elevation: 10,
    maxHeight: "82%",
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  notificationsHeader: {
    alignItems: "center",
    borderBottomColor: "#F3F4F6",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  notificationsTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 19,
    fontWeight: "700",
  },
  modalCloseButton: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  notificationLoading: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
  },
  notificationLoadingText: {
    color: "#9CA3AF",
    fontSize: 13,
    marginTop: 8,
  },
  notificationsList: {
    maxHeight: 380,
  },
  notificationsListContent: {
    paddingHorizontal: 18,
    paddingVertical: 4,
  },
  notificationItem: {
    borderBottomColor: "#F3F4F6",
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingVertical: 14,
  },
  notificationItemUnread: {
    backgroundColor: "#FFFDF9",
  },
  notificationBulletWrap: {
    alignItems: "center",
    marginRight: 12,
    marginTop: 5,
    width: 14,
  },
  notificationDotUnread: {
    backgroundColor: PRIMARY,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  notificationDotRead: {
    borderColor: "#9CA3AF",
    borderRadius: 5,
    borderWidth: 1.5,
    height: 10,
    width: 10,
  },
  notificationContent: {
    flex: 1,
  },
  notificationText: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  notificationTextUnread: {
    color: "#121212",
    fontWeight: "700",
  },
  notificationTime: {
    color: "#9CA3AF",
    fontSize: 11,
    marginTop: 4,
  },
  notificationEmpty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 42,
  },
  notificationEmptyText: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 14,
    marginTop: 10,
  },
  markAllButton: {
    alignItems: "center",
    borderTopColor: "#F3F4F6",
    borderTopWidth: 1,
    paddingVertical: 13,
  },
  markAllButtonText: {
    color: PRIMARY,
    fontSize: 13,
    fontWeight: "700",
  },
});
