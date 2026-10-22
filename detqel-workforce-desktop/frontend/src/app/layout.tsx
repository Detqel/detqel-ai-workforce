import { APPLICATION_METADATA, THEME_BOOTSTRAP_SCRIPT } from "@/constants/commonConstants";
import { DesktopGate } from "@/components/DesktopGate";
import type { Metadata } from "next";
import { Poppins, Rammetto_One } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const rammettoOne = Rammetto_One({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-rammetto",
  display: "swap",
});

export const metadata: Metadata = APPLICATION_METADATA;

import { WorkspaceProvider } from "@/context/WorkspaceContext";
import { ThemeProvider } from "@/context/ThemeContext";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${poppins.variable} ${rammettoOne.variable} h-full`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: THEME_BOOTSTRAP_SCRIPT,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col antialiased selection:bg-[#8a2be2] dark:selection:bg-[#FFA500] selection:text-white dark:selection:text-slate-950 bg-white dark:bg-[#0f172a] text-slate-900 dark:text-slate-100 transition-colors duration-200">
        <ThemeProvider>
          <DesktopGate><WorkspaceProvider>
            {children}
          </WorkspaceProvider></DesktopGate>
        </ThemeProvider>
      </body>
    </html>
  );
}

