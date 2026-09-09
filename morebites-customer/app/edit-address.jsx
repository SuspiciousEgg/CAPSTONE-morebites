import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MapView, { Marker } from "../src/components/AppMap";
import { SafeAreaView } from "react-native-safe-area-context";

const STORAGE_KEY = "saved_addresses";
const FONT = "Plus Jakarta Sans";
const PRIMARY = "#F97000";

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

function parseParam(value) {
  try {
    return value ? JSON.parse(firstParam(value)) : {};
  } catch {
    return {};
  }
}

function FormField({ name, label, required, error, focusedField, setFocusedField, ...props }) {
  const focused = focusedField === name;
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>
        {label}{required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TextInput
        {...props}
        style={[styles.input, focused && styles.focusedInput, error && styles.errorInput]}
        placeholderTextColor="#A0A0A0"
        onFocus={() => setFocusedField(name)}
        onBlur={() => setFocusedField("")}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export default function EditAddressScreen() {
  const params = useLocalSearchParams();
  const originalAddress = parseParam(params.address);
  const returnedDraft = parseParam(params.draft);
  const initialAddress = Object.keys(returnedDraft).length > 0 ? returnedDraft : originalAddress;
  const paramLatitude = Number(firstParam(params.latitude));
  const paramLongitude = Number(firstParam(params.longitude));

  const [form, setForm] = useState({
    id: initialAddress.id,
    isDefault: Boolean(initialAddress.isDefault),
    label: initialAddress.label || "",
    street: initialAddress.street || "",
    barangay: initialAddress.barangay || "",
    city: initialAddress.city || "",
    landmark: initialAddress.landmark || "",
    latitude: Number.isFinite(paramLatitude) ? paramLatitude : initialAddress.latitude ?? null,
    longitude: Number.isFinite(paramLongitude) ? paramLongitude : initialAddress.longitude ?? null,
  });
  const [focusedField, setFocusedField] = useState("");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const updateField = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }));
    if (errors[name]) setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const hasLocation = Number.isFinite(form.latitude) && Number.isFinite(form.longitude);
  const addressText = [form.street, form.barangay, form.city].filter(Boolean).join(", ");

  const openMapPicker = () => {
    router.push({
      pathname: "/map-picker",
      params: {
        returnTo: "/edit-address",
        draft: JSON.stringify(form),
        ...(hasLocation
          ? { latitude: String(form.latitude), longitude: String(form.longitude) }
          : {}),
      },
    });
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.label.trim()) nextErrors.label = "Address label is required";
    if (!form.street.trim()) nextErrors.street = "Street address is required";
    if (!form.barangay.trim()) nextErrors.barangay = "Barangay is required";
    if (!form.city.trim()) nextErrors.city = "City is required";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const saveAddress = async () => {
    if (!validate() || saving) return;
    if (form.id === undefined || form.id === null) {
      Alert.alert("Address unavailable", "Return to saved addresses and try again.");
      return;
    }
    setSaving(true);

    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      const addresses = Array.isArray(parsed) ? parsed : [];
      const updatedAddress = {
        id: form.id,
        isDefault: form.isDefault,
        label: form.label.trim(),
        street: form.street.trim(),
        barangay: form.barangay.trim(),
        city: form.city.trim(),
        landmark: form.landmark.trim(),
        latitude: form.latitude,
        longitude: form.longitude,
      };
      const nextAddresses = addresses.map((address) =>
        String(address.id) === String(form.id) ? updatedAddress : address,
      );
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextAddresses));
      router.replace("/saved-addresses");
    } catch {
      Alert.alert("Unable to update address", "Please try again.");
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "right", "bottom", "left"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color="#191919" />
        </Pressable>
        <Text style={styles.headerTitle}>Edit Address</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <FormField name="label" label="LABEL" placeholder="e.g. Home, Office" value={form.label} onChangeText={(value) => updateField("label", value)} error={errors.label} focusedField={focusedField} setFocusedField={setFocusedField} />
          <FormField name="street" label="STREET/PUROK" placeholder="" value={form.street} onChangeText={(value) => updateField("street", value)} error={errors.street} focusedField={focusedField} setFocusedField={setFocusedField} />
          <FormField name="barangay" label="BARANGAY" placeholder="" value={form.barangay} onChangeText={(value) => updateField("barangay", value)} error={errors.barangay} focusedField={focusedField} setFocusedField={setFocusedField} />
          <FormField name="city" label="MUNICIPALITY / CITY" placeholder="" value={form.city} onChangeText={(value) => updateField("city", value)} error={errors.city} focusedField={focusedField} setFocusedField={setFocusedField} />
          <FormField name="landmark" label="LANDMARK (Optional)" placeholder="Optional" value={form.landmark} onChangeText={(value) => updateField("landmark", value)} focusedField={focusedField} setFocusedField={setFocusedField} />

          <Text style={styles.sectionLabel}>LOCATION</Text>
          {hasLocation ? (
            <View style={styles.locationCard}>
              <MapView
                style={styles.mapPreview}
                initialRegion={{ latitude: form.latitude, longitude: form.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 }}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                pointerEvents="none"
              >
                <Marker coordinate={{ latitude: form.latitude, longitude: form.longitude }} />
              </MapView>
              <View style={styles.locationDetails}>
                <View style={styles.locationCopy}>
                  <Text style={styles.locationTitle}>Selected location</Text>
                  <Text style={styles.locationAddress} numberOfLines={2}>{addressText || "Tap map to set pin location"}</Text>
                </View>
                <Pressable onPress={openMapPicker}>
                  <Text style={styles.setLocationLink}>Set Location</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.emptyLocationCard}>
              <Image source={require("../assets/images/map.png")} style={styles.mapImage} />
              <View style={styles.emptyLocationCopy}>
                <Text style={styles.locationTitle}>Set your location on the map</Text>
                <Text style={styles.locationHint}>
                  Pin your exact location to help us find you easily
                </Text>
                <Pressable style={styles.setLocationButton} onPress={openMapPicker}>
                  <Text style={styles.setLocationButtonText}>Set Location</Text>
                </Pressable>
              </View>
            </View>
          )}

          <View style={styles.buttonRow}>
            <Pressable style={styles.cancelButton} onPress={() => router.back()}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.saveButton, saving && styles.disabledButton]} onPress={saveAddress} disabled={saving}>
              <Text style={styles.saveButtonText}>{saving ? "Saving..." : "Save Address"}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8F8F8" },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 15, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#EEEEEE" },
  headerTitle: { flex: 1, textAlign: "center", fontFamily: FONT, fontSize: 18, fontWeight: "700", color: "#191919" },
  headerSpacer: { width: 24 },
  content: { padding: 16, paddingBottom: 32 },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { marginBottom: 7, fontFamily: FONT, fontSize: 13, fontWeight: "600", color: "#343434" },

  input: { height: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: "#DEDEDE", borderRadius: 10, backgroundColor: "#FFFFFF", fontFamily: FONT, fontSize: 14, color: "#202020" },
  focusedInput: { borderColor: PRIMARY, borderWidth: 1.5 },
  errorInput: { borderColor: "#D94848" },
  errorText: { marginTop: 5, fontFamily: FONT, fontSize: 11, color: "#D94848" },
  sectionLabel: { marginBottom: 8, fontFamily: FONT, fontSize: 13, fontWeight: "600", color: "#343434" },
  emptyLocationCard: { minHeight: 126, flexDirection: "row", alignItems: "center", padding: 13, borderWidth: 1, borderColor: "#DEDEDE", borderRadius: 12, backgroundColor: "#FFFFFF" },
  mapImage: { width: 72, height: 72, resizeMode: "contain", marginRight: 12 },
  emptyLocationCopy: { flex: 1 },
  locationTitle: { fontFamily: FONT, fontSize: 13, fontWeight: "700", color: "#2A2A2A" },
  locationHint: { marginTop: 4, fontFamily: FONT, fontSize: 11, lineHeight: 16, color: "#858585" },
  setLocationButton: { alignSelf: "flex-start", marginTop: 10, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: PRIMARY },
  setLocationButtonText: { fontFamily: FONT, fontSize: 11, fontWeight: "700", color: "#FFFFFF" },
  locationCard: { overflow: "hidden", borderWidth: 1, borderColor: "#DEDEDE", borderRadius: 12, backgroundColor: "#FFFFFF" },

  mapPreview: { width: "100%", height: 120 },
  locationDetails: { flexDirection: "row", alignItems: "center", padding: 13 },
  locationCopy: { flex: 1, paddingRight: 10 },
  locationAddress: { marginTop: 3, fontFamily: FONT, fontSize: 11, lineHeight: 16, color: "#777777" },
  setLocationLink: { fontFamily: FONT, fontSize: 12, fontWeight: "700", color: PRIMARY },
  buttonRow: { flexDirection: "row", marginTop: 28, gap: 10 },
  cancelButton: { flex: 1, height: 54, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#343434", borderRadius: 11, backgroundColor: "#FFFFFF" },
  cancelButtonText: { fontFamily: FONT, fontSize: 14, fontWeight: "700", color: "#343434" },
  saveButton: { flex: 2, height: 54, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: PRIMARY },
  saveButtonText: { fontFamily: FONT, fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  disabledButton: { opacity: 0.6 },
});
