package com.deeplinknow.reactnative

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/**
 * BaseReactPackage for the DeepLinkNow TurboModule.
 *
 * This package is used for React Native New Architecture projects.
 * It registers the DeepLinkNowModule as a TurboModule.
 */
class DeepLinkNowPackage : BaseReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return if (name == DeepLinkNowModule.NAME) {
            DeepLinkNowModule(reactContext)
        } else {
            null
        }
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            val moduleInfos: MutableMap<String, ReactModuleInfo> = HashMap()
            moduleInfos[DeepLinkNowModule.NAME] = ReactModuleInfo(
                DeepLinkNowModule.NAME,
                DeepLinkNowModule.NAME,
                false,  // canOverrideExistingModule
                false,  // needsEagerInit
                false,  // isCxxModule
                true    // isTurboModule
            )
            moduleInfos
        }
    }
}
