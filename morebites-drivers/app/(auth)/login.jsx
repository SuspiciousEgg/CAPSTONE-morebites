import { useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
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
import { authStorage, driverApi } from "../../src/api/client";
import {
  getDeviceId,
  isDeviceTrusted,
  addTrustedDevice,
  normalizePhoneNumber,
} from "../../src/utils/device";

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
    const cleanPhone = phoneValue.replace(/\s/g, "");
    const hasPhone = cleanPhone.length > 0;
    const hasPassword = passwordValue.trim().length > 0;

    let hasError = false;
    if (!hasPhone) {
      setPhoneError("Phone number is required");
      hasError = true;
    } else if (!/^09\d{9}$/.test(cleanPhone)) {
      setPhoneError("Enter a valid 11-digit Philippine mobile number starting with 09");
      hasError = true;
    } else {
      setPhoneError("");
    }

    if (!hasPassword) {
      setPasswordError("Password is required");
      hasError = true;
    } else {
      setPasswordError("");
    }

    if (hasError) {
      return;
    }

    setSaving(true);
    setLoginError("");
    setPhoneError("");
    setPasswordError("");

    try {
      const deviceId = await getDeviceId();
      const res = await driverApi.login(phoneValue.trim(), passwordValue, deviceId);

      let userObj = res.user || {};
      if (!userObj.photo && userObj.phone) {
        const cachedRaw = await AsyncStorage.getItem("cached_user_photos");
        const cachedMap = cachedRaw ? JSON.parse(cachedRaw) : {};
        if (cachedMap[userObj.phone]) {
          userObj = { ...userObj, photo: cachedMap[userObj.phone] };
        }
      } else if (userObj.photo && userObj.phone) {
        const cachedRaw = await AsyncStorage.getItem("cached_user_photos");
        const cachedMap = cachedRaw ? JSON.parse(cachedRaw) : {};
        cachedMap[userObj.phone] = userObj.photo;
        await AsyncStorage.setItem("cached_user_photos", JSON.stringify(cachedMap));
      }

      await authStorage.saveSession(res.token, userObj);

      const cleanPhone = normalizePhoneNumber(userObj.phone || phoneValue);
      const isTrusted = await isDeviceTrusted(cleanPhone, deviceId);

      if (!isTrusted) {
        Alert.alert(
          "New device sign-in detected. If this wasn't you, please secure your account immediately.",
          "",
          [
            {
              text: "This Was Me",
              onPress: async () => {
                await addTrustedDevice(cleanPhone, deviceId);
                router.replace("/(tabs)/home");
              },
            },
            {
              text: "This Wasn't Me",
              style: "destructive",
              onPress: async () => {
                await authStorage.clear();
                router.push({
                  pathname: "/(auth)/forgot-password",
                  params: { phone: cleanPhone },
                });
              },
            },
          ],
          { cancelable: false }
        );
      } else {
        router.replace("/(tabs)/home");
      }
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
            maxLength={11}
            placeholder="09XX XXX XXXX"
            placeholderTextColor="#9CA3AF"
            value={phoneValue}
            onChangeText={(val) => setPhoneValue(val.replace(/\D/g, "").slice(0, 11))}
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
          onPress={() =>
            router.push({
              pathname: "/(auth)/forgot-password",
              params: { phone: phoneValue.trim() },
            })
          }
          style={styles.forgotRow}
          activeOpacity={0.7}
        >
          <Text style={styles.forgotText}>Forgot Password?</Text>
        </TouchableOpacity>

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
  forgotRow: {
    alignSelf: "flex-end",
    marginTop: 12,
    marginBottom: 8,
  },
  forgotText: {
    color: "#E37925",
    fontFamily: FONT_MEDIUM,
    fontSize: 13,
  },
  signInButton: {
    height: 54,
    borderRadius: 9,
    backgroundColor: "#F97000",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
  },
  signInText: {
    color: "#FFFFFF",
    fontFamily: FONT_BOLD,
    fontSize: 24,
  },
});
