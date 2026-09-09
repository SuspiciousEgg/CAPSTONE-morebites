import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const FONT = "Plus Jakarta Sans";
const PRIMARY = "#F97000";

function FormInput({ label, error, focused, secure, visible, onToggle, ...props }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputWrap, focused && styles.focusedInput, error && styles.errorInput]}>
        <TextInput
          style={styles.input}
          placeholderTextColor="#9CA3AF"
          secureTextEntry={secure && !visible}
          {...props}
        />
        {secure ? (
          <Pressable onPress={onToggle} hitSlop={8}>
            <Ionicons name={visible ? "eye-outline" : "eye-off-outline"} size={20} color="#9CA3AF" />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export default function EditProfileScreen() {
  const navigationTimer = useRef(null);
  const [user, setUser] = useState({ fullName: "", phone: "", photo: null });
  const [fullName, setFullName] = useState("");
  const [photo, setPhoto] = useState(null);
  const [storedPassword, setStoredPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentVisible, setCurrentVisible] = useState(false);
  const [newVisible, setNewVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [focusedField, setFocusedField] = useState("");
  const [errors, setErrors] = useState({});
  const [successVisible, setSuccessVisible] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      const [savedUser, savedAccounts] = await Promise.all([
        AsyncStorage.getItem("current_user"),
        AsyncStorage.getItem("registered_accounts"),
      ]);
      const currentUser = savedUser ? JSON.parse(savedUser) : {};
      const accounts = savedAccounts ? JSON.parse(savedAccounts) : [];
      const account = accounts.find((item) => item.phone === currentUser.phone);
      setUser(currentUser);
      setFullName(currentUser.fullName || "");
      setPhoto(currentUser.photo || null);
      setStoredPassword(account?.password || currentUser.password || "");
    };
    loadProfile();

    return () => clearTimeout(navigationTimer.current);
  }, []);

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Please allow photo access to update your profile image.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      const imageValue = asset.base64
        ? `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`
        : asset.uri;
      setPhoto(imageValue);
    }
  };

  const validate = () => {
    const next = {};
    const changingPassword = currentPassword || newPassword || confirmPassword;

    if (!fullName.trim()) next.fullName = "Full name is required";
    if (changingPassword) {
      if (!currentPassword) next.currentPassword = "Current password is required";
      else if (currentPassword !== storedPassword) next.currentPassword = "Current password is incorrect";
      if (!newPassword) next.newPassword = "New password is required";
      if (!confirmPassword) next.confirmPassword = "Please confirm your new password";
      else if (newPassword !== confirmPassword) next.confirmPassword = "Passwords do not match";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const saveChanges = async () => {
    if (!validate()) return;

    const updatedUser = { ...user, fullName: fullName.trim(), photo };
    await AsyncStorage.setItem("current_user", JSON.stringify(updatedUser));

    const savedAccounts = await AsyncStorage.getItem("registered_accounts");
    const accounts = savedAccounts ? JSON.parse(savedAccounts) : [];
    const updatedAccounts = accounts.map((account) =>
      account.phone === user.phone
        ? { ...account, fullName: fullName.trim(), password: newPassword || account.password }
        : account
    );
    await AsyncStorage.setItem("registered_accounts", JSON.stringify(updatedAccounts));

    setSuccessVisible(true);
    navigationTimer.current = setTimeout(() => router.back(), 1500);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color="#121212" />
        </Pressable>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable style={styles.avatarSection} onPress={pickImage}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Ionicons name="person" size={50} color="#8A8A8A" />
            </View>
          )}
          <View style={styles.cameraButton}>
            <Ionicons name="camera" size={16} color="#FFFFFF" />
          </View>
        </Pressable>

        <Text style={styles.sectionLabel}>PERSONAL INFORMATION</Text>
        <FormInput
          label="FULL NAME"
          value={fullName}
          onChangeText={setFullName}
          error={errors.fullName}
          focused={focusedField === "fullName"}
          onFocus={() => setFocusedField("fullName")}
          onBlur={() => setFocusedField("")}
        />

        <Text style={styles.sectionLabel}>SECURITY</Text>
        <FormInput
          label="CURRENT PASSWORD"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          placeholder="Enter current password"
          secure
          visible={currentVisible}
          onToggle={() => setCurrentVisible((current) => !current)}
          error={errors.currentPassword}
          focused={focusedField === "currentPassword"}
          onFocus={() => setFocusedField("currentPassword")}
          onBlur={() => setFocusedField("")}
        />
        <FormInput
          label="NEW PASSWORD"
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="Enter new password"
          secure
          visible={newVisible}
          onToggle={() => setNewVisible((current) => !current)}
          error={errors.newPassword}
          focused={focusedField === "newPassword"}
          onFocus={() => setFocusedField("newPassword")}
          onBlur={() => setFocusedField("")}
        />
        <FormInput
          label="CONFIRM NEW PASSWORD"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Re-enter new password"
          secure
          visible={confirmVisible}
          onToggle={() => setConfirmVisible((current) => !current)}
          error={errors.confirmPassword}
          focused={focusedField === "confirmPassword"}
          onFocus={() => setFocusedField("confirmPassword")}
          onBlur={() => setFocusedField("")}
        />

        <Pressable style={styles.saveButton} onPress={saveChanges}>
          <Text style={styles.saveButtonText}>Save Changes</Text>
        </Pressable>
      </ScrollView>

      {successVisible ? (
        <View style={styles.successBanner}>
          <Ionicons name="checkmark-circle" size={18} color="#15803D" />
          <Text style={styles.successText}>Profile updated!</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  headerTitle: {
    flex: 1,
    color: "#121212",
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  headerSpacer: {
    width: 24,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  avatarSection: {
    width: 94,
    alignSelf: "center",
    marginVertical: 22,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: PRIMARY,
    backgroundColor: "#E5E7EB",
  },
  avatarFallback: {
    width: 90,
    height: 90,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 45,
    borderWidth: 2,
    borderColor: PRIMARY,
    backgroundColor: "#E5E7EB",
  },
  cameraButton: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: PRIMARY,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  sectionLabel: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 10,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 10,
    fontWeight: "600",
    marginBottom: 6,
  },
  inputWrap: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D4D4D4",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
  },
  focusedInput: {
    borderColor: PRIMARY,
  },
  errorInput: {
    borderColor: "#D94343",
    backgroundColor: "#FFF3F2",
  },
  input: {
    flex: 1,
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
    paddingVertical: 10,
  },
  errorText: {
    color: "#D94343",
    fontFamily: FONT,
    fontSize: 11,
    marginTop: 5,
  },
  saveButton: {
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: PRIMARY,
    marginTop: 14,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "700",
  },
  successBanner: {
    position: "absolute",
    right: 20,
    bottom: 20,
    left: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#DCFCE7",
    paddingVertical: 12,
  },
  successText: {
    color: "#15803D",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 6,
  },
});
