// The Chrome Web Store enforces length limits on a few manifest fields, and it enforces them at upload
// time: the API answers HTTP 200 with `uploadState: FAILURE` and an itemError. A publisher that does
// not read the body -- `wxt submit` did not -- reports a successful release for a package the store
// threw away. Three releases went out that way before anyone noticed, so the build refuses instead.
//
// Lengths are in characters, which is what the store counts.
interface StoreLimitedManifest {
  readonly name?: string;
  readonly short_name?: string;
  readonly description?: string;
}

const overLimit = (field: string, value: string | undefined, limit: number): string | null =>
  value !== undefined && value.length > limit
    ? `  ${field}: ${value.length} characters, limit ${limit}`
    : null;

export const withinStoreLimits = <T extends StoreLimitedManifest>(manifest: T): T => {
  const tooLong = [
    overLimit('name', manifest.name, 75),
    overLimit('short_name', manifest.short_name, 12),
    overLimit('description', manifest.description, 132),
  ].filter((line): line is string => line !== null);

  if (tooLong.length > 0) {
    throw new Error(
      `The Chrome Web Store would reject this manifest:\n${tooLong.join('\n')}\n` +
        'It answers 200 with uploadState FAILURE, so shorten these rather than trust a green release.',
    );
  }
  return manifest;
};
