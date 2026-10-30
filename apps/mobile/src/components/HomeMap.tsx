import Mapbox from '@rnmapbox/maps';
import { Text, StyleSheet } from 'react-native';
const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN?.trim();
if (token) Mapbox.setAccessToken(token);
export default function HomeMap() {
  if (!token) return <Text style={{ color:'#53565B' }}>地图暂不可用</Text>;
  return <Mapbox.MapView style={StyleSheet.absoluteFill} styleURL={Mapbox.StyleURL.Street}>
    <Mapbox.Camera defaultSettings={{ centerCoordinate:[-118.2437,34.0522],zoomLevel:12 }} />
  </Mapbox.MapView>;
}
