import DeepLinkNow
import Foundation
import UIKit

/**
 * Shared glue for the DeepLinkNow React Native SDK on iOS.
 *
 * Used by both the Expo module (DeeplinknowReactNativeModule.swift) and the
 * TurboModule / bridge module (DeepLinkNowTurbo.mm). All deferred-link behavior lives in the
 * native DeepLinkNow SDK (RN-01): this file only converts arguments and results.
 *
 * Shapes (RN-03):
 * - `findDeferredUser` → the server's snake_case wire shape.
 * - `checkDeferredDeepLink` → the camelCase `DeferredDeepLink`.
 * - errors → (code, message, userInfo{status, serverMessage, causeCode, causeMessage}) with
 *   the shared SDK error codes.
 */
@objc public class DeepLinkNowCore: NSObject {
    @objc public static let shared = DeepLinkNowCore()

    private override init() {
        super.init()
    }

    // MARK: - Errors

    public struct BridgeError: Error {
        public let code: String
        public let message: String
        public let userInfo: [String: Any]
    }

    public static func bridgeError(_ error: Error) -> BridgeError {
        if let bridged = error as? BridgeError { return bridged }
        guard let dln = error as? DeepLinkNowError else {
            if error is CancellationError {
                return BridgeError(code: "network", message: "Cancelled", userInfo: [:])
            }
            return BridgeError(code: "invalidResponse", message: String(describing: error), userInfo: [:])
        }
        var info: [String: Any] = [:]
        if let status = dln.statusCode { info["status"] = status }
        if let message = dln.message { info["serverMessage"] = message }
        if let cause = dln.cause {
            info["causeCode"] = jsCode(cause.code)
            info["causeMessage"] = cause.message ?? cause.code.rawValue
        }
        var message = dln.message ?? dln.code.rawValue
        if let status = dln.statusCode { message += " (HTTP \(status))" }
        return BridgeError(code: jsCode(dln.code), message: message, userInfo: info)
    }

    /// The shared JS codes. `invalidConfiguration` is iOS-only and maps to `badRequest`.
    static func jsCode(_ code: DeepLinkNowError.Code) -> String {
        code == .invalidConfiguration ? "badRequest" : code.rawValue
    }

    // MARK: - Async API (Expo module)

    public func initialize(apiKey: String, config: [String: Any]) async throws -> [String: Any] {
        let timeoutMs = (config["timeoutMs"] as? NSNumber)?.doubleValue
        let dlnConfig = DLNConfig(
            apiKey: apiKey,
            enableLogs: (config["enableLogs"] as? Bool) ?? false,
            baseUrl: config["baseUrl"] as? String,
            timeout: timeoutMs.map { $0 / 1000 },
            retryAttempts: (config["retryAttempts"] as? NSNumber)?.intValue
        )
        do {
            let info = try await DeepLinkNow.initializeThrowing(config: dlnConfig)
            return Self.appInfoDict(info)
        } catch {
            throw Self.bridgeError(error)
        }
    }

    public func checkDeferredDeepLink(options: [String: Any]) async throws -> [String: Any]? {
        let opts = DLNDeferredOptions(
            minConfidence: (options["minConfidence"] as? NSNumber)?.doubleValue,
            useClipboard: (options["useClipboard"] as? Bool) ?? true,
            force: (options["force"] as? Bool) ?? false
        )
        do {
            guard let link = try await DeepLinkNow.checkDeferredDeepLink(opts) else { return nil }
            return Self.deferredDict(link)
        } catch {
            throw Self.bridgeError(error)
        }
    }

    public func findDeferredUser() async throws -> [String: Any] {
        do {
            let response = try await DeepLinkNow.findDeferredUserThrowing()
            return Self.matchResponseDict(response)
        } catch {
            throw Self.bridgeError(error)
        }
    }

    public func hasDeepLinkToken() async -> Bool {
        await DeepLinkNow.hasDeepLinkTokenAsync()
    }

    public func checkClipboard() async -> String? {
        await MainActor.run { DeepLinkNow.checkClipboard() }
    }

