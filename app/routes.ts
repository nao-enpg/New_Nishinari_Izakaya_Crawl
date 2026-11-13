import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("poc/izakayas", "routes/poc.izakayas.tsx"),
] satisfies RouteConfig;
