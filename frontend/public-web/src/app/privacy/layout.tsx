import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacidade · NZT",
  description: "Como o NZT trata os dados pessoais de participantes e equipes de eventos.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
