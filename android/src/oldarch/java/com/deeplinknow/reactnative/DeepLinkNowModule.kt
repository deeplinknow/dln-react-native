package com.deeplinknow.reactnative

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import com.deeplinknow.DLN
import com.deeplinknow.DLNConfig
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Legacy bridge module (old architecture). Same method set and result shapes as the Expo and
 * TurboModule modules (RN-02, RN-03); conversion lives in DLNBridgeConverters. Every SDK
 * `suspend` call runs in `moduleScope.launch`, and the scope is cancelled in invalidate() (RN-18).
 */
@ReactModule(name = DeepLinkNowModule.NAME)
class DeepLinkNowModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val moduleScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    override fun getName(): String = NAME

    override fun invalidate() {
        moduleScope.cancel()
        super.invalidate()
    }

    private fun instanceOrNull(): DLN? = try {
        DLN.getInstance()
    } catch (e: Exception) {
        null
    }

    private fun reject(promise: Promise, t: Throwable?) {
        val e = DLNBridgeConverters.error(t)
        promise.reject(e.code, e.message, t, e.userInfo.toWritableMap())
    }

    private fun ReadableMap.optString(key: String): String? =
        if (hasKey(key) && !isNull(key)) getString(key) else null

    private fun ReadableMap.optDouble(key: String): Double? =
        if (hasKey(key) && !isNull(key)) getDouble(key) else null

    private fun ReadableMap.optBoolean(key: String): Boolean? =
        if (hasKey(key) && !isNull(key)) getBoolean(key) else null

    // ============================================
    // Initialization
    // ============================================

    /** Legacy 1.1 entry point: resolves whether init succeeded. */
    @ReactMethod
    fun initialize(apiKey: String, enableLogs: Boolean, promise: Promise) {
        moduleScope.launch {
            try {
                DLN.init(context = reactApplicationContext, apiKey = apiKey, enableLogs = enableLogs)
                promise.resolve(DLN.awaitInitialization().isSuccess)
            } catch (e: Exception) {
                reject(promise, e)
            }
        }
    }

    @ReactMethod
    fun initializeWithConfig(apiKey: String, config: ReadableMap, promise: Promise) {
        moduleScope.launch {
            try {
                DLN.init(
                    context = reactApplicationContext,
                    apiKey = apiKey,
                    enableLogs = config.optBoolean("enableLogs") ?: false,
                    baseUrl = config.optString("baseUrl") ?: DLNConfig.DEFAULT_BASE_URL,
                    timeoutMs = config.optDouble("timeoutMs")?.toLong() ?: DLNConfig.DEFAULT_TIMEOUT_MS,
                    retryAttempts = config.optDouble("retryAttempts")?.toInt() ?: DLNConfig.DEFAULT_RETRY_ATTEMPTS,
                )
                val result = DLN.awaitInitialization()
                val info = result.getOrNull()
                if (info != null) promise.resolve(DLNBridgeConverters.appInfo(info).toWritableMap())
                else reject(promise, result.exceptionOrNull())
            } catch (e: Exception) {
                reject(promise, e)
            }
        }
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun isInitialized(): Boolean = DLN.isInitialized

    // ============================================
    // Deferred Deep Linking
    // ============================================

    @ReactMethod
    fun checkDeferredDeepLink(options: ReadableMap, promise: Promise) {
        moduleScope.launch {
            try {
                val result = DLN.checkDeferredDeepLink(
                    minConfidence = options.optDouble("minConfidence"),
                    force = options.optBoolean("force") ?: false,
                )
                if (result.isFailure) {
                    reject(promise, result.exceptionOrNull())
                } else {
                    promise.resolve(result.getOrNull()?.let { DLNBridgeConverters.deferred(it).toWritableMap() })
                }
            } catch (e: Exception) {
                reject(promise, e)
            }
        }
    }

    @ReactMethod
    fun resetDeferredDeepLink(promise: Promise) {
        DLN.resetDeferredDeepLink()
        promise.resolve(true)
    }

    @ReactMethod
    fun findDeferredUser(promise: Promise) {
        moduleScope.launch {
            try {
                val result = DLN.findDeferredUserResult()
                val response = result.getOrNull()
                if (response != null) promise.resolve(DLNBridgeConverters.matchResponse(response).toWritableMap())
                else reject(promise, result.exceptionOrNull())
            } catch (e: Exception) {
                reject(promise, e)
            }
        }
    }

    @ReactMethod
    fun getReferrerData(promise: Promise) {
        moduleScope.launch {
            try {
                DLN.awaitInitialization()
                // RN-24: wait for the Install Referrer step, not just init (dln-android 1.2.0+).
                promise.resolve(DLN.awaitReferrer()?.let { DLNBridgeConverters.referrerData(it).toWritableMap() })
            } catch (e: Exception) {
                reject(promise, e)
            }
        }
    }

    // ============================================
    // Clipboard
    // ============================================

    @ReactMethod
    fun checkClipboard(promise: Promise) {
        moduleScope.launch {
            try {
                promise.resolve(instanceOrNull()?.checkClipboard())
            } catch (e: Exception) {
                promise.resolve(null)
            }
        }
    }

    @ReactMethod
    fun hasDeepLinkToken(promise: Promise) {
        moduleScope.launch {
            try {
                promise.resolve(instanceOrNull()?.hasDeepLinkToken() ?: false)
            } catch (e: Exception) {
                promise.resolve(false)
            }
        }
    }

    private fun clipboard(): ClipboardManager? =
        reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager

    @ReactMethod
    fun getClipboardString(promise: Promise) {
        try {
            val clip = clipboard()?.primaryClip
            promise.resolve(if (clip != null && clip.itemCount > 0) clip.getItemAt(0).text?.toString() else null)
        } catch (e: Exception) {
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun setClipboardString(content: String, promise: Promise) {
        try {
            clipboard()?.setPrimaryClip(ClipData.newPlainText("text", content))
            promise.resolve(true)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun hasClipboardString(): Boolean = try {
        val cm = clipboard()
        cm != null && cm.hasPrimaryClip() && cm.primaryClipDescription?.hasMimeType("text/plain") == true
    } catch (e: Exception) {
        false
    }

    // ============================================
    // Parsing
    // ============================================

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun parseDeepLink(url: String): WritableMap? = try {
        DLN.parseDeepLink(url)?.let { DLNBridgeConverters.parsed(it).toWritableMap() }
    } catch (e: Exception) {
        null
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun isValidDomain(host: String): Boolean = DLN.isValidDomain(host)

    // ============================================
    // Legacy 1.1 referrer methods
    // ============================================

    /** Arguments are ignored (RN-08): the SDK is initialized once, by initialize. */
    @ReactMethod
    fun processInstallReferrer(apiKey: String, enableLogs: Boolean, promise: Promise) {
        getReferrerData(promise)
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getCachedReferrerData(): WritableMap? = try {
        instanceOrNull()?.getReferrerData()?.let { DLNBridgeConverters.referrerData(it).toWritableMap() }
    } catch (e: Exception) {
        null
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun clearReferrerCache(): Boolean {
        DLN.resetDeferredDeepLink()
        return true
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getDeferredDeepLink(): WritableMap? = try {
        instanceOrNull()?.getDeferredDeepLink()?.let { DLNBridgeConverters.referrerDeeplink(it).toWritableMap() }
    } catch (e: Exception) {
        null
    }

    // ============================================
    // Map → WritableMap
    // ============================================

    @Suppress("UNCHECKED_CAST")
    private fun Map<String, Any?>.toWritableMap(): WritableMap {
        val map = Arguments.createMap()
        forEach { (key, value) ->
            when (value) {
                null -> map.putNull(key)
                is Boolean -> map.putBoolean(key, value)
                is Int -> map.putInt(key, value)
                is Number -> map.putDouble(key, value.toDouble())
                is String -> map.putString(key, value)
                is Map<*, *> -> map.putMap(key, (value as Map<String, Any?>).toWritableMap())
                is Collection<*> -> map.putArray(key, value.toWritableArray())
                else -> map.putString(key, value.toString())
            }
        }
        return map
    }

    @Suppress("UNCHECKED_CAST")
    private fun Collection<*>.toWritableArray(): WritableArray {
        val array = Arguments.createArray()
        forEach { value ->
            when (value) {
                null -> array.pushNull()
                is Boolean -> array.pushBoolean(value)
                is Int -> array.pushInt(value)
                is Number -> array.pushDouble(value.toDouble())
                is String -> array.pushString(value)
                is Map<*, *> -> array.pushMap((value as Map<String, Any?>).toWritableMap())
                is Collection<*> -> array.pushArray(value.toWritableArray())
                else -> array.pushString(value.toString())
            }
        }
        return array
    }

    companion object {
        const val NAME = "DeepLinkNow"
    }
}
