import type { FC } from "react";
import { Composition } from "remotion";
import { WarpPromo } from "./WarpPromo";

export const RemotionRoot: FC = () => {
  return (
    <Composition
      id="WarpPromo"
      component={WarpPromo}
      durationInFrames={780}
      fps={30}
      width={1080}
      height={1080}
    />
  );
};
