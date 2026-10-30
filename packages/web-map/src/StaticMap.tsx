import { useEffect, useRef, useState } from 'react';
/** Real Mapbox Static Images fallback for preview browsers without WebGL. Not native-map acceptance. */
export function StaticMap({ token }: { token:string }) {
  const container = useRef<HTMLDivElement>(null);
  const [size,setSize] = useState({ width:480,height:480 });
  const [zoom,setZoom] = useState(12);
  const [failed,setFailed] = useState(false);
  useEffect(()=>{
    if (!container.current) return;
    const observer = new ResizeObserver(([entry])=>{
      if (!entry) return;
      setSize({ width:Math.max(1,Math.min(1280,Math.round(entry.contentRect.width))),height:Math.max(1,Math.min(1280,Math.round(entry.contentRect.height))) });
    });
    observer.observe(container.current);
    return ()=>observer.disconnect();
  },[]);
  const url = new URL(`https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/-118.2437,34.0522,${zoom},0/${size.width}x${size.height}@2x`);
  url.searchParams.set('access_token',token);
  return <div ref={container} style={{ position:'relative',width:'100%',height:'100%',background:'#F6F6F6' }}>
    {!failed ? <img src={url.href} alt="洛杉矶地图" onError={()=>setFailed(true)} style={{ width:'100%',height:'100%',objectFit:'contain' }} /> : <div role="status" style={{ padding:24 }}>地图暂不可用</div>}
    <div style={{ position:'absolute',right:12,top:12,display:'flex',flexDirection:'column',gap:4 }}>
      <button aria-label="放大地图" onClick={()=>setZoom(value=>Math.min(18,value+1))} style={button}>＋</button>
      <button aria-label="缩小地图" onClick={()=>setZoom(value=>Math.max(3,value-1))} style={button}>−</button>
    </div>
  </div>;
}
const button = { width:40,height:40,fontSize:22,border:'1px solid #E3E4E6',borderRadius:8,background:'#FFFFFF',cursor:'pointer' } as const;