    // MARK: - Completion API (TurboModule / bridge, called from Objective-C)

    @objc public func initialize(
        apiKey: String,
        config: [String: Any],
        resolve: @escaping (Any?) -> Void,
        reject: @escaping (String, String, NSError?) -> Void
    ) {
        Task {
            do {
                resolve(try await self.initialize(apiKey: apiKey, config: config))
            } catch {
                Self.reject(error, reject)
            }
        }
    }

    /// Legacy 1.1 entry point: resolves `true` when init succeeded, `false` otherwise.
    @objc public func initialize(apiKey: String, enableLogs: Bool, completion: @escaping (Bool) -> Void) {
        Task {
            await DeepLinkNow.initialize(config: DLNConfig(apiKey: apiKey, enableLogs: enableLogs))
            completion(DeepLinkNow.isInitialized)
        }
    }

    @objc public func isInitialized() -> Bool {
        DeepLinkNow.isInitialized
    }

    @objc public func checkDeferredDeepLink(
        options: [String: Any],
        resolve: @escaping (Any?) -> Void,
        reject: @escaping (String, String, NSError?) -> Void
    ) {
        Task {
            do {
                resolve(try await self.checkDeferredDeepLink(options: options))
            } catch {
                Self.reject(error, reject)
            }
        }
    }

    @objc public func resetDeferredDeepLink() -> Bool {
        DeepLinkNow.resetDeferredDeepLink()
        return true
    }

    @objc public func findDeferredUser(
        resolve: @escaping (Any?) -> Void,
        reject: @escaping (String, String, NSError?) -> Void
    ) {
        Task {
            do {
                resolve(try await self.findDeferredUser())
            } catch {
                Self.reject(error, reject)
            }
        }
    }

    @objc public func hasDeepLinkToken(completion: @escaping (Bool) -> Void) {
        Task { completion(await self.hasDeepLinkToken()) }
    }

    @objc public func checkClipboard(completion: @escaping (String?) -> Void) {
        Task { completion(await self.checkClipboard()) }
    }

    private static func reject(_ error: Error, _ reject: (String, String, NSError?) -> Void) {
        let e = bridgeError(error)
        var info = e.userInfo
        info[NSLocalizedDescriptionKey] = e.message
        reject(e.code, e.message, NSError(domain: "DeepLinkNow", code: (e.userInfo["status"] as? Int) ?? 0, userInfo: info))
    }

    // MARK: - Parsing (sync)

    @objc public func parseDeepLink(_ urlString: String) -> [String: Any]? {
        guard let url = URL(string: urlString.trimmingCharacters(in: .whitespacesAndNewlines)),
              let parsed = DeepLinkNow.parseLink(url) else {
            return nil
        }
        return [
            "path": parsed.path,
            "queryParams": Self.queryDict(parsed.queryParams),
            "fullPath": parsed.fullPath,
            "url": parsed.url,
        ]
    }

    @objc public func isValidDomain(_ host: String) -> Bool {
        DeepLinkNow.isValidDomain(host)
    }

    // MARK: - Native clipboard helpers (internal; never used by an SDK flow, RN-17)

    @objc public func getClipboardString() -> String? {
        UIPasteboard.general.string
    }

    @objc public func setClipboardString(_ content: String) -> Bool {
        UIPasteboard.general.string = content
        return true
    }

    @objc public func hasClipboardString() -> Bool {
        UIPasteboard.general.hasStrings
    }

    // MARK: - Android-only stubs (RN-02: same method set on every flavor)

    @objc public func processInstallReferrer(apiKey: String, enableLogs: Bool, completion: @escaping ([String: Any]?) -> Void) {
        completion(nil)
    }

    @objc public func getCachedReferrerData() -> [String: Any]? {
        nil
    }

    @objc public func clearReferrerCache() -> Bool {
        false
    }

    @objc public func getDeferredDeepLink() -> [String: Any]? {
        nil
    }

    // MARK: - Converters

