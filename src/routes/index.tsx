import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pulse — מרכז הפעולה של המועדון" },
      { name: "description", content: "מה קורה, מה לא תקין ומה צריך לעשות עכשיו — לכל סניפי המועדון." },
      { property: "og:title", content: "Pulse — מרכז הפעולה של המועדון" },
      { property: "og:description", content: "מה קורה, מה לא תקין ומה צריך לעשות עכשיו — לכל סניפי המועדון." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
