import jwt from 'jsonwebtoken';

export interface JWTPayload {
  userId: string;
  familyId: string;
  email: string;
  role: 'owner' | 'member';
}

const secret = process.env.JWT_SECRET ?? 'dev_secret_change_in_prod';
const expiresIn = (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'];

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, secret, { expiresIn });
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, secret) as JWTPayload;
}