    static func plain(_ value: Any?) -> Any {
        switch value {
        case nil:
            return NSNull()
        case let v as AnyCodable:
            return plain(v.value)
        case let dict as [String: AnyCodable]:
            return dict.mapValues { plain($0.value) }
        case let dict as [String: Any]:
            return dict.mapValues { plain($0) }
        case let list as [AnyCodable]:
            return list.map { plain($0.value) }
        case let list as [Any]:
            return list.map { plain($0) }
        case let v?:
            return v
        }
    }

    static func queryDict(_ params: [String: DLNQueryValue]) -> [String: Any] {
        params.mapValues { $0.anyValue }
    }

    static func appInfoDict(_ info: DLNAppInfo) -> [String: Any] {
        [
            "id": info.appId,
            "alias": info.alias,
            "name": info.name ?? NSNull(),
            "domains": info.linkDomains,
            "primaryDomain": info.primaryDomain,
            "accountStatus": info.accountStatus,
            "creditsRemaining": info.creditsRemaining ?? NSNull(),
            "rateLimits": NSNull(),
        ]
    }

    /// `match_details` in the server's snake_case shape.
    static func matchDetailsDict(_ d: MatchDetails) -> [String: Any] {
        [
            "ip_match": [
                "matched": d.ipMatch.matched,
                "score": d.ipMatch.score,
            ],
            "device_match": [
                "matched": d.deviceMatch.matched,
                "score": d.deviceMatch.score,
                "components": [
                    "platform": d.deviceMatch.components.platform,
                    "os_version": d.deviceMatch.components.osVersion,
                    "device_model": d.deviceMatch.components.deviceModel,
                    "hardware_fingerprint": d.deviceMatch.components.hardwareFingerprint,
                ],
            ],
            "time_proximity": [
                "score": d.timeProximity.score,
                "time_difference_minutes": d.timeProximity.timeDifferenceMinutes,
            ],
            "locale_match": [
                "matched": d.localeMatch.matched,
                "score": d.localeMatch.score,
                "components": [
                    "language": d.localeMatch.components.language,
                    "timezone": d.localeMatch.components.timezone,
                ],
            ],
        ]
    }

    /// `/sdk/match` response in the server's snake_case wire shape (RN-03).
    static func matchResponseDict(_ response: MatchResponse) -> [String: Any] {
        let matches: [[String: Any]] = response.matches.map { match in
            var m: [String: Any] = [
                "confidence_score": match.confidenceScore,
                "match_quality": match.matchQuality.rawValue,
                "match_details": matchDetailsDict(match.matchDetails),
            ]
            if let dl = match.deeplink {
                var d: [String: Any] = [
                    "id": dl.id,
                    "target_url": dl.targetUrl,
                    "metadata": plain(dl.metadata),
                    "campaign_id": dl.campaignId ?? NSNull(),
                    "matched_at": dl.matchedAt,
                    "expires_at": dl.expiresAt,
                ]
                if let q = dl.queryParams { d["query_params"] = queryDict(q) }
                if let fp = dl.fullPath { d["full_path"] = fp }
                m["deeplink"] = d
            }
            return m
        }
        return ["matches": matches, "ttl_seconds": response.ttlSeconds]
    }

    /// camelCase `DeferredDeepLink` (RN-03, SDK-15).
    static func deferredDict(_ link: DLNDeferredDeepLink) -> [String: Any] {
        var d: [String: Any] = [
            "path": link.path,
            "queryParams": queryDict(link.queryParams),
            "fullPath": link.fullPath,
            "url": link.url,
            "source": link.source.rawValue,
            "confidenceScore": link.confidenceScore,
            "matchQuality": link.matchQuality.rawValue,
        ]
        if let v = link.deeplinkId { d["deeplinkId"] = v }
        if let v = link.targetUrl { d["targetUrl"] = v }
        if let v = link.campaignId { d["campaignId"] = v }
        if let v = link.metadata { d["metadata"] = plain(v) }
        if let v = link.matchedAt { d["matchedAt"] = v }
        if let v = link.expiresAt { d["expiresAt"] = v }
        if let v = link.matchDetails { d["matchDetails"] = matchDetailsDict(v) }
        return d
    }
}
