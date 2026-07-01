/** Single centered line for 1–2 words (mirrors backend _fit_hero). */
export function fitHeroPhrase(text: string, width: number, height: number): { text: string; fontSize: number } {
  const line = text.trim();
  const nChars = Math.max(line.length, 1);
  const fsByW = Math.floor((width * 0.70) / (nChars * 0.62));
  const fsByH = Math.floor(height * 0.065);
  const fontSize = Math.max(36, Math.min(fsByW, fsByH, Math.floor(height * 0.075)));
  return { text: line, fontSize };
}

/** CSS font size capped to the visible video box (PlayRes → screen pixels). */
export function heroCssFontSize(
  text: string,
  playResFontSize: number,
  videoCssW: number,
  videoCssH: number,
  playResW: number,
  playResH: number,
): number {
  const scaleY = videoCssH / playResH;
  const fromPlayRes = playResFontSize * scaleY;
  const nChars = Math.max(text.length, 1);
  const maxByWidth = (videoCssW * 0.70) / (nChars * 0.62);
  const maxByHeight = videoCssH * 0.065;
  return Math.min(fromPlayRes, maxByWidth, maxByHeight);
}
