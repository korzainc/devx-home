/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDebouncedValue } from "@/lib/use-debounced-value";

afterEach(cleanup);

describe("useDebouncedValue", () => {
  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("first"));
    expect(result.current).toBe("first");
  });

  it("reflects a value change only after the delay", () => {
    vi.useFakeTimers();
    try {
      const { result, rerender } = renderHook(
        ({ value }) => useDebouncedValue(value),
        { initialProps: { value: "first" } },
      );

      rerender({ value: "second" });
      expect(result.current).toBe("first");

      act(() => {
        vi.advanceTimersByTime(499);
      });
      expect(result.current).toBe("first");

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current).toBe("second");
    } finally {
      vi.useRealTimers();
    }
  });

  it("settles on the last value of rapid changes, not an intermediate one", () => {
    vi.useFakeTimers();
    try {
      const { result, rerender } = renderHook(
        ({ value }) => useDebouncedValue(value),
        { initialProps: { value: "a" } },
      );

      rerender({ value: "b" });
      act(() => {
        vi.advanceTimersByTime(200);
      });
      rerender({ value: "c" });
      act(() => {
        vi.advanceTimersByTime(200);
      });
      rerender({ value: "d" });
      expect(result.current).toBe("a");

      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(result.current).toBe("d");
    } finally {
      vi.useRealTimers();
    }
  });

  it("respects a custom delay", () => {
    vi.useFakeTimers();
    try {
      const { result, rerender } = renderHook(
        ({ value }) => useDebouncedValue(value, 100),
        { initialProps: { value: "x" } },
      );

      rerender({ value: "y" });
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(result.current).toBe("y");
    } finally {
      vi.useRealTimers();
    }
  });
});
