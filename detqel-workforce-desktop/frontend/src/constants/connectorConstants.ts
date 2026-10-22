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
import type { ConnectorStatus } from "@/lib/api/connectors";

type CatalogIconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export const CATALOG_ICON_COMPONENTS = new Map<string, CatalogIconComponent>([
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

export const CONNECTOR_STATUS_STYLES: Record<ConnectorStatus, string> = {
  connected: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400",
  active: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  pending: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  disconnected: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  inactive: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  error: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
};

export const CONNECTION_FIELD_MAX_LENGTH = 255;
export const CONNECTION_TABLE_COLUMNS = ["Connector Name", "Type", "Status", "Data Stream", "Last Verified", "Actions"];
export const BOOLEAN_CONFIGURATION_OPTIONS = [{ value: "true", label: "Yes" }, { value: "false", label: "No" }];
export const CATALOG_ALL_CATEGORIES_OPTION = { value: "", label: "All categories" };
