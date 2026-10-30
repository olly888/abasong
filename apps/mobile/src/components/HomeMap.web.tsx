import { PreviewMap } from '@abasong/web-map';
export default function HomeMap() { return <PreviewMap token={process.env.EXPO_PUBLIC_MAPBOX_TOKEN?.trim()} />; }
