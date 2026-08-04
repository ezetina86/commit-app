// Hodgdon & Beckett (1984) Navy Method, male formula, inputs in centimeters.
// Returns NaN when abdomen <= neck (log10 of non-positive is undefined).
// ponytail: explicit guard covers abdomen==neck (log10(0)=-Infinity, not NaN)
export function navyMethodBF(neck: number, abdomen: number, height: number): number {
  if (abdomen <= neck) return NaN;
  return 495 / (1.0324 - 0.19077 * Math.log10(abdomen - neck) + 0.15456 * Math.log10(height)) - 450;
}
