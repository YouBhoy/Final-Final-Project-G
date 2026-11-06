package com.spartang.mobile.security

import android.app.AlertDialog
import android.widget.ScrollView
import android.widget.TextView
import com.facebook.react.bridge.*
import org.json.JSONObject

/** No storage/network/logcat. The sink exists only in the diagnostic Gradle overlay. */
class BiometricDiagnosticModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "SpartanBiometricDiagnostic"
  private fun sink(): Class<*>? = try { Class.forName("expo.modules.securestore.SpartanDiagnosticTrace") } catch (_: Exception) { null }
  override fun getConstants(): Map<String, Any> = mapOf("enabled" to (sink() != null))

  @ReactMethod fun record(event: String, data: ReadableMap, promise: Promise) {
    try {
      val type = sink()
      // The sink filters again. Never forward arbitrary strings from JavaScript.
      val clean = JSONObject()
      val booleanFields = setOf("enabled", "quick", "after", "enrolled", "pending", "busy", "background", "account", "fresh", "initialized", "covered", "hard", "authenticated", "matching", "requireAuth", "requested")
      val enums = mapOf(
        "phase" to setOf("loading", "checking", "ready", "locked", "error"),
        "auth" to setOf("idle", "loading", "authenticated", "unauthenticated", "error"),
        "lifecycle" to setOf("active", "inactive", "background"),
        "keyClass" to setOf("installation", "journal", "lock_policy", "after_policy", "lock_proof", "after_proof", "other")
      )
      for (key in booleanFields) if (data.hasKey(key) && data.getType(key) == ReadableType.Boolean) clean.put(key, data.getBoolean(key))
      for ((key, allowed) in enums) if (data.hasKey(key) && data.getType(key) == ReadableType.String && data.getString(key) in allowed) clean.put(key, data.getString(key))
      type?.getMethod("recordJs", String::class.java, String::class.java)?.invoke(null, event, clean.toString())
      promise.resolve(null)
    } catch (_: Exception) { promise.resolve(null) } // Never affect the gate.
  }

  @ReactMethod fun show(promise: Promise) {
    val activity = currentActivity
    val type = sink()
    if (activity == null || type == null) { promise.reject("diagnostic_unavailable", "Diagnostic trace unavailable."); return }
    activity.runOnUiThread {
      try {
        val text = type.getMethod("snapshot").invoke(null) as String
        val view = TextView(activity).apply { setTextIsSelectable(true); setPadding(20, 16, 20, 16); textSize = 11f; this.text = "DIAGNOSTIC v22 — not a confirmed fix.\nRAM only; no account identifiers or secrets. Process exit erases trace.\n\n$text" }
        AlertDialog.Builder(activity).setTitle("Biometric trace (safe enums only)").setView(ScrollView(activity).apply { addView(view) }).setPositiveButton("Close", null).show()
        promise.resolve(null)
      } catch (_: Exception) { promise.reject("diagnostic_unavailable", "Diagnostic trace unavailable.") }
    }
  }
}
