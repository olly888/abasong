"""Render public gate-candidate QA diagram; no network, GPS or activation.
SVG uses only Python stdlib. Optional PNG uses an existing local Pillow install.
Usage: python3 scripts/d1/render-entrance-review.py OUTPUT_DIRECTORY
"""
from pathlib import Path
import html, json, math, sys

out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
property_feature = json.loads(Path('data/public-apartments/la-expansion.geojson').read_text())['features'][1]
gates = json.loads(Path('data/public-apartments/woodside-entrance-candidates.geojson').read_text())['features']
assert all(g['properties']['status'] == 'candidate' and g['properties']['field_verified'] is False for g in gates)
area = property_feature['properties']['property_area']['coordinates'][0][0]
origin = area[0]
def metres(p):
    return ((p[0]-origin[0])*111320*math.cos(math.radians(origin[1])), (p[1]-origin[1])*111320)
coords = [metres(p) for p in area]
xs, ys = zip(*coords); scale = min(790/(max(xs)-min(xs)), 690/(max(ys)-min(ys)))
def project(p):
    x,y=metres(p)
    return (65+(x-min(xs))*scale, 200+(max(ys)-y)*scale)
svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1050" viewBox="0 0 1400 1050">']
try:
    from PIL import Image, ImageDraw, ImageFont
    image=Image.new('RGB',(1400,1050),'#F4F6F8'); draw=ImageDraw.Draw(image)
except ImportError:
    image=draw=None

def rect(x,y,w,h,fill):
    svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{fill}"/>')
    if draw:draw.rounded_rectangle((x,y,x+w,y+h),12,fill=fill)
def text(x,y,value,size=20,fill='#15212C',bold=False):
    svg.append(f'<text x="{x}" y="{y}" font-family="Arial,sans-serif" font-size="{size}" font-weight="{700 if bold else 400}" fill="{fill}">{html.escape(value)}</text>')
    if draw:
        font_path=Path('/System/Library/Fonts/Helvetica.ttc')
        font=ImageFont.truetype(str(font_path),size,index=1 if bold else 0) if font_path.exists() else ImageFont.load_default(size=size)
        draw.text((x,y),value,font=font,fill=fill,anchor='ls')
def line(points,fill,width=2):
    svg.append(f'<polyline points="{" ".join(f"{x:.2f},{y:.2f}" for x,y in points)}" fill="none" stroke="{fill}" stroke-width="{width}"/>')
    if draw:draw.line(points,fill=fill,width=width)
def polygon(points,fill,stroke=None):
    svg.append(f'<polygon points="{" ".join(f"{x:.2f},{y:.2f}" for x,y in points)}" fill="{fill}"'+(f' stroke="{stroke}" stroke-width="2"' if stroke else '')+'/>')
    if draw:draw.polygon(points,fill=fill,outline=stroke)

rect(0,0,1400,1050,'#F4F6F8')
text(55,62,'WOODSIDE VILLAGE',30,bold=True)
text(55,100,'2547 Temple Ave, West Covina, CA 91792',23)
text(55,139,'Entrance candidate review  /  NOT an arrival geofence or a live map',20,'#7C4B13')
rect(30,168,895,790,'#FFFFFF')
polygon([project(p) for p in area], '#EDF3F5', '#8EADB8')
for poly in property_feature['geometry']['coordinates']:
    polygon([project(p) for p in poly[0]], '#C9D0D5', '#B4BEC5')
    for hole in poly[1:]:polygon([project(p) for p in hole], '#EDF3F5')
for g in gates:
    x,y=project(g['geometry']['coordinates']); label=g['properties']['sample_id'].split('-')[-1]
    polygon([(x,y-12),(x+12,y),(x,y+12),(x-12,y)], '#D97706','#FFFFFF')
    rect(x+20,y-23,64,41,'#FFF4DE'); text(x+31,y+5,label,25,'#9A5104',True)
# Approximate geometric scale for this diagram, unrelated to the product map zoom.
x,y=80,920
line([(x,y),(x+50*scale,y)],'#233441',4); text(x,y-12,'50 m',16)
line([(865,246),(865,199)],'#233441',3); text(856,191,'N',20,bold=True)
text(960,213,'WHAT THE MAP CONFIRMS',19,bold=True)
text(960,250,'G1  OSM node 6117285531 / v2',17)
text(960,280,'G2  OSM node 6117285532 / v2',17)
text(960,320,'Both tagged barrier=gate.',18)
text(960,351,'Connected service ways: v3.',18)
text(960,382,'Shared internal way: access=private.',17)
text(960,438,'STILL TO CHECK ON SITE',19,bold=True)
for i,t in enumerate(['Does each point identify the right gate?', 'Pedestrian or vehicle entrance?', 'Does it serve this apartment address?', 'Where can a driver stop outside?', 'Could a nearby property be confused?']):
    text(960,477+i*35,t,17)
text(960,713,'LEGEND',19,bold=True)
rect(960,735,20,20,'#C9D0D5');text(992,752,'Apartment building footprints',17)
rect(960,775,20,20,'#EDF3F5');text(992,792,'Public property-area sample',17)
polygon([(970,815),(980,825),(970,835),(960,825)],'#D97706');text(992,832,'Gate candidate (not verified)',17)
text(55,995,'Gate objects checked: 2026-11-01  |  Building/property snapshot: 2026-10-30',17,'#53616D')
text(55,1025,'© OpenStreetMap contributors · ODbL 1.0  |  No driver position, access code or inferred individual building number.',17,'#53616D')
svg.append('</svg>');(out/'woodside-entrance-review.svg').write_text('\n'.join(svg))
if image:image.save(out/'woodside-entrance-review.png')
print('Rendered two public candidates; no arrival area or account change; PNG:',bool(image))
