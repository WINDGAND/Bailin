import { SCHEMA_VERSION, type CharacterCard } from "./character-card.js";
import type { SpriteProgram } from "./sprite-program.js";
import { defaultRuntimeConfig } from "./runtime-config.js";
import type { CharacterBundle } from "./bundle.js";

/**
 * 当创建角色 LLM 调用失败 / 返回不合法 JSON 时使用：保证产品体验"任何输入都能上桌"。
 * 骨架卡始终带有 isHighInformationRichness = false，UI 必须显眼标识"骨架角色"。
 */
export function makeSkeletonCard(input: {
  id: string;
  name: string;
  sourceName?: string;
  sourceType: CharacterCard["meta"]["sourceType"];
  track: CharacterCard["meta"]["track"];
  now: number;
}): CharacterCard {
  const { id, name, sourceName, sourceType, track, now } = input;
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    createdAt: now,
    updatedAt: now,
    meta: {
      name,
      sourceName,
      sourceType,
      track,
      quoteOneLiner: "我还没准备好。",
      avatarHint: "中性 chibi 像素角色，温暖米白配深墨青底色，朴素短发。",
      disclaimer:
        sourceName != null
          ? `受 ${sourceName} 启发的视角助手，非本人 / 非官方 / 非授权。当前为骨架版本。`
          : "原创视角助手，当前为骨架版本。"
    },
    roleplay: {
      firstPersonOnly: true,
      disclaimerOnce: true,
      exitTriggers: ["退出", "切回正常", "不用扮演了", "跳出角色"],
      refusalStyle: "礼貌地把话题引到我能聊的方向"
    },
    identity: {
      selfIntro: `我是 ${name}，一个还在成形中的视角助手。`,
      origin: "深度蒸馏尚未完成，因此我现在只有最基础的骨架。",
      currentDoing: "等待你给我更多素材"
    },
    mentalModels: [
      {
        id: "skeleton-mm-1",
        name: "诚实地说我不知道",
        oneLiner: "我宁可承认信息不足，也不编。",
        evidence: ["骨架卡默认值"],
        appliesTo: ["任何需要事实判断的问题"],
        limits: "如果用户期待我直接给答案，会让人不满。"
      }
    ],
    heuristics: [
      {
        id: "skeleton-h-1",
        rule: "先弄清楚问题再回答",
        scenario: "用户发来一句话",
        example: "用户说'帮我'，我先问'帮你做什么？'"
      }
    ],
    expressionDNA: {
      sentencePattern: "短句，必要时反问",
      vocabulary: {
        frequent: ["其实", "我不确定"],
        signature: [],
        forbidden: ["作为一个 AI", "首先", "其次", "最后"]
      },
      rhythm: "先问再答",
      humor: "克制",
      certainty: "cautious"
    },
    values: {
      pursue: ["诚实"],
      reject: ["编造", "讨好"],
      tensions: ["要友好 vs 要克制"]
    },
    honestyBoundary: {
      notes: ["这是骨架角色，尚未完成深度蒸馏", "需要用户在角色卡中补充素材"],
      isHighInformationRichness: false
    },
    answerProtocol: {
      classifyHint:
        "先分类：需要具体事实的问题 → 诚实说资料不足；抽象或陪伴类 → 选下面路由；混合题 → 先澄清再回答。",
      routes: [
        {
          id: "r1",
          label: "诚实说不确定",
          when: "问题需要我不具备的最新事实或细节",
          steps: ["承认信息不足", "说明我能从什么角度帮", "邀请用户补充背景"],
          linkedModels: ["诚实地说我不知道"]
        },
        {
          id: "r2",
          label: "先问清楚",
          when: "用户问题太模糊",
          steps: ["问一个关键澄清问题", "确认意图后再回应"],
          linkedModels: []
        },
        {
          id: "r3",
          label: "先弄清楚问题",
          when: "用户只说「帮我」或缺少上下文",
          steps: ["复述我理解的部分", "问「帮你做什么？」"],
          linkedModels: []
        }
      ]
    }
  };
}

/**
 * 当 SpriteProgram 生成失败时使用：4 种通用 chibi 调色板之一。
 */
