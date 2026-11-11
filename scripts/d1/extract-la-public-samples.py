"""Build the reviewed ODbL pilot subset from bounded official OSM API XML files.
Usage: python3 scripts/d1/extract-la-public-samples.py .tooling/la-samples
No network, address guessing, resident tags, contributor identities or code data.
The SQL importer independently validates polygons and property containment.
"""
from pathlib import Path
import sys, json, xml.etree.ElementTree as E

root = Path(sys.argv[1])
features = []

def load(name):
    tree = E.parse(root / (name + '.osm')).getroot()
    nodes = {n.attrib['id']: [float(n.attrib['lon']), float(n.attrib['lat'])] for n in tree.findall('node')}
    ways = {w.attrib['id']: w for w in tree.findall('way')}
    def ring(wid):
        points = [nodes[n.attrib['ref']] for n in ways[str(wid)].findall('nd')]
        assert len(points) >= 4 and points[0] == points[-1], 'Incomplete OSM ring'
        return points
    return tree, ways, ring

def inside(p, ring):
    x,y=p; odd=False
    for a,b in zip(ring, ring[1:]):
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]: odd=not odd
    return odd

def add(slug,name,line,city,postal,url,geom,refs,kind,area=None):
    props=dict(slug=slug,name=name,address_line1=line,city=city,state='CA',postal_code=postal,
        street_number=line.split()[0],address_source=url,geometry_sources=refs,
        geometry_role=kind,verified_on='2026-10-30',association='public_source_crosscheck_not_field',
        number_scope='property_primary_address_not_individual_building_number')
    if area: props['property_area']=area
    features.append(dict(type='Feature',properties=props,geometry=geom))

def multi(rings): return dict(type='MultiPolygon',coordinates=rings)

tree,ways,ring=load('del-mar')
rel=next(r for r in tree.findall('relation') if r.attrib['id']=='6969959')
outer=[m.attrib['ref'] for m in rel.findall('member') if m.attrib['role']=='outer']
inner=[m.attrib['ref'] for m in rel.findall('member') if m.attrib['role']=='inner']
assert len(outer)==1
add('del-mar','Del Mar Apartments','2445 E Del Mar Blvd','Pasadena','91107','https://www.delmarpasadena.com/',
    multi([[ring(outer[0])]+[ring(i) for i in inner]]),['https://www.openstreetmap.org/relation/6969959'],'building_footprints')

for file,way,slug,name,line,city,postal,url in [
 ('woodside','634522936','woodside-village','Woodside Village','2547 Temple Ave','West Covina','91792','https://www.woodsidevillageapartmenthomes.com/contactus'),
 ('colony','463986253','colony-at-the-lakes','Colony at The Lakes','301 S Glendora Ave','West Covina','91790','https://www.colonyatthelakes.com/'),
 ('park-la-brea','550767339','park-la-brea','Park La Brea','6200 W 3rd St','Los Angeles','90036','https://www.parklabrea.com/')]:
    tree,ways,ring=load(file); area=ring(way); ids=[]
    # Only the named Woodside property's explicitly apartment-tagged footprints
    # enter automatic-match geometry. No inferred newer Colony footprint or
    # shared community-wide code/number is assigned to Park La Brea towers.
    if slug=='woodside-village':
        for wid,w in ways.items():
            tags={t.attrib['k']:t.attrib['v'] for t in w.findall('tag')}
            if tags.get('building')=='apartments' and all(inside(p,area) for p in ring(wid)[:-1]): ids.append(wid)
    geom=multi([[ring(i)] for i in ids]) if ids else multi([[area]])
    refs=['https://www.openstreetmap.org/way/'+i for i in [way]+ids]
    add(slug,name,line,city,postal,url,geom,refs,'building_footprints' if ids else 'address_only_area',multi([[area]]) if ids else None)
    if file=='park-la-brea':
        tags={t.attrib['k']:t.attrib['v'] for t in ways['423469209'].findall('tag')}
        assert tags['addr:housenumber']=='435' and tags['addr:street']=='South Curson Avenue'
        add('park-la-brea-tower-48','Park La Brea · Tower 48','435 S Curson Ave','Los Angeles','90036',url,
            multi([[ring('423469209')]]),['https://www.openstreetmap.org/way/423469209','https://www.openstreetmap.org/way/550767339'],'building_footprints',multi([[area]]))

out=dict(type='FeatureCollection',license='https://opendatacommons.org/licenses/odbl/1-0/',attribution='© OpenStreetMap contributors',features=features)
Path('data/public-apartments/la-expansion.geojson').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print('Prepared',len(features),'public properties;',[(f['properties']['slug'],len(f['geometry']['coordinates']),f['properties']['geometry_role']) for f in features])
