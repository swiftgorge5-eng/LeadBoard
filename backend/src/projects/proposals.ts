import type { ProjectProposalRequest } from "@leadboard/contracts";
import { getDbPool } from "../db/index.js";

export interface ProjectProposalApi {
  submit(input: ProjectProposalRequest): Promise<{ submitted: true; id: number }>;
}

export class ProjectProposalService implements ProjectProposalApi {
  async submit(input: ProjectProposalRequest): Promise<{ submitted: true; id: number }> {
    const result = await getDbPool().query<{ id: number }>(
      `INSERT INTO project_proposals (project_url, lab_name, notes)
       VALUES ($1,$2,$3)
       RETURNING id::int`,
      [input.projectUrl, input.labName, input.notes],
    );
    return { submitted: true, id: result.rows[0]!.id };
  }
}
