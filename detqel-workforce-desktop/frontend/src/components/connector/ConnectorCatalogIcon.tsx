import { CATALOG_ICON_COMPONENTS } from "@/constants/connectorConstants";

interface ConnectorCatalogIconProps {
  iconKey: string;
  className?: string;
}

export function ConnectorCatalogIcon({ iconKey, className }: ConnectorCatalogIconProps) {
  const Icon = CATALOG_ICON_COMPONENTS.get(iconKey);
  return Icon ? <Icon className={className} aria-hidden /> : null;
}
