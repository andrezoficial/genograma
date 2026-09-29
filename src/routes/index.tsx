import { createFileRoute } from "@tanstack/react-router";
import { GenogramApp } from "@/components/genogram/app";
import { SITE_URL } from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: () => ({ links: [{ rel: "canonical", href: `${SITE_URL}/` }] }),
  component: Home,
});

function Home() {
  return <GenogramApp />;
}
