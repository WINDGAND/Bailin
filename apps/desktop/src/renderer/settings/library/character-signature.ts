export interface CharacterSignatureInput {
  quoteOneLiner?: string;
  signatureVocabulary?: string[];
  selfIntro: string;
}

/**
 * 角色详情需要展示“个性签名”，它不等同于必须有外部证据的名人原话。
 * 有已核验代表性原话时优先展示；否则使用人格卡里的标志性表达，最后才回退自我介绍。
 */
export function resolveCharacterSignature(input: CharacterSignatureInput): string {
  const candidates = [
    input.quoteOneLiner,
    ...(input.signatureVocabulary ?? []),
    input.selfIntro
  ];
  return candidates.find((value) => value?.trim())?.trim() ?? "";
}
