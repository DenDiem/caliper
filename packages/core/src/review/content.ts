const MIN_SUBSTANTIVE_LENGTH = 2;
const LETTER_PATTERN = /\p{L}/u;

// A review answer or design comment counts as substantive only when it is at least a couple of
// characters long AND contains a letter. Filler like "1", "421", or a stray digit is caught trivially;
// the client warns before submitting so a review does not end with content-less marks (§3.6).
export const isSubstantiveText = (text: string): boolean => {
  const trimmed = text.trim();
  return trimmed.length >= MIN_SUBSTANTIVE_LENGTH && LETTER_PATTERN.test(trimmed);
};
