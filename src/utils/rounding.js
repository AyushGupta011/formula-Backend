export function round2(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  const cleaned = Math.abs(Number(value.toPrecision(15)));
  const [mantissa, exp] = cleaned.toExponential().split('e');
  const shifted = Number(`${mantissa}e${Number(exp) + 2}`);
  const rounded = Math.round(shifted);
  const result = Number(`${rounded}e-2`) * sign;
  return result === 0 ? 0 : result; // avoid -0
}

export default { round2 };
