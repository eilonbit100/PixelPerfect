import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_shell/reports")({
  head: () => ({
    meta: [
      { title: "דוחות — Pulse" },
      { name: "description", content: "ספריית דוחות, הפקות אחרונות ודוחות שמורים — לפי הרשאות וסניף." },
      { property: "og:title", content: "דוחות — Pulse" },
      { property: "og:description", content: "ספריית דוחות, הפקות אחרונות ודוחות שמורים — לפי הרשאות וסניף." },
    ],
  }),
  component: () => <Outlet />,
});
