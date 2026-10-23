import { round2 } from '../src/utils/rounding.js';

describe('round2', () => {
  test('removes floating point noise', () => expect(round2(0.1 + 0.2)).toBe(0.3));
  test('rounds half away from zero', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(-1.005)).toBe(-1.01);
  });
  test('keeps exact values and avoids -0', () => {
    expect(round2(36)).toBe(36);
    expect(round2(-0.0001)).toBe(0);
    expect(Object.is(round2(-0.0001), -0)).toBe(false);
  });
  test('tiny and large numbers', () => {
    expect(round2(1e-7)).toBe(0);
    expect(round2(1234567.891)).toBe(1234567.89);
  });
  test('non-numbers pass through', () => expect(round2(null)).toBe(null));
});
