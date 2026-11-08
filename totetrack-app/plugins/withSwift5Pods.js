// Xcode 26.3's Swift 6 compiler rejects a data-race check in expo-modules-jsi. Building the pods
// that ask for Swift 6 in Swift 5 mode turns those checks back into warnings.
const { withPodfile } = require('expo/config-plugins');

const MARKER = '# totetrack: swift5 pods';
const SNIPPET = `
    ${MARKER}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        if config.build_settings['SWIFT_VERSION'].to_s.start_with?('6')
          config.build_settings['SWIFT_VERSION'] = '5.0'
        end
      end
    end
`;

module.exports = function withSwift5Pods(config) {
  return withPodfile(config, (cfg) => {
    const src = cfg.modResults.contents;
    if (!src.includes(MARKER)) {
      cfg.modResults.contents = src.replace(/post_install do \|installer\|\n/, (m) => m + SNIPPET);
    }
    return cfg;
  });
};
