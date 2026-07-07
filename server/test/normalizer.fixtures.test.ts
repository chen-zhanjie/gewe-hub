import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractRevokedMessageRef,
  normalizeGewePayload,
  shouldSkipStandardMessage,
} from "../src/modules/normalizer/normalizer.js";
import { parseWebhookJsonBody } from "../src/modules/gewe/webhook-utils.js";

const fixtureRoot = resolve(
  process.cwd(),
  "../references/gewe-raw-samples/2026-07-05-production",
);

function readFixture(relativePath: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(resolve(fixtureRoot, relativePath), "utf8"),
  ) as Record<string, unknown>;
}

function addMsgPayload(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    TypeName: "AddMsg",
    Appid: "wx_app",
    Wxid: "wxid_bot",
    Data: {
      MsgId: 100,
      MsgType: 1,
      NewMsgId: "5004026754542010999",
      CreateTime: 1783308565,
      FromUserName: { string: "wxid_sender" },
      ToUserName: { string: "wxid_bot" },
      PushContent: "陈可乐 : hello",
      Content: { string: "hello" },
      ...overrides,
    },
  };
}

describe("GeWe 样本标准化", () => {
  it("将私聊 TEXT 样本转为 text MessageNode", () => {
    const payload = readFixture(
      "TEXT/001__event_4__msg_6692899871431281247.json",
    );
    const result = normalizeGewePayload(payload);

    expect(result?.messageId).toMatch(/^msg_/);
    expect(result?.content.type).toBe("text");
    expect(result?.conversation.type).toBe("private");
    expect(result?.renderedText.length).toBeGreaterThan(0);
  });

  it("只从明确的 pushContent 发送者格式提取 sender.name", () => {
    const text = normalizeGewePayload(
      addMsgPayload({
        PushContent: "陈可乐 : hello",
        Content: { string: "hello" },
      }),
    );
    const quoteWithTitleOnly = normalizeGewePayload(
      addMsgPayload({
        MsgType: 49,
        PushContent: "5",
        Content: {
          string:
            "<msg><appmsg><title>5</title><type>57</type><refermsg><type>47</type><svrid>8238055644346920962</svrid><displayname>陈可乐</displayname><content>wxid_sender:1783318038718:0:fc2e00714e7497246500f1ab9358deea::0</content></refermsg></appmsg></msg>",
        },
      }),
    );

    expect(text?.sender.name).toBe("陈可乐");
    expect(quoteWithTitleOnly?.sender.name).toBeUndefined();
    expect(quoteWithTitleOnly?.quote?.senderName).toBe("陈可乐");
  });

  it("从群聊 @ 文本提取 mentions，但不把普通 @ 当成 isAtMe", () => {
    const payload = readFixture(
      "TEXT/005__event_23__msg_3765991162167049842.json",
    );
    const result = normalizeGewePayload(payload);

    expect(result?.conversation.type).toBe("group");
    expect(result?.isAtMe).toBe(false);
    expect(result?.mentions.length).toBeGreaterThan(0);
    expect(result?.mentions[0]?.resolved).toBe(false);
  });

  it("APP_MSG type=74 文件壳不生成标准消息", () => {
    const payload = readFixture(
      "APP_MSG/001__event_8__msg_3591584383532645877.json",
    );

    expect(shouldSkipStandardMessage(payload)).toBe(true);
    expect(normalizeGewePayload(payload)).toBeNull();
  });

  it("FILE type=6 生成 file MessageNode 并保留 overwrite_newmsgid", () => {
    const payload = readFixture(
      "FILE/001__event_9__msg_3205839865020477895.json",
    );
    const result = normalizeGewePayload(payload);
    const geweMetadata = result?.metadata?.gewe as
      Record<string, unknown> | undefined;

    expect(result?.content.type).toBe("file");
    expect(result?.content.media?.fileName).toBeTruthy();
    expect(geweMetadata?.overwriteNewMsgId).toBeTruthy();
  });

  it("顶层媒体样本进入 pending 下载态，等待媒体模块回写 ready/failed", () => {
    const payload = readFixture(
      "IMAGE/001__event_5__msg_3922204457385410994.json",
    );
    const result = normalizeGewePayload(payload);

    expect(result?.content.type).toBe("image");
    expect(result?.content.media?.status).toBe("pending");
    expect(result?.content.media?.url).toBeNull();
  });

  it("CHAT_RECORD 样本生成递归 items", () => {
    const payload = readFixture(
      "CHAT_RECORD/001__event_18__msg_4335725902080638633.json",
    );
    const result = normalizeGewePayload(payload);

    expect(result?.content.type).toBe("chat_record");
    expect(result?.content.items?.length).toBeGreaterThan(1);
  });

  it("真实 AddMsg 收藏聊天记录 type=40 realinnertype=19 降级为 chat_record 摘要", () => {
    const result = normalizeGewePayload(
      addMsgPayload({
        MsgType: 49,
        Content: {
          string:
            "<msg><appmsg><title>陈可乐与陳可乐的聊天记录</title><des>陳可乐: 简单总结：\n\nXianyuAutoAgent 是一个闲鱼 AI 自动客服项目。\n陈可乐: [聊天记录]\n陈可乐: 总结一下聊天记录...</des><url>https://support.weixin.qq.com/security/readtemplate?t=w_security_center_website/upgrade&amp;wechat_real_lang=zh_CN</url><type>40</type><xmlfulllen>151932</xmlfulllen><realinnertype>19</realinnertype></appmsg></msg>",
        },
      }),
    );

    expect(result?.content.type).toBe("chat_record");
    expect(result?.content.text).toContain("陈可乐与陳可乐的聊天记录");
    expect(result?.content.text).toContain("XianyuAutoAgent 是一个闲鱼 AI 自动客服项目");
    expect(result?.content.items).toEqual([]);
    expect(result?.content.rawType).toBe("APP_MSG_TYPE_40_REALINNER_19");
    expect(result?.renderedText).toContain("XianyuAutoAgent 是一个闲鱼 AI 自动客服项目");
    expect(result?.renderedText).not.toBe("[暂不支持的 APP 消息]");
    expect(result?.metadata?.gewe).toMatchObject({
      msgType: "CHAT_RECORD",
      rawMsgType: "49",
      appMsgType: "40",
      realInnerType: "19",
    });
  });

  it("真实 AddMsg quote 引用收藏聊天记录 type=40 realinnertype=19 时保留摘要", () => {
    const result = normalizeGewePayload(
      addMsgPayload({
        MsgType: 49,
        PushContent: "引用",
        Content: {
          string:
            "<msg><appmsg><title>引用</title><type>57</type><refermsg><type>49</type><svrid>7629605734086202297</svrid><displayname>陈可乐</displayname><content>&lt;msg&gt;&lt;appmsg&gt;&lt;title&gt;陈可乐与陳可乐的聊天记录&lt;/title&gt;&lt;des&gt;陳可乐: 简单总结：XianyuAutoAgent 是一个闲鱼 AI 自动客服项目。&lt;/des&gt;&lt;type&gt;40&lt;/type&gt;&lt;realinnertype&gt;19&lt;/realinnertype&gt;&lt;/appmsg&gt;&lt;/msg&gt;</content></refermsg></appmsg></msg>",
        },
      }),
    );

    expect(result?.quote?.type).toBe("chat_record");
    expect(result?.quote?.text).toContain("XianyuAutoAgent 是一个闲鱼 AI 自动客服项目");
    expect(result?.quote?.items).toEqual([]);
    expect(result?.renderedText).toContain("XianyuAutoAgent 是一个闲鱼 AI 自动客服项目");
  });

  it("UNKNOWN 样本被归为 skipped", () => {
    const payload = readFixture("UNKNOWN/001__event_1__msg_1.json");

    expect(shouldSkipStandardMessage(payload)).toBe(true);
    expect(normalizeGewePayload(payload)).toBeNull();
  });

  it("兼容真实 GeWe AddMsg 外层并剥离群聊正文发送者前缀", () => {
    const payload = addMsgPayload({
      MsgType: 1,
      NewMsgId: "5004026754542010999",
      FromUserName: { string: "48315023241@chatroom" },
      ToUserName: { string: "wxid_bot" },
      PushContent: "陈可乐 : 群聊测试",
      Content: { string: "wxid_sender:\n群聊测试" },
    });
    const result = normalizeGewePayload(payload);

    expect(result?.messageId).toBe("msg_5004026754542010999");
    expect(result?.account.wxid).toBe("wxid_bot");
    expect(result?.conversation.type).toBe("group");
    expect(result?.conversation.wxid).toBe("48315023241@chatroom");
    expect(result?.sender.wxid).toBe("wxid_sender");
    expect(result?.content.type).toBe("text");
    expect(result?.renderedText).toBe("群聊测试");
    expect(result?.sentAt).toBe("2026-07-06T03:29:25.000Z");
  });

  it("真实 AddMsg 文件上传占位 type=74 不生成标准消息", () => {
    const payload = addMsgPayload({
      MsgType: 49,
      Content: {
        string:
          "<msg><appmsg><title>mapping_app.txt</title><type>74</type></appmsg></msg>",
      },
    });

    expect(shouldSkipStandardMessage(payload)).toBe(true);
    expect(normalizeGewePayload(payload)).toBeNull();
  });

  it("真实 AddMsg appmsg type=6 生成文件并保留 overwrite_newmsgid", () => {
    const payload = addMsgPayload({
      MsgType: 49,
      Content: {
        string:
          "<msg><appmsg><title>mapping_app.txt</title><type>6</type><appattach><totallen>2732</totallen><overwrite_newmsgid>3906307012056385934</overwrite_newmsgid></appattach><md5>562d96ac785059b4b32ca1adc6789765</md5></appmsg></msg>",
      },
    });
    const result = normalizeGewePayload(payload);
    const geweMetadata = result?.metadata?.gewe as
      Record<string, unknown> | undefined;

    expect(result?.content.type).toBe("file");
    expect(result?.content.media?.fileName).toBe("mapping_app.txt");
    expect(result?.content.media?.size).toBe(2732);
    expect(result?.mentions).toEqual([]);
    expect(geweMetadata?.overwriteNewMsgId).toBe("3906307012056385934");
  });

  it("真实 AddMsg quote 引用文件时解析 refermsg.content，并且不从内嵌 XML 提取 mentions", () => {
    const payload = addMsgPayload({
      MsgType: 49,
      PushContent: "引用",
      Content: {
        string:
          "<msg><appmsg><title>引用</title><type>57</type><refermsg><type>49</type><svrid>478238581151300365</svrid><chatusr>wxid_lnop8pc2ivre22</chatusr><displayname>陈可乐</displayname><content>&lt;msg&gt;&lt;appmsg&gt;&lt;title&gt;mapping_app.txt&lt;/title&gt;&lt;type&gt;6&lt;/type&gt;&lt;appattach&gt;&lt;totallen&gt;2732&lt;/totallen&gt;&lt;attachid&gt;@cdn_abc&lt;/attachid&gt;&lt;overwrite_newmsgid&gt;3906307012056385934&lt;/overwrite_newmsgid&gt;&lt;/appattach&gt;&lt;md5&gt;562d96ac785059b4b32ca1adc6789765&lt;/md5&gt;&lt;/appmsg&gt;&lt;/msg&gt;</content></refermsg></appmsg></msg>",
      },
    });
    const result = normalizeGewePayload(payload);

    expect(result?.content).toEqual({ type: "text", text: "引用" });
    expect(result?.quote?.type).toBe("file");
    expect(result?.quote?.text).toBe("[文件] mapping_app.txt");
    expect(result?.quote?.media?.fileName).toBe("mapping_app.txt");
    expect(result?.quote?.media?.size).toBe(2732);
    expect(result?.quote?.senderName).toBe("陈可乐");
    expect(result?.quote?.sourceMessageId).toBe("msg_478238581151300365");
    expect(result?.renderedText).toBe("引用: [文件] mapping_app.txt");
    expect(result?.mentions).toEqual([]);
  });

  it("真实 AddMsg quote 引用紧凑表情内容时提取 md5 作为下载线索", () => {
    const payload = addMsgPayload({
      MsgType: 49,
      PushContent: "引用",
      Content: {
        string:
          "<msg><appmsg><title>引用</title><type>57</type><refermsg><type>47</type><svrid>8238055644346920962</svrid><displayname>陈可乐</displayname><content>wxid_lnop8pc2ivre22:1783318038718:0:fc2e00714e7497246500f1ab9358deea::0\n</content></refermsg></appmsg></msg>",
      },
    });
    const result = normalizeGewePayload(payload);

    expect(result?.quote?.type).toBe("emoji");
    expect(result?.quote?.media).toEqual(
      expect.objectContaining({
        status: "pending",
        url: null,
        md5: "fc2e00714e7497246500f1ab9358deea",
      }),
    );
    expect(result?.renderedText).toBe("引用: [动画表情]");
  });

  it("真实 AddMsg quote 引用链接时从 refermsg.content 提取链接摘要", () => {
    const payload = addMsgPayload({
      MsgType: 49,
      PushContent: "引用",
      Content: {
        string:
          "<msg><appmsg><title>引用</title><type>57</type><refermsg><type>49</type><svrid>19585584652058234</svrid><displayname>陈可乐</displayname><content>&lt;msg&gt;&lt;appmsg&gt;&lt;title&gt;Deep&amp;#x20;Code&amp;#x20;开源&amp;#x20;AI&amp;#x20;编程助手上线&lt;/title&gt;&lt;des&gt;IT之家&amp;#x20;消息&lt;/des&gt;&lt;type&gt;5&lt;/type&gt;&lt;url&gt;https://www.ithome.com/0/972/910.htm&lt;/url&gt;&lt;/appmsg&gt;&lt;/msg&gt;</content></refermsg></appmsg></msg>",
      },
    });
    const result = normalizeGewePayload(payload);

    expect(result?.quote?.type).toBe("link");
    expect(result?.quote?.text).toBe("[链接] Deep Code 开源 AI 编程助手上线");
    expect(result?.quote?.link?.title).toBe("Deep Code 开源 AI 编程助手上线");
    expect(result?.quote?.link?.url).toBe(
      "https://www.ithome.com/0/972/910.htm",
    );
    expect(result?.quote?.senderName).toBe("陈可乐");
    expect(result?.renderedText).toBe(
      "引用: [链接] Deep Code 开源 AI 编程助手上线",
    );
  });

  it("真实 AddMsg 非 QUOTE 媒体消息带 extcommoninfo.refermsg 时保留轻量 quote 供本地回查", () => {
    const result = normalizeGewePayload(
      addMsgPayload({
        MsgType: 34,
        NewMsgId: "2743130721562230291",
        Content: {
          string:
            '<msg><voicemsg voicelength="3934" length="6637" aeskey="voice_key" voiceurl="voice_url" /><extcommoninfo><refermsg><svrid>5484099934145465483</svrid><createtime>1783308431</createtime></refermsg><media_expire_at>1784519950</media_expire_at></extcommoninfo></msg>',
        },
      }),
    );

    expect(result?.content.type).toBe("voice");
    expect(result?.quote).toEqual({
      type: "unsupported",
      text: "引用了一条消息，暂未解析内容",
      sourceMessageId: "msg_5484099934145465483",
      sentAt: "2026-07-06T03:27:11.000Z",
    });
  });

  it("CHAT_RECORD 条目保留 refermsgitem 为条目级 quote", () => {
    const result = normalizeGewePayload(
      addMsgPayload({
        MsgType: 49,
        Content: {
          string:
            '<msg><appmsg><title>群聊的聊天记录</title><type>19</type><recorditem><![CDATA[<recordinfo><datalist><dataitem datatype="1"><datadesc>他们不是发公告了</datadesc><sourcename>大哈</sourcename><srcMsgCreateTime>1783303226</srcMsgCreateTime><fromnewmsgid>5034922477837409496</fromnewmsgid><refermsgitem><type>1</type><svrid>374352950798606728</svrid><displayname>🍞</displayname><content>你偷听梁逸峰 不对 梁文峰开会了？</content><referdesc>你偷听梁逸峰 不对 梁文峰开会了？</referdesc></refermsgitem></dataitem></datalist></recordinfo>]]></recorditem></appmsg></msg>',
        },
      }),
    );

    const item = result?.content.items?.[0];
    expect(item?.type).toBe("text");
    expect(item?.text).toBe("他们不是发公告了");
    expect(item?.quote).toEqual({
      type: "text",
      text: "你偷听梁逸峰 不对 梁文峰开会了？",
      senderName: "🍞",
      sourceMessageId: "msg_374352950798606728",
    });
  });

  it("CHAT_RECORD 链接条目用标题渲染并保留 streamweburl", () => {
    const result = normalizeGewePayload(
      addMsgPayload({
        MsgType: 49,
        Content: {
          string:
            '<msg><appmsg><title>群聊的聊天记录</title><type>19</type><recorditem><![CDATA[<recordinfo><datalist><dataitem datatype="5"><datatitle>Deep Code 开源 AI 编程助手上线</datatitle><datadesc>IT之家 7 月 6 日消息，DeepSeek 官方 API 文档日前收录了一款工具。</datadesc><streamweburl>https://www.ithome.com/0/972/910.htm</streamweburl><sourcename>ﺭ钦ﺭ 🍃</sourcename><srcMsgCreateTime>1783307147</srcMsgCreateTime><fromnewmsgid>2835931518561535134</fromnewmsgid></dataitem></datalist></recordinfo>]]></recorditem></appmsg></msg>',
        },
      }),
    );

    const item = result?.content.items?.[0];
    expect(item?.type).toBe("link");
    expect(item?.text).toBe("[链接] Deep Code 开源 AI 编程助手上线");
    expect(item?.link).toEqual({
      title: "Deep Code 开源 AI 编程助手上线",
      desc: "IT之家 7 月 6 日消息，DeepSeek 官方 API 文档日前收录了一款工具。",
      url: "https://www.ithome.com/0/972/910.htm",
    });
  });

  it("CHAT_RECORD 条目媒体存在下载线索时进入 pending 而不是直接 failed", () => {
    const result = normalizeGewePayload(
      addMsgPayload({
        MsgType: 49,
        Content: {
          string:
            '<msg><appmsg><title>群聊的聊天记录</title><type>19</type><recorditem><![CDATA[<recordinfo><datalist><dataitem datatype="2"><datadesc>[图片]</datadesc><cdndataurl>305f020100044b</cdndataurl><cdndatakey>data_key</cdndatakey><fullmd5>full_md5</fullmd5><datasize>813116</datasize><thumbwidth>358</thumbwidth><thumbheight>480</thumbheight><sourcename>陈可乐</sourcename><srcMsgCreateTime>1782725915</srcMsgCreateTime><fromnewmsgid>6954053753637146324</fromnewmsgid></dataitem><dataitem datatype="37"><datadesc>[动画表情]</datadesc><emojiitem><md5>9f9dbafc6c04663416ce4eaf94299e7d</md5><uiemoticonwidth>27</uiemoticonwidth><uiemoticonheight>27</uiemoticonheight><cdnurlstring>http://vweixinf.tc.qq.com/emoji.gif</cdnurlstring></emojiitem><sourcename>陈可乐</sourcename><fromnewmsgid>8163153116420124344</fromnewmsgid></dataitem></datalist></recordinfo>]]></recorditem></appmsg></msg>',
        },
      }),
    );

    const image = result?.content.items?.[0];
    const emoji = result?.content.items?.[1];
    expect(image?.type).toBe("image");
    expect(image?.media).toEqual({
      status: "pending",
      url: null,
      size: 813116,
      width: 358,
      height: 480,
      md5: "full_md5",
    });
    expect(emoji?.type).toBe("emoji");
    expect(emoji?.media).toEqual({
      status: "pending",
      url: null,
      width: 27,
      height: 27,
      md5: "9f9dbafc6c04663416ce4eaf94299e7d",
    });
  });

  it("CHAT_RECORD 嵌套聊天记录 datatype=17 递归生成 chat_record 节点", () => {
    const result = normalizeGewePayload(
      addMsgPayload({
        MsgType: 49,
        Content: {
          string:
            '<msg><appmsg><title>外层聊天记录</title><type>19</type><recorditem><![CDATA[<recordinfo><datalist><dataitem datatype="17"><datatitle>内层聊天记录</datatitle><datadesc>陈可乐: [图片]</datadesc><sourcename>陈可乐</sourcename><srcMsgCreateTime>1782872109</srcMsgCreateTime><fromnewmsgid>6468331776578873920</fromnewmsgid><recordxml><recordinfo><title>内层聊天记录</title><datalist count="1"><dataitem datatype="2"><datadesc>[图片]</datadesc><cdndataurl>inner_cdn_data</cdndataurl><cdndatakey>inner_data_key</cdndatakey><cdnthumburl>inner_thumb</cdnthumburl><cdnthumbkey>inner_thumb_key</cdnthumbkey><fullmd5>inner_full_md5</fullmd5><datasize>54207</datasize><thumbwidth>180</thumbwidth><thumbheight>110</thumbheight><sourcename>陈可乐</sourcename><srcMsgCreateTime>1782872069</srcMsgCreateTime><fromnewmsgid>1373885901254179937</fromnewmsgid></dataitem></datalist></recordinfo></recordxml></dataitem></datalist></recordinfo>]]></recorditem></appmsg></msg>',
        },
      }),
    );

    const item = result?.content.items?.[0];
    const nestedItem = item?.items?.[0];
    expect(item?.type).toBe("chat_record");
    expect(item?.text).toBe("内层聊天记录");
    expect(item?.senderName).toBe("陈可乐");
    expect(item?.sourceMessageId).toBe("msg_6468331776578873920");
    expect(nestedItem?.type).toBe("image");
    expect(nestedItem?.media).toEqual({
      status: "pending",
      url: null,
      size: 54207,
      width: 180,
      height: 110,
      md5: "inner_full_md5",
    });
  });

  it("CHAT_RECORD 里只有语音摘要和 fromnewmsgid 的条目仍标准化为 voice 节点", () => {
    const result = normalizeGewePayload(
      addMsgPayload({
        MsgType: 49,
        Content: {
          string:
            '<msg><appmsg><title>外层聊天记录</title><type>19</type><recorditem><![CDATA[<recordinfo><datalist><dataitem datatype="1"><datadesc>[语音] 5"</datadesc><sourcename>陈可乐</sourcename><srcMsgCreateTime>1783318047</srcMsgCreateTime><fromnewmsgid>5649845438500538903</fromnewmsgid></dataitem></datalist></recordinfo>]]></recorditem></appmsg></msg>',
        },
      }),
    );

    const item = result?.content.items?.[0];
    expect(item?.type).toBe("voice");
    expect(item?.text).toBe("[语音]");
    expect(item?.media).toEqual({
      status: "failed",
      url: null,
      durationMs: 5000,
    });
    expect(item?.sourceMessageId).toBe("msg_5649845438500538903");
    expect(item?.senderName).toBe("陈可乐");
  });

  it("真实 AddMsg location/card/red_packet 映射到标准节点", () => {
    const location = normalizeGewePayload(
      addMsgPayload({
        MsgType: 48,
        Content: {
          string:
            '<msg><location x="23.181795" y="114.455414" label="惠城区惠民大道辅路" poiname="惠城区星河传奇" /></msg>',
        },
      }),
    );
    const card = normalizeGewePayload(
      addMsgPayload({
        MsgType: 42,
        Content: {
          string:
            '<msg username="v3_card@stranger" nickname="陈可乐" smallheadimgurl="http://wx.qlogo.cn/mmhead/132" />',
        },
      }),
    );
    const redPacket = normalizeGewePayload(
      addMsgPayload({
        MsgType: 49,
        Content: {
          string:
            "wxid_sender:\n<msg><appmsg><type>2001</type><title>微信红包</title><wcpayinfo><receivertitle>红包测试哈哈哈</receivertitle></wcpayinfo></appmsg></msg>",
        },
      }),
    );

    expect(location?.content.type).toBe("location");
    expect(location?.content.location?.lat).toBe(23.181795);
    expect(location?.content.location?.lng).toBe(114.455414);
    expect(card?.content.type).toBe("card");
    expect(card?.content.card?.wxid).toBe("v3_card@stranger");
    expect(card?.mentions).toEqual([]);
    expect(redPacket?.content.type).toBe("red_packet");
    expect(redPacket?.content.redPacket?.greeting).toBe("红包测试哈哈哈");
  });

  it("真实 AddMsg 名片昵称只有空白时用 wxid 兜底，避免渲染无意义空白", () => {
    const result = normalizeGewePayload(
      addMsgPayload({
        MsgType: 42,
        Content: {
          string:
            '<msg username="v3_blank_name@stranger" nickname="　" smallheadimgurl="http://wx.qlogo.cn/mmhead/132" />',
        },
      }),
    );

    expect(result?.content.type).toBe("card");
    expect(result?.content.text).toBe("[名片] v3_blank_name@stranger");
    expect(result?.content.card?.nickName).toBe("v3_blank_name@stranger");
    expect(result?.renderedText).toBe("[名片] v3_blank_name@stranger");
  });

  it("isSelf 字符串 false 不会被误判为 true", () => {
    const result = normalizeGewePayload({
      msgType: "TEXT",
      appid: "wx_app",
      wxid: "wxid_bot",
      fromUser: "wxid_sender",
      toUser: "wxid_bot",
      isSelf: "false",
      newMsgId: "1",
      createTime: 1783308565000,
      content: "hello",
    });

    expect(result?.isSelf).toBe(false);
  });

  it("群聊正文提到别人但 pushContent 未说明 @ 我时不设置 isAtMe", () => {
    const result = normalizeGewePayload({
      msgType: "TEXT",
      appid: "wx_app",
      wxid: "wxid_bot",
      fromGroup: "48315023241@chatroom",
      fromUser: "wxid_sender",
      toUser: "wxid_bot",
      isSelf: false,
      newMsgId: "1",
      createTime: 1783308565000,
      pushContent: "陈可乐 : @张三 hello",
      content: "@张三\u2005 hello",
    });

    expect(result?.isAtMe).toBe(false);
    expect(result?.mentions[0]).toEqual({ name: "张三", resolved: false });
  });

  it("真实 AddMsg 群聊 atuserlist 按正文顺序补全 wxid 并标记 @ 我", () => {
    const result = normalizeGewePayload(
      addMsgPayload({
        MsgType: 1,
        FromUserName: { string: "48315023241@chatroom" },
        PushContent: "陈可乐在群聊中@了你",
        MsgSource: {
          string:
            "<msgsource><atuserlist><![CDATA[wxid_bot,wxid_other]]></atuserlist></msgsource>",
        },
        Content: {
          string: "wxid_sender:\n@陳可乐\u2005@云知序\u2005多人艾特测试",
        },
      }),
    );

    expect(result?.isAtMe).toBe(true);
    expect(result?.mentions).toEqual([
      { name: "陳可乐", wxid: "wxid_bot", isMe: true, resolved: true },
      { name: "云知序", wxid: "wxid_other", isMe: false, resolved: true },
    ]);
  });

  it("群聊引用消息外层 MsgSource atuserlist 包含当前账号时标记 @ 我", () => {
    const result = normalizeGewePayload(
      addMsgPayload({
        MsgType: 49,
        FromUserName: { string: "48315023241@chatroom" },
        ToUserName: { string: "wxid_bot" },
        PushContent: "陈可乐 : ？@陳可乐\u2005",
        MsgSource: {
          string:
            "<msgsource><atuserlist>wxid_bot</atuserlist><membercount>3</membercount></msgsource>",
        },
        Content: {
          string:
            'wxid_sender:\n<msg><appmsg><title>？@陳可乐\u2005</title><type>57</type><refermsg><type>1</type><svrid>2661228331246470465</svrid><displayname>陈可乐</displayname><content>@陳可乐\u2005</content></refermsg></appmsg></msg>',
        },
      }),
    );

    expect(result?.isAtMe).toBe(true);
    expect(result?.mentions).toEqual([
      { name: "陳可乐", wxid: "wxid_bot", isMe: true, resolved: true },
    ]);
  });

  it("原始 HTTP JSON 字符串进入解析时保留 AddMsg 大整数消息 ID", () => {
    const raw =
      '{"TypeName":"AddMsg","Appid":"wx_app","Wxid":"wxid_bot","Data":{"MsgType":1,"NewMsgId":5004026754542010999,"CreateTime":1783308565,"FromUserName":{"string":"wxid_sender"},"ToUserName":{"string":"wxid_bot"},"Content":{"string":"hello"}}}';
    const result = normalizeGewePayload(parseWebhookJsonBody(raw));

    expect(result?.messageId).toBe("msg_5004026754542010999");
  });

  it("真实撤回 AddMsg 同时提取 newmsgid 和 msgid 兜底引用", () => {
    const ref = extractRevokedMessageRef(
      addMsgPayload({
        MsgType: 10002,
        NewMsgId: "3863947645",
        Content: {
          string:
            '<sysmsg type="revokemsg"><revokemsg><session>wxid_sender</session><msgid>130881346</msgid><newmsgid>7704921809887032008</newmsgid><replacemsg><![CDATA["陈可乐" 撤回了一条消息]]></replacemsg></revokemsg></sysmsg>',
        },
      }),
    );

    expect(ref).toEqual({
      messageId: "msg_7704921809887032008",
      rawMsgId: "130881346",
    });
  });
});
