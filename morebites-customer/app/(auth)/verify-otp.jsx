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

const FONT = "Plus Jakarta Sans";

export default function VerifyOtpScreen() {
  const { phone } = useLocalSearchParams();
  const [code, setCode] = useState(Array(6).fill(""));
  const [timer, setTimer] = useState(20);
  const [error, setError] = useState("");
  const [resent, setResent] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const refs = useRef([]);

  useEffect(() => {
    if (!timer) return undefined;
    const interval = setInterval(() => setTimer((current) => current - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  const updateCode = (value, index) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[index] = digit;
    setCode(next);
    setError("");
    if (digit && index < 5) refs.current[index + 1]?.focus();
  };

  const onKeyPress = ({ nativeEvent }, index) => {
    if (nativeEvent.key === "Backspace" && index > 0) refs.current[index - 1]?.focus();
  };

  const resend = () => {
    setTimer(20);
    setCode(Array(6).fill(""));
    setError("");
    setResent(true);
    refs.current[0]?.focus();
    setTimeout(() => setResent(false), 1800);
  };

  const verify = () => {
    const entered = code.join("");
    if (entered.length < 6) {
      setError("Please enter the complete 6-digit code.");
      return;
    }
    if (entered !== "123456") {
      setError("Incorrect OTP. Please try again.");
      return;
    }
    router.push({ pathname: "/(auth)/reset-password", params: { phone } });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Image source={require("../../assets/images/telephone.png")} style={styles.icon} />
        <Text style={styles.title}>Verify your number</Text>
        <Text style={styles.subtitle}>Enter the 6-digit code sent to your phone number</Text>
        <View style={styles.divider} />

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

        <TouchableOpacity style={styles.button} onPress={verify}>
          <Text style={styles.buttonText}>Verify OTP</Text>
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
            <TouchableOpacity onPress={resend}>
              <Text style={styles.resendText}>Resend Code</Text>
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
