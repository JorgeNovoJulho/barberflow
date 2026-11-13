"use client";
import ClickSpark from "./ClickSpark";

export function SocialSparks({ children }) {
  return <ClickSpark sparkColor="#fff" shape="line" sparkCount={8} sparkSize={14} sparkRadius={30} duration={500}>
    {children}
  </ClickSpark>;
}
