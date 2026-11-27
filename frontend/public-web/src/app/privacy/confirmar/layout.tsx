import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Confirmar privacidade · NZT",
  description: "Confirmação do aceite da política de privacidade do NZT.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
