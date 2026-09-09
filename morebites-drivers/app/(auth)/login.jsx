import { useState } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authStorage, driverApi } from "../../src/api/client";

const FONT_REGULAR = "Plus Jakarta Sans";
const FONT_MEDIUM = "Plus Jakarta Sans";
const FONT_BOLD = "Plus Jakarta Sans";

export default function LoginScreen() {
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [phoneValue, setPhoneValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");
  const [loginError, setLoginError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [saving, setSaving] = useState(false);

  const signIn = async () => {
    const hasPhone = phoneValue.trim().length > 0;
    const hasPassword = passwordValue.trim().length > 0;

    if (!hasPhone || !hasPassword) {
      setLoginError("Incorrect phone number or password. Please try again.");
      setPhoneError(!hasPhone ? "Phone number is required" : "");
      setPasswordError(!hasPassword ? "Password is required" : "");
      return;
    }

    setSaving(true);
    setLoginError("");
    setPhoneError("");
    setPasswordError("");

    try {
      const res = await driverApi.login(phoneValue.trim(), passwordValue);
      await authStorage.saveSession(res.token, res.user);
      router.replace("/(tabs)/home");
    } catch (err) {
      const msg = err.message || "Incorrect phone number or password.";
      if (/phone/i.test(msg) && /not found|inactive/i.test(msg)) {
        setPhoneError(msg);
      } else if (/password/i.test(msg)) {
        setPasswordError(msg);
      } else {
        setLoginError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.loginContainer}>
      <View style={styles.loginHeader}>
        <Text style={styles.loginTitle}>Login Account</Text>
        <Text style={styles.loginSubtitle}>Enter your account to proceed</Text>
        <View style={styles.headerDivider} />
      </View>

      <View style={styles.formArea}>
        {loginError ? (
          <View style={styles.errorBanner}>
            <Ionicons
              name="warning-outline"
              size={18}
              color="#D94343"
              style={styles.errorBannerIcon}
            />
            <Text style={styles.errorBannerText}>{loginError}</Text>
          </View>
        ) : null}
        <Text style={styles.fieldLabel}>PHONE NUMBER</Text>
        <View
          style={[
            styles.inputWrap,
            phoneFocused && styles.focusedInputWrap,
            phoneError && styles.errorInputWrap,
          ]}
        >
          <TextInput
            style={styles.input}
            keyboardType="phone-pad"
            placeholder="09XX XXX XXX"
            placeholderTextColor="#9CA3AF"
            value={phoneValue}
            onChangeText={setPhoneValue}
            onFocus={() => setPhoneFocused(true)}
            onBlur={() => setPhoneFocused(false)}
            autoCapitalize="none"
          />
        </View>
        {phoneError ? (
          <View style={styles.fieldErrorRow}>
            <Ionicons
              name="warning-outline"
              size={14}
              color="#D94343"
              style={styles.fieldErrorIcon}
            />
            <Text style={styles.fieldErrorText}>{phoneError}</Text>
          </View>
        ) : null}

        <Text style={styles.fieldLabel}>PASSWORD</Text>
        <View
          style={[
            styles.inputWrap,
            styles.passwordWrap,
            passwordFocused && styles.focusedInputWrap,
            passwordError && styles.errorInputWrap,
          ]}
        >
          <TextInput
            style={styles.input}
            secureTextEntry={!passwordVisible}
            placeholder="Enter your password"
            placeholderTextColor="#9CA3AF"
            value={passwordValue}
            onChangeText={setPasswordValue}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
          />
          <TouchableOpacity
            onPress={() => setPasswordVisible(!passwordVisible)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={passwordVisible ? "eye-outline" : "eye-off-outline"}
              size={20}
              color="#9CA3AF"
            />
          </TouchableOpacity>
        </View>
        {passwordError ? (
          <View style={styles.fieldErrorRow}>
            <Ionicons
              name="warning-outline"
              size={14}
              color="#D94343"
              style={styles.fieldErrorIcon}
            />
            <Text style={styles.fieldErrorText}>{passwordError}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.signInButton, saving && { opacity: 0.7 }]}
          activeOpacity={0.85}
          onPress={signIn}
          disabled={saving}
        >
          <Text style={styles.signInText}>{saving ? "Signing In..." : "Sign In"}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loginContainer: {
    flex: 1,
    backgroundColor: "#ECECEC",
    paddingHorizontal: 28,
    justifyContent: "flex-start",
    paddingTop: 60,
    paddingBottom: 26,
  },
  loginHeader: {
    marginTop: 10,
  },
  loginTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 37,
    color: "#121212",
  },
  loginSubtitle: {
    marginTop: 8,
    fontFamily: FONT_REGULAR,
    fontSize: 14,
    color: "#8F8F8F",
  },
  headerDivider: {
    marginTop: 16,
    height: 1,
    width: "100%",
    backgroundColor: "#F0F0F0",
  },
  formArea: {
    marginTop: 18,
  },
  fieldLabel: {
    marginTop: 12,
    marginBottom: 8,
    fontFamily: FONT_MEDIUM,
    color: "#4B4B4B",
    fontSize: 12,
    letterSpacing: 0.3,
  },
  inputWrap: {
    minHeight: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D4D4D4",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  focusedInputWrap: {
    borderColor: "#F97000",
    backgroundColor: "#FFFFFF",
  },
  errorInputWrap: {
    borderColor: "#D94343",
    backgroundColor: "#FFF3F2",
  },
  passwordWrap: {
    borderColor: "#D4D4D4",
  },
  input: {
    flex: 1,
    fontFamily: FONT_REGULAR,
    color: "#1F2937",
    fontSize: 14,
    paddingVertical: 10,
  },
  errorBanner: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#FDEDEC",
    borderWidth: 1,
    borderColor: "#F5C6CB",
    flexDirection: "row",
    alignItems: "center",
  },
  errorBannerIcon: {
    marginRight: 10,
  },
  errorBannerText: {
    flex: 1,
    color: "#9B2C2C",
    fontFamily: FONT_MEDIUM,
    fontSize: 13,
    lineHeight: 18,
  },
  fieldErrorRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  fieldErrorIcon: {
    marginRight: 6,
  },
  fieldErrorText: {
    color: "#D94343",
    fontFamily: FONT_REGULAR,
    fontSize: 12,
  },
  signInButton: {
    height: 54,
    borderRadius: 9,
    backgroundColor: "#F97000",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },
  signInText: {
    color: "#FFFFFF",
    fontFamily: FONT_BOLD,
    fontSize: 24,
  },
});
