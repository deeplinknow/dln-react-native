import ExpoModulesCore
import DeepLinkNow
import UIKit

public class DeeplinknowReactNativeModule: Module {
  // Module definition with name and methods
  public func definition() -> ModuleDefinition {
    Name("DeepLinkNow")

    // MARK: - Initialization

    AsyncFunction("initialize") { (apiKey: String, enableLogs: Bool) -> Bool in
      let config = DLNConfig(apiKey: apiKey, enableLogs: enableLogs)
      await DeepLinkNow.initialize(config: config)
      return true
    }

    // MARK: - Deferred Deep Linking

    AsyncFunction("findDeferredUser") { () -> [String: Any]? in
      guard let matchResponse = await DeepLinkNow.findDeferredUser() else {
        return nil
      }
      return convertMatchResponseToDict(matchResponse)
    }

    // MARK: - Clipboard Methods

    Function("checkClipboard") { () -> String? in
      return DeepLinkNow.checkClipboard()
    }

    Function("hasDeepLinkToken") { () -> Bool in
      return DeepLinkNow.hasDeepLinkToken()
    }

    // MARK: - Deep Link Parsing

    Function("parseDeepLink") { (urlString: String) -> [String: Any]? in
      guard let url = URL(string: urlString),
            let parsed = DeepLinkNow.parseDeepLink(url) else {
        return nil
      }

      return [
        "path": parsed.path,
        "parameters": parsed.parameters
      ]
    }

    // MARK: - Native Clipboard (for compatibility)

    AsyncFunction("getClipboardString") { () -> String? in
      await MainActor.run {
        return UIPasteboard.general.string
      }
    }

    AsyncFunction("setClipboardString") { (content: String) -> Bool in
      await MainActor.run {
        UIPasteboard.general.string = content
        return true
      }
    }

    Function("hasClipboardString") { () -> Bool in
      return UIPasteboard.general.hasStrings
    }
  }

  // MARK: - Helper Methods

  private func convertMatchResponseToDict(_ matchResponse: MatchResponse) -> [String: Any] {
    var result: [String: Any] = [
      "ttlSeconds": matchResponse.ttlSeconds,
      "matches": []
    ]

    var matchesArray: [[String: Any]] = []

    for match in matchResponse.matches {
      var matchDict: [String: Any] = [
        "confidenceScore": match.confidenceScore
      ]

      if let deeplink = match.deeplink {
        matchDict["deeplink"] = [
          "id": deeplink.id,
          "targetUrl": deeplink.targetUrl,
          "campaignId": deeplink.campaignId ?? NSNull(),
          "matchedAt": deeplink.matchedAt,
          "expiresAt": deeplink.expiresAt,
          "metadata": deeplink.metadata.mapValues { $0.value }
        ]
      }

      // Convert match details
      let matchDetails = match.matchDetails
      matchDict["matchDetails"] = [
        "ipMatch": [
          "matched": matchDetails.ipMatch.matched,
          "score": matchDetails.ipMatch.score
        ],
        "deviceMatch": [
          "matched": matchDetails.deviceMatch.matched,
          "score": matchDetails.deviceMatch.score,
          "components": [
            "platform": matchDetails.deviceMatch.components.platform,
            "osVersion": matchDetails.deviceMatch.components.osVersion,
            "deviceModel": matchDetails.deviceMatch.components.deviceModel,
            "hardwareFingerprint": matchDetails.deviceMatch.components.hardwareFingerprint
          ]
        ],
        "timeProximity": [
          "score": matchDetails.timeProximity.score,
          "timeDifferenceMinutes": matchDetails.timeProximity.timeDifferenceMinutes
        ],
        "localeMatch": [
          "matched": matchDetails.localeMatch.matched,
          "score": matchDetails.localeMatch.score,
          "components": [
            "language": matchDetails.localeMatch.components.language,
            "timezone": matchDetails.localeMatch.components.timezone
          ]
        ]
      ]

      matchesArray.append(matchDict)
    }

    result["matches"] = matchesArray
    return result
  }
}
