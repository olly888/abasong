package expo.modules.abasongocr

import android.graphics.BitmapFactory
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class AbasongOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AbasongOcr")
    AsyncFunction("recognize") { uri: String, promise: Promise ->
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
        val client = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        recognizer = client
        client.process(image).addOnSuccessListener { result ->
          val rows = result.textBlocks.flatMap { it.lines }.take(600).mapNotNull { line ->
            val box = line.boundingBox ?: return@mapNotNull null
            mapOf("text" to line.text.take(500), "confidence" to (line.confidence ?: 0f).toDouble(),
              "x" to box.left.toDouble() / image.width, "y" to box.top.toDouble() / image.height,
              "width" to box.width().toDouble() / image.width, "height" to box.height().toDouble() / image.height)
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
