export interface AttemptIdCrypto {
  randomUUID?: () => string;
  getRandomValues?: (values: Uint32Array) => Uint32Array;
}

export function createAttemptId(cryptoApi: AttemptIdCrypto | undefined = globalThis.crypto as AttemptIdCrypto | undefined): string {
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();

  const values = new Uint32Array(4);
  if (typeof cryptoApi?.getRandomValues === 'function') {
    cryptoApi.getRandomValues(values);
  } else {
    for (let index = 0; index < values.length; index += 1) values[index] = Math.floor(Math.random() * 0x1_0000_0000);
  }
  return `attempt-${Array.from(values, (value) => value.toString(16).padStart(8, '0')).join('')}`;
}
