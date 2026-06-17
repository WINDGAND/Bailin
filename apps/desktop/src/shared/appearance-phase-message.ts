/** 深度外貌阶段 UI 文案（主进程 → 渲染进程 i18n 映射用，须与 distill.* key 对应）。 */

export const APPEARANCE_PHASE_USER_VISION =
  "深度外貌：读取你上传的参考图 → 结构化 → 视觉核对…";
export const APPEARANCE_PHASE_USER_TEXT =
  "深度外貌：读取你上传的参考图 → 结构化描述…";
export const APPEARANCE_PHASE_AUTO_SEARCH_VISION =
  "深度外貌：联网搜官方形象图 → 读图 → 结构化 → 视觉核对…";
export const APPEARANCE_PHASE_WEB_TEXT =
  "深度外貌：联网查阅公开形象描述 → 结构化…";
export const APPEARANCE_PHASE_MATERIAL_ONLY =
  "深度外貌：根据已有调研素材推断形象 → 结构化…";
export const APPEARANCE_PHASE_FALLBACK_NO_VISION =
  "深度外貌：未配置读图模型，改用联网文字描述 → 结构化…";
export const APPEARANCE_PHASE_FALLBACK_NO_IMAGES =
  "深度外貌：未找到可用参考图，改用联网文字描述 → 结构化…";
export const APPEARANCE_PHASE_FALLBACK_VISION_FAILED =
  "深度外貌：读图未通过，改用联网文字描述 → 结构化…";

export function buildAppearancePhaseMessage(input: {
  userReferenceCount: number;
  webSearchEnabled: boolean;
  visionAvailable: boolean;
}): string {
  const { userReferenceCount, webSearchEnabled, visionAvailable } = input;
  if (userReferenceCount > 0) {
    return visionAvailable ? APPEARANCE_PHASE_USER_VISION : APPEARANCE_PHASE_USER_TEXT;
  }
  if (webSearchEnabled && visionAvailable) {
    return APPEARANCE_PHASE_AUTO_SEARCH_VISION;
  }
  if (webSearchEnabled) {
    return APPEARANCE_PHASE_WEB_TEXT;
  }
  return APPEARANCE_PHASE_MATERIAL_ONLY;
}
