import type { Metadata } from "next";
export const metadata: Metadata = { robots: { index: false, follow: true, noarchive: true } };
export default function RegisterLayout({ children }: { children: React.ReactNode }) { return children; }
