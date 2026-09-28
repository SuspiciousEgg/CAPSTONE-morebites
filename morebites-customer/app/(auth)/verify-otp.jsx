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
const DEFAULT_COOLDOWN_SECONDS = 60;

export default function VerifyOtpScreen() {
  const params = useLocalSearchParams();
  const phone = Array.isArray(params.phone) ? params.phone[0] : params.phone;
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
    if (!timer || timer <= 0) return undefined;
    const interval = setInterval(() => {
      setTimer((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [timer]);

  const updateCode = (value, index) => {
    const digit = value.replace(/\D/g, "").slice(-1);
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
    if (!phone) {
      setError("Phone number is missing. Please go back and enter your phone number.");
      return;
    }

    setResending(true);
    setError("");
    setBannerError("");

    try {
      const res = await customerApi.requestPasswordResetOtp(String(phone));
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
    if (!phone) {
      setError("Phone number is missing. Please go back and enter your phone number.");
      return;
    }
    if (verifying) return;

    setVerifying(true);
    setError("");
    setBannerError("");

    try {
      const res = await customerApi.verifyPasswordResetOtp(String(phone), entered);
      const resetToken = res?.reset_token || "";
      router.push({
        pathname: "/(auth)/reset-password",
        params: {
          phone: String(phone),
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
        <Image source={require("../../assets/images/telephone.png")} style={styles.icon} />
        <Text style={styles.title}>Verify your number</Text>
        <Text style={styles.subtitle}>Enter the 6-digit code sent to your phone number</Text>
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
              maxLength={1}
              keyboardType="number-pad"
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
