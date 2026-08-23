import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPasswordValue, isLegacyBcryptHash } from '../server/passwords.ts';
import bcrypt from 'bcryptjs';

describe('passwords', () => {
    it('scrypt hash round-trips', () => {
        const hash = hashPassword('correct horse battery staple');
        assert.match(hash, /^scrypt\$16384\$/);
        assert.ok(verifyPasswordValue('correct horse battery staple', hash));
        assert.ok(!verifyPasswordValue('wrong password', hash));
    });

    it('produces unique salts for identical passwords', () => {
        const a = hashPassword('same-password');
        const b = hashPassword('same-password');
        assert.notEqual(a, b);
        assert.ok(verifyPasswordValue('same-password', a));
        assert.ok(verifyPasswordValue('same-password', b));
    });

    it('still verifies LEGACY bcrypt hashes (migration path)', () => {
        const legacy = bcrypt.hashSync('old-bcrypt-pass', 10);
        assert.ok(isLegacyBcryptHash(legacy));
        assert.ok(verifyPasswordValue('old-bcrypt-pass', legacy));
        assert.ok(!verifyPasswordValue('not-it', legacy));
    });

    it('rejects malformed stored hashes without throwing', () => {
        assert.equal(verifyPasswordValue('x', 'garbage'), false);
        assert.equal(verifyPasswordValue('x', ''), false);
        assert.equal(verifyPasswordValue('', 'scrypt$16384$ab$cd'), false);
    });
});
