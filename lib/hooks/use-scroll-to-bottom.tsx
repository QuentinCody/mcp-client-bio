import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

type ScrollBehaviorOption = "auto" | "smooth" | "instant";

type ScrollContainerRef = RefObject<HTMLDivElement | null>;

const PIN_THRESHOLD_PX = 80;

export function useScrollToBottom(): [
  ScrollContainerRef,
  ScrollContainerRef,
  boolean,
  (behavior?: ScrollBehaviorOption) => void
] {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const [isPinned, setIsPinned] = useState(true);

  const isProgrammaticRef = useRef(false);
  const isAtBottomRef = useRef(true);

  const setPinnedState = useCallback((value: boolean) => {
    isAtBottomRef.current = value;
    setIsPinned((prev) => (prev === value ? prev : value));
  }, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehaviorOption = "smooth") => {
      const container = containerRef.current;
      const sentinel = endRef.current;
      if (!container || !sentinel) return;

      isProgrammaticRef.current = true;

      if (behavior === "instant") {
        container.scrollTop = container.scrollHeight - container.clientHeight;
      } else {
        sentinel.scrollIntoView({ behavior, block: "end" });
      }

      requestAnimationFrame(() => {
        isProgrammaticRef.current = false;
        setPinnedState(true);
      });
    },
    [setPinnedState]
  );

  const evaluatePinned = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distance = scrollHeight - scrollTop - clientHeight;
    setPinnedState(distance <= PIN_THRESHOLD_PX);
  }, [setPinnedState]);

  useEffect(() => {
    const container = containerRef.current;
    const sentinel = endRef.current;
    if (!container || !sentinel) return;

    const initial = window.setTimeout(() => {
      scrollToBottom("instant");
    }, 80);

    const handleScroll = () => {
      if (isProgrammaticRef.current) return;
      evaluatePinned();
    };

    container.addEventListener("scroll", handleScroll, { passive: true });

    let intersectionTimeoutId: number | null = null;
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        
        // Debounce intersection updates to prevent state thrashing during streaming
        if (intersectionTimeoutId !== null) {
          window.clearTimeout(intersectionTimeoutId);
        }
        
        intersectionTimeoutId = window.setTimeout(() => {
          setPinnedState(entry.isIntersecting ?? false);
          intersectionTimeoutId = null;
        }, 50);
      },
      { root: container, threshold: 1 }
    );

    intersectionObserver.observe(sentinel);

    let mutationTimeoutId: number | null = null;
    const mutationObserver = new MutationObserver((mutations) => {
      if (!isAtBottomRef.current || isProgrammaticRef.current) return;

      const hasContentChange = mutations.some(
        (mutation) => mutation.type === "childList" || mutation.type === "characterData"
      );

      if (!hasContentChange) return;

      // Debounce mutations and use instant scroll to prevent jitter during streaming
      if (mutationTimeoutId !== null) {
        window.cancelAnimationFrame(mutationTimeoutId);
      }
      
      mutationTimeoutId = requestAnimationFrame(() => {
        // Use instant scroll during rapid updates to prevent smooth scroll conflicts
        scrollToBottom("instant");
        mutationTimeoutId = null;
      });
    });

    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    let resizeObserver: ResizeObserver | null = null;
    let resizeTimeoutId: number | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        if (!isAtBottomRef.current || isProgrammaticRef.current) return;
        
        // Debounce resize events to prevent scroll fighting with mutation observer
        if (resizeTimeoutId !== null) {
          window.clearTimeout(resizeTimeoutId);
        }
        
        resizeTimeoutId = window.setTimeout(() => {
          scrollToBottom("instant");
          resizeTimeoutId = null;
        }, 16); // ~1 frame delay
      });

      resizeObserver.observe(container);
    }

    return () => {
      window.clearTimeout(initial);
      if (mutationTimeoutId !== null) {
        window.cancelAnimationFrame(mutationTimeoutId);
      }
      if (resizeTimeoutId !== null) {
        window.clearTimeout(resizeTimeoutId);
      }
      if (intersectionTimeoutId !== null) {
        window.clearTimeout(intersectionTimeoutId);
      }
      container.removeEventListener("scroll", handleScroll);
      intersectionObserver.disconnect();
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
    };
  }, [evaluatePinned, scrollToBottom, setPinnedState]);

  useEffect(() => {
    evaluatePinned();
  }, [evaluatePinned]);

  return [containerRef, endRef, isPinned, scrollToBottom];
}
