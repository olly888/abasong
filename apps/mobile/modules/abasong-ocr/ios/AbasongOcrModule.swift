import ExpoModulesCore
import Vision
import ImageIO

public class AbasongOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AbasongOcr")
    AsyncFunction("recognize") { (uri: String) -> [[String: Any]] in
      // Only picker-created cache copies; no remote URL, documents or arbitrary paths.
      guard let url = URL(string: uri), url.isFileURL,
        let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first,
        url.resolvingSymlinksInPath().path.hasPrefix(cache.resolvingSymlinksInPath().path + "/"),
        let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize,
        size <= 10 * 1024 * 1024,
        let source = CGImageSourceCreateWithURL(url as CFURL, nil),
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
        let width = properties[kCGImagePropertyPixelWidth] as? NSNumber,
        let height = properties[kCGImagePropertyPixelHeight] as? NSNumber,
        width.doubleValue * height.doubleValue <= 24_000_000
      else { throw Exception(name: "INVALID_IMAGE", description: "无法读取所选图片") }
      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.recognitionLanguages = ["en-US"]
      request.usesLanguageCorrection = false
      do {
        try VNImageRequestHandler(url: url).perform([request])
        return (request.results ?? []).prefix(600).compactMap { observation in
          guard let candidate = observation.topCandidates(1).first else { return nil }
          let box = observation.boundingBox
          return ["text": String(candidate.string.prefix(500)),
                  "confidence": Double(candidate.confidence),
                  "x": Double(box.minX), "y": Double(1 - box.maxY),
                  "width": Double(box.width), "height": Double(box.height)]
        }
      } catch { throw Exception(name: "OCR_FAILED", description: "识别失败，请重试") }
    }
  }
}
