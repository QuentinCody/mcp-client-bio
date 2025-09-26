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

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        setPinnedState(entry.isIntersecting ?? false);
      },
      { root: container, threshold: 1 }
    );

    intersectionObserver.observe(sentinel);

    const mutationObserver = new MutationObserver((mutations) => {
      if (!isAtBottomRef.current || isProgrammaticRef.current) return;

      const hasContentChange = mutations.some(
        (mutation) => mutation.type === "childList" || mutation.type === "characterData"
      );

      if (!hasContentChange) return;

      requestAnimationFrame(() => {
        scrollToBottom("smooth");
      });
    });

    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        if (!isAtBottomRef.current || isProgrammaticRef.current) return;
        scrollToBottom("auto");
      });

      resizeObserver.observe(container);
    }

    return () => {
      window.clearTimeout(initial);
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
