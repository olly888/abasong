import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { StaticMap } from './StaticMap';

export function PreviewMap({ token }: { token?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading'|'ready'|'error'>('loading');
  const [revision, setRevision] = useState(0);
  const [fallback,setFallback] = useState(false);
  useEffect(() => {
    if (!token || !container.current || fallback) return;
    if (!mapboxgl.supported()) { setFallback(true); return; }
    let map: mapboxgl.Map | undefined;
    let disposed = false;
    setStatus('loading');
    try {
      map = new mapboxgl.Map({
        container: container.current, accessToken: token,
        style: 'mapbox://styles/mapbox/streets-v12', center: [-118.2437,34.0522], zoom: 12,
      });
      map.on('load', () => { if (!disposed) setStatus('ready'); });
      map.on('error', () => { if (!disposed) setStatus('error'); });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    } catch { setFallback(true); }
    return () => { disposed = true; map?.remove(); };
  },[token,revision,fallback]);
  if (fallback && token) return <StaticMap token={token} />;
  const message = !token ? '地图暂不可用' : status === 'error' ? '地图加载失败' : '正在加载地图…';
  return <div style={{ width:'100%',height:'100%',position:'relative',background:'#F6F6F6' }}>
    <div ref={container} style={{position:'absolute',inset:0}} aria-label="洛杉矶地图" />
    {(!token || status !== 'ready') && <div role="status" style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',gap:12,background:'#F6F6F6',color:'#53565B',fontSize:14 }}>
      <span>{message}</span>{token && status === 'error' && <button onClick={()=>setRevision(value=>value+1)}>重试</button>}
    </div>}
  </div>;
}
