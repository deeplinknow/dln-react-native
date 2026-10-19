import ExpoModulesCore
import DeepLinkNow
import UIKit

/// Rejects a promise with one of the shared SDK error codes (`invalidApiKey`, `network`, …).
final class DeepLinkNowBridgeException: Exception {
  private let dlnCode: String
  private let dlnReason: String

  init(_ error: DeepLinkNowCore.BridgeError) {
    self.dlnCode = error.code
    self.dlnReason = error.message
    super.init()
  }

  override var code: String { dlnCode }
  override var reason: String { dlnReason }
}

/// Expo Modules flavor. Same method set and shapes as DeepLinkNowTurbo.mm (RN-02, RN-03);
/// all conversion lives in DeepLinkNowCore.
public class DeeplinknowReactNativeModule: Module {
  private let core = DeepLinkNowCore.shared

  public func definition() -> ModuleDefinition {
    Name("DeepLinkNow")

    // MARK: - Initialization

    /// Legacy 1.1 entry point.
    AsyncFunction("initialize") { (apiKey: String, enableLogs: Bool) async -> Bool in
      await DeepLinkNow.initialize(config: DLNConfig(apiKey: apiKey, enableLogs: enableLogs))
      return DeepLinkNow.isInitialized
    }

    AsyncFunction("initializeWithConfig") { (apiKey: String, config: [String: Any]) async throws -> [String: Any] in
      do {
        return try await self.core.initialize(apiKey: apiKey, config: config)
      } catch {
        throw DeepLinkNowBridgeException(DeepLinkNowCore.bridgeError(error))
      }
    }

    Function("isInitialized") { () -> Bool in
      self.core.isInitialized()
    }

    // MARK: - Deferred Deep Linking

    AsyncFunction("checkDeferredDeepLink") { (options: [String: Any]) async throws -> [String: Any]? in
      do {
        return try await self.core.checkDeferredDeepLink(options: options)
      } catch {
        throw DeepLinkNowBridgeException(DeepLinkNowCore.bridgeError(error))
      }
    }

    AsyncFunction("resetDeferredDeepLink") { () -> Bool in
      self.core.resetDeferredDeepLink()
    }

    AsyncFunction("findDeferredUser") { () async throws -> [String: Any] in
      do {
        return try await self.core.findDeferredUser()
      } catch {
        throw DeepLinkNowBridgeException(DeepLinkNowCore.bridgeError(error))
      }
    }

    /// Install referrer is Android-only.
    AsyncFunction("getReferrerData") { () -> [String: Any]? in
      nil
    }

    // MARK: - Clipboard

    AsyncFunction("checkClipboard") { () async -> String? in
      await self.core.checkClipboard()
    }

    AsyncFunction("hasDeepLinkToken") { () async -> Bool in
      await self.core.hasDeepLinkToken()
    }

    AsyncFunction("getClipboardString") { () async -> String? in
      await MainActor.run { self.core.getClipboardString() }
    }

    AsyncFunction("setClipboardString") { (content: String) async -> Bool in
      await MainActor.run { self.core.setClipboardString(content) }
    }

    Function("hasClipboardString") { () -> Bool in
      self.core.hasClipboardString()
    }

    // MARK: - Parsing

    Function("parseDeepLink") { (url: String) -> [String: Any]? in
      self.core.parseDeepLink(url)
    }

    Function("isValidDomain") { (host: String) -> Bool in
      self.core.isValidDomain(host)
    }

    // MARK: - Legacy Android-only methods (null / false on iOS)

    AsyncFunction("processInstallReferrer") { (_: String, _: Bool) -> [String: Any]? in
      nil
    }

    Function("getCachedReferrerData") { () -> [String: Any]? in
      nil
    }

    Function("clearReferrerCache") { () -> Bool in
      false
    }

    Function("getDeferredDeepLink") { () -> [String: Any]? in
      nil
    }
  }
}
