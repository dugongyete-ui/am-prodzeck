import type { Metadata } from "next";

// Privacy: this route is intentionally NOT advertised anywhere on the public
// site. We also tell crawlers to not index it.
export const metadata: Metadata = {
  title: "Admin · Token",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function TokenLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
