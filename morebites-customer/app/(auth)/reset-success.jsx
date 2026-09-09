import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const FONT = "Plus Jakarta Sans";

export default function ResetSuccessScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Ionicons name="checkmark-circle" size={100} color="#22C55E" />
        <Text style={styles.title}>Your password has been Reset!</Text>
        <Text style={styles.subtitle}>You can now log in with your new password</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace("/(auth)/login")}>
          <Text style={styles.buttonText}>Back to Login</Text>
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
  },
  content: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  title: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 30,
    fontWeight: "700",
    marginTop: 24,
    textAlign: "center",
  },
  subtitle: {
    color: "#8F8F8F",
    fontFamily: FONT,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
    textAlign: "center",
  },
  button: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "#F97000",
    borderRadius: 9,
    height: 54,
    justifyContent: "center",
    marginTop: 40,
  },
  buttonText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "700",
  },
});
