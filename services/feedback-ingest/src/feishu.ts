/**
 * 反馈接入 Worker 的飞书投递：把已校验的正文、联系方式与截图发到指定群。
 *
 * 流程为「租户 token → 逐张上传图片拿 `image_key` → 发 post 富文本」。
 * 网络调用通过注入的 `fetchImpl` 发出，便于测试替换；任一步失败抛出短错误码，由 handler 转成 502。
 */

/**
 * 组装飞书 post 消息体（中文）。
 *
 * 标题带应用版本；正文前一行写联系邮箱（未填则「未留」），再空一行后跟用户正文，
 * 图片以 `img` 标签追加。`version` 若已带 `v`/`V` 前缀会先剥掉，避免标题出现 `v v1.2`。
 *
 * @param input 版本、可选联系方式、正文、已上传成功的 `image_key` 列表
 * @returns `{ zh_cn: { title, content } }`，可再 `JSON.stringify` 后作为飞书 `content`
 */
export function buildFeishuPost(input: {
  version: string;
  contact?: string;
  body: string;
  imageKeys: string[];
}): { zh_cn: { title: string; content: Array<Array<{ tag: string; text?: string; image_key?: string }>> } } {
  const content: Array<Array<{ tag: string; text?: string; image_key?: string }>> = [
    [{ tag: "text", text: `联系：${input.contact ?? "未留"}` }],
    [{ tag: "text", text: "" }],
    [{ tag: "text", text: input.body }]
  ];
  for (const image_key of input.imageKeys) {
    content.push([{ tag: "img", image_key }]);
  }
  return {
    zh_cn: {
      title: `百灵反馈 · v${input.version.replace(/^v/i, "")}`,
      content
    }
  };
}

/**
 * 投递所需的飞书开放平台凭证。
 * `FEISHU_CHAT_ID` 为接收群的 `chat_id`（`receive_id_type=chat_id`）。
 */
export interface FeishuEnv {
  FEISHU_APP_ID: string;
  FEISHU_APP_SECRET: string;
  FEISHU_CHAT_ID: string;
}

/** 尽力把响应读成对象；非 JSON 或解析失败返回空对象，避免把飞书错误页当成功。 */
async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const data = await res.json();
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * 将一条反馈发到飞书群：取 token、上传附件、发 post。
 *
 * 图片以 `image_type=message` 上传，成功后的 `image_key` 写入 post。
 * HTTP 非 2xx、缺 token / `image_key`、或业务 `code !== 0` 时抛错，不重试。
 *
 * @param env 飞书应用与目标群
 * @param input 已通过 `validateIngestPayload` 的正文、联系方式、附件字节
 * @param fetchImpl 实际发起请求的 `fetch`（生产为全局 fetch，测试可注入）
 * @returns 无返回值；成功即消息已进群。副作用：调用飞书开放接口
 */
export async function sendToFeishu(
  env: FeishuEnv,
  input: { version: string; contact?: string; body: string; files: Array<{ name: string; mime: string; bytes: Uint8Array }> },
  fetchImpl: typeof fetch
): Promise<void> {
  const tokenRes = await fetchImpl("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET })
  });
  const tokenJson = await readJson(tokenRes);
  const token = tokenJson.tenant_access_token;
  if (!tokenRes.ok || typeof token !== "string" || !token) {
    throw new Error("feishu token");
  }

  const imageKeys: string[] = [];
  for (const file of input.files) {
    const form = new FormData();
    form.append("image_type", "message");
    form.append("image", new Blob([file.bytes], { type: file.mime }), file.name);
    const up = await fetchImpl("https://open.feishu.cn/open-apis/im/v1/images", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form
    });
    const upJson = await readJson(up);
    const data = upJson.data && typeof upJson.data === "object" ? (upJson.data as { image_key?: unknown }) : {};
    if (!up.ok || upJson.code !== 0 || typeof data.image_key !== "string") {
      throw new Error("feishu image");
    }
    imageKeys.push(data.image_key);
  }

  const post = buildFeishuPost({
    version: input.version,
    contact: input.contact,
    body: input.body,
    imageKeys
  });
  const msgRes = await fetchImpl(
    "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        receive_id: env.FEISHU_CHAT_ID,
        msg_type: "post",
        content: JSON.stringify(post)
      })
    }
  );
  const msgJson = await readJson(msgRes);
  if (!msgRes.ok || msgJson.code !== 0) {
    throw new Error("feishu message");
  }
}
