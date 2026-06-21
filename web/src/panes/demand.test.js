import { describe, test, expect } from 'vitest';
import { bookedPct, demandRatio, hottestNights, inDemandCampgrounds, demandColor } from './demand';

describe('bookedPct', () => {
  test('reserved / total, including "other" in the denominator', () => {
    expect(bookedPct({ reserved: 9, total: 10 })).toBe(0.9);
  });
  test('0 when nothing captured', () => {
    expect(bookedPct({ reserved: 0, total: 0 })).toBe(0);
    expect(bookedPct()).toBe(0);
  });
});

describe('demandRatio', () => {
  test('reserved / (available + reserved), excluding "other"', () => {
    // 9 reserved of 10 bookable (1 open), even though total is 20 (10 "other").
    expect(demandRatio({ available: 1, reserved: 9, total: 20 })).toBe(0.9);
  });
  test('0 when no bookable inventory', () => {
    expect(demandRatio({ available: 0, reserved: 0, total: 5 })).toBe(0);
  });
});

describe('hottestNights', () => {
  const nights = [
    { night: '2026-06-05', reserved: 2 },
    { night: '2026-06-06', reserved: 10 },
    { night: '2026-06-07', reserved: 6 },
  ];
  test('ranks by reserved desc and caps to n', () => {
    expect(hottestNights(nights, 2).map((x) => x.night)).toEqual(['2026-06-06', '2026-06-07']);
  });
  test('does not mutate the input', () => {
    const copy = [...nights];
    hottestNights(nights);
    expect(nights).toEqual(copy);
  });
});

describe('inDemandCampgrounds', () => {
  const cgs = [
    { guid: 'a', available: 1, reserved: 9 },  // ratio 0.9
    { guid: 'b', available: 5, reserved: 5 },  // ratio 0.5
    { guid: 'c', available: 0, reserved: 0, total: 8 }, // no bookable → dropped
    { guid: 'd', available: 8, reserved: 2 },  // ratio 0.2
  ];
  test('ranks by ratio desc and drops campgrounds with no bookable inventory', () => {
    expect(inDemandCampgrounds(cgs).map((c) => c.guid)).toEqual(['a', 'b', 'd']);
  });
  test('caps to n', () => {
    expect(inDemandCampgrounds(cgs, 1).map((c) => c.guid)).toEqual(['a']);
  });
});

describe('demandColor', () => {
  test('hot → red, mid → amber, cold → green', () => {
    expect(demandColor(0.9)).toBe('#F85149');
    expect(demandColor(0.5)).toBe('#D29922');
    expect(demandColor(0.1)).toBe('#3FB950');
  });
});
