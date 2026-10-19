package com.spartang.mobile.garden

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.Proxy
import java.net.URI
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import okhttp3.Authenticator
import okhttp3.Call
import okhttp3.Callback
import okhttp3.ConnectionPool
import okhttp3.CookieJar
import okhttp3.Dispatcher
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okio.BufferedSink

internal class GardenHttpFailure(
  val reason: String, val retryable: Boolean = false, val outcomeUnknown: Boolean = false
) : Exception("Garden request could not be confirmed.")

internal data class GardenHttpReply(val status: Int, val body: String, val retryAfterSeconds: Int)

/** Private client/pool/dispatcher. No RN client provider, global defaults or persistent state. */
internal class GardenHttpClient(approvedOrigin: String) : AutoCloseable {
  private val origin = parseOrigin(approvedOrigin)
  private val lock = Any()
  private var closed = false
  private class Flight(val call: Call, val cancelled: AtomicBoolean = AtomicBoolean(false))
  private val flights = mutableMapOf<String, Flight>()
  private val dispatcher = Dispatcher().apply { maxRequests = MAX_FLIGHTS; maxRequestsPerHost = MAX_FLIGHTS }
  private val client = OkHttpClient.Builder()
    .dispatcher(dispatcher).connectionPool(ConnectionPool(2, 30, TimeUnit.SECONDS))
    .followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false)
    .cookieJar(CookieJar.NO_COOKIES).authenticator(Authenticator.NONE).proxyAuthenticator(Authenticator.NONE)
    .cache(null).proxy(Proxy.NO_PROXY)
    .connectTimeout(10, TimeUnit.SECONDS).writeTimeout(10, TimeUnit.SECONDS)
    .readTimeout(90, TimeUnit.SECONDS).callTimeout(90, TimeUnit.SECONDS).build()

  fun request(key: String, action: String, operationId: String, token: String, timeoutMs: Long,
    complete: (GardenHttpReply?, GardenHttpFailure?) -> Unit) {
    if (!UUID.matches(key)) throw GardenHttpFailure("invalid_request_key")
    if (timeoutMs !in 1000L..90000L) throw GardenHttpFailure("invalid_timeout")
    if (token.length !in 1..8192 || !TOKEN.matches(token)) throw GardenHttpFailure("invalid_token")
    val route = when (action) {
      "waterGarden" -> "/v1/watering"
      "recoverAssessmentReward" -> "/v1/assessments/recover"
      "finalizeAssessment" -> "/v1/assessments/finalize"
      else -> throw GardenHttpFailure("invalid_operation")
    }
    if (action == "waterGarden") {
      if (!UUID.matches(operationId)) throw GardenHttpFailure("invalid_identity")
    } else if (operationId.isEmpty() || operationId.trim() != operationId || operationId.contains('/')
      || operationId.toByteArray(Charsets.UTF_8).toString(Charsets.UTF_8) != operationId
      || operationId == "." || operationId == ".." || operationId.toByteArray(Charsets.UTF_8).size > 1500
      || Regex("__.*__").matches(operationId)) throw GardenHttpFailure("invalid_identity")
    val field = if (action == "waterGarden") "requestId" else "attemptId"
    val body = "{\"$field\":${quote(operationId)}}".toByteArray(Charsets.UTF_8)
    if (body.size > 4096) throw GardenHttpFailure("request_too_large")
    val payload = body.toRequestBody("application/json; charset=utf-8".toMediaType())
    // OkHttp can otherwise replay 503/Retry-After:0 even with connection retries off.
    // Explicit caller retries create a new Call/body with the same operation ID.
    val once = object : RequestBody() {
      override fun contentType() = payload.contentType()
      override fun contentLength() = payload.contentLength()
      override fun isOneShot() = true
      override fun writeTo(sink: BufferedSink) = payload.writeTo(sink)
    }
    val request = Request.Builder().url(origin.newBuilder().encodedPath(route).build())
      .header("Authorization", "Bearer $token").header("Accept", "application/json")
      .header("Cache-Control", "no-store")
      .post(once).build()
    val flight = synchronized(lock) {
      if (closed) throw GardenHttpFailure("transport_closed", true)
      if (flights.containsKey(key)) throw GardenHttpFailure("request_key_in_use")
      if (flights.size >= MAX_FLIGHTS) throw GardenHttpFailure("client_busy", true)
      Flight(client.newCall(request).also { it.timeout().timeout(timeoutMs, TimeUnit.MILLISECONDS) })
        .also { flights[key] = it }
    }
    val settled = AtomicBoolean(false)
    fun finish(reply: GardenHttpReply?, failure: GardenHttpFailure?) {
      if (!settled.compareAndSet(false, true)) return
      synchronized(lock) { flights.remove(key) }
      if (flight.cancelled.get()) complete(null, GardenHttpFailure("cancelled", true, true))
      else complete(reply, failure)
    }
    try {
      flight.call.enqueue(object : Callback {
        override fun onFailure(call: Call, error: IOException) {
          finish(null, GardenHttpFailure("outcome_unknown", true, true))
        }
        override fun onResponse(call: Call, response: Response) {
          try {
            response.use {
              if (it.code in 300..399) throw GardenHttpFailure("redirect_rejected", false, true)
              if (it.request.url != request.url) throw GardenHttpFailure("unexpected_destination", false, true)
              val source = it.body ?: throw GardenHttpFailure("invalid_response", true, true)
              if (source.contentLength() > RESPONSE_BYTES) throw GardenHttpFailure("response_too_large", true, true)
              val output = ByteArrayOutputStream()
              source.byteStream().use { input ->
                val buffer = ByteArray(4096)
                while (true) {
                  val count = input.read(buffer)
                  if (count == -1) break
                  if (output.size() + count > RESPONSE_BYTES) throw GardenHttpFailure("response_too_large", true, true)
                  output.write(buffer, 0, count)
                }
              }
              val retry = it.header("Retry-After")?.toIntOrNull()?.takeIf { seconds -> seconds in 1..3600 } ?: 0
              finish(GardenHttpReply(it.code, output.toString("UTF-8"), retry), null)
            }
          } catch (failure: GardenHttpFailure) { finish(null, failure) }
          catch (_: Exception) { finish(null, GardenHttpFailure("outcome_unknown", true, true)) }
        }
      })
    } catch (_: Exception) { finish(null, GardenHttpFailure("outcome_unknown", true, true)) }
  }

  fun cancel(key: String): Boolean {
    val flight = synchronized(lock) { flights[key]?.also { it.cancelled.set(true) } } ?: return false
    flight.call.cancel(); return true
  }

  override fun close() {
    val pending = synchronized(lock) { closed = true; flights.values.toList().onEach { it.cancelled.set(true) } }
    pending.forEach { it.call.cancel() }
    client.connectionPool.evictAll()
    dispatcher.executorService.shutdown()
  }

  companion object {
    const val RESPONSE_BYTES = 16384
    const val MAX_FLIGHTS = 8
    private val UUID = Regex("[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
    private val TOKEN = Regex("[A-Za-z0-9_.-]+")
    fun parseOrigin(value: String): HttpUrl {
      try {
        if (value.length > 512 || value.any { it <= ' ' || it == '\\' || it == '\u007f' }) throw IllegalArgumentException()
        val uri = URI(value)
        val url = value.toHttpUrlOrNull() ?: throw IllegalArgumentException()
        if (uri.scheme != "https" || uri.host == null || uri.rawUserInfo != null || uri.rawQuery != null
          || uri.rawFragment != null || uri.rawPath !in listOf("", "/") || uri.port == 0
          || uri.port > 65535 || url.host.endsWith('.')) throw IllegalArgumentException()
        val canonical = url.toString().removeSuffix("/")
        if (value != canonical && value != "$canonical/") throw IllegalArgumentException()
        return url
      } catch (_: Exception) { throw GardenHttpFailure("invalid_origin") }
    }
    private fun quote(value: String): String = buildString {
      append('"')
      value.forEach { char -> when {
        char == '"' -> append("\\\"")
        char == '\\' -> append("\\\\")
        char < ' ' -> append("\\u" + char.code.toString(16).padStart(4, '0'))
        else -> append(char)
      } }
      append('"')
    }
  }
}
