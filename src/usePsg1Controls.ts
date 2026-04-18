import { useEffect } from "react";

interface UsePsg1ControlsOptions {
  enabled?: boolean;
  onBack?: () => void;
  onMenu?: () => void;
  onNextTab?: () => void;
  onPreviousTab?: () => void;
}

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[href]",
  "[data-psg1-focusable='true']",
].join(", ");

const DEAD_ZONE = 0.5;
const REPEAT_DELAY_MS = 180;

const BUTTON = {
  a: 0,
  b: 1,
  l1: 4,
  r1: 5,
  select: 8,
  start: 9,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
} as const;

type Direction = "up" | "down" | "left" | "right";

function getFocusableElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => {
      if (element.hidden) return false;
      if (element.getAttribute("aria-hidden") === "true") return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
}

function getElementCenter(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function focusElement(element: HTMLElement | null) {
  if (!element) return;
  element.focus({ preventScroll: false });
  element.classList.add("psg1-focus");
  window.setTimeout(() => element.classList.remove("psg1-focus"), 180);
}

function findNextElement(current: HTMLElement, direction: Direction, elements: HTMLElement[]): HTMLElement | null {
  const currentCenter = getElementCenter(current);
  const candidates = elements
    .filter((candidate) => candidate !== current)
    .map((candidate) => {
      const center = getElementCenter(candidate);
      const dx = center.x - currentCenter.x;
      const dy = center.y - currentCenter.y;
      const movingForward = (
        (direction === "up" && dy < -6) ||
        (direction === "down" && dy > 6) ||
        (direction === "left" && dx < -6) ||
        (direction === "right" && dx > 6)
      );

      if (!movingForward) return null;

      const primaryDistance = direction === "up" || direction === "down"
        ? Math.abs(dy)
        : Math.abs(dx);
      const secondaryDistance = direction === "up" || direction === "down"
        ? Math.abs(dx)
        : Math.abs(dy);

      return {
        candidate,
        score: primaryDistance * 4 + secondaryDistance,
      };
    })
    .filter((value): value is { candidate: HTMLElement; score: number } => value !== null)
    .sort((a, b) => a.score - b.score);

  return candidates[0]?.candidate ?? null;
}

function activateElement(element: HTMLElement | null) {
  if (!element) return;

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    element.focus();
    return;
  }

  element.click();
}

export function usePsg1Controls({
  enabled = true,
  onBack,
  onMenu,
  onNextTab,
  onPreviousTab,
}: UsePsg1ControlsOptions) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof navigator === "undefined") return;

    const pressed = new Map<string, number>();
    let frameId = 0;

    const triggerOnce = (key: string, active: boolean, fn: () => void) => {
      const now = performance.now();
      const lastTime = pressed.get(key) ?? 0;
      if (!active) {
        pressed.delete(key);
        return;
      }
      if (lastTime && now - lastTime < REPEAT_DELAY_MS) return;
      pressed.set(key, now);
      fn();
    };

    const moveFocus = (direction: Direction) => {
      const elements = getFocusableElements();
      if (elements.length === 0) return;

      const activeElement = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

      if (!activeElement || !elements.includes(activeElement)) {
        focusElement(elements[0]);
        return;
      }

      const next = findNextElement(activeElement, direction, elements);
      focusElement(next ?? activeElement);
    };

    const tick = () => {
      const pads = navigator.getGamepads?.() ?? [];
      const pad = Array.from(pads).find((entry) => entry?.connected);
      if (pad) {
        const leftX = pad.axes[0] ?? 0;
        const leftY = pad.axes[1] ?? 0;
        const buttons = pad.buttons ?? [];

        triggerOnce("move-up", buttons[BUTTON.dpadUp]?.pressed || leftY < -DEAD_ZONE, () => moveFocus("up"));
        triggerOnce("move-down", buttons[BUTTON.dpadDown]?.pressed || leftY > DEAD_ZONE, () => moveFocus("down"));
        triggerOnce("move-left", buttons[BUTTON.dpadLeft]?.pressed || leftX < -DEAD_ZONE, () => moveFocus("left"));
        triggerOnce("move-right", buttons[BUTTON.dpadRight]?.pressed || leftX > DEAD_ZONE, () => moveFocus("right"));
        triggerOnce("activate", buttons[BUTTON.a]?.pressed ?? false, () => {
          const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          activateElement(activeElement);
        });
        triggerOnce("back", buttons[BUTTON.b]?.pressed ?? false, () => onBack?.());
        triggerOnce("menu", (buttons[BUTTON.start]?.pressed ?? false) || (buttons[BUTTON.select]?.pressed ?? false), () => onMenu?.());
        triggerOnce("previous-tab", buttons[BUTTON.l1]?.pressed ?? false, () => onPreviousTab?.());
        triggerOnce("next-tab", buttons[BUTTON.r1]?.pressed ?? false, () => onNextTab?.());
      } else {
        pressed.clear();
      }

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [enabled, onBack, onMenu, onNextTab, onPreviousTab]);
}
