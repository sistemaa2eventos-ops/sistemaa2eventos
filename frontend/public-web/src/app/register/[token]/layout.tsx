import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cadastro de participante · NZT",
  description: "Cadastro de participantes de empresa para o evento, por convite.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
