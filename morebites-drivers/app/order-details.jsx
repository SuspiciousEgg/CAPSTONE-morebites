import { useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  formatPeso,
  statusStep,
  useDriverOrder,
} from "../src/hooks/useDriverOrder";

const FONT = "Plus Jakarta Sans";
const STEPS = ["Assigned", "Picked up", "Out for delivery", "Delivered"];

export default function OrderDetailsScreen() {
  const params = useLocalSearchParams();
  const orderId = Array.isArray(params.id) ? params.id[0] : params.id || "";
  const dbId = Array.isArray(params.dbId) ? params.dbId[0] : params.dbId;
  const { order, loading, error, reload } = useDriverOrder(dbId);

  useEffect(() => {
    reload();
  }, [reload]);

  const currentStep = statusStep(order?.status);
  const isDelivered = order?.status === "Delivered";
  const canProceed = !isDelivered && Boolean(order?.status);
  const buttonLabel = isDelivered
    ? "Completed"
    : order?.status === "Assigned"
      ? "Proceed →"
      : "Continue →";

  const continueOrder = () => {
    if (!order || isDelivered) return;
    const params = {
      id: String(order.id || orderId),
      dbId: String(dbId),
    };

    if (order.status === "Assigned") {
      router.push({ pathname: "/pickup-checklist", params });
      return;
    }
    if (order.status === "Picked Up") {
      router.push({ pathname: "/pickup-confirmed", params });
      return;
    }
    if (order.status === "Out for Delivery") {
      router.push({ pathname: "/out-for-delivery", params });
      return;
    }
    router.push({ pathname: "/confirm-delivery", params });
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          activeOpacity={0.7}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={27} color="#121212" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Order #{order?.id || orderId}</Text>
          <Text style={styles.headerSubtitle}>{order?.status || "Loading"}</Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      <View style={styles.progressSection}>
        {STEPS.map((step, index) => {
          const stepNumber = index + 1;
          const isCurrent = stepNumber === currentStep;

          return (
            <View key={step} style={styles.progressItem}>
              {index > 0 ? <View style={styles.progressLine} /> : null}
              <View
                style={[
                  styles.progressCircle,
                  isCurrent && styles.progressCircleCurrent,
                ]}
              >
                <Text
                  style={[
                    styles.progressNumber,
                    isCurrent && styles.progressNumberCurrent,
                  ]}
                >
                  {stepNumber}
                </Text>
              </View>
              <Text
                style={[
                  styles.progressLabel,
                  isCurrent && styles.progressLabelCurrent,
                ]}
              >
                {step}
              </Text>
            </View>
          );
        })}
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", paddingTop: 40 }}>
          <ActivityIndicator size="large" color="#F97000" />
        </View>
      ) : error ? (
        <View style={{ padding: 24 }}>
          <Text style={{ color: "#D94343", textAlign: "center" }}>{error}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionLabel}>CUSTOMER</Text>
          <View style={styles.card}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Name</Text>
              <Text style={styles.detailValue}>{order.customer}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Address</Text>
              <Text style={styles.detailValue}>{order.address}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Contact</Text>
              <Text style={styles.detailValue}>{order.contact || "N/A"}</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>ITEMS</Text>
          <View style={styles.card}>
            {(order.items || []).map((item, index) => (
              <View key={`${item.name}-${index}`}>
                {index > 0 ? <View style={styles.itemDivider} /> : null}
                <View style={styles.itemRow}>
                  <Text style={styles.itemName}>{item.label}</Text>
                  <Text style={styles.itemPrice}>{formatPeso(item.line_total)}</Text>
                </View>
              </View>
            ))}
            <View style={styles.totalDivider} />
            <View style={styles.itemRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalPrice}>{formatPeso(order.amount)}</Text>
            </View>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Payment</Text>
              <View style={styles.codBadge}>
                <Text style={styles.codText}>{order.payment_method || "COD"}</Text>
                <Ionicons name="checkmark" size={16} color="#22C55E" />
              </View>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Distance</Text>
              <Text style={styles.summaryValue}>{order.distance} away</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Est. time</Text>
              <Text style={styles.summaryValue}>~{order.eta_mins} mins</Text>
            </View>
          </View>
        </ScrollView>
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.proceedButton,
            !canProceed && { opacity: 0.5 },
            isDelivered && styles.completedButton,
          ]}
          activeOpacity={canProceed ? 0.85 : 1}
          disabled={!canProceed}
          onPress={continueOrder}
        >
          <Text style={styles.proceedButtonText}>{buttonLabel}</Text>
        </TouchableOpacity>
      </View>
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
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 68,
    paddingHorizontal: 14,
  },
  headerButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    position: "relative",
    width: 44,
  },
  headerCenter: {
    alignItems: "center",
  },
  headerTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 20,
    fontWeight: "700",
  },
  headerSubtitle: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  progressSection: {
    borderBottomColor: "#F3F4F6",
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingBottom: 16,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  progressItem: {
    alignItems: "center",
    flex: 1,
    position: "relative",
  },
  progressLine: {
    backgroundColor: "#9CA3AF",
    height: 1,
    position: "absolute",
    right: "50%",
    top: 24,
    width: "100%",
  },
  progressCircle: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#9CA3AF",
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48,
    zIndex: 1,
  },
  progressCircleCurrent: {
    backgroundColor: "#F97000",
    borderColor: "#F97000",
  },
  progressNumber: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "700",
  },
  progressNumberCurrent: {
    color: "#FFFFFF",
  },
  progressLabel: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 10,
    lineHeight: 13,
    marginTop: 6,
    minHeight: 26,
    textAlign: "center",
  },
  progressLabelCurrent: {
    color: "#F97000",
    fontWeight: "700",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 22,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  sectionLabel: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: "#F3F4F6",
    borderRadius: 12,
    borderWidth: 1,
    elevation: 1,
    marginBottom: 16,
    padding: 14,
    shadowColor: "#121212",
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 7,
  },
  detailRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  detailLabel: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 12,
  },
  detailValue: {
    color: "#121212",
    flex: 1,
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "700",
    marginLeft: 18,
    textAlign: "right",
  },
  itemRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  itemName: {
    color: "#121212",
    flex: 1,
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "600",
  },
  itemPrice: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
  },
  itemDivider: {
    backgroundColor: "#F3F4F6",
    height: 1,
  },
  totalDivider: {
    backgroundColor: "#9CA3AF",
    height: 1,
    marginTop: 5,
  },
  totalLabel: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: "700",
  },
  totalPrice: {
    color: "#F97000",
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: "700",
  },
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#F3F4F6",
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  summaryRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 34,
  },
  summaryLabel: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 14,
  },
  summaryValue: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "600",
  },
  summaryDivider: {
    backgroundColor: "#F3F4F6",
    height: 1,
    marginBottom: 4,
  },
  codBadge: {
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    borderRadius: 8,
    flexDirection: "row",
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  codText: {
    color: "#22C55E",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "700",
  },
  footer: {
    backgroundColor: "#FFFFFF",
    borderTopColor: "#F3F4F6",
    borderTopWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  proceedButton: {
    alignItems: "center",
    backgroundColor: "#F97000",
    borderRadius: 9,
    height: 54,
    justifyContent: "center",
  },
  completedButton: {
    backgroundColor: "#22C55E",
    opacity: 1,
  },
  proceedButtonText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "700",
  },
});
