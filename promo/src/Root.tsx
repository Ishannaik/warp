import type { FC } from "react";
import { Composition } from "remotion";
import { WarpPromo, WarpPromoWide } from "./WarpPromo";

export const RemotionRoot: FC = () => {
  return (
    <>
      {/* Square — X / Instagram / Discord */}
      <Composition
        id="WarpPromo"
        component={WarpPromo}
        durationInFrames={780}
        fps={30}
        width={1080}
        height={1080}
      />
      {/* 16:9 — YouTube / Show HN (square stage centered in a widescreen frame) */}
      <Composition
        id="WarpPromoWide"
        component={WarpPromoWide}
        durationInFrames={780}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
