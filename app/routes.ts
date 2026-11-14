import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("poc/izakayas", "routes/poc.izakayas.tsx"),
  route("poc/auth", "routes/poc.auth.tsx"),
  route("poc/auth/session", "routes/poc.auth.session.ts"),
  route("poc/auth/logout", "routes/poc.auth.logout.ts"),
] satisfies RouteConfig;
