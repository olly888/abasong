package expo.modules.abasongocr

import android.graphics.BitmapFactory
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class AbasongOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AbasongOcr")
    Constant("addressCameraVersion") { 1 }
    Constant("carrierScreenshotVersion") { 1 }
    AsyncFunction("recognize") { uri: String, carrier: Boolean?, promise: Promise ->
      val context = appContext.reactContext
      var recognizer: com.google.mlkit.vision.text.TextRecognizer? = null
      try {
        require(context != null)
        val parsed = Uri.parse(uri)
        require(parsed.scheme == "file")
        val file = File(parsed.path ?: "").canonicalFile
        require(file.path.startsWith(context.cacheDir.canonicalPath + File.separator))
        require(file.isFile && file.length() <= 10 * 1024 * 1024)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.path, bounds)
        require(bounds.outWidth > 0 && bounds.outHeight > 0 &&
          bounds.outWidth.toLong() * bounds.outHeight <= 24_000_000)
        val image = InputImage.fromFilePath(context, parsed)
        val client = if (carrier == true) {
          TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
        } else {
          TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        }
        recognizer = client
        client.process(image).addOnSuccessListener { result ->
          val rotated = image.rotationDegrees == 90 || image.rotationDegrees == 270
          val uprightWidth = if (rotated) image.height else image.width
          val uprightHeight = if (rotated) image.width else image.height
          val rows = result.textBlocks.flatMap { it.lines }.take(600).mapNotNull { line ->
            val box = line.boundingBox ?: return@mapNotNull null
            mapOf("text" to line.text.take(500), "confidence" to (line.confidence ?: 0f).toDouble(),
              "x" to box.left.toDouble() / uprightWidth, "y" to box.top.toDouble() / uprightHeight,
              "width" to box.width().toDouble() / uprightWidth, "height" to box.height().toDouble() / uprightHeight)
          }
          client.close()
          promise.resolve(rows)
        }.addOnFailureListener {
          client.close()
          promise.reject("OCR_FAILED", "识别失败，请重试", null)
        }
      } catch (_: Exception) {
        recognizer?.close()
        promise.reject("INVALID_IMAGE", "无法读取所选图片", null)
      }
    }
  }
}
