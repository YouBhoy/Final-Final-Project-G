// Host-only fixture. Not in Android source sets or APK assets.
package com.spartang.mobile.garden

import java.io.File
import java.security.KeyStore
import java.util.Base64

fun main(args: Array<String>) {
  if (args[0] == "--export-test-tls") {
    val store = KeyStore.getInstance("PKCS12")
    File(args[1]).inputStream().use { store.load(it, "synthetic-local-only".toCharArray()) }
    fun pem(label: String, bytes: ByteArray) = "-----BEGIN $label-----\n" +
      Base64.getMimeEncoder(64, byteArrayOf(10)).encodeToString(bytes) + "\n-----END $label-----\n"
    File(args[2], "test-key.pem").writeText(pem("PRIVATE KEY", store.getKey("local", "synthetic-local-only".toCharArray()).encoded))
    File(args[2], "test-cert.pem").writeText(pem("CERTIFICATE", store.getCertificate("local").encoded))
    return
  }
  if (args[0] == "--origin") {
    try { GardenHttpClient.parseOrigin(args[1]); println("VALID") }
    catch (error: GardenHttpFailure) { println(error.reason) }
    return
  }
  val client = try { GardenHttpClient(args[0]) } catch (_: Exception) { println("INVALID_ORIGIN"); return }
  val encoder = Base64.getEncoder(); val decoder = Base64.getDecoder()
  val outputLock = Any()
  fun report(key: String, reply: GardenHttpReply?, error: GardenHttpFailure?) = synchronized(outputLock) {
    if (error != null) println("E\t$key\t${error.reason}\t${error.retryable}\t${error.outcomeUnknown}")
    else if (reply != null) println("R\t$key\t${reply.status}\t${reply.retryAfterSeconds}\t${encoder.encodeToString(reply.body.toByteArray(Charsets.UTF_8))}")
  }
  println("READY")
  try {
    while (true) {
      val line = readlnOrNull() ?: break
      val parts = line.split('\t')
      if (parts[0] == "C") { client.cancel(parts[1]); continue }
      if (parts[0] == "X") break
      if (parts.size != 6 || parts[0] != "R") throw IllegalArgumentException("Invalid synthetic fixture command")
      val key = parts[1]
      try {
        val id = String(decoder.decode(parts[3]), Charsets.UTF_8)
        val token = String(decoder.decode(parts[4]), Charsets.UTF_8)
        val value = id.split('\u0000', limit = 2)
        client.request(parts[2], value[0], value[1], token, parts[5].toLong()) { reply, error -> report(key, reply, error) }
      } catch (error: GardenHttpFailure) { report(key, null, error) }
    }
  } finally { client.close() }
}
