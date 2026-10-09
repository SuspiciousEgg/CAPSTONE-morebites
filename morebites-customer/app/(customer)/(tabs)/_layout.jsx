import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

const ORANGE = "#F97000";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ORANGE,
        tabBarInactiveTintColor: "#8A8A8A",
        tabBarStyle: { borderTopColor: "#F0F0F0", height: 64, paddingTop: 6 },
        tabBarLabelStyle: { fontFamily: "Plus Jakarta Sans", fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Orders",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "receipt" : "receipt-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
