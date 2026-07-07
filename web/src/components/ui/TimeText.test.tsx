import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimeText } from "./TimeText";

describe("TimeText", () => {
  it("今天的时间显示 HH:mm，并把完整时间放在 title 中", () => {
    vi.setSystemTime(new Date("2026-07-07T10:30:00+08:00"));

    render(<TimeText value="2026-07-07T09:05:00+08:00" />);

    const time = screen.getByText("09:05");
    expect(time).toHaveAttribute("title", "2026-07-07 09:05:00");
    expect(time).toHaveClass("tabular-nums");

    vi.useRealTimers();
  });

  it("今年但不是今天的时间显示 MM-DD HH:mm", () => {
    vi.setSystemTime(new Date("2026-07-07T10:30:00+08:00"));

    render(<TimeText value="2026-06-30T18:12:00+08:00" />);

    expect(screen.getByText("06-30 18:12")).toBeInTheDocument();

    vi.useRealTimers();
  });
});
