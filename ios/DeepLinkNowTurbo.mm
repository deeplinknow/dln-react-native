#import "DeepLinkNowTurbo.h"
#import <React/RCTLog.h>

// Import Swift header for shared implementation
#if __has_include(<DeeplinknowReactNative/DeeplinknowReactNative-Swift.h>)
#import <DeeplinknowReactNative/DeeplinknowReactNative-Swift.h>
#else
#import "DeeplinknowReactNative-Swift.h"
#endif

/**
 * TurboModule (new architecture) and bridge module (old architecture) for bare React Native.
 * Same method set and result shapes as the Expo module (RN-02, RN-03). All conversion lives
 * in DeepLinkNowCore.swift.
 */
@implementation DeepLinkNowTurbo

RCT_EXPORT_MODULE(DeepLinkNow)

+ (BOOL)requiresMainQueueSetup {
    return NO;
}

#ifdef RCT_NEW_ARCH_ENABLED
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params {
    return std::make_shared<facebook::react::NativeDeepLinkNowSpecJSI>(params);
}
#endif

static void DLNReject(RCTPromiseRejectBlock reject, NSString *code, NSString *message, NSError *error) {
    reject(code, message, error);
}

// MARK: - Initialization

/// Legacy 1.1 entry point.
RCT_EXPORT_METHOD(initialize:(NSString *)apiKey
                  enableLogs:(BOOL)enableLogs
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    [[DeepLinkNowCore shared] initializeWithApiKey:apiKey
                                        enableLogs:enableLogs
                                        completion:^(BOOL success) {
        resolve(@(success));
    }];
}

RCT_EXPORT_METHOD(initializeWithConfig:(NSString *)apiKey
                  config:(NSDictionary *)config
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    [[DeepLinkNowCore shared] initializeWithApiKey:apiKey
                                            config:(config ?: @{})
                                           resolve:^(id _Nullable result) { resolve(result); }
                                            reject:^(NSString *code, NSString *message, NSError *error) {
        DLNReject(reject, code, message, error);
    }];
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(isInitialized)
{
    return @([[DeepLinkNowCore shared] isInitialized]);
}

// MARK: - Deferred Deep Linking

RCT_EXPORT_METHOD(checkDeferredDeepLink:(NSDictionary *)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    [[DeepLinkNowCore shared] checkDeferredDeepLinkWithOptions:(options ?: @{})
                                                       resolve:^(id _Nullable result) { resolve(result); }
                                                        reject:^(NSString *code, NSString *message, NSError *error) {
        DLNReject(reject, code, message, error);
    }];
}

RCT_EXPORT_METHOD(resetDeferredDeepLink:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    resolve(@([[DeepLinkNowCore shared] resetDeferredDeepLink]));
}

RCT_EXPORT_METHOD(findDeferredUser:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    [[DeepLinkNowCore shared] findDeferredUserWithResolve:^(id _Nullable result) { resolve(result); }
                                                   reject:^(NSString *code, NSString *message, NSError *error) {
        DLNReject(reject, code, message, error);
    }];
}

RCT_EXPORT_METHOD(getReferrerData:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    // Install referrer is Android-only
    resolve(nil);
}

// MARK: - Clipboard Methods

RCT_EXPORT_METHOD(checkClipboard:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    [[DeepLinkNowCore shared] checkClipboardWithCompletion:^(NSString * _Nullable result) {
        resolve(result);
    }];
}

RCT_EXPORT_METHOD(hasDeepLinkToken:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    [[DeepLinkNowCore shared] hasDeepLinkTokenWithCompletion:^(BOOL result) {
        resolve(@(result));
    }];
}

RCT_EXPORT_METHOD(getClipboardString:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    dispatch_async(dispatch_get_main_queue(), ^{
        resolve([[DeepLinkNowCore shared] getClipboardString]);
    });
}

RCT_EXPORT_METHOD(setClipboardString:(NSString *)content
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    dispatch_async(dispatch_get_main_queue(), ^{
        resolve(@([[DeepLinkNowCore shared] setClipboardString:content]));
    });
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(hasClipboardString)
{
    return @([[DeepLinkNowCore shared] hasClipboardString]);
}

// MARK: - Deep Link Parsing

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(parseDeepLink:(NSString *)url)
{
    return [[DeepLinkNowCore shared] parseDeepLink:url];
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(isValidDomain:(NSString *)host)
{
    return @([[DeepLinkNowCore shared] isValidDomain:host]);
}

// MARK: - Legacy Android-only Methods (return nil/false on iOS)

RCT_EXPORT_METHOD(processInstallReferrer:(NSString *)apiKey
                  enableLogs:(BOOL)enableLogs
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    resolve(nil);
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(getCachedReferrerData)
{
    return nil;
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(clearReferrerCache)
{
    return @(NO);
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(getDeferredDeepLink)
{
    return nil;
}

@end
