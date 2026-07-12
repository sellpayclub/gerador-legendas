export type Aula = {
  id: string;
  numero: number;
  i18nKey: "openai" | "howto";
  youtubeId: string;
  duracao?: string;
};

export const AULAS: Aula[] = [
  {
    id: "openai-api-key",
    numero: 1,
    i18nKey: "openai",
    youtubeId: "-gPiwX6NbLU",
  },
  {
    id: "como-usar-ferramenta",
    numero: 2,
    i18nKey: "howto",
    youtubeId: "hMOlThPcdCg",
  },
];

export function youtubeEmbedUrl(youtubeId: string): string {
  return `https://www.youtube.com/embed/${youtubeId}?rel=0&modestbranding=1`;
}

export function youtubeWatchUrl(youtubeId: string): string {
  return `https://youtu.be/${youtubeId}`;
}
