import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import test from 'node:test';
import { hashPassword, verifyPassword } from './password.ts';

test('hashes passwords with a versioned random salt and verifies them', () => {
  const firstHash = hashPassword('correct horse battery staple');
  const secondHash = hashPassword('correct horse battery staple');

  assert.match(firstHash, /^scrypt\$v1\$16384\$8\$1\$32\$/);
  assert.notEqual(firstHash, secondHash);
  assert.equal(firstHash.includes('correct horse battery staple'), false);
  assert.equal(verifyPassword('correct horse battery staple', firstHash), true);
  assert.equal(verifyPassword('correct horse battery staple', secondHash), true);
  assert.equal(verifyPassword('wrong password', firstHash), false);
});

test('verifies a stored hash using its safely bounded encoded work parameters', () => {
  const salt = Buffer.alloc(16, 7);
  const derivedKey = scryptSync('parameterized-password', salt, 32, {
    N: 16_384,
    r: 8,
    p: 2,
    maxmem: 32 * 1024 * 1024,
  });
  const encodedHash = [
    'scrypt',
    'v1',
    '16384',
    '8',
    '2',
    '32',
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');

  assert.equal(verifyPassword('parameterized-password', encodedHash), true);
  assert.equal(verifyPassword('wrong-password', encodedHash), false);
});

test('fails closed before scrypt for malformed, unsupported, or unsafe parameters', () => {
  const validSalt = Buffer.alloc(16, 7).toString('base64url');
  const validDigest = Buffer.alloc(32, 9).toString('base64url');
  const malformedHashes = [
    '',
    'disabled-demo-hash',
    `scrypt$v2$16384$8$1$32$${validSalt}$${validDigest}`,
    `scrypt$v1$not-a-number$8$1$32$${validSalt}$${validDigest}`,
    `scrypt$v1$1073741824$8$1$32$${validSalt}$${validDigest}`,
    `scrypt$v1$20000$8$1$32$${validSalt}$${validDigest}`,
    `scrypt$v1$16384$1024$1$32$${validSalt}$${validDigest}`,
    `scrypt$v1$16384$8$999999$32$${validSalt}$${validDigest}`,
    `scrypt$v1$16384$8$1$999999$${validSalt}$${validDigest}`,
    `scrypt$v1$2$8$1$32$${validSalt}$${validDigest}`,
    `scrypt$v1$16384$8$1$32$not+base64url$${validDigest}`,
    `scrypt$v1$16384$8$1$32$${validSalt}$too-short`,
    `scrypt$v1$16384$8$1$32$${validSalt}$${validDigest}$extra`,
  ];

  for (const malformedHash of malformedHashes) {
    assert.equal(verifyPassword('password', malformedHash), false, malformedHash);
  }
});
