import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { driverApi } from "../src/api/client";
import { formatPeso, statusStep, useDriverOrder } from "../src/hooks/useDriverOrder";
import { useEffect } from "react";

const FONT = "Plus Jakarta Sans";
const STEPS = ["Assigned", "Picked up", "Out for delivery", "Delivered"];

export default function PickupConfirmedScreen() {
  const params = useLocalSearchParams();
  const orderId = Array.isArray(params.id) ? params.id[0] : params.id || "";
  const dbId = Array.isArray(params.dbId) ? params.dbId[0] : params.dbId;
  const { order, reload } = useDriverOrder(dbId);

  const currentStep = statusStep(order?.status || "Picked Up");
  const [checklist, setChecklist] = useState([false, false]);
  const [saving, setSaving] = useState(false);
  const allChecked = checklist.every(Boolean);

  useEffect(() => {
    reload();
  }, [reload]);

  const checklistItems = [
    "Address matched?",
    `I have change ready for ${formatPeso(order?.amount || 0)}`,
  ];

  const toggleChecklistItem = (index) => {
    setChecklist((items) =>
      items.map((checked, itemIndex) =>
        itemIndex === index ? !checked : checked,
      ),
    );
  };

  const startDelivery = async () => {
    if (!allChecked || !dbId) return;
    setSaving(true);
    try {
      await driverApi.updateStatus(dbId, "Out for Delivery");
      router.push({
        pathname: "/out-for-delivery",
        params: { id: String(order?.id || orderId), dbId: String(dbId) },
      });
    } catch (err) {
      Alert.alert("Update failed", err.message || "Could not start delivery");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Header with back arrow and title/subtitle */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          activeOpacity={0.7}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={27} color="#121212" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Order #{orderId}</Text>
          <Text style={styles.headerSubtitle}>Pick up Confirmed</Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      {/* 4-Step Progress Bar: Step 1 green, Step 2 filled orange */}
      <View style={styles.progressSection}>
        {STEPS.map((step, index) => {
          const stepNumber = index + 1;
          const isComplete = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;

          return (
            <View key={step} style={styles.progressItem}>
              {index > 0 ? (
                <View
                  style={[
                    styles.progressLine,
                    stepNumber <= currentStep && styles.progressLineActive,
                  ]}
                />
              ) : null}
              <View
                style={[
                  styles.progressCircle,
                  isComplete && styles.progressCircleComplete,
                  isCurrent && styles.progressCircleCurrent,
                ]}
              >
                <Text
                  style={[
                    styles.progressNumber,
                    (isComplete || isCurrent) && styles.progressNumberActive,
                  ]}
                >
                  {stepNumber}
                </Text>
              </View>
              <Text
                style={[
                  styles.progressLabel,
                  isComplete && styles.progressLabelComplete,
                  isCurrent && styles.progressLabelCurrent,
                ]}
              >
                {step}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Scrollable content area */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Success Banner */}
        <View style={styles.successBanner}>
          <Ionicons name="checkmark-circle" size={32} color="#22C55E" />
          <View style={styles.successTextContainer}>
            <Text style={styles.successTitle}>Picked confirmed</Text>
            <Text style={styles.successSubtitle}>
              Order verified — head to customer
            </Text>
          </View>
        </View>

        {/* Delivery Briefing Section */}
        <Text style={styles.sectionLabel}>DELIVERY BRIEFING</Text>
        <View style={styles.briefingCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Customer</Text>
            <Text style={styles.detailValue}>James Benedict</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Address</Text>
            <Text style={styles.detailValue}>Dangcagan, Bukidnon</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Contact</Text>
            <Text style={styles.detailValue}>09123456789</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Distance</Text>
            <Text style={styles.detailValue}>2.5km away</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Est. time</Text>
            <Text style={styles.detailValue}>~20 mins</Text>
          </View>
        </View>

        {/* COD Collection Card */}
        <View style={styles.codCard}>
          <View style={styles.codLeft}>
            <Text style={styles.codLabel}>Collect cash on delivery</Text>
            <Text style={styles.codAmount}>{formatPeso(order?.amount || 0)}</Text>
          </View>
          <Text style={styles.codBadge}>COD</Text>
        </View>

        {/* Before You Go Checklist */}
        <Text style={styles.sectionLabel}>BEFORE YOU GO</Text>
        <View style={styles.checklistCard}>
          {checklistItems.map((label, index) => {
            const checked = checklist[index];

            return (
              <TouchableOpacity
                key={label}
                style={[
                  styles.checklistRow,
                  index < checklistItems.length - 1 && styles.checklistDivider,
                ]}
                activeOpacity={0.75}
                onPress={() => toggleChecklistItem(index)}
              >
                <View
                  style={[
                    styles.checkbox,
                    checked && styles.checkboxChecked,
                  ]}
                >
                  {checked ? (
                    <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.checklistText,
                    checked && styles.checklistTextChecked,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.startDeliveryButton,
            allChecked && styles.startDeliveryButtonActive,
          ]}
          activeOpacity={allChecked ? 0.85 : 1}
          disabled={!allChecked || saving}
          onPress={startDelivery}
        >
          <Text style={styles.startDeliveryButtonText}>
            {saving ? "Starting..." : "Start Delivery →"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backToPickupButton}
          activeOpacity={0.85}
          onPress={() => router.back()}
        >
          <Text style={styles.backToPickupButtonText}>← Back to pickup</Text>
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
  progressLineActive: {
    backgroundColor: "#22C55E",
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
  progressCircleComplete: {
    backgroundColor: "#22C55E",
    borderColor: "#22C55E",
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
  progressNumberActive: {
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
  progressLabelComplete: {
    color: "#22C55E",
    fontWeight: "700",
  },
  progressLabelCurrent: {
    color: "#F97000",
    fontWeight: "700",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  successBanner: {
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    borderColor: "#C8E6C9",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  successTextContainer: {
    flex: 1,
  },
  successTitle: {
    color: "#22C55E",
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: "700",
  },
  successSubtitle: {
    color: "#4B5563",
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
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
  briefingCard: {
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
  codCard: {
    alignItems: "center",
    backgroundColor: "#FFF3E0",
    borderColor: "#FFE0B2",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  codLeft: {
    flex: 1,
  },
  codLabel: {
    color: "#8D6E63",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "600",
  },
  codAmount: {
    color: "#5D4037",
    fontFamily: FONT,
    fontSize: 32,
    fontWeight: "800",
    marginTop: 2,
  },
  codBadge: {
    color: "#5D4037",
    fontFamily: FONT,
    fontSize: 28,
    fontWeight: "800",
  },
  checklistCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#F3F4F6",
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  checklistRow: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 52,
    paddingVertical: 8,
  },
  checklistDivider: {
    borderBottomColor: "#F3F4F6",
    borderBottomWidth: 1,
  },
  checkbox: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#9CA3AF",
    borderRadius: 7,
    borderWidth: 1,
    height: 26,
    justifyContent: "center",
    marginRight: 12,
    width: 26,
  },
  checkboxChecked: {
    backgroundColor: "#22C55E",
    borderColor: "#22C55E",
  },
  checklistText: {
    color: "#121212",
    flex: 1,
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "600",
  },
  checklistTextChecked: {
    color: "#121212",
  },
  footer: {
    backgroundColor: "#FFFFFF",
    borderTopColor: "#F3F4F6",
    borderTopWidth: 1,
    gap: 10,
    paddingBottom: 12,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  startDeliveryButton: {
    alignItems: "center",
    backgroundColor: "#B45309",
    borderRadius: 9,
    height: 54,
    justifyContent: "center",
  },
  startDeliveryButtonActive: {
    backgroundColor: "#F97000",
  },
  startDeliveryButtonText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 17,
    fontWeight: "700",
  },
  backToPickupButton: {
    alignItems: "center",
    backgroundColor: "#696969",
    borderRadius: 9,
    height: 48,
    justifyContent: "center",
  },
  backToPickupButtonText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: "700",
  },
});
