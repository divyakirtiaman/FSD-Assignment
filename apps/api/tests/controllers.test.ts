import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { ProjectModel } from '../src/models/project.js';
import { TaskModel } from '../src/models/task.js';
import { UserModel } from '../src/models/user.js';
import { updateTask } from '../src/controllers/task-controller.js';
import { dashboard } from '../src/controllers/dashboard-controller.js';

const MONGO_TEST_URI = 'mongodb://localhost:27017/bugforge_test';

const mockResponse = () => {
  const res: any = {};
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data: any) => {
    res.body = data;
    return res;
  };
  return res;
};

describe('API Controllers Integration', () => {
  let user: any;
  let project: any;
  let task: any;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_TEST_URI);
    }
    // Clean database before run
    await UserModel.deleteMany({});
    await ProjectModel.deleteMany({});
    await TaskModel.deleteMany({});

    user = await UserModel.create({
      name: 'Test User',
      email: 'test@example.com',
      passwordHash: 'dummyhash',
      role: 'member',
    });

    project = await ProjectModel.create({
      name: 'Test Project',
      key: 'TEST',
      owner: user._id,
      members: [user._id],
    });

    task = await TaskModel.create({
      title: 'Initial Task',
      description: 'Initial Task Description',
      status: 'todo',
      priority: 'medium',
      project: project._id,
      createdBy: user._id,
    });
  });

  afterAll(async () => {
    await UserModel.deleteMany({});
    await ProjectModel.deleteMany({});
    await TaskModel.deleteMany({});
    await mongoose.disconnect();
  });

  describe('updateTask', () => {
    it('successfully updates valid fields and filters out illegal fields', async () => {
      const req: any = {
        params: { taskId: task._id.toString() },
        body: {
          title: 'Updated Task Title',
          status: 'in_progress',
          project: new mongoose.Types.ObjectId().toString(), // Attempting to hijack project
        },
        user: { id: user._id.toString(), role: 'member' },
      };
      const res = mockResponse();

      await updateTask(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Updated Task Title');
      expect(res.body.data.status).toBe('in_progress');

      // The project field should NOT be updated because Zod strips it out
      const updatedTask = await TaskModel.findById(task._id);
      expect(updatedTask?.project.toString()).toBe(project._id.toString());
    });

    it('rejects invalid enum values for status', async () => {
      const req: any = {
        params: { taskId: task._id.toString() },
        body: { status: 'invalid_status' },
        user: { id: user._id.toString(), role: 'member' },
      };
      const res = mockResponse();

      await expect(updateTask(req, res)).rejects.toThrow();
    });
  });

  describe('dashboard', () => {
    it('retrieves statistics and correct completed task counts', async () => {
      // Create a completed task in the project
      await TaskModel.create({
        title: 'Completed Task',
        status: 'done',
        project: project._id,
        createdBy: user._id,
      });

      const req: any = {
        user: { id: user._id.toString(), role: 'member' },
      };
      const res = mockResponse();

      await dashboard(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.statistics.projects).toBe(1);
      expect(res.body.data.statistics.completedTasks).toBe(1);
    });
  });
});
