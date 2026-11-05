import { AppError } from "../../../shared/errors/app-error.js";
import type { IMissionRepository } from "../repositories/mission.repository.js";

/**
 * Rejects a mission id that belongs to another workspace. A missing and a foreign mission produce the same
 * answer, so the response does not reveal whether a mission exists elsewhere.
 */
export async function assertMissionInWorkspace(missions: Pick<IMissionRepository, "findById">, missionId: string | null | undefined, workspaceId: string): Promise<void> {
    if (!missionId) return;
    const mission = await missions.findById(missionId);
    if (!mission || mission.workspaceId !== workspaceId) throw new AppError(404, "Mission not found in this workspace");
}
