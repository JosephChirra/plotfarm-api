/** Conversion factors — all to square feet */
const SQ_FT_PER_UNIT: Record<string, number> = {
  sq_ft: 1,
  sq_yards: 9,
  acres: 43_560,
  hectares: 107_639.1,
  cents: 435.6,
  gunta: 1_089,
  ankanam: 72,
};

/** 1 gunta = 1/40 acre in square feet (South India standard) */
const SQ_FT_PER_GUNTA = 43_560 / 40; // 1089

/**
 * Convert a land area input to square feet.
 *
 * @param landArea  Primary area value (acres, hectares, sq_yards, sq_ft, cents, gunta, ankanam)
 * @param landUnit  Unit string matching SQ_FT_PER_UNIT keys
 * @param guntas    Optional sub-acre guntas (only relevant when landUnit === 'acres')
 * @returns         Area in square feet, rounded to 2 decimal places
 */
export function toSqFt(
  landArea: number,
  landUnit: string,
  guntas?: number,
): number {
  const factor = SQ_FT_PER_UNIT[landUnit] ?? 1;
  const primarySqFt = landArea * factor;
  const guntasSqFt =
    landUnit === 'acres' && guntas != null && guntas > 0
      ? guntas * SQ_FT_PER_GUNTA
      : 0;
  return Math.round((primarySqFt + guntasSqFt) * 100) / 100;
}
