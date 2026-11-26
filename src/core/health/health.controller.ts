import { Controller, Get } from "@nestjs/common";
import { SchemaReadinessService } from "./schema-readiness.service";

@Controller("health")
export class HealthController {
  constructor(private readonly readiness: SchemaReadinessService) {}

  @Get()
  async health() {
    const schema = await this.readiness.check();
    return {
      ok: schema.ok,
      schema,
    };
  }

  @Get("schema")
  async schema() {
    return await this.readiness.check();
  }
}

