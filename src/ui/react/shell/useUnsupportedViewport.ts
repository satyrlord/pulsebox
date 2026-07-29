import { useEffect, useState } from "react";

export const MINIMUM_VIEWPORT_WIDTH = 1_280;
export const MINIMUM_VIEWPORT_HEIGHT = 720;

function viewportIsUnsupported(): boolean {
  return window.innerWidth < MINIMUM_VIEWPORT_WIDTH || window.innerHeight < MINIMUM_VIEWPORT_HEIGHT;
}

export function useUnsupportedViewport(): boolean {
  const [tooSmall, setTooSmall] = useState(viewportIsUnsupported);

  useEffect(() => {
    const check = () => {
      setTooSmall(viewportIsUnsupported());
    };
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("resize", check);
    };
  }, []);

  return tooSmall;
}
