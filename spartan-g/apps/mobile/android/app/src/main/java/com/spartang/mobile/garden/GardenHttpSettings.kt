package com.spartang.mobile.garden

/** Reviewed build-time configuration only. Neither JS nor environment variables can enable it. */
internal object GardenHttpSettings {
  const val ENABLED = false
  val APPROVED_ORIGIN: String? = null

  fun configuredOrigin(): String? {
    if (!ENABLED) return null
    val origin = APPROVED_ORIGIN ?: return null
    return try { GardenHttpClient.parseOrigin(origin).toString().removeSuffix("/") }
    catch (_: GardenHttpFailure) { null }
  }
}
