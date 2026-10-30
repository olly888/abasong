// Offline synthetic OCR experiment. No carrier screenshot, real address or credential input.
import AppKit
import Vision
import Foundation
struct Expected:Codable{let address:String?;let code:String;let status:String}
struct Sample:Codable{let id:String;let lines:[String];let expected:[Expected];let font:Double}
let output=URL(fileURLWithPath:CommandLine.arguments[1],isDirectory:true)
try FileManager.default.createDirectory(at:output,withIntermediateDirectories:true)
let address1="100 Example Ave",address2="200 Sample Road"
let code1=String(format:"0%03d#",137),code2="*"+String(format:"0%03d",284)+"#"
let samples:[Sample]=[
 Sample(id:"leading-zero",lines:[address1,"Test City, CA 90000","Gate code: "+code1],expected:[Expected(address:address1,code:code1,status:"candidate")],font:32),
 Sample(id:"symbols",lines:[address1,"Entry code: "+code2],expected:[Expected(address:address1,code:code2,status:"candidate")],font:32),
 Sample(id:"two-pairs",lines:[address1,"Gate code: "+code1,"",address2,"Access code: "+code2],expected:[Expected(address:address1,code:code1,status:"candidate"),Expected(address:address2,code:code2,status:"candidate")],font:30),
 Sample(id:"distractors",lines:[address1,"Test City, CA 90000","Stop: 24","Unit #203","Phone: 855-555-0100","Wi-Fi password: NOT-A-GATE"],expected:[],font:30),
 Sample(id:"no-address",lines:["Delivery notes","Gate code: "+code1],expected:[Expected(address:nil,code:code1,status:"missing_address")],font:32),
 Sample(id:"ambiguous-pair",lines:[address1,address2,"Gate code: "+code1],expected:[Expected(address:nil,code:code1,status:"ambiguous")],font:32),
 Sample(id:"letter-case",lines:[address1,"Gate code: aB0x#"],expected:[Expected(address:address1,code:"aB0x#",status:"candidate")],font:32),
 Sample(id:"small-text",lines:[address1,"Gate code: "+code2],expected:[Expected(address:address1,code:code2,status:"candidate")],font:13)
]
var results:[[String:Any]]=[]
for sample in samples{
 let width=960,height=1280
 let rep=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:width,pixelsHigh:height,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
 let context=NSGraphicsContext(bitmapImageRep:rep)!
 NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=context
 NSColor.white.setFill();NSRect(x:0,y:0,width:width,height:height).fill()
 let heading:[NSAttributedString.Key:Any]=[.font:NSFont.boldSystemFont(ofSize:24),.foregroundColor:NSColor.systemBlue]
 ("SYNTHETIC TEST - NOT A REAL DELIVERY" as NSString).draw(at:NSPoint(x:40,y:1200),withAttributes:heading)
 let attrs:[NSAttributedString.Key:Any]=[.font:NSFont.monospacedSystemFont(ofSize:sample.font,weight:.regular),.foregroundColor:NSColor.black]
 for (index,line) in sample.lines.enumerated(){(line as NSString).draw(at:NSPoint(x:48,y:1100-index*90),withAttributes:attrs)}
 NSGraphicsContext.restoreGraphicsState()
 let image=rep.cgImage!,data=rep.representation(using:.png,properties:[:])!
 try data.write(to:output.appendingPathComponent(sample.id+".png"))
 let started=Date()
 let request=VNRecognizeTextRequest();request.recognitionLevel = .accurate;request.usesLanguageCorrection=false;request.recognitionLanguages=["en-US"]
 try VNImageRequestHandler(cgImage:image,options:[:]).perform([request])
 let observations=(request.results ?? []).compactMap{r->[String:Any]? in guard let text=r.topCandidates(1).first else{return nil};return ["text":text.string,"top":Double(1-r.boundingBox.maxY),"left":Double(r.boundingBox.minX),"confidence":text.confidence]}.sorted{($0["top"] as! Double)<($1["top"] as! Double)}
 results.append(["id":sample.id,"milliseconds":Int(Date().timeIntervalSince(started)*1000),"lines":observations])
}
try JSONEncoder().encode(samples).write(to:output.appendingPathComponent("truth.json"))
try JSONSerialization.data(withJSONObject:results,options:[.prettyPrinted,.sortedKeys]).write(to:output.appendingPathComponent("ocr.json"))
print("PASS: generated and recognized \(samples.count) synthetic images offline; raw text stays in ignored lab directory")
