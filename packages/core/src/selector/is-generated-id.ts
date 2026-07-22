const GENERATED_ID_PATTERNS: readonly RegExp[] = [
  /^(mat|cdk|ng|mdc)-/i,
  /^:r[0-9a-z]+:$/i,
  /\d{4,}$/,
  /^[a-f0-9]{8,}$/i,
];

export const isGeneratedId = (id: string): boolean =>
  GENERATED_ID_PATTERNS.some((pattern) => pattern.test(id));
