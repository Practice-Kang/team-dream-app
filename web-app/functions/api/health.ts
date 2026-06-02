export const onRequestGet: PagesFunction = async () =>
  Response.json({
    ok: true,
    service: "team-dream-web-app",
  });
