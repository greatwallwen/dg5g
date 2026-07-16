import type { P1DemoContent, P1TaskId } from '../platform/p1-content.ts';
import type { SelfStudyCatalog } from '../textbook-scene/self-study-types.ts';
import { professionalOutputSchemaForTask } from './output-schema.ts';
import type { P1PortfolioDetailTaskDefinition } from './p1-portfolio-detail-model.ts';

export function parseP1PortfolioTaskId(value: string): P1TaskId | undefined {
  return value === 'P01' || value === 'P02' || value === 'P03' ? value : undefined;
}

export function buildP1PortfolioDetailDefinition(
  taskId: P1TaskId,
  content: P1DemoContent,
  catalog: SelfStudyCatalog,
): P1PortfolioDetailTaskDefinition {
  const task = content.tasks.find((candidate) => candidate.taskId === taskId);
  if (!task) throw new TypeError(`P1 task definition is unavailable: ${taskId}.`);
  const taskNumber = taskId === 'P01' ? 1 : taskId === 'P02' ? 2 : 3;
  return {
    taskId,
    taskTitle: task.title,
    outputTitle: task.taskOutputTitle,
    fieldDefinitions: professionalOutputSchemaForTask(catalog, taskId).fields.map(({ key, label }) => ({ key, label })),
    assessmentNodeId: `P1T${taskNumber}-N02`,
    outputNodeId: `P1T${taskNumber}-N04`,
  };
}
