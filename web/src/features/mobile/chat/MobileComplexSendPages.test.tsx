import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileVideoSendPage } from "./MobileVideoSendPage";
import { MobileLinkSendPage } from "./MobileLinkSendPage";
import { MobileHtmlSendPage } from "./MobileHtmlSendPage";

describe("移动端复杂发送页面", () => {
  it("视频页选择视频和可选封面后发送，并可返回", () => {
    const onDraftChange = vi.fn();
    const onSend = vi.fn();
    const onBack = vi.fn();
    render(<MobileVideoSendPage draft={{ file: null, thumbFile: null }} sending={false} error={null} onDraftChange={onDraftChange} onSend={onSend} onBack={onBack} />);
    fireEvent.change(screen.getByLabelText("上传视频文件"), { target: { files: [new File(["v"], "demo.mp4", { type: "video/mp4" })] } });
    fireEvent.change(screen.getByLabelText("上传视频封面图"), { target: { files: [new File(["c"], "cover.jpg", { type: "image/jpeg" })] } });
    expect(onDraftChange).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "发送视频" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "返回" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("链接页支持 URL 解析及标题、描述、缩略图，并保留发送错误", () => {
    const onDraftChange = vi.fn();
    const onParse = vi.fn();
    const onSend = vi.fn();
    render(<MobileLinkSendPage draft={{ title: "标题", desc: "描述", linkUrl: "https://example.com", thumbUrl: "https://example.com/a.jpg", thumbFile: null }} sending={false} parsing={false} error="发送失败" onDraftChange={onDraftChange} onParse={onParse} onSend={onSend} onBack={vi.fn()} />);
    expect(screen.getByDisplayValue("标题")).toBeInTheDocument();
    expect(screen.getByDisplayValue("描述")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://example.com/a.jpg")).toBeInTheDocument();
    expect(screen.getByText("发送失败")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "解析链接" }));
    fireEvent.click(screen.getByRole("button", { name: "发送链接" }));
    expect(onParse).toHaveBeenCalledOnce();
    expect(onSend).toHaveBeenCalledOnce();
  });

  it("HTML 页支持内容、文件、URL 三种现有来源", () => {
    const onDraftChange = vi.fn();
    const { rerender } = render(<MobileHtmlSendPage draft={{ source: "content", title: "", desc: "", linkUrl: "", thumbUrl: "", htmlContent: "<p>日报</p>", file: null }} sending={false} error={null} onDraftChange={onDraftChange} onSend={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByLabelText("HTML 内容")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "文件" }));
    expect(onDraftChange).toHaveBeenCalledWith(expect.any(Function));
    rerender(<MobileHtmlSendPage draft={{ source: "file", title: "", desc: "", linkUrl: "", thumbUrl: "", htmlContent: "", file: null }} sending={false} error={null} onDraftChange={onDraftChange} onSend={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByLabelText("上传 HTML 文件")).toBeInTheDocument();
    rerender(<MobileHtmlSendPage draft={{ source: "url", title: "", desc: "", linkUrl: "https://example.com/report.html", thumbUrl: "", htmlContent: "", file: null }} sending={false} error={null} onDraftChange={onDraftChange} onSend={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByLabelText("HTML 地址")).toBeInTheDocument();
    expect(screen.getByLabelText("HTML 标题")).toBeInTheDocument();
    expect(screen.getByLabelText("HTML 描述")).toBeInTheDocument();
    expect(screen.getByLabelText("HTML 缩略图 URL")).toBeInTheDocument();
  });
});
