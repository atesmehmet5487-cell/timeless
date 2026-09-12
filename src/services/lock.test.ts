import { describe, expect, it } from 'vitest';
import { hashPin, isValidPinShape, verifyPin } from './lock';

describe('PIN biçimi', () => {
  it('4 haneli sayıyı kabul eder', () => {
    expect(isValidPinShape('1234')).toBe(true);
    expect(isValidPinShape('0000')).toBe(true);
  });

  it('eksik, fazla ve harf içereni reddeder', () => {
    expect(isValidPinShape('123')).toBe(false);
    expect(isValidPinShape('12345')).toBe(false);
    expect(isValidPinShape('12a4')).toBe(false);
    expect(isValidPinShape('')).toBe(false);
  });
});

describe('PIN doğrulama', () => {
  it('özet düz metni içermez', async () => {
    const hash = await hashPin('1234');
    expect(hash).not.toContain('1234');
    expect(hash).toHaveLength(64);
  });

  it('aynı PIN aynı özeti verir', async () => {
    expect(await hashPin('4321')).toBe(await hashPin('4321'));
  });

  it('farklı PIN farklı özet verir', async () => {
    expect(await hashPin('1234')).not.toBe(await hashPin('1235'));
  });

  it('doğru PIN geçer, yanlış PIN geçmez', async () => {
    const hash = await hashPin('9182');
    expect(await verifyPin('9182', hash)).toBe(true);
    expect(await verifyPin('9183', hash)).toBe(false);
  });

  it('PIN kurulmamışsa her giriş geçerlidir', async () => {
    expect(await verifyPin('0000', undefined)).toBe(true);
  });
});
