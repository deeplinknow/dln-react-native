package com.deeplinknow.reactnative

import com.deeplinknow.DLNAppInfo
import com.deeplinknow.DLNException
import com.deeplinknow.DeeplinkMatch
import com.deeplinknow.DeferredDeepLink
import com.deeplinknow.MatchDetails
import com.deeplinknow.MatchQuality
import com.deeplinknow.MatchResponse
import com.deeplinknow.ParsedDeepLink
import com.deeplinknow.QueryValue
import com.deeplinknow.ReferrerData

/**
 * Result converters shared by every Android flavor (Expo module, TurboModule, bridge module).
 * Plain Kotlin maps/lists only; each flavor turns them into its own JS value type.
 *
 * Shapes (RN-03):
 * - `findDeferredUser` → the server's snake_case wire shape.
 * - `checkDeferredDeepLink` → the camelCase `DeferredDeepLink`.
 * - errors → (code, message, userInfo{status, serverMessage, causeCode, causeMessage}).
 *
 * All deferred-link behavior lives in the native dln-android SDK (RN-01).
 */
object DLNBridgeConverters {

    data class BridgeError(val code: String, val message: String, val userInfo: Map<String, Any?>)

    fun error(t: Throwable?): BridgeError {
        val e = t as? DLNException
            ?: return BridgeError("invalidResponse", t?.message ?: "Unexpected error", emptyMap())
        val info = linkedMapOf<String, Any?>()
        e.httpStatus?.let { info["status"] = it }
        e.serverMessage?.let { info["serverMessage"] = it }
        (e.cause as? DLNException)?.let { cause ->
            info["causeCode"] = cause.code.value
            info["causeMessage"] = cause.message ?: cause.code.value
        }
        return BridgeError(e.code.value, e.message ?: e.code.value, info)
    }

    fun queryParams(q: Map<String, QueryValue>): Map<String, Any?> =
        LinkedHashMap<String, Any?>().also { out -> q.forEach { (k, v) -> out[k] = v.toPlain() } }

    fun appInfo(info: DLNAppInfo): Map<String, Any?> {
        val domains = info.linkDomains.toList()
        return linkedMapOf(
            "id" to info.appId,
            "alias" to (info.alias ?: ""),
            "name" to info.name,
            "domains" to domains,
            "primaryDomain" to (domains.firstOrNull { !it.endsWith(".deeplinknow.com") } ?: domains.firstOrNull()),
            "accountStatus" to (info.accountStatus ?: "active"),
            "creditsRemaining" to info.creditsRemaining,
            "rateLimits" to null,
        )
    }

    /** `match_details` in the server's snake_case shape. */
    fun matchDetails(d: MatchDetails): Map<String, Any?> = linkedMapOf(
        "ip_match" to linkedMapOf(
            "matched" to d.ipMatch.matched,
            "score" to d.ipMatch.score,
        ),
        "device_match" to linkedMapOf(
            "matched" to d.deviceMatch.matched,
            "score" to d.deviceMatch.score,
            "components" to linkedMapOf(
                "platform" to d.deviceMatch.components.platform,
                "os_version" to d.deviceMatch.components.osVersion,
                "device_model" to d.deviceMatch.components.deviceModel,
                "hardware_fingerprint" to d.deviceMatch.components.hardwareFingerprint,
            ),
        ),
        "time_proximity" to linkedMapOf(
            "score" to d.timeProximity.score,
            "time_difference_minutes" to d.timeProximity.timeDifferenceMinutes,
        ),
        "locale_match" to linkedMapOf(
            "matched" to d.localeMatch.matched,
            "score" to d.localeMatch.score,
            "components" to linkedMapOf(
                "language" to d.localeMatch.components.language,
                "timezone" to d.localeMatch.components.timezone,
            ),
        ),
    )

    /** A deeplink in the server's snake_case shape. */
    fun wireDeeplink(dl: DeeplinkMatch): Map<String, Any?> {
        val m = linkedMapOf<String, Any?>(
            "id" to dl.id,
            "target_url" to dl.targetUrl,
            "metadata" to dl.metadata,
            "campaign_id" to dl.campaignId,
            "matched_at" to dl.matchedAt,
            "expires_at" to dl.expiresAt,
        )
        dl.queryParams?.let { m["query_params"] = queryParams(dl.typedQueryParams) }
        dl.fullPath?.let { m["full_path"] = it }
        return m
    }

    /** `/sdk/match` response in the server's snake_case wire shape (RN-03). */
    fun matchResponse(r: MatchResponse): Map<String, Any?> {
        val matches = r.matches.map { match ->
            val quality = MatchQuality.parse(match.matchQuality) ?: MatchQuality.fromScore(match.confidenceScore)
            val m = linkedMapOf<String, Any?>(
                "confidence_score" to match.confidenceScore,
                "match_quality" to quality.name,
                "match_details" to matchDetails(match.matchDetails),
            )
            match.deeplink?.let { m["deeplink"] = wireDeeplink(it) }
            m
        }
        return linkedMapOf("matches" to matches, "ttl_seconds" to r.ttlSeconds)
    }

    /** camelCase `DeferredDeepLink` (RN-03, SDK-15). */
    fun deferred(link: DeferredDeepLink): Map<String, Any?> {
        val m = linkedMapOf<String, Any?>(
            "path" to link.path,
            "queryParams" to queryParams(link.queryParams),
            "fullPath" to link.fullPath,
            "url" to link.url,
            "source" to link.source.value,
            "confidenceScore" to link.confidenceScore,
            "matchQuality" to link.matchQuality.name,
        )
        link.deeplinkId?.let { m["deeplinkId"] = it }
        link.targetUrl?.let { m["targetUrl"] = it }
        link.campaignId?.let { m["campaignId"] = it }
        link.metadata?.let { m["metadata"] = it }
        link.matchedAt?.let { m["matchedAt"] = it }
        link.expiresAt?.let { m["expiresAt"] = it }
        link.matchDetails?.let { m["matchDetails"] = matchDetails(it) }
        return m
    }

    fun parsed(p: ParsedDeepLink): Map<String, Any?> = linkedMapOf(
        "path" to p.path,
        "queryParams" to queryParams(p.queryParams),
        "fullPath" to p.fullPath,
        "url" to p.url,
    )

    /** Referrer deep link, camelCase (the 1.1 `ReferrerDeeplinkMatch` shape). */
    fun referrerDeeplink(dl: DeeplinkMatch): Map<String, Any?> {
        val m = linkedMapOf<String, Any?>(
            "id" to dl.id,
            "targetUrl" to dl.targetUrl,
            "metadata" to dl.metadata,
            "matchedAt" to dl.matchedAt,
            "expiresAt" to dl.expiresAt,
        )
        // Optional keys are omitted, not null, to match the TS types (`campaignId?: string`).
        dl.campaignId?.let { m["campaignId"] = it }
        dl.queryParams?.let { m["queryParams"] = queryParams(dl.typedQueryParams) }
        dl.fullPath?.let { m["fullPath"] = it }
        return m
    }

    fun referrerData(r: ReferrerData): Map<String, Any?> {
        val m = linkedMapOf<String, Any?>(
            "referrerString" to r.referrerString,
            "processedAt" to r.processedAt.toDouble(),
        )
        // Optional keys are omitted, not null, to match the TS types (`fpId?: string`).
        r.fpId?.let { m["fpId"] = it }
        r.deeplinkId?.let { m["deeplinkId"] = it }
        r.deeplinkData?.let { m["deeplinkData"] = referrerDeeplink(it) }
        return m
    }
}
