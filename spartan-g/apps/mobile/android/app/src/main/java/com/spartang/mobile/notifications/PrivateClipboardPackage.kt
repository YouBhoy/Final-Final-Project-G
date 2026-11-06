package com.spartang.mobile.notifications

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PersistableBundle
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager

/** Narrow, temporary clipboard bridge. No storage, network, permissions or logging. */
class PrivateClipboardModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context), LifecycleEventListener {
  private val handler = Handler(Looper.getMainLooper())
  private var copied: String? = null
  private var clearPending = false
  private val expiry = Runnable { clearOwnedClip() }
  override fun getName() = "SpartanPrivateClipboard"
  init { context.addLifecycleEventListener(this) }
  private fun clearOwnedClip() {
    handler.removeCallbacks(expiry)
    val value = copied ?: return
    clearPending = true
    val manager = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    try {
      if (Build.VERSION.SDK_INT >= 29 && currentActivity?.hasWindowFocus() != true) return
      val clip = manager.primaryClip
      if (clip?.description?.label == "Spartan-G private test" && clip.itemCount == 1 && clip.getItemAt(0).text?.toString() == value) {
        if (Build.VERSION.SDK_INT >= 28) manager.clearPrimaryClip() else manager.setPrimaryClip(ClipData.newPlainText("", ""))
      }
      copied = null; clearPending = false
    } catch (_: Exception) { /* Android can deny clipboard access in the background. Never log its content. */ }
  }
  @ReactMethod fun copyToken(value: String, promise: Promise) {
    handler.post {
      if (currentActivity?.hasWindowFocus() != true || value.length !in 32..4096 || !value.matches(Regex("[A-Za-z0-9_:\\-]+")) || value.startsWith("ExpoPushToken") || value.startsWith("ExponentPushToken")) {
        promise.reject("copy_unavailable", "Private copy is unavailable."); return@post
      }
      try {
        clearOwnedClip()
        val clip = ClipData.newPlainText("Spartan-G private test", value)
        clip.description.extras = PersistableBundle().apply { putBoolean("android.content.extra.IS_SENSITIVE", true) }
        (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(clip)
        copied = value
        clearPending = false
        handler.postDelayed(expiry, 60000)
        promise.resolve(null)
      } catch (_: Exception) { promise.reject("copy_unavailable", "Private copy is unavailable.") }
    }
  }
  @ReactMethod fun clearToken() { handler.post { clearOwnedClip() } }
  override fun onHostResume() { if (clearPending) handler.post { clearOwnedClip() } }
  override fun onHostPause() { clearOwnedClip() }
  override fun onHostDestroy() { clearOwnedClip() }
  override fun invalidate() { context.removeLifecycleEventListener(this); handler.post { clearOwnedClip() }; super.invalidate() }
}
class PrivateClipboardPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(PrivateClipboardModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
