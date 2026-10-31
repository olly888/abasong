package expo.modules.abasonglocation

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.CancellationSignal
import android.os.Handler
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import android.os.Looper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Foreground, one fix only. Never logs or persists location; no GMS dependency.
class AbasongLocationModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private class Pending(val id: String, val promise: Promise, val signal: CancellationSignal, val timeout: Runnable)
  private var pending: Pending? = null
  private var background = false

  private fun finish(id: String, location: Location? = null, code: String = "LOCATION_UNAVAILABLE") {
    val current = pending ?: return
    if (current.id != id) return
    pending = null
    main.removeCallbacks(current.timeout)
    current.signal.cancel()
    if (location == null) {
      current.promise.reject(code, "暂时无法获取位置", null)
      return
    }
    current.promise.resolve(mapOf(
      "coords" to mapOf("latitude" to location.latitude, "longitude" to location.longitude,
        "accuracy" to if (location.hasAccuracy()) location.accuracy.toDouble() else null),
      "timestamp" to location.time.toDouble()
    ))
  }

  override fun definition() = ModuleDefinition {
    Name("AbasongLocation")
    AsyncFunction("getPosition") { id: String, promise: Promise ->
      main.post {
        pending?.let { finish(it.id, code = "LOCATION_CANCELLED") }
        val context = appContext.reactContext
        if (background || context == null || appContext.currentActivity == null || id.length !in 1..128) {
          promise.reject("LOCATION_UNAVAILABLE", "暂时无法获取位置", null)
        } else {
          val fine = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
          if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            promise.reject("LOCATION_PERMISSION", "请开启位置权限", null)
          } else {
            val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val provider = when {
              fine && manager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
              manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
              else -> null
            }
            if (provider == null) {
              promise.reject("LOCATION_UNAVAILABLE", "暂时无法获取位置", null)
            } else {
              val signal = CancellationSignal()
              val timeout = Runnable { finish(id, code = "LOCATION_TIMEOUT") }
              pending = Pending(id, promise, signal, timeout)
              main.postDelayed(timeout, 15_000)
              try {
                LocationManagerCompat.getCurrentLocation(manager, provider, signal, ContextCompat.getMainExecutor(context)) { location -> finish(id, location) }
              } catch (_: Exception) { finish(id) }
            }
          }
        }
      }
    }
    AsyncFunction("cancel") { id: String ->
      main.post { finish(id, code = "LOCATION_CANCELLED") }
    }
    OnActivityEntersForeground { main.post { background = false } }
    OnActivityEntersBackground { main.post { background = true; pending?.let { finish(it.id, code = "LOCATION_CANCELLED") } } }
    OnDestroy { main.post { pending?.let { finish(it.id, code = "LOCATION_CANCELLED") } } }
  }
}
