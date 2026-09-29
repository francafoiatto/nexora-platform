-- DropIndex
DROP INDEX "Workspace_slug_idx";

-- CreateIndex
CREATE INDEX "Activity_actorId_idx" ON "Activity"("actorId");

-- CreateIndex
CREATE INDEX "Task_createdById_idx" ON "Task"("createdById");

