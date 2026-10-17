import { useEffect, useRef, useState } from "react";
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
const DEFAULT_COOLDOWN_SECONDS = 20;

export default function VerifyOtpScreen() {
  const params = useLocalSearchParams();
  const rawIdentifier = params.identifier ?? params.phone ?? params.email;
  const identifier = Array.isArray(rawIdentifier) ? rawIdentifier[0] : rawIdentifier;
  const rawEmail = params.email;
  const email = Array.isArray(rawEmail) ? rawEmail[0] : rawEmail;
  const rawChannel = params.channel;
  const channel = Array.isArray(rawChannel) ? rawChannel[0] : rawChannel;

  const isEmail = channel === "email" || (identifier && identifier.includes("@")) || Boolean(email);
  const targetLabel = email || identifier || "";
  const initialCooldown = Math.max(
    0,
    Number(Array.isArray(params.cooldown) ? params.cooldown[0] : params.cooldown) ||
      DEFAULT_COOLDOWN_SECONDS
  );

  const [code, setCode] = useState(Array(6).fill(""));
  const [timer, setTimer] = useState(initialCooldown);
  const [error, setError] = useState("");
  const [bannerError, setBannerError] = useState("");
  const [resent, setResent] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const refs = useRef([]);

  useEffect(() => {
    const focusTimeout = setTimeout(() => {
      refs.current[0]?.focus();
    }, 250);
    return () => clearTimeout(focusTimeout);
  }, []);

  useEffect(() => {
    if (!timer || timer <= 0) return undefined;
    const interval = setInterval(() => {
      setTimer((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [timer]);

  const updateCode = (value, index) => {
    const clean = value.replace(/\D/g, "");

    // Google Android SMS OTP autofill / full 6-digit paste
    if (clean.length >= 6) {
      const digits = clean.slice(0, 6).split("");
      setCode(digits);
      setError("");
      setBannerError("");
      refs.current[5]?.focus();
      return;
    }

    // Single-digit replacement when user types over an already-filled box
    if (clean.length === 2 && code[index]) {
      const newDigit = clean.slice(-1);
      const next = [...code];
      next[index] = newDigit;
      setCode(next);
      setError("");
      setBannerError("");
      if (index < 5) refs.current[index + 1]?.focus();
      return;
    }

    // Multi-digit partial paste
    if (clean.length > 1) {
      const digits = clean.split("");
      const next = [...code];
      digits.forEach((digit, i) => {
        if (index + i < 6) next[index + i] = digit;
      });
      setCode(next);
      setError("");
      setBannerError("");
      const nextIndex = Math.min(index + digits.length - 1, 5);
      refs.current[nextIndex]?.focus();
      return;
    }

    const digit = clean.slice(-1);
    const next = [...code];
    next[index] = digit;
    setCode(next);
    setError("");
    setBannerError("");
    if (digit && index < 5) refs.current[index + 1]?.focus();
  };

  const onKeyPress = ({ nativeEvent }, index) => {
    if (nativeEvent.key === "Backspace" && !code[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const resend = async () => {
    if (resending || timer > 0) return;
    if (!identifier) {
      setError("Account information is missing. Please go back and try again.");
      return;
    }

    setResending(true);
    setError("");
    setBannerError("");

    try {
      const res = await customerApi.requestPasswordResetOtp(String(identifier));
      setTimer(Number(res?.cooldown_seconds) || DEFAULT_COOLDOWN_SECONDS);
      setCode(Array(6).fill(""));
      setResent(true);
      refs.current[0]?.focus();
      setTimeout(() => setResent(false), 1800);
    } catch (err) {
      const retryAfter = Number(err?.data?.retry_after) || 0;
      if (retryAfter > 0) {
        setTimer(retryAfter);
      }
      const msg = err?.message || "Could not resend verification code. Please try again.";
      if (/cannot reach the api/i.test(msg)) {
        setBannerError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setResending(false);
    }
  };

  const verify = async () => {
    const entered = code.join("");
    if (entered.length < 6) {
      setError("Please enter the complete 6-digit code.");
      return;
    }
    if (!identifier) {
      setError("Account information is missing. Please go back and try again.");
      return;
    }
    if (verifying) return;

    setVerifying(true);
    setError("");
    setBannerError("");

    try {
      const res = await customerApi.verifyPasswordResetOtp(String(identifier), entered);
      const resetToken = res?.reset_token || "";
      router.push({
        pathname: "/(auth)/reset-password",
        params: {
          phone: String(identifier),
          identifier: String(identifier),
          resetToken: String(resetToken),
        },
      });
    } catch (err) {
      const msg = err?.message || "Incorrect OTP. Please try again.";
      if (/cannot reach the api/i.test(msg)) {
        setBannerError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {isEmail ? (
          <View style={[styles.icon, { justifyContent: "center", alignItems: "center" }]}>
            <Ionicons name="mail-open-outline" size={72} color="#F97000" />
          </View>
        ) : (
          <Image
            source={require("../../assets/images/telephone.png")}
            style={styles.icon}
          />
        )}
        <Text style={styles.title}>{isEmail ? "Verify your email" : "Verify your number"}</Text>
        <Text style={styles.subtitle}>
          {isEmail
            ? `Enter the 6-digit verification code sent to ${targetLabel || "your email"}`
            : "Enter the 6-digit code sent to your phone number"}
        </Text>
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

        <View style={styles.otpRow}>
          {code.map((value, index) => (
            <TextInput
              key={index}
              ref={(input) => {
                refs.current[index] = input;
              }}
              style={[styles.box, focusedIndex === index && styles.focusedBox]}
              value={value}
              maxLength={6}
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              importantForAutofill="yes"
              selectTextOnFocus
              textAlign="center"
              onChangeText={(text) => updateCode(text, index)}
              onKeyPress={(event) => onKeyPress(event, index)}
              onFocus={() => setFocusedIndex(index)}
              onBlur={() => setFocusedIndex(-1)}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.button, verifying && { opacity: 0.7 }]}
          onPress={verify}
          disabled={verifying}
        >
          <Text style={styles.buttonText}>{verifying ? "Verifying..." : "Verify OTP"}</Text>
        </TouchableOpacity>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {resent ? <Text style={styles.resentText}>Code resent!</Text> : null}

        {timer > 0 ? (
          <Text style={styles.timerText}>
            Resend OTP in <Text style={styles.timerAccent}>{timer} seconds</Text>
          </Text>
        ) : (
          <View style={styles.resendRow}>
            <Text style={styles.timerText}>Didn&apos;t receive any code? </Text>
            <TouchableOpacity onPress={resend} disabled={resending}>
              <Text style={styles.resendText}>
                {resending ? "Sending..." : "Resend Code"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

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
    lineHeight: 20,
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
  otpRow: {
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    marginTop: 20,
  },
  box: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D4D4D4",
    borderRadius: 10,
    borderWidth: 1,
    color: "#121212",
    fontFamily: FONT,
    fontSize: 20,
    fontWeight: "700",
    height: 56,
    width: 46,
  },
  focusedBox: {
    borderColor: "#F97000",
  },
  button: {
    alignItems: "center",
    backgroundColor: "#F97000",
    borderRadius: 9,
    height: 54,
    justifyContent: "center",
    marginTop: 18,
  },
  buttonText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "700",
  },
  errorText: {
    color: "#D94343",
    fontFamily: FONT,
    fontSize: 13,
    marginTop: 10,
    textAlign: "center",
  },
  resentText: {
    color: "#22C55E",
    fontFamily: FONT,
    fontSize: 13,
    marginTop: 12,
    textAlign: "center",
  },
  timerText: {
    color: "#8F8F8F",
    fontFamily: FONT,
    fontSize: 12,
    marginTop: 12,
    textAlign: "center",
  },
  timerAccent: {
    color: "#F97000",
  },
  resendRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 12,
  },
  resendText: {
    color: "#F97000",
    fontFamily: FONT,
    fontSize: 12,
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
