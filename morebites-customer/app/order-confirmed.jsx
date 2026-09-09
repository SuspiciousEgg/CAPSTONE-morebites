import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCart } from "../src/context/CartContext";
import { feesFromOrder } from "../src/api/fees";

const FONT = "Plus Jakarta Sans";
const PRIMARY = "#F97000";

function parseOrder(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function DetailRow({ label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function SummaryRow({ label, value, total }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, total && styles.totalLabel]}>{label}</Text>
      <Text style={[styles.summaryValue, total && styles.totalValue]}>₱{Number(value).toLocaleString()}</Text>
    </View>
  );
}

export default function OrderConfirmedScreen() {
  const params = useLocalSearchParams();
  const order = parseOrder(params.order);
  const { clearCart } = useCart();
  const clearCartOnMount = useRef(clearCart);
  const orderId = order.orderId || order.id || params.orderId || "#ORD-0000";
  const items = Array.isArray(order.items) ? order.items : [];
  const total = Number(order.total) || 0;
  const { deliveryFee, serviceFee } = feesFromOrder(order);
  const subtotal = Math.max(total - deliveryFee - serviceFee, 0);
  const address =
    order.address ||
    [order.street, order.barangay, order.city].filter(Boolean).join(", ") ||
    "Delivery address unavailable";

  useEffect(() => {
    clearCartOnMount.current();
  }, []);

  const trackOrder = () => {
    router.push({
      pathname: "/order-tracking",
      params: { orderId, order: JSON.stringify(order) },
    });
  };

  const backToMenu = () => {
    clearCart();
    router.replace("/(tabs)/home");
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topSection}>
          <Ionicons name="checkmark-circle" size={80} color="#22C55E" />
          <Text style={styles.title}>Order Confirmed!</Text>
          <Text style={styles.subtitle}>Your delicious food is on its way</Text>
          <View style={styles.orderBadge}>
            <Text style={styles.orderBadgeText}>{orderId}</Text>
          </View>
        </View>

        <View style={styles.detailsCard}>
          <DetailRow label="Estimated Time" value="10 - 15 mins" />
          <DetailRow label="Delivery Address" value={address} />
          <DetailRow label="Payment Method" value="Cash on Delivery" />
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          {items.map((item) => (
            <View key={`${item.id}-${item.size}`} style={styles.itemRow}>
              <Text style={styles.itemText}>
                {item.quantity}x {item.name}{item.size ? ` (${item.size})` : ""}
              </Text>
              <Text style={styles.itemPrice}>₱{(item.price * item.quantity).toLocaleString()}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <SummaryRow label="Subtotal" value={subtotal} />
          <SummaryRow label="Delivery Fee" value={deliveryFee} />
          <SummaryRow label="Service Fee" value={serviceFee} />
          <View style={styles.divider} />
          <SummaryRow label="Total Amount" value={total} total />
        </View>

        <Pressable style={styles.trackButton} onPress={trackOrder}>
          <Text style={styles.trackButtonText}>Track My Order →</Text>
        </Pressable>
        <Pressable style={styles.menuButton} onPress={backToMenu}>
          <Text style={styles.menuButtonText}>Back to Menu</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 24,
  },
  topSection: {
    alignItems: "center",
  },
  title: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 26,
    fontWeight: "700",
    marginTop: 16,
  },
  subtitle: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 14,
    marginTop: 8,
  },
  orderBadge: {
    borderWidth: 1,
    borderColor: PRIMARY,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: 16,
  },
  orderBadgeText: {
    color: PRIMARY,
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "700",
  },
  detailsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginTop: 28,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  detailLabel: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 13,
  },
  detailValue: {
    flex: 1,
    color: "#121212",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right",
    marginLeft: 20,
  },
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  sectionTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  itemText: {
    flex: 1,
    color: "#4B5563",
    fontFamily: FONT,
    fontSize: 13,
    marginRight: 12,
  },
  itemPrice: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: "#F0F0F0",
    marginVertical: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryLabel: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 13,
  },
  summaryValue: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "600",
  },
  totalLabel: {
    color: "#121212",
    fontWeight: "700",
  },
  totalValue: {
    color: PRIMARY,
    fontSize: 16,
    fontWeight: "700",
  },
  trackButton: {
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PRIMARY,
    borderRadius: 9,
    marginTop: 24,
  },
  trackButtonText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 17,
    fontWeight: "700",
  },
  menuButton: {
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D4D4D4",
    borderRadius: 9,
    marginTop: 12,
  },
  menuButtonText: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: "700",
  },
});
