import { StyleSheet, Text, View } from "react-native";

/** Web map: OpenStreetMap embed when live coords exist. */
export default function DeliveryMap({ destinationCoord, riderCoord }) {
  const dest = destinationCoord || riderCoord;
  if (!dest?.latitude || !dest?.longitude) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.empty}>Waiting for live coordinates…</Text>
      </View>
    );
  }

  const lat = Number(dest.latitude);
  const lng = Number(dest.longitude);
  const marker = riderCoord || dest;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.02}%2C${lat - 0.015}%2C${lng + 0.02}%2C${lat + 0.015}&layer=mapnik&marker=${marker.latitude}%2C${marker.longitude}`;

  return (
    <View style={styles.wrap}>
      <iframe title="Delivery map" src={src} style={styles.iframe} />
      <Text style={styles.caption}>Live delivery map</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#E5E7EB",
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iframe: {
    borderWidth: 0,
    height: "100%",
    width: "100%",
  },
  caption: {
    backgroundColor: "rgba(255,255,255,0.9)",
    bottom: 8,
    color: "#4B5563",
    fontSize: 11,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: "absolute",
  },
  empty: {
    color: "#6B7280",
    fontSize: 13,
    paddingHorizontal: 16,
    textAlign: "center",
  },
});
