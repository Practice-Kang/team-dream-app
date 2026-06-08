import { type AuthEnv, verifyAdminRequest } from "./_shared";

export const onRequestGet: PagesFunction<AuthEnv> = async ({ env, request }) => {
  const authenticated = await verifyAdminRequest(request, env);

  return Response.json({
    authenticated,
    role: authenticated ? "admin" : "guest",
  });
};
