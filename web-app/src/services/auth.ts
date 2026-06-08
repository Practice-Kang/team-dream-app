const AUTH_ME_PATH = "/api/auth/me";
const AUTH_LOGIN_PATH = "/api/auth/login";
const AUTH_LOGOUT_PATH = "/api/auth/logout";

export interface AuthResponse {
  authenticated: boolean;
  role: "admin" | "guest";
  message?: string;
}

export interface LoginCredentials {
  id: string;
  password: string;
}

export async function fetchAuthSession(): Promise<AuthResponse> {
  const response = await fetch(AUTH_ME_PATH, {
    credentials: "include",
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    return {
      authenticated: false,
      role: "guest",
    };
  }

  return (await response.json()) as AuthResponse;
}

export async function loginAdmin(credentials: LoginCredentials): Promise<AuthResponse> {
  const response = await fetch(AUTH_LOGIN_PATH, {
    method: "POST",
    credentials: "include",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(credentials),
  });
  const data = (await response.json()) as AuthResponse;

  if (!response.ok) {
    throw new Error(data.message || "운영자 로그인에 실패했습니다.");
  }

  return data;
}

export async function logoutAdmin(): Promise<AuthResponse> {
  const response = await fetch(AUTH_LOGOUT_PATH, {
    method: "POST",
    credentials: "include",
    headers: {
      accept: "application/json",
    },
  });

  return response.ok ? ((await response.json()) as AuthResponse) : { authenticated: false, role: "guest" };
}
