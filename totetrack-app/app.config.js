// Lets the GitHub workflow stamp each TestFlight upload with a new build number.
module.exports = ({ config }) => ({
  ...config,
  ios: { ...config.ios, buildNumber: process.env.BUILD_NUMBER || config.ios.buildNumber },
});
