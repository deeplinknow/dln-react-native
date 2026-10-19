#import <React/RCTBridgeModule.h>

#ifdef RCT_NEW_ARCH_ENABLED
#import <ReactCommon/RCTTurboModule.h>
// Codegen output for src/specs/NativeDeepLinkNow.ts (header location differs across RN versions)
#if __has_include(<NativeDeepLinkNowSpec/NativeDeepLinkNowSpec.h>)
#import <NativeDeepLinkNowSpec/NativeDeepLinkNowSpec.h>
#elif __has_include("NativeDeepLinkNowSpec.h")
#import "NativeDeepLinkNowSpec.h"
#endif
#endif

/**
 * TurboModule (new architecture) / bridge module (old architecture) implementation of
 * DeepLinkNow for bare React Native projects. It bridges to the shared Swift glue in
 * shared/DeepLinkNowCore.swift.
 *
 * Expo projects use DeeplinknowReactNativeModule.swift instead.
 */
#ifdef RCT_NEW_ARCH_ENABLED
// NativeDeepLinkNowSpec (codegen) extends RCTBridgeModule and RCTTurboModule.
@interface DeepLinkNowTurbo : NSObject <NativeDeepLinkNowSpec>
#else
@interface DeepLinkNowTurbo : NSObject <RCTBridgeModule>
#endif
@end
