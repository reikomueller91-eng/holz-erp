import argon2 from 'argon2';
import { randomBytes } from 'crypto';

const ARGON2_OPTIONS = {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
    hashLength: 32,
    raw: true,
};

async function test() {
    const masterPassword = "12345678912345";
    const salt = randomBytes(32);

    const verificationHash = await argon2.hash(masterPassword, {
        ...ARGON2_OPTIONS,
        raw: false,
        salt,
    });

    console.log("Hash:", verificationHash);

    const valid = await argon2.verify(verificationHash, masterPassword);
    console.log("Valid:", valid);
}

test().catch(console.error);
