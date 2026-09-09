import { useCallback, useMemo, useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import { router, useFocusEffect } from "expo-router";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { driverApi } from "../../src/api/client";
import { formatPeso } from "../../src/hooks/useDriverOrder";

const FONT = "Plus Jakarta Sans";

function formatDeliveredAt(value) {
  if (!value) return "Delivered";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Delivered";
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function DeliveredScreen() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const load = async () => {
        setLoading(true);
        setLoadError("");
        try {
          const res = await driverApi.orders("Delivered");
          if (active) setOrders(res.data || []);
        } catch (err) {
          if (active) {
            setLoadError(err.message || "Failed to load delivered orders");
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

  const deliveredOrders = useMemo(
    () =>
      [...orders].sort((a, b) => {
        const aTime = new Date(a.delivered_at || a.created_at || 0).getTime();
        const bTime = new Date(b.delivered_at || b.created_at || 0).getTime();
        return bTime - aTime;
      }),
    [orders],
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Delivered</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{deliveredOrders.length}</Text>
        </View>
      </View>
      <Text style={styles.subtitle}>Completed deliveries stay here</Text>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color="#F97000" />
            <Text style={styles.emptyStateText}>Loading delivered orders...</Text>
          </View>
        ) : loadError ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>Could not load orders</Text>
            <Text style={styles.emptyStateText}>{loadError}</Text>
          </View>
        ) : deliveredOrders.length > 0 ? (
          deliveredOrders.map((order) => (
            <View key={order.db_id || order.id} style={styles.orderCard}>
              <View style={styles.orderTopRow}>
                <View style={styles.orderNumberRow}>
                  <Text style={styles.orderNumber}>Order #{order.id}</Text>
                  <Feather name="check-circle" size={20} color="#22C55E" />
                </View>
                <Text style={styles.orderAmount}>{formatPeso(order.amount)}</Text>
              </View>
              <Text style={styles.customerName}>{order.customer}</Text>
              <Text style={styles.locationText}>{order.location}</Text>
              <View style={styles.pillRow}>
                <View style={styles.deliveredBadge}>
                  <View style={styles.deliveredDot} />
                  <Text style={styles.pillText}>Delivered</Text>
                </View>
                <Text style={styles.timeText}>{formatDeliveredAt(order.delivered_at)}</Text>
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
                <Text style={styles.viewOrderText}>View details</Text>
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Image
              source={require("../../assets/pizza.png")}
              style={styles.emptyStateImage}
            />
            <Text style={styles.emptyStateTitle}>No delivered orders yet</Text>
            <Text style={styles.emptyStateText}>
              Finished deliveries will be stored in this tab
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    flex: 1,
    paddingHorizontal: 18,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingTop: 12,
  },
  headerTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 22,
    fontWeight: "700",
  },
  countBadge: {
    backgroundColor: "#E8F5E9",
    borderRadius: 12,
    minWidth: 28,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  countText: {
    color: "#16A34A",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 13,
    marginTop: 6,
  },
  list: { flex: 1, marginTop: 16 },
  listContent: { paddingBottom: 24 },
  orderCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#F3F4F6",
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
  },
  orderTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  orderNumberRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  orderNumber: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: "700",
  },
  orderAmount: {
    color: "#F97000",
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: "700",
  },
  customerName: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8,
  },
  locationText: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 13,
    marginTop: 2,
  },
  pillRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  deliveredBadge: {
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    borderRadius: 999,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  deliveredDot: {
    backgroundColor: "#22C55E",
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  pillText: {
    color: "#15803D",
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: "700",
  },
  timeText: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 12,
  },
  viewOrderButton: {
    alignItems: "center",
    backgroundColor: "#121212",
    borderRadius: 9,
    height: 44,
    justifyContent: "center",
    marginTop: 12,
  },
  viewOrderText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
  },
  emptyStateImage: {
    height: 90,
    marginBottom: 12,
    resizeMode: "contain",
    width: 90,
  },
  emptyStateTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyStateText: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
  },
});
