import MapView, { Marker, Polyline, UrlTile } from "react-native-maps";

export function AppNativeMap({ style, initialRegion, region, children, ...props }) {
  return (
    <MapView
      style={style}
      initialRegion={initialRegion}
      region={region}
      rotateEnabled={false}
      {...props}
    >
      {children}
    </MapView>
  );
}

export { Marker, Polyline, UrlTile };
export default AppNativeMap;
