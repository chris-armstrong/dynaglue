/**
 * @private
 * Increment the last character to one character lexigraphically higher. It
 * might not be a valid Unicode character, but that shouldn't matter as we're
 * only using them for range expressions.
 * 
 * NOTE: I'm not sure if this is 100% correct as Unicode codepoints can go
 * up to 0x11000, but working on the boundary condition of 0x10FFF isn't
 * a valid codepoint so JavaScript falls back to code-unit behaviour. For
 * DynamoDB purposes, this may need to be done as a straight Buffer man-
 * ipulation.
 *
 * @param x  the string to increment the last character of
 * @returns the transformed string
 */
export const incrementLast = (x: string): string => {
  if (x.length === 0) {
    return '\u0000';
  }
  const prefix = x.slice(0, x.length - 1);
  const lastCodePoint = x[x.length - 1].codePointAt(0) ?? 0;
  if (lastCodePoint >= 0xffff ) {
    return incrementLast(prefix) + String.fromCodePoint(0);
  } else {
    return prefix + String.fromCodePoint(lastCodePoint + 1);
  }
};
/**
 * @private
 * Decrement the last character to one character lexigraphically lower. It
 * might not be a valid Unicode character, but that shouldn't matter as we're
 * only using them for range expressions
 * 
 * NOTE: I'm not sure if this is 100% correct as Unicode codepoints can go
 * up to 0x11000, but working on the boundary condition of 0x10FFF isn't
 * a valid codepoint, so JavaScript falls back to code-unit behaviour. For
 * DynamoDB purposes, this may need to be done as a straight Buffer man-
 * ipulation.
 *
 * @param x  the string to increment the last character of
 * @returns the transformed string
 */
export const decrementLast = (x: string): string => {
  if (x.length === 0) {
    return ''; // This isn't really right but there is nothing lower than the empty string
  }
  const prefix = x.slice(0, x.length - 1);
  const lastCodePoint = x[x.length - 1].codePointAt(0) ?? 0;
  if (lastCodePoint === 0) {
    return decrementLast(prefix) + String.fromCodePoint(0xFFFF);
  } else {
    return prefix + String.fromCodePoint(lastCodePoint - 1);
  }
};
