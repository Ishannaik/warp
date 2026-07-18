import type { FC } from "react";
import { AbsoluteFill, Audio, Series, interpolate, staticFile, useCurrentFrame } from "remotion";
import { loadFont as loadBricolage } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as loadArchivo } from "@remotion/google-fonts/Archivo";
import { loadFont as loadJetBrains } from "@remotion/google-fonts/JetBrainsMono";
import { BG, INK } from "./shared/theme";
import Crosshairs from "./shared/Crosshairs";
import S1LogoOpen from "./scenes/S1LogoOpen";
import S2Drop from "./scenes/S2Drop";
import S3ShareQr from "./scenes/S3ShareQr";
import S4Direct from "./scenes/S4Direct";
import S5NeverDies from "./scenes/S5NeverDies";
import S6Cta from "./scenes/S6Cta";

const { fontFamily: bricolageFamily } = loadBricolage("normal", { weights: ["700", "800"] });
const { fontFamily: archivoFamily } = loadArchivo("normal", { weights: ["400", "500"] });
const { fontFamily: jetbrainsFamily } = loadJetBrains("normal", { weights: ["400", "600"] });

// Music volume as a frame function (global timeline, frames 0-779):
// fade in 0-15, hold 0.85, duck to 0.45 across the S5 reconnect stretch
// (520-556), pop back to 0.85 on the resume flash, fade out 735-779.
function musicVolume(frame: number): number {
  const fadeIn = interpolate(frame, [0, 15], [0, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const duckDown = interpolate(frame, [512, 520], [0.85, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const duckUp = interpolate(frame, [556, 564], [0.45, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [735, 779], [0.85, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  let v = Math.min(fadeIn, 0.85);
  if (frame >= 512 && frame < 520) v = duckDown;
  else if (frame >= 520 && frame < 556) v = 0.45;
  else if (frame >= 556 && frame < 564) v = duckUp;
  else if (frame >= 15) v = 0.85;
  if (frame >= 735) v = Math.min(v, fadeOut);
  return Math.max(0, v);
}

// 16:9 landscape variant (YouTube / Show HN): the scenes are laid out for a
// 1080x1080 stage (S4's device row + SVG are anchored to that width), so rather
// than restretch every scene we center the square stage inside a 1920x1080
// frame and let the brand bg fill the sides — reads as a deliberately framed
// widescreen card, same content, zero per-scene reflow.
export const WarpPromoWide: FC = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div style={{ position: "relative", width: 1080, height: 1080, overflow: "hidden" }}>
        <WarpPromo />
      </div>
    </AbsoluteFill>
  );
};

export const WarpPromo: FC = () => {
  const frame = useCurrentFrame();
  const crosshairOpacity = interpolate(frame, [0, 20], [0, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        color: INK,
        fontFamily: `${bricolageFamily}, ${archivoFamily}, ${jetbrainsFamily}, sans-serif`,
      }}
    >
      <Audio src={staticFile("music.mp3")} volume={musicVolume} startFrom={0} />
      <Crosshairs opacity={crosshairOpacity} />
      <Series>
        <Series.Sequence durationInFrames={75}>
          <S1LogoOpen />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120} offset={-8}>
          <S2Drop />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <S3ShareQr />
        </Series.Sequence>
        <Series.Sequence durationInFrames={150}>
          <S4Direct />
        </Series.Sequence>
        <Series.Sequence durationInFrames={180} offset={-8}>
          <S5NeverDies />
        </Series.Sequence>
        <Series.Sequence durationInFrames={151}>
          <S6Cta durationInFrames={151} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
