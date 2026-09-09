import { useState } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authStorage, customerApi } from "../../src/api/client";

const FONT = "Plus Jakarta Sans";
const PHONE_PATTERN = /^09\d{9}$/;

function FieldError({ message }) {
  if (!message) return null;
  return (
    <View style={styles.fieldError}>
      <Ionicons name="warning-outline" size={14} color="#D94343" />
      <Text style={styles.fieldErrorText}>{message}</Text>
    </View>
  );
}

export default function RegisterScreen() {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [focusedField, setFocusedField] = useState("");
  const [errors, setErrors] = useState({});
  const [generalError, setGeneralError] = useState("");
  const [saving, setSaving] = useState(false);

  const strength =
    password.length < 6
      ? { label: "Weak", color: "#D94343", level: 1 }
      : password.length >= 8 && /\d/.test(password) && /[^A-Za-z0-9]/.test(password)
        ? { label: "Strong", color: "#22C55E", level: 3 }
        : { label: "Medium", color: "#F97000", level: 2 };

  const validate = () => {
    const next = {};
    if (!fullName.trim()) next.fullName = "Full name is required";
    if (!phone.trim()) next.phone = "Phone number is required";
    else if (!PHONE_PATTERN.test(phone.replace(/\s/g, ""))) next.phone = "Enter a valid Philippine phone number";
    if (!password) next.password = "Password is required";
    else if (password.length < 6) next.password = "Password must be at least 6 characters";
    if (!confirmPassword) next.confirmPassword = "Please confirm your password";
    else if (password !== confirmPassword) next.confirmPassword = "Passwords do not match";

    setErrors(next);
    setGeneralError(Object.keys(next).length ? "Please correct the highlighted fields." : "");
    return Object.keys(next).length === 0;
  };

  const createAccount = async () => {
    if (!validate()) return;

    setGeneralError("");
    setSaving(true);
    try {
      const res = await customerApi.register({
        full_name: fullName.trim(),
        phone: phone.replace(/\s/g, ""),
        password,
        password_confirmation: confirmPassword,
      });
      await authStorage.saveSession(res.token, res.user);
      router.replace("/(tabs)/home");
    } catch (err) {
      const msg = err.message || "Registration failed.";
      if (/phone/i.test(msg)) {
        setErrors({ phone: msg });
        setGeneralError("Please correct the highlighted fields.");
      } else {
        setGeneralError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = (name) => [
    styles.inputWrap,
    focusedField === name && styles.focusedInput,
    errors[name] && styles.errorInput,
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Fill in your details to get started</Text>
        <View style={styles.divider} />

        {generalError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={18} color="#D94343" />
            <Text style={styles.bannerText}>{generalError}</Text>
          </View>
        ) : null}

        <Text style={styles.label}>FULL NAME</Text>
        <View style={inputStyle("fullName")}>
          <TextInput
            style={styles.input}
            placeholder="John Doe"
            placeholderTextColor="#9CA3AF"
            value={fullName}
            onChangeText={setFullName}
            onFocus={() => setFocusedField("fullName")}
            onBlur={() => setFocusedField("")}
          />
        </View>
        <FieldError message={errors.fullName} />

        <Text style={styles.label}>PHONE NUMBER</Text>
        <View style={inputStyle("phone")}>
          <TextInput
            style={styles.input}
            placeholder="09XX XXX XXXX"
            placeholderTextColor="#9CA3AF"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            onFocus={() => setFocusedField("phone")}
            onBlur={() => setFocusedField("")}
          />
        </View>
        <FieldError message={errors.phone} />

        <Text style={styles.label}>PASSWORD</Text>
        <View style={inputStyle("password")}>
          <TextInput
            style={styles.input}
            secureTextEntry={!visible}
            placeholder="Enter your password"
            placeholderTextColor="#9CA3AF"
            value={password}
            onChangeText={setPassword}
            onFocus={() => setFocusedField("password")}
            onBlur={() => setFocusedField("")}
          />
          <TouchableOpacity onPress={() => setVisible(!visible)}>
            <Ionicons name={visible ? "eye-outline" : "eye-off-outline"} size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
        <FieldError message={errors.password} />

        {password ? (
          <View style={styles.strengthRow}>
            <View style={styles.strengthBars}>
              {[1, 2, 3].map((level) => (
                <View
                  key={level}
                  style={[
                    styles.strengthBar,
                    level <= strength.level && { backgroundColor: strength.color },
                  ]}
                />
              ))}
            </View>
            <Text style={[styles.strengthText, { color: strength.color }]}>{strength.label}</Text>
          </View>
        ) : null}

        <Text style={styles.label}>CONFIRM PASSWORD</Text>
        <View style={inputStyle("confirmPassword")}>
          <TextInput
            style={styles.input}
            secureTextEntry={!confirmVisible}
            placeholder="Re-enter your password"
            placeholderTextColor="#9CA3AF"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            onFocus={() => setFocusedField("confirmPassword")}
            onBlur={() => setFocusedField("")}
          />
          <TouchableOpacity onPress={() => setConfirmVisible(!confirmVisible)}>
            <Ionicons name={confirmVisible ? "eye-outline" : "eye-off-outline"} size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
        <FieldError message={errors.confirmPassword} />

        <TouchableOpacity
          style={[styles.primaryButton, saving && { opacity: 0.7 }]}
          activeOpacity={0.85}
          onPress={createAccount}
          disabled={saving}
        >
          <Text style={styles.primaryText}>{saving ? "Creating Account..." : "Create Account"}</Text>
        </TouchableOpacity>

        <View style={styles.loginRow}>
          <Text style={styles.loginText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.replace("/(auth)/login")}>
            <Text style={styles.loginLink}>Login here</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ECECEC",
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 28,
  },
  title: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 32,
    fontWeight: "700",
  },
  subtitle: {
    color: "#8F8F8F",
    fontFamily: FONT,
    fontSize: 14,
    marginTop: 6,
  },
  divider: {
    height: 1,
    backgroundColor: "#F0F0F0",
    marginTop: 16,
  },
  errorBanner: {
    backgroundColor: "#FDEDEC",
    borderColor: "#F5C6CB",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
    padding: 14,
  },
  bannerText: {
    color: "#9B2C2C",
    flex: 1,
    fontFamily: FONT,
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    color: "#4B4B4B",
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
    marginBottom: 8,
    marginTop: 16,
  },
  inputWrap: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#D4D4D4",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 50,
    paddingHorizontal: 14,
  },
  focusedInput: {
    borderColor: "#F97000",
  },
  errorInput: {
    backgroundColor: "#FFF3F2",
    borderColor: "#D94343",
  },
  input: {
    color: "#121212",
    flex: 1,
    fontFamily: FONT,
    fontSize: 14,
    paddingVertical: 11,
  },
  fieldError: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 7,
  },
  fieldErrorText: {
    color: "#D94343",
    fontFamily: FONT,
    fontSize: 12,
  },
  strengthRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 7,
  },
  strengthBars: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
  },
  strengthBar: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D4D4D4",
  },
  strengthText: {
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: "600",
    width: 48,
    textAlign: "right",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#F97000",
    borderRadius: 9,
    height: 54,
    justifyContent: "center",
    marginTop: 22,
  },
  primaryText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "700",
  },
  loginRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginTop: "auto",
    paddingTop: 42,
  },
  loginText: {
    color: "#8A8A8A",
    fontFamily: FONT,
    fontSize: 12,
  },
  loginLink: {
    color: "#F97000",
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: "700",
  },
});
