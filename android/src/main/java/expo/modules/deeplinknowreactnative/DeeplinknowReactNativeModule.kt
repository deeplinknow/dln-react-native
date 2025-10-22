package expo.modules.deeplinknowreactnative

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import com.deeplinknow.DLN
import com.deeplinknow.DeeplinkMatch
import com.deeplinknow.MatchResponse
import com.deeplinknow.ReferrerData
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

class DeeplinknowReactNativeModule : Module() {
  private val moduleScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

  override fun definition() = ModuleDefinition {
    Name("DeepLinkNow")

    // MARK: - Initialization

    AsyncFunction("initialize") { apiKey: String, enableLogs: Boolean ->
      DLN.init(
        context = appContext.reactContext!!,
        apiKey = apiKey,
        enableLogs = enableLogs
      )
      return@AsyncFunction true
    }

    // MARK: - Deferred Deep Linking

    AsyncFunction("findDeferredUser") {
      val instance = DLN.getInstance()
      val matchResponse = instance.findDeferredUser()

      return@AsyncFunction matchResponse?.let { convertMatchResponseToMap(it) }
    }

    AsyncFunction("processInstallReferrer") { apiKey: String, enableLogs: Boolean ->
      // Initialize if not already done
      if (!isDLNInitialized()) {
        DLN.init(
          context = appContext.reactContext!!,
          apiKey = apiKey,
          enableLogs = enableLogs
        )
        kotlinx.coroutines.delay(100)
      }

      val instance = DLN.getInstance()
      val referrerData = instance.getReferrerData()

      return@AsyncFunction referrerData?.let { convertReferrerDataToMap(it) }
    }

    Function("getCachedReferrerData") {
      val instance = DLN.getInstance()
      val referrerData = instance.getReferrerData()

      return@Function referrerData?.let { convertReferrerDataToMap(it) }
    }

    Function("clearReferrerCache") {
      val sharedPreferences = appContext.reactContext!!.getSharedPreferences("dln_referrer", Context.MODE_PRIVATE)
      sharedPreferences.edit().clear().apply()
      return@Function true
    }

    // MARK: - Clipboard Methods

    AsyncFunction("checkClipboard") {
      val instance = DLN.getInstance()
      return@AsyncFunction instance.checkClipboard()
    }

    AsyncFunction("hasDeepLinkToken") {
      val instance = DLN.getInstance()
      return@AsyncFunction instance.hasDeepLinkToken()
    }

    // MARK: - Deep Link Parsing

    Function("parseDeepLink") { url: String ->
      val instance = DLN.getInstance()
      val parsed = instance.parseDeepLink(url)

      return@Function parsed?.let {
        mapOf(
          "path" to it.first,
          "parameters" to it.second
        )
      }
    }

    Function("getDeferredDeepLink") {
      val instance = DLN.getInstance()
      val deeplinkMatch = instance.getDeferredDeepLink()

      return@Function deeplinkMatch?.let { convertDeeplinkMatchToMap(it) }
    }

    // MARK: - Native Clipboard (for compatibility)

    Function("getClipboardString") {
      val clipboardManager = appContext.reactContext!!.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      val clipData = clipboardManager.primaryClip

      if (clipData != null && clipData.itemCount > 0) {
        val clipItem = clipData.getItemAt(0)
        return@Function clipItem.text?.toString()
      }
      return@Function null
    }

    Function("setClipboardString") { content: String ->
      val clipboardManager = appContext.reactContext!!.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      val clipData = ClipData.newPlainText("text", content)
      clipboardManager.setPrimaryClip(clipData)
      return@Function true
    }

    Function("hasClipboardString") {
      val clipboardManager = appContext.reactContext!!.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      val hasText = clipboardManager.hasPrimaryClip() &&
                   clipboardManager.primaryClipDescription?.hasMimeType("text/plain") == true
      return@Function hasText
    }
  }

  // MARK: - Helper Methods

  private fun isDLNInitialized(): Boolean {
    return try {
      DLN.getInstance()
      true
    } catch (e: Exception) {
      false
    }
  }

  private fun convertReferrerDataToMap(referrerData: ReferrerData): Map<String, Any?> {
    val map = mutableMapOf<String, Any?>(
      "referrerString" to referrerData.referrerString,
      "fpId" to referrerData.fpId,
      "deeplinkId" to referrerData.deeplinkId,
      "processedAt" to referrerData.processedAt.toDouble()
    )

    if (referrerData.deeplinkData != null) {
      map["deeplinkData"] = convertDeeplinkMatchToMap(referrerData.deeplinkData)
    }

    return map
  }

  private fun convertDeeplinkMatchToMap(deeplinkMatch: DeeplinkMatch): Map<String, Any?> {
    return mapOf(
      "id" to deeplinkMatch.id,
      "targetUrl" to deeplinkMatch.targetUrl,
      "campaignId" to deeplinkMatch.campaignId,
      "matchedAt" to deeplinkMatch.matchedAt,
      "expiresAt" to deeplinkMatch.expiresAt,
      "metadata" to deeplinkMatch.metadata
    )
  }

  private fun convertMatchResponseToMap(matchResponse: MatchResponse): Map<String, Any> {
    val matches = matchResponse.matches.map { match ->
      val matchMap = mutableMapOf<String, Any?>(
        "confidenceScore" to match.confidenceScore
      )

      if (match.deeplink != null) {
        matchMap["deeplink"] = convertDeeplinkMatchToMap(match.deeplink)
      }

      // Convert match details
      matchMap["matchDetails"] = mapOf(
        "ipMatch" to mapOf(
          "matched" to match.matchDetails.ipMatch.matched,
          "score" to match.matchDetails.ipMatch.score
        ),
        "deviceMatch" to mapOf(
          "matched" to match.matchDetails.deviceMatch.matched,
          "score" to match.matchDetails.deviceMatch.score,
          "components" to mapOf(
            "platform" to match.matchDetails.deviceMatch.components.platform,
            "osVersion" to match.matchDetails.deviceMatch.components.osVersion,
            "deviceModel" to match.matchDetails.deviceMatch.components.deviceModel,
            "hardwareFingerprint" to match.matchDetails.deviceMatch.components.hardwareFingerprint
          )
        ),
        "timeProximity" to mapOf(
          "score" to match.matchDetails.timeProximity.score,
          "timeDifferenceMinutes" to match.matchDetails.timeProximity.timeDifferenceMinutes
        ),
        "localeMatch" to mapOf(
          "matched" to match.matchDetails.localeMatch.matched,
          "score" to match.matchDetails.localeMatch.score,
          "components" to mapOf(
            "language" to match.matchDetails.localeMatch.components.language,
            "timezone" to match.matchDetails.localeMatch.components.timezone
          )
        )
      )

      matchMap
    }

    return mapOf(
      "ttlSeconds" to matchResponse.ttlSeconds,
      "matches" to matches
    )
  }
}
