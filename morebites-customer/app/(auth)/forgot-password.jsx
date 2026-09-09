import { useState } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Image,
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
  const [phone, setPhone] = useState("");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState("");

  const sendCode = () => {
    const clean = phone.replace(/\s/g, "");
    const message = !clean
      ? "Phone number is required"
      : !PHONE_PATTERN.test(clean)
        ? "Invalid phone number format"
        : "";

    setError(message);
    if (!message) {
      router.push({ pathname: "/(auth)/verify-otp", params: { phone: clean } });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Image
          source={require("../../assets/images/lock-padlock-symbol-for-security-interface.png")}
          style={styles.icon}
        />
        <Text style={styles.title}>Forget password</Text>
        <Text style={styles.subtitle}>Enter your phone number to receive an OTP</Text>
        <View style={styles.divider} />

        <Text style={styles.label}>PHONE NUMBER</Text>
        <View style={[styles.inputWrap, focused && styles.focusedInput, error && styles.errorInput]}>
          <TextInput
            style={styles.input}
            placeholder="09XX XXXX XXX"
            placeholderTextColor="#9CA3AF"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
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

        <TouchableOpacity style={styles.button} onPress={sendCode}>
          <Text style={styles.buttonText}>Send Code</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.back} onPress={() => router.replace("/(auth)/login")}>
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
  icon: {
    alignSelf: "center",
    height: 80,
    marginTop: 46,
    resizeMode: "contain",
    width: 80,
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
  },
  divider: {
    backgroundColor: "#F0F0F0",
    height: 1,
    marginTop: 16,
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
    marginTop: 20,
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
  },
});
