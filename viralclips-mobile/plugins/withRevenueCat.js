const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withRevenueCat(config) {
  return withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    const activity = application?.activity?.find((item) => item.$?.["android:name"] === ".MainActivity");
    if (activity) activity.$["android:launchMode"] = "singleTop";
    const permissions = mod.modResults.manifest["uses-permission"] || [];
    if (!permissions.some((item) => item.$?.["android:name"] === "com.android.vending.BILLING")) {
      permissions.push({ $: { "android:name": "com.android.vending.BILLING" } });
    }
    mod.modResults.manifest["uses-permission"] = permissions;
    return mod;
  });
};
