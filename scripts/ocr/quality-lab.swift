// Synthetic macOS Vision captures only. This is not an iOS/Android device run.
import AppKit
import Vision
import Foundation
import CryptoKit

struct Expected { let address: String; let value: String?; let issues: [String] }
struct Row { let text: String; let row: Int; let column: Int }
struct Sample { let id: String; let rows: [Row]; let expected: [Expected] }
func row(_ text: String, _ index: Int, _ column: Int = 0) -> Row { Row(text:text,row:index,column:column) }
func expected(_ address: String, _ value: String?, _ issues: [String] = []) -> Expected { Expected(address:address,value:value,issues:issues) }
let a="100 Example Ave",b="102 Example Ave",p="0017#",q="*00284#"
let samples=[
  Sample(id:"SYN-001",rows:[row(a,0),row("Test City, CA 90000",1),row("Gate code: "+p,2)],expected:[expected(a+", Test City, CA 90000",p)]),
  Sample(id:"SYN-002",rows:[row(a,0),row("Entry code: "+q,1)],expected:[expected(a,q)]),
  Sample(id:"SYN-003",rows:[row(a,0),row("Gate code: "+p,1),row(b,2),row("Gate code: "+q,3),row("Entry code: 0009#",4)],expected:[expected(a,p),expected(b,q),expected(b,"0009#")]),
  Sample(id:"SYN-004",rows:[row(a,0),row(b,1),row("Gate code: "+p,2)],expected:[expected("",p,["地址对应不明"])]),
  Sample(id:"SYN-005",rows:[row("Delivery notes",0),row("Gate code: "+p,1)],expected:[expected("",p,["缺少地址"])]),
  Sample(id:"SYN-006",rows:[row(a,0),row("Stop: 18",1),row("Unit #203",2),row("Phone: 855-555-0100",3),row("Wi-Fi password: TEST",4)],expected:[]),
  Sample(id:"SYN-007",rows:[row(a,0),row("Gate code: 0017?",1)],expected:[expected(a,nil,["请核对字符"])]),
  Sample(id:"SYN-008",rows:[row(a,0),row("Gate code: "+p,1),row("Entry code: "+p,2)],expected:[expected(a,p),expected(a,p)]),
  Sample(id:"SYN-009",rows:[row(a,0),row(b,0,1),row("Gate code: "+p,2),row("Entry code: "+q,2,1)],expected:[expected(a,p),expected(b,q)]),
  Sample(id:"SYN-010",rows:[row(a,0),row("Gate code: aB0x#",1)],expected:[expected(a,"aB0x#")])
]
// The ten Glendale screenshots inform the layouts only. All displayed
// addresses, unit identifiers and values below were invented for this lab.
let ga="100 TEST Orchard St", gb="102 TEST Orchard St", gc="200 TEST Sample Ave"
let locality="Example City, CA 90000", firstCode="*00148#", secondCode="#00259*"
func carrierDetail(_ number: String, _ street: String, _ unit: String, _ door: String, _ code: String) -> Sample {
  let address=street+" "+unit+", "+locality
  return Sample(id:"SYN-1"+number,rows:[
    row("地图模式",0),row(street+" "+unit,5),row(locality,6),
    row("派送引导",7),row(door+" "+code,8),row("TEST parcel reference",9)
  ],expected:[expected(address,code)])
}
func nearbyList(_ number: String, _ markers: [String]) -> Sample {
  Sample(id:"SYN-1"+number,rows:[
    row("门禁 Code",0),row(ga+" Apt 901, "+locality,1)
  ]+markers.enumerated().map{row($0.element,$0.offset+2)}+[
    row(gb+" Apt 902",6),row("社区门禁 "+firstCode,7),
    row(gc+" Unit 903",9),row("楼门门禁 "+secondCode,10),row("快递柜",12)
  ],expected:[])
}
let glendaleSamples=[
  carrierDetail("01",ga,"Apt 901","社区门禁","90000"),
  carrierDetail("02",gb,"Apt 902","楼门门禁",firstCode),
  carrierDetail("03",gc,"Unit 903","楼门门禁","0031648"),
  nearbyList("04",["附近的 Code (30)","只用于本次派送"]),
  nearbyList("05",["附近的 Co de","只 用 于 本 次 派 送"]),
  nearbyList("06",["附近的 Code (30)"]),
  nearbyList("07",["这是对的","上报新 Code"]),
  Sample(id:"SYN-108",rows:[
    row(ga+" Apt 901",1),row(locality,2),row("社区门禁 "+firstCode,3),
    row(gb+" Apt 902",6),row(locality,7),row("楼门门禁 "+secondCode,8)
  ],expected:[
    expected(ga+" Apt 901, "+locality,firstCode),
    expected(gb+" Apt 902, "+locality,secondCode)
  ]),
  nearbyList("09",["附近 的","Code (30)"]),
  nearbyList("10",["只用于本次派送。"])
]
let args=CommandLine.arguments
guard args.count==2 || (args.count==3 && args[2]=="--glendale") else { fatalError("Specify a synthetic .tooling output folder and optional --glendale") }
let glendale=args.count==3
let suite=glendale ? glendaleSamples : samples
let root=URL(fileURLWithPath:FileManager.default.currentDirectoryPath,isDirectory:true),output=URL(fileURLWithPath:CommandLine.arguments[1],isDirectory:true).standardizedFileURL
let allowed=root.appendingPathComponent(".tooling",isDirectory:true).resolvingSymlinksInPath().path+"/"
guard output.resolvingSymlinksInPath().path.hasPrefix(allowed) else { fatalError("Synthetic output must remain inside .tooling") }
try FileManager.default.createDirectory(at:output,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
guard output.resolvingSymlinksInPath().path.hasPrefix(allowed) else { fatalError("Synthetic output must remain inside .tooling") }
guard try FileManager.default.contentsOfDirectory(atPath:output.path).isEmpty else { fatalError("Use an empty synthetic output folder") }
var captures:[[String:Any]]=[]
for sample in suite {
  let width=960,height=1280
  let bitmap=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:width,pixelsHigh:height,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
  NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:bitmap)
  NSColor.white.setFill();NSRect(x:0,y:0,width:width,height:height).fill()
  ("SYNTHETIC TEST - "+sample.id as NSString).draw(at:NSPoint(x:40,y:1200),withAttributes:[.font:NSFont.boldSystemFont(ofSize:22),.foregroundColor:NSColor.systemBlue])
  let attrs:[NSAttributedString.Key:Any]=[.font:NSFont.monospacedSystemFont(ofSize:28,weight:.regular),.foregroundColor:NSColor.black]
  for line in sample.rows { (line.text as NSString).draw(at:NSPoint(x:48+line.column*500,y:1100-line.row*60),withAttributes:attrs) }
  NSGraphicsContext.restoreGraphicsState()
  let image=bitmap.cgImage!,data=bitmap.representation(using:.png,properties:[:])!,filename=sample.id+".png"
  try data.write(to:output.appendingPathComponent(filename))
  let hash=SHA256.hash(data:data).map{String(format:"%02x",$0)}.joined(),started=Date()
  let request=VNRecognizeTextRequest();request.recognitionLevel = .accurate;request.usesLanguageCorrection=false;request.recognitionLanguages=glendale ? ["zh-Hans","en-US"] : ["en-US"]
  try VNImageRequestHandler(cgImage:image,options:[:]).perform([request])
  let observations=(request.results ?? []).prefix(600).compactMap{observation -> [String:Any]? in
    guard let candidate=observation.topCandidates(1).first else{return nil}
    let box=observation.boundingBox
    return ["text":String(candidate.string.prefix(500)),"x":Double(box.minX),"y":Double(1-box.maxY),"width":Double(box.width),"height":Double(box.height),"confidence":Double(candidate.confidence)]
  }
  let truth=sample.expected.map{entry -> [String:Any] in
    var result:[String:Any] = ["address":entry.address,"issues":entry.issues]
    if let value=entry.value {result["value"]=value} else {result["value"]=NSNull()}
    return result
  }
  captures.append(["id":sample.id,"kind":"synthetic","carrier":"synthetic","image":filename,"image_sha256":hash,"authorized":true,"redacted":true,"truth_checked":true,"expected":truth,"observations":[["platform":"macos","runtime":"host","engine":"apple-vision","image_sha256":hash,"milliseconds":Int(Date().timeIntervalSince(started)*1000),"lines":observations]]])
}
let manifest=try JSONSerialization.data(withJSONObject:["version":1,"samples":captures],options:[.prettyPrinted,.sortedKeys])
try manifest.write(to:output.appendingPathComponent("manifest.json"))
print("PASS: generated \(suite.count) synthetic images and real macOS Vision captures; raw text remains in ignored output; no cloud or phone-device claim")
