export function isMultiTenant(): boolean {
  return process.env.NEXT_PUBLIC_MULTI_TENANT === "true";
}
