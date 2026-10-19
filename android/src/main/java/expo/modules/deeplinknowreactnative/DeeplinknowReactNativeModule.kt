package expo.modules.deeplinknowreactnative

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import com.deeplinknow.DLN
import com.deeplinknow.DLNConfig
import com.deeplinknow.reactnative.DLNBridgeConverters
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Expo Modules flavor. Same method set and result shapes as the TurboModule / bridge
 * modules (RN-02, RN-03); conversion lives in DLNBridgeConverters. Every SDK `suspend`
 * call runs inside `AsyncFunction(...) Coroutine { }` (RN-18).
 */
class DeeplinknowReactNativeModule : Module() {

  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("notInitialized", "React context is not available", null)

  private fun reject(t: Throwable?): Nothing {
    val e = DLNBridgeConverters.error(t)
    throw CodedException(e.code, e.message, t)
  }

  private fun instanceOrNull(): DLN? = try {
    DLN.getInstance()
  } catch (e: Exception) {
    null
  }

  private fun clipboard(): ClipboardManager? =
    context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager

  override fun definition() = ModuleDefinition {
    Name("DeepLinkNow")

    // MARK: - Initialization

    /** Legacy 1.1 entry point: resolves whether init succeeded. */
    AsyncFunction("initialize") Coroutine { apiKey: String, enableLogs: Boolean ->
      DLN.init(context = context, apiKey = apiKey, enableLogs = enableLogs)
      DLN.awaitInitialization().isSuccess
    }

    AsyncFunction("initializeWithConfig") Coroutine { apiKey: String, config: Map<String, Any?> ->
      DLN.init(
        context = context,
        apiKey = apiKey,
        enableLogs = config["enableLogs"] as? Boolean ?: false,
        baseUrl = config["baseUrl"] as? String ?: DLNConfig.DEFAULT_BASE_URL,
        timeoutMs = (config["timeoutMs"] as? Number)?.toLong() ?: DLNConfig.DEFAULT_TIMEOUT_MS,
        retryAttempts = (config["retryAttempts"] as? Number)?.toInt() ?: DLNConfig.DEFAULT_RETRY_ATTEMPTS,
      )
      val result = DLN.awaitInitialization()
      result.getOrNull()?.let { DLNBridgeConverters.appInfo(it) } ?: reject(result.exceptionOrNull())
    }

    Function("isInitialized") {
      DLN.isInitialized
    }

    // MARK: - Deferred Deep Linking

    AsyncFunction("checkDeferredDeepLink") Coroutine { options: Map<String, Any?> ->
      val result = DLN.checkDeferredDeepLink(
        minConfidence = (options["minConfidence"] as? Number)?.toDouble(),
        force = options["force"] as? Boolean ?: false,
      )
      if (result.isFailure) reject(result.exceptionOrNull())
      result.getOrNull()?.let { DLNBridgeConverters.deferred(it) }
    }

    AsyncFunction("resetDeferredDeepLink") Coroutine { ->
      DLN.resetDeferredDeepLink()
      true
    }

    AsyncFunction("findDeferredUser") Coroutine { ->
      val result = DLN.findDeferredUserResult()
      result.getOrNull()?.let { DLNBridgeConverters.matchResponse(it) } ?: reject(result.exceptionOrNull())
    }

    AsyncFunction("getReferrerData") Coroutine { ->
      DLN.awaitInitialization()
      instanceOrNull()?.getReferrerData()?.let { DLNBridgeConverters.referrerData(it) }
    }

    // MARK: - Clipboard

    AsyncFunction("checkClipboard") Coroutine { ->
      instanceOrNull()?.checkClipboard()
    }

    AsyncFunction("hasDeepLinkToken") Coroutine { ->
      instanceOrNull()?.hasDeepLinkToken() ?: false
    }

    AsyncFunction("getClipboardString") Coroutine { ->
      val clip = clipboard()?.primaryClip
      if (clip != null && clip.itemCount > 0) clip.getItemAt(0).text?.toString() else null
    }

    AsyncFunction("setClipboardString") Coroutine { content: String ->
      clipboard()?.setPrimaryClip(ClipData.newPlainText("text", content))
      true
    }

    Function("hasClipboardString") {
      val cm = clipboard()
      cm != null && cm.hasPrimaryClip() && cm.primaryClipDescription?.hasMimeType("text/plain") == true
    }

    // MARK: - Parsing

    Function("parseDeepLink") { url: String ->
      DLN.parseDeepLink(url)?.let { DLNBridgeConverters.parsed(it) }
    }

    Function("isValidDomain") { host: String ->
      DLN.isValidDomain(host)
    }

    // MARK: - Legacy 1.1 referrer methods

    /** Arguments are ignored (RN-08): the SDK is initialized once, by initialize. */
    AsyncFunction("processInstallReferrer") Coroutine { _: String, _: Boolean ->
      DLN.awaitInitialization()
      instanceOrNull()?.getReferrerData()?.let { DLNBridgeConverters.referrerData(it) }
    }

    Function("getCachedReferrerData") {
      instanceOrNull()?.getReferrerData()?.let { DLNBridgeConverters.referrerData(it) }
    }

    Function("clearReferrerCache") {
      DLN.resetDeferredDeepLink()
      true
    }

    Function("getDeferredDeepLink") {
      instanceOrNull()?.getDeferredDeepLink()?.let { DLNBridgeConverters.referrerDeeplink(it) }
    }
  }
}
