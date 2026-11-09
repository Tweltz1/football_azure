Pod::Spec.new do |s|
  s.name           = 'StoreSearch'
  s.version        = '1.0.0'
  s.summary        = 'Apple Maps place search for Grocery Runner'
  s.description    = 'Finds grocery stores near a point with MKLocalSearch.'
  s.license        = 'MIT'
  s.author         = 'Grocery Runner'
  s.homepage       = 'https://github.com/Tweltz1/football_azure'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,swift}'
end
