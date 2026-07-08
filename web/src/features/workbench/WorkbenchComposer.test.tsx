import { fireEvent, screen, waitFor } from "@testing-library/react";
import { within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, renderWorkbenchPage } from "./WorkbenchPage.test-utils";

describe("WorkbenchPage composer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("选择语音文件后以 base64 和音频时长提交 voice 发送请求", async () => {
    const fetchMock = mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_bot",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ],
      "/api/conversations": [
        {
          id: "conv_1",
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "旧消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [],
      "/api/send": { id: "send_voice", status: "pending" },
    });
    const createObjectUrl = vi.fn(() => "blob:voice");
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    });
    const originalCreateElement = document.createElement.bind(document);
    const createElement = vi.spyOn(document, "createElement");
    createElement.mockImplementation((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === "audio") {
        Object.defineProperty(element, "duration", { value: 2.6, configurable: true });
        setTimeout(() => element.dispatchEvent(new Event("loadedmetadata")), 0);
      }
      return element;
    });

    renderWorkbenchPage();

    await screen.findByText("客服主号");
    const voiceInput = screen.getByLabelText("语音文件上传输入") as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "recording.webm", { type: "audio/webm" });
    fireEvent.change(voiceInput, { target: { files: [file] } });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/send",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            conversationId: "conv_1",
            type: "voice",
            contentBase64: "AQID",
            mimeType: "audio/webm",
            fileName: "recording.webm",
            durationMs: 2600
          }),
          credentials: "include",
        }),
      ),
    );
    expect(createObjectUrl).toHaveBeenCalledWith(file);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:voice");
    createElement.mockRestore();
  });

  it("语音按钮直接打开麦克风录制，停止后提交 voice 发送请求", async () => {
    const fetchMock = mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_bot",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ],
      "/api/conversations": [
        {
          id: "conv_1",
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "旧消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [],
      "/api/send": { id: "send_recorded_voice", status: "pending" },
    });
    const trackStop = vi.fn();
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: trackStop }] }) as unknown as MediaStream);
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia },
    });

    const recorders: FakeMediaRecorder[] = [];
    class FakeMediaRecorder extends EventTarget {
      static isTypeSupported = vi.fn((type: string) => type === "audio/webm");

      mimeType: string;
      state: RecordingState = "inactive";

      constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
        super();
        this.mimeType = options?.mimeType ?? "";
        recorders.push(this);
      }

      start() {
        this.state = "recording";
      }

      stop() {
        this.state = "inactive";
        const dataEvent = new Event("dataavailable") as Event & { data: Blob };
        Object.defineProperty(dataEvent, "data", {
          value: new Blob([new Uint8Array([4, 5, 6])], { type: this.mimeType || "audio/webm" }),
        });
        this.dispatchEvent(dataEvent);
        this.dispatchEvent(new Event("stop"));
      }
    }
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);

    renderWorkbenchPage();

    await screen.findByText("客服主号");
    const voiceInput = screen.getByLabelText("语音文件上传输入") as HTMLInputElement;
    const voiceInputClick = vi.spyOn(voiceInput, "click");
    expect(screen.getByRole("button", { name: "语音发送方式" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开启麦克风录制语音" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导入语音文件" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "开启麦克风录制语音" }));

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ audio: true }));
    expect(voiceInputClick).not.toHaveBeenCalled();
    expect(recorders[0]?.state).toBe("recording");

    fireEvent.click(await screen.findByRole("button", { name: "停止录制并发送语音" }));

    await waitFor(() => {
      const sendCall = fetchMock.mock.calls.find(([input]) => String(input).replace("http://localhost", "") === "/api/send");
      expect(sendCall).toBeTruthy();
      const [, init] = sendCall!;
      expect(init).toEqual(
        expect.objectContaining({
          method: "POST",
          credentials: "include",
        }),
      );
      expect(JSON.parse(String(init?.body))).toEqual({
        conversationId: "conv_1",
        type: "voice",
        contentBase64: "BAUG",
        mimeType: "audio/webm",
        fileName: "recording.webm",
        durationMs: expect.any(Number),
      });
    });
    expect(trackStop).toHaveBeenCalled();
  });

  it("语音文件作为语音发送选项里的备用入口", async () => {
    mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_bot",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ],
      "/api/conversations": [
        {
          id: "conv_1",
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "旧消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [],
    });

    renderWorkbenchPage();

    await screen.findByText("客服主号");
    const voiceInput = screen.getByLabelText("语音文件上传输入") as HTMLInputElement;
    const voiceInputClick = vi.spyOn(voiceInput, "click");
    expect(screen.getByRole("button", { name: "开启麦克风录制语音" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导入语音文件" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "语音发送方式" }));
    fireEvent.click(await screen.findByRole("button", { name: "导入语音文件" }));

    expect(voiceInputClick).toHaveBeenCalledTimes(1);
  });

  it("选择图片文件后以 base64 提交 image 发送请求", async () => {
    const fetchMock = mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_bot",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ],
      "/api/conversations": [
        {
          id: "conv_1",
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "旧消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [],
      "/api/send": { id: "send_image", status: "pending" },
    });

    renderWorkbenchPage();

    await screen.findByText("客服主号");
    const imageInput = screen.getByLabelText("选择图片文件") as HTMLInputElement;
    const file = new File([new Uint8Array([137, 80, 78, 71])], "screenshot.png", { type: "image/png" });
    fireEvent.change(imageInput, { target: { files: [file] } });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/send",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            conversationId: "conv_1",
            type: "image",
            contentBase64: "iVBORw==",
            mimeType: "image/png",
            fileName: "screenshot.png",
          }),
          credentials: "include",
        }),
      ),
    );
  });

  it("选择普通文件后以 base64 提交 file 发送请求", async () => {
    const fetchMock = mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_bot",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ],
      "/api/conversations": [
        {
          id: "conv_1",
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "旧消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [],
      "/api/send": { id: "send_file", status: "pending" },
    });

    renderWorkbenchPage();

    await screen.findByText("客服主号");
    const fileInput = screen.getByLabelText("选择文件") as HTMLInputElement;
    const file = new File([new Uint8Array([72, 101, 108, 108, 111])], "note.txt", { type: "text/plain" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/send",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            conversationId: "conv_1",
            type: "file",
            contentBase64: "SGVsbG8=",
            mimeType: "text/plain",
            fileName: "note.txt",
          }),
          credentials: "include",
        }),
      ),
    );
  });

  it("粘贴图片时先进入待发送附件条，可删除或确认发送", async () => {
    const fetchMock = mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_bot",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ],
      "/api/conversations": [
        {
          id: "conv_1",
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "旧消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [],
      "/api/send": { id: "send_pasted_image", status: "pending" },
    });

    renderWorkbenchPage();

    const input = await screen.findByPlaceholderText("输入消息，Enter 发送，Shift+Enter 换行");
    await screen.findByText("客服主号");
    const file = new File([new Uint8Array([137, 80, 78, 71])], "pasted.png", { type: "image/png" });
    fireEvent.paste(input, {
      clipboardData: {
        files: [],
        items: [{ kind: "file", getAsFile: () => file }],
      },
    });

    expect(await screen.findByText("待发送附件")).toBeInTheDocument();
    expect(screen.getByText("pasted.png")).toBeInTheDocument();
    expect(screen.getByText("4 B")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "删除附件 pasted.png" }));
    expect(screen.queryByText("pasted.png")).not.toBeInTheDocument();

    fireEvent.paste(input, {
      clipboardData: {
        files: [],
        items: [{ kind: "file", getAsFile: () => file }],
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: "发送附件" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/send",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            conversationId: "conv_1",
            type: "image",
            contentBase64: "iVBORw==",
            mimeType: "image/png",
            fileName: "pasted.png",
          }),
          credentials: "include",
        }),
      ),
    );
    expect(screen.queryByText("pasted.png")).not.toBeInTheDocument();
  });

  it("拖拽文件到消息区时显示投放层，松开后进入待发送附件条", async () => {
    mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_bot",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ],
      "/api/conversations": [
        {
          id: "conv_1",
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "旧消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [],
    });

    renderWorkbenchPage();

    await screen.findByText("客服主号");
    const messageRegion = screen.getByLabelText("消息区");
    const file = new File([new Uint8Array([72, 101, 108, 108, 111])], "drag-note.txt", { type: "text/plain" });
    fireEvent.dragEnter(messageRegion, {
      dataTransfer: {
        files: [file],
      },
    });

    expect(screen.getByText("松开发送给 陈可乐")).toBeInTheDocument();
    fireEvent.drop(messageRegion, {
      dataTransfer: {
        files: [file],
      },
    });

    expect(await screen.findByText("待发送附件")).toBeInTheDocument();
    expect(screen.getByText("drag-note.txt")).toBeInTheDocument();
    expect(screen.getByText("5 B")).toBeInTheDocument();
    expect(screen.queryByText("松开发送给 陈可乐")).not.toBeInTheDocument();
  });

  it("视频按钮打开表单，上传视频和封面图片后提交 video 发送请求", async () => {
    const fetchMock = mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_bot",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ],
      "/api/conversations": [
        {
          id: "conv_1",
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "旧消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [],
      "/api/send": { id: "send_video", status: "pending" },
    });
    const createObjectUrl = vi.fn(() => "blob:video");
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    });
    const originalCreateElement = document.createElement.bind(document);
    const createElement = vi.spyOn(document, "createElement");
    createElement.mockImplementation((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === "video") {
        Object.defineProperty(element, "duration", { value: 10.4, configurable: true });
        setTimeout(() => element.dispatchEvent(new Event("loadedmetadata")), 0);
      }
      return element;
    });

    renderWorkbenchPage();

    await screen.findByText("客服主号");
    fireEvent.click(screen.getByRole("button", { name: "视频" }));
    const dialog = await screen.findByRole("dialog", { name: "发送视频" });
    const videoInput = within(dialog).getByLabelText("上传视频文件") as HTMLInputElement;
    const coverInput = within(dialog).getByLabelText("上传视频封面图") as HTMLInputElement;
    const file = new File([new Uint8Array([0, 0, 0, 24])], "clip.mp4", { type: "video/mp4" });
    const coverFile = new File([new Uint8Array([137, 80, 78, 71])], "cover.png", { type: "image/png" });
    fireEvent.change(videoInput, { target: { files: [file] } });
    fireEvent.change(coverInput, { target: { files: [coverFile] } });
    fireEvent.click(within(dialog).getByRole("button", { name: "发送视频" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/send",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            conversationId: "conv_1",
            type: "video",
            contentBase64: "AAAAGA==",
            mimeType: "video/mp4",
            fileName: "clip.mp4",
            thumbContentBase64: "iVBORw==",
            thumbMimeType: "image/png",
            thumbFileName: "cover.png",
            durationMs: 10400
          }),
          credentials: "include",
        }),
      ),
    );
    expect(createObjectUrl).toHaveBeenCalledWith(file);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:video");
    createElement.mockRestore();
  });

  it("视频未上传封面时自动截取第一帧作为封面", async () => {
    const fetchMock = mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_bot",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ],
      "/api/conversations": [
        {
          id: "conv_1",
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "旧消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [],
      "/api/send": { id: "send_video", status: "pending" },
    });
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:video"),
      revokeObjectURL: vi.fn(),
    });
    const originalCreateElement = document.createElement.bind(document);
    const createElement = vi.spyOn(document, "createElement");
    createElement.mockImplementation((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === "video") {
        Object.defineProperty(element, "duration", { value: 4.2, configurable: true });
        Object.defineProperty(element, "videoWidth", { value: 640, configurable: true });
        Object.defineProperty(element, "videoHeight", { value: 360, configurable: true });
        setTimeout(() => element.dispatchEvent(new Event("loadedmetadata")), 0);
        setTimeout(() => element.dispatchEvent(new Event("seeked")), 0);
      }
      if (tagName.toLowerCase() === "canvas") {
        Object.defineProperty(element, "getContext", {
          configurable: true,
          value: vi.fn(() => ({ drawImage: vi.fn() })),
        });
        Object.defineProperty(element, "toDataURL", {
          configurable: true,
          value: vi.fn(() => "data:image/jpeg;base64,/9j/4AAQSkZJRg=="),
        });
      }
      return element;
    });

    renderWorkbenchPage();

    await screen.findByText("客服主号");
    fireEvent.click(screen.getByRole("button", { name: "视频" }));
    const dialog = await screen.findByRole("dialog", { name: "发送视频" });
    const videoInput = within(dialog).getByLabelText("上传视频文件") as HTMLInputElement;
    const file = new File([new Uint8Array([0, 0, 0, 24])], "clip.mp4", { type: "video/mp4" });
    fireEvent.change(videoInput, { target: { files: [file] } });
    fireEvent.click(within(dialog).getByRole("button", { name: "发送视频" }));

    await waitFor(() => {
      const sendCall = fetchMock.mock.calls.find(([input]) => String(input).replace("http://localhost", "") === "/api/send");
      expect(sendCall).toBeTruthy();
      const [, init] = sendCall!;
      expect(JSON.parse(String(init?.body))).toEqual({
        conversationId: "conv_1",
        type: "video",
        contentBase64: "AAAAGA==",
        mimeType: "video/mp4",
        fileName: "clip.mp4",
        thumbContentBase64: "/9j/4AAQSkZJRg==",
        thumbMimeType: "image/jpeg",
        thumbFileName: "clip-cover.jpg",
        durationMs: 4200,
      });
    });
    createElement.mockRestore();
  });

  it("链接表单只要求链接地址，缩略图用上传图片提交", async () => {
    const fetchMock = mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_bot",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ],
      "/api/conversations": [
        {
          id: "conv_1",
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "旧消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [],
      "/api/send": { id: "send_link", status: "pending" },
    });

    renderWorkbenchPage();

    await screen.findByText("客服主号");
    fireEvent.click(screen.getByRole("button", { name: "链接" }));
    const dialog = await screen.findByRole("dialog", { name: "发送链接" });
    fireEvent.change(within(dialog).getByLabelText("链接标题"), { target: { value: "文章标题" } });
    fireEvent.change(within(dialog).getByLabelText("链接描述"), { target: { value: "文章摘要" } });
    fireEvent.change(within(dialog).getByLabelText("链接地址"), { target: { value: "https://example.com/article" } });
    const thumbInput = within(dialog).getByLabelText("上传链接缩略图") as HTMLInputElement;
    const thumbFile = new File([new Uint8Array([255, 216, 255])], "thumb.jpg", { type: "image/jpeg" });
    fireEvent.change(thumbInput, { target: { files: [thumbFile] } });
    fireEvent.click(within(dialog).getByRole("button", { name: "发送链接" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/send",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            conversationId: "conv_1",
            type: "link",
            title: "文章标题",
            desc: "文章摘要",
            linkUrl: "https://example.com/article",
            thumbContentBase64: "/9j/",
            thumbMimeType: "image/jpeg",
            thumbFileName: "thumb.jpg"
          }),
          credentials: "include",
        }),
      ),
    );
    expect(screen.queryByRole("dialog", { name: "发送链接" })).not.toBeInTheDocument();
  });

  it("链接未填写标题描述和缩略图时自动补默认值", async () => {
    const fetchMock = mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_bot",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ],
      "/api/conversations": [
        {
          id: "conv_1",
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "旧消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [],
      "/api/send": { id: "send_link", status: "pending" },
    });

    renderWorkbenchPage();

    await screen.findByText("客服主号");
    fireEvent.click(screen.getByRole("button", { name: "链接" }));
    const dialog = await screen.findByRole("dialog", { name: "发送链接" });
    fireEvent.change(within(dialog).getByLabelText("链接地址"), { target: { value: "https://example.com/article" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "发送链接" }));

    await waitFor(() => {
      const sendCall = fetchMock.mock.calls.find(([input]) => String(input).replace("http://localhost", "") === "/api/send");
      expect(sendCall).toBeTruthy();
      const [, init] = sendCall!;
      expect(JSON.parse(String(init?.body))).toEqual({
        conversationId: "conv_1",
        type: "link",
        title: "example.com",
        desc: "https://example.com/article",
        linkUrl: "https://example.com/article",
      });
    });
  });

  it("链接表单支持解析链接并回填标题描述", async () => {
    const fetchMock = mockFetch({
      "/api/accounts": [
        {
          id: "acc_1",
          wxid: "wxid_bot",
          nickname: "客服主号",
          onlineStatus: "online",
        },
      ],
      "/api/conversations": [
        {
          id: "conv_1",
          peerWxid: "wxid_target",
          type: "private",
          platformRemark: "陈可乐",
          lastMessageText: "旧消息",
          lastMessageAt: "2026-07-06T07:16:37.000Z",
          status: "active",
        },
      ],
      "/api/conversations/conv_1/messages?take=50": [],
      "/api/link-preview?url=https%3A%2F%2Fexample.com%2Farticle": {
        title: "解析标题",
        desc: "解析摘要",
        linkUrl: "https://example.com/article",
        thumbUrl: "https://example.com/og.jpg",
      },
    });

    renderWorkbenchPage();

    await screen.findByText("客服主号");
    fireEvent.click(screen.getByRole("button", { name: "链接" }));
    const dialog = await screen.findByRole("dialog", { name: "发送链接" });
    fireEvent.change(within(dialog).getByLabelText("链接地址"), { target: { value: "https://example.com/article" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "解析链接" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/link-preview?url=https%3A%2F%2Fexample.com%2Farticle", expect.anything());
      expect(within(dialog).getByLabelText("链接标题")).toHaveValue("解析标题");
      expect(within(dialog).getByLabelText("链接描述")).toHaveValue("解析摘要");
    });
  });
});
