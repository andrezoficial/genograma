import { createFileRoute } from "@tanstack/react-router";
import { GenogramApp } from "@/components/genogram/app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <GenogramApp />;
}
