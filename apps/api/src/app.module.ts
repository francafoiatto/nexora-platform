import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ActivitiesModule } from './activities/activities.module';
import { AuthModule } from './auth/auth.module';
import { RequestLoggerMiddleware } from './common/logging/request-logger.middleware';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.service';
import { ProjectsModule } from './projects/projects.module';
import { RealtimeModule } from './realtime/realtime.module';
import { TasksModule } from './tasks/tasks.module';
import { AccessModule } from './workspaces/access.service';
import { WorkspacesModule } from './workspaces/workspaces.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    AccessModule,
    ActivitiesModule,
    RealtimeModule,
    HealthModule,
    WorkspacesModule,
    ProjectsModule,
    TasksModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
