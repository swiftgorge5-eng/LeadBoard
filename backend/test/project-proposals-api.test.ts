import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createApiRouter } from "../src/api/router.js";

function createRouter(projectProposals: { submit: ReturnType<typeof vi.fn> }) {
  return createApiRouter({
    analytics: {
      async getGroups() { return []; },
      async getOrganizationActivitySummary(range) {
        return { range, repositories: 0, contributors: 0, commits: 0, prs: 0, issues: 0, total: 0 };
      },
      async getRepositoryStats() { return []; },
      async getContributorLeaderboard() { return []; },
      async getContributorDetail() { return null; },
    },
    async getSyncStatus() {
      return {
        lastSuccessfulRunAt: null,
        lastRunStatus: null,
        nextScheduledRunAt: null,
        dataStatus: "missing" as const,
      };
    },
    projectProposals,
  });
}

describe("project proposal HTTP API", () => {
  it("accepts a complete project proposal", async () => {
    const projectProposals = {
      submit: vi.fn().mockResolvedValue({ submitted: true as const, id: 7 }),
    };
    const app = createApp({ apiRouter: createRouter(projectProposals) });

    const response = await request(app)
      .post("/api/v1/project-proposals")
      .send({
        projectUrl: "https://github.com/FudanLab/example",
        labName: "复旦大学示例实验室",
        notes: "这是一个由实验室长期维护的开源项目，实验室主页也有项目介绍。",
      })
      .expect(201);

    expect(response.body).toEqual({ submitted: true, id: 7 });
    expect(projectProposals.submit).toHaveBeenCalledWith({
      projectUrl: "https://github.com/FudanLab/example",
      labName: "复旦大学示例实验室",
      notes: "这是一个由实验室长期维护的开源项目，实验室主页也有项目介绍。",
    });
  });

  it("rejects incomplete or malformed proposals", async () => {
    const projectProposals = {
      submit: vi.fn().mockResolvedValue({ submitted: true as const, id: 7 }),
    };
    const app = createApp({ apiRouter: createRouter(projectProposals) });

    const response = await request(app)
      .post("/api/v1/project-proposals")
      .send({ projectUrl: "not-a-url", labName: "实验室", notes: "太短" })
      .expect(400);

    expect(response.body.error.code).toBe("INVALID_PROJECT_PROPOSAL");
    expect(projectProposals.submit).not.toHaveBeenCalled();
  });
});
