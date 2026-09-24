import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const FONT = "Plus Jakarta Sans";
const PHONE_PATTERN = /^09\d{9}$/;

export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams();
  const [phone, setPhone] = useState(params?.phone ? String(params.phone) : "");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const sendRequest = () => {
    const clean = phone.replace(/\s/g, "");
    const message = !clean
      ? "Phone number is required"
      : !PHONE_PATTERN.test(clean)
        ? "Enter a valid 11-digit Philippine mobile number starting with 09"
        : "";

    setError(message);
    if (!message) {
      setSubmitted(true);
      Alert.alert(
        "Password Reset Request",
        "Your request to secure and reset your driver account has been submitted. Please contact dispatch or administrator if you suspect unauthorized activity.",
        [
          {
            text: "Back to Login",
            onPress: () => router.replace("/(auth)/login"),
          },
        ]
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="lock-closed-outline" size={54} color="#F97000" />
        </View>
        <Text style={styles.title}>Forgot Password</Text>
        <Text style={styles.subtitle}>
          Enter your registered phone number to secure your account and reset your password
        </Text>
        <View style={styles.divider} />

        {submitted ? (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#16A34A" />
            <Text style={styles.successBannerText}>
              Security request submitted for {phone}. Contact dispatch or administrator to finalize your password update.
            </Text>
          </View>
        ) : null}

        <Text style={styles.label}>PHONE NUMBER</Text>
        <View style={[styles.inputWrap, focused && styles.focusedInput, error && styles.errorInput]}>
          <TextInput
            style={styles.input}
            placeholder="09XX XXX XXXX"
            placeholderTextColor="#9CA3AF"
            keyboardType="phone-pad"
            maxLength={11}
            value={phone}
            onChangeText={(val) => {
              setPhone(val.replace(/\D/g, "").slice(0, 11));
              if (error) setError("");
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
        </View>
        {error ? (
          <View style={styles.errorRow}>
            <Ionicons name="warning-outline" size={14} color="#D94343" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity style={styles.button} onPress={sendRequest} activeOpacity={0.85}>
          <Text style={styles.buttonText}>Reset Password</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.back}
          onPress={() => router.replace("/(auth)/login")}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={18} color="#F97000" />
          <Text style={styles.backText}>Back to login</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ECECEC",
    paddingHorizontal: 28,
    paddingTop: 60,
  },
  content: {
    flex: 1,
  },
  iconContainer: {
    alignSelf: "center",
    height: 90,
    width: 90,
    borderRadius: 45,
    backgroundColor: "#FFF3E6",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 36,
  },
  title: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 32,
    fontWeight: "700",
    marginTop: 18,
    textAlign: "center",
  },
  subtitle: {
    color: "#8F8F8F",
    fontFamily: FONT,
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  divider: {
    backgroundColor: "#F0F0F0",
    height: 1,
    marginTop: 18,
    marginBottom: 8,
  },
  successBanner: {
    marginTop: 12,
    marginBottom: 4,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  successBannerText: {
    flex: 1,
    color: "#065F46",
    fontFamily: FONT,
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    color: "#4B4B4B",
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: "600",
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
  errorRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 7,
  },
  errorText: {
    color: "#D94343",
    fontFamily: FONT,
    fontSize: 12,
  },
  button: {
    alignItems: "center",
    backgroundColor: "#F97000",
    borderRadius: 9,
    height: 54,
    justifyContent: "center",
    marginTop: 22,
  },
  buttonText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "700",
  },
  back: {
    alignItems: "center",
    alignSelf: "center",
    bottom: 24,
    flexDirection: "row",
    gap: 5,
    position: "absolute",
  },
  backText: {
    color: "#F97000",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "600",
  },
});

