import { useEffect, useRef } from "react";

export function useResetOnBfcache(reset: () => void): void {
  const savedReset = useRef(reset);
  useEffect(() => { savedReset.current = reset; });

  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) savedReset.current();
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);
}
