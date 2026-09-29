import { z } from 'zod';
export const TaskStatus = z.enum(['TODO','IN_PROGRESS','REVIEW','DONE']);
export const Priority = z.enum(['LOW','MEDIUM','HIGH','URGENT']);
export type TaskStatus = z.infer<typeof TaskStatus>;
export type Priority = z.infer<typeof Priority>;
export const createTaskSchema = z.object({title:z.string().trim().min(1).max(160),description:z.string().max(2000).optional(),status:TaskStatus.default('TODO'),priority:Priority.default('MEDIUM'),assigneeId:z.string().uuid().nullable().optional(),dueDate:z.string().datetime().nullable().optional()});
export const createWorkspaceSchema = z.object({name:z.string().trim().min(2).max(80)});
export const createProjectSchema = z.object({name:z.string().trim().min(2).max(120),description:z.string().max(500).optional()});
export interface User {id:string; name:string; email:string}
export interface Workspace {id:string; name:string; slug:string}
export interface Project {id:string; workspaceId:string; name:string; description?:string|null}
export interface Task {id:string; projectId:string; title:string; description?:string|null; status:TaskStatus; priority:Priority; assigneeId?:string|null; dueDate?:string|null; createdAt:string}
