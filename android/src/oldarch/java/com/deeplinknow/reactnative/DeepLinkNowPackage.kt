package com.deeplinknow.reactnative

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * Legacy ReactPackage for DeepLinkNow Bridge Module.
 *
 * This package is used for React Native Old Architecture projects.
 * It registers the DeepLinkNowModule as a traditional bridge module.
 */
class DeepLinkNowPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(DeepLinkNowModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
