import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const FONT = "Plus Jakarta Sans";
const STEPS = ["Assigned", "Picked up", "Out for delivery", "Delivered"];

export default function DeliveryCompleteScreen() {
  const params = useLocalSearchParams();
  const orderId = Array.isArray(params.id) ? params.id[0] : params.id || "—";
  const customer = Array.isArray(params.customer)
    ? params.customer[0]
    : params.customer || "Customer";
  const distance = Array.isArray(params.distance)
    ? params.distance[0]
    : params.distance || "—";
  const duration = Array.isArray(params.duration)
    ? params.duration[0]
    : params.duration || "—";
  const total = Array.isArray(params.total)
    ? params.total[0]
    : params.total || "—";

  const backToDashboard = () => {
    router.replace("/(tabs)/delivered");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Centered header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Confirm Delivery</Text>
      </View>

      {/* 4-Step Progress Bar: All 4 steps green/completed */}
      <View style={styles.progressSection}>
        {STEPS.map((step, index) => {
          const stepNumber = index + 1;

          return (
            <View key={step} style={styles.progressItem}>
              {index > 0 ? (
                <View style={[styles.progressLine, styles.progressLineComplete]} />
              ) : null}
              <View style={[styles.progressCircle, styles.progressCircleComplete]}>
                <Text style={styles.progressNumberComplete}>{stepNumber}</Text>
              </View>
              <Text style={styles.progressLabelComplete}>{step}</Text>
            </View>
          );
        })}
      </View>

      {/* Main scrollable body centered vertically */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Success Section */}
        <View style={styles.successSection}>
          <View style={styles.checkmarkCircle}>
            <Ionicons name="checkmark" size={52} color="#FFFFFF" />
          </View>
          <Text style={styles.successTitle}>Delivery Complete</Text>
          <Text style={styles.successSubtitle}>
            Order #{orderId} · {customer}
          </Text>
        </View>

        {/* Delivery Summary Card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Delivery Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Distance</Text>
            <Text style={styles.summaryValue}>{distance}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Duration</Text>
            <Text style={styles.summaryValue}>{duration}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Order Total</Text>
            <Text style={styles.summaryValue}>{total}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Back to Dashboard Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.dashboardButton}
          activeOpacity={0.85}
          onPress={backToDashboard}
        >
          <Text style={styles.dashboardButtonText}>Back to Dashboard</Text>
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
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: 16,
  },
  headerTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 20,
    fontWeight: "700",
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
    backgroundColor: "#22C55E",
    height: 1,
    position: "absolute",
    right: "50%",
    top: 24,
    width: "100%",
  },
  progressLineComplete: {
    backgroundColor: "#22C55E",
  },
  progressCircle: {
    alignItems: "center",
    backgroundColor: "#22C55E",
    borderColor: "#22C55E",
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48,
    zIndex: 1,
  },
  progressCircleComplete: {
    backgroundColor: "#22C55E",
    borderColor: "#22C55E",
  },
  progressNumberComplete: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "700",
  },
  progressLabelComplete: {
    color: "#22C55E",
    fontFamily: FONT,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 13,
    marginTop: 6,
    minHeight: 26,
    textAlign: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: 24,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  successSection: {
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    borderRadius: 16,
    marginBottom: 24,
    paddingHorizontal: 20,
    paddingVertical: 36,
  },
  checkmarkCircle: {
    alignItems: "center",
    backgroundColor: "#22C55E",
    borderRadius: 40,
    height: 80,
    justifyContent: "center",
    marginBottom: 16,
    width: 80,
  },
  successTitle: {
    color: "#22C55E",
    fontFamily: FONT,
    fontSize: 24,
    fontWeight: "700",
  },
  successSubtitle: {
    color: "#4B5563",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 6,
  },
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#F3F4F6",
    borderRadius: 12,
    borderWidth: 1,
    elevation: 1,
    padding: 16,
    shadowColor: "#121212",
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 7,
  },
  summaryTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  summaryRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  summaryLabel: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 13,
  },
  summaryValue: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
  },
  footer: {
    backgroundColor: "#FFFFFF",
    borderTopColor: "#F3F4F6",
    borderTopWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 16,
  },
  dashboardButton: {
    alignItems: "center",
    backgroundColor: "#F97000",
    borderRadius: 9,
    height: 54,
    justifyContent: "center",
  },
  dashboardButtonText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 17,
    fontWeight: "700",
  },
});
