"use client";

import React from "react";
import { BRAIN_CAPABILITIES, type BrainCapabilityId } from "@/constants/brainConstants";
import { AdminModal } from "./AdminModal";
import { ApprovalsModal } from "./ApprovalsModal";
import { CapabilityModal } from "./CapabilityModal";
import { DataLayerModal } from "./DataLayerModal";
import { LineageModal } from "./LineageModal";
import { OntologyModal } from "./OntologyModal";

/** A Business Brain panel to show: a toolbox item or the approval queue. */
export type BrainPanel =
  | { kind: BrainCapabilityId; datasetId?: string }
  | { kind: "approvals" };

interface BrainPanelHostProps {
  panel: BrainPanel | null;
  onOpen: (panel: BrainPanel) => void;
  onClose: () => void;
  /** Refreshes the page overview after a change made in a panel. */
  onDataChanged: () => void;
}

export const BrainPanelHost: React.FC<BrainPanelHostProps> = ({ panel, onOpen, onClose, onDataChanged }) => {
  if (!panel) return null;
  switch (panel.kind) {
    case "data-layer":
      return <DataLayerModal onClose={onClose} onDataChanged={onDataChanged} />;
    case "lineage":
      return <LineageModal initialDatasetId={panel.datasetId} onClose={onClose} onOpenDataLayer={() => onOpen({ kind: "data-layer" })} />;
    case "ontology":
      return <OntologyModal onClose={onClose} onOpenDataLayer={() => onOpen({ kind: "data-layer" })} />;
    case "admin":
      return <AdminModal onClose={onClose} onDataChanged={onDataChanged} />;
    case "approvals":
      return <ApprovalsModal onClose={onClose} onDataChanged={onDataChanged} />;
    default: {
      const capability = BRAIN_CAPABILITIES.find((item) => item.id === panel.kind);
      return capability ? <CapabilityModal capability={capability} onClose={onClose} /> : null;
    }
  }
};
