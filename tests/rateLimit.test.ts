import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import { rateLimit } from '../server/rateLimit.ts';

interface FakeRes {
    statusCode: number;
    headers: Record<string, string>;
    body?: unknown;
    status(code: number): FakeRes;
    setHeader(name: string, value: string): FakeRes;
    json(payload: unknown): FakeRes;
}

function fakeRes(): FakeRes {
    const res: FakeRes = {
        statusCode: 200,
        headers: {},
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
        json(payload) { this.body = payload; return this; },
    };
    return res;
}

function fakeReq(ip: string): Request {
    return { ip } as unknown as Request;
}

describe('rateLimit', () => {
    let nextCalls: number;
    const next: NextFunction = () => { nextCalls += 1; };

    beforeEach(() => { nextCalls = 0; });

    it('allows up to max requests then returns 429 with Retry-After', () => {
        const middleware = rateLimit({ windowMs: 60_000, max: 3 });

        for (let i = 0; i < 3; i++) {
            middleware(fakeReq('1.2.3.4'), fakeRes() as unknown as Response, next);
            assert.equal(nextCalls, i + 1);
        }

        const blocked = fakeRes();
        middleware(fakeReq('1.2.3.4'), blocked as unknown as Response, next);
        assert.equal(nextCalls, 3); // next never called on the blocked attempt
        assert.equal(blocked.statusCode, 429);
        assert.ok(Number(blocked.headers['retry-after']) >= 1);
        assert.match((blocked.body as { error: string }).error, /too many/i);
    });

    it('tracks keys independently', () => {
        const middleware = rateLimit({ windowMs: 60_000, max: 1 });
        middleware(fakeReq('a'), fakeRes() as unknown as Response, next);
        middleware(fakeReq('b'), fakeRes() as unknown as Response, next);
        assert.equal(nextCalls, 2);

        const secondA = fakeRes();
        middleware(fakeReq('a'), secondA as unknown as Response, next);
        assert.equal(secondA.statusCode, 429);
    });

    it('honours a custom key extractor', () => {
        const middleware = rateLimit({
            windowMs: 60_000,
            max: 1,
            keyExtractor: req => `${req.ip}:${(req as unknown as { headers: Record<string, string> }).headers['x-user']}`,
        });
        const r1 = { ...fakeReq('same-ip'), headers: { 'x-user': 'u1' } };
        const r2 = { ...fakeReq('same-ip'), headers: { 'x-user': 'u2' } };
        middleware(r1 as unknown as Request, fakeRes() as unknown as Response, next);
        middleware(r2 as unknown as Request, fakeRes() as unknown as Response, next);
        assert.equal(nextCalls, 2);
    });
});
