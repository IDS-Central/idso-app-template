// AUTH TYPES: Session and user type definitions shared across the app.

/** Shape of the data stored in the encrypted session cookie. */
export interface SessionData {
  email: string;
  name: string | null;
  picture: string | null;
  hd: string | null;
  loggedInAt: number;
}

/** User info returned by /api/auth/me. */
export interface AuthUser {
  email: string;
}

/** Auth context value provided by AuthProvider. */
export interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
}

/** Result of requireAuth() — either a valid user or an error. */
export interface AuthResult {
  email: string;
  sub: string;
}

export interface AuthError {
  error: string;
}
