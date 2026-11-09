Pod::Spec.new do |s|
  s.name           = 'RecipeReader'
  s.version        = '1.0.0'
  s.summary        = 'On-device text recognition for Shop Stride recipe photos'
  s.description    = 'Reads the text in a recipe photo with Apple Vision (VNRecognizeTextRequest). Free, offline, no API key.'
  s.license        = 'MIT'
  s.author         = 'Grocery Runner'
  s.homepage       = 'https://github.com/Tweltz1/football_azure'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,swift}'
end
