import Purchases, { LOG_LEVEL, type CustomerInfo } from "react-native-purchases";
import RevenueCatUI from "react-native-purchases-ui";
import { config } from "./config";

let configuredForUser: string | null = null;

export async function configurePurchases(appUserID: string): Promise<CustomerInfo> {
  if (configuredForUser !== appUserID) {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
    Purchases.configure({ apiKey: config.revenueCatAndroidKey, appUserID });
    configuredForUser = appUserID;
  }
  return Purchases.getCustomerInfo();
}

export function hasProAccess(info: CustomerInfo): boolean {
  return Boolean(info.entitlements.active[config.entitlement]);
}

export async function presentProPaywall(): Promise<void> {
  await RevenueCatUI.presentPaywallIfNeeded({ requiredEntitlementIdentifier: config.entitlement, displayCloseButton: true });
}

export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}
