package com.spartang.mobile.garden

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class GardenHttpPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(GardenHttpModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<in Nothing, in Nothing>> = emptyList()
}
