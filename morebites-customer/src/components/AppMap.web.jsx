import { View } from "react-native";

/** Web: OSM embed when live destination/rider coords exist. */
export function MapView({ style, children, destination, rider, ..._props }) {
  const dest = destination || rider;
  if (!dest?.latitude || !dest?.longitude) {
    return <View style={[{ backgroundColor: "#E5E7EB" }, style]}>{children}</View>;
  }

  const lat = Number(dest.latitude);
  const lng = Number(dest.longitude);
  const markerLat = Number(rider?.latitude ?? lat);
  const markerLng = Number(rider?.longitude ?? lng);
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.02}%2C${lat - 0.015}%2C${lng + 0.02}%2C${lat + 0.015}&layer=mapnik&marker=${markerLat}%2C${markerLng}`;

  return (
    <View style={[{ backgroundColor: "#E5E7EB", overflow: "hidden" }, style]}>
      <iframe title="Order map" src={src} style={{ borderWidth: 0, height: "100%", width: "100%" }} />
      {children}
    </View>
  );
}

export function Marker() {
  return null;
}

export function Polyline() {
  return null;
}

export default MapView;
