import '../user.type';

declare namespace Express {
  interface Request {
    user?: { id: string; roles?: string[];[key: string]: any };
    jwtDecoded?: { id: string;[key: string]: any };
  }
}