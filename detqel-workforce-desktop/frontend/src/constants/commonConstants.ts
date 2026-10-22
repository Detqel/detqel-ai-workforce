export const APPLICATION_NAME = "DETQEL Kin";
export const APPLICATION_NAME_UPPERCASE = APPLICATION_NAME.toUpperCase();

export const ASSET_PATHS = {
  favicon: "/favicon.ico",
  logoLight: "/images/detqel-kin-logo.png",
  logoDark: "/images/detqel-kin-logo-dark.png",
  nameLogoLight: "/images/detqel-kin-name-logo.png",
  nameLogoDark: "/images/detqel-kin-name-logo-dark.png",
  workforceAgent: "/images/detqel-workforce-agent-logo.png",
  loginBanner: "/images/login-right-banner.png",
  agentSettingsBanner: "/images/detqel-vyra-settings-banner-left.png",
} as const;

export const THEME_STORAGE_KEY = "detqel_theme";
export const DARK_THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";
export const LIGHT_THEME_MEDIA_QUERY = "(prefers-color-scheme: light)";

export const THEME_BOOTSTRAP_SCRIPT = `
  try {
    const theme = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (theme === 'dark' || (!theme && window.matchMedia(${JSON.stringify(DARK_THEME_MEDIA_QUERY)}).matches)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (_) {}
`;

export const APPLICATION_METADATA = {
  title: "DETQEL - AI Operating System for Businesses",
  description:
    "Turn your business into an intelligent, adaptive and high-performing business. Create your business workspace, deploy AI agents, analyze, predict, simulate and automate — with full control.",
  icons: {
    icon: [
      { url: ASSET_PATHS.favicon },
      { url: ASSET_PATHS.logoLight, media: LIGHT_THEME_MEDIA_QUERY },
      { url: ASSET_PATHS.logoDark, media: DARK_THEME_MEDIA_QUERY },
    ],
  },
};
