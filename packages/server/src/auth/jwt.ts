import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import { config } from '../config';

export interface AccessTokenPayload {
  userId: string;
  githubUsername: string;
  githubAvatarUrl?: string | null;
}

export interface RefreshTokenRecord {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export function issueAccessToken(
  payload: AccessTokenPayload,
  expiresIn: jwt.SignOptions['expiresIn'] = '1h',
) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn } as jwt.SignOptions);
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, config.jwtSecret);
}

export function issueRefreshToken() {
  return randomBytes(32).toString('hex');
}

export function hashRefreshToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function isTokenExpired(token: string) {
  try {
    verifyAccessToken(token);
    return false;
  } catch (error) {
    return error instanceof jwt.TokenExpiredError;
  }
}

export function signJwt(payload: object) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '1h' });
}

export function verifyJwt(token: string) {
  return verifyAccessToken(token);
}
