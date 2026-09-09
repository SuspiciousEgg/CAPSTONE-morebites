import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { driverApi } from "../src/api/client";
import DeliveryMap from "../src/components/DeliveryMap";
import { formatPeso, statusStep, useDriverOrder } from "../src/hooks/useDriverOrder";

const FONT = "Plus Jakarta Sans";
const STEPS = ["Assigned", "Picked up", "Out for delivery", "Delivered"];

function regionFromPoints(points) {
  const valid = points.filter(
    (p) => p && Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)),
  );
  if (!valid.length) return null;

  const lats = valid.map((p) => Number(p.latitude));
  const lngs = valid.map((p) => Number(p.longitude));
  return {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
    longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    latitudeDelta: Math.max(0.014, (Math.max(...lats) - Math.min(...lats)) * 1.8 || 0.02),
    longitudeDelta: Math.max(0.014, (Math.max(...lngs) - Math.min(...lngs)) * 1.8 || 0.02),
  };
}

export default function OutForDeliveryScreen() {
  const params = useLocalSearchParams();
  const orderId = Array.isArray(params.id) ? params.id[0] : params.id || "";
  const dbId = Array.isArray(params.dbId) ? params.dbId[0] : params.dbId;
  const { order, reload } = useDriverOrder(dbId);
  const [tracking, setTracking] = useState(null);
  const [liveRider, setLiveRider] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(Boolean(dbId));

  const currentStep = statusStep(order?.status || tracking?.status || "Out for Delivery");

  useEffect(() => {
    reload();
  }, [reload]);

  const loadTracking = useCallback(async () => {
    if (!dbId) {
      setTrackingLoading(false);
      return;
    }
    try {
      const res = await driverApi.tracking(dbId);
      setTracking(res.data || res);
    } catch {
      // keep last payload
    } finally {
      setTrackingLoading(false);
    }
  }, [dbId]);

  useEffect(() => {
    loadTracking();
    if (!dbId) return undefined;
    const timer = setInterval(loadTracking, 5000);
    return () => clearInterval(timer);
  }, [dbId, loadTracking]);

  useEffect(() => {
    let subscription;
    let cancelled = false;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 8000,
            distanceInterval: 20,
          },
          (pos) => {
            const next = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            };
            setLiveRider(next);
            driverApi.updateLocation(next.latitude, next.longitude).catch(() => {});
          },
        );
      } catch {
        // GPS unavailable
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove?.();
    };
  }, []);

  const destinationCoord = tracking?.destination || null;
  const riderCoord = liveRider || tracking?.rider || null;
  const routeCoordinates =
    Array.isArray(tracking?.route) && tracking.route.length >= 2
      ? tracking.route
      : riderCoord && destinationCoord
        ? [riderCoord, destinationCoord]
        : [];
  const mapRegion = useMemo(
    () => regionFromPoints([...(routeCoordinates || []), riderCoord, destinationCoord, tracking?.store]),
    [routeCoordinates, riderCoord, destinationCoord, tracking?.store],
  );
  const hasMap = Boolean(mapRegion && (destinationCoord || riderCoord));
  const etaLabel =
    tracking?.eta_mins != null
      ? `${tracking.eta_mins} mins`
      : order?.eta_mins != null
        ? `${order.eta_mins} mins`
        : "—";
  const distanceLabel =
    tracking?.distance_label ||
    order?.distance ||
    (tracking?.distance_km != null ? `${tracking.distance_km} km` : "—");

  const callCustomer = async () => {
    const phone = order?.contact;
    if (!phone) {
      Alert.alert("No contact", "Customer phone number is not available.");
      return;
    }

    if (Platform.OS === "web") {
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(phone);
          Alert.alert("Customer number", `${phone}\n\nCopied to clipboard.`);
          return;
        }
      } catch {
        // fall through
      }
      Alert.alert("Customer number", phone);
      return;
    }

    Linking.openURL(`tel:${phone}`);
  };

  const submitIssue = async (issue) => {
    if (!dbId) return;
    try {
      await driverApi.reportIssue(dbId, issue);
      Alert.alert("Reported", `${issue} was sent to the admin.`);
    } catch (err) {
      Alert.alert("Report failed", err.message || "Could not report issue.");
    }
  };

  const reportIssue = () => {
    Alert.alert(
      "Report Issue",
      `Select the issue for Order #${order?.id || orderId}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Customer Unreachable",
          onPress: () => submitIssue("Customer Unreachable"),
        },
        {
          text: "Wrong Address",
          onPress: () => submitIssue("Wrong Address"),
        },
        {
          text: "Other",
          onPress: () => submitIssue("Other delivery issue"),
        },
      ],
    );
  };

  const completeDelivery = () => {
    router.push({
      pathname: "/confirm-delivery",
      params: {
        id: String(order?.id || orderId),
        dbId: String(dbId),
      },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Header section */}
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
          <Text style={styles.headerSubtitle}>Out for Delivery</Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      {/* 4-Step Progress Bar: Steps 1-2 green, Step 3 filled orange */}
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

      {/* Scrollable body content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Map Section with OpenStreetMap tiles */}
        <View style={styles.mapContainer}>
          {hasMap ? (
            <DeliveryMap
              initialRegion={mapRegion}
              region={mapRegion}
              routeCoordinates={routeCoordinates}
              riderCoord={riderCoord}
              destinationCoord={destinationCoord}
            />
          ) : (
            <View style={styles.mapPlaceholder}>
              {trackingLoading ? (
                <ActivityIndicator color="#F97000" />
              ) : (
                <Ionicons name="map-outline" size={36} color="#9CA3AF" />
              )}
              <Text style={styles.mapPlaceholderText}>
                {trackingLoading
                  ? "Loading live route…"
                  : "Waiting for GPS / destination coordinates…"}
              </Text>
            </View>
          )}
        </View>

        {/* Delivery Status Bar (Card below map) */}
        <View style={styles.statusBarCard}>
          <View style={styles.statusTopRow}>
            <View style={styles.deliveringToGroup}>
              <Ionicons name="home" size={16} color="#F97000" />
              <Text style={styles.deliveringToLabel}>Delivering to</Text>
            </View>

            <View style={styles.statusRightGroup}>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>Live</Text>
              </View>
              <View style={styles.etaGroup}>
                <Ionicons name="time-outline" size={16} color="#0284C7" />
                <Text style={styles.etaText}>{etaLabel}</Text>
              </View>
            </View>
          </View>

          <View style={styles.statusBottomRow}>
            <Text style={styles.destinationAddress}>
              {tracking?.address || order?.address || "Delivery address"}
            </Text>
            <Text style={styles.distanceRemaining}>
              {distanceLabel} remaining
            </Text>
          </View>
        </View>

        {/* Order Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Ionicons name="cube-outline" size={20} color="#F97000" />
            <Text style={styles.summaryTitle}>Order Summary</Text>
          </View>

          <Text style={styles.summaryItems}>
            {order?.items_label || "Loading items..."}
          </Text>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryFooterRow}>
            <Text style={styles.summaryTotal}>
              Total: {formatPeso(order?.amount || 0)}
            </Text>
            <View style={styles.paymentBadge}>
              <Ionicons name="cash-outline" size={16} color="#16A34A" />
              <Text style={styles.paymentText}>
                Payment: {order?.payment_method || "COD"}
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons Row: Call Customer & Report Issue */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            style={styles.actionOutlineButton}
            activeOpacity={0.8}
            onPress={callCustomer}
          >
            <Ionicons name="call" size={17} color="#F97000" />
            <Text style={styles.actionOutlineButtonText}>Call Customer</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionOutlineButton}
            activeOpacity={0.8}
            onPress={reportIssue}
          >
            <Ionicons name="alert-circle-outline" size={18} color="#F97000" />
            <Text style={styles.actionOutlineButtonText}>Report issue</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Complete Delivery Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.completeButton}
          activeOpacity={0.85}
          onPress={completeDelivery}
        >
          <Text style={styles.completeButtonText}>Complete Delivery</Text>
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
    paddingBottom: 16,
  },
  mapContainer: {
    backgroundColor: "#E5E7EB",
    height: 220,
    overflow: "hidden",
    width: "100%",
  },
  mapPlaceholder: {
    alignItems: "center",
    flex: 1,
    gap: 10,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  mapPlaceholderText: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 13,
    textAlign: "center",
  },
  map: {
    height: "100%",
    width: "100%",
  },
  riderMarkerOuter: {
    alignItems: "center",
    backgroundColor: "rgba(34, 197, 94, 0.25)",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  riderMarkerInner: {
    backgroundColor: "#22C55E",
    borderColor: "#FFFFFF",
    borderRadius: 9,
    borderWidth: 2.5,
    height: 18,
    width: 18,
  },
  destMarkerOuter: {
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.25)",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  destMarkerInner: {
    backgroundColor: "#EF4444",
    borderColor: "#FFFFFF",
    borderRadius: 9,
    borderWidth: 2.5,
    height: 18,
    width: 18,
  },
  statusBarCard: {
    backgroundColor: "#FFFFFF",
    borderBottomColor: "#F3F4F6",
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  statusTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  deliveringToGroup: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  deliveringToLabel: {
    color: "#F97000",
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: "700",
  },
  statusRightGroup: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  liveBadge: {
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    borderRadius: 12,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveDot: {
    backgroundColor: "#EF4444",
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  liveText: {
    color: "#EF4444",
    fontFamily: FONT,
    fontSize: 11,
    fontWeight: "700",
  },
  etaGroup: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  etaText: {
    color: "#0284C7",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
  },
  statusBottomRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  destinationAddress: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
  },
  distanceRemaining: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: "600",
  },
  summaryCard: {
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 14,
    padding: 14,
  },
  summaryHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginBottom: 6,
  },
  summaryTitle: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
  },
  summaryItems: {
    color: "#374151",
    fontFamily: FONT,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
  },
  summaryDivider: {
    backgroundColor: "#E5E7EB",
    height: 1,
    marginVertical: 10,
  },
  summaryFooterRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryTotal: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: "700",
  },
  paymentBadge: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  paymentText: {
    color: "#16A34A",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "700",
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 14,
  },
  actionOutlineButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#F97000",
    borderRadius: 9,
    borderWidth: 1.5,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    height: 46,
    justifyContent: "center",
  },
  actionOutlineButtonText: {
    color: "#F97000",
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
  completeButton: {
    alignItems: "center",
    backgroundColor: "#F97000",
    borderRadius: 9,
    height: 54,
    justifyContent: "center",
  },
  completeButtonText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 17,
    fontWeight: "700",
  },
});
