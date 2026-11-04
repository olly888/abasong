// Offline experiment: generated TEST labels only, never accepts input photographs.
import AppKit
import Vision
import CoreImage
import Foundation

struct Line: Decodable { let text: String; let x: Double; let y: Double }
struct Sample: Decodable { let id: String; let font: Double; let blur: Double; let lines: [Line] }
struct Fixture: Decodable { let synthetic_only: Bool; let samples: [Sample] }
let input = URL(fileURLWithPath: "scripts/ocr/fixtures/label-address-synthetic.json")
let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: input))
precondition(fixture.synthetic_only)
let output = URL(fileURLWithPath: ".tooling/label-address-lab", isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
var results: [[String: Any]] = []
for sample in fixture.samples {
    let width = 1200, height = 1600
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)!
    NSColor.white.setFill()
    NSRect(x: 0, y: 0, width: width, height: height).fill()
    ("SYNTHETIC TEST LABEL - NOT A REAL DELIVERY" as NSString).draw(
        at: NSPoint(x: 50, y: 1530), withAttributes: [.font: NSFont.systemFont(ofSize: 20), .foregroundColor: NSColor.gray])
    for line in sample.lines {
        (line.text as NSString).draw(at: NSPoint(x: line.x * Double(width), y: (1-line.y)*Double(height)-sample.font),
            withAttributes: [.font: NSFont.monospacedSystemFont(ofSize: sample.font, weight: .regular), .foregroundColor: NSColor.black])
    }
    NSGraphicsContext.restoreGraphicsState()
    var image = rep.cgImage!
    if sample.blur > 0 {
        let source = CIImage(cgImage: image)
        image = CIContext().createCGImage(source.clampedToExtent().applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: sample.blur]).cropped(to: source.extent), from: source.extent)!
    }
    try NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])!.write(to: output.appendingPathComponent(sample.id+".png"))
    let started = Date()
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["en-US"]
    request.usesLanguageCorrection = false
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
    let lines: [[String: Any]] = (request.results ?? []).compactMap { r in
        guard let top = r.topCandidates(1).first else { return nil }
        return ["text": top.string, "x": r.boundingBox.minX, "y": 1-r.boundingBox.maxY,
            "width": r.boundingBox.width, "height": r.boundingBox.height, "confidence": top.confidence]
    }
    results.append(["id": sample.id, "milliseconds": Int(Date().timeIntervalSince(started)*1000), "lines": lines])
}
try JSONSerialization.data(withJSONObject: results, options: [.prettyPrinted, .sortedKeys]).write(to: output.appendingPathComponent("ocr.json"))
print("Recognized \(results.count) generated TEST labels offline; raw OCR remains in ignored lab directory.")
