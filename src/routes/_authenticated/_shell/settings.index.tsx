import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_shell/settings/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/organization" });
  },
});
