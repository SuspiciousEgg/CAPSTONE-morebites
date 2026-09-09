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

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [focused, setFocused] = useState("");
  const [errors, setErrors] = useState({});

  const submit = () => {
    const next = {};
    if (!password) next.password = "Password is required";
    if (!confirm) next.confirm = "Please confirm your password";
    else if (password !== confirm) next.confirm = "Passwords do not match";

    setErrors(next);
    if (!Object.keys(next).length) router.push("/(auth)/reset-success");
  };

  const field = (name, value, setValue, show, setShow, placeholder) => (
    <>
      <Text style={styles.label}>
        {name === "password" ? "NEW PASSWORD" : "CONFIRM NEW PASSWORD"}
      </Text>
      <View style={[styles.inputWrap, focused === name && styles.focusedInput, errors[name] && styles.errorInput]}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={setValue}
          secureTextEntry={!show}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          onFocus={() => setFocused(name)}
          onBlur={() => setFocused("")}
        />
        <TouchableOpacity onPress={() => setShow(!show)}>
          <Ionicons name={show ? "eye-outline" : "eye-off-outline"} size={20} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
      {errors[name] ? (
        <View style={styles.errorRow}>
          <Ionicons name="warning-outline" size={14} color="#D94343" />
          <Text style={styles.errorText}>{errors[name]}</Text>
        </View>
      ) : null}
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Image source={require("../../assets/images/refresh.png")} style={styles.icon} />
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.subtitle}>Enter your new password below</Text>
        <View style={styles.divider} />

        {field("password", password, setPassword, visible, setVisible, "Enter new password")}
        {field("confirm", confirm, setConfirm, confirmVisible, setConfirmVisible, "Enter new password")}

        <TouchableOpacity style={styles.primary} onPress={submit}>
          <Text style={styles.primaryText}>Reset Password</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancel} onPress={() => router.replace("/(auth)/login")}>
          <Text style={styles.cancelText}>Cancel</Text>
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
    marginTop: 36,
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
  primary: {
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
  cancel: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#D4D4D4",
    borderRadius: 9,
    borderWidth: 1,
    height: 54,
    justifyContent: "center",
    marginTop: 12,
  },
  cancelText: {
    color: "#121212",
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
