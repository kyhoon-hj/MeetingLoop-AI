import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  archiveProject,
  authenticateUser,
  closeDatabasePool,
  createDatabasePool,
  createMeeting,
  createProject,
  getProjectForOrganization,
  getSession,
  getWorkspace,
  registerOrganization,
  restoreProject,
  updateProject,
  type Session
} from "../../packages/db/src";

const databaseUrlConfigured = Boolean(process.env.DATABASE_URL);
const databaseSuite = describe.skipIf(!databaseUrlConfigured);
const cleanupPool = databaseUrlConfigured ? createDatabasePool() : null;
const suffix = `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
let primary: Session;
let secondary: Session;

databaseSuite("stage 3 database-backed authentication and base data", () => {
  beforeAll(async () => {
    primary = await registerOrganization({
      email: `stage3-owner-${suffix}@example.com`,
      password: "Stage3Password!",
      displayName: "3단계 관리자",
      organizationName: "3단계 검증 조직",
      organizationSlug: `stage3-primary-${suffix}`,
      timezone: "Asia/Seoul"
    });
    secondary = await registerOrganization({
      email: `stage3-other-${suffix}@example.com`,
      password: "Stage3Password!",
      displayName: "다른 조직 관리자",
      organizationName: "다른 검증 조직",
      organizationSlug: `stage3-secondary-${suffix}`,
      timezone: "Asia/Seoul"
    });
  });

  afterAll(async () => {
    if (cleanupPool && primary && secondary) {
      await cleanupPool.query(`DELETE FROM organizations WHERE id = ANY($1::text[])`, [
        [primary.organization.id, secondary.organization.id]
      ]);
      await cleanupPool.query(`DELETE FROM users WHERE id = ANY($1::text[])`, [
        [primary.user.id, secondary.user.id]
      ]);
      await cleanupPool.end();
    }
    await closeDatabasePool();
  });

  it("persists registration and authenticates from PostgreSQL", async () => {
    const authenticated = await authenticateUser(primary.user.email.toUpperCase(), "Stage3Password!");
    expect(authenticated?.user.id).toBe(primary.user.id);
    expect(authenticated?.membership.role).toBe("ORG_ADMIN");
    expect(await authenticateUser(primary.user.email, "wrong-password")).toBeNull();
  });

  it("rolls back the entire registration transaction on duplicate data", async () => {
    const rolledBackEmail = `stage3-rollback-${suffix}@example.com`;
    await expect(registerOrganization({
      email: rolledBackEmail,
      password: "Stage3Password!",
      displayName: "롤백 검증",
      organizationName: "중복 주소 조직",
      organizationSlug: primary.organization.slug,
      timezone: "Asia/Seoul"
    })).rejects.toThrow("ORGANIZATION_SLUG_ALREADY_EXISTS");

    const partialUser = await cleanupPool!.query(
      `SELECT count(*)::int AS count FROM users WHERE email = $1`,
      [rolledBackEmail]
    );
    expect(partialUser.rows[0]?.count).toBe(0);
  });

  it("persists project lifecycle and meeting base information", async () => {
    const project = await createProject(primary.user.id, {
      organizationId: primary.organization.id,
      name: "영속화 프로젝트",
      key: "PERSIST",
      description: "PostgreSQL 저장 검증"
    });
    const updated = await updateProject(primary.user.id, {
      organizationId: primary.organization.id,
      projectId: project.id,
      name: "영속화 프로젝트 수정",
      description: "수정 내용도 DB에 유지"
    });
    expect(updated.name).toBe("영속화 프로젝트 수정");

    expect((await archiveProject(primary.user.id, {
      organizationId: primary.organization.id,
      projectId: project.id
    })).status).toBe("ARCHIVED");
    expect((await restoreProject(primary.user.id, {
      organizationId: primary.organization.id,
      projectId: project.id
    })).status).toBe("ACTIVE");

    const bundle = await createMeeting(primary.user.id, {
      organizationId: primary.organization.id,
      projectId: project.id,
      title: "3단계 실제 저장 회의",
      meetingType: "GENERAL",
      participants: [{ displayName: "참석자", roleLabel: "검증", organizationLabel: "QA" }],
      agendas: [{ title: "영속화 확인", summary: "재조회 검증" }],
      consentConfirmed: true,
      fixtureFileName: "local-only.wav",
      fixtureMimeType: "audio/wav",
      fixtureSizeBytes: 1024
    });
    await closeDatabasePool();
    const workspace = await getWorkspace(primary.user.id, primary.organization.id);
    const stored = workspace?.meetings.find((item) => item.meeting.id === bundle.meeting.id);
    expect(stored?.meeting.title).toBe("3단계 실제 저장 회의");
    expect(stored?.participantCount).toBe(1);
    expect(stored?.agendaCount).toBe(1);
    expect(stored?.recording?.storagePolicy).toBe("LOCAL_ONLY");
  });

  it("does not expose another organization's project by id", async () => {
    const otherProject = await createProject(secondary.user.id, {
      organizationId: secondary.organization.id,
      name: "다른 조직 프로젝트",
      key: "OTHER",
      description: "tenant 격리"
    });
    expect(await getProjectForOrganization(primary.organization.id, otherProject.id)).toBeNull();
    await expect(updateProject(primary.user.id, {
      organizationId: primary.organization.id,
      projectId: otherProject.id,
      name: "침범 시도",
      description: "차단되어야 함"
    })).rejects.toThrow("PROJECT_NOT_FOUND");
  });

  it("rejects an existing session identity after membership is disabled", async () => {
    await cleanupPool!.query(
      `UPDATE memberships SET status = 'DISABLED' WHERE id = $1`,
      [primary.membership.id]
    );
    try {
      expect(await getSession(primary.user.id, primary.organization.id)).toBeNull();
      await expect(createProject(primary.user.id, {
        organizationId: primary.organization.id,
        name: "비활성 사용자 프로젝트",
        key: "DISABLED",
        description: "생성되면 안 됨"
      })).rejects.toThrow("MEMBERSHIP_INACTIVE");
    } finally {
      await cleanupPool!.query(
        `UPDATE memberships SET status = 'ACTIVE' WHERE id = $1`,
        [primary.membership.id]
      );
    }
  });

  it("uses the current database role instead of a role cached in a session token", async () => {
    await cleanupPool!.query(
      `UPDATE memberships SET role = 'VIEWER' WHERE id = $1`,
      [primary.membership.id]
    );
    try {
      const refreshed = await getSession(primary.user.id, primary.organization.id);
      expect(refreshed?.membership.role).toBe("VIEWER");
      await expect(createProject(primary.user.id, {
        organizationId: primary.organization.id,
        name: "이전 관리자 토큰 프로젝트",
        key: "STALE-ROLE",
        description: "DB 역할이 VIEWER이면 차단"
      })).rejects.toThrow("PROJECT_MANAGE_FORBIDDEN");
    } finally {
      await cleanupPool!.query(
        `UPDATE memberships SET role = 'ORG_ADMIN' WHERE id = $1`,
        [primary.membership.id]
      );
    }
  });
});
