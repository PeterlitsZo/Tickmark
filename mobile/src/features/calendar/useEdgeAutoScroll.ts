import Animated, {
  scrollTo,
  useFrameCallback,
  type AnimatedRef,
  type SharedValue,
} from "react-native-reanimated";
import { clamp } from "./timelineGeometry";

export function useEdgeAutoScroll({
  active,
  pointerY,
  viewportHeight,
  scrollY,
  contentHeight,
  scrollRef,
  onScroll,
}: {
  active: SharedValue<boolean>;
  pointerY: SharedValue<number>;
  viewportHeight: SharedValue<number>;
  scrollY: SharedValue<number>;
  contentHeight: number;
  scrollRef: AnimatedRef<Animated.ScrollView>;
  onScroll: () => void;
}) {
  useFrameCallback((frame) => {
    if (!active.value || viewportHeight.value <= 0) return;
    const edge = 58;
    const speed =
      pointerY.value < edge
        ? -Math.min(1, (edge - pointerY.value) / edge)
        : pointerY.value > viewportHeight.value - edge
          ? Math.min(1, (pointerY.value - viewportHeight.value + edge) / edge)
          : 0;
    if (!speed) return;
    const next = clamp(
      scrollY.value +
        speed * Math.min(frame.timeSincePreviousFrame ?? 16, 32) * 0.45,
      0,
      Math.max(0, contentHeight - viewportHeight.value),
    );
    if (next !== scrollY.value) {
      scrollY.set(next);
      scrollTo(scrollRef, 0, next, false);
      onScroll();
    }
  });
}
