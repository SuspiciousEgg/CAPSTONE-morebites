import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authStorage, driverApi } from "../src/api/client";
import { pickImage } from "../src/utils/pickImage";

const FONT = "Plus Jakarta Sans";

export default function EditProfileScreen() {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [photo, setPhoto] = useState("");
  const [focusedField, setFocusedField] = useState("");
  const [successVisible, setSuccessVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await driverApi.me();
        if (res?.user) {
          const local = (await authStorage.getUser()) || {};
          const merged = { ...res.user, photo: local.photo || "" };
          await authStorage.updateUser(merged);
          setFullName(merged.fullName || "");
          setPhone(merged.phone || "");
          setEmail(merged.email || "");
          setPhoto(merged.photo || "");
          return;
        }
      } catch {
        // Fall back to cached session.
      }

      const user = (await authStorage.getUser()) || {};
      setFullName(user.fullName || "");
      setPhone(user.phone || "");
      setEmail(user.email || "");
      setPhoto(user.photo || "");
    };

    loadUser();
  }, []);

  const changePhoto = async () => {
    const selected = await pickImage({ aspect: [1, 1], quality: 0.8 });
    if (!selected?.uri) return;

    setPhoto(selected.uri);
    await authStorage.updateUser({ photo: selected.uri });
  };

  const saveChanges = async () => {
    const hasPasswordInput =
      currentPassword.trim() || newPassword.trim() || confirmPassword.trim();

    if (hasPasswordInput) {
      if (
        !currentPassword.trim() ||
        !newPassword.trim() ||
        !confirmPassword.trim()
      ) {
        setPasswordError("Fill in all three fields to change your password");
        return;
      }
      if (newPassword !== confirmPassword) {
        setPasswordError("New password and confirmation do not match");
        return;
      }
    }

    setPasswordError("");
    setSaving(true);

    try {
      if (hasPasswordInput) {
        await driverApi.changePassword({
          current_password: currentPassword,
          password: newPassword,
          password_confirmation: confirmPassword,
        });
      }

      const [firstName, ...rest] = fullName.trim().split(/\s+/);
      const lastName = rest.join(" ");
      const res = await driverApi.updateProfile({
        first_name: firstName || fullName.trim(),
        last_name: lastName || "",
      });

      const updated = {
        ...(res.user || {}),
        fullName: res.user?.fullName || fullName,
        photo,
      };
      await authStorage.updateUser(updated);

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccessVisible(true);
      setTimeout(() => router.back(), 900);
    } catch (err) {
      const msg = err.message || "Could not update profile.";
      if (/password/i.test(msg)) {
        setPasswordError(msg);
      } else {
        Alert.alert("Save failed", msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerButton}
            activeOpacity={0.7}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#121212" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <View style={styles.headerButton} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.avatarSection}>
            <View style={styles.avatarCircle}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person" size={48} color="#9CA3AF" />
              )}
            </View>
            <Text style={styles.driverName}>{fullName || "Driver"}</Text>
            <Text style={styles.driverEmail}>{email || "Email not provided"}</Text>
            <TouchableOpacity activeOpacity={0.75} onPress={changePhoto}>
              <Text style={styles.changePhotoText}>Change photo</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>RIDER INFORMATION</Text>

          <Text style={styles.inputLabel}>Full Name</Text>
          <View
            style={[
              styles.inputWrap,
              focusedField === "name" && styles.inputWrapFocused,
            ]}
          >
            <Ionicons name="person-outline" size={19} color="#9CA3AF" />
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Full name"
              placeholderTextColor="#9CA3AF"
              onFocus={() => setFocusedField("name")}
              onBlur={() => setFocusedField("")}
            />
          </View>

          <Text style={styles.inputLabel}>Phone Number</Text>
          <View style={styles.readOnlyWrap}>
            <Ionicons name="call-outline" size={19} color="#9CA3AF" />
            <Text style={styles.readOnlyText}>{phone || "Not provided"}</Text>
          </View>
          <Text style={styles.helperText}>
            Contact Super Admin to update your phone number
          </Text>

          <Text style={styles.inputLabel}>Email Address</Text>
          <View style={styles.readOnlyWrap}>
            <Ionicons name="mail-outline" size={19} color="#9CA3AF" />
            <Text style={styles.readOnlyText}>{email || "Not provided"}</Text>
          </View>
          <Text style={styles.helperText}>
            Contact Super Admin to update your email
          </Text>

          <Text style={[styles.sectionTitle, styles.passwordSectionTitle]}>
            CHANGE PASSWORD
          </Text>

          {passwordError ? (
            <View style={styles.errorBanner}>
              <Ionicons name="warning-outline" size={16} color="#D94343" />
              <Text style={styles.errorBannerText}>{passwordError}</Text>
            </View>
          ) : null}

          <Text style={styles.inputLabel}>Current Password</Text>
          <View
            style={[
              styles.inputWrap,
              focusedField === "currentPassword" && styles.inputWrapFocused,
            ]}
          >
            <Ionicons name="lock-closed-outline" size={19} color="#9CA3AF" />
            <TextInput
              style={styles.input}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry={!showCurrentPassword}
              placeholder="Enter current password"
              placeholderTextColor="#9CA3AF"
              onFocus={() => setFocusedField("currentPassword")}
              onBlur={() => setFocusedField("")}
            />
            <TouchableOpacity
              onPress={() => setShowCurrentPassword(!showCurrentPassword)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={showCurrentPassword ? "eye-outline" : "eye-off-outline"}
                size={19}
                color="#9CA3AF"
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.inputLabel}>New Password</Text>
          <View
            style={[
              styles.inputWrap,
              focusedField === "newPassword" && styles.inputWrapFocused,
            ]}
          >
            <Ionicons name="lock-closed-outline" size={19} color="#9CA3AF" />
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showNewPassword}
              placeholder="Enter new password"
              placeholderTextColor="#9CA3AF"
              onFocus={() => setFocusedField("newPassword")}
              onBlur={() => setFocusedField("")}
            />
            <TouchableOpacity
              onPress={() => setShowNewPassword(!showNewPassword)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={showNewPassword ? "eye-outline" : "eye-off-outline"}
                size={19}
                color="#9CA3AF"
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.inputLabel}>Confirm New Password</Text>
          <View
            style={[
              styles.inputWrap,
              focusedField === "confirmPassword" && styles.inputWrapFocused,
            ]}
          >
            <Ionicons name="lock-closed-outline" size={19} color="#9CA3AF" />
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              placeholder="Re-enter new password"
              placeholderTextColor="#9CA3AF"
              onFocus={() => setFocusedField("confirmPassword")}
              onBlur={() => setFocusedField("")}
            />
            <TouchableOpacity
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={showConfirmPassword ? "eye-outline" : "eye-off-outline"}
                size={19}
                color="#9CA3AF"
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, saving && { opacity: 0.7 }]}
            activeOpacity={0.85}
            onPress={saveChanges}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>
              {saving ? "Saving..." : "Save Changes"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {successVisible ? (
        <View style={styles.successToast}>
          <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
          <Text style={styles.successToastText}>Profile updated successfully</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: 14,
  },
  headerButton: {
    alignItems: "center",
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  headerTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 20,
    fontWeight: "700",
  },
  scrollContent: {
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  avatarSection: {
    alignItems: "center",
    paddingBottom: 28,
    paddingTop: 12,
  },
  avatarCircle: {
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 45,
    height: 90,
    justifyContent: "center",
    overflow: "hidden",
    width: 90,
  },
  avatarImage: {
    height: "100%",
    resizeMode: "cover",
    width: "100%",
  },
  driverName: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 19,
    fontWeight: "700",
    marginTop: 12,
  },
  driverEmail: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 12,
    marginTop: 4,
  },
  changePhotoText: {
    color: "#F97000",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 10,
  },
  sectionTitle: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  passwordSectionTitle: {
    marginTop: 26,
  },
  inputLabel: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 12,
    marginBottom: 7,
    marginTop: 10,
  },
  inputWrap: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#9CA3AF",
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 52,
    paddingHorizontal: 13,
  },
  inputWrapFocused: {
    borderColor: "#F97000",
  },
  input: {
    color: "#121212",
    flex: 1,
    fontFamily: FONT,
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  readOnlyWrap: {
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderColor: "#E5E7EB",
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 52,
    paddingHorizontal: 13,
  },
  readOnlyText: {
    color: "#4B5563",
    flex: 1,
    fontFamily: FONT,
    fontSize: 14,
    paddingHorizontal: 10,
  },
  helperText: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 11,
    marginTop: 6,
  },
  errorBanner: {
    alignItems: "center",
    backgroundColor: "#FDEDEC",
    borderColor: "#F5C6CB",
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorBannerText: {
    color: "#9B2C2C",
    flex: 1,
    fontFamily: FONT,
    fontSize: 12,
    lineHeight: 17,
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: "#F97000",
    borderRadius: 9,
    height: 54,
    justifyContent: "center",
    marginTop: 30,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: "700",
  },
  successToast: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#22C55E",
    borderRadius: 10,
    borderWidth: 1,
    bottom: 24,
    elevation: 8,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: "absolute",
    shadowColor: "#121212",
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  successToastText: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "600",
  },
});
