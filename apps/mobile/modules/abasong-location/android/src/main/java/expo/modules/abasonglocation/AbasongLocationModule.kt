package expo.modules.abasonglocation

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.os.Bundle
import android.location.LocationManager
import android.os.CancellationSignal
import android.os.Handler
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import android.os.Looper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Foreground single-fix and continuous observation. Never logs or persists location; no GMS dependency.
class AbasongLocationModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private class Pending(val id: String, val promise: Promise, val signal: CancellationSignal, val timeout: Runnable)
  private var pending: Pending? = null
  private var background = false
  private var watchId: String? = null
  private var watchManager: LocationManager? = null
  private var watchListener: LocationListener? = null
  private fun stopWatch(id: String? = null) {
    if (id != null && watchId != id) return
    watchListener?.let { listener -> try { watchManager?.removeUpdates(listener) } catch (_: Exception) {} }
    watchId = null; watchManager = null; watchListener = null
  }
  private fun fix(location: Location) = mapOf(
    "coords" to mapOf("latitude" to location.latitude, "longitude" to location.longitude,
      "accuracy" to if (location.hasAccuracy()) location.accuracy.toDouble() else null),
    "timestamp" to location.time.toDouble())


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
    Events("position")
    AsyncFunction("startWatch") { id: String, promise: Promise ->
      main.post {
        stopWatch()
        val context = appContext.reactContext
        if (background || context == null || appContext.currentActivity == null || id.length !in 1..128) {
          promise.reject("LOCATION_UNAVAILABLE", "暂时无法获取位置", null)
        } else {
          val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
          val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
          if (!fine && !coarse) promise.reject("LOCATION_PERMISSION", "请开启位置权限", null)
          else {
            val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val provider = when {
              fine && manager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
              manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
              else -> null
            }
            if (provider == null) promise.reject("LOCATION_UNAVAILABLE", "请开启系统定位服务", null)
            else {
              val listener = object : LocationListener {
                override fun onLocationChanged(location: Location) {
                  if (!background && watchId == id) sendEvent("position", mapOf("id" to id, "fix" to fix(location)))
                }
                override fun onProviderDisabled(provider: String) {
                  if (watchId == id) sendEvent("position", mapOf("id" to id, "error" to "services_off"))
                }
                override fun onProviderEnabled(provider: String) {}
                @Deprecated("Legacy callback")
                override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
              }
              watchId = id; watchManager = manager; watchListener = listener
              try {
                manager.requestLocationUpdates(provider, 2000L, 0f, listener, Looper.getMainLooper())
                promise.resolve(null)
              } catch (_: Exception) { stopWatch(id); promise.reject("LOCATION_UNAVAILABLE", "暂时无法获取位置", null) }
            }
          }
        }
      }
    }
    AsyncFunction("stopWatch") { id: String -> main.post { stopWatch(id) } }

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
    OnActivityEntersBackground { main.post { background = true; stopWatch(); pending?.let { finish(it.id, code = "LOCATION_CANCELLED") } } }
    OnDestroy { main.post { stopWatch(); pending?.let { finish(it.id, code = "LOCATION_CANCELLED") } } }
  }
}
