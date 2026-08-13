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

export interface FeishuEnv {
  FEISHU_APP_ID: string;
  FEISHU_APP_SECRET: string;
  FEISHU_CHAT_ID: string;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const data = await res.json();
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

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
