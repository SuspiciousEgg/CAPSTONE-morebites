/**
 * PROMPT 46 DIAGNOSTIC REPORT — Forgot-Password / OTP End-to-End Investigation
 *
 * 1. Mobile Flow Screens & Previous API Calls (`morebites-customer/app/(auth)/`):
 *    - `forgot-password.jsx` (`ForgotPasswordScreen`): Validated phone locally against `/^09\d{9}$/`,
 *      then navigated directly to `/(auth)/verify-otp` with NO backend API call. -> Status: UI-only
 *    - `verify-otp.jsx` (`VerifyOtpScreen`): Checked `entered !== "123456"` against a hardcoded static
 *      string on the client and used a local 20-second state timer with NO backend API call. -> Status: UI-only
 *    - `reset-password.jsx` (`ResetPasswordScreen`): Checked `password === confirm` locally without
 *      reading `phone` or any reset token, then navigated to `/(auth)/reset-success` with NO backend
 *      API call. -> Status: UI-only
 *    - `reset-success.jsx` (`ResetSuccessScreen`): Static confirmation screen navigating to `/(auth)/login`.
 *      -> Status: UI-only
 *
 * 2. Laravel Backend Investigation (`morebites-backend`):
 *    - Routes (`routes/api.php`), Controller Methods, & Form Requests: None existed for requesting a
 *      code, verifying a code, or resetting a customer password. -> Status: UI-only (missing)
 *    - OTP / Password-Reset Table & Migration: Only Laravel's default unused `password_reset_tokens`
 *      table (keyed by `email`) existed; no phone-based OTP table, hashed code storage, expiry,
 *      attempt counter, cooldown, or single-use reset token existed. -> Status: UI-only (missing)
 *    - SMS Gateway Config (`.env` & `config/services.php`): `.env` has `MAIL_MAILER=log` and no SMS
 *      gateway credentials configured. -> Status: UI-only (no SMS gateway configured)
 *
 * 3. Fix Implemented:
 *    - Wired `forgot-password.jsx` to `POST /api/customer/forgot-password` (`customerApi.requestPasswordResetOtp`),
 *      `verify-otp.jsx` to `POST /api/customer/verify-otp` (`customerApi.verifyPasswordResetOtp`, 60s
 *      resend cooldown, 5-minute expiry, 5-attempt limit), and `reset-password.jsx` to
 *      `POST /api/customer/reset-password` (`customerApi.resetPassword`) requiring the short-lived,
 *      single-use `reset_token`.
 *    - Outbound OTP delivery is encapsulated in `App\Services\SmsOtpService::sendOtp()`, which logs
 *      the generated 6-digit OTP to `storage/logs/laravel.log` in local/testing environments when no
 *      external SMS gateway is configured, and never returns the code in any API response.
 */

import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
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
import { customerApi } from "../../src/api/client";

const FONT = "Plus Jakarta Sans";
const PHONE_PATTERN = /^09\d{9}$/;

export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams();
  const [phone, setPhone] = useState(params?.phone ? String(params.phone) : "");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState("");
  const [bannerError, setBannerError] = useState("");
  const [sending, setSending] = useState(false);

  const sendCode = async () => {
    const clean = phone.replace(/\s/g, "");
    const message = !clean
      ? "Phone number is required"
      : !PHONE_PATTERN.test(clean)
        ? "Enter a valid 11-digit Philippine mobile number starting with 09"
        : "";

    setError(message);
    setBannerError("");
    if (message || sending) {
      return;
    }

    setSending(true);
    try {
      const res = await customerApi.requestPasswordResetOtp(clean);
      const cooldown = Number(res?.cooldown_seconds) || 60;
      router.push({
        pathname: "/(auth)/verify-otp",
        params: { phone: clean, cooldown: String(cooldown) },
      });
    } catch (err) {
      const msg = err?.message || "Could not send verification code. Please try again.";
      if (err?.status === 422 && /phone/i.test(msg)) {
        setError(msg);
      } else {
        setBannerError(msg);
      }
    } finally {
      setSending(false);
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

        {bannerError ? (
          <View style={styles.errorBanner}>
            <Ionicons
              name="warning-outline"
              size={18}
              color="#D94343"
              style={styles.errorBannerIcon}
            />
            <Text style={styles.errorBannerText}>{bannerError}</Text>
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
              if (bannerError) setBannerError("");
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

        <TouchableOpacity
          style={[styles.button, sending && { opacity: 0.7 }]}
          onPress={sendCode}
          disabled={sending}
        >
          <Text style={styles.buttonText}>{sending ? "Sending Code..." : "Send Code"}</Text>
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
  errorBanner: {
    marginTop: 14,
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
