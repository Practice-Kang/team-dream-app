import {
  adminAuthConfigured,
  createAdminSessionCookie,
  credentialsMatch,
  type AuthEnv,
} from "./_shared";

interface LoginRequestBody {
  id?: string;
  password?: string;
}

export const onRequestPost: PagesFunction<AuthEnv> = async ({ env, request }) => {
  if (!adminAuthConfigured(env)) {
    return Response.json(
      {
        message: "운영자 계정 환경변수가 설정되지 않았습니다.",
      },
      { status: 503 },
    );
  }

  let body: LoginRequestBody;
  try {
    body = (await request.json()) as LoginRequestBody;
  } catch {
    return Response.json(
      {
        message: "로그인 요청 형식이 올바르지 않습니다.",
      },
      { status: 400 },
    );
  }

  if (!credentialsMatch(env, String(body.id || "").trim(), String(body.password || ""))) {
    return Response.json(
      {
        message: "운영자 ID 또는 비밀번호가 올바르지 않습니다.",
      },
      { status: 401 },
    );
  }

  return Response.json(
    {
      authenticated: true,
      role: "admin",
    },
    {
      headers: {
        "Set-Cookie": await createAdminSessionCookie(env),
      },
    },
  );
};
