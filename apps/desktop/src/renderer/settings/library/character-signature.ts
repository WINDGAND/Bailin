import {
  deriveQuoteStatus,
  effectiveQuoteOneLiner,
  pickProvisionalSignatureText,
  type QuoteStatus
} from "@bailin/character-protocol";

export interface CharacterSignatureInput {
  quoteOneLiner?: string;
  quoteStatus?: QuoteStatus;
  signatureVocabulary?: string[];
  selfIntro: string;
}

export interface CharacterSignatureResult {
  text: string;
  status: QuoteStatus;
  canRetry: boolean;
}

/**
 * 角色详情需要展示“个性签名”，它不等同于必须有外部证据的名人原话。
 * verified：展示已核验原话；provisional：人格顶上 + 可重试；missing：空态 + 可重试。
 * 骨架占位句（「我还没准备好。」）永不作为展示文案。
 */
export function resolveCharacterSignature(
  input: CharacterSignatureInput
): CharacterSignatureResult {
  const quote = effectiveQuoteOneLiner(input.quoteOneLiner);
  const status = deriveQuoteStatus({
    quoteOneLiner: quote,
    quoteStatus: input.quoteStatus,
    signatureVocabulary: input.signatureVocabulary,
    selfIntro: input.selfIntro
  });

  if (status === "verified" && quote) {
    return { text: quote, status: "verified", canRetry: false };
  }

  const provisional = pickProvisionalSignatureText({
    signatureVocabulary: input.signatureVocabulary,
    selfIntro: input.selfIntro
  });
  if (provisional) {
    return { text: provisional, status: "provisional", canRetry: true };
  }

  return { text: "", status: "missing", canRetry: true };
}
