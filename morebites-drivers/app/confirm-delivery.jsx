import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import {
  Alert,
  Animated,
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
import { driverApi } from "../src/api/client";
import { formatPeso, statusStep, useDriverOrder } from "../src/hooks/useDriverOrder";
import { pickImage } from "../src/utils/pickImage";

const FONT = "Plus Jakarta Sans";
const STEPS = ["Assigned", "Picked up", "Out for delivery", "Delivered"];

export default function ConfirmDeliveryScreen() {
  const params = useLocalSearchParams();
  const orderId = Array.isArray(params.id) ? params.id[0] : params.id || "";
  const dbId = Array.isArray(params.dbId) ? params.dbId[0] : params.dbId;
  const { order, reload } = useDriverOrder(dbId);

  const currentStep = statusStep(order?.status || "Delivered");
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [showUploadBadge, setShowUploadBadge] = useState(false);
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const badgeTimerRef = useRef(null);
  const [rating, setRating] = useState(0);
  const [saving, setSaving] = useState(false);

  const incidentAcknowledgedParam = params.incidentAcknowledged === "1";
  const [ackModalVisible, setAckModalVisible] = useState(false);
  const [hasAcknowledged, setHasAcknowledged] = useState(incidentAcknowledgedParam);

  const reportedList = Array.isArray(order?.reported_issues) ? order.reported_issues : [];
  const hasIncident =
    Boolean(order?.has_reported_issue) ||
    reportedList.length > 0 ||
    params.hasIncident === "1";

  useEffect(() => {
    reload();
  }, [reload]);

  const isReadyToComplete = paymentConfirmed && Boolean(photo);

  useEffect(() => {
    return () => {
      if (badgeTimerRef.current) clearTimeout(badgeTimerRef.current);
    };
  }, []);

  const triggerUploadBadge = () => {
    if (badgeTimerRef.current) clearTimeout(badgeTimerRef.current);
    badgeOpacity.setValue(1);
    setShowUploadBadge(true);
    badgeTimerRef.current = setTimeout(() => {
      Animated.timing(badgeOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setShowUploadBadge(false);
      });
    }, 2000);
  };

  const takeOrPickPhoto = async () => {
    const selected = await pickImage({
      aspect: [4, 3],
      quality: 0.5,
      allowsEditing: true,
    });
    if (selected?.uri) {
      setPhoto(selected);
      triggerUploadBadge();
    }
  };

  const executeCompleteDelivery = async () => {
    if (!isReadyToComplete || !dbId || saving) return;
    setSaving(true);
    try {
      const res = await driverApi.updateStatus(dbId, "Delivered", photo);
      const data = res.data || {};
      const mins = data.eta_mins ?? order?.eta_mins;
      router.replace({
        pathname: "/delivery-complete",
        params: {
          id: String(data.id || order?.id || orderId),
          customer: data.customer || order?.customer || "",
          distance: data.distance || order?.distance || "",
          duration: mins != null ? `${mins} mins` : "—",
          total: formatPeso(data.amount || order?.amount || 0),
        },
      });
    } catch (err) {
      Alert.alert("Delivery failed", err.message || "Could not complete delivery");
    } finally {
      setSaving(false);
    }
  };

  const confirmAndComplete = () => {
    if (!isReadyToComplete || !dbId || saving) return;
    if (hasIncident && !hasAcknowledged) {
      setAckModalVisible(true);
      return;
    }
    executeCompleteDelivery();
  };

  const handleConfirmAck = () => {
    setHasAcknowledged(true);
    setAckModalVisible(false);
    executeCompleteDelivery();
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Centered title header with no back arrow */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Confirm Delivery</Text>
      </View>

      {/* 4-Step Progress Bar: Steps 1-3 green, Step 4 filled orange */}
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

      {/* Main scrollable body */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Payment Confirmation Section */}
        <Text style={styles.sectionTitle}>Payment Confirmation</Text>
        <View style={styles.paymentCard}>
          <View style={styles.paymentInfo}>
            <Text style={styles.paymentLabel}>Collect from customer</Text>
            <Text style={styles.paymentAmount}>{formatPeso(order?.amount || 0)}</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.confirmPaymentBtn,
              paymentConfirmed && styles.confirmPaymentBtnActive,
            ]}
            activeOpacity={0.8}
            onPress={() => setPaymentConfirmed(!paymentConfirmed)}
          >
            {paymentConfirmed ? (
              <>
                <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                <Text style={styles.confirmPaymentBtnTextActive}>
                  Confirmed
                </Text>
              </>
            ) : (
              <Text style={styles.confirmPaymentBtnText}>Tap to confirm</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Proof of Delivery Section */}
        <Text style={styles.sectionTitle}>Proof of delivery</Text>
        <TouchableOpacity
          style={[
            styles.photoBox,
            photo ? styles.photoBoxUploaded : null,
          ]}
          activeOpacity={0.8}
          onPress={takeOrPickPhoto}
        >
          {photo ? (
            <>
              <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
              {showUploadBadge ? (
                <Animated.View
                  style={[styles.photoUploadedBadge, { opacity: badgeOpacity }]}
                  pointerEvents="none"
                >
                  <Text style={styles.photoUploadedText}>Photo attached</Text>
                  <Ionicons name="checkmark" size={20} color="#22C55E" />
                </Animated.View>
              ) : null}
            </>
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="camera" size={44} color="#9CA3AF" />
              <Text style={styles.photoPlaceholderText}>
                Tap to add photo
              </Text>
            </View>
          )}
        </TouchableOpacity>
        {photo ? (
          <TouchableOpacity activeOpacity={0.7} onPress={takeOrPickPhoto}>
            <Text style={styles.photoTapToChangeText}>Tap to change</Text>
          </TouchableOpacity>
        ) : null}

        {/* Customer Rating Section */}
        <Text style={styles.sectionTitle}>Customer Rating</Text>
        <View style={styles.ratingRow}>
          {[1, 2, 3, 4, 5].map((starValue) => {
            const isFilled = starValue <= rating;
            return (
              <TouchableOpacity
                key={starValue}
                activeOpacity={0.7}
                onPress={() => setRating(starValue)}
                style={styles.starTouch}
              >
                <Ionicons
                  name={isFilled ? "star" : "star-outline"}
                  size={32}
                  color={isFilled ? "#F97000" : "#D1D5DB"}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Bottom Button Section */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.completeButton,
            isReadyToComplete && styles.completeButtonActive,
          ]}
          activeOpacity={isReadyToComplete && !saving ? 0.85 : 1}
          disabled={!isReadyToComplete || saving}
          onPress={confirmAndComplete}
        >
          <Text style={styles.completeButtonText}>
            {saving ? "Completing..." : "Confirm and Complete"}
          </Text>
        </TouchableOpacity>

        {!isReadyToComplete ? (
          <Text style={styles.unlockSubtext}>
            Confirm payment and add a delivery photo to unlock
          </Text>
        ) : null}
      </View>

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

            {reportedList.length > 0 ? (
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
    paddingBottom: 20,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  sectionTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
    marginTop: 6,
  },
  paymentCard: {
    alignItems: "center",
    backgroundColor: "#EEEEEE",
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  paymentInfo: {
    flex: 1,
  },
  paymentLabel: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "600",
  },
  paymentAmount: {
    color: "#22C55E",
    fontFamily: FONT,
    fontSize: 28,
    fontWeight: "800",
    marginTop: 2,
  },
  confirmPaymentBtn: {
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    borderColor: "#22C55E",
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  confirmPaymentBtnActive: {
    backgroundColor: "#22C55E",
  },
  confirmPaymentBtnText: {
    color: "#22C55E",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "700",
  },
  confirmPaymentBtnTextActive: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "700",
  },
  photoBox: {
    alignItems: "center",
    backgroundColor: "#E5E7EB",
    borderColor: "#9CA3AF",
    borderRadius: 12,
    borderStyle: "dashed",
    borderWidth: 1,
    height: 185,
    justifyContent: "center",
    marginBottom: 8,
    overflow: "hidden",
    position: "relative",
  },
  photoBoxUploaded: {
    backgroundColor: "#E8F5E9",
    borderColor: "#22C55E",
    borderStyle: "solid",
  },
  photoPlaceholder: {
    alignItems: "center",
  },
  photoPlaceholderText: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "500",
    marginTop: 8,
  },
  photoPreview: {
    height: "100%",
    resizeMode: "cover",
    width: "100%",
  },
  photoUploadedBadge: {
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    borderColor: "#22C55E",
    borderRadius: 9,
    borderWidth: 1,
    bottom: 12,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: "absolute",
  },
  photoUploadedText: {
    color: "#22C55E",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "700",
  },
  photoTapToChangeText: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 12,
    textAlign: "right",
  },
  ratingRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
    paddingVertical: 4,
  },
  starTouch: {
    padding: 2,
  },
  footer: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderTopColor: "#F3F4F6",
    borderTopWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 16,
  },
  completeButton: {
    alignItems: "center",
    backgroundColor: "#D1D5DB",
    borderRadius: 9,
    height: 54,
    justifyContent: "center",
    width: "100%",
  },
  completeButtonActive: {
    backgroundColor: "#F97000",
  },
  completeButtonText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 17,
    fontWeight: "700",
  },
  unlockSubtext: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 8,
    textAlign: "center",
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
