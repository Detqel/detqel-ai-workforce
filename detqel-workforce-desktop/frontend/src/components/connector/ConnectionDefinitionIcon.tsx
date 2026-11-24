import { MongodbIcon, Postgresql } from "@dev.icons/react";
import { McpIcon } from "@dev.icons/react/mono";
import { FolderGit2, Globe } from "lucide-react";

export function ConnectionDefinitionIcon({ iconKey, className }: { iconKey: string; className?: string }) {
  switch (iconKey) {
    case "devicon:MongodbIcon": return <MongodbIcon className={className} aria-hidden />;
    case "devicon:Postgresql": return <Postgresql className={className} aria-hidden />;
    case "devicon:McpIcon": return <McpIcon className={className} aria-hidden />;
    case "lucide:Globe": return <Globe className={className} aria-hidden />;
    case "lucide:FolderGit2": return <FolderGit2 className={className} aria-hidden />;
    default: return null;
  }
}
