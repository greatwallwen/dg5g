export const FORMAL_ASSESSMENT_BODY_MAX_BYTES = 64 * 1_024;
export const FORMAL_ASSESSMENT_DRAFT_MAX_BYTES = 32 * 1_024;
export const FORMAL_ASSESSMENT_DRAFT_MAX_STRING_LENGTH = 2_000;
export const FORMAL_ASSESSMENT_DRAFT_MAX_ARRAY_LENGTH = 64;

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function assertAssessmentDraftSerializedSize(serialized: string): void {
  if (utf8ByteLength(serialized) > FORMAL_ASSESSMENT_DRAFT_MAX_BYTES) {
    throw new TypeError('Assessment draft exceeds the maximum serialized size.');
  }
}
