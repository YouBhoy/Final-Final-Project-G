package com.spartang.mobile.appcheck

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory

/** No startup attestation: the separately approved AI route must explicitly request a token. */
internal class SpartanAppCheckModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  @Volatile private var destroyed = false
  override fun getName() = "SpartanAppCheck"

  @ReactMethod
  fun getToken(projectId: String, appId: String, promise: Promise) {
    if (destroyed) { reject(promise, "bridge_closed"); return }
    try {
      val app = FirebaseApp.getInstance()
      if (reactApplicationContext.packageName != "com.spartang.mobile"
          || projectId != "spartan-g-a2d80" || app.name != FirebaseApp.DEFAULT_APP_NAME
          || app.options.projectId != projectId || app.options.applicationId != appId) {
        reject(promise, "app_mismatch"); return
      }
      val client = synchronized(providerLock) {
        val previous = configured
        if (previous != null) {
          if (previous.first !== app) { reject(promise, "initialization_conflict"); return }
          previous.second
        } else {
          FirebaseAppCheck.getInstance(app).also {
            // Avoid starting refresh work merely because the native module is registered.
            it.setTokenAutoRefreshEnabled(false)
            it.installAppCheckProviderFactory(PlayIntegrityAppCheckProviderFactory.getInstance())
            configured = Pair(app, it)
          }
        }
      }
      client.getAppCheckToken(false).addOnCompleteListener { result ->
        if (destroyed) { reject(promise, "bridge_closed"); return@addOnCompleteListener }
        if (!result.isSuccessful) { reject(promise, "attestation_unavailable"); return@addOnCompleteListener }
        try {
          val token = result.result
          if (token.token.isEmpty() || token.token.length > 16384 || token.expireTimeMillis <= System.currentTimeMillis()) {
            reject(promise, "invalid_attestation"); return@addOnCompleteListener
          }
          promise.resolve(Arguments.createMap().apply {
            putInt("version", 1)
            putString("projectId", projectId)
            putString("appId", appId)
            putString("token", token.token)
            putDouble("expireTimeMillis", token.expireTimeMillis.toDouble())
          })
        } catch (_: Exception) { reject(promise, "attestation_unavailable") }
      }
    } catch (_: Exception) { reject(promise, "attestation_unavailable") }
  }

  override fun invalidate() {
    destroyed = true
    // Firebase owns its cache/provider. Never delete application data or reset other SDKs.
    super.invalidate()
  }

  private fun reject(promise: Promise, reason: String) {
    // Do not serialize originating SDK exceptions, tokens or request details.
    promise.reject("E_APP_CHECK", "Secure AI attestation is unavailable.", Arguments.createMap().apply {
      putString("reason", reason)
    })
  }

  private companion object {
    val providerLock = Any()
    var configured: Pair<FirebaseApp, FirebaseAppCheck>? = null
  }
}
