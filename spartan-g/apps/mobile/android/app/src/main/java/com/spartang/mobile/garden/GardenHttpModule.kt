package com.spartang.mobile.garden

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

internal class GardenHttpModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private var client: GardenHttpClient? = null
  private var destroyed = false
  override fun getName() = "SpartanGardenHttp"

  @ReactMethod
  fun getConfiguration(promise: Promise) {
    val origin = GardenHttpSettings.configuredOrigin()
    promise.resolve(Arguments.createMap().apply {
      putInt("version", 1); putBoolean("enabled", !destroyed && origin != null)
      if (origin == null) putNull("origin") else putString("origin", origin)
    })
  }

  @ReactMethod
  fun request(key: String, action: String, operationId: String, token: String, timeoutMs: Double, promise: Promise) {
    try {
      val origin = GardenHttpSettings.configuredOrigin() ?: throw GardenHttpFailure("configuration_disabled")
      if (!timeoutMs.isFinite() || timeoutMs != timeoutMs.toLong().toDouble()) throw GardenHttpFailure("invalid_timeout")
      val engine = synchronized(this) {
        if (destroyed) throw GardenHttpFailure("transport_closed", true)
        client ?: GardenHttpClient(origin).also { client = it }
      }
      engine.request(key, action, operationId, token, timeoutMs.toLong()) { reply, failure ->
        if (failure != null) reject(promise, failure)
        else if (reply != null) promise.resolve(Arguments.createMap().apply {
          putInt("status", reply.status); putString("body", reply.body); putInt("retryAfterSeconds", reply.retryAfterSeconds)
        })
      }
    } catch (failure: GardenHttpFailure) { reject(promise, failure) }
    catch (_: Exception) { reject(promise, GardenHttpFailure("outcome_unknown", true, true)) }
  }

  @ReactMethod
  fun cancel(key: String, promise: Promise) {
    promise.resolve(synchronized(this) { client?.cancel(key) ?: false })
  }

  override fun invalidate() {
    synchronized(this) { destroyed = true; client?.close(); client = null }
    super.invalidate()
  }

  private fun reject(promise: Promise, failure: GardenHttpFailure) {
    // Never pass the originating Throwable, URL, body or token to React Native error serialization.
    promise.reject("E_GARDEN_TRANSPORT", "Garden request could not be confirmed.", Arguments.createMap().apply {
      putString("reason", failure.reason); putBoolean("retryable", failure.retryable)
      putBoolean("outcomeUnknown", failure.outcomeUnknown)
    })
  }
}
