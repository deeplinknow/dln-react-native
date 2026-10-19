require 'json'

# This podspec lives at the package root because the React Native CLI only autolinks podspecs
# found in the package root (it ignores react-native.config.js `podspecPath`). Expo finds it
# through expo-module.config.json `ios.podspecPath`. Source paths are relative to this file.
package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

# CocoaPods evaluates podspecs inside a method of the Pod module, so top-level `def`s are not
# callable here ("undefined method ... for module Pod"). The helpers are lambdas instead.

# The app's iOS directory (where `pod install` runs). Detection is based on the app's
# resolved node_modules, never on paths relative to this package (RN-19).
dln_installation_root = lambda do
  begin
    Pod::Config.instance.installation_root.to_s
  rescue StandardError
    Dir.pwd
  end
end

# Resolves `<name>/package.json` with Node's resolver (handles hoisting, pnpm and
# monorepos) from each of `dirs`, and returns the package's directory, or nil. Falls back to
# looking in <dir>/node_modules when node isn't available.
dln_node_package_dir = lambda do |name, dirs|
  dirs.each do |dir|
    begin
      resolved = IO.popen(
        ['node', '--print', "require.resolve('#{name}/package.json', { paths: [#{dir.to_json}] })"],
        err: File::NULL, &:read
      ).to_s.strip
      return File.dirname(resolved) if !resolved.empty? && File.exist?(resolved)
    rescue StandardError
      # node not available: fall through to the file check
    end
  end
  dirs.each do |dir|
    candidate = File.join(dir, 'node_modules', name)
    return candidate if File.exist?(File.join(candidate, 'package.json'))
  end
  nil
end

# Expo Modules flavor when the app has both expo and expo-modules-core, so
# DeeplinknowReactNativeModule (registered in expo-module.config.json) is compiled.
# USE_EXPO_MODULES=1/0 overrides detection.
dln_expo_modules_available = lambda do
  next true if ENV['USE_EXPO_MODULES'] == '1'
  next false if ENV['USE_EXPO_MODULES'] == '0'

  root = dln_installation_root.call
  app_dirs = [root, File.expand_path('..', root)]
  expo_dir = dln_node_package_dir.call('expo', app_dirs)
  # Apps list `expo`, not `expo-modules-core` (Expo 54 templates). With an isolated
  # linker (pnpm, Bun) expo-modules-core is only reachable from expo itself (RN-19).
  !expo_dir.nil? && !dln_node_package_dir.call('expo-modules-core', app_dirs + [expo_dir]).nil?
end

use_expo_modules = dln_expo_modules_available.call
new_arch_enabled = ENV['RCT_NEW_ARCH_ENABLED'] == '1'

Pod::Spec.new do |s|
  s.name           = 'DeeplinknowReactNative'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = { :ios => '13.0' }
  s.swift_version  = '5.5'
  s.source         = { git: 'https://github.com/deeplinknow/dln-react-native' }
  s.static_framework = true

  # Native iOS SDK. The version lives in package.json ("deeplinknow.iosSdkVersion") so the
  # podspec and android/build.gradle are bumped together (RN-05).
  s.dependency 'DeepLinkNow', "~> #{package['deeplinknow']['iosSdkVersion']}"

  if use_expo_modules
    # Expo project: Expo Modules implementation
    s.dependency 'ExpoModulesCore'

    s.source_files = [
      "ios/DeeplinknowReactNativeModule.swift",
      "ios/shared/**/*.swift"
    ]

    s.pod_target_xcconfig = {
      'DEFINES_MODULE' => 'YES',
      'SWIFT_COMPILATION_MODE' => 'wholemodule'
    }

    puts "[DeeplinknowReactNative] Using Expo Modules implementation"
  else
    # Bare React Native: TurboModule (new arch) / bridge (old arch) implementation
    s.source_files = [
      "ios/DeepLinkNowTurbo.{h,mm}",
      "ios/shared/**/*.swift"
    ]

    s.pod_target_xcconfig = {
      'DEFINES_MODULE' => 'YES',
      'SWIFT_COMPILATION_MODE' => 'wholemodule',
      'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17'
    }

    if defined?(install_modules_dependencies)
      # RN >= 0.71: adds React-Core/codegen deps and sets -DRCT_NEW_ARCH_ENABLED only
      # when the app builds with the new architecture.
      install_modules_dependencies(s)
    else
      s.dependency 'React-Core'
      if new_arch_enabled
        s.compiler_flags = '-DRCT_NEW_ARCH_ENABLED=1'
        s.pod_target_xcconfig['OTHER_CPLUSPLUSFLAGS'] = '-DRCT_NEW_ARCH_ENABLED=1'
      end
    end

    puts "[DeeplinknowReactNative] Using #{new_arch_enabled ? 'TurboModule' : 'bridge'} implementation"
  end
end
