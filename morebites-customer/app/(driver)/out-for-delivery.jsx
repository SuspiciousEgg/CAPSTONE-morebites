import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { driverApi, onSessionTerminated } from "../../src/api/client";
import DeliveryMap from "../../src/components/DeliveryMap";
import { formatPeso, statusStep, useDriverOrder } from "../../src/hooks/useDriverOrder";

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
  const [issueModalVisible, setIssueModalVisible] = useState(false);
  const [reportingIssue, setReportingIssue] = useState(false);
  const [otherSelected, setOtherSelected] = useState(false);
  const [otherIssueNotes, setOtherIssueNotes] = useState("");
  const [localIncidentReported, setLocalIncidentReported] = useState(false);
  const [ackModalVisible, setAckModalVisible] = useState(false);
  const [incidentAcknowledged, setIncidentAcknowledged] = useState(false);
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
    let cancelled = false;
    loadTracking();
    if (!dbId) return undefined;
    const timer = setInterval(() => {
      if (!cancelled) loadTracking();
    }, 3000);
    const unsub = onSessionTerminated(() => {
      cancelled = true;
      clearInterval(timer);
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      unsub();
    };
  }, [dbId, loadTracking]);

  const isCompletedRef = useRef(false);
  const isDelivered = ["Delivered", "Completed"].includes(order?.status || tracking?.status || "");

  useEffect(() => {
    if (isDelivered) {
      isCompletedRef.current = true;
    }
  }, [isDelivered]);

  const lastSentRef = useRef(0);

  // Real-time device location streaming while delivery is active
  useEffect(() => {
    if (isDelivered) return undefined;

    let timer = null;
    let locationSubscription = null;
    let cancelled = false;

    const stopTracking = () => {
      cancelled = true;
      if (locationSubscription?.remove) {
        locationSubscription.remove();
        locationSubscription = null;
      }
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const unsub = onSessionTerminated(() => {
      stopTracking();
    });

    const sendCoords = (coords) => {
      if (cancelled || isCompletedRef.current || !coords) return;
      const now = Date.now();
      if (now - lastSentRef.current < 3000) return;
      lastSentRef.current = now;

      const next = {
        latitude: Number(coords.latitude),
        longitude: Number(coords.longitude),
      };
      setLiveRider(next);

      if (dbId) {
        driverApi.updateDeliveryLocation(dbId, next.latitude, next.longitude).catch((err) => {
          if (err?.status === 403 || err?.status === 401) {
            stopTracking();
          }
        });
      }
      driverApi.updateLocation(next.latitude, next.longitude).catch((err) => {
        if (err?.status === 403 || err?.status === 401) {
          stopTracking();
        }
      });
    };

    const captureSingleFix = async () => {
      if (cancelled || isCompletedRef.current) return;
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (pos?.coords) {
          sendCoords(pos.coords);
        }
      } catch {
        // Location service temporarily unavailable
      }
    };

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled || isCompletedRef.current) return;

        // Immediate initial location fix
        await captureSingleFix();

        // Subscribe to live GPS updates
        try {
          locationSubscription = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.High,
              distanceInterval: 5,
              timeInterval: 3000,
            },
            (pos) => {
              if (pos?.coords) {
                sendCoords(pos.coords);
              }
            }
          );
        } catch {
          if (!cancelled && !isCompletedRef.current) {
            timer = setInterval(captureSingleFix, 3000);
          }
        }
      } catch {
        // Permission error or GPS unavailable
      }
    })();

    return () => {
      stopTracking();
      unsub();
    };
  }, [dbId, isDelivered]);

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

  const closeIssueModal = () => {
    setIssueModalVisible(false);
    setOtherSelected(false);
    setOtherIssueNotes("");
  };

  const submitIssue = async (issue, notes = "") => {
    if (!dbId || reportingIssue) return;
    setReportingIssue(true);
    try {
      await driverApi.reportIssue(dbId, issue, notes);
      setLocalIncidentReported(true);
      setIncidentAcknowledged(false);
      reload();
      setOtherSelected(false);
      setOtherIssueNotes("");
      Alert.alert("Reported", `${issue} was sent to the admin.`);
    } catch (err) {
      Alert.alert("Report failed", err.message || "Could not report issue.");
    } finally {
      setReportingIssue(false);
    }
  };

  const handleSubmitOtherIssue = () => {
    const trimmed = otherIssueNotes.trim();
    if (!trimmed) {
      Alert.alert("Describe Issue", "Please describe the situation in your own words before submitting.");
      return;
    }
    setIssueModalVisible(false);
    submitIssue("Other", trimmed);
  };

  const reportIssue = () => {
    setOtherSelected(false);
    setOtherIssueNotes("");
    setIssueModalVisible(true);
  };

  const reportedList = Array.isArray(order?.reported_issues) ? order.reported_issues : [];
  const hasIncident =
    localIncidentReported ||
    Boolean(order?.has_reported_issue) ||
    reportedList.length > 0;

  const navigateToConfirmDelivery = () => {
    isCompletedRef.current = true;
    router.push({
      pathname: "/(driver)/confirm-delivery",
      params: {
        id: String(order?.id || orderId),
        dbId: String(dbId),
        hasIncident: hasIncident ? "1" : "0",
        incidentAcknowledged: hasIncident ? "1" : "0",
      },
    });
  };

  const completeDelivery = () => {
    if (hasIncident && !incidentAcknowledged) {
      setAckModalVisible(true);
      return;
    }
    navigateToConfirmDelivery();
  };

  const handleConfirmAck = () => {
    setIncidentAcknowledged(true);
    setAckModalVisible(false);
    navigateToConfirmDelivery();
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
          <Text style={styles.headerTitle}>Order {String(orderId || '').startsWith('#') ? orderId : `#${orderId}`}</Text>
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
              storeCoord={tracking?.store}
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
                <Ionicons name="time-outline" size={16} color="#F97000" />
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
              <Ionicons name="cash-outline" size={16} color="#22C55E" />
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
            style={[styles.actionOutlineButton, reportingIssue && { opacity: 0.6 }]}
            activeOpacity={0.8}
            disabled={reportingIssue}
            onPress={reportIssue}
          >
            <Ionicons name="alert-circle-outline" size={18} color="#F97000" />
            <Text style={styles.actionOutlineButtonText}>
              {reportingIssue ? "Reporting..." : "Report issue"}
            </Text>
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
      {/* Report Issue Modal */}
      <Modal
        visible={issueModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeIssueModal}
      >
        <KeyboardAvoidingView
          style={styles.issueModalKeyboardWrap}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable
            style={styles.issueModalBackdrop}
            onPress={closeIssueModal}
          >
            <Pressable style={styles.issueModalCard} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.issueModalTitle}>Report Issue</Text>
              <Text style={styles.issueModalSubtitle}>
                Select the issue encountered for Order {String(order?.id || orderId || '').startsWith('#') ? (order?.id || orderId) : `#${order?.id || orderId}`}.
              </Text>

              <View style={styles.issueOptionsList}>
                {[
                  "Customer Unreachable",
                  "Wrong Address",
                  "Vehicle Breakdown / Flat Tire",
                  "Road Blockage / Severe Weather",
                  "Accident / Emergency",
                ].map((issueText) => (
                  <TouchableOpacity
                    key={issueText}
                    style={styles.issueOptionButton}
                    activeOpacity={0.7}
                    disabled={reportingIssue}
                    onPress={() => {
                      closeIssueModal();
                      submitIssue(issueText);
                    }}
                  >
                    <Text style={styles.issueOptionText}>{issueText}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  style={[
                    styles.issueOptionButton,
                    otherSelected && styles.issueOptionButtonActive,
                  ]}
                  activeOpacity={0.7}
                  disabled={reportingIssue}
                  onPress={() => setOtherSelected((prev) => !prev)}
                >
                  <Text
                    style={[
                      styles.issueOptionText,
                      otherSelected && styles.issueOptionTextActive,
                    ]}
                  >
                    Other
                  </Text>
                  <Ionicons
                    name={otherSelected ? "chevron-down" : "chevron-forward"}
                    size={16}
                    color={otherSelected ? "#F97000" : "#9CA3AF"}
                  />
                </TouchableOpacity>

                {otherSelected ? (
                  <View style={styles.otherIssueWrap}>
                    <TextInput
                      style={styles.otherIssueInput}
                      placeholder="Describe the situation in your own words..."
                      placeholderTextColor="#9CA3AF"
                      multiline
                      maxLength={1000}
                      value={otherIssueNotes}
                      onChangeText={setOtherIssueNotes}
                      textAlignVertical="top"
                      autoFocus
                    />
                    <TouchableOpacity
                      style={[
                        styles.otherIssueSubmitButton,
                        (!otherIssueNotes.trim() || reportingIssue) && styles.otherIssueSubmitButtonDisabled,
                      ]}
                      activeOpacity={0.85}
                      disabled={!otherIssueNotes.trim() || reportingIssue}
                      onPress={handleSubmitOtherIssue}
                    >
                      <Text style={styles.otherIssueSubmitButtonText}>
                        {reportingIssue ? "Submitting..." : "Submit Issue"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>

              <TouchableOpacity
                style={styles.issueCancelButton}
                activeOpacity={0.7}
                onPress={closeIssueModal}
              >
                <Text style={styles.issueCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
      {/* Soft Acknowledgment Modal Before Completing Delivery After Incident (Prompt 123) */}
      <Modal
        visible={ackModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAckModalVisible(false)}
      >
        <Pressable
          style={styles.ackModalBackdrop}
          onPress={() => setAckModalVisible(false)}
        >
          <Pressable style={styles.ackModalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.ackIconWrap}>
              <Ionicons name="warning-outline" size={32} color="#D97706" />
            </View>
            <Text style={styles.ackModalTitle}>Issue Reported</Text>
            <Text style={styles.ackModalBody}>
              An issue was reported for this order. Confirm you’d like to complete delivery anyway.
            </Text>

            {(reportedList.length > 0 || localIncidentReported) ? (
              <View style={styles.ackIncidentSummary}>
                <Text style={styles.ackIncidentLabel}>Reported Incident:</Text>
                <Text style={styles.ackIncidentText}>
                  {reportedList[0]?.issue || "Delivery issue reported during transit"}
                  {reportedList[0]?.notes ? ` — "${reportedList[0].notes}"` : ""}
                </Text>
              </View>
            ) : null}

            <Text style={styles.ackNoticeSubtext}>
              This will not block delivery. Management will review the reported incident afterward.
            </Text>

            <View style={styles.ackActionsRow}>
              <TouchableOpacity
                style={styles.ackCancelButton}
                activeOpacity={0.7}
                onPress={() => setAckModalVisible(false)}
              >
                <Text style={styles.ackCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ackConfirmButton}
                activeOpacity={0.85}
                onPress={handleConfirmAck}
              >
                <Text style={styles.ackConfirmButtonText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveDot: {
    backgroundColor: "#22C55E",
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  liveText: {
    color: "#22C55E",
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
    color: "#F97000",
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
    color: "#22C55E",
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
  issueModalKeyboardWrap: {
    flex: 1,
  },
  issueModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "flex-end",
  },
  issueModalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === "ios" ? 38 : 24,
  },
  issueModalTitle: {
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "700",
    color: "#1C1B18",
    marginBottom: 4,
  },
  issueModalSubtitle: {
    fontFamily: FONT,
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 16,
  },
  issueOptionsList: {
    gap: 8,
    marginBottom: 16,
  },
  issueOptionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#EDEDED",
  },
  issueOptionButtonActive: {
    backgroundColor: "#FFF4E5",
    borderColor: "#F97000",
  },
  issueOptionText: {
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "600",
    color: "#1C1B18",
  },
  issueOptionTextActive: {
    color: "#F97000",
    fontWeight: "700",
  },
  otherIssueWrap: {
    gap: 10,
    marginTop: 2,
  },
  otherIssueInput: {
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
    borderRadius: 10,
    borderWidth: 1,
    color: "#1C1B18",
    fontFamily: FONT,
    fontSize: 14,
    minHeight: 84,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  otherIssueSubmitButton: {
    alignItems: "center",
    backgroundColor: "#F97000",
    borderRadius: 10,
    height: 44,
    justifyContent: "center",
  },
  otherIssueSubmitButtonDisabled: {
    backgroundColor: "#FDBA74",
    opacity: 0.7,
  },
  otherIssueSubmitButtonText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
  },
  issueCancelButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  issueCancelButtonText: {
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "600",
    color: "#4B5563",
  },
  ackModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  ackModalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 22,
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  ackIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  ackModalTitle: {
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "800",
    color: "#1E293B",
    marginBottom: 6,
    textAlign: "center",
  },
  ackModalBody: {
    fontFamily: FONT,
    fontSize: 13.5,
    lineHeight: 20,
    color: "#475569",
    textAlign: "center",
    marginBottom: 14,
  },
  ackIncidentSummary: {
    width: "100%",
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  ackIncidentLabel: {
    fontFamily: FONT,
    fontSize: 10.5,
    fontWeight: "700",
    color: "#B45309",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  ackIncidentText: {
    fontFamily: FONT,
    fontSize: 12.5,
    fontWeight: "600",
    color: "#92400E",
  },
  ackNoticeSubtext: {
    fontFamily: FONT,
    fontSize: 11.5,
    lineHeight: 16,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 18,
  },
  ackActionsRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  ackCancelButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  ackCancelButtonText: {
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
  },
  ackConfirmButton: {
    flex: 1.3,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#F97000",
    alignItems: "center",
    justifyContent: "center",
  },
  ackConfirmButtonText: {
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});