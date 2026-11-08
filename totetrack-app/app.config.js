const withSwift5Pods = require('./plugins/withSwift5Pods');

// The GitHub workflow stamps each TestFlight upload with a new build number.
module.exports = ({ config }) =>
  withSwift5Pods({
    ...config,
    ios: { ...config.ios, buildNumber: process.env.BUILD_NUMBER || config.ios.buildNumber },
  });
