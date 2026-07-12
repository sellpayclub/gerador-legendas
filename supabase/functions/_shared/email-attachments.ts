import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

type Attachment = { filename: string; content: string };

const PURCHASE_ATTACHMENTS = [
  {
    storagePath: "manual/Manual_Instalacao_Gerador_Legendas.pdf",
    filename: "Manual_Instalacao_Gerador_Legendas.pdf",
  },
  {
    storagePath: "bonus/Guia_Cortes_Virais_Lucrativos.pdf",
    filename: "Guia_Cortes_Virais_Lucrativos.pdf",
  },
] as const;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function loadPurchaseAttachments(
  supabase: SupabaseClient,
): Promise<Attachment[] | undefined> {
  const attachments: Attachment[] = [];

  for (const item of PURCHASE_ATTACHMENTS) {
    const { data, error } = await supabase.storage
      .from("assets")
      .download(item.storagePath);
    if (error || !data) {
      console.warn(`attachment not found (${item.storagePath}):`, error?.message ?? "missing");
      continue;
    }
    const bytes = new Uint8Array(await data.arrayBuffer());
    attachments.push({
      filename: item.filename,
      content: bytesToBase64(bytes),
    });
  }

  return attachments.length ? attachments : undefined;
}
