import { expiredAdminSessionCookie } from "./_shared";

export const onRequestPost: PagesFunction = async () =>
  Response.json(
    {
      authenticated: false,
      role: "guest",
    },
    {
      headers: {
        "Set-Cookie": expiredAdminSessionCookie(),
      },
    },
  );
