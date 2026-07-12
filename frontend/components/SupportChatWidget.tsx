"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { isMultiTenant } from "@/lib/hosted";

const ASSISTANT_ID = "6f0fbf22-18ed-4fd6-a4cd-fae54aa21768";
const SCRIPT_SRC = "https://app.clonefyia.com/embed-widget-v2.js";

const USAGE_ROUTES = [
  "/",
  "/editor",
  "/cortes",
  "/render",
  "/configuracoes",
  "/aulas",
  "/plano-inativo",
] as const;

function isUsagePage(pathname: string): boolean {
  return USAGE_ROUTES.some(
    (route) =>
      route === "/"
        ? pathname === "/"
        : pathname === route || pathname.startsWith(`${route}/`),
  );
}

function removeClonefyWidget(): void {
  document
    .querySelectorAll(`script[src="${SCRIPT_SRC}"]`)
    .forEach((el) => el.remove());
  document
    .querySelectorAll(
      '[id*="clonefy" i], [class*="clonefy" i], iframe[src*="clonefy" i]',
    )
    .forEach((el) => el.remove());
}

function injectClonefyWidget(): void {
  if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) return;

  const script = document.createElement("script");
  script.src = SCRIPT_SRC;
  script.dataset.assistantId = ASSISTANT_ID;
  script.async = true;
  document.head.appendChild(script);
}

export default function SupportChatWidget() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isMultiTenant()) return;

    if (isUsagePage(pathname)) {
      injectClonefyWidget();
    } else {
      removeClonefyWidget();
    }
  }, [pathname]);

  return null;
}
