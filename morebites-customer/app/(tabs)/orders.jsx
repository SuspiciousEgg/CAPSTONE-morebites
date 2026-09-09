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

const STATUS_DETAILS = {
  "Out for Delivery": { icon: "bicycle" },
  Assigned: { icon: "bicycle" },
  Delivered: { icon: "checkmark-circle" },
  Completed: { icon: "checkmark-circle" },
  Preparing: { icon: "flame" },
  Pending: { icon: "time" },
  Cancelled: { icon: "close-circle" },
};

function StatusBadge({ status }) {
  const details = STATUS_DETAILS[status] || STATUS_DETAILS.Pending;
  const badgeStyle =
    {
      "Out for Delivery": styles.deliveryBadge,
      Assigned: styles.deliveryBadge,
      Delivered: styles.completedBadge,
      Completed: styles.completedBadge,
      Preparing: styles.preparingBadge,
      Pending: styles.pendingBadge,
      Cancelled: styles.cancelledBadge,
    }[status] || styles.pendingBadge;

  return (
    <View style={[styles.statusBadge, badgeStyle]}>
      <Ionicons name={details.icon} size={12} color="#FFFFFF" />
      <Text style={styles.statusText}>{status}</Text>
    </View>
  );
}

function OrderCard({ order, onViewDetails }) {
  const canTrack = ["Out for Delivery", "Assigned", "Picked Up"].includes(order.status);
  const canRate = Boolean(order.can_rate) || (["Delivered", "Completed"].includes(order.status) && !order.rated);

  return (
    <View style={styles.orderCard}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.orderIdLabel}>ORDER ID</Text>
          <Text style={styles.orderId}>{order.id}</Text>
        </View>
        <StatusBadge status={order.status} />
      </View>

      <View style={styles.itemSummaryRow}>
        <Ionicons name="pizza-outline" size={16} color={PRIMARY} />
        <Text style={styles.itemsText}>{order.itemsLabel}</Text>
      </View>

      <View style={styles.dateRow}>
        <Ionicons name="calendar-outline" size={14} color="#9CA3AF" />
        <Text style={styles.dateText}>{order.dateLabel}</Text>
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>TOTAL AMOUNT</Text>
        <Text style={styles.totalAmount}>₱{Number(order.total).toLocaleString()}</Text>
      </View>

      <View style={styles.actionRow}>
        <Pressable style={styles.detailsButton} onPress={() => onViewDetails(order)}>
          <Text style={styles.detailsButtonText}>View Details</Text>
        </Pressable>
        {canTrack ? (
          <Pressable
            style={styles.trackButton}
            onPress={() =>
              router.push({
                pathname: "/order-tracking",
                params: { orderId: order.id, dbId: String(order.db_id || "") },
              })
            }
          >
            <Ionicons name="location-outline" size={15} color="#FFFFFF" />
            <Text style={styles.trackButtonText}>Track</Text>
          </Pressable>
        ) : null}
        {canRate ? (
          <Pressable
            style={styles.trackButton}
            onPress={() =>
              router.push({
                pathname: "/rate-order",
                params: {
                  dbId: String(order.db_id || ""),
                  foodName: order.food_name || order.itemsLabel || "Your order",
                  foodPrice: String(order.food_price || order.total || 0),
                  riderName: order.driver || "Your delivery rider",
                },
              })
            }
          >
            <Ionicons name="star-outline" size={15} color="#FFFFFF" />
            <Text style={styles.trackButtonText}>Rate</Text>
          </Pressable>
        ) : null}
      </View>
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
              <StatusBadge status={order.status} />
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

export default function OrdersScreen() {
  const [activeTab, setActiveTab] = useState("All");
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await customerApi.orders();
      setOrders(res.data || []);
    } catch (err) {
      setLoadError(err.message || "Failed to load orders");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [loadOrders]),
  );

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
      </View>

      <View style={styles.tabRow}>
        {["All", "Last 30 Days"].map((tab) => {
          const active = tab === activeTab;
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
        </ScrollView>
      )}

      <OrderDetailsModal visible={detailsVisible} order={selectedOrder} onClose={closeDetails} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#FFFFFF", flex: 1 },
  header: {
    alignItems: "center",
    borderBottomColor: "#F0F0F0",
    borderBottomWidth: 1,
    height: 58,
    justifyContent: "center",
  },
  headerTitle: { color: "#121212", fontFamily: FONT, fontSize: 20, fontWeight: "700" },
  tabRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  tab: {
    backgroundColor: "#F3F4F6",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tabActive: { backgroundColor: PRIMARY },
  tabText: { color: "#6B7280", fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: "#FFFFFF" },
  list: { gap: 12, paddingBottom: 28, paddingHorizontal: 16 },
  orderCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#F3F4F6",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  cardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  orderIdLabel: { color: "#9CA3AF", fontSize: 11, fontWeight: "600", letterSpacing: 0.4 },
  orderId: { color: "#121212", fontSize: 16, fontWeight: "800", marginTop: 2 },
  statusBadge: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  deliveryBadge: { backgroundColor: "#3B82F6" },
  completedBadge: { backgroundColor: "#22C55E" },
  preparingBadge: { backgroundColor: PRIMARY },
  pendingBadge: { backgroundColor: "#F59E0B" },
  cancelledBadge: { backgroundColor: "#EF4444" },
  statusText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  itemSummaryRow: { alignItems: "center", flexDirection: "row", gap: 8, marginBottom: 8 },
  itemsText: { color: "#374151", flex: 1, fontSize: 13 },
  dateRow: { alignItems: "center", flexDirection: "row", gap: 6, marginBottom: 10 },
  dateText: { color: "#9CA3AF", fontSize: 12 },
  totalRow: {
    alignItems: "center",
    borderTopColor: "#F3F4F6",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 10,
  },
  totalLabel: { color: "#9CA3AF", fontSize: 11, fontWeight: "600" },
  totalAmount: { color: PRIMARY, fontSize: 16, fontWeight: "800" },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  detailsButton: {
    alignItems: "center",
    borderColor: PRIMARY,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  detailsButtonText: { color: PRIMARY, fontSize: 13, fontWeight: "700" },
  trackButton: {
    alignItems: "center",
    backgroundColor: PRIMARY,
    borderRadius: 10,
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  trackButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
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
    alignItems: "flex-start",
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
});
