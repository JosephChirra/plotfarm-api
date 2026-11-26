const NON_DIGITS = /\D/g;

function countryDigits(defaultCountryCode: string) {
  return defaultCountryCode.replace(NON_DIGITS, '');
}

export function normalizePhoneNumber(raw: string, defaultCountryCode = '+91') {
  const digits = raw.trim().replace(NON_DIGITS, '');
  const cc = countryDigits(defaultCountryCode);

  if (digits.length === 10) return digits;
  if (cc && digits.startsWith(cc) && digits.length === cc.length + 10) {
    return digits.slice(cc.length);
  }
  return digits;
}

export function buildPhoneLookupCandidates(raw: string, defaultCountryCode = '+91') {
  const digits = raw.trim().replace(NON_DIGITS, '');
  const normalized = normalizePhoneNumber(raw, defaultCountryCode);
  const cc = countryDigits(defaultCountryCode);

  return Array.from(
    new Set(
      [normalized, digits, cc ? `${cc}${normalized}` : null]
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

export function toE164Phone(raw: string, defaultCountryCode = '+91') {
  const digits = raw.trim().replace(NON_DIGITS, '');
  const cc = countryDigits(defaultCountryCode);

  if (raw.trim().startsWith('+')) {
    return `+${digits}`;
  }
  if (digits.length === 10 && cc) {
    return `+${cc}${digits}`;
  }
  return `+${digits}`;
}
