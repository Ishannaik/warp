import Hero from "./hero/Hero";
import HowItWorks from "./sections/HowItWorks";
import Architecture from "./sections/Architecture";
import Stats from "./sections/Stats";
import Features from "./sections/Features";
import Compare from "./sections/Compare";
import Faq from "./sections/Faq";
import FooterCta from "./sections/FooterCta";

export default function Landing() {
  return (
    <div>
      <Hero />
      <HowItWorks />
      <Architecture />
      <Stats />
      <Features />
      <Compare />
      <Faq />
      <FooterCta />
    </div>
  );
}
