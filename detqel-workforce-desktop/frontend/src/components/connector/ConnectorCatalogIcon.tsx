import type { ComponentType } from "react";
import {
  Aws,
  Cassandra,
  DockerIcon,
  GoogleCloud,
  GoogleDrive,
  MicrosoftAzure,
  MicrosoftIcon,
  MicrosoftOnedrive,
  MicrosoftTeams,
  MongodbIcon,
  MysqlIcon,
  Postgresql,
} from "@dev.icons/react";
import { GithubIcon, McpIcon } from "@dev.icons/react/mono";
import { CodeXml, Database, File, Folder, Globe, Monitor, Server, Webhook } from "lucide-react";

type CatalogIconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

const catalogIcons = new Map<string, CatalogIconComponent>([
  ["devicon:Aws", Aws],
  ["devicon:Cassandra", Cassandra],
  ["devicon:DockerIcon", DockerIcon],
  ["devicon:GithubIcon", GithubIcon],
  ["devicon:GoogleCloud", GoogleCloud],
  ["devicon:GoogleDrive", GoogleDrive],
  ["devicon:McpIcon", McpIcon],
  ["devicon:MicrosoftAzure", MicrosoftAzure],
  ["devicon:MicrosoftIcon", MicrosoftIcon],
  ["devicon:MicrosoftOnedrive", MicrosoftOnedrive],
  ["devicon:MicrosoftTeams", MicrosoftTeams],
  ["devicon:MongodbIcon", MongodbIcon],
  ["devicon:MysqlIcon", MysqlIcon],
  ["devicon:Postgresql", Postgresql],
  ["lucide:CodeXml", CodeXml],
  ["lucide:Database", Database],
  ["lucide:File", File],
  ["lucide:Folder", Folder],
  ["lucide:Globe", Globe],
  ["lucide:Monitor", Monitor],
  ["lucide:Server", Server],
  ["lucide:Webhook", Webhook],
]);

interface ConnectorCatalogIconProps {
  iconKey: string;
  className?: string;
}

export function ConnectorCatalogIcon({ iconKey, className }: ConnectorCatalogIconProps) {
  const Icon = catalogIcons.get(iconKey);
  return Icon ? <Icon className={className} aria-hidden /> : null;
}
