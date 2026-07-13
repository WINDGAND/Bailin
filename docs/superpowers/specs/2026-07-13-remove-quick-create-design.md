# 删除快速创建，仅保留深度创建

## 目标

创建角色页不再提供「快速创建」；用户默认且只能走深度创建。删除快速专用入口与流水线代码。

## 非目标

- 不改 hatch 生图、深度调研/合成主流程
- 不删除重生形象/外貌、`runVisualStep`、`runAppearanceTextOnly` 等共用能力

## 变更摘要

1. **UI**：去掉创建方式双卡与 `submitQuick`；仅 `createDeep`
2. **IPC**：删除 `characters.create` / `CharactersCreate` / `CreateCharacterInput`
3. **Orchestrator**：删除 `createCharacter`、`runCardStep`、`runAppearanceForQuick`
4. **Prompts**：删除 `buildCharacterCardPrompt`；保留 `CHARACTER_CARD_OUTPUT_SCHEMA_DESCRIPTION`
5. **文案**：清理 quick 相关 i18n；改写无联网禁用深度时的引导（不再提快速）

## 验收

- 创建页无快速选项，提交即深度进度
- 无联网时深度禁用文案正确
- 深度创建、角色库重生形象/外貌仍可用
