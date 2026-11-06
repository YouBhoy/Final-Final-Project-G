package com.spartang.mobile.security

import android.content.Context
import com.spartang.mobile.BuildConfig
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import org.json.JSONObject
import java.io.File
import android.util.AtomicFile
import android.util.Base64
import android.security.keystore.KeyInfo
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec

/** Guards and non-interactive metadata reads for expo-secure-store 14.2.4.
 * Only the existing unauthenticated metadata key may decrypt here; proofs stay
 * in Expo's OS-authenticated reader. No key/ciphertext is returned or logged.
 * Plain metadata is returned only to the app's account-bound controller.
 */
class SecurityMetadataModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "SpartanSecurityMetadata"
  // Read-only native build constant, never an intent, remote setting or preference.
  override fun getConstants(): Map<String, Any> = mapOf(
    "privateDocumentationBuild" to (BuildConfig.SPARTAN_PRIVATE_DOCUMENTATION &&
      BuildConfig.APPLICATION_ID == "com.spartang.mobile" && BuildConfig.VERSION_CODE == 31 && !BuildConfig.DEBUG)
  )

  private fun plainKey(key: String) = key.length <= 4096 && (key == "spartan.local-lock.installation.v1" ||
    key == "spartan.after-sign-in.pending.v1" || key.matches(Regex("spartan\\.(local-lock|after-sign-in)\\.policy\\.[a-f0-9]+")))

  @ReactMethod fun readPlainMetadata(key: String, promise: Promise) {
    if (!plainKey(key)) { promise.reject("metadata_key_rejected", "Security preference metadata could not be checked."); return }
    try {
      val prefs = context.getSharedPreferences("SecureStore", Context.MODE_PRIVATE)
      val envelope = prefs.getString("spartan-local-lock-v1-$key", null) ?: prefs.getString(key, null)
      if (envelope == null) { promise.resolve(null); return }
      val json = JSONObject(envelope)
      // Strictly the existing SecureStore 14.2.4 AES unauthenticated format.
      // Do not invoke its generic reader: it can delete an undecryptable item
      // and return null, making unknown policy indistinguishable from OFF.
      if (json.get("requireAuthentication") != false) {
        promise.reject("metadata_authentication_rejected", "Security metadata unexpectedly requires authentication. No biometric prompt was opened."); return
      }
      if (json.getString("scheme") != "aes" || json.get("usesKeystoreSuffix") != true ||
          json.getString("keystoreAlias") != "spartan-local-lock-v1") throw IllegalStateException()
      val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
      val entry = store.getEntry("AES/GCM/NoPadding:spartan-local-lock-v1:keystoreUnauthenticated", null) as? KeyStore.SecretKeyEntry
        ?: throw IllegalStateException()
      val info = SecretKeyFactory.getInstance(entry.secretKey.algorithm,"AndroidKeyStore").getKeySpec(entry.secretKey,KeyInfo::class.java) as KeyInfo
      if (info.isUserAuthenticationRequired) throw IllegalStateException()
      val bits = json.getInt("tlen")
      val iv = Base64.decode(json.getString("iv"),Base64.DEFAULT)
      val ct = Base64.decode(json.getString("ct"),Base64.DEFAULT)
      if (bits !in 96..128 || bits % 8 != 0 || iv.size != 12 || ct.size < bits / 8) throw IllegalStateException()
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE,entry.secretKey,GCMParameterSpec(bits,iv))
      promise.resolve(String(cipher.doFinal(ct),Charsets.UTF_8))
    } catch (_: Exception) {
      // Preserve the original envelope. Missing key, invalid tag, restore or
      // invalid format is an error on every retry, never a default-OFF null.
      promise.reject("metadata_decryption_rejected", "Saved security metadata could not be read. Protected content remains closed.")
    }
  }

  // Unlike AsyncStorage, this marker cannot be restored by Android Auto Backup
  // or device transfer. Absence requires local Firebase sign-out BEFORE listening
  // for restored auth. The first v21 upgrade also deliberately signs in again.
  private fun marker() = AtomicFile(File(context.noBackupFilesDir, "spartan-auth-installation-v1"))

  @ReactMethod fun requiresFreshSignIn(promise: Promise) {
    try {
      val file = marker()
      if (!file.baseFile.exists()) { promise.resolve(true); return }
      if (file.readFully().toString(Charsets.UTF_8) != "1") throw IllegalStateException()
      val prefs = context.getSharedPreferences("SecureStore", Context.MODE_PRIVATE)
      if (!prefs.contains("spartan-local-lock-v1-spartan.local-lock.installation.v1") &&
          !prefs.contains("spartan.local-lock.installation.v1")) { promise.resolve(true); return }
      promise.resolve(false)
    } catch (_: Exception) { promise.reject("installation_state_rejected", "Installation state could not be checked.") }
  }

  @ReactMethod fun markInstallationReady(promise: Promise) {
    try {
      val file = marker()
      val output = file.startWrite()
      try { output.write("1".toByteArray(Charsets.UTF_8)); file.finishWrite(output) }
      catch (error: Exception) { file.failWrite(output); throw error }
      promise.resolve(true)
    } catch (_: Exception) { promise.reject("installation_write_rejected", "Installation state could not be saved.") }
  }

  @ReactMethod fun assertBiometricProof(key: String, promise: Promise) {
    if (!key.matches(Regex("spartan\\.(local-lock|after-sign-in)\\.proof\\.[a-f0-9]+")) || key.length > 4096) {
      promise.reject("proof_key_rejected", "Biometric proof could not be checked."); return
    }
    try {
      val prefs = context.getSharedPreferences("SecureStore", Context.MODE_PRIVATE)
      val envelope = prefs.getString("spartan-local-lock-v1-$key", null) ?: prefs.getString(key, null)
        ?: throw IllegalStateException()
      val json = JSONObject(envelope)
      // A read option cannot demand a challenge if the STORED item is plain.
      // Never accept a proof whose decrypt can skip the OS CryptoObject prompt.
      if (json.get("requireAuthentication") != true || json.getString("scheme") != "aes" ||
          json.get("usesKeystoreSuffix") != true || json.getString("keystoreAlias") != "spartan-local-lock-v1") throw IllegalStateException()
      promise.resolve(true)
    } catch (_: Exception) { promise.reject("biometric_proof_rejected", "Biometric enrollment is missing or invalid. Sign in normally to re-enroll.") }
  }

  @ReactMethod fun assertAbsent(key: String, promise: Promise) {
    val allowed = key == "spartan.after-sign-in.pending.v1" ||
      key.matches(Regex("spartan\\.(local-lock|after-sign-in)\\.(policy|proof)\\.[a-f0-9]+"))
    if (!allowed || key.length > 4096) { promise.reject("cleanup_key_rejected", "Local cleanup could not be checked."); return }
    try {
      val prefs = context.getSharedPreferences("SecureStore", Context.MODE_PRIVATE)
      if (prefs.contains("spartan-local-lock-v1-$key") || prefs.contains(key)) throw IllegalStateException()
      promise.resolve(true)
    } catch (_: Exception) { promise.reject("cleanup_unconfirmed", "Local enrollment cleanup could not be confirmed.") }
  }

  @ReactMethod fun assertPlainMetadata(key: String, promise: Promise) {
    val allowed = key == "spartan.local-lock.installation.v1" || key == "spartan.after-sign-in.pending.v1" ||
      key.matches(Regex("spartan\\.(local-lock|after-sign-in)\\.policy\\.[a-f0-9]+"))
    if (!allowed || key.length > 4096) {
      promise.reject("metadata_key_rejected", "Security preference metadata could not be checked."); return
    }
    try {
      val prefs = context.getSharedPreferences("SecureStore", Context.MODE_PRIVATE)
      val envelope = prefs.getString("spartan-local-lock-v1-$key", null) ?: prefs.getString(key, null)
      if (envelope != null) {
        val json = JSONObject(envelope)
        // Missing means false in the pinned Expo reader. Reject ambiguous types.
        if (json.has("requireAuthentication") && json.get("requireAuthentication") != false) {
          promise.reject("metadata_authentication_rejected", "Security metadata unexpectedly requires authentication. No biometric prompt was opened."); return
        }
      }
      promise.resolve(true)
    } catch (_: Exception) {
      promise.reject("metadata_shape_rejected", "Security preference metadata could not be checked.")
    }
  }
}

class SecurityMetadataPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(SecurityMetadataModule(context), BiometricDiagnosticModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
