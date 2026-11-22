import { createFileRoute } from "@tanstack/react-router";

import { TacticalBoard } from "@/components/board/TacticalBoard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pizarra táctica de futsal — Alineaciones y jugadas" },
      {
        name: "description",
        content:
          "Crea alineaciones de futsal: coloca jugadores con nombre y dorsal, balones y flechas de pase, desmarque y conducción.",
      },
      { property: "og:title", content: "Pizarra táctica de futsal" },
      {
        property: "og:description",
        content: "Diseña alineaciones y jugadas de futsal sobre un campo interactivo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <TacticalBoard />;
}
