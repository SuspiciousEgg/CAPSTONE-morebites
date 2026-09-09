import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import {
  Alert,
  Image,
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
  const [rating, setRating] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    reload();
  }, [reload]);

  const isReadyToComplete = paymentConfirmed && Boolean(photo);

  const takeOrPickPhoto = async () => {
    const selected = await pickImage({
      aspect: [4, 3],
      quality: 0.5,
      allowsEditing: true,
    });
    if (selected?.uri) {
      setPhoto(selected);
    }
  };

  const confirmAndComplete = async () => {
    if (!isReadyToComplete || !dbId) return;
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
            <View style={styles.photoUploadedContainer}>
              <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
              <Text style={styles.photoUploadedText}>Photo attached · tap to change</Text>
            </View>
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="camera" size={44} color="#9CA3AF" />
              <Text style={styles.photoPlaceholderText}>
                Tap to add photo
              </Text>
            </View>
          )}
        </TouchableOpacity>

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
          activeOpacity={isReadyToComplete ? 0.85 : 1}
          disabled={!isReadyToComplete}
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
    color: "#16A34A",
    fontFamily: FONT,
    fontSize: 28,
    fontWeight: "800",
    marginTop: 2,
  },
  confirmPaymentBtn: {
    alignItems: "center",
    backgroundColor: "#A7F3D0",
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
    color: "#16A34A",
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
    height: 150,
    justifyContent: "center",
    marginBottom: 20,
    overflow: "hidden",
  },
  photoBoxUploaded: {
    backgroundColor: "#E8F5E9",
    borderColor: "#22C55E",
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
  photoUploadedContainer: {
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  photoPreview: {
    borderRadius: 10,
    height: 140,
    resizeMode: "cover",
    width: "100%",
  },
  photoUploadedText: {
    color: "#22C55E",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "700",
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
});
