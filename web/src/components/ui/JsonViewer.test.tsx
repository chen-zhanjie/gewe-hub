import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JsonViewer } from "./JsonViewer";

describe("JsonViewer", () => {
  it("默认展开两层并支持展开全部、折叠全部", () => {
    render(
      <JsonViewer
        title="标准 JSON"
        value={{
          message: {
            payload: {
              text: "hello",
              metadata: {
                source: "callback",
              },
            },
          },
        }}
      />,
    );

    expect(screen.getByText("payload")).toBeInTheDocument();
    expect(screen.queryByText("text")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "展开全部" }));
    expect(screen.getByText("text")).toBeInTheDocument();
    expect(screen.getByText('"hello"')).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "折叠全部" }));
    expect(screen.queryByText("payload")).not.toBeInTheDocument();
    expect(screen.getByText("message")).toBeInTheDocument();
  });

  it("支持按键名搜索并保留命中路径", () => {
    render(
      <JsonViewer
        title="原始 payload"
        value={{
          MsgId: "123",
          Data: {
            Content: "hello",
            Nested: {
              ContentType: "text",
            },
          },
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText("搜索 JSON 键名"), { target: { value: "content" } });

    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(screen.getByText("ContentType")).toBeInTheDocument();
    expect(screen.queryByText("MsgId")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("json-viewer-row-highlight")).toHaveLength(2);
  });

  it("可以复制单行路径和完整 JSON", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <JsonViewer
        title="投递 payload"
        value={{
          payload: {
            items: [{ text: "hello" }],
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "展开全部" }));
    const textRow = screen.getByTestId("json-viewer-row-$.payload.items[0].text");
    fireEvent.click(within(textRow).getByRole("button", { name: "复制路径 $.payload.items[0].text" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("$.payload.items[0].text"));

    fireEvent.click(screen.getByRole("button", { name: "复制投递 payload" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"items"')));
  });

  it("复制路径时特殊 key 使用 bracket 形式且不插入多余点号", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <JsonViewer
        title="原始 payload"
        value={{
          payload: {
            "bad-key": [{ "x y": 1 }],
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "展开全部" }));
    const valueRow = screen.getByTestId('json-viewer-row-$.payload["bad-key"][0]["x y"]');
    fireEvent.click(within(valueRow).getByRole("button", { name: '复制路径 $.payload["bad-key"][0]["x y"]' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('$.payload["bad-key"][0]["x y"]'));
  });
});
