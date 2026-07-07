import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("全局样式架构", () => {
  it("补齐 shadcn 浮层与表面 token，避免 Popover/ContextMenu 等浮层透明", () => {
    const stylesSource = readFileSync(resolve(__dirname, "styles.css"), "utf8");
    const tailwindSource = readFileSync(resolve(__dirname, "../tailwind.config.ts"), "utf8");

    [
      "--popover: 0 0% 100%",
      "--popover-foreground: 240 10% 10%",
      "--card: 0 0% 100%",
      "--card-foreground: 240 10% 10%",
      "--accent: 240 5% 96%",
      "--accent-foreground: 240 10% 10%",
      "--secondary: 240 5% 96%",
      "--secondary-foreground: 240 10% 10%",
      "--input: 240 6% 90%",
    ].forEach((token) => expect(stylesSource).toContain(token));

    [
      'popover: "hsl(var(--popover))"',
      '"popover-foreground": "hsl(var(--popover-foreground))"',
      'card: "hsl(var(--card))"',
      '"card-foreground": "hsl(var(--card-foreground))"',
      'accent: "hsl(var(--accent))"',
      '"accent-foreground": "hsl(var(--accent-foreground))"',
      'secondary: "hsl(var(--secondary))"',
      '"secondary-foreground": "hsl(var(--secondary-foreground))"',
      'input: "hsl(var(--input))"',
    ].forEach((token) => expect(tailwindSource).toContain(token));
  });

  it("定义统一动效 token 并支持 reduced-motion 降级", () => {
    const source = readFileSync(resolve(__dirname, "styles.css"), "utf8");

    expect(source).toContain("--duration-fast: 120ms");
    expect(source).toContain("--duration-base: 180ms");
    expect(source).toContain("--duration-slow: 240ms");
    expect(source).toContain("--ease-out: cubic-bezier(0.16, 1, 0.3, 1)");
    expect(source).toContain("--ease-in: cubic-bezier(0.7, 0, 0.84, 0)");
    expect(source).toContain("@media (prefers-reduced-motion: reduce)");
    expect(source).toContain("animation-duration: 0.01ms");
    expect(source).toContain("scroll-behavior: auto");
  });

  it("接入 tailwindcss-animate，浮层基础组件使用 Radix data-state 进出场动画", () => {
    const packageSource = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const tailwindSource = readFileSync(resolve(__dirname, "../tailwind.config.ts"), "utf8");
    const dialogSource = readFileSync(resolve(__dirname, "components/ui/Dialog.tsx"), "utf8");
    const alertDialogSource = readFileSync(resolve(__dirname, "components/ui/AlertDialog.tsx"), "utf8");
    const sheetSource = readFileSync(resolve(__dirname, "components/ui/Sheet.tsx"), "utf8");
    const popoverSource = readFileSync(resolve(__dirname, "components/ui/Popover.tsx"), "utf8");
    const contextMenuSource = readFileSync(resolve(__dirname, "components/ui/ContextMenu.tsx"), "utf8");
    const tooltipSource = readFileSync(resolve(__dirname, "components/ui/Tooltip.tsx"), "utf8");

    expect(packageSource).toContain('"tailwindcss-animate"');
    expect(tailwindSource).toContain('from "tailwindcss-animate"');
    expect(tailwindSource).toContain("tailwindcssAnimate");

    for (const source of [dialogSource, alertDialogSource]) {
      expect(source).toContain("data-[state=open]:animate-in");
      expect(source).toContain("data-[state=closed]:animate-out");
      expect(source).toContain("data-[state=open]:fade-in-0");
      expect(source).toContain("data-[state=closed]:fade-out-0");
      expect(source).toContain("data-[state=open]:zoom-in-95");
    }

    expect(sheetSource).toContain("data-[state=open]:slide-in-from-right");
    expect(sheetSource).toContain("data-[state=closed]:slide-out-to-right");

    for (const source of [popoverSource, contextMenuSource, tooltipSource]) {
      expect(source).toContain("data-[state=open]:animate-in");
      expect(source).toContain("data-[state=closed]:animate-out");
      expect(source).toContain("data-[state=open]:fade-in-0");
      expect(source).toContain("data-[state=open]:zoom-in-95");
    }
  });
});
