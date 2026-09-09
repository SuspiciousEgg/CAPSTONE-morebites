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
import { statusStep, useDriverOrder } from "../src/hooks/useDriverOrder";
import { pickImage } from "../src/utils/pickImage";

const FONT = "Plus Jakarta Sans";
const STEPS = ["Assigned", "Picked up", "Out for delivery", "Delivered"];

export default function PickupChecklistScreen() {
  const params = useLocalSearchParams();
  const orderId = Array.isArray(params.id) ? params.id[0] : params.id || "";
  const dbId = Array.isArray(params.dbId) ? params.dbId[0] : params.dbId;
  const { order, reload } = useDriverOrder(dbId);
  const currentStep = statusStep(order?.status || "Picked Up");
  const [checklist, setChecklist] = useState([false, false, false]);
  const [photo, setPhoto] = useState("");
  const [saving, setSaving] = useState(false);
  const allChecked = checklist.every(Boolean);

  useEffect(() => {
    reload();
  }, [reload]);

  const checklistLabels = [
    `Order #${order?.id || orderId} confirmed with staff`,
    `All items present (${order?.items_label || "order items"})`,
    "Bag sealed / Packaging intact",
  ];

  const toggleChecklistItem = (index) => {
    setChecklist((items) =>
      items.map((checked, itemIndex) =>
        itemIndex === index ? !checked : checked,
      ),
    );
  };

  const addPhoto = async () => {
    const selected = await pickImage({
      aspect: [4, 3],
      quality: 0.8,
      allowsEditing: true,
    });
    if (selected?.uri) {
      setPhoto(selected.uri);
    }
  };

  const confirmPickup = async () => {
    if (!allChecked || !dbId) return;
    setSaving(true);
    try {
      await driverApi.updateStatus(dbId, "Picked Up");
      router.push({
        pathname: "/pickup-confirmed",
        params: { id: String(order?.id || orderId), dbId: String(dbId) },
      });
    } catch (err) {
      Alert.alert("Pickup failed", err.message || "Could not update status");
    } finally {
      setSaving(false);
    }
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
        <Text style={styles.headerTitle}>Order #{orderId}</Text>
        <View style={styles.headerButton} />
      </View>

      <View style={styles.progressSection}>
        {STEPS.map((step, index) => {
          const stepNumber = index + 1;
          const isComplete = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;

          return (
            <View key={step} style={styles.progressItem}>
              {index > 0 ? <View style={styles.progressLine} /> : null}
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

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>PICKUP CHECKLIST</Text>
        <View style={styles.checklistCard}>
          {checklistLabels.map((label, index) => {
            const checked = checklist[index];

            return (
              <TouchableOpacity
                key={label}
                style={styles.checklistRow}
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

        <Text style={styles.photoSectionLabel}>PICKUP PHOTO (optional)</Text>
        <TouchableOpacity
          style={[
            styles.photoBox,
            photo && styles.photoBoxUploaded,
          ]}
          activeOpacity={0.8}
          onPress={addPhoto}
        >
          {photo ? (
            <>
              <Image source={{ uri: photo }} style={styles.photoPreview} />
              <View style={styles.photoUploadedBadge}>
                <Text style={styles.photoUploadedText}>Photo uploaded</Text>
                <Ionicons name="checkmark" size={21} color="#22C55E" />
              </View>
            </>
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="camera" size={48} color="#9CA3AF" />
              <Text style={styles.photoPlaceholderText}>Tap to add photo</Text>
            </View>
          )}
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.confirmButton,
            allChecked && styles.confirmButtonEnabled,
          ]}
          activeOpacity={allChecked ? 0.85 : 1}
          disabled={!allChecked}
          onPress={confirmPickup}
          disabled={saving || !allChecked}
        >
          <Text style={styles.confirmButtonText}>
            {saving ? "Saving..." : "Confirm Pickup"}
          </Text>
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
    paddingBottom: 24,
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
  },
  checklistCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#F3F4F6",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  checklistRow: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 54,
    paddingVertical: 8,
  },
  checkbox: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#9CA3AF",
    borderRadius: 7,
    borderWidth: 1,
    height: 27,
    justifyContent: "center",
    marginRight: 12,
    width: 27,
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
    lineHeight: 18,
  },
  checklistTextChecked: {
    color: "#22C55E",
  },
  photoSectionLabel: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 22,
  },
  photoBox: {
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderColor: "#9CA3AF",
    borderRadius: 12,
    borderStyle: "dashed",
    borderWidth: 1,
    height: 200,
    justifyContent: "center",
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
    fontSize: 15,
    marginTop: 10,
  },
  photoPreview: {
    height: "100%",
    resizeMode: "cover",
    width: "100%",
  },
  photoUploadedBadge: {
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    borderRadius: 9,
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
  footer: {
    backgroundColor: "#FFFFFF",
    borderTopColor: "#F3F4F6",
    borderTopWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  confirmButton: {
    alignItems: "center",
    backgroundColor: "#8B5E3C",
    borderRadius: 9,
    height: 54,
    justifyContent: "center",
  },
  confirmButtonEnabled: {
    backgroundColor: "#F97000",
  },
  confirmButtonText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 17,
    fontWeight: "700",
  },
});