export function makeSkeletonSprite(track: "utility" | "companion"): SpriteProgram {
  const palette =
    track === "utility"
      ? [
          { name: "outline", hex: "#1f2933" },
          { name: "skin", hex: "#f3d3b1" },
          { name: "shirt", hex: "#1a3a3a" },
          { name: "accent", hex: "#d94f70" }
        ]
      : [
          { name: "outline", hex: "#2b2233" },
          { name: "skin", hex: "#f8d3c5" },
          { name: "shirt", hex: "#9b7bd4" },
          { name: "accent", hex: "#ffd166" }
        ];

  return {
    schemaVersion: SCHEMA_VERSION,
    mode: "dsl",
    size: { width: 32, height: 32 },
    displayScale: 4,
    palette,
    dsl: {
      parts: [
        {
          id: "shadow",
          z: -1,
          shapes: [{ type: "rect", x: 8, y: 28, w: 16, h: 2, paletteIndex: 0 }]
        },
        {
          id: "body",
          z: 0,
          shapes: [{ type: "rect", x: 11, y: 16, w: 10, h: 11, paletteIndex: 2 }]
        },
        {
          id: "head",
          z: 1,
          shapes: [{ type: "circle", x: 16, y: 10, r: 6, paletteIndex: 1 }]
        },
        {
          id: "eyes",
          z: 2,
          shapes: [
            { type: "pixel", x: 14, y: 10, paletteIndex: 0 },
            { type: "pixel", x: 18, y: 10, paletteIndex: 0 }
          ]
        }
      ],
      animations: {
        idle: {
          fps: 4,
          loop: true,
          frames: [
            { duration: 6, transforms: [{ partId: "body", dy: 0 }] },
            { duration: 6, transforms: [{ partId: "body", dy: 1 }] }
          ]
        },
        "idle-blink": {
          fps: 6,
          loop: true,
          frames: [
            { duration: 8, transforms: [{ partId: "eyes", visible: true }] },
            { duration: 1, transforms: [{ partId: "eyes", visible: false }] }
          ]
        },
        talk: {
          fps: 8,
          loop: true,
          frames: [
            { duration: 3, transforms: [{ partId: "head", scale: 1.0 }] },
            { duration: 3, transforms: [{ partId: "head", scale: 1.04 }] }
          ]
        },
        "click-reaction": {
          fps: 10,
          loop: false,
          frames: [
            { duration: 2, transforms: [{ partId: "head", dy: -1 }] },
            { duration: 2, transforms: [{ partId: "head", dy: 0 }] }
          ]
        },
        "walk-left": {
          fps: 8,
          loop: true,
          frames: [
            { duration: 4, transforms: [{ partId: "body", dx: -1 }] },
            { duration: 4, transforms: [{ partId: "body", dx: 0 }] }
          ]
        },
        "walk-right": {
          fps: 8,
          loop: true,
          frames: [
            { duration: 4, transforms: [{ partId: "body", dx: 1 }] },
            { duration: 4, transforms: [{ partId: "body", dx: 0 }] }
          ]
        },
        drag: {
          fps: 6,
          loop: true,
          frames: [
            { duration: 5, transforms: [{ partId: "body", dy: -2 }] }
          ]
        },
        think: {
          fps: 4,
          loop: true,
          frames: [{ duration: 8, transforms: [{ partId: "head", dy: -1 }] }]
        },
        sleep: {
          fps: 2,
          loop: true,
          frames: [{ duration: 30, transforms: [{ partId: "head", dy: 1 }] }]
        }
      },
      stateMachine: {
        initial: "idle",
        states: {
          idle: {
            animation: "idle",
            transitions: [
              { on: "click", to: "click" },
              { on: "chatOpen", to: "talk" },
              { on: "dragStart", to: "drag" },
              { on: "screenLock", to: "sleep" }
            ]
          },
          walk: {
            animation: "walk-right",
            transitions: [{ on: "tick", to: "idle", guard: "arrived()" }]
          },
          click: {
            animation: "click-reaction",
            transitions: [{ on: "tick", to: "idle", guard: "frameDone()" }]
          },
          drag: {
            animation: "drag",
            transitions: [{ on: "dragEnd", to: "idle" }]
          },
          talk: {
            animation: "talk",
            transitions: [
              { on: "chatClose", to: "idle" },
              { on: "responseEnd", to: "idle" }
            ]
          },
          think: {
            animation: "think",
            transitions: [{ on: "responseStart", to: "talk" }]
          },
          sleep: {
            animation: "sleep",
            transitions: [{ on: "screenUnlock", to: "idle" }]
          }
        }
      }
    }
  };
}

export function makeSkeletonBundle(input: {
  id: string;
  name: string;
  sourceName?: string;
  sourceType: CharacterCard["meta"]["sourceType"];
  track: CharacterCard["meta"]["track"];
  now: number;
}): CharacterBundle {
  return {
    card: makeSkeletonCard(input),
    sprite: makeSkeletonSprite(input.track),
    runtime: defaultRuntimeConfig()
  };
}
