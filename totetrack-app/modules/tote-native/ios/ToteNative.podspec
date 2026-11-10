Pod::Spec.new do |s|
  s.name           = 'ToteNative'
  s.version        = '1.0.0'
  s.summary        = 'ToteTrack on-device photo recognition, Spotlight search and local reminders'
  s.description    = s.summary
  s.license        = 'MIT'
  s.author         = 'Tyler Weltzin'
  s.homepage       = 'https://github.com/Tweltz1/football_azure'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/Tweltz1/football_azure.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'CoreML', 'CoreSpotlight', 'UserNotifications', 'UniformTypeIdentifiers', 'CoreNFC'

  s.source_files = "**/*.{h,m,swift}"
  # On-device object detector, downloaded and compiled by .github/workflows/totetrack-app.yml (not in git).
  s.resources = "models/*.mlmodelc"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
